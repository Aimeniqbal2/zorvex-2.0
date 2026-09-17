from rest_framework import serializers
from .models import (
    CRMEntity, CRMContact, CRMAddress, CRMCommunication,
    CRMTag, CRMRelationship, CRMNote, CRMAttachment, CRMEntityRole,
    Opportunity, Proposal, ProposalLine, OpportunityAward
)


class CRMTagSerializer(serializers.ModelSerializer):
    class Meta:
        model = CRMTag
        fields = ['id', 'name', 'color', 'created_at']
        read_only_fields = ['id', 'created_at']


class CRMContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = CRMContact
        fields = [
            'id', 'entity', 'first_name', 'last_name', 'job_title', 'department',
            'email', 'phone', 'mobile', 'whatsapp', 'is_primary',
            'receives_invoices', 'receives_quotes', 'receives_notifications',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class CRMAddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = CRMAddress
        fields = [
            'id', 'entity', 'address_type', 'line1', 'line2', 'city', 'state',
            'country', 'postal_code', 'latitude', 'longitude', 'is_default',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class CRMCommunicationSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.get_full_name', read_only=True)

    class Meta:
        model = CRMCommunication
        fields = [
            'id', 'entity', 'type', 'subject', 'description', 'user', 'user_name',
            'timestamp', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']


class CRMRelationshipSerializer(serializers.ModelSerializer):
    from_entity_name = serializers.CharField(source='from_entity.name', read_only=True)
    to_entity_name = serializers.CharField(source='to_entity.name', read_only=True)

    class Meta:
        model = CRMRelationship
        fields = [
            'id', 'from_entity', 'from_entity_name', 'to_entity', 'to_entity_name',
            'relationship_type', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']


class CRMNoteSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.get_full_name', read_only=True)

    class Meta:
        model = CRMNote
        fields = ['id', 'entity', 'user', 'user_name', 'text', 'created_at']
        read_only_fields = ['id', 'created_at']


class CRMAttachmentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(source='uploaded_by.get_full_name', read_only=True)

    class Meta:
        model = CRMAttachment
        fields = ['id', 'entity', 'file', 'uploaded_by', 'uploaded_by_name', 'description', 'created_at']
        read_only_fields = ['id', 'created_at']


class CRMEntitySerializer(serializers.ModelSerializer):
    tags = CRMTagSerializer(many=True, read_only=True)
    tags_ids = serializers.PrimaryKeyRelatedField(
        queryset=CRMTag.objects.all(),
        source='tags',
        many=True,
        write_only=True,
        required=False
    )
    
    contacts = CRMContactSerializer(many=True, read_only=True)
    addresses = CRMAddressSerializer(many=True, read_only=True)
    
    roles = serializers.SerializerMethodField()
    roles_write = serializers.ListField(
        child=serializers.ChoiceField(choices=CRMEntity.ENTITY_TYPE_CHOICES),
        write_only=True,
        required=False
    )
    code = serializers.CharField(required=False, allow_blank=True)
    
    class Meta:
        model = CRMEntity
        fields = [
            'id', 'entity_type', 'roles', 'roles_write', 'name', 'display_name', 'code', 'status', 'active',
            'notes', 'website', 'tax_number', 'registration_number', 'credit_limit',
            'payment_terms', 'preferred_currency', 'preferred_language',
            'created_by', 'owner', 'tags', 'tags_ids', 'contacts', 'addresses',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'roles']

    def get_roles(self, obj):
        return [mapping.role for mapping in obj.role_mappings.all()]

    def validate_tags_ids(self, tags):
        company_id = self.context['request'].user.company_id
        for tag in tags:
            if tag.company_id != company_id:
                raise serializers.ValidationError(f"Tag {tag.name} does not belong to your company.")
        return tags

    def create(self, validated_data):
        roles_data = validated_data.pop('roles_write', [])
        # Fallback to entity_type if no roles provided
        if not roles_data and validated_data.get('entity_type'):
            roles_data = [validated_data['entity_type']]
            
        entity = super().create(validated_data)
        
        roles_to_create = []
        for role in set(roles_data):
            roles_to_create.append(CRMEntityRole(entity=entity, role=role, company_id=entity.company_id))
        if roles_to_create:
            CRMEntityRole.objects.bulk_create(roles_to_create, ignore_conflicts=True)
            
        return entity

    def update(self, instance, validated_data):
        roles_data = validated_data.pop('roles_write', None)
        
        # If entity_type is being updated and no roles_write provided, ensure the new type is added
        if roles_data is None and 'entity_type' in validated_data and validated_data['entity_type'] != instance.entity_type:
            current_roles = set(instance.role_mappings.values_list('role', flat=True))
            new_type = validated_data['entity_type']
            if new_type not in current_roles:
                roles_data = list(current_roles) + [new_type]

        entity = super().update(instance, validated_data)
        
        if roles_data is not None:
            # Sync roles
            current_roles = set(instance.role_mappings.values_list('role', flat=True))
            new_roles = set(roles_data)
            
            roles_to_add = new_roles - current_roles
            roles_to_remove = current_roles - new_roles
            
            if roles_to_remove:
                instance.role_mappings.filter(role__in=roles_to_remove).delete()
                
            if roles_to_add:
                roles_to_create = [CRMEntityRole(entity=entity, role=r, company_id=entity.company_id) for r in roles_to_add]
                CRMEntityRole.objects.bulk_create(roles_to_create, ignore_conflicts=True)
                
        return entity


class OpportunitySerializer(serializers.ModelSerializer):
    crm_entity_name = serializers.CharField(source='crm_entity.name', read_only=True)
    owner_name = serializers.CharField(source='owner.get_full_name', read_only=True)
    converted_contract_code = serializers.CharField(source='converted_contract.contract_code', read_only=True)

    class Meta:
        model = Opportunity
        fields = [
            'id', 'crm_entity', 'crm_entity_name', 'title', 'opportunity_number',
            'stage', 'estimated_value', 'probability', 'expected_close_date',
            'source', 'owner', 'owner_name', 'notes', 'loss_reason', 'competitor',
            'converted_contract', 'converted_contract_code', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'converted_contract']
        extra_kwargs = {
            'opportunity_number': {'required': False}
        }


class ProposalLineSerializer(serializers.ModelSerializer):
    designation_name = serializers.CharField(source='designation.name', read_only=True)

    class Meta:
        model = ProposalLine
        fields = [
            'id', 'proposal', 'description', 'designation', 'designation_name',
            'quantity', 'unit', 'rate', 'amount', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'amount']


class ProposalSerializer(serializers.ModelSerializer):
    opportunity_title = serializers.CharField(source='opportunity.title', read_only=True)
    submitted_by_name = serializers.CharField(source='submitted_by.get_full_name', read_only=True)
    lines = ProposalLineSerializer(many=True, read_only=True)

    class Meta:
        model = Proposal
        fields = [
            'id', 'opportunity', 'opportunity_title', 'proposal_number', 'title',
            'version', 'issue_date', 'valid_until', 'status', 'currency',
            'subtotal', 'tax_amount', 'total', 'scope', 'terms', 'notes',
            'submitted_at', 'submitted_by', 'submitted_by_name', 'lines',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'subtotal', 'total']
        extra_kwargs = {
            'proposal_number': {'required': False}
        }


class OpportunityAwardSerializer(serializers.ModelSerializer):
    opportunity_title = serializers.CharField(source='opportunity.title', read_only=True)
    proposal_number = serializers.CharField(source='proposal.proposal_number', read_only=True)

    class Meta:
        model = OpportunityAward
        fields = [
            'id', 'opportunity', 'opportunity_title', 'proposal', 'proposal_number',
            'method', 'award_reference', 'award_date', 'effective_date', 'notes',
            'attachment', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
