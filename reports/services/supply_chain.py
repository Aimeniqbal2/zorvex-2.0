"""
reports/services/supply_chain.py

Phase 8E-1 — Supply Chain Analytics Reporting Service
Covers Inventory Valuation, Low Stock/Reorder Report (Universal Item architecture),
Vendor Spend, and Procurement Cycle Time.
"""
from decimal import Decimal
from django.db.models import Sum, Count, F, Q, DecimalField
from django.db.models.functions import Coalesce

from reports.services.base import BaseReportingService
from inventory.models import Item, InventoryBalance
from purchasing.models import ProcurementDocument, ProcurementAuditTrail
from platform_core.models import Warehouse


class SupplyChainReportingService(BaseReportingService):
    def get_inventory_valuation(self, warehouse_id=None, as_queryset=False):
        """
        Calculates total inventory valuation using Universal Item architecture
        (Item, InventoryBalance, Warehouse) and Item.cost_price.
        Optimized with database-side aggregation.
        """
        from django.db.models import F, Sum, ExpressionWrapper, DecimalField, Count, Value, CharField
        
        balances = InventoryBalance.objects.filter(
            company_id=self.company_id,
            is_deleted=False,
            item__is_deleted=False,
        )

        if warehouse_id:
            balances = balances.filter(warehouse_id=warehouse_id)

        # Annotate each balance row with its line value first, then aggregate totals.
        # This avoids the cross-table F() multiplication inside aggregate() which can
        # produce NULL on some PostgreSQL configurations.
        annotated = balances.annotate(
            line_value=ExpressionWrapper(
                Coalesce(F('quantity'), Decimal('0.00'), output_field=DecimalField(max_digits=20, decimal_places=4))
                * Coalesce(F('item__cost_price'), Decimal('0.00'), output_field=DecimalField(max_digits=20, decimal_places=4)),
                output_field=DecimalField(max_digits=20, decimal_places=4)
            )
        )
        totals = annotated.aggregate(
            total_qty=Coalesce(Sum('quantity'), Decimal('0.00'), output_field=DecimalField(max_digits=20, decimal_places=4)),
            total_val=Coalesce(Sum('line_value'), Decimal('0.00'), output_field=DecimalField(max_digits=20, decimal_places=4)),
            count=Count('id')
        )

        items_qs = annotated.annotate(
            item_name=F('item__name'),
            sku=Coalesce(F('item__sku'), F('item__item_code'), Value(''), output_field=CharField()),
            category_name=Coalesce(F('item__category__name'), Value('Uncategorized'), output_field=CharField()),
            warehouse_name=Coalesce(F('warehouse__name'), Value('Default'), output_field=CharField()),
            unit_cost=F('item__cost_price'),
            unit_of_measure=F('item__unit_of_measure')
        ).values(
            'item_id',
            'item_name',
            'sku',
            'category_name',
            'warehouse_id',
            'warehouse_name',
            'quantity',
            'unit_cost',
            'line_value',
            'unit_of_measure'
        )

        if not as_queryset:
            # Map for JSON compatibility if needed
            items_list = []
            for item in items_qs:
                items_list.append({
                    'item_id': str(item['item_id']),
                    'item_name': item['item_name'],
                    'sku': item['sku'],
                    'category_name': item['category_name'],
                    'warehouse_id': str(item['warehouse_id']),
                    'warehouse_name': item['warehouse_name'],
                    'quantity': float(item['quantity'] or 0),
                    'unit_cost': float(item['unit_cost'] or 0),
                    'total_value': float(item['line_value'] or 0),
                    'unit_of_measure': item['unit_of_measure'],
                })
        else:
            items_list = items_qs

        return {
            'warehouse_id': str(warehouse_id) if warehouse_id else None,
            'total_items': totals['count'],
            'total_quantity': float(totals['total_qty']),
            'total_valuation': float(totals['total_val']),
            'items': items_list,
        }

    def get_low_stock_report(self, as_queryset=False):
        """
        Generates Low Stock / Reorder Report using Universal Item minimum_stock_level
        or reorder_level instead of legacy hardcoded thresholds.
        Optimized with Subquery and OuterRef. No full Python loops over all items.
        """
        from django.db.models import Subquery, OuterRef, DecimalField, F, Case, When, ExpressionWrapper, Value, CharField
        from django.db.models.functions import Coalesce

        balance_subquery = InventoryBalance.objects.filter(
            item=OuterRef('pk'),
            company_id=self.company_id,
            is_deleted=False
        ).values('item').annotate(
            total=Sum('quantity')
        ).values('total')

        items_qs = Item.objects.filter(
            company_id=self.company_id,
            is_deleted=False,
            track_inventory=True
        ).annotate(
            current_quantity=Coalesce(Subquery(balance_subquery), Decimal('0.00'), output_field=DecimalField()),
            threshold_used=Case(
                When(reorder_level__gt=Decimal('0.00'), then=F('reorder_level')),
                default=F('minimum_stock_level'),
                output_field=DecimalField()
            )
        ).filter(
            threshold_used__gt=Decimal('0.00'),
            current_quantity__lte=F('threshold_used')
        ).annotate(
            shortage=ExpressionWrapper(F('threshold_used') - F('current_quantity'), output_field=DecimalField()),
            _category_name=Coalesce(F('category__name'), Value('Uncategorized'), output_field=CharField()),
            _sku_display=Coalesce(F('sku'), F('item_code'), Value(''), output_field=CharField())
        ).values(
            'id', 'name', '_sku_display', '_category_name',
            'current_quantity', 'reorder_level', 'minimum_stock_level',
            'threshold_used', 'shortage', 'unit_of_measure'
        )

        if not as_queryset:
            shortage_items = []
            for item in items_qs:
                shortage_items.append({
                    'item_id': str(item['id']),
                    'item_name': item['name'],
                    'sku': item['_sku_display'],
                    'category_name': item['_category_name'],
                    'current_quantity': float(item['current_quantity'] or 0),
                    'reorder_level': float(item['reorder_level'] or 0),
                    'minimum_stock_level': float(item['minimum_stock_level'] or 0),
                    'threshold_used': float(item['threshold_used'] or 0),
                    'shortage': float(item['shortage'] or 0),
                    'unit_of_measure': item['unit_of_measure'],
                })
            return {
                'total_low_stock_items': len(shortage_items),
                'low_stock_items': shortage_items,
            }

        return {
            'total_low_stock_items': items_qs.count(),
            'low_stock_items': items_qs,
        }

    def get_vendor_spend(self, start_date=None, end_date=None):
        """
        Aggregates procurement spend by vendor (CRMEntity) using authoritative ProcurementDocument records.
        """
        doc_qs = ProcurementDocument.objects.filter(
            company_id=self.company_id,
            is_deleted=False,
            document_type='PURCHASE_ORDER',
        ).exclude(status__in=['DRAFT', 'CANCELLED', 'REJECTED'])

        if start_date:
            doc_qs = doc_qs.filter(document_date__gte=start_date)
        if end_date:
            doc_qs = doc_qs.filter(document_date__lte=end_date)

        vendor_summary = (
            doc_qs.values('crm_entity_id', 'crm_entity__name', 'crm_entity__code')
            .annotate(
                document_count=Count('id'),
                total_spend=Coalesce(Sum('total_amount'), Decimal('0.00'), output_field=DecimalField()),
            )
            .order_by('-total_spend')
        )

        vendors = [
            {
                'vendor_id': str(v['crm_entity_id']),
                'vendor_name': v['crm_entity__name'] or 'Unknown Vendor',
                'vendor_code': v['crm_entity__code'] or '',
                'document_count': v['document_count'],
                'total_spend': float(v['total_spend']),
            }
            for v in vendor_summary
        ]

        total_spend_all = sum(v['total_spend'] for v in vendors)

        return {
            'start_date': str(start_date) if start_date else None,
            'end_date': str(end_date) if end_date else None,
            'total_vendors': len(vendors),
            'overall_total_spend': float(total_spend_all),
            'vendors': vendors,
        }

    def get_procurement_cycle_time(self, start_date=None, end_date=None):
        """
        Calculates average procurement cycle times:
        1. Submitted -> Approved
        2. Approved -> Received
        using ProcurementAuditTrail timestamps.
        """
        audits = ProcurementAuditTrail.objects.filter(
            company_id=self.company_id,
            is_deleted=False,
            event__in=['SUBMITTED', 'APPROVED', 'RECEIVED'],
        ).select_related('document')

        if start_date:
            audits = audits.filter(document__document_date__gte=start_date)
        if end_date:
            audits = audits.filter(document__document_date__lte=end_date)

        # Group audit events by document_id
        doc_events = {}
        for a in audits:
            doc_id = a.document_id
            if doc_id not in doc_events:
                doc_events[doc_id] = {}
            doc_events[doc_id][a.event] = a.created_at

        sub_to_app_times = []
        app_to_rec_times = []

        for doc_id, events in doc_events.items():
            if 'SUBMITTED' in events and 'APPROVED' in events:
                delta_hrs = (events['APPROVED'] - events['SUBMITTED']).total_seconds() / 3600.0
                if delta_hrs >= 0:
                    sub_to_app_times.append(delta_hrs)

            if 'APPROVED' in events and 'RECEIVED' in events:
                delta_hrs = (events['RECEIVED'] - events['APPROVED']).total_seconds() / 3600.0
                if delta_hrs >= 0:
                    app_to_rec_times.append(delta_hrs)

        avg_sub_to_app = (sum(sub_to_app_times) / len(sub_to_app_times)) if sub_to_app_times else 0.0
        avg_app_to_rec = (sum(app_to_rec_times) / len(app_to_rec_times)) if app_to_rec_times else 0.0

        return {
            'start_date': str(start_date) if start_date else None,
            'end_date': str(end_date) if end_date else None,
            'total_documents_analyzed': len(doc_events),
            'avg_submission_to_approval_hours': round(avg_sub_to_app, 2),
            'avg_approval_to_receipt_hours': round(avg_app_to_rec, 2),
        }
