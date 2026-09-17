from decimal import Decimal
from datetime import date
from django.db import models
from django.conf import settings
from django.utils import timezone
from django.core.exceptions import ValidationError
from erp_core.models import BaseModel



class ProcurementTag(BaseModel):
    name = models.CharField(max_length=50)
    color = models.CharField(max_length=20, blank=True, null=True, help_text="Hex color code")

    def __str__(self):
        return self.name

    class Meta:
        unique_together = ('company', 'name')


class ProcurementDocument(BaseModel):
    DOCUMENT_TYPE_CHOICES = (
        ('RFQ', 'Request for Quotation'),
        ('QUOTATION', 'Quotation'),
        ('PURCHASE_ORDER', 'Purchase Order'),
        ('PURCHASE_REQUEST', 'Purchase Request'),
        ('GOODS_RECEIPT', 'Goods Receipt'),
        ('PURCHASE_RETURN', 'Purchase Return'),
        ('VENDOR_INVOICE', 'Vendor Invoice'),
        ('DEBIT_NOTE', 'Debit Note'),
        ('BLANKET_ORDER', 'Blanket Order'),
        ('CONTRACT_PURCHASE', 'Contract Purchase'),
    )

    STATUS_CHOICES = (
        ('DRAFT', 'Draft'),
        ('PENDING_APPROVAL', 'Pending Approval'),
        ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected'),
        ('CANCELLED', 'Cancelled'),
        ('SENT', 'Sent'),
        ('PARTIALLY_RECEIVED', 'Partially Received'),
        ('RECEIVED', 'Received'),
        ('PENDING_MATCH', 'Pending Match'),
        ('MATCHED', 'Matched'),
        ('MISMATCH', 'Mismatch'),
        ('POSTED', 'Posted'),
        ('CLOSED', 'Closed'),
        ('ARCHIVED', 'Archived'),
    )


    document_type = models.CharField(max_length=30, choices=DOCUMENT_TYPE_CHOICES, default='PURCHASE_ORDER')
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='DRAFT')
    number = models.CharField(max_length=100)
    reference_number = models.CharField(max_length=100, blank=True)
    vendor_invoice_number = models.CharField(max_length=100, blank=True)
    document_date = models.DateField()
    due_date = models.DateField(null=True, blank=True)
    expected_delivery_date = models.DateField(null=True, blank=True)
    payment_terms = models.CharField(max_length=100, blank=True)
    currency = models.CharField(max_length=10, default='PKR')
    exchange_rate = models.DecimalField(max_digits=12, decimal_places=6, default=1.0)
    
    subtotal_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    freight_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    
    crm_entity = models.ForeignKey('crm.CRMEntity', on_delete=models.RESTRICT, related_name='procurement_documents')
    vendor = models.ForeignKey('purchasing.Vendor', on_delete=models.RESTRICT, null=True, blank=True, related_name='procurement_documents')
    warehouse = models.ForeignKey('platform_core.Warehouse', on_delete=models.SET_NULL, null=True, blank=True, related_name='procurement_documents')
    parent_document = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='child_documents')
    
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_procurement_documents')
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='owned_procurement_documents')
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_procurement_documents')
    approved_at = models.DateTimeField(null=True, blank=True)
    approval_notes = models.TextField(blank=True)
    rejection_reason = models.TextField(blank=True)

    # Three-Way Matching & Mismatch Override Metadata
    match_status = models.CharField(max_length=30, blank=True, default='')
    match_details = models.JSONField(default=dict, blank=True)
    override_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='overridden_procurement_documents')
    override_at = models.DateTimeField(null=True, blank=True)
    override_reason = models.TextField(blank=True)

    # Accounts Payable Boundary Readiness
    ap_ready = models.BooleanField(default=False)
    payment_status = models.CharField(max_length=30, default='UNPAID')
    
    notes = models.TextField(blank=True)
    tags = models.ManyToManyField(ProcurementTag, blank=True, related_name='documents')
    custom_fields = models.JSONField(default=dict, blank=True)


    def generate_document_number(self):
        prefix_map = {
            'PURCHASE_ORDER': 'PO',
            'RFQ': 'RFQ',
            'QUOTATION': 'QUO',
            'PURCHASE_REQUEST': 'PR',
            'GOODS_RECEIPT': 'GRN',
            'PURCHASE_RETURN': 'RET',
            'VENDOR_INVOICE': 'INV',
            'DEBIT_NOTE': 'DN',
        }
        prefix = prefix_map.get(self.document_type, 'DOC')
        last_doc = ProcurementDocument.objects.filter(
            company_id=self.company_id,
            document_type=self.document_type,
            number__startswith=f"{prefix}-"
        ).order_by('-id').first()

        next_num = 1
        if last_doc and last_doc.number:
            try:
                suffix = last_doc.number.split('-')[-1]
                next_num = int(suffix) + 1
            except (ValueError, IndexError):
                next_num = ProcurementDocument.objects.filter(
                    company_id=self.company_id,
                    document_type=self.document_type
                ).count() + 1
        return f"{prefix}-{next_num:04d}"

    def clean(self):
        super().clean()
        if self.vendor_id:
            if self.vendor.company_id != self.company_id:
                raise ValidationError({'vendor': 'Vendor belongs to a different company.'})
            if not self.crm_entity_id and self.vendor.crm_entity_id:
                self.crm_entity = self.vendor.crm_entity
        elif self.crm_entity_id:
            # Check if there is an associated Vendor
            try:
                matched_vendor = getattr(self.crm_entity, 'vendor_profile', None)
                if matched_vendor and not self.vendor_id:
                    self.vendor = matched_vendor
            except Exception:
                pass


        if self.crm_entity_id and self.crm_entity.company_id != self.company_id:
            raise ValidationError({'crm_entity': 'CRM entity belongs to a different company.'})
        if self.warehouse_id and self.warehouse.company_id != self.company_id:
            raise ValidationError({'warehouse': 'Warehouse belongs to a different company.'})
        if self.parent_document_id and self.parent_document.company_id != self.company_id:
            raise ValidationError({'parent_document': 'Parent document belongs to a different company.'})

    def save(self, *args, **kwargs):
        if not self.number:
            self.number = self.generate_document_number()
        if self.vendor_id and not self.crm_entity_id and self.vendor.crm_entity_id:
            self.crm_entity = self.vendor.crm_entity
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.get_document_type_display()} #{self.number}"

    class Meta:
        unique_together = ('company', 'number')
        indexes = [
            models.Index(fields=['company', 'document_type', 'status']),
        ]
        verbose_name_plural = "Procurement Documents"


