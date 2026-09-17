"""
profitability_service.py — Phase S-4J
Authoritative Contract, Client, Site & Management Profitability Engine
Direct vs Indirect Cost Analysis, Overhead Allocation & Profitability Drill-Down
"""
from decimal import Decimal
from typing import Dict, Any, List, Optional
from django.db.models import Sum, Q, F
from django.utils import timezone

from finance.models import (
    JournalEntryLine, ChartOfAccount, AccountType, CostCenter, ProfitCenter, AllocationProfile
)
from crm.models import CRMEntity
from operations.models import ServiceContract, OperationalSite


class ProfitabilityService:
    """
    Authoritative profitability engine operating strictly on POSTED GL journal lines.
    Calculates Client, Contract, Site, Cost Center & Profit Center profitability.
    """

    @staticmethod
    def _determine_management_status(revenue: Decimal, net_profit: Decimal, margin_pct: Decimal) -> str:
        if revenue == Decimal('0.0000'):
            return 'NO_REVENUE'
        if net_profit < Decimal('0.0000'):
            return 'LOSS_MAKING'
        if margin_pct < Decimal('15.00'):
            return 'LOW_MARGIN'
        return 'PROFITABLE'

    # --------------------------------------------------------------------------
    # 1. CLIENT PROFITABILITY
    # --------------------------------------------------------------------------
    @staticmethod
    def get_client_profitability(
        company,
        start_date: Optional[Any] = None,
        end_date: Optional[Any] = None,
        client_id: Optional[Any] = None
    ) -> List[Dict[str, Any]]:
        """
        Calculates Client Profitability from POSTED GL lines.
        """
        lines = JournalEntryLine.objects.filter(
            company=company, journal_entry__status='POSTED', is_deleted=False
        ).select_related('account', 'crm_entity')

        if start_date:
            lines = lines.filter(journal_entry__posting_date__gte=start_date)
        if end_date:
            lines = lines.filter(journal_entry__posting_date__lte=end_date)
        if client_id:
            lines = lines.filter(crm_entity_id=client_id)

        # Map active clients
        clients_qs = CRMEntity.objects.filter(company=company, is_deleted=False)
        if client_id:
            clients_qs = clients_qs.filter(id=client_id)

        client_map = {str(c.id): c for c in clients_qs}
        results = {}

        for str_id, c in client_map.items():
            results[str_id] = {
                'client_id': str_id,
                'client_name': c.name,
                'revenue': Decimal('0.0000'),
                'direct_costs': Decimal('0.0000'),
                'allocated_overhead': Decimal('0.0000'),
                'direct_profit': Decimal('0.0000'),
                'net_profit': Decimal('0.0000'),
                'margin_pct': Decimal('0.0000'),
                'management_status': 'NO_REVENUE'
            }

        # Overhead allocations map
        allocations = ProfitabilityService.calculate_overhead_allocations(company, start_date, end_date)

        for l in lines:
            if not l.crm_entity_id:
                continue
            str_id = str(l.crm_entity_id)
            if str_id not in results:
                continue

            acc = l.account
            acc_type = str(acc.account_type).upper()

            if acc_type in ['REVENUE', 'INCOME']:
                rev = l.credit - l.debit
                results[str_id]['revenue'] += rev
            elif acc_type in ['COST_OF_SERVICE', 'COGS', 'EXPENSE']:
                cost = l.debit - l.credit
                results[str_id]['direct_costs'] += cost

        output = []
        for str_id, data in results.items():
            # Apply client overhead allocations if present
            allocated = allocations.get('clients', {}).get(str_id, Decimal('0.0000'))
            data['allocated_overhead'] = allocated
            data['direct_profit'] = data['revenue'] - data['direct_costs']
            data['net_profit'] = data['direct_profit'] - data['allocated_overhead']

            if data['revenue'] > 0:
                data['margin_pct'] = round((data['net_profit'] / data['revenue']) * Decimal('100.0'), 2)
            else:
                data['margin_pct'] = Decimal('0.00')

            data['management_status'] = ProfitabilityService._determine_management_status(
                data['revenue'], data['net_profit'], data['margin_pct']
            )
            output.append(data)

        return sorted(output, key=lambda x: x['revenue'], reverse=True)

    # --------------------------------------------------------------------------
    # 2. CONTRACT PROFITABILITY
    # --------------------------------------------------------------------------
    @staticmethod
    def get_contract_profitability(
        company,
        start_date: Optional[Any] = None,
        end_date: Optional[Any] = None,
        contract_id: Optional[Any] = None,
        client_id: Optional[Any] = None
    ) -> List[Dict[str, Any]]:
        """
        Calculates Service Contract Profitability from POSTED GL lines.
        """
        lines = JournalEntryLine.objects.filter(
            company=company, journal_entry__status='POSTED', is_deleted=False
        ).select_related('account', 'contract', 'crm_entity')

        if start_date:
            lines = lines.filter(journal_entry__posting_date__gte=start_date)
        if end_date:
            lines = lines.filter(journal_entry__posting_date__lte=end_date)
        if contract_id:
            lines = lines.filter(contract_id=contract_id)
        if client_id:
            lines = lines.filter(crm_entity_id=client_id)

        contracts_qs = ServiceContract.objects.filter(company=company, is_deleted=False)
        if contract_id:
            contracts_qs = contracts_qs.filter(id=contract_id)
        if client_id:
            contracts_qs = contracts_qs.filter(client_id=client_id)

        contract_map = {str(c.id): c for c in contracts_qs}
        results = {}

        for str_id, c in contract_map.items():
            client_name = c.crm_entity.name if hasattr(c, 'crm_entity') and c.crm_entity else 'Unassigned'
            code = getattr(c, 'contract_code', getattr(c, 'contract_number', f"Contract #{c.id}"))
            results[str_id] = {
                'contract_id': str_id,
                'contract_number': code,
                'title': getattr(c, 'title', f"Contract {code}"),
                'client_name': client_name,
                'revenue': Decimal('0.0000'),
                'guard_payroll_cost': Decimal('0.0000'),
                'supervisor_cost': Decimal('0.0000'),
                'ot_cost': Decimal('0.0000'),
                'equipment_cost': Decimal('0.0000'),
                'transport_cost': Decimal('0.0000'),
                'site_expenses': Decimal('0.0000'),
                'other_direct_cost': Decimal('0.0000'),
                'total_direct_cost': Decimal('0.0000'),
                'allocated_overhead': Decimal('0.0000'),
                'direct_profit': Decimal('0.0000'),
                'net_profit': Decimal('0.0000'),
                'margin_pct': Decimal('0.0000'),
                'management_status': 'NO_REVENUE'
            }

        allocations = ProfitabilityService.calculate_overhead_allocations(company, start_date, end_date)

        for l in lines:
            if not l.contract_id:
                continue
            str_id = str(l.contract_id)
            if str_id not in results:
                continue

            acc = l.account
            acc_type = str(acc.account_type).upper()
            name_lower = acc.account_name.lower()

            if acc_type in ['REVENUE', 'INCOME']:
                results[str_id]['revenue'] += (l.credit - l.debit)
            elif acc_type in ['COST_OF_SERVICE', 'COGS', 'EXPENSE']:
                cost = l.debit - l.credit
                results[str_id]['total_direct_cost'] += cost

                if 'supervisor' in name_lower:
                    results[str_id]['supervisor_cost'] += cost
                elif 'overtime' in name_lower or 'ot' in name_lower:
                    results[str_id]['ot_cost'] += cost
                elif 'equipment' in name_lower or 'rental' in name_lower:
                    results[str_id]['equipment_cost'] += cost
                elif 'transport' in name_lower or 'fuel' in name_lower:
                    results[str_id]['transport_cost'] += cost
                elif 'salary' in name_lower or 'wage' in name_lower or 'guard' in name_lower or acc.account_code.startswith('51'):
                    results[str_id]['guard_payroll_cost'] += cost
                else:
                    results[str_id]['other_direct_cost'] += cost

        output = []
        for str_id, data in results.items():
            data['allocated_overhead'] = allocations.get('contracts', {}).get(str_id, Decimal('0.0000'))
            data['direct_profit'] = data['revenue'] - data['total_direct_cost']
            data['net_profit'] = data['direct_profit'] - data['allocated_overhead']

            if data['revenue'] > 0:
                data['margin_pct'] = round((data['net_profit'] / data['revenue']) * Decimal('100.0'), 2)
            else:
                data['margin_pct'] = Decimal('0.00')

            data['management_status'] = ProfitabilityService._determine_management_status(
                data['revenue'], data['net_profit'], data['margin_pct']
            )
            output.append(data)

        return sorted(output, key=lambda x: x['revenue'], reverse=True)

    # --------------------------------------------------------------------------
    # 3. SITE PROFITABILITY (Key Security ERP Feature)
    # --------------------------------------------------------------------------
    @staticmethod
    def get_site_profitability(
        company,
        start_date: Optional[Any] = None,
        end_date: Optional[Any] = None,
        site_id: Optional[Any] = None,
        contract_id: Optional[Any] = None,
        client_id: Optional[Any] = None
    ) -> List[Dict[str, Any]]:
        """
        Calculates Operational Site Profitability matching security management specs.
        (e.g., ABC Factory Karachi layout with Direct Profit & Net Site Contribution).
        """
        lines = JournalEntryLine.objects.filter(
            company=company, journal_entry__status='POSTED', is_deleted=False
        ).select_related('account', 'site', 'contract', 'crm_entity')

        if start_date:
            lines = lines.filter(journal_entry__posting_date__gte=start_date)
        if end_date:
            lines = lines.filter(journal_entry__posting_date__lte=end_date)
        if site_id:
            lines = lines.filter(site_id=site_id)
        if contract_id:
            lines = lines.filter(contract_id=contract_id)
        if client_id:
            lines = lines.filter(crm_entity_id=client_id)

        sites_qs = OperationalSite.objects.filter(company=company, is_deleted=False)
        if site_id:
            sites_qs = sites_qs.filter(id=site_id)
        if client_id:
            sites_qs = sites_qs.filter(crm_entity_id=client_id)

        site_map = {str(s.id): s for s in sites_qs}
        results = {}

        for str_id, s in site_map.items():
            client_name = s.crm_entity.name if hasattr(s, 'crm_entity') and s.crm_entity else 'Unassigned'
            results[str_id] = {
                'site_id': str_id,
                'site_name': s.name,
                'city': getattr(s, 'city', 'General'),
                'client_name': client_name,
                'revenue': Decimal('0.0000'),
                'guard_salaries': Decimal('0.0000'),
                'supervisor_salaries': Decimal('0.0000'),
                'employee_ot': Decimal('0.0000'),
                'transport': Decimal('0.0000'),
                'equipment': Decimal('0.0000'),
                'site_expenses': Decimal('0.0000'),
                'other_direct': Decimal('0.0000'),
                'total_direct_costs': Decimal('0.0000'),
                'direct_profit': Decimal('0.0000'),
                'allocated_ho_overhead': Decimal('0.0000'),
                'net_site_contribution': Decimal('0.0000'),
                'margin_pct': Decimal('0.0000'),
                'management_status': 'NO_REVENUE'
            }

        allocations = ProfitabilityService.calculate_overhead_allocations(company, start_date, end_date)

        for l in lines:
            if not l.site_id:
                continue
            str_id = str(l.site_id)
            if str_id not in results:
                continue

            acc = l.account
            acc_type = str(acc.account_type).upper()
            name_lower = acc.account_name.lower()

            if acc_type in ['REVENUE', 'INCOME']:
                results[str_id]['revenue'] += (l.credit - l.debit)
            elif acc_type in ['COST_OF_SERVICE', 'COGS', 'EXPENSE']:
                cost = l.debit - l.credit
                results[str_id]['total_direct_costs'] += cost

                if 'supervisor' in name_lower:
                    results[str_id]['supervisor_salaries'] += cost
                elif 'overtime' in name_lower or 'ot' in name_lower:
                    results[str_id]['employee_ot'] += cost
                elif 'transport' in name_lower or 'fuel' in name_lower or 'vehicle' in name_lower:
                    results[str_id]['transport'] += cost
                elif 'equipment' in name_lower or 'device' in name_lower:
                    results[str_id]['equipment'] += cost
                elif 'site' in name_lower or 'utility' in name_lower or 'rent' in name_lower:
                    results[str_id]['site_expenses'] += cost
                elif 'salary' in name_lower or 'wage' in name_lower or 'guard' in name_lower or acc.account_code.startswith('51'):
                    results[str_id]['guard_salaries'] += cost
                else:
                    results[str_id]['other_direct'] += cost

        output = []
        for str_id, data in results.items():
            data['allocated_ho_overhead'] = allocations.get('sites', {}).get(str_id, Decimal('0.0000'))
            data['direct_profit'] = data['revenue'] - data['total_direct_costs']
            data['net_site_contribution'] = data['direct_profit'] - data['allocated_ho_overhead']

            if data['revenue'] > 0:
                data['margin_pct'] = round((data['net_site_contribution'] / data['revenue']) * Decimal('100.0'), 2)
            else:
                data['margin_pct'] = Decimal('0.00')

            data['management_status'] = ProfitabilityService._determine_management_status(
                data['revenue'], data['net_site_contribution'], data['margin_pct']
            )
            output.append(data)

        return sorted(output, key=lambda x: x['revenue'], reverse=True)

    # --------------------------------------------------------------------------
    # 4. OVERHEAD ALLOCATION ENGINE (Management Allocation Rules)
    # --------------------------------------------------------------------------
    @staticmethod
    def calculate_overhead_allocations(
        company,
        start_date: Optional[Any] = None,
        end_date: Optional[Any] = None
    ) -> Dict[str, Dict[str, Decimal]]:
        """
        Calculates management overhead allocations without altering GL journal lines.
        Returns dict of allocated overheads by site_id, contract_id, client_id.
        """
        profiles = AllocationProfile.objects.filter(company=company, is_active=True, is_deleted=False)
        site_allocations = {}
        contract_allocations = {}
        client_allocations = {}

        if not profiles.exists():
            return {'sites': site_allocations, 'contracts': contract_allocations, 'clients': client_allocations}

        # Aggregate total indirect overhead costs (expenses on cost centers marked or unassigned)
        indirect_lines = JournalEntryLine.objects.filter(
            company=company, journal_entry__status='POSTED', is_deleted=False,
            account__account_type__in=['EXPENSE', 'OPERATING_EXPENSE'],
            site__isnull=True, contract__isnull=True
        )
        if start_date:
            indirect_lines = indirect_lines.filter(journal_entry__posting_date__gte=start_date)
        if end_date:
            indirect_lines = indirect_lines.filter(journal_entry__posting_date__lte=end_date)

        total_indirect = sum((l.debit - l.credit) for l in indirect_lines)

        if total_indirect <= 0:
            return {'sites': site_allocations, 'contracts': contract_allocations, 'clients': client_allocations}

        # Apply active allocation profiles
        for p in profiles:
            if p.method == 'BY_REVENUE':
                # Split indirect overhead proportionally to site/contract revenue
                site_revs = JournalEntryLine.objects.filter(
                    company=company, journal_entry__status='POSTED', is_deleted=False,
                    account__account_type__in=['REVENUE', 'INCOME'], site__isnull=False
                )
                if start_date: site_revs = site_revs.filter(journal_entry__posting_date__gte=start_date)
                if end_date: site_revs = site_revs.filter(journal_entry__posting_date__lte=end_date)

                total_rev = sum((l.credit - l.debit) for l in site_revs)
                if total_rev > 0:
                    site_sums = {}
                    for l in site_revs:
                        sid = str(l.site_id)
                        site_sums[sid] = site_sums.get(sid, Decimal('0.0000')) + (l.credit - l.debit)
                    for sid, srev in site_sums.items():
                        share = (srev / total_rev) * total_indirect
                        site_allocations[sid] = site_allocations.get(sid, Decimal('0.0000')) + share

            elif p.method == 'BY_SITE' and p.target_site_id:
                sid = str(p.target_site_id)
                weight = p.percentage_or_weight or Decimal('100.00')
                share = (weight / Decimal('100.0')) * total_indirect
                site_allocations[sid] = site_allocations.get(sid, Decimal('0.0000')) + share

            elif p.method == 'BY_FIXED_PERCENTAGE' and p.target_site_id:
                sid = str(p.target_site_id)
                share = (p.percentage_or_weight / Decimal('100.0')) * total_indirect
                site_allocations[sid] = site_allocations.get(sid, Decimal('0.0000')) + share

        return {'sites': site_allocations, 'contracts': contract_allocations, 'clients': client_allocations}

    # --------------------------------------------------------------------------
    # 5. UNATTRIBUTED FINANCIAL LINES (Exceptions)
    # --------------------------------------------------------------------------
    @staticmethod
    def get_unattributed_financial_lines(
        company,
        start_date: Optional[Any] = None,
        end_date: Optional[Any] = None
    ) -> List[Dict[str, Any]]:
        """
        Identifies POSTED GL lines missing expected dimensions (site, contract, client).
        """
        lines = JournalEntryLine.objects.filter(
            company=company, journal_entry__status='POSTED', is_deleted=False
        ).select_related('account', 'journal_entry')

        if start_date:
            lines = lines.filter(journal_entry__posting_date__gte=start_date)
        if end_date:
            lines = lines.filter(journal_entry__posting_date__lte=end_date)

        exceptions = []
        for l in lines:
            acc_type = str(l.account.account_type).upper()
            code = l.account.account_code

            # Check if line should have site/contract/client attribution
            is_unattributed_revenue = acc_type in ['REVENUE', 'INCOME'] and not (l.site_id or l.contract_id or l.crm_entity_id)
            is_unattributed_direct_cost = acc_type in ['COST_OF_SERVICE', 'COGS'] and not (l.site_id or l.contract_id or l.crm_entity_id)
            is_unattributed_site_exp = acc_type in ['EXPENSE'] and 'site' in l.account.account_name.lower() and not l.site_id

            if is_unattributed_revenue or is_unattributed_direct_cost or is_unattributed_site_exp:
                exc_type = 'UNASSIGNED_REVENUE' if is_unattributed_revenue else ('UNASSIGNED_DIRECT_COST' if is_unattributed_direct_cost else 'UNASSIGNED_SITE_EXPENSE')
                exceptions.append({
                    'line_id': str(l.id),
                    'entry_number': l.journal_entry.entry_number,
                    'posting_date': str(l.journal_entry.posting_date),
                    'account_code': code,
                    'account_name': l.account.account_name,
                    'exception_type': exc_type,
                    'amount': l.debit if l.debit > 0 else l.credit,
                    'narration': l.description or l.journal_entry.description,
                    'source_type': l.journal_entry.source_type or 'Manual',
                    'source_number': l.journal_entry.source_number or '—'
                })

        return exceptions

    # --------------------------------------------------------------------------
    # 6. DRILL-DOWN LINAGE (GL to Source Document)
    # --------------------------------------------------------------------------
    @staticmethod
    def get_profitability_drilldown(
        company,
        site_id: Optional[Any] = None,
        contract_id: Optional[Any] = None,
        client_id: Optional[Any] = None,
        account_id: Optional[Any] = None
    ) -> List[Dict[str, Any]]:
        """
        Returns full drill-down lineage: GL Line -> Journal Entry -> Source Document.
        """
        lines = JournalEntryLine.objects.filter(
            company=company, journal_entry__status='POSTED', is_deleted=False
        ).select_related('account', 'journal_entry', 'site', 'contract', 'crm_entity')

        if site_id: lines = lines.filter(site_id=site_id)
        if contract_id: lines = lines.filter(contract_id=contract_id)
        if client_id: lines = lines.filter(crm_entity_id=client_id)
        if account_id: lines = lines.filter(account_id=account_id)

        drilldown = []
        for l in lines[:100]:
            je = l.journal_entry
            drilldown.append({
                'line_id': str(l.id),
                'entry_number': je.entry_number,
                'posting_date': str(je.posting_date),
                'account_code': l.account.account_code,
                'account_name': l.account.account_name,
                'debit': l.debit,
                'credit': l.credit,
                'description': l.description or je.description,
                'site_name': l.site.name if l.site else '—',
                'contract_number': getattr(l.contract, 'contract_code', getattr(l.contract, 'contract_number', '—')) if l.contract else '—',
                'client_name': l.crm_entity.name if l.crm_entity else '—',
                'source_type': je.source_type or 'Manual',
                'source_id': je.source_id or '—',
                'source_number': je.source_number or '—',
            })
        return drilldown
