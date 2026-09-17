"""
billing/services/client_receipt_service.py
------------------------------------------
Handles creation, invoice allocation, posting, and atomic reversal of Client Receipts.
Ensures strict multi-tenant isolation, over-allocation prevention, and immutable AR ledger balance.
"""
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError
from billing.models import (
    ClientReceipt,
    ClientReceiptAllocation,
    ClientInvoice,
    ClientInvoiceStatus,
    ReceiptStatus,
    PaymentMethod,
    RecoveryStatus,
)


class ClientReceiptService:
    """
    Authoritative service for client receipt management and invoice settlement.
    """

    @classmethod
    def create_client_receipt(
        cls,
        company,
        client,
        receipt_date,
        amount,
        payment_method=PaymentMethod.BANK_TRANSFER,
        currency=None,
        exchange_rate=Decimal('1.000000'),
        bank_account=None,
        reference_number='',
        cheque_number='',
        cheque_date=None,
        drawn_bank='',
        notes='',
        received_by=None
    ) -> ClientReceipt:
        """
        Creates a new draft client receipt.
        """
        amount = Decimal(str(amount))
        if amount <= Decimal('0.00'):
            raise ValidationError({'amount': 'Receipt amount must be strictly greater than zero.'})

        if str(client.company_id) != str(company.id):
            raise ValidationError({'client': 'Client must belong to the active company.'})

        if bank_account and str(bank_account.company_id) != str(company.id):
            raise ValidationError({'bank_account': 'Bank account must belong to the active company.'})

        if currency and str(currency.company_id) != str(company.id):
            raise ValidationError({'currency': 'Currency must belong to the active company.'})

        receipt = ClientReceipt.objects.create(
            company=company,
            client=client,
            receipt_date=receipt_date or timezone.now().date(),
            amount=amount,
            currency=currency,
            exchange_rate=exchange_rate,
            payment_method=payment_method,
            bank_account=bank_account,
            reference_number=reference_number,
            cheque_number=cheque_number,
            cheque_date=cheque_date,
            drawn_bank=drawn_bank,
            notes=notes,
            received_by=received_by,
            status=ReceiptStatus.DRAFT
        )
        return receipt

    @classmethod
    def allocate_receipt_to_invoices(
        cls,
        receipt: ClientReceipt,
        allocations_data: list,
        user=None
    ):
        """
        Allocates receipt amount across one or more client invoices.
        allocations_data: list of dicts with keys: {'invoice_id': ..., 'amount': ..., 'notes': ...}
        """
        if receipt.status != ReceiptStatus.DRAFT:
            raise ValidationError('Allocations can only be modified while the receipt is in DRAFT status.')

        total_to_allocate = Decimal('0.00')

        with transaction.atomic():
            # Delete existing draft allocations for this receipt
            receipt.allocations.filter(is_deleted=False).delete()

            for item in allocations_data:
                inv_id = item.get('invoice_id')
                alloc_amount = Decimal(str(item.get('amount', '0.00')))
                notes = item.get('notes', '')

                if alloc_amount <= Decimal('0.00'):
                    continue

                invoice = ClientInvoice.objects.select_for_update().get(id=inv_id, company=receipt.company)

                if str(invoice.client_id) != str(receipt.client_id):
                    raise ValidationError(f"Invoice {invoice.invoice_number} does not belong to client {receipt.client.name}.")

                # Verify invoice is eligible for payment (not cancelled, credited, or already fully paid)
                if invoice.status in [ClientInvoiceStatus.CANCELLED, ClientInvoiceStatus.CREDITED]:
                    raise ValidationError(f"Invoice {invoice.invoice_number} is {invoice.status} and cannot receive payments.")

                # Calculate current outstanding balance of the invoice (taking into account other POSTED receipts)
                posted_allocs_total = invoice.receipt_allocations.filter(
                    is_deleted=False,
                    receipt__status=ReceiptStatus.POSTED,
                    receipt__is_deleted=False
                ).aggregate(total=models_sum())['total'] or Decimal('0.00')

                current_outstanding = max(Decimal('0.00'), invoice.grand_total - posted_allocs_total)

                if alloc_amount > current_outstanding:
                    raise ValidationError(
                        f"Allocated amount PKR {alloc_amount} exceeds invoice {invoice.invoice_number} outstanding balance of PKR {current_outstanding}."
                    )

                total_to_allocate += alloc_amount

                ClientReceiptAllocation.objects.create(
                    company=receipt.company,
                    receipt=receipt,
                    invoice=invoice,
                    allocated_amount=alloc_amount,
                    notes=notes
                )

            if total_to_allocate > receipt.amount:
                raise ValidationError(
                    f"Total allocations PKR {total_to_allocate} exceed total receipt amount PKR {receipt.amount}."
                )

        return receipt

    @classmethod
    def post_client_receipt(cls, receipt: ClientReceipt, user=None) -> ClientReceipt:
        """
        Posts the client receipt, transitioning DRAFT -> POSTED and updating invoice paid balances and statuses.
        """
        if receipt.status != ReceiptStatus.DRAFT:
            raise ValidationError(f"Only DRAFT receipts can be posted. Current status: {receipt.status}.")

        with transaction.atomic():
            locked_receipt = ClientReceipt.objects.select_for_update().get(id=receipt.id)

            allocations = locked_receipt.allocations.filter(is_deleted=False).select_related('invoice')
            total_allocated = Decimal('0.00')

            # Pre-validate all allocations against current invoice balances
            for alloc in allocations:
                invoice = ClientInvoice.objects.select_for_update().get(id=alloc.invoice_id)
                # Calculate currently posted receipts on this invoice (excluding this draft receipt)
                other_posted = invoice.receipt_allocations.filter(
                    is_deleted=False,
                    receipt__status=ReceiptStatus.POSTED,
                    receipt__is_deleted=False
                ).exclude(receipt_id=locked_receipt.id).aggregate(total=models_sum())['total'] or Decimal('0.00')

                remaining_outstanding = max(Decimal('0.00'), invoice.grand_total - other_posted)

                if alloc.allocated_amount > remaining_outstanding:
                    raise ValidationError(
                        f"Cannot post receipt: Allocation of PKR {alloc.allocated_amount} exceeds invoice {invoice.invoice_number} outstanding balance of PKR {remaining_outstanding}."
                    )

                total_allocated += alloc.allocated_amount

            if total_allocated > locked_receipt.amount:
                raise ValidationError(
                    f"Cannot post receipt: Total allocated amount PKR {total_allocated} exceeds receipt amount PKR {locked_receipt.amount}."
                )

            # Mark receipt as POSTED
            now = timezone.now()
            locked_receipt.status = ReceiptStatus.POSTED
            locked_receipt.posted_at = now
            locked_receipt.posted_by = user
            locked_receipt.save(update_fields=['status', 'posted_at', 'posted_by', 'updated_at'])

            # Update all allocated invoices
            for alloc in allocations:
                cls._refresh_invoice_payment_status(alloc.invoice)

        receipt.refresh_from_db()
        return receipt

    @classmethod
    def reverse_client_receipt(cls, receipt: ClientReceipt, user, reason: str) -> ClientReceipt:
        """
        Atomically reverses a posted client receipt, restoring invoice outstanding balances.
        """
        if receipt.status != ReceiptStatus.POSTED:
            raise ValidationError(f"Only POSTED receipts can be reversed. Current status: {receipt.status}.")

        if not reason or not reason.strip():
            raise ValidationError({'reason': 'A valid reversal reason is required to reverse a posted receipt.'})

        with transaction.atomic():
            locked_receipt = ClientReceipt.objects.select_for_update().get(id=receipt.id)

            allocations = list(locked_receipt.allocations.filter(is_deleted=False).select_related('invoice'))

            now = timezone.now()
            locked_receipt.status = ReceiptStatus.REVERSED
            locked_receipt.reversed_at = now
            locked_receipt.reversed_by = user
            locked_receipt.reversal_reason = reason.strip()
            locked_receipt.save(update_fields=['status', 'reversed_at', 'reversed_by', 'reversal_reason', 'updated_at'])

            # Refresh all affected invoices
            for alloc in allocations:
                cls._refresh_invoice_payment_status(alloc.invoice)

        receipt.refresh_from_db()
        return receipt

    @classmethod
    def cancel_draft_receipt(cls, receipt: ClientReceipt, user=None):
        """
        Cancels and removes a draft receipt and its draft allocations.
        """
        if receipt.status != ReceiptStatus.DRAFT:
            raise ValidationError(f"Only DRAFT receipts can be cancelled. Current status: {receipt.status}.")

        with transaction.atomic():
            receipt.allocations.filter(is_deleted=False).delete()
            receipt.is_deleted = True
            receipt.save(update_fields=['is_deleted', 'updated_at'])

    @classmethod
    def _refresh_invoice_payment_status(cls, invoice: ClientInvoice):
        """
        Recomputes invoice paid_amount and updates status based strictly on active POSTED allocations.
        """
        invoice.refresh_from_db()
        posted_total = invoice.receipt_allocations.filter(
            is_deleted=False,
            receipt__status=ReceiptStatus.POSTED,
            receipt__is_deleted=False
        ).aggregate(total=models_sum())['total'] or Decimal('0.00')

        invoice.paid_amount = posted_total
        grand_total = invoice.grand_total or Decimal('0.00')

        if posted_total >= grand_total and grand_total > Decimal('0.00'):
            invoice.status = ClientInvoiceStatus.PAID
            invoice.recovery_status = RecoveryStatus.RECOVERED
        elif posted_total > Decimal('0.00'):
            invoice.status = ClientInvoiceStatus.PARTIALLY_PAID
            if invoice.recovery_status in [RecoveryStatus.NOT_DUE, RecoveryStatus.DUE]:
                invoice.recovery_status = RecoveryStatus.PARTIALLY_RECOVERED
        else:
            # Reverted to unpaid
            if invoice.status in [ClientInvoiceStatus.PAID, ClientInvoiceStatus.PARTIALLY_PAID]:
                invoice.status = ClientInvoiceStatus.SENT if invoice.sent_at else ClientInvoiceStatus.ISSUED
            if invoice.recovery_status in [RecoveryStatus.RECOVERED, RecoveryStatus.PARTIALLY_RECOVERED]:
                invoice.recovery_status = RecoveryStatus.DUE if invoice.is_overdue else RecoveryStatus.NOT_DUE

        invoice.save(update_fields=['paid_amount', 'status', 'recovery_status', 'updated_at'])


def models_sum():
    from django.db.models import Sum
    return Sum('allocated_amount')
