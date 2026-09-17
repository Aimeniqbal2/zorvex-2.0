"""
purchasing/services/statement_service.py

Phase S-3G: Authoritative Vendor Statement, AP Aging & Reconciliation Engine.
- Dynamic chronological Vendor Statement derivation with running balances.
- AP Aging bucket calculation (Current, 1-30, 31-60, 61-90, 90+ days) based on Invoice Due Dates.
- Company-wide Accounts Payable aging matrix.
- Periodic Vendor Statement Balance Reconciliation with zero-variance auto-matching and resolution audit.
"""

from decimal import Decimal
from datetime import date, datetime
from django.db import models
from django.utils import timezone
from django.core.exceptions import ValidationError

from purchasing.models import (
    Vendor,
    ProcurementDocument,
    VendorPayment,
    VendorPaymentAllocation,
    VendorCreditNote,
    VendorReconciliation
)
from purchasing.services.payment_service import get_invoice_payment_summary


def get_vendor_statement(vendor_id, company_id, start_date=None, end_date=None) -> dict:
    """
    Derives the complete chronological financial ledger statement for a vendor.
    Pulls real-time data from Vendor Invoices, Payments, Payment Reversals, and Credit Notes.
    Calculates step-by-step running balance with non-negative payable invariants.
    """
    vendor = Vendor.objects.filter(id=vendor_id, company_id=company_id).first()
    if not vendor:
        raise ValidationError("Vendor does not exist or does not belong to your company.")

    # 1. Fetch Invoices (Bills)
    invoices = ProcurementDocument.objects.filter(
        company_id=company_id,
        vendor_id=vendor_id,
        document_type='VENDOR_INVOICE',
        status='POSTED'
    ).select_related('parent_document')

    # 2. Fetch Payments
    payments = VendorPayment.objects.filter(
        company_id=company_id,
        vendor_id=vendor_id,
        status__in=['POSTED', 'REVERSED']
    )

    # 3. Fetch Credit Notes
    credit_notes = VendorCreditNote.objects.filter(
        company_id=company_id,
        vendor_id=vendor_id,
        status='POSTED'
    ).select_related('purchase_return', 'vendor_invoice')

    # 4. Build unified raw timeline
    events = []

    for inv in invoices:
        doc_date = inv.document_date or inv.created_at.date()
        summary = get_invoice_payment_summary(inv)
        events.append({
            'date': doc_date,
            'created_at': inv.created_at,
            'transaction_type': 'INVOICE',
            'type_display': 'Vendor Bill',
            'reference': inv.number,
            'vendor_reference': inv.vendor_invoice_number or 'N/A',
            'parent_reference': inv.parent_document.number if inv.parent_document else 'N/A',
            'description': f"Vendor Invoice {inv.number} (PO: {inv.parent_document.number if inv.parent_document else 'N/A'})",
            'debit': Decimal(str(inv.total_amount or 0)).quantize(Decimal('0.01')),
            'credit': Decimal('0.00'),
            'status': summary['payment_status'],
            'due_date': str(inv.due_date) if inv.due_date else None,
            'source_id': str(inv.id)
        })

    for pay in payments:
        pay_date = pay.payment_date or pay.created_at.date()
        events.append({
            'date': pay_date,
            'created_at': pay.created_at,
            'transaction_type': 'PAYMENT',
            'type_display': 'Payment Voucher',
            'reference': pay.payment_number,
            'vendor_reference': pay.reference_number or pay.cheque_number or 'N/A',
            'parent_reference': 'N/A',
            'description': f"Vendor Payment ({pay.get_payment_method_display()}) - Ref: {pay.reference_number or 'N/A'}",
            'debit': Decimal('0.00'),
            'credit': Decimal(str(pay.amount or 0)).quantize(Decimal('0.01')),
            'status': pay.status,
            'due_date': None,
            'source_id': str(pay.id)
        })

        # If payment was reversed, record the reversal as a separate debit adjustment event
        if pay.status == 'REVERSED':
            rev_date = pay.reversed_at.date() if pay.reversed_at else pay_date
            events.append({
                'date': rev_date,
                'created_at': pay.reversed_at or pay.created_at,
                'transaction_type': 'PAYMENT_REVERSAL',
                'type_display': 'Payment Reversal',
                'reference': f"REV-{pay.payment_number}",
                'vendor_reference': pay.payment_number,
                'parent_reference': 'N/A',
                'description': f"Payment Reversal: {pay.reversal_reason or 'Settlement reversed'}",
                'debit': Decimal(str(pay.amount or 0)).quantize(Decimal('0.01')),
                'credit': Decimal('0.00'),
                'status': 'REVERSED',
                'due_date': None,
                'source_id': str(pay.id)
            })

    for cn in credit_notes:
        cn_date = cn.credit_date or cn.created_at.date()
        ret_num = cn.purchase_return.return_number if cn.purchase_return else 'N/A'
        events.append({
            'date': cn_date,
            'created_at': cn.created_at,
            'transaction_type': 'CREDIT_NOTE',
            'type_display': 'Vendor Credit Note',
            'reference': cn.credit_note_number,
            'vendor_reference': ret_num,
            'parent_reference': cn.vendor_invoice.number if cn.vendor_invoice else 'N/A',
            'description': f"Credit Note {cn.credit_note_number} (Return: {ret_num})",
            'debit': Decimal('0.00'),
            'credit': Decimal(str(cn.amount or 0)).quantize(Decimal('0.01')),
            'status': cn.status,
            'due_date': None,
            'source_id': str(cn.id)
        })

    # 5. Sort chronologically by date and creation timestamp
    events.sort(key=lambda x: (x['date'], x['created_at']))

    # 6. Compute running balances
    running_balance = Decimal('0.00')
    statement_rows = []
    opening_balance = Decimal('0.00')

    parsed_start = None
    if start_date:
        if isinstance(start_date, str):
            parsed_start = datetime.strptime(start_date, '%Y-%m-%d').date()
        elif isinstance(start_date, date):
            parsed_start = start_date

    parsed_end = None
    if end_date:
        if isinstance(end_date, str):
            parsed_end = datetime.strptime(end_date, '%Y-%m-%d').date()
        elif isinstance(end_date, date):
            parsed_end = end_date

    total_debit = Decimal('0.00')
    total_credit = Decimal('0.00')
    total_purchases = Decimal('0.00')
    total_payments = Decimal('0.00')
    total_credit_notes = Decimal('0.00')

    for ev in events:
        ev_date = ev['date']
        debit = ev['debit']
        credit = ev['credit']

        # Update totals regardless of date range
        if ev['transaction_type'] == 'INVOICE':
            total_purchases += debit
        elif ev['transaction_type'] == 'PAYMENT':
            total_payments += credit
        elif ev['transaction_type'] == 'CREDIT_NOTE':
            total_credit_notes += credit

        # If event is before start_date, it contributes to opening balance
        if parsed_start and ev_date < parsed_start:
            running_balance += (debit - credit)
            opening_balance = running_balance
            continue

        # If event is after end_date, skip rendering in statement rows
        if parsed_end and ev_date > parsed_end:
            continue

        running_balance += (debit - credit)
        total_debit += debit
        total_credit += credit

        statement_rows.append({
            'date': str(ev_date),
            'transaction_type': ev['transaction_type'],
            'type_display': ev['type_display'],
            'reference': ev['reference'],
            'vendor_reference': ev['vendor_reference'],
            'parent_reference': ev['parent_reference'],
            'description': ev['description'],
            'debit': debit,
            'credit': credit,
            'running_balance': running_balance.quantize(Decimal('0.01')),
            'status': ev['status'],
            'due_date': ev['due_date'],
            'source_id': ev['source_id']
        })

    # Unallocated credit calculation from credit notes and excess payments
    unallocated_cn = credit_notes.aggregate(tot=models.Sum('unallocated_amount'))['tot'] or Decimal('0.00')
    unallocated_credit = Decimal(str(unallocated_cn)).quantize(Decimal('0.01'))

    # Net outstanding payable
    current_payable = max(Decimal('0.00'), running_balance).quantize(Decimal('0.01'))

    return {
        'vendor_id': str(vendor.id),
        'vendor_name': vendor.name,
        'vendor_code': vendor.code,
        'currency': getattr(vendor, 'currency', 'PKR') or 'PKR',
        'opening_balance': opening_balance.quantize(Decimal('0.01')),
        'closing_balance': running_balance.quantize(Decimal('0.01')),
        'outstanding_payable': current_payable,
        'unallocated_credit': unallocated_credit,
        'total_purchases': total_purchases.quantize(Decimal('0.01')),
        'total_payments': total_payments.quantize(Decimal('0.01')),
        'total_credit_notes': total_credit_notes.quantize(Decimal('0.01')),
        'period_debit': total_debit.quantize(Decimal('0.01')),
        'period_credit': total_credit.quantize(Decimal('0.01')),
        'transactions_count': len(statement_rows),
        'transactions': statement_rows
    }


