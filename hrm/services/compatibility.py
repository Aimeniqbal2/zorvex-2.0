from hrm.models import Employee, EmployeeRecord

def get_employee(instance):
    """
    Returns the Universal HR Employee for a legacy entity if bridged.
    """
    if isinstance(instance, Employee):
        return instance
    if isinstance(instance, EmployeeRecord):
        return getattr(instance, 'employee', None)
    
    employee_record = getattr(instance, 'employee_record', None)
    if employee_record and getattr(employee_record, 'employee', None):
        return employee_record.employee
    
    return None

def resolve_employee_record(instance):
    """
    Returns the Legacy HR EmployeeRecord for a universal entity if bridged.
    """
    if isinstance(instance, EmployeeRecord):
        return instance
    
    if isinstance(instance, Employee):
        return getattr(instance, 'legacy_record', None)
        
    return None

def get_hr_architecture_state(instance):
    """
    Determines the current architecture state of the instance for HR identity.
    Returns:
    - 'UNIVERSAL': If natively created in Universal HR (Employee instance).
    - 'BRIDGED': If it is an EmployeeRecord with an attached employee field.
    - 'LEGACY': If it operates without Universal HR ties (EmployeeRecord only).
    """
    if isinstance(instance, Employee):
        return 'UNIVERSAL'
        
    if isinstance(instance, EmployeeRecord):
        if getattr(instance, 'employee_id', None) is not None:
            return 'BRIDGED'
        return 'LEGACY'
        
    return 'LEGACY'


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
    return 'LEGACY'

def is_universal_hr_active(company_id):
    """
    Checks if Universal HR cutover is active for the given company.
    It reads the 'hr' module configuration. Defaults to True since Phase 7H cutover is globally operational.
    """
    from platform_core.models import CompanyModule
    try:
        cm = CompanyModule.objects.select_related('module').get(company_id=company_id, module__code='hr')
        config = cm.configuration or {}
        return config.get('universal_hr_cutover', True)
    except CompanyModule.DoesNotExist:
        return True

