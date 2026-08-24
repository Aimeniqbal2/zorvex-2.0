from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ProcurementTagViewSet, ProcurementDocumentViewSet, ProcurementLineViewSet,
    ApprovalWorkflowViewSet, ApprovalStepViewSet, ApprovalHistoryViewSet,
    ProcurementNoteViewSet, ProcurementAttachmentViewSet, ProcurementAuditTrailViewSet
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

urlpatterns = [
    path('', include(router.urls)),
]