class ProcurementLine(BaseModel):
    document = models.ForeignKey(ProcurementDocument, on_delete=models.CASCADE, related_name='lines')
    item = models.ForeignKey('inventory.Item', on_delete=models.RESTRICT, related_name='procurement_lines')
    vendor_item = models.ForeignKey('purchasing.VendorItem', on_delete=models.SET_NULL, null=True, blank=True, related_name='procurement_lines')
    vendor_sku = models.CharField(max_length=100, blank=True)
    description = models.TextField(blank=True)
    
    quantity = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    received_quantity = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    accepted_quantity = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    rejected_quantity = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    rejection_reason = models.TextField(blank=True)
    billed_quantity = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    returned_quantity = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    parent_line = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='child_lines')
    
    unit_price = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    
    expected_delivery_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)
    unit_of_measure = models.CharField(max_length=50, blank=True)
    line_number = models.PositiveIntegerField(default=1)
    custom_fields = models.JSONField(default=dict, blank=True)

    def clean(self):
        super().clean()
        if self.parent_line_id and self.parent_line.company_id != self.company_id:
            raise ValidationError({'parent_line': 'Parent line belongs to a different company.'})
        if self.item_id and self.item.company_id != self.company_id:
            raise ValidationError({'item': 'Item belongs to a different company.'})

        if self.vendor_item_id and self.vendor_item.company_id != self.company_id:
            raise ValidationError({'vendor_item': 'Vendor item belongs to a different company.'})
        if self.document_id and self.document.company_id != self.company_id:
            raise ValidationError({'document': 'Document belongs to a different company.'})

    def save(self, *args, **kwargs):
        if self.document_id and not self.company_id:
            self.company_id = self.document.company_id
        if self.document_id and not self.pk:
            # If line_number is missing or conflict, assign next line number
            existing = ProcurementLine.objects.filter(document_id=self.document_id, line_number=self.line_number).exists()
            if existing:
                max_line = ProcurementLine.objects.filter(document_id=self.document_id).order_by('-line_number').first()
                self.line_number = (max_line.line_number + 1) if max_line else 1

        if self.quantity is not None and self.unit_price is not None:
            # Backend line total calculation: (qty * price) - discount + tax rounded to 2 decimal places
            subtotal = Decimal(str(self.quantity)) * Decimal(str(self.unit_price))
            disc = Decimal(str(self.discount_amount or 0))
            tax = Decimal(str(self.tax_amount or 0))
            calc_total = max(Decimal('0.00'), subtotal - disc + tax)
            self.total_amount = calc_total.quantize(Decimal('0.01'))
            if self.discount_amount:
                self.discount_amount = Decimal(str(self.discount_amount)).quantize(Decimal('0.01'))
            if self.tax_amount:
                self.tax_amount = Decimal(str(self.tax_amount)).quantize(Decimal('0.01'))
        self.full_clean()
        super().save(*args, **kwargs)



    def __str__(self):
        return f"Line {self.line_number} on {self.document.number}"

    class Meta:
        ordering = ['line_number']
        unique_together = ('document', 'line_number')



class ApprovalWorkflow(BaseModel):
    name = models.CharField(max_length=100)
    module = models.CharField(max_length=50, default='purchasing')
    document_type = models.CharField(max_length=50, blank=True)
    active = models.BooleanField(default=True)
    min_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    max_amount = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)

    def __str__(self):
        return f"{self.name} ({self.module})"

    class Meta:
        unique_together = ('company', 'name', 'module')


class ApprovalStep(BaseModel):
    workflow = models.ForeignKey(ApprovalWorkflow, on_delete=models.CASCADE, related_name='steps')
    step_number = models.PositiveIntegerField()
    name = models.CharField(max_length=100)
    approver_role = models.CharField(max_length=50, blank=True)
    approver_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)

    def clean(self):
        super().clean()
        if self.workflow_id and not self.company_id:
            self.company_id = self.workflow.company_id
        if self.approver_user_id and self.approver_user.company_id != self.company_id:
            raise ValidationError({'approver_user': 'Approver user belongs to a different company.'})

    def save(self, *args, **kwargs):
        if self.workflow_id and not self.company_id:
            self.company_id = self.workflow.company_id
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Step {self.step_number}: {self.name} ({self.workflow.name})"

    class Meta:
        ordering = ['step_number']
        unique_together = ('workflow', 'step_number')


