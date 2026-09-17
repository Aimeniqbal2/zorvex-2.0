import datetime
from django.db.models import Q
from operations.models import (
    OperationalSite, SecurityPost, PostShiftRequirement,
    DutyRoster, DutyRosterStatus
)
from hrm.models import Shift

def _parse_date(date_val):
    if isinstance(date_val, str):
        return datetime.date.fromisoformat(date_val)
    elif isinstance(date_val, (datetime.datetime, datetime.date)):
        return date_val if isinstance(date_val, datetime.date) else date_val.date()
    return datetime.date.today()

def calculate_site_shift_coverage(site_or_id, duty_date, shift_id=None):
    """
    Computes required, rostered, vacant, replacement coverage, and final covered strength
    for a given site and date, broken down by shift and post.
    Does not use attendance (Phase S-5C specification).
    """
    if isinstance(site_or_id, OperationalSite):
        site = site_or_id
    else:
        site = OperationalSite.objects.select_related('crm_entity').get(pk=site_or_id)

    date_obj = _parse_date(duty_date)
    company_id = site.company_id

    # Fetch active shifts
    shifts_qs = Shift.objects.filter(company_id=company_id, is_active=True, is_deleted=False)
    if shift_id:
        shifts_qs = shifts_qs.filter(pk=shift_id)
    shifts = list(shifts_qs.order_by('start_time'))

    # Fetch active posts for site
    posts = list(
        SecurityPost.objects.filter(
            site=site, is_active=True, is_deleted=False
        ).select_related('required_designation', 'service_contract').order_by('post_name')
    )

    # Fetch all post shift requirements for these posts
    post_reqs = PostShiftRequirement.objects.filter(
        post__in=posts, is_active=True, is_deleted=False
    ).select_related('shift', 'post')
    
    # Map (post_id, shift_id) -> requirement
    req_map = {}
    posts_with_any_req = set()
    for pr in post_reqs:
        req_map[(str(pr.post_id), str(pr.shift_id))] = pr.required_headcount
        posts_with_any_req.add(str(pr.post_id))

    # Fetch all roster records on this date for this site
    roster_qs = DutyRoster.objects.filter(
        site=site,
        duty_date=date_obj,
        status__in=[DutyRosterStatus.SCHEDULED, DutyRosterStatus.COMPLETED],
        is_deleted=False
    ).select_related('employee', 'employee__designation', 'shift', 'post', 'replacement_for__employee')

    roster_list = list(roster_qs)

    shifts_data = []
    total_site_required = 0
    total_site_rostered = 0
    total_site_vacant = 0
    total_site_replacements = 0
    total_site_covered = 0

    for sh in shifts:
        sh_id_str = str(sh.id)
        shift_posts_data = []
        shift_req_total = 0
        shift_rostered_total = 0
        shift_vacant_total = 0
        shift_replacements_total = 0
        shift_covered_total = 0

        for p in posts:
            p_id_str = str(p.id)
            # Determine required headcount
            if (p_id_str, sh_id_str) in req_map:
                req_headcount = req_map[(p_id_str, sh_id_str)]
            elif p_id_str in posts_with_any_req:
                req_headcount = 0  # Specifically not required on this shift
            else:
                req_headcount = p.required_headcount

            # Filter roster records for this post and shift
            p_roster = [r for r in roster_list if str(r.shift_id) == sh_id_str and str(r.post_id) == p_id_str]
            regular_guards = [r for r in p_roster if not r.is_replacement]
            replacement_guards = [r for r in p_roster if r.is_replacement]

            rostered_cnt = len(regular_guards)
            replacement_cnt = len(replacement_guards)
            vacant_cnt = max(0, req_headcount - rostered_cnt)
            covered_cnt = rostered_cnt + replacement_cnt

            shift_req_total += req_headcount
            shift_rostered_total += rostered_cnt
            shift_vacant_total += vacant_cnt
            shift_replacements_total += replacement_cnt
            shift_covered_total += covered_cnt

            # Personnel details for this post
            personnel = []
            for r in p_roster:
                emp = r.employee
                personnel.append({
                    'roster_id': str(r.id),
                    'employee_id': str(emp.id),
                    'employee_name': emp.full_name or f"{emp.first_name} {emp.last_name}".strip(),
                    'employee_code': getattr(emp, 'employee_code', ''),
                    'designation_name': emp.designation.name if getattr(emp, 'designation', None) else '',
                    'is_replacement': r.is_replacement,
                    'original_employee_name': (
                        r.replacement_for.employee.full_name or r.replacement_for.employee.first_name
                    ) if r.replacement_for and r.replacement_for.employee else None,
                    'status': r.status,
                    'notes': r.notes
                })

            shift_posts_data.append({
                'post_id': str(p.id),
                'post_name': p.post_name,
                'post_code': p.post_code,
                'required_designation': p.required_designation.name if p.required_designation else '',
                'required': req_headcount,
                'rostered': rostered_cnt,
                'vacant': vacant_cnt,
                'replacement_assigned': replacement_cnt,
                'final_covered': covered_cnt,
                'personnel': personnel
            })

        # Also account for general site roster duties not tied to a specific post
        unassigned_post_duties = [r for r in roster_list if str(r.shift_id) == sh_id_str and not r.post_id]
        if unassigned_post_duties:
            un_reg = [r for r in unassigned_post_duties if not r.is_replacement]
            un_rep = [r for r in unassigned_post_duties if r.is_replacement]
            shift_rostered_total += len(un_reg)
            shift_replacements_total += len(un_rep)
            shift_covered_total += len(un_reg) + len(un_rep)

            shift_posts_data.append({
                'post_id': None,
                'post_name': 'General Site Duty (No Post)',
                'post_code': 'GEN',
                'required_designation': '',
                'required': 0,
                'rostered': len(un_reg),
                'vacant': 0,
                'replacement_assigned': len(un_rep),
                'final_covered': len(un_reg) + len(un_rep),
                'personnel': [{
                    'roster_id': str(r.id),
                    'employee_id': str(r.employee.id),
                    'employee_name': r.employee.full_name or f"{r.employee.first_name} {r.employee.last_name}".strip(),
                    'employee_code': getattr(r.employee, 'employee_code', ''),
                    'designation_name': r.employee.designation.name if getattr(r.employee, 'designation', None) else '',
                    'is_replacement': r.is_replacement,
                    'original_employee_name': None,
                    'status': r.status,
                    'notes': r.notes
                } for r in unassigned_post_duties]
            })

        shifts_data.append({
            'shift_id': str(sh.id),
            'shift_name': sh.name,
            'shift_code': sh.code,
            'start_time': str(sh.start_time),
            'end_time': str(sh.end_time),
            'is_overnight': sh.is_overnight,
            'required': shift_req_total,
            'rostered': shift_rostered_total,
            'vacant': shift_vacant_total,
            'replacement_assigned': shift_replacements_total,
            'final_covered': shift_covered_total,
            'posts': shift_posts_data
        })

        total_site_required += shift_req_total
        total_site_rostered += shift_rostered_total
        total_site_vacant += shift_vacant_total
        total_site_replacements += shift_replacements_total
        total_site_covered += shift_covered_total

    return {
        'site_id': str(site.id),
        'site_name': site.name,
        'duty_date': date_obj.isoformat(),
        'required_strength': total_site_required,
        'rostered_strength': total_site_rostered,
        'vacancies': total_site_vacant,
        'replacement_coverage': total_site_replacements,
        'final_covered_strength': total_site_covered,
        'shifts': shifts_data
    }


