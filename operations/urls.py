from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    SecurityOperationsDashboardView,
    SecurityOperationsControlCenterView,
    OperationalSiteViewSet, ServiceContractViewSet, ContractRateViewSet,
    DeploymentViewSet, DutyAssignmentViewSet, ExtraDutyViewSet,
    SecurityAttendanceViewSet, EquipmentIssueViewSet,
    IncidentReportViewSet, IncidentAttachmentViewSet,
    DailyActivityReportViewSet, DailyActivityEntryViewSet,
    SiteStaffingRequirementViewSet, StaffingCoverageView,
    TemporaryServiceRequestViewSet, TemporaryServiceLineViewSet,
    QAChecklistTemplateViewSet, QAChecklistItemViewSet, QAInspectionViewSet,
    QAInspectionResponseViewSet, QAFindingViewSet, CorrectiveActionViewSet,
    SecurityPostViewSet, PostShiftRequirementViewSet, DutyRosterViewSet, DutyReplacementViewSet,
    DailyDutyPayViewSet, EmployeePayrollCalculationViewSet, PayrollAdditionViewSet, PayrollDeductionViewSet,
    OperationalPayrollRunViewSet, OperationalPayslipViewSet,
    SecurityInventoryViewSet, EquipmentIncidentViewSet,
    DailyOccurrenceLogViewSet, SiteCheckpointViewSet, PatrolPlanViewSet, PatrolRunViewSet,
    GuardTourViewSet, EmergencyEventViewSet, SupervisorInspectionViewSet, OperationsEscalationViewSet,
    AdvancedOperationsViewSet, InspectionPolicyViewSet, CrossModuleIntegrationViewSet,
    SecurityReportsViewSet
)

router = DefaultRouter()
router.register(r'reports', SecurityReportsViewSet, basename='security-reports')
router.register(r'cross-module', CrossModuleIntegrationViewSet, basename='cross-module')
router.register(r'advanced-ops', AdvancedOperationsViewSet, basename='advanced-ops')
router.register(r'occurrence-logs', DailyOccurrenceLogViewSet, basename='occurrence-log')
router.register(r'checkpoints', SiteCheckpointViewSet, basename='checkpoint')
router.register(r'patrol-plans', PatrolPlanViewSet, basename='patrol-plan')
router.register(r'patrol-runs', PatrolRunViewSet, basename='patrol-run')
router.register(r'guard-tours', GuardTourViewSet, basename='guard-tour')
router.register(r'emergency-events', EmergencyEventViewSet, basename='emergency-event')
router.register(r'supervisor-inspections', SupervisorInspectionViewSet, basename='supervisor-inspection')
router.register(r'inspection-policies', InspectionPolicyViewSet, basename='inspection-policy')
router.register(r'escalations', OperationsEscalationViewSet, basename='escalation')
router.register(r'security-inventory', SecurityInventoryViewSet, basename='security-inventory')
router.register(r'equipment-incidents', EquipmentIncidentViewSet, basename='equipment-incident')
router.register(r'sites', OperationalSiteViewSet, basename='operationalsite')
router.register(r'posts', SecurityPostViewSet, basename='security-post')
router.register(r'post-shift-requirements', PostShiftRequirementViewSet, basename='post-shift-requirement')
router.register(r'duty-rosters', DutyRosterViewSet, basename='duty-roster')
router.register(r'duty-replacements', DutyReplacementViewSet, basename='duty-replacement')
router.register(r'contracts', ServiceContractViewSet, basename='servicecontract')
router.register(r'contract-rates', ContractRateViewSet, basename='contractrate')
router.register(r'deployments', DeploymentViewSet, basename='deployment')
router.register(r'duty-assignments', DutyAssignmentViewSet, basename='dutyassignment')
router.register(r'extra-duties', ExtraDutyViewSet, basename='extraduty')
router.register(r'attendance', SecurityAttendanceViewSet, basename='attendance')
router.register(r'daily-duty-pay', DailyDutyPayViewSet, basename='daily-duty-pay')
router.register(r'payroll-calculations', EmployeePayrollCalculationViewSet, basename='payroll-calculation')
router.register(r'payroll-runs', OperationalPayrollRunViewSet, basename='operational-payroll-run')
router.register(r'payslips', OperationalPayslipViewSet, basename='operational-payslip')
router.register(r'payroll-additions', PayrollAdditionViewSet, basename='payroll-addition')
router.register(r'payroll-deductions', PayrollDeductionViewSet, basename='payroll-deduction')
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
    path('control-center/', SecurityOperationsControlCenterView.as_view(), name='security-control-center'),
    path('staffing-coverage/', StaffingCoverageView.as_view(), name='staffing-coverage'),
    path('', include(router.urls)),
]
