import datetime
import logging
from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError
from django.contrib.auth import get_user_model

from hrm.models import (
    Employee, EmploymentHistory,
    WorkforceAttendance, AttendanceStatus,
    EmployeeAttendanceState, JumpRecord, JumpRecordStatus,
    LeaveType, LeaveRequest, LeaveRequestStatus, Holiday
)
from operations.models import DutyRoster, DutyRosterStatus, DutyReplacement, OperationalSite

logger = logging.getLogger(__name__)
User = get_user_model()


def _parse_date(date_val):
    if isinstance(date_val, str):
        return datetime.date.fromisoformat(date_val)
    elif isinstance(date_val, (datetime.datetime, datetime.date)):
        return date_val if isinstance(date_val, datetime.date) else date_val.date()
    return timezone.now().date()


def get_or_create_default_state(employee, user=None):
    """
    Returns the persistent EmployeeAttendanceState for an employee.
    Default state is PRESENT until explicitly changed to ABSENT.
    """
    state, created = EmployeeAttendanceState.objects.get_or_create(
        employee=employee,
        defaults={
            'company': employee.company,
            'current_state': 'PRESENT',
            'effective_from': employee.hire_date or timezone.now().date(),
            'updated_by': user
        }
    )
    return state


def resolve_effective_attendance_status(employee, target_date):
    """
    Evaluates the effective attendance status for an employee on a target date.
    Priority order:
    1. Materialized/Finalized WorkforceAttendance row on target_date.
    2. Approved LeaveRequest covering target_date (PAID_LEAVE or UNPAID_LEAVE).
    3. Holiday on target_date.
    4. Persistent EmployeeAttendanceState (ABSENT if effective on/before target_date, else PRESENT).
    
    Returns:
        tuple: (status_string, attendance_instance_or_None, is_materialized_bool)
    """
    d = _parse_date(target_date)
    company = employee.company

    # 1. Finalized / Explicit record
    att = WorkforceAttendance.objects.filter(
        company=company,
        employee=employee,
        date=d,
        is_deleted=False
    ).select_related('recorded_by', 'duty_roster', 'site', 'post', 'shift').first()

    if att:
        return att.status, att, True

    # 2. Approved Leave
    active_leave = LeaveRequest.objects.filter(
        company=company,
        employee=employee,
        start_date__lte=d,
        end_date__gte=d,
        status=LeaveRequestStatus.APPROVED,
        is_deleted=False
    ).select_related('leave_type').first()

    if active_leave:
        status = AttendanceStatus.PAID_LEAVE if active_leave.leave_type.is_paid else AttendanceStatus.UNPAID_LEAVE
        return status, None, False

    # 3. Company Holiday
    is_holiday = Holiday.objects.filter(
        company=company,
        date=d,
        is_active=True,
        is_deleted=False
    ).exists()

    if is_holiday:
        return AttendanceStatus.HOLIDAY, None, False

    # 4. Persistent State Engine
    state = EmployeeAttendanceState.objects.filter(employee=employee, is_deleted=False).first()
    if state and state.current_state == 'ABSENT' and d >= state.effective_from:
        return AttendanceStatus.ABSENT, None, False

    # Default fallback is always PRESENT
    return AttendanceStatus.PRESENT, None, False


def calculate_consecutive_absent_days(employee, reference_date):
    """
    Calculates the consecutive true ABSENT days streak ending on reference_date.
    Only ABSENT increments the streak.
    PRESENT, PAID_LEAVE, UNPAID_LEAVE, HOLIDAY, WEEKLY_OFF, HALF_DAY break the streak.
    
    Returns:
        tuple: (streak_count, streak_start_date_or_None)
    """
    ref_d = _parse_date(reference_date)
    cur = ref_d
    streak = 0
    streak_start = None

    # Check up to 60 days backwards
    for _ in range(60):
        st, _, _ = resolve_effective_attendance_status(employee, cur)
        if st == AttendanceStatus.ABSENT:
            streak += 1
            streak_start = cur
            cur -= datetime.timedelta(days=1)
        else:
            break

    return streak, streak_start


