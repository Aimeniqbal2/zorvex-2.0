"""
operations/tests/test_phase_s5g_payroll_run.py

Unit test suite for Phase S-5G: Security Workforce Payroll Run, Payslips,
Approval, Source Locking, Advance Settlement & S-4G Finance Integration.
"""
from datetime import date, timedelta
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from django.core.exceptions import ValidationError

from companies.models import Company
from accounts.models import User
from crm.models import CRMEntity
from finance.models import (
    Currency, BankAccount, EmployeeAdvance, AdvanceStatus, AdvanceRecoveryMethod,
    EmployeeAdvanceType, SecurityFinanceConfiguration, PayrollAccountingIntegration,
    PayrollAccountingStatus, ChartOfAccount, SalaryPaymentBatch, SalaryPaymentBatchStatus
)
from finance.services.security_coa_template import provision_security_chart_of_accounts
from finance.services.payroll_finance_service import PayrollFinanceService
from hrm.models import (
    Employee, Designation, Department, SalaryStructure, EmployeeSalaryAssignment,
    CompanyPayrollPolicy, StatutoryScheme, StatutorySchemeType, StatutorySchemeRateHistory,
    EmployeeStatutoryEnrollment, OvertimeRecord, OvertimeStatus, OvertimeType,
    PayrollRun, PayrollRunStatus, Payslip, PayslipStatus, PayslipLine
)
from operations.models import (
    OperationalSite, SecurityPost, ServiceContract,
    DailyDutyPay, DailyPayRateSource, DailyPayCalculationStatus,
    PayrollAddition, PayrollAdditionType, PayrollAdditionFrequency,
    PayrollDeduction, PayrollDeductionType, PayrollDeductionFrequency,
    PayrollCalculationStatus, EmployeePayrollCalculation, PayrollCalculationLine
)
from operations.services.payroll_rules_service import PayrollRulesService
from operations.services.payroll_run_service import PayrollRunService


