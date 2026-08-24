from django.db import models
from django.conf import settings
from erp_core.models import BaseModel


class CRMTag(BaseModel):
    name = models.CharField(max_length=50)
    color = models.CharField(max_length=20, blank=True, null=True, help_text="Hex color code")

    def __str__(self):
        return self.name

    class Meta:
        unique_together = ('company', 'name')


class CRMEntity(BaseModel):
    ENTITY_TYPE_CHOICES = (
        ('PERSON', 'Person'),
        ('COMPANY', 'Company'),
        ('GOVERNMENT', 'Government'),
        ('NGO', 'NGO'),
        ('SUPPLIER', 'Supplier'),
        ('CUSTOMER', 'Customer'),
        ('LEAD', 'Lead'),
        ('PARTNER', 'Partner'),
        ('EMPLOYEE', 'Employee'),
        ('CONTRACTOR', 'Contractor'),
        ('OTHER', 'Other'),
    )
    
    entity_type = models.CharField(max_length=20, choices=ENTITY_TYPE_CHOICES)
    
    name = models.CharField(max_length=255)
    display_name = models.CharField(max_length=255, blank=True)
    code = models.CharField(max_length=100)
    status = models.CharField(max_length=50, default='active')
    active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)
    
    website = models.URLField(blank=True)
    tax_number = models.CharField(max_length=100, blank=True)
    registration_number = models.CharField(max_length=100, blank=True)
    
    credit_limit = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    payment_terms = models.CharField(max_length=100, blank=True)
    preferred_currency = models.CharField(max_length=10, default='PKR')
    preferred_language = models.CharField(max_length=50, default='en')
    
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='created_entities')
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='owned_entities')
    
    tags = models.ManyToManyField(CRMTag, blank=True, related_name='entities')

    def __str__(self):
        return self.display_name or self.name

    class Meta:
        unique_together = ('company', 'code')
        verbose_name_plural = "CRM Entities"


class CRMEntityRole(BaseModel):
    entity = models.ForeignKey(CRMEntity, on_delete=models.CASCADE, related_name='role_mappings')
    role = models.CharField(max_length=20, choices=CRMEntity.ENTITY_TYPE_CHOICES)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['entity', 'role'],
                name='unique_entity_role'
            )
        ]
        verbose_name_plural = "CRM Entity Roles"

    def __str__(self):
        return f"{self.entity.name} - {self.get_role_display()}"


class CRMContact(BaseModel):
    entity = models.ForeignKey(CRMEntity, on_delete=models.CASCADE, related_name='contacts')
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100, blank=True)
    job_title = models.CharField(max_length=100, blank=True)
    department = models.CharField(max_length=100, blank=True)
    
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=50, blank=True)
    mobile = models.CharField(max_length=50, blank=True)
    whatsapp = models.CharField(max_length=50, blank=True)
    
    is_primary = models.BooleanField(default=False)
    receives_invoices = models.BooleanField(default=False)
    receives_quotes = models.BooleanField(default=False)
    receives_notifications = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.first_name} {self.last_name}".strip()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['entity'],
                condition=models.Q(is_primary=True),
                name='unique_primary_contact_per_entity'
            )
        ]


class CRMAddress(BaseModel):
    ADDRESS_TYPE_CHOICES = (
        ('Billing', 'Billing'),
        ('Shipping', 'Shipping'),
        ('Office', 'Office'),
        ('Warehouse', 'Warehouse'),
        ('Home', 'Home'),
        ('Other', 'Other'),
    )
    
    entity = models.ForeignKey(CRMEntity, on_delete=models.CASCADE, related_name='addresses')
    address_type = models.CharField(max_length=20, choices=ADDRESS_TYPE_CHOICES, default='Other')
    
    line1 = models.CharField(max_length=255)
    line2 = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100)
    state = models.CharField(max_length=100, blank=True)
    country = models.CharField(max_length=100, default='Pakistan')
    postal_code = models.CharField(max_length=20, blank=True)
    
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    
    is_default = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.address_type} - {self.city}"

    class Meta:
        verbose_name_plural = "CRM Addresses"
        constraints = [
            models.UniqueConstraint(
                fields=['entity', 'address_type'],
                condition=models.Q(is_default=True, address_type='Billing'),
                name='unique_default_billing_address'
            ),
            models.UniqueConstraint(
                fields=['entity', 'address_type'],
                condition=models.Q(is_default=True, address_type='Shipping'),
                name='unique_default_shipping_address'
            )
        ]


class CRMCommunication(BaseModel):
    TYPE_CHOICES = (
        ('phone', 'Phone'),
        ('meeting', 'Meeting'),
        ('email', 'Email'),
        ('note', 'Note'),
        ('whatsapp', 'WhatsApp'),
        ('visit', 'Visit'),
        ('support', 'Support'),
        ('quotation', 'Quotation'),
    )
    
    entity = models.ForeignKey(CRMEntity, on_delete=models.CASCADE, related_name='communications')
    type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    subject = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    timestamp = models.DateTimeField()
    
    def __str__(self):
        return f"{self.type} - {self.subject}"


