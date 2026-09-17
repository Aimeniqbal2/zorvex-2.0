"""
purchasing/services/goods_receipt_service.py

Authoritative Goods Receipt service for Zorvex ERP 2.0.
Replaces the unsafe ProcurementDocument.save() inventory side-effect.

All inventory mutations go through this service exclusively.
"""
import uuid
from decimal import Decimal
from datetime import date
from django.db import transaction
from django.core.exceptions import ValidationError


from inventory.services.transaction_service import process_transaction
from inventory.services.exceptions import InventoryValidationException, SerialException
from purchasing.models import ProcurementDocument, ProcurementLine, ProcurementAuditTrail


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

RECEIVABLE_PO_STATUSES = {'APPROVED', 'SENT', 'PARTIALLY_RECEIVED'}
GRN_POSTED_STATUSES = {'POSTED', 'RECEIVED'}
GRN_DRAFT_STATUS = 'DRAFT'


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _get_po_line_received(po_line):
    """Return total accepted quantity for a PO line from posted GRN lines."""
    from django.db.models import Sum, Q
    
    # Query all posted GRN lines related to this PO line
    qs = ProcurementLine.objects.filter(
        document__document_type='GOODS_RECEIPT',
        document__parent_document=po_line.document,
        document__status__in=GRN_POSTED_STATUSES,
    ).filter(
        Q(parent_line=po_line) |
        Q(custom_fields__po_line_id=str(po_line.pk)) |
        (Q(parent_line__isnull=True) & Q(item=po_line.item))
    )
    
    # Sum accepted_quantity first; if 0/None and quantity exists, fallback to quantity
    accepted_total = qs.aggregate(total=Sum('accepted_quantity'))['total']
    if accepted_total is not None and accepted_total > 0:
        return Decimal(str(accepted_total))
        
    qty_total = qs.aggregate(total=Sum('quantity'))['total']
    return Decimal(str(qty_total)) if qty_total else Decimal('0')


def _update_po_status_from_receipts(po, user=None):
    """
    Recalculate and set PO status based on current posted GRN receipts.
    Must be called inside an atomic block.
    """
    po_lines = list(po.lines.select_for_update().all())
    if not po_lines:
        return

    all_received = True
    any_received = False

    for po_line in po_lines:
        received = _get_po_line_received(po_line)
        # Update cached received_quantity on PO line
        ProcurementLine.objects.filter(pk=po_line.pk).update(received_quantity=received)
        po_line.received_quantity = received
        if received >= po_line.quantity:
            any_received = True
        else:
            all_received = False
            if received > 0:
                any_received = True

    if all_received:
        new_status = 'RECEIVED'
    elif any_received:
        new_status = 'PARTIALLY_RECEIVED'
    else:
        new_status = po.status  # Maintain current (APPROVED or SENT)

    if po.status != new_status:
        ProcurementDocument.objects.filter(pk=po.pk).update(status=new_status)
        po.status = new_status
        ProcurementAuditTrail.objects.create(
            company=po.company,
            document=po,
            user=user,
            event='STATUS_CHANGE',
            details=f"PO status automatically updated to {new_status} based on inventory receipts."
        )

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

