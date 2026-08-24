"""
reports/tests/test_phase8e1.py

Phase 8E-1 — Universal Reporting Modules Comprehensive Test Suite
Targeting 30+ unit tests covering:
- Financial Statements (Trial Balance, P&L, Balance Sheet)
- HR Analytics (Workforce Utilization, Payroll Summary)
- Operations Metrics (Contract Profitability, Performance)
- Supply Chain (Inventory Valuation, Low Stock, Vendor Spend, Cycle Time)
- CRM Analytics (CLV, Lead Breakdown)
- Universal Export Layer (JSON & CSV)
- API Endpoints, RBAC, Tenant Isolation, and Date Validation
- Explicit Data-Authority Proofs
"""
from decimal import Decimal
from datetime import date, datetime, timedelta
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from companies.models import Company
from platform_core.models import Warehouse, ModuleDefinition, CompanyModule
from finance.models import (
    Currency, FiscalYear, AccountingPeriod, Journal, JournalEntry,
    JournalEntryLine, AccountGroup, ChartOfAccount
)
from hrm.models import (
    Department, Designation, Position, Employee, Employment, Shift,
    WorkforceAttendance, PayrollPeriod, PayrollRun, Payslip, PayslipLine, SalaryComponent
)
from operations.models import (
    OperationalSite, ServiceContract, ContractRate, Deployment, DutyAssignment, ExtraDuty
)
from inventory.models import Category, Item, InventoryBalance
from purchasing.models import ProcurementDocument, ProcurementLine, ProcurementAuditTrail
from crm.models import CRMEntity
from billing.models import ServiceInvoice, ServiceInvoiceLine

from reports.services import (
    FinancialStatementsReportingService,
    HRAnalyticsReportingService,
    OperationsMetricsReportingService,
    SupplyChainReportingService,
    CRMAnalyticsReportingService,
    UniversalExportService,
)

User = get_user_model()