def evaluate_jump_rule(employee, reference_date):
    """
    7-Day JUMP Rule:
    7 consecutive true ABSENT days -> Employee employment_status = JUMP.
    Creates JumpRecord alert if not already in JUMP.
    
    Returns:
        dict: {'jump_triggered': bool, 'streak': int, 'absent_since': date}
    """
    streak, streak_start = calculate_consecutive_absent_days(employee, reference_date)

    if streak >= 7:
        if employee.employment_status != 'JUMP':
            employee.employment_status = 'JUMP'
            employee.save(update_fields=['employment_status', 'updated_at'])

            JumpRecord.objects.create(
                company=employee.company,
                employee=employee,
                absent_since=streak_start,
                consecutive_absent_days=streak,
                reason=f"{streak} consecutive unexcused absent days",
                status=JumpRecordStatus.ACTIVE_JUMP
            )

            try:
                EmploymentHistory.objects.create(
                    company=employee.company,
                    employee=employee,
                    event_type='JUMP',
                    notes=f"Triggered 7-day JUMP alert: {streak} consecutive unexcused absent days since {streak_start}"
                )
            except Exception as e:
                logger.warning(f"Failed to log JUMP EmploymentHistory: {e}")

            return {
                'jump_triggered': True,
                'streak': streak,
                'absent_since': streak_start
            }

    return {
        'jump_triggered': False,
        'streak': streak,
        'absent_since': streak_start
    }


def restore_employee_from_jump(company, employee_id, user=None, restore_date=None, notes=''):
    """
    Returns an employee from JUMP status to ACTIVE.
    Preserves JUMP and absence audit history.
    Sets EmployeeAttendanceState back to PRESENT.
    """
    d = _parse_date(restore_date) if restore_date else timezone.now().date()

    with transaction.atomic():
        employee = Employee.objects.select_for_update().get(pk=employee_id, company=company)
        
        # 1. Update employee status back to ACTIVE
        employee.employment_status = 'ACTIVE'
        employee.save(update_fields=['employment_status', 'updated_at'])

        # 2. Mark active JUMP records as RESTORED
        active_jumps = JumpRecord.objects.filter(
            company=company,
            employee=employee,
            status=JumpRecordStatus.ACTIVE_JUMP
        )
        for j in active_jumps:
            j.status = JumpRecordStatus.RESTORED
            j.reinstated_at = timezone.now()
            j.reinstated_by = user
            j.reinstatement_notes = notes or 'Restored from JUMP to ACTIVE'
            j.save(update_fields=['status', 'reinstated_at', 'reinstated_by', 'reinstatement_notes', 'updated_at'])

        # 3. Update persistent attendance state back to PRESENT
        state = get_or_create_default_state(employee, user=user)
        state.current_state = 'PRESENT'
        state.effective_from = d
        state.updated_by = user
        state.notes = f"Restored from JUMP on {d}: {notes}"
        state.save()

        # 4. Materialize PRESENT attendance on restore date
        WorkforceAttendance.objects.update_or_create(
            company=company,
            employee=employee,
            date=d,
            defaults={
                'status': AttendanceStatus.PRESENT,
                'source': 'JUMP_RESTORE',
                'notes': notes or 'Restored from JUMP',
                'recorded_by': user,
                'finalized_at': timezone.now(),
                'is_finalized': True
            }
        )

        # 5. Preserve audit trail in EmploymentHistory
        try:
            EmploymentHistory.objects.create(
                company=company,
                employee=employee,
                event_type='JUMP_RESTORE',
                effective_date=d,
                changed_by=user,
                notes=f"Restored from JUMP to ACTIVE. Reinstatement notes: {notes or 'None'}"
            )
        except Exception as e:
            logger.warning(f"Could not log JUMP_RESTORE EmploymentHistory: {e}")

    return {
        'message': f"Employee {employee.full_name} successfully restored to ACTIVE.",
        'employee_id': str(employee.id),
        'status': employee.employment_status
    }


