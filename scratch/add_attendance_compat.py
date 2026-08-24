import os

with open('hrm/services/compatibility.py', 'a') as f:
    f.write('''

def get_attendance(instance):
    """
    Returns the Universal WorkforceAttendance for a legacy entity if bridged.
    """
    from hrm.models import WorkforceAttendance, Attendance
    if isinstance(instance, WorkforceAttendance):
        return instance
    if isinstance(instance, Attendance):
        return getattr(instance, 'workforce_attendance', None)
    return None

def resolve_legacy_attendance(instance):
    """
    Returns the Legacy Attendance for a universal entity if bridged.
    """
    from hrm.models import WorkforceAttendance, Attendance
    if isinstance(instance, Attendance):
        return instance
    if isinstance(instance, WorkforceAttendance):
        return getattr(instance, 'legacy_attendance', None)
    return None

def get_workforce_architecture_state(instance):
    """
    Determines the current architecture state of the instance for Workforce Attendance.
    Returns:
    - 'UNIVERSAL': If natively created in Universal Workforce (WorkforceAttendance).
    - 'BRIDGED': If it is an Attendance record with an attached workforce_attendance field.
    - 'LEGACY': If it operates without Universal HR ties (Attendance only).
    """
    from hrm.models import WorkforceAttendance, Attendance
    if isinstance(instance, WorkforceAttendance):
        return 'UNIVERSAL'
    if isinstance(instance, Attendance):
        if getattr(instance, 'workforce_attendance_id', None) is not None:
            return 'BRIDGED'
        return 'LEGACY'
    return 'LEGACY'
''')
