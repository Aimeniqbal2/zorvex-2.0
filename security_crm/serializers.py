from rest_framework import serializers
from .models import (
    SecurityProposal, ProposalVersion, SecurityServiceType, 
    ClientLocation, ProposalServiceLine, SecurityAssessment, 
    ContractEquipmentRequirement, SecurityProposalMeeting,
    MeetingParticipant, ProposalFollowUp, SecurityProposalMeetingStatus,
    FollowUpStatus, SecurityAssessmentStatus, AssessmentRiskFinding,
    AssessmentStaffingRecommendation, AssessmentEquipmentRecommendation,
    AssessmentAttachment, RiskLevel, ProposalAdditionalCharge,
    ProposalSignedDocument, ApprovalMethod, SignedDocumentCategory
)
from crm.models import CRMEntity, CRMContact, CRMAddress
from django.utils import timezone


class SecurityServiceTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = SecurityServiceType
        fields = '__all__'
        read_only_fields = ['company', 'created_at', 'updated_at', 'created_by', 'updated_by']


class ClientLocationSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.name', read_only=True)
    address = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    contact_person = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    designation = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    phone = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    whatsapp = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    email = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    
    class Meta:
        model = ClientLocation
        fields = '__all__'
        read_only_fields = ['company', 'created_at', 'updated_at', 'created_by', 'updated_by']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if instance.crm_address:
            addr_parts = [instance.crm_address.line1]
            if instance.crm_address.city:
                addr_parts.append(instance.crm_address.city)
            data['address'] = ", ".join(filter(None, addr_parts))
        else:
            data['address'] = instance.notes or ''

        if instance.primary_contact:
            c = instance.primary_contact
            data['contact_person'] = f"{c.first_name} {c.last_name}".strip()
            data['designation'] = c.job_title or ''
            data['phone'] = c.phone or c.mobile or ''
            data['whatsapp'] = c.whatsapp or ''
            data['email'] = c.email or ''
        else:
            data['contact_person'] = ''
            data['designation'] = ''
            data['phone'] = ''
            data['whatsapp'] = ''
            data['email'] = ''

        return data

    def create(self, validated_data):
        address = validated_data.pop('address', None)
        contact_person = validated_data.pop('contact_person', None)
        designation = validated_data.pop('designation', None)
        phone = validated_data.pop('phone', None)
        whatsapp = validated_data.pop('whatsapp', None)
        email = validated_data.pop('email', None)
        if not validated_data.get('company_id') and not validated_data.get('company'):
            customer = validated_data.get('customer')
            if customer and hasattr(customer, 'company_id'):
                validated_data['company_id'] = customer.company_id

        instance = super().create(validated_data)

        if address and address.strip():
            crm_addr = CRMAddress.objects.create(
                company=instance.company,
                entity=instance.customer,
                address_type='Office',
                line1=address.strip(),
                country='Pakistan'
            )
            instance.crm_address = crm_addr
            instance.save(update_fields=['crm_address'])

        if any([contact_person, designation, phone, whatsapp, email]):
            parts = (contact_person or '').strip().split(' ', 1)
            first_name = parts[0] or (instance.name + ' Contact')
            last_name = parts[1] if len(parts) > 1 else ''
            crm_cont = CRMContact.objects.create(
                company=instance.company,
                entity=instance.customer,
                first_name=first_name,
                last_name=last_name,
                job_title=designation.strip() if designation else '',
                phone=phone.strip() if phone else '',
                whatsapp=whatsapp.strip() if whatsapp else '',
                email=email.strip() if email else ''
            )
            instance.primary_contact = crm_cont
            instance.save(update_fields=['primary_contact'])

        return instance

    def update(self, instance, validated_data):
        address = validated_data.pop('address', None)
        contact_person = validated_data.pop('contact_person', None)
        designation = validated_data.pop('designation', None)
        phone = validated_data.pop('phone', None)
        whatsapp = validated_data.pop('whatsapp', None)
        email = validated_data.pop('email', None)

        instance = super().update(instance, validated_data)

        if address is not None:
            if instance.crm_address:
                instance.crm_address.line1 = address.strip()
                instance.crm_address.save(update_fields=['line1'])
            elif address.strip():
                crm_addr = CRMAddress.objects.create(
                    company=instance.company,
                    entity=instance.customer,
                    address_type='Office',
                    line1=address.strip(),
                    country='Pakistan'
                )
                instance.crm_address = crm_addr
                instance.save(update_fields=['crm_address'])

        if any(v is not None for v in [contact_person, designation, phone, whatsapp, email]):
            if instance.primary_contact:
                cont = instance.primary_contact
                if contact_person is not None:
                    parts = contact_person.strip().split(' ', 1)
                    cont.first_name = parts[0] or cont.first_name
                    cont.last_name = parts[1] if len(parts) > 1 else ''
                if designation is not None:
                    cont.job_title = designation.strip()
                if phone is not None:
                    cont.phone = phone.strip()
                if whatsapp is not None:
                    cont.whatsapp = whatsapp.strip()
                if email is not None:
                    cont.email = email.strip()
                cont.save()
            elif any(v and v.strip() for v in [contact_person, designation, phone, whatsapp, email] if isinstance(v, str)):
                parts = (contact_person or '').strip().split(' ', 1)
                first_name = parts[0] or (instance.name + ' Contact')
                last_name = parts[1] if len(parts) > 1 else ''
                crm_cont = CRMContact.objects.create(
                    company=instance.company,
                    entity=instance.customer,
                    first_name=first_name,
                    last_name=last_name,
                    job_title=(designation or '').strip(),
                    phone=(phone or '').strip(),
                    whatsapp=(whatsapp or '').strip(),
                    email=(email or '').strip()
                )
                instance.primary_contact = crm_cont
                instance.save(update_fields=['primary_contact'])

        return instance


class MeetingParticipantSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    crm_contact_name = serializers.SerializerMethodField()

    class Meta:
        model = MeetingParticipant
        fields = '__all__'
        read_only_fields = ['company', 'created_at', 'updated_at', 'created_by', 'updated_by']

    def get_user_name(self, obj):
        if obj.user:
            return obj.user.get_full_name() or obj.user.username
        return None

    def get_crm_contact_name(self, obj):
        if obj.crm_contact:
            return f"{obj.crm_contact.first_name} {obj.crm_contact.last_name}".strip() or obj.crm_contact.email
        return None


class ProposalFollowUpSerializer(serializers.ModelSerializer):
    assigned_to_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    is_overdue = serializers.SerializerMethodField()

    class Meta:
        model = ProposalFollowUp
        fields = '__all__'
        read_only_fields = ['company', 'created_at', 'updated_at', 'created_by', 'updated_by', 'completed_at']

    def get_assigned_to_name(self, obj):
        if obj.assigned_to:
            return obj.assigned_to.get_full_name() or obj.assigned_to.username
        return None

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return None

    def get_is_overdue(self, obj):
        if obj.status == FollowUpStatus.OPEN and obj.due_at:
            return obj.due_at < timezone.now()
        return False


class SecurityProposalMeetingSerializer(serializers.ModelSerializer):
    participants = MeetingParticipantSerializer(many=True, read_only=True)
    follow_ups = ProposalFollowUpSerializer(many=True, read_only=True)
    proposal_number = serializers.CharField(source='proposal.proposal_number', read_only=True)
    customer_name = serializers.CharField(source='proposal.customer.name', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    participants_count = serializers.SerializerMethodField()

    class Meta:
        model = SecurityProposalMeeting
        fields = '__all__'
        read_only_fields = ['company', 'created_at', 'updated_at', 'created_by', 'updated_by']

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return None

    def get_participants_count(self, obj):
        return obj.participants.count()


class ProposalSignedDocumentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.SerializerMethodField()
    document_type_display = serializers.CharField(source='get_document_type_display', read_only=True)
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = ProposalSignedDocument
        fields = '__all__'
        read_only_fields = ['company', 'created_at', 'updated_at', 'created_by', 'updated_by']

    def get_uploaded_by_name(self, obj):
        if obj.uploaded_by:
            return obj.uploaded_by.get_full_name() or obj.uploaded_by.username
        return None

    def get_file_url(self, obj):
        if obj.file:
            return obj.file.url
        return None


class SecurityProposalSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.name', read_only=True)
    contract_code = serializers.CharField(source='contract.contract_code', read_only=True)
    contract_id = serializers.CharField(source='contract.id', read_only=True)
    contract_status = serializers.CharField(source='contract.status', read_only=True)
    approved_version_number = serializers.SerializerMethodField()
    approved_by_contact_name = serializers.SerializerMethodField()
    signed_documents = ProposalSignedDocumentSerializer(many=True, read_only=True)
    signed_documents_count = serializers.SerializerMethodField()
    meetings_count = serializers.SerializerMethodField()
    upcoming_meetings_count = serializers.SerializerMethodField()
    open_follow_ups_count = serializers.SerializerMethodField()
    next_action = serializers.SerializerMethodField()
    handoff_prepared_by_name = serializers.SerializerMethodField()
    locations_summary = serializers.SerializerMethodField()
    guard_headcount = serializers.SerializerMethodField()
    guard_breakdown = serializers.SerializerMethodField()
    requirement_scope_display = serializers.SerializerMethodField()
    
    class Meta:
        model = SecurityProposal
        fields = '__all__'
        read_only_fields = ['company', 'proposal_number', 'status', 'created_at', 'updated_at', 'created_by', 'updated_by']

    def _get_target_version(self, obj):
        if obj.approved_version_id:
            return obj.approved_version
        return obj.versions.order_by('-version_number').first()

    def get_locations_summary(self, obj):
        ver = self._get_target_version(obj)
        if not ver:
            return ""
        loc_names = list(ver.service_lines.filter(
            is_deleted=False, location__isnull=False, location__is_deleted=False, location__is_active=True
        ).values_list('location__name', flat=True).distinct())
        return ", ".join(loc_names) if loc_names else ""

    def get_guard_headcount(self, obj):
        ver = self._get_target_version(obj)
        if not ver:
            return 0
        from django.db.models import Sum
        return ver.service_lines.filter(
            is_deleted=False
        ).exclude(
            location__is_deleted=True
        ).exclude(
            location__is_active=False
        ).aggregate(total=Sum('quantity'))['total'] or 0

    def get_guard_breakdown(self, obj):
        ver = self._get_target_version(obj)
        if not ver:
            return ""
        lines = ver.service_lines.filter(
            is_deleted=False
        ).exclude(
            location__is_deleted=True
        ).exclude(
            location__is_active=False
        ).select_related('service_type').all()
        parts = [f"{l.quantity} {l.service_type.name}" for l in lines]
        return ", ".join(parts)

    def get_requirement_scope_display(self, obj):
        ver = self._get_target_version(obj)
        if not ver:
            return obj.title
        loc_names = list(ver.service_lines.filter(
            is_deleted=False, location__isnull=False, location__is_deleted=False, location__is_active=True
        ).values_list('location__name', flat=True).distinct())
        loc_str = ", ".join(loc_names) if loc_names else ""
        lines = ver.service_lines.filter(
            is_deleted=False
        ).exclude(
            location__is_deleted=True
        ).exclude(
            location__is_active=False
        ).select_related('service_type').all()
        headcount = sum(l.quantity for l in lines)
        if loc_str and headcount > 0:
            guard_parts = [f"{l.quantity} {l.service_type.name}" for l in lines]
            return f"{loc_str} • {', '.join(guard_parts)} (Total: {headcount})"
        elif loc_str:
            return loc_str
        elif headcount > 0:
            guard_parts = [f"{l.quantity} {l.service_type.name}" for l in lines]
            return f"{', '.join(guard_parts)} (Total: {headcount})"
        return obj.title

    def get_handoff_prepared_by_name(self, obj):
        if obj.handoff_prepared_by:
            return obj.handoff_prepared_by.get_full_name() or obj.handoff_prepared_by.username
        return None

    def get_approved_version_number(self, obj):
        if obj.approved_version:
            return obj.approved_version.version_number
        return None

    def get_approved_by_contact_name(self, obj):
        if obj.approved_by_contact:
            return f"{obj.approved_by_contact.first_name} {obj.approved_by_contact.last_name}".strip() or obj.approved_by_contact.email
        return None

    def get_signed_documents_count(self, obj):
        return obj.signed_documents.count()

    def get_meetings_count(self, obj):
        return obj.meetings.count()

    def get_upcoming_meetings_count(self, obj):
        return obj.meetings.filter(
            status=SecurityProposalMeetingStatus.SCHEDULED,
            scheduled_at__gte=timezone.now()
        ).count()

    def get_open_follow_ups_count(self, obj):
        return obj.follow_ups.filter(status=FollowUpStatus.OPEN).count()

    def get_next_action(self, obj):
        # 1. Check nearest open follow-up
        nearest_follow_up = obj.follow_ups.filter(status=FollowUpStatus.OPEN).order_by('due_at').first()
        if nearest_follow_up:
            assigned = nearest_follow_up.assigned_to.get_full_name() or nearest_follow_up.assigned_to.username if nearest_follow_up.assigned_to else 'Unassigned'
            return {
                'type': 'follow_up',
                'title': nearest_follow_up.title,
                'due_at': nearest_follow_up.due_at,
                'assigned_to': assigned,
                'priority': nearest_follow_up.priority,
                'is_overdue': nearest_follow_up.is_overdue
            }

        # 2. Check nearest upcoming scheduled meeting
        nearest_meeting = obj.meetings.filter(
            status=SecurityProposalMeetingStatus.SCHEDULED,
            scheduled_at__gte=timezone.now()
        ).order_by('scheduled_at').first()
        if nearest_meeting:
            return {
                'type': 'meeting',
                'title': nearest_meeting.subject,
                'due_at': nearest_meeting.scheduled_at,
                'assigned_to': nearest_meeting.location or nearest_meeting.get_meeting_type_display(),
                'priority': 'MEDIUM',
                'is_overdue': False
            }

        return None


class ProposalAdditionalChargeSerializer(serializers.ModelSerializer):
    line_total = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)

    class Meta:
        model = ProposalAdditionalCharge
        fields = '__all__'
        read_only_fields = ['company', 'created_at', 'updated_at', 'created_by', 'updated_by', 'line_total']


