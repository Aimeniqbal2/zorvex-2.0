import logging
from decimal import Decimal
from datetime import date
from django.db.models import Sum, Count, Q
from operations.models import (
    ServiceContract, OperationalSite, Deployment, DeploymentStatus,
    DutyAssignment, DutyAssignmentStatus, ExtraDuty, ExtraDutyStatus
)

logger = logging.getLogger(__name__)


def pull_billable_activity(contract: ServiceContract, period_start: date, period_end: date) -> dict:
    """
    Pulls billable operational activity for the ServiceContract between period_start and period_end.
    
    Returns structured activity by site and designation:
    {
        'sites': {
            site_id: {
                'site_id': UUID,
                'site_name': str,
                'deployments': [
                    { 'designation_id': UUID, 'designation_name': str, 'guard_count': int, 'headcount': int }
                ],
                'duty_hours': Decimal,
                'regular_shifts': int,
                'single_ot_hours': Decimal,
                'double_ot_hours': Decimal,
                'extra_duties': [
                    { 'id': UUID, 'date': date, 'hours': Decimal, 'description': str, 'employee_name': str }
                ]
            }
        },
        'summary': {
            'total_guard_headcount': int,
            'total_duty_hours': Decimal,
            'total_extra_duty_hours': Decimal,
            'total_client_ot_hours': Decimal
        }
    }
    """
    sites_qs = contract.sites.filter(is_active=True)
    if not sites_qs.exists():
        # Fallback to sites linked to the customer if contract.sites was not explicitly populated
        sites_qs = OperationalSite.objects.filter(
            company_id=contract.company_id,
            crm_entity_id=contract.crm_entity_id,
            is_active=True
        )

    site_map = {site.id: site for site in sites_qs}

    activity = {
        'sites': {},
        'summary': {
            'total_guard_headcount': 0,
            'total_duty_hours': Decimal('0.00'),
            'total_extra_duty_hours': Decimal('0.00'),
            'total_client_ot_hours': Decimal('0.00'),
        }
    }

    for site_id, site in site_map.items():
        activity['sites'][str(site_id)] = {
            'site_id': site.id,
            'site_name': site.name,
            'deployments': {},
            'duty_hours': Decimal('0.00'),
            'regular_shifts': 0,
            'single_ot_hours': Decimal('0.00'),
            'double_ot_hours': Decimal('0.00'),
            'extra_duties': [],
        }

    # 1. Inspect Active Deployments within period
    deployments = Deployment.objects.filter(
        company_id=contract.company_id,
        status__in=[DeploymentStatus.ACTIVE, DeploymentStatus.COMPLETED, DeploymentStatus.PLANNED],
        start_date__lte=period_end,
        is_deleted=False
    ).filter(
        Q(service_contract=contract) | Q(site__in=sites_qs)
    ).select_related('designation', 'site', 'employee')

    for dep in deployments:
        if dep.end_date and dep.end_date < period_start:
            continue

        site_key = str(dep.site_id)
        if site_key not in activity['sites']:
            activity['sites'][site_key] = {
                'site_id': dep.site.id if dep.site else None,
                'site_name': dep.site.name if dep.site else 'Site',
                'deployments': {},
                'duty_hours': Decimal('0.00'),
                'regular_shifts': 0,
                'single_ot_hours': Decimal('0.00'),
                'double_ot_hours': Decimal('0.00'),
                'extra_duties': [],
            }

        desig_key = str(dep.designation_id)
        desig_name = dep.designation.name if dep.designation else 'Security Guard'
        if desig_key not in activity['sites'][site_key]['deployments']:
            activity['sites'][site_key]['deployments'][desig_key] = {
                'designation_id': dep.designation_id,
                'designation_name': desig_name,
                'headcount': 0,
            }
        activity['sites'][site_key]['deployments'][desig_key]['headcount'] += 1
        activity['summary']['total_guard_headcount'] += 1

    # 2. Inspect Completed Duty Assignments
    duty_qs = DutyAssignment.objects.filter(
        company_id=contract.company_id,
        date__gte=period_start,
        date__lte=period_end,
        status=DutyAssignmentStatus.COMPLETED,
        is_deleted=False
    ).filter(
        Q(site__in=sites_qs) | Q(deployment__service_contract=contract)
    ).select_related('site', 'employee')

    for da in duty_qs:
        site_key = str(da.site_id)
        if site_key in activity['sites']:
            # Assume 8-hour or 12-hour shift if start_time/end_time calculation is available
            hours = Decimal('8.00')
            if da.start_time and da.end_time:
                import datetime
                t1 = datetime.datetime.combine(da.date, da.start_time)
                t2 = datetime.datetime.combine(da.date, da.end_time)
                diff = (t2 - t1).total_seconds() / 3600.0
                if diff > 0:
                    hours = Decimal(f"{diff:.2f}")

            activity['sites'][site_key]['duty_hours'] += hours
            activity['sites'][site_key]['regular_shifts'] += 1
            activity['summary']['total_duty_hours'] += hours

    # 3. Inspect Approved Extra Duties
    extra_duties = ExtraDuty.objects.filter(
        company_id=contract.company_id,
        date__gte=period_start,
        date__lte=period_end,
        status__in=[ExtraDutyStatus.APPROVED, ExtraDutyStatus.COMPLETED],
        is_deleted=False
    ).filter(
        Q(service_contract=contract) | Q(site__in=sites_qs)
    ).select_related('site', 'employee')

    for ed in extra_duties:
        site_key = str(ed.site_id) if ed.site_id else list(activity['sites'].keys())[0] if activity['sites'] else 'default'
        if site_key not in activity['sites']:
            activity['sites'][site_key] = {
                'site_id': ed.site.id if ed.site else None,
                'site_name': ed.site.name if ed.site else 'General Site',
                'deployments': {},
                'duty_hours': Decimal('0.00'),
                'regular_shifts': 0,
                'single_ot_hours': Decimal('0.00'),
                'double_ot_hours': Decimal('0.00'),
                'extra_duties': [],
            }

        ed_hours = Decimal(str(ed.hours or '0.00'))
        activity['sites'][site_key]['extra_duties'].append({
            'id': ed.id,
            'date': ed.date,
            'hours': ed_hours,
            'description': ed.description or 'Approved Extra Duty',
            'employee_name': f"{ed.employee.first_name} {ed.employee.last_name}".strip() if ed.employee else 'Guard',
        })
        activity['summary']['total_extra_duty_hours'] += ed_hours

    return activity
