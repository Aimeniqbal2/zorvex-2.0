from decimal import Decimal
from datetime import date, timedelta
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.utils import timezone

from companies.models import Company
from hrm.models import Employee, Department
from crm.models import CRMEntity
from operations.models import OperationalSite, ServiceContract, ServiceContractStatus
from finance.models import (
    BankAccount, ChartOfAccount, CostCenter, ProfitCenter, Currency,
    AccountingPeriod, PeriodStatus, SecurityFinanceConfiguration,
    Expense, ExpenseCategory, ExpenseAllocation, EmployeeAdvance, PettyCashCustodian,
    ExpenseType, ExpenseStatus, ExpensePaymentStatus, EmployeeAdvanceType, AdvanceStatus, AdvanceRecoveryMethod,
    PaymentMethod, FinancialVoucher, VoucherType, VoucherStatus, TreasuryTransaction
)
from finance.services.security_coa_template import provision_security_chart_of_accounts
from finance.services.treasury_service import TreasuryService
from finance.services.voucher_service import VoucherService
from finance.services.expense_service import ExpenseService
from finance.services.advance_service import EmployeeAdvanceService
from finance.services.petty_cash_service import PettyCashService

User = get_user_model()


class ExpenseManagementS4ETestCase(TestCase):
    """
    Phase S-4E Test Suite: Direct Expenses, Split Cost Allocations, Employee Claims,
    Petty Cash Floats & Custodians, Employee Advances & Settlements.
    """

    def setUp(self):
        self.company_a = Company.objects.create(name="Security Vanguard Ltd", is_active=True)
        self.company_b = Company.objects.create(name="Rival Security Corp", is_active=True)

        self.user_a = User.objects.create_user(
            username="finance_officer",
            email="finance@vanguard.com",
            password="testpassword123",
            company=self.company_a
        )
        self.user_b = User.objects.create_user(
            username="rival_officer",
            email="finance@rival.com",
            password="testpassword123",
            company=self.company_b
        )

        # Provision universal COA and fiscal structure
        provision_security_chart_of_accounts(self.company_a)
        provision_security_chart_of_accounts(self.company_b)

        self.currency_pkr = Currency.objects.get(company=self.company_a, code='PKR')
        self.hbl_bank = BankAccount.objects.get(company=self.company_a, account_title='Main Operations Bank')
        
        # Create Petty Cash account for Company A
        coa_cash = ChartOfAccount.objects.get(company=self.company_a, account_code='1110')
        self.petty_cash_acc, _ = BankAccount.objects.get_or_create(
            company=self.company_a,
            account_title='Head Office Petty Cash',
            defaults={
                'account_type': 'PETTY_CASH',
                'bank_name': 'Petty Cash Box',
                'account_number': 'PC-HO-01',
                'chart_of_account': coa_cash,
                'currency': self.currency_pkr,
                'is_active': True
            }
        )

        # Initialize opening balance on HBL Bank: PKR 1,000,000
        TreasuryService.initialize_opening_balance(
            bank_account=self.hbl_bank,
            amount=Decimal('1000000.0000'),
            opening_date=date(2026, 1, 1),
            reference='INIT-HBL-2026',
            user=self.user_a
        )

        # Initialize opening balance on Petty Cash: PKR 20,000
        TreasuryService.initialize_opening_balance(
            bank_account=self.petty_cash_acc,
            amount=Decimal('20000.0000'),
            opening_date=date(2026, 1, 1),
            reference='INIT-PC-2026',
            user=self.user_a
        )

        # Operational Entities
        self.dept_ops = Department.objects.create(company=self.company_a, name="Field Operations")
        self.emp_guard = Employee.objects.create(
            company=self.company_a,
            first_name="Ahmed",
            last_name="Khan",
            employee_code="SEC-001",
            department=self.dept_ops
        )
        self.emp_supervisor = Employee.objects.create(
            company=self.company_a,
            first_name="Tariq",
            last_name="Mahmood",
            employee_code="SEC-SUP-01",
            department=self.dept_ops
        )

        self.client_corp = CRMEntity.objects.create(
            company=self.company_a,
            name="Bank Alfalah Corporate",
            entity_type='CUSTOMER'
        )
        self.site_karachi = OperationalSite.objects.create(
            company=self.company_a,
            crm_entity=self.client_corp,
            name="Main Branch Karachi",
            address="I.I. Chundrigar Rd"
        )
        self.contract_main = ServiceContract.objects.create(
            company=self.company_a,
            crm_entity=self.client_corp,
            contract_code="CNT-ALF-2026",
            start_date=date(2026, 1, 1),
            status=ServiceContractStatus.ACTIVE
        )

        self.cost_center_ops = CostCenter.objects.get(company=self.company_a, code='OPS')
        self.cost_center_admin = CostCenter.objects.get(company=self.company_a, code='HO')

        # Create configurable expense categories
        self.cat_fuel = ExpenseCategory.objects.create(
            company=self.company_a,
            name="Vehicle Fuel & Transport",
            code="CAT-FUEL",
            description="Patrol vehicle and emergency response fuel"
        )
        self.cat_site = ExpenseCategory.objects.create(
            company=self.company_a,
            name="Site Operational Expense",
            code="CAT-SITE",
            description="Barriers, emergency lights, on-site supplies"
        )

    def test_01_expense_category_configuration_and_isolation(self):
        """Test custom expense category creation, GL default linking, and cross-tenant isolation."""
        cat = ExpenseCategory.objects.create(
            company=self.company_a,
            name="Software & Cloud Subscriptions",
            code="CAT-SFT",
            description="Zorvex ERP and cloud hosting"
        )
        self.assertTrue(cat.is_active)
        self.assertEqual(cat.company, self.company_a)

        # Cross-tenant GL account link must be rejected
        rival_account = ChartOfAccount.objects.filter(company=self.company_b).first()
        cat.default_expense_account = rival_account
        with self.assertRaises(ValidationError):
            cat.clean()

    def test_02_direct_expense_creation_lifecycle_and_autonumbering(self):
        """Test direct company expense creation, auto-numbering EXP-YYYYMM-0001, and approval."""
        expense = ExpenseService.create_direct_expense(
            company=self.company_a,
            title="Head Office Internet Fiber Link",
            amount=Decimal('15000.0000'),
            category=self.cat_site,
            expense_date=date(2026, 1, 15),
            payee="PTCL Enterprise",
            cost_center=self.cost_center_admin,
            user=self.user_a,
            submit_now=True
        )

        self.assertTrue(expense.expense_number.startswith("EXP-202601-"))
        self.assertEqual(expense.status, ExpenseStatus.PENDING_APPROVAL)
        self.assertEqual(expense.total_amount, Decimal('15000.0000'))
        self.assertEqual(expense.payment_status, ExpensePaymentStatus.UNPAID)

        # Approve expense
        ExpenseService.approve_expense(expense, user=self.user_a)
        expense.refresh_from_db()
        self.assertEqual(expense.status, ExpenseStatus.APPROVED)
        self.assertEqual(expense.approved_by, self.user_a)

    def test_03_split_expense_allocation_and_over_allocation_guardrails(self):
        """Test distributing an expense across multiple sites/cost centers with strict over-allocation blocking."""
        expense = ExpenseService.create_direct_expense(
            company=self.company_a,
            title="Bulk Patrol Fleet Fuel",
            amount=Decimal('100000.0000'),
            category=self.cat_fuel,
            expense_date=date(2026, 1, 20),
            user=self.user_a
        )

        # Try over-allocating: 60k + 50k = 110k (Exceeds 100k)
        with self.assertRaises(ValidationError):
            ExpenseService.set_split_allocations(
                expense=expense,
                allocations_data=[
                    {'amount': Decimal('60000.0000'), 'site_id': self.site_karachi.id, 'description': 'Karachi Patrol'},
                    {'amount': Decimal('50000.0000'), 'cost_center_id': self.cost_center_admin.id, 'description': 'Admin Vehicles'}
                ]
            )

        # Valid exact allocation: 60k + 40k = 100k
        allocs = ExpenseService.set_split_allocations(
            expense=expense,
            allocations_data=[
                {'amount': Decimal('60000.0000'), 'site_id': self.site_karachi.id, 'description': 'Karachi Patrol'},
                {'amount': Decimal('40000.0000'), 'cost_center_id': self.cost_center_admin.id, 'description': 'Admin Vehicles'}
            ]
        )
        self.assertEqual(len(allocs), 2)
        expense.refresh_from_db()
        self.assertTrue(expense.is_split_allocation)

    def test_04_direct_expense_payment_treasury_integration(self):
        """Test paying an approved expense via S-4D Treasury voucher and updating operational balances."""
        expense = ExpenseService.create_direct_expense(
            company=self.company_a,
            title="Emergency Generator Fuel",
            amount=Decimal('45000.0000'),
            category=self.cat_fuel,
            expense_date=date(2026, 1, 10),
            payee="Shell Pakistan",
            user=self.user_a,
            submit_now=True
        )
        ExpenseService.approve_expense(expense, user=self.user_a)

        initial_bal = self.hbl_bank.current_balance
        voucher = ExpenseService.pay_expense(
            expense=expense,
            bank_account=self.hbl_bank,
            payment_method=PaymentMethod.BANK_TRANSFER,
            payment_date=date(2026, 1, 10),
            user=self.user_a
        )

        expense.refresh_from_db()
        self.hbl_bank.refresh_from_db()

        self.assertEqual(expense.status, ExpenseStatus.PAID)
        self.assertEqual(expense.payment_status, ExpensePaymentStatus.PAID)
        self.assertEqual(expense.voucher, voucher)
        self.assertEqual(self.hbl_bank.current_balance, initial_bal - Decimal('45000.0000'))

        # Idempotency: Paying already paid expense returns existing voucher without double-charging
        v2 = ExpenseService.pay_expense(
            expense=expense,
            bank_account=self.hbl_bank,
            user=self.user_a
        )
        self.assertEqual(voucher.id, v2.id)
        self.hbl_bank.refresh_from_db()
        self.assertEqual(self.hbl_bank.current_balance, initial_bal - Decimal('45000.0000'))

    def test_05_paid_expense_reversal_rolls_back_treasury(self):
        """Test full audit reversal of paid expense and rollback of treasury movement."""
        expense = ExpenseService.create_direct_expense(
            company=self.company_a,
            title="Wrong Vendor Payment",
            amount=Decimal('30000.0000'),
            category=self.cat_site,
            expense_date=date(2026, 1, 12),
            user=self.user_a,
            submit_now=True
        )
        ExpenseService.approve_expense(expense, user=self.user_a)
        ExpenseService.pay_expense(expense, self.hbl_bank, payment_method=PaymentMethod.BANK_TRANSFER, user=self.user_a)

        self.hbl_bank.refresh_from_db()
        bal_after_pay = self.hbl_bank.current_balance

        # Perform formal reversal
        ExpenseService.reverse_expense(
            expense=expense,
            reason="Duplicate invoice entry by operational supervisor",
            user=self.user_a
        )

        expense.refresh_from_db()
        self.hbl_bank.refresh_from_db()

        self.assertEqual(expense.status, ExpenseStatus.REVERSED)
        self.assertEqual(expense.payment_status, ExpensePaymentStatus.UNPAID)
        self.assertEqual(self.hbl_bank.current_balance, bal_after_pay + Decimal('30000.0000'))

    def test_06_employee_expense_claim_submission_and_reimbursement(self):
        """Test employee submitting reimbursement claim, approval, and reimbursement voucher creation."""
        claim = ExpenseService.create_employee_claim(
            company=self.company_a,
            employee=self.emp_guard,
            title="Emergency Torches for Night Shift",
            amount=Decimal('6500.0000'),
            category=self.cat_site,
            expense_date=date(2026, 1, 14),
            site=self.site_karachi,
            receipt_reference="RCP-TORCH-881",
            user=self.user_a,
            submit_now=True
        )

        self.assertEqual(claim.expense_type, ExpenseType.EMPLOYEE_CLAIM)
        self.assertEqual(claim.employee, self.emp_guard)
        self.assertEqual(claim.status, ExpenseStatus.PENDING_APPROVAL)

        # Approve and reimburse claim
        ExpenseService.approve_employee_claim(claim, user=self.user_a)
        v = ExpenseService.reimburse_employee_claim(
            claim=claim,
            bank_account=self.hbl_bank,
            payment_method=PaymentMethod.ONLINE_TRANSFER,
            user=self.user_a
        )

        claim.refresh_from_db()
        self.assertEqual(claim.status, ExpenseStatus.PAID)
        self.assertEqual(claim.voucher, v)

        # Cannot reimburse already reimbursed claim
        with self.assertRaises(ValidationError):
            ExpenseService.reimburse_employee_claim(
                claim=claim,
                bank_account=self.hbl_bank,
                user=self.user_a
            )

    def test_07_petty_cash_custodian_and_contra_funding(self):
        """Test configuring petty cash custodian and funding petty cash via S-4D contra transfer."""
        cust = PettyCashService.configure_custodian(
            company=self.company_a,
            bank_account=self.petty_cash_acc,
            custodian=self.emp_supervisor,
            float_limit=Decimal('50000.0000'),
            replenishment_threshold=Decimal('10000.0000'),
            max_single_expense_limit=Decimal('15000.0000')
        )
        self.assertEqual(cust.custodian, self.emp_supervisor)

        initial_hbl = self.hbl_bank.current_balance
        initial_pc = self.petty_cash_acc.current_balance

        # Fund Petty Cash PKR 30,000 from HBL
        contra = PettyCashService.fund_petty_cash(
            from_account=self.hbl_bank,
            to_petty_cash_account=self.petty_cash_acc,
            amount=Decimal('30000.0000'),
            date=date(2026, 1, 5),
            reference='FUND-HO-PC-JAN',
            user=self.user_a
        )

        self.assertEqual(contra.voucher_type, VoucherType.CONTRA_VOUCHER)
        self.hbl_bank.refresh_from_db()
        self.petty_cash_acc.refresh_from_db()

        self.assertEqual(self.hbl_bank.current_balance, initial_hbl - Decimal('30000.0000'))
        self.assertEqual(self.petty_cash_acc.current_balance, initial_pc + Decimal('30000.0000'))

    def test_08_petty_cash_expense_disbursement_and_limit_enforcement(self):
        """Test recording small expense disbursed from petty cash and enforcing single transaction limit."""
        PettyCashService.configure_custodian(
            company=self.company_a,
            bank_account=self.petty_cash_acc,
            custodian=self.emp_supervisor,
            max_single_expense_limit=Decimal('15000.0000')
        )

        # Amount exceeding limit must be rejected
        with self.assertRaises(ValidationError):
            PettyCashService.record_petty_cash_expense(
                company=self.company_a,
                petty_cash_account=self.petty_cash_acc,
                title="Expensive Hardware",
                amount=Decimal('18000.0000'),
                user=self.user_a
            )

        # Valid petty cash expense: PKR 4,500
        pc_bal_before = self.petty_cash_acc.current_balance
        exp = PettyCashService.record_petty_cash_expense(
            company=self.company_a,
            petty_cash_account=self.petty_cash_acc,
            title="Office Tea & Guest Refreshments",
            amount=Decimal('4500.0000'),
            payee="Metro Supermarket",
            user=self.user_a,
            auto_post=True
        )

        self.assertEqual(exp.status, ExpenseStatus.PAID)
        self.assertEqual(exp.expense_type, ExpenseType.PETTY_CASH_EXPENSE)
        self.petty_cash_acc.refresh_from_db()
        self.assertEqual(self.petty_cash_acc.current_balance, pc_bal_before - Decimal('4500.0000'))

    def test_09_employee_advance_disbursal_and_treasury_posting(self):
        """Test requesting, approving, and disbursing an employee advance."""
        advance = EmployeeAdvanceService.create_advance(
            company=self.company_a,
            employee=self.emp_supervisor,
            amount=Decimal('50000.0000'),
            advance_type=EmployeeAdvanceType.SITE_ADVANCE,
            advance_date=date(2026, 1, 10),
            purpose="Site setup and guard emergency provisions",
            user=self.user_a,
            submit_now=True
        )

        self.assertTrue(advance.advance_number.startswith("ADV-202601-"))
        self.assertEqual(advance.status, AdvanceStatus.PENDING_APPROVAL)
        self.assertEqual(advance.outstanding_balance, Decimal('50000.0000'))

        # Approve and disburse advance
        EmployeeAdvanceService.approve_advance(advance, user=self.user_a)
        hbl_before = self.hbl_bank.current_balance

        v = EmployeeAdvanceService.pay_advance(
            advance=advance,
            bank_account=self.hbl_bank,
            payment_method=PaymentMethod.BANK_TRANSFER,
            user=self.user_a
        )

        advance.refresh_from_db()
        self.hbl_bank.refresh_from_db()

        self.assertEqual(advance.status, AdvanceStatus.PAID)
        self.assertEqual(advance.voucher, v)
        self.assertEqual(self.hbl_bank.current_balance, hbl_before - Decimal('50000.0000'))

    def test_10_advance_settlement_with_expenses_and_cash_return(self):
        """Test settling an advance with submitted expense vouchers + cash return into Treasury."""
        advance = EmployeeAdvanceService.create_advance(
            company=self.company_a,
            employee=self.emp_supervisor,
            amount=Decimal('50000.0000'),
            user=self.user_a,
            submit_now=True
        )
        EmployeeAdvanceService.approve_advance(advance, user=self.user_a)
        EmployeeAdvanceService.pay_advance(advance, self.hbl_bank, user=self.user_a)

        # Supervisor submits two expenses: 30k + 12k = 42k
        e1 = ExpenseService.create_direct_expense(
            company=self.company_a,
            title="Site Barrier Installation",
            amount=Decimal('30000.0000'),
            employee=self.emp_supervisor,
            user=self.user_a
        )
        e2 = ExpenseService.create_direct_expense(
            company=self.company_a,
            title="Night Vision Equipment Rental",
            amount=Decimal('12000.0000'),
            employee=self.emp_supervisor,
            user=self.user_a
        )

        # Returns 8k cash into petty cash
        pc_before = self.petty_cash_acc.current_balance

        result = EmployeeAdvanceService.settle_advance_with_expenses(
            advance=advance,
            expense_ids=[e1.id, e2.id],
            cash_returned=Decimal('8000.0000'),
            cash_return_bank_account=self.petty_cash_acc,
            user=self.user_a
        )

        advance.refresh_from_db()
        self.petty_cash_acc.refresh_from_db()

        self.assertEqual(advance.status, AdvanceStatus.SETTLED)
        self.assertEqual(advance.settled_amount, Decimal('42000.0000'))
        self.assertEqual(advance.returned_amount, Decimal('8000.0000'))
        self.assertEqual(advance.outstanding_balance, Decimal('0.0000'))
        self.assertEqual(result['excess_reimbursement_required'], Decimal('0.0000'))
        self.assertEqual(self.petty_cash_acc.current_balance, pc_before + Decimal('8000.0000'))

    def test_11_excess_expenses_settle_advance_and_require_reimbursement(self):
        """Test employee submitting expenses greater than advance balance -> advance settles to 0, difference required."""
        advance = EmployeeAdvanceService.create_advance(
            company=self.company_a,
            employee=self.emp_supervisor,
            amount=Decimal('20000.0000'),
            user=self.user_a,
            submit_now=True
        )
        EmployeeAdvanceService.approve_advance(advance, user=self.user_a)
        EmployeeAdvanceService.pay_advance(advance, self.hbl_bank, user=self.user_a)

        # Supervisor spent 26,000 (6k out of pocket)
        e_big = ExpenseService.create_direct_expense(
            company=self.company_a,
            title="Full Site Overhaul Expense",
            amount=Decimal('26000.0000'),
            employee=self.emp_supervisor,
            user=self.user_a
        )

        result = EmployeeAdvanceService.settle_advance_with_expenses(
            advance=advance,
            expense_ids=[e_big.id],
            user=self.user_a
        )

        advance.refresh_from_db()
        self.assertEqual(advance.status, AdvanceStatus.SETTLED)
        self.assertEqual(advance.settled_amount, Decimal('20000.0000'))
        self.assertEqual(advance.outstanding_balance, Decimal('0.0000'))
        self.assertEqual(result['excess_reimbursement_required'], Decimal('6000.0000'))
        self.assertGreaterEqual(advance.outstanding_balance, Decimal('0.0000'))

    def test_12_closed_accounting_period_protection(self):
        """Test that paying an expense in a closed/locked accounting period is strictly rejected."""
        period_jan = AccountingPeriod.objects.filter(company=self.company_a, period_number=1).first()
        period_jan.status = PeriodStatus.CLOSED
        period_jan.save()

        expense = ExpenseService.create_direct_expense(
            company=self.company_a,
            title="Closed Period Bill",
            amount=Decimal('10000.0000'),
            expense_date=date(2026, 1, 15),
            user=self.user_a,
            submit_now=True
        )
        ExpenseService.approve_expense(expense, user=self.user_a)

        with self.assertRaises(ValidationError) as ctx:
            ExpenseService.pay_expense(
                expense=expense,
                bank_account=self.hbl_bank,
                payment_date=date(2026, 1, 15),
                user=self.user_a
            )
        self.assertIn("closed/locked period", str(ctx.exception))

    def test_13_cross_tenant_isolation_enforcement(self):
        """Test cross-company linking is strictly blocked across all expense models."""
        rival_emp = Employee.objects.create(
            company=self.company_b,
            first_name="Rival",
            last_name="Guard"
        )
        rival_bank = BankAccount.objects.filter(company=self.company_b).first()

        # Cannot create expense in Company A with employee from Company B
        with self.assertRaises(ValidationError):
            ExpenseService.create_direct_expense(
                company=self.company_a,
                title="Cross Tenant Exploit",
                amount=Decimal('5000.0000'),
                employee=rival_emp,
                user=self.user_a
            )

        # Cannot pay Company A expense with Company B bank account
        exp = ExpenseService.create_direct_expense(
            company=self.company_a,
            title="Company A Expense",
            amount=Decimal('5000.0000'),
            user=self.user_a,
            submit_now=True
        )
        ExpenseService.approve_expense(exp, user=self.user_a)

        with self.assertRaises(ValidationError):
            ExpenseService.pay_expense(
                expense=exp,
                bank_account=rival_bank,
                user=self.user_a
            )
