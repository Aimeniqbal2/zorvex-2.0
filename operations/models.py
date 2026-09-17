from decimal import Decimal
from django.db import models
from django.core.exceptions import ValidationError
from django.utils import timezone
from erp_core.models import BaseModel
from crm.models import CRMEntity
from hrm.models import Designation, Shift, AttendanceStatus
from django.db.models.signals import m2m_changed
from django.dispatch import receiver
from django.conf import settings

class OperationalSite(BaseModel):
    crm_entity = models.ForeignKey(CRMEntity, on_delete=models.RESTRICT, related_name='operational_sites')
    name = models.CharField(max_length=255)
    address = models.TextField()
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    geofence_radius_meters = models.PositiveIntegerField(default=100, help_text="Geofence radius in meters around site coordinates")
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

class SecurityPost(BaseModel):
    site = models.ForeignKey(OperationalSite, on_delete=models.CASCADE, related_name='security_posts')
    service_contract = models.ForeignKey(ServiceContract, on_delete=models.SET_NULL, null=True, blank=True, related_name='security_posts')
    post_name = models.CharField(max_length=255)
    post_code = models.CharField(max_length=50, blank=True, default='')
    required_designation = models.ForeignKey('hrm.Designation', on_delete=models.RESTRICT, related_name='security_posts')
    required_headcount = models.PositiveIntegerField(default=1)
    daily_pay_rate = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True, default=None,
        help_text="Post-specific daily payable duty rate (e.g. 500.00). Overrides employee home rate during coverage."
    )
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True, default='')

    def clean(self):
        super().clean()
        if self.site_id and str(self.site.company_id) != str(self.company_id):
            raise ValidationError({'site': 'Operational Site must belong to the same company.'})
        if self.service_contract_id:
            if str(self.service_contract.company_id) != str(self.company_id):
                raise ValidationError({'service_contract': 'Service Contract must belong to the same company.'})
            if self.site_id and not self.service_contract.sites.filter(pk=self.site_id).exists():
                raise ValidationError({'service_contract': 'The selected contract does not cover this site.'})
        if self.required_designation_id and str(self.required_designation.company_id) != str(self.company_id):
            raise ValidationError({'required_designation': 'Designation must belong to the same company.'})
        if self.required_headcount < 1:
            raise ValidationError({'required_headcount': 'Required headcount must be at least 1.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    @property
    def deployed_count(self):
        return self.deployments.filter(status='ACTIVE', is_deleted=False).count()

    @property
    def vacant_count(self):
        return max(0, self.required_headcount - self.deployed_count)

    @property
    def overstaffed_count(self):
        return max(0, self.deployed_count - self.required_headcount)

    def __str__(self):
        return f"{self.post_name} ({self.site.name}) - {self.required_headcount} {self.required_designation.name}"

    class Meta:
        ordering = ['site', 'post_name']
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'site', 'post_name'],
                condition=models.Q(is_deleted=False),
                name='unique_active_post_name_per_site'
            )
        ]


class DeploymentStatus(models.TextChoices):
    DRAFT = 'DRAFT', 'Draft'
    PLANNED = 'PLANNED', 'Planned'
    ACTIVE = 'ACTIVE', 'Active'
    COMPLETED = 'COMPLETED', 'Completed'
    RELIEVED = 'RELIEVED', 'Relieved'
    CANCELLED = 'CANCELLED', 'Cancelled'


class DeploymentAssignmentType(models.TextChoices):
    PERMANENT = 'PERMANENT', 'Permanent'
    TEMPORARY = 'TEMPORARY', 'Temporary'


class Deployment(BaseModel):
    employee = models.ForeignKey('hrm.Employee', on_delete=models.RESTRICT, related_name='deployments')
    crm_entity = models.ForeignKey(CRMEntity, on_delete=models.RESTRICT, null=True, blank=True, related_name='deployments')
    site = models.ForeignKey(OperationalSite, on_delete=models.RESTRICT, related_name='deployments')
    post = models.ForeignKey(SecurityPost, on_delete=models.SET_NULL, null=True, blank=True, related_name='deployments')
    service_contract = models.ForeignKey(ServiceContract, on_delete=models.RESTRICT, null=True, blank=True, related_name='deployments')
    designation = models.ForeignKey('hrm.Designation', on_delete=models.RESTRICT, related_name='deployments')
    assignment_type = models.CharField(max_length=20, choices=DeploymentAssignmentType.choices, default=DeploymentAssignmentType.PERMANENT)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=DeploymentStatus.choices, default=DeploymentStatus.DRAFT)
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_deployments'
    )
    relieved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, null=True, blank=True, related_name='relieved_deployments'
    )
    relieved_date = models.DateField(null=True, blank=True)
    relief_reason = models.TextField(blank=True, default='')
    notes = models.TextField(blank=True, default='')

    @property
    def effective_from(self):
        return self.start_date

    @effective_from.setter
    def effective_from(self, value):
        self.start_date = value

    @property
    def effective_to(self):
        return self.end_date

    @effective_to.setter
    def effective_to(self, value):
        self.end_date = value

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

        # Auto-link client from site if not explicitly set
        if self.site_id and not self.crm_entity_id:
            try:
                self.crm_entity_id = self.site.crm_entity_id
            except Exception:
                pass

        if self.crm_entity_id:
            if str(self.crm_entity.company_id) != str(self.company_id):
                raise ValidationError({'crm_entity': 'CRM Entity must belong to the same company.'})
            if self.site_id and self.site.crm_entity_id and str(self.site.crm_entity_id) != str(self.crm_entity_id):
                raise ValidationError({'crm_entity': 'CRM Entity must match the operational site customer.'})

        # Post validation
        if self.post_id:
            if str(self.post.company_id) != str(self.company_id):
                raise ValidationError({'post': 'Security Post must belong to the same company.'})
            if self.site_id and self.post.site_id != self.site_id:
                raise ValidationError({'post': 'Security Post must belong to the selected operational site.'})
            if not self.designation_id and self.post.required_designation_id:
                self.designation_id = self.post.required_designation_id

        if self.start_date and self.end_date and self.start_date > self.end_date:
            raise ValidationError({'end_date': 'End date cannot be before start date.'})
            
        if self.service_contract_id and self.site_id:
            try:
                sc = ServiceContract.objects.get(pk=self.service_contract_id)
                if not sc.sites.filter(pk=self.site_id).exists():
                    raise ValidationError({'site': 'The site is not covered by the selected service contract.'})
            except ServiceContract.DoesNotExist:
                pass

        # Phase S-5B Rule: Only ACTIVE employees may receive active deployment
        if self.status == DeploymentStatus.ACTIVE and self.employee_id:
            emp_status = getattr(self.employee, 'employment_status', None)
            if emp_status and emp_status != 'ACTIVE':
                raise ValidationError({'employee': f'Only ACTIVE employees can receive an ACTIVE deployment (current status: {emp_status}).'})

        # Phase S-5B Rule: Prevent overlapping conflicting active deployments for the same employee
        if self.status == DeploymentStatus.ACTIVE and self.employee_id and self.start_date:
            start_a = self.start_date
            end_a = self.end_date
            
            conflict_qs = Deployment.objects.filter(
                company_id=self.company_id,
                employee_id=self.employee_id,
                status=DeploymentStatus.ACTIVE,
                is_deleted=False
            )
            if self.pk:
                conflict_qs = conflict_qs.exclude(pk=self.pk)
                
            for other in conflict_qs:
                start_b = other.start_date
                end_b = other.end_date
                overlap = True
                if end_a and start_b > end_a:
                    overlap = False
                if end_b and start_a > end_b:
                    overlap = False
                if overlap:
                    emp_display = getattr(self.employee, 'full_name', '') or getattr(self.employee, 'first_name', 'Employee')
                    site_name = getattr(other.site, 'name', 'another site')
                    raise ValidationError({
                        'employee': f"Employee {emp_display} already has an active deployment at {site_name} ({other.start_date} to {other.end_date or 'ongoing'}). Relieve the existing deployment before creating a new active deployment."
                    })

        if self.pk:
            try:
                orig = Deployment.objects.get(pk=self.pk)
                if orig.status == DeploymentStatus.ACTIVE and self.status == DeploymentStatus.ACTIVE:
                    if orig.employee_id != self.employee_id:
                        raise ValidationError({'employee': 'Cannot change employee of an active deployment.'})
                    if orig.site_id != self.site_id:
                        raise ValidationError({'site': 'Cannot change site of an active deployment.'})
                    if orig.designation_id != self.designation_id:
                        raise ValidationError({'designation': 'Cannot change designation of an active deployment.'})
                if orig.status in [DeploymentStatus.COMPLETED, DeploymentStatus.RELIEVED] and self.status in [DeploymentStatus.COMPLETED, DeploymentStatus.RELIEVED]:
                    if (orig.employee_id != self.employee_id or 
                        orig.site_id != self.site_id or 
                        orig.designation_id != self.designation_id or 
                        orig.start_date != self.start_date):
                        raise ValidationError("Cannot modify core fields of a completed or relieved deployment.")
            except Deployment.DoesNotExist:
                pass

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    class Meta:
        ordering = ['-start_date']


