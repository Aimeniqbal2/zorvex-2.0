from decimal import Decimal
from typing import Optional, List, Dict, Any
from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError

from finance.models import (
    BankAccount, PettyCashCustodian, Expense, ExpenseCategory,
    ExpenseType, ExpenseStatus, ExpensePaymentStatus,
    PaymentMethod, FinancialVoucher, VoucherType
)
from finance.services.voucher_service import VoucherService
from finance.services.expense_service import ExpenseService


class PettyCashService:
    """
    Phase S-4E: Authoritative service layer for Petty Cash accounts, Custodians,
    Float Replenishments (Contra Transfers), and Simplified Expense Disbursements.
    """

    @classmethod
    @transaction.atomic
    def configure_custodian(
        cls,
        company,
        bank_account: BankAccount,
        custodian=None,
        custodian_user=None,
        float_limit: Decimal = Decimal('50000.0000'),
        replenishment_threshold: Decimal = Decimal('10000.0000'),
        max_single_expense_limit: Decimal = Decimal('15000.0000'),
        is_active: bool = True
    ) -> PettyCashCustodian:
        """
        Configures custodian profile and operational limits for a petty cash account.
        """
        if bank_account.account_type != 'PETTY_CASH':
            raise ValidationError({'bank_account': 'Account must be of type PETTY_CASH.'})

        if str(bank_account.company_id) != str(company.id):
            raise ValidationError({'bank_account': 'Bank account must belong to the same company.'})

        custodian_obj, _ = PettyCashCustodian.objects.get_or_create(
            company=company,
            bank_account=bank_account,
            defaults={
                'custodian': custodian,
                'custodian_user': custodian_user,
                'float_limit': float_limit,
                'replenishment_threshold': replenishment_threshold,
                'max_single_expense_limit': max_single_expense_limit,
                'is_active': is_active
            }
        )

        custodian_obj.custodian = custodian
        custodian_obj.custodian_user = custodian_user
        custodian_obj.float_limit = Decimal(str(float_limit)).quantize(Decimal('0.0001'))
        custodian_obj.replenishment_threshold = Decimal(str(replenishment_threshold)).quantize(Decimal('0.0001'))
        custodian_obj.max_single_expense_limit = Decimal(str(max_single_expense_limit)).quantize(Decimal('0.0001'))
        custodian_obj.is_active = is_active
        custodian_obj.save()

        return custodian_obj

    @classmethod
    @transaction.atomic
    def fund_petty_cash(
        cls,
        from_account: BankAccount,
        to_petty_cash_account: BankAccount,
        amount: Decimal,
        date=None,
        reference: str = '',
        description: str = '',
        user=None
    ) -> FinancialVoucher:
        """
        Transfers liquidity into a petty cash account from a corporate bank or master cash account.
        Reuses S-4D atomic contra transfer functionality.
        """
        if to_petty_cash_account.account_type != 'PETTY_CASH':
            raise ValidationError({'to_petty_cash_account': 'Destination account must be a PETTY_CASH account.'})

        if from_account.id == to_petty_cash_account.id:
            raise ValidationError("Source and destination accounts cannot be identical.")

        contra_voucher = VoucherService.create_contra_transfer(
            company=from_account.company,
            from_account=from_account,
            to_account=to_petty_cash_account,
            amount=amount,
            date=date or timezone.now().date(),
            reference=reference or f"FUND-PC-{to_petty_cash_account.account_title[:10]}",
            description=description or f"Petty Cash Replenishment: {to_petty_cash_account.account_title}",
            user=user,
            auto_post=True
        )

        return contra_voucher

    @classmethod
    @transaction.atomic
    def record_petty_cash_expense(
        cls,
        company,
        petty_cash_account: BankAccount,
        title: str,
        amount: Decimal,
        category: Optional[ExpenseCategory] = None,
        expense_date=None,
        payee: str = '',
        description: str = '',
        cost_center=None,
        site=None,
        receipt_reference: str = '',
        receipt_url: str = '',
        user=None,
        auto_post: bool = True
    ) -> Expense:
        """
        Disburses small routine operating expenses directly from a petty cash account.
        """
        if petty_cash_account.account_type != 'PETTY_CASH':
            raise ValidationError({'petty_cash_account': 'Specified account is not a PETTY_CASH account.'})

        # Check custodian profile limits if present
        custodian_prof = getattr(petty_cash_account, 'custodian_profile', None)
        amt = Decimal(str(amount or '0.0000')).quantize(Decimal('0.0001'))
        if custodian_prof and custodian_prof.max_single_expense_limit > 0:
            if amt > custodian_prof.max_single_expense_limit:
                raise ValidationError(
                    f"Expense amount ({amt}) exceeds petty cash single transaction limit ({custodian_prof.max_single_expense_limit})."
                )

        expense = ExpenseService.create_direct_expense(
            company=company,
            title=title,
            amount=amt,
            category=category,
            expense_date=expense_date or timezone.now().date(),
            expense_type=ExpenseType.PETTY_CASH_EXPENSE,
            payee=payee,
            payment_method=PaymentMethod.CASH,
            bank_account=petty_cash_account,
            cost_center=cost_center,
            site=site,
            receipt_reference=receipt_reference,
            receipt_url=receipt_url,
            notes=description,
            user=user,
            submit_now=True,
            auto_pay=auto_post
        )

        return expense

    @classmethod
    def get_petty_cash_summary(cls, company) -> List[Dict[str, Any]]:
        """
        Returns an operational summary of all petty cash floats for executive dashboards.
        """
        petty_accounts = BankAccount.objects.filter(
            company=company,
            account_type='PETTY_CASH',
            is_active=True
        ).select_related('custodian_profile', 'custodian_profile__custodian')

        summary = []
        for acc in petty_accounts:
            cust = getattr(acc, 'custodian_profile', None)
            recent_expenses = Expense.objects.filter(
                company=company,
                bank_account=acc,
                expense_type=ExpenseType.PETTY_CASH_EXPENSE
            ).order_by('-expense_date', '-created_at')[:5]

            recent_vouchers = FinancialVoucher.objects.filter(
                company=company,
                destination_bank_account=acc,
                voucher_type=VoucherType.CONTRA_VOUCHER
            ).order_by('-date', '-created_at')[:5]

            summary.append({
                'id': str(acc.id),
                'account_title': acc.account_title,
                'account_number': acc.account_number,
                'operational_balance': float(acc.current_balance),
                'float_limit': float(cust.float_limit) if cust else 50000.0,
                'replenishment_threshold': float(cust.replenishment_threshold) if cust else 10000.0,
                'needs_replenishment': acc.current_balance <= (cust.replenishment_threshold if cust else Decimal('10000.0000')),
                'custodian_name': f"{cust.custodian.first_name} {cust.custodian.last_name}" if cust and cust.custodian else (str(cust.custodian_user) if cust and cust.custodian_user else 'Unassigned'),
                'recent_expenses_count': Expense.objects.filter(company=company, bank_account=acc).count(),
                'recent_expenses': [
                    {
                        'id': str(e.id),
                        'expense_number': e.expense_number,
                        'title': e.title,
                        'amount': float(e.total_amount),
                        'date': str(e.expense_date),
                        'payee': e.payee
                    } for e in recent_expenses
                ]
            })

        return summary
