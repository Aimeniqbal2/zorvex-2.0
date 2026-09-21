from datetime import date
from django.db import models
from django.conf import settings
from django.utils import timezone
from django.core.exceptions import ValidationError
from erp_core.models import BaseModel
from crm.mixins import CRMBridgeValidationMixin
from platform_core.models import Branch

class Department(BaseModel):
    name = models.CharField(max_length=255)

    class Meta:
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'name'],
                condition=models.Q(is_deleted=False),
                name='unique_active_company_department'
            )
        ]

    def __str__(self):
        return self.name

class Position(BaseModel):
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=30, blank=True, default='')
    description = models.TextField(blank=True, default='')
    department = models.ForeignKey(Department, on_delete=models.RESTRICT, null=True, blank=True, related_name='positions')
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'name'],
                condition=models.Q(is_deleted=False),
                name='unique_active_company_position_name'
            ),
            models.UniqueConstraint(
                fields=['company', 'code'],
                condition=models.Q(is_deleted=False) & ~models.Q(code=''),
                name='unique_active_company_position_code'
            )
        ]

    def clean(self):
        super().clean()
        if self.department_id and str(self.department.company_id) != str(self.company_id):
            raise ValidationError({'department': 'Department must belong to the same company.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name

class Designation(BaseModel):
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=30, blank=True, default='')
    description = models.TextField(blank=True, default='')
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'name'],
                condition=models.Q(is_deleted=False),
                name='unique_active_company_designation_name'
            ),
            models.UniqueConstraint(
                fields=['company', 'code'],
                condition=models.Q(is_deleted=False) & ~models.Q(code=''),
                name='unique_active_company_designation_code'
            )
        ]

    def __str__(self):
        return self.name

class Employee(BaseModel):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='employee_profile_new')
    crm_entity = models.ForeignKey('crm.CRMEntity', on_delete=models.RESTRICT, null=True, blank=True, related_name='employees')
    employee_code = models.CharField(max_length=50, blank=True, default='')
    first_name = models.CharField(max_length=200, help_text="Full Name of the employee")
    last_name = models.CharField(max_length=100, blank=True, default='')
    email = models.EmailField(blank=True, default='')
    phone = models.CharField(max_length=30, blank=True, default='')
    date_of_birth = models.DateField(null=True, blank=True)
    hire_date = models.DateField(null=True, blank=True)
    
    department = models.ForeignKey(Department, on_delete=models.SET_NULL, null=True, blank=True, related_name='active_employees')
    position = models.ForeignKey(Position, on_delete=models.SET_NULL, null=True, blank=True, related_name='active_employees')
    designation = models.ForeignKey(Designation, on_delete=models.SET_NULL, null=True, blank=True, related_name='active_employees')
    branch = models.ForeignKey(Branch, on_delete=models.SET_NULL, null=True, blank=True, related_name='active_employees')
    
    # Phase S-5A Additions
    classification = models.CharField(
        max_length=20,
        choices=[('DIRECT', 'Direct - Field / Operational'), ('INDIRECT', 'Indirect - Office / Management')],
        default='DIRECT',
        help_text="DIRECT = Field guards/supervisors, INDIRECT = Office/Management staff"
    )
    father_name = models.CharField(max_length=100, blank=True, default='')
    cnic_number = models.CharField(max_length=50, blank=True, default='')
    permanent_address = models.TextField(blank=True, default='')
    current_address = models.TextField(blank=True, default='')
    education = models.CharField(max_length=100, blank=True, default='')
    marital_status = models.CharField(
        max_length=20,
        choices=[('SINGLE', 'Single'), ('MARRIED', 'Married'), ('DIVORCED', 'Divorced'), ('WIDOWED', 'Widowed')],
        default='SINGLE'
    )
    background_type = models.CharField(
        max_length=20,
        choices=[('CIVILIAN', 'Civilian'), ('EX_ARMY', 'Ex-Army'), ('OTHER', 'Other')],
        default='CIVILIAN'
    )
    employment_status = models.CharField(
        max_length=20,
        choices=[('ACTIVE', 'Active'), ('INACTIVE', 'Inactive'), ('SUSPENDED', 'Suspended'), ('RESIGNED', 'Resigned'), ('TERMINATED', 'Terminated'), ('JUMP', 'Jump')],
        default='ACTIVE'
    )
    
    is_active = models.BooleanField(default=True)

    # Phase S-5H Lifecycle Dates
    confirmation_date = models.DateField(null=True, blank=True)
    resignation_date = models.DateField(null=True, blank=True)
    termination_date = models.DateField(null=True, blank=True)
    last_working_date = models.DateField(null=True, blank=True)
    rehire_date = models.DateField(null=True, blank=True)

    # Legacy & Extended Personal Details
    previous_employee_code = models.CharField(max_length=50, blank=True, default='', db_index=True)
    photograph = models.FileField(upload_to='hrm/employee_photos/', null=True, blank=True)
    gender = models.CharField(
        max_length=10,
        choices=[('MALE', 'Male'), ('FEMALE', 'Female'), ('OTHER', 'Other')],
        default='MALE'
    )
    place_of_birth = models.CharField(max_length=100, blank=True, default='')
    children_male = models.PositiveIntegerField(default=0)
    children_female = models.PositiveIntegerField(default=0)
    cnic_issue_date = models.DateField(null=True, blank=True)
    cnic_expiry_date = models.DateField(null=True, blank=True)
    telephone_number = models.CharField(max_length=30, blank=True, default='')
    caste = models.CharField(max_length=50, blank=True, default='')
    ntn_number = models.CharField(max_length=50, blank=True, default='')

    # Statutory & Insurance Registration Numbers
    eobi_number = models.CharField(max_length=50, blank=True, default='')
    sessi_number = models.CharField(max_length=50, blank=True, default='')
    insurance_policy_number = models.CharField(max_length=50, blank=True, default='')

    # Security Guard Specific Badges & Flags
    is_guard_vaccine = models.BooleanField(default=False)
    is_guard_apsa_verified = models.BooleanField(default=False)
    visible_for_activity = models.BooleanField(default=True)

    class Meta:
        ordering = ['first_name', 'last_name']
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'employee_code'],
                condition=models.Q(is_deleted=False) & ~models.Q(employee_code=''),
                name='unique_active_company_employee_code'
            )
        ]

    @property
    def joining_date(self):
        return self.hire_date

    @joining_date.setter
    def joining_date(self, value):
        self.hire_date = value

    @property
    def age(self):
        if not self.date_of_birth:
            return None
        from datetime import date
        today = date.today()
        return today.year - self.date_of_birth.year - ((today.month, today.day) < (self.date_of_birth.month, self.date_of_birth.day))

    @property
    def training_completed(self):
        return self.trainings.filter(status='COMPLETED', is_deleted=False).exists()

    @property
    def full_name(self):
        if self.last_name:
            return f"{self.first_name} {self.last_name}".strip()
        return (self.first_name or '').strip()

    @full_name.setter
    def full_name(self, value):
        self.first_name = (value or '').strip()
        self.last_name = ''

    @property
    def name(self):
        return self.full_name

    @name.setter
    def name(self, value):
        self.full_name = value

    def get_full_name(self):
        return self.full_name

    @property
    def workforce_type(self):
        return self.classification

    @workforce_type.setter
    def workforce_type(self, value):
        self.classification = value

    def clean(self):
        super().clean()
        if self.user_id and hasattr(self.user, 'company_id') and str(self.user.company_id) != str(self.company_id):
            raise ValidationError({'user': 'User must belong to the same company.'})
        if self.crm_entity_id and str(self.crm_entity.company_id) != str(self.company_id):
            raise ValidationError({'crm_entity': 'CRM Entity must belong to the same company.'})
        if self.department_id and str(self.department.company_id) != str(self.company_id):
            raise ValidationError({'department': 'Department must belong to the same company.'})
        if self.position_id and str(self.position.company_id) != str(self.company_id):
            raise ValidationError({'position': 'Position must belong to the same company.'})
        if self.designation_id and str(self.designation.company_id) != str(self.company_id):
            raise ValidationError({'designation': 'Designation must belong to the same company.'})
        if self.branch_id and str(self.branch.company_id) != str(self.company_id):
            raise ValidationError({'branch': 'Branch must belong to the same company.'})

    def save(self, *args, **kwargs):
        from erp_core.models import DocumentSequence
        if not self.employee_code and self.company_id:
            self.employee_code = DocumentSequence.get_next_number(self.company, "EMPLOYEE", "EMP")
        self.clean()
        
        # Track historical changes
        is_new = self._state.adding
        old_inst = None
        if not is_new and self.pk:
            try:
                old_inst = Employee.objects.get(pk=self.pk)
            except Employee.DoesNotExist:
                pass
                
        super().save(*args, **kwargs)

        if getattr(self, '_skip_history_log', False):
            return

        # Log history events if changed
        if not is_new and old_inst:
            changes = []
            if old_inst.cnic_number != self.cnic_number:
                changes.append(('CNIC_CHANGE', f"CNIC: {old_inst.cnic_number} -> {self.cnic_number}"))
            if old_inst.designation_id != self.designation_id:
                old_d = old_inst.designation.name if old_inst.designation else "None"
                new_d = self.designation.name if self.designation else "None"
                changes.append(('DESIGNATION_CHANGE', f"Designation: {old_d} -> {new_d}"))
            if old_inst.department_id != self.department_id:
                old_dept = old_inst.department.name if old_inst.department else "None"
                new_dept = self.department.name if self.department else "None"
                changes.append(('DEPARTMENT_CHANGE', f"Department: {old_dept} -> {new_dept}"))
            if old_inst.classification != self.classification:
                changes.append(('CLASSIFICATION_CHANGE', f"Classification: {old_inst.classification} -> {self.classification}"))
            if old_inst.employment_status != self.employment_status:
                changes.append(('STATUS_CHANGE', f"Status: {old_inst.employment_status} -> {self.employment_status}"))
            
            for event_type, msg in changes:
                EmploymentHistory.objects.create(
                    company=self.company,
                    employee=self,
                    event_type=event_type,
                    notes=msg
                )
        elif is_new:
            EmploymentHistory.objects.create(
                company=self.company,
                employee=self,
                event_type='JOINING',
                notes=f"Employee created with status {self.employment_status} and code {self.employee_code}"
            )

    def __str__(self):
        return f"{self.first_name} {self.last_name}".strip()


