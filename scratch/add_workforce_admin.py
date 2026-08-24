import os

with open('hrm/admin.py', 'a') as f:
    f.write('''
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
''')
