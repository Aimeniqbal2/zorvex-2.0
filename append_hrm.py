import sys

content = """
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
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    father_name = models.CharField(max_length=100, blank=True, default='')
    date_of_birth = models.DateField(null=True, blank=True)
    national_id = models.CharField(max_length=50, blank=True, default='')
    phone = models.CharField(max_length=30, blank=True, default='')
    email = models.EmailField(blank=True, default='')
    address = models.TextField(blank=True, default='')
    
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

"""

with open(r'c:\Users\Aimen Iqbal\Desktop\ERP\hrm\models.py', 'a') as f:
    f.write(content)
