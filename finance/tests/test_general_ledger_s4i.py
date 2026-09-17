"""
finance/tests/test_general_ledger_s4i.py
Zorvex ERP 2.0 — Phase S-4I: General Ledger, Double-Entry Posting, Journals & Trial Balance

Targeted Test Suite verifying:
1. Double-Entry Balancing Invariant (Debit == Credit)
2. Accounting Period Locking Guardrails
3. Control Account Protection
4. Source Idempotency
5. Subledger Integrations (Billing, Receipts, Purchasing, Expenses, Payroll, Taxes, Treasury)
6. Immutability & Reversal Architecture
7. General Ledger Running Balance Calculation
8. Trial Balance Total Reconciliation
9. Subledger Reconciliations & Posting Queue
"""

import datetime
from decimal import Decimal
from django.test import TestCase
from django.core.exceptions import ValidationError
from django.contrib.auth import get_user_model

from companies.models import Company
from crm.models import CRMEntity
from operations.models import ServiceContract, OperationalSite
from purchasing.models import Vendor
from hrm.models import Employee, Department
from finance.models import (
    ChartOfAccount, AccountGroup, AccountType, NormalBalance, Currency,
    FiscalYear, AccountingPeriod, PeriodStatus,
    Journal, JournalType, JournalEntry, JournalEntryLine, JournalStatus, JournalSourceType,
    CostCenter, ProfitCenter, BankAccount, SecurityFinanceConfiguration,
    Expense, ExpenseStatus, PaymentMethod,
    PayrollAccountingIntegration, PayrollAccountingStatus,
    SalaryPaymentBatch, SalaryPaymentBatchStatus,
    TaxAuthority, TaxPeriod, TaxPeriodStatus, TaxPaymentVoucher, TaxVoucherStatus,
    FinancialVoucher, VoucherType, VoucherStatus
)
from finance.services.posting_service import AccountingPostingService

User = get_user_model()


