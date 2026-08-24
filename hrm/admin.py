from django.contrib import admin
from .models import Department, Position, Designation, Employee, Employment, EmployeeRecord, Attendance

@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ('name', 'company', 'is_deleted')
    list_filter = ('company', 'is_deleted')
    search_fields = ('name',)
    list_select_related = ('company',)
    readonly_fields = ('id', 'created_at', 'updated_at')

@admin.register(Position)
class PositionAdmin(admin.ModelAdmin):
    list_display = ('name', 'code', 'department', 'company', 'is_active', 'is_deleted')
    list_filter = ('company', 'is_active', 'is_deleted', 'department')
    search_fields = ('name', 'code')
    list_select_related = ('company', 'department')
    readonly_fields = ('id', 'created_at', 'updated_at')

@admin.register(Designation)
class DesignationAdmin(admin.ModelAdmin):
    list_display = ('name', 'code', 'company', 'is_active', 'is_deleted')
    list_filter = ('company', 'is_active', 'is_deleted')
    search_fields = ('name', 'code')
    list_select_related = ('company',)
    readonly_fields = ('id', 'created_at', 'updated_at')

@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = ('first_name', 'last_name', 'employee_code', 'department', 'position', 'company', 'is_active')
    list_filter = ('company', 'is_active', 'is_deleted', 'department', 'branch')
    search_fields = ('first_name', 'last_name', 'employee_code', 'email')
    list_select_related = ('company', 'user', 'department', 'position', 'designation', 'branch')
    readonly_fields = ('id', 'created_at', 'updated_at')

@admin.register(Employment)
class EmploymentAdmin(admin.ModelAdmin):
    list_display = ('employee', 'employment_type', 'employment_status', 'start_date', 'end_date', 'is_current', 'company')
    list_filter = ('company', 'employment_type', 'employment_status', 'is_current', 'is_deleted')
    search_fields = ('employee__first_name', 'employee__last_name', 'employee__employee_code')
    list_select_related = ('company', 'employee', 'department', 'position', 'designation', 'branch')
    readonly_fields = ('id', 'created_at', 'updated_at')

@admin.register(EmployeeRecord)
class EmployeeRecordAdmin(admin.ModelAdmin):
    list_display = ('user', 'department', 'crm_architecture_state', 'hr_architecture_state', 'company')
    list_select_related = ('user', 'department', 'company', 'crm_entity', 'employee')
    readonly_fields = ('id', 'created_at', 'updated_at', 'employee')

    def crm_architecture_state(self, obj):
        from crm.services.compatibility import get_architecture_state
        return get_architecture_state(obj)
    crm_architecture_state.short_description = "CRM Architecture"

    def hr_architecture_state(self, obj):
        from hrm.services.compatibility import get_hr_architecture_state
        return get_hr_architecture_state(obj)
    hr_architecture_state.short_description = "HR Architecture"

@admin.register(Attendance)
class AttendanceAdmin(admin.ModelAdmin):
    list_display = ('employee', 'date', 'company')
    list_select_related = ('employee', 'company')
    list_filter = ('company', 'date')
    readonly_fields = ('id', 'created_at', 'updated_at')

from .models import (
    WorkforceAttendance, Shift, WorkSchedule, LeaveType, LeaveBalance, LeaveRequest, Holiday, OvertimeRecord
)

@admin.register(WorkforceAttendance)
class WorkforceAttendanceAdmin(admin.ModelAdmin):
    list_display = ('employee', 'date', 'check_in', 'check_out', 'status', 'company')
    list_filter = ('company', 'status', 'date')
    search_fields = ('employee__first_name', 'employee__last_name', 'employee__employee_code')
    list_select_related = ('company', 'employee')
    readonly_fields = ('id', 'created_at', 'updated_at')

@admin.register(Shift)
class ShiftAdmin(admin.ModelAdmin):
    list_display = ('name', 'code', 'start_time', 'end_time', 'is_overnight', 'is_active', 'company')
    list_filter = ('company', 'is_active', 'is_overnight')
    search_fields = ('name', 'code')
    list_select_related = ('company',)
    readonly_fields = ('id', 'created_at', 'updated_at')

@admin.register(WorkSchedule)
class WorkScheduleAdmin(admin.ModelAdmin):
    list_display = ('employee', 'shift', 'effective_from', 'effective_to', 'is_active', 'company')
    list_filter = ('company', 'is_active')
    search_fields = ('employee__first_name', 'employee__last_name')
    list_select_related = ('company', 'employee', 'shift')
    readonly_fields = ('id', 'created_at', 'updated_at')

@admin.register(LeaveType)
class LeaveTypeAdmin(admin.ModelAdmin):
    list_display = ('name', 'code', 'is_paid', 'annual_allocation', 'requires_approval', 'is_active', 'company')
    list_filter = ('company', 'is_paid', 'is_active', 'requires_approval')
    search_fields = ('name', 'code')
    list_select_related = ('company',)
    readonly_fields = ('id', 'created_at', 'updated_at')

