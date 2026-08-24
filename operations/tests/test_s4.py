"""
operations/tests/test_s4.py

Phase S-4 — Deployment, DutyAssignment, Attendance Sync & Dashboard Tests.
"""
import uuid
from datetime import date, time, timedelta
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status as http_status

from companies.models import Company
from accounts.models import User
from platform_core.models import ModuleDefinition, CompanyModule
from crm.models import CRMEntity, CRMEntityRole
from hrm.models import Designation, Employee
from operations.models import (
    OperationalSite, ServiceContract, ServiceContractStatus,
    Deployment, DeploymentStatus,
    DutyAssignment, DutyAssignmentStatus,
    ExtraDuty
)


def make_company_with_module(name):
    company = Company.objects.create(name=name)
    try:
        module = ModuleDefinition.objects.get(code='security_ops')
    except ModuleDefinition.DoesNotExist:
        module = ModuleDefinition.objects.create(
            name='Security Operations', code='security_ops', version='1.0', is_active=True
        )
    CompanyModule.objects.get_or_create(company=company, module=module, defaults={'enabled': True})
    return company, module


class S4DeploymentTests(TestCase):
    """Deployment CRUD, validation, tenant isolation."""

    def setUp(self):
        self.company_a, _ = make_company_with_module("Acme Security A")
        self.company_b, _ = make_company_with_module("Acme Security B")

        self.user_a = User.objects.create_user(
            username="mgr_a", password="password", company=self.company_a, role="manager"
        )
        self.user_b = User.objects.create_user(
            username="mgr_b", password="password", company=self.company_b, role="manager"
        )

        # CRM customers
        self.crm_a = CRMEntity.objects.create(
            company=self.company_a, name="Client A", code="CLI-A", entity_type="CUSTOMER", status="ACTIVE"
        )
        CRMEntityRole.objects.create(company=self.company_a, entity=self.crm_a, role='CUSTOMER')

        self.crm_b = CRMEntity.objects.create(
            company=self.company_b, name="Client B", code="CLI-B", entity_type="CUSTOMER", status="ACTIVE"
        )
        CRMEntityRole.objects.create(company=self.company_b, entity=self.crm_b, role='CUSTOMER')

        # Designations
        self.desig_a = Designation.objects.create(company=self.company_a, name="Guard A")
        self.desig_b = Designation.objects.create(company=self.company_b, name="Guard B")

        # Employees
        self.emp_a = Employee.objects.create(
            company=self.company_a, first_name="Ahmed", last_name="Khan",
            designation=self.desig_a, is_active=True
        )
        self.emp_a2 = Employee.objects.create(
            company=self.company_a, first_name="Usman", last_name="Ali",
            designation=self.desig_a, is_active=True
        )
        self.emp_b = Employee.objects.create(
            company=self.company_b, first_name="Bilal", last_name="Ahmed",
            designation=self.desig_b, is_active=True
        )

        # Sites
        self.site_a = OperationalSite.objects.create(
            company=self.company_a, crm_entity=self.crm_a,
            name="Main Gate A", address="123 Street A"
        )
        self.site_b = OperationalSite.objects.create(
            company=self.company_b, crm_entity=self.crm_b,
            name="Main Gate B", address="456 Street B"
        )

        self.client_a = APIClient()
        self.client_a.force_authenticate(user=self.user_a)
        self.client_a.credentials(HTTP_X_COMPANY_ID=str(self.company_a.id))

        self.client_b = APIClient()
        self.client_b.force_authenticate(user=self.user_b)
        self.client_b.credentials(HTTP_X_COMPANY_ID=str(self.company_b.id))

    def test_create_deployment(self):
        """Deployment can be created with valid employee/site/designation."""
        response = self.client_a.post('/api/operations/deployments/', {
            'employee': str(self.emp_a.id),
            'site': str(self.site_a.id),
            'designation': str(self.desig_a.id),
            'start_date': '2025-01-01',
            'status': 'ACTIVE',
        })
        self.assertIn(response.status_code, [http_status.HTTP_200_OK, http_status.HTTP_201_CREATED],
                      f"Expected 200/201, got {response.status_code}: {response.data}")
        data = response.data
        self.assertEqual(data.get('status'), 'ACTIVE')

    def test_deployment_cross_tenant_employee_rejected(self):
        """Company A cannot deploy Company B employee."""
        response = self.client_a.post('/api/operations/deployments/', {
            'employee': str(self.emp_b.id),  # B employee
            'site': str(self.site_a.id),
            'designation': str(self.desig_a.id),
            'start_date': '2025-01-01',
            'status': 'DRAFT',
        })
        self.assertEqual(response.status_code, http_status.HTTP_400_BAD_REQUEST)

    def test_deployment_cross_tenant_site_rejected(self):
        """Company A cannot deploy to Company B site."""
        response = self.client_a.post('/api/operations/deployments/', {
            'employee': str(self.emp_a.id),
            'site': str(self.site_b.id),  # B site
            'designation': str(self.desig_a.id),
            'start_date': '2025-01-01',
            'status': 'DRAFT',
        })
        self.assertEqual(response.status_code, http_status.HTTP_400_BAD_REQUEST)

    def test_deployment_date_validation(self):
        """end_date before start_date must be rejected."""
        response = self.client_a.post('/api/operations/deployments/', {
            'employee': str(self.emp_a.id),
            'site': str(self.site_a.id),
            'designation': str(self.desig_a.id),
            'start_date': '2025-06-01',
            'end_date': '2025-01-01',  # before start
            'status': 'DRAFT',
        })
        self.assertEqual(response.status_code, http_status.HTTP_400_BAD_REQUEST)

    def test_deployment_active_immutability(self):
        """Cannot change employee/site/designation on an ACTIVE deployment."""
        dep = Deployment.objects.create(
            company=self.company_a, employee=self.emp_a, site=self.site_a,
            designation=self.desig_a, start_date=date(2025, 1, 1), status='ACTIVE'
        )
        response = self.client_a.patch(f'/api/operations/deployments/{dep.id}/', {
            'employee': str(self.emp_a2.id),  # attempt to change employee
        })
        self.assertEqual(response.status_code, http_status.HTTP_400_BAD_REQUEST)

    def test_deployment_tenant_isolation_list(self):
        """Company A deployments are not visible to Company B."""
        Deployment.objects.create(
            company=self.company_a, employee=self.emp_a, site=self.site_a,
            designation=self.desig_a, start_date=date(2025, 1, 1), status='ACTIVE'
        )
        response = self.client_b.get('/api/operations/deployments/')
        results = response.data.get('results', response.data) if isinstance(response.data, dict) else response.data
        ids = [r['id'] for r in results]
        # Company B should see no Company A deployments
        dep_ids_a = list(Deployment.objects.filter(company=self.company_a).values_list('id', flat=True))
        for dep_id in dep_ids_a:
            self.assertNotIn(str(dep_id), ids)

    def test_staffing_summary_endpoint(self):
        """staffing-summary returns per site/designation active counts."""
        dep1 = Deployment.objects.create(
            company=self.company_a, employee=self.emp_a, site=self.site_a,
            designation=self.desig_a, start_date=date(2025, 1, 1), status='ACTIVE'
        )
        dep2 = Deployment.objects.create(
            company=self.company_a, employee=self.emp_a2, site=self.site_a,
            designation=self.desig_a, start_date=date(2025, 1, 1), status='ACTIVE'
        )
        response = self.client_a.get(f'/api/operations/deployments/staffing-summary/?site={self.site_a.id}')
        self.assertEqual(response.status_code, http_status.HTTP_200_OK)
        data = response.data
        self.assertTrue(len(data) > 0)
        entry = data[0]
        self.assertEqual(entry['assigned_count'], 2)


