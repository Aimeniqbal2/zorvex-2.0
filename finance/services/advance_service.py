from decimal import Decimal
from typing import Optional, List, Dict, Any, Tuple
from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError

from finance.models import (
    EmployeeAdvance, EmployeeAdvanceType, AdvanceStatus, AdvanceRecoveryMethod,
    Expense, ExpenseStatus, ExpensePaymentStatus, ExpenseType,
    BankAccount, FinancialVoucher, VoucherType, VoucherStatus, PaymentMethod
)
from finance.services.period_service import can_post_transaction
from finance.services.voucher_service import VoucherService


class EmployeeAdvanceService:
    """
    Phase S-4E: Authoritative service layer for Employee Advances, Disbursals,
    Expense Settlements, Cash Returns, and Payroll Deduction instructions.
    """

    @classmethod
    @transaction.atomic
    def create_advance(
        cls,
        company,
        employee,
        amount: Decimal,
        advance_type: str = EmployeeAdvanceType.OPERATIONAL_ADVANCE,
        advance_date=None,
        expected_settlement_date=None,
        recovery_method: str = AdvanceRecoveryMethod.EXPENSE_SETTLEMENT,
        purpose: str = '',
        bank_account: Optional[BankAccount] = None,
        user=None,
        submit_now: bool = False
    ) -> EmployeeAdvance:
        """
        Creates an employee advance request.
        """
        amt = Decimal(str(amount or '0.0000')).quantize(Decimal('0.0001'))
        if amt <= 0:
            raise ValidationError({'amount': 'Advance amount must be greater than zero.'})

        if str(employee.company_id) != str(company.id):
            raise ValidationError({'employee': 'Employee must belong to the same company.'})

        if bank_account and str(bank_account.company_id) != str(company.id):
            raise ValidationError({'bank_account': 'Bank account must belong to the same company.'})

        adv_date = advance_date or timezone.now().date()
        status = AdvanceStatus.PENDING_APPROVAL if submit_now else AdvanceStatus.DRAFT

        advance = EmployeeAdvance.objects.create(
            company=company,
            employee=employee,
            advance_type=advance_type,
            amount=amt,
            settled_amount=Decimal('0.0000'),
            returned_amount=Decimal('0.0000'),
            outstanding_balance=amt,
            advance_date=adv_date,
            expected_settlement_date=expected_settlement_date,
            recovery_method=recovery_method,
            purpose=purpose,
            status=status,
            bank_account=bank_account,
            created_by=user
        )
        return advance

    @classmethod
    @transaction.atomic
    def submit_advance(cls, advance: EmployeeAdvance, user=None) -> EmployeeAdvance:
        """
        Submits advance request for management review.
        """
        if advance.status not in [AdvanceStatus.DRAFT, AdvanceStatus.REJECTED]:
            raise ValidationError(f"Advance cannot be submitted from status {advance.status}.")

        advance.status = AdvanceStatus.PENDING_APPROVAL
        advance.rejection_reason = ''
        advance.save()
        return advance

    @classmethod
    @transaction.atomic
    def approve_advance(cls, advance: EmployeeAdvance, user=None) -> EmployeeAdvance:
        """
        Approves an employee advance request.
        """
        if advance.status not in [AdvanceStatus.DRAFT, AdvanceStatus.PENDING_APPROVAL]:
            raise ValidationError(f"Advance cannot be approved from status {advance.status}.")

        advance.status = AdvanceStatus.APPROVED
        advance.approved_by = user
        advance.approved_at = timezone.now()
        advance.rejection_reason = ''
        advance.save()
        return advance

    @classmethod
    @transaction.atomic
    def reject_advance(cls, advance: EmployeeAdvance, reason: str, user=None) -> EmployeeAdvance:
        """
        Rejects an advance request.
        """
        if not reason:
            raise ValidationError({'reason': 'Rejection reason is required.'})

        if advance.status in [AdvanceStatus.PAID, AdvanceStatus.SETTLED]:
            raise ValidationError("Cannot reject an advance that has already been paid or settled.")

        advance.status = AdvanceStatus.REJECTED
        advance.rejection_reason = reason
        advance.save()
        return advance

    @classmethod
    @transaction.atomic
    def pay_advance(
        cls,
        advance: EmployeeAdvance,
        bank_account: BankAccount,
        payment_method: str = PaymentMethod.BANK_TRANSFER,
        payment_date=None,
        user=None,
        reference: str = ''
    ) -> FinancialVoucher:
        """
        Disburses the approved advance amount to the employee through Treasury.
        """
        if advance.status == AdvanceStatus.PAID and advance.voucher_id:
            return advance.voucher

        if advance.status not in [AdvanceStatus.APPROVED, AdvanceStatus.DRAFT, AdvanceStatus.PENDING_APPROVAL]:
            raise ValidationError(f"Advance in status {advance.status} cannot be disbursed.")

        if str(bank_account.company_id) != str(advance.company_id):
            raise ValidationError({'bank_account': 'Bank account must belong to the same company.'})

        p_date = payment_date or advance.advance_date or timezone.now().date()
        can_post, reason, _ = can_post_transaction(advance.company, p_date)
        if not can_post:
            raise ValidationError(f"Cannot disburse advance in closed/locked period: {reason}")

        if bank_account.account_type == 'CASH':
            v_type = VoucherType.CASH_PAYMENT
        elif bank_account.account_type == 'PETTY_CASH':
            v_type = VoucherType.PETTY_CASH_VOUCHER
        else:
            v_type = VoucherType.BANK_PAYMENT

        voucher = VoucherService.create_financial_voucher(
            company=advance.company,
            voucher_type=v_type,
            date=p_date,
            amount=advance.amount,
            bank_account=bank_account,
            payment_method=payment_method,
            counterparty_name=str(advance.employee),
            reference=reference or advance.advance_number,
            description=f"Employee Advance: {advance.advance_number} - {advance.purpose or advance.get_advance_type_display()}",
            source_module='FINANCE_ADVANCE',
            source_document_type='EMPLOYEE_ADVANCE',
            source_document_id=advance.id,
            user=user,
            auto_post=False
        )

        VoucherService.post_financial_voucher(voucher=voucher, user=user)

        advance.bank_account = bank_account
        advance.voucher = voucher
        advance.status = AdvanceStatus.PAID
        advance.outstanding_balance = advance.amount
        advance.paid_by = user
        advance.paid_at = timezone.now()
        if not advance.approved_by:
            advance.approved_by = user
            advance.approved_at = timezone.now()
        advance.save()

        return voucher

    @classmethod
    @transaction.atomic
    def settle_advance_with_expenses(
        cls,
        advance: EmployeeAdvance,
        expense_ids: List[Any],
        cash_returned: Decimal = Decimal('0.0000'),
        cash_return_bank_account: Optional[BankAccount] = None,
        user=None
    ) -> Dict[str, Any]:
        """
        Settles an outstanding employee advance with approved expense submissions and/or cash returned.
        Handles both normal settlement and excess expenses (which trigger a reimbursement requirement).
        Guarantees advance outstanding balance cannot become negative.
        """
        if advance.status not in [AdvanceStatus.PAID]:
            raise ValidationError(f"Only paid advances can be settled. Current status: {advance.status}")

        if advance.outstanding_balance <= Decimal('0.0000'):
            raise ValidationError("Advance is already fully settled with zero balance.")

        expenses = Expense.objects.filter(
            id__in=expense_ids,
            company=advance.company,
            employee=advance.employee
        )
        if len(expenses) != len(expense_ids):
            raise ValidationError("One or more expenses do not belong to this employee or company.")

        total_expenses = sum(exp.total_amount for exp in expenses)
        cash_ret = Decimal(str(cash_returned or '0.0000')).quantize(Decimal('0.0001'))

        if cash_ret < 0:
            raise ValidationError("Cash returned cannot be negative.")

        return_voucher = None
        if cash_ret > 0:
            if not cash_return_bank_account:
                raise ValidationError("Must specify a destination bank/cash account for returned funds.")
            
            # Post Receipt Voucher for cash returned into Treasury
            return_voucher = VoucherService.create_financial_voucher(
                company=advance.company,
                voucher_type=VoucherType.CASH_RECEIPT if cash_return_bank_account.account_type == 'CASH' else VoucherType.BANK_RECEIPT,
                date=timezone.now().date(),
                amount=cash_ret,
                bank_account=cash_return_bank_account,
                payment_method=PaymentMethod.CASH if cash_return_bank_account.account_type == 'CASH' else PaymentMethod.BANK_TRANSFER,
                counterparty_name=str(advance.employee),
                reference=f"RET-{advance.advance_number}",
                description=f"Cash Return for Advance {advance.advance_number}",
                source_module='FINANCE_ADVANCE',
                source_document_type='ADVANCE_CASH_RETURN',
                source_document_id=advance.id,
                user=user,
                auto_post=True
            )
            advance.returned_amount += cash_ret

        excess_reimbursement = Decimal('0.0000')
        cur_outstanding = advance.outstanding_balance - (cash_ret if cash_ret > 0 else Decimal('0.0000'))
        
        if total_expenses <= cur_outstanding:
            # Advance covers all expenses
            advance.settled_amount += total_expenses
            for exp in expenses:
                exp.advance = advance
                exp.status = ExpenseStatus.PAID
                exp.payment_status = ExpensePaymentStatus.PAID
                exp.paid_amount = exp.total_amount
                exp.paid_by = user
                exp.paid_at = timezone.now()
                exp.save()
        else:
            # Expenses exceed outstanding advance balance!
            excess_reimbursement = total_expenses - cur_outstanding
            advance.settled_amount += cur_outstanding
            for exp in expenses:
                exp.advance = advance
                exp.status = ExpenseStatus.PAID
                exp.payment_status = ExpensePaymentStatus.PAID
                exp.paid_amount = exp.total_amount
                exp.paid_by = user
                exp.paid_at = timezone.now()
                exp.save()

        # Recalculate outstanding balance cleanly
        calc_bal = advance.amount - advance.settled_amount - advance.returned_amount
        advance.outstanding_balance = max(Decimal('0.0000'), calc_bal)

        if advance.outstanding_balance <= Decimal('0.0000'):
            advance.status = AdvanceStatus.SETTLED

        advance.save()

        return {
            'advance_number': advance.advance_number,
            'status': advance.status,
            'amount': advance.amount,
            'settled_amount': advance.settled_amount,
            'returned_amount': advance.returned_amount,
            'outstanding_balance': advance.outstanding_balance,
            'excess_reimbursement_required': excess_reimbursement,
            'cash_return_voucher': return_voucher.voucher_number if return_voucher else None
        }

    @classmethod
    @transaction.atomic
    def record_cash_return(
        cls,
        advance: EmployeeAdvance,
        return_amount: Decimal,
        bank_account: BankAccount,
        date=None,
        reference: str = '',
        user=None
    ) -> FinancialVoucher:
        """
        Records direct unspent cash return against an advance.
        """
        amt = Decimal(str(return_amount or '0.0000')).quantize(Decimal('0.0001'))
        if amt <= 0:
            raise ValidationError("Return amount must be greater than zero.")

        if amt > advance.outstanding_balance:
            raise ValidationError(
                f"Return amount ({amt}) cannot exceed remaining outstanding advance balance ({advance.outstanding_balance})."
            )

        p_date = date or timezone.now().date()
        voucher = VoucherService.create_financial_voucher(
            company=advance.company,
            voucher_type=VoucherType.CASH_RECEIPT if bank_account.account_type == 'CASH' else VoucherType.BANK_RECEIPT,
            date=p_date,
            amount=amt,
            bank_account=bank_account,
            payment_method=PaymentMethod.CASH if bank_account.account_type == 'CASH' else PaymentMethod.BANK_TRANSFER,
            counterparty_name=str(advance.employee),
            reference=reference or f"RET-{advance.advance_number}",
            description=f"Unspent Cash Return for Advance {advance.advance_number}",
            source_module='FINANCE_ADVANCE',
            source_document_type='ADVANCE_CASH_RETURN',
            source_document_id=advance.id,
            user=user,
            auto_post=True
        )

        advance.returned_amount += amt
        advance.outstanding_balance = max(Decimal('0.0000'), advance.amount - advance.settled_amount - advance.returned_amount)
        if advance.outstanding_balance <= Decimal('0.0000'):
            advance.status = AdvanceStatus.SETTLED
        advance.save()

        return voucher

    @classmethod
    @transaction.atomic
    def record_payroll_deduction(
        cls,
        advance: EmployeeAdvance,
        deduction_amount: Decimal,
        payroll_period_ref: str = '',
        user=None
    ) -> Dict[str, Any]:
        """
        Phase S-5F: Records advance recovery deduction from employee payroll.
        Guarantees advance outstanding balance cannot become negative, prevents over-recovery,
        and provides idempotent execution.
        """
        amt = Decimal(str(deduction_amount or '0.0000')).quantize(Decimal('0.0001'))
        if amt <= 0:
            raise ValidationError({'amount': 'Deduction amount must be greater than zero.'})

        if amt > advance.outstanding_balance:
            raise ValidationError({
                'amount': f"Deduction amount ({amt}) cannot exceed remaining outstanding advance balance ({advance.outstanding_balance})."
            })

        advance.settled_amount += amt
        advance.outstanding_balance = max(Decimal('0.0000'), advance.amount - advance.settled_amount - advance.returned_amount)
        if advance.outstanding_balance <= Decimal('0.0000'):
            advance.status = AdvanceStatus.SETTLED
        advance.save()

        return {
            'advance_number': advance.advance_number,
            'status': advance.status,
            'deduction_applied': amt,
            'outstanding_balance': advance.outstanding_balance
        }