class PostShiftRequirement(BaseModel):
    post = models.ForeignKey(SecurityPost, on_delete=models.CASCADE, related_name='shift_requirements')
    shift = models.ForeignKey('hrm.Shift', on_delete=models.RESTRICT, related_name='post_requirements')
    required_headcount = models.PositiveIntegerField(default=1)
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True, default='')

    def clean(self):
        super().clean()
        if self.post_id and str(self.post.company_id) != str(self.company_id):
            raise ValidationError({'post': 'Security Post must belong to the same company.'})
        if self.shift_id and str(self.shift.company_id) != str(self.company_id):
            raise ValidationError({'shift': 'Shift must belong to the same company.'})
        if self.required_headcount < 1:
            raise ValidationError({'required_headcount': 'Required headcount must be at least 1.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    @property
    def post_name(self):
        return self.post.post_name if self.post else ''

    @property
    def site(self):
        return self.post.site if self.post else None

    @property
    def shift_name(self):
        return self.shift.name if self.shift else ''

    def __str__(self):
        return f"{self.post.post_name} - {self.shift.name}: {self.required_headcount} Guards"

    class Meta:
        ordering = ['post', 'shift']
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'post', 'shift'],
                condition=models.Q(is_deleted=False),
                name='unique_active_post_shift_req'
            )
        ]


class DutyRosterStatus(models.TextChoices):
    SCHEDULED = 'SCHEDULED', 'Scheduled'
    REPLACED = 'REPLACED', 'Replaced'
    SWAPPED = 'SWAPPED', 'Swapped'
    COMPLETED = 'COMPLETED', 'Completed'
    CANCELLED = 'CANCELLED', 'Cancelled'


class DutyRoster(BaseModel):
    duty_date = models.DateField()
    shift = models.ForeignKey('hrm.Shift', on_delete=models.RESTRICT, related_name='duty_rosters')
    site = models.ForeignKey(OperationalSite, on_delete=models.RESTRICT, related_name='duty_rosters')
    post = models.ForeignKey(SecurityPost, on_delete=models.SET_NULL, null=True, blank=True, related_name='duty_rosters')
    employee = models.ForeignKey('hrm.Employee', on_delete=models.RESTRICT, related_name='duty_rosters')
    deployment = models.ForeignKey(Deployment, on_delete=models.SET_NULL, null=True, blank=True, related_name='duty_rosters')
    status = models.CharField(max_length=20, choices=DutyRosterStatus.choices, default=DutyRosterStatus.SCHEDULED)
    is_replacement = models.BooleanField(default=False)
    replacement_for = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='replacement_duties')
    rostered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='rostered_duties'
    )
    notes = models.TextField(blank=True, default='')

    def clean(self):
        super().clean()
        if self.employee_id and str(self.employee.company_id) != str(self.company_id):
            raise ValidationError({'employee': 'Employee must belong to the same company.'})
        if self.shift_id and str(self.shift.company_id) != str(self.company_id):
            raise ValidationError({'shift': 'Shift must belong to the same company.'})
        if self.site_id and str(self.site.company_id) != str(self.company_id):
            raise ValidationError({'site': 'Operational Site must belong to the same company.'})
        if self.post_id:
            if str(self.post.company_id) != str(self.company_id):
                raise ValidationError({'post': 'Security Post must belong to the same company.'})
            if self.site_id and self.post.site_id != self.site_id:
                raise ValidationError({'post': 'Security Post does not belong to the selected site.'})
        if self.deployment_id:
            if str(self.deployment.company_id) != str(self.company_id):
                raise ValidationError({'deployment': 'Deployment must belong to the same company.'})
            if not self.is_replacement and self.deployment.employee_id != self.employee_id:
                raise ValidationError({'deployment': 'Deployment employee does not match rostered employee.'})

        # Phase S-5C Rule: Only ACTIVE employees may receive duty roster
        if self.employee_id and getattr(self.employee, 'employment_status', None) != 'ACTIVE':
            raise ValidationError({'employee': 'Only ACTIVE employees can be assigned to duty roster.'})

        # Phase S-5C Rule: Prevent conflicting overlapping duties for the same employee
        if self.employee_id and self.duty_date and self.shift_id and self.status in [DutyRosterStatus.SCHEDULED, DutyRosterStatus.COMPLETED]:
            qs = DutyRoster.objects.filter(
                company_id=self.company_id,
                employee_id=self.employee_id,
                duty_date=self.duty_date,
                shift_id=self.shift_id,
                status__in=[DutyRosterStatus.SCHEDULED, DutyRosterStatus.COMPLETED],
                is_deleted=False
            )
            if self.pk:
                qs = qs.exclude(pk=self.pk)
            if qs.exists():
                raise ValidationError({
                    'non_field_errors': f"Employee already has an active duty scheduled on {self.duty_date} for this shift."
                })

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.employee} on {self.duty_date} ({self.shift.name} @ {self.site.name})"

    class Meta:
        ordering = ['-duty_date', 'site', 'post']
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'employee', 'duty_date', 'shift'],
                condition=models.Q(is_deleted=False, status='SCHEDULED'),
                name='unique_active_scheduled_duty_per_employee'
            )
        ]


