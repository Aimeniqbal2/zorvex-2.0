from decimal import Decimal
from rest_framework import serializers
from .models import (
    ProcurementTag, ProcurementDocument, ProcurementLine,
    ApprovalWorkflow, ApprovalStep, ApprovalHistory,
    ProcurementNote, ProcurementAttachment, ProcurementAuditTrail,
    VendorCategory, Vendor, VendorItem, VendorDocument,
    VendorPayment, VendorPaymentAllocation,
    PurchaseReturn, PurchaseReturnLine, VendorCreditNote,
    VendorReconciliation
)





class ProcurementTagSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProcurementTag
        fields = ['id', 'name', 'color', 'created_at']
        read_only_fields = ['id', 'created_at']


class ProcurementLineSerializer(serializers.ModelSerializer):
    item_sku = serializers.CharField(source='item.sku', read_only=True, default='')
    item_name = serializers.CharField(source='item.name', read_only=True, default='')
    item_brand = serializers.CharField(source='item.brand', read_only=True, default='')
    item_category_name = serializers.SerializerMethodField()
    remaining_quantity = serializers.SerializerMethodField()

    class Meta:
        model = ProcurementLine
        fields = [
            'id', 'document', 'item', 'item_sku', 'item_name', 'item_brand', 'item_category_name',
            'vendor_item', 'vendor_sku', 'description', 'expected_delivery_date', 'notes',
            'quantity', 'received_quantity', 'accepted_quantity', 'rejected_quantity', 'rejection_reason',
            'billed_quantity', 'returned_quantity', 'remaining_quantity', 'parent_line',
            'unit_price', 'discount_amount', 'tax_amount', 'total_amount',
            'unit_of_measure', 'line_number', 'custom_fields', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'document', 'received_quantity', 'billed_quantity', 'returned_quantity']


    def get_item_category_name(self, obj):
        if obj.item and getattr(obj.item, 'category', None):
            return obj.item.category.name
        return ''

    def get_remaining_quantity(self, obj):
        return max(Decimal('0.00'), (obj.quantity or 0) - (obj.received_quantity or 0))


    def validate_item(self, item):
        request = self.context.get('request')
        if request and hasattr(request, 'user') and item:
            if item.company_id != request.user.company_id:
                raise serializers.ValidationError("Item does not belong to your company.")
        return item

    def validate_vendor_item(self, vendor_item):
        request = self.context.get('request')
        if request and hasattr(request, 'user') and vendor_item:
            if vendor_item.company_id != request.user.company_id:
                raise serializers.ValidationError("Vendor item catalogue record does not belong to your company.")
        return vendor_item


class ProcurementNoteSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.get_full_name', read_only=True, default='')

    class Meta:
        model = ProcurementNote
        fields = ['id', 'document', 'user', 'user_name', 'note_type', 'text', 'created_at']
        read_only_fields = ['id', 'created_at']


class ProcurementAttachmentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(source='uploaded_by.get_full_name', read_only=True, default='')

    class Meta:
        model = ProcurementAttachment
        fields = ['id', 'document', 'file', 'uploaded_by', 'uploaded_by_name', 'description', 'created_at']
        read_only_fields = ['id', 'created_at']


class ProcurementAuditTrailSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.get_full_name', read_only=True, default='')

    class Meta:
        model = ProcurementAuditTrail
        fields = ['id', 'document', 'user', 'user_name', 'event', 'details', 'created_at']
        read_only_fields = ['id', 'created_at']


