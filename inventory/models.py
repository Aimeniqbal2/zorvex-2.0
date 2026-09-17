from django.db import models, transaction
from django.db.models import Q
from erp_core.models import BaseModel
from crm.mixins import CRMBridgeValidationMixin
from purchasing.mixins import ProcurementBridgeValidationMixin


class Category(BaseModel):
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        verbose_name_plural = "Categories"
        ordering = ['name']

    def __str__(self):
        return self.name


class Product(BaseModel):
    """
    Core product/item record for inventory.
    Covers both physical goods for sale and spare parts used in repairs.
    """
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, blank=True, related_name='products')
    brand = models.CharField(max_length=100)
    model_name = models.CharField(max_length=100)
    color = models.CharField(max_length=50, blank=True)
    storage_capacity = models.CharField(max_length=50, blank=True, help_text="e.g. 128GB, 256GB")
    barcode = models.CharField(max_length=100, blank=True, db_index=True, help_text="Barcode/SKU for scanner input")

    # Pricing
    cost_price = models.DecimalField(max_digits=10, decimal_places=2, default=0, help_text="Purchase cost")
    sale_price = models.DecimalField(max_digits=10, decimal_places=2, default=0, help_text="Retail sale price")
    service_price = models.DecimalField(max_digits=10, decimal_places=2, default=0, help_text="Service/repair price charged to customer")
    commission = models.DecimalField(max_digits=10, decimal_places=2, default=0, help_text="Staff commission per unit sold")

    # Keep legacy `price` as a computed property for backward compat
    @property
    def price(self):
        return self.sale_price

    # Stock
    stock_quantity = models.IntegerField(default=0)
    low_stock_threshold = models.IntegerField(default=5, help_text="Alert when stock falls below this level")

    # Optional notes
    issues = models.TextField(blank=True, help_text="Known issues or product description notes")

    @property
    def profit_per_unit(self):
        return self.sale_price - self.cost_price

    @property
    def is_low_stock(self):
        from .services.compatibility import resolve_item_from_product
        from django.db.models import Sum
        item_entity = resolve_item_from_product(self)
        if item_entity:
            stock_res = item_entity.balances.aggregate(total=Sum('quantity'))['total']
            if stock_res is not None:
                return stock_res <= self.low_stock_threshold
        return self.stock_quantity <= self.low_stock_threshold

    def __str__(self):
        from .services.compatibility import resolve_item_from_product
        from django.db.models import Sum
        item_entity = resolve_item_from_product(self)
        stock = self.stock_quantity
        if item_entity:
            stock_res = item_entity.balances.aggregate(total=Sum('quantity'))['total']
            if stock_res is not None:
                stock = stock_res
        return f"{self.brand} {self.model_name} ({self.storage_capacity}) - Stock: {stock}"

    class Meta(BaseModel.Meta):
        ordering = ['brand', 'model_name']
        indexes = [
            models.Index(fields=['brand', 'model_name']),
            models.Index(fields=['barcode']),
        ]