def get_vendor_aging(vendor_id, company_id, as_of_date=None) -> dict:
    """
    Computes AP Aging buckets for a vendor based on unpaid invoice due dates.
    Buckets: Current, 1-30 Days, 31-60 Days, 61-90 Days, 90+ Days.
    Guarantees: Fully paid invoices are excluded from aging.
    """
    vendor = Vendor.objects.filter(id=vendor_id, company_id=company_id).first()
    if not vendor:
        raise ValidationError("Vendor does not exist or does not belong to your company.")

    ref_date = date.today()
    if as_of_date:
        if isinstance(as_of_date, str):
            ref_date = datetime.strptime(as_of_date, '%Y-%m-%d').date()
        elif isinstance(as_of_date, date):
            ref_date = as_of_date

    invoices = ProcurementDocument.objects.filter(
        company_id=company_id,
        vendor_id=vendor_id,
        document_type='VENDOR_INVOICE',
        status='POSTED'
    ).select_related('parent_document').prefetch_related('payment_allocations__payment', 'credit_notes')

    bucket_current = Decimal('0.00')
    bucket_1_30 = Decimal('0.00')
    bucket_31_60 = Decimal('0.00')
    bucket_61_90 = Decimal('0.00')
    bucket_over_90 = Decimal('0.00')
    total_outstanding = Decimal('0.00')

    aging_invoices = []

    for inv in invoices:
        summary = get_invoice_payment_summary(inv)
        outstanding = summary['outstanding_amount']

        # Exclude fully settled bills from aging
        if outstanding <= Decimal('0.00'):
            continue

        total_outstanding += outstanding
        due_date = inv.due_date or inv.document_date or inv.created_at.date()

        days_overdue = (ref_date - due_date).days if due_date and due_date < ref_date else 0

        if days_overdue <= 0:
            bucket = 'CURRENT'
            bucket_current += outstanding
        elif 1 <= days_overdue <= 30:
            bucket = 'DAYS_1_30'
            bucket_1_30 += outstanding
        elif 31 <= days_overdue <= 60:
            bucket = 'DAYS_31_60'
            bucket_31_60 += outstanding
        elif 61 <= days_overdue <= 90:
            bucket = 'DAYS_61_90'
            bucket_61_90 += outstanding
        else:
            bucket = 'DAYS_OVER_90'
            bucket_over_90 += outstanding

        aging_invoices.append({
            'invoice_id': str(inv.id),
            'invoice_number': inv.number,
            'vendor_invoice_number': inv.vendor_invoice_number or 'N/A',
            'parent_po_number': inv.parent_document.number if inv.parent_document else 'N/A',
            'document_date': str(inv.document_date),
            'due_date': str(due_date),
            'days_overdue': days_overdue,
            'original_amount': summary['original_amount'],
            'return_credit': summary['return_credit'],
            'net_amount': summary['net_amount'],
            'paid_amount': summary['paid_amount'],
            'outstanding_amount': outstanding,
            'bucket': bucket,
            'payment_status': summary['payment_status']
        })

    # Sort aging invoices by days overdue descending
    aging_invoices.sort(key=lambda x: x['days_overdue'], reverse=True)

    unallocated_cn = VendorCreditNote.objects.filter(
        company_id=company_id,
        vendor_id=vendor_id,
        status='POSTED'
    ).aggregate(tot=models.Sum('unallocated_amount'))['tot'] or Decimal('0.00')
    unallocated_credit = Decimal(str(unallocated_cn)).quantize(Decimal('0.01'))

    return {
        'vendor_id': str(vendor.id),
        'vendor_name': vendor.name,
        'vendor_code': vendor.code,
        'currency': getattr(vendor, 'currency', 'PKR') or 'PKR',
        'as_of_date': str(ref_date),
        'total_outstanding': total_outstanding.quantize(Decimal('0.01')),
        'current': bucket_current.quantize(Decimal('0.01')),
        'days_1_30': bucket_1_30.quantize(Decimal('0.01')),
        'days_31_60': bucket_31_60.quantize(Decimal('0.01')),
        'days_61_90': bucket_61_90.quantize(Decimal('0.01')),
        'days_over_90': bucket_over_90.quantize(Decimal('0.01')),
        'unallocated_credit': unallocated_credit,
        'open_invoices_count': len(aging_invoices),
        'invoices': aging_invoices
    }