class DutyReplacement(BaseModel):
    original_roster = models.ForeignKey(DutyRoster, on_delete=models.RESTRICT, related_name='replacement_records')
    original_employee = models.ForeignKey('hrm.Employee', on_delete=models.RESTRICT, related_name='replaced_duties')
    replacement_employee = models.ForeignKey('hrm.Employee', on_delete=models.RESTRICT, related_name='replacement_coverages')
    site = models.ForeignKey(OperationalSite, on_delete=models.RESTRICT, related_name='duty_replacements')
    post = models.ForeignKey(SecurityPost, on_delete=models.SET_NULL, null=True, blank=True, related_name='duty_replacements')
    shift = models.ForeignKey('hrm.Shift', on_delete=models.RESTRICT, related_name='duty_replacements')
    duty_date = models.DateField()
    reason = models.TextField()
    status = models.CharField(max_length=20, default='ASSIGNED')
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_duty_replacements'
    )
    replacement_roster = models.ForeignKey(
        DutyRoster,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='replacement_source'
    )
    notes = models.TextField(blank=True, default='')

    def clean(self):
        super().clean()
        if str(self.original_employee.company_id) != str(self.company_id):
            raise ValidationError({'original_employee': 'Original employee must belong to same company.'})
        if str(self.replacement_employee.company_id) != str(self.company_id):
            raise ValidationError({'replacement_employee': 'Replacement employee must belong to same company.'})
        if self.replacement_employee.employment_status != 'ACTIVE':
            raise ValidationError({'replacement_employee': 'Replacement employee must be ACTIVE.'})
        if self.original_employee_id == self.replacement_employee_id:
            raise ValidationError({'replacement_employee': 'Replacement employee cannot be the same as original employee.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Replacement for {self.original_employee} by {self.replacement_employee} on {self.duty_date}"

    class Meta:
        ordering = ['-duty_date', 'site']


class DutySwap(BaseModel):
    roster_a = models.ForeignKey(DutyRoster, on_delete=models.RESTRICT, related_name='swaps_as_a')
    roster_b = models.ForeignKey(DutyRoster, on_delete=models.RESTRICT, related_name='swaps_as_b')
    employee_a = models.ForeignKey('hrm.Employee', on_delete=models.RESTRICT, related_name='roster_swaps_as_a')
    employee_b = models.ForeignKey('hrm.Employee', on_delete=models.RESTRICT, related_name='roster_swaps_as_b')
    reason = models.TextField(blank=True, default='')
    swapped_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='authorized_roster_swaps'
    )

    def clean(self):
        super().clean()
        if self.employee_a_id == self.employee_b_id:
            raise ValidationError({'employee_b': 'Cannot swap duty with the same employee.'})
        if str(self.employee_a.company_id) != str(self.company_id) or str(self.employee_b.company_id) != str(self.company_id):
            raise ValidationError('Both employees must belong to the same company.')

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Swap: {self.employee_a} <-> {self.employee_b}"

    class Meta:
        ordering = ['-created_at']


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


class SecurityEquipmentCategory(models.TextChoices):
    UNIFORM = 'UNIFORM', 'Uniform'
    SHOES_PPE = 'SHOES_PPE', 'Shoes / PPE'
    RADIO_COMMS = 'RADIO_COMMS', 'Radio / Communication Equipment'
    TORCH_SECURITY = 'TORCH_SECURITY', 'Torch / Security Equipment'
    CCTV_ELECTRONIC = 'CCTV_ELECTRONIC', 'CCTV / Electronic Equipment'
    ACCESS_CONTROL = 'ACCESS_CONTROL', 'Access-Control Equipment'
    CONSUMABLES = 'CONSUMABLES', 'Consumables'
    CONTROLLED_EQUIPMENT = 'CONTROLLED_EQUIPMENT', 'Controlled / Regulated Equipment'
    WEAPONS_AMMO = 'WEAPONS_AMMO', 'Weapons / Ammunition'
    OTHER = 'OTHER', 'Other Security Equipment'


class SecurityItemProfile(BaseModel):
    """
    Phase S-6: Security equipment metadata and controlled/regulated configuration
    extending universal inventory.Item without parallel stock balance duplication.
    """
    item = models.OneToOneField('inventory.Item', on_delete=models.CASCADE, related_name='security_profile')
    security_category = models.CharField(
        max_length=50,
        choices=SecurityEquipmentCategory.choices,
        default=SecurityEquipmentCategory.OTHER
    )
    is_controlled = models.BooleanField(default=False, help_text="Controlled or regulated security equipment")
    requires_authorization = models.BooleanField(default=False, help_text="Requires manager/armorer authorization to issue/return")
    license_required = models.BooleanField(default=False)
    license_reference = models.CharField(max_length=100, blank=True, default='')
    permit_reference = models.CharField(max_length=100, blank=True, default='')
    permit_expiry_date = models.DateField(null=True, blank=True)
    storage_location = models.CharField(max_length=100, blank=True, default='', help_text="Designated armory rack, locker, or storage zone")
    notes = models.TextField(blank=True, default='')

    class Meta(BaseModel.Meta):
        ordering = ['item__name']

    def clean(self):
        super().clean()
        if self.item_id and str(self.item.company_id) != str(self.company_id):
            raise ValidationError({'item': 'Item must belong to the same company.'})

    def __str__(self):
        return f"{self.item.name} [{self.get_security_category_display()}]"


class SecurityStoreType(models.TextChoices):
    MAIN_STORE = 'MAIN_STORE', 'Main Store'
    BRANCH_STORE = 'BRANCH_STORE', 'Branch Store'
    SITE_STORE = 'SITE_STORE', 'Operational Site Store'
    ARMORY = 'ARMORY', 'Armory / Controlled Store'


class SecurityStoreProfile(BaseModel):
    """
    Phase S-6: Store and armory classification extending universal platform_core.Warehouse.
    Maintains zero duplicate stock balance by anchoring to universal Warehouse.
    """
    warehouse = models.OneToOneField('platform_core.Warehouse', on_delete=models.CASCADE, related_name='security_profile')
    store_type = models.CharField(
        max_length=30,
        choices=SecurityStoreType.choices,
        default=SecurityStoreType.MAIN_STORE
    )
    site = models.ForeignKey(
        OperationalSite,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='security_stores',
        help_text="Operational site if this store is situated at a client facility"
    )
    is_armory = models.BooleanField(default=False)
    requires_strong_auth = models.BooleanField(default=False, help_text="Strong authorization required for issues from this store")
    supervisor = models.ForeignKey(
        'hrm.Employee',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='supervised_stores'
    )
    notes = models.TextField(blank=True, default='')

    class Meta(BaseModel.Meta):
        ordering = ['warehouse__name']

    def clean(self):
        super().clean()
        if self.warehouse_id and str(self.warehouse.company_id) != str(self.company_id):
            raise ValidationError({'warehouse': 'Warehouse must belong to the same company.'})
        if self.site_id and str(self.site.company_id) != str(self.company_id):
            raise ValidationError({'site': 'Site must belong to the same company.'})
        if self.supervisor_id and str(self.supervisor.company_id) != str(self.company_id):
            raise ValidationError({'supervisor': 'Supervisor must belong to the same company.'})

    def __str__(self):
        return f"{self.warehouse.name} ({self.get_store_type_display()})"


class EquipmentCustodyType(models.TextChoices):
    EMPLOYEE = 'EMPLOYEE', 'Employee Custody'
    SITE = 'SITE', 'Site Custody'


class EquipmentIssueStatus(models.TextChoices):
    ISSUED = 'ISSUED', 'Issued'
    RETURNED = 'RETURNED', 'Returned'
    LOST = 'LOST', 'Lost'
    DAMAGED = 'DAMAGED', 'Damaged'
    WRITTEN_OFF = 'WRITTEN_OFF', 'Written Off'


class EquipmentIssue(BaseModel):
    """
    Phase S-6: Security equipment issue and return tracking supporting both
    Employee custody and Site custody without duplicating stock balance.
    All physical movements route through universal inventory transaction engine.
    """
    custody_type = models.CharField(
        max_length=20,
        choices=EquipmentCustodyType.choices,
        default=EquipmentCustodyType.EMPLOYEE
    )
    employee = models.ForeignKey(
        'hrm.Employee',
        on_delete=models.RESTRICT,
        null=True,
        blank=True,
        related_name='equipment_issues'
    )
    item = models.ForeignKey('inventory.Item', on_delete=models.RESTRICT, related_name='equipment_issues')
    item_serial = models.ForeignKey('inventory.ItemSerial', on_delete=models.RESTRICT, null=True, blank=True, related_name='equipment_issues')
    warehouse = models.ForeignKey('platform_core.Warehouse', on_delete=models.RESTRICT, related_name='equipment_issues')
    site = models.ForeignKey(OperationalSite, on_delete=models.SET_NULL, null=True, blank=True, related_name='equipment_issues')
    contract = models.ForeignKey(ServiceContract, on_delete=models.SET_NULL, null=True, blank=True, related_name='equipment_issues')
    client = models.ForeignKey(CRMEntity, on_delete=models.SET_NULL, null=True, blank=True, related_name='equipment_issues')
    
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('1.00'))
    issued_at = models.DateTimeField(auto_now_add=True)
    expected_return_date = models.DateField(null=True, blank=True)
    returned_at = models.DateTimeField(null=True, blank=True)
    
    status = models.CharField(max_length=20, choices=EquipmentIssueStatus.choices, default=EquipmentIssueStatus.ISSUED)
    purpose = models.CharField(max_length=150, blank=True, default='', help_text="Reason/purpose for issuance")
    issue_condition = models.CharField(max_length=100, blank=True, default='')
    return_condition = models.CharField(max_length=100, blank=True, default='')
    notes = models.TextField(blank=True, default='')

    # Loss/Damage and write-off lifecycle
    incident_date = models.DateField(null=True, blank=True)
    damage_severity = models.CharField(max_length=30, blank=True, default='')
    resolution_status = models.CharField(max_length=30, blank=True, default='')
    resolution_notes = models.TextField(blank=True, default='')
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='resolved_equipment_issues'
    )
    resolved_at = models.DateTimeField(null=True, blank=True)

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
        if self.custody_type == EquipmentCustodyType.EMPLOYEE and not self.employee_id:
            raise ValidationError({'employee': 'Employee is required for employee equipment custody.'})
        if self.custody_type == EquipmentCustodyType.SITE and not self.site_id:
            raise ValidationError({'site': 'Site is required for site equipment custody.'})

        if self.employee_id and str(self.employee.company_id) != str(self.company_id):
            raise ValidationError({'employee': 'Employee must belong to the same company.'})
        if self.item_id and str(self.item.company_id) != str(self.company_id):
            raise ValidationError({'item': 'Item must belong to the same company.'})
        if self.warehouse_id and str(self.warehouse.company_id) != str(self.company_id):
            raise ValidationError({'warehouse': 'Warehouse must belong to the same company.'})
        if self.site_id and str(self.site.company_id) != str(self.company_id):
            raise ValidationError({'site': 'Site must belong to the same company.'})
        if self.contract_id and str(self.contract.company_id) != str(self.company_id):
            raise ValidationError({'contract': 'Contract must belong to the same company.'})
        if self.client_id and str(self.client.company_id) != str(self.company_id):
            raise ValidationError({'client': 'Client must belong to the same company.'})

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

        # Auto-resolve client and contract from site if missing
        if self.site_id and not self.client_id and self.site.crm_entity_id:
            self.client = self.site.crm_entity
        if self.site_id and not self.contract_id:
            c = self.site.service_contracts.filter(status='ACTIVE').first()
            if c:
                self.contract = c

        if self.pk:
            try:
                orig = EquipmentIssue.objects.get(pk=self.pk)
                if orig.status in [EquipmentIssueStatus.RETURNED, EquipmentIssueStatus.WRITTEN_OFF] and self.status == orig.status:
                    if (orig.employee_id != self.employee_id or 
                        orig.item_id != self.item_id or 
                        orig.item_serial_id != self.item_serial_id or 
                        orig.warehouse_id != self.warehouse_id or 
                        orig.quantity != self.quantity):
                        raise ValidationError("Cannot modify core fields of a closed equipment issue.")
            except EquipmentIssue.DoesNotExist:
                pass

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    class Meta(BaseModel.Meta):
        ordering = ['-issued_at']


class EquipmentIncidentType(models.TextChoices):
    LOST = 'LOST', 'Lost Equipment'
    DAMAGED = 'DAMAGED', 'Damaged Equipment'
    UNUSABLE = 'UNUSABLE', 'Unusable / Defective'


class EquipmentIncidentStatus(models.TextChoices):
    REPORTED = 'REPORTED', 'Reported'
    UNDER_INVESTIGATION = 'UNDER_INVESTIGATION', 'Under Investigation'
    APPROVED_WRITE_OFF = 'APPROVED_WRITE_OFF', 'Approved Write-Off'
    RECOVERED = 'RECOVERED', 'Recovered'
    REPAIRED = 'REPAIRED', 'Repaired & Restored'