class ProcurementDocumentSerializer(serializers.ModelSerializer):
    crm_entity_name = serializers.CharField(source='crm_entity.name', read_only=True, default='')
    vendor_name = serializers.CharField(source='vendor.name', read_only=True, default='')
    vendor_code = serializers.CharField(source='vendor.code', read_only=True, default='')
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True, default='')
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True, default='')
    approved_by_name = serializers.CharField(source='approved_by.get_full_name', read_only=True, default='')
    override_by_name = serializers.CharField(source='override_by.get_full_name', read_only=True, default='')
    parent_document_number = serializers.CharField(source='parent_document.number', read_only=True, default='')
    paid_amount = serializers.SerializerMethodField(read_only=True)
    outstanding_amount = serializers.SerializerMethodField(read_only=True)
    is_overdue = serializers.SerializerMethodField(read_only=True)

    lines = ProcurementLineSerializer(many=True, required=False)
    tags = ProcurementTagSerializer(many=True, read_only=True)

    
    number = serializers.CharField(required=False)
    from crm.models import CRMEntity
    crm_entity = serializers.PrimaryKeyRelatedField(queryset=CRMEntity.objects.all(), required=False, allow_null=True)
    vendor = serializers.PrimaryKeyRelatedField(queryset=Vendor.objects.all(), required=False, allow_null=True)

    tags_ids = serializers.PrimaryKeyRelatedField(
        queryset=ProcurementTag.objects.all(),
        source='tags',
        many=True,
        write_only=True,
        required=False
    )
    notes_rel = ProcurementNoteSerializer(many=True, read_only=True)
    attachments = ProcurementAttachmentSerializer(many=True, read_only=True)
    audit_trails = ProcurementAuditTrailSerializer(many=True, read_only=True)

    class Meta:
        model = ProcurementDocument
        fields = [
            'id', 'document_type', 'status', 'number', 'reference_number', 'vendor_invoice_number',
            'document_date', 'due_date', 'expected_delivery_date', 'payment_terms',
            'currency', 'exchange_rate', 'subtotal_amount', 'tax_amount',
            'discount_amount', 'freight_amount', 'total_amount',
            'paid_amount', 'outstanding_amount', 'is_overdue',
            'crm_entity', 'crm_entity_name',
            'vendor', 'vendor_name', 'vendor_code',
            'warehouse', 'warehouse_name', 'parent_document', 'parent_document_number',
            'created_by', 'created_by_name',
            'owner', 'approved_by', 'approved_by_name', 'approved_at', 'approval_notes', 'rejection_reason',
            'match_status', 'match_details', 'override_by', 'override_by_name', 'override_at', 'override_reason',
            'ap_ready', 'payment_status',
            'notes', 'tags', 'tags_ids', 'custom_fields', 'lines',
            'notes_rel', 'attachments', 'audit_trails', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'created_at', 'updated_at', 'approved_by', 'approved_at',
            'override_by', 'override_at', 'subtotal_amount', 'tax_amount', 'discount_amount', 'total_amount',
            'paid_amount', 'outstanding_amount', 'is_overdue'
        ]

    def get_paid_amount(self, obj):
        if obj.document_type == 'VENDOR_INVOICE':
            from .services.payment_service import get_invoice_payment_summary
            return get_invoice_payment_summary(obj)['paid_amount']
        return Decimal('0.00')

    def get_outstanding_amount(self, obj):
        if obj.document_type == 'VENDOR_INVOICE':
            from .services.payment_service import get_invoice_payment_summary
            return get_invoice_payment_summary(obj)['outstanding_amount']
        return obj.total_amount or Decimal('0.00')

    def get_is_overdue(self, obj):
        if obj.document_type == 'VENDOR_INVOICE':
            from .services.payment_service import get_invoice_payment_summary
            return get_invoice_payment_summary(obj)['is_overdue']
        return False




    def create(self, validated_data):
        from .services.po_service import recalculate_po_totals
        lines_data = validated_data.pop('lines', [])
        tags_data = validated_data.pop('tags', [])
        
        request = self.context.get('request')
        if request and hasattr(request, 'user') and not validated_data.get('created_by'):
            validated_data['created_by'] = request.user

        document = ProcurementDocument.objects.create(**validated_data)
        if tags_data:
            document.tags.set(tags_data)

        for idx, line_data in enumerate(lines_data, start=1):
            line_data['line_number'] = idx
            ProcurementLine.objects.create(document=document, company=document.company, **line_data)

        recalculate_po_totals(document)
        return document

    def update(self, instance, validated_data):
        from .services.po_service import recalculate_po_totals
        # Protection rule: Approved / Sent / Received POs cannot have lines or vendor freely changed
        if instance.status in ['APPROVED', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED']:
            if 'lines' in validated_data or 'vendor' in validated_data or 'crm_entity' in validated_data:
                raise serializers.ValidationError(
                    f"Cannot edit commercial line items or vendor on an {instance.status} purchase order."
                )

        lines_data = validated_data.pop('lines', None)
        tags_data = validated_data.pop('tags', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if tags_data is not None:
            instance.tags.set(tags_data)
        if lines_data is not None:
            instance.lines.all().delete()
            for idx, line_data in enumerate(lines_data, start=1):
                line_data['line_number'] = idx
                ProcurementLine.objects.create(document=instance, company=instance.company, **line_data)
            recalculate_po_totals(instance)
        return instance


    def validate_vendor(self, vendor):
        request = self.context.get('request')
        if request and hasattr(request, 'user') and vendor:
            if vendor.company_id != request.user.company_id:
                raise serializers.ValidationError("Vendor does not belong to your company.")
        return vendor

    def validate_crm_entity(self, crm_entity):
        request = self.context.get('request')
        if request and hasattr(request, 'user') and crm_entity:
            if crm_entity.company_id != request.user.company_id:
                raise serializers.ValidationError("CRM entity does not belong to your company.")
        return crm_entity

    def validate_warehouse(self, warehouse):
        request = self.context.get('request')
        if request and hasattr(request, 'user') and warehouse:
            if warehouse.company_id != request.user.company_id:
                raise serializers.ValidationError("Warehouse does not belong to your company.")
        return warehouse

    def validate_tags_ids(self, tags):
        request = self.context.get('request')
        if request and hasattr(request, 'user'):
            company_id = request.user.company_id
            for tag in tags:
                if tag.company_id != company_id:
                    raise serializers.ValidationError(f"Tag {tag.name} does not belong to your company.")
        return tags



class ApprovalStepSerializer(serializers.ModelSerializer):
    approver_user_name = serializers.CharField(source='approver_user.get_full_name', read_only=True)

    class Meta:
        model = ApprovalStep
        fields = ['id', 'workflow', 'step_number', 'name', 'approver_role', 'approver_user', 'approver_user_name', 'created_at']
        read_only_fields = ['id', 'created_at']


class ApprovalWorkflowSerializer(serializers.ModelSerializer):
    steps = ApprovalStepSerializer(many=True, read_only=True)

    class Meta:
        model = ApprovalWorkflow
        fields = ['id', 'name', 'module', 'document_type', 'active', 'min_amount', 'max_amount', 'steps', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class ApprovalHistorySerializer(serializers.ModelSerializer):
    action_by_name = serializers.CharField(source='action_by.get_full_name', read_only=True)

    class Meta:
        model = ApprovalHistory
        fields = ['id', 'workflow', 'step', 'document_id', 'document_model', 'action', 'action_by', 'action_by_name', 'comments', 'created_at']
        read_only_fields = ['id', 'created_at']


# ==========================================
# PHASE S-3A: VENDOR FOUNDATION SERIALIZERS
# ==========================================

class VendorCategorySerializer(serializers.ModelSerializer):
    vendors_count = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = VendorCategory
        fields = ['id', 'name', 'code', 'description', 'is_active', 'vendors_count', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at', 'vendors_count']

    def get_vendors_count(self, obj) -> int:
        return obj.vendors.count()


class VendorItemSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    item_brand = serializers.CharField(source='item.brand', read_only=True)
    item_category_name = serializers.CharField(source='item.category.name', read_only=True, default='')
    item_unit_of_measure = serializers.CharField(source='item.unit_of_measure', read_only=True)
    item_cost_price = serializers.DecimalField(source='item.cost_price', max_digits=12, decimal_places=2, read_only=True)
    item_selling_price = serializers.DecimalField(source='item.selling_price', max_digits=12, decimal_places=2, read_only=True)
    vendor_name = serializers.CharField(source='vendor.name', read_only=True)

    class Meta:
        model = VendorItem
        fields = [
            'id', 'vendor', 'vendor_name', 'item', 'item_name', 'item_sku',
            'item_brand', 'item_category_name', 'item_unit_of_measure',
            'item_cost_price', 'item_selling_price',
            'vendor_sku', 'vendor_price', 'currency', 'minimum_order_quantity',
            'lead_time_days', 'last_purchase_price', 'is_preferred', 'is_active',
            'notes', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_item(self, item):
        request = self.context.get('request')
        if request and hasattr(request, 'user') and item:
            if item.company_id != request.user.company_id:
                raise serializers.ValidationError("Item does not belong to your company.")
        return item

    def validate_vendor(self, vendor):
        request = self.context.get('request')
        if request and hasattr(request, 'user') and vendor:
            if vendor.company_id != request.user.company_id:
                raise serializers.ValidationError("Vendor does not belong to your company.")
        return vendor


class VendorDocumentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(source='uploaded_by.get_full_name', read_only=True)
    file_url = serializers.SerializerMethodField(read_only=True)
    document_type_display = serializers.CharField(source='get_document_type_display', read_only=True)

    class Meta:
        model = VendorDocument
        fields = [
            'id', 'vendor', 'document_type', 'document_type_display',
            'title', 'file', 'file_url', 'uploaded_by', 'uploaded_by_name',
            'notes', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'uploaded_by_name', 'file_url', 'document_type_display']

    def get_file_url(self, obj) -> str | None:
        if obj.file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.file.url)
            return obj.file.url
        return None


class VendorSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True, default='')
    items_count = serializers.SerializerMethodField(read_only=True)
    documents_count = serializers.SerializerMethodField(read_only=True)
    contacts_count = serializers.SerializerMethodField(read_only=True)

    # Financial settlement metrics
    total_purchases = serializers.SerializerMethodField(read_only=True)
    outstanding_payable = serializers.SerializerMethodField(read_only=True)
    total_paid = serializers.SerializerMethodField(read_only=True)
    overdue_payable = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Vendor
        fields = [
            'id', 'code', 'name', 'category', 'category_name', 'crm_entity',
            'contact_person', 'phone', 'email', 'address', 'website',
            'tax_number', 'registration_number', 'payment_terms', 'credit_limit',
            'bank_name', 'account_title', 'account_number', 'iban', 'swift_code',
            'status', 'rating', 'notes',
            'items_count', 'documents_count', 'contacts_count',
            'total_purchases', 'outstanding_payable', 'total_paid', 'overdue_payable',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'code', 'created_at', 'updated_at',
            'items_count', 'documents_count', 'contacts_count',
            'total_purchases', 'outstanding_payable', 'total_paid', 'overdue_payable'
        ]

    def get_items_count(self, obj) -> int:
        return obj.vendor_items.filter(is_active=True).count()

    def get_documents_count(self, obj) -> int:
        return obj.documents.count()

    def get_contacts_count(self, obj) -> int:
        if obj.crm_entity_id:
            return obj.crm_entity.contacts.count()
        return 0

    def _get_payable_summary(self, obj):
        if not hasattr(obj, '_cached_payable_sum'):
            from .services.payment_service import get_vendor_payable_summary
            obj._cached_payable_sum = get_vendor_payable_summary(obj.id, obj.company_id)
        return obj._cached_payable_sum

    def get_total_purchases(self, obj):
        return self._get_payable_summary(obj)['total_purchases']

    def get_outstanding_payable(self, obj):
        return self._get_payable_summary(obj)['outstanding_payable']

    def get_total_paid(self, obj):
        return self._get_payable_summary(obj)['total_paid']

    def get_overdue_payable(self, obj):
        return self._get_payable_summary(obj)['overdue_payable']


class VendorPaymentAllocationSerializer(serializers.ModelSerializer):
    invoice_number = serializers.CharField(source='invoice.number', read_only=True)
    vendor_invoice_number = serializers.CharField(source='invoice.vendor_invoice_number', read_only=True)
    invoice_total_amount = serializers.DecimalField(source='invoice.total_amount', max_digits=15, decimal_places=2, read_only=True)
    parent_po_number = serializers.CharField(source='invoice.parent_document.number', read_only=True, default='N/A')

    class Meta:
        model = VendorPaymentAllocation
        fields = [
            'id', 'payment', 'invoice', 'invoice_number', 'vendor_invoice_number',
            'invoice_total_amount', 'parent_po_number', 'amount', 'notes', 'created_at'
        ]
        read_only_fields = ['id', 'created_at', 'invoice_number', 'vendor_invoice_number', 'invoice_total_amount', 'parent_po_number']


class VendorPaymentSerializer(serializers.ModelSerializer):
    vendor_name = serializers.CharField(source='vendor.name', read_only=True)
    vendor_code = serializers.CharField(source='vendor.code', read_only=True)
    payment_method_display = serializers.CharField(source='get_payment_method_display', read_only=True)
    account_code = serializers.CharField(source='account.account_code', read_only=True, default='')
    account_name = serializers.CharField(source='account.account_name', read_only=True, default='')
    paid_by_name = serializers.CharField(source='paid_by.get_full_name', read_only=True, default='')
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True, default='')
    posted_by_name = serializers.CharField(source='posted_by.get_full_name', read_only=True, default='')
    reversed_by_name = serializers.CharField(source='reversed_by.get_full_name', read_only=True, default='')
    allocations = VendorPaymentAllocationSerializer(many=True, read_only=True)
    allocated_amount = serializers.SerializerMethodField(read_only=True)
    unallocated_amount = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = VendorPayment
        fields = [
            'id', 'payment_number', 'vendor', 'vendor_name', 'vendor_code',
            'payment_date', 'payment_method', 'payment_method_display',
            'bank_cash_account', 'account', 'account_code', 'account_name',
            'amount', 'currency', 'reference_number', 'cheque_number', 'cheque_date',
            'status', 'notes',
            'paid_by', 'paid_by_name',
            'created_by', 'created_by_name',
            'posted_by', 'posted_by_name', 'posted_at',
            'reversed_by', 'reversed_by_name', 'reversed_at', 'reversal_reason',
            'allocations', 'allocated_amount', 'unallocated_amount',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'payment_number', 'status', 'created_at', 'updated_at',
            'vendor_name', 'vendor_code', 'payment_method_display',
            'account_code', 'account_name', 'paid_by_name', 'created_by_name',
            'posted_by_name', 'posted_at', 'reversed_by_name', 'reversed_at', 'reversal_reason',
            'allocations', 'allocated_amount', 'unallocated_amount'
        ]

    def get_allocated_amount(self, obj):
        return sum((Decimal(str(a.amount)) for a in obj.allocations.all()), Decimal('0.00'))

    def get_unallocated_amount(self, obj):
        total = Decimal(str(obj.amount or 0))
        allocated = self.get_allocated_amount(obj)
        return max(Decimal('0.00'), total - allocated)


class PurchaseReturnLineSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_code = serializers.CharField(source='item.code', read_only=True, default='')
    item_sku = serializers.CharField(source='item.sku', read_only=True, default='')
    item_unit_of_measure = serializers.CharField(source='item.unit_of_measure', read_only=True, default='')
    track_serial_number = serializers.BooleanField(source='item.track_serial_number', read_only=True, default=False)
    grn_line_number = serializers.IntegerField(source='grn_line.line_number', read_only=True, default=None)

    class Meta:
        model = PurchaseReturnLine
        fields = [
            'id', 'purchase_return', 'grn_line', 'grn_line_number',
            'item', 'item_name', 'item_code', 'item_sku', 'item_unit_of_measure',
            'track_serial_number', 'description',
            'received_quantity', 'previously_returned_quantity', 'return_quantity',
            'unit_cost', 'total_amount', 'reason', 'serial_numbers',
            'is_rejected_at_grn', 'line_number', 'notes', 'created_at'
        ]
        read_only_fields = [
            'id', 'created_at', 'total_amount', 'item_name', 'item_code',
            'item_sku', 'item_unit_of_measure', 'track_serial_number', 'grn_line_number'
        ]


class PurchaseReturnSerializer(serializers.ModelSerializer):
    vendor_name = serializers.CharField(source='vendor.name', read_only=True)
    vendor_code = serializers.CharField(source='vendor.code', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    purchase_order_number = serializers.CharField(source='purchase_order.number', read_only=True, default='N/A')
    goods_receipt_number = serializers.CharField(source='goods_receipt.number', read_only=True, default='N/A')
    vendor_invoice_number = serializers.CharField(source='vendor_invoice.number', read_only=True, default='N/A')
    reason_display = serializers.CharField(source='get_reason_display', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True, default='')
    approved_by_name = serializers.CharField(source='approved_by.get_full_name', read_only=True, default='')
    posted_by_name = serializers.CharField(source='posted_by.get_full_name', read_only=True, default='')
    cancelled_by_name = serializers.CharField(source='cancelled_by.get_full_name', read_only=True, default='')
    lines = PurchaseReturnLineSerializer(many=True, read_only=True)
    credit_notes_count = serializers.SerializerMethodField(read_only=True)
    credit_note_number = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = PurchaseReturn
        fields = [
            'id', 'return_number', 'vendor', 'vendor_name', 'vendor_code',
            'warehouse', 'warehouse_name',
            'purchase_order', 'purchase_order_number',
            'goods_receipt', 'goods_receipt_number',
            'vendor_invoice', 'vendor_invoice_number',
            'return_date', 'reason', 'reason_display', 'status',
            'total_return_amount', 'currency', 'notes', 'rejection_reason',
            'created_by', 'created_by_name',
            'approved_by', 'approved_by_name', 'approved_at',
            'posted_by', 'posted_by_name', 'posted_at',
            'cancelled_by', 'cancelled_by_name', 'cancelled_at',
            'lines', 'credit_notes_count', 'credit_note_number',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'return_number', 'status', 'total_return_amount', 'created_at', 'updated_at',
            'vendor_name', 'vendor_code', 'warehouse_name',
            'purchase_order_number', 'goods_receipt_number', 'vendor_invoice_number',
            'reason_display', 'created_by_name', 'approved_by_name', 'approved_at',
            'posted_by_name', 'posted_at', 'cancelled_by_name', 'cancelled_at',
            'lines', 'credit_notes_count', 'credit_note_number'
        ]

    def get_credit_notes_count(self, obj):
        return obj.credit_notes.count()

    def get_credit_note_number(self, obj):
        cn = obj.credit_notes.first()
        return cn.credit_note_number if cn else None


class VendorCreditNoteSerializer(serializers.ModelSerializer):
    vendor_name = serializers.CharField(source='vendor.name', read_only=True)
    vendor_code = serializers.CharField(source='vendor.code', read_only=True)
    return_number = serializers.CharField(source='purchase_return.return_number', read_only=True)
    invoice_number = serializers.CharField(source='vendor_invoice.number', read_only=True, default='N/A')
    vendor_invoice_number = serializers.CharField(source='vendor_invoice.vendor_invoice_number', read_only=True, default='N/A')
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True, default='')

    class Meta:
        model = VendorCreditNote
        fields = [
            'id', 'credit_note_number', 'vendor', 'vendor_name', 'vendor_code',
            'purchase_return', 'return_number',
            'vendor_invoice', 'invoice_number', 'vendor_invoice_number',
            'credit_date', 'amount', 'allocated_amount', 'unallocated_amount',
            'status', 'currency', 'notes',
            'created_by', 'created_by_name',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'credit_note_number', 'status', 'created_at', 'updated_at',
            'vendor_name', 'vendor_code', 'return_number',
            'invoice_number', 'vendor_invoice_number', 'created_by_name'
        ]


class VendorReconciliationSerializer(serializers.ModelSerializer):
    vendor_name = serializers.CharField(source='vendor.name', read_only=True)
    vendor_code = serializers.CharField(source='vendor.code', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    reconciled_by_name = serializers.CharField(source='reconciled_by.get_full_name', read_only=True, default='')
    resolved_by_name = serializers.CharField(source='resolved_by.get_full_name', read_only=True, default='')

    class Meta:
        model = VendorReconciliation
        fields = [
            'id', 'reconciliation_number', 'vendor', 'vendor_name', 'vendor_code',
            'statement_date', 'as_of_date',
            'vendor_reported_balance', 'system_balance', 'variance',
            'status', 'status_display', 'currency',
            'notes', 'resolution_notes',
            'reconciled_by', 'reconciled_by_name', 'reconciled_at',
            'resolved_by', 'resolved_by_name', 'resolved_at',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'reconciliation_number', 'system_balance', 'variance', 'status',
            'status_display', 'reconciled_by_name', 'reconciled_at',
            'resolved_by_name', 'resolved_at', 'created_at', 'updated_at'
        ]


