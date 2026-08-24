import logging
from django.core.management.base import BaseCommand
from django.db.models import Count, Q
from inventory.models import Product, Item, InventoryBalance, StockMovement, PurchaseOrderItem
from sales.models import SaleItem
from services.models import ServicePartUsed
from platform_core.models import Warehouse
from companies.models import Company

class Command(BaseCommand):
    help = "Verify the integrity of the Phase 3D inventory migration."

    def handle(self, *args, **options):
        self.stdout.write("Starting Migration Verification...")
        
        errors = []
        warnings = []
        
        # 1. Product <-> Item mapping
        products_count = Product.objects.count()
        unmapped_items_count = Item.objects.filter(item_code__startswith="LEGACY-PROD-").exclude(
            item_code__in=[f"LEGACY-PROD-{p.id}" for p in Product.objects.all()]
        ).count()
        
        # Are there products without an item?
        products_without_items = 0
        for p in Product.objects.all():
            if not Item.objects.filter(item_code=f"LEGACY-PROD-{p.id}").exists():
                products_without_items += 1
                
        if products_without_items > 0:
            errors.append(f"{products_without_items} Products lack a mapped Item.")
        else:
            self.stdout.write(self.style.SUCCESS("✓ Product ↔ Item mapping is complete."))
            
        if unmapped_items_count > 0:
            errors.append(f"{unmapped_items_count} orphan Items found with LEGACY-PROD- code.")
            
        # 2. Company isolation
        # Ensure no cross-company links in mapped items
        cross_company = 0
        for p in Product.objects.all():
            item = Item.objects.filter(item_code=f"LEGACY-PROD-{p.id}").first()
            if item and item.company_id != p.company_id:
                cross_company += 1
        if cross_company > 0:
            errors.append(f"{cross_company} Products mapped to Items in different companies.")
        else:
            self.stdout.write(self.style.SUCCESS("✓ Company isolation verified."))
            
        # 3. Missing warehouse
        companies_without_wh = Company.objects.annotate(
            wh_count=Count('warehouses', filter=Q(warehouses__is_default=True))
        ).filter(wh_count=0).count()
        
        if companies_without_wh > 0:
            errors.append(f"{companies_without_wh} Companies lack a default warehouse.")
        else:
            self.stdout.write(self.style.SUCCESS("✓ Missing warehouse check passed."))
            
        # 4. Duplicate identifiers
        # sku, barcode, item_code per company
        duplicate_codes = Item.objects.values('company', 'item_code').annotate(
            count=Count('id')
        ).filter(count__gt=1, item_code__isnull=False).exclude(item_code='')
        if duplicate_codes.exists():
            errors.append(f"Found {duplicate_codes.count()} duplicate item_codes.")
        else:
            self.stdout.write(self.style.SUCCESS("✓ Duplicate identifiers check passed."))
            
        # 5. Missing bridge records
        unlinked_sale_items = SaleItem.objects.filter(product__isnull=False, item__isnull=True).count()
        if unlinked_sale_items > 0:
            errors.append(f"{unlinked_sale_items} SaleItems are missing an item link.")
            
        unlinked_po_items = PurchaseOrderItem.objects.filter(product__isnull=False, item__isnull=True).count()
        if unlinked_po_items > 0:
            errors.append(f"{unlinked_po_items} PurchaseOrderItems are missing an item link.")
            
        unlinked_service_parts = ServicePartUsed.objects.filter(product__isnull=False, item__isnull=True, source='inventory').count()
        if unlinked_service_parts > 0:
            errors.append(f"{unlinked_service_parts} ServicePartUsed records are missing an item link.")
            
        if unlinked_sale_items == 0 and unlinked_po_items == 0 and unlinked_service_parts == 0:
            self.stdout.write(self.style.SUCCESS("✓ Missing bridge records check passed."))
            
        # 6. StockMovement integrity
        unlinked_movements = StockMovement.objects.filter(product__isnull=False, item__isnull=True).count()
        if unlinked_movements > 0:
            errors.append(f"{unlinked_movements} StockMovements are missing an item link.")
        else:
            self.stdout.write(self.style.SUCCESS("✓ StockMovement integrity passed."))
            
        # 7. InventoryBalance & Quantity consistency
        mismatched_balances = 0
        for p in Product.objects.all():
            item = Item.objects.filter(item_code=f"LEGACY-PROD-{p.id}").first()
            if item:
                # Sum balances
                total_qty = sum([b.quantity for b in item.balances.all()])
                if total_qty != p.stock_quantity:
                    mismatched_balances += 1
        if mismatched_balances > 0:
            errors.append(f"{mismatched_balances} Items have total InventoryBalance different from Product.stock_quantity.")
        else:
            self.stdout.write(self.style.SUCCESS("✓ InventoryBalance totals and Quantity consistency passed."))
            self.stdout.write(self.style.SUCCESS("InventoryBalance totals and Quantity consistency passed."))
            
        if errors:
            self.stdout.write(self.style.ERROR("\nVerification failed with the following errors:"))
            for e in errors:
                self.stdout.write(f"- {e}")
        else:
            self.stdout.write(self.style.SUCCESS("\nAll verification checks passed successfully!"))