class EmployeeNextOfKin(BaseModel):
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='next_of_kin')
    name = models.CharField(max_length=255)
    cnic_number = models.CharField(max_length=50, blank=True, default='')
    relationship = models.CharField(max_length=100)
    contact_number = models.CharField(max_length=50)
    is_primary = models.BooleanField(default=True)
    notes = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-is_primary', 'name']

    def clean(self):
        super().clean()
        if self.employee_id and str(self.employee.company_id) != str(self.company_id):
            raise ValidationError({'employee': 'Employee must belong to the same company.'})

    def save(self, *args, **kwargs):
        self.clean()
        if self.is_primary and self.employee_id:
            EmployeeNextOfKin.objects.filter(company_id=self.company_id, employee_id=self.employee_id, is_primary=True, is_deleted=False).exclude(pk=self.pk).update(is_primary=False)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.relationship}) - {self.employee}"


class EmployeeReference(BaseModel):
    """
    Reference person details for security workforce verification.
    """
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='references')
    name = models.CharField(max_length=255)
    relationship = models.CharField(max_length=100, blank=True, default='')
    contact_number = models.CharField(max_length=50, blank=True, default='')
    cnic_number = models.CharField(max_length=50, blank=True, default='')
    address = models.TextField(blank=True, default='')
    remarks = models.TextField(blank=True, default='')
    is_verified = models.BooleanField(default=False)
    verified_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    verified_at = models.DateTimeField(null=True, blank=True)

    class Meta(BaseModel.Meta):
        ordering = ['name']

    def clean(self):
        super().clean()
        if self.employee_id and str(self.employee.company_id) != str(self.company_id):
            raise ValidationError({'employee': 'Employee must belong to the same company.'})
        if self.verified_by_id and hasattr(self.verified_by, 'company_id') and str(self.verified_by.company_id) != str(self.company_id):
            raise ValidationError({'verified_by': 'Verifier must belong to the same company.'})

    def __str__(self):
        return f"{self.name} (Ref for {self.employee})"


class EmployeeDocumentType(models.TextChoices):
    CNIC = 'CNIC', 'CNIC'
    POLICE_VERIFICATION = 'POLICE_VERIFICATION', 'Police Verification'
    OTHER_VERIFICATION = 'OTHER_VERIFICATION', 'Other Verification'
    CRO = 'CRO', 'Criminal Records Office (CRO)'
    NADRA_VERIFICATION = 'NADRA_VERIFICATION', 'NADRA Verification'
    FINGERPRINT = 'FINGERPRINT', 'Fingerprint Record'
    EMPLOYMENT_CONTRACT = 'EMPLOYMENT_CONTRACT', 'Employment Contract'
    TERMS_AND_CONDITIONS = 'TERMS_AND_CONDITIONS', 'Terms & Conditions'
    TRAINING_CERTIFICATE = 'TRAINING_CERTIFICATE', 'Training Certificate'
    EX_ARMY_DOCUMENT = 'EX_ARMY_DOCUMENT', 'Ex-Army Discharge/Document'
    EDUCATION_DOCUMENT = 'EDUCATION_DOCUMENT', 'Education Document'
    OTHER = 'OTHER', 'Other'

class DocumentVerificationStatus(models.TextChoices):
    PENDING = 'PENDING', 'Pending'
    UPLOADED = 'UPLOADED', 'Uploaded'
    VERIFIED = 'VERIFIED', 'Verified'
    REJECTED = 'REJECTED', 'Rejected'
    EXPIRED = 'EXPIRED', 'Expired'

