import calendar
from datetime import date
from decimal import Decimal
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.core.exceptions import ValidationError

from erp_core.models import BaseModel
from operations.models import (
    OperationalSite, SecurityPost, Deployment, DailyDutyPay,
    DailyPayRateSource, DailyPayCalculationStatus, DeploymentStatus
)
from hrm.models import Employee, WorkforceAttendance, AttendanceStatus, Designation
import openpyxl


class MonthlyMusterService:
    """
    Dedicated Service Engine for the Security Operations Monthly Muster Grid,
    Excel Import, Cross-Location Anti-Cheating Validation, and Guard History Ledger.
    """

    @staticmethod
    def get_site_overtime_rate(site, desig=None):
        """
        Resolves the explicit client overtime rate configured in CRM proposal data for this site.
        If not set or 0, returns Decimal('0.00').
        """
        if not site:
            return Decimal('0.00')
        company = site.company
        from security_crm.models import ProposalServiceLine

        # 1. Match lines by location name
        lines = ProposalServiceLine.objects.filter(
            company=company,
            location__name__iexact=site.name,
            is_deleted=False
        ).select_related('service_type')

        # 2. Fallback to matching by client entity if location name not found
        if not lines.exists() and site.crm_entity:
            lines = ProposalServiceLine.objects.filter(
                company=company,
                location__customer=site.crm_entity,
                is_deleted=False
            ).select_related('service_type')

        if not lines.exists():
            return Decimal('0.00')

        # If designation is provided, try to find a matching line first
        if desig:
            desig_name = (desig.name if hasattr(desig, 'name') else str(desig)).lower()
            for l in lines:
                st_name = (l.service_type.name if l.service_type else '').lower()
                if (desig_name in st_name or st_name in desig_name) and (l.single_ot_rate or l.double_ot_rate):
                    return l.single_ot_rate or l.double_ot_rate or Decimal('0.00')

        # Otherwise return the highest configured OT rate for this location
        best_ot = Decimal('0.00')
        for l in lines:
            ot = l.single_ot_rate or l.double_ot_rate or Decimal('0.00')
            if ot and ot > best_ot:
                best_ot = ot

        return best_ot

    @staticmethod
    def get_monthly_muster_grid(company, year: int, month: int, site_id=None):
        days_in_month = calendar.monthrange(year, month)[1]
        start_date = date(year, month, 1)
        end_date = date(year, month, days_in_month)
        today = timezone.now().date()
        is_current_month = (today.year == year and today.month == month)
        current_day = today.day if is_current_month else (32 if today > end_date else 0)

        # 1. Fetch active operational sites
        sites_qs = OperationalSite.objects.filter(
            company=company, is_active=True, is_deleted=False
        ).select_related('crm_entity')
        if site_id:
            sites_qs = sites_qs.filter(pk=site_id)
        sites_qs = sites_qs.order_by('name')

        # 2. Pre-fetch company designations for quick lookup
        designation_map = {
            d.id: d.name for d in Designation.objects.filter(company=company)
        }

        # 3. Pre-fetch all attendances and daily duty pays for the whole month for this company
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
        # Map: (employee_id, site_id, date) -> duty record
        global_duty_by_emp_date = {}
        duty_by_emp_site_date = {}

        for att in attendances:
            key_global = (str(att.employee_id), att.date.day)
            if key_global not in global_duty_by_emp_date:
                global_duty_by_emp_date[key_global] = []
            global_duty_by_emp_date[key_global].append({
                'type': 'attendance',
                'status': att.status,
                'site_id': str(att.site_id) if att.site_id else None,
                'site_name': att.site.name if att.site else 'Central'
            })

            if att.site_id:
                key_site = (str(att.employee_id), str(att.site_id), att.date.day)
                duty_by_emp_site_date[key_site] = {
                    'status': att.status,
                    'is_ot': False,
                    'notes': att.notes
                }

        for dp in duty_pays:
            key_global = (str(dp.employee_id), dp.duty_date.day)
            if key_global not in global_duty_by_emp_date:
                global_duty_by_emp_date[key_global] = []
            
            is_ot = (dp.attendance_status == 'OVERTIME' or dp.rate_source == 'OVERTIME' or 'overtime' in (dp.notes or '').lower())
            is_ds = ('double shift' in (dp.notes or '').lower() or 'wo+ot' in (dp.notes or '').lower())

            global_duty_by_emp_date[key_global].append({
                'type': 'duty_pay',
                'status': dp.attendance_status,
                'is_ot': is_ot,
                'is_ds': is_ds,
                'site_id': str(dp.site_id) if dp.site_id else None,
                'site_name': dp.site.name if dp.site else 'Unlinked',
                'amount': float(dp.payable_amount)
            })

            if dp.site_id:
                key_site = (str(dp.employee_id), str(dp.site_id), dp.duty_date.day)
                existing = duty_by_emp_site_date.get(key_site, {})
                duty_by_emp_site_date[key_site] = {
                    'status': dp.attendance_status,
                    'is_ot': is_ot,
                    'is_ds': is_ds,
                    'amount': float(dp.payable_amount),
                    'notes': dp.notes or existing.get('notes', '')
                }

        # 4. Process each site block
        site_blocks = []

        for site in sites_qs:
            site_id_str = str(site.id)
            # Find posts & requirements for this site
            posts = SecurityPost.objects.filter(site=site, is_active=True, is_deleted=False).select_related('required_designation')
            
            supervisors_req = 0
            supervisors_sal = Decimal('0.00')
            guards_req = 0
            guards_sal = Decimal('0.00')
            overtime_rate = MonthlyMusterService.get_site_overtime_rate(site)

            for p in posts:
                desig_name = p.required_designation.name.lower() if p.required_designation else ''
                if 'supervisor' in desig_name:
                    supervisors_req += p.required_headcount
                    if p.monthly_pay_rate and p.monthly_pay_rate > supervisors_sal:
                        supervisors_sal = p.monthly_pay_rate
                else:
                    guards_req += p.required_headcount
                    if p.monthly_pay_rate and p.monthly_pay_rate > guards_sal:
                        guards_sal = p.monthly_pay_rate

            # Find all employees who belong to this site for this month
            # 1. From Deployments
            site_deployments = Deployment.objects.filter(
                company=company,
                site=site,
                is_deleted=False,
                start_date__lte=end_date
            ).filter(
                Q(end_date__isnull=True) | Q(end_date__gte=start_date)
            ).select_related('employee', 'employee__designation')

            employee_dict = {}
            for dep in site_deployments:
                emp = dep.employee
                if emp and not emp.is_deleted:
                    employee_dict[str(emp.id)] = {
                        'employee': emp,
                        'is_primary': True,
                        'deployment': dep
                    }

            # 2. Plus any employees who have attendance or duty pay recorded at this site
            site_emp_ids_from_duties = {
                k[0] for k in duty_by_emp_site_date.keys() if k[1] == site_id_str
            }
            extra_emp_ids = site_emp_ids_from_duties - set(employee_dict.keys())
            if extra_emp_ids:
                extra_emps = Employee.objects.filter(
                    id__in=extra_emp_ids, company=company, is_deleted=False
                ).select_related('designation')
                for emp in extra_emps:
                    employee_dict[str(emp.id)] = {
                        'employee': emp,
                        'is_primary': False,
                        'deployment': None
                    }

            # Build guard rows
            guards_data = []
            daily_totals = {d: 0 for d in range(1, days_in_month + 1)}
            daily_vacations = {d: 0 for d in range(1, days_in_month + 1)}

            # Sort employees: Supervisors first, then by code
            sorted_emps = sorted(
                employee_dict.values(),
                key=lambda x: (
                    0 if 'supervisor' in (x['employee'].designation.name.lower() if x['employee'].designation else '') else 1,
                    x['employee'].employee_code or ''
                )
            )

            for item in sorted_emps:
                emp = item['employee']
                emp_id_str = str(emp.id)
                desig_title = emp.designation.name if emp.designation else 'Guard'
                
                # Abbreviate designation for compact table header
                desig_code = 'GD'
                desig_lower = desig_title.lower()
                if 'supervisor' in desig_lower:
                    desig_code = 'SUP'
                elif 'lady' in desig_lower:
                    desig_code = 'LADY'
                elif 'cctv' in desig_lower:
                    desig_code = 'CCTV'
                elif 'cpo' in desig_lower:
                    desig_code = 'CPO'

                days_map = {}
                count_p = 0
                count_ot = 0
                count_wo = 0
                count_ds = 0
                count_a = 0
                count_l = 0

                for d in range(1, days_in_month + 1):
                    site_duty = duty_by_emp_site_date.get((emp_id_str, site_id_str, d))
                    global_duties = global_duty_by_emp_date.get((emp_id_str, d), [])

                    code = ''
                    if site_duty:
                        status = site_duty.get('status')
                        is_ot = site_duty.get('is_ot', False)
                        is_ds = site_duty.get('is_ds', False)

                        if is_ds:
                            code = 'D'
                            count_ds += 1
                            daily_totals[d] += 1
                        elif is_ot:
                            code = 'O'
                            count_ot += 1
                            daily_totals[d] += 1
                        elif status in [AttendanceStatus.PRESENT, 'PRESENT', 'P']:
                            code = 'P'
                            count_p += 1
                            daily_totals[d] += 1
                        elif status in [AttendanceStatus.WEEKLY_OFF, 'WEEKLY_OFF', 'WO']:
                            code = 'W'
                            count_wo += 1
                            daily_vacations[d] += 1
                        elif status in [AttendanceStatus.ABSENT, 'ABSENT', 'A']:
                            code = 'A'
                            count_a += 1
                        elif status in ['LEAVE', 'PAID_LEAVE', 'SICK_LEAVE', 'L', 'PL']:
                            code = 'L'
                            count_l += 1
                            daily_vacations[d] += 1
                    else:
                        # No duty explicitly at this site
                        has_duty_elsewhere = any(
                            gd.get('site_id') and gd.get('site_id') != site_id_str
                            for gd in global_duties
                        )
                        if has_duty_elsewhere:
                            code = ''  # Active at another location
                        elif d <= current_day and item['is_primary']:
                            # Past date on primary site with no duty anywhere -> default Absent
                            code = 'A'
                            count_a += 1
                        else:
                            code = ''

                    days_map[str(d)] = code

                guards_data.append({
                    'employee_id': emp_id_str,
                    'employee_code': emp.employee_code or '',
                    'name': f"{emp.first_name} {emp.last_name}".strip(),
                    'designation': desig_code,
                    'designation_full': desig_title,
                    'is_primary': item['is_primary'],
                    'days': days_map,
                    'total_present': count_p,
                    'total_ot': count_ot,
                    'total_wo': count_wo,
                    'total_ds': count_ds,
                    'total_absent': count_a,
                    'total_leave': count_l,
                    'payable_days': count_p + count_wo + count_ds + count_l,
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
        Enforces strict cross-location validation (No duplicate Present on same day).
        Handles newly added guards (persisting deployments) and removed guards (wiping monthly duties & deployments).
        """
        days_in_month = calendar.monthrange(year, month)[1]
        updates = updates or []
        added_guards = added_guards or []
        removed_guards = removed_guards or []

        # Group updates by (employee_id, day) to detect internal duplicates in the payload
        emp_day_payload = {}
        for up in updates:
            emp_id = str(up.get('employee_id'))
            day = int(up.get('day'))
            code = str(up.get('code', '')).strip().upper()
            if code in ['1', 'P']:
                key = (emp_id, day)
                if key in emp_day_payload and emp_day_payload[key] != up.get('site_id'):
                    emp = Employee.objects.filter(id=emp_id).first()
                    emp_name = f"{emp.first_name} ({emp.employee_code})" if emp else emp_id
                    raise ValidationError(
                        f"Guard {emp_name} cannot be marked Present (P) at two different locations on Day {day}. Mark Overtime (O) for the second location."
                    )
                emp_day_payload[key] = up.get('site_id')

        with transaction.atomic():
            start_date = date(year, month, 1)
            end_date = date(year, month, days_in_month)

            # 1. Process Removed Guards: clean up duty pays, attendances, and deployments for this site in this month
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

            # 2. Process Added Guards: ensure active Deployment exists for this site so guard remains on muster
            for add_item in added_guards:
                add_site_id = add_item.get('site_id')
                add_emp_id = add_item.get('employee_id')
                if add_site_id and add_emp_id:
                    site_obj = OperationalSite.objects.filter(id=add_site_id, company=company).first()
                    emp_obj = Employee.objects.filter(id=add_emp_id, company=company).first()
                    if site_obj and emp_obj:
                        post_obj = SecurityPost.objects.filter(site=site_obj, is_active=True, is_deleted=False).first()
                        contract_obj = post_obj.service_contract if post_obj else None
                        desig_obj = emp_obj.designation or (post_obj.required_designation if post_obj else None)
                        if not desig_obj:
                            desig_obj = Designation.objects.filter(company=company, is_deleted=False).first()

                        dep, created = Deployment.objects.get_or_create(
                            company=company,
                            site=site_obj,
                            employee=emp_obj,
                            is_deleted=False,
                            defaults={
                                'start_date': start_date,
                                'status': DeploymentStatus.ACTIVE,
                                'post': post_obj,
                                'service_contract': contract_obj,
                                'designation': desig_obj,
                                'assigned_by': user if (user and user.is_authenticated) else None
                            }
                        )
                        if not created and dep.status != DeploymentStatus.ACTIVE:
                            dep.status = DeploymentStatus.ACTIVE
                            dep.save(update_fields=['status'])

            # 3. Process Cell Updates
            for up in updates:
                site_id = up.get('site_id')
                emp_id = up.get('employee_id')
                day = int(up.get('day'))
                raw_code = str(up.get('code', '')).strip().upper()
                target_date = date(year, month, day)

                site = OperationalSite.objects.filter(id=site_id, company=company).first()
                emp = Employee.objects.filter(id=emp_id, company=company).first()
                if not site or not emp:
                    continue

                # Rate resolution for this site
                post = SecurityPost.objects.filter(site=site, is_active=True, is_deleted=False).first()
                site_monthly_sal = post.monthly_pay_rate if (post and post.monthly_pay_rate) else Decimal('35000.00')
                daily_rate = (site_monthly_sal / Decimal(str(days_in_month))).quantize(Decimal('0.01'))
                ot_rate = MonthlyMusterService.get_site_overtime_rate(site, desig=emp.designation)

                # Canonicalize duty code
                code = raw_code
                if code in ['P', '1']:
                    code = 'P'
                elif code in ['O', 'OT']:
                    code = 'O'
                elif code in ['D', 'WO+OT', 'DS', '2']:
                    code = 'D'
                elif code in ['W', 'WO', 'OFF']:
                    code = 'W'
                elif code == 'A':
                    code = 'A'
                elif code in ['L', 'PL', 'SL']:
                    code = 'L'

                if code == 'P':
                    # Check database for collision with another site on this same date
                    existing_att = WorkforceAttendance.objects.filter(
                        company=company,
                        employee=emp,
                        date=target_date,
                        is_deleted=False,
                        status=AttendanceStatus.PRESENT
                    ).exclude(site=site).first()

                    if existing_att and existing_att.site:
                        raise ValidationError(
                            f"Guard {emp.first_name} ({emp.employee_code}) is already marked Present at '{existing_att.site.name}' on Day {day}. You can only mark Overtime (O) at '{site.name}'."
                        )

                    # 1. Update/Create primary WorkforceAttendance
                    WorkforceAttendance.objects.update_or_create(
                        company=company,
                        employee=emp,
                        date=target_date,
                        defaults={
                            'status': AttendanceStatus.PRESENT,
                            'site': site,
                            'is_finalized': True,
                            'recorded_by': user,
                            'notes': f'Muster: Present at {site.name}'
                        }
                    )

                    # 2. Update/Create DailyDutyPay
                    DailyDutyPay.objects.update_or_create(
                        company=company,
                        employee=emp,
                        duty_date=target_date,
                        site=site,
                        defaults={
                            'attendance_status': AttendanceStatus.PRESENT,
                            'client': site.crm_entity,
                            'daily_payable_rate': daily_rate,
                            'payable_percentage': Decimal('100.00'),
                            'payable_amount': daily_rate,
                            'calculation_status': DailyPayCalculationStatus.CALCULATED,
                            'notes': f'Muster: Primary Duty at {site.name}'
                        }
                    )

                elif code == 'O':
                    # Overtime duty at this site
                    DailyDutyPay.objects.update_or_create(
                        company=company,
                        employee=emp,
                        duty_date=target_date,
                        site=site,
                        defaults={
                            'attendance_status': 'OVERTIME',
                            'rate_source': DailyPayRateSource.POST_SPECIFIC_DAILY_PAY,
                            'client': site.crm_entity,
                            'daily_payable_rate': ot_rate,
                            'payable_percentage': Decimal('100.00'),
                            'payable_amount': ot_rate,
                            'calculation_status': DailyPayCalculationStatus.CALCULATED,
                            'notes': f'Muster: Overtime Shift at {site.name}'
                        }
                    )

                elif code == 'D':
                    # Double Shift on Paid Off Day: Earns paid off allowance + duty pay
                    double_rate = ot_rate if ot_rate > Decimal('0.00') else daily_rate
                    WorkforceAttendance.objects.update_or_create(
                        company=company,
                        employee=emp,
                        date=target_date,
                        defaults={
                            'status': AttendanceStatus.WEEKLY_OFF,
                            'site': site,
                            'recorded_by': user,
                            'notes': f'Muster: Double Shift (Off Day Worked) at {site.name}'
                        }
                    )
                    DailyDutyPay.objects.update_or_create(
                        company=company,
                        employee=emp,
                        duty_date=target_date,
                        site=site,
                        defaults={
                            'attendance_status': 'DOUBLE_SHIFT',
                            'client': site.crm_entity,
                            'daily_payable_rate': double_rate,
                            'payable_percentage': Decimal('100.00'),
                            'payable_amount': double_rate,
                            'calculation_status': DailyPayCalculationStatus.CALCULATED,
                            'notes': f'Muster: Double Shift on Weekly Off at {site.name}'
                        }
                    )

                elif code == 'W':
                    # Scheduled Weekly Off
                    WorkforceAttendance.objects.update_or_create(
                        company=company,
                        employee=emp,
                        date=target_date,
                        defaults={
                            'status': AttendanceStatus.WEEKLY_OFF,
                            'site': site,
                            'recorded_by': user,
                            'notes': 'Muster: Scheduled Weekly Off'
                        }
                    )
                    # Off day has 0.00 variable duty pay since base salary covers it
                    DailyDutyPay.objects.filter(
                        company=company, employee=emp, duty_date=target_date, site=site
                    ).delete()

                elif code == 'A':
                    # Absent
                    WorkforceAttendance.objects.update_or_create(
                        company=company,
                        employee=emp,
                        date=target_date,
                        defaults={
                            'status': AttendanceStatus.ABSENT,
                            'site': site,
                            'recorded_by': user,
                            'notes': 'Muster: Absent'
                        }
                    )
                    DailyDutyPay.objects.filter(
                        company=company, employee=emp, duty_date=target_date, site=site
                    ).delete()

                elif code == 'L':
                    # Leave
                    WorkforceAttendance.objects.update_or_create(
                        company=company,
                        employee=emp,
                        date=target_date,
                        defaults={
                            'status': AttendanceStatus.LEAVE,
                            'site': site,
                            'recorded_by': user,
                            'notes': 'Muster: Leave'
                        }
                    )

                elif code == '':
                    # Cleared cell: remove duty pay and attendance for this site on this date
                    DailyDutyPay.objects.filter(
                        company=company, employee=emp, duty_date=target_date, site=site
                    ).delete()
                    WorkforceAttendance.objects.filter(
                        company=company, employee=emp, date=target_date, site=site
                    ).delete()

        return {'status': 'success', 'saved_updates': len(updates), 'added_guards': len(added_guards), 'removed_guards': len(removed_guards)}

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
        all_emps = {
            (e.employee_code or '').strip(): e
            for e in Employee.objects.filter(company=company, is_deleted=False)
        }

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

                code = ''
                if cell_val in ['1', 'P']:
                    code = '1'
                elif cell_val == 'OT':
                    code = 'OT'
                elif cell_val in ['WO+OT', 'DS']:
                    code = 'WO+OT'
                elif cell_val in ['WO', 'OFF']:
                    code = 'WO'
                elif cell_val in ['L', 'PL', 'SL']:
                    code = 'L'
                elif cell_val in ['A', '0']:
                    code = 'A'
                elif cell_val == '':
                    if d <= current_day:
                        code = 'A'
                    else:
                        code = ''

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
        total_double_shifts = 0
        total_earned = Decimal('0.00')

        # Map by date
        date_records = {}
        for dp in duty_pays:
            d_str = str(dp.duty_date)
            if d_str not in date_records:
                date_records[d_str] = []
            
            is_ot = (dp.attendance_status == 'OVERTIME' or dp.rate_source == 'OVERTIME')
            is_ds = (dp.attendance_status == 'DOUBLE_SHIFT')
            
            if is_ot:
                total_ot_shifts += 1
            elif is_ds:
                total_double_shifts += 1
                total_days_worked += 1
            else:
                total_days_worked += 1

            total_earned += dp.payable_amount

            date_records[d_str].append({
                'date': d_str,
                'site_name': dp.site.name if dp.site else 'Central',
                'customer_name': dp.client.name if dp.client else '',
                'duty_type': 'OVERTIME' if is_ot else ('DOUBLE_SHIFT' if is_ds else 'PRESENT'),
                'amount': float(dp.payable_amount),
                'notes': dp.notes or ''
            })

        for att in attendances:
            d_str = str(att.date)
            if att.status in [AttendanceStatus.WEEKLY_OFF, AttendanceStatus.ABSENT, AttendanceStatus.LEAVE]:
                if d_str not in date_records:
                    date_records[d_str] = []
                    date_records[d_str].append({
                        'date': d_str,
                        'site_name': att.site.name if att.site else 'Central',
                        'customer_name': '',
                        'duty_type': att.status,
                        'amount': 0.00,
                        'notes': att.notes or ''
                    })

        sorted_days = sorted(date_records.keys())
        for d in sorted_days:
            ledger_records.extend(date_records[d])

        return {
            'employee_id': str(emp.id),
            'employee_code': emp.employee_code,
            'name': f"{emp.first_name} {emp.last_name}".strip(),
            'designation': emp.designation.name if emp.designation else 'Guard',
            'period_start': str(start_date),
            'period_end': str(end_date),
            'total_days_worked': total_days_worked,
            'total_ot_shifts': total_ot_shifts,
            'total_double_shifts': total_double_shifts,
            'total_earned_pkr': float(total_earned),
            'records': ledger_records
        }