class CRMRelationship(BaseModel):
    RELATIONSHIP_CHOICES = (
        ('Company -> Employee', 'Company -> Employee'),
        ('Supplier -> Sales Rep', 'Supplier -> Sales Rep'),
        ('Parent Company -> Subsidiary', 'Parent Company -> Subsidiary'),
        ('Vendor -> Manufacturer', 'Vendor -> Manufacturer'),
        ('Partner -> Distributor', 'Partner -> Distributor'),
        ('Other', 'Other'),
    )
    from_entity = models.ForeignKey(CRMEntity, on_delete=models.CASCADE, related_name='outgoing_relationships')
    to_entity = models.ForeignKey(CRMEntity, on_delete=models.CASCADE, related_name='incoming_relationships')
    relationship_type = models.CharField(max_length=100, choices=RELATIONSHIP_CHOICES, default='Other')
    
    def __str__(self):
        return f"{self.from_entity} -> {self.to_entity} ({self.relationship_type})"

    class Meta:
        unique_together = ('from_entity', 'to_entity', 'relationship_type')


class CRMNote(BaseModel):
    entity = models.ForeignKey(CRMEntity, on_delete=models.CASCADE, related_name='internal_notes')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    text = models.TextField()
    
    def __str__(self):
        return f"Note by {self.user} on {self.entity}"


class CRMAttachment(BaseModel):
    entity = models.ForeignKey(CRMEntity, on_delete=models.CASCADE, related_name='attachments')
    file = models.FileField(upload_to='crm/attachments/%Y/%m/%d/')
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    description = models.CharField(max_length=255, blank=True)
    
    def __str__(self):
        return self.file.name

from django.db import transaction
import datetime

class Opportunity(BaseModel):
    STAGE_CHOICES = (
        ('LEAD', 'Lead'),
        ('QUALIFIED', 'Qualified'),
        ('PROPOSAL', 'Proposal'),
        ('NEGOTIATION', 'Negotiation'),
        ('AWARDED', 'Awarded'),
        ('WON', 'Won'),
        ('LOST', 'Lost'),
    )
    
    crm_entity = models.ForeignKey(CRMEntity, on_delete=models.RESTRICT, related_name='opportunities')
    title = models.CharField(max_length=255)
    opportunity_number = models.CharField(max_length=100)
    stage = models.CharField(max_length=50, choices=STAGE_CHOICES, default='LEAD')
    estimated_value = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    probability = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    expected_close_date = models.DateField(null=True, blank=True)
    source = models.CharField(max_length=100, blank=True)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='owned_opportunities')
    notes = models.TextField(blank=True)
    
    loss_reason = models.CharField(max_length=255, blank=True)
    competitor = models.CharField(max_length=255, blank=True)
    converted_contract = models.ForeignKey('operations.ServiceContract', on_delete=models.SET_NULL, null=True, blank=True, related_name='converted_from_opportunities')

    def clean(self):
        super().clean()
        if self.crm_entity_id and self.crm_entity.company_id != self.company_id:
            raise ValidationError({'crm_entity': 'CRM Entity belongs to a different company.'})
        if self.owner_id and self.owner.company_id != self.company_id:
            raise ValidationError({'owner': 'Owner belongs to a different company.'})
        if self.converted_contract_id and self.converted_contract.company_id != self.company_id:
            raise ValidationError({'converted_contract': 'Contract belongs to a different company.'})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.opportunity_number} - {self.title}"

    class Meta:
        unique_together = ('company', 'opportunity_number')
        verbose_name_plural = "Opportunities"

class Proposal(BaseModel):
    STATUS_CHOICES = (
        ('DRAFT', 'Draft'),
        ('INTERNAL_REVIEW', 'Internal Review'),
        ('SUBMITTED', 'Submitted'),
        ('REVISED', 'Revised'),
        ('ACCEPTED', 'Accepted'),
        ('REJECTED', 'Rejected'),
        ('EXPIRED', 'Expired'),
        ('CANCELLED', 'Cancelled'),
    )

    opportunity = models.ForeignKey(Opportunity, on_delete=models.CASCADE, related_name='proposals')
    proposal_number = models.CharField(max_length=100)
    title = models.CharField(max_length=255)
    version = models.PositiveIntegerField(default=1)
    issue_date = models.DateField(default=datetime.date.today)
    valid_until = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='DRAFT')
    currency = models.CharField(max_length=10, default='PKR')
    
    subtotal = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    
    scope = models.TextField(blank=True)
    terms = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    
    submitted_at = models.DateTimeField(null=True, blank=True)
    submitted_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='submitted_proposals')
    
    def clean(self):
        super().clean()
        if self.opportunity_id and self.opportunity.company_id != self.company_id:
            raise ValidationError({'opportunity': 'Opportunity belongs to a different company.'})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.proposal_number} v{self.version}"

    class Meta:
        unique_together = ('company', 'proposal_number', 'version')

