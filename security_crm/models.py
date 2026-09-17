from django.db import models
from django.core.exceptions import ValidationError
from erp_core.models import BaseModel
from crm.models import CRMEntity
from django.conf import settings

class SecurityProposalStatus(models.TextChoices):
    DRAFT = 'DRAFT', 'Draft'
    SENT = 'SENT', 'Sent'
    MEETING = 'MEETING', 'Meeting'
    SITE_ASSESSMENT = 'SITE_ASSESSMENT', 'Site Assessment'
    FINAL_PROPOSAL = 'FINAL_PROPOSAL', 'Final Proposal'
    AWAITING_APPROVAL = 'AWAITING_APPROVAL', 'Awaiting Approval'
    APPROVED = 'APPROVED', 'Approved'
    SIGNING = 'SIGNING', 'Signing'
    SIGNED = 'SIGNED', 'Signed'
    ACTIVE = 'ACTIVE', 'Active'
    ON_HOLD = 'ON_HOLD', 'On Hold'
    REJECTED = 'REJECTED', 'Rejected'
    CANCELLED = 'CANCELLED', 'Cancelled'

class ApprovalMethod(models.TextChoices):
    EMAIL = 'EMAIL', 'Email'
    WRITTEN = 'WRITTEN', 'Written / Letter'
    VERBAL = 'VERBAL', 'Verbal / Call'
    PORTAL = 'PORTAL', 'Client Portal'
    OTHER = 'OTHER', 'Other'


class SignedDocumentCategory(models.TextChoices):
    SIGNED_CONTRACT = 'SIGNED_CONTRACT', 'Signed Contract'
    SIGNED_PROPOSAL = 'SIGNED_PROPOSAL', 'Signed Proposal'
    PURCHASE_ORDER = 'PURCHASE_ORDER', 'Purchase Order / PO'
    AWARD_LETTER = 'AWARD_LETTER', 'Award Letter'
    OTHER_SUPPORTING = 'OTHER_SUPPORTING', 'Other Supporting Document'


class SecurityProposal(BaseModel):
    """
    Represents the commercial proposal associated with an existing universal CRM customer.
    """
    customer = models.ForeignKey('crm.CRMEntity', on_delete=models.RESTRICT, related_name='security_proposals')
    proposal_number = models.CharField(max_length=100, db_index=True, blank=True)
    title = models.CharField(max_length=255)
    status = models.CharField(max_length=50, choices=SecurityProposalStatus.choices, default=SecurityProposalStatus.DRAFT)
    
    # We link to the operations ServiceContract instead of creating a duplicate SecurityContract model.
    # This maintains operations.ServiceContract as the single source of truth for the active contract.
    contract = models.ForeignKey('operations.ServiceContract', on_delete=models.SET_NULL, null=True, blank=True, related_name='security_proposals')
    
    valid_until = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True, default='')

    # Phase S-2G: Approval Fields
    approved_version = models.ForeignKey('ProposalVersion', on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_proposals')
    approved_date = models.DateField(null=True, blank=True)
    approved_by_name = models.CharField(max_length=255, blank=True, default='')
    approved_by_contact = models.ForeignKey('crm.CRMContact', on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_security_proposals')
    approval_method = models.CharField(max_length=50, choices=ApprovalMethod.choices, default=ApprovalMethod.EMAIL, blank=True)
    approval_notes = models.TextField(blank=True, default='')

    # Rejection & On-Hold Details
    rejection_reason = models.CharField(max_length=255, blank=True, default='')
    rejection_notes = models.TextField(blank=True, default='')
    rejection_date = models.DateField(null=True, blank=True)
    on_hold_reason = models.CharField(max_length=255, blank=True, default='')
    on_hold_notes = models.TextField(blank=True, default='')
    on_hold_date = models.DateField(null=True, blank=True)

    # Phase S-2G: Signing Workspace Fields
    contract_start_date = models.DateField(null=True, blank=True)
    contract_end_date = models.DateField(null=True, blank=True)
    billing_cycle = models.CharField(max_length=50, default='MONTHLY', blank=True)
    payment_terms = models.CharField(max_length=100, default='NET_30', blank=True)
    expected_mobilization_date = models.DateField(null=True, blank=True)
    signed_by_client = models.CharField(max_length=255, blank=True, default='')
    signed_by_company = models.CharField(max_length=255, blank=True, default='')
    signing_date = models.DateField(null=True, blank=True)
    contract_reference = models.CharField(max_length=100, blank=True, default='')
    signing_notes = models.TextField(blank=True, default='')

    # Phase S-2H: Cross-Module Handoff Readiness Fields
    is_handoff_ready = models.BooleanField(default=False)
    handoff_prepared_at = models.DateTimeField(null=True, blank=True)
    handoff_prepared_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='prepared_security_handoffs')
    handoff_notes = models.TextField(blank=True, default='')

    def clean(self):
        super().clean()
        if self.customer_id and str(self.customer.company_id) != str(self.company_id):
            raise ValidationError({'customer': 'Customer must belong to the same company.'})
        
        # Prevent direct unsafe status mutation from API clients (rudimentary check here; service handles strict workflow)
        if self.pk:
            try:
                orig = SecurityProposal.objects.get(pk=self.pk)
                # Cannot mutate status freely without going through workflow if it was terminal
                if orig.status in [SecurityProposalStatus.REJECTED, SecurityProposalStatus.CANCELLED]:
                    if self.status != orig.status:
                        raise ValidationError({'status': f"Cannot change status from terminal state {orig.status} directly."})
            except SecurityProposal.DoesNotExist:
                pass

    def save(self, *args, **kwargs):
        if not self.proposal_number or not str(self.proposal_number).strip():
            cid = self.company_id or (self.company.id if getattr(self, 'company', None) else None)
            import re
            existing_props = SecurityProposal.objects.filter(
                company_id=cid,
                proposal_number__startswith="SEC-PROP-"
            ).values_list('proposal_number', flat=True)
            max_num = 0
            pattern = re.compile(r"^SEC-PROP-(\d+)$")
            for p_num in existing_props:
                match = pattern.match(p_num)
                if match:
                    try:
                        num = int(match.group(1))
                        if num > max_num:
                            max_num = num
                    except ValueError:
                        pass
            next_num = max_num + 1
            candidate = f"SEC-PROP-{next_num:06d}"
            while SecurityProposal.objects.filter(company_id=cid, proposal_number=candidate).exists():
                next_num += 1
                candidate = f"SEC-PROP-{next_num:06d}"
            self.proposal_number = candidate
        self.clean()
        super().save(*args, **kwargs)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'proposal_number'],
                condition=models.Q(is_deleted=False),
                name='unique_security_proposal_number'
            )
        ]
        
    def __str__(self):
        return f"{self.proposal_number} - {self.title}"


