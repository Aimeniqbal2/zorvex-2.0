from django.test import TestCase
from django.contrib.admin.sites import site
from finance.models import (
    JournalEntry, JournalEntryLine, ChartOfAccount, CostCenter, ProfitCenter, Journal,
    Currency, ExchangeRate, TaxGroup, TaxCode, FinancialTag, AccountingPeriod, FiscalYear,
    Expense, CreditAccount, LegacyJournalEntry, AccountGroup
)
from finance.admin import (
    JournalEntryAdmin, JournalEntryLineAdmin, ChartOfAccountAdmin,
    CostCenterAdmin, ProfitCenterAdmin, JournalAdmin, CurrencyAdmin, ExchangeRateAdmin,
    TaxGroupAdmin, TaxCodeAdmin, FinancialTagAdmin, AccountingPeriodAdmin, FiscalYearAdmin,
    ExpenseAdmin, CreditAccountAdmin, LegacyJournalEntryAdmin, AccountGroupAdmin
)

class Phase6A2AdminTests(TestCase):
    def test_admin_registrations(self):
        """Test that all models are registered with their respective ModelAdmin classes"""
        self.assertIsInstance(site._registry[JournalEntry], JournalEntryAdmin)
        self.assertIsInstance(site._registry[JournalEntryLine], JournalEntryLineAdmin)
        self.assertIsInstance(site._registry[ChartOfAccount], ChartOfAccountAdmin)
        self.assertIsInstance(site._registry[CostCenter], CostCenterAdmin)
        self.assertIsInstance(site._registry[ProfitCenter], ProfitCenterAdmin)
        self.assertIsInstance(site._registry[Journal], JournalAdmin)
        self.assertIsInstance(site._registry[Currency], CurrencyAdmin)
        self.assertIsInstance(site._registry[ExchangeRate], ExchangeRateAdmin)
        self.assertIsInstance(site._registry[TaxGroup], TaxGroupAdmin)
        self.assertIsInstance(site._registry[TaxCode], TaxCodeAdmin)
        self.assertIsInstance(site._registry[FinancialTag], FinancialTagAdmin)
        self.assertIsInstance(site._registry[AccountingPeriod], AccountingPeriodAdmin)
        self.assertIsInstance(site._registry[FiscalYear], FiscalYearAdmin)
        self.assertIsInstance(site._registry[Expense], ExpenseAdmin)
        self.assertIsInstance(site._registry[CreditAccount], CreditAccountAdmin)
        self.assertIsInstance(site._registry[LegacyJournalEntry], LegacyJournalEntryAdmin)
        self.assertIsInstance(site._registry[AccountGroup], AccountGroupAdmin)
        
    def test_admin_readonly_fields(self):
        """Test that system-managed fields are readonly in the admin"""
        je_admin = site._registry[JournalEntry]
        self.assertIn('company', je_admin.readonly_fields)
        self.assertIn('created_at', je_admin.readonly_fields)
        self.assertIn('updated_at', je_admin.readonly_fields)
        self.assertIn('posted_at', je_admin.readonly_fields)
        
        coa_admin = site._registry[ChartOfAccount]
        self.assertIn('current_balance', coa_admin.readonly_fields)

    def test_admin_nplus1_optimizations(self):
        """Verify list_select_related is configured"""
        je_admin = site._registry[JournalEntry]
        self.assertIn('company', je_admin.list_select_related)
        self.assertIn('journal', je_admin.list_select_related)

from rest_framework.test import APITestCase, APIClient
from subscriptions.models import CompanySubscription, SubscriptionPlan
from companies.models import Company
from django.contrib.auth import get_user_model
User = get_user_model()
import datetime
from finance.views import JournalEntryViewSet, JournalEntryLineViewSet, ChartOfAccountViewSet

class Phase6A2PerformanceTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.company = Company.objects.create(name="Performance Company")
        plan = SubscriptionPlan.objects.create(name="Enterprise", price=100)
        CompanySubscription.objects.create(
            company=cls.company, plan=plan, start_date=datetime.date.today(),
            end_date=datetime.date.today() + datetime.timedelta(days=30), is_active=True
        )
        cls.user = User.objects.create_user(
            username="perf_user",
            password="password",
            company=cls.company,
            role="admin",
            is_superuser=True
        )

    def setUp(self):
        from rest_framework_simplejwt.tokens import RefreshToken
        token = RefreshToken.for_user(self.user)
        self.client = APIClient()
        self.client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {token.access_token}',
            HTTP_X_COMPANY_ID=str(self.company.id)
        )

    def test_queryset_optimizations(self):
        """Verify that viewsets use select_related and prefetch_related"""
        je_qs = JournalEntryViewSet.queryset
        self.assertTrue(je_qs.query.select_related)
        self.assertIn('journal', je_qs.query.select_related)
        self.assertIn('lines', je_qs._prefetch_related_lookups)
        
        jel_qs = JournalEntryLineViewSet.queryset
        self.assertTrue(jel_qs.query.select_related)
        self.assertIn('account', jel_qs.query.select_related)
        
        coa_qs = ChartOfAccountViewSet.queryset
        self.assertTrue(coa_qs.query.select_related)
        self.assertIn('account_group', coa_qs.query.select_related)
        self.assertIn('currency', coa_qs.query.select_related)
