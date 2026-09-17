"""
billing/services/ar_calculation_service.py
------------------------------------------
Authoritative calculation service for Accounts Receivable, aging buckets,
client summaries, and company-wide AR dashboard metrics.
"""
from decimal import Decimal
from django.utils import timezone
from django.db.models import Sum, Q, F
from billing.models import (
    ClientInvoice,
    ClientInvoiceStatus,
    ClientReceipt,
    ReceiptStatus,
    ClientReceiptAllocation,
    RecoveryStatus,
    RecoveryActivity,
    RecoveryActivityType,
)


class ARCalculationService:
    """
    Service for calculating AR metrics, aging analysis, and recovery summaries.
    """

    @classmethod
    def calculate_invoice_ar_metrics(cls, invoice: ClientInvoice, as_of_date=None):
        """
        Derives all AR metrics for a single invoice.
        """
        as_of = as_of_date or timezone.now().date()
        grand_total = Decimal(str(invoice.grand_total or '0.00'))

        # Calculate received amount strictly from valid POSTED receipt allocations
        posted_allocations = invoice.receipt_allocations.filter(
            is_deleted=False,
            receipt__status=ReceiptStatus.POSTED,
            receipt__is_deleted=False
        )
        if as_of_date:
            posted_allocations = posted_allocations.filter(receipt__receipt_date__lte=as_of)

        total_received = posted_allocations.aggregate(
            total=Sum('allocated_amount')
        )['total'] or Decimal('0.00')

        outstanding = max(Decimal('0.00'), grand_total - total_received)

        # Payment Status derivation
        if total_received >= grand_total and grand_total > 0:
            payment_status = ClientInvoiceStatus.PAID
        elif total_received > 0:
            payment_status = ClientInvoiceStatus.PARTIALLY_PAID
        elif invoice.due_date and invoice.due_date < as_of and outstanding > 0:
            payment_status = 'OVERDUE'
        else:
            payment_status = 'UNPAID'

        # Overdue tracking
        is_overdue = bool(invoice.due_date and invoice.due_date < as_of and outstanding > 0)
        days_overdue = (as_of - invoice.due_date).days if is_overdue else 0

        # Aging bucket
        if not is_overdue:
            aging_bucket = 'CURRENT'
        elif days_overdue <= 30:
            aging_bucket = '1_30'
        elif days_overdue <= 60:
            aging_bucket = '31_60'
        elif days_overdue <= 90:
            aging_bucket = '61_90'
        else:
            aging_bucket = '90_PLUS'

        return {
            'invoice_id': str(invoice.id),
            'invoice_number': invoice.invoice_number,
            'client_id': str(invoice.client_id),
            'client_name': invoice.client.name,
            'invoice_date': invoice.invoice_date,
            'due_date': invoice.due_date,
            'grand_total': grand_total,
            'received_amount': total_received,
            'outstanding_amount': outstanding,
            'is_overdue': is_overdue,
            'days_overdue': days_overdue,
            'payment_status': payment_status,
            'recovery_status': invoice.recovery_status,
            'aging_bucket': aging_bucket if outstanding > 0 else 'PAID',
        }

    @classmethod
    def get_client_ar_summary(cls, client, company, as_of_date=None):
        """
        Calculates cumulative AR summary and aging breakdown for a specific client.
        Excludes fully paid invoices from aging buckets.
        """
        as_of = as_of_date or timezone.now().date()
        invoices = ClientInvoice.objects.filter(
            company=company,
            client=client,
            is_deleted=False
        ).exclude(status__in=[ClientInvoiceStatus.CANCELLED, ClientInvoiceStatus.CREDITED])

        total_invoiced = Decimal('0.00')
        total_received = Decimal('0.00')
        total_outstanding = Decimal('0.00')
        total_overdue = Decimal('0.00')
        bucket_current = Decimal('0.00')
        bucket_1_30 = Decimal('0.00')
        bucket_31_60 = Decimal('0.00')
        bucket_61_90 = Decimal('0.00')
        bucket_90_plus = Decimal('0.00')

        for inv in invoices:
            metrics = cls.calculate_invoice_ar_metrics(inv, as_of)
            total_invoiced += metrics['grand_total']
            total_received += metrics['received_amount']
            outstanding = metrics['outstanding_amount']
            total_outstanding += outstanding

            # Fully paid invoices are excluded from aging
            if outstanding > Decimal('0.00'):
                if metrics['is_overdue']:
                    total_overdue += outstanding
                    days = metrics['days_overdue']
                    if days <= 30:
                        bucket_1_30 += outstanding
                    elif days <= 60:
                        bucket_31_60 += outstanding
                    elif days <= 90:
                        bucket_61_90 += outstanding
                    else:
                        bucket_90_plus += outstanding
                else:
                    bucket_current += outstanding

        # Calculate unallocated receipt amounts from posted receipts
        posted_receipts = ClientReceipt.objects.filter(
            company=company,
            client=client,
            status=ReceiptStatus.POSTED,
            is_deleted=False
        )
        total_receipts_amount = posted_receipts.aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        unallocated_amount = max(Decimal('0.00'), total_receipts_amount - total_received)

        return {
            'client_id': str(client.id),
            'client_name': client.name,
            'total_invoiced': total_invoiced,
            'total_received': total_received,
            'outstanding': total_outstanding,
            'overdue': total_overdue,
            'current': bucket_current,
            'aging_1_30': bucket_1_30,
            'aging_31_60': bucket_31_60,
            'aging_61_90': bucket_61_90,
            'aging_90_plus': bucket_90_plus,
            'unallocated_receipts_amount': unallocated_amount,
            'invoice_count': invoices.count(),
        }

    @classmethod
    def get_company_ar_summary(cls, company, as_of_date=None):
        """
        Calculates company-wide AR dashboard metrics without duplicating reporting tables.
        """
        as_of = as_of_date or timezone.now().date()
        invoices = ClientInvoice.objects.filter(
            company=company,
            is_deleted=False
        ).exclude(status__in=[ClientInvoiceStatus.CANCELLED, ClientInvoiceStatus.CREDITED])

        total_receivables = Decimal('0.00')
        current_receivables = Decimal('0.00')
        overdue_receivables = Decimal('0.00')
        disputed_amount = Decimal('0.00')
        invoices_due_soon_count = 0
        invoices_due_soon_amount = Decimal('0.00')

        seven_days_ahead = as_of + timezone.timedelta(days=7)

        for inv in invoices:
            metrics = cls.calculate_invoice_ar_metrics(inv, as_of)
            outstanding = metrics['outstanding_amount']
            if outstanding > Decimal('0.00'):
                total_receivables += outstanding
                if metrics['is_overdue']:
                    overdue_receivables += outstanding
                else:
                    current_receivables += outstanding
                    if inv.due_date and as_of <= inv.due_date <= seven_days_ahead:
                        invoices_due_soon_count += 1
                        invoices_due_soon_amount += outstanding

                if inv.recovery_status == RecoveryStatus.DISPUTED:
                    disputed_amount += outstanding

        # Collections this period (current calendar month)
        month_start = as_of.replace(day=1)
        collections_this_period = ClientReceipt.objects.filter(
            company=company,
            status=ReceiptStatus.POSTED,
            receipt_date__gte=month_start,
            receipt_date__lte=as_of,
            is_deleted=False
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

        # Broken / Missed Promises:
        # Activities with PROMISE_TO_PAY where promise_date < as_of and invoice still has outstanding
        broken_promises = []
        promise_activities = RecoveryActivity.objects.filter(
            company=company,
            activity_type=RecoveryActivityType.PROMISE_TO_PAY,
            promise_date__lt=as_of,
            is_deleted=False
        ).select_related('client', 'invoice')

        broken_promises_amount = Decimal('0.00')
        for act in promise_activities:
            if act.invoice:
                metrics = cls.calculate_invoice_ar_metrics(act.invoice, as_of)
                if metrics['outstanding_amount'] > 0:
                    broken_promises_amount += (act.promise_amount or metrics['outstanding_amount'])
                    broken_promises.append({
                        'activity_id': str(act.id),
                        'client_name': act.client.name,
                        'invoice_number': act.invoice.invoice_number,
                        'promise_date': act.promise_date,
                        'promise_amount': act.promise_amount,
                        'outstanding_amount': metrics['outstanding_amount'],
                    })

        return {
            'as_of_date': as_of,
            'total_receivables': total_receivables,
            'current_receivables': current_receivables,
            'overdue_receivables': overdue_receivables,
            'collections_this_period': collections_this_period,
            'invoices_due_soon_count': invoices_due_soon_count,
            'invoices_due_soon_amount': invoices_due_soon_amount,
            'broken_missed_promises_count': len(broken_promises),
            'broken_missed_promises_amount': broken_promises_amount,
            'broken_promises': broken_promises,
            'disputed_amount': disputed_amount,
        }

    @classmethod
    def get_ar_aging_report(cls, company, as_of_date=None):
        """
        Returns full aging breakdown across all clients.
        """
        as_of = as_of_date or timezone.now().date()
        from crm.models import CRMEntity
        clients = CRMEntity.objects.filter(
            company=company,
            client_invoices__isnull=False,
            is_deleted=False
        ).distinct()

        client_summaries = []
        totals = {
            'total_invoiced': Decimal('0.00'),
            'total_received': Decimal('0.00'),
            'outstanding': Decimal('0.00'),
            'overdue': Decimal('0.00'),
            'current': Decimal('0.00'),
            'aging_1_30': Decimal('0.00'),
            'aging_31_60': Decimal('0.00'),
            'aging_61_90': Decimal('0.00'),
            'aging_90_plus': Decimal('0.00'),
        }

        for cl in clients:
            summary = cls.get_client_ar_summary(cl, company, as_of)
            if summary['outstanding'] > Decimal('0.00') or summary['total_invoiced'] > Decimal('0.00'):
                client_summaries.append(summary)
                for key in totals:
                    totals[key] += summary[key]

        return {
            'as_of_date': as_of,
            'totals': totals,
            'clients': client_summaries,
        }
