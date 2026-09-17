"""
operations/services/payroll_run_service.py

Phase S-5G: Security Workforce Payroll Run, Payslips, Approval & S-4G Finance Handoff.

Converts READY EmployeePayrollCalculation records into controlled payroll runs,
generates immutable payslips, enforces approval lifecycle, freezes consumed source inputs,
commits employee advance recovery exactly once, and executes idempotent S-4G Finance handoff.
"""
from decimal import Decimal
import logging
from typing import Optional, Dict, Any, List

from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError

from companies.models import Company
from hrm.models import (
    Employee, EmployeeSalaryAssignment, PayrollPeriod, PayrollRun, PayrollRunStatus,
    Payslip, PayslipStatus, PayslipLine, SalaryComponent, ComponentType,
    OvertimeRecord
)
from operations.models import (
    EmployeePayrollCalculation, PayrollCalculationStatus, PayrollCalculationLine,
    DailyDutyPay, PayrollAddition, PayrollDeduction
)
from finance.models import (
    EmployeeAdvance, AdvanceStatus, AdvanceRecoveryMethod,
    PayrollAccountingIntegration, Currency
)
from finance.services.payroll_finance_service import PayrollFinanceService
from erp_core.models import DocumentSequence

logger = logging.getLogger(__name__)


def _quantize_decimal(val: Any) -> Decimal:
    if val is None:
        return Decimal('0.00')
    return Decimal(str(val)).quantize(Decimal('0.01'))


