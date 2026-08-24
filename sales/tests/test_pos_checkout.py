import decimal
import datetime
from django.test import TestCase
from rest_framework.test import APIClient
from django.urls import reverse
from django.contrib.auth import get_user_model
from rest_framework import status
from companies.models import Company
from platform_core.models import Warehouse, ModuleDefinition, CompanyModule
from inventory.models import Category, Product, Item, InventoryBalance
from sales.models import POSSession, Sale, SaleItem, Customer, CustomerCreditLedger
from finance.models import Journal, JournalEntry, SalesAccountingConfiguration, AccountingPeriod, ChartOfAccount, FiscalYear, AccountGroup, Currency
from crm.models import CRMEntity

User = get_user_model()

class POSCheckoutTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Test Company", is_active=True)
        self.other_company = Company.objects.create(name="Other Company", is_active=True)
        
        self.sales_mod = ModuleDefinition.objects.create(code='sales', name='Sales', is_active=True)
        self.pos_mod = ModuleDefinition.objects.create(code='pos', name='POS', is_active=True)
        CompanyModule.objects.create(company=self.company, module=self.sales_mod, enabled=True)
        CompanyModule.objects.create(company=self.other_company, module=self.sales_mod, enabled=True)
        CompanyModule.objects.create(company=self.company, module=self.pos_mod, enabled=True)
        
        self.user = User.objects.create_user(
            username="cashier", password="password", company=self.company, role='cashier'
        )
        self.other_user = User.objects.create_user(
            username="other_cashier", password="password", company=self.other_company, role='cashier'
        )

        self.warehouse = Warehouse.objects.create(company=self.company, name="Main WH", is_default=True)
        
        self.category = Category.objects.create(company=self.company, name="Electronics")
        self.product1 = Product.objects.create(
            company=self.company, category=self.category,
            brand="Apple", model_name="iPhone 14",
            sale_price=100000, cost_price=80000
        )
        self.product2 = Product.objects.create(
            company=self.company, category=self.category,
            brand="Samsung", model_name="S23",
            sale_price=80000, cost_price=60000
        )
        
        # Items and Balances
        self.item1 = Item.objects.create(company=self.company, category=self.category, name="iPhone 14", item_code=f"LEGACY-PROD-{self.product1.id}", track_inventory=True)
        self.item2 = Item.objects.create(company=self.company, category=self.category, name="S23", item_code=f"LEGACY-PROD-{self.product2.id}", track_inventory=True)
        
        InventoryBalance.objects.create(company=self.company, item=self.item1, warehouse=self.warehouse, quantity=10)
        InventoryBalance.objects.create(company=self.company, item=self.item2, warehouse=self.warehouse, quantity=10)

        self.crm_entity = CRMEntity.objects.create(
            company=self.company,
            name="Alice Smith",
            entity_type='INDIVIDUAL'
        )
        self.customer = Customer.objects.create(
            company=self.company, name="Alice Smith", phone="123456789", crm_entity=self.crm_entity
        )
        self.session = POSSession.objects.create(company=self.company, cashier=self.user, opening_cash=1000, status='OPEN')

        today = datetime.date.today()
        self.fiscal_year = FiscalYear.objects.create(
            company=self.company,
            name="2026",
            start_date=today - datetime.timedelta(days=100),
            end_date=today + datetime.timedelta(days=265),
            is_current=True
        )
        self.period = AccountingPeriod.objects.create(
            company=self.company,
            fiscal_year=self.fiscal_year,
            month=today.month,
            start_date=today - datetime.timedelta(days=30),
            end_date=today + datetime.timedelta(days=335),
            status='OPEN'
        )
        
        self.asset_group = AccountGroup.objects.create(company=self.company, name="Assets", group_type="ASSET")
        self.revenue_group = AccountGroup.objects.create(company=self.company, name="Revenue", group_type="REVENUE")
        
        self.cash_account = ChartOfAccount.objects.create(
            company=self.company, account_group=self.asset_group, account_code="CASH", account_name="Cash", account_type='ASSET'
        )
        self.sales_revenue_account = ChartOfAccount.objects.create(
            company=self.company, account_group=self.revenue_group, account_code="REV", account_name="Sales Revenue", account_type='REVENUE'
        )
        self.ar_account = ChartOfAccount.objects.create(
            company=self.company, account_group=self.asset_group, account_code="AR", account_name="Accounts Receivable", account_type='ASSET'
        )
        self.currency = Currency.objects.create(
            company=self.company, code="USD", name="US Dollar", symbol="$", is_base_currency=True
        )
        self.sales_config = SalesAccountingConfiguration.objects.create(
            company=self.company,
            default_currency=self.currency,
            cash_account=self.cash_account,
            accounts_receivable_account=self.ar_account,
            sales_revenue_account=self.sales_revenue_account,
            is_active=True
        )

        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_successful_atomic_checkout(self):
        payload = {
            "subtotal": 280000,
            "total_amount": 280000,
            "received_amount": 280000,
            "payment_method": "cash",
            "customer": self.customer.id,
            "lines": [
                {"product": self.product1.id, "quantity": 2, "unit_price": 100000},
                {"product": self.product2.id, "quantity": 1, "unit_price": 80000}
            ]
        }
        response = self.client.post('/api/sales/sales/checkout/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        sale = Sale.objects.get(id=response.data['id'])
        self.assertEqual(sale.total_amount, 280000)
        self.assertEqual(sale.profit, (2 * (100000 - 80000)) + (1 * (80000 - 60000)))  # 40k + 20k = 60k
        
        self.assertEqual(sale.items.count(), 2)
        
        self.item1.refresh_from_db()
        bal1 = InventoryBalance.objects.get(item=self.item1)
        self.assertEqual(bal1.quantity, 8)
        
        bal2 = InventoryBalance.objects.get(item=self.item2)
        self.assertEqual(bal2.quantity, 9)

        self.assertIsNotNone(sale.journal_entry)
        self.assertEqual(sale.journal_entry.source_document_id, sale.id)

    def test_insufficient_stock_rollback(self):
        payload = {
            "subtotal": 1200000,
            "total_amount": 1200000,
            "received_amount": 1200000,
            "payment_method": "cash",
            "customer": self.customer.id,
            "lines": [
                {"product": self.product1.id, "quantity": 2, "unit_price": 100000},
                {"product": self.product2.id, "quantity": 11, "unit_price": 80000}  # stock is 10
            ]
        }
        response = self.client.post('/api/sales/sales/checkout/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        
        self.assertEqual(Sale.objects.count(), 0)
        bal2 = InventoryBalance.objects.get(item=self.item2)
        self.assertEqual(bal2.quantity, 10)
        bal1 = InventoryBalance.objects.get(item=self.item1)
        self.assertEqual(bal1.quantity, 10)

    def test_invalid_payment_rollback(self):
        payload = {
            "subtotal": 100000,
            "total_amount": 100000,
            "received_amount": 90000,
            "payment_method": "cash",
            "customer": self.customer.id,
            "lines": [
                {"product": self.product1.id, "quantity": 1, "unit_price": 100000}
            ]
        }
        response = self.client.post('/api/sales/sales/checkout/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Sale.objects.count(), 0)

    def test_tenant_isolation(self):
        other_product = Product.objects.create(
            company=self.other_company, brand="Sony", model_name="PS5", sale_price=50000, cost_price=40000
        )
        payload = {
            "subtotal": 50000,
            "total_amount": 50000,
            "received_amount": 50000,
            "payment_method": "cash",
            "customer": self.customer.id,
            "lines": [
                {"product": other_product.id, "quantity": 1, "unit_price": 50000}
            ]
        }
        response = self.client.post('/api/sales/sales/checkout/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('not found', str(response.data).lower())

    def test_empty_lines(self):
        payload = {
            "subtotal": 100000,
            "total_amount": 100000,
            "received_amount": 100000,
            "payment_method": "cash",
            "customer": self.customer.id,
            "lines": []
        }
        response = self.client.post('/api/sales/sales/checkout/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("no items", str(response.data).lower())

    def test_credit_sale_without_customer(self):
        payload = {
            "subtotal": 100000,
            "total_amount": 100000,
            "received_amount": 0,
            "payment_method": "credit",
            "lines": [
                {"product": self.product1.id, "quantity": 1, "unit_price": 100000}
            ]
        }
        response = self.client.post('/api/sales/sales/checkout/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("linked customer", str(response.data).lower())

    def test_credit_sale_success(self):
        payload = {
            "subtotal": 100000,
            "total_amount": 100000,
            "received_amount": 0,
            "payment_method": "credit",
            "customer": self.customer.id,
            "lines": [
                {"product": self.product1.id, "quantity": 1, "unit_price": 100000}
            ]
        }
        response = self.client.post('/api/sales/sales/checkout/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        sale = Sale.objects.get(id=response.data['id'])
        self.assertEqual(sale.customer_id, self.customer.id)
        
        ledger_entry = CustomerCreditLedger.objects.get(sale=sale)
        self.assertEqual(ledger_entry.amount, 100000)
        self.assertEqual(ledger_entry.transaction_type, 'DEBIT')

        self.customer.refresh_from_db()
        self.assertEqual(self.customer.balance, 100000)
        
    def test_legacy_apis_remain_functional(self):
        payload = {
            "subtotal": 100000,
            "total_amount": 100000,
            "received_amount": 100000,
            "payment_method": "cash",
            "customer": self.customer.id
        }
        response = self.client.post('/api/sales/sales/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        sale_id = response.data['id']
        
        item_payload = {
            "sale": sale_id,
            "product": self.product1.id,
            "quantity": 1,
            "unit_price": 100000
        }
        item_response = self.client.post('/api/sales/saleitems/', item_payload, format='json')
        self.assertEqual(item_response.status_code, status.HTTP_201_CREATED)
        
        sale = Sale.objects.get(id=sale_id)
        self.assertEqual(sale.profit, 20000)