class PhaseS5GPayrollRunTestCase(TestCase):
    def setUp(self):
        # 1. Tenant Companies
        self.company1 = Company.objects.create(name="Security First Co", is_active=True)
        self.company2 = Company.objects.create(name="Apex Guard Ltd", is_active=True)

        # 2. Users
        self.user1 = User.objects.create_user(
            username="sec_payroll_admin",
            email="payroll@sec1.com"
        )
        self.user1.company_id = self.company1.id
        self.user1.save()

        # 3. Provision COA & Config for Company 1
        provision_security_chart_of_accounts(self.company1)
        self.sec_cfg1 = SecurityFinanceConfiguration.objects.get(company=self.company1, is_active=True)
        self.currency = self.sec_cfg1.default_currency or Currency.objects.filter(company=self.company1).first()
        self.bank_acc = self.sec_cfg1.default_bank_account or BankAccount.objects.filter(company=self.company1).first()
        if not self.bank_acc:
            self.bank_acc = BankAccount.objects.create(
                company=self.company1,
                account_name="Main Operations Account",
                account_number="PK1234567890",
                currency=self.currency,
                account_type='BANK'
            )

        # 4. Department & Designation
        self.dept_ops = Department.objects.create(company=self.company1, name="Operations")
        self.designation_guard = Designation.objects.create(
            company=self.company1, name="Security Guard", code="SG-01"
        )

        # 5. Salary Structure & Policy
        self.structure = SalaryStructure.objects.create(
            company=self.company1, name="Security Guard Structure", code="STR-SEC-GUARD",
            currency=self.currency, effective_from=date(2026, 1, 1)
        )
        self.policy = CompanyPayrollPolicy.objects.create(
            company=self.company1,
            daily_rate_divisor=Decimal('30.00'),
            standard_monthly_hours=Decimal('208.00'),
            overtime_multiplier=Decimal('1.50'),
            holiday_pay_percentage=Decimal('100.00'),
            weekly_off_pay_percentage=Decimal('100.00'),
            enable_policy_ot_fallback=True,
            default_single_ot_rate=Decimal('200.00'),
            default_double_ot_rate=Decimal('400.00'),
            is_active=True
        )

        # 6. Employees for Company 1
        self.emp1 = Employee.objects.create(
            company=self.company1, employee_code="EMP-G01", first_name="Tariq", last_name="Khan",
            department=self.dept_ops, designation=self.designation_guard, employment_status="ACTIVE",
            hire_date=date(2026, 1, 1)
        )
        self.emp2 = Employee.objects.create(
            company=self.company1, employee_code="EMP-G02", first_name="Bilal", last_name="Ahmed",
            department=self.dept_ops, designation=self.designation_guard, employment_status="ACTIVE",
            hire_date=date(2026, 1, 1)
        )

        self.assign1 = EmployeeSalaryAssignment.objects.create(
            company=self.company1, employee=self.emp1, salary_structure=self.structure,
            currency=self.currency, base_salary=Decimal('30000.00'),
            single_ot_rate=Decimal('200.00'), double_ot_rate=Decimal('400.00'),
            effective_from=date(2026, 1, 1)
        )
        self.assign2 = EmployeeSalaryAssignment.objects.create(
            company=self.company1, employee=self.emp2, salary_structure=self.structure,
            currency=self.currency, base_salary=Decimal('36000.00'),
            single_ot_rate=Decimal('250.00'), double_ot_rate=Decimal('500.00'),
            effective_from=date(2026, 1, 1)
        )

        # 7. Operational Site & Post
        self.client = CRMEntity.objects.create(company=self.company1, name="Standard Bank HQ", entity_type="CUSTOMER")
        self.site = OperationalSite.objects.create(
            company=self.company1, crm_entity=self.client, name="Bank Main Branch"
        )
        self.post = SecurityPost.objects.create(
            company=self.company1, site=self.site, post_name="Front Gate Post",
            required_designation=self.designation_guard,
            daily_pay_rate=Decimal('1000.00'), is_active=True
        )
        self.contract = ServiceContract.objects.create(
            company=self.company1, crm_entity=self.client, contract_code="CON-2026-001",
            start_date=date(2026, 1, 1), end_date=date(2026, 12, 31)
        )

        # 8. Statutory Schemes (Independent EOBI, SESSI, PESSI)
        self.scheme_eobi = StatutoryScheme.objects.create(
            company=self.company1, code="EOBI", name="Employees Old-Age Benefits",
            scheme_type=StatutorySchemeType.EOBI, employee_default_rate=Decimal('1.00'),
            employer_default_rate=Decimal('5.00'), is_active=True
        )
        self.scheme_sessi = StatutoryScheme.objects.create(
            company=self.company1, code="SESSI", name="Sindh Employees Social Security",
            scheme_type=StatutorySchemeType.SOCIAL_SECURITY, employee_default_rate=Decimal('0.00'),
            employer_default_rate=Decimal('6.00'), is_active=True
        )
        self.scheme_pessi = StatutoryScheme.objects.create(
            company=self.company1, code="PESSI", name="Punjab Employees Social Security",
            scheme_type=StatutorySchemeType.SOCIAL_SECURITY, employee_default_rate=Decimal('0.00'),
            employer_default_rate=Decimal('6.00'), is_active=True
        )

        # Enrollments
        EmployeeStatutoryEnrollment.objects.create(
            company=self.company1, employee=self.emp1, scheme=self.scheme_eobi, is_enabled=True, use_company_default=True, is_active=True
        )
        EmployeeStatutoryEnrollment.objects.create(
            company=self.company1, employee=self.emp1, scheme=self.scheme_sessi, is_enabled=True, use_company_default=True, is_active=True
        )
        EmployeeStatutoryEnrollment.objects.create(
            company=self.company1, employee=self.emp2, scheme=self.scheme_eobi, is_enabled=True, use_company_default=True, is_active=True
        )
        EmployeeStatutoryEnrollment.objects.create(
            company=self.company1, employee=self.emp2, scheme=self.scheme_pessi, is_enabled=True, use_company_default=True, is_active=True
        )

        self.p_start = date(2026, 9, 1)
        self.p_end = date(2026, 9, 30)

    def _prepare_sample_daily_duty_pay(self, employee, days=5, rate=Decimal('1000.00')):
        for d in range(1, days + 1):
            DailyDutyPay.objects.create(
                company=self.company1,
                employee=employee,
                duty_date=date(2026, 9, d),
                site=self.site,
                post=self.post,
                contract=self.contract,
                daily_payable_rate=rate,
                payable_percentage=Decimal('100.00'),
                payable_amount=rate,
                calculation_status=DailyPayCalculationStatus.CALCULATED,
                is_frozen=False
            )

    def test_01_run_creation_from_ready_calculations(self):
        """Test creating a PayrollRun from READY calculations with immutable payslips."""
        self._prepare_sample_daily_duty_pay(self.emp1, days=10, rate=Decimal('1000.00')) # 10,000 duty pay
        self._prepare_sample_daily_duty_pay(self.emp2, days=12, rate=Decimal('1200.00')) # 14,400 duty pay

        # Overtime for Emp 1 (5 hrs single OT @ 200 = 1,000)
        OvertimeRecord.objects.create(
            company=self.company1, employee=self.emp1, date=date(2026, 9, 15),
            hours=Decimal('5.00'), ot_type=OvertimeType.SINGLE_OT, status=OvertimeStatus.APPROVED
        )

        # Calculate for both employees
        c1 = PayrollRulesService.calculate_employee_payroll(self.company1, self.emp1, self.p_start, self.p_end)
        c2 = PayrollRulesService.calculate_employee_payroll(self.company1, self.emp2, self.p_start, self.p_end)

        # Mark both ready
        PayrollRulesService.mark_calculation_ready(self.company1, c1.id)
        PayrollRulesService.mark_calculation_ready(self.company1, c2.id)

        # Create PayrollRun
        run = PayrollRunService.create_payroll_run_from_calculations(
            company=self.company1,
            period_start=self.p_start,
            period_end=self.p_end,
            user=self.user1,
            notes="September 2026 Main Run"
        )

        self.assertIsNotNone(run)
        self.assertEqual(run.status, PayrollRunStatus.CALCULATED)
        self.assertEqual(run.employee_count, 2)
        self.assertEqual(run.gross_earnings, c1.gross_earnings + c2.gross_earnings)
        self.assertEqual(run.employee_deductions, c1.total_deductions + c2.total_deductions)
        self.assertEqual(run.net_payroll, c1.net_payable + c2.net_payable)
        self.assertEqual(run.payslips.count(), 2)

        # Verify linked payslip numbers and calculation status
        c1.refresh_from_db()
        self.assertEqual(c1.payroll_run, run)
        self.assertIsNotNone(c1.payslip)
        self.assertEqual(c1.payslip.status, PayslipStatus.CALCULATED)

    def test_02_blocked_calculation_prevents_finalization(self):
        """Test that a BLOCKED calculation prevents run creation and finalization."""
        # Create un-resolvable duty pay with 0 rate and no assignment
        emp_blocked = Employee.objects.create(
            company=self.company1, employee_code="EMP-BLK", first_name="Blocked", last_name="Guard",
            department=self.dept_ops, designation=self.designation_guard, employment_status="ACTIVE"
        )
        DailyDutyPay.objects.create(
            company=self.company1, employee=emp_blocked, duty_date=date(2026, 9, 2),
            daily_payable_rate=Decimal('0.00'), payable_amount=Decimal('0.00'),
            calculation_status=DailyPayCalculationStatus.CALCULATED
        )
        c_blk = PayrollRulesService.calculate_employee_payroll(self.company1, emp_blocked, self.p_start, self.p_end)
        self.assertEqual(c_blk.status, PayrollCalculationStatus.BLOCKED)

        # Attempting to create run with blocked calculation explicitly
        with self.assertRaises(ValidationError) as cm:
            PayrollRunService.create_payroll_run_from_calculations(
                company=self.company1,
                period_start=self.p_start,
                period_end=self.p_end,
                calculation_ids=[str(c_blk.id)]
            )
        self.assertIn("BLOCKED or unready", str(cm.exception))

    def test_03_payroll_totals_reconcile(self):
        """Test strict reconciliation between Run totals and individual Payslips."""
        self._prepare_sample_daily_duty_pay(self.emp1, days=15, rate=Decimal('1000.00')) # 15,000
        self._prepare_sample_daily_duty_pay(self.emp2, days=15, rate=Decimal('1200.00')) # 18,000

        c1 = PayrollRulesService.calculate_employee_payroll(self.company1, self.emp1, self.p_start, self.p_end)
        c2 = PayrollRulesService.calculate_employee_payroll(self.company1, self.emp2, self.p_start, self.p_end)
        PayrollRulesService.mark_calculation_ready(self.company1, c1.id)
        PayrollRulesService.mark_calculation_ready(self.company1, c2.id)

        run = PayrollRunService.create_payroll_run_from_calculations(
            company=self.company1, period_start=self.p_start, period_end=self.p_end, user=self.user1
        )

        sum_gross = sum(p.gross_amount for p in run.payslips.all())
        sum_ded = sum(p.deduction_amount for p in run.payslips.all())
        sum_net = sum(p.net_amount for p in run.payslips.all())
        sum_employer_stat = sum(p.total_employer_statutory for p in run.payslips.all())

        self.assertEqual(run.gross_earnings, sum_gross)
        self.assertEqual(run.employee_deductions, sum_ded)
        self.assertEqual(run.net_payroll, sum_net)
        self.assertEqual(run.employer_statutory_contribution, sum_employer_stat)
        self.assertEqual(run.net_payroll, run.gross_earnings - run.employee_deductions)

    def test_04_payslip_snapshot_accuracy_and_line_preservation(self):
        """Test accuracy of immutable payslip snapshots and line item breakdown."""
        self._prepare_sample_daily_duty_pay(self.emp1, days=10, rate=Decimal('1000.00')) # 10,000

        # Overtime (Single & Double)
        OvertimeRecord.objects.create(
            company=self.company1, employee=self.emp1, date=date(2026, 9, 10),
            hours=Decimal('4.00'), ot_type=OvertimeType.SINGLE_OT, status=OvertimeStatus.APPROVED
        ) # 4 * 200 = 800
        OvertimeRecord.objects.create(
            company=self.company1, employee=self.emp1, date=date(2026, 9, 12),
            hours=Decimal('2.00'), ot_type=OvertimeType.DOUBLE_OT, status=OvertimeStatus.APPROVED
        ) # 2 * 400 = 800

        # Allowance & Deduction
        PayrollAddition.objects.create(
            company=self.company1, employee=self.emp1, addition_type=PayrollAdditionType.ALLOWANCE,
            frequency=PayrollAdditionFrequency.ONE_TIME, name="Weapon Handling Allowance",
            amount=Decimal('2500.00'), effective_date=date(2026, 9, 15)
        )
        PayrollDeduction.objects.create(
            company=self.company1, employee=self.emp1, deduction_type=PayrollDeductionType.PATROLLING,
            frequency=PayrollDeductionFrequency.ONE_TIME, name="Patrolling Penalty",
            amount=Decimal('500.00'), effective_date=date(2026, 9, 15)
        )

        c = PayrollRulesService.calculate_employee_payroll(self.company1, self.emp1, self.p_start, self.p_end)
        PayrollRulesService.mark_calculation_ready(self.company1, c.id)

        run = PayrollRunService.create_payroll_run_from_calculations(
            company=self.company1, period_start=self.p_start, period_end=self.p_end, user=self.user1
        )
        ps = run.payslips.first()

        # Check Earnings
        self.assertEqual(ps.duty_earnings, Decimal('10000.00'))
        self.assertEqual(ps.single_ot_amount, Decimal('800.00'))
        self.assertEqual(ps.double_ot_amount, Decimal('800.00'))
        self.assertEqual(ps.allowances_amount, Decimal('2500.00'))
        self.assertEqual(ps.gross_amount, Decimal('14100.00')) # 10000 + 1600 + 2500

        # Check Deductions
        self.assertEqual(ps.patrolling_deduction, Decimal('500.00'))
        self.assertEqual(ps.net_amount, ps.gross_amount - ps.deduction_amount)
        self.assertTrue(len(ps.lines_snapshot) > 0)
        self.assertTrue(ps.lines.count() >= 3)

    def test_05_eobi_sessi_pessi_remain_separate_on_payslip(self):
        """Test that statutory schemes remain independent and exposed on the Payslip."""
        self._prepare_sample_daily_duty_pay(self.emp1, days=20, rate=Decimal('1000.00')) # 20,000

        c = PayrollRulesService.calculate_employee_payroll(self.company1, self.emp1, self.p_start, self.p_end)
        PayrollRulesService.mark_calculation_ready(self.company1, c.id)

        run = PayrollRunService.create_payroll_run_from_calculations(
            company=self.company1, period_start=self.p_start, period_end=self.p_end, user=self.user1
        )
        ps = run.payslips.first()

        # EOBI: 1% employee = 200, 5% employer = 1000
        self.assertEqual(ps.eobi_employee_amount, Decimal('200.00'))
        self.assertEqual(ps.eobi_employer_amount, Decimal('1000.00'))

        # SESSI: 0% employee = 0, 6% employer = 1200
        self.assertEqual(ps.sessi_employee_amount, Decimal('0.00'))
        self.assertEqual(ps.sessi_employer_amount, Decimal('1200.00'))

        # PESSI: Emp 1 is not enrolled in PESSI -> 0
        self.assertEqual(ps.pessi_employee_amount, Decimal('0.00'))
        self.assertEqual(ps.pessi_employer_amount, Decimal('0.00'))

        # Total employer statutory: 1000 + 1200 = 2200
        self.assertEqual(ps.total_employer_statutory, Decimal('2200.00'))

        # Payslip preserves exact snapshot statutory rates (not hardcoded)
        self.assertIn('statutory_schemes', ps.rate_snapshot)
        eobi_snap = ps.rate_snapshot['statutory_schemes'].get('EOBI')
        self.assertIsNotNone(eobi_snap)
        self.assertEqual(eobi_snap['employee_rate'], 1.0)
        self.assertEqual(eobi_snap['employer_rate'], 5.0)

        sessi_snap = ps.rate_snapshot['statutory_schemes'].get('SESSI')
        self.assertIsNotNone(sessi_snap)
        self.assertEqual(sessi_snap['employee_rate'], 0.0)
        self.assertEqual(sessi_snap['employer_rate'], 6.0)

        # Check line-level rate snapshot
        eobi_lines = [l for l in ps.lines_snapshot if 'EOBI' in l.get('line_type', '')]
        self.assertTrue(len(eobi_lines) > 0)
        self.assertEqual(eobi_lines[0]['rate_snapshot']['employee_rate'], 1.0)
        self.assertEqual(eobi_lines[0]['rate_snapshot']['employer_rate'], 5.0)

    def test_06_finalization_freezes_source_data(self):
        """Test that finalization freezes calculations, duty pay, OT, additions, and payslips."""
        self._prepare_sample_daily_duty_pay(self.emp1, days=5, rate=Decimal('1000.00'))
        ot = OvertimeRecord.objects.create(
            company=self.company1, employee=self.emp1, date=date(2026, 9, 5),
            hours=Decimal('2.00'), ot_type=OvertimeType.SINGLE_OT, status=OvertimeStatus.APPROVED
        )
        add = PayrollAddition.objects.create(
            company=self.company1, employee=self.emp1, addition_type=PayrollAdditionType.BONUS,
            frequency=PayrollAdditionFrequency.ONE_TIME, name="Excellence Bonus",
            amount=Decimal('1000.00'), effective_date=date(2026, 9, 5)
        )

        c = PayrollRulesService.calculate_employee_payroll(self.company1, self.emp1, self.p_start, self.p_end)
        PayrollRulesService.mark_calculation_ready(self.company1, c.id)

        run = PayrollRunService.create_payroll_run_from_calculations(
            company=self.company1, period_start=self.p_start, period_end=self.p_end, user=self.user1
        )
        PayrollRunService.submit_for_review(self.company1, run, user=self.user1)
        PayrollRunService.approve_payroll_run(self.company1, run, user=self.user1)

        # Finalize
        result = PayrollRunService.finalize_payroll_run(self.company1, run, user=self.user1)
        self.assertEqual(result['status'], PayrollRunStatus.FINALIZED)

        run.refresh_from_db()
        c.refresh_from_db()
        ot.refresh_from_db()
        add.refresh_from_db()
        ps = run.payslips.first()

        self.assertTrue(c.is_frozen)
        self.assertTrue(ot.is_frozen)
        self.assertTrue(add.is_frozen)
        self.assertTrue(ps.is_frozen)
        self.assertEqual(ps.status, PayslipStatus.FINALIZED)

        # Consumed DailyDutyPay records must be frozen
        dp = DailyDutyPay.objects.filter(company=self.company1, employee=self.emp1, duty_date=date(2026, 9, 1)).first()
        self.assertTrue(dp.is_frozen)

        # Attempting silent edit on frozen records must be blocked by clean()
        with self.assertRaises(ValidationError):
            ot.hours = Decimal('10.00')
            ot.clean()

        with self.assertRaises(ValidationError):
            add.amount = Decimal('5000.00')
            add.clean()

        with self.assertRaises(ValidationError):
            c.gross_earnings = Decimal('99999.00')
            c.clean()

    def test_07_duplicate_employee_period_blocked(self):
        """Test that duplicate employee calculations for the same period are blocked."""
        self._prepare_sample_daily_duty_pay(self.emp1, days=5, rate=Decimal('1000.00'))
        c1 = PayrollRulesService.calculate_employee_payroll(self.company1, self.emp1, date(2026, 9, 1), date(2026, 9, 15))
        PayrollRulesService.mark_calculation_ready(self.company1, c1.id)

        # Duty pay for second half of month
        for d in range(16, 21):
            DailyDutyPay.objects.create(
                company=self.company1, employee=self.emp1, duty_date=date(2026, 9, d),
                site=self.site, post=self.post, contract=self.contract,
                daily_payable_rate=Decimal('1000.00'), payable_percentage=Decimal('100.00'),
                payable_amount=Decimal('1000.00'), calculation_status=DailyPayCalculationStatus.CALCULATED
            )

        c2 = PayrollRulesService.calculate_employee_payroll(self.company1, self.emp1, date(2026, 9, 16), date(2026, 9, 30))
        PayrollRulesService.mark_calculation_ready(self.company1, c2.id)

        with self.assertRaises(ValidationError) as cm:
            PayrollRunService.create_payroll_run_from_calculations(
                company=self.company1, period_start=self.p_start, period_end=self.p_end,
                calculation_ids=[str(c1.id), str(c2.id)]
            )
        self.assertIn("Duplicate calculations detected", str(cm.exception))

    def test_08_advance_recovery_committed_once(self):
        """Test that payroll-linked EmployeeAdvance recovery is committed exactly once without double deduction."""
        self._prepare_sample_daily_duty_pay(self.emp1, days=20, rate=Decimal('1000.00')) # 20,000

        # Create paid advance with 4,000 balance
        adv = EmployeeAdvance.objects.create(
            company=self.company1,
            employee=self.emp1,
            advance_number="ADV-2026-001",
            amount=Decimal('4000.00'),
            settled_amount=Decimal('0.00'),
            outstanding_balance=Decimal('4000.00'),
            recovery_method=AdvanceRecoveryMethod.PAYROLL_DEDUCTION,
            payroll_deduction_ready=True,
            status=AdvanceStatus.PAID,
            advance_date=date(2026, 8, 15)
        )

        c = PayrollRulesService.calculate_employee_payroll(self.company1, self.emp1, self.p_start, self.p_end)
        self.assertEqual(c.advance_recovery_amount, Decimal('4000.00'))
        PayrollRulesService.mark_calculation_ready(self.company1, c.id)

        run = PayrollRunService.create_payroll_run_from_calculations(
            company=self.company1, period_start=self.p_start, period_end=self.p_end, user=self.user1
        )
        PayrollRunService.submit_for_review(self.company1, run, user=self.user1)
        PayrollRunService.approve_payroll_run(self.company1, run, user=self.user1)

        # Finalize
        PayrollRunService.finalize_payroll_run(self.company1, run, user=self.user1)

        adv.refresh_from_db()
        self.assertEqual(adv.settled_amount, Decimal('4000.00'))
        self.assertEqual(adv.outstanding_balance, Decimal('0.00'))
        self.assertEqual(adv.status, AdvanceStatus.SETTLED)

        # Repeat/Retry Finance handoff on finalized run: advance balance must NOT go negative
        PayrollFinanceService.integrate_payroll_run(run, user=self.user1)

        adv.refresh_from_db()
        self.assertEqual(adv.settled_amount, Decimal('4000.00'))
        self.assertEqual(adv.outstanding_balance, Decimal('0.00'))

    def test_09_s4g_integration_created_and_reused_idempotently(self):
        """Test that S-4G Finance integration is created and re-run idempotently."""
        self._prepare_sample_daily_duty_pay(self.emp1, days=10, rate=Decimal('1000.00'))
        c = PayrollRulesService.calculate_employee_payroll(self.company1, self.emp1, self.p_start, self.p_end)
        PayrollRulesService.mark_calculation_ready(self.company1, c.id)

        run = PayrollRunService.create_payroll_run_from_calculations(
            company=self.company1, period_start=self.p_start, period_end=self.p_end, user=self.user1
        )
        PayrollRunService.submit_for_review(self.company1, run, user=self.user1)
        PayrollRunService.approve_payroll_run(self.company1, run, user=self.user1)

        res1 = PayrollRunService.finalize_payroll_run(self.company1, run, user=self.user1)
        fin_id_1 = res1['finance_integration_id']

        # Call again
        fin2 = PayrollFinanceService.integrate_payroll_run(run, user=self.user1)
        self.assertEqual(str(fin2.id), fin_id_1)
        self.assertEqual(PayrollAccountingIntegration.objects.filter(payroll_run=run).count(), 1)
        self.assertEqual(fin2.status, PayrollAccountingStatus.READY)
        self.assertEqual(fin2.remaining_liability, run.net_payroll)

        # 1. Finalization creates/reuses Finance integration but NO salary batch automatically
        self.assertEqual(SalaryPaymentBatch.objects.filter(payroll_integration=fin2).count(), 0)

        # 2. Finance can subsequently create salary batch once
        batch = PayrollFinanceService.create_salary_payment_batch(
            payroll_integration=fin2,
            treasury_account=self.bank_acc,
            payment_date=date(2026, 9, 30),
            payment_mode='MANUAL',
            payment_provider='MANUAL',
            user=self.user1
        )
        self.assertIsNotNone(batch)
        self.assertEqual(batch.status, SalaryPaymentBatchStatus.DRAFT)
        self.assertEqual(batch.total_employees, 1)
        self.assertEqual(batch.total_amount, run.net_payroll)

        # Second attempt cannot double-batch already batched employees
        with self.assertRaises(ValidationError) as cm:
            PayrollFinanceService.create_salary_payment_batch(
                payroll_integration=fin2,
                treasury_account=self.bank_acc,
                payment_date=date(2026, 9, 30),
                user=self.user1
            )
        self.assertIn("No eligible unpaid employees found", str(cm.exception))

    def test_10_tenant_isolation(self):
        """Test cross-company payroll run access isolation."""
        self._prepare_sample_daily_duty_pay(self.emp1, days=5, rate=Decimal('1000.00'))
        c1 = PayrollRulesService.calculate_employee_payroll(self.company1, self.emp1, self.p_start, self.p_end)
        PayrollRulesService.mark_calculation_ready(self.company1, c1.id)

        # Company 2 user trying to create run for Company 1's calculation
        with self.assertRaises(ValidationError):
            PayrollRunService.create_payroll_run_from_calculations(
                company=self.company2,
                period_start=self.p_start,
                period_end=self.p_end,
                calculation_ids=[str(c1.id)]
            )