class ContractEquipmentRequirementSerializer(serializers.ModelSerializer):
    location_name = serializers.CharField(source='location.name', read_only=True)
    inventory_item_name = serializers.CharField(source='inventory_item.name', read_only=True)
    line_total = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)

    class Meta:
        model = ContractEquipmentRequirement
        fields = '__all__'
        read_only_fields = ['company', 'created_at', 'updated_at', 'created_by', 'updated_by', 'line_total']


class ProposalServiceLineSerializer(serializers.ModelSerializer):
    service_type_name = serializers.CharField(source='service_type.name', read_only=True)
    location_name = serializers.CharField(source='location.name', read_only=True)
    total = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    line_total = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    line_sale = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    line_salary = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    line_difference = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    difference_per_head = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    ot_rate = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    
    class Meta:
        model = ProposalServiceLine
        fields = '__all__'
        read_only_fields = [
            'company', 'created_at', 'updated_at', 'created_by', 'updated_by',
            'total', 'line_total', 'line_sale', 'line_salary', 'line_difference', 'difference_per_head', 'ot_rate'
        ]


class ProposalVersionSerializer(serializers.ModelSerializer):
    monthly_services_total = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    one_time_services_total = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    recurring_equipment_total = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    one_time_equipment_total = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    recurring_charges_total = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    one_time_charges_total = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    total_monthly_recurring = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    total_one_time = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    subtotal = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    discount_amount = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    taxable_amount = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    tax_amount = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    grand_total = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)

    # One Security Costing Formulas & Calculations (Sheet 1)
    total_guard_strength = serializers.IntegerField(read_only=True)
    total_monthly_sale = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    total_monthly_salary = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    total_monthly_expense = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    total_service_charges = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    sales_tax_amount = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    total_invoice_amount = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    withholding_tax_amount = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    total_difference = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    difference_per_head = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    net_profit_loss = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)

    class Meta:
        model = ProposalVersion
        fields = '__all__'
        read_only_fields = [
            'company', 'created_at', 'updated_at', 'created_by', 'updated_by',
            'monthly_services_total', 'one_time_services_total',
            'recurring_equipment_total', 'one_time_equipment_total',
            'recurring_charges_total', 'one_time_charges_total',
            'total_monthly_recurring', 'total_one_time', 'subtotal',
            'discount_amount', 'taxable_amount', 'tax_amount', 'grand_total',
            'total_guard_strength', 'total_monthly_sale', 'total_monthly_salary',
            'total_monthly_expense', 'total_service_charges', 'sales_tax_amount',
            'total_invoice_amount', 'withholding_tax_amount', 'total_difference',
            'difference_per_head', 'net_profit_loss'
        ]


