"""
services/models.py
3-Phase Service Order System:
  Phase 1 - Entry: Create order with device info, issues, department
  Phase 1b - Assign: Admin assigns a technician (required before tech phase)
  Phase 2 - Working: Technician adds parts, work logs, video evidence
  Phase 3 - Final: Delivery, payment, and invoice generation
"""
import logging
from django.db import models, transaction
from django.conf import settings
from erp_core.models import BaseModel
from crm.mixins import CRMBridgeValidationMixin
from purchasing.mixins import ProcurementBridgeValidationMixin

logger = logging.getLogger(__name__)


class ServiceOrder(CRMBridgeValidationMixin, BaseModel):
    STATUS_CHOICES = (
        ('pending', 'Pending'),         # Phase 1 - just created
        ('in_progress', 'In Progress'), # Phase 2 - technician working
        ('ready', 'Ready'),             # Phase 3 - repair done, awaiting payment
        ('return', 'Return'),           # Phase 3 - being returned unfixed
        ('delivered', 'Delivered'),     # Phase 3 - completed and paid
    )
    DEPARTMENT_CHOICES = (
        ('hardware', 'Hardware'),
        ('software', 'Software'),
    )
    SCREEN_CONDITION_CHOICES = (
        ('ok', 'OK / Undamaged'),
        ('damaged', 'Screen Damaged'),
        ('cracked', 'Cracked'),
        ('missing', 'Screen Missing'),
    )

    # --- Phase 1: Entry Fields ---
    # Customer Info
    customer_name = models.CharField(max_length=200)
    customer_phone = models.CharField(max_length=20)
    crm_entity = models.ForeignKey('crm.CRMEntity', null=True, blank=True, on_delete=models.RESTRICT)

    # Device Details
    device_brand = models.CharField(max_length=100)
    device_model = models.CharField(max_length=100)
    device_color = models.CharField(max_length=50, blank=True)
    device_imei = models.CharField(max_length=20, blank=True, help_text="IMEI or serial number")
    quantity = models.PositiveIntegerField(default=1)

    # Condition & Issues
    screen_condition = models.CharField(max_length=20, choices=SCREEN_CONDITION_CHOICES, default='ok')
    device_appearance = models.TextField(blank=True, help_text="Screen look or device damages upon receipt")
    screen_condition_notes = models.TextField(blank=True)
    issues = models.TextField(help_text="Comma-separated list of issues reported by customer")

    # Assignment
    department = models.CharField(max_length=50, choices=DEPARTMENT_CHOICES)
    # Legacy field kept for backward-compat; assignment logic uses assigned_technician
    technician = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='assigned_services'
    )
    # New: admin explicitly assigns one technician before tech phase can start
    # Accepts both hardware_technician and software_technician roles
    assigned_technician = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        limit_choices_to={'role__in': ['hardware_technician', 'software_technician']},
        related_name='assigned_technical_services',
        help_text='The technician responsible for this repair (hardware or software)'
    )

    # Pricing & Time Estimates
    estimated_cost = models.DecimalField(max_length=10, max_digits=10, decimal_places=2, default=0)
    estimated_minutes = models.IntegerField(default=60, help_text="Estimated repair time in minutes")
    technician_comments_initial = models.TextField(blank=True, help_text="Initial comment for the technician")
    commission = models.DecimalField(max_digits=10, decimal_places=2, default=0, help_text="Technician commission")

    # --- Phase 2: Working Fields ---
    # Gates: technician must click "Start Technical Phase" to unlock inject/log/media
    technical_phase_started = models.BooleanField(default=False)
    technical_phase_started_at = models.DateTimeField(null=True, blank=True)
    technician_comments = models.TextField(blank=True)

    # --- Phase 3: Final Fields ---
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    delivery_status = models.CharField(
        max_length=20,
        choices=(('in_stock', 'In Stock'), ('delivered', 'Delivered')),
        default='in_stock'
    )
    payment_method = models.CharField(
        max_length=20,
        choices=(('cash', 'Cash'), ('card', 'Card'), ('split', 'Split'), ('credit', 'Credit')),
        blank=True
    )
    final_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    is_paid = models.BooleanField(default=False)

    # Timing
    start_time = models.DateTimeField(null=True, blank=True)
    end_time = models.DateTimeField(null=True, blank=True)
    hours_worked = models.DecimalField(max_digits=6, decimal_places=2, default=0.0)

    def __str__(self):
        return f"SVC-{str(self.id)[:8].upper()} | {self.customer_name} | {self.device_brand} {self.device_model} ({self.status})"

    def save(self, *args, **kwargs):
        # -- Phase 4E: Auto-resolve CRM bridges --
        from crm.services.compatibility import get_crm_entity, resolve_customer
        if not self.crm_entity_id:
            crm_obj = get_crm_entity(self)
            if crm_obj:
                self.crm_entity = crm_obj
        # Note: ServiceOrder doesn't natively have a FK to legacy Customer, 
        # but it uses customer_name/customer_phone strings. 
        # No 'customer_id' to resolve from, but we still ensure crm_entity is synced if possible.
        # ----------------------------------------
        super().save(*args, **kwargs)

    class Meta(BaseModel.Meta):
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'department']),
            models.Index(fields=['customer_phone']),
        ]


