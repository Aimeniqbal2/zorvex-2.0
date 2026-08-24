"""
operations/services/attendance_sync.py

Phase 8C — Attendance Synchronization Adapter.

Explicit (NOT signal-based) service that creates a WorkforceAttendance record
from a COMPLETED DutyAssignment, if one does not already exist for that
(company, employee, date) combination.

Rules:
- Existing attendance (biometric/other) ALWAYS wins — never overwrite.
- source = 'DUTY_ASSIGNMENT'
- Safe to call multiple times (idempotent).
- Uses transaction.atomic() + select_for_update() for concurrency safety.
- Does NOT create legacy Attendance records.
- Does NOT modify any existing attendance record.
"""

import logging
from datetime import datetime, timezone as dt_timezone
from django.db import transaction
from django.core.exceptions import ValidationError

logger = logging.getLogger(__name__)


class AttendanceSyncError(Exception):
    """Raised when the attendance sync adapter encounters a non-retryable error."""
    pass


def sync_duty_assignment_attendance(duty_assignment_id, company_id):
    """
    Synchronise a completed DutyAssignment to WorkforceAttendance.

    Returns:
        dict: {
            'created': bool,
            'attendance_id': UUID | None,
            'message': str
        }

    Raises:
        AttendanceSyncError: on cross-company, invalid status, or DB errors.
    """
    from operations.models import DutyAssignment, DutyAssignmentStatus
    from hrm.models import WorkforceAttendance, AttendanceStatus

    with transaction.atomic():
        # --- Load and lock the DutyAssignment ---
        try:
            duty = DutyAssignment.objects.select_for_update().get(
                id=duty_assignment_id,
                company_id=company_id,
                is_deleted=False
            )
        except DutyAssignment.DoesNotExist:
            raise AttendanceSyncError(
                f"DutyAssignment {duty_assignment_id} not found for company {company_id}."
            )

        # --- Tenant isolation ---
        if str(duty.company_id) != str(company_id):
            raise AttendanceSyncError("Cross-company DutyAssignment access rejected.")

        if str(duty.employee.company_id) != str(company_id):
            raise AttendanceSyncError("Cross-company Employee reference in DutyAssignment.")

        # --- Status gate: only COMPLETED duties generate attendance ---
        if duty.status != DutyAssignmentStatus.COMPLETED:
            return {
                'created': False,
                'attendance_id': None,
                'message': f"DutyAssignment is {duty.status}, not COMPLETED. No attendance created."
            }

        employee = duty.employee
        duty_date = duty.date

        # --- Idempotency: existing record wins ---
        existing = WorkforceAttendance.objects.filter(
            company_id=company_id,
            employee=employee,
            date=duty_date,
            is_deleted=False
        ).select_for_update().first()

        if existing:
            logger.info(
                f"[ATTENDANCE_SYNC] WorkforceAttendance already exists for "
                f"employee={employee.id}, date={duty_date}. Skipping."
            )
            return {
                'created': False,
                'attendance_id': existing.id,
                'message': 'Existing attendance record found. No change made.'
            }

        # --- Derive check_in / check_out as timezone-aware datetimes ---
        # Settings TIME_ZONE is 'UTC'. Use UTC.
        if duty.start_time:
            check_in = datetime.combine(duty_date, duty.start_time).replace(tzinfo=dt_timezone.utc)
        else:
            check_in = None

        if duty.end_time:
            check_out = datetime.combine(duty_date, duty.end_time).replace(tzinfo=dt_timezone.utc)
        else:
            check_out = None

        # --- Create the WorkforceAttendance record ---
        attendance = WorkforceAttendance(
            company_id=company_id,
            employee=employee,
            date=duty_date,
            check_in=check_in,
            check_out=check_out,
            status=AttendanceStatus.PRESENT,
            source='DUTY_ASSIGNMENT',
            notes=f"Auto-synced from DutyAssignment {duty.id}"
        )
        attendance.save()

        logger.info(
            f"[ATTENDANCE_SYNC] Created WorkforceAttendance {attendance.id} "
            f"for employee={employee.id}, date={duty_date}, duty={duty.id}"
        )
        return {
            'created': True,
            'attendance_id': attendance.id,
            'message': 'WorkforceAttendance created from DutyAssignment.'
        }