class CommercialBillingCycle(models.TextChoices):
    MONTHLY = 'MONTHLY', 'Monthly'
    BI_WEEKLY = 'BI_WEEKLY', 'Bi-Weekly'
    CUSTOM = 'CUSTOM', 'Custom'


class CommercialPaymentTerms(models.TextChoices):
    DUE_ON_RECEIPT = 'DUE_ON_RECEIPT', 'Due on Receipt'
    NET_15 = 'NET_15', 'Net 15 Days'
    NET_30 = 'NET_30', 'Net 30 Days'
    NET_60 = 'NET_60', 'Net 60 Days'
    ADVANCE = 'ADVANCE', 'Advance Payment'
    CUSTOM = 'CUSTOM', 'Custom Terms'


class CommercialDiscountType(models.TextChoices):
    NONE = 'NONE', 'None'
    FIXED = 'FIXED', 'Fixed Amount'
    PERCENTAGE = 'PERCENTAGE', 'Percentage'


class CommercialChargeType(models.TextChoices):
    ONE_TIME = 'ONE_TIME', 'One-Time'
    MONTHLY = 'MONTHLY', 'Monthly / Recurring'


class ProposalVersion(BaseModel):
    """
    Historical record of a proposal iteration.
    Prefer immutability after they have been formally sent.
    """
    proposal = models.ForeignKey(SecurityProposal, on_delete=models.CASCADE, related_name='versions')
    version_number = models.PositiveIntegerField(default=1)
    version_type = models.CharField(max_length=100, default='Initial Proposal')
    status = models.CharField(max_length=50, choices=SecurityProposalStatus.choices, default=SecurityProposalStatus.DRAFT)
    is_frozen = models.BooleanField(default=False)
    notes = models.TextField(blank=True, default='')

    # Commercial Terms
    billing_cycle = models.CharField(max_length=50, default=CommercialBillingCycle.MONTHLY, choices=CommercialBillingCycle.choices)
    payment_terms = models.CharField(max_length=100, default=CommercialPaymentTerms.NET_30, choices=CommercialPaymentTerms.choices)
    proposal_validity_days = models.PositiveIntegerField(default=30)
    contract_duration_months = models.PositiveIntegerField(default=12)
    expected_start_date = models.DateField(null=True, blank=True)
    security_deposit = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    commercial_notes = models.TextField(blank=True, default='')
    terms_and_conditions = models.TextField(blank=True, default='')

    # Discount & Tax
    discount_type = models.CharField(max_length=20, default=CommercialDiscountType.NONE, choices=CommercialDiscountType.choices)
    discount_value = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)

    # Sent traceability
    sent_at = models.DateTimeField(null=True, blank=True)
    sent_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='sent_security_proposal_versions')

    @property
    def monthly_services_total(self):
        lines = self.service_lines.filter(is_deleted=False)
        return sum(
            l.quantity * l.client_rate
            for l in lines
            if str(l.billing_unit).upper() in ['MONTHLY', 'MONTH']
        )

    @property
    def one_time_services_total(self):
        lines = self.service_lines.filter(is_deleted=False)
        return sum(
            l.quantity * l.client_rate
            for l in lines
            if str(l.billing_unit).upper() in ['ONE_TIME', 'ONE-TIME']
        )

    @property
    def recurring_equipment_total(self):
        return sum(
            e.quantity * e.unit_rate
            for e in self.equipment_requirements.filter(is_deleted=False, charge_type='MONTHLY')
        )

    @property
    def one_time_equipment_total(self):
        return sum(
            e.quantity * e.unit_rate
            for e in self.equipment_requirements.filter(is_deleted=False, charge_type='ONE_TIME')
        )

    @property
    def recurring_charges_total(self):
        return sum(
            c.quantity * c.amount
            for c in self.additional_charges.filter(is_deleted=False, charge_type='MONTHLY')
        )

    @property
    def one_time_charges_total(self):
        return sum(
            c.quantity * c.amount
            for c in self.additional_charges.filter(is_deleted=False, charge_type='ONE_TIME')
        )

    @property
    def total_monthly_recurring(self):
        return self.monthly_services_total + self.recurring_equipment_total + self.recurring_charges_total

    @property
    def total_one_time(self):
        return self.one_time_services_total + self.one_time_equipment_total + self.one_time_charges_total

    @property
    def subtotal(self):
        return self.total_monthly_recurring + self.total_one_time

    @property
    def discount_amount(self):
        from decimal import Decimal
        sub = self.subtotal
        if self.discount_type == CommercialDiscountType.FIXED:
            return min(sub, self.discount_value)
        elif self.discount_type == CommercialDiscountType.PERCENTAGE:
            return (sub * self.discount_value) / Decimal('100.00')
        return Decimal('0.00')

    @property
    def taxable_amount(self):
        from decimal import Decimal
        return max(Decimal('0.00'), self.subtotal - self.discount_amount)

    @property
    def tax_amount(self):
        from decimal import Decimal
        if self.tax_rate:
            return (self.taxable_amount * self.tax_rate) / Decimal('100.00')
        return Decimal('0.00')

    @property
    def grand_total(self):
        return self.taxable_amount + self.tax_amount

    def clean(self):
        super().clean()
        if self.proposal_id and str(self.proposal.company_id) != str(self.company_id):
            raise ValidationError({'proposal': 'Proposal must belong to the same company.'})
        if self.pk:
            try:
                orig = ProposalVersion.objects.get(pk=self.pk)
                if orig.is_frozen and self.is_frozen:
                    # Check if mutable fields changed on frozen version
                    frozen_locked_fields = [
                        'billing_cycle', 'payment_terms', 'proposal_validity_days',
                        'contract_duration_months', 'discount_type', 'discount_value',
                        'tax_rate', 'security_deposit'
                    ]
                    for f in frozen_locked_fields:
                        if getattr(orig, f) != getattr(self, f):
                            raise ValidationError(f"Cannot modify '{f}' on a frozen proposal version.")
            except ProposalVersion.DoesNotExist:
                pass

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    class Meta:
        ordering = ['-version_number']
        unique_together = ('proposal', 'version_number')

    def __str__(self):
        return f"{self.proposal.proposal_number} v{self.version_number} ({self.version_type})"