class StockMovement(BaseModel):
    MOVEMENT_TYPES = (
        ('IN', 'Stock In'), 
        ('OUT', 'Stock Out'), 
        ('ADJUST', 'Adjustment'),
        ('OPENING_BALANCE', 'Opening Balance'),
        ('PURCHASE', 'Purchase'),
        ('PURCHASE_RETURN', 'Purchase Return'),
        ('SALE', 'Sale'),
        ('SALE_RETURN', 'Sale Return'),
        ('TRANSFER_IN', 'Transfer In'),
        ('TRANSFER_OUT', 'Transfer Out'),
        ('SERVICE_USAGE', 'Service Usage'),
        ('ADJUSTMENT_IN', 'Adjustment In'),
        ('ADJUSTMENT_OUT', 'Adjustment Out'),
        ('DAMAGE', 'Damage'),
        ('LOSS', 'Loss'),
        ('EMPLOYEE_ISSUE', 'Employee Issue'),
        ('EMPLOYEE_RETURN', 'Employee Return'),
        ('SITE_ISSUE', 'Site Issue'),
        ('SITE_RETURN', 'Site Return'),
    )
    # Legacy field
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='movements', null=True, blank=True)
    
    # New Phase 3 fields
    item = models.ForeignKey('Item', on_delete=models.CASCADE, related_name='movements', null=True, blank=True)
    warehouse = models.ForeignKey('platform_core.Warehouse', on_delete=models.CASCADE, related_name='stock_movements', null=True, blank=True)
    
    quantity = models.DecimalField(max_digits=12, decimal_places=2)
    movement_type = models.CharField(max_length=20, choices=MOVEMENT_TYPES)
    reference = models.CharField(max_length=100, blank=True, help_text="Invoice/PO/Service Order reference")
    notes = models.TextField(blank=True)

    def clean(self):
        super().clean()
        if self.item and self.product:
            if self.item.company_id != self.product.company_id:
                from django.core.exceptions import ValidationError
                raise ValidationError("Item and Product must belong to the same company.")
        if self.item and self.item.company_id != self.company_id:
            from django.core.exceptions import ValidationError
            raise ValidationError("Item must belong to the company.")
        if self.product and self.product.company_id != self.company_id:
            from django.core.exceptions import ValidationError
            raise ValidationError("Product must belong to the company.")

    def save(self, *args, **kwargs):
        if not self._state.adding:
            from django.core.exceptions import ValidationError
            raise ValidationError("Stock movements are immutable and cannot be modified.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        from django.core.exceptions import ValidationError
        raise ValidationError("Stock movements are immutable and cannot be deleted.")

    def __str__(self):
        name = self.item.name if self.item else (self.product.model_name if self.product else 'Unknown')
        return f"{self.movement_type} {self.quantity} for {name}"

    class Meta(BaseModel.Meta):
        ordering = ['-created_at']


class Vendor(CRMBridgeValidationMixin, BaseModel):
    crm_entity = models.ForeignKey('crm.CRMEntity', null=True, blank=True, on_delete=models.RESTRICT)
    name = models.CharField(max_length=200)
    contact_email = models.EmailField(blank=True)
    contact_phone = models.CharField(max_length=20, blank=True)
    address = models.TextField(blank=True)
    # Running payable balance — increases when parts ordered, decreases on payment
    balance_due = models.DecimalField(
        max_digits=12, decimal_places=2, default=0,
        help_text='Current amount owed to this vendor (total_purchases - total_paid)'
    )
    total_purchases = models.DecimalField(
        max_digits=12, decimal_places=2, default=0,
        help_text='Cumulative value of all parts/services ordered from vendor'
    )
    total_paid = models.DecimalField(
        max_digits=12, decimal_places=2, default=0,
        help_text='Cumulative amount paid back to this vendor'
    )

    # Legacy alias — kept for backward compat with any code using vendor.balance
    @property
    def balance(self):
        return self.balance_due

    def __str__(self):
        return f"{self.name} (Payable: PKR {self.balance_due})"

    class Meta(BaseModel.Meta):
        ordering = ['name']


class VendorLedger(CRMBridgeValidationMixin, ProcurementBridgeValidationMixin, BaseModel):
    """Chronological record of all payable/payment transactions for a vendor."""
    TRANSACTION_TYPES = (
        ('DEBIT', 'Debit (Part/Service Ordered)'),
        ('CREDIT', 'Credit (Payment Made to Vendor)'),
    )
    vendor = models.ForeignKey(Vendor, on_delete=models.CASCADE, null=True, blank=True, related_name='ledger_entries')
    crm_entity = models.ForeignKey('crm.CRMEntity', null=True, blank=True, on_delete=models.RESTRICT)
    procurement_document = models.ForeignKey('purchasing.ProcurementDocument', null=True, blank=True, on_delete=models.RESTRICT)
    transaction_type = models.CharField(max_length=10, choices=TRANSACTION_TYPES)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    reference = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)

    def clean(self):
        super().clean()
        if not getattr(self, 'vendor_id', None) and not self.crm_entity_id:
            from django.core.exceptions import ValidationError
            raise ValidationError("Either legacy vendor or crm_entity must be provided.")

    def save(self, *args, **kwargs):
        self.clean()
        # -- Phase 4E: Auto-resolve CRM bridges --
        from crm.services.compatibility import get_crm_entity, resolve_vendor
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
        if is_new:
            import logging
            from django.db.models import F
            logger = logging.getLogger(__name__)
            try:
                with transaction.atomic():
                    if getattr(self, 'vendor_id', None):
                        if self.transaction_type == 'DEBIT':
                            # Parts/service ordered from vendor — amount owed increases
                            Vendor._default_manager.filter(pk=self.vendor_id).update(
                                total_purchases=F('total_purchases') + self.amount,
                                balance_due=F('balance_due') + self.amount,
                            )
                            logger.info(
                                f"[VENDOR LEDGER] DEBIT +{self.amount} → Vendor {self.vendor_id} "
                                f"(total_purchases & balance_due increased)"
                            )
                        else:
                            # Payment made to vendor — amount owed decreases
                            Vendor._default_manager.filter(pk=self.vendor_id).update(
                                total_paid=F('total_paid') + self.amount,
                                balance_due=F('balance_due') - self.amount,
                            )
                            logger.info(
                                f"[VENDOR LEDGER] CREDIT -{self.amount} → Vendor {self.vendor_id} "
                                f"(total_paid increased, balance_due decreased)"
                            )
                    elif self.crm_entity_id:
                        logger.info(f"[VENDOR LEDGER] {self.transaction_type} {self.amount} → CRMEntity {self.crm_entity_id}")
            except Exception as e:
                logger.error(f"[VENDOR LEDGER] Failed to update Vendor aggregates for entry {self.pk}: {e}")

        # Task 3: Vendor Ledger
        # Try to resolve procurement document if missing
        if not self.procurement_document_id and self.reference:
            import re
            from purchasing.models import ProcurementDocument
            match = re.search(r'PO-([a-fA-F0-9\-]+)', self.reference)
            if match:
                po_id_str = match.group(1)
                proc_doc = ProcurementDocument.objects.filter(company=self.company, number=f"PROC-PO-{po_id_str}").first()
                if not proc_doc:
                    proc_doc = ProcurementDocument.objects.filter(company=self.company, number__icontains=po_id_str).first()
                if proc_doc:
                    self.procurement_document = proc_doc
                    VendorLedger.objects.filter(pk=self.pk).update(procurement_document=proc_doc)


    def __str__(self):
        return f"{self.transaction_type} PKR{self.amount} - {self.vendor.name}"

    class Meta(BaseModel.Meta):
        ordering = ['-created_at']