@transaction.atomic
def create_goods_receipt(po, grn_data, user):
    """
    Create a DRAFT Goods Receipt document from an approved/sent Purchase Order.

    grn_data = {
        'warehouse': <Warehouse instance>,
        'document_date': date,
        'reference_number': str (delivery reference / challan),
        'notes': str (optional),
        'lines': [
            {
                'po_line_id': <UUID of PO ProcurementLine>,
                'item_id': <UUID of Item> (optional, defaults to po_line.item),
                'quantity': Decimal (total received now = accepted + rejected),
                'accepted_quantity': Decimal (accepted usable stock),
                'rejected_quantity': Decimal (optional, damaged/rejected),
                'rejection_reason': str (optional),
                'notes': str (optional),
                'serial_numbers': [str, ...] (optional, for accepted items),
            },
            ...
        ]
    }

    Returns: GRN ProcurementDocument (DRAFT)
    """
    if po.document_type != 'PURCHASE_ORDER':
        raise ValidationError("Source document must be a Purchase Order.")
    if po.status not in RECEIVABLE_PO_STATUSES:
        raise ValidationError(
            f"Purchase Order must be APPROVED, SENT or PARTIALLY_RECEIVED to receive goods. "
            f"Current status: {po.status}"
        )
    if po.company_id != user.company_id:
        raise ValidationError("Cannot create GRN for a Purchase Order from a different company.")

    warehouse = grn_data.get('warehouse')
    if not warehouse:
        raise ValidationError("Warehouse is required.")
    if warehouse.company_id != po.company_id:
        raise ValidationError("Warehouse belongs to a different company.")

    lines_data = grn_data.get('lines', [])
    if not lines_data:
        raise ValidationError("At least one receipt line is required.")

    # Lock PO lines to prevent race conditions during drafting
    po_lines_map = {str(pl.pk): pl for pl in po.lines.select_for_update().all()}

    validated_lines = []
    for line in lines_data:
        po_line_id = str(line.get('po_line_id', ''))
        po_line = po_lines_map.get(po_line_id)
        if not po_line:
            raise ValidationError(f"PO line {po_line_id} does not exist on this Purchase Order.")

        item = po_line.item
        if not item:
            raise ValidationError(f"PO line {po_line_id} has no item assigned.")
        if item.company_id != po.company_id:
            raise ValidationError(f"Item {item.name} belongs to a different company.")

        # Compute accepted vs rejected
        raw_qty = Decimal(str(line.get('quantity', 0)))
        raw_accepted = Decimal(str(line.get('accepted_quantity', raw_qty if 'accepted_quantity' not in line else 0)))
        raw_rejected = Decimal(str(line.get('rejected_quantity', 0)))

        if 'accepted_quantity' in line and 'rejected_quantity' in line:
            accepted_qty = raw_accepted
            rejected_qty = raw_rejected
            tot_qty = accepted_qty + rejected_qty
        elif 'accepted_quantity' in line:
            accepted_qty = raw_accepted
            rejected_qty = max(Decimal('0'), raw_qty - accepted_qty) if raw_qty > accepted_qty else Decimal('0')
            tot_qty = accepted_qty + rejected_qty
        else:
            tot_qty = raw_qty
            accepted_qty = raw_qty
            rejected_qty = Decimal('0')

        if tot_qty <= Decimal('0'):
            raise ValidationError(f"Receiving quantity for item {item.name} must be greater than zero.")
        if accepted_qty < Decimal('0') or rejected_qty < Decimal('0'):
            raise ValidationError("Accepted and rejected quantities cannot be negative.")

        already_received = _get_po_line_received(po_line)
        remaining = po_line.quantity - already_received

        if tot_qty > remaining:
            raise ValidationError(
                f"Cannot receive {tot_qty} of {item.name}. "
                f"Ordered: {po_line.quantity}, Already received: {already_received}, "
                f"Remaining: {remaining}."
            )

        serial_numbers = line.get('serial_numbers', []) or []
        if item.track_serial_number and accepted_qty > 0:
            if len(serial_numbers) != int(accepted_qty):
                raise ValidationError(
                    f"Item {item.name} requires serial tracking. "
                    f"Expected {int(accepted_qty)} serial number(s) for accepted quantity, got {len(serial_numbers)}."
                )
            # Check for duplicate serials within this receipt
            seen = set()
            for sn in serial_numbers:
                if sn in seen:
                    raise ValidationError(f"Duplicate serial number in receipt: {sn}")
                seen.add(sn)
            # Check for existing serials in tenant
            from inventory.models import ItemSerial
            existing = ItemSerial.objects.filter(
                company=po.company,
                serial_number__in=serial_numbers
            ).values_list('serial_number', flat=True)
            if existing:
                raise ValidationError(
                    f"Serial number(s) already exist in this company: {', '.join(existing)}"
                )

        validated_lines.append({
            'po_line': po_line,
            'item': item,
            'vendor_item': po_line.vendor_item,
            'vendor_sku': po_line.vendor_sku,
            'quantity': tot_qty,
            'accepted_quantity': accepted_qty,
            'rejected_quantity': rejected_qty,
            'rejection_reason': line.get('rejection_reason', ''),
            'notes': line.get('notes', ''),
            'serial_numbers': serial_numbers,
        })

    # Create the GRN header (number will be auto-generated as GRN-0001 per tenant)
    grn = ProcurementDocument.objects.create(
        company=po.company,
        document_type='GOODS_RECEIPT',
        status=GRN_DRAFT_STATUS,
        document_date=grn_data.get('document_date') or date.today(),



        reference_number=grn_data.get('reference_number', ''),
        notes=grn_data.get('notes', ''),
        warehouse=warehouse,
        vendor=po.vendor,
        crm_entity=po.crm_entity,
        parent_document=po,
        created_by=user,
    )

    # Create GRN lines
    for idx, vl in enumerate(validated_lines, start=1):
        ProcurementLine.objects.create(
            company=po.company,
            document=grn,
            parent_line=vl['po_line'],
            item=vl['item'],
            vendor_item=vl['vendor_item'],
            vendor_sku=vl['vendor_sku'],
            quantity=vl['quantity'],
            accepted_quantity=vl['accepted_quantity'],
            rejected_quantity=vl['rejected_quantity'],
            rejection_reason=vl['rejection_reason'],
            notes=vl['notes'],
            unit_price=vl['po_line'].unit_price,
            total_amount=(vl['accepted_quantity'] * vl['po_line'].unit_price).quantize(Decimal('0.01')),
            line_number=idx,
            description=vl['po_line'].description,
            custom_fields={
                'po_line_id': str(vl['po_line'].pk),
                'serial_numbers': vl['serial_numbers'],
            },
        )

    ProcurementAuditTrail.objects.create(
        company=po.company,
        document=grn,
        user=user,
        event='CREATED',
        details=f"GRN {grn.number} created as DRAFT from PO {po.number}."
    )

    return grn