class SecurityServiceType(BaseModel):
    """
    Configurable Security service types (e.g. Security Guard, Supervisor).
    """
    code = models.CharField(max_length=50)
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, default='')
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'code'],
                condition=models.Q(is_deleted=False),
                name='unique_security_service_type_code'
            )
        ]

    def __str__(self):
        return self.name


class ClientLocation(BaseModel):
    """
    Security requires operationally meaningful client locations extending the universal CRM address.
    """
    customer = models.ForeignKey('crm.CRMEntity', on_delete=models.CASCADE, related_name='security_locations')
    crm_address = models.ForeignKey('crm.CRMAddress', on_delete=models.SET_NULL, null=True, blank=True)
    name = models.CharField(max_length=255)
    primary_contact = models.ForeignKey('crm.CRMContact', on_delete=models.SET_NULL, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True, default='')

    def clean(self):
        super().clean()
        if self.customer_id and str(self.customer.company_id) != str(self.company_id):
            raise ValidationError({'customer': 'Customer must belong to the same company.'})
        if self.crm_address_id and str(self.crm_address.company_id) != str(self.company_id):
            raise ValidationError({'crm_address': 'Address must belong to the same company.'})
        if self.primary_contact_id and str(self.primary_contact.company_id) != str(self.company_id):
            raise ValidationError({'primary_contact': 'Contact must belong to the same company.'})

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.customer.name})"


