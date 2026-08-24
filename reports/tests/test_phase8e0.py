from decimal import Decimal
from datetime import date, timedelta
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from companies.models import Company
from finance.models import (
    Currency, FiscalYear, AccountingPeriod, Journal, JournalEntry,
    JournalEntryLine, AccountGroup, ChartOfAccount
)
from billing.models import ServiceInvoice, ServiceInvoiceLine, BillingAccountingConfiguration
from operations.models import ServiceContract, OperationalSite
from crm.models import CRMEntity
from reports.services.finance import FinancialReportingService
from reports.services.dashboard import DashboardReportingService

User = get_user_model()

class Phase8E0ReportingTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.company_a = Company.objects.create(name="Company A")
        cls.company_b = Company.objects.create(name="Company B")

        # Users
        cls.admin_user_a = User.objects.create_user(
            username="admin_a", password="password", company=cls.company_a, role="admin"
        )
        cls.cashier_user_a = User.objects.create_user(
            username="cashier_a", password="password", company=cls.company_a, role="cashier"
        )
        cls.admin_user_b = User.objects.create_user(
            username="admin_b", password="password", company=cls.company_b, role="admin"
        )

        from platform_core.models import ModuleDefinition, CompanyModule
        reports_mod, _ = ModuleDefinition.objects.get_or_create(code='reports', defaults={'name': 'Reports', 'is_active': True})
        CompanyModule.objects.create(company=cls.company_a, module=reports_mod, enabled=True)
        CompanyModule.objects.create(company=cls.company_b, module=reports_mod, enabled=True)

        # Finance Setup - Company A
        cls.currency_a = Currency.objects.create(company=cls.company_a, code="USD", name="US Dollar", symbol="$")
        cls.fy_a = FiscalYear.objects.create(
            company=cls.company_a, name="2026", start_date=date(2026, 1, 1), end_date=date(2026, 12, 31)
        )
        cls.period_a = AccountingPeriod.objects.create(
            company=cls.company_a, fiscal_year=cls.fy_a, month=8,
            start_date=date(2026, 8, 1), end_date=date(2026, 8, 31), status='OPEN'
        )
        cls.journal_a = Journal.objects.create(
            company=cls.company_a, code="GEN", name="General", journal_type="GENERAL"
        )

        # Account Groups A
        cls.ag_asset_a = AccountGroup.objects.create(company=cls.company_a, name="Assets", group_type="ASSET")
        cls.ag_income_a = AccountGroup.objects.create(company=cls.company_a, name="Income", group_type="INCOME")
        cls.ag_expense_a = AccountGroup.objects.create(company=cls.company_a, name="Expenses", group_type="EXPENSE")

        # Accounts A
        cls.acc_bank_a = ChartOfAccount.objects.create(
            company=cls.company_a, account_group=cls.ag_asset_a, account_code="1000", account_name="Bank", account_type="ASSET", currency=cls.currency_a
        )
        cls.acc_ar_a = ChartOfAccount.objects.create(
            company=cls.company_a, account_group=cls.ag_asset_a, account_code="1100", account_name="Accounts Receivable", account_type="ASSET", currency=cls.currency_a
        )
        cls.acc_rev_a = ChartOfAccount.objects.create(
            company=cls.company_a, account_group=cls.ag_income_a, account_code="4000", account_name="Revenue", account_type="INCOME", currency=cls.currency_a
        )
        cls.acc_exp_a = ChartOfAccount.objects.create(
            company=cls.company_a, account_group=cls.ag_expense_a, account_code="5000", account_name="Expense", account_type="EXPENSE", currency=cls.currency_a
        )

        # Finance Setup - Company B
        cls.currency_b = Currency.objects.create(company=cls.company_b, code="USD", name="US Dollar", symbol="$")
        cls.fy_b = FiscalYear.objects.create(company=cls.company_b, name="2026", start_date=date(2026, 1, 1), end_date=date(2026, 12, 31))
        cls.period_b = AccountingPeriod.objects.create(company=cls.company_b, fiscal_year=cls.fy_b, month=8, start_date=date(2026, 8, 1), end_date=date(2026, 8, 31), status='OPEN')
        cls.journal_b = Journal.objects.create(company=cls.company_b, code="GEN", name="General", journal_type="GENERAL")
        cls.ag_income_b = AccountGroup.objects.create(company=cls.company_b, name="Income", group_type="INCOME")
        cls.acc_rev_b = ChartOfAccount.objects.create(company=cls.company_b, account_group=cls.ag_income_b, account_code="4000", account_name="Revenue B", account_type="INCOME", currency=cls.currency_b)

    def _create_journal_entry(self, company, journal, entry_date, lines, status='POSTED'):
        je = JournalEntry.objects.create(
            company=company, journal=journal, entry_number=f"JE-{company.id}-{JournalEntry.objects.count()}",
            entry_date=entry_date, status=status
        )
        for line in lines:
            JournalEntryLine.objects.create(
                company=company, journal_entry=je, account=line['account'],
                debit=line.get('debit', 0), credit=line.get('credit', 0),
                currency=line.get('currency')
            )
        return je

    def test_01_revenue_from_journal_entry(self):
        # TEST 1
        service = FinancialReportingService(company_id=self.company_a.id)
        # Create a posted revenue journal
        self._create_journal_entry(
            self.company_a, self.journal_a, date(2026, 8, 15),
            [
                {'account': self.acc_bank_a, 'debit': Decimal('100.00'), 'currency': self.currency_a},
                {'account': self.acc_rev_a, 'credit': Decimal('100.00'), 'currency': self.currency_a},
            ]
        )
        revenue = service.get_revenue(start_date=date(2026, 8, 1), end_date=date(2026, 8, 31))
        self.assertEqual(revenue, Decimal('100.00'))

    def test_02_draft_journal_excluded(self):
        # TEST 2
        service = FinancialReportingService(company_id=self.company_a.id)
        self._create_journal_entry(
            self.company_a, self.journal_a, date(2026, 8, 16),
            [
                {'account': self.acc_bank_a, 'debit': Decimal('50.00'), 'currency': self.currency_a},
                {'account': self.acc_rev_a, 'credit': Decimal('50.00'), 'currency': self.currency_a},
            ],
            status='DRAFT'
        )
        revenue = service.get_revenue(start_date=date(2026, 8, 1), end_date=date(2026, 8, 31))
        self.assertEqual(revenue, Decimal('0.00'))

    def test_03_cancelled_reversed_treatment(self):
        # TEST 3
        service = FinancialReportingService(company_id=self.company_a.id)
        self._create_journal_entry(
            self.company_a, self.journal_a, date(2026, 8, 17),
            [
                {'account': self.acc_bank_a, 'debit': Decimal('200.00'), 'currency': self.currency_a},
                {'account': self.acc_rev_a, 'credit': Decimal('200.00'), 'currency': self.currency_a},
            ],
            status='REVERSED'
        )
        revenue = service.get_revenue(start_date=date(2026, 8, 1), end_date=date(2026, 8, 31))
        self.assertEqual(revenue, Decimal('0.00'))

    def test_04_expense_from_journal_entry(self):
        # TEST 4
        service = FinancialReportingService(company_id=self.company_a.id)
        self._create_journal_entry(
            self.company_a, self.journal_a, date(2026, 8, 18),
            [
                {'account': self.acc_exp_a, 'debit': Decimal('30.00'), 'currency': self.currency_a},
                {'account': self.acc_bank_a, 'credit': Decimal('30.00'), 'currency': self.currency_a},
            ]
        )
        expenses = service.get_expenses(start_date=date(2026, 8, 1), end_date=date(2026, 8, 31))
        self.assertEqual(expenses, Decimal('30.00'))

    def test_05_profit_calculation(self):
        # TEST 5
        service = FinancialReportingService(company_id=self.company_a.id)
        self._create_journal_entry(
            self.company_a, self.journal_a, date(2026, 8, 19),
            [
                {'account': self.acc_bank_a, 'debit': Decimal('100.00'), 'currency': self.currency_a},
                {'account': self.acc_rev_a, 'credit': Decimal('100.00'), 'currency': self.currency_a},
            ]
        )
        self._create_journal_entry(
            self.company_a, self.journal_a, date(2026, 8, 20),
            [
                {'account': self.acc_exp_a, 'debit': Decimal('40.00'), 'currency': self.currency_a},
                {'account': self.acc_bank_a, 'credit': Decimal('40.00'), 'currency': self.currency_a},
            ]
        )
        profit = service.get_net_profit(start_date=date(2026, 8, 1), end_date=date(2026, 8, 31))
        self.assertEqual(profit, Decimal('60.00'))

    def test_06_company_isolation(self):
        # TEST 6
        service_a = FinancialReportingService(company_id=self.company_a.id)
        service_b = FinancialReportingService(company_id=self.company_b.id)
        
        self._create_journal_entry(
            self.company_a, self.journal_a, date(2026, 8, 21),
            [{'account': self.acc_bank_a, 'debit': Decimal('100.00'), 'currency': self.currency_a}, {'account': self.acc_rev_a, 'credit': Decimal('100.00'), 'currency': self.currency_a}]
        )
        # fix B entry
        ag_asset_b = AccountGroup.objects.create(company=self.company_b, name="Assets B", group_type="ASSET")
        acc_bank_b = ChartOfAccount.objects.create(company=self.company_b, account_group=ag_asset_b, account_code="1000", account_name="Bank B", account_type="ASSET", currency=self.currency_b)

        self._create_journal_entry(
            self.company_b, self.journal_b, date(2026, 8, 21),
            [{'account': self.acc_rev_b, 'credit': Decimal('500.00'), 'currency': self.currency_b}, {'account': acc_bank_b, 'debit': Decimal('500.00'), 'currency': self.currency_b}]
        )
        
        self._create_journal_entry(
            self.company_b, self.journal_b, date(2026, 8, 21),
            [{'account': acc_bank_b, 'debit': Decimal('500.00'), 'currency': self.currency_b}, {'account': self.acc_rev_b, 'credit': Decimal('500.00'), 'currency': self.currency_b}]
        )

        self.assertEqual(service_a.get_revenue(start_date=date(2026, 8, 1), end_date=date(2026, 8, 31)), Decimal('100.00'))
        self.assertEqual(service_b.get_revenue(start_date=date(2026, 8, 1), end_date=date(2026, 8, 31)), Decimal('1000.00'))



    def test_08_date_filtering(self):
        # TEST 8
        service = FinancialReportingService(company_id=self.company_a.id)
        self._create_journal_entry(
            self.company_a, self.journal_a, date(2026, 7, 31),
            [
                {'account': self.acc_bank_a, 'debit': Decimal('100.00'), 'currency': self.currency_a},
                {'account': self.acc_rev_a, 'credit': Decimal('100.00'), 'currency': self.currency_a},
            ]
        )
        revenue = service.get_revenue(start_date=date(2026, 8, 1), end_date=date(2026, 8, 31))
        self.assertEqual(revenue, Decimal('0.00'))

    def test_09_previous_period_calculation(self):
        # TEST 9
        service = DashboardReportingService(company_id=self.company_a.id)
        # Mock pct_change
        self.assertEqual(service._pct_change(150, 100), 50.0)
        self.assertEqual(service._pct_change(50, 100), -50.0)

    def test_10_zero_previous_period(self):
        # TEST 10
        service = DashboardReportingService(company_id=self.company_a.id)
        self.assertEqual(service._pct_change(100, 0), 100.0)
        self.assertEqual(service._pct_change(0, 0), 0.0)

    def test_11_permission_enforcement(self):
        # TEST 11
        client = APIClient()
        client.force_authenticate(user=self.cashier_user_a)
        response = client.get('/api/reports/dashboard/')
        self.assertEqual(response.status_code, 200)
        # Cashier should see 0 for financial data
        self.assertEqual(response.data['total_revenue'], 0.0)

        client.force_authenticate(user=self.admin_user_a)
        response = client.get('/api/reports/dashboard/')
        self.assertEqual(response.status_code, 200)
        # Admin should see real financial data (will be 0.0 if no data in current month, but not forced masked)
        # Ensure it doesn't crash

    def test_12_existing_dashboard_compatibility(self):
        # TEST 12
        client = APIClient()
        client.force_authenticate(user=self.admin_user_a)
        response = client.get('/api/reports/dashboard/')
        self.assertEqual(response.status_code, 200)
        
        expected_keys = [
            'total_revenue', 'total_expenses', 'net_profit', 'active_repairs', 'low_stock_items',
            'kpi_changes', 'revenue_trends', 'repair_stats', 'recent_sales'
        ]
        for key in expected_keys:
            self.assertIn(key, response.data)
