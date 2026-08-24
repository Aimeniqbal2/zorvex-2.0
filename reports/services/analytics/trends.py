# reports/services/analytics/trends.py

from django.db.models import Sum
from django.db.models.functions import TruncDate, TruncWeek, TruncMonth
from rest_framework.exceptions import ValidationError
from decimal import Decimal

from finance.models import JournalEntryLine
from reports.services.analytics.registry import KPI_REGISTRY

ALLOWED_INTERVALS = {"daily": TruncDate, "weekly": TruncWeek, "monthly": TruncMonth}
ALLOWED_METRICS = {"revenue", "expenses", "net_profit"} # We will only support these basic ones for now, as requested.

class TrendAnalyticsService:
    def __init__(self, company_id):
        if not company_id:
            raise ValueError("company_id is required.")
        self.company_id = company_id
        
    def _get_trunc_func(self, interval):
        if interval not in ALLOWED_INTERVALS:
            raise ValidationError(f"Unsupported interval: {interval}. Allowed: {list(ALLOWED_INTERVALS.keys())}")
        return ALLOWED_INTERVALS[interval]('journal_entry__entry_date')

    def get_trend(self, metric, interval, start_date=None, end_date=None):
        if metric not in ALLOWED_METRICS:
            raise ValidationError(f"Unsupported trend metric: {metric}. Allowed: {list(ALLOWED_METRICS)}")
            
        qs = JournalEntryLine.objects.filter(
            company_id=self.company_id,
            journal_entry__status='POSTED'
        )
        if start_date:
            qs = qs.filter(journal_entry__entry_date__gte=start_date)
        if end_date:
            qs = qs.filter(journal_entry__entry_date__lte=end_date)
            
        if metric == "revenue":
            qs = qs.filter(account__account_group__group_type='INCOME')
        elif metric == "expenses":
            qs = qs.filter(account__account_group__group_type__in=['EXPENSE', 'OTHER_EXPENSE'])
        elif metric == "net_profit":
            # For net profit we need all income and expense types
            qs = qs.filter(account__account_group__group_type__in=['INCOME', 'OTHER_INCOME', 'EXPENSE', 'OTHER_EXPENSE', 'COST_OF_SALES'])
            
        trunc_func = self._get_trunc_func(interval)
        
        # Grouping
        grouped = qs.annotate(period=trunc_func).values('period').annotate(
            total_debit=Sum('debit'),
            total_credit=Sum('credit')
        ).order_by('period')
        
        data = []
        for item in grouped:
            if not item['period']:
                continue
            period_str = str(item['period'].date()) if hasattr(item['period'], 'date') else str(item['period'])
            
            debit = item['total_debit'] or Decimal('0.0000')
            credit = item['total_credit'] or Decimal('0.0000')
            
            if metric == "revenue":
                # Revenue is credit-normal
                value = credit - debit
            elif metric == "expenses":
                # Expenses are debit-normal
                value = debit - credit
            elif metric == "net_profit":
                # Net profit is (Credit - Debit) for Revenue/Other Income and (Debit - Credit) for Expenses, 
                # wait, in our simplified grouping, we can just say Net Profit = Total Income (Credit-Debit) - Total Expense (Debit-Credit)
                # But since we just sum everything, the net effect on equity is Credit - Debit for ALL PnL accounts.
                value = credit - debit
            else:
                value = Decimal('0.0000')
                
            data.append({
                "period": period_str,
                "value": float(value)
            })
            
        return {
            "metric": metric,
            "interval": interval,
            "data": data
        }
