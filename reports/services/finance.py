from django.db.models import Sum, DecimalField
from django.db.models.functions import Coalesce
from decimal import Decimal
from finance.models import JournalEntryLine
from reports.services.base import BaseReportingService


class FinancialReportingService(BaseReportingService):
    def _get_base_queryset(self):
        return JournalEntryLine.objects.filter(
            company_id=self.company_id,
            journal_entry__status='POSTED',
        )

    def get_revenue(self, start_date=None, end_date=None):
        qs = self._get_base_queryset().filter(
            account__account_group__group_type__in=['INCOME', 'OTHER_INCOME']
        )
        qs = self.filter_by_date(qs, 'journal_entry__entry_date', start_date, end_date)
        
        # Revenue normally has a credit balance
        aggregates = qs.aggregate(
            total_credit=Coalesce(Sum('credit'), Decimal('0.00'), output_field=DecimalField()),
            total_debit=Coalesce(Sum('debit'), Decimal('0.00'), output_field=DecimalField())
        )
        return aggregates['total_credit'] - aggregates['total_debit']

    def get_expenses(self, start_date=None, end_date=None):
        qs = self._get_base_queryset().filter(
            account__account_group__group_type__in=['EXPENSE', 'OTHER_EXPENSE', 'COST_OF_SALES']
        )
        qs = self.filter_by_date(qs, 'journal_entry__entry_date', start_date, end_date)
        
        # Expenses normally have a debit balance
        aggregates = qs.aggregate(
            total_credit=Coalesce(Sum('credit'), Decimal('0.00'), output_field=DecimalField()),
            total_debit=Coalesce(Sum('debit'), Decimal('0.00'), output_field=DecimalField())
        )
        return aggregates['total_debit'] - aggregates['total_credit']

    def get_net_profit(self, start_date=None, end_date=None):
        revenue = self.get_revenue(start_date, end_date)
        expenses = self.get_expenses(start_date, end_date)
        return revenue - expenses

    def get_revenue_trend(self, start_date, end_date):
        # 7-day revenue trend
        from django.db.models.functions import TruncDate
        qs = self._get_base_queryset().filter(
            account__account_group__group_type__in=['INCOME', 'OTHER_INCOME']
        )
        qs = self.filter_by_date(qs, 'journal_entry__entry_date', start_date, end_date)
        
        daily_revenue = qs.annotate(
            date=TruncDate('journal_entry__entry_date')
        ).values('date').annotate(
            total=Coalesce(Sum('credit'), Decimal('0.00'), output_field=DecimalField()) - 
                  Coalesce(Sum('debit'), Decimal('0.00'), output_field=DecimalField())
        )
        
        return {item['date']: item['total'] for item in daily_revenue}
