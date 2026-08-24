from decimal import Decimal
from django.test import TestCase
from django.core.exceptions import ValidationError
from rest_framework.test import APIClient
from companies.models import Company
from accounts.models import User
from finance.models import (
    Journal, JournalEntry, JournalEntryLine, ChartOfAccount, AccountGroup, AccountingPeriod, FiscalYear
)
from finance.services.journal import post_journal_entry
import datetime
from django.db import transaction
from django.test import TransactionTestCase

class Phase6A1Tests(TransactionTestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Zorvex Phase 6A.1", business_type="retail")
        self.user = User.objects.create_user(
            username="test6a1",
            email="test6a1@zorvex.com",
            password="password",
            company=self.company,
            role="admin",
            is_superuser=True
        )
        
        from subscriptions.models import CompanySubscription, SubscriptionPlan
        plan = SubscriptionPlan.objects.create(name="Enterprise", price=100)
        CompanySubscription.objects.create(
            company=self.company, plan=plan, start_date=datetime.date.today(),
            end_date=datetime.date.today() + datetime.timedelta(days=30), is_active=True
        )

        from rest_framework_simplejwt.tokens import RefreshToken
        token = RefreshToken.for_user(self.user)
        self.client = APIClient()
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {token.access_token}',
            HTTP_X_COMPANY_ID=str(self.company.id)
        )

        self.group = AccountGroup.objects.create(company=self.company, name="Test Group", group_type="ASSET")
        
        self.asset_acc = ChartOfAccount.objects.create(
            company=self.company, account_group=self.group, account_code="1010",
            account_name="Cash", account_type="Asset"
        )
        self.rev_acc = ChartOfAccount.objects.create(
            company=self.company, account_group=self.group, account_code="4010",
            account_name="Sales", account_type="Revenue"
        )

        self.journal = Journal.objects.create(
            company=self.company, name="General", code="GEN", journal_type="GENERAL"
        )
        
        self.fy = FiscalYear.objects.create(company=self.company, name="2026", start_date="2026-01-01", end_date="2026-12-31")
        
        self.period = AccountingPeriod.objects.create(
            company=self.company, fiscal_year=self.fy, month=8,
            start_date="2026-08-01", end_date="2026-08-31", status="OPEN"
        )
        
        self.today = datetime.date(2026, 8, 5)

    def test_immutable_posted_journal(self):
        # Create as DRAFT
        entry = JournalEntry.objects.create(
            company=self.company, journal=self.journal, entry_date=self.today,
            status="DRAFT", description="Test", entry_number="TEST-001"
        )
        JournalEntryLine.objects.create(
            company=self.company, journal_entry=entry, account=self.asset_acc, debit=Decimal('100')
        )
        JournalEntryLine.objects.create(
            company=self.company, journal_entry=entry, account=self.rev_acc, credit=Decimal('100')
        )
        
        # Post it
        entry.status = 'POSTED'
        entry.full_clean()
        entry.save()
        
        # Test ORM Immutability
        entry.description = "Changed"
        with self.assertRaises(ValidationError):
            entry.clean()
            
        # Test API Immutability
        res = self.client.patch(f"/api/finance/journal-entries/{entry.id}/", {"description": "Hacked"})
        self.assertEqual(res.status_code, 400)
        self.assertIn("Cannot modify a posted journal entry", str(res.data))
        
        # Test Delete protection
        res = self.client.delete(f"/api/finance/journal-entries/{entry.id}/")
        self.assertEqual(res.status_code, 400)
        self.assertIn("Cannot delete", str(res.data))

    def test_immutable_lines(self):
        # Setup POSTED entry
        entry = JournalEntry.objects.create(
            company=self.company, journal=self.journal, entry_date=self.today,
            status="DRAFT", description="Test", entry_number="TEST-001"
        )
        l1 = JournalEntryLine.objects.create(
            company=self.company, journal_entry=entry, account=self.asset_acc, debit=Decimal('100')
        )
        l2 = JournalEntryLine.objects.create(
            company=self.company, journal_entry=entry, account=self.rev_acc, credit=Decimal('100')
        )
        entry.status = 'POSTED'
        entry.full_clean()
        entry.save()

        # Test API Line edit protection
        res = self.client.patch(f"/api/finance/journal-entry-lines/{l1.id}/", {"debit": 200})
        self.assertEqual(res.status_code, 400)
        self.assertIn("Cannot modify lines", str(res.data))
        
        # Test API Line add protection
        res = self.client.post("/api/finance/journal-entry-lines/", {
            "journal_entry": str(entry.id),
            "account": str(self.asset_acc.id),
            "debit": 50
        })
        self.assertEqual(res.status_code, 400)
        
        # Test Delete protection
        res = self.client.delete(f"/api/finance/journal-entry-lines/{l1.id}/")
        self.assertEqual(res.status_code, 400)
        self.assertIn("Cannot delete lines", str(res.data))

    def test_balanced_journals_and_empty(self):
        # Empty journal
        entry = JournalEntry.objects.create(
            company=self.company, journal=self.journal, entry_date=self.today,
            status="DRAFT", description="Test", entry_number="TEST-001"
        )
        entry.status = 'POSTED'
        with self.assertRaises(ValidationError) as e:
            entry.clean()
        self.assertIn("Empty journal entries cannot be posted", str(e.exception))

        # Unbalanced journal
        JournalEntryLine.objects.create(
            company=self.company, journal_entry=entry, account=self.asset_acc, debit=Decimal('100')
        )
        with self.assertRaises(ValidationError) as e:
            entry.clean()
        self.assertIn("Debits and credits must balance", str(e.exception))

    def test_accounting_period_validation(self):
        # Change period to CLOSED
        self.period.status = "CLOSED"
        self.period.save()
        
        entry = JournalEntry.objects.create(
            company=self.company, journal=self.journal, entry_date=self.today,
            status="DRAFT", description="Test", entry_number="TEST-001"
        )
        JournalEntryLine.objects.create(
            company=self.company, journal_entry=entry, account=self.asset_acc, debit=Decimal('100')
        )
        JournalEntryLine.objects.create(
            company=self.company, journal_entry=entry, account=self.rev_acc, credit=Decimal('100')
        )
        entry.status = "POSTED"
        
        with self.assertRaises(ValidationError) as e:
            entry.clean()
        self.assertIn("Cannot post into a closed", str(e.exception))

    def test_read_only_current_balance(self):
        # Try to modify current_balance via API
        res = self.client.patch(f"/api/finance/chart-of-accounts/{self.asset_acc.id}/", {
            "current_balance": "9999.00"
        })
        self.assertEqual(res.status_code, 200) # PATCH succeeds, but ignores field
        self.asset_acc.refresh_from_db()
        self.assertEqual(self.asset_acc.current_balance, Decimal('0.0000'))


