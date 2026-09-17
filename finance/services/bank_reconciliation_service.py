import hashlib
from decimal import Decimal
from datetime import date, timedelta
from django.utils import timezone
from django.db import transaction
from django.db.models import Q, Sum
from django.core.exceptions import ValidationError
from finance.models import (
    BankAccount, BankStatement, BankStatementLine, MatchStatus,
    ReconciliationStatus, TreasuryTransaction, FinancialVoucher, Cheque,
    JournalEntry, ChartOfAccount, CostCenter, JournalType
)

class BankReconciliationService:
    """
    Authoritative Bank Statement Import & Matching Reconciliation Engine for Zorvex ERP 2.0.
    """

    @classmethod
    @transaction.atomic
    def import_bank_statement(
        cls,
        company,
        bank_account: BankAccount,
        lines_data: list,
        statement_number: str = None,
        start_date: date = None,
        end_date: date = None,
        opening_balance: Decimal = Decimal('0.0000'),
        closing_balance: Decimal = Decimal('0.0000'),
        file_hash: str = None
    ) -> BankStatement:
        if bank_account.company_id != company.id:
            raise ValidationError("Bank account must belong to the specified company.")

        if not lines_data:
            raise ValidationError("Cannot import an empty bank statement.")

        # Compute import hash for duplicate detection if not provided
        if not file_hash:
            hash_input = f"{bank_account.id}_{statement_number}_{start_date}_{end_date}_{len(lines_data)}"
            for l in lines_data[:5]:
                hash_input += f"_{l.get('date')}_{l.get('debit', 0)}_{l.get('credit', 0)}"
            file_hash = hashlib.sha256(hash_input.encode('utf-8')).hexdigest()

        # Idempotency check: Reject duplicate imports
        if BankStatement.objects.filter(company=company, file_import_hash=file_hash).exists():
            raise ValidationError("Duplicate bank statement import blocked. This file or statement has already been imported.")

        if not statement_number:
            statement_number = f"STMT-{timezone.now().strftime('%Y%m%d%H%M%S')}"

        if not start_date or not end_date:
            dates = [l.get('date') for l in lines_data if l.get('date')]
            if dates:
                start_date = min(dates)
                end_date = max(dates)
            else:
                start_date = date.today()
                end_date = date.today()

        statement = BankStatement.objects.create(
            company=company,
            bank_account=bank_account,
            statement_number=statement_number,
            start_date=start_date,
            end_date=end_date,
            opening_balance=opening_balance,
            closing_balance=closing_balance,
            file_import_hash=file_hash,
            status=ReconciliationStatus.DRAFT
        )

        for item in lines_data:
            st_date = item.get('date') or item.get('statement_date') or start_date
            dr = Decimal(str(item.get('debit') or item.get('withdrawal') or 0))
            cr = Decimal(str(item.get('credit') or item.get('deposit') or 0))
            ext_id = item.get('external_transaction_id') or item.get('id') or ''
            ref = item.get('reference') or item.get('bank_reference') or ''
            desc = item.get('description') or item.get('narration') or ''
            run_bal = Decimal(str(item['running_balance'])) if item.get('running_balance') is not None else None

            BankStatementLine.objects.create(
                company=company,
                statement=statement,
                statement_date=st_date,
                transaction_date=st_date,
                bank_reference=str(ref)[:100],
                external_transaction_id=str(ext_id)[:100],
                description=str(desc),
                debit=dr,
                credit=cr,
                running_balance=run_bal,
                match_status=MatchStatus.UNMATCHED
            )

        return statement

    @classmethod
    @transaction.atomic
    def auto_match_statement(cls, statement: BankStatement) -> dict:
        if statement.status == ReconciliationStatus.CLOSED:
            raise ValidationError("Cannot auto match lines on a CLOSED bank statement.")

        company = statement.company
        bank_account = statement.bank_account
        lines = statement.lines.filter(match_status=MatchStatus.UNMATCHED)

        auto_matched_count = 0

        for line in lines:
            line_amount = line.credit if line.credit > 0 else line.debit
            is_credit = line.credit > 0  # Money IN to bank

            min_date = line.statement_date - timedelta(days=5)
            max_date = line.statement_date + timedelta(days=5)

            # Match criteria 1: TreasuryTransaction
            tt_query = TreasuryTransaction.objects.filter(
                company=company,
                bank_account=bank_account,
                transaction_date__gte=min_date,
                transaction_date__lte=max_date,
                matched_statement_lines__isnull=True
            )

            if is_credit:
                tt_match = tt_query.filter(transaction_type='MONEY_IN', amount=line_amount).first()
            else:
                tt_match = tt_query.filter(transaction_type='MONEY_OUT', amount=line_amount).first()

            if tt_match:
                line.match_status = MatchStatus.AUTO_MATCHED
                line.matched_treasury_transaction = tt_match
                line.match_method = 'AUTO_AMOUNT_DATE_REF'
                line.matched_at = timezone.now()
                line.save()
                auto_matched_count += 1
                continue

            # Match criteria 2: Cheque by Cheque Number
            if line.bank_reference:
                cheque_match = Cheque.objects.filter(
                    company=company,
                    bank_account=bank_account,
                    cheque_number__icontains=line.bank_reference.strip(),
                    matched_statement_lines__isnull=True
                ).first()

                if cheque_match:
                    line.match_status = MatchStatus.AUTO_MATCHED
                    line.matched_cheque = cheque_match
                    line.match_method = 'AUTO_CHEQUE_REF'
                    line.matched_at = timezone.now()
                    line.save()
                    auto_matched_count += 1
                    continue

        if statement.status == ReconciliationStatus.DRAFT:
            statement.status = ReconciliationStatus.IN_PROGRESS
            statement.save()

        return {
            'statement_id': statement.id,
            'auto_matched_count': auto_matched_count,
            'remaining_unmatched': statement.lines.filter(match_status=MatchStatus.UNMATCHED).count()
        }

    @classmethod
    @transaction.atomic
    def manual_match_line(
        cls,
        line: BankStatementLine,
        treasury_transaction_id: str = None,
        voucher_id: str = None,
        cheque_id: str = None,
        user=None,
        reason: str = ''
    ) -> BankStatementLine:
        if line.bank_statement.status == ReconciliationStatus.CLOSED:
            raise ValidationError("Cannot modify matches on a CLOSED bank statement.")

        if treasury_transaction_id:
            tt = TreasuryTransaction.objects.get(id=treasury_transaction_id, company=line.company)
            line.matched_treasury_transaction = tt
        if voucher_id:
            fv = FinancialVoucher.objects.get(id=voucher_id, company=line.company)
            line.matched_financial_voucher = fv
        if cheque_id:
            chq = Cheque.objects.get(id=cheque_id, company=line.company)
            line.matched_cheque = chq

        line.match_status = MatchStatus.MANUALLY_MATCHED
        line.match_method = 'MANUAL'
        line.matched_by = user
        line.matched_at = timezone.now()
        line.match_reason = reason
        line.save()

        return line

    @classmethod
    @transaction.atomic
    def unmatch_line(cls, line: BankStatementLine, user=None, reason: str = '') -> BankStatementLine:
        if line.bank_statement.status == ReconciliationStatus.CLOSED:
            raise ValidationError("Cannot unmatch lines on a CLOSED bank statement.")

        line.match_status = MatchStatus.UNMATCHED
        line.matched_treasury_transaction = None
        line.matched_financial_voucher = None
        line.matched_cheque = None
        line.matched_by = None
        line.matched_at = None
        line.match_method = ''
        line.match_reason = ''
        line.ignore_reason = reason
        line.save()

        return line

    @classmethod
    @transaction.atomic
    def create_bank_charge_adjustment(
        cls,
        line: BankStatementLine,
        expense_account: ChartOfAccount,
        cost_center: CostCenter = None,
        user=None,
        notes: str = ''
    ) -> BankStatementLine:
        if line.statement.status == ReconciliationStatus.CLOSED:
            raise ValidationError("Cannot create adjustment on a CLOSED bank statement.")

        company = line.company
        bank_account = line.statement.bank_account
        bank_gl_account = bank_account.gl_account

        if not bank_gl_account:
            raise ValidationError("Bank account does not have a linked GL Asset account.")

        is_expense = line.debit > 0
        amount = line.debit if is_expense else line.credit

        je_lines = []
        if is_expense:
            # Bank Charge / Outflow: Dr Expense, Cr Bank
            je_lines = [
                {
                    'account': expense_account,
                    'debit': amount,
                    'credit': Decimal('0.0000'),
                    'cost_center_id': cost_center.id if cost_center else None,
                    'description': f"Bank Charge: {line.description}"
                },
                {
                    'account': bank_gl_account,
                    'debit': Decimal('0.0000'),
                    'credit': amount,
                    'description': f"Bank Charge Outflow: {line.description}"
                }
            ]
        else:
            # Interest / Inflow: Dr Bank, Cr Interest Revenue
            je_lines = [
                {
                    'account': bank_gl_account,
                    'debit': amount,
                    'credit': Decimal('0.0000'),
                    'description': f"Bank Direct Deposit: {line.description}"
                },
                {
                    'account': expense_account,
                    'debit': Decimal('0.0000'),
                    'credit': amount,
                    'cost_center_id': cost_center.id if cost_center else None,
                    'description': f"Bank Direct Credit: {line.description}"
                }
            ]

        from finance.services.posting_service import AccountingPostingService
        journal = AccountingPostingService.get_or_create_journal(company, JournalType.BANK)

        je = AccountingPostingService.post_journal_entry(
            company=company,
            journal=journal,
            posting_date=line.statement_date or date.today(),
            description=f"Bank Statement Adjustment: {line.description}",
            lines=je_lines,
            source_type='BANK_CHARGE',
            source_id=str(line.id),
            source_number=line.bank_reference or 'BANK_ADJ',
            posting_event='BANK_ADJUSTMENT',
            user=user,
            is_manual=False
        )

        line.adjustment_journal = je
        line.match_status = MatchStatus.MANUALLY_MATCHED
        line.match_method = 'BANK_CHARGE_ADJUSTMENT'
        line.matched_by = user
        line.matched_at = timezone.now()
        line.match_reason = notes or "Created bank charge adjustment journal"
        line.save()

        return line

    @classmethod
    def get_reconciliation_summary(cls, statement: BankStatement) -> dict:
        company = statement.company
        bank_account = statement.bank_account

        lines = statement.lines.all()
        matched_lines = lines.filter(match_status__in=[MatchStatus.AUTO_MATCHED, MatchStatus.MANUALLY_MATCHED])

        matched_debit = matched_lines.aggregate(s=Sum('debit'))['s'] or Decimal('0.0000')
        matched_credit = matched_lines.aggregate(s=Sum('credit'))['s'] or Decimal('0.0000')
        matched_amount = matched_credit - matched_debit

        unmatched_stmt_dr = lines.filter(match_status=MatchStatus.UNMATCHED).aggregate(s=Sum('debit'))['s'] or Decimal('0.0000')
        unmatched_stmt_cr = lines.filter(match_status=MatchStatus.UNMATCHED).aggregate(s=Sum('credit'))['s'] or Decimal('0.0000')
        unmatched_statement_amount = unmatched_stmt_cr - unmatched_stmt_dr

        # System GL balance for bank account
        system_gl_balance = bank_account.current_balance

        variance = (statement.closing_balance - statement.opening_balance) - (matched_amount + unmatched_statement_amount)

        return {
            'statement_id': statement.id,
            'statement_number': statement.statement_number,
            'bank_account_name': bank_account.account_name,
            'opening_balance': statement.opening_balance,
            'closing_balance': statement.closing_balance,
            'system_gl_balance': system_gl_balance,
            'matched_amount': matched_amount,
            'unmatched_statement_amount': unmatched_statement_amount,
            'difference': variance,
            'status': statement.status,
            'is_fully_reconciled': variance == Decimal('0.0000') and not lines.filter(match_status=MatchStatus.UNMATCHED).exists()
        }

    @classmethod
    @transaction.atomic
    def close_bank_reconciliation(cls, statement: BankStatement, user=None) -> BankStatement:
        unmatched = statement.lines.filter(match_status=MatchStatus.UNMATCHED).exists()
        if unmatched:
            raise ValidationError("Cannot close bank reconciliation. Unmatched statement lines exist.")

        statement.status = ReconciliationStatus.CLOSED
        statement.closed_by = user
        statement.closed_at = timezone.now()
        statement.save()

        return statement
