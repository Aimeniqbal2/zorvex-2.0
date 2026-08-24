"""
operations/services/payroll_bridge.py

Phase 8C — ExtraDuty → Payroll Injection Adapter.

Injects approved ExtraDuty hours into an existing Payslip as a variable
PayslipLine, using ContractRate.pay_rate as the rate.

ARCHITECTURAL CONSTRAINT (documented):
The existing payroll_calculation.py engine deletes and recreates ALL
draft/calculated payslips during recalculation. This means any PayslipLine
injected by this adapter will be wiped on the next recalculation.

Resolution:
- ExtraDutyPayrollBridge records the intent permanently.
- This adapter is safe to call AGAIN after recalculation to re-inject.
- Callers should re-run this adapter after any payroll recalculation to
  re-inject all APPROVED bridge records for a given PayrollRun.
- The bridge record itself (ExtraDutyPayrollBridge) is never deleted on
  payroll recalculation — only the PayslipLine it creates is.

Rules:
- ExtraDuty must be APPROVED or COMPLETED.
- PayrollRun must NOT be FINALIZED or CANCELLED.
- All records must belong to the same company.
- Uses transaction.atomic() + select_for_update().
- Idempotent: returns existing bridge if already processed.
- Does NOT create OvertimeRecord.
- Does NOT modify payroll_calculation.py.
"""

import logging
from decimal import Decimal
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)


class PayrollBridgeError(Exception):
    """Raised when the payroll bridge adapter encounters a non-retryable error."""
    pass


