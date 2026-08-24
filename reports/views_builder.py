import logging
from rest_framework import viewsets, permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.decorators import action
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.core.files.base import ContentFile

from erp_core.views import TenantModelViewSet
from erp_core.permissions import RolePermission
from reports.models import SavedReport, GeneratedReport
from reports.serializers import SavedReportSerializer
from reports.services.report_builder import ReportBuilderService
from reports.services.report_builder_registry import REPORT_BUILDER_REGISTRY

logger = logging.getLogger(__name__)

class ReportBuilderMetadataView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        sources = []
        for code, config in REPORT_BUILDER_REGISTRY.items():
            sources.append({
                'code': code,
                'label': config['label'],
                'columns': config.get('columns', {}),
                'filters': config.get('filters', {}),
                'ordering': config.get('ordering', {}),
                'max_preview_rows': config.get('max_preview_rows', 50),
            })
            
        return Response({
            'sources': sources,
            'limits': {
                'preview_rows': 50
            }
        })

class ReportBuilderPreviewView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        service = ReportBuilderService(request.user)
        try:
            results, has_more, metadata_columns = service.execute_preview(request.data)
            return Response({
                'columns': metadata_columns,
                'rows': results,
                'has_more': has_more
            })
        except Exception as e:
            logger.exception("Preview failed")
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

class SavedReportViewSet(TenantModelViewSet):
    queryset = SavedReport.objects.all()
    serializer_class = SavedReportSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        # Ensure they can only see their own reports or shared ones
        return qs.filter(created_by=self.request.user) | qs.filter(is_shared=True)

    def perform_create(self, serializer):
        from erp_core.middleware import get_current_company
        from rest_framework.exceptions import ValidationError
        company_id = get_current_company() or self.request.META.get('HTTP_X_COMPANY_ID') or getattr(self.request.user, 'company_id', None)
        if not company_id:
            raise ValidationError({"detail": "Company context is required for this operation."})
        serializer.save(company_id=company_id, created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def preview(self, request, pk=None):
        saved_report = self.get_object()
        
        definition = {
            'source_code': saved_report.source_code,
            'columns': saved_report.columns_json,
            'filters': saved_report.filters_json,
            'ordering': saved_report.ordering_json,
            'limit': request.data.get('limit', 50)
        }
        
        service = ReportBuilderService(request.user)
        try:
            results, has_more, metadata_columns = service.execute_preview(definition)
            return Response({
                'columns': metadata_columns,
                'rows': results,
                'has_more': has_more
            })
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
            
    @action(detail=True, methods=['post'])
    def export(self, request, pk=None):
        saved_report = self.get_object()
        
        definition = {
            'source_code': saved_report.source_code,
            'columns': saved_report.columns_json,
            'filters': saved_report.filters_json,
            'ordering': saved_report.ordering_json,
            'limit': 1000000 # Unbounded for export
        }
        
        # We reuse GeneratedReport
        report = GeneratedReport.objects.create(
            company_id=saved_report.company_id,
            created_by=request.user,
            report_type='builder_export',
            parameters=definition,
            status=GeneratedReport.Status.PENDING,
        )
        
        from reports.tasks import generate_builder_report
        generate_builder_report.delay(report.id, request.user.id)
        
        return Response({
            "message": "Export started",
            "generated_report_id": report.id
        })
