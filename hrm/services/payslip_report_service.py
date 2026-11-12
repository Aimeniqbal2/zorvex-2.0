"""
hrm/services/payslip_report_service.py

Multi-tenant Pay Slips Report Service reading finalized Finance Salary Sheets
(with fallback to legacy HRM Payslips), integer/badge code range filtering,
location/client/month/mode/paid/hold filtering, and CSV export.
"""
import csv
import io
import re
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional

from django.db.models import Q
from django.utils import timezone


def _parse_code_int(code_val: Any) -> Optional[int]:
    if code_val is None:
        return None
    s = str(code_val).strip()
    if not s:
        return None
    digits = re.sub(r'\D', '', s)
    if digits:
        try:
            return int(digits)
        except ValueError:
            return None
    return None


def _parse_date(val: Any) -> Optional[date]:
    if not val:
        return None
    if isinstance(val, date):
        return val
    s = str(val).strip()
    for fmt in ('%Y-%m-%d', '%m/%d/%Y', '%d/%m/%Y'):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


class PayslipReportService:
    @classmethod
    def get_payslip_report(
        cls,
        company_id: Optional[str],
        month: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        month_from: Optional[str] = None,
        month_to: Optional[str] = None,
        date_range_preset: Optional[str] = None,
        employee_from: Optional[str] = None,
        employee_to: Optional[str] = None,
        employee_id: Optional[str] = None,
        site_id: Optional[str] = None,
        client_id: Optional[str] = None,
        region: Optional[str] = None,
        is_paid: str = 'BOTH',
        is_stop_payment: str = 'BOTH',
        account_type: str = 'ALL',
        mode_of_payment: Optional[str] = None,
        in_main_payroll: bool = True,
    ) -> Dict[str, Any]:
        from companies.models import Company
        from finance.models import SalarySheet, SalarySheetLine, FinancePaymentMode
        from finance.services.salary_sheet_service import SalarySheetService
        from hrm.models import Payslip
        from operations.models import OperationalSite, Deployment

        company = Company.objects.filter(id=company_id).first() if company_id else None
        if not company:
            return {
                'branding': {},
                'available_months': [],
                'sites': [],
                'payment_modes': [],
                'rows': [],
                'summary': {'total_count': 0, 'total_gross': 0, 'total_deductions': 0, 'total_net': 0, 'paid_count': 0, 'unpaid_count': 0, 'hold_count': 0},
            }

        branding = SalarySheetService.get_company_branding(company)

        # Resolve presets
        today = timezone.now().date()
        d_from = _parse_date(date_from)
        d_to = _parse_date(date_to)
        if date_range_preset and date_range_preset.upper() not in ('CUSTOM', 'DATE_RANGE', 'ALL'):
            preset = date_range_preset.upper()
            if preset == 'TODAY':
                d_from, d_to = today, today
            elif preset == 'LAST_7_DAYS':
                d_from, d_to = today - timedelta(days=7), today
            elif preset == 'LAST_15_DAYS':
                d_from, d_to = today - timedelta(days=15), today
            elif preset == 'LAST_30_DAYS':
                d_from, d_to = today - timedelta(days=30), today
            elif preset == 'LAST_60_DAYS':
                d_from, d_to = today - timedelta(days=60), today
            elif preset == 'LAST_90_DAYS':
                d_from, d_to = today - timedelta(days=90), today

        m_filter = (month or '').strip()
        m_from = (month_from or '').strip()
        m_to = (month_to or '').strip()

        available_months = list(
            SalarySheet.objects.filter(company=company, is_deleted=False)
            .order_by('-month')
            .values_list('month', flat=True)
            .distinct()
        )
        sites_list = [
            {
                'id': str(s['id']),
                'name': s['name'],
                'client_id': str(s['crm_entity_id']) if s['crm_entity_id'] else '',
                'client_name': s['crm_entity__name'] or '',
            }
            for s in OperationalSite.objects.filter(company=company, is_deleted=False)
            .order_by('name')
            .values('id', 'name', 'crm_entity_id', 'crm_entity__name')
        ]
        modes_list = list(
            FinancePaymentMode.objects.filter(company=company, is_active=True, is_deleted=False)
            .order_by('-is_default', 'name')
            .values_list('name', flat=True)
        )

        # Code range bounds
        emp_from_str = (employee_from or '').strip()
        emp_to_str = (employee_to or '').strip()
        emp_from_int = _parse_code_int(emp_from_str)
        emp_to_int = _parse_code_int(emp_to_str)

        site_filter_str = (site_id or '').strip()
        client_filter_str = (client_id or '').strip()
        region_filter_str = (region or '').strip().lower()
        mode_filter_str = (mode_of_payment or (account_type if account_type and account_type.upper() != 'ALL' else '') or '').strip().lower()

        rows: List[Dict[str, Any]] = []
        covered_sheet_months = set()

        # 1. Primary Source: Finalized Finance SalarySheetLines
        lines_qs = SalarySheetLine.objects.filter(
            company=company,
            is_deleted=False,
            salary_sheet__is_deleted=False,
        ).select_related(
            'salary_sheet', 'employee', 'employee__designation', 'employee__department',
            'primary_site', 'primary_site__crm_entity', 'payslip'
        ).order_by('-salary_sheet__month', 'serial_no')

        if m_filter and m_filter.upper() != 'ALL':
            lines_qs = lines_qs.filter(salary_sheet__month=m_filter)
        if m_from and len(m_from) >= 7:
            lines_qs = lines_qs.filter(salary_sheet__month__gte=m_from[:7])
        if m_to and len(m_to) >= 7:
            lines_qs = lines_qs.filter(salary_sheet__month__lte=m_to[:7])
        if d_from and not m_filter:
            lines_qs = lines_qs.filter(salary_sheet__period_end__gte=d_from)
        if d_to and not m_filter:
            lines_qs = lines_qs.filter(salary_sheet__period_start__lte=d_to)
        if employee_id:
            lines_qs = lines_qs.filter(employee_id=employee_id)

        paid_flag = (is_paid or 'BOTH').upper()
        if paid_flag in ('PAID', 'YES', 'TRUE', '1'):
            lines_qs = lines_qs.filter(payment_status='PAID')
        elif paid_flag in ('UNPAID', 'NO', 'FALSE', '0'):
            lines_qs = lines_qs.exclude(payment_status='PAID')

        hold_flag = (is_stop_payment or 'BOTH').upper()
        if hold_flag in ('YES', 'TRUE', '1', 'HOLD'):
            lines_qs = lines_qs.filter(is_stop_payment=True)
        elif hold_flag in ('NO', 'FALSE', '0', 'ACTIVE'):
            lines_qs = lines_qs.filter(is_stop_payment=False)

        for ln in lines_qs:
            sheet = ln.salary_sheet
            covered_sheet_months.add(sheet.month)
            emp = ln.employee

            code = (ln.oss_code or (getattr(emp, 'display_code', '') if emp else '') or '').strip()
            code_int = _parse_code_int(code)
            if emp_from_str:
                if emp_from_int is not None and code_int is not None:
                    if code_int < emp_from_int:
                        continue
                elif code.lower() < emp_from_str.lower():
                    continue
            if emp_to_str:
                if emp_to_int is not None and code_int is not None:
                    if code_int > emp_to_int:
                        continue
                elif code.lower() > emp_to_str.lower():
                    continue

            if site_filter_str:
                match_site_id = str(ln.primary_site_id or '') == site_filter_str
                match_site_name = site_filter_str.lower() in (ln.locations_text or '').lower()
                match_summary = any(
                    str(item.get('site_id', '')) == site_filter_str
                    or site_filter_str.lower() in str(item.get('site_name', '')).lower()
                    for item in (ln.locations_summary or [])
                )
                if not (match_site_id or match_site_name or match_summary):
                    continue

            client_name = ln.primary_site.crm_entity.name if (ln.primary_site and ln.primary_site.crm_entity) else ''
            client_uuid = str(ln.primary_site.crm_entity_id) if (ln.primary_site and ln.primary_site.crm_entity_id) else ''
            if client_filter_str:
                if client_filter_str != client_uuid and client_filter_str.lower() not in client_name.lower():
                    continue

            emp_city = (getattr(emp, 'city', '') or '').lower() if emp else ''
            if region_filter_str and region_filter_str not in emp_city and region_filter_str not in (ln.locations_text or '').lower():
                continue

            if mode_filter_str and mode_filter_str != (ln.mode_of_payment or '').strip().lower():
                continue

            year_v, month_v = map(int, sheet.month.split('-'))
            month_display = date(year_v, month_v, 1).strftime('%B %Y')

            rows.append({
                'id': str(ln.id),
                'source_type': 'SALARY_SHEET',
                'line_id': str(ln.id),
                'payslip_id': str(ln.payslip_id) if ln.payslip_id else str(ln.id),
                'sheet_id': str(sheet.id),
                'sheet_number': sheet.sheet_number,
                'payslip_number': ln.payslip_number or f"PS-{sheet.month.replace('-', '')}-{ln.serial_no:04d}",
                'month': sheet.month,
                'month_display': month_display,
                'period_start': sheet.period_start.isoformat(),
                'period_end': sheet.period_end.isoformat(),
                'days_in_month': sheet.days_in_month,
                'prepared_by_name': sheet.prepared_by_name or '',
                'serial_no': ln.serial_no,
                'employee_id': str(ln.employee_id),
                'employee_code': code,
                'employee_name': ln.employee_name,
                'father_name': ln.father_name or (emp.father_name if emp else ''),
                'designation_name': ln.designation_name or 'Security Guard',
                'department_name': ln.department_name or 'Security Operations',
                'region': getattr(emp, 'city', '') if emp else '',
                'site_id': str(ln.primary_site_id) if ln.primary_site_id else '',
                'site_name': ln.primary_site.name if ln.primary_site else (ln.locations_summary[0]['site_name'] if ln.locations_summary else ''),
                'client_name': client_name,
                'locations_text': ln.locations_text or '',
                'locations_summary': ln.locations_summary or [],
                'contact_number': ln.contact_number or '',
                'cnic_number': ln.cnic_number or '',
                'cnic_issue_date': ln.cnic_issue_date.isoformat() if ln.cnic_issue_date else None,
                'basic_salary': float(ln.basic_salary),
                'four_hrs_ot_enabled': ln.four_hrs_ot_enabled,
                'four_hrs_ot_amount': float(ln.four_hrs_ot_amount),
                'site_allowance_enabled': ln.site_allowance_enabled,
                'site_allowance_amount': float(ln.site_allowance_amount),
                'total_salary': float(ln.total_salary),
                'total_shifts': ln.total_shifts,
                'paid_shifts': float(ln.paid_shifts),
                'overtime_shifts': float(ln.overtime_shifts),
                'prorated_salary': float(ln.prorated_salary),
                'overtime_payable': float(ln.overtime_payable),
                'gross_salary_payable': float(ln.gross_salary_payable),
                'doc_charges': float(ln.doc_charges),
                'eobi_amount': float(ln.eobi_amount),
                'admin_charges': float(ln.admin_charges),
                'fine_amount': float(ln.fine_amount),
                'insurance_amount': float(ln.insurance_amount),
                'advance_amount': float(ln.advance_amount),
                'other_deductions': float(ln.other_deductions),
                'total_deduction': float(ln.total_deduction),
                'net_salary_payable': float(ln.net_salary_payable),
                'mode_of_payment': ln.mode_of_payment or '',
                'payment_status': ln.payment_status,
                'is_paid': ln.payment_status == 'PAID',
                'paid_at': ln.paid_at.isoformat() if ln.paid_at else None,
                'payment_reference': ln.payment_reference or '',
                'is_stop_payment': bool(ln.is_stop_payment),
                'stop_payment_reason': ln.stop_payment_reason or '',
            })

        # 2. Fallback: Legacy HRM Payslips for months that don't have a SalarySheet
        if not m_filter or m_filter.upper() == 'ALL' or m_filter not in covered_sheet_months:
            ps_qs = Payslip.objects.filter(
                company=company,
                is_deleted=False,
                salary_sheet_lines__isnull=True,
            ).select_related(
                'employee', 'employee__designation', 'employee__department', 'payroll_run'
            ).order_by('-period_end', 'employee__employee_code')

            if m_filter and m_filter.upper() != 'ALL':
                ym_parts = m_filter.split('-')
                if len(ym_parts) == 2:
                    ps_qs = ps_qs.filter(period_end__year=int(ym_parts[0]), period_end__month=int(ym_parts[1]))
            if employee_id:
                ps_qs = ps_qs.filter(employee_id=employee_id)
            if paid_flag in ('PAID', 'YES', 'TRUE', '1'):
                ps_qs = ps_qs.filter(payment_status='PAID')
            elif paid_flag in ('UNPAID', 'NO', 'FALSE', '0'):
                ps_qs = ps_qs.exclude(payment_status='PAID')
            if hold_flag in ('YES', 'TRUE', '1', 'HOLD'):
                ps_qs = ps_qs.filter(is_stop_payment=True)
            elif hold_flag in ('NO', 'FALSE', '0', 'ACTIVE'):
                ps_qs = ps_qs.filter(is_stop_payment=False)

            dep_site_map = {}
            for d_eid, d_sname, d_cname in Deployment.objects.filter(
                company=company, is_deleted=False, status='ACTIVE', site__isnull=False
            ).values_list('employee_id', 'site__name', 'site__crm_entity__name'):
                if str(d_eid) not in dep_site_map:
                    dep_site_map[str(d_eid)] = (d_sname or '', d_cname or '')

            for idx, ps in enumerate(ps_qs, start=1):
                ps_month = ps.period_end.strftime('%Y-%m') if ps.period_end else ''
                if ps_month in covered_sheet_months:
                    continue
                if m_from and ps_month and ps_month < m_from[:7]:
                    continue
                if m_to and ps_month and ps_month > m_to[:7]:
                    continue
                emp = ps.employee
                code = (getattr(emp, 'display_code', '') or getattr(emp, 'employee_code', '') or '').strip() if emp else ''
                code_int = _parse_code_int(code)
                if emp_from_str:
                    if emp_from_int is not None and code_int is not None:
                        if code_int < emp_from_int:
                            continue
                    elif code.lower() < emp_from_str.lower():
                        continue
                if emp_to_str:
                    if emp_to_int is not None and code_int is not None:
                        if code_int > emp_to_int:
                            continue
                    elif code.lower() > emp_to_str.lower():
                        continue

                s_name, c_name = dep_site_map.get(str(ps.employee_id), ('', ''))
                if site_filter_str and site_filter_str.lower() not in s_name.lower():
                    continue
                if client_filter_str and client_filter_str.lower() not in c_name.lower():
                    continue

                rows.append({
                    'id': str(ps.id),
                    'source_type': 'LEGACY_PAYSLIP',
                    'line_id': None,
                    'payslip_id': str(ps.id),
                    'sheet_id': None,
                    'sheet_number': ps.payroll_run.run_number if ps.payroll_run else '',
                    'payslip_number': ps.payslip_number,
                    'month': ps_month,
                    'month_display': ps.period_end.strftime('%B %Y') if ps.period_end else '',
                    'period_start': ps.period_start.isoformat() if ps.period_start else '',
                    'period_end': ps.period_end.isoformat() if ps.period_end else '',
                    'days_in_month': 30,
                    'prepared_by_name': '',
                    'serial_no': idx,
                    'employee_id': str(ps.employee_id),
                    'employee_code': code,
                    'employee_name': f"{emp.first_name} {emp.last_name}".strip() if emp else '',
                    'father_name': emp.father_name if emp else '',
                    'designation_name': emp.designation.name if (emp and emp.designation) else 'Security Guard',
                    'department_name': emp.department.name if (emp and emp.department) else '',
                    'region': getattr(emp, 'city', '') if emp else '',
                    'site_id': '',
                    'site_name': s_name,
                    'client_name': c_name,
                    'locations_text': s_name,
                    'locations_summary': [],
                    'contact_number': (emp.phone or emp.telephone_number or '') if emp else '',
                    'cnic_number': emp.cnic_number if emp else '',
                    'cnic_issue_date': emp.cnic_issue_date.isoformat() if (emp and emp.cnic_issue_date) else None,
                    'basic_salary': float(ps.duty_earnings),
                    'four_hrs_ot_enabled': False,
                    'four_hrs_ot_amount': 0.0,
                    'site_allowance_enabled': False,
                    'site_allowance_amount': float(ps.allowances_amount),
                    'total_salary': float(ps.duty_earnings + ps.allowances_amount),
                    'total_shifts': 30,
                    'paid_shifts': float(ps.duty_days_count or 0),
                    'overtime_shifts': 0.0,
                    'prorated_salary': float(ps.duty_earnings),
                    'overtime_payable': float(ps.overtime_amount),
                    'gross_salary_payable': float(ps.gross_amount),
                    'doc_charges': 0.0,
                    'eobi_amount': float(ps.eobi_employee_amount),
                    'admin_charges': 0.0,
                    'fine_amount': 0.0,
                    'insurance_amount': float(ps.insurance_deduction),
                    'advance_amount': float(ps.advance_recovery_amount),
                    'other_deductions': float(ps.other_deductions_amount),
                    'total_deduction': float(ps.deduction_amount),
                    'net_salary_payable': float(ps.net_amount),
                    'mode_of_payment': getattr(ps, 'payment_mode', '') or '',
                    'payment_status': ps.payment_status,
                    'is_paid': ps.payment_status == 'PAID',
                    'paid_at': None,
                    'payment_reference': '',
                    'is_stop_payment': bool(ps.is_stop_payment),
                    'stop_payment_reason': ps.stop_payment_reason or '',
                })

        summary = {
            'total_count': len(rows),
            'total_gross': sum(r['gross_salary_payable'] for r in rows),
            'total_deductions': sum(r['total_deduction'] for r in rows),
            'total_net': sum(r['net_salary_payable'] for r in rows),
            'paid_count': sum(1 for r in rows if r['is_paid']),
            'unpaid_count': sum(1 for r in rows if not r['is_paid']),
            'hold_count': sum(1 for r in rows if r['is_stop_payment']),
        }

        return {
            'branding': branding,
            'available_months': available_months,
            'sites': sites_list,
            'payment_modes': modes_list,
            'summary': summary,
            'rows': rows,
        }

    @classmethod
    def export_payslip_report_csv(cls, data: Dict[str, Any]) -> str:
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            'S#', 'OSS Code', 'Employee Name', 'Month', 'Designation',
            'Basic Salary', '4 Hrs OT', 'Site Allowance', 'Total Salary',
            'Total Shifts', 'Paid Shifts', 'OT Shifts', 'Salary', 'OT Payable',
            'Gross Salary', 'Doc Charges', 'EOBI', 'Admin Charges', 'Fine',
            'Insurance', 'Advance', 'Other Deductions', 'Total Deduction',
            'Net Salary Payable', 'Mode of Payment', 'Locations', 'Contact',
            'CNIC #', 'Date of Issue', 'Status', 'Hold'
        ])
        for r in data.get('rows', []):
            writer.writerow([
                r['serial_no'],
                r['employee_code'],
                r['employee_name'],
                r['month'],
                r['designation_name'],
                r['basic_salary'],
                r['four_hrs_ot_amount'],
                r['site_allowance_amount'],
                r['total_salary'],
                r['total_shifts'],
                r['paid_shifts'],
                r['overtime_shifts'],
                r['prorated_salary'],
                r['overtime_payable'],
                r['gross_salary_payable'],
                r['doc_charges'],
                r['eobi_amount'],
                r['admin_charges'],
                r['fine_amount'],
                r['insurance_amount'],
                r['advance_amount'],
                r['other_deductions'],
                r['total_deduction'],
                r['net_salary_payable'],
                r['mode_of_payment'],
                r['locations_text'],
                r['contact_number'],
                r['cnic_number'],
                r['cnic_issue_date'] or '',
                r['payment_status'],
                'HOLD' if r['is_stop_payment'] else 'ACTIVE',
            ])
        return output.getvalue()
