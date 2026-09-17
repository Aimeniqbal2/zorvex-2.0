"""
finance/tests/test_payroll_finance_s4g.py
Unit test suite for Phase S-4G: Payroll -> Finance Integration & Salary Disbursement.
"""
from decimal import Decimal
from datetime import date, timedelta
from django.test import TestCase
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.contrib.auth import get_user_model

from companies.models import Company
from hrm.models import (
    Employee, Department, Designation, SalaryComponent, ComponentType,
    CalculationType, SalaryStructure, SalaryStructureComponent,
    EmployeeSalaryAssignment, PayrollPeriod, PayrollRun, PayrollRunStatus,
    Payslip, PayslipStatus, PayslipLine
)
from finance.models import (
    ChartOfAccount, AccountType, BankAccount, BankAccountType,
    AccountingPeriod, PeriodStatus, SecurityFinanceConfiguration,
    FinancialVoucher, VoucherType, VoucherStatus, TreasuryTransaction,
    PayrollAccountingStatus, PayrollEmployeePaymentStatus,
    SalaryPaymentBatchStatus, SalaryPaymentLineStatus,
    PayrollAccountMapping, EmployeePaymentDestination,
    PayrollAccountingIntegration, PayrollEmployeeFinanceSnapshot,
    SalaryPaymentBatch, SalaryPaymentBatchLine,
    EmployeeAdvance, AdvanceStatus, AdvanceRecoveryMethod, ExpenseCategory
)
from finance.services.security_coa_template import provision_security_chart_of_accounts
from finance.services.payroll_finance_service import PayrollFinanceService

User = get_user_model()


