from django.contrib import admin
from .models import Sale, SaleItem, Customer, CustomerCreditLedger, POSSession

@admin.register(POSSession)
class POSSessionAdmin(admin.ModelAdmin):
    list_display = ('id', 'cashier', 'status', 'opening_cash', 'closing_cash', 'start_time')
    list_select_related = ('cashier',)
    list_filter = ('status', 'company')

@admin.register(Sale)
class SaleAdmin(admin.ModelAdmin):
    list_display = ('id', 'cashier', 'customer', 'crm_architecture_state', 'finance_architecture_state', 'journal_entry', 'total_amount', 'payment_method', 'created_at')
    list_select_related = ('cashier', 'customer', 'crm_entity', 'journal_entry')
    list_filter = ('payment_method', 'company')

    def crm_architecture_state(self, obj):
        from crm.services.compatibility import get_architecture_state
        return get_architecture_state(obj)
    crm_architecture_state.short_description = "CRM Architecture"

    def finance_architecture_state(self, obj):
        from finance.services.compatibility import get_architecture_state
        return get_architecture_state(obj)
    finance_architecture_state.short_description = "Finance Arch"

@admin.register(SaleItem)
class SaleItemAdmin(admin.ModelAdmin):
    list_display = ('id', 'sale', 'architecture_used', 'product', 'item', 'quantity', 'unit_price')
    list_select_related = ('sale', 'product', 'item')
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

@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ('name', 'phone', 'email', 'company', 'crm_architecture_state')
    list_select_related = ('company', 'crm_entity')

    def crm_architecture_state(self, obj):
        from crm.services.compatibility import get_architecture_state
        return get_architecture_state(obj)
    crm_architecture_state.short_description = "CRM Architecture"

@admin.register(CustomerCreditLedger)
class CustomerCreditLedgerAdmin(admin.ModelAdmin):
    list_display = ('customer', 'crm_architecture_state', 'finance_architecture_state', 'journal_entry', 'amount', 'transaction_type', 'created_at')
    list_select_related = ('customer', 'crm_entity', 'journal_entry')

    def crm_architecture_state(self, obj):
        from crm.services.compatibility import get_architecture_state
        return get_architecture_state(obj)
    crm_architecture_state.short_description = "CRM Architecture"

    def finance_architecture_state(self, obj):
        from finance.services.compatibility import get_architecture_state
        return get_architecture_state(obj)
    finance_architecture_state.short_description = "Finance Arch"
