from rest_framework import serializers
from .models import ReportSubscription
import zoneinfo
from reports.services.scheduling import SchedulingService

class ReportSubscriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReportSubscription
        fields = [
            'id', 'name', 'report_type', 'frequency', 'timezone',
            'execution_time', 'day_of_week', 'day_of_month', 'parameters',
            'export_format', 'recipients', 'is_active', 'next_run_at',
            'last_run_at', 'last_success_at', 'last_failure_at', 'failure_count',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'next_run_at', 'last_run_at', 'last_success_at',
            'last_failure_at', 'failure_count', 'created_at', 'updated_at'
        ]

    def validate_timezone(self, value):
        try:
            zoneinfo.ZoneInfo(value)
        except Exception:
            raise serializers.ValidationError("Invalid timezone identifier.")
        return value

    def validate(self, data):
        freq = data.get('frequency', self.instance.frequency if self.instance else ReportSubscription.Frequency.MONTHLY)
        
        if freq == ReportSubscription.Frequency.WEEKLY and data.get('day_of_week') is None:
            if not (self.instance and self.instance.day_of_week is not None):
                raise serializers.ValidationError({"day_of_week": "Required for WEEKLY frequency."})
                
        if freq in [ReportSubscription.Frequency.MONTHLY, ReportSubscription.Frequency.QUARTERLY, ReportSubscription.Frequency.YEARLY] and data.get('day_of_month') is None:
            if not (self.instance and self.instance.day_of_month is not None):
                raise serializers.ValidationError({"day_of_month": f"Required for {freq} frequency."})

        # Validate that report type exists in registry
        from reports.services.report_registry import REPORT_REGISTRY
        report_type = data.get('report_type', self.instance.report_type if self.instance else None)
        if report_type not in REPORT_REGISTRY:
            raise serializers.ValidationError({"report_type": f"Unsupported report type: {report_type}"})

        return data

from .models import Target
from django.db import models

class TargetSerializer(serializers.ModelSerializer):
    class Meta:
        model = Target
        fields = '__all__'

    def validate(self, attrs):
        request = self.context.get('request')
        company_id = getattr(request, 'user', None) and getattr(request.user, 'company_id', None)
        if hasattr(request, 'META') and request.META.get('HTTP_X_COMPANY_ID'):
            company_id = request.META.get('HTTP_X_COMPANY_ID')
        
        if not company_id:
            return attrs
            
        for field_name, value in attrs.items():
            if value and hasattr(value, 'company_id'):
                if str(getattr(value, 'company_id')) != str(company_id):
                    raise serializers.ValidationError({
                        field_name: f"Related object must belong to your company."
                    })
        return super().validate(attrs)

from .models import SavedReport

class SavedReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = SavedReport
        fields = '__all__'
        read_only_fields = ['company']

    def validate(self, attrs):
        request = self.context.get('request')
        company_id = getattr(request, 'user', None) and getattr(request.user, 'company_id', None)
        if hasattr(request, 'META') and request.META.get('HTTP_X_COMPANY_ID'):
            company_id = request.META.get('HTTP_X_COMPANY_ID')
        
        if not company_id:
            return attrs
            
        for field_name, value in attrs.items():
            if value and hasattr(value, 'company_id'):
                if str(getattr(value, 'company_id')) != str(company_id):
                    raise serializers.ValidationError({
                        field_name: f"Related object must belong to your company."
                    })
        return super().validate(attrs)