@transaction.atomic
def post_goods_receipt(grn, user):
    """
    Post (confirm) a DRAFT Goods Receipt, triggering inventory transactions.

    Idempotency: Once posted (status=POSTED or RECEIVED), re-posting raises ValidationError.
    Concurrency: Uses select_for_update on GRN and PO lines.
    """
    # Re-fetch with lock
    grn = ProcurementDocument.objects.select_for_update().get(pk=grn.pk)

    if grn.document_type != 'GOODS_RECEIPT':
        raise ValidationError("Document is not a Goods Receipt.")
    if grn.status in GRN_POSTED_STATUSES:
        raise ValidationError(f"GRN {grn.number} has already been posted. Cannot post again.")
    if grn.status == 'CANCELLED':
        raise ValidationError(f"GRN {grn.number} is cancelled and cannot be posted.")
    if grn.status != GRN_DRAFT_STATUS:
        raise ValidationError(f"GRN {grn.number} cannot be posted in status: {grn.status}")
    if not grn.parent_document:
        raise ValidationError("GRN must be linked to a Purchase Order.")

    po = ProcurementDocument.objects.select_for_update().get(pk=grn.parent_document_id)

    if po.status not in RECEIVABLE_PO_STATUSES:
        raise ValidationError(
            f"Source Purchase Order {po.number} must be APPROVED, SENT or PARTIALLY_RECEIVED. "
            f"Current status: {po.status}"
        )

    warehouse = grn.warehouse
    if not warehouse:
        raise ValidationError("GRN must have a warehouse assigned.")
    if warehouse.company_id != grn.company_id:
        raise ValidationError("Warehouse belongs to a different company.")

    grn_lines = list(grn.lines.select_related('item').all())
    if not grn_lines:
        raise ValidationError("Cannot post a GRN with no lines.")

    # Re-validate quantities (concurrency protection)
    po_lines_map = {str(pl.pk): pl for pl in po.lines.select_for_update().all()}

    for grn_line in grn_lines:
        po_line_id = str(grn_line.parent_line_id or grn_line.custom_fields.get('po_line_id') or '')
        po_line = po_lines_map.get(po_line_id)
        if not po_line:
            raise ValidationError(
                f"GRN line for item {grn_line.item.name} has no valid PO line reference."
            )
        already_received = _get_po_line_received(po_line)
        remaining = po_line.quantity - already_received
        if grn_line.quantity > remaining:
            raise ValidationError(
                f"Concurrent receipt conflict for {grn_line.item.name}. "
                f"Remaining: {remaining}, trying to receive: {grn_line.quantity}. "
                f"Refresh and retry."
            )

    # Mark GRN as posted FIRST to prevent race conditions
    ProcurementDocument.objects.filter(pk=grn.pk).update(status='POSTED')
    grn.status = 'POSTED'

    # Process inventory transactions: Only accepted_quantity enters stock!
    for grn_line in grn_lines:
        accepted_qty = grn_line.accepted_quantity if grn_line.accepted_quantity is not None else grn_line.quantity
        if accepted_qty > 0 and grn_line.item.track_inventory:
            serial_numbers = grn_line.custom_fields.get('serial_numbers', [])
            try:
                process_transaction(
                    company=grn.company,
                    item=grn_line.item,
                    warehouse=warehouse,
                    movement_type='PURCHASE',
                    quantity=accepted_qty,
                    reference=grn.number,
                    user=user,
                    notes=f"Goods Receipt {grn.number} from PO {po.number} (Accepted: {accepted_qty}, Rejected: {grn_line.rejected_quantity})",
                    serial_numbers=serial_numbers if (grn_line.item.track_serial_number and serial_numbers) else None,
                )
            except (InventoryValidationException, SerialException) as e:
                # Rollback will occur due to atomic block
                raise ValidationError(f"Inventory transaction failed: {str(e)}")

    # Update PO status and received quantities
    _update_po_status_from_receipts(po, user=user)

    ProcurementAuditTrail.objects.create(
        company=grn.company,
        document=grn,
        user=user,
        event='POSTED',
        details=f"GRN {grn.number} posted successfully. Usable inventory updated by accepted quantities."
    )

    return grn


