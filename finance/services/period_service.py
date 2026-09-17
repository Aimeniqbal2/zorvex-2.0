"""
finance/services/period_service.py
Validation service for Fiscal Years, Accounting Periods, and Account posting controls.
"""
from typing import Tuple, Optional
from datetime import date
from django.core.exceptions import ValidationError
from finance.models import AccountingPeriod, ChartOfAccount, PeriodStatus

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
