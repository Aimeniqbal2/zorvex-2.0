import logging
from decimal import Decimal, ROUND_HALF_UP
from datetime import date
from django.db import transaction
from django.core.exceptions import ValidationError
from django.utils import timezone
from hrm.models import (
    Employee, Employment, EmployeeSalaryAssignment, SalaryStructure,
    SalaryStructureComponent, SalaryComponent, PayrollPeriod, PayrollRun,
    Payslip, PayslipLine, ComponentType, CalculationType, PayrollRunStatus, PayslipStatus
)
from hrm.services.formula_engine import evaluate, FormulaEngineError

logger = logging.getLogger(__name__)

class PayrollCalculationError(Exception):
    """Custom exception for payroll calculation failures."""
    pass

def _quantize_decimal(value: Decimal) -> Decimal:
    """Canonical monetary rounding strategy: 2 decimal places, ROUND_HALF_UP."""
    return value.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

def calculate_payroll_for_run(company_id, run_id, user_id):
    """
    Calculates payroll for all eligible employees in a given PayrollRun.
    """
    try:
        payroll_run = PayrollRun.objects.select_related('payroll_period').get(
            id=run_id, company_id=company_id, is_deleted=False
        )
    except PayrollRun.DoesNotExist:
        raise PayrollCalculationError("PayrollRun not found.")
        
    if payroll_run.status in [PayrollRunStatus.FINALIZED, PayrollRunStatus.CANCELLED]:
        raise PayrollCalculationError(f"Cannot calculate payroll for run with status {payroll_run.status}.")

    period = payroll_run.payroll_period
    
    # Identify all active assignments during this period
    assignments = EmployeeSalaryAssignment.objects.filter(
        company_id=company_id,
        is_deleted=False,
        status='ACTIVE', # Assuming status choices has ACTIVE
        effective_from__lte=period.end_date
    ).exclude(
        effective_to__lt=period.start_date
    ).select_related('employee', 'employment', 'salary_structure', 'currency')
    
    results = {
        'success': 0,
        'errors': []
    }
    
    with transaction.atomic():
        payroll_run.status = PayrollRunStatus.PROCESSING
        payroll_run.save(update_fields=['status'])
        
        # Lock the run to prevent concurrent calculation
        payroll_run = PayrollRun.objects.select_for_update().get(id=run_id)
        
        # To avoid duplicating payslips, clear existing DRAFT/CALCULATED payslips for this run
        Payslip.objects.filter(
            payroll_run=payroll_run, 
            status__in=[PayslipStatus.DRAFT, PayslipStatus.CALCULATED]
        ).delete()
        
        employees_processed = set()
        
        for assignment in assignments:
            emp = assignment.employee
            if emp.id in employees_processed:
                results['errors'].append(f"Employee {emp.id} has multiple active overlapping assignments. Proration is not supported.")
                continue
                
            try:
                payslip = calculate_payroll_for_employee(
                    company_id=company_id,
                    payroll_run=payroll_run,
                    employee=emp,
                    assignment=assignment
                )
                if payslip:
                    employees_processed.add(emp.id)
                    results['success'] += 1
            except ValidationError as e:
                results['errors'].append(f"Validation error for employee {emp.id}: {str(e)}")
            except PayrollCalculationError as e:
                results['errors'].append(f"Calculation error for employee {emp.id}: {str(e)}")
            except Exception as e:
                results['errors'].append(f"Unexpected error for employee {emp.id}: {str(e)}")
                
        # If there are serious errors and we want to fail the entire run?
        # Standard ERP practice: process valid ones, leave run as CALCULATED, let user review errors.
        payroll_run.status = PayrollRunStatus.CALCULATED
        payroll_run.processed_at = timezone.now()
        payroll_run.save(update_fields=['status', 'processed_at'])
        
    return results