class EmployeeDocument(BaseModel):
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='documents')
    document_type = models.CharField(max_length=50, choices=EmployeeDocumentType.choices)
    file = models.FileField(upload_to='hrm/employee_documents/', null=True, blank=True)
    document_number = models.CharField(max_length=100, blank=True, default='')
    issue_date = models.DateField(null=True, blank=True)
    expiry_date = models.DateField(null=True, blank=True)
    verification_status = models.CharField(max_length=30, choices=DocumentVerificationStatus.choices, default=DocumentVerificationStatus.PENDING)
    verified_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    verified_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True, default='')

    def clean(self):
        super().clean()
        if self.employee_id and str(self.employee.company_id) != str(self.company_id):
            raise ValidationError({'employee': 'Employee must belong to the same company.'})
        if self.verified_by_id and hasattr(self.verified_by, 'company_id') and str(self.verified_by.company_id) != str(self.company_id):
            raise ValidationError({'verified_by': 'Verifier must belong to the same company.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def verify(self, user, status_val='VERIFIED', notes_val=''):
        from django.utils import timezone
        self.verification_status = status_val
        self.verified_by = user
        self.verified_at = timezone.now()
        if notes_val:
            self.notes = notes_val
        self.save()
        EmploymentHistory.objects.create(
            company=self.company,
            employee=self.employee,
            event_type='DOCUMENT_VERIFICATION',
            old_value='PENDING',
            new_value=f"{self.document_type}: {status_val}",
            notes=notes_val or f"Document {self.document_type} verification updated to {status_val}",
            changed_by=user
        )

    def __str__(self):
        return f"{self.get_document_type_display()} - {self.employee}"


class EmployeeTraining(BaseModel):
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='trainings')
    training_type = models.CharField(max_length=100)
    training_date = models.DateField()
    institute_or_trainer = models.CharField(max_length=255, blank=True, default='')
    certificate = models.FileField(upload_to='hrm/training_certificates/', null=True, blank=True)
    expiry_date = models.DateField(null=True, blank=True)
    status = models.CharField(
        max_length=30,
        choices=[('SCHEDULED', 'Scheduled'), ('IN_PROGRESS', 'In Progress'), ('COMPLETED', 'Completed'), ('EXPIRED', 'Expired'), ('FAILED', 'Failed')],
        default='COMPLETED'
    )
    notes = models.TextField(blank=True, default='')

    def clean(self):
        super().clean()
        if self.employee_id and str(self.employee.company_id) != str(self.company_id):
            raise ValidationError({'employee': 'Employee must belong to the same company.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.training_type} - {self.employee} ({self.status})"


class EmploymentHistory(BaseModel):
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='history_logs')
    event_type = models.CharField(max_length=50)
    effective_date = models.DateField(default=date.today)
    old_value = models.TextField(blank=True, default='')
    new_value = models.TextField(blank=True, default='')
    notes = models.TextField(blank=True, default='')
    reason = models.TextField(blank=True, default='')
    changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['-created_at']

    def clean(self):
        super().clean()
        if self.employee_id and str(self.employee.company_id) != str(self.company_id):
            raise ValidationError({'employee': 'Employee must belong to the same company.'})
        if self.changed_by_id and hasattr(self.changed_by, 'company_id') and str(self.changed_by.company_id) != str(self.company_id):
            raise ValidationError({'changed_by': 'User must belong to the same company.'})
        if self.approved_by_id and hasattr(self.approved_by, 'company_id') and str(self.approved_by.company_id) != str(self.company_id):
            raise ValidationError({'approved_by': 'Approver must belong to the same company.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.event_type} - {self.employee} ({self.effective_date})"

class Employment(BaseModel):
    EMPLOYMENT_TYPE_CHOICES = [
        ('FULL_TIME', 'Full Time'),
        ('PART_TIME', 'Part Time'),
        ('CONTRACT', 'Contract'),
        ('INTERN', 'Internship'),
    ]
    EMPLOYMENT_STATUS_CHOICES = [
        ('ACTIVE', 'Active'),
        ('PROBATION', 'Probation'),
        ('ON_LEAVE', 'On Leave'),
        ('TERMINATED', 'Terminated'),
    ]

    employee = models.ForeignKey(Employee, on_delete=models.RESTRICT, related_name='employments')
    employment_type = models.CharField(max_length=20, choices=EMPLOYMENT_TYPE_CHOICES, default='FULL_TIME')
    employment_status = models.CharField(max_length=20, choices=EMPLOYMENT_STATUS_CHOICES, default='ACTIVE')
    
    department = models.ForeignKey(Department, on_delete=models.SET_NULL, null=True, blank=True)
    position = models.ForeignKey(Position, on_delete=models.SET_NULL, null=True, blank=True)
    designation = models.ForeignKey(Designation, on_delete=models.SET_NULL, null=True, blank=True)
    branch = models.ForeignKey(Branch, on_delete=models.SET_NULL, null=True, blank=True)
    
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True, default='')
    is_current = models.BooleanField(default=False)

    class Meta:
        ordering = ['-start_date']

    def clean(self):
        super().clean()
        if self.employee_id and str(self.employee.company_id) != str(self.company_id):
            raise ValidationError({'employee': 'Employee must belong to the same company.'})
        if self.department_id and str(self.department.company_id) != str(self.company_id):
            raise ValidationError({'department': 'Department must belong to the same company.'})
        if self.position_id and str(self.position.company_id) != str(self.company_id):
            raise ValidationError({'position': 'Position must belong to the same company.'})
        if self.designation_id and str(self.designation.company_id) != str(self.company_id):
            raise ValidationError({'designation': 'Designation must belong to the same company.'})
        if self.branch_id and str(self.branch.company_id) != str(self.company_id):
            raise ValidationError({'branch': 'Branch must belong to the same company.'})

        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValidationError({'end_date': 'End date cannot be earlier than start date.'})

    def save(self, *args, **kwargs):
        self.clean()
        if self.is_current and self.employee_id:
            Employment.objects.filter(employee_id=self.employee_id, is_current=True, is_deleted=False).exclude(pk=self.pk).update(is_current=False)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.employee} - {self.get_employment_type_display()} from {self.start_date}"

# ============================================================================
# LEGACY COMPATIBILITY MODELS (DO NOT DELETE)
# ============================================================================

class EmployeeRecord(CRMBridgeValidationMixin, BaseModel):
    employee = models.OneToOneField('Employee', on_delete=models.SET_NULL, null=True, blank=True, related_name='legacy_record')
    crm_entity = models.ForeignKey('crm.CRMEntity', null=True, blank=True, on_delete=models.RESTRICT)
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='employee_profile')
    department = models.ForeignKey(Department, on_delete=models.SET_NULL, null=True, related_name='employees')
    salary = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    hourly_rate = models.DecimalField(max_digits=8, decimal_places=2, default=0)

    def __str__(self):
        return f"Employee details for {self.user.username}"

    def clean(self):
        super().clean()
        if self.crm_entity_id and str(self.crm_entity.company_id) != str(self.company_id):
            raise ValidationError({'crm_entity': 'CRM Entity must belong to the same company.'})
        if self.department_id and str(self.department.company_id) != str(self.company_id):
            raise ValidationError({'department': 'Department must belong to the same company.'})
        if self.employee_id and str(self.employee.company_id) != str(self.company_id):
            raise ValidationError({'employee': 'Employee must belong to the same company.'})

    def save(self, *args, **kwargs):
        # -- Phase 4E: Auto-resolve CRM bridges --
        from crm.services.compatibility import get_crm_entity
        if not self.crm_entity_id:
            crm_obj = get_crm_entity(self)
            if crm_obj:
                self.crm_entity = crm_obj
        # ----------------------------------------
        self.clean()
        super().save(*args, **kwargs)

class Attendance(BaseModel):
    employee = models.ForeignKey(EmployeeRecord, on_delete=models.RESTRICT, related_name='attendance_records')
    workforce_attendance = models.OneToOneField('WorkforceAttendance', on_delete=models.SET_NULL, null=True, blank=True, related_name='legacy_attendance')
    date = models.DateField()
    check_in = models.TimeField(null=True, blank=True)
    check_out = models.TimeField(null=True, blank=True)
    
    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'employee', 'date'],
                condition=models.Q(is_deleted=False),
                name='unique_active_company_employee_date_attendance'
            )
        ]

    def clean(self):
        super().clean()
        if self.employee_id and str(self.employee.company_id) != str(self.company_id):
            raise ValidationError({'employee': 'EmployeeRecord must belong to the same company.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.employee.user.username} on {self.date}"

class AttendanceStatus(models.TextChoices):
    PRESENT = 'PRESENT', 'Present'
    ABSENT = 'ABSENT', 'Absent'
    PAID_LEAVE = 'PAID_LEAVE', 'Paid Leave'
    UNPAID_LEAVE = 'UNPAID_LEAVE', 'Unpaid Leave'
    HOLIDAY = 'HOLIDAY', 'Holiday'
    WEEKLY_OFF = 'WEEKLY_OFF', 'Weekly Off'
    HALF_DAY = 'HALF_DAY', 'Half Day'
    # Backward compatibility choices
    LATE = 'LATE', 'Late'
    ON_LEAVE = 'ON_LEAVE', 'On Leave'
    OFF_DAY = 'OFF_DAY', 'Off Day'

class WorkforceAttendance(BaseModel):
    employee = models.ForeignKey(Employee, on_delete=models.RESTRICT, related_name='workforce_attendance')
    employment = models.ForeignKey(Employment, on_delete=models.SET_NULL, null=True, blank=True, related_name='workforce_attendance')
    date = models.DateField()
    check_in = models.DateTimeField(null=True, blank=True)
    check_out = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=AttendanceStatus.choices, default=AttendanceStatus.PRESENT)
    notes = models.TextField(blank=True, default='')
    source = models.CharField(max_length=50, blank=True, default='CENTRAL_OFFICE')

    # Phase S-5D Additions
    duty_roster = models.ForeignKey('operations.DutyRoster', on_delete=models.SET_NULL, null=True, blank=True, related_name='workforce_attendances')
    site = models.ForeignKey('operations.OperationalSite', on_delete=models.SET_NULL, null=True, blank=True, related_name='workforce_attendances')
    post = models.ForeignKey('operations.SecurityPost', on_delete=models.SET_NULL, null=True, blank=True, related_name='workforce_attendances')
    shift = models.ForeignKey('hrm.Shift', on_delete=models.SET_NULL, null=True, blank=True, related_name='workforce_attendances')
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='recorded_workforce_attendances')
    finalized_at = models.DateTimeField(null=True, blank=True)
    is_finalized = models.BooleanField(default=True)
    
    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'employee', 'date'],
                condition=models.Q(is_deleted=False),
                name='unique_active_workforce_attendance'
            )
        ]
        
    def clean(self):
        super().clean()
        if self.employee_id and str(self.employee.company_id) != str(self.company_id):
            raise ValidationError({'employee': 'Employee must belong to the same company.'})
        if self.employment_id and str(self.employment.company_id) != str(self.company_id):
            raise ValidationError({'employment': 'Employment must belong to the same company.'})
        if self.employment_id and self.employee_id and self.employment.employee_id != self.employee_id:
            raise ValidationError({'employment': 'Employment must belong to the given employee.'})
        if self.duty_roster_id and str(self.duty_roster.company_id) != str(self.company_id):
            raise ValidationError({'duty_roster': 'Duty roster must belong to the same company.'})
        if self.site_id and str(self.site.company_id) != str(self.company_id):
            raise ValidationError({'site': 'Site must belong to the same company.'})
        if self.post_id and str(self.post.company_id) != str(self.company_id):
            raise ValidationError({'post': 'Security post must belong to the same company.'})
        if self.shift_id and str(self.shift.company_id) != str(self.company_id):
            raise ValidationError({'shift': 'Shift must belong to the same company.'})
        if self.check_in and self.check_out and self.check_out < self.check_in:
            raise ValidationError({'check_out': 'Check out cannot be before check in.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.employee} - {self.date} ({self.status})"


class EmployeeAttendanceState(BaseModel):
    """
    Phase S-5D Persistent State Engine:
    PRESENT remains the employee's default daily state until explicitly changed.
    ABSENT remains the default daily state until explicitly changed again.
    """
    employee = models.OneToOneField(Employee, on_delete=models.CASCADE, related_name='attendance_state')
    current_state = models.CharField(
        max_length=20,
        choices=[('PRESENT', 'Present'), ('ABSENT', 'Absent')],
        default='PRESENT'
    )
    effective_from = models.DateField(default=timezone.now)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='updated_attendance_states')
    notes = models.TextField(blank=True, default='')

    def clean(self):
        super().clean()
        if self.employee_id and str(self.employee.company_id) != str(self.company_id):
            raise ValidationError({'employee': 'Employee must belong to the same company.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.employee} - {self.current_state} (effective {self.effective_from})"


class JumpRecordStatus(models.TextChoices):
    ACTIVE_JUMP = 'ACTIVE_JUMP', 'Active JUMP'
    RESTORED = 'RESTORED', 'Restored'
    ACKNOWLEDGED = 'ACKNOWLEDGED', 'Acknowledged'
    RESIGNED = 'RESIGNED', 'Resigned'
    TERMINATED = 'TERMINATED', 'Terminated'
    OTHER = 'OTHER', 'Other'


class JumpRecord(BaseModel):
    """
    Phase S-5D: 7-Day Consecutive Absence JUMP tracking.
    7 consecutive true ABSENT days -> Employee status = JUMP.
    Preserves audit history when employee is returned/reinstated to ACTIVE.
    """
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='jump_records')
    absent_since = models.DateField()
    jump_triggered_at = models.DateTimeField(default=timezone.now)
    consecutive_absent_days = models.PositiveIntegerField(default=7)
    reason = models.TextField(blank=True, default='7 consecutive unexcused absent days')
    status = models.CharField(max_length=20, choices=JumpRecordStatus.choices, default=JumpRecordStatus.ACTIVE_JUMP)
    
    # Return / Reinstatement Tracking
    reinstated_at = models.DateTimeField(null=True, blank=True)
    reinstated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='reinstated_jumps')
    reinstatement_notes = models.TextField(blank=True, default='')

    # Phase S-5H HR Resolution Tracking
    resolution_type = models.CharField(max_length=30, blank=True, default='')
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='resolved_jumps')
    resolution_notes = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-jump_triggered_at']

    def clean(self):
        super().clean()
        if self.employee_id and str(self.employee.company_id) != str(self.company_id):
            raise ValidationError({'employee': 'Employee must belong to the same company.'})
        if self.resolved_by_id and hasattr(self.resolved_by, 'company_id') and str(self.resolved_by.company_id) != str(self.company_id):
            raise ValidationError({'resolved_by': 'User must belong to the same company.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"JUMP: {self.employee} (Since {self.absent_since}, Status: {self.status})"

class Shift(BaseModel):
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=30)
    start_time = models.TimeField()
    end_time = models.TimeField()
    break_duration = models.DurationField(null=True, blank=True)
    grace_period = models.DurationField(null=True, blank=True)
    is_overnight = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    
    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'name'],
                condition=models.Q(is_deleted=False),
                name='unique_active_shift_name'
            ),
            models.UniqueConstraint(
                fields=['company', 'code'],
                condition=models.Q(is_deleted=False),
                name='unique_active_shift_code'
            )
        ]
        
    def clean(self):
        super().clean()
        if self.start_time and self.end_time:
            if self.start_time > self.end_time and not self.is_overnight:
                raise ValidationError({'is_overnight': 'Shift must be overnight if start time > end time.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    @property
    def duration_hours(self):
        if not self.start_time or not self.end_time:
            return 0.0
        import datetime
        t1 = datetime.datetime.combine(datetime.date.today(), self.start_time)
        t2 = datetime.datetime.combine(datetime.date.today(), self.end_time)
        if self.is_overnight or self.start_time > self.end_time:
            t2 += datetime.timedelta(days=1)
        diff = t2 - t1
        if self.break_duration:
            diff -= self.break_duration
        return round(max(0.0, diff.total_seconds() / 3600.0), 2)

    def __str__(self):
        return self.name

class WorkSchedule(BaseModel):
    employee = models.ForeignKey(Employee, on_delete=models.RESTRICT, related_name='work_schedules')
    employment = models.ForeignKey(Employment, on_delete=models.SET_NULL, null=True, blank=True)
    shift = models.ForeignKey(Shift, on_delete=models.RESTRICT)
    effective_from = models.DateField()
    effective_to = models.DateField(null=True, blank=True)
    days_of_week = models.JSONField(default=list)
    is_active = models.BooleanField(default=True)
    
    def clean(self):
        super().clean()
        if self.employee_id and str(self.employee.company_id) != str(self.company_id):
            raise ValidationError({'employee': 'Employee must belong to the same company.'})
        if self.employment_id and str(self.employment.company_id) != str(self.company_id):
            raise ValidationError({'employment': 'Employment must belong to the same company.'})
        if self.shift_id and str(self.shift.company_id) != str(self.company_id):
            raise ValidationError({'shift': 'Shift must belong to the same company.'})
        if self.effective_from and self.effective_to and self.effective_to < self.effective_from:
            raise ValidationError({'effective_to': 'Effective to cannot be before effective from.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

class LeaveType(BaseModel):
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=30)
    description = models.TextField(blank=True, default='')
    is_paid = models.BooleanField(default=True)
    annual_allocation = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    carry_forward_allowed = models.BooleanField(default=False)
    max_carry_forward = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    requires_approval = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'name'],
                condition=models.Q(is_deleted=False),
                name='unique_active_leave_type_name'
            ),
            models.UniqueConstraint(
                fields=['company', 'code'],
                condition=models.Q(is_deleted=False),
                name='unique_active_leave_type_code'
            )
        ]

    def __str__(self):
        return self.name

