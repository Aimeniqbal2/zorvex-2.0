from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.core.exceptions import ValidationError
from platform_core.models import ModuleDefinition, CompanyModule, Warehouse
from companies.models import Company
from inventory.models import Category, Item, InventoryBalance, ItemSerial
from decimal import Decimal
from rest_framework_simplejwt.tokens import RefreshToken
from subscriptions.models import CompanySubscription, SubscriptionPlan
from datetime import date, timedelta

User = get_user_model()

class Phase3AInventoryTests(APITestCase):
    def setUp(self):
        self.company1 = Company.objects.create(name="Company 1")
        self.company2 = Company.objects.create(name="Company 2")
        
        self.inventory_module = ModuleDefinition.objects.get_or_create(code='inventory', defaults={'name': 'Inventory', 'is_active': True})[0]
        CompanyModule.objects.create(company=self.company1, module=self.inventory_module, enabled=True)
        CompanyModule.objects.create(company=self.company2, module=self.inventory_module, enabled=True)
        
        self.admin1 = User.objects.create_user(username="admin1", email="admin1@test.com", company=self.company1, role="admin", password="password")
        self.admin2 = User.objects.create_user(username="admin2", email="admin2@test.com", company=self.company2, role="admin", password="password")
        self.superadmin = User.objects.create_superuser(username="superadmin", email="super@test.com", password="password")
        self.staff1 = User.objects.create_user(username="staff1", email="staff1@test.com", company=self.company1, role="staff", password="password")
        
        plan = SubscriptionPlan.objects.create(name="Pro", price=100.0)
        today = date.today()
        CompanySubscription.objects.create(company=self.company1, plan=plan, start_date=today, end_date=today + timedelta(days=30), is_active=True)
        CompanySubscription.objects.create(company=self.company2, plan=plan, start_date=today, end_date=today + timedelta(days=30), is_active=True)

        self.category1 = Category.objects.create(company=self.company1, name="Electronics")
        self.wh1 = Warehouse.objects.create(company=self.company1, name="WH1", code="WH-1", is_default=True)
        self.wh2 = Warehouse.objects.create(company=self.company2, name="WH2", code="WH-2", is_default=True)

    def test_warehouse_is_default_logic(self):
        wh_extra = Warehouse.objects.create(company=self.company1, name="Extra WH", code="WH-3", is_default=True)
        self.wh1.refresh_from_db()
        self.assertFalse(self.wh1.is_default)
        self.assertTrue(wh_extra.is_default)

    def test_item_creation(self):
        item = Item.objects.create(
            company=self.company1,
            name="Laptop",
            sku="LPT-001",
            item_code="C-LPT-001",
            barcode="123456789",
            cost_price=Decimal("1000.00"),
            selling_price=Decimal("1500.00")
        )
        self.assertEqual(item.name, "Laptop")
        self.assertEqual(item.sku, "LPT-001")

    def test_item_duplicate_sku(self):
        Item.objects.create(company=self.company1, name="Item 1", sku="SKU1")
        with self.assertRaises(IntegrityError):
            Item.objects.create(company=self.company1, name="Item 2", sku="SKU1")

    def test_item_cross_company_sku(self):
        Item.objects.create(company=self.company1, name="Item 1", sku="SKU1")
        # Should not raise
        item2 = Item.objects.create(company=self.company2, name="Item 2", sku="SKU1")
        self.assertEqual(item2.sku, "SKU1")

    def test_inventory_balance_cross_company_validation(self):
        item = Item.objects.create(company=self.company1, name="Item 1", sku="SKU1")
        ib = InventoryBalance(company=self.company1, item=item, warehouse=self.wh2, quantity=Decimal("10.00"))
        with self.assertRaises(ValidationError):
            ib.save()

    def test_item_serial_duplicate(self):
        item = Item.objects.create(company=self.company1, name="Item 1", sku="SKU1")
        ItemSerial.objects.create(company=self.company1, item=item, warehouse=self.wh1, serial_number="SN1")
        with self.assertRaises(IntegrityError):
            ItemSerial.objects.create(company=self.company1, item=item, warehouse=self.wh1, serial_number="SN1")

    def test_item_serial_cross_company_validation(self):
        item = Item.objects.create(company=self.company1, name="Item 1", sku="SKU1")
        # Trying to put company 1 item in company 2 warehouse
        serial = ItemSerial(company=self.company1, item=item, warehouse=self.wh2, serial_number="SN1")
        with self.assertRaises(ValidationError):
            serial.save()

    # API Tests
    def test_item_api_crud(self):
        token = RefreshToken.for_user(self.admin1)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        data = {
            "name": "Mouse",
            "sku": "MSE-01",
            "item_type": "PRODUCT",
            "cost_price": "10.00",
            "selling_price": "20.00"
        }
        res = self.client.post("/api/inventory/items/", data)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        item_id = res.data['id']
        
        # Verify read
        res = self.client.get(f"/api/inventory/items/{item_id}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        
        # Update
        res = self.client.patch(f"/api/inventory/items/{item_id}/", {"selling_price": "25.00"})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['selling_price'], "25.00")
        
        # Delete
        res = self.client.delete(f"/api/inventory/items/{item_id}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_inventory_balance_api(self):
        item = Item.objects.create(company=self.company1, name="Test")
        token = RefreshToken.for_user(self.admin1)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        data = {
            "item": str(item.id),
            "warehouse": str(self.wh1.id),
            "quantity": "50.50"
        }
        res = self.client.post("/api/inventory/inventory-balances/", data)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['quantity'], "50.50")

    def test_api_tenant_isolation(self):
        item = Item.objects.create(company=self.company1, name="Company 1 Item")
        token = RefreshToken.for_user(self.admin2)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        res = self.client.get("/api/inventory/items/")
        self.assertEqual(len(res.data), 0)

    def test_superadmin_with_context(self):
        token = RefreshToken.for_user(self.superadmin)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        self.client.defaults['HTTP_X_COMPANY_ID'] = str(self.company1.id)
        data = {
            "name": "Super Item",
            "sku": "SUP-01"
        }
        res = self.client.post("/api/inventory/items/", data)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_superadmin_without_context(self):
        token = RefreshToken.for_user(self.superadmin)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        data = {
            "name": "Super Item",
            "sku": "SUP-01"
        }
        res = self.client.post("/api/inventory/items/", data)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Company context is required for this operation.", str(res.data))

    def test_normal_user_spoof_attempt(self):
        token = RefreshToken.for_user(self.admin1)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        self.client.defaults['HTTP_X_COMPANY_ID'] = str(self.company2.id) # Try to spoof
        data = {
            "name": "Spoof Item",
            "sku": "SPOOF-01"
        }
        res = self.client.post("/api/inventory/items/", data)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        
        # Verify it was created in company1 despite spoof attempt
        item = Item.objects.get(id=res.data['id'])
        self.assertEqual(item.company_id, self.company1.id)

    def test_module_disabled(self):
        CompanyModule.objects.filter(company=self.company1, module=self.inventory_module).update(enabled=False)
        token = RefreshToken.for_user(self.admin1)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        res = self.client.get("/api/inventory/items/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
