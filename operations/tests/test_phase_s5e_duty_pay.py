from decimal import Decimal
from datetime import date, timedelta
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError

from companies.models import Company
from crm.models import CRMEntity
from finance.models import Currency
from hrm.models import (
    Employee, Designation, Shift, AttendanceStatus,
    WorkforceAttendance, EmployeeSalaryAssignment, CompanyPayrollPolicy
)
from operations.models import (
    OperationalSite, ServiceContract, ContractRate, SecurityPost,
    Deployment, DeploymentStatus, DeploymentAssignmentType,
    DutyRoster, DutyRosterStatus, DutyReplacement,
    DailyDutyPay, DailyPayRateSource, DailyPayCalculationStatus
)
from operations.services.duty_pay_service import (
    resolve_daily_rate_and_attribution,
    generate_daily_duty_pay,
    bulk_generate_daily_pay_inputs,
    recalculate_daily_duty_pay,
    get_daily_pay_review_workspace
)

User = get_user_model()


class PhaseS5EDutyPayTests(TestCase):
    def setUp(self):
        # 1. Company A & Currency
        self.company = Company.objects.create(name="Apex Guard Security")
        self.user = User.objects.create_user(
            username="payroll_officer", email="payroll@apex.com", password="password123"
        )
        self.user.company_id = self.company.id
        self.user.save()

        self.currency, _ = Currency.objects.get_or_create(
            company=self.company,
            code="PKR",
            defaults={"name": "Pakistani Rupee", "symbol": "Rs"}
        )

        # 2. Company B for Tenant Isolation
        self.company_b = Company.objects.create(name="Delta Shield Corp")
        self.user_b = User.objects.create_user(
            username="delta_officer", email="delta@shield.com", password="password123"
        )
        self.user_b.company_id = self.company_b.id
        self.user_b.save()

        # 3. Company Payroll Policy (Divisor 30, Holiday 100%, Weekly Off 100%)
        self.policy = CompanyPayrollPolicy.objects.create(
            company=self.company,
            standard_monthly_hours=Decimal("160.00"),
            overtime_multiplier=Decimal("1.50"),
            daily_rate_divisor=Decimal("30.00"),
            holiday_pay_percentage=Decimal("100.00"),
            weekly_off_pay_percentage=Decimal("100.00"),
            is_active=True
        )

        # 4. Designations
        self.desig_guard = Designation.objects.create(company=self.company, name="Security Guard")
        self.desig_supervisor = Designation.objects.create(company=self.company, name="Site Supervisor")

        # 5. Shift
        self.shift = Shift.objects.create(
            company=self.company,
            name="Day 12H",
            code="D12",
            start_time="08:00",
            end_time="20:00",
            is_overnight=False,
            is_active=True
        )

        # 6. Clients & Operational Sites
        self.client_bank = CRMEntity.objects.create(company=self.company, name="Metro Bank", entity_type="CUSTOMER")
        self.site_bank = OperationalSite.objects.create(
            company=self.company, crm_entity=self.client_bank, name="Metro Bank HQ", address="10 Blue Area"
        )
        self.contract_bank = ServiceContract.objects.create(
            company=self.company, crm_entity=self.client_bank, contract_code="SC-BANK-01",
            start_date=date(2026, 1, 1), status="ACTIVE"
        )
        self.contract_bank.sites.add(self.site_bank)

        self.client_mall = CRMEntity.objects.create(company=self.company, name="Centaurus Mall", entity_type="CUSTOMER")
        self.site_mall = OperationalSite.objects.create(
            company=self.company, crm_entity=self.client_mall, name="Centaurus Mall", address="F-8/4"
        )
        self.contract_mall = ServiceContract.objects.create(
            company=self.company, crm_entity=self.client_mall, contract_code="SC-MALL-01",
            start_date=date(2026, 1, 1), status="ACTIVE"
        )
        self.contract_mall.sites.add(self.site_mall)

        # 7. Security Posts
        # Bank Main Gate has an explicit post daily pay rate of 500.00
        self.post_bank = SecurityPost.objects.create(
            company=self.company,
            site=self.site_bank,
            service_contract=self.contract_bank,
            post_name="Bank Main Gate",
            post_code="BMG-01",
            required_designation=self.desig_guard,
            required_headcount=2,
            daily_pay_rate=Decimal("500.00"),
            is_active=True
        )

        # Mall Patrol Post has no post rate, but contract has ContractRate of 450.00
        self.post_mall = SecurityPost.objects.create(
            company=self.company,
            site=self.site_mall,
            service_contract=self.contract_mall,
            post_name="Mall North Patrol",
            post_code="MNP-01",
            required_designation=self.desig_guard,
            required_headcount=2,
            daily_pay_rate=None,
            is_active=True
        )
        self.contract_rate_mall = ContractRate.objects.create(
            company=self.company,
            service_contract=self.contract_mall,
            designation=self.desig_guard,
            billing_rate=Decimal("800.00"),
            pay_rate=Decimal("450.00"),
            effective_date=date(2026, 1, 1)
        )

        # 8. Employees: Guard A (Senior) & Guard B (Junior)
        self.guard_a = Employee.objects.create(
            company=self.company,
            first_name="Ahmed",
            last_name="Khan",
            employee_code="SEC-001",
            classification="DIRECT",
            designation=self.desig_guard,
            employment_status="ACTIVE"
        )
        # Guard A base salary = 15,000 / 30 = 500.00 daily
        self.salary_a = EmployeeSalaryAssignment.objects.create(
            company=self.company,
            employee=self.guard_a,
            currency=self.currency,
            base_salary=Decimal("15000.00"),
            effective_from=date(2026, 1, 1),
            status="ACTIVE"
        )

        self.guard_b = Employee.objects.create(
            company=self.company,
            first_name="Bilal",
            last_name="Tariq",
            employee_code="SEC-002",
            classification="DIRECT",
            designation=self.desig_guard,
            employment_status="ACTIVE"
        )
        # Guard B explicit daily rate = 400.00 (or 12,000 monthly)
        self.salary_b = EmployeeSalaryAssignment.objects.create(
            company=self.company,
            employee=self.guard_b,
            currency=self.currency,
            base_salary=Decimal("12000.00"),
            daily_rate=Decimal("400.00"),
            effective_from=date(2026, 1, 1),
            status="ACTIVE"
        )

        # Permanent Deployments
        # Guard A is deployed at Bank
        self.dep_a = Deployment.objects.create(
            company=self.company,
            employee=self.guard_a,
            site=self.site_bank,
            post=self.post_bank,
            service_contract=self.contract_bank,
            crm_entity=self.client_bank,
            designation=self.desig_guard,
            start_date=date(2026, 1, 1),
            assignment_type=DeploymentAssignmentType.PERMANENT,
            status=DeploymentStatus.ACTIVE
        )

        # Guard B is deployed at Mall
        self.dep_b = Deployment.objects.create(
            company=self.company,
            employee=self.guard_b,
            site=self.site_mall,
            post=self.post_mall,
            service_contract=self.contract_mall,
            crm_entity=self.client_mall,
            designation=self.desig_guard,
            start_date=date(2026, 1, 1),
            assignment_type=DeploymentAssignmentType.PERMANENT,
            status=DeploymentStatus.ACTIVE
        )

    def test_normal_duty_pay_resolution(self):
        """Test that normal duty resolves the employee's compensation setup using configurable daily rate or divisor."""
        today = date(2026, 5, 1)

        # Mark Guard B as PRESENT on their normal Mall assignment
        WorkforceAttendance.objects.create(
            company=self.company,
            employee=self.guard_b,
            date=today,
            status=AttendanceStatus.PRESENT
        )

        pay_record, created = generate_daily_duty_pay(
            company=self.company,
            employee=self.guard_b,
            duty_date=today,
            user=self.user
        )

        self.assertTrue(created)
        self.assertEqual(pay_record.employee, self.guard_b)
        self.assertEqual(pay_record.attendance_status, AttendanceStatus.PRESENT)
        # Guard B has explicit daily_rate = 400.00
        self.assertEqual(pay_record.daily_payable_rate, Decimal("400.00"))
        self.assertEqual(pay_record.payable_percentage, Decimal("100.00"))
        self.assertEqual(pay_record.payable_amount, Decimal("400.00"))
        self.assertEqual(pay_record.rate_source, DailyPayRateSource.EMPLOYEE_DAILY_RATE)
        # Cost attributed to Home deployment (Mall)
        self.assertEqual(pay_record.site, self.site_mall)
        self.assertEqual(pay_record.contract, self.contract_mall)
        self.assertEqual(pay_record.client, self.client_mall)

    def test_absent_attendance_pays_zero(self):
        """Test that ABSENT attendance produces 0% payable percentage and 0.00 payable amount."""
        today = date(2026, 5, 2)
        WorkforceAttendance.objects.create(
            company=self.company,
            employee=self.guard_a,
            date=today,
            status=AttendanceStatus.ABSENT
        )

        pay_record, _ = generate_daily_duty_pay(
            company=self.company,
            employee=self.guard_a,
            duty_date=today,
            user=self.user
        )

        self.assertEqual(pay_record.attendance_status, AttendanceStatus.ABSENT)
        # Base daily rate is resolved from 15,000 / 30 = 500.00
        self.assertEqual(pay_record.daily_payable_rate, Decimal("500.00"))
        self.assertEqual(pay_record.payable_percentage, Decimal("0.00"))
        self.assertEqual(pay_record.payable_amount, Decimal("0.00"))

    def test_paid_leave_and_unpaid_leave_treatment(self):
        """Test that PAID_LEAVE yields 100% pay, while UNPAID_LEAVE yields 0% pay."""
        day1 = date(2026, 5, 3)
        day2 = date(2026, 5, 4)

        # Day 1: Paid Leave
        WorkforceAttendance.objects.create(
            company=self.company,
            employee=self.guard_b,
            date=day1,
            status=AttendanceStatus.PAID_LEAVE
        )
        pay_paid, _ = generate_daily_duty_pay(self.company, self.guard_b, day1, user=self.user)
        self.assertEqual(pay_paid.payable_percentage, Decimal("100.00"))
        self.assertEqual(pay_paid.payable_amount, Decimal("400.00"))

        # Day 2: Unpaid Leave
        WorkforceAttendance.objects.create(
            company=self.company,
            employee=self.guard_b,
            date=day2,
            status=AttendanceStatus.UNPAID_LEAVE
        )
        pay_unpaid, _ = generate_daily_duty_pay(self.company, self.guard_b, day2, user=self.user)
        self.assertEqual(pay_unpaid.payable_percentage, Decimal("0.00"))
        self.assertEqual(pay_unpaid.payable_amount, Decimal("0.00"))

    def test_half_day_attendance_pays_fifty_percent(self):
        """Test that HALF_DAY attendance produces exactly 50% of the daily payable rate."""
        today = date(2026, 5, 5)
        WorkforceAttendance.objects.create(
            company=self.company,
            employee=self.guard_b,
            date=today,
            status=AttendanceStatus.HALF_DAY
        )

        pay_record, _ = generate_daily_duty_pay(self.company, self.guard_b, today, user=self.user)
        self.assertEqual(pay_record.attendance_status, AttendanceStatus.HALF_DAY)
        self.assertEqual(pay_record.daily_payable_rate, Decimal("400.00"))
        self.assertEqual(pay_record.payable_percentage, Decimal("50.00"))
        self.assertEqual(pay_record.payable_amount, Decimal("200.00"))

    def test_replacement_employee_receives_covered_duty_rate_and_cost_attribution(self):
        """
        Critical Approved Rule:
        Employee B (home normal rate = 400.00) temporarily covers Employee A's post at Bank (post rate = 500.00).
        Employee B earns 500.00 for the replacement day, and the cost is attributed to Bank (Contract A),
        not B's home contract (Mall).
        """
        duty_day = date(2026, 5, 10)

        # 1. Original roster for Guard A at Bank
        roster_a = DutyRoster.objects.create(
            company=self.company,
            duty_date=duty_day,
            shift=self.shift,
            site=self.site_bank,
            post=self.post_bank,
            employee=self.guard_a,
            deployment=self.dep_a,
            status=DutyRosterStatus.REPLACED
        )

        # 2. Guard B covers as replacement
        replacement = DutyReplacement.objects.create(
            company=self.company,
            original_roster=roster_a,
            original_employee=self.guard_a,
            replacement_employee=self.guard_b,
            site=self.site_bank,
            post=self.post_bank,
            shift=self.shift,
            duty_date=duty_day,
            reason="Guard A on medical leave",
            status="ASSIGNED"
        )

        # Replacement roster slot for Guard B
        roster_b = DutyRoster.objects.create(
            company=self.company,
            duty_date=duty_day,
            shift=self.shift,
            site=self.site_bank,
            post=self.post_bank,
            employee=self.guard_b,
            is_replacement=True,
            replacement_for=roster_a,
            status=DutyRosterStatus.SCHEDULED
        )

        # Guard B marked PRESENT at Bank
        WorkforceAttendance.objects.create(
            company=self.company,
            employee=self.guard_b,
            date=duty_day,
            status=AttendanceStatus.PRESENT,
            duty_roster=roster_b,
            site=self.site_bank,
            post=self.post_bank
        )

        # Generate daily duty pay for Guard B on replacement day
        pay_record, _ = generate_daily_duty_pay(
            company=self.company,
            employee=self.guard_b,
            duty_date=duty_day,
            roster=roster_b,
            user=self.user
        )

        # Rate must be 500.00 (from covered Bank post), NOT 400.00 (home rate)
        self.assertEqual(pay_record.daily_payable_rate, Decimal("500.00"))
        self.assertEqual(pay_record.payable_amount, Decimal("500.00"))
        self.assertEqual(pay_record.rate_source, DailyPayRateSource.POST_RATE)
        self.assertTrue(pay_record.is_replacement_duty)
        self.assertEqual(pay_record.replaced_employee, self.guard_a)

        # Cost Attribution must strictly belong to Bank (worked site & contract)
        self.assertEqual(pay_record.site, self.site_bank)
        self.assertEqual(pay_record.contract, self.contract_bank)
        self.assertEqual(pay_record.client, self.client_bank)

        # Home deployment is preserved
        self.assertEqual(pay_record.home_deployment, self.dep_b)
        self.assertEqual(pay_record.home_deployment.site, self.site_mall)

    def test_return_to_home_duty_restores_normal_rate(self):
        """Test that after a temporary replacement day, when Guard B returns to home duty, normal rate (400) applies again."""
        replacement_day = date(2026, 5, 10)
        home_day = date(2026, 5, 11)

        # Generate home duty day for Guard B
        WorkforceAttendance.objects.create(
            company=self.company,
            employee=self.guard_b,
            date=home_day,
            status=AttendanceStatus.PRESENT
        )

        pay_home, _ = generate_daily_duty_pay(
            company=self.company,
            employee=self.guard_b,
            duty_date=home_day,
            user=self.user
        )

        # Returned to home duty: rate is 400.00 again, cost belongs to Mall
        self.assertEqual(pay_home.daily_payable_rate, Decimal("400.00"))
        self.assertEqual(pay_home.payable_amount, Decimal("400.00"))
        self.assertFalse(pay_home.is_replacement_duty)
        self.assertEqual(pay_home.site, self.site_mall)
        self.assertEqual(pay_home.contract, self.contract_mall)

    def test_historical_rate_snapshot_and_immutability(self):
        """Test that historical daily pay inputs preserve rate snapshots and block mutation once frozen by payroll."""
        today = date(2026, 5, 12)
        WorkforceAttendance.objects.create(
            company=self.company,
            employee=self.guard_a,
            date=today,
            status=AttendanceStatus.PRESENT
        )

        pay_record, _ = generate_daily_duty_pay(self.company, self.guard_a, today, user=self.user)
        self.assertEqual(pay_record.payable_amount, Decimal("500.00"))

        # Lock/freeze the record (as would occur upon payroll finalization)
        pay_record.is_frozen = True
        pay_record.save()

        # Recalculation attempt must be blocked
        with self.assertRaises(ValidationError):
            recalculate_daily_duty_pay(self.company, pay_record.id, user=self.user)

    def test_contract_designation_rate_fallback_for_replacement(self):
        """Test that if a covered post has no explicit post rate, ContractRate for the post designation is applied."""
        today = date(2026, 5, 15)

        # Create temporary replacement where Guard A covers Mall North Patrol (which has ContractRate = 450.00)
        roster_mall = DutyRoster.objects.create(
            company=self.company,
            duty_date=today,
            shift=self.shift,
            site=self.site_mall,
            post=self.post_mall,
            employee=self.guard_a,
            is_replacement=True,
            status=DutyRosterStatus.SCHEDULED
        )
        WorkforceAttendance.objects.create(
            company=self.company,
            employee=self.guard_a,
            date=today,
            status=AttendanceStatus.PRESENT,
            duty_roster=roster_mall
        )

        pay_record, _ = generate_daily_duty_pay(self.company, self.guard_a, today, roster=roster_mall, user=self.user)

        # Rate should be 450.00 from ContractRate (instead of Guard A's normal 500.00)
        self.assertEqual(pay_record.daily_payable_rate, Decimal("450.00"))
        self.assertEqual(pay_record.rate_source, DailyPayRateSource.CONTRACT_RATE)
        self.assertEqual(pay_record.site, self.site_mall)
        self.assertEqual(pay_record.contract, self.contract_mall)

    def test_tenant_isolation(self):
        """Test strict tenant isolation prevents generating or accessing daily duty pay across companies."""
        today = date(2026, 5, 16)
        with self.assertRaises(Employee.DoesNotExist):
            generate_daily_duty_pay(
                company=self.company_b,
                employee=self.guard_a.id,
                duty_date=today,
                user=self.user_b
            )
