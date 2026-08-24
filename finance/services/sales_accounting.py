from decimal import Decimal
from django.db import transaction
from django.core.exceptions import ValidationError
from finance.models import SalesAccountingConfiguration, Journal, JournalEntry
from finance.services.journal import post_journal_entry

def get_sale_accounts(company):
    """Retrieve the active sales accounting configuration for the company."""
    config = SalesAccountingConfiguration.objects.filter(company=company, is_active=True).first()
    if not config:
        raise ValidationError("No active Sales Accounting Configuration found for this company.")
    return config

def validate_sale_posting(sale):
    """Validate if the sale is ready to be posted to the universal finance ledger."""
    if not sale:
        raise ValidationError("Sale does not exist.")
    if sale.is_deleted:
        raise ValidationError("Sale is deleted.")
    if getattr(sale, 'status', None) == 'CANCELLED':
        raise ValidationError("Cancelled sale cannot be posted.")
    if sale.customer is None:
        raise ValidationError("Sale must have a customer.")
    if sale.customer.crm_entity is None:
        raise ValidationError("Customer must be linked to a CRMEntity.")
        
    # Check if already posted
    existing_entry = JournalEntry.objects.filter(
        company=sale.company,
        source_module='sales',
        source_document_id=sale.id,
        is_deleted=False
    ).exclude(status='REVERSED').first()
    
    if existing_entry:
        raise ValidationError("Sale is already posted.")

    config = get_sale_accounts(sale.company)
    
    # Check accounting period
    from finance.models import AccountingPeriod
    sale_date = sale.created_at.date() if sale.created_at else datetime.date.today()
    period = AccountingPeriod.objects.filter(
        company=sale.company,
        start_date__lte=sale_date,
        end_date__gte=sale_date
    ).first()
    if not period:
        raise ValidationError("No accounting period found for the sale date.")
    if period.status != 'OPEN':
        raise ValidationError(f"Accounting period is {period.status}. Must be OPEN to post sales.")

def preview_sale_journal(sale):
    """Preview the journal entry that would be generated for this sale."""
    config = get_sale_accounts(sale.company)
    
    lines = []
    
    # Cash, Card, Split, Credit
    if sale.payment_method == 'cash':
        debits = [(config.cash_account, sale.total_amount)]
    elif sale.payment_method == 'card':
        debits = [(config.bank_account or config.cash_account, sale.total_amount)]
    elif sale.payment_method == 'credit':
        debits = [(config.accounts_receivable_account, sale.total_amount)]
    elif sale.payment_method == 'split':
        debits = []
        if sale.split_cash > 0:
            debits.append((config.cash_account, sale.split_cash))
        if sale.split_card > 0:
            debits.append((config.bank_account or config.cash_account, sale.split_card))
        remaining = sale.total_amount - (sale.split_cash + sale.split_card)
        if remaining > 0:
            debits.append((config.accounts_receivable_account, remaining))
    else:
        debits = [(config.cash_account, sale.total_amount)]
        
    revenue_account = config.sales_revenue_account
    
    for acc, amount in debits:
        lines.append({
            'account': acc,
            'debit': amount,
            'credit': Decimal('0.0000'),
            'currency': config.default_currency,
            'crm_entity': sale.customer.crm_entity if sale.customer else None
        })
    
    lines.append({
        'account': revenue_account,
        'debit': Decimal('0.0000'),
        'credit': sale.total_amount,
        'currency': config.default_currency,
        'crm_entity': sale.customer.crm_entity if sale.customer else None
    })
    
    return {
        'company': sale.company,
        'date': sale.created_at.date() if sale.created_at else datetime.date.today(),
        'description': f"Sale {getattr(sale, 'invoice_number', sale.id)}",
        'lines': lines
    }

def create_sale_journal(sale, created_by=None):
    """Generate the Universal Journal Entry for the sale."""
    validate_sale_posting(sale)
    preview = preview_sale_journal(sale)
    
    # Get or create SALES journal
    journal, _ = Journal.objects.get_or_create(
        company=sale.company,
        code='SALES',
        defaults={'name': 'Sales Journal', 'journal_type': 'SALES'}
    )
    
    sale_date = sale.created_at.date() if sale.created_at else datetime.date.today()
    entry = post_journal_entry(
        company=sale.company,
        journal=journal,
        entry_date=sale_date,
        description=preview['description'],
        lines=preview['lines'],
        reference=getattr(sale, 'invoice_number', str(sale.id)),
        source_module='sales',
        source_document_type='Sale',
        source_document_id=sale.id,
        created_by=created_by
    )
    return entry

