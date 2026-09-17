"""
finance/services/voucher_service.py

Financial Voucher Service for Phase S-4D.
Universal Financial Voucher lifecycle engine:
- Types: Receipt, Payment, Bank Receipt/Payment, Cash Receipt/Payment, Contra, Petty Cash, Journal.
- Lifecycle: DRAFT -> PENDING_APPROVAL -> APPROVED -> POSTED -> REVERSED.
- Accounting Period Control via `period_service.can_post_transaction`.
- Atomic two-sided Contra Transfers (Bank -> Bank, Bank -> Cash, Cash -> Petty Cash, etc.).
- Source document integrations with idempotency guards for:
    1. Phase S-4C Client Receipts -> Receipt Voucher.
    2. Phase S-3E Vendor Payments -> Payment Voucher.
"""
import logging
from decimal import Decimal
from datetime import date
from typing import Dict, Any, List, Optional

from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError

from finance.models import (
    FinancialVoucher,
    FinancialVoucherLine,
    VoucherType,
    VoucherStatus,
    PaymentMethod,
    BankAccount,
    BankAccountType,
    ChartOfAccount,
    CostCenter,
    ProfitCenter,
    Currency,
    SecurityFinanceConfiguration,
    TreasuryTransactionType,
)
from finance.services.period_service import can_post_transaction
from finance.services.treasury_service import (
    record_treasury_movement,
    reverse_treasury_entries_for_voucher,
)

logger = logging.getLogger(__name__)


