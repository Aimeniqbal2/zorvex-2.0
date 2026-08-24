import logging
from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Count, Q
from inventory.models import Product, Item, InventoryBalance, StockMovement, PurchaseOrderItem
from sales.models import SaleItem
from services.models import ServicePartUsed
from platform_core.models import Warehouse
from companies.models import Company
import uuid

class Command(BaseCommand):
    help = "Migrate legacy Product data to the new Universal Item Architecture (Phase 3D)"

    def add_arguments(self, parser):
        parser.add_argument('--company', type=str, help='Migrate a specific company by UUID')
        parser.add_argument('--dry-run', action='store_true', help='Report what would happen without making changes')
        parser.add_argument('--resume', action='store_true', help='Resume a previously interrupted migration (idempotent by default)')
        parser.add_argument('--verify', action='store_true', help='Run verification before/after migration')
        parser.add_argument('--verbose', action='store_true', help='Enable verbose output')

    def handle(self, *args, **options):
        self.dry_run = options['dry_run']
        self.verbose = options['verbose']
        company_id = options['company']
        
        self.stats = {
            'Companies': 0,
            'Products': 0,
            'Items Created': 0,
            'Balances Created': 0,
            'Warehouses Created': 0,
            'Stock Movements Updated': 0,
            'Sale Items Linked': 0,
            'Purchase Items Linked': 0,
            'Service Parts Linked': 0,
            'Warnings': 0,
            'Errors': 0
        }

        companies = Company.objects.all()
        if company_id:
            try:
                uuid.UUID(company_id)
                companies = companies.filter(id=company_id)
            except ValueError:
                self.stderr.write(self.style.ERROR("Invalid company UUID"))
                return

        if not companies.exists():
            self.stderr.write(self.style.WARNING("No companies found to migrate."))
            return

        self.stdout.write(f"Starting Phase 3D Migration... (Dry Run: {self.dry_run})")

        for company in companies:
            self.stats['Companies'] += 1
            if self.verbose:
                self.stdout.write(f"Processing company: {company.name} ({company.id})")
            
            try:
                with transaction.atomic():
                    self._migrate_company(company)
                    
                    if self.dry_run:
                        # Rollback everything if it's a dry run
                        raise Exception("DRY_RUN_ROLLBACK")
                        
            except Exception as e:
                if str(e) == "DRY_RUN_ROLLBACK":
                    self.stdout.write(self.style.SUCCESS(f"Dry run for company {company.name} completed successfully."))
                else:
                    self.stats['Errors'] += 1
                    self.stderr.write(self.style.ERROR(f"Error migrating company {company.name}: {e}"))
                    
        self._print_report()

    def _migrate_company(self, company):
        # 1. Default Warehouse Creation
        warehouse = self._get_or_create_default_warehouse(company)
        
        products = Product.objects.filter(company=company)
        self.stats['Products'] += products.count()
        
        # Mapping dict for bridge tables (Product ID -> Item)
        # Note: If resuming, item might already exist. We map using `item_code`
        product_item_map = {}
        
        for product in products:
            item = self._migrate_product_to_item(product)
            product_item_map[product.id] = item
            
            self._migrate_inventory_balance(product, item, warehouse)
            
        # 2. Historical Stock Movement Migration
        self._migrate_stock_movements(company, product_item_map, warehouse)
        
        # 3. Bridge Population
        self._populate_bridges(company, product_item_map)
        
    def _get_or_create_default_warehouse(self, company):
        default_wh = Warehouse.objects.filter(company=company, is_default=True).first()
        if not default_wh:
            warehouses = Warehouse.objects.filter(company=company).order_by('created_at')
            if warehouses.exists():
                default_wh = warehouses.first()
                if not self.dry_run:
                    default_wh.is_default = True
                    default_wh.save(update_fields=['is_default'])
                if self.verbose:
                    self.stdout.write(f"  Marked existing warehouse '{default_wh.name}' as default.")
            else:
                if not self.dry_run:
                    default_wh = Warehouse.objects.create(
                        company=company,
                        name='Main Warehouse',
                        is_default=True,
                        address='Main HQ'
                    )
                else:
                    default_wh = Warehouse(company=company, name='Main Warehouse', is_default=True, address='Main HQ')
                self.stats['Warehouses Created'] += 1
                if self.verbose:
                    self.stdout.write("  Created Main Warehouse.")
        return default_wh

    def _migrate_product_to_item(self, product):
        legacy_code = f"LEGACY-PROD-{product.id}"
        
        # Support Resume Strategy: Look for existing item generated in previous run
        item = Item.objects.filter(company=product.company, item_code=legacy_code).first()
        
        if not item:
            name_parts = [product.brand, product.model_name, product.color, product.storage_capacity]
            item_name = " ".join([p for p in name_parts if p]).strip()
            
            if not self.dry_run:
                # We do not map auto_now_add timestamps (created_at). We just let them be set to now.
                item = Item.objects.create(
                    company=product.company,
                    category=product.category,
                    item_type='PRODUCT',
                    name=item_name,
                    description=product.issues,
                    cost_price=product.cost_price,
                    selling_price=product.sale_price,
                    barcode=product.barcode,
                    sku=product.barcode,
                    brand=product.brand,
                    minimum_stock_level=product.low_stock_threshold,
                    item_code=legacy_code,
                    is_active=True,
                    is_sellable=True,
                    is_purchasable=True,
                    track_inventory=True
                )
                # Force timestamps if necessary, but standard Django `auto_now_add` ignores kwargs.
                Item.objects.filter(id=item.id).update(created_at=product.created_at, updated_at=product.updated_at)
            else:
                item = Item(id=uuid.uuid4(), company=product.company, name=item_name)
                
            self.stats['Items Created'] += 1
        
        return item
        
    def _migrate_inventory_balance(self, product, item, warehouse):
        # Create or update InventoryBalance
        if self.dry_run:
            self.stats['Balances Created'] += 1
            return
            
        balance, created = InventoryBalance.objects.get_or_create(
            item=item,
            warehouse=warehouse,
            defaults={
                'company': product.company,
                'quantity': product.stock_quantity
            }
        )
        if created:
            self.stats['Balances Created'] += 1

    def _migrate_stock_movements(self, company, product_item_map, warehouse):
        # Find movements needing migration
        movements = StockMovement.objects.filter(company=company, item__isnull=True, product__isnull=False)
        count = movements.count()
        if count == 0:
            return
            
        self.stats['Stock Movements Updated'] += count
        
        if self.dry_run:
            return
            
        type_mapping = {
            'IN': 'LEGACY_IN',
            'OUT': 'LEGACY_OUT',
            'ADJUST': 'LEGACY_ADJUST',
        }
        
        # Batch update is tricky with different items. We do one by one or small batches.
        # But we can update using a loop for simplicity and transaction safety.
        for movement in movements:
            item = product_item_map.get(movement.product_id)
            if item:
                # Bypass save() immutability by using update()
                mapped_type = type_mapping.get(movement.movement_type, movement.movement_type)
                StockMovement.objects.filter(id=movement.id).update(
                    item=item,
                    warehouse=warehouse,
                    movement_type=mapped_type
                )
            else:
                self.stats['Warnings'] += 1
                if self.verbose:
                    self.stdout.write(f"  Warning: No mapped item for product ID {movement.product_id}")

    def _populate_bridges(self, company, product_item_map):
        # 1. SaleItem
        sale_items = SaleItem.objects.filter(sale__company=company, item__isnull=True, product__isnull=False)
        self.stats['Sale Items Linked'] += sale_items.count()
        if not self.dry_run:
            for sale_item in sale_items:
                item = product_item_map.get(sale_item.product_id)
                if item:
                    SaleItem.objects.filter(id=sale_item.id).update(item=item)

        # 2. PurchaseOrderItem
        po_items = PurchaseOrderItem.objects.filter(purchase_order__company=company, item__isnull=True, product__isnull=False)
        self.stats['Purchase Items Linked'] += po_items.count()
        if not self.dry_run:
            for po_item in po_items:
                item = product_item_map.get(po_item.product_id)
                if item:
                    PurchaseOrderItem.objects.filter(id=po_item.id).update(item=item)
                    
        # 3. ServicePartUsed
        service_parts = ServicePartUsed.objects.filter(service_order__company=company, item__isnull=True, product__isnull=False, source='inventory')
        self.stats['Service Parts Linked'] += service_parts.count()
        if not self.dry_run:
            for part in service_parts:
                item = product_item_map.get(part.product_id)
                if item:
                    ServicePartUsed.objects.filter(id=part.id).update(item=item)

    def _print_report(self):
        self.stdout.write("\n" + "="*40)
        self.stdout.write("MIGRATION REPORT (Phase 3D)")
        self.stdout.write("="*40)
        
        for key, value in self.stats.items():
            self.stdout.write(f"{key}: {value}")
            
        self.stdout.write("="*40 + "\n")
