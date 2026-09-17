import logging
from decimal import Decimal
from datetime import date
from django.core.exceptions import ValidationError
from operations.models import ServiceContract, ContractRate

logger = logging.getLogger(__name__)


def resolve_contract_rates(contract: ServiceContract, target_date: date = None) -> dict:
    """
    Resolves billable rates for a given ServiceContract at target_date.
    
    Priority order:
    1. Active operations.ContractRate records for the contract.
    2. Fallback / supplementary commercial terms from linked SecurityProposal.approved_version.
    
    Returns a dictionary mapping:
    - designations: { designation_id: { billing_rate, pay_rate, designation_name } }
    - overtime_rate_multiplier: Decimal (e.g. 1.5)
    - double_ot_rate_multiplier: Decimal (e.g. 2.0)
    - extra_duty_hourly_rate: Decimal
    - equipment_rates: list of { name, rate, billing_unit }
    - payment_terms: str
    - billing_cycle: str
    - tax_rate: Decimal
    - discount_type: str
    - discount_value: Decimal
    """
    if target_date is None:
        target_date = date.today()

    resolved = {
        'designations': {},
        'overtime_rate_multiplier': Decimal('1.5'),
        'double_ot_rate_multiplier': Decimal('2.0'),
        'extra_duty_hourly_rate': Decimal('0.00'),
        'equipment_rates': [],
        'payment_terms': 'NET_30',
        'billing_cycle': 'MONTHLY',
        'tax_rate': Decimal('0.00'),
        'discount_type': 'NONE',
        'discount_value': Decimal('0.00'),
        'currency': None,
    }

    # 1. Inspect operations.ContractRate
    rates_qs = ContractRate.objects.filter(
        service_contract=contract,
        effective_date__lte=target_date,
        is_deleted=False
    ).order_by('designation_id', '-effective_date')

    seen_designations = set()
    for rate_obj in rates_qs:
        if rate_obj.designation_id not in seen_designations:
            seen_designations.add(rate_obj.designation_id)
            resolved['designations'][str(rate_obj.designation_id)] = {
                'designation_id': rate_obj.designation_id,
                'designation_name': rate_obj.designation.name if rate_obj.designation else 'Security Guard',
                'billing_rate': Decimal(str(rate_obj.billing_rate or '0.00')),
                'pay_rate': Decimal(str(rate_obj.pay_rate or '0.00')),
                'effective_date': rate_obj.effective_date,
            }

    # 2. Inspect linked SecurityProposal and its approved version
    try:
        from security_crm.models import SecurityProposal
        proposal = contract.security_proposals.filter(is_deleted=False).first()
        if proposal and proposal.approved_version:
            version = proposal.approved_version
            resolved['payment_terms'] = version.payment_terms or resolved['payment_terms']
            resolved['billing_cycle'] = version.billing_cycle or resolved['billing_cycle']
            resolved['tax_rate'] = Decimal(str(version.tax_rate or '0.00'))
            resolved['discount_type'] = version.discount_type or 'NONE'
            resolved['discount_value'] = Decimal(str(version.discount_value or '0.00'))

            # Check for Guard requirements lines in proposal if contract rates were empty
            if not resolved['designations']:
                for req in version.guard_requirements.filter(is_deleted=False):
                    desig_id = str(req.designation_id) if req.designation_id else f"prop_{req.id}"
                    if desig_id not in resolved['designations']:
                        resolved['designations'][desig_id] = {
                            'designation_id': req.designation_id,
                            'designation_name': req.designation.name if req.designation else req.job_title or 'Security Guard',
                            'billing_rate': Decimal(str(req.monthly_rate or '0.00')),
                            'pay_rate': Decimal(str(req.base_salary or '0.00')),
                            'quantity': req.quantity,
                        }

            # Check for equipment lines in proposal
            for eq in version.equipment_requirements.filter(is_deleted=False):
                resolved['equipment_rates'].append({
                    'name': eq.item.name if eq.item else eq.equipment_name,
                    'quantity': Decimal(str(eq.quantity or '1')),
                    'rate': Decimal(str(eq.monthly_rental_rate or eq.unit_price or '0.00')),
                    'charge_type': eq.charge_type or 'MONTHLY',
                })
    except Exception as e:
        logger.warning(f"Could not load commercial proposal terms for contract {contract.id}: {e}")

    return resolved
