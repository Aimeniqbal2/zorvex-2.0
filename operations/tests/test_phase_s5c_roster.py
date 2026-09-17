from datetime import date, time, timedelta
from rest_framework import status
from rest_framework.test import APITestCase
from django.core.exceptions import ValidationError
from django.contrib.auth import get_user_model

from companies.models import Company
from platform_core.models import ModuleDefinition, CompanyModule
from crm.models import CRMEntity
from hrm.models import Employee, Designation, Shift
from operations.models import (
    OperationalSite, ServiceContract, SecurityPost,
    Deployment, DeploymentStatus, DeploymentAssignmentType,
    PostShiftRequirement, DutyRoster, DutyRosterStatus,
    DutyReplacement, DutySwap
)
from operations.services.roster_coverage import calculate_site_shift_coverage, calculate_range_coverage

User = get_user_model()


class PhaseS5CRosterTests(APITestCase):
    def setUp(self):
        # Company A
        self.company = Company.objects.create(name='Zorvex Security Alpha')
        mod_ops, _ = ModuleDefinition.objects.get_or_create(code='security_ops', defaults={'name': 'Security Ops', 'is_active': True})
        mod_hr, _ = ModuleDefinition.objects.get_or_create(code='hr', defaults={'name': 'HR', 'is_active': True})
        CompanyModule.objects.get_or_create(company=self.company, module=mod_ops, defaults={'enabled': True})
        CompanyModule.objects.get_or_create(company=self.company, module=mod_hr, defaults={'enabled': True})

        self.admin = User.objects.create_user(
            username='ops_admin_s5c', email='admin_s5c@zorvex.test', password='password123',
            company=self.company, role='admin'
        )
        self.client.force_authenticate(user=self.admin)

        # Clients & Sites
        self.client_corp = CRMEntity.objects.create(
            company=self.company, name='Metro Bank HQ', entity_type='CUSTOMER'
        )
        self.site_a = OperationalSite.objects.create(
            company=self.company, crm_entity=self.client_corp,
            name='Metro HQ Tower', address='Jinnah Ave, Islamabad', is_active=True
        )
        self.site_b = OperationalSite.objects.create(
            company=self.company, crm_entity=self.client_corp,
            name='Metro Cash Depot', address='I-9 Industrial, Islamabad', is_active=True
        )

        self.contract = ServiceContract.objects.create(
            company=self.company, crm_entity=self.client_corp,
            contract_code='SC-METRO-001', start_date=date(2026, 1, 1), status='ACTIVE'
        )
        self.contract.sites.add(self.site_a, self.site_b)

        # Designation
        self.desig_guard = Designation.objects.create(company=self.company, name='Armed Guard')

        # Posts
        self.post_gate = SecurityPost.objects.create(
            company=self.company, site=self.site_a, service_contract=self.contract,
            post_name='Main Gate', post_code='MG-01',
            required_designation=self.desig_guard, required_headcount=4, is_active=True
        )
        self.post_depot = SecurityPost.objects.create(
            company=self.company, site=self.site_b, service_contract=self.contract,
            post_name='Depot Vault', post_code='DV-01',
            required_designation=self.desig_guard, required_headcount=2, is_active=True
        )

        # Shifts
        self.shift_day = Shift.objects.create(
            company=self.company, name='Day 12H', code='D12',
            start_time=time(8, 0), end_time=time(20, 0),
            is_overnight=False, is_active=True
        )
        self.shift_night = Shift.objects.create(
            company=self.company, name='Night 12H', code='N12',
            start_time=time(20, 0), end_time=time(8, 0),
            is_overnight=True, is_active=True
        )

        # Employees
        self.emp_1 = Employee.objects.create(
            company=self.company, first_name='Sultan', last_name='Khan',
            employee_code='EMP-S1', designation=self.desig_guard,
            classification='DIRECT', employment_status='ACTIVE'
        )
        self.emp_2 = Employee.objects.create(
            company=self.company, first_name='Nawaz', last_name='Sharif',
            employee_code='EMP-S2', designation=self.desig_guard,
            classification='DIRECT', employment_status='ACTIVE'
        )
        self.emp_relief = Employee.objects.create(
            company=self.company, first_name='Kamran', last_name='Akmal',
            employee_code='EMP-RELIEF', designation=self.desig_guard,
            classification='DIRECT', employment_status='ACTIVE'
        )
        self.emp_inactive = Employee.objects.create(
            company=self.company, first_name='Asif', last_name='Ali',
            employee_code='EMP-INACTIVE', designation=self.desig_guard,
            classification='DIRECT', employment_status='INACTIVE'
        )

        # Permanent Deployments
        self.dep_1 = Deployment.objects.create(
            company=self.company, employee=self.emp_1, crm_entity=self.client_corp,
            site=self.site_a, post=self.post_gate, designation=self.desig_guard,
            start_date=date(2026, 1, 1), status=DeploymentStatus.ACTIVE,
            assignment_type=DeploymentAssignmentType.PERMANENT
        )
        self.dep_relief = Deployment.objects.create(
            company=self.company, employee=self.emp_relief, crm_entity=self.client_corp,
            site=self.site_b, post=self.post_depot, designation=self.desig_guard,
            start_date=date(2026, 1, 1), status=DeploymentStatus.ACTIVE,
            assignment_type=DeploymentAssignmentType.PERMANENT
        )

    def test_01_shift_creation_and_duration_property(self):
        """1. Verify shift definition, duration_hours calculation, and cross-midnight support."""
        self.assertEqual(self.shift_day.duration_hours, 12.0)
        self.assertEqual(self.shift_night.duration_hours, 12.0)
        self.assertTrue(self.shift_night.is_overnight)

        # Shift API check
        url = f'/api/hrm/shifts/{self.shift_day.id}/'
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['duration_hours'], 12.0)

    def test_02_post_shift_manpower_requirement(self):
        """2. Verify post shift requirement configuration per post and shift."""
        req_day = PostShiftRequirement.objects.create(
            company=self.company, post=self.post_gate, shift=self.shift_day,
            required_headcount=4, is_active=True
        )
        req_night = PostShiftRequirement.objects.create(
            company=self.company, post=self.post_gate, shift=self.shift_night,
            required_headcount=3, is_active=True
        )

        self.assertEqual(req_day.required_headcount, 4)
        self.assertEqual(req_night.required_headcount, 3)

        # Duplicate requirement for same (company, post, shift) should be blocked by constraint
        from django.db import transaction
        with transaction.atomic():
            with self.assertRaises(Exception):
                PostShiftRequirement.objects.create(
                    company=self.company, post=self.post_gate, shift=self.shift_day,
                    required_headcount=5
                )

        # REST API check
        res = self.client.get(f'/api/operations/posts/{self.post_gate.id}/shift-requirements/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 2)

    def test_03_roster_assignment_and_conflict_prevention(self):
        """3 & 4. Verify duty roster creation, conflict blocking, and active employee rule."""
        duty_date = date(2026, 9, 10)

        # Inactive employee must be rejected
        with self.assertRaises(ValidationError):
            roster_inactive = DutyRoster(
                company=self.company, duty_date=duty_date, shift=self.shift_day,
                site=self.site_a, post=self.post_gate, employee=self.emp_inactive,
                status=DutyRosterStatus.SCHEDULED
            )
            roster_inactive.clean()

        # Valid active employee duty
        roster_1 = DutyRoster.objects.create(
            company=self.company, duty_date=duty_date, shift=self.shift_day,
            site=self.site_a, post=self.post_gate, employee=self.emp_1,
            deployment=self.dep_1, status=DutyRosterStatus.SCHEDULED
        )
        self.assertEqual(roster_1.status, DutyRosterStatus.SCHEDULED)

        # Conflicting duplicate active duty on same date/shift for same employee must be blocked
        duplicate_roster = DutyRoster(
            company=self.company, duty_date=duty_date, shift=self.shift_day,
            site=self.site_a, post=self.post_gate, employee=self.emp_1,
            status=DutyRosterStatus.SCHEDULED
        )
        with self.assertRaises(ValidationError):
            duplicate_roster.clean()

    def test_04_replacement_preserves_permanent_deployment(self):
        """5 & 6. Verify replacement duty workflow: preserves permanent deployment and logs temporary coverage."""
        duty_date = date(2026, 9, 12)

        # Sultan is rostered at Site A (Main Gate)
        orig_roster = DutyRoster.objects.create(
            company=self.company, duty_date=duty_date, shift=self.shift_day,
            site=self.site_a, post=self.post_gate, employee=self.emp_1,
            deployment=self.dep_1, status=DutyRosterStatus.SCHEDULED
        )

        # Kamran Akmal (permanently deployed at Site B) is assigned as temporary replacement
        url = '/api/operations/duty-rosters/assign-replacement/'
        payload = {
            'original_roster_id': str(orig_roster.id),
            'replacement_employee_id': str(self.emp_relief.id),
            'reason': 'Sultan reported sudden medical emergency',
            'notes': 'Temporary cross-site replacement duty from Depot Vault'
        }
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        # 1. Original roster is marked REPLACED
        orig_roster.refresh_from_db()
        self.assertEqual(orig_roster.status, DutyRosterStatus.REPLACED)

        # 2. Replacement duty slot exists at Site A for Kamran
        rep_roster = DutyRoster.objects.get(pk=res.data['new_roster_id'])
        self.assertEqual(rep_roster.employee_id, self.emp_relief.id)
        self.assertEqual(rep_roster.site_id, self.site_a.id)
        self.assertEqual(rep_roster.post_id, self.post_gate.id)
        self.assertTrue(rep_roster.is_replacement)
        self.assertEqual(rep_roster.replacement_for_id, orig_roster.id)

        # 3. CRITICAL RULE: Kamran's permanent deployment is UNTOUCHED (still at Site B)!
        self.dep_relief.refresh_from_db()
        self.assertEqual(self.dep_relief.site_id, self.site_b.id)
        self.assertEqual(self.dep_relief.post_id, self.post_depot.id)
        self.assertEqual(self.dep_relief.status, DeploymentStatus.ACTIVE)

        # 4. Audit replacement record exists
        rep_record = DutyReplacement.objects.get(pk=res.data['replacement_id'])
        self.assertEqual(rep_record.original_employee_id, self.emp_1.id)
        self.assertEqual(rep_record.replacement_employee_id, self.emp_relief.id)
        self.assertEqual(rep_record.duty_date, duty_date)

    def test_05_shift_swap_workflow(self):
        """7. Verify controlled shift swap between two employees with conflict validation."""
        date_a = date(2026, 9, 15)
        date_b = date(2026, 9, 16)

        roster_a = DutyRoster.objects.create(
            company=self.company, duty_date=date_a, shift=self.shift_day,
            site=self.site_a, post=self.post_gate, employee=self.emp_1,
            status=DutyRosterStatus.SCHEDULED
        )
        roster_b = DutyRoster.objects.create(
            company=self.company, duty_date=date_b, shift=self.shift_day,
            site=self.site_a, post=self.post_gate, employee=self.emp_2,
            status=DutyRosterStatus.SCHEDULED
        )

        url = '/api/operations/duty-rosters/swap-duty/'
        payload = {
            'roster_a_id': str(roster_a.id),
            'roster_b_id': str(roster_b.id),
            'reason': 'Mutual swap due to family event'
        }
        res = self.client.post(url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        roster_a.refresh_from_db()
        roster_b.refresh_from_db()

        # Employees swapped
        self.assertEqual(roster_a.employee_id, self.emp_2.id)
        self.assertEqual(roster_b.employee_id, self.emp_1.id)

        # DutySwap audit record created
        swap_log = DutySwap.objects.get(pk=res.data['swap_id'])
        self.assertEqual(swap_log.employee_a_id, self.emp_1.id)
        self.assertEqual(swap_log.employee_b_id, self.emp_2.id)

    def test_06_vacancy_and_coverage_calculation(self):
        """8. Verify vacancy and coverage calculation engine per site, shift, and post."""
        duty_date = date(2026, 9, 20)

        # Set Post requirement: 4 Guards on Day Shift
        PostShiftRequirement.objects.create(
            company=self.company, post=self.post_gate, shift=self.shift_day,
            required_headcount=4, is_active=True
        )

        # Rostered: 2 guards (1 regular, 1 replaced by replacement)
        r1 = DutyRoster.objects.create(
            company=self.company, duty_date=duty_date, shift=self.shift_day,
            site=self.site_a, post=self.post_gate, employee=self.emp_1,
            status=DutyRosterStatus.SCHEDULED
        )
        r2 = DutyRoster.objects.create(
            company=self.company, duty_date=duty_date, shift=self.shift_day,
            site=self.site_a, post=self.post_gate, employee=self.emp_2,
            status=DutyRosterStatus.REPLACED
        )
        r_rep = DutyRoster.objects.create(
            company=self.company, duty_date=duty_date, shift=self.shift_day,
            site=self.site_a, post=self.post_gate, employee=self.emp_relief,
            is_replacement=True, replacement_for=r2,
            status=DutyRosterStatus.SCHEDULED
        )

        summary = calculate_site_shift_coverage(self.site_a, duty_date, shift_id=self.shift_day.id)

        # Required: 4
        # Rostered (regular): 1 (emp_1)
        # Vacancies: 4 - 1 = 3
        # Replacement Coverage: 1 (emp_relief)
        # Final Covered: 1 + 1 = 2
        day_shift_summary = summary['shifts'][0]
        self.assertEqual(day_shift_summary['required'], 4)
        self.assertEqual(day_shift_summary['rostered'], 1)
        self.assertEqual(day_shift_summary['vacant'], 3)
        self.assertEqual(day_shift_summary['replacement_assigned'], 1)
        self.assertEqual(day_shift_summary['final_covered'], 2)

        # Check REST API endpoint
        res = self.client.get(f'/api/operations/duty-rosters/coverage-summary/?site={self.site_a.id}&date={duty_date}')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['site_id'], str(self.site_a.id))

    def test_07_cross_tenant_roster_blocked(self):
        """Verify cross-tenant linkage is strictly blocked."""
        comp_b = Company.objects.create(name='Competitor Security Ltd')
        site_b_other = OperationalSite.objects.create(
            company=comp_b, name='Other Site', address='Lahore',
            crm_entity=CRMEntity.objects.create(company=comp_b, name='Other Client')
        )

        # Attempt to roster company A employee on company B site
        cross_roster = DutyRoster(
            company=self.company, duty_date=date(2026, 9, 25), shift=self.shift_day,
            site=site_b_other, employee=self.emp_1, status=DutyRosterStatus.SCHEDULED
        )
        with self.assertRaises(ValidationError):
            cross_roster.clean()
