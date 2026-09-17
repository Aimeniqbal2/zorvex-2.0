from django.db.models import Count, Q
from operations.models import OperationalSite, SecurityPost, Deployment, DeploymentStatus


def calculate_site_manpower(site):
    """
    Computes required workforce strength, deployed strength, vacancies,
    overstaffing, and post/deployment breakdowns for an OperationalSite.
    """
    active_posts = site.security_posts.filter(
        is_active=True, is_deleted=False
    ).select_related('required_designation', 'service_contract')

    total_required = sum(p.required_headcount for p in active_posts)

    active_deployments = site.deployments.filter(
        status=DeploymentStatus.ACTIVE,
        is_deleted=False
    ).select_related('employee', 'designation', 'post', 'service_contract', 'crm_entity')

    total_deployed = active_deployments.count()
    total_vacancies = max(0, total_required - total_deployed)
    total_overstaffing = max(0, total_deployed - total_required)

    posts_data = []
    for p in active_posts:
        post_deployed = active_deployments.filter(post=p).count()
        posts_data.append({
            'id': str(p.id),
            'post_name': p.post_name,
            'post_code': p.post_code,
            'required_designation_id': str(p.required_designation_id) if p.required_designation_id else None,
            'required_designation_name': p.required_designation.name if p.required_designation else '',
            'service_contract_id': str(p.service_contract_id) if p.service_contract_id else None,
            'service_contract_code': p.service_contract.contract_code if p.service_contract else None,
            'required_headcount': p.required_headcount,
            'deployed_headcount': post_deployed,
            'vacancies': max(0, p.required_headcount - post_deployed),
            'overstaffing': max(0, post_deployed - p.required_headcount),
            'is_active': p.is_active,
            'notes': p.notes or ''
        })

    deployments_data = []
    for d in active_deployments:
        emp = d.employee
        deployments_data.append({
            'id': str(d.id),
            'employee_id': str(emp.id),
            'employee_name': f"{emp.first_name} {emp.last_name}".strip(),
            'employee_code': getattr(emp, 'employee_code', ''),
            'employee_classification': getattr(emp, 'classification', 'DIRECT'),
            'designation_id': str(d.designation_id) if d.designation_id else None,
            'designation_name': d.designation.name if d.designation else '',
            'post_id': str(d.post_id) if d.post_id else None,
            'post_name': d.post.post_name if d.post else 'Unassigned Post',
            'assignment_type': d.assignment_type,
            'start_date': str(d.start_date),
            'from_date': str(d.start_date),
            'end_date': str(d.end_date) if d.end_date else None,
            'status': d.status
        })

    return {
        'site_id': str(site.id),
        'site_name': site.name,
        'client_id': str(site.crm_entity_id) if site.crm_entity_id else None,
        'client_name': site.crm_entity.name if site.crm_entity else 'N/A',
        'address': site.address,
        'is_active': site.is_active,
        'required_strength': total_required,
        'deployed_strength': total_deployed,
        'vacancies': total_vacancies,
        'overstaffing': total_overstaffing,
        'posts': posts_data,
        'deployments': deployments_data
    }


def calculate_all_sites_manpower(company_id):
    """
    Computes site manpower summary for all active sites within a company.
    """
    sites = OperationalSite.objects.filter(
        company_id=company_id, is_active=True, is_deleted=False
    ).select_related('crm_entity')
    return [calculate_site_manpower(s) for s in sites]
