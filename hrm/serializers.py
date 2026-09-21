from datetime import date
from rest_framework import serializers
from django.db import models
from erp_core.middleware import get_current_company
from .models import (
    Department, Position, Designation, Employee, Employment, EmployeeRecord, Attendance,
    EmployeeNextOfKin, EmployeeDocument, EmployeeTraining, EmploymentHistory, StatutorySchemeRateHistory,
    EmployeeReference
)

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

class EmployeeNextOfKinSerializer(BaseTenantSerializer):
    class Meta:
        model = EmployeeNextOfKin
        fields = '__all__'
        read_only_fields = ['id', 'company', 'created_at', 'updated_at', 'is_deleted']

class EmployeeDocumentSerializer(BaseTenantSerializer):
    verified_by_name = serializers.CharField(source='verified_by.get_full_name', read_only=True)
    document_type_display = serializers.CharField(source='get_document_type_display', read_only=True)
    verification_status_display = serializers.CharField(source='get_verification_status_display', read_only=True)

    class Meta:
        model = EmployeeDocument
        fields = '__all__'
        read_only_fields = ['id', 'company', 'created_at', 'updated_at', 'is_deleted', 'verified_by', 'verified_at']

class EmployeeReferenceSerializer(BaseTenantSerializer):
    verified_by_name = serializers.CharField(source='verified_by.get_full_name', read_only=True)

    class Meta:
        model = EmployeeReference
        fields = '__all__'
        read_only_fields = ['id', 'company', 'created_at', 'updated_at', 'is_deleted', 'verified_by', 'verified_at']

class EmployeeTrainingSerializer(BaseTenantSerializer):
    class Meta:
        model = EmployeeTraining
        fields = '__all__'
        read_only_fields = ['id', 'company', 'created_at', 'updated_at', 'is_deleted']

class EmploymentHistorySerializer(BaseTenantSerializer):
    changed_by_name = serializers.CharField(source='changed_by.get_full_name', read_only=True)
    approved_by_name = serializers.CharField(source='approved_by.get_full_name', read_only=True)

    class Meta:
        model = EmploymentHistory
        fields = '__all__'
        read_only_fields = ['id', 'company', 'created_at', 'updated_at', 'is_deleted']

class StatutorySchemeRateHistorySerializer(BaseTenantSerializer):
    class Meta:
        model = StatutorySchemeRateHistory
        fields = '__all__'
        read_only_fields = ['id', 'company', 'created_at', 'updated_at', 'is_deleted']

