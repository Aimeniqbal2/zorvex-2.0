"""
finance/services/cheque_service.py

Cheque Management Service for Phase S-4D.
Handles:
1. Cheque issuance and receipt creation.
2. Cheque deposit to bank.
3. Cheque clearance tracking with clearing date.
4. Cheque bounce recording with audit reasons.
5. Cheque cancellation.
"""
import logging
from decimal import Decimal
from datetime import date
from typing import Optional

from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError

from finance.models import Cheque, ChequeStatus, BankAccount, FinancialVoucher

logger = logging.getLogger(__name__)


class ChequeService:
    """
    Authoritative Cheque Lifecycle Management Service.
    """

    @classmethod
    @transaction.atomic
    def create_cheque(
        cls,
        company,
        cheque_number: str,
        amount: Decimal,
        issue_date: date,
        bank_account: Optional[BankAccount] = None,
        voucher: Optional[FinancialVoucher] = None,
        payee_name: str = "",
        payer_name: str = "",
        drawer_bank: str = "",
        due_date: Optional[date] = None,
        status: str = ChequeStatus.ISSUED,
        notes: str = "",
        user=None,
    ) -> Cheque:
        """
        Creates a new Cheque register entry.
        """
        if not cheque_number or not str(cheque_number).strip():
            raise ValidationError("Cheque number is required.")

        amt = Decimal(str(amount)).quantize(Decimal('0.0001'))
        if amt <= Decimal('0.0000'):
            raise ValidationError("Cheque amount must be greater than zero.")

        if bank_account and bank_account.company_id != company.id:
            raise ValidationError("Bank account must belong to the same company.")
        if voucher and voucher.company_id != company.id:
            raise ValidationError("Voucher must belong to the same company.")

        cheque = Cheque.objects.create(
            company=company,
            cheque_number=cheque_number.strip(),
            bank_account=bank_account,
            voucher=voucher,
            amount=amt,
            issue_date=issue_date,
            due_date=due_date,
            payee_name=payee_name,
            payer_name=payer_name,
            drawer_bank=drawer_bank,
            status=status,
            notes=notes,
            created_by=user,
        )

        logger.info("Created Cheque %s for PKR %s [%s]", cheque.cheque_number, cheque.amount, cheque.status)
        return cheque

    @classmethod
    @transaction.atomic
    def deposit_cheque(cls, cheque: Cheque, bank_account: BankAccount, user=None) -> Cheque:
        """
        Marks a RECEIVED cheque as DEPOSITED into a specific BankAccount.
        """
        if cheque.status != ChequeStatus.RECEIVED:
            raise ValidationError(f"Cannot deposit cheque with status '{cheque.status}'. Only RECEIVED cheques can be deposited.")

        if bank_account.company_id != cheque.company_id:
            raise ValidationError("Target bank account belongs to a different company.")

        cheque.bank_account = bank_account
        cheque.status = ChequeStatus.DEPOSITED
        cheque.save(update_fields=['bank_account', 'status', 'updated_at'])

        logger.info("Deposited Cheque %s into %s", cheque.cheque_number, bank_account.account_title)
        return cheque

    @classmethod
    @transaction.atomic
    def mark_cheque_cleared(cls, cheque: Cheque, clearing_date: Optional[date] = None, user=None) -> Cheque:
        """
        Authoritatively clears an ISSUED or DEPOSITED cheque.
        """
        if cheque.status == ChequeStatus.CLEARED:
            raise ValidationError("Cheque is already cleared.")
        if cheque.status in [ChequeStatus.BOUNCED, ChequeStatus.CANCELLED]:
            raise ValidationError(f"Cannot clear a {cheque.status.lower()} cheque.")

        cheque.status = ChequeStatus.CLEARED
        cheque.clearing_date = clearing_date or timezone.now().date()
        cheque.cleared_by = user
        cheque.save(update_fields=['status', 'clearing_date', 'cleared_by', 'updated_at'])

        logger.info("Cleared Cheque %s on %s", cheque.cheque_number, cheque.clearing_date)
        return cheque

    @classmethod
    @transaction.atomic
    def bounce_cheque(cls, cheque: Cheque, bounce_reason: str, user=None) -> Cheque:
        """
        Marks a cheque as BOUNCED with recorded reason.
        """
        if cheque.status == ChequeStatus.BOUNCED:
            raise ValidationError("Cheque is already marked as bounced.")
        if cheque.status == ChequeStatus.CANCELLED:
            raise ValidationError("Cannot bounce a cancelled cheque.")

        if not bounce_reason or not str(bounce_reason).strip():
            raise ValidationError("A reason for bouncing the cheque is strictly required.")

        cheque.status = ChequeStatus.BOUNCED
        cheque.bounce_reason = bounce_reason.strip()
        cheque.bounced_by = user
        cheque.save(update_fields=['status', 'bounce_reason', 'bounced_by', 'updated_at'])

        logger.info("Bounced Cheque %s: %s", cheque.cheque_number, bounce_reason)
        return cheque

    @classmethod
    @transaction.atomic
    def cancel_cheque(cls, cheque: Cheque, user=None) -> Cheque:
        """
        Cancels a cheque.
        """
        if cheque.status == ChequeStatus.CLEARED:
            raise ValidationError("Cannot cancel a cleared cheque.")

        cheque.status = ChequeStatus.CANCELLED
        cheque.save(update_fields=['status', 'updated_at'])

        logger.info("Cancelled Cheque %s", cheque.cheque_number)
        return cheque


# Convenience module-level wrappers
create_cheque = ChequeService.create_cheque
deposit_cheque = ChequeService.deposit_cheque
mark_cheque_cleared = ChequeService.mark_cheque_cleared
bounce_cheque = ChequeService.bounce_cheque
cancel_cheque = ChequeService.cancel_cheque
