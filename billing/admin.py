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


from .models import (
    BillingPeriod, BillingSheet, BillingSheetLine, BillingAdjustment,
    ClientInvoice, ClientInvoiceLine
)


@admin.register(BillingPeriod)
class BillingPeriodAdmin(admin.ModelAdmin):
    list_display = ('contract', 'client', 'billing_month', 'period_start', 'period_end', 'status', 'company')
    list_filter = ('company', 'status', 'billing_month')
    search_fields = ('contract__contract_code', 'client__name')


@admin.register(BillingSheet)
class BillingSheetAdmin(admin.ModelAdmin):
    list_display = ('sheet_number', 'client', 'contract', 'billing_month', 'status', 'total_amount', 'company')
    list_filter = ('company', 'status', 'billing_month')
    search_fields = ('sheet_number', 'client__name', 'contract__contract_code')
    readonly_fields = ('sheet_number', 'prepared_at', 'reviewed_at', 'approved_at', 'created_at', 'updated_at')


@admin.register(BillingSheetLine)
class BillingSheetLineAdmin(admin.ModelAdmin):
    list_display = ('billing_sheet', 'line_type', 'description', 'site', 'billable_quantity', 'unit_rate', 'total_amount')
    list_filter = ('company', 'line_type', 'source')
    search_fields = ('billing_sheet__sheet_number', 'description')


@admin.register(BillingAdjustment)
class BillingAdjustmentAdmin(admin.ModelAdmin):
    list_display = ('billing_sheet', 'adjustment_type', 'reason', 'amount', 'tax_amount', 'created_by')
    list_filter = ('company', 'adjustment_type')
    search_fields = ('billing_sheet__sheet_number', 'reason')


@admin.register(ClientInvoice)
class ClientInvoiceAdmin(admin.ModelAdmin):
    list_display = ('invoice_number', 'client', 'contract', 'billing_month', 'invoice_date', 'due_date', 'grand_total', 'status')
    list_filter = ('company', 'status', 'billing_month')
    search_fields = ('invoice_number', 'client__name', 'contract__contract_code')
    readonly_fields = ('invoice_number', 'issued_at', 'sent_at', 'created_at', 'updated_at')


@admin.register(ClientInvoiceLine)
class ClientInvoiceLineAdmin(admin.ModelAdmin):
    list_display = ('invoice', 'line_type', 'description', 'site', 'quantity', 'unit_rate', 'total_amount')
    list_filter = ('company', 'line_type')
    search_fields = ('invoice__invoice_number', 'description')


from .models import ClientReceipt, ClientReceiptAllocation, RecoveryActivity


@admin.register(ClientReceipt)
class ClientReceiptAdmin(admin.ModelAdmin):
    list_display = ('receipt_number', 'client', 'receipt_date', 'amount', 'payment_method', 'status', 'company')
    list_filter = ('company', 'status', 'payment_method')
    search_fields = ('receipt_number', 'client__name', 'reference_number', 'cheque_number')
    readonly_fields = ('receipt_number', 'posted_at', 'posted_by', 'reversed_at', 'reversed_by', 'created_at', 'updated_at')


@admin.register(ClientReceiptAllocation)
class ClientReceiptAllocationAdmin(admin.ModelAdmin):
    list_display = ('receipt', 'invoice', 'allocated_amount', 'company')
    list_filter = ('company',)
    search_fields = ('receipt__receipt_number', 'invoice__invoice_number')


@admin.register(RecoveryActivity)
class RecoveryActivityAdmin(admin.ModelAdmin):
    list_display = ('client', 'invoice', 'activity_type', 'activity_date', 'recovery_status_outcome', 'assigned_to', 'company')
    list_filter = ('company', 'activity_type', 'recovery_status_outcome')
    search_fields = ('client__name', 'invoice__invoice_number', 'notes')
