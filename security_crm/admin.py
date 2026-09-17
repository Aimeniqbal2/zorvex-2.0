from django.contrib import admin
from django.urls import path
from django.http import JsonResponse
from crm.models import CRMEntity
from .models import (
    SecurityProposal,
    ProposalVersion,
    SecurityServiceType,
    ClientLocation,
    ProposalServiceLine,
    SecurityAssessment,
    ContractEquipmentRequirement,
    SecurityProposalMeeting,
    MeetingParticipant,
    ProposalFollowUp,
    AssessmentRiskFinding,
    AssessmentStaffingRecommendation,
    AssessmentEquipmentRecommendation,
    AssessmentAttachment,
    ProposalAdditionalCharge,
    ProposalSignedDocument
)


class AssessmentRiskFindingInline(admin.TabularInline):
    model = AssessmentRiskFinding
    extra = 0
    fields = ('title', 'category', 'risk_level', 'location_area', 'status')


class AssessmentStaffingRecommendationInline(admin.TabularInline):
    model = AssessmentStaffingRecommendation
    extra = 0
    fields = ('service_type', 'location', 'quantity', 'post_area', 'shift_coverage_notes')


class AssessmentEquipmentRecommendationInline(admin.TabularInline):
    model = AssessmentEquipmentRecommendation
    extra = 0
    fields = ('equipment_name', 'quantity', 'location_area', 'purpose')


class AssessmentAttachmentInline(admin.TabularInline):
    model = AssessmentAttachment
    extra = 0
    fields = ('title', 'category', 'file', 'file_url')


@admin.register(SecurityAssessment)
class SecurityAssessmentAdmin(admin.ModelAdmin):
    list_display = ('client_location', 'proposal', 'assessment_date', 'assessed_by', 'status', 'company')
    list_filter = ('status', 'assessment_date', 'company')
    search_fields = ('client_location__name', 'proposal__proposal_number', 'site_overview', 'findings')
    readonly_fields = ('created_at', 'updated_at', 'completed_at')
    inlines = [
        AssessmentRiskFindingInline,
        AssessmentStaffingRecommendationInline,
        AssessmentEquipmentRecommendationInline,
        AssessmentAttachmentInline
    ]


@admin.register(AssessmentRiskFinding)
class AssessmentRiskFindingAdmin(admin.ModelAdmin):
    list_display = ('title', 'assessment', 'risk_level', 'category', 'status', 'company')
    list_filter = ('risk_level', 'status', 'category', 'company')
    search_fields = ('title', 'description', 'location_area', 'recommendation')


@admin.register(AssessmentStaffingRecommendation)
class AssessmentStaffingRecommendationAdmin(admin.ModelAdmin):
    list_display = ('service_type', 'assessment', 'quantity', 'post_area', 'company')
    list_filter = ('service_type', 'company')
    search_fields = ('post_area', 'shift_coverage_notes', 'remarks')


@admin.register(AssessmentEquipmentRecommendation)
class AssessmentEquipmentRecommendationAdmin(admin.ModelAdmin):
    list_display = ('equipment_name', 'assessment', 'quantity', 'location_area', 'company')
    list_filter = ('company',)
    search_fields = ('equipment_name', 'location_area', 'purpose', 'notes')


@admin.register(AssessmentAttachment)
class AssessmentAttachmentAdmin(admin.ModelAdmin):
    list_display = ('title', 'assessment', 'category', 'uploaded_by', 'created_at', 'company')
    list_filter = ('category', 'company')
    search_fields = ('title', 'notes')


@admin.register(ContractEquipmentRequirement)
class ContractEquipmentRequirementAdmin(admin.ModelAdmin):
    list_display = ('proposal_version', 'location', 'description', 'quantity')
    list_filter = ('company',)

class ProposalSignedDocumentInline(admin.TabularInline):
    model = ProposalSignedDocument
    extra = 0
    fields = ('title', 'document_type', 'file', 'uploaded_by', 'created_at')
    readonly_fields = ('created_at',)


@admin.register(SecurityProposal)
class SecurityProposalAdmin(admin.ModelAdmin):
    list_display = ('proposal_number', 'title', 'company', 'customer', 'status', 'approved_version', 'is_handoff_ready', 'signed_by_client', 'contract', 'created_at')
    list_filter = ('status', 'is_handoff_ready', 'approval_method', 'company')
    search_fields = ('proposal_number', 'title', 'customer__name', 'contract_reference')
    readonly_fields = ('proposal_number', 'created_at', 'updated_at')
    inlines = [ProposalSignedDocumentInline]

    class Media:
        js = ('admin/js/filter_customers.js',)

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path('api/get-customers/', self.admin_site.admin_view(self.get_customers_api), name='security_crm_get_customers'),
        ]
        return custom_urls + urls

    def get_customers_api(self, request):
        company_id = request.GET.get('company_id')
        if not company_id:
            return JsonResponse({'customers': []})
        customers = CRMEntity.objects.filter(company_id=company_id, entity_type='CUSTOMER').values('id', 'name')
        return JsonResponse({'customers': list(customers)})

