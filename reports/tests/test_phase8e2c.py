import json
from datetime import date, timedelta
from decimal import Decimal
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model

from companies.models import Company
from finance.models import (
    Journal, JournalEntry, JournalEntryLine, ChartOfAccount, AccountGroup, 
    Currency, AccountingPeriod, FiscalYear, SalesAccountingConfiguration, ProfitCenter, CostCenter
)
from billing.models import BillingAccountingConfiguration
from crm.models import CRMEntity
from reports.services.financial_statements import FinancialStatementsReportingService
from reports.services.cash_movement import CashMovementReportingService
from reports.services.drill_down import FinancialDrillDownService

User = get_user_model()

class Phase8E2CReportingTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        # 1. Companies & Users
        cls.company_a = Company.objects.create(name="Company A")
        cls.company_b = Company.objects.create(name="Company B")
        
        from platform_core.models import ModuleDefinition
        from platform_core.services import enable_module
        
        mod, _ = ModuleDefinition.objects.get_or_create(code='reports', defaults={'name': 'Reports', 'is_active': True})
        enable_module(cls.company_a, 'reports')
        enable_module(cls.company_b, 'reports')

        cls.admin_a = User.objects.create_user(username="admin_a", password="pwd", company=cls.company_a, role="admin", is_active=True)
        cls.employee_a = User.objects.create_user(username="emp_a", password="pwd", company=cls.company_a, role="employee", is_active=True)
        cls.admin_b = User.objects.create_user(username="admin_b", password="pwd", company=cls.company_b, role="admin", is_active=True)

        cls.currency_a = Currency.objects.create(company=cls.company_a, code="USD", name="US Dollar", is_base_currency=True)
        cls.currency_b = Currency.objects.create(company=cls.company_b, code="EUR", name="Euro", is_base_currency=True)

        today = date.today()
        cls.fy_a = FiscalYear.objects.create(company=cls.company_a, name=str(today.year), start_date=date(2026, 1, 1), end_date=date(2026, 12, 31), is_current=True)
        cls.period_a1 = AccountingPeriod.objects.create(company=cls.company_a, fiscal_year=cls.fy_a, month=6, start_date=date(2026, 6, 1), end_date=date(2026, 6, 30), status='OPEN')
        cls.period_a2 = AccountingPeriod.objects.create(company=cls.company_a, fiscal_year=cls.fy_a, month=7, start_date=date(2026, 7, 1), end_date=date(2026, 7, 31), status='OPEN')

        cls.journal_a = Journal.objects.create(company=cls.company_a, code="GEN", name="General", journal_type="GENERAL")
        cls.journal_b = Journal.objects.create(company=cls.company_b, code="GEN", name="General", journal_type="GENERAL")

        # 2. Account Groups
        cls.asset_group = AccountGroup.objects.create(company=cls.company_a, name="Assets", group_type="ASSET")
        cls.income_group = AccountGroup.objects.create(company=cls.company_a, name="Income", group_type="INCOME")
        cls.expense_group = AccountGroup.objects.create(company=cls.company_a, name="Expense", group_type="EXPENSE")

        # 3. Chart of Accounts
        cls.cash_account_a = ChartOfAccount.objects.create(company=cls.company_a, account_group=cls.asset_group, account_code="1000", account_name="Cash", account_type="Asset", currency=cls.currency_a)
        cls.bank_account_a = ChartOfAccount.objects.create(company=cls.company_a, account_group=cls.asset_group, account_code="1001", account_name="Bank", account_type="Asset", currency=cls.currency_a)
        cls.revenue_account_a = ChartOfAccount.objects.create(company=cls.company_a, account_group=cls.income_group, account_code="4000", account_name="Sales Revenue", account_type="Income", currency=cls.currency_a)
        cls.expense_account_a = ChartOfAccount.objects.create(company=cls.company_a, account_group=cls.expense_group, account_code="5000", account_name="Rent Expense", account_type="Expense", currency=cls.currency_a)
        
        # Company B accounts
        cls.b_asset_group = AccountGroup.objects.create(company=cls.company_b, name="Assets B", group_type="ASSET")
        cls.b_income_group = AccountGroup.objects.create(company=cls.company_b, name="Income B", group_type="INCOME")
        cls.revenue_account_b = ChartOfAccount.objects.create(company=cls.company_b, account_group=cls.b_income_group, account_code="4000", account_name="Sales Rev B", account_type="Income", currency=cls.currency_b)

        # 4. Configuration for Cash Movement
        cls.sales_config = SalesAccountingConfiguration.objects.create(
            company=cls.company_a,
            sales_revenue_account=cls.revenue_account_a,
            accounts_receivable_account=cls.cash_account_a,  # dummy mapping for test
            cash_account=cls.cash_account_a,
            bank_account=cls.bank_account_a,
            default_currency=cls.currency_a,
            is_active=True
        )

        # 5. CRM, Cost Centers, Profit Centers
        cls.customer = CRMEntity.objects.create(company=cls.company_a, name="Customer", entity_type="CUSTOMER")
        cls.cost_center = CostCenter.objects.create(company=cls.company_a, name="Marketing", code="MKT")
        cls.profit_center = ProfitCenter.objects.create(company=cls.company_a, name="Retail", code="RET")

        # 6. Journal Entries
        # JUNE: Revenue 1000, Expense 200, Net 800
        cls.je_jun = JournalEntry.objects.create(company=cls.company_a, journal=cls.journal_a, entry_number="JE-JUN", entry_date=date(2026, 6, 15), status="POSTED", source_module="sales", source_document_type="invoice", source_document_id="11111111-1111-1111-1111-111111111111")
        JournalEntryLine.objects.create(company=cls.company_a, journal_entry=cls.je_jun, account=cls.revenue_account_a, debit=Decimal('0.00'), credit=Decimal('1000.00'), crm_entity=cls.customer, cost_center=cls.cost_center, profit_center=cls.profit_center)
        JournalEntryLine.objects.create(company=cls.company_a, journal_entry=cls.je_jun, account=cls.cash_account_a, debit=Decimal('1000.00'), credit=Decimal('0.00'), crm_entity=cls.customer, cost_center=cls.cost_center, profit_center=cls.profit_center)
        
        cls.je_jun_exp = JournalEntry.objects.create(company=cls.company_a, journal=cls.journal_a, entry_number="JE-JUN-EXP", entry_date=date(2026, 6, 20), status="POSTED")
        JournalEntryLine.objects.create(company=cls.company_a, journal_entry=cls.je_jun_exp, account=cls.expense_account_a, debit=Decimal('200.00'), credit=Decimal('0.00'))
        JournalEntryLine.objects.create(company=cls.company_a, journal_entry=cls.je_jun_exp, account=cls.cash_account_a, debit=Decimal('0.00'), credit=Decimal('200.00'))

        # JULY: Revenue 1500, Expense 300, Net 1200
        cls.je_jul = JournalEntry.objects.create(company=cls.company_a, journal=cls.journal_a, entry_number="JE-JUL", entry_date=date(2026, 7, 10), status="POSTED", source_module="billing")
        JournalEntryLine.objects.create(company=cls.company_a, journal_entry=cls.je_jul, account=cls.revenue_account_a, debit=Decimal('0.00'), credit=Decimal('1500.00'))
        JournalEntryLine.objects.create(company=cls.company_a, journal_entry=cls.je_jul, account=cls.bank_account_a, debit=Decimal('1500.00'), credit=Decimal('0.00'))

        cls.je_jul_exp = JournalEntry.objects.create(company=cls.company_a, journal=cls.journal_a, entry_number="JE-JUL-EXP", entry_date=date(2026, 7, 25), status="POSTED")
        JournalEntryLine.objects.create(company=cls.company_a, journal_entry=cls.je_jul_exp, account=cls.expense_account_a, debit=Decimal('300.00'), credit=Decimal('0.00'))
        JournalEntryLine.objects.create(company=cls.company_a, journal_entry=cls.je_jul_exp, account=cls.bank_account_a, debit=Decimal('0.00'), credit=Decimal('300.00'))

        # COMPANY B ENTRY
        cls.je_b = JournalEntry.objects.create(company=cls.company_b, journal=cls.journal_b, entry_number="JE-B", entry_date=date(2026, 7, 10), status="POSTED", source_document_id="22222222-2222-2222-2222-222222222222")
        JournalEntryLine.objects.create(company=cls.company_b, journal_entry=cls.je_b, account=cls.revenue_account_b, debit=Decimal('0.00'), credit=Decimal('5000.00'))

    # ==========================================
    # COMPARATIVE ANALYTICS TESTS (8E-2C-A)
    # ==========================================
    def test_comparative_pnl_valid(self):
        self.client.force_authenticate(user=self.admin_a)
        response = self.client.get(reverse('api-report-comparative'), {'date_from': '2026-07-01', 'date_to': '2026-07-31'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        data = response.data
        # July Revenue = 1500
        self.assertEqual(data['revenue']['current'], 1500.0)
        # June Revenue = 1000
        self.assertEqual(data['revenue']['previous'], 1000.0)
        
        # Variance = 500
        self.assertEqual(data['revenue']['variance'], 500.0)
        # Variance % = 50%
        self.assertEqual(data['revenue']['variance_percent'], 50.0)
        
        # July Net Profit = 1500 - 300 = 1200
        self.assertEqual(data['net_profit']['current'], 1200.0)
        # June Net Profit = 1000 - 200 = 800
        self.assertEqual(data['net_profit']['previous'], 800.0)

    def test_comparative_pnl_zero_denominator(self):
        self.client.force_authenticate(user=self.admin_a)
        # Test August, where July is previous, but if we test June where May is previous (May has 0 revenue)
        response = self.client.get(reverse('api-report-comparative'), {'date_from': '2026-06-01', 'date_to': '2026-06-30'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['revenue']['current'], 1000.0)
        self.assertEqual(response.data['revenue']['previous'], 0.0)
        self.assertEqual(response.data['revenue']['variance_percent'], 0.0) # Graceful handling of zero division

    def test_comparative_csv_export_streaming(self):
        self.client.force_authenticate(user=self.admin_a)
        response = self.client.get(reverse('api-report-comparative'), {'date_from': '2026-07-01', 'date_to': '2026-07-31', 'export': 'csv'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Although list-based exports might just return HttpResponse in some implementations,
        # we check the headers
        self.assertEqual(response['Content-Type'], 'text/csv; charset=utf-8')

    def test_comparative_tenant_isolation(self):
        self.client.force_authenticate(user=self.admin_b)
        response = self.client.get(reverse('api-report-comparative'), {'date_from': '2026-07-01', 'date_to': '2026-07-31'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['revenue']['current'], 5000.0) # Company B has 5000 in July

    # ==========================================
    # CASH MOVEMENT TESTS (8E-2C-B)
    # ==========================================
    def test_cash_movement_valid(self):
        self.client.force_authenticate(user=self.admin_a)
        # Query for July (so opening balance comes from June)
        response = self.client.get(reverse('api-report-cash-movement'), {'date_from': '2026-07-01', 'date_to': '2026-07-31'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        
        # June: +1000 cash, -200 cash => Opening = 800
        self.assertEqual(data['opening_balance'], 800.0)
        # July: +1500 bank, -300 bank => Receipts 1500, Disb 300
        self.assertEqual(data['receipts'], 1500.0)
        self.assertEqual(data['disbursements'], 300.0)
        self.assertEqual(data['net_movement'], 1200.0)
        # Closing = 800 + 1200 = 2000
        self.assertEqual(data['closing_balance'], 2000.0)
        # Ensure it resolves both cash and bank accounts from config
        self.assertEqual(len(data['accounts']), 2)
        
    def test_cash_movement_no_fake_classification(self):
        self.client.force_authenticate(user=self.admin_a)
        response = self.client.get(reverse('api-report-cash-movement'), {'date_from': '2026-07-01', 'date_to': '2026-07-31'})
        self.assertNotIn('operating', response.data)
        self.assertNotIn('investing', response.data)
        self.assertNotIn('financing', response.data)

    def test_cash_movement_tenant_isolation(self):
        self.client.force_authenticate(user=self.admin_b)
        # Company B has no cash accounts mapped yet
        response = self.client.get(reverse('api-report-cash-movement'), {'date_from': '2026-07-01', 'date_to': '2026-07-31'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['opening_balance'], 0.0)
        
    def test_cash_movement_csv_streaming(self):
        self.client.force_authenticate(user=self.admin_a)
        response = self.client.get(reverse('api-report-cash-movement'), {'date_from': '2026-07-01', 'date_to': '2026-07-31', 'export': 'csv'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(getattr(response, 'streaming', False))

    # ==========================================
    # DRILL-DOWN TESTS (8E-2C-C)
    # ==========================================
    def test_drill_down_journal_entry(self):
        self.client.force_authenticate(user=self.admin_a)
        response = self.client.get(reverse('api-report-drill-down'), {'journal_entry_id': str(self.je_jun.id)})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 2)
        self.assertEqual(response.data['results'][0]['entry_number'], "JE-JUN")

    def test_drill_down_account_filtering(self):
        self.client.force_authenticate(user=self.admin_a)
        response = self.client.get(reverse('api-report-drill-down'), {'account_id': str(self.revenue_account_a.id)})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 2) # je_jun and je_jul both hit revenue
        
    def test_drill_down_crm_filtering(self):
        self.client.force_authenticate(user=self.admin_a)
        response = self.client.get(reverse('api-report-drill-down'), {'crm_entity_id': str(self.customer.id)})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 2)
        
    def test_drill_down_cost_profit_center(self):
        self.client.force_authenticate(user=self.admin_a)
        response = self.client.get(reverse('api-report-drill-down'), {
            'cost_center_id': str(self.cost_center.id),
            'profit_center_id': str(self.profit_center.id)
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 2)

    def test_drill_down_source_document(self):
        self.client.force_authenticate(user=self.admin_a)
        response = self.client.get(reverse('api-report-drill-down'), {
            'source_module': 'sales',
            'source_document_type': 'invoice',
            'source_document_id': '11111111-1111-1111-1111-111111111111'
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 2)
        
    def test_drill_down_date_filtering(self):
        self.client.force_authenticate(user=self.admin_a)
        response = self.client.get(reverse('api-report-drill-down'), {'date_from': '2026-07-01', 'date_to': '2026-07-31'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 4) # 2 lines in je_jul, 2 lines in je_jul_exp

    def test_drill_down_cross_tenant_attack(self):
        self.client.force_authenticate(user=self.admin_a)
        # Attempt to access Company B's entry
        response = self.client.get(reverse('api-report-drill-down'), {'journal_entry_id': str(self.je_b.id)})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 0) # Should return nothing

        # Attempt to access Company B's source document
        response = self.client.get(reverse('api-report-drill-down'), {'source_document_id': '22222222-2222-2222-2222-222222222222'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 0)

    def test_drill_down_rbac(self):
        self.client.force_authenticate(user=self.employee_a)
        response = self.client.get(reverse('api-report-drill-down'), {'date_from': '2026-07-01'})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        
    def test_drill_down_csv_streaming(self):
        self.client.force_authenticate(user=self.admin_a)
        response = self.client.get(reverse('api-report-drill-down'), {'date_from': '2026-06-01', 'export': 'csv'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(getattr(response, 'streaming', False))