class ApprovalHistory(BaseModel):
    ACTION_CHOICES = (
        ('SUBMITTED', 'Submitted'),
        ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected'),
        ('DELEGATED', 'Delegated'),
    )
    workflow = models.ForeignKey(ApprovalWorkflow, on_delete=models.SET_NULL, related_name='history', null=True, blank=True)
    step = models.ForeignKey(ApprovalStep, on_delete=models.SET_NULL, null=True, blank=True)
    document_id = models.UUIDField(db_index=True)
    document_model = models.CharField(max_length=100, default='purchasing.ProcurementDocument')
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    action_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    comments = models.TextField(blank=True)

    def __str__(self):
        return f"{self.action} by {self.action_by} on {self.document_model} #{self.document_id}"

    class Meta:
        ordering = ['created_at']



class ProcurementNote(BaseModel):
    NOTE_TYPE_CHOICES = (
        ('INTERNAL', 'Internal'),
        ('EXTERNAL', 'External'),
        ('VENDOR', 'Vendor Note'),
        ('APPROVAL', 'Approval Note'),
    )
    document = models.ForeignKey(ProcurementDocument, on_delete=models.CASCADE, related_name='notes_rel')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    note_type = models.CharField(max_length=20, choices=NOTE_TYPE_CHOICES, default='INTERNAL')
    text = models.TextField()

    def save(self, *args, **kwargs):
        if self.document_id and not self.company_id:
            self.company_id = self.document.company_id
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.note_type} Note by {self.user} on Document #{self.document.number}"


class ProcurementAttachment(BaseModel):
    document = models.ForeignKey(ProcurementDocument, on_delete=models.CASCADE, related_name='attachments')
    file = models.FileField(upload_to='purchasing/attachments/%Y/%m/%d/')
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    description = models.CharField(max_length=255, blank=True)

    def save(self, *args, **kwargs):
        if self.document_id and not self.company_id:
            self.company_id = self.document.company_id
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Attachment {self.file.name} for Document #{self.document.number}"


class ProcurementAuditTrail(BaseModel):
    EVENT_CHOICES = (
        ('CREATED', 'Created'),
        ('UPDATED', 'Updated'),
        ('STATUS_CHANGE', 'Status Change'),
        ('SUBMITTED', 'Submitted'),
        ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected'),
        ('SENT', 'Sent'),
        ('RECEIVED', 'Received'),
        ('POSTED', 'Posted'),
        ('CANCELLED', 'Cancelled'),
        ('CLOSED', 'Closed'),
    )

    document = models.ForeignKey(ProcurementDocument, on_delete=models.CASCADE, related_name='audit_trails')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    event = models.CharField(max_length=30, choices=EVENT_CHOICES)
    details = models.TextField(blank=True)


    def save(self, *args, **kwargs):
        if self.document_id and not self.company_id:
            self.company_id = self.document.company_id
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Audit {self.event} on Document #{self.document.number}"


# ==========================================
# PHASE S-3A: VENDOR FOUNDATION & CATALOGUE
# ==========================================

class VendorCategory(BaseModel):
    """Configurable categories for vendors (e.g. Security Equipment, Uniform Supplier, CCTV Supplier)."""
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=50, blank=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta(BaseModel.Meta):
        verbose_name_plural = "Vendor Categories"
        unique_together = ('company', 'name')
        ordering = ['name']

    def __str__(self):
        return self.name


