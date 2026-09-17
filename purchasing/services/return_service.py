"""
purchasing/services/return_service.py

Authoritative Purchase Return, Inventory Stock Reversal & Vendor Credit Note service
for Zorvex ERP 2.0 (Security Industry Phase S-3F).

Handles:
- Tenant-aware Purchase Return documents and line validations
- Partial returns and over-return prevention
- Safe inventory Stock OUT reversals via Universal Inventory
- Serial-tracked item return state management
- Rejected-at-GRN non-inventory accounting credit
- Vendor Credit Note / Debit Adjustments with non-negative payable balance guarantees
- Paid-bill handling (unallocated credit tracking)
- Strict state machine lifecycle and idempotency guards
"""

from decimal import Decimal
from datetime import date
from django.db import models, transaction
from django.utils import timezone
from django.core.exceptions import ValidationError

from inventory.models import Item, ItemSerial
from inventory.services.transaction_service import process_transaction
from inventory.services.exceptions import InventoryValidationException, SerialException
from platform_core.models import Warehouse
from purchasing.models import (
    Vendor,
    ProcurementDocument,
    ProcurementLine,
    ProcurementAuditTrail,
    PurchaseReturn,
    PurchaseReturnLine,
    VendorCreditNote
)
from purchasing.services.payment_service import get_invoice_payment_summary, sync_invoice_payment_status


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_line_previously_returned_qty(grn_line: ProcurementLine) -> Decimal:
    """
    Returns the total quantity already returned for a GRN line across all
    POSTED and active (non-cancelled) Purchase Return lines.
    """
    qs = PurchaseReturnLine.objects.filter(
        grn_line=grn_line,
        purchase_return__status__in=['APPROVED', 'POSTED', 'PENDING_APPROVAL', 'DRAFT'],
        is_rejected_at_grn=False
    )
    total = qs.aggregate(tot=models.Sum('return_quantity'))['tot']
    return Decimal(str(total or 0)).quantize(Decimal('0.0001'))


def get_returnable_grn_lines(grn: ProcurementDocument) -> list:
    """
    Returns a structured list of lines on a Goods Receipt with available returnable quantities.
    """
    if grn.document_type != 'GOODS_RECEIPT':
        raise ValidationError("Document must be a GOODS_RECEIPT.")
    if grn.status not in ['POSTED', 'RECEIVED']:
        raise ValidationError(f"GRN {grn.number} is in status '{grn.status}'. Only POSTED/RECEIVED GRNs can be returned.")

    lines_data = []
    for line in grn.lines.select_related('item').all():
        accepted = Decimal(str(line.accepted_quantity if line.accepted_quantity is not None else line.quantity or 0))
        rejected = Decimal(str(line.rejected_quantity or 0))
        
        # Calculate previously returned accepted quantity
        prev_returned = PurchaseReturnLine.objects.filter(
            grn_line=line,
            purchase_return__status__in=['POSTED', 'APPROVED', 'PENDING_APPROVAL'],
            is_rejected_at_grn=False
        ).aggregate(tot=models.Sum('return_quantity'))['tot']
        prev_returned = Decimal(str(prev_returned or 0))
        
        returnable_accepted = max(Decimal('0.0000'), accepted - prev_returned)
        
        # Available serial numbers currently in stock for this GRN line
        available_serials = []
        if line.item.track_serial_number and grn.warehouse:
            grn_serials = line.custom_fields.get('serial_numbers', [])
            if grn_serials:
                in_stock_serials = ItemSerial.objects.filter(
                    company=grn.company,
                    item=line.item,
                    warehouse=grn.warehouse,
                    serial_number__in=grn_serials,
                    status__in=['IN_STOCK', 'DEFECTIVE']
                ).values_list('serial_number', flat=True)
                available_serials = list(in_stock_serials)

        lines_data.append({
            'grn_line_id': str(line.id),
            'item_id': str(line.item.id),
            'item_name': line.item.name,
            'item_code': getattr(line.item, 'code', line.item.sku if hasattr(line.item, 'sku') else ''),
            'unit_of_measure': line.unit_of_measure or line.item.unit_of_measure,
            'track_serial_number': line.item.track_serial_number,
            'received_accepted_qty': float(accepted),
            'received_rejected_qty': float(rejected),
            'previously_returned_qty': float(prev_returned),
            'returnable_qty': float(returnable_accepted),
            'unit_cost': float(line.unit_price or line.item.cost_price or 0),
            'available_serials': available_serials,
            'description': line.description or line.item.name,
        })
    return lines_data


