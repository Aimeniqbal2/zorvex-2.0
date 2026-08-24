from django.db import models
from django.core.exceptions import ValidationError
from erp_core.models import BaseModel
from crm.models import CRMEntity
from hrm.models import Designation, Shift
from django.db.models.signals import m2m_changed
from django.dispatch import receiver
from django.conf import settings

class OperationalSite(BaseModel):
    crm_entity = models.ForeignKey(CRMEntity, on_delete=models.RESTRICT, related_name='operational_sites')
    name = models.CharField(max_length=255)
    address = models.TextField()
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    is_active = models.BooleanField(default=True)

    def clean(self):
        super().clean()
        if self.crm_entity_id and str(self.crm_entity.company_id) != str(self.company_id):
            raise ValidationError({'crm_entity': 'CRM Entity must belong to the same company.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.crm_entity.name if self.crm_entity else 'Unlinked'})"

    class Meta:
        ordering = ['name']


class UserSiteAccess(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='site_accesses')
    site = models.ForeignKey(OperationalSite, on_delete=models.CASCADE, related_name='authorized_users')

    class Meta:
        unique_together = [('user', 'site')]

    def __str__(self):
        return f"{self.user} -> {self.site.name}"


class ServiceContractStatus(models.TextChoices):
    DRAFT = 'DRAFT', 'Draft'
    ACTIVE = 'ACTIVE', 'Active'
    SUSPENDED = 'SUSPENDED', 'Suspended'
    EXPIRED = 'EXPIRED', 'Expired'
    TERMINATED = 'TERMINATED', 'Terminated'


class ServiceContract(BaseModel):
    crm_entity = models.ForeignKey(CRMEntity, on_delete=models.RESTRICT, related_name='service_contracts')
    sites = models.ManyToManyField(OperationalSite, related_name='service_contracts', blank=True)
    contract_code = models.CharField(max_length=100)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=ServiceContractStatus.choices, default=ServiceContractStatus.DRAFT)
    notes = models.TextField(blank=True, default='')

    def clean(self):
        super().clean()
        if self.crm_entity_id and str(self.crm_entity.company_id) != str(self.company_id):
            raise ValidationError({'crm_entity': 'CRM Entity must belong to the same company.'})
        
        if self.start_date and self.end_date and self.start_date > self.end_date:
            raise ValidationError({'end_date': 'End date cannot be before start date.'})

        if self.contract_code:
            qs = ServiceContract.objects.filter(
                company_id=self.company_id,
                contract_code=self.contract_code,
                is_deleted=False
            )
            if self.pk:
                qs = qs.exclude(pk=self.pk)
            if qs.exists():
                raise ValidationError({'contract_code': 'A contract with this code already exists in your company.'})

        # Lifecycle Immutability (rudimentary checks):
        if self.pk:
            try:
                orig = ServiceContract.objects.get(pk=self.pk)
                if orig.status == ServiceContractStatus.TERMINATED and self.status == ServiceContractStatus.TERMINATED:
                    # Prevent changing core fields on TERMINATED contracts
                    if orig.crm_entity_id != self.crm_entity_id or orig.contract_code != self.contract_code:
                        raise ValidationError("Cannot modify core fields of a TERMINATED contract.")
            except ServiceContract.DoesNotExist:
                pass

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Contract {self.contract_code} ({self.crm_entity.name if self.crm_entity else 'Unlinked'})"

    class Meta:
        ordering = ['-start_date']
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'contract_code'],
                condition=models.Q(is_deleted=False),
                name='unique_active_contract_code_per_company'
            )
        ]


@receiver(m2m_changed, sender=ServiceContract.sites.through)
def validate_contract_sites(sender, instance, action, pk_set, **kwargs):
    if action == "pre_add" and pk_set:
        sites = OperationalSite.objects.filter(pk__in=pk_set)
        for site in sites:
            if str(site.company_id) != str(instance.company_id):
                raise ValidationError(f"OperationalSite {site.id} belongs to a different company.")


