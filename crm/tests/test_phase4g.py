import sys
from decimal import Decimal
from django.test import TestCase
from django.core.management import call_command
from django.contrib.auth import get_user_model
from django.core.management.base import CommandError

from erp_core.models import Company
from crm.models import CRMEntity, CRMContact, CRMAddress
from sales.models import Customer, Sale
from inventory.models import Vendor, PurchaseOrder
from hrm.models import EmployeeRecord, Attendance
from crm.services.compatibility import resolve_employee

User = get_user_model()

class Phase4GTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Test Company")
        self.other_company = Company.objects.create(name="Other Company")
        self.user = User.objects.create_user(username="testuser", password="testpassword", company=self.company)
        
        # Setup Employee
        self.crm_emp = CRMEntity.objects.create(
            company=self.company,
            code="EMP-001",
            name="John Doe",
            entity_type="EMPLOYEE"
        )
        self.employee_record = EmployeeRecord.objects.create(
            company=self.company,
            crm_entity=self.crm_emp,
            user=self.user,
            salary=50000
        )
        
        # Setup Customer
        self.crm_cust = CRMEntity.objects.create(
            company=self.company,
            code="CUST-001",
            name="Acme Corp",
            entity_type="CUSTOMER"
        )
        self.customer = Customer.objects.create(
            company=self.company,
            crm_entity=self.crm_cust,
            name="Acme Corp"
        )
        
        # Setup Vendor
        self.crm_vendor = CRMEntity.objects.create(
            company=self.company,
            code="VEND-001",
            name="Supply Co",
            entity_type="SUPPLIER"
        )
        self.vendor = Vendor.objects.create(
            company=self.company,
            crm_entity=self.crm_vendor,
            name="Supply Co"
        )
        
        # Contacts
        CRMContact.objects.create(entity=self.crm_emp, first_name="John", is_primary=True)
        CRMContact.objects.create(entity=self.crm_cust, first_name="Acme", is_primary=True)
        CRMContact.objects.create(entity=self.crm_vendor, first_name="Sup", is_primary=True)
        
        # Address for vendor
        CRMAddress.objects.create(
            entity=self.crm_vendor,
            address_type="Billing",
            city="New York",
            is_default=True
        )
        self.vendor.address = "123 Supply St"
        self.vendor.save()

    def test_resolve_employee(self):
        # Case 1: Input is EmployeeRecord -> Return EmployeeRecord.
        self.assertEqual(resolve_employee(self.employee_record), self.employee_record)
        
        # Case 2: Input is CRMEntity -> Return linked EmployeeRecord.
        self.assertEqual(resolve_employee(self.crm_emp), self.employee_record)
        
        # Case 3: Input has crm_entity -> Resolve through crm_entity.
        class MockBridge:
            crm_entity = self.crm_emp
        self.assertEqual(resolve_employee(MockBridge()), self.employee_record)
        
        # Case 4: Input has employee -> Resolve employee.employee_record safely.
        att = Attendance.objects.create(
            company=self.company,
            employee=self.employee_record,
            date="2024-01-01"
        )
        self.assertEqual(resolve_employee(att), self.employee_record)
        
        # Also with User
        class MockUserHolder:
            employee = self.user
        self.assertEqual(resolve_employee(MockUserHolder()), self.employee_record)
        
        # Case 5: Input has employee_record -> Return employee_record.
        class MockRecordHolder:
            employee_record = self.employee_record
        self.assertEqual(resolve_employee(MockRecordHolder()), self.employee_record)
        
        # Case 6: Nothing found -> Return None.
        self.assertIsNone(resolve_employee(self.customer))
        self.assertIsNone(resolve_employee(self.crm_cust))

    def test_cross_company_isolation(self):
        # A CRMEntity from another company shouldn't return employee from this company
        other_crm_emp = CRMEntity.objects.create(
            company=self.other_company,
            code="EMP-002",
            name="Jane Doe",
            entity_type="EMPLOYEE"
        )
        self.assertIsNone(resolve_employee(other_crm_emp))

    def test_verify_crm_migration_success(self):
        # Ensure it runs without exception
        try:
            call_command('verify_crm_migration')
        except SystemExit:
            self.fail("verify_crm_migration raised SystemExit unexpectedly!")

    def test_verify_crm_migration_orphan(self):
        # Create an orphan
        CRMEntity.objects.create(
            company=self.company,
            code="ORPHAN-001",
            name="Orphan",
            entity_type="LEAD"
        )
        with self.assertRaises(SystemExit):
            call_command('verify_crm_migration')

    def test_verify_crm_migration_missing_contact(self):
        # Remove primary contact
        self.crm_cust.contacts.all().delete()
        with self.assertRaises(SystemExit):
            call_command('verify_crm_migration')

    def test_verify_crm_migration_missing_address(self):
        # Remove address from vendor that has legacy address
        self.crm_vendor.addresses.all().delete()
        with self.assertRaises(SystemExit):
            call_command('verify_crm_migration')

    def test_verify_crm_migration_broken_bridge(self):
        # Create a sale with invalid crm_entity_id
        s = Sale(company=self.company, customer=self.customer, total_amount=100)
        s.save()
        
        # Intentionally break the bridge without triggering ORM constraint immediately
        Sale.objects.filter(id=s.id).update(crm_entity_id=99999)
        with self.assertRaises(SystemExit):
            call_command('verify_crm_migration')

    def test_safety_sales_purchasing_still_works(self):
        # Sale creation
        s = Sale.objects.create(company=self.company, customer=self.customer, total_amount=100)
        self.assertEqual(s.crm_entity, self.crm_cust)
        
        # Purchase creation
        p = PurchaseOrder.objects.create(company=self.company, vendor=self.vendor, total_amount=100)
        self.assertEqual(p.crm_entity, self.crm_vendor)
