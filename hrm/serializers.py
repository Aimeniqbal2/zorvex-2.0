from rest_framework import serializers
from django.db import models
from .models import Department, Position, Designation, Employee, Employment, EmployeeRecord, Attendance
from erp_core.middleware import get_current_company

class BaseTenantSerializer(serializers.ModelSerializer):
    def validate(self, attrs):
        request = self.context.get('request')
        company_id = get_current_company()
        if not company_id and request:
            company_id = request.META.get('HTTP_X_COMPANY_ID') or getattr(request.user, 'company_id', None)
        if not company_id:
            return attrs
            
        for field_name, value in attrs.items():
            if value and isinstance(value, models.Model) and hasattr(value, 'company_id'):
                if str(getattr(value, 'company_id')) != str(company_id):
                    raise serializers.ValidationError({
                        field_name: f"{value.__class__.__name__} must belong to your company."
                    })
        return attrs

class DepartmentSerializer(BaseTenantSerializer):
    class Meta:
        model = Department
        fields = '__all__'
        read_only_fields = ['id', 'company', 'created_at', 'updated_at', 'is_deleted']
        
    def validate_name(self, value):
        company_id = get_current_company() or (self.context['request'].user.company_id if 'request' in self.context else None)
        if Department.objects.filter(company_id=company_id, name__iexact=value, is_deleted=False).exists():
            raise serializers.ValidationError("A department with this name already exists.")
        return value

class PositionSerializer(BaseTenantSerializer):
    class Meta:
        model = Position
        fields = '__all__'
        read_only_fields = ['id', 'company', 'created_at', 'updated_at', 'is_deleted']
        
    def validate_name(self, value):
        company_id = get_current_company() or (self.context['request'].user.company_id if 'request' in self.context else None)
        if Position.objects.filter(company_id=company_id, name__iexact=value, is_deleted=False).exists():
            raise serializers.ValidationError("A position with this name already exists.")
        return value

class DesignationSerializer(BaseTenantSerializer):
    class Meta:
        model = Designation
        fields = '__all__'
        read_only_fields = ['id', 'company', 'created_at', 'updated_at', 'is_deleted']
        
    def validate_name(self, value):
        company_id = get_current_company() or (self.context['request'].user.company_id if 'request' in self.context else None)
        if Designation.objects.filter(company_id=company_id, name__iexact=value, is_deleted=False).exists():
            raise serializers.ValidationError("A designation with this name already exists.")
        return value

class EmployeeSerializer(BaseTenantSerializer):
    architecture_state = serializers.SerializerMethodField()
    legacy_record = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = Employee
        fields = '__all__'
        read_only_fields = ['id', 'company', 'created_at', 'updated_at', 'is_deleted']

    def get_architecture_state(self, obj):
        from hrm.services.compatibility import get_hr_architecture_state
        return get_hr_architecture_state(obj)

class EmploymentSerializer(BaseTenantSerializer):
    class Meta:
        model = Employment
        fields = '__all__'
        read_only_fields = ['id', 'company', 'created_at', 'updated_at', 'is_deleted']

class EmployeeRecordSerializer(BaseTenantSerializer):
    architecture_state = serializers.SerializerMethodField()
    employee = serializers.PrimaryKeyRelatedField(read_only=True)
    crm_entity = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = EmployeeRecord
        fields = '__all__'
        read_only_fields = ['id', 'company', 'created_at', 'updated_at', 'is_deleted', 'employee', 'crm_entity']

    def get_architecture_state(self, obj):
        from hrm.services.compatibility import get_hr_architecture_state
        return get_hr_architecture_state(obj)

class AttendanceSerializer(BaseTenantSerializer):
    class Meta:
        model = Attendance
        fields = '__all__'
        read_only_fields = ['id', 'company', 'created_at', 'updated_at', 'is_deleted']


from .models import (
    Candidate, CandidateDocument, CandidateVerification,
    WorkforceAttendance, Shift, WorkSchedule, LeaveType, LeaveBalance, LeaveRequest, Holiday, OvertimeRecord
)

class WorkforceAttendanceSerializer(BaseTenantSerializer):
    class Meta:
        model = WorkforceAttendance
        fields = '__all__'
        read_only_fields = ['id', 'company', 'created_at', 'updated_at', 'is_deleted']

class ShiftSerializer(BaseTenantSerializer):
    class Meta:
        model = Shift
        fields = '__all__'
        read_only_fields = ['id', 'company', 'created_at', 'updated_at', 'is_deleted']

class WorkScheduleSerializer(BaseTenantSerializer):
    class Meta:
        model = WorkSchedule
        fields = '__all__'
        read_only_fields = ['id', 'company', 'created_at', 'updated_at', 'is_deleted']

class LeaveTypeSerializer(BaseTenantSerializer):
    class Meta:
        model = LeaveType
        fields = '__all__'
        read_only_fields = ['id', 'company', 'created_at', 'updated_at', 'is_deleted']

