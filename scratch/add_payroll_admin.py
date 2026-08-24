import os

with open('hrm/admin.py', 'a') as f:
    f.write('''

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
    readonly_fields = ('payslip_number', 'gross_amount', 'deduction_amount', 'net_amount')
    autocomplete_fields = ('payroll_run', 'employee', 'employment', 'salary_assignment', 'currency')
    inlines = [PayslipLineInline]

''')
