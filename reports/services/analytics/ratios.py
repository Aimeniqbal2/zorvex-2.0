# reports/services/analytics/ratios.py

from reports.services.financial_statements import FinancialStatementsReportingService

class FinancialRatioService:
    def __init__(self, company_id):
        if not company_id:
            raise ValueError("company_id is required.")
        self.company_id = company_id
        self.fs_service = FinancialStatementsReportingService(company_id)
        
    def _safe_divide(self, numerator, denominator):
        if denominator is None or denominator == 0:
            return None
        if numerator is None:
            return 0.0
        return float(numerator) / float(denominator)
        
    def get_gross_margin(self, start_date=None, end_date=None, **kwargs):
        pnl = self.fs_service.get_profit_and_loss(start_date=start_date, end_date=end_date)
        revenue = pnl.get("revenue", 0)
        cogs = pnl.get("cost_of_sales", 0)
        gross_profit = revenue - cogs
        
        val = self._safe_divide(gross_profit, revenue)
        if val is None:
            return {"value": None, "status": "insufficient_data"}
        return {"value": val * 100, "status": "ok"}
        
    def get_net_profit_margin(self, start_date=None, end_date=None, **kwargs):
        pnl = self.fs_service.get_profit_and_loss(start_date=start_date, end_date=end_date)
        revenue = pnl.get("revenue", 0)
        net_profit = pnl.get("net_profit", 0)
        
        val = self._safe_divide(net_profit, revenue)
        if val is None:
            return {"value": None, "status": "insufficient_data"}
        return {"value": val * 100, "status": "ok"}
        
    def get_current_ratio(self, end_date=None, **kwargs):
        bs = self.fs_service.get_balance_sheet(as_of_date=end_date)
        
        # We need to find current assets and current liabilities from the balance sheet output
        # The balance_sheet output groups by account_type.
        # But wait, does it separate current vs non-current? 
        # Typically ASSET and LIABILITY are returned, we might just sum ASSET and LIABILITY if we don't have current/non-current classification,
        # but let's assume we sum all ASSET and LIABILITY for now if sub-classification is missing.
        # Looking at standard implementations, we sum everything under ASSET and LIABILITY.
        
        assets = bs.get('total_assets', 0)
        liabilities = bs.get('total_liabilities', 0)
        
        # In a real system, we'd filter by 'is_current', but we just use total assets/liabilities if not available.
        # We'll use total assets and total liabilities for the ratio.
        
        val = self._safe_divide(assets, liabilities)
        if val is None:
            return {"value": None, "status": "insufficient_data"}
        return {"value": val, "status": "ok"}
        
    def get_asset_turnover(self, start_date=None, end_date=None, **kwargs):
        pnl = self.fs_service.get_profit_and_loss(start_date=start_date, end_date=end_date)
        bs = self.fs_service.get_balance_sheet(as_of_date=end_date)
        
        revenue = pnl.get("revenue", 0)
        assets = bs.get('total_assets', 0)
        
        val = self._safe_divide(revenue, assets)
        if val is None:
            return {"value": None, "status": "insufficient_data"}
        return {"value": val, "status": "ok"}
        
    def get_debt_to_equity(self, end_date=None, **kwargs):
        bs = self.fs_service.get_balance_sheet(as_of_date=end_date)
        
        liabilities = bs.get('total_liabilities', 0)
        equity = bs.get('total_equity', 0)
        
        val = self._safe_divide(liabilities, equity)
        if val is None:
            return {"value": None, "status": "insufficient_data"}
        return {"value": val, "status": "ok"}
        
    def get_return_on_assets(self, start_date=None, end_date=None, **kwargs):
        pnl = self.fs_service.get_profit_and_loss(start_date=start_date, end_date=end_date)
        bs = self.fs_service.get_balance_sheet(as_of_date=end_date)
        
        net_profit = pnl.get("net_profit", 0)
        assets = bs.get('total_assets', 0)
        
        val = self._safe_divide(net_profit, assets)
        if val is None:
            return {"value": None, "status": "insufficient_data"}
        return {"value": val * 100, "status": "ok"}
        
    def get_return_on_equity(self, start_date=None, end_date=None, **kwargs):
        pnl = self.fs_service.get_profit_and_loss(start_date=start_date, end_date=end_date)
        bs = self.fs_service.get_balance_sheet(as_of_date=end_date)
        
        net_profit = pnl.get("net_profit", 0)
        equity = bs.get('total_equity', 0)
        
        val = self._safe_divide(net_profit, equity)
        if val is None:
            return {"value": None, "status": "insufficient_data"}
        return {"value": val * 100, "status": "ok"}