class ContractRate(BaseModel):
    service_contract = models.ForeignKey(ServiceContract, on_delete=models.RESTRICT, related_name='rates')
    designation = models.ForeignKey(Designation, on_delete=models.RESTRICT, related_name='contract_rates')
    billing_rate = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    pay_rate = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    effective_date = models.DateField()

    def clean(self):
        super().clean()
        if self.service_contract_id and str(self.service_contract.company_id) != str(self.company_id):
            raise ValidationError({'service_contract': 'Service Contract must belong to the same company.'})
        
        if self.designation_id and str(self.designation.company_id) != str(self.company_id):
            raise ValidationError({'designation': 'Designation must belong to the same company.'})
            
        if self.service_contract_id and self.effective_date:
            try:
                if self.effective_date < self.service_contract.start_date:
                    raise ValidationError({'effective_date': 'Effective date cannot be before contract start date.'})
                if self.service_contract.end_date and self.effective_date > self.service_contract.end_date:
                    raise ValidationError({'effective_date': 'Effective date cannot be after contract end date.'})
            except ServiceContract.DoesNotExist:
                pass

        if self.service_contract_id and self.designation_id and self.effective_date:
            qs = ContractRate.objects.filter(
                company_id=self.company_id,
                service_contract_id=self.service_contract_id,
                designation_id=self.designation_id,
                effective_date=self.effective_date,
                is_deleted=False
            )
            if self.pk:
                qs = qs.exclude(pk=self.pk)
            if qs.exists():
                raise ValidationError({'non_field_errors': 'A contract rate for this designation and date already exists.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.designation.name if self.designation else 'Unknown'} Rate on {self.service_contract.contract_code if self.service_contract else 'Unknown'}"

    class Meta:
        ordering = ['-effective_date']
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'service_contract', 'designation', 'effective_date'],
                condition=models.Q(is_deleted=False),
                name='unique_active_contract_rate'
            )
        ]

class SiteStaffingRequirement(BaseModel):
    service_contract = models.ForeignKey(ServiceContract, on_delete=models.RESTRICT, related_name='staffing_requirements')
    site = models.ForeignKey(OperationalSite, on_delete=models.RESTRICT, related_name='staffing_requirements')
    designation = models.ForeignKey(Designation, on_delete=models.RESTRICT, related_name='staffing_requirements')
    shift = models.ForeignKey(Shift, on_delete=models.RESTRICT, related_name='staffing_requirements')
    required_headcount = models.PositiveIntegerField(default=0)
    effective_from = models.DateField()
    effective_to = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True, default='')

    def clean(self):
        super().clean()
        if self.service_contract_id and str(self.service_contract.company_id) != str(self.company_id):
            raise ValidationError({'service_contract': 'Service Contract must belong to the same company.'})
        if self.site_id and str(self.site.company_id) != str(self.company_id):
            raise ValidationError({'site': 'Operational Site must belong to the same company.'})
        if self.designation_id and str(self.designation.company_id) != str(self.company_id):
            raise ValidationError({'designation': 'Designation must belong to the same company.'})
        if self.shift_id and str(self.shift.company_id) != str(self.company_id):
            raise ValidationError({'shift': 'Shift must belong to the same company.'})
            
        if self.service_contract_id and self.site_id:
            try:
                sc = ServiceContract.objects.get(pk=self.service_contract_id)
                if not sc.sites.filter(pk=self.site_id).exists():
                    raise ValidationError({'site': 'The site is not covered by the selected service contract.'})
            except ServiceContract.DoesNotExist:
                pass

        if self.effective_from and self.effective_to and self.effective_from > self.effective_to:
            raise ValidationError({'effective_to': 'Effective end date cannot be before start date.'})

        if self.service_contract_id and self.site_id and self.designation_id and self.shift_id and self.effective_from:
            # Overlap check
            qs = SiteStaffingRequirement.objects.filter(
                company_id=self.company_id,
                service_contract_id=self.service_contract_id,
                site_id=self.site_id,
                designation_id=self.designation_id,
                shift_id=self.shift_id,
                is_active=True,
                is_deleted=False
            )
            if self.pk:
                qs = qs.exclude(pk=self.pk)
                
            for other in qs:
                # Check overlap: (StartA <= EndB) and (EndA >= StartB)
                # If End is None, it means infinity.
                start_a = self.effective_from
                end_a = self.effective_to
                start_b = other.effective_from
                end_b = other.effective_to
                
                overlap = True
                if end_a and start_b > end_a:
                    overlap = False
                if end_b and start_a > end_b:
                    overlap = False
                    
                if overlap:
                    raise ValidationError("Overlapping active staffing requirements are not allowed for the same Contract, Site, Designation, and Shift.")

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.required_headcount} {self.designation.name}s at {self.site.name} ({self.shift.name})"

    class Meta:
        ordering = ['-effective_from']

class DeploymentStatus(models.TextChoices):
    DRAFT = 'DRAFT', 'Draft'
    PLANNED = 'PLANNED', 'Planned'
    ACTIVE = 'ACTIVE', 'Active'
    COMPLETED = 'COMPLETED', 'Completed'
    CANCELLED = 'CANCELLED', 'Cancelled'

