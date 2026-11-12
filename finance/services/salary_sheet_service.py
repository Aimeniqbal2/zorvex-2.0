"""
finance/services/salary_sheet_service.py

Multi-tenant Monthly Salary Sheet builder, immutable persistence engine,
payment/hold processor, and sticky payroll preference manager.
"""
import calendar
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, List, Optional, Tuple

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone


def _round_pkr(val: Any) -> Decimal:
    """Round currency amounts to nearest whole PKR (matching Salary Sheet precision)."""
    if val is None:
        return Decimal('0')
    d = Decimal(str(val)) if not isinstance(val, Decimal) else val
    return d.quantize(Decimal('1'), rounding=ROUND_HALF_UP)


def _q2(val: Any) -> Decimal:
    if val is None:
        return Decimal('0.00')
    d = Decimal(str(val)) if not isinstance(val, Decimal) else val
    return d.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


class SalarySheetService:
    """
    Computes live monthly Salary Sheet data (matching Finance Sample Sheet) from
    Operations DailyDutyPay, CRM Costing Rules & ClientLocation settings,
    HR Employee Doc Charges, Payroll Deductions, Approved Overtime, and Advances.
    """

    OT_STATUSES = {'OVERTIME', 'O', 'OVERTIME_DOZING', 'OD'}
    PRESENT_PLUS_OT_STATUSES = {'PO', 'POD'}
    HALF_DAY_STATUSES = {'HALF_DAY', 'HD'}
    WORKED_WEEK_OFF_STATUSES = {'WP'}
    ABSENT_STATUSES = {'ABSENT', 'A', 'UNPAID_LEAVE', 'L', 'LEAVE', 'WEEK_OFF', 'W'}
    PAID_REGULAR_STATUSES = {'PRESENT', 'P', 'PO', 'POD', 'HALF_DAY', 'HD', 'WP', 'LATE'}

    @classmethod
    def resolve_month_context(cls, company, month_param: Optional[str] = None) -> Tuple[str, str, str, List[str], date, date, int]:
        from operations.models import DailyDutyPay
        from finance.models import SalarySheet

        today = timezone.now().date()
        current_month = f"{today.year:04d}-{today.month:02d}"
        if today.month == 1:
            previous_month = f"{today.year - 1:04d}-12"
        else:
            previous_month = f"{today.year:04d}-{today.month - 1:02d}"

        duty_dates = list(
            DailyDutyPay.objects.filter(company=company, is_deleted=False)
            .dates('duty_date', 'month', order='DESC')[:36]
        )
        sheet_months = list(
            SalarySheet.objects.filter(company=company, is_deleted=False)
            .values_list('month', flat=True)
        )

        avail_set = {current_month, previous_month}
        for d in duty_dates:
            avail_set.add(f"{d.year:04d}-{d.month:02d}")
        for m in sheet_months:
            if m and len(str(m)) == 7:
                avail_set.add(str(m))

        available_months = sorted(avail_set, reverse=True)

        selected_month = (month_param or '').strip()
        if not selected_month or selected_month.upper() == 'AUTO':
            latest_duty_month = f"{duty_dates[0].year:04d}-{duty_dates[0].month:02d}" if duty_dates else ''
            has_prev = any(f"{d.year:04d}-{d.month:02d}" == previous_month for d in duty_dates)
            selected_month = previous_month if has_prev else (latest_duty_month or previous_month)

        try:
            year_val, month_val = map(int, selected_month.split('-'))
            if month_val < 1 or month_val > 12:
                raise ValueError
        except Exception:
            year_val, month_val = int(previous_month[:4]), int(previous_month[5:7])
            selected_month = previous_month

        days_in_month = calendar.monthrange(year_val, month_val)[1]
        period_start = date(year_val, month_val, 1)
        period_end = date(year_val, month_val, days_in_month)
        if selected_month not in available_months:
            available_months = sorted(set(available_months) | {selected_month}, reverse=True)

        return selected_month, current_month, previous_month, available_months, period_start, period_end, days_in_month

    @classmethod
    def get_crm_costing_rules(cls, company) -> Dict[str, Any]:
        from security_crm.models import SecurityCostingSetting
        setting = SecurityCostingSetting.objects.filter(company=company, is_deleted=False).first()
        if not setting:
            setting, _ = SecurityCostingSetting.objects.get_or_create(
                company=company,
                defaults={
                    'eobi_rate': Decimal('1500.00'),
                    'sessi_minimum_wage': Decimal('37000.00'),
                    'sessi_percentage': Decimal('6.00'),
                    'admin_charges_percentage': Decimal('5.00'),
                    'insurance_percentage': Decimal('2.00'),
                    'four_hrs_ot_amount': Decimal('1000.00'),
                    'site_allowance_amount': Decimal('1000.00'),
                    'eobi_default_enabled': False,
                    'sessi_default_enabled': False,
                    'admin_charges_default_enabled': False,
                    'insurance_default_enabled': False,
                    'four_hrs_ot_default_enabled': True,
                    'site_allowance_default_enabled': True,
                }
            )
        return {
            'eobi_rate': _q2(setting.eobi_rate),
            'sessi_minimum_wage': _q2(setting.sessi_minimum_wage),
            'sessi_percentage': _q2(setting.sessi_percentage),
            'admin_charges_percentage': _q2(setting.admin_charges_percentage),
            'insurance_percentage': _q2(setting.insurance_percentage),
            'four_hrs_ot_amount': _round_pkr(setting.four_hrs_ot_amount),
            'site_allowance_amount': _round_pkr(setting.site_allowance_amount),
            'eobi_default_enabled': bool(setting.eobi_default_enabled),
            'sessi_default_enabled': bool(setting.sessi_default_enabled),
            'admin_charges_default_enabled': bool(setting.admin_charges_default_enabled),
            'insurance_default_enabled': bool(setting.insurance_default_enabled),
            'four_hrs_ot_default_enabled': bool(setting.four_hrs_ot_default_enabled),
            'site_allowance_default_enabled': bool(setting.site_allowance_default_enabled),
        }

    @classmethod
    def get_company_branding(cls, company) -> Dict[str, Any]:
        try:
            from billing.services.invoice_template_service import get_company_branding_defaults
            return get_company_branding_defaults(company)
        except Exception:
            logo_url = ''
            try:
                if getattr(company, 'logo', None) and getattr(company.logo, 'name', ''):
                    logo_url = company.logo.url
            except Exception:
                logo_url = ''
            return {
                'company_id': str(company.id) if company else '',
                'company_name': company.name if company else '',
                'logo_url': logo_url,
                'address': getattr(company, 'address', '') or '',
                'phone': getattr(company, 'phone', '') or '',
                'email': getattr(company, 'email', '') or '',
                'website': '',
                'ntn': '',
                'strn': '',
            }

    @classmethod
    def _build_location_lookup(cls, company):
        from security_crm.models import ClientLocation
        loc_by_key = {}
        loc_by_name = {}
        for loc in ClientLocation.objects.filter(company=company, is_deleted=False):
            nm = (loc.name or '').strip().lower()
            if not nm:
                continue
            loc_by_key[(str(loc.customer_id), nm)] = loc
            if nm not in loc_by_name:
                loc_by_name[nm] = loc
        return loc_by_key, loc_by_name

    @classmethod
    def _resolve_client_location(cls, loc_by_key, loc_by_name, crm_entity_id, site_name: str):
        nm = (site_name or '').strip().lower()
        if not nm:
            return None
        if crm_entity_id:
            hit = loc_by_key.get((str(crm_entity_id), nm))
            if hit:
                return hit
        return loc_by_name.get(nm)

    @classmethod
    def build_live_salary_sheet_preview(cls, company, month_param: Optional[str] = None) -> Dict[str, Any]:
        from hrm.models import (
            Employee, EmployeeSalaryAssignment, CompanyPayrollPolicy,
            OvertimeRecord, OvertimeStatus, OvertimeType
        )
        from operations.models import (
            DailyDutyPay, DutyType, Deployment,
            PayrollAddition, PayrollAdditionFrequency,
            PayrollDeduction, PayrollDeductionType, PayrollDeductionFrequency
        )
        from finance.models import (
            FinancePaymentMode, EmployeePayrollPreference,
            MonthlyPayrollDraftInput, SalarySheet,
            EmployeeAdvance, AdvanceStatus, AdvanceRecoveryMethod
        )

        (
            selected_month, current_month, previous_month, available_months,
            period_start, period_end, days_in_month
        ) = cls.resolve_month_context(company, month_param)

        crm_rules = cls.get_crm_costing_rules(company)
        branding = cls.get_company_branding(company)
        loc_by_key, loc_by_name = cls._build_location_lookup(company)

        payment_modes = list(
            FinancePaymentMode.objects.filter(company=company, is_active=True, is_deleted=False)
            .order_by('-is_default', 'name')
        )
        default_mode_obj = next((m for m in payment_modes if m.is_default), payment_modes[0] if payment_modes else None)
        default_mode_name = default_mode_obj.name if default_mode_obj else 'Cash'

        existing_sheet = SalarySheet.objects.filter(
            company=company, month=selected_month, is_deleted=False
        ).first()

        # 1. Gather all DailyDutyPay rows for this month
        dp_rows = list(
            DailyDutyPay.objects.filter(
                company=company, duty_date__gte=period_start, duty_date__lte=period_end, is_deleted=False
            ).values(
                'employee_id', 'site_id', 'site__name', 'site__crm_entity_id',
                'client_id', 'duty_type', 'attendance_status',
                'payable_amount', 'daily_payable_rate', 'duty_date'
            )
        )

        emp_stats: Dict[str, Dict[str, Any]] = {}
        # emp_id -> site_key -> {'site_id', 'site_name', 'crm_entity_id', 'regular': Decimal, 'ot': Decimal}
        emp_site_shifts: Dict[str, Dict[str, Dict[str, Any]]] = defaultdict(dict)

        for dp in dp_rows:
            eid = str(dp['employee_id'])
            st = emp_stats.get(eid)
            if st is None:
                st = {
                    'paid_shifts': Decimal('0'),
                    'ot_shifts': Decimal('0'),
                    'raw_ot_earnings': Decimal('0.00'),
                    'raw_duty_earnings': Decimal('0.00'),
                    'daily_rates': [],
                    'worked_locations': [],
                }
                emp_stats[eid] = st

            att = str(dp['attendance_status'] or '').upper().strip()
            duty_type = str(dp['duty_type'] or '').upper().strip()
            amt = _q2(dp['payable_amount'])
            rate = _q2(dp['daily_payable_rate'])

            site_id_str = str(dp['site_id']) if dp['site_id'] else ''
            site_name = (dp['site__name'] or '').strip()
            crm_eid = str(dp['site__crm_entity_id'] or dp['client_id'] or '')

            reg_inc = Decimal('0')
            ot_inc = Decimal('0')

            if duty_type == DutyType.OVERTIME or att in cls.OT_STATUSES:
                ot_inc = Decimal('1')
                st['ot_shifts'] += Decimal('1')
                st['raw_ot_earnings'] += amt
            elif att in cls.PRESENT_PLUS_OT_STATUSES:
                reg_inc = Decimal('1')
                ot_inc = Decimal('1')
                st['paid_shifts'] += Decimal('1')
                st['ot_shifts'] += Decimal('1')
                st['raw_duty_earnings'] += rate if rate > 0 else amt
                if rate > 0 and amt > rate:
                    st['raw_ot_earnings'] += (amt - rate)
                if rate > 0:
                    st['daily_rates'].append(rate)
            elif att in cls.WORKED_WEEK_OFF_STATUSES:
                reg_inc = Decimal('1')
                ot_inc = Decimal('1')
                st['paid_shifts'] += Decimal('1')
                st['ot_shifts'] += Decimal('1')
                if rate > 0 and amt > rate:
                    st['raw_duty_earnings'] += rate
                    st['raw_ot_earnings'] += (amt - rate)
                else:
                    st['raw_duty_earnings'] += amt
                if rate > 0:
                    st['daily_rates'].append(rate)
            elif att in cls.HALF_DAY_STATUSES:
                reg_inc = Decimal('0.5')
                st['paid_shifts'] += Decimal('0.5')
                st['raw_duty_earnings'] += amt
                if rate > 0:
                    st['daily_rates'].append(rate)
            elif att in cls.ABSENT_STATUSES:
                # Absent / Unpaid leave / Week off: 0 paid shifts unless explicitly paid > 0
                if amt > Decimal('0') and att in ('WEEK_OFF', 'W'):
                    reg_inc = Decimal('1')
                    st['paid_shifts'] += Decimal('1')
                    st['raw_duty_earnings'] += amt
                    if rate > 0:
                        st['daily_rates'].append(rate)
            else:
                reg_inc = Decimal('1')
                st['paid_shifts'] += Decimal('1')
                st['raw_duty_earnings'] += amt
                if rate > 0:
                    st['daily_rates'].append(rate)

            if site_name and (reg_inc > 0 or ot_inc > 0):
                s_key = site_id_str or site_name.lower()
                s_entry = emp_site_shifts[eid].get(s_key)
                if s_entry is None:
                    s_entry = {
                        'site_id': site_id_str,
                        'site_name': site_name,
                        'crm_entity_id': crm_eid,
                        'regular_shifts': Decimal('0'),
                        'ot_shifts': Decimal('0'),
                    }
                    emp_site_shifts[eid][s_key] = s_entry
                s_entry['regular_shifts'] += reg_inc
                s_entry['ot_shifts'] += ot_inc

        # Also check employees who have HR doc charges explicitly scheduled for this month or approved deductions/additions
        doc_charge_emp_ids = set(
            str(eid) for eid in Employee.objects.filter(
                company=company, is_deleted=False,
                doc_charges_enabled=True, doc_charges_month=selected_month
            ).values_list('id', flat=True)
        )

        # Fallback site assignments for employees without attendance sites
        deploy_site_by_emp = {}
        for d_eid, d_sid, d_sname, d_cid in Deployment.objects.filter(
            company=company, is_deleted=False, status='ACTIVE', site__isnull=False
        ).values_list('employee_id', 'site_id', 'site__name', 'site__crm_entity_id'):
            k = str(d_eid)
            if k not in deploy_site_by_emp and d_sname:
                deploy_site_by_emp[k] = {
                    'site_id': str(d_sid),
                    'site_name': d_sname,
                    'crm_entity_id': str(d_cid or ''),
                }

        all_emp_ids = list(set(emp_stats.keys()) | doc_charge_emp_ids)
        employees_map = {
            str(e.id): e for e in Employee.objects.filter(
                company=company, id__in=all_emp_ids, is_deleted=False
            ).select_related('designation', 'department')
        }

        # Sticky Preferences & Draft Inputs
        prefs_by_emp = {
            str(p.employee_id): p for p in EmployeePayrollPreference.objects.filter(
                company=company, employee_id__in=all_emp_ids, is_deleted=False
            ).select_related('payment_mode')
        }
        drafts_by_emp = {
            str(d.employee_id): d for d in MonthlyPayrollDraftInput.objects.filter(
                company=company, month=selected_month, employee_id__in=all_emp_ids, is_deleted=False
            ).select_related('payment_mode')
        }

        # Active Salary Assignments
        sa_by_emp = {}
        sa_fallback = {}
        for sa in EmployeeSalaryAssignment.objects.filter(
            company=company, employee_id__in=all_emp_ids, status='ACTIVE', is_deleted=False
        ).order_by('-effective_from'):
            seid = str(sa.employee_id)
            if seid not in sa_fallback:
                sa_fallback[seid] = sa
            if sa.effective_from <= period_end and (sa.effective_to is None or sa.effective_to >= period_end):
                if seid not in sa_by_emp:
                    sa_by_emp[seid] = sa
        for seid, sa in sa_fallback.items():
            if seid not in sa_by_emp:
                sa_by_emp[seid] = sa

        # Approved OvertimeRecord + PayrollAddition
        policy = CompanyPayrollPolicy.objects.filter(company=company, is_active=True).first()
        overtimes_by_emp = defaultdict(list)
        for ot in OvertimeRecord.objects.filter(
            company=company, employee_id__in=all_emp_ids,
            date__gte=period_start, date__lte=period_end,
            status=OvertimeStatus.APPROVED, is_deleted=False
        ):
            overtimes_by_emp[str(ot.employee_id)].append(ot)

        additions_by_emp = defaultdict(Decimal)
        for add in PayrollAddition.objects.filter(
            company=company, employee_id__in=all_emp_ids,
            is_active=True, is_approved=True, is_deleted=False
        ).filter(
            (Q(frequency=PayrollAdditionFrequency.ONE_TIME) & Q(effective_date__gte=period_start) & Q(effective_date__lte=period_end)) |
            (Q(frequency=PayrollAdditionFrequency.RECURRING) & Q(effective_from__lte=period_end) & (Q(effective_to__isnull=True) | Q(effective_to__gte=period_start)))
        ).values('employee_id', 'amount'):
            additions_by_emp[str(add['employee_id'])] += _q2(add['amount'])

        # Fine & Other Deductions
        fine_ded_by_emp = defaultdict(Decimal)
        other_ded_by_emp = defaultdict(Decimal)
        adv_explicit_by_emp = defaultdict(Decimal)
        for ded in PayrollDeduction.objects.filter(
            company=company, employee_id__in=all_emp_ids,
            is_active=True, is_approved=True, is_deleted=False
        ).filter(
            (Q(frequency=PayrollDeductionFrequency.ONE_TIME) & Q(effective_date__gte=period_start) & Q(effective_date__lte=period_end)) |
            (Q(frequency=PayrollDeductionFrequency.RECURRING) & Q(effective_from__lte=period_end) & (Q(effective_to__isnull=True) | Q(effective_to__gte=period_start)))
        ).values('employee_id', 'deduction_type', 'amount'):
            deid = str(ded['employee_id'])
            dtype = ded['deduction_type']
            damt = _q2(ded['amount'])
            if dtype == PayrollDeductionType.ADVANCE_RECOVERY:
                adv_explicit_by_emp[deid] += damt
            elif dtype == 'FINE':
                fine_ded_by_emp[deid] += damt
            else:
                other_ded_by_emp[deid] += damt

        # Advances (Paid and due on or before period_end)
        auto_adv_by_emp = defaultdict(Decimal)
        outstanding_adv_by_emp = defaultdict(Decimal)
        for adv in EmployeeAdvance.objects.filter(
            company=company, employee_id__in=all_emp_ids,
            status=AdvanceStatus.PAID, outstanding_balance__gt=0, is_deleted=False
        ).values(
            'employee_id', 'outstanding_balance', 'recovery_method',
            'payroll_deduction_ready', 'advance_date', 'expected_settlement_date'
        ):
            aeid = str(adv['employee_id'])
            bal = _q2(adv['outstanding_balance'])
            outstanding_adv_by_emp[aeid] += bal
            due_date = adv['expected_settlement_date'] or adv['advance_date']
            if (
                adv['payroll_deduction_ready']
                and adv['recovery_method'] in (AdvanceRecoveryMethod.PAYROLL_DEDUCTION, AdvanceRecoveryMethod.MIXED)
                and (due_date is None or due_date <= period_end)
            ):
                auto_adv_by_emp[aeid] += bal

        def _code_sort_key(eid_val: str):
            emp_obj = employees_map.get(eid_val)
            raw_code = (getattr(emp_obj, 'display_code', None) or getattr(emp_obj, 'employee_code', None) or '') if emp_obj else ''
            digits = ''.join(ch for ch in str(raw_code) if ch.isdigit())
            return (0, int(digits), str(raw_code)) if digits else (1, 0, (emp_obj.first_name if emp_obj else '').lower())

        sorted_eids = sorted([eid for eid in all_emp_ids if eid in employees_map], key=_code_sort_key)

        rows: List[Dict[str, Any]] = []
        totals = defaultdict(Decimal)

        for idx, eid in enumerate(sorted_eids, start=1):
            emp = employees_map[eid]
            st = emp_stats.get(eid, {
                'paid_shifts': Decimal('0'),
                'ot_shifts': Decimal('0'),
                'raw_ot_earnings': Decimal('0.00'),
                'raw_duty_earnings': Decimal('0.00'),
                'daily_rates': [],
            })

            paid_shifts = st['paid_shifts']
            ot_shifts = st['ot_shifts']

            # Basic Salary resolution
            sa = sa_by_emp.get(eid)
            basic_salary = _round_pkr(sa.base_salary) if (sa and sa.base_salary and sa.base_salary > 0) else Decimal('0')
            if basic_salary <= 0 and st['daily_rates']:
                avg_daily = sum(st['daily_rates']) / Decimal(len(st['daily_rates']))
                basic_salary = _round_pkr(avg_daily * Decimal(days_in_month))

            # Preference + Month Draft overrides
            pref = prefs_by_emp.get(eid)
            draft = drafts_by_emp.get(eid)

            if draft and draft.four_hrs_ot_enabled is not None:
                four_hrs_ot_enabled = bool(draft.four_hrs_ot_enabled)
            elif pref is not None:
                four_hrs_ot_enabled = bool(pref.four_hrs_ot_enabled)
            else:
                four_hrs_ot_enabled = crm_rules['four_hrs_ot_default_enabled']

            if draft and draft.site_allowance_enabled is not None:
                site_allowance_enabled = bool(draft.site_allowance_enabled)
            elif pref is not None:
                site_allowance_enabled = bool(pref.site_allowance_enabled)
            else:
                site_allowance_enabled = crm_rules['site_allowance_default_enabled']

            four_hrs_ot_amount = crm_rules['four_hrs_ot_amount'] if four_hrs_ot_enabled else Decimal('0')
            site_allowance_amount = crm_rules['site_allowance_amount'] if site_allowance_enabled else Decimal('0')

            total_salary = basic_salary + four_hrs_ot_amount + site_allowance_amount

            # Prorated Salary = Total Salary if paid_shifts >= total_shifts, else round((Total Salary / total_shifts) * paid_shifts)
            if paid_shifts <= 0:
                prorated_salary = Decimal('0')
            elif paid_shifts == Decimal(days_in_month):
                prorated_salary = total_salary
            else:
                prorated_salary = _round_pkr((total_salary / Decimal(days_in_month)) * paid_shifts)

            # Overtime Payable (Muster OT + Approved OvertimeRecord + PayrollAddition)
            ot_record_amt = Decimal('0.00')
            for ot in overtimes_by_emp.get(eid, ()):
                hrs = _q2(ot.hours)
                is_dbl = (ot.ot_type == OvertimeType.DOUBLE_OT)
                if ot.rate_override and ot.rate_override > 0:
                    ot_rate = _q2(ot.rate_override)
                elif sa and is_dbl and sa.double_ot_rate and sa.double_ot_rate > 0:
                    ot_rate = _q2(sa.double_ot_rate)
                elif sa and (not is_dbl) and sa.single_ot_rate and sa.single_ot_rate > 0:
                    ot_rate = _q2(sa.single_ot_rate)
                elif policy and is_dbl and getattr(policy, 'default_double_ot_rate', None):
                    ot_rate = _q2(policy.default_double_ot_rate)
                elif policy and (not is_dbl) and getattr(policy, 'default_single_ot_rate', None):
                    ot_rate = _q2(policy.default_single_ot_rate)
                elif total_salary > 0:
                    std_h = Decimal(str(getattr(policy, 'standard_monthly_hours', 240) or 240))
                    ot_rate = _q2((total_salary / std_h) * (Decimal('2') if is_dbl else Decimal('1')))
                else:
                    ot_rate = Decimal('0.00')
                ot_record_amt += (hrs * ot_rate)

            overtime_payable = _round_pkr(st['raw_ot_earnings'] + ot_record_amt + additions_by_emp.get(eid, Decimal('0')))
            gross_salary_payable = prorated_salary + overtime_payable

            # Doc Charges (only deducted in employee.doc_charges_month == selected_month)
            if (
                emp.doc_charges_enabled
                and (emp.doc_charges_month or '').strip() == selected_month
                and Decimal(str(emp.doc_charges_amount or 0)) > 0
            ):
                doc_charges = _round_pkr(emp.doc_charges_amount)
            else:
                doc_charges = Decimal('0')

            # Locations Worked & Location-Wise EOBI / Admin Charges / Insurance
            worked_sites = list(emp_site_shifts.get(eid, {}).values())
            if not worked_sites and eid in deploy_site_by_emp:
                ds = deploy_site_by_emp[eid]
                worked_sites = [{
                    'site_id': ds['site_id'],
                    'site_name': ds['site_name'],
                    'crm_entity_id': ds['crm_entity_id'],
                    'regular_shifts': Decimal('0'),
                    'ot_shifts': Decimal('0'),
                }]

            eobi_enabled = False
            eobi_rate_val = crm_rules['eobi_rate']
            admin_enabled = False
            admin_pct_val = crm_rules['admin_charges_percentage']
            insurance_enabled = False
            insurance_pct_val = crm_rules['insurance_percentage']

            locations_summary = []
            loc_text_parts = []
            primary_site_id = None

            for s_idx, ws in enumerate(sorted(worked_sites, key=lambda x: x['regular_shifts'] + x['ot_shifts'], reverse=True)):
                if s_idx == 0 and ws['site_id']:
                    primary_site_id = ws['site_id']
                reg_s = ws['regular_shifts']
                ot_s = ws['ot_shifts']
                reg_fmt = int(reg_s) if reg_s == int(reg_s) else float(reg_s)
                ot_fmt = int(ot_s) if ot_s == int(ot_s) else float(ot_s)
                shift_bits = []
                if reg_s > 0:
                    shift_bits.append(f"{reg_fmt}D")
                if ot_s > 0:
                    shift_bits.append(f"{ot_fmt}OT")
                badge = f"{ws['site_name']} ({', '.join(shift_bits)})" if shift_bits else ws['site_name']
                loc_text_parts.append(badge)
                locations_summary.append({
                    'site_id': ws['site_id'],
                    'site_name': ws['site_name'],
                    'regular_shifts': float(reg_s),
                    'ot_shifts': float(ot_s),
                    'label': badge,
                })

                # Location CRM Costing Rule check (only applies if employee worked/was present at this site or has no worked shifts)
                cl = cls._resolve_client_location(loc_by_key, loc_by_name, ws['crm_entity_id'], ws['site_name'])
                if cl:
                    if cl.eobi_enabled:
                        eobi_enabled = True
                        if cl.eobi_rate is not None and cl.eobi_rate > 0:
                            eobi_rate_val = _q2(cl.eobi_rate)
                    if cl.admin_charges_enabled:
                        admin_enabled = True
                        if cl.admin_charges_percentage is not None:
                            admin_pct_val = _q2(cl.admin_charges_percentage)
                    if cl.insurance_enabled:
                        insurance_enabled = True
                        if cl.insurance_percentage is not None:
                            insurance_pct_val = _q2(cl.insurance_percentage)

            eobi_amount = _round_pkr(eobi_rate_val) if (eobi_enabled and paid_shifts > 0) else Decimal('0')
            admin_charges = _round_pkr(total_salary * admin_pct_val / Decimal('100')) if (admin_enabled and paid_shifts > 0 and total_salary > 0) else Decimal('0')
            insurance_amount = _round_pkr(total_salary * insurance_pct_val / Decimal('100')) if (insurance_enabled and paid_shifts > 0 and total_salary > 0) else Decimal('0')

            # Manual Fine + recorded FINE deductions
            manual_fine = _round_pkr(draft.fine_amount) if draft else Decimal('0')
            fine_amount = manual_fine + _round_pkr(fine_ded_by_emp.get(eid, Decimal('0')))
            other_deductions = _round_pkr(other_ded_by_emp.get(eid, Decimal('0')))

            # Advance recovery (explicit deduction or auto advance)
            explicit_adv = _round_pkr(adv_explicit_by_emp.get(eid, Decimal('0')))
            auto_adv = _round_pkr(auto_adv_by_emp.get(eid, Decimal('0')))
            advance_amount = explicit_adv if explicit_adv > 0 else auto_adv

            total_deduction = (
                doc_charges + eobi_amount + admin_charges + fine_amount
                + insurance_amount + advance_amount + other_deductions
            )
            net_salary_payable = gross_salary_payable - total_deduction

            # Sticky Mode of Payment resolution
            if draft and (draft.payment_mode_id or draft.payment_mode_name):
                mode_id = str(draft.payment_mode_id) if draft.payment_mode_id else None
                mode_name = draft.payment_mode.name if draft.payment_mode else draft.payment_mode_name
            elif pref and (pref.payment_mode_id or pref.payment_mode_name):
                mode_id = str(pref.payment_mode_id) if pref.payment_mode_id else None
                mode_name = pref.payment_mode.name if pref.payment_mode else pref.payment_mode_name
            else:
                mode_id = str(default_mode_obj.id) if default_mode_obj else None
                mode_name = default_mode_name

            oss_code = getattr(emp, 'display_code', None) or emp.employee_code or eid[:6]
            emp_name = f"{emp.first_name} {emp.last_name}".strip()
            contact = (emp.phone or emp.telephone_number or '').strip()

            row = {
                'serial_no': idx,
                'employee_id': eid,
                'oss_code': oss_code,
                'employee_name': emp_name,
                'father_name': emp.father_name or '',
                'designation_name': emp.designation.name if emp.designation else 'Security Guard',
                'department_name': emp.department.name if emp.department else 'Security Operations',
                'basic_salary': float(basic_salary),
                'four_hrs_ot_enabled': four_hrs_ot_enabled,
                'four_hrs_ot_amount': float(four_hrs_ot_amount),
                'site_allowance_enabled': site_allowance_enabled,
                'site_allowance_amount': float(site_allowance_amount),
                'total_salary': float(total_salary),
                'total_shifts': days_in_month,
                'paid_shifts': float(paid_shifts),
                'overtime_shifts': float(ot_shifts),
                'prorated_salary': float(prorated_salary),
                'overtime_payable': float(overtime_payable),
                'gross_salary_payable': float(gross_salary_payable),
                'doc_charges': float(doc_charges),
                'doc_charges_enabled': bool(emp.doc_charges_enabled and (emp.doc_charges_month or '').strip() == selected_month),
                'doc_charges_paid': bool(emp.doc_charges_paid),
                'eobi_amount': float(eobi_amount),
                'eobi_enabled': eobi_enabled,
                'admin_charges': float(admin_charges),
                'admin_charges_enabled': admin_enabled,
                'fine_amount': float(fine_amount),
                'manual_fine_amount': float(manual_fine),
                'insurance_amount': float(insurance_amount),
                'insurance_enabled': insurance_enabled,
                'advance_amount': float(advance_amount),
                'outstanding_advance': float(outstanding_adv_by_emp.get(eid, Decimal('0'))),
                'other_deductions': float(other_deductions),
                'total_deduction': float(total_deduction),
                'net_salary_payable': float(net_salary_payable),
                'payment_mode_id': mode_id,
                'mode_of_payment': mode_name,
                'locations_summary': locations_summary,
                'locations_text': ', '.join(loc_text_parts),
                'primary_site_id': primary_site_id,
                'contact_number': contact,
                'cnic_number': emp.cnic_number or '',
                'cnic_issue_date': emp.cnic_issue_date.isoformat() if emp.cnic_issue_date else None,
            }
            rows.append(row)

            totals['basic_salary'] += basic_salary
            totals['four_hrs_ot'] += four_hrs_ot_amount
            totals['site_allowance'] += site_allowance_amount
            totals['total_salary'] += total_salary
            totals['prorated_salary'] += prorated_salary
            totals['overtime_payable'] += overtime_payable
            totals['gross_salary_payable'] += gross_salary_payable
            totals['doc_charges'] += doc_charges
            totals['eobi_amount'] += eobi_amount
            totals['admin_charges'] += admin_charges
            totals['fine_amount'] += fine_amount
            totals['insurance_amount'] += insurance_amount
            totals['advance_amount'] += advance_amount
            totals['other_deductions'] += other_deductions
            totals['total_deduction'] += total_deduction
            totals['net_salary_payable'] += net_salary_payable

        return {
            'month': selected_month,
            'current_month': current_month,
            'previous_month': previous_month,
            'available_months': available_months,
            'period_start': period_start.isoformat(),
            'period_end': period_end.isoformat(),
            'days_in_month': days_in_month,
            'has_generated_sheet': existing_sheet is not None,
            'existing_sheet_id': str(existing_sheet.id) if existing_sheet else None,
            'existing_sheet_number': existing_sheet.sheet_number if existing_sheet else None,
            'crm_rules': {k: (float(v) if isinstance(v, Decimal) else v) for k, v in crm_rules.items()},
            'branding': branding,
            'payment_modes': [
                {'id': str(m.id), 'name': m.name, 'code': m.code, 'is_default': m.is_default}
                for m in payment_modes
            ],
            'totals': {k: float(v) for k, v in totals.items()},
            'employee_count': len(rows),
            'rows': rows,
        }

    @classmethod
    @transaction.atomic
    def update_draft_line(cls, company, user, data: Dict[str, Any]) -> Dict[str, Any]:
        from hrm.models import Employee
        from finance.models import FinancePaymentMode, EmployeePayrollPreference, MonthlyPayrollDraftInput

        month = (data.get('month') or '').strip()
        employee_id = data.get('employee_id')
        if not month or not employee_id:
            raise ValidationError("month and employee_id are required.")

        emp = Employee.objects.filter(id=employee_id, company=company, is_deleted=False).first()
        if not emp:
            raise ValidationError("Employee not found.")

        pref, _ = EmployeePayrollPreference.objects.get_or_create(
            company=company, employee=emp, defaults={'is_deleted': False}
        )
        draft, _ = MonthlyPayrollDraftInput.objects.get_or_create(
            company=company, employee=emp, month=month, defaults={'is_deleted': False}
        )

        if 'four_hrs_ot_enabled' in data and data['four_hrs_ot_enabled'] is not None:
            val = bool(data['four_hrs_ot_enabled'])
            draft.four_hrs_ot_enabled = val
            pref.four_hrs_ot_enabled = val

        if 'site_allowance_enabled' in data and data['site_allowance_enabled'] is not None:
            val = bool(data['site_allowance_enabled'])
            draft.site_allowance_enabled = val
            pref.site_allowance_enabled = val

        if 'fine_amount' in data and data['fine_amount'] is not None:
            try:
                fine_dec = max(Decimal('0.00'), _q2(data['fine_amount']))
            except Exception:
                fine_dec = Decimal('0.00')
            draft.fine_amount = fine_dec

        if 'payment_mode_id' in data or 'mode_of_payment' in data:
            pm = None
            pm_id = data.get('payment_mode_id')
            pm_name = (data.get('mode_of_payment') or '').strip()
            if pm_id:
                pm = FinancePaymentMode.objects.filter(id=pm_id, company=company, is_deleted=False).first()
            elif pm_name:
                pm = FinancePaymentMode.objects.filter(name__iexact=pm_name, company=company, is_deleted=False).first()
            resolved_name = pm.name if pm else pm_name
            draft.payment_mode = pm
            draft.payment_mode_name = resolved_name
            pref.payment_mode = pm
            pref.payment_mode_name = resolved_name

        pref.save()
        draft.save()
        return {'success': True, 'employee_id': str(emp.id), 'month': month}

    @classmethod
    @transaction.atomic
    def make_salary_sheet(cls, company, user, month_param: str, overrides: Optional[List[Dict[str, Any]]] = None, notes: str = '') -> 'SalarySheet':
        from finance.models import SalarySheet, SalarySheetLine, FinancePaymentMode

        preview = cls.build_live_salary_sheet_preview(company, month_param)
        selected_month = preview['month']

        if SalarySheet.objects.filter(company=company, month=selected_month, is_deleted=False).exists():
            raise ValidationError(
                f"A Salary Sheet for {selected_month} already exists. Delete the existing sheet first if you want to recreate it."
            )

        if not preview['rows']:
            raise ValidationError(f"No employee attendance or payroll records found for {selected_month}.")

        # Persist any unsaved inline overrides sent with Make Salary Sheet
        if overrides:
            for ov in overrides:
                if ov.get('employee_id'):
                    ov_payload = dict(ov)
                    ov_payload['month'] = selected_month
                    cls.update_draft_line(company, user, ov_payload)
            preview = cls.build_live_salary_sheet_preview(company, selected_month)

        year_val, month_val = map(int, selected_month.split('-'))
        month_label = date(year_val, month_val, 1).strftime('%B-%Y').upper()

        prepared_by_name = ''
        if user:
            prepared_by_name = (user.get_full_name() or '').strip() or getattr(user, 'username', '') or getattr(user, 'email', '')

        sheet = SalarySheet.objects.create(
            company=company,
            month=selected_month,
            title=f"SALARY SHEET FOR THE MONTH OF {month_label}",
            period_start=date.fromisoformat(preview['period_start']),
            period_end=date.fromisoformat(preview['period_end']),
            days_in_month=preview['days_in_month'],
            status='FINALIZED',
            prepared_by=user,
            prepared_by_name=prepared_by_name,
            total_employees=len(preview['rows']),
            crm_rules_snapshot=preview['crm_rules'],
            notes=notes or '',
        )

        ym_clean = selected_month.replace('-', '')
        t_basic = Decimal('0')
        t_4ot = Decimal('0')
        t_sa = Decimal('0')
        t_sal = Decimal('0')
        t_ot = Decimal('0')
        t_gross = Decimal('0')
        t_doc = Decimal('0')
        t_eobi = Decimal('0')
        t_admin = Decimal('0')
        t_fine = Decimal('0')
        t_ins = Decimal('0')
        t_adv = Decimal('0')
        t_other = Decimal('0')
        t_ded = Decimal('0')
        t_net = Decimal('0')

        lines_to_create = []
        for row in preview['rows']:
            b = Decimal(str(row['basic_salary']))
            f_ot = Decimal(str(row['four_hrs_ot_amount']))
            s_al = Decimal(str(row['site_allowance_amount']))
            tot_s = Decimal(str(row['total_salary']))
            pror = Decimal(str(row['prorated_salary']))
            ot_p = Decimal(str(row['overtime_payable']))
            gross = Decimal(str(row['gross_salary_payable']))
            doc = Decimal(str(row['doc_charges']))
            eobi = Decimal(str(row['eobi_amount']))
            adm = Decimal(str(row['admin_charges']))
            fine = Decimal(str(row['fine_amount']))
            ins = Decimal(str(row['insurance_amount']))
            adv = Decimal(str(row['advance_amount']))
            oth = Decimal(str(row['other_deductions']))
            tot_d = Decimal(str(row['total_deduction']))
            net = Decimal(str(row['net_salary_payable']))

            t_basic += b
            t_4ot += f_ot
            t_sa += s_al
            t_sal += tot_s
            t_ot += ot_p
            t_gross += gross
            t_doc += doc
            t_eobi += eobi
            t_admin += adm
            t_fine += fine
            t_ins += ins
            t_adv += adv
            t_other += oth
            t_ded += tot_d
            t_net += net

            cnic_issue_dt = date.fromisoformat(row['cnic_issue_date']) if row.get('cnic_issue_date') else None
            ps_no = f"PS-{ym_clean}-{int(row['serial_no']):04d}"

            lines_to_create.append(SalarySheetLine(
                company=company,
                salary_sheet=sheet,
                employee_id=row['employee_id'],
                serial_no=row['serial_no'],
                oss_code=row['oss_code'],
                employee_name=row['employee_name'],
                father_name=row.get('father_name') or '',
                designation_name=row.get('designation_name') or '',
                department_name=row.get('department_name') or '',
                contact_number=row.get('contact_number') or '',
                cnic_number=row.get('cnic_number') or '',
                cnic_issue_date=cnic_issue_dt,
                basic_salary=b,
                four_hrs_ot_enabled=bool(row['four_hrs_ot_enabled']),
                four_hrs_ot_amount=f_ot,
                site_allowance_enabled=bool(row['site_allowance_enabled']),
                site_allowance_amount=s_al,
                total_salary=tot_s,
                total_shifts=row['total_shifts'],
                paid_shifts=Decimal(str(row['paid_shifts'])),
                overtime_shifts=Decimal(str(row['overtime_shifts'])),
                prorated_salary=pror,
                overtime_payable=ot_p,
                gross_salary_payable=gross,
                doc_charges=doc,
                eobi_amount=eobi,
                admin_charges=adm,
                fine_amount=fine,
                insurance_amount=ins,
                advance_amount=adv,
                other_deductions=oth,
                total_deduction=tot_d,
                net_salary_payable=net,
                mode_of_payment=row.get('mode_of_payment') or '',
                locations_summary=row.get('locations_summary') or [],
                locations_text=row.get('locations_text') or '',
                primary_site_id=row.get('primary_site_id') or None,
                payslip_number=ps_no,
                payment_status='UNPAID',
            ))

        SalarySheetLine.objects.bulk_create(lines_to_create, batch_size=500)

        sheet.total_basic_salary = t_basic
        sheet.total_four_hrs_ot = t_4ot
        sheet.total_site_allowance = t_sa
        sheet.total_salary = t_sal
        sheet.total_overtime_payable = t_ot
        sheet.total_gross_payable = t_gross
        sheet.total_doc_charges = t_doc
        sheet.total_eobi = t_eobi
        sheet.total_admin_charges = t_admin
        sheet.total_fine = t_fine
        sheet.total_insurance = t_ins
        sheet.total_advance = t_adv
        sheet.total_other_deductions = t_other
        sheet.total_deductions = t_ded
        sheet.total_net_payable = t_net
        sheet.save()

        # Sync AdvanceSheetLines as CLEARED where this SalarySheet deducted advances
        from finance.models import AdvanceSheetLine
        now_clear_ts = timezone.now()
        deducted_emp_ids = [row['employee_id'] for row in preview['rows'] if Decimal(str(row['advance_amount'])) > 0]
        if deducted_emp_ids:
            AdvanceSheetLine.objects.filter(
                company=company,
                employee_id__in=deducted_emp_ids,
                payment_status='PAID',
                deduction_status='NOT_DEDUCTED',
                advance_sheet__period_end__lte=sheet.period_end,
                is_deleted=False,
            ).update(
                deduction_status='CLEARED',
                cleared_in_salary_sheet=sheet,
                cleared_at=now_clear_ts,
            )

        return sheet

    @classmethod
    @transaction.atomic
    def delete_salary_sheet(cls, company, sheet_id) -> Dict[str, Any]:
        from finance.models import SalarySheet, AdvanceSheetLine
        sheet = SalarySheet.objects.filter(id=sheet_id, company=company, is_deleted=False).first()
        if not sheet:
            raise ValidationError("Salary Sheet not found.")
        if sheet.lines.filter(payment_status='PAID', is_deleted=False).exists() or (sheet.total_paid or 0) > 0:
            raise ValidationError("Cannot delete a Salary Sheet that already has PAID salary disbursements recorded.")
        # Revert any AdvanceSheetLines that had been marked CLEARED by this unpaid sheet
        AdvanceSheetLine.objects.filter(cleared_in_salary_sheet=sheet).update(
            deduction_status='NOT_DEDUCTED',
            cleared_in_salary_sheet=None,
            cleared_at=None,
        )
        month = sheet.month
        sheet_number = sheet.sheet_number
        # Hard-delete unpaid draft/generated sheet & its lines so month constraint stays clear
        sheet.lines.all().delete()
        sheet.delete()
        return {'success': True, 'deleted_month': month, 'deleted_sheet_number': sheet_number}

    @classmethod
    @transaction.atomic
    def toggle_line_hold(cls, company, user, line_id: str, reason: str = '') -> Dict[str, Any]:
        from finance.models import SalarySheetLine
        line = SalarySheetLine.objects.filter(id=line_id, company=company, is_deleted=False).select_related('payslip').first()
        if not line:
            raise ValidationError("Salary sheet line not found.")
        if line.payment_status == 'PAID':
            raise ValidationError("Cannot hold/unhold an already PAID salary line.")
        line.is_stop_payment = not bool(line.is_stop_payment)
        line.stop_payment_reason = (reason or '').strip() if line.is_stop_payment else ''
        line.save(update_fields=['is_stop_payment', 'stop_payment_reason'])

        if line.payslip:
            line.payslip._allow_frozen_update = True
            line.payslip.is_stop_payment = line.is_stop_payment
            line.payslip.stop_payment_reason = line.stop_payment_reason
            line.payslip.save(update_fields=['is_stop_payment', 'stop_payment_reason'])

        return {
            'success': True,
            'line_id': str(line.id),
            'is_stop_payment': line.is_stop_payment,
            'stop_payment_reason': line.stop_payment_reason,
        }

    @classmethod
    @transaction.atomic
    def pay_salary_sheet_lines(
        cls,
        company,
        user,
        sheet_id: str,
        line_ids: Optional[List[str]] = None,
        treasury_account_id: Optional[str] = None,
        payment_date_str: Optional[str] = None,
        payment_reference: str = '',
        notes: str = ''
    ) -> Dict[str, Any]:
        from finance.models import (
            SalarySheet, SalarySheetLine, BankAccount,
            FinancialVoucher, VoucherType, VoucherStatus, PaymentMethod,
            TreasuryTransactionType, EmployeeAdvance, AdvanceStatus, AdvanceRecoveryMethod
        )
        from finance.services.period_service import ensure_open_period_and_foundation
        from finance.services.treasury_service import TreasuryService

        sheet = SalarySheet.objects.filter(id=sheet_id, company=company, is_deleted=False).first()
        if not sheet:
            raise ValidationError("Salary Sheet not found.")

        pay_date = date.fromisoformat(payment_date_str) if payment_date_str else timezone.now().date()
        ensure_open_period_and_foundation(company, pay_date)

        treasury_acc = None
        if treasury_account_id:
            treasury_acc = BankAccount.objects.filter(id=treasury_account_id, company=company, is_deleted=False).first()
        if not treasury_acc:
            treasury_acc = BankAccount.objects.filter(company=company, is_active=True, is_deleted=False).first()
        if not treasury_acc:
            raise ValidationError("No active Bank or Cash Treasury account found. Please configure one in Vouchers & Treasury.")

        lines_qs = SalarySheetLine.objects.filter(
            salary_sheet=sheet, company=company, is_deleted=False,
            payment_status='UNPAID', is_stop_payment=False
        ).select_related('employee')

        if line_ids:
            lines_qs = lines_qs.filter(id__in=line_ids)

        payable_lines = [ln for ln in lines_qs if (ln.net_salary_payable or 0) > 0]
        if not payable_lines:
            raise ValidationError("No eligible unpaid, non-hold salary lines with positive net payable were found.")

        total_disbursed = sum((Decimal(str(ln.net_salary_payable)) for ln in payable_lines), Decimal('0.00'))

        voucher = FinancialVoucher.objects.create(
            company=company,
            voucher_type=VoucherType.PAYMENT_VOUCHER,
            date=pay_date,
            amount=total_disbursed,
            total_amount=total_disbursed,
            currency=treasury_acc.currency,
            payment_method=PaymentMethod.BANK_TRANSFER if treasury_acc.account_type == 'BANK' else PaymentMethod.CASH,
            bank_account=treasury_acc,
            payee_name=f"Salary Sheet {sheet.sheet_number} ({sheet.month})",
            description=notes or f"Salary Sheet payment for {sheet.month} ({len(payable_lines)} employees)",
            source_module='PAYROLL',
            source_document_type='SALARY_SHEET',
            source_document_id=str(sheet.id),
            status=VoucherStatus.POSTED,
            approved_by=user,
            approved_at=timezone.now(),
            posted_by=user,
            posted_at=timezone.now(),
        )

        TreasuryService.record_treasury_movement(
            bank_account=treasury_acc,
            voucher=voucher,
            transaction_type=TreasuryTransactionType.MONEY_OUT,
            money_in=Decimal('0.0000'),
            money_out=total_disbursed,
            transaction_date=pay_date,
            reference=payment_reference or sheet.sheet_number,
            description=f"Salary disbursement for {sheet.sheet_number} ({sheet.month})",
            user=user,
        )

        now_ts = timezone.now()
        for idx, ln in enumerate(payable_lines, start=1):
            ln.payment_status = 'PAID'
            ln.paid_at = now_ts
            ln.payment_reference = payment_reference or f"{voucher.voucher_number}-{idx}"
            ln.save(update_fields=['payment_status', 'paid_at', 'payment_reference'])

            emp = ln.employee
            # Mark HR Employee Doc Charges PAID if deducted/scheduled for this month
            if (
                emp.doc_charges_enabled
                and not emp.doc_charges_paid
                and (ln.doc_charges > 0 or (emp.doc_charges_month or '').strip() == sheet.month)
            ):
                emp.doc_charges_paid = True
                emp.doc_charges_paid_at = now_ts
                emp.save(update_fields=['doc_charges_paid', 'doc_charges_paid_at'])

            # Settle FIFO active advances up to ln.advance_amount
            if (ln.advance_amount or 0) > 0:
                remaining_adv = Decimal(str(ln.advance_amount))
                active_advs = EmployeeAdvance.objects.filter(
                    company=company,
                    employee=emp,
                    status=AdvanceStatus.PAID,
                    outstanding_balance__gt=Decimal('0.00'),
                    recovery_method__in=[AdvanceRecoveryMethod.PAYROLL_DEDUCTION, AdvanceRecoveryMethod.MIXED],
                    is_deleted=False,
                ).order_by('advance_date', 'created_at')
                for adv in active_advs:
                    if remaining_adv <= Decimal('0.00'):
                        break
                    can_settle = min(adv.outstanding_balance, remaining_adv)
                    if can_settle > Decimal('0.00'):
                        adv.settled_amount += can_settle
                        adv.outstanding_balance = max(Decimal('0.00'), adv.amount - adv.settled_amount - adv.returned_amount)
                        if adv.outstanding_balance <= Decimal('0.0001'):
                            adv.status = AdvanceStatus.SETTLED
                        adv.save(update_fields=['settled_amount', 'outstanding_balance', 'status'])
                        remaining_adv -= can_settle

        # Update sheet totals & status
        paid_sum = sheet.lines.filter(payment_status='PAID', is_deleted=False).aggregate(tot=Sum('net_salary_payable'))['tot'] or Decimal('0.00')
        unpaid_exists = sheet.lines.filter(payment_status='UNPAID', is_deleted=False, net_salary_payable__gt=0).exists()
        sheet.total_paid = paid_sum
        sheet.status = 'PARTIALLY_PAID' if unpaid_exists else 'PAID'
        sheet.save(update_fields=['total_paid', 'status'])

        return {
            'success': True,
            'sheet_id': str(sheet.id),
            'sheet_number': sheet.sheet_number,
            'paid_count': len(payable_lines),
            'total_disbursed': float(total_disbursed),
            'voucher_number': voucher.voucher_number,
            'sheet_status': sheet.status,
            'message': f"Disbursed PKR {total_disbursed:,.0f} across {len(payable_lines)} employee(s) ({voucher.voucher_number}).",
        }

