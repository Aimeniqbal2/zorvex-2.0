from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ProcurementTagViewSet, ProcurementDocumentViewSet, ProcurementLineViewSet,
    ApprovalWorkflowViewSet, ApprovalStepViewSet, ApprovalHistoryViewSet,
    ProcurementNoteViewSet, ProcurementAttachmentViewSet, ProcurementAuditTrailViewSet,
    VendorCategoryViewSet, VendorViewSet, VendorItemViewSet, VendorDocumentViewSet,
    VendorPaymentViewSet, PurchaseReturnViewSet, VendorCreditNoteViewSet,
    VendorReconciliationViewSet, PurchasingReportsViewSet
)

router = DefaultRouter()
router.register(r'tags', ProcurementTagViewSet, basename='procurement-tag')
router.register(r'documents', ProcurementDocumentViewSet, basename='procurement-document')
router.register(r'lines', ProcurementLineViewSet, basename='procurement-line')
router.register(r'workflows', ApprovalWorkflowViewSet, basename='approval-workflow')
router.register(r'steps', ApprovalStepViewSet, basename='approval-step')
router.register(r'approval-history', ApprovalHistoryViewSet, basename='approval-history')
router.register(r'notes', ProcurementNoteViewSet, basename='procurement-note')
router.register(r'attachments', ProcurementAttachmentViewSet, basename='procurement-attachment')
router.register(r'audit-trails', ProcurementAuditTrailViewSet, basename='procurement-audit-trail')

# Phase S-3A: Vendor Foundation Endpoints
router.register(r'vendor-categories', VendorCategoryViewSet, basename='vendor-category')
router.register(r'vendors', VendorViewSet, basename='vendor')
router.register(r'vendor-items', VendorItemViewSet, basename='vendor-item')
router.register(r'vendor-documents', VendorDocumentViewSet, basename='vendor-document')

# Phase S-3E: Vendor Payments & Accounts Payable Endpoints
router.register(r'payments', VendorPaymentViewSet, basename='vendor-payment')

# Phase S-3F: Purchase Returns & Vendor Credit Notes Endpoints
router.register(r'returns', PurchaseReturnViewSet, basename='purchase-return')
router.register(r'credit-notes', VendorCreditNoteViewSet, basename='vendor-credit-note')

# Phase S-3G: Vendor Statement, Aging & Balance Reconciliation Endpoints
router.register(r'reconciliations', VendorReconciliationViewSet, basename='vendor-reconciliation')

# Phase S-3H: Purchasing Reports, Vendor Performance & Exception Monitoring Endpoints
router.register(r'reports', PurchasingReportsViewSet, basename='purchasing-reports')

urlpatterns = [
    path('', include(router.urls)),
]


