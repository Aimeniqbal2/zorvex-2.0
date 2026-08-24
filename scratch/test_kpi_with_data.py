import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_system.settings')
django.setup()

from django.db.models import Sum, Count, F, Q, Value, CharField, OuterRef, Subquery, IntegerField, DecimalField, Case, When
from django.db.models.functions import Concat, Cast, Coalesce
from inventory.models import Product, InventoryBalance
from companies.models import Company

company = Company.objects.first()
if not company:
    print("No company found.")
    exit()

print(f"Testing for company: {company.name}")

Product.objects.all().delete()
p1 = Product.objects.create(company=company, brand='A', model_name='M1', cost_price=10.50, stock_quantity=10, low_stock_threshold=5)
p2 = Product.objects.create(company=company, brand='A', model_name='M2', cost_price=20.00, stock_quantity=2, low_stock_threshold=5)
p3 = Product.objects.create(company=company, brand='B', model_name='M3', cost_price=5.00, stock_quantity=0, low_stock_threshold=5)

item_code_expr = Concat(Value('LEGACY-PROD-'), Cast(OuterRef('id'), CharField()))

balance_subquery = InventoryBalance.objects.filter(
    item__item_code=item_code_expr,
    company_id=OuterRef('company_id')
).values('item__item_code').annotate(
    total_qty=Sum('quantity')
).values('total_qty')

products = Product.objects.filter(company_id=company.id, is_deleted=False).annotate(
    annotated_qty=Subquery(balance_subquery, output_field=DecimalField(max_digits=12, decimal_places=2)),
    final_stock=Coalesce('annotated_qty', Cast('stock_quantity', DecimalField(max_digits=12, decimal_places=2)))
)

kpis = products.aggregate(
    total_active_skus=Count('id'),
    calculated_asset_value=Sum(F('cost_price') * F('final_stock'), output_field=DecimalField(max_digits=12, decimal_places=2)),
    hardware_shortages=Count('id', filter=Q(final_stock__lte=Coalesce('low_stock_threshold', Value(5), output_field=IntegerField())))
)

print("ORM:", kpis)

# Compare with legacy logic
total_skus = 0
total_value = 0
hardware_shortages = 0

for p in Product.objects.filter(company_id=company.id, is_deleted=False):
    total_skus += 1
    # Mocking ProductSerializer logic
    from inventory.services.compatibility import resolve_item_from_product
    item_entity = resolve_item_from_product(p)
    stock = p.stock_quantity
    if item_entity:
        stock_res = item_entity.balances.aggregate(total=Sum('quantity'))['total']
        if stock_res is not None:
            stock = stock_res
    
    total_value += (p.cost_price * stock)
    if stock <= p.low_stock_threshold:
        hardware_shortages += 1

print(f"Legacy Logic: SKUs={total_skus}, Value={total_value}, Shortages={hardware_shortages}")
Product.objects.all().delete()
