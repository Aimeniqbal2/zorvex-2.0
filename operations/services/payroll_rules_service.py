import logging
from decimal import Decimal, ROUND_HALF_UP
from datetime import date, datetime
from typing import Optional, List, Dict, Any, Tuple
from django.db import transaction
from django.db.models import Q, Sum
from django.core.exceptions import ValidationError
from django.utils import timezone

from hrm.models import (
    Employee, EmployeeSalaryAssignment, CompanyPayrollPolicy,
    StatutoryScheme, StatutorySchemeType, StatutoryRule,
    EmployeeStatutoryEnrollment, OvertimeRecord, OvertimeStatus, OvertimeType
)
from operations.models import (
    DailyDutyPay, DailyPayCalculationStatus,
    PayrollAddition, PayrollAdditionType, PayrollAdditionFrequency,
    PayrollDeduction, PayrollDeductionType, PayrollDeductionFrequency,
    PayrollCalculationStatus, EmployeePayrollCalculation, PayrollCalculationLine
)
from finance.models import EmployeeAdvance, AdvanceStatus, AdvanceRecoveryMethod
from finance.services.advance_service import EmployeeAdvanceService

logger = logging.getLogger(__name__)


def _quantize_decimal(val: Any) -> Decimal:
    """Canonical 2-decimal rounding with ROUND_HALF_UP."""
    if val is None:
        return Decimal('0.00')
    d = Decimal(str(val)) if not isinstance(val, Decimal) else val
    return d.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def _parse_date(val: Any) -> date:
    """Coerces string or date object into date."""
    if isinstance(val, date):
        return val
    if isinstance(val, str):
        return datetime.strptime(val.strip(), '%Y-%m-%d').date()
    raise ValidationError(f"Invalid date format: {val}")


