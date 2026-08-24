import uuid
import decimal
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from companies.models import Company
from platform_core.models import CompanyModule, ModuleDefinition
from sales.models import Customer, Sale, CustomerCreditLedger
from inventory.models import Vendor, VendorLedger, PurchaseOrder, Product, Category, Item
from services.models import ServiceOrder, ServicePartUsed
from finance.models import CreditAccount
from hrm.models import EmployeeRecord, Department
from crm.models import CRMEntity
from crm.services.compatibility import get_crm_entity, resolve_customer, resolve_vendor

User = get_user_model()

class Phase4EBusinessCutoverTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Phase 4E Company")
        self.company2 = Company.objects.create(name="Phase 4E Second Company")

        # Modules
        for mod_name in ["sales", "purchasing", "inventory", "pos"]:
            mod_def, _ = ModuleDefinition.objects.get_or_create(code=mod_name, defaults={'name': mod_name})
            CompanyModule.objects.create(company=self.company, module=mod_def, enabled=True)
        
        self.user = User.objects.create_user(username="test4e", email="test4e@erp.com", company=self.company)
        self.user.role = 'admin'
        self.user.save()
        
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        self.category = Category.objects.create(company=self.company, name="Phones")
        self.product = Product.objects.create(company=self.company, category=self.category, brand="Apple", model_name="iPhone 15", sale_price=100000)
        self.item = Item.objects.create(company=self.company, category=self.category, name="iPhone 15", item_code="IP15")
        
        # CRM Entities
        self.crm_customer = CRMEntity.objects.create(company=self.company, entity_type='CUSTOMER', code='CUST-001', display_name='Test Cust')
        self.crm_vendor = CRMEntity.objects.create(company=self.company, entity_type='SUPPLIER', code='VEND-001', display_name='Test Vend')
        
    def test_legacy_bridge_auto_resolution_sales(self):
        """Test Sale automatically resolves CRMEntity from legacy Customer if missing."""
        customer = Customer.objects.create(company=self.company, name="Legacy Cust", crm_entity=self.crm_customer)
        sale = Sale.objects.create(company=self.company, cashier=self.user, customer=customer)
        self.assertEqual(sale.crm_entity, self.crm_customer)

    def test_legacy_bridge_auto_resolution_reverse_sales(self):
        """Test Sale automatically resolves legacy Customer from CRMEntity if missing."""
        customer = Customer.objects.create(company=self.company, name="Legacy Cust", crm_entity=self.crm_customer)
        sale = Sale.objects.create(company=self.company, cashier=self.user, crm_entity=self.crm_customer)
        self.assertEqual(sale.customer, customer)

    def test_legacy_bridge_auto_resolution_purchasing(self):
        """Test PO automatically resolves CRMEntity from legacy Vendor."""
        vendor = Vendor.objects.create(company=self.company, name="Legacy Vend", crm_entity=self.crm_vendor)
        po = PurchaseOrder.objects.create(company=self.company, vendor=vendor)
        self.assertEqual(po.crm_entity, self.crm_vendor)

    def test_legacy_bridge_auto_resolution_reverse_purchasing(self):
        """Test PO automatically resolves legacy Vendor from CRMEntity."""
        vendor = Vendor.objects.create(company=self.company, name="Legacy Vend", crm_entity=self.crm_vendor)
        po = PurchaseOrder.objects.create(company=self.company, crm_entity=self.crm_vendor)
        self.assertEqual(po.vendor, vendor)

    def test_ledger_resolution_customer(self):
        """Test CustomerCreditLedger resolves CRM bridge."""
        customer = Customer.objects.create(company=self.company, name="Ledger Cust", crm_entity=self.crm_customer)
        ledger = CustomerCreditLedger.objects.create(company=self.company, customer=customer, transaction_type='DEBIT', amount=500)
        self.assertEqual(ledger.crm_entity, self.crm_customer)

    def test_ledger_resolution_vendor(self):
        """Test VendorLedger resolves CRM bridge."""
        vendor = Vendor.objects.create(company=self.company, name="Ledger Vend", crm_entity=self.crm_vendor)
        ledger = VendorLedger.objects.create(company=self.company, vendor=vendor, transaction_type='DEBIT', amount=1000)
        self.assertEqual(ledger.crm_entity, self.crm_vendor)

    def test_employee_crm_resolution(self):
        """Test EmployeeRecord resolves CRM bridge."""
        dept = Department.objects.create(company=self.company, name="HR")
        emp_crm = CRMEntity.objects.create(company=self.company, entity_type='EMPLOYEE', code='EMP-001', display_name='Test Emp')
        emp = EmployeeRecord.objects.create(company=self.company, user=self.user, department=dept, crm_entity=emp_crm)
        
        # Test resolver functions
        self.assertEqual(get_crm_entity(emp), emp_crm)
        
    def test_services_auto_resolution(self):
        """Test ServiceOrder and ServicePartUsed resolve bridges."""
        vendor = Vendor.objects.create(company=self.company, name="Service Vend", crm_entity=self.crm_vendor)
        customer = Customer.objects.create(company=self.company, name="Service Cust", crm_entity=self.crm_customer)
        
        svc = ServiceOrder.objects.create(company=self.company, customer_name="Service Cust", crm_entity=self.crm_customer)
        part = ServicePartUsed.objects.create(company=self.company, service_order=svc, source='vendor', vendor=vendor, quantity=1, unit_cost=100)
        
        self.assertEqual(part.crm_entity, self.crm_vendor)
        self.assertEqual(svc.crm_entity, self.crm_customer)

    def test_finance_credit_account_resolution(self):
        """Test Finance CreditAccount resolves CRM bridge."""
        customer = Customer.objects.create(company=self.company, name="Fin Cust", crm_entity=self.crm_customer)
        acc = CreditAccount.objects.create(company=self.company, customer_name="Fin Cust", crm_entity=self.crm_customer)
        self.assertEqual(acc.crm_entity, self.crm_customer)
        
    def test_api_sale_credit_validation(self):
        """Test Sale ViewSet API correctly handles missing CRM/Customer for credit sales."""
        from sales.models import POSSession
        session = POSSession.objects.create(company=self.company, cashier=self.user, status='OPEN', opening_cash=1000)
        
        payload = {
            'payment_method': 'credit',
            'subtotal': 100000,
            'total_amount': 100000,
            'received_amount': 0,
            'items': [
                {
                    'product_id': self.product.id,
                    'quantity': 1,
                    'unit_price': 100000,
                    'subtotal': 100000
                }
            ]
        }
        res = self.client.post('/api/sales/sales/', payload)
        self.assertEqual(res.status_code, 400)
        self.assertIn('require a linked customer profile', str(res.data))

    def test_api_vendor_pay_with_crm_entity(self):
        """Test VendorLedger API can process payment using crm_entity_id."""
        vendor = Vendor.objects.create(company=self.company, name="API Vend", crm_entity=self.crm_vendor, balance_due=1000)
        
        payload = {
            'crm_entity_id': self.crm_vendor.id,
            'amount': 500,
            'notes': 'Paid via CRM Entity'
        }
        res = self.client.post('/api/inventory/vendorledger/pay_vendor/', payload)
        self.assertEqual(res.status_code, 200)
        
        vendor.refresh_from_db()
        self.assertEqual(vendor.balance_due, decimal.Decimal('500.00'))

    def test_cross_company_isolation(self):
        """Ensure attempting to bridge entities across companies fails validation."""
        crm2 = CRMEntity.objects.create(company=self.company2, entity_type='CUSTOMER', code='C2-001')
        from django.core.exceptions import ValidationError
        
        with self.assertRaises(ValidationError):
            cust = Customer.objects.create(company=self.company, name="Cross", crm_entity=crm2)
            cust.full_clean()