class PayrollFinanceIntegrationTests(TestCase):
    """
    Test suite for Phase S-4G Payroll-Finance integration.
    """

    def setUp(self):
        # 1. Companies
        self.company_a = Company.objects.create(name="Apex Security Corp", is_active=True)
        self.company_b = Company.objects.create(name="Falcon Protection", is_active=True)

        # 2. Users
        self.user_a = User.objects.create_user(username="apex_admin", email="admin@apex.com", company=self.company_a)
        self.user_b = User.objects.create_user(username="falcon_admin", email="admin@falcon.com", company=self.company_b)

        # 3. Provision COA & Config for Company A & B
        provision_security_chart_of_accounts(self.company_a)
        provision_security_chart_of_accounts(self.company_b)

        self.sec_cfg_a = SecurityFinanceConfiguration.objects.get(company=self.company_a, is_active=True)
        self.bank_acc_a = self.sec_cfg_a.default_bank_account or BankAccount.objects.filter(company=self.company_a).first()

        # 4. Departments & Designations for Company A
        self.dept_ops = Department.objects.create(company=self.company_a, name="Operations")
        self.dept_hq = Department.objects.create(company=self.company_a, name="Headquarters")

        self.desig_guard = Designation.objects.create(company=self.company_a, name="Security Guard", code="SG")
        self.desig_supervisor = Designation.objects.create(company=self.company_a, name="Site Supervisor", code="SS")
        self.desig_accountant = Designation.objects.create(company=self.company_a, name="Accountant", code="ACC")

        # 5. Employees for Company A
        self.emp_guard1 = Employee.objects.create(
            company=self.company_a, employee_code="EMP-G01", first_name="Tariq", last_name="Khan",
            department=self.dept_ops, designation=self.desig_guard
        )
        self.emp_guard2 = Employee.objects.create(
            company=self.company_a, employee_code="EMP-G02", first_name="Bilal", last_name="Ahmed",
            department=self.dept_ops, designation=self.desig_guard
        )
        self.emp_staff = Employee.objects.create(
            company=self.company_a, employee_code="EMP-S01", first_name="Zainab", last_name="Bibi",
            department=self.dept_hq, designation=self.desig_accountant
        )

        # 6. Payment Destinations for Company A
        EmployeePaymentDestination.objects.create(
            company=self.company_a, employee=self.emp_guard1, payment_method='BANK_TRANSFER',
            bank_name='Habib Bank Limited', account_title='Tariq Khan', account_number='1234567890', iban='PK36HABB0000001234567890'
        )
        EmployeePaymentDestination.objects.create(
            company=self.company_a, employee=self.emp_guard2, payment_method='WALLET',
            wallet_provider='EASYPAISA', wallet_number='03001234567'
        )

        # 7. Salary Components
        self.comp_basic = SalaryComponent.objects.create(company=self.company_a, name="Basic Salary", code="BASIC", component_type=ComponentType.EARNING)
        self.comp_ot = SalaryComponent.objects.create(company=self.company_a, name="Overtime Allowance", code="OVERTIME", component_type=ComponentType.EARNING)
        self.comp_adv = SalaryComponent.objects.create(company=self.company_a, name="Advance Deduction", code="ADVANCE", component_type=ComponentType.DEDUCTION)

        # 8. Salary Structure & Assignment
        self.structure = SalaryStructure.objects.create(
            company=self.company_a, name="Standard Guard Structure", code="STR-GUARD",
            currency=self.sec_cfg_a.default_currency, effective_from=date(2026, 1, 1)
        )
        self.assign1 = EmployeeSalaryAssignment.objects.create(
            company=self.company_a, employee=self.emp_guard1, salary_structure=self.structure,
            currency=self.sec_cfg_a.default_currency, base_salary=Decimal('35000'), effective_from=date(2026, 1, 1)
        )
        self.assign2 = EmployeeSalaryAssignment.objects.create(
            company=self.company_a, employee=self.emp_guard2, salary_structure=self.structure,
            currency=self.sec_cfg_a.default_currency, base_salary=Decimal('35000'), effective_from=date(2026, 1, 1)
        )
        self.assign3 = EmployeeSalaryAssignment.objects.create(
            company=self.company_a, employee=self.emp_staff, salary_structure=self.structure,
            currency=self.sec_cfg_a.default_currency, base_salary=Decimal('60000'), effective_from=date(2026, 1, 1)
        )

        # 9. Payroll Period and Run
        self.period = PayrollPeriod.objects.create(
            company=self.company_a, name="September 2026", start_date=date(2026, 9, 1),
            end_date=date(2026, 9, 30), payment_date=date(2026, 9, 30)
        )
        self.run = PayrollRun.objects.create(
            company=self.company_a, payroll_period=self.period, run_number="PR-202609-001",
            status=PayrollRunStatus.FINALIZED, finalized_at=timezone.now(), finalized_by=self.user_a
        )

        # 10. Payslips
        # Guard 1: Gross 40,000 (35,000 basic + 5,000 OT), Tax 1,000, Net 39,000
        self.ps1 = Payslip.objects.create(
            company=self.company_a, payroll_run=self.run, employee=self.emp_guard1,
            salary_assignment=self.assign1, currency=self.sec_cfg_a.default_currency,
            gross_amount=Decimal('40000'), tax_amount=Decimal('1000'), deduction_amount=Decimal('0'),
            net_amount=Decimal('39000'), status=PayslipStatus.FINALIZED
        )
        PayslipLine.objects.create(company=self.company_a, payslip=self.ps1, salary_component=self.comp_basic, amount=Decimal('35000'), sequence=1)
        PayslipLine.objects.create(company=self.company_a, payslip=self.ps1, salary_component=self.comp_ot, amount=Decimal('5000'), sequence=2)

        # Guard 2: Gross 35,000, Deduction 5,000 (Advance), Net 30,000
        self.ps2 = Payslip.objects.create(
            company=self.company_a, payroll_run=self.run, employee=self.emp_guard2,
            salary_assignment=self.assign2, currency=self.sec_cfg_a.default_currency,
            gross_amount=Decimal('35000'), tax_amount=Decimal('0'), deduction_amount=Decimal('5000'),
            net_amount=Decimal('30000'), status=PayslipStatus.FINALIZED
        )
        PayslipLine.objects.create(company=self.company_a, payslip=self.ps2, salary_component=self.comp_basic, amount=Decimal('35000'), sequence=1)
        PayslipLine.objects.create(company=self.company_a, payslip=self.ps2, salary_component=self.comp_adv, amount=Decimal('5000'), sequence=2)

        # Staff: Gross 60,000, Tax 3,000, Net 57,000
        self.ps3 = Payslip.objects.create(
            company=self.company_a, payroll_run=self.run, employee=self.emp_staff,
            salary_assignment=self.assign3, currency=self.sec_cfg_a.default_currency,
            gross_amount=Decimal('60000'), tax_amount=Decimal('3000'), deduction_amount=Decimal('0'),
            net_amount=Decimal('57000'), status=PayslipStatus.FINALIZED
        )
        PayslipLine.objects.create(company=self.company_a, payslip=self.ps3, salary_component=self.comp_basic, amount=Decimal('60000'), sequence=1)

    def test_01_integrate_finalized_payroll_run_successfully(self):
        """Test integration of an approved/finalized payroll run with snapshots and totals."""
        integration = PayrollFinanceService.integrate_payroll_run(self.run, user=self.user_a)

        self.assertEqual(integration.company, self.company_a)
        self.assertEqual(integration.status, PayrollAccountingStatus.READY)
        self.assertEqual(integration.gross_payroll, Decimal('135000.0000')) # 40k + 35k + 60k
        self.assertEqual(integration.total_overtime, Decimal('5000.0000'))
        self.assertEqual(integration.total_advance_recovery, Decimal('5000.0000'))
        self.assertEqual(integration.total_tax, Decimal('4000.0000'))
        self.assertEqual(integration.net_payroll_payable, Decimal('126000.0000'))
        self.assertEqual(integration.remaining_liability, Decimal('126000.0000'))
        self.assertEqual(integration.total_paid, Decimal('0.0000'))
        self.assertEqual(integration.total_employees, 3)
        self.assertEqual(integration.employee_snapshots.count(), 3)

    def test_02_unfinalized_payroll_run_rejected(self):
        """Test that unfinalized (e.g. DRAFT or CALCULATED) payroll run cannot be integrated."""
        draft_run = PayrollRun.objects.create(
            company=self.company_a, payroll_period=self.period, run_number="PR-DRAFT-001",
            status=PayrollRunStatus.DRAFT
        )
        with self.assertRaises(ValidationError) as ctx:
            PayrollFinanceService.integrate_payroll_run(draft_run, user=self.user_a)
        self.assertIn("Only FINALIZED payroll runs", str(ctx.exception))

    def test_03_account_mapping_precedence_resolution(self):
        """Test deterministic 4-tier account precedence resolution."""
        # Create department level mapping for HQ staff -> 6200 Administrative Salaries
        hq_account = ChartOfAccount.objects.get(company=self.company_a, account_code='6200')
        PayrollAccountMapping.objects.create(
            company=self.company_a, department=self.dept_hq,
            classification_type='OPERATING_EXPENSE', salary_expense_account=hq_account
        )

        integration = PayrollFinanceService.integrate_payroll_run(self.run, user=self.user_a)
        snap_staff = integration.employee_snapshots.get(employee=self.emp_staff)
        self.assertEqual(snap_staff.salary_expense_account, hq_account)

        snap_guard = integration.employee_snapshots.get(employee=self.emp_guard1)
        guard_default = self.sec_cfg_a.salary_cost_account
        self.assertEqual(snap_guard.salary_expense_account, guard_default)

    def test_04_missing_payroll_payable_account_blocks_integration(self):
        """Test that missing or invalid AP/Payroll Payable account blocks the integration."""
        self.sec_cfg_a.payroll_payable_account = None
        self.sec_cfg_a.save()

        integration = PayrollFinanceService.integrate_payroll_run(self.run, user=self.user_a)
        self.assertEqual(integration.status, PayrollAccountingStatus.BLOCKED)
        self.assertIn("Missing Payroll Payable control account", integration.blocking_reason)

    def test_05_advance_deduction_reconciles_employee_advance(self):
        """Test that payroll advance deduction automatically reduces active S-4E EmployeeAdvance balance."""
        advance = EmployeeAdvance.objects.create(
            company=self.company_a, employee=self.emp_guard2,
            amount=Decimal('10000'), outstanding_balance=Decimal('10000'),
            settled_amount=Decimal('0'), advance_date=date(2026, 9, 1),
            recovery_method=AdvanceRecoveryMethod.PAYROLL_DEDUCTION, status=AdvanceStatus.PAID
        )

        integration = PayrollFinanceService.integrate_payroll_run(self.run, user=self.user_a)
        advance.refresh_from_db()

        self.assertEqual(advance.settled_amount, Decimal('5000.00'))
        self.assertEqual(advance.outstanding_balance, Decimal('5000.00'))
        self.assertEqual(advance.status, AdvanceStatus.PAID)

    def test_06_create_salary_payment_batch(self):
        """Test creating a salary payment batch with sequential numbering."""
        integration = PayrollFinanceService.integrate_payroll_run(self.run, user=self.user_a)
        batch = PayrollFinanceService.create_salary_payment_batch(
            payroll_integration=integration, treasury_account=self.bank_acc_a,
            payment_date=date(2026, 9, 30), payment_mode='MANUAL', payment_provider='MANUAL',
            user=self.user_a
        )

        self.assertTrue(batch.batch_number.startswith("SPB-202609-"))
        self.assertEqual(batch.total_employees, 3)
        self.assertEqual(batch.total_amount, Decimal('126000.0000'))
        self.assertEqual(batch.status, SalaryPaymentBatchStatus.DRAFT)
        self.assertEqual(batch.lines.count(), 3)

    def test_07_validate_and_approve_batch(self):
        """Test batch pre-flight validation and approval lifecycle."""
        integration = PayrollFinanceService.integrate_payroll_run(self.run, user=self.user_a)
        batch = PayrollFinanceService.create_salary_payment_batch(
            payroll_integration=integration, treasury_account=self.bank_acc_a,
            payment_date=date(2026, 9, 30), user=self.user_a
        )

        validation = PayrollFinanceService.validate_batch(batch)
        self.assertTrue(validation['is_valid'])
        self.assertEqual(batch.status, SalaryPaymentBatchStatus.READY_FOR_PAYMENT)

        approved_batch = PayrollFinanceService.approve_batch(batch, user=self.user_a)
        self.assertEqual(approved_batch.status, SalaryPaymentBatchStatus.APPROVED)

    def test_08_export_generic_csv_file(self):
        """Test CSV file generation with expected columns."""
        integration = PayrollFinanceService.integrate_payroll_run(self.run, user=self.user_a)
        batch = PayrollFinanceService.create_salary_payment_batch(
            payroll_integration=integration, treasury_account=self.bank_acc_a,
            payment_date=date(2026, 9, 30), user=self.user_a
        )
        csv_text = PayrollFinanceService.export_batch_file(batch)

        self.assertIn("Batch Number", csv_text)
        self.assertIn("Tariq Khan", csv_text)
        self.assertIn("39000.00", csv_text)
        self.assertIn("1234567890", csv_text)

    def test_09_confirm_full_successful_batch_and_treasury_linkage(self):
        """Test confirming all batch payments generates posted S-4D voucher, updates treasury and settles liability."""
        integration = PayrollFinanceService.integrate_payroll_run(self.run, user=self.user_a)
        batch = PayrollFinanceService.create_salary_payment_batch(
            payroll_integration=integration, treasury_account=self.bank_acc_a,
            payment_date=date(2026, 9, 30), user=self.user_a
        )

        line_results = [
            {'line_id': str(l.id), 'status': 'SUCCESS', 'payment_reference': f'TX-{l.id}'}
            for l in batch.lines.all()
        ]

        confirmed_batch = PayrollFinanceService.confirm_manual_payments(batch, line_results=line_results, user=self.user_a)

        self.assertEqual(confirmed_batch.status, SalaryPaymentBatchStatus.COMPLETED)
        self.assertEqual(confirmed_batch.successful_amount, Decimal('126000.0000'))
        self.assertIsNotNone(confirmed_batch.voucher)
        self.assertEqual(confirmed_batch.voucher.status, VoucherStatus.POSTED)
        self.assertEqual(confirmed_batch.voucher.amount, Decimal('126000.0000'))

        # Check treasury transaction
        ttx = TreasuryTransaction.objects.filter(voucher=confirmed_batch.voucher).first()
        self.assertIsNotNone(ttx)
        self.assertEqual(ttx.money_out, Decimal('126000.00'))
        self.assertEqual(ttx.transaction_type, 'MONEY_OUT')

        # Check parent payroll integration status
        integration.refresh_from_db()
        self.assertEqual(integration.total_paid, Decimal('126000.0000'))
        self.assertEqual(integration.remaining_liability, Decimal('0.0000'))
        self.assertEqual(integration.status, PayrollAccountingStatus.SETTLED)

    def test_10_partial_batch_disbursement_handling(self):
        """Test partial batch success (2 succeed, 1 fails) marks batch PARTIALLY_COMPLETED and leaves liability open."""
        integration = PayrollFinanceService.integrate_payroll_run(self.run, user=self.user_a)
        batch = PayrollFinanceService.create_salary_payment_batch(
            payroll_integration=integration, treasury_account=self.bank_acc_a,
            payment_date=date(2026, 9, 30), user=self.user_a
        )

        lines = list(batch.lines.all())
        line_results = [
            {'line_id': str(lines[0].id), 'status': 'SUCCESS', 'payment_reference': 'TX-01'},
            {'line_id': str(lines[1].id), 'status': 'SUCCESS', 'payment_reference': 'TX-02'},
            {'line_id': str(lines[2].id), 'status': 'FAILED', 'failure_reason': 'Invalid account number'},
        ]

        confirmed_batch = PayrollFinanceService.confirm_manual_payments(batch, line_results=line_results, user=self.user_a)

        self.assertEqual(confirmed_batch.status, SalaryPaymentBatchStatus.PARTIALLY_COMPLETED)
        self.assertEqual(confirmed_batch.successful_amount, Decimal('69000.0000')) # 39k + 30k
        self.assertEqual(confirmed_batch.failed_amount, Decimal('57000.0000'))

        integration.refresh_from_db()
        self.assertEqual(integration.total_paid, Decimal('69000.0000'))
        self.assertEqual(integration.remaining_liability, Decimal('57000.0000'))
        self.assertEqual(integration.status, PayrollAccountingStatus.PARTIALLY_DISBURSED)

    def test_11_salary_payment_line_reversal(self):
        """Test reversing a successful salary payment line restores liability and records treasury impact."""
        integration = PayrollFinanceService.integrate_payroll_run(self.run, user=self.user_a)
        batch = PayrollFinanceService.create_salary_payment_batch(
            payroll_integration=integration, treasury_account=self.bank_acc_a,
            payment_date=date(2026, 9, 30), user=self.user_a
        )

        line_results = [
            {'line_id': str(l.id), 'status': 'SUCCESS', 'payment_reference': f'TX-{l.id}'}
            for l in batch.lines.all()
        ]
        PayrollFinanceService.confirm_manual_payments(batch, line_results=line_results, user=self.user_a)

        target_line = batch.lines.get(employee=self.emp_guard1)
        PayrollFinanceService.reverse_salary_payment_line(target_line, reason="Incorrect bank transfer returned by bank", user=self.user_a)

        target_line.refresh_from_db()
        self.assertEqual(target_line.status, SalaryPaymentLineStatus.REVERSED)
        self.assertEqual(target_line.reversal_reason, "Incorrect bank transfer returned by bank")

        integration.refresh_from_db()
        self.assertEqual(integration.total_paid, Decimal('87000.0000')) # 126k - 39k
        self.assertEqual(integration.remaining_liability, Decimal('39000.0000'))
        self.assertEqual(integration.status, PayrollAccountingStatus.PARTIALLY_DISBURSED)

    def test_12_balanced_accounting_accrual_preview(self):
        """Test that double-entry accrual preview lines are strictly balanced (Debits == Credits)."""
        PayrollFinanceService.integrate_payroll_run(self.run, user=self.user_a)
        preview = PayrollFinanceService.get_accounting_preview_for_payroll(
            company=self.company_a, payroll_run_id=str(self.run.id)
        )

        self.assertTrue(preview['exists'])
        self.assertTrue(preview['is_balanced'])
        self.assertEqual(preview['total_debits'], 135000.00)
        self.assertEqual(preview['total_credits'], 135000.00)
        self.assertTrue(len(preview['lines']) >= 4)

    def test_13_multi_tenant_isolation(self):
        """Test strict multi-tenant isolation: Company B cannot access Company A's integrations."""
        integration_a = PayrollFinanceService.integrate_payroll_run(self.run, user=self.user_a)

        # Company B attempt to create batch with Company A integration
        bank_acc_b = BankAccount.objects.filter(company=self.company_b).first()
        with self.assertRaises(ValidationError):
            PayrollFinanceService.create_salary_payment_batch(
                payroll_integration=integration_a,
                treasury_account=bank_acc_b,
                payment_date=date(2026, 9, 30),
                user=self.user_b
            )
