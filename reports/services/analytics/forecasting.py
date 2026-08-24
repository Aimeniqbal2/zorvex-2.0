# reports/services/analytics/forecasting.py

from reports.services.analytics.trends import TrendAnalyticsService
from django.core.exceptions import ValidationError

class ForecastingService:
    def __init__(self, company_id):
        if not company_id:
            raise ValueError("company_id is required.")
        self.company_id = company_id
        self.trend_service = TrendAnalyticsService(company_id)
        
    def get_forecast(self, metric, periods=3, method="moving_average"):
        """
        Retrieves monthly trend data and generates a forecast.
        Supported methods: moving_average, linear_trend
        """
        # Always use monthly for basic forecasting
        trend_data = self.trend_service.get_trend(metric=metric, interval="monthly")
        data_points = trend_data.get("data", [])
        
        if not data_points or len(data_points) < 2:
            return {
                "metric": metric,
                "status": "insufficient_data",
                "forecast": []
            }
            
        values = [d["value"] for d in data_points]
        
        forecast = []
        if method == "moving_average":
            # Simple 3-period moving average (or less if not enough data)
            window = min(len(values), 3)
            avg = sum(values[-window:]) / window
            # Project this average forward for `periods`
            for i in range(periods):
                forecast.append({
                    "period_offset": i + 1,
                    "value": round(avg, 2)
                })
        elif method == "linear_trend":
            # Simple linear regression (y = mx + c)
            n = len(values)
            x = list(range(n))
            y = values
            
            sum_x = sum(x)
            sum_y = sum(y)
            sum_xy = sum(x[i]*y[i] for i in range(n))
            sum_xx = sum(x[i]*x[i] for i in range(n))
            
            denominator = (n * sum_xx - sum_x * sum_x)
            if denominator == 0:
                m = 0
                c = sum_y / n
            else:
                m = (n * sum_xy - sum_x * sum_y) / denominator
                c = (sum_y - m * sum_x) / n
                
            for i in range(periods):
                future_x = n + i
                future_y = m * future_x + c
                forecast.append({
                    "period_offset": i + 1,
                    "value": round(future_y, 2)
                })
        else:
            raise ValidationError(f"Unsupported forecasting method: {method}")
            
        return {
            "metric": metric,
            "status": "ok",
            "method": method,
            "forecast": forecast
        }
