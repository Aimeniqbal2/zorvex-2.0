from django.test import TestCase
from django.core.management import call_command
from io import StringIO
from finance.models import (
    JournalEntry, JournalEntryLine, ChartOfAccount, AccountGroup, Journal,
    AccountingPeriod, FiscalYear, Currency
)
from companies.models import Company
from django.contrib.auth import get_user_model
User = get_user_model()
import datetime
from decimal import Decimal

class Phase6A3CertificationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.company = Company.objects.create(name="Certification Company")
        cls.user = User.objects.create_user(
            username="cert_user", password="password", company=cls.company
        )
        cls.currency = Currency.objects.create(
            company=cls.company, code="USD", name="US Dollar", is_base_currency=True
        )
        cls.fy = FiscalYear.objects.create(
            company=cls.company, name="FY2026",
            start_date=datetime.date(2026, 1, 1), end_date=datetime.date(2026, 12, 31),
            is_current=True
        )
        cls.period = AccountingPeriod.objects.create(
            company=cls.company, fiscal_year=cls.fy, month=1,
            start_date=datetime.date(2026, 1, 1), end_date=datetime.date(2026, 1, 31),
            status="OPEN"
        )
        cls.journal = Journal.objects.create(
            company=cls.company, code="GEN", name="General", journal_type="GENERAL"
        )
        cls.asset_group = AccountGroup.objects.create(
            company=cls.company, name="Assets", group_type="ASSET"
        )
        cls.cash_account = ChartOfAccount.objects.create(
            company=cls.company, account_group=cls.asset_group, account_code="1000",
            account_name="Cash", account_type="Bank", currency=cls.currency,
            opening_balance=0, current_balance=0
        )
        cls.revenue_group = AccountGroup.objects.create(
            company=cls.company, name="Revenue", group_type="INCOME"
        )
        cls.sales_account = ChartOfAccount.objects.create(
            company=cls.company, account_group=cls.revenue_group, account_code="4000",
            account_name="Sales", account_type="Income", currency=cls.currency,
            opening_balance=0, current_balance=0
        )

    def test_management_command_execution(self):
        """Test verify_finance_integrity command executes without crashing and detects PASS"""
        out = StringIO()
        call_command('verify_finance_integrity', stdout=out)
        self.assertIn("Result: PASS", out.getvalue())

    def test_management_command_warning_audit_chain(self):
        """Test verify_finance_integrity detects missing audit chains"""
        je = JournalEntry.objects.create(
            company=self.company, journal=self.journal, entry_number="JE-TEST-001",
            entry_date=datetime.date(2026, 1, 15), status="POSTED",
            created_by=None, source_module=""
        )
        JournalEntryLine.objects.create(
            company=self.company, journal_entry=je, account=self.cash_account, debit=100
        )
        JournalEntryLine.objects.create(
            company=self.company, journal_entry=je, account=self.sales_account, credit=100
        )
        out = StringIO()
        call_command('verify_finance_integrity', stdout=out)
        self.assertIn("Result: WARNING", out.getvalue())
        self.assertIn("Missing Audit Chain", out.getvalue())

    def test_management_command_critical_balance(self):
        """Test verify_finance_integrity detects balance mismatch"""
        # Let's break the balance deliberately
        self.cash_account.current_balance = 500
        self.cash_account.save()
        out = StringIO()
        call_command('verify_finance_integrity', stdout=out)
        self.assertIn("Result: WARNING", out.getvalue()) # Balance mismatch is warning
        self.assertIn("Account Balance Mismatch", out.getvalue())

    def test_management_command_critical_unbalanced(self):
        """Test verify_finance_integrity detects unbalanced POSTED entries"""
        # Create draft and forcefully update to bypass validation
        je = JournalEntry.objects.create(
            company=self.company, journal=self.journal, entry_number="JE-TEST-002",
            entry_date=datetime.date(2026, 1, 15), status="DRAFT",
            created_by=self.user
        )
        JournalEntryLine.objects.create(
            company=self.company, journal_entry=je, account=self.cash_account, debit=100
        )
        JournalEntryLine.objects.create(
            company=self.company, journal_entry=je, account=self.sales_account, credit=50
        ) # Unbalanced
        JournalEntry.objects.filter(id=je.id).update(status='POSTED')
        
        out = StringIO()
        call_command('verify_finance_integrity', stdout=out)
        self.assertIn("Result: CRITICAL", out.getvalue())
        self.assertIn("Unbalanced or Empty POSTED Entry", out.getvalue())
