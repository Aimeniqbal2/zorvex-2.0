import os

with open('hrm/serializers.py', 'a') as f:
    f.write('''

# ============================================================================
# PHASE 7D: UNIVERSAL PAYROLL FOUNDATION SERIALIZERS
# ============================================================================

from hrm.models import (
    SalaryComponent, SalaryStructure, SalaryStructureComponent, EmployeeSalaryAssignment,
    PayrollPeriod, PayrollRun, Payslip, PayslipLine
)

class SalaryComponentSerializer(BaseTenantSerializer):
    class Meta:
        model = SalaryComponent
        fields = [
            'id', 'company', 'name', 'code', 'description', 'component_type',
            'calculation_type', 'is_taxable', 'is_recurring', 'display_order',
            'is_active', 'created_at', 'updated_at', 'is_deleted'
        ]
        read_only_fields = ['id', 'company', 'created_at', 'updated_at', 'is_deleted']

class SalaryStructureComponentSerializer(BaseTenantSerializer):
    salary_component_detail = SalaryComponentSerializer(source='salary_component', read_only=True)
    
    class Meta:
        model = SalaryStructureComponent
        fields = [
            'id', 'company', 'salary_structure', 'salary_component', 'salary_component_detail',
            'sequence', 'amount', 'percentage', 'effective_from', 'effective_to',
            'is_active', 'created_at', 'updated_at', 'is_deleted'
        ]
        read_only_fields = ['id', 'company', 'created_at', 'updated_at', 'is_deleted']

class SalaryStructureSerializer(BaseTenantSerializer):
    components = SalaryStructureComponentSerializer(many=True, read_only=True)
    
    class Meta:
        model = SalaryStructure
        fields = [
            'id', 'company', 'name', 'code', 'description', 'currency',
            'effective_from', 'effective_to', 'is_active', 'components',
            'created_at', 'updated_at', 'is_deleted'
        ]
        read_only_fields = ['id', 'company', 'created_at', 'updated_at', 'is_deleted']

class EmployeeSalaryAssignmentSerializer(BaseTenantSerializer):
    class Meta:
        model = EmployeeSalaryAssignment
        fields = [
            'id', 'company', 'employee', 'employment', 'salary_structure', 'currency',
            'base_salary', 'effective_from', 'effective_to', 'status', 'notes',
            'created_at', 'updated_at', 'is_deleted'
        ]
        read_only_fields = ['id', 'company', 'created_at', 'updated_at', 'is_deleted']

class PayrollPeriodSerializer(BaseTenantSerializer):
    class Meta:
        model = PayrollPeriod
        fields = [
            'id', 'company', 'name', 'start_date', 'end_date', 'payment_date',
            'status', 'created_at', 'updated_at', 'is_deleted'
        ]
        read_only_fields = ['id', 'company', 'created_at', 'updated_at', 'is_deleted']

class PayrollRunSerializer(BaseTenantSerializer):
    class Meta:
        model = PayrollRun
        fields = [
            'id', 'company', 'payroll_period', 'run_number', 'status',
            'processed_at', 'finalized_at', 'notes', 'finalized_by',
            'created_at', 'updated_at', 'is_deleted'
        ]
        read_only_fields = [
            'id', 'company', 'run_number', 'processed_at', 'finalized_at',
            'finalized_by', 'created_at', 'updated_at', 'is_deleted'
        ]

class PayslipLineSerializer(BaseTenantSerializer):
    salary_component_detail = SalaryComponentSerializer(source='salary_component', read_only=True)
    
    class Meta:
        model = PayslipLine
        fields = [
            'id', 'company', 'payslip', 'salary_component', 'salary_component_detail',
            'description', 'component_type', 'amount', 'sequence',
            'created_at', 'updated_at', 'is_deleted'
        ]
        read_only_fields = ['id', 'company', 'created_at', 'updated_at', 'is_deleted']

class PayslipSerializer(BaseTenantSerializer):
    lines = PayslipLineSerializer(many=True, read_only=True)
    
    class Meta:
        model = Payslip
        fields = [
            'id', 'company', 'payroll_run', 'employee', 'employment',
            'salary_assignment', 'payslip_number', 'status', 'currency',
            'gross_amount', 'deduction_amount', 'net_amount', 'lines',
            'created_at', 'updated_at', 'is_deleted'
        ]
        read_only_fields = [
            'id', 'company', 'payslip_number', 'gross_amount', 'deduction_amount',
            'net_amount', 'created_at', 'updated_at', 'is_deleted'
        ]
''')
