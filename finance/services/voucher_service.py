from django.db import transaction
from django.core.exceptions import ValidationError
from finance.models import FinancialVoucher, VoucherStatus, JournalEntry, JournalEntryLine, Journal, VoucherType

@transaction.atomic
def post_financial_voucher(voucher: FinancialVoucher, user):
    if voucher.status == VoucherStatus.POSTED:
        raise ValidationError("Voucher is already posted.")
    if voucher.status == VoucherStatus.CANCELLED:
        raise ValidationError("Cannot post a cancelled voucher.")
        
    lines = list(voucher.lines.all())
    if not lines:
        raise ValidationError("Voucher has no lines.")
        
    # Get the appropriate journal
    try:
        journal = Journal.objects.get(company=voucher.company, journal_type='GENERAL')
    except Journal.DoesNotExist:
        raise ValidationError("General journal not found for posting.")
        
    from erp_core.models import DocumentSequence
    prefix = f"{journal.code}-{voucher.date.strftime('%Y%m%d')}"
    entry_num = DocumentSequence.get_next_number(voucher.company, "JOURNAL", prefix)

    # Create Journal Entry
    je = JournalEntry.objects.create(
        company=voucher.company,
        journal=journal,
        entry_number=entry_num,
        entry_date=voucher.date,
        reference=f"Voucher {voucher.voucher_number}",
        description=voucher.description or f"Posting voucher {voucher.voucher_number}",
        created_by=user
    )
    
    total_payment = 0
    
    for line in lines:
        # For a PAYMENT voucher:
        # Debit: Line account (Expense, AP, etc.)
        # Credit: Payment account (Bank/Cash)
        
        # For a RECEIPT voucher:
        # Debit: Payment account (Bank/Cash)
        # Credit: Line account (Revenue, AR, etc.)
        
        is_payment = (voucher.voucher_type == VoucherType.PAYMENT)
        
        # Create line for the split account
        JournalEntryLine.objects.create(
            company=voucher.company,
            journal_entry=je,
            account=line.account,
            description=line.description or f"Voucher line for {voucher.voucher_number}",
            debit=line.amount if is_payment else 0,
            credit=0 if is_payment else line.amount,
            cost_center=line.cost_center
        )
        total_payment += line.amount
        
        # If invoice is attached and it's a receipt voucher against AR, we could optionally
        # update ServiceInvoice status here or rely on ServiceInvoicePayment logic if reused.

    # Create the balancing line for the payment account
    is_payment = (voucher.voucher_type == VoucherType.PAYMENT)
    JournalEntryLine.objects.create(
        company=voucher.company,
        journal_entry=je,
        account=voucher.payment_account,
        description=f"Balancing line for {voucher.voucher_number}",
        debit=0 if is_payment else total_payment,
        credit=total_payment if is_payment else 0
    )
    
    # Mark as posted using central posting service
    from finance.services.posting import post_entry
    je = post_entry(je.id)
    
    voucher.status = VoucherStatus.POSTED
    voucher.journal_entry = je
    voucher.total_amount = total_payment
    voucher.save()
    
    return je
