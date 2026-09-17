"""
finance/services/posting_service.py
Zorvex ERP 2.0 — Phase S-4I: General Ledger, Double-Entry Posting, Journals & Trial Balance

Central authoritative double-entry accounting engine.
All automated and manual financial postings MUST pass through AccountingPostingService.
"""

from decimal import Decimal
from datetime import date, datetime
from typing import Optional, List, Dict, Any, Tuple
from django.db import transaction
from django.db.models import Sum, Q, F
from django.utils import timezone
from django.core.exceptions import ValidationError

from companies.models import Company
from accounts.models import User
from finance.models import (
    ChartOfAccount, AccountType, NormalBalance, Currency, ExchangeRate,
    FiscalYear, AccountingPeriod, PeriodStatus,
    CostCenter, ProfitCenter, BankAccount,
    Journal, JournalType, JournalEntry, JournalEntryLine, JournalStatus, JournalSourceType,
    SecurityFinanceConfiguration
)
from finance.services.period_service import can_post_transaction


class AccountingPostingService:
    """
    Authoritative double-entry GL posting engine.
    Guarantees:
    - Atomicity & Thread-Safety
    - Decimal Precision (SUM(Debit) == SUM(Credit))
    - Period Locks & Fiscal Guardrails
    - Multi-Tenant Isolation
    - Source Idempotency
    - Immutable Journal Entries & Audit Trails
    """

    @classmethod
    def get_or_create_journal(cls, company: Company, journal_type: str) -> Journal:
        """
        Retrieves or provisions the designated system Journal for a given journal type.
        """
        code_map = {
            JournalType.GENERAL: ('GEN', 'General Journal'),
            JournalType.SALES: ('SALES', 'Sales & Billing Journal'),
            JournalType.RECEIPTS: ('RCPT', 'Cash & Bank Receipts Journal'),
            JournalType.PURCHASE: ('PURCH', 'Purchases & Vendor Bills Journal'),
            JournalType.PAYMENTS: ('PYMT', 'Vendor & Other Payments Journal'),
            JournalType.PAYROLL: ('PAYROLL', 'Payroll & Salaries Journal'),
            JournalType.TAX: ('TAX', 'Tax & Statutory Filings Journal'),
            JournalType.EXPENSE: ('EXP', 'Expenses & Claims Journal'),
            JournalType.CASH: ('CASH', 'Cash Transactions Journal'),
            JournalType.BANK: ('BANK', 'Bank Transactions Journal'),
            JournalType.CONTRA: ('CONTRA', 'Treasury Contra Transfers Journal'),
            JournalType.ADJUSTMENT: ('ADJ', 'Audited Accounting Adjustments Journal'),
            JournalType.OPENING_BALANCE: ('OPEN', 'Opening Balances Journal'),
        }
        code, name = code_map.get(journal_type, ('GEN', 'General Journal'))

        journal, _ = Journal.objects.get_or_create(
            company=company,
            code=code,
            defaults={
                'name': name,
                'journal_type': journal_type,
                'is_active': True
            }
        )
        return journal

    @classmethod
    def _validate_control_account_policy(
        cls,
        company: Company,
        account: ChartOfAccount,
        is_manual: bool,
        allow_control_account_override: bool = False
    ):
        """
        Guards control accounts (AR, AP, Payroll Payable, Tax Payable) from unauthorized direct manual entries.
        """
        if is_manual and not allow_control_account_override:
            # Check if account is a control account
            if account.is_control_account or account.is_system_controlled or account.account_code in ['1200', '2100', '2200', '2300']:
                raise ValidationError(
                    f"Direct manual posting to control account '{account.account_code} - {account.account_name}' "
                    f"is restricted. Use dedicated subledgers (Billing, Purchasing, Payroll, Tax) or request elevated authorization."
                )

    # -------------------------------------------------------------------------
    # CORE POSTING ENGINE
    # -------------------------------------------------------------------------

    @classmethod
    @transaction.atomic
    def post_journal_entry(
        cls,
        company: Company,
        journal: Journal,
        posting_date: date,
        lines: List[Dict[str, Any]],
        source_type: str = JournalSourceType.MANUAL_JOURNAL,
        source_id: str = '',
        source_number: str = '',
        reference: str = '',
        description: str = '',
        document_date: Optional[date] = None,
        currency: Optional[Currency] = None,
        exchange_rate: Decimal = Decimal('1.000000'),
        is_manual: bool = False,
        posting_event: str = 'ORIGINAL',
        allow_control_account_override: bool = False,
        is_adjustment: bool = False,
        user=None
    ) -> JournalEntry:
        """
        Authoritative entry point for creating and posting double-entry journal entries.
        """
        # 1. Tenant validation
        if journal.company_id != company.id:
            raise ValidationError("Journal does not belong to the active company.")

        # 2. Idempotency Check
        if source_type and source_id:
            existing = JournalEntry.objects.filter(
                company=company,
                source_type=source_type,
                source_id=str(source_id),
                posting_event=posting_event,
                status=JournalStatus.POSTED
            ).first()
            if existing:
                return existing

        # 3. Accounting Period Check
        if not posting_date:
            posting_date = timezone.now().date()
        if not document_date:
            document_date = posting_date

        if posting_event != 'FY_CLOSE' and source_type != 'YEAR_END_CLOSE':
            can_post, period_msg, period = can_post_transaction(
                company=company,
                transaction_date=posting_date,
                is_adjustment=is_adjustment
            )
            if not can_post:
                raise ValidationError(f"Cannot post journal entry: {period_msg}")

        # 4. Lines Validation & Balancing Check
        if not lines or len(lines) < 2:
            raise ValidationError("A balanced journal entry requires at least 2 lines (Debit and Credit).")

        total_debit = Decimal('0.0000')
        total_credit = Decimal('0.0000')
        account_ids = set()

        for line_idx, line in enumerate(lines, start=1):
            account = line.get('account')
            if not account:
                raise ValidationError(f"Line {line_idx}: Account is mandatory.")
            if account.company_id != company.id:
                raise ValidationError(f"Line {line_idx}: Account '{account.account_code}' belongs to a different company.")
            if not account.is_active:
                raise ValidationError(f"Line {line_idx}: Account '{account.account_code}' is inactive.")
            if account.is_header:
                raise ValidationError(f"Line {line_idx}: Cannot post directly to header account '{account.account_code}'.")
            if not account.allow_posting:
                raise ValidationError(f"Line {line_idx}: Account '{account.account_code}' is configured to disallow direct postings.")

            # Validate control account guardrails
            cls._validate_control_account_policy(
                company=company,
                account=account,
                is_manual=is_manual,
                allow_control_account_override=allow_control_account_override
            )

            debit = Decimal(str(line.get('debit') or '0.0000')).quantize(Decimal('0.0001'))
            credit = Decimal(str(line.get('credit') or '0.0000')).quantize(Decimal('0.0001'))

            if debit < Decimal('0.0000') or credit < Decimal('0.0000'):
                raise ValidationError(f"Line {line_idx}: Negative amounts are not allowed on debits/credits.")
            if debit == Decimal('0.0000') and credit == Decimal('0.0000'):
                raise ValidationError(f"Line {line_idx}: Either debit or credit must be positive.")
            if debit > Decimal('0.0000') and credit > Decimal('0.0000'):
                raise ValidationError(f"Line {line_idx}: Line cannot have both debit and credit.")

            # Validate dimensions tenant
            for dim_name in ['cost_center', 'profit_center', 'crm_entity', 'contract', 'site', 'vendor', 'employee']:
                dim_obj = line.get(dim_name)
                if dim_obj and hasattr(dim_obj, 'company_id') and dim_obj.company_id != company.id:
                    raise ValidationError(f"Line {line_idx}: Dimension '{dim_name}' belongs to a different tenant.")

            total_debit += debit
            total_credit += credit
            account_ids.add(account.id)

        # 5. Invariant Balancing Verification
        total_debit = total_debit.quantize(Decimal('0.0001'))
        total_credit = total_credit.quantize(Decimal('0.0001'))

        if total_debit == Decimal('0.0000') and total_credit == Decimal('0.0000'):
            raise ValidationError("Empty journal entries cannot be posted.")
        if total_debit != total_credit:
            raise ValidationError(
                f"Double-entry balance mismatch: Total Debits (PKR {total_debit:,.2f}) "
                f"do not equal Total Credits (PKR {total_credit:,.2f}). Difference: PKR {abs(total_debit - total_credit):,.2f}."
            )

        # 6. Atomically Lock Accounts to prevent race conditions
        sorted_account_ids = sorted(list(account_ids))
        locked_accounts = {
            acc.id: acc
            for acc in ChartOfAccount.objects.select_for_update().filter(id__in=sorted_account_ids)
        }

        # 7. Create JournalEntry Record
        entry = JournalEntry.objects.create(
            company=company,
            journal=journal,
            entry_date=posting_date,
            posting_date=posting_date,
            document_date=document_date,
            reference=reference,
            description=description,
            source_type=source_type,
            source_id=str(source_id) if source_id else '',
            source_number=source_number,
            posting_event=posting_event,
            currency=currency,
            exchange_rate=exchange_rate,
            is_manual=is_manual,
            status=JournalStatus.DRAFT,
            created_by=user,
            approved_by=user,
            approved_at=timezone.now(),
        )

        # 8. Create JournalEntryLines & Update Account Balances
        for line in lines:
            account = locked_accounts[line['account'].id]
            debit = Decimal(str(line.get('debit') or '0.0000')).quantize(Decimal('0.0001'))
            credit = Decimal(str(line.get('credit') or '0.0000')).quantize(Decimal('0.0001'))
            xr = Decimal(str(line.get('exchange_rate') or exchange_rate or '1.000000'))
            base_amt = ((debit - credit) * xr).quantize(Decimal('0.0001'))

            JournalEntryLine.objects.create(
                company=company,
                journal_entry=entry,
                account=account,
                debit=debit,
                credit=credit,
                currency=line.get('currency') or currency,
                exchange_rate=xr,
                base_amount=base_amt,
                description=line.get('description') or description or '',
                cost_center=line.get('cost_center'),
                profit_center=line.get('profit_center'),
                crm_entity=line.get('crm_entity'),
                contract=line.get('contract'),
                site=line.get('site'),
                vendor=line.get('vendor'),
                employee=line.get('employee'),
                source_line_reference=line.get('source_line_reference', ''),
            )

            # Update Running GL Account Balance respecting normal balance
            # Asset & Expense increase with Debits, decrease with Credits
            # Liability, Equity & Revenue increase with Credits, decrease with Debits
            if account.normal_balance == NormalBalance.DEBIT or account.account_type in [AccountType.ASSET, AccountType.EXPENSE, AccountType.COST_OF_SERVICE]:
                account.current_balance += (debit - credit)
            else:
                account.current_balance += (credit - debit)

        # 9. Save Updated Account Balances
        for acc in locked_accounts.values():
            acc.save(update_fields=['current_balance'])

        # 10. Mark Entry as POSTED
        entry.status = JournalStatus.POSTED
        entry.posted_by = user
        entry.posted_at = timezone.now()
        entry.save(update_fields=['status', 'posted_by', 'posted_at'])

        return entry

    # -------------------------------------------------------------------------
    # REVERSAL ENGINE
    # -------------------------------------------------------------------------

    @classmethod
    @transaction.atomic
    def reverse_journal_entry(
        cls,
        journal_entry: JournalEntry,
        reason: str,
        reversal_date: Optional[date] = None,
        user=None
    ) -> JournalEntry:
        """
        Creates an immutable, atomic reversal journal entry swapping debits and credits.
        Preserves original journal entry unchanged.
        """
        if journal_entry.status != JournalStatus.POSTED:
            raise ValidationError(f"Cannot reverse journal entry with status '{journal_entry.status}'. Only POSTED entries can be reversed.")
        if journal_entry.status == JournalStatus.REVERSED:
            raise ValidationError("Journal entry is already reversed.")
        if not reason:
            raise ValidationError("A clear audit reason is required to reverse a journal entry.")

        company = journal_entry.company
        if not reversal_date:
            reversal_date = timezone.now().date()

        # Check Accounting Period for reversal date
        can_post, period_msg, _ = can_post_transaction(company, reversal_date, is_adjustment=True)
        if not can_post:
            raise ValidationError(f"Cannot post reversal in closed/locked period: {period_msg}")

        # Swap lines
        reversal_lines = []
        for line in journal_entry.lines.filter(is_deleted=False):
            reversal_lines.append({
                'account': line.account,
                'debit': line.credit,  # Swapped
                'credit': line.debit,  # Swapped
                'description': f"Reversal: {line.description or journal_entry.description}",
                'cost_center': line.cost_center,
                'profit_center': line.profit_center,
                'crm_entity': line.crm_entity,
                'contract': line.contract,
                'site': line.site,
                'vendor': line.vendor,
                'employee': line.employee,
                'currency': line.currency,
                'exchange_rate': line.exchange_rate,
                'source_line_reference': f"REV-LINE-{line.id}",
            })

        # Post Reversal Journal
        reversal_entry = cls.post_journal_entry(
            company=company,
            journal=journal_entry.journal,
            posting_date=reversal_date,
            document_date=journal_entry.document_date or reversal_date,
            lines=reversal_lines,
            source_type=journal_entry.source_type,
            source_id=journal_entry.source_id,
            source_number=journal_entry.source_number,
            reference=f"REV-{journal_entry.entry_number}",
            description=f"Reversal of {journal_entry.entry_number}: {reason}",
            currency=journal_entry.currency,
            exchange_rate=journal_entry.exchange_rate,
            is_manual=journal_entry.is_manual,
            posting_event=f"REVERSAL-{timezone.now().strftime('%Y%m%d%H%M%S')}",
            allow_control_account_override=True,  # Reversal mirrors original
            is_adjustment=True,
            user=user
        )

        reversal_entry.reversal_of = journal_entry
        reversal_entry.save(update_fields=['reversal_of'])

        # Mark original journal entry as REVERSED
        journal_entry.status = JournalStatus.REVERSED
        journal_entry.reversed_by = user
        journal_entry.reversed_at = timezone.now()
        journal_entry.reversal_reason = reason
        journal_entry.save(update_fields=['status', 'reversed_by', 'reversed_at', 'reversal_reason'])

        return reversal_entry

    # -------------------------------------------------------------------------
    # SOURCE INTEGRATIONS
    # -------------------------------------------------------------------------

    @classmethod
    @transaction.atomic
    def post_client_invoice(cls, invoice, user=None) -> JournalEntry:
        """
        S-4B Client Billing → GL Double-Entry Posting:
        Dr Accounts Receivable (1200) [Client, Contract, Site, Profit Center]
        Cr Security Service / OT / Extra Duty Revenue (4100/4200/4300) [per line]
        Cr Output Tax Payable (2300) [if tax > 0]
        """
        company = invoice.company
        config = SecurityFinanceConfiguration.objects.filter(company=company, is_active=True).first()

        ar_acc = (config.accounts_receivable_account if config and config.accounts_receivable_account else
                  ChartOfAccount.objects.filter(company=company, account_code='1200', is_active=True).first())
        tax_acc = (config.tax_payable_account if config and config.tax_payable_account else
                   ChartOfAccount.objects.filter(company=company, account_code='2300', is_active=True).first())
        rev_default = (config.security_service_revenue_account if config and config.security_service_revenue_account else
                       ChartOfAccount.objects.filter(company=company, account_code='4100', is_active=True).first())

        if not ar_acc:
            raise ValidationError("Accounts Receivable control account (1200) is not configured.")
        if not rev_default:
            raise ValidationError("Security Service Revenue account (4100) is not configured.")

        # Resolve CRM Entity and Contract
        client_entity = getattr(invoice, 'client', None)
        contract = getattr(invoice, 'contract', None)
        posting_date = invoice.invoice_date or timezone.now().date()

        lines = []

        # 1. Debit Accounts Receivable for total gross invoice
        lines.append({
            'account': ar_acc,
            'debit': invoice.grand_total if hasattr(invoice, 'grand_total') else invoice.total_amount,
            'credit': Decimal('0.0000'),
            'description': f"Client Invoice {invoice.invoice_number} - {getattr(client_entity, 'name', 'Client AR')}",
            'crm_entity': client_entity,
            'contract': contract,
            'profit_center': getattr(contract, 'profit_center', None) if contract else None,
            'source_line_reference': 'AR_TOTAL'
        })

        # 2. Credit Revenue Lines per line mapping
        inv_lines = invoice.lines.filter(is_deleted=False) if hasattr(invoice, 'lines') else []
        if inv_lines.exists():
            for l in inv_lines:
                # Select revenue account based on line_type
                line_acc = rev_default
                l_type = getattr(l, 'line_type', 'SERVICE_FEE')
                if l_type == 'OVERTIME' and config and config.overtime_revenue_account:
                    line_acc = config.overtime_revenue_account
                elif l_type == 'EXTRA_DUTY' and config and config.extra_duty_revenue_account:
                    line_acc = config.extra_duty_revenue_account
                else:
                    ot_acc = ChartOfAccount.objects.filter(company=company, account_code='4200', is_active=True).first()
                    ed_acc = ChartOfAccount.objects.filter(company=company, account_code='4300', is_active=True).first()
                    if l_type == 'OVERTIME' and ot_acc:
                        line_acc = ot_acc
                    elif l_type == 'EXTRA_DUTY' and ed_acc:
                        line_acc = ed_acc

                line_subtotal = getattr(l, 'line_subtotal', Decimal('0.0000'))
                lines.append({
                    'account': line_acc,
                    'debit': Decimal('0.0000'),
                    'credit': line_subtotal,
                    'description': f"{l.description} ({getattr(l, 'designation_name', '')})",
                    'crm_entity': client_entity,
                    'contract': contract,
                    'site': getattr(l, 'site', None),
                    'profit_center': getattr(contract, 'profit_center', None) if contract else None,
                    'source_line_reference': f"LINE_{l.id}"
                })
        else:
            # Fallback single revenue line
            subtotal = getattr(invoice, 'subtotal', invoice.total_amount)
            lines.append({
                'account': rev_default,
                'debit': Decimal('0.0000'),
                'credit': subtotal,
                'description': f"Revenue - {invoice.invoice_number}",
                'crm_entity': client_entity,
                'contract': contract,
                'profit_center': getattr(contract, 'profit_center', None) if contract else None,
                'source_line_reference': 'REV_SUBTOTAL'
            })

        # 3. Credit Output Tax Payable
        tax_amt = getattr(invoice, 'tax_amount', Decimal('0.0000'))
        if tax_amt > Decimal('0.0000'):
            if not tax_acc:
                raise ValidationError("Tax Payable control account (2300) is required for taxable invoices.")
            lines.append({
                'account': tax_acc,
                'debit': Decimal('0.0000'),
                'credit': tax_amt,
                'description': f"Output Sales Tax on Invoice {invoice.invoice_number}",
                'crm_entity': client_entity,
                'contract': contract,
                'source_line_reference': 'OUTPUT_TAX'
            })

        journal = cls.get_or_create_journal(company, JournalType.SALES)

        return cls.post_journal_entry(
            company=company,
            journal=journal,
            posting_date=posting_date,
            document_date=invoice.invoice_date or posting_date,
            lines=lines,
            source_type=JournalSourceType.CLIENT_INVOICE,
            source_id=str(invoice.id),
            source_number=invoice.invoice_number,
            reference=invoice.invoice_number,
            description=f"Billing Recognition: {invoice.invoice_number} ({getattr(client_entity, 'name', '')})",
            user=user
        )

    @classmethod
    @transaction.atomic
    def post_client_receipt(cls, receipt, user=None) -> JournalEntry:
        """
        S-4C Client Receipts → GL Double-Entry Posting:
        Dr Bank / Cash Account (1120) [Net Received]
        Dr Withholding Tax Receivable (1400) [if WHT deducted]
        Cr Accounts Receivable (1200) [Gross Settled Amount]
        """
        company = receipt.company
        config = SecurityFinanceConfiguration.objects.filter(company=company, is_active=True).first()

        ar_acc = (config.accounts_receivable_account if config and config.accounts_receivable_account else
                  ChartOfAccount.objects.filter(company=company, account_code='1200', is_active=True).first())
        wht_rec_acc = ChartOfAccount.objects.filter(company=company, account_code='1400', is_active=True).first()

        bank_acc = getattr(receipt, 'bank_account', None)
        treasury_gl = getattr(bank_acc, 'chart_of_account', None)
        if not treasury_gl:
            treasury_gl = ChartOfAccount.objects.filter(company=company, account_code='1120', is_active=True).first()

        if not ar_acc:
            raise ValidationError("Accounts Receivable control account (1200) is required.")
        if not treasury_gl:
            raise ValidationError("Treasury GL account (1120) is required.")

        client_entity = getattr(receipt, 'client', None)
        posting_date = getattr(receipt, 'receipt_date', None) or timezone.now().date()
        received_amt = Decimal(str(getattr(receipt, 'amount', '0.0000'))).quantize(Decimal('0.0001'))
        wht_amt = Decimal(str(getattr(receipt, 'withheld_amount', getattr(receipt, 'withholding_amount', '0.0000')))).quantize(Decimal('0.0001'))
        gross_settled = received_amt + wht_amt

        lines = [
            {
                'account': treasury_gl,
                'debit': received_amt,
                'credit': Decimal('0.0000'),
                'description': f"Funds Received: {receipt.receipt_number or receipt.reference}",
                'crm_entity': client_entity,
                'source_line_reference': 'BANK_RECEIPT'
            }
        ]

        if wht_amt > Decimal('0.0000'):
            if not wht_rec_acc:
                raise ValidationError("Withholding Tax Receivable account (1400) is required for WHT receipts.")
            lines.append({
                'account': wht_rec_acc,
                'debit': wht_amt,
                'credit': Decimal('0.0000'),
                'description': f"Client Tax Deduction WHT: {receipt.receipt_number}",
                'crm_entity': client_entity,
                'source_line_reference': 'WHT_RECEIVABLE'
            })

        lines.append({
            'account': ar_acc,
            'debit': Decimal('0.0000'),
            'credit': gross_settled,
            'description': f"AR Settlement: {getattr(client_entity, 'name', 'Client')}",
            'crm_entity': client_entity,
            'source_line_reference': 'AR_SETTLEMENT'
        })

        journal = cls.get_or_create_journal(company, JournalType.RECEIPTS)

        return cls.post_journal_entry(
            company=company,
            journal=journal,
            posting_date=posting_date,
            document_date=posting_date,
            lines=lines,
            source_type=JournalSourceType.CLIENT_RECEIPT,
            source_id=str(receipt.id),
            source_number=getattr(receipt, 'receipt_number', str(receipt.id)),
            reference=getattr(receipt, 'reference', getattr(receipt, 'receipt_number', '')),
            description=f"Client Collection: {getattr(receipt, 'receipt_number', '')} ({getattr(client_entity, 'name', '')})",
            user=user
        )

    @classmethod
    @transaction.atomic
    def post_vendor_bill(cls, vendor_bill, user=None) -> JournalEntry:
        """
        S-4F Purchasing Accounting Integration → GL Double-Entry Posting:
        Dr Inventory Asset (1500) / Expense Accounts per line classification
        Dr Recoverable Input Tax (1400) [if tax > 0]
        Cr Accounts Payable (2100) [Vendor]
        """
        company = vendor_bill.company
        config = SecurityFinanceConfiguration.objects.filter(company=company, is_active=True).first()

        ap_acc = (config.accounts_payable_account if config and config.accounts_payable_account else
                  ChartOfAccount.objects.filter(company=company, account_code='2100', is_active=True).first())
        input_tax_acc = ChartOfAccount.objects.filter(company=company, account_code='1400', is_active=True).first()
        exp_default = ChartOfAccount.objects.filter(company=company, account_code='5300', is_active=True).first()

        if not ap_acc:
            raise ValidationError("Accounts Payable control account (2100) is required.")

        vendor = getattr(vendor_bill, 'vendor', None)
        posting_date = getattr(vendor_bill, 'bill_date', None) or timezone.now().date()
        total_bill = Decimal(str(getattr(vendor_bill, 'total_amount', '0.0000'))).quantize(Decimal('0.0001'))
        tax_amt = Decimal(str(getattr(vendor_bill, 'tax_amount', '0.0000'))).quantize(Decimal('0.0001'))
        subtotal = total_bill - tax_amt

        lines = []

        # 1. Debit lines from Purchasing Integration or lines
        bill_lines = vendor_bill.lines.filter(is_deleted=False) if hasattr(vendor_bill, 'lines') else []
        if bill_lines.exists():
            for l in bill_lines:
                # Check line classification
                line_acc = getattr(l, 'expense_account', None) or exp_default
                if not line_acc:
                    line_acc = ChartOfAccount.objects.filter(company=company, account_code='1500', is_active=True).first() or ap_acc

                line_subtotal = Decimal(str(getattr(l, 'line_subtotal', getattr(l, 'total_amount', '0.0000')))).quantize(Decimal('0.0001'))
                lines.append({
                    'account': line_acc,
                    'debit': line_subtotal,
                    'credit': Decimal('0.0000'),
                    'description': f"{getattr(l, 'description', 'Purchasing Item')} - {getattr(vendor, 'name', '')}",
                    'vendor': vendor,
                    'cost_center': getattr(l, 'cost_center', None),
                    'site': getattr(l, 'site', None),
                    'source_line_reference': f"BILL_LINE_{l.id}"
                })
        else:
            lines.append({
                'account': exp_default or ap_acc,
                'debit': subtotal,
                'credit': Decimal('0.0000'),
                'description': f"Vendor Bill: {getattr(vendor_bill, 'bill_number', 'Purchasing')}",
                'vendor': vendor,
                'source_line_reference': 'BILL_SUBTOTAL'
            })

        # 2. Debit Input Tax Recoverable
        if tax_amt > Decimal('0.0000'):
            if not input_tax_acc:
                raise ValidationError("Input Tax Recoverable account (1400) is required.")
            lines.append({
                'account': input_tax_acc,
                'debit': tax_amt,
                'credit': Decimal('0.0000'),
                'description': f"Recoverable Input VAT on Bill {getattr(vendor_bill, 'bill_number', '')}",
                'vendor': vendor,
                'source_line_reference': 'INPUT_TAX'
            })

        # 3. Credit Accounts Payable
        lines.append({
            'account': ap_acc,
            'debit': Decimal('0.0000'),
            'credit': total_bill,
            'description': f"AP Recognition: {getattr(vendor, 'name', 'Vendor')}",
            'vendor': vendor,
            'source_line_reference': 'AP_TOTAL'
        })

        journal = cls.get_or_create_journal(company, JournalType.PURCHASE)

        entry = cls.post_journal_entry(
            company=company,
            journal=journal,
            posting_date=posting_date,
            document_date=posting_date,
            lines=lines,
            source_type=JournalSourceType.VENDOR_BILL,
            source_id=str(vendor_bill.id),
            source_number=getattr(vendor_bill, 'bill_number', str(vendor_bill.id)),
            reference=getattr(vendor_bill, 'bill_number', ''),
            description=f"Vendor Bill Recognition: {getattr(vendor_bill, 'bill_number', '')} ({getattr(vendor, 'name', '')})",
            user=user
        )

        # Mark PurchasingAccountingIntegration if present
        from finance.models import PurchasingAccountingIntegration, PurchasingAccountingStatus
        PurchasingAccountingIntegration.objects.filter(
            company=company,
            source_id=str(vendor_bill.id)
        ).update(status=PurchasingAccountingStatus.READY)

        return entry

    @classmethod
    @transaction.atomic
    def post_vendor_payment(cls, vendor_payment, user=None) -> JournalEntry:
        """
        S-4F Vendor Payment → GL Double-Entry Posting:
        Dr Accounts Payable (2100) [Vendor]
        Cr Treasury Bank / Cash GL (1120)
        """
        company = vendor_payment.company
        config = SecurityFinanceConfiguration.objects.filter(company=company, is_active=True).first()

        ap_acc = (config.accounts_payable_account if config and config.accounts_payable_account else
                  ChartOfAccount.objects.filter(company=company, account_code='2100', is_active=True).first())

        bank_acc = getattr(vendor_payment, 'bank_account', None)
        treasury_gl = getattr(bank_acc, 'chart_of_account', None) or ChartOfAccount.objects.filter(company=company, account_code='1120', is_active=True).first()

        if not ap_acc:
            raise ValidationError("Accounts Payable control account (2100) is required.")
        if not treasury_gl:
            raise ValidationError("Treasury GL account (1120) is required.")

        vendor = getattr(vendor_payment, 'vendor', None)
        posting_date = getattr(vendor_payment, 'payment_date', None) or timezone.now().date()
        amt = Decimal(str(getattr(vendor_payment, 'amount', '0.0000'))).quantize(Decimal('0.0001'))

        lines = [
            {
                'account': ap_acc,
                'debit': amt,
                'credit': Decimal('0.0000'),
                'description': f"Vendor Settlement: {getattr(vendor, 'name', 'Vendor')}",
                'vendor': vendor,
                'source_line_reference': 'AP_PAYMENT'
            },
            {
                'account': treasury_gl,
                'debit': Decimal('0.0000'),
                'credit': amt,
                'description': f"Bank Payment to {getattr(vendor, 'name', 'Vendor')}",
                'vendor': vendor,
                'source_line_reference': 'BANK_DISBURSEMENT'
            }
        ]

        journal = cls.get_or_create_journal(company, JournalType.PAYMENTS)

        return cls.post_journal_entry(
            company=company,
            journal=journal,
            posting_date=posting_date,
            document_date=posting_date,
            lines=lines,
            source_type=JournalSourceType.VENDOR_PAYMENT,
            source_id=str(vendor_payment.id),
            source_number=getattr(vendor_payment, 'payment_number', str(vendor_payment.id)),
            reference=getattr(vendor_payment, 'payment_number', ''),
            description=f"Vendor Payment: {getattr(vendor_payment, 'payment_number', '')} ({getattr(vendor, 'name', '')})",
            user=user
        )

    @classmethod
    @transaction.atomic
    def post_expense(cls, expense, user=None) -> JournalEntry:
        """
        S-4E Expense Management → GL Double-Entry Posting:
        Dr Expense Account (e.g. 5300/6200/6300) [Cost Center, Site, Contract]
        Dr Input Tax Recoverable (1400) [if tax > 0]
        Cr Treasury Bank / Cash GL (1120)
        """
        company = expense.company
        exp_acc = getattr(expense, 'expense_account', None) or ChartOfAccount.objects.filter(company=company, account_code='6300', is_active=True).first()
        input_tax_acc = ChartOfAccount.objects.filter(company=company, account_code='1400', is_active=True).first()

        bank_acc = getattr(expense, 'bank_account', None)
        treasury_gl = getattr(bank_acc, 'chart_of_account', None) or ChartOfAccount.objects.filter(company=company, account_code='1120', is_active=True).first()

        if not exp_acc:
            raise ValidationError("Expense Chart of Account is required.")
        if not treasury_gl:
            raise ValidationError("Treasury Bank/Cash GL account (1120) is required.")

        posting_date = getattr(expense, 'expense_date', None) or timezone.now().date()
        base_exp = Decimal(str(getattr(expense, 'amount', '0.0000'))).quantize(Decimal('0.0001'))
        tax_amt = Decimal(str(getattr(expense, 'tax_amount', '0.0000'))).quantize(Decimal('0.0001'))
        total_amt = Decimal(str(getattr(expense, 'total_amount', base_exp + tax_amt))).quantize(Decimal('0.0001'))

        lines = [
            {
                'account': exp_acc,
                'debit': base_exp,
                'credit': Decimal('0.0000'),
                'description': f"{expense.title} - {expense.description or getattr(expense, 'payee', '')}",
                'cost_center': getattr(expense, 'cost_center', None),
                'profit_center': getattr(expense, 'profit_center', None),
                'crm_entity': getattr(expense, 'client', None),
                'contract': getattr(expense, 'contract', None),
                'site': getattr(expense, 'site', None),
                'employee': getattr(expense, 'employee', None),
                'vendor': getattr(expense, 'vendor', None),
                'source_line_reference': 'EXP_BASE'
            }
        ]

        if tax_amt > Decimal('0.0000'):
            if not input_tax_acc:
                raise ValidationError("Input Tax Recoverable account (1400) is required for expense tax.")
            lines.append({
                'account': input_tax_acc,
                'debit': tax_amt,
                'credit': Decimal('0.0000'),
                'description': f"Recoverable Tax on Expense {expense.expense_number}",
                'cost_center': getattr(expense, 'cost_center', None),
                'source_line_reference': 'EXP_TAX'
            })

        lines.append({
            'account': treasury_gl,
            'debit': Decimal('0.0000'),
            'credit': total_amt,
            'description': f"Paid via {getattr(expense, 'payment_method', 'Cash/Bank')}: {getattr(expense, 'payee', '')}",
            'source_line_reference': 'EXP_PAYMENT'
        })

        journal = cls.get_or_create_journal(company, JournalType.EXPENSE)

        return cls.post_journal_entry(
            company=company,
            journal=journal,
            posting_date=posting_date,
            document_date=posting_date,
            lines=lines,
            source_type=JournalSourceType.EXPENSE,
            source_id=str(expense.id),
            source_number=getattr(expense, 'expense_number', str(expense.id)),
            reference=getattr(expense, 'receipt_reference', getattr(expense, 'expense_number', '')),
            description=f"Expense: {getattr(expense, 'expense_number', '')} ({expense.title})",
            user=user
        )

    @classmethod
    @transaction.atomic
    def post_payroll_accrual(cls, payroll_integration, user=None) -> JournalEntry:
        """
        S-4G Payroll → GL Double-Entry Posting:
        Dr Guard Salary Expense (5100), Admin Salaries (6200), Overtime (5200)
        Cr Payroll Payable (2200) [Net Disbursable]
        Cr Payroll Tax Payable (2310) [Employee Income Tax]
        Cr Employee Advance Recovery (1300) [if advances recovered]
        """
        company = payroll_integration.company
        config = SecurityFinanceConfiguration.objects.filter(company=company, is_active=True).first()

        payroll_pay_acc = (config.payroll_payable_account if config and config.payroll_payable_account else
                           ChartOfAccount.objects.filter(company=company, account_code='2200', is_active=True).first())
        tax_pay_acc = (getattr(payroll_integration, 'tax_payable_account', None) or
                       getattr(config, 'tax_payable_account', None) or
                       ChartOfAccount.objects.filter(company=company, account_code='2310', is_active=True).first() or
                       ChartOfAccount.objects.filter(company=company, account_code='2300', is_active=True).first())
        adv_rec_acc = ChartOfAccount.objects.filter(company=company, account_code='1300', is_active=True).first()

        guard_sal_acc = (getattr(config, 'salary_cost_account', None) or
                         ChartOfAccount.objects.filter(company=company, account_code='5100', is_active=True).first())
        ot_acc = (getattr(config, 'overtime_cost_account', None) or
                  ChartOfAccount.objects.filter(company=company, account_code='5200', is_active=True).first())
        staff_sal_acc = ChartOfAccount.objects.filter(company=company, account_code='6200', is_active=True).first() or guard_sal_acc

        if not payroll_pay_acc:
            raise ValidationError("Payroll Payable control account (2200) is required.")

        posting_date = getattr(payroll_integration, 'transaction_date', None) or timezone.now().date()
        gross = Decimal(str(payroll_integration.gross_payroll or '0.0000')).quantize(Decimal('0.0001'))
        ot_amt = Decimal(str(payroll_integration.total_overtime or '0.0000')).quantize(Decimal('0.0001'))
        base_salaries = gross - ot_amt
        net_payable = Decimal(str(payroll_integration.net_payroll_payable or '0.0000')).quantize(Decimal('0.0001'))
        tax_amt = Decimal(str(payroll_integration.total_tax or '0.0000')).quantize(Decimal('0.0001'))
        adv_amt = Decimal(str(payroll_integration.total_advances_recovered or '0.0000')).quantize(Decimal('0.0001'))

        lines = []

        # 1. Debit Salaries Expense
        lines.append({
            'account': guard_sal_acc,
            'debit': base_salaries,
            'credit': Decimal('0.0000'),
            'description': f"Guard & Field Personnel Base Salaries - {payroll_integration.payroll_period_name}",
            'source_line_reference': 'BASE_SALARIES'
        })

        # 2. Debit Overtime Expense
        if ot_amt > Decimal('0.0000'):
            lines.append({
                'account': ot_acc or guard_sal_acc,
                'debit': ot_amt,
                'credit': Decimal('0.0000'),
                'description': f"Overtime & Extra Guard Duty - {payroll_integration.payroll_period_name}",
                'source_line_reference': 'OVERTIME_COST'
            })

        # 3. Credit Payroll Payable Liability
        lines.append({
            'account': payroll_pay_acc,
            'debit': Decimal('0.0000'),
            'credit': net_payable,
            'description': f"Net Salaries Disbursable Liability - {payroll_integration.payroll_period_name}",
            'source_line_reference': 'PAYROLL_PAYABLE'
        })

        # 4. Credit Payroll Tax Payable
        if tax_amt > Decimal('0.0000'):
            if not tax_pay_acc:
                raise ValidationError("Payroll Tax Payable account (2310/2300) is required.")
            lines.append({
                'account': tax_pay_acc,
                'debit': Decimal('0.0000'),
                'credit': tax_amt,
                'description': f"Employee Income Tax Withheld - {payroll_integration.payroll_period_name}",
                'source_line_reference': 'PAYROLL_TAX'
            })

        # 5. Credit Advance Recovery
        if adv_amt > Decimal('0.0000'):
            if not adv_rec_acc:
                raise ValidationError("Employee Advance Recovery account (1300) is required.")
            lines.append({
                'account': adv_rec_acc,
                'debit': Decimal('0.0000'),
                'credit': adv_amt,
                'description': f"Employee Advance Deductions Recovered - {payroll_integration.payroll_period_name}",
                'source_line_reference': 'ADVANCE_RECOVERY'
            })

        journal = cls.get_or_create_journal(company, JournalType.PAYROLL)

        entry = cls.post_journal_entry(
            company=company,
            journal=journal,
            posting_date=posting_date,
            document_date=posting_date,
            lines=lines,
            source_type=JournalSourceType.PAYROLL_ACCRUAL,
            source_id=str(payroll_integration.id),
            source_number=getattr(payroll_integration.payroll_run, 'run_number', str(payroll_integration.id)) if payroll_integration.payroll_run else str(payroll_integration.id),
            reference=payroll_integration.payroll_period_name,
            description=f"Payroll Accrual: {payroll_integration.payroll_period_name}",
            user=user
        )

        return entry

    @classmethod
    @transaction.atomic
    def post_salary_disbursement_batch(cls, salary_batch, user=None) -> JournalEntry:
        """
        S-4G Salary Disbursement → GL Double-Entry Posting:
        Dr Payroll Payable (2200) [Successful Disbursed Amount]
        Cr Treasury Bank / Cash GL (1120)
        """
        company = salary_batch.company
        config = SecurityFinanceConfiguration.objects.filter(company=company, is_active=True).first()

        payroll_pay_acc = (config.payroll_payable_account if config and config.payroll_payable_account else
                           ChartOfAccount.objects.filter(company=company, account_code='2200', is_active=True).first())

        bank_acc = getattr(salary_batch, 'treasury_account', None)
        treasury_gl = getattr(bank_acc, 'chart_of_account', None) or ChartOfAccount.objects.filter(company=company, account_code='1120', is_active=True).first()

        if not payroll_pay_acc:
            raise ValidationError("Payroll Payable control account (2200) is required.")
        if not treasury_gl:
            raise ValidationError("Treasury Bank GL account (1120) is required.")

        posting_date = getattr(salary_batch, 'payment_date', None) or timezone.now().date()
        disbursed_amt = Decimal(str(getattr(salary_batch, 'total_successful_amount', salary_batch.total_batch_amount))).quantize(Decimal('0.0001'))

        if disbursed_amt <= Decimal('0.0000'):
            raise ValidationError("Cannot post salary disbursement batch with zero successful amount.")

        lines = [
            {
                'account': payroll_pay_acc,
                'debit': disbursed_amt,
                'credit': Decimal('0.0000'),
                'description': f"Salary Disbursed Batch {salary_batch.batch_number}",
                'source_line_reference': 'PAYROLL_LIABILITY_CLEAR'
            },
            {
                'account': treasury_gl,
                'debit': Decimal('0.0000'),
                'credit': disbursed_amt,
                'description': f"Disbursed via {salary_batch.get_payment_mode_display()} - {salary_batch.get_provider_display()}",
                'source_line_reference': 'BANK_SALARY_OUT'
            }
        ]

        journal = cls.get_or_create_journal(company, JournalType.PAYMENTS)

        return cls.post_journal_entry(
            company=company,
            journal=journal,
            posting_date=posting_date,
            document_date=posting_date,
            lines=lines,
            source_type=JournalSourceType.SALARY_PAYMENT,
            source_id=str(salary_batch.id),
            source_number=salary_batch.batch_number,
            reference=salary_batch.batch_number,
            description=f"Salary Payment Batch: {salary_batch.batch_number} ({salary_batch.get_provider_display()})",
            user=user
        )

    @classmethod
    @transaction.atomic
    def post_tax_payment(cls, tax_voucher, user=None) -> JournalEntry:
        """
        S-4H Tax Payment Voucher → GL Double-Entry Posting:
        Dr Tax Payable / Withholding Payable (2300)
        Cr Treasury Bank / Cash GL (1120)
        """
        company = tax_voucher.company
        config = SecurityFinanceConfiguration.objects.filter(company=company, is_active=True).first()

        tax_pay_acc = (config.tax_payable_account if config and config.tax_payable_account else
                       ChartOfAccount.objects.filter(company=company, account_code='2300', is_active=True).first())

        bank_acc = getattr(tax_voucher, 'treasury_account', None)
        treasury_gl = getattr(bank_acc, 'chart_of_account', None) or ChartOfAccount.objects.filter(company=company, account_code='1120', is_active=True).first()

        if not tax_pay_acc:
            raise ValidationError("Tax Payable control account (2300) is required.")
        if not treasury_gl:
            raise ValidationError("Treasury Bank GL account (1120) is required.")

        posting_date = tax_voucher.payment_date or timezone.now().date()
        amt = Decimal(str(tax_voucher.amount)).quantize(Decimal('0.0001'))

        lines = [
            {
                'account': tax_pay_acc,
                'debit': amt,
                'credit': Decimal('0.0000'),
                'description': f"Tax Deposit to {tax_voucher.tax_authority.name} (Challan #{tax_voucher.challan_number or tax_voucher.psid_number})",
                'source_line_reference': 'TAX_LIABILITY_CLEAR'
            },
            {
                'account': treasury_gl,
                'debit': Decimal('0.0000'),
                'credit': amt,
                'description': f"Treasury Tax Payment - {tax_voucher.tax_authority.name}",
                'source_line_reference': 'BANK_TAX_OUT'
            }
        ]

        journal = cls.get_or_create_journal(company, JournalType.TAX)

        return cls.post_journal_entry(
            company=company,
            journal=journal,
            posting_date=posting_date,
            document_date=posting_date,
            lines=lines,
            source_type=JournalSourceType.TAX_PAYMENT,
            source_id=str(tax_voucher.id),
            source_number=tax_voucher.voucher_number,
            reference=tax_voucher.challan_number or tax_voucher.psid_number or tax_voucher.voucher_number,
            description=f"Tax Payment: {tax_voucher.voucher_number} to {tax_voucher.tax_authority.name}",
            user=user
        )

    @classmethod
    @transaction.atomic
    def post_treasury_contra_transfer(cls, contra_voucher, user=None) -> JournalEntry:
        """
        S-4D Contra Transfer → GL Double-Entry Posting:
        Dr Destination Bank / Cash Account GL
        Cr Source Bank / Cash Account GL
        """
        company = contra_voucher.company
        source_bank = getattr(contra_voucher, 'bank_account', None)
        dest_bank = getattr(contra_voucher, 'target_bank_account', None)

        source_gl = getattr(source_bank, 'chart_of_account', None) or ChartOfAccount.objects.filter(company=company, account_code='1120', is_active=True).first()
        dest_gl = getattr(dest_bank, 'chart_of_account', None) or ChartOfAccount.objects.filter(company=company, account_code='1110', is_active=True).first()

        if not source_gl or not dest_gl:
            raise ValidationError("Both source and destination treasury GL accounts are required for contra transfers.")

        posting_date = getattr(contra_voucher, 'date', getattr(contra_voucher, 'voucher_date', None)) or timezone.now().date()
        amt = Decimal(str(contra_voucher.amount)).quantize(Decimal('0.0001'))

        lines = [
            {
                'account': dest_gl,
                'debit': amt,
                'credit': Decimal('0.0000'),
                'description': f"Transfer In to {getattr(dest_bank, 'account_title', 'Destination')}",
                'source_line_reference': 'CONTRA_IN'
            },
            {
                'account': source_gl,
                'debit': Decimal('0.0000'),
                'credit': amt,
                'description': f"Transfer Out from {getattr(source_bank, 'account_title', 'Source')}",
                'source_line_reference': 'CONTRA_OUT'
            }
        ]

        journal = cls.get_or_create_journal(company, JournalType.CONTRA)

        return cls.post_journal_entry(
            company=company,
            journal=journal,
            posting_date=posting_date,
            document_date=posting_date,
            lines=lines,
            source_type=JournalSourceType.CONTRA_TRANSFER,
            source_id=str(contra_voucher.id),
            source_number=getattr(contra_voucher, 'voucher_number', str(contra_voucher.id)),
            reference=getattr(contra_voucher, 'reference', getattr(contra_voucher, 'voucher_number', '')),
            description=f"Contra Transfer: {getattr(source_bank, 'account_title', '')} → {getattr(dest_bank, 'account_title', '')}",
            user=user
        )

    # -------------------------------------------------------------------------
    # GENERAL LEDGER & TRIAL BALANCE QUERIES
    # -------------------------------------------------------------------------

    @classmethod
    def get_account_ledger(
        cls,
        company: Company,
        account: ChartOfAccount,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        cost_center: Optional[CostCenter] = None,
        profit_center: Optional[ProfitCenter] = None,
        crm_entity=None,
        contract=None,
        site=None,
        source_type: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Builds the detailed General Ledger report for a specific ChartOfAccount.
        Computes accurate opening balance and line-by-line running balance respecting normal balance.
        """
        if account.company_id != company.id:
            raise ValidationError("Account does not belong to the active company.")

        if not end_date:
            end_date = timezone.now().date()

        # 1. Opening Balance Query (All posted transactions before start_date)
        opening_debit = Decimal('0.0000')
        opening_credit = Decimal('0.0000')

        if start_date:
            prior_filter = Q(
                company=company,
                account=account,
                journal_entry__status=JournalStatus.POSTED,
                journal_entry__posting_date__lt=start_date,
                is_deleted=False
            )
            if cost_center:
                prior_filter &= Q(cost_center=cost_center)
            if profit_center:
                prior_filter &= Q(profit_center=profit_center)
            if crm_entity:
                prior_filter &= Q(crm_entity=crm_entity)
            if contract:
                prior_filter &= Q(contract=contract)
            if site:
                prior_filter &= Q(site=site)

            prior_agg = JournalEntryLine.objects.filter(prior_filter).aggregate(
                t_debit=Sum('debit'),
                t_credit=Sum('credit')
            )
            opening_debit = (prior_agg['t_debit'] or Decimal('0.0000')).quantize(Decimal('0.0001'))
            opening_credit = (prior_agg['t_credit'] or Decimal('0.0000')).quantize(Decimal('0.0001'))

        # Calculate Net Opening Balance
        is_debit_normal = (
            account.normal_balance == NormalBalance.DEBIT or
            account.account_type in [AccountType.ASSET, AccountType.EXPENSE, AccountType.COST_OF_SERVICE]
        )
        if is_debit_normal:
            net_opening_balance = opening_debit - opening_credit
        else:
            net_opening_balance = opening_credit - opening_debit

        # 2. Period Lines Query
        period_filter = Q(
            company=company,
            account=account,
            journal_entry__status=JournalStatus.POSTED,
            is_deleted=False
        )
        if start_date:
            period_filter &= Q(journal_entry__posting_date__gte=start_date)
        if end_date:
            period_filter &= Q(journal_entry__posting_date__lte=end_date)
        if cost_center:
            period_filter &= Q(cost_center=cost_center)
        if profit_center:
            period_filter &= Q(profit_center=profit_center)
        if crm_entity:
            period_filter &= Q(crm_entity=crm_entity)
        if contract:
            period_filter &= Q(contract=contract)
        if site:
            period_filter &= Q(site=site)
        if source_type:
            period_filter &= Q(journal_entry__source_type=source_type)

        period_lines = JournalEntryLine.objects.filter(period_filter).select_related(
            'journal_entry', 'cost_center', 'profit_center', 'crm_entity', 'contract', 'site', 'vendor', 'employee'
        ).order_by('journal_entry__posting_date', 'journal_entry__created_at', 'id')

        # 3. Build Running Balance Ledger
        running_bal = net_opening_balance
        ledger_lines = []
        period_debit_total = Decimal('0.0000')
        period_credit_total = Decimal('0.0000')

        for l in period_lines:
            d = l.debit.quantize(Decimal('0.0001'))
            c = l.credit.quantize(Decimal('0.0001'))
            period_debit_total += d
            period_credit_total += c

            if is_debit_normal:
                running_bal += (d - c)
            else:
                running_bal += (c - d)

            ledger_lines.append({
                'id': str(l.id),
                'line_id': str(l.id),
                'journal_entry_id': str(l.journal_entry_id),
                'entry_number': l.journal_entry.entry_number,
                'posting_date': l.journal_entry.posting_date.isoformat() if l.journal_entry.posting_date else '',
                'document_date': l.journal_entry.document_date.isoformat() if l.journal_entry.document_date else '',
                'reference': l.journal_entry.reference,
                'description': l.description or l.journal_entry.description,
                'source_type': l.journal_entry.source_type,
                'source_id': l.journal_entry.source_id,
                'source_number': l.journal_entry.source_number,
                'debit': float(d),
                'credit': float(c),
                'running_balance': float(running_bal),
                'cost_center_name': l.cost_center.name if l.cost_center else None,
                'profit_center_name': l.profit_center.name if l.profit_center else None,
                'client_name': l.crm_entity.name if l.crm_entity else None,
                'contract_code': l.contract.contract_code if l.contract else None,
                'site_name': l.site.name if l.site else None,
                'vendor_name': l.vendor.name if l.vendor else None,
                'employee_name': f"{l.employee.first_name} {l.employee.last_name}" if l.employee else None,
            })

        return {
            'account_id': str(account.id),
            'account_code': account.account_code,
            'account_name': account.account_name,
            'account_type': account.account_type,
            'normal_balance': account.normal_balance,
            'start_date': start_date.isoformat() if start_date else None,
            'end_date': end_date.isoformat() if end_date else None,
            'opening_balance': float(net_opening_balance),
            'period_debit_total': float(period_debit_total),
            'period_credit_total': float(period_credit_total),
            'closing_balance': float(running_bal),
            'lines': ledger_lines
        }

    @classmethod
    def get_trial_balance(
        cls,
        company: Company,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        as_of_date: Optional[date] = None,
        cost_center: Optional[CostCenter] = None,
        profit_center: Optional[ProfitCenter] = None
    ) -> Dict[str, Any]:
        """
        Builds the authoritative Trial Balance from POSTED JournalEntryLines.
        Validates Total Closing Debit == Total Closing Credit.
        """
        if as_of_date and not end_date:
            end_date = as_of_date
        if not end_date:
            end_date = timezone.now().date()

        accounts = ChartOfAccount.objects.filter(company=company, is_deleted=False).order_by('account_code')

        trial_balance_rows = []
        grand_opening_debit = Decimal('0.0000')
        grand_opening_credit = Decimal('0.0000')
        grand_period_debit = Decimal('0.0000')
        grand_period_credit = Decimal('0.0000')
        grand_closing_debit = Decimal('0.0000')
        grand_closing_credit = Decimal('0.0000')

        for acc in accounts:
            # 1. Prior Period aggregates
            prior_debit = Decimal('0.0000')
            prior_credit = Decimal('0.0000')
            if start_date:
                prior_f = Q(
                    company=company,
                    account=acc,
                    journal_entry__status=JournalStatus.POSTED,
                    journal_entry__posting_date__lt=start_date,
                    is_deleted=False
                )
                if cost_center:
                    prior_f &= Q(cost_center=cost_center)
                if profit_center:
                    prior_f &= Q(profit_center=profit_center)
                p_agg = JournalEntryLine.objects.filter(prior_f).aggregate(d=Sum('debit'), c=Sum('credit'))
                prior_debit = (p_agg['d'] or Decimal('0.0000')).quantize(Decimal('0.0001'))
                prior_credit = (p_agg['c'] or Decimal('0.0000')).quantize(Decimal('0.0001'))

            # Net Opening
            net_prior = prior_debit - prior_credit
            if net_prior >= Decimal('0.0000'):
                row_open_debit = net_prior
                row_open_credit = Decimal('0.0000')
            else:
                row_open_debit = Decimal('0.0000')
                row_open_credit = abs(net_prior)

            # 2. Period Movement aggregates
            period_f = Q(
                company=company,
                account=acc,
                journal_entry__status=JournalStatus.POSTED,
                is_deleted=False
            )
            if start_date:
                period_f &= Q(journal_entry__posting_date__gte=start_date)
            if end_date:
                period_f &= Q(journal_entry__posting_date__lte=end_date)
            if cost_center:
                period_f &= Q(cost_center=cost_center)
            if profit_center:
                period_f &= Q(profit_center=profit_center)

            cur_agg = JournalEntryLine.objects.filter(period_f).aggregate(d=Sum('debit'), c=Sum('credit'))
            row_period_debit = (cur_agg['d'] or Decimal('0.0000')).quantize(Decimal('0.0001'))
            row_period_credit = (cur_agg['c'] or Decimal('0.0000')).quantize(Decimal('0.0001'))

            # 3. Net Closing
            net_closing = (prior_debit + row_period_debit) - (prior_credit + row_period_credit)
            if net_closing >= Decimal('0.0000'):
                row_close_debit = net_closing
                row_close_credit = Decimal('0.0000')
            else:
                row_close_debit = Decimal('0.0000')
                row_close_credit = abs(net_closing)

            # Only omit if account is completely zero in all columns
            if (row_open_debit == 0 and row_open_credit == 0 and
                row_period_debit == 0 and row_period_credit == 0 and
                row_close_debit == 0 and row_close_credit == 0):
                continue

            grand_opening_debit += row_open_debit
            grand_opening_credit += row_open_credit
            grand_period_debit += row_period_debit
            grand_period_credit += row_period_credit
            grand_closing_debit += row_close_debit
            grand_closing_credit += row_close_credit

            trial_balance_rows.append({
                'account_id': str(acc.id),
                'account_code': acc.account_code,
                'account_name': acc.account_name,
                'account_type': acc.account_type,
                'is_header': acc.is_header,
                'opening_debit': float(row_open_debit),
                'opening_credit': float(row_open_credit),
                'period_debit': float(row_period_debit),
                'period_credit': float(row_period_credit),
                'closing_debit': float(row_close_debit),
                'closing_credit': float(row_close_credit),
            })

        is_balanced = (grand_closing_debit == grand_closing_credit)

        return {
            'as_of_date': end_date.isoformat(),
            'start_date': start_date.isoformat() if start_date else None,
            'end_date': end_date.isoformat(),
            'is_balanced': is_balanced,
            'totals': {
                'opening_debit': float(grand_opening_debit),
                'opening_credit': float(grand_opening_credit),
                'period_debit': float(grand_period_debit),
                'period_credit': float(grand_period_credit),
                'closing_debit': float(grand_closing_debit),
                'closing_credit': float(grand_closing_credit),
                'difference': float(abs(grand_closing_debit - grand_closing_credit))
            },
            'rows': trial_balance_rows
        }

    @classmethod
    def get_subledger_reconciliations(cls, company: Company, as_of_date: Optional[date] = None) -> Dict[str, Any]:
        """
        Calculates subledger vs GL control account reconciliations:
        - AR Subledger vs AR Control (1200)
        - AP Subledger vs AP Control (2100)
        - Payroll Subledger vs Payroll Payable GL (2200)
        - Tax Subledger vs Tax Payable GL (2300)
        """
        if not as_of_date:
            as_of_date = timezone.now().date()

        # 1. Accounts Receivable
        ar_acc = ChartOfAccount.objects.filter(company=company, account_code='1200', is_active=True).first()
        ar_gl_bal = float(ar_acc.current_balance) if ar_acc else 0.0

        from billing.models import ClientInvoice, ClientInvoiceStatus
        ar_subledger_unpaid = ClientInvoice.objects.filter(
            company=company,
            status__in=[ClientInvoiceStatus.ISSUED, ClientInvoiceStatus.PARTIALLY_PAID],
            is_deleted=False
        ).aggregate(
            t_total=Sum('grand_total'),
            t_paid=Sum('paid_amount')
        )
        ar_subledger_bal = float((ar_subledger_unpaid['t_total'] or Decimal('0')) - (ar_subledger_unpaid['t_paid'] or Decimal('0')))

        # 2. Accounts Payable
        ap_acc = ChartOfAccount.objects.filter(company=company, account_code='2100', is_active=True).first()
        ap_gl_bal = float(ap_acc.current_balance) if ap_acc else 0.0

        # AP subledger: sum unpaid vendor bills (bills minus payments already posted)
        from finance.models import PurchasingAccountingIntegration, PurchasingAccountingStatus, PurchasingIntegrationSourceType
        ap_bills = PurchasingAccountingIntegration.objects.filter(
            company=company,
            source_type=PurchasingIntegrationSourceType.VENDOR_BILL,
            is_deleted=False
        ).aggregate(t=Sum('amount'))['t'] or Decimal('0')
        ap_payments = PurchasingAccountingIntegration.objects.filter(
            company=company,
            source_type=PurchasingIntegrationSourceType.VENDOR_PAYMENT,
            is_deleted=False
        ).aggregate(t=Sum('amount'))['t'] or Decimal('0')
        ap_subledger_bal = float(ap_bills - ap_payments)

        # 3. Payroll Payable
        pr_acc = ChartOfAccount.objects.filter(company=company, account_code='2200', is_active=True).first()
        pr_gl_bal = float(pr_acc.current_balance) if pr_acc else 0.0

        from finance.models import PayrollAccountingIntegration, PayrollAccountingStatus
        pr_subledger_bal = float(PayrollAccountingIntegration.objects.filter(
            company=company,
            status__in=[PayrollAccountingStatus.READY, PayrollAccountingStatus.PARTIALLY_DISBURSED],
            is_deleted=False
        ).aggregate(t=Sum('remaining_liability'))['t'] or 0.0)

        # 4. Tax Payable
        tax_acc = ChartOfAccount.objects.filter(company=company, account_code='2300', is_active=True).first()
        tax_gl_bal = float(tax_acc.current_balance) if tax_acc else 0.0

        from finance.models import TaxTransaction, TaxTransactionStatus, TaxDirection
        tax_output_unpaid = TaxTransaction.objects.filter(
            company=company,
            direction=TaxDirection.OUTPUT,
            status__in=[TaxTransactionStatus.PAYABLE, TaxTransactionStatus.POSTED_SOURCE],
            is_deleted=False
        ).aggregate(t=Sum('tax_amount'))['t'] or Decimal('0.0000')
        tax_subledger_bal = float(tax_output_unpaid)

        return {
            'as_of_date': as_of_date.isoformat(),
            'reconciliations': [
                {
                    'module': 'Accounts Receivable (Billing)',
                    'control_account_code': '1200',
                    'control_account_name': 'Accounts Receivable',
                    'gl_balance': ar_gl_bal,
                    'subledger_balance': ar_subledger_bal,
                    'difference': round(ar_gl_bal - ar_subledger_bal, 2),
                    'is_reconciled': abs(ar_gl_bal - ar_subledger_bal) < 0.01,
                    'status': 'BALANCED' if abs(ar_gl_bal - ar_subledger_bal) < 0.01 else 'VARIANCE'
                },
                {
                    'module': 'Accounts Payable (Purchasing)',
                    'control_account_code': '2100',
                    'control_account_name': 'Accounts Payable',
                    'gl_balance': ap_gl_bal,
                    'subledger_balance': ap_subledger_bal,
                    'difference': round(ap_gl_bal - ap_subledger_bal, 2),
                    'is_reconciled': abs(ap_gl_bal - ap_subledger_bal) < 0.01,
                    'status': 'BALANCED' if abs(ap_gl_bal - ap_subledger_bal) < 0.01 else 'VARIANCE'
                },
                {
                    'module': 'Payroll Liabilities (HRM)',
                    'control_account_code': '2200',
                    'control_account_name': 'Payroll Payable',
                    'gl_balance': pr_gl_bal,
                    'subledger_balance': pr_subledger_bal,
                    'difference': round(pr_gl_bal - pr_subledger_bal, 2),
                    'is_reconciled': abs(pr_gl_bal - pr_subledger_bal) < 0.01,
                    'status': 'BALANCED' if abs(pr_gl_bal - pr_subledger_bal) < 0.01 else 'VARIANCE'
                },
                {
                    'module': 'Statutory Taxes (Taxation)',
                    'control_account_code': '2300',
                    'control_account_name': 'Sales & Withholding Tax Payable',
                    'gl_balance': tax_gl_bal,
                    'subledger_balance': tax_subledger_bal,
                    'difference': round(tax_gl_bal - tax_subledger_bal, 2),
                    'is_reconciled': abs(tax_gl_bal - tax_subledger_bal) < 0.01,
                    'status': 'BALANCED' if abs(tax_gl_bal - tax_subledger_bal) < 0.01 else 'VARIANCE'
                }
            ]
        }

    @classmethod
    def get_posting_queue(
        cls,
        company: Company,
        filter_status: str = 'READY_TO_POST',
        source_type: str = 'ALL'
    ) -> List[Dict[str, Any]]:
        """
        Scans all operational modules (Billing, Receipts, Purchasing, Expenses, Payroll, Taxes, Treasury)
        and lists items ready to post into the General Ledger.
        """
        queue = []

        # 1. Billing Invoices
        from billing.models import ClientInvoice, ClientInvoiceStatus
        invoices = ClientInvoice.objects.filter(
            company=company,
            status__in=[ClientInvoiceStatus.ISSUED, ClientInvoiceStatus.PAID, ClientInvoiceStatus.PARTIALLY_PAID],
            is_deleted=False
        ).select_related('client', 'contract')

        for inv in invoices:
            has_je = JournalEntry.objects.filter(
                company=company,
                source_type=JournalSourceType.CLIENT_INVOICE,
                source_id=str(inv.id),
                status=JournalStatus.POSTED
            ).exists()

            if (filter_status == 'READY_TO_POST' and not has_je) or (filter_status == 'POSTED' and has_je) or filter_status == 'ALL':
                queue.append({
                    'id': str(inv.id),
                    'source_type': JournalSourceType.CLIENT_INVOICE,
                    'source_number': inv.invoice_number,
                    'transaction_date': inv.invoice_date.isoformat() if inv.invoice_date else '',
                    'counterparty': getattr(inv.client, 'name', 'Client'),
                    'amount': float(inv.grand_total if hasattr(inv, 'grand_total') else inv.total_amount),
                    'description': f"Client Invoice {inv.invoice_number} ({getattr(inv.contract, 'contract_code', '')})",
                    'is_posted': has_je,
                    'status': 'POSTED' if has_je else 'READY_TO_POST',
                })

        # 2. Expenses
        from finance.models import Expense, ExpenseStatus
        expenses = Expense.objects.filter(company=company, is_deleted=False).select_related('bank_account', 'expense_account')
        for exp in expenses:
            has_je = JournalEntry.objects.filter(
                company=company,
                source_type=JournalSourceType.EXPENSE,
                source_id=str(exp.id),
                status=JournalStatus.POSTED
            ).exists()

            if (filter_status == 'READY_TO_POST' and not has_je) or (filter_status == 'POSTED' and has_je) or filter_status == 'ALL':
                queue.append({
                    'id': str(exp.id),
                    'source_type': JournalSourceType.EXPENSE,
                    'source_number': exp.expense_number or str(exp.id),
                    'transaction_date': exp.expense_date.isoformat() if exp.expense_date else '',
                    'counterparty': exp.payee or getattr(exp.vendor, 'name', '') or getattr(exp.employee, 'first_name', ''),
                    'amount': float(exp.total_amount),
                    'description': f"Expense {exp.expense_number}: {exp.title}",
                    'is_posted': has_je,
                    'status': 'POSTED' if has_je else 'READY_TO_POST',
                })

        # 3. Payroll Integrations
        from finance.models import PayrollAccountingIntegration
        payrolls = PayrollAccountingIntegration.objects.filter(company=company, is_deleted=False)
        for pr in payrolls:
            has_je = JournalEntry.objects.filter(
                company=company,
                source_type=JournalSourceType.PAYROLL_ACCRUAL,
                source_id=str(pr.id),
                status=JournalStatus.POSTED
            ).exists()

            if (filter_status == 'READY_TO_POST' and not has_je) or (filter_status == 'POSTED' and has_je) or filter_status == 'ALL':
                queue.append({
                    'id': str(pr.id),
                    'source_type': JournalSourceType.PAYROLL_ACCRUAL,
                    'source_number': pr.payroll_period_name,
                    'transaction_date': pr.transaction_date.isoformat() if pr.transaction_date else '',
                    'counterparty': 'Employees & Field Guards',
                    'amount': float(pr.gross_payroll),
                    'description': f"Payroll Accrual: {pr.payroll_period_name}",
                    'is_posted': has_je,
                    'status': 'POSTED' if has_je else 'READY_TO_POST',
                })

        # 4. Tax Payment Vouchers
        from finance.models import TaxPaymentVoucher, TaxVoucherStatus
        vouchers = TaxPaymentVoucher.objects.filter(
            company=company,
            status__in=[TaxVoucherStatus.PAID, TaxVoucherStatus.FILED],
            is_deleted=False
        ).select_related('tax_authority', 'treasury_account')

        for v in vouchers:
            has_je = JournalEntry.objects.filter(
                company=company,
                source_type=JournalSourceType.TAX_PAYMENT,
                source_id=str(v.id),
                status=JournalStatus.POSTED
            ).exists()

            if (filter_status == 'READY_TO_POST' and not has_je) or (filter_status == 'POSTED' and has_je) or filter_status == 'ALL':
                queue.append({
                    'id': str(v.id),
                    'source_type': JournalSourceType.TAX_PAYMENT,
                    'source_number': v.voucher_number,
                    'transaction_date': v.payment_date.isoformat() if v.payment_date else '',
                    'counterparty': v.tax_authority.name,
                    'amount': float(v.amount),
                    'description': f"Tax Deposit: {v.voucher_number} to {v.tax_authority.name}",
                    'is_posted': has_je,
                    'status': 'POSTED' if has_je else 'READY_TO_POST',
                })

        if source_type != 'ALL':
            queue = [q for q in queue if q['source_type'] == source_type]

        return queue