class Deployment(BaseModel):
    employee = models.ForeignKey('hrm.Employee', on_delete=models.RESTRICT, related_name='deployments')
    site = models.ForeignKey(OperationalSite, on_delete=models.RESTRICT, related_name='deployments')
    service_contract = models.ForeignKey(ServiceContract, on_delete=models.RESTRICT, null=True, blank=True, related_name='deployments')
    designation = models.ForeignKey('hrm.Designation', on_delete=models.RESTRICT, related_name='deployments')
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=DeploymentStatus.choices, default=DeploymentStatus.DRAFT)
    notes = models.TextField(blank=True, default='')

    def clean(self):
        super().clean()
        if self.employee_id and str(self.employee.company_id) != str(self.company_id):
            raise ValidationError({'employee': 'Employee must belong to the same company.'})
        if self.site_id and str(self.site.company_id) != str(self.company_id):
            raise ValidationError({'site': 'Operational Site must belong to the same company.'})
        if self.service_contract_id and str(self.service_contract.company_id) != str(self.company_id):
            raise ValidationError({'service_contract': 'Service Contract must belong to the same company.'})
        if self.designation_id and str(self.designation.company_id) != str(self.company_id):
            raise ValidationError({'designation': 'Designation must belong to the same company.'})
        
        if self.start_date and self.end_date and self.start_date > self.end_date:
            raise ValidationError({'end_date': 'End date cannot be before start date.'})
            
        if self.service_contract_id and self.site_id:
            try:
                sc = ServiceContract.objects.get(pk=self.service_contract_id)
                if not sc.sites.filter(pk=self.site_id).exists():
                    raise ValidationError({'site': 'The site is not covered by the selected service contract.'})
            except ServiceContract.DoesNotExist:
                pass
                
        if self.pk:
            try:
                orig = Deployment.objects.get(pk=self.pk)
                if orig.status == DeploymentStatus.ACTIVE:
                    if orig.employee_id != self.employee_id:
                        raise ValidationError({'employee': 'Cannot change employee of an active deployment.'})
                    if orig.site_id != self.site_id:
                        raise ValidationError({'site': 'Cannot change site of an active deployment.'})
                    if orig.designation_id != self.designation_id:
                        raise ValidationError({'designation': 'Cannot change designation of an active deployment.'})
                if orig.status == DeploymentStatus.COMPLETED and self.status == DeploymentStatus.COMPLETED:
                    if orig.employee_id != self.employee_id or orig.site_id != self.site_id or orig.designation_id != self.designation_id or orig.start_date != self.start_date or orig.end_date != self.end_date:
                        raise ValidationError("Cannot modify core fields of a completed deployment.")
            except Deployment.DoesNotExist:
                pass

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    class Meta:
        ordering = ['-start_date']

class DutyAssignmentStatus(models.TextChoices):
    SCHEDULED = 'SCHEDULED', 'Scheduled'
    IN_PROGRESS = 'IN_PROGRESS', 'In Progress'
    COMPLETED = 'COMPLETED', 'Completed'
    ABSENT = 'ABSENT', 'Absent'
    CANCELLED = 'CANCELLED', 'Cancelled'

