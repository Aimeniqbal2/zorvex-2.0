from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from erp_core.views import TenantModelViewSet
from erp_core.permissions import RolePermission
from platform_core.permissions import ModulePermission
from .models import (
    ProcurementTag, ProcurementDocument, ProcurementLine,
    ApprovalWorkflow, ApprovalStep, ApprovalHistory,
    ProcurementNote, ProcurementAttachment, ProcurementAuditTrail
)
from .serializers import (
    ProcurementTagSerializer, ProcurementDocumentSerializer, ProcurementLineSerializer,
    ApprovalWorkflowSerializer, ApprovalStepSerializer, ApprovalHistorySerializer,
    ProcurementNoteSerializer, ProcurementAttachmentSerializer, ProcurementAuditTrailSerializer
)
from .services.approval_service import ApprovalService
from .services.goods_receipt_service import (
    create_goods_receipt, post_goods_receipt,
    create_and_post_purchase_return, get_grn_status_for_po
)


class BasePurchasingViewSet(TenantModelViewSet):
    required_module = 'purchasing'
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager', 'sales', 'hr', 'finance', 'staff']

    def perform_create(self, serializer):
        serializer.save(company_id=self.request.user.company_id)


class ProcurementTagViewSet(BasePurchasingViewSet):
    queryset = ProcurementTag.objects.all()
    serializer_class = ProcurementTagSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['name']


