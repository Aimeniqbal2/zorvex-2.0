from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    SecurityOperationsDashboardView,
    OperationalSiteViewSet, ServiceContractViewSet, ContractRateViewSet,
    DeploymentViewSet, DutyAssignmentViewSet, ExtraDutyViewSet,
    SecurityAttendanceViewSet, EquipmentIssueViewSet,
    IncidentReportViewSet, IncidentAttachmentViewSet,
    DailyActivityReportViewSet, DailyActivityEntryViewSet,
    SiteStaffingRequirementViewSet, StaffingCoverageView,
    TemporaryServiceRequestViewSet, TemporaryServiceLineViewSet,
    QAChecklistTemplateViewSet, QAChecklistItemViewSet, QAInspectionViewSet,
    QAInspectionResponseViewSet, QAFindingViewSet, CorrectiveActionViewSet
)

router = DefaultRouter()
router.register(r'sites', OperationalSiteViewSet, basename='operationalsite')
router.register(r'contracts', ServiceContractViewSet, basename='servicecontract')
router.register(r'contract-rates', ContractRateViewSet, basename='contractrate')
router.register(r'deployments', DeploymentViewSet, basename='deployment')
router.register(r'duty-assignments', DutyAssignmentViewSet, basename='dutyassignment')
router.register(r'extra-duties', ExtraDutyViewSet, basename='extraduty')
router.register(r'attendance', SecurityAttendanceViewSet, basename='attendance')
router.register(r'equipment-issues', EquipmentIssueViewSet, basename='equipment-issues')
router.register(r'incidents', IncidentReportViewSet, basename='incident')
router.register(r'incident-attachments', IncidentAttachmentViewSet, basename='incident-attachment')
router.register(r'daily-activity-reports', DailyActivityReportViewSet, basename='daily-activity-report')
router.register(r'activity-entries', DailyActivityEntryViewSet, basename='activity-entry')
router.register(r'staffing-requirements', SiteStaffingRequirementViewSet, basename='staffing-requirement')

# Phase C-9
router.register(r'temporary-services', TemporaryServiceRequestViewSet, basename='temporary-service')
router.register(r'temporary-service-lines', TemporaryServiceLineViewSet, basename='temporary-service-line')
router.register(r'qa-templates', QAChecklistTemplateViewSet, basename='qa-template')
router.register(r'qa-template-items', QAChecklistItemViewSet, basename='qa-template-item')
router.register(r'qa-inspections', QAInspectionViewSet, basename='qa-inspection')
router.register(r'qa-responses', QAInspectionResponseViewSet, basename='qa-response')
router.register(r'qa-findings', QAFindingViewSet, basename='qa-finding')
router.register(r'corrective-actions', CorrectiveActionViewSet, basename='corrective-action')

urlpatterns = [
    path('dashboard/', SecurityOperationsDashboardView.as_view(), name='security-dashboard'),
    path('staffing-coverage/', StaffingCoverageView.as_view(), name='staffing-coverage'),
    path('', include(router.urls)),
]
