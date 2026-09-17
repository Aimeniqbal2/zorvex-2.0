from rest_framework import serializers
from django.core.exceptions import ValidationError as DjangoValidationError
from hrm.models import PayrollRun, Payslip, PayslipLine
from .models import (
    OperationalSite, ServiceContract, ContractRate,
    TemporaryServiceRequest, TemporaryServiceLine,
    QAChecklistTemplate, QAChecklistItem, QAInspection,
    QAInspectionResponse, QAFinding, CorrectiveAction,
    DailyDutyPay, DailyPayRateSource, DailyPayCalculationStatus
)

class BaseModelValidatorMixin:
    def validate(self, attrs):
        instance = self.instance or self.Meta.model()
        # Merge attrs into a temp instance for validation
        for k, v in attrs.items():
            if not isinstance(v, (list, tuple)):  # skip m2m
                setattr(instance, k, v)

        request = self.context.get('request')
        if request and hasattr(request.user, 'company_id') and not instance.company_id:
            instance.company_id = request.user.company_id

        try:
            instance.clean()
        except DjangoValidationError as e:
            msg = e.message_dict if hasattr(e, 'message_dict') else {'non_field_errors': e.messages}
            raise serializers.ValidationError(msg)

        return attrs


class OperationalSiteSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    customer_name = serializers.CharField(source='crm_entity.name', read_only=True)

    class Meta:
        model = OperationalSite
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')


class ServiceContractSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    customer_name = serializers.CharField(source='crm_entity.name', read_only=True)

    class Meta:
        model = ServiceContract
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')

    def validate_sites(self, sites):
        request = self.context.get('request')
        if request and hasattr(request.user, 'company_id'):
            company_id = request.user.company_id
            for site in sites:
                if str(site.company_id) != str(company_id):
                    raise serializers.ValidationError(f"OperationalSite {site.id} belongs to a different company.")
        return sites


class ContractRateSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    designation_name = serializers.CharField(source='designation.name', read_only=True)

    class Meta:
        model = ContractRate
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')


from .models import SiteStaffingRequirement

class SiteStaffingRequirementSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    contract_code = serializers.CharField(source='service_contract.contract_code', read_only=True, default=None)
    site_name = serializers.CharField(source='site.name', read_only=True)
    designation_name = serializers.CharField(source='designation.name', read_only=True)
    shift_name = serializers.CharField(source='shift.name', read_only=True)

    class Meta:
        model = SiteStaffingRequirement
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')


from hrm.models import Employee, WorkforceAttendance
from crm.models import CRMEntity
from .models import (
    Deployment, DeploymentStatus, DeploymentAssignmentType,
    SecurityPost, PostShiftRequirement, DutyRoster, DutyRosterStatus,
    DutyReplacement, DutySwap, DutyAssignment, ExtraDuty, DutyAssignmentStatus, EquipmentIssue
)
from django.db.models import Count, Q


def _get_employee_display_name(employee):
    """Get best display name from Employee model."""
    if not employee:
        return ''
    # Universal Employee has first_name / last_name
    full = f"{employee.first_name} {employee.last_name}".strip()
    if full:
        return full
    # Fallback to linked user
    if employee.user:
        return f"{employee.user.first_name} {employee.user.last_name}".strip() or employee.user.username
    return f"Employee #{str(employee.id)[:8]}"


class SecurityPostSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    site_name = serializers.CharField(source='site.name', read_only=True)
    service_contract_code = serializers.CharField(source='service_contract.contract_code', read_only=True, default=None)
    required_designation_name = serializers.CharField(source='required_designation.name', read_only=True)
    deployed_count = serializers.IntegerField(read_only=True)
    vacant_count = serializers.IntegerField(read_only=True)
    overstaffed_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = SecurityPost
        fields = [
            'id', 'site', 'site_name', 'service_contract', 'service_contract_code',
            'post_name', 'post_code', 'required_designation', 'required_designation_name',
            'required_headcount', 'deployed_count', 'vacant_count', 'overstaffed_count',
            'is_active', 'notes', 'created_at', 'updated_at'
        ]
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')


class DeploymentSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    employee_code = serializers.CharField(source='employee.employee_code', read_only=True, default='')
    employee_classification = serializers.CharField(source='employee.classification', read_only=True, default='DIRECT')
    site_name = serializers.CharField(source='site.name', read_only=True)
    post_name = serializers.CharField(source='post.post_name', read_only=True, default=None)
    designation_name = serializers.CharField(source='designation.name', read_only=True)
    contract_code = serializers.CharField(source='service_contract.contract_code', read_only=True, default=None)
    crm_entity_name = serializers.CharField(source='crm_entity.name', read_only=True, default=None)
    assigned_by_name = serializers.SerializerMethodField()
    relieved_by_name = serializers.SerializerMethodField()
    effective_from = serializers.DateField(source='start_date', required=False)
    effective_to = serializers.DateField(source='end_date', required=False, allow_null=True)
    attendance_synced = serializers.SerializerMethodField()

    class Meta:
        model = Deployment
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')

    def get_employee_name(self, obj):
        return _get_employee_display_name(obj.employee)

    def get_assigned_by_name(self, obj):
        if obj.assigned_by:
            return obj.assigned_by.get_full_name() or obj.assigned_by.username
        return None

    def get_relieved_by_name(self, obj):
        if obj.relieved_by:
            return obj.relieved_by.get_full_name() or obj.relieved_by.username
        return None

    def get_attendance_synced(self, obj):
        """Check if any COMPLETED duties from this deployment have synced attendance."""
        return None  # Expensive per-row — omit from list; use detail view if needed


class DeploymentListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views — avoids N+1."""
    employee_name = serializers.SerializerMethodField()
    employee_code = serializers.CharField(source='employee.employee_code', read_only=True, default='')
    employee_classification = serializers.CharField(source='employee.classification', read_only=True, default='DIRECT')
    site_name = serializers.CharField(source='site.name', read_only=True)
    post_name = serializers.CharField(source='post.post_name', read_only=True, default=None)
    designation_name = serializers.CharField(source='designation.name', read_only=True)
    contract_code = serializers.CharField(source='service_contract.contract_code', read_only=True, default=None)
    crm_entity_name = serializers.CharField(source='crm_entity.name', read_only=True, default=None)
    assigned_by_name = serializers.SerializerMethodField()
    relieved_by_name = serializers.SerializerMethodField()
    effective_from = serializers.DateField(source='start_date', read_only=True)
    effective_to = serializers.DateField(source='end_date', read_only=True)

    class Meta:
        model = Deployment
        fields = [
            'id', 'employee', 'employee_name', 'employee_code', 'employee_classification',
            'site', 'site_name', 'post', 'post_name', 'crm_entity', 'crm_entity_name',
            'service_contract', 'contract_code', 'designation', 'designation_name',
            'assignment_type', 'start_date', 'end_date', 'effective_from', 'effective_to',
            'status', 'assigned_by', 'assigned_by_name', 'relieved_by', 'relieved_by_name',
            'relieved_date', 'relief_reason', 'notes',
            'created_at', 'updated_at'
        ]

    def get_employee_name(self, obj):
        return _get_employee_display_name(obj.employee)

    def get_assigned_by_name(self, obj):
        if obj.assigned_by:
            return obj.assigned_by.get_full_name() or obj.assigned_by.username
        return None

    def get_relieved_by_name(self, obj):
        if obj.relieved_by:
            return obj.relieved_by.get_full_name() or obj.relieved_by.username
        return None


class DeploymentRelieveSerializer(serializers.Serializer):
    relieved_date = serializers.DateField(required=False)
    relief_reason = serializers.CharField(required=False, allow_blank=True, default='')


class DeploymentTransferSerializer(serializers.Serializer):
    relieved_date = serializers.DateField(required=False)
    relief_reason = serializers.CharField(required=False, allow_blank=True, default='')
    new_site = serializers.UUIDField(required=True)
    new_post = serializers.UUIDField(required=False, allow_null=True)
    new_contract = serializers.UUIDField(required=False, allow_null=True)
    new_designation = serializers.UUIDField(required=False, allow_null=True)
    new_start_date = serializers.DateField(required=False)
    new_assignment_type = serializers.ChoiceField(choices=DeploymentAssignmentType.choices, default=DeploymentAssignmentType.PERMANENT)
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class PostShiftRequirementSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    post_name = serializers.CharField(source='post.post_name', read_only=True)
    post_code = serializers.CharField(source='post.post_code', read_only=True)
    site_id = serializers.UUIDField(source='post.site_id', read_only=True)
    site_name = serializers.CharField(source='post.site.name', read_only=True)
    shift_name = serializers.CharField(source='shift.name', read_only=True)
    shift_code = serializers.CharField(source='shift.code', read_only=True)
    start_time = serializers.TimeField(source='shift.start_time', read_only=True)
    end_time = serializers.TimeField(source='shift.end_time', read_only=True)

    class Meta:
        model = PostShiftRequirement
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')


class DutyRosterSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    employee_code = serializers.CharField(source='employee.employee_code', read_only=True, default='')
    designation_name = serializers.CharField(source='employee.designation.name', read_only=True, default='')
    site_name = serializers.CharField(source='site.name', read_only=True)
    post_name = serializers.CharField(source='post.post_name', read_only=True, default='')
    shift_name = serializers.CharField(source='shift.name', read_only=True)
    shift_code = serializers.CharField(source='shift.code', read_only=True)
    shift_start = serializers.TimeField(source='shift.start_time', read_only=True)
    shift_end = serializers.TimeField(source='shift.end_time', read_only=True)
    shift_is_overnight = serializers.BooleanField(source='shift.is_overnight', read_only=True)
    original_employee_name = serializers.SerializerMethodField()

    class Meta:
        model = DutyRoster
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')

    def get_employee_name(self, obj):
        return _get_employee_display_name(obj.employee)

    def get_original_employee_name(self, obj):
        if obj.replacement_for and obj.replacement_for.employee:
            return _get_employee_display_name(obj.replacement_for.employee)
        return None


class DutyReplacementSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    original_employee_name = serializers.SerializerMethodField()
    replacement_employee_name = serializers.SerializerMethodField()
    site_name = serializers.CharField(source='site.name', read_only=True)
    post_name = serializers.CharField(source='post.post_name', read_only=True, default='')
    shift_name = serializers.CharField(source='shift.name', read_only=True)

    class Meta:
        model = DutyReplacement
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')

    def get_original_employee_name(self, obj):
        return _get_employee_display_name(obj.original_employee)

    def get_replacement_employee_name(self, obj):
        return _get_employee_display_name(obj.replacement_employee)


class AssignDutyReplacementActionSerializer(serializers.Serializer):
    original_roster_id = serializers.UUIDField(required=True)
    replacement_employee_id = serializers.UUIDField(required=True)
    reason = serializers.CharField(required=True)
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class ShiftSwapActionSerializer(serializers.Serializer):
    roster_a_id = serializers.UUIDField(required=True)
    roster_b_id = serializers.UUIDField(required=True)
    reason = serializers.CharField(required=False, allow_blank=True, default='')


class BulkGenerateRosterSerializer(serializers.Serializer):
    site_id = serializers.UUIDField(required=True)
    duty_date = serializers.DateField(required=True)
    shift_id = serializers.UUIDField(required=True)
    overwrite_existing = serializers.BooleanField(default=False)


class DutyAssignmentSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    site_name = serializers.CharField(source='site.name', read_only=True)
    deployment_label = serializers.SerializerMethodField()

    class Meta:
        model = DutyAssignment
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')
        extra_kwargs = {
            'employee': {'required': False},
            'site': {'required': False},
        }

    def get_employee_name(self, obj):
        return _get_employee_display_name(obj.employee)

    def get_deployment_label(self, obj):
        if obj.deployment:
            dep = obj.deployment
            emp = _get_employee_display_name(dep.employee)
            site = dep.site.name if dep.site else 'Unknown'
            return f"{emp} @ {site}"
        return None


class ExtraDutySerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    site_name = serializers.CharField(source='site.name', read_only=True, default=None)

    class Meta:
        model = ExtraDuty
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')

    def get_employee_name(self, obj):
        return _get_employee_display_name(obj.employee)


class SecurityAttendanceSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    employee_code = serializers.CharField(source='employee.employee_code', read_only=True)
    site_name = serializers.SerializerMethodField()
    post_name = serializers.CharField(source='post.post_name', read_only=True, default=None)
    shift_name = serializers.CharField(source='shift.name', read_only=True, default=None)
    recorded_by_name = serializers.CharField(source='recorded_by.get_full_name', read_only=True, default='')

    class Meta:
        model = WorkforceAttendance
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')

    def get_employee_name(self, obj):
        return _get_employee_display_name(obj.employee)

    def get_site_name(self, obj):
        if obj.site:
            return obj.site.name
        # Fallback to DutyAssignment
        duty = DutyAssignment.objects.filter(
            company_id=obj.company_id,
            employee_id=obj.employee_id,
            date=obj.date,
            is_deleted=False
        ).select_related('site').first()
        if duty and duty.site:
            return duty.site.name
        return None


class SetAttendanceActionSerializer(serializers.Serializer):
    employee_id = serializers.UUIDField(required=True)
    date = serializers.DateField(required=True)
    status = serializers.ChoiceField(choices=[
        'PRESENT', 'ABSENT', 'PAID_LEAVE', 'UNPAID_LEAVE', 'HOLIDAY', 'WEEKLY_OFF', 'HALF_DAY'
    ], required=True)
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    source = serializers.CharField(required=False, allow_blank=True, default='CENTRAL_OFFICE')
    update_persistent_state = serializers.BooleanField(required=False, default=False)


class BulkSetAttendanceActionSerializer(serializers.Serializer):
    employee_ids = serializers.ListField(child=serializers.UUIDField(), allow_empty=False)
    date = serializers.DateField(required=True)
    status = serializers.ChoiceField(choices=[
        'PRESENT', 'ABSENT', 'PAID_LEAVE', 'UNPAID_LEAVE', 'HOLIDAY', 'WEEKLY_OFF', 'HALF_DAY'
    ], required=True)
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    source = serializers.CharField(required=False, allow_blank=True, default='CENTRAL_OFFICE')
    update_persistent_state = serializers.BooleanField(required=False, default=False)


class ApplyLeaveActionSerializer(serializers.Serializer):
    employee_id = serializers.UUIDField(required=True)
    start_date = serializers.DateField(required=True)
    end_date = serializers.DateField(required=True)
    leave_type = serializers.ChoiceField(choices=['PAID_LEAVE', 'UNPAID_LEAVE'], default='PAID_LEAVE')
    reason = serializers.CharField(required=False, allow_blank=True, default='')
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class RestoreJumpActionSerializer(serializers.Serializer):
    employee_id = serializers.UUIDField(required=True)
    restore_date = serializers.DateField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, default='')



class EquipmentIssueSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    employee_code = serializers.CharField(source='employee.employee_code', read_only=True, default=None)
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_code = serializers.CharField(source='item.code', read_only=True, default=None)
    serial_number = serializers.CharField(source='item_serial.serial_number', read_only=True, default=None)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    site_name = serializers.CharField(source='site.name', read_only=True, default=None)
    client_name = serializers.CharField(source='client.name', read_only=True, default=None)
    contract_code = serializers.CharField(source='contract.contract_code', read_only=True, default=None)
    issued_by_name = serializers.SerializerMethodField()
    returned_by_name = serializers.SerializerMethodField()
    resolved_by_name = serializers.SerializerMethodField()
    status_label = serializers.CharField(source='get_status_display', read_only=True)
    condition_label = serializers.CharField(source='get_condition_display', read_only=True)

    class Meta:
        model = EquipmentIssue
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted', 'issued_by', 'returned_by', 'resolved_by', 'resolved_at')

    def get_employee_name(self, obj):
        return _get_employee_display_name(obj.employee) if obj.employee else ''

    def get_issued_by_name(self, obj):
        if not obj.issued_by:
            return ''
        return f"{obj.issued_by.first_name} {obj.issued_by.last_name}".strip() or obj.issued_by.username

    def get_returned_by_name(self, obj):
        if not obj.returned_by:
            return ''
        return f"{obj.returned_by.first_name} {obj.returned_by.last_name}".strip() or obj.returned_by.username

    def get_resolved_by_name(self, obj):
        if not obj.resolved_by:
            return ''
        return f"{obj.resolved_by.first_name} {obj.resolved_by.last_name}".strip() or obj.resolved_by.username


class SecurityItemProfileSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_code = serializers.CharField(source='item.code', read_only=True)
    category_label = serializers.CharField(source='get_security_category_display', read_only=True)
    is_serialized = serializers.BooleanField(source='item.is_serialized', read_only=True)

    class Meta:
        from .models import SecurityItemProfile
        model = SecurityItemProfile
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')


class SecurityStoreProfileSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    warehouse_code = serializers.CharField(source='warehouse.code', read_only=True)
    store_type_label = serializers.CharField(source='get_store_type_display', read_only=True)
    site_name = serializers.CharField(source='site.name', read_only=True, default=None)
    supervisor_name = serializers.SerializerMethodField()

    class Meta:
        from .models import SecurityStoreProfile
        model = SecurityStoreProfile
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')

    def get_supervisor_name(self, obj):
        return _get_employee_display_name(obj.supervisor) if obj.supervisor else ''


class EquipmentIncidentSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    reported_by_name = serializers.SerializerMethodField()
    resolved_by_name = serializers.SerializerMethodField()
    employee_name = serializers.SerializerMethodField()
    item_name = serializers.CharField(source='item.name', read_only=True)
    serial_number = serializers.CharField(source='item_serial.serial_number', read_only=True, default=None)
    store_name = serializers.CharField(source='warehouse.name', read_only=True, default=None)
    site_name = serializers.CharField(source='site.name', read_only=True, default=None)
    incident_type_label = serializers.CharField(source='get_incident_type_display', read_only=True)
    status_label = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        from .models import EquipmentIncident
        model = EquipmentIncident
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted', 'incident_number', 'reported_by', 'resolved_by', 'resolved_at')

    def get_reported_by_name(self, obj):
        if not obj.reported_by:
            return ''
        return f"{obj.reported_by.first_name} {obj.reported_by.last_name}".strip() or obj.reported_by.username

    def get_resolved_by_name(self, obj):
        if not obj.resolved_by:
            return ''
        return f"{obj.resolved_by.first_name} {obj.resolved_by.last_name}".strip() or obj.resolved_by.username

    def get_employee_name(self, obj):
        return _get_employee_display_name(obj.employee) if obj.employee else ''


class IssueEquipmentActionSerializer(serializers.Serializer):
    store_id = serializers.UUIDField(required=True)
    item_id = serializers.UUIDField(required=True)
    custody_type = serializers.ChoiceField(choices=['EMPLOYEE', 'SITE'], default='EMPLOYEE')
    employee_id = serializers.UUIDField(required=False, allow_null=True)
    site_id = serializers.UUIDField(required=False, allow_null=True)
    serial_number = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    quantity = serializers.DecimalField(max_digits=12, decimal_places=4, default=1)
    expected_return_date = serializers.DateField(required=False, allow_null=True)
    purpose = serializers.CharField(required=False, allow_blank=True, default='')
    condition = serializers.CharField(required=False, default='GOOD')
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    authorization_code = serializers.CharField(required=False, allow_blank=True, default='')


class ReturnEquipmentActionSerializer(serializers.Serializer):
    issue_id = serializers.UUIDField(required=True)
    store_id = serializers.UUIDField(required=True)
    condition = serializers.CharField(required=False, default='GOOD')
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    authorization_code = serializers.CharField(required=False, allow_blank=True, default='')


class StoreTransferActionSerializer(serializers.Serializer):
    from_store_id = serializers.UUIDField(required=True)
    to_store_id = serializers.UUIDField(required=True)
    item_id = serializers.UUIDField(required=True)
    quantity = serializers.DecimalField(max_digits=12, decimal_places=4, default=1)
    serial_numbers = serializers.ListField(child=serializers.CharField(), required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    authorization_code = serializers.CharField(required=False, allow_blank=True, default='')


class ReportIncidentActionSerializer(serializers.Serializer):
    incident_type = serializers.ChoiceField(choices=['LOST', 'DAMAGED', 'UNUSABLE'])
    issue_id = serializers.UUIDField(required=False, allow_null=True)
    store_id = serializers.UUIDField(required=False, allow_null=True)
    item_id = serializers.UUIDField(required=False, allow_null=True)
    serial_number = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    quantity = serializers.DecimalField(max_digits=12, decimal_places=4, default=1)
    incident_date = serializers.DateField(required=False, allow_null=True)
    condition_on_incident = serializers.CharField(required=False, allow_blank=True, default='')
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    damage_severity = serializers.CharField(required=False, allow_blank=True, default='')


class ResolveIncidentActionSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=[
        'UNDER_INVESTIGATION', 'APPROVED_REPAIR', 'APPROVED_WRITE_OFF',
        'RESOLVED_FOUND', 'REJECTED', 'CLOSED'
    ])
    resolution_notes = serializers.CharField(required=True)
    approved_write_off = serializers.BooleanField(required=False, default=False)
    recommended_payroll_deduction = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=0)
    deduction_notes = serializers.CharField(required=False, allow_blank=True, default='')


from .models import IncidentReport, IncidentAttachment, DailyActivityReport, DailyActivityEntry

class IncidentAttachmentSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    uploaded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = IncidentAttachment
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted', 'uploaded_by')

    def get_uploaded_by_name(self, obj):
        if obj.uploaded_by:
            return f"{obj.uploaded_by.first_name} {obj.uploaded_by.last_name}".strip() or obj.uploaded_by.username
        return None


class IncidentReportSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    site_name = serializers.CharField(source='site.name', read_only=True)
    client_name = serializers.CharField(source='client.name', read_only=True, default='')
    contract_code = serializers.CharField(source='contract.contract_code', read_only=True, default='')
    post_name = serializers.CharField(source='post.name', read_only=True, default='')
    shift_name = serializers.CharField(source='shift.name', read_only=True, default='')
    employee_name = serializers.SerializerMethodField()
    assigned_to_name = serializers.SerializerMethodField()
    closed_by_name = serializers.SerializerMethodField()
    equipment_name = serializers.CharField(source='equipment.name', read_only=True, default='')
    serial_number_display = serializers.CharField(source='item_serial.serial_number', read_only=True, default='')
    attachments = IncidentAttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = IncidentReport
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted', 'incident_number', 'reported_at', 'reviewed_by', 'reviewed_at', 'closed_by', 'closed_at')

    def get_employee_name(self, obj):
        return _get_employee_display_name(obj.reported_by)

    def get_assigned_to_name(self, obj):
        if not obj.assigned_to:
            return ''
        return f"{obj.assigned_to.first_name} {obj.assigned_to.last_name}".strip() or obj.assigned_to.username

    def get_closed_by_name(self, obj):
        if not obj.closed_by:
            return ''
        return f"{obj.closed_by.first_name} {obj.closed_by.last_name}".strip() or obj.closed_by.username


class DailyActivityEntrySerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    recorded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = DailyActivityEntry
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')

    def get_recorded_by_name(self, obj):
        return _get_employee_display_name(obj.recorded_by)


class DailyActivityReportSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    site_name = serializers.CharField(source='site.name', read_only=True)
    prepared_by_name = serializers.SerializerMethodField()
    entries = DailyActivityEntrySerializer(many=True, read_only=True)

    class Meta:
        model = DailyActivityReport
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted', 'reviewed_by', 'reviewed_at')

    def get_prepared_by_name(self, obj):
        return _get_employee_display_name(obj.prepared_by)

class TemporaryServiceLineSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    designation_name = serializers.CharField(source='designation.name', read_only=True)
    class Meta:
        model = TemporaryServiceLine
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')

class TemporaryServiceRequestSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    crm_entity_name = serializers.CharField(source='crm_entity.name', read_only=True)
    operational_site_name = serializers.CharField(source='operational_site.name', read_only=True)
    requested_by_name = serializers.CharField(source='requested_by.get_full_name', read_only=True)
    approved_by_name = serializers.CharField(source='approved_by.get_full_name', read_only=True)
    lines = TemporaryServiceLineSerializer(many=True, read_only=True)

    class Meta:
        model = TemporaryServiceRequest
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')

class QAChecklistItemSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    class Meta:
        model = QAChecklistItem
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')

class QAChecklistTemplateSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    items = QAChecklistItemSerializer(many=True, read_only=True)
    class Meta:
        model = QAChecklistTemplate
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')

class QAInspectionResponseSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    checklist_item_text = serializers.CharField(source='checklist_item.text', read_only=True)
    class Meta:
        model = QAInspectionResponse
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')

class QAFindingSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    checklist_item_text = serializers.CharField(source='checklist_item.text', read_only=True)
    class Meta:
        model = QAFinding
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')

class QAInspectionSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    template_name = serializers.CharField(source='template.name', read_only=True)
    service_contract_number = serializers.CharField(source='service_contract.contract_number', read_only=True)
    operational_site_name = serializers.CharField(source='operational_site.name', read_only=True)
    inspector_name = serializers.CharField(source='inspector.get_full_name', read_only=True)
    responses = QAInspectionResponseSerializer(many=True, read_only=True)
    findings = QAFindingSerializer(many=True, read_only=True)

    class Meta:
        model = QAInspection
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')

class CorrectiveActionSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    finding_description = serializers.CharField(source='finding.description', read_only=True)
    assigned_to_name = serializers.CharField(source='assigned_to.get_full_name', read_only=True)
    class Meta:
        model = CorrectiveAction
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')


# ---------------------------------------------------------------------------
# Phase S-5E: Daily Duty Pay Serializers
# ---------------------------------------------------------------------------

class DailyDutyPaySerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    employee_code = serializers.CharField(source='employee.employee_code', read_only=True)
    classification = serializers.CharField(source='employee.classification', read_only=True)
    designation_name = serializers.CharField(source='employee.designation.name', read_only=True, default='')
    client_name = serializers.CharField(source='client.name', read_only=True, default='')
    contract_code = serializers.CharField(source='contract.contract_code', read_only=True, default='')
    site_name = serializers.CharField(source='site.name', read_only=True, default='')
    post_name = serializers.CharField(source='post.post_name', read_only=True, default='')
    shift_name = serializers.CharField(source='roster.shift.name', read_only=True, default='')
    replaced_employee_name = serializers.SerializerMethodField()
    rate_source_label = serializers.CharField(source='get_rate_source_display', read_only=True)
    calculation_status_label = serializers.CharField(source='get_calculation_status_display', read_only=True)

    class Meta:
        model = DailyDutyPay
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted', 'calculated_at')

    def get_employee_name(self, obj):
        if obj.employee:
            return f"{obj.employee.first_name} {obj.employee.last_name}".strip()
        return ''

    def get_replaced_employee_name(self, obj):
        if obj.replaced_employee:
            return f"{obj.replaced_employee.first_name} {obj.replaced_employee.last_name}".strip()
        return None


class GenerateDailyPayActionSerializer(serializers.Serializer):
    employee_id = serializers.UUIDField(required=True)
    duty_date = serializers.DateField(required=True)
    force_recalculate = serializers.BooleanField(required=False, default=False)


class BulkGenerateDailyPayActionSerializer(serializers.Serializer):
    start_date = serializers.DateField(required=True)
    end_date = serializers.DateField(required=True)
    employee_ids = serializers.ListField(child=serializers.UUIDField(), required=False, default=None)


class RecalculateDailyPayActionSerializer(serializers.Serializer):
    pay_record_id = serializers.UUIDField(required=True)


# ---------------------------------------------------------------------------
# Phase S-5F: Payroll Rules, Statutory Deductions & Compensation Serializers
# ---------------------------------------------------------------------------
from .models import (
    PayrollAddition, PayrollDeduction,
    EmployeePayrollCalculation, PayrollCalculationLine
)

class PayrollAdditionSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    employee_code = serializers.CharField(source='employee.employee_code', read_only=True)
    addition_type_label = serializers.CharField(source='get_addition_type_display', read_only=True)
    frequency_label = serializers.CharField(source='get_frequency_display', read_only=True)

    class Meta:
        model = PayrollAddition
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')

    def get_employee_name(self, obj):
        return f"{obj.employee.first_name} {obj.employee.last_name}".strip() if obj.employee else ''


class PayrollDeductionSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    employee_code = serializers.CharField(source='employee.employee_code', read_only=True)
    deduction_type_label = serializers.CharField(source='get_deduction_type_display', read_only=True)
    frequency_label = serializers.CharField(source='get_frequency_display', read_only=True)
    advance_number = serializers.CharField(source='advance.advance_number', read_only=True, default='')

    class Meta:
        model = PayrollDeduction
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')

    def get_employee_name(self, obj):
        return f"{obj.employee.first_name} {obj.employee.last_name}".strip() if obj.employee else ''


class PayrollCalculationLineSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    class Meta:
        model = PayrollCalculationLine
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')


class EmployeePayrollCalculationSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    employee_code = serializers.CharField(source='employee.employee_code', read_only=True)
    classification = serializers.CharField(source='employee.classification', read_only=True)
    designation_name = serializers.CharField(source='employee.designation.name', read_only=True, default='')
    status_label = serializers.CharField(source='get_status_display', read_only=True)
    lines = PayrollCalculationLineSerializer(many=True, read_only=True)

    class Meta:
        model = EmployeePayrollCalculation
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted', 'calculated_at')

    def get_employee_name(self, obj):
        return f"{obj.employee.first_name} {obj.employee.last_name}".strip() if obj.employee else ''


class CalculateEmployeePayrollActionSerializer(serializers.Serializer):
    employee_id = serializers.UUIDField(required=True)
    period_start = serializers.DateField(required=True)
    period_end = serializers.DateField(required=True)
    force_recalculate = serializers.BooleanField(required=False, default=True)


class CalculatePeriodPayrollActionSerializer(serializers.Serializer):
    period_start = serializers.DateField(required=True)
    period_end = serializers.DateField(required=True)
    employee_ids = serializers.ListField(child=serializers.UUIDField(), required=False, default=None)


class MarkCalculationReadyActionSerializer(serializers.Serializer):
    calculation_id = serializers.UUIDField(required=True)


class CreatePayrollRunFromReadySerializer(serializers.Serializer):
    period_start = serializers.DateField(required=True)
    period_end = serializers.DateField(required=True)
    calculation_ids = serializers.ListField(child=serializers.UUIDField(), required=False, default=None)
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class CancelPayrollRunActionSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, default='')


class OperationalPayslipLineSerializer(serializers.ModelSerializer):
    component_name = serializers.CharField(source='salary_component.name', read_only=True, default='')
    component_code = serializers.CharField(source='salary_component.code', read_only=True, default='')

    class Meta:
        model = PayslipLine
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')


class OperationalPayslipSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    employee_code = serializers.CharField(source='employee.employee_code', read_only=True)
    designation_name = serializers.CharField(source='employee.designation.name', read_only=True, default='')
    department_name = serializers.CharField(source='employee.department.name', read_only=True, default='')
    cnic = serializers.CharField(source='employee.cnic', read_only=True, default='')
    run_number = serializers.CharField(source='payroll_run.run_number', read_only=True)
    lines = OperationalPayslipLineSerializer(many=True, read_only=True)

    class Meta:
        model = Payslip
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted', 'payslip_number')

    def get_employee_name(self, obj):
        return f"{obj.employee.first_name} {obj.employee.last_name}".strip() if obj.employee else ''


class OperationalPayrollRunSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    prepared_by_name = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    finalized_by_name = serializers.SerializerMethodField()
    period_label = serializers.SerializerMethodField()
    finance_integration = serializers.SerializerMethodField()
    status_label = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = PayrollRun
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted', 'run_number')

    def get_prepared_by_name(self, obj):
        if not obj.prepared_by:
            return ''
        return f"{obj.prepared_by.first_name} {obj.prepared_by.last_name}".strip() or obj.prepared_by.username

    def get_reviewed_by_name(self, obj):
        if not obj.reviewed_by:
            return ''
        return f"{obj.reviewed_by.first_name} {obj.reviewed_by.last_name}".strip() or obj.reviewed_by.username

    def get_approved_by_name(self, obj):
        if not obj.approved_by:
            return ''
        return f"{obj.approved_by.first_name} {obj.approved_by.last_name}".strip() or obj.approved_by.username

    def get_finalized_by_name(self, obj):
        if not obj.finalized_by:
            return ''
        return f"{obj.finalized_by.first_name} {obj.finalized_by.last_name}".strip() or obj.finalized_by.username

    def get_period_label(self, obj):
        if obj.payroll_period:
            return obj.payroll_period.name
        if obj.period_start and obj.period_end:
            return f"{obj.period_start} to {obj.period_end}"
        return ''

    def get_finance_integration(self, obj):
        fin = obj.finance_integrations.first()
        if not fin:
            return None
        return {
            'id': str(fin.id),
            'status': fin.status,
            'status_label': fin.get_status_display(),
            'gross_payroll': str(fin.gross_payroll),
            'net_payroll_payable': str(fin.net_payroll_payable),
            'remaining_liability': str(fin.remaining_liability),
            'total_paid': str(fin.total_paid),
            'blocking_reason': fin.blocking_reason
        }


# ==============================================================================
# PHASE S-7: ADVANCED SECURITY OPERATIONS SERIALIZERS
# ==============================================================================

from .models import (
    DailyOccurrenceLog, SiteCheckpoint, PatrolPlan, PatrolRun,
    GuardTour, GuardTourEvent, EmergencyEvent, SupervisorInspection,
    OperationsEscalation, InspectionPolicy, InspectionCriterionPolicy,
    InspectionCriterionCode
)


class DailyOccurrenceLogSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    site_name = serializers.CharField(source='site.name', read_only=True)
    post_name = serializers.CharField(source='post.name', read_only=True, default='')
    shift_name = serializers.CharField(source='shift.name', read_only=True, default='')
    logged_by_name = serializers.SerializerMethodField()
    employee_name = serializers.SerializerMethodField()
    entry_type_label = serializers.CharField(source='get_entry_type_display', read_only=True)

    class Meta:
        model = DailyOccurrenceLog
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')

    def get_logged_by_name(self, obj):
        if not obj.logged_by:
            return ''
        return f"{obj.logged_by.first_name} {obj.logged_by.last_name}".strip() or obj.logged_by.username

    def get_employee_name(self, obj):
        return _get_employee_display_name(obj.employee) if obj.employee else ''


class SiteCheckpointSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    site_name = serializers.CharField(source='site.name', read_only=True)

    class Meta:
        model = SiteCheckpoint
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')


class PatrolPlanSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    site_name = serializers.CharField(source='site.name', read_only=True)
    shift_name = serializers.CharField(source='shift.name', read_only=True, default='')
    assigned_employee_name = serializers.SerializerMethodField()

    class Meta:
        model = PatrolPlan
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')

    def get_assigned_employee_name(self, obj):
        return _get_employee_display_name(obj.assigned_employee) if obj.assigned_employee else ''


class PatrolRunSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    site_name = serializers.CharField(source='site.name', read_only=True)
    shift_name = serializers.CharField(source='shift.name', read_only=True, default='')
    plan_name = serializers.CharField(source='plan.name', read_only=True, default='')
    assigned_employee_name = serializers.SerializerMethodField()
    status_label = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = PatrolRun
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted', 'run_code')

    def get_assigned_employee_name(self, obj):
        return _get_employee_display_name(obj.assigned_employee) if obj.assigned_employee else ''


class GuardTourEventSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    checkpoint_name = serializers.CharField(source='checkpoint.name', read_only=True)
    checkpoint_code = serializers.CharField(source='checkpoint.code', read_only=True)
    sequence_order = serializers.IntegerField(source='checkpoint.sequence_order', read_only=True)
    verified_by_name = serializers.SerializerMethodField()

    class Meta:
        model = GuardTourEvent
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')

    def get_verified_by_name(self, obj):
        if not obj.verified_by:
            return ''
        return f"{obj.verified_by.first_name} {obj.verified_by.last_name}".strip() or obj.verified_by.username


class GuardTourSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    site_name = serializers.CharField(source='site.name', read_only=True)
    assigned_employee_name = serializers.SerializerMethodField()
    shift_name = serializers.CharField(source='shift.name', read_only=True, default='')
    events = GuardTourEventSerializer(many=True, read_only=True)

    class Meta:
        model = GuardTour
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')

    def get_assigned_employee_name(self, obj):
        return _get_employee_display_name(obj.assigned_employee) if obj.assigned_employee else ''


class EmergencyEventSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    site_name = serializers.CharField(source='site.name', read_only=True)
    post_name = serializers.CharField(source='post.name', read_only=True, default='')
    employee_name = serializers.SerializerMethodField()
    reported_by_name = serializers.SerializerMethodField()
    acknowledged_by_name = serializers.SerializerMethodField()
    assigned_responder_name = serializers.SerializerMethodField()
    event_type_label = serializers.CharField(source='get_event_type_display', read_only=True)

    class Meta:
        model = EmergencyEvent
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')

    def get_employee_name(self, obj):
        return _get_employee_display_name(obj.employee) if obj.employee else ''

    def get_reported_by_name(self, obj):
        if not obj.reported_by:
            return ''
        return f"{obj.reported_by.first_name} {obj.reported_by.last_name}".strip() or obj.reported_by.username

    def get_acknowledged_by_name(self, obj):
        if not obj.acknowledged_by:
            return ''
        return f"{obj.acknowledged_by.first_name} {obj.acknowledged_by.last_name}".strip() or obj.acknowledged_by.username

    def get_assigned_responder_name(self, obj):
        if not obj.assigned_responder:
            return ''
        return f"{obj.assigned_responder.first_name} {obj.assigned_responder.last_name}".strip() or obj.assigned_responder.username


class SupervisorInspectionSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    site_name = serializers.CharField(source='site.name', read_only=True)
    post_name = serializers.CharField(source='post.name', read_only=True, default='')
    shift_name = serializers.CharField(source='shift.name', read_only=True, default='')
    inspector_name = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()
    inspected_employee_name = serializers.SerializerMethodField()
    equipment_name = serializers.CharField(source='equipment.name', read_only=True, default='')
    serial_number_display = serializers.CharField(source='item_serial.serial_number', read_only=True, default='')

    class Meta:
        model = SupervisorInspection
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')

    def get_inspector_name(self, obj):
        if not obj.inspector:
            return ''
        return f"{obj.inspector.first_name} {obj.inspector.last_name}".strip() or obj.inspector.username

    def get_reviewed_by_name(self, obj):
        if not obj.reviewed_by:
            return ''
        return f"{obj.reviewed_by.first_name} {obj.reviewed_by.last_name}".strip() or obj.reviewed_by.username

    def get_inspected_employee_name(self, obj):
        return _get_employee_display_name(obj.inspected_employee) if obj.inspected_employee else ''


class OperationsEscalationSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    site_name = serializers.CharField(source='site.name', read_only=True)
    assigned_to_name = serializers.SerializerMethodField()
    source_type_label = serializers.CharField(source='get_source_type_display', read_only=True)

    class Meta:
        model = OperationsEscalation
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')

    def get_assigned_to_name(self, obj):
        if not obj.assigned_to:
            return ''
        return f"{obj.assigned_to.first_name} {obj.assigned_to.last_name}".strip() or obj.assigned_to.username


# Action Serializers
class VerifyCheckpointActionSerializer(serializers.Serializer):
    checkpoint_id = serializers.UUIDField(required=True)
    verification_source = serializers.ChoiceField(choices=['MANUAL', 'QR_CODE', 'NFC', 'GPS'], default='MANUAL')
    latitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    accuracy_meters = serializers.DecimalField(max_digits=6, decimal_places=2, required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class TriggerEmergencyActionSerializer(serializers.Serializer):
    site_id = serializers.UUIDField(required=True)
    post_id = serializers.UUIDField(required=False, allow_null=True)
    employee_id = serializers.UUIDField(required=False, allow_null=True)
    event_type = serializers.CharField(default='PANIC_BUTTON')
    severity = serializers.CharField(default='CRITICAL')
    description = serializers.CharField(required=False, allow_blank=True, default='')
    latitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    accuracy_meters = serializers.DecimalField(max_digits=6, decimal_places=2, required=False, allow_null=True)


class AcknowledgeEmergencyActionSerializer(serializers.Serializer):
    responder_id = serializers.IntegerField(required=False, allow_null=True)
    response_notes = serializers.CharField(required=False, allow_blank=True, default='')


class ResolveEmergencyActionSerializer(serializers.Serializer):
    resolution_summary = serializers.CharField(required=True)
    is_false_alarm = serializers.BooleanField(required=False, default=False)


class TransitionIncidentActionSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=['OPEN', 'INVESTIGATING', 'ACTION_REQUIRED', 'UNDER_REVIEW', 'RESOLVED', 'CLOSED'])
    resolution = serializers.CharField(required=False, allow_blank=True, default='')
    immediate_action = serializers.CharField(required=False, allow_blank=True, default='')
    assigned_to_id = serializers.IntegerField(required=False, allow_null=True)


class ResolveEscalationActionSerializer(serializers.Serializer):
    resolution_notes = serializers.CharField(required=True)


class InspectionCriterionPolicySerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    criterion_code_label = serializers.CharField(source='get_criterion_code_display', read_only=True)

    class Meta:
        model = InspectionCriterionPolicy
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')


class InspectionPolicySerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    criteria = InspectionCriterionPolicySerializer(many=True, read_only=True)

    class Meta:
        model = InspectionPolicy
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')




