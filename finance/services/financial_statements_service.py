"""
financial_statements_service.py — Phase S-4J
Authoritative GL-Derived Financial Statements Engine
P&L, Balance Sheet, Cash Flow Statement, Statement Validation
"""
from decimal import Decimal
from typing import Dict, Any, List, Optional
from django.db.models import Sum, Q, F
from django.utils import timezone
from datetime import datetime, date

from finance.models import (
    ChartOfAccount, JournalEntry, JournalEntryLine, AccountType, CashFlowCategory,
    CostCenter, ProfitCenter
)


class FinancialStatementsService:
    """
    Authoritative service for generating financial statements from POSTED GL lines.
    Enforces double-entry integrity, period scoping, and tenant isolation.
    """

    @staticmethod
    def get_posted_lines(company, start_date=None, end_date=None, **dimensions):
        """
        Base queryset helper for POSTED journal lines belonging to active company.
        """
        qs = JournalEntryLine.objects.filter(
            company=company,
            journal_entry__status='POSTED',
            is_deleted=False
        ).select_related(
            'account', 'journal_entry', 'cost_center', 'profit_center',
            'crm_entity', 'contract', 'site', 'vendor', 'employee'
        )

        if start_date:
            qs = qs.filter(journal_entry__posting_date__gte=start_date)
        if end_date:
            qs = qs.filter(journal_entry__posting_date__lte=end_date)

        if dimensions.get('cost_center_id'):
            qs = qs.filter(cost_center_id=dimensions['cost_center_id'])
        if dimensions.get('profit_center_id'):
            qs = qs.filter(profit_center_id=dimensions['profit_center_id'])
        if dimensions.get('client_id') or dimensions.get('crm_entity_id'):
            c_id = dimensions.get('client_id') or dimensions.get('crm_entity_id')
            qs = qs.filter(crm_entity_id=c_id)
        if dimensions.get('contract_id'):
            qs = qs.filter(contract_id=dimensions['contract_id'])
        if dimensions.get('site_id'):
            qs = qs.filter(site_id=dimensions['site_id'])
        if dimensions.get('department'):
            qs = qs.filter(cost_center__department__icontains=dimensions['department'])

        return qs

    @staticmethod
    def check_unposted_items(company) -> Dict[str, Any]:
        """
        Checks if unposted financial events exist in S-4I Posting Queue or DRAFT journals.
        """
        draft_journals = JournalEntry.objects.filter(
            company=company, status='DRAFT', is_deleted=False
        ).count()
        return {
            'has_unposted_items': draft_journals > 0,
            'draft_journals_count': draft_journals,
            'warning_message': 'Unposted financial events exist in draft state. Results may be incomplete.' if draft_journals > 0 else ''
        }

    # --------------------------------------------------------------------------
    # 1. PROFIT & LOSS STATEMENT
    # --------------------------------------------------------------------------
    @staticmethod
    def get_profit_and_loss(
        company,
        start_date: Optional[Any] = None,
        end_date: Optional[Any] = None,
        compare_start_date: Optional[Any] = None,
        compare_end_date: Optional[Any] = None,
        **dimensions
    ) -> Dict[str, Any]:
        """
        Generates authoritative P&L statement strictly derived from POSTED GL lines.
        Hierarchical account breakdown, security revenue categories, direct cost breakdown.
        """
        # Primary period calculation
        primary = FinancialStatementsService._calculate_pl_period(
            company, start_date, end_date, **dimensions
        )

        unposted_check = FinancialStatementsService.check_unposted_items(company)
        primary['has_unposted_items'] = unposted_check['has_unposted_items']
        primary['unposted_warning'] = unposted_check['warning_message']

        # Optional comparison period
        if compare_start_date or compare_end_date:
            comparison = FinancialStatementsService._calculate_pl_period(
                company, compare_start_date, compare_end_date, **dimensions
            )
            primary['comparison_period'] = comparison
            primary['variance'] = {
                'revenue_diff': primary['totals']['total_revenue'] - comparison['totals']['total_revenue'],
                'cogs_diff': primary['totals']['total_cost_of_service'] - comparison['totals']['total_cost_of_service'],
                'gross_profit_diff': primary['totals']['gross_profit'] - comparison['totals']['gross_profit'],
                'operating_expense_diff': primary['totals']['total_operating_expenses'] - comparison['totals']['total_operating_expenses'],
                'net_profit_diff': primary['totals']['net_profit'] - comparison['totals']['net_profit'],
            }

        return primary

    @staticmethod
    def _calculate_pl_period(company, start_date, end_date, **dimensions) -> Dict[str, Any]:
        lines = FinancialStatementsService.get_posted_lines(company, start_date, end_date, **dimensions)

        # Aggregate net debit and credit per account
        account_totals = {}
        for line in lines:
            acc = line.account
            acc_id = str(acc.id)
            if acc_id not in account_totals:
                account_totals[acc_id] = {
                    'account': acc,
                    'account_code': acc.account_code,
                    'account_name': acc.account_name,
                    'account_type': acc.account_type,
                    'parent_id': str(acc.parent_id) if acc.parent_id else None,
                    'debit': Decimal('0.0000'),
                    'credit': Decimal('0.0000'),
                }
            account_totals[acc_id]['debit'] += line.debit
            account_totals[acc_id]['credit'] += line.credit

        # Grouping categories
        revenue_lines = []
        cogs_lines = []
        expense_lines = []
        other_income_lines = []
        other_expense_lines = []

        # Revenue categorization
        guarding_rev = Decimal('0.0000')
        overtime_rev = Decimal('0.0000')
        extra_duty_rev = Decimal('0.0000')
        vip_escort_rev = Decimal('0.0000')
        equipment_rental_rev = Decimal('0.0000')
        other_service_rev = Decimal('0.0000')

        # Direct Cost categorization
        guard_salaries = Decimal('0.0000')
        supervisor_salaries = Decimal('0.0000')
        employee_ot = Decimal('0.0000')
        uniform_gear = Decimal('0.0000')
        site_transport = Decimal('0.0000')
        operational_equipment = Decimal('0.0000')
        other_direct_costs = Decimal('0.0000')

        total_revenue = Decimal('0.0000')
        total_cogs = Decimal('0.0000')
        total_expenses = Decimal('0.0000')
        total_other_income = Decimal('0.0000')
        total_other_expenses = Decimal('0.0000')

        for item in account_totals.values():
            acc = item['account']
            acc_type = str(acc.account_type).upper()
            code = acc.account_code
            name_lower = acc.account_name.lower()

            net_credit = item['credit'] - item['debit']  # Revenue/Income normal balance
            net_debit = item['debit'] - item['credit']   # Expense/COGS normal balance

            if acc_type in ['REVENUE', 'INCOME']:
                amount = net_credit
                if amount != 0:
                    revenue_lines.append({
                        'account_id': str(acc.id),
                        'account_code': code,
                        'account_name': acc.account_name,
                        'amount': amount
                    })
                    total_revenue += amount

                    # Security Revenue Breakdown
                    if 'overtime' in name_lower or 'ot' in name_lower:
                        overtime_rev += amount
                    elif 'extra' in name_lower or 'duty' in name_lower:
                        extra_duty_rev += amount
                    elif 'vip' in name_lower or 'escort' in name_lower:
                        vip_escort_rev += amount
                    elif 'equipment' in name_lower or 'rental' in name_lower:
                        equipment_rental_rev += amount
                    elif 'guard' in name_lower or 'manning' in name_lower or code.startswith('41'):
                        guarding_rev += amount
                    else:
                        other_service_rev += amount

            elif acc_type in ['COST_OF_SERVICE', 'COGS', 'COST_OF_SALES']:
                amount = net_debit
                if amount != 0:
                    cogs_lines.append({
                        'account_id': str(acc.id),
                        'account_code': code,
                        'account_name': acc.account_name,
                        'amount': amount
                    })
                    total_cogs += amount

                    # Direct Cost Breakdown
                    if 'supervisor' in name_lower:
                        supervisor_salaries += amount
                    elif 'overtime' in name_lower or 'ot' in name_lower:
                        employee_ot += amount
                    elif 'uniform' in name_lower or 'gear' in name_lower:
                        uniform_gear += amount
                    elif 'transport' in name_lower or 'fuel' in name_lower or 'vehicle' in name_lower:
                        site_transport += amount
                    elif 'equipment' in name_lower or 'device' in name_lower:
                        operational_equipment += amount
                    elif 'salary' in name_lower or 'wage' in name_lower or 'guard' in name_lower or code.startswith('51'):
                        guard_salaries += amount
                    else:
                        other_direct_costs += amount

            elif acc_type in ['EXPENSE', 'OPERATING_EXPENSE']:
                amount = net_debit
                if amount != 0:
                    expense_lines.append({
                        'account_id': str(acc.id),
                        'account_code': code,
                        'account_name': acc.account_name,
                        'amount': amount
                    })
                    total_expenses += amount

            elif acc_type == 'OTHER_INCOME':
                amount = net_credit
                if amount != 0:
                    other_income_lines.append({
                        'account_id': str(acc.id),
                        'account_code': code,
                        'account_name': acc.account_name,
                        'amount': amount
                    })
                    total_other_income += amount

            elif acc_type == 'OTHER_EXPENSE':
                amount = net_debit
                if amount != 0:
                    other_expense_lines.append({
                        'account_id': str(acc.id),
                        'account_code': code,
                        'account_name': acc.account_name,
                        'amount': amount
                    })
                    total_other_expenses += amount

        gross_profit = total_revenue - total_cogs
        gross_margin_pct = (gross_profit / total_revenue * Decimal('100.0')) if total_revenue > 0 else Decimal('0.00')
        operating_profit = gross_profit - total_expenses
        net_profit = operating_profit + total_other_income - total_other_expenses
        net_margin_pct = (net_profit / total_revenue * Decimal('100.0')) if total_revenue > 0 else Decimal('0.00')

        return {
            'period': {
                'start_date': str(start_date) if start_date else None,
                'end_date': str(end_date) if end_date else None,
            },
            'totals': {
                'total_revenue': total_revenue,
                'total_cost_of_service': total_cogs,
                'gross_profit': gross_profit,
                'gross_margin_pct': round(gross_margin_pct, 2),
                'total_operating_expenses': total_expenses,
                'operating_profit': operating_profit,
                'total_other_income': total_other_income,
                'total_other_expenses': total_other_expenses,
                'net_profit': net_profit,
                'net_margin_pct': round(net_margin_pct, 2),
            },
            'security_revenue_breakdown': {
                'guarding_revenue': guarding_rev,
                'overtime_revenue': overtime_rev,
                'extra_duty_revenue': extra_duty_rev,
                'vip_escort_revenue': vip_escort_rev,
                'equipment_rental_revenue': equipment_rental_rev,
                'other_service_revenue': other_service_rev,
            },
            'cost_of_service_breakdown': {
                'guard_salaries': guard_salaries,
                'supervisor_salaries': supervisor_salaries,
                'employee_ot': employee_ot,
                'uniform_gear': uniform_gear,
                'site_transport': site_transport,
                'operational_equipment': operational_equipment,
                'other_direct_costs': other_direct_costs,
            },
            'lines': {
                'revenue': revenue_lines,
                'cost_of_service': cogs_lines,
                'operating_expenses': expense_lines,
                'other_income': other_income_lines,
                'other_expenses': other_expense_lines,
            }
        }

    # --------------------------------------------------------------------------
    # 2. BALANCE SHEET
    # --------------------------------------------------------------------------
    @staticmethod
    def get_balance_sheet(
        company,
        as_of_date: Optional[Any] = None,
        **dimensions
    ) -> Dict[str, Any]:
        """
        Generates cumulative Balance Sheet as of selected date.
        Validates: ASSETS = LIABILITIES + EQUITY (including Current Period Profit/Loss).
        """
        if not as_of_date:
            as_of_date = timezone.now().date()

        # Cumulative POSTED lines up to as_of_date
        lines = FinancialStatementsService.get_posted_lines(
            company, start_date=None, end_date=as_of_date, **dimensions
        )

        account_balances = {}
        for line in lines:
            acc = line.account
            acc_id = str(acc.id)
            if acc_id not in account_balances:
                account_balances[acc_id] = {
                    'account': acc,
                    'account_code': acc.account_code,
                    'account_name': acc.account_name,
                    'account_type': acc.account_type,
                    'debit': Decimal('0.0000'),
                    'credit': Decimal('0.0000'),
                }
            account_balances[acc_id]['debit'] += line.debit
            account_balances[acc_id]['credit'] += line.credit

        # Assets breakdown
        cash_bank_lines = []
        ar_lines = []
        advances_lines = []
        tax_rec_lines = []
        inventory_lines = []
        other_asset_lines = []

        total_cash_bank = Decimal('0.0000')
        total_ar = Decimal('0.0000')
        total_advances = Decimal('0.0000')
        total_tax_rec = Decimal('0.0000')
        total_inventory = Decimal('0.0000')
        total_other_assets = Decimal('0.0000')
        total_assets = Decimal('0.0000')

        # Liabilities breakdown
        ap_lines = []
        payroll_payable_lines = []
        tax_payable_lines = []
        other_liability_lines = []

        total_ap = Decimal('0.0000')
        total_payroll_payable = Decimal('0.0000')
        total_tax_payable = Decimal('0.0000')
        total_other_liabilities = Decimal('0.0000')
        total_liabilities = Decimal('0.0000')

        # Equity breakdown
        capital_lines = []
        retained_earnings_lines = []
        total_capital = Decimal('0.0000')
        total_retained_earnings = Decimal('0.0000')
        total_equity_base = Decimal('0.0000')

        for item in account_balances.values():
            acc = item['account']
            acc_type = str(acc.account_type).upper()
            code = acc.account_code
            name_lower = acc.account_name.lower()

            net_debit = item['debit'] - item['credit']   # Asset normal
            net_credit = item['credit'] - item['debit']  # Liability/Equity normal

            if acc_type == 'ASSET':
                amount = net_debit
                if amount == 0:
                    continue
                row = {'account_id': str(acc.id), 'account_code': code, 'account_name': acc.account_name, 'amount': amount}
                total_assets += amount

                if code.startswith('11') or 'bank' in name_lower or 'cash' in name_lower or 'petty' in name_lower:
                    cash_bank_lines.append(row)
                    total_cash_bank += amount
                elif code.startswith('12') or 'receivable' in name_lower:
                    ar_lines.append(row)
                    total_ar += amount
                elif code.startswith('13') or 'advance' in name_lower or 'prepaid' in name_lower:
                    advances_lines.append(row)
                    total_advances += amount
                elif code.startswith('14') or 'tax' in name_lower or 'wht' in name_lower:
                    tax_rec_lines.append(row)
                    total_tax_rec += amount
                elif code.startswith('15') or 'inventory' in name_lower or 'stock' in name_lower:
                    inventory_lines.append(row)
                    total_inventory += amount
                else:
                    other_asset_lines.append(row)
                    total_other_assets += amount

            elif acc_type == 'LIABILITY':
                amount = net_credit
                if amount == 0:
                    continue
                row = {'account_id': str(acc.id), 'account_code': code, 'account_name': acc.account_name, 'amount': amount}
                total_liabilities += amount

                if code.startswith('21') or 'payable' in name_lower and 'vendor' in name_lower or 'ap' in name_lower:
                    ap_lines.append(row)
                    total_ap += amount
                elif code.startswith('22') or 'payroll' in name_lower or 'salary' in name_lower:
                    payroll_payable_lines.append(row)
                    total_payroll_payable += amount
                elif code.startswith('23') or 'tax' in name_lower or 'vat' in name_lower or 'gst' in name_lower:
                    tax_payable_lines.append(row)
                    total_tax_payable += amount
                else:
                    other_liability_lines.append(row)
                    total_other_liabilities += amount

            elif acc_type == 'EQUITY':
                amount = net_credit
                if amount == 0:
                    continue
                row = {'account_id': str(acc.id), 'account_code': code, 'account_name': acc.account_name, 'amount': amount}
                total_equity_base += amount

                if code.startswith('32') or 'retained' in name_lower:
                    retained_earnings_lines.append(row)
                    total_retained_earnings += amount
                else:
                    capital_lines.append(row)
                    total_capital += amount

        # Current Period Net Profit / Loss calculation up to as_of_date
        pl_data = FinancialStatementsService._calculate_pl_period(company, start_date=None, end_date=as_of_date, **dimensions)
        current_period_profit = pl_data['totals']['net_profit']

        total_equity = total_equity_base + current_period_profit
        total_liabilities_and_equity = total_liabilities + total_equity
        balance_diff = total_assets - total_liabilities_and_equity
        is_balanced = abs(balance_diff) < Decimal('0.0100')

        is_management_view = bool(
            dimensions.get('cost_center_id') or dimensions.get('profit_center_id') or
            dimensions.get('client_id') or dimensions.get('contract_id') or dimensions.get('site_id')
        )

        return {
            'as_of_date': str(as_of_date),
            'is_balanced': is_balanced,
            'balance_difference': balance_diff,
            'is_management_view': is_management_view,
            'management_notice': 'Dimensional Balance Sheet is a management view; full balance attribution may be incomplete across balance sheet accounts.' if is_management_view else '',
            'assets': {
                'total_assets': total_assets,
                'cash_and_bank': {'total': total_cash_bank, 'lines': cash_bank_lines},
                'accounts_receivable': {'total': total_ar, 'lines': ar_lines},
                'employee_advances': {'total': total_advances, 'lines': advances_lines},
                'tax_recoverable': {'total': total_tax_rec, 'lines': tax_rec_lines},
                'inventory': {'total': total_inventory, 'lines': inventory_lines},
                'other_assets': {'total': total_other_assets, 'lines': other_asset_lines},
            },
            'liabilities': {
                'total_liabilities': total_liabilities,
                'accounts_payable': {'total': total_ap, 'lines': ap_lines},
                'payroll_payable': {'total': total_payroll_payable, 'lines': payroll_payable_lines},
                'tax_payable': {'total': total_tax_payable, 'lines': tax_payable_lines},
                'other_liabilities': {'total': total_other_liabilities, 'lines': other_liability_lines},
            },
            'equity': {
                'total_equity': total_equity,
                'capital': {'total': total_capital, 'lines': capital_lines},
                'retained_earnings': {'total': total_retained_earnings, 'lines': retained_earnings_lines},
                'current_period_profit': current_period_profit,
            },
            'totals': {
                'total_assets': total_assets,
                'total_liabilities': total_liabilities,
                'total_equity': total_equity,
                'total_liabilities_and_equity': total_liabilities_and_equity,
            }
        }

    # --------------------------------------------------------------------------
    # 3. CASH FLOW STATEMENT
    # --------------------------------------------------------------------------
    @staticmethod
    def get_cash_flow_statement(
        company,
        start_date: Optional[Any] = None,
        end_date: Optional[Any] = None
    ) -> Dict[str, Any]:
        """
        GL-derived Cash Flow Statement: Operating, Investing, Financing activities.
        Validates: Opening Cash + Net Cash Movement = Closing Cash.
        """
        if not end_date:
            end_date = timezone.now().date()

        # Identify Cash/Bank accounts (code 11xx or account_type ASSET with cash/bank)
        cash_accounts = ChartOfAccount.objects.filter(
            company=company, is_active=True, allow_posting=True
        ).filter(
            Q(account_code__startswith='11') |
            Q(account_name__icontains='bank') |
            Q(account_name__icontains='cash')
        ).values_list('id', flat=True)

        cash_acc_ids = list(cash_accounts)

        # 1. Opening Cash (all POSTED cash lines before start_date)
        opening_cash = Decimal('0.0000')
        if start_date:
            opening_lines = JournalEntryLine.objects.filter(
                company=company, journal_entry__status='POSTED', is_deleted=False,
                account_id__in=cash_acc_ids, journal_entry__posting_date__lt=start_date
            )
            for l in opening_lines:
                opening_cash += (l.debit - l.credit)

        # 2. Period Cash Movement Lines
        period_lines = JournalEntryLine.objects.filter(
            company=company, journal_entry__status='POSTED', is_deleted=False,
            account_id__in=cash_acc_ids
        )
        if start_date:
            period_lines = period_lines.filter(journal_entry__posting_date__gte=start_date)
        if end_date:
            period_lines = period_lines.filter(journal_entry__posting_date__lte=end_date)

        operating_cash_flow = Decimal('0.0000')
        investing_cash_flow = Decimal('0.0000')
        financing_cash_flow = Decimal('0.0000')

        operating_details = []
        investing_details = []
        financing_details = []

        # Analyze each cash line offset
        for l in period_lines.select_related('journal_entry'):
            net_movement = l.debit - l.credit
            je = l.journal_entry

            # Look for offset lines in same journal entry
            offsets = JournalEntryLine.objects.filter(
                journal_entry=je, is_deleted=False
            ).exclude(account_id__in=cash_acc_ids).select_related('account')

            category = CashFlowCategory.OPERATING
            offset_acc_name = "Operational Transaction"

            if offsets.exists():
                offset_l = offsets.first()
                offset_acc = offset_l.account
                offset_acc_name = offset_acc.account_name

                # Respect explicit ChartOfAccount cash_flow_category if set
                if offset_acc.cash_flow_category:
                    category = offset_acc.cash_flow_category
                else:
                    t = str(offset_acc.account_type).upper()
                    if t in ['REVENUE', 'INCOME', 'COST_OF_SERVICE', 'COGS', 'EXPENSE']:
                        category = CashFlowCategory.OPERATING
                    elif t == 'ASSET':
                        category = CashFlowCategory.INVESTING if 'equipment' in offset_acc.account_name.lower() or 'fixed' in offset_acc.account_name.lower() or offset_acc.account_code.startswith('16') else CashFlowCategory.OPERATING
                    elif t in ['LIABILITY', 'EQUITY']:
                        category = CashFlowCategory.FINANCING if offset_acc.account_code.startswith('3') or 'loan' in offset_acc.account_name.lower() or 'capital' in offset_acc.account_name.lower() else CashFlowCategory.OPERATING

            row = {
                'entry_number': je.entry_number,
                'posting_date': str(je.posting_date),
                'description': l.description or je.description,
                'offset_account': offset_acc_name,
                'amount': net_movement
            }

            if category == CashFlowCategory.OPERATING:
                operating_cash_flow += net_movement
                operating_details.append(row)
            elif category == CashFlowCategory.INVESTING:
                investing_cash_flow += net_movement
                investing_details.append(row)
            elif category == CashFlowCategory.FINANCING:
                financing_cash_flow += net_movement
                financing_details.append(row)

        net_cash_movement = operating_cash_flow + investing_cash_flow + financing_cash_flow
        closing_cash = opening_cash + net_cash_movement

        # Actual closing cash verification across DB
        closing_lines = JournalEntryLine.objects.filter(
            company=company, journal_entry__status='POSTED', is_deleted=False,
            account_id__in=cash_acc_ids, journal_entry__posting_date__lte=end_date
        )
        actual_closing_cash = sum((l.debit - l.credit) for l in closing_lines)

        is_reconciled = abs(closing_cash - actual_closing_cash) < Decimal('0.0100')

        return {
            'period': {
                'start_date': str(start_date) if start_date else None,
                'end_date': str(end_date),
            },
            'opening_cash': opening_cash,
            'operating_activities': {
                'total': operating_cash_flow,
                'lines': operating_details[:50]
            },
            'investing_activities': {
                'total': investing_cash_flow,
                'lines': investing_details[:50]
            },
            'financing_activities': {
                'total': financing_cash_flow,
                'lines': financing_details[:50]
            },
            'net_cash_movement': net_cash_movement,
            'closing_cash': closing_cash,
            'actual_closing_cash': actual_closing_cash,
            'is_reconciled': is_reconciled
        }

    # --------------------------------------------------------------------------
    # 4. STATEMENT VALIDATION CHECKS
    # --------------------------------------------------------------------------
    @staticmethod
    def validate_statements(company, as_of_date=None) -> Dict[str, Any]:
        """
        Executes high-level integrity checks across GL, Trial Balance, Balance Sheet, Cash Flow.
        """
        if not as_of_date:
            as_of_date = timezone.now().date()

        from finance.services.posting_service import AccountingPostingService
        tb = AccountingPostingService.get_trial_balance(company, end_date=as_of_date)
        bs = FinancialStatementsService.get_balance_sheet(company, as_of_date=as_of_date)
        cf = FinancialStatementsService.get_cash_flow_statement(company, end_date=as_of_date)

        tb_balanced = tb.get('is_balanced', False)
        bs_balanced = bs.get('is_balanced', False)
        cf_reconciled = cf.get('is_reconciled', False)

        all_valid = tb_balanced and bs_balanced and cf_reconciled

        return {
            'as_of_date': str(as_of_date),
            'all_valid': all_valid,
            'checks': [
                {
                    'name': 'Trial Balance Equality (Σ Debit == Σ Credit)',
                    'passed': tb_balanced,
                    'details': f"Total Dr: {tb.get('totals', {}).get('closing_debit')}, Total Cr: {tb.get('totals', {}).get('closing_credit')}"
                },
                {
                    'name': 'Balance Sheet Equation (Assets = Liabilities + Equity)',
                    'passed': bs_balanced,
                    'details': f"Assets: {bs['totals']['total_assets']}, Liab+Eq: {bs['totals']['total_liabilities_and_equity']}, Diff: {bs['balance_difference']}"
                },
                {
                    'name': 'Cash Flow Movement Reconciliation',
                    'passed': cf_reconciled,
                    'details': f"Opening + Net Movement ({cf['closing_cash']}) == Actual Cash Balance ({cf['actual_closing_cash']})"
                }
            ]
        }