class PayrollRulesService:
    """
    Phase S-5F: Authoritative payroll calculation engine.
    Converts finalized DailyDutyPay + approved Overtime + Additions - Statutory - Other Deductions - Advance Recovery
    into Gross Earnings, Deductions and Net Payable Salary.
    """

    @classmethod
    @transaction.atomic
    def calculate_employee_payroll(
        cls,
        company,
        employee,
        period_start,
        period_end,
        user=None,
        force_recalculate=True
    ) -> EmployeePayrollCalculation:
        """
        Calculates authoritative payroll inputs for a single employee over a date range.
        Creates/updates EmployeePayrollCalculation and granular PayrollCalculationLine audit records.
        """
        company_id = company.id if hasattr(company, 'id') else company
        emp_id = employee.id if hasattr(employee, 'id') else employee
        p_start = _parse_date(period_start)
        p_end = _parse_date(period_end)

        if p_end < p_start:
            raise ValidationError({'period_end': 'Period end date cannot be before period start date.'})

        # Fetch employee
        emp = Employee.objects.select_related('designation', 'company').get(pk=emp_id, company_id=company_id)

        # Existing record check
        calc = EmployeePayrollCalculation.objects.filter(
            company_id=company_id,
            employee=emp,
            period_start=p_start,
            period_end=p_end,
            is_deleted=False
        ).first()

        if calc and calc.is_frozen:
            raise ValidationError("Cannot recalculate a locked/frozen payroll record.")

        if calc and not force_recalculate and calc.status in [PayrollCalculationStatus.CALCULATED, PayrollCalculationStatus.READY]:
            return calc

        if not calc:
            calc = EmployeePayrollCalculation(
                company_id=company_id,
                employee=emp,
                period_start=p_start,
                period_end=p_end,
                status=PayrollCalculationStatus.DRAFT
            )

        # Clear existing line items on recalculate
        if calc.pk:
            calc.lines.all().delete()

        blockers = []
        rate_snapshot = {}
        lines_to_create = []

        # ----------------------------------------------------------------------
        # 1. Base / Daily Duty Earnings (from S-5E DailyDutyPay)
        # ----------------------------------------------------------------------
        daily_duties = DailyDutyPay.objects.filter(
            company_id=company_id,
            employee=emp,
            duty_date__gte=p_start,
            duty_date__lte=p_end,
            is_deleted=False
        ).select_related('site', 'post', 'contract')

        duty_earnings_total = Decimal('0.00')
        duty_days_count = 0
        unresolved_duty_count = 0

        for duty in daily_duties:
            duty_days_count += 1
            duty_amt = _quantize_decimal(duty.payable_amount)
            duty_rate = _quantize_decimal(duty.daily_payable_rate)

            # Check for unresolved duty pay blocker
            if duty.calculation_status == DailyPayCalculationStatus.UNRESOLVED or duty_rate <= Decimal('0.00'):
                unresolved_duty_count += 1
                reason = duty.unresolved_reason or "Missing rate setup"
                blockers.append(f"Unresolved daily duty pay on {duty.duty_date}: {reason}")

            duty_earnings_total += duty_amt

            worked_ctx = duty.post.post_name if duty.post else (duty.site.name if duty.site else "General Duty")
            lines_to_create.append(PayrollCalculationLine(
                company_id=company_id,
                calculation=calc,
                line_type='DUTY_EARNING',
                category='EARNING',
                description=f"Duty: {worked_ctx} ({duty.attendance_status} - {float(duty.payable_percentage):.0f}%)",
                duty_date=duty.duty_date,
                units=Decimal('1.00'),
                rate=duty_rate,
                amount=duty_amt,
                reference_id=str(duty.id),
                notes=f"Rate source: {duty.get_rate_source_display()}"
            ))

        calc.duty_earnings = _quantize_decimal(duty_earnings_total)
        calc.duty_days_count = duty_days_count

        # ----------------------------------------------------------------------
        # 2. Compensation & Salary Assignment Snapshot
        # ----------------------------------------------------------------------
        comp_assignment = EmployeeSalaryAssignment.resolve_compensation(company_id, emp, on_date=p_end)
        if not comp_assignment:
            # Check if there is an active assignment starting in period
            comp_assignment = EmployeeSalaryAssignment.objects.filter(
                company_id=company_id,
                employee=emp,
                status='ACTIVE',
                is_deleted=False
            ).order_by('-effective_from').first()

        policy = CompanyPayrollPolicy.objects.filter(company_id=company_id, is_active=True).first()

        if comp_assignment:
            rate_snapshot['base_salary'] = float(comp_assignment.base_salary)
            rate_snapshot['daily_rate'] = float(comp_assignment.daily_rate) if comp_assignment.daily_rate else None
            rate_snapshot['single_ot_rate'] = float(comp_assignment.single_ot_rate)
            rate_snapshot['double_ot_rate'] = float(comp_assignment.double_ot_rate)
        else:
            rate_snapshot['base_salary'] = 0.0
            if duty_days_count == 0:
                blockers.append("No active salary assignment or duty attendance found for employee.")

        # ----------------------------------------------------------------------
        # 3. Approved Overtime (SINGLE_OT & DOUBLE_OT)
        # ----------------------------------------------------------------------
        overtimes = OvertimeRecord.objects.filter(
            company_id=company_id,
            employee=emp,
            date__gte=p_start,
            date__lte=p_end,
            status=OvertimeStatus.APPROVED,
            is_deleted=False
        ).order_by('date')

        single_ot_hrs = Decimal('0.00')
        single_ot_amt = Decimal('0.00')
        double_ot_hrs = Decimal('0.00')
        double_ot_amt = Decimal('0.00')

        for ot in overtimes:
            hrs = _quantize_decimal(ot.hours)
            is_double = (ot.ot_type == OvertimeType.DOUBLE_OT)

            # Resolve effective OT rate
            # Invariant 1: approved duty-specific override, if present
            if ot.rate_override and ot.rate_override > Decimal('0.00'):
                ot_rate = _quantize_decimal(ot.rate_override)
                rate_ref = "Duty-Specific Override"
            # Invariant 2: effective EmployeeSalaryAssignment single_ot_rate / double_ot_rate
            elif comp_assignment and is_double and comp_assignment.double_ot_rate and comp_assignment.double_ot_rate > Decimal('0.00'):
                ot_rate = _quantize_decimal(comp_assignment.double_ot_rate)
                rate_ref = "Compensation Double OT Rate"
            elif comp_assignment and (not is_double) and comp_assignment.single_ot_rate and comp_assignment.single_ot_rate > Decimal('0.00'):
                ot_rate = _quantize_decimal(comp_assignment.single_ot_rate)
                rate_ref = "Compensation Single OT Rate"
            elif comp_assignment and is_double and comp_assignment.single_ot_rate and comp_assignment.single_ot_rate > Decimal('0.00') and (not (policy and getattr(policy, 'default_double_ot_rate', None))):
                ot_rate = _quantize_decimal(comp_assignment.single_ot_rate * Decimal('2.00'))
                rate_ref = "Compensation Single OT Rate (2x)"
            # Invariant 3: configurable company OT policy fallback only if such policy is explicitly configured
            elif policy and is_double and getattr(policy, 'default_double_ot_rate', None) and policy.default_double_ot_rate > Decimal('0.00'):
                ot_rate = _quantize_decimal(policy.default_double_ot_rate)
                rate_ref = "Company Policy Default Double OT Rate"
            elif policy and (not is_double) and getattr(policy, 'default_single_ot_rate', None) and policy.default_single_ot_rate > Decimal('0.00'):
                ot_rate = _quantize_decimal(policy.default_single_ot_rate)
                rate_ref = "Company Policy Default Single OT Rate"
            elif policy and getattr(policy, 'enable_policy_ot_fallback', False) and comp_assignment and comp_assignment.base_salary > Decimal('0.00'):
                std_hours = policy.standard_monthly_hours if policy.standard_monthly_hours > Decimal('0.00') else Decimal('160.00')
                mult = policy.overtime_multiplier * (Decimal('2.00') if is_double else Decimal('1.00'))
                ot_rate = _quantize_decimal((comp_assignment.base_salary / std_hours) * mult)
                rate_ref = f"Company Policy Formula ({std_hours} hrs @ {mult}x)"
            else:
                # Invariant 4: Otherwise mark OT calculation unresolved/blocked. Do NOT invent a universal 240-hour divisor.
                ot_rate = Decimal('0.00')
                ot_type_name = "Double OT" if is_double else "Single OT"
                rate_ref = "Unresolved (Missing OT Rate)"
                blockers.append(
                    f"Missing overtime rate for {ot_type_name} on {ot.date} for employee {emp.employee_code}. "
                    f"No approved duty override, assignment rate, or company policy configured."
                )

            amt = _quantize_decimal(hrs * ot_rate)

            # Save snapshot on OvertimeRecord
            ot.hourly_rate = ot_rate
            ot.payable_amount = amt
            ot.save(update_fields=['hourly_rate', 'payable_amount'])

            if is_double:
                double_ot_hrs += hrs
                double_ot_amt += amt
                line_type = 'DOUBLE_OT'
                desc = f"Double OT ({hrs} hrs @ ₨ {ot_rate})"
            else:
                single_ot_hrs += hrs
                single_ot_amt += amt
                line_type = 'SINGLE_OT'
                desc = f"Single OT ({hrs} hrs @ ₨ {ot_rate})"

            lines_to_create.append(PayrollCalculationLine(
                company_id=company_id,
                calculation=calc,
                line_type=line_type,
                category='EARNING',
                description=desc,
                duty_date=ot.date,
                units=hrs,
                rate=ot_rate,
                amount=amt,
                reference_id=str(ot.id),
                rate_snapshot={
                    'ot_type': ot.ot_type,
                    'hours': float(hrs),
                    'hourly_rate': float(ot_rate),
                    'rate_source': rate_ref,
                    'payable_amount': float(amt)
                },
                notes=f"{rate_ref} | {ot.reason}"
            ))

        calc.single_ot_hours = single_ot_hrs
        calc.single_ot_amount = single_ot_amt
        calc.double_ot_hours = double_ot_hrs
        calc.double_ot_amount = double_ot_amt
        calc.total_ot_amount = _quantize_decimal(single_ot_amt + double_ot_amt)

        # ----------------------------------------------------------------------
        # 4. Allowances & Configurable Additions (One-time and Recurring)
        # ----------------------------------------------------------------------
        additions_qs = PayrollAddition.objects.filter(
            company_id=company_id,
            employee=emp,
            is_active=True,
            is_approved=True,
            is_deleted=False
        ).filter(
            (Q(frequency=PayrollAdditionFrequency.ONE_TIME) & Q(effective_date__gte=p_start) & Q(effective_date__lte=p_end)) |
            (Q(frequency=PayrollAdditionFrequency.RECURRING) & Q(effective_from__lte=p_end) & (Q(effective_to__isnull=True) | Q(effective_to__gte=p_start)))
        )

        allowances_sum = Decimal('0.00')
        bonuses_sum = Decimal('0.00')
        other_additions_sum = Decimal('0.00')

        for add in additions_qs:
            amt = _quantize_decimal(add.amount)
            if add.addition_type == PayrollAdditionType.ALLOWANCE:
                allowances_sum += amt
            elif add.addition_type == PayrollAdditionType.BONUS:
                bonuses_sum += amt
            else:
                other_additions_sum += amt

            lines_to_create.append(PayrollCalculationLine(
                company_id=company_id,
                calculation=calc,
                line_type=add.addition_type,
                category='EARNING',
                description=f"{add.name} ({add.get_addition_type_display()})",
                duty_date=add.effective_date or add.effective_from,
                units=Decimal('1.00'),
                rate=amt,
                amount=amt,
                reference_id=str(add.id),
                notes=f"Frequency: {add.frequency} | {add.notes}"
            ))

        calc.allowances_amount = allowances_sum
        calc.bonuses_amount = bonuses_sum
        calc.other_additions_amount = other_additions_sum

        # ----------------------------------------------------------------------
        # 5. Gross Earnings Total
        # ----------------------------------------------------------------------
        calc.gross_earnings = _quantize_decimal(
            calc.duty_earnings + calc.total_ot_amount + calc.allowances_amount + calc.bonuses_amount + calc.other_additions_amount
        )

        # ----------------------------------------------------------------------
        # 6. Statutory Deductions (Independent EOBI, SESSI, PESSI)
        # ----------------------------------------------------------------------
        eobi_emp = Decimal('0.00')
        eobi_empr = Decimal('0.00')
        sessi_emp = Decimal('0.00')
        sessi_empr = Decimal('0.00')
        pessi_emp = Decimal('0.00')
        pessi_empr = Decimal('0.00')
        statutory_snapshots = {}

        # Find schemes
        statutory_schemes = StatutoryScheme.objects.filter(
            company_id=company_id,
            is_active=True,
            is_deleted=False
        )

        # Statutory wage base: use duty earnings if present, otherwise base salary
        stat_base = calc.duty_earnings if calc.duty_earnings > Decimal('0.00') else (comp_assignment.base_salary if comp_assignment else Decimal('0.00'))

        for scheme in statutory_schemes:
            # Rule: Each scheme applies ONLY when that employee's enrollment is enabled
            emp_rate, empr_rate, is_enrolled = EmployeeStatutoryEnrollment.resolve_rate(
                company=company_id,
                employee=emp,
                scheme_code=scheme.code,
                on_date=p_end
            )

            scheme_key = scheme.code.upper()

            if not is_enrolled:
                statutory_snapshots[scheme_key] = {
                    'scheme_code': scheme.code,
                    'scheme_name': scheme.name,
                    'is_enrolled': False,
                    'employee_rate': 0.0,
                    'employer_rate': 0.0,
                    'employee_amount': 0.0,
                    'employer_amount': 0.0
                }
                continue

            # Check for scheme rule (e.g. flat amount or wage cap)
            rule = StatutoryRule.objects.filter(
                company_id=company_id,
                scheme=scheme,
                effective_from__lte=p_end,
                is_deleted=False
            ).filter(
                Q(effective_to__isnull=True) | Q(effective_to__gte=p_start)
            ).order_by('-effective_from').first()

            if rule and rule.is_flat_amount:
                sch_emp_amt = _quantize_decimal(rule.employee_rate if emp_rate == 0 else emp_rate)
                sch_empr_amt = _quantize_decimal(rule.employer_rate if empr_rate == 0 else empr_rate)
                calc_basis = sch_emp_amt
            else:
                basis = stat_base
                if rule and rule.wage_ceiling and basis > rule.wage_ceiling:
                    basis = rule.wage_ceiling
                if rule and rule.wage_floor and basis < rule.wage_floor:
                    basis = rule.wage_floor

                sch_emp_amt = _quantize_decimal(basis * (emp_rate / Decimal('100.00')))
                sch_empr_amt = _quantize_decimal(basis * (empr_rate / Decimal('100.00')))
                calc_basis = basis

            # Independent classification: EOBI vs SESSI vs PESSI
            if 'EOBI' in scheme_key or scheme.scheme_type == StatutorySchemeType.EOBI:
                eobi_emp += sch_emp_amt
                eobi_empr += sch_empr_amt
                line_code = 'STATUTORY_EOBI'
                std_name = 'EOBI'
            elif 'SESSI' in scheme_key or 'SESSI' in scheme.name.upper():
                sessi_emp += sch_emp_amt
                sessi_empr += sch_empr_amt
                line_code = 'STATUTORY_SESSI'
                std_name = 'SESSI'
            elif 'PESSI' in scheme_key or 'PESSI' in scheme.name.upper():
                pessi_emp += sch_emp_amt
                pessi_empr += sch_empr_amt
                line_code = 'STATUTORY_PESSI'
                std_name = 'PESSI'
            else:
                line_code = f"STATUTORY_{scheme_key}"
                std_name = scheme.name

            scheme_snapshot = {
                'scheme_code': scheme.code,
                'scheme_name': scheme.name,
                'is_enrolled': True,
                'employee_rate': float(emp_rate),
                'employer_rate': float(empr_rate),
                'employee_amount': float(sch_emp_amt),
                'employer_amount': float(sch_empr_amt),
                'basis_amount': float(calc_basis)
            }
            statutory_snapshots[scheme_key] = scheme_snapshot
            rate_snapshot[f"{scheme.code}_emp_rate"] = float(emp_rate)
            rate_snapshot[f"{scheme.code}_empr_rate"] = float(empr_rate)

            # Record Employee Deduction line with applied rate snapshot & employer contribution
            lines_to_create.append(PayrollCalculationLine(
                company_id=company_id,
                calculation=calc,
                line_type=line_code,
                category='DEDUCTION',
                description=f"{std_name} ({scheme.name}) - Employee: {emp_rate}%",
                duty_date=p_end,
                units=Decimal('1.00'),
                rate=emp_rate,
                amount=sch_emp_amt,
                employer_amount=sch_empr_amt,
                reference_id=str(scheme.id),
                rate_snapshot=scheme_snapshot,
                notes=f"Employer contribution: ₨ {sch_empr_amt} ({empr_rate}%). Rate snapshot: Employee {emp_rate}%, Employer {empr_rate}%. Excluded from employee net pay."
            ))

        calc.eobi_employee_amount = eobi_emp
        calc.eobi_employer_amount = eobi_empr
        calc.sessi_employee_amount = sessi_emp
        calc.sessi_employer_amount = sessi_empr
        calc.pessi_employee_amount = pessi_emp
        calc.pessi_employer_amount = pessi_empr
        calc.sessi_pessi_employee_amount = _quantize_decimal(sessi_emp + pessi_emp)
        calc.sessi_pessi_employer_amount = _quantize_decimal(sessi_empr + pessi_empr)
        calc.total_statutory_deductions = _quantize_decimal(eobi_emp + sessi_emp + pessi_emp)
        calc.total_employer_statutory = _quantize_decimal(eobi_empr + sessi_empr + pessi_empr)
        rate_snapshot['statutory_schemes'] = statutory_snapshots

        # ----------------------------------------------------------------------
        # 7. Other Deductions (Patrolling, Insurance, Uniform, Fine, Other)
        # ----------------------------------------------------------------------
        deductions_qs = PayrollDeduction.objects.filter(
            company_id=company_id,
            employee=emp,
            is_active=True,
            is_approved=True,
            is_deleted=False
        ).exclude(
            deduction_type=PayrollDeductionType.ADVANCE_RECOVERY
        ).filter(
            (Q(frequency=PayrollDeductionFrequency.ONE_TIME) & Q(effective_date__gte=p_start) & Q(effective_date__lte=p_end)) |
            (Q(frequency=PayrollDeductionFrequency.RECURRING) & Q(effective_from__lte=p_end) & (Q(effective_to__isnull=True) | Q(effective_to__gte=p_start)))
        )

        patrolling_sum = Decimal('0.00')
        insurance_sum = Decimal('0.00')
        other_ded_sum = Decimal('0.00')

        for ded in deductions_qs:
            amt = _quantize_decimal(ded.amount)
            if ded.deduction_type == PayrollDeductionType.PATROLLING:
                patrolling_sum += amt
            elif ded.deduction_type == PayrollDeductionType.INSURANCE:
                insurance_sum += amt
            else:
                other_ded_sum += amt

            lines_to_create.append(PayrollCalculationLine(
                company_id=company_id,
                calculation=calc,
                line_type=ded.deduction_type,
                category='DEDUCTION',
                description=f"{ded.name} ({ded.get_deduction_type_display()})",
                duty_date=ded.effective_date or ded.effective_from,
                units=Decimal('1.00'),
                rate=amt,
                amount=amt,
                reference_id=str(ded.id),
                notes=f"Frequency: {ded.frequency} | {ded.notes}"
            ))

        calc.patrolling_deduction = patrolling_sum
        calc.insurance_deduction = insurance_sum
        calc.other_deductions_amount = other_ded_sum

        # ----------------------------------------------------------------------
        # 8. Employee Advance Recovery (Reuse S-4E EmployeeAdvance)
        # ----------------------------------------------------------------------
        advance_recovery_sum = Decimal('0.00')

        # Check explicit advance deductions configured
        adv_deductions = PayrollDeduction.objects.filter(
            company_id=company_id,
            employee=emp,
            deduction_type=PayrollDeductionType.ADVANCE_RECOVERY,
            is_active=True,
            is_approved=True,
            is_deleted=False
        ).filter(
            (Q(frequency=PayrollDeductionFrequency.ONE_TIME) & Q(effective_date__gte=p_start) & Q(effective_date__lte=p_end)) |
            (Q(frequency=PayrollDeductionFrequency.RECURRING) & Q(effective_from__lte=p_end) & (Q(effective_to__isnull=True) | Q(effective_to__gte=p_start)))
        ).select_related('advance')

        for adv_ded in adv_deductions:
            adv = adv_ded.advance
            req_amt = _quantize_decimal(adv_ded.amount)

            if adv:
                if adv.outstanding_balance <= Decimal('0.00'):
                    blockers.append(f"Advance {adv.advance_number} has zero outstanding balance and cannot be deducted.")
                    continue

                if req_amt > adv.outstanding_balance:
                    # Enforce strict non-over-recovery rule
                    blockers.append(
                        f"Advance recovery (₨ {req_amt}) exceeds outstanding balance (₨ {adv.outstanding_balance}) for advance {adv.advance_number}."
                    )
                    applied_amt = adv.outstanding_balance
                else:
                    applied_amt = req_amt

                advance_recovery_sum += applied_amt
                lines_to_create.append(PayrollCalculationLine(
                    company_id=company_id,
                    calculation=calc,
                    line_type='ADVANCE_RECOVERY',
                    category='DEDUCTION',
                    description=f"Advance Recovery: {adv.advance_number}",
                    duty_date=adv_ded.effective_date or p_end,
                    units=Decimal('1.00'),
                    rate=applied_amt,
                    amount=applied_amt,
                    reference_id=str(adv.id),
                    notes=f"Outstanding balance before deduction: ₨ {adv.outstanding_balance}"
                ))
            else:
                # Deduction without linked advance
                advance_recovery_sum += req_amt
                lines_to_create.append(PayrollCalculationLine(
                    company_id=company_id,
                    calculation=calc,
                    line_type='ADVANCE_RECOVERY',
                    category='DEDUCTION',
                    description=f"Advance Recovery: {adv_ded.name}",
                    duty_date=adv_ded.effective_date or p_end,
                    units=Decimal('1.00'),
                    rate=req_amt,
                    amount=req_amt,
                    reference_id=str(adv_ded.id),
                    notes="Unlinked advance deduction instruction"
                ))

        # Also auto-detect any unpaid/approved advances set with recovery_method=PAYROLL_DEDUCTION
        # that don't already have explicit deductions
        auto_advances = EmployeeAdvance.objects.filter(
            company_id=company_id,
            employee=emp,
            status=AdvanceStatus.PAID,
            recovery_method__in=[AdvanceRecoveryMethod.PAYROLL_DEDUCTION, AdvanceRecoveryMethod.MIXED],
            payroll_deduction_ready=True,
            outstanding_balance__gt=Decimal('0.00'),
            is_deleted=False
        ).exclude(id__in=[d.advance_id for d in adv_deductions if d.advance_id])

        for a_adv in auto_advances:
            # Auto-recover up to outstanding balance
            recoverable = min(a_adv.outstanding_balance, calc.gross_earnings - advance_recovery_sum)
            if recoverable > Decimal('0.00'):
                rec_amt = _quantize_decimal(recoverable)
                advance_recovery_sum += rec_amt
                lines_to_create.append(PayrollCalculationLine(
                    company_id=company_id,
                    calculation=calc,
                    line_type='ADVANCE_RECOVERY',
                    category='DEDUCTION',
                    description=f"Auto Advance Recovery: {a_adv.advance_number}",
                    duty_date=p_end,
                    units=Decimal('1.00'),
                    rate=rec_amt,
                    amount=rec_amt,
                    reference_id=str(a_adv.id),
                    notes=f"Remaining balance: ₨ {a_adv.outstanding_balance}"
                ))

        calc.advance_recovery_amount = advance_recovery_sum

        # ----------------------------------------------------------------------
        # 9. Totals, Deductions & Net Payable
        # ----------------------------------------------------------------------
        calc.total_other_deductions = _quantize_decimal(
            calc.patrolling_deduction + calc.insurance_deduction + calc.advance_recovery_amount + calc.other_deductions_amount
        )
        calc.total_deductions = _quantize_decimal(
            calc.total_statutory_deductions + calc.total_other_deductions
        )
        calc.net_payable = _quantize_decimal(
            calc.gross_earnings - calc.total_deductions
        )

        if calc.net_payable < Decimal('0.00'):
            blockers.append(f"Net payable salary is negative (₨ {calc.net_payable}). Deductions exceed gross earnings.")

        # ----------------------------------------------------------------------
        # 10. Status, Blockers & Finalization
        # ----------------------------------------------------------------------
        calc.blocking_reasons = blockers
        calc.has_blockers = bool(blockers)
        calc.rate_snapshot = rate_snapshot
        calc.calculated_at = timezone.now()
        calc.calculated_by = user if user and user.is_authenticated else None

        if blockers:
            calc.status = PayrollCalculationStatus.BLOCKED
        else:
            calc.status = PayrollCalculationStatus.CALCULATED

        calc.save()

        # Save all line items in bulk
        for line in lines_to_create:
            line.calculation = calc
        PayrollCalculationLine.objects.bulk_create(lines_to_create)

        return calc

    @classmethod
    @transaction.atomic
    def calculate_period_payroll(
        cls,
        company,
        period_start,
        period_end,
        employee_ids: Optional[List[Any]] = None,
        user=None
    ) -> Dict[str, Any]:
        """
        Calculates payroll for all eligible employees across a payroll period.
        """
        company_id = company.id if hasattr(company, 'id') else company
        p_start = _parse_date(period_start)
        p_end = _parse_date(period_end)

        emp_qs = Employee.objects.filter(
            company_id=company_id,
            is_deleted=False
        ).exclude(employment_status='TERMINATED')

        if employee_ids:
            emp_qs = emp_qs.filter(id__in=employee_ids)

        employees = list(emp_qs)

        total_processed = 0
        calculated_count = 0
        blocked_count = 0
        total_gross = Decimal('0.00')
        total_net = Decimal('0.00')
        total_deductions = Decimal('0.00')
        blocker_summary = []

        for emp in employees:
            total_processed += 1
            calc = cls.calculate_employee_payroll(
                company=company_id,
                employee=emp,
                period_start=p_start,
                period_end=p_end,
                user=user,
                force_recalculate=True
            )

            total_gross += calc.gross_earnings
            total_net += calc.net_payable
            total_deductions += calc.total_deductions

            if calc.status == PayrollCalculationStatus.BLOCKED:
                blocked_count += 1
                blocker_summary.append({
                    'employee_id': str(emp.id),
                    'employee_name': f"{emp.first_name} {emp.last_name}".strip(),
                    'reasons': calc.blocking_reasons
                })
            else:
                calculated_count += 1

        return {
            'period_start': str(p_start),
            'period_end': str(p_end),
            'total_processed': total_processed,
            'calculated_count': calculated_count,
            'blocked_count': blocked_count,
            'ready_count': 0,
            'total_gross_earnings': float(total_gross),
            'total_net_payable': float(total_net),
            'total_deductions': float(total_deductions),
            'blocker_summary': blocker_summary
        }

    @classmethod
    @transaction.atomic
    def mark_calculation_ready(cls, company, calculation_id, user=None) -> EmployeePayrollCalculation:
        """
        Marks a calculated record as READY for final payroll run.
        Strictly blocks if calculation has blockers or negative salary.
        """
        company_id = company.id if hasattr(company, 'id') else company
        calc = EmployeePayrollCalculation.objects.select_for_update().get(
            pk=calculation_id,
            company_id=company_id,
            is_deleted=False
        )

        if calc.is_frozen:
            raise ValidationError("Locked/frozen calculation cannot be modified.")

        if calc.has_blockers or calc.status == PayrollCalculationStatus.BLOCKED:
            raise ValidationError(f"Cannot mark READY: {'; '.join(calc.blocking_reasons)}")

        if calc.net_payable < Decimal('0.00'):
            raise ValidationError(f"Cannot mark READY: Net payable is negative (₨ {calc.net_payable}).")

        calc.status = PayrollCalculationStatus.READY
        calc.save(update_fields=['status'])
        return calc

    @classmethod
    def get_payroll_preparation_workspace(
        cls,
        company,
        period_start,
        period_end,
        classification: Optional[str] = None,
        site_id: Optional[str] = None,
        status: Optional[str] = None,
        search: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Aggregates executive payroll preparation workspace showing:
        Employee | Duty Earnings | OT | Additions | Statutory | Other Deductions | Advance | Net Pay | Status
        """
        company_id = company.id if hasattr(company, 'id') else company
        p_start = _parse_date(period_start)
        p_end = _parse_date(period_end)

        qs = EmployeePayrollCalculation.objects.filter(
            company_id=company_id,
            period_start=p_start,
            period_end=p_end,
            is_deleted=False
        ).select_related('employee', 'employee__designation')

        if classification:
            qs = qs.filter(employee__classification=classification)

        if status:
            qs = qs.filter(status=status)

        if search:
            s = search.strip()
            qs = qs.filter(
                Q(employee__first_name__icontains=s) |
                Q(employee__last_name__icontains=s) |
                Q(employee__employee_code__icontains=s)
            )

        calculations = list(qs.order_by('employee__first_name'))

        # Aggregate workspace KPIs
        total_records = len(calculations)
        gross_sum = sum(c.gross_earnings for c in calculations)
        net_sum = sum(c.net_payable for c in calculations)
        statutory_sum = sum(c.total_statutory_deductions for c in calculations)
        ot_sum = sum(c.total_ot_amount for c in calculations)
        advance_sum = sum(c.advance_recovery_amount for c in calculations)
        blocked_count = sum(1 for c in calculations if c.status == PayrollCalculationStatus.BLOCKED)
        ready_count = sum(1 for c in calculations if c.status == PayrollCalculationStatus.READY)
        calculated_count = sum(1 for c in calculations if c.status == PayrollCalculationStatus.CALCULATED)

        rows = []
        for c in calculations:
            emp = c.employee
            rows.append({
                'id': str(c.id),
                'employee_id': str(emp.id),
                'employee_name': f"{emp.first_name} {emp.last_name}".strip(),
                'employee_code': emp.employee_code,
                'classification': getattr(emp, 'classification', 'DIRECT'),
                'designation_name': emp.designation.name if emp.designation else '',
                'duty_earnings': float(c.duty_earnings),
                'duty_days_count': c.duty_days_count,
                'single_ot_amount': float(c.single_ot_amount),
                'double_ot_amount': float(c.double_ot_amount),
                'total_ot_amount': float(c.total_ot_amount),
                'allowances_amount': float(c.allowances_amount),
                'bonuses_amount': float(c.bonuses_amount),
                'other_additions_amount': float(c.other_additions_amount),
                'gross_earnings': float(c.gross_earnings),
                'eobi_employee_amount': float(c.eobi_employee_amount),
                'eobi_employer_amount': float(c.eobi_employer_amount),
                'sessi_employee_amount': float(c.sessi_employee_amount),
                'sessi_employer_amount': float(c.sessi_employer_amount),
                'pessi_employee_amount': float(c.pessi_employee_amount),
                'pessi_employer_amount': float(c.pessi_employer_amount),
                'sessi_pessi_employee_amount': float(c.sessi_pessi_employee_amount),
                'sessi_pessi_employer_amount': float(c.sessi_pessi_employer_amount),
                'total_statutory_deductions': float(c.total_statutory_deductions),
                'total_employer_statutory': float(c.total_employer_statutory),
                'patrolling_deduction': float(c.patrolling_deduction),
                'insurance_deduction': float(c.insurance_deduction),
                'advance_recovery_amount': float(c.advance_recovery_amount),
                'other_deductions_amount': float(c.other_deductions_amount),
                'total_other_deductions': float(c.total_other_deductions),
                'total_deductions': float(c.total_deductions),
                'net_payable': float(c.net_payable),
                'status': c.status,
                'has_blockers': c.has_blockers,
                'blocking_reasons': c.blocking_reasons,
                'is_frozen': c.is_frozen,
                'calculated_at': c.calculated_at.isoformat() if c.calculated_at else None,
                'rate_snapshot': c.rate_snapshot
            })

        return {
            'period_start': str(p_start),
            'period_end': str(p_end),
            'totals': {
                'total_records': total_records,
                'total_gross_earnings': float(gross_sum),
                'total_net_payable': float(net_sum),
                'total_statutory_deductions': float(statutory_sum),
                'total_ot_amount': float(ot_sum),
                'total_advance_recovery': float(advance_sum),
                'blocked_count': blocked_count,
                'ready_count': ready_count,
                'calculated_count': calculated_count
            },
            'records': rows
        }