class VoucherService:
    """
    Authoritative Financial Voucher management and lifecycle engine.
    """

    @classmethod
    @transaction.atomic
    def create_financial_voucher(
        cls,
        company,
        voucher_type: str,
        date: date,
        amount: Decimal,
        bank_account: Optional[BankAccount] = None,
        destination_bank_account: Optional[BankAccount] = None,
        payment_account: Optional[ChartOfAccount] = None,
        payment_method: str = PaymentMethod.CASH,
        reference: str = "",
        description: str = "",
        counterparty_name: str = "",
        customer=None,
        currency: Optional[Currency] = None,
        lines_data: Optional[List[Dict[str, Any]]] = None,
        user=None,
        source_module: str = "",
        source_document_type: str = "",
        source_document_id=None,
        auto_post: bool = False,
    ) -> FinancialVoucher:
        """
        Creates a new FinancialVoucher with lines and optional automatic posting.
        """
        amt = Decimal(str(amount or '0.0000')).quantize(Decimal('0.0001'))

        # Idempotency Guard for source documents
        if source_document_type and source_document_id:
            existing = FinancialVoucher.objects.filter(
                company=company,
                source_document_type=source_document_type,
                source_document_id=source_document_id,
                is_deleted=False
            ).exclude(status=VoucherStatus.CANCELLED).first()
            if existing:
                logger.info(
                    "Voucher already exists for source %s %s: %s",
                    source_document_type, source_document_id, existing.voucher_number
                )
                return existing

        # Validate Same-Company Scoping
        if bank_account and bank_account.company_id != company.id:
            raise ValidationError("Bank account must belong to the same company.")
        if destination_bank_account and destination_bank_account.company_id != company.id:
            raise ValidationError("Destination bank account must belong to the same company.")
        if payment_account and payment_account.company_id != company.id:
            raise ValidationError("Payment GL account must belong to the same company.")
        if customer and customer.company_id != company.id:
            raise ValidationError("Customer entity must belong to the same company.")
        if currency and currency.company_id != company.id:
            raise ValidationError("Currency must belong to the same company.")

        # Fallback currency
        if not currency:
            currency = getattr(bank_account, 'currency', None) if bank_account else None
        if not currency:
            currency = Currency.objects.filter(company=company, is_base_currency=True).first()

        # Fallback payment account from bank account chart of account if missing
        if not payment_account and bank_account and bank_account.chart_of_account:
            payment_account = bank_account.chart_of_account

        voucher = FinancialVoucher.objects.create(
            company=company,
            voucher_type=voucher_type,
            date=date,
            amount=amt,
            total_amount=amt,
            bank_account=bank_account,
            destination_bank_account=destination_bank_account,
            payment_account=payment_account,
            payment_method=payment_method,
            reference=reference,
            description=description,
            counterparty_name=counterparty_name,
            payee_name=counterparty_name,
            customer=customer,
            currency=currency,
            status=VoucherStatus.DRAFT,
            created_by=user,
            source_module=source_module,
            source_document_type=source_document_type,
            source_document_id=source_document_id,
        )

        # Create voucher lines if provided
        if lines_data:
            for l_data in lines_data:
                acct = l_data.get('account')
                if acct and acct.company_id != company.id:
                    raise ValidationError(f"Account {acct} must belong to the same company.")
                FinancialVoucherLine.objects.create(
                    company=company,
                    voucher=voucher,
                    account=acct or payment_account,
                    amount=Decimal(str(l_data.get('amount', amt))).quantize(Decimal('0.0001')),
                    description=l_data.get('description', description),
                    cost_center=l_data.get('cost_center'),
                    profit_center=l_data.get('profit_center'),
                )

        if auto_post:
            cls.post_financial_voucher(voucher, user=user)

        logger.info("Created FinancialVoucher %s (%s)", voucher.voucher_number, voucher.status)
        return voucher

    @classmethod
    @transaction.atomic
    def submit_voucher_for_approval(cls, voucher: FinancialVoucher, user=None) -> FinancialVoucher:
        """
        Transitions voucher from DRAFT to PENDING_APPROVAL.
        """
        if voucher.status != VoucherStatus.DRAFT:
            raise ValidationError(f"Cannot submit voucher with status '{voucher.status}' for approval.")
        voucher.status = VoucherStatus.PENDING_APPROVAL
        voucher.save(update_fields=['status', 'updated_at'])
        logger.info("Submitted voucher %s for approval", voucher.voucher_number)
        return voucher

    @classmethod
    @transaction.atomic
    def approve_voucher(cls, voucher: FinancialVoucher, user=None) -> FinancialVoucher:
        """
        Transitions voucher to APPROVED.
        """
        if voucher.status not in [VoucherStatus.DRAFT, VoucherStatus.PENDING_APPROVAL]:
            raise ValidationError(f"Cannot approve voucher with status '{voucher.status}'.")

        voucher.status = VoucherStatus.APPROVED
        voucher.approved_by = user
        voucher.approved_at = timezone.now()
        voucher.save(update_fields=['status', 'approved_by', 'approved_at', 'updated_at'])
        logger.info("Approved voucher %s by %s", voucher.voucher_number, user)
        return voucher

    @classmethod
    @transaction.atomic
    def post_financial_voucher(cls, voucher: FinancialVoucher, user=None) -> FinancialVoucher:
        """
        Authoritatively posts the financial voucher:
        1. Verifies accounting period open status via `can_post_transaction`.
        2. Enforces immutability on already-posted records.
        3. Updates operational treasury balances via `TreasuryService`.
        4. Transitions status to POSTED.
        """
        if voucher.status == VoucherStatus.POSTED:
            raise ValidationError(f"Voucher '{voucher.voucher_number}' is already posted.")
        if voucher.status in [VoucherStatus.CANCELLED, VoucherStatus.REVERSED]:
            raise ValidationError(f"Cannot post a {voucher.status.lower()} voucher.")

        # 1. Accounting Period Verification
        can_post, reason, _ = can_post_transaction(voucher.company, voucher.date, is_adjustment=False)
        if not can_post:
            raise ValidationError(f"Accounting Period Control: {reason}")

        # 2. Record Operational Treasury Movements
        vtype = voucher.voucher_type
        amt = voucher.total_amount or voucher.amount

        # (a) Contra Transfer (Two-sided atomic movements)
        if vtype in [VoucherType.CONTRA_VOUCHER, VoucherType.CONTRA]:
            if not voucher.bank_account:
                raise ValidationError("Contra voucher requires a source bank/cash account.")
            if not voucher.destination_bank_account:
                raise ValidationError("Contra voucher requires a destination bank/cash account.")
            if voucher.bank_account_id == voucher.destination_bank_account_id:
                raise ValidationError("Source and destination accounts for Contra cannot be identical.")

            # Leg 1: Money Out from Source Account
            record_treasury_movement(
                bank_account=voucher.bank_account,
                voucher=voucher,
                transaction_type=TreasuryTransactionType.TRANSFER_OUT,
                money_in=Decimal('0.0000'),
                money_out=amt,
                reference=voucher.voucher_number,
                description=f"Transfer to {voucher.destination_bank_account.account_title}: {voucher.description}".strip(),
                transaction_date=voucher.date,
                user=user,
            )

            # Leg 2: Money In to Destination Account
            record_treasury_movement(
                bank_account=voucher.destination_bank_account,
                voucher=voucher,
                transaction_type=TreasuryTransactionType.TRANSFER_IN,
                money_in=amt,
                money_out=Decimal('0.0000'),
                reference=voucher.voucher_number,
                description=f"Transfer from {voucher.bank_account.account_title}: {voucher.description}".strip(),
                transaction_date=voucher.date,
                user=user,
            )

        # (b) Receipts (Money In)
        elif vtype in [
            VoucherType.RECEIPT_VOUCHER, VoucherType.RECEIPT,
            VoucherType.BANK_RECEIPT, VoucherType.CASH_RECEIPT
        ]:
            if voucher.bank_account:
                record_treasury_movement(
                    bank_account=voucher.bank_account,
                    voucher=voucher,
                    transaction_type=TreasuryTransactionType.MONEY_IN,
                    money_in=amt,
                    money_out=Decimal('0.0000'),
                    reference=voucher.voucher_number,
                    description=voucher.description or f"Receipt from {voucher.counterparty_name}",
                    transaction_date=voucher.date,
                    user=user,
                )

        # (c) Payments (Money Out)
        elif vtype in [
            VoucherType.PAYMENT_VOUCHER, VoucherType.PAYMENT,
            VoucherType.BANK_PAYMENT, VoucherType.CASH_PAYMENT,
            VoucherType.PETTY_CASH_VOUCHER
        ]:
            if voucher.bank_account:
                record_treasury_movement(
                    bank_account=voucher.bank_account,
                    voucher=voucher,
                    transaction_type=TreasuryTransactionType.MONEY_OUT,
                    money_in=Decimal('0.0000'),
                    money_out=amt,
                    reference=voucher.voucher_number,
                    description=voucher.description or f"Payment to {voucher.counterparty_name}",
                    transaction_date=voucher.date,
                    user=user,
                )

        # 3. Transition Status
        voucher.status = VoucherStatus.POSTED
        voucher.posted_by = user
        voucher.posted_at = timezone.now()
        voucher.save(update_fields=['status', 'posted_by', 'posted_at', 'updated_at'])

        logger.info("Posted FinancialVoucher %s", voucher.voucher_number)
        return voucher

    @classmethod
    @transaction.atomic
    def reverse_financial_voucher(
        cls,
        voucher: FinancialVoucher,
        reversal_reason: str,
        user=None,
    ) -> FinancialVoucher:
        """
        Atomically reverses a POSTED voucher and all its operational treasury ledger entries.
        """
        if voucher.status != VoucherStatus.POSTED:
            raise ValidationError(f"Only POSTED vouchers can be reversed. Current status: '{voucher.status}'.")

        if not reversal_reason or not str(reversal_reason).strip():
            raise ValidationError("A reversal reason is strictly required.")

        now = timezone.now()

        # Check accounting period for reversal date
        can_post, reason, _ = can_post_transaction(voucher.company, now.date(), is_adjustment=True)
        if not can_post:
            raise ValidationError(f"Accounting Period Control: Cannot reverse in current period: {reason}")

        # Reverse treasury movements
        reverse_treasury_entries_for_voucher(voucher, reversal_reason=reversal_reason, user=user)

        # Update Voucher
        voucher.status = VoucherStatus.REVERSED
        voucher.reversed_by = user
        voucher.reversed_at = now
        voucher.reversal_reason = reversal_reason
        voucher.save(update_fields=['status', 'reversed_by', 'reversed_at', 'reversal_reason', 'updated_at'])

        logger.info("Reversed FinancialVoucher %s: %s", voucher.voucher_number, reversal_reason)
        return voucher

    @classmethod
    @transaction.atomic
    def cancel_draft_voucher(cls, voucher: FinancialVoucher, user=None) -> FinancialVoucher:
        """
        Safely cancels an unposted DRAFT or PENDING_APPROVAL voucher without ledger impacts.
        """
        if voucher.status not in [VoucherStatus.DRAFT, VoucherStatus.PENDING_APPROVAL]:
            raise ValidationError(f"Cannot cancel voucher with status '{voucher.status}'. Only drafts can be cancelled.")

        voucher.status = VoucherStatus.CANCELLED
        voucher.save(update_fields=['status', 'updated_at'])
        logger.info("Cancelled draft voucher %s", voucher.voucher_number)
        return voucher

    @classmethod
    @transaction.atomic
    def create_contra_transfer(
        cls,
        company,
        from_account: BankAccount,
        to_account: BankAccount,
        amount: Decimal,
        date: date,
        reference: str = "",
        description: str = "",
        user=None,
        auto_post: bool = True,
    ) -> FinancialVoucher:
        """
        Creates an atomic two-sided Contra Transfer between two Treasury Accounts.
        """
        if from_account.company_id != company.id or to_account.company_id != company.id:
            raise ValidationError("Both accounts in a contra transfer must belong to the same company.")
        if from_account.id == to_account.id:
            raise ValidationError("Source and destination accounts must be different.")
        
        amt = Decimal(str(amount)).quantize(Decimal('0.0001'))
        if amt <= Decimal('0.0000'):
            raise ValidationError("Contra transfer amount must be greater than zero.")

        desc = description or f"Contra transfer from {from_account.account_title} to {to_account.account_title}"

        voucher = cls.create_financial_voucher(
            company=company,
            voucher_type=VoucherType.CONTRA_VOUCHER,
            date=date,
            amount=amt,
            bank_account=from_account,
            destination_bank_account=to_account,
            payment_account=from_account.chart_of_account,
            payment_method=PaymentMethod.BANK_TRANSFER,
            reference=reference,
            description=desc,
            counterparty_name=to_account.account_title,
            user=user,
            source_module="finance",
            source_document_type="CONTRA_TRANSFER",
            auto_post=auto_post,
        )

        return voucher

    @classmethod
    @transaction.atomic
    def create_voucher_from_client_receipt(cls, client_receipt, user=None, auto_post: bool = True) -> FinancialVoucher:
        """
        Converts/links a Phase S-4C ClientReceipt to a Financial Receipt Voucher.
        Idempotent: prevents duplicate voucher creation.
        """
        company = client_receipt.company
        existing = FinancialVoucher.objects.filter(
            company=company,
            source_document_type="CLIENT_RECEIPT",
            source_document_id=client_receipt.id,
            is_deleted=False
        ).exclude(status=VoucherStatus.CANCELLED).first()

        if existing:
            return existing

        # Resolve bank account
        bank_acc = client_receipt.bank_account
        if not bank_acc:
            sec_cfg = SecurityFinanceConfiguration.objects.filter(company=company, is_active=True).first()
            if sec_cfg:
                bank_acc = sec_cfg.default_bank_account

        # Determine voucher type & payment method mapping
        pm = str(client_receipt.payment_method).upper()
        if pm in ['CASH', PaymentMethod.CASH]:
            v_type = VoucherType.CASH_RECEIPT
            fin_pm = PaymentMethod.CASH
        else:
            v_type = VoucherType.BANK_RECEIPT
            if pm in ['CHEQUE', PaymentMethod.CHEQUE]:
                fin_pm = PaymentMethod.CHEQUE
            elif pm in ['ONLINE', 'ONLINE_TRANSFER', PaymentMethod.ONLINE_TRANSFER]:
                fin_pm = PaymentMethod.ONLINE_TRANSFER
            else:
                fin_pm = PaymentMethod.BANK_TRANSFER

        # Resolve AR account
        sec_cfg = SecurityFinanceConfiguration.objects.filter(company=company, is_active=True).first()
        ar_account = sec_cfg.accounts_receivable_account if sec_cfg else None

        lines_data = []
        if ar_account:
            lines_data.append({
                'account': ar_account,
                'amount': client_receipt.amount,
                'description': f"Client Receipt {client_receipt.receipt_number} settlement",
            })

        voucher = cls.create_financial_voucher(
            company=company,
            voucher_type=v_type,
            date=client_receipt.receipt_date,
            amount=client_receipt.amount,
            bank_account=bank_acc,
            payment_account=bank_acc.chart_of_account if bank_acc else None,
            payment_method=fin_pm,
            reference=client_receipt.reference_number or client_receipt.receipt_number,
            description=f"Auto-generated voucher for Client Receipt {client_receipt.receipt_number}: {client_receipt.notes}".strip(),
            counterparty_name=client_receipt.client.name if client_receipt.client else "",
            customer=client_receipt.client,
            currency=client_receipt.currency,
            lines_data=lines_data,
            user=user,
            source_module="billing",
            source_document_type="CLIENT_RECEIPT",
            source_document_id=client_receipt.id,
            auto_post=auto_post,
        )

        return voucher

    @classmethod
    @transaction.atomic
    def create_voucher_from_vendor_payment(cls, vendor_payment, user=None, auto_post: bool = True) -> FinancialVoucher:
        """
        Converts/links a Phase S-3E VendorPayment to a Financial Payment Voucher.
        Idempotent: prevents duplicate voucher creation.
        """
        company = vendor_payment.company
        existing = FinancialVoucher.objects.filter(
            company=company,
            source_document_type="VENDOR_PAYMENT",
            source_document_id=vendor_payment.id,
            is_deleted=False
        ).exclude(status=VoucherStatus.CANCELLED).first()

        if existing:
            return existing

        # Resolve treasury bank account
        sec_cfg = SecurityFinanceConfiguration.objects.filter(company=company, is_active=True).first()
        bank_acc = getattr(sec_cfg, 'default_bank_account', None)
        if not bank_acc:
            bank_acc = BankAccount.objects.filter(company=company, is_active=True, account_type=BankAccountType.BANK).first()
        if not bank_acc:
            bank_acc = BankAccount.objects.filter(company=company, is_active=True).first()

        # Determine voucher type & payment method mapping
        pm = str(vendor_payment.payment_method).upper()
        if pm in ['CASH', PaymentMethod.CASH]:
            v_type = VoucherType.CASH_PAYMENT
            fin_pm = PaymentMethod.CASH
        else:
            v_type = VoucherType.BANK_PAYMENT
            if pm in ['CHEQUE', PaymentMethod.CHEQUE]:
                fin_pm = PaymentMethod.CHEQUE
            elif pm in ['ONLINE', 'ONLINE_TRANSFER', PaymentMethod.ONLINE_TRANSFER]:
                fin_pm = PaymentMethod.ONLINE_TRANSFER
            else:
                fin_pm = PaymentMethod.BANK_TRANSFER

        # Resolve AP account
        sec_cfg = SecurityFinanceConfiguration.objects.filter(company=company, is_active=True).first()
        ap_account = sec_cfg.accounts_payable_account if sec_cfg else vendor_payment.account

        lines_data = []
        if ap_account:
            lines_data.append({
                'account': ap_account,
                'amount': vendor_payment.amount,
                'description': f"Vendor Payment {vendor_payment.payment_number} settlement",
            })

        voucher = cls.create_financial_voucher(
            company=company,
            voucher_type=v_type,
            date=vendor_payment.payment_date,
            amount=vendor_payment.amount,
            bank_account=bank_acc,
            payment_account=vendor_payment.account or (bank_acc.chart_of_account if bank_acc else None),
            payment_method=fin_pm,
            reference=vendor_payment.reference_number or vendor_payment.payment_number,
            description=f"Auto-generated voucher for Vendor Payment {vendor_payment.payment_number}: {vendor_payment.notes}".strip(),
            counterparty_name=vendor_payment.vendor.name if vendor_payment.vendor else "",
            customer=getattr(vendor_payment.vendor, 'crm_entity', None) if vendor_payment.vendor else None,
            lines_data=lines_data,
            user=user,
            source_module="purchasing",
            source_document_type="VENDOR_PAYMENT",
            source_document_id=vendor_payment.id,
            auto_post=auto_post,
        )

        return voucher


# Convenience module-level wrappers
create_financial_voucher = VoucherService.create_financial_voucher
submit_voucher_for_approval = VoucherService.submit_voucher_for_approval
approve_voucher = VoucherService.approve_voucher
post_financial_voucher = VoucherService.post_financial_voucher
reverse_financial_voucher = VoucherService.reverse_financial_voucher
cancel_draft_voucher = VoucherService.cancel_draft_voucher
create_contra_transfer = VoucherService.create_contra_transfer
create_voucher_from_client_receipt = VoucherService.create_voucher_from_client_receipt
create_voucher_from_vendor_payment = VoucherService.create_voucher_from_vendor_payment
