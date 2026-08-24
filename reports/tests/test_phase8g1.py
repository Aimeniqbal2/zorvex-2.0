import json
from decimal import Decimal
from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth import get_user_model
from companies.models import Company
from finance.models import JournalEntry, JournalEntryLine, ChartOfAccount, AccountGroup
from reports.services.analytics.registry import KPI_REGISTRY
from reports.services.analytics.kpis import AnalyticsKPIService
from reports.services.analytics.ratios import FinancialRatioService
from reports.services.analytics.trends import TrendAnalyticsService
from reports.services.analytics.forecasting import ForecastingService
from reports.services.analytics.anomalies import AnomalyDetectionService
from django.utils import timezone
from datetime import timedelta

User = get_user_model()

class Phase8G1AnalyticsTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        # 1. Company and Users
        cls.company_a = Company.objects.create(name="Stark Industries", is_active=True)
        cls.company_b = Company.objects.create(name="Wayne Enterprises", is_active=True)
        
        cls.admin_a = User.objects.create_user(
            username="admin_a", email="admin_a@stark.com", password="pwd", company=cls.company_a, role="admin", is_active=True
        )
        cls.emp_a = User.objects.create_user(
            username="emp_a", email="emp_a@stark.com", password="pwd", company=cls.company_a, role="employee", is_active=True
        )
        cls.admin_b = User.objects.create_user(
            username="admin_b", email="admin_b@wayne.com", password="pwd", company=cls.company_b, role="admin", is_active=True
        )
        
        # Modules
        from platform_core.models import ModuleDefinition, CompanyModule
        reports_mod, _ = ModuleDefinition.objects.get_or_create(code='reports', defaults={'name': 'Reports', 'is_active': True})
        finance_mod, _ = ModuleDefinition.objects.get_or_create(code='finance', defaults={'name': 'Finance', 'is_active': True})
        
        CompanyModule.objects.create(company=cls.company_a, module=reports_mod)
        CompanyModule.objects.create(company=cls.company_a, module=finance_mod)
        CompanyModule.objects.create(company=cls.company_b, module=reports_mod)
        CompanyModule.objects.create(company=cls.company_b, module=finance_mod)
        
        # Financial Data for Company A
        asset_group = AccountGroup.objects.create(company=cls.company_a, name="Assets", group_type="ASSET")
        liability_group = AccountGroup.objects.create(company=cls.company_a, name="Liabilities", group_type="LIABILITY")
        revenue_group = AccountGroup.objects.create(company=cls.company_a, name="Revenue", group_type="INCOME")
        expense_group = AccountGroup.objects.create(company=cls.company_a, name="Expenses", group_type="EXPENSE")
        
        cls.asset_acc = ChartOfAccount.objects.create(company=cls.company_a, account_group=asset_group, account_code="1000", account_name="Cash", is_active=True)
        cls.liability_acc = ChartOfAccount.objects.create(company=cls.company_a, account_group=liability_group, account_code="2000", account_name="AP", is_active=True)
        cls.revenue_acc = ChartOfAccount.objects.create(company=cls.company_a, account_group=revenue_group, account_code="4000", account_name="Sales", is_active=True)
        cls.expense_acc = ChartOfAccount.objects.create(company=cls.company_a, account_group=expense_group, account_code="5000", account_name="Rent", is_active=True)
        
        # Empty accounts for B to test zero denominators
        asset_group_b = AccountGroup.objects.create(company=cls.company_b, name="Assets", group_type="ASSET")
        liability_group_b = AccountGroup.objects.create(company=cls.company_b, name="Liabilities", group_type="LIABILITY")
        cls.asset_acc_b = ChartOfAccount.objects.create(company=cls.company_b, account_group=asset_group_b, account_code="1000", account_name="Cash", is_active=True)
        cls.liability_acc_b = ChartOfAccount.objects.create(company=cls.company_b, account_group=liability_group_b, account_code="2000", account_name="AP", is_active=True)
        
        # Add a Journal
        from finance.models import Journal
        cls.journal = Journal.objects.create(company=cls.company_a, code="GEN", name="General", journal_type="GENERAL")

        # Create some journal entries for A across a few months for trends
        today = timezone.now().date()
        for i in range(3):
            d = today - timedelta(days=30*i)
            je = JournalEntry.objects.create(company=cls.company_a, journal=cls.journal, entry_date=d, entry_number=f"JE-{i}-1", status='POSTED')
            # 100 Revenue, 20 Expense
            # Cash increases by 80, AR not modeled explicitly, we just book to Cash.
            JournalEntryLine.objects.create(journal_entry=je, account=cls.asset_acc, debit=Decimal('100.00'), credit=Decimal('0.00'), company=cls.company_a)
            JournalEntryLine.objects.create(journal_entry=je, account=cls.revenue_acc, debit=Decimal('0.00'), credit=Decimal('100.00'), company=cls.company_a)
            
            je2 = JournalEntry.objects.create(company=cls.company_a, journal=cls.journal, entry_date=d, entry_number=f"JE-{i}-2", status='POSTED')
            JournalEntryLine.objects.create(journal_entry=je2, account=cls.expense_acc, debit=Decimal('20.00'), credit=Decimal('0.00'), company=cls.company_a)
            JournalEntryLine.objects.create(journal_entry=je2, account=cls.asset_acc, debit=Decimal('0.00'), credit=Decimal('20.00'), company=cls.company_a)
            
            # Liabilities (for ratio)
            je3 = JournalEntry.objects.create(company=cls.company_a, journal=cls.journal, entry_date=d, entry_number=f"JE-{i}-3", status='POSTED')
            JournalEntryLine.objects.create(journal_entry=je3, account=cls.asset_acc, debit=Decimal('50.00'), credit=Decimal('0.00'), company=cls.company_a)
            JournalEntryLine.objects.create(journal_entry=je3, account=cls.liability_acc, debit=Decimal('0.00'), credit=Decimal('50.00'), company=cls.company_a)

    def test_01_kpi_registry_discovery(self):
        """Test KPI registry discovery via API"""
        self.client.force_authenticate(user=self.admin_a)
        response = self.client.get(reverse('api-analytics-metadata'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('kpis', response.data)
        self.assertTrue(any(k['code'] == 'revenue' for k in response.data['kpis']))

    def test_02_valid_kpi_execution(self):
        """Test execution of valid KPI"""
        self.client.force_authenticate(user=self.admin_a)
        response = self.client.get(reverse('api-analytics-kpi', kwargs={'kpi_code': 'revenue'}))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['code'], 'revenue')
        self.assertEqual(response.data['value'], 300.0) # 3 months * 100

    def test_03_invalid_kpi_rejection(self):
        """Test rejection of invalid KPI"""
        self.client.force_authenticate(user=self.admin_a)
        response = self.client.get(reverse('api-analytics-kpi', kwargs={'kpi_code': 'invalid_kpi'}))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_04_ratio_calculation(self):
        """Test financial ratio calculations"""
        service = FinancialRatioService(self.company_a.id)
        margin = service.get_gross_margin()
        self.assertEqual(margin['status'], 'ok')
        # Revenue = 300, COGS = 0 -> Gross Margin = 100%
        self.assertEqual(margin['value'], 100.0)
        
        current_ratio = service.get_current_ratio()
        self.assertEqual(current_ratio['status'], 'ok')
        # Assets: 3*(100-20+50) = 390
        # Liabilities: 3*50 = 150
        # 390 / 150 = 2.6
        self.assertEqual(current_ratio['value'], 2.6)

    def test_05_zero_denominator_protection(self):
        """Test zero denominator protection"""
        service = FinancialRatioService(self.company_b.id)
        # B has no data, so denominators are zero
        current_ratio = service.get_current_ratio()
        self.assertEqual(current_ratio['status'], 'insufficient_data')
        self.assertIsNone(current_ratio['value'])

    def test_06_empty_tenant_handling(self):
        """Empty tenant returns 0/none appropriately"""
        self.client.force_authenticate(user=self.admin_b)
        response = self.client.get(reverse('api-analytics-kpi', kwargs={'kpi_code': 'revenue'}))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['value'], 0.0)

    def test_07_trend_aggregation(self):
        """Test trend aggregation"""
        self.client.force_authenticate(user=self.admin_a)
        response = self.client.get(reverse('api-analytics-trends') + '?metric=revenue&interval=monthly')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['data']), 3)

    def test_08_unsupported_metric_rejection(self):
        """Test rejection of unsupported metric"""
        self.client.force_authenticate(user=self.admin_a)
        response = self.client.get(reverse('api-analytics-trends') + '?metric=invalid&interval=monthly')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_09_unauthorized_financial_kpi_protection(self):
        """Test unauthorized users cannot access financial KPIs"""
        self.client.force_authenticate(user=self.emp_a)
        response = self.client.get(reverse('api-analytics-kpi', kwargs={'kpi_code': 'revenue'}))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_10_analytics_dashboard_response(self):
        """Test dashboard payload generation"""
        self.client.force_authenticate(user=self.admin_a)
        response = self.client.get(reverse('api-analytics-dashboard'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('kpis', response.data)
        self.assertIn('revenue', response.data['kpis'])
        self.assertIn('trends', response.data)

    def test_11_celery_forecasting_task(self):
        """Test Celery forecasting logic"""
        from reports.tasks import forecast_metric
        result = forecast_metric(self.company_a.id, "revenue", {"periods": 3, "method": "moving_average"})
        self.assertEqual(result['status'], 'ok')
        self.assertEqual(len(result['forecast']), 3)
        self.assertEqual(result['forecast'][0]['value'], 100.0) # all months had 100 revenue

    def test_12_anomaly_detection(self):
        """Test anomaly detection logic"""
        from reports.tasks import detect_anomalies_task
        result = detect_anomalies_task(self.company_a.id, "expenses")
        self.assertEqual(result['status'], 'ok')
        # All months have exactly 20 expense. Variance is 0. No anomalies.
        self.assertEqual(len(result['anomalies']), 0)