class ProposalServiceLine(BaseModel):
    """
    Requirements scoped to a specific location for a specific proposal version.
    Client rates are owned by Security CRM. Employee salaries are NOT stored here.
    """
    proposal_version = models.ForeignKey(ProposalVersion, on_delete=models.CASCADE, related_name='service_lines')
    location = models.ForeignKey(ClientLocation, on_delete=models.RESTRICT, related_name='service_lines', null=True, blank=True)
    service_type = models.ForeignKey(SecurityServiceType, on_delete=models.RESTRICT)
    quantity = models.PositiveIntegerField(default=1)
    
    # Client commercial rates (NOT employee pay rates)
    client_rate = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    single_ot_rate = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    double_ot_rate = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    
    billing_unit = models.CharField(max_length=50, default='MONTHLY')
    notes = models.TextField(blank=True, default='')

    # Traceability back to assessment recommendation if imported
    source_recommendation = models.ForeignKey('AssessmentStaffingRecommendation', on_delete=models.SET_NULL, null=True, blank=True, related_name='imported_service_lines')

    @property
    def total(self):
        return self.quantity * self.client_rate

    @property
    def line_total(self):
        return self.quantity * self.client_rate

    def clean(self):
        super().clean()
        if self.proposal_version_id:
            if str(self.proposal_version.company_id) != str(self.company_id):
                raise ValidationError("ProposalVersion company mismatch.")
            if getattr(self.proposal_version, 'is_frozen', False):
                raise ValidationError("Cannot modify service line in a frozen version.")
        if self.location_id and str(self.location.company_id) != str(self.company_id):
            raise ValidationError("Location company mismatch.")
        if self.service_type_id and str(self.service_type.company_id) != str(self.company_id):
            raise ValidationError("ServiceType company mismatch.")

    def __str__(self):
        return f"{self.quantity} x {self.service_type.name} at {self.location.name if self.location else 'Default'}"


class SecurityAssessmentStatus(models.TextChoices):
    DRAFT = 'DRAFT', 'Draft'
    IN_PROGRESS = 'IN_PROGRESS', 'In Progress'
    COMPLETED = 'COMPLETED', 'Completed'
    CANCELLED = 'CANCELLED', 'Cancelled'


class RiskLevel(models.TextChoices):
    LOW = 'LOW', 'Low'
    MEDIUM = 'MEDIUM', 'Medium'
    HIGH = 'HIGH', 'High'
    CRITICAL = 'CRITICAL', 'Critical'


class AssessmentAttachmentCategory(models.TextChoices):
    SITE_PHOTO = 'SITE_PHOTO', 'Site Photo'
    LAYOUT_DOCUMENT = 'LAYOUT_DOCUMENT', 'Layout Document'
    CLIENT_DOCUMENT = 'CLIENT_DOCUMENT', 'Client Document'
    EXISTING_SETUP = 'EXISTING_SETUP', 'Existing Security Setup'
    OTHER = 'OTHER', 'Other'