class EquipmentIncident(BaseModel):
    """
    Phase S-6: Authorized tracking for lost, damaged, or unusable equipment.
    Links to original EquipmentIssue or store stock with incident evidence and approved resolution.
    Does NOT auto-deduct employee salary.
    """
    equipment_issue = models.ForeignKey(
        EquipmentIssue,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='incidents'
    )
    item = models.ForeignKey('inventory.Item', on_delete=models.RESTRICT, related_name='equipment_incidents')
    item_serial = models.ForeignKey('inventory.ItemSerial', on_delete=models.SET_NULL, null=True, blank=True, related_name='equipment_incidents')
    warehouse = models.ForeignKey('platform_core.Warehouse', on_delete=models.SET_NULL, null=True, blank=True, related_name='equipment_incidents')
    employee = models.ForeignKey('hrm.Employee', on_delete=models.SET_NULL, null=True, blank=True, related_name='equipment_incidents')
    site = models.ForeignKey(OperationalSite, on_delete=models.SET_NULL, null=True, blank=True, related_name='equipment_incidents')
    
    incident_type = models.CharField(max_length=20, choices=EquipmentIncidentType.choices, default=EquipmentIncidentType.DAMAGED)
    incident_date = models.DateField()
    reported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reported_equipment_incidents'
    )
    
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('1.00'))
    condition_description = models.TextField(blank=True, default='')
    evidence_notes = models.TextField(blank=True, default='')
    estimated_loss_value = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    
    status = models.CharField(max_length=30, choices=EquipmentIncidentStatus.choices, default=EquipmentIncidentStatus.REPORTED)
    approved_resolution = models.TextField(blank=True, default='')
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='resolved_equipment_incidents'
    )
    resolved_at = models.DateTimeField(null=True, blank=True)
    
    # Flag indicating if HR / Finance payroll deduction workflow is recommended
    payroll_deduction_recommended = models.BooleanField(default=False)
    payroll_deduction_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))

    @property
    def recommended_payroll_deduction(self):
        return self.payroll_deduction_amount

    class Meta(BaseModel.Meta):
        ordering = ['-incident_date', '-created_at']

    def clean(self):
        super().clean()
        if self.item_id and str(self.item.company_id) != str(self.company_id):
            raise ValidationError({'item': 'Item must belong to the same company.'})
        if self.warehouse_id and str(self.warehouse.company_id) != str(self.company_id):
            raise ValidationError({'warehouse': 'Warehouse must belong to the same company.'})
        if self.employee_id and str(self.employee.company_id) != str(self.company_id):
            raise ValidationError({'employee': 'Employee must belong to the same company.'})
        if self.site_id and str(self.site.company_id) != str(self.company_id):
            raise ValidationError({'site': 'Site must belong to the same company.'})

    def __str__(self):
        return f"{self.get_incident_type_display()} - {self.item.name} ({self.status})"


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

    class IncidentStatus(models.TextChoices):
        OPEN = 'OPEN', 'Open'
        INVESTIGATING = 'INVESTIGATING', 'Investigating'
        ACTION_REQUIRED = 'ACTION_REQUIRED', 'Action Required'
        UNDER_REVIEW = 'UNDER_REVIEW', 'Under Review'
        RESOLVED = 'RESOLVED', 'Resolved'
        CLOSED = 'CLOSED', 'Closed'

    client = models.ForeignKey(CRMEntity, on_delete=models.SET_NULL, null=True, blank=True, related_name='operational_incidents')
    contract = models.ForeignKey('operations.ServiceContract', on_delete=models.SET_NULL, null=True, blank=True, related_name='operational_incidents')
    site = models.ForeignKey(OperationalSite, on_delete=models.RESTRICT, related_name='incidents')
    post = models.ForeignKey('operations.SecurityPost', on_delete=models.SET_NULL, null=True, blank=True, related_name='incidents')
    shift = models.ForeignKey('hrm.Shift', on_delete=models.SET_NULL, null=True, blank=True, related_name='incidents')
    roster = models.ForeignKey('operations.DutyRoster', on_delete=models.SET_NULL, null=True, blank=True, related_name='incidents')
    reported_by = models.ForeignKey('hrm.Employee', on_delete=models.RESTRICT, related_name='reported_incidents')
    assigned_to = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_incidents')
    duty_assignment = models.ForeignKey(DutyAssignment, on_delete=models.SET_NULL, null=True, blank=True, related_name='incidents')
    equipment = models.ForeignKey('inventory.Item', on_delete=models.SET_NULL, null=True, blank=True, related_name='incident_reports')
    item_serial = models.ForeignKey('inventory.ItemSerial', on_delete=models.SET_NULL, null=True, blank=True, related_name='incident_reports')
    equipment_incident = models.ForeignKey('operations.EquipmentIncident', on_delete=models.SET_NULL, null=True, blank=True, related_name='operational_incident_reports')
    
    incident_number = models.CharField(max_length=50, unique=True, blank=True)
    
    incident_type = models.CharField(max_length=50, choices=INCIDENT_TYPES)
    severity = models.CharField(max_length=20, choices=SEVERITY_LEVELS)
    
    occurred_at = models.DateTimeField()
    reported_at = models.DateTimeField(auto_now_add=True)
    
    title = models.CharField(max_length=200)
    description = models.TextField()
    involved_persons = models.TextField(blank=True, default='')
    immediate_action = models.TextField(blank=True, default='')
    action_taken = models.TextField(blank=True, default='')
    
    status = models.CharField(max_length=30, choices=IncidentStatus.choices, default=IncidentStatus.OPEN)
    resolution = models.TextField(blank=True, default='')
    
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_incidents')
    reviewed_at = models.DateTimeField(null=True, blank=True)
    closed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='closed_incidents')
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-occurred_at']

    def clean(self):
        super().clean()
        if self.site_id and str(self.site.company_id) != str(self.company_id):
            raise ValidationError({'site': 'Site must belong to the same company.'})
        if self.client_id and str(self.client.company_id) != str(self.company_id):
            raise ValidationError({'client': 'Client must belong to the same company.'})
        if self.contract_id and str(self.contract.company_id) != str(self.company_id):
            raise ValidationError({'contract': 'Contract must belong to the same company.'})
        if self.post_id and str(self.post.company_id) != str(self.company_id):
            raise ValidationError({'post': 'Post must belong to the same company.'})
        if self.shift_id and str(self.shift.company_id) != str(self.company_id):
            raise ValidationError({'shift': 'Shift must belong to the same company.'})
        if self.roster_id and str(self.roster.company_id) != str(self.company_id):
            raise ValidationError({'roster': 'Duty roster must belong to the same company.'})
        if self.reported_by_id and str(self.reported_by.company_id) != str(self.company_id):
            raise ValidationError({'reported_by': 'Employee must belong to the same company.'})
        if self.duty_assignment_id and str(self.duty_assignment.company_id) != str(self.company_id):
            raise ValidationError({'duty_assignment': 'Duty Assignment must belong to the same company.'})
        if self.equipment_id and str(self.equipment.company_id) != str(self.company_id):
            raise ValidationError({'equipment': 'Equipment must belong to the same company.'})
        if self.item_serial_id and str(self.item_serial.company_id) != str(self.company_id):
            raise ValidationError({'item_serial': 'Item serial must belong to the same company.'})
        if self.equipment_incident_id and str(self.equipment_incident.company_id) != str(self.company_id):
            raise ValidationError({'equipment_incident': 'Equipment incident must belong to the same company.'})

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


# ============================================================================
# PHASE S-5E: DAILY DUTY RATE & TEMPORARY ASSIGNMENT PAY
# ============================================================================

class DailyPayRateSource(models.TextChoices):
    POST_RATE = 'POST_RATE', 'Post Daily Rate'
    CONTRACT_RATE = 'CONTRACT_RATE', 'Contract Designation Rate'
    REPLACED_EMPLOYEE_RATE = 'REPLACED_EMPLOYEE_RATE', 'Replaced Guard Rate'
    EMPLOYEE_DAILY_RATE = 'EMPLOYEE_DAILY_RATE', 'Employee Explicit Daily Rate'
    EMPLOYEE_MONTHLY_DIVISOR = 'EMPLOYEE_MONTHLY_DIVISOR', 'Employee Monthly Salary / Divisor'
    MANUAL_OVERRIDE = 'MANUAL_OVERRIDE', 'Manual Rate Override'


class DailyPayCalculationStatus(models.TextChoices):
    CALCULATED = 'CALCULATED', 'Calculated'
    RECALCULATED = 'RECALCULATED', 'Recalculated'
    UNRESOLVED = 'UNRESOLVED', 'Unresolved Rate'
    FINALIZED = 'FINALIZED', 'Finalized in Payroll'


class DailyDutyPay(BaseModel):
    """
    Authoritative payroll-input record per employee/day converting actual duty & attendance
    into payroll-ready daily earnings while managing temporary replacements and cross-contract attribution.
    """
    employee = models.ForeignKey('hrm.Employee', on_delete=models.CASCADE, related_name='daily_duty_pays')
    duty_date = models.DateField(db_index=True)
    attendance = models.ForeignKey('hrm.WorkforceAttendance', on_delete=models.SET_NULL, null=True, blank=True, related_name='daily_duty_pays')
    attendance_status = models.CharField(max_length=30, choices=AttendanceStatus.choices, default=AttendanceStatus.PRESENT)

    # Roster, Replacement & Assignment Context
    roster = models.ForeignKey(DutyRoster, on_delete=models.SET_NULL, null=True, blank=True, related_name='daily_duty_pays')
    replacement = models.ForeignKey(DutyReplacement, on_delete=models.SET_NULL, null=True, blank=True, related_name='daily_duty_pays')
    is_replacement_duty = models.BooleanField(default=False)
    replaced_employee = models.ForeignKey('hrm.Employee', on_delete=models.SET_NULL, null=True, blank=True, related_name='replaced_daily_duty_pays')
    home_deployment = models.ForeignKey(Deployment, on_delete=models.SET_NULL, null=True, blank=True, related_name='home_daily_duty_pays')

    # Cost Attribution (Where the work was actually performed)
    client = models.ForeignKey(CRMEntity, on_delete=models.SET_NULL, null=True, blank=True, related_name='daily_duty_pays')
    contract = models.ForeignKey(ServiceContract, on_delete=models.SET_NULL, null=True, blank=True, related_name='daily_duty_pays')
    site = models.ForeignKey(OperationalSite, on_delete=models.SET_NULL, null=True, blank=True, related_name='daily_duty_pays')
    post = models.ForeignKey(SecurityPost, on_delete=models.SET_NULL, null=True, blank=True, related_name='daily_duty_pays')
    cost_center = models.ForeignKey('finance.CostCenter', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')

    # Rate Resolution
    rate_source = models.CharField(max_length=50, choices=DailyPayRateSource.choices, default=DailyPayRateSource.EMPLOYEE_MONTHLY_DIVISOR)
    rate_source_reference = models.CharField(max_length=200, blank=True, default='')
    daily_payable_rate = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    payable_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=100.00)
    payable_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    currency = models.ForeignKey('finance.Currency', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')

    # Lifecycle, Immutability & Audit
    calculation_status = models.CharField(max_length=30, choices=DailyPayCalculationStatus.choices, default=DailyPayCalculationStatus.CALCULATED)
    is_frozen = models.BooleanField(default=False, help_text="Locked once consumed by finalized payroll. Cannot be modified.")
    unresolved_reason = models.TextField(blank=True, default='')
    notes = models.TextField(blank=True, default='')
    calculated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')

    class Meta:
        ordering = ['-duty_date', 'employee']
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'employee', 'duty_date', 'roster'],
                condition=models.Q(is_deleted=False) & models.Q(roster__isnull=False),
                name='unique_active_daily_duty_pay_with_roster'
            ),
            models.UniqueConstraint(
                fields=['company', 'employee', 'duty_date'],
                condition=models.Q(is_deleted=False) & models.Q(roster__isnull=True),
                name='unique_active_daily_duty_pay_without_roster'
            ),
        ]

    def clean(self):
        super().clean()
        if self.is_frozen and self.pk:
            orig = DailyDutyPay.objects.filter(pk=self.pk).first()
            if orig and orig.is_frozen:
                # Disallow altering frozen rates or amounts
                if (
                    orig.daily_payable_rate != self.daily_payable_rate or
                    orig.payable_amount != self.payable_amount or
                    orig.payable_percentage != self.payable_percentage
                ):
                    raise ValidationError("Cannot modify rates or payable amounts on a locked/frozen daily pay record.")

    def __str__(self):
        return f"{self.employee} - {self.duty_date}: {self.payable_amount} ({self.rate_source})"