class ProposalLine(BaseModel):
    proposal = models.ForeignKey(Proposal, on_delete=models.CASCADE, related_name='lines')
    description = models.CharField(max_length=255)
    designation = models.ForeignKey('hrm.Designation', on_delete=models.SET_NULL, null=True, blank=True)
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=1)
    unit = models.CharField(max_length=50, blank=True)
    rate = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)

    def clean(self):
        super().clean()
        if self.proposal_id and self.proposal.company_id != self.company_id:
            raise ValidationError({'proposal': 'Proposal belongs to a different company.'})
        if self.designation_id and self.designation.company_id != self.company_id:
            raise ValidationError({'designation': 'Designation belongs to a different company.'})

    def save(self, *args, **kwargs):
        self.amount = float(self.quantity) * float(self.rate)
        self.full_clean()
        super().save(*args, **kwargs)

        # Update proposal totals
        prop = self.proposal
        lines = prop.lines.all()
        subtotal = sum(l.amount for l in lines) + self.amount # Current is not saved yet if pk is None
        if self.pk:
            subtotal = sum(l.amount for l in lines)
            
        prop.subtotal = subtotal
        prop.total = subtotal + prop.tax_amount
        prop.save(update_fields=['subtotal', 'total'])

class OpportunityAward(BaseModel):
    METHOD_CHOICES = (
        ('EMAIL', 'Email'),
        ('LETTER', 'Letter'),
        ('PORTAL', 'Portal'),
        ('OTHER', 'Other'),
    )
    
    opportunity = models.OneToOneField(Opportunity, on_delete=models.CASCADE, related_name='award')
    proposal = models.ForeignKey(Proposal, on_delete=models.RESTRICT, related_name='awards', null=True, blank=True)
    method = models.CharField(max_length=20, choices=METHOD_CHOICES, default='LETTER')
    award_reference = models.CharField(max_length=100, blank=True)
    award_date = models.DateField(default=datetime.date.today)
    effective_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)
    attachment = models.FileField(upload_to='crm/bd/awards/%Y/%m/%d/', null=True, blank=True)

    def clean(self):
        super().clean()
        if self.opportunity_id and self.opportunity.company_id != self.company_id:
            raise ValidationError({'opportunity': 'Opportunity belongs to a different company.'})
        if self.proposal_id and self.proposal.company_id != self.company_id:
            raise ValidationError({'proposal': 'Proposal belongs to a different company.'})
        if self.proposal_id and self.proposal.opportunity_id != self.opportunity_id:
            raise ValidationError({'proposal': 'Proposal must belong to the same Opportunity.'})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Award for {self.opportunity}"

def convert_opportunity_to_contract(opportunity_id, user):
    """
    Service routine to atomically convert a Won Opportunity + Accepted Proposal 
    into an operations.ServiceContract with prefilled ContractRates.
    """
    from operations.models import ServiceContract, ContractRate, ServiceContractStatus
    
    with transaction.atomic():
        opportunity = Opportunity.objects.select_for_update().get(id=opportunity_id, company=user.company)
        
        if opportunity.stage not in ['AWARDED', 'WON']:
            raise ValidationError("Only AWARDED or WON opportunities can be converted.")
            
        if opportunity.converted_contract_id:
            return opportunity.converted_contract
            
        proposal = opportunity.proposals.filter(status='ACCEPTED').first()
        if not proposal:
            raise ValidationError("An ACCEPTED proposal is required for conversion.")
            
        contract = ServiceContract.objects.create(
            company=opportunity.company,
            crm_entity=opportunity.crm_entity,
            contract_code=f"SC-{opportunity.opportunity_number}",
            start_date=opportunity.award.effective_date if (hasattr(opportunity, 'award') and opportunity.award.effective_date) else datetime.date.today(),
            status=ServiceContractStatus.ACTIVE,
            notes=f"Converted from Opportunity {opportunity.opportunity_number}"
        )
        
        for line in proposal.lines.all():
            if line.designation:
                ContractRate.objects.create(
                    company=opportunity.company,
                    service_contract=contract,
                    designation=line.designation,
                    billing_rate=line.rate,
                    pay_rate=0, # Pay rate should be internally managed, not from proposal
                    effective_date=contract.start_date
                )
                
        opportunity.converted_contract = contract
        opportunity.stage = 'WON'
        opportunity.save(update_fields=['converted_contract', 'stage'])
        
        return contract
