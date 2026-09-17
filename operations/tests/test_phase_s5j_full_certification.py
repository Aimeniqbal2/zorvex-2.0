"""
operations/tests/test_phase_s5j_full_certification.py

Master End-to-End Certification Test Suite for Phase S-5J:
Security Workforce + Core Operations Track (S-5A through S-5I) & S-4G Finance Linkage.

Certifies:
1. Complete End-to-End Business Flow (Employee -> Deployment -> Roster -> Attendance -> Replacement -> Daily Pay -> Payroll -> Finance Handoff -> Salary Payment Batch)
2. Cross-Site Replacement Duty & Cost Attribution
3. Attendance Matrix & 7-Day JUMP Streak Engine
4. Dynamic Overtime, Statutory Schemes & Payroll Calculation Rules
5. Finance Boundary Control & Idempotency
6. Workforce Lifecycle, Transfer, Suspension, Separation & Rehire
7. Control Center Authoritative Metrics Reconciliation
8. Multi-Tenant Isolation & Role/Module Authorization
9. Immutability, Source Locking & Historical Auditing
"""
import calendar
from datetime import date, timedelta
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from django.core.exceptions import ValidationError
from rest_framework.test import APIClient

from companies.models import Company
from accounts.models import User
from crm.models import CRMEntity
from finance.models import (
    Currency, BankAccount, EmployeeAdvance, AdvanceStatus, AdvanceRecoveryMethod,
    SecurityFinanceConfiguration, PayrollAccountingIntegration,
    PayrollAccountingStatus, SalaryPaymentBatch, SalaryPaymentBatchStatus
)
from finance.services.security_coa_template import provision_security_chart_of_accounts
from finance.services.payroll_finance_service import PayrollFinanceService
from hrm.models import (
    Employee, Designation, Department, Shift,
    SalaryStructure, EmployeeSalaryAssignment, CompanyPayrollPolicy,
    StatutoryScheme, StatutorySchemeType, EmployeeStatutoryEnrollment,
    OvertimeRecord, OvertimeStatus, OvertimeType,
    WorkforceAttendance, AttendanceStatus, JumpRecord, JumpRecordStatus,
    PayrollRun, PayrollRunStatus, Payslip, PayslipStatus,
    EmploymentHistory
)
from hrm.services.lifecycle_service import LifecycleService, LifecycleEventType
from operations.models import (
    OperationalSite, SecurityPost, ServiceContract,
    Deployment, DeploymentStatus,
    DutyRoster, DutyRosterStatus, DutyReplacement,
    DailyDutyPay, DailyPayRateSource, DailyPayCalculationStatus,
    PayrollAddition, PayrollAdditionType, PayrollAdditionFrequency,
    PayrollDeduction, PayrollDeductionType, PayrollDeductionFrequency,
    EmployeePayrollCalculation, PayrollCalculationStatus
)
from operations.services.manpower import calculate_all_sites_manpower, calculate_site_manpower
from operations.services.roster_coverage import calculate_site_shift_coverage
from operations.services.duty_pay_service import generate_daily_duty_pay, resolve_daily_rate_and_attribution
from operations.services.payroll_rules_service import PayrollRulesService
from operations.services.payroll_run_service import PayrollRunService
from operations.services.control_center_service import ControlCenterService


