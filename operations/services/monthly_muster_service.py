import calendar
from collections import defaultdict
from datetime import date
from decimal import Decimal
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.core.exceptions import ValidationError

from erp_core.models import BaseModel
from operations.models import (
    OperationalSite, SecurityPost, Deployment, DailyDutyPay, DutyType,
    DailyPayRateSource, DailyPayCalculationStatus, DeploymentStatus,
    DeploymentAssignmentType
)
from hrm.models import Employee, WorkforceAttendance, AttendanceStatus, Designation
from operations.services.attendance_validation_service import AttendanceValidationService, normalize_attendance_code
import openpyxl


class MonthlyMusterService:
    """
    Dedicated Service Engine for the Security Operations Monthly Muster Grid,
    Excel Import, Cross-Location Anti-Cheating Validation, and Guard History Ledger.
    """

    @staticmethod
    def normalize_designation_code(name_or_title: str, explicit_code: str = '') -> str:
        """
        Normalizes any designation title or code into standardized industry badges:
        SUP, GD, CPO, LADY, CCTV, DEO, DVR, AG.
        """
        if explicit_code:
            c = str(explicit_code).strip().upper()
            if c in ['SUP', 'GD', 'CPO', 'LADY', 'CCTV', 'DEO', 'DVR', 'AG']:
                return c
            if 'SUP' in c:
                return 'SUP'
            if 'CPO' in c:
                return 'CPO'
            if 'LADY' in c:
                return 'LADY'
            if 'CCTV' in c:
                return 'CCTV'
            if 'DEO' in c:
                return 'DEO'

        title = (name_or_title or '').strip().lower()
        if 'supervisor' in title or 'sup' in title.split():
            return 'SUP'
        elif 'close protection' in title or 'cpo' in title.split() or 'cpo' in title:
            return 'CPO'
        elif 'lady' in title or 'searcher' in title:
            return 'LADY'
        elif 'cctv' in title:
            return 'CCTV'
        elif 'data entry' in title or 'deo' in title.split() or 'deo' in title:
            return 'DEO'
        elif 'driver' in title:
            return 'DVR'
        elif 'gunman' in title or 'armed guard' in title:
            return 'AG'
        else:
            return 'GD'

    @staticmethod
    def get_site_overtime_rate(site, desig=None, days_in_month=30, prefetched_lines=None, prefetched_posts=None, fallback_monthly_salary=None):
        """
        Active Overtime (O) rate.
        Strictly equals 1 full day's base salary for this requirement/deployment (monthly_pay_rate / days_in_month),
        identical to Present (P).
        """
        div = Decimal(str(days_in_month if days_in_month else 30))

        if isinstance(desig, (Decimal, int, float)) and not fallback_monthly_salary:
            fallback_monthly_salary = Decimal(str(desig))
            desig = None

        if not site:
            if fallback_monthly_salary:
                return (fallback_monthly_salary / div).quantize(Decimal('0.01'))
            return Decimal('0.00')
        company = site.company
        from security_crm.models import ProposalServiceLine
        from operations.models import SecurityPost

        # 1. Match lines by location to get guard_salary
        if prefetched_lines is not None:
            lines = prefetched_lines
        else:
            lines = list(ProposalServiceLine.objects.filter(
                company=company,
                location__name__iexact=site.name,
                is_deleted=False
            ).select_related('service_type'))
            if not lines and site.crm_entity:
                lines = list(ProposalServiceLine.objects.filter(
                    company=company,
                    location__customer=site.crm_entity,
                    is_deleted=False
                ).select_related('service_type'))

        if desig and lines:
            desig_name = (desig.name if hasattr(desig, 'name') else str(desig)).lower()
            for l in lines:
                st_name = (l.service_type.name if l.service_type else '').lower()
                if (desig_name in st_name or st_name in desig_name):
                    if l.guard_salary and l.guard_salary > Decimal('0.00'):
                        return (l.guard_salary / div).quantize(Decimal('0.01'))

        # Check any line's guard_salary
        for l in lines:
            if l.guard_salary and l.guard_salary > Decimal('0.00'):
                return (l.guard_salary / div).quantize(Decimal('0.01'))

        # 2. Match SecurityPost rate / days_in_month
        if prefetched_posts is not None:
            posts = prefetched_posts
        else:
            posts = list(SecurityPost.objects.filter(site=site, is_active=True, is_deleted=False))

        if desig:
            p_match = next((p for p in posts if p.required_designation_id == getattr(desig, 'id', None)), None)
            if p_match and p_match.monthly_pay_rate and p_match.monthly_pay_rate > Decimal('0.00'):
                return (p_match.monthly_pay_rate / div).quantize(Decimal('0.01'))

        p_first = posts[0] if posts else None
        if p_first and p_first.monthly_pay_rate and p_first.monthly_pay_rate > Decimal('0.00'):
            return (p_first.monthly_pay_rate / div).quantize(Decimal('0.01'))

        # 3. Fallback baseline: fallback_monthly_salary or 35,000 / days_in_month
        fallback_sal = fallback_monthly_salary or Decimal('35000.00')
        return (fallback_sal / div).quantize(Decimal('0.01'))

    @staticmethod
    def get_site_dozing_overtime_rate(site, desig=None, prefetched_lines=None, prefetched_posts=None):
        """
        Overtime Dozing (OD) rate.
        Pulls the manual overtime rate configured for this site and requirement in CRM ProposalServiceLine (single_ot_rate or double_ot_rate).
        Kept strictly manual as dozing shifts have customized rates.
        """
        if not site:
            return Decimal('0.00')
        company = site.company
        from security_crm.models import ProposalServiceLine

        if prefetched_lines is not None:
            lines = prefetched_lines
        else:
            lines = list(ProposalServiceLine.objects.filter(
                company=company,
                location__name__iexact=site.name,
                is_deleted=False
            ).select_related('service_type'))
            if not lines and site.crm_entity:
                lines = list(ProposalServiceLine.objects.filter(
                    company=company,
                    location__customer=site.crm_entity,
                    is_deleted=False
                ).select_related('service_type'))

        if desig and lines:
            desig_name = (desig.name if hasattr(desig, 'name') else str(desig)).lower()
            for l in lines:
                st_name = (l.service_type.name if l.service_type else '').lower()
                if (desig_name in st_name or st_name in desig_name):
                    ot = l.single_ot_rate or l.double_ot_rate
                    if ot and ot > Decimal('0.00'):
                        return ot

        for l in lines:
            ot = l.single_ot_rate or l.double_ot_rate
            if ot and ot > Decimal('0.00'):
                return ot

        return Decimal('0.00')

    @staticmethod
    def get_monthly_muster_grid(company, year: int, month: int, site_id=None):
        days_in_month = calendar.monthrange(year, month)[1]
        start_date = date(year, month, 1)
        end_date = date(year, month, days_in_month)
        today = timezone.now().date()
        is_current_month = (today.year == year and today.month == month)
        current_day = today.day if is_current_month else (32 if today > end_date else 0)

        # 1. Fetch active operational sites strictly mirroring active CRM entities and active locations
        from security_crm.models import ClientLocation, ProposalServiceLine

        sites_qs = list(OperationalSite.objects.filter(
            company=company, is_active=True, is_deleted=False
        ).select_related('crm_entity').order_by('name'))

        # Only keep sites belonging to an active CRM customer and matching an active ClientLocation
        active_locs_qs = list(ClientLocation.objects.filter(
            company=company, is_deleted=False, is_active=True
        ).values('customer_id', 'name'))
        
        entities_with_locations = set(str(l['customer_id']) for l in active_locs_qs if l.get('customer_id'))
        active_loc_pairs = {(str(l['customer_id']), l['name'].strip().lower()) for l in active_locs_qs if l.get('customer_id') and l.get('name')}

        valid_sites = []
        for s in sites_qs:
            if s.crm_entity:
                if s.crm_entity.is_deleted or not s.crm_entity.active:
                    continue
                c_id_str = str(s.crm_entity_id)
                if c_id_str in entities_with_locations:
                    if (c_id_str, s.name.strip().lower()) not in active_loc_pairs:
                        continue
            else:
                # Discard operational sites with no CRM entity in security operations
                continue
            valid_sites.append(s)

        sites_qs = valid_sites
        if site_id:
            sites_qs = [s for s in sites_qs if str(s.id) == str(site_id)]

        site_ids = [s.id for s in sites_qs]

        # 2. Pre-fetch company designations for quick lookup
        designation_map = {
            d.id: d.name for d in Designation.objects.filter(company=company)
        }
        sup_desig_default = Designation.objects.filter(company=company, name__icontains='supervisor', is_deleted=False).first()
        gd_desig_default = Designation.objects.filter(company=company, name__icontains='guard', is_deleted=False).first() or Designation.objects.filter(company=company, is_deleted=False).first()

        # 3. Bulk pre-fetch SecurityPosts and Deployments across all sites (avoids N+1 queries)
        all_posts = list(SecurityPost.objects.filter(
            site_id__in=site_ids, is_active=True, is_deleted=False
        ).exclude(
            service_contract__is_deleted=True
        ).exclude(
            service_contract__status='CANCELLED'
        ).select_related('required_designation'))
        posts_by_site = defaultdict(list)
        for p in all_posts:
            posts_by_site[p.site_id].append(p)

        all_deployments = list(Deployment.objects.filter(
            company=company,
            site_id__in=site_ids,
            is_deleted=False,
            start_date__lte=end_date
        ).filter(
            Q(end_date__isnull=True) | Q(end_date__gte=start_date)
        ).select_related('employee', 'employee__designation', 'designation', 'post', 'post__required_designation'))
        deployments_by_site = defaultdict(list)
        for dep in all_deployments:
            deployments_by_site[dep.site_id].append(dep)

        # 4. Bulk pre-fetch CRM ProposalServiceLines (only active proposals & active locations)
        all_service_lines = list(ProposalServiceLine.objects.filter(
            company=company,
            is_deleted=False,
            location__is_deleted=False,
            proposal_version__proposal__is_deleted=False
        ).select_related('service_type', 'location', 'location__customer'))
        lines_by_loc_name = defaultdict(list)
        lines_by_cust_id = defaultdict(list)
        for l in all_service_lines:
            if l.location and l.location.name:
                lines_by_loc_name[l.location.name.strip().lower()].append(l)
            if l.location and l.location.customer_id:
                lines_by_cust_id[str(l.location.customer_id)].append(l)

        # 5. Pre-fetch all attendances and daily duty pays for the whole month for this company
        attendances = WorkforceAttendance.objects.filter(
            company=company,
            date__gte=start_date,
            date__lte=end_date,
            is_deleted=False
        ).select_related('employee', 'site', 'post')

        duty_pays = DailyDutyPay.objects.filter(
            company=company,
            duty_date__gte=start_date,
            duty_date__lte=end_date,
            is_deleted=False
        ).select_related('employee', 'site')

        # Map: (employee_id, date) -> list of duties across all sites
        # Map: (employee_id, site_id, date) -> dict with 'primary', 'overtime', and 'overtime_dozing'
        global_duty_by_emp_date = defaultdict(list)
        duty_by_emp_site_date = defaultdict(lambda: {'primary': None, 'overtime': None, 'overtime_dozing': None, 'notes': ''})

        for att in attendances:
            key_global = (str(att.employee_id), att.date.day)
            global_duty_by_emp_date[key_global].append({
                'type': 'attendance',
                'status': att.status,
                'site_id': str(att.site_id) if att.site_id else None,
                'site_name': att.site.name if att.site else 'Central'
            })

            if att.site_id:
                key_site = (str(att.employee_id), str(att.site_id), att.date.day)
                entry = duty_by_emp_site_date[key_site]
                if att.status == AttendanceStatus.OVERTIME_DOZING:
                    entry['overtime_dozing'] = att
                elif att.status == AttendanceStatus.OVERTIME:
                    entry['overtime'] = att
                else:
                    if not entry['primary']:
                        entry['primary'] = att.status
                if att.notes and not entry['notes']:
                    entry['notes'] = att.notes

        for dp in duty_pays:
            key_global = (str(dp.employee_id), dp.duty_date.day)
            is_dozing = (dp.attendance_status == AttendanceStatus.OVERTIME_DOZING or 'dozing' in (dp.notes or '').lower())
            is_ot = (dp.duty_type == DutyType.OVERTIME or dp.attendance_status == AttendanceStatus.OVERTIME or dp.rate_source == 'OVERTIME' or 'overtime' in (dp.notes or '').lower())
            is_wp = (dp.attendance_status == AttendanceStatus.WORKED_WEEKLY_OFF or 'worked on week off' in (dp.notes or '').lower() or 'double shift' in (dp.notes or '').lower() or 'wo+ot' in (dp.notes or '').lower())

            global_duty_by_emp_date[key_global].append({
                'type': 'duty_pay',
                'duty_type': dp.duty_type,
                'status': dp.attendance_status,
                'is_ot': is_ot,
                'is_dozing': is_dozing,
                'is_wp': is_wp,
                'site_id': str(dp.site_id) if dp.site_id else None,
                'site_name': dp.site.name if dp.site else 'Unlinked',
                'amount': float(dp.payable_amount)
            })

            if dp.site_id:
                key_site = (str(dp.employee_id), str(dp.site_id), dp.duty_date.day)
                entry = duty_by_emp_site_date[key_site]
                if is_dozing:
                    entry['overtime_dozing'] = dp
                elif is_ot:
                    entry['overtime'] = dp
                else:
                    entry['primary'] = dp.attendance_status
                    entry['primary_dp'] = dp
                if dp.notes:
                    entry['notes'] = dp.notes

        # Pre-fetch any extra employees that have duty records outside their current deployment
        all_site_emp_ids_from_duties = {k[0] for k in duty_by_emp_site_date.keys()}
        all_deployed_emp_ids = {str(dep.employee_id) for dep in all_deployments if dep.employee_id}
        extra_emp_ids_needed = all_site_emp_ids_from_duties - all_deployed_emp_ids
        extra_emps_dict = {}
        if extra_emp_ids_needed:
            for emp in Employee.objects.filter(id__in=extra_emp_ids_needed, company=company, is_deleted=False).select_related('designation'):
                extra_emps_dict[str(emp.id)] = emp

        # 6. Process each site block in-memory (O(1) lookups)
        site_blocks = []

        for site in sites_qs:
            site_id_str = str(site.id)
            posts = posts_by_site.get(site.id, [])
            site_deployments = deployments_by_site.get(site.id, [])
            site_lines = lines_by_loc_name.get(site.name.strip().lower(), [])
            if not site_lines and site.crm_entity_id:
                site_lines = lines_by_cust_id.get(str(site.crm_entity_id), [])

            site_requirements = []
            supervisors_req = 0
            supervisors_sal = Decimal('0.00')
            guards_req = 0
            guards_sal = Decimal('0.00')
            overtime_rate = MonthlyMusterService.get_site_overtime_rate(
                site, days_in_month=days_in_month, prefetched_lines=site_lines, prefetched_posts=posts
            )
            dozing_overtime_rate = MonthlyMusterService.get_site_dozing_overtime_rate(
                site, prefetched_lines=site_lines, prefetched_posts=posts
            )

            # Deduplicate posts by required_designation_id / normalized title to prevent duplicate rows
            deduped_posts = []
            seen_post_keys = set()
            # Prioritize posts with active deployments or clean non-parenthesized names
            sorted_posts = sorted(
                posts,
                key=lambda p: (
                    0 if '(' not in (p.post_name or '') else 1,
                    -p.required_headcount
                )
            )
            for p in sorted_posts:
                key = str(p.required_designation_id) if p.required_designation_id else (p.post_name or '').strip().lower().replace('(', '').replace(')', '').replace('-', ' ').strip()
                if key in seen_post_keys:
                    continue
                seen_post_keys.add(key)
                deduped_posts.append(p)

            for p in deduped_posts:
                desig_obj = p.required_designation
                desig_title = desig_obj.name if desig_obj else (p.post_name or 'Security Guard')
                explicit_code = getattr(desig_obj, 'code', '') or ''
                desig_code = MonthlyMusterService.normalize_designation_code(desig_title, explicit_code)

                if desig_code == 'SUP':
                    supervisors_req += p.required_headcount
                    if p.monthly_pay_rate and p.monthly_pay_rate > supervisors_sal:
                        supervisors_sal = p.monthly_pay_rate
                elif desig_code == 'GD':
                    guards_req += p.required_headcount
                    if p.monthly_pay_rate and p.monthly_pay_rate > guards_sal:
                        guards_sal = p.monthly_pay_rate
                else:
                    if p.monthly_pay_rate and p.monthly_pay_rate > guards_sal:
                        guards_sal = p.monthly_pay_rate

                p_ot = MonthlyMusterService.get_site_overtime_rate(
                    site, desig=desig_obj, days_in_month=days_in_month, prefetched_lines=site_lines, prefetched_posts=posts
                )
                p_dozing_ot = MonthlyMusterService.get_site_dozing_overtime_rate(
                    site, desig=desig_obj, prefetched_lines=site_lines, prefetched_posts=posts
                )
                site_requirements.append({
                    'post_id': str(p.id),
                    'post_name': p.post_name,
                    'designation_id': str(desig_obj.id) if desig_obj else None,
                    'designation_code': desig_code,
                    'designation_name': desig_title,
                    'required_headcount': p.required_headcount,
                    'monthly_pay_rate': float(p.monthly_pay_rate or Decimal('35000.00')),
                    'overtime_rate': float(p_ot if p_ot > Decimal('0.00') else overtime_rate),
                    'dozing_overtime_rate': float(p_dozing_ot if p_dozing_ot > Decimal('0.00') else dozing_overtime_rate)
                })

            # If no posts are defined yet for this site, provide default selectable requirements:
            if not site_requirements:
                site_requirements = [
                    {
                        'post_id': None,
                        'post_name': 'General Security Guard',
                        'designation_id': str(gd_desig_default.id) if gd_desig_default else None,
                        'designation_code': 'GD',
                        'designation_name': gd_desig_default.name if gd_desig_default else 'Security Guard',
                        'required_headcount': guards_req or 0,
                        'monthly_pay_rate': float(guards_sal or Decimal('35000.00')),
                        'overtime_rate': float(overtime_rate),
                        'dozing_overtime_rate': float(dozing_overtime_rate)
                    },
                    {
                        'post_id': None,
                        'post_name': 'Site Supervisor',
                        'designation_id': str(sup_desig_default.id) if sup_desig_default else None,
                        'designation_code': 'SUP',
                        'designation_name': sup_desig_default.name if sup_desig_default else 'Security Supervisor',
                        'required_headcount': supervisors_req or 0,
                        'monthly_pay_rate': float(supervisors_sal or Decimal('45000.00')),
                        'overtime_rate': float(overtime_rate),
                        'dozing_overtime_rate': float(dozing_overtime_rate)
                    }
                ]

            # Find all employees who belong to this site for this month
            employee_dict = {}
            for dep in site_deployments:
                emp = dep.employee
                if emp and not emp.is_deleted:
                    is_perm = (dep.assignment_type == DeploymentAssignmentType.PERMANENT)
                    employee_dict[str(emp.id)] = {
                        'employee': emp,
                        'is_primary': is_perm,
                        'deployment': dep
                    }

            # Plus any employees who have attendance or duty pay recorded at this site
            site_emp_ids_from_duties = {
                k[0] for k in duty_by_emp_site_date.keys() if k[1] == site_id_str
            }
            extra_emp_ids = site_emp_ids_from_duties - set(employee_dict.keys())
            for extra_id in extra_emp_ids:
                emp = extra_emps_dict.get(extra_id)
                if emp:
                    employee_dict[extra_id] = {
                        'employee': emp,
                        'is_primary': False,
                        'deployment': None
                    }

            # Build guard rows
            guards_data = []
            daily_totals = {d: 0 for d in range(1, days_in_month + 1)}
            daily_vacations = {d: 0 for d in range(1, days_in_month + 1)}

            # Sort employees: Supervisors first (based on site deployment role), then by code
            def get_sort_key(x):
                dep = x.get('deployment')
                role_str = ''
                if dep and dep.designation:
                    role_str = dep.designation.name.lower()
                elif dep and dep.post and dep.post.required_designation:
                    role_str = dep.post.required_designation.name.lower()
                elif x['employee'].designation:
                    role_str = x['employee'].designation.name.lower()
                is_sup = 0 if 'supervisor' in role_str else 1
                return (is_sup, x['employee'].display_code or '')

            sorted_emps = sorted(employee_dict.values(), key=get_sort_key)

            for item in sorted_emps:
                emp = item['employee']
                emp_id_str = str(emp.id)
                dep = item.get('deployment')
                
                # PREFER DEPLOYMENT DESIGNATION/ROLE AT THIS SPECIFIC SITE
                desig_code_explicit = ''
                if dep and dep.designation:
                    desig_title = dep.designation.name
                    desig_code_explicit = getattr(dep.designation, 'code', '') or ''
                elif dep and dep.post and dep.post.required_designation:
                    desig_title = dep.post.required_designation.name
                    desig_code_explicit = getattr(dep.post.required_designation, 'code', '') or ''
                elif dep and dep.post and dep.post.post_name:
                    desig_title = dep.post.post_name
                else:
                    desig_title = emp.designation.name if emp.designation else 'Guard'
                    desig_code_explicit = getattr(emp.designation, 'code', '') or ''
                
                # Abbreviate designation for compact table badge
                desig_code = MonthlyMusterService.normalize_designation_code(desig_title, desig_code_explicit)

                days_map = {}
                count_p = 0
                count_ot = 0
                count_od = 0
                count_po = 0
                count_pod = 0
                count_wo = 0
                count_wp = 0
                count_a = 0
                count_l = 0

                for d in range(1, days_in_month + 1):
                    site_duty = duty_by_emp_site_date.get((emp_id_str, site_id_str, d))

                    code = ''
                    if site_duty:
                        has_prim = site_duty.get('primary') is not None
                        has_ot = site_duty.get('overtime') is not None
                        has_od = site_duty.get('overtime_dozing') is not None
                        prim_st = site_duty.get('primary')

                        if has_prim and has_od and prim_st in [AttendanceStatus.PRESENT, 'PRESENT', 'P']:
                            code = 'POD'
                            count_pod += 1
                            daily_totals[d] += 2
                        elif has_prim and has_ot and prim_st in [AttendanceStatus.PRESENT, 'PRESENT', 'P']:
                            code = 'PO'
                            count_po += 1
                            daily_totals[d] += 2
                        elif has_od and (not has_prim or prim_st in [AttendanceStatus.OVERTIME_DOZING, 'OVERTIME_DOZING', 'OD']):
                            code = 'OD'
                            count_od += 1
                            daily_totals[d] += 1
                        elif has_ot and (not has_prim or prim_st in [AttendanceStatus.OVERTIME, 'OVERTIME', 'O']):
                            code = 'O'
                            count_ot += 1
                            daily_totals[d] += 1
                        elif has_prim:
                            if prim_st in [AttendanceStatus.OVERTIME_DOZING, 'OVERTIME_DOZING', 'OD']:
                                code = 'OD'
                                count_od += 1
                                daily_totals[d] += 1
                            elif prim_st in [AttendanceStatus.OVERTIME, 'OVERTIME', 'O']:
                                code = 'O'
                                count_ot += 1
                                daily_totals[d] += 1
                            elif prim_st in [AttendanceStatus.WORKED_WEEKLY_OFF, 'WORKED_WEEKLY_OFF', 'WP', 'DOUBLE_SHIFT']:
                                code = 'WP'
                                count_wp += 1
                                daily_totals[d] += 1
                            elif prim_st in [AttendanceStatus.PRESENT, 'PRESENT', 'P']:
                                code = 'P'
                                count_p += 1
                                daily_totals[d] += 1
                            elif prim_st in [AttendanceStatus.WEEKLY_OFF, 'WEEKLY_OFF', 'WO']:
                                code = 'W'
                                count_wo += 1
                                daily_vacations[d] += 1
                            elif prim_st in [AttendanceStatus.ABSENT, 'ABSENT', 'A']:
                                code = 'A'
                                count_a += 1
                            elif prim_st in ['LEAVE', 'PAID_LEAVE', 'SICK_LEAVE', 'L', 'PL', AttendanceStatus.ON_LEAVE, AttendanceStatus.PAID_LEAVE, AttendanceStatus.UNPAID_LEAVE]:
                                code = 'L'
                                count_l += 1
                                daily_vacations[d] += 1
                    else:
                        code = ''

                    days_map[str(d)] = code

                guards_data.append({
                    'employee_id': emp_id_str,
                    'employee_code': emp.display_code,
                    'system_id': emp.system_id,
                    'name': f"{emp.first_name} {emp.last_name}".strip(),
                    'designation': desig_code,
                    'designation_full': desig_title,
                    'post_id': str(dep.post_id) if dep and dep.post_id else None,
                    'designation_id': str(dep.designation_id) if dep and dep.designation_id else None,
                    'is_primary': item['is_primary'],
                    'days': days_map,
                    'total_present': count_p + count_po + count_pod,
                    'total_ot': count_ot + count_po,
                    'total_od': count_od + count_pod,
                    'total_wo': count_wo,
                    'total_wp': count_wp,
                    'total_ds': count_wp,
                    'total_po': count_po,
                    'total_pod': count_pod,
                    'total_absent': count_a,
                    'total_leave': count_l,
                    'payable_days': count_p + count_po + count_pod + count_wo + (count_wp * 2),
                })

            site_blocks.append({
                'site_id': site_id_str,
                'site_name': site.name,
                'customer_name': site.crm_entity.name if site.crm_entity else 'Direct Client',
                'supervisors_req': supervisors_req,
                'supervisors_sal': float(supervisors_sal),
                'guards_req': guards_req,
                'guards_sal': float(guards_sal),
                'overtime_rate': float(overtime_rate),
                'dozing_overtime_rate': float(dozing_overtime_rate),
                'requirements': site_requirements,
                'guards': guards_data,
                'daily_totals': {str(k): v for k, v in daily_totals.items()},
                'daily_vacations': {str(k): v for k, v in daily_vacations.items()},
            })

        return {
            'year': year,
            'month': month,
            'days_in_month': days_in_month,
            'today_day': current_day if is_current_month else (days_in_month if today > end_date else 1),
            'sites': site_blocks
        }

    @staticmethod
    def save_monthly_muster_updates(company, user, year: int, month: int, updates: list, added_guards: list = None, removed_guards: list = None):
        """
        Atomically saves cell updates into WorkforceAttendance and DailyDutyPay.
        Enforces strict cross-location validation (AttendanceValidationService).
        Handles newly added guards and removed guards.
        """
        days_in_month = calendar.monthrange(year, month)[1]
        updates = updates or []
        added_guards = added_guards or []
        removed_guards = removed_guards or []

        # 1. Authoritative cross-location validation
        val_res = AttendanceValidationService.validate_monthly_muster_batch(
            company=company,
            year=year,
            month=month,
            updates=updates
        )
        normalized_updates = val_res.get('normalized_updates', [])

        with transaction.atomic():
            start_date = date(year, month, 1)
            end_date = date(year, month, days_in_month)

            # 2. Process Removed Guards
            for rm in removed_guards:
                rm_site_id = rm.get('site_id')
                rm_emp_id = rm.get('employee_id')
                if rm_site_id and rm_emp_id:
                    DailyDutyPay.objects.filter(
                        company=company,
                        site_id=rm_site_id,
                        employee_id=rm_emp_id,
                        duty_date__gte=start_date,
                        duty_date__lte=end_date
                    ).delete()

                    WorkforceAttendance.objects.filter(
                        company=company,
                        site_id=rm_site_id,
                        employee_id=rm_emp_id,
                        date__gte=start_date,
                        date__lte=end_date
                    ).delete()

                    Deployment.objects.filter(
                        company=company,
                        site_id=rm_site_id,
                        employee_id=rm_emp_id,
                        is_deleted=False
                    ).update(is_deleted=True)

            # 3. Process Added Guards
            for add_item in added_guards:
                add_site_id = add_item.get('site_id')
                add_emp_id = add_item.get('employee_id')
                add_post_id = add_item.get('post_id')
                add_desig_id = add_item.get('designation_id')
                add_pay_rate = add_item.get('monthly_pay_rate')

                if add_site_id and add_emp_id:
                    site_obj = OperationalSite.objects.filter(id=add_site_id, company=company).first()
                    emp_obj = Employee.objects.filter(id=add_emp_id, company=company).first()
                    if site_obj and emp_obj:
                        post_obj = None
                        if add_post_id:
                            post_obj = SecurityPost.objects.filter(id=add_post_id, site=site_obj, is_deleted=False).first()
                        if not post_obj:
                            post_obj = SecurityPost.objects.filter(site=site_obj, is_active=True, is_deleted=False).first()

                        contract_obj = post_obj.service_contract if post_obj else None

                        desig_obj = None
                        if add_desig_id:
                            desig_obj = Designation.objects.filter(id=add_desig_id, company=company, is_deleted=False).first()
                        if not desig_obj and post_obj and post_obj.required_designation:
                            desig_obj = post_obj.required_designation
                        if not desig_obj:
                            desig_obj = emp_obj.designation or Designation.objects.filter(company=company, is_deleted=False).first()

                        monthly_sal = Decimal(str(add_pay_rate)) if add_pay_rate else (
                            post_obj.monthly_pay_rate if (post_obj and post_obj.monthly_pay_rate) else None
                        )

                        emp_days = [
                            int(up['day']) for up in normalized_updates
                            if str(up.get('employee_id')) == str(add_emp_id)
                            and str(up.get('site_id')) == str(add_site_id)
                            and str(up.get('code', '')).strip()
                        ]
                        earliest_day = min(emp_days) if emp_days else 1
                        guard_start_date = date(year, month, earliest_day)

                        dep, created = Deployment.objects.get_or_create(
                            company=company,
                            site=site_obj,
                            employee=emp_obj,
                            is_deleted=False,
                            defaults={
                                'start_date': guard_start_date,
                                'assignment_type': DeploymentAssignmentType.TEMPORARY,
                                'status': DeploymentStatus.ACTIVE,
                                'post': post_obj,
                                'service_contract': contract_obj,
                                'designation': desig_obj,
                                'location_monthly_salary': monthly_sal,
                                'assigned_by': user if (user and user.is_authenticated) else None
                            }
                        )
                        if not created:
                            dep.status = DeploymentStatus.ACTIVE
                            update_cols = ['status']
                            if post_obj:
                                dep.post = post_obj
                                update_cols.append('post')
                            if desig_obj:
                                dep.designation = desig_obj
                                update_cols.append('designation')
                            if monthly_sal:
                                dep.location_monthly_salary = monthly_sal
                                update_cols.append('location_monthly_salary')
                            dep.save(update_fields=update_cols)

            # 4. Pre-fetch sites, employees, deployments to optimize processing
            site_ids = list({up['site_id'] for up in normalized_updates if up.get('site_id')})
            emp_ids = list({up['employee_id'] for up in normalized_updates if up.get('employee_id')})

            sites_map = {str(s.id): s for s in OperationalSite.objects.filter(id__in=site_ids, company=company).select_related('crm_entity')}
            emps_map = {str(e.id): e for e in Employee.objects.filter(id__in=emp_ids, company=company).select_related('designation')}
            deployments_qs = Deployment.objects.filter(
                company=company, site_id__in=site_ids, employee_id__in=emp_ids, is_deleted=False
            ).select_related('post', 'designation')
            deployments_map = {(str(d.site_id), str(d.employee_id)): d for d in deployments_qs}

            # 5. Process Normalized Cell Updates
            for up in normalized_updates:
                site_id = up.get('site_id')
                emp_id = up.get('employee_id')
                day = int(up.get('day'))
                code = up.get('code', '')
                target_date = date(year, month, day)

                site = sites_map.get(str(site_id))
                emp = emps_map.get(str(emp_id))
                if not site or not emp:
                    continue

                guard_dep = deployments_map.get((str(site.id), str(emp.id)))
                effective_post = guard_dep.post if guard_dep and guard_dep.post else None
                effective_desig = guard_dep.designation if guard_dep and guard_dep.designation else emp.designation

                if guard_dep and guard_dep.location_monthly_salary:
                    site_monthly_sal = guard_dep.location_monthly_salary
                elif effective_post and effective_post.monthly_pay_rate:
                    site_monthly_sal = effective_post.monthly_pay_rate
                else:
                    site_monthly_sal = Decimal('35000.00')

                daily_rate = (site_monthly_sal / Decimal(str(days_in_month))).quantize(Decimal('0.01'))
                # Active Overtime (O) rate strictly equals 1 full day base salary, identical to Present (P)
                ot_rate = daily_rate
                # Overtime Dozing (OD) rate strictly reads manual amount from CRM ProposalServiceLine
                dozing_ot_rate = MonthlyMusterService.get_site_dozing_overtime_rate(site, desig=effective_desig)

                if code == 'P':
                    # 1. Primary WorkforceAttendance
                    WorkforceAttendance.objects.update_or_create(
                        company=company,
                        employee=emp,
                        date=target_date,
                        status=AttendanceStatus.PRESENT,
                        defaults={
                            'site': site,
                            'is_finalized': True,
                            'recorded_by': user if (user and user.is_authenticated) else None,
                            'notes': f'Muster: Present at {site.name}'
                        }
                    )
                    # 2. Primary DailyDutyPay
                    DailyDutyPay.objects.update_or_create(
                        company=company,
                        employee=emp,
                        duty_date=target_date,
                        duty_type=DutyType.PRIMARY,
                        roster=None,
                        defaults={
                            'site': site,
                            'attendance_status': AttendanceStatus.PRESENT,
                            'client': site.crm_entity,
                            'daily_payable_rate': daily_rate,
                            'payable_percentage': Decimal('100.00'),
                            'payable_amount': daily_rate,
                            'calculation_status': DailyPayCalculationStatus.CALCULATED,
                            'notes': f'Muster: Primary Duty at {site.name}'
                        }
                    )
                    # Clean up overtime records at THIS site
                    DailyDutyPay.objects.filter(
                        company=company, employee=emp, duty_date=target_date, site=site, duty_type=DutyType.OVERTIME
                    ).delete()
                    WorkforceAttendance.objects.filter(
                        company=company, employee=emp, date=target_date, site=site, status__in=[AttendanceStatus.OVERTIME, AttendanceStatus.OVERTIME_DOZING]
                    ).delete()

                elif code == 'O':
                    # Standalone Active Overtime duty at this site (primary shift is at another location)
                    WorkforceAttendance.objects.update_or_create(
                        company=company,
                        employee=emp,
                        date=target_date,
                        status=AttendanceStatus.OVERTIME,
                        defaults={
                            'site': site,
                            'is_finalized': True,
                            'recorded_by': user if (user and user.is_authenticated) else None,
                            'notes': f'Muster: Active Overtime Shift at {site.name}'
                        }
                    )
                    DailyDutyPay.objects.update_or_create(
                        company=company,
                        employee=emp,
                        duty_date=target_date,
                        duty_type=DutyType.OVERTIME,
                        roster=None,
                        defaults={
                            'site': site,
                            'attendance_status': AttendanceStatus.OVERTIME,
                            'rate_source': DailyPayRateSource.POST_RATE,
                            'client': site.crm_entity,
                            'daily_payable_rate': daily_rate,
                            'payable_percentage': Decimal('100.00'),
                            'payable_amount': daily_rate,
                            'calculation_status': DailyPayCalculationStatus.CALCULATED,
                            'notes': f'Muster: Active Overtime Shift at {site.name}'
                        }
                    )
                    # Delete any primary duty pay at THIS site
                    DailyDutyPay.objects.filter(
                        company=company, employee=emp, duty_date=target_date, site=site, duty_type=DutyType.PRIMARY
                    ).delete()
                    # Delete any primary attendance or other OT attendance at THIS site
                    WorkforceAttendance.objects.filter(
                        company=company, employee=emp, date=target_date, site=site
                    ).exclude(status=AttendanceStatus.OVERTIME).delete()

                elif code == 'OD':
                    # Standalone Overtime Dozing duty at this site
                    WorkforceAttendance.objects.update_or_create(
                        company=company,
                        employee=emp,
                        date=target_date,
                        status=AttendanceStatus.OVERTIME_DOZING,
                        defaults={
                            'site': site,
                            'is_finalized': True,
                            'recorded_by': user if (user and user.is_authenticated) else None,
                            'notes': f'Muster: Overtime Dozing Shift at {site.name}'
                        }
                    )
                    DailyDutyPay.objects.update_or_create(
                        company=company,
                        employee=emp,
                        duty_date=target_date,
                        duty_type=DutyType.OVERTIME,
                        roster=None,
                        defaults={
                            'site': site,
                            'attendance_status': AttendanceStatus.OVERTIME_DOZING,
                            'rate_source': DailyPayRateSource.POST_RATE,
                            'client': site.crm_entity,
                            'daily_payable_rate': dozing_ot_rate,
                            'payable_percentage': Decimal('100.00'),
                            'payable_amount': dozing_ot_rate,
                            'calculation_status': DailyPayCalculationStatus.CALCULATED,
                            'notes': f'Muster: Overtime Dozing Shift at {site.name}'
                        }
                    )
                    # Delete any primary duty pay at THIS site
                    DailyDutyPay.objects.filter(
                        company=company, employee=emp, duty_date=target_date, site=site, duty_type=DutyType.PRIMARY
                    ).delete()
                    # Delete any primary attendance or other OT attendance at THIS site
                    WorkforceAttendance.objects.filter(
                        company=company, employee=emp, date=target_date, site=site
                    ).exclude(status=AttendanceStatus.OVERTIME_DOZING).delete()

                elif code == 'PO':
                    # Present + Active Overtime at the SAME site
                    WorkforceAttendance.objects.update_or_create(
                        company=company,
                        employee=emp,
                        date=target_date,
                        status=AttendanceStatus.PRESENT,
                        defaults={
                            'site': site,
                            'is_finalized': True,
                            'recorded_by': user if (user and user.is_authenticated) else None,
                            'notes': f'Muster: Present Shift at {site.name}'
                        }
                    )
                    WorkforceAttendance.objects.update_or_create(
                        company=company,
                        employee=emp,
                        date=target_date,
                        status=AttendanceStatus.OVERTIME,
                        defaults={
                            'site': site,
                            'is_finalized': True,
                            'recorded_by': user if (user and user.is_authenticated) else None,
                            'notes': f'Muster: Active Overtime Shift at {site.name}'
                        }
                    )
                    # Delete any leftover OVERTIME_DOZING attendance at this site
                    WorkforceAttendance.objects.filter(
                        company=company, employee=emp, date=target_date, site=site, status=AttendanceStatus.OVERTIME_DOZING
                    ).delete()
                    # 3. Primary DailyDutyPay
                    DailyDutyPay.objects.update_or_create(
                        company=company,
                        employee=emp,
                        duty_date=target_date,
                        duty_type=DutyType.PRIMARY,
                        roster=None,
                        defaults={
                            'site': site,
                            'attendance_status': AttendanceStatus.PRESENT,
                            'client': site.crm_entity,
                            'daily_payable_rate': daily_rate,
                            'payable_percentage': Decimal('100.00'),
                            'payable_amount': daily_rate,
                            'calculation_status': DailyPayCalculationStatus.CALCULATED,
                            'notes': f'Muster: Primary Shift at {site.name}'
                        }
                    )
                    # 4. Overtime DailyDutyPay (Active OT = daily_rate)
                    DailyDutyPay.objects.update_or_create(
                        company=company,
                        employee=emp,
                        duty_date=target_date,
                        duty_type=DutyType.OVERTIME,
                        roster=None,
                        defaults={
                            'site': site,
                            'attendance_status': AttendanceStatus.OVERTIME,
                            'rate_source': DailyPayRateSource.POST_RATE,
                            'client': site.crm_entity,
                            'daily_payable_rate': daily_rate,
                            'payable_percentage': Decimal('100.00'),
                            'payable_amount': daily_rate,
                            'calculation_status': DailyPayCalculationStatus.CALCULATED,
                            'notes': f'Muster: Active Overtime Shift at {site.name}'
                        }
                    )

                elif code == 'POD':
                    # Present + Overtime Dozing at the SAME site
                    WorkforceAttendance.objects.update_or_create(
                        company=company,
                        employee=emp,
                        date=target_date,
                        status=AttendanceStatus.PRESENT,
                        defaults={
                            'site': site,
                            'is_finalized': True,
                            'recorded_by': user if (user and user.is_authenticated) else None,
                            'notes': f'Muster: Present Shift at {site.name}'
                        }
                    )
                    WorkforceAttendance.objects.update_or_create(
                        company=company,
                        employee=emp,
                        date=target_date,
                        status=AttendanceStatus.OVERTIME_DOZING,
                        defaults={
                            'site': site,
                            'is_finalized': True,
                            'recorded_by': user if (user and user.is_authenticated) else None,
                            'notes': f'Muster: Overtime Dozing Shift at {site.name}'
                        }
                    )
                    # Delete any leftover active OVERTIME attendance at this site
                    WorkforceAttendance.objects.filter(
                        company=company, employee=emp, date=target_date, site=site, status=AttendanceStatus.OVERTIME
                    ).delete()
                    # 3. Primary DailyDutyPay
                    DailyDutyPay.objects.update_or_create(
                        company=company,
                        employee=emp,
                        duty_date=target_date,
                        duty_type=DutyType.PRIMARY,
                        roster=None,
                        defaults={
                            'site': site,
                            'attendance_status': AttendanceStatus.PRESENT,
                            'client': site.crm_entity,
                            'daily_payable_rate': daily_rate,
                            'payable_percentage': Decimal('100.00'),
                            'payable_amount': daily_rate,
                            'calculation_status': DailyPayCalculationStatus.CALCULATED,
                            'notes': f'Muster: Primary Shift at {site.name}'
                        }
                    )
                    # 4. Overtime DailyDutyPay (Dozing OT = dozing_ot_rate)
                    DailyDutyPay.objects.update_or_create(
                        company=company,
                        employee=emp,
                        duty_date=target_date,
                        duty_type=DutyType.OVERTIME,
                        roster=None,
                        defaults={
                            'site': site,
                            'attendance_status': AttendanceStatus.OVERTIME_DOZING,
                            'rate_source': DailyPayRateSource.POST_RATE,
                            'client': site.crm_entity,
                            'daily_payable_rate': dozing_ot_rate,
                            'payable_percentage': Decimal('100.00'),
                            'payable_amount': dozing_ot_rate,
                            'calculation_status': DailyPayCalculationStatus.CALCULATED,
                            'notes': f'Muster: Overtime Dozing Shift at {site.name}'
                        }
                    )

                elif code == 'WP':
                    # Worked on Week Off (Policy A: Double Pay = Base + Base = 2x daily rate)
                    wp_total_pay = (daily_rate * Decimal('2.00')).quantize(Decimal('0.01'))
                    WorkforceAttendance.objects.update_or_create(
                        company=company,
                        employee=emp,
                        date=target_date,
                        status=AttendanceStatus.WORKED_WEEKLY_OFF,
                        defaults={
                            'site': site,
                            'is_finalized': True,
                            'recorded_by': user if (user and user.is_authenticated) else None,
                            'notes': f'Muster: Worked on Week Off at {site.name}'
                        }
                    )
                    DailyDutyPay.objects.update_or_create(
                        company=company,
                        employee=emp,
                        duty_date=target_date,
                        duty_type=DutyType.PRIMARY,
                        roster=None,
                        defaults={
                            'site': site,
                            'attendance_status': AttendanceStatus.WORKED_WEEKLY_OFF,
                            'rate_source': DailyPayRateSource.POST_RATE,
                            'client': site.crm_entity,
                            'daily_payable_rate': daily_rate,
                            'payable_percentage': Decimal('200.00'),
                            'payable_amount': wp_total_pay,
                            'calculation_status': DailyPayCalculationStatus.CALCULATED,
                            'notes': f'Muster: Worked on Week Off (Double Pay: Base {daily_rate} + Base {daily_rate}) at {site.name}'
                        }
                    )
                    DailyDutyPay.objects.filter(
                        company=company, employee=emp, duty_date=target_date, site=site, duty_type=DutyType.OVERTIME
                    ).delete()
                    WorkforceAttendance.objects.filter(
                        company=company, employee=emp, date=target_date, site=site, status__in=[AttendanceStatus.OVERTIME, AttendanceStatus.OVERTIME_DOZING]
                    ).delete()

                elif code == 'W':
                    # Scheduled Weekly Off (Base salary covers this day; 100% daily rate)
                    WorkforceAttendance.objects.update_or_create(
                        company=company,
                        employee=emp,
                        date=target_date,
                        status=AttendanceStatus.WEEKLY_OFF,
                        defaults={
                            'site': site,
                            'is_finalized': True,
                            'recorded_by': user if (user and user.is_authenticated) else None,
                            'notes': f'Muster: Scheduled Weekly Off at {site.name}'
                        }
                    )
                    DailyDutyPay.objects.update_or_create(
                        company=company,
                        employee=emp,
                        duty_date=target_date,
                        duty_type=DutyType.PRIMARY,
                        roster=None,
                        defaults={
                            'site': site,
                            'attendance_status': AttendanceStatus.WEEKLY_OFF,
                            'client': site.crm_entity,
                            'daily_payable_rate': daily_rate,
                            'payable_percentage': Decimal('100.00'),
                            'payable_amount': daily_rate,
                            'calculation_status': DailyPayCalculationStatus.CALCULATED,
                            'notes': f'Muster: Scheduled Weekly Off at {site.name}'
                        }
                    )
                    DailyDutyPay.objects.filter(
                        company=company, employee=emp, duty_date=target_date, site=site, duty_type=DutyType.OVERTIME
                    ).delete()
                    WorkforceAttendance.objects.filter(
                        company=company, employee=emp, date=target_date, site=site, status__in=[AttendanceStatus.OVERTIME, AttendanceStatus.OVERTIME_DOZING]
                    ).delete()

                elif code == 'A':
                    # Genuine Absence (0% payable)
                    WorkforceAttendance.objects.update_or_create(
                        company=company,
                        employee=emp,
                        date=target_date,
                        status=AttendanceStatus.ABSENT,
                        defaults={
                            'site': site,
                            'is_finalized': True,
                            'recorded_by': user if (user and user.is_authenticated) else None,
                            'notes': f'Muster: Absent at {site.name}'
                        }
                    )
                    DailyDutyPay.objects.update_or_create(
                        company=company,
                        employee=emp,
                        duty_date=target_date,
                        duty_type=DutyType.PRIMARY,
                        roster=None,
                        defaults={
                            'site': site,
                            'attendance_status': AttendanceStatus.ABSENT,
                            'client': site.crm_entity,
                            'daily_payable_rate': daily_rate,
                            'payable_percentage': Decimal('0.00'),
                            'payable_amount': Decimal('0.00'),
                            'calculation_status': DailyPayCalculationStatus.CALCULATED,
                            'notes': f'Muster: Absent at {site.name}'
                        }
                    )
                    DailyDutyPay.objects.filter(
                        company=company, employee=emp, duty_date=target_date, site=site, duty_type=DutyType.OVERTIME
                    ).delete()
                    WorkforceAttendance.objects.filter(
                        company=company, employee=emp, date=target_date, site=site, status__in=[AttendanceStatus.OVERTIME, AttendanceStatus.OVERTIME_DOZING]
                    ).delete()

                elif code == 'L':
                    # Unpaid Leave (0% payable)
                    WorkforceAttendance.objects.update_or_create(
                        company=company,
                        employee=emp,
                        date=target_date,
                        status=AttendanceStatus.UNPAID_LEAVE,
                        defaults={
                            'site': site,
                            'is_finalized': True,
                            'recorded_by': user if (user and user.is_authenticated) else None,
                            'notes': f'Muster: Unpaid Leave at {site.name}'
                        }
                    )
                    DailyDutyPay.objects.update_or_create(
                        company=company,
                        employee=emp,
                        duty_date=target_date,
                        duty_type=DutyType.PRIMARY,
                        roster=None,
                        defaults={
                            'site': site,
                            'attendance_status': AttendanceStatus.UNPAID_LEAVE,
                            'client': site.crm_entity,
                            'daily_payable_rate': daily_rate,
                            'payable_percentage': Decimal('0.00'),
                            'payable_amount': Decimal('0.00'),
                            'calculation_status': DailyPayCalculationStatus.CALCULATED,
                            'notes': f'Muster: Unpaid Leave at {site.name}'
                        }
                    )
                    DailyDutyPay.objects.filter(
                        company=company, employee=emp, duty_date=target_date, site=site, duty_type=DutyType.OVERTIME
                    ).delete()
                    WorkforceAttendance.objects.filter(
                        company=company, employee=emp, date=target_date, site=site, status__in=[AttendanceStatus.OVERTIME, AttendanceStatus.OVERTIME_DOZING]
                    ).delete()

                elif code == '':
                    # Cleared cell: remove duty pay ONLY for THIS site!
                    DailyDutyPay.objects.filter(
                        company=company, employee=emp, duty_date=target_date, site=site
                    ).delete()

                    # Remove attendance records recorded for this site
                    WorkforceAttendance.objects.filter(
                        company=company, employee=emp, date=target_date, site=site
                    ).delete()

                    # If guard has remaining duty at another site on this date, ensure primary attendance is synced
                    other_site_duty = DailyDutyPay.objects.filter(
                        company=company, employee=emp, duty_date=target_date, duty_type=DutyType.PRIMARY
                    ).exclude(site=site).first()

                    if other_site_duty:
                        WorkforceAttendance.objects.update_or_create(
                            company=company,
                            employee=emp,
                            date=target_date,
                            status=other_site_duty.attendance_status,
                            defaults={
                                'site': other_site_duty.site,
                                'is_finalized': True,
                                'recorded_by': user if (user and user.is_authenticated) else None,
                                'notes': f'Muster: Synchronized from primary duty at {other_site_duty.site.name if other_site_duty.site else "Other Site"}'
                            }
                        )

        return {'status': 'success', 'saved_updates': len(normalized_updates), 'added_guards': len(added_guards), 'removed_guards': len(removed_guards)}

    @staticmethod
    def import_monthly_muster_excel(company, user, file_obj, year: int, month: int):
        """
        Reads legacy Excel workbook matching the screenshot.
        Detects Location Green Headers, matches sites, reads guard codes,
        and translates cells 1..31.
        """
        wb = openpyxl.load_workbook(file_obj, data_only=True)
        sheet = wb.active
        days_in_month = calendar.monthrange(year, month)[1]
        today = timezone.now().date()
        is_current_month = (today.year == year and today.month == month)
        current_day = today.day if is_current_month else (32 if today > date(year, month, days_in_month) else 0)

        all_sites = list(OperationalSite.objects.filter(company=company, is_deleted=False))
        all_emps = {}
        for e in Employee.objects.filter(company=company, is_deleted=False):
            if e.previous_employee_code:
                c_str = str(e.previous_employee_code).strip()
                all_emps[c_str] = e
                if c_str.isdigit():
                    all_emps[c_str.zfill(6)] = e
                    all_emps[c_str.lstrip('0')] = e
            if e.employee_code:
                all_emps[str(e.employee_code).strip()] = e

        updates_to_save = []
        current_site = None
        imported_sites = set()
        imported_guards = set()

        for row in sheet.iter_rows(values_only=True):
            if not row or not any(row):
                continue

            first_cell = str(row[0] or '').strip()
            # Check if this row is a site header banner
            # In Excel, site header usually appears in Col 0, 1 or 2 with green bar or text
            row_str = " ".join([str(c or '').strip() for c in row[:5]]).strip()

            matched_site = None
            for s in all_sites:
                if s.name.lower() in row_str.lower():
                    matched_site = s
                    break

            if matched_site:
                current_site = matched_site
                imported_sites.add(matched_site.name)
                continue

            if not current_site:
                continue

            # Check if this is a guard row:
            # Typically Col 1 = Code, Col 2 = Desig, Col 3 = Name, or Col 0 = Code
            emp_code = ''
            for cell_val in row[:4]:
                c_str = str(cell_val or '').strip()
                if c_str in all_emps:
                    emp_code = c_str
                    break

            if not emp_code:
                continue

            emp = all_emps.get(emp_code)
            if not emp:
                continue

            imported_guards.add(emp_code)

            # Determine where day 1 starts:
            # In sheet screenshot: Col A (#), Col B (Code), Col C (Desig), Col D (Name), Col E (CNIC/Remarks), Col F or G starts Day 1
            # Let's find day 1 column dynamically:
            day_start_col = 5  # default
            for col_idx in range(4, min(10, len(row))):
                val = row[col_idx]
                if str(val).strip() in ['1', 'P', 'p', '0', 'A', 'WO', 'None', '']:
                    day_start_col = col_idx
                    break

            # Read days 1 to days_in_month
            for d in range(1, days_in_month + 1):
                col_idx = day_start_col + (d - 1)
                if col_idx >= len(row):
                    break
                cell_val = str(row[col_idx] or '').strip().upper()

                code = normalize_attendance_code(cell_val)

                if code:
                    updates_to_save.append({
                        'site_id': str(current_site.id),
                        'employee_id': str(emp.id),
                        'day': d,
                        'code': code
                    })

        # Save all updates
        result = MonthlyMusterService.save_monthly_muster_updates(
            company=company,
            user=user,
            year=year,
            month=month,
            updates=updates_to_save
        )

        return {
            'status': 'success',
            'sites_imported': len(imported_sites),
            'guards_imported': len(imported_guards),
            'duties_imported': len(updates_to_save),
            'sites_list': list(imported_sites)
        }

    @staticmethod
    def get_guard_attendance_ledger(company, employee_id: str, year: int = None, month: int = None, date_from=None, date_to=None):
        """
        Provides detailed historical duty & overtime ledger for an individual guard.
        Shows which locations they worked at across dates, with daily wage amounts.
        """
        emp = Employee.objects.filter(id=employee_id, company=company, is_deleted=False).select_related('designation').first()
        if not emp:
            raise ValidationError("Employee not found.")

        if year and month:
            days_in_month = calendar.monthrange(year, month)[1]
            start_date = date(year, month, 1)
            end_date = date(year, month, days_in_month)
        elif date_from and date_to:
            start_date = date_from
            end_date = date_to
        else:
            now = timezone.now().date()
            start_date = date(now.year, now.month, 1)
            end_date = date(now.year, now.month, calendar.monthrange(now.year, now.month)[1])

        duty_pays = DailyDutyPay.objects.filter(
            company=company,
            employee=emp,
            duty_date__gte=start_date,
            duty_date__lte=end_date,
            is_deleted=False
        ).select_related('site', 'client').order_by('duty_date')

        attendances = WorkforceAttendance.objects.filter(
            company=company,
            employee=emp,
            date__gte=start_date,
            date__lte=end_date,
            is_deleted=False
        ).select_related('site').order_by('date')

        ledger_records = []
        total_days_worked = 0
        total_ot_shifts = 0
        total_ot_dozing_shifts = 0
        total_double_shifts = 0
        total_earned = Decimal('0.00')

        # Map by date
        date_records = {}
        for dp in duty_pays:
            d_str = str(dp.duty_date)
            if d_str not in date_records:
                date_records[d_str] = []
            
            is_ot_dozing = (dp.attendance_status == AttendanceStatus.OVERTIME_DOZING)
            is_ot = (dp.attendance_status == AttendanceStatus.OVERTIME or dp.rate_source == 'OVERTIME' or dp.duty_type == DutyType.OVERTIME)
            is_ds = (dp.attendance_status in [AttendanceStatus.DOUBLE_SHIFT, AttendanceStatus.WORKED_WEEKLY_OFF, 'DOUBLE_SHIFT', 'WORKED_WEEKLY_OFF'])
            is_leave = (dp.attendance_status in [AttendanceStatus.UNPAID_LEAVE, AttendanceStatus.PAID_LEAVE, AttendanceStatus.ON_LEAVE, 'UNPAID_LEAVE', 'PAID_LEAVE', 'LEAVE'])
            is_absent = (dp.attendance_status in [AttendanceStatus.ABSENT, 'ABSENT'])
            is_wo = (dp.attendance_status in [AttendanceStatus.WEEKLY_OFF, 'WEEKLY_OFF'])
            
            if is_ot_dozing:
                total_ot_dozing_shifts += 1
                record_duty_type = 'OVERTIME_DOZING'
            elif is_ot:
                total_ot_shifts += 1
                record_duty_type = 'OVERTIME'
            elif is_ds:
                total_double_shifts += 1
                total_days_worked += 1
                record_duty_type = 'WORKED_WEEKLY_OFF'
            elif is_leave:
                record_duty_type = 'UNPAID_LEAVE'
            elif is_absent:
                record_duty_type = 'ABSENT'
            elif is_wo:
                record_duty_type = 'WEEKLY_OFF'
            else:
                total_days_worked += 1
                record_duty_type = 'PRESENT'

            total_earned += dp.payable_amount

            date_records[d_str].append({
                'date': d_str,
                'site_name': dp.site.name if dp.site else 'Central',
                'customer_name': dp.client.name if dp.client else '',
                'duty_type': record_duty_type,
                'amount': float(dp.payable_amount),
                'notes': dp.notes or ''
            })

        for att in attendances:
            d_str = str(att.date)
            if att.status in [AttendanceStatus.WEEKLY_OFF, AttendanceStatus.ABSENT, AttendanceStatus.PAID_LEAVE, AttendanceStatus.ON_LEAVE, AttendanceStatus.UNPAID_LEAVE]:
                if d_str not in date_records:
                    date_records[d_str] = []
                    cust_name = ''
                    if att.site and getattr(att.site, 'crm_entity', None):
                        cust_name = att.site.crm_entity.name
                    date_records[d_str].append({
                        'date': d_str,
                        'site_name': att.site.name if att.site else 'Central',
                        'customer_name': cust_name,
                        'duty_type': att.status,
                        'amount': 0.00,
                        'notes': att.notes or ''
                    })

        sorted_days = sorted(date_records.keys())
        for d in sorted_days:
            ledger_records.extend(date_records[d])

        return {
            'employee_id': str(emp.id),
            'employee_code': emp.display_code,
            'system_id': emp.system_id,
            'name': f"{emp.first_name} {emp.last_name}".strip(),
            'designation': emp.designation.name if emp.designation else 'Guard',
            'period_start': str(start_date),
            'period_end': str(end_date),
            'total_days_worked': total_days_worked,
            'total_ot_shifts': total_ot_shifts,
            'total_ot_dozing_shifts': total_ot_dozing_shifts,
            'total_double_shifts': total_double_shifts,
            'total_earned_pkr': float(total_earned),
            'records': ledger_records
        }
