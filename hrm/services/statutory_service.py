import logging
from decimal import Decimal, ROUND_HALF_UP
from django.utils import timezone
from hrm.models import (
    EmployeeStatutoryEnrollment, StatutoryRule, PayslipStatutoryDeduction
)

logger = logging.getLogger(__name__)

def _quantize_decimal(value: Decimal) -> Decimal:
    return value.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

def calculate_statutory_deductions_for_payslip(company_id, payslip, gross_salary, period_start, period_end):
    """
    Calculates EOBI, SESSI, Income Tax based on statutory enrollment and rules.
    Returns the total employee deduction amount (to be subtracted from net) and 
    total employer contribution.
    """
    enrollments = EmployeeStatutoryEnrollment.objects.filter(
        company_id=company_id,
        employee=payslip.employee,
        is_active=True
    ).select_related('scheme')
    
    total_employee_deduction = Decimal('0.00')
    total_employer_contribution = Decimal('0.00')
    
    records_to_create = []
    
    for enrollment in enrollments:
        scheme = enrollment.scheme
        if not scheme.is_active:
            continue
            
        # Find active rule matching the payroll period
        # We assume the rule that overlaps the end of the period is applicable
        rule = StatutoryRule.objects.filter(
            scheme=scheme,
            company_id=company_id,
            effective_from__lte=period_end
        ).exclude(
            effective_to__lt=period_start
        ).order_by('-effective_from').first()
        
        if not rule:
            logger.warning(f"No active statutory rule found for scheme {scheme.name} for employee {payslip.employee.id}")
            continue
            
        # Determine basis
        basis = gross_salary
        if rule.wage_floor and basis < rule.wage_floor:
            basis = rule.wage_floor
        if rule.wage_ceiling and basis > rule.wage_ceiling:
            basis = rule.wage_ceiling
            
        employee_amt = Decimal('0.00')
        employer_amt = Decimal('0.00')
        
        if rule.is_flat_amount:
            employee_amt = rule.employee_rate
            employer_amt = rule.employer_rate
        else:
            employee_amt = (basis * rule.employee_rate) / Decimal('100.00')
            employer_amt = (basis * rule.employer_rate) / Decimal('100.00')
            
        employee_amt = _quantize_decimal(employee_amt)
        employer_amt = _quantize_decimal(employer_amt)
        
        records_to_create.append(
            PayslipStatutoryDeduction(
                company_id=company_id,
                payslip=payslip,
                scheme=scheme,
                employee_deduction=employee_amt,
                employer_contribution=employer_amt,
                basis_amount=basis
            )
        )
        
        total_employee_deduction += employee_amt
        total_employer_contribution += employer_amt
        
    if records_to_create:
        PayslipStatutoryDeduction.objects.bulk_create(records_to_create)
        
    return total_employee_deduction, total_employer_contribution