class Vendor(BaseModel):
    """
    Tenant-aware Vendor / Supplier profile.
    Bridges with Universal CRMEntity (entity_type='SUPPLIER') for shared contacts & documents.
    """
    STATUS_CHOICES = (
        ('ACTIVE', 'Active'),
        ('INACTIVE', 'Inactive'),
        ('BLOCKED', 'Blocked'),
        ('PENDING_REVIEW', 'Pending Review'),
    )

    crm_entity = models.OneToOneField(
        'crm.CRMEntity',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='vendor_profile',
        help_text="Linked CRM entity for shared contacts, communications, and universal ledger"
    )
    code = models.CharField(max_length=100, blank=True, db_index=True)
    name = models.CharField(max_length=255)
    category = models.ForeignKey(
        VendorCategory,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='vendors'
    )

    # Primary Contact & Location
    contact_person = models.CharField(max_length=255, blank=True)
    phone = models.CharField(max_length=50, blank=True)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    website = models.URLField(blank=True)

    # Commercial & Tax
    tax_number = models.CharField(max_length=100, blank=True, help_text="NTN / GST / VAT Number")
    registration_number = models.CharField(max_length=100, blank=True, help_text="Company registration / SECP")
    payment_terms = models.CharField(max_length=100, blank=True, default='Net 30')
    credit_limit = models.DecimalField(max_digits=15, decimal_places=2, default=0)

    # Bank Details
    bank_name = models.CharField(max_length=100, blank=True)
    account_title = models.CharField(max_length=100, blank=True)
    account_number = models.CharField(max_length=100, blank=True)
    iban = models.CharField(max_length=100, blank=True)
    swift_code = models.CharField(max_length=50, blank=True)

    # Status & Operational
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='ACTIVE')
    rating = models.PositiveSmallIntegerField(default=5, help_text="Vendor rating out of 5")
    notes = models.TextField(blank=True)

    @classmethod
    def generate_next_code(cls, company_id):
        import re
        existing_codes = cls.objects.filter(
            company_id=company_id,
            code__startswith="VEN-"
        ).values_list('code', flat=True)
        max_num = 0
        pattern = re.compile(r"^VEN-(\d+)$")
        for c in existing_codes:
            match = pattern.match(c)
            if match:
                try:
                    num = int(match.group(1))
                    if num > max_num:
                        max_num = num
                except ValueError:
                    pass
        next_num = max_num + 1
        candidate = f"VEN-{next_num:04d}"
        while cls.objects.filter(company_id=company_id, code=candidate).exists():
            next_num += 1
            candidate = f"VEN-{next_num:04d}"
        return candidate

    def clean(self):
        super().clean()
        if self.category_id and self.category.company_id != self.company_id:
            raise ValidationError({'category': 'Vendor category belongs to a different company.'})
        if self.crm_entity_id and self.crm_entity.company_id != self.company_id:
            raise ValidationError({'crm_entity': 'Linked CRM Entity belongs to a different company.'})

    def save(self, *args, **kwargs):
        if not self.code or not str(self.code).strip():
            cid = self.company_id or (self.company.id if getattr(self, 'company', None) else None)
            if cid:
                self.code = self.__class__.generate_next_code(cid)
            else:
                import uuid
                self.code = f"VEN-{uuid.uuid4().hex[:6].upper()}"

        # Synchronize / create underlying CRMEntity
        if not self.crm_entity_id and self.company_id:
            from crm.models import CRMEntity
            crm_entity = CRMEntity.objects.create(
                company_id=self.company_id,
                entity_type='SUPPLIER',
                name=self.name,
                code=self.code,
                status=self.status.lower(),
                payment_terms=self.payment_terms,
                credit_limit=self.credit_limit,
                tax_number=self.tax_number,
                registration_number=self.registration_number,
                notes=self.notes
            )
            self.crm_entity = crm_entity

        self.full_clean()
        super().save(*args, **kwargs)

    class Meta(BaseModel.Meta):
        unique_together = ('company', 'code')
        ordering = ['name']
        verbose_name_plural = "Vendors"

    def __str__(self):
        return f"{self.name} ({self.code})"


class VendorItem(BaseModel):
    """
    Vendor Item Catalogue & Pricing Matrix.
    Maps a Vendor to a Universal Inventory Item with pricing, lead time, and MOQ.
    Supports multiple vendors supplying the same Inventory Item.
    """
    vendor = models.ForeignKey(Vendor, on_delete=models.CASCADE, related_name='vendor_items')
    item = models.ForeignKey('inventory.Item', on_delete=models.CASCADE, related_name='vendor_supplies')
    vendor_sku = models.CharField(max_length=100, blank=True, help_text="Vendor-specific part/catalog number")
    vendor_price = models.DecimalField(max_digits=15, decimal_places=2, default=0, help_text="Quoted supplier unit price")
    currency = models.CharField(max_length=10, default='PKR')
    minimum_order_quantity = models.DecimalField(max_digits=12, decimal_places=2, default=1)
    lead_time_days = models.PositiveIntegerField(default=0, help_text="Expected delivery lead time in days")
    last_purchase_price = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    is_preferred = models.BooleanField(default=False, help_text="Mark as preferred supplier for this item")
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)

    def clean(self):
        super().clean()
        if self.vendor_id and not self.company_id:
            self.company_id = self.vendor.company_id
        if self.vendor_id and self.vendor.company_id != self.company_id:
            raise ValidationError({'vendor': 'Vendor belongs to a different company.'})
        if self.item_id and self.item.company_id != self.company_id:
            raise ValidationError({'item': 'Item belongs to a different company.'})

    def save(self, *args, **kwargs):
        if self.vendor_id and not self.company_id:
            self.company_id = self.vendor.company_id
        self.full_clean()
        super().save(*args, **kwargs)

    class Meta(BaseModel.Meta):
        unique_together = ('vendor', 'item')
        ordering = ['-is_preferred', 'item__name']
        verbose_name_plural = "Vendor Items"

    def __str__(self):
        return f"{self.vendor.name} -> {self.item.name} ({self.currency} {self.vendor_price})"