def set_employee_daily_attendance(
    company,
    employee_id,
    date,
    status,
    notes='',
    source='CENTRAL_OFFICE',
    user=None,
    update_persistent_state=False
):
    """
    Sets or updates a daily attendance record for an employee.
    If employee is in JUMP and is marked PRESENT, restores them to ACTIVE.
    If employee is marked ABSENT, evaluates the 7-day JUMP rule.
    If update_persistent_state is True, updates EmployeeAttendanceState.
    """
    d = _parse_date(date)
    company_id = company if not hasattr(company, 'id') else company.id

    with transaction.atomic():
        employee = Employee.objects.select_for_update().get(pk=employee_id, company_id=company_id)

        # Auto-link roster duty if DIRECT staff
        duty_roster = None
        site = None
        post = None
        shift = None

        if employee.classification == 'DIRECT':
            roster = DutyRoster.objects.filter(
                company_id=company_id,
                employee=employee,
                duty_date=d,
                status__in=[DutyRosterStatus.SCHEDULED, DutyRosterStatus.COMPLETED],
                is_deleted=False
            ).select_related('site', 'post', 'shift').first()

            if roster:
                duty_roster = roster
                site = roster.site
                post = roster.post
                shift = roster.shift

        # Create or update WorkforceAttendance
        att, created = WorkforceAttendance.objects.update_or_create(
            company_id=company_id,
            employee=employee,
            date=d,
            defaults={
                'status': status,
                'notes': notes,
                'source': source or 'CENTRAL_OFFICE',
                'duty_roster': duty_roster,
                'site': site,
                'post': post,
                'shift': shift,
                'recorded_by': user,
                'finalized_at': timezone.now(),
                'is_finalized': True
            }
        )

        # Handle persistent state update if requested
        if update_persistent_state and status in ['PRESENT', 'ABSENT']:
            state = get_or_create_default_state(employee, user=user)
            state.current_state = status
            state.effective_from = d
            state.updated_by = user
            state.notes = f"Persistent state set to {status} on {d}"
            state.save()

        # Handle JUMP status transitions
        jump_result = None
        if status == AttendanceStatus.PRESENT and employee.employment_status == 'JUMP':
            restore_result = restore_employee_from_jump(
                company=employee.company,
                employee_id=employee.id,
                user=user,
                restore_date=d,
                notes="Automatically restored upon being marked PRESENT"
            )
            jump_result = {'restored': True, 'details': restore_result}
        elif status == AttendanceStatus.ABSENT:
            jump_result = evaluate_jump_rule(employee, d)

    return att, jump_result


def bulk_set_attendance(
    company,
    employee_ids,
    date,
    status,
    notes='',
    source='CENTRAL_OFFICE',
    user=None,
    update_persistent_state=False
):
    """
    Sets attendance in bulk for a list of employees on a single date.
    """
    results = []
    jumps_triggered = []

    with transaction.atomic():
        for emp_id in employee_ids:
            att, jump_res = set_employee_daily_attendance(
                company=company,
                employee_id=emp_id,
                date=date,
                status=status,
                notes=notes,
                source=source,
                user=user,
                update_persistent_state=update_persistent_state
            )
            results.append(str(att.id))
            if jump_res and jump_res.get('jump_triggered'):
                jumps_triggered.append(emp_id)

    return {
        'count': len(results),
        'status': status,
        'date': str(date),
        'jumps_triggered_count': len(jumps_triggered)
    }


def apply_leave_range(
    company,
    employee_id,
    start_date,
    end_date,
    leave_type_str='PAID_LEAVE',
    reason='',
    notes='',
    user=None
):
    """
    Applies date-range leave (PAID_LEAVE or UNPAID_LEAVE).
    Creates approved LeaveRequest and materializes daily attendance across range.
    Neither counts toward JUMP.
    """
    s_date = _parse_date(start_date)
    e_date = _parse_date(end_date)
    if s_date > e_date:
        raise ValidationError({'end_date': 'End date must be on or after start date.'})

    company_id = company if not hasattr(company, 'id') else company.id
    is_paid = (leave_type_str.upper() == 'PAID_LEAVE')

    with transaction.atomic():
        employee = Employee.objects.select_for_update().get(pk=employee_id, company_id=company_id)

        # Get or create LeaveType for company
        lt_code = 'PAID_LEAVE' if is_paid else 'UNPAID_LEAVE'
        lt_name = 'Paid Leave' if is_paid else 'Unpaid Leave'

        leave_type, _ = LeaveType.objects.get_or_create(
            company_id=company_id,
            code=lt_code,
            defaults={
                'name': lt_name,
                'is_paid': is_paid,
                'requires_approval': False,
                'is_active': True
            }
        )

        total_days = (e_date - s_date).days + 1

        leave_req = LeaveRequest.objects.create(
            company_id=company_id,
            employee=employee,
            leave_type=leave_type,
            start_date=s_date,
            end_date=e_date,
            requested_days=total_days,
            reason=reason or notes,
            status=LeaveRequestStatus.APPROVED,
            approved_by=user,
            approved_at=timezone.now()
        )

        # Materialize attendance for each day
        cur = s_date
        status_to_record = AttendanceStatus.PAID_LEAVE if is_paid else AttendanceStatus.UNPAID_LEAVE
        created_count = 0

        while cur <= e_date:
            WorkforceAttendance.objects.update_or_create(
                company_id=company_id,
                employee=employee,
                date=cur,
                defaults={
                    'status': status_to_record,
                    'notes': reason or notes,
                    'source': 'LEAVE_REQUEST',
                    'recorded_by': user,
                    'finalized_at': timezone.now(),
                    'is_finalized': True
                }
            )
            cur += datetime.timedelta(days=1)
            created_count += 1

    return {
        'message': f"Leave applied from {s_date} to {e_date} ({created_count} days).",
        'leave_request_id': str(leave_req.id),
        'days': created_count,
        'is_paid': is_paid
    }


