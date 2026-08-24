"""
reports/services/crm_analytics.py

Phase 8E-1 — CRM Analytics Reporting Service
Covers Customer Lifetime Value (CLV) using authoritative JournalEntryLine records
and Lead / Entity Breakdown analytics.
"""
from decimal import Decimal
from django.db.models import Sum, Count, DecimalField
from django.db.models.functions import Coalesce

from reports.services.base import BaseReportingService
from finance.models import JournalEntryLine
from crm.models import CRMEntity


class CRMAnalyticsReportingService(BaseReportingService):
    def get_customer_lifetime_value(self):
        """
        Calculates Customer Lifetime Value (CLV) using POSTED JournalEntryLine records
        linked to crm_entity for authoritative financial revenue recognition.
        """
        lines = JournalEntryLine.objects.filter(
            company_id=self.company_id,
            journal_entry__status='POSTED',
            crm_entity__isnull=False,
            account__account_group__group_type__in=['INCOME', 'OTHER_INCOME'],
        ).select_related('crm_entity')

        clv_summary = (
            lines.values('crm_entity_id', 'crm_entity__name', 'crm_entity__code', 'crm_entity__entity_type')
            .annotate(
                total_credit=Coalesce(Sum('credit'), Decimal('0.00'), output_field=DecimalField()),
                total_debit=Coalesce(Sum('debit'), Decimal('0.00'), output_field=DecimalField()),
            )
        )

        customer_list = []
        overall_clv = Decimal('0.00')

        for item in clv_summary:
            revenue = item['total_credit'] - item['total_debit']
            overall_clv += revenue

            customer_list.append({
                'customer_id': str(item['crm_entity_id']),
                'customer_name': item['crm_entity__name'],
                'customer_code': item['crm_entity__code'],
                'entity_type': item['crm_entity__entity_type'],
                'total_revenue': float(revenue),
            })

        # Sort by highest revenue
        customer_list.sort(key=lambda x: x['total_revenue'], reverse=True)

        return {
            'total_customers': len(customer_list),
            'overall_lifetime_value': float(overall_clv),
            'customers': customer_list,
        }

    def get_lead_conversion_report(self):
        """
        Generates Lead / CRM Entity distribution report.
        Documents historical conversion tracking architectural limits.
        """
        entities = CRMEntity.objects.filter(
            company_id=self.company_id,
            is_deleted=False,
        )

        type_counts = (
            entities.values('entity_type', 'active', 'status')
            .annotate(count=Count('id'))
            .order_by('entity_type', 'status')
        )

        breakdown = [
            {
                'entity_type': item['entity_type'],
                'status': item['status'],
                'active': item['active'],
                'count': item['count'],
            }
            for item in type_counts
        ]

        total_entities = sum(b['count'] for b in breakdown)
        lead_count = sum(b['count'] for b in breakdown if b['entity_type'] == 'LEAD')
        customer_count = sum(b['count'] for b in breakdown if b['entity_type'] == 'CUSTOMER')

        return {
            'total_entities': total_entities,
            'lead_count': lead_count,
            'customer_count': customer_count,
            'architectural_note': (
                "True historical conversion-stage duration tracking requires audit history logging on "
                "CRMEntity status changes. Currently reporting current entity distribution by type and status."
            ),
            'breakdown': breakdown,
        }
