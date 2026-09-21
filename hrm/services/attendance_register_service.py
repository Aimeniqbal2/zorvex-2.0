import csv
import io
from datetime import datetime, date, timedelta
from django.utils import timezone
from django.db.models import Q
from hrm.models import (
    Employee, WorkforceAttendance, EmployeeAttendanceState,
    JumpRecord, JumpRecordStatus, AttendanceStatus
)

class AttendanceRegisterService:
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
        status_filter=None
    ):
        """
        Generates authoritative persistent Attendance Register matching S-5D.
        """
        today = timezone.now().date()
        
        # 1. Resolve date range
        if month and year:
            try:
                m = int(month)
                y = int(year)
                start_date = date(y, m, 1)
                # Next month start minus 1 day
                if m == 12:
                    end_date = date(y + 1, 1, 1) - timedelta(days=1)
                else:
                    end_date = date(y, m + 1, 1) - timedelta(days=1)
            except Exception:
                start_date = today.replace(day=1)
                end_date = today
        elif date_from and date_to:
            if isinstance(date_from, str):
                start_date = datetime.strptime(date_from, '%Y-%m-%d').date()
            else:
                start_date = date_from
            if isinstance(date_to, str):
                end_date = datetime.strptime(date_to, '%Y-%m-%d').date()
            else:
                end_date = date_to
        else:
            start_date = today.replace(day=1)
            end_date = today

        if start_date > end_date:
            start_date, end_date = end_date, start_date

        num_days = (end_date - start_date).days + 1
        all_dates = [start_date + timedelta(days=i) for i in range(num_days)]
        date_strings = [d.strftime('%Y-%m-%d') for d in all_dates]

        # 2. Filter employees
        qs = Employee.objects.filter(company_id=company_id, is_deleted=False).select_related(
            'department', 'designation'
        )

        if employee_id:
            qs = qs.filter(id=employee_id)
        if employee_from:
            qs = qs.filter(employee_code__gte=employee_from)
        if employee_to:
            qs = qs.filter(employee_code__lte=employee_to)
        if workforce_type:
            qs = qs.filter(workforce_type=workforce_type)
        if department_id:
            qs = qs.filter(department_id=department_id)
        if designation_id:
            qs = qs.filter(designation_id=designation_id)

        # Operational site or client filtering via deployments
        if site_id or client_id:
            try:
                from operations.models import Deployment
                dep_qs = Deployment.objects.filter(company_id=company_id, is_deleted=False)
                if site_id:
                    dep_qs = dep_qs.filter(site_id=site_id)
                if client_id:
                    dep_qs = dep_qs.filter(site__client_id=client_id)
                emp_ids = dep_qs.values_list('employee_id', flat=True).distinct()
                qs = qs.filter(id__in=emp_ids)
            except Exception:
                pass

        employees = list(qs.order_by('employee_code', 'first_name'))

        if not employees:
            return {
                'start_date': start_date.strftime('%Y-%m-%d'),
                'end_date': end_date.strftime('%Y-%m-%d'),
                'dates': date_strings,
                'rows': [],
                'totals': {
                    'total_employees': 0,
                    'present_days': 0,
                    'absent_days': 0,
                    'leave_days': 0,
                    'half_days': 0,
                    'off_days': 0,
                    'jump_days': 0,
                    'replacement_count': 0
                }
            }

        emp_ids = [e.id for e in employees]

        # 3. Fetch all recorded attendance in the range
        att_records = WorkforceAttendance.objects.filter(
            company_id=company_id,
            employee_id__in=emp_ids,
            date__range=[start_date, end_date],
            is_deleted=False
        ).select_related('shift', 'site')
        
        if shift_id:
            att_records = att_records.filter(shift_id=shift_id)

        # Map by (employee_id, date)
        att_map = {(a.employee_id, a.date): a for a in att_records}

        # 4. Fetch persistent attendance states
        states = EmployeeAttendanceState.objects.filter(
            company_id=company_id,
            employee_id__in=emp_ids,
            is_deleted=False
        )
        state_map = {s.employee_id: s for s in states}

        # 5. Fetch Jump records active during the period
        jump_records = JumpRecord.objects.filter(
            company_id=company_id,
            employee_id__in=emp_ids,
            is_deleted=False
        ).filter(
            Q(status=JumpRecordStatus.ACTIVE_JUMP) |
            Q(reinstated_at__date__gte=start_date)
        )
        jump_map = {}
        for jr in jump_records:
            jump_map.setdefault(jr.employee_id, []).append(jr)

        # 6. Build daily attendance per employee
        rows = []
        overall_totals = {
            'total_employees': len(employees),
            'present_days': 0,
            'absent_days': 0,
            'leave_days': 0,
            'half_days': 0,
            'off_days': 0,
            'jump_days': 0,
            'replacement_count': 0
        }

        for emp in employees:
            hire_dt = emp.hire_date or emp.joining_date
            term_dt = emp.termination_date or emp.resignation_date or emp.last_working_date
            emp_state = state_map.get(emp.id)
            emp_jumps = jump_map.get(emp.id, [])

            daily_records = []
            p_cnt = 0
            a_cnt = 0
            l_cnt = 0
            hd_cnt = 0
            wo_cnt = 0
            jump_cnt = 0
            rep_cnt = 0

            for cur_date in all_dates:
                # Rule: Do not automatically create attendance before joining or after separation
                if (hire_dt and cur_date < hire_dt) or (term_dt and cur_date > term_dt):
                    daily_records.append({
                        'date': cur_date.strftime('%Y-%m-%d'),
                        'code': '-',
                        'status': 'INACTIVE',
                        'is_replacement': False,
                        'notes': 'Not employed'
                    })
                    continue

                # Check if recorded in WorkforceAttendance
                rec = att_map.get((emp.id, cur_date))
                if rec:
                    st = rec.status
                    is_rep = bool(rec.notes and 'replacement' in rec.notes.lower())
                    if is_rep:
                        rep_cnt += 1

                    if st == AttendanceStatus.PRESENT:
                        code = 'P'
                        p_cnt += 1
                    elif st == AttendanceStatus.ABSENT:
                        # Check if within an active jump
                        is_jump = any(jr.absent_since <= cur_date and (not jr.reinstated_at or jr.reinstated_at.date() >= cur_date) for jr in emp_jumps)
                        if is_jump:
                            code = 'JUMP'
                            jump_cnt += 1
                        else:
                            code = 'A'
                            a_cnt += 1
                    elif st == AttendanceStatus.ON_LEAVE:
                        code = 'L'
                        l_cnt += 1
                    elif st == AttendanceStatus.HALF_DAY:
                        code = 'HD'
                        hd_cnt += 1
                    elif st == AttendanceStatus.OFF_DAY:
                        code = 'WO'
                        wo_cnt += 1
                    else:
                        code = 'P'
                        p_cnt += 1

                    daily_records.append({
                        'date': cur_date.strftime('%Y-%m-%d'),
                        'code': code,
                        'status': st,
                        'shift': rec.shift.name if rec.shift else '',
                        'site': rec.site.name if rec.site else '',
                        'is_replacement': is_rep,
                        'notes': rec.notes
                    })
                else:
                    # Persistent state default logic
                    if emp_state and emp_state.effective_from <= cur_date and emp_state.current_state == 'ABSENT':
                        code = 'A'
                        a_cnt += 1
                        st = 'ABSENT'
                    else:
                        # Weekend default check
                        if cur_date.weekday() == 6: # Sunday
                            code = 'WO'
                            wo_cnt += 1
                            st = 'OFF_DAY'
                        else:
                            code = 'P'
                            p_cnt += 1
                            st = 'PRESENT'

                    daily_records.append({
                        'date': cur_date.strftime('%Y-%m-%d'),
                        'code': code,
                        'status': st,
                        'is_replacement': False,
                        'notes': 'Default state'
                    })

            if status_filter:
                # If filtering by specific attendance status, check if employee has any of that status
                has_match = any(d['code'] == status_filter or d['status'] == status_filter for d in daily_records)
                if not has_match:
                    continue

            overall_totals['present_days'] += p_cnt
            overall_totals['absent_days'] += a_cnt
            overall_totals['leave_days'] += l_cnt
            overall_totals['half_days'] += hd_cnt
            overall_totals['off_days'] += wo_cnt
            overall_totals['jump_days'] += jump_cnt
            overall_totals['replacement_count'] += rep_cnt

            rows.append({
                'employee_id': str(emp.id),
                'employee_code': emp.employee_code,
                'previous_employee_code': emp.previous_employee_code,
                'full_name': emp.get_full_name(),
                'father_name': emp.father_name,
                'designation': emp.designation.name if emp.designation else '',
                'workforce_type': getattr(emp, 'classification', getattr(emp, 'workforce_type', 'DIRECT')),
                'daily': daily_records,
                'counts': {
                    'present': p_cnt,
                    'absent': a_cnt,
                    'leave': l_cnt,
                    'half_day': hd_cnt,
                    'weekly_off': wo_cnt,
                    'jump': jump_cnt,
                    'replacements': rep_cnt,
                    'total_days': num_days
                }
            })

        return {
            'start_date': start_date.strftime('%Y-%m-%d'),
            'end_date': end_date.strftime('%Y-%m-%d'),
            'dates': date_strings,
            'rows': rows,
            'totals': overall_totals
        }

    @staticmethod
    def export_attendance_register_csv(data):
        output = io.StringIO()
        writer = csv.writer(output)

        dates = data.get('dates', [])
        # Header row
        header = [
            'Employee Code', 'Legacy Code', 'Name', 'Father/Husband Name',
            'Designation', 'Department', 'Type'
        ] + [d[8:] for d in dates] + [
            'Present', 'Absent', 'Leave', 'Half Day', 'Weekly Off', 'JUMP', 'Replacements'
        ]
        writer.writerow(header)

        for row in data.get('rows', []):
            counts = row.get('counts', {})
            daily_codes = [d.get('code', '-') for d in row.get('daily', [])]
            r = [
                row.get('employee_code', ''),
                row.get('previous_employee_code', ''),
                row.get('full_name', ''),
                row.get('father_name', ''),
                row.get('designation', ''),
                row.get('department', ''),
                row.get('workforce_type', '')
            ] + daily_codes + [
                counts.get('present', 0),
                counts.get('absent', 0),
                counts.get('leave', 0),
                counts.get('half_day', 0),
                counts.get('weekly_off', 0),
                counts.get('jump', 0),
                counts.get('replacements', 0)
            ]
            writer.writerow(r)

        return output.getvalue()