class ProcurementDocumentViewSet(BasePurchasingViewSet):
    queryset = ProcurementDocument.objects.prefetch_related(
        'lines', 'tags', 'notes_rel', 'attachments', 'audit_trails'
    ).select_related('crm_entity', 'warehouse', 'created_by', 'owner').all()
    serializer_class = ProcurementDocumentSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['document_type', 'status', 'warehouse', 'crm_entity']
    search_fields = ['number', 'reference_number', 'crm_entity__name']
    ordering_fields = ['number', 'document_date', 'created_at']

    def perform_create(self, serializer):
        import uuid
        from crm.models import CRMEntity
        crm_entity_id = self.request.data.get('crm_entity')
        
        # If no crm_entity is provided, create a generic vendor for purchasing
        if not crm_entity_id:
            generic_vendor, _ = CRMEntity.objects.get_or_create(
                company_id=self.request.user.company_id,
                entity_type='SUPPLIER',
                name='Generic Vendor (Auto-Created)'
            )
            serializer.save(
                company_id=self.request.user.company_id,
                created_by=self.request.user,
                number=f'DOC-{uuid.uuid4().hex[:8].upper()}',
                crm_entity=generic_vendor
            )
        else:
            number = self.request.data.get('number', f'DOC-{uuid.uuid4().hex[:8].upper()}')
            serializer.save(
                company_id=self.request.user.company_id,
                created_by=self.request.user,
                number=number
            )

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        doc = self.get_object()
        try:
            comments = request.data.get('comments', '')
            ApprovalService.submit_document(doc, request.user, comments=comments)
            return Response({'status': doc.status})
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        doc = self.get_object()
        try:
            comments = request.data.get('comments', '')
            ApprovalService.approve_document(doc, request.user, comments=comments)
            return Response({'status': doc.status})
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        doc = self.get_object()
        try:
            comments = request.data.get('comments', '')
            ApprovalService.reject_document(doc, request.user, comments=comments)
            return Response({'status': doc.status})
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
            
    @action(detail=False, methods=['get'])
    def pending_approvals(self, request):
        docs = ApprovalService.get_pending_approvals_for_user(request.user)
        page = self.paginate_queryset(docs)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(docs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def receive_goods(self, request, pk=None):
        """Create a DRAFT GRN from an approved PO. POST body: warehouse, document_date, lines[]."""
        po = self.get_object()
        try:
            from platform_core.models import Warehouse
            from inventory.models import Item
            from datetime import date as dt_date

            warehouse_id = request.data.get('warehouse')
            if not warehouse_id:
                return Response({'detail': 'warehouse is required.'}, status=status.HTTP_400_BAD_REQUEST)
            try:
                warehouse = Warehouse.objects.get(pk=warehouse_id, company=request.user.company)
            except Warehouse.DoesNotExist:
                return Response({'detail': 'Warehouse not found or belongs to different company.'}, status=status.HTTP_400_BAD_REQUEST)

            raw_lines = request.data.get('lines', [])
            parsed_lines = []
            for l in raw_lines:
                parsed_lines.append({
                    'po_line_id': l.get('po_line_id'),
                    'quantity': l.get('quantity', 0),
                    'serial_numbers': l.get('serial_numbers', []),
                })

            grn_data = {
                'warehouse': warehouse,
                'document_date': request.data.get('document_date') or dt_date.today().isoformat(),
                'reference_number': request.data.get('reference_number', ''),
                'notes': request.data.get('notes', ''),
                'lines': parsed_lines,
            }
            grn = create_goods_receipt(po, grn_data, request.user)
            serializer = self.get_serializer(grn)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def post_grn(self, request, pk=None):
        """Post a DRAFT GRN, triggering inventory transactions."""
        grn = self.get_object()
        try:
            post_goods_receipt(grn, request.user)
            grn.refresh_from_db()
            serializer = self.get_serializer(grn)
            return Response(serializer.data)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def purchase_return(self, request, pk=None):
        """Create and post a Purchase Return against a received PO."""
        po = self.get_object()
        try:
            from platform_core.models import Warehouse
            from datetime import date as dt_date

            warehouse_id = request.data.get('warehouse')
            if not warehouse_id:
                return Response({'detail': 'warehouse is required.'}, status=status.HTTP_400_BAD_REQUEST)
            try:
                warehouse = Warehouse.objects.get(pk=warehouse_id, company=request.user.company)
            except Warehouse.DoesNotExist:
                return Response({'detail': 'Warehouse not found or belongs to different company.'}, status=status.HTTP_400_BAD_REQUEST)

            raw_lines = request.data.get('lines', [])
            parsed_lines = []
            for l in raw_lines:
                parsed_lines.append({
                    'po_line_id': l.get('po_line_id'),
                    'quantity': l.get('quantity', 0),
                    'serial_numbers': l.get('serial_numbers', []),
                })

            return_data = {
                'warehouse': warehouse,
                'document_date': request.data.get('document_date') or dt_date.today().isoformat(),
                'reference_number': request.data.get('reference_number', ''),
                'notes': request.data.get('notes', ''),
                'lines': parsed_lines,
            }
            ret = create_and_post_purchase_return(po, return_data, request.user)
            serializer = self.get_serializer(ret)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'])
    def receipt_history(self, request, pk=None):
        """Return list of GRNs (and returns) linked to this PO."""
        po = self.get_object()
        try:
            history = get_grn_status_for_po(po)
            return Response(history)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class ProcurementLineViewSet(BasePurchasingViewSet):
    queryset = ProcurementLine.objects.select_related('document', 'item').all()
    serializer_class = ProcurementLineSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['description', 'item__sku', 'item__item_code']


class ApprovalWorkflowViewSet(BasePurchasingViewSet):
    queryset = ApprovalWorkflow.objects.prefetch_related('steps').all()
    serializer_class = ApprovalWorkflowSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['name', 'module', 'document_type']


class ApprovalStepViewSet(BasePurchasingViewSet):
    queryset = ApprovalStep.objects.select_related('workflow', 'approver_user').all()
    serializer_class = ApprovalStepSerializer


class ApprovalHistoryViewSet(BasePurchasingViewSet):
    queryset = ApprovalHistory.objects.select_related('workflow', 'step', 'action_by').all()
    serializer_class = ApprovalHistorySerializer


class ProcurementNoteViewSet(BasePurchasingViewSet):
    queryset = ProcurementNote.objects.select_related('document', 'user').all()
    serializer_class = ProcurementNoteSerializer

    def perform_create(self, serializer):
        serializer.save(
            company_id=self.request.user.company_id,
            user=self.request.user
        )


class ProcurementAttachmentViewSet(BasePurchasingViewSet):
    queryset = ProcurementAttachment.objects.select_related('document', 'uploaded_by').all()
    serializer_class = ProcurementAttachmentSerializer

    def perform_create(self, serializer):
        serializer.save(
            company_id=self.request.user.company_id,
            uploaded_by=self.request.user
        )


class ProcurementAuditTrailViewSet(BasePurchasingViewSet):
    queryset = ProcurementAuditTrail.objects.select_related('document', 'user').all()
    serializer_class = ProcurementAuditTrailSerializer

    def perform_create(self, serializer):
        serializer.save(
            company_id=self.request.user.company_id,
            user=self.request.user
        )