class Phase8E1UniversalReportingTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.company_a = Company.objects.create(name="Company A")
        cls.company_b = Company.objects.create(name="Company B")

        cls.admin_a = User.objects.create_user(username="admin_a", password="password", company=cls.company_a, role="admin")
        cls.staff_a = User.objects.create_user(username="staff_a", password="password", company=cls.company_a, role="cashier")
        cls.admin_b = User.objects.create_user(username="admin_b", password="password", company=cls.company_b, role="admin")

        # Enable reports module
        reports_mod, _ = ModuleDefinition.objects.get_or_create(code='reports', defaults={'name': 'Reports', 'is_active': True})
        CompanyModule.objects.create(company=cls.company_a, module=reports_mod, enabled=True)
        CompanyModule.objects.create(company=cls.company_b, module=reports_mod, enabled=True)

        # Finance Setup - Company A
        cls.curr_a = Currency.objects.create(company=cls.company_a, code="USD", name="US Dollar", symbol="$")
        cls.fy_a = FiscalYear.objects.create(company=cls.company_a, name="2026", start_date=date(2026, 1, 1), end_date=date(2026, 12, 31))
        cls.period_a = AccountingPeriod.objects.create(company=cls.company_a, fiscal_year=cls.fy_a, month=8, start_date=date(2026, 8, 1), end_date=date(2026, 8, 31), status='OPEN')
        cls.journal_a = Journal.objects.create(company=cls.company_a, code="GEN", name="General", journal_type="GENERAL")

        # Account Groups A
        cls.ag_asset_a = AccountGroup.objects.create(company=cls.company_a, name="Assets", group_type="ASSET")
        cls.ag_liab_a = AccountGroup.objects.create(company=cls.company_a, name="Liabilities", group_type="LIABILITY")
        cls.ag_eq_a = AccountGroup.objects.create(company=cls.company_a, name="Equity", group_type="EQUITY")
        cls.ag_inc_a = AccountGroup.objects.create(company=cls.company_a, name="Income", group_type="INCOME")
        cls.ag_exp_a = AccountGroup.objects.create(company=cls.company_a, name="Expense", group_type="EXPENSE")
        cls.ag_cos_a = AccountGroup.objects.create(company=cls.company_a, name="Cost of Sales", group_type="COST_OF_SALES")

        # Accounts A
        cls.acc_cash_a = ChartOfAccount.objects.create(company=cls.company_a, account_group=cls.ag_asset_a, account_code="1000", account_name="Cash", account_type="ASSET", currency=cls.curr_a)
        cls.acc_ar_a = ChartOfAccount.objects.create(company=cls.company_a, account_group=cls.ag_asset_a, account_code="1100", account_name="AR", account_type="ASSET", currency=cls.curr_a)
        cls.acc_ap_a = ChartOfAccount.objects.create(company=cls.company_a, account_group=cls.ag_liab_a, account_code="2000", account_name="AP", account_type="LIABILITY", currency=cls.curr_a)
        cls.acc_cap_a = ChartOfAccount.objects.create(company=cls.company_a, account_group=cls.ag_eq_a, account_code="3000", account_name="Capital", account_type="EQUITY", currency=cls.curr_a)
        cls.acc_rev_a = ChartOfAccount.objects.create(company=cls.company_a, account_group=cls.ag_inc_a, account_code="4000", account_name="Sales Revenue", account_type="INCOME", currency=cls.curr_a)
        cls.acc_cost_a = ChartOfAccount.objects.create(company=cls.company_a, account_group=cls.ag_cos_a, account_code="5000", account_name="COGS", account_type="COST_OF_SALES", currency=cls.curr_a)
        cls.acc_exp_a = ChartOfAccount.objects.create(company=cls.company_a, account_group=cls.ag_exp_a, account_code="6000", account_name="Operating Expense", account_type="EXPENSE", currency=cls.curr_a)

        # CRM Customer
        cls.crm_customer = CRMEntity.objects.create(company=cls.company_a, name="Acme Corp", code="CRM-ACME", entity_type="CUSTOMER")
        cls.crm_vendor = CRMEntity.objects.create(company=cls.company_a, name="Global Supplies", code="CRM-GLOB", entity_type="SUPPLIER")

        # Inventory & Warehouse
        cls.warehouse_a = Warehouse.objects.create(company=cls.company_a, name="Main Warehouse", code="WH-01")
        cls.category_a = Category.objects.create(company=cls.company_a, name="Electronics")
        cls.item_a = Item.objects.create(
            company=cls.company_a, name="Widget Alpha", sku="SKU-WIDGET-A", category=cls.category_a,
            cost_price=Decimal("50.00"), selling_price=Decimal("100.00"), minimum_stock_level=Decimal("10.00"), reorder_level=Decimal("20.00")
        )
        cls.item_balance_a = InventoryBalance.objects.create(
            company=cls.company_a, item=cls.item_a, warehouse=cls.warehouse_a, quantity=Decimal("15.00")
        )

        # HR Setup
        cls.dept_a = Department.objects.create(company=cls.company_a, name="Operations")
        cls.desig_a = Designation.objects.create(company=cls.company_a, name="Security Officer")
        cls.emp_a = Employee.objects.create(
            company=cls.company_a, first_name="John", last_name="Doe", department=cls.dept_a, designation=cls.desig_a
        )
        cls.attendance_a = WorkforceAttendance.objects.create(
            company=cls.company_a, employee=cls.emp_a, date=date(2026, 8, 10),
            check_in=timezone.make_aware(datetime(2026, 8, 10, 8, 0)),
            check_out=timezone.make_aware(datetime(2026, 8, 10, 16, 0)),
            status="PRESENT"
        )

        # Payroll Setup
        cls.payroll_period_a = PayrollPeriod.objects.create(
            company=cls.company_a, name="August 2026", start_date=date(2026, 8, 1), end_date=date(2026, 8, 31), payment_date=date(2026, 8, 31)
        )
        cls.payroll_run_a = PayrollRun.objects.create(company=cls.company_a, payroll_period=cls.payroll_period_a, run_number="PR-202608")
        cls.salary_comp_a = SalaryComponent.objects.create(company=cls.company_a, name="Basic Salary", code="BASIC", component_type="EARNING")
        cls.salary_assign_a = cls._create_salary_assignment(cls.emp_a)
        cls.payslip_a = Payslip.objects.create(
            company=cls.company_a, payroll_run=cls.payroll_run_a, employee=cls.emp_a, salary_assignment=cls.salary_assign_a,
            currency=cls.curr_a, gross_amount=Decimal("1000.00"), tax_amount=Decimal("100.00"), deduction_amount=Decimal("50.00"), net_amount=Decimal("850.00")
        )
        cls.payslip_line_a = PayslipLine.objects.create(
            company=cls.company_a, payslip=cls.payslip_a, salary_component=cls.salary_comp_a, component_type="EARNING", amount=Decimal("1000.00")
        )

        # Operations Setup
        cls.site_a = OperationalSite.objects.create(company=cls.company_a, crm_entity=cls.crm_customer, name="Site Alpha", address="123 Street")
        cls.contract_a = ServiceContract.objects.create(
            company=cls.company_a, crm_entity=cls.crm_customer, contract_code="SC-001", start_date=date(2026, 1, 1), status="ACTIVE"
        )
        cls.contract_a.sites.add(cls.site_a)

        cls.contract_rate_a = ContractRate.objects.create(
            company=cls.company_a, service_contract=cls.contract_a, designation=cls.desig_a, billing_rate=Decimal("25.00"), pay_rate=Decimal("15.00"), effective_date=date(2026, 1, 1)
        )
        cls.deployment_a = Deployment.objects.create(
            company=cls.company_a, employee=cls.emp_a, site=cls.site_a, service_contract=cls.contract_a, designation=cls.desig_a, start_date=date(2026, 1, 1), status="ACTIVE"
        )
        cls.duty_a = DutyAssignment.objects.create(
            company=cls.company_a, deployment=cls.deployment_a, employee=cls.emp_a, site=cls.site_a,
            date=date(2026, 8, 10), start_time=datetime.strptime("08:00", "%H:%M").time(), end_time=datetime.strptime("16:00", "%H:%M").time(), status="COMPLETED"
        )

        # Billing Invoice Setup
        cls.service_invoice_a = ServiceInvoice.objects.create(
            company=cls.company_a, service_contract=cls.contract_a, crm_entity=cls.crm_customer, invoice_number="INV-001",
            period_start=date(2026, 8, 1), period_end=date(2026, 8, 31), total_amount=Decimal("500.00"), status="POSTED"
        )

        # Procurement Setup
        cls.proc_doc_a = ProcurementDocument.objects.create(
            company=cls.company_a, document_type="PURCHASE_ORDER", number="PO-001", document_date=date(2026, 8, 5),
            total_amount=Decimal("1500.00"), crm_entity=cls.crm_vendor, status="RECEIVED"
        )
        cls.audit_submit = ProcurementAuditTrail.objects.create(company=cls.company_a, document=cls.proc_doc_a, event="SUBMITTED")
        cls.audit_approve = ProcurementAuditTrail.objects.create(company=cls.company_a, document=cls.proc_doc_a, event="APPROVED")
        cls.audit_receive = ProcurementAuditTrail.objects.create(company=cls.company_a, document=cls.proc_doc_a, event="RECEIVED")

        # Update auto_now_add timestamps explicitly
        ProcurementAuditTrail.objects.filter(id=cls.audit_submit.id).update(created_at=timezone.make_aware(datetime(2026, 8, 5, 10, 0)))
        ProcurementAuditTrail.objects.filter(id=cls.audit_approve.id).update(created_at=timezone.make_aware(datetime(2026, 8, 5, 12, 0)))
        ProcurementAuditTrail.objects.filter(id=cls.audit_receive.id).update(created_at=timezone.make_aware(datetime(2026, 8, 6, 12, 0)))

    @classmethod
    def _create_salary_assignment(cls, employee):
        from hrm.models import SalaryStructure, EmployeeSalaryAssignment
        struct = SalaryStructure.objects.create(company=cls.company_a, name="Standard", code="STD", currency=cls.curr_a, effective_from=date(2026, 1, 1))
        return EmployeeSalaryAssignment.objects.create(
            company=cls.company_a, employee=employee, salary_structure=struct, currency=cls.curr_a, base_salary=Decimal("1000.00"), effective_from=date(2026, 1, 1)
        )

    def _create_journal_entry(self, company, journal, entry_date, lines, status='POSTED', crm_entity=None):
        je = JournalEntry.objects.create(
            company=company, journal=journal, entry_number=f"JE-{company.id}-{JournalEntry.objects.count()}",
            entry_date=entry_date, status=status
        )
        for line in lines:
            JournalEntryLine.objects.create(
                company=company, journal_entry=je, account=line['account'],
                debit=line.get('debit', 0), credit=line.get('credit', 0),
                currency=line.get('currency', self.curr_a), crm_entity=crm_entity
            )
        return je

    # ============================================================================
    # FINANCIAL STATEMENTS TESTS (1 - 10)
    # ============================================================================

    def test_01_trial_balance_balanced(self):
        service = FinancialStatementsReportingService(company_id=self.company_a.id)
        self._create_journal_entry(
            self.company_a, self.journal_a, date(2026, 8, 15),
            [
                {'account': self.acc_cash_a, 'debit': Decimal('1000.00')},
                {'account': self.acc_cap_a, 'credit': Decimal('1000.00')},
            ]
        )
        tb = service.get_trial_balance(as_of_date=date(2026, 8, 31))
        self.assertTrue(tb['is_balanced'])
        self.assertEqual(tb['total_debit'], 1000.0)
        self.assertEqual(tb['total_credit'], 1000.0)

    def test_02_trial_balance_posted_only(self):
        service = FinancialStatementsReportingService(company_id=self.company_a.id)
        self._create_journal_entry(
            self.company_a, self.journal_a, date(2026, 8, 15),
            [
                {'account': self.acc_cash_a, 'debit': Decimal('500.00')},
                {'account': self.acc_cap_a, 'credit': Decimal('500.00')},
            ],
            status='DRAFT'
        )
        tb = service.get_trial_balance(as_of_date=date(2026, 8, 31))
        self.assertEqual(tb['total_debit'], 0.0)

    def test_03_trial_balance_as_of_date(self):
        service = FinancialStatementsReportingService(company_id=self.company_a.id)
        self._create_journal_entry(
            self.company_a, self.journal_a, date(2026, 8, 10),
            [{'account': self.acc_cash_a, 'debit': Decimal('100.00')}, {'account': self.acc_cap_a, 'credit': Decimal('100.00')}]
        )
        self._create_journal_entry(
            self.company_a, self.journal_a, date(2026, 8, 25),
            [{'account': self.acc_cash_a, 'debit': Decimal('200.00')}, {'account': self.acc_cap_a, 'credit': Decimal('200.00')}]
        )
        tb_early = service.get_trial_balance(as_of_date=date(2026, 8, 15))
        self.assertEqual(tb_early['total_debit'], 100.0)

        tb_late = service.get_trial_balance(as_of_date=date(2026, 8, 31))
        self.assertEqual(tb_late['total_debit'], 300.0)

    def test_04_trial_balance_company_isolation(self):
        service_a = FinancialStatementsReportingService(company_id=self.company_a.id)
        service_b = FinancialStatementsReportingService(company_id=self.company_b.id)

        self._create_journal_entry(
            self.company_a, self.journal_a, date(2026, 8, 15),
            [{'account': self.acc_cash_a, 'debit': Decimal('400.00')}, {'account': self.acc_cap_a, 'credit': Decimal('400.00')}]
        )

        tb_a = service_a.get_trial_balance()
        tb_b = service_b.get_trial_balance()

        self.assertEqual(tb_a['total_debit'], 400.0)
        self.assertEqual(tb_b['total_debit'], 0.0)

    def test_05_pnl_calculation(self):
        service = FinancialStatementsReportingService(company_id=self.company_a.id)
        # Revenue: 1000, Expense: 300
        self._create_journal_entry(
            self.company_a, self.journal_a, date(2026, 8, 15),
            [{'account': self.acc_cash_a, 'debit': Decimal('1000.00')}, {'account': self.acc_rev_a, 'credit': Decimal('1000.00')}]
        )
        self._create_journal_entry(
            self.company_a, self.journal_a, date(2026, 8, 16),
            [{'account': self.acc_exp_a, 'debit': Decimal('300.00')}, {'account': self.acc_cash_a, 'credit': Decimal('300.00')}]
        )
        pnl = service.get_profit_and_loss(start_date=date(2026, 8, 1), end_date=date(2026, 8, 31))
        self.assertEqual(pnl['revenue'], 1000.0)
        self.assertEqual(pnl['expenses'], 300.0)
        self.assertEqual(pnl['net_profit'], 700.0)

    def test_06_pnl_date_filtering(self):
        service = FinancialStatementsReportingService(company_id=self.company_a.id)
        self._create_journal_entry(
            self.company_a, self.journal_a, date(2026, 7, 15),
            [{'account': self.acc_cash_a, 'debit': Decimal('500.00')}, {'account': self.acc_rev_a, 'credit': Decimal('500.00')}]
        )
        pnl_aug = service.get_profit_and_loss(start_date=date(2026, 8, 1), end_date=date(2026, 8, 31))
        self.assertEqual(pnl_aug['revenue'], 0.0)

    def test_07_pnl_cost_of_sales_and_other_expense(self):
        service = FinancialStatementsReportingService(company_id=self.company_a.id)
        self._create_journal_entry(
            self.company_a, self.journal_a, date(2026, 8, 15),
            [{'account': self.acc_cash_a, 'debit': Decimal('1000.00')}, {'account': self.acc_rev_a, 'credit': Decimal('1000.00')}]
        )
        self._create_journal_entry(
            self.company_a, self.journal_a, date(2026, 8, 16),
            [{'account': self.acc_cost_a, 'debit': Decimal('400.00')}, {'account': self.acc_cash_a, 'credit': Decimal('400.00')}]
        )
        pnl = service.get_profit_and_loss(start_date=date(2026, 8, 1), end_date=date(2026, 8, 31))
        self.assertEqual(pnl['gross_profit'], 600.0)
        self.assertEqual(pnl['net_profit'], 600.0)

    def test_08_balance_sheet_equation(self):
        service = FinancialStatementsReportingService(company_id=self.company_a.id)
        self._create_journal_entry(
            self.company_a, self.journal_a, date(2026, 8, 15),
            [{'account': self.acc_cash_a, 'debit': Decimal('1000.00')}, {'account': self.acc_cap_a, 'credit': Decimal('1000.00')}]
        )
        bs = service.get_balance_sheet(as_of_date=date(2026, 8, 31))
        self.assertTrue(bs['is_balanced'])
        self.assertEqual(bs['total_assets'], 1000.0)
        self.assertEqual(bs['total_equity'], 1000.0)

    def test_09_balance_sheet_retained_earnings(self):
        service = FinancialStatementsReportingService(company_id=self.company_a.id)
        # Revenue: 1000 -> Cash: +1000, Revenue: +1000
        self._create_journal_entry(
            self.company_a, self.journal_a, date(2026, 8, 15),
            [{'account': self.acc_cash_a, 'debit': Decimal('1000.00')}, {'account': self.acc_rev_a, 'credit': Decimal('1000.00')}]
        )
        bs = service.get_balance_sheet(as_of_date=date(2026, 8, 31))
        self.assertTrue(bs['is_balanced'])
        self.assertEqual(bs['equity']['retained_earnings'], 1000.0)
        self.assertEqual(bs['total_assets'], 1000.0)
        self.assertEqual(bs['total_equity'], 1000.0)

    def test_10_balance_sheet_as_of_date(self):
        service = FinancialStatementsReportingService(company_id=self.company_a.id)
        self._create_journal_entry(
            self.company_a, self.journal_a, date(2026, 8, 10),
            [{'account': self.acc_cash_a, 'debit': Decimal('500.00')}, {'account': self.acc_cap_a, 'credit': Decimal('500.00')}]
        )
        self._create_journal_entry(
            self.company_a, self.journal_a, date(2026, 8, 20),
            [{'account': self.acc_cash_a, 'debit': Decimal('500.00')}, {'account': self.acc_cap_a, 'credit': Decimal('500.00')}]
        )
        bs_early = service.get_balance_sheet(as_of_date=date(2026, 8, 15))
        self.assertEqual(bs_early['total_assets'], 500.0)

        bs_late = service.get_balance_sheet(as_of_date=date(2026, 8, 31))
        self.assertEqual(bs_late['total_assets'], 1000.0)

    # ============================================================================
    # HR ANALYTICS TESTS (11 - 14)
    # ============================================================================

    def test_11_workforce_utilization(self):
        service = HRAnalyticsReportingService(company_id=self.company_a.id)
        res = service.get_workforce_utilization(start_date=date(2026, 8, 1), end_date=date(2026, 8, 31))
        self.assertEqual(res['total_scheduled_hours'], 8.0)
        self.assertEqual(res['total_actual_hours'], 8.0)
        self.assertEqual(res['overall_utilization_percentage'], 100.0)

    def test_12_workforce_utilization_grouping(self):
        service = HRAnalyticsReportingService(company_id=self.company_a.id)
        res_emp = service.get_workforce_utilization(start_date=date(2026, 8, 1), end_date=date(2026, 8, 31), group_by='employee')
        self.assertTrue(len(res_emp['breakdown']) > 0)
        self.assertIn('John Doe', res_emp['breakdown'][0]['label'])

    def test_13_payroll_summary(self):
        service = HRAnalyticsReportingService(company_id=self.company_a.id)
        res = service.get_payroll_summary(start_date=date(2026, 8, 1), end_date=date(2026, 8, 31))
        self.assertEqual(res['gross_payroll'], 1000.0)
        self.assertEqual(res['tax'], 100.0)
        self.assertEqual(res['net_payroll'], 850.0)
        self.assertEqual(len(res['components_breakdown']), 1)

    def test_14_payroll_summary_date_filtering(self):
        service = HRAnalyticsReportingService(company_id=self.company_a.id)
        res = service.get_payroll_summary(start_date=date(2026, 9, 1), end_date=date(2026, 9, 30))
        self.assertEqual(res['gross_payroll'], 0.0)

    # ============================================================================
    # OPERATIONS METRICS TESTS (15 - 16)
    # ============================================================================

    def test_15_contract_profitability(self):
        service = OperationsMetricsReportingService(company_id=self.company_a.id)
        res = service.get_contract_profitability(start_date=date(2026, 8, 1), end_date=date(2026, 8, 31))
        self.assertEqual(res['total_revenue'], 500.0)
        # Completed duty hours = 8.0, pay_rate = 15.0 => estimated cost = 120.0
        self.assertEqual(res['total_estimated_cost'], 120.0)
        self.assertEqual(res['total_profit'], 380.0)

    def test_16_operations_performance_metrics(self):
        service = OperationsMetricsReportingService(company_id=self.company_a.id)
        res = service.get_operations_performance(start_date=date(2026, 8, 1), end_date=date(2026, 8, 31))
        self.assertEqual(res['active_sites'], 1)
        self.assertEqual(res['active_deployments'], 1)
        self.assertEqual(res['completed_duties'], 1)
        self.assertEqual(res['scheduled_hours'], 8.0)

    # ============================================================================
    # SUPPLY CHAIN TESTS (17 - 20)
    # ============================================================================

    def test_17_inventory_valuation_universal_item(self):
        service = SupplyChainReportingService(company_id=self.company_a.id)
        res = service.get_inventory_valuation()
        self.assertEqual(res['total_items'], 1)
        self.assertEqual(res['total_quantity'], 15.0)
        # 15 * 50.00 = 750.00
        self.assertEqual(res['total_valuation'], 750.0)

    def test_18_inventory_low_stock_report_reorder_level(self):
        service = SupplyChainReportingService(company_id=self.company_a.id)
        # Item stock is 15. Reorder level is 20. Should trigger low stock shortage of 5.
        res = service.get_low_stock_report()
        self.assertEqual(res['total_low_stock_items'], 1)
        self.assertEqual(res['low_stock_items'][0]['shortage'], 5.0)

    def test_19_vendor_spend_analytics(self):
        service = SupplyChainReportingService(company_id=self.company_a.id)
        res = service.get_vendor_spend(start_date=date(2026, 8, 1), end_date=date(2026, 8, 31))
        self.assertEqual(res['total_vendors'], 1)
        self.assertEqual(res['overall_total_spend'], 1500.0)

    def test_20_procurement_cycle_time(self):
        service = SupplyChainReportingService(company_id=self.company_a.id)
        res = service.get_procurement_cycle_time(start_date=date(2026, 8, 1), end_date=date(2026, 8, 31))
        self.assertEqual(res['total_documents_analyzed'], 1)
        # SUBMITTED (10:00) -> APPROVED (12:00) = 2.0 hours
        self.assertEqual(res['avg_submission_to_approval_hours'], 2.0)
        # APPROVED (12:00 5th) -> RECEIVED (12:00 6th) = 24.0 hours
        self.assertEqual(res['avg_approval_to_receipt_hours'], 24.0)

    # ============================================================================
    # CRM ANALYTICS TESTS (21 - 22)
    # ============================================================================

    def test_21_customer_lifetime_value(self):
        service = CRMAnalyticsReportingService(company_id=self.company_a.id)
        # Create posted revenue entry linked to crm_customer
        self._create_journal_entry(
            self.company_a, self.journal_a, date(2026, 8, 15),
            [{'account': self.acc_cash_a, 'debit': Decimal('2500.00')}, {'account': self.acc_rev_a, 'credit': Decimal('2500.00')}],
            crm_entity=self.crm_customer
        )
        res = service.get_customer_lifetime_value()
        self.assertEqual(res['total_customers'], 1)
        self.assertEqual(res['overall_lifetime_value'], 2500.0)
        self.assertEqual(res['customers'][0]['customer_name'], "Acme Corp")

    def test_22_lead_conversion_report(self):
        service = CRMAnalyticsReportingService(company_id=self.company_a.id)
        CRMEntity.objects.create(company=self.company_a, name="Lead 1", code="LEAD-01", entity_type="LEAD")
        res = service.get_lead_conversion_report()
        self.assertTrue(res['total_entities'] >= 3)
        self.assertEqual(res['lead_count'], 1)

    # ============================================================================
    # UNIVERSAL EXPORT LAYER TESTS (23 - 24)
    # ============================================================================

    def test_23_universal_export_csv(self):
        data = [{'code': '1000', 'name': 'Cash', 'amount': 100.0}]
        resp = UniversalExportService.export_csv_from_dicts(data, filename_prefix="test_report")
        self.assertEqual(resp['Content-Type'], 'text/csv; charset=utf-8')
        content = resp.content.decode('utf-8')
        self.assertIn('code,name,amount', content)
        self.assertIn('1000,Cash,100.0', content)

    def test_24_universal_export_json(self):
        data = {'title': 'Test Report', 'total': 500.0}
        resp = UniversalExportService.export_json(data, filename_prefix="test_report")
        self.assertEqual(resp['Content-Type'], 'application/json')
        content = resp.content.decode('utf-8')
        self.assertIn('Test Report', content)

    # ============================================================================
    # API ENDPOINTS & RBAC TESTS (25 - 30)
    # ============================================================================

    def test_25_api_trial_balance_rbac_admin_success(self):
        client = APIClient()
        client.force_authenticate(user=self.admin_a)
        resp = client.get('/api/reports/finance/trial-balance/')
        self.assertEqual(resp.status_code, 200)

    def test_26_api_trial_balance_rbac_regular_user_forbidden(self):
        client = APIClient()
        client.force_authenticate(user=self.staff_a)
        resp = client.get('/api/reports/finance/trial-balance/')
        self.assertEqual(resp.status_code, 403)

    def test_27_api_pnl_date_validation_error(self):
        client = APIClient()
        client.force_authenticate(user=self.admin_a)
        resp = client.get('/api/reports/finance/pnl/?start_date=2026-08-31&end_date=2026-08-01')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('start_date cannot be after end_date', str(resp.data))

    def test_28_api_workforce_utilization_endpoint(self):
        client = APIClient()
        client.force_authenticate(user=self.admin_a)
        resp = client.get('/api/reports/hr/workforce-utilization/')
        self.assertEqual(resp.status_code, 200)

    def test_29_api_inventory_valuation_endpoint(self):
        client = APIClient()
        client.force_authenticate(user=self.admin_a)
        resp = client.get('/api/reports/inventory/valuation/')
        self.assertEqual(resp.status_code, 200)

    def test_30_api_export_csv_endpoint(self):
        client = APIClient()
        client.force_authenticate(user=self.admin_a)
        resp = client.get('/api/reports/export/?type=inventory_valuation')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp['Content-Type'], 'text/csv; charset=utf-8')

    # ============================================================================
    # DATA-AUTHORITY VALIDATION TESTS (31 - 35)
    # ============================================================================

    def test_31_data_authority_financial_revenue(self):
        service = FinancialStatementsReportingService(company_id=self.company_a.id)
        self._create_journal_entry(
            self.company_a, self.journal_a, date(2026, 8, 15),
            [{'account': self.acc_cash_a, 'debit': Decimal('1234.00')}, {'account': self.acc_rev_a, 'credit': Decimal('1234.00')}]
        )
        pnl = service.get_profit_and_loss(start_date=date(2026, 8, 1), end_date=date(2026, 8, 31))
        self.assertEqual(pnl['revenue'], 1234.0)

    def test_32_data_authority_financial_profit(self):
        service = FinancialStatementsReportingService(company_id=self.company_a.id)
        self._create_journal_entry(
            self.company_a, self.journal_a, date(2026, 8, 15),
            [{'account': self.acc_cash_a, 'debit': Decimal('1000.00')}, {'account': self.acc_rev_a, 'credit': Decimal('1000.00')}]
        )
        self._create_journal_entry(
            self.company_a, self.journal_a, date(2026, 8, 16),
            [{'account': self.acc_exp_a, 'debit': Decimal('400.00')}, {'account': self.acc_cash_a, 'credit': Decimal('400.00')}]
        )
        pnl = service.get_profit_and_loss(start_date=date(2026, 8, 1), end_date=date(2026, 8, 31))
        self.assertEqual(pnl['net_profit'], 600.0)

    def test_33_data_authority_crm_customer_revenue(self):
        service = CRMAnalyticsReportingService(company_id=self.company_a.id)
        self._create_journal_entry(
            self.company_a, self.journal_a, date(2026, 8, 15),
            [{'account': self.acc_cash_a, 'debit': Decimal('999.00')}, {'account': self.acc_rev_a, 'credit': Decimal('999.00')}],
            crm_entity=self.crm_customer
        )
        clv = service.get_customer_lifetime_value()
        self.assertEqual(clv['customers'][0]['total_revenue'], 999.0)

    def test_34_data_authority_inventory_balance(self):
        service = SupplyChainReportingService(company_id=self.company_a.id)
        valuation = service.get_inventory_valuation()
        self.assertEqual(valuation['total_valuation'], 750.0)

    def test_35_data_authority_payroll_payslip(self):
        service = HRAnalyticsReportingService(company_id=self.company_a.id)
        payroll = service.get_payroll_summary(start_date=date(2026, 8, 1), end_date=date(2026, 8, 31))
        self.assertEqual(payroll['gross_payroll'], 1000.0)
        self.assertEqual(payroll['net_payroll'], 850.0)
