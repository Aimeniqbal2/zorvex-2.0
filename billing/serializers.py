"""
billing/serializers.py — Phase 8C
"""
from rest_framework import serializers
from django.core.exceptions import ValidationError as DjangoValidationError
from .models import (
    ServiceInvoice, ServiceInvoiceLine,
    ExtraDutyPayrollBridge, BillingAccountingConfiguration
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