class ProposalServiceLineInline(admin.TabularInline):
    model = ProposalServiceLine
    extra = 0
    fields = ('location', 'service_type', 'quantity', 'client_rate', 'single_ot_rate', 'double_ot_rate', 'billing_unit')


class ContractEquipmentRequirementInline(admin.TabularInline):
    model = ContractEquipmentRequirement
    extra = 0
    fields = ('location', 'item_name', 'quantity', 'unit_rate', 'charge_type')


class ProposalAdditionalChargeInline(admin.TabularInline):
    model = ProposalAdditionalCharge
    extra = 0
    fields = ('charge_name', 'charge_type', 'amount', 'quantity')


@admin.register(ProposalVersion)
class ProposalVersionAdmin(admin.ModelAdmin):
    list_display = ('proposal', 'version_number', 'version_type', 'status', 'is_frozen', 'billing_cycle', 'payment_terms')
    list_filter = ('is_frozen', 'status', 'billing_cycle', 'payment_terms', 'company')
    inlines = [ProposalServiceLineInline, ContractEquipmentRequirementInline, ProposalAdditionalChargeInline]


@admin.register(SecurityServiceType)
class SecurityServiceTypeAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'company', 'is_active')
    list_filter = ('is_active', 'company')
    search_fields = ('code', 'name')


@admin.register(ClientLocation)
class ClientLocationAdmin(admin.ModelAdmin):
    list_display = ('name', 'customer', 'company', 'is_active')
    list_filter = ('is_active', 'company')
    search_fields = ('name', 'customer__name')

    class Media:
        js = ('admin/js/filter_customers.js',)


@admin.register(ProposalServiceLine)
class ProposalServiceLineAdmin(admin.ModelAdmin):
    list_display = ('proposal_version', 'service_type', 'location', 'quantity', 'client_rate', 'billing_unit')
    list_filter = ('service_type', 'billing_unit', 'company')


@admin.register(ProposalAdditionalCharge)
class ProposalAdditionalChargeAdmin(admin.ModelAdmin):
    list_display = ('charge_name', 'proposal_version', 'charge_type', 'amount', 'quantity', 'company')
    list_filter = ('charge_type', 'company')
    search_fields = ('charge_name', 'proposal_version__proposal__proposal_number')


class MeetingParticipantInline(admin.TabularInline):
    from .models import MeetingParticipant
    model = MeetingParticipant
    extra = 1
    fields = ('participant_type', 'user', 'crm_contact', 'external_name', 'external_email', 'role', 'attended')


@admin.register(SecurityProposalMeeting)
class SecurityProposalMeetingAdmin(admin.ModelAdmin):
    list_display = ('subject', 'proposal', 'meeting_type', 'scheduled_at', 'status', 'outcome', 'company')
    list_filter = ('status', 'meeting_type', 'outcome', 'company')
    search_fields = ('subject', 'proposal__proposal_number', 'location', 'agenda')
    readonly_fields = ('created_at', 'updated_at', 'completed_at')
    inlines = [MeetingParticipantInline]


@admin.register(MeetingParticipant)
class MeetingParticipantAdmin(admin.ModelAdmin):
    list_display = ('meeting', 'participant_type', 'user', 'crm_contact', 'external_name', 'role', 'attended', 'company')
    list_filter = ('participant_type', 'attended', 'company')
    search_fields = ('external_name', 'external_email', 'role', 'meeting__subject')


@admin.register(ProposalFollowUp)
class ProposalFollowUpAdmin(admin.ModelAdmin):
    list_display = ('title', 'proposal', 'priority', 'status', 'due_at', 'assigned_to', 'completed_at', 'company')
    list_filter = ('status', 'priority', 'company')
    search_fields = ('title', 'description', 'proposal__proposal_number')
    readonly_fields = ('created_at', 'updated_at', 'completed_at')


@admin.register(ProposalSignedDocument)
class ProposalSignedDocumentAdmin(admin.ModelAdmin):
    list_display = ('title', 'proposal', 'document_type', 'uploaded_by', 'created_at', 'company')
    list_filter = ('document_type', 'company')
    search_fields = ('title', 'notes', 'proposal__proposal_number')
    readonly_fields = ('created_at', 'updated_at')


