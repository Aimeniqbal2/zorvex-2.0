from typing import Union
from inventory.models import Product, Item

def resolve_item(bridge_instance) -> Union[Item, None]:
    """
    Returns the Item instance from a bridge model (SaleItem, PurchaseOrderItem, ServicePartUsed, StockMovement)
    if it exists, otherwise None.
    """
    if hasattr(bridge_instance, 'item'):
        return bridge_instance.item
    return None

def resolve_product(bridge_instance) -> Union[Product, None]:
    """
    Returns the Product instance from a bridge model if it exists, otherwise None.
    """
    if hasattr(bridge_instance, 'product'):
        return bridge_instance.product
    return None

def get_inventory_entity(bridge_instance) -> Union[Item, Product, None]:
    """
    Returns the modern Item if available, otherwise the legacy Product.
    Used for frontend display and compatibility layers.
    """
    item = resolve_item(bridge_instance)
    if item:
        return item
    return resolve_product(bridge_instance)

def resolve_item_from_product(product: Product) -> Union[Item, None]:
    """
    Resolves a legacy Product to a modern Item using the item_code mapping convention.
    """
    try:
        return Item.objects.get(item_code=f"LEGACY-PROD-{product.id}")
    except Item.DoesNotExist:
        return None