class ProposalVersionDetailSerializer(ProposalVersionSerializer):
    service_lines = serializers.SerializerMethodField()
    equipment_requirements = serializers.SerializerMethodField()
    additional_charges = serializers.SerializerMethodField()

    def get_service_lines(self, obj):
        lines = obj.service_lines.filter(is_deleted=False)
        lines = lines.exclude(location__is_deleted=True).exclude(location__is_active=False)
        return ProposalServiceLineSerializer(lines, many=True).data

    def get_equipment_requirements(self, obj):
        items = obj.equipment_requirements.filter(is_deleted=False).exclude(location__is_deleted=True)
        return ContractEquipmentRequirementSerializer(items, many=True).data

    def get_additional_charges(self, obj):
        items = obj.additional_charges.filter(is_deleted=False)
        return ProposalAdditionalChargeSerializer(items, many=True).data


class AssessmentRiskFindingSerializer(serializers.ModelSerializer):
    class Meta:
        model = AssessmentRiskFinding
        fields = '__all__'
        read_only_fields = ['company', 'assessment', 'created_at', 'updated_at', 'created_by', 'updated_by']


class AssessmentStaffingRecommendationSerializer(serializers.ModelSerializer):
    service_type_name = serializers.CharField(source='service_type.name', read_only=True)
    location_name = serializers.CharField(source='location.name', read_only=True)

    class Meta:
        model = AssessmentStaffingRecommendation
        fields = '__all__'
        read_only_fields = ['company', 'assessment', 'created_at', 'updated_at', 'created_by', 'updated_by']


