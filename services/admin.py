from django.contrib import admin
from .models import ServiceOrder, ServiceMedia, ServicePartUsed

@admin.register(ServiceOrder)
class ServiceOrderAdmin(admin.ModelAdmin):
    list_display = ('id', 'customer_name', 'crm_architecture_state', 'status', 'device_brand', 'technician')
    list_select_related = ('technician', 'crm_entity')

    def crm_architecture_state(self, obj):
        from crm.services.compatibility import get_architecture_state
        return get_architecture_state(obj)
    crm_architecture_state.short_description = "CRM Architecture"

@admin.register(ServiceMedia)
class ServiceMediaAdmin(admin.ModelAdmin):
    list_display = ('id', 'service_order', 'media_type', 'uploaded_by')
    list_select_related = ('service_order', 'uploaded_by')

@admin.register(ServicePartUsed)
class ServicePartUsedAdmin(admin.ModelAdmin):
    list_display = ('id', 'service_order', 'crm_architecture_state', 'procurement_architecture_state', 'architecture_used', 'product', 'item', 'quantity')
    list_select_related = ('service_order', 'product', 'item', 'crm_entity', 'procurement_line')
    readonly_fields = ('architecture_used', 'procurement_architecture_state')

    def crm_architecture_state(self, obj):
        from crm.services.compatibility import get_architecture_state
        return get_architecture_state(obj)
    crm_architecture_state.short_description = "CRM Architecture"

    def procurement_architecture_state(self, obj):
        from purchasing.services.compatibility import get_architecture_state
        return get_architecture_state(obj)
    procurement_architecture_state.short_description = "Procurement Architecture"

    def architecture_used(self, obj):
        if obj.item and obj.product:
            return "Mixed (Bridge)"
        if obj.item:
            return "Phase 3 (Item)"
        if obj.product:
            return "Legacy (Product)"
        return "Unknown"
    architecture_used.short_description = "Architecture"