class EmployeeSerializer(BaseTenantSerializer):
    architecture_state = serializers.SerializerMethodField()
    legacy_record = serializers.PrimaryKeyRelatedField(read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True)
    designation_name = serializers.CharField(source='designation.name', read_only=True)
    joining_date = serializers.DateField(required=False, allow_null=True)
    hire_date = serializers.DateField(required=False, allow_null=True)
    date_of_birth = serializers.DateField(required=False, allow_null=True)
    cnic_issue_date = serializers.DateField(required=False, allow_null=True)
    cnic_expiry_date = serializers.DateField(required=False, allow_null=True)
    age = serializers.IntegerField(read_only=True)
    training_completed = serializers.BooleanField(read_only=True)
    full_name = serializers.CharField(read_only=True)
    name = serializers.CharField(source='full_name', required=False, allow_blank=True)
    first_name = serializers.CharField(required=False, allow_blank=True)
    last_name = serializers.CharField(required=False, allow_blank=True, default='')
    next_of_kin = EmployeeNextOfKinSerializer(many=True, read_only=True)
    documents = EmployeeDocumentSerializer(many=True, read_only=True)
    trainings = EmployeeTrainingSerializer(many=True, read_only=True)
    history_logs = EmploymentHistorySerializer(many=True, read_only=True)
    references = EmployeeReferenceSerializer(many=True, read_only=True)
    preferred_payment_destination = serializers.SerializerMethodField()

    # Write-only payment fields to sync with finance.EmployeePaymentDestination
    payment_method = serializers.CharField(write_only=True, required=False, allow_blank=True)
    bank_name = serializers.CharField(write_only=True, required=False, allow_blank=True)
    account_title = serializers.CharField(write_only=True, required=False, allow_blank=True)
    account_number = serializers.CharField(write_only=True, required=False, allow_blank=True)
    iban = serializers.CharField(write_only=True, required=False, allow_blank=True)
    wallet_provider = serializers.CharField(write_only=True, required=False, allow_blank=True)
    wallet_number = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = Employee
        fields = '__all__'
        read_only_fields = ['id', 'company', 'employee_code', 'created_at', 'updated_at', 'is_deleted']

    def to_internal_value(self, data):
        data = data.copy() if hasattr(data, 'copy') else dict(data)
        
        # Single full name support: allows "name", "full_name", or "first_name" without requiring last_name
        name_val = data.get('name') or data.get('full_name') or data.get('first_name')
        if name_val is not None:
            data['first_name'] = str(name_val).strip()
            data['last_name'] = str(data.get('last_name') or '').strip()

        date_fields = [
            'date_of_birth', 'hire_date', 'joining_date', 
            'confirmation_date', 'resignation_date', 'termination_date',
            'last_working_date', 'rehire_date', 'cnic_issue_date', 'cnic_expiry_date'
        ]
        for f in date_fields:
            if f in data and (data[f] == '' or data[f] is None):
                data[f] = None
        if data.get('joining_date') and not data.get('hire_date'):
            data['hire_date'] = data['joining_date']
        return super().to_internal_value(data)

    def get_architecture_state(self, obj):
        from hrm.services.compatibility import get_hr_architecture_state
        return get_hr_architecture_state(obj)

    def get_preferred_payment_destination(self, obj):
        try:
            dest = obj.payment_destinations.filter(is_active=True, is_preferred=True).first()
            if not dest:
                dest = obj.payment_destinations.filter(is_active=True).first()
            if dest:
                return {
                    'id': str(dest.id),
                    'payment_method': dest.payment_method,
                    'bank_name': dest.bank_name,
                    'account_title': dest.account_title,
                    'account_number': dest.account_number,
                    'iban': dest.iban,
                    'wallet_provider': dest.wallet_provider,
                    'wallet_number': dest.wallet_number,
                    'is_preferred': dest.is_preferred,
                }
        except Exception:
            pass
        return None

    def _sync_payment_destination(self, employee, validated_data):
        payment_method = validated_data.pop('payment_method', None)
        bank_name = validated_data.pop('bank_name', '')
        account_title = validated_data.pop('account_title', '')
        account_number = validated_data.pop('account_number', '')
        iban = validated_data.pop('iban', '')
        wallet_provider = validated_data.pop('wallet_provider', '')
        wallet_number = validated_data.pop('wallet_number', '')

        if payment_method or bank_name or account_number or wallet_number:
            from finance.models import EmployeePaymentDestination
            method = payment_method or ('WALLET' if wallet_number else ('BANK_TRANSFER' if account_number else 'CASH'))
            dest = employee.payment_destinations.filter(is_preferred=True, is_active=True).first()
            if not dest:
                dest = employee.payment_destinations.filter(is_active=True).first()
            
            if dest:
                dest.payment_method = method
                if bank_name:
                    dest.bank_name = bank_name
                if account_title:
                    dest.account_title = account_title
                if account_number:
                    dest.account_number = account_number
                if iban:
                    dest.iban = iban
                if wallet_provider:
                    dest.wallet_provider = wallet_provider
                if wallet_number:
                    dest.wallet_number = wallet_number
                dest.save()
            else:
                EmployeePaymentDestination.objects.create(
                    company=employee.company,
                    employee=employee,
                    payment_method=method,
                    bank_name=bank_name or '',
                    account_title=account_title or '',
                    account_number=account_number or '',
                    iban=iban or '',
                    wallet_provider=wallet_provider or '',
                    wallet_number=wallet_number or '',
                    is_preferred=True,
                    is_active=True,
                )

    def create(self, validated_data):
        payment_keys = ['payment_method', 'bank_name', 'account_title', 'account_number', 'iban', 'wallet_provider', 'wallet_number']
        payment_data = {k: validated_data.pop(k, None) for k in payment_keys if k in validated_data}
        employee = super().create(validated_data)
        if payment_data:
            self._sync_payment_destination(employee, payment_data)
        return employee

    def update(self, instance, validated_data):
        payment_keys = ['payment_method', 'bank_name', 'account_title', 'account_number', 'iban', 'wallet_provider', 'wallet_number']
        payment_data = {k: validated_data.pop(k, None) for k in payment_keys if k in validated_data}
        employee = super().update(instance, validated_data)
        if payment_data:
            self._sync_payment_destination(employee, payment_data)
        return employee

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
    WorkforceAttendance, Shift, WorkSchedule, LeaveType, LeaveBalance, LeaveRequest, Holiday, OvertimeRecord,
    EmployeeAttendanceState, JumpRecord
)

