"""
finance/services.py
Centralized profit & revenue calculation service.
- Revenue = all Sale total_amounts (covers POS cash/card/credit + service payments)
- Profit  = sum of per-item line profits from SaleItem + service revenue minus parts cost
- Expenses = all Expense entries
All calculations are company-scoped and payment-method agnostic.
"""
from django.db.models import Sum, F
from sales.models import Sale, SaleItem
from services.models import ServiceOrder, ServicePartUsed
from finance.models import Expense
from erp_core.middleware import get_current_company


class ProfitCalculationService:
    @staticmethod
    def get_net_profit(start_date=None, end_date=None, company_id=None):
        if not company_id:
            company_id = get_current_company()

        if not company_id:
            return {'revenue': 0, 'expenses': 0, 'profit': 0, 'cogs': 0}

        # --- Revenue: ALL Sale records regardless of payment_method ---
        sales_qs = Sale.objects.filter(company_id=company_id)
        expenses_qs = Expense.objects.filter(company_id=company_id)

        if start_date and end_date:
            sales_qs = sales_qs.filter(created_at__date__range=[start_date, end_date])
            expenses_qs = expenses_qs.filter(date__range=[start_date, end_date])

        # Total revenue from all sales (cash + card + credit + service payments)
        total_revenue = sales_qs.aggregate(total=Sum('total_amount'))['total'] or 0

        # --- COGS: sum of unit_cost * quantity across all SaleItems ---
        sale_items_qs = SaleItem.objects.filter(
            sale__company_id=company_id
        )
        if start_date and end_date:
            sale_items_qs = sale_items_qs.filter(sale__created_at__date__range=[start_date, end_date])

        cogs = sale_items_qs.aggregate(
            total=Sum(F('unit_cost') * F('quantity'))
        )['total'] or 0

        # --- Service parts cost (vendor parts used) ---
        parts_qs = ServicePartUsed.objects.filter(company_id=company_id)
        if start_date and end_date:
            parts_qs = parts_qs.filter(created_at__date__range=[start_date, end_date])
        parts_cost = parts_qs.aggregate(
            total=Sum(F('unit_cost') * F('quantity'))
        )['total'] or 0

        # --- Total Expenses (rent, utilities, salaries, etc.) ---
        total_exp = expenses_qs.aggregate(total=Sum('amount'))['total'] or 0

        # --- Gross Profit = Revenue - COGS - Parts Cost ---
        gross_profit = float(total_revenue) - float(cogs) - float(parts_cost)

        # --- Net Profit = Gross Profit - Operating Expenses ---
        net_profit = gross_profit - float(total_exp)

        return {
            'revenue': float(total_revenue),
            'cogs': float(cogs) + float(parts_cost),
            'expenses': float(total_exp),
            'profit': net_profit,
        }