class VendorDocument(BaseModel):
    """
    Vendor files and compliance documents.
    """
    DOCUMENT_TYPES = (
        ('AGREEMENT', 'Agreement'),
        ('TAX_CERTIFICATE', 'Tax Certificate'),
        ('BANK_DETAILS', 'Bank Details'),
        ('QUOTATION', 'Quotation'),
        ('PRICE_LIST', 'Price List'),
        ('WARRANTY', 'Warranty'),
        ('OTHER', 'Other'),
    )

    vendor = models.ForeignKey(Vendor, on_delete=models.CASCADE, related_name='documents')
    document_type = models.CharField(max_length=30, choices=DOCUMENT_TYPES, default='OTHER')
    title = models.CharField(max_length=255)
    file = models.FileField(upload_to='purchasing/vendor_documents/%Y/%m/')
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    notes = models.TextField(blank=True)

    def clean(self):
        super().clean()
        if self.vendor_id and not self.company_id:
            self.company_id = self.vendor.company_id
        if self.vendor_id and self.vendor.company_id != self.company_id:
            raise ValidationError({'vendor': 'Vendor belongs to a different company.'})

    def save(self, *args, **kwargs):
        if self.vendor_id and not self.company_id:
            self.company_id = self.vendor.company_id
        self.full_clean()
        super().save(*args, **kwargs)

    class Meta(BaseModel.Meta):
        ordering = ['-created_at']
        verbose_name_plural = "Vendor Documents"

    def __str__(self):
        return f"{self.title} ({self.get_document_type_display()}) for {self.vendor.name}"


class VendorPayment(BaseModel):
    """
    Accounts Payable Vendor Payment / Disbursement Voucher.
    Tracks payment settlements made to vendors against posted bills.
    """
    PAYMENT_METHOD_CHOICES = (
        ('BANK_TRANSFER', 'Bank Transfer'),
        ('CASH', 'Cash'),
        ('CHEQUE', 'Cheque'),
        ('ONLINE_TRANSFER', 'Online Transfer'),
        ('OTHER', 'Other'),
    )

    STATUS_CHOICES = (
        ('DRAFT', 'Draft'),
        ('POSTED', 'Posted'),
        ('CANCELLED', 'Cancelled'),
        ('REVERSED', 'Reversed'),
    )

    payment_number = models.CharField(max_length=100)
    vendor = models.ForeignKey(Vendor, on_delete=models.RESTRICT, related_name='payments')
    payment_date = models.DateField()
    payment_method = models.CharField(max_length=50, choices=PAYMENT_METHOD_CHOICES, default='BANK_TRANSFER')
    
    # Financial destination / account tracking
    bank_cash_account = models.CharField(max_length=150, blank=True, help_text="Name or identifier of Bank/Cash source account")
    account = models.ForeignKey('finance.ChartOfAccount', on_delete=models.SET_NULL, null=True, blank=True, related_name='vendor_payments')
    
    amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    currency = models.CharField(max_length=10, default='PKR')
    reference_number = models.CharField(max_length=100, blank=True, help_text="Transaction reference / Voucher ID")
    cheque_number = models.CharField(max_length=100, blank=True)
    cheque_date = models.DateField(null=True, blank=True)
    
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='DRAFT')
    notes = models.TextField(blank=True)
    
    paid_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='vendor_payments_paid')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='vendor_payments_created')
    posted_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='vendor_payments_posted')
    posted_at = models.DateTimeField(null=True, blank=True)
    
    reversed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='vendor_payments_reversed')
    reversed_at = models.DateTimeField(null=True, blank=True)
    reversal_reason = models.TextField(blank=True)

    def generate_payment_number(self):
        last_pay = VendorPayment.objects.filter(
            company_id=self.company_id,
            payment_number__startswith="VPAY-"
        ).order_by('-id').first()

        next_num = 1
        if last_pay and last_pay.payment_number:
            try:
                suffix = last_pay.payment_number.split('-')[-1]
                next_num = int(suffix) + 1
            except (ValueError, IndexError):
                next_num = VendorPayment.objects.filter(company_id=self.company_id).count() + 1
        return f"VPAY-{next_num:04d}"

    def clean(self):
        super().clean()
        if self.vendor_id and not self.company_id:
            self.company_id = self.vendor.company_id
        if self.vendor_id and self.vendor.company_id != self.company_id:
            raise ValidationError({'vendor': 'Vendor belongs to a different company.'})
        if self.account_id and self.account.company_id != self.company_id:
            raise ValidationError({'account': 'Finance account belongs to a different company.'})
        if self.paid_by_id and hasattr(self.paid_by, 'company_id') and self.paid_by.company_id != self.company_id:
            raise ValidationError({'paid_by': 'Paid-by user belongs to a different company.'})
        if self.created_by_id and hasattr(self.created_by, 'company_id') and self.created_by.company_id != self.company_id:
            raise ValidationError({'created_by': 'Created-by user belongs to a different company.'})
        if self.posted_by_id and hasattr(self.posted_by, 'company_id') and self.posted_by.company_id != self.company_id:
            raise ValidationError({'posted_by': 'Posted-by user belongs to a different company.'})
        if self.reversed_by_id and hasattr(self.reversed_by, 'company_id') and self.reversed_by.company_id != self.company_id:
            raise ValidationError({'reversed_by': 'Reversed-by user belongs to a different company.'})

    def save(self, *args, **kwargs):
        if not self.payment_number:
            self.payment_number = self.generate_payment_number()
        if self.vendor_id and not self.company_id:
            self.company_id = self.vendor.company_id
        if self.amount:
            self.amount = Decimal(str(self.amount)).quantize(Decimal('0.01'))
        self.full_clean()
        super().save(*args, **kwargs)

    class Meta(BaseModel.Meta):
        unique_together = ('company', 'payment_number')
        ordering = ['-payment_date', '-created_at']
        verbose_name_plural = "Vendor Payments"

    def __str__(self):
        return f"{self.payment_number} — {self.vendor.name} ({self.currency} {self.amount}) [{self.status}]"