# ---------------------------------------------------------------------------
# Return Creation & Lifecycle
# ---------------------------------------------------------------------------

@transaction.atomic
def create_purchase_return(
    company_id,
    vendor_id,
    warehouse_id,
    return_date,
    reason='DEFECTIVE',
    lines_data=None,
    purchase_order_id=None,
    goods_receipt_id=None,
    vendor_invoice_id=None,
    notes='',
    user=None,
    auto_approve=False
) -> PurchaseReturn:
    """
    Creates a new PurchaseReturn document in DRAFT status with validated line quantities.
    """
    if not lines_data:
        raise ValidationError("Purchase Return must contain at least one return line item.")

    vendor = Vendor.objects.get(id=vendor_id, company_id=company_id)
    warehouse = Warehouse.objects.get(id=warehouse_id, company_id=company_id)

    po = None
    if purchase_order_id:
        po = ProcurementDocument.objects.get(
            id=purchase_order_id,
            company_id=company_id,
            document_type='PURCHASE_ORDER'
        )

    grn = None
    if goods_receipt_id:
        grn = ProcurementDocument.objects.get(
            id=goods_receipt_id,
            company_id=company_id,
            document_type='GOODS_RECEIPT'
        )
        if grn.status not in ['POSTED', 'RECEIVED']:
            raise ValidationError(f"Source GRN {grn.number} is '{grn.status}'. Only POSTED or RECEIVED GRNs can be returned.")
        if grn.vendor_id != vendor.id:
            raise ValidationError("GRN vendor does not match the return vendor.")
        if not po and grn.parent_document_id:
            po = grn.parent_document

    invoice = None
    if vendor_invoice_id:
        invoice = ProcurementDocument.objects.get(
            id=vendor_invoice_id,
            company_id=company_id,
            document_type='VENDOR_INVOICE'
        )
        if invoice.vendor_id != vendor.id:
            raise ValidationError("Vendor invoice does not match the return vendor.")

    # Create Return Header
    return_obj = PurchaseReturn(
        company_id=company_id,
        vendor=vendor,
        crm_entity=vendor.crm_entity,
        purchase_order=po,
        goods_receipt=grn,
        vendor_invoice=invoice,
        warehouse=warehouse,
        return_date=return_date or date.today(),
        reason=reason,
        status='DRAFT',
        currency=getattr(vendor, 'currency', 'PKR') or 'PKR',
        notes=notes.strip() if notes else '',
        created_by=user
    )
    return_obj.save()

    total_amount = Decimal('0.00')

    # Process and validate lines
    for idx, ld in enumerate(lines_data, start=1):
        item_id = ld.get('item_id')
        item = Item.objects.get(id=item_id, company_id=company_id)
        
        return_qty = Decimal(str(ld.get('return_quantity', 0))).quantize(Decimal('0.0001'))
        if return_qty <= Decimal('0.0000'):
            continue

        unit_cost = Decimal(str(ld.get('unit_cost', 0))).quantize(Decimal('0.01'))
        if unit_cost <= Decimal('0.00'):
            unit_cost = Decimal(str(item.cost_price or 0)).quantize(Decimal('0.01'))

        grn_line_id = ld.get('grn_line_id')
        grn_line = None
        is_rejected_at_grn = bool(ld.get('is_rejected_at_grn', False))
        
        received_qty = Decimal('0.0000')
        prev_returned = Decimal('0.0000')

        if grn_line_id:
            grn_line = ProcurementLine.objects.get(id=grn_line_id, company_id=company_id)
            if grn and grn_line.document_id != grn.id:
                raise ValidationError(f"GRN line {grn_line.id} does not belong to GRN {grn.number}.")
            
            if is_rejected_at_grn:
                received_qty = Decimal(str(grn_line.rejected_quantity or 0))
                if return_qty > received_qty:
                    raise ValidationError(
                        f"Cannot return {return_qty} for rejected line on {item.name}. "
                        f"Maximum rejected quantity is {received_qty}."
                    )
            else:
                received_qty = Decimal(str(grn_line.accepted_quantity if grn_line.accepted_quantity is not None else grn_line.quantity or 0))
                
                # Check previously returned quantity
                prev_returned = PurchaseReturnLine.objects.filter(
                    grn_line=grn_line,
                    purchase_return__status__in=['POSTED', 'APPROVED', 'PENDING_APPROVAL'],
                    is_rejected_at_grn=False
                ).aggregate(tot=models.Sum('return_quantity'))['tot']
                prev_returned = Decimal(str(prev_returned or 0)).quantize(Decimal('0.0001'))
                
                max_returnable = max(Decimal('0.0000'), received_qty - prev_returned)
                if return_qty > max_returnable:
                    raise ValidationError(
                        f"Over-return blocked for item '{item.name}'. "
                        f"Accepted Qty: {received_qty}, Previously Returned: {prev_returned}, "
                        f"Available: {max_returnable}, Requested: {return_qty}."
                    )

        # Serial Number Validations
        serials = ld.get('serial_numbers', []) or []
        if item.track_serial_number and not is_rejected_at_grn and return_qty > 0:
            if len(serials) != int(return_qty):
                raise ValidationError(
                    f"Item '{item.name}' requires exact serial tracking. "
                    f"Expected {int(return_qty)} serial(s), provided {len(serials)}."
                )
            
            # Check duplicates in payload
            if len(set(serials)) != len(serials):
                raise ValidationError(f"Duplicate serial numbers submitted for return of item '{item.name}'.")

            # Check that serials belong to tenant, warehouse, and are in stock
            existing_serials = ItemSerial.objects.filter(
                company_id=company_id,
                item=item,
                warehouse=warehouse,
                serial_number__in=serials,
                status__in=['IN_STOCK', 'DEFECTIVE']
            ).values_list('serial_number', flat=True)
            
            missing_serials = set(serials) - set(existing_serials)
            if missing_serials:
                raise ValidationError(
                    f"Serial number(s) not found in stock at warehouse '{warehouse.name}': {', '.join(missing_serials)}"
                )

        line_total = (return_qty * unit_cost).quantize(Decimal('0.01'))
        total_amount += line_total

        PurchaseReturnLine.objects.create(
            company_id=company_id,
            purchase_return=return_obj,
            grn_line=grn_line,
            item=item,
            description=ld.get('description') or grn_line.description if grn_line else item.name,
            received_quantity=received_qty,
            previously_returned_quantity=prev_returned,
            return_quantity=return_qty,
            unit_cost=unit_cost,
            total_amount=line_total,
            reason=ld.get('reason') or reason,
            serial_numbers=serials,
            is_rejected_at_grn=is_rejected_at_grn,
            line_number=idx,
            notes=ld.get('notes', '').strip()
        )

    return_obj.total_return_amount = total_amount
    return_obj.save(update_fields=['total_return_amount', 'updated_at'])

    if auto_approve:
        return_obj.status = 'APPROVED'
        return_obj.approved_by = user
        return_obj.approved_at = timezone.now()
        return_obj.save(update_fields=['status', 'approved_by', 'approved_at', 'updated_at'])

    ProcurementAuditTrail.objects.create(
        company_id=company_id,
        document=grn or po or invoice,
        user=user,
        event='RETURN_CREATED',
        details=f"Purchase Return {return_obj.return_number} created for Vendor {vendor.name} (Amount: PKR {total_amount})."
    )

    return return_obj