class PayrollRunService:

    @classmethod
    def _get_or_create_standard_component(cls, company: Company, code: str, name: str, comp_type: str) -> SalaryComponent:
        code_clean = code.upper().strip()
        comp = SalaryComponent.objects.filter(company=company, code=code_clean, is_deleted=False).first()
        if not comp:
            comp = SalaryComponent.objects.create(
                company=company,
                code=code_clean,
                name=name,
                component_type=comp_type,
                is_taxable=False,
                description=f"Auto-provisioned standard salary component for {name}"
            )
        return comp

    @classmethod
    def _get_or_create_period(cls, company: Company, period_start, period_end) -> PayrollPeriod:
        period = PayrollPeriod.objects.filter(
            company=company,
            start_date=period_start,
            end_date=period_end,
            is_deleted=False
        ).first()
        if not period:
            p_name = f"{period_start.strftime('%B %Y')} ({period_start} to {period_end})"
            period = PayrollPeriod.objects.create(
                company=company,
                name=p_name,
                start_date=period_start,
                end_date=period_end,
                payment_date=period_end,
            )
        return period

    @classmethod
    @transaction.atomic
    def create_payroll_run_from_calculations(
        cls,
        company: Company,
        period_start,
        period_end,
        calculation_ids: Optional[List[str]] = None,
        user=None,
        notes: str = ''
    ) -> PayrollRun:
        """
        Creates a new PayrollRun from READY EmployeePayrollCalculation records inside period_start..period_end.
        Generates immutable payslip snapshots and reconciles run totals.
        """
        if period_end < period_start:
            raise ValidationError({'period_end': 'Period end date cannot be earlier than period start date.'})

        # 1. Resolve or create PayrollPeriod for legacy compatibility
        period = cls._get_or_create_period(company, period_start, period_end)

        # 2. Select eligible calculations
        calc_qs = EmployeePayrollCalculation.objects.filter(
            company=company,
            period_start__gte=period_start,
            period_end__lte=period_end,
            is_deleted=False
        ).select_related('employee', 'employee__designation')

        if calculation_ids:
            calc_qs = calc_qs.filter(id__in=calculation_ids)

        calcs = list(calc_qs)
        if not calcs:
            raise ValidationError("No payroll calculations found for the specified period.")

        # 3. Eligibility & Blocker Validations
        blocked_or_unready = []
        already_finalized_consumed = []
        employee_seen = set()
        duplicate_employees = []

        for c in calcs:
            if c.status != PayrollCalculationStatus.READY or c.has_blockers:
                emp_name = f"{c.employee.first_name} {c.employee.last_name}".strip()
                reasons = " | ".join(c.blocking_reasons) if c.blocking_reasons else f"Status is {c.status}"
                blocked_or_unready.append(f"{emp_name} ({reasons})")

            # Check duplicate in this batch
            if c.employee_id in employee_seen:
                duplicate_employees.append(str(c.employee))
            employee_seen.add(c.employee_id)

            # Check if consumed by an already finalized payroll run
            if c.is_frozen or (c.payroll_run_id and c.payroll_run.status == PayrollRunStatus.FINALIZED):
                already_finalized_consumed.append(str(c.employee))

        if blocked_or_unready:
            raise ValidationError(
                f"Cannot create payroll run with BLOCKED or unready calculations: {'; '.join(blocked_or_unready[:5])}"
            )
        if duplicate_employees:
            raise ValidationError(
                f"Duplicate calculations detected for employee(s): {', '.join(duplicate_employees[:5])}"
            )
        if already_finalized_consumed:
            raise ValidationError(
                f"Calculations for following employee(s) are already consumed by a finalized payroll run: {', '.join(already_finalized_consumed[:5])}"
            )

        # 4. Create PayrollRun header
        p_month = period_start.strftime('%Y-%m')
        prefix = f"PR-{period_start.strftime('%Y%m')}"
        run_number = DocumentSequence.get_next_number(company, "PAYROLL_RUN", prefix)

        payroll_run = PayrollRun(
            company=company,
            payroll_period=period,
            run_number=run_number,
            period_start=period_start,
            period_end=period_end,
            payroll_month=p_month,
            status=PayrollRunStatus.CALCULATED,
            prepared_by=user,
            prepared_at=timezone.now(),
            notes=notes or f"Security workforce payroll run for {period_start} to {period_end}",
            advances_settled=False
        )
        payroll_run.save()

        # 5. Provision standard salary components for payslip lines
        comp_duty = cls._get_or_create_standard_component(company, 'DUTY_PAY', 'Duty Earnings', ComponentType.EARNING)
        comp_ot = cls._get_or_create_standard_component(company, 'OVERTIME', 'Overtime Allowance', ComponentType.EARNING)
        comp_allow = cls._get_or_create_standard_component(company, 'ALLOWANCE', 'Allowances & Bonuses', ComponentType.EARNING)
        comp_eobi = cls._get_or_create_standard_component(company, 'EOBI', 'EOBI Deduction', ComponentType.DEDUCTION)
        comp_sessi = cls._get_or_create_standard_component(company, 'SESSI', 'SESSI Deduction', ComponentType.DEDUCTION)
        comp_pessi = cls._get_or_create_standard_component(company, 'PESSI', 'PESSI Deduction', ComponentType.DEDUCTION)
        comp_adv = cls._get_or_create_standard_component(company, 'ADVANCE', 'Advance Recovery', ComponentType.DEDUCTION)
        comp_ded = cls._get_or_create_standard_component(company, 'OTHER_DED', 'Other Deductions', ComponentType.DEDUCTION)

        # Resolve company default currency
        default_currency = Currency.objects.filter(company=company, is_deleted=False).first()

        gross_total = Decimal('0.00')
        ded_total = Decimal('0.00')
        stat_employer_total = Decimal('0.00')
        net_total = Decimal('0.00')

        # 6. Generate immutable Payslip snapshots per calculation
        for calc in calcs:
            assignment = EmployeeSalaryAssignment.objects.filter(
                company=company,
                employee=calc.employee,
                is_deleted=False
            ).order_by('-effective_from').first()

            curr = assignment.currency if assignment else default_currency

            ps_prefix = f"PS-{period_start.strftime('%Y%m')}"
            payslip_number = DocumentSequence.get_next_number(company, "PAYSLIP", ps_prefix)

            # Lines snapshot
            lines_data = []
            for l in calc.lines.all():
                lines_data.append({
                    'line_type': l.line_type,
                    'category': l.category,
                    'description': l.description,
                    'duty_date': l.duty_date.isoformat() if l.duty_date else None,
                    'units': str(l.units),
                    'rate': str(l.rate),
                    'amount': str(l.amount),
                    'employer_amount': str(l.employer_amount),
                    'rate_snapshot': l.rate_snapshot
                })

            payslip = Payslip(
                company=company,
                payroll_run=payroll_run,
                employee=calc.employee,
                salary_assignment=assignment,
                payslip_number=payslip_number,
                status=PayslipStatus.CALCULATED,
                currency=curr,
                period_start=period_start,
                period_end=period_end,
                # Earnings snapshot
                duty_earnings=calc.duty_earnings,
                single_ot_amount=calc.single_ot_amount,
                double_ot_amount=calc.double_ot_amount,
                allowances_amount=calc.allowances_amount,
                bonuses_amount=calc.bonuses_amount,
                other_additions_amount=calc.other_additions_amount,
                gross_amount=calc.gross_earnings,
                # Independent Deductions snapshot
                eobi_employee_amount=calc.eobi_employee_amount,
                eobi_employer_amount=calc.eobi_employer_amount,
                sessi_employee_amount=calc.sessi_employee_amount,
                sessi_employer_amount=calc.sessi_employer_amount,
                pessi_employee_amount=calc.pessi_employee_amount,
                pessi_employer_amount=calc.pessi_employer_amount,
                patrolling_deduction=calc.patrolling_deduction,
                insurance_deduction=calc.insurance_deduction,
                advance_recovery_amount=calc.advance_recovery_amount,
                other_deductions_amount=calc.other_deductions_amount,
                deduction_amount=calc.total_deductions,
                total_statutory_deductions=calc.total_statutory_deductions,
                total_employer_statutory=calc.total_employer_statutory,
                tax_amount=Decimal('0.00'),
                # Net Salary
                net_amount=calc.net_payable,
                # Snapshots & Linkage
                rate_snapshot=calc.rate_snapshot,
                lines_snapshot=lines_data,
                operational_calculation=calc,
                is_frozen=False
            )
            payslip.save()

            # Create granular PayslipLines for S-4G Finance accounting consumption
            seq = 1
            if calc.duty_earnings > Decimal('0.00'):
                PayslipLine.objects.create(
                    company=company, payslip=payslip, salary_component=comp_duty,
                    component_type=ComponentType.EARNING, amount=calc.duty_earnings,
                    description=f"Duty Earnings ({calc.duty_days_count} days)", sequence=seq
                )
                seq += 1

            total_ot = calc.single_ot_amount + calc.double_ot_amount
            if total_ot > Decimal('0.00'):
                PayslipLine.objects.create(
                    company=company, payslip=payslip, salary_component=comp_ot,
                    component_type=ComponentType.EARNING, amount=total_ot,
                    description="Overtime Pay (Single & Double)", sequence=seq
                )
                seq += 1

            total_allowances = calc.allowances_amount + calc.bonuses_amount + calc.other_additions_amount
            if total_allowances > Decimal('0.00'):
                PayslipLine.objects.create(
                    company=company, payslip=payslip, salary_component=comp_allow,
                    component_type=ComponentType.EARNING, amount=total_allowances,
                    description="Allowances & Additions", sequence=seq
                )
                seq += 1

            if calc.eobi_employee_amount > Decimal('0.00'):
                PayslipLine.objects.create(
                    company=company, payslip=payslip, salary_component=comp_eobi,
                    component_type=ComponentType.DEDUCTION, amount=calc.eobi_employee_amount,
                    description="Statutory EOBI Deduction", sequence=seq
                )
                seq += 1

            if calc.sessi_employee_amount > Decimal('0.00'):
                PayslipLine.objects.create(
                    company=company, payslip=payslip, salary_component=comp_sessi,
                    component_type=ComponentType.DEDUCTION, amount=calc.sessi_employee_amount,
                    description="Statutory SESSI Deduction", sequence=seq
                )
                seq += 1

            if calc.pessi_employee_amount > Decimal('0.00'):
                PayslipLine.objects.create(
                    company=company, payslip=payslip, salary_component=comp_pessi,
                    component_type=ComponentType.DEDUCTION, amount=calc.pessi_employee_amount,
                    description="Statutory PESSI Deduction", sequence=seq
                )
                seq += 1

            if calc.advance_recovery_amount > Decimal('0.00'):
                PayslipLine.objects.create(
                    company=company, payslip=payslip, salary_component=comp_adv,
                    component_type=ComponentType.DEDUCTION, amount=calc.advance_recovery_amount,
                    description="Employee Advance Recovery", sequence=seq
                )
                seq += 1

            other_ded = calc.patrolling_deduction + calc.insurance_deduction + calc.other_deductions_amount
            if other_ded > Decimal('0.00'):
                PayslipLine.objects.create(
                    company=company, payslip=payslip, salary_component=comp_ded,
                    component_type=ComponentType.DEDUCTION, amount=other_ded,
                    description="Patrolling, Insurance & Other Deductions", sequence=seq
                )
                seq += 1

            # Update EmployeePayrollCalculation with run and payslip reference
            calc.payroll_run = payroll_run
            calc.payslip = payslip
            calc.save(update_fields=['payroll_run', 'payslip'])

            gross_total += calc.gross_earnings
            ded_total += calc.total_deductions
            stat_employer_total += calc.total_employer_statutory
            net_total += calc.net_payable

        # 7. Update reconciled totals on PayrollRun
        payroll_run.employee_count = len(calcs)
        payroll_run.gross_earnings = _quantize_decimal(gross_total)
        payroll_run.employee_deductions = _quantize_decimal(ded_total)
        payroll_run.employer_statutory_contribution = _quantize_decimal(stat_employer_total)
        payroll_run.net_payroll = _quantize_decimal(net_total)
        payroll_run.save(update_fields=[
            'employee_count', 'gross_earnings', 'employee_deductions',
            'employer_statutory_contribution', 'net_payroll'
        ])

        return payroll_run

    @classmethod
    @transaction.atomic
    def submit_for_review(cls, company: Company, payroll_run: PayrollRun, user=None) -> PayrollRun:
        """
        Transitions PayrollRun from CALCULATED to UNDER_REVIEW.
        Verifies no blockers, no duplicate employee-periods, and total reconciliation.
        """
        if payroll_run.status not in [PayrollRunStatus.CALCULATED, PayrollRunStatus.DRAFT]:
            raise ValidationError(f"Cannot submit payroll run in status {payroll_run.status} for review.")

        if payroll_run.employee_count == 0:
            raise ValidationError("Payroll run contains zero employee calculations.")

        # Check for any blockers
        calcs = payroll_run.operational_calculations.filter(is_deleted=False)
        blocked = calcs.filter(has_blockers=True)
        if blocked.exists():
            names = [f"{c.employee}" for c in blocked[:5]]
            raise ValidationError(f"Cannot submit for review: {blocked.count()} calculation(s) have unresolved blockers: {', '.join(names)}")

        # Check duplicate employees in run
        emp_ids = list(calcs.values_list('employee_id', flat=True))
        if len(emp_ids) != len(set(emp_ids)):
            raise ValidationError("Duplicate employee calculations exist in this payroll run.")

        # Reconcile totals
        calc_gross = sum(c.gross_earnings for c in calcs)
        calc_ded = sum(c.total_deductions for c in calcs)
        calc_net = sum(c.net_payable for c in calcs)

        if abs(calc_gross - payroll_run.gross_earnings) > Decimal('0.05'):
            raise ValidationError(f"Gross earnings mismatch: Run shows {payroll_run.gross_earnings}, calculations sum to {calc_gross}.")
        if abs(calc_net - payroll_run.net_payroll) > Decimal('0.05'):
            raise ValidationError(f"Net payroll mismatch: Run shows {payroll_run.net_payroll}, calculations sum to {calc_net}.")

        payroll_run.status = PayrollRunStatus.UNDER_REVIEW
        payroll_run.reviewed_by = user
        payroll_run.reviewed_at = timezone.now()
        payroll_run.save(update_fields=['status', 'reviewed_by', 'reviewed_at'])
        return payroll_run

    @classmethod
    @transaction.atomic
    def approve_payroll_run(cls, company: Company, payroll_run: PayrollRun, user=None) -> PayrollRun:
        """
        Transitions PayrollRun from UNDER_REVIEW to APPROVED.
        """
        if payroll_run.status not in [PayrollRunStatus.UNDER_REVIEW, PayrollRunStatus.CALCULATED]:
            raise ValidationError(f"Payroll run must be UNDER_REVIEW before approval. Current status: {payroll_run.status}")

        # Block approval if any blockers exist
        calcs = payroll_run.operational_calculations.filter(is_deleted=False)
        blocked = calcs.filter(has_blockers=True)
        if blocked.exists():
            names = [f"{c.employee}" for c in blocked[:5]]
            raise ValidationError(f"Cannot approve payroll run: {blocked.count()} calculation(s) have blockers: {', '.join(names)}")

        payroll_run.status = PayrollRunStatus.APPROVED
        payroll_run.approved_by = user
        payroll_run.approved_at = timezone.now()
        payroll_run.save(update_fields=['status', 'approved_by', 'approved_at'])
        return payroll_run

    @classmethod
    @transaction.atomic
    def finalize_payroll_run(cls, company: Company, payroll_run: PayrollRun, user=None) -> Dict[str, Any]:
        """
        Finalizes an APPROVED payroll run.
        1. Freezes EmployeePayrollCalculation, DailyDutyPay, OvertimeRecord, and Additions/Deductions.
        2. Sets Payslip status to FINALIZED and is_frozen = True.
        3. Commits EmployeeAdvance deduction settlements exactly once (prevents double recovery).
        4. Hands off to S-4G PayrollFinanceService.integrate_payroll_run idempotently.
        """
        if payroll_run.status != PayrollRunStatus.APPROVED:
            raise ValidationError(f"Only APPROVED payroll runs can be finalized. Current status: {payroll_run.status}")

        calcs = list(payroll_run.operational_calculations.filter(is_deleted=False).select_related('employee'))
        if not calcs:
            raise ValidationError("Cannot finalize a payroll run with no calculations.")

        # Blocker check
        for c in calcs:
            if c.has_blockers or c.status == PayrollCalculationStatus.BLOCKED:
                raise ValidationError(f"Cannot finalize: Calculation for {c.employee} is BLOCKED.")

        # 1. Update PayrollRun status
        payroll_run.status = PayrollRunStatus.FINALIZED
        payroll_run.finalized_by = user
        payroll_run.finalized_at = timezone.now()
        payroll_run.save(update_fields=['status', 'finalized_by', 'finalized_at'])

        # 2. Freeze all consumed source data
        for calc in calcs:
            calc._allow_frozen_update = True
            calc.is_frozen = True
            calc.save(update_fields=['is_frozen'])

            # Freeze consumed DailyDutyPay
            DailyDutyPay.objects.filter(
                company=company,
                employee=calc.employee,
                duty_date__gte=calc.period_start,
                duty_date__lte=calc.period_end,
                is_deleted=False
            ).update(is_frozen=True)

            # Freeze consumed OvertimeRecord
            OvertimeRecord.objects.filter(
                company=company,
                employee=calc.employee,
                date__gte=calc.period_start,
                date__lte=calc.period_end,
                is_deleted=False
            ).update(is_frozen=True)

            # Freeze consumed one-time adjustments
            PayrollAddition.objects.filter(
                company=company,
                employee=calc.employee,
                effective_date__gte=calc.period_start,
                effective_date__lte=calc.period_end,
                is_deleted=False
            ).update(is_frozen=True)

            PayrollDeduction.objects.filter(
                company=company,
                employee=calc.employee,
                effective_date__gte=calc.period_start,
                effective_date__lte=calc.period_end,
                is_deleted=False
            ).update(is_frozen=True)

        # 3. Freeze all payslips
        payslips = list(payroll_run.payslips.filter(is_deleted=False))
        for ps in payslips:
            ps._allow_frozen_update = True
            ps.status = PayslipStatus.FINALIZED
            ps.is_frozen = True
            ps.save(update_fields=['status', 'is_frozen'])

        # 4. Advance Recovery Settlement (Commit exactly once)
        advances_recovered_total = Decimal('0.00')
        if not payroll_run.advances_settled:
            for calc in calcs:
                if calc.advance_recovery_amount > Decimal('0.00'):
                    active_advances = EmployeeAdvance.objects.filter(
                        company=company,
                        employee=calc.employee,
                        recovery_method__in=[AdvanceRecoveryMethod.PAYROLL_DEDUCTION, AdvanceRecoveryMethod.MIXED],
                        status=AdvanceStatus.PAID
                    ).order_by('advance_date', 'created_at')

                    remaining = calc.advance_recovery_amount
                    for adv in active_advances:
                        if remaining <= Decimal('0.00'):
                            break
                        can_settle = min(adv.outstanding_balance, remaining)
                        if can_settle > Decimal('0.00'):
                            adv.settled_amount += can_settle
                            adv.outstanding_balance = max(Decimal('0.00'), adv.amount - adv.settled_amount - adv.returned_amount)
                            if adv.outstanding_balance <= Decimal('0.0001'):
                                adv.status = AdvanceStatus.SETTLED
                            adv.save(update_fields=['settled_amount', 'outstanding_balance', 'status'])
                            remaining -= can_settle
                            advances_recovered_total += can_settle

            payroll_run.advances_settled = True
            payroll_run.save(update_fields=['advances_settled'])

        # 5. S-4G Finance Handoff (Idempotent integration)
        integration = PayrollFinanceService.integrate_payroll_run(payroll_run, user=user)

        return {
            'payroll_run_id': str(payroll_run.id),
            'run_number': payroll_run.run_number,
            'status': payroll_run.status,
            'payslips_count': len(payslips),
            'net_payroll': payroll_run.net_payroll,
            'advances_recovered': str(advances_recovered_total),
            'finance_integration_id': str(integration.id),
            'finance_integration_status': integration.status,
            'finance_liability': str(integration.remaining_liability)
        }

    @classmethod
    @transaction.atomic
    def cancel_payroll_run(cls, company: Company, payroll_run: PayrollRun, user=None, reason: str = '') -> PayrollRun:
        """
        Cancels a payroll run before finalization.
        Disassociates calculations so they can be processed in a different run.
        """
        if payroll_run.status == PayrollRunStatus.FINALIZED:
            raise ValidationError("Cannot cancel a finalized payroll run. Use controlled adjustment/reversal.")

        # Disassociate calculations
        payroll_run.operational_calculations.update(payroll_run=None, payslip=None)

        # Remove draft payslips
        for ps in payroll_run.payslips.all():
            ps.lines.all().delete()
            ps.delete()

        payroll_run.status = PayrollRunStatus.CANCELLED
        cancel_note = f"Cancelled by {user or 'System'}. Reason: {reason or 'N/A'}"
        payroll_run.notes = f"{payroll_run.notes} | {cancel_note}".strip(' |')
        payroll_run.save(update_fields=['status', 'notes'])
        return payroll_run

    @classmethod
    def get_runs_list(
        cls,
        company: Company,
        status: Optional[str] = None,
        payroll_month: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Returns summary list of payroll runs formatted for UI table:
        Period | Employees | Gross | Deductions | Net | Status | Finance Status
        """
        qs = PayrollRun.objects.filter(company=company, is_deleted=False).select_related(
            'payroll_period', 'prepared_by', 'reviewed_by', 'approved_by', 'finalized_by'
        ).prefetch_related('finance_integrations').order_by('-created_at')

        if status:
            qs = qs.filter(status=status)
        if payroll_month:
            qs = qs.filter(payroll_month=payroll_month)

        result = []
        for r in qs:
            fin = r.finance_integrations.first()
            p_start = r.period_start or (r.payroll_period.start_date if r.payroll_period else None)
            p_end = r.period_end or (r.payroll_period.end_date if r.payroll_period else None)

            result.append({
                'id': str(r.id),
                'run_number': r.run_number,
                'period_start': p_start.isoformat() if p_start else '',
                'period_end': p_end.isoformat() if p_end else '',
                'payroll_month': r.payroll_month or (p_start.strftime('%Y-%m') if p_start else ''),
                'period_label': r.payroll_period.name if r.payroll_period else f"{p_start} to {p_end}",
                'employee_count': r.employee_count,
                'gross_earnings': str(r.gross_earnings),
                'employee_deductions': str(r.employee_deductions),
                'employer_statutory_contribution': str(r.employer_statutory_contribution),
                'net_payroll': str(r.net_payroll),
                'status': r.status,
                'prepared_by': f"{r.prepared_by.first_name} {r.prepared_by.last_name}".strip() if r.prepared_by else (r.prepared_by.username if r.prepared_by else ''),
                'prepared_at': r.prepared_at.isoformat() if r.prepared_at else '',
                'reviewed_by': f"{r.reviewed_by.first_name} {r.reviewed_by.last_name}".strip() if r.reviewed_by else '',
                'approved_by': f"{r.approved_by.first_name} {r.approved_by.last_name}".strip() if r.approved_by else '',
                'finalized_by': f"{r.finalized_by.first_name} {r.finalized_by.last_name}".strip() if r.finalized_by else '',
                'finalized_at': r.finalized_at.isoformat() if r.finalized_at else '',
                'finance_integration_id': str(fin.id) if fin else None,
                'finance_status': fin.status if fin else 'NOT_INTEGRATED',
                'remaining_liability': str(fin.remaining_liability) if fin else '0.00'
            })

        return result
