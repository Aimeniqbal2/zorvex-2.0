from decimal import Decimal
from datetime import date
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status

from companies.models import Company
from finance.models import (
    AccountGroup, ChartOfAccount, Journal, JournalEntry, JournalEntryLine
)
from reports.services.general_ledger import GeneralLedgerService, AccountLedgerService

User = get_user_model()

class Phase8E2B1LedgerTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        # 1. Tenancy Setup
        cls.company_1 = Company.objects.create(name="Stark Industries")
        cls.company_2 = Company.objects.create(name="Wayne Enterprises")

        cls.admin_user_1 = User.objects.create_user(
            username="admin1", email="admin@stark.com", password="pwd", company=cls.company_1, role="admin"
        )
        cls.basic_user_1 = User.objects.create_user(
            username="employee1", email="employee@stark.com", password="pwd", company=cls.company_1, role="employee"
        )
        cls.admin_user_2 = User.objects.create_user(
            username="admin2", email="admin@wayne.com", password="pwd", company=cls.company_2, role="admin"
        )
        
        from platform_core.models import ModuleDefinition
        from platform_core.services import enable_module
        mod, _ = ModuleDefinition.objects.get_or_create(code='reports', defaults={'name': 'Reports', 'is_active': True})
        enable_module(cls.company_1, 'reports')
        enable_module(cls.company_2, 'reports')

        # 2. Finance Architecture Setup (Company 1)
        cls.asset_group = AccountGroup.objects.create(
            company=cls.company_1, name="Assets", group_type='ASSET'
        )
        cls.liability_group = AccountGroup.objects.create(
            company=cls.company_1, name="Liabilities", group_type='LIABILITY'
        )

        cls.bank_account = ChartOfAccount.objects.create(
            company=cls.company_1,
            account_group=cls.asset_group,
            account_code="1000",
            account_name="Cash at Bank",
            opening_balance=Decimal('5000.00')
        )
        cls.payable_account = ChartOfAccount.objects.create(
            company=cls.company_1,
            account_group=cls.liability_group,
            account_code="2000",
            account_name="Accounts Payable",
            opening_balance=Decimal('1000.00')
        )

        cls.journal = Journal.objects.create(
            company=cls.company_1, name="General Journal", code="GJ", journal_type='GENERAL'
        )

        # 3. Create Transactions
        # Entry 1: POSTED (Prior to date filter tests, e.g. Jan 1)
        cls.entry_1 = JournalEntry.objects.create(
            company=cls.company_1,
            journal=cls.journal,
            entry_date=date(2026, 1, 1),
            status='POSTED',
            entry_number='JE-001'
        )
        JournalEntryLine.objects.create(
            company=cls.company_1, journal_entry=cls.entry_1, account=cls.bank_account,
            debit=Decimal('1000.00'), credit=Decimal('0.00')
        )
        JournalEntryLine.objects.create(
            company=cls.company_1, journal_entry=cls.entry_1, account=cls.payable_account,
            debit=Decimal('0.00'), credit=Decimal('1000.00')
        )

        # Entry 2: POSTED (Within typical date filter, e.g. Feb 1)
        cls.entry_2 = JournalEntry.objects.create(
            company=cls.company_1,
            journal=cls.journal,
            entry_date=date(2026, 2, 1),
            status='POSTED',
            entry_number='JE-002'
        )
        JournalEntryLine.objects.create(
            company=cls.company_1, journal_entry=cls.entry_2, account=cls.bank_account,
            debit=Decimal('0.00'), credit=Decimal('500.00')
        )
        JournalEntryLine.objects.create(
            company=cls.company_1, journal_entry=cls.entry_2, account=cls.payable_account,
            debit=Decimal('500.00'), credit=Decimal('0.00')
        )

        # Entry 3: DRAFT (Should be excluded from reports)
        cls.entry_draft = JournalEntry.objects.create(
            company=cls.company_1,
            journal=cls.journal,
            entry_date=date(2026, 2, 15),
            status='DRAFT',
            entry_number='JE-003'
        )
        JournalEntryLine.objects.create(
            company=cls.company_1, journal_entry=cls.entry_draft, account=cls.bank_account,
            debit=Decimal('100.00'), credit=Decimal('0.00')
        )
        JournalEntryLine.objects.create(
            company=cls.company_1, journal_entry=cls.entry_draft, account=cls.payable_account,
            debit=Decimal('0.00'), credit=Decimal('100.00')
        )

        # 4. Company 2 Setup for Isolation Testing
        cls.c2_asset_group = AccountGroup.objects.create(
            company=cls.company_2, name="Assets", group_type='ASSET'
        )
        cls.c2_bank_account = ChartOfAccount.objects.create(
            company=cls.company_2,
            account_group=cls.c2_asset_group,
            account_code="1000",
            account_name="C2 Bank",
            opening_balance=Decimal('0.00')
        )
        cls.c2_journal = Journal.objects.create(
            company=cls.company_2, name="C2 Journal", code="C2J"
        )
        cls.entry_c2 = JournalEntry.objects.create(
            company=cls.company_2, journal=cls.c2_journal, entry_date=date(2026, 1, 15), status='POSTED', entry_number='JE-004'
        )
        JournalEntryLine.objects.create(
            company=cls.company_2, journal_entry=cls.entry_c2, account=cls.c2_bank_account,
            debit=Decimal('2000.00'), credit=Decimal('0.00')
        )
        JournalEntryLine.objects.create(
            company=cls.company_2, journal_entry=cls.entry_c2, account=cls.c2_bank_account,
            debit=Decimal('0.00'), credit=Decimal('2000.00')
        )

    def setUp(self):
        self.client = APIClient()

    # --- 1. General Ledger Service Tests ---
    def test_gl_service_basic_retrieval(self):
        service = GeneralLedgerService(company_id=self.company_1.id)
        qs = service.get_general_ledger()
        # Should have 4 POSTED lines for company 1
        self.assertEqual(qs.count(), 4)

    def test_gl_service_draft_exclusion(self):
        service = GeneralLedgerService(company_id=self.company_1.id)
        qs = service.get_general_ledger()
        for line in qs:
            self.assertEqual(line.journal_entry.status, 'POSTED')

    def test_gl_service_company_isolation(self):
        service = GeneralLedgerService(company_id=self.company_2.id)
        qs = service.get_general_ledger()
        # Should only see 2 lines for company 2
        self.assertEqual(qs.count(), 2)
        for line in qs:
            self.assertEqual(line.company_id, self.company_2.id)

    def test_gl_service_date_filtering(self):
        service = GeneralLedgerService(company_id=self.company_1.id)
        qs = service.get_general_ledger(date_from=date(2026, 2, 1))
        # Should only include entry_2 lines (2 lines)
        self.assertEqual(qs.count(), 2)

    # --- 2. Account Ledger Service Tests ---
    def test_account_ledger_isolation(self):
        service = AccountLedgerService(company_id=self.company_1.id)
        with self.assertRaises(ValueError):
            # Attempt to access Company 2's account
            service.get_account_ledger(account_id=self.c2_bank_account.id)

    def test_account_ledger_debit_normal(self):
        # Bank Account (ASSET) -> Debit Normal
        service = AccountLedgerService(company_id=self.company_1.id)
        data = service.get_account_ledger(account_id=self.bank_account.id)
        
        self.assertTrue(data['is_debit_normal'])
        # Fixed OB: 5000.00
        # Entry 1: +1000.00
        # Entry 2: -500.00
        # Closing: 5500.00
        self.assertEqual(data['opening_balance'], Decimal('5000.00'))
        self.assertEqual(data['period_debit'], Decimal('1000.00'))
        self.assertEqual(data['period_credit'], Decimal('500.00'))
        self.assertEqual(data['closing_balance'], Decimal('5500.00'))

    def test_account_ledger_credit_normal(self):
        # Payable Account (LIABILITY) -> Credit Normal
        service = AccountLedgerService(company_id=self.company_1.id)
        data = service.get_account_ledger(account_id=self.payable_account.id)
        
        self.assertFalse(data['is_debit_normal'])
        # Fixed OB: 1000.00
        # Entry 1: +1000.00 (Credit)
        # Entry 2: -500.00 (Debit)
        # Closing: 1500.00
        self.assertEqual(data['opening_balance'], Decimal('1000.00'))
        self.assertEqual(data['period_debit'], Decimal('500.00'))
        self.assertEqual(data['period_credit'], Decimal('1000.00'))
        self.assertEqual(data['closing_balance'], Decimal('1500.00'))

    def test_account_ledger_running_balance_window(self):
        # Test the DB-level window calculation
        service = AccountLedgerService(company_id=self.company_1.id)
        data = service.get_account_ledger(account_id=self.bank_account.id)
        qs = data['transactions']
        lines = list(qs)
        
        self.assertEqual(len(lines), 2)
        # First entry: Jan 1. Movement = 1000 debit. OB = 5000. Running = 6000.
        self.assertEqual(lines[0].running_balance, Decimal('6000.00'))
        # Second entry: Feb 1. Movement = 500 credit. Running = 5500.
        self.assertEqual(lines[1].running_balance, Decimal('5500.00'))

    def test_account_ledger_date_filter_opening_balance_carryover(self):
        # Filter from Feb 1.
        # Jan 1 transaction should be rolled into opening balance.
        service = AccountLedgerService(company_id=self.company_1.id)
        data = service.get_account_ledger(account_id=self.bank_account.id, date_from=date(2026, 2, 1))
        
        # OB should now be 5000 (fixed) + 1000 (Jan 1) = 6000
        self.assertEqual(data['opening_balance'], Decimal('6000.00'))
        
        # Period should only contain Feb 1
        self.assertEqual(data['period_debit'], Decimal('0.00'))
        self.assertEqual(data['period_credit'], Decimal('500.00'))
        self.assertEqual(data['closing_balance'], Decimal('5500.00'))
        
        qs = data['transactions']
        lines = list(qs)
        self.assertEqual(len(lines), 1)
        # Running balance for this line: OB (6000) - 500 (credit) = 5500
        self.assertEqual(lines[0].running_balance, Decimal('5500.00'))

    # --- 3. API Security & RBAC Tests ---
    def test_api_requires_auth(self):
        res = self.client.get(reverse('api-report-general-ledger'))
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_api_finance_permission_enforcement(self):
        # Employee should be denied
        self.client.force_authenticate(user=self.basic_user_1)
        res = self.client.get(reverse('api-report-general-ledger'))
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Admin should be allowed
        self.client.force_authenticate(user=self.admin_user_1)
        res = self.client.get(reverse('api-report-general-ledger'))
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_account_ledger_missing_account_id(self):
        self.client.force_authenticate(user=self.admin_user_1)
        res = self.client.get(reverse('api-report-account-ledger'))
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('account_id', res.data)

    def test_account_ledger_api_success(self):
        self.client.force_authenticate(user=self.admin_user_1)
        url = reverse('api-report-account-ledger')
        res = self.client.get(f"{url}?account_id={self.bank_account.id}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['closing_balance'], 5500.0)
        self.assertEqual(res.data['transactions']['count'], 2)

    # --- 4. Export Streaming Tests ---
    def test_export_general_ledger_csv(self):
        self.client.force_authenticate(user=self.admin_user_1)
        url = reverse('api-report-general-ledger')
        res = self.client.get(f"{url}?export=csv")
        
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res['Content-Type'], 'text/csv; charset=utf-8')
        # Check it is a StreamingHttpResponse
        self.assertTrue(res.streaming)
        
        content = b''.join(res.streaming_content).decode('utf-8')
        self.assertIn('entry_date,journal_number', content)
        self.assertIn('1000', content)

    def test_export_account_ledger_csv(self):
        self.client.force_authenticate(user=self.admin_user_1)
        url = reverse('api-report-account-ledger')
        res = self.client.get(f"{url}?account_id={self.bank_account.id}&export=csv")
        
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.streaming)
        
        content = b''.join(res.streaming_content).decode('utf-8')
        self.assertIn('running_balance', content)
        # Includes the 6000 and 5500 running balances
        self.assertIn('6000.0', content)
        self.assertIn('5500.0', content)
