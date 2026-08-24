from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from erp_core.views import TenantModelViewSet
from erp_core.permissions import RolePermission
from platform_core.permissions import ModulePermission
from .models import (
    CRMEntity, CRMContact, CRMAddress, CRMCommunication,
    CRMTag, CRMRelationship, CRMNote, CRMAttachment
)
from .serializers import (
    CRMEntitySerializer, CRMContactSerializer, CRMAddressSerializer,
    CRMCommunicationSerializer, CRMTagSerializer, CRMRelationshipSerializer,
    CRMNoteSerializer, CRMAttachmentSerializer
)

class BaseCRMViewSet(TenantModelViewSet):
    required_module = 'crm'
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager', 'sales', 'hr', 'finance', 'staff', 'cashier']

    def perform_create(self, serializer):
        serializer.save(company_id=self.request.user.company_id)


class CRMEntityViewSet(BaseCRMViewSet):
    queryset = CRMEntity.objects.prefetch_related('tags', 'contacts', 'addresses').select_related('created_by', 'owner').all()
    serializer_class = CRMEntitySerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'display_name', 'code', 'tax_number', 'registration_number']
    ordering_fields = ['name', 'created_at']

    def get_queryset(self):
        queryset = super().get_queryset()
        entity_type = self.request.query_params.get('entity_type')
        role = self.request.query_params.get('role')
        status = self.request.query_params.get('status')
        active = self.request.query_params.get('active')
        
        # Backward compatible role filtering
        filter_role = role or entity_type
        if filter_role:
            # Prevent duplicates if an entity has multiple roles somehow, 
            # though role mapping should be unique
            queryset = queryset.filter(role_mappings__role__iexact=filter_role).distinct()
            
        if status:
            queryset = queryset.filter(status__iexact=status)
        if active is not None:
            active_bool = str(active).lower() in ('true', '1', 't', 'y', 'yes')
            queryset = queryset.filter(active=active_bool)
            
        return queryset

    def perform_create(self, serializer):
        serializer.save(company_id=self.request.user.company_id, created_by=self.request.user)


class CRMContactViewSet(BaseCRMViewSet):
    queryset = CRMContact.objects.select_related('entity').all()
    serializer_class = CRMContactSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['first_name', 'last_name', 'email', 'phone', 'entity__name']
    ordering_fields = ['first_name', 'created_at']

    def get_queryset(self):
        queryset = super().get_queryset()
        entity_id = self.request.query_params.get('entity')
        if entity_id:
            queryset = queryset.filter(entity_id=entity_id)
        return queryset


class CRMAddressViewSet(BaseCRMViewSet):
    queryset = CRMAddress.objects.select_related('entity').all()
    serializer_class = CRMAddressSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['city', 'country', 'line1', 'entity__name']

    def get_queryset(self):
        queryset = super().get_queryset()
        entity_id = self.request.query_params.get('entity')
        if entity_id:
            queryset = queryset.filter(entity_id=entity_id)
        return queryset


class CRMCommunicationViewSet(BaseCRMViewSet):
    queryset = CRMCommunication.objects.select_related('entity', 'user').all()
    serializer_class = CRMCommunicationSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['subject', 'description', 'entity__name']

    def get_queryset(self):
        queryset = super().get_queryset()
        entity_id = self.request.query_params.get('entity')
        if entity_id:
            queryset = queryset.filter(entity_id=entity_id)
        return queryset

    def perform_create(self, serializer):
        serializer.save(company_id=self.request.user.company_id, user=self.request.user)


class CRMTagViewSet(BaseCRMViewSet):
    queryset = CRMTag.objects.all()
    serializer_class = CRMTagSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['name']


class CRMRelationshipViewSet(BaseCRMViewSet):
    queryset = CRMRelationship.objects.select_related('from_entity', 'to_entity').all()
    serializer_class = CRMRelationshipSerializer


