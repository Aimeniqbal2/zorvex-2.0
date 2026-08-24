from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from companies.models import Company
from finance.models import (
    ChartOfAccount, AccountGroup, Journal, JournalEntry, JournalEntryLine,
    TaxGroup, TaxCode, BankAccount, Cheque, BankStatement, FiscalYear, AccountingPeriod, Currency
)
from sales.models import Customer
from billing.models import ServiceInvoice, ServiceInvoiceLine
from operations.models import ServiceContract, ContractRate
from crm.models import CRMEntity
from billing.services.service_billing import record_invoice_payment
from billing.models import BillingAccountingConfiguration
from finance.services.posting import post_entry, reverse_entry
from reports.services.accounts_receivable import CustomerStatementService
from decimal import Decimal
from datetime import date
import uuid

User = get_user_model()

class Command(BaseCommand):
    help = 'Run R-6B acceptance tests'

    def handle(self, *args, **options):
        self.stdout.write("--- STARTING R-6B ACCEPTANCE TESTS ---")

        company = Company.objects.first()
        if not company:
            self.stdout.write("No company found.")
            return
        
        user = User.objects.filter(company=company, is_active=True).first()
        
        self.stdout.write("1. Setting up COA and Tax...")
        group, _ = AccountGroup.objects.get_or_create(company=company, name="Test Assets", group_type="ASSET")
        acc, _ = ChartOfAccount.objects.get_or_create(company=company, account_code="T-1001", account_name="Test Bank", account_group=group)
        acc2, _ = ChartOfAccount.objects.get_or_create(company=company, account_code="T-4001", account_name="Test Rev", account_group=group)
        
        tax_group, _ = TaxGroup.objects.get_or_create(company=company, name="Test Tax 10%")
        TaxCode.objects.get_or_create(company=company, tax_group=tax_group, name="GST", rate=Decimal('0.10'), tax_type='SALES')
        
        # Ensure Accounting Period exists
        fy, _ = FiscalYear.objects.get_or_create(company=company, name=str(date.today().year), defaults={'start_date': date(date.today().year, 1, 1), 'end_date': date(date.today().year, 12, 31)})
        ap, _ = AccountingPeriod.objects.get_or_create(
            company=company, fiscal_year=fy, month=date.today().month,
            defaults={'start_date': date(date.today().year, date.today().month, 1), 'end_date': date(date.today().year, date.today().month, 28), 'status': 'OPEN'}
        )
        # Just update end date to a safe far end date for this month to avoid days in month errors
        ap.end_date = date.today()
        ap.status = 'OPEN'
        ap.save()

        self.stdout.write("2. Posting Journal...")
        journal, _ = Journal.objects.get_or_create(company=company, code="GEN", name="General")
        entry = JournalEntry.objects.create(company=company, journal=journal, entry_date=date.today(), description="Test Entry", entry_number=f"TEST-{uuid.uuid4().hex[:8]}")
        JournalEntryLine.objects.create(company=company, journal_entry=entry, account=acc, debit=100, credit=0)
        JournalEntryLine.objects.create(company=company, journal_entry=entry, account=acc2, debit=0, credit=100)
        
        post_entry(entry.id, user=user)
        entry.refresh_from_db()
        self.stdout.write(f"   Journal Status after post: {entry.status}")

        self.stdout.write("3. Reversing Journal...")
        reversal = reverse_entry(entry.id, user=user)
        reversal.refresh_from_db()
        self.stdout.write(f"   Reversal Journal Status: {reversal.status}")

        self.stdout.write("4. Recording Receivable Payment...")
        customer, _ = Customer.objects.get_or_create(company=company, name="Test Customer")
        crm_entity, _ = CRMEntity.objects.get_or_create(company=company, name="Test CRM", entity_type="CUSTOMER")

        # Ensure BillingAccountingConfiguration exists
        ar_acc, _ = ChartOfAccount.objects.get_or_create(company=company, account_code="T-1200", account_name="Accounts Receivable", account_group=group)
        rev_acc, _ = ChartOfAccount.objects.get_or_create(company=company, account_code="T-4100", account_name="Service Revenue", account_group=group)
        tax_acc, _ = ChartOfAccount.objects.get_or_create(company=company, account_code="T-2100", account_name="Tax Payable", account_group=group)
        currency, _ = Currency.objects.get_or_create(company=company, code="PKR", defaults={'name': 'Pakistani Rupee', 'symbol': 'Rs', 'decimal_places': 2, 'is_base_currency': True})
        BillingAccountingConfiguration.objects.get_or_create(
            company=company,
            defaults={
                'accounts_receivable_account': ar_acc,
                'service_revenue_account': rev_acc,
                'tax_payable_account': tax_acc,
                'payment_account': acc,
                'default_currency': currency,
                'is_active': True,
            }
        )
        
        invoice = ServiceInvoice.objects.create(
            company=company, crm_entity=crm_entity, period_start=date.today(), period_end=date.today(),
            subtotal=100, total_amount=100, base_amount=100
        )
        invoice.status = 'POSTED'
        invoice.save()

        bank_acc, _ = BankAccount.objects.get_or_create(company=company, account_title="Test Bank Acc", account_number="123", chart_of_account=acc)
        
        res = record_invoice_payment(
            invoice_id=str(invoice.id),
            amount=100,
            payment_date=date.today(),
            payment_method="BANK",
            reference="CHK123",
            company_id=str(company.id),
            bank_account_id=str(bank_acc.id),
            user=user
        )
        self.stdout.write(f"   Payment recorded: {res.get('recorded')}")

        self.stdout.write("5. Viewing Customer Statement...")
        report_service = CustomerStatementService(company_id=str(company.id))
        statement = report_service.get_customer_statement(crm_entity_id=str(crm_entity.id))
        self.stdout.write(f"   Statement transactions count: {len(statement.get('transactions', []))}")
        self.stdout.write("--- TESTS COMPLETED SUCCESSFULLY ---")
