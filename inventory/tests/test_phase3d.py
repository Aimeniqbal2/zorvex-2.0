import uuid
from decimal import Decimal
from django.test import TransactionTestCase
from django.core.management import call_command
from django.utils.crypto import get_random_string
from io import StringIO
from inventory.models import Product, Item, InventoryBalance, StockMovement, PurchaseOrder, PurchaseOrderItem
from sales.models import Sale, SaleItem
from services.models import ServiceOrder, ServicePartUsed
from platform_core.models import Warehouse
from companies.models import Company
from django.contrib.auth import get_user_model

User = get_user_model()

class Phase3DMigrationTests(TransactionTestCase):
    def setUp(self):
        # Company 1
        self.company1 = Company.objects.create(name="MigrateC1")
        self.wh1 = Warehouse.objects.create(company=self.company1, name="WH1", is_default=True)
        
        # Product 1
        self.p1 = Product.objects.create(
            company=self.company1, brand="Apple", model_name="iPhone", color="Black",
            storage_capacity="128GB", stock_quantity=10, cost_price=Decimal("100"), sale_price=Decimal("200")
        )
        
        # Movement 1
        self.sm1 = StockMovement.objects.create(
            company=self.company1, product=self.p1, quantity=10, movement_type='IN'
        )

        # Sales
        self.user = User.objects.create_user(username="testuser", password="pwd")
        self.sale1 = Sale.objects.create(company=self.company1, cashier=self.user)
        self.sale_item1 = SaleItem.objects.create(company=self.company1, sale=self.sale1, product=self.p1, quantity=1, unit_price=Decimal("200"))
        
        # Company 2 (No Warehouse initially)
        self.company2 = Company.objects.create(name="MigrateC2")
        self.p2 = Product.objects.create(
            company=self.company2, brand="Samsung", model_name="S23", stock_quantity=5
        )

    def test_dry_run(self):
        out = StringIO()
        call_command('migrate_inventory_to_items', dry_run=True, stdout=out)
        output = out.getvalue()
        
        # Check that no items were created
        self.assertEqual(Item.objects.count(), 0)
        self.assertEqual(InventoryBalance.objects.count(), 0)
        
        # Check reporting
        self.assertIn("Dry Run: True", output)
        self.assertIn("Items Created: 2", output)
        self.assertIn("Warehouses Created: 1", output) # C2 needs a warehouse
        
    def test_warehouse_creation(self):
        call_command('migrate_inventory_to_items')
        
        # C2 should now have a default warehouse
        wh2 = Warehouse.objects.filter(company=self.company2, is_default=True)
        self.assertTrue(wh2.exists())
        self.assertEqual(wh2.first().name, "Main Warehouse")

    def test_product_mapping(self):
        call_command('migrate_inventory_to_items')
        
        item1 = Item.objects.get(item_code=f"LEGACY-PROD-{self.p1.id}")
        self.assertEqual(item1.name, "Apple iPhone Black 128GB")
        self.assertEqual(item1.cost_price, self.p1.cost_price)
        self.assertEqual(item1.selling_price, self.p1.sale_price)
        self.assertEqual(item1.company, self.company1)
        
        item2 = Item.objects.get(item_code=f"LEGACY-PROD-{self.p2.id}")
        self.assertEqual(item2.name, "Samsung S23")
        self.assertEqual(item2.company, self.company2)

    def test_bridge_population_and_stock_movements(self):
        call_command('migrate_inventory_to_items')
        
        # Bridge
        self.sale_item1.refresh_from_db()
        self.assertIsNotNone(self.sale_item1.item)
        self.assertEqual(self.sale_item1.item.item_code, f"LEGACY-PROD-{self.p1.id}")
        
        # Movement
        self.sm1.refresh_from_db()
        self.assertIsNotNone(self.sm1.item)
        self.assertEqual(self.sm1.movement_type, 'LEGACY_IN')
        self.assertEqual(self.sm1.warehouse, self.wh1)

    def test_idempotency_and_resume(self):
        call_command('migrate_inventory_to_items')
        initial_items = Item.objects.count()
        initial_balances = InventoryBalance.objects.count()
        
        # Add another sale item pointing to the same product but missing the item
        sale_item2 = SaleItem.objects.create(company=self.company1, sale=self.sale1, product=self.p1, quantity=1, unit_price=Decimal("200"))
        
        # Run again
        call_command('migrate_inventory_to_items', resume=True)
        
        # Items and Balances should NOT duplicate
        self.assertEqual(Item.objects.count(), initial_items)
        self.assertEqual(InventoryBalance.objects.count(), initial_balances)
        
        # But the new sale item should be bridged
        sale_item2.refresh_from_db()
        self.assertIsNotNone(sale_item2.item)
        self.assertEqual(sale_item2.item.item_code, f"LEGACY-PROD-{self.p1.id}")

    def test_verification_healthy(self):
        call_command('migrate_inventory_to_items')
        out = StringIO()
        call_command('verify_inventory_migration', stdout=out)
        output = out.getvalue()
        
        self.assertIn("All verification checks passed successfully!", output)

    def test_verification_broken(self):
        call_command('migrate_inventory_to_items')
        
        # Break something
        InventoryBalance.objects.all().update(quantity=0)
        
        out = StringIO()
        call_command('verify_inventory_migration', stdout=out)
        output = out.getvalue()
        
        self.assertIn("Verification failed with the following errors", output)
        self.assertIn("Items have total InventoryBalance different from Product.stock_quantity", output)

    def test_rollback(self):
        call_command('migrate_inventory_to_items')
        self.assertEqual(Item.objects.count(), 2)
        
        call_command('rollback_inventory_migration', confirm=True)
        
        self.assertEqual(Item.objects.count(), 0)
        self.assertEqual(InventoryBalance.objects.count(), 0)
        
        self.sale_item1.refresh_from_db()
        self.assertIsNone(self.sale_item1.item)
        
        self.sm1.refresh_from_db()
        self.assertIsNone(self.sm1.item)
        self.assertEqual(self.sm1.movement_type, 'IN')  # Reverted type
        
    def test_tenant_isolation(self):
        call_command('migrate_inventory_to_items')
        
        item1 = Item.objects.get(item_code=f"LEGACY-PROD-{self.p1.id}")
        
        # Attempt to break isolation manually and see if validation catches it (from 3C)
        self.sale_item1.refresh_from_db()
        
        # Wait, if we manually try to link item1 (C1) to p2 (C2)...
        item2 = Item.objects.get(item_code=f"LEGACY-PROD-{self.p2.id}")
        self.sale_item1.item = item2
        
        from django.core.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            self.sale_item1.clean()
