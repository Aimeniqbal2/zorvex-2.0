# reports/services/analytics/kpis.py

from reports.services.analytics.registry import KPI_REGISTRY
from reports.services.financial_statements import FinancialStatementsReportingService
from reports.services.accounts_receivable import CustomerBalanceService
from reports.services.cash_movement import CashMovementReportingService
from reports.services.supply_chain import SupplyChainReportingService
from reports.services.operations_metrics import OperationsMetricsReportingService
from reports.services.analytics.ratios import FinancialRatioService
from rest_framework.exceptions import ValidationError

class AnalyticsKPIService:
    def __init__(self, company_id):
        if not company_id:
            raise ValueError("company_id is required.")
        self.company_id = company_id
        
        # Initialize standard reporting services
        self.services = {
            "FinancialStatementsReportingService": FinancialStatementsReportingService(company_id),
            "CustomerBalanceService": CustomerBalanceService(company_id),
            "CashMovementReportingService": CashMovementReportingService(company_id),
            "SupplyChainReportingService": SupplyChainReportingService(company_id),
            "OperationsMetricsReportingService": OperationsMetricsReportingService(company_id),
            "FinancialRatioService": FinancialRatioService(company_id),
        }

    def get_kpi(self, kpi_code, date_from=None, date_to=None):
        if kpi_code not in KPI_REGISTRY:
            raise ValidationError(f"Invalid KPI code: {kpi_code}")
            
        metadata = KPI_REGISTRY[kpi_code]
        service_name = metadata.get("source_service")
        method_name = metadata.get("calculation_method")
        data_key = metadata.get("data_key")
        
        service_instance = self.services.get(service_name)
        if not service_instance:
            raise ValueError(f"Service {service_name} not found.")
            
        method = getattr(service_instance, method_name, None)
        if not method:
            raise ValueError(f"Method {method_name} not found on {service_name}.")
            
        # Determine arguments
        # OperationsMetrics uses start_date/end_date.
        # FinancialStatements uses start_date/end_date for PnL, as_of_date for Trial Balance/Balance Sheet.
        # We pass standard kwargs and let services ignore extras or handle them.
        kwargs = {}
        if date_from and date_to:
            kwargs['start_date'] = date_from
            kwargs['end_date'] = date_to
        elif date_to:
            kwargs['as_of_date'] = date_to
            kwargs['end_date'] = date_to
            
        try:
            result = method(**kwargs)
        except TypeError:
            # Fallback if the method signature doesn't match
            result = method()
            
        # Extract value
        value = None
        if data_key and isinstance(result, dict):
            value = result.get(data_key)
        elif isinstance(result, dict) and "value" in result:
            value = result.get("value")
        elif isinstance(result, (int, float)):
            value = result
        else:
            value = result
            
        # Ratios return dict with value/status
        status = "ok"
        if isinstance(value, dict) and "status" in value:
            status = value.get("status")
            value = value.get("value")
            
        return {
            "code": metadata["code"],
            "name": metadata["name"],
            "value": float(value) if value is not None else None,
            "unit": metadata["unit"],
            "status": status,
            "period": {
                "start": str(date_from) if date_from else None,
                "end": str(date_to) if date_to else None,
            }
        }