class DutyAssignment(BaseModel):
    deployment = models.ForeignKey(Deployment, on_delete=models.RESTRICT, null=True, blank=True, related_name='duty_assignments')
    temporary_service = models.ForeignKey('TemporaryServiceRequest', on_delete=models.RESTRICT, null=True, blank=True, related_name='duty_assignments')
    employee = models.ForeignKey('hrm.Employee', on_delete=models.RESTRICT, related_name='duty_assignments')
    site = models.ForeignKey(OperationalSite, on_delete=models.RESTRICT, related_name='duty_assignments')
    date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    status = models.CharField(max_length=20, choices=DutyAssignmentStatus.choices, default=DutyAssignmentStatus.SCHEDULED)
    notes = models.TextField(blank=True, default='')

    def clean(self):
        super().clean()
        if not getattr(self, 'deployment_id', None) and not getattr(self, 'temporary_service_id', None):
            raise ValidationError('Duty assignment must be linked to either a Deployment or a Temporary Service.')
        if self.deployment_id and str(self.deployment.company_id) != str(self.company_id):
            raise ValidationError({'deployment': 'Deployment must belong to the same company.'})
        if self.employee_id and str(self.employee.company_id) != str(self.company_id):
            raise ValidationError({'employee': 'Employee must belong to the same company.'})
        if self.site_id and str(self.site.company_id) != str(self.company_id):
            raise ValidationError({'site': 'Site must belong to the same company.'})
        if self.temporary_service_id and str(self.temporary_service.company_id) != str(self.company_id):
            raise ValidationError({'temporary_service': 'Temporary Service must belong to the same company.'})
            
        if self.temporary_service_id:
            try:
                ts = TemporaryServiceRequest.objects.get(pk=self.temporary_service_id)
                # Ensure date is within bounds
                if self.date:
                    if self.date < ts.start_datetime.date():
                        raise ValidationError({'date': 'Duty assignment date cannot be before temporary service start date.'})
                    if self.date > ts.end_datetime.date():
                        raise ValidationError({'date': 'Duty assignment date cannot be after temporary service end date.'})
                if ts.operational_site_id:
                    self.site_id = ts.operational_site_id
            except TemporaryServiceRequest.DoesNotExist:
                pass

            
        if self.deployment_id:
            try:
                dep = Deployment.objects.get(pk=self.deployment_id)
                # Enforce that employee and site strictly match the deployment
                if self.employee_id and self.employee_id != dep.employee_id:
                    raise ValidationError({'employee': 'Employee must match the deployment employee.'})
                if self.site_id and self.site_id != dep.site_id:
                    raise ValidationError({'site': 'Site must match the deployment site.'})
                    
                self.employee_id = dep.employee_id
                self.site_id = dep.site_id
                
                if self.date:
                    if self.date < dep.start_date:
                        raise ValidationError({'date': 'Duty assignment date cannot be before deployment start date.'})
                    if dep.end_date and self.date > dep.end_date:
                        raise ValidationError({'date': 'Duty assignment date cannot be after deployment end date.'})
            except Deployment.DoesNotExist:
                pass
                
        if self.start_time and self.end_time:
            if self.start_time >= self.end_time:
                raise ValidationError({'end_time': 'End time must be after start time (overnight shifts not supported).'})
                
        if self.employee_id and self.date and self.start_time and self.end_time:
            qs = DutyAssignment.objects.filter(
                company_id=self.company_id,
                employee_id=self.employee_id,
                date=self.date,
                is_deleted=False
            ).exclude(status=DutyAssignmentStatus.CANCELLED)
            if self.pk:
                qs = qs.exclude(pk=self.pk)
                
            for other in qs:
                if other.start_time and other.end_time:
                    # Overlap logic: A overlaps B if StartA < EndB and EndA > StartB
                    if self.start_time < other.end_time and self.end_time > other.start_time:
                        raise ValidationError("Overlapping duty assignments are not allowed for the same employee on the same date.")

        if self.pk:
            try:
                orig = DutyAssignment.objects.get(pk=self.pk)
                if orig.status == DutyAssignmentStatus.COMPLETED and self.status == DutyAssignmentStatus.COMPLETED:
                    if (orig.deployment_id != self.deployment_id or 
                        orig.employee_id != self.employee_id or 
                        orig.site_id != self.site_id or 
                        orig.date != self.date or 
                        orig.start_time != self.start_time or 
                        orig.end_time != self.end_time):
                        raise ValidationError("Cannot modify core fields of a completed duty assignment.")
            except DutyAssignment.DoesNotExist:
                pass

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    class Meta:
        ordering = ['-date', '-start_time']

class ExtraDutyStatus(models.TextChoices):
    REQUESTED = 'REQUESTED', 'Requested'
    APPROVED = 'APPROVED', 'Approved'
    REJECTED = 'REJECTED', 'Rejected'
    COMPLETED = 'COMPLETED', 'Completed'

