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
    Currency, AccountingPeriod, FiscalYear, SalesAccountingConfiguration
)
from billing.models import (
    BillingAccountingConfiguration, ServiceInvoice, ServiceInvoiceStatus, ServiceInvoicePaymentStatus
)
from operations.models import ServiceContract, ServiceContractStatus
from crm.models import CRMEntity
from reports.services.accounts_receivable import (
    CustomerBalanceService, CustomerStatementService, ARAgingService, ARReconciliationService
)
from reports.services.export import UniversalExportService

User = get_user_model()


class Phase8E2B2ARReportingTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        # 1. Company & User Setup
        cls.company_a = Company.objects.create(name="Company A")
        cls.company_b = Company.objects.create(name="Company B")
        
        from platform_core.models import ModuleDefinition
        from platform_core.services import enable_module
        
        mod, _ = ModuleDefinition.objects.get_or_create(code='reports', defaults={'name': 'Reports', 'is_active': True})
        enable_module(cls.company_a, 'reports')
        enable_module(cls.company_b, 'reports')

        cls.admin_user_a = User.objects.create_user(
            username="admin_a", email="admin_a@companya.com", password="pwd", company=cls.company_a, role="admin", is_active=True
        )
        cls.employee_user_a = User.objects.create_user(
            username="emp_a", email="emp_a@companya.com", password="pwd", company=cls.company_a, role="employee", is_active=True
        )
        cls.admin_user_b = User.objects.create_user(
            username="admin_b", email="admin_b@companyb.com", password="pwd", company=cls.company_b, role="admin", is_active=True
        )

        # 2. Currency
        cls.currency = Currency.objects.create(
            company=cls.company_a, code="PKR", name="Pakistani Rupee", is_base_currency=True
        )

        # 3. Fiscal Year & Period
        today = date.today()
        cls.fy = FiscalYear.objects.create(
            company=cls.company_a, name=str(today.year), start_date=date(today.year, 1, 1), end_date=date(today.year, 12, 31), is_current=True
        )
        cls.period = AccountingPeriod.objects.create(
            company=cls.company_a, fiscal_year=cls.fy, month=today.month, start_date=date(today.year, today.month, 1), 
            end_date=date(today.year, today.month, 28), status='OPEN'
        )

        # 4. Chart of Accounts & Configurations
        asset_group = AccountGroup.objects.create(company=cls.company_a, name="Assets", group_type="ASSET")
        cls.ar_account = ChartOfAccount.objects.create(
            company=cls.company_a, account_group=asset_group, account_code="AR-100", account_name="Accounts Receivable", account_type="ASSET"
        )
        cls.sales_rev_account = ChartOfAccount.objects.create(
            company=cls.company_a, account_group=asset_group, account_code="REV-100", account_name="Revenue", account_type="INCOME"
        )
        cls.cash_account = ChartOfAccount.objects.create(
            company=cls.company_a, account_group=asset_group, account_code="CASH-100", account_name="Cash", account_type="ASSET"
        )

        SalesAccountingConfiguration.objects.create(
            company=cls.company_a, sales_revenue_account=cls.sales_rev_account, accounts_receivable_account=cls.ar_account,
            cash_account=cls.cash_account, default_currency=cls.currency, is_active=True
        )
        
        BillingAccountingConfiguration.objects.create(
            company=cls.company_a, service_revenue_account=cls.sales_rev_account, accounts_receivable_account=cls.ar_account,
            payment_account=cls.cash_account, default_currency=cls.currency, is_active=True
        )

        # 5. CRM Entities
        cls.customer_1 = CRMEntity.objects.create(
            company=cls.company_a, entity_type="CUSTOMER", name="Tech Corp", display_name="Tech Corp Ltd", code="CUST-01"
        )
        cls.customer_2 = CRMEntity.objects.create(
            company=cls.company_a, entity_type="CUSTOMER", name="Global Inc", display_name="Global Inc", code="CUST-02"
        )

        # 6. Journals
        cls.sales_journal = Journal.objects.create(company=cls.company_a, code="SJ", name="Sales Journal", journal_type="SALES")

        # Create Ledger data (Customer 1: 1000 Debit, 200 Credit => Balance 800)
        cls.je_1 = JournalEntry.objects.create(company=cls.company_a, journal=cls.sales_journal, entry_number="JE-1", entry_date=today - timedelta(days=10), status="POSTED")
        JournalEntryLine.objects.create(company=cls.company_a, journal_entry=cls.je_1, account=cls.ar_account, crm_entity=cls.customer_1, debit=Decimal('1000.00'), credit=Decimal('0.00'))
        
        cls.je_2 = JournalEntry.objects.create(company=cls.company_a, journal=cls.sales_journal, entry_number="JE-2", entry_date=today - timedelta(days=5), status="POSTED")
        JournalEntryLine.objects.create(company=cls.company_a, journal_entry=cls.je_2, account=cls.ar_account, crm_entity=cls.customer_1, debit=Decimal('0.00'), credit=Decimal('200.00'))

        # (Customer 2: 500 Debit => Balance 500)
        cls.je_3 = JournalEntry.objects.create(company=cls.company_a, journal=cls.sales_journal, entry_number="JE-3", entry_date=today - timedelta(days=20), status="POSTED")
        JournalEntryLine.objects.create(company=cls.company_a, journal_entry=cls.je_3, account=cls.ar_account, crm_entity=cls.customer_2, debit=Decimal('500.00'), credit=Decimal('0.00'))

        # Create Operational AR Data (Service Invoices)
        # Create Operational AR Data (Service Invoices)
        cls.contract_1 = ServiceContract.objects.create(
            company=cls.company_a, crm_entity=cls.customer_1, contract_code="CONT-001", 
            start_date=today - timedelta(days=30), end_date=today + timedelta(days=365), 
            status=ServiceContractStatus.ACTIVE
        )
        cls.contract_2 = ServiceContract.objects.create(
            company=cls.company_a, crm_entity=cls.customer_2, contract_code="CONT-002", 
            start_date=today - timedelta(days=30), end_date=today + timedelta(days=365), 
            status=ServiceContractStatus.ACTIVE
        )

        # Inv 1: Current (due tomorrow) - 1000 total, 200 paid => 800 outstanding
        cls.inv_1 = ServiceInvoice.objects.create(
            company=cls.company_a, crm_entity=cls.customer_1, service_contract=cls.contract_1,
            invoice_number="INV-001", period_start=today, period_end=today,
            status=ServiceInvoiceStatus.POSTED, due_date=today + timedelta(days=1), total_amount=Decimal('1000.00'),
            base_amount=Decimal('1000.00'), paid_amount=Decimal('200.00'), payment_status=ServiceInvoicePaymentStatus.PARTIALLY_PAID,
            currency=cls.currency, exchange_rate=Decimal('1.0')
        )
        
        # Inv 2: 0-30 days overdue - 500 total, 0 paid => 500 outstanding
        cls.inv_2 = ServiceInvoice.objects.create(
            company=cls.company_a, crm_entity=cls.customer_2, service_contract=cls.contract_2,
            invoice_number="INV-002", period_start=today, period_end=today,
            status=ServiceInvoiceStatus.POSTED, due_date=today - timedelta(days=15), total_amount=Decimal('500.00'),
            base_amount=Decimal('500.00'), paid_amount=Decimal('0.00'), payment_status=ServiceInvoicePaymentStatus.UNPAID,
            currency=cls.currency, exchange_rate=Decimal('1.0')
        )

        # Inv 3: 31-60 days overdue - 1500 total, 1500 paid => 0 outstanding (Should be excluded from aging)
        cls.inv_3 = ServiceInvoice.objects.create(
            company=cls.company_a, crm_entity=cls.customer_1, service_contract=cls.contract_1,
            invoice_number="INV-003", period_start=today - timedelta(days=30), period_end=today - timedelta(days=30),
            status=ServiceInvoiceStatus.POSTED, due_date=today - timedelta(days=45), total_amount=Decimal('1500.00'),
            base_amount=Decimal('1500.00'), paid_amount=Decimal('1500.00'), payment_status=ServiceInvoicePaymentStatus.PAID,
            currency=cls.currency, exchange_rate=Decimal('1.0')
        )

        # Company B setup
        cls.customer_b = CRMEntity.objects.create(company=cls.company_b, entity_type="CUSTOMER", name="CompB Cust", code="CB-01")

    def test_customer_balance_service(self):
        service = CustomerBalanceService(company_id=self.company_a.id)
        balances = list(service.get_customer_balances())
        
        self.assertEqual(len(balances), 2)
        
        # Ensure correct mapping and arithmetic
        c1_bal = next(b for b in balances if b['crm_entity_id'] == self.customer_1.id)
        self.assertEqual(c1_bal['total_debit'], Decimal('1000.00'))
        self.assertEqual(c1_bal['total_credit'], Decimal('200.00'))
        self.assertEqual(c1_bal['balance'], Decimal('800.00'))

        c2_bal = next(b for b in balances if b['crm_entity_id'] == self.customer_2.id)
        self.assertEqual(c2_bal['balance'], Decimal('500.00'))

    def test_customer_statement_service(self):
        service = CustomerStatementService(company_id=self.company_a.id)
        stmt = service.get_customer_statement(crm_entity_id=self.customer_1.id)
        
        self.assertEqual(stmt['customer_name'], "Tech Corp Ltd")
        self.assertEqual(stmt['period_debit'], Decimal('1000.00'))
        self.assertEqual(stmt['period_credit'], Decimal('200.00'))
        self.assertEqual(stmt['closing_balance'], Decimal('800.00'))
        
        transactions = list(stmt['transactions'])
        self.assertEqual(len(transactions), 2)
        self.assertEqual(transactions[0].debit, Decimal('1000.00'))
        self.assertEqual(transactions[0].running_balance, Decimal('1000.00'))
        self.assertEqual(transactions[1].credit, Decimal('200.00'))
        self.assertEqual(transactions[1].running_balance, Decimal('800.00'))

    def test_ar_aging_service(self):
        service = ARAgingService(company_id=self.company_a.id)
        aging = service.get_ar_aging(date_to=date.today())
        
        summary = aging['summary']
        # customer 1: 800 current (due tomorrow)
        # customer 2: 500 (15 days overdue -> 0-30 bucket)
        # customer 1: 1500 paid -> should not appear
        
        self.assertEqual(summary['total_current'], Decimal('800.00'))
        self.assertEqual(summary['total_0_30'], Decimal('500.00'))
        self.assertEqual(summary['total_31_60'], Decimal('0.00'))
        self.assertEqual(summary['total_outstanding'], Decimal('1300.00'))
        
        invoices = list(aging['invoices'])
        self.assertEqual(len(invoices), 2)
        self.assertTrue(all(inv.payment_status != ServiceInvoicePaymentStatus.PAID for inv in invoices))

    def test_ar_reconciliation_service(self):
        # Discrepancy test: create a manual journal entry not tied to an invoice
        je_manual = JournalEntry.objects.create(company=self.company_a, journal=self.sales_journal, entry_number="JE-MANUAL", entry_date=date.today(), status="POSTED")
        JournalEntryLine.objects.create(company=self.company_a, journal_entry=je_manual, account=self.ar_account, crm_entity=self.customer_1, debit=Decimal('100.00'), credit=Decimal('0.00'))
        
        service = ARReconciliationService(company_id=self.company_a.id)
        results = service.get_reconciliation(date_to=date.today())
        
        # customer 1 operational = 800. ledger = 900. Diff = -100
        # customer 2 operational = 500. ledger = 500. Diff = 0
        
        c1_rec = next(r for r in results if r['crm_entity_id'] == str(self.customer_1.id))
        self.assertEqual(c1_rec['operational_balance'], Decimal('800.00'))
        self.assertEqual(c1_rec['ledger_balance'], Decimal('900.00'))
        self.assertEqual(c1_rec['difference'], Decimal('-100.00'))
        self.assertTrue(c1_rec['has_discrepancy'])

        c2_rec = next(r for r in results if r['crm_entity_id'] == str(self.customer_2.id))
        self.assertEqual(c2_rec['difference'], Decimal('0.00'))
        self.assertFalse(c2_rec['has_discrepancy'])

    def test_tenant_isolation(self):
        self.client.force_authenticate(user=self.admin_user_b)
        response = self.client.get(reverse('api-report-customer-balances'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Should be empty because Company B has no posted journals or active configs
        self.assertEqual(response.data['count'], 0)

        # Try to access company A's customer statement
        response = self.client.get(reverse('api-report-customer-statement'), {'crm_entity_id': self.customer_1.id})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('crm_entity_id', response.data)

    def test_financial_rbac(self):
        self.client.force_authenticate(user=self.employee_user_a)
        
        # Employee should be denied
        response = self.client.get(reverse('api-report-ar-aging'))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        
        response = self.client.get(reverse('api-report-customer-balances'))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_streaming_export_ar_aging(self):
        self.client.force_authenticate(user=self.admin_user_a)
        response = self.client.get(reverse('api-report-ar-aging'), {'export': 'csv'})
        
        if response.status_code != status.HTTP_200_OK:
            print("API Error Response:", getattr(response, 'content', 'No content'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response['Content-Type'], 'text/csv; charset=utf-8')
        self.assertTrue(response.streaming)
        
        content = b"".join(response.streaming_content).decode('utf-8')
        self.assertIn('invoice_number', content)
        self.assertIn('INV-001', content)
        self.assertIn('INV-002', content)
        self.assertNotIn('INV-003', content) # Paid invoice excluded

    def test_api_endpoints_json(self):
        self.client.force_authenticate(user=self.admin_user_a)
        
        r1 = self.client.get(reverse('api-report-ar-aging'))
        self.assertEqual(r1.status_code, status.HTTP_200_OK)
        self.assertEqual(r1.data['summary']['total_outstanding'], 1300.0)

        r2 = self.client.get(reverse('api-report-customer-balances'))
        self.assertEqual(r2.status_code, status.HTTP_200_OK)
        self.assertEqual(r2.data['count'], 2)

        r3 = self.client.get(reverse('api-report-customer-statement'), {'crm_entity_id': self.customer_1.id})
        self.assertEqual(r3.status_code, status.HTTP_200_OK)
        self.assertEqual(r3.data['closing_balance'], 800.0)

        r4 = self.client.get(reverse('api-report-ar-reconciliation'))
        self.assertEqual(r4.status_code, status.HTTP_200_OK)
        self.assertEqual(r4.data['count'], 2)
