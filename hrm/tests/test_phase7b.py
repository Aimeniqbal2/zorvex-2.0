import datetime
from django.db import IntegrityError
from django.core.exceptions import ValidationError
from rest_framework import status
from rest_framework.test import APITestCase, APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from companies.models import Company
from subscriptions.models import CompanySubscription, SubscriptionPlan
from platform_core.models import ModuleDefinition, CompanyModule, Branch
from crm.models import CRMEntity
from django.contrib.auth import get_user_model

User = get_user_model()
from hrm.models import Department, Position, Designation, Employee, Employment, EmployeeRecord
from hrm.services.compatibility import get_employee, resolve_employee_record, get_hr_architecture_state

class Phase7BIdentityTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        # Set up tenants
        cls.company_a = Company.objects.create(name="Company A")
        cls.company_b = Company.objects.create(name="Company B")

        # Setup Subscription
        plan = SubscriptionPlan.objects.create(name="Enterprise", price=100)
        CompanySubscription.objects.create(
            company=cls.company_a, plan=plan, start_date=datetime.date.today(),
            end_date=datetime.date.today() + datetime.timedelta(days=30), is_active=True
        )
        CompanySubscription.objects.create(
            company=cls.company_b, plan=plan, start_date=datetime.date.today(),
            end_date=datetime.date.today() + datetime.timedelta(days=30), is_active=True
        )

        # Set up HR module
        cls.hrm_module = ModuleDefinition.objects.get_or_create(code='hrm', defaults={'name': 'HR Management', 'is_active': True})[0]
        CompanyModule.objects.create(company=cls.company_a, module=cls.hrm_module, enabled=True)
        CompanyModule.objects.create(company=cls.company_b, module=cls.hrm_module, enabled=True)
        
        # Set up users
        cls.user_a = User.objects.create_user(
            username="usera", email="usera@test.com", password="pwd", company=cls.company_a, is_superuser=True
        )
        cls.user_b = User.objects.create_user(
            username="userb", email="userb@test.com", password="pwd", company=cls.company_b, is_superuser=True
        )

        cls.user_a2 = User.objects.create_user(
            username="usera2", email="usera2@test.com", password="pwd", company=cls.company_a
        )
        cls.user_b2 = User.objects.create_user(
            username="userb2", email="userb2@test.com", password="pwd", company=cls.company_b
        )

        cls.crm_entity_a = CRMEntity.objects.create(company=cls.company_a, name="CRM A", entity_type="individual")
        cls.crm_entity_b = CRMEntity.objects.create(company=cls.company_b, name="CRM B", entity_type="individual")

        cls.client_a = APIClient()
        token_a = RefreshToken.for_user(cls.user_a)
        cls.client_a.credentials(HTTP_AUTHORIZATION=f'Bearer {token_a.access_token}', HTTP_X_COMPANY_ID=str(cls.company_a.id))

        cls.client_b = APIClient()
        token_b = RefreshToken.for_user(cls.user_b)
        cls.client_b.credentials(HTTP_AUTHORIZATION=f'Bearer {token_b.access_token}', HTTP_X_COMPANY_ID=str(cls.company_b.id))

    def test_universal_employee_resolves_correctly(self):
        """1. Universal Employee resolves correctly."""
        emp = Employee.objects.create(company=self.company_a, first_name="John", last_name="Doe", user=self.user_a2)
        self.assertEqual(get_hr_architecture_state(emp), 'UNIVERSAL')
        self.assertEqual(get_employee(emp), emp)
        self.assertIsNone(resolve_employee_record(emp))

    def test_bridged_resolution(self):
        """2, 3, 5, 6. EmployeeRecord resolves to Universal Employee and vice versa when bridged."""
        emp = Employee.objects.create(company=self.company_a, first_name="Jane", last_name="Smith")
        record = EmployeeRecord.objects.create(company=self.company_a, user=self.user_a2, employee=emp)
        
        self.assertEqual(get_employee(record), emp)
        self.assertEqual(resolve_employee_record(emp), record)
        self.assertEqual(get_hr_architecture_state(record), 'BRIDGED')
        self.assertEqual(get_hr_architecture_state(emp), 'UNIVERSAL')

    def test_unbridged_legacy_resolution(self):
        """4. Unbridged EmployeeRecord returns correct LEGACY state."""
        record = EmployeeRecord.objects.create(company=self.company_a, user=self.user_a2)
        self.assertEqual(get_hr_architecture_state(record), 'LEGACY')
        self.assertIsNone(get_employee(record))
        self.assertEqual(resolve_employee_record(record), record)

    def test_cross_company_bridge_assignment_rejected(self):
        """7. Cross-company bridge assignment is rejected."""
        emp_b = Employee.objects.create(company=self.company_b, first_name="Bob", last_name="Builder")
        with self.assertRaises(ValidationError):
            record = EmployeeRecord(company=self.company_a, user=self.user_a2, employee=emp_b)
            record.clean()

    def test_crmentity_company_mismatch_rejected(self):
        """8. CRMEntity company mismatch is rejected."""
        with self.assertRaises(ValidationError):
            emp = Employee(company=self.company_a, first_name="Bad", last_name="CRM", crm_entity=self.crm_entity_b)
            emp.clean()

    def test_user_company_mismatch_rejected(self):
        """9. User company mismatch is rejected."""
        with self.assertRaises(ValidationError):
            emp = Employee(company=self.company_a, first_name="Bad", last_name="User", user=self.user_b2)
            emp.clean()

    def test_employee_can_exist_without_user(self):
        """10. Employee can exist without User if architecture permits it."""
        emp = Employee.objects.create(company=self.company_a, first_name="No", last_name="User")
        self.assertIsNone(emp.user)

    def test_employee_user_same_company_works(self):
        """11. Employee + User same company works."""
        emp = Employee.objects.create(company=self.company_a, first_name="Yes", last_name="User", user=self.user_a2)
        self.assertEqual(emp.user, self.user_a2)

    def test_employee_crmentity_same_company_works(self):
        """12. Employee + CRMEntity same company works."""
        emp = Employee.objects.create(company=self.company_a, first_name="Yes", last_name="CRM", crm_entity=self.crm_entity_a)
        self.assertEqual(emp.crm_entity, self.crm_entity_a)

    def test_employment_references_correct_employee(self):
        """13. Employment references correct Employee."""
        emp = Employee.objects.create(company=self.company_a, first_name="Emp", last_name="Loyment")
        employment = Employment.objects.create(company=self.company_a, employee=emp, start_date=datetime.date(2023, 1, 1))
        self.assertEqual(employment.employee, emp)

    def test_cross_company_employment_rejected(self):
        """14. Cross-company Employment is rejected."""
        emp_b = Employee.objects.create(company=self.company_b, first_name="Emp", last_name="B")
        with self.assertRaises(ValidationError):
            employment = Employment(company=self.company_a, employee=emp_b, start_date=datetime.date(2023, 1, 1))
            employment.clean()
            
    def test_api_isolation_employee(self):
        Employee.objects.create(company=self.company_b, first_name="Hidden", last_name="Employee")
        resp = self.client_a.get('/api/hrm/employees/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()), 0)
        
    def test_api_isolation_employee_record(self):
        EmployeeRecord.objects.create(company=self.company_b, user=self.user_b2)
        resp = self.client_a.get('/api/hrm/employeerecords/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()), 0)