class PurchaseOrder(CRMBridgeValidationMixin, ProcurementBridgeValidationMixin, BaseModel):
    STATUS_CHOICES = (
        ('DRAFT', 'Draft'),
        ('ORDERED', 'Ordered'),
        ('RECEIVED', 'Received'),
        ('CANCELLED', 'Cancelled')
    )
    vendor = models.ForeignKey(Vendor, on_delete=models.CASCADE, null=True, blank=True, related_name='purchase_orders')
    crm_entity = models.ForeignKey('crm.CRMEntity', null=True, blank=True, on_delete=models.RESTRICT)
    procurement_document = models.ForeignKey('purchasing.ProcurementDocument', null=True, blank=True, on_delete=models.RESTRICT)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='DRAFT')
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    notes = models.TextField(blank=True)

    def clean(self):
        super().clean()
        if not getattr(self, 'vendor_id', None) and not self.crm_entity_id:
            from django.core.exceptions import ValidationError
            raise ValidationError("Either legacy vendor or crm_entity must be provided.")

    def save(self, *args, **kwargs):
        self.clean()
        # -- Phase 4E & 5B: Auto-resolve bridges --
        from crm.services.compatibility import get_crm_entity, resolve_vendor
        from purchasing.services.compatibility import get_procurement_document
        if not self.crm_entity_id:
            crm_obj = get_crm_entity(self)
            if crm_obj:
                self.crm_entity = crm_obj
        if not getattr(self, 'vendor_id', None):
            vend_obj = resolve_vendor(self)
            if vend_obj:
                self.vendor = vend_obj
        if not getattr(self, 'procurement_document_id', None):
            proc_doc = get_procurement_document(self)
            if proc_doc:
                self.procurement_document = proc_doc
        # ----------------------------------------
        
        super().save(*args, **kwargs)

        # -- Phase 5E: Auto-sync ProcurementDocument --
        from purchasing.models import ProcurementDocument
        from datetime import date
        with transaction.atomic():
            status_mapped = {
                'DRAFT': 'DRAFT',
                'ORDERED': 'APPROVED',
                'RECEIVED': 'RECEIVED',
                'CANCELLED': 'CANCELLED'
            }.get(self.status, 'DRAFT')
            
            doc_number = f"PROC-PO-{self.id}"
            
            doc_date = getattr(self, 'created_at', date.today())
            if not isinstance(doc_date, date) and doc_date:
                doc_date = doc_date.date()
            if not doc_date:
                doc_date = date.today()

            import decimal
            proc_doc, _ = ProcurementDocument.objects.update_or_create(
                company=self.company,
                number=doc_number,
                defaults={
                    'document_type': 'PURCHASE_ORDER',
                    'status': status_mapped,
                    'document_date': doc_date,
                    'total_amount': self.total_amount.quantize(decimal.Decimal('0.01')) if self.total_amount else decimal.Decimal('0.00'),
                    'subtotal_amount': self.total_amount.quantize(decimal.Decimal('0.01')) if self.total_amount else decimal.Decimal('0.00'),
                    'crm_entity': self.crm_entity,
                    'notes': self.notes or "",
                }
            )
            
            if self.procurement_document_id != proc_doc.id:
                self.procurement_document = proc_doc
                PurchaseOrder.objects.filter(pk=self.pk).update(procurement_document=proc_doc)

    def __str__(self):
        return f"PO-{str(self.id)[:8].upper()} | {self.vendor.name}"

    class Meta(BaseModel.Meta):
        ordering = ['-created_at']


