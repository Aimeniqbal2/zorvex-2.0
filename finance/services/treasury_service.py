"""
finance/services/treasury_service.py

Treasury Ledger & Bank/Cash Management Service for Phase S-4D.
Handles:
1. Controlled opening balance initialization and locking.
2. Operational treasury movements (Money In, Money Out, Transfers).
3. Atomic transaction reversals.
4. Account chronological statement ledger with running balances.
5. Executive treasury dashboard metrics.
"""
import logging
from decimal import Decimal
from datetime import date, datetime
from typing import Dict, Any, List, Optional
from django.db import transaction
from django.db.models import Sum, Q, Count
from django.utils import timezone
from django.core.exceptions import ValidationError

from finance.models import (
    BankAccount,
    BankAccountType,
    FinancialVoucher,
    TreasuryTransaction,
    TreasuryTransactionType,
    Cheque,
    ChequeStatus,
    VoucherStatus,
    VoucherType,
)

logger = logging.getLogger(__name__)


class TreasuryService:
    """
    Authoritative service for managing Treasury Accounts, Cash & Bank movements,
    and Operational Running Balances.
    """

    @classmethod
    @transaction.atomic
    def initialize_opening_balance(
        cls,
        bank_account: BankAccount,
        amount: Decimal,
        opening_date: Optional[date] = None,
        reference: str = "",
        user=None,
    ) -> TreasuryTransaction:
        """
        Initializes an operational opening balance for a BankAccount.
        Prevents modifications once operational non-opening transactions exist.
        """
        if bank_account.is_opening_balance_locked:
            raise ValidationError(
                f"Opening balance for '{bank_account.account_title}' is locked and cannot be modified."
            )

        # Check if non-opening transactions already exist
        has_operational_tx = bank_account.treasury_transactions.filter(
            is_deleted=False
        ).exclude(transaction_type=TreasuryTransactionType.OPENING_BALANCE).exists()

        if has_operational_tx:
            raise ValidationError(
                f"Cannot initialize opening balance for '{bank_account.account_title}' because operational transactions already exist."
            )

        amt = Decimal(str(amount)).quantize(Decimal('0.0001'))
        op_date = opening_date or timezone.now().date()

        # Update or create the OPENING_BALANCE TreasuryTransaction
        existing_op_tx = bank_account.treasury_transactions.filter(
            transaction_type=TreasuryTransactionType.OPENING_BALANCE,
            is_deleted=False
        ).first()

        money_in = amt if amt >= Decimal('0.0000') else Decimal('0.0000')
        money_out = abs(amt) if amt < Decimal('0.0000') else Decimal('0.0000')

        if existing_op_tx:
            existing_op_tx.transaction_date = op_date
            existing_op_tx.money_in = money_in
            existing_op_tx.money_out = money_out
            existing_op_tx.running_balance = amt
            existing_op_tx.reference = reference or "Opening Balance Init"
            existing_op_tx.description = f"Operational opening balance initialized by {user.email if user else 'System'}"
            existing_op_tx.save()
            tx = existing_op_tx
        else:
            tx = TreasuryTransaction.objects.create(
                company=bank_account.company,
                bank_account=bank_account,
                transaction_date=op_date,
                transaction_type=TreasuryTransactionType.OPENING_BALANCE,
                reference=reference or "Opening Balance Init",
                description=f"Operational opening balance initialized by {user.email if user else 'System'}",
                money_in=money_in,
                money_out=money_out,
                running_balance=amt,
                status='POSTED',
                created_by=user,
            )

        # Update BankAccount
        bank_account.opening_balance = amt
        bank_account.current_balance = amt
        bank_account.opening_balance_date = op_date
        bank_account.opening_balance_reference = reference
        bank_account.opening_balance_set_by = user
        bank_account.is_opening_balance_locked = True
        bank_account.save(update_fields=[
            'opening_balance', 'current_balance', 'opening_balance_date',
            'opening_balance_reference', 'opening_balance_set_by',
            'is_opening_balance_locked', 'updated_at'
        ])

        logger.info("Initialized opening balance of %s for %s", amt, bank_account.account_title)
        return tx

    @classmethod
    @transaction.atomic
    def record_treasury_movement(
        cls,
        bank_account: BankAccount,
        voucher: Optional[FinancialVoucher] = None,
        transaction_type: str = TreasuryTransactionType.MONEY_IN,
        money_in: Decimal = Decimal('0.0000'),
        money_out: Decimal = Decimal('0.0000'),
        reference: str = "",
        description: str = "",
        transaction_date: Optional[date] = None,
        user=None,
        is_reversal: bool = False,
    ) -> TreasuryTransaction:
        """
        Records a movement in the Treasury Ledger and recalculates the account's operational balance.
        """
        in_amt = Decimal(str(money_in or '0.0000')).quantize(Decimal('0.0001'))
        out_amt = Decimal(str(money_out or '0.0000')).quantize(Decimal('0.0001'))
        tx_date = transaction_date or (voucher.date if voucher else timezone.now().date())

        # Select account with lock for concurrency protection
        account = BankAccount.objects.select_for_update().get(id=bank_account.id)

        new_balance = account.current_balance + in_amt - out_amt
        account.current_balance = new_balance
        account.save(update_fields=['current_balance', 'updated_at'])

        tx = TreasuryTransaction.objects.create(
            company=account.company,
            bank_account=account,
            voucher=voucher,
            transaction_date=tx_date,
            transaction_type=transaction_type,
            reference=reference or (voucher.voucher_number if voucher else ""),
            description=description or (voucher.description if voucher else ""),
            money_in=in_amt,
            money_out=out_amt,
            running_balance=new_balance,
            status='POSTED',
            is_reversal=is_reversal,
            created_by=user,
        )

        logger.info(
            "Treasury movement for %s: +%s / -%s -> New Bal: %s (Tx: %s)",
            account.account_title, in_amt, out_amt, new_balance, tx.id
        )
        return tx

    @classmethod
    @transaction.atomic
    def reverse_treasury_entries_for_voucher(
        cls,
        voucher: FinancialVoucher,
        reversal_reason: str = "",
        user=None,
    ) -> List[TreasuryTransaction]:
        """
        Rolls back all active treasury entries associated with a voucher atomically.
        """
        orig_entries = TreasuryTransaction.objects.filter(
            voucher=voucher,
            is_deleted=False,
            is_reversal=False,
            status='POSTED'
        ).select_related('bank_account')

        reversal_entries = []
        now = timezone.now()

        for entry in orig_entries:
            account = BankAccount.objects.select_for_update().get(id=entry.bank_account_id)
            
            # Inverse amounts
            rev_in = entry.money_out
            rev_out = entry.money_in
            new_balance = account.current_balance + rev_in - rev_out
            account.current_balance = new_balance
            account.save(update_fields=['current_balance', 'updated_at'])

            rev_tx = TreasuryTransaction.objects.create(
                company=account.company,
                bank_account=account,
                voucher=voucher,
                transaction_date=now.date(),
                transaction_type=entry.transaction_type,
                reference=f"REV-{entry.reference}",
                description=f"Reversal of {entry.reference}: {reversal_reason}".strip(),
                money_in=rev_in,
                money_out=rev_out,
                running_balance=new_balance,
                status='POSTED',
                is_reversal=True,
                created_by=user,
            )
            reversal_entries.append(rev_tx)

            # Mark original as reversed
            entry.status = 'REVERSED'
            entry.reversed_at = now
            entry.reversed_by = user
            entry.save(update_fields=['status', 'reversed_at', 'reversed_by', 'updated_at'])

        logger.info("Reversed %d treasury entries for voucher %s", len(reversal_entries), voucher.voucher_number)
        return reversal_entries

    @classmethod
    def get_account_statement_ledger(
        cls,
        bank_account: BankAccount,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> Dict[str, Any]:
        """
        Generates a chronological statement ledger with running balances for a Treasury Account.
        """
        qs = TreasuryTransaction.objects.filter(
            bank_account=bank_account,
            is_deleted=False,
        ).order_by('transaction_date', 'created_at')

        # Opening balance calculation prior to start_date
        opening_balance = Decimal('0.0000')
        if start_date:
            prior_agg = qs.filter(transaction_date__lt=start_date).aggregate(
                total_in=Sum('money_in'),
                total_out=Sum('money_out')
            )
            t_in = prior_agg['total_in'] or Decimal('0.0000')
            t_out = prior_agg['total_out'] or Decimal('0.0000')
            opening_balance = t_in - t_out
            qs = qs.filter(transaction_date__gte=start_date)

        if end_date:
            qs = qs.filter(transaction_date__lte=end_date)

        transactions_list = []
        running = opening_balance
        period_money_in = Decimal('0.0000')
        period_money_out = Decimal('0.0000')

        for tx in qs.select_related('voucher'):
            running = running + tx.money_in - tx.money_out
            period_money_in += tx.money_in
            period_money_out += tx.money_out

            transactions_list.append({
                'id': str(tx.id),
                'date': tx.transaction_date.isoformat(),
                'transaction_type': tx.transaction_type,
                'transaction_type_display': tx.get_transaction_type_display(),
                'reference': tx.reference,
                'description': tx.description,
                'money_in': float(tx.money_in),
                'money_out': float(tx.money_out),
                'running_balance': float(running),
                'status': tx.status,
                'is_reversal': tx.is_reversal,
                'voucher_id': str(tx.voucher_id) if tx.voucher_id else None,
                'voucher_number': tx.voucher.voucher_number if tx.voucher else None,
                'voucher_type': tx.voucher.voucher_type if tx.voucher else None,
            })

        return {
            'bank_account': {
                'id': str(bank_account.id),
                'account_title': bank_account.account_title,
                'account_type': bank_account.account_type,
                'account_type_display': bank_account.get_account_type_display(),
                'account_number': bank_account.account_number,
                'bank_name': bank_account.bank_name,
                'current_balance': float(bank_account.current_balance),
                'currency': bank_account.currency.code if bank_account.currency else 'PKR',
            },
            'start_date': start_date.isoformat() if start_date else None,
            'end_date': end_date.isoformat() if end_date else None,
            'opening_balance': float(opening_balance),
            'closing_balance': float(running),
            'period_money_in': float(period_money_in),
            'period_money_out': float(period_money_out),
            'transactions': transactions_list,
            'total_transactions': len(transactions_list),
        }

    @classmethod
    def get_treasury_dashboard_metrics(cls, company) -> Dict[str, Any]:
        """
        Computes executive cash, bank, voucher, and cheque KPIs for the treasury dashboard.
        """
        now = timezone.now().date()
        first_of_month = date(now.year, now.month, 1)

        # 1. Accounts Summary & Liquidity by Type
        accounts_qs = BankAccount.objects.filter(company=company, is_deleted=False, is_active=True)
        
        bank_total = Decimal('0.00')
        cash_total = Decimal('0.00')
        petty_cash_total = Decimal('0.00')
        wallet_total = Decimal('0.00')

        accounts_data = []
        for acc in accounts_qs:
            bal = acc.current_balance or Decimal('0.00')
            if acc.account_type == BankAccountType.BANK:
                bank_total += bal
            elif acc.account_type == BankAccountType.CASH:
                cash_total += bal
            elif acc.account_type == BankAccountType.PETTY_CASH:
                petty_cash_total += bal
            elif acc.account_type == BankAccountType.WALLET:
                wallet_total += bal

            accounts_data.append({
                'id': str(acc.id),
                'account_title': acc.account_title,
                'account_type': acc.account_type,
                'account_type_display': acc.get_account_type_display(),
                'bank_name': acc.bank_name,
                'account_number': acc.account_number,
                'current_balance': float(bal),
                'currency': acc.currency.code if acc.currency else 'PKR',
                'is_opening_balance_locked': acc.is_opening_balance_locked,
            })

        total_liquidity = bank_total + cash_total + petty_cash_total + wallet_total

        # 2. Monthly Movements (POSTED Vouchers)
        vouchers_month = FinancialVoucher.objects.filter(
            company=company,
            is_deleted=False,
            status=VoucherStatus.POSTED,
            date__gte=first_of_month,
            date__lte=now
        )

        receipt_types = [
            VoucherType.RECEIPT_VOUCHER, VoucherType.RECEIPT,
            VoucherType.BANK_RECEIPT, VoucherType.CASH_RECEIPT
        ]
        payment_types = [
            VoucherType.PAYMENT_VOUCHER, VoucherType.PAYMENT,
            VoucherType.BANK_PAYMENT, VoucherType.CASH_PAYMENT,
            VoucherType.PETTY_CASH_VOUCHER
        ]
        contra_types = [
            VoucherType.CONTRA_VOUCHER, VoucherType.CONTRA
        ]

        receipts_amt = vouchers_month.filter(voucher_type__in=receipt_types).aggregate(t=Sum('amount'))['t'] or Decimal('0.00')
        payments_amt = vouchers_month.filter(voucher_type__in=payment_types).aggregate(t=Sum('amount'))['t'] or Decimal('0.00')
        contra_amt = vouchers_month.filter(voucher_type__in=contra_types).aggregate(t=Sum('amount'))['t'] or Decimal('0.00')

        # 3. Cheque KPIs
        uncleared_statuses = [ChequeStatus.ISSUED, ChequeStatus.RECEIVED, ChequeStatus.DEPOSITED]
        uncleared_cheques_qs = Cheque.objects.filter(
            company=company,
            is_deleted=False,
            status__in=uncleared_statuses
        )
        uncleared_cheques_count = uncleared_cheques_qs.count()
        uncleared_cheques_amount = uncleared_cheques_qs.aggregate(t=Sum('amount'))['t'] or Decimal('0.00')

        # 4. Recent Treasury Transactions
        recent_txs = TreasuryTransaction.objects.filter(
            company=company,
            is_deleted=False
        ).select_related('bank_account', 'voucher').order_by('-transaction_date', '-created_at')[:10]

        recent_tx_data = []
        for tx in recent_txs:
            recent_tx_data.append({
                'id': str(tx.id),
                'date': tx.transaction_date.isoformat(),
                'account_title': tx.bank_account.account_title,
                'transaction_type': tx.transaction_type,
                'transaction_type_display': tx.get_transaction_type_display(),
                'reference': tx.reference,
                'description': tx.description,
                'money_in': float(tx.money_in),
                'money_out': float(tx.money_out),
                'running_balance': float(tx.running_balance),
                'status': tx.status,
                'voucher_number': tx.voucher.voucher_number if tx.voucher else None,
            })

        return {
            'total_liquidity': float(total_liquidity),
            'bank_total': float(bank_total),
            'cash_total': float(cash_total),
            'petty_cash_total': float(petty_cash_total),
            'wallet_total': float(wallet_total),
            'period_receipts_amount': float(receipts_amt),
            'period_payments_amount': float(payments_amt),
            'period_transfers_amount': float(contra_amt),
            'uncleared_cheques_count': uncleared_cheques_count,
            'uncleared_cheques_amount': float(uncleared_cheques_amount),
            'accounts': accounts_data,
            'recent_transactions': recent_tx_data,
        }


# Convenience Module-level wrappers
initialize_opening_balance = TreasuryService.initialize_opening_balance
record_treasury_movement = TreasuryService.record_treasury_movement
reverse_treasury_entries_for_voucher = TreasuryService.reverse_treasury_entries_for_voucher
get_account_statement_ledger = TreasuryService.get_account_statement_ledger
get_treasury_dashboard_metrics = TreasuryService.get_treasury_dashboard_metrics