# ==============================================================================
# PHASE S-5F: PAYROLL RULES, STATUTORY DEDUCTIONS & COMPENSATION
# ==============================================================================

class PayrollAdditionType(models.TextChoices):
    ALLOWANCE = 'ALLOWANCE', 'Allowance'
    BONUS = 'BONUS', 'Bonus'
    EXTRA_DUTY = 'EXTRA_DUTY', 'Extra Duty Payment'
    ADJUSTMENT = 'ADJUSTMENT', 'Adjustment'
    OTHER = 'OTHER', 'Other'

class PayrollAdditionFrequency(models.TextChoices):
    ONE_TIME = 'ONE_TIME', 'One-Time'
    RECURRING = 'RECURRING', 'Recurring'

class PayrollAddition(BaseModel):
    """
    Configurable payroll addition/allowance/bonus, either one-time for a specific date/period
    or recurring across effective dates.
    """
    employee = models.ForeignKey('hrm.Employee', on_delete=models.CASCADE, related_name='payroll_additions')
    addition_type = models.CharField(max_length=50, choices=PayrollAdditionType.choices, default=PayrollAdditionType.ALLOWANCE)
    frequency = models.CharField(max_length=20, choices=PayrollAdditionFrequency.choices, default=PayrollAdditionFrequency.ONE_TIME)
    name = models.CharField(max_length=150)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    effective_date = models.DateField(null=True, blank=True, help_text="Specific date or period date for one-time additions")
    effective_from = models.DateField(null=True, blank=True, help_text="Start date for recurring additions")
    effective_to = models.DateField(null=True, blank=True, help_text="End date for recurring additions (optional)")
    is_active = models.BooleanField(default=True)
    is_approved = models.BooleanField(default=True)
    is_frozen = models.BooleanField(default=False)
    notes = models.TextField(blank=True, default='')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')

    class Meta(BaseModel.Meta):
        ordering = ['-created_at']

    def clean(self):
        super().clean()
        if self.pk:
            orig = PayrollAddition.objects.filter(pk=self.pk).values('is_frozen').first()
            if orig and orig.get('is_frozen') and not getattr(self, '_allow_frozen_update', False):
                raise ValidationError('Cannot modify a frozen payroll addition record consumed by finalized payroll.')
        if self.employee_id and str(self.employee.company_id) != str(self.company_id):
            raise ValidationError({'employee': 'Employee must belong to the same company.'})
        if self.amount is not None and self.amount <= 0:
            raise ValidationError({'amount': 'Addition amount must be greater than zero.'})
        if self.frequency == PayrollAdditionFrequency.RECURRING and self.effective_from and self.effective_to and self.effective_to < self.effective_from:
            raise ValidationError({'effective_to': 'Effective to date cannot be before effective from date.'})

    def __str__(self):
        return f"{self.employee} - {self.name}: {self.amount} ({self.frequency})"


class PayrollDeductionType(models.TextChoices):
    PATROLLING = 'PATROLLING', 'Patrolling Deduction'
    INSURANCE = 'INSURANCE', 'Insurance Deduction'
    ADVANCE_RECOVERY = 'ADVANCE_RECOVERY', 'Advance Recovery'
    UNIFORM = 'UNIFORM', 'Uniform Deduction'
    FINE = 'FINE', 'Fine / Penalty'
    OTHER = 'OTHER', 'Other Deduction'

class PayrollDeductionFrequency(models.TextChoices):
    ONE_TIME = 'ONE_TIME', 'One-Time'
    RECURRING = 'RECURRING', 'Recurring'

class PayrollDeduction(BaseModel):
    """
    Configurable deduction (Patrolling, Insurance, Advance Recovery, Uniform, Other),
    either one-time or recurring across effective dates.
    """
    employee = models.ForeignKey('hrm.Employee', on_delete=models.CASCADE, related_name='payroll_deductions')
    deduction_type = models.CharField(max_length=50, choices=PayrollDeductionType.choices, default=PayrollDeductionType.OTHER)
    frequency = models.CharField(max_length=20, choices=PayrollDeductionFrequency.choices, default=PayrollDeductionFrequency.ONE_TIME)
    name = models.CharField(max_length=150)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    effective_date = models.DateField(null=True, blank=True, help_text="Specific date or period date for one-time deductions")
    effective_from = models.DateField(null=True, blank=True, help_text="Start date for recurring deductions")
    effective_to = models.DateField(null=True, blank=True, help_text="End date for recurring deductions (optional)")
    advance = models.ForeignKey('finance.EmployeeAdvance', on_delete=models.SET_NULL, null=True, blank=True, related_name='operational_payroll_deductions')
    is_active = models.BooleanField(default=True)
    is_approved = models.BooleanField(default=True)
    is_frozen = models.BooleanField(default=False)
    notes = models.TextField(blank=True, default='')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')

    class Meta(BaseModel.Meta):
        ordering = ['-created_at']

    def clean(self):
        super().clean()
        if self.pk:
            orig = PayrollDeduction.objects.filter(pk=self.pk).values('is_frozen').first()
            if orig and orig.get('is_frozen') and not getattr(self, '_allow_frozen_update', False):
                raise ValidationError('Cannot modify a frozen payroll deduction record consumed by finalized payroll.')
        if self.employee_id and str(self.employee.company_id) != str(self.company_id):
            raise ValidationError({'employee': 'Employee must belong to the same company.'})
        if self.amount is not None and self.amount <= 0:
            raise ValidationError({'amount': 'Deduction amount must be greater than zero.'})
        if self.advance_id and str(self.advance.company_id) != str(self.company_id):
            raise ValidationError({'advance': 'Advance must belong to the same company.'})
        if self.frequency == PayrollDeductionFrequency.RECURRING and self.effective_from and self.effective_to and self.effective_to < self.effective_from:
            raise ValidationError({'effective_to': 'Effective to date cannot be before effective from date.'})

    def __str__(self):
        return f"{self.employee} - {self.name}: {self.amount} ({self.frequency})"


class PayrollCalculationStatus(models.TextChoices):
    DRAFT = 'DRAFT', 'Draft'
    CALCULATED = 'CALCULATED', 'Calculated'
    BLOCKED = 'BLOCKED', 'Blocked'
    READY = 'READY', 'Ready'


class EmployeePayrollCalculation(BaseModel):
    """
    Authoritative payroll calculation record per employee and payroll period.
    Aggregates finalized DailyDutyPay + approved Overtime + Additions - Statutory Deductions - Other Deductions - Advance Recovery = Net Payable.
    """
    employee = models.ForeignKey('hrm.Employee', on_delete=models.CASCADE, related_name='operational_payroll_calculations')
    period_start = models.DateField(db_index=True)
    period_end = models.DateField(db_index=True)
    status = models.CharField(max_length=20, choices=PayrollCalculationStatus.choices, default=PayrollCalculationStatus.DRAFT)
    has_blockers = models.BooleanField(default=False)
    blocking_reasons = models.JSONField(default=list, blank=True)

    # Earnings breakdown
    duty_earnings = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    duty_days_count = models.IntegerField(default=0)
    single_ot_hours = models.DecimalField(max_digits=7, decimal_places=2, default=0)
    single_ot_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    double_ot_hours = models.DecimalField(max_digits=7, decimal_places=2, default=0)
    double_ot_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_ot_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    allowances_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    bonuses_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    other_additions_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    gross_earnings = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    # Statutory Deductions (Independent EOBI, SESSI, PESSI)
    eobi_employee_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    eobi_employer_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    sessi_employee_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    sessi_employer_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    pessi_employee_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    pessi_employer_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    sessi_pessi_employee_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    sessi_pessi_employer_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total_statutory_deductions = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_employer_statutory = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    # Other Deductions
    patrolling_deduction = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    insurance_deduction = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    advance_recovery_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    other_deductions_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total_other_deductions = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_deductions = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    # Net Payable
    net_payable = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    # Snapshots, Run & Immutability Locks
    payroll_run = models.ForeignKey('hrm.PayrollRun', null=True, blank=True, on_delete=models.SET_NULL, related_name='operational_calculations')
    payslip = models.ForeignKey('hrm.Payslip', null=True, blank=True, on_delete=models.SET_NULL, related_name='operational_calculation_records')
    rate_snapshot = models.JSONField(default=dict, blank=True)
    is_frozen = models.BooleanField(default=False)
    calculated_at = models.DateTimeField(null=True, blank=True)
    calculated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    notes = models.TextField(blank=True, default='')

    class Meta(BaseModel.Meta):
        ordering = ['employee__first_name', '-period_start']
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'employee', 'period_start', 'period_end'],
                condition=models.Q(is_deleted=False),
                name='unique_active_employee_payroll_calc'
            )
        ]

    def clean(self):
        super().clean()
        if self.pk:
            orig = EmployeePayrollCalculation.objects.filter(pk=self.pk).values('is_frozen').first()
            if orig and orig.get('is_frozen') and not getattr(self, '_allow_frozen_update', False):
                raise ValidationError('Cannot modify a frozen payroll calculation consumed by finalized payroll.')
        if self.employee_id and str(self.employee.company_id) != str(self.company_id):
            raise ValidationError({'employee': 'Employee must belong to the same company.'})
        if self.period_start and self.period_end and self.period_end < self.period_start:
            raise ValidationError({'period_end': 'Period end date cannot be before period start date.'})
        if self.payroll_run_id and str(self.payroll_run.company_id) != str(self.company_id):
            raise ValidationError({'payroll_run': 'Payroll run must belong to the same company.'})
        if self.payslip_id and str(self.payslip.company_id) != str(self.company_id):
            raise ValidationError({'payslip': 'Payslip must belong to the same company.'})

    def __str__(self):
        return f"{self.employee} ({self.period_start} to {self.period_end}): Gross {self.gross_earnings} -> Net {self.net_payable} [{self.status}]"


