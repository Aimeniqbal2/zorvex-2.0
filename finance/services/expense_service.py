from decimal import Decimal
from typing import Optional, List, Dict, Any, Tuple
from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError

from finance.models import (
    Expense, ExpenseCategory, ExpenseAllocation,
    ExpenseType, ExpenseStatus, ExpensePaymentStatus,
    PaymentMethod, BankAccount, ChartOfAccount, CostCenter, ProfitCenter,
    FinancialVoucher, VoucherType, VoucherStatus
)
from finance.services.period_service import can_post_transaction
from finance.services.voucher_service import VoucherService


class ExpenseService:
    """
    Phase S-4E: Authoritative service layer for Company Expenses, Split Cost Allocations,
    and Employee Claims / Reimbursements.
    """

    @classmethod
    @transaction.atomic
    def create_direct_expense(
        cls,
        company,
        title: str,
        amount: Decimal,
        category: Optional[ExpenseCategory] = None,
        expense_date=None,
        expense_type: str = ExpenseType.DIRECT_EXPENSE,
        tax_amount: Decimal = Decimal('0.0000'),
        payee: str = '',
        vendor=None,
        employee=None,
        currency=None,
        payment_method: str = PaymentMethod.CASH,
        bank_account: Optional[BankAccount] = None,
        expense_account: Optional[ChartOfAccount] = None,
        cost_center: Optional[CostCenter] = None,
        profit_center: Optional[ProfitCenter] = None,
        client=None,
        contract=None,
        site=None,
        receipt_reference: str = '',
        receipt_url: str = '',
        notes: str = '',
        allocations_data: Optional[List[Dict[str, Any]]] = None,
        user=None,
        submit_now: bool = False,
        auto_pay: bool = False
    ) -> Expense:
        """
        Creates a tenant-isolated direct company expense with optional multi-dimension cost allocation.
        """
        if not title:
            raise ValidationError({'title': 'Expense title is required.'})
        
        amt = Decimal(str(amount or '0.0000')).quantize(Decimal('0.0001'))
        tax = Decimal(str(tax_amount or '0.0000')).quantize(Decimal('0.0001'))
        if amt <= 0:
            raise ValidationError({'amount': 'Expense amount must be greater than zero.'})

        exp_date = expense_date or timezone.now().date()

        # Validate tenant isolation
        if category and str(category.company_id) != str(company.id):
            raise ValidationError({'category': 'Expense category must belong to the same company.'})
        if vendor and str(vendor.company_id) != str(company.id):
            raise ValidationError({'vendor': 'Vendor must belong to the same company.'})
        if employee and str(employee.company_id) != str(company.id):
            raise ValidationError({'employee': 'Employee must belong to the same company.'})
        if bank_account and str(bank_account.company_id) != str(company.id):
            raise ValidationError({'bank_account': 'Bank account must belong to the same company.'})
        if expense_account and str(expense_account.company_id) != str(company.id):
            raise ValidationError({'expense_account': 'Expense account must belong to the same company.'})
        if cost_center and str(cost_center.company_id) != str(company.id):
            raise ValidationError({'cost_center': 'Cost center must belong to the same company.'})
        if profit_center and str(profit_center.company_id) != str(company.id):
            raise ValidationError({'profit_center': 'Profit center must belong to the same company.'})
        if client and str(client.company_id) != str(company.id):
            raise ValidationError({'client': 'Client must belong to the same company.'})
        if contract and str(contract.company_id) != str(company.id):
            raise ValidationError({'contract': 'Contract must belong to the same company.'})
        if site and str(site.company_id) != str(company.id):
            raise ValidationError({'site': 'Operational site must belong to the same company.'})

        # Default currency if not specified
        if not currency:
            from finance.models import SecurityFinanceConfiguration
            config = SecurityFinanceConfiguration.objects.filter(company=company, is_active=True).first()
            if config and config.default_currency:
                currency = config.default_currency

        status = ExpenseStatus.DRAFT
        submitted_at = None
        submitted_by = None
        if submit_now:
            status = ExpenseStatus.PENDING_APPROVAL
            submitted_at = timezone.now()
            submitted_by = user

        expense = Expense.objects.create(
            company=company,
            title=title,
            expense_date=exp_date,
            expense_type=expense_type,
            category=category,
            payee=payee,
            vendor=vendor,
            employee=employee,
            amount=amt,
            tax_amount=tax,
            total_amount=amt + tax,
            currency=currency,
            payment_method=payment_method,
            bank_account=bank_account,
            expense_account=expense_account or (category.default_expense_account if category else None),
            cost_center=cost_center,
            profit_center=profit_center,
            client=client,
            contract=contract,
            site=site,
            status=status,
            payment_status=ExpensePaymentStatus.UNPAID,
            receipt_reference=receipt_reference,
            receipt_url=receipt_url,
            notes=notes,
            created_by=user,
            submitted_by=submitted_by,
            submitted_at=submitted_at
        )

        if allocations_data:
            cls.set_split_allocations(expense, allocations_data)

        if auto_pay and bank_account:
            cls.approve_expense(expense, user=user)
            cls.pay_expense(
                expense=expense,
                bank_account=bank_account,
                payment_method=payment_method,
                payment_date=exp_date,
                user=user
            )

        return expense

    @classmethod
    @transaction.atomic
    def submit_expense(cls, expense: Expense, user=None) -> Expense:
        """
        Advances expense from DRAFT to PENDING_APPROVAL.
        """
        if expense.status not in [ExpenseStatus.DRAFT, ExpenseStatus.REJECTED]:
            raise ValidationError(f"Only draft or rejected expenses can be submitted. Current status: {expense.status}")

        expense.status = ExpenseStatus.PENDING_APPROVAL
        expense.submitted_by = user
        expense.submitted_at = timezone.now()
        expense.rejection_reason = ''
        expense.save()
        return expense

    @classmethod
    @transaction.atomic
    def approve_expense(cls, expense: Expense, user=None) -> Expense:
        """
        Approves an expense for payment / reimbursement.
        """
        if expense.status not in [ExpenseStatus.DRAFT, ExpenseStatus.PENDING_APPROVAL]:
            raise ValidationError(f"Expense cannot be approved from status {expense.status}.")

        expense.status = ExpenseStatus.APPROVED
        expense.approved_by = user
        expense.approved_at = timezone.now()
        expense.rejection_reason = ''
        expense.save()
        return expense

    @classmethod
    @transaction.atomic
    def reject_expense(cls, expense: Expense, reason: str, user=None) -> Expense:
        """
        Rejects an expense with audit justification.
        """
        if not reason:
            raise ValidationError({'reason': 'Rejection reason is required.'})

        if expense.status in [ExpenseStatus.PAID, ExpenseStatus.REVERSED, ExpenseStatus.CANCELLED]:
            raise ValidationError(f"Cannot reject an expense with status {expense.status}.")

        expense.status = ExpenseStatus.REJECTED
        expense.rejected_by = user
        expense.rejected_at = timezone.now()
        expense.rejection_reason = reason
        expense.save()
        return expense

    @classmethod
    @transaction.atomic
    def cancel_draft_expense(cls, expense: Expense, user=None) -> Expense:
        """
        Cancels an unposted draft or pending expense.
        """
        if expense.status in [ExpenseStatus.PAID, ExpenseStatus.REVERSED]:
            raise ValidationError("Paid or posted expenses cannot be cancelled. Use formal reversal.")

        expense.status = ExpenseStatus.CANCELLED
        expense.notes = f"{expense.notes}\n[Cancelled by {user} on {timezone.now().strftime('%Y-%m-%d %H:%M')}]".strip()
        expense.save()
        return expense

    @classmethod
    @transaction.atomic
    def set_split_allocations(cls, expense: Expense, allocations_data: List[Dict[str, Any]]) -> List[ExpenseAllocation]:
        """
        Distributes expense total across multiple cost centers, sites, contracts, or departments.
        Strictly enforces that sum of allocations equals the expense total amount.
        """
        if not allocations_data:
            expense.allocations.all().delete()
            expense.is_split_allocation = False
            expense.save(update_fields=['is_split_allocation'])
            return []

        total_alloc = Decimal('0.0000')
        alloc_objects = []

        for item in allocations_data:
            amt = Decimal(str(item.get('amount', '0.0000'))).quantize(Decimal('0.0001'))
            if amt <= 0:
                raise ValidationError("Allocation amount must be greater than zero.")
            total_alloc += amt

            cost_center_id = item.get('cost_center_id') or item.get('cost_center')
            profit_center_id = item.get('profit_center_id') or item.get('profit_center')
            client_id = item.get('client_id') or item.get('client')
            contract_id = item.get('contract_id') or item.get('contract')
            site_id = item.get('site_id') or item.get('site')
            department_id = item.get('department_id') or item.get('department')

            # Multi-tenant checks
            if cost_center_id and not CostCenter.objects.filter(id=cost_center_id, company=expense.company).exists():
                raise ValidationError("Cost center does not belong to the same company.")

            alloc_objects.append(
                ExpenseAllocation(
                    company=expense.company,
                    expense=expense,
                    amount=amt,
                    percentage=Decimal(str(item.get('percentage', 0))).quantize(Decimal('0.01')),
                    cost_center_id=cost_center_id,
                    profit_center_id=profit_center_id,
                    client_id=client_id,
                    contract_id=contract_id,
                    site_id=site_id,
                    department_id=department_id,
                    description=item.get('description', '')
                )
            )

        # Tolerance comparison
        diff = abs(total_alloc - expense.total_amount)
        if diff > Decimal('0.01'):
            raise ValidationError(
                f"Sum of allocations ({total_alloc}) does not match expense total amount ({expense.total_amount}). Over-allocation / Under-allocation blocked."
            )

        expense.allocations.all().delete()
        saved_allocs = ExpenseAllocation.objects.bulk_create(alloc_objects)
        expense.is_split_allocation = True
        expense.save(update_fields=['is_split_allocation'])
        return saved_allocs

    @classmethod
    @transaction.atomic
    def pay_expense(
        cls,
        expense: Expense,
        bank_account: BankAccount,
        payment_method: str = PaymentMethod.BANK_TRANSFER,
        payment_date=None,
        user=None,
        reference: str = '',
        notes: str = ''
    ) -> FinancialVoucher:
        """
        Financially settles an approved expense through Treasury, creating and posting a FinancialVoucher.
        Guarantees idempotency: cannot pay an already paid expense.
        """
        if expense.status == ExpenseStatus.PAID and expense.voucher_id:
            return expense.voucher

        if expense.status not in [ExpenseStatus.APPROVED, ExpenseStatus.DRAFT, ExpenseStatus.PENDING_APPROVAL]:
            raise ValidationError(f"Expense in status {expense.status} cannot be paid.")

        if str(bank_account.company_id) != str(expense.company_id):
            raise ValidationError({'bank_account': 'Bank account must belong to the same company.'})

        p_date = payment_date or expense.expense_date or timezone.now().date()

        # Check accounting period
        can_post, reason, _ = can_post_transaction(expense.company, p_date)
        if not can_post:
            raise ValidationError(f"Cannot post expense payment in closed/locked period: {reason}")

        # Choose appropriate voucher type
        if bank_account.account_type == 'CASH':
            v_type = VoucherType.CASH_PAYMENT
        elif bank_account.account_type == 'PETTY_CASH':
            v_type = VoucherType.PETTY_CASH_VOUCHER
        else:
            v_type = VoucherType.BANK_PAYMENT

        # Build single or multi-line lines
        lines_data = []
        if expense.is_split_allocation and expense.allocations.exists():
            for alloc in expense.allocations.all():
                lines_data.append({
                    'account_id': str(expense.expense_account_id) if expense.expense_account_id else None,
                    'cost_center_id': str(alloc.cost_center_id) if alloc.cost_center_id else (str(expense.cost_center_id) if expense.cost_center_id else None),
                    'profit_center_id': str(alloc.profit_center_id) if alloc.profit_center_id else (str(expense.profit_center_id) if expense.profit_center_id else None),
                    'site_id': str(alloc.site_id) if alloc.site_id else (str(expense.site_id) if expense.site_id else None),
                    'contract_id': str(alloc.contract_id) if alloc.contract_id else (str(expense.contract_id) if expense.contract_id else None),
                    'description': alloc.description or f"{expense.title} (Split)",
                    'debit': alloc.amount,
                    'credit': Decimal('0.0000')
                })
        else:
            lines_data.append({
                'account_id': str(expense.expense_account_id) if expense.expense_account_id else None,
                'cost_center_id': str(expense.cost_center_id) if expense.cost_center_id else None,
                'profit_center_id': str(expense.profit_center_id) if expense.profit_center_id else None,
                'site_id': str(expense.site_id) if expense.site_id else None,
                'contract_id': str(expense.contract_id) if expense.contract_id else None,
                'description': expense.description or expense.title,
                'debit': expense.total_amount,
                'credit': Decimal('0.0000')
            })

        voucher = VoucherService.create_financial_voucher(
            company=expense.company,
            voucher_type=v_type,
            date=p_date,
            amount=expense.total_amount,
            bank_account=bank_account,
            payment_method=payment_method,
            counterparty_name=expense.payee or (str(expense.employee) if expense.employee else (expense.vendor.name if expense.vendor else expense.title)),
            reference=reference or expense.expense_number or expense.receipt_reference,
            description=f"Expense Payment: {expense.expense_number} - {expense.title}",
            source_module='FINANCE_EXPENSE',
            source_document_type='EXPENSE',
            source_document_id=expense.id,
            lines_data=lines_data,
            user=user,
            auto_post=False
        )

        # Post voucher to execute Treasury movement
        VoucherService.post_financial_voucher(voucher=voucher, user=user)

        # Update expense record
        expense.bank_account = bank_account
        expense.payment_method = payment_method
        expense.voucher = voucher
        expense.status = ExpenseStatus.PAID
        expense.payment_status = ExpensePaymentStatus.PAID
        expense.paid_amount = expense.total_amount
        expense.paid_by = user
        expense.paid_at = timezone.now()
        if expense.status != ExpenseStatus.APPROVED:
            expense.approved_by = user
            expense.approved_at = timezone.now()
        expense.save()

        return voucher

    @classmethod
    @transaction.atomic
    def reverse_expense(cls, expense: Expense, reason: str, user=None) -> Expense:
        """
        Performs a full audit reversal of a paid expense and its linked treasury voucher.
        """
        if not reason:
            raise ValidationError({'reason': 'Reversal reason is required.'})

        if expense.status != ExpenseStatus.PAID:
            raise ValidationError(f"Only paid expenses can be reversed. Current status: {expense.status}")

        if expense.voucher:
            VoucherService.reverse_financial_voucher(
                voucher=expense.voucher,
                reversal_reason=f"Expense Reversal ({expense.expense_number}): {reason}",
                user=user
            )

        expense.status = ExpenseStatus.REVERSED
        expense.payment_status = ExpensePaymentStatus.UNPAID
        expense.paid_amount = Decimal('0.0000')
        expense.reversed_by = user
        expense.reversed_at = timezone.now()
        expense.reversal_reason = reason
        expense.save()

        return expense

    @classmethod
    @transaction.atomic
    def create_employee_claim(
        cls,
        company,
        employee,
        title: str,
        amount: Decimal,
        category: Optional[ExpenseCategory] = None,
        expense_date=None,
        tax_amount: Decimal = Decimal('0.0000'),
        payment_method: str = PaymentMethod.BANK_TRANSFER,
        site=None,
        contract=None,
        cost_center=None,
        receipt_reference: str = '',
        receipt_url: str = '',
        notes: str = '',
        user=None,
        submit_now: bool = True
    ) -> Expense:
        """
        Submits an employee expense reimbursement claim.
        """
        return cls.create_direct_expense(
            company=company,
            title=title,
            amount=amount,
            category=category,
            expense_date=expense_date,
            expense_type=ExpenseType.EMPLOYEE_CLAIM,
            tax_amount=tax_amount,
            payee=f"{employee.first_name} {employee.last_name}",
            employee=employee,
            payment_method=payment_method,
            site=site,
            contract=contract,
            cost_center=cost_center,
            receipt_reference=receipt_reference,
            receipt_url=receipt_url,
            notes=notes,
            user=user,
            submit_now=submit_now,
            auto_pay=False
        )

    @classmethod
    @transaction.atomic
    def approve_employee_claim(cls, claim: Expense, user=None) -> Expense:
        """
        Approves an employee reimbursement claim.
        """
        if claim.expense_type != ExpenseType.EMPLOYEE_CLAIM:
            raise ValidationError("Specified expense is not an Employee Claim.")
        return cls.approve_expense(claim, user=user)

    @classmethod
    @transaction.atomic
    def reimburse_employee_claim(
        cls,
        claim: Expense,
        bank_account: BankAccount,
        payment_method: str = PaymentMethod.BANK_TRANSFER,
        payment_date=None,
        user=None,
        reference: str = ''
    ) -> FinancialVoucher:
        """
        Reimburses an approved employee claim via Treasury payment.
        Guarantees claim cannot be reimbursed twice.
        """
        if claim.expense_type != ExpenseType.EMPLOYEE_CLAIM:
            raise ValidationError("Specified expense is not an Employee Claim.")

        if claim.status == ExpenseStatus.PAID and claim.voucher_id:
            raise ValidationError(f"Claim {claim.expense_number} has already been reimbursed.")

        if claim.status != ExpenseStatus.APPROVED:
            cls.approve_expense(claim, user=user)

        voucher = cls.pay_expense(
            expense=claim,
            bank_account=bank_account,
            payment_method=payment_method,
            payment_date=payment_date,
            user=user,
            reference=reference or f"REIMB-{claim.expense_number}"
        )
        return voucher