class WorkforceAttendanceSerializer(BaseTenantSerializer):
    employee_name = serializers.CharField(source='employee.full_name', read_only=True)
    employee_code = serializers.CharField(source='employee.employee_code', read_only=True)
    site_name = serializers.CharField(source='site.name', read_only=True)
    post_name = serializers.CharField(source='post.post_name', read_only=True)
    shift_name = serializers.CharField(source='shift.name', read_only=True)
    recorded_by_name = serializers.CharField(source='recorded_by.get_full_name', read_only=True)

    class Meta:
        model = WorkforceAttendance
        fields = '__all__'
        read_only_fields = ['id', 'company', 'created_at', 'updated_at', 'is_deleted']

class EmployeeAttendanceStateSerializer(BaseTenantSerializer):
    employee_name = serializers.CharField(source='employee.full_name', read_only=True)
    employee_code = serializers.CharField(source='employee.employee_code', read_only=True)

    class Meta:
        model = EmployeeAttendanceState
        fields = '__all__'
        read_only_fields = ['id', 'company', 'created_at', 'updated_at', 'is_deleted']

class JumpRecordSerializer(BaseTenantSerializer):
    employee_name = serializers.CharField(source='employee.full_name', read_only=True)
    employee_code = serializers.CharField(source='employee.employee_code', read_only=True)
    reinstated_by_name = serializers.CharField(source='reinstated_by.get_full_name', read_only=True)
    resolved_by_name = serializers.CharField(source='resolved_by.get_full_name', read_only=True)

    class Meta:
        model = JumpRecord
        fields = '__all__'
        read_only_fields = ['id', 'company', 'created_at', 'updated_at', 'is_deleted']

class ShiftSerializer(BaseTenantSerializer):
    duration_hours = serializers.FloatField(read_only=True)

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
    employee_code = serializers.CharField(source='employee.employee_code', read_only=True)
    previous_employee_code = serializers.CharField(source='employee.previous_employee_code', read_only=True)
    employee_name = serializers.CharField(source='employee.get_full_name', read_only=True)
    department_name = serializers.CharField(source='employee.department.name', read_only=True)
    designation_name = serializers.CharField(source='employee.designation.name', read_only=True)
    stop_payment_by_name = serializers.CharField(source='stop_payment_by.get_full_name', read_only=True)
    
    class Meta:
        model = Payslip
        fields = [
            'id', 'company', 'payroll_run', 'employee', 'employment',
            'employee_code', 'previous_employee_code', 'employee_name', 'department_name', 'designation_name',
            'salary_assignment', 'payslip_number', 'status', 'currency',
            'gross_amount', 'deduction_amount', 'tax_amount', 'net_amount', 'lines',
            'is_stop_payment', 'stop_payment_reason', 'stop_payment_at', 'stop_payment_by', 'stop_payment_by_name',
            'created_at', 'updated_at', 'is_deleted'
        ]
        read_only_fields = [
            'id', 'company', 'payslip_number', 'gross_amount', 'deduction_amount',
            'tax_amount', 'net_amount', 'stop_payment_at', 'stop_payment_by',
            'created_at', 'updated_at', 'is_deleted'
        ]

from hrm.models import    PayrollDisbursement, PayslipDisbursement, CompanyPayrollPolicy, PayrollAccountingConfiguration

class CompanyPayrollPolicySerializer(BaseTenantSerializer):
    class Meta:
        model = CompanyPayrollPolicy
        fields = '__all__'
        read_only_fields = ['id', 'company', 'created_at', 'updated_at', 'is_deleted']

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
    name = serializers.CharField(source='full_name', read_only=True)
    full_name = serializers.CharField(read_only=True)
    first_name = serializers.CharField(required=False, allow_blank=True, default='')
    last_name = serializers.CharField(required=False, allow_blank=True, default='')
    documents = CandidateDocumentSerializer(many=True, read_only=True)
    verifications = CandidateVerificationSerializer(many=True, read_only=True)
    applied_designation_name = serializers.CharField(source='applied_designation.name', read_only=True)
    
    class Meta:
        model = Candidate
        fields = '__all__'
        read_only_fields = ['company', 'created_at', 'updated_at', 'is_deleted', 'deleted_at', 'candidate_number', 'converted_employee']

    def to_internal_value(self, data):
        ret = super().to_internal_value(data)
        raw_name = data.get('name') or data.get('full_name') or data.get('first_name') or ''
        if raw_name:
            ret['first_name'] = str(raw_name).strip()
            ret['last_name'] = str(data.get('last_name') or '').strip()
        return ret

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


