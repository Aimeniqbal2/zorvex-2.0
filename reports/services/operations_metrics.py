"""
reports/services/operations_metrics.py

Phase 8E-1 — Operations Analytics Reporting Service
Covers Service Contract Profitability and Operations Performance.
"""
from datetime import datetime, date
from decimal import Decimal
from django.db.models import Sum, Count, Q, DecimalField
from django.db.models.functions import Coalesce

from reports.services.base import BaseReportingService
from operations.models import (
    ServiceContract, OperationalSite, Deployment, DutyAssignment, ExtraDuty, ContractRate
)
from billing.models import ServiceInvoice, ServiceInvoiceLine


class OperationsMetricsReportingService(BaseReportingService):
    def get_contract_profitability(self, start_date=None, end_date=None):
        """
        Calculates Service Contract Profitability.
        Revenue: Derived from ServiceInvoice records linked to contracts.
        Operational Cost: Derived from completed DutyAssignment hours * ContractRate pay_rate.
        Financial Ledger Revenue: Explicitly reported alongside contract detail for reconciliation.
        Optimized with values().iterator() to avoid model hydration overhead.
        """
        contracts = ServiceContract.objects.filter(
            company_id=self.company_id,
            is_deleted=False,
        ).values('id', 'contract_code', 'crm_entity__name', 'status')

        # 1. Revenue per contract from billing.ServiceInvoice
        invoice_qs = ServiceInvoice.objects.filter(
            company_id=self.company_id,
            is_deleted=False,
            status='POSTED',
        )
        if start_date:
            invoice_qs = invoice_qs.filter(period_start__gte=start_date)
        if end_date:
            invoice_qs = invoice_qs.filter(period_end__lte=end_date)

        inv_totals = (
            invoice_qs.values('service_contract_id')
            .annotate(total_revenue=Coalesce(Sum('total_amount'), Decimal('0.00'), output_field=DecimalField()))
        )
        rev_by_contract = {item['service_contract_id']: item['total_revenue'] for item in inv_totals}

        # 2. Duties & Pay rate costs per contract
        duties_qs = DutyAssignment.objects.filter(
            company_id=self.company_id,
            is_deleted=False,
            status='COMPLETED',
            deployment__service_contract__isnull=False,
            start_time__isnull=False,
            end_time__isnull=False,
        )
        duties_qs = self.filter_by_date(duties_qs, 'date', start_date, end_date)
        
        duty_fields = ['deployment__service_contract_id', 'deployment__designation_id', 'start_time', 'end_time']
        duties_records = duties_qs.values(*duty_fields).iterator(chunk_size=2000)

        # Pre-fetch contract rates: (contract_id, designation_id) -> pay_rate
        rates_qs = ContractRate.objects.filter(
            company_id=self.company_id,
            is_deleted=False,
        ).order_by('-effective_date').values('service_contract_id', 'designation_id', 'pay_rate')

        rate_map = {}
        for r in rates_qs:
            key = (r['service_contract_id'], r['designation_id'])
            if key not in rate_map:
                rate_map[key] = r['pay_rate']

        costs_by_contract = {}
        hours_by_contract = {}

        for duty in duties_records:
            contract_id = duty['deployment__service_contract_id']
            designation_id = duty['deployment__designation_id']

            dt_start = datetime.combine(date.min, duty['start_time'])
            dt_end = datetime.combine(date.min, duty['end_time'])
            hours = max(0.0, (dt_end - dt_start).total_seconds() / 3600.0)

            pay_rate = rate_map.get((contract_id, designation_id), Decimal('0.00'))
            cost = Decimal(str(hours)) * pay_rate

            costs_by_contract[contract_id] = costs_by_contract.get(contract_id, Decimal('0.00')) + cost
            hours_by_contract[contract_id] = hours_by_contract.get(contract_id, 0.0) + hours

        contract_results = []
        total_rev = Decimal('0.00')
        total_cost = Decimal('0.00')

        for c in contracts:
            c_id = c['id']
            c_rev = rev_by_contract.get(c_id, Decimal('0.00'))
            c_cost = costs_by_contract.get(c_id, Decimal('0.00'))
            c_profit = c_rev - c_cost
            c_margin = round(float((c_profit / c_rev) * Decimal('100.0')), 2) if c_rev > Decimal('0.00') else 0.0

            total_rev += c_rev
            total_cost += c_cost

            contract_results.append({
                'contract_id': str(c_id),
                'contract_code': c['contract_code'],
                'customer_name': c['crm_entity__name'] if c['crm_entity__name'] else 'Unlinked',
                'status': c['status'],
                'revenue': float(c_rev),
                'estimated_cost': float(c_cost),
                'completed_hours': round(hours_by_contract.get(c_id, 0.0), 2),
                'profit': float(c_profit),
                'margin_percentage': c_margin,
            })

        overall_profit = total_rev - total_cost
        overall_margin = round(float((overall_profit / total_rev) * Decimal('100.0')), 2) if total_rev > Decimal('0.00') else 0.0

        return {
            'start_date': str(start_date) if start_date else None,
            'end_date': str(end_date) if end_date else None,
            'total_revenue': float(total_rev),
            'total_estimated_cost': float(total_cost),
            'total_profit': float(overall_profit),
            'overall_margin_percentage': overall_margin,
            'contracts': contract_results,
        }

    def get_operations_performance(self, start_date=None, end_date=None):
        """
        Gathers key operational metrics: active sites, deployments, duty assignments,
        completed/pending duties, scheduled hours, and extra-duty hours.
        """
        active_sites_count = OperationalSite.objects.filter(
            company_id=self.company_id,
            is_active=True,
            is_deleted=False,
        ).count()

        active_deployments_count = Deployment.objects.filter(
            company_id=self.company_id,
            status='ACTIVE',
            is_deleted=False,
        ).count()

        duties_qs = DutyAssignment.objects.filter(
            company_id=self.company_id,
            is_deleted=False,
        )
        duties_qs = self.filter_by_date(duties_qs, 'date', start_date, end_date)

        total_duties = duties_qs.count()
        completed_duties = duties_qs.filter(status='COMPLETED').count()
        pending_duties = duties_qs.filter(status='SCHEDULED').count()

        # Scheduled hours sum
        total_scheduled_hours = 0.0
        for duty in duties_qs:
            if duty.start_time and duty.end_time:
                dt_start = datetime.combine(date.min, duty.start_time)
                dt_end = datetime.combine(date.min, duty.end_time)
                total_scheduled_hours += max(0.0, (dt_end - dt_start).total_seconds() / 3600.0)

        # Extra duty hours
        extra_qs = ExtraDuty.objects.filter(
            company_id=self.company_id,
            is_deleted=False,
            status__in=['APPROVED', 'COMPLETED'],
        )
        extra_qs = self.filter_by_date(extra_qs, 'date', start_date, end_date)

        extra_hours_sum = extra_qs.aggregate(
            total=Coalesce(Sum('hours'), Decimal('0.00'), output_field=DecimalField())
        )['total']

        return {
            'start_date': str(start_date) if start_date else None,
            'end_date': str(end_date) if end_date else None,
            'active_sites': active_sites_count,
            'active_deployments': active_deployments_count,
            'total_duty_assignments': total_duties,
            'completed_duties': completed_duties,
            'pending_duties': pending_duties,
            'scheduled_hours': round(total_scheduled_hours, 2),
            'extra_duty_hours': float(extra_hours_sum),
        }
