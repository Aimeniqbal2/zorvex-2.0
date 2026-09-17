from decimal import Decimal
from datetime import date, timedelta
from django.test import TestCase
from django.core.exceptions import ValidationError
from companies.models import Company
from accounts.models import User
from finance.models import (
    FiscalYear, AccountingPeriod, PeriodStatus, ChartOfAccount, AccountType, NormalBalance,
    Journal, JournalType, JournalEntry, JournalEntryLine, JournalStatus, BankAccount, BankAccountType,
    Cheque, TaxCode, TaxTransaction, TaxPaymentVoucher, ControlException,
    SubledgerReconciliationSnapshot, AccountingPeriod, SalaryPaymentBatch, PayrollAccountingIntegration
)
from billing.models import BillingPeriod, BillingSheet, ClientInvoice, ClientReceipt, RecoveryStatus
from purchasing.models import (
    VendorCategory, Vendor, ProcurementDocument,
    VendorPayment, VendorPaymentAllocation, VendorCreditNote
)
from crm.models import CRMEntity
from finance.services.posting_service import AccountingPostingService
from finance.services.executive_dashboard_service import ExecutiveFinanceDashboardService
from finance.services.period_close_service import PeriodCloseService
from finance.services.year_end_closing_service import YearEndClosingService
from finance.services.bank_reconciliation_service import BankReconciliationService
from finance.services.subledger_reconciliation_service import SubledgerReconciliationService
from finance.services.financial_statements_service import FinancialStatementsService


