from decimal import Decimal
from django.db import transaction
from .balance_service import increase_stock, decrease_stock, set_opening_balance
from .movement_service import create_movement
from .exceptions import InventoryValidationException, WarehouseMismatchException

@transaction.atomic
def process_transaction(company, item, warehouse, movement_type, quantity, reference='', user=None, notes='', serial_numbers=None):
    """
    Public entry point for inventory transactions.
    Executes balance update and movement creation atomically.
    """
    if not item.track_inventory:
        return None

    if company != item.company or company != warehouse.company:
        raise WarehouseMismatchException("Company context does not match item and warehouse company.")

    qty = Decimal(str(quantity))
    
    # Types that increase stock
    IN_TYPES = ['IN', 'PURCHASE', 'SALE_RETURN', 'TRANSFER_IN', 'ADJUSTMENT_IN', 'EMPLOYEE_RETURN']
    # Types that decrease stock
    OUT_TYPES = ['OUT', 'PURCHASE_RETURN', 'SALE', 'TRANSFER_OUT', 'SERVICE_USAGE', 'ADJUSTMENT_OUT', 'DAMAGE', 'LOSS', 'EMPLOYEE_ISSUE']
    
    if movement_type == 'OPENING_BALANCE':
        set_opening_balance(item, warehouse, qty)
    elif movement_type in IN_TYPES:
        increase_stock(item, warehouse, qty)
    elif movement_type in OUT_TYPES:
        decrease_stock(item, warehouse, qty)
    elif movement_type == 'ADJUST':
        # Legacy ADJUST - infer direction from current balance? 
        # Actually Phase 3B prefers ADJUSTMENT_IN and ADJUSTMENT_OUT.
        # We will not support 'ADJUST' dynamically here unless it's strictly required.
        raise InventoryValidationException("Use ADJUSTMENT_IN or ADJUSTMENT_OUT instead of ADJUST.")
    else:
        raise InventoryValidationException(f"Unsupported movement type for processing: {movement_type}")

    user_note = f"[User: {user.username}] " if user else ""
    full_notes = user_note + notes

    movement = create_movement(
        company=company,
        item=item,
        warehouse=warehouse,
        movement_type=movement_type,
        quantity=qty,
        reference=reference,
        notes=full_notes.strip()
    )
    
    if item.track_serial_number and serial_numbers:
        from .serial_service import receive_serial, sell_serial, return_serial, issue_serial, unissue_serial
        from .exceptions import InventoryValidationException
        
        if len(serial_numbers) != qty:
            raise InventoryValidationException("Number of serials provided does not match quantity.")
            
        for serial in serial_numbers:
            if movement_type in ['IN', 'PURCHASE', 'OPENING_BALANCE', 'ADJUSTMENT_IN']:
                receive_serial(item, warehouse, serial)
            elif movement_type in ['OUT', 'SALE', 'SERVICE_USAGE', 'ADJUSTMENT_OUT', 'DAMAGE', 'LOSS']:
                # Find the existing serial record by string or ID
                from inventory.models import ItemSerial
                try:
                    s_obj = ItemSerial.objects.get(company=company, item=item, serial_number=serial)
                    sell_serial(s_obj)
                except ItemSerial.DoesNotExist:
                    raise InventoryValidationException(f"Serial {serial} not found in inventory.")
            elif movement_type in ['SALE_RETURN', 'PURCHASE_RETURN']:
                from inventory.models import ItemSerial
                try:
                    s_obj = ItemSerial.objects.get(company=company, item=item, serial_number=serial)
                    return_serial(s_obj, warehouse)
                except ItemSerial.DoesNotExist:
                    raise InventoryValidationException(f"Serial {serial} not found.")
            elif movement_type == 'EMPLOYEE_ISSUE':
                from inventory.models import ItemSerial
                try:
                    s_obj = ItemSerial.objects.get(company=company, item=item, serial_number=serial)
                    issue_serial(s_obj)
                except ItemSerial.DoesNotExist:
                    raise InventoryValidationException(f"Serial {serial} not found in inventory.")
            elif movement_type == 'EMPLOYEE_RETURN':
                from inventory.models import ItemSerial
                try:
                    s_obj = ItemSerial.objects.get(company=company, item=item, serial_number=serial)
                    unissue_serial(s_obj, warehouse)
                except ItemSerial.DoesNotExist:
                    raise InventoryValidationException(f"Serial {serial} not found.")

    return movement
