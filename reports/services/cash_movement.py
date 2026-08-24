"""
reports/services/cash_movement.py

Phase 8E-2C — Ledger-Based Cash Movement Report
Calculates opening balance, receipts, disbursements, and net movement 
for identified cash/bank accounts using only POSTED JournalEntryLines.
"""
from decimal import Decimal
from django.db.models import Sum
from finance.models import JournalEntryLine, SalesAccountingConfiguration
from billing.models import BillingAccountingConfiguration
from reports.services.base import BaseReportingService

class CashMovementReportingService(BaseReportingService):
    def _get_cash_accounts(self):
        """
        Discovers configured cash/bank/payment accounts securely mapped to this company.
        """
        account_ids = set()
        
        # Sales Config
        sales_configs = SalesAccountingConfiguration.objects.filter(
            company_id=self.company_id, is_active=True
        )
        for conf in sales_configs:
            if conf.cash_account_id:
                account_ids.add(conf.cash_account_id)
            if conf.bank_account_id:
                account_ids.add(conf.bank_account_id)
                
        # Billing Config
        billing_configs = BillingAccountingConfiguration.objects.filter(
            company_id=self.company_id, is_active=True
        )
        for conf in billing_configs:
            if conf.payment_account_id:
                account_ids.add(conf.payment_account_id)
                
        return list(account_ids)

    def get_cash_movement(self, date_from=None, date_to=None, account_id=None):
        if account_id:
            cash_accounts = [account_id]
            # Ensure the provided account_id actually belongs to the company's cash configs (security)
            configured_accounts = self._get_cash_accounts()
            if int(account_id) not in [int(acc) for acc in configured_accounts]:
                cash_accounts = [] # not allowed
        else:
            cash_accounts = self._get_cash_accounts()
            
        if not cash_accounts:
            return {
                'date_from': str(date_from) if date_from else None,
                'date_to': str(date_to) if date_to else None,
                'opening_balance': 0.0,
                'receipts': 0.0,
                'disbursements': 0.0,
                'net_movement': 0.0,
                'closing_balance': 0.0,
                'accounts': []
            }

        # 1. Opening Balance (strictly before date_from)
        opening_qs = JournalEntryLine.objects.filter(
            company_id=self.company_id,
            journal_entry__status='POSTED',
            account_id__in=cash_accounts
        )
        if date_from:
            opening_qs = opening_qs.filter(journal_entry__entry_date__lt=date_from)
        else:
            opening_qs = opening_qs.none() # If no date_from, opening is 0
            
        opening_agg = opening_qs.aggregate(
            t_debit=Sum('debit'),
            t_credit=Sum('credit')
        )
        ob_debit = opening_agg['t_debit'] or Decimal('0.0000')
        ob_credit = opening_agg['t_credit'] or Decimal('0.0000')
        
        # Cash is an asset, so normal balance is debit
        opening_balance = ob_debit - ob_credit

        # 2. Period Movement
        period_qs = JournalEntryLine.objects.filter(
            company_id=self.company_id,
            journal_entry__status='POSTED',
            account_id__in=cash_accounts
        )
        if date_from:
            period_qs = period_qs.filter(journal_entry__entry_date__gte=date_from)
        if date_to:
            period_qs = period_qs.filter(journal_entry__entry_date__lte=date_to)

        period_agg = period_qs.aggregate(
            t_debit=Sum('debit'),
            t_credit=Sum('credit')
        )
        receipts = period_agg['t_debit'] or Decimal('0.0000')
        disbursements = period_agg['t_credit'] or Decimal('0.0000')
        net_movement = receipts - disbursements
        
        closing_balance = opening_balance + net_movement

        return {
            'date_from': str(date_from) if date_from else None,
            'date_to': str(date_to) if date_to else None,
            'opening_balance': float(opening_balance),
            'receipts': float(receipts),
            'disbursements': float(disbursements),
            'net_movement': float(net_movement),
            'closing_balance': float(closing_balance),
            'accounts': cash_accounts
        }
