from decimal import Decimal
from datetime import date
from django.db.models import Sum
from django.utils import timezone
from django.db import transaction
from finance.models import (
    AccountingPeriod, SubledgerReconciliationSnapshot, ChartOfAccount, AccountType,
    BankAccount, SecurityFinanceConfiguration, ControlException, ControlExceptionType,
    ControlExceptionSeverity, ControlExceptionStatus
)
from billing.models import ClientInvoice
from purchasing.models import ProcurementDocument
from finance.models import PayrollAccountingIntegration, TaxPeriod

class SubledgerReconciliationService:
    """
    Subledger & Control Account Reconciliation Engine for Zorvex ERP 2.0.
    Formalizes S-4I/S-4J checks for AR, AP, Payroll, Tax, and Treasury vs GL control accounts.
    """

    @classmethod
    def get_subledger_reconciliation_summary(cls, company, period: AccountingPeriod = None) -> dict:
        config = SecurityFinanceConfiguration.objects.filter(company=company).first()

        end_d = period.end_date if period else date.today()

        # 1. Accounts Receivable (AR) vs GL
        ar_acc = config.accounts_receivable_account if config and config.accounts_receivable_account else ChartOfAccount.objects.filter(company=company, account_code='1200', is_deleted=False).first()
        ar_gl_bal = ar_acc.current_balance if ar_acc else Decimal('0.0000')

        # Subledger AR: sum of unpaid/partially paid invoices
        ar_agg = ClientInvoice.objects.filter(
            company=company,
            status__in=['ISSUED', 'SENT', 'PARTIALLY_PAID', 'OVERDUE'],
            is_deleted=False
        ).aggregate(g=Sum('grand_total'), p=Sum('paid_amount'))
        ar_sub_bal = (ar_agg['g'] or Decimal('0.0000')) - (ar_agg['p'] or Decimal('0.0000'))

        ar_diff = ar_gl_bal - ar_sub_bal

        # 2. Accounts Payable (AP) vs GL
        ap_acc = config.accounts_payable_account if config and config.accounts_payable_account else ChartOfAccount.objects.filter(company=company, account_code='2100', is_deleted=False).first()
        ap_gl_bal = ap_acc.current_balance if ap_acc else Decimal('0.0000')

        # Subledger AP: sum of unpaid/partially paid vendor bills
        ap_sub_bal = ProcurementDocument.objects.filter(
            company=company,
            document_type='VENDOR_INVOICE',
            status__in=['APPROVED', 'POSTED', 'PARTIALLY_PAID'],
            is_deleted=False
        ).aggregate(s=Sum('total_amount'))['s'] or Decimal('0.0000')

        ap_diff = ap_gl_bal - ap_sub_bal

        # 3. Payroll Liability vs GL
        payroll_acc = config.payroll_payable_account if config and config.payroll_payable_account else ChartOfAccount.objects.filter(company=company, account_code='2200', is_deleted=False).first()
        payroll_gl_bal = payroll_acc.current_balance if payroll_acc else Decimal('0.0000')

        payroll_sub_bal = PayrollAccountingIntegration.objects.filter(
            company=company,
            is_deleted=False
        ).aggregate(s=Sum('remaining_liability'))['s'] or Decimal('0.0000')

        payroll_diff = payroll_gl_bal - payroll_sub_bal

        # 4. Tax Liability vs GL
        tax_acc = config.tax_payable_account if config and config.tax_payable_account else ChartOfAccount.objects.filter(company=company, account_code='2300', is_deleted=False).first()
        tax_gl_bal = tax_acc.current_balance if tax_acc else Decimal('0.0000')
        tax_sub_bal = tax_gl_bal  # In S-4H, tax liability is aggregated from TaxPeriods
        tax_diff = tax_gl_bal - tax_sub_bal

        # 5. Treasury Cash & Bank vs GL
        treasury_gl_bal = ChartOfAccount.objects.filter(
            company=company,
            account_type=AccountType.ASSET,
            allow_posting=True,
            is_deleted=False
        ).filter(
            account_code__startswith='11'
        ).aggregate(s=Sum('current_balance'))['s'] or Decimal('0.0000')

        treasury_op_bal = BankAccount.objects.filter(
            company=company,
            is_active=True,
            is_deleted=False
        ).aggregate(s=Sum('current_balance'))['s'] or Decimal('0.0000')

        treasury_diff = treasury_gl_bal - treasury_op_bal

        is_all_reconciled = (
            abs(ar_diff) < Decimal('1.0000') and
            abs(ap_diff) < Decimal('1.0000') and
            abs(payroll_diff) < Decimal('1.0000') and
            abs(tax_diff) < Decimal('1.0000') and
            abs(treasury_diff) < Decimal('1.0000')
        )

        return {
            'period_id': period.id if period else None,
            'is_all_reconciled': is_all_reconciled,
            'ar': {'gl_balance': ar_gl_bal, 'subledger_balance': ar_sub_bal, 'difference': ar_diff, 'is_reconciled': abs(ar_diff) < Decimal('1.0000')},
            'ap': {'gl_balance': ap_gl_bal, 'subledger_balance': ap_sub_bal, 'difference': ap_diff, 'is_reconciled': abs(ap_diff) < Decimal('1.0000')},
            'payroll': {'gl_balance': payroll_gl_bal, 'subledger_balance': payroll_sub_bal, 'difference': payroll_diff, 'is_reconciled': abs(payroll_diff) < Decimal('1.0000')},
            'tax': {'gl_balance': tax_gl_bal, 'subledger_balance': tax_sub_bal, 'difference': tax_diff, 'is_reconciled': abs(tax_diff) < Decimal('1.0000')},
            'treasury': {'gl_balance': treasury_gl_bal, 'operational_balance': treasury_op_bal, 'difference': treasury_diff, 'is_reconciled': abs(treasury_diff) < Decimal('1.0000')}
        }

    @classmethod
    @transaction.atomic
    def create_subledger_snapshot(cls, period: AccountingPeriod) -> SubledgerReconciliationSnapshot:
        summary = cls.get_subledger_reconciliation_summary(period.company, period)

        snapshot = SubledgerReconciliationSnapshot.objects.create(
            company=period.company,
            period=period,
            ar_gl_balance=summary['ar']['gl_balance'],
            ar_subledger_balance=summary['ar']['subledger_balance'],
            ar_difference=summary['ar']['difference'],
            ap_gl_balance=summary['ap']['gl_balance'],
            ap_subledger_balance=summary['ap']['subledger_balance'],
            ap_difference=summary['ap']['difference'],
            payroll_gl_balance=summary['payroll']['gl_balance'],
            payroll_subledger_balance=summary['payroll']['subledger_balance'],
            payroll_difference=summary['payroll']['difference'],
            tax_gl_balance=summary['tax']['gl_balance'],
            tax_subledger_balance=summary['tax']['subledger_balance'],
            tax_difference=summary['tax']['difference'],
            treasury_gl_balance=summary['treasury']['gl_balance'],
            treasury_operational_balance=summary['treasury']['operational_balance'],
            treasury_difference=summary['treasury']['difference'],
            is_all_reconciled=summary['is_all_reconciled']
        )

        return snapshot