def calculate_payroll_for_employee(company_id, payroll_run, employee, assignment):
    """
    Core deterministic engine for a single employee.
    """
    if assignment.company_id != company_id or employee.company_id != company_id:
        raise PayrollCalculationError("Cross-company reference detected.")
        
    period = payroll_run.payroll_period
    
    employment = assignment.employment
    if not employment:
        raise PayrollCalculationError("Active employment record required.")
        
    if employment.company_id != company_id:
        raise PayrollCalculationError("Cross-company employment reference detected.")
        
    # Is employment overlapping the period?
    emp_start = employment.start_date
    emp_end = employment.end_date
    if emp_start > period.end_date or (emp_end and emp_end < period.start_date):
        # Employee not employed during this period
        return None

    structure = assignment.salary_structure
    if structure.company_id != company_id:
        raise PayrollCalculationError("Cross-company salary structure reference detected.")
        
    # Resolve structure components
    structure_components = SalaryStructureComponent.objects.filter(
        company_id=company_id,
        is_deleted=False,
        is_active=True,
        salary_structure=structure
    ).select_related('salary_component')
    
    if not structure_components.exists():
        raise PayrollCalculationError("No active components found in the assigned salary structure.")

    gross = Decimal('0.00')
    deductions = Decimal('0.00')
    tax = Decimal('0.00')
    
    # Base calculation explicit base
    base_salary = assignment.base_salary
    
    payslip = Payslip(
        company_id=company_id,
        payroll_run=payroll_run,
        employee=employee,
        employment=employment,
        salary_assignment=assignment,
        currency=assignment.currency,
        status=PayslipStatus.CALCULATED
    )
    payslip.save()
    
    lines_to_create = []
    
    for sc in structure_components:
        comp = sc.salary_component
        
        # Verify component company isolated
        if comp.company_id != company_id:
            raise PayrollCalculationError("Cross-company salary component reference detected.")
            
        calculated_amount = Decimal('0.00')
        
        if comp.calculation_type == CalculationType.FIXED:
            calculated_amount = sc.amount if sc.amount else Decimal('0.00')
        elif comp.calculation_type == CalculationType.PERCENTAGE:
            # Explicit and deterministic base: base_salary from EmployeeSalaryAssignment
            if sc.percentage:
                calculated_amount = (base_salary * sc.percentage) / Decimal('100.00')
        elif comp.calculation_type == CalculationType.FORMULA:
            context = {
                'base': base_salary,
                'gross': gross,
                'deductions': deductions,
                'tax': tax,
            }
            try:
                calculated_amount = evaluate(sc.formula, context)
            except FormulaEngineError as e:
                raise PayrollCalculationError(f"Formula error on {comp.code}: {e}")
                
        calculated_amount = _quantize_decimal(calculated_amount)
        
        # NOTE: Attendance integration (Working days vs absent days)
        # As per instructions: "If pro-rata salary calculation is implemented, it must be explicit, deterministic... 
        # Do not automatically deduct absences unless the system has an explicit configuration/model supporting that behavior."
        # Currently, Phase 7C exists but there is no explicit formula mapping attendance to salary deductions in the models (like per-day rate configuration).
        # We will not invent policies. We use the full component amount as defined by the structure.
        
        if comp.component_type == ComponentType.EARNING:
            gross += calculated_amount
        elif comp.component_type == ComponentType.DEDUCTION:
            deductions += calculated_amount
        elif comp.component_type == ComponentType.TAX:
            tax += calculated_amount
            
        line = PayslipLine(
            company_id=company_id,
            payslip=payslip,
            salary_component=comp,
            component_type=comp.component_type,
            amount=calculated_amount,
            sequence=sc.sequence,
            description=comp.name
        )
        lines_to_create.append(line)
        
    PayslipLine.objects.bulk_create(lines_to_create)
    
    # ----------------------------------------------------
    # Overtime Injection
    # ----------------------------------------------------
    from hrm.models import OvertimeRecord, OvertimeStatus, CompanyPayrollPolicy
    from django.db import models
    
    # Fetch overtimes that are either explicitly APPROVED (unprocessed)
    # OR PROCESSED but their payslip was deleted (e.g. draft recalculation)
    overtimes = OvertimeRecord.objects.filter(
        models.Q(status=OvertimeStatus.APPROVED) | 
        models.Q(status=OvertimeStatus.PROCESSED, processed_payslip__isnull=True),
        company_id=company_id,
        employee=employee,
        date__range=(period.start_date, period.end_date),
        is_deleted=False
    )
    
    if overtimes.exists():
        ot_comp, _ = SalaryComponent.objects.get_or_create(
            company_id=company_id,
            code='OVERTIME_PAY',
            defaults={
                'name': 'Overtime Pay',
                'component_type': ComponentType.EARNING,
                'calculation_type': CalculationType.FIXED,
                'is_active': True,
                'is_recurring': False
            }
        )
        
        try:
            policy = CompanyPayrollPolicy.objects.get(company_id=company_id, is_active=True, is_deleted=False)
            standard_hours = policy.standard_monthly_hours
            multiplier = policy.overtime_multiplier
        except CompanyPayrollPolicy.DoesNotExist:
            standard_hours = Decimal('160.00')
            multiplier = Decimal('1.50')
        except CompanyPayrollPolicy.MultipleObjectsReturned:
            raise PayrollCalculationError("Multiple active payroll policies found for the company. Please resolve configuration.")
            
        ot_rate = (base_salary / standard_hours) * multiplier
        
        ot_lines = []
        for ot in overtimes:
            amount = _quantize_decimal(ot.hours * ot_rate)
            gross += amount
            ot_lines.append(PayslipLine(
                company_id=company_id,
                payslip=payslip,
                salary_component=ot_comp,
                component_type=ComponentType.EARNING,
                amount=amount,
                sequence=800,
                description=f"Overtime - {ot.date} ({ot.hours}h)"
            ))
            
            # Link exactly once
            ot.status = OvertimeStatus.PROCESSED
            ot.processed_payslip = payslip
            ot.save(update_fields=['status', 'processed_payslip', 'updated_at'])
                
        if ot_lines:
            PayslipLine.objects.bulk_create(ot_lines)
    # ----------------------------------------------------
    
    # Statutory Deductions
    from .statutory_service import calculate_statutory_deductions_for_payslip
    statutory_emp_deduction, statutory_employer_contrib = calculate_statutory_deductions_for_payslip(
        company_id=company_id,
        payslip=payslip,
        gross_salary=gross,
        period_start=period.start_date,
        period_end=period.end_date
    )
    
    # We update total deductions with the statutory portions
    deductions += statutory_emp_deduction
    
    net = gross - deductions - tax
    
    if net < 0:
        # Policy: net salary can't be negative unless explicitly configured, which it isn't.
        raise PayrollCalculationError("Calculated net salary is negative.")
        
    payslip.gross_amount = _quantize_decimal(gross)
    payslip.deduction_amount = _quantize_decimal(deductions)
    payslip.tax_amount = _quantize_decimal(tax)
    payslip.net_amount = _quantize_decimal(net)
    payslip.save()
    
    return payslip

def finalize_payroll_run(company_id, run_id, user_id):
    """
    Locks the PayrollRun and all associated Payslips.
    """
    with transaction.atomic():
        try:
            payroll_run = PayrollRun.objects.select_for_update().get(
                id=run_id, company_id=company_id, is_deleted=False
            )
        except PayrollRun.DoesNotExist:
            raise PayrollCalculationError("PayrollRun not found.")
            
        if payroll_run.status == PayrollRunStatus.FINALIZED:
            return True # Idempotent
            
        if payroll_run.status != PayrollRunStatus.CALCULATED:
            raise PayrollCalculationError("Can only finalize CALCULATED payroll runs.")
            
        payroll_run.status = PayrollRunStatus.FINALIZED
        payroll_run.finalized_at = timezone.now()
        payroll_run.finalized_by_id = user_id
        payroll_run.save(update_fields=['status', 'finalized_at', 'finalized_by'])
        
        Payslip.objects.filter(payroll_run=payroll_run).update(status=PayslipStatus.FINALIZED)
        
    return True
