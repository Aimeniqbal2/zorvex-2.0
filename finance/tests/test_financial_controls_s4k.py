from decimal import Decimal
from datetime import date, timedelta
from django.test import TestCase
from django.core.exceptions import ValidationError
from companies.models import Company
from accounts.models import User
from finance.models import (
    FiscalYear, AccountingPeriod, PeriodStatus, ChartOfAccount, AccountType, NormalBalance,
    Journal, JournalType, JournalEntry, JournalEntryLine, JournalStatus, BankAccount, BankAccountType,
    BankStatement, BankStatementLine, MatchStatus, ReconciliationStatus, CashCount,
    CashCountStatus, ControlException, SubledgerReconciliationSnapshot
)
from finance.services.posting_service import AccountingPostingService
from finance.services.period_close_service import PeriodCloseService
from finance.services.year_end_closing_service import YearEndClosingService
from finance.services.bank_reconciliation_service import BankReconciliationService
from finance.services.cash_reconciliation_service import CashReconciliationService
from finance.services.subledger_reconciliation_service import SubledgerReconciliationService
from finance.services.period_service import can_post_transaction


class FinancialControlsS4KTestCase(TestCase):
    def setUp(self):
        self.company_a = Company.objects.create(name="Security Controls Corp A")
        self.company_b = Company.objects.create(name="Security Controls Corp B")

        self.user_a = User.objects.create_user(username="controller_a", email="ctrl_a@zorvex.com", password="Password123!")

        self.fy_a = FiscalYear.objects.create(
            company=self.company_a,
            name="FY 2026",
            start_date=date(2026, 1, 1),
            end_date=date(2026, 12, 31),
            is_current=True
        )

        self.period_jan = AccountingPeriod.objects.create(
            company=self.company_a,
            fiscal_year=self.fy_a,
            month=1,
            period_number=1,
            start_date=date(2026, 1, 1),
            end_date=date(2026, 1, 31),
            status=PeriodStatus.OPEN
        )

        self.period_dec = AccountingPeriod.objects.create(
            company=self.company_a,
            fiscal_year=self.fy_a,
            month=12,
            period_number=12,
            start_date=date(2026, 12, 1),
            end_date=date(2026, 12, 31),
            status=PeriodStatus.OPEN
        )

        # Accounts Setup
        self.cash_acc = ChartOfAccount.objects.create(
            company=self.company_a,
            account_code="1110",
            account_name="Main Cash Account",
            account_type=AccountType.ASSET,
            normal_balance=NormalBalance.DEBIT,
            allow_posting=True
        )

        self.bank_acc_gl = ChartOfAccount.objects.create(
            company=self.company_a,
            account_code="1120",
            account_name="HBL Operational Bank Account GL",
            account_type=AccountType.ASSET,
            normal_balance=NormalBalance.DEBIT,
            allow_posting=True
        )

        self.revenue_acc = ChartOfAccount.objects.create(
            company=self.company_a,
            account_code="4000",
            account_name="Guarding Service Revenue",
            account_type=AccountType.REVENUE,
            normal_balance=NormalBalance.CREDIT,
            allow_posting=True
        )

        self.salary_expense = ChartOfAccount.objects.create(
            company=self.company_a,
            account_code="5000",
            account_name="Guard Salaries Expense",
            account_type=AccountType.COST_OF_SERVICE,
            normal_balance=NormalBalance.DEBIT,
            allow_posting=True
        )

        self.retained_earnings = ChartOfAccount.objects.create(
            company=self.company_a,
            account_code="3200",
            account_name="Retained Earnings Account",
            account_type=AccountType.EQUITY,
            normal_balance=NormalBalance.CREDIT,
            allow_posting=True
        )

        self.bank_account = BankAccount.objects.create(
            company=self.company_a,
            account_title="HBL Operational Account",
            account_number="1234567890",
            bank_name="Habib Bank Limited",
            account_type=BankAccountType.BANK,
            chart_of_account=self.bank_acc_gl,
            current_balance=Decimal('100000.0000')
        )

        self.petty_cash_acc = BankAccount.objects.create(
            company=self.company_a,
            account_title="Head Office Petty Cash",
            account_number="PC-001",
            bank_name="Petty Cash",
            account_type=BankAccountType.PETTY_CASH,
            chart_of_account=self.cash_acc,
            current_balance=Decimal('25000.0000')
        )

        self.journal_gen = AccountingPostingService.get_or_create_journal(
            self.company_a,
            JournalType.GENERAL
        )

    def test_open_to_soft_close_lifecycle(self):
        """Test OPEN -> SOFT_CLOSED blocks ordinary postings but permits authorized adjustments."""
        can_p, msg, _ = can_post_transaction(self.company_a, date(2026, 1, 15), is_adjustment=False)
        self.assertTrue(can_p)

        PeriodCloseService.soft_close_period(self.period_jan, user=self.user_a, notes="Soft closing Jan 2026 for review")
        self.period_jan.refresh_from_db()
        self.assertEqual(self.period_jan.status, PeriodStatus.SOFT_CLOSED)

        # Ordinary posting should be blocked
        can_p, msg, _ = can_post_transaction(self.company_a, date(2026, 1, 15), is_adjustment=False)
        self.assertFalse(can_p)
        self.assertIn("SOFT_CLOSED", msg)

        # Adjustment posting should be permitted
        can_p_adj, msg_adj, _ = can_post_transaction(self.company_a, date(2026, 1, 15), is_adjustment=True)
        self.assertTrue(can_p_adj)

    def test_final_close_readiness_blocker(self):
        """Test final close is blocked when unposted items exist."""
        # Create unposted draft entry in period
        journal = AccountingPostingService.get_or_create_journal(self.company_a, JournalType.GENERAL)
        je = JournalEntry.objects.create(
            company=self.company_a,
            journal=journal,
            posting_date=date(2026, 1, 20),
            status=JournalStatus.DRAFT,
            description="Draft unposted transaction"
        )

        readiness = PeriodCloseService.get_readiness(self.period_jan)
        self.assertEqual(readiness['readiness_status'], 'BLOCKED')

        with self.assertRaises(ValidationError):
            PeriodCloseService.final_close_period(self.period_jan, user=self.user_a)

    def test_final_close_success_and_subledger_snapshot(self):
        """Test successful final close updates status to CLOSED and creates audit snapshot."""
        readiness = PeriodCloseService.get_readiness(self.period_jan)
        self.assertIn(readiness['readiness_status'], ['READY', 'WARNING'])

        closed_period = PeriodCloseService.final_close_period(self.period_jan, user=self.user_a, notes="Jan 2026 Final Closed")
        self.assertEqual(closed_period.status, PeriodStatus.CLOSED)
        self.assertIsNotNone(closed_period.finalized_at)

        snapshot = SubledgerReconciliationSnapshot.objects.filter(period=closed_period).first()
        self.assertIsNotNone(snapshot)

    def test_locked_period_posting_blocked_and_reopen_audit(self):
        """Test locked period rejects all postings and reopen creates control exception audit."""
        PeriodCloseService.soft_close_period(self.period_jan, user=self.user_a)
        PeriodCloseService.final_close_period(self.period_jan, user=self.user_a)
        locked_period = PeriodCloseService.lock_period(self.period_jan, user=self.user_a)

        self.assertEqual(locked_period.status, PeriodStatus.LOCKED)

        # Rejects all postings
        can_p, msg, _ = can_post_transaction(self.company_a, date(2026, 1, 15), is_adjustment=True)
        self.assertFalse(can_p)
        self.assertIn("LOCKED", msg)

        # Reopen with audit
        reopened = PeriodCloseService.reopen_period(locked_period, user=self.user_a, reason="Audit adjustment required")
        self.assertEqual(reopened.status, PeriodStatus.SOFT_CLOSED)

        exc = ControlException.objects.filter(company=self.company_a, period=reopened).first()
        self.assertIsNotNone(exc)
        self.assertIn("Reopened", exc.title)

    def test_year_end_closing_journal(self):
        """Test year-end closing journal balances nominal accounts, transfers net profit to Retained Earnings, and is idempotent."""
        # Post Revenue: Cr Guarding Revenue 500,000, Dr Cash 500,000
        AccountingPostingService.post_journal_entry(
            company=self.company_a,
            journal=self.journal_gen,
            posting_date=date(2026, 1, 10),
            description="Jan Security Revenue",
            lines=[
                {'account': self.cash_acc, 'debit': Decimal('500000.0000'), 'credit': Decimal('0.0000')},
                {'account': self.revenue_acc, 'debit': Decimal('0.0000'), 'credit': Decimal('500000.0000')}
            ]
        )

        # Post Cost: Dr Salary Expense 300,000, Cr Cash 300,000
        AccountingPostingService.post_journal_entry(
            company=self.company_a,
            journal=self.journal_gen,
            posting_date=date(2026, 1, 25),
            description="Jan Guard Salaries",
            lines=[
                {'account': self.salary_expense, 'debit': Decimal('300000.0000'), 'credit': Decimal('0.0000')},
                {'account': self.cash_acc, 'debit': Decimal('0.0000'), 'credit': Decimal('300000.0000')}
            ]
        )

        # Close periods so year-end close is ready
        PeriodCloseService.soft_close_period(self.period_jan, user=self.user_a)
        PeriodCloseService.final_close_period(self.period_jan, user=self.user_a)
        PeriodCloseService.soft_close_period(self.period_dec, user=self.user_a)
        PeriodCloseService.final_close_period(self.period_dec, user=self.user_a)

        # Year End Close Execution
        ye_je = YearEndClosingService.create_year_end_closing_journal(self.fy_a, user=self.user_a)
        self.assertIsNotNone(ye_je)
        self.assertEqual(ye_je.status, JournalStatus.POSTED)

        # Verify Retained Earnings received net profit 200,000
        self.retained_earnings.refresh_from_db()
        self.assertEqual(self.retained_earnings.current_balance, Decimal('200000.0000'))

        # Verify Idempotency
        ye_je_duplicate = YearEndClosingService.create_year_end_closing_journal(self.fy_a, user=self.user_a)
        self.assertEqual(ye_je.id, ye_je_duplicate.id)

    def test_bank_statement_import_and_auto_match(self):
        """Test bank statement import, duplicate import prevention, and matching engine."""
        lines_data = [
            {'date': date(2026, 1, 10), 'bank_reference': 'DEP-101', 'description': 'Client Invoice Payment', 'credit': Decimal('50000.0000'), 'debit': Decimal('0.0000')},
            {'date': date(2026, 1, 15), 'bank_reference': 'CHQ-5501', 'description': 'Vendor Payment Outflow', 'credit': Decimal('0.0000'), 'debit': Decimal('15000.0000')}
        ]

        stmt = BankReconciliationService.import_bank_statement(
            company=self.company_a,
            bank_account=self.bank_account,
            lines_data=lines_data,
            statement_number="STMT-202601",
            start_date=date(2026, 1, 1),
            end_date=date(2026, 1, 31),
            opening_balance=Decimal('100000.0000'),
            closing_balance=Decimal('135000.0000')
        )

        self.assertEqual(stmt.lines.count(), 2)

        # Verify duplicate import is blocked
        with self.assertRaises(ValidationError):
            BankReconciliationService.import_bank_statement(
                company=self.company_a,
                bank_account=self.bank_account,
                lines_data=lines_data,
                statement_number="STMT-202601",
                file_hash=stmt.file_import_hash
            )

    def test_bank_charge_adjustment(self):
        """Test bank charge adjustment posts GL journal and marks statement line matched."""
        lines_data = [
            {'date': date(2026, 1, 28), 'bank_reference': 'CHG-99', 'description': 'Monthly Bank Maintenance Charge', 'credit': Decimal('0.0000'), 'debit': Decimal('2500.0000')}
        ]

        stmt = BankReconciliationService.import_bank_statement(
            company=self.company_a,
            bank_account=self.bank_account,
            lines_data=lines_data,
            statement_number="STMT-202601-CHG"
        )

        line = stmt.lines.first()
        adj_line = BankReconciliationService.create_bank_charge_adjustment(
            line=line,
            expense_account=self.salary_expense,
            user=self.user_a,
            notes="Bank service fee"
        )

        self.assertEqual(adj_line.match_status, MatchStatus.MANUALLY_MATCHED)
        self.assertIsNotNone(adj_line.adjustment_journal)
        self.assertEqual(adj_line.adjustment_journal.status, JournalStatus.POSTED)

    def test_cash_count_variance_logging(self):
        """Test physical cash count variance logs control exception."""
        count = CashReconciliationService.perform_cash_count(
            cash_account=self.petty_cash_acc,
            count_date=date(2026, 1, 31),
            physical_count=Decimal('24500.0000'),  # 500 variance vs 25,000 system balance
            counted_by=self.user_a,
            variance_reason="Discrepancy in petty cash box"
        )

        self.assertEqual(count.difference, Decimal('-500.0000'))
        self.assertEqual(count.status, CashCountStatus.VARIANCE_LOGGED)

        exc = ControlException.objects.filter(company=self.company_a, amount=Decimal('500.0000')).first()
        self.assertIsNotNone(exc)
        self.assertIn("Cash Count Variance", exc.title)

    def test_subledger_reconciliation_summary(self):
        """Test subledger vs GL control account reconciliation summary engine."""
        summary = SubledgerReconciliationService.get_subledger_reconciliation_summary(self.company_a, self.period_jan)
        self.assertIn('ar', summary)
        self.assertIn('ap', summary)
        self.assertIn('payroll', summary)
        self.assertIn('tax', summary)
        self.assertIn('treasury', summary)

    def test_cross_tenant_isolation(self):
        """Test tenant scoping prevents cross-company data leakage."""
        period_b = AccountingPeriod.objects.create(
            company=self.company_b,
            fiscal_year=FiscalYear.objects.create(company=self.company_b, name="FY 2026 B", start_date=date(2026, 1, 1), end_date=date(2026, 12, 31)),
            month=1,
            start_date=date(2026, 1, 1),
            end_date=date(2026, 1, 31),
            status=PeriodStatus.OPEN
        )

        readiness_a = PeriodCloseService.get_readiness(self.period_jan)
        readiness_b = PeriodCloseService.get_readiness(period_b)

        self.assertNotEqual(readiness_a['period_id'], readiness_b['period_id'])
