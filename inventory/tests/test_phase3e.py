import logging
from decimal import Decimal
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from companies.models import Company
from platform_core.models import Branch, Warehouse
from inventory.models import Category, Product, Item, InventoryBalance, ItemSerial
from inventory.services import transaction_service, transfer_service
from inventory.services.compatibility import resolve_item_from_product
from sales.models import Sale, SaleItem, POSSession, Customer
from services.models import ServiceOrder, ServicePartUsed
from inventory.services.exceptions import NegativeStockException, WarehouseMismatchException

User = get_user_model()
logging.disable(logging.CRITICAL)

class Phase3ECutoverTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.company = Company.objects.create(
            name="TechCorp", 
            business_type="retail"
        )
        self.company2 = Company.objects.create(name="OtherCorp", business_type="retail")
        
        from platform_core.models import ModuleDefinition, CompanyModule
        for code in ["inventory", "sales", "purchasing", "services"]:
            mod, _ = ModuleDefinition.objects.get_or_create(code=code, defaults={"name": code})
            CompanyModule.objects.create(company=self.company, module=mod, enabled=True)
        
        self.branch = Branch.objects.create(company=self.company, name="Main Branch", address="Downtown")
        
        self.admin = User.objects.create_user(
            username="admin", password="password", company=self.company, role="admin"
        )
        self.client.force_authenticate(user=self.admin)
        
        # Warehouses
        self.warehouse = Warehouse.objects.create(
            company=self.company, branch=self.branch, name="Main WH", code="M1", is_default=True
        )
        self.warehouse2 = Warehouse.objects.create(
            company=self.company, branch=self.branch, name="Back WH", code="B1"
        )
        self.other_warehouse = Warehouse.objects.create(
            company=self.company2, name="Other WH", code="O1", is_default=True
        )
        
        self.category = Category.objects.create(company=self.company, name="Phones")
        
        # Legacy Product (Migrated to Item behind the scenes via our mock migration steps)
        self.product = Product.objects.create(
            company=self.company,
            category=self.category,
            brand="Apple",
            model_name="iPhone 14",
            stock_quantity=0,
            cost_price=Decimal("800.00"),
            sale_price=Decimal("1000.00")
        )
        
        # Simulate Migration manually for tests
        self.item = Item.objects.create(
            company=self.company,
            item_code=f"LEGACY-PROD-{self.product.id}",
            name=f"{self.product.brand} {self.product.model_name}",
            track_inventory=True,
            track_serial_number=True
        )
        
        # Set an opening balance of 10
        transaction_service.process_transaction(
            company=self.company,
            item=self.item,
            warehouse=self.warehouse,
            movement_type='OPENING_BALANCE',
            quantity=10,
            reference="OPEN",
            notes="Initial stock",
            serial_numbers=[f"SN-{i}" for i in range(1, 11)]
        )

    def test_pos_checkout_stock_deduction(self):
        """Test POS checkout uses Inventory Service and creates an immutable movement."""
        session = POSSession.objects.create(company=self.company, cashier=self.admin, status='OPEN', opening_cash=0)
        
        url = '/api/sales/sales/'
        data = {
            'pos_session': session.id,
            'payment_method': 'cash',
            'received_amount': 2000,
            'total_amount': 2000,
            'subtotal': 2000,
            'status': 'COMPLETED'
        }
        res = self.client.post(url, data, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        
        sale_id = res.data['id']
        
        item_data = {
            'sale': sale_id,
            'product': self.product.id,
            'quantity': 2,
            'unit_price': 1000
        }
        res_item = self.client.post('/api/sales/saleitems/', item_data, format='json')
        self.assertEqual(res_item.status_code, status.HTTP_201_CREATED, res_item.data)

        # Let's use a non-serialized item for POS checkout.
        product_noserial = Product.objects.create(
            company=self.company,
            brand="Brand",
            model_name="Acc",
            stock_quantity=0,
            sale_price=Decimal("50.00")
        )
        item_noserial = Item.objects.create(
            company=self.company,
            item_code=f"LEGACY-PROD-{product_noserial.id}",
            name="Accessory",
            track_inventory=True,
            track_serial_number=False
        )
        transaction_service.process_transaction(
            company=self.company,
            item=item_noserial,
            warehouse=self.warehouse,
            movement_type='OPENING_BALANCE',
            quantity=10
        )
        data2 = {
            'pos_session': session.id,
            'payment_method': 'cash',
            'received_amount': 100,
            'total_amount': 100,
            'subtotal': 100,
            'status': 'COMPLETED'
        }
        res2 = self.client.post(url, data2, format='json')
        self.assertEqual(res2.status_code, status.HTTP_201_CREATED, res2.data)
        sale_id2 = res2.data['id']
        
        item_data2 = {
            'sale': sale_id2,
            'product': product_noserial.id,
            'quantity': 2,
            'unit_price': 50
        }
        res_item2 = self.client.post('/api/sales/saleitems/', item_data2, format='json')
        self.assertEqual(res_item2.status_code, status.HTTP_201_CREATED, res_item2.data)
        
        # Check stock deduction
        bal = InventoryBalance.objects.get(item=item_noserial, warehouse=self.warehouse)
        self.assertEqual(bal.quantity, Decimal('8.00'))

    def test_immutable_ledger_api(self):
        """Test StockMovement API is read-only."""
        res = self.client.post('/api/inventory/stockmovements/', {
            'product': self.product.id,
            'quantity': 10,
            'movement_type': 'IN'
        })
        self.assertEqual(res.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        
    def test_warehouse_mismatch_isolation(self):
        """Ensure cross-company transfers/updates fail."""
        with self.assertRaises(WarehouseMismatchException):
            transaction_service.process_transaction(
                company=self.company,
                item=self.item,
                warehouse=self.other_warehouse,
                movement_type='IN',
                quantity=1
            )
            
    def test_decimal_quantities(self):
        """Ensure transactions support decimal quantities."""
        item_decimal = Item.objects.create(
            company=self.company,
            item_code="DECIMAL-ITEM",
            name="Flour",
            track_inventory=True,
            track_serial_number=False
        )
        transaction_service.process_transaction(
            company=self.company,
            item=item_decimal,
            warehouse=self.warehouse,
            movement_type='OPENING_BALANCE',
            quantity=Decimal("5.50")
        )
        bal = InventoryBalance.objects.get(item=item_decimal)
        self.assertEqual(bal.quantity, Decimal("5.50"))
        
    def test_track_inventory_false(self):
        """Ensure track_inventory=False bypasses inventory balance updates."""
        item_notrack = Item.objects.create(
            company=self.company,
            item_code="NO-TRACK",
            name="Service",
            track_inventory=False
        )
        # Should not throw exception and should return None
        res = transaction_service.process_transaction(
            company=self.company,
            item=item_notrack,
            warehouse=self.warehouse,
            movement_type='SALE',
            quantity=1
        )
        self.assertIsNone(res)
        self.assertFalse(InventoryBalance.objects.filter(item=item_notrack).exists())
