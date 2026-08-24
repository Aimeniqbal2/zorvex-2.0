
# ============================================================================
# ASYNC PDF REPORTING API VIEWS (PHASE 8F-C2)
# ============================================================================

from reports.models import GeneratedReport
from reports.services.report_registry import REPORT_REGISTRY
from reports.tasks import generate_pdf_report
from django.utils import timezone
from django.http import FileResponse
from django.shortcuts import get_object_or_404

class GeneratedReportCreateAPIView(APIView):
    """
    Initiates an asynchronous PDF generation job.
    """
    required_module = 'reports'
    permission_classes = [IsAuthenticated, ModulePermission]

    def post(self, request):
        report_type = request.data.get('report_type')
        if not report_type or report_type not in REPORT_REGISTRY:
            return Response({"detail": "Invalid or missing report_type."}, status=400)
            
        registry_entry = REPORT_REGISTRY[report_type]
        if registry_entry['service_class'].__name__ in [
            'FinancialStatementsReportingService', 
            'GeneralLedgerService', 
            'AccountLedgerService',
            'ARAgingService',
            'ARReconciliationService',
            'CashMovementReportingService'
        ]:
            _check_finance_permission(request)

        # Basic param validation
        parameters = request.data.get('parameters', {})
        if not isinstance(parameters, dict):
            return Response({"detail": "Parameters must be a JSON object."}, status=400)
            
        for param_name in registry_entry['param_names']:
            # Could validate presence, but we'll let service handle missing logic (or default them)
            pass

        report = GeneratedReport.objects.create(
            company_id=request.user.company_id,
            created_by=request.user,
            report_type=report_type,
            parameters=parameters,
            status=GeneratedReport.Status.PENDING
        )

        task = generate_pdf_report.delay(report.id)
        report.task_id = task.id
        report.save(update_fields=['task_id'])

        return Response({
            "id": report.id,
            "status": report.status,
            "report_type": report.report_type,
            "created_at": report.created_at,
            "task_id": report.task_id
        }, status=202)


class GeneratedReportStatusAPIView(APIView):
    required_module = 'reports'
    permission_classes = [IsAuthenticated, ModulePermission]

    def get(self, request, pk):
        report = get_object_or_404(GeneratedReport, id=pk, company_id=request.user.company_id)
        
        data = {
            "id": report.id,
            "report_type": report.report_type,
            "status": report.status,
            "created_at": report.created_at,
            "started_at": report.started_at,
            "completed_at": report.completed_at,
            "expires_at": report.expires_at,
            "error_message": report.error_message if report.status == GeneratedReport.Status.FAILED else None,
        }
        return Response(data)


class GeneratedReportDownloadAPIView(APIView):
    required_module = 'reports'
    permission_classes = [IsAuthenticated, ModulePermission]

    def get(self, request, pk):
        report = get_object_or_404(GeneratedReport, id=pk, company_id=request.user.company_id)
        
        # Enforce finance permission if it was a financial report
        registry_entry = REPORT_REGISTRY.get(report.report_type)
        if registry_entry and registry_entry['service_class'].__name__ in [
            'FinancialStatementsReportingService', 
            'GeneralLedgerService', 
            'AccountLedgerService',
            'ARAgingService',
            'ARReconciliationService',
            'CashMovementReportingService'
        ]:
            _check_finance_permission(request)

        if report.status != GeneratedReport.Status.SUCCESS:
            return Response({"detail": f"Report cannot be downloaded. Current status: {report.status}"}, status=400)
            
        if report.expires_at and timezone.now() > report.expires_at:
            return Response({"detail": "This report has expired."}, status=400)
            
        if not report.file:
            return Response({"detail": "File not found."}, status=404)
            
        try:
            # FileResponse handles efficient streaming.
            response = FileResponse(report.file.open('rb'), content_type='application/pdf')
            response['Content-Disposition'] = f'attachment; filename="{report.file_name}"'
            return response
        except Exception:
            return Response({"detail": "Failed to read the file from storage."}, status=500)