def get_company_ap_aging(company_id, as_of_date=None, vendor_id=None, bucket_filter=None) -> dict:
    """
    Computes company-wide Accounts Payable aging matrix grouped by vendor.
    Allows filtering by vendor or specific aging bucket.
    """
    vendors_qs = Vendor.objects.filter(company_id=company_id, status='ACTIVE')
    if vendor_id:
        vendors_qs = vendors_qs.filter(id=vendor_id)

    total_outstanding = Decimal('0.00')
    total_current = Decimal('0.00')
    total_1_30 = Decimal('0.00')
    total_31_60 = Decimal('0.00')
    total_61_90 = Decimal('0.00')
    total_over_90 = Decimal('0.00')
    total_unallocated_credit = Decimal('0.00')

    vendor_aging_rows = []

    for v in vendors_qs:
        v_aging = get_vendor_aging(v.id, company_id, as_of_date=as_of_date)

        # Skip vendors with no open invoices and no balance
        if v_aging['total_outstanding'] == Decimal('0.00') and v_aging['unallocated_credit'] == Decimal('0.00'):
            continue

        # If bucket filter requested, filter invoices within the vendor
        if bucket_filter and bucket_filter != 'ALL':
            matched_invoices = [inv for inv in v_aging['invoices'] if inv['bucket'] == bucket_filter]
            if not matched_invoices:
                continue

        total_outstanding += v_aging['total_outstanding']
        total_current += v_aging['current']
        total_1_30 += v_aging['days_1_30']
        total_31_60 += v_aging['days_31_60']
        total_61_90 += v_aging['days_61_90']
        total_over_90 += v_aging['days_over_90']
        total_unallocated_credit += v_aging['unallocated_credit']

        vendor_aging_rows.append({
            'vendor_id': v_aging['vendor_id'],
            'vendor_name': v_aging['vendor_name'],
            'vendor_code': v_aging['vendor_code'],
            'currency': v_aging['currency'],
            'total_outstanding': v_aging['total_outstanding'],
            'current': v_aging['current'],
            'days_1_30': v_aging['days_1_30'],
            'days_31_60': v_aging['days_31_60'],
            'days_61_90': v_aging['days_61_90'],
            'days_over_90': v_aging['days_over_90'],
            'unallocated_credit': v_aging['unallocated_credit'],
            'open_invoices_count': v_aging['open_invoices_count']
        })

    # Sort vendors by total outstanding descending
    vendor_aging_rows.sort(key=lambda x: x['total_outstanding'], reverse=True)

    return {
        'as_of_date': str(as_of_date or date.today()),
        'summary': {
            'total_outstanding': total_outstanding.quantize(Decimal('0.01')),
            'current': total_current.quantize(Decimal('0.01')),
            'days_1_30': total_1_30.quantize(Decimal('0.01')),
            'days_31_60': total_31_60.quantize(Decimal('0.01')),
            'days_61_90': total_61_90.quantize(Decimal('0.01')),
            'days_over_90': total_over_90.quantize(Decimal('0.01')),
            'total_unallocated_credit': total_unallocated_credit.quantize(Decimal('0.01')),
            'vendors_count': len(vendor_aging_rows)
        },
        'vendors': vendor_aging_rows
    }