class LeaveBalance(BaseModel):
    employee = models.ForeignKey(Employee, on_delete=models.RESTRICT, related_name='leave_balances')
    employment = models.ForeignKey(Employment, on_delete=models.SET_NULL, null=True, blank=True)
    leave_type = models.ForeignKey(LeaveType, on_delete=models.RESTRICT)
    year = models.IntegerField()
    allocated = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    carried_forward = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    used = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    pending = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    remaining = models.DecimalField(max_digits=5, decimal_places=2, default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'employee', 'leave_type', 'year'],
                condition=models.Q(is_deleted=False),
                name='unique_active_leave_balance'
            )
        ]

    def clean(self):
        super().clean()
        if self.employee_id and str(self.employee.company_id) != str(self.company_id):
            raise ValidationError({'employee': 'Employee must belong to the same company.'})
        if self.leave_type_id and str(self.leave_type.company_id) != str(self.company_id):
            raise ValidationError({'leave_type': 'Leave type must belong to the same company.'})
        
        self.remaining = (self.allocated or 0) + (self.carried_forward or 0) - (self.used or 0) - (self.pending or 0)

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

class LeaveRequestStatus(models.TextChoices):
    DRAFT = 'DRAFT', 'Draft'
    PENDING = 'PENDING', 'Pending'
    APPROVED = 'APPROVED', 'Approved'
    REJECTED = 'REJECTED', 'Rejected'
    CANCELLED = 'CANCELLED', 'Cancelled'

class LeaveRequest(BaseModel):
    employee = models.ForeignKey(Employee, on_delete=models.RESTRICT, related_name='leave_requests')
    employment = models.ForeignKey(Employment, on_delete=models.SET_NULL, null=True, blank=True)
    leave_type = models.ForeignKey(LeaveType, on_delete=models.RESTRICT)
    start_date = models.DateField()
    end_date = models.DateField()
    requested_days = models.DecimalField(max_digits=5, decimal_places=2)
    reason = models.TextField(blank=True, default='')
    status = models.CharField(max_length=20, choices=LeaveRequestStatus.choices, default=LeaveRequestStatus.PENDING)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_leaves')
    approved_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True, default='')
    
    def clean(self):
        super().clean()
        if self.employee_id and str(self.employee.company_id) != str(self.company_id):
            raise ValidationError({'employee': 'Employee must belong to the same company.'})
        if self.leave_type_id and str(self.leave_type.company_id) != str(self.company_id):
            raise ValidationError({'leave_type': 'Leave type must belong to the same company.'})
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValidationError({'end_date': 'End date cannot be earlier than start date.'})
        if self.approved_by_id and hasattr(self.approved_by, "company_id") and str(self.approved_by.company_id) != str(self.company_id):
            raise ValidationError({'approved_by': 'Approver must belong to the same company.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

class Holiday(BaseModel):
    name = models.CharField(max_length=100)
    date = models.DateField()
    description = models.TextField(blank=True, default='')
    is_optional = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    
    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'date'],
                condition=models.Q(is_deleted=False),
                name='unique_active_holiday_date'
            )
        ]

class OvertimeStatus(models.TextChoices):
    DRAFT = 'DRAFT', 'Draft'
    PENDING = 'PENDING', 'Pending'
    APPROVED = 'APPROVED', 'Approved'
    PROCESSED = 'PROCESSED', 'Processed'
    REJECTED = 'REJECTED', 'Rejected'
    CANCELLED = 'CANCELLED', 'Cancelled'

class OvertimeType(models.TextChoices):
    SINGLE_OT = 'SINGLE_OT', 'Single Overtime'
    DOUBLE_OT = 'DOUBLE_OT', 'Double Overtime'

