import uuid
from django.test import TestCase
from django.core.management import call_command
from django.contrib.auth import get_user_model
from companies.models import Company
from sales.models import Customer, Sale, CustomerCreditLedger
from inventory.models import Vendor, VendorLedger, PurchaseOrder
from services.models import ServiceOrder, ServicePartUsed
from finance.models import CreditAccount
from hrm.models import EmployeeRecord, Department
from crm.models import CRMEntity, CRMContact, CRMAddress

User = get_user_model()

class Phase4CMigrationTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Test Company")
        self.company2 = Company.objects.create(name="Test Company 2")
        self.user = User.objects.create_user(username="testuser", email="test@user.com", company=self.company)
        
        self.customer = Customer.objects.create(company=self.company, name="Test Customer", phone="123", email="cust@test.com")
        
        self.dept = Department.objects.create(company=self.company, name="IT")
        self.employee = EmployeeRecord.objects.create(company=self.company, user=self.user, department=self.dept)

        self.vendor = Vendor.objects.create(company=self.company, name="Vendor A")
        self.sale = Sale.objects.create(company=self.company, cashier=self.user, customer=self.customer)

    def test_migration_and_idempotency(self):
        call_command('migrate_legacy_crm')
        
        self.customer.refresh_from_db()
        self.assertIsNotNone(self.customer.crm_entity)
        self.assertEqual(self.customer.crm_entity.entity_type, 'CUSTOMER')

        self.vendor.refresh_from_db()
        self.assertIsNotNone(self.vendor.crm_entity)
        self.assertEqual(self.vendor.crm_entity.entity_type, 'SUPPLIER')

        self.sale.refresh_from_db()
        self.assertIsNotNone(self.sale.crm_entity)
        self.assertEqual(self.sale.crm_entity, self.customer.crm_entity)

        # Run again to test idempotency
        call_command('migrate_legacy_crm')
        self.assertEqual(CRMEntity.objects.filter(company=self.company).count(), 3)
        
    def test_verify_command(self):
        call_command('migrate_legacy_crm')
        # Should pass without exiting with error
        call_command('verify_crm_migration')
        
    def test_rollback_command(self):
        call_command('migrate_legacy_crm')
        self.assertEqual(CRMEntity.objects.filter(company=self.company).count(), 3)
        
        call_command('rollback_crm_migration')
        
        self.customer.refresh_from_db()
        self.assertIsNone(self.customer.crm_entity)
        self.assertEqual(CRMEntity.objects.filter(company=self.company).count(), 0)

    def test_company_isolation(self):
        # Create entity in company 2
        cust2 = Customer.objects.create(company=self.company2, name="C2")
        call_command('migrate_legacy_crm')
        cust2.refresh_from_db()
        
        self.assertEqual(cust2.crm_entity.company, self.company2)