@transaction.atomic
def submit_purchase_return(return_obj: PurchaseReturn, user=None) -> PurchaseReturn:
    """Submits a DRAFT return for approval."""
    if return_obj.status != 'DRAFT':
        raise ValidationError(f"Purchase return {return_obj.return_number} is in status '{return_obj.status}' (must be DRAFT).")
    return_obj.status = 'PENDING_APPROVAL'
    return_obj.save(update_fields=['status', 'updated_at'])
    return return_obj


@transaction.atomic
def approve_purchase_return(return_obj: PurchaseReturn, user=None) -> PurchaseReturn:
    """Approves a PENDING_APPROVAL or DRAFT purchase return."""
    if return_obj.status not in ['DRAFT', 'PENDING_APPROVAL']:
        raise ValidationError(f"Cannot approve return {return_obj.return_number} in status '{return_obj.status}'.")
    return_obj.status = 'APPROVED'
    return_obj.approved_by = user
    return_obj.approved_at = timezone.now()
    return_obj.save(update_fields=['status', 'approved_by', 'approved_at', 'updated_at'])
    return return_obj


@transaction.atomic
def cancel_purchase_return(return_obj: PurchaseReturn, user=None, reason='') -> PurchaseReturn:
    """Cancels a non-posted purchase return without mutating inventory or ledger."""
    if return_obj.status == 'POSTED':
        raise ValidationError(f"Cannot cancel Purchase Return {return_obj.return_number} because it has already been POSTED.")
    if return_obj.status == 'CANCELLED':
        return return_obj

    return_obj.status = 'CANCELLED'
    return_obj.cancelled_by = user
    return_obj.cancelled_at = timezone.now()
    return_obj.rejection_reason = reason.strip() if reason else ''
    return_obj.save(update_fields=['status', 'cancelled_by', 'cancelled_at', 'rejection_reason', 'updated_at'])
    return return_obj


