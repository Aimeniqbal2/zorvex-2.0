import calendar
import csv
import io
import re
from collections import defaultdict
from datetime import date, datetime, timedelta

from django.db.models import Q
from django.utils import timezone

from hrm.models import (
    Employee,
    JumpRecord,
    JumpRecordStatus,
    WorkforceAttendance,
)


def _natural_code_sort_key(emp):
    """Sort employees naturally by display_code / employee_code (e.g. 000014, 000040, 001368)."""
    code = (getattr(emp, 'display_code', None) or emp.employee_code or '').strip()
    digits = re.sub(r'\D', '', code)
    if digits:
        return (0, int(digits), code.lower(), (emp.first_name or '').lower())
    return (1, 0, code.lower(), (emp.first_name or '').lower())


def _canonical_code_from_raw(raw_status, duty_type='PRIMARY'):
    """
    Map DailyDutyPay / WorkforceAttendance status & duty_type into canonical register codes:
      P, O, OD, PO, POD, WP, W, A, L, HD
    Returns '' if empty/unrecognized blank.
    """
    s = str(raw_status or '').strip().upper()
    dt = str(duty_type or 'PRIMARY').strip().upper()

    if not s:
        return ''

    if s in ('OVERTIME_DOZING', 'OD', 'DOZ', 'DOZING'):
        return 'OD'
    if s in ('DOUBLE_SHIFT', 'PO', 'P+O', 'P+OT', 'POT'):
        return 'PO'
    if s in ('POD', 'P+OD', 'P+DOZ', 'PD'):
        return 'POD'
    if dt == 'OVERTIME' or s in ('OVERTIME', 'O', 'OT'):
        return 'O'
    if s in ('WORKED_WEEKLY_OFF', 'WORKED_OFF', 'WP', 'WO+P', 'W+P'):
        return 'WP'
    if s in ('WEEKLY_OFF', 'OFF_DAY', 'W', 'WO', 'OFF'):
        return 'W'
    if s in ('ABSENT', 'A', '0'):
        return 'A'
    if s in ('ON_LEAVE', 'PAID_LEAVE', 'UNPAID_LEAVE', 'LEAVE', 'L', 'PL', 'SL'):
        return 'L'
    if s in ('HALF_DAY', 'HD'):
        return 'HD'
    if s in ('PRESENT', 'P', '1', 'HOLIDAY', 'H'):
        return 'P'
    return ''


def _display_label_for_code(code):
    labels = {
        'P': 'Present',
        'O': 'Overtime',
        'OD': 'OT Dozing',
        'PO': 'Present + Overtime',
        'POD': 'Present + OT Dozing',
        'WP': 'Worked Weekly Off',
        'W': 'Weekly Off',
        'A': 'Absent',
        'L': 'Leave',
        'HD': 'Half Day',
        'JUMP': 'JUMP (3+ Absences)',
    }
    return labels.get(code, code or 'Unmarked')


def _shift_weight_for_code(code):
    """
    Worked shift contribution to 'Tots':
      P=1, O=1, OD=1, PO=2, POD=2, WP=1, HD=0.5, others (W, A, L, JUMP, '')=0
    """
    if code in ('PO', 'POD'):
        return 2.0
    if code in ('P', 'O', 'OD', 'WP'):
        return 1.0
    if code == 'HD':
        return 0.5
    return 0.0


