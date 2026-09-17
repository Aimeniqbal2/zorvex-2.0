"""
billing/serializers.py — Phase 8C
"""
from rest_framework import serializers
from django.core.exceptions import ValidationError as DjangoValidationError
from .models import (
    ServiceInvoice, ServiceInvoiceLine,
    ExtraDutyPayrollBridge, BillingAccountingConfiguration,
    BillingPeriod, BillingSheet, BillingSheetLine, BillingAdjustment,
    ClientInvoice, ClientInvoiceLine,
    ClientReceipt, ClientReceiptAllocation, RecoveryActivity
)


class BaseModelValidatorMixin:
    def validate(self, attrs):
        instance = self.instance or self.Meta.model()
        for k, v in attrs.items():
            if not isinstance(v, (list, tuple)):
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


class ServiceInvoiceLineSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    class Meta:
        model = ServiceInvoiceLine
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')


class ServiceInvoiceSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    lines = ServiceInvoiceLineSerializer(many=True, read_only=True)

    class Meta:
        model = ServiceInvoice
        fields = '__all__'
        read_only_fields = (
            'id', 'company', 'invoice_number', 'created_at', 'updated_at',
            'is_deleted', 'journal_entry', 'lines'
        )


class ExtraDutyPayrollBridgeSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    class Meta:
        model = ExtraDutyPayrollBridge
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')


class BillingAccountingConfigurationSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    class Meta:
        model = BillingAccountingConfiguration
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')


# ============================================================================
# PHASE S-4B SERIALIZERS
# ============================================================================

class BillingPeriodSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    client_name = serializers.CharField(source='client.name', read_only=True)
    contract_code = serializers.CharField(source='contract.contract_code', read_only=True)

    class Meta:
        model = BillingPeriod
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')


class BillingSheetLineSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    site_name = serializers.CharField(source='site.name', read_only=True)
    designation_name = serializers.CharField(source='designation.name', read_only=True)
    profit_center_name = serializers.CharField(source='profit_center.name', read_only=True)
    cost_center_name = serializers.CharField(source='cost_center.name', read_only=True)

    class Meta:
        model = BillingSheetLine
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')


class BillingAdjustmentSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    site_name = serializers.CharField(source='site.name', read_only=True)

    class Meta:
        model = BillingAdjustment
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')


class BillingSheetSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    client_name = serializers.CharField(source='client.name', read_only=True)
    contract_code = serializers.CharField(source='contract.contract_code', read_only=True)
    prepared_by_name = serializers.CharField(source='prepared_by.get_full_name', read_only=True)
    reviewed_by_name = serializers.CharField(source='reviewed_by.get_full_name', read_only=True)
    approved_by_name = serializers.CharField(source='approved_by.get_full_name', read_only=True)
    lines = BillingSheetLineSerializer(many=True, read_only=True)
    adjustments = BillingAdjustmentSerializer(many=True, read_only=True)
    generated_invoice_id = serializers.UUIDField(source='generated_invoice.id', read_only=True)
    generated_invoice_number = serializers.CharField(source='generated_invoice.invoice_number', read_only=True)

    class Meta:
        model = BillingSheet
        fields = '__all__'
        read_only_fields = (
            'id', 'company', 'sheet_number', 'prepared_at', 'reviewed_at',
            'approved_at', 'created_at', 'updated_at', 'is_deleted',
            'lines', 'adjustments', 'generated_invoice_id', 'generated_invoice_number'
        )


class ClientInvoiceLineSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    site_name = serializers.CharField(source='site.name', read_only=True)
    designation_name = serializers.CharField(source='designation.name', read_only=True)
    profit_center_name = serializers.CharField(source='profit_center.name', read_only=True)
    cost_center_name = serializers.CharField(source='cost_center.name', read_only=True)

    class Meta:
        model = ClientInvoiceLine
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')


class ClientInvoiceSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    client_name = serializers.CharField(source='client.name', read_only=True)
    contract_code = serializers.CharField(source='contract.contract_code', read_only=True)
    billing_sheet_number = serializers.CharField(source='billing_sheet.sheet_number', read_only=True)
    issued_by_name = serializers.CharField(source='issued_by.get_full_name', read_only=True)
    sent_by_name = serializers.CharField(source='sent_by.get_full_name', read_only=True)
    lines = ClientInvoiceLineSerializer(many=True, read_only=True)
    outstanding_amount = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    days_overdue = serializers.IntegerField(read_only=True)

    class Meta:
        model = ClientInvoice
        fields = '__all__'
        read_only_fields = (
            'id', 'company', 'invoice_number', 'issued_at', 'issued_by',
            'sent_at', 'sent_by', 'outbound_email', 'created_at', 'updated_at',
            'is_deleted', 'lines', 'outstanding_amount', 'is_overdue', 'days_overdue'
        )


class ClientReceiptAllocationSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    invoice_number = serializers.CharField(source='invoice.invoice_number', read_only=True)
    invoice_date = serializers.DateField(source='invoice.invoice_date', read_only=True)
    invoice_due_date = serializers.DateField(source='invoice.due_date', read_only=True)
    invoice_grand_total = serializers.DecimalField(source='invoice.grand_total', max_digits=14, decimal_places=2, read_only=True)
    invoice_paid_amount = serializers.DecimalField(source='invoice.paid_amount', max_digits=14, decimal_places=2, read_only=True)
    invoice_outstanding = serializers.DecimalField(source='invoice.outstanding_amount', max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = ClientReceiptAllocation
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted')


class ClientReceiptSerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    client_name = serializers.CharField(source='client.name', read_only=True)
    currency_code = serializers.CharField(source='currency.code', read_only=True)
    bank_account_name = serializers.CharField(source='bank_account.account_name', read_only=True)
    received_by_name = serializers.CharField(source='received_by.get_full_name', read_only=True)
    posted_by_name = serializers.CharField(source='posted_by.get_full_name', read_only=True)
    reversed_by_name = serializers.CharField(source='reversed_by.get_full_name', read_only=True)
    allocations = ClientReceiptAllocationSerializer(many=True, read_only=True)
    allocated_amount = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    unallocated_amount = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = ClientReceipt
        fields = '__all__'
        read_only_fields = (
            'id', 'company', 'receipt_number', 'status', 'posted_at', 'posted_by',
            'reversed_at', 'reversed_by', 'created_at', 'updated_at', 'is_deleted',
            'allocations', 'allocated_amount', 'unallocated_amount'
        )


class RecoveryActivitySerializer(BaseModelValidatorMixin, serializers.ModelSerializer):
    client_name = serializers.CharField(source='client.name', read_only=True)
    invoice_number = serializers.CharField(source='invoice.invoice_number', read_only=True)
    assigned_to_name = serializers.CharField(source='assigned_to.get_full_name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)

    class Meta:
        model = RecoveryActivity
        fields = '__all__'
        read_only_fields = ('id', 'company', 'created_at', 'updated_at', 'is_deleted', 'outbound_email')