class PurchaseOrderItem(ProcurementBridgeValidationMixin, BaseModel):
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    item = models.ForeignKey('Item', null=True, blank=True, on_delete=models.RESTRICT, related_name='po_items')
    procurement_line = models.ForeignKey('purchasing.ProcurementLine', null=True, blank=True, on_delete=models.RESTRICT)
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=1)
    unit_cost = models.DecimalField(max_digits=10, decimal_places=2)

    @property
    def total_cost(self):
        return self.quantity * self.unit_cost

    def clean(self):
        super().clean()
        if self.item and self.product:
            if self.item.company_id != self.product.company_id:
                from django.core.exceptions import ValidationError
                raise ValidationError("Item and Product must belong to the same company.")
        if self.item and self.item.company_id != self.purchase_order.company_id:
            from django.core.exceptions import ValidationError
            raise ValidationError("Item must belong to the purchase order's company.")
        if self.product and self.product.company_id != self.purchase_order.company_id:
            from django.core.exceptions import ValidationError
            raise ValidationError("Product must belong to the purchase order's company.")

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)

        # -- Phase 5E: Auto-sync ProcurementLine --
        from purchasing.models import ProcurementLine
        from inventory.services.compatibility import resolve_item_from_product
        
        item_obj = self.item
        if not item_obj and getattr(self, 'product', None):
            item_obj = resolve_item_from_product(self.product)
            
        po = self.purchase_order
        if po and po.procurement_document:
            desc = self.product.model_name if self.product else (item_obj.name if item_obj else "")
            
            with transaction.atomic():
                import decimal
                q_unit = self.unit_cost.quantize(decimal.Decimal('0.01')) if self.unit_cost else decimal.Decimal('0.00')
                q_total = self.total_cost.quantize(decimal.Decimal('0.01')) if self.total_cost else decimal.Decimal('0.00')
                
                if self.procurement_line_id:
                    proc_line = ProcurementLine.objects.filter(pk=self.procurement_line_id).first()
                    if proc_line:
                        proc_line.quantity = self.quantity
                        proc_line.unit_price = q_unit
                        proc_line.total_amount = q_total
                        proc_line.description = desc
                        proc_line.save()
                else:
                    line_num = ProcurementLine.objects.filter(document=po.procurement_document).count() + 1
                    proc_line = ProcurementLine.objects.create(
                        company=self.company,
                        document=po.procurement_document,
                        line_number=line_num,
                        item=item_obj,
                        quantity=self.quantity,
                        unit_price=q_unit,
                        total_amount=q_total,
                        description=desc
                    )
                    self.procurement_line = proc_line
                    PurchaseOrderItem.objects.filter(pk=self.pk).update(procurement_line=proc_line)

    def __str__(self):
        return f"{self.quantity}x {self.product.model_name} @ {self.unit_cost}"

    class Meta:
        ordering = ['created_at']


