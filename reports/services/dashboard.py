from reports.services.finance import FinancialReportingService
from reports.services.financial_statements import FinancialStatementsReportingService
from reports.services.operations_metrics import OperationsMetricsReportingService
from reports.services.supply_chain import SupplyChainReportingService
from services.models import ServiceOrder
from inventory.models import VendorLedger
from django.db.models import Sum, Count
from datetime import timedelta
from django.utils import timezone


class DashboardReportingService:
    def __init__(self, company_id):
        if not company_id:
            raise ValueError("company_id is required.")
        self.company_id = company_id
        self.finance_service = FinancialReportingService(company_id=company_id)
        self.fs_service = FinancialStatementsReportingService(company_id=company_id)
        self.ops_service = OperationsMetricsReportingService(company_id=company_id)
        self.supply_chain_service = SupplyChainReportingService(company_id=company_id)

    def _pct_change(self, curr, prev):
        try:
            curr_f = float(curr or 0)
            prev_f = float(prev or 0)
            if prev_f == 0:
                return 100.0 if curr_f > 0 else 0.0
            return round(((curr_f - prev_f) / prev_f) * 100, 1)
        except Exception:
            return 0.0

    def get_dashboard_kpis(self, today=None):
        if not today:
            today = timezone.now().date()
        
        curr_start = today.replace(day=1)
        if curr_start.month == 1:
            prev_start = curr_start.replace(year=curr_start.year - 1, month=12, day=1)
        else:
            prev_start = curr_start.replace(month=curr_start.month - 1, day=1)
        prev_end = curr_start - timedelta(days=1)

        # Finance KPIs via Universal Ledger
        curr_pnl = self.fs_service.get_profit_and_loss(start_date=curr_start, end_date=today)
        prev_pnl = self.fs_service.get_profit_and_loss(start_date=prev_start, end_date=prev_end)
        total_pnl = self.fs_service.get_profit_and_loss()

        curr_revenue = curr_pnl['revenue']
        prev_revenue = prev_pnl['revenue']
        
        curr_profit = curr_pnl['net_profit']
        prev_profit = prev_pnl['net_profit']

        total_revenue = total_pnl['revenue']
        total_expenses = total_pnl['expenses'] + total_pnl['cost_of_sales'] + total_pnl['other_expenses']
        total_profit = total_pnl['net_profit']

        # Operational KPIs via OperationsMetricsReportingService
        curr_ops = self.ops_service.get_operations_performance(start_date=curr_start, end_date=today)
        prev_ops = self.ops_service.get_operations_performance(start_date=prev_start, end_date=prev_end)
        
        curr_active = curr_ops['active_deployments']
        prev_active = prev_ops['active_deployments']

        # Supply Chain KPIs via Universal SupplyChainReportingService
        low_stock_report = self.supply_chain_service.get_low_stock_report()
        curr_low_stock = low_stock_report['total_low_stock_items']

        # LEGACY METRIC — NO CERTIFIED REPORTING SERVICE AVAILABLE (Blocked by AP Aging)
        curr_payables = VendorLedger.objects.filter(
            company_id=self.company_id,
            transaction_type='DEBIT',
            created_at__date__gte=curr_start,
            created_at__date__lte=today,
        ).aggregate(total=Sum('amount'))['total'] or 0

        prev_payables = VendorLedger.objects.filter(
            company_id=self.company_id,
            transaction_type='DEBIT',
            created_at__date__gte=prev_start,
            created_at__date__lte=prev_end,
        ).aggregate(total=Sum('amount'))['total'] or 0

        # Trends
        start_7_days = today - timedelta(days=6)
        revenue_trend_data = self.finance_service.get_revenue_trend(start_date=start_7_days, end_date=today)
        
        revenue_labels = []
        revenue_data = []
        for i in range(6, -1, -1):
            day = today - timedelta(days=i)
            revenue_labels.append(day.strftime('%b %d'))
            revenue_data.append(float(revenue_trend_data.get(day, 0)))

        # Status Distribution via OperationsMetricsReportingService
        ops_total = self.ops_service.get_operations_performance()
        repair_stats = {
            'pending':     ops_total['pending_duties'],
            'in_progress': ops_total['active_deployments'],
            'ready':       ops_total['active_sites'],
            'completed':   ops_total['completed_duties'],
            'return':      0,
        }

        # LEGACY METRIC — NO CERTIFIED REPORTING SERVICE AVAILABLE
        from sales.models import Sale
        recent_sales_qs = Sale.objects.filter(
            company_id=self.company_id
        ).select_related('cashier', 'customer', 'service_order').order_by('-created_at')[:8]

        recent_sales = [
            {
                'id': str(s.id),
                'amount': float(s.total_amount),
                'date': s.created_at.strftime('%b %d, %Y %I:%M %p'),
                'method': s.payment_method,
                'customer_name': s.customer.name if s.customer else 'Walk-in Customer',
                'customer_phone': s.customer.phone if s.customer else '',
                'sale_type': 'Repair Service' if s.service_order_id else 'Retail POS',
            }
            for s in recent_sales_qs
        ]

        return {
            'total_revenue':      float(total_revenue),
            'total_expenses':     float(total_expenses),
            'net_profit':         float(total_profit),
            'active_repairs':     curr_active,
            'low_stock_items':    curr_low_stock,
            'kpi_changes': {
                'revenue': {
                    'current':  float(curr_revenue),
                    'previous': float(prev_revenue),
                    'pct':      self._pct_change(curr_revenue, prev_revenue),
                },
                'profit': {
                    'current':  float(curr_profit),
                    'previous': float(prev_profit),
                    'pct':      self._pct_change(curr_profit, prev_profit),
                },
                'active_orders': {
                    'current':  curr_active,
                    'previous': prev_active,
                    'pct':      self._pct_change(curr_active, prev_active),
                },
                'supply_danger': {
                    'current':  float(curr_payables),
                    'previous': float(prev_payables),
                    'pct':      self._pct_change(curr_payables, prev_payables),
                },
            },
            'revenue_trends': {
                'labels': revenue_labels,
                'data':   revenue_data,
            },
            'repair_stats': repair_stats,
            'recent_sales': recent_sales,
        }