class CRMNoteViewSet(BaseCRMViewSet):
    queryset = CRMNote.objects.select_related('entity', 'user').all()
    serializer_class = CRMNoteSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        entity_id = self.request.query_params.get('entity')
        if entity_id:
            queryset = queryset.filter(entity_id=entity_id)
        return queryset

    def perform_create(self, serializer):
        serializer.save(company_id=self.request.user.company_id, user=self.request.user)


class CRMAttachmentViewSet(BaseCRMViewSet):
    queryset = CRMAttachment.objects.select_related('entity', 'uploaded_by').all()
    serializer_class = CRMAttachmentSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        entity_id = self.request.query_params.get('entity')
        if entity_id:
            queryset = queryset.filter(entity_id=entity_id)
        return queryset

    def perform_create(self, serializer):
        serializer.save(company_id=self.request.user.company_id, uploaded_by=self.request.user)

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        attachment = self.get_object()
        if not attachment.file:
            from rest_framework.exceptions import NotFound
            raise NotFound("File not found.")
        
        from django.http import FileResponse
        import os
        filename = os.path.basename(attachment.file.name)
        return FileResponse(attachment.file.open('rb'), as_attachment=True, filename=filename)


from rest_framework import status
from rest_framework.response import Response
from .models import Opportunity, Proposal, ProposalLine, OpportunityAward, convert_opportunity_to_contract
from .serializers import OpportunitySerializer, ProposalSerializer, ProposalLineSerializer, OpportunityAwardSerializer

class OpportunityViewSet(BaseCRMViewSet):
    queryset = Opportunity.objects.select_related('crm_entity', 'owner', 'converted_contract').all()
    serializer_class = OpportunitySerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['stage']
    search_fields = ['title', 'opportunity_number', 'crm_entity__name']
    ordering_fields = ['created_at', 'expected_close_date']

    def perform_create(self, serializer):
        serializer.save(company_id=self.request.user.company_id, owner=self.request.user)

    @action(detail=True, methods=['post'])
    def convert_to_contract(self, request, pk=None):
        opportunity = self.get_object()
        try:
            contract = convert_opportunity_to_contract(opportunity.id, request.user)
            return Response({'status': 'converted', 'contract_id': contract.id}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

class ProposalViewSet(BaseCRMViewSet):
    queryset = Proposal.objects.prefetch_related('lines').select_related('opportunity', 'submitted_by').all()
    serializer_class = ProposalSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'opportunity']
    search_fields = ['title', 'proposal_number']

    def perform_create(self, serializer):
        serializer.save(company_id=self.request.user.company_id)

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        import datetime
        proposal = self.get_object()
        proposal.status = 'SUBMITTED'
        proposal.submitted_at = datetime.datetime.now()
        proposal.submitted_by = request.user
        proposal.save()
        return Response({'status': 'submitted'})

    @action(detail=True, methods=['post'])
    def accept(self, request, pk=None):
        proposal = self.get_object()
        proposal.status = 'ACCEPTED'
        proposal.save()
        return Response({'status': 'accepted'})

class ProposalLineViewSet(BaseCRMViewSet):
    queryset = ProposalLine.objects.select_related('proposal', 'designation').all()
    serializer_class = ProposalLineSerializer
    filterset_fields = ['proposal']

    def perform_create(self, serializer):
        serializer.save(company_id=self.request.user.company_id)

class OpportunityAwardViewSet(BaseCRMViewSet):
    queryset = OpportunityAward.objects.select_related('opportunity', 'proposal').all()
    serializer_class = OpportunityAwardSerializer
    filterset_fields = ['opportunity']

    def perform_create(self, serializer):
        serializer.save(company_id=self.request.user.company_id)

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        award = self.get_object()
        if not award.attachment:
            from rest_framework.exceptions import NotFound
            raise NotFound("File not found.")
        
        from django.http import FileResponse
        import os
        filename = os.path.basename(award.attachment.name)
        return FileResponse(award.attachment.open('rb'), as_attachment=True, filename=filename)
