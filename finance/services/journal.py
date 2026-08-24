from decimal import Decimal
from django.db import transaction
from django.db.models import Sum
from rest_framework.exceptions import ValidationError
from finance.models import JournalEntry, JournalEntryLine, ChartOfAccount
import datetime

def post_journal_entry(company, journal, entry_date, description, lines, reference="", **kwargs):
    from erp_core.models import DocumentSequence
    
    total_debit = Decimal('0.0000')
    total_credit = Decimal('0.0000')
    
    for line in lines:
        debit = line.get('debit', Decimal('0.0000'))
        credit = line.get('credit', Decimal('0.0000'))
        
        if debit < 0 or credit < 0:
            raise ValidationError("Debit and credit amounts must be positive.")
            
        if debit > 0 and credit > 0:
            raise ValidationError("A single line cannot have both debit and credit.")
            
        total_debit += debit
        total_credit += credit
        
    if total_debit != total_credit:
        raise ValidationError(f"Debits and credits must balance. Total Debits: {total_debit}, Total Credits: {total_credit}")

    with transaction.atomic():
        prefix = f"{journal.code}-{entry_date.strftime('%Y%m%d')}"
        entry_num = DocumentSequence.get_next_number(company, "JOURNAL", prefix)
        
        entry = JournalEntry.objects.create(
            company=company,
            journal=journal,
            entry_number=entry_num,
            entry_date=entry_date,
            description=description,
            reference=reference,
            status="DRAFT",  # Create as DRAFT first to bypass POSTED immutability rules
            source_module=kwargs.get('source_module', ''),
            source_document_type=kwargs.get('source_document_type', ''),
            source_document_id=kwargs.get('source_document_id', None),
            created_by=kwargs.get('created_by', None),
            approved_by=kwargs.get('approved_by', None)
        )
        
        for line in lines:
            account = line['account']
            if account.company != company:
                raise ValidationError(f"Account {account.account_code} does not belong to the company.")
                
            debit = line.get('debit', Decimal('0.0000'))
            credit = line.get('credit', Decimal('0.0000'))
                
            JournalEntryLine.objects.create(
                company=company,
                journal_entry=entry,
                account=account,
                description=description,
                debit=debit,
                credit=credit,
                currency=line.get('currency'),
                exchange_rate=line.get('exchange_rate', Decimal('1.000000')),
                crm_entity=line.get('crm_entity'),
                cost_center=line.get('cost_center'),
                profit_center=line.get('profit_center')
            )
            
        # Post and update balances using the central posting service
        from finance.services.posting import post_entry
        entry = post_entry(entry.id)
            
    return entry

def get_account_balance(company, account_id):
    account = ChartOfAccount.objects.get(id=account_id, company=company)
    
    aggregates = JournalEntryLine.objects.filter(
        company=company,
        account=account,
        journal_entry__status__in=["POSTED", "REVERSED"],
        is_deleted=False
    ).aggregate(
        total_debit=Sum('debit'),
        total_credit=Sum('credit')
    )
    
    total_debit = aggregates['total_debit'] or Decimal('0.0000')
    total_credit = aggregates['total_credit'] or Decimal('0.0000')
    
    if account.account_type in ['Asset', 'Expense']:
        return account.opening_balance + total_debit - total_credit
    else:
        return account.opening_balance + total_credit - total_debit
