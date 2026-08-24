from django.db.models import Sum, F, Window, ExpressionWrapper, DecimalField, Case, When, Value
from django.db.models.functions import Coalesce
from decimal import Decimal
from finance.models import JournalEntryLine, ChartOfAccount
from reports.services.base import BaseReportingService


class GeneralLedgerService(BaseReportingService):
    def _get_base_queryset(self):
        return JournalEntryLine.objects.filter(
            company_id=self.company_id,
            journal_entry__status='POSTED'
        ).select_related(
            'journal_entry',
            'journal_entry__journal',
            'account',
            'account__account_group',
            'currency',
            'cost_center',
            'profit_center',
            'crm_entity'
        )

    def get_general_ledger(self, date_from=None, date_to=None, account_id=None,
                           journal_id=None, cost_center_id=None, profit_center_id=None, crm_entity_id=None):
        """
        Retrieves the General Ledger transactions.
        """
        qs = self._get_base_queryset()

        if date_from:
            qs = qs.filter(journal_entry__entry_date__gte=date_from)
        if date_to:
            qs = qs.filter(journal_entry__entry_date__lte=date_to)
        if account_id:
            qs = qs.filter(account_id=account_id)
        if journal_id:
            qs = qs.filter(journal_entry__journal_id=journal_id)
        if cost_center_id:
            qs = qs.filter(cost_center_id=cost_center_id)
        if profit_center_id:
            qs = qs.filter(profit_center_id=profit_center_id)
        if crm_entity_id:
            qs = qs.filter(crm_entity_id=crm_entity_id)

        # Deterministic ordering
        qs = qs.order_by(
            'journal_entry__entry_date',
            'journal_entry__created_at',
            'journal_entry_id',
            'id'
        )

        return qs


class AccountLedgerService(GeneralLedgerService):
    def get_account_ledger(self, account_id, date_from=None, date_to=None):
        """
        Retrieves the Account Ledger for a specific account, computing opening, running, and closing balances.
        """
        # Validate account
        try:
            account = ChartOfAccount.objects.select_related('account_group').get(
                id=account_id, company_id=self.company_id
            )
        except ChartOfAccount.DoesNotExist:
            raise ValueError("Account not found or access denied.")

        group_type = account.account_group.group_type
        is_debit_normal = group_type in ('ASSET', 'EXPENSE', 'COST_OF_SALES', 'OTHER_EXPENSE')

        # Calculate Opening Balance
        # 1. Start with the account's fixed opening balance
        opening_balance = account.opening_balance or Decimal('0.0000')

        # 2. Add all POSTED movements before date_from
        if date_from:
            prior_qs = JournalEntryLine.objects.filter(
                company_id=self.company_id,
                account_id=account_id,
                journal_entry__status='POSTED',
                journal_entry__entry_date__lt=date_from
            )
            prior_aggregates = prior_qs.aggregate(
                t_debit=Coalesce(Sum('debit'), Decimal('0.0000'), output_field=DecimalField()),
                t_credit=Coalesce(Sum('credit'), Decimal('0.0000'), output_field=DecimalField())
            )
            p_debit = prior_aggregates['t_debit']
            p_credit = prior_aggregates['t_credit']

            if is_debit_normal:
                opening_balance += (p_debit - p_credit)
            else:
                opening_balance += (p_credit - p_debit)

        # Base Ledger Query for the period
        qs = self.get_general_ledger(
            date_from=date_from,
            date_to=date_to,
            account_id=account_id
        )

        # Define the net movement expression based on normal balance
        if is_debit_normal:
            movement_expr = ExpressionWrapper(
                F('debit') - F('credit'),
                output_field=DecimalField(max_digits=15, decimal_places=4)
            )
        else:
            movement_expr = ExpressionWrapper(
                F('credit') - F('debit'),
                output_field=DecimalField(max_digits=15, decimal_places=4)
            )

        # Django Window function for running sum of movements
        qs = qs.annotate(
            movement=movement_expr
        ).annotate(
            running_movement=Window(
                expression=Sum('movement'),
                order_by=[
                    F('journal_entry__entry_date').asc(),
                    F('journal_entry__created_at').asc(),
                    F('journal_entry_id').asc(),
                    F('id').asc(),
                ]
            )
        ).annotate(
            # running_balance = opening_balance + running_movement
            running_balance=ExpressionWrapper(
                Value(opening_balance, output_field=DecimalField(max_digits=15, decimal_places=4)) + F('running_movement'),
                output_field=DecimalField(max_digits=15, decimal_places=4)
            )
        )

        # Compute period totals for the summary
        # Window functions don't play nicely with aggregate() on the same queryset in older Django,
        # but we can re-evaluate period aggregates separately.
        base_qs_for_aggregates = self.get_general_ledger(
            date_from=date_from,
            date_to=date_to,
            account_id=account_id
        )
        period_aggregates = base_qs_for_aggregates.aggregate(
            period_debit=Coalesce(Sum('debit'), Decimal('0.0000'), output_field=DecimalField()),
            period_credit=Coalesce(Sum('credit'), Decimal('0.0000'), output_field=DecimalField())
        )
        
        period_debit = period_aggregates['period_debit']
        period_credit = period_aggregates['period_credit']
        
        if is_debit_normal:
            closing_balance = opening_balance + period_debit - period_credit
        else:
            closing_balance = opening_balance + period_credit - period_debit

        return {
            'account_id': str(account.id),
            'account_code': account.account_code,
            'account_name': account.account_name,
            'is_debit_normal': is_debit_normal,
            'opening_balance': float(opening_balance),
            'period_debit': float(period_debit),
            'period_credit': float(period_credit),
            'closing_balance': float(closing_balance),
            'transactions': qs
        }
