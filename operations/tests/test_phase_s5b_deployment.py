from datetime import date, timedelta
from rest_framework import status
from rest_framework.test import APITestCase
from django.core.exceptions import ValidationError
from django.contrib.auth import get_user_model

from companies.models import Company
from platform_core.models import ModuleDefinition, CompanyModule
from crm.models import CRMEntity
from hrm.models import Employee, Designation, EmploymentHistory
from operations.models import (
    OperationalSite, ServiceContract, SecurityPost,
    Deployment, DeploymentStatus, DeploymentAssignmentType
)
from operations.services.manpower import calculate_site_manpower

User = get_user_model()


class PhaseS5BDeploymentTests(APITestCase):
    def setUp(self):
        # Setup Company 1
        self.company = Company.objects.create(name='Zorvex Security Services')
        mod_ops, _ = ModuleDefinition.objects.get_or_create(code='security_ops', defaults={'name': 'Security Ops', 'is_active': True})
        mod_hr, _ = ModuleDefinition.objects.get_or_create(code='hr', defaults={'name': 'HR', 'is_active': True})
        CompanyModule.objects.get_or_create(company=self.company, module=mod_ops, defaults={'enabled': True})
        CompanyModule.objects.get_or_create(company=self.company, module=mod_hr, defaults={'enabled': True})

        self.admin = User.objects.create_user(
            username='ops_admin', email='admin@zorvex.test', password='password123',
            company=self.company, role='admin'
        )
        self.client.force_authenticate(user=self.admin)

        # Master Data
        self.client_entity = CRMEntity.objects.create(
            company=self.company, name='Apex Towers', entity_type='CUSTOMER'
        )
        self.site = OperationalSite.objects.create(
            company=self.company, crm_entity=self.client_entity,
            name='Apex Tower 1', address='Blue Area, Islamabad', is_active=True
        )
        self.contract = ServiceContract.objects.create(
            company=self.company, crm_entity=self.client_entity,
            contract_code='SC-APEX-001', start_date=date(2026, 1, 1), status='ACTIVE'
        )
        self.contract.sites.add(self.site)

        self.desig_guard = Designation.objects.create(company=self.company, name='Security Guard')
        self.desig_supervisor = Designation.objects.create(company=self.company, name='Site Supervisor')

        # Employees
        self.emp_guard1 = Employee.objects.create(
            company=self.company, first_name='Tariq', last_name='Mehmood',
            employee_code='EMP-001', designation=self.desig_guard,
            classification='DIRECT', employment_status='ACTIVE'
        )
        self.emp_guard2 = Employee.objects.create(
            company=self.company, first_name='Rashid', last_name='Khan',
            employee_code='EMP-002', designation=self.desig_guard,
            classification='DIRECT', employment_status='ACTIVE'
        )
        self.emp_supervisor = Employee.objects.create(
            company=self.company, first_name='Asim', last_name='Munir',
            employee_code='EMP-003', designation=self.desig_supervisor,
            classification='DIRECT', employment_status='ACTIVE'
        )

        # Company 2 (Tenant isolation)
        self.company2 = Company.objects.create(name='Other Guard Co')
        CompanyModule.objects.get_or_create(company=self.company2, module=mod_ops, defaults={'enabled': True})
        self.admin2 = User.objects.create_user(
            username='other_admin', email='other@co.test', password='password123',
            company=self.company2, role='admin'
        )
        self.emp_c2 = Employee.objects.create(
            company=self.company2, first_name='Zahid', last_name='Ali',
            employee_code='E2-001', classification='DIRECT', employment_status='ACTIVE'
        )
        crm_c2 = CRMEntity.objects.create(company=self.company2, name='Client C2', entity_type='CUSTOMER')
        self.site_c2 = OperationalSite.objects.create(
            company=self.company2, crm_entity=crm_c2, name='Site C2', address='Other city'
        )

    def test_01_site_and_security_post_creation(self):
        """Test creating security posts and checking manpower properties."""
        post1 = SecurityPost.objects.create(
            company=self.company, site=self.site, service_contract=self.contract,
            post_name='Main Gate Alpha', post_code='POST-01',
            required_designation=self.desig_guard, required_headcount=3
        )
        post2 = SecurityPost.objects.create(
            company=self.company, site=self.site, service_contract=self.contract,
            post_name='Control Room', post_code='POST-02',
            required_designation=self.desig_supervisor, required_headcount=1
        )

        self.assertEqual(post1.deployed_count, 0)
        self.assertEqual(post1.vacant_count, 3)
        self.assertEqual(post1.overstaffed_count, 0)
        self.assertEqual(post2.vacant_count, 1)

        # Test duplicate post name in same site is blocked
        with self.assertRaises(Exception):
            SecurityPost.objects.create(
                company=self.company, site=self.site,
                post_name='Main Gate Alpha', required_designation=self.desig_guard,
                required_headcount=1
            )

    def test_02_site_manpower_calculation(self):
        """Test site manpower required, deployed, vacant, and overstaffed calculation."""
        post1 = SecurityPost.objects.create(
            company=self.company, site=self.site, post_name='Gate 1',
            required_designation=self.desig_guard, required_headcount=2
        )
        post2 = SecurityPost.objects.create(
            company=self.company, site=self.site, post_name='Perimeter',
            required_designation=self.desig_guard, required_headcount=1
        )

        summary = calculate_site_manpower(self.site)
        self.assertEqual(summary['required_strength'], 3)
        self.assertEqual(summary['deployed_strength'], 0)
        self.assertEqual(summary['vacancies'], 3)
        self.assertEqual(summary['overstaffing'], 0)

        # Deploy 1 guard to post1
        Deployment.objects.create(
            company=self.company, employee=self.emp_guard1, site=self.site,
            post=post1, designation=self.desig_guard, start_date=date(2026, 9, 1),
            status=DeploymentStatus.ACTIVE
        )

        summary2 = calculate_site_manpower(self.site)
        self.assertEqual(summary2['required_strength'], 3)
        self.assertEqual(summary2['deployed_strength'], 1)
        self.assertEqual(summary2['vacancies'], 2)
        self.assertEqual(summary2['overstaffing'], 0)

        # Check post-wise breakdown
        gate1_data = next(p for p in summary2['posts'] if p['post_name'] == 'Gate 1')
        self.assertEqual(gate1_data['required_headcount'], 2)
        self.assertEqual(gate1_data['deployed_headcount'], 1)
        self.assertEqual(gate1_data['vacancies'], 1)

    def test_03_active_employee_rule(self):
        """Only ACTIVE employees may receive active deployment."""
        inactive_emp = Employee.objects.create(
            company=self.company, first_name='Hamza', last_name='Tahir',
            employee_code='EMP-RES', classification='DIRECT',
            employment_status='RESIGNED'
        )

        dep = Deployment(
            company=self.company, employee=inactive_emp, site=self.site,
            designation=self.desig_guard, start_date=date(2026, 9, 1),
            status=DeploymentStatus.ACTIVE
        )
        with self.assertRaises(ValidationError) as ctx:
            dep.clean()
        self.assertIn('Only ACTIVE employees can receive an ACTIVE deployment', str(ctx.exception))

    def test_04_conflicting_active_deployment_blocked(self):
        """Prevent overlapping conflicting active deployments for the same employee."""
        # Active deployment 1 (ongoing)
        Deployment.objects.create(
            company=self.company, employee=self.emp_guard1, site=self.site,
            designation=self.desig_guard, start_date=date(2026, 9, 1),
            status=DeploymentStatus.ACTIVE
        )

        # New active deployment for same employee at another site
        site2 = OperationalSite.objects.create(
            company=self.company, crm_entity=self.client_entity, name='Apex Tower 2', address='Sector F-7'
        )
        dep2 = Deployment(
            company=self.company, employee=self.emp_guard1, site=site2,
            designation=self.desig_guard, start_date=date(2026, 9, 5),
            status=DeploymentStatus.ACTIVE
        )
        with self.assertRaises(ValidationError) as ctx:
            dep2.clean()
        self.assertIn('already has an active deployment', str(ctx.exception))

    def test_05_transfer_preserves_history(self):
        """Controlled transfer: Relieves old deployment and starts new one, preserving history."""
        post1 = SecurityPost.objects.create(
            company=self.company, site=self.site, post_name='Main Gate',
            required_designation=self.desig_guard, required_headcount=2
        )
        site2 = OperationalSite.objects.create(
            company=self.company, crm_entity=self.client_entity, name='Warehouse Site', address='I-9 Industrial Area'
        )
        post2 = SecurityPost.objects.create(
            company=self.company, site=site2, post_name='Warehouse Loading Dock',
            required_designation=self.desig_guard, required_headcount=1
        )

        # Initial deployment
        dep1 = Deployment.objects.create(
            company=self.company, employee=self.emp_guard1, site=self.site,
            post=post1, designation=self.desig_guard, start_date=date(2026, 9, 1),
            status=DeploymentStatus.ACTIVE
        )

        # Perform transfer via API endpoint
        url = f'/api/operations/deployments/{dep1.id}/transfer/'
        transfer_payload = {
            'relieved_date': '2026-09-10',
            'relief_reason': 'Transferred to Warehouse per supervisor request',
            'new_site': str(site2.id),
            'new_post': str(post2.id),
            'new_start_date': '2026-09-10',
            'new_assignment_type': 'PERMANENT',
            'notes': 'Operational transfer completed.'
        }
        resp = self.client.post(url, transfer_payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

        # Verify old deployment is relieved
        dep1.refresh_from_db()
        self.assertEqual(dep1.status, DeploymentStatus.RELIEVED)
        self.assertEqual(str(dep1.end_date), '2026-09-10')
        self.assertEqual(str(dep1.relieved_date), '2026-09-10')
        self.assertEqual(dep1.relief_reason, 'Transferred to Warehouse per supervisor request')

        # Verify new deployment is active
        new_dep_id = resp.data['new_deployment']['id']
        new_dep = Deployment.objects.get(id=new_dep_id)
        self.assertEqual(new_dep.status, DeploymentStatus.ACTIVE)
        self.assertEqual(str(new_dep.site_id), str(site2.id))
        self.assertEqual(str(new_dep.post_id), str(post2.id))
        self.assertEqual(str(new_dep.start_date), '2026-09-10')

        # Verify employee deployment history contains both
        history_resp = self.client.get(f'/api/operations/deployments/employee-history/?employee={self.emp_guard1.id}')
        self.assertEqual(history_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(history_resp.data), 2)

        # Verify EmploymentHistory audit log recorded
        emp_history = EmploymentHistory.objects.filter(employee=self.emp_guard1, event_type='TRANSFER')
        self.assertTrue(emp_history.exists())

    def test_06_relieve_deployment_flow(self):
        """Relieving deployment marks status RELIEVED and frees employee for future deployment."""
        dep = Deployment.objects.create(
            company=self.company, employee=self.emp_guard2, site=self.site,
            designation=self.desig_guard, start_date=date(2026, 9, 1),
            status=DeploymentStatus.ACTIVE
        )

        relieve_url = f'/api/operations/deployments/{dep.id}/relieve/'
        resp = self.client.post(relieve_url, {
            'relieved_date': '2026-09-15',
            'relief_reason': 'Temporary contract ended'
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        dep.refresh_from_db()
        self.assertEqual(dep.status, DeploymentStatus.RELIEVED)
        self.assertEqual(str(dep.relieved_date), '2026-09-15')

        # Now employee can be deployed again starting after relieved date
        dep_new = Deployment(
            company=self.company, employee=self.emp_guard2, site=self.site,
            designation=self.desig_guard, start_date=date(2026, 9, 16),
            status=DeploymentStatus.ACTIVE
        )
        dep_new.clean()
        dep_new.save()
        self.assertEqual(dep_new.status, DeploymentStatus.ACTIVE)

    def test_07_cross_tenant_linkage_blocked(self):
        """Cross-tenant validation ensures models cannot reference other company records."""
        # 1. Post linking to another company site
        post = SecurityPost(
            company=self.company, site=self.site_c2, post_name='Hacked Post',
            required_designation=self.desig_guard, required_headcount=1
        )
        with self.assertRaises(ValidationError) as ctx:
            post.clean()
        self.assertIn('Operational Site must belong to the same company', str(ctx.exception))

        # 2. Deployment linking to another company employee
        dep = Deployment(
            company=self.company, employee=self.emp_c2, site=self.site,
            designation=self.desig_guard, start_date=date(2026, 9, 1),
            status=DeploymentStatus.ACTIVE
        )
        with self.assertRaises(ValidationError) as ctx:
            dep.clean()
        self.assertIn('Employee must belong to the same company', str(ctx.exception))

    def test_08_api_site_manpower_summary(self):
        """Test GET /api/operations/deployments/site-manpower/?site=<id> endpoint."""
        post = SecurityPost.objects.create(
            company=self.company, site=self.site, post_name='Main Gate',
            required_designation=self.desig_guard, required_headcount=4
        )
        Deployment.objects.create(
            company=self.company, employee=self.emp_guard1, site=self.site,
            post=post, designation=self.desig_guard, start_date=date(2026, 9, 1),
            status=DeploymentStatus.ACTIVE
        )

        resp = self.client.get(f'/api/operations/deployments/site-manpower/?site={self.site.id}')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['required_strength'], 4)
        self.assertEqual(resp.data['deployed_strength'], 1)
        self.assertEqual(resp.data['vacancies'], 3)
        self.assertEqual(resp.data['overstaffing'], 0)
        self.assertEqual(len(resp.data['posts']), 1)
        self.assertEqual(len(resp.data['deployments']), 1)
