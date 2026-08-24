import os
import django
from decimal import Decimal
from datetime import date

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp_core.settings')
django.setup()

from django.contrib.auth import get_user_model
from core.models import Company
from finance.models import (
    ChartOfAccount, AccountGroup, Journal, JournalEntry, JournalEntryLine,
    TaxGroup, TaxRate, BankAccount, Cheque, BankStatement
)
from sales.models import Customer
from billing.models import ServiceContract, ContractRate, ServiceInvoice, ServiceInvoiceLine
from crm.models import CRMEntity
from billing.services.service_billing import record_invoice_payment
from finance.services.journal import post_journal_entry
from finance.services.reversal import reverse_journal_entry
from reports.services.financial_statements import get_customer_statement

User = get_user_model()

def run_tests():
    print("--- STARTING R-6B ACCEPTANCE TESTS ---")

    # 1. SETUP
    company = Company.objects.first()
    if not company:
        print("No company found.")
        return
    
    user = User.objects.filter(company=company, is_active=True).first()
    
    # 2. CREATE COA + TAX
    print("1. Setting up COA and Tax...")
    group, _ = AccountGroup.objects.get_or_create(company=company, name="Test Assets", type="ASSET")
    acc, _ = ChartOfAccount.objects.get_or_create(company=company, account_code="T-1001", account_name="Test Bank", group=group)
    acc2, _ = ChartOfAccount.objects.get_or_create(company=company, account_code="T-4001", account_name="Test Rev", group=group)
    
    tax_group, _ = TaxGroup.objects.get_or_create(company=company, name="Test Tax 10%", is_active=True)
    TaxRate.objects.get_or_create(company=company, tax_group=tax_group, name="GST", rate=Decimal('0.10'))
    
    # 3. POST JOURNAL
    print("2. Posting Journal...")
    journal, _ = Journal.objects.get_or_create(company=company, code="GEN", name="General")
    entry = JournalEntry.objects.create(company=company, journal=journal, entry_date=date.today(), description="Test Entry")
    JournalEntryLine.objects.create(company=company, journal_entry=entry, account=acc, debit=100, credit=0)
    JournalEntryLine.objects.create(company=company, journal_entry=entry, account=acc2, debit=0, credit=100)
    
    post_journal_entry(entry.id, str(company.id))
    entry.refresh_from_db()
    print(f"   Journal Status after post: {entry.status}")

    # 4. REVERSE JOURNAL
    print("3. Reversing Journal...")
    reversal = reverse_journal_entry(entry.id, str(company.id), str(user.id) if user else None)
    reversal.refresh_from_db()
    print(f"   Reversal Journal Status: {reversal.status}")

    # 5. RECORD RECEIVABLE PAYMENT WITH BANK ACCOUNT
    print("4. Recording Receivable Payment...")
    customer, _ = Customer.objects.get_or_create(company=company, name="Test Customer")
    crm_entity, _ = CRMEntity.objects.get_or_create(company=company, name="Test CRM", entity_type="CUSTOMER")
    
    invoice = ServiceInvoice.objects.create(
        company=company, crm_entity=crm_entity, period_start=date.today(), period_end=date.today(),
        subtotal=100, total_amount=100, base_amount=100
    )
    # Post invoice so we can pay it
    invoice.status = 'POSTED'
    invoice.save()

    bank_acc, _ = BankAccount.objects.get_or_create(company=company, name="Test Bank Acc", account_number="123", account=acc)
    
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
    print(f"   Payment recorded: {res.get('recorded')}")

    # 6. VIEW CUSTOMER STATEMENT
    print("5. Viewing Customer Statement...")
    statement = get_customer_statement(str(company.id), str(crm_entity.id))
    print(f"   Statement transactions count: {len(statement.get('transactions', []))}")
    print("--- TESTS COMPLETED SUCCESSFULLY ---")

if __name__ == '__main__':
    run_tests()