class PayrollCalculationLine(BaseModel):
    """
    Granular audit line item for employee payroll calculation.
    """
    calculation = models.ForeignKey(EmployeePayrollCalculation, on_delete=models.CASCADE, related_name='lines')
    line_type = models.CharField(max_length=50)
    category = models.CharField(max_length=30, default='EARNING')
    description = models.CharField(max_length=255)
    duty_date = models.DateField(null=True, blank=True)
    units = models.DecimalField(max_digits=7, decimal_places=2, default=1)
    rate = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    employer_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    reference_id = models.CharField(max_length=100, blank=True, default='')
    rate_snapshot = models.JSONField(default=dict, blank=True)
    notes = models.TextField(blank=True, default='')

    class Meta(BaseModel.Meta):
        ordering = ['category', 'line_type', 'created_at']

    def __str__(self):
        return f"{self.description}: {self.amount} ({self.category})"


# ==============================================================================
# PHASE S-7: ADVANCED SECURITY OPERATIONS MODELS
# ==============================================================================

class OccurrenceEntryType(models.TextChoices):
    SHIFT_HANDOVER = 'SHIFT_HANDOVER', 'Shift Handover'
    OBSERVATION = 'OBSERVATION', 'Security Observation'
    VISITOR = 'VISITOR', 'Visitor / Vehicle Log'
    INCIDENT = 'INCIDENT', 'Incident Reference'
    PATROL = 'PATROL', 'Patrol Observation'
    EQUIPMENT = 'EQUIPMENT', 'Equipment Check Note'
    SUPERVISOR_INSTRUCTION = 'SUPERVISOR_INSTRUCTION', 'Supervisor Instruction'
    GENERAL = 'GENERAL', 'General Occurrence'


class DailyOccurrenceLog(BaseModel):
    """
    Phase S-7: Chronological operational site occurrence book (DOB).
    Preserves append-only historical integrity.
    """
    site = models.ForeignKey(OperationalSite, on_delete=models.CASCADE, related_name='occurrence_logs')
    post = models.ForeignKey('operations.SecurityPost', on_delete=models.SET_NULL, null=True, blank=True, related_name='occurrence_logs')
    shift = models.ForeignKey('hrm.Shift', on_delete=models.SET_NULL, null=True, blank=True, related_name='occurrence_logs')
    logged_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='logged_occurrences')
    employee = models.ForeignKey('hrm.Employee', on_delete=models.SET_NULL, null=True, blank=True, related_name='occurrence_logs')
    entry_type = models.CharField(max_length=40, choices=OccurrenceEntryType.choices, default=OccurrenceEntryType.GENERAL)
    timestamp = models.DateTimeField()
    title = models.CharField(max_length=200)
    details = models.TextField()
    incident_reference = models.ForeignKey(IncidentReport, on_delete=models.SET_NULL, null=True, blank=True, related_name='linked_occurrences')
    is_flagged = models.BooleanField(default=False)

    class Meta(BaseModel.Meta):
        ordering = ['-timestamp', '-created_at']

    def clean(self):
        super().clean()
        if self.site_id and str(self.site.company_id) != str(self.company_id):
            raise ValidationError({'site': 'Site must belong to the same company.'})
        if self.post_id and str(self.post.company_id) != str(self.company_id):
            raise ValidationError({'post': 'Post must belong to the same company.'})
        if self.shift_id and str(self.shift.company_id) != str(self.company_id):
            raise ValidationError({'shift': 'Shift must belong to the same company.'})
        if self.employee_id and str(self.employee.company_id) != str(self.company_id):
            raise ValidationError({'employee': 'Employee must belong to the same company.'})
        if self.pk:
            orig = DailyOccurrenceLog.objects.filter(pk=self.pk).first()
            if orig and not getattr(self, '_allow_log_mutation', False):
                if orig.details != self.details or orig.entry_type != self.entry_type or orig.site_id != self.site_id:
                    raise ValidationError("Daily occurrence log entries are append-only and cannot be altered.")

    def __str__(self):
        return f"DOB [{self.site.name}] {self.entry_type} @ {self.timestamp.strftime('%Y-%m-%d %H:%M')}"


class SiteCheckpoint(BaseModel):
    """
    Phase S-7: Configurable checkpoints within an operational site for patrols and guard tours.
    """
    site = models.ForeignKey(OperationalSite, on_delete=models.CASCADE, related_name='checkpoints')
    name = models.CharField(max_length=150)
    code = models.CharField(max_length=50)
    location_description = models.TextField(blank=True, default='')
    sequence_order = models.PositiveIntegerField(default=1)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    qr_code_tag = models.CharField(max_length=100, blank=True, default='')
    nfc_tag_id = models.CharField(max_length=100, blank=True, default='')
    is_active = models.BooleanField(default=True)

    class Meta(BaseModel.Meta):
        ordering = ['site', 'sequence_order', 'code']
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'site', 'code'],
                condition=models.Q(is_deleted=False),
                name='unique_active_checkpoint_code_per_site'
            )
        ]

    def clean(self):
        super().clean()
        if self.site_id and str(self.site.company_id) != str(self.company_id):
            raise ValidationError({'site': 'Site must belong to the same company.'})

    def __str__(self):
        return f"{self.code} - {self.name} ({self.site.name})"


class PatrolFrequency(models.TextChoices):
    HOURLY = 'HOURLY', 'Hourly'
    EVERY_2_HOURS = 'EVERY_2_HOURS', 'Every 2 Hours'
    PER_SHIFT = 'PER_SHIFT', 'Once Per Shift'
    CUSTOM = 'CUSTOM', 'Custom Schedule'


class PatrolPlan(BaseModel):
    """
    Phase S-7: Patrol plan by site, shift, route area, frequency, and assigned employee.
    """
    site = models.ForeignKey(OperationalSite, on_delete=models.CASCADE, related_name='patrol_plans')
    shift = models.ForeignKey('hrm.Shift', on_delete=models.SET_NULL, null=True, blank=True, related_name='patrol_plans')
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True, default='')
    assigned_employee = models.ForeignKey('hrm.Employee', on_delete=models.SET_NULL, null=True, blank=True, related_name='patrol_plans')
    frequency = models.CharField(max_length=30, choices=PatrolFrequency.choices, default=PatrolFrequency.HOURLY)
    estimated_duration_minutes = models.PositiveIntegerField(default=30)
    is_active = models.BooleanField(default=True)

    class Meta(BaseModel.Meta):
        ordering = ['site', 'name']

    def clean(self):
        super().clean()
        if self.site_id and str(self.site.company_id) != str(self.company_id):
            raise ValidationError({'site': 'Site must belong to the same company.'})
        if self.shift_id and str(self.shift.company_id) != str(self.company_id):
            raise ValidationError({'shift': 'Shift must belong to the same company.'})
        if self.assigned_employee_id and str(self.assigned_employee.company_id) != str(self.company_id):
            raise ValidationError({'assigned_employee': 'Employee must belong to the same company.'})

    def __str__(self):
        return f"Plan: {self.name} ({self.site.name} - {self.frequency})"


class PatrolRunStatus(models.TextChoices):
    PLANNED = 'PLANNED', 'Planned'
    IN_PROGRESS = 'IN_PROGRESS', 'In Progress'
    COMPLETED = 'COMPLETED', 'Completed'
    MISSED = 'MISSED', 'Missed'
    ABORTED = 'ABORTED', 'Aborted'


