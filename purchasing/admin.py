from django.contrib import admin
from .models import (
    ProcurementTag, ProcurementDocument, ProcurementLine,
    ApprovalWorkflow, ApprovalStep, ApprovalHistory,
    ProcurementNote, ProcurementAttachment, ProcurementAuditTrail,
    VendorCategory, Vendor, VendorItem, VendorDocument
)



@admin.register(ProcurementTag)
class ProcurementTagAdmin(admin.ModelAdmin):
    list_display = ('name', 'color', 'company')
    list_select_related = ('company',)
    search_fields = ('name', 'company__name')
    list_filter = ('company',)
    readonly_fields = ('created_at', 'updated_at')


class ProcurementLineInline(admin.TabularInline):
    model = ProcurementLine
    extra = 0
    readonly_fields = ('created_at', 'updated_at')


@admin.register(ProcurementDocument)
class ProcurementDocumentAdmin(admin.ModelAdmin):
    list_display = ('number', 'document_type', 'status', 'crm_entity', 'total_amount', 'company')
    list_select_related = ('crm_entity', 'warehouse', 'created_by', 'owner', 'company')
    search_fields = ('number', 'reference_number', 'crm_entity__name', 'company__name')
    list_filter = ('document_type', 'status', 'company')
    readonly_fields = ('created_at', 'updated_at')
    inlines = [ProcurementLineInline]


@admin.register(ProcurementLine)
class ProcurementLineAdmin(admin.ModelAdmin):
    list_display = ('line_number', 'document', 'item', 'quantity', 'unit_price', 'total_amount', 'company')
    list_select_related = ('document', 'item', 'company')
    search_fields = ('document__number', 'item__sku', 'item__item_code')
    list_filter = ('company',)
    readonly_fields = ('created_at', 'updated_at')


class ApprovalStepInline(admin.TabularInline):
    model = ApprovalStep
    extra = 0
    readonly_fields = ('created_at', 'updated_at')


@admin.register(ApprovalWorkflow)
class ApprovalWorkflowAdmin(admin.ModelAdmin):
    list_display = ('name', 'module', 'document_type', 'active', 'min_amount', 'company')
    list_select_related = ('company',)
    search_fields = ('name', 'module', 'document_type')
    list_filter = ('module', 'active', 'company')
    readonly_fields = ('created_at', 'updated_at')
    inlines = [ApprovalStepInline]


@admin.register(ApprovalStep)
class ApprovalStepAdmin(admin.ModelAdmin):
    list_display = ('step_number', 'name', 'workflow', 'approver_role', 'approver_user', 'company')
    list_select_related = ('workflow', 'approver_user', 'company')
    search_fields = ('name', 'approver_role', 'workflow__name')
    list_filter = ('workflow', 'company')
    readonly_fields = ('created_at', 'updated_at')


@admin.register(ApprovalHistory)
class ApprovalHistoryAdmin(admin.ModelAdmin):
    list_display = ('action', 'document_model', 'document_id', 'workflow', 'action_by', 'company')
    list_select_related = ('workflow', 'step', 'action_by', 'company')
    search_fields = ('document_model', 'action_by__username')
    list_filter = ('action', 'company')
    readonly_fields = ('created_at', 'updated_at')


@admin.register(ProcurementNote)
class ProcurementNoteAdmin(admin.ModelAdmin):
    list_display = ('note_type', 'document', 'user', 'company')
    list_select_related = ('document', 'user', 'company')
    search_fields = ('document__number', 'user__username', 'text')
    list_filter = ('note_type', 'company')
    readonly_fields = ('created_at', 'updated_at')


@admin.register(ProcurementAttachment)
class ProcurementAttachmentAdmin(admin.ModelAdmin):
    list_display = ('file', 'document', 'uploaded_by', 'company')
    list_select_related = ('document', 'uploaded_by', 'company')
    search_fields = ('document__number', 'uploaded_by__username', 'description')
    list_filter = ('company',)
    readonly_fields = ('created_at', 'updated_at')


@admin.register(ProcurementAuditTrail)
class ProcurementAuditTrailAdmin(admin.ModelAdmin):
    list_display = ('event', 'document', 'user', 'company')
    list_select_related = ('document', 'user', 'company')
    search_fields = ('document__number', 'user__username', 'details')
    list_filter = ('event', 'company')
    readonly_fields = ('created_at', 'updated_at')


# ==========================================
# PHASE S-3A: VENDOR FOUNDATION ADMIN
# ==========================================

@admin.register(VendorCategory)
class VendorCategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'code', 'is_active', 'company')
    list_select_related = ('company',)
    search_fields = ('name', 'code', 'company__name')
    list_filter = ('is_active', 'company')
    readonly_fields = ('created_at', 'updated_at')


class VendorItemInline(admin.TabularInline):
    from .models import VendorItem
    model = VendorItem
    extra = 0
    fields = ('item', 'vendor_sku', 'vendor_price', 'currency', 'minimum_order_quantity', 'lead_time_days', 'is_preferred', 'is_active')
    readonly_fields = ('created_at', 'updated_at')


class VendorDocumentInline(admin.TabularInline):
    from .models import VendorDocument
    model = VendorDocument
    extra = 0
    fields = ('document_type', 'title', 'file', 'uploaded_by')
    readonly_fields = ('created_at', 'updated_at')


@admin.register(Vendor)
class VendorAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'category', 'status', 'contact_person', 'phone', 'payment_terms', 'credit_limit', 'company')
    list_select_related = ('category', 'crm_entity', 'company')
    search_fields = ('code', 'name', 'contact_person', 'phone', 'email', 'tax_number', 'company__name')
    list_filter = ('status', 'category', 'company')
    readonly_fields = ('code', 'created_at', 'updated_at')
    inlines = [VendorItemInline, VendorDocumentInline]


@admin.register(VendorItem)
class VendorItemAdmin(admin.ModelAdmin):
    list_display = ('vendor', 'item', 'vendor_sku', 'vendor_price', 'currency', 'lead_time_days', 'is_preferred', 'is_active', 'company')
    list_select_related = ('vendor', 'item', 'company')
    search_fields = ('vendor__name', 'item__name', 'item__sku', 'vendor_sku', 'company__name')
    list_filter = ('is_preferred', 'is_active', 'company')
    readonly_fields = ('created_at', 'updated_at')


@admin.register(VendorDocument)
class VendorDocumentAdmin(admin.ModelAdmin):
    list_display = ('title', 'vendor', 'document_type', 'uploaded_by', 'company', 'created_at')
    list_select_related = ('vendor', 'uploaded_by', 'company')
    search_fields = ('title', 'vendor__name', 'notes', 'company__name')
    list_filter = ('document_type', 'company')
    readonly_fields = ('created_at', 'updated_at')