class S4DutyAssignmentTests(TestCase):
    """DutyAssignment CRUD, overlap, tenant isolation, attendance sync."""

    def setUp(self):
        self.company_a, _ = make_company_with_module("DutyTest A")
        self.company_b, _ = make_company_with_module("DutyTest B")

        self.user_a = User.objects.create_user(
            username="duty_mgr_a", password="password", company=self.company_a, role="manager"
        )

        self.crm_a = CRMEntity.objects.create(
            company=self.company_a, name="Client Duty A", code="CDU-A",
            entity_type="CUSTOMER", status="ACTIVE"
        )
        CRMEntityRole.objects.create(company=self.company_a, entity=self.crm_a, role='CUSTOMER')

        self.desig_a = Designation.objects.create(company=self.company_a, name="Duty Guard")
        self.emp_a = Employee.objects.create(
            company=self.company_a, first_name="Guard", last_name="One",
            designation=self.desig_a, is_active=True
        )
        self.site_a = OperationalSite.objects.create(
            company=self.company_a, crm_entity=self.crm_a,
            name="Duty Site A", address="Duty St"
        )
        self.dep_a = Deployment.objects.create(
            company=self.company_a, employee=self.emp_a, site=self.site_a,
            designation=self.desig_a, start_date=date(2025, 1, 1), status='ACTIVE'
        )

        self.client_a = APIClient()
        self.client_a.force_authenticate(user=self.user_a)
        self.client_a.credentials(HTTP_X_COMPANY_ID=str(self.company_a.id))

    def test_create_duty_assignment(self):
        """Valid duty assignment from deployment."""
        response = self.client_a.post('/api/operations/duty-assignments/', {
            'deployment': str(self.dep_a.id),
            'date': '2025-06-01',
            'start_time': '08:00',
            'end_time': '20:00',
            'status': 'SCHEDULED',
        })
        self.assertIn(response.status_code, [200, 201], f"Got {response.status_code}: {response.data}")

    def test_overlap_rejected(self):
        """Two overlapping duties for same employee/date are rejected."""
        DutyAssignment.objects.create(
            company=self.company_a, deployment=self.dep_a,
            employee=self.emp_a, site=self.site_a,
            date=date(2025, 6, 2), start_time=time(8, 0), end_time=time(20, 0),
            status='SCHEDULED'
        )
        response = self.client_a.post('/api/operations/duty-assignments/', {
            'deployment': str(self.dep_a.id),
            'date': '2025-06-02',
            'start_time': '10:00',
            'end_time': '18:00',  # overlaps with 08:00-20:00
            'status': 'SCHEDULED',
        })
        self.assertEqual(response.status_code, http_status.HTTP_400_BAD_REQUEST)

    def test_completed_duty_immutability(self):
        """Cannot change core fields of a COMPLETED duty."""
        duty = DutyAssignment.objects.create(
            company=self.company_a, deployment=self.dep_a,
            employee=self.emp_a, site=self.site_a,
            date=date(2025, 6, 3), start_time=time(8, 0), end_time=time(20, 0),
            status='COMPLETED'
        )
        response = self.client_a.patch(f'/api/operations/duty-assignments/{duty.id}/', {
            'status': 'COMPLETED',
            'date': '2025-07-04',  # try to change date
        })
        self.assertEqual(response.status_code, http_status.HTTP_400_BAD_REQUEST)

    def test_attendance_sync_idempotent(self):
        """Calling sync-attendance twice must not create duplicate records."""
        duty = DutyAssignment.objects.create(
            company=self.company_a, deployment=self.dep_a,
            employee=self.emp_a, site=self.site_a,
            date=date(2025, 6, 10), start_time=time(8, 0), end_time=time(20, 0),
            status='COMPLETED'
        )
        url = f'/api/operations/duty-assignments/{duty.id}/sync-attendance/'

        res1 = self.client_a.post(url)
        self.assertIn(res1.status_code, [200, 201])

        res2 = self.client_a.post(url)
        self.assertIn(res2.status_code, [200, 201])

        # Check WorkforceAttendance count
        from hrm.models import WorkforceAttendance
        count = WorkforceAttendance.objects.filter(
            company=self.company_a,
            employee=self.emp_a,
            date=date(2025, 6, 10)
        ).count()
        self.assertEqual(count, 1, "Idempotency failed: more than one attendance record created.")

    def test_sync_requires_completed_status(self):
        """Sync on SCHEDULED duty returns non-created message, no attendance."""
        duty = DutyAssignment.objects.create(
            company=self.company_a, deployment=self.dep_a,
            employee=self.emp_a, site=self.site_a,
            date=date(2025, 6, 11), start_time=time(8, 0), end_time=time(20, 0),
            status='SCHEDULED'
        )
        res = self.client_a.post(f'/api/operations/duty-assignments/{duty.id}/sync-attendance/')
        self.assertIn(res.status_code, [200, 201])
        data = res.data
        self.assertFalse(data.get('created'), "Should not create attendance for non-COMPLETED duty.")

    def test_roster_endpoint(self):
        """Roster endpoint returns duties for today grouped correctly."""
        today = date.today()
        DutyAssignment.objects.create(
            company=self.company_a, deployment=self.dep_a,
            employee=self.emp_a, site=self.site_a,
            date=today, start_time=time(8, 0), end_time=time(20, 0),
            status='SCHEDULED'
        )
        response = self.client_a.get(f'/api/operations/duty-assignments/roster/?date={today}')
        self.assertEqual(response.status_code, http_status.HTTP_200_OK)
        self.assertGreater(len(response.data), 0)


