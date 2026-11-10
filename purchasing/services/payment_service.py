from decimal import Decimal
from django.db import models, transaction
from django.utils import timezone
from django.core.exceptions import ValidationError
from purchasing.models import (
    Vendor,
    ProcurementDocument,
    VendorPayment,
    VendorPaymentAllocation,
    ProcurementAuditTrail
)


def get_invoice_payment_summary(invoice: ProcurementDocument) -> dict:
    """
    Computes authoritative financial settlement figures for a posted Vendor Invoice or Purchase Order.
    Deducts return credit notes from total billed liability before computing outstanding payable.
    Guarantees no negative liabilities when bill is already paid.
    """
    if invoice.document_type not in ('VENDOR_INVOICE', 'PURCHASE_ORDER'):
        return {
            'total_amount': invoice.total_amount,
            'original_amount': invoice.total_amount,
            'return_credit': Decimal('0.00'),
            'net_amount': invoice.total_amount,
            'paid_amount': Decimal('0.00'),
            'outstanding_amount': invoice.total_amount,
            'unallocated_credit': Decimal('0.00'),
            'payment_status': invoice.payment_status or 'UNPAID',
            'is_overdue': False,
            'due_date': invoice.due_date
        }

    original_amount = Decimal(str(invoice.total_amount or 0)).quantize(Decimal('0.01'))
    
    # Sum credit notes linked to this invoice
    credit_notes = getattr(invoice, 'credit_notes', None)
    if credit_notes is not None:
        credit_sum = credit_notes.filter(status='POSTED').aggregate(tot=models.Sum('amount'))['tot'] or Decimal('0.00')
    else:
        credit_sum = Decimal('0.00')
    return_credit = Decimal(str(credit_sum)).quantize(Decimal('0.01'))
    
    # Net billed liability after returns
    net_amount = max(Decimal('0.00'), original_amount - return_credit).quantize(Decimal('0.01'))

    # Sum only from POSTED payments
    allocations = invoice.payment_allocations.filter(payment__status='POSTED')
    paid_sum = sum((Decimal(str(a.amount)) for a in allocations), Decimal('0.00'))
    paid_amount = paid_sum.quantize(Decimal('0.01'))
    
    # Outstanding payable: net amount minus paid amount, minimum 0.00 (NO negative balance!)
    outstanding = max(Decimal('0.00'), net_amount - paid_amount).quantize(Decimal('0.01'))

    # Unallocated credit if paid + return_credit exceeds original bill
    total_credits = paid_amount + return_credit
    if total_credits > original_amount:
        unallocated_credit = (total_credits - original_amount).quantize(Decimal('0.01'))
    else:
        unallocated_credit = Decimal('0.00')
    
    today = timezone.now().date()
    is_overdue = bool(invoice.due_date and invoice.due_date < today and outstanding > Decimal('0.00'))
    
    if outstanding == Decimal('0.00') and (paid_amount > Decimal('0.00') or return_credit >= original_amount):
        calc_status = 'PAID'
    elif paid_amount > Decimal('0.00') or return_credit > Decimal('0.00'):
        calc_status = 'OVERDUE' if is_overdue else 'PARTIALLY_PAID'
    else:
        calc_status = 'OVERDUE' if is_overdue else 'UNPAID'

    return {
        'total_amount': original_amount,
        'original_amount': original_amount,
        'return_credit': return_credit,
        'net_amount': net_amount,
        'paid_amount': paid_amount,
        'outstanding_amount': outstanding,
        'unallocated_credit': unallocated_credit,
        'payment_status': calc_status,
        'is_overdue': is_overdue,
        'due_date': invoice.due_date
    }


def sync_invoice_payment_status(invoice: ProcurementDocument):
    """
    Updates and persists the authoritative payment_status on the invoice record.
    """
    summary = get_invoice_payment_summary(invoice)
    target_status = summary['payment_status']
    if invoice.payment_status != target_status:
        invoice.payment_status = target_status
        invoice.save(update_fields=['payment_status', 'updated_at'])
    return summary


