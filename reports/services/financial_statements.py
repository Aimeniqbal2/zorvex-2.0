"""
reports/services/financial_statements.py

Phase 8E-1 — Financial Statements Reporting Service
Strictly relies on finance.JournalEntryLine and finance.JournalEntry (status='POSTED')
as the authoritative ledger source of truth.
"""
from decimal import Decimal
from django.db.models import Sum, DecimalField
from django.db.models.functions import Coalesce

from finance.models import JournalEntryLine, ChartOfAccount
from reports.services.base import BaseReportingService


class FinancialStatementsReportingService(BaseReportingService):
    def _get_posted_lines(self, as_of_date=None, start_date=None, end_date=None):
        qs = JournalEntryLine.objects.filter(
            company_id=self.company_id,
            journal_entry__status='POSTED',
        )
        if as_of_date:
            qs = qs.filter(journal_entry__entry_date__lte=as_of_date)
        if start_date:
            qs = qs.filter(journal_entry__entry_date__gte=start_date)
        if end_date:
            qs = qs.filter(journal_entry__entry_date__lte=end_date)
        return qs

    def get_trial_balance(self, as_of_date=None):
        """
        Generates a Trial Balance as of a given date (or all time if None).
        Returns account-level debits, credits, and net balances.
        Guarantees Total Debits == Total Credits.
        """
        lines = self._get_posted_lines(as_of_date=as_of_date)

        # Aggregate total debits and credits per account
        aggregated = (
            lines.values(
                'account_id',
                'account__account_code',
                'account__account_name',
                'account__account_group__group_type',
            )
            .annotate(
                total_debit=Coalesce(Sum('debit'), Decimal('0.0000'), output_field=DecimalField()),
                total_credit=Coalesce(Sum('credit'), Decimal('0.0000'), output_field=DecimalField()),
            )
            .order_by('account__account_code')
        )

        accounts_data = []
        sum_debits = Decimal('0.0000')
        sum_credits = Decimal('0.0000')

        for item in aggregated:
            t_debit = item['total_debit']
            t_credit = item['total_credit']
            group_type = item['account__account_group__group_type']

            # Debit-normal vs Credit-normal balance
            if group_type in ('ASSET', 'EXPENSE', 'COST_OF_SALES', 'OTHER_EXPENSE'):
                net_balance = t_debit - t_credit
            else:
                net_balance = t_credit - t_debit

            accounts_data.append({
                'account_id': str(item['account_id']),
                'account_code': item['account__account_code'],
                'account_name': item['account__account_name'],
                'account_type': group_type,
                'debit': float(t_debit),
                'credit': float(t_credit),
                'balance': float(net_balance),
            })

            sum_debits += t_debit
            sum_credits += t_credit

        is_balanced = (sum_debits == sum_credits)

        return {
            'as_of_date': str(as_of_date) if as_of_date else None,
            'accounts': accounts_data,
            'total_debit': float(sum_debits),
            'total_credit': float(sum_credits),
            'is_balanced': is_balanced,
        }

    def get_profit_and_loss(self, start_date=None, end_date=None):
        """
        Generates Profit & Loss (Income Statement) for a date range.
        Calculates:
        gross_profit = revenue - cost_of_sales
        net_profit = revenue + other_income - cost_of_sales - expenses - other_expenses
        """
        lines = self._get_posted_lines(start_date=start_date, end_date=end_date)

        # Income: Credit - Debit
        # Expense/Cost: Debit - Credit
        aggregated = (
            lines.values(
                'account_id',
                'account__account_code',
                'account__account_name',
                'account__account_group__group_type',
            )
            .annotate(
                total_debit=Coalesce(Sum('debit'), Decimal('0.0000'), output_field=DecimalField()),
                total_credit=Coalesce(Sum('credit'), Decimal('0.0000'), output_field=DecimalField()),
            )
        )

        categories = {
            'INCOME': {'total': Decimal('0.00'), 'items': []},
            'OTHER_INCOME': {'total': Decimal('0.00'), 'items': []},
            'COST_OF_SALES': {'total': Decimal('0.00'), 'items': []},
            'EXPENSE': {'total': Decimal('0.00'), 'items': []},
            'OTHER_EXPENSE': {'total': Decimal('0.00'), 'items': []},
        }

        for item in aggregated:
            gtype = item['account__account_group__group_type']
            if gtype not in categories:
                continue

            t_debit = item['total_debit']
            t_credit = item['total_credit']

            if gtype in ('INCOME', 'OTHER_INCOME'):
                amount = t_credit - t_debit
            else:  # COST_OF_SALES, EXPENSE, OTHER_EXPENSE
                amount = t_debit - t_credit

            categories[gtype]['total'] += amount
            categories[gtype]['items'].append({
                'account_id': str(item['account_id']),
                'account_code': item['account__account_code'],
                'account_name': item['account__account_name'],
                'amount': float(amount),
            })

        revenue = categories['INCOME']['total']
        other_income = categories['OTHER_INCOME']['total']
        cost_of_sales = categories['COST_OF_SALES']['total']
        expenses = categories['EXPENSE']['total']
        other_expenses = categories['OTHER_EXPENSE']['total']

        gross_profit = revenue - cost_of_sales
        net_profit = revenue + other_income - cost_of_sales - expenses - other_expenses

        return {
            'start_date': str(start_date) if start_date else None,
            'end_date': str(end_date) if end_date else None,
            'revenue': float(revenue),
            'other_income': float(other_income),
            'cost_of_sales': float(cost_of_sales),
            'gross_profit': float(gross_profit),
            'expenses': float(expenses),
            'other_expenses': float(other_expenses),
            'net_profit': float(net_profit),
            'details': {
                gtype: {
                    'total': float(categories[gtype]['total']),
                    'accounts': categories[gtype]['items']
                }
                for gtype in categories
            }
        }

    def get_comparative_profit_and_loss(self, date_from, date_to):
        """
        Generates Comparative Profit & Loss for a date range vs the previous equivalent period.
        """
        if not date_from or not date_to:
            raise ValueError("date_from and date_to are required for comparative analytics.")
        
        import datetime
        if isinstance(date_from, str):
            date_from = datetime.datetime.strptime(date_from, '%Y-%m-%d').date()
        if isinstance(date_to, str):
            date_to = datetime.datetime.strptime(date_to, '%Y-%m-%d').date()
            
        duration = date_to - date_from
        prev_date_to = date_from - datetime.timedelta(days=1)
        prev_date_from = prev_date_to - duration
        
        current_pnl = self.get_profit_and_loss(start_date=date_from, end_date=date_to)
        previous_pnl = self.get_profit_and_loss(start_date=prev_date_from, end_date=prev_date_to)
        
        def calc_variance(curr, prev):
            curr_val = Decimal(str(curr))
            prev_val = Decimal(str(prev))
            variance = curr_val - prev_val
            if prev_val == Decimal('0.00'):
                variance_percent = Decimal('0.00')
            else:
                variance_percent = (variance / abs(prev_val)) * Decimal('100.00')
            return {
                'current': float(curr_val),
                'previous': float(prev_val),
                'variance': float(variance),
                'variance_percent': float(variance_percent)
            }
            
        return {
            'period': {
                'current': {'start_date': str(date_from), 'end_date': str(date_to)},
                'previous': {'start_date': str(prev_date_from), 'end_date': str(prev_date_to)}
            },
            'revenue': calc_variance(current_pnl['revenue'], previous_pnl['revenue']),
            'cost_of_sales': calc_variance(current_pnl['cost_of_sales'], previous_pnl['cost_of_sales']),
            'gross_profit': calc_variance(current_pnl['gross_profit'], previous_pnl['gross_profit']),
            'expenses': calc_variance(current_pnl['expenses'] + current_pnl['other_expenses'] - current_pnl['other_income'], 
                                      previous_pnl['expenses'] + previous_pnl['other_expenses'] - previous_pnl['other_income']),
            'net_profit': calc_variance(current_pnl['net_profit'], previous_pnl['net_profit'])
        }

    def get_balance_sheet(self, as_of_date=None):
        """
        Generates Balance Sheet as of a given date.
        Validates accounting equation: Assets = Liabilities + Equity
        Includes Retained Earnings (cumulative net income to date) in Equity.
        """
        lines = self._get_posted_lines(as_of_date=as_of_date)

        aggregated = (
            lines.values(
                'account_id',
                'account__account_code',
                'account__account_name',
                'account__account_group__group_type',
            )
            .annotate(
                total_debit=Coalesce(Sum('debit'), Decimal('0.0000'), output_field=DecimalField()),
                total_credit=Coalesce(Sum('credit'), Decimal('0.0000'), output_field=DecimalField()),
            )
        )

        assets_list = []
        liabilities_list = []
        equity_list = []

        total_assets = Decimal('0.0000')
        total_liabilities = Decimal('0.0000')
        total_equity_accounts = Decimal('0.0000')

        # Cumulative P&L totals for retained earnings calculation
        cumulative_revenue = Decimal('0.0000')
        cumulative_expense = Decimal('0.0000')

        for item in aggregated:
            gtype = item['account__account_group__group_type']
            t_debit = item['total_debit']
            t_credit = item['total_credit']

            if gtype == 'ASSET':
                bal = t_debit - t_credit
                total_assets += bal
                assets_list.append({
                    'account_id': str(item['account_id']),
                    'account_code': item['account__account_code'],
                    'account_name': item['account__account_name'],
                    'amount': float(bal),
                })
            elif gtype == 'LIABILITY':
                bal = t_credit - t_debit
                total_liabilities += bal
                liabilities_list.append({
                    'account_id': str(item['account_id']),
                    'account_code': item['account__account_code'],
                    'account_name': item['account__account_name'],
                    'amount': float(bal),
                })
            elif gtype == 'EQUITY':
                bal = t_credit - t_debit
                total_equity_accounts += bal
                equity_list.append({
                    'account_id': str(item['account_id']),
                    'account_code': item['account__account_code'],
                    'account_name': item['account__account_name'],
                    'amount': float(bal),
                })
            elif gtype in ('INCOME', 'OTHER_INCOME'):
                cumulative_revenue += (t_credit - t_debit)
            elif gtype in ('EXPENSE', 'COST_OF_SALES', 'OTHER_EXPENSE'):
                cumulative_expense += (t_debit - t_credit)

        retained_earnings = cumulative_revenue - cumulative_expense

        # Add retained earnings to equity
        total_equity = total_equity_accounts + retained_earnings

        discrepancy = total_assets - (total_liabilities + total_equity)
        is_balanced = abs(discrepancy) < Decimal('0.01')

        return {
            'as_of_date': str(as_of_date) if as_of_date else None,
            'assets': {
                'items': assets_list,
                'total': float(total_assets),
            },
            'liabilities': {
                'items': liabilities_list,
                'total': float(total_liabilities),
            },
            'equity': {
                'items': equity_list,
                'retained_earnings': float(retained_earnings),
                'total': float(total_equity),
            },
            'total_assets': float(total_assets),
            'total_liabilities': float(total_liabilities),
            'total_equity': float(total_equity),
            'is_balanced': is_balanced,
            'discrepancy': float(discrepancy),
        }