@transaction.atomic
def cancel_goods_receipt(grn, user):
    """
    Cancel a DRAFT Goods Receipt.
    POSTED receipts cannot be deleted or casually cancelled without a formal reversal/return.
    """
    grn = ProcurementDocument.objects.select_for_update().get(pk=grn.pk)
    if grn.status != GRN_DRAFT_STATUS:
        raise ValidationError(
            f"Only DRAFT Goods Receipts can be cancelled. Current status is {grn.status}. "
            "For posted goods receipts, use a purchase return or credit note workflow."
        )

    ProcurementDocument.objects.filter(pk=grn.pk).update(status='CANCELLED')
    grn.status = 'CANCELLED'

    ProcurementAuditTrail.objects.create(
        company=grn.company,
        document=grn,
        user=user,
        event='CANCELLED',
        details=f"GRN {grn.number} was cancelled by {user.username}."
    )

    return grn


def get_po_receiving_summary(po):
    """
    Return full receiving summary for a PO including lines with remaining quantities and all GRNs.
    """
    lines_summary = []
    for line in po.lines.select_related('item').all():
        prev_received = _get_po_line_received(line)
        remaining = max(Decimal('0'), line.quantity - prev_received)
        lines_summary.append({
            'po_line_id': str(line.id),
            'item_id': str(line.item_id),
            'item_name': line.item.name,
            'item_code': line.item.item_code or line.item.sku or '',
            'unit_of_measure': line.item.unit_of_measure or 'pcs',
            'ordered_quantity': float(line.quantity),
            'previously_received': float(prev_received),
            'remaining_quantity': float(remaining),
            'unit_price': float(line.unit_price),
            'track_serial_number': bool(line.item.track_serial_number),
        })

    grns = ProcurementDocument.objects.filter(
        parent_document=po,
        document_type='GOODS_RECEIPT'
    ).select_related('warehouse', 'created_by').prefetch_related('lines').order_by('-created_at')

    grn_list = []
    for grn in grns:
        tot_accepted = sum(l.accepted_quantity for l in grn.lines.all())
        tot_rejected = sum(l.rejected_quantity for l in grn.lines.all())
        grn_list.append({
            'id': str(grn.id),
            'number': grn.number,
            'status': grn.status,
            'document_date': str(grn.document_date),
            'warehouse_name': grn.warehouse.name if grn.warehouse else '',
            'warehouse_id': str(grn.warehouse_id) if grn.warehouse_id else '',
            'reference_number': grn.reference_number,
            'total_accepted_quantity': float(tot_accepted),
            'total_rejected_quantity': float(tot_rejected),
            'lines_count': grn.lines.count(),
            'notes': grn.notes,
            'created_by_name': grn.created_by.get_full_name() or grn.created_by.username if grn.created_by else '',
            'created_at': grn.created_at.isoformat() if grn.created_at else '',
        })

    return {
        'po_id': str(po.id),
        'po_number': po.number,
        'po_status': po.status,
        'vendor_id': str(po.vendor_id) if po.vendor_id else '',
        'vendor_name': po.vendor.name if po.vendor else '',
        'can_receive': po.status in RECEIVABLE_PO_STATUSES and any(l['remaining_quantity'] > 0 for l in lines_summary),
        'lines': lines_summary,
        'grns': grn_list,
    }



