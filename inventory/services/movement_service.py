from decimal import Decimal
from inventory.models import StockMovement
from .exceptions import InventoryValidationException, WarehouseMismatchException

def create_movement(company, item, warehouse, movement_type, quantity, reference='', notes=''):
    """
    Create an immutable StockMovement record.
    Must be called within a transaction (typically by transaction_service.py).
    """
    if not item.track_inventory:
        return None

    if company != item.company or company != warehouse.company:
        raise WarehouseMismatchException("Company context does not match item and warehouse company.")
        
    qty = Decimal(str(quantity))
    if qty < 0:
        raise InventoryValidationException("Movement quantity magnitude must be positive.")
    if qty == 0 and movement_type != 'OPENING_BALANCE':
        raise InventoryValidationException("Movement quantity cannot be zero except for opening balance.")

    valid_types = [t[0] for t in StockMovement.MOVEMENT_TYPES]
    if movement_type not in valid_types:
        raise InventoryValidationException(f"Invalid movement type: {movement_type}")

    movement = StockMovement.objects.create(
        company=company,
        item=item,
        warehouse=warehouse,
        movement_type=movement_type,
        quantity=qty,
        reference=reference,
        notes=notes
    )
    
    return movement
