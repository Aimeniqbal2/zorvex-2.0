from decimal import Decimal
from django.db.models import Sum, Q
from finance.models import ChartOfAccount, JournalEntryLine

class FinanceReportService:
    @staticmethod
    def get_general_ledger(company, start_date=None, end_date=None, account_id=None):
        lines = JournalEntryLine.objects.filter(
            company=company,
            journal_entry__status__in=['POSTED', 'REVERSED'],
            is_deleted=False
        )
        if start_date:
            lines = lines.filter(journal_entry__entry_date__gte=start_date)
        if end_date:
            lines = lines.filter(journal_entry__entry_date__lte=end_date)
        if account_id:
            lines = lines.filter(account_id=account_id)
            
        return lines.select_related('journal_entry', 'account').order_by('journal_entry__entry_date', 'id')

    @staticmethod
    def get_trial_balance(company, start_date=None, end_date=None):
        # Calculates net debit and credit per account
        lines = FinanceReportService.get_general_ledger(company, start_date, end_date)
        
        accounts = {}
        for line in lines:
            acc_id = line.account_id
            if acc_id not in accounts:
                accounts[acc_id] = {
                    'account': line.account,
                    'debit': Decimal('0.00'),
                    'credit': Decimal('0.00')
                }
            accounts[acc_id]['debit'] += line.debit
            accounts[acc_id]['credit'] += line.credit
            
        total_debit = Decimal('0.00')
        total_credit = Decimal('0.00')
        result = []
        
        for acc_id, data in accounts.items():
            net = data['debit'] - data['credit']
            debit = net if net > 0 else Decimal('0.00')
            credit = -net if net < 0 else Decimal('0.00')
            if debit > 0 or credit > 0:
                result.append({
                    'account': data['account'],
                    'debit': debit,
                    'credit': credit
                })
                total_debit += debit
                total_credit += credit
                
        return {
            'lines': result,
            'total_debit': total_debit,
            'total_credit': total_credit,
            'is_balanced': total_debit == total_credit
        }

    @staticmethod
    def get_profit_and_loss(company, start_date=None, end_date=None):
        tb = FinanceReportService.get_trial_balance(company, start_date, end_date)
        
        revenue = Decimal('0.00')
        expense = Decimal('0.00')
        
        revenue_lines = []
        expense_lines = []
        
        for line in tb['lines']:
            if line['account'].account_type in ['Revenue', 'Income']:
                amount = line['credit'] - line['debit']
                revenue_lines.append({'account': line['account'], 'amount': amount})
                revenue += amount
            elif line['account'].account_type == 'Expense':
                amount = line['debit'] - line['credit']
                expense_lines.append({'account': line['account'], 'amount': amount})
                expense += amount
                
        return {
            'revenue_lines': revenue_lines,
            'expense_lines': expense_lines,
            'total_revenue': revenue,
            'total_expense': expense,
            'net_profit': revenue - expense
        }

    @staticmethod
    def get_balance_sheet(company, as_of_date=None):
        # Balance sheet is cumulative up to the as_of_date
        tb = FinanceReportService.get_trial_balance(company, None, as_of_date)
        
        assets = Decimal('0.00')
        liabilities = Decimal('0.00')
        equity = Decimal('0.00')
        
        asset_lines = []
        liability_lines = []
        equity_lines = []
        
        # We also need retained earnings from P&L up to this date
        pl = FinanceReportService.get_profit_and_loss(company, None, as_of_date)
        retained_earnings = pl['net_profit']
        
        for line in tb['lines']:
            acc = line['account']
            if acc.account_type == 'Asset':
                amount = line['debit'] - line['credit']
                asset_lines.append({'account': acc, 'amount': amount})
                assets += amount
            elif acc.account_type == 'Liability':
                amount = line['credit'] - line['debit']
                liability_lines.append({'account': acc, 'amount': amount})
                liabilities += amount
            elif acc.account_type == 'Equity':
                amount = line['credit'] - line['debit']
                equity_lines.append({'account': acc, 'amount': amount})
                equity += amount
                
        # Add retained earnings to equity
        equity += retained_earnings
        
        return {
            'assets': {
                'lines': asset_lines,
                'total': assets
            },
            'liabilities': {
                'lines': liability_lines,
                'total': liabilities
            },
            'equity': {
                'lines': equity_lines,
                'total': equity,
                'retained_earnings': retained_earnings
            },
            'is_balanced': assets == (liabilities + equity)
        }
