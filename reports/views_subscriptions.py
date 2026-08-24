from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from .models import ReportSubscription, GeneratedReport
from .serializers import ReportSubscriptionSerializer
from .services.scheduling import SchedulingService
from reports.views import _check_finance_permission

class ReportSubscriptionViewSet(viewsets.ModelViewSet):
    serializer_class = ReportSubscriptionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ReportSubscription.objects.filter(company=self.request.user.company)

    def perform_create(self, serializer):
        # RBAC Check
        report_type = serializer.validated_data.get('report_type')
        from reports.services.report_registry import REPORT_REGISTRY
        registry_entry = REPORT_REGISTRY.get(report_type)
        if registry_entry and registry_entry.get('is_financial', False):
            # Same check as Phase 8F-C2
            _check_finance_permission(self.request)

        sub = serializer.save(company=self.request.user.company, created_by=self.request.user)
        
        # Calculate initial next_run_at
        sub.next_run_at = SchedulingService.calculate_next_run_at(sub)
        sub.save(update_fields=['next_run_at'])

    def perform_update(self, serializer):
        # RBAC Check
        report_type = serializer.validated_data.get('report_type', self.get_object().report_type)
        from reports.services.report_registry import REPORT_REGISTRY
        registry_entry = REPORT_REGISTRY.get(report_type)
        if registry_entry and registry_entry.get('is_financial', False):
            _check_finance_permission(self.request)

        sub = serializer.save()
        # Recalculate next_run_at
        sub.next_run_at = SchedulingService.calculate_next_run_at(sub)
        sub.save(update_fields=['next_run_at'])

    @action(detail=True, methods=['post'], url_path='pause')
    def pause(self, request, pk=None):
        sub = self.get_object()
        sub.is_active = False
        sub.save(update_fields=['is_active'])
        return Response({"status": "paused", "is_active": sub.is_active})

    @action(detail=True, methods=['post'], url_path='resume')
    def resume(self, request, pk=None):
        sub = self.get_object()
        sub.is_active = True
        sub.next_run_at = SchedulingService.calculate_next_run_at(sub)
        sub.save(update_fields=['is_active', 'next_run_at'])
        return Response({"status": "resumed", "is_active": sub.is_active, "next_run_at": sub.next_run_at})

    @action(detail=True, methods=['post'], url_path='run-now')
    def run_now(self, request, pk=None):
        sub = self.get_object()
        
        from reports.services.report_registry import REPORT_REGISTRY
        registry_entry = REPORT_REGISTRY.get(sub.report_type)
        if registry_entry and registry_entry.get('is_financial', False):
            _check_finance_permission(self.request)

        import zoneinfo
        tz = zoneinfo.ZoneInfo(sub.timezone)
        local_now = timezone.now().astimezone(tz).date()
        resolved_params = SchedulingService.resolve_relative_parameters(sub.parameters, local_now)

        report = GeneratedReport.objects.create(
            company_id=sub.company_id,
            created_by=request.user,
            report_type=sub.report_type,
            parameters=resolved_params,
            status=GeneratedReport.Status.PENDING,
            subscription_id=sub.id
        )

        from reports.tasks import generate_pdf_report
        task = generate_pdf_report.delay(report.id)
        report.task_id = task.id
        report.save(update_fields=['task_id'])

        return Response({
            "status": "Processing initiated",
            "generated_report_id": report.id
        }, status=status.HTTP_202_ACCEPTED)