def process_extra_duty_payroll(extra_duty_id, payroll_run_id, company_id):
    """
    Inject an approved ExtraDuty into a PayrollRun as a variable PayslipLine.

    Returns:
        dict: {
            'created': bool,
            'bridge_id': UUID,
            'amount': Decimal,
            'message': str
        }

    Raises:
        PayrollBridgeError: on validation failures.
    """
    from operations.models import ExtraDuty, ExtraDutyStatus, Deployment, ContractRate
    from hrm.models import (
        PayrollRun, PayrollRunStatus, Payslip, PayslipLine,
        SalaryComponent, ComponentType, CalculationType, PayslipStatus
    )
    from billing.models import ExtraDutyPayrollBridge

    with transaction.atomic():
        # ------------------------------------------------------------------ #
        # 1. Load and lock ExtraDuty
        # ------------------------------------------------------------------ #
        try:
            extra_duty = ExtraDuty.objects.select_for_update().get(
                id=extra_duty_id,
                company_id=company_id,
                is_deleted=False
            )
        except ExtraDuty.DoesNotExist:
            raise PayrollBridgeError(
                f"ExtraDuty {extra_duty_id} not found for company {company_id}."
            )

        # ------------------------------------------------------------------ #
        # 2. Tenant isolation
        # ------------------------------------------------------------------ #
        if str(extra_duty.company_id) != str(company_id):
            raise PayrollBridgeError("Cross-company ExtraDuty access rejected.")
        if str(extra_duty.employee.company_id) != str(company_id):
            raise PayrollBridgeError("Cross-company Employee in ExtraDuty.")

        # ------------------------------------------------------------------ #
        # 3. Status gate: only APPROVED or COMPLETED ExtraDuties are payable
        # ------------------------------------------------------------------ #
        if extra_duty.status not in [ExtraDutyStatus.APPROVED, ExtraDutyStatus.COMPLETED]:
            raise PayrollBridgeError(
                f"ExtraDuty {extra_duty_id} has status {extra_duty.status}. "
                f"Only APPROVED or COMPLETED are payable."
            )

        # ------------------------------------------------------------------ #
        # 4. Load and lock PayrollRun
        # ------------------------------------------------------------------ #
        try:
            payroll_run = PayrollRun.objects.select_for_update().get(
                id=payroll_run_id,
                company_id=company_id,
                is_deleted=False
            )
        except PayrollRun.DoesNotExist:
            raise PayrollBridgeError(
                f"PayrollRun {payroll_run_id} not found for company {company_id}."
            )

        if str(payroll_run.company_id) != str(company_id):
            raise PayrollBridgeError("Cross-company PayrollRun access rejected.")

        if payroll_run.status in [PayrollRunStatus.FINALIZED, PayrollRunStatus.CANCELLED]:
            raise PayrollBridgeError(
                f"Cannot inject into a {payroll_run.status} PayrollRun."
            )

        # ------------------------------------------------------------------ #
        # 5. Idempotency: return existing bridge if present
        # ------------------------------------------------------------------ #
        existing_bridge = ExtraDutyPayrollBridge.objects.filter(
            company_id=company_id,
            extra_duty=extra_duty,
            payroll_run=payroll_run,
            is_deleted=False
        ).first()

        if existing_bridge:
            logger.info(
                f"[PAYROLL_BRIDGE] Bridge already exists: {existing_bridge.id}. "
                f"Returning idempotent result."
            )
            return {
                'created': False,
                'bridge_id': existing_bridge.id,
                'amount': existing_bridge.amount,
                'message': 'Bridge record already exists. Idempotent return.'
            }

        # ------------------------------------------------------------------ #
        # 6. Resolve ContractRate for pay_rate
        # ------------------------------------------------------------------ #
        # Try to find ContractRate via ExtraDuty.service_contract or via
        # the employee's most recent Deployment on the ExtraDuty date.
        pay_rate = _resolve_pay_rate(extra_duty, company_id)

        if pay_rate is None:
            raise PayrollBridgeError(
                f"No ContractRate found for ExtraDuty {extra_duty_id}. "
                f"Cannot calculate payroll amount."
            )

        # ------------------------------------------------------------------ #
        # 7. Calculate amount: hours × pay_rate
        # ------------------------------------------------------------------ #
        hours = extra_duty.hours
        amount = (hours * pay_rate).quantize(Decimal('0.01'))

        # ------------------------------------------------------------------ #
        # 8. Find the employee's Payslip in this PayrollRun
        # ------------------------------------------------------------------ #
        payslip = Payslip.objects.filter(
            company_id=company_id,
            payroll_run=payroll_run,
            employee=extra_duty.employee,
            is_deleted=False
        ).first()

        # ------------------------------------------------------------------ #
        # 9. Create the ExtraDutyPayrollBridge record FIRST (idempotency anchor)
        # ------------------------------------------------------------------ #
        bridge = ExtraDutyPayrollBridge(
            company_id=company_id,
            extra_duty=extra_duty,
            payroll_run=payroll_run,
            payslip=payslip,
            amount=amount,
            processed_at=timezone.now()
        )
        bridge.save()

        # ------------------------------------------------------------------ #
        # 10. Inject PayslipLine if the payslip exists and is not finalized
        # ------------------------------------------------------------------ #
        if payslip and payslip.status not in [PayslipStatus.FINALIZED, PayslipStatus.PAID]:
            _inject_payslip_line(payslip, extra_duty, amount, company_id)
            logger.info(
                f"[PAYROLL_BRIDGE] Injected PayslipLine for ExtraDuty {extra_duty_id} "
                f"into Payslip {payslip.id} (amount={amount})."
            )
        else:
            logger.warning(
                f"[PAYROLL_BRIDGE] No eligible Payslip found for employee "
                f"{extra_duty.employee_id} in PayrollRun {payroll_run_id}. "
                f"Bridge created; PayslipLine will be injected after payroll calculation."
            )

        return {
            'created': True,
            'bridge_id': bridge.id,
            'amount': amount,
            'message': 'ExtraDutyPayrollBridge created successfully.'
        }


def _resolve_pay_rate(extra_duty, company_id):
    """
    Resolve ContractRate.pay_rate for the given ExtraDuty.

    Lookup order:
    1. ExtraDuty.service_contract + employee's designation from most recent
       active Deployment on/before the duty date.
    2. Employee's most recent Deployment with a ServiceContract that has a
       ContractRate for the deployment's designation on/before the duty date.
    """
    from operations.models import ContractRate, Deployment, DeploymentStatus

    # Resolve designation — try most recent active/completed deployment
    deployment = Deployment.objects.filter(
        company_id=company_id,
        employee=extra_duty.employee,
        start_date__lte=extra_duty.date,
        is_deleted=False,
        status__in=[DeploymentStatus.ACTIVE, DeploymentStatus.COMPLETED]
    ).order_by('-start_date').first()

    service_contract = extra_duty.service_contract or (
        deployment.service_contract if deployment else None
    )
    designation = deployment.designation if deployment else extra_duty.employee.designation

    if not service_contract or not designation:
        return None

    rate_obj = ContractRate.objects.filter(
        company_id=company_id,
        service_contract=service_contract,
        designation=designation,
        effective_date__lte=extra_duty.date,
        is_deleted=False
    ).order_by('-effective_date').first()

    return rate_obj.pay_rate if rate_obj else None