@transaction.atomic
def create_vendor_payment(
    company_id,
    vendor_id,
    payment_date,
    amount,
    payment_method='BANK_TRANSFER',
    bank_cash_account='',
    bank_account_id=None,
    account_id=None,
    reference_number='',
    cheque_number='',
    cheque_date=None,
    notes='',
    allocations_data=None,
    user=None,
    auto_post=False
) -> VendorPayment:
    """
    Creates a new VendorPayment and its bill/PO allocations with atomic overpayment protection.
    Automatically maps Treasury BankAccount -> ChartOfAccount so treasury deductions work cleanly.
    """
    from finance.models import BankAccount, ChartOfAccount

    vendor = Vendor.objects.get(id=vendor_id, company_id=company_id)
    pay_amount = Decimal(str(amount)).quantize(Decimal('0.01'))
    if pay_amount <= Decimal('0.00'):
        raise ValidationError("Payment amount must be greater than zero.")

    # Resolve Treasury BankAccount and GL ChartOfAccount safely
    treasury_bank = None
    if bank_account_id:
        treasury_bank = BankAccount.objects.filter(id=bank_account_id, company_id=company_id, is_deleted=False).first()

    resolved_gl_account_id = None
    if account_id:
        if ChartOfAccount.objects.filter(id=account_id, company_id=company_id, is_deleted=False).exists():
            resolved_gl_account_id = account_id
        elif not treasury_bank:
            # Handle legacy UI sending BankAccount UUID in account field
            treasury_bank = BankAccount.objects.filter(id=account_id, company_id=company_id, is_deleted=False).first()

    if treasury_bank and not resolved_gl_account_id and treasury_bank.chart_of_account_id:
        resolved_gl_account_id = treasury_bank.chart_of_account_id

    clean_bank_label = (bank_cash_account or '').strip()
    if treasury_bank and not clean_bank_label:
        clean_bank_label = f"{treasury_bank.bank_name or treasury_bank.account_type} - {treasury_bank.account_title}".strip(' -')

    clean_notes = (notes or '').strip()
    if treasury_bank and f"[TREASURY:{treasury_bank.id}]" not in clean_notes:
        clean_notes = f"{clean_notes} [TREASURY:{treasury_bank.id}]".strip()

    payment = VendorPayment(
        company_id=company_id,
        vendor=vendor,
        payment_date=payment_date,
        payment_method=payment_method,
        bank_cash_account=clean_bank_label,
        account_id=resolved_gl_account_id,
        amount=pay_amount,
        currency=getattr(vendor, 'currency', None) or 'PKR',
        reference_number=(reference_number or '').strip(),
        cheque_number=(cheque_number or '').strip(),
        cheque_date=cheque_date,
        notes=clean_notes,
        created_by=user,
        paid_by=user,
        status='DRAFT'
    )
    payment.save()

    allocated_total = Decimal('0.00')

    if allocations_data:
        for alloc in allocations_data:
            inv_id = alloc.get('invoice_id') or alloc.get('invoice')
            alloc_amt = Decimal(str(alloc.get('amount', 0))).quantize(Decimal('0.01'))
            alloc_notes = (alloc.get('notes', '') or '').strip()

            if alloc_amt <= Decimal('0.00') or not inv_id:
                continue

            invoice = ProcurementDocument.objects.get(
                id=inv_id,
                company_id=company_id,
                vendor_id=vendor_id,
                document_type__in=['VENDOR_INVOICE', 'PURCHASE_ORDER']
            )

            if invoice.document_type == 'VENDOR_INVOICE' and invoice.status != 'POSTED':
                raise ValidationError(f"Cannot allocate payment to invoice {invoice.number} because its status is {invoice.status} (must be POSTED).")
            if invoice.document_type == 'PURCHASE_ORDER' and invoice.status not in ['APPROVED', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED']:
                raise ValidationError(f"Cannot allocate payment to Purchase Order {invoice.number} in status {invoice.status}.")

            # Check current outstanding balance
            inv_summary = get_invoice_payment_summary(invoice)
            current_outstanding = inv_summary['outstanding_amount']

            if alloc_amt > current_outstanding:
                raise ValidationError(
                    f"Overpayment blocked: Allocation of {invoice.currency} {alloc_amt} exceeds "
                    f"the outstanding balance of {invoice.currency} {current_outstanding} on {invoice.number}."
                )

            VendorPaymentAllocation.objects.create(
                company_id=company_id,
                payment=payment,
                invoice=invoice,
                amount=alloc_amt,
                notes=alloc_notes
            )
            allocated_total += alloc_amt

    if allocated_total > pay_amount:
        raise ValidationError(
            f"Total invoice/PO allocations ({allocated_total}) exceed the payment amount ({pay_amount})."
        )

    if auto_post:
        return post_vendor_payment(payment.id, user=user)

    return payment


def _resolve_bank_account_for_payment(payment: VendorPayment):
    import re
    from finance.models import BankAccount

    m = re.search(r'\[TREASURY:([^\]]+)\]', payment.notes or '')
    if m:
        ba = BankAccount.objects.filter(id=m.group(1), company_id=payment.company_id, is_deleted=False).first()
        if ba:
            return ba
    if payment.account_id:
        ba = BankAccount.objects.filter(chart_of_account_id=payment.account_id, company_id=payment.company_id, is_active=True, is_deleted=False).first()
        if ba:
            return ba
    if payment.bank_cash_account:
        for ba in BankAccount.objects.filter(company_id=payment.company_id, is_active=True, is_deleted=False):
            if ba.account_title and ba.account_title.lower() in payment.bank_cash_account.lower():
                return ba
    return BankAccount.objects.filter(company_id=payment.company_id, is_active=True, is_deleted=False).first()


@transaction.atomic
def post_vendor_payment(payment_id, user=None) -> VendorPayment:
    """
    Posts a DRAFT payment, applying the allocations to reduce invoice/PO outstanding balances
    and recording Treasury MONEY_OUT movement & Payment Voucher in Finance.
    """
    from finance.models import (
        FinancialVoucher, VoucherType, VoucherStatus,
        TreasuryTransactionType, PaymentMethod as FinPaymentMethod
    )
    from finance.services.treasury_service import TreasuryService
    from finance.services.period_service import ensure_open_period_and_foundation

    payment = VendorPayment.objects.select_for_update().get(id=payment_id)
    if payment.status != 'DRAFT':
        raise ValidationError(f"Only DRAFT payments can be posted. Current status: {payment.status}")

    ensure_open_period_and_foundation(payment.company, payment.payment_date)

    # Re-verify overpayment limits against all allocated invoices/POs with row locks
    for alloc in payment.allocations.select_related('invoice').all():
        invoice = ProcurementDocument.objects.select_for_update().get(id=alloc.invoice_id)
        if invoice.document_type == 'VENDOR_INVOICE' and invoice.status != 'POSTED':
            raise ValidationError(f"Cannot post payment: Invoice {invoice.number} is in status {invoice.status}.")
        if invoice.document_type == 'PURCHASE_ORDER' and invoice.status not in ['APPROVED', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED']:
            raise ValidationError(f"Cannot post payment: Purchase Order {invoice.number} is in status {invoice.status}.")

        summary = get_invoice_payment_summary(invoice)
        if alloc.amount > summary['outstanding_amount']:
            raise ValidationError(
                f"Overpayment blocked upon posting: Allocation of {alloc.amount} exceeds "
                f"the current outstanding balance of {summary['outstanding_amount']} on {invoice.number}."
            )

    payment.status = 'POSTED'
    payment.posted_by = user
    payment.posted_at = timezone.now()
    payment.save()

    # Sync payment_status on all affected invoices/POs
    for alloc in payment.allocations.select_related('invoice').all():
        sync_invoice_payment_status(alloc.invoice)

    # Record Financial Voucher & Treasury MONEY_OUT movement
    treasury_bank = _resolve_bank_account_for_payment(payment)
    if treasury_bank:
        method_map = {
            'BANK_TRANSFER': FinPaymentMethod.BANK_TRANSFER,
            'ONLINE_TRANSFER': FinPaymentMethod.ONLINE if hasattr(FinPaymentMethod, 'ONLINE') else FinPaymentMethod.BANK_TRANSFER,
            'CASH': FinPaymentMethod.CASH,
            'CHEQUE': FinPaymentMethod.CHEQUE,
        }
        fin_method = method_map.get(payment.payment_method, FinPaymentMethod.BANK_TRANSFER)
        existing_v = FinancialVoucher.objects.filter(
            company_id=payment.company_id,
            source_document_type='VENDOR_PAYMENT',
            source_document_id=payment.id,
            is_deleted=False
        ).first()
        voucher = existing_v or FinancialVoucher.objects.create(
            company=payment.company,
            voucher_type=VoucherType.PAYMENT_VOUCHER,
            date=payment.payment_date,
            amount=payment.amount,
            total_amount=payment.amount,
            currency=treasury_bank.currency,
            payment_method=fin_method,
            bank_account=treasury_bank,
            payee_name=payment.vendor.name,
            reference=payment.reference_number or payment.cheque_number or payment.payment_number,
            description=f"Vendor Payment {payment.payment_number} to {payment.vendor.name}",
            source_module='PURCHASING',
            source_document_type='VENDOR_PAYMENT',
            source_document_id=payment.id,
            status=VoucherStatus.POSTED,
            created_by=user,
            approved_by=user,
            approved_at=timezone.now(),
            posted_by=user,
            posted_at=timezone.now(),
        )
        TreasuryService.record_treasury_movement(
            bank_account=treasury_bank,
            voucher=voucher,
            transaction_type=TreasuryTransactionType.MONEY_OUT,
            money_in=Decimal('0.0000'),
            money_out=payment.amount,
            reference=payment.payment_number,
            description=f"Vendor Disbursement to {payment.vendor.name} ({payment.payment_number})",
            transaction_date=payment.payment_date,
            user=user,
        )

    return payment


@transaction.atomic
def cancel_draft_payment(payment_id, user=None) -> VendorPayment:
    """
    Cancels an unposted DRAFT payment.
    """
    payment = VendorPayment.objects.select_for_update().get(id=payment_id)
    if payment.status != 'DRAFT':
        raise ValidationError(f"Only DRAFT payments can be cancelled. For posted payments, use reversal.")

    payment.status = 'CANCELLED'
    payment.save()
    return payment


@transaction.atomic
def reverse_vendor_payment(payment_id, reversal_reason, user=None) -> VendorPayment:
    """
    Reverses a POSTED payment, restoring the outstanding balance on all allocated invoices.
    """
    if not reversal_reason or not str(reversal_reason).strip():
        raise ValidationError("A reversal reason is required to reverse a posted vendor payment.")

    payment = VendorPayment.objects.select_for_update().get(id=payment_id)
    if payment.status != 'POSTED':
        raise ValidationError(f"Only POSTED payments can be reversed. Current status: {payment.status}")

    # Lock allocated invoices
    allocated_invoices = [
        ProcurementDocument.objects.select_for_update().get(id=alloc.invoice_id)
        for alloc in payment.allocations.all()
    ]

    payment.status = 'REVERSED'
    payment.reversed_by = user
    payment.reversed_at = timezone.now()
    payment.reversal_reason = reversal_reason.strip()
    payment.save()

    # Resync invoice balances — now that this payment is REVERSED, it will no longer count towards paid_amount
    for inv in allocated_invoices:
        sync_invoice_payment_status(inv)

    return payment


def get_vendor_payable_summary(vendor_id, company_id) -> dict:
    """
    Returns aggregated accounts payable metrics for a specific vendor.
    """
    posted_invoices = ProcurementDocument.objects.filter(
        company_id=company_id,
        vendor_id=vendor_id,
        document_type='VENDOR_INVOICE',
        status='POSTED'
    )

    total_purchases = sum((Decimal(str(inv.total_amount or 0)) for inv in posted_invoices), Decimal('0.00')).quantize(Decimal('0.01'))
    
    posted_allocations = VendorPaymentAllocation.objects.filter(
        company_id=company_id,
        payment__vendor_id=vendor_id,
        payment__status='POSTED'
    )
    total_paid = sum((Decimal(str(a.amount or 0)) for a in posted_allocations), Decimal('0.00')).quantize(Decimal('0.01'))
    outstanding_payable = max(Decimal('0.00'), total_purchases - total_paid).quantize(Decimal('0.01'))

    today = timezone.now().date()
    overdue_payable = Decimal('0.00')
    overdue_count = 0
    unpaid_count = 0

    for inv in posted_invoices:
        inv_sum = get_invoice_payment_summary(inv)
        if inv_sum['payment_status'] == 'OVERDUE' or (inv_sum['is_overdue'] and inv_sum['outstanding_amount'] > 0):
            overdue_payable += inv_sum['outstanding_amount']
            overdue_count += 1
        if inv_sum['payment_status'] in ['UNPAID', 'PARTIALLY_PAID', 'OVERDUE']:
            unpaid_count += 1

    total_payments_count = VendorPayment.objects.filter(
        company_id=company_id,
        vendor_id=vendor_id
    ).exclude(status='CANCELLED').count()

    return {
        'vendor_id': str(vendor_id),
        'total_purchases': total_purchases,
        'total_paid': total_paid,
        'outstanding_payable': outstanding_payable,
        'overdue_payable': overdue_payable.quantize(Decimal('0.01')),
        'total_posted_invoices_count': posted_invoices.count(),
        'unpaid_invoices_count': unpaid_count,
        'overdue_invoices_count': overdue_count,
        'total_payments_count': total_payments_count,
    }


def get_accounts_payable_list(company_id, vendor_id=None, status_filter=None, search=None) -> list:
    """
    Returns the comprehensive Accounts Payable items list with live paid and outstanding amounts.
    """
    qs = ProcurementDocument.objects.filter(
        company_id=company_id,
        document_type='VENDOR_INVOICE',
        status='POSTED'
    ).select_related('vendor', 'parent_document').prefetch_related('payment_allocations__payment')

    if vendor_id:
        qs = qs.filter(vendor_id=vendor_id)

    if search and str(search).strip():
        q = str(search).strip()
        qs = qs.filter(
            models.Q(number__icontains=q) |
            models.Q(vendor_invoice_number__icontains=q) |
            models.Q(vendor__name__icontains=q) |
            models.Q(parent_document__number__icontains=q)
        )

    results = []
    for inv in qs:
        summary = get_invoice_payment_summary(inv)
        current_status = summary['payment_status']

        if status_filter and status_filter != 'ALL':
            if status_filter == 'OVERDUE' and not summary['is_overdue']:
                continue
            elif status_filter != 'OVERDUE' and current_status != status_filter:
                continue

        results.append({
            'invoice_id': str(inv.id),
            'invoice_number': inv.number,
            'vendor_invoice_number': inv.vendor_invoice_number,
            'vendor_id': str(inv.vendor_id) if inv.vendor_id else None,
            'vendor_name': inv.vendor.name if inv.vendor else 'Direct Supplier',
            'vendor_code': inv.vendor.code if inv.vendor else '',
            'parent_document_id': str(inv.parent_document_id) if inv.parent_document_id else None,
            'parent_document_number': inv.parent_document.number if inv.parent_document else 'N/A',
            'document_date': str(inv.document_date),
            'due_date': str(inv.due_date) if inv.due_date else None,
            'currency': inv.currency,
            'total_amount': summary['total_amount'],
            'original_amount': summary['original_amount'],
            'return_credit': summary['return_credit'],
            'net_amount': summary['net_amount'],
            'paid_amount': summary['paid_amount'],
            'outstanding_amount': summary['outstanding_amount'],
            'unallocated_credit': summary['unallocated_credit'],
            'payment_status': current_status,
            'is_overdue': summary['is_overdue'],
            'created_at': inv.created_at.isoformat()
        })

    return results
