from decimal import Decimal
from django.db.models import Sum, DecimalField
from django.db.models.functions import Coalesce
from finance.models import Budget, BudgetLine, JournalEntryLine
from reports.services.base import BaseReportingService

class BudgetVsActualService(BaseReportingService):
    """
    Service for calculating Budget vs Actual variance.
    Calculates Actuals dynamically from POSTED JournalEntryLines.
    """
    
    def get_budget_vs_actual(self, budget_id, account_id=None, cost_center_id=None, profit_center_id=None):
        budget = Budget.objects.get(id=budget_id, company_id=self.company_id)
        
        # 1. Retrieve BudgetLines
        budget_lines_qs = BudgetLine.objects.filter(budget=budget)
        if account_id:
            budget_lines_qs = budget_lines_qs.filter(account_id=account_id)
        if cost_center_id:
            budget_lines_qs = budget_lines_qs.filter(cost_center_id=cost_center_id)
        if profit_center_id:
            budget_lines_qs = budget_lines_qs.filter(profit_center_id=profit_center_id)

        budget_lines_qs = budget_lines_qs.select_related(
            'account', 'account__account_group', 'cost_center', 'profit_center'
        )

        budget_map = {}
        for bl in budget_lines_qs:
            key = (bl.account_id, bl.cost_center_id, bl.profit_center_id)
            if key not in budget_map:
                budget_map[key] = {
                    'budget_amount': Decimal('0.00'),
                    'account_code': bl.account.account_code,
                    'account_name': bl.account.account_name,
                    'account_type': bl.account.account_group.group_type if bl.account.account_group else '',
                    'cost_center': bl.cost_center.name if bl.cost_center else None,
                    'profit_center': bl.profit_center.name if bl.profit_center else None,
                }
            budget_map[key]['budget_amount'] += bl.amount

        # 2. Retrieve POSTED JournalEntryLines for the same company and fiscal year
        je_qs = JournalEntryLine.objects.filter(
            company_id=self.company_id,
            journal_entry__status='POSTED',
            journal_entry__entry_date__gte=budget.fiscal_year.start_date,
            journal_entry__entry_date__lte=budget.fiscal_year.end_date
        )
        
        if account_id:
            je_qs = je_qs.filter(account_id=account_id)
        if cost_center_id:
            je_qs = je_qs.filter(cost_center_id=cost_center_id)
        if profit_center_id:
            je_qs = je_qs.filter(profit_center_id=profit_center_id)
            
        je_agg = je_qs.values(
            'account_id', 'cost_center_id', 'profit_center_id',
            'account__account_group__group_type',
            'account__account_code',
            'account__account_name',
        ).annotate(
            total_debit=Coalesce(Sum('debit'), Decimal('0.0000'), output_field=DecimalField()),
            total_credit=Coalesce(Sum('credit'), Decimal('0.0000'), output_field=DecimalField())
        )
        
        # 3. Merge results
        collapsed_budget_map = {}
        for key, data in budget_map.items():
            collapsed_budget_map[key] = {
                'account_id': str(key[0]),
                'cost_center_id': str(key[1]) if key[1] else None,
                'profit_center_id': str(key[2]) if key[2] else None,
                'account_code': data['account_code'],
                'account_name': data['account_name'],
                'account_type': data['account_type'],
                'cost_center': data['cost_center'],
                'profit_center': data['profit_center'],
                'budget_amount': data['budget_amount'],
                'actual_amount': Decimal('0.00'),
            }

        for agg in je_agg:
            col_key = (agg['account_id'], agg['cost_center_id'], agg['profit_center_id'])
            
            gtype = agg['account__account_group__group_type']
            t_debit = agg['total_debit']
            t_credit = agg['total_credit']
            
            if gtype in ('INCOME', 'OTHER_INCOME'):
                actual = t_credit - t_debit
            else:  # COST_OF_SALES, EXPENSE, OTHER_EXPENSE, ASSET, LIABILITY, EQUITY
                actual = t_debit - t_credit
                
            if col_key in collapsed_budget_map:
                collapsed_budget_map[col_key]['actual_amount'] += actual
            else:
                collapsed_budget_map[col_key] = {
                    'account_id': str(col_key[0]),
                    'cost_center_id': str(col_key[1]) if col_key[1] else None,
                    'profit_center_id': str(col_key[2]) if col_key[2] else None,
                    'account_code': agg['account__account_code'],
                    'account_name': agg['account__account_name'],
                    'account_type': gtype,
                    'cost_center': None,
                    'profit_center': None,
                    'budget_amount': Decimal('0.00'),
                    'actual_amount': actual,
                }

        results = []
        for col_key, item in collapsed_budget_map.items():
            budget_val = item['budget_amount']
            actual_val = item['actual_amount']
            
            gtype = item['account_type']
            if gtype in ('INCOME', 'OTHER_INCOME'):
                variance = actual_val - budget_val # Positive is good
            else:
                variance = budget_val - actual_val # Positive is good
                
            if budget_val == Decimal('0.00'):
                if actual_val > Decimal('0.00'):
                    variance_percent = Decimal('100.00')
                elif actual_val < Decimal('0.00'):
                    variance_percent = Decimal('-100.00')
                else:
                    variance_percent = Decimal('0.00')
            else:
                variance_percent = (variance / abs(budget_val)) * Decimal('100.00')
                
            results.append({
                'account_id': item['account_id'],
                'account_code': item['account_code'],
                'account_name': item['account_name'],
                'account_type': item['account_type'],
                'cost_center_id': item['cost_center_id'],
                'profit_center_id': item['profit_center_id'],
                'budget': float(budget_val),
                'actual': float(actual_val),
                'variance': float(variance),
                'variance_percent': float(variance_percent)
            })

        return results