class S4DashboardTests(TestCase):
    """Dashboard KPIs and tenant safety."""

    def setUp(self):
        self.company, _ = make_company_with_module("Dashboard Test Co")
        self.user = User.objects.create_user(
            username="dash_mgr", password="pw", company=self.company, role="manager"
        )
        crm = CRMEntity.objects.create(
            company=self.company, name="Dash Client", code="DASH-CLI",
            entity_type="CUSTOMER", status="ACTIVE"
        )
        CRMEntityRole.objects.create(company=self.company, entity=crm, role='CUSTOMER')
        desig = Designation.objects.create(company=self.company, name="Dash Guard")
        self.emp = Employee.objects.create(company=self.company, first_name="D", last_name="G", designation=desig, is_active=True)
        self.site = OperationalSite.objects.create(company=self.company, crm_entity=crm, name="Dash Site", address="Dash Rd")

        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_COMPANY_ID=str(self.company.id))

    def test_dashboard_returns_real_deployed_staff(self):
        """deployed_staff matches actual active deployment count."""
        Deployment.objects.create(
            company=self.company, employee=self.emp, site=self.site,
            designation=Designation.objects.filter(company=self.company).first(),
            start_date=date(2025, 1, 1), status='ACTIVE'
        )
        response = self.client.get('/api/operations/dashboard/')
        self.assertEqual(response.status_code, 200)
        data = response.data
        self.assertEqual(data['deployed_staff'], 1)
        self.assertEqual(data['active_deployments'], 1)

    def test_dashboard_tenant_isolation(self):
        """Dashboard KPIs from company A are not affected by company B data."""
        company_b, _ = make_company_with_module("Isolation B")
        crm_b = CRMEntity.objects.create(
            company=company_b, name="B Client", code="B-CLI",
            entity_type="CUSTOMER", status="ACTIVE"
        )
        desig_b = Designation.objects.create(company=company_b, name="B Guard")
        emp_b = Employee.objects.create(company=company_b, first_name="B", last_name="G", designation=desig_b, is_active=True)
        site_b = OperationalSite.objects.create(company=company_b, crm_entity=crm_b, name="B Site", address="B Rd")
        Deployment.objects.create(
            company=company_b, employee=emp_b, site=site_b,
            designation=desig_b, start_date=date(2025, 1, 1), status='ACTIVE'
        )

        response = self.client.get('/api/operations/dashboard/')
        self.assertEqual(response.status_code, 200)
        data = response.data
        # Company A has no deployments, so should still be 0
        self.assertEqual(data['active_deployments'], 0)
