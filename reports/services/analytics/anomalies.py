# reports/services/analytics/anomalies.py

from reports.services.analytics.trends import TrendAnalyticsService
import math

class AnomalyDetectionService:
    def __init__(self, company_id):
        if not company_id:
            raise ValueError("company_id is required.")
        self.company_id = company_id
        self.trend_service = TrendAnalyticsService(company_id)
        
    def detect_anomalies(self, metric):
        """
        Retrieves monthly trend data and detects statistical anomalies using Z-score.
        """
        trend_data = self.trend_service.get_trend(metric=metric, interval="monthly")
        data_points = trend_data.get("data", [])
        
        if not data_points or len(data_points) < 3:
            return {
                "metric": metric,
                "status": "insufficient_data",
                "anomalies": []
            }
            
        values = [d["value"] for d in data_points]
        mean = sum(values) / len(values)
        
        variance = sum((x - mean) ** 2 for x in values) / len(values)
        std_dev = math.sqrt(variance)
        
        anomalies = []
        if std_dev == 0:
            return {
                "metric": metric,
                "status": "ok",
                "anomalies": anomalies
            }
            
        for d in data_points:
            z_score = (d["value"] - mean) / std_dev
            if abs(z_score) > 3:
                reason = "spike" if z_score > 0 else "drop"
                anomalies.append({
                    "period": d["period"],
                    "value": d["value"],
                    "z_score": round(z_score, 2),
                    "reason": f"unusual_{reason}"
                })
                
        return {
            "metric": metric,
            "status": "ok",
            "anomalies": anomalies
        }
