from decimal import Decimal
from datetime import date, timedelta
from django.test import TestCase
from django.contrib.auth import get_user_model
from companies.models import Company
from crm.models import CRMEntity
from finance.models import Currency, FiscalYear, AccountingPeriod, ChartOfAccount, Journal, TaxCode, AccountGroup
from operations.models import (
    ServiceContract, ServiceContractStatus, Designation, OperationalSite,
    ContractRate, Deployment, DeploymentStatus, DutyAssignment, DutyAssignmentStatus
)
from billing.models import ServiceInvoice, ServiceInvoiceStatus, BillingAccountingConfiguration, ServiceInvoicePaymentStatus
from billing.services.service_billing import (
    generate_service_invoice, post_service_invoice, BillingError,
    cancel_service_invoice, record_invoice_payment
)

User = get_user_model()

class Phase8DBillingTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.company = Company.objects.create(name="Phase 8D Company")
        cls.user = User.objects.create_user(username="testuser8d", password="password", company=cls.company)
        
        cls.currency = Currency.objects.create(company=cls.company, code="USD", name="US Dollar", symbol="$")
        cls.fy = FiscalYear.objects.create(company=cls.company, name="2026", start_date=date(2026, 1, 1), end_date=date(2026, 12, 31))
        cls.period = AccountingPeriod.objects.create(
            company=cls.company, fiscal_year=cls.fy, month=8,
            start_date=date(2026, 8, 1), end_date=date(2026, 8, 31), status='OPEN'
        )
        
        cls.group_asset = AccountGroup.objects.create(company=cls.company, name="Assets", group_type="ASSET")
        cls.group_rev = AccountGroup.objects.create(company=cls.company, name="Revenues", group_type="REVENUE")
        cls.group_liab = AccountGroup.objects.create(company=cls.company, name="Liabilities", group_type="LIABILITY")

        cls.ar_account = ChartOfAccount.objects.create(company=cls.company, account_group=cls.group_asset, account_code="1200", account_name="Accounts Receivable", account_type="Asset")
        cls.rev_account = ChartOfAccount.objects.create(company=cls.company, account_group=cls.group_rev, account_code="4000", account_name="Service Revenue", account_type="Revenue")
        cls.tax_account = ChartOfAccount.objects.create(company=cls.company, account_group=cls.group_liab, account_code="2200", account_name="Tax Payable", account_type="Liability")
        cls.cash_account = ChartOfAccount.objects.create(company=cls.company, account_group=cls.group_asset, account_code="1000", account_name="Cash", account_type="Asset")
        
        cls.billing_config = BillingAccountingConfiguration.objects.create(
            company=cls.company,
            accounts_receivable_account=cls.ar_account,
            service_revenue_account=cls.rev_account,
            tax_payable_account=cls.tax_account,
            payment_account=cls.cash_account,
            default_currency=cls.currency,
            is_active=True
        )
        
        cls.tax_code = TaxCode.objects.create(company=cls.company, code="VAT10", name="VAT 10%", rate=Decimal('0.10'))
        
        cls.client = CRMEntity.objects.create(company=cls.company, name="Client 8D", entity_type="CUSTOMER")
        cls.site = OperationalSite.objects.create(company=cls.company, name="Site A", crm_entity=cls.client)
        cls.contract = ServiceContract.objects.create(
            company=cls.company, crm_entity=cls.client, contract_code="SC-8D-001",
            start_date=date(2026, 8, 1), end_date=date(2026, 8, 31),
            status=ServiceContractStatus.ACTIVE
        )
        cls.contract.sites.add(cls.site)
        
        cls.designation = Designation.objects.create(company=cls.company, name="Guard", code="GRD")
        
        cls.contract_rate = ContractRate.objects.create(
            company=cls.company, service_contract=cls.contract, designation=cls.designation,
            effective_date=date(2026, 8, 1), billing_rate=Decimal('20.00')
        )
        
        from hrm.models import Employee
        cls.employee = Employee.objects.create(company=cls.company, employee_code="GRD-1", first_name="A", last_name="B")
        cls.deployment = Deployment.objects.create(
            company=cls.company, service_contract=cls.contract, designation=cls.designation, employee=cls.employee,
            site=cls.site, start_date=date(2026, 8, 1), status=DeploymentStatus.COMPLETED
        )
        
        cls.duty = DutyAssignment.objects.create(
            company=cls.company, deployment=cls.deployment, site=cls.site,
            date=date(2026, 8, 10), start_time="08:00", end_time="16:00",
            status=DutyAssignmentStatus.COMPLETED
        )
        
    def test_8d_1_tax_engine(self):
        # Generate with tax
        res = generate_service_invoice(
            self.company.id, self.contract.id, date(2026, 8, 1), date(2026, 8, 31),
            tax_code_id=self.tax_code.id
        )
        self.assertTrue(res['created'])
        invoice = ServiceInvoice.objects.get(id=res['invoice_id'])
        self.assertEqual(invoice.subtotal, Decimal('160.00')) # 8 hours * 20
        self.assertEqual(invoice.tax_amount, Decimal('16.00'))
        self.assertEqual(invoice.total_amount, Decimal('176.00'))
        
        # Post invoice
        post_res = post_service_invoice(self.company.id, invoice.id, self.user)
        self.assertTrue(post_res['posted'])
        
        # Verify Journal Entry lines
        invoice.refresh_from_db()
        je = invoice.journal_entry
        self.assertIsNotNone(je)
        
        ar_line = je.lines.get(account=self.ar_account)
        self.assertEqual(ar_line.debit, Decimal('176.00'))
        
        rev_line = je.lines.get(account=self.rev_account)
        self.assertEqual(rev_line.credit, Decimal('160.00'))
        
        tax_line = je.lines.get(account=self.tax_account)
        self.assertEqual(tax_line.credit, Decimal('16.00'))

    def test_8d_2_invoice_cancellation(self):
        res = generate_service_invoice(self.company.id, self.contract.id, date(2026, 8, 1), date(2026, 8, 31))
        invoice = ServiceInvoice.objects.get(id=res['invoice_id'])
        
        post_service_invoice(self.company.id, invoice.id, self.user)
        invoice.refresh_from_db()
        original_je = invoice.journal_entry
        
        cancel_res = cancel_service_invoice(invoice.id, self.company.id, self.user)
        self.assertTrue(cancel_res['cancelled'])
        
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, ServiceInvoiceStatus.CANCELLED)
        
        original_je.refresh_from_db()
        self.assertEqual(original_je.status, 'REVERSED')
        
    def test_8d_3_invoice_payment(self):
        res = generate_service_invoice(self.company.id, self.contract.id, date(2026, 8, 1), date(2026, 8, 31))
        invoice = ServiceInvoice.objects.get(id=res['invoice_id'])
        post_service_invoice(self.company.id, invoice.id, self.user)
        
        pay_res = record_invoice_payment(
            invoice.id, Decimal('100.00'), date(2026, 8, 15), 'CASH', 'REF123', self.company.id, self.user
        )
        self.assertTrue(pay_res['recorded'])
        
        invoice.refresh_from_db()
        self.assertEqual(invoice.paid_amount, Decimal('100.00'))
        self.assertEqual(invoice.payment_status, ServiceInvoicePaymentStatus.PARTIALLY_PAID)
        
        # Pay the rest
        pay_res2 = record_invoice_payment(
            invoice.id, Decimal('60.00'), date(2026, 8, 16), 'CASH', 'REF124', self.company.id, self.user
        )
        self.assertTrue(pay_res2['recorded'])
        
        invoice.refresh_from_db()
        self.assertEqual(invoice.paid_amount, Decimal('160.00'))
        self.assertEqual(invoice.payment_status, ServiceInvoicePaymentStatus.PAID)
        
        # Test idempotency
        pay_res3 = record_invoice_payment(
            invoice.id, Decimal('60.00'), date(2026, 8, 16), 'CASH', 'REF124', self.company.id, self.user
        )
        self.assertFalse(pay_res3['recorded'])