class SecurityAssessment(BaseModel):
    """
    Represents the site survey/security assessment stage for a client location.
    Belongs to a Proposal, Client Location, and Company.
    """
    proposal = models.ForeignKey(SecurityProposal, on_delete=models.CASCADE, related_name='assessments')
    client_location = models.ForeignKey(ClientLocation, on_delete=models.RESTRICT, related_name='assessments')
    assessment_date = models.DateField(null=True, blank=True)
    assessed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='conducted_assessments')
    status = models.CharField(max_length=50, choices=SecurityAssessmentStatus.choices, default=SecurityAssessmentStatus.DRAFT)
    
    # Practical Security Survey Data
    site_overview = models.TextField(blank=True, default='')
    operating_hours = models.CharField(max_length=255, blank=True, default='')
    entry_exit_points = models.TextField(blank=True, default='')
    sensitive_areas = models.TextField(blank=True, default='')
    existing_security_setup = models.TextField(blank=True, default='')
    existing_guards = models.TextField(blank=True, default='')
    existing_cctv = models.TextField(blank=True, default='')
    access_control = models.TextField(blank=True, default='')
    visitor_management = models.TextField(blank=True, default='')
    perimeter_security = models.TextField(blank=True, default='')
    lighting_conditions = models.TextField(blank=True, default='')
    emergency_exits = models.TextField(blank=True, default='')
    fire_safety_concerns = models.TextField(blank=True, default='')
    known_risks = models.TextField(blank=True, default='')
    client_concerns = models.TextField(blank=True, default='')
    findings = models.TextField(blank=True, default='')
    recommendations = models.TextField(blank=True, default='')
    notes = models.TextField(blank=True, default='')
    
    # Completion audit
    completed_at = models.DateTimeField(null=True, blank=True)
    completed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='completed_assessments')

    class Meta:
        ordering = ['-created_at']
        unique_together = ('proposal', 'client_location')

    def clean(self):
        super().clean()
        if self.proposal_id and str(self.proposal.company_id) != str(self.company_id):
            raise ValidationError({'proposal': 'Proposal company mismatch.'})
        if self.client_location_id and str(self.client_location.company_id) != str(self.company_id):
            raise ValidationError({'client_location': 'Client Location company mismatch.'})
        if self.client_location_id and self.proposal_id and str(self.client_location.customer_id) != str(self.proposal.customer_id):
            raise ValidationError({'client_location': 'Client location does not belong to the proposal customer.'})

    def __str__(self):
        return f"Assessment for {self.client_location.name} ({self.proposal.proposal_number}) - {self.status}"


class AssessmentRiskFinding(BaseModel):
    """
    Individual risk or security vulnerability identified during the site assessment.
    """
    assessment = models.ForeignKey(SecurityAssessment, on_delete=models.CASCADE, related_name='risk_findings')
    title = models.CharField(max_length=255)
    category = models.CharField(max_length=100, blank=True, default='GENERAL')
    description = models.TextField(blank=True, default='')
    risk_level = models.CharField(max_length=20, choices=RiskLevel.choices, default=RiskLevel.MEDIUM)
    location_area = models.CharField(max_length=255, blank=True, default='')
    recommendation = models.TextField(blank=True, default='')
    status = models.CharField(max_length=50, default='OPEN')

    class Meta:
        ordering = ['-created_at']

    def clean(self):
        super().clean()
        if self.assessment_id and str(self.assessment.company_id) != str(self.company_id):
            raise ValidationError({'assessment': 'Assessment company mismatch.'})

    def __str__(self):
        return f"[{self.risk_level}] {self.title} ({self.assessment.client_location.name})"


class AssessmentStaffingRecommendation(BaseModel):
    """
    Recommended security personnel requirement based on assessment findings.
    Only a recommendation for proposal formulation. Does not perform employee deployment or payroll.
    """
    assessment = models.ForeignKey(SecurityAssessment, on_delete=models.CASCADE, related_name='staffing_recommendations')
    service_type = models.ForeignKey(SecurityServiceType, on_delete=models.RESTRICT, related_name='assessment_staffing_recommendations')
    location = models.ForeignKey(ClientLocation, on_delete=models.RESTRICT, null=True, blank=True, related_name='assessment_staffing_recommendations')
    quantity = models.PositiveIntegerField(default=1)
    shift_coverage_notes = models.CharField(max_length=255, blank=True, default='')
    post_area = models.CharField(max_length=255, blank=True, default='')
    remarks = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-created_at']

    def clean(self):
        super().clean()
        if self.assessment_id and str(self.assessment.company_id) != str(self.company_id):
            raise ValidationError({'assessment': 'Assessment company mismatch.'})
        if self.service_type_id and str(self.service_type.company_id) != str(self.company_id):
            raise ValidationError({'service_type': 'ServiceType company mismatch.'})
        if self.location_id and str(self.location.company_id) != str(self.company_id):
            raise ValidationError({'location': 'Location company mismatch.'})

    def __str__(self):
        return f"{self.quantity} x {self.service_type.name} at {self.post_area or self.assessment.client_location.name}"


class AssessmentEquipmentRecommendation(BaseModel):
    """
    Recommended equipment/hardware (CCTV, radios, barriers, etc.) based on assessment findings.
    Does not issue inventory or reduce stock.
    """
    assessment = models.ForeignKey(SecurityAssessment, on_delete=models.CASCADE, related_name='equipment_recommendations')
    equipment_name = models.CharField(max_length=255)
    quantity = models.PositiveIntegerField(default=1)
    location_area = models.CharField(max_length=255, blank=True, default='')
    purpose = models.CharField(max_length=255, blank=True, default='')
    notes = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-created_at']

    def clean(self):
        super().clean()
        if self.assessment_id and str(self.assessment.company_id) != str(self.company_id):
            raise ValidationError({'assessment': 'Assessment company mismatch.'})

    def __str__(self):
        return f"{self.quantity} x {self.equipment_name} ({self.location_area or self.assessment.client_location.name})"