def get_daily_attendance_workspace(
    company,
    target_date,
    classification=None,
    site_id=None,
    search=None,
    status_filter=None
):
    """
    Consolidates the complete operational daily attendance workspace for central operators.
    Covers DIRECT (field guards) and INDIRECT (office staff) workforce.
    Includes persistent state, planned roster duty, replacement coverage, and JUMP metrics.
    """
    d = _parse_date(target_date)
    company_id = company if not hasattr(company, 'id') else company.id

    # 1. Base active and JUMP employees
    emp_qs = Employee.objects.filter(
        company_id=company_id,
        employment_status__in=['ACTIVE', 'JUMP'],
        is_deleted=False
    ).select_related('designation', 'department')

    if classification in ['DIRECT', 'INDIRECT']:
        emp_qs = emp_qs.filter(classification=classification)

    if search:
        from django.db.models import Q
        emp_qs = emp_qs.filter(
            Q(first_name__icontains=search) |
            Q(last_name__icontains=search) |
            Q(employee_code__icontains=search) |
            Q(cnic_number__icontains=search)
        )

    # 2. Pre-fetch materialized attendance records for target_date
    attendances = {
        str(att.employee_id): att
        for att in WorkforceAttendance.objects.filter(
            company_id=company_id,
            date=d,
            is_deleted=False
        ).select_related('duty_roster', 'site', 'post', 'shift', 'recorded_by')
    }

    # 3. Pre-fetch planned duty rosters for target_date
    rosters = {
        str(r.employee_id): r
        for r in DutyRoster.objects.filter(
            company_id=company_id,
            duty_date=d,
            status__in=[DutyRosterStatus.SCHEDULED, DutyRosterStatus.COMPLETED],
            is_deleted=False
        ).select_related('site', 'post', 'shift', 'replacement_for__employee')
    }

    # 4. Pre-fetch replacements covering duties on target_date
    replacements_by_original = {}
    for rep in DutyReplacement.objects.filter(
        company_id=company_id,
        duty_date=d,
        status='ASSIGNED',
        is_deleted=False
    ).select_related('replacement_employee', 'original_employee'):
        replacements_by_original[str(rep.original_employee_id)] = rep

    # Also check DutyRoster with is_replacement=True
    for rep_roster in DutyRoster.objects.filter(
        company_id=company_id,
        duty_date=d,
        is_replacement=True,
        status=DutyRosterStatus.SCHEDULED,
        is_deleted=False
    ).select_related('employee', 'replacement_for__employee'):
        if rep_roster.replacement_for:
            orig_emp_id = str(rep_roster.replacement_for.employee_id)
            if orig_emp_id not in replacements_by_original:
                replacements_by_original[orig_emp_id] = rep_roster

    # 5. Pre-fetch active leaves covering target_date
    active_leaves = {
        str(lr.employee_id): lr
        for lr in LeaveRequest.objects.filter(
            company_id=company_id,
            start_date__lte=d,
            end_date__gte=d,
            status=LeaveRequestStatus.APPROVED,
            is_deleted=False
        ).select_related('leave_type')
    }

    # 6. Check company holiday
    is_holiday = Holiday.objects.filter(company_id=company_id, date=d, is_active=True, is_deleted=False).exists()

    # 7. Pre-fetch persistent attendance states
    persistent_states = {
        str(s.employee_id): s
        for s in EmployeeAttendanceState.objects.filter(company_id=company_id, is_deleted=False)
    }

    # Build response rows
    rows = []
    totals = {
        'total_workforce': 0,
        'present': 0,
        'absent': 0,
        'paid_leave': 0,
        'unpaid_leave': 0,
        'holiday': 0,
        'weekly_off': 0,
        'half_day': 0,
        'jump_active': 0,
        'materialized': 0,
        'unfinalized': 0,
        'uncovered_absences': 0
    }

    for emp in emp_qs:
        emp_id = str(emp.id)
        att = attendances.get(emp_id)
        roster = rosters.get(emp_id)

        # Site filtering applies to rostered site
        if site_id:
            emp_site_id = str(roster.site_id) if roster else (str(att.site_id) if att and att.site_id else None)
            if emp_site_id != str(site_id):
                continue

        # Resolve effective status
        if att:
            eff_status = att.status
            is_materialized = True
            notes = att.notes
            source = att.source
            recorded_by_name = att.recorded_by.get_full_name() or att.recorded_by.username if att.recorded_by else ''
            finalized_at = att.finalized_at.isoformat() if att.finalized_at else None
        elif emp_id in active_leaves:
            eff_status = AttendanceStatus.PAID_LEAVE if active_leaves[emp_id].leave_type.is_paid else AttendanceStatus.UNPAID_LEAVE
            is_materialized = False
            notes = active_leaves[emp_id].reason
            source = 'LEAVE_REQUEST'
            recorded_by_name = ''
            finalized_at = None
        elif is_holiday:
            eff_status = AttendanceStatus.HOLIDAY
            is_materialized = False
            notes = 'Company Holiday'
            source = 'HOLIDAY'
            recorded_by_name = ''
            finalized_at = None
        else:
            state = persistent_states.get(emp_id)
            if state and state.current_state == 'ABSENT' and d >= state.effective_from:
                eff_status = AttendanceStatus.ABSENT
            else:
                eff_status = AttendanceStatus.PRESENT
            is_materialized = False
            notes = ''
            source = 'PERSISTENT_DEFAULT'
            recorded_by_name = ''
            finalized_at = None

        if status_filter and eff_status != status_filter:
            continue

        # Check replacement coverage for DIRECT staff
        has_replacement = False
        replacement_guard_name = None

        if emp_id in replacements_by_original:
            rep_obj = replacements_by_original[emp_id]
            has_replacement = True
            if isinstance(rep_obj, DutyReplacement):
                replacement_guard_name = rep_obj.replacement_employee.full_name
            elif isinstance(rep_obj, DutyRoster):
                replacement_guard_name = rep_obj.employee.full_name

        # Calculate consecutive absent count
        absent_streak = 0
        if eff_status == AttendanceStatus.ABSENT:
            absent_streak, _ = calculate_consecutive_absent_days(emp, d)

        # Update summary counts
        totals['total_workforce'] += 1
        if eff_status == AttendanceStatus.PRESENT:
            totals['present'] += 1
        elif eff_status == AttendanceStatus.ABSENT:
            totals['absent'] += 1
            if emp.classification == 'DIRECT' and not has_replacement:
                totals['uncovered_absences'] += 1
        elif eff_status == AttendanceStatus.PAID_LEAVE:
            totals['paid_leave'] += 1
        elif eff_status == AttendanceStatus.UNPAID_LEAVE:
            totals['unpaid_leave'] += 1
        elif eff_status == AttendanceStatus.HOLIDAY:
            totals['holiday'] += 1
        elif eff_status == AttendanceStatus.WEEKLY_OFF:
            totals['weekly_off'] += 1
        elif eff_status == AttendanceStatus.HALF_DAY:
            totals['half_day'] += 1

        if emp.employment_status == 'JUMP':
            totals['jump_active'] += 1

        if is_materialized:
            totals['materialized'] += 1
        else:
            totals['unfinalized'] += 1

        rows.append({
            'employee_id': emp_id,
            'employee_name': emp.full_name,
            'employee_code': emp.employee_code,
            'cnic_number': emp.cnic_number,
            'classification': emp.classification,
            'designation_name': emp.designation.name if emp.designation else '',
            'employment_status': emp.employment_status,
            'effective_status': eff_status,
            'is_materialized': is_materialized,
            'attendance_id': str(att.id) if att else None,
            'notes': notes,
            'source': source,
            'recorded_by_name': recorded_by_name,
            'finalized_at': finalized_at,
            'consecutive_absent_days': absent_streak,
            # DIRECT Roster Information
            'has_planned_duty': bool(roster),
            'roster_id': str(roster.id) if roster else None,
            'site_id': str(roster.site_id) if roster else (str(att.site_id) if att and att.site_id else None),
            'site_name': roster.site.name if roster else (att.site.name if att and att.site else None),
            'post_id': str(roster.post_id) if roster and roster.post else (str(att.post_id) if att and att.post else None),
            'post_name': roster.post.post_name if roster and roster.post else (att.post.post_name if att and att.post else None),
            'shift_id': str(roster.shift_id) if roster else (str(att.shift_id) if att and att.shift else None),
            'shift_name': roster.shift.name if roster else (att.shift.name if att and att.shift else None),
            'is_replacement_duty': roster.is_replacement if roster else False,
            'has_replacement_coverage': has_replacement,
            'replacement_guard_name': replacement_guard_name
        })

    return {
        'date': str(d),
        'totals': totals,
        'workforce': rows
    }