# ============================================================================
# Phase S-5H: Workforce Lifecycle Action Serializers
# ============================================================================

class PromoteDesignationActionSerializer(serializers.Serializer):
    new_designation = serializers.UUIDField()
    effective_date = serializers.DateField(required=False, default=date.today)
    reason = serializers.CharField(required=False, allow_blank=True, default='')
    is_promotion = serializers.BooleanField(required=False, default=True)
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class ChangeDepartmentActionSerializer(serializers.Serializer):
    new_department = serializers.UUIDField()
    effective_date = serializers.DateField(required=False, default=date.today)
    reason = serializers.CharField(required=False, allow_blank=True, default='')
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class ChangeClassificationActionSerializer(serializers.Serializer):
    new_classification = serializers.ChoiceField(choices=['DIRECT', 'INDIRECT'])
    effective_date = serializers.DateField(required=False, default=date.today)
    reason = serializers.CharField(required=False, allow_blank=True, default='')
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class ReviseSalaryActionSerializer(serializers.Serializer):
    base_salary = serializers.DecimalField(max_digits=12, decimal_places=2)
    effective_date = serializers.DateField(required=False, default=date.today)
    daily_rate = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True)
    single_ot_rate = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, default=0)
    double_ot_rate = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, default=0)
    currency = serializers.UUIDField(required=False, allow_null=True)
    salary_structure = serializers.UUIDField(required=False, allow_null=True)
    reason = serializers.CharField(required=False, allow_blank=True, default='')
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class TransferDeploymentActionSerializer(serializers.Serializer):
    new_site = serializers.UUIDField()
    new_post = serializers.UUIDField(required=False, allow_null=True)
    new_service_contract = serializers.UUIDField(required=False, allow_null=True)
    new_designation = serializers.UUIDField(required=False, allow_null=True)
    start_date = serializers.DateField(required=False, default=date.today)
    relief_reason = serializers.CharField(required=False, allow_blank=True, default='')
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class RelieveDeploymentActionSerializer(serializers.Serializer):
    relieved_date = serializers.DateField(required=False, default=date.today)
    relief_reason = serializers.CharField(required=False, allow_blank=True, default='')
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class SuspendEmployeeActionSerializer(serializers.Serializer):
    effective_date = serializers.DateField(required=False, default=date.today)
    reason = serializers.CharField(required=False, allow_blank=True, default='')
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class ReinstateEmployeeActionSerializer(serializers.Serializer):
    effective_date = serializers.DateField(required=False, default=date.today)
    reason = serializers.CharField(required=False, allow_blank=True, default='')
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class ResignEmployeeActionSerializer(serializers.Serializer):
    resignation_date = serializers.DateField(required=False, default=date.today)
    last_working_date = serializers.DateField(required=False, allow_null=True)
    reason = serializers.CharField(required=False, allow_blank=True, default='')
    notice_details = serializers.CharField(required=False, allow_blank=True, default='')
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class TerminateEmployeeActionSerializer(serializers.Serializer):
    effective_date = serializers.DateField(required=False, default=date.today)
    reason = serializers.CharField(required=False, allow_blank=True, default='')
    category = serializers.CharField(required=False, allow_blank=True, default='')
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class ResolveJumpActionSerializer(serializers.Serializer):
    outcome = serializers.ChoiceField(choices=['RETURNED', 'REINSTATED', 'RESIGNED', 'TERMINATED', 'OTHER'])
    jump_record_id = serializers.UUIDField(required=False, allow_null=True)
    effective_date = serializers.DateField(required=False, default=date.today)
    reason = serializers.CharField(required=False, allow_blank=True, default='')
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class RehireEmployeeActionSerializer(serializers.Serializer):
    rehire_date = serializers.DateField(required=False, default=date.today)
    designation = serializers.UUIDField(required=False, allow_null=True)
    department = serializers.UUIDField(required=False, allow_null=True)
    classification = serializers.ChoiceField(choices=['DIRECT', 'INDIRECT'], required=False, allow_null=True)
    base_salary = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    daily_rate = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True)
    single_ot_rate = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True)
    double_ot_rate = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class CreateLifecycleEventActionSerializer(serializers.Serializer):
    event_type = serializers.CharField(max_length=50)
    effective_date = serializers.DateField(required=False, default=date.today)
    old_value = serializers.CharField(required=False, allow_blank=True, default='')
    new_value = serializers.CharField(required=False, allow_blank=True, default='')
    reason = serializers.CharField(required=False, allow_blank=True, default='')
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    metadata = serializers.JSONField(required=False, default=dict)