class VendorPaymentAllocation(BaseModel):
    """
    Individual bill settlement allocation for a Vendor Payment.
    Maps a payment to one or more posted vendor invoices.
    """
    payment = models.ForeignKey(VendorPayment, on_delete=models.CASCADE, related_name='allocations')
    invoice = models.ForeignKey(ProcurementDocument, on_delete=models.RESTRICT, related_name='payment_allocations')
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    notes = models.TextField(blank=True)

    def clean(self):
        super().clean()
        if self.payment_id and not self.company_id:
            self.company_id = self.payment.company_id
        if self.payment_id and self.payment.company_id != self.company_id:
            raise ValidationError({'payment': 'Payment belongs to a different company.'})
        if self.invoice_id and self.invoice.company_id != self.company_id:
            raise ValidationError({'invoice': 'Invoice belongs to a different company.'})
        if self.invoice_id and self.payment_id and self.invoice.vendor_id != self.payment.vendor_id:
            raise ValidationError({'invoice': 'Invoice vendor does not match payment vendor.'})
        if self.invoice_id and self.invoice.document_type != 'VENDOR_INVOICE':
            raise ValidationError({'invoice': 'Payment allocation can only be applied to VENDOR_INVOICE documents.'})

    def save(self, *args, **kwargs):
        if self.payment_id and not self.company_id:
            self.company_id = self.payment.company_id
        if self.amount:
            self.amount = Decimal(str(self.amount)).quantize(Decimal('0.01'))
        self.full_clean()
        super().save(*args, **kwargs)

    class Meta(BaseModel.Meta):
        ordering = ['-created_at']
        verbose_name_plural = "Vendor Payment Allocations"

    def __str__(self):
        return f"Allocation: {self.payment.payment_number} -> {self.invoice.number} ({self.amount})"


RETURN_REASON_CHOICES = (
    ('DAMAGED', 'Damaged Goods'),
    ('DEFECTIVE', 'Defective Equipment'),
    ('WRONG_ITEM', 'Wrong Item Received'),
    ('EXCESS_QUANTITY', 'Excess Quantity Received'),
    ('QUALITY_REJECTED', 'Quality Inspection Rejected'),
    ('WARRANTY_RETURN', 'Warranty / RMA Return'),
    ('OTHER', 'Other / Commercial Reason')
)

RETURN_STATUS_CHOICES = (
    ('DRAFT', 'Draft'),
    ('PENDING_APPROVAL', 'Pending Approval'),
    ('APPROVED', 'Approved'),
    ('POSTED', 'Posted'),
    ('CANCELLED', 'Cancelled')
)


class PurchaseReturn(BaseModel):
    """
    Tenant-aware Purchase Return document tracking returned, defective, or rejected goods.
    Triggers inventory stock OUT and vendor credit notes upon posting.
    """
    return_number = models.CharField(max_length=100)
    vendor = models.ForeignKey(Vendor, on_delete=models.RESTRICT, related_name='purchase_returns')
    crm_entity = models.ForeignKey('crm.CRMEntity', on_delete=models.RESTRICT, null=True, blank=True, related_name='purchase_returns')
    purchase_order = models.ForeignKey(ProcurementDocument, on_delete=models.SET_NULL, null=True, blank=True, related_name='po_purchase_returns')
    goods_receipt = models.ForeignKey(ProcurementDocument, on_delete=models.SET_NULL, null=True, blank=True, related_name='grn_purchase_returns')
    vendor_invoice = models.ForeignKey(ProcurementDocument, on_delete=models.SET_NULL, null=True, blank=True, related_name='invoice_purchase_returns')
    warehouse = models.ForeignKey('platform_core.Warehouse', on_delete=models.RESTRICT, related_name='purchase_returns')
    
    return_date = models.DateField(default=timezone.now)
    reason = models.CharField(max_length=50, choices=RETURN_REASON_CHOICES, default='DEFECTIVE')
    status = models.CharField(max_length=30, choices=RETURN_STATUS_CHOICES, default='DRAFT')
    
    total_return_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    currency = models.CharField(max_length=10, default='PKR')
    
    notes = models.TextField(blank=True)
    rejection_reason = models.TextField(blank=True)
    
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_purchase_returns')
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_purchase_returns')
    approved_at = models.DateTimeField(null=True, blank=True)
    posted_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='posted_purchase_returns')
    posted_at = models.DateTimeField(null=True, blank=True)
    cancelled_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='cancelled_purchase_returns')
    cancelled_at = models.DateTimeField(null=True, blank=True)
    custom_fields = models.JSONField(default=dict, blank=True)

    def generate_return_number(self):
        last_ret = PurchaseReturn.objects.filter(
            company_id=self.company_id,
            return_number__startswith='RET-'
        ).order_by('-id').first()

        next_num = 1
        if last_ret and last_ret.return_number:
            try:
                suffix = last_ret.return_number.split('-')[-1]
                next_num = int(suffix) + 1
            except (ValueError, IndexError):
                next_num = PurchaseReturn.objects.filter(company_id=self.company_id).count() + 1
        return f"RET-{next_num:04d}"

    def clean(self):
        super().clean()
        if self.vendor_id and self.vendor.company_id != self.company_id:
            raise ValidationError({'vendor': 'Vendor belongs to a different company.'})
        if self.warehouse_id and self.warehouse.company_id != self.company_id:
            raise ValidationError({'warehouse': 'Warehouse belongs to a different company.'})
        if self.purchase_order_id and self.purchase_order.company_id != self.company_id:
            raise ValidationError({'purchase_order': 'Purchase Order belongs to a different company.'})
        if self.goods_receipt_id and self.goods_receipt.company_id != self.company_id:
            raise ValidationError({'goods_receipt': 'Goods Receipt belongs to a different company.'})
        if self.vendor_invoice_id and self.vendor_invoice.company_id != self.company_id:
            raise ValidationError({'vendor_invoice': 'Vendor Invoice belongs to a different company.'})

    def save(self, *args, **kwargs):
        if not self.return_number:
            self.return_number = self.generate_return_number()
        if self.vendor_id and not self.company_id:
            self.company_id = self.vendor.company_id
        if self.vendor_id and not self.crm_entity_id and getattr(self.vendor, 'crm_entity_id', None):
            self.crm_entity = self.vendor.crm_entity
        if self.total_return_amount:
            self.total_return_amount = Decimal(str(self.total_return_amount)).quantize(Decimal('0.01'))
        self.full_clean()
        super().save(*args, **kwargs)

    class Meta(BaseModel.Meta):
        unique_together = ('company', 'return_number')
        ordering = ['-return_date', '-created_at']
        verbose_name_plural = "Purchase Returns"

    def __str__(self):
        return f"{self.return_number} — {self.vendor.name} ({self.currency} {self.total_return_amount}) [{self.status}]"


