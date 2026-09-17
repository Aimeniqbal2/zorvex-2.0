from rest_framework import status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from erp_core.views import TenantModelViewSet
from erp_core.permissions import RolePermission
from platform_core.permissions import ModulePermission
from .models import SenderIdentity, EmailTemplate, OutboundEmail, OutboundEmailAttachment, UserEmailSignature
from .serializers import (
    SenderIdentitySerializer, EmailTemplateSerializer, 
    OutboundEmailSerializer, UserEmailSignatureSerializer
)
from .services import EmailDeliveryService



class SenderIdentityPermission(RolePermission):
    """
    Admins can manage (create/update/delete/test) sender identities.
    Managers/Sales/Support can read (list/retrieve) sender identities to use them in the composer.
    """
    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        if request.method in permissions.SAFE_METHODS:
            return request.user.role in ['admin', 'manager', 'sales', 'support']
        return request.user.role == 'admin'


class SenderIdentityViewSet(TenantModelViewSet):
    queryset = SenderIdentity.objects.all()
    serializer_class = SenderIdentitySerializer
    permission_classes = [permissions.IsAuthenticated, SenderIdentityPermission]

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated, RolePermission])
    def test_connection(self, request, pk=None):
        sender = self.get_object()
        if request.user.role != 'admin':
            return Response({'error': 'Only admins can test sender credentials.'}, status=status.HTTP_403_FORBIDDEN)
        success, error = EmailDeliveryService.test_sender_connection(sender)
        sender.refresh_from_db()
        if success:
            return Response({
                'status': 'verified',
                'verification_status': sender.verification_status,
                'message': 'Connection successful.'
            })
        else:
            return Response({
                'status': 'failed',
                'verification_status': sender.verification_status,
                'error': error
            }, status=status.HTTP_400_BAD_REQUEST)


class EmailTemplateViewSet(TenantModelViewSet):
    queryset = EmailTemplate.objects.all()
    serializer_class = EmailTemplateSerializer
    permission_classes = [permissions.IsAuthenticated, RolePermission]
    allowed_roles = ['admin', 'manager']


class OutboundEmailViewSet(TenantModelViewSet):
    queryset = OutboundEmail.objects.all()
    serializer_class = OutboundEmailSerializer
    permission_classes = [permissions.IsAuthenticated, RolePermission]
    allowed_roles = ['admin', 'manager', 'sales', 'support']
    filterset_fields = ['context_type', 'context_id', 'context_version_id', 'status']

    def perform_create(self, serializer):
        serializer.save(company=self.request.user.company, created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def send(self, request, pk=None):
        email = self.get_object()

        # If this email is linked to a Security Proposal, route through the domain workflow orchestrator
        # to guarantee version freezing, workflow state transition, and failure atomicity.
        if email.context_type == 'security_proposal' and email.context_id:
            from security_crm.models import SecurityProposal
            from security_crm.services.workflow import SecurityProposalWorkflowService
            try:
                proposal = SecurityProposal.objects.get(id=email.context_id, company=email.company)
            except SecurityProposal.DoesNotExist:
                return Response({'error': 'Linked SecurityProposal not found.'}, status=status.HTTP_404_NOT_FOUND)

            success, error, version = SecurityProposalWorkflowService.send_proposal_email(
                proposal=proposal,
                email=email,
                version_id=email.context_version_id,
                user=request.user
            )
            email.refresh_from_db()
            if success:
                return Response({'status': 'sent', 'email': OutboundEmailSerializer(email).data})
            else:
                return Response(
                    {'status': 'failed', 'error': error, 'email': OutboundEmailSerializer(email).data},
                    status=status.HTTP_400_BAD_REQUEST
                )

        # Standard generic email delivery
        success, error = EmailDeliveryService.send_outbound_email(email)
        email.refresh_from_db()

        if success:
            return Response({'status': 'sent', 'email': OutboundEmailSerializer(email).data})
        else:
            return Response(
                {'status': 'failed', 'error': error, 'email': OutboundEmailSerializer(email).data},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['post'])
    def add_attachment(self, request, pk=None):
        email = self.get_object()
        file_obj = request.FILES.get('file')
        crm_attachment_id = request.data.get('crm_attachment_id')

        if not file_obj and not crm_attachment_id:
            return Response({"error": "No file or CRM attachment provided."}, status=status.HTTP_400_BAD_REQUEST)

        attachment = OutboundEmailAttachment(outbound_email=email, company=email.company)

        if file_obj:
            attachment.file = file_obj
            attachment.filename = file_obj.name
            attachment.content_type = file_obj.content_type

        if crm_attachment_id:
            from crm.models import CRMAttachment
            try:
                crm_att = CRMAttachment.objects.get(id=crm_attachment_id, company=email.company)
                attachment.crm_attachment = crm_att
                if not attachment.filename:
                    import os
                    attachment.filename = os.path.basename(crm_att.file.name)
            except CRMAttachment.DoesNotExist:
                return Response({"error": "CRM Attachment not found."}, status=status.HTTP_404_NOT_FOUND)

        attachment.save()
        return Response({'status': 'attachment added'})


class UserEmailSignatureViewSet(TenantModelViewSet):
    """
    ViewSet for managing user personal email signatures (Text & Image formats).
    Users can manage their own signatures, and see their default signatures.
    """
    queryset = UserEmailSignature.objects.all()
    serializer_class = UserEmailSignatureSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        # Non-superadmins see only their own signatures
        if not self.request.user.is_superuser:
            qs = qs.filter(user=self.request.user)
        return qs

    def perform_create(self, serializer):
        serializer.save(company=self.request.user.company, user=self.request.user)

    @action(detail=False, methods=['get'])
    def my_signatures(self, request):
        """Quick endpoint to fetch all signatures for current authenticated user."""
        signatures = UserEmailSignature.objects.filter(
            company=request.user.company,
            user=request.user
        )
        serializer = self.get_serializer(signatures, many=True)
        return Response(serializer.data)


