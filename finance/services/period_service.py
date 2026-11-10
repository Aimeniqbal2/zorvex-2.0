"""
finance/services/period_service.py
Validation service for Fiscal Years, Accounting Periods, and Account posting controls.
"""
from typing import Tuple, Optional
from datetime import date, timedelta
from django.core.exceptions import ValidationError
from finance.models import AccountingPeriod, ChartOfAccount, PeriodStatus, FiscalYear


def ensure_open_period_and_foundation(company, target_date: Optional[date] = None) -> Optional[AccountingPeriod]:
    """
    Idempotently ensures basic Security Finance foundation (Currency, COA, SecurityFinanceConfiguration,
    FiscalYear, and an OPEN AccountingPeriod covering target_date) exists for the company.
    Never re-opens a CLOSED/LOCKED/SOFT_CLOSED period.
    """
    if not company:
        return None
    if target_date is None:
        target_date = date.today()

    from finance.models import SecurityFinanceConfiguration
    if not SecurityFinanceConfiguration.objects.filter(company=company, is_active=True).exists() or not ChartOfAccount.objects.filter(company=company, is_deleted=False).exists():
        try:
            from finance.services.security_coa_template import provision_security_chart_of_accounts
            # Avoid UniqueConstraint error if another FY is already marked is_current=True
            has_current_fy = FiscalYear.objects.filter(company=company, is_current=True).exists()
            if not has_current_fy:
                provision_security_chart_of_accounts(company)
        except Exception:
            pass

    existing = AccountingPeriod.objects.filter(
        company=company,
        start_date__lte=target_date,
        end_date__gte=target_date,
        is_deleted=False
    ).first()
    if existing:
        return existing

    # Find FY covering target_date or create one safely
    yr = target_date.year
    fy = FiscalYear.objects.filter(
        company=company,
        start_date__lte=target_date,
        end_date__gte=target_date,
        is_deleted=False
    ).first()
    if not fy:
        has_current = FiscalYear.objects.filter(company=company, is_current=True).exists()
        fy, _ = FiscalYear.objects.get_or_create(
            company=company,
            name=f"FY-{yr}",
            defaults={
                'start_date': date(yr, 1, 1),
                'end_date': date(yr, 12, 31),
                'is_current': not has_current,
                'is_closed': False,
            }
        )

    m = target_date.month
    start_d = date(yr, m, 1)
    end_d = date(yr, 12, 31) if m == 12 else (date(yr, m + 1, 1) - timedelta(days=1))
    period, _ = AccountingPeriod.objects.get_or_create(
        company=company,
        fiscal_year=fy,
        month=m,
        defaults={
            'period_number': m,
            'start_date': start_d,
            'end_date': end_d,
            'status': PeriodStatus.OPEN,
        }
    )
    return period

def can_post_transaction(
    company,
    transaction_date: date,
    is_adjustment: bool = False
) -> Tuple[bool, str, Optional[AccountingPeriod]]:
    """
    Answers: Can a transaction be posted for this company on this date?
    
    Rules:
    - OPEN -> Normal posting allowed.
    - SOFT_CLOSED / LOCKED -> Only authorized adjustment workflows allowed.
    - CLOSED -> All ordinary posting blocked.
    - No period found -> Posting blocked.
    """
    if not company or not transaction_date:
        return False, "Company and transaction date are required.", None

    period = AccountingPeriod.objects.filter(
        company=company,
        start_date__lte=transaction_date,
        end_date__gte=transaction_date,
        is_deleted=False
    ).first()

    if not period:
        return False, f"No accounting period found for date {transaction_date}.", None

    if period.status == PeriodStatus.CLOSED:
        return False, f"Accounting period '{period}' is CLOSED. All ordinary and adjustment postings are prohibited.", period

    if period.status == PeriodStatus.LOCKED:
        return False, f"Accounting period '{period}' is LOCKED. All ordinary and adjustment postings are strictly prohibited.", period

    if period.status == PeriodStatus.SOFT_CLOSED:
        if is_adjustment:
            return True, f"Adjustment posting permitted in soft-closed period '{period}'.", period
        return False, f"Accounting period '{period}' is SOFT_CLOSED. Ordinary postings are prohibited.", period

    return True, f"Period '{period}' is OPEN.", period


def validate_account_for_posting(account: ChartOfAccount) -> None:
    """
    Validates that a ChartOfAccount can receive direct ledger/transaction postings.
    Raises ValidationError if invalid.
    """
    if not account:
        raise ValidationError("Account is required.")

    if not account.is_active:
        raise ValidationError(f"Account '{account.account_code} - {account.account_name}' is inactive and cannot receive new transactions.")

    if account.is_header:
        raise ValidationError(f"Account '{account.account_code} - {account.account_name}' is a header/parent account and cannot receive direct postings.")

    if not account.allow_posting:
        raise ValidationError(f"Account '{account.account_code} - {account.account_name}' is marked as non-posting.")