class PurchaseReturnLine(BaseModel):
    """
    Line item for a Purchase Return. Specifies quantity, unit cost, and serials to return.
    """
    purchase_return = models.ForeignKey(PurchaseReturn, on_delete=models.CASCADE, related_name='lines')
    grn_line = models.ForeignKey(ProcurementLine, on_delete=models.SET_NULL, null=True, blank=True, related_name='purchase_return_lines')
    item = models.ForeignKey('inventory.Item', on_delete=models.RESTRICT, related_name='purchase_return_lines')
    description = models.TextField(blank=True)
    
    received_quantity = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    previously_returned_quantity = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    return_quantity = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    unit_cost = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    
    reason = models.CharField(max_length=50, blank=True)
    serial_numbers = models.JSONField(default=list, blank=True)
    is_rejected_at_grn = models.BooleanField(default=False)
    line_number = models.PositiveIntegerField(default=1)
    notes = models.TextField(blank=True)

    def clean(self):
        super().clean()
        if self.purchase_return_id and not self.company_id:
            self.company_id = self.purchase_return.company_id
        if self.purchase_return_id and self.purchase_return.company_id != self.company_id:
            raise ValidationError({'purchase_return': 'Purchase return belongs to a different company.'})
        if self.item_id and self.item.company_id != self.company_id:
            raise ValidationError({'item': 'Item belongs to a different company.'})
        if self.grn_line_id and self.grn_line.company_id != self.company_id:
            raise ValidationError({'grn_line': 'GRN line belongs to a different company.'})

    def save(self, *args, **kwargs):
        if self.purchase_return_id and not self.company_id:
            self.company_id = self.purchase_return.company_id
        if self.return_quantity is not None and self.unit_cost is not None:
            self.total_amount = (Decimal(str(self.return_quantity)) * Decimal(str(self.unit_cost))).quantize(Decimal('0.01'))
        self.full_clean()
        super().save(*args, **kwargs)

    class Meta(BaseModel.Meta):
        ordering = ['line_number']
        verbose_name_plural = "Purchase Return Lines"

    def __str__(self):
        return f"Return Line #{self.line_number}: {self.item.name} x {self.return_quantity}"


class VendorCreditNote(BaseModel):
    """
    Vendor credit note / debit adjustment record generated by a posted Purchase Return.
    Reduces the outstanding payable of a linked bill without creating negative balances.
    """
    credit_note_number = models.CharField(max_length=100)
    vendor = models.ForeignKey(Vendor, on_delete=models.RESTRICT, related_name='credit_notes')
    purchase_return = models.ForeignKey(PurchaseReturn, on_delete=models.CASCADE, related_name='credit_notes')
    vendor_invoice = models.ForeignKey(ProcurementDocument, on_delete=models.SET_NULL, null=True, blank=True, related_name='credit_notes')
    
    credit_date = models.DateField(default=timezone.now)
    amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    allocated_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    unallocated_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    
    status = models.CharField(max_length=30, default='POSTED')
    currency = models.CharField(max_length=10, default='PKR')
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_credit_notes')

    def generate_credit_note_number(self):
        last_cn = VendorCreditNote.objects.filter(
            company_id=self.company_id,
            credit_note_number__startswith='CN-'
        ).order_by('-id').first()

        next_num = 1
        if last_cn and last_cn.credit_note_number:
            try:
                suffix = last_cn.credit_note_number.split('-')[-1]
                next_num = int(suffix) + 1
            except (ValueError, IndexError):
                next_num = VendorCreditNote.objects.filter(company_id=self.company_id).count() + 1
        return f"CN-{next_num:04d}"

    def clean(self):
        super().clean()
        if self.vendor_id and self.vendor.company_id != self.company_id:
            raise ValidationError({'vendor': 'Vendor belongs to a different company.'})
        if self.purchase_return_id and self.purchase_return.company_id != self.company_id:
            raise ValidationError({'purchase_return': 'Purchase return belongs to a different company.'})
        if self.vendor_invoice_id and self.vendor_invoice.company_id != self.company_id:
            raise ValidationError({'vendor_invoice': 'Vendor invoice belongs to a different company.'})

    def save(self, *args, **kwargs):
        if not self.credit_note_number:
            self.credit_note_number = self.generate_credit_note_number()
        if self.vendor_id and not self.company_id:
            self.company_id = self.vendor.company_id
        if self.amount:
            self.amount = Decimal(str(self.amount)).quantize(Decimal('0.01'))
        if self.allocated_amount:
            self.allocated_amount = Decimal(str(self.allocated_amount)).quantize(Decimal('0.01'))
        if self.unallocated_amount:
            self.unallocated_amount = Decimal(str(self.unallocated_amount)).quantize(Decimal('0.01'))
        self.full_clean()
        super().save(*args, **kwargs)

    class Meta(BaseModel.Meta):
        unique_together = ('company', 'credit_note_number')
        ordering = ['-credit_date', '-created_at']
        verbose_name_plural = "Vendor Credit Notes"

    def __str__(self):
        return f"{self.credit_note_number} — {self.vendor.name} ({self.currency} {self.amount})"


