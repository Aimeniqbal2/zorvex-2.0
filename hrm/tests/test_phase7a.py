from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from hrm.models import Department, Position, Designation, Employee, Employment, EmployeeRecord, Attendance
from platform_core.models import Branch, ModuleDefinition, CompanyModule
from crm.models import CRMEntity
from companies.models import Company
from datetime import date, timedelta
import uuid

User = get_user_model()

class UniversalHRFoundationTests(TestCase):
    def setUp(self):
        # Create companies
        self.company_a = Company.objects.create(name="Company A")
        self.company_b = Company.objects.create(name="Company B")

        # Create module definitions and activate HR module
        self.hr_module = ModuleDefinition.objects.create(code='hr', name='HR Module', is_active=True)
        CompanyModule.objects.create(company=self.company_a, module=self.hr_module, enabled=True)
        CompanyModule.objects.create(company=self.company_b, module=self.hr_module, enabled=True)

        from subscriptions.models import CompanySubscription, SubscriptionPlan
        plan = SubscriptionPlan.objects.create(name='Pro Plan', price=100.00, max_users=10)
        CompanySubscription.objects.create(company=self.company_a, plan=plan, is_active=True, start_date=date.today(), end_date=date.today() + timedelta(days=30))
        CompanySubscription.objects.create(company=self.company_b, plan=plan, is_active=True, start_date=date.today(), end_date=date.today() + timedelta(days=30))

        # Create superuser to bypass basic module checks for testing simplicity
        self.user_a = User.objects.create_user(
            username="usera", email="usera@test.com", password="pwd", company=self.company_a, is_superuser=True
        )
        self.user_b = User.objects.create_user(
            username="userb", email="userb@test.com", password="pwd", company=self.company_b, is_superuser=True
        )

        from rest_framework_simplejwt.tokens import RefreshToken

        self.client_a = APIClient()
        token_a = RefreshToken.for_user(self.user_a)
        self.client_a.credentials(HTTP_AUTHORIZATION=f'Bearer {token_a.access_token}', HTTP_X_COMPANY_ID=str(self.company_a.id))

        self.client_b = APIClient()
        token_b = RefreshToken.for_user(self.user_b)
        self.client_b.credentials(HTTP_AUTHORIZATION=f'Bearer {token_b.access_token}', HTTP_X_COMPANY_ID=str(self.company_b.id))

        # Create branches
        self.branch_a = Branch.objects.create(company=self.company_a, name="Branch A", code="BR-A")
        self.branch_b = Branch.objects.create(company=self.company_b, name="Branch B", code="BR-B")
        
        # Create CRM Entities
        self.crm_entity_a = CRMEntity.objects.create(company=self.company_a, name="CRM A", entity_type="individual")
        self.crm_entity_b = CRMEntity.objects.create(company=self.company_b, name="CRM B", entity_type="individual")

    def test_department_tenant_scoped_uniqueness(self):
        """Same department name allowed across different companies, but not within the same company."""
        # Allowed across companies
        dept_a = Department.objects.create(company=self.company_a, name="IT")
        dept_b = Department.objects.create(company=self.company_b, name="IT")
        
        self.assertEqual(Department.objects.count(), 2)

        # Not allowed within same company (API level unique constraint)
        response = self.client_a.post('/api/hrm/departments/', {'name': 'IT'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_position_and_designation_creation(self):
        dept_a = Department.objects.create(company=self.company_a, name="IT")
        
        pos_a = Position.objects.create(company=self.company_a, name="Senior Developer", department=dept_a)
        desig_a = Designation.objects.create(company=self.company_a, name="L5")
        
        self.assertEqual(Position.objects.count(), 1)
        self.assertEqual(Designation.objects.count(), 1)

    def test_employee_and_employment_creation(self):
        dept_a = Department.objects.create(company=self.company_a, name="IT")
        pos_a = Position.objects.create(company=self.company_a, name="Dev", department=dept_a)
        desig_a = Designation.objects.create(company=self.company_a, name="L1")
        
        emp = Employee.objects.create(
            company=self.company_a,
            first_name="John",
            last_name="Doe",
            employee_code="EMP001",
            department=dept_a,
            position=pos_a,
            designation=desig_a,
            branch=self.branch_a,
            crm_entity=self.crm_entity_a
        )
        self.assertEqual(Employee.objects.count(), 1)
        
        employment1 = Employment.objects.create(
            company=self.company_a,
            employee=emp,
            department=dept_a,
            position=pos_a,
            start_date=date(2025, 1, 1),
            end_date=date(2025, 12, 31),
            is_current=False
        )
        
        employment2 = Employment.objects.create(
            company=self.company_a,
            employee=emp,
            department=dept_a,
            position=pos_a,
            start_date=date(2026, 1, 1),
            is_current=True
        )
        
        self.assertEqual(Employment.objects.filter(employee=emp).count(), 2)
        # Check current employment uniqueness
        employment1.is_current = True
        employment1.save()
        
        employment2.refresh_from_db()
        self.assertFalse(employment2.is_current)

    def test_cross_company_department_assignment_rejection(self):
        dept_b = Department.objects.create(company=self.company_b, name="HR")
        
        # Try to assign Company B's department to Company A's employee via API
        response = self.client_a.post('/api/hrm/employees/', {
            'first_name': 'Jane',
            'last_name': 'Smith',
            'employee_code': 'EMP002',
            'department': dept_b.id
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('department', response.data)

    def test_cross_company_position_designation_branch_rejection(self):
        pos_b = Position.objects.create(company=self.company_b, name="Manager")
        desig_b = Designation.objects.create(company=self.company_b, name="L6")
        
        # Test position validation
        response = self.client_a.post('/api/hrm/employees/', {
            'first_name': 'Jane',
            'last_name': 'Smith',
            'position': pos_b.id
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('position', response.data)

        # Test designation validation
        response = self.client_a.post('/api/hrm/employees/', {
            'first_name': 'Jane',
            'last_name': 'Smith',
            'designation': desig_b.id
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('designation', response.data)
        
        # Test branch validation
        response = self.client_a.post('/api/hrm/employees/', {
            'first_name': 'Jane',
            'last_name': 'Smith',
            'branch': self.branch_b.id
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('branch', response.data)

    def test_tenant_queryset_isolation(self):
        Department.objects.create(company=self.company_a, name="DepA")
        Department.objects.create(company=self.company_b, name="DepB")
        
        resp_a = self.client_a.get('/api/hrm/departments/')
        self.assertEqual(resp_a.status_code, 200, resp_a.content)
        data_a = resp_a.data['results'] if isinstance(resp_a.data, dict) and 'results' in resp_a.data else resp_a.data
        self.assertEqual(len(data_a), 1)
        self.assertEqual(data_a[0]['name'], 'DepA')
        
        resp_b = self.client_b.get('/api/hrm/departments/')
        self.assertEqual(resp_b.status_code, 200, resp_b.content)
        data_b = resp_b.data['results'] if isinstance(resp_b.data, dict) and 'results' in resp_b.data else resp_b.data
        self.assertEqual(len(data_b), 1)
        self.assertEqual(data_b[0]['name'], 'DepB')

    def test_fk_restrict_behavior(self):
        from django.db.models.deletion import RestrictedError
        dept_a = Department.objects.create(company=self.company_a, name="IT")
        pos_a = Position.objects.create(company=self.company_a, name="Dev", department=dept_a)
        
        # Deleting department should fail due to RESTRICT on Position
        with self.assertRaises(RestrictedError):
            dept_a.delete()

    def test_legacy_employee_record_compatibility(self):
        # Create legacy EmployeeRecord
        dept_a = Department.objects.create(company=self.company_a, name="Legacy Dept")
        record = EmployeeRecord.objects.create(
            company=self.company_a,
            user=self.user_a,
            department=dept_a,
            salary=50000
        )
        self.assertEqual(EmployeeRecord.objects.count(), 1)
        
        # Create legacy Attendance
        Attendance.objects.create(
            company=self.company_a,
            employee=record,
            date=date.today()
        )
        self.assertEqual(Attendance.objects.count(), 1)
