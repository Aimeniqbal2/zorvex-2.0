from rest_framework.test import APITestCase, APIClient
from rest_framework import status
from django.contrib.auth import get_user_model
from companies.models import Company
from inventory.models import Product, Item, InventoryBalance
from platform_core.models import Warehouse
import decimal

User = get_user_model()

class InventoryKPIsEndpointTest(APITestCase):
    def setUp(self):
        from platform_core.models import ModuleDefinition, CompanyModule
        
        # Setup Modules
        mod, _ = ModuleDefinition.objects.get_or_create(code='inventory', defaults={'name': 'Inventory'})
        
        # Create Companies
        self.company_a = Company.objects.create(name="Company A")
        self.company_b = Company.objects.create(name="Company B")
        
        CompanyModule.objects.create(company=self.company_a, module=mod, enabled=True)
        CompanyModule.objects.create(company=self.company_b, module=mod, enabled=True)
        
        # Create Users
        self.manager_a = User.objects.create_user(
            username="manager_a", password="password123",
            company=self.company_a, role="manager"
        )
        self.staff_a = User.objects.create_user(
            username="staff_a", password="password123",
            company=self.company_a, role="staff"
        )
        self.customer_a = User.objects.create_user(
            username="customer_a", password="password123",
            company=self.company_a, role="customer"
        )
        self.manager_b = User.objects.create_user(
            username="manager_b", password="password123",
            company=self.company_b, role="manager"
        )
        
        # Setup API Client
        self.client = APIClient()

    def test_kpis_empty_tenant(self):
        self.client.force_authenticate(user=self.manager_a)
        response = self.client.get('/api/inventory/products/kpis/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        data = response.json()
        self.assertEqual(data['total_active_skus'], 0)
        self.assertEqual(data['calculated_asset_value'], 0.0)
        self.assertEqual(data['hardware_shortages'], 0)

    def test_kpis_correct_calculation_and_tenant_isolation(self):
        # Company A Products
        p1 = Product.objects.create(
            company=self.company_a, brand="A", model_name="M1", 
            cost_price=decimal.Decimal('10.50'), stock_quantity=10, low_stock_threshold=5
        )
        p2 = Product.objects.create(
            company=self.company_a, brand="A", model_name="M2", 
            cost_price=decimal.Decimal('20.00'), stock_quantity=2, low_stock_threshold=5
        )
        
        # Company B Products
        p3 = Product.objects.create(
            company=self.company_b, brand="B", model_name="M3", 
            cost_price=decimal.Decimal('100.00'), stock_quantity=10, low_stock_threshold=5
        )
        
        # Check Company A
        self.client.force_authenticate(user=self.manager_a)
        response_a = self.client.get('/api/inventory/products/kpis/')
        if response_a.status_code != 200:
            print(f"Company A Error: {response_a.content}")
        self.assertEqual(response_a.status_code, status.HTTP_200_OK)
        data_a = response_a.json()
        
        self.assertEqual(data_a['total_active_skus'], 2)
        self.assertEqual(data_a['calculated_asset_value'], 145.0) # (10.50 * 10) + (20.00 * 2) = 105 + 40 = 145
        self.assertEqual(data_a['hardware_shortages'], 1) # p2 is <= 5
        
        # Check Company B
        self.client.force_authenticate(user=self.manager_b)
        response_b = self.client.get('/api/inventory/products/kpis/')
        self.assertEqual(response_b.status_code, status.HTTP_200_OK)
        data_b = response_b.json()
        
        self.assertEqual(data_b['total_active_skus'], 1)
        self.assertEqual(data_b['calculated_asset_value'], 1000.0)
        self.assertEqual(data_b['hardware_shortages'], 0)

    def test_kpis_with_item_architecture_overrides(self):
        # Product mapped to Item logic
        p1 = Product.objects.create(
            company=self.company_a, brand="A", model_name="M1", 
            cost_price=decimal.Decimal('10.00'), stock_quantity=0, low_stock_threshold=5
        )
        
        # Create corresponding Item and InventoryBalance
        item = Item.objects.create(
            company=self.company_a, name="M1", item_code=f"LEGACY-PROD-{p1.id}"
        )
        warehouse = Warehouse.objects.create(company=self.company_a, name="Main")
        InventoryBalance.objects.create(
            company=self.company_a, item=item, warehouse=warehouse, quantity=decimal.Decimal('15.00')
        )
        
        self.client.force_authenticate(user=self.manager_a)
        response = self.client.get('/api/inventory/products/kpis/')
        data = response.json()
        
        self.assertEqual(data['total_active_skus'], 1)
        # Should use the annotated balance of 15, not stock_quantity of 0
        self.assertEqual(data['calculated_asset_value'], 150.0)
        self.assertEqual(data['hardware_shortages'], 0)

    def test_kpis_rbac_permissions(self):
        # Staff (allowed read)
        self.client.force_authenticate(user=self.staff_a)
        response = self.client.get('/api/inventory/products/kpis/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Customer (not allowed read)
        self.client.force_authenticate(user=self.customer_a)
        response2 = self.client.get('/api/inventory/products/kpis/')
        self.assertEqual(response2.status_code, status.HTTP_403_FORBIDDEN)