class AssessmentAttachment(BaseModel):
    """
    Photos, layout documents, client papers, and evidence captured during site assessment.
    """
    assessment = models.ForeignKey(SecurityAssessment, on_delete=models.CASCADE, related_name='attachments')
    title = models.CharField(max_length=255)
    category = models.CharField(max_length=50, choices=AssessmentAttachmentCategory.choices, default=AssessmentAttachmentCategory.SITE_PHOTO)
    file = models.FileField(upload_to='security_crm/assessments/%Y/%m/', null=True, blank=True)
    file_url = models.CharField(max_length=500, blank=True, default='')
    notes = models.TextField(blank=True, default='')
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def clean(self):
        super().clean()
        if self.assessment_id and str(self.assessment.company_id) != str(self.company_id):
            raise ValidationError({'assessment': 'Assessment company mismatch.'})

    def __str__(self):
        return f"{self.title} ({self.get_category_display()})"



class ContractEquipmentRequirement(BaseModel):
    """
    CRM defines equipment requested/required by contract.
    It DOES NOT perform inventory issuance.
    """
    proposal_version = models.ForeignKey(ProposalVersion, on_delete=models.CASCADE, related_name='equipment_requirements')
    location = models.ForeignKey(ClientLocation, on_delete=models.RESTRICT, related_name='equipment_requirements')
    inventory_item = models.ForeignKey('inventory.Item', on_delete=models.SET_NULL, null=True, blank=True, related_name='security_equipment_requirements')
    item_name = models.CharField(max_length=255, blank=True, default='')
    description = models.CharField(max_length=255, blank=True, default='')
    quantity = models.PositiveIntegerField(default=1)
    unit_rate = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    charge_type = models.CharField(max_length=20, default=CommercialChargeType.ONE_TIME, choices=CommercialChargeType.choices)
    notes = models.TextField(blank=True, default='')

    # Traceability back to assessment recommendation if imported
    source_recommendation = models.ForeignKey('AssessmentEquipmentRecommendation', on_delete=models.SET_NULL, null=True, blank=True, related_name='imported_equipment_lines')

    @property
    def line_total(self):
        return self.quantity * self.unit_rate

    def clean(self):
        super().clean()
        if self.proposal_version_id:
            if str(self.proposal_version.company_id) != str(self.company_id):
                raise ValidationError("ProposalVersion company mismatch.")
            if getattr(self.proposal_version, 'is_frozen', False):
                raise ValidationError("Cannot modify equipment requirements in a frozen version.")
        if self.location_id and str(self.location.company_id) != str(self.company_id):
            raise ValidationError("Location company mismatch.")
        if self.inventory_item_id and str(self.inventory_item.company_id) != str(self.company_id):
            raise ValidationError("Inventory item company mismatch.")

    def __str__(self):
        display_name = self.item_name or self.description or (self.inventory_item.name if self.inventory_item else 'Equipment')
        return f"{self.quantity} x {display_name} at {self.location.name}"


class ProposalAdditionalCharge(BaseModel):
    """
    Commercial line items on a proposal version for mobilization, installation,
    equipment rental, training, transportation, or other commercial charges.
    """
    proposal_version = models.ForeignKey(ProposalVersion, on_delete=models.CASCADE, related_name='additional_charges')
    charge_name = models.CharField(max_length=150)
    charge_type = models.CharField(max_length=20, default=CommercialChargeType.ONE_TIME, choices=CommercialChargeType.choices)
    amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    quantity = models.PositiveIntegerField(default=1)
    notes = models.TextField(blank=True, default='')

    @property
    def line_total(self):
        return self.quantity * self.amount

    def clean(self):
        super().clean()
        if self.proposal_version_id:
            if str(self.proposal_version.company_id) != str(self.company_id):
                raise ValidationError("ProposalVersion company mismatch.")
            if getattr(self.proposal_version, 'is_frozen', False):
                raise ValidationError("Cannot modify additional charges on a frozen version.")

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.charge_name} ({self.get_charge_type_display()}): {self.line_total}"


class SecurityProposalMeetingType(models.TextChoices):
    FACE_TO_FACE = 'FACE_TO_FACE', 'Face-to-Face'
    ONLINE = 'ONLINE', 'Online / Video Call'
    PHONE = 'PHONE', 'Phone Call'
    OTHER = 'OTHER', 'Other'


