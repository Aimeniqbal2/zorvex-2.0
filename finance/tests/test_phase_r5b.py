import datetime
from decimal import Decimal
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.db import transaction

from finance.models import (
    ChartOfAccount, AccountGroup, Currency, 
    Journal, JournalEntry, JournalEntryLine, 
    AccountingPeriod, FiscalYear, CostCenter,
    FinancialVoucher, VoucherStatus, VoucherType
)
from companies.models import Company
from finance.services.posting import post_entry, reverse_entry
from finance.services.voucher_service import post_financial_voucher
from finance.services.reports import FinanceReportService

User = get_user_model()

class R5BCertificationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.company_a = Company.objects.create(name="Tenant A - R5B")
        
        cls.user = User.objects.create_user(username="fin_user_r5b", password="pwd", company=cls.company_a)
        
        cls.currency = Currency.objects.create(company=cls.company_a, code="USD", name="US Dollar", is_base_currency=True)
        
        cls.fy = FiscalYear.objects.create(company=cls.company_a, name="FY2026", start_date=datetime.date(2026, 1, 1), end_date=datetime.date(2026, 12, 31), is_current=True)
        cls.period = AccountingPeriod.objects.create(company=cls.company_a, fiscal_year=cls.fy, month=1, start_date=datetime.date(2026, 1, 1), end_date=datetime.date(2026, 1, 31), status="OPEN")
        
        cls.journal_a = Journal.objects.create(company=cls.company_a, code="GEN-R5B", name="General", journal_type="GENERAL")
        
        cls.asset_group = AccountGroup.objects.create(company=cls.company_a, name="Assets", group_type="ASSET")
        cls.liability_group = AccountGroup.objects.create(company=cls.company_a, name="Liabilities", group_type="LIABILITY")
        cls.equity_group = AccountGroup.objects.create(company=cls.company_a, name="Equity", group_type="EQUITY")
        cls.revenue_group = AccountGroup.objects.create(company=cls.company_a, name="Revenue", group_type="INCOME")
        cls.expense_group = AccountGroup.objects.create(company=cls.company_a, name="Expenses", group_type="EXPENSE")
        
        cls.cash = ChartOfAccount.objects.create(company=cls.company_a, account_group=cls.asset_group, account_code="1000", account_name="Cash", account_type="Asset", currency=cls.currency, opening_balance=Decimal('10000.00'), current_balance=Decimal('10000.00'))
        cls.ar = ChartOfAccount.objects.create(company=cls.company_a, account_group=cls.asset_group, account_code="1100", account_name="Accounts Receivable", account_type="Asset", currency=cls.currency, opening_balance=Decimal('0.00'), current_balance=Decimal('0.00'))
        cls.ap = ChartOfAccount.objects.create(company=cls.company_a, account_group=cls.liability_group, account_code="2000", account_name="Accounts Payable", account_type="Liability", currency=cls.currency, opening_balance=Decimal('0.00'), current_balance=Decimal('0.00'))
        cls.equity = ChartOfAccount.objects.create(company=cls.company_a, account_group=cls.equity_group, account_code="3000", account_name="Owner Equity", account_type="Equity", currency=cls.currency, opening_balance=Decimal('10000.00'), current_balance=Decimal('10000.00'))
        cls.sales = ChartOfAccount.objects.create(company=cls.company_a, account_group=cls.revenue_group, account_code="4000", account_name="Sales Revenue", account_type="Revenue", currency=cls.currency, opening_balance=Decimal('0.00'), current_balance=Decimal('0.00'))
        cls.expense = ChartOfAccount.objects.create(company=cls.company_a, account_group=cls.expense_group, account_code="5000", account_name="General Expense", account_type="Expense", currency=cls.currency, opening_balance=Decimal('0.00'), current_balance=Decimal('0.00'))
        cls.salary_expense = ChartOfAccount.objects.create(company=cls.company_a, account_group=cls.expense_group, account_code="5100", account_name="Salary Expense", account_type="Expense", currency=cls.currency, opening_balance=Decimal('0.00'), current_balance=Decimal('0.00'))

    def create_journal_entry(self, entry_number, date, lines, status="DRAFT"):
        je = JournalEntry.objects.create(company=self.company_a, journal=self.journal_a, entry_number=entry_number, entry_date=date, status=status)
        for line in lines:
            JournalEntryLine.objects.create(
                company=self.company_a,
                journal_entry=je,
                account=line['account'],
                debit=line.get('debit', Decimal('0.00')),
                credit=line.get('credit', Decimal('0.00'))
            )
        return je

    def test_08_reversal_logic(self):
        """Test the reverse_entry service logic."""
        # 1. Post an entry
        je = self.create_journal_entry("JE-REV-1", datetime.date(2026, 1, 15), [
            {'account': self.cash, 'debit': Decimal('500.00')},
            {'account': self.sales, 'credit': Decimal('500.00')}
        ])
        post_entry(je.id, self.user)
        
        self.cash.refresh_from_db()
        self.assertEqual(self.cash.current_balance, Decimal('10500.00'))
        
        # 2. Reverse it
        rev_je = reverse_entry(je.id, self.user, reversal_date=datetime.date(2026, 1, 16))
        
        je.refresh_from_db()
        self.assertEqual(je.status, 'REVERSED')
        self.assertEqual(rev_je.status, 'POSTED')
        
        # 3. Check balances reverted
        self.cash.refresh_from_db()
        self.assertEqual(self.cash.current_balance, Decimal('10000.00'))
        
        # 4. Check reversal entry lines
        lines = rev_je.lines.all()
        self.assertEqual(len(lines), 2)
        cash_line = lines.get(account=self.cash)
        sales_line = lines.get(account=self.sales)
        self.assertEqual(cash_line.credit, Decimal('500.00'))
        self.assertEqual(sales_line.debit, Decimal('500.00'))

    def test_12_receipt_voucher(self):
        """Test receipt voucher workflow."""
        voucher = FinancialVoucher.objects.create(
            company=self.company_a, voucher_type=VoucherType.RECEIPT, voucher_number="RV-1", 
            date=datetime.date(2026, 1, 15), payment_account=self.cash, status=VoucherStatus.DRAFT
        )
        from finance.models import FinancialVoucherLine
        FinancialVoucherLine.objects.create(company=self.company_a, voucher=voucher, account=self.ar, amount=Decimal('200.00'))
        
        je = post_financial_voucher(voucher, self.user)
        self.assertEqual(je.status, 'POSTED')
        self.assertEqual(voucher.status, VoucherStatus.POSTED)
        
        self.cash.refresh_from_db()
        self.ar.refresh_from_db()
        self.assertEqual(self.cash.current_balance, Decimal('10200.00')) # Debit Asset
        self.assertEqual(self.ar.current_balance, Decimal('-200.00')) # Credit Asset (negative balance since opening was 0)

    def test_41_payroll_flow(self):
        """Test a payroll journal entry."""
        je = self.create_journal_entry("JE-PAYROLL-1", datetime.date(2026, 1, 28), [
            {'account': self.salary_expense, 'debit': Decimal('1500.00')},
            {'account': self.cash, 'credit': Decimal('1500.00')}
        ])
        post_entry(je.id, self.user)
        self.salary_expense.refresh_from_db()
        self.cash.refresh_from_db()
        
        self.assertEqual(self.salary_expense.current_balance, Decimal('1500.00'))
        self.assertEqual(self.cash.current_balance, Decimal('8500.00'))

    def test_42_ap_purchasing_flow(self):
        """Test AP/Purchasing flow."""
        # 1. Record Bill
        je = self.create_journal_entry("JE-BILL-1", datetime.date(2026, 1, 20), [
            {'account': self.expense, 'debit': Decimal('300.00')},
            {'account': self.ap, 'credit': Decimal('300.00')}
        ])
        post_entry(je.id, self.user)
        
        # 2. Pay Bill (Using Payment Voucher)
        voucher = FinancialVoucher.objects.create(
            company=self.company_a, voucher_type=VoucherType.PAYMENT, voucher_number="PV-AP-1", 
            date=datetime.date(2026, 1, 21), payment_account=self.cash, status=VoucherStatus.DRAFT
        )
        from finance.models import FinancialVoucherLine
        FinancialVoucherLine.objects.create(company=self.company_a, voucher=voucher, account=self.ap, amount=Decimal('300.00'))
        
        post_financial_voucher(voucher, self.user)
        
        self.ap.refresh_from_db()
        self.assertEqual(self.ap.current_balance, Decimal('0.00'))

    def test_45_financial_reporting_gl(self):
        """Test GL Reporting logic."""
        je1 = self.create_journal_entry("JE-REP-1", datetime.date(2026, 1, 10), [
            {'account': self.cash, 'debit': Decimal('500.00')},
            {'account': self.sales, 'credit': Decimal('500.00')}
        ])
        post_entry(je1.id, self.user)
        
        gl = FinanceReportService.get_general_ledger(self.company_a, start_date=datetime.date(2026, 1, 1), end_date=datetime.date(2026, 1, 31))
        # Ensure lines are retrieved
        self.assertTrue(len(gl) >= 2)
        cash_lines = [l for l in gl if l.account_id == self.cash.id]
        self.assertTrue(len(cash_lines) >= 1)

    def test_46_financial_reporting_tb_pl_bs(self):
        """Test TB, P&L, BS Reporting logic."""
        # Clean state for reliable reporting sums
        Company.objects.filter(name="Tenant B - R5B Rep").delete()
        company_rep = Company.objects.create(name="Tenant B - R5B Rep")
        fy_rep = FiscalYear.objects.create(company=company_rep, name="FY2026", start_date=datetime.date(2026, 1, 1), end_date=datetime.date(2026, 12, 31), is_current=True)
        period_rep = AccountingPeriod.objects.create(company=company_rep, fiscal_year=fy_rep, month=1, start_date=datetime.date(2026, 1, 1), end_date=datetime.date(2026, 1, 31), status="OPEN")
        journal_rep = Journal.objects.create(company=company_rep, code="GEN", name="Gen", journal_type="GENERAL")
        
        asset_grp = AccountGroup.objects.create(company=company_rep, name="Assets", group_type="ASSET")
        rev_grp = AccountGroup.objects.create(company=company_rep, name="Revenue", group_type="INCOME")
        exp_grp = AccountGroup.objects.create(company=company_rep, name="Expense", group_type="EXPENSE")
        eq_grp = AccountGroup.objects.create(company=company_rep, name="Equity", group_type="EQUITY")
        
        cash = ChartOfAccount.objects.create(company=company_rep, account_group=asset_grp, account_code="1000", account_name="Cash", account_type="Asset", currency=self.currency)
        sales = ChartOfAccount.objects.create(company=company_rep, account_group=rev_grp, account_code="4000", account_name="Sales", account_type="Revenue", currency=self.currency)
        expense = ChartOfAccount.objects.create(company=company_rep, account_group=exp_grp, account_code="5000", account_name="Exp", account_type="Expense", currency=self.currency)
        equity = ChartOfAccount.objects.create(company=company_rep, account_group=eq_grp, account_code="3000", account_name="Eq", account_type="Equity", currency=self.currency)
        
        # Opening entry: Debit Cash 1000, Credit Equity 1000
        je_op = JournalEntry.objects.create(company=company_rep, journal=journal_rep, entry_number="OP", entry_date=datetime.date(2026, 1, 1), status="DRAFT")
        JournalEntryLine.objects.create(company=company_rep, journal_entry=je_op, account=cash, debit=Decimal('1000.00'))
        JournalEntryLine.objects.create(company=company_rep, journal_entry=je_op, account=equity, credit=Decimal('1000.00'))
        post_entry(je_op.id, self.user)
        
        # Sales entry: Debit Cash 500, Credit Sales 500
        je_sales = JournalEntry.objects.create(company=company_rep, journal=journal_rep, entry_number="SALE", entry_date=datetime.date(2026, 1, 5), status="DRAFT")
        JournalEntryLine.objects.create(company=company_rep, journal_entry=je_sales, account=cash, debit=Decimal('500.00'))
        JournalEntryLine.objects.create(company=company_rep, journal_entry=je_sales, account=sales, credit=Decimal('500.00'))
        post_entry(je_sales.id, self.user)
        
        # Expense entry: Debit Expense 200, Credit Cash 200
        je_exp = JournalEntry.objects.create(company=company_rep, journal=journal_rep, entry_number="EXP", entry_date=datetime.date(2026, 1, 10), status="DRAFT")
        JournalEntryLine.objects.create(company=company_rep, journal_entry=je_exp, account=expense, debit=Decimal('200.00'))
        JournalEntryLine.objects.create(company=company_rep, journal_entry=je_exp, account=cash, credit=Decimal('200.00'))
        post_entry(je_exp.id, self.user)
        
        # 1. Trial Balance
        tb = FinanceReportService.get_trial_balance(company_rep)
        self.assertTrue(tb['is_balanced'])
        self.assertEqual(tb['total_debit'], Decimal('1500.00')) # Cash(1000+500-200=1300) + Exp(200) = 1500
        self.assertEqual(tb['total_credit'], Decimal('1500.00')) # Equity(1000) + Sales(500) = 1500
        
        # 2. P&L
        pl = FinanceReportService.get_profit_and_loss(company_rep)
        self.assertEqual(pl['total_revenue'], Decimal('500.00'))
        self.assertEqual(pl['total_expense'], Decimal('200.00'))
        self.assertEqual(pl['net_profit'], Decimal('300.00'))
        
        # 3. Balance Sheet
        bs = FinanceReportService.get_balance_sheet(company_rep, as_of_date=datetime.date(2026, 1, 31))
        self.assertTrue(bs['is_balanced'])
        self.assertEqual(bs['assets']['total'], Decimal('1300.00'))
        self.assertEqual(bs['liabilities']['total'], Decimal('0.00'))
        self.assertEqual(bs['equity']['total'], Decimal('1300.00')) # 1000 + 300 retained earnings