def calculate_range_coverage(site_or_id, start_date, end_date):
    """
    Computes daily coverage matrix for a site across a date range.
    Suitable for weekly/monthly planning.
    """
    s_date = _parse_date(start_date)
    e_date = _parse_date(end_date)
    if s_date > e_date:
        s_date, e_date = e_date, s_date

    daily_results = []
    cur = s_date
    while cur <= e_date:
        day_summary = calculate_site_shift_coverage(site_or_id, cur)
        daily_results.append({
            'date': cur.isoformat(),
            'weekday': cur.strftime('%A'),
            'required_strength': day_summary['required_strength'],
            'rostered_strength': day_summary['rostered_strength'],
            'vacancies': day_summary['vacancies'],
            'replacement_coverage': day_summary['replacement_coverage'],
            'final_covered_strength': day_summary['final_covered_strength'],
            'shifts': [{
                'shift_id': s['shift_id'],
                'shift_name': s['shift_name'],
                'required': s['required'],
                'rostered': s['rostered'],
                'vacant': s['vacant'],
                'replacement_assigned': s['replacement_assigned'],
                'final_covered': s['final_covered']
            } for s in day_summary['shifts']]
        })
        cur += datetime.timedelta(days=1)

    site_name = site_or_id.name if isinstance(site_or_id, OperationalSite) else (
        OperationalSite.objects.filter(pk=site_or_id).values_list('name', flat=True).first() or ''
    )
    return {
        'site_id': str(site_or_id if not isinstance(site_or_id, OperationalSite) else site_or_id.id),
        'site_name': site_name,
        'start_date': s_date.isoformat(),
        'end_date': e_date.isoformat(),
        'days': daily_results
    }
