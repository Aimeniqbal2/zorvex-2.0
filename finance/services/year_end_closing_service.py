from decimal import Decimal
from datetime import date
from django.utils import timezone
from django.db import transaction
from django.db.models import Sum
from django.core.exceptions import ValidationError
from finance.models import (
    FiscalYear, AccountingPeriod, PeriodStatus, Journal, JournalType,
    JournalEntry, JournalEntryLine, ChartOfAccount, AccountType,
    SecurityFinanceConfiguration
)

class YearEndClosingService:
    """
    Authoritative Year-End Closing Engine for Zorvex ERP 2.0.
    Generates controlled, idempotent year-end closing journals via AccountingPostingService.
    """

    @classmethod
    def get_year_end_readiness(cls, fiscal_year: FiscalYear) -> dict:
        company = fiscal_year.company
        periods = AccountingPeriod.objects.filter(company=company, fiscal_year=fiscal_year)

        unclosed_periods = periods.exclude(status__in=[PeriodStatus.CLOSED, PeriodStatus.LOCKED])
        has_unclosed_periods = unclosed_periods.exists()

        from finance.services.posting_service import AccountingPostingService
        tb = AccountingPostingService.get_trial_balance(company, start_date=fiscal_year.start_date, end_date=fiscal_year.end_date)
        tb_diff = abs(tb['totals']['difference'])
        tb_balanced = tb_diff == Decimal('0.0000')

        is_ready = (not has_unclosed_periods) and tb_balanced

        return {
            'fiscal_year_id': fiscal_year.id,
            'fiscal_year_name': fiscal_year.name,
            'is_closed': fiscal_year.is_closed,
            'is_ready': is_ready,
            'unclosed_period_count': unclosed_periods.count(),
            'tb_balanced': tb_balanced,
            'tb_difference': tb_diff,
            'details': "Fiscal year is ready for year-end close." if is_ready else (
                "Cannot close fiscal year. All fiscal periods must be CLOSED or LOCKED, and Trial Balance must balance."
            )
        }

    @classmethod
    @transaction.atomic
    def create_year_end_closing_journal(cls, fiscal_year: FiscalYear, user=None) -> JournalEntry:
        company = fiscal_year.company

        # Idempotency check: Return existing journal if already created for this FY
        existing_je = JournalEntry.objects.filter(
            company=company,
            source_type='YEAR_END_CLOSE',
            source_id=str(fiscal_year.id)
        ).first()

        if existing_je:
            return existing_je

        # Validate Readiness
        readiness = cls.get_year_end_readiness(fiscal_year)
        if not readiness['is_ready']:
            raise ValidationError(readiness['details'])

        # Resolve Retained Earnings Account
        config = SecurityFinanceConfiguration.objects.filter(company=company).first()
        retained_earnings_acc = None
        if config and config.retained_earnings_account:
            retained_earnings_acc = config.retained_earnings_account

        if not retained_earnings_acc:
            retained_earnings_acc = ChartOfAccount.objects.filter(
                company=company,
                account_code='3200',
                is_deleted=False
            ).first()

        if not retained_earnings_acc:
            retained_earnings_acc = ChartOfAccount.objects.filter(
                company=company,
                account_type=AccountType.EQUITY,
                allow_posting=True,
                is_deleted=False
            ).first()

        if not retained_earnings_acc:
            raise ValidationError("Retained Earnings GL account (3200 / EQUITY) is required to perform year-end closing.")

        # Aggregate POSTED Income & Expense Account Lines for Fiscal Year
        nominal_types = [
            AccountType.REVENUE, AccountType.COST_OF_SERVICE, AccountType.EXPENSE,
            AccountType.OTHER_INCOME, AccountType.OTHER_EXPENSE
        ]

        je_lines_qs = JournalEntryLine.objects.filter(
            company=company,
            journal_entry__status='POSTED',
            journal_entry__posting_date__gte=fiscal_year.start_date,
            journal_entry__posting_date__lte=fiscal_year.end_date,
            account__account_type__in=nominal_types,
            account__allow_posting=True,
            is_deleted=False
        ).values('account_id', 'account__account_code', 'account__account_name', 'account__account_type').annotate(
            total_debit=Sum('debit'),
            total_credit=Sum('credit')
        )

        # Pre-fetch account objects needed for closing lines
        account_ids_needed = set()
        aggregated = []
        for item in je_lines_qs:
            dr = item['total_debit'] or Decimal('0.0000')
            cr = item['total_credit'] or Decimal('0.0000')
            net_bal = dr - cr
            if net_bal != Decimal('0.0000'):
                account_ids_needed.add(item['account_id'])
                aggregated.append(item)

        account_map = {
            acc.id: acc
            for acc in ChartOfAccount.objects.filter(id__in=account_ids_needed, company=company)
        }

        closing_lines = []
        total_revenue_credit = Decimal('0.0000')
        total_cost_debit = Decimal('0.0000')

        for item in aggregated:
            acc_id = item['account_id']
            acc_obj = account_map.get(acc_id)
            if not acc_obj:
                continue

            dr = item['total_debit'] or Decimal('0.0000')
            cr = item['total_credit'] or Decimal('0.0000')
            net_bal = dr - cr

            if net_bal < 0:
                # Credit balance (Revenue / Other Income): Debit account to close to 0
                credit_amt = abs(net_bal)
                total_revenue_credit += credit_amt
                closing_lines.append({
                    'account': acc_obj,
                    'debit': credit_amt,
                    'credit': Decimal('0.0000'),
                    'description': f"Close Nominal Account {item['account__account_code']} at FY End"
                })
            else:
                # Debit balance (Cost / Expense / Other Expense): Credit account to close to 0
                debit_amt = net_bal
                total_cost_debit += debit_amt
                closing_lines.append({
                    'account': acc_obj,
                    'debit': Decimal('0.0000'),
                    'credit': debit_amt,
                    'description': f"Close Nominal Account {item['account__account_code']} at FY End"
                })

        net_period_profit = total_revenue_credit - total_cost_debit

        if net_period_profit != Decimal('0.0000'):
            if net_period_profit > 0:
                # Net Profit: Credit Retained Earnings
                closing_lines.append({
                    'account': retained_earnings_acc,
                    'debit': Decimal('0.0000'),
                    'credit': net_period_profit,
                    'description': f"Transfer Net Profit for {fiscal_year.name} to Retained Earnings"
                })
            else:
                # Net Loss: Debit Retained Earnings
                loss_amt = abs(net_period_profit)
                closing_lines.append({
                    'account': retained_earnings_acc,
                    'debit': loss_amt,
                    'credit': Decimal('0.0000'),
                    'description': f"Transfer Net Loss for {fiscal_year.name} to Retained Earnings"
                })

        if not closing_lines:
            raise ValidationError("No nominal account activity found in fiscal year to close.")

        # Resolve or create the General journal for this company
        from finance.services.posting_service import AccountingPostingService
        journal = AccountingPostingService.get_or_create_journal(company, JournalType.GENERAL)

        je = AccountingPostingService.post_journal_entry(
            company=company,
            journal=journal,
            posting_date=fiscal_year.end_date,
            description=f"Year-End Closing Entry for {fiscal_year.name}",
            lines=closing_lines,
            source_type='YEAR_END_CLOSE',
            source_id=str(fiscal_year.id),
            source_number=fiscal_year.name,
            posting_event='FY_CLOSE',
            user=user,
            is_manual=False
        )

        fiscal_year.is_closed = True
        fiscal_year.save()

        return je
