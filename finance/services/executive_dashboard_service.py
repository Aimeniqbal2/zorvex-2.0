"""
finance/services/executive_dashboard_service.py
Authoritative Executive Finance Dashboard & Analytics Consolidation Engine for Zorvex ERP 2.0.
Consolidates authoritative metrics from GL, AR, AP, Treasury, Payroll, Tax, Profitability, and Financial Controls.
"""

from decimal import Decimal
from datetime import date, datetime, timedelta
from typing import Dict, Any, List
from django.db.models import Sum, Q, Count, F
from django.utils import timezone

from finance.models import (
    ChartOfAccount, AccountType, JournalEntry, JournalEntryLine, JournalStatus,
    BankAccount, FinancialVoucher, Cheque, TaxTransaction, TaxPaymentVoucher,
    ControlException, SubledgerReconciliationSnapshot, AccountingPeriod, PeriodStatus,
    FiscalYear, CashCount, SalaryPaymentBatch, SalaryPaymentBatchStatus, PayrollAccountingIntegration
)
from billing.models import ClientInvoice, ClientReceipt, RecoveryStatus
from purchasing.models import ProcurementDocument, VendorPayment, VendorCreditNote


class ExecutiveFinanceDashboardService:
    """
    Consolidates executive-level financial KPIs, health status, trend analytics,
    receivables/payables snapshots, payroll & tax compliance, treasury position,
    profitability, accounting health, and actionable queue items.
    """

    @classmethod
    def get_executive_dashboard(cls, company, start_date: date = None, end_date: date = None) -> Dict[str, Any]:
        """
        Main entry point for Executive Finance Dashboard KPIs and Snapshots.
        """
        if not start_date:
            today = date.today()
            start_date = date(today.year, today.month, 1)
        if not end_date:
            end_date = date.today()

        from finance.services.financial_statements_service import FinancialStatementsService
        from finance.services.subledger_reconciliation_service import SubledgerReconciliationService
        from finance.services.posting_service import AccountingPostingService

        # 1. P&L Overview (from GL)
        pnl = FinancialStatementsService.get_profit_and_loss(company, start_date=start_date, end_date=end_date)
        totals = pnl.get('totals', {})
        revenue_this_period = Decimal(str(totals.get('total_revenue', 0)))
        gross_profit = Decimal(str(totals.get('gross_profit', 0)))
        net_profit = Decimal(str(totals.get('net_profit', 0)))
        gross_margin_pct = Decimal(str(totals.get('gross_margin_pct', 0)))
        net_margin_pct = Decimal(str(totals.get('net_margin_pct', 0)))
        opex = Decimal(str(totals.get('total_operating_expenses', 0)))

        # 2. Receivables Overview (from billing)
        invoices = ClientInvoice.objects.filter(company=company, is_deleted=False)
        total_ar = invoices.aggregate(s=Sum(F('grand_total') - F('paid_amount')))['s'] or Decimal('0.0000')
        overdue_ar = invoices.filter(due_date__lt=date.today(), status__in=['ISSUED', 'PARTIALLY_PAID']).aggregate(s=Sum(F('grand_total') - F('paid_amount')))['s'] or Decimal('0.0000')
        
        receipts_period = ClientReceipt.objects.filter(
            company=company,
            receipt_date__gte=start_date,
            receipt_date__lte=end_date,
            is_deleted=False
        ).aggregate(s=Sum('amount'))['s'] or Decimal('0.0000')

        # 3. Payables Overview (from purchasing)
        bills = ProcurementDocument.objects.filter(
            company=company,
            document_type='VENDOR_BILL',
            is_deleted=False
        )
        total_ap = Decimal('0.0000')
        overdue_ap = Decimal('0.0000')
        for b in bills:
            bal = b.total_amount - (b.paid_amount or Decimal('0.0000'))
            if bal > 0:
                total_ap += bal
                if b.due_date and b.due_date < date.today():
                    overdue_ap += bal

        vendor_payments_period = VendorPayment.objects.filter(
            company=company,
            payment_date__gte=start_date,
            payment_date__lte=end_date,
            is_deleted=False
        ).aggregate(s=Sum('amount'))['s'] or Decimal('0.0000')

        # 4. Payroll Overview (from S-4G Payroll accounting)
        integrations = PayrollAccountingIntegration.objects.filter(company=company)
        payroll_payable = integrations.exclude(status='POSTED').aggregate(s=Sum('net_payroll_payable'))['s'] or Decimal('0.0000')
        salary_disbursed_period = integrations.filter(
            status='POSTED',
            created_at__date__gte=start_date,
            created_at__date__lte=end_date
        ).aggregate(s=Sum('total_paid'))['s'] or Decimal('0.0000')
        outstanding_payroll_liability = integrations.aggregate(s=Sum('remaining_liability'))['s'] or Decimal('0.0000')

        # 5. Treasury Overview (from finance BankAccount)
        bank_accounts = BankAccount.objects.filter(company=company, is_deleted=False)
        total_cash_bank_balance = bank_accounts.aggregate(s=Sum('current_balance'))['s'] or Decimal('0.0000')

        cash_in_lines = JournalEntryLine.objects.filter(
            journal_entry__company=company,
            journal_entry__status=JournalStatus.POSTED,
            journal_entry__posting_date__gte=start_date,
            journal_entry__posting_date__lte=end_date,
            account__account_type=AccountType.ASSET,
            account__account_code__startswith='11',
            is_deleted=False
        )
        cash_in = cash_in_lines.aggregate(s=Sum('debit'))['s'] or Decimal('0.0000')
        cash_out = cash_in_lines.aggregate(s=Sum('credit'))['s'] or Decimal('0.0000')

        # 6. Tax Overview
        tax_txns = TaxTransaction.objects.filter(company=company, is_deleted=False)
        output_tax = tax_txns.filter(tax_code__tax_category='OUTPUT_TAX').aggregate(s=Sum('tax_amount'))['s'] or Decimal('0.0000')
        tax_recoverable = tax_txns.filter(tax_code__tax_category='INPUT_TAX', tax_code__recoverability='RECOVERABLE').aggregate(s=Sum('tax_amount'))['s'] or Decimal('0.0000')
        tax_paid_period = TaxPaymentVoucher.objects.filter(
            company=company,
            payment_date__gte=start_date,
            payment_date__lte=end_date
        ).aggregate(s=Sum('amount'))['s'] or Decimal('0.0000')
        tax_payable = max(Decimal('0.0000'), output_tax - tax_recoverable - tax_paid_period)

        # 7. Operational & Accounting Health Metrics
        queue = AccountingPostingService.get_posting_queue(company)
        unposted_count = len(queue)

        recon_exceptions = ControlException.objects.filter(company=company, status='OPEN').count()

        current_period = AccountingPeriod.objects.filter(
            company=company,
            start_date__lte=date.today(),
            end_date__gte=date.today(),
            is_deleted=False
        ).first()
        period_close_status = current_period.status if current_period else 'NO_PERIOD'

        return {
            'period': {
                'start_date': start_date,
                'end_date': end_date,
                'current_period_name': str(current_period) if current_period else 'N/A',
                'period_close_status': period_close_status
            },
            'kpis': {
                'revenue_this_period': revenue_this_period,
                'gross_profit': gross_profit,
                'net_profit': net_profit,
                'gross_margin_percentage': gross_margin_pct,
                'net_margin_percentage': net_margin_pct,
                'operating_expenses': opex,
                'accounts_receivable': total_ar,
                'overdue_receivables': overdue_ar,
                'collections_this_period': receipts_period,
                'accounts_payable': total_ap,
                'overdue_payables': overdue_ap,
                'vendor_payments_this_period': vendor_payments_period,
                'payroll_payable': payroll_payable,
                'salary_disbursed_period': salary_disbursed_period,
                'outstanding_payroll_liability': outstanding_payroll_liability,
                'cash_bank_balance': total_cash_bank_balance,
                'cash_in': cash_in,
                'cash_out': cash_out,
                'tax_payable': tax_payable,
                'tax_recoverable': tax_recoverable,
                'tax_paid_period': tax_paid_period,
                'unposted_accounting_items': unposted_count,
                'reconciliation_exceptions': recon_exceptions,
            }
        }

    @classmethod
    def get_financial_health_summary(cls, company) -> Dict[str, Any]:
        """
        Derives overall health status for Liquidity, AR, AP, Payroll, Tax, GL, Bank Recon, and Period Close.
        Returns statuses: HEALTHY, ATTENTION, CRITICAL.
        """
        bank_accounts = BankAccount.objects.filter(company=company, is_deleted=False)
        total_cash = bank_accounts.aggregate(s=Sum('current_balance'))['s'] or Decimal('0.0000')
        invoices = ClientInvoice.objects.filter(company=company, is_deleted=False)
        total_ar = invoices.aggregate(s=Sum(F('grand_total') - F('paid_amount')))['s'] or Decimal('0.0000')
        overdue_ar = invoices.filter(due_date__lt=date.today(), status__in=['ISSUED', 'PARTIALLY_PAID']).aggregate(s=Sum(F('grand_total') - F('paid_amount')))['s'] or Decimal('0.0000')

        liquidity_status = 'HEALTHY'
        if total_cash < Decimal('10000.0000'):
            liquidity_status = 'CRITICAL'
        elif total_cash < Decimal('50000.0000'):
            liquidity_status = 'ATTENTION'

        ar_status = 'HEALTHY'
        if total_ar > 0:
            overdue_ratio = overdue_ar / total_ar
            if overdue_ratio > Decimal('0.40'):
                ar_status = 'CRITICAL'
            elif overdue_ratio > Decimal('0.15'):
                ar_status = 'ATTENTION'

        bills = ProcurementDocument.objects.filter(company=company, document_type='VENDOR_BILL', is_deleted=False)
        total_ap = Decimal('0.0000')
        overdue_ap = Decimal('0.0000')
        for b in bills:
            bal = b.total_amount - (b.paid_amount or Decimal('0.0000'))
            if bal > 0:
                total_ap += bal
                if b.due_date and b.due_date < date.today():
                    overdue_ap += bal

        ap_status = 'HEALTHY'
        if total_ap > 0:
            if overdue_ap / total_ap > Decimal('0.30'):
                ap_status = 'CRITICAL'
            elif overdue_ap / total_ap > Decimal('0.10'):
                ap_status = 'ATTENTION'

        payroll_integrations = PayrollAccountingIntegration.objects.filter(company=company)
        failed_batches = SalaryPaymentBatch.objects.filter(company=company, status='FAILED').count()
        payroll_status = 'HEALTHY'
        if failed_batches > 0:
            payroll_status = 'CRITICAL'
        elif payroll_integrations.filter(status='POSTED').exists():
            payroll_status = 'ATTENTION'

        unfiled_vouchers = TaxPaymentVoucher.objects.filter(company=company, status='DRAFT').count()
        tax_status = 'HEALTHY'
        if unfiled_vouchers > 5:
            tax_status = 'CRITICAL'
        elif unfiled_vouchers > 0:
            tax_status = 'ATTENTION'

        unposted = JournalEntry.objects.filter(company=company, status=JournalStatus.DRAFT).count()
        gl_status = 'HEALTHY'
        if unposted > 20:
            gl_status = 'CRITICAL'
        elif unposted > 0:
            gl_status = 'ATTENTION'

        open_exceptions = ControlException.objects.filter(company=company, status='OPEN', exception_type='BANK_RECONCILIATION_VARIANCE').count()
        bank_recon_status = 'HEALTHY'
        if open_exceptions > 5:
            bank_recon_status = 'CRITICAL'
        elif open_exceptions > 0:
            bank_recon_status = 'ATTENTION'

        current_period = AccountingPeriod.objects.filter(company=company, start_date__lte=date.today(), end_date__gte=date.today(), is_deleted=False).first()
        period_close_status = 'HEALTHY'
        if current_period:
            if current_period.status in ['CLOSED', 'LOCKED']:
                period_close_status = 'HEALTHY'
            elif current_period.status == 'SOFT_CLOSED':
                period_close_status = 'ATTENTION'

        return {
            'liquidity': {'status': liquidity_status, 'cash_balance': total_cash},
            'receivables_health': {'status': ar_status, 'total_ar': total_ar, 'overdue_ar': overdue_ar},
            'payables_health': {'status': ap_status, 'total_ap': total_ap, 'overdue_ap': overdue_ap},
            'payroll_status': {'status': payroll_status, 'failed_batches': failed_batches},
            'tax_compliance': {'status': tax_status, 'unfiled_vouchers': unfiled_vouchers},
            'gl_posting_status': {'status': gl_status, 'unposted_queue_count': unposted},
            'bank_reconciliation': {'status': bank_recon_status, 'open_exceptions': open_exceptions},
            'period_close_status': {'status': period_close_status, 'current_status': current_period.status if current_period else 'NO_PERIOD'}
        }

    @classmethod
    def get_revenue_expense_trend(cls, company) -> List[Dict[str, Any]]:
        """
        Derives monthly trend views for Revenue, Cost of Services, Gross Profit, Operating Expenses, Net Profit,
        Cash In, and Cash Out directly from POSTED GL JournalEntryLine records over the last 6 months.
        """
        today = date.today()
        trends = []

        for i in range(5, -1, -1):
            # Calculate month start and end
            month_date = today.replace(day=1) - timedelta(days=i * 30)
            month_start = date(month_date.year, month_date.month, 1)
            if month_date.month == 12:
                month_end = date(month_date.year, 12, 31)
            else:
                next_month = date(month_date.year, month_date.month + 1, 1)
                month_end = next_month - timedelta(days=1)

            from finance.services.financial_statements_service import FinancialStatementsService
            pnl = FinancialStatementsService.get_profit_and_loss(company, start_date=month_start, end_date=month_end)
            totals = pnl.get('totals', {})
            rev = Decimal(str(totals.get('total_revenue', 0)))
            cos = Decimal(str(totals.get('total_cost_of_service', 0)))
            gp = Decimal(str(totals.get('gross_profit', 0)))
            opex = Decimal(str(totals.get('total_operating_expenses', 0)))
            np = Decimal(str(totals.get('net_profit', 0)))

            lines = JournalEntryLine.objects.filter(
                journal_entry__company=company,
                journal_entry__status=JournalStatus.POSTED,
                journal_entry__posting_date__gte=month_start,
                journal_entry__posting_date__lte=month_end,
                account__account_type=AccountType.ASSET,
                account__account_code__startswith='11',
                is_deleted=False
            )
            c_in = lines.aggregate(s=Sum('debit'))['s'] or Decimal('0.0000')
            c_out = lines.aggregate(s=Sum('credit'))['s'] or Decimal('0.0000')

            trends.append({
                'month_name': month_start.strftime('%b %Y'),
                'start_date': month_start,
                'end_date': month_end,
                'revenue': rev,
                'cost_of_services': cos,
                'gross_profit': gp,
                'operating_expenses': opex,
                'net_profit': np,
                'cash_in': c_in,
                'cash_out': c_out
            })

        return trends

    @classmethod
    def get_receivables_snapshot(cls, company) -> Dict[str, Any]:
        """
        Surfaces S-4C Receivables snapshot (AR aging buckets, promises, disputes).
        """
        invoices = ClientInvoice.objects.filter(company=company, is_deleted=False)
        today = date.today()

        total_ar = invoices.aggregate(s=Sum(F('grand_total') - F('paid_amount')))['s'] or Decimal('0.0000')
        current = Decimal('0.0000')
        b_1_30 = Decimal('0.0000')
        b_31_60 = Decimal('0.0000')
        b_61_90 = Decimal('0.0000')
        b_90_plus = Decimal('0.0000')

        disputed_count = invoices.filter(recovery_status=getattr(RecoveryStatus, 'DISPUTED', 'DISPUTED')).count()
        broken_promises_count = invoices.filter(recovery_status=getattr(RecoveryStatus, 'PROMISE_BROKEN', 'PROMISE_BROKEN')).count()
        upcoming_followups = invoices.filter(recovery_status=getattr(RecoveryStatus, 'FOLLOW_UP_SCHEDULED', 'FOLLOW_UP_SCHEDULED')).count()

        for inv in invoices.filter(status__in=['ISSUED', 'PARTIALLY_PAID']):
            bal = inv.outstanding_amount
            if bal > 0:
                due = inv.due_date or inv.invoice_date or today
                days_overdue = (today - due).days

                if days_overdue <= 0:
                    current += bal
                elif days_overdue <= 30:
                    b_1_30 += bal
                elif days_overdue <= 60:
                    b_31_60 += bal
                elif days_overdue <= 90:
                    b_61_90 += bal
                else:
                    b_90_plus += bal

        return {
            'total_ar': total_ar,
            'current': current,
            'b_1_30': b_1_30,
            'b_31_60': b_31_60,
            'b_61_90': b_61_90,
            'b_90_plus': b_90_plus,
            'disputed_count': disputed_count,
            'broken_promises_count': broken_promises_count,
            'upcoming_followups_count': upcoming_followups
        }

    @classmethod
    def get_payables_snapshot(cls, company) -> Dict[str, Any]:
        """
        Surfaces S-3/S-4F Payables snapshot.
        """
        bills = ProcurementDocument.objects.filter(company=company, document_type='VENDOR_BILL', is_deleted=False)
        today = date.today()

        total_ap = Decimal('0.0000')
        current_ap = Decimal('0.0000')
        overdue_ap = Decimal('0.0000')
        due_soon_ap = Decimal('0.0000')

        for b in bills:
            bal = b.total_amount - (b.paid_amount or Decimal('0.0000'))
            if bal > 0:
                total_ap += bal
                if b.due_date:
                    days = (b.due_date - today).days
                    if days < 0:
                        overdue_ap += bal
                    elif days <= 7:
                        due_soon_ap += bal
                    else:
                        current_ap += bal
                else:
                    current_ap += bal

        vendor_credits = VendorCreditNote.objects.filter(company=company, is_deleted=False)
        total_vendor_credits = vendor_credits.aggregate(s=Sum('amount'))['s'] or Decimal('0.0000')
        unallocated_vendor_credits = vendor_credits.filter(status='ISSUED').aggregate(s=Sum('amount'))['s'] or Decimal('0.0000')

        return {
            'total_ap': total_ap,
            'current_ap': current_ap,
            'overdue_ap': overdue_ap,
            'due_soon_ap': due_soon_ap,
            'total_vendor_credits': total_vendor_credits,
            'unallocated_vendor_credits': unallocated_vendor_credits
        }

    @classmethod
    def get_payroll_snapshot(cls, company) -> Dict[str, Any]:
        """
        Surfaces S-4G Payroll finance snapshot.
        """
        integrations = PayrollAccountingIntegration.objects.filter(company=company)
        batches = SalaryPaymentBatch.objects.filter(company=company)

        finalized_count = integrations.filter(status__in=['APPROVED', 'POSTED']).count()
        net_payroll = integrations.aggregate(s=Sum('net_payroll_payable'))['s'] or Decimal('0.0000')
        paid_amount = integrations.aggregate(s=Sum('total_paid'))['s'] or Decimal('0.0000')
        outstanding_liability = integrations.aggregate(s=Sum('remaining_liability'))['s'] or Decimal('0.0000')

        successful_transfers = batches.filter(status='COMPLETED').count()
        failed_transfers = batches.filter(status='FAILED').count()
        active_batches = batches.filter(status__in=['DRAFT', 'READY_FOR_PAYMENT', 'PROCESSING']).count()

        return {
            'finalized_payroll_count': finalized_count,
            'net_payroll_amount': net_payroll,
            'paid_amount': paid_amount,
            'outstanding_liability': outstanding_liability,
            'successful_transfers': successful_transfers,
            'failed_transfers': failed_transfers,
            'active_batches': active_batches
        }

    @classmethod
    def get_tax_snapshot(cls, company) -> Dict[str, Any]:
        """
        Surfaces S-4H Tax snapshot.
        """
        txns = TaxTransaction.objects.filter(company=company, is_deleted=False)
        output_tax = txns.filter(tax_code__tax_category='OUTPUT_TAX').aggregate(s=Sum('tax_amount'))['s'] or Decimal('0.0000')
        recoverable_input_tax = txns.filter(tax_code__tax_category='INPUT_TAX', tax_code__recoverability='RECOVERABLE').aggregate(s=Sum('tax_amount'))['s'] or Decimal('0.0000')
        wht_payable = txns.filter(tax_code__tax_category='WITHHOLDING_PAYABLE').aggregate(s=Sum('tax_amount'))['s'] or Decimal('0.0000')
        wht_receivable = txns.filter(tax_code__tax_category='WITHHOLDING_RECEIVABLE').aggregate(s=Sum('tax_amount'))['s'] or Decimal('0.0000')
        payroll_tax = txns.filter(tax_code__tax_category='PAYROLL_TAX').aggregate(s=Sum('tax_amount'))['s'] or Decimal('0.0000')

        unfiled_vouchers = TaxPaymentVoucher.objects.filter(company=company, status='DRAFT').count()
        net_tax_position = output_tax - recoverable_input_tax + wht_payable - wht_receivable

        return {
            'output_tax': output_tax,
            'recoverable_input_tax': recoverable_input_tax,
            'net_tax_position': net_tax_position,
            'vendor_wht_payable': wht_payable,
            'client_wht_receivable': wht_receivable,
            'payroll_tax': payroll_tax,
            'unfiled_tax_vouchers_count': unfiled_vouchers
        }

    @classmethod
    def get_treasury_snapshot(cls, company) -> Dict[str, Any]:
        """
        Surfaces S-4D/S-4K Treasury snapshot.
        Distinguishes operational balances from uncleared and unreconciled items.
        """
        accounts = BankAccount.objects.filter(company=company, is_deleted=False)
        bank_accounts_count = accounts.filter(account_type='BANK').count()
        cash_accounts_count = accounts.filter(account_type='CASH').count()
        petty_cash_count = accounts.filter(account_type='PETTY_CASH').count()
        wallets_count = accounts.filter(account_type='WALLET').count()

        operational_balance = accounts.aggregate(s=Sum('current_balance'))['s'] or Decimal('0.0000')

        uncleared_cheques = Cheque.objects.filter(company=company, status='ISSUED').aggregate(s=Sum('amount'))['s'] or Decimal('0.0000')
        
        from finance.models import BankStatementLine
        unreconciled_bank_lines = BankStatementLine.objects.filter(
            statement__company=company,
            match_status='UNMATCHED'
        ).count()

        cash_count_variances = CashCount.objects.filter(company=company, status='VARIANCE_FLAGGED').count()

        return {
            'bank_accounts_count': bank_accounts_count,
            'cash_accounts_count': cash_accounts_count,
            'petty_cash_count': petty_cash_count,
            'wallets_count': wallets_count,
            'operational_balance': operational_balance,
            'uncleared_cheques_amount': uncleared_cheques,
            'unreconciled_bank_lines_count': unreconciled_bank_lines,
            'cash_count_variances_count': cash_count_variances
        }

    @classmethod
    def get_profitability_snapshot(cls, company) -> Dict[str, Any]:
        """
        Surfaces S-4J Profitability snapshot.
        """
        from finance.services.profitability_service import ProfitabilityService

        site_prof = ProfitabilityService.get_site_profitability(company)
        client_prof = ProfitabilityService.get_client_profitability(company)
        contract_prof = ProfitabilityService.get_contract_profitability(company)
        unattributed = ProfitabilityService.get_unattributed_financial_lines(company)

        top_clients = sorted(client_prof, key=lambda x: x.get('net_profit', 0), reverse=True)[:3]
        top_contracts = sorted(contract_prof, key=lambda x: x.get('net_profit', 0), reverse=True)[:3]
        top_sites = sorted(site_prof, key=lambda x: x.get('net_site_contribution', 0), reverse=True)[:3]

        low_margin_contracts = [c for c in contract_prof if c.get('management_status') == 'LOW_MARGIN' or c.get('status_badge') == 'LOW_MARGIN']
        loss_sites = [s for s in site_prof if s.get('net_site_contribution', Decimal('0')) < Decimal('0.0000')]

        return {
            'most_profitable_clients': top_clients,
            'most_profitable_contracts': top_contracts,
            'most_profitable_sites': top_sites,
            'low_margin_contracts_count': len(low_margin_contracts),
            'loss_making_sites_count': len(loss_sites),
            'unattributed_lines_count': len(unattributed)
        }

    @classmethod
    def get_accounting_health(cls, company) -> Dict[str, Any]:
        """
        Surfaces S-4I/S-4K Accounting Health status.
        """
        from finance.services.posting_service import AccountingPostingService
        from finance.services.financial_statements_service import FinancialStatementsService
        from finance.services.subledger_reconciliation_service import SubledgerReconciliationService

        tb = AccountingPostingService.get_trial_balance(company)
        tb_diff = Decimal(str(tb['totals']['difference']))
        tb_status = 'BALANCED' if tb_diff == Decimal('0.0000') else 'UNBALANCED'

        bs = FinancialStatementsService.get_balance_sheet(company)
        bs_status = 'BALANCED' if bs['is_balanced'] else 'UNBALANCED'

        current_period = AccountingPeriod.objects.filter(company=company, start_date__lte=date.today(), end_date__gte=date.today(), is_deleted=False).first()
        sub_summary = SubledgerReconciliationService.get_subledger_reconciliation_summary(company, period=current_period) if current_period else {}

        unposted = JournalEntry.objects.filter(company=company, status=JournalStatus.DRAFT).count()
        reversed_count = JournalEntry.objects.filter(company=company, status=JournalStatus.REVERSED).count()

        return {
            'trial_balance_status': tb_status,
            'trial_balance_difference': tb_diff,
            'balance_sheet_status': bs_status,
            'balance_sheet_difference': bs.get('equation_difference', Decimal('0.0000')),
            'subledger_reconciliation': sub_summary,
            'unposted_queue_count': unposted,
            'reversed_journals_count': reversed_count,
            'current_period_name': str(current_period) if current_period else 'N/A',
            'current_period_status': current_period.status if current_period else 'NO_PERIOD'
        }

    @classmethod
    def get_action_center(cls, company) -> List[Dict[str, Any]]:
        """
        Generates actionable items queue with navigation routing targets.
        Does NOT auto-execute financial actions.
        """
        actions = []

        unissued_sheets = ClientInvoice.objects.filter(company=company, status='DRAFT').count()
        if unissued_sheets > 0:
            actions.append({
                'id': 'invoices_awaiting_issue',
                'title': 'Draft Client Invoices Awaiting Issue',
                'count': unissued_sheets,
                'severity': 'MEDIUM',
                'category': 'BILLING',
                'target_tab': 'billing',
                'description': f"{unissued_sheets} draft client invoice(s) are waiting to be posted and issued."
            })

        overdue_invs = ClientInvoice.objects.filter(company=company, due_date__lt=date.today(), status__in=['ISSUED', 'PARTIALLY_PAID']).count()
        if overdue_invs > 0:
            actions.append({
                'id': 'overdue_receivables',
                'title': 'Overdue Client Invoices Requiring Recovery',
                'count': overdue_invs,
                'severity': 'HIGH',
                'category': 'RECEIVABLES',
                'target_tab': 'ar_recovery',
                'description': f"{overdue_invs} invoice(s) are overdue and require payment collection follow-up."
            })

        followups_due = ClientInvoice.objects.filter(company=company, recovery_status=RecoveryStatus.UNDER_FOLLOWUP).count()
        if followups_due > 0:
            actions.append({
                'id': 'recovery_followups_due',
                'title': 'Client Payment Recovery Follow-Ups Scheduled',
                'count': followups_due,
                'severity': 'MEDIUM',
                'category': 'RECEIVABLES',
                'target_tab': 'ar_recovery',
                'description': f"{followups_due} collection follow-up call(s) scheduled for today."
            })

        blocked_bills = ProcurementDocument.objects.filter(company=company, document_type='VENDOR_BILL', status='REJECTED').count()
        if blocked_bills > 0:
            actions.append({
                'id': 'vendor_bills_blocked',
                'title': 'Vendor Bills Blocked / Rejected in Purchasing',
                'count': blocked_bills,
                'severity': 'HIGH',
                'category': 'PURCHASING',
                'target_tab': 'purchasing_integration',
                'description': f"{blocked_bills} vendor bill(s) rejected during 3-way matching."
            })

        failed_batches = SalaryPaymentBatch.objects.filter(company=company, status='FAILED').count()
        if failed_batches > 0:
            actions.append({
                'id': 'payroll_batch_failures',
                'title': 'Salary Payment Batches Failed',
                'count': failed_batches,
                'severity': 'CRITICAL',
                'category': 'PAYROLL',
                'target_tab': 'payroll_finance',
                'description': f"{failed_batches} salary disbursement batch(es) encountered processing failures."
            })

        unfiled_tax = TaxPaymentVoucher.objects.filter(company=company, status='DRAFT').count()
        if unfiled_tax > 0:
            actions.append({
                'id': 'tax_payments_due',
                'title': 'Draft Tax Payment Vouchers Pending Submission',
                'count': unfiled_tax,
                'severity': 'HIGH',
                'category': 'TAX',
                'target_tab': 'tax_management',
                'description': f"{unfiled_tax} tax payment voucher(s) are in draft status."
            })

        unposted_events = JournalEntry.objects.filter(company=company, status=JournalStatus.DRAFT).count()
        if unposted_events > 0:
            actions.append({
                'id': 'unposted_accounting_events',
                'title': 'Draft Journal Entries in Posting Queue',
                'count': unposted_events,
                'severity': 'MEDIUM',
                'category': 'GENERAL_LEDGER',
                'target_tab': 'general_ledger',
                'description': f"{unposted_events} journal entry(ies) in draft queue awaiting posting."
            })

        from finance.models import BankStatementLine
        unreconciled_lines = BankStatementLine.objects.filter(statement__company=company, match_status='UNMATCHED').count()
        if unreconciled_lines > 0:
            actions.append({
                'id': 'unreconciled_bank_statements',
                'title': 'Unmatched Bank Statement Lines',
                'count': unreconciled_lines,
                'severity': 'MEDIUM',
                'category': 'CONTROLS',
                'target_tab': 'financial_controls',
                'description': f"{unreconciled_lines} bank statement line(s) pending reconciliation."
            })

        from finance.services.period_close_service import PeriodCloseService
        current_period = AccountingPeriod.objects.filter(company=company, start_date__lte=date.today(), end_date__gte=date.today(), is_deleted=False).first()
        if current_period:
            readiness = PeriodCloseService.get_readiness(current_period)
            if readiness['readiness_status'] == 'BLOCKED':
                actions.append({
                    'id': 'period_close_blockers',
                    'title': f"Period Close Blockers in {current_period.name}",
                    'count': 1,
                    'severity': 'HIGH',
                    'category': 'CONTROLS',
                    'target_tab': 'financial_controls',
                    'description': f"Period close checklist has failing blocker checks."
                })

        from finance.services.profitability_service import ProfitabilityService
        unattributed = ProfitabilityService.get_unattributed_financial_lines(company)
        if len(unattributed) > 0:
            actions.append({
                'id': 'unattributed_profitability_lines',
                'title': 'Unattributed Revenue / Expense GL Lines',
                'count': len(unattributed),
                'severity': 'LOW',
                'category': 'PROFITABILITY',
                'target_tab': 'profitability',
                'description': f"{len(unattributed)} posted GL line(s) missing site/contract dimensions."
            })

        return actions