class ExtraDuty(BaseModel):
    employee = models.ForeignKey('hrm.Employee', on_delete=models.RESTRICT, related_name='extra_duties')
    site = models.ForeignKey(OperationalSite, on_delete=models.RESTRICT, null=True, blank=True, related_name='extra_duties')
    service_contract = models.ForeignKey(ServiceContract, on_delete=models.RESTRICT, null=True, blank=True, related_name='extra_duties')
    date = models.DateField()
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)
    hours = models.DecimalField(max_digits=5, decimal_places=2)
    description = models.TextField(blank=True, default='')
    status = models.CharField(max_length=20, choices=ExtraDutyStatus.choices, default=ExtraDutyStatus.REQUESTED)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_extra_duties'
    )

    def clean(self):
        super().clean()
        if self.employee_id and str(self.employee.company_id) != str(self.company_id):
            raise ValidationError({'employee': 'Employee must belong to the same company.'})
        if self.site_id and str(self.site.company_id) != str(self.company_id):
            raise ValidationError({'site': 'Site must belong to the same company.'})
        if self.service_contract_id and str(self.service_contract.company_id) != str(self.company_id):
            raise ValidationError({'service_contract': 'Service Contract must belong to the same company.'})
        if self.approved_by_id and hasattr(self.approved_by, 'company_id') and str(self.approved_by.company_id) != str(self.company_id):
            raise ValidationError({'approved_by': 'Approver must belong to the same company.'})

        if self.service_contract_id and self.site_id:
            try:
                sc = ServiceContract.objects.get(pk=self.service_contract_id)
                if not sc.sites.filter(pk=self.site_id).exists():
                    raise ValidationError({'site': 'The site is not covered by the selected service contract.'})
            except ServiceContract.DoesNotExist:
                pass
                
        if self.hours is not None and self.hours <= 0:
            raise ValidationError({'hours': 'Hours must be greater than zero.'})

        if self.start_time and self.end_time:
            if self.start_time >= self.end_time:
                raise ValidationError({'end_time': 'End time must be after start time (overnight shifts not supported).'})
                
        if self.pk:
            try:
                orig = ExtraDuty.objects.get(pk=self.pk)
                if orig.status in [ExtraDutyStatus.APPROVED, ExtraDutyStatus.COMPLETED]:
                    if orig.employee_id != self.employee_id or orig.date != self.date or orig.hours != self.hours:
                        raise ValidationError("Cannot modify core fields (employee, date, hours) once approved or completed.")
                    if orig.status == ExtraDutyStatus.COMPLETED and self.status == ExtraDutyStatus.COMPLETED:
                        if orig.site_id != self.site_id or orig.service_contract_id != self.service_contract_id or orig.start_time != self.start_time or orig.end_time != self.end_time:
                             raise ValidationError("Cannot modify operational details of a completed extra duty.")
            except ExtraDuty.DoesNotExist:
                pass

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    class Meta:
        ordering = ['-date', '-start_time']


class EquipmentIssueStatus(models.TextChoices):
    ISSUED = 'ISSUED', 'Issued'
    RETURNED = 'RETURNED', 'Returned'
    LOST = 'LOST', 'Lost'
    DAMAGED = 'DAMAGED', 'Damaged'


class EquipmentIssue(BaseModel):
    employee = models.ForeignKey('hrm.Employee', on_delete=models.RESTRICT, related_name='equipment_issues')
    item = models.ForeignKey('inventory.Item', on_delete=models.RESTRICT, related_name='equipment_issues')
    item_serial = models.ForeignKey('inventory.ItemSerial', on_delete=models.RESTRICT, null=True, blank=True, related_name='equipment_issues')
    warehouse = models.ForeignKey('platform_core.Warehouse', on_delete=models.RESTRICT, related_name='equipment_issues')
    site = models.ForeignKey(OperationalSite, on_delete=models.SET_NULL, null=True, blank=True, related_name='equipment_issues')
    
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=1)
    issued_at = models.DateTimeField(auto_now_add=True)
    expected_return_date = models.DateField(null=True, blank=True)
    returned_at = models.DateTimeField(null=True, blank=True)
    
    status = models.CharField(max_length=20, choices=EquipmentIssueStatus.choices, default=EquipmentIssueStatus.ISSUED)
    issue_condition = models.CharField(max_length=100, blank=True, default='')
    return_condition = models.CharField(max_length=100, blank=True, default='')
    notes = models.TextField(blank=True, default='')

    issued_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, null=True, blank=True, related_name='issued_equipments'
    )
    returned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, null=True, blank=True, related_name='returned_equipments'
    )

    def clean(self):
        super().clean()
        if self.employee_id and str(self.employee.company_id) != str(self.company_id):
            raise ValidationError({'employee': 'Employee must belong to the same company.'})
        if self.item_id and str(self.item.company_id) != str(self.company_id):
            raise ValidationError({'item': 'Item must belong to the same company.'})
        if self.warehouse_id and str(self.warehouse.company_id) != str(self.company_id):
            raise ValidationError({'warehouse': 'Warehouse must belong to the same company.'})
        if self.site_id and str(self.site.company_id) != str(self.company_id):
            raise ValidationError({'site': 'Site must belong to the same company.'})
        if self.item_serial_id:
            if str(self.item_serial.company_id) != str(self.company_id):
                raise ValidationError({'item_serial': 'Serial must belong to the same company.'})
            if self.item_serial.item_id != self.item_id:
                raise ValidationError({'item_serial': 'Serial does not match the selected item.'})
            
        if self.item_id and getattr(self, 'item', None):
            if self.item.track_serial_number and not self.item_serial_id:
                raise ValidationError({'item_serial': 'This item requires a serial number.'})
            if self.item.track_serial_number and self.quantity != 1:
                raise ValidationError({'quantity': 'Quantity must be exactly 1 for serialized items.'})

        if self.pk:
            try:
                orig = EquipmentIssue.objects.get(pk=self.pk)
                if orig.status == EquipmentIssueStatus.RETURNED and self.status == EquipmentIssueStatus.RETURNED:
                    if (orig.employee_id != self.employee_id or 
                        orig.item_id != self.item_id or 
                        orig.item_serial_id != self.item_serial_id or 
                        orig.warehouse_id != self.warehouse_id or 
                        orig.quantity != self.quantity):
                        raise ValidationError("Cannot modify core fields of a returned equipment issue.")
            except EquipmentIssue.DoesNotExist:
                pass

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    class Meta:
        ordering = ['-issued_at']


