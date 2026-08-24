from django.db import models
from django.conf import settings
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
        ('CLOSED', 'Closed'),
        ('ARCHIVED', 'Archived'),
    )

    document_type = models.CharField(max_length=30, choices=DOCUMENT_TYPE_CHOICES, default='PURCHASE_ORDER')
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='DRAFT')
    number = models.CharField(max_length=100)
    reference_number = models.CharField(max_length=100, blank=True)
    document_date = models.DateField()
    expected_delivery_date = models.DateField(null=True, blank=True)
    payment_terms = models.CharField(max_length=100, blank=True)
    currency = models.CharField(max_length=10, default='PKR')
    exchange_rate = models.DecimalField(max_digits=12, decimal_places=6, default=1.0)
    
    subtotal_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    
    crm_entity = models.ForeignKey('crm.CRMEntity', on_delete=models.RESTRICT, related_name='procurement_documents')
    warehouse = models.ForeignKey('platform_core.Warehouse', on_delete=models.SET_NULL, null=True, blank=True, related_name='procurement_documents')
    parent_document = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='child_documents')
    
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_procurement_documents')
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='owned_procurement_documents')
    
    notes = models.TextField(blank=True)
    tags = models.ManyToManyField(ProcurementTag, blank=True, related_name='documents')
    custom_fields = models.JSONField(default=dict, blank=True)

    def clean(self):
        super().clean()
        if self.crm_entity_id and self.crm_entity.company_id != self.company_id:
            raise ValidationError({'crm_entity': 'CRM entity belongs to a different company.'})
        if self.warehouse_id and self.warehouse.company_id != self.company_id:
            raise ValidationError({'warehouse': 'Warehouse belongs to a different company.'})
        if self.parent_document_id and self.parent_document.company_id != self.company_id:
            raise ValidationError({'parent_document': 'Parent document belongs to a different company.'})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)
        # NOTE (R-3): Inventory mutations have been REMOVED from model.save().
        # All stock changes are now exclusively handled by:
        #   purchasing.services.goods_receipt_service.post_goods_receipt()
        #   purchasing.services.goods_receipt_service.create_and_post_purchase_return()
        # Direct status changes on ProcurementDocument do NOT affect inventory.

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
    description = models.TextField(blank=True)
    
    quantity = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    received_quantity = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    billed_quantity = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    returned_quantity = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    
    unit_price = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    
    unit_of_measure = models.CharField(max_length=50, blank=True)
    line_number = models.PositiveIntegerField(default=1)
    custom_fields = models.JSONField(default=dict, blank=True)

    def clean(self):
        super().clean()
        if self.item_id and self.item.company_id != self.company_id:
            raise ValidationError({'item': 'Item belongs to a different company.'})
        if self.document_id and self.document.company_id != self.company_id:
            raise ValidationError({'document': 'Document belongs to a different company.'})

    def save(self, *args, **kwargs):
        if self.document_id and not self.company_id:
            self.company_id = self.document.company_id
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
        ('SUBMITTED', 'Submitted'),
        ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected'),
        ('RECEIVED', 'Received'),
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
