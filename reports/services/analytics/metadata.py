# reports/services/analytics/metadata.py

from reports.services.analytics.registry import KPI_REGISTRY
from reports.services.analytics.trends import ALLOWED_INTERVALS, ALLOWED_METRICS

def get_analytics_metadata():
    kpis_meta = []
    for code, info in KPI_REGISTRY.items():
        kpis_meta.append({
            "code": code,
            "name": info["name"],
            "description": info["description"],
            "category": info["category"],
            "unit": info["unit"],
            "supported_periods": info["supported_periods"],
            "supported_chart_types": info["supported_chart_types"]
        })
        
    return {
        "kpis": kpis_meta,
        "trend_metrics": list(ALLOWED_METRICS),
        "intervals": list(ALLOWED_INTERVALS.keys()),
        "chart_types": ["line", "bar", "card", "pie"]
    }