# ---------------------------------------------------------------------------
# Post Purchase Return: Inventory Reversal & Vendor Credit Note
# ---------------------------------------------------------------------------

@transaction.atomic
def post_purchase_return(return_obj: PurchaseReturn, user=None) -> tuple[PurchaseReturn, VendorCreditNote]:
    """
    Authoritative posting engine for Purchase Returns.
    
    1. Idempotency Guard: Blocks re-posting or cancelled returns.
    2. Concurrency Lock: select_for_update on return_obj and lines.
    3. Inventory Reversal: Executes Universal Inventory Stock OUT via process_transaction
       ONLY for accepted items (is_rejected_at_grn == False).
    4. Serial-tracked equipment: Transitions serial records to RETURNED state.
    5. Financial Credit: Generates VendorCreditNote and offsets linked Vendor Invoice
       outstanding balance without producing negative liabilities.
    """
    return_obj = PurchaseReturn.objects.select_for_update().get(pk=return_obj.pk)

    if return_obj.status == 'POSTED':
        raise ValidationError(f"Purchase Return {return_obj.return_number} has already been posted. Cannot post again.")
    if return_obj.status == 'CANCELLED':
        raise ValidationError(f"Purchase Return {return_obj.return_number} is cancelled and cannot be posted.")
    if return_obj.status not in ['APPROVED', 'DRAFT', 'PENDING_APPROVAL']:
        raise ValidationError(f"Purchase Return {return_obj.return_number} cannot be posted in status '{return_obj.status}'.")

    company = return_obj.company
    warehouse = return_obj.warehouse
    vendor = return_obj.vendor
    lines = list(return_obj.lines.select_for_update().select_related('item').all())

    if not lines:
        raise ValidationError("Cannot post a purchase return with no lines.")

    # 1. Inventory Stock OUT Reversal
    for line in lines:
        if line.return_quantity > Decimal('0.0000') and not line.is_rejected_at_grn:
            if line.item.track_inventory:
                try:
                    process_transaction(
                        company=company,
                        item=line.item,
                        warehouse=warehouse,
                        movement_type='PURCHASE_RETURN',
                        quantity=line.return_quantity,
                        reference=return_obj.return_number,
                        user=user,
                        notes=f"Purchase Return {return_obj.return_number} to Vendor {vendor.name} ({line.reason or return_obj.reason})",
                        serial_numbers=line.serial_numbers if (line.item.track_serial_number and line.serial_numbers) else None
                    )
                except (InventoryValidationException, SerialException) as e:
                    raise ValidationError(f"Inventory transaction failed for item '{line.item.name}': {str(e)}")

        # Update cached returned_quantity on GRN line
        if line.grn_line and not line.is_rejected_at_grn:
            grn_l = line.grn_line
            tot_ret = PurchaseReturnLine.objects.filter(
                grn_line=grn_l,
                purchase_return__status='POSTED',
                is_rejected_at_grn=False
            ).exclude(pk=line.pk).aggregate(tot=models.Sum('return_quantity'))['tot']
            tot_ret = (Decimal(str(tot_ret or 0)) + line.return_quantity).quantize(Decimal('0.0001'))
            ProcurementLine.objects.filter(pk=grn_l.pk).update(returned_quantity=tot_ret)

    # 2. Vendor Credit Note & AP Settlement
    credit_amount = Decimal(str(return_obj.total_return_amount or 0)).quantize(Decimal('0.01'))
    allocated_amt = Decimal('0.00')
    unallocated_amt = credit_amount

    invoice = return_obj.vendor_invoice

    if invoice:
        # Check current outstanding payable on the invoice
        inv_summary = get_invoice_payment_summary(invoice)
        current_outstanding = Decimal(str(inv_summary['outstanding_amount'])).quantize(Decimal('0.01'))

        if current_outstanding > Decimal('0.00'):
            if credit_amount <= current_outstanding:
                allocated_amt = credit_amount
                unallocated_amt = Decimal('0.00')
            else:
                allocated_amt = current_outstanding
                unallocated_amt = (credit_amount - current_outstanding).quantize(Decimal('0.01'))

    # Create VendorCreditNote record
    credit_note = VendorCreditNote.objects.create(
        company=company,
        vendor=vendor,
        purchase_return=return_obj,
        vendor_invoice=invoice,
        credit_date=return_obj.return_date or date.today(),
        amount=credit_amount,
        allocated_amount=allocated_amt,
        unallocated_amount=unallocated_amt,
        status='POSTED',
        currency=return_obj.currency,
        notes=f"Credit adjustment for Purchase Return {return_obj.return_number}" + (f" against Invoice {invoice.number}" if invoice else ""),
        created_by=user
    )

    # Sync invoice payment status if invoice was linked
    if invoice:
        sync_invoice_payment_status(invoice)

    # Mark Return as POSTED
    return_obj.status = 'POSTED'
    return_obj.posted_by = user
    return_obj.posted_at = timezone.now()
    return_obj.save(update_fields=['status', 'posted_by', 'posted_at', 'updated_at'])

    ProcurementAuditTrail.objects.create(
        company=company,
        document=invoice or return_obj.goods_receipt or return_obj.purchase_order,
        user=user,
        event='RETURN_POSTED',
        details=f"Purchase Return {return_obj.return_number} POSTED. Credit Note {credit_note.credit_note_number} generated (Allocated: PKR {allocated_amt}, Unallocated Credit: PKR {unallocated_amt})."
    )

    return return_obj, credit_note