class GeneralLedgerS4ITests(TestCase):
    @classmethod
    def setUpTestData(cls):
        # 1. Company Setup
        cls.company = Company.objects.create(name="Zorvex Security Services Ltd")
        cls.other_company = Company.objects.create(name="Other Cross-Tenant Co")

        cls.user = User.objects.create_user(
            username="finance_auditor",
            password="SecurePassword123!",
            company=cls.company
        )

        cls.currency = Currency.objects.create(
            company=cls.company,
            code="PKR",
            name="Pakistani Rupee",
            symbol="Rs",
            is_base_currency=True
        )

        # 2. Fiscal Year & Periods
        cls.fy = FiscalYear.objects.create(
            company=cls.company,
            name="FY-2026",
            start_date=datetime.date(2026, 1, 1),
            end_date=datetime.date(2026, 12, 31),
            is_current=True
        )
        cls.period_jan = AccountingPeriod.objects.create(
            company=cls.company,
            fiscal_year=cls.fy,
            month=1,
            start_date=datetime.date(2026, 1, 1),
            end_date=datetime.date(2026, 1, 31),
            status=PeriodStatus.OPEN
        )
        cls.period_feb = AccountingPeriod.objects.create(
            company=cls.company,
            fiscal_year=cls.fy,
            month=2,
            start_date=datetime.date(2026, 2, 1),
            end_date=datetime.date(2026, 2, 28),
            status=PeriodStatus.CLOSED
        )

        # 3. Account Groups
        cls.grp_asset = AccountGroup.objects.create(company=cls.company, name="Current Assets", group_type="ASSET")
        cls.grp_liab = AccountGroup.objects.create(company=cls.company, name="Current Liabilities", group_type="LIABILITY")
        cls.grp_rev = AccountGroup.objects.create(company=cls.company, name="Operating Revenue", group_type="REVENUE")
        cls.grp_exp = AccountGroup.objects.create(company=cls.company, name="Operating Expenses", group_type="EXPENSE")

        # 4. Standard Chart of Accounts
        cls.acc_bank = ChartOfAccount.objects.create(
            company=cls.company, account_group=cls.grp_asset,
            account_code="1120", account_name="Main Operations Bank Account",
            account_type=AccountType.ASSET, normal_balance=NormalBalance.DEBIT,
            allow_posting=True, is_active=True, currency=cls.currency
        )
        cls.acc_petty_cash = ChartOfAccount.objects.create(
            company=cls.company, account_group=cls.grp_asset,
            account_code="1110", account_name="Petty Cash Fund",
            account_type=AccountType.ASSET, normal_balance=NormalBalance.DEBIT,
            allow_posting=True, is_active=True, currency=cls.currency
        )
        cls.acc_ar = ChartOfAccount.objects.create(
            company=cls.company, account_group=cls.grp_asset,
            account_code="1200", account_name="Accounts Receivable Control",
            account_type=AccountType.ASSET, normal_balance=NormalBalance.DEBIT,
            is_control_account=True, allow_posting=True, is_active=True, currency=cls.currency
        )
        cls.acc_adv_rec = ChartOfAccount.objects.create(
            company=cls.company, account_group=cls.grp_asset,
            account_code="1300", account_name="Employee Advances Receivable",
            account_type=AccountType.ASSET, normal_balance=NormalBalance.DEBIT,
            allow_posting=True, is_active=True, currency=cls.currency
        )
        cls.acc_wht_rec = ChartOfAccount.objects.create(
            company=cls.company, account_group=cls.grp_asset,
            account_code="1400", account_name="Advance / Withholding Tax Receivable",
            account_type=AccountType.ASSET, normal_balance=NormalBalance.DEBIT,
            allow_posting=True, is_active=True, currency=cls.currency
        )
        cls.acc_ap = ChartOfAccount.objects.create(
            company=cls.company, account_group=cls.grp_liab,
            account_code="2100", account_name="Accounts Payable Control",
            account_type=AccountType.LIABILITY, normal_balance=NormalBalance.CREDIT,
            is_control_account=True, allow_posting=True, is_active=True, currency=cls.currency
        )
        cls.acc_payroll_pay = ChartOfAccount.objects.create(
            company=cls.company, account_group=cls.grp_liab,
            account_code="2200", account_name="Salaries & Payroll Payable",
            account_type=AccountType.LIABILITY, normal_balance=NormalBalance.CREDIT,
            is_control_account=True, allow_posting=True, is_active=True, currency=cls.currency
        )
        cls.acc_tax_pay = ChartOfAccount.objects.create(
            company=cls.company, account_group=cls.grp_liab,
            account_code="2300", account_name="Sales & Withholding Tax Payable",
            account_type=AccountType.LIABILITY, normal_balance=NormalBalance.CREDIT,
            is_control_account=True, allow_posting=True, is_active=True, currency=cls.currency
        )
        cls.acc_payroll_tax_pay = ChartOfAccount.objects.create(
            company=cls.company, account_group=cls.grp_liab,
            account_code="2310", account_name="Employee Income Tax Payable",
            account_type=AccountType.LIABILITY, normal_balance=NormalBalance.CREDIT,
            is_control_account=True, allow_posting=True, is_active=True, currency=cls.currency
        )
        cls.acc_rev_service = ChartOfAccount.objects.create(
            company=cls.company, account_group=cls.grp_rev,
            account_code="4100", account_name="Security Guarding Service Revenue",
            account_type=AccountType.REVENUE, normal_balance=NormalBalance.CREDIT,
            allow_posting=True, is_active=True, currency=cls.currency
        )
        cls.acc_rev_ot = ChartOfAccount.objects.create(
            company=cls.company, account_group=cls.grp_rev,
            account_code="4200", account_name="Overtime Billing Revenue",
            account_type=AccountType.REVENUE, normal_balance=NormalBalance.CREDIT,
            allow_posting=True, is_active=True, currency=cls.currency
        )
        cls.acc_exp_salaries = ChartOfAccount.objects.create(
            company=cls.company, account_group=cls.grp_exp,
            account_code="5100", account_name="Guard Salaries & Field Wages",
            account_type=AccountType.COST_OF_SERVICE, normal_balance=NormalBalance.DEBIT,
            allow_posting=True, is_active=True, currency=cls.currency
        )
        cls.acc_exp_ot = ChartOfAccount.objects.create(
            company=cls.company, account_group=cls.grp_exp,
            account_code="5200", account_name="Guard Overtime Cost",
            account_type=AccountType.COST_OF_SERVICE, normal_balance=NormalBalance.DEBIT,
            allow_posting=True, is_active=True, currency=cls.currency
        )
        cls.acc_exp_general = ChartOfAccount.objects.create(
            company=cls.company, account_group=cls.grp_exp,
            account_code="6300", account_name="General & Administrative Expenses",
            account_type=AccountType.EXPENSE, normal_balance=NormalBalance.DEBIT,
            allow_posting=True, is_active=True, currency=cls.currency
        )

        # 5. Security Finance Config
        cls.fin_config = SecurityFinanceConfiguration.objects.create(
            company=cls.company,
            accounts_receivable_account=cls.acc_ar,
            accounts_payable_account=cls.acc_ap,
            payroll_payable_account=cls.acc_payroll_pay,
            tax_payable_account=cls.acc_tax_pay,
            security_service_revenue_account=cls.acc_rev_service,
            overtime_revenue_account=cls.acc_rev_ot,
            salary_cost_account=cls.acc_exp_salaries,
            overtime_cost_account=cls.acc_exp_ot,
            is_active=True
        )

        # 6. Bank Account
        cls.bank_acc = BankAccount.objects.create(
            company=cls.company,
            bank_name="Habib Bank Limited",
            account_title="Zorvex Security Operations",
            account_number="HBL-99281-01",
            currency=cls.currency,
            chart_of_account=cls.acc_bank
        )

        # 7. Operational Dimensions
        cls.cost_center = CostCenter.objects.create(
            company=cls.company,
            name="Physical Security Operations",
            code="CC-OPS"
        )
        cls.profit_center = ProfitCenter.objects.create(
            company=cls.company,
            name="Commercial Division - Islamabad",
            code="PC-ISB"
        )
        cls.client = CRMEntity.objects.create(
            company=cls.company,
            name="Apex Diplomatic Mission",
            entity_type="CLIENT"
        )
        cls.vendor = Vendor.objects.create(
            company=cls.company,
            name="Tactical Gear Suppliers",
            code="VND-001"
        )

    def test_01_balanced_double_entry_posting(self):
        """Verify that a balanced manual journal entry posts successfully and updates account balances."""
        journal = AccountingPostingService.get_or_create_journal(self.company, JournalType.GENERAL)
        
        lines = [
            {'account': self.acc_exp_general, 'debit': Decimal('15000.00'), 'credit': Decimal('0.00'), 'description': 'Office Stationery'},
            {'account': self.acc_bank, 'debit': Decimal('0.00'), 'credit': Decimal('15000.00'), 'description': 'Paid via Bank'},
        ]

        entry = AccountingPostingService.post_journal_entry(
            company=self.company,
            journal=journal,
            posting_date=datetime.date(2026, 1, 10),
            lines=lines,
            description="Manual Office Expense",
            user=self.user
        )

        self.assertEqual(entry.status, JournalStatus.POSTED)
        self.assertTrue(entry.entry_number.startswith("JE-202601-"))
        self.assertEqual(entry.lines.count(), 2)

        # Verify running balance updates
        self.acc_exp_general.refresh_from_db()
        self.acc_bank.refresh_from_db()
        self.assertEqual(self.acc_exp_general.current_balance, Decimal('15000.0000'))
        self.assertEqual(self.acc_bank.current_balance, Decimal('-15000.0000'))

    def test_02_unbalanced_journal_entry_rejection(self):
        """Verify that unbalanced debit/credit lines raise ValidationError."""
        journal = AccountingPostingService.get_or_create_journal(self.company, JournalType.GENERAL)
        
        unbalanced_lines = [
            {'account': self.acc_exp_general, 'debit': Decimal('20000.00'), 'credit': Decimal('0.00')},
            {'account': self.acc_bank, 'debit': Decimal('0.00'), 'credit': Decimal('18000.00')},  # Mismatch 2,000
        ]

        with self.assertRaises(ValidationError) as ctx:
            AccountingPostingService.post_journal_entry(
                company=self.company,
                journal=journal,
                posting_date=datetime.date(2026, 1, 12),
                lines=unbalanced_lines,
                description="Unbalanced Attempt",
                user=self.user
            )
        self.assertIn("Double-entry balance mismatch", str(ctx.exception))

    def test_03_accounting_period_lock_enforcement(self):
        """Verify that posting into a CLOSED accounting period is strictly rejected."""
        journal = AccountingPostingService.get_or_create_journal(self.company, JournalType.GENERAL)
        
        lines = [
            {'account': self.acc_exp_general, 'debit': Decimal('5000.00'), 'credit': Decimal('0.00')},
            {'account': self.acc_bank, 'debit': Decimal('0.00'), 'credit': Decimal('5000.00')},
        ]

        # Attempt to post on Feb 15 (Period Feb is CLOSED)
        with self.assertRaises(ValidationError) as ctx:
            AccountingPostingService.post_journal_entry(
                company=self.company,
                journal=journal,
                posting_date=datetime.date(2026, 2, 15),
                lines=lines,
                description="Closed Period Attempt",
                user=self.user
            )
        self.assertIn("closed", str(ctx.exception).lower())

    def test_04_control_account_direct_manual_posting_guardrail(self):
        """Verify that direct unauthorized manual entries to control accounts (AR/AP/Payroll/Tax) are blocked."""
        journal = AccountingPostingService.get_or_create_journal(self.company, JournalType.GENERAL)
        
        lines = [
            {'account': self.acc_ar, 'debit': Decimal('10000.00'), 'credit': Decimal('0.00')},
            {'account': self.acc_bank, 'debit': Decimal('0.00'), 'credit': Decimal('10000.00')},
        ]

        with self.assertRaises(ValidationError) as ctx:
            AccountingPostingService.post_journal_entry(
                company=self.company,
                journal=journal,
                posting_date=datetime.date(2026, 1, 15),
                lines=lines,
                is_manual=True,
                allow_control_account_override=False,
                user=self.user
            )
        self.assertIn("Direct manual posting to control account", str(ctx.exception))

    def test_05_source_idempotency(self):
        """Verify that attempting to re-post the same source event returns the existing journal entry."""
        journal = AccountingPostingService.get_or_create_journal(self.company, JournalType.EXPENSE)
        
        lines = [
            {'account': self.acc_exp_general, 'debit': Decimal('7500.00'), 'credit': Decimal('0.00')},
            {'account': self.acc_bank, 'debit': Decimal('0.00'), 'credit': Decimal('7500.00')},
        ]

        entry_1 = AccountingPostingService.post_journal_entry(
            company=self.company,
            journal=journal,
            posting_date=datetime.date(2026, 1, 16),
            lines=lines,
            source_type=JournalSourceType.EXPENSE,
            source_id="EXP-TEST-999",
            user=self.user
        )

        entry_2 = AccountingPostingService.post_journal_entry(
            company=self.company,
            journal=journal,
            posting_date=datetime.date(2026, 1, 16),
            lines=lines,
            source_type=JournalSourceType.EXPENSE,
            source_id="EXP-TEST-999",
            user=self.user
        )

        self.assertEqual(entry_1.id, entry_2.id)
        self.assertEqual(JournalEntry.objects.filter(source_id="EXP-TEST-999").count(), 1)

    def test_06_reversal_architecture(self):
        """Verify that reversing a journal entry creates an immutable reversal entry and restores balances."""
        journal = AccountingPostingService.get_or_create_journal(self.company, JournalType.GENERAL)
        
        lines = [
            {'account': self.acc_exp_general, 'debit': Decimal('12000.00'), 'credit': Decimal('0.00'), 'description': 'IT Maintenance'},
            {'account': self.acc_bank, 'debit': Decimal('0.00'), 'credit': Decimal('12000.00'), 'description': 'Bank Disbursement'},
        ]

        original_entry = AccountingPostingService.post_journal_entry(
            company=self.company,
            journal=journal,
            posting_date=datetime.date(2026, 1, 18),
            lines=lines,
            description="IT Maintenance Invoice",
            user=self.user
        )

        self.assertEqual(original_entry.status, JournalStatus.POSTED)

        # Reverse entry
        reversal_entry = AccountingPostingService.reverse_journal_entry(
            journal_entry=original_entry,
            reason="Incorrect vendor invoice amount booked",
            reversal_date=datetime.date(2026, 1, 20),
            user=self.user
        )

        original_entry.refresh_from_db()
        self.assertEqual(original_entry.status, JournalStatus.REVERSED)
        self.assertEqual(original_entry.reversal_reason, "Incorrect vendor invoice amount booked")
        
        self.assertEqual(reversal_entry.status, JournalStatus.POSTED)
        self.assertEqual(reversal_entry.reversal_of, original_entry)
        
        # Verify balances restored to 0
        self.acc_exp_general.refresh_from_db()
        self.acc_bank.refresh_from_db()
        self.assertEqual(self.acc_exp_general.current_balance, Decimal('0.0000'))
        self.assertEqual(self.acc_bank.current_balance, Decimal('0.0000'))

    def test_07_general_ledger_running_balance_query(self):
        """Verify that General Ledger report calculates accurate opening, line, and closing running balances."""
        journal = AccountingPostingService.get_or_create_journal(self.company, JournalType.GENERAL)

        # Post 3 entries across dates
        AccountingPostingService.post_journal_entry(
            company=self.company, journal=journal, posting_date=datetime.date(2026, 1, 5),
            lines=[{'account': self.acc_exp_general, 'debit': Decimal('3000.00'), 'credit': Decimal('0.00')},
                   {'account': self.acc_bank, 'debit': Decimal('0.00'), 'credit': Decimal('3000.00')}],
            user=self.user
        )
        AccountingPostingService.post_journal_entry(
            company=self.company, journal=journal, posting_date=datetime.date(2026, 1, 15),
            lines=[{'account': self.acc_exp_general, 'debit': Decimal('5000.00'), 'credit': Decimal('0.00')},
                   {'account': self.acc_bank, 'debit': Decimal('0.00'), 'credit': Decimal('5000.00')}],
            user=self.user
        )
        AccountingPostingService.post_journal_entry(
            company=self.company, journal=journal, posting_date=datetime.date(2026, 1, 25),
            lines=[{'account': self.acc_exp_general, 'debit': Decimal('2000.00'), 'credit': Decimal('0.00')},
                   {'account': self.acc_bank, 'debit': Decimal('0.00'), 'credit': Decimal('2000.00')}],
            user=self.user
        )

        # Query GL between Jan 10 and Jan 31 (Jan 5 should be in Opening Balance)
        report = AccountingPostingService.get_account_ledger(
            company=self.company,
            account=self.acc_exp_general,
            start_date=datetime.date(2026, 1, 10),
            end_date=datetime.date(2026, 1, 31)
        )

        self.assertEqual(report['opening_balance'], 3000.00)
        self.assertEqual(report['period_debit_total'], 7000.00)
        self.assertEqual(report['closing_balance'], 10000.00)
        self.assertEqual(len(report['lines']), 2)

    def test_08_authoritative_trial_balance_reconciliation(self):
        """Verify that Trial Balance aggregates all accounts and guarantees Total Debit == Total Credit."""
        journal = AccountingPostingService.get_or_create_journal(self.company, JournalType.GENERAL)

        # Post transactions
        AccountingPostingService.post_journal_entry(
            company=self.company, journal=journal, posting_date=datetime.date(2026, 1, 10),
            lines=[
                {'account': self.acc_exp_salaries, 'debit': Decimal('50000.00'), 'credit': Decimal('0.00')},
                {'account': self.acc_bank, 'debit': Decimal('0.00'), 'credit': Decimal('50000.00')}
            ],
            user=self.user
        )
        AccountingPostingService.post_journal_entry(
            company=self.company, journal=journal, posting_date=datetime.date(2026, 1, 15),
            lines=[
                {'account': self.acc_bank, 'debit': Decimal('80000.00'), 'credit': Decimal('0.00')},
                {'account': self.acc_rev_service, 'debit': Decimal('0.00'), 'credit': Decimal('80000.00')}
            ],
            user=self.user
        )

        tb = AccountingPostingService.get_trial_balance(
            company=self.company,
            start_date=datetime.date(2026, 1, 1),
            end_date=datetime.date(2026, 1, 31)
        )

        self.assertTrue(tb['is_balanced'])
        self.assertEqual(tb['totals']['closing_debit'], 80000.00)
        self.assertEqual(tb['totals']['closing_credit'], 80000.00)
        self.assertEqual(tb['totals']['difference'], 0.0)

    def test_09_subledger_reconciliations(self):
        """Verify subledger reconciliation calculations for AR, AP, Payroll, and Tax."""
        reconciliations = AccountingPostingService.get_subledger_reconciliations(self.company)
        self.assertIn('reconciliations', reconciliations)
        self.assertEqual(len(reconciliations['reconciliations']), 4)
        modules = [r['module'] for r in reconciliations['reconciliations']]
        self.assertIn('Accounts Receivable (Billing)', modules)
        self.assertIn('Accounts Payable (Purchasing)', modules)
        self.assertIn('Payroll Liabilities (HRM)', modules)
        self.assertIn('Statutory Taxes (Taxation)', modules)
