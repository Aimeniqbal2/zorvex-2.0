import uuid
from decimal import Decimal
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from django.core.exceptions import ValidationError
from purchasing.models import (
    ProcurementDocument, ProcurementLine, ProcurementAuditTrail
)

RECEIVABLE_PO_STATUSES = ('APPROVED', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED')
INVOICE_POSTED_STATUSES = ('POSTED', 'APPROVED')


def _get_po_line_accepted(po_line):
    """
    Returns the total accepted quantity across all posted Goods Receipts for a PO line.
    """
    total = ProcurementLine.objects.filter(
        document__document_type='GOODS_RECEIPT',
        document__status__in=['POSTED', 'RECEIVED'],
        parent_line=po_line,
    ).aggregate(total=Sum('accepted_quantity'))['total']
    return total or Decimal('0')


def _get_po_line_billed(po_line, exclude_invoice_id=None):
    """
    Returns the total invoiced quantity across all approved/posted Vendor Invoices for a PO line.
    """
    qs = ProcurementLine.objects.filter(
        document__document_type='VENDOR_INVOICE',
        document__status__in=['APPROVED', 'POSTED', 'MATCHED'],
        parent_line=po_line,
    )
    if exclude_invoice_id:
        qs = qs.exclude(document_id=exclude_invoice_id)
    total = qs.aggregate(total=Sum('quantity'))['total']
    return total or Decimal('0')


@transaction.atomic
def create_vendor_invoice(po, invoice_data, user):
    """
    Create a new Vendor Invoice / Bill linked to an approved Purchase Order.
    Calculates backend totals and automatically executes Three-Way Matching.
    """
    # 1. Validate PO status
    po = ProcurementDocument.objects.select_for_update().get(pk=po.pk)
    if po.document_type != 'PURCHASE_ORDER':
        raise ValidationError("Source document must be a Purchase Order.")
    if po.status not in RECEIVABLE_PO_STATUSES:
        raise ValidationError(
            f"Cannot create invoice against PO {po.number} in status: {po.status}. "
            f"PO must be APPROVED, SENT, PARTIALLY_RECEIVED, or RECEIVED."
        )

    company = po.company
    vendor_invoice_number = invoice_data.get('vendor_invoice_number', '').strip()
    reference_number = invoice_data.get('reference_number', '').strip() or vendor_invoice_number

    # 2. Duplicate invoice protection per vendor/company
    if vendor_invoice_number:
        dup = ProcurementDocument.objects.filter(
            company=company,
            vendor=po.vendor,
            document_type='VENDOR_INVOICE',
            vendor_invoice_number=vendor_invoice_number,
        ).exclude(status='CANCELLED').exists()
        if dup:
            raise ValidationError(
                f"A Vendor Invoice with number '{vendor_invoice_number}' already exists for vendor {po.vendor.name}."
            )

    # 3. Validate Invoice Lines
    lines_data = invoice_data.get('lines', [])
    if not lines_data:
        raise ValidationError("At least one invoice line is required.")

    po_lines_map = {str(pl.pk): pl for pl in po.lines.all()}
    validated_lines = []

    subtotal_acc = Decimal('0.00')
    tax_acc = Decimal('0.00')
    discount_acc = Decimal('0.00')

    for line_idx, line in enumerate(lines_data, start=1):
        po_line_id = str(line.get('po_line_id', ''))
        po_line = po_lines_map.get(po_line_id)
        if not po_line:
            raise ValidationError(f"Line {line_idx}: PO line ID {po_line_id} is invalid or does not belong to PO {po.number}.")

        item = po_line.item
        if not item:
            raise ValidationError(f"Line {line_idx}: PO line has no associated inventory item.")

        invoiced_qty = Decimal(str(line.get('quantity', line.get('invoiced_quantity', 0))))
        if invoiced_qty <= 0:
            raise ValidationError(f"Line {line_idx}: Invoiced quantity for {item.name} must be greater than zero.")

        # Unit price defaults to PO line price if not provided
        unit_price_val = line.get('unit_price')
        if unit_price_val is not None:
            unit_price = Decimal(str(unit_price_val)).quantize(Decimal('0.01'))
        else:
            unit_price = po_line.unit_price

        disc_val = Decimal(str(line.get('discount_amount', 0))).quantize(Decimal('0.01'))
        tax_val = Decimal(str(line.get('tax_amount', 0))).quantize(Decimal('0.01'))

        # Line total calculated on backend
        line_subtotal = (invoiced_qty * unit_price).quantize(Decimal('0.01'))
        line_total = max(Decimal('0.00'), line_subtotal - disc_val + tax_val)

        subtotal_acc += line_subtotal
        tax_acc += tax_val
        discount_acc += disc_val

        validated_lines.append({
            'po_line': po_line,
            'item': item,
            'vendor_item': po_line.vendor_item,
            'vendor_sku': po_line.vendor_sku,
            'quantity': invoiced_qty,
            'unit_price': unit_price,
            'discount_amount': disc_val,
            'tax_amount': tax_val,
            'total_amount': line_total,
            'notes': line.get('notes', ''),
        })

    freight_val = Decimal(str(invoice_data.get('freight_amount', 0))).quantize(Decimal('0.01'))
    grand_total = max(Decimal('0.00'), subtotal_acc - discount_acc + tax_acc + freight_val)

    # 4. Create Vendor Invoice Document
    invoice = ProcurementDocument.objects.create(
        company=company,
        document_type='VENDOR_INVOICE',
        status='PENDING_MATCH',
        document_date=invoice_data.get('document_date') or timezone.now().date(),
        due_date=invoice_data.get('due_date'),
        reference_number=reference_number,
        vendor_invoice_number=vendor_invoice_number,
        payment_terms=invoice_data.get('payment_terms', po.payment_terms),
        currency=invoice_data.get('currency', po.currency),
        subtotal_amount=subtotal_acc,
        tax_amount=tax_acc,
        discount_amount=discount_acc,
        freight_amount=freight_val,
        total_amount=grand_total,
        vendor=po.vendor,
        crm_entity=po.crm_entity,
        parent_document=po,
        created_by=user,
        notes=invoice_data.get('notes', ''),
    )

    # 5. Create Invoice Lines
    for idx, vl in enumerate(validated_lines, start=1):
        ProcurementLine.objects.create(
            company=company,
            document=invoice,
            parent_line=vl['po_line'],
            item=vl['item'],
            vendor_item=vl['vendor_item'],
            vendor_sku=vl['vendor_sku'],
            quantity=vl['quantity'],
            unit_price=vl['unit_price'],
            discount_amount=vl['discount_amount'],
            tax_amount=vl['tax_amount'],
            total_amount=vl['total_amount'],
            line_number=idx,
            notes=vl['notes'],
            description=vl['po_line'].description,
            custom_fields={'po_line_id': str(vl['po_line'].pk)},
        )

    # 6. Execute Immediate Three-Way Matching
    match_results = run_three_way_match(invoice, user=user)
    invoice.refresh_from_db()

    ProcurementAuditTrail.objects.create(
        company=company,
        document=invoice,
        user=user,
        event='CREATED',
        details=f"Vendor Invoice {invoice.number} created against PO {po.number}. Match Status: {invoice.match_status}."
    )

    return invoice



@transaction.atomic
def run_three_way_match(invoice, user=None):
    """
    Performs 3-Way Matching by comparing:
    1. Purchase Order lines (ordered quantity & expected unit price)
    2. Posted Goods Receipts / GRN lines (accepted received quantity)
    3. Vendor Invoice lines (invoiced quantity & invoiced unit price)

    Produces comprehensive matching result:
    - MATCHED
    - PRICE_MISMATCH
    - QUANTITY_MISMATCH
    - TAX_MISMATCH
    - MISMATCH (multi-factor)
    """
    invoice = ProcurementDocument.objects.select_for_update().get(pk=invoice.pk)
    if invoice.document_type != 'VENDOR_INVOICE':
        raise ValidationError("3-Way Match can only be run on Vendor Invoices.")

    po = invoice.parent_document
    if not po:
        raise ValidationError(f"Invoice {invoice.number} has no parent Purchase Order.")

    lines = list(invoice.lines.select_related('item', 'parent_line').all())
    if not lines:
        raise ValidationError("Invoice has no lines to match.")

    mismatch_flags = set()
    line_results = []
    has_partial_quantities = False

    for inv_line in lines:
        po_line = inv_line.parent_line
        item = inv_line.item

        if not po_line:
            line_results.append({
                'line_number': inv_line.line_number,
                'item_id': str(item.id),
                'item_name': item.name,
                'status': 'MISMATCH',
                'reasons': ['PO line not linked'],
            })
            mismatch_flags.add('QUANTITY_MISMATCH')
            continue

        po_ordered_qty = po_line.quantity
        po_expected_price = po_line.unit_price

        # Accepted quantity from all posted GRNs on this PO line
        accepted_qty = _get_po_line_accepted(po_line)
        # Previously billed quantity on other non-cancelled invoices
        prev_billed = _get_po_line_billed(po_line, exclude_invoice_id=invoice.id)
        # Remaining billable from accepted received stock
        remaining_billable_from_grn = max(Decimal('0'), accepted_qty - prev_billed)
        remaining_billable_from_po = max(Decimal('0'), po_ordered_qty - prev_billed)

        inv_qty = inv_line.quantity
        inv_price = inv_line.unit_price

        line_mismatches = []

        # 1. Price Matching Check
        price_diff = (inv_price - po_expected_price).quantize(Decimal('0.01'))
        variance_pct = Decimal('0.00')
        if po_expected_price > Decimal('0.00'):
            variance_pct = ((price_diff / po_expected_price) * Decimal('100')).quantize(Decimal('0.01'))

        if abs(price_diff) > Decimal('0.00'):
            line_mismatches.append(f"Price variance: Expected {po_expected_price}, Invoiced {inv_price} ({variance_pct:+}% variance)")
            mismatch_flags.add('PRICE_MISMATCH')

        # 2. Quantity Matching Check (against accepted GRN quantity)
        if inv_qty > remaining_billable_from_grn:
            line_mismatches.append(
                f"Quantity mismatch: Invoiced {inv_qty} exceeds accepted remaining billable {remaining_billable_from_grn} "
                f"(Accepted on GRNs: {accepted_qty}, Previously Billed: {prev_billed})."
            )
            mismatch_flags.add('QUANTITY_MISMATCH')

        # Also check if exceeding original PO quantity
        if (inv_qty + prev_billed) > po_ordered_qty:
            line_mismatches.append(
                f"Over-billing PO: Total billed ({inv_qty + prev_billed}) exceeds PO ordered quantity ({po_ordered_qty})."
            )
            mismatch_flags.add('QUANTITY_MISMATCH')

        if inv_qty < po_ordered_qty:
            has_partial_quantities = True

        line_match_status = 'MATCHED' if not line_mismatches else 'MISMATCH'

        line_results.append({
            'line_number': inv_line.line_number,
            'item_id': str(item.id),
            'item_name': item.name,
            'ordered_quantity': float(po_ordered_qty),
            'accepted_quantity': float(accepted_qty),
            'previously_billed_quantity': float(prev_billed),
            'remaining_billable_quantity': float(remaining_billable_from_grn),
            'invoiced_quantity': float(inv_qty),
            'expected_price': float(po_expected_price),
            'invoiced_price': float(inv_price),
            'price_variance': float(price_diff),
            'variance_percentage': float(variance_pct),
            'line_total': float(inv_line.total_amount),
            'match_status': line_match_status,
            'reasons': line_mismatches,
        })

    # Overall Match Determination
    if not mismatch_flags:
        overall_match_status = 'MATCHED'
        overall_doc_status = 'MATCHED'
    elif len(mismatch_flags) == 1:
        single_flag = list(mismatch_flags)[0]
        overall_match_status = single_flag
        overall_doc_status = 'MISMATCH'
    else:
        overall_match_status = 'MISMATCH'
        overall_doc_status = 'MISMATCH'

    match_details = {
        'evaluated_at': timezone.now().isoformat(),
        'overall_match_status': overall_match_status,
        'mismatch_flags': list(mismatch_flags),
        'is_partial_delivery_bill': has_partial_quantities,
        'lines': line_results,
        'po_number': po.number,
        'vendor_name': po.vendor.name if po.vendor else '',
    }

    # Save to invoice
    invoice.match_status = overall_match_status
    invoice.match_details = match_details

    # If the invoice has already been overridden, keep MATCHED status for approval flow
    if invoice.override_by:
        invoice.status = 'MATCHED'
    elif invoice.status in ['DRAFT', 'PENDING_MATCH', 'MATCHED', 'MISMATCH']:
        invoice.status = overall_doc_status

    invoice.save(update_fields=['match_status', 'match_details', 'status', 'updated_at'])

    if user:
        ProcurementAuditTrail.objects.create(
            company=invoice.company,
            document=invoice,
            user=user,
            event='STATUS_CHANGE',
            details=f"Three-Way Match completed. Result: {overall_match_status}."
        )

    return match_details


@transaction.atomic
def override_mismatch(invoice, user, reason):
    """
    Authorizes an override for an invoice with 3-Way Match discrepancies.
    Records who approved the override and why, enabling the invoice to proceed to approval.
    """
    invoice = ProcurementDocument.objects.select_for_update().get(pk=invoice.pk)
    if invoice.document_type != 'VENDOR_INVOICE':
        raise ValidationError("Only Vendor Invoices can have match overrides.")
    if invoice.status in ['APPROVED', 'POSTED', 'CANCELLED']:
        raise ValidationError(f"Cannot override invoice in status: {invoice.status}.")

    reason = (reason or '').strip()
    if not reason:
        raise ValidationError("A clear override reason is required to bypass matching discrepancies.")

    invoice.override_by = user
    invoice.override_at = timezone.now()
    invoice.override_reason = reason
    invoice.status = 'MATCHED'  # Unblocks approval while retaining mismatch logs in match_details
    invoice.save(update_fields=['override_by', 'override_at', 'override_reason', 'status', 'updated_at'])

    ProcurementAuditTrail.objects.create(
        company=invoice.company,
        document=invoice,
        user=user,
        event='APPROVED',
        details=f"3-Way Match discrepancy overridden by {user.get_full_name() or user.username}. Reason: {reason}"
    )

    return invoice


@transaction.atomic
def approve_vendor_invoice(invoice, user):
    """
    Approves a MATCHED (or authorized overridden) Vendor Invoice.
    """
    invoice = ProcurementDocument.objects.select_for_update().get(pk=invoice.pk)
    if invoice.document_type != 'VENDOR_INVOICE':
        raise ValidationError("Only Vendor Invoices can be approved.")
    if invoice.status not in ['MATCHED', 'PENDING_APPROVAL']:
        raise ValidationError(
            f"Cannot approve invoice {invoice.number} in status '{invoice.status}'. "
            f"Invoice must be MATCHED or have an authorized mismatch override."
        )

    invoice.status = 'APPROVED'
    invoice.approved_by = user
    invoice.approved_at = timezone.now()
    invoice.save(update_fields=['status', 'approved_by', 'approved_at', 'updated_at'])

    ProcurementAuditTrail.objects.create(
        company=invoice.company,
        document=invoice,
        user=user,
        event='APPROVED',
        details=f"Vendor Invoice {invoice.number} approved by {user.get_full_name() or user.username}."
    )

    return invoice


@transaction.atomic
def post_vendor_bill(invoice, user):
    """
    Posts an approved Vendor Invoice, marking it as AP Ready.
    Updates the PO line billed_quantity accumulators.
    """
    invoice = ProcurementDocument.objects.select_for_update().get(pk=invoice.pk)
    if invoice.document_type != 'VENDOR_INVOICE':
        raise ValidationError("Only Vendor Invoices can be posted as bills.")
    if invoice.status == 'POSTED':
        raise ValidationError(f"Vendor Bill {invoice.number} has already been posted.")
    if invoice.status != 'APPROVED':
        raise ValidationError(
            f"Cannot post invoice {invoice.number} in status '{invoice.status}'. "
            f"Invoice must be APPROVED before posting to Accounts Payable."
        )

    po = invoice.parent_document
    if po:
        # Update PO line billed quantities
        for inv_line in invoice.lines.select_related('parent_line').all():
            po_line = inv_line.parent_line
            if po_line:
                total_billed = _get_po_line_billed(po_line, exclude_invoice_id=None)
                # Add this invoice quantity if not already included
                if inv_line.quantity:
                    po_line.billed_quantity = total_billed
                    po_line.save(update_fields=['billed_quantity'])

    invoice.status = 'POSTED'
    invoice.ap_ready = True
    invoice.payment_status = 'UNPAID'
    invoice.save(update_fields=['status', 'ap_ready', 'payment_status', 'updated_at'])

    ProcurementAuditTrail.objects.create(
        company=invoice.company,
        document=invoice,
        user=user,
        event='POSTED',
        details=f"Vendor Bill {invoice.number} posted to Accounts Payable. Status: AP Ready (UNPAID)."
    )

    return invoice


@transaction.atomic
def cancel_vendor_invoice(invoice, user, reason=''):
    """
    Cancels a Vendor Invoice, freeing up any billable quantities on the parent PO.
    """
    invoice = ProcurementDocument.objects.select_for_update().get(pk=invoice.pk)
    if invoice.document_type != 'VENDOR_INVOICE':
        raise ValidationError("Only Vendor Invoices can be cancelled.")
    if invoice.payment_status in ['PAID', 'PARTIALLY_PAID']:
        raise ValidationError("Cannot cancel an invoice with recorded payments.")

    invoice.status = 'CANCELLED'
    invoice.save(update_fields=['status', 'updated_at'])

    # Recompute PO line billed quantities
    po = invoice.parent_document
    if po:
        for inv_line in invoice.lines.select_related('parent_line').all():
            po_line = inv_line.parent_line
            if po_line:
                new_billed = _get_po_line_billed(po_line, exclude_invoice_id=invoice.id)
                po_line.billed_quantity = new_billed
                po_line.save(update_fields=['billed_quantity'])

    ProcurementAuditTrail.objects.create(
        company=invoice.company,
        document=invoice,
        user=user,
        event='CANCELLED',
        details=f"Vendor Invoice {invoice.number} cancelled. Reason: {reason or 'N/A'}"
    )

    return invoice


def get_po_billing_summary(po):
    """
    Returns comprehensive PO billing and fulfillment metrics:
    - Ordered quantity, accepted received quantity, previously billed, remaining billable per line.
    - Linked invoices with match status and totals.
    """
    lines_summary = []
    for po_line in po.lines.select_related('item').all():
        accepted_qty = _get_po_line_accepted(po_line)
        billed_qty = _get_po_line_billed(po_line)
        remaining_billable = max(Decimal('0'), accepted_qty - billed_qty)

        lines_summary.append({
            'po_line_id': str(po_line.pk),
            'item_id': str(po_line.item.id) if po_line.item else '',
            'item_name': po_line.item.name if po_line.item else '',
            'item_code': getattr(po_line.item, 'item_code', '') or getattr(po_line.item, 'sku', '') if po_line.item else '',
            'ordered_quantity': float(po_line.quantity),

            'accepted_quantity': float(accepted_qty),
            'billed_quantity': float(billed_qty),
            'remaining_billable_quantity': float(remaining_billable),
            'unit_price': float(po_line.unit_price),
            'total_amount': float(po_line.total_amount),
        })

    # Invoices linked to this PO
    invoices = ProcurementDocument.objects.filter(
        company=po.company,
        document_type='VENDOR_INVOICE',
        parent_document=po,
    ).order_by('-document_date', '-id')

    invoices_summary = []
    for inv in invoices:
        invoices_summary.append({
            'id': str(inv.pk),
            'number': inv.number,
            'vendor_invoice_number': inv.vendor_invoice_number,
            'reference_number': inv.reference_number,
            'document_date': str(inv.document_date),
            'due_date': str(inv.due_date) if inv.due_date else None,
            'status': inv.status,
            'match_status': inv.match_status or 'PENDING',
            'subtotal_amount': float(inv.subtotal_amount),
            'tax_amount': float(inv.tax_amount),
            'discount_amount': float(inv.discount_amount),
            'freight_amount': float(inv.freight_amount),
            'total_amount': float(inv.total_amount),
            'ap_ready': inv.ap_ready,
            'payment_status': inv.payment_status,
            'override_by': inv.override_by.get_full_name() or inv.override_by.username if inv.override_by else None,
            'override_reason': inv.override_reason,
        })

    return {
        'po_id': str(po.pk),
        'po_number': po.number,
        'lines': lines_summary,
        'invoices': invoices_summary,
    }
