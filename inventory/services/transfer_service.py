from decimal import Decimal
from django.db import transaction
from .transaction_service import process_transaction
from .exceptions import InventoryValidationException, WarehouseMismatchException

@transaction.atomic
def transfer_stock(item, source_warehouse, destination_warehouse, quantity, user=None, reference='', serial_numbers=None):
    """
    Transfer stock between two warehouses.
    Uses deterministic locking by sorting warehouse UUIDs to prevent deadlocks.
    """
    if not item.track_inventory:
        return None

    if source_warehouse == destination_warehouse:
        raise InventoryValidationException("Source and destination warehouses cannot be the same.")

    if item.company != source_warehouse.company or item.company != destination_warehouse.company:
        raise WarehouseMismatchException("Cross-company transfers are not allowed.")

    qty = Decimal(str(quantity))
    if qty <= 0:
        raise InventoryValidationException("Transfer quantity must be positive.")

    # Sort warehouses to prevent deadlocks during select_for_update
    from inventory.models import InventoryBalance
    wh_ids = sorted([source_warehouse.id, destination_warehouse.id])
    
    # We acquire locks on both balances upfront
    balances = list(InventoryBalance.objects.select_for_update().filter(
        item=item,
        warehouse_id__in=wh_ids
    ).order_by('warehouse_id'))
    
    # Even if they don't exist yet, get_or_create in the underlying services will handle it, 
    # but the transaction is still safe. The process_transaction calls will re-acquire the lock
    # or use the existing lock.

    # Decrease Source (TRANSFER_OUT)
    out_movement = process_transaction(
        company=item.company,
        item=item,
        warehouse=source_warehouse,
        movement_type='TRANSFER_OUT',
        quantity=qty,
        reference=reference,
        user=user,
        notes=f"Transfer to {destination_warehouse.name}"
    )

    # Increase Destination (TRANSFER_IN)
    in_movement = process_transaction(
        company=item.company,
        item=item,
        warehouse=destination_warehouse,
        movement_type='TRANSFER_IN',
        quantity=qty,
        reference=reference,
        user=user,
        notes=f"Transfer from {source_warehouse.name}"
    )

    if item.track_serial_number and serial_numbers:
        from .serial_service import move_serial
        from inventory.models import ItemSerial
        
        if len(serial_numbers) != qty:
            raise InventoryValidationException("Number of serials provided does not match transfer quantity.")
            
        for sn in serial_numbers:
            try:
                s_obj = ItemSerial.objects.select_for_update().get(
                    company=item.company, item=item, serial_number=sn
                )
                if s_obj.warehouse_id != source_warehouse.id:
                    raise InventoryValidationException(f"Serial {sn} is in {s_obj.warehouse.name}, not {source_warehouse.name}.")
                move_serial(s_obj, destination_warehouse)
            except ItemSerial.DoesNotExist:
                raise InventoryValidationException(f"Serial {sn} not found in inventory.")

    return out_movement, in_movement