class AttendanceRegisterService:
    """
    Authoritative Read-Only Attendance Registry Engine.
    Pulls live operational attendance directly from Operations Monthly Duty Muster
    (DailyDutyPay) and falls back to HRM WorkforceAttendance for non-site/office staff
    when no DailyDutyPay entry exists for that date.
    Unmarked dates remain strictly blank ('') — zero fabricated/demo statuses.
    """

    @staticmethod
    def get_attendance_register(
        company_id,
        date_from=None,
        date_to=None,
        month=None,
        year=None,
        employee_id=None,
        employee_from=None,
        employee_to=None,
        workforce_type=None,
        department_id=None,
        designation_id=None,
        site_id=None,
        shift_id=None,
        client_id=None,
        status_filter=None,
        search=None,
        marked_only=False,
    ):
        today = timezone.now().date()

        # 1. Resolve date range
        if month and year:
            try:
                m = int(month)
                y = int(year)
                last_day = calendar.monthrange(y, m)[1]
                start_date = date(y, m, 1)
                end_date = date(y, m, last_day)
            except Exception:
                last_day = calendar.monthrange(today.year, today.month)[1]
                start_date = today.replace(day=1)
                end_date = date(today.year, today.month, last_day)
        elif date_from and date_to:
            start_date = datetime.strptime(date_from, '%Y-%m-%d').date() if isinstance(date_from, str) else date_from
            end_date = datetime.strptime(date_to, '%Y-%m-%d').date() if isinstance(date_to, str) else date_to
        else:
            last_day = calendar.monthrange(today.year, today.month)[1]
            start_date = today.replace(day=1)
            end_date = date(today.year, today.month, last_day)

        if start_date > end_date:
            start_date, end_date = end_date, start_date

        num_days = (end_date - start_date).days + 1
        all_dates = [start_date + timedelta(days=i) for i in range(num_days)]
        date_strings = [d.strftime('%Y-%m-%d') for d in all_dates]

        # 2. Fetch live Operations Monthly Duty Muster (DailyDutyPay) & HRM WorkforceAttendance
        #    for the whole company in [start_date, end_date] first so we know which employees have
        #    actual attendance in this period and can build cross-location stacked cells accurately.
        from operations.models import DailyDutyPay, Deployment

        ddp_rows = DailyDutyPay.objects.filter(
            company_id=company_id,
            is_deleted=False,
            duty_date__range=[start_date, end_date],
        ).filter(
            Q(site__isnull=True) | Q(site__is_deleted=False),
            Q(site__crm_entity__isnull=True) | Q(site__crm_entity__is_deleted=False),
        ).values(
            'employee_id',
            'duty_date',
            'attendance_status',
            'duty_type',
            'site_id',
            'site__name',
            'site__crm_entity_id',
            'post__post_name',
            'notes',
            'is_replacement_duty',
        )

        ddp_site_emp_ids = set()
        ddp_client_emp_ids = set()
        site_id_str = str(site_id) if site_id else None
        client_id_str = str(client_id) if client_id else None

        # Group DailyDutyPay rows by (emp_id, date_str) -> ordered site entries
        # Within the same site on the same date: merge (P + O -> PO) and (P + OD -> POD)
        emp_day_ddp_sites = defaultdict(dict)  # (emp_id, date_str) -> { site_key: entry_dict }
        marked_emp_ids = set()

        for dp in ddp_rows:
            dp_emp_id = dp['employee_id']
            dp_site_id = dp['site_id']
            dp_client_id = dp['site__crm_entity_id']
            if site_id_str and dp_site_id and str(dp_site_id) == site_id_str:
                ddp_site_emp_ids.add(dp_emp_id)
            if client_id_str and dp_client_id and str(dp_client_id) == client_id_str:
                ddp_client_emp_ids.add(dp_emp_id)

            emp_id = str(dp_emp_id)
            d_str = dp['duty_date'].strftime('%Y-%m-%d')
            code = _canonical_code_from_raw(dp['attendance_status'], dp['duty_type'])
            if not code:
                continue

            marked_emp_ids.add(dp_emp_id)

            s_key = str(dp_site_id) if dp_site_id else '__NO_SITE__'
            site_name = dp['site__name'] or ''
            post_name = dp['post__post_name'] or ''
            notes_val = (dp['notes'] or '').strip()

            site_bucket = emp_day_ddp_sites[(emp_id, d_str)]
            existing = site_bucket.get(s_key)

            if existing:
                prev_code = existing['code']
                if (prev_code == 'P' and code == 'OD') or (prev_code == 'OD' and code == 'P'):
                    merged_code = 'POD'
                elif (prev_code == 'P' and code == 'O') or (prev_code == 'O' and code == 'P'):
                    merged_code = 'PO'
                elif code in ('PO', 'POD'):
                    merged_code = code
                elif prev_code in ('PO', 'POD'):
                    merged_code = prev_code
                else:
                    merged_code = code

                existing['code'] = merged_code
                existing['status'] = merged_code
                existing['status_display'] = _display_label_for_code(merged_code)
                if not existing['post'] and post_name:
                    existing['post'] = post_name
                if notes_val and notes_val not in existing['notes']:
                    existing['notes'] = f"{existing['notes']}; {notes_val}".strip('; ')
                existing['is_replacement'] = existing['is_replacement'] or bool(dp['is_replacement_duty'])
            else:
                site_bucket[s_key] = {
                    'code': code,
                    'status': code,
                    'status_display': _display_label_for_code(code),
                    'site_id': str(dp_site_id) if dp_site_id else None,
                    'site': site_name,
                    'post': post_name,
                    'shift': 'Overtime' if code in ('O', 'OD') else ('Present + OT' if code in ('PO', 'POD') else 'Duty Shift'),
                    'is_replacement': bool(dp['is_replacement_duty']),
                    'notes': notes_val,
                    'source': 'MUSTER',
                }

        # Fetch HRM WorkforceAttendance as lightweight values dict (fallback ONLY when no DailyDutyPay)
        wa_rows = WorkforceAttendance.objects.filter(
            company_id=company_id,
            is_deleted=False,
            date__range=[start_date, end_date],
        ).values(
            'employee_id',
            'date',
            'status',
            'site_id',
            'site__name',
            'site__crm_entity_id',
            'shift_id',
            'shift__name',
            'is_replacement',
            'notes',
        )

        shift_id_str = str(shift_id) if shift_id else None
        wa_shift_emp_ids = set()
        wa_site_emp_ids = set()
        wa_client_emp_ids = set()

        wa_lookup = {}
        wa_shift_by_day = {}
        for wa in wa_rows:
            wa_emp_id = wa['employee_id']
            if shift_id_str and wa['shift_id'] and str(wa['shift_id']) == shift_id_str:
                wa_shift_emp_ids.add(wa_emp_id)
            if site_id_str and wa['site_id'] and str(wa['site_id']) == site_id_str:
                wa_site_emp_ids.add(wa_emp_id)
            if client_id_str and wa['site__crm_entity_id'] and str(wa['site__crm_entity_id']) == client_id_str:
                wa_client_emp_ids.add(wa_emp_id)

            emp_id = str(wa_emp_id)
            d_str = wa['date'].strftime('%Y-%m-%d')
            if wa['shift__name']:
                wa_shift_by_day[(emp_id, d_str)] = wa['shift__name']

            if (emp_id, d_str) in emp_day_ddp_sites:
                continue

            code = _canonical_code_from_raw(wa['status'], 'PRIMARY')
            if not code:
                continue

            marked_emp_ids.add(wa_emp_id)
            site_name = wa['site__name'] or ''
            shift_name = wa['shift__name'] or ''
            wa_lookup[(emp_id, d_str)] = {
                'code': code,
                'status': code,
                'status_display': _display_label_for_code(code),
                'site_id': str(wa['site_id']) if wa['site_id'] else None,
                'site': site_name,
                'post': '',
                'shift': shift_name,
                'is_replacement': bool(wa['is_replacement']),
                'notes': (wa['notes'] or '').strip(),
                'source': 'HRM',
            }

        # Fetch active JumpRecords in window (overlay flag on genuine 'A' days)
        jumps_qs = JumpRecord.objects.filter(
            company_id=company_id,
            is_deleted=False,
            absent_since__lte=end_date,
        )
        emp_jump_dates = defaultdict(list)
        active_jump_statuses = {
            JumpRecordStatus.ACTIVE_JUMP,
            JumpRecordStatus.OSL_PENDING,
            JumpRecordStatus.ACKNOWLEDGED,
        }
        for j in jumps_qs:
            if j.status in active_jump_statuses:
                end_dt_raw = j.reinstated_at or j.resolved_at
                j_end = end_dt_raw.date() if end_dt_raw else end_date
                if j_end >= start_date:
                    emp_jump_dates[str(j.employee_id)].append((j.absent_since, j_end, j))

        # 3. Filter employees (Active employees OR anyone with recorded attendance in this period)
        qs = Employee.objects.filter(
            company_id=company_id,
            is_deleted=False,
        ).filter(
            Q(is_active=True, employment_status='ACTIVE') | Q(id__in=marked_emp_ids)
        ).select_related('department', 'designation')

        if employee_id:
            qs = qs.filter(id=employee_id)
        if employee_from and employee_to and employee_from == employee_to:
            term = str(employee_from).strip()
            qs = qs.filter(
                Q(employee_code__icontains=term)
                | Q(previous_employee_code__icontains=term)
                | Q(first_name__icontains=term)
                | Q(last_name__icontains=term)
            )
        else:
            if employee_from:
                qs = qs.filter(Q(employee_code__gte=employee_from) | Q(previous_employee_code__gte=employee_from))
            if employee_to:
                qs = qs.filter(Q(employee_code__lte=employee_to) | Q(previous_employee_code__lte=employee_to))

        if search:
            s_term = str(search).strip()
            if s_term:
                qs = qs.filter(
                    Q(employee_code__icontains=s_term)
                    | Q(previous_employee_code__icontains=s_term)
                    | Q(first_name__icontains=s_term)
                    | Q(last_name__icontains=s_term)
                    | Q(designation__name__icontains=s_term)
                )

        if workforce_type:
            wf = str(workforce_type).strip().upper()
            if wf in ('DIRECT', 'INDIRECT'):
                qs = qs.filter(classification=wf)
        if department_id:
            qs = qs.filter(department_id=department_id)
        if designation_id:
            qs = qs.filter(designation_id=designation_id)
        if shift_id:
            qs = qs.filter(id__in=wa_shift_emp_ids)

        if site_id or client_id:
            dep_qs = Deployment.objects.filter(company_id=company_id, is_deleted=False)
            if site_id:
                dep_qs = dep_qs.filter(site_id=site_id)
            if client_id:
                dep_qs = dep_qs.filter(site__crm_entity_id=client_id)
            dep_emp_ids = set(dep_qs.values_list('employee_id', flat=True).distinct())

            combined_site_emps = set(dep_emp_ids)
            if site_id:
                combined_site_emps |= ddp_site_emp_ids | wa_site_emp_ids
            if client_id:
                combined_site_emps |= ddp_client_emp_ids | wa_client_emp_ids
            qs = qs.filter(id__in=combined_site_emps)

        if marked_only and str(marked_only).lower() in ('true', '1', 'yes'):
            qs = qs.filter(id__in=marked_emp_ids)

        employees = sorted(list(qs), key=_natural_code_sort_key)

        # Fetch active deployment map for fallback tooltip info only (values_list avoids ORM overhead)
        active_deployments = {}
        try:
            for dep_emp_id, site_name in Deployment.objects.filter(
                company_id=company_id,
                is_deleted=False,
                is_active=True,
                site__is_deleted=False,
                employee_id__in=[e.id for e in employees],
            ).values_list('employee_id', 'site__name'):
                if site_name:
                    active_deployments.setdefault(str(dep_emp_id), []).append(site_name)
        except Exception:
            pass

        # 4. Build rows & summary
        rows = []
        global_totals = {
            'present': 0,
            'absent': 0,
            'leave': 0,
            'half_day': 0,
            'weekly_off': 0,
            'worked_off': 0,
            'ot': 0,
            'od': 0,
            'jump': 0,
            'replacements': 0,
            'total_duties': 0.0,
        }

        status_filter_norm = str(status_filter or '').strip().upper()

        for emp in employees:
            emp_id_str = str(emp.id)
            emp_totals = {
                'present': 0,
                'absent': 0,
                'leave': 0,
                'half_day': 0,
                'weekly_off': 0,
                'worked_off': 0,
                'ot': 0,
                'od': 0,
                'jump': 0,
                'replacements': 0,
                'total_duties': 0.0,
            }
            days_map = {}
            matched_status_filter = not status_filter_norm
            jump_spans = emp_jump_dates.get(emp_id_str, [])
            has_any_marked = False

            for idx, d_str in enumerate(date_strings):
                curr_date = all_dates[idx]
                entries = []

                site_entries = emp_day_ddp_sites.get((emp_id_str, d_str))
                if site_entries:
                    # Enrich shift metadata if WorkforceAttendance also recorded it
                    wa_shift_name = wa_shift_by_day.get((emp_id_str, d_str), '')
                    for entry in site_entries.values():
                        enriched = dict(entry)
                        if wa_shift_name and not enriched.get('shift'):
                            enriched['shift'] = wa_shift_name
                        entries.append(enriched)
                elif (emp_id_str, d_str) in wa_lookup:
                    entries.append(dict(wa_lookup[(emp_id_str, d_str)]))

                if not entries:
                    days_map[d_str] = {
                        'code': '',
                        'status': '',
                        'status_display': 'Unmarked',
                        'site': '',
                        'locations': [],
                        'entries': [],
                        'shift': '',
                        'post': '',
                        'is_replacement': False,
                        'is_jump': False,
                        'jump_id': None,
                        'notes': '',
                    }
                    continue

                has_any_marked = True

                # Check if genuine ABSENT falls inside an active JUMP span
                is_jump_day = False
                jump_id = None
                primary_codes = [e['code'] for e in entries]
                if primary_codes == ['A']:
                    for j_start, j_end, j_obj in jump_spans:
                        if j_start <= curr_date <= j_end:
                            is_jump_day = True
                            jump_id = str(j_obj.id)
                            break

                # Aggregate totals cleanly per entry
                day_weight = 0.0
                any_replacement = False
                for e in entries:
                    c = e['code']
                    day_weight += _shift_weight_for_code(c)
                    if e.get('is_replacement'):
                        any_replacement = True
                        emp_totals['replacements'] += 1

                    if c == 'P':
                        emp_totals['present'] += 1
                    elif c == 'O':
                        emp_totals['ot'] += 1
                    elif c == 'OD':
                        emp_totals['od'] += 1
                    elif c == 'PO':
                        emp_totals['present'] += 1
                        emp_totals['ot'] += 1
                    elif c == 'POD':
                        emp_totals['present'] += 1
                        emp_totals['od'] += 1
                    elif c == 'WP':
                        emp_totals['worked_off'] += 1
                    elif c == 'W':
                        emp_totals['weekly_off'] += 1
                    elif c == 'A':
                        emp_totals['absent'] += 1
                        if is_jump_day:
                            emp_totals['jump'] += 1
                    elif c == 'L':
                        emp_totals['leave'] += 1
                    elif c == 'HD':
                        emp_totals['half_day'] += 1

                emp_totals['total_duties'] += day_weight

                if is_jump_day:
                    summary_code = 'JUMP'
                elif len(entries) == 1:
                    summary_code = entries[0]['code']
                else:
                    summary_code = '+'.join(e['code'] for e in entries)

                if status_filter_norm:
                    if status_filter_norm == 'JUMP' and is_jump_day:
                        matched_status_filter = True
                    elif status_filter_norm in primary_codes or status_filter_norm == summary_code:
                        matched_status_filter = True

                distinct_sites = []
                for e in entries:
                    s_name = (e.get('site') or '').strip()
                    if s_name and s_name not in distinct_sites:
                        distinct_sites.append(s_name)

                days_map[d_str] = {
                    'code': summary_code,
                    'status': summary_code,
                    'status_display': 'JUMP (3+ Absences)' if is_jump_day else (
                        entries[0]['status_display'] if len(entries) == 1 else ' + '.join(e['status_display'] for e in entries)
                    ),
                    'site': ' | '.join(distinct_sites),
                    'locations': distinct_sites,
                    'entries': entries,
                    'shift': ', '.join(sorted({e.get('shift', '') for e in entries if e.get('shift')})),
                    'post': ', '.join(sorted({e.get('post', '') for e in entries if e.get('post')})),
                    'is_replacement': any_replacement,
                    'is_jump': is_jump_day,
                    'jump_id': jump_id,
                    'notes': '; '.join(e.get('notes', '') for e in entries if e.get('notes')),
                }

            if not matched_status_filter:
                continue

            # Format total_duties cleanly (int when whole number)
            tots_val = emp_totals['total_duties']
            emp_totals['total_duties'] = int(tots_val) if tots_val == int(tots_val) else round(tots_val, 1)

            for k, v in emp_totals.items():
                global_totals[k] += v

            display_code = (getattr(emp, 'display_code', None) or emp.employee_code or '').strip()
            assigned_sites = active_deployments.get(emp_id_str, [])

            rows.append({
                'employee_id': emp_id_str,
                'employee_code': display_code,
                'erp_code': emp.employee_code,
                'employee_name': emp.full_name,
                'father_name': emp.father_name or '',
                'workforce_type': getattr(emp, 'workforce_type', emp.classification),
                'department': emp.department.name if emp.department else '',
                'designation': emp.designation.name if emp.designation else '',
                'assigned_site': ', '.join(assigned_sites),
                'has_attendance': has_any_marked,
                'days': days_map,
                'totals': emp_totals,
            })

        # Normalize global total_duties
        g_tots = global_totals['total_duties']
        global_totals['total_duties'] = int(g_tots) if g_tots == int(g_tots) else round(g_tots, 1)

        # Fetch active OperationalSites for filter dropdown
        sites_list = []
        try:
            sites_qs = OperationalSite.objects.filter(
                company_id=company_id,
                is_deleted=False,
                is_active=True,
            ).select_related('crm_entity').order_by('name')
            for s in sites_qs:
                if getattr(s, 'crm_entity', None) and (s.crm_entity.is_deleted or not s.crm_entity.active):
                    continue
                sites_list.append({
                    'id': str(s.id),
                    'name': s.name,
                    'client_name': s.crm_entity.name if s.crm_entity else '',
                })
        except Exception:
            pass

        marked_count = sum(1 for r in rows if r['has_attendance'])

        return {
            'start_date': start_date.strftime('%Y-%m-%d'),
            'end_date': end_date.strftime('%Y-%m-%d'),
            'month': start_date.month,
            'year': start_date.year,
            'month_label': start_date.strftime('%B %Y'),
            'dates': date_strings,
            'days_header': [
                {
                    'date': d.strftime('%Y-%m-%d'),
                    'day': d.strftime('%d'),
                    'day_num': d.day,
                    'weekday': d.strftime('%a')[0],
                    'is_sunday': d.weekday() == 6,
                }
                for d in all_dates
            ],
            'rows': rows,
            'summary': {
                'employees_count': len(rows),
                'marked_employees_count': marked_count,
                'totals': global_totals,
            },
            'sites': sites_list,
            'is_read_only': True,
            'source': 'OPERATIONS_MONTHLY_MUSTER',
        }

    @staticmethod
    def export_attendance_register_csv(register_data):
        output = io.StringIO()
        writer = csv.writer(output)

        days_header = register_data.get('days_header', [])
        dates = register_data['dates']

        header = ['Emp Code', 'Employee Name', 'Father Name', 'Designation']
        header.extend([str(d['day_num']) for d in days_header])
        header.extend(['Tots', 'P', 'O', 'OD', 'WP', 'WO', 'A', 'L', 'HD'])
        writer.writerow(header)

        for row in register_data['rows']:
            line = [
                row['employee_code'],
                row['employee_name'],
                row['father_name'],
                row['designation'],
            ]
            for d in dates:
                cell = row['days'].get(d, {})
                entries = cell.get('entries') or []
                if not entries:
                    line.append('')
                else:
                    parts = []
                    for e in entries:
                        site = e.get('site') or ''
                        parts.append(f"{e['code']} ({site})" if site else e['code'])
                    line.append(' / '.join(parts))

            t = row['totals']
            line.extend([
                t.get('total_duties', 0),
                t.get('present', 0),
                t.get('ot', 0),
                t.get('od', 0),
                t.get('worked_off', 0),
                t.get('weekly_off', 0),
                t.get('absent', 0),
                t.get('leave', 0),
                t.get('half_day', 0),
            ])
            writer.writerow(line)

        return output.getvalue()

    @staticmethod
    def export_attendance_register_xlsx(register_data, company_name='', exported_by='OPERATION'):
        """
        Generates a Landscape print-ready Excel workbook matching the company's
        Master 'Active Employees' Register sheet:
          - Title row: Active Employees (+ Period / Company)
          - Column headers: Code | Employee Name | Designation | 1..31 | Tots
          - Every marked day cell shows stacked Code + wrapped Location name below
          - Unmarked cells remain completely blank
          - Repeating header rows (1:2), fit-to-1-page-wide landscape print setup
          - Footer: User Name: <exported_by>
        """
        import openpyxl
        from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
        from openpyxl.utils import get_column_letter

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = 'Active Employees'

        days_header = register_data.get('days_header', [])
        dates = register_data.get('dates', [])
        rows = register_data.get('rows', [])
        month_label = register_data.get('month_label', '')

        total_cols = 3 + len(days_header) + 1  # Code, Name, Designation, 1..N, Tots

        # Borders & Fills
        thin_side = Side(style='thin', color='94A3B8')
        med_navy = Side(style='medium', color='1E293B')
        cell_border = Border(left=thin_side, right=thin_side, top=thin_side, bottom=thin_side)
        header_border = Border(left=thin_side, right=thin_side, top=med_navy, bottom=med_navy)

        fill_header = PatternFill(start_color='F1F5F9', end_color='F1F5F9', fill_type='solid')
        fill_tots = PatternFill(start_color='F8FAFC', end_color='F8FAFC', fill_type='solid')
        fill_absent = PatternFill(start_color='FEE2E2', end_color='FEE2E2', fill_type='solid')
        fill_ot = PatternFill(start_color='E0F2FE', end_color='E0F2FE', fill_type='solid')
        fill_wp = PatternFill(start_color='F3E8FF', end_color='F3E8FF', fill_type='solid')
        fill_wo = PatternFill(start_color='E2E8F0', end_color='E2E8F0', fill_type='solid')
        fill_leave = PatternFill(start_color='FEF3C7', end_color='FEF3C7', fill_type='solid')

        # Row 1: Title Bar ("Active Employees")
        ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=4)
        title_cell = ws.cell(row=1, column=1, value='Active Employees')
        title_cell.font = Font(name='Calibri', size=12, bold=True, color='0F172A')
        title_cell.alignment = Alignment(horizontal='left', vertical='center')

        if total_cols > 4:
            ws.merge_cells(start_row=1, start_column=5, end_row=1, end_column=total_cols)
            meta_parts = [p for p in [company_name, month_label] if p]
            meta_cell = ws.cell(row=1, column=5, value='  |  '.join(meta_parts) + '   (Read-Only Operations Muster Register)')
            meta_cell.font = Font(name='Calibri', size=9, bold=True, color='475569')
            meta_cell.alignment = Alignment(horizontal='right', vertical='center')
        ws.row_dimensions[1].height = 22

        # Row 2: Column Headers
        headers = ['Code', 'Employee Name', 'Designation'] + [str(d['day_num']) for d in days_header] + ['Tots']
        for col_idx, h_text in enumerate(headers, start=1):
            c = ws.cell(row=2, column=col_idx, value=h_text)
            c.font = Font(name='Calibri', size=9, bold=True, color='0F172A')
            c.fill = fill_header
            c.border = header_border
            c.alignment = Alignment(
                horizontal='left' if col_idx in (2, 3) else 'center',
                vertical='center',
            )
        ws.row_dimensions[2].height = 19

        # Data Rows
        current_row = 3
        for row in rows:
            c_code = ws.cell(row=current_row, column=1, value=row['employee_code'])
            c_code.font = Font(name='Calibri', size=8, bold=True, color='0F172A')
            c_code.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
            c_code.border = cell_border

            name_text = row['employee_name']
            if row.get('father_name'):
                name_text = f"{row['employee_name']}\n{row['father_name']}"
            c_name = ws.cell(row=current_row, column=2, value=name_text)
            c_name.font = Font(name='Calibri', size=8, bold=False, color='0F172A')
            c_name.alignment = Alignment(horizontal='left', vertical='center', wrap_text=True)
            c_name.border = cell_border

            c_desig = ws.cell(row=current_row, column=3, value=row.get('designation') or '')
            c_desig.font = Font(name='Calibri', size=7.5, color='334155')
            c_desig.alignment = Alignment(horizontal='left', vertical='center', wrap_text=True)
            c_desig.border = cell_border

            max_lines = 2 if row.get('father_name') else 1

            for idx, d_str in enumerate(dates):
                col_idx = 4 + idx
                cell_data = row['days'].get(d_str, {})
                entries = cell_data.get('entries') or []
                xl_cell = ws.cell(row=current_row, column=col_idx)
                xl_cell.border = cell_border

                if not entries:
                    xl_cell.value = ''
                    xl_cell.alignment = Alignment(horizontal='center', vertical='center')
                    continue

                lines = []
                for e in entries:
                    site_txt = (e.get('site') or '').strip()
                    lines.append(f"{e['code']}\n{site_txt}" if site_txt else e['code'])

                text_val = '\n'.join(lines)
                max_lines = max(max_lines, len(lines) * 2)
                xl_cell.value = text_val
                xl_cell.font = Font(name='Calibri', size=6.5, bold=False, color='0F172A')
                xl_cell.alignment = Alignment(horizontal='center', vertical='top', wrap_text=True)

                summary_code = cell_data.get('code', '')
                if summary_code in ('A', 'JUMP'):
                    xl_cell.fill = fill_absent
                    xl_cell.font = Font(name='Calibri', size=6.5, bold=True, color='991B1B')
                elif summary_code in ('O', 'OD', 'PO', 'POD') or '+' in summary_code:
                    xl_cell.fill = fill_ot
                    xl_cell.font = Font(name='Calibri', size=6.5, bold=True, color='075985')
                elif summary_code == 'WP':
                    xl_cell.fill = fill_wp
                    xl_cell.font = Font(name='Calibri', size=6.5, bold=True, color='6B21A8')
                elif summary_code == 'W':
                    xl_cell.fill = fill_wo
                elif summary_code in ('L', 'HD'):
                    xl_cell.fill = fill_leave

            tots_cell = ws.cell(row=current_row, column=total_cols, value=row['totals'].get('total_duties', 0))
            tots_cell.font = Font(name='Calibri', size=9, bold=True, color='0F172A')
            tots_cell.fill = fill_tots
            tots_cell.alignment = Alignment(horizontal='center', vertical='center')
            tots_cell.border = cell_border

            ws.row_dimensions[current_row].height = max(28, min(58, max_lines * 11 + 8))
            current_row += 1

        # Footer User Name row matching scanned register
        footer_row = current_row + 1
        ws.merge_cells(start_row=footer_row, start_column=1, end_row=footer_row, end_column=5)
        f_cell = ws.cell(row=footer_row, column=1, value=f"User Name: {exported_by}")
        f_cell.font = Font(name='Calibri', size=9, bold=True, color='B91C1C')
        f_cell.alignment = Alignment(horizontal='left', vertical='center')

        # Column Widths
        ws.column_dimensions['A'].width = 8.5
        ws.column_dimensions['B'].width = 18.0
        ws.column_dimensions['C'].width = 13.0
        for idx in range(len(days_header)):
            ws.column_dimensions[get_column_letter(4 + idx)].width = 7.2
        ws.column_dimensions[get_column_letter(total_cols)].width = 6.5

        # Print / Page setup: Landscape Legal/A4 fit 1 page wide
        ws.page_setup.orientation = ws.ORIENTATION_LANDSCAPE
        ws.page_setup.paperSize = ws.PAPERSIZE_LEGAL
        ws.sheet_properties.pageSetUpPr.fitToPage = True
        ws.page_setup.fitToWidth = 1
        ws.page_setup.fitToHeight = 0
        ws.print_title_rows = '1:2'
        ws.page_margins.left = 0.25
        ws.page_margins.right = 0.25
        ws.page_margins.top = 0.3
        ws.page_margins.bottom = 0.3
        ws.freeze_panes = 'D3'

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        return buf.getvalue()