def create_vendor_reconciliation(company_id, vendor_id, statement_date, vendor_reported_balance, notes='', user=None, as_of_date=None) -> VendorReconciliation:
    """
    Creates a new balance reconciliation record.
    Pulls live system balance as of as_of_date, compares with vendor reported balance, and auto-detects MATCHED vs VARIANCE.
    """
    vendor = Vendor.objects.filter(id=vendor_id, company_id=company_id).first()
    if not vendor:
        raise ValidationError("Vendor does not exist or does not belong to your company.")

    cutoff_date = as_of_date or statement_date or date.today()
    aging_data = get_vendor_aging(vendor_id, company_id, as_of_date=cutoff_date)
    system_balance = aging_data['total_outstanding']

    reported_bal = Decimal(str(vendor_reported_balance or 0)).quantize(Decimal('0.01'))
    variance = (system_balance - reported_bal).quantize(Decimal('0.01'))

    status = 'MATCHED' if variance == Decimal('0.00') else 'VARIANCE'

    rec = VendorReconciliation.objects.create(
        company_id=company_id,
        vendor=vendor,
        statement_date=statement_date or date.today(),
        as_of_date=cutoff_date,
        vendor_reported_balance=reported_bal,
        system_balance=system_balance,
        variance=variance,
        status=status,
        currency=getattr(vendor, 'currency', 'PKR') or 'PKR',
        notes=notes or '',
        reconciled_by=user,
        reconciled_at=timezone.now()
    )
    return rec


def resolve_vendor_reconciliation(reconciliation_id, company_id, resolution_notes, user) -> VendorReconciliation:
    """
    Marks a variance reconciliation as RESOLVED with audit tracking and investigation notes.
    """
    if not resolution_notes or not str(resolution_notes).strip():
        raise ValidationError("Resolution notes are required to resolve a reconciliation variance.")

    rec = VendorReconciliation.objects.filter(id=reconciliation_id, company_id=company_id).first()
    if not rec:
        raise ValidationError("Reconciliation record not found.")

    rec.status = 'RESOLVED'
    rec.resolution_notes = str(resolution_notes).strip()
    rec.resolved_by = user
    rec.resolved_at = timezone.now()
    rec.save(update_fields=['status', 'resolution_notes', 'resolved_by', 'resolved_at', 'updated_at'])
    return rec