def _inject_payslip_line(payslip, extra_duty, amount, company_id):
    """
    Create a variable PayslipLine on the payslip for the ExtraDuty amount.
    Gets or creates a non-recurring 'Extra Duty Pay' SalaryComponent.
    """
    from hrm.models import SalaryComponent, PayslipLine, ComponentType, CalculationType

    # Get or create a generic variable salary component for extra duties
    component, _ = SalaryComponent.objects.get_or_create(
        company_id=company_id,
        code='EXTRA_DUTY_PAY',
        is_deleted=False,
        defaults={
            'name': 'Extra Duty Pay',
            'description': 'Variable earning from operational extra duties.',
            'component_type': ComponentType.EARNING,
            'calculation_type': CalculationType.FIXED,
            'is_taxable': True,
            'is_recurring': False,
            'display_order': 999,
            'is_active': True,
        }
    )

    # Sequence: place after all structure-based lines
    max_seq = PayslipLine.objects.filter(
        payslip=payslip, is_deleted=False
    ).values_list('sequence', flat=True)
    next_seq = (max(max_seq) + 1) if max_seq else 1000

    line = PayslipLine(
        company_id=company_id,
        payslip=payslip,
        salary_component=component,
        component_type=ComponentType.EARNING,
        amount=amount,
        sequence=next_seq,
        description=f"Extra Duty – {extra_duty.date} ({extra_duty.hours}h)"
    )
    line.save()

    # Update payslip totals to reflect the injected line
    from decimal import Decimal
    payslip.gross_amount = (payslip.gross_amount or Decimal('0.00')) + amount
    payslip.net_amount = (payslip.net_amount or Decimal('0.00')) + amount
    payslip.save(update_fields=['gross_amount', 'net_amount'])


def reinject_approved_bridges_for_run(payroll_run_id, company_id):
    """
    Re-inject all approved ExtraDutyPayrollBridge records for a PayrollRun.

    Call this after payroll recalculation to restore ExtraDuty PayslipLines
    that were wiped during the recalculation cycle.

    Returns:
        dict: {'reinjected': int, 'skipped': int, 'errors': list}
    """
    from billing.models import ExtraDutyPayrollBridge
    from hrm.models import PayrollRun, PayrollRunStatus, Payslip, PayslipLine, PayslipStatus
    from hrm.models import SalaryComponent, ComponentType

    results = {'reinjected': 0, 'skipped': 0, 'errors': []}

    try:
        payroll_run = PayrollRun.objects.get(
            id=payroll_run_id, company_id=company_id, is_deleted=False
        )
    except PayrollRun.DoesNotExist:
        results['errors'].append(f"PayrollRun {payroll_run_id} not found.")
        return results

    if payroll_run.status in [PayrollRunStatus.FINALIZED, PayrollRunStatus.CANCELLED]:
        results['errors'].append(f"PayrollRun is {payroll_run.status}. Cannot re-inject.")
        return results

    bridges = ExtraDutyPayrollBridge.objects.filter(
        company_id=company_id,
        payroll_run=payroll_run,
        is_deleted=False
    ).select_related('extra_duty', 'extra_duty__employee')

    for bridge in bridges:
        try:
            with transaction.atomic():
                payslip = Payslip.objects.filter(
                    company_id=company_id,
                    payroll_run=payroll_run,
                    employee=bridge.extra_duty.employee,
                    is_deleted=False
                ).first()

                if not payslip:
                    results['skipped'] += 1
                    continue

                if payslip.status in [PayslipStatus.FINALIZED, PayslipStatus.PAID]:
                    results['skipped'] += 1
                    continue

                # Check if already injected (line may have survived)
                already_injected = PayslipLine.objects.filter(
                    company_id=company_id,
                    payslip=payslip,
                    description__contains=str(bridge.extra_duty.date),
                    is_deleted=False
                ).exists()

                if not already_injected:
                    _inject_payslip_line(payslip, bridge.extra_duty, bridge.amount, company_id)
                    # Update bridge payslip reference
                    bridge.payslip = payslip
                    bridge.save(update_fields=['payslip'])
                    results['reinjected'] += 1
                else:
                    results['skipped'] += 1
        except Exception as e:
            results['errors'].append(f"Bridge {bridge.id}: {str(e)}")

    return results
