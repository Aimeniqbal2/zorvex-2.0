"""
test_financial_reporting_s4j.py — Phase S-4J Test Suite
Authoritative P&L, Balance Sheet, Cash Flow, Client/Contract/Site Profitability,
Overhead Allocation Profiles, Unposted Warnings, Unattributed Exceptions & Tenant Isolation.
"""
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from datetime import date, timedelta

from companies.models import Company
from django.contrib.auth import get_user_model
User = get_user_model()
from finance.models import (
    ChartOfAccount, AccountType, CashFlowCategory, JournalEntry, JournalEntryLine,
    CostCenter, ProfitCenter, AllocationProfile, AllocationMethod, AllocationTargetType
)
from crm.models import CRMEntity
from operations.models import ServiceContract, OperationalSite
from finance.services.financial_statements_service import FinancialStatementsService
from finance.services.profitability_service import ProfitabilityService


class FinancialReportingS4JTestCase(TestCase):
    def setUp(self):
        self.company_a = Company.objects.create(name="Security Alpha Corp")
        self.company_b = Company.objects.create(name="Security Beta Corp")
        self.user = User.objects.create_user(username="fin_admin", email="fin@alpha.com")

        # Accounts for Company A
        self.acc_cash = ChartOfAccount.objects.create(
            company=self.company_a, account_code='1120', account_name='Cash in Bank',
            account_type='ASSET', cash_flow_category='OPERATING', allow_posting=True
        )
        self.acc_ar = ChartOfAccount.objects.create(
            company=self.company_a, account_code='1200', account_name='Accounts Receivable',
            account_type='ASSET', is_control_account=True, allow_posting=True
        )
        self.acc_ap = ChartOfAccount.objects.create(
            company=self.company_a, account_code='2100', account_name='Accounts Payable',
            account_type='LIABILITY', is_control_account=True, allow_posting=True
        )
        self.acc_capital = ChartOfAccount.objects.create(
            company=self.company_a, account_code='3100', account_name='Share Capital',
            account_type='EQUITY', allow_posting=True
        )
        self.acc_rev_guarding = ChartOfAccount.objects.create(
            company=self.company_a, account_code='4100', account_name='Guarding Service Revenue',
            account_type='REVENUE', allow_posting=True
        )
        self.acc_rev_ot = ChartOfAccount.objects.create(
            company=self.company_a, account_code='4200', account_name='Overtime Service Revenue',
            account_type='REVENUE', allow_posting=True
        )
        self.acc_cogs_guard = ChartOfAccount.objects.create(
            company=self.company_a, account_code='5100', account_name='Guard Salaries Cost',
            account_type='COST_OF_SERVICE', allow_posting=True
        )
        self.acc_cogs_ot = ChartOfAccount.objects.create(
            company=self.company_a, account_code='5200', account_name='Employee Overtime Cost',
            account_type='COST_OF_SERVICE', allow_posting=True
        )
        self.acc_exp_ho = ChartOfAccount.objects.create(
            company=self.company_a, account_code='6100', account_name='Head Office Admin Expense',
            account_type='EXPENSE', allow_posting=True
        )

        # CRM & Operations entities
        self.client = CRMEntity.objects.create(company=self.company_a, name="Apex Logistics")
        self.contract = ServiceContract.objects.create(
            company=self.company_a, crm_entity=self.client, contract_code="SC-2026-001", start_date=date(2026, 1, 1)
        )
        self.site = OperationalSite.objects.create(
            company=self.company_a, crm_entity=self.client, name="Karachi Hub Site", address="Karachi Hub"
        )
        self.cost_center_ho = CostCenter.objects.create(
            company=self.company_a, code="HO-ADM", name="Head Office Admin", description="Administration"
        )
        # Fiscal Year & Accounting Period Setup
        from finance.models import FiscalYear, AccountingPeriod, PeriodStatus, Journal, JournalType
        self.fy_a = FiscalYear.objects.create(
            company=self.company_a, name="FY-2026", start_date=date(2026, 1, 1), end_date=date(2026, 12, 31), is_current=True
        )
        self.period_a = AccountingPeriod.objects.create(
            company=self.company_a, fiscal_year=self.fy_a, month=9, start_date=date(2026, 9, 1), end_date=date(2026, 9, 30), status=PeriodStatus.OPEN
        )
        self.journal_a = Journal.objects.create(
            company=self.company_a, name="General Journal", code="GJ", journal_type=JournalType.GENERAL, is_active=True
        )

        self.fy_b = FiscalYear.objects.create(
            company=self.company_b, name="FY-2026-B", start_date=date(2026, 1, 1), end_date=date(2026, 12, 31), is_current=True
        )
        self.period_b = AccountingPeriod.objects.create(
            company=self.company_b, fiscal_year=self.fy_b, month=9, start_date=date(2026, 9, 1), end_date=date(2026, 9, 30), status=PeriodStatus.OPEN
        )
        self.journal_b = Journal.objects.create(
            company=self.company_b, name="General Journal B", code="GJB", journal_type=JournalType.GENERAL, is_active=True
        )

    def test_pl_calculation_from_posted_gl(self):
        """1. Verifies P&L statement calculation from POSTED GL lines."""
        posting_date = date(2026, 9, 1)

        # Revenue JE: Cr Revenue 250,000, Dr AR 250,000
        je1 = JournalEntry.objects.create(
            company=self.company_a, journal=self.journal_a, entry_number="JE-REV-01", status="DRAFT",
            posting_date=posting_date, description="Client Billing"
        )
        JournalEntryLine.objects.create(
            company=self.company_a, journal_entry=je1, account=self.acc_ar,
            debit=Decimal('250000.00'), credit=Decimal('0.00'), crm_entity=self.client, contract=self.contract, site=self.site
        )
        JournalEntryLine.objects.create(
            company=self.company_a, journal_entry=je1, account=self.acc_rev_guarding,
            debit=Decimal('0.00'), credit=Decimal('200000.00'), crm_entity=self.client, contract=self.contract, site=self.site
        )
        JournalEntryLine.objects.create(
            company=self.company_a, journal_entry=je1, account=self.acc_rev_ot,
            debit=Decimal('0.00'), credit=Decimal('50000.00'), crm_entity=self.client, contract=self.contract, site=self.site
        )
        JournalEntry.objects.filter(id=je1.id).update(status="POSTED")

        # Direct Cost JE: Dr COGS 120,000, Cr AP 120,000
        je2 = JournalEntry.objects.create(
            company=self.company_a, journal=self.journal_a, entry_number="JE-COGS-01", status="DRAFT",
            posting_date=posting_date, description="Guard Payroll Cost"
        )
        JournalEntryLine.objects.create(
            company=self.company_a, journal_entry=je2, account=self.acc_cogs_guard,
            debit=Decimal('120000.00'), credit=Decimal('0.00'), crm_entity=self.client, contract=self.contract, site=self.site
        )
        JournalEntryLine.objects.create(
            company=self.company_a, journal_entry=je2, account=self.acc_ap,
            debit=Decimal('0.00'), credit=Decimal('120000.00')
        )
        JournalEntry.objects.filter(id=je2.id).update(status="POSTED")

        # Operating Expense JE: Dr Exp 30,000, Cr Bank 30,000
        je3 = JournalEntry.objects.create(
            company=self.company_a, journal=self.journal_a, entry_number="JE-EXP-01", status="DRAFT",
            posting_date=posting_date, description="HO Expense"
        )
        JournalEntryLine.objects.create(
            company=self.company_a, journal_entry=je3, account=self.acc_exp_ho,
            debit=Decimal('30000.00'), credit=Decimal('0.00'), cost_center=self.cost_center_ho
        )
        JournalEntryLine.objects.create(
            company=self.company_a, journal_entry=je3, account=self.acc_cash,
            debit=Decimal('0.00'), credit=Decimal('30000.00')
        )
        JournalEntry.objects.filter(id=je3.id).update(status="POSTED")

        pl = FinancialStatementsService.get_profit_and_loss(self.company_a, start_date=date(2026, 9, 1), end_date=date(2026, 9, 30))

        totals = pl['totals']
        self.assertEqual(totals['total_revenue'], Decimal('250000.00'))
        self.assertEqual(totals['total_cost_of_service'], Decimal('120000.00'))
        self.assertEqual(totals['gross_profit'], Decimal('130000.00'))
        self.assertEqual(totals['gross_margin_pct'], Decimal('52.00'))
        self.assertEqual(totals['total_operating_expenses'], Decimal('30000.00'))
        self.assertEqual(totals['net_profit'], Decimal('100000.00'))
        self.assertEqual(totals['net_margin_pct'], Decimal('40.00'))

        # Security Revenue Breakdown verification
        rev_breakdown = pl['security_revenue_breakdown']
        self.assertEqual(rev_breakdown['guarding_revenue'], Decimal('200000.00'))
        self.assertEqual(rev_breakdown['overtime_revenue'], Decimal('50000.00'))

    def test_balance_sheet_equation(self):
        """2. Verifies Balance Sheet equation: ASSETS = LIABILITIES + EQUITY."""
        posting_date = date(2026, 9, 1)

        # Capital Investment: Dr Cash 500,000, Cr Capital 500,000
        je1 = JournalEntry.objects.create(
            company=self.company_a, journal=self.journal_a, entry_number="JE-CAP-01", status="DRAFT", posting_date=posting_date
        )
        JournalEntryLine.objects.create(
            company=self.company_a, journal_entry=je1, account=self.acc_cash, debit=Decimal('500000.00'), credit=Decimal('0.00')
        )
        JournalEntryLine.objects.create(
            company=self.company_a, journal_entry=je1, account=self.acc_capital, debit=Decimal('0.00'), credit=Decimal('500000.00')
        )
        JournalEntry.objects.filter(id=je1.id).update(status="POSTED")

        # Revenue: Dr AR 100,000, Cr Rev 100,000
        je2 = JournalEntry.objects.create(
            company=self.company_a, journal=self.journal_a, entry_number="JE-REV-02", status="DRAFT", posting_date=posting_date
        )
        JournalEntryLine.objects.create(
            company=self.company_a, journal_entry=je2, account=self.acc_ar, debit=Decimal('100000.00'), credit=Decimal('0.00')
        )
        JournalEntryLine.objects.create(
            company=self.company_a, journal_entry=je2, account=self.acc_rev_guarding, debit=Decimal('0.00'), credit=Decimal('100000.00')
        )
        JournalEntry.objects.filter(id=je2.id).update(status="POSTED")

        # Expense: Dr COGS 40,000, Cr AP 40,000
        je3 = JournalEntry.objects.create(
            company=self.company_a, journal=self.journal_a, entry_number="JE-COGS-02", status="DRAFT", posting_date=posting_date
        )
        JournalEntryLine.objects.create(
            company=self.company_a, journal_entry=je3, account=self.acc_cogs_guard, debit=Decimal('40000.00'), credit=Decimal('0.00')
        )
        JournalEntryLine.objects.create(
            company=self.company_a, journal_entry=je3, account=self.acc_ap, debit=Decimal('0.00'), credit=Decimal('40000.00')
        )
        JournalEntry.objects.filter(id=je3.id).update(status="POSTED")

        bs = FinancialStatementsService.get_balance_sheet(self.company_a, as_of_date=posting_date)

        self.assertTrue(bs['is_balanced'])
        self.assertEqual(bs['balance_difference'], Decimal('0.0000'))
        self.assertEqual(bs['totals']['total_assets'], Decimal('600000.00'))  # Cash 500k + AR 100k
        self.assertEqual(bs['totals']['total_liabilities'], Decimal('40000.00'))  # AP 40k
        self.assertEqual(bs['equity']['current_period_profit'], Decimal('60000.00'))  # Rev 100k - COGS 40k
        self.assertEqual(bs['totals']['total_equity'], Decimal('560000.00'))  # Capital 500k + Profit 60k
        self.assertEqual(bs['totals']['total_liabilities_and_equity'], Decimal('600000.00'))

    def test_cash_flow_statement(self):
        """3. Verifies Cash Flow Statement & opening + net movement = closing."""
        posting_date = date(2026, 9, 1)

        # Cash Inflow: Dr Cash 300,000, Cr Revenue 300,000
        je1 = JournalEntry.objects.create(
            company=self.company_a, journal=self.journal_a, entry_number="JE-CF-01", status="DRAFT", posting_date=posting_date
        )
        JournalEntryLine.objects.create(
            company=self.company_a, journal_entry=je1, account=self.acc_cash, debit=Decimal('300000.00'), credit=Decimal('0.00')
        )
        JournalEntryLine.objects.create(
            company=self.company_a, journal_entry=je1, account=self.acc_rev_guarding, debit=Decimal('0.00'), credit=Decimal('300000.00')
        )
        JournalEntry.objects.filter(id=je1.id).update(status="POSTED")

        # Cash Outflow: Dr Admin Exp 50,000, Cr Cash 50,000
        je2 = JournalEntry.objects.create(
            company=self.company_a, journal=self.journal_a, entry_number="JE-CF-02", status="DRAFT", posting_date=posting_date
        )
        JournalEntryLine.objects.create(
            company=self.company_a, journal_entry=je2, account=self.acc_exp_ho, debit=Decimal('50000.00'), credit=Decimal('0.00')
        )
        JournalEntryLine.objects.create(
            company=self.company_a, journal_entry=je2, account=self.acc_cash, debit=Decimal('0.00'), credit=Decimal('50000.00')
        )
        JournalEntry.objects.filter(id=je2.id).update(status="POSTED")

        cf = FinancialStatementsService.get_cash_flow_statement(self.company_a, start_date=posting_date, end_date=posting_date)

        self.assertTrue(cf['is_reconciled'])
        self.assertEqual(cf['operating_activities']['total'], Decimal('250000.00'))
        self.assertEqual(cf['closing_cash'], Decimal('250000.00'))
        self.assertEqual(cf['actual_closing_cash'], Decimal('250000.00'))

    def test_site_profitability_and_drilldown(self):
        """4. Verifies Site Profitability layout and GL drill-down."""
        posting_date = date(2026, 9, 1)

        je1 = JournalEntry.objects.create(
            company=self.company_a, journal=self.journal_a, entry_number="JE-SITE-01", status="DRAFT", posting_date=posting_date
        )
        JournalEntryLine.objects.create(
            company=self.company_a, journal_entry=je1, account=self.acc_ar, debit=Decimal('180000.00'), credit=Decimal('0.00')
        )
        JournalEntryLine.objects.create(
            company=self.company_a, journal_entry=je1, account=self.acc_rev_guarding, debit=Decimal('0.00'), credit=Decimal('180000.00'),
            crm_entity=self.client, contract=self.contract, site=self.site
        )
        JournalEntry.objects.filter(id=je1.id).update(status="POSTED")

        je2 = JournalEntry.objects.create(
            company=self.company_a, journal=self.journal_a, entry_number="JE-SITE-02", status="DRAFT", posting_date=posting_date
        )
        JournalEntryLine.objects.create(
            company=self.company_a, journal_entry=je2, account=self.acc_cogs_guard, debit=Decimal('90000.00'), credit=Decimal('0.00'),
            crm_entity=self.client, contract=self.contract, site=self.site
        )
        JournalEntryLine.objects.create(
            company=self.company_a, journal_entry=je2, account=self.acc_ap, debit=Decimal('0.00'), credit=Decimal('90000.00')
        )
        JournalEntry.objects.filter(id=je2.id).update(status="POSTED")

        sites_prof = ProfitabilityService.get_site_profitability(self.company_a, start_date=posting_date, end_date=posting_date)

        self.assertEqual(len(sites_prof), 1)
        s_data = sites_prof[0]
        self.assertEqual(s_data['site_name'], "Karachi Hub Site")
        self.assertEqual(s_data['revenue'], Decimal('180000.00'))
        self.assertEqual(s_data['guard_salaries'], Decimal('90000.00'))
        self.assertEqual(s_data['direct_profit'], Decimal('90000.00'))
        self.assertEqual(s_data['margin_pct'], Decimal('50.00'))
        self.assertEqual(s_data['management_status'], 'PROFITABLE')

        # Drill-down test
        drilldown = ProfitabilityService.get_profitability_drilldown(self.company_a, site_id=self.site.id)
        self.assertGreaterEqual(len(drilldown), 2)
        self.assertEqual(drilldown[0]['site_name'], "Karachi Hub Site")

    def test_overhead_allocation_profiles(self):
        """5. Verifies management overhead allocation profile BY_REVENUE."""
        AllocationProfile.objects.create(
            company=self.company_a, name="HO Overhead Allocation", method=AllocationMethod.BY_REVENUE,
            target_type=AllocationTargetType.SITE, is_active=True
        )

        posting_date = date(2026, 9, 1)

        # Site Revenue 200k
        je1 = JournalEntry.objects.create(company=self.company_a, journal=self.journal_a, entry_number="JE-S1", status="DRAFT", posting_date=posting_date)
        JournalEntryLine.objects.create(company=self.company_a, journal_entry=je1, account=self.acc_rev_guarding, debit=Decimal('0.00'), credit=Decimal('200000.00'), site=self.site)
        JournalEntryLine.objects.create(company=self.company_a, journal_entry=je1, account=self.acc_ar, debit=Decimal('200000.00'), credit=Decimal('0.00'))
        JournalEntry.objects.filter(id=je1.id).update(status="POSTED")

        # Indirect HO Expense 20k (no site)
        je2 = JournalEntry.objects.create(company=self.company_a, journal=self.journal_a, entry_number="JE-S2", status="DRAFT", posting_date=posting_date)
        JournalEntryLine.objects.create(company=self.company_a, journal_entry=je2, account=self.acc_exp_ho, debit=Decimal('20000.00'), credit=Decimal('0.00'))
        JournalEntryLine.objects.create(company=self.company_a, journal_entry=je2, account=self.acc_cash, debit=Decimal('0.00'), credit=Decimal('20000.00'))
        JournalEntry.objects.filter(id=je2.id).update(status="POSTED")

        sites_prof = ProfitabilityService.get_site_profitability(self.company_a, start_date=posting_date, end_date=posting_date)

        self.assertEqual(len(sites_prof), 1)
        s_data = sites_prof[0]
        self.assertEqual(s_data['revenue'], Decimal('200000.00'))
        self.assertEqual(s_data['allocated_ho_overhead'], Decimal('20000.00'))
        self.assertEqual(s_data['net_site_contribution'], Decimal('180000.00'))

    def test_unposted_items_warning_and_unattributed_lines(self):
        """6. Verifies unposted items warning and unattributed exceptions report."""
        # Unposted draft entry
        JournalEntry.objects.create(company=self.company_a, journal=self.journal_a, entry_number="JE-DRAFT-99", status="DRAFT", posting_date=date(2026, 9, 1))

        # Posted line missing site/contract/client dimensions on REVENUE account
        je = JournalEntry.objects.create(company=self.company_a, journal=self.journal_a, entry_number="JE-POSTED-99", status="DRAFT", posting_date=date(2026, 9, 1))
        JournalEntryLine.objects.create(company=self.company_a, journal_entry=je, account=self.acc_rev_guarding, debit=Decimal('0.00'), credit=Decimal('50000.00'))
        JournalEntryLine.objects.create(company=self.company_a, journal_entry=je, account=self.acc_ar, debit=Decimal('50000.00'), credit=Decimal('0.00'))
        JournalEntry.objects.filter(id=je.id).update(status="POSTED")

        pl = FinancialStatementsService.get_profit_and_loss(self.company_a, start_date=date(2026, 9, 1), end_date=date(2026, 9, 30))
        self.assertTrue(pl['has_unposted_items'])
        self.assertIn('Unposted financial events exist', pl['unposted_warning'])

        exceptions = ProfitabilityService.get_unattributed_financial_lines(self.company_a, start_date=date(2026, 9, 1), end_date=date(2026, 9, 30))
        self.assertGreaterEqual(len(exceptions), 1)
        self.assertEqual(exceptions[0]['exception_type'], 'UNASSIGNED_REVENUE')
        self.assertEqual(exceptions[0]['amount'], Decimal('50000.00'))

    def test_cross_tenant_isolation(self):
        """7. Verifies multi-tenant isolation for statements and profitability."""
        posting_date = date(2026, 9, 1)

        # Company B entry
        acc_b_rev = ChartOfAccount.objects.create(company=self.company_b, account_code='4100', account_name='Beta Revenue', account_type='REVENUE', allow_posting=True)
        acc_b_ar = ChartOfAccount.objects.create(company=self.company_b, account_code='1200', account_name='Beta AR', account_type='ASSET', allow_posting=True)
        je_b = JournalEntry.objects.create(company=self.company_b, journal=self.journal_b, entry_number="JE-B-01", status="DRAFT", posting_date=posting_date)
        JournalEntryLine.objects.create(company=self.company_b, journal_entry=je_b, account=acc_b_rev, debit=Decimal('0.00'), credit=Decimal('999000.00'))
        JournalEntryLine.objects.create(company=self.company_b, journal_entry=je_b, account=acc_b_ar, debit=Decimal('999000.00'), credit=Decimal('0.00'))
        JournalEntry.objects.filter(id=je_b.id).update(status="POSTED")

        # Query Company A P&L and Profitability
        pl_a = FinancialStatementsService.get_profit_and_loss(self.company_a, start_date=posting_date, end_date=posting_date)
        prof_a = ProfitabilityService.get_client_profitability(self.company_a, start_date=posting_date, end_date=posting_date)

        # Ensure Company B revenue (999,000) does not leak into Company A
        self.assertEqual(pl_a['totals']['total_revenue'], Decimal('0.0000'))
        for item in prof_a:
            self.assertNotEqual(item['revenue'], Decimal('999000.00'))
