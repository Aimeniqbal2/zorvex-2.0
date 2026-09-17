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
    ProcurementNote, ProcurementAttachment, ProcurementAuditTrail,
    VendorCategory, Vendor, VendorItem, VendorDocument,
    VendorPayment, VendorPaymentAllocation,
    PurchaseReturn, PurchaseReturnLine, VendorCreditNote,
    VendorReconciliation
)
from .serializers import (
    ProcurementTagSerializer, ProcurementDocumentSerializer, ProcurementLineSerializer,
    ApprovalWorkflowSerializer, ApprovalStepSerializer, ApprovalHistorySerializer,
    ProcurementNoteSerializer, ProcurementAttachmentSerializer, ProcurementAuditTrailSerializer,
    VendorCategorySerializer, VendorSerializer, VendorItemSerializer, VendorDocumentSerializer,
    VendorPaymentSerializer, VendorPaymentAllocationSerializer,
    PurchaseReturnSerializer, PurchaseReturnLineSerializer, VendorCreditNoteSerializer,
    VendorReconciliationSerializer
)


from .services.approval_service import ApprovalService
from .services.goods_receipt_service import (
    create_goods_receipt, post_goods_receipt, cancel_goods_receipt,
    get_po_receiving_summary, create_and_post_purchase_return, get_grn_status_for_po
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
        'lines__item', 'lines__vendor_item', 'tags', 'notes_rel', 'attachments', 'audit_trails'
    ).select_related('crm_entity', 'vendor', 'warehouse', 'created_by', 'approved_by', 'owner').all()
    serializer_class = ProcurementDocumentSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['document_type', 'status', 'warehouse', 'crm_entity', 'vendor']
    search_fields = ['number', 'reference_number', 'crm_entity__name', 'vendor__name', 'vendor__code']
    ordering_fields = ['number', 'document_date', 'created_at', 'total_amount']

    def perform_create(self, serializer):
        from crm.models import CRMEntity
        vendor = serializer.validated_data.get('vendor')
        crm_entity = serializer.validated_data.get('crm_entity')
        
        # If vendor is provided, ensure crm_entity matches vendor's crm_entity
        if vendor and not crm_entity:
            crm_entity = vendor.crm_entity

        # Fallback if neither vendor nor crm_entity provided
        if not crm_entity and not vendor:
            crm_entity, _ = CRMEntity.objects.get_or_create(
                company_id=self.request.user.company_id,
                entity_type='SUPPLIER',
                name='General Supplier'
            )

        serializer.save(
            company_id=self.request.user.company_id,
            created_by=self.request.user,
            crm_entity=crm_entity,
            vendor=vendor
        )

    @action(detail=True, methods=['post'])
    def submit_for_approval(self, request, pk=None):
        doc = self.get_object()
        try:
            from .services.po_service import submit_po_for_approval
            updated_doc = submit_po_for_approval(doc, request.user)
            serializer = self.get_serializer(updated_doc)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        """Backwards compatible submit alias."""
        return self.submit_for_approval(request, pk)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        doc = self.get_object()
        try:
            from .services.po_service import approve_po
            notes = request.data.get('approval_notes') or request.data.get('comments') or ''
            updated_doc = approve_po(doc, request.user, approval_notes=notes)
            serializer = self.get_serializer(updated_doc)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)



    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        doc = self.get_object()
        try:
            from .services.po_service import reject_po
            reason = request.data.get('reason') or request.data.get('comments') or ''
            updated_doc = reject_po(doc, request.user, reason=reason)
            serializer = self.get_serializer(updated_doc)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def send(self, request, pk=None):
        doc = self.get_object()
        try:
            from .services.po_service import send_po
            updated_doc = send_po(doc, request.user)
            serializer = self.get_serializer(updated_doc)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        doc = self.get_object()
        try:
            from .services.po_service import cancel_po
            reason = request.data.get('reason') or request.data.get('comments') or ''
            updated_doc = cancel_po(doc, request.user, reason=reason)
            serializer = self.get_serializer(updated_doc)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def recalculate(self, request, pk=None):
        doc = self.get_object()
        try:
            from .services.po_service import recalculate_po_totals
            updated_doc = recalculate_po_totals(doc)
            serializer = self.get_serializer(updated_doc)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'])
    def pending_approvals(self, request):
        docs = self.filter_queryset(self.get_queryset()).filter(
            status='PENDING_APPROVAL'
        ).select_related('crm_entity', 'vendor', 'warehouse')
        if request.query_params.get('page'):
            page = self.paginate_queryset(docs)
            if page is not None:
                serializer = self.get_serializer(page, many=True)
                return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(docs, many=True)
        return Response(serializer.data)




    @action(detail=True, methods=['post'])
    def receive_goods(self, request, pk=None):
        """Create a DRAFT GRN (or immediately post if post_now=True) from an approved PO."""
        po = self.get_object()
        try:
            from platform_core.models import Warehouse
            from datetime import date as dt_date

            warehouse_id = request.data.get('warehouse')
            if not warehouse_id:
                return Response({'detail': 'Warehouse is required.'}, status=status.HTTP_400_BAD_REQUEST)
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
                    'accepted_quantity': l.get('accepted_quantity', l.get('quantity', 0)),
                    'rejected_quantity': l.get('rejected_quantity', 0),
                    'rejection_reason': l.get('rejection_reason', ''),
                    'notes': l.get('notes', ''),
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
            
            # If post_now is True, immediately confirm and post the GRN
            if request.data.get('post_now', False):
                post_goods_receipt(grn, request.user)
                grn.refresh_from_db()

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
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def post_receipt(self, request, pk=None):
        """Alias for post_grn."""
        return self.post_grn(request, pk)

    @action(detail=True, methods=['post'])
    def cancel_grn(self, request, pk=None):
        """Cancel a DRAFT GRN."""
        grn = self.get_object()
        try:
            cancel_goods_receipt(grn, request.user)
            grn.refresh_from_db()
            serializer = self.get_serializer(grn)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def cancel_receipt(self, request, pk=None):
        """Alias for cancel_grn."""
        return self.cancel_grn(request, pk)

    @action(detail=True, methods=['get'])
    def receiving_summary(self, request, pk=None):
        """Return structured PO receiving progress with remaining quantities and GRNs."""
        po = self.get_object()
        try:
            summary = get_po_receiving_summary(po)
            return Response(summary, status=status.HTTP_200_OK)
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

    # -------------------------------------------------------------
    # Phase S-3D: Vendor Invoice & Three-Way Matching Endpoints
    # -------------------------------------------------------------

    @action(detail=True, methods=['post'], url_path='create_invoice')
    def create_invoice(self, request, pk=None):
        """
        POST /api/purchasing/documents/{po_id}/create_invoice/
        Create a new Vendor Invoice / Bill against an approved Purchase Order.
        Automatically calculates backend totals and runs 3-Way Matching.
        """
        po = self.get_object()
        try:
            from .services.invoice_service import create_vendor_invoice
            invoice = create_vendor_invoice(po, request.data, request.user)
            serializer = self.get_serializer(invoice)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='run_match')
    def run_match(self, request, pk=None):
        """
        POST /api/purchasing/documents/{invoice_id}/run_match/
        Executes Three-Way Matching (PO vs Posted GRN vs Invoice).
        """
        invoice = self.get_object()
        try:
            from .services.invoice_service import run_three_way_match
            match_details = run_three_way_match(invoice, user=request.user)
            serializer = self.get_serializer(invoice)
            return Response({
                'invoice': serializer.data,
                'match_details': match_details,
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='override_mismatch')
    def override_mismatch(self, request, pk=None):
        """
        POST /api/purchasing/documents/{invoice_id}/override_mismatch/
        Authorizes an override for mismatched invoice quantities or prices.
        """
        invoice = self.get_object()
        reason = request.data.get('reason', '')
        try:
            from .services.invoice_service import override_mismatch as svc_override_mismatch
            inv = svc_override_mismatch(invoice, request.user, reason)
            serializer = self.get_serializer(inv)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='approve_invoice')
    def approve_invoice(self, request, pk=None):
        """
        POST /api/purchasing/documents/{invoice_id}/approve_invoice/
        Approves a MATCHED (or authorized overridden) Vendor Invoice.
        """
        invoice = self.get_object()
        try:
            from .services.invoice_service import approve_vendor_invoice
            inv = approve_vendor_invoice(invoice, request.user)
            serializer = self.get_serializer(inv)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='post_bill')
    def post_bill(self, request, pk=None):
        """
        POST /api/purchasing/documents/{invoice_id}/post_bill/
        Posts an approved Vendor Invoice to Accounts Payable as AP Ready.
        """
        invoice = self.get_object()
        try:
            from .services.invoice_service import post_vendor_bill
            inv = post_vendor_bill(invoice, request.user)
            serializer = self.get_serializer(inv)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='cancel_invoice')
    def cancel_invoice(self, request, pk=None):
        """
        POST /api/purchasing/documents/{invoice_id}/cancel_invoice/
        Cancels a draft/mismatched/approved Vendor Invoice safely.
        """
        invoice = self.get_object()
        reason = request.data.get('reason', '')
        try:
            from .services.invoice_service import cancel_vendor_invoice
            inv = cancel_vendor_invoice(invoice, request.user, reason)
            serializer = self.get_serializer(inv)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'], url_path='billing_summary')
    def billing_summary(self, request, pk=None):
        """
        GET /api/purchasing/documents/{po_id}/billing_summary/
        Returns comprehensive billing metrics, remaining billable quantities, and linked invoices.
        """
        po = self.get_object()
        try:
            from .services.invoice_service import get_po_billing_summary
            summary = get_po_billing_summary(po)
            return Response(summary, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    # -------------------------------------------------------------
    # Phase S-3E: Accounts Payable & Payment Reconciliation
    # -------------------------------------------------------------

    @action(detail=False, methods=['get'], url_path='payables')
    def payables(self, request):
        """
        GET /api/purchasing/documents/payables/
        Returns all POSTED (AP Ready) Vendor Invoices with live paid/outstanding amounts.
        Supports query params: vendor, status, search.
        """
        try:
            from .services.payment_service import get_accounts_payable_list
            vendor_id = request.query_params.get('vendor')
            status_filter = request.query_params.get('status')
            search = request.query_params.get('search')
            results = get_accounts_payable_list(
                company_id=request.user.company_id,
                vendor_id=vendor_id,
                status_filter=status_filter,
                search=search
            )
            return Response(results, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'], url_path='payment_summary')
    def payment_summary(self, request, pk=None):
        """
        GET /api/purchasing/documents/{invoice_id}/payment_summary/
        Returns live payment breakdown and outstanding balance for a posted vendor invoice.
        """
        invoice = self.get_object()
        try:
            from .services.payment_service import get_invoice_payment_summary
            summary = get_invoice_payment_summary(invoice)
            return Response(summary, status=status.HTTP_200_OK)
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


# ==========================================
# PHASE S-3A: VENDOR FOUNDATION VIEWSETS
# ==========================================

class VendorCategoryViewSet(BasePurchasingViewSet):
    queryset = VendorCategory.objects.all()
    serializer_class = VendorCategorySerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['name', 'code', 'description']


class VendorViewSet(BasePurchasingViewSet):
    queryset = Vendor.objects.select_related('category', 'crm_entity').all()
    serializer_class = VendorSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['category', 'status']
    search_fields = ['name', 'code', 'contact_person', 'phone', 'email', 'tax_number']
    ordering_fields = ['name', 'code', 'created_at', 'rating']

    @action(detail=True, methods=['get', 'post'])
    def contacts(self, request, pk=None):
        """List or add contacts associated with this vendor's CRM entity."""
        vendor = self.get_object()
        if not vendor.crm_entity:
            return Response({'error': 'Vendor does not have a linked CRM entity.'}, status=status.HTTP_400_BAD_REQUEST)

        from crm.models import CRMContact
        from crm.serializers import CRMContactSerializer

        if request.method == 'GET':
            contacts = CRMContact.objects.filter(company_id=request.user.company_id, entity=vendor.crm_entity)
            serializer = CRMContactSerializer(contacts, many=True)
            return Response(serializer.data)

        elif request.method == 'POST':
            data = request.data.copy()
            data['entity'] = vendor.crm_entity.id
            serializer = CRMContactSerializer(data=data, context={'request': request})
            if serializer.is_valid():
                contact = serializer.save(company_id=request.user.company_id, entity=vendor.crm_entity)
                # If set as primary contact and vendor has no contact person, update vendor summary
                if contact.is_primary or not vendor.contact_person:
                    vendor.contact_person = f"{contact.first_name} {contact.last_name}".strip()
                    if contact.phone:
                        vendor.phone = contact.phone
                    if contact.email:
                        vendor.email = contact.email
                    vendor.save(update_fields=['contact_person', 'phone', 'email'])
                return Response(serializer.data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get', 'post'])
    def items(self, request, pk=None):
        """List or register vendor item catalogue items and pricing."""
        vendor = self.get_object()
        if request.method == 'GET':
            items = VendorItem.objects.filter(
                company_id=request.user.company_id,
                vendor=vendor
            ).select_related('item', 'item__category')
            serializer = VendorItemSerializer(items, many=True)
            return Response(serializer.data)

        elif request.method == 'POST':
            data = request.data.copy()
            data['vendor'] = vendor.id
            serializer = VendorItemSerializer(data=data, context={'request': request})
            if serializer.is_valid():
                serializer.save(company_id=request.user.company_id, vendor=vendor)
                return Response(serializer.data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get', 'post'])
    def documents(self, request, pk=None):
        """List or upload vendor documents and compliance files."""
        vendor = self.get_object()
        if request.method == 'GET':
            docs = VendorDocument.objects.filter(
                company_id=request.user.company_id,
                vendor=vendor
            ).select_related('uploaded_by')
            serializer = VendorDocumentSerializer(docs, many=True, context={'request': request})
            return Response(serializer.data)

        elif request.method == 'POST':
            data = request.data.copy()
            data['vendor'] = vendor.id
            serializer = VendorDocumentSerializer(data=data, context={'request': request})
            if serializer.is_valid():
                serializer.save(
                    company_id=request.user.company_id,
                    vendor=vendor,
                    uploaded_by=request.user
                )
                return Response(serializer.data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'], url_path='payable_summary')
    def payable_summary(self, request, pk=None):
        """
        GET /api/purchasing/vendors/{vendor_id}/payable_summary/
        Returns real-time aggregated Accounts Payable numbers (purchases, paid, outstanding, overdue).
        """
        vendor = self.get_object()
        try:
            from .services.payment_service import get_vendor_payable_summary
            summary = get_vendor_payable_summary(vendor.id, request.user.company_id)
            return Response(summary, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'], url_path='returns_summary')
    def returns_summary(self, request, pk=None):
        """
        GET /api/purchasing/vendors/{vendor_id}/returns_summary/
        Returns real-time returns count, credit notes total, and unallocated credits.
        """
        vendor = self.get_object()
        try:
            from .services.return_service import get_vendor_returns_summary
            summary = get_vendor_returns_summary(vendor.id, request.user.company_id)
            return Response(summary, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'], url_path='statement')
    def statement(self, request, pk=None):
        """
        GET /api/purchasing/vendors/{vendor_id}/statement/
        Returns chronological vendor financial ledger statement with running balances.
        """
        vendor = self.get_object()
        try:
            from .services.statement_service import get_vendor_statement
            start_date = request.query_params.get('start_date')
            end_date = request.query_params.get('end_date')
            stmt = get_vendor_statement(vendor.id, request.user.company_id, start_date=start_date, end_date=end_date)
            return Response(stmt, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'], url_path='aging')
    def aging(self, request, pk=None):
        """
        GET /api/purchasing/vendors/{vendor_id}/aging/
        Returns vendor AP aging buckets (Current, 1-30, 31-60, 61-90, 90+ days) and unpaid invoices.
        """
        vendor = self.get_object()
        try:
            from .services.statement_service import get_vendor_aging
            as_of_date = request.query_params.get('as_of_date')
            aging_data = get_vendor_aging(vendor.id, request.user.company_id, as_of_date=as_of_date)
            return Response(aging_data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], url_path='ap_aging')
    def ap_aging(self, request):
        """
        GET /api/purchasing/vendors/ap_aging/
        Returns company-wide Accounts Payable aging matrix grouped by vendor.
        """
        try:
            from .services.statement_service import get_company_ap_aging
            as_of_date = request.query_params.get('as_of_date')
            vendor_id = request.query_params.get('vendor')
            bucket_filter = request.query_params.get('bucket')
            data = get_company_ap_aging(request.user.company_id, as_of_date=as_of_date, vendor_id=vendor_id, bucket_filter=bucket_filter)
            return Response(data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)



class VendorItemViewSet(BasePurchasingViewSet):
    queryset = VendorItem.objects.select_related('vendor', 'item', 'item__category').all()
    serializer_class = VendorItemSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['vendor', 'item', 'is_preferred', 'is_active']
    search_fields = ['item__name', 'item__sku', 'vendor_sku', 'vendor__name']
    ordering_fields = ['vendor_price', 'lead_time_days', 'created_at']


class VendorDocumentViewSet(BasePurchasingViewSet):
    queryset = VendorDocument.objects.select_related('vendor', 'uploaded_by').all()
    serializer_class = VendorDocumentSerializer
    filterset_fields = ['vendor', 'document_type']
    search_fields = ['title', 'notes', 'vendor__name']

    def perform_create(self, serializer):
        serializer.save(
            company_id=self.request.user.company_id,
            uploaded_by=self.request.user
        )


class VendorPaymentViewSet(BasePurchasingViewSet):
    """
    Accounts Payable Vendor Payment ViewSet.
    Handles payment vouchers, invoice settlements, posting, and reversals.
    """
    queryset = VendorPayment.objects.select_related(
        'vendor', 'account', 'paid_by', 'created_by', 'posted_by', 'reversed_by'
    ).prefetch_related(
        'allocations__invoice', 'allocations__invoice__parent_document'
    ).all()
    serializer_class = VendorPaymentSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['vendor', 'status', 'payment_method', 'payment_date']
    search_fields = ['payment_number', 'reference_number', 'cheque_number', 'vendor__name', 'vendor__code']
    ordering_fields = ['payment_date', 'payment_number', 'amount', 'created_at']

    def create(self, request, *args, **kwargs):
        """
        POST /api/purchasing/payments/
        Create a new Vendor Payment voucher and allocations.
        """
        from .services.payment_service import create_vendor_payment
        vendor_id = request.data.get('vendor')
        payment_date = request.data.get('payment_date')
        amount = request.data.get('amount')
        payment_method = request.data.get('payment_method', 'BANK_TRANSFER')
        bank_cash_account = request.data.get('bank_cash_account', '')
        account_id = request.data.get('account')
        reference_number = request.data.get('reference_number', '')
        cheque_number = request.data.get('cheque_number', '')
        cheque_date = request.data.get('cheque_date')
        notes = request.data.get('notes', '')
        allocations_data = request.data.get('allocations', [])
        auto_post = bool(request.data.get('auto_post', False))

        if not vendor_id:
            return Response({'detail': 'vendor is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not payment_date:
            return Response({'detail': 'payment_date is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if amount is None:
            return Response({'detail': 'amount is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            payment = create_vendor_payment(
                company_id=request.user.company_id,
                vendor_id=vendor_id,
                payment_date=payment_date,
                amount=amount,
                payment_method=payment_method,
                bank_cash_account=bank_cash_account,
                account_id=account_id,
                reference_number=reference_number,
                cheque_number=cheque_number,
                cheque_date=cheque_date or None,
                notes=notes,
                allocations_data=allocations_data,
                user=request.user,
                auto_post=auto_post
            )
            serializer = self.get_serializer(payment)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='post_payment')
    def post_payment(self, request, pk=None):
        """
        POST /api/purchasing/payments/{id}/post_payment/
        Posts a draft payment and commits settlements to the allocated invoices.
        """
        payment = self.get_object()
        try:
            from .services.payment_service import post_vendor_payment
            p = post_vendor_payment(payment.id, user=request.user)
            serializer = self.get_serializer(p)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='reverse_payment')
    def reverse_payment(self, request, pk=None):
        """
        POST /api/purchasing/payments/{id}/reverse_payment/
        Reverses a posted payment, restoring the payable balances on all allocated invoices.
        """
        payment = self.get_object()
        reversal_reason = request.data.get('reversal_reason', '')
        try:
            from .services.payment_service import reverse_vendor_payment
            p = reverse_vendor_payment(payment.id, reversal_reason, user=request.user)
            serializer = self.get_serializer(p)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='cancel_payment')
    def cancel_payment(self, request, pk=None):
        """
        POST /api/purchasing/payments/{id}/cancel_payment/
        Cancels an unposted draft payment.
        """
        payment = self.get_object()
        try:
            from .services.payment_service import cancel_draft_payment
            p = cancel_draft_payment(payment.id, user=request.user)
            serializer = self.get_serializer(p)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class PurchaseReturnViewSet(BasePurchasingViewSet):
    queryset = PurchaseReturn.objects.select_related(
        'vendor', 'warehouse', 'purchase_order', 'goods_receipt', 'vendor_invoice',
        'created_by', 'approved_by', 'posted_by', 'cancelled_by'
    ).prefetch_related('lines__item', 'credit_notes').all()
    serializer_class = PurchaseReturnSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['return_number', 'vendor__name', 'notes', 'goods_receipt__number', 'purchase_order__number', 'vendor_invoice__number']
    ordering_fields = ['return_date', 'total_return_amount', 'created_at']

    def get_queryset(self):
        qs = super().get_queryset()
        vendor_id = self.request.query_params.get('vendor')
        if vendor_id:
            qs = qs.filter(vendor_id=vendor_id)
        status_param = self.request.query_params.get('status')
        if status_param and status_param != 'ALL':
            qs = qs.filter(status=status_param)
        warehouse_id = self.request.query_params.get('warehouse')
        if warehouse_id:
            qs = qs.filter(warehouse_id=warehouse_id)
        grn_id = self.request.query_params.get('goods_receipt')
        if grn_id:
            qs = qs.filter(goods_receipt_id=grn_id)
        po_id = self.request.query_params.get('purchase_order')
        if po_id:
            qs = qs.filter(purchase_order_id=po_id)
        invoice_id = self.request.query_params.get('vendor_invoice')
        if invoice_id:
            qs = qs.filter(vendor_invoice_id=invoice_id)
        return qs

    def create(self, request, *args, **kwargs):
        """
        POST /api/purchasing/returns/
        Creates a new Purchase Return with lines.
        """
        from .services.return_service import create_purchase_return
        vendor_id = request.data.get('vendor')
        warehouse_id = request.data.get('warehouse')
        return_date = request.data.get('return_date')
        reason = request.data.get('reason', 'DEFECTIVE')
        lines_data = request.data.get('lines', [])
        purchase_order_id = request.data.get('purchase_order')
        goods_receipt_id = request.data.get('goods_receipt')
        vendor_invoice_id = request.data.get('vendor_invoice')
        notes = request.data.get('notes', '')
        auto_approve = bool(request.data.get('auto_approve', False))

        if not vendor_id:
            return Response({'detail': 'vendor is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not warehouse_id:
            return Response({'detail': 'warehouse is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not lines_data:
            return Response({'detail': 'At least one return line is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            ret = create_purchase_return(
                company_id=request.user.company_id,
                vendor_id=vendor_id,
                warehouse_id=warehouse_id,
                return_date=return_date,
                reason=reason,
                lines_data=lines_data,
                purchase_order_id=purchase_order_id,
                goods_receipt_id=goods_receipt_id,
                vendor_invoice_id=vendor_invoice_id,
                notes=notes,
                user=request.user,
                auto_approve=auto_approve
            )
            serializer = self.get_serializer(ret)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='submit_for_approval')
    def submit_for_approval(self, request, pk=None):
        ret = self.get_object()
        try:
            from .services.return_service import submit_purchase_return
            updated = submit_purchase_return(ret, user=request.user)
            serializer = self.get_serializer(updated)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='approve')
    def approve(self, request, pk=None):
        ret = self.get_object()
        try:
            from .services.return_service import approve_purchase_return
            updated = approve_purchase_return(ret, user=request.user)
            serializer = self.get_serializer(updated)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='post_return')
    def post_return(self, request, pk=None):
        ret = self.get_object()
        try:
            from .services.return_service import post_purchase_return
            updated, credit_note = post_purchase_return(ret, user=request.user)
            serializer = self.get_serializer(updated)
            return Response({
                'return': serializer.data,
                'credit_note_id': str(credit_note.id),
                'credit_note_number': credit_note.credit_note_number,
                'allocated_amount': str(credit_note.allocated_amount),
                'unallocated_amount': str(credit_note.unallocated_amount)
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='cancel_return')
    def cancel_return(self, request, pk=None):
        ret = self.get_object()
        reason = request.data.get('reason', '')
        try:
            from .services.return_service import cancel_purchase_return
            updated = cancel_purchase_return(ret, user=request.user, reason=reason)
            serializer = self.get_serializer(updated)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], url_path='returnable_lines')
    def returnable_lines(self, request):
        grn_id = request.query_params.get('goods_receipt')
        if not grn_id:
            return Response({'detail': 'goods_receipt parameter is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            grn = ProcurementDocument.objects.get(id=grn_id, company_id=request.user.company_id, document_type='GOODS_RECEIPT')
            from .services.return_service import get_returnable_grn_lines
            lines = get_returnable_grn_lines(grn)
            return Response(lines, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class VendorCreditNoteViewSet(BasePurchasingViewSet):
    queryset = VendorCreditNote.objects.select_related('vendor', 'purchase_return', 'vendor_invoice', 'created_by').all()
    serializer_class = VendorCreditNoteSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['credit_note_number', 'vendor__name', 'purchase_return__return_number', 'vendor_invoice__number', 'notes']
    ordering_fields = ['credit_date', 'amount', 'created_at']

    def get_queryset(self):
        qs = super().get_queryset()
        vendor_id = self.request.query_params.get('vendor')
        if vendor_id:
            qs = qs.filter(vendor_id=vendor_id)
        invoice_id = self.request.query_params.get('vendor_invoice')
        if invoice_id:
            qs = qs.filter(vendor_invoice_id=invoice_id)
        return qs


class VendorReconciliationViewSet(BasePurchasingViewSet):
    queryset = VendorReconciliation.objects.select_related('vendor', 'reconciled_by', 'resolved_by').all()
    serializer_class = VendorReconciliationSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['reconciliation_number', 'vendor__name', 'notes', 'resolution_notes']
    ordering_fields = ['statement_date', 'as_of_date', 'variance', 'created_at']

    def get_queryset(self):
        qs = super().get_queryset()
        vendor_id = self.request.query_params.get('vendor')
        if vendor_id:
            qs = qs.filter(vendor_id=vendor_id)
        status_param = self.request.query_params.get('status')
        if status_param and status_param != 'ALL':
            qs = qs.filter(status=status_param)
        return qs

    def create(self, request, *args, **kwargs):
        vendor_id = request.data.get('vendor')
        statement_date = request.data.get('statement_date')
        as_of_date = request.data.get('as_of_date')
        vendor_reported_balance = request.data.get('vendor_reported_balance')
        notes = request.data.get('notes', '')

        if not vendor_id:
            return Response({'detail': 'vendor is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if vendor_reported_balance is None:
            return Response({'detail': 'vendor_reported_balance is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            from .services.statement_service import create_vendor_reconciliation
            rec = create_vendor_reconciliation(
                company_id=request.user.company_id,
                vendor_id=vendor_id,
                statement_date=statement_date,
                vendor_reported_balance=vendor_reported_balance,
                notes=notes,
                user=request.user,
                as_of_date=as_of_date
            )
            serializer = self.get_serializer(rec)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='resolve')
    def resolve(self, request, pk=None):
        rec = self.get_object()
        resolution_notes = request.data.get('resolution_notes', '')
        if not resolution_notes or not str(resolution_notes).strip():
            return Response({'detail': 'resolution_notes is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            from .services.statement_service import resolve_vendor_reconciliation
            resolved = resolve_vendor_reconciliation(
                reconciliation_id=rec.id,
                company_id=request.user.company_id,
                resolution_notes=resolution_notes,
                user=request.user
            )
            serializer = self.get_serializer(resolved)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


# ===========================================================================
# PHASE S-3H: PURCHASING REPORTS & VENDOR PERFORMANCE VIEWSET
# ===========================================================================

class PurchasingReportsViewSet(viewsets.ViewSet):
    """
    Phase S-3H: Provides operational reports, purchasing dashboard KPIs,
    vendor performance analytics, vendor item comparisons, exception monitoring,
    and CRM cross-module procurement demand retrieval.
    """
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    required_module = 'purchasing'
    allowed_roles = ['admin', 'manager', 'finance']
    allowed_reads = ['admin', 'manager', 'finance', 'sales', 'staff']

    def _get_company_id(self, request):
        return getattr(request, 'company_id', None) or getattr(request.user, 'company_id', None)

    @action(detail=False, methods=['get'], url_path='dashboard-kpis')
    def dashboard_kpis(self, request):
        company_id = self._get_company_id(request)
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')

        from .services.reporting_service import get_purchasing_dashboard_kpis
        data = get_purchasing_dashboard_kpis(company_id, start_date=start_date, end_date=end_date)
        return Response(data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='report-data')
    def report_data(self, request):
        company_id = self._get_company_id(request)
        report_type = request.query_params.get('report_type', 'purchases_by_vendor')
        filters = {
            'start_date': request.query_params.get('start_date'),
            'end_date': request.query_params.get('end_date'),
            'vendor': request.query_params.get('vendor'),
            'item': request.query_params.get('item'),
            'status': request.query_params.get('status'),
            'search': request.query_params.get('search')
        }

        from .services.reporting_service import get_purchasing_report
        data = get_purchasing_report(company_id, report_type, filters)
        return Response(data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='vendor-performance')
    def vendor_performance(self, request):
        company_id = self._get_company_id(request)
        vendor_id = request.query_params.get('vendor')

        from .services.reporting_service import get_vendor_performance_metrics, get_all_vendors_performance
        if vendor_id and vendor_id != 'ALL':
            data = get_vendor_performance_metrics(vendor_id, company_id)
        else:
            data = get_all_vendors_performance(company_id)
        return Response(data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='vendor-comparison')
    def vendor_comparison(self, request):
        company_id = self._get_company_id(request)
        item_id = request.query_params.get('item')
        if not item_id:
            return Response({'detail': 'item query parameter is required.'}, status=status.HTTP_400_BAD_REQUEST)

        from .services.reporting_service import compare_vendors_for_item
        try:
            data = compare_vendors_for_item(item_id, company_id)
            return Response(data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], url_path='exceptions')
    def exceptions(self, request):
        company_id = self._get_company_id(request)
        from .services.reporting_service import get_purchasing_exceptions
        data = get_purchasing_exceptions(company_id)
        return Response(data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='crm-procurement-demand')
    def crm_procurement_demand(self, request):
        company_id = self._get_company_id(request)
        proposal_id = request.query_params.get('proposal')

        from .services.reporting_service import get_crm_procurement_demand
        data = get_crm_procurement_demand(company_id, proposal_id=proposal_id)
        return Response(data, status=status.HTTP_200_OK)