@admin.register(LeaveBalance)
class LeaveBalanceAdmin(admin.ModelAdmin):
    list_display = ('employee', 'leave_type', 'year', 'allocated', 'used', 'remaining', 'company')
    list_filter = ('company', 'year')
    search_fields = ('employee__first_name', 'employee__last_name')
    list_select_related = ('company', 'employee', 'leave_type')
    readonly_fields = ('id', 'created_at', 'updated_at', 'remaining')

@admin.register(LeaveRequest)
class LeaveRequestAdmin(admin.ModelAdmin):
    list_display = ('employee', 'leave_type', 'start_date', 'end_date', 'status', 'company')
    list_filter = ('company', 'status')
    search_fields = ('employee__first_name', 'employee__last_name')
    list_select_related = ('company', 'employee', 'leave_type', 'approved_by')
    readonly_fields = ('id', 'created_at', 'updated_at')

@admin.register(Holiday)
class HolidayAdmin(admin.ModelAdmin):
    list_display = ('name', 'date', 'is_optional', 'is_active', 'company')
    list_filter = ('company', 'is_optional', 'is_active')
    search_fields = ('name',)
    list_select_related = ('company',)
    readonly_fields = ('id', 'created_at', 'updated_at')

@admin.register(OvertimeRecord)
class OvertimeRecordAdmin(admin.ModelAdmin):
    list_display = ('employee', 'date', 'hours', 'status', 'company')
    list_filter = ('company', 'status')
    search_fields = ('employee__first_name', 'employee__last_name')
    list_select_related = ('company', 'employee', 'attendance', 'approved_by')
    readonly_fields = ('id', 'created_at', 'updated_at')


# ============================================================================
# PHASE 7D: UNIVERSAL PAYROLL FOUNDATION ADMIN
# ============================================================================

from hrm.models import (
    SalaryComponent, SalaryStructure, SalaryStructureComponent, EmployeeSalaryAssignment,
    PayrollPeriod, PayrollRun, Payslip, PayslipLine
)

@admin.register(SalaryComponent)
class SalaryComponentAdmin(admin.ModelAdmin):
    list_display = ('name', 'code', 'company', 'component_type', 'calculation_type', 'is_active', 'is_deleted')
    list_filter = ('company', 'component_type', 'calculation_type', 'is_active', 'is_deleted')
    search_fields = ('name', 'code')

class SalaryStructureComponentInline(admin.TabularInline):
    model = SalaryStructureComponent
    extra = 1

@admin.register(SalaryStructure)
class SalaryStructureAdmin(admin.ModelAdmin):
    list_display = ('name', 'code', 'company', 'currency', 'effective_from', 'is_active', 'is_deleted')
    list_filter = ('company', 'is_active', 'is_deleted')
    search_fields = ('name', 'code')
    inlines = [SalaryStructureComponentInline]

@admin.register(EmployeeSalaryAssignment)
class EmployeeSalaryAssignmentAdmin(admin.ModelAdmin):
    list_display = ('employee', 'company', 'salary_structure', 'base_salary', 'effective_from', 'status', 'is_deleted')
    list_filter = ('company', 'status', 'is_deleted')
    search_fields = ('employee__first_name', 'employee__last_name', 'employee__employee_id')
    autocomplete_fields = ('employee', 'employment', 'salary_structure', 'currency')

@admin.register(PayrollPeriod)
class PayrollPeriodAdmin(admin.ModelAdmin):
    list_display = ('name', 'company', 'start_date', 'end_date', 'payment_date', 'status', 'is_deleted')
    list_filter = ('company', 'status', 'is_deleted')
    search_fields = ('name',)
    date_hierarchy = 'start_date'

@admin.register(PayrollRun)
class PayrollRunAdmin(admin.ModelAdmin):
    list_display = ('run_number', 'company', 'payroll_period', 'status', 'processed_at', 'finalized_at', 'is_deleted')
    list_filter = ('company', 'status', 'is_deleted')
    search_fields = ('run_number', 'payroll_period__name')
    readonly_fields = ('run_number', 'processed_at', 'finalized_at', 'finalized_by')

class PayslipLineInline(admin.TabularInline):
    model = PayslipLine
    extra = 1

@admin.register(Payslip)
class PayslipAdmin(admin.ModelAdmin):
    list_display = ('payslip_number', 'company', 'payroll_run', 'employee', 'status', 'net_amount', 'is_deleted')
    list_filter = ('company', 'status', 'is_deleted')
    search_fields = ('payslip_number', 'employee__first_name', 'employee__last_name', 'payroll_run__run_number')
    readonly_fields = ('payslip_number', 'gross_amount', 'deduction_amount', 'tax_amount', 'net_amount')
    autocomplete_fields = ('payroll_run', 'employee', 'employment', 'salary_assignment', 'currency')
    inlines = [PayslipLineInline]


from hrm.models import PayrollAccountingConfiguration

@admin.register(PayrollAccountingConfiguration)
class PayrollAccountingConfigurationAdmin(admin.ModelAdmin):
    list_display = ('company', 'is_active', 'salary_expense_account', 'salary_payable_account')
    list_filter = ('company', 'is_active')

