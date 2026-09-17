import datetime
from decimal import Decimal
from django.db.models import Count, Q, Sum
from django.utils import timezone

from companies.models import Company
from hrm.models import (
    Employee, EmploymentHistory,
    WorkforceAttendance, AttendanceStatus,
    JumpRecord, JumpRecordStatus,
    Shift, PayrollRun, PayrollRunStatus, Payslip, PayslipStatus
)
from operations.models import (
    OperationalSite, SecurityPost, ServiceContract,
    Deployment, DeploymentStatus,
    DutyRoster, DutyRosterStatus, DutyReplacement,
    DailyDutyPay, DailyPayCalculationStatus,
    EmployeePayrollCalculation, PayrollCalculationStatus
)
from operations.services.manpower import calculate_site_manpower
from operations.services.roster_coverage import calculate_site_shift_coverage
from operations.services.attendance_service import (
    resolve_effective_attendance_status,
    calculate_consecutive_absent_days
)


def _parse_date(date_val):
    if isinstance(date_val, str):
        return datetime.date.fromisoformat(date_val)
    elif isinstance(date_val, (datetime.datetime, datetime.date)):
        return date_val if isinstance(date_val, datetime.date) else date_val.date()
    return timezone.now().date()


class ControlCenterService:
    """
    Phase S-5I: Aggregation engine for Security Workforce + Core Operations Control Center.
    Composes authoritative existing services and models with zero duplicate calculation engines.
    Provides batch in-memory aggregation to avoid N+1 queries.
    """

    @classmethod
    def get_workforce_summary(cls, company_id, classification=None, designation_id=None, department_id=None, employment_status=None):
        """
        Computes workforce strength, classification distribution, and employment status metrics.
        """
        qs = Employee.objects.filter(company_id=company_id, is_deleted=False)

        if classification:
            qs = qs.filter(classification=classification)
        if designation_id:
            qs = qs.filter(designation_id=designation_id)
        if department_id:
            qs = qs.filter(department_id=department_id)
        if employment_status:
            qs = qs.filter(employment_status=employment_status)

        total = qs.count()
        direct = qs.filter(classification='DIRECT').count()
        indirect = qs.filter(classification='INDIRECT').count()
        active = qs.filter(employment_status='ACTIVE').count()
        suspended = qs.filter(employment_status='SUSPENDED').count()
        jump = qs.filter(employment_status='JUMP').count()
        resigned = qs.filter(employment_status='RESIGNED').count()
        terminated = qs.filter(employment_status='TERMINATED').count()

        # Designation breakdown
        desig_counts = qs.filter(designation__isnull=False).values(
            'designation_id', 'designation__name'
        ).annotate(count=Count('id')).order_by('-count')[:10]

        # Department breakdown
        dept_counts = qs.filter(department__isnull=False).values(
            'department_id', 'department__name'
        ).annotate(count=Count('id')).order_by('-count')[:10]

        return {
            'total_employees': total,
            'direct_count': direct,
            'indirect_count': indirect,
            'active_count': active,
            'suspended_count': suspended,
            'jump_count': jump,
            'resigned_count': resigned,
            'terminated_count': terminated,
            'designation_breakdown': [
                {'id': str(d['designation_id']), 'name': d['designation__name'], 'count': d['count']}
                for d in desig_counts
            ],
            'department_breakdown': [
                {'id': str(d['department_id']), 'name': d['department__name'], 'count': d['count']}
                for d in dept_counts
            ]
        }

    @classmethod
    def get_manpower_summary(cls, company_id, client_id=None, contract_id=None, site_id=None, designation_id=None):
        """
        Aggregates manpower requirement vs deployment across sites and posts.
        Directly conforms to S-5B manpower logic.
        """
        sites_qs = OperationalSite.objects.filter(
            company_id=company_id, is_active=True, is_deleted=False
        ).select_related('crm_entity')

        if client_id:
            sites_qs = sites_qs.filter(crm_entity_id=client_id)
        if site_id:
            sites_qs = sites_qs.filter(pk=site_id)
        if contract_id:
            sites_qs = sites_qs.filter(service_contracts__id=contract_id).distinct()

        posts_qs = SecurityPost.objects.filter(
            site__in=sites_qs, is_active=True, is_deleted=False
        ).select_related('site', 'required_designation')

        if designation_id:
            posts_qs = posts_qs.filter(required_designation_id=designation_id)

        deployments_qs = Deployment.objects.filter(
            company_id=company_id,
            site__in=sites_qs,
            status=DeploymentStatus.ACTIVE,
            is_deleted=False
        ).select_related('employee', 'site', 'post')

        if designation_id:
            deployments_qs = deployments_qs.filter(designation_id=designation_id)

        # Batch in-memory grouping
        post_deployed_counts = {}
        site_deployed_counts = {}
        for d in deployments_qs:
            s_id = str(d.site_id)
            site_deployed_counts[s_id] = site_deployed_counts.get(s_id, 0) + 1
            if d.post_id:
                p_id = str(d.post_id)
                post_deployed_counts[p_id] = post_deployed_counts.get(p_id, 0) + 1

        total_required = 0
        vacant_posts = []
        shortage_sites = []
        site_required_map = {}

        for p in posts_qs:
            total_required += p.required_headcount
            p_id = str(p.id)
            s_id = str(p.site_id)
            site_required_map[s_id] = site_required_map.get(s_id, 0) + p.required_headcount

            dep_cnt = post_deployed_counts.get(p_id, 0)
            if dep_cnt < p.required_headcount:
                vacant_posts.append({
                    'post_id': p_id,
                    'post_name': p.post_name,
                    'site_id': s_id,
                    'site_name': p.site.name,
                    'required_headcount': p.required_headcount,
                    'deployed_headcount': dep_cnt,
                    'vacancies': p.required_headcount - dep_cnt,
                    'required_designation_name': p.required_designation.name if p.required_designation else ''
                })

        total_deployed = sum(site_deployed_counts.values())

        for s in sites_qs:
            s_id = str(s.id)
            s_req = site_required_map.get(s_id, 0)
            s_dep = site_deployed_counts.get(s_id, 0)
            if s_dep < s_req:
                shortage_sites.append({
                    'site_id': s_id,
                    'site_name': s.name,
                    'client_name': s.crm_entity.name if s.crm_entity else 'N/A',
                    'required': s_req,
                    'deployed': s_dep,
                    'vacancies': s_req - s_dep
                })

        total_vacancies = max(0, total_required - total_deployed)
        total_overstaffing = max(0, total_deployed - total_required)

        return {
            'required_strength': total_required,
            'deployed_strength': total_deployed,
            'vacancies': total_vacancies,
            'overstaffing': total_overstaffing,
            'shortage_sites_count': len(shortage_sites),
            'shortage_sites': shortage_sites,
            'vacant_posts_count': len(vacant_posts),
            'vacant_posts': vacant_posts
        }

    @classmethod
    def get_roster_coverage_summary(cls, company_id, target_date=None, client_id=None, contract_id=None, site_id=None, shift_id=None):
        """
        Computes today's duty roster coverage across shifts, posts, and sites.
        Reuses S-5C roster coverage methodology.
        """
        d = _parse_date(target_date)

        sites_qs = OperationalSite.objects.filter(
            company_id=company_id, is_active=True, is_deleted=False
        ).select_related('crm_entity')

        if client_id:
            sites_qs = sites_qs.filter(crm_entity_id=client_id)
        if site_id:
            sites_qs = sites_qs.filter(pk=site_id)
        if contract_id:
            sites_qs = sites_qs.filter(service_contracts__id=contract_id).distinct()

        # Shifts
        shifts_qs = Shift.objects.filter(company_id=company_id, is_active=True, is_deleted=False)
        if shift_id:
            shifts_qs = shifts_qs.filter(pk=shift_id)
        shifts = list(shifts_qs)

        # Duty rosters on target_date
        rosters_qs = DutyRoster.objects.filter(
            company_id=company_id,
            site__in=sites_qs,
            duty_date=d,
            status__in=[DutyRosterStatus.SCHEDULED, DutyRosterStatus.COMPLETED],
            is_deleted=False
        ).select_related('employee', 'shift', 'site', 'post')

        if shift_id:
            rosters_qs = rosters_qs.filter(shift_id=shift_id)

        roster_list = list(rosters_qs)

        # Compute requirements from posts and post shift requirements
        from operations.models import PostShiftRequirement
        posts = SecurityPost.objects.filter(
            site__in=sites_qs, is_active=True, is_deleted=False
        ).select_related('site')

        post_reqs = PostShiftRequirement.objects.filter(
            post__in=posts, is_active=True, is_deleted=False
        ).select_related('shift', 'post')

        req_map = {}
        posts_with_any_req = set()
        for pr in post_reqs:
            req_map[(str(pr.post_id), str(pr.shift_id))] = pr.required_headcount
            posts_with_any_req.add(str(pr.post_id))

        shift_summary_map = {}
        for sh in shifts:
            shift_summary_map[str(sh.id)] = {
                'shift_id': str(sh.id),
                'shift_name': sh.name,
                'required': 0,
                'rostered': 0,
                'replacement': 0,
                'uncovered': 0,
                'coverage_pct': 100.0
            }

        site_summary_map = {}
        for s in sites_qs:
            site_summary_map[str(s.id)] = {
                'site_id': str(s.id),
                'site_name': s.name,
                'client_name': s.crm_entity.name if s.crm_entity else 'N/A',
                'required': 0,
                'rostered': 0,
                'replacement': 0,
                'uncovered': 0,
                'coverage_pct': 100.0
            }

        total_required = 0
        for sh in shifts:
            sh_id_str = str(sh.id)
            for p in posts:
                p_id_str = str(p.id)
                s_id_str = str(p.site_id)
                if (p_id_str, sh_id_str) in req_map:
                    headcount = req_map[(p_id_str, sh_id_str)]
                elif p_id_str in posts_with_any_req:
                    headcount = 0
                else:
                    headcount = p.required_headcount

                total_required += headcount
                if sh_id_str in shift_summary_map:
                    shift_summary_map[sh_id_str]['required'] += headcount
                if s_id_str in site_summary_map:
                    site_summary_map[s_id_str]['required'] += headcount

        total_rostered = 0
        total_replacement = 0
        cross_site_count = 0

        # Pre-fetch home deployments for cross-site checks
        emp_ids = [r.employee_id for r in roster_list if r.employee_id]
        home_deployments = {
            str(dep.employee_id): str(dep.site_id)
            for dep in Deployment.objects.filter(
                company_id=company_id,
                employee_id__in=emp_ids,
                status=DeploymentStatus.ACTIVE,
                is_deleted=False
            )
        }

        for r in roster_list:
            s_id_str = str(r.site_id)
            sh_id_str = str(r.shift_id) if r.shift_id else None

            is_rep = r.is_replacement
            if is_rep:
                total_replacement += 1
                if sh_id_str and sh_id_str in shift_summary_map:
                    shift_summary_map[sh_id_str]['replacement'] += 1
                if s_id_str in site_summary_map:
                    site_summary_map[s_id_str]['replacement'] += 1

                # Check if cross-site replacement
                home_site = home_deployments.get(str(r.employee_id))
                if home_site and home_site != s_id_str:
                    cross_site_count += 1
            else:
                total_rostered += 1
                if sh_id_str and sh_id_str in shift_summary_map:
                    shift_summary_map[sh_id_str]['rostered'] += 1
                if s_id_str in site_summary_map:
                    site_summary_map[s_id_str]['rostered'] += 1

        total_covered = total_rostered + total_replacement
        total_uncovered = max(0, total_required - total_covered)

        for s_data in shift_summary_map.values():
            cov = s_data['rostered'] + s_data['replacement']
            s_data['uncovered'] = max(0, s_data['required'] - cov)
            s_data['coverage_pct'] = round((cov / s_data['required'] * 100), 1) if s_data['required'] > 0 else 100.0

        for s_data in site_summary_map.values():
            cov = s_data['rostered'] + s_data['replacement']
            s_data['uncovered'] = max(0, s_data['required'] - cov)
            s_data['coverage_pct'] = round((cov / s_data['required'] * 100), 1) if s_data['required'] > 0 else 100.0

        return {
            'target_date': str(d),
            'required_roster_strength': total_required,
            'rostered_strength': total_rostered,
            'replacement_coverage': total_replacement,
            'uncovered_vacancies': total_uncovered,
            'cross_site_replacements_count': cross_site_count,
            'shift_breakdown': list(shift_summary_map.values()),
            'site_coverage_list': list(site_summary_map.values())
        }

    @classmethod
    def get_attendance_summary(cls, company_id, target_date=None, site_id=None, classification=None):
        """
        Consolidates today's attendance statuses, missing/unmaterialized attendance,
        consecutive absences, and active/approaching JUMP cases.
        """
        d = _parse_date(target_date)

        emp_qs = Employee.objects.filter(
            company_id=company_id,
            employment_status__in=['ACTIVE', 'JUMP', 'SUSPENDED'],
            is_deleted=False
        ).select_related('designation', 'department')

        if classification:
            emp_qs = emp_qs.filter(classification=classification)

        attendances = {
            str(att.employee_id): att
            for att in WorkforceAttendance.objects.filter(
                company_id=company_id,
                date=d,
                is_deleted=False
            ).select_related('site', 'post', 'shift')
        }

        # Planned rosters for today
        rosters = {
            str(r.employee_id): r
            for r in DutyRoster.objects.filter(
                company_id=company_id,
                duty_date=d,
                status__in=[DutyRosterStatus.SCHEDULED, DutyRosterStatus.COMPLETED],
                is_deleted=False
            ).select_related('site', 'post', 'shift')
        }

        # Replacements assigned for today
        replacements_set = set(
            DutyReplacement.objects.filter(
                company_id=company_id,
                duty_date=d,
                status='ASSIGNED',
                is_deleted=False
            ).values_list('original_employee_id', flat=True)
        )

        counts = {
            'present': 0,
            'absent': 0,
            'paid_leave': 0,
            'unpaid_leave': 0,
            'weekly_off': 0,
            'holiday': 0,
            'half_day': 0,
            'missing_unfinalized': 0,
        }

        uncovered_absences_list = []
        approaching_jump_list = []

        for emp in emp_qs:
            emp_id = str(emp.id)
            roster = rosters.get(emp_id)

            if site_id:
                emp_site_id = str(roster.site_id) if roster else None
                if emp_site_id != str(site_id):
                    continue

            status, att_obj, is_mat = resolve_effective_attendance_status(emp, d)

            if not is_mat:
                counts['missing_unfinalized'] += 1

            if status == AttendanceStatus.PRESENT:
                counts['present'] += 1
            elif status == AttendanceStatus.ABSENT:
                counts['absent'] += 1
                has_rep = emp.id in replacements_set
                if emp.classification == 'DIRECT' and not has_rep:
                    uncovered_absences_list.append({
                        'employee_id': emp_id,
                        'employee_name': emp.full_name,
                        'employee_code': emp.employee_code,
                        'site_id': str(roster.site_id) if roster else None,
                        'site_name': roster.site.name if roster and roster.site else 'Unassigned',
                        'post_name': roster.post.post_name if roster and roster.post else 'N/A',
                        'shift_name': roster.shift.name if roster and roster.shift else 'N/A'
                    })

                # Check consecutive absent streak
                streak, streak_start = calculate_consecutive_absent_days(emp, d)
                if 4 <= streak < 7 and emp.employment_status != 'JUMP':
                    approaching_jump_list.append({
                        'employee_id': emp_id,
                        'employee_name': emp.full_name,
                        'employee_code': emp.employee_code,
                        'consecutive_absent_days': streak,
                        'absent_since': str(streak_start) if streak_start else str(d)
                    })

            elif status == AttendanceStatus.PAID_LEAVE:
                counts['paid_leave'] += 1
            elif status == AttendanceStatus.UNPAID_LEAVE:
                counts['unpaid_leave'] += 1
            elif status == AttendanceStatus.WEEKLY_OFF:
                counts['weekly_off'] += 1
            elif status == AttendanceStatus.HOLIDAY:
                counts['holiday'] += 1
            elif status == AttendanceStatus.HALF_DAY:
                counts['half_day'] += 1

        # Active JUMP cases from JumpRecord
        active_jumps_qs = JumpRecord.objects.filter(
            company_id=company_id,
            status=JumpRecordStatus.ACTIVE_JUMP,
            is_deleted=False
        ).select_related('employee', 'employee__designation')

        active_jump_list = [
            {
                'id': str(j.id),
                'employee_id': str(j.employee_id),
                'employee_name': j.employee.full_name,
                'employee_code': j.employee.employee_code,
                'absent_since': str(j.absent_since),
                'consecutive_absent_days': j.consecutive_absent_days,
                'reason': j.reason
            }
            for j in active_jumps_qs
        ]

        return {
            'target_date': str(d),
            'present': counts['present'],
            'absent': counts['absent'],
            'paid_leave': counts['paid_leave'],
            'unpaid_leave': counts['unpaid_leave'],
            'weekly_off': counts['weekly_off'],
            'holiday': counts['holiday'],
            'half_day': counts['half_day'],
            'missing_unfinalized': counts['missing_unfinalized'],
            'active_jump_count': len(active_jump_list),
            'active_jump_list': active_jump_list,
            'approaching_jump_count': len(approaching_jump_list),
            'approaching_jump_list': approaching_jump_list,
            'uncovered_absences_count': len(uncovered_absences_list),
            'uncovered_absences_list': uncovered_absences_list
        }

    @classmethod
    def get_payroll_readiness_summary(cls, company_id, target_date=None, period_start=None, period_end=None):
        """
        Gathers payroll readiness status from S-5E/F/G records.
        Strictly consumes existing results without recalculating payroll.
        """
        d = _parse_date(target_date)
        if period_start is not None and period_end is not None:
            p_start = _parse_date(period_start)
            p_end = _parse_date(period_end)
        else:
            p_start = d.replace(day=1)
            import calendar
            _, last_day = calendar.monthrange(d.year, d.month)
            p_end = d.replace(day=last_day)

        # 1. Daily Duty Pay generated in period
        daily_pays = DailyDutyPay.objects.filter(
            company_id=company_id,
            duty_date__gte=p_start,
            duty_date__lte=p_end,
            is_deleted=False
        )
        duty_pay_generated_count = daily_pays.count()
        unresolved_daily_pays = daily_pays.filter(
            calculation_status=DailyPayCalculationStatus.UNRESOLVED
        ).select_related('employee')

        unresolved_pay_list = [
            {
                'id': str(dp.id),
                'employee_name': dp.employee.full_name if dp.employee else 'Unknown',
                'duty_date': str(dp.duty_date),
                'unresolved_reason': dp.unresolved_reason or 'Missing compensation rate'
            }
            for dp in unresolved_daily_pays[:10]
        ]

        # 2. EmployeePayrollCalculations in period
        calcs = EmployeePayrollCalculation.objects.filter(
            company_id=company_id,
            period_start=p_start,
            period_end=p_end,
            is_deleted=False
        ).select_related('employee')

        ready_calcs = calcs.filter(status=PayrollCalculationStatus.READY)
        ready_count = ready_calcs.count()

        blocked_calcs = calcs.filter(
            Q(status=PayrollCalculationStatus.BLOCKED) | Q(has_blockers=True)
        )
        blocked_count = blocked_calcs.count()

        blocked_list = [
            {
                'employee_id': str(c.employee_id),
                'employee_name': c.employee.full_name if c.employee else 'Unknown',
                'blocking_reasons': c.blocking_reasons
            }
            for c in blocked_calcs[:10]
        ]

        # Aggregated estimated earnings
        est_gross = ready_calcs.aggregate(total=Sum('gross_earnings'))['total'] or Decimal('0.00')
        est_net = ready_calcs.aggregate(total=Sum('net_payable'))['total'] or Decimal('0.00')

        # 3. Latest PayrollRun
        latest_run = PayrollRun.objects.filter(
            company_id=company_id,
            is_deleted=False
        ).order_by('-period_start', '-created_at').first()

        latest_run_data = None
        finance_handoff_status = 'NOT_FINALIZED'

        if latest_run:
            latest_run_data = {
                'run_id': str(latest_run.id),
                'run_number': latest_run.run_number,
                'payroll_month': getattr(latest_run, 'payroll_month', ''),
                'period_start': str(latest_run.period_start) if latest_run.period_start else '',
                'period_end': str(latest_run.period_end) if latest_run.period_end else '',
                'status': latest_run.status,
                'employee_count': latest_run.employee_count,
                'gross_earnings': float(latest_run.gross_earnings),
                'net_payroll': float(latest_run.net_payroll),
                'finalized_at': latest_run.finalized_at.isoformat() if latest_run.finalized_at else None
            }

            if latest_run.status == PayrollRunStatus.FINALIZED:
                try:
                    from finance.models import PayrollAccountingIntegration
                    integ = PayrollAccountingIntegration.objects.filter(
                        company_id=company_id,
                        payroll_run=latest_run,
                        is_deleted=False
                    ).first()
                    if integ and integ.journal_entry:
                        finance_handoff_status = 'LIABILITY_POSTED'
                    elif integ:
                        finance_handoff_status = 'LIABILITY_RECOGNIZED'
                    else:
                        finance_handoff_status = 'PENDING'
                except Exception:
                    finance_handoff_status = 'PENDING'

        return {
            'period_start': str(p_start),
            'period_end': str(p_end),
            'daily_duty_pay_generated_count': duty_pay_generated_count,
            'unresolved_daily_pay_count': unresolved_daily_pays.count(),
            'unresolved_daily_pay_list': unresolved_pay_list,
            'calculations_ready_count': ready_count,
            'calculations_blocked_count': blocked_count,
            'blocked_calculations_list': blocked_list,
            'estimated_gross_payroll': float(est_gross),
            'estimated_net_payable': float(est_net),
            'latest_payroll_run': latest_run_data,
            'finance_handoff_status': finance_handoff_status
        }

    @classmethod
    def get_lifecycle_alerts(cls, company_id):
        """
        Surfaces actionable workforce lifecycle events and exceptions.
        """
        # Suspended staff
        suspended_qs = Employee.objects.filter(
            company_id=company_id,
            employment_status='SUSPENDED',
            is_deleted=False
        ).select_related('designation', 'department')

        suspended_list = [
            {
                'employee_id': str(e.id),
                'employee_name': e.full_name,
                'employee_code': e.employee_code,
                'designation_name': e.designation.name if e.designation else '',
                'department_name': e.department.name if e.department else ''
            }
            for e in suspended_qs[:15]
        ]

        # Active JUMP staff
        jumps_qs = JumpRecord.objects.filter(
            company_id=company_id,
            status=JumpRecordStatus.ACTIVE_JUMP,
            is_deleted=False
        ).select_related('employee', 'employee__designation')

        # Direct staff without active deployment (unutilized workforce)
        active_deployed_emp_ids = set(
            Deployment.objects.filter(
                company_id=company_id,
                status=DeploymentStatus.ACTIVE,
                is_deleted=False
            ).values_list('employee_id', flat=True)
        )

        unassigned_direct_qs = Employee.objects.filter(
            company_id=company_id,
            classification='DIRECT',
            employment_status='ACTIVE',
            is_deleted=False
        ).exclude(id__in=active_deployed_emp_ids).select_related('designation')

        unassigned_direct_list = [
            {
                'employee_id': str(e.id),
                'employee_name': e.full_name,
                'employee_code': e.employee_code,
                'designation_name': e.designation.name if e.designation else ''
            }
            for e in unassigned_direct_qs[:15]
        ]

        # Recent transfers in the last 14 days
        cutoff = timezone.now().date() - datetime.timedelta(days=14)
        recent_transfers_qs = EmploymentHistory.objects.filter(
            company_id=company_id,
            event_type='TRANSFER',
            effective_date__gte=cutoff,
            is_deleted=False
        ).select_related('employee').order_by('-effective_date')[:10]

        recent_transfers_list = [
            {
                'employee_id': str(th.employee_id),
                'employee_name': th.employee.full_name if th.employee else 'Unknown',
                'effective_date': str(th.effective_date),
                'old_value': th.old_value,
                'new_value': th.new_value,
                'reason': th.reason
            }
            for th in recent_transfers_qs
        ]

        # Recent separations in last 14 days
        recent_sep_qs = EmploymentHistory.objects.filter(
            company_id=company_id,
            event_type__in=['RESIGNATION', 'TERMINATION'],
            effective_date__gte=cutoff,
            is_deleted=False
        ).select_related('employee').order_by('-effective_date')[:10]

        recent_sep_list = [
            {
                'employee_id': str(sh.employee_id),
                'employee_name': sh.employee.full_name if sh.employee else 'Unknown',
                'event_type': sh.event_type,
                'effective_date': str(sh.effective_date),
                'reason': sh.reason
            }
            for sh in recent_sep_qs
        ]

        return {
            'active_jumps_count': jumps_qs.count(),
            'suspended_count': len(suspended_list),
            'suspended_list': suspended_list,
            'unassigned_direct_count': unassigned_direct_qs.count(),
            'unassigned_direct_list': unassigned_direct_list,
            'recent_transfers_count': len(recent_transfers_list),
            'recent_transfers_list': recent_transfers_list,
            'recent_separations_count': len(recent_sep_list),
            'recent_separations_list': recent_sep_list
        }

    @classmethod
    def get_site_health_view(cls, company_id, target_date=None, client_id=None, contract_id=None):
        """
        Produces compact operational site health indicators combining requirements,
        deployments, today's roster, attendance, and vacancies.
        Status is derived deterministically from operational metrics.
        """
        d = _parse_date(target_date)

        sites_qs = OperationalSite.objects.filter(
            company_id=company_id,
            is_active=True,
            is_deleted=False
        ).select_related('crm_entity').prefetch_related('service_contracts')

        if client_id:
            sites_qs = sites_qs.filter(crm_entity_id=client_id)
        if contract_id:
            sites_qs = sites_qs.filter(service_contracts__id=contract_id).distinct()

        # Batch pre-fetch
        posts = list(SecurityPost.objects.filter(
            site__in=sites_qs, is_active=True, is_deleted=False
        ))
        posts_by_site = {}
        for p in posts:
            posts_by_site.setdefault(str(p.site_id), []).append(p)

        deployments = list(Deployment.objects.filter(
            company_id=company_id,
            site__in=sites_qs,
            status=DeploymentStatus.ACTIVE,
            is_deleted=False
        ))
        deployments_by_site = {}
        for dep in deployments:
            deployments_by_site.setdefault(str(dep.site_id), []).append(dep)

        rosters = list(DutyRoster.objects.filter(
            company_id=company_id,
            site__in=sites_qs,
            duty_date=d,
            status__in=[DutyRosterStatus.SCHEDULED, DutyRosterStatus.COMPLETED],
            is_deleted=False
        ).select_related('employee'))
        rosters_by_site = {}
        for r in rosters:
            rosters_by_site.setdefault(str(r.site_id), []).append(r)

        attendances = {
            str(att.employee_id): att
            for att in WorkforceAttendance.objects.filter(
                company_id=company_id,
                date=d,
                is_deleted=False
            )
        }

        active_jumps_by_emp = set(
            JumpRecord.objects.filter(
                company_id=company_id,
                status=JumpRecordStatus.ACTIVE_JUMP,
                is_deleted=False
            ).values_list('employee_id', flat=True)
        )

        site_health_rows = []

        for site in sites_qs:
            s_id = str(site.id)
            site_posts = posts_by_site.get(s_id, [])
            site_deps = deployments_by_site.get(s_id, [])
            site_rosters = rosters_by_site.get(s_id, [])

            req_strength = sum(p.required_headcount for p in site_posts)
            dep_strength = len(site_deps)
            vacancies = max(0, req_strength - dep_strength)

            roster_count = len(site_rosters)
            present_count = 0
            absent_count = 0
            replacement_count = sum(1 for r in site_rosters if r.is_replacement)
            uncovered_absences = 0
            site_jump_cases = 0

            for r in site_rosters:
                emp = r.employee
                if not emp:
                    continue
                if emp.id in active_jumps_by_emp:
                    site_jump_cases += 1

                att = attendances.get(str(emp.id))
                status = att.status if att else AttendanceStatus.PRESENT
                if status == AttendanceStatus.PRESENT:
                    present_count += 1
                elif status == AttendanceStatus.ABSENT:
                    absent_count += 1
                    if not r.is_replacement:
                        uncovered_absences += 1

            # Determine Health Status
            if uncovered_absences > 0 or (req_strength > 0 and dep_strength == 0) or absent_count > 2:
                health_status = 'CRITICAL'
            elif vacancies > 0 or site_jump_cases > 0 or dep_strength < req_strength:
                health_status = 'WARNING'
            else:
                health_status = 'HEALTHY'

            primary_contract = site.service_contracts.filter(status='ACTIVE').first()

            site_health_rows.append({
                'site_id': s_id,
                'site_name': site.name,
                'address': site.address,
                'client_id': str(site.crm_entity_id) if site.crm_entity_id else None,
                'client_name': site.crm_entity.name if site.crm_entity else 'N/A',
                'contract_code': primary_contract.contract_code if primary_contract else 'Unlinked',
                'required_strength': req_strength,
                'deployed_strength': dep_strength,
                'todays_roster_count': roster_count,
                'present_count': present_count,
                'absent_count': absent_count,
                'replacement_count': replacement_count,
                'vacancies': vacancies,
                'uncovered_absences': uncovered_absences,
                'jump_cases_count': site_jump_cases,
                'health_status': health_status
            })

        return site_health_rows

    @classmethod
    def get_action_center(cls, company_id, target_date=None):
        """
        Generates prioritized operational exceptions linking directly to relevant module workspaces.
        """
        d = _parse_date(target_date)
        actions = []

        # 1. Uncovered Absences (CRITICAL)
        att_summary = cls.get_attendance_summary(company_id, target_date=d)
        for unc in att_summary.get('uncovered_absences_list', []):
            actions.append({
                'id': f"act_unc_{unc['employee_id']}",
                'priority': 'CRITICAL',
                'category': 'ATTENDANCE',
                'title': f"Uncovered Absence: {unc['employee_name']}",
                'description': f"Rostered guard is absent at {unc['site_name']} ({unc['post_name']}) without replacement.",
                'target_type': 'ROSTER',
                'target_id': unc['employee_id'],
                'tab': 'roster',
                'action_label': 'Assign Replacement'
            })

        # 2. Active JUMP alerts (CRITICAL)
        for j in att_summary.get('active_jump_list', []):
            actions.append({
                'id': f"act_jump_{j['id']}",
                'priority': 'CRITICAL',
                'category': 'JUMP',
                'title': f"Active JUMP Alert: {j['employee_name']}",
                'description': f"{j['consecutive_absent_days']} consecutive unexcused absent days since {j['absent_since']}.",
                'target_type': 'EMPLOYEE',
                'target_id': j['employee_id'],
                'tab': 'attendance',
                'action_label': 'Resolve JUMP'
            })

        # 3. Blocked Payroll calculations (CRITICAL)
        payroll_summary = cls.get_payroll_readiness_summary(company_id, target_date=d)
        for blk in payroll_summary.get('blocked_calculations_list', []):
            actions.append({
                'id': f"act_blk_{blk['employee_id']}",
                'priority': 'CRITICAL',
                'category': 'PAYROLL',
                'title': f"Blocked Payroll Calculation: {blk['employee_name']}",
                'description': f"Blockers detected: {', '.join(blk['blocking_reasons'][:2])}",
                'target_type': 'PAYROLL_CALCULATION',
                'target_id': blk['employee_id'],
                'tab': 'payroll_prep',
                'action_label': 'Review Blockers'
            })

        # 4. Unresolved Duty Pay rates (HIGH)
        for udp in payroll_summary.get('unresolved_daily_pay_list', []):
            actions.append({
                'id': f"act_udp_{udp['id']}",
                'priority': 'HIGH',
                'category': 'PAYROLL',
                'title': f"Unresolved Pay Rate: {udp['employee_name']}",
                'description': f"Duty date {udp['duty_date']}: {udp['unresolved_reason']}",
                'target_type': 'DAILY_PAY',
                'target_id': udp['id'],
                'tab': 'daily_pay',
                'action_label': 'Resolve Rate'
            })

        # 5. Manpower Vacancies (HIGH)
        manpower_summary = cls.get_manpower_summary(company_id)
        for vp in manpower_summary.get('vacant_posts', [])[:5]:
            actions.append({
                'id': f"act_vac_{vp['post_id']}",
                'priority': 'HIGH',
                'category': 'MANPOWER',
                'title': f"Post Vacancy: {vp['post_name']}",
                'description': f"{vp['site_name']} needs {vp['vacancies']} guard(s) ({vp['required_designation_name']}).",
                'target_type': 'SECURITY_POST',
                'target_id': vp['post_id'],
                'tab': 'deployments',
                'action_label': 'Deploy Guard'
            })

        # 6. Approaching 7-day JUMP threshold (HIGH)
        for app_j in att_summary.get('approaching_jump_list', []):
            actions.append({
                'id': f"act_appj_{app_j['employee_id']}",
                'priority': 'HIGH',
                'category': 'ATTENDANCE',
                'title': f"Approaching JUMP: {app_j['employee_name']}",
                'description': f"{app_j['consecutive_absent_days']} days absent streak. Risk of JUMP status.",
                'target_type': 'EMPLOYEE',
                'target_id': app_j['employee_id'],
                'tab': 'attendance',
                'action_label': 'Check Status'
            })

        # 7. Unassigned DIRECT staff (MEDIUM)
        lifecycle_alerts = cls.get_lifecycle_alerts(company_id)
        for u_dir in lifecycle_alerts.get('unassigned_direct_list', [])[:5]:
            actions.append({
                'id': f"act_udir_{u_dir['employee_id']}",
                'priority': 'MEDIUM',
                'category': 'LIFECYCLE',
                'title': f"Unassigned Guard: {u_dir['employee_name']}",
                'description': f"Active {u_dir['designation_name']} is currently not deployed to any site.",
                'target_type': 'EMPLOYEE',
                'target_id': u_dir['employee_id'],
                'tab': 'deployments',
                'action_label': 'Deploy'
            })

        # 8. Suspended Employees (MEDIUM)
        for susp in lifecycle_alerts.get('suspended_list', [])[:5]:
            actions.append({
                'id': f"act_susp_{susp['employee_id']}",
                'priority': 'MEDIUM',
                'category': 'LIFECYCLE',
                'title': f"Suspended Employee: {susp['employee_name']}",
                'description': f"{susp['designation_name']} ({susp['department_name']}) under active suspension.",
                'target_type': 'EMPLOYEE',
                'target_id': susp['employee_id'],
                'tab': 'overview',
                'action_label': 'Review File'
            })

        return actions

    @classmethod
    def get_control_center_data(
        cls,
        company_id,
        target_date=None,
        client_id=None,
        contract_id=None,
        site_id=None,
        shift_id=None,
        classification=None,
        designation_id=None,
        employment_status=None
    ):
        """
        Consolidated master aggregator for Phase S-5I Control Center.
        """
        d = _parse_date(target_date)

        workforce = cls.get_workforce_summary(
            company_id=company_id,
            classification=classification,
            designation_id=designation_id,
            employment_status=employment_status
        )

        manpower = cls.get_manpower_summary(
            company_id=company_id,
            client_id=client_id,
            contract_id=contract_id,
            site_id=site_id,
            designation_id=designation_id
        )

        roster_coverage = cls.get_roster_coverage_summary(
            company_id=company_id,
            target_date=d,
            client_id=client_id,
            contract_id=contract_id,
            site_id=site_id,
            shift_id=shift_id
        )

        attendance = cls.get_attendance_summary(
            company_id=company_id,
            target_date=d,
            site_id=site_id,
            classification=classification
        )

        payroll_readiness = cls.get_payroll_readiness_summary(
            company_id=company_id,
            target_date=d
        )

        lifecycle_alerts = cls.get_lifecycle_alerts(
            company_id=company_id
        )

        site_health = cls.get_site_health_view(
            company_id=company_id,
            target_date=d,
            client_id=client_id,
            contract_id=contract_id
        )

        action_center = cls.get_action_center(
            company_id=company_id,
            target_date=d
        )

        return {
            'target_date': str(d),
            'filters': {
                'target_date': str(d),
                'client_id': client_id,
                'contract_id': contract_id,
                'site_id': site_id,
                'shift_id': shift_id,
                'classification': classification,
                'designation_id': designation_id,
                'employment_status': employment_status
            },
            'workforce': workforce,
            'manpower': manpower,
            'duty_coverage': roster_coverage,
            'attendance': attendance,
            'payroll_readiness': payroll_readiness,
            'lifecycle_alerts': lifecycle_alerts,
            'site_health': site_health,
            'action_center': action_center
        }