class SecurityProposalMeetingStatus(models.TextChoices):
    SCHEDULED = 'SCHEDULED', 'Scheduled'
    COMPLETED = 'COMPLETED', 'Completed'
    CANCELLED = 'CANCELLED', 'Cancelled'
    NO_SHOW = 'NO_SHOW', 'No Show'


class SecurityProposalMeetingOutcome(models.TextChoices):
    PROCEED_TO_SITE_ASSESSMENT = 'PROCEED_TO_SITE_ASSESSMENT', 'Proceed to Site Assessment'
    NEED_ANOTHER_MEETING = 'NEED_ANOTHER_MEETING', 'Need Another Meeting'
    REVISE_PROPOSAL = 'REVISE_PROPOSAL', 'Client Requested Revised Commercial Proposal'
    ON_HOLD = 'ON_HOLD', 'On Hold'
    REJECTED = 'REJECTED', 'Rejected'
    NO_ACTION = 'NO_ACTION', 'No Immediate Action'
    OTHER = 'OTHER', 'Other'


class SecurityProposalMeeting(BaseModel):
    """
    Operational meeting record for a Security Proposal during the MEETING workflow stage.
    Supports multiple meetings per proposal.
    """
    proposal = models.ForeignKey(SecurityProposal, on_delete=models.CASCADE, related_name='meetings')
    meeting_type = models.CharField(
        max_length=50, 
        choices=SecurityProposalMeetingType.choices, 
        default=SecurityProposalMeetingType.FACE_TO_FACE
    )
    subject = models.CharField(max_length=255)
    scheduled_at = models.DateTimeField()
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(
        max_length=50, 
        choices=SecurityProposalMeetingStatus.choices, 
        default=SecurityProposalMeetingStatus.SCHEDULED
    )
    location = models.CharField(max_length=255, blank=True, default='')
    meeting_link = models.URLField(max_length=500, blank=True, default='')
    
    # Structured discussion notes
    agenda = models.TextField(blank=True, default='')
    discussion_notes = models.TextField(blank=True, default='')
    client_requirements = models.TextField(blank=True, default='')
    commercial_concerns = models.TextField(blank=True, default='')
    operational_concerns = models.TextField(blank=True, default='')
    agreed_points = models.TextField(blank=True, default='')
    pending_items = models.TextField(blank=True, default='')
    
    # Outcome recording
    outcome = models.CharField(
        max_length=50, 
        choices=SecurityProposalMeetingOutcome.choices, 
        blank=True, 
        default=''
    )
    outcome_notes = models.TextField(blank=True, default='')
    completed_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='created_security_meetings'
    )

    def clean(self):
        super().clean()
        if self.proposal_id and str(self.proposal.company_id) != str(self.company_id):
            raise ValidationError({'proposal': 'Proposal must belong to the same company.'})
        if self.created_by_id and str(self.created_by.company_id) != str(self.company_id):
            raise ValidationError({'created_by': 'Created by user must belong to the same company.'})
        if self.status == SecurityProposalMeetingStatus.COMPLETED and not self.completed_at:
            from django.utils import timezone
            self.completed_at = timezone.now()

    class Meta:
        ordering = ['-scheduled_at']

    def __str__(self):
        return f"{self.subject} ({self.proposal.proposal_number}) - {self.get_status_display()}"


class MeetingParticipantType(models.TextChoices):
    INTERNAL_USER = 'INTERNAL_USER', 'Internal Staff'
    CUSTOMER_CONTACT = 'CUSTOMER_CONTACT', 'Customer Contact'
    EXTERNAL = 'EXTERNAL', 'External Attendee'


class MeetingParticipant(BaseModel):
    """
    Participant in a Security Proposal meeting.
    Links to internal users or proposal customer CRM contacts without duplicating identity.
    """
    meeting = models.ForeignKey(SecurityProposalMeeting, on_delete=models.CASCADE, related_name='participants')
    participant_type = models.CharField(
        max_length=50, 
        choices=MeetingParticipantType.choices, 
        default=MeetingParticipantType.INTERNAL_USER
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='security_meeting_participations'
    )
    crm_contact = models.ForeignKey(
        'crm.CRMContact', 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='security_meeting_participations'
    )
    external_name = models.CharField(max_length=255, blank=True, default='')
    external_email = models.EmailField(blank=True, default='')
    role = models.CharField(max_length=100, blank=True, default='')
    attended = models.BooleanField(default=False)

    def clean(self):
        super().clean()
        if self.meeting_id and str(self.meeting.company_id) != str(self.company_id):
            raise ValidationError({'meeting': 'Meeting must belong to the same company.'})
        if self.user_id and str(self.user.company_id) != str(self.company_id):
            raise ValidationError({'user': 'Internal user must belong to the same company.'})
        if self.crm_contact_id:
            if str(self.crm_contact.company_id) != str(self.company_id):
                raise ValidationError({'crm_contact': 'Contact must belong to the same company.'})
            if self.meeting_id and str(self.crm_contact.entity_id) != str(self.meeting.proposal.customer_id):
                raise ValidationError({'crm_contact': 'Contact must belong to the proposal customer.'})

    class Meta:
        ordering = ['participant_type', 'created_at']

    def __str__(self):
        if self.participant_type == MeetingParticipantType.INTERNAL_USER and self.user:
            return f"{self.user.get_full_name() or self.user.username} (Staff)"
        elif self.participant_type == MeetingParticipantType.CUSTOMER_CONTACT and self.crm_contact:
            return f"{self.crm_contact.first_name} {self.crm_contact.last_name} (Client)"
        return f"{self.external_name or self.external_email} (External)"