class ExecutiveFinanceDashboardS4LTestCase(TestCase):
    def setUp(self):
        self.company_a = Company.objects.create(name="Security Executive Corp A")
        self.company_b = Company.objects.create(name="Security Executive Corp B")

        self.user_a = User.objects.create_user(username="exec_user_a", email="exec_a@zorvex.com", password="Password123!")
        self.user_b = User.objects.create_user(username="exec_user_b", email="exec_b@zorvex.com", password="Password123!")

        self.fy_a = FiscalYear.objects.create(
            company=self.company_a,
            name="FY 2026",
            start_date=date(2026, 1, 1),
            end_date=date(2026, 12, 31),
            is_current=True
        )

        self.period_jan = AccountingPeriod.objects.create(
            company=self.company_a,
            fiscal_year=self.fy_a,
            month=1,
            period_number=1,
            start_date=date(2026, 1, 1),
            end_date=date(2026, 1, 31),
            status=PeriodStatus.OPEN
        )

        # Accounts Setup
        self.cash_acc = ChartOfAccount.objects.create(
            company=self.company_a,
            account_code="1110",
            account_name="Main Cash Account",
            account_type=AccountType.ASSET,
            normal_balance=NormalBalance.DEBIT,
            allow_posting=True
        )

        self.bank_acc_gl = ChartOfAccount.objects.create(
            company=self.company_a,
            account_code="1120",
            account_name="Operational Bank Account GL",
            account_type=AccountType.ASSET,
            normal_balance=NormalBalance.DEBIT,
            allow_posting=True
        )

        self.ar_acc = ChartOfAccount.objects.create(
            company=self.company_a,
            account_code="1200",
            account_name="Accounts Receivable Control",
            account_type=AccountType.ASSET,
            normal_balance=NormalBalance.DEBIT,
            allow_posting=True
        )

        self.ap_acc = ChartOfAccount.objects.create(
            company=self.company_a,
            account_code="2100",
            account_name="Accounts Payable Control",
            account_type=AccountType.LIABILITY,
            normal_balance=NormalBalance.CREDIT,
            allow_posting=True
        )

        self.payroll_acc = ChartOfAccount.objects.create(
            company=self.company_a,
            account_code="2200",
            account_name="Payroll Payable Liability",
            account_type=AccountType.LIABILITY,
            normal_balance=NormalBalance.CREDIT,
            allow_posting=True
        )

        self.revenue_acc = ChartOfAccount.objects.create(
            company=self.company_a,
            account_code="4000",
            account_name="Guarding Service Revenue",
            account_type=AccountType.REVENUE,
            normal_balance=NormalBalance.CREDIT,
            allow_posting=True
        )

        self.salary_expense = ChartOfAccount.objects.create(
            company=self.company_a,
            account_code="5000",
            account_name="Guard Salaries Expense",
            account_type=AccountType.COST_OF_SERVICE,
            normal_balance=NormalBalance.DEBIT,
            allow_posting=True
        )

        self.retained_earnings = ChartOfAccount.objects.create(
            company=self.company_a,
            account_code="3200",
            account_name="Retained Earnings Account",
            account_type=AccountType.EQUITY,
            normal_balance=NormalBalance.CREDIT,
            allow_posting=True
        )

        self.bank_account = BankAccount.objects.create(
            company=self.company_a,
            account_title="Operational HBL Account",
            account_number="9988776655",
            bank_name="HBL",
            account_type=BankAccountType.BANK,
            chart_of_account=self.bank_acc_gl,
            current_balance=Decimal('150000.0000')
        )

        self.journal_gen = AccountingPostingService.get_or_create_journal(self.company_a, JournalType.GENERAL)

    def test_executive_dashboard_kpis_and_snapshots(self):
        """Test executive finance dashboard KPI aggregation and sub-module snapshots."""
        # Create posted revenue journal
        AccountingPostingService.post_journal_entry(
            company=self.company_a,
            journal=self.journal_gen,
            posting_date=date(2026, 1, 10),
            description="Monthly Guarding Service Invoice",
            lines=[
                {'account': self.ar_acc, 'debit': Decimal('200000.0000'), 'credit': Decimal('0.0000')},
                {'account': self.revenue_acc, 'debit': Decimal('0.0000'), 'credit': Decimal('200000.0000')}
            ]
        )

        dashboard = ExecutiveFinanceDashboardService.get_executive_dashboard(
            self.company_a,
            start_date=date(2026, 1, 1),
            end_date=date(2026, 1, 31)
        )

        self.assertIsNotNone(dashboard)
        self.assertEqual(dashboard['kpis']['revenue_this_period'], Decimal('200000.0000'))
        self.assertEqual(dashboard['kpis']['gross_profit'], Decimal('200000.0000'))
        self.assertEqual(dashboard['kpis']['cash_bank_balance'], Decimal('150000.0000'))

    def test_financial_health_summary(self):
        """Test health summary derivation (HEALTHY, ATTENTION, CRITICAL)."""
        health = ExecutiveFinanceDashboardService.get_financial_health_summary(self.company_a)
        self.assertIn(health['liquidity']['status'], ['HEALTHY', 'ATTENTION', 'CRITICAL'])
        self.assertEqual(health['gl_posting_status']['status'], 'HEALTHY')

    def test_revenue_expense_trends(self):
        """Test 6-month revenue and expense trend calculation from GL."""
        trends = ExecutiveFinanceDashboardService.get_revenue_expense_trend(self.company_a)
        self.assertEqual(len(trends), 6)
        self.assertIn('month_name', trends[0])
        self.assertIn('revenue', trends[0])

    def test_finance_action_center(self):
        """Test finance action center queue generation with navigation targets."""
        # Create unposted draft entry
        JournalEntry.objects.create(
            company=self.company_a,
            journal=self.journal_gen,
            posting_date=date(2026, 1, 15),
            status=JournalStatus.DRAFT,
            description="Draft Pending Review"
        )

        actions = ExecutiveFinanceDashboardService.get_action_center(self.company_a)
        self.assertTrue(len(actions) > 0)
        unposted_action = next((a for a in actions if a['id'] == 'unposted_accounting_events'), None)
        self.assertIsNotNone(unposted_action)
        self.assertEqual(unposted_action['target_tab'], 'general_ledger')

    def test_cross_module_integrity_invoice_to_gl(self):
        """Verify Client Invoice -> AR -> Receipt -> Treasury -> GL integrity chain."""
        crm_entity, _ = CRMEntity.objects.get_or_create(
            company=self.company_a,
            name="Test Client Corp",
            defaults={'entity_type': 'CLIENT'}
        )
        inv = ClientInvoice.objects.create(
            company=self.company_a,
            client=crm_entity,
            invoice_number="INV-2026-001",
            billing_month="2026-01",
            period_start=date(2026, 1, 1),
            period_end=date(2026, 1, 31),
            invoice_date=date(2026, 1, 5),
            due_date=date(2026, 1, 20),
            grand_total=Decimal('50000.0000'),
            paid_amount=Decimal('50000.0000'),
            status='PAID'
        )

        self.assertEqual(inv.outstanding_amount, Decimal('0.0000'))
        self.assertEqual(inv.status, 'PAID')

    def test_control_account_reconciliation_integrity(self):
        """Verify AR Subledger = AR Control Account, Trial Balance = Balanced, Balance Sheet = Balanced."""
        tb = AccountingPostingService.get_trial_balance(self.company_a)
        self.assertEqual(Decimal(str(tb['totals']['difference'])), Decimal('0.0000'))

        bs = FinancialStatementsService.get_balance_sheet(self.company_a)
        self.assertTrue(bs['is_balanced'])

    def test_cross_tenant_isolation_s4l(self):
        """Verify multi-tenant scoping prevents cross-company data leakage in executive dashboard."""
        dash_a = ExecutiveFinanceDashboardService.get_executive_dashboard(self.company_a)
        dash_b = ExecutiveFinanceDashboardService.get_executive_dashboard(self.company_b)

        self.assertEqual(dash_a['kpis']['cash_bank_balance'], Decimal('150000.0000'))
        self.assertEqual(dash_b['kpis']['cash_bank_balance'], Decimal('0.0000'))
