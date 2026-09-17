import logging
from decimal import Decimal, ROUND_HALF_UP
from datetime import date
from django.utils import timezone
from django.db import transaction
from django.core.exceptions import ValidationError
from erp_core.models import DocumentSequence
from operations.models import ServiceContract, OperationalSite
from hrm.models import Designation
from finance.models import ProfitCenter, CostCenter, Currency
from billing.models import (
    BillingPeriod, BillingPeriodStatus,
    BillingSheet, BillingSheetStatus,
    BillingSheetLine, BillingLineType, BillingLineSource,
    BillingAdjustment, AdjustmentType
)
from .contract_rate_resolver import resolve_contract_rates
from .billable_activity_service import pull_billable_activity

logger = logging.getLogger(__name__)


def quantize_amount(val) -> Decimal:
    if val is None:
        return Decimal('0.00')
    return Decimal(str(val)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


@transaction.atomic
def build_billing_sheet_from_contract(
    company,
    contract_id,
    period_start: date,
    period_end: date,
    user=None,
    currency_id=None,
    notes=""
) -> BillingSheet:
    """
    Builds a comprehensive draft BillingSheet by pulling agreed contract terms,
    historical rates, and actual operational activity.
    """
    contract = ServiceContract.objects.select_for_update().get(id=contract_id, company=company)
    
    # 1. Prevent duplicate active billing sheets for same contract + period
    existing = BillingSheet.objects.filter(
        company=company,
        contract=contract,
        period_start=period_start,
        period_end=period_end,
        is_deleted=False
    ).exclude(status=BillingSheetStatus.CANCELLED)

    if existing.exists():
        raise ValidationError(f"An active billing sheet ({existing.first().sheet_number}) already exists for this contract and period.")

    billing_month = period_start.strftime('%Y-%m')

    # 2. Get or create BillingPeriod record
    billing_period, _ = BillingPeriod.objects.get_or_create(
        company=company,
        contract=contract,
        period_start=period_start,
        period_end=period_end,
        defaults={
            'client': contract.crm_entity,
            'billing_month': billing_month,
            'status': BillingPeriodStatus.PROCESSING,
        }
    )

    # 3. Resolve currency & rates
    currency = None
    if currency_id:
        currency = Currency.objects.filter(id=currency_id, company=company).first()
    if not currency:
        from finance.models import SecurityFinanceConfiguration
        fin_cfg = SecurityFinanceConfiguration.objects.filter(company=company, is_active=True).first()
        if fin_cfg and fin_cfg.default_currency:
            currency = fin_cfg.default_currency

    rate_data = resolve_contract_rates(contract, period_end)
    activity_data = pull_billable_activity(contract, period_start, period_end)

    # Default profit center (e.g. Guarding) and cost center (Field Ops)
    default_profit_center = ProfitCenter.objects.filter(company=company, is_active=True).first()
    default_cost_center = CostCenter.objects.filter(company=company, is_active=True).first()

    # 4. Initialize Billing Sheet
    sheet = BillingSheet.objects.create(
        company=company,
        client=contract.crm_entity,
        contract=contract,
        billing_period=billing_period,
        period_start=period_start,
        period_end=period_end,
        billing_month=billing_month,
        currency=currency,
        status=BillingSheetStatus.DRAFT,
        prepared_by=user,
        prepared_at=timezone.now(),
        notes=notes,
        tax_rate=rate_data.get('tax_rate', Decimal('0.00')),
    )

    lines_to_create = []

    # 5. Process Regular Guard Deployments / Staffing Lines per Site
    sites_dict = activity_data.get('sites', {})
    
    # If no deployments exist in operations, fall back to staffing requirements or contract designations
    has_activity = any(len(s.get('deployments', {})) > 0 for s in sites_dict.values())

    if has_activity:
        for site_key, site_info in sites_dict.items():
            site_obj = OperationalSite.objects.filter(id=site_info['site_id']).first() if site_info.get('site_id') else None
            for desig_id_str, dep_info in site_info.get('deployments', {}).items():
                desig_obj = Designation.objects.filter(id=dep_info['designation_id']).first() if dep_info.get('designation_id') else None
                rate_info = rate_data['designations'].get(desig_id_str, {})
                unit_rate = rate_info.get('billing_rate', Decimal('0.00'))
                headcount = Decimal(str(dep_info['headcount']))
                line_subtotal = quantize_amount(headcount * unit_rate)
                tax_amount = quantize_amount(line_subtotal * (sheet.tax_rate / Decimal('100.0')))
                total_amount = line_subtotal + tax_amount

                lines_to_create.append(
                    BillingSheetLine(
                        company=company,
                        billing_sheet=sheet,
                        line_type=BillingLineType.GUARD,
                        description=f"{dep_info['designation_name']} - Regular Guarding ({site_info['site_name']})",
                        site=site_obj,
                        designation=desig_obj,
                        billing_unit='MONTH',
                        contract_quantity=headcount,
                        actual_quantity=headcount,
                        billable_quantity=headcount,
                        unit_rate=unit_rate,
                        line_subtotal=line_subtotal,
                        tax_rate=sheet.tax_rate,
                        tax_amount=tax_amount,
                        total_amount=total_amount,
                        source=BillingLineSource.OPERATIONS,
                        profit_center=default_profit_center,
                        cost_center=default_cost_center,
                        source_reference=f"Deployment Headcount: {headcount}",
                    )
                )
    else:
        # Fallback to contract rates / requirements directly
        for desig_id_str, r_info in rate_data.get('designations', {}).items():
            desig_obj = Designation.objects.filter(id=r_info['designation_id']).first() if r_info.get('designation_id') else None
            qty = Decimal(str(r_info.get('quantity', 1)))
            unit_rate = r_info.get('billing_rate', Decimal('0.00'))
            line_subtotal = quantize_amount(qty * unit_rate)
            tax_amount = quantize_amount(line_subtotal * (sheet.tax_rate / Decimal('100.0')))
            total_amount = line_subtotal + tax_amount

            lines_to_create.append(
                BillingSheetLine(
                    company=company,
                    billing_sheet=sheet,
                    line_type=BillingLineType.REGULAR_SERVICE,
                    description=f"{r_info['designation_name']} - Contract Regular Service",
                    designation=desig_obj,
                    billing_unit='MONTH',
                    contract_quantity=qty,
                    actual_quantity=qty,
                    billable_quantity=qty,
                    unit_rate=unit_rate,
                    line_subtotal=line_subtotal,
                    tax_rate=sheet.tax_rate,
                    tax_amount=tax_amount,
                    total_amount=total_amount,
                    source=BillingLineSource.CONTRACT,
                    profit_center=default_profit_center,
                    cost_center=default_cost_center,
                )
            )

    # 6. Process Approved Extra Duties
    for site_key, site_info in sites_dict.items():
        site_obj = OperationalSite.objects.filter(id=site_info['site_id']).first() if site_info.get('site_id') else None
        for ed in site_info.get('extra_duties', []):
            hours = ed['hours']
            # Compute rate from overtime rate multiplier or standard hourly rate (e.g. 500/hr)
            unit_rate = Decimal('500.00')
            line_subtotal = quantize_amount(hours * unit_rate)
            tax_amount = quantize_amount(line_subtotal * (sheet.tax_rate / Decimal('100.0')))
            total_amount = line_subtotal + tax_amount

            lines_to_create.append(
                BillingSheetLine(
                    company=company,
                    billing_sheet=sheet,
                    line_type=BillingLineType.EXTRA_DUTY,
                    description=f"Extra Duty: {ed['description']} ({ed['employee_name']} on {ed['date']})",
                    site=site_obj,
                    billing_unit='HOUR',
                    contract_quantity=Decimal('0.00'),
                    actual_quantity=hours,
                    billable_quantity=hours,
                    unit_rate=unit_rate,
                    line_subtotal=line_subtotal,
                    tax_rate=sheet.tax_rate,
                    tax_amount=tax_amount,
                    total_amount=total_amount,
                    source=BillingLineSource.OPERATIONS,
                    profit_center=default_profit_center,
                    cost_center=default_cost_center,
                    source_reference=f"ExtraDuty:{ed['id']}",
                )
            )

    # 7. Process Contract Equipment Charges
    for eq in rate_data.get('equipment_rates', []):
        qty = eq['quantity']
        rate = eq['rate']
        line_subtotal = quantize_amount(qty * rate)
        tax_amount = quantize_amount(line_subtotal * (sheet.tax_rate / Decimal('100.0')))
        total_amount = line_subtotal + tax_amount

        lines_to_create.append(
            BillingSheetLine(
                company=company,
                billing_sheet=sheet,
                line_type=BillingLineType.EQUIPMENT_RENTAL,
                description=f"Security Equipment Rental: {eq['name']}",
                billing_unit='MONTH',
                contract_quantity=qty,
                actual_quantity=qty,
                billable_quantity=qty,
                unit_rate=rate,
                line_subtotal=line_subtotal,
                tax_rate=sheet.tax_rate,
                tax_amount=tax_amount,
                total_amount=total_amount,
                source=BillingLineSource.CONTRACT,
                profit_center=default_profit_center,
                cost_center=default_cost_center,
            )
        )

    BillingSheetLine.objects.bulk_create(lines_to_create)

    # 8. Recalculate financial breakdown
    recalculate_billing_sheet(sheet)
    return sheet


@transaction.atomic
def add_billing_adjustment(
    billing_sheet: BillingSheet,
    adjustment_type: str,
    reason: str,
    amount: Decimal,
    user=None,
    site_id=None,
    tax_rate=None
) -> BillingAdjustment:
    """
    Adds a controlled manual adjustment to a draft or under-review billing sheet.
    """
    if billing_sheet.status not in [BillingSheetStatus.DRAFT, BillingSheetStatus.UNDER_REVIEW]:
        raise ValidationError(f"Cannot add adjustments to a billing sheet in {billing_sheet.status} status.")

    amount = quantize_amount(amount)
    if tax_rate is None:
        tax_rate = billing_sheet.tax_rate or Decimal('0.00')
    else:
        tax_rate = Decimal(str(tax_rate))

    tax_amount = quantize_amount(amount * (tax_rate / Decimal('100.0')))
    site = None
    if site_id:
        site = OperationalSite.objects.filter(id=site_id, company=billing_sheet.company).first()

    adj = BillingAdjustment.objects.create(
        company=billing_sheet.company,
        billing_sheet=billing_sheet,
        adjustment_type=adjustment_type,
        reason=reason,
        amount=amount,
        tax_rate=tax_rate,
        tax_amount=tax_amount,
        site=site,
        created_by=user,
    )

    # Add a corresponding line item
    BillingSheetLine.objects.create(
        company=billing_sheet.company,
        billing_sheet=billing_sheet,
        line_type=BillingLineType.ADDITIONAL_CHARGE if adjustment_type in [AdjustmentType.ADDITIONAL_CHARGE, AdjustmentType.CORRECTION] else BillingLineType.DISCOUNT_ADJUSTMENT,
        description=f"Adjustment ({adj.get_adjustment_type_display()}): {reason}",
        site=site,
        billing_unit='UNIT',
        contract_quantity=Decimal('1.00'),
        actual_quantity=Decimal('1.00'),
        billable_quantity=Decimal('1.00'),
        unit_rate=amount if adjustment_type != AdjustmentType.DISCOUNT else -abs(amount),
        line_subtotal=amount if adjustment_type != AdjustmentType.DISCOUNT else -abs(amount),
        tax_rate=tax_rate,
        tax_amount=tax_amount if adjustment_type != AdjustmentType.DISCOUNT else -abs(tax_amount),
        total_amount=(amount + tax_amount) if adjustment_type != AdjustmentType.DISCOUNT else -(abs(amount) + abs(tax_amount)),
        source=BillingLineSource.MANUAL_ADJUSTMENT,
        source_reference=f"Adj:{adj.id}",
    )

    recalculate_billing_sheet(billing_sheet)
    return adj


@transaction.atomic
def recalculate_billing_sheet(billing_sheet: BillingSheet) -> BillingSheet:
    """
    Authoritatively calculates all financial totals using Decimal arithmetic.
    """
    lines = billing_sheet.lines.filter(is_deleted=False)

    base_amount = Decimal('0.00')
    ot_amount = Decimal('0.00')
    extra_duty_amount = Decimal('0.00')
    equipment_amount = Decimal('0.00')
    adjustment_amount = Decimal('0.00')
    discount_amount = Decimal('0.00')
    subtotal = Decimal('0.00')
    tax_amount = Decimal('0.00')

    for line in lines:
        subtotal += line.line_subtotal
        tax_amount += line.tax_amount

        if line.line_type in [BillingLineType.REGULAR_SERVICE, BillingLineType.SUPERVISOR, BillingLineType.GUARD]:
            base_amount += line.line_subtotal
        elif line.line_type in [BillingLineType.SINGLE_OT, BillingLineType.DOUBLE_OT]:
            ot_amount += line.line_subtotal
        elif line.line_type in [BillingLineType.EXTRA_DUTY, BillingLineType.TEMPORARY_SERVICE, BillingLineType.VIP_ESCORT]:
            extra_duty_amount += line.line_subtotal
        elif line.line_type == BillingLineType.EQUIPMENT_RENTAL:
            equipment_amount += line.line_subtotal
        elif line.line_type == BillingLineType.ADDITIONAL_CHARGE:
            adjustment_amount += line.line_subtotal
        elif line.line_type == BillingLineType.DISCOUNT_ADJUSTMENT:
            discount_amount += abs(line.line_subtotal)
        else:
            adjustment_amount += line.line_subtotal

    total_amount = subtotal + tax_amount

    billing_sheet.base_amount = quantize_amount(base_amount)
    billing_sheet.ot_amount = quantize_amount(ot_amount)
    billing_sheet.extra_duty_amount = quantize_amount(extra_duty_amount)
    billing_sheet.equipment_amount = quantize_amount(equipment_amount)
    billing_sheet.adjustment_amount = quantize_amount(adjustment_amount)
    billing_sheet.discount_amount = quantize_amount(discount_amount)
    billing_sheet.subtotal = quantize_amount(subtotal)
    billing_sheet.tax_amount = quantize_amount(tax_amount)
    billing_sheet.total_amount = quantize_amount(total_amount)

    billing_sheet.save(update_fields=[
        'base_amount', 'ot_amount', 'extra_duty_amount', 'equipment_amount',
        'adjustment_amount', 'discount_amount', 'subtotal', 'tax_amount', 'total_amount',
        'updated_at'
    ])
    return billing_sheet


@transaction.atomic
def submit_for_review(billing_sheet: BillingSheet, user=None) -> BillingSheet:
    if billing_sheet.status != BillingSheetStatus.DRAFT:
        raise ValidationError(f"Only DRAFT billing sheets can be submitted for review. Current status: {billing_sheet.status}")
    
    billing_sheet.status = BillingSheetStatus.UNDER_REVIEW
    billing_sheet.reviewed_by = user
    billing_sheet.reviewed_at = timezone.now()
    billing_sheet.save(update_fields=['status', 'reviewed_by', 'reviewed_at', 'updated_at'])
    return billing_sheet


@transaction.atomic
def approve_billing_sheet(billing_sheet: BillingSheet, user=None) -> BillingSheet:
    if billing_sheet.status not in [BillingSheetStatus.DRAFT, BillingSheetStatus.UNDER_REVIEW]:
        raise ValidationError(f"Cannot approve billing sheet in {billing_sheet.status} status.")
    
    billing_sheet.status = BillingSheetStatus.APPROVED
    billing_sheet.approved_by = user
    billing_sheet.approved_at = timezone.now()
    billing_sheet.save(update_fields=['status', 'approved_by', 'approved_at', 'updated_at'])

    if billing_sheet.billing_period:
        billing_sheet.billing_period.status = BillingPeriodStatus.FINALIZED
        billing_sheet.billing_period.save(update_fields=['status', 'updated_at'])

    return billing_sheet


@transaction.atomic
def cancel_billing_sheet(billing_sheet: BillingSheet, user=None, reason="") -> BillingSheet:
    if billing_sheet.status == BillingSheetStatus.INVOICED:
        raise ValidationError("Cannot cancel a billing sheet that has already generated a Client Invoice.")
    
    billing_sheet.status = BillingSheetStatus.CANCELLED
    if reason:
        billing_sheet.notes = f"{billing_sheet.notes}\n[Cancelled]: {reason}".strip()
    billing_sheet.save(update_fields=['status', 'notes', 'updated_at'])

    if billing_sheet.billing_period:
        billing_sheet.billing_period.status = BillingPeriodStatus.OPEN
        billing_sheet.billing_period.save(update_fields=['status', 'updated_at'])

    return billing_sheet
