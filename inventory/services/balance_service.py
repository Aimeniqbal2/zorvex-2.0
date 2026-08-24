from decimal import Decimal
from django.db import transaction
from django.core.exceptions import ValidationError
from inventory.models import InventoryBalance
from .exceptions import NegativeStockException, WarehouseMismatchException, InventoryValidationException

@transaction.atomic
def get_balance(item, warehouse):
    """Retrieve the balance for an item in a specific warehouse, locked for update."""
    if item.company_id != warehouse.company_id:
        raise WarehouseMismatchException("Item and warehouse belong to different companies.")

    balance, created = InventoryBalance.objects.select_for_update().get_or_create(
        item=item,
        warehouse=warehouse,
        defaults={
            'quantity': Decimal('0.00'),
            'company': item.company
        }
    )
    return balance

@transaction.atomic
def increase_stock(item, warehouse, quantity):
    """Increase stock for an item in a specific warehouse."""
    if not item.track_inventory:
        return None

    qty = Decimal(str(quantity))
    if qty <= 0:
        raise InventoryValidationException("Increase quantity must be positive.")

    balance = get_balance(item, warehouse)
    balance.quantity += qty
    balance.save(update_fields=['quantity', 'updated_at'])
    return balance

@transaction.atomic
def decrease_stock(item, warehouse, quantity):
    """Decrease stock for an item in a specific warehouse."""
    if not item.track_inventory:
        return None

    qty = Decimal(str(quantity))
    if qty <= 0:
        raise InventoryValidationException("Decrease quantity must be positive.")

    balance = get_balance(item, warehouse)
    
    if balance.quantity < qty:
        raise NegativeStockException(
            f"Insufficient stock for {item.name} at {warehouse.name}. "
            f"Requested: {qty}, Available: {balance.quantity}"
        )
        
    balance.quantity -= qty
    balance.save(update_fields=['quantity', 'updated_at'])
    return balance

@transaction.atomic
def set_opening_balance(item, warehouse, quantity):
    """Set the initial opening balance for an item."""
    if not item.track_inventory:
        return None

    qty = Decimal(str(quantity))
    if qty < 0:
        raise InventoryValidationException("Opening balance cannot be negative.")

    balance = get_balance(item, warehouse)
    if balance.quantity != 0:
        raise InventoryValidationException("Cannot set opening balance when current balance is non-zero.")

    balance.quantity = qty
    balance.save(update_fields=['quantity', 'updated_at'])
    return balance

def validate_available_stock(item, warehouse, quantity):
    """Check if the requested quantity is available in the warehouse."""
    if not item.track_inventory:
        return True

    qty = Decimal(str(quantity))
    try:
        balance = InventoryBalance.objects.get(item=item, warehouse=warehouse)
        if balance.quantity >= qty:
            return True
        raise NegativeStockException(
            f"Insufficient stock for {item.name} at {warehouse.name}. "
            f"Requested: {qty}, Available: {balance.quantity}"
        )
    except InventoryBalance.DoesNotExist:
        if qty > 0:
            raise NegativeStockException(
                f"Insufficient stock for {item.name} at {warehouse.name}. "
                f"Requested: {qty}, Available: 0"
            )
        return True