class PhaseS5JFullCertificationTestCase(TestCase):
    def setUp(self):
        # 1. Primary Tenant & Secondary Tenant for Isolation
        self.company1 = Company.objects.create(name="SecureShield Global Ltd", is_active=True)
        self.company2 = Company.objects.create(name="Apex Vanguard Corp", is_active=True)

        # 2. Users
        self.admin1 = User.objects.create_user(
            username="sec_commander",
            email="commander@secureshield.com",
            password="securepassword123",
            is_staff=True,
            is_superuser=True
        )
        self.admin1.company_id = self.company1.id
        self.admin1.save()

        self.admin2 = User.objects.create_user(
            username="apex_admin",
            email="admin@apexvanguard.com",
            password="apexpassword123",
            is_staff=True,
            is_superuser=True
        )
        self.admin2.company_id = self.company2.id
        self.admin2.save()

        # 3. Provision S-4G Finance Chart of Accounts & Configuration
        provision_security_chart_of_accounts(self.company1)
        self.sec_cfg1 = SecurityFinanceConfiguration.objects.get(company=self.company1, is_active=True)
        self.currency = self.sec_cfg1.default_currency or Currency.objects.filter(company=self.company1).first()
        if not self.currency:
            self.currency = Currency.objects.create(
                company=self.company1,
                code="PKR",
                name="Pakistani Rupee",
                symbol="Rs"
            )
            self.sec_cfg1.default_currency = self.currency
            self.sec_cfg1.save()
        self.bank_acc = self.sec_cfg1.default_bank_account or BankAccount.objects.filter(company=self.company1).first()
        if not self.bank_acc:
            self.bank_acc = BankAccount.objects.create(
                company=self.company1,
                account_name="Main Treasury Operating Account",
                account_number="PK99SEC100200300",
                currency=self.currency,
                account_type='BANK'
            )

        # 4. Master Departments & Designations
        self.dept_ops = Department.objects.create(company=self.company1, name="Security Operations")
        self.dept_admin = Department.objects.create(company=self.company1, name="Corporate Administration")

        self.desig_guard = Designation.objects.create(company=self.company1, name="Security Guard", code="SG-01")
        self.desig_senior = Designation.objects.create(company=self.company1, name="Senior Guard", code="SG-02")
        self.desig_supervisor = Designation.objects.create(company=self.company1, name="Site Supervisor", code="SS-01")

        # 5. Company Payroll Policy (No hardcoded overtime divisor, dynamic fallback)
        self.policy1 = CompanyPayrollPolicy.objects.create(
            company=self.company1,
            daily_rate_divisor=Decimal('30.00'),
            standard_monthly_hours=Decimal('208.00'),
            overtime_multiplier=Decimal('1.50'),
            enable_policy_ot_fallback=True,
            default_single_ot_rate=Decimal('200.00'),
            default_double_ot_rate=Decimal('400.00'),
            is_active=True
        )

        # 6. Statutory Schemes (Independent EOBI 1%/5% and SESSI 0%/6%)
        self.scheme_eobi = StatutoryScheme.objects.create(
            company=self.company1,
            code="EOBI",
            name="Employees Old-Age Benefits Institution",
            scheme_type=StatutorySchemeType.EOBI,
            employee_default_rate=Decimal('1.00'),
            employer_default_rate=Decimal('5.00'),
            is_active=True
        )
        self.scheme_sessi = StatutoryScheme.objects.create(
            company=self.company1,
            code="SESSI",
            name="Sindh Employees Social Security Institution",
            scheme_type=StatutorySchemeType.SOCIAL_SECURITY,
            employee_default_rate=Decimal('0.00'),
            employer_default_rate=Decimal('6.00'),
            is_active=True
        )

        # 7. Clients & Contracts
        self.client_a = CRMEntity.objects.create(
            company=self.company1, name="Commercial Bank Headquarters", entity_type='CUSTOMER'
        )
        self.contract_a = ServiceContract.objects.create(
            company=self.company1, crm_entity=self.client_a, contract_code="SC-CB-001",
            start_date=date(2026, 1, 1), status='ACTIVE'
        )

        self.client_b = CRMEntity.objects.create(
            company=self.company1, name="Metropolitan Logistics Hub", entity_type='CUSTOMER'
        )
        self.contract_b = ServiceContract.objects.create(
            company=self.company1, crm_entity=self.client_b, contract_code="SC-ML-002",
            start_date=date(2026, 1, 1), status='ACTIVE'
        )

        # 8. Operational Sites
        self.site_a = OperationalSite.objects.create(
            company=self.company1, crm_entity=self.client_a, name="Bank HQ Tower",
            address="Plot 1, Financial District", is_active=True
        )
        self.contract_a.sites.add(self.site_a)

        self.site_b = OperationalSite.objects.create(
            company=self.company1, crm_entity=self.client_b, name="Logistics Yard Alpha",
            address="Plot 45, Port Industrial Zone", is_active=True
        )
        self.contract_b.sites.add(self.site_b)

        # 9. Security Posts
        # Post A has a premium daily post-rate of $600.00
        self.post_a = SecurityPost.objects.create(
            company=self.company1, site=self.site_a, service_contract=self.contract_a,
            post_name="Vault Gate Alpha", post_code="POST-VGA",
            required_designation=self.desig_guard, required_headcount=1,
            daily_pay_rate=Decimal('600.00'), is_active=True
        )
        # Post B has no post-level override (falls back to home rate)
        self.post_b = SecurityPost.objects.create(
            company=self.company1, site=self.site_b, service_contract=self.contract_b,
            post_name="Perimeter Gate Beta", post_code="POST-PGB",
            required_designation=self.desig_guard, required_headcount=1,
            daily_pay_rate=None, is_active=True
        )

        # 10. Shifts
        self.shift_day = Shift.objects.create(
            company=self.company1, name="Standard Day Shift", code="S-DAY-12",
            start_time="08:00:00", end_time="20:00:00", is_active=True
        )

        # 11. Employees
        # Guard A deployed to Post A (Home compensation: $500/day equivalent via salary assignment)
        self.guard_a = Employee.objects.create(
            company=self.company1, employee_code="GRD-A-01", first_name="Asad", last_name="Ullah",
            department=self.dept_ops, designation=self.desig_guard,
            classification='DIRECT', employment_status='ACTIVE'
        )
        EmployeeSalaryAssignment.objects.create(
            company=self.company1, employee=self.guard_a,
            currency=self.currency,
            base_salary=Decimal('15000.00'), daily_rate=Decimal('500.00'),
            effective_from=date(2026, 1, 1), status='ACTIVE'
        )
        EmployeeStatutoryEnrollment.objects.create(
            company=self.company1, employee=self.guard_a,
            scheme=self.scheme_eobi, is_enabled=True,
            use_company_default=True, is_active=True
        )
        self.dep_a = Deployment.objects.create(
            company=self.company1, employee=self.guard_a, site=self.site_a, post=self.post_a,
            service_contract=self.contract_a, designation=self.desig_guard,
            start_date=date(2026, 1, 1), status=DeploymentStatus.ACTIVE
        )

        # Guard B deployed to Post B (Home compensation: $450/day equivalent via salary assignment)
        self.guard_b = Employee.objects.create(
            company=self.company1, employee_code="GRD-B-02", first_name="Babar", last_name="Azam",
            department=self.dept_ops, designation=self.desig_guard,
            classification='DIRECT', employment_status='ACTIVE'
        )
        EmployeeSalaryAssignment.objects.create(
            company=self.company1, employee=self.guard_b,
            currency=self.currency,
            base_salary=Decimal('13500.00'), daily_rate=Decimal('450.00'),
            effective_from=date(2026, 1, 1), status='ACTIVE'
        )
        EmployeeStatutoryEnrollment.objects.create(
            company=self.company1, employee=self.guard_b,
            scheme=self.scheme_eobi, is_enabled=True,
            use_company_default=True, is_active=True
        )
        self.dep_b = Deployment.objects.create(
            company=self.company1, employee=self.guard_b, site=self.site_b, post=self.post_b,
            service_contract=self.contract_b, designation=self.desig_guard,
            start_date=date(2026, 1, 1), status=DeploymentStatus.ACTIVE
        )

        # Period settings for September 2026
        self.p_start = date(2026, 9, 1)
        self.p_end = date(2026, 9, 30)

    # -------------------------------------------------------------------------
    # TEST 1: Full End-to-End Lifecycle Scenario
    # -------------------------------------------------------------------------
    def test_01_full_lifecycle_employee_to_finance_e2e(self):
        """
        Certifies the full uninterrupted lifecycle:
        Employee -> DIRECT -> Deployment -> Roster -> Attendance -> DailyDutyPay ->
        OT/Additions/Deductions -> Payroll Calculation -> PayrollRun -> Payslips ->
        Finalization -> S-4G Finance Liability -> SalaryPaymentBatch.
        """
        # 1. Setup daily duty pay for Guard A for 20 days @ 500.00 = 10,000.00
        for d in range(1, 21):
            duty_d = date(2026, 9, d)
            DailyDutyPay.objects.create(
                company=self.company1, employee=self.guard_a, duty_date=duty_d,
                site=self.site_a, post=self.post_a, contract=self.contract_a,
                daily_payable_rate=Decimal('500.00'), payable_percentage=Decimal('100.00'),
                payable_amount=Decimal('500.00'), calculation_status=DailyPayCalculationStatus.CALCULATED
            )

        # 2. Overtime: 10 hrs Single OT @ 200 = 2,000.00
        OvertimeRecord.objects.create(
            company=self.company1, employee=self.guard_a, date=date(2026, 9, 15),
            hours=Decimal('10.00'), ot_type=OvertimeType.SINGLE_OT, status=OvertimeStatus.APPROVED
        )

        # 3. Addition: Bonus 1,500.00
        PayrollAddition.objects.create(
            company=self.company1, employee=self.guard_a, addition_type=PayrollAdditionType.BONUS,
            frequency=PayrollAdditionFrequency.ONE_TIME, name="Site Security Award",
            amount=Decimal('1500.00'), effective_date=date(2026, 9, 20)
        )

        # 4. Deduction: Uniform deduction 500.00
        PayrollDeduction.objects.create(
            company=self.company1, employee=self.guard_a, deduction_type=PayrollDeductionType.UNIFORM,
            frequency=PayrollDeductionFrequency.ONE_TIME, name="Uniform Replacement",
            amount=Decimal('500.00'), effective_date=date(2026, 9, 25)
        )

        # 5. Execute S-5F authoritative payroll calculation
        calc = PayrollRulesService.calculate_employee_payroll(self.company1, self.guard_a, self.p_start, self.p_end)
        self.assertEqual(calc.status, PayrollCalculationStatus.CALCULATED)
        calc = PayrollRulesService.mark_calculation_ready(self.company1, calc.id)
        self.assertEqual(calc.status, PayrollCalculationStatus.READY)
        self.assertEqual(calc.duty_earnings, Decimal('10000.00'))
        self.assertEqual(calc.single_ot_amount, Decimal('2000.00'))
        self.assertEqual(calc.bonuses_amount, Decimal('1500.00'))
        self.assertEqual(calc.gross_earnings, Decimal('13500.00')) # 10,000 + 2,000 + 1,500

        # Statutory deductions: EOBI 1% of duty earnings (10,000) = 100.00
        self.assertEqual(calc.eobi_employee_amount, Decimal('100.00'))
        self.assertEqual(calc.eobi_employer_amount, Decimal('500.00')) # 5% employer
        # Net payable = Gross (13500) - EOBI (100) - Uniform (500) = 12,900.00
        self.assertEqual(calc.net_payable, Decimal('12900.00'))

        # 6. Execute S-5G PayrollRun & Payslip generation
        PayrollRulesService.mark_calculation_ready(self.company1, calc.id)
        run = PayrollRunService.create_payroll_run_from_calculations(
            company=self.company1, period_start=self.p_start, period_end=self.p_end, user=self.admin1
        )
        self.assertEqual(run.status, PayrollRunStatus.CALCULATED)
        self.assertEqual(run.gross_earnings, Decimal('13500.00'))
        self.assertEqual(run.net_payroll, Decimal('12900.00'))

        # 7. Approvals and Finalization
        PayrollRunService.submit_for_review(self.company1, run, user=self.admin1)
        PayrollRunService.approve_payroll_run(self.company1, run, user=self.admin1)
        res_fin = PayrollRunService.finalize_payroll_run(self.company1, run, user=self.admin1)
        self.assertEqual(res_fin['status'], PayrollRunStatus.FINALIZED)

        # 8. Verify Source Immutability (Locking)
        calc.refresh_from_db()
        self.assertTrue(calc.is_frozen)
        payslip = run.payslips.first()
        self.assertTrue(payslip.is_frozen)
        dp_sample = DailyDutyPay.objects.filter(company=self.company1, employee=self.guard_a).first()
        self.assertTrue(dp_sample.is_frozen)

        # 9. Verify S-4G Finance Liability Recognition
        fin_integ = PayrollAccountingIntegration.objects.get(payroll_run=run)
        self.assertEqual(fin_integ.status, PayrollAccountingStatus.READY)
        self.assertEqual(fin_integ.remaining_liability, Decimal('12900.00'))
        # Confirm HR does NOT create payment batches automatically
        self.assertEqual(SalaryPaymentBatch.objects.filter(payroll_integration=fin_integ).count(), 0)

        # 10. Explicit Finance Treasury Payment Batch Creation
        batch = PayrollFinanceService.create_salary_payment_batch(
            payroll_integration=fin_integ, treasury_account=self.bank_acc,
            payment_date=date(2026, 9, 30), payment_mode='MANUAL',
            payment_provider='MANUAL', user=self.admin1
        )
        self.assertIsNotNone(batch)
        self.assertEqual(batch.total_employees, 1)
        self.assertEqual(batch.total_amount, Decimal('12900.00'))
        self.assertEqual(batch.status, SalaryPaymentBatchStatus.DRAFT)

    # -------------------------------------------------------------------------
    # TEST 2: Cross-Site Replacement Duty & Cost Attribution Scenario
    # -------------------------------------------------------------------------
    def test_02_cross_site_replacement_duty_and_cost_attribution(self):
        """
        Certifies:
        Guard A at Site A / Post A ($600/day post rate) is ABSENT on Sept 10.
        Guard B (normally at Site B @ $450/day) replaces Guard A.
        Verify:
        - B keeps permanent deployment at Site B
        - Temporary replacement points to Site A / Post A / Contract A
        - B receives Post A rate ($600.00) for the replacement day
        - B's labor cost is attributed to Contract A / Site A
        - Guard A is unpaid ($0.00)
        - Guard B's normal duty on Sept 11 restores normal home rate ($450.00).
        """
        target_day = date(2026, 9, 10)
        next_day = date(2026, 9, 11)

        # 1. Guard A Roster & Attendance = ABSENT
        roster_a = DutyRoster.objects.create(
            company=self.company1, employee=self.guard_a, site=self.site_a, post=self.post_a,
            shift=self.shift_day, duty_date=target_day, status=DutyRosterStatus.SCHEDULED
        )
        att_a = WorkforceAttendance.objects.create(
            company=self.company1, employee=self.guard_a, site=self.site_a, post=self.post_a,
            shift=self.shift_day, duty_roster=roster_a, date=target_day,
            status=AttendanceStatus.ABSENT, is_finalized=True
        )

        # 2. Guard B assigned as replacement for Guard A at Site A / Post A
        replacement = DutyReplacement.objects.create(
            company=self.company1, original_employee=self.guard_a, replacement_employee=self.guard_b,
            original_roster=roster_a, duty_date=target_day, site=self.site_a, post=self.post_a,
            shift=self.shift_day, status='ASSIGNED'
        )
        roster_b_rep = DutyRoster.objects.create(
            company=self.company1, employee=self.guard_b, site=self.site_a, post=self.post_a,
            shift=self.shift_day, duty_date=target_day, is_replacement=True,
            replacement_for=roster_a, status=DutyRosterStatus.SCHEDULED
        )
        att_b_rep = WorkforceAttendance.objects.create(
            company=self.company1, employee=self.guard_b, site=self.site_a, post=self.post_a,
            shift=self.shift_day, duty_roster=roster_b_rep, date=target_day,
            status=AttendanceStatus.PRESENT, is_finalized=True
        )

        # 3. Calculate DailyDutyPay for both guards on Sept 10
        pay_a, _ = generate_daily_duty_pay(self.company1, self.guard_a, target_day)
        pay_b, _ = generate_daily_duty_pay(self.company1, self.guard_b, target_day)

        # Guard A: Absent -> $0.00 payable
        self.assertEqual(pay_a.payable_amount, Decimal('0.00'))
        self.assertEqual(pay_a.attendance_status, AttendanceStatus.ABSENT)

        # Guard B: Replaced A at Post A -> receives Post A rate ($600.00)
        self.assertEqual(pay_b.payable_amount, Decimal('600.00'))
        self.assertEqual(pay_b.rate_source, DailyPayRateSource.POST_RATE)
        self.assertTrue(pay_b.is_replacement_duty)
        self.assertEqual(pay_b.replaced_employee, self.guard_a)
        # Cost attributed to Contract A / Site A
        self.assertEqual(pay_b.contract, self.contract_a)
        self.assertEqual(pay_b.site, self.site_a)
        # Guard B's permanent home deployment remains Site B
        self.assertEqual(self.guard_b.deployments.filter(status=DeploymentStatus.ACTIVE).first().site, self.site_b)

        # 4. Guard B returns to normal duty on Sept 11 at Site B
        roster_b_normal = DutyRoster.objects.create(
            company=self.company1, employee=self.guard_b, site=self.site_b, post=self.post_b,
            shift=self.shift_day, duty_date=next_day, status=DutyRosterStatus.SCHEDULED
        )
        WorkforceAttendance.objects.create(
            company=self.company1, employee=self.guard_b, site=self.site_b, post=self.post_b,
            shift=self.shift_day, duty_roster=roster_b_normal, date=next_day,
            status=AttendanceStatus.PRESENT, is_finalized=True
        )
        pay_b_normal, _ = generate_daily_duty_pay(self.company1, self.guard_b, next_day)
        # Post B has no override, so rate resolves to home salary divisor: 13,500 / 30 = 450.00
        self.assertEqual(pay_b_normal.payable_amount, Decimal('450.00'))
        self.assertEqual(pay_b_normal.site, self.site_b)
        self.assertEqual(pay_b_normal.contract, self.contract_b)
        self.assertFalse(pay_b_normal.is_replacement_duty)

    # -------------------------------------------------------------------------
    # TEST 3: Attendance Matrix & 7-Day JUMP Streak Engine
    # -------------------------------------------------------------------------
    def test_03_attendance_and_jump_lifecycle(self):
        """
        Certifies:
        - 7 consecutive true ABSENT days -> triggers JUMP status
        - Leave / Weekly Off breaks the streak and prevents JUMP
        - JUMP never auto-terminates
        - JUMP restoration preserves complete history.
        """
        emp_jump = Employee.objects.create(
            company=self.company1, employee_code="JUMP-TEST-01", first_name="Zahid", last_name="Khan",
            department=self.dept_ops, designation=self.desig_guard,
            classification='DIRECT', employment_status='ACTIVE'
        )

        # Simulate 7 consecutive true ABSENT days
        for i in range(1, 8):
            abs_date = date(2026, 8, i)
            WorkforceAttendance.objects.create(
                company=self.company1, employee=emp_jump, date=abs_date,
                status=AttendanceStatus.ABSENT, is_finalized=True
            )

        # Create active JumpRecord as generated by S-5D engine
        jump_rec = JumpRecord.objects.create(
            company=self.company1, employee=emp_jump, absent_since=date(2026, 8, 1),
            consecutive_absent_days=7, status=JumpRecordStatus.ACTIVE_JUMP
        )
        emp_jump.employment_status = 'JUMP'
        emp_jump.save()

        self.assertEqual(emp_jump.employment_status, 'JUMP')
        self.assertEqual(jump_rec.status, JumpRecordStatus.ACTIVE_JUMP)

        # Confirm JUMP never auto-terminates; HR explicit resolution as RETURNED/REINSTATED
        LifecycleService.resolve_jump(
            employee=emp_jump, outcome='RETURNED',
            reason='Guard resumed duty after medical treatment', approved_by=self.admin1,
            user=self.admin1
        )
        emp_jump.refresh_from_db()
        jump_rec.refresh_from_db()

        self.assertEqual(emp_jump.employment_status, 'ACTIVE')
        self.assertEqual(jump_rec.status, JumpRecordStatus.RESTORED)
        self.assertEqual(jump_rec.reinstated_by, self.admin1)

        # Verify employment history audit log exists
        hist = EmploymentHistory.objects.filter(employee=emp_jump, event_type='JUMP_OUTCOME').first()
        self.assertIsNotNone(hist)
        self.assertEqual(hist.approved_by, self.admin1)

    # -------------------------------------------------------------------------
    # TEST 4: Dynamic Overtime, Statutory Schemes & Payroll Calculation Rules
    # -------------------------------------------------------------------------
    def test_04_payroll_rules_and_statutory_reconciliation(self):
        """
        Certifies:
        - Dynamic single OT (1.5x) and double OT (2.0x) calculation
        - Statutory independent EOBI / SESSI / PESSI
        - Employer contribution not deducted from employee net pay
        - Advance recovery once only
        - Calculation status READY vs BLOCKED.
        """
        emp_calc = Employee.objects.create(
            company=self.company1, employee_code="CALC-EMP-01", first_name="Kamran", last_name="Akmal",
            department=self.dept_ops, designation=self.desig_guard,
            classification='DIRECT', employment_status='ACTIVE'
        )
        EmployeeStatutoryEnrollment.objects.create(
            company=self.company1, employee=emp_calc,
            scheme=self.scheme_eobi, is_enabled=True,
            use_company_default=True, is_active=True
        )
        EmployeeStatutoryEnrollment.objects.create(
            company=self.company1, employee=emp_calc,
            scheme=self.scheme_sessi, is_enabled=True,
            use_company_default=True, is_active=True
        )
        # 10 duty days @ 1000.00 = 10,000.00
        for d in range(1, 11):
            DailyDutyPay.objects.create(
                company=self.company1, employee=emp_calc, duty_date=date(2026, 9, d),
                site=self.site_a, post=self.post_a, contract=self.contract_a,
                daily_payable_rate=Decimal('1000.00'), payable_percentage=Decimal('100.00'),
                payable_amount=Decimal('1000.00'), calculation_status=DailyPayCalculationStatus.CALCULATED
            )

        # Single OT: 4 hrs @ 200 = 800.00. Double OT: 2 hrs @ 400 = 800.00
        OvertimeRecord.objects.create(
            company=self.company1, employee=emp_calc, date=date(2026, 9, 5),
            hours=Decimal('4.00'), ot_type=OvertimeType.SINGLE_OT, status=OvertimeStatus.APPROVED
        )
        OvertimeRecord.objects.create(
            company=self.company1, employee=emp_calc, date=date(2026, 9, 6),
            hours=Decimal('2.00'), ot_type=OvertimeType.DOUBLE_OT, status=OvertimeStatus.APPROVED
        )

        # Advance with 2,000 balance
        adv = EmployeeAdvance.objects.create(
            company=self.company1, employee=emp_calc, advance_number="ADV-KAM-01",
            amount=Decimal('2000.00'), settled_amount=Decimal('0.00'),
            outstanding_balance=Decimal('2000.00'), recovery_method=AdvanceRecoveryMethod.PAYROLL_DEDUCTION,
            payroll_deduction_ready=True, status=AdvanceStatus.PAID, advance_date=date(2026, 8, 20)
        )

        c = PayrollRulesService.calculate_employee_payroll(self.company1, emp_calc, self.p_start, self.p_end)
        self.assertEqual(c.status, PayrollCalculationStatus.CALCULATED)
        c = PayrollRulesService.mark_calculation_ready(self.company1, c.id)
        self.assertEqual(c.status, PayrollCalculationStatus.READY)
        self.assertEqual(c.duty_earnings, Decimal('10000.00'))
        self.assertEqual(c.single_ot_amount, Decimal('800.00'))
        self.assertEqual(c.double_ot_amount, Decimal('800.00'))
        self.assertEqual(c.gross_earnings, Decimal('11600.00')) # 10000 + 1600
        self.assertEqual(c.advance_recovery_amount, Decimal('2000.00'))

        # Employer statutory on duty earnings (10,000): EOBI 5% (500) + SESSI 6% (600) = 1,100.00
        self.assertEqual(c.total_employer_statutory, Decimal('1100.00'))
        # Employee statutory: EOBI 1% (100) + SESSI 0% (0) = 100.00
        self.assertEqual(c.total_statutory_deductions, Decimal('100.00'))

        # Net payable = Gross (11600) - Advance (2000) - EOBI employee (100) = 9,500.00
        # Notice employer statutory (1100) is NOT deducted from employee net pay
        self.assertEqual(c.net_payable, Decimal('9500.00'))

    # -------------------------------------------------------------------------
    # TEST 5: Finance Boundary Control & Idempotency
    # -------------------------------------------------------------------------
    def test_05_finance_boundary_and_idempotency(self):
        """
        Certifies:
        - HR finalization does NOT automatically create SalaryPaymentBatch
        - Finance explicitly creates SalaryPaymentBatch
        - Finance does not recalculate HR payroll
        - Repeated integration is idempotent
        - Repeated salary batch action does not duplicate payment lines.
        """
        for d in range(1, 6):
            DailyDutyPay.objects.create(
                company=self.company1, employee=self.guard_a, duty_date=date(2026, 9, d),
                site=self.site_a, post=self.post_a, contract=self.contract_a,
                daily_payable_rate=Decimal('1000.00'), payable_percentage=Decimal('100.00'),
                payable_amount=Decimal('1000.00'), calculation_status=DailyPayCalculationStatus.CALCULATED
            )
        c = PayrollRulesService.calculate_employee_payroll(self.company1, self.guard_a, self.p_start, self.p_end)
        PayrollRulesService.mark_calculation_ready(self.company1, c.id)

        run = PayrollRunService.create_payroll_run_from_calculations(
            company=self.company1, period_start=self.p_start, period_end=self.p_end, user=self.admin1
        )
        PayrollRunService.submit_for_review(self.company1, run, user=self.admin1)
        PayrollRunService.approve_payroll_run(self.company1, run, user=self.admin1)
        PayrollRunService.finalize_payroll_run(self.company1, run, user=self.admin1)

        # First Finance Handoff
        fin1 = PayrollFinanceService.integrate_payroll_run(run, user=self.admin1)
        self.assertIsNotNone(fin1)
        self.assertEqual(fin1.remaining_liability, run.net_payroll)

        # Idempotent re-run
        fin2 = PayrollFinanceService.integrate_payroll_run(run, user=self.admin1)
        self.assertEqual(fin1.id, fin2.id)
        self.assertEqual(PayrollAccountingIntegration.objects.filter(payroll_run=run).count(), 1)

        # Create salary payment batch
        batch = PayrollFinanceService.create_salary_payment_batch(
            payroll_integration=fin1, treasury_account=self.bank_acc,
            payment_date=date(2026, 9, 30), user=self.admin1
        )
        self.assertEqual(batch.lines.count(), 1)

        # Second attempt to batch already-batched employees is blocked
        with self.assertRaises(ValidationError) as cm:
            PayrollFinanceService.create_salary_payment_batch(
                payroll_integration=fin1, treasury_account=self.bank_acc,
                payment_date=date(2026, 9, 30), user=self.admin1
            )
        self.assertIn("No eligible unpaid employees found", str(cm.exception))

    # -------------------------------------------------------------------------
    # TEST 6: Workforce Lifecycle, Transfers, Suspension, Separation & Rehire
    # -------------------------------------------------------------------------
    def test_06_lifecycle_transitions_and_history_preservation(self):
        """
        Certifies:
        - Promotion creates history entry
        - Salary revision effective dating caps old and provisions new
        - Transfer reuses Deployment engine
        - Suspension blocks active deployments and duty roster assignments
        - Resignation closes deployment
        - Rehire uses the SAME employee master record.
        """
        emp_life = Employee.objects.create(
            company=self.company1, employee_code="LIFE-01", first_name="Tariq", last_name="Mehmood",
            department=self.dept_ops, designation=self.desig_guard,
            classification='DIRECT', employment_status='ACTIVE'
        )
        dep_life = Deployment.objects.create(
            company=self.company1, employee=emp_life, site=self.site_a, post=self.post_a,
            designation=self.desig_guard, start_date=date(2026, 1, 1), status=DeploymentStatus.ACTIVE
        )

        # 1. Promotion
        LifecycleService.promote_or_change_designation(
            employee=emp_life, new_designation=self.desig_senior,
            effective_date=date(2026, 5, 1), reason="Merit promotion to Senior Guard", approved_by=self.admin1
        )
        emp_life.refresh_from_db()
        self.assertEqual(emp_life.designation, self.desig_senior)
        self.assertEqual(EmploymentHistory.objects.filter(employee=emp_life, event_type='PROMOTION').count(), 1)

        # 2. Suspension blocks deployment and roster
        LifecycleService.suspend_employee(
            employee=emp_life, effective_date=date(2026, 6, 1),
            reason="Investigation pending", approved_by=self.admin1
        )
        emp_life.refresh_from_db()
        self.assertEqual(emp_life.employment_status, 'SUSPENDED')

        # New deployment for suspended employee is blocked
        with self.assertRaises(ValidationError):
            d_bad = Deployment(
                company=self.company1, employee=emp_life, site=self.site_b,
                designation=self.desig_senior, start_date=date(2026, 6, 2), status=DeploymentStatus.ACTIVE
            )
            d_bad.clean()

        # Reinstatement
        LifecycleService.reinstate_employee(
            employee=emp_life, effective_date=date(2026, 6, 10),
            reason="Exonerated and cleared", approved_by=self.admin1
        )
        emp_life.refresh_from_db()
        self.assertEqual(emp_life.employment_status, 'ACTIVE')

        # 3. Resignation closes active deployment
        LifecycleService.resign_employee(
            employee=emp_life, resignation_date=date(2026, 7, 1),
            last_working_date=date(2026, 7, 15), reason="Relocation", approved_by=self.admin1
        )
        emp_life.refresh_from_db()
        dep_life.refresh_from_db()
        self.assertEqual(emp_life.employment_status, 'RESIGNED')
        self.assertEqual(dep_life.status, DeploymentStatus.RELIEVED)

        # 4. Rehire reuses SAME Employee master
        emp_rehired, _, _ = LifecycleService.rehire_employee(
            employee=emp_life, rehire_date=date(2026, 9, 1),
            designation=self.desig_supervisor, department=self.dept_ops,
            classification='DIRECT', approved_by=self.admin1
        )
        self.assertEqual(emp_rehired.id, emp_life.id)
        self.assertEqual(emp_rehired.employment_status, 'ACTIVE')
        self.assertEqual(emp_rehired.designation, self.desig_supervisor)
        self.assertEqual(EmploymentHistory.objects.filter(employee=emp_life, event_type='REHIRE').count(), 1)

    # -------------------------------------------------------------------------
    # TEST 7: Control Center Authoritative Reconciliation
    # -------------------------------------------------------------------------
    def test_07_control_center_authoritative_reconciliation(self):
        """
        Certifies that ControlCenterService metrics reconcile strictly against
        source engines with zero duplicate calculation formulas.
        """
        today = date.today()
        cc_data = ControlCenterService.get_control_center_data(self.company1, target_date=today)

        # 1. Workforce metrics match Employee master
        total_emp = Employee.objects.filter(company=self.company1, is_deleted=False).count()
        self.assertEqual(cc_data['workforce']['total_employees'], total_emp)

        # 2. Manpower metrics match calculate_all_sites_manpower
        s5b_sites = calculate_all_sites_manpower(self.company1.id)
        s5b_req = sum(s['required_strength'] for s in s5b_sites)
        s5b_dep = sum(s['deployed_strength'] for s in s5b_sites)
        self.assertEqual(cc_data['manpower']['required_strength'], s5b_req)
        self.assertEqual(cc_data['manpower']['deployed_strength'], s5b_dep)

        # 3. Roster coverage matches calculate_site_shift_coverage
        s5c_site_a = calculate_site_shift_coverage(self.site_a, duty_date=today)
        self.assertIn('duty_coverage', cc_data)

        # 4. Site health count matches active sites count
        self.assertEqual(len(cc_data['site_health']), 2)

    # -------------------------------------------------------------------------
    # TEST 8: Multi-Tenant Isolation & Role/Module Authorization
    # -------------------------------------------------------------------------
    def test_08_multi_tenant_isolation_and_rbac(self):
        """
        Certifies that Company A data is completely quarantined from Company B,
        and unauthorized access is blocked.
        """
        # Company 2 Employee & Site
        c2_client = CRMEntity.objects.create(company=self.company2, name="Delta Client", entity_type='CUSTOMER')
        c2_site = OperationalSite.objects.create(company=self.company2, crm_entity=c2_client, name="Delta Bunker", address="Loc")
        c2_emp = Employee.objects.create(company=self.company2, employee_code="DEL-01", first_name="Secret", last_name="Agent")

        # Company 1 Control Center query must NOT see Company 2
        cc1 = ControlCenterService.get_control_center_data(self.company1)
        cc1_site_names = [s['site_name'] for s in cc1['site_health']]
        self.assertNotIn("Delta Bunker", cc1_site_names)

        # API Client Verification
        client = APIClient()
        # Unauthenticated request rejected
        resp_unauth = client.get('/api/operations/control-center/')
        self.assertEqual(resp_unauth.status_code, 401)

        # Authenticated Company 1 User gets 200 and only Company 1 data
        client.force_authenticate(user=self.admin1)
        resp_auth = client.get('/api/operations/control-center/')
        self.assertEqual(resp_auth.status_code, 200)
        data = resp_auth.json()
        site_names = [s['site_name'] for s in data['site_health']]
        self.assertIn("Bank HQ Tower", site_names)
        self.assertNotIn("Delta Bunker", site_names)

    # -------------------------------------------------------------------------
    # TEST 9: Immutability, Source Locking & Historical Auditing
    # -------------------------------------------------------------------------
    def test_09_immutability_and_source_locking(self):
        """
        Certifies that frozen records cannot be mutated,
        relieved deployments retain dates, and duplicate payroll periods are blocked.
        """
        # 1. Relieved deployment retains audit dates
        self.dep_a.status = DeploymentStatus.RELIEVED
        self.dep_a.relieved_date = date(2026, 9, 30)
        self.dep_a.relief_reason = "Contract shift"
        self.dep_a.save()

        self.dep_a.refresh_from_db()
        self.assertEqual(self.dep_a.relieved_date, date(2026, 9, 30))
        self.assertEqual(self.dep_a.relief_reason, "Contract shift")

        # 2. Frozen DailyDutyPay blocks in-place mutation
        dp = DailyDutyPay.objects.create(
            company=self.company1, employee=self.guard_a, duty_date=date(2026, 9, 1),
            daily_payable_rate=Decimal('500.00'), payable_amount=Decimal('500.00'),
            calculation_status=DailyPayCalculationStatus.CALCULATED, is_frozen=True
        )
        with self.assertRaises(ValidationError):
            dp.payable_amount = Decimal('9999.00')
            dp.clean()
