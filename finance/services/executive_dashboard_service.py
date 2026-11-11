"""
finance/services/executive_dashboard_service.py
Authoritative Executive Finance Dashboard & Analytics Consolidation Engine for Zorvex ERP 2.0.
Consolidates authoritative metrics from GL, AR, AP, Treasury, Payroll, Tax, Profitability, and Financial Controls.
"""

from decimal import Decimal
from datetime import date, datetime, timedelta
from typing import Dict, Any, List
from django.db.models import Sum, Q, Count, F
from django.db.models.functions import TruncMonth
from django.utils import timezone

from finance.models import (
    ChartOfAccount, AccountType, JournalEntry, JournalEntryLine, JournalStatus,
    BankAccount, FinancialVoucher, Cheque, TaxTransaction, TaxPaymentVoucher,
    ControlException, SubledgerReconciliationSnapshot, AccountingPeriod, PeriodStatus,
    FiscalYear, CashCount, SalaryPaymentBatch, SalaryPaymentBatchStatus, PayrollAccountingIntegration
)
from billing.models import ClientInvoice, ClientReceipt, RecoveryStatus
from purchasing.models import ProcurementDocument, VendorPayment, VendorCreditNote, VendorPaymentAllocation


class ExecutiveFinanceDashboardService:
    """
    Consolidates executive-level financial KPIs, health status, trend analytics,
    receivables/payables snapshots, payroll & tax compliance, treasury position,
    profitability, accounting health, and actionable queue items.
    """

    @classmethod
    def _get_ap_totals(cls, company) -> Dict[str, Decimal]:
        """
        Computes total, current, due-soon, and overdue Accounts Payable in 3 flat SQL
        aggregate queries (eliminating N+1 per-bill get_invoice_payment_summary calls).
        """
        today = date.today()
        bills = list(
            ProcurementDocument.objects.filter(
                company=company,
                document_type='VENDOR_INVOICE',
                is_deleted=False,
            )
            .exclude(status__in=['CANCELLED', 'REJECTED', 'DRAFT'])
            .values('id', 'total_amount', 'due_date')
        )
        if not bills:
            zero = Decimal('0.0000')
            return {'total_ap': zero, 'current_ap': zero, 'due_soon_ap': zero, 'overdue_ap': zero}

        bill_ids = [b['id'] for b in bills]
        paid_by_inv = {
            r['invoice_id']: Decimal(str(r['s'] or 0))
            for r in VendorPaymentAllocation.objects.filter(
                invoice_id__in=bill_ids, payment__status='POSTED', is_deleted=False
            ).values('invoice_id').annotate(s=Sum('amount'))
        }
        credit_by_inv = {
            r['vendor_invoice_id']: Decimal(str(r['s'] or 0))
            for r in VendorCreditNote.objects.filter(
                vendor_invoice_id__in=bill_ids, status='POSTED', is_deleted=False
            ).values('vendor_invoice_id').annotate(s=Sum('amount'))
        }

        total_ap = Decimal('0.0000')
        current_ap = Decimal('0.0000')
        due_soon_ap = Decimal('0.0000')
        overdue_ap = Decimal('0.0000')

        for b in bills:
            orig = Decimal(str(b['total_amount'] or 0))
            net = max(Decimal('0.00'), orig - credit_by_inv.get(b['id'], Decimal('0.00')))
            bal = max(Decimal('0.00'), net - paid_by_inv.get(b['id'], Decimal('0.00')))
            if bal > 0:
                total_ap += bal
                due_d = b['due_date']
                if due_d:
                    days = (due_d - today).days
                    if days < 0:
                        overdue_ap += bal
                    elif days <= 7:
                        due_soon_ap += bal
                    else:
                        current_ap += bal
                else:
                    current_ap += bal

        return {
            'total_ap': total_ap,
            'current_ap': current_ap,
            'due_soon_ap': due_soon_ap,
            'overdue_ap': overdue_ap,
        }

    @classmethod
    def get_executive_dashboard(cls, company, start_date: date = None, end_date: date = None, ap_totals: Dict[str, Decimal] = None) -> Dict[str, Any]:
        """
        Main entry point for Executive Finance Dashboard KPIs and Snapshots.
        """
        if not start_date:
            today = date.today()
            start_date = date(today.year, today.month, 1)
        if not end_date:
            end_date = date.today()

        from finance.services.financial_statements_service import FinancialStatementsService
        from finance.services.posting_service import AccountingPostingService
        from finance.services.period_service import ensure_open_period_and_foundation
        from operations.models import DailyDutyPay

        try:
            ensure_open_period_and_foundation(company, date.today())
        except Exception:
            pass

        # 1. P&L Overview (from GL SQL aggregation, with Billing/Operations fallback)
        pnl = FinancialStatementsService.get_profit_and_loss(company, start_date=start_date, end_date=end_date)
        totals = pnl.get('totals', {})
        revenue_this_period = Decimal(str(totals.get('total_revenue', 0)))
        gross_profit = Decimal(str(totals.get('gross_profit', 0)))
        net_profit = Decimal(str(totals.get('net_profit', 0)))
        gross_margin_pct = Decimal(str(totals.get('gross_margin_pct', 0)))
        net_margin_pct = Decimal(str(totals.get('net_margin_pct', 0)))
        opex = Decimal(str(totals.get('total_operating_expenses', 0)))

        # Live subledger fallback if GL journals haven't been posted yet
        if revenue_this_period == Decimal('0.0000'):
            invoiced_rev = ClientInvoice.objects.filter(
                company=company,
                is_deleted=False,
                status__in=['ISSUED', 'SENT', 'PARTIALLY_PAID', 'PAID'],
                invoice_date__gte=start_date,
                invoice_date__lte=end_date
            ).aggregate(s=Sum('subtotal'))['s'] or Decimal('0.0000')
            if invoiced_rev == Decimal('0.0000'):
                bm = start_date.strftime('%Y-%m')
                invoiced_rev = ClientInvoice.objects.filter(
                    company=company,
                    is_deleted=False,
                    status__in=['ISSUED', 'SENT', 'PARTIALLY_PAID', 'PAID'],
                    billing_month=bm
                ).aggregate(s=Sum('subtotal'))['s'] or Decimal('0.0000')
            revenue_this_period = invoiced_rev

        # 2. Receivables Overview (single SQL aggregate)
        ar_agg = ClientInvoice.objects.filter(
            company=company,
            is_deleted=False,
            status__in=['ISSUED', 'SENT', 'PARTIALLY_PAID']
        ).aggregate(
            total_ar=Sum(F('grand_total') - F('paid_amount')),
            overdue_ar=Sum(F('grand_total') - F('paid_amount'), filter=Q(due_date__lt=date.today())),
        )
        total_ar = ar_agg['total_ar'] or Decimal('0.0000')
        overdue_ar = ar_agg['overdue_ar'] or Decimal('0.0000')

        receipts_period = ClientReceipt.objects.filter(
            company=company,
            receipt_date__gte=start_date,
            receipt_date__lte=end_date,
            is_deleted=False
        ).aggregate(s=Sum('amount'))['s'] or Decimal('0.0000')

        # 3. Payables Overview (fast bulk SQL helper)
        ap_summary = ap_totals if ap_totals is not None else cls._get_ap_totals(company)
        total_ap = ap_summary['total_ap']
        overdue_ap = ap_summary['overdue_ap']

        vendor_payments_period = VendorPayment.objects.filter(
            company=company,
            payment_date__gte=start_date,
            payment_date__lte=end_date,
            is_deleted=False
        ).exclude(status__in=['CANCELLED', 'REVERSED']).aggregate(s=Sum('amount'))['s'] or Decimal('0.0000')

        # 4. Payroll Overview (single aggregate on PayrollAccountingIntegration)
        pr_agg = PayrollAccountingIntegration.objects.filter(company=company).aggregate(
            payroll_payable=Sum('net_payroll_payable', filter=~Q(status='POSTED')),
            salary_disbursed_period=Sum(
                'total_paid',
                filter=Q(status='POSTED', created_at__date__gte=start_date, created_at__date__lte=end_date),
            ),
            outstanding_payroll_liability=Sum('remaining_liability'),
        )
        payroll_payable = pr_agg['payroll_payable'] or Decimal('0.0000')
        salary_disbursed_period = pr_agg['salary_disbursed_period'] or Decimal('0.0000')
        outstanding_payroll_liability = pr_agg['outstanding_payroll_liability'] or Decimal('0.0000')

        live_duty_wages = DailyDutyPay.objects.filter(
            company=company,
            duty_date__gte=start_date,
            duty_date__lte=end_date,
            is_deleted=False
        ).aggregate(s=Sum('payable_amount'))['s'] or Decimal('0.0000')
        if outstanding_payroll_liability == Decimal('0.0000') and live_duty_wages > Decimal('0.0000'):
            outstanding_payroll_liability = live_duty_wages
            payroll_payable = live_duty_wages

        if gross_profit == Decimal('0.0000') and (revenue_this_period > Decimal('0.0000') or live_duty_wages > Decimal('0.0000')):
            direct_cost = live_duty_wages
            gross_profit = revenue_this_period - direct_cost
            net_profit = gross_profit - opex
            if revenue_this_period > Decimal('0.0000'):
                gross_margin_pct = ((gross_profit / revenue_this_period) * Decimal('100')).quantize(Decimal('0.01'))
                net_margin_pct = ((net_profit / revenue_this_period) * Decimal('100')).quantize(Decimal('0.01'))

        # 5. Treasury Overview (from finance BankAccount & combined cash flow aggregate)
        bank_accounts = BankAccount.objects.filter(company=company, is_deleted=False)
        total_cash_bank_balance = bank_accounts.aggregate(s=Sum('current_balance'))['s'] or Decimal('0.0000')

        cash_agg = JournalEntryLine.objects.filter(
            journal_entry__company=company,
            journal_entry__status=JournalStatus.POSTED,
            journal_entry__posting_date__gte=start_date,
            journal_entry__posting_date__lte=end_date,
            account__account_type=AccountType.ASSET,
            account__account_code__startswith='11',
            is_deleted=False
        ).aggregate(c_in=Sum('debit'), c_out=Sum('credit'))
        cash_in = cash_agg['c_in'] or Decimal('0.0000')
        cash_out = cash_agg['c_out'] or Decimal('0.0000')

        # 6. Tax Overview (single conditional aggregate)
        tax_agg = TaxTransaction.objects.filter(company=company, is_deleted=False).aggregate(
            out_t=Sum('tax_amount', filter=Q(tax_code__tax_category='OUTPUT_TAX')),
            rec_t=Sum('tax_amount', filter=Q(tax_code__tax_category='INPUT_TAX', tax_code__recoverability='RECOVERABLE')),
        )
        output_tax = tax_agg['out_t'] or Decimal('0.0000')
        tax_recoverable = tax_agg['rec_t'] or Decimal('0.0000')
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
    def get_financial_health_summary(cls, company, ap_totals: Dict[str, Decimal] = None) -> Dict[str, Any]:
        """
        Derives overall health status for Liquidity, AR, AP, Payroll, Tax, GL, Bank Recon, and Period Close.
        Returns statuses: HEALTHY, ATTENTION, CRITICAL.
        """
        total_cash = BankAccount.objects.filter(company=company, is_deleted=False).aggregate(s=Sum('current_balance'))['s'] or Decimal('0.0000')
        ar_agg = ClientInvoice.objects.filter(company=company, is_deleted=False).aggregate(
            total_ar=Sum(F('grand_total') - F('paid_amount')),
            overdue_ar=Sum(F('grand_total') - F('paid_amount'), filter=Q(due_date__lt=date.today(), status__in=['ISSUED', 'PARTIALLY_PAID'])),
        )
        total_ar = ar_agg['total_ar'] or Decimal('0.0000')
        overdue_ar = ar_agg['overdue_ar'] or Decimal('0.0000')

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

        ap_summary = ap_totals if ap_totals is not None else cls._get_ap_totals(company)
        total_ap = ap_summary['total_ap']
        overdue_ap = ap_summary['overdue_ap']

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
        Cash In, and Cash Out across the last 6 calendar months in ONE SQL GROUP BY query.
        """
        import calendar
        today = date.today()
        curr_idx = today.year * 12 + (today.month - 1)
        months = []
        for offset in range(5, -1, -1):
            idx = curr_idx - offset
            yr, mo0 = divmod(idx, 12)
            mo = mo0 + 1
            m_start = date(yr, mo, 1)
            m_end = date(yr, mo, calendar.monthrange(yr, mo)[1])
            months.append((m_start, m_end))

        window_start = months[0][0]
        window_end = months[-1][1]

        monthly_buckets = {
            m_start: {
                'rev': Decimal('0.0000'),
                'cos': Decimal('0.0000'),
                'opex': Decimal('0.0000'),
                'other_inc': Decimal('0.0000'),
                'other_exp': Decimal('0.0000'),
                'c_in': Decimal('0.0000'),
                'c_out': Decimal('0.0000'),
            }
            for m_start, _ in months
        }

        rows = (
            JournalEntryLine.objects.filter(
                company=company,
                journal_entry__status=JournalStatus.POSTED,
                journal_entry__posting_date__gte=window_start,
                journal_entry__posting_date__lte=window_end,
                is_deleted=False,
            )
            .annotate(p_month=TruncMonth('journal_entry__posting_date'))
            .values('p_month', 'account__account_type', 'account__account_code')
            .annotate(d=Sum('debit'), c=Sum('credit'))
        )

        for r in rows:
            pm = r['p_month']
            if isinstance(pm, datetime):
                pm = pm.date()
            if pm:
                pm = pm.replace(day=1)
            b = monthly_buckets.get(pm)
            if not b:
                continue

            acc_type = str(r['account__account_type'] or '').upper()
            acc_code = str(r['account__account_code'] or '')
            deb = r['d'] or Decimal('0.0000')
            cred = r['c'] or Decimal('0.0000')

            if acc_type in ('REVENUE', 'INCOME'):
                b['rev'] += (cred - deb)
            elif acc_type in ('COST_OF_SERVICE', 'COGS', 'COST_OF_SALES'):
                b['cos'] += (deb - cred)
            elif acc_type in ('EXPENSE', 'OPERATING_EXPENSE'):
                b['opex'] += (deb - cred)
            elif acc_type == 'OTHER_INCOME':
                b['other_inc'] += (cred - deb)
            elif acc_type == 'OTHER_EXPENSE':
                b['other_exp'] += (deb - cred)
            elif acc_type == 'ASSET' and acc_code.startswith('11'):
                b['c_in'] += deb
                b['c_out'] += cred

        trends = []
        for m_start, m_end in months:
            b = monthly_buckets[m_start]
            gp = b['rev'] - b['cos']
            np = gp - b['opex'] + b['other_inc'] - b['other_exp']
            trends.append({
                'month_name': m_start.strftime('%b %Y'),
                'start_date': m_start,
                'end_date': m_end,
                'revenue': b['rev'],
                'cost_of_services': b['cos'],
                'gross_profit': gp,
                'operating_expenses': b['opex'],
                'net_profit': np,
                'cash_in': b['c_in'],
                'cash_out': b['c_out']
            })

        return trends

    @classmethod
    def get_receivables_snapshot(cls, company) -> Dict[str, Any]:
        """
        Surfaces S-4C Receivables snapshot (AR aging buckets, promises, disputes) via lightweight SQL values.
        """
        invoices = ClientInvoice.objects.filter(company=company, is_deleted=False)
        today = date.today()

        agg = invoices.aggregate(
            total_ar=Sum(F('grand_total') - F('paid_amount')),
            disputed=Count('id', filter=Q(recovery_status=getattr(RecoveryStatus, 'DISPUTED', 'DISPUTED'))),
            broken=Count('id', filter=Q(recovery_status=getattr(RecoveryStatus, 'PROMISE_BROKEN', 'PROMISE_BROKEN'))),
            followups=Count('id', filter=Q(recovery_status=getattr(RecoveryStatus, 'FOLLOW_UP_SCHEDULED', 'FOLLOW_UP_SCHEDULED'))),
        )
        total_ar = agg['total_ar'] or Decimal('0.0000')
        current = Decimal('0.0000')
        b_1_30 = Decimal('0.0000')
        b_31_60 = Decimal('0.0000')
        b_61_90 = Decimal('0.0000')
        b_90_plus = Decimal('0.0000')

        for inv in invoices.filter(status__in=['ISSUED', 'PARTIALLY_PAID']).values(
            'grand_total', 'paid_amount', 'due_date', 'invoice_date'
        ):
            bal = (Decimal(str(inv['grand_total'] or 0)) - Decimal(str(inv['paid_amount'] or 0)))
            if bal > 0:
                due = inv['due_date'] or inv['invoice_date'] or today
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
            'disputed_count': agg['disputed'] or 0,
            'broken_promises_count': agg['broken'] or 0,
            'upcoming_followups_count': agg['followups'] or 0,
        }

    @classmethod
    def get_payables_snapshot(cls, company, ap_totals: Dict[str, Decimal] = None) -> Dict[str, Any]:
        """
        Surfaces S-3/S-4F Payables snapshot using fast SQL aggregates.
        """
        ap_summary = ap_totals if ap_totals is not None else cls._get_ap_totals(company)
        vc_agg = VendorCreditNote.objects.filter(company=company, is_deleted=False).aggregate(
            tot=Sum('amount'),
            unalloc=Sum('amount', filter=Q(status='ISSUED')),
        )

        return {
            'total_ap': ap_summary['total_ap'],
            'current_ap': ap_summary['current_ap'],
            'overdue_ap': ap_summary['overdue_ap'],
            'due_soon_ap': ap_summary['due_soon_ap'],
            'total_vendor_credits': vc_agg['tot'] or Decimal('0.0000'),
            'unallocated_vendor_credits': vc_agg['unalloc'] or Decimal('0.0000')
        }

    @classmethod
    def get_payroll_snapshot(cls, company) -> Dict[str, Any]:
        """
        Surfaces S-4G Payroll finance snapshot in 2 aggregate queries.
        """
        i_agg = PayrollAccountingIntegration.objects.filter(company=company).aggregate(
            finalized_count=Count('id', filter=Q(status__in=['APPROVED', 'POSTED'])),
            net_payroll=Sum('net_payroll_payable'),
            paid_amount=Sum('total_paid'),
            outstanding_liability=Sum('remaining_liability'),
        )
        b_agg = SalaryPaymentBatch.objects.filter(company=company).aggregate(
            successful=Count('id', filter=Q(status='COMPLETED')),
            failed=Count('id', filter=Q(status='FAILED')),
            active=Count('id', filter=Q(status__in=['DRAFT', 'READY_FOR_PAYMENT', 'PROCESSING'])),
        )

        return {
            'finalized_payroll_count': i_agg['finalized_count'] or 0,
            'net_payroll_amount': i_agg['net_payroll'] or Decimal('0.0000'),
            'paid_amount': i_agg['paid_amount'] or Decimal('0.0000'),
            'outstanding_liability': i_agg['outstanding_liability'] or Decimal('0.0000'),
            'successful_transfers': b_agg['successful'] or 0,
            'failed_transfers': b_agg['failed'] or 0,
            'active_batches': b_agg['active'] or 0
        }

    @classmethod
    def get_tax_snapshot(cls, company) -> Dict[str, Any]:
        """
        Surfaces S-4H Tax snapshot in 2 SQL queries.
        """
        t_agg = TaxTransaction.objects.filter(company=company, is_deleted=False).aggregate(
            output_tax=Sum('tax_amount', filter=Q(tax_code__tax_category='OUTPUT_TAX')),
            rec_input=Sum('tax_amount', filter=Q(tax_code__tax_category='INPUT_TAX', tax_code__recoverability='RECOVERABLE')),
            wht_pay=Sum('tax_amount', filter=Q(tax_code__tax_category='WITHHOLDING_PAYABLE')),
            wht_rec=Sum('tax_amount', filter=Q(tax_code__tax_category='WITHHOLDING_RECEIVABLE')),
            pr_tax=Sum('tax_amount', filter=Q(tax_code__tax_category='PAYROLL_TAX')),
        )
        output_tax = t_agg['output_tax'] or Decimal('0.0000')
        recoverable_input_tax = t_agg['rec_input'] or Decimal('0.0000')
        wht_payable = t_agg['wht_pay'] or Decimal('0.0000')
        wht_receivable = t_agg['wht_rec'] or Decimal('0.0000')
        payroll_tax = t_agg['pr_tax'] or Decimal('0.0000')

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
        Surfaces S-4D/S-4K Treasury snapshot in 4 SQL queries.
        """
        from finance.models import BankStatementLine
        b_agg = BankAccount.objects.filter(company=company, is_deleted=False).aggregate(
            bank_cnt=Count('id', filter=Q(account_type='BANK')),
            cash_cnt=Count('id', filter=Q(account_type='CASH')),
            petty_cnt=Count('id', filter=Q(account_type='PETTY_CASH')),
            wallet_cnt=Count('id', filter=Q(account_type='WALLET')),
            op_bal=Sum('current_balance'),
        )
        uncleared_cheques = Cheque.objects.filter(company=company, status='ISSUED').aggregate(s=Sum('amount'))['s'] or Decimal('0.0000')
        unreconciled_bank_lines = BankStatementLine.objects.filter(
            statement__company=company,
            match_status='UNMATCHED'
        ).count()
        cash_count_variances = CashCount.objects.filter(company=company, status='VARIANCE_FLAGGED').count()

        return {
            'bank_accounts_count': b_agg['bank_cnt'] or 0,
            'cash_accounts_count': b_agg['cash_cnt'] or 0,
            'petty_cash_count': b_agg['petty_cnt'] or 0,
            'wallets_count': b_agg['wallet_cnt'] or 0,
            'operational_balance': b_agg['op_bal'] or Decimal('0.0000'),
            'uncleared_cheques_amount': uncleared_cheques,
            'unreconciled_bank_lines_count': unreconciled_bank_lines,
            'cash_count_variances_count': cash_count_variances
        }

    @classmethod
    def get_profitability_snapshot(cls, company, unattributed_count: int = None) -> Dict[str, Any]:
        """
        Surfaces S-4J Profitability snapshot using fast SQL-aggregated profitability methods.
        """
        from finance.services.profitability_service import ProfitabilityService

        site_prof = ProfitabilityService.get_site_profitability(company)
        client_prof = ProfitabilityService.get_client_profitability(company)
        contract_prof = ProfitabilityService.get_contract_profitability(company)
        unattributed_cnt = (
            unattributed_count
            if unattributed_count is not None
            else ProfitabilityService.get_unattributed_financial_lines_count(company)
        )

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
            'unattributed_lines_count': unattributed_cnt
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
    def get_action_center(cls, company, unattributed_count: int = None) -> List[Dict[str, Any]]:
        """
        Generates actionable items queue with navigation routing targets.
        Does NOT auto-execute financial actions.
        """
        actions = []

        inv_counts = ClientInvoice.objects.filter(company=company, is_deleted=False).aggregate(
            drafts=Count('id', filter=Q(status='DRAFT')),
            overdue=Count('id', filter=Q(due_date__lt=date.today(), status__in=['ISSUED', 'PARTIALLY_PAID'])),
            followups=Count('id', filter=Q(recovery_status=RecoveryStatus.UNDER_FOLLOWUP)),
        )
        unissued_sheets = inv_counts['drafts'] or 0
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

        overdue_invs = inv_counts['overdue'] or 0
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

        followups_due = inv_counts['followups'] or 0
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

        blocked_bills = ProcurementDocument.objects.filter(company=company, document_type='VENDOR_INVOICE', status='REJECTED').count()
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
                    'title': f"Period Close Blockers in {str(current_period)}",
                    'count': 1,
                    'severity': 'HIGH',
                    'category': 'CONTROLS',
                    'target_tab': 'financial_controls',
                    'description': f"Period close checklist has failing blocker checks."
                })

        from finance.services.profitability_service import ProfitabilityService
        unattributed_cnt = (
            unattributed_count
            if unattributed_count is not None
            else ProfitabilityService.get_unattributed_financial_lines_count(company)
        )
        if unattributed_cnt > 0:
            actions.append({
                'id': 'unattributed_profitability_lines',
                'title': 'Unattributed Revenue / Expense GL Lines',
                'count': unattributed_cnt,
                'severity': 'LOW',
                'category': 'PROFITABILITY',
                'target_tab': 'profitability',
                'description': f"{unattributed_cnt} posted GL line(s) missing site/contract dimensions."
            })

        return actions

    @classmethod
    def get_dashboard_bundle(cls, company, start_date: date = None, end_date: date = None) -> Dict[str, Any]:
        """
        Single-request consolidated bundle returning all 11 Executive Dashboard sections
        while sharing intermediate SQL results (eliminating 11 parallel HTTP round-trips).
        """
        from finance.services.profitability_service import ProfitabilityService

        ap_totals = cls._get_ap_totals(company)
        unattributed_cnt = ProfitabilityService.get_unattributed_financial_lines_count(company)

        return {
            'overview': cls.get_executive_dashboard(company, start_date=start_date, end_date=end_date, ap_totals=ap_totals),
            'financial_health': cls.get_financial_health_summary(company, ap_totals=ap_totals),
            'trends': cls.get_revenue_expense_trend(company),
            'receivables_snapshot': cls.get_receivables_snapshot(company),
            'payables_snapshot': cls.get_payables_snapshot(company, ap_totals=ap_totals),
            'payroll_snapshot': cls.get_payroll_snapshot(company),
            'tax_snapshot': cls.get_tax_snapshot(company),
            'treasury_snapshot': cls.get_treasury_snapshot(company),
            'profitability_snapshot': cls.get_profitability_snapshot(company, unattributed_count=unattributed_cnt),
            'accounting_health': cls.get_accounting_health(company),
            'action_center': cls.get_action_center(company, unattributed_count=unattributed_cnt),
        }