class ServiceMedia(BaseModel):
    """Phase 2: Store images and short videos (max 30s) as evidence."""
    service_order = models.ForeignKey(ServiceOrder, on_delete=models.CASCADE, related_name='media')
    file = models.FileField(upload_to='service_media/%Y/%m/')
    media_type = models.CharField(max_length=20, choices=(('image', 'Image'), ('video', 'Video')))
    caption = models.CharField(max_length=200, blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, null=True,
        related_name='uploaded_media'
    )

    def __str__(self):
        return f"{self.media_type.upper()} for SVC-{str(self.service_order_id)[:8].upper()}"


class ServiceWorkLog(BaseModel):
    """Phase 2: Chronological ledger of technician activity on a repair."""
    service_order = models.ForeignKey(ServiceOrder, on_delete=models.CASCADE, related_name='work_logs')
    technician = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    status_change = models.CharField(max_length=20, blank=True, help_text="If this log triggered a status change")
    notes = models.TextField()

    def __str__(self):
        return f"Log for SVC-{str(self.service_order_id)[:8].upper()} by {self.technician.username}"

    class Meta(BaseModel.Meta):
        ordering = ['-created_at']


class ServicePartUsed(CRMBridgeValidationMixin, ProcurementBridgeValidationMixin, BaseModel):
    """Phase 2: Tracks physical inventory or external vendor parts consumed during a repair."""
    SOURCE_CHOICES = (
        ('inventory', 'Internal Inventory'),
        ('vendor', 'External Vendor/Service'),
    )
    service_order = models.ForeignKey(ServiceOrder, on_delete=models.CASCADE, related_name='parts_used')
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default='inventory')
    product = models.ForeignKey('inventory.Product', on_delete=models.CASCADE, null=True, blank=True)
    item = models.ForeignKey('inventory.Item', on_delete=models.RESTRICT, null=True, blank=True, related_name='service_parts')
    # Vendor link: populated when source == 'vendor', triggers payable ledger entry
    vendor = models.ForeignKey(
        'inventory.Vendor',
        on_delete=models.SET_NULL, null=True, blank=True,
        related_name='service_parts',
        help_text='Vendor to pay when source is external'
    )
    crm_entity = models.ForeignKey('crm.CRMEntity', null=True, blank=True, on_delete=models.RESTRICT)
    procurement_line = models.ForeignKey('purchasing.ProcurementLine', null=True, blank=True, on_delete=models.RESTRICT)
    part_name = models.CharField(max_length=200, blank=True, help_text="Required if source is vendor")
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=1)
    unit_cost = models.DecimalField(max_digits=10, decimal_places=2, help_text="Captured at time of use")

    @property
    def total_cost(self):
        return self.quantity * self.unit_cost

    @property
    def get_product_name(self):
        if self.source == 'vendor':
            return self.part_name
        if self.item:
            return self.item.name
        return self.product.model_name if self.product else 'Unknown Part'

    def clean(self):
        super().clean()
        if self.item and self.product:
            if self.item.company_id != self.product.company_id:
                from django.core.exceptions import ValidationError
                raise ValidationError("Item and Product must belong to the same company.")
        if self.item and self.item.company_id != self.service_order.company_id:
            from django.core.exceptions import ValidationError
            raise ValidationError("Item must belong to the service order's company.")
        if self.product and self.product.company_id != self.service_order.company_id:
            from django.core.exceptions import ValidationError
            raise ValidationError("Product must belong to the service order's company.")

    def save(self, *args, **kwargs):
        # -- Phase 4E & 5E: Auto-resolve CRM and Procurement bridges --
        from crm.services.compatibility import get_crm_entity, resolve_vendor
        from purchasing.services.compatibility import resolve_procurement_line

        # Phase 5E: Automatically resolve upwards if procurement line exists
        if not self.procurement_line_id:
            proc_line = resolve_procurement_line(self)
            if proc_line:
                self.procurement_line = proc_line

        if self.procurement_line_id:
            if not self.crm_entity_id:
                self.crm_entity_id = self.procurement_line.document.crm_entity_id
            if not getattr(self, 'vendor_id', None):
                from inventory.models import Vendor
                vend_obj = Vendor.objects.filter(crm_entity_id=self.crm_entity_id).first()
                if vend_obj:
                    self.vendor = vend_obj

        if not self.crm_entity_id:
            crm_obj = get_crm_entity(self)
            if crm_obj:
                self.crm_entity = crm_obj
        if not getattr(self, 'vendor_id', None):
            vend_obj = resolve_vendor(self)
            if vend_obj:
                self.vendor = vend_obj
        # ----------------------------------------
        
        is_new = self._state.adding
        super().save(*args, **kwargs)
        if is_new and self.source == 'inventory' and self.product:
            from platform_core.models import Warehouse
            from inventory.services.transaction_service import process_transaction
            from inventory.services.compatibility import resolve_item_from_product
            
            item_entity = resolve_item_from_product(self.product)
            if item_entity:
                warehouse = Warehouse.objects.filter(company_id=self.service_order.company_id, is_default=True).first()
                if warehouse:
                    process_transaction(
                        company=self.service_order.company,
                        item=item_entity,
                        warehouse=warehouse,
                        movement_type='SERVICE_USAGE',
                        quantity=self.quantity,
                        reference=f"SVC-{str(self.service_order_id)[:8].upper()}",
                        notes=f"Part used in Service Order {self.service_order_id}"
                    )

        if is_new and self.source == 'vendor' and self.vendor_id:
            # Create a Vendor Payable Ledger entry.
            # VendorLedger.save() will atomically update vendor.balance_due via F() expressions.
            from inventory.models import VendorLedger
            total = self.quantity * self.unit_cost
            VendorLedger.objects.create(
                company_id=self.company_id,
                vendor_id=self.vendor_id,
                transaction_type='DEBIT',
                amount=total,
                reference=f"SVC-{str(self.service_order_id)[:8].upper()}",
                notes=(
                    f"Part '{self.part_name or 'Unknown'}' x{self.quantity} "
                    f"@ PKR{self.unit_cost} used in Service Order {self.service_order_id}"
                )
            )
            logger.info(
                f"[VENDOR LEDGER] DEBIT +{total} → Vendor {self.vendor_id} "
                f"for part '{self.part_name}' in SVC-{str(self.service_order_id)[:8].upper()}"
            )

    def __str__(self):
        return f"{self.quantity} x {self.get_product_name} for SVC-{str(self.service_order_id)[:8].upper()}"

    class Meta(BaseModel.Meta):
        ordering = ['-created_at']