class FollowUpPriority(models.TextChoices):
    LOW = 'LOW', 'Low'
    MEDIUM = 'MEDIUM', 'Medium'
    HIGH = 'HIGH', 'High'
    URGENT = 'URGENT', 'Urgent'


class FollowUpStatus(models.TextChoices):
    OPEN = 'OPEN', 'Open'
    COMPLETED = 'COMPLETED', 'Completed'
    CANCELLED = 'CANCELLED', 'Cancelled'


class ProposalFollowUp(BaseModel):
    """
    Action items and follow-ups resulting from proposal engagement or meetings.
    """
    proposal = models.ForeignKey(SecurityProposal, on_delete=models.CASCADE, related_name='follow_ups')
    related_meeting = models.ForeignKey(
        SecurityProposalMeeting, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='follow_ups'
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    due_at = models.DateTimeField(null=True, blank=True)
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='assigned_security_followups'
    )
    priority = models.CharField(
        max_length=20, 
        choices=FollowUpPriority.choices, 
        default=FollowUpPriority.MEDIUM
    )
    status = models.CharField(
        max_length=20, 
        choices=FollowUpStatus.choices, 
        default=FollowUpStatus.OPEN
    )
    completed_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='created_security_followups'
    )

    @property
    def is_overdue(self):
        if self.status == FollowUpStatus.OPEN and self.due_at:
            from django.utils import timezone
            return self.due_at < timezone.now()
        return False

    def clean(self):
        super().clean()
        if self.proposal_id and str(self.proposal.company_id) != str(self.company_id):
            raise ValidationError({'proposal': 'Proposal must belong to the same company.'})
        if self.related_meeting_id:
            if str(self.related_meeting.company_id) != str(self.company_id):
                raise ValidationError({'related_meeting': 'Related meeting must belong to the same company.'})
            if str(self.related_meeting.proposal_id) != str(self.proposal_id):
                raise ValidationError({'related_meeting': 'Related meeting must belong to this proposal.'})
        if self.assigned_to_id and str(self.assigned_to.company_id) != str(self.company_id):
            raise ValidationError({'assigned_to': 'Assigned user must belong to the same company.'})
        if self.created_by_id and str(self.created_by.company_id) != str(self.company_id):
            raise ValidationError({'created_by': 'Created by user must belong to the same company.'})
        if self.status == FollowUpStatus.COMPLETED and not self.completed_at:
            from django.utils import timezone
            self.completed_at = timezone.now()

    class Meta:
        ordering = ['status', 'due_at', '-created_at']

    def __str__(self):
        return f"{self.title} ({self.get_status_display()})"


class ProposalSignedDocument(BaseModel):
    """
    Stores signed contracts, proposals, POs, award letters, and supporting commercial documents.
    Reuses standard file storage infrastructure with strict company tenant isolation.
    """
    proposal = models.ForeignKey(SecurityProposal, on_delete=models.CASCADE, related_name='signed_documents')
    title = models.CharField(max_length=255)
    document_type = models.CharField(
        max_length=50, 
        choices=SignedDocumentCategory.choices, 
        default=SignedDocumentCategory.SIGNED_CONTRACT
    )
    file = models.FileField(upload_to='security_crm/signed_documents/%Y/%m/', null=True, blank=True)
    notes = models.TextField(blank=True, default='')
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='uploaded_security_signed_documents'
    )

    def clean(self):
        super().clean()
        if self.proposal_id and str(self.proposal.company_id) != str(self.company_id):
            raise ValidationError({'proposal': 'Proposal must belong to the same company.'})
        if self.uploaded_by_id and str(self.uploaded_by.company_id) != str(self.company_id):
            raise ValidationError({'uploaded_by': 'Uploaded by user must belong to the same company.'})

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.title} ({self.get_document_type_display()})"


