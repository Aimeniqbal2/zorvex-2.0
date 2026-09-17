import logging
from decimal import Decimal
from datetime import date, timedelta
from django.utils import timezone
from django.db.models import Sum, Count, Q, Avg, F
from django.db import connection

from purchasing.models import (
    Vendor, ProcurementDocument, ProcurementLine,
    VendorPayment, VendorPaymentAllocation,
    PurchaseReturn, PurchaseReturnLine, VendorCreditNote,
    VendorReconciliation
)
from inventory.models import Item
from platform_core.models import Warehouse

logger = logging.getLogger(__name__)


# ===========================================================================
# 1. PURCHASING DASHBOARD KPIS
# ===========================================================================

def get_purchasing_dashboard_kpis(company_id, start_date=None, end_date=None):
    """
    Computes comprehensive purchasing operational and financial KPIs for a company tenant.
    Derives metrics strictly from existing procurement documents, payments, returns, and credits.
    """
    today = timezone.now().date()
    
    # 1. Purchase Orders KPIs
    po_qs = ProcurementDocument.objects.filter(
        company_id=company_id,
        document_type='PURCHASE_ORDER'
    )
    if start_date:
        po_qs = po_qs.filter(document_date__gte=start_date)
    if end_date:
        po_qs = po_qs.filter(document_date__lte=end_date)

    open_pos = po_qs.filter(status__in=['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ISSUED', 'PARTIALLY_RECEIVED'])
    open_po_count = open_pos.count()
    open_po_value = open_pos.aggregate(total=Sum('total_amount'))['total'] or Decimal('0.00')

    pending_po_approvals = po_qs.filter(status='PENDING_APPROVAL').count()
    pending_return_approvals = PurchaseReturn.objects.filter(
        company_id=company_id,
        status='PENDING_APPROVAL'
    ).count()
    total_pending_approvals = pending_po_approvals + pending_return_approvals

    # Pending deliveries: Approved or Partially Received POs
    pending_delivery_pos = po_qs.filter(status__in=['APPROVED', 'ISSUED', 'PARTIALLY_RECEIVED']).count()
    partially_received_pos = po_qs.filter(status='PARTIALLY_RECEIVED').count()

    # 2. Vendor Bills & Accounts Payable KPIs
    inv_qs = ProcurementDocument.objects.filter(
        company_id=company_id,
        document_type='VENDOR_INVOICE',
        status='POSTED'
    )
    posted_bills_count = inv_qs.count()
    posted_bills_value = inv_qs.aggregate(total=Sum('total_amount'))['total'] or Decimal('0.00')

    # Calculate net outstanding and overdue payables from invoices
    total_outstanding_payable = Decimal('0.00')
    total_overdue_payable = Decimal('0.00')

    # Get payments and credit allocations
    for inv in inv_qs.prefetch_related('payment_allocations', 'credit_notes'):
        orig_amount = inv.total_amount or Decimal('0.00')
        paid_amount = inv.payment_allocations.filter(
            payment__status='POSTED'
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

        return_credit = inv.credit_notes.filter(
            status='POSTED'
        ).aggregate(total=Sum('allocated_amount'))['total'] or Decimal('0.00')

        net_bill = max(Decimal('0.00'), orig_amount - return_credit)
        outstanding = max(Decimal('0.00'), net_bill - paid_amount)

        total_outstanding_payable += outstanding
        if inv.due_date and inv.due_date < today and outstanding > Decimal('0.00'):
            total_overdue_payable += outstanding

    # 3. Payments This Period
    pay_qs = VendorPayment.objects.filter(
        company_id=company_id,
        status='POSTED'
    )
    if start_date:
        pay_qs = pay_qs.filter(payment_date__gte=start_date)
    if end_date:
        pay_qs = pay_qs.filter(payment_date__lte=end_date)
    else:
        # Default to current month if no filter
        first_day_curr_month = today.replace(day=1)
        pay_qs = pay_qs.filter(payment_date__gte=first_day_curr_month)

    payments_count = pay_qs.count()
    payments_total = pay_qs.aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

    # 4. Returns & Unallocated Credits
    return_qs = PurchaseReturn.objects.filter(
        company_id=company_id,
        status='POSTED'
    )
    if start_date:
        return_qs = return_qs.filter(return_date__gte=start_date)
    if end_date:
        return_qs = return_qs.filter(return_date__lte=end_date)

    returns_count = return_qs.count()
    returns_total = return_qs.aggregate(total=Sum('total_return_amount'))['total'] or Decimal('0.00')

    unallocated_credits_total = VendorCreditNote.objects.filter(
        company_id=company_id,
        status='POSTED',
        unallocated_amount__gt=Decimal('0.00')
    ).aggregate(total=Sum('unallocated_amount'))['total'] or Decimal('0.00')

    return {
        'open_purchase_orders_count': open_po_count,
        'open_purchase_orders_value': str(open_po_value),
        'pending_approvals_count': total_pending_approvals,
        'pending_po_approvals_count': pending_po_approvals,
        'pending_return_approvals_count': pending_return_approvals,
        'pending_deliveries_count': pending_delivery_pos,
        'partially_received_pos_count': partially_received_pos,
        'posted_bills_count': posted_bills_count,
        'posted_bills_value': str(posted_bills_value),
        'outstanding_payables': str(total_outstanding_payable),
        'overdue_payables': str(total_overdue_payable),
        'payments_period_count': payments_count,
        'payments_period_total': str(payments_total),
        'purchase_returns_count': returns_count,
        'purchase_returns_total': str(returns_total),
        'unallocated_vendor_credits': str(unallocated_credits_total),
        'as_of_date': str(today)
    }


# ===========================================================================
# 2. OPERATIONAL PURCHASING REPORTS
# ===========================================================================

def get_purchasing_report(company_id, report_type, filters=None):
    """
    Generates structured reporting data for 13 operational purchasing reports.
    """
    filters = filters or {}
    start_date = filters.get('start_date')
    end_date = filters.get('end_date')
    vendor_id = filters.get('vendor')
    item_id = filters.get('item')
    status = filters.get('status')
    search = filters.get('search')

    today = timezone.now().date()

    if report_type == 'purchases_by_vendor':
        vendors = Vendor.objects.filter(company_id=company_id)
        if vendor_id and vendor_id != 'ALL':
            vendors = vendors.filter(id=vendor_id)
        if search:
            vendors = vendors.filter(Q(name__icontains=search) | Q(code__icontains=search))

        data = []
        for v in vendors:
            po_sub = ProcurementDocument.objects.filter(
                company_id=company_id,
                vendor_id=v.id,
                document_type='PURCHASE_ORDER',
                status__in=['APPROVED', 'ISSUED', 'PARTIALLY_RECEIVED', 'COMPLETED']
            )
            inv_sub = ProcurementDocument.objects.filter(
                company_id=company_id,
                vendor_id=v.id,
                document_type='VENDOR_INVOICE',
                status='POSTED'
            )
            if start_date:
                po_sub = po_sub.filter(document_date__gte=start_date)
                inv_sub = inv_sub.filter(document_date__gte=start_date)
            if end_date:
                po_sub = po_sub.filter(document_date__lte=end_date)
                inv_sub = inv_sub.filter(document_date__lte=end_date)

            po_agg = po_sub.aggregate(total=Sum('total_amount'), count=Count('id'))
            inv_agg = inv_sub.aggregate(total=Sum('total_amount'), count=Count('id'))

            total_po_val = po_agg['total'] or Decimal('0.00')
            total_inv_val = inv_agg['total'] or Decimal('0.00')

            data.append({
                'vendor_id': str(v.id),
                'vendor_name': v.name,
                'vendor_code': v.code,
                'category': v.category.name if v.category else '-',
                'order_count': po_agg['count'] or 0,
                'total_ordered_amount': str(total_po_val),
                'invoice_count': inv_agg['count'] or 0,
                'total_invoiced_amount': str(total_inv_val),
                'currency': 'PKR'
            })
        return {'report_type': report_type, 'rows': data, 'count': len(data)}

    elif report_type == 'purchases_by_item':
        lines = ProcurementLine.objects.filter(
            company_id=company_id,
            document__document_type='PURCHASE_ORDER',
            document__status__in=['APPROVED', 'ISSUED', 'PARTIALLY_RECEIVED', 'COMPLETED']
        ).select_related('item', 'document', 'document__vendor')

        if start_date:
            lines = lines.filter(document__document_date__gte=start_date)
        if end_date:
            lines = lines.filter(document__document_date__lte=end_date)
        if item_id and item_id != 'ALL':
            lines = lines.filter(item_id=item_id)
        if vendor_id and vendor_id != 'ALL':
            lines = lines.filter(document__vendor_id=vendor_id)
        if search:
            lines = lines.filter(Q(item__name__icontains=search) | Q(item__sku__icontains=search))

        item_map = {}
        for line in lines:
            if not line.item:
                continue
            iid = str(line.item.id)
            if iid not in item_map:
                item_map[iid] = {
                    'item_id': iid,
                    'item_name': line.item.name,
                    'sku': line.item.sku,
                    'category': line.item.category.name if line.item.category else '-',
                    'total_ordered_qty': Decimal('0.00'),
                    'total_received_qty': Decimal('0.00'),
                    'total_spend': Decimal('0.00'),
                    'po_count': 0,
                    'vendors': set()
                }
            item_map[iid]['total_ordered_qty'] += line.quantity or Decimal('0.00')
            item_map[iid]['total_received_qty'] += line.received_quantity or Decimal('0.00')
            item_map[iid]['total_spend'] += line.total_amount or Decimal('0.00')
            item_map[iid]['po_count'] += 1
            if line.document.vendor:
                item_map[iid]['vendors'].add(line.document.vendor.name)

        rows = []
        for iid, val in item_map.items():
            qty = val['total_ordered_qty']
            avg_price = (val['total_spend'] / qty).quantize(Decimal('0.01')) if qty > 0 else Decimal('0.00')
            rows.append({
                'item_id': val['item_id'],
                'item_name': val['item_name'],
                'sku': val['sku'],
                'category': val['category'],
                'total_ordered_qty': str(val['total_ordered_qty'].quantize(Decimal('0.01'))),
                'total_received_qty': str(val['total_received_qty'].quantize(Decimal('0.01'))),
                'total_spend': str(val['total_spend']),
                'average_unit_cost': str(avg_price),
                'po_count': val['po_count'],
                'suppliers_count': len(val['vendors']),
                'currency': 'PKR'
            })
        return {'report_type': report_type, 'rows': rows, 'count': len(rows)}

    elif report_type == 'po_status':
        pos = ProcurementDocument.objects.filter(
            company_id=company_id,
            document_type='PURCHASE_ORDER'
        ).select_related('vendor', 'created_by').order_by('-document_date', '-created_at')

        if start_date:
            pos = pos.filter(document_date__gte=start_date)
        if end_date:
            pos = pos.filter(document_date__lte=end_date)
        if vendor_id and vendor_id != 'ALL':
            pos = pos.filter(vendor_id=vendor_id)
        if status and status != 'ALL':
            pos = pos.filter(status=status)
        if search:
            pos = pos.filter(Q(number__icontains=search) | Q(vendor__name__icontains=search))

        rows = []
        for p in pos:
            rows.append({
                'id': str(p.id),
                'po_number': p.number,
                'vendor_name': p.vendor.name if p.vendor else '-',
                'vendor_code': p.vendor.code if p.vendor else '-',
                'document_date': str(p.document_date),
                'expected_delivery_date': str(p.expected_delivery_date) if p.expected_delivery_date else '-',
                'status': p.status,
                'status_display': p.get_status_display() if hasattr(p, 'get_status_display') else p.status,
                'total_amount': str(p.total_amount or Decimal('0.00')),
                'currency': p.currency or 'PKR',
                'created_by': p.created_by.get_full_name() or p.created_by.username if p.created_by else '-'
            })
        return {'report_type': report_type, 'rows': rows, 'count': len(rows)}

    elif report_type == 'pending_deliveries':
        # Open lines where received_quantity < quantity
        lines = ProcurementLine.objects.filter(
            company_id=company_id,
            document__document_type='PURCHASE_ORDER',
            document__status__in=['APPROVED', 'ISSUED', 'PARTIALLY_RECEIVED']
        ).select_related('item', 'document', 'document__vendor').order_by('document__expected_delivery_date')

        if vendor_id and vendor_id != 'ALL':
            lines = lines.filter(document__vendor_id=vendor_id)
        if search:
            lines = lines.filter(Q(document__number__icontains=search) | Q(item__name__icontains=search))

        rows = []
        for line in lines:
            ordered = line.quantity or Decimal('0.00')
            received = line.received_quantity or Decimal('0.00')
            remaining = max(Decimal('0.00'), ordered - received)
            if remaining <= 0:
                continue

            exp_date = line.document.expected_delivery_date
            is_overdue = exp_date and exp_date < today

            rows.append({
                'po_number': line.document.number,
                'po_id': str(line.document.id),
                'vendor_name': line.document.vendor.name if line.document.vendor else '-',
                'item_name': line.item.name if line.item else '-',
                'sku': line.item.sku if line.item else '-',
                'ordered_quantity': str(ordered.quantize(Decimal('0.01'))),
                'received_quantity': str(received.quantize(Decimal('0.01'))),
                'pending_quantity': str(remaining.quantize(Decimal('0.01'))),
                'unit_price': str(line.unit_price or Decimal('0.00')),
                'pending_value': str((remaining * (line.unit_price or Decimal('0.00'))).quantize(Decimal('0.01'))),
                'expected_delivery_date': str(exp_date) if exp_date else '-',
                'is_overdue': is_overdue,
                'days_overdue': (today - exp_date).days if (is_overdue and exp_date) else 0
            })
        return {'report_type': report_type, 'rows': rows, 'count': len(rows)}

    elif report_type == 'grn_receiving_history':
        grns = ProcurementDocument.objects.filter(
            company_id=company_id,
            document_type='GOODS_RECEIPT'
        ).select_related('vendor', 'warehouse', 'created_by').order_by('-document_date', '-created_at')

        if start_date:
            grns = grns.filter(document_date__gte=start_date)
        if end_date:
            grns = grns.filter(document_date__lte=end_date)
        if vendor_id and vendor_id != 'ALL':
            grns = grns.filter(vendor_id=vendor_id)
        if status and status != 'ALL':
            grns = grns.filter(status=status)
        if search:
            grns = grns.filter(Q(number__icontains=search) | Q(delivery_note_number__icontains=search))

        rows = []
        for g in grns:
            lines_agg = g.lines.aggregate(
                rec=Sum('received_quantity'),
                acc=Sum('accepted_quantity'),
                rej=Sum('rejected_quantity')
            )
            rows.append({
                'id': str(g.id),
                'grn_number': g.number,
                'delivery_note_number': g.vendor_invoice_number or g.reference_number or '-',
                'vendor_name': g.vendor.name if g.vendor else '-',
                'warehouse_name': g.warehouse.name if g.warehouse else '-',
                'document_date': str(g.document_date),
                'status': g.status,
                'total_received_qty': str((lines_agg['rec'] or Decimal('0.00')).quantize(Decimal('0.01'))),
                'total_accepted_qty': str((lines_agg['acc'] or Decimal('0.00')).quantize(Decimal('0.01'))),
                'total_rejected_qty': str((lines_agg['rej'] or Decimal('0.00')).quantize(Decimal('0.01'))),
                'created_by': g.created_by.get_full_name() or g.created_by.username if g.created_by else '-'
            })
        return {'report_type': report_type, 'rows': rows, 'count': len(rows)}

    elif report_type == 'vendor_bills':
        bills = ProcurementDocument.objects.filter(
            company_id=company_id,
            document_type='VENDOR_INVOICE'
        ).select_related('vendor', 'created_by').order_by('-document_date', '-created_at')

        if start_date:
            bills = bills.filter(document_date__gte=start_date)
        if end_date:
            bills = bills.filter(document_date__lte=end_date)
        if vendor_id and vendor_id != 'ALL':
            bills = bills.filter(vendor_id=vendor_id)
        if status and status != 'ALL':
            bills = bills.filter(status=status)
        if search:
            bills = bills.filter(Q(number__icontains=search) | Q(vendor_invoice_number__icontains=search))

        rows = []
        for b in bills:
            paid = b.payment_allocations.filter(
                payment__status='POSTED'
            ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

            credits = b.credit_notes.filter(
                status='POSTED'
            ).aggregate(total=Sum('allocated_amount'))['total'] or Decimal('0.00')

            orig = b.total_amount or Decimal('0.00')
            net = max(Decimal('0.00'), orig - credits)
            outstanding = max(Decimal('0.00'), net - paid)

            match_status = getattr(b, 'match_status', 'NOT_MATCHED') or 'NOT_MATCHED'

            rows.append({
                'id': str(b.id),
                'bill_number': b.number,
                'vendor_invoice_number': b.vendor_invoice_number or '-',
                'vendor_name': b.vendor.name if b.vendor else '-',
                'document_date': str(b.document_date),
                'due_date': str(b.due_date) if b.due_date else '-',
                'status': b.status,
                'match_status': match_status,
                'original_amount': str(orig),
                'return_credits': str(credits),
                'paid_amount': str(paid),
                'outstanding_payable': str(outstanding),
                'currency': b.currency or 'PKR'
            })
        return {'report_type': report_type, 'rows': rows, 'count': len(rows)}

    elif report_type == 'three_way_match_exceptions':
        bills = ProcurementDocument.objects.filter(
            company_id=company_id,
            document_type='VENDOR_INVOICE'
        ).select_related('vendor').order_by('-document_date')

        if vendor_id and vendor_id != 'ALL':
            bills = bills.filter(vendor_id=vendor_id)

        rows = []
        for b in bills:
            match_status = getattr(b, 'match_status', None)
            price_var = getattr(b, 'has_price_variance', False)
            qty_var = getattr(b, 'has_quantity_variance', False)

            # Match exceptions: flagged variances or failed match status
            if price_var or qty_var or match_status in ['FAILED', 'PRICE_MISMATCH', 'QUANTITY_MISMATCH', 'FLAGGED']:
                rows.append({
                    'id': str(b.id),
                    'bill_number': b.number,
                    'vendor_invoice_number': b.vendor_invoice_number or '-',
                    'vendor_name': b.vendor.name if b.vendor else '-',
                    'document_date': str(b.document_date),
                    'match_status': match_status or 'FLAGGED',
                    'has_price_variance': price_var,
                    'has_quantity_variance': qty_var,
                    'total_amount': str(b.total_amount or Decimal('0.00')),
                    'currency': b.currency or 'PKR',
                    'notes': b.notes or 'Three-way match discrepancy detected.'
                })
        return {'report_type': report_type, 'rows': rows, 'count': len(rows)}

    elif report_type == 'payments':
        pays = VendorPayment.objects.filter(
            company_id=company_id
        ).select_related('vendor', 'paid_by').order_by('-payment_date', '-created_at')

        if start_date:
            pays = pays.filter(payment_date__gte=start_date)
        if end_date:
            pays = pays.filter(payment_date__lte=end_date)
        if vendor_id and vendor_id != 'ALL':
            pays = pays.filter(vendor_id=vendor_id)
        if status and status != 'ALL':
            pays = pays.filter(status=status)
        if search:
            pays = pays.filter(Q(payment_number__icontains=search) | Q(reference_number__icontains=search))

        rows = []
        for p in pays:
            rows.append({
                'id': str(p.id),
                'payment_number': p.payment_number,
                'vendor_name': p.vendor.name if p.vendor else '-',
                'payment_date': str(p.payment_date),
                'amount': str(p.amount or Decimal('0.00')),
                'payment_method': p.payment_method,
                'reference_number': p.reference_number or '-',
                'cheque_number': p.cheque_number or '-',
                'status': p.status,
                'currency': p.currency or 'PKR',
                'paid_by': p.paid_by.get_full_name() or p.paid_by.username if p.paid_by else '-'
            })
        return {'report_type': report_type, 'rows': rows, 'count': len(rows)}

    elif report_type == 'purchase_returns':
        rets = PurchaseReturn.objects.filter(
            company_id=company_id
        ).select_related('vendor', 'warehouse', 'created_by').order_by('-return_date', '-created_at')

        if start_date:
            rets = rets.filter(return_date__gte=start_date)
        if end_date:
            rets = rets.filter(return_date__lte=end_date)
        if vendor_id and vendor_id != 'ALL':
            rets = rets.filter(vendor_id=vendor_id)
        if status and status != 'ALL':
            rets = rets.filter(status=status)
        if search:
            rets = rets.filter(Q(return_number__icontains=search) | Q(reason__icontains=search))

        rows = []
        for r in rets:
            rows.append({
                'id': str(r.id),
                'return_number': r.return_number,
                'vendor_name': r.vendor.name if r.vendor else '-',
                'warehouse_name': r.warehouse.name if r.warehouse else '-',
                'return_date': str(r.return_date),
                'reason': r.reason,
                'status': r.status,
                'total_amount': str(r.total_return_amount or Decimal('0.00')),
                'lines_count': r.lines.count(),
                'created_by': r.created_by.get_full_name() or r.created_by.username if r.created_by else '-'
            })
        return {'report_type': report_type, 'rows': rows, 'count': len(rows)}

    elif report_type == 'vendor_credits':
        cns = VendorCreditNote.objects.filter(
            company_id=company_id
        ).select_related('vendor', 'vendor_invoice', 'purchase_return').order_by('-created_at')

        if vendor_id and vendor_id != 'ALL':
            cns = cns.filter(vendor_id=vendor_id)
        if status and status != 'ALL':
            cns = cns.filter(status=status)

        rows = []
        for c in cns:
            rows.append({
                'id': str(c.id),
                'credit_note_number': c.credit_note_number,
                'vendor_name': c.vendor.name if c.vendor else '-',
                'invoice_number': c.vendor_invoice.number if c.vendor_invoice else '-',
                'return_number': c.purchase_return.return_number if c.purchase_return else '-',
                'amount': str(c.amount or Decimal('0.00')),
                'allocated_amount': str(c.allocated_amount or Decimal('0.00')),
                'unallocated_amount': str(c.unallocated_amount or Decimal('0.00')),
                'status': c.status,
                'currency': c.currency or 'PKR',
                'created_at': str(c.created_at.date()) if c.created_at else '-'
            })
        return {'report_type': report_type, 'rows': rows, 'count': len(rows)}

    # Fallback / Default
    return {'report_type': report_type, 'rows': [], 'count': 0}


# ===========================================================================
# 3. VENDOR PERFORMANCE ANALYTICS
# ===========================================================================

def get_vendor_performance_metrics(vendor_id, company_id):
    """
    Calculates detailed operational & commercial performance metrics for a single vendor
    from historical transactions.
    """
    vendor = Vendor.objects.get(id=vendor_id, company_id=company_id)
    today = timezone.now().date()

    # 1. Total Orders & Value
    pos = ProcurementDocument.objects.filter(
        company_id=company_id,
        vendor_id=vendor_id,
        document_type='PURCHASE_ORDER'
    )
    approved_pos = pos.filter(status__in=['APPROVED', 'ISSUED', 'PARTIALLY_RECEIVED', 'COMPLETED'])
    total_orders = approved_pos.count()
    total_purchase_val = approved_pos.aggregate(total=Sum('total_amount'))['total'] or Decimal('0.00')

    last_po = approved_pos.order_by('-document_date').first()
    last_purchase_date = str(last_po.document_date) if last_po else None

    # 2. Average Delivery Time & On-Time Delivery %
    # Compare PO approved_at / document_date to GRN document_date
    delivery_days_list = []
    on_time_grns = 0
    total_grns_evaluated = 0

    grns = ProcurementDocument.objects.filter(
        company_id=company_id,
        vendor_id=vendor_id,
        document_type='GOODS_RECEIPT',
        status='POSTED'
    ).select_related('parent_document')

    for grn in grns:
        total_grns_evaluated += 1
        po = grn.parent_document
        if po and po.document_date and grn.document_date:
            days = (grn.document_date - po.document_date).days
            if days >= 0:
                delivery_days_list.append(days)

            # Check on-time against PO expected delivery date
            if po.expected_delivery_date:
                if grn.document_date <= po.expected_delivery_date:
                    on_time_grns += 1
            else:
                on_time_grns += 1  # No expected date, consider normal

    avg_delivery_time_days = round(sum(delivery_days_list) / len(delivery_days_list), 1) if delivery_days_list else 0.0
    on_time_delivery_pct = round((on_time_grns / total_grns_evaluated) * 100, 1) if total_grns_evaluated > 0 else 100.0

    # 3. Quantity Fulfillment % (Received vs Ordered)
    po_lines_agg = ProcurementLine.objects.filter(
        company_id=company_id,
        document__vendor_id=vendor_id,
        document__document_type='PURCHASE_ORDER',
        document__status__in=['APPROVED', 'ISSUED', 'PARTIALLY_RECEIVED', 'COMPLETED']
    ).aggregate(
        ordered=Sum('quantity'),
        received=Sum('received_quantity')
    )
    total_ordered = po_lines_agg['ordered'] or Decimal('0.00')
    total_received = po_lines_agg['received'] or Decimal('0.00')

    fulfillment_pct = round(float(total_received / total_ordered) * 100, 1) if total_ordered > 0 else 100.0

    # 4. Return & Rejection Rate
    returns_agg = PurchaseReturnLine.objects.filter(
        company_id=company_id,
        purchase_return__vendor_id=vendor_id,
        purchase_return__status='POSTED'
    ).aggregate(ret_qty=Sum('return_quantity'))
    total_returned_qty = returns_agg['ret_qty'] or Decimal('0.00')

    return_rate_pct = round(float(total_returned_qty / total_received) * 100, 1) if total_received > 0 else 0.0

    # 5. 3-Way Match Rate & Price Variance %
    bills = ProcurementDocument.objects.filter(
        company_id=company_id,
        vendor_id=vendor_id,
        document_type='VENDOR_INVOICE'
    )
    total_bills = bills.count()
    clean_matched_bills = 0
    price_variances = []

    for b in bills:
        has_pvar = getattr(b, 'has_price_variance', False)
        has_qvar = getattr(b, 'has_quantity_variance', False)
        match_st = getattr(b, 'match_status', 'NOT_MATCHED')

        if match_st in ['MATCHED', 'AUTO_MATCHED'] or (not has_pvar and not has_qvar and b.status == 'POSTED'):
            clean_matched_bills += 1

        if has_pvar:
            price_variances.append(1)

    invoice_match_rate_pct = round((clean_matched_bills / total_bills) * 100, 1) if total_bills > 0 else 100.0
    price_variance_count = len(price_variances)

    # 6. Outstanding Payable & Credit
    from purchasing.services.statement_service import get_vendor_statement
    statement = get_vendor_statement(vendor_id, company_id)

    return {
        'vendor_id': str(vendor.id),
        'vendor_name': vendor.name,
        'vendor_code': vendor.code,
        'category': vendor.category.name if vendor.category else '-',
        'manual_rating': str(vendor.rating) if vendor.rating is not None else None,
        'total_purchase_value': str(total_purchase_val),
        'number_of_orders': total_orders,
        'average_delivery_time_days': avg_delivery_time_days,
        'on_time_delivery_pct': on_time_delivery_pct,
        'quantity_fulfillment_pct': fulfillment_pct,
        'return_rate_pct': return_rate_pct,
        'invoice_match_rate_pct': invoice_match_rate_pct,
        'price_variance_count': price_variance_count,
        'outstanding_payable': str(statement['outstanding_payable']),
        'unallocated_credit': str(statement['unallocated_credit']),
        'last_purchase_date': last_purchase_date,
        'currency': 'PKR'
    }


def get_all_vendors_performance(company_id):
    """
    Aggregates performance scorecards for all vendors in a company.
    """
    vendors = Vendor.objects.filter(company_id=company_id, is_deleted=False).order_by('name')
    scorecards = []
    for v in vendors:
        scorecards.append(get_vendor_performance_metrics(v.id, company_id))
    return scorecards


# ===========================================================================
# 4. VENDOR COMPARISON FOR INVENTORY ITEM
# ===========================================================================

def compare_vendors_for_item(item_id, company_id):
    """
    Allows purchasing teams to compare all suppliers for a specific inventory item using:
    - Latest Purchase Price
    - Last Purchase Date
    - Lead Time
    - Delivery Performance
    - Return / Defect Rate
    - Total Quantity Ordered
    """
    item = Item.objects.get(id=item_id, company_id=company_id)

    # Find all PO lines for this item
    lines = ProcurementLine.objects.filter(
        company_id=company_id,
        item_id=item_id,
        document__document_type='PURCHASE_ORDER',
        document__status__in=['APPROVED', 'ISSUED', 'PARTIALLY_RECEIVED', 'COMPLETED']
    ).select_related('document', 'document__vendor').order_by('-document__document_date')

    vendor_data_map = {}

    for line in lines:
        v = line.document.vendor
        if not v:
            continue
        vid = str(v.id)
        if vid not in vendor_data_map:
            vendor_data_map[vid] = {
                'vendor_id': vid,
                'vendor_name': v.name,
                'vendor_code': v.code,
                'manual_rating': str(v.rating) if v.rating is not None else None,
                'latest_price': str(line.unit_price or Decimal('0.00')),
                'latest_order_date': str(line.document.document_date),
                'total_orders_for_item': 0,
                'total_qty_ordered': Decimal('0.00'),
                'total_qty_received': Decimal('0.00'),
                'prices': []
            }
        vendor_data_map[vid]['total_orders_for_item'] += 1
        vendor_data_map[vid]['total_qty_ordered'] += line.quantity or Decimal('0.00')
        vendor_data_map[vid]['total_qty_received'] += line.received_quantity or Decimal('0.00')
        if line.unit_price:
            vendor_data_map[vid]['prices'].append(line.unit_price)

    comparison_rows = []
    for vid, val in vendor_data_map.items():
        perf = get_vendor_performance_metrics(vid, company_id)
        prices = val['prices']
        lowest_price = min(prices) if prices else Decimal('0.00')
        avg_price = (sum(prices) / len(prices)).quantize(Decimal('0.01')) if prices else Decimal('0.00')

        comparison_rows.append({
            'vendor_id': vid,
            'vendor_name': val['vendor_name'],
            'vendor_code': val['vendor_code'],
            'manual_rating': val['manual_rating'],
            'latest_purchase_price': val['latest_price'],
            'lowest_purchase_price': str(lowest_price),
            'average_purchase_price': str(avg_price),
            'latest_order_date': val['latest_order_date'],
            'total_qty_ordered': str(val['total_qty_ordered']),
            'total_qty_received': str(val['total_qty_received']),
            'lead_time_days': perf['average_delivery_time_days'],
            'on_time_delivery_pct': perf['on_time_delivery_pct'],
            'return_rate_pct': perf['return_rate_pct'],
            'currency': 'PKR'
        })

    return {
        'item_id': str(item.id),
        'item_name': item.name,
        'sku': item.sku,
        'cost_price': str(item.cost_price or Decimal('0.00')),
        'suppliers_count': len(comparison_rows),
        'vendors': comparison_rows
    }


# ===========================================================================
# 5. PURCHASING EXCEPTION MONITOR
# ===========================================================================

def get_purchasing_exceptions(company_id):
    """
    Aggregates high-priority purchasing exceptions requiring operational or accounting review.
    """
    today = timezone.now().date()

    # 1. Overdue Deliveries
    overdue_po_lines = ProcurementLine.objects.filter(
        company_id=company_id,
        document__document_type='PURCHASE_ORDER',
        document__status__in=['APPROVED', 'ISSUED', 'PARTIALLY_RECEIVED'],
        document__expected_delivery_date__lt=today
    ).select_related('document', 'document__vendor', 'item')

    overdue_deliveries = []
    for line in overdue_po_lines:
        rem = max(Decimal('0.00'), (line.quantity or Decimal('0.00')) - (line.received_quantity or Decimal('0.00')))
        if rem > 0:
            exp_date = line.document.expected_delivery_date
            overdue_deliveries.append({
                'po_id': str(line.document.id),
                'po_number': line.document.number,
                'vendor_name': line.document.vendor.name if line.document.vendor else '-',
                'item_name': line.item.name if line.item else '-',
                'pending_quantity': str(rem),
                'expected_delivery_date': str(exp_date),
                'days_overdue': (today - exp_date).days if exp_date else 0
            })

    # 2. 3-Way Match Mismatches
    bills = ProcurementDocument.objects.filter(
        company_id=company_id,
        document_type='VENDOR_INVOICE'
    ).select_related('vendor')

    match_mismatches = []
    for b in bills:
        has_pvar = getattr(b, 'has_price_variance', False)
        has_qvar = getattr(b, 'has_quantity_variance', False)
        match_st = getattr(b, 'match_status', None)

        if has_pvar or has_qvar or match_st in ['FAILED', 'PRICE_MISMATCH', 'QUANTITY_MISMATCH', 'FLAGGED']:
            match_mismatches.append({
                'bill_id': str(b.id),
                'bill_number': b.number,
                'vendor_invoice_number': b.vendor_invoice_number or '-',
                'vendor_name': b.vendor.name if b.vendor else '-',
                'document_date': str(b.document_date),
                'total_amount': str(b.total_amount or Decimal('0.00')),
                'issue': 'Price Variance' if has_pvar else 'Quantity Variance' if has_qvar else 'Match Flagged'
            })

    # 3. Overdue Payables
    overdue_bills = ProcurementDocument.objects.filter(
        company_id=company_id,
        document_type='VENDOR_INVOICE',
        status='POSTED',
        due_date__lt=today
    ).select_related('vendor')

    overdue_payables = []
    for b in overdue_bills:
        paid = b.payment_allocations.filter(payment__status='POSTED').aggregate(t=Sum('amount'))['t'] or Decimal('0.00')
        credits = b.credit_notes.filter(status='POSTED').aggregate(t=Sum('allocated_amount'))['t'] or Decimal('0.00')
        orig = b.total_amount or Decimal('0.00')
        net = max(Decimal('0.00'), orig - credits)
        out = max(Decimal('0.00'), net - paid)

        if out > Decimal('0.00'):
            overdue_payables.append({
                'bill_id': str(b.id),
                'bill_number': b.number,
                'vendor_name': b.vendor.name if b.vendor else '-',
                'due_date': str(b.due_date),
                'days_overdue': (today - b.due_date).days,
                'outstanding_payable': str(out)
            })

    # 4. Unallocated Vendor Credits
    unalloc_credits = VendorCreditNote.objects.filter(
        company_id=company_id,
        status='POSTED',
        unallocated_amount__gt=Decimal('0.00')
    ).select_related('vendor')

    unallocated_credits_list = []
    for c in unalloc_credits:
        unallocated_credits_list.append({
            'credit_note_id': str(c.id),
            'credit_note_number': c.credit_note_number,
            'vendor_name': c.vendor.name if c.vendor else '-',
            'unallocated_amount': str(c.unallocated_amount),
            'created_at': str(c.created_at.date()) if c.created_at else '-'
        })

    # 5. Pending Statement Reconciliations with Variance
    recs = VendorReconciliation.objects.filter(
        company_id=company_id,
        status__in=['PENDING', 'VARIANCE']
    ).select_related('vendor')

    pending_reconciliations = []
    for r in recs:
        pending_reconciliations.append({
            'reconciliation_id': str(r.id),
            'reconciliation_number': r.reconciliation_number,
            'vendor_name': r.vendor.name if r.vendor else '-',
            'statement_date': str(r.statement_date),
            'variance': str(r.variance),
            'status': r.status
        })

    return {
        'as_of_date': str(today),
        'summary': {
            'overdue_deliveries_count': len(overdue_deliveries),
            'match_mismatches_count': len(match_mismatches),
            'overdue_payables_count': len(overdue_payables),
            'unallocated_credits_count': len(unallocated_credits_list),
            'pending_reconciliations_count': len(pending_reconciliations),
            'total_exceptions_count': len(overdue_deliveries) + len(match_mismatches) + len(overdue_payables) + len(unallocated_credits_list) + len(pending_reconciliations)
        },
        'overdue_deliveries': overdue_deliveries,
        'match_mismatches': match_mismatches,
        'overdue_payables': overdue_payables,
        'unallocated_credits': unallocated_credits_list,
        'pending_reconciliations': pending_reconciliations
    }


# ===========================================================================
# 6. SECURITY CRM PROCUREMENT DEMAND RETRIEVAL
# ===========================================================================

def get_crm_procurement_demand(company_id, proposal_id=None):
    """
    Exposes clean procurement demand from signed Security CRM proposals (S-2H handoff)
    without duplicating CRM data into purchasing tables.
    """
    try:
        from security_crm.models import SecurityProposal
        from security_crm.services.handoff import CRMCrossModuleHandoffService

        proposals = SecurityProposal.objects.filter(
            company_id=company_id
        ).filter(
            Q(is_handoff_ready=True) | Q(status__in=['APPROVED', 'CONTRACT_SIGNED'])
        ).order_by('-created_at')

        if proposal_id:
            proposals = proposals.filter(id=proposal_id)

        demand_records = []
        for prop in proposals:
            try:
                summary = CRMCrossModuleHandoffService.get_handoff_summary(prop)
                pur_handoff = summary.get('purchasing_handoff', {})
                items_demand = pur_handoff.get('procurement_demand', [])

                for item in items_demand:
                    demand_records.append({
                        'proposal_id': str(prop.id),
                        'proposal_number': prop.proposal_number,
                        'client_name': prop.client.name if prop.client else 'Direct Client',
                        'contract_code': pur_handoff.get('contract_code', prop.contract_reference or '-'),
                        'demand_id': item.get('procurement_demand_id'),
                        'item_name': item.get('item_name'),
                        'required_quantity': item.get('required_quantity'),
                        'location_name': item.get('location_name'),
                        'required_by_date': item.get('required_by_date'),
                        'charge_type': item.get('charge_type'),
                        'estimated_unit_cost': item.get('estimated_unit_cost'),
                        'estimated_total_cost': item.get('estimated_total_cost'),
                        'status': item.get('status', 'PROCUREMENT_DEMAND_READY')
                    })
            except Exception as e:
                logger.warning(f"Could not parse CRM handoff for proposal {prop.id}: {e}")

        return {
            'company_id': str(company_id),
            'proposals_count': proposals.count(),
            'total_demand_items_count': len(demand_records),
            'procurement_demand': demand_records
        }
    except ImportError:
        logger.info("Security CRM app not installed or available.")
        return {'company_id': str(company_id), 'proposals_count': 0, 'total_demand_items_count': 0, 'procurement_demand': []}
