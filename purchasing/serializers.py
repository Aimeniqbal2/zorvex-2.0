from rest_framework import serializers
from .models import (
    ProcurementTag, ProcurementDocument, ProcurementLine,
    ApprovalWorkflow, ApprovalStep, ApprovalHistory,
    ProcurementNote, ProcurementAttachment, ProcurementAuditTrail
)


class ProcurementTagSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProcurementTag
        fields = ['id', 'name', 'color', 'created_at']
        read_only_fields = ['id', 'created_at']


class ProcurementLineSerializer(serializers.ModelSerializer):
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    item_name = serializers.CharField(source='item.item_code', read_only=True)

    class Meta:
        model = ProcurementLine
        fields = [
            'id', 'document', 'item', 'item_sku', 'item_name', 'description',
            'quantity', 'received_quantity', 'billed_quantity', 'returned_quantity',
            'unit_price', 'discount_amount', 'tax_amount', 'total_amount',
            'unit_of_measure', 'line_number', 'custom_fields', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'document']

    def validate_item(self, item):
        request = self.context.get('request')
        if request and hasattr(request, 'user') and item:
            if item.company_id != request.user.company_id:
                raise serializers.ValidationError("Item does not belong to your company.")
        return item


class ProcurementNoteSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.get_full_name', read_only=True)

    class Meta:
        model = ProcurementNote
        fields = ['id', 'document', 'user', 'user_name', 'note_type', 'text', 'created_at']
        read_only_fields = ['id', 'created_at']


class ProcurementAttachmentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(source='uploaded_by.get_full_name', read_only=True)

    class Meta:
        model = ProcurementAttachment
        fields = ['id', 'document', 'file', 'uploaded_by', 'uploaded_by_name', 'description', 'created_at']
        read_only_fields = ['id', 'created_at']


class ProcurementAuditTrailSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.get_full_name', read_only=True)

    class Meta:
        model = ProcurementAuditTrail
        fields = ['id', 'document', 'user', 'user_name', 'event', 'details', 'created_at']
        read_only_fields = ['id', 'created_at']


class ProcurementDocumentSerializer(serializers.ModelSerializer):
    crm_entity_name = serializers.CharField(source='crm_entity.name', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    lines = ProcurementLineSerializer(many=True, required=False)
    tags = ProcurementTagSerializer(many=True, read_only=True)
    
    number = serializers.CharField(required=False)
    from crm.models import CRMEntity
    crm_entity = serializers.PrimaryKeyRelatedField(queryset=CRMEntity.objects.all(), required=False, allow_null=True)

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
            'id', 'document_type', 'status', 'number', 'reference_number',
            'document_date', 'expected_delivery_date', 'payment_terms',
            'currency', 'exchange_rate', 'subtotal_amount', 'tax_amount',
            'discount_amount', 'total_amount', 'crm_entity', 'crm_entity_name',
            'warehouse', 'warehouse_name', 'parent_document', 'created_by',
            'owner', 'notes', 'tags', 'tags_ids', 'custom_fields', 'lines',
            'notes_rel', 'attachments', 'audit_trails', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def create(self, validated_data):
        lines_data = validated_data.pop('lines', [])
        tags_data = validated_data.pop('tags', [])
        document = ProcurementDocument.objects.create(**validated_data)
        if tags_data:
            document.tags.set(tags_data)
        for line_data in lines_data:
            ProcurementLine.objects.create(document=document, **line_data)
        return document

    def update(self, instance, validated_data):
        lines_data = validated_data.pop('lines', None)
        tags_data = validated_data.pop('tags', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if tags_data is not None:
            instance.tags.set(tags_data)
        if lines_data is not None:
            instance.lines.all().delete()
            for line_data in lines_data:
                ProcurementLine.objects.create(document=instance, **line_data)
        return instance

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