class IncidentReport(BaseModel):
    INCIDENT_TYPES = [
        ('SECURITY_BREACH', 'Security Breach'),
        ('THEFT', 'Theft'),
        ('TRESPASS', 'Trespass'),
        ('FIRE', 'Fire'),
        ('MEDICAL', 'Medical Emergency'),
        ('PROPERTY_DAMAGE', 'Property Damage'),
        ('VIOLENCE', 'Violence'),
        ('SUSPICIOUS_ACTIVITY', 'Suspicious Activity'),
        ('SAFETY', 'Safety Hazard'),
        ('OTHER', 'Other'),
    ]

    SEVERITY_LEVELS = [
        ('LOW', 'Low'),
        ('MEDIUM', 'Medium'),
        ('HIGH', 'High'),
        ('CRITICAL', 'Critical'),
    ]

    INCIDENT_STATUS = [
        ('OPEN', 'Open'),
        ('UNDER_REVIEW', 'Under Review'),
        ('RESOLVED', 'Resolved'),
        ('CLOSED', 'Closed'),
    ]

    site = models.ForeignKey(OperationalSite, on_delete=models.RESTRICT, related_name='incidents')
    reported_by = models.ForeignKey('hrm.Employee', on_delete=models.RESTRICT, related_name='reported_incidents')
    duty_assignment = models.ForeignKey(DutyAssignment, on_delete=models.SET_NULL, null=True, blank=True, related_name='incidents')
    
    incident_number = models.CharField(max_length=50, unique=True, blank=True)
    
    incident_type = models.CharField(max_length=50, choices=INCIDENT_TYPES)
    severity = models.CharField(max_length=20, choices=SEVERITY_LEVELS)
    
    occurred_at = models.DateTimeField()
    reported_at = models.DateTimeField(auto_now_add=True)
    
    title = models.CharField(max_length=200)
    description = models.TextField()
    action_taken = models.TextField(blank=True, default='')
    
    status = models.CharField(max_length=20, choices=INCIDENT_STATUS, default='OPEN')
    resolution = models.TextField(blank=True, default='')
    
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_incidents')
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-occurred_at']

    def clean(self):
        super().clean()
        if self.site_id and str(self.site.company_id) != str(self.company_id):
            raise ValidationError({'site': 'Site must belong to the same company.'})
        if self.reported_by_id and str(self.reported_by.company_id) != str(self.company_id):
            raise ValidationError({'reported_by': 'Employee must belong to the same company.'})
        if self.duty_assignment_id and str(self.duty_assignment.company_id) != str(self.company_id):
            raise ValidationError({'duty_assignment': 'Duty Assignment must belong to the same company.'})

    def save(self, *args, **kwargs):
        self.clean()
        if not self.incident_number:
            from erp_core.models import DocumentSequence
            from django.utils import timezone
            dt = self.occurred_at if getattr(self, 'occurred_at', None) else timezone.now()
            prefix = f"INC-{dt.strftime('%Y%m')}"
            self.incident_number = DocumentSequence.get_next_number(self.company, "INCIDENT", prefix)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.incident_number} - {self.title}"


