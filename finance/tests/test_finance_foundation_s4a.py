import uuid
from datetime import date
from decimal import Decimal
from django.test import TestCase
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from companies.models import Company
from finance.models import (
    ChartOfAccount, AccountType, NormalBalance,
    FiscalYear, AccountingPeriod, PeriodStatus,
    CostCenter, ProfitCenter, Currency,
    BankAccount, BankAccountType, SecurityFinanceConfiguration,
    Journal, JournalEntry, JournalEntryLine
)
from finance.services.period_service import can_post_transaction, validate_account_for_posting
from finance.services.security_coa_template import provision_security_chart_of_accounts

class FinanceFoundationS4ATestCase(TestCase):
    def setUp(self):
        self.company_a = Company.objects.create(
            name="Zorvex Security Alpha",
            business_type="security"
        )
        self.company_b = Company.objects.create(
            name="Apex Guarding Beta",
            business_type="security"
        )
        self.currency_a = Currency.objects.create(
            company=self.company_a,
            code="PKR",
            name="Pakistani Rupee",
            is_base_currency=True
        )
        self.currency_b = Currency.objects.create(
            company=self.company_b,
            code="PKR",
            name="Pakistani Rupee",
            is_base_currency=True
        )

    def test_tenant_scoped_coa_creation(self):
        acc = ChartOfAccount.objects.create(
            company=self.company_a,
            account_code="1000",
            account_name="Assets",
            account_type=AccountType.ASSET,
            is_header=True,
            allow_posting=False
        )
        self.assertEqual(acc.company, self.company_a)
        self.assertEqual(acc.normal_balance, NormalBalance.DEBIT)
        self.assertFalse(acc.allow_posting)

    def test_hierarchical_accounts_and_children(self):
        parent_acc = ChartOfAccount.objects.create(
            company=self.company_a,
            account_code="1000",
            account_name="Assets",
            account_type=AccountType.ASSET,
            is_header=True,
            allow_posting=False
        )
        child_acc = ChartOfAccount.objects.create(
            company=self.company_a,
            parent=parent_acc,
            account_code="1100",
            account_name="Cash & Bank",
            account_type=AccountType.ASSET,
            is_header=False,
            allow_posting=True
        )
        self.assertEqual(child_acc.parent, parent_acc)
        self.assertIn(child_acc, parent_acc.children.all())

    def test_duplicate_account_code_blocked(self):
        ChartOfAccount.objects.create(
            company=self.company_a,
            account_code="1200",
            account_name="Accounts Receivable",
            account_type=AccountType.ASSET
        )
        with self.assertRaises(IntegrityError):
            ChartOfAccount.objects.create(
                company=self.company_a,
                account_code="1200",
                account_name="Duplicate AR",
                account_type=AccountType.ASSET
            )

    def test_cross_tenant_parent_blocked(self):
        parent_b = ChartOfAccount.objects.create(
            company=self.company_b,
            account_code="1000",
            account_name="Beta Assets",
            account_type=AccountType.ASSET,
            is_header=True
        )
        child_a = ChartOfAccount(
            company=self.company_a,
            parent=parent_b,
            account_code="1100",
            account_name="Alpha Cash",
            account_type=AccountType.ASSET
        )
        with self.assertRaises(ValidationError):
            child_a.full_clean()

    def test_header_account_posting_control(self):
        header_acc = ChartOfAccount.objects.create(
            company=self.company_a,
            account_code="2000",
            account_name="Liabilities",
            account_type=AccountType.LIABILITY,
            is_header=True,
            allow_posting=False
        )
        with self.assertRaises(ValidationError) as ctx:
            validate_account_for_posting(header_acc)
        self.assertIn("header", str(ctx.exception).lower())

    def test_inactive_account_restrictions(self):
        inactive_acc = ChartOfAccount.objects.create(
            company=self.company_a,
            account_code="6900",
            account_name="Old Misc Expense",
            account_type=AccountType.EXPENSE,
            is_active=False
        )
        with self.assertRaises(ValidationError) as ctx:
            validate_account_for_posting(inactive_acc)
        self.assertIn("inactive", str(ctx.exception).lower())

    def test_accounting_period_date_lookup(self):
        fy = FiscalYear.objects.create(
            company=self.company_a,
            name="FY-2026",
            start_date=date(2026, 1, 1),
            end_date=date(2026, 12, 31),
            is_current=True
        )
        period = AccountingPeriod.objects.create(
            company=self.company_a,
            fiscal_year=fy,
            month=3,
            period_number=3,
            start_date=date(2026, 3, 1),
            end_date=date(2026, 3, 31),
            status=PeriodStatus.OPEN
        )

        can_post, msg, matched_p = can_post_transaction(self.company_a, date(2026, 3, 15))
        self.assertTrue(can_post)
        self.assertEqual(matched_p, period)

    def test_closed_period_posting_validation(self):
        fy = FiscalYear.objects.create(
            company=self.company_a,
            name="FY-2026",
            start_date=date(2026, 1, 1),
            end_date=date(2026, 12, 31),
            is_current=True
        )
        closed_period = AccountingPeriod.objects.create(
            company=self.company_a,
            fiscal_year=fy,
            month=1,
            period_number=1,
            start_date=date(2026, 1, 1),
            end_date=date(2026, 1, 31),
            status=PeriodStatus.CLOSED
        )
        soft_closed_period = AccountingPeriod.objects.create(
            company=self.company_a,
            fiscal_year=fy,
            month=2,
            period_number=2,
            start_date=date(2026, 2, 1),
            end_date=date(2026, 2, 28),
            status=PeriodStatus.SOFT_CLOSED
        )

        # Closed period: always blocked
        can_post_closed, msg_closed, _ = can_post_transaction(self.company_a, date(2026, 1, 15))
        self.assertFalse(can_post_closed)
        self.assertIn("closed", msg_closed.lower())

        # Soft closed: ordinary blocked, adjustment allowed
        can_post_soft, msg_soft, _ = can_post_transaction(self.company_a, date(2026, 2, 10), is_adjustment=False)
        self.assertFalse(can_post_soft)
        self.assertIn("soft_closed", msg_soft.lower())

        can_post_adj, msg_adj, _ = can_post_transaction(self.company_a, date(2026, 2, 10), is_adjustment=True)
        self.assertTrue(can_post_adj)

    def test_cost_center_hierarchy_and_tenant_isolation(self):
        cc_parent = CostCenter.objects.create(
            company=self.company_a,
            code="HO",
            name="Head Office"
        )
        cc_child = CostCenter.objects.create(
            company=self.company_a,
            parent=cc_parent,
            code="HO-FIN",
            name="Head Office Finance"
        )
        self.assertEqual(cc_child.parent, cc_parent)

        # Cross tenant parent blocked
        cc_beta = CostCenter.objects.create(
            company=self.company_b,
            code="BETA-HQ",
            name="Beta HQ"
        )
        cc_invalid = CostCenter(
            company=self.company_a,
            parent=cc_beta,
            code="INV",
            name="Invalid CC"
        )
        with self.assertRaises(ValidationError):
            cc_invalid.full_clean()

    def test_profit_center_hierarchy_and_tenant_isolation(self):
        pc_parent = ProfitCenter.objects.create(
            company=self.company_a,
            code="SECURITY",
            name="Security Services BU"
        )
        pc_child = ProfitCenter.objects.create(
            company=self.company_a,
            parent=pc_parent,
            code="GUARDING",
            name="Manned Guarding"
        )
        self.assertEqual(pc_child.parent, pc_parent)

        pc_beta = ProfitCenter.objects.create(
            company=self.company_b,
            code="BETA-PC",
            name="Beta Profit Center"
        )
        pc_invalid = ProfitCenter(
            company=self.company_a,
            parent=pc_beta,
            code="INV-PC",
            name="Invalid PC"
        )
        with self.assertRaises(ValidationError):
            pc_invalid.full_clean()

    def test_bank_account_gl_account_validation(self):
        asset_account = ChartOfAccount.objects.create(
            company=self.company_a,
            account_code="1120",
            account_name="Operating Bank",
            account_type=AccountType.ASSET
        )
        liability_account = ChartOfAccount.objects.create(
            company=self.company_a,
            account_code="2100",
            account_name="Accounts Payable",
            account_type=AccountType.LIABILITY
        )

        # Valid asset account link
        bank = BankAccount.objects.create(
            company=self.company_a,
            account_type=BankAccountType.BANK,
            bank_name="HBL",
            account_title="Alpha Operating",
            account_number="123456",
            chart_of_account=asset_account
        )
        self.assertEqual(bank.chart_of_account, asset_account)

        # Linking to Liability account blocked
        invalid_bank = BankAccount(
            company=self.company_a,
            account_type=BankAccountType.BANK,
            account_title="Invalid Bank",
            account_number="999999",
            chart_of_account=liability_account
        )
        with self.assertRaises(ValidationError):
            invalid_bank.full_clean()

    def test_finance_control_account_mapping(self):
        ar_acc = ChartOfAccount.objects.create(
            company=self.company_a,
            account_code="1200",
            account_name="AR",
            account_type=AccountType.ASSET
        )
        ap_acc = ChartOfAccount.objects.create(
            company=self.company_a,
            account_code="2100",
            account_name="AP",
            account_type=AccountType.LIABILITY
        )
        rev_acc = ChartOfAccount.objects.create(
            company=self.company_a,
            account_code="4100",
            account_name="Security Revenue",
            account_type=AccountType.REVENUE
        )

        config = SecurityFinanceConfiguration.objects.create(
            company=self.company_a,
            accounts_receivable_account=ar_acc,
            accounts_payable_account=ap_acc,
            security_service_revenue_account=rev_acc,
            default_currency=self.currency_a
        )
        self.assertEqual(config.accounts_receivable_account, ar_acc)
        self.assertEqual(config.accounts_payable_account, ap_acc)

        # Cross-company account link blocked
        ar_b = ChartOfAccount.objects.create(
            company=self.company_b,
            account_code="1200",
            account_name="Beta AR",
            account_type=AccountType.ASSET
        )
        invalid_config = SecurityFinanceConfiguration(
            company=self.company_a,
            accounts_receivable_account=ar_b,
            default_currency=self.currency_a
        )
        with self.assertRaises(ValidationError):
            invalid_config.full_clean()

    def test_security_coa_provisioning_service(self):
        result = provision_security_chart_of_accounts(self.company_a)
        self.assertEqual(result['status'], 'success')
        self.assertGreater(result['total_accounts'], 20)

        # Verify key control accounts exist
        ar = ChartOfAccount.objects.filter(company=self.company_a, account_code="1200").first()
        self.assertIsNotNone(ar)
        self.assertTrue(ar.is_control_account)

        ap = ChartOfAccount.objects.filter(company=self.company_a, account_code="2100").first()
        self.assertIsNotNone(ap)
        self.assertTrue(ap.is_control_account)

        # Verify configuration is populated
        cfg = SecurityFinanceConfiguration.objects.filter(company=self.company_a, is_active=True).first()
        self.assertIsNotNone(cfg)
        self.assertEqual(cfg.accounts_receivable_account.account_code, "1200")
        self.assertEqual(cfg.accounts_payable_account.account_code, "2100")
        self.assertEqual(cfg.security_service_revenue_account.account_code, "4100")

    def test_delete_account_restrictions(self):
        sys_acc = ChartOfAccount.objects.create(
            company=self.company_a,
            account_code="1000",
            account_name="System Assets",
            account_type=AccountType.ASSET,
            is_system_controlled=True
        )
        with self.assertRaises(ValidationError) as ctx:
            sys_acc.delete()
        self.assertIn("system-controlled", str(ctx.exception).lower())