# ===========================================================================
# PHASE S-3G: VENDOR RECONCILIATION & STATEMENT
# ===========================================================================

class VendorReconciliation(BaseModel):
    """
    Periodic balance reconciliation record comparing Zorvex calculated ledger balance
    against the Vendor's self-reported statement balance.
    Tracks status: PENDING, MATCHED, VARIANCE, RESOLVED.
    """
    STATUS_CHOICES = (
        ('PENDING', 'Pending Review'),
        ('MATCHED', 'Matched (Zero Variance)'),
        ('VARIANCE', 'Variance Detected'),
        ('RESOLVED', 'Resolved'),
    )

    reconciliation_number = models.CharField(max_length=100)
    vendor = models.ForeignKey(Vendor, on_delete=models.CASCADE, related_name='reconciliations')
    statement_date = models.DateField(default=timezone.now)
    as_of_date = models.DateField(default=timezone.now, help_text="Transaction cutoff date for system balance")
    
    vendor_reported_balance = models.DecimalField(max_digits=15, decimal_places=2, default=0, help_text="Balance reported on vendor's statement")
    system_balance = models.DecimalField(max_digits=15, decimal_places=2, default=0, help_text="Calculated outstanding payable in Zorvex")
    variance = models.DecimalField(max_digits=15, decimal_places=2, default=0, help_text="system_balance - vendor_reported_balance")
    
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='PENDING')
    currency = models.CharField(max_length=10, default='PKR')
    notes = models.TextField(blank=True, help_text="Investigation notes regarding discrepancies")
    resolution_notes = models.TextField(blank=True, help_text="Action notes explaining how variance was reconciled")
    
    reconciled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reconciled_vendor_statements'
    )
    reconciled_at = models.DateTimeField(null=True, blank=True)
    
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='resolved_vendor_reconciliations'
    )
    resolved_at = models.DateTimeField(null=True, blank=True)

    def generate_reconciliation_number(self):
        last_rec = VendorReconciliation.objects.filter(
            company_id=self.company_id,
            reconciliation_number__startswith='REC-'
        ).order_by('-id').first()

        next_num = 1
        if last_rec and last_rec.reconciliation_number:
            try:
                suffix = last_rec.reconciliation_number.split('-')[-1]
                next_num = int(suffix) + 1
            except (ValueError, IndexError):
                next_num = VendorReconciliation.objects.filter(company_id=self.company_id).count() + 1
        return f"REC-{next_num:04d}"

    def clean(self):
        super().clean()
        if self.vendor_id and self.vendor.company_id != self.company_id:
            raise ValidationError({'vendor': 'Vendor belongs to a different company.'})

    def save(self, *args, **kwargs):
        if not self.reconciliation_number:
            self.reconciliation_number = self.generate_reconciliation_number()
        if self.vendor_id and not self.company_id:
            self.company_id = self.vendor.company_id
        if self.vendor_reported_balance is not None:
            self.vendor_reported_balance = Decimal(str(self.vendor_reported_balance)).quantize(Decimal('0.01'))
        if self.system_balance is not None:
            self.system_balance = Decimal(str(self.system_balance)).quantize(Decimal('0.01'))
            
        # Compute variance: system_balance - vendor_reported_balance
        if self.system_balance is not None and self.vendor_reported_balance is not None:
            self.variance = (self.system_balance - self.vendor_reported_balance).quantize(Decimal('0.01'))
            if self.status != 'RESOLVED':
                if self.variance == Decimal('0.00'):
                    self.status = 'MATCHED'
                else:
                    self.status = 'VARIANCE'
                    
        self.full_clean()
        super().save(*args, **kwargs)

    class Meta(BaseModel.Meta):
        unique_together = ('company', 'reconciliation_number')
        ordering = ['-statement_date', '-created_at']
        verbose_name_plural = "Vendor Reconciliations"

    def __str__(self):
        return f"{self.reconciliation_number} — {self.vendor.name} ({self.status}: Var {self.currency} {self.variance})"