class AssessmentEquipmentRecommendationSerializer(serializers.ModelSerializer):
    class Meta:
        model = AssessmentEquipmentRecommendation
        fields = '__all__'
        read_only_fields = ['company', 'assessment', 'created_at', 'updated_at', 'created_by', 'updated_by']


class AssessmentAttachmentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.SerializerMethodField()
    category_display = serializers.CharField(source='get_category_display', read_only=True)

    class Meta:
        model = AssessmentAttachment
        fields = '__all__'
        read_only_fields = ['company', 'assessment', 'uploaded_by', 'created_at', 'updated_at', 'created_by', 'updated_by']

    def get_uploaded_by_name(self, obj):
        if obj.uploaded_by:
            return obj.uploaded_by.get_full_name() or obj.uploaded_by.username
        return None


class SecurityAssessmentSerializer(serializers.ModelSerializer):
    client_location_name = serializers.CharField(source='client_location.name', read_only=True)
    client_location_address = serializers.SerializerMethodField()
    assessed_by_name = serializers.SerializerMethodField()
    completed_by_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    risk_count = serializers.SerializerMethodField()
    staffing_count = serializers.SerializerMethodField()
    equipment_count = serializers.SerializerMethodField()
    attachment_count = serializers.SerializerMethodField()
    
    class Meta:
        model = SecurityAssessment
        fields = '__all__'
        read_only_fields = ['company', 'created_at', 'updated_at', 'created_by', 'updated_by', 'completed_at', 'completed_by']

    def get_client_location_address(self, obj):
        if obj.client_location and obj.client_location.crm_address:
            addr = obj.client_location.crm_address
            parts = [addr.street_address, addr.city, addr.state, addr.country]
            return ", ".join([p for p in parts if p])
        return ""

    def get_assessed_by_name(self, obj):
        if obj.assessed_by:
            return obj.assessed_by.get_full_name() or obj.assessed_by.username
        return None

    def get_completed_by_name(self, obj):
        if obj.completed_by:
            return obj.completed_by.get_full_name() or obj.completed_by.username
        return None

    def get_risk_count(self, obj):
        return obj.risk_findings.count()

    def get_staffing_count(self, obj):
        return obj.staffing_recommendations.count()

    def get_equipment_count(self, obj):
        return obj.equipment_recommendations.count()

    def get_attachment_count(self, obj):
        return obj.attachments.count()


class SecurityAssessmentDetailSerializer(SecurityAssessmentSerializer):
    risk_findings = AssessmentRiskFindingSerializer(many=True, read_only=True)
    staffing_recommendations = AssessmentStaffingRecommendationSerializer(many=True, read_only=True)
    equipment_recommendations = AssessmentEquipmentRecommendationSerializer(many=True, read_only=True)
    attachments = AssessmentAttachmentSerializer(many=True, read_only=True)