class OvertimeRecord(BaseModel):
    employee = models.ForeignKey(Employee, on_delete=models.RESTRICT, related_name='overtime_records')
    employment = models.ForeignKey(Employment, on_delete=models.SET_NULL, null=True, blank=True)
    attendance = models.ForeignKey(WorkforceAttendance, on_delete=models.RESTRICT, null=True, blank=True)
    date = models.DateField()
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)
    hours = models.DecimalField(max_digits=5, decimal_places=2)
    ot_type = models.CharField(max_length=20, choices=OvertimeType.choices, default=OvertimeType.SINGLE_OT)
    rate_override = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, default=None)
    hourly_rate = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    payable_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    source = models.CharField(max_length=50, default='MANUAL')
    site = models.ForeignKey('operations.OperationalSite', on_delete=models.SET_NULL, null=True, blank=True, related_name='overtime_records')
    post = models.ForeignKey('operations.SecurityPost', on_delete=models.SET_NULL, null=True, blank=True, related_name='overtime_records')
    reason = models.TextField(blank=True, default='')
    status = models.CharField(max_length=20, choices=OvertimeStatus.choices, default=OvertimeStatus.PENDING)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_overtime')
    approved_at = models.DateTimeField(null=True, blank=True)
    processed_payslip = models.ForeignKey('Payslip', on_delete=models.SET_NULL, null=True, blank=True, related_name='processed_overtimes')
    is_frozen = models.BooleanField(default=False)
    
    def clean(self):
        super().clean()
        if self.pk:
            orig = OvertimeRecord.objects.filter(pk=self.pk).values('is_frozen').first()
            if orig and orig.get('is_frozen') and not getattr(self, '_allow_frozen_update', False):
                raise ValidationError('Cannot modify a frozen overtime record consumed by finalized payroll.')
        if self.employee_id and str(self.employee.company_id) != str(self.company_id):
            raise ValidationError({'employee': 'Employee must belong to the same company.'})
        if self.attendance_id and str(self.attendance.company_id) != str(self.company_id):
            raise ValidationError({'attendance': 'Attendance must belong to the same company.'})
        if self.attendance_id and self.attendance.employee_id != self.employee_id:
            raise ValidationError({'attendance': 'Attendance must belong to the same employee.'})
        if self.start_time and self.end_time and self.end_time <= self.start_time:
            raise ValidationError({'end_time': 'End time must be after start time.'})
        if self.approved_by_id and hasattr(self.approved_by, "company_id") and str(self.approved_by.company_id) != str(self.company_id):
            raise ValidationError({'approved_by': 'Approver must belong to the same company.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)


# ============================================================================
# PHASE 7D: UNIVERSAL PAYROLL FOUNDATION
# ============================================================================

class ComponentType(models.TextChoices):
    EARNING = 'EARNING', 'Earning'
    DEDUCTION = 'DEDUCTION', 'Deduction'
    TAX = 'TAX', 'Tax'

class CalculationType(models.TextChoices):
    FIXED = 'FIXED', 'Fixed Amount'
    PERCENTAGE = 'PERCENTAGE', 'Percentage'
    FORMULA = 'FORMULA', 'Formula'

class SalaryComponent(BaseModel):
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=30)
    description = models.TextField(blank=True, default='')
    component_type = models.CharField(max_length=20, choices=ComponentType.choices, default=ComponentType.EARNING)
    calculation_type = models.CharField(max_length=20, choices=CalculationType.choices, default=CalculationType.FIXED)
    is_taxable = models.BooleanField(default=True)
    is_recurring = models.BooleanField(default=True)
    display_order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['display_order', 'name']
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'code'],
                condition=models.Q(is_deleted=False),
                name='unique_active_salary_component_code'
            )
        ]

    def __str__(self):
        return f"{self.name} ({self.code})"

class SalaryStructure(BaseModel):
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=30)
    description = models.TextField(blank=True, default='')
    currency = models.ForeignKey('finance.Currency', on_delete=models.RESTRICT)
    effective_from = models.DateField()
    effective_to = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['-effective_from']
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'code'],
                condition=models.Q(is_deleted=False),
                name='unique_active_salary_structure_code'
            )
        ]

    def clean(self):
        super().clean()
        if self.currency_id and str(self.currency.company_id) != str(self.company_id):
            raise ValidationError({'currency': 'Currency must belong to the same company.'})
        if self.effective_from and self.effective_to and self.effective_to < self.effective_from:
            raise ValidationError({'effective_to': 'Effective to cannot be before effective from.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.code})"

class SalaryStructureComponent(BaseModel):
    salary_structure = models.ForeignKey(SalaryStructure, on_delete=models.CASCADE, related_name='components')
    salary_component = models.ForeignKey(SalaryComponent, on_delete=models.RESTRICT, related_name='structure_components')
    sequence = models.IntegerField(default=0)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    formula = models.TextField(blank=True, default='')
    effective_from = models.DateField(null=True, blank=True)
    effective_to = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['sequence']

    def clean(self):
        super().clean()
        if self.salary_structure_id and str(self.salary_structure.company_id) != str(self.company_id):
            raise ValidationError({'salary_structure': 'Salary structure must belong to the same company.'})
        if self.salary_component_id and str(self.salary_component.company_id) != str(self.company_id):
            raise ValidationError({'salary_component': 'Salary component must belong to the same company.'})
        if self.effective_from and self.effective_to and self.effective_to < self.effective_from:
            raise ValidationError({'effective_to': 'Effective to cannot be before effective from.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.salary_structure} - {self.salary_component}"


class EmployeeSalaryAssignment(BaseModel):
    employee = models.ForeignKey('Employee', on_delete=models.RESTRICT, related_name='salary_assignments')
    employment = models.ForeignKey('Employment', on_delete=models.SET_NULL, null=True, blank=True, related_name='salary_assignments')
    salary_structure = models.ForeignKey(SalaryStructure, null=True, blank=True, on_delete=models.RESTRICT)
    currency = models.ForeignKey('finance.Currency', on_delete=models.RESTRICT)
    base_salary = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    daily_rate = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True, default=None,
        help_text="Explicit daily payable duty rate if applicable. Overrides monthly base salary calculation."
    )
    single_ot_rate = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    double_ot_rate = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    effective_from = models.DateField()
    effective_to = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, default='ACTIVE')
    notes = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-effective_from']

    @classmethod
    def resolve_compensation(cls, company, employee, on_date=None):
        from datetime import date
        if on_date is None:
            on_date = date.today()
        return cls.objects.filter(
            company=company,
            employee=employee,
            status='ACTIVE',
            effective_from__lte=on_date,
            is_deleted=False
        ).filter(
            models.Q(effective_to__isnull=True) | models.Q(effective_to__gte=on_date)
        ).order_by('-effective_from').first()

    def clean(self):
        super().clean()
        if self.employee_id and str(self.employee.company_id) != str(self.company_id):
            raise ValidationError({'employee': 'Employee must belong to the same company.'})
        if self.employment_id and str(self.employment.company_id) != str(self.company_id):
            raise ValidationError({'employment': 'Employment must belong to the same company.'})
        if self.employment_id and self.employee_id and self.employment.employee_id != self.employee_id:
            raise ValidationError({'employment': 'Employment must belong to the given employee.'})
        if self.salary_structure_id and str(self.salary_structure.company_id) != str(self.company_id):
            raise ValidationError({'salary_structure': 'Salary structure must belong to the same company.'})
        if self.currency_id and str(self.currency.company_id) != str(self.company_id):
            raise ValidationError({'currency': 'Currency must belong to the same company.'})
        if self.effective_from and self.effective_to and self.effective_to < self.effective_from:
            raise ValidationError({'effective_to': 'Effective to cannot be before effective from.'})
        
        # Check overlapping active assignments
        if self.status == 'ACTIVE' and self.employee_id and self.effective_from:
            qs = EmployeeSalaryAssignment.objects.filter(
                company_id=self.company_id,
                employee_id=self.employee_id,
                status='ACTIVE',
                is_deleted=False
            ).exclude(pk=self.pk)
            for other in qs:
                if not (
                    (self.effective_to and other.effective_from and self.effective_to < other.effective_from) or
                    (self.effective_from and other.effective_to and self.effective_from > other.effective_to)
                ):
                    raise ValidationError('Overlapping active salary assignments are not allowed for the same employee.')

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)
        if self.employee_id and self.company_id:
            msg = f"Salary/OT updated - Base Salary: {self.base_salary}, Single OT: {self.single_ot_rate}, Double OT: {self.double_ot_rate} (Effective {self.effective_from})"
            try:
                EmploymentHistory.objects.create(
                    company=self.company,
                    employee=self.employee,
                    event_type='SALARY_CHANGE',
                    notes=msg
                )
            except Exception:
                pass

    def __str__(self):
        return f"{self.employee} - {self.salary_structure.name} ({self.base_salary})"


class PayrollPeriodStatus(models.TextChoices):
    DRAFT = 'DRAFT', 'Draft'
    OPEN = 'OPEN', 'Open'
    PROCESSING = 'PROCESSING', 'Processing'
    CLOSED = 'CLOSED', 'Closed'

class PayrollPeriod(BaseModel):
    name = models.CharField(max_length=100)
    start_date = models.DateField()
    end_date = models.DateField()
    payment_date = models.DateField()
    status = models.CharField(max_length=20, choices=PayrollPeriodStatus.choices, default=PayrollPeriodStatus.DRAFT)

    class Meta:
        ordering = ['-start_date']

    def clean(self):
        super().clean()
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValidationError({'end_date': 'End date cannot be earlier than start date.'})
        if self.payment_date and self.end_date and self.payment_date < self.end_date:
            raise ValidationError({'payment_date': 'Payment date cannot be earlier than end date.'})
        
        # Overlap prevention
        if self.start_date and self.end_date and self.status != PayrollPeriodStatus.CLOSED:
            qs = PayrollPeriod.objects.filter(
                company_id=self.company_id,
                is_deleted=False
            ).exclude(status=PayrollPeriodStatus.CLOSED).exclude(pk=self.pk)
            for other in qs:
                if not (self.end_date < other.start_date or self.start_date > other.end_date):
                    raise ValidationError('Overlapping active payroll periods are not allowed.')

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.start_date} to {self.end_date})"


