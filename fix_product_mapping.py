import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_core.settings')
django.setup()

from inventory.models import Product, Item, InventoryBalance
from platform_core.models import Warehouse

# Get the unmapped product
p = Product.objects.filter(brand='TestBrand', model_name='TestModel').first()
if not p:
    print('Product not found')
    exit()

print(f'Product: {p.brand} {p.model_name}')
print(f'  company_id={p.company_id}')
print(f'  stock={p.stock_quantity}')
print(f'  cost={p.cost_price}')
print(f'  sale_price={p.sale_price}')

# Create Item with LEGACY-PROD mapping
item_code = f'LEGACY-PROD-{p.id}'
item, created = Item.objects.get_or_create(
    item_code=item_code,
    company_id=p.company_id,
    defaults={
        'name': f'{p.brand} {p.model_name}',
        'brand': p.brand,
        'item_type': 'PRODUCT',
        'sku': item_code,
        'barcode': None,
        'cost_price': p.cost_price,
        'selling_price': p.sale_price,
        'is_active': True,
        'is_sellable': True,
        'is_purchasable': True,
        'track_inventory': True,
    }
)
print(f'Item created={created}')

# Create InventoryBalance in default warehouse
warehouse = Warehouse.objects.filter(company_id=p.company_id, is_default=True).first()
if not warehouse:
    print('ERROR: No default warehouse found')
else:
    print(f'Warehouse: {warehouse.name}')
    balance, bcreated = InventoryBalance.objects.get_or_create(
        item=item,
        warehouse=warehouse,
        company_id=p.company_id,
        defaults={'quantity': p.stock_quantity}
    )
    if not bcreated and balance.quantity < p.stock_quantity:
        balance.quantity = p.stock_quantity
        balance.save()
    print(f'InventoryBalance created={bcreated} qty={balance.quantity}')

# Verify
from inventory.services.compatibility import resolve_item_from_product
resolved = resolve_item_from_product(p)
print(f'Verification - item resolved: {resolved is not None}')