# ---------------------------------------------------------------------------
# Reporting & Aggregations
# ---------------------------------------------------------------------------

def get_vendor_returns_summary(vendor_id, company_id) -> dict:
    """
    Returns aggregated returns and credit note metrics for a Vendor.
    """
    returns_qs = PurchaseReturn.objects.filter(company_id=company_id, vendor_id=vendor_id)
    posted_returns = returns_qs.filter(status='POSTED')
    
    total_returns_amount = posted_returns.aggregate(tot=models.Sum('total_return_amount'))['tot'] or Decimal('0.00')
    
    cn_qs = VendorCreditNote.objects.filter(company_id=company_id, vendor_id=vendor_id, status='POSTED')
    total_credit_notes_amount = cn_qs.aggregate(tot=models.Sum('amount'))['tot'] or Decimal('0.00')
    total_allocated_credits = cn_qs.aggregate(tot=models.Sum('allocated_amount'))['tot'] or Decimal('0.00')
    total_unallocated_credits = cn_qs.aggregate(tot=models.Sum('unallocated_amount'))['tot'] or Decimal('0.00')
    
    return {
        'total_returns_count': returns_qs.count(),
        'posted_returns_count': posted_returns.count(),
        'total_returns_amount': Decimal(str(total_returns_amount)).quantize(Decimal('0.01')),
        'total_credit_notes_amount': Decimal(str(total_credit_notes_amount)).quantize(Decimal('0.01')),
        'total_allocated_credits': Decimal(str(total_allocated_credits)).quantize(Decimal('0.01')),
        'unallocated_vendor_credit': Decimal(str(total_unallocated_credits)).quantize(Decimal('0.01')),
    }
