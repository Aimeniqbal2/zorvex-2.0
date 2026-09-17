from rest_framework import viewsets, permissions, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from platform_core.permissions import ModulePermission
from erp_core.views import TenantModelViewSet
from erp_core.permissions import RolePermission
from .models import (
    SecurityProposal, SecurityServiceType, ClientLocation, SecurityAssessment,
    ProposalVersion, ProposalServiceLine, SecurityProposalMeeting,
    MeetingParticipant, ProposalFollowUp, SecurityProposalMeetingStatus,
    FollowUpStatus, SecurityProposalStatus, SecurityAssessmentStatus,
    AssessmentRiskFinding, AssessmentStaffingRecommendation,
    AssessmentEquipmentRecommendation, AssessmentAttachment, RiskLevel,
    ContractEquipmentRequirement, ProposalAdditionalCharge,
    ProposalSignedDocument
)
from .serializers import (
    SecurityProposalSerializer, SecurityServiceTypeSerializer, 
    ClientLocationSerializer, SecurityAssessmentSerializer,
    SecurityAssessmentDetailSerializer, ProposalVersionSerializer,
    ProposalVersionDetailSerializer, ProposalServiceLineSerializer,
    SecurityProposalMeetingSerializer, MeetingParticipantSerializer,
    ProposalFollowUpSerializer, AssessmentRiskFindingSerializer,
    AssessmentStaffingRecommendationSerializer,
    AssessmentEquipmentRecommendationSerializer,
    AssessmentAttachmentSerializer, ContractEquipmentRequirementSerializer,
    ProposalAdditionalChargeSerializer, ProposalSignedDocumentSerializer
)
from .services.workflow import SecurityProposalWorkflowService


class SecurityServiceTypeViewSet(TenantModelViewSet):
    queryset = SecurityServiceType.objects.all()
    serializer_class = SecurityServiceTypeSerializer
    permission_classes = [permissions.IsAuthenticated, RolePermission, ModulePermission]
    required_module = 'crm'
    allowed_roles = ['admin', 'manager', 'sales']
    allowed_reads = ['admin', 'manager', 'sales', 'staff']


class ClientLocationViewSet(TenantModelViewSet):
    queryset = ClientLocation.objects.all()
    serializer_class = ClientLocationSerializer
    permission_classes = [permissions.IsAuthenticated, RolePermission, ModulePermission]
    required_module = 'crm'
    allowed_roles = ['admin', 'manager', 'sales']
    allowed_reads = ['admin', 'manager', 'sales', 'staff']
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'address', 'customer__name']
    ordering_fields = ['name', 'created_at']

    def get_queryset(self):
        qs = super().get_queryset()
        customer_id = self.request.query_params.get('customer') or self.request.query_params.get('customer_id')
        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            if str(is_active).lower() in ['true', '1']:
                qs = qs.filter(is_active=True)
            elif str(is_active).lower() in ['false', '0']:
                qs = qs.filter(is_active=False)
        return qs


