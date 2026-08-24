import datetime
from decimal import Decimal
from django.test import TestCase
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.exceptions import ValidationError
from django.contrib.auth import get_user_model
from finance.models import (
    ChartOfAccount, AccountGroup, Currency, 
    Journal, JournalEntry, JournalEntryLine, 
    AccountingPeriod, FiscalYear
)
from companies.models import Company
from finance.services.posting import post_entry

User = get_user_model()

class PostingServiceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.company = Company.objects.create(name="Posting Test Co")
        cls.user = User.objects.create_user(username="test_fin", password="pwd", company=cls.company)
        
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
        
        cls.asset_group = AccountGroup.objects.create(company=cls.company, name="Assets", group_type="ASSET")
        cls.liability_group = AccountGroup.objects.create(company=cls.company, name="Liabilities", group_type="LIABILITY")
        
        cls.cash_account = ChartOfAccount.objects.create(
            company=cls.company, account_group=cls.asset_group, account_code="1000",
            account_name="Cash", account_type="Asset", currency=cls.currency,
            opening_balance=Decimal('100.00'), current_balance=Decimal('100.00')
        )
        cls.ap_account = ChartOfAccount.objects.create(
            company=cls.company, account_group=cls.liability_group, account_code="2000",
            account_name="Accounts Payable", account_type="Liability", currency=cls.currency,
            opening_balance=Decimal('0.00'), current_balance=Decimal('0.00')
        )

    def test_post_valid_journal_entry(self):
        """Test that posting updates balances and status correctly."""
        entry = JournalEntry.objects.create(
            company=self.company, journal=self.journal, entry_number="JE-1",
            entry_date=datetime.date(2026, 1, 15), status="DRAFT", created_by=self.user
        )
        
        JournalEntryLine.objects.create(
            company=self.company, journal_entry=entry, account=self.cash_account, 
            debit=Decimal('0.00'), credit=Decimal('50.00')
        )
        JournalEntryLine.objects.create(
            company=self.company, journal_entry=entry, account=self.ap_account, 
            debit=Decimal('50.00'), credit=Decimal('0.00')
        )
        
        posted_entry = post_entry(entry.id, user=self.user)
        
        self.assertEqual(posted_entry.status, "POSTED")
        
        self.cash_account.refresh_from_db()
        self.ap_account.refresh_from_db()
        
        # Cash (Asset): CR decreases balance. 100 - 50 = 50
        self.assertEqual(self.cash_account.current_balance, Decimal('50.00'))
        
        # AP (Liability): DR decreases balance. 0 - 50 = -50
        self.assertEqual(self.ap_account.current_balance, Decimal('-50.00'))

    def test_post_unbalanced_journal_entry(self):
        """Test that unbalanced entries raise validation errors."""
        entry = JournalEntry.objects.create(
            company=self.company, journal=self.journal, entry_number="JE-2",
            entry_date=datetime.date(2026, 1, 15), status="DRAFT", created_by=self.user
        )
        
        JournalEntryLine.objects.create(
            company=self.company, journal_entry=entry, account=self.cash_account, 
            debit=Decimal('100.00'), credit=Decimal('0.00')
        )
        JournalEntryLine.objects.create(
            company=self.company, journal_entry=entry, account=self.ap_account, 
            debit=Decimal('0.00'), credit=Decimal('50.00')
        )
        
        with self.assertRaises(ValidationError) as context:
            post_entry(entry.id)
            
        self.assertIn('balance', str(context.exception).lower())

    def test_post_in_closed_period(self):
        """Test that posting fails if the period is closed."""
        self.period.status = "CLOSED"
        self.period.save()
        
        entry = JournalEntry.objects.create(
            company=self.company, journal=self.journal, entry_number="JE-3",
            entry_date=datetime.date(2026, 1, 15), status="DRAFT", created_by=self.user
        )
        
        JournalEntryLine.objects.create(
            company=self.company, journal_entry=entry, account=self.cash_account, 
            debit=Decimal('10.00'), credit=Decimal('0.00')
        )
        JournalEntryLine.objects.create(
            company=self.company, journal_entry=entry, account=self.cash_account, 
            debit=Decimal('0.00'), credit=Decimal('10.00')
        )
        
        with self.assertRaises(ValidationError) as context:
            post_entry(entry.id)
            
        self.assertIn('closed accounting period', str(context.exception).lower())
        
        self.period.status = "OPEN"
        self.period.save()

    def test_idempotent_post(self):
        """Test that calling post_entry on a POSTED entry returns harmlessly."""
        entry = JournalEntry.objects.create(
            company=self.company, journal=self.journal, entry_number="JE-4",
            entry_date=datetime.date(2026, 1, 15), status="DRAFT", created_by=self.user
        )
        
        JournalEntryLine.objects.create(
            company=self.company, journal_entry=entry, account=self.cash_account, 
            debit=Decimal('10.00'), credit=Decimal('0.00')
        )
        JournalEntryLine.objects.create(
            company=self.company, journal_entry=entry, account=self.ap_account, 
            debit=Decimal('0.00'), credit=Decimal('10.00')
        )
        
        post_entry(entry.id)
        
        # Second call should return the entry without throwing
        entry2 = post_entry(entry.id)
        self.assertEqual(entry2.status, 'POSTED')
