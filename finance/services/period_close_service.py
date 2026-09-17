from decimal import Decimal
from datetime import date
from django.utils import timezone
from django.db import transaction
from django.core.exceptions import ValidationError
from finance.models import (
    AccountingPeriod, PeriodStatus, JournalEntry, JournalEntryLine,
    BankAccount, Cheque, FinancialVoucher, SubledgerReconciliationSnapshot,
    ControlException, ControlExceptionType, ControlExceptionSeverity,
    ControlExceptionStatus, BankStatement, BankStatementLine, MatchStatus
)

class PeriodCloseService:
    """
    Authoritative Period Close Workflow Engine for Zorvex ERP 2.0.
    Enforces OPEN -> SOFT_CLOSED -> CLOSED -> LOCKED lifecycle with readiness checklist validation.
    """

    @classmethod
    def get_readiness(cls, period: AccountingPeriod) -> dict:
        company = period.company
        checks = []

        # Check 1: Trial Balance Balance (Σ Dr == Σ Cr)
        from finance.services.posting_service import AccountingPostingService
        tb = AccountingPostingService.get_trial_balance(company, start_date=period.start_date, end_date=period.end_date)
        tb_diff = Decimal(str(tb['totals']['difference']))
        tb_passed = tb_diff == Decimal('0.0000')
        checks.append({
            'name': 'Trial Balance Equation (Debits == Credits)',
            'status': 'PASSED' if tb_passed else 'FAILED',
            'severity': 'BLOCKER',
            'details': f"Trial balance difference: PKR {tb_diff}" if not tb_passed else "Trial balance balances perfectly."
        })

        # Check 2: AR Subledger vs GL
        from finance.services.subledger_reconciliation_service import SubledgerReconciliationService
        sub_summary = SubledgerReconciliationService.get_subledger_reconciliation_summary(company, period)
        ar_diff = abs(sub_summary['ar']['difference'])
        ar_passed = ar_diff < Decimal('1.0000')
        checks.append({
            'name': 'Accounts Receivable Subledger vs GL Control Account',
            'status': 'PASSED' if ar_passed else 'FAILED',
            'severity': 'BLOCKER',
            'details': f"AR Reconciliation difference: PKR {ar_diff}" if not ar_passed else "AR subledger matches GL control account."
        })

        # Check 3: AP Subledger vs GL
        ap_diff = abs(sub_summary['ap']['difference'])
        ap_passed = ap_diff < Decimal('1.0000')
        checks.append({
            'name': 'Accounts Payable Subledger vs GL Control Account',
            'status': 'PASSED' if ap_passed else 'FAILED',
            'severity': 'BLOCKER',
            'details': f"AP Reconciliation difference: PKR {ap_diff}" if not ap_passed else "AP subledger matches GL control account."
        })

        # Check 4: Payroll Liability vs GL
        payroll_diff = abs(sub_summary['payroll']['difference'])
        payroll_passed = payroll_diff < Decimal('1.0000')
        checks.append({
            'name': 'Payroll Liability Subledger vs GL Control Account',
            'status': 'PASSED' if payroll_passed else 'WARNING',
            'severity': 'WARNING',
            'details': f"Payroll liability variance: PKR {payroll_diff}" if not payroll_passed else "Payroll liability matches GL."
        })

        # Check 5: Tax Liability vs GL
        tax_diff = abs(sub_summary['tax']['difference'])
        tax_passed = tax_diff < Decimal('1.0000')
        checks.append({
            'name': 'Tax Liability Subledger vs GL Control Account',
            'status': 'PASSED' if tax_passed else 'WARNING',
            'severity': 'WARNING',
            'details': f"Tax liability variance: PKR {tax_diff}" if not tax_passed else "Tax liability matches GL."
        })

        # Check 6: Bank Statement Reconciliation
        unrec_statements = BankStatement.objects.filter(
            company=company,
            end_date__gte=period.start_date,
            end_date__lte=period.end_date
        ).exclude(status='CLOSED')
        bank_passed = not unrec_statements.exists()
        checks.append({
            'name': 'Bank Account Statement Reconciliations',
            'status': 'PASSED' if bank_passed else 'WARNING',
            'severity': 'WARNING',
            'details': f"{unrec_statements.count()} bank statement(s) pending reconciliation." if not bank_passed else "All period bank statements reconciled."
        })

        # Check 7: Physical Cash Accounts Count
        from finance.models import CashCount
        cash_counts = CashCount.objects.filter(
            company=company,
            count_date__gte=period.start_date,
            count_date__lte=period.end_date
        )
        cash_passed = cash_counts.exists()
        checks.append({
            'name': 'Physical Cash Account Counts',
            'status': 'PASSED' if cash_passed else 'WARNING',
            'severity': 'WARNING',
            'details': "No physical cash count recorded for period." if not cash_passed else f"{cash_counts.count()} cash count(s) verified."
        })

        # Check 8: Unposted Financial Queue / Draft Entries
        draft_entries = JournalEntry.objects.filter(
            company=company,
            posting_date__gte=period.start_date,
            posting_date__lte=period.end_date,
            status='DRAFT'
        )
        unposted_passed = not draft_entries.exists()
        checks.append({
            'name': 'Unposted Journal Queue Empty',
            'status': 'PASSED' if unposted_passed else 'FAILED',
            'severity': 'BLOCKER',
            'details': f"{draft_entries.count()} draft journal entry(ies) pending in period queue." if not unposted_passed else "Posting queue empty."
        })

        # Check 9: Draft Financial Vouchers
        draft_vouchers = FinancialVoucher.objects.filter(
            company=company,
            date__gte=period.start_date,
            date__lte=period.end_date,
            status='DRAFT'
        )
        vouchers_passed = not draft_vouchers.exists()
        checks.append({
            'name': 'Draft Financial Vouchers Reviewed',
            'status': 'PASSED' if vouchers_passed else 'WARNING',
            'severity': 'WARNING',
            'details': f"{draft_vouchers.count()} draft voucher(s) pending review." if not vouchers_passed else "No draft vouchers pending."
        })

        # Check 10: Uncleared Cheques Review
        old_cheques = Cheque.objects.filter(
            company=company,
            issue_date__lte=period.end_date,
            status__in=['ISSUED', 'DEPOSITED']
        )
        cheques_passed = not old_cheques.exists()
        checks.append({
            'name': 'Uncleared Cheques Review',
            'status': 'PASSED' if cheques_passed else 'WARNING',
            'severity': 'INFO',
            'details': f"{old_cheques.count()} uncleared cheque(s) in registry." if not cheques_passed else "No uncleared cheques."
        })

        # Evaluate overall readiness status
        has_blocker = any(c['status'] == 'FAILED' and c['severity'] == 'BLOCKER' for c in checks)
        has_warning = any(c['status'] in ['FAILED', 'WARNING'] and c['severity'] != 'BLOCKER' for c in checks)

        if has_blocker:
            readiness_status = 'BLOCKED'
        elif has_warning:
            readiness_status = 'WARNING'
        else:
            readiness_status = 'READY'

        return {
            'period_id': str(period.id),
            'period_name': str(period),
            'status': period.status,
            'readiness_status': readiness_status,
            'checks': checks,
            'summary': {
                'total_checks': len(checks),
                'passed': sum(1 for c in checks if c['status'] == 'PASSED'),
                'warnings': sum(1 for c in checks if c['status'] == 'WARNING'),
                'blockers': sum(1 for c in checks if c['status'] == 'FAILED' and c['severity'] == 'BLOCKER')
            }
        }

    @classmethod
    @transaction.atomic
    def soft_close_period(cls, period: AccountingPeriod, user, notes: str = '') -> AccountingPeriod:
        if period.status in [PeriodStatus.CLOSED, PeriodStatus.LOCKED]:
            raise ValidationError(f"Cannot soft close period in {period.status} status.")

        period.status = PeriodStatus.SOFT_CLOSED
        period.soft_closed_by = user
        period.soft_closed_at = timezone.now()
        if notes:
            period.review_notes = notes
        period.save()
        return period

    @classmethod
    @transaction.atomic
    def final_close_period(cls, period: AccountingPeriod, user, notes: str = '', force_if_warning: bool = False) -> AccountingPeriod:
        readiness = cls.get_readiness(period)
        if readiness['readiness_status'] == 'BLOCKED':
            blockers = [c['name'] + ": " + c['details'] for c in readiness['checks'] if c['status'] == 'FAILED' and c['severity'] == 'BLOCKER']
            raise ValidationError(f"Cannot perform final close. Period close blocked by: {'; '.join(blockers)}")

        period.status = PeriodStatus.CLOSED
        period.finalized_by = user
        period.finalized_at = timezone.now()
        period.close_notes = notes
        period.checklist_snapshot = readiness
        period.save()

        # Save immutable subledger snapshot
        from finance.services.subledger_reconciliation_service import SubledgerReconciliationService
        SubledgerReconciliationService.create_subledger_snapshot(period)

        return period

    @classmethod
    @transaction.atomic
    def lock_period(cls, period: AccountingPeriod, user) -> AccountingPeriod:
        if period.status != PeriodStatus.CLOSED:
            raise ValidationError("Only a CLOSED period can be locked.")

        period.status = PeriodStatus.LOCKED
        period.locked_by = user
        period.locked_at = timezone.now()
        period.save()
        return period

    @classmethod
    @transaction.atomic
    def reopen_period(cls, period: AccountingPeriod, user, reason: str, target_status: str = 'SOFT_CLOSED') -> AccountingPeriod:
        if not reason:
            raise ValidationError("Reason is required to reopen an accounting period.")

        old_status = period.status
        period.status = PeriodStatus.SOFT_CLOSED if target_status == 'SOFT_CLOSED' else PeriodStatus.OPEN
        period.reopened_by = user
        period.reopened_at = timezone.now()
        period.save()

        # Record audit exception
        ControlException.objects.create(
            company=period.company,
            period=period,
            exception_type=ControlExceptionType.PERIOD_CLOSE_BLOCKER,
            title=f"Period Reopened ({old_status} -> {period.status})",
            description=f"Reopened by {user.email if hasattr(user, 'email') else user}. Reason: {reason}",
            severity=ControlExceptionSeverity.WARNING,
            status=ControlExceptionStatus.OPEN
        )

        return period
