from rest_framework import serializers
from django.core.exceptions import ValidationError as DjangoValidationError
from .models import (
    OperationalSite, ServiceContract, ContractRate,
    TemporaryServiceRequest, TemporaryServiceLine,
    QAChecklistTemplate, QAChecklistItem, QAInspection,
    QAInspectionResponse, QAFinding, CorrectiveAction
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
from .models import Deployment, DutyAssignment, ExtraDuty, DutyAssignmentStatus, EquipmentIssue
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


class DeploymentSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    site_name = serializers.CharField(source='site.name', read_only=True)
    designation_name = serializers.CharField(source='designation.name', read_only=True)
    contract_code = serializers.CharField(source='service_contract.contract_code', read_only=True, default=None)
    # Computed staffing fields — derived, not stored
    attendance_synced = serializers.SerializerMethodField()

    class Meta:
        model = Deployment
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')

    def get_employee_name(self, obj):
        return _get_employee_display_name(obj.employee)

    def get_attendance_synced(self, obj):
        """Check if any COMPLETED duties from this deployment have synced attendance."""
        return None  # Expensive per-row — omit from list; use detail view if needed


class DeploymentListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views — avoids N+1."""
    employee_name = serializers.SerializerMethodField()
    site_name = serializers.CharField(source='site.name', read_only=True)
    designation_name = serializers.CharField(source='designation.name', read_only=True)
    contract_code = serializers.CharField(source='service_contract.contract_code', read_only=True, default=None)

    class Meta:
        model = Deployment
        fields = [
            'id', 'employee', 'employee_name', 'site', 'site_name',
            'service_contract', 'contract_code', 'designation', 'designation_name',
            'start_date', 'end_date', 'status', 'notes',
            'created_at', 'updated_at'
        ]

    def get_employee_name(self, obj):
        return _get_employee_display_name(obj.employee)


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
    site_name = serializers.SerializerMethodField()

    class Meta:
        model = WorkforceAttendance
        fields = (
            'id', 'employee', 'employee_name', 'date', 'check_in', 'check_out',
            'status', 'source', 'notes', 'site_name'
        )
        read_only_fields = fields

    def get_employee_name(self, obj):
        return _get_employee_display_name(obj.employee)

    def get_site_name(self, obj):
        # Operational context: guess site from same-day DutyAssignment
        duty = DutyAssignment.objects.filter(
            company_id=obj.company_id,
            employee_id=obj.employee_id,
            date=obj.date,
            is_deleted=False
        ).select_related('site').first()
        if duty and duty.site:
            return duty.site.name
        
        # Fallback to ExtraDuty
        extra = ExtraDuty.objects.filter(
            company_id=obj.company_id,
            employee_id=obj.employee_id,
            date=obj.date,
            is_deleted=False
        ).select_related('site').first()
        if extra and extra.site:
            return extra.site.name
            
        return 'Unknown Site'


class EquipmentIssueSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    item_name = serializers.CharField(source='item.name', read_only=True)
    serial_number = serializers.CharField(source='item_serial.serial_number', read_only=True, default=None)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    site_name = serializers.CharField(source='site.name', read_only=True, default=None)

    class Meta:
        model = EquipmentIssue
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted', 'issued_by', 'returned_by')

    def get_employee_name(self, obj):
        return _get_employee_display_name(obj.employee)


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
    employee_name = serializers.SerializerMethodField()
    attachments = IncidentAttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = IncidentReport
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted', 'incident_number', 'reported_at', 'reviewed_by', 'reviewed_at')

    def get_employee_name(self, obj):
        return _get_employee_display_name(obj.reported_by)


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