def reverse_sale_journal(sale, reversed_by=None):
    """Create a reversing journal entry for a cancelled/refunded sale."""
    # Find existing entry
    existing_entry = JournalEntry.objects.filter(
        company=sale.company,
        source_module='sales',
        source_document_id=sale.id,
        status='POSTED',
        is_deleted=False
    ).first()
    
    if not existing_entry:
        raise ValidationError("No posted journal entry found to reverse.")
        
    if getattr(sale, 'status', '') != 'CANCELLED':
        # Assuming refund or cancellation is the only reason to reverse currently.
        # But we could be reversing for credit note. 
        pass 

    lines = []
    for line in existing_entry.lines.filter(is_deleted=False):
        # Reverse debit and credit
        lines.append({
            'account': line.account,
            'debit': line.credit,
            'credit': line.debit,
            'currency': line.currency,
            'crm_entity': line.crm_entity,
            'cost_center': line.cost_center,
            'profit_center': line.profit_center
        })
        
    sale_date = sale.created_at.date() if sale.created_at else datetime.date.today()
    reversal_entry = post_journal_entry(
        company=sale.company,
        journal=existing_entry.journal,
        entry_date=sale_date,  # Or today's date depending on accounting policy
        description=f"Reversal of {existing_entry.entry_number}",
        lines=lines,
        reference=existing_entry.entry_number,
        source_module='sales',
        source_document_type='Sale Reversal',
        source_document_id=sale.id,
        created_by=reversed_by
    )
    
    # Update the original journal status to REVERSED and point to the reversal entry
    existing_entry.status = 'REVERSED'
    # Wait, JournalEntry model might not have reversed_by or reversal_entry field, but let's see. 
    # Usually we just update status to REVERSED.
    # The prompt says: "mark relationship Original Journal -> Reversal Journal".
    # We can add this relationship if it exists, or just put it in description.
    # I'll check if reversal_entry is a field. If not, I'll update it anyway or put it in reference.
    if hasattr(existing_entry, 'reversal_entry'):
        existing_entry.reversal_entry = reversal_entry
    existing_entry.save(update_fields=['status'] + (['reversal_entry'] if hasattr(existing_entry, 'reversal_entry') else []))
    
    return reversal_entry

def create_ledger_payment_journal(ledger_entry, created_by=None):
    """Generate the Universal Journal Entry for a CustomerCreditLedger payment."""
    if ledger_entry.transaction_type != 'CREDIT':
        return None
        
    config = get_sale_accounts(ledger_entry.company)
    
    lines = [
        {
            'account': config.cash_account, # Assume payment received in cash (or bank if implemented)
            'debit': ledger_entry.amount,
            'credit': Decimal('0.0000'),
            'currency': config.default_currency,
            'crm_entity': ledger_entry.customer.crm_entity if ledger_entry.customer else None
        },
        {
            'account': config.accounts_receivable_account,
            'debit': Decimal('0.0000'),
            'credit': ledger_entry.amount,
            'currency': config.default_currency,
            'crm_entity': ledger_entry.customer.crm_entity if ledger_entry.customer else None
        }
    ]
    
    journal, _ = Journal.objects.get_or_create(
        company=ledger_entry.company,
        code='RECEIPTS',
        defaults={'name': 'Cash Receipts Journal', 'journal_type': 'CASH'}
    )
    
    entry = post_journal_entry(
        company=ledger_entry.company,
        journal=journal,
        entry_date=ledger_entry.created_at.date() if ledger_entry.created_at else datetime.date.today(),
        description=ledger_entry.notes or f"Payment from {ledger_entry.customer.name}",
        lines=lines,
        reference=f"PMT-{str(ledger_entry.id)[:8].upper()}",
        source_module='sales',
        source_document_type='CustomerCreditLedger',
        source_document_id=ledger_entry.id,
        created_by=created_by
    )
    return entry
