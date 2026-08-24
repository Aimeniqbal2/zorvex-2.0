from django.contrib import admin
from .models import Category, Product, StockMovement, Item, InventoryBalance, ItemSerial, Vendor, VendorLedger, PurchaseOrder

admin.site.register(Category)
admin.site.register(Product)
from .models import PurchaseOrderItem

@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    list_display = ('id', 'architecture_used', 'movement_type', 'product', 'item', 'quantity', 'warehouse')
    list_select_related = ('product', 'item', 'warehouse')
    readonly_fields = ('architecture_used',)

    def architecture_used(self, obj):
        if obj.item and obj.product:
            return "Mixed (Bridge)"
        if obj.item:
            return "Phase 3 (Item)"
        if obj.product:
            return "Legacy (Product)"
        return "Unknown"
    architecture_used.short_description = "Architecture"

@admin.register(PurchaseOrderItem)
class PurchaseOrderItemAdmin(admin.ModelAdmin):
    list_display = ('id', 'purchase_order', 'architecture_used', 'procurement_architecture_state', 'product', 'item', 'quantity')
    list_select_related = ('purchase_order', 'product', 'item', 'procurement_line')
    readonly_fields = ('architecture_used', 'procurement_architecture_state')

    def architecture_used(self, obj):
        if obj.item and obj.product:
            return "Mixed (Bridge)"
        if obj.item:
            return "Phase 3 (Item)"
        if obj.product:
            return "Legacy (Product)"
        return "Unknown"
    architecture_used.short_description = "Architecture"

    def procurement_architecture_state(self, obj):
        from purchasing.services.compatibility import get_architecture_state
        return get_architecture_state(obj)
    procurement_architecture_state.short_description = "Procurement Architecture"

@admin.register(Item)
class ItemAdmin(admin.ModelAdmin):
    list_display = ('name', 'sku', 'item_code', 'item_type', 'category', 'company', 'is_active')
    list_select_related = ('category', 'company')
    search_fields = ('name', 'sku', 'item_code', 'barcode', 'company__name')
    list_filter = ('item_type', 'is_active', 'track_inventory', 'company')

@admin.register(InventoryBalance)
class InventoryBalanceAdmin(admin.ModelAdmin):
    list_display = ('item', 'warehouse', 'quantity', 'company')
    list_select_related = ('item', 'warehouse', 'company')
    search_fields = ('item__name', 'item__sku', 'warehouse__name', 'company__name')
    list_filter = ('warehouse', 'company')

@admin.register(ItemSerial)
class ItemSerialAdmin(admin.ModelAdmin):
    list_display = ('item', 'serial_number', 'warehouse', 'status', 'company')
    list_select_related = ('item', 'warehouse', 'company')
    search_fields = ('serial_number', 'item__name', 'item__sku', 'warehouse__name', 'company__name')
    list_filter = ('status', 'warehouse', 'company')

@admin.register(Vendor)
class VendorAdmin(admin.ModelAdmin):
    list_display = ('name', 'contact_phone', 'crm_architecture_state', 'company')
    list_select_related = ('company', 'crm_entity')

    def crm_architecture_state(self, obj):
        from crm.services.compatibility import get_architecture_state
        return get_architecture_state(obj)
    crm_architecture_state.short_description = "CRM Architecture"

@admin.register(VendorLedger)
class VendorLedgerAdmin(admin.ModelAdmin):
    list_display = ('vendor', 'crm_architecture_state', 'procurement_architecture_state', 'transaction_type', 'amount', 'company')
    list_select_related = ('vendor', 'company', 'crm_entity', 'procurement_document')

    def crm_architecture_state(self, obj):
        from crm.services.compatibility import get_architecture_state
        return get_architecture_state(obj)
    crm_architecture_state.short_description = "CRM Architecture"

    def procurement_architecture_state(self, obj):
        from purchasing.services.compatibility import get_architecture_state
        return get_architecture_state(obj)
    procurement_architecture_state.short_description = "Procurement Architecture"

@admin.register(PurchaseOrder)
class PurchaseOrderAdmin(admin.ModelAdmin):
    list_display = ('id', 'vendor', 'crm_architecture_state', 'procurement_architecture_state', 'status', 'total_amount', 'company')
    list_select_related = ('vendor', 'company', 'crm_entity', 'procurement_document')

    def crm_architecture_state(self, obj):
        from crm.services.compatibility import get_architecture_state
        return get_architecture_state(obj)
    crm_architecture_state.short_description = "CRM Architecture"

    def procurement_architecture_state(self, obj):
        from purchasing.services.compatibility import get_architecture_state
        return get_architecture_state(obj)
    procurement_architecture_state.short_description = "Procurement Architecture"