class PayrollRunStatus(models.TextChoices):
    DRAFT = 'DRAFT', 'Draft'
    PROCESSING = 'PROCESSING', 'Processing'
    CALCULATED = 'CALCULATED', 'Calculated'
    UNDER_REVIEW = 'UNDER_REVIEW', 'Under Review'
    APPROVED = 'APPROVED', 'Approved'
    FINALIZED = 'FINALIZED', 'Finalized'
    CANCELLED = 'CANCELLED', 'Cancelled'

class PayrollRun(BaseModel):
    payroll_period = models.ForeignKey(PayrollPeriod, on_delete=models.RESTRICT, related_name='runs', null=True, blank=True)
    run_number = models.CharField(max_length=50)
    status = models.CharField(max_length=20, choices=PayrollRunStatus.choices, default=PayrollRunStatus.DRAFT)
    
    # Phase S-5G Core Run Dimensions
    period_start = models.DateField(null=True, blank=True, db_index=True)
    period_end = models.DateField(null=True, blank=True, db_index=True)
    payroll_month = models.CharField(max_length=20, blank=True, default='')
    employee_count = models.PositiveIntegerField(default=0)
    gross_earnings = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    employee_deductions = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    employer_statutory_contribution = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    net_payroll = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    # Workflow Audit Trail & Timestamps
    prepared_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='prepared_payrolls')
    prepared_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_payrolls')
    reviewed_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_payrolls')
    approved_at = models.DateTimeField(null=True, blank=True)
    finalized_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='finalized_payrolls')
    finalized_at = models.DateTimeField(null=True, blank=True)
    processed_at = models.DateTimeField(null=True, blank=True)

    advances_settled = models.BooleanField(default=False)
    notes = models.TextField(blank=True, default='')
    journal_entry = models.ForeignKey('finance.JournalEntry', on_delete=models.RESTRICT, null=True, blank=True, related_name='payroll_runs')

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'run_number'],
                condition=models.Q(is_deleted=False),
                name='unique_active_payroll_run_number'
            )
        ]

    def clean(self):
        super().clean()
        if self.payroll_period_id and str(self.payroll_period.company_id) != str(self.company_id):
            raise ValidationError({'payroll_period': 'Payroll period must belong to the same company.'})
        
        # In a finalized run, don't allow modifying core fields
        if self.pk:
            try:
                orig = PayrollRun.objects.get(pk=self.pk)
                if orig.status == PayrollRunStatus.FINALIZED and self.status != PayrollRunStatus.FINALIZED:
                     raise ValidationError({'status': 'Cannot un-finalize a finalized payroll run.'})
            except PayrollRun.DoesNotExist:
                pass

    def save(self, *args, **kwargs):
        from erp_core.models import DocumentSequence
        if not self.run_number:
            p_date = self.period_start or (self.payroll_period.start_date if self.payroll_period else timezone.now().date())
            prefix = f"PR-{p_date.strftime('%Y%m')}"
            self.run_number = DocumentSequence.get_next_number(self.company, "PAYROLL_RUN", prefix)
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        period_label = self.payroll_period.name if self.payroll_period else f"{self.period_start} to {self.period_end}"
        return f"{self.run_number} - {period_label} [{self.status}]"


class PayslipStatus(models.TextChoices):
    DRAFT = 'DRAFT', 'Draft'
    CALCULATED = 'CALCULATED', 'Calculated'
    FINALIZED = 'FINALIZED', 'Finalized'
    PAID = 'PAID', 'Paid'

class Payslip(BaseModel):
    payroll_run = models.ForeignKey(PayrollRun, on_delete=models.RESTRICT, related_name='payslips')
    employee = models.ForeignKey('Employee', on_delete=models.RESTRICT, related_name='payslips')
    employment = models.ForeignKey('Employment', on_delete=models.SET_NULL, null=True, blank=True)
    salary_assignment = models.ForeignKey(EmployeeSalaryAssignment, on_delete=models.RESTRICT, null=True, blank=True)
    payslip_number = models.CharField(max_length=50)
    status = models.CharField(max_length=20, choices=PayslipStatus.choices, default=PayslipStatus.DRAFT)
    currency = models.ForeignKey('finance.Currency', on_delete=models.RESTRICT, null=True, blank=True)
    gross_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    deduction_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    net_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    # Phase S-5G Rich Snapshot Dimensions
    period_start = models.DateField(null=True, blank=True)
    period_end = models.DateField(null=True, blank=True)
    duty_earnings = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    single_ot_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    double_ot_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    allowances_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    bonuses_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    other_additions_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    # Independent Deductions
    eobi_employee_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    eobi_employer_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    sessi_employee_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    sessi_employer_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    pessi_employee_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    pessi_employer_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    patrolling_deduction = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    insurance_deduction = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    advance_recovery_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    other_deductions_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total_statutory_deductions = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_employer_statutory = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    # Snapshots & Immutability Locks
    rate_snapshot = models.JSONField(default=dict, blank=True)
    lines_snapshot = models.JSONField(default=list, blank=True)
    operational_calculation = models.ForeignKey('operations.EmployeePayrollCalculation', null=True, blank=True, on_delete=models.SET_NULL, related_name='payslips')
    is_frozen = models.BooleanField(default=False)

    # Payment Hold / Stop Payment
    is_stop_payment = models.BooleanField(default=False, db_index=True)
    stop_payment_reason = models.TextField(blank=True, default='')
    stop_payment_at = models.DateTimeField(null=True, blank=True)
    stop_payment_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'payslip_number'],
                condition=models.Q(is_deleted=False),
                name='unique_active_payslip_number'
            ),
            models.UniqueConstraint(
                fields=['company', 'payroll_run', 'employee'],
                condition=models.Q(is_deleted=False),
                name='unique_active_payslip_per_run'
            )
        ]

    def clean(self):
        super().clean()
        if self.payroll_run_id and str(self.payroll_run.company_id) != str(self.company_id):
            raise ValidationError({'payroll_run': 'Payroll run must belong to the same company.'})
        if self.employee_id and str(self.employee.company_id) != str(self.company_id):
            raise ValidationError({'employee': 'Employee must belong to the same company.'})
        if self.employment_id and str(self.employment.company_id) != str(self.company_id):
            raise ValidationError({'employment': 'Employment must belong to the same company.'})
        if self.salary_assignment_id and str(self.salary_assignment.company_id) != str(self.company_id):
            raise ValidationError({'salary_assignment': 'Salary assignment must belong to the same company.'})
        if self.currency_id and str(self.currency.company_id) != str(self.company_id):
            raise ValidationError({'currency': 'Currency must belong to the same company.'})
            
        if self.pk:
            try:
                orig = Payslip.objects.get(pk=self.pk)
                if (orig.status == PayslipStatus.FINALIZED or orig.is_frozen) and not getattr(self, '_allow_frozen_update', False):
                    if self.status not in (PayslipStatus.FINALIZED, PayslipStatus.PAID):
                        raise ValidationError({'status': 'Cannot revert a finalized payslip.'})
            except Payslip.DoesNotExist:
                pass

    def save(self, *args, **kwargs):
        from erp_core.models import DocumentSequence
        if not self.payslip_number:
            p_date = self.period_start or (self.payroll_run.period_start if self.payroll_run and self.payroll_run.period_start else (self.payroll_run.payroll_period.start_date if self.payroll_run and self.payroll_run.payroll_period else timezone.now().date()))
            prefix = f"PS-{p_date.strftime('%Y%m')}"
            self.payslip_number = DocumentSequence.get_next_number(self.company, "PAYSLIP", prefix)
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.payslip_number} - {self.employee}"


class PayslipLine(BaseModel):
    payslip = models.ForeignKey(Payslip, on_delete=models.CASCADE, related_name='lines')
    salary_component = models.ForeignKey(SalaryComponent, on_delete=models.RESTRICT)
    description = models.CharField(max_length=255, blank=True, default='')
    component_type = models.CharField(max_length=20, choices=ComponentType.choices)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    sequence = models.IntegerField(default=0)

    class Meta:
        ordering = ['sequence']

    def clean(self):
        super().clean()
        if self.payslip_id and str(self.payslip.company_id) != str(self.company_id):
            raise ValidationError({'payslip': 'Payslip must belong to the same company.'})
        if self.salary_component_id and str(self.salary_component.company_id) != str(self.company_id):
            raise ValidationError({'salary_component': 'Salary component must belong to the same company.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

class PayrollAccountingConfiguration(BaseModel):
    salary_expense_account = models.ForeignKey('finance.ChartOfAccount', on_delete=models.RESTRICT, related_name='+')
    salary_payable_account = models.ForeignKey('finance.ChartOfAccount', on_delete=models.RESTRICT, related_name='+')
    tax_payable_account = models.ForeignKey('finance.ChartOfAccount', null=True, blank=True, on_delete=models.RESTRICT, related_name='+')
    deduction_clearing_account = models.ForeignKey('finance.ChartOfAccount', null=True, blank=True, on_delete=models.RESTRICT, related_name='+')
    is_active = models.BooleanField(default=True)

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=['company'], 
                condition=models.Q(is_active=True, is_deleted=False), 
                name='unique_active_payroll_accounting_config'
            )
        ]

    def clean(self):
        super().clean()
        accounts = [
            self.salary_expense_account,
            self.salary_payable_account,
            self.tax_payable_account,
            self.deduction_clearing_account
        ]
        for acc in accounts:
            if acc and acc.company_id != self.company_id:
                raise ValidationError(f"Account {acc} must belong to the same company.")
        account_ids = [acc.id for acc in accounts if acc]
        if len(account_ids) != len(set(account_ids)):
            raise ValidationError("Duplicate accounts are prohibited in configuration.")

    def __str__(self):
        return f"Payroll Accounting Config ({self.company.name})"