class PatrolRun(BaseModel):
    """
    Phase S-7: Patrol run tracking planned vs completed patrol executions.
    Does NOT create payroll or attendance from patrol records.
    """
    plan = models.ForeignKey(PatrolPlan, on_delete=models.SET_NULL, null=True, blank=True, related_name='runs')
    site = models.ForeignKey(OperationalSite, on_delete=models.CASCADE, related_name='patrol_runs')
    shift = models.ForeignKey('hrm.Shift', on_delete=models.SET_NULL, null=True, blank=True, related_name='patrol_runs')
    assigned_employee = models.ForeignKey('hrm.Employee', on_delete=models.SET_NULL, null=True, blank=True, related_name='patrol_runs')
    roster = models.ForeignKey('operations.DutyRoster', on_delete=models.SET_NULL, null=True, blank=True, related_name='patrol_runs')
    run_code = models.CharField(max_length=50, blank=True, default='')
    scheduled_start = models.DateTimeField()
    scheduled_end = models.DateTimeField(null=True, blank=True)
    actual_start = models.DateTimeField(null=True, blank=True)
    actual_end = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=PatrolRunStatus.choices, default=PatrolRunStatus.PLANNED)
    notes = models.TextField(blank=True, default='')
    completion_notes = models.TextField(blank=True, default='')

    class Meta(BaseModel.Meta):
        ordering = ['-scheduled_start', '-created_at']

    def clean(self):
        super().clean()
        if self.site_id and str(self.site.company_id) != str(self.company_id):
            raise ValidationError({'site': 'Site must belong to the same company.'})
        if self.assigned_employee_id and str(self.assigned_employee.company_id) != str(self.company_id):
            raise ValidationError({'assigned_employee': 'Employee must belong to the same company.'})

    def save(self, *args, **kwargs):
        self.clean()
        if not self.run_code:
            from erp_core.models import DocumentSequence
            from django.utils import timezone
            dt = self.scheduled_start if self.scheduled_start else timezone.now()
            prefix = f"PATROL-{dt.strftime('%Y%m')}"
            self.run_code = DocumentSequence.get_next_number(self.company, "PATROL_RUN", prefix)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.run_code or 'Patrol'} - {self.site.name} ({self.status})"


class GuardTourStatus(models.TextChoices):
    SCHEDULED = 'SCHEDULED', 'Scheduled'
    IN_PROGRESS = 'IN_PROGRESS', 'In Progress'
    COMPLETED = 'COMPLETED', 'Completed'
    MISSED = 'MISSED', 'Missed'
    ABORTED = 'ABORTED', 'Aborted'


class VerificationSource(models.TextChoices):
    MANUAL = 'MANUAL', 'Manual Verification'
    QR_CODE = 'QR_CODE', 'QR Code Scan'
    NFC = 'NFC', 'NFC Tag Touch'
    GPS = 'GPS', 'GPS Telemetry'


class GeofenceStatus(models.TextChoices):
    INSIDE_GEOFENCE = 'INSIDE_GEOFENCE', 'Inside Geofence'
    OUTSIDE_GEOFENCE = 'OUTSIDE_GEOFENCE', 'Outside Geofence'
    LOCATION_UNAVAILABLE = 'LOCATION_UNAVAILABLE', 'Location Unavailable'


class CheckpointEventStatus(models.TextChoices):
    VERIFIED = 'VERIFIED', 'Verified'
    MISSED = 'MISSED', 'Missed'
    SKIPPED = 'SKIPPED', 'Skipped'
    OUT_OF_SEQUENCE = 'OUT_OF_SEQUENCE', 'Out of Sequence'


class GuardTour(BaseModel):
    """
    Phase S-7: Guard tour execution along a sequence of checkpoints.
    """
    site = models.ForeignKey(OperationalSite, on_delete=models.CASCADE, related_name='guard_tours')
    patrol_run = models.ForeignKey(PatrolRun, on_delete=models.SET_NULL, null=True, blank=True, related_name='guard_tours')
    assigned_employee = models.ForeignKey('hrm.Employee', on_delete=models.SET_NULL, null=True, blank=True, related_name='guard_tours')
    shift = models.ForeignKey('hrm.Shift', on_delete=models.SET_NULL, null=True, blank=True, related_name='guard_tours')
    roster = models.ForeignKey('operations.DutyRoster', on_delete=models.SET_NULL, null=True, blank=True, related_name='guard_tours')
    tour_name = models.CharField(max_length=150)
    start_time = models.DateTimeField(null=True, blank=True)
    end_time = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=GuardTourStatus.choices, default=GuardTourStatus.SCHEDULED)
    total_checkpoints = models.PositiveIntegerField(default=0)
    completed_checkpoints = models.PositiveIntegerField(default=0)
    missed_checkpoints = models.PositiveIntegerField(default=0)
    completion_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0.00'))
    notes = models.TextField(blank=True, default='')

    class Meta(BaseModel.Meta):
        ordering = ['-created_at']

    def clean(self):
        super().clean()
        if self.site_id and str(self.site.company_id) != str(self.company_id):
            raise ValidationError({'site': 'Site must belong to the same company.'})
        if self.assigned_employee_id and str(self.assigned_employee.company_id) != str(self.company_id):
            raise ValidationError({'assigned_employee': 'Employee must belong to the same company.'})

    def __str__(self):
        return f"Tour: {self.tour_name} ({self.site.name}) - {self.status}"


class GuardTourEvent(BaseModel):
    """
    Phase S-7: Individual checkpoint visit record during a guard tour.
    Supports manual verification source first, ready for future QR/NFC/GPS integrations.
    """
    tour = models.ForeignKey(GuardTour, on_delete=models.CASCADE, related_name='events')
    checkpoint = models.ForeignKey(SiteCheckpoint, on_delete=models.RESTRICT, related_name='tour_events')
    verified_at = models.DateTimeField(null=True, blank=True)
    verification_source = models.CharField(max_length=20, choices=VerificationSource.choices, default=VerificationSource.MANUAL)
    verified_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='verified_tour_events')
    status = models.CharField(max_length=20, choices=CheckpointEventStatus.choices, default=CheckpointEventStatus.VERIFIED)
    notes = models.TextField(blank=True, default='')
    
    # Optional GPS location evidence
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    accuracy_meters = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    captured_at = models.DateTimeField(null=True, blank=True)
    geofence_status = models.CharField(max_length=30, choices=GeofenceStatus.choices, default=GeofenceStatus.LOCATION_UNAVAILABLE)

    class Meta(BaseModel.Meta):
        ordering = ['tour', 'checkpoint__sequence_order', 'created_at']

    def clean(self):
        super().clean()
        if self.tour_id and str(self.tour.company_id) != str(self.company_id):
            raise ValidationError({'tour': 'Tour must belong to the same company.'})
        if self.checkpoint_id and str(self.checkpoint.company_id) != str(self.company_id):
            raise ValidationError({'checkpoint': 'Checkpoint must belong to the same company.'})

    def __str__(self):
        return f"TourEvent: {self.checkpoint.name} ({self.status})"


class EmergencyType(models.TextChoices):
    PANIC_BUTTON = 'PANIC_BUTTON', 'Panic / SOS Button'
    ARMED_ASSAULT = 'ARMED_ASSAULT', 'Armed Assault / Attack'
    FIRE_EMERGENCY = 'FIRE_EMERGENCY', 'Fire Emergency'
    MEDICAL_EMERGENCY = 'MEDICAL_EMERGENCY', 'Medical Emergency'
    INTRUSION = 'INTRUSION', 'Intrusion / Breach'
    UNRESPONSIVE_GUARD = 'UNRESPONSIVE_GUARD', 'Unresponsive Guard'
    OTHER = 'OTHER', 'Other Critical Emergency'


class EmergencyStatus(models.TextChoices):
    TRIGGERED = 'TRIGGERED', 'Triggered'
    ACKNOWLEDGED = 'ACKNOWLEDGED', 'Acknowledged'
    RESPONDING = 'RESPONDING', 'Responding'
    RESOLVED = 'RESOLVED', 'Resolved'
    FALSE_ALARM = 'FALSE_ALARM', 'False Alarm'


class EmergencyEvent(BaseModel):
    """
    Phase S-7: Emergency / SOS alerts from operations personnel.
    """
    site = models.ForeignKey(OperationalSite, on_delete=models.CASCADE, related_name='emergency_events')
    post = models.ForeignKey('operations.SecurityPost', on_delete=models.SET_NULL, null=True, blank=True, related_name='emergency_events')
    employee = models.ForeignKey('hrm.Employee', on_delete=models.SET_NULL, null=True, blank=True, related_name='emergency_events')
    reported_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='reported_emergencies')
    event_type = models.CharField(max_length=30, choices=EmergencyType.choices, default=EmergencyType.PANIC_BUTTON)
    severity = models.CharField(max_length=20, default='CRITICAL')
    occurred_at = models.DateTimeField()
    description = models.TextField(blank=True, default='')
    status = models.CharField(max_length=20, choices=EmergencyStatus.choices, default=EmergencyStatus.TRIGGERED)
    
    # Optional GPS location evidence
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    accuracy_meters = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    location_source = models.CharField(max_length=50, blank=True, default='')
    geofence_status = models.CharField(max_length=30, choices=GeofenceStatus.choices, default=GeofenceStatus.LOCATION_UNAVAILABLE)

    # Response & Resolution
    acknowledged_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='acknowledged_emergencies')
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    assigned_responder = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_emergencies')
    response_notes = models.TextField(blank=True, default='')
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolution_summary = models.TextField(blank=True, default='')

    class Meta(BaseModel.Meta):
        ordering = ['-occurred_at', '-created_at']

    def clean(self):
        super().clean()
        if self.site_id and str(self.site.company_id) != str(self.company_id):
            raise ValidationError({'site': 'Site must belong to the same company.'})
        if self.employee_id and str(self.employee.company_id) != str(self.company_id):
            raise ValidationError({'employee': 'Employee must belong to the same company.'})

    def __str__(self):
        return f"SOS [{self.event_type}] @ {self.site.name} ({self.status})"


class InspectionRating(models.TextChoices):
    EXCELLENT = 'EXCELLENT', 'Excellent'
    SATISFACTORY = 'SATISFACTORY', 'Satisfactory'
    DEFICIENT = 'DEFICIENT', 'Deficient'