# --- UNIVERSAL ITEM ARCHITECTURE (PHASE 3) ---

class Item(BaseModel):
    ITEM_TYPES = (
        ('PRODUCT', 'Product'),
        ('SERVICE', 'Service'),
        ('SPARE_PART', 'Spare Part'),
        ('CONSUMABLE', 'Consumable'),
        ('ASSET', 'Asset'),
        ('EQUIPMENT', 'Equipment'),
        ('RENTAL', 'Rental'),
        ('DIGITAL', 'Digital'),
        ('BUNDLE', 'Bundle'),
    )
    
    item_type = models.CharField(max_length=20, choices=ITEM_TYPES, default='PRODUCT')
    sku = models.CharField(max_length=100, blank=True, null=True)
    item_code = models.CharField(max_length=100, blank=True, null=True)
    barcode = models.CharField(max_length=100, blank=True, null=True)
    
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, blank=True, related_name='items')
    brand = models.CharField(max_length=100, blank=True)
    unit_of_measure = models.CharField(max_length=50, default='pcs')
    
    is_active = models.BooleanField(default=True)
    is_sellable = models.BooleanField(default=True)
    is_purchasable = models.BooleanField(default=True)
    track_inventory = models.BooleanField(default=True)
    track_serial_number = models.BooleanField(default=False)
    track_batch = models.BooleanField(default=False)
    
    cost_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    selling_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    
    minimum_stock_level = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    reorder_level = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta(BaseModel.Meta):
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'sku'], 
                name='unique_company_sku', 
                condition=~Q(sku='') & Q(sku__isnull=False)
            ),
            models.UniqueConstraint(
                fields=['company', 'item_code'], 
                name='unique_company_item_code', 
                condition=~Q(item_code='') & Q(item_code__isnull=False)
            ),
            models.UniqueConstraint(
                fields=['company', 'barcode'], 
                name='unique_company_barcode', 
                condition=~Q(barcode='') & Q(barcode__isnull=False)
            )
        ]
        indexes = [
            models.Index(fields=['barcode']),
            models.Index(fields=['name']),
            models.Index(fields=['sku']),
            models.Index(fields=['company']),
        ]

    def __str__(self):
        return f"{self.name} ({self.sku or self.barcode or self.item_code or 'No Code'})"