class IncidentAttachment(BaseModel):
    incident = models.ForeignKey(IncidentReport, on_delete=models.CASCADE, related_name='attachments')
    file = models.FileField(upload_to='operations/incidents/%Y/%m/%d/')
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    description = models.CharField(max_length=255, blank=True, default='')
    
    def clean(self):
        super().clean()
        if self.incident_id and str(self.incident.company_id) != str(self.company_id):
            raise ValidationError({'incident': 'Incident must belong to the same company.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.file.name


class DailyActivityReport(BaseModel):
    DAR_STATUS = [
        ('DRAFT', 'Draft'),
        ('SUBMITTED', 'Submitted'),
        ('REVIEWED', 'Reviewed'),
    ]

    site = models.ForeignKey(OperationalSite, on_delete=models.RESTRICT, related_name='daily_reports')
    report_date = models.DateField()
    deployment = models.ForeignKey(Deployment, on_delete=models.SET_NULL, null=True, blank=True, related_name='daily_reports')
    duty_assignment = models.ForeignKey(DutyAssignment, on_delete=models.SET_NULL, null=True, blank=True, related_name='daily_reports')
    
    prepared_by = models.ForeignKey('hrm.Employee', on_delete=models.RESTRICT, related_name='prepared_dars')
    shift_start = models.DateTimeField()
    shift_end = models.DateTimeField()
    
    summary = models.TextField(blank=True, default='')
    status = models.CharField(max_length=20, choices=DAR_STATUS, default='DRAFT')
    
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_dars')
    reviewed_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        ordering = ['-report_date', '-shift_start']
        constraints = [
            models.UniqueConstraint(fields=['company', 'duty_assignment', 'report_date'], name='unique_dar_per_duty')
        ]

    def clean(self):
        super().clean()
        if self.site_id and str(self.site.company_id) != str(self.company_id):
            raise ValidationError({'site': 'Site must belong to the same company.'})
        if self.prepared_by_id and str(self.prepared_by.company_id) != str(self.company_id):
            raise ValidationError({'prepared_by': 'Employee must belong to the same company.'})
        if self.duty_assignment_id and str(self.duty_assignment.company_id) != str(self.company_id):
            raise ValidationError({'duty_assignment': 'Duty Assignment must belong to the same company.'})
        if self.deployment_id and str(self.deployment.company_id) != str(self.company_id):
            raise ValidationError({'deployment': 'Deployment must belong to the same company.'})
            
        if self.shift_start and self.shift_end and self.shift_start >= self.shift_end:
             raise ValidationError({'shift_end': 'Shift end must be after shift start.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"DAR: {self.site.name} - {self.report_date}"


class DailyActivityEntry(BaseModel):
    ENTRY_TYPES = [
        ('PATROL', 'Patrol'),
        ('HANDOVER', 'Shift Handover'),
        ('ACCESS', 'Access Control'),
        ('INCIDENT', 'Incident'),
        ('GENERAL', 'General Log'),
    ]
    report = models.ForeignKey(DailyActivityReport, on_delete=models.CASCADE, related_name='entries')
    timestamp = models.DateTimeField()
    activity_type = models.CharField(max_length=50, choices=ENTRY_TYPES, default='GENERAL')
    description = models.TextField()
    recorded_by = models.ForeignKey('hrm.Employee', on_delete=models.SET_NULL, null=True, blank=True)

    class Meta:
        ordering = ['timestamp']
        
    def clean(self):
        super().clean()
        if self.report_id and str(self.report.company_id) != str(self.company_id):
            raise ValidationError({'report': 'Report must belong to the same company.'})
        if self.recorded_by_id and str(self.recorded_by.company_id) != str(self.company_id):
            raise ValidationError({'recorded_by': 'Employee must belong to the same company.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Entry at {self.timestamp} - {self.activity_type}"


# ==============================================================================
# PHASE C-9: TEMPORARY SECURITY SERVICES & QUALITY ASSURANCE
# ==============================================================================

class TemporaryServiceRequest(BaseModel):
    STATUS_CHOICES = [
        ('DRAFT', 'Draft'),
        ('REQUESTED', 'Requested'),
        ('APPROVED', 'Approved'),
        ('CONFIRMED', 'Confirmed'),
        ('IN_PROGRESS', 'In Progress'),
        ('COMPLETED', 'Completed'),
        ('CANCELLED', 'Cancelled'),
    ]
    crm_entity = models.ForeignKey('crm.CRMEntity', on_delete=models.RESTRICT, related_name='temporary_services')
    title = models.CharField(max_length=200)
    reference_number = models.CharField(max_length=100)
    site_name = models.CharField(max_length=255, blank=True)
    operational_site = models.ForeignKey('OperationalSite', null=True, blank=True, on_delete=models.SET_NULL)
    start_datetime = models.DateTimeField()
    end_datetime = models.DateTimeField()
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='DRAFT')
    notes = models.TextField(blank=True)
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='requested_temp_services')
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='approved_temp_services')
    completed_at = models.DateTimeField(null=True, blank=True)

    def clean(self):
        super().clean()
        if self.crm_entity_id and str(self.crm_entity.company_id) != str(self.company_id):
            raise ValidationError({'crm_entity': 'CRM Entity must belong to the same company.'})
        if self.operational_site_id and str(self.operational_site.company_id) != str(self.company_id):
            raise ValidationError({'operational_site': 'Operational Site must belong to the same company.'})

class TemporaryServiceLine(BaseModel):
    temporary_service = models.ForeignKey(TemporaryServiceRequest, on_delete=models.CASCADE, related_name='lines')
    designation = models.ForeignKey('hrm.Designation', on_delete=models.RESTRICT)
    required_headcount = models.PositiveIntegerField(default=1)
    billing_rate = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    pay_rate = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    shift_start = models.TimeField(null=True, blank=True)
    shift_end = models.TimeField(null=True, blank=True)
    notes = models.TextField(blank=True)

    def clean(self):
        super().clean()
        if self.temporary_service_id and str(self.temporary_service.company_id) != str(self.company_id):
            raise ValidationError({'temporary_service': 'Temporary Service must belong to the same company.'})
        if self.designation_id and str(self.designation.company_id) != str(self.company_id):
            raise ValidationError({'designation': 'Designation must belong to the same company.'})

class QAChecklistTemplate(BaseModel):
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

class QAChecklistItem(BaseModel):
    template = models.ForeignKey(QAChecklistTemplate, on_delete=models.CASCADE, related_name='items')
    text = models.CharField(max_length=500)
    weight = models.PositiveIntegerField(default=1)
    is_critical = models.BooleanField(default=False)
    order = models.PositiveIntegerField(default=0)
    
    class Meta(BaseModel.Meta):
        ordering = ['order']

class QAInspection(BaseModel):
    STATUS_CHOICES = [
        ('DRAFT', 'Draft'),
        ('COMPLETED', 'Completed'),
        ('REVIEWED', 'Reviewed'),
    ]
    template = models.ForeignKey(QAChecklistTemplate, on_delete=models.RESTRICT)
    service_contract = models.ForeignKey('ServiceContract', null=True, blank=True, on_delete=models.RESTRICT)
    operational_site = models.ForeignKey('OperationalSite', null=True, blank=True, on_delete=models.RESTRICT)
    inspection_date = models.DateField()
    inspector = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.RESTRICT, related_name='inspections_performed')
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='DRAFT')
    score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    notes = models.TextField(blank=True)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='inspections_reviewed')

