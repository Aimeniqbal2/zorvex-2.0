from django.contrib import admin
from .models import (
    CRMEntity, CRMContact, CRMAddress, CRMCommunication,
    CRMTag, CRMRelationship, CRMNote, CRMAttachment
)


@admin.register(CRMEntity)
class CRMEntityAdmin(admin.ModelAdmin):
    list_display = ('name', 'entity_type', 'code', 'status', 'active', 'company')
    list_select_related = ('company', 'created_by', 'owner')
    search_fields = ('name', 'code', 'company__name')
    list_filter = ('entity_type', 'active', 'company')
    readonly_fields = ('created_at', 'updated_at')


@admin.register(CRMContact)
class CRMContactAdmin(admin.ModelAdmin):
    list_display = ('first_name', 'last_name', 'entity', 'email', 'is_primary', 'company')
    list_select_related = ('entity', 'company')
    search_fields = ('first_name', 'last_name', 'email', 'entity__name')
    list_filter = ('is_primary', 'company')
    readonly_fields = ('created_at', 'updated_at')


@admin.register(CRMAddress)
class CRMAddressAdmin(admin.ModelAdmin):
    list_display = ('address_type', 'entity', 'city', 'country', 'is_default', 'company')
    list_select_related = ('entity', 'company')
    search_fields = ('city', 'country', 'entity__name')
    list_filter = ('address_type', 'is_default', 'company')
    readonly_fields = ('created_at', 'updated_at')


@admin.register(CRMCommunication)
class CRMCommunicationAdmin(admin.ModelAdmin):
    list_display = ('type', 'subject', 'entity', 'user', 'timestamp', 'company')
    list_select_related = ('entity', 'user', 'company')
    search_fields = ('subject', 'entity__name', 'user__username')
    list_filter = ('type', 'company')
    readonly_fields = ('created_at', 'updated_at')


@admin.register(CRMTag)
class CRMTagAdmin(admin.ModelAdmin):
    list_display = ('name', 'color', 'company')
    list_select_related = ('company',)
    search_fields = ('name', 'company__name')
    list_filter = ('company',)
    readonly_fields = ('created_at', 'updated_at')


@admin.register(CRMRelationship)
class CRMRelationshipAdmin(admin.ModelAdmin):
    list_display = ('from_entity', 'to_entity', 'relationship_type', 'company')
    list_select_related = ('from_entity', 'to_entity', 'company')
    search_fields = ('from_entity__name', 'to_entity__name', 'relationship_type')
    list_filter = ('relationship_type', 'company')
    readonly_fields = ('created_at', 'updated_at')


@admin.register(CRMNote)
class CRMNoteAdmin(admin.ModelAdmin):
    list_display = ('entity', 'user', 'company')
    list_select_related = ('entity', 'user', 'company')
    search_fields = ('entity__name', 'user__username')
    list_filter = ('company',)
    readonly_fields = ('created_at', 'updated_at')


@admin.register(CRMAttachment)
class CRMAttachmentAdmin(admin.ModelAdmin):
    list_display = ('file', 'entity', 'uploaded_by', 'company')
    list_select_related = ('entity', 'uploaded_by', 'company')
    search_fields = ('entity__name', 'uploaded_by__username')
    list_filter = ('company',)
    readonly_fields = ('created_at', 'updated_at')