class CompanyPayrollPolicy(BaseModel):
    """
    Tenant-specific payroll policy.

    System defaults (used when no active policy exists):
        standard_monthly_hours = 160.00  (configurable, not a legal requirement)
        overtime_multiplier    = 1.50    (configurable, not a legal requirement)

    One active policy per company is enforced by the DB partial-unique constraint
    ``unique_active_company_payroll_policy``.
    """
    standard_monthly_hours = models.DecimalField(
        max_digits=6, decimal_places=2, default=160.00,
        help_text="Used to derive hourly rate: Base Salary / Standard Monthly Hours."
    )
    overtime_multiplier = models.DecimalField(
        max_digits=5, decimal_places=2, default=1.50,
        help_text="Multiplier applied to the calculated hourly overtime rate."
    )
    daily_rate_divisor = models.DecimalField(
        max_digits=5, decimal_places=2, default=30.00,
        help_text="Divisor used to derive daily duty rate from monthly base salary (e.g. 30.00, 26.00)."
    )
    holiday_pay_percentage = models.DecimalField(
        max_digits=5, decimal_places=2, default=100.00,
        help_text="Payable percentage for company holidays (default: 100.00%)."
    )
    weekly_off_pay_percentage = models.DecimalField(
        max_digits=5, decimal_places=2, default=100.00,
        help_text="Payable percentage for scheduled weekly offs (default: 100.00%)."
    )
    default_single_ot_rate = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        help_text="Optional company-wide fallback single OT hourly rate."
    )
    default_double_ot_rate = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        help_text="Optional company-wide fallback double OT hourly rate."
    )
    enable_policy_ot_fallback = models.BooleanField(
        default=False,
        help_text="If True, allows deriving OT rate from base_salary / standard_monthly_hours * multiplier when no explicit rate is set."
    )
    is_active = models.BooleanField(default=True)

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=['company'],
                condition=models.Q(is_active=True, is_deleted=False),
                name='unique_active_company_payroll_policy'
            )
        ]

    def clean(self):
        """Validate that policy values are business-safe."""
        super().clean()
        from decimal import Decimal
        if self.standard_monthly_hours is not None and self.standard_monthly_hours <= Decimal('0'):
            raise ValidationError({'standard_monthly_hours': 'Standard monthly hours must be greater than zero.'})
        if self.overtime_multiplier is not None and self.overtime_multiplier <= Decimal('0'):
            raise ValidationError({'overtime_multiplier': 'Overtime multiplier must be greater than zero.'})
        if self.daily_rate_divisor is not None and self.daily_rate_divisor <= Decimal('0'):
            raise ValidationError({'daily_rate_divisor': 'Daily rate divisor must be greater than zero.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"PayrollPolicy ({self.company.name}) hrs={self.standard_monthly_hours} x{self.overtime_multiplier}"


# ============================================================================
# PHASE C-1: RECRUITMENT & VETTING
# ============================================================================

class CandidateStatus(models.TextChoices):
    APPLIED = 'APPLIED', 'Applied'
    SCREENING = 'SCREENING', 'Screening'
    SELECTED = 'SELECTED', 'Selected'
    VERIFICATION = 'VERIFICATION', 'Verification'
    APPROVED = 'APPROVED', 'Approved'
    REJECTED = 'REJECTED', 'Rejected'
    HIRED = 'HIRED', 'Hired'

class Candidate(BaseModel):
    candidate_number = models.CharField(max_length=50, blank=True, default='')
    first_name = models.CharField(max_length=200, help_text="Full Name of the candidate")
    last_name = models.CharField(max_length=100, blank=True, default='')
    father_name = models.CharField(max_length=100, blank=True, default='')
    date_of_birth = models.DateField(null=True, blank=True)
    national_id = models.CharField(max_length=50, blank=True, default='')
    phone = models.CharField(max_length=30, blank=True, default='')
    email = models.EmailField(blank=True, default='')
    address = models.TextField(blank=True, default='')

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    @property
    def name(self) -> str:
        return self.full_name

    def get_full_name(self) -> str:
        return self.full_name
    
    applied_designation = models.ForeignKey(Designation, on_delete=models.RESTRICT, related_name='candidates')
    status = models.CharField(max_length=20, choices=CandidateStatus.choices, default=CandidateStatus.APPLIED)
    
    application_date = models.DateField()
    selection_date = models.DateField(null=True, blank=True)
    selected_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='selected_candidates')
    notes = models.TextField(blank=True, default='')
    
    biometric_enrolled = models.BooleanField(default=False)
    biometric_reference_id = models.CharField(max_length=100, blank=True, default='')
    
    converted_employee = models.OneToOneField(Employee, on_delete=models.SET_NULL, null=True, blank=True, related_name='recruitment_candidate')
    
    class Meta:
        ordering = ['-application_date']
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'candidate_number'],
                condition=models.Q(is_deleted=False) & ~models.Q(candidate_number=''),
                name='unique_active_candidate_number'
            )
        ]
        
    def clean(self):
        super().clean()
        if self.applied_designation_id and str(self.applied_designation.company_id) != str(self.company_id):
            raise ValidationError({'applied_designation': 'Designation must belong to the same company.'})
        if self.converted_employee_id and str(self.converted_employee.company_id) != str(self.company_id):
            raise ValidationError({'converted_employee': 'Employee must belong to the same company.'})
        if self.selected_by_id and hasattr(self.selected_by, 'company_id') and str(self.selected_by.company_id) != str(self.company_id):
            raise ValidationError({'selected_by': 'Selector must belong to the same company.'})

    def save(self, *args, **kwargs):
        from erp_core.models import DocumentSequence
        if not self.candidate_number:
            self.candidate_number = DocumentSequence.get_next_number(self.company, "CANDIDATE", "CND")
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.first_name} {self.last_name}".strip()