@transaction.atomic
def create_and_post_purchase_return(po, return_data, user):
    """
    Create and post a Purchase Return against a received Purchase Order.

    return_data = {
        'warehouse': <Warehouse instance>,
        'document_date': date,
        'reference_number': str (optional),
        'notes': str (optional),
        'lines': [
            {
                'po_line_id': <UUID>,
                'quantity': Decimal,
                'serial_numbers': [str, ...] (optional),
            },
        ]
    }

    Returns: Posted PURCHASE_RETURN ProcurementDocument
    """
    if po.document_type != 'PURCHASE_ORDER':
        raise ValidationError("Source document must be a Purchase Order.")
    if po.status not in {'PARTIALLY_RECEIVED', 'RECEIVED'}:
        raise ValidationError("Can only return against a partially or fully received Purchase Order.")
    if po.company != user.company:
        raise ValidationError("Cannot create return for a Purchase Order from a different company.")

    warehouse = return_data['warehouse']
    if warehouse.company != po.company:
        raise ValidationError("Warehouse belongs to a different company.")

    lines_data = return_data.get('lines', [])
    if not lines_data:
        raise ValidationError("At least one return line is required.")

    po_lines_map = {str(pl.pk): pl for pl in po.lines.select_for_update().all()}

    validated_lines = []
    for line in lines_data:
        po_line_id = str(line.get('po_line_id', ''))
        po_line = po_lines_map.get(po_line_id)
        if not po_line:
            raise ValidationError(f"PO line {po_line_id} not found on this Purchase Order.")

        item = po_line.item
        if not item:
            raise ValidationError(f"PO line {po_line_id} has no item.")

        return_qty = Decimal(str(line.get('quantity', 0)))
        if return_qty <= 0:
            raise ValidationError(f"Return quantity for {item.name} must be positive.")

        total_received = _get_po_line_received(po_line)
        already_returned = ProcurementLine.objects.filter(
            document__document_type='PURCHASE_RETURN',
            document__parent_document=po,
            document__status__in=GRN_POSTED_STATUSES,
            item=item,
        ).aggregate(total=__import__('django.db.models', fromlist=['Sum']).Sum('quantity'))['total'] or Decimal('0')


        returnable = total_received - already_returned
        if return_qty > returnable:
            raise ValidationError(
                f"Cannot return {return_qty} of {item.name}. "
                f"Received: {total_received}, Already returned: {already_returned}, "
                f"Returnable: {returnable}."
            )

        serial_numbers = line.get('serial_numbers', [])
        if item.track_serial_number:
            if len(serial_numbers) != int(return_qty):
                raise ValidationError(
                    f"Item {item.name} requires serial tracking. "
                    f"Expected {int(return_qty)} serial(s), got {len(serial_numbers)}."
                )
            from inventory.models import ItemSerial
            for sn in serial_numbers:
                try:
                    serial_obj = ItemSerial.objects.get(
                        company=po.company, item=item, serial_number=sn
                    )
                    if serial_obj.status != 'IN_STOCK':
                        raise ValidationError(
                            f"Serial {sn} is {serial_obj.status} and cannot be returned."
                        )
                except ItemSerial.DoesNotExist:
                    raise ValidationError(
                        f"Serial {sn} not found in inventory for item {item.name}."
                    )

        validated_lines.append({
            'po_line': po_line,
            'item': item,
            'quantity': return_qty,
            'serial_numbers': serial_numbers,
        })

    # Create return document
    ret_number = f"RET-{uuid.uuid4().hex[:8].upper()}"
    return_doc = ProcurementDocument.objects.create(
        company=po.company,
        document_type='PURCHASE_RETURN',
        status='POSTED',  # Returns are posted immediately on creation
        number=ret_number,

        document_date=return_data['document_date'],
        reference_number=return_data.get('reference_number', ''),
        notes=return_data.get('notes', ''),
        warehouse=warehouse,
        crm_entity=po.crm_entity,
        parent_document=po,
        created_by=user,
    )

    for idx, vl in enumerate(validated_lines, start=1):
        ProcurementLine.objects.create(
            company=po.company,
            document=return_doc,
            item=vl['item'],
            quantity=vl['quantity'],
            unit_price=vl['po_line'].unit_price,
            total_amount=vl['quantity'] * vl['po_line'].unit_price,
            line_number=idx,
            custom_fields={'po_line_id': str(vl['po_line'].pk), 'serial_numbers': vl['serial_numbers']},
        )

    # Process inventory OUT transactions
    for vl in validated_lines:
        serial_numbers = vl['serial_numbers']
        try:
            process_transaction(
                company=po.company,
                item=vl['item'],
                warehouse=warehouse,
                movement_type='PURCHASE_RETURN',
                quantity=vl['quantity'],
                reference=ret_number,
                user=user,
                notes=f"Purchase Return {ret_number} against PO {po.number}",
                serial_numbers=serial_numbers if serial_numbers else None,
            )
        except (InventoryValidationException, SerialException) as e:
            raise ValidationError(f"Return inventory transaction failed: {str(e)}")

    ProcurementAuditTrail.objects.create(
        company=po.company,
        document=return_doc,
        user=user,
        event='RECEIVED',
        details=f"Purchase Return {ret_number} posted against PO {po.number}."
    )

    return return_doc


def get_grn_status_for_po(po):
    """
    Return a summary dict of GRN receipts for a given PO.
    Used by the PO detail view to display receipt history.
    """
    grns = ProcurementDocument.objects.filter(
        document_type='GOODS_RECEIPT',
        parent_document=po,
    ).order_by('created_at')

    result = []
    for grn in grns:
        result.append({
            'id': str(grn.id),
            'number': grn.number,
            'status': grn.status,
            'document_date': grn.document_date,
            'warehouse': grn.warehouse.name if grn.warehouse else None,
            'total_quantity': sum(
                line.quantity for line in grn.lines.all()
            ),
        })
    return result
