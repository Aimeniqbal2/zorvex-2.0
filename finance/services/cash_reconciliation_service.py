from decimal import Decimal
from datetime import date
from django.utils import timezone
from django.db import transaction
from django.core.exceptions import ValidationError
from finance.models import (
    BankAccount, BankAccountType, CashCount, CashCountStatus,
    ControlException, ControlExceptionType, ControlExceptionSeverity, ControlExceptionStatus
)

class CashReconciliationService:
    """
    Authoritative Physical Cash Count Verification Engine for Zorvex ERP 2.0.
    Manages cash/petty-cash physical count audits and logs variances.
    """

    @classmethod
    @transaction.atomic
    def perform_cash_count(
        cls,
        cash_account: BankAccount,
        count_date: date,
        physical_count: Decimal,
        counted_by,
        variance_reason: str = '',
        reviewed_by=None
    ) -> CashCount:
        if cash_account.account_type not in [BankAccountType.CASH, BankAccountType.PETTY_CASH]:
            raise ValidationError("Cash count can only be performed on Cash or Petty Cash accounts.")

        company = cash_account.company

        system_balance = cash_account.current_balance
        diff = physical_count - system_balance

        status = CashCountStatus.VERIFIED if diff == Decimal('0.0000') else CashCountStatus.VARIANCE_LOGGED

        count = CashCount.objects.create(
            company=company,
            cash_account=cash_account,
            count_date=count_date,
            system_balance=system_balance,
            physical_count=physical_count,
            difference=diff,
            variance_reason=variance_reason,
            counted_by=counted_by,
            reviewed_by=reviewed_by,
            status=status
        )

        # Log Control Exception if physical variance exists
        if diff != Decimal('0.0000'):
            ControlException.objects.create(
                company=company,
                exception_type=ControlExceptionType.CASH_VARIANCE,
                title=f"Physical Cash Count Variance on {cash_account.account_name}",
                description=f"System balance: {system_balance}, Physical count: {physical_count}. Difference: {diff}. Reason: {variance_reason}",
                amount=abs(diff),
                severity=ControlExceptionSeverity.WARNING,
                status=ControlExceptionStatus.OPEN
            )

        return count