class SupervisorInspectionStatus(models.TextChoices):
    DRAFT = 'DRAFT', 'Draft'
    COMPLETED = 'COMPLETED', 'Completed'
    ACTION_REQUIRED = 'ACTION_REQUIRED', 'Action Required'


class SupervisorInspection(BaseModel):
    """
    Phase S-7: Field supervisor inspections linked to site, shift, post, and deployed staff.
    """
    site = models.ForeignKey(OperationalSite, on_delete=models.CASCADE, related_name='supervisor_inspections')
    post = models.ForeignKey('operations.SecurityPost', on_delete=models.SET_NULL, null=True, blank=True, related_name='supervisor_inspections')
    shift = models.ForeignKey('hrm.Shift', on_delete=models.SET_NULL, null=True, blank=True, related_name='supervisor_inspections')
    inspector = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.RESTRICT, related_name='supervisor_inspections')
    inspected_employee = models.ForeignKey('hrm.Employee', on_delete=models.SET_NULL, null=True, blank=True, related_name='inspected_supervisor_inspections')
    equipment = models.ForeignKey('inventory.Item', on_delete=models.SET_NULL, null=True, blank=True, related_name='inspected_supervisor_inspections')
    item_serial = models.ForeignKey('inventory.ItemSerial', on_delete=models.SET_NULL, null=True, blank=True, related_name='inspected_supervisor_inspections')
    inspection_datetime = models.DateTimeField()
    status = models.CharField(max_length=20, choices=SupervisorInspectionStatus.choices, default=SupervisorInspectionStatus.DRAFT)
    
    # Checklist verification items
    guard_presence_verified = models.BooleanField(default=True)
    uniform_condition = models.CharField(max_length=20, choices=InspectionRating.choices, default=InspectionRating.SATISFACTORY)
    equipment_condition = models.CharField(max_length=20, choices=InspectionRating.choices, default=InspectionRating.SATISFACTORY)
    post_cleanliness_condition = models.CharField(max_length=20, choices=InspectionRating.choices, default=InspectionRating.SATISFACTORY)
    documentation_in_order = models.BooleanField(default=True)
    turnout_and_bearing = models.CharField(max_length=20, choices=InspectionRating.choices, default=InspectionRating.SATISFACTORY)
    
    deficiencies_observed = models.TextField(blank=True, default='')
    corrective_action_required = models.TextField(blank=True, default='')
    notes = models.TextField(blank=True, default='')
    overall_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_supervisor_inspections')
    reviewed_at = models.DateTimeField(null=True, blank=True)
    policy = models.ForeignKey('operations.InspectionPolicy', on_delete=models.SET_NULL, null=True, blank=True, related_name='inspections')

    class Meta(BaseModel.Meta):
        ordering = ['-inspection_datetime', '-created_at']

    def clean(self):
        super().clean()
        if self.site_id and str(self.site.company_id) != str(self.company_id):
            raise ValidationError({'site': 'Site must belong to the same company.'})
        if self.inspected_employee_id and str(self.inspected_employee.company_id) != str(self.company_id):
            raise ValidationError({'inspected_employee': 'Inspected employee must belong to the same company.'})
        if self.equipment_id and str(self.equipment.company_id) != str(self.company_id):
            raise ValidationError({'equipment': 'Equipment must belong to the same company.'})
        if self.item_serial_id and str(self.item_serial.company_id) != str(self.company_id):
            raise ValidationError({'item_serial': 'Item serial must belong to the same company.'})

    def __str__(self):
        return f"Inspection: {self.site.name} @ {self.inspection_datetime.strftime('%Y-%m-%d %H:%M')} ({self.status})"


class EscalationSourceType(models.TextChoices):
    INCIDENT = 'INCIDENT', 'Incident Report'
    MISSED_PATROL = 'MISSED_PATROL', 'Missed Patrol / Tour'
    INSPECTION_FAILURE = 'INSPECTION_FAILURE', 'Supervisor Inspection Deficiency'
    EMERGENCY = 'EMERGENCY', 'Emergency / SOS Event'
    UNCOVERED_POST = 'UNCOVERED_POST', 'Uncovered Post'
    MANUAL = 'MANUAL', 'Manual Escalation'


class EscalationPriority(models.TextChoices):
    LOW = 'LOW', 'Low'
    MEDIUM = 'MEDIUM', 'Medium'
    HIGH = 'HIGH', 'High'
    CRITICAL = 'CRITICAL', 'Critical'


class EscalationStatus(models.TextChoices):
    OPEN = 'OPEN', 'Open'
    ACKNOWLEDGED = 'ACKNOWLEDGED', 'Acknowledged'
    IN_PROGRESS = 'IN_PROGRESS', 'In Progress'
    RESOLVED = 'RESOLVED', 'Resolved'
    CLOSED = 'CLOSED', 'Closed'


class OperationsEscalation(BaseModel):
    """
    Phase S-7: Operational escalation tracking for incidents, missed patrols, inspection deficiencies, and emergencies.
    """
    source_type = models.CharField(max_length=30, choices=EscalationSourceType.choices, default=EscalationSourceType.MANUAL)
    source_id = models.CharField(max_length=100, blank=True, default='')
    site = models.ForeignKey(OperationalSite, on_delete=models.CASCADE, related_name='escalations')
    title = models.CharField(max_length=200)
    description = models.TextField()
    priority = models.CharField(max_length=20, choices=EscalationPriority.choices, default=EscalationPriority.HIGH)
    status = models.CharField(max_length=20, choices=EscalationStatus.choices, default=EscalationStatus.OPEN)
    
    assigned_to = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_escalations')
    due_at = models.DateTimeField(null=True, blank=True)
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolution_notes = models.TextField(blank=True, default='')
    notification_sent = models.BooleanField(default=False)

    class Meta(BaseModel.Meta):
        ordering = ['-priority', '-created_at']

    def clean(self):
        super().clean()
        if self.site_id and str(self.site.company_id) != str(self.company_id):
            raise ValidationError({'site': 'Site must belong to the same company.'})

    def __str__(self):
        return f"Escalation [{self.priority}]: {self.title} ({self.status})"


class InspectionCriterionCode(models.TextChoices):
    GUARD_PRESENCE = 'GUARD_PRESENCE', 'Guard Presence Verified'
    UNIFORM_CONDITION = 'UNIFORM_CONDITION', 'Uniform Condition'
    EQUIPMENT_CONDITION = 'EQUIPMENT_CONDITION', 'Equipment Condition'
    POST_CLEANLINESS = 'POST_CLEANLINESS', 'Post Cleanliness Condition'
    DOCUMENTATION_ORDER = 'DOCUMENTATION_ORDER', 'Documentation In Order'
    TURNOUT_BEARING = 'TURNOUT_BEARING', 'Turnout and Bearing'


class InspectionPolicy(BaseModel):
    """
    Phase S-7.1: Tenant-configurable policy for supervisor inspection scoring,
    deduction weights, warning/escalation/critical thresholds, and effective dates.
    """
    name = models.CharField(max_length=120, default='Standard Inspection Policy')
    is_active = models.BooleanField(default=True)
    effective_from = models.DateField(default=timezone.now)
    effective_to = models.DateField(null=True, blank=True)

    base_score = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('100.00'))
    warning_threshold = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('85.00'))
    escalation_threshold = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('80.00'))
    critical_threshold = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('60.00'))

    # Severity overrides for escalations
    critical_priority = models.CharField(max_length=20, choices=EscalationPriority.choices, default=EscalationPriority.HIGH)
    escalation_priority = models.CharField(max_length=20, choices=EscalationPriority.choices, default=EscalationPriority.MEDIUM)
    warning_priority = models.CharField(max_length=20, choices=EscalationPriority.choices, default=EscalationPriority.LOW)

    class Meta(BaseModel.Meta):
        ordering = ['-effective_from', '-created_at']
        verbose_name = 'Inspection Policy'
        verbose_name_plural = 'Inspection Policies'

    def clean(self):
        super().clean()
        if self.effective_to and self.effective_from and self.effective_to < self.effective_from:
            raise ValidationError({'effective_to': 'Effective to date cannot be earlier than effective from date.'})
        if self.critical_threshold > self.escalation_threshold:
            raise ValidationError({'critical_threshold': 'Critical threshold cannot exceed escalation threshold.'})
        if self.escalation_threshold > self.warning_threshold:
            raise ValidationError({'escalation_threshold': 'Escalation threshold cannot exceed warning threshold.'})

    def __str__(self):
        return f"{self.name} (Escalation < {self.escalation_threshold}%, Critical < {self.critical_threshold}%)"


class InspectionCriterionPolicy(BaseModel):
    """
    Phase S-7.1: Tenant-configurable deduction weights per inspection checklist item.
    """
    policy = models.ForeignKey(InspectionPolicy, on_delete=models.CASCADE, related_name='criteria')
    criterion_code = models.CharField(max_length=50, choices=InspectionCriterionCode.choices)
    name = models.CharField(max_length=100, blank=True)
    deduction_weight = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('10.00'))
    is_active = models.BooleanField(default=True)

    class Meta(BaseModel.Meta):
        unique_together = ('policy', 'criterion_code')
        verbose_name = 'Inspection Criterion Policy'
        verbose_name_plural = 'Inspection Criterion Policies'

    def clean(self):
        super().clean()
        if self.policy_id and str(self.policy.company_id) != str(self.company_id):
            raise ValidationError({'policy': 'Policy must belong to the same company.'})

    def save(self, *args, **kwargs):
        if not self.name and self.criterion_code:
            self.name = self.get_criterion_code_display()
        if self.policy_id and not self.company_id:
            self.company_id = self.policy.company_id
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name or self.criterion_code}: -{self.deduction_weight} pts"