class LeaveBalanceSerializer(BaseTenantSerializer):
    class Meta:
        model = LeaveBalance
        fields = '__all__'
        read_only_fields = ['id', 'company', 'created_at', 'updated_at', 'is_deleted', 'remaining']

class LeaveRequestSerializer(BaseTenantSerializer):
    class Meta:
        model = LeaveRequest
        fields = '__all__'
        read_only_fields = ['id', 'company', 'created_at', 'updated_at', 'is_deleted', 'status', 'approved_by', 'approved_at', 'rejection_reason']

class HolidaySerializer(BaseTenantSerializer):
    class Meta:
        model = Holiday
        fields = '__all__'
        read_only_fields = ['id', 'company', 'created_at', 'updated_at', 'is_deleted']

class OvertimeRecordSerializer(BaseTenantSerializer):
    class Meta:
        model = OvertimeRecord
        fields = '__all__'
        read_only_fields = ['id', 'company', 'created_at', 'updated_at', 'is_deleted', 'status', 'approved_by', 'approved_at']


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
            'journal_entry', 'created_at', 'updated_at', 'is_deleted'
        ]
        read_only_fields = [
            'id', 'company', 'run_number', 'processed_at', 'finalized_at',
            'finalized_by', 'journal_entry', 'created_at', 'updated_at', 'is_deleted'
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
            'gross_amount', 'deduction_amount', 'tax_amount', 'net_amount', 'lines',
            'created_at', 'updated_at', 'is_deleted'
        ]
        read_only_fields = [
            'id', 'company', 'payslip_number', 'gross_amount', 'deduction_amount',
            'tax_amount', 'net_amount', 'created_at', 'updated_at', 'is_deleted'
        ]

from hrm.models import PayrollAccountingConfiguration

class PayrollAccountingConfigurationSerializer(BaseTenantSerializer):
    class Meta:
        model = PayrollAccountingConfiguration
        fields = '__all__'
        read_only_fields = ['id', 'company', 'created_at', 'updated_at', 'is_deleted']


# ============================================================================
# PHASE C-1: RECRUITMENT & VETTING
# ============================================================================

class CandidateDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = CandidateDocument
        fields = '__all__'
        read_only_fields = ['company', 'created_at', 'updated_at', 'is_deleted', 'deleted_at']

class CandidateVerificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = CandidateVerification
        fields = '__all__'
        read_only_fields = ['company', 'created_at', 'updated_at', 'is_deleted', 'deleted_at']

class CandidateSerializer(serializers.ModelSerializer):
    documents = CandidateDocumentSerializer(many=True, read_only=True)
    verifications = CandidateVerificationSerializer(many=True, read_only=True)
    applied_designation_name = serializers.CharField(source='applied_designation.name', read_only=True)
    
    class Meta:
        model = Candidate
        fields = '__all__'
        read_only_fields = ['company', 'created_at', 'updated_at', 'is_deleted', 'deleted_at', 'candidate_number', 'converted_employee']

# ==============================================================================
# PHASE C-6: STATUTORY PAYROLL & PAYROLL DISBURSEMENT
# ==============================================================================
from .models import (
    StatutoryScheme, StatutoryRule, EmployeeStatutoryEnrollment,
    PayslipStatutoryDeduction, PayrollDisbursement, PayslipDisbursement
)

class StatutoryRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = StatutoryRule
        fields = '__all__'
        read_only_fields = ['company', 'created_at', 'updated_at', 'is_deleted', 'deleted_at']

class StatutorySchemeSerializer(serializers.ModelSerializer):
    rules = StatutoryRuleSerializer(many=True, read_only=True)
    class Meta:
        model = StatutoryScheme
        fields = '__all__'
        read_only_fields = ['company', 'created_at', 'updated_at', 'is_deleted', 'deleted_at']

class EmployeeStatutoryEnrollmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmployeeStatutoryEnrollment
        fields = '__all__'
        read_only_fields = ['company', 'created_at', 'updated_at', 'is_deleted', 'deleted_at']

class PayslipStatutoryDeductionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PayslipStatutoryDeduction
        fields = '__all__'
        read_only_fields = ['company', 'created_at', 'updated_at', 'is_deleted', 'deleted_at']

class PayslipDisbursementSerializer(serializers.ModelSerializer):
    class Meta:
        model = PayslipDisbursement
        fields = '__all__'
        read_only_fields = ['company', 'created_at', 'updated_at', 'is_deleted', 'deleted_at']

class PayrollDisbursementSerializer(serializers.ModelSerializer):
    payslips = PayslipDisbursementSerializer(many=True, read_only=True)
    class Meta:
        model = PayrollDisbursement
        fields = '__all__'
        read_only_fields = ['company', 'created_at', 'updated_at', 'is_deleted', 'deleted_at']