class CandidateDocument(BaseModel):
    candidate = models.ForeignKey(Candidate, on_delete=models.CASCADE, related_name='documents')
    document_type = models.CharField(max_length=100)
    document_number = models.CharField(max_length=100, blank=True, default='')
    issue_date = models.DateField(null=True, blank=True)
    expiry_date = models.DateField(null=True, blank=True)
    
    original_seen = models.BooleanField(default=False)
    original_received = models.BooleanField(default=False)
    returned = models.BooleanField(default=False)
    
    status = models.CharField(max_length=50, blank=True, default='Valid')
    notes = models.TextField(blank=True, default='')
    attachment = models.FileField(upload_to='hrm/candidates/documents/', null=True, blank=True)
    
    def clean(self):
        super().clean()
        if self.candidate_id and str(self.candidate.company_id) != str(self.company_id):
            raise ValidationError({'candidate': 'Candidate must belong to the same company.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.document_type} - {self.candidate}"


class VerificationStatus(models.TextChoices):
    PENDING = 'PENDING', 'Pending'
    SUBMITTED = 'SUBMITTED', 'Submitted'
    VERIFIED = 'VERIFIED', 'Verified'
    REJECTED = 'REJECTED', 'Rejected'
    EXPIRED = 'EXPIRED', 'Expired'

class CandidateVerification(BaseModel):
    candidate = models.ForeignKey(Candidate, on_delete=models.CASCADE, related_name='verifications')
    verification_type = models.CharField(max_length=50, default='POLICE')
    status = models.CharField(max_length=20, choices=VerificationStatus.choices, default=VerificationStatus.PENDING)
    
    reference_number = models.CharField(max_length=100, blank=True, default='')
    verification_date = models.DateField(null=True, blank=True)
    expiry_date = models.DateField(null=True, blank=True)
    remarks = models.TextField(blank=True, default='')
    verified_by = models.CharField(max_length=100, blank=True, default='')
    
    attachment = models.FileField(upload_to='hrm/candidates/verifications/', null=True, blank=True)

    def clean(self):
        super().clean()
        if self.candidate_id and str(self.candidate.company_id) != str(self.company_id):
            raise ValidationError({'candidate': 'Candidate must belong to the same company.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.verification_type} - {self.candidate}"

# ==============================================================================
# PHASE C-6: STATUTORY PAYROLL & PAYROLL DISBURSEMENT
# ==============================================================================

class StatutorySchemeType(models.TextChoices):
    EOBI = 'EOBI', 'EOBI'
    SOCIAL_SECURITY = 'SOCIAL_SECURITY', 'Social Security (SESSI/PESSI)'
    INCOME_TAX = 'INCOME_TAX', 'Income Tax'

class StatutoryScheme(BaseModel):
    code = models.CharField(max_length=30, blank=True, default='')
    name = models.CharField(max_length=100)
    scheme_type = models.CharField(max_length=50, choices=StatutorySchemeType.choices)
    employee_default_rate = models.DecimalField(max_digits=5, decimal_places=2, default=1.00, help_text="Default Employee contribution %")
    employer_default_rate = models.DecimalField(max_digits=5, decimal_places=2, default=5.00, help_text="Default Employer contribution %")
    effective_from = models.DateField(null=True, blank=True)
    effective_to = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    liability_account = models.ForeignKey('finance.ChartOfAccount', null=True, blank=True, on_delete=models.RESTRICT, related_name='+')
    expense_account = models.ForeignKey('finance.ChartOfAccount', null=True, blank=True, on_delete=models.RESTRICT, related_name='+')
    
    def clean(self):
        super().clean()
        if self.liability_account_id and str(self.liability_account.company_id) != str(self.company_id):
            raise ValidationError({'liability_account': 'Account must belong to the same company.'})
        if self.expense_account_id and str(self.expense_account.company_id) != str(self.company_id):
            raise ValidationError({'expense_account': 'Account must belong to the same company.'})

    def save(self, *args, **kwargs):
        if not self.code:
            self.code = self.name.upper().replace(' ', '_')[:30]
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.code})"


class StatutorySchemeRateHistory(BaseModel):
    scheme = models.ForeignKey(StatutoryScheme, on_delete=models.CASCADE, related_name='rate_history')
    employee_default_rate = models.DecimalField(max_digits=5, decimal_places=2, default=1.00)
    employer_default_rate = models.DecimalField(max_digits=5, decimal_places=2, default=5.00)
    effective_from = models.DateField()
    effective_to = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True, default='')

    class Meta(BaseModel.Meta):
        ordering = ['-effective_from']

    def clean(self):
        super().clean()
        if self.scheme_id and str(self.scheme.company_id) != str(self.company_id):
            raise ValidationError({'scheme': 'Scheme must belong to the same company.'})
        if self.effective_from and self.effective_to and self.effective_to < self.effective_from:
            raise ValidationError({'effective_to': 'Effective to date cannot be before effective from date.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.scheme.name} Rate History ({self.effective_from})"


class StatutoryRule(BaseModel):
    scheme = models.ForeignKey(StatutoryScheme, on_delete=models.CASCADE, related_name='rules')
    effective_from = models.DateField()
    effective_to = models.DateField(null=True, blank=True)
    
    # Rates and thresholds
    employee_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0, help_text="Percentage or flat amount depending on basis")
    employer_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0, help_text="Percentage or flat amount depending on basis")
    
    wage_ceiling = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True, help_text="Maximum wage basis for calculation")
    wage_floor = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True, help_text="Minimum wage basis for calculation")
    
    # Flat amount vs percentage
    is_flat_amount = models.BooleanField(default=False)

    class Meta(BaseModel.Meta):
        ordering = ['-effective_from']

    def clean(self):
        super().clean()
        if self.scheme_id and str(self.scheme.company_id) != str(self.company_id):
            raise ValidationError({'scheme': 'Scheme must belong to the same company.'})

    def __str__(self):
        return f"{self.scheme.name} Rule (From {self.effective_from})"


class EmployeeStatutoryEnrollment(BaseModel):
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='statutory_enrollments')
    scheme = models.ForeignKey(StatutoryScheme, on_delete=models.RESTRICT, related_name='enrolled_employees')
    identifier = models.CharField(max_length=100, blank=True, help_text="e.g. EOBI Number or SSN")
    is_enabled = models.BooleanField(default=True)
    use_company_default = models.BooleanField(default=True)
    employee_rate_override = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    employer_rate_override = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    effective_from = models.DateField(null=True, blank=True)
    effective_to = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    
    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'employee', 'scheme'],
                condition=models.Q(is_active=True, is_deleted=False),
                name='unique_active_employee_scheme'
            )
        ]

    @classmethod
    def resolve_rate(cls, company, employee, scheme_code, on_date=None):
        from datetime import date
        from decimal import Decimal
        if on_date is None:
            on_date = date.today()
        
        enrollment = cls.objects.filter(
            company=company,
            employee=employee,
            scheme__code__iexact=scheme_code,
            is_deleted=False
        ).first()
        
        if not enrollment or not enrollment.is_enabled or not enrollment.is_active:
            return Decimal('0.00'), Decimal('0.00'), False

        if not enrollment.use_company_default and (enrollment.employee_rate_override is not None or enrollment.employer_rate_override is not None):
            emp_rate = enrollment.employee_rate_override if enrollment.employee_rate_override is not None else Decimal('0.00')
            empr_rate = enrollment.employer_rate_override if enrollment.employer_rate_override is not None else Decimal('0.00')
            return emp_rate, empr_rate, True

        scheme = enrollment.scheme
        rate_hist = StatutorySchemeRateHistory.objects.filter(
            company=company,
            scheme=scheme,
            effective_from__lte=on_date,
            is_deleted=False
        ).filter(
            models.Q(effective_to__isnull=True) | models.Q(effective_to__gte=on_date)
        ).order_by('-effective_from').first()

        if rate_hist:
            return rate_hist.employee_default_rate, rate_hist.employer_default_rate, True

        return scheme.employee_default_rate, scheme.employer_default_rate, True

    def clean(self):
        super().clean()
        if self.employee_id and str(self.employee.company_id) != str(self.company_id):
            raise ValidationError({'employee': 'Employee must belong to the same company.'})
        if self.scheme_id and str(self.scheme.company_id) != str(self.company_id):
            raise ValidationError({'scheme': 'Scheme must belong to the same company.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)
        if self.employee_id and self.company_id:
            scheme_name = self.scheme.name if hasattr(self, 'scheme') and self.scheme else 'Statutory Scheme'
            msg = f"{scheme_name} Enrollment - Enabled: {self.is_enabled}, Default Rate: {self.use_company_default}, Employee Override: {self.employee_rate_override}, Employer Override: {self.employer_rate_override}"
            EmploymentHistory.objects.create(
                company=self.company,
                employee=self.employee,
                event_type='STATUTORY_ENROLLMENT_CHANGE',
                notes=msg
            )

    def __str__(self):
        return f"{self.employee.employee_code} - {self.scheme.name}"


class PayslipStatutoryDeduction(BaseModel):
    payslip = models.ForeignKey(Payslip, on_delete=models.CASCADE, related_name='statutory_deductions')
    scheme = models.ForeignKey(StatutoryScheme, on_delete=models.RESTRICT)
    employee_deduction = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    employer_contribution = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    basis_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    def clean(self):
        super().clean()
        if self.payslip_id and str(self.payslip.company_id) != str(self.company_id):
            raise ValidationError({'payslip': 'Payslip must belong to the same company.'})
        if self.scheme_id and str(self.scheme.company_id) != str(self.company_id):
            raise ValidationError({'scheme': 'Scheme must belong to the same company.'})


class PayrollDisbursementStatus(models.TextChoices):
    PENDING = 'PENDING', 'Pending'
    PROCESSING = 'PROCESSING', 'Processing'
    COMPLETED = 'COMPLETED', 'Completed'
    FAILED = 'FAILED', 'Failed'
    CANCELLED = 'CANCELLED', 'Cancelled'

class PayrollDisbursement(BaseModel):
    payroll_run = models.ForeignKey(PayrollRun, on_delete=models.RESTRICT, related_name='disbursements')
    payment_voucher = models.ForeignKey('finance.FinancialVoucher', null=True, blank=True, on_delete=models.RESTRICT, related_name='payroll_disbursements')
    payment_account = models.ForeignKey('finance.ChartOfAccount', on_delete=models.RESTRICT, related_name='payroll_disbursements')
    total_amount = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    disbursement_date = models.DateField()
    status = models.CharField(max_length=20, choices=PayrollDisbursementStatus.choices, default=PayrollDisbursementStatus.PENDING)
    
    def clean(self):
        super().clean()
        if self.payroll_run_id and str(self.payroll_run.company_id) != str(self.company_id):
            raise ValidationError({'payroll_run': 'Payroll run must belong to the same company.'})
        if self.payment_account_id and str(self.payment_account.company_id) != str(self.company_id):
            raise ValidationError({'payment_account': 'Account must belong to the same company.'})

    def __str__(self):
        return f"Disbursement {self.payroll_run.run_number} - {self.total_amount}"


class PayslipDisbursement(BaseModel):
    disbursement = models.ForeignKey(PayrollDisbursement, on_delete=models.CASCADE, related_name='payslips')
    payslip = models.ForeignKey(Payslip, on_delete=models.RESTRICT, related_name='disbursement_records')
    amount = models.DecimalField(max_digits=15, decimal_places=4)
    status = models.CharField(max_length=20, choices=PayrollDisbursementStatus.choices, default=PayrollDisbursementStatus.PENDING)
    
    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'payslip'],
                condition=models.Q(status__in=[PayrollDisbursementStatus.COMPLETED, PayrollDisbursementStatus.PROCESSING]),
                name='unique_active_payslip_disbursement'
            )
        ]

    def clean(self):
        super().clean()
        if self.payslip_id and str(self.payslip.company_id) != str(self.company_id):
            raise ValidationError({'payslip': 'Payslip must belong to the same company.'})

    def __str__(self):
        return f"{self.payslip.payslip_number} - {self.amount}"

