"""
purchasing/services/goods_receipt_service.py

Authoritative Goods Receipt service for Zorvex ERP 2.0.
Replaces the unsafe ProcurementDocument.save() inventory side-effect.

All inventory mutations go through this service exclusively.
"""
import uuid
from decimal import Decimal
from django.db import transaction
from django.core.exceptions import ValidationError

from inventory.services.transaction_service import process_transaction
from inventory.services.exceptions import InventoryValidationException, SerialException
from purchasing.models import ProcurementDocument, ProcurementLine, ProcurementAuditTrail


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

RECEIVABLE_PO_STATUSES = {'APPROVED', 'PARTIALLY_RECEIVED'}
GRN_POSTED_STATUS = 'RECEIVED'
GRN_DRAFT_STATUS = 'DRAFT'


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _get_po_line_received(po_line):
    """Return total already-received quantity for a PO line from GRN lines."""
    received = ProcurementLine.objects.filter(
        document__document_type='GOODS_RECEIPT',
        document__parent_document=po_line.document,
        document__status=GRN_POSTED_STATUS,
        item=po_line.item,
    ).aggregate(total=__import__('django.db.models', fromlist=['Sum']).Sum('quantity'))['total']
    return received or Decimal('0')


def _update_po_status_from_receipts(po, user=None):
    """
    Recalculate and set PO status based on current GRN receipts.
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
        return  # No change needed

    if po.status != new_status:
        ProcurementDocument.objects.filter(pk=po.pk).update(status=new_status)
        po.status = new_status
        ProcurementAuditTrail.objects.create(
            company=po.company,
            document=po,
            user=user,
            event='RECEIVED',
            details=f"PO status updated to {new_status} after goods receipt."
        )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

@transaction.atomic
def create_goods_receipt(po, grn_data, user):
    """
    Create a DRAFT Goods Receipt document from an approved Purchase Order.

    grn_data = {
        'warehouse': <Warehouse instance>,
        'document_date': date,
        'reference_number': str (optional, delivery ref),
        'notes': str (optional),
        'lines': [
            {
                'item': <Item instance>,
                'po_line_id': <UUID of PO ProcurementLine>,
                'quantity': Decimal,
                'serial_numbers': [str, ...] (optional),
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
            f"Purchase Order must be APPROVED or PARTIALLY_RECEIVED to receive goods. "
            f"Current status: {po.status}"
        )
    if po.company != user.company:
        raise ValidationError("Cannot create GRN for a Purchase Order from a different company.")

    warehouse = grn_data['warehouse']
    if warehouse.company != po.company:
        raise ValidationError("Warehouse belongs to a different company.")

    lines_data = grn_data.get('lines', [])
    if not lines_data:
        raise ValidationError("At least one receipt line is required.")

    # Validate all lines before creating anything
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
        if item.company != po.company:
            raise ValidationError(f"Item {item.name} belongs to a different company.")

        receiving_qty = Decimal(str(line.get('quantity', 0)))
        if receiving_qty <= 0:
            raise ValidationError(f"Receiving quantity for item {item.name} must be positive.")

        already_received = _get_po_line_received(po_line)
        remaining = po_line.quantity - already_received

        if receiving_qty > remaining:
            raise ValidationError(
                f"Cannot receive {receiving_qty} of {item.name}. "
                f"Ordered: {po_line.quantity}, Already received: {already_received}, "
                f"Remaining: {remaining}."
            )

        serial_numbers = line.get('serial_numbers', [])
        if item.track_serial_number:
            if len(serial_numbers) != int(receiving_qty):
                raise ValidationError(
                    f"Item {item.name} requires serial tracking. "
                    f"Expected {int(receiving_qty)} serial number(s), got {len(serial_numbers)}."
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
            'quantity': receiving_qty,
            'serial_numbers': serial_numbers,
        })

    # Create the GRN header
    grn_number = f"GRN-{uuid.uuid4().hex[:8].upper()}"
    grn = ProcurementDocument.objects.create(
        company=po.company,
        document_type='GOODS_RECEIPT',
        status=GRN_DRAFT_STATUS,
        number=grn_number,
        document_date=grn_data['document_date'],
        reference_number=grn_data.get('reference_number', ''),
        notes=grn_data.get('notes', ''),
        warehouse=warehouse,
        crm_entity=po.crm_entity,
        parent_document=po,
        created_by=user,
    )

    # Create GRN lines
    for idx, vl in enumerate(validated_lines, start=1):
        ProcurementLine.objects.create(
            company=po.company,
            document=grn,
            item=vl['item'],
            quantity=vl['quantity'],
            unit_price=vl['po_line'].unit_price,
            total_amount=vl['quantity'] * vl['po_line'].unit_price,
            line_number=idx,
            description=vl['po_line'].description,
            custom_fields={'po_line_id': str(vl['po_line'].pk), 'serial_numbers': vl['serial_numbers']},
        )

    ProcurementAuditTrail.objects.create(
        company=po.company,
        document=grn,
        user=user,
        event='CREATED',
        details=f"GRN created from PO {po.number}."
    )

    return grn


@transaction.atomic
def post_goods_receipt(grn, user):
    """
    Post (confirm) a DRAFT Goods Receipt, triggering inventory transactions.

    Idempotency: Once posted (status=RECEIVED), re-posting raises ValidationError.
    Concurrency: Uses select_for_update on GRN and PO lines.
    """
    # Re-fetch with lock
    grn = ProcurementDocument.objects.select_for_update().get(pk=grn.pk)

    if grn.document_type != 'GOODS_RECEIPT':
        raise ValidationError("Document is not a Goods Receipt.")
    if grn.status == GRN_POSTED_STATUS:
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
            f"Source Purchase Order {po.number} must be APPROVED or PARTIALLY_RECEIVED. "
            f"Current status: {po.status}"
        )

    warehouse = grn.warehouse
    if not warehouse:
        raise ValidationError("GRN must have a warehouse assigned.")
    if warehouse.company != grn.company:
        raise ValidationError("Warehouse belongs to a different company.")

    grn_lines = list(grn.lines.select_related('item').all())
    if not grn_lines:
        raise ValidationError("Cannot post a GRN with no lines.")

    # Re-validate quantities (concurrency protection)
    po_lines_map = {str(pl.pk): pl for pl in po.lines.select_for_update().all()}

    for grn_line in grn_lines:
        po_line_id = grn_line.custom_fields.get('po_line_id')
        po_line = po_lines_map.get(str(po_line_id)) if po_line_id else None
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
    ProcurementDocument.objects.filter(pk=grn.pk).update(status=GRN_POSTED_STATUS)
    grn.status = GRN_POSTED_STATUS

    # Process inventory transactions
    for grn_line in grn_lines:
        serial_numbers = grn_line.custom_fields.get('serial_numbers', [])
        try:
            process_transaction(
                company=grn.company,
                item=grn_line.item,
                warehouse=warehouse,
                movement_type='PURCHASE',
                quantity=grn_line.quantity,
                reference=grn.number,
                user=user,
                notes=f"Goods Receipt {grn.number} from PO {po.number}",
                serial_numbers=serial_numbers if serial_numbers else None,
            )
        except (InventoryValidationException, SerialException) as e:
            # Rollback will occur due to atomic block
            raise ValidationError(f"Inventory transaction failed: {str(e)}")

    # Update PO status
    _update_po_status_from_receipts(po, user=user)

    ProcurementAuditTrail.objects.create(
        company=grn.company,
        document=grn,
        user=user,
        event='RECEIVED',
        details=f"GRN {grn.number} posted. Inventory updated."
    )

    return grn


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
            document__status=GRN_POSTED_STATUS,
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
        status=GRN_POSTED_STATUS,  # Returns are posted immediately on creation
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
