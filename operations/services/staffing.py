from django.db.models import Count, Q
from datetime import date
from operations.models import (
    SiteStaffingRequirement,
    Deployment,
    DutyAssignment,
    DutyAssignmentStatus,
    DeploymentStatus
)
from hrm.models import WorkforceAttendance

def get_staffing_coverage(company, target_date, contract_id=None, site_id=None, shift_id=None, designation_id=None):
    """
    Returns coverage metrics for the specified filters and date.
    """
    # Base requirements active on target_date
    req_qs = SiteStaffingRequirement.objects.filter(
        company=company,
        is_active=True,
        is_deleted=False,
        effective_from__lte=target_date
    ).filter(
        Q(effective_to__isnull=True) | Q(effective_to__gte=target_date)
    ).select_related('service_contract', 'site', 'designation', 'shift')

    if contract_id:
        req_qs = req_qs.filter(service_contract_id=contract_id)
    if site_id:
        req_qs = req_qs.filter(site_id=site_id)
    if shift_id:
        req_qs = req_qs.filter(shift_id=shift_id)
    if designation_id:
        req_qs = req_qs.filter(designation_id=designation_id)

    # Base deployments active on target_date
    dep_qs = Deployment.objects.filter(
        company=company,
        status=DeploymentStatus.ACTIVE,
        is_deleted=False,
        start_date__lte=target_date
    ).filter(
        Q(end_date__isnull=True) | Q(end_date__gte=target_date)
    )

    # Scheduled duties on target_date
    duty_qs = DutyAssignment.objects.filter(
        company=company,
        date=target_date,
        is_deleted=False
    ).exclude(status=DutyAssignmentStatus.CANCELLED)

    # Attendance present on target_date
    att_qs = WorkforceAttendance.objects.filter(
        company=company,
        date=target_date,
        is_deleted=False,
        status='PRESENT'
    )

    results = []
    
    # We will build coverage rows for each requirement found
    for req in req_qs:
        # Match Deployments
        req_deps = dep_qs.filter(
            site_id=req.site_id,
            designation_id=req.designation_id
        )
        if req.service_contract_id:
            req_deps = req_deps.filter(service_contract_id=req.service_contract_id)
            
        deployed_count = req_deps.count()

        # Match Scheduled Duties
        # Duty assignment connects to deployment, so we can filter duties by site, designation
        # Wait, duty assignment has site. It belongs to deployment. We can filter by deployment__designation.
        req_duties = duty_qs.filter(
            site_id=req.site_id,
            deployment__designation_id=req.designation_id
        )
        
        # We need to match shift! Duty assignment has start_time and end_time, but shift has start_time and end_time.
        # This can be tricky if DutyAssignment doesn't have shift_id.
        # Let's check how DutyAssignment models time. It has start_time and end_time.
        # Shift also has start_time and end_time.
        # A simple heuristic: duty start_time and end_time match shift, OR we just assume if they match site & designation they count for the required shift, but they could be in a different shift.
        # Actually, let's look for duties whose start_time is close to shift start_time? Or maybe just overlap with shift?
        # A strict requirement match: duty start_time == req.shift.start_time and duty end_time == req.shift.end_time.
        req_duties = req_duties.filter(
            start_time=req.shift.start_time,
            end_time=req.shift.end_time
        )
        scheduled_count = req_duties.count()

        # Match Attendance
        # We need to know if the scheduled duty employees are PRESENT.
        employee_ids = req_duties.values_list('employee_id', flat=True)
        present_count = att_qs.filter(employee_id__in=employee_ids).count()
        
        required = req.required_headcount
        
        # Calculations
        deployment_shortage = required - deployed_count
        roster_shortage = required - scheduled_count
        attendance_shortage = required - present_count
        surplus = max(deployed_count - required, 0)
        
        # Visual status
        if roster_shortage > 0 or deployment_shortage > 0:
            status = 'SHORT'
        elif surplus > 0:
            status = 'SURPLUS'
        else:
            status = 'COVERED'

        results.append({
            'requirement_id': req.id,
            'contract_id': req.service_contract_id,
            'contract_code': req.service_contract.contract_code if req.service_contract else None,
            'site_id': req.site_id,
            'site_name': req.site.name,
            'designation_id': req.designation_id,
            'designation_name': req.designation.name,
            'shift_id': req.shift_id,
            'shift_name': req.shift.name,
            
            'required': required,
            'deployed': deployed_count,
            'scheduled': scheduled_count,
            'present': present_count,
            
            'deployment_shortage': deployment_shortage,
            'roster_shortage': roster_shortage,
            'attendance_shortage': attendance_shortage,
            'surplus': surplus,
            
            'status': status
        })
        
    return results
