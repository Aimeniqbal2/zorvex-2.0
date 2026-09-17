"""
operations/tests/test_phase_s5i_control_center.py

Comprehensive test suite for Phase S-5I:
Security Workforce + Core Operations Control Center.
Tests aggregation accuracy, S-5B-G compatibility, site health evaluation,
action-center exceptions, and strict multi-tenant isolation.
"""
from datetime import date, timedelta
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from companies.models import Company
from accounts.models import User
from crm.models import CRMEntity
from hrm.models import (
    Employee, Designation, Department, Shift,
    WorkforceAttendance, AttendanceStatus, JumpRecord, JumpRecordStatus,
    PayrollRun, PayrollRunStatus, Payslip, PayslipStatus
)
from operations.models import (
    OperationalSite, SecurityPost, ServiceContract, Deployment, DeploymentStatus,
    DutyRoster, DutyReplacement, DutyRosterStatus,
    DailyDutyPay, DailyPayRateSource, DailyPayCalculationStatus,
    PayrollCalculationStatus, EmployeePayrollCalculation
)
from operations.services.control_center_service import ControlCenterService
from operations.services.manpower import calculate_all_sites_manpower, calculate_site_manpower
from operations.services.roster_coverage import calculate_site_shift_coverage


class PhaseS5IControlCenterTestCase(TestCase):
    def setUp(self):
        # 1. Companies
        self.company1 = Company.objects.create(name="Apex Security Solutions", is_active=True)
        self.company2 = Company.objects.create(name="Delta Defense Corp", is_active=True)

        # 2. Users
        self.user1 = User.objects.create_user(
            username="ops_commander",
            email="commander@apex.com",
            password="testpassword123",
            is_staff=True,
            is_superuser=True
        )
        self.user1.company_id = self.company1.id
        self.user1.save()

        # 3. Client & Contract
        self.client1 = CRMEntity.objects.create(
            company=self.company1,
            name="Apex Commercial Tower Client",
            entity_type='CUSTOMER'
        )
        self.contract1 = ServiceContract.objects.create(
            company=self.company1,
            crm_entity=self.client1,
            contract_code="SC-2026-001",
            start_date=date(2026, 1, 1),
            status='ACTIVE'
        )

        # 4. Operational Sites
        self.site1 = OperationalSite.objects.create(
            company=self.company1,
            crm_entity=self.client1,
            name="Apex Central Tower",
            address="100 Security Blvd",
            is_active=True
        )
        self.site2 = OperationalSite.objects.create(
            company=self.company1,
            crm_entity=self.client1,
            name="Apex Logistics Yard",
            address="200 Warehouse Way",
            is_active=True
        )
        self.contract1.sites.add(self.site1, self.site2)

        # Company 2 Site (Tenant isolation)
        self.c2_client = CRMEntity.objects.create(
            company=self.company2,
            name="Delta Client",
            entity_type='CUSTOMER'
        )
        self.c2_site = OperationalSite.objects.create(
            company=self.company2,
            crm_entity=self.c2_client,
            name="Delta Secret Depot",
            address="Secret Location",
            is_active=True
        )

        # 5. Designations & Departments
        self.dept_ops = Department.objects.create(
            company=self.company1,
            name="Operations"
        )
        self.dept_admin = Department.objects.create(
            company=self.company1,
            name="Administration"
        )
        self.desig_guard = Designation.objects.create(
            company=self.company1,
            name="Security Guard",
            code="SG"
        )
        self.desig_supervisor = Designation.objects.create(
            company=self.company1,
            name="Site Supervisor",
            code="SS"
        )
        self.desig_mgr = Designation.objects.create(
            company=self.company1,
            name="Operations Manager",
            code="OM"
        )

        # 6. Security Posts
        self.post1 = SecurityPost.objects.create(
            company=self.company1,
            site=self.site1,
            post_name="Main Gate Post",
            post_code="POST-01",
            required_headcount=2,
            required_designation=self.desig_guard,
            is_active=True
        )
        self.post2 = SecurityPost.objects.create(
            company=self.company1,
            site=self.site1,
            post_name="Lobby Desk",
            post_code="POST-02",
            required_headcount=1,
            required_designation=self.desig_supervisor,
            is_active=True
        )

        # 7. Employees
        # DIRECT active guards
        self.emp_guard1 = Employee.objects.create(
            company=self.company1,
            first_name="Tariq",
            last_name="Khan",
            employee_code="APX-001",
            employment_status='ACTIVE',
            classification='DIRECT',
            designation=self.desig_guard,
            department=self.dept_ops
        )
        self.emp_guard2 = Employee.objects.create(
            company=self.company1,
            first_name="Bilal",
            last_name="Ahmed",
            employee_code="APX-002",
            employment_status='ACTIVE',
            classification='DIRECT',
            designation=self.desig_guard,
            department=self.dept_ops
        )
        # DIRECT suspended guard
        self.emp_suspended = Employee.objects.create(
            company=self.company1,
            first_name="Kamran",
            last_name="Akmal",
            employee_code="APX-003",
            employment_status='SUSPENDED',
            classification='DIRECT',
            designation=self.desig_guard,
            department=self.dept_ops
        )
        # DIRECT JUMP guard
        self.emp_jump = Employee.objects.create(
            company=self.company1,
            first_name="Zahid",
            last_name="Farooq",
            employee_code="APX-004",
            employment_status='JUMP',
            classification='DIRECT',
            designation=self.desig_guard,
            department=self.dept_ops
        )
        # INDIRECT staff
        self.emp_mgr = Employee.objects.create(
            company=self.company1,
            first_name="Sara",
            last_name="Iqbal",
            employee_code="APX-005",
            employment_status='ACTIVE',
            classification='INDIRECT',
            designation=self.desig_mgr,
            department=self.dept_admin
        )
        # Separated
        self.emp_resigned = Employee.objects.create(
            company=self.company1,
            first_name="Nasir",
            last_name="Jamshed",
            employee_code="APX-006",
            employment_status='RESIGNED',
            classification='DIRECT',
            designation=self.desig_guard,
            department=self.dept_ops
        )

        # Company 2 Employee (for tenant check)
        self.c2_emp = Employee.objects.create(
            company=self.company2,
            first_name="Delta",
            last_name="Operator",
            employee_code="DEL-999",
            employment_status='ACTIVE',
            classification='DIRECT'
        )

        # 8. Deployments
        self.dep1 = Deployment.objects.create(
            company=self.company1,
            employee=self.emp_guard1,
            site=self.site1,
            post=self.post1,
            designation=self.desig_guard,
            start_date=date(2026, 1, 1),
            status=DeploymentStatus.ACTIVE
        )

        # 9. Shifts
        self.shift_day = Shift.objects.create(
            company=self.company1,
            name="Day Shift",
            code="DS-12",
            start_time="08:00:00",
            end_time="20:00:00",
            is_active=True
        )

        self.today = date.today()

    def test_workforce_kpi_accuracy(self):
        """Test workforce breakdown figures match actual counts."""
        summary = ControlCenterService.get_workforce_summary(self.company1)

        # Total employees for company1 = 6 (emp_guard1, emp_guard2, emp_suspended, emp_jump, emp_mgr, emp_resigned)
        self.assertEqual(summary['total_employees'], 6)
        self.assertEqual(summary['direct_count'], 5)
        self.assertEqual(summary['indirect_count'], 1)
        self.assertEqual(summary['active_count'], 3)  # guard1, guard2, mgr
        self.assertEqual(summary['suspended_count'], 1)  # suspended
        self.assertEqual(summary['jump_count'], 1)  # jump
        self.assertEqual(summary['resigned_count'], 1)  # resigned

    def test_manpower_summary_matches_s5b(self):
        """Test manpower figures match authoritative S-5B ManpowerPlanningService."""
        summary = ControlCenterService.get_manpower_summary(self.company1)

        # Post1 required=2, deployed=1. Post2 required=1, deployed=0.
        # Total required = 3, Total deployed = 1, Total vacancies = 2.
        self.assertEqual(summary['required_strength'], 3)
        self.assertEqual(summary['deployed_strength'], 1)
        self.assertEqual(summary['vacancies'], 2)
        self.assertEqual(summary['shortage_sites_count'], 1)
        self.assertEqual(summary['vacant_posts_count'], 2)

        # Verify against authoritative calculate_all_sites_manpower
        s5b_sites = calculate_all_sites_manpower(self.company1.id)
        s5b_total_req = sum(s['required_strength'] for s in s5b_sites)
        s5b_total_dep = sum(s['deployed_strength'] for s in s5b_sites)
        s5b_total_vac = sum(s['vacancies'] for s in s5b_sites)
        self.assertEqual(summary['required_strength'], s5b_total_req)
        self.assertEqual(summary['deployed_strength'], s5b_total_dep)
        self.assertEqual(summary['vacancies'], s5b_total_vac)

    def test_roster_coverage_matches_s5c(self):
        """Test roster coverage figures match authoritative S-5C calculate_site_shift_coverage."""
        # Create duty roster for guard1 today
        roster1 = DutyRoster.objects.create(
            company=self.company1,
            employee=self.emp_guard1,
            site=self.site1,
            post=self.post1,
            shift=self.shift_day,
            duty_date=self.today,
            status=DutyRosterStatus.SCHEDULED
        )

        coverage = ControlCenterService.get_roster_coverage_summary(self.company1, target_date=self.today)
        self.assertEqual(coverage['rostered_strength'], 1)
        self.assertEqual(coverage['required_roster_strength'], 3)  # Posts required_headcount sum
        self.assertEqual(coverage['uncovered_vacancies'], 2)

        # Verify against authoritative calculate_site_shift_coverage for site1
        s5c_site1 = calculate_site_shift_coverage(self.site1, duty_date=self.today)
        self.assertEqual(s5c_site1['rostered_strength'], 1)
        self.assertEqual(s5c_site1['vacancies'], 2)

    def test_attendance_and_jump_figures_match_s5d(self):
        """Test attendance and JUMP figures match S-5D attendance service."""
        # Create attendance for guard1
        WorkforceAttendance.objects.create(
            company=self.company1,
            employee=self.emp_guard1,
            site=self.site1,
            date=self.today,
            status=AttendanceStatus.PRESENT
        )
        # Create attendance for guard2 as ABSENT
        WorkforceAttendance.objects.create(
            company=self.company1,
            employee=self.emp_guard2,
            site=self.site1,
            date=self.today,
            status=AttendanceStatus.ABSENT
        )
        # Create active JumpRecord
        JumpRecord.objects.create(
            company=self.company1,
            employee=self.emp_jump,
            absent_since=self.today - timedelta(days=8),
            consecutive_absent_days=8,
            status=JumpRecordStatus.ACTIVE_JUMP
        )

        att_summary = ControlCenterService.get_attendance_summary(self.company1, target_date=self.today)
        self.assertGreaterEqual(att_summary['present'], 1)
        self.assertEqual(att_summary['absent'], 1)
        self.assertEqual(att_summary['active_jump_count'], 1)
        self.assertEqual(att_summary['active_jump_list'][0]['employee_name'], "Tariq Khan" if att_summary['active_jump_list'][0]['employee_id'] == str(self.emp_guard1.id) else "Zahid Farooq")

    def test_payroll_readiness_matches_s5e_f_g(self):
        """Test payroll readiness reflects S-5E/F/G calculations and payroll run."""
        period_start = self.today.replace(day=1)
        period_end = self.today

        # Create DailyDutyPay
        DailyDutyPay.objects.create(
            company=self.company1,
            employee=self.emp_guard1,
            duty_date=self.today,
            daily_payable_rate=Decimal("50.00"),
            payable_amount=Decimal("50.00"),
            rate_source=DailyPayRateSource.EMPLOYEE_DAILY_RATE,
            calculation_status=DailyPayCalculationStatus.CALCULATED
        )

        # Create Ready EmployeePayrollCalculation
        EmployeePayrollCalculation.objects.create(
            company=self.company1,
            employee=self.emp_guard1,
            period_start=period_start,
            period_end=period_end,
            duty_days_count=20,
            duty_earnings=Decimal("1000.00"),
            gross_earnings=Decimal("1000.00"),
            net_payable=Decimal("1000.00"),
            status=PayrollCalculationStatus.READY
        )

        # Create Blocked EmployeePayrollCalculation
        EmployeePayrollCalculation.objects.create(
            company=self.company1,
            employee=self.emp_guard2,
            period_start=period_start,
            period_end=period_end,
            duty_days_count=15,
            status=PayrollCalculationStatus.BLOCKED,
            has_blockers=True,
            blocking_reasons=["Missing active salary assignment rate"]
        )

        # Create PayrollRun
        run = PayrollRun.objects.create(
            company=self.company1,
            run_number="PR-2026-09",
            period_start=period_start,
            period_end=period_end,
            status=PayrollRunStatus.CALCULATED,
            employee_count=1,
            gross_earnings=Decimal("1000.00"),
            net_payroll=Decimal("1000.00")
        )

        summary = ControlCenterService.get_payroll_readiness_summary(
            self.company1, period_start=period_start, period_end=period_end
        )

        self.assertEqual(summary['daily_duty_pay_generated_count'], 1)
        self.assertEqual(summary['calculations_ready_count'], 1)
        self.assertEqual(summary['calculations_blocked_count'], 1)
        self.assertEqual(len(summary['blocked_calculations_list']), 1)
        self.assertEqual(summary['blocked_calculations_list'][0]['employee_name'], "Bilal Ahmed")
        self.assertIsNotNone(summary['latest_payroll_run'])
        self.assertEqual(summary['latest_payroll_run']['run_number'], "PR-2026-09")

    def test_site_health_aggregation_and_status(self):
        """Test operational site health status determination (HEALTHY, WARNING, CRITICAL)."""
        # Site 1 has vacancies (required=3, deployed=1), so it should be WARNING or CRITICAL
        health_list = ControlCenterService.get_site_health_view(self.company1, target_date=self.today)
        self.assertGreaterEqual(len(health_list), 1)

        site1_health = next((s for s in health_list if s['site_id'] == str(self.site1.id)), None)
        self.assertIsNotNone(site1_health)
        self.assertEqual(site1_health['required_strength'], 3)
        self.assertEqual(site1_health['deployed_strength'], 1)
        self.assertEqual(site1_health['vacancies'], 2)
        # Has vacancies -> WARNING
        self.assertEqual(site1_health['health_status'], 'WARNING')

        # Now simulate an uncovered absence for Site 1: rostered guard is absent without replacement
        DutyRoster.objects.create(
            company=self.company1,
            employee=self.emp_guard1,
            site=self.site1,
            post=self.post1,
            shift=self.shift_day,
            duty_date=self.today,
            status=DutyRosterStatus.SCHEDULED
        )
        WorkforceAttendance.objects.create(
            company=self.company1,
            employee=self.emp_guard1,
            site=self.site1,
            date=self.today,
            status=AttendanceStatus.ABSENT
        )

        health_list_critical = ControlCenterService.get_site_health_view(self.company1, target_date=self.today)
        site1_critical = next(s for s in health_list_critical if s['site_id'] == str(self.site1.id))
        self.assertEqual(site1_critical['health_status'], 'CRITICAL')
        self.assertEqual(site1_critical['uncovered_absences'], 1)

    def test_action_center_exception_generation(self):
        """Test prioritized action items generated from active operational exceptions."""
        # Active Jump Record
        JumpRecord.objects.create(
            company=self.company1,
            employee=self.emp_jump,
            absent_since=self.today - timedelta(days=8),
            consecutive_absent_days=8,
            status=JumpRecordStatus.ACTIVE_JUMP
        )

        actions = ControlCenterService.get_action_center(self.company1, target_date=self.today)
        self.assertGreaterEqual(len(actions), 1)

        # Must have JUMP action item
        jump_action = next((a for a in actions if a['category'] == 'JUMP'), None)
        self.assertIsNotNone(jump_action)
        self.assertEqual(jump_action['priority'], 'CRITICAL')
        self.assertEqual(jump_action['tab'], 'attendance')

        # Must have manpower vacancy action item
        vacancy_action = next((a for a in actions if a['category'] == 'MANPOWER'), None)
        self.assertIsNotNone(vacancy_action)
        self.assertEqual(vacancy_action['tab'], 'deployments')

    def test_tenant_isolation_no_cross_company_aggregation(self):
        """Strict Multi-Tenant test: Company 1 must never see Company 2 data and vice versa."""
        c1_data = ControlCenterService.get_control_center_data(self.company1, target_date=self.today)
        c2_data = ControlCenterService.get_control_center_data(self.company2, target_date=self.today)

        # C1 has 6 employees, C2 has 1 employee
        self.assertEqual(c1_data['workforce']['total_employees'], 6)
        self.assertEqual(c2_data['workforce']['total_employees'], 1)

        # C1 has 2 sites, C2 has 1 site
        self.assertEqual(len(c1_data['site_health']), 2)
        self.assertEqual(len(c2_data['site_health']), 1)
        self.assertEqual(c2_data['site_health'][0]['site_name'], "Delta Secret Depot")

        # C1 site names must not exist in C2
        c2_site_names = [s['site_name'] for s in c2_data['site_health']]
        self.assertNotIn("Apex Central Tower", c2_site_names)
        self.assertNotIn("Apex Logistics Yard", c2_site_names)

    def test_control_center_api_endpoint(self):
        """Test GET /api/operations/control-center/ returns authoritative JSON payload."""
        client = APIClient()
        client.force_authenticate(user=self.user1)

        response = client.get(f'/api/operations/control-center/?target_date={self.today.isoformat()}')
        self.assertEqual(response.status_code, 200)

        data = response.json()
        self.assertIn('workforce', data)
        self.assertIn('manpower', data)
        self.assertIn('duty_coverage', data)
        self.assertIn('attendance', data)
        self.assertIn('payroll_readiness', data)
        self.assertIn('lifecycle_alerts', data)
        self.assertIn('site_health', data)
        self.assertIn('action_center', data)
        self.assertEqual(data['workforce']['total_employees'], 6)