class InventoryBalance(BaseModel):
    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name='balances')
    warehouse = models.ForeignKey('platform_core.Warehouse', on_delete=models.CASCADE, related_name='inventory_balances')
    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta(BaseModel.Meta):
        ordering = ['item', 'warehouse']
        constraints = [
            models.UniqueConstraint(fields=['item', 'warehouse'], name='unique_item_warehouse')
        ]
        indexes = [
            models.Index(fields=['warehouse']),
            models.Index(fields=['item']),
            models.Index(fields=['company']),
        ]

    def clean(self):
        from django.core.exceptions import ValidationError
        if self.item_id and self.warehouse_id:
            if self.item.company_id != self.warehouse.company_id:
                raise ValidationError("Item and Warehouse must belong to the same company.")

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.item.name} @ {self.warehouse.name}: {self.quantity}"

class ItemSerial(BaseModel):
    STATUS_CHOICES = (
        ('IN_STOCK', 'In Stock'),
        ('SOLD', 'Sold'),
        ('IN_TRANSIT', 'In Transit'),
        ('RETURNED', 'Returned'),
        ('DEFECTIVE', 'Defective'),
        ('ISSUED', 'Issued'),
    )
    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name='serials')
    warehouse = models.ForeignKey('platform_core.Warehouse', on_delete=models.CASCADE, related_name='item_serials')
    serial_number = models.CharField(max_length=100)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='IN_STOCK')

    class Meta(BaseModel.Meta):
        ordering = ['item', 'serial_number']
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'serial_number'], 
                name='unique_company_serial',
                condition=~Q(serial_number='') & Q(serial_number__isnull=False)
            )
        ]

    def clean(self):
        from django.core.exceptions import ValidationError
        if self.item_id and self.warehouse_id:
            if self.item.company_id != self.warehouse.company_id:
                raise ValidationError("Item and Warehouse must belong to the same company.")

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.item.name} - SN: {self.serial_number} ({self.status})"


class ItemFieldDefinition(BaseModel):
    FIELD_TYPES = (
        ('TEXT', 'Text'),
        ('TEXTAREA', 'Text Area'),
        ('NUMBER', 'Number'),
        ('DECIMAL', 'Decimal'),
        ('BOOLEAN', 'Boolean'),
        ('DATE', 'Date'),
        ('DATETIME', 'Date/Time'),
        ('SELECT', 'Dropdown/Select'),
        ('MULTI_SELECT', 'Multi-Select'),
    )

    category = models.ForeignKey(Category, on_delete=models.CASCADE, null=True, blank=True, related_name='field_definitions')
    name = models.CharField(max_length=100)
    key = models.CharField(max_length=100)
    field_type = models.CharField(max_length=20, choices=FIELD_TYPES)
    description = models.TextField(blank=True)
    required = models.BooleanField(default=False)
    active = models.BooleanField(default=True)
    sort_order = models.IntegerField(default=0)
    options = models.JSONField(null=True, blank=True, help_text="List of choices for SELECT/MULTI_SELECT")
    default_value = models.JSONField(null=True, blank=True)

    class Meta(BaseModel.Meta):
        ordering = ['sort_order', 'name']
        constraints = [
            models.UniqueConstraint(fields=['company', 'key'], name='unique_company_field_key')
        ]

    def __str__(self):
        return f"{self.name} ({self.key})"


class ItemFieldValue(BaseModel):
    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name='custom_fields')
    field_definition = models.ForeignKey(ItemFieldDefinition, on_delete=models.CASCADE, related_name='values')
    value = models.JSONField(null=True, blank=True)

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(fields=['item', 'field_definition'], name='unique_item_field_value')
        ]

    def clean(self):
        super().clean()
        if getattr(self, 'item_id', None) and getattr(self, 'field_definition_id', None):
            if self.item.company_id != self.field_definition.company_id:
                from django.core.exceptions import ValidationError
                raise ValidationError("Item and Field Definition must belong to the same company.")
            if getattr(self, 'company_id', None) and self.item.company_id != self.company_id:
                from django.core.exceptions import ValidationError
                raise ValidationError("Value must belong to the same company as the item.")

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.item.name} - {self.field_definition.name}: {self.value}"