class QAInspectionResponse(BaseModel):
    RESPONSE_CHOICES = [
        ('PASS', 'Pass'),
        ('FAIL', 'Fail'),
        ('NA', 'N/A'),
    ]
    inspection = models.ForeignKey(QAInspection, on_delete=models.CASCADE, related_name='responses')
    checklist_item = models.ForeignKey(QAChecklistItem, on_delete=models.RESTRICT)
    response = models.CharField(max_length=10, choices=RESPONSE_CHOICES)
    comments = models.TextField(blank=True)

class QAFinding(BaseModel):
    SEVERITY_CHOICES = [
        ('LOW', 'Low'),
        ('MEDIUM', 'Medium'),
        ('HIGH', 'High'),
        ('CRITICAL', 'Critical'),
    ]
    inspection = models.ForeignKey(QAInspection, on_delete=models.CASCADE, related_name='findings')
    checklist_item = models.ForeignKey(QAChecklistItem, null=True, blank=True, on_delete=models.RESTRICT)
    severity = models.CharField(max_length=20, choices=SEVERITY_CHOICES, default='MEDIUM')
    description = models.TextField()
    status = models.CharField(max_length=50, default='OPEN')

class CorrectiveAction(BaseModel):
    STATUS_CHOICES = [
        ('OPEN', 'Open'),
        ('IN_PROGRESS', 'In Progress'),
        ('RESOLVED', 'Resolved'),
        ('VERIFIED', 'Verified'),
        ('CANCELLED', 'Cancelled'),
    ]
    finding = models.ForeignKey(QAFinding, on_delete=models.CASCADE, related_name='corrective_actions')
    action_required = models.TextField()
    assigned_to = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.RESTRICT, related_name='assigned_corrective_actions')
    due_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='OPEN')
    completed_at = models.DateTimeField(null=True, blank=True)
    verified_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='verified_corrective_actions')
    verification_notes = models.TextField(blank=True)