class SecurityProposalViewSet(TenantModelViewSet):
    queryset = SecurityProposal.objects.all()
    serializer_class = SecurityProposalSerializer
    permission_classes = [permissions.IsAuthenticated, RolePermission, ModulePermission]
    required_module = 'crm'
    allowed_roles = ['admin', 'manager', 'sales']
    allowed_reads = ['admin', 'manager', 'sales', 'staff']
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['proposal_number', 'title', 'customer__name']
    ordering_fields = ['created_at', 'status', 'valid_until']

    def get_queryset(self):
        qs = super().get_queryset()
        customer_id = self.request.query_params.get('customer') or self.request.query_params.get('customer_id')
        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs

    def perform_create(self, serializer):
        company = self.request.user.company
        proposal = serializer.save(company=company)
        # Auto-create version 1
        from django.db import transaction
        with transaction.atomic():
            ProposalVersion.objects.create(
                proposal=proposal,
                company=company,
                version_number=1,
                version_type='INITIAL'
            )

    @action(detail=True, methods=['post'])
    def transition(self, request, pk=None):
        proposal = self.get_object()
        new_status = request.data.get('status')
        if not new_status:
            return Response({'error': 'Status is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            SecurityProposalWorkflowService.transition_status(proposal, new_status, request.user)
            return Response({'status': proposal.status})
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def start_meeting_stage(self, request, pk=None):
        proposal = self.get_object()
        try:
            SecurityProposalWorkflowService.start_meeting_stage(proposal, user=request.user)
            return Response({
                'status': proposal.status,
                'message': 'Proposal transitioned to MEETING stage.'
            })
        except (ValidationError, DjangoValidationError) as ve:
            return Response({'error': str(ve)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def advance_to_site_assessment(self, request, pk=None):
        proposal = self.get_object()
        try:
            SecurityProposalWorkflowService.advance_to_site_assessment(proposal, user=request.user)
            return Response({
                'status': proposal.status,
                'message': 'Proposal advanced to SITE_ASSESSMENT stage.'
            })
        except (ValidationError, DjangoValidationError) as ve:
            return Response({'error': str(ve)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='advance-to-final-proposal')
    def advance_to_final_proposal(self, request, pk=None):
        proposal = self.get_object()
        try:
            SecurityProposalWorkflowService.advance_to_final_proposal(proposal, user=request.user)
            return Response({
                'status': proposal.status,
                'message': 'Proposal advanced to FINAL_PROPOSAL stage.'
            })
        except (ValidationError, DjangoValidationError) as ve:
            return Response({'error': str(ve)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'])
    def assessments(self, request, pk=None):
        proposal = self.get_object()
        assessments = proposal.assessments.filter(company=proposal.company).order_by('-created_at')
        serializer = SecurityAssessmentSerializer(assessments, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def meetings(self, request, pk=None):
        proposal = self.get_object()
        meetings = proposal.meetings.filter(company=proposal.company).order_by('-scheduled_at')
        serializer = SecurityProposalMeetingSerializer(meetings, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def follow_ups(self, request, pk=None):
        proposal = self.get_object()
        follow_ups = proposal.follow_ups.filter(company=proposal.company).order_by('status', 'due_at')
        serializer = ProposalFollowUpSerializer(follow_ups, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def schedule_meeting(self, request, pk=None):
        proposal = self.get_object()
        try:
            meeting = SecurityProposalWorkflowService.schedule_meeting(
                proposal=proposal,
                data=request.data.copy(),
                user=request.user
            )
            serializer = SecurityProposalMeetingSerializer(meeting)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except (ValidationError, DjangoValidationError) as ve:
            return Response({'error': str(ve)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'])
    def prepare_email(self, request, pk=None):
        proposal = self.get_object()
        version_id = request.query_params.get('version_id')
        version = None
        if version_id:
            version = proposal.versions.filter(id=version_id, company=proposal.company).first()
        if not version:
            version = proposal.versions.filter(company=proposal.company).order_by('-version_number').first()

        from communications.models import EmailTemplate
        from django.template import Context, Template
        
        template = EmailTemplate.objects.filter(company=proposal.company, code='SECURITY_INITIAL_PROPOSAL').first()
        if not template:
            template = EmailTemplate(
                subject="Proposal {{ proposal.proposal_number }} - {{ company.name }}",
                body_text="Dear {{ customer.name }},\n\nThank you for the opportunity to submit our proposal.\n\nRegards,\n{{ company.name }}"
            )

        context_dict = {
            'company': proposal.company,
            'customer': proposal.customer,
            'proposal': proposal,
            'version': version,
            'user': request.user
        }
        
        try:
            subject_template = Template(template.subject)
            body_template = Template(template.body_text)
            ctx = Context(context_dict)
            rendered_subject = subject_template.render(ctx)
            rendered_body = body_template.render(ctx)
        except Exception as e:
            rendered_subject = template.subject
            rendered_body = template.body_text
            
        prefill_to = proposal.customer.email if hasattr(proposal.customer, 'email') else ''
        if not prefill_to:
            contact = proposal.customer.contacts.first() if hasattr(proposal.customer, 'contacts') else None
            if contact and hasattr(contact, 'email'):
                prefill_to = contact.email
                
        return Response({
            'subject': rendered_subject,
            'body': rendered_body,
            'to': prefill_to,
            'version_id': str(version.id) if version else None,
            'version_number': version.version_number if version else None
        })

    @action(detail=True, methods=['post'])
    def send_proposal_email(self, request, pk=None):
        proposal = self.get_object()
        email_id = request.data.get('email_id')
        version_id = request.data.get('version_id')
        version_number = request.data.get('version_number')
        
        if not email_id:
            return Response({'error': 'email_id is required'}, status=status.HTTP_400_BAD_REQUEST)
            
        from communications.models import OutboundEmail
        
        try:
            email = OutboundEmail.objects.get(id=email_id, company=proposal.company)
        except OutboundEmail.DoesNotExist:
            return Response({'error': 'Email not found'}, status=status.HTTP_404_NOT_FOUND)
            
        try:
            success, error, version = SecurityProposalWorkflowService.send_proposal_email(
                proposal=proposal,
                email=email,
                version_id=version_id,
                version_number=version_number,
                user=request.user
            )
        except (ValidationError, DjangoValidationError) as ve:
            return Response({'error': str(ve)}, status=status.HTTP_400_BAD_REQUEST)
            
        email.refresh_from_db()
        proposal.refresh_from_db()
        
        if success:
            return Response({
                'status': 'sent',
                'proposal_status': proposal.status,
                'version_id': str(version.id) if version else None,
                'version_number': version.version_number if version else None,
                'is_frozen': version.is_frozen if version else None
            })
        else:
            return Response({'status': 'failed', 'error': error}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'])
    def versions(self, request, pk=None):
        proposal = self.get_object()
        versions = proposal.versions.filter(company=proposal.company).order_by('-version_number')
        serializer = ProposalVersionDetailSerializer(versions, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='import-recommendations')
    def import_recommendations(self, request, pk=None):
        proposal = self.get_object()
        version_id = request.data.get('version_id')
        assessment_ids = request.data.get('assessment_ids')

        version = None
        if version_id:
            version = proposal.versions.filter(id=version_id, company=proposal.company).first()
        if not version:
            version = proposal.versions.filter(
                company=proposal.company,
                version_type__icontains='Final Proposal',
                is_frozen=False
            ).first()
        if not version:
            version = proposal.versions.filter(company=proposal.company, is_frozen=False).order_by('-version_number').first()

        if not version:
            return Response({'error': 'No active editable proposal version found. Please advance to Final Proposal or create a revision first.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            result = SecurityProposalWorkflowService.import_assessment_recommendations(
                proposal_version=version,
                user=request.user,
                assessment_ids=assessment_ids
            )
            version.refresh_from_db()
            return Response({
                'message': f"Imported {result['staffing_imported']} service lines and {result['equipment_imported']} equipment requirements.",
                'result': result,
                'version': ProposalVersionDetailSerializer(version).data
            })
        except (ValidationError, DjangoValidationError) as ve:
            return Response({'error': str(ve)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='create-final-revision')
    def create_final_revision(self, request, pk=None):
        proposal = self.get_object()
        base_version_id = request.data.get('base_version_id')

        try:
            new_version = SecurityProposalWorkflowService.create_final_proposal_revision(
                proposal=proposal,
                base_version_id=base_version_id,
                user=request.user
            )
            return Response({
                'message': f"Created revision v{new_version.version_number}.",
                'version': ProposalVersionDetailSerializer(new_version).data
            }, status=status.HTTP_201_CREATED)
        except (ValidationError, DjangoValidationError) as ve:
            return Response({'error': str(ve)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'], url_path='prepare-final-email')
    def prepare_final_email(self, request, pk=None):
        proposal = self.get_object()
        version_id = request.query_params.get('version_id')
        version = None
        if version_id:
            version = proposal.versions.filter(id=version_id, company=proposal.company).first()
        if not version:
            version = proposal.versions.filter(
                company=proposal.company,
                version_type__icontains='Final Proposal'
            ).order_by('-version_number').first()
        if not version:
            version = proposal.versions.filter(company=proposal.company).order_by('-version_number').first()

        from communications.models import EmailTemplate
        from django.template import Context, Template
        
        template = EmailTemplate.objects.filter(company=proposal.company, code='SECURITY_FINAL_PROPOSAL').first()
        if not template:
            template = EmailTemplate(
                subject="Final Proposal {{ proposal.proposal_number }} v{{ version.version_number }} - {{ company.name }}",
                body_text="Dear {{ customer.name }},\n\nWe are pleased to submit our comprehensive Final Security Proposal (Ref: {{ proposal.proposal_number }} v{{ version.version_number }}).\n\nSummary of Offer:\n- Monthly Recurring Total: PKR {{ version.total_monthly_recurring }}\n- One-Time Total: PKR {{ version.total_one_time }}\n- Grand Total: PKR {{ version.grand_total }}\n\nPlease review the attached commercial terms and requirements.\n\nRegards,\n{{ company.name }}"
            )

        context_dict = {
            'company': proposal.company,
            'customer': proposal.customer,
            'proposal': proposal,
            'version': version,
            'user': request.user
        }
        
        try:
            subject_template = Template(template.subject)
            body_template = Template(template.body_text)
            ctx = Context(context_dict)
            rendered_subject = subject_template.render(ctx)
            rendered_body = body_template.render(ctx)
        except Exception:
            rendered_subject = template.subject
            rendered_body = template.body_text
            
        prefill_to = proposal.customer.email if hasattr(proposal.customer, 'email') else ''
        if not prefill_to:
            contact = proposal.customer.contacts.first() if hasattr(proposal.customer, 'contacts') else None
            if contact and hasattr(contact, 'email'):
                prefill_to = contact.email
                
        return Response({
            'subject': rendered_subject,
            'body': rendered_body,
            'to': prefill_to,
            'version_id': str(version.id) if version else None,
            'version_number': version.version_number if version else None
        })

    @action(detail=True, methods=['post'], url_path='send-final-proposal-email')
    def send_final_proposal_email(self, request, pk=None):
        proposal = self.get_object()
        email_id = request.data.get('email_id')
        version_id = request.data.get('version_id')
        version_number = request.data.get('version_number')
        
        if not email_id:
            return Response({'error': 'email_id is required'}, status=status.HTTP_400_BAD_REQUEST)
            
        from communications.models import OutboundEmail
        
        try:
            email = OutboundEmail.objects.get(id=email_id, company=proposal.company)
        except OutboundEmail.DoesNotExist:
            return Response({'error': 'Email not found'}, status=status.HTTP_404_NOT_FOUND)
            
        try:
            success, error, version = SecurityProposalWorkflowService.send_final_proposal_email(
                proposal=proposal,
                email=email,
                version_id=version_id,
                version_number=version_number,
                user=request.user
            )
        except (ValidationError, DjangoValidationError) as ve:
            return Response({'error': str(ve)}, status=status.HTTP_400_BAD_REQUEST)
            
        email.refresh_from_db()
        proposal.refresh_from_db()
        
        if success:
            return Response({
                'status': 'sent',
                'proposal_status': proposal.status,
                'version_id': str(version.id) if version else None,
                'version_number': version.version_number if version else None,
                'is_frozen': version.is_frozen if version else None
            })
        else:
            return Response({'status': 'failed', 'error': error}, status=status.HTTP_400_BAD_REQUEST)

    # -------------------------------------------------------------
    # PHASE S-2G: APPROVAL, SIGNING & ACTIVATION ACTIONS
    # -------------------------------------------------------------

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        proposal = self.get_object()
        try:
            proposal = SecurityProposalWorkflowService.approve_proposal(
                proposal=proposal,
                data=request.data,
                user=request.user
            )
            return Response(SecurityProposalSerializer(proposal).data)
        except (ValidationError, DjangoValidationError) as ve:
            return Response({'error': str(ve)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        proposal = self.get_object()
        try:
            proposal = SecurityProposalWorkflowService.reject_proposal(
                proposal=proposal,
                data=request.data,
                user=request.user
            )
            return Response(SecurityProposalSerializer(proposal).data)
        except (ValidationError, DjangoValidationError) as ve:
            return Response({'error': str(ve)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='put-on-hold')
    def put_on_hold(self, request, pk=None):
        proposal = self.get_object()
        try:
            proposal = SecurityProposalWorkflowService.put_proposal_on_hold(
                proposal=proposal,
                data=request.data,
                user=request.user
            )
            return Response(SecurityProposalSerializer(proposal).data)
        except (ValidationError, DjangoValidationError) as ve:
            return Response({'error': str(ve)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='resume-from-on-hold')
    def resume_from_on_hold(self, request, pk=None):
        proposal = self.get_object()
        target_status = request.data.get('target_status')
        try:
            proposal = SecurityProposalWorkflowService.resume_proposal_from_on_hold(
                proposal=proposal,
                target_status=target_status,
                user=request.user
            )
            return Response(SecurityProposalSerializer(proposal).data)
        except (ValidationError, DjangoValidationError) as ve:
            return Response({'error': str(ve)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='start-signing')
    def start_signing(self, request, pk=None):
        proposal = self.get_object()
        try:
            proposal = SecurityProposalWorkflowService.start_signing(
                proposal=proposal,
                data=request.data,
                user=request.user
            )
            return Response(SecurityProposalSerializer(proposal).data)
        except (ValidationError, DjangoValidationError) as ve:
            return Response({'error': str(ve)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='complete-signing')
    def complete_signing(self, request, pk=None):
        proposal = self.get_object()
        try:
            proposal = SecurityProposalWorkflowService.complete_signing(
                proposal=proposal,
                data=request.data,
                user=request.user
            )
            return Response(SecurityProposalSerializer(proposal).data)
        except (ValidationError, DjangoValidationError) as ve:
            return Response({'error': str(ve)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='upload-signed-document')
    def upload_signed_document(self, request, pk=None):
        proposal = self.get_object()
        file_obj = request.FILES.get('file')
        title = request.data.get('title', '').strip()
        document_type = request.data.get('document_type', 'SIGNED_CONTRACT')
        notes = request.data.get('notes', '').strip()

        if not title and file_obj:
            title = file_obj.name

        if not title:
            return Response({'error': 'Title is required for the document.'}, status=status.HTTP_400_BAD_REQUEST)

        doc = ProposalSignedDocument.objects.create(
            company=proposal.company,
            proposal=proposal,
            title=title,
            document_type=document_type,
            file=file_obj,
            notes=notes,
            uploaded_by=request.user
        )

        return Response(ProposalSignedDocumentSerializer(doc).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='activate-client')
    def activate_client(self, request, pk=None):
        proposal = self.get_object()
        try:
            proposal = SecurityProposalWorkflowService.activate_client(
                proposal=proposal,
                user=request.user
            )
            return Response({
                'message': 'Client activated successfully.',
                'proposal': SecurityProposalSerializer(proposal).data,
                'contract_id': str(proposal.contract.id) if proposal.contract else None,
                'contract_code': proposal.contract.contract_code if proposal.contract else None,
                'sites_count': proposal.contract.sites.count() if proposal.contract else 0
            })
        except (ValidationError, DjangoValidationError) as ve:
            return Response({'error': str(ve)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'], url_path='handoff-summary')
    def handoff_summary(self, request, pk=None):
        """
        Retrieves the structured cross-module handoff summary for an active proposal.
        """
        from security_crm.services.handoff import CRMCrossModuleHandoffService
        proposal = self.get_object()
        summary = CRMCrossModuleHandoffService.get_handoff_summary(proposal)
        return Response(summary, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='prepare-handoff')
    def prepare_handoff(self, request, pk=None):
        """
        Prepares and locks the cross-module handoff payload for downstream security modules.
        """
        from security_crm.services.handoff import CRMCrossModuleHandoffService
        proposal = self.get_object()
        notes = request.data.get('notes', '')
        try:
            summary = CRMCrossModuleHandoffService.prepare_cross_module_handoff(
                proposal=proposal,
                user=request.user,
                notes=notes
            )
            return Response({
                'message': 'Cross-module handoff prepared and certified successfully.',
                'handoff_summary': summary
            }, status=status.HTTP_200_OK)
        except (ValidationError, DjangoValidationError) as ve:
            return Response({'error': str(ve)}, status=status.HTTP_400_BAD_REQUEST)


class ProposalSignedDocumentViewSet(TenantModelViewSet):
    queryset = ProposalSignedDocument.objects.all()
    serializer_class = ProposalSignedDocumentSerializer
    permission_classes = [permissions.IsAuthenticated, RolePermission, ModulePermission]
    required_module = 'crm'
    allowed_roles = ['admin', 'manager', 'sales']
    allowed_reads = ['admin', 'manager', 'sales', 'staff']
    filter_backends = [filters.SearchFilter]
    search_fields = ['title', 'notes']

    def get_queryset(self):
        qs = super().get_queryset()
        proposal_id = self.request.query_params.get('proposal') or self.request.query_params.get('proposal_id')
        if proposal_id:
            qs = qs.filter(proposal_id=proposal_id)
        doc_type = self.request.query_params.get('document_type')
        if doc_type:
            qs = qs.filter(document_type=doc_type)
        return qs

    def perform_create(self, serializer):
        company = self.request.user.company
        proposal = serializer.validated_data.get('proposal')
        if proposal and str(proposal.company_id) != str(company.id):
            raise ValidationError({'proposal': 'Proposal must belong to the same company.'})
        serializer.save(company=company, uploaded_by=self.request.user)


class SecurityProposalMeetingViewSet(TenantModelViewSet):
    queryset = SecurityProposalMeeting.objects.all()
    serializer_class = SecurityProposalMeetingSerializer
    permission_classes = [permissions.IsAuthenticated, RolePermission, ModulePermission]
    required_module = 'crm'
    allowed_roles = ['admin', 'manager', 'sales']
    allowed_reads = ['admin', 'manager', 'sales', 'staff']
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['subject', 'location', 'agenda', 'discussion_notes']
    ordering_fields = ['scheduled_at', 'status', 'created_at']

    def get_queryset(self):
        qs = super().get_queryset()
        proposal_id = self.request.query_params.get('proposal') or self.request.query_params.get('proposal_id')
        if proposal_id:
            qs = qs.filter(proposal_id=proposal_id)
        meeting_status = self.request.query_params.get('status')
        if meeting_status:
            qs = qs.filter(status=meeting_status)
        meeting_type = self.request.query_params.get('meeting_type')
        if meeting_type:
            qs = qs.filter(meeting_type=meeting_type)
        outcome = self.request.query_params.get('outcome')
        if outcome:
            qs = qs.filter(outcome=outcome)
        return qs

    def perform_create(self, serializer):
        company = self.request.user.company
        proposal = serializer.validated_data.get('proposal')
        
        # Validate proposal tenant
        if proposal and str(proposal.company_id) != str(company.id):
            raise ValidationError({'proposal': 'Proposal must belong to the same company.'})

        # Auto-advance proposal to MEETING if it is currently in SENT
        if proposal and proposal.status == SecurityProposalStatus.SENT:
            SecurityProposalWorkflowService.start_meeting_stage(proposal, user=self.request.user)

        serializer.save(company=company, created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        meeting = self.get_object()
        outcome = request.data.get('outcome', meeting.outcome)
        outcome_notes = request.data.get('outcome_notes', meeting.outcome_notes)
        discussion_notes = request.data.get('discussion_notes', meeting.discussion_notes)
        client_requirements = request.data.get('client_requirements', meeting.client_requirements)
        commercial_concerns = request.data.get('commercial_concerns', meeting.commercial_concerns)
        operational_concerns = request.data.get('operational_concerns', meeting.operational_concerns)
        agreed_points = request.data.get('agreed_points', meeting.agreed_points)
        pending_items = request.data.get('pending_items', meeting.pending_items)

        meeting.status = SecurityProposalMeetingStatus.COMPLETED
        meeting.outcome = outcome
        meeting.outcome_notes = outcome_notes
        meeting.discussion_notes = discussion_notes
        meeting.client_requirements = client_requirements
        meeting.commercial_concerns = commercial_concerns
        meeting.operational_concerns = operational_concerns
        meeting.agreed_points = agreed_points
        meeting.pending_items = pending_items
        meeting.completed_at = timezone.now()
        meeting.save()

        # Optional follow-up creation
        follow_up_title = request.data.get('follow_up_title')
        if follow_up_title:
            ProposalFollowUp.objects.create(
                company=meeting.company,
                proposal=meeting.proposal,
                related_meeting=meeting,
                title=follow_up_title,
                description=request.data.get('follow_up_description', ''),
                due_at=request.data.get('follow_up_due_at'),
                priority=request.data.get('follow_up_priority', 'MEDIUM'),
                assigned_to_id=request.data.get('follow_up_assigned_to'),
                created_by=request.user
            )

        meeting.refresh_from_db()
        return Response(SecurityProposalMeetingSerializer(meeting).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        meeting = self.get_object()
        meeting.status = SecurityProposalMeetingStatus.CANCELLED
        meeting.save(update_fields=['status', 'updated_at'])
        return Response(SecurityProposalMeetingSerializer(meeting).data)

    @action(detail=True, methods=['post'])
    def no_show(self, request, pk=None):
        meeting = self.get_object()
        meeting.status = SecurityProposalMeetingStatus.NO_SHOW
        meeting.save(update_fields=['status', 'updated_at'])
        return Response(SecurityProposalMeetingSerializer(meeting).data)

    @action(detail=True, methods=['post'])
    def add_participant(self, request, pk=None):
        meeting = self.get_object()
        data = request.data.copy()
        data['meeting'] = meeting.id
        serializer = MeetingParticipantSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        participant = serializer.save(company=meeting.company)
        return Response(MeetingParticipantSerializer(participant).data, status=status.HTTP_201_CREATED)


    @action(detail=True, methods=['post'])
    def add_follow_up(self, request, pk=None):
        meeting = self.get_object()
        data = request.data.copy()
        data['proposal'] = meeting.proposal.id
        data['related_meeting'] = meeting.id
        serializer = ProposalFollowUpSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        follow_up = serializer.save(company=meeting.company, created_by=request.user)
        return Response(ProposalFollowUpSerializer(follow_up).data, status=status.HTTP_201_CREATED)


class MeetingParticipantViewSet(TenantModelViewSet):
    queryset = MeetingParticipant.objects.all()
    serializer_class = MeetingParticipantSerializer
    permission_classes = [permissions.IsAuthenticated, RolePermission, ModulePermission]
    required_module = 'crm'
    allowed_roles = ['admin', 'manager', 'sales']
    allowed_reads = ['admin', 'manager', 'sales', 'staff']

    def get_queryset(self):
        qs = super().get_queryset()
        meeting_id = self.request.query_params.get('meeting') or self.request.query_params.get('meeting_id')
        if meeting_id:
            qs = qs.filter(meeting_id=meeting_id)
        participant_type = self.request.query_params.get('participant_type')
        if participant_type:
            qs = qs.filter(participant_type=participant_type)
        return qs

    def perform_create(self, serializer):
        company = self.request.user.company
        meeting = serializer.validated_data.get('meeting')
        crm_contact = serializer.validated_data.get('crm_contact')
        user = serializer.validated_data.get('user')

        if meeting and str(meeting.company_id) != str(company.id):
            raise ValidationError({'meeting': 'Meeting must belong to the same company.'})
        if crm_contact:
            if str(crm_contact.company_id) != str(company.id):
                raise ValidationError({'crm_contact': 'Contact must belong to the same company.'})
            if meeting and str(crm_contact.entity_id) != str(meeting.proposal.customer_id):
                raise ValidationError({'crm_contact': 'Contact must belong to the proposal customer.'})
        if user and str(user.company_id) != str(company.id):
            raise ValidationError({'user': 'User must belong to the same company.'})

        serializer.save(company=company)


class ProposalFollowUpViewSet(TenantModelViewSet):
    queryset = ProposalFollowUp.objects.all()
    serializer_class = ProposalFollowUpSerializer
    permission_classes = [permissions.IsAuthenticated, RolePermission, ModulePermission]
    required_module = 'crm'
    allowed_roles = ['admin', 'manager', 'sales']
    allowed_reads = ['admin', 'manager', 'sales', 'staff']
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['title', 'description']
    ordering_fields = ['due_at', 'status', 'priority', 'created_at']

    def get_queryset(self):
        qs = super().get_queryset()
        proposal_id = self.request.query_params.get('proposal') or self.request.query_params.get('proposal_id')
        if proposal_id:
            qs = qs.filter(proposal_id=proposal_id)
        related_meeting = self.request.query_params.get('related_meeting') or self.request.query_params.get('related_meeting_id')
        if related_meeting:
            qs = qs.filter(related_meeting_id=related_meeting)
        st = self.request.query_params.get('status')
        if st:
            qs = qs.filter(status=st)
        priority = self.request.query_params.get('priority')
        if priority:
            qs = qs.filter(priority=priority)
        assigned_to = self.request.query_params.get('assigned_to')
        if assigned_to:
            qs = qs.filter(assigned_to_id=assigned_to)
        return qs

    def perform_create(self, serializer):
        company = self.request.user.company
        proposal = serializer.validated_data.get('proposal')
        related_meeting = serializer.validated_data.get('related_meeting')
        assigned_to = serializer.validated_data.get('assigned_to')

        if proposal and str(proposal.company_id) != str(company.id):
            raise ValidationError({'proposal': 'Proposal must belong to the same company.'})
        if related_meeting:
            if str(related_meeting.company_id) != str(company.id) or str(related_meeting.proposal_id) != str(proposal.id):
                raise ValidationError({'related_meeting': 'Related meeting must belong to this proposal and company.'})
        if assigned_to and str(assigned_to.company_id) != str(company.id):
            raise ValidationError({'assigned_to': 'Assigned user must belong to the same company.'})

        serializer.save(company=company, created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        follow_up = self.get_object()
        follow_up.status = FollowUpStatus.COMPLETED
        follow_up.completed_at = timezone.now()
        follow_up.save(update_fields=['status', 'completed_at', 'updated_at'])
        return Response(ProposalFollowUpSerializer(follow_up).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        follow_up = self.get_object()
        follow_up.status = FollowUpStatus.CANCELLED
        follow_up.save(update_fields=['status', 'updated_at'])
        return Response(ProposalFollowUpSerializer(follow_up).data)


class SecurityAssessmentViewSet(TenantModelViewSet):
    queryset = SecurityAssessment.objects.all()
    serializer_class = SecurityAssessmentSerializer
    permission_classes = [permissions.IsAuthenticated, RolePermission, ModulePermission]
    required_module = 'crm'
    allowed_roles = ['admin', 'manager', 'sales']
    allowed_reads = ['admin', 'manager', 'sales', 'staff']
    filter_backends = [filters.SearchFilter]
    search_fields = ['client_location__name', 'proposal__proposal_number', 'site_overview']

    def get_queryset(self):
        qs = super().get_queryset()
        proposal_id = self.request.query_params.get('proposal') or self.request.query_params.get('proposal_id')
        if proposal_id:
            qs = qs.filter(proposal_id=proposal_id)
        location_id = self.request.query_params.get('client_location') or self.request.query_params.get('location_id')
        if location_id:
            qs = qs.filter(client_location_id=location_id)
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        customer_id = self.request.query_params.get('customer') or self.request.query_params.get('customer_id')
        if customer_id:
            from django.db.models import Q
            qs = qs.filter(Q(proposal__customer_id=customer_id) | Q(client_location__customer_id=customer_id))
        return qs

    def get_serializer_class(self):
        if self.action in ['retrieve', 'complete', 'reopen']:
            return SecurityAssessmentDetailSerializer
        return SecurityAssessmentSerializer

    def perform_create(self, serializer):
        company = self.request.user.company
        proposal = serializer.validated_data.get('proposal')
        client_location = serializer.validated_data.get('client_location')

        if proposal and str(proposal.company_id) != str(company.id):
            raise ValidationError({'proposal': 'Proposal must belong to the same company.'})
        if client_location and str(client_location.company_id) != str(company.id):
            raise ValidationError({'client_location': 'Client Location must belong to the same company.'})
        if client_location and proposal and str(client_location.customer_id) != str(proposal.customer_id):
            raise ValidationError({'client_location': 'Client location does not belong to the proposal customer.'})

        assessed_by = serializer.validated_data.get('assessed_by') or self.request.user
        serializer.save(company=company, assessed_by=assessed_by)

    def perform_update(self, serializer):
        instance = self.get_object()
        if instance.status == SecurityAssessmentStatus.COMPLETED:
            new_status = serializer.validated_data.get('status')
            if new_status == SecurityAssessmentStatus.COMPLETED or not new_status:
                raise ValidationError({'detail': 'Completed assessments are locked against modification. Reopen assessment first.'})
        serializer.save()

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        assessment = self.get_object()
        assessment.status = SecurityAssessmentStatus.COMPLETED
        assessment.completed_at = timezone.now()
        assessment.completed_by = request.user
        assessment.save(update_fields=['status', 'completed_at', 'completed_by', 'updated_at'])
        return Response(SecurityAssessmentDetailSerializer(assessment).data)

    @action(detail=True, methods=['post'])
    def reopen(self, request, pk=None):
        assessment = self.get_object()
        assessment.status = SecurityAssessmentStatus.IN_PROGRESS
        assessment.save(update_fields=['status', 'updated_at'])
        return Response(SecurityAssessmentDetailSerializer(assessment).data)

    @action(detail=True, methods=['post'], url_path='add-risk')
    def add_risk(self, request, pk=None):
        assessment = self.get_object()
        if assessment.status == SecurityAssessmentStatus.COMPLETED:
            return Response({'error': 'Cannot add risk findings to a completed assessment.'}, status=status.HTTP_400_BAD_REQUEST)
        
        serializer = AssessmentRiskFindingSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(company=assessment.company, assessment=assessment)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='add-staffing')
    def add_staffing(self, request, pk=None):
        assessment = self.get_object()
        if assessment.status == SecurityAssessmentStatus.COMPLETED:
            return Response({'error': 'Cannot add staffing recommendations to a completed assessment.'}, status=status.HTTP_400_BAD_REQUEST)
        
        serializer = AssessmentStaffingRecommendationSerializer(data=request.data)
        if serializer.is_valid():
            service_type = serializer.validated_data.get('service_type')
            if service_type and str(service_type.company_id) != str(assessment.company_id):
                return Response({'error': 'ServiceType company mismatch.'}, status=status.HTTP_400_BAD_REQUEST)
            serializer.save(company=assessment.company, assessment=assessment)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='add-equipment')
    def add_equipment(self, request, pk=None):
        assessment = self.get_object()
        if assessment.status == SecurityAssessmentStatus.COMPLETED:
            return Response({'error': 'Cannot add equipment recommendations to a completed assessment.'}, status=status.HTTP_400_BAD_REQUEST)
        
        serializer = AssessmentEquipmentRecommendationSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(company=assessment.company, assessment=assessment)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='add-attachment')
    def add_attachment(self, request, pk=None):
        assessment = self.get_object()
        if assessment.status == SecurityAssessmentStatus.COMPLETED:
            return Response({'error': 'Cannot add attachments to a completed assessment.'}, status=status.HTTP_400_BAD_REQUEST)
        
        serializer = AssessmentAttachmentSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(company=assessment.company, assessment=assessment, uploaded_by=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class AssessmentRiskFindingViewSet(TenantModelViewSet):
    queryset = AssessmentRiskFinding.objects.all()
    serializer_class = AssessmentRiskFindingSerializer
    permission_classes = [permissions.IsAuthenticated, RolePermission, ModulePermission]
    required_module = 'crm'
    allowed_roles = ['admin', 'manager', 'sales']
    allowed_reads = ['admin', 'manager', 'sales', 'staff']
    filter_backends = [filters.SearchFilter]
    search_fields = ['hazard_title', 'description', 'control_measures']

    def get_queryset(self):
        qs = super().get_queryset()
        assessment_id = self.request.query_params.get('assessment') or self.request.query_params.get('assessment_id')
        if assessment_id:
            qs = qs.filter(assessment_id=assessment_id)
        risk_level = self.request.query_params.get('risk_level')
        if risk_level:
            qs = qs.filter(risk_level=risk_level)
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs

    def perform_create(self, serializer):
        assessment = serializer.validated_data.get('assessment')
        if assessment and str(assessment.company_id) != str(self.request.user.company_id):
            raise ValidationError({'assessment': 'Assessment company mismatch.'})
        serializer.save(company=self.request.user.company)


class AssessmentStaffingRecommendationViewSet(TenantModelViewSet):
    queryset = AssessmentStaffingRecommendation.objects.all()
    serializer_class = AssessmentStaffingRecommendationSerializer
    permission_classes = [permissions.IsAuthenticated, RolePermission, ModulePermission]
    required_module = 'crm'
    allowed_roles = ['admin', 'manager', 'sales']
    allowed_reads = ['admin', 'manager', 'sales', 'staff']

    def get_queryset(self):
        qs = super().get_queryset()
        assessment_id = self.request.query_params.get('assessment') or self.request.query_params.get('assessment_id')
        if assessment_id:
            qs = qs.filter(assessment_id=assessment_id)
        service_type = self.request.query_params.get('service_type')
        if service_type:
            qs = qs.filter(service_type_id=service_type)
        return qs

    def perform_create(self, serializer):
        assessment = serializer.validated_data.get('assessment')
        service_type = serializer.validated_data.get('service_type')
        if assessment and str(assessment.company_id) != str(self.request.user.company_id):
            raise ValidationError({'assessment': 'Assessment company mismatch.'})
        if service_type and str(service_type.company_id) != str(self.request.user.company_id):
            raise ValidationError({'service_type': 'ServiceType company mismatch.'})
        serializer.save(company=self.request.user.company)


class AssessmentEquipmentRecommendationViewSet(TenantModelViewSet):
    queryset = AssessmentEquipmentRecommendation.objects.all()
    serializer_class = AssessmentEquipmentRecommendationSerializer
    permission_classes = [permissions.IsAuthenticated, RolePermission, ModulePermission]
    required_module = 'crm'
    allowed_roles = ['admin', 'manager', 'sales']
    allowed_reads = ['admin', 'manager', 'sales', 'staff']

    def get_queryset(self):
        qs = super().get_queryset()
        assessment_id = self.request.query_params.get('assessment') or self.request.query_params.get('assessment_id')
        if assessment_id:
            qs = qs.filter(assessment_id=assessment_id)
        return qs

    def perform_create(self, serializer):
        assessment = serializer.validated_data.get('assessment')
        if assessment and str(assessment.company_id) != str(self.request.user.company_id):
            raise ValidationError({'assessment': 'Assessment company mismatch.'})
        serializer.save(company=self.request.user.company)


class AssessmentAttachmentViewSet(TenantModelViewSet):
    queryset = AssessmentAttachment.objects.all()
    serializer_class = AssessmentAttachmentSerializer
    permission_classes = [permissions.IsAuthenticated, RolePermission, ModulePermission]
    required_module = 'crm'
    allowed_roles = ['admin', 'manager', 'sales']
    allowed_reads = ['admin', 'manager', 'sales', 'staff']

    def get_queryset(self):
        qs = super().get_queryset()
        assessment_id = self.request.query_params.get('assessment') or self.request.query_params.get('assessment_id')
        if assessment_id:
            qs = qs.filter(assessment_id=assessment_id)
        category = self.request.query_params.get('category')
        if category:
            qs = qs.filter(category=category)
        return qs

    def perform_create(self, serializer):
        assessment = serializer.validated_data.get('assessment')
        if assessment and str(assessment.company_id) != str(self.request.user.company_id):
            raise ValidationError({'assessment': 'Assessment company mismatch.'})
        serializer.save(company=self.request.user.company, uploaded_by=self.request.user)



class ProposalVersionViewSet(TenantModelViewSet):
    queryset = ProposalVersion.objects.all()
    serializer_class = ProposalVersionSerializer
    permission_classes = [permissions.IsAuthenticated, RolePermission, ModulePermission]
    required_module = 'crm'
    allowed_roles = ['admin', 'manager', 'sales']
    allowed_reads = ['admin', 'manager', 'sales', 'staff']

    def get_queryset(self):
        qs = super().get_queryset()
        proposal_id = self.request.query_params.get('proposal') or self.request.query_params.get('proposal_id')
        if proposal_id:
            qs = qs.filter(proposal_id=proposal_id)
        version_number = self.request.query_params.get('version_number')
        if version_number:
            qs = qs.filter(version_number=version_number)
        is_frozen = self.request.query_params.get('is_frozen')
        if is_frozen is not None:
            if str(is_frozen).lower() in ['true', '1']:
                qs = qs.filter(is_frozen=True)
            elif str(is_frozen).lower() in ['false', '0']:
                qs = qs.filter(is_frozen=False)
        return qs

    def get_serializer_class(self):
        if self.action in ['retrieve', 'import_recommendations', 'create_revision']:
            return ProposalVersionDetailSerializer
        return ProposalVersionSerializer

    def perform_create(self, serializer):
        proposal = serializer.validated_data.get('proposal')
        if proposal and str(proposal.company_id) != str(self.request.user.company_id):
            raise ValidationError({'proposal': 'Proposal company mismatch.'})
        serializer.save(company=self.request.user.company)

    def perform_update(self, serializer):
        instance = self.get_object()
        if instance.is_frozen:
            raise ValidationError({'detail': 'Cannot modify a frozen proposal version. Create a revision instead.'})
        serializer.save()

    @action(detail=True, methods=['post'], url_path='import-recommendations')
    def import_recommendations(self, request, pk=None):
        version = self.get_object()
        assessment_ids = request.data.get('assessment_ids')
        try:
            result = SecurityProposalWorkflowService.import_assessment_recommendations(
                proposal_version=version,
                user=request.user,
                assessment_ids=assessment_ids
            )
            version.refresh_from_db()
            return Response({
                'message': f"Imported {result['staffing_imported']} service lines and {result['equipment_imported']} equipment requirements.",
                'result': result,
                'version': ProposalVersionDetailSerializer(version).data
            })
        except (ValidationError, DjangoValidationError) as ve:
            return Response({'error': str(ve)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='create-revision')
    def create_revision(self, request, pk=None):
        version = self.get_object()
        try:
            new_version = SecurityProposalWorkflowService.create_final_proposal_revision(
                proposal=version.proposal,
                base_version_id=version.id,
                user=request.user
            )
            return Response({
                'message': f"Created revision v{new_version.version_number}.",
                'version': ProposalVersionDetailSerializer(new_version).data
            }, status=status.HTTP_201_CREATED)
        except (ValidationError, DjangoValidationError) as ve:
            return Response({'error': str(ve)}, status=status.HTTP_400_BAD_REQUEST)


class ProposalServiceLineViewSet(TenantModelViewSet):
    queryset = ProposalServiceLine.objects.all()
    serializer_class = ProposalServiceLineSerializer
    permission_classes = [permissions.IsAuthenticated, RolePermission, ModulePermission]
    required_module = 'crm'
    allowed_roles = ['admin', 'manager', 'sales']
    allowed_reads = ['admin', 'manager', 'sales', 'staff']

    def get_queryset(self):
        qs = super().get_queryset()
        version_id = self.request.query_params.get('proposal_version') or self.request.query_params.get('proposal_version_id')
        if version_id:
            qs = qs.filter(proposal_version_id=version_id)
        location_id = self.request.query_params.get('location') or self.request.query_params.get('location_id')
        if location_id:
            qs = qs.filter(location_id=location_id)
        service_type = self.request.query_params.get('service_type')
        if service_type:
            qs = qs.filter(service_type_id=service_type)
        return qs

    def perform_create(self, serializer):
        version = serializer.validated_data.get('proposal_version')
        location = serializer.validated_data.get('location')
        service_type = serializer.validated_data.get('service_type')

        if version and str(version.company_id) != str(self.request.user.company_id):
            raise ValidationError({'proposal_version': 'ProposalVersion company mismatch.'})
        if version and version.is_frozen:
            raise ValidationError({'detail': 'Cannot add service lines to a frozen proposal version.'})
        if location and str(location.company_id) != str(self.request.user.company_id):
            raise ValidationError({'location': 'Location company mismatch.'})
        if service_type and str(service_type.company_id) != str(self.request.user.company_id):
            raise ValidationError({'service_type': 'ServiceType company mismatch.'})

        serializer.save(company=self.request.user.company)

    def perform_update(self, serializer):
        instance = self.get_object()
        if instance.proposal_version.is_frozen:
            raise ValidationError({'detail': 'Cannot modify service lines in a frozen proposal version.'})
        serializer.save()

    def perform_destroy(self, instance):
        if instance.proposal_version.is_frozen:
            raise ValidationError({'detail': 'Cannot delete service lines from a frozen proposal version.'})
        super().perform_destroy(instance)


class ContractEquipmentRequirementViewSet(TenantModelViewSet):
    queryset = ContractEquipmentRequirement.objects.all()
    serializer_class = ContractEquipmentRequirementSerializer
    permission_classes = [permissions.IsAuthenticated, RolePermission, ModulePermission]
    required_module = 'crm'
    allowed_roles = ['admin', 'manager', 'sales']
    allowed_reads = ['admin', 'manager', 'sales', 'staff']

    def get_queryset(self):
        qs = super().get_queryset()
        version_id = self.request.query_params.get('proposal_version') or self.request.query_params.get('proposal_version_id')
        if version_id:
            qs = qs.filter(proposal_version_id=version_id)
        location_id = self.request.query_params.get('location') or self.request.query_params.get('location_id')
        if location_id:
            qs = qs.filter(location_id=location_id)
        charge_type = self.request.query_params.get('charge_type')
        if charge_type:
            qs = qs.filter(charge_type=charge_type)
        return qs

    def perform_create(self, serializer):
        version = serializer.validated_data.get('proposal_version')
        location = serializer.validated_data.get('location')
        inventory_item = serializer.validated_data.get('inventory_item')

        if version and str(version.company_id) != str(self.request.user.company_id):
            raise ValidationError({'proposal_version': 'ProposalVersion company mismatch.'})
        if version and version.is_frozen:
            raise ValidationError({'detail': 'Cannot add equipment to a frozen proposal version.'})
        if location and str(location.company_id) != str(self.request.user.company_id):
            raise ValidationError({'location': 'Location company mismatch.'})
        if inventory_item and str(inventory_item.company_id) != str(self.request.user.company_id):
            raise ValidationError({'inventory_item': 'Inventory item company mismatch.'})

        serializer.save(company=self.request.user.company)

    def perform_update(self, serializer):
        instance = self.get_object()
        if instance.proposal_version.is_frozen:
            raise ValidationError({'detail': 'Cannot modify equipment in a frozen proposal version.'})
        serializer.save()

    def perform_destroy(self, instance):
        if instance.proposal_version.is_frozen:
            raise ValidationError({'detail': 'Cannot delete equipment from a frozen proposal version.'})
        super().perform_destroy(instance)


class ProposalAdditionalChargeViewSet(TenantModelViewSet):
    queryset = ProposalAdditionalCharge.objects.all()
    serializer_class = ProposalAdditionalChargeSerializer
    permission_classes = [permissions.IsAuthenticated, RolePermission, ModulePermission]
    required_module = 'crm'
    allowed_roles = ['admin', 'manager', 'sales']
    allowed_reads = ['admin', 'manager', 'sales', 'staff']

    def get_queryset(self):
        qs = super().get_queryset()
        version_id = self.request.query_params.get('proposal_version') or self.request.query_params.get('proposal_version_id')
        if version_id:
            qs = qs.filter(proposal_version_id=version_id)
        charge_type = self.request.query_params.get('charge_type')
        if charge_type:
            qs = qs.filter(charge_type=charge_type)
        return qs

    def perform_create(self, serializer):
        version = serializer.validated_data.get('proposal_version')
        if version and str(version.company_id) != str(self.request.user.company_id):
            raise ValidationError({'proposal_version': 'ProposalVersion company mismatch.'})
        if version and version.is_frozen:
            raise ValidationError({'detail': 'Cannot add charges to a frozen proposal version.'})

        serializer.save(company=self.request.user.company)

    def perform_update(self, serializer):
        instance = self.get_object()
        if instance.proposal_version.is_frozen:
            raise ValidationError({'detail': 'Cannot modify charges in a frozen proposal version.'})
        serializer.save()

    def perform_destroy(self, instance):
        if instance.proposal_version.is_frozen:
            raise ValidationError({'detail': 'Cannot delete charges from a frozen proposal version.'})
        super().perform_destroy(instance)

