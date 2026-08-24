# reports/views_analytics.py

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied, ValidationError

from platform_core.permissions import ModulePermission
from reports.services.cache import ReportingCacheService

from reports.services.analytics.kpis import AnalyticsKPIService
from reports.services.analytics.trends import TrendAnalyticsService
from reports.services.analytics.metadata import get_analytics_metadata
from reports.services.analytics.registry import KPI_REGISTRY

# Re-use existing finance permission check
from reports.views import _check_finance_permission

class AnalyticsMetadataView(APIView):
    permission_classes = [IsAuthenticated, ModulePermission]
    module_code = 'reports'

    def get(self, request):
        return Response(get_analytics_metadata())

class AnalyticsKPIView(APIView):
    permission_classes = [IsAuthenticated, ModulePermission]
    module_code = 'reports'

    def get(self, request, kpi_code):
        if kpi_code not in KPI_REGISTRY:
            raise ValidationError(f"Invalid KPI code: {kpi_code}")
            
        kpi_meta = KPI_REGISTRY[kpi_code]
        if kpi_meta.get("required_permission") == "finance":
            try:
                _check_finance_permission(request)
            except PermissionDenied:
                return Response({"error": "Unauthorized to view financial KPIs."}, status=403)
                
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        
        company_id = request.user.company_id
        cache_service = ReportingCacheService(company_id)
        
        # Include user_id in cache key if finance perms apply to ensure isolation
        user_modifier = request.user.id if kpi_meta.get("required_permission") == "finance" else "all"
        cache_key = cache_service.generate_key(
            f"analytics_kpi_{kpi_code}_{user_modifier}",
            category="analytics",
            date_from=date_from,
            date_to=date_to
        )
        
        cached_result = cache_service.get(cache_key)
        if cached_result:
            return Response(cached_result)
            
        service = AnalyticsKPIService(company_id)
        result = service.get_kpi(kpi_code, date_from=date_from, date_to=date_to)
        
        cache_service.set(cache_key, result, timeout=900) # 15 minutes
        return Response(result)

class AnalyticsTrendsView(APIView):
    permission_classes = [IsAuthenticated, ModulePermission]
    module_code = 'reports'

    def get(self, request):
        metric = request.query_params.get('metric')
        interval = request.query_params.get('interval', 'monthly')
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        
        if not metric:
            raise ValidationError("metric parameter is required.")
            
        # Finance metrics check
        if metric in ["revenue", "expenses", "net_profit"]:
            try:
                _check_finance_permission(request)
            except PermissionDenied:
                return Response({"error": "Unauthorized to view financial trends."}, status=403)

        company_id = request.user.company_id
        cache_service = ReportingCacheService(company_id)
        
        user_modifier = request.user.id if metric in ["revenue", "expenses", "net_profit"] else "all"
        cache_key = cache_service.generate_key(
            f"analytics_trend_{metric}_{interval}_{user_modifier}",
            category="analytics",
            date_from=date_from,
            date_to=date_to
        )
        
        cached_result = cache_service.get(cache_key)
        if cached_result:
            return Response(cached_result)
            
        service = TrendAnalyticsService(company_id)
        result = service.get_trend(metric, interval, start_date=date_from, end_date=date_to)
        
        cache_service.set(cache_key, result, timeout=900)
        return Response(result)

class AnalyticsDashboardView(APIView):
    permission_classes = [IsAuthenticated, ModulePermission]
    module_code = 'reports'

    def get(self, request):
        company_id = request.user.company_id
        
        has_finance = True
        try:
            _check_finance_permission(request)
        except PermissionDenied:
            has_finance = False
            
        cache_service = ReportingCacheService(company_id)
        user_modifier = request.user.id if has_finance else "no_finance"
        cache_key = cache_service.generate_key(
            f"analytics_dashboard_{user_modifier}",
            category="analytics"
        )
        
        cached_result = cache_service.get(cache_key)
        if cached_result:
            return Response(cached_result)
            
        kpi_service = AnalyticsKPIService(company_id)
        
        # Build dashboard from registry
        kpis = {}
        for code, meta in KPI_REGISTRY.items():
            if meta.get("required_permission") == "finance" and not has_finance:
                continue
            try:
                # Get all-time or sensible default for dashboard KPI
                kpi_data = kpi_service.get_kpi(code)
                kpis[code] = kpi_data
            except Exception:
                pass
                
        # Basic trends for dashboard
        trends = {}
        if has_finance:
            trend_service = TrendAnalyticsService(company_id)
            try:
                trends["revenue"] = trend_service.get_trend("revenue", "monthly")
            except Exception:
                pass

        result = {
            "kpis": kpis,
            "trends": trends,
            "anomalies": [] # Can be populated via async anomaly service cache in future
        }
        
        cache_service.set(cache_key, result, timeout=900)
        return Response(result)
