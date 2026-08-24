"""
billing/admin.py — Phase 8C
"""
from django.contrib import admin
from .models import (
    ServiceInvoice, ServiceInvoiceLine,
    ExtraDutyPayrollBridge, BillingAccountingConfiguration
)


@admin.register(ServiceInvoice)
class ServiceInvoiceAdmin(admin.ModelAdmin):
    list_display = (
        'invoice_number', 'company', 'service_contract', 'crm_entity',
        'period_start', 'period_end', 'total_amount', 'status', 'is_deleted'
    )
    list_filter = ('company', 'status', 'is_deleted', 'period_start')
    search_fields = ('invoice_number', 'service_contract__contract_code', 'crm_entity__name')
    readonly_fields = ('invoice_number', 'journal_entry', 'created_at', 'updated_at')

    def has_change_permission(self, request, obj=None):
        # Prevent mutation of posted invoices through admin
        if obj and obj.status == 'POSTED':
            return False
        return super().has_change_permission(request, obj)


@admin.register(ServiceInvoiceLine)
class ServiceInvoiceLineAdmin(admin.ModelAdmin):
    list_display = (
        'service_invoice', 'designation', 'operational_site',
        'hours', 'rate', 'amount', 'company', 'is_deleted'
    )
    list_filter = ('company', 'is_deleted')
    search_fields = ('service_invoice__invoice_number', 'designation__name')
    readonly_fields = ('source_duty_assignment_ids', 'created_at', 'updated_at')


@admin.register(ExtraDutyPayrollBridge)
class ExtraDutyPayrollBridgeAdmin(admin.ModelAdmin):
    list_display = (
        'extra_duty', 'payroll_run', 'payslip', 'amount',
        'company', 'processed_at', 'is_deleted'
    )
    list_filter = ('company', 'is_deleted', 'processed_at')
    search_fields = ('extra_duty__id', 'payroll_run__run_number')
    readonly_fields = ('processed_at', 'created_at', 'updated_at')


@admin.register(BillingAccountingConfiguration)
class BillingAccountingConfigurationAdmin(admin.ModelAdmin):
    list_display = (
        'company', 'accounts_receivable_account', 'service_revenue_account',
        'default_currency', 'is_active'
    )
    list_filter = ('company', 'is_active')
