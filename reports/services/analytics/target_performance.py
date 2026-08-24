from decimal import Decimal
from reports.models import Target
from reports.services.base import BaseReportingService
from reports.services.financial_statements import FinancialStatementsReportingService

class TargetPerformanceService(BaseReportingService):
    """
    Service for calculating Target vs Actual performance.
    """
    
    def get_target_performance(self, target_id=None, target_type=None, period_start=None, period_end=None):
        qs = Target.objects.filter(company_id=self.company_id)
        if target_id:
            qs = qs.filter(id=target_id)
        if target_type:
            qs = qs.filter(target_type=target_type)
        if period_start:
            qs = qs.filter(period_start__gte=period_start)
        if period_end:
            qs = qs.filter(period_end__lte=period_end)
            
        qs = qs.select_related('employee', 'department', 'cost_center', 'crm_entity')

        results = []
        for target in qs:
            actual = self._calculate_actual(target)
            
            variance = actual - target.target_value
            if target.target_value == Decimal('0.00'):
                if actual > Decimal('0.00'):
                    achievement_percent = Decimal('100.00')
                elif actual < Decimal('0.00'):
                    achievement_percent = Decimal('-100.00')
                else:
                    achievement_percent = Decimal('0.00')
            else:
                achievement_percent = (actual / abs(target.target_value)) * Decimal('100.00')
                
            results.append({
                'target_id': str(target.id),
                'target_type': target.target_type,
                'period_start': str(target.period_start),
                'period_end': str(target.period_end),
                'employee_id': str(target.employee_id) if target.employee_id else None,
                'department_id': str(target.department_id) if target.department_id else None,
                'cost_center_id': str(target.cost_center_id) if target.cost_center_id else None,
                'crm_entity_id': str(target.crm_entity_id) if target.crm_entity_id else None,
                'target': float(target.target_value),
                'actual': float(actual),
                'variance': float(variance),
                'achievement_percent': float(achievement_percent)
            })
            
        return results

    def _calculate_actual(self, target):
        if target.target_type == 'REVENUE':
            service = FinancialStatementsReportingService(company_id=self.company_id)
            pnl = service.get_profit_and_loss(start_date=target.period_start, end_date=target.period_end)
            return Decimal(str(pnl['revenue']))
        elif target.target_type == 'GROSS_PROFIT':
            service = FinancialStatementsReportingService(company_id=self.company_id)
            pnl = service.get_profit_and_loss(start_date=target.period_start, end_date=target.period_end)
            return Decimal(str(pnl['gross_profit']))
        return Decimal('0.00')
