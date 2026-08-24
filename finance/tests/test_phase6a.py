import datetime
from decimal import Decimal
from django.urls import reverse
from django.db import transaction, IntegrityError
from django.core.exceptions import ValidationError
from rest_framework import status
from rest_framework.test import APITestCase
from companies.models import Company
from platform_core.models import ModuleDefinition, CompanyModule
from subscriptions.models import CompanySubscription, SubscriptionPlan
from django.contrib.auth import get_user_model
User = get_user_model()
from finance.models import (
    AccountGroup, ChartOfAccount, FiscalYear, AccountingPeriod,
    Journal, JournalEntry, JournalEntryLine, Currency, ExchangeRate,
    TaxGroup, TaxCode, CostCenter, ProfitCenter
)

class Phase6AFinanceTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        # Set up tenants
        cls.company_a = Company.objects.create(name="Company A")
        cls.company_b = Company.objects.create(name="Company B")

        # Setup Subscription
        plan = SubscriptionPlan.objects.create(name="Enterprise", price=100)
        CompanySubscription.objects.create(
            company=cls.company_a, plan=plan, start_date=datetime.date.today(),
            end_date=datetime.date.today() + datetime.timedelta(days=30), is_active=True
        )
        CompanySubscription.objects.create(
            company=cls.company_b, plan=plan, start_date=datetime.date.today(),
            end_date=datetime.date.today() + datetime.timedelta(days=30), is_active=True
        )

        # Set up finance module
        cls.finance_module = ModuleDefinition.objects.get_or_create(code='finance', defaults={'name': 'Finance', 'is_active': True})[0]
        CompanyModule.objects.create(company=cls.company_a, module=cls.finance_module, enabled=True)
        CompanyModule.objects.create(company=cls.company_b, module=cls.finance_module, enabled=True)
        
        # Set up users
        cls.user_a = User.objects.create_user(username="user_a", password="password", company=cls.company_a, role="admin")
        cls.user_b = User.objects.create_user(username="user_b", password="password", company=cls.company_b, role="admin")

    def setUp(self):
        from rest_framework_simplejwt.tokens import RefreshToken
        token = RefreshToken.for_user(self.user_a)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')

    def test_tenant_isolation_account_group(self):
        group_a = AccountGroup.objects.create(company=self.company_a, name="Assets A", group_type="ASSET")
        group_b = AccountGroup.objects.create(company=self.company_b, name="Assets B", group_type="ASSET")

        response = self.client.get(reverse('accountgroup-list'))
        if response.status_code != 200: print(response.content)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        results = response.json() if isinstance(response.json(), list) else response.json().get('results', [])
        
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['name'], "Assets A")

    def test_validation_cross_company(self):
        group_a = AccountGroup.objects.create(company=self.company_a, name="Assets A", group_type="ASSET")
        
        # Try to assign Company A's group as parent for Company B's group
        group_b = AccountGroup(company=self.company_b, name="Current Assets B", group_type="ASSET", parent=group_a)
        with self.assertRaises(ValidationError):
            group_b.full_clean()

    def test_constraints_unique_company_journal_code(self):
        Journal.objects.create(company=self.company_a, code="GEN", name="General", journal_type="GENERAL")
        with transaction.atomic():
            with self.assertRaises(IntegrityError):
                Journal.objects.create(company=self.company_a, code="GEN", name="General 2", journal_type="GENERAL")
        # Should be fine for Company B
        Journal.objects.create(company=self.company_b, code="GEN", name="General", journal_type="GENERAL")

    def test_api_crud_chart_of_account(self):
        group_a = AccountGroup.objects.create(company=self.company_a, name="Assets", group_type="ASSET")
        payload = {
            "account_group": group_a.id,
            "account_code": "1000",
            "account_name": "Cash",
            "account_type": "Asset",
            "opening_balance": "0.0000",
            "current_balance": "100.0000",
            "company": self.company_a.id
        }
        
        # CREATE
        response = self.client.post(reverse('chartofaccount-list'), payload)
        if response.status_code != 201: print(response.content)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        coa_id = response.data['id']
        
        # READ
        response = self.client.get(reverse('chartofaccount-detail', args=[coa_id]))
        if response.status_code != 200: print(response.data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['account_code'], "1000")
        
        # UPDATE
        response = self.client.patch(reverse('chartofaccount-detail', args=[coa_id]), {"account_name": "Cash at Bank"})
        if response.status_code != 200: print(response.data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['account_name'], "Cash at Bank")
        
        # DELETE (Soft Delete in TenantModelViewSet)
        response = self.client.delete(reverse('chartofaccount-detail', args=[coa_id]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Check it's gone
        response = self.client.get(reverse('chartofaccount-detail', args=[coa_id]))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_journal_entry_line_validation(self):
        group_a = AccountGroup.objects.create(company=self.company_a, name="Assets", group_type="ASSET")
        coa_a = ChartOfAccount.objects.create(company=self.company_a, account_group=group_a, account_code="1000", account_name="Cash", account_type="Asset")
        journal_a = Journal.objects.create(company=self.company_a, code="GEN", name="General", journal_type="GENERAL")
        entry_a = JournalEntry.objects.create(company=self.company_a, journal=journal_a, entry_number="JE-001", entry_date=datetime.date.today())
        
        # Both debit and credit 0 should fail
        line = JournalEntryLine(company=self.company_a, journal_entry=entry_a, account=coa_a, debit=Decimal(0), credit=Decimal(0))
        with self.assertRaises(ValidationError):
            line.full_clean()
            
        # Both debit and credit positive should fail
        line = JournalEntryLine(company=self.company_a, journal_entry=entry_a, account=coa_a, debit=Decimal(10), credit=Decimal(10))
        with self.assertRaises(ValidationError):
            line.full_clean()
            
        # Proper setup
        line = JournalEntryLine(company=self.company_a, journal_entry=entry_a, account=coa_a, debit=Decimal(10), credit=Decimal(0))
        line.full_clean() # Should pass

    def test_performance_sanity_query_count(self):
        group_a = AccountGroup.objects.create(company=self.company_a, name="Assets", group_type="ASSET")
        ChartOfAccount.objects.create(company=self.company_a, account_group=group_a, account_code="1000", account_name="Cash", account_type="Asset")
        ChartOfAccount.objects.create(company=self.company_a, account_group=group_a, account_code="2000", account_name="Bank", account_type="Asset")
        ChartOfAccount.objects.create(company=self.company_a, account_group=group_a, account_code="3000", account_name="Receivables", account_type="Asset")
        
        with self.assertNumQueriesLessThan(10):
            response = self.client.get(reverse('chartofaccount-list'))
            if response.status_code != 200: print(response.data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def assertNumQueriesLessThan(self, num):
        from django.test.utils import CaptureQueriesContext
        from django.db import connection
        
        class _AssertNumQueriesLessThanContext(CaptureQueriesContext):
            def __init__(self, test_case, num, connection):
                self.test_case = test_case
                self.num = num
                super().__init__(connection)
                
            def __exit__(self, exc_type, exc_value, traceback):
                super().__exit__(exc_type, exc_value, traceback)
                if exc_type is not None:
                    return
                executed = len(self.captured_queries)
                self.test_case.assertTrue(
                    executed <= self.num,
                    f"{executed} queries executed, expected less than or equal to {self.num}"
                )
                
        return _AssertNumQueriesLessThanContext(self, num, connection)
