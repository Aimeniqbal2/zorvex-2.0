from django.db import models
from django.conf import settings
from erp_core.models import BaseModel

def tenant_report_path(instance, filename):
    return f'reports/{instance.company_id}/{instance.id}.pdf'

class GeneratedReport(BaseModel):
    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        PROCESSING = 'PROCESSING', 'Processing'
        SUCCESS = 'SUCCESS', 'Success'
        FAILED = 'FAILED', 'Failed'
        EXPIRED = 'EXPIRED', 'Expired'

    report_type = models.CharField(max_length=50, db_index=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True)
    
    file = models.FileField(upload_to=tenant_report_path, null=True, blank=True)
    file_name = models.CharField(max_length=255, null=True, blank=True)
    error_message = models.TextField(null=True, blank=True)
    parameters = models.JSONField(default=dict, blank=True)
    
    task_id = models.CharField(max_length=255, null=True, blank=True)
    subscription = models.ForeignKey('ReportSubscription', on_delete=models.SET_NULL, null=True, blank=True, related_name='reports')

    
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    
    class Meta(BaseModel.Meta):
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.report_type} - {self.status}"


class ReportSubscription(BaseModel):
    class Frequency(models.TextChoices):
        DAILY = 'DAILY', 'Daily'
        WEEKLY = 'WEEKLY', 'Weekly'
        MONTHLY = 'MONTHLY', 'Monthly'
        QUARTERLY = 'QUARTERLY', 'Quarterly'
        YEARLY = 'YEARLY', 'Yearly'

    name = models.CharField(max_length=255)
    report_type = models.CharField(max_length=50, db_index=True)
    
    frequency = models.CharField(max_length=20, choices=Frequency.choices, default=Frequency.MONTHLY)
    timezone = models.CharField(max_length=50, default='UTC')
    execution_time = models.TimeField()
    day_of_week = models.IntegerField(null=True, blank=True, help_text="0=Monday, 6=Sunday")
    day_of_month = models.IntegerField(null=True, blank=True, help_text="1-31")
    
    parameters = models.JSONField(default=dict, blank=True)
    export_format = models.CharField(max_length=10, default='pdf')
    
    # Store recipients as JSON array (can contain UUIDs or emails)
    recipients = models.JSONField(default=list, blank=True)
    
    is_active = models.BooleanField(default=True, db_index=True)
    
    next_run_at = models.DateTimeField(null=True, blank=True, db_index=True)
    last_run_at = models.DateTimeField(null=True, blank=True)
    last_success_at = models.DateTimeField(null=True, blank=True)
    last_failure_at = models.DateTimeField(null=True, blank=True)
    failure_count = models.IntegerField(default=0)
    
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    
    class Meta(BaseModel.Meta):
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} ({self.report_type})"


from django.core.exceptions import ValidationError

class Target(BaseModel):
    TARGET_TYPES = (
        ('REVENUE', 'Revenue'),
        ('SALES', 'Sales'),
        ('GROSS_PROFIT', 'Gross Profit'),
        ('NEW_CUSTOMERS', 'New Customers'),
        ('COLLECTIONS', 'Collections'),
    )
    target_type = models.CharField(max_length=50, choices=TARGET_TYPES)
    period_start = models.DateField()
    period_end = models.DateField()
    target_value = models.DecimalField(max_digits=15, decimal_places=4)

    # Explicit Optional FKs
    employee = models.ForeignKey('hrm.Employee', null=True, blank=True, on_delete=models.RESTRICT)
    department = models.ForeignKey('hrm.Department', null=True, blank=True, on_delete=models.RESTRICT)
    cost_center = models.ForeignKey('finance.CostCenter', null=True, blank=True, on_delete=models.RESTRICT)
    crm_entity = models.ForeignKey('crm.CRMEntity', null=True, blank=True, on_delete=models.RESTRICT)

    class Meta(BaseModel.Meta):
        indexes = [
            models.Index(fields=['company', 'target_type', 'period_start', 'period_end']),
        ]

    def clean(self):
        super().clean()
        if self.period_start and self.period_end and self.period_start >= self.period_end:
            raise ValidationError("period_start must be before period_end.")
        
        if self.employee and self.employee.company_id != self.company_id:
            raise ValidationError({'employee': 'Employee must belong to the same company.'})
        if self.department and self.department.company_id != self.company_id:
            raise ValidationError({'department': 'Department must belong to the same company.'})
        if self.cost_center and self.cost_center.company_id != self.company_id:
            raise ValidationError({'cost_center': 'Cost Center must belong to the same company.'})
        if self.crm_entity and self.crm_entity.company_id != self.company_id:
            raise ValidationError({'crm_entity': 'CRM Entity must belong to the same company.'})

        # Check uniqueness manually to handle nulls safely
        qs = Target.objects.filter(
            company=self.company,
            target_type=self.target_type,
            period_start=self.period_start,
            period_end=self.period_end,
            employee=self.employee,
            department=self.department,
            cost_center=self.cost_center,
            crm_entity=self.crm_entity
        ).exclude(pk=self.pk)
        if qs.exists():
            raise ValidationError("An identical target for this period and entity already exists.")

    def __str__(self):
        return f"Target: {self.target_type} ({self.period_start} to {self.period_end})"

class SavedReport(BaseModel):
    name = models.CharField(max_length=255)
    description = models.TextField(null=True, blank=True)
    
    source_code = models.CharField(max_length=100)
    columns_json = models.JSONField(default=list)
    filters_json = models.JSONField(default=dict)
    ordering_json = models.JSONField(default=list)
    configuration_json = models.JSONField(default=dict, blank=True)
    
    is_shared = models.BooleanField(default=False)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    
    class Meta(BaseModel.Meta):
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} ({self.source_code})"
