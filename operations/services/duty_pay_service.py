import logging
from decimal import Decimal
from datetime import date, datetime, timedelta
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.core.exceptions import ValidationError

from companies.models import Company
from crm.models import CRMEntity
from hrm.models import (
    Employee, EmployeeSalaryAssignment, CompanyPayrollPolicy,
    AttendanceStatus, WorkforceAttendance
)
from operations.models import (
    DailyDutyPay, DailyPayRateSource, DailyPayCalculationStatus,
    SecurityPost, ContractRate, DutyRoster, DutyReplacement,
    Deployment, ServiceContract, OperationalSite
)
from operations.services.attendance_service import resolve_effective_attendance_status

logger = logging.getLogger(__name__)


def _parse_date(d):
    if isinstance(d, datetime):
        return d.date()
    if isinstance(d, date):
        return d
    return date.fromisoformat(str(d))


def get_company_payroll_policy(company_id):
    """
    Returns active CompanyPayrollPolicy or sensible defaults.
    """
    policy = CompanyPayrollPolicy.objects.filter(
        company_id=company_id,
        is_active=True,
        is_deleted=False
    ).first()
    if policy:
        return {
            'divisor': policy.daily_rate_divisor or Decimal('30.00'),
            'holiday_pay_percentage': policy.holiday_pay_percentage if policy.holiday_pay_percentage is not None else Decimal('100.00'),
            'weekly_off_pay_percentage': policy.weekly_off_pay_percentage if policy.weekly_off_pay_percentage is not None else Decimal('100.00'),
            'standard_monthly_hours': policy.standard_monthly_hours or Decimal('160.00'),
            'overtime_multiplier': policy.overtime_multiplier or Decimal('1.50'),
        }
    return {
        'divisor': Decimal('30.00'),
        'holiday_pay_percentage': Decimal('100.00'),
        'weekly_off_pay_percentage': Decimal('100.00'),
        'standard_monthly_hours': Decimal('160.00'),
        'overtime_multiplier': Decimal('1.50'),
    }


def resolve_daily_rate_and_attribution(company_id, employee, duty_date, roster=None, replacement=None, attendance_status=None):
    """
    Authoritative resolution engine for daily duty rate, replacement duty pay, and cost attribution.
    
    Resolution hierarchy:
    1. Replacement Duty / Post Rate:
       a. Worked SecurityPost explicit daily_pay_rate (e.g. 500.00)
       b. ServiceContract ContractRate for post designation & date
       c. Replaced employee's effective daily rate
    2. Working employee's compensation setup:
       a. Explicit daily_rate on EmployeeSalaryAssignment
       b. Monthly base_salary / configured policy divisor (e.g. 30, 26)
    
    Attendance pay percentage:
       PRESENT -> 100%
       PAID_LEAVE -> 100%
       HALF_DAY -> 50%
       ABSENT -> 0%
       UNPAID_LEAVE -> 0%
       HOLIDAY / WEEKLY_OFF -> configurable company policy percentage
    
    Cost attribution:
       Client, contract, site, post follow the work actually performed that day.
    """
    d_date = _parse_date(duty_date)
    policy = get_company_payroll_policy(company_id)
    divisor = policy['divisor']

    # 1. Identify Replacement Context
    is_replacement = False
    replaced_emp = None
    if replacement:
        is_replacement = True
        replaced_emp = replacement.original_employee
    elif roster and roster.is_replacement:
        is_replacement = True
        if roster.replacement_for and roster.replacement_for.employee:
            replaced_emp = roster.replacement_for.employee
        elif getattr(roster, 'original_employee', None):
            replaced_emp = roster.original_employee

    # 2. Identify Worked Operational Entities
    worked_post = roster.post if roster and roster.post else None
    worked_site = roster.site if roster and roster.site else None
    worked_contract = None

    # Home deployment of the working guard
    home_dep = Deployment.objects.filter(
        company_id=company_id,
        employee=employee,
        status='ACTIVE',
        is_deleted=False
    ).select_related('site', 'post', 'service_contract', 'crm_entity').first()

    # If roster has no site/post, fallback to home deployment
    if not worked_site and home_dep:
        worked_site = home_dep.site
    if not worked_post and home_dep:
        worked_post = home_dep.post

    # Determine contract covering worked post/site
    if worked_post and worked_post.service_contract:
        worked_contract = worked_post.service_contract
    elif worked_site:
        worked_contract = worked_site.service_contracts.filter(is_deleted=False).first()
    if not worked_contract and home_dep and not is_replacement:
        worked_contract = home_dep.service_contract

    # Determine client for cost attribution
    worked_client = None
    if worked_site and worked_site.crm_entity:
        worked_client = worked_site.crm_entity
    elif worked_contract and worked_contract.crm_entity:
        worked_client = worked_contract.crm_entity
    elif home_dep and home_dep.crm_entity and not is_replacement:
        worked_client = home_dep.crm_entity

    # 3. Rate Resolution
    daily_rate = Decimal('0.00')
    rate_source = DailyPayRateSource.EMPLOYEE_MONTHLY_DIVISOR
    rate_ref = ''
    unresolved_reason = ''

    # Case A: Replacement Duty or Worked Duty with Post-specific rate
    if is_replacement or (worked_post and worked_post.daily_pay_rate and worked_post.daily_pay_rate > 0):
        # 1. Post explicit daily pay rate
        if worked_post and worked_post.daily_pay_rate and worked_post.daily_pay_rate > Decimal('0.00'):
            daily_rate = worked_post.daily_pay_rate
            rate_source = DailyPayRateSource.POST_RATE
            rate_ref = f"Post Rate: {worked_post.post_name} ({worked_post.daily_pay_rate})"
        # 2. Contract designation pay rate
        elif worked_contract and worked_post and worked_post.required_designation_id:
            cr = ContractRate.objects.filter(
                company_id=company_id,
                service_contract=worked_contract,
                designation_id=worked_post.required_designation_id,
                effective_date__lte=d_date,
                is_deleted=False
            ).order_by('-effective_date').first()
            if cr and cr.pay_rate and cr.pay_rate > Decimal('0.00'):
                daily_rate = cr.pay_rate
                rate_source = DailyPayRateSource.CONTRACT_RATE
                rate_ref = f"Contract {worked_contract.contract_code} [{worked_post.required_designation.name}] ({cr.pay_rate})"
        # 3. Replaced employee rate (if replacement and post rate was not explicitly defined)
        elif is_replacement and replaced_emp:
            rep_comp = EmployeeSalaryAssignment.resolve_compensation(company_id, replaced_emp, on_date=d_date)
            if rep_comp:
                if rep_comp.daily_rate and rep_comp.daily_rate > Decimal('0.00'):
                    daily_rate = rep_comp.daily_rate
                    rate_source = DailyPayRateSource.REPLACED_EMPLOYEE_RATE
                    rate_ref = f"Replaced Guard ({replaced_emp.first_name} {replaced_emp.last_name}) Daily Rate: {rep_comp.daily_rate}"
                elif rep_comp.base_salary and rep_comp.base_salary > Decimal('0.00'):
                    daily_rate = (rep_comp.base_salary / divisor).quantize(Decimal('0.01'))
                    rate_source = DailyPayRateSource.REPLACED_EMPLOYEE_RATE
                    rate_ref = f"Replaced Guard ({replaced_emp.first_name} {replaced_emp.last_name}) Base {rep_comp.base_salary} / {divisor}"

    # Case B: Working Employee's Standard Compensation (Normal Assignment or Fallback)
    if daily_rate == Decimal('0.00'):
        emp_comp = EmployeeSalaryAssignment.resolve_compensation(company_id, employee, on_date=d_date)
        if emp_comp:
            if emp_comp.daily_rate and emp_comp.daily_rate > Decimal('0.00'):
                daily_rate = emp_comp.daily_rate
                rate_source = DailyPayRateSource.EMPLOYEE_DAILY_RATE
                rate_ref = f"Employee Daily Rate: {emp_comp.daily_rate}"
            elif emp_comp.base_salary and emp_comp.base_salary > Decimal('0.00'):
                daily_rate = (emp_comp.base_salary / divisor).quantize(Decimal('0.01'))
                rate_source = DailyPayRateSource.EMPLOYEE_MONTHLY_DIVISOR
                rate_ref = f"Base Salary {emp_comp.base_salary} / {divisor}"
            else:
                unresolved_reason = "Employee salary assignment has zero base salary and no daily rate."
        else:
            unresolved_reason = "No active salary assignment or post rate found on this date."

    # 4. Attendance Pay Percentage
    att_st = (attendance_status or AttendanceStatus.PRESENT).upper()
    if att_st in [AttendanceStatus.PRESENT, 'PRESENT']:
        payable_percentage = Decimal('100.00')
    elif att_st in [AttendanceStatus.PAID_LEAVE, 'PAID_LEAVE']:
        payable_percentage = Decimal('100.00')
    elif att_st in [AttendanceStatus.HALF_DAY, 'HALF_DAY']:
        payable_percentage = Decimal('50.00')
    elif att_st in [AttendanceStatus.ABSENT, 'ABSENT']:
        payable_percentage = Decimal('0.00')
    elif att_st in [AttendanceStatus.UNPAID_LEAVE, 'UNPAID_LEAVE']:
        payable_percentage = Decimal('0.00')
    elif att_st in [AttendanceStatus.HOLIDAY, 'HOLIDAY']:
        payable_percentage = policy['holiday_pay_percentage']
    elif att_st in [AttendanceStatus.WEEKLY_OFF, 'WEEKLY_OFF']:
        payable_percentage = policy['weekly_off_pay_percentage']
    else:
        payable_percentage = Decimal('0.00')

    # Calculate payable amount
    payable_amount = (daily_rate * (payable_percentage / Decimal('100.00'))).quantize(Decimal('0.01'))

    # Calculation Status
    calc_status = DailyPayCalculationStatus.CALCULATED
    if daily_rate <= Decimal('0.00') and att_st not in [AttendanceStatus.ABSENT, AttendanceStatus.UNPAID_LEAVE]:
        calc_status = DailyPayCalculationStatus.UNRESOLVED

    return {
        'duty_date': d_date,
        'attendance_status': att_st,
        'roster': roster,
        'replacement': replacement,
        'is_replacement_duty': is_replacement,
        'replaced_employee': replaced_emp,
        'home_deployment': home_dep,
        'client': worked_client,
        'contract': worked_contract,
        'site': worked_site,
        'post': worked_post,
        'rate_source': rate_source,
        'rate_source_reference': rate_ref,
        'daily_payable_rate': daily_rate,
        'payable_percentage': payable_percentage,
        'payable_amount': payable_amount,
        'calculation_status': calc_status,
        'unresolved_reason': unresolved_reason,
    }


def generate_daily_duty_pay(company, employee, duty_date, roster=None, user=None, force_recalculate=False):
    """
    Idempotently creates or updates the DailyDutyPay record for an employee on a given date.
    Respects is_frozen immutability if consumed by finalized payroll.
    """
    company_id = company.id if hasattr(company, 'id') else company
    emp_id = employee.id if hasattr(employee, 'id') else employee
    emp = employee if isinstance(employee, Employee) else Employee.objects.get(pk=emp_id, company_id=company_id)
    d_date = _parse_date(duty_date)

    # 1. Resolve Roster if not explicitly passed
    if not roster:
        roster = DutyRoster.objects.filter(
            company_id=company_id,
            employee=emp,
            duty_date=d_date,
            is_deleted=False
        ).exclude(status='CANCELLED').select_related('shift', 'site', 'post').first()

    # 2. Check for DutyReplacement if replacement roster
    replacement = None
    if roster and roster.is_replacement:
        replacement = DutyReplacement.objects.filter(
            company_id=company_id,
            replacement_employee=emp,
            duty_date=d_date,
            is_deleted=False
        ).select_related('original_employee', 'original_roster', 'site', 'post', 'shift').first()
    elif not roster:
        # Check if guard covered a replacement duty without a roster
        replacement = DutyReplacement.objects.filter(
            company_id=company_id,
            replacement_employee=emp,
            duty_date=d_date,
            is_deleted=False
        ).select_related('original_employee', 'original_roster', 'site', 'post', 'shift').first()

    # 3. Check for existing record
    filter_kwargs = {
        'company_id': company_id,
        'employee': emp,
        'duty_date': d_date,
        'is_deleted': False
    }
    if roster:
        filter_kwargs['roster'] = roster
    else:
        filter_kwargs['roster__isnull'] = True

    existing = DailyDutyPay.objects.filter(**filter_kwargs).first()
    if existing:
        if existing.is_frozen:
            if force_recalculate:
                raise ValidationError("Cannot recalculate frozen daily pay record locked by finalized payroll.")
            return existing, False

    # 4. Resolve effective attendance status
    eff_status, att_obj, _ = resolve_effective_attendance_status(emp, d_date)

    # 5. Run Resolution Logic
    resolved = resolve_daily_rate_and_attribution(
        company_id=company_id,
        employee=emp,
        duty_date=d_date,
        roster=roster,
        replacement=replacement,
        attendance_status=eff_status
    )

    with transaction.atomic():
        if existing:
            existing.attendance = att_obj
            existing.attendance_status = resolved['attendance_status']
            existing.replacement = resolved['replacement']
            existing.is_replacement_duty = resolved['is_replacement_duty']
            existing.replaced_employee = resolved['replaced_employee']
            existing.home_deployment = resolved['home_deployment']
            existing.client = resolved['client']
            existing.contract = resolved['contract']
            existing.site = resolved['site']
            existing.post = resolved['post']
            existing.rate_source = resolved['rate_source']
            existing.rate_source_reference = resolved['rate_source_reference']
            existing.daily_payable_rate = resolved['daily_payable_rate']
            existing.payable_percentage = resolved['payable_percentage']
            existing.payable_amount = resolved['payable_amount']
            existing.calculation_status = (
                DailyPayCalculationStatus.RECALCULATED
                if resolved['calculation_status'] == DailyPayCalculationStatus.CALCULATED
                else resolved['calculation_status']
            )
            existing.unresolved_reason = resolved['unresolved_reason']
            if user:
                existing.calculated_by = user
            existing.save()
            return existing, False
        else:
            pay_record = DailyDutyPay.objects.create(
                company_id=company_id,
                employee=emp,
                duty_date=d_date,
                attendance=att_obj,
                attendance_status=resolved['attendance_status'],
                roster=roster,
                replacement=resolved['replacement'],
                is_replacement_duty=resolved['is_replacement_duty'],
                replaced_employee=resolved['replaced_employee'],
                home_deployment=resolved['home_deployment'],
                client=resolved['client'],
                contract=resolved['contract'],
                site=resolved['site'],
                post=resolved['post'],
                rate_source=resolved['rate_source'],
                rate_source_reference=resolved['rate_source_reference'],
                daily_payable_rate=resolved['daily_payable_rate'],
                payable_percentage=resolved['payable_percentage'],
                payable_amount=resolved['payable_amount'],
                calculation_status=resolved['calculation_status'],
                unresolved_reason=resolved['unresolved_reason'],
                calculated_by=user if user and user.is_authenticated else None
            )
            return pay_record, True


def bulk_generate_daily_pay_inputs(company, start_date, end_date, employee_ids=None, user=None):
    """
    Bulk generates daily duty pay inputs across an operational date range for all eligible employees.
    """
    company_id = company.id if hasattr(company, 'id') else company
    s_date = _parse_date(start_date)
    e_date = _parse_date(end_date)

    if s_date > e_date:
        raise ValidationError({'end_date': 'End date must be on or after start date.'})

    emp_qs = Employee.objects.filter(
        company_id=company_id,
        is_deleted=False
    ).exclude(employment_status='TERMINATED')

    if employee_ids:
        emp_qs = emp_qs.filter(id__in=employee_ids)

    employees = list(emp_qs)
    total_processed = 0
    created_count = 0
    updated_count = 0
    unresolved_count = 0
    skipped_frozen = 0

    cur_date = s_date
    while cur_date <= e_date:
        for emp in employees:
            total_processed += 1
            try:
                rec, created = generate_daily_duty_pay(company, emp, cur_date, user=user)
                if created:
                    created_count += 1
                else:
                    if rec.is_frozen:
                        skipped_frozen += 1
                    else:
                        updated_count += 1
                if rec.calculation_status == DailyPayCalculationStatus.UNRESOLVED:
                    unresolved_count += 1
            except Exception as e:
                logger.error(f"Error generating daily pay for {emp.id} on {cur_date}: {e}")
        cur_date += timedelta(days=1)

    return {
        'total_processed': total_processed,
        'created_count': created_count,
        'updated_count': updated_count,
        'unresolved_count': unresolved_count,
        'skipped_frozen': skipped_frozen,
        'start_date': str(s_date),
        'end_date': str(e_date)
    }


def recalculate_daily_duty_pay(company, pay_record_id, user=None):
    """
    Recalculates an existing daily duty pay record, refreshing attendance and rate resolution.
    Strictly prevents modifying locked/frozen records.
    """
    company_id = company.id if hasattr(company, 'id') else company
    pay_record = DailyDutyPay.objects.select_for_update().get(
        pk=pay_record_id,
        company_id=company_id,
        is_deleted=False
    )

    if pay_record.is_frozen:
        raise ValidationError("Cannot recalculate a locked/frozen daily pay record consumed by finalized payroll.")

    # Re-run resolution
    rec, _ = generate_daily_duty_pay(
        company=company_id,
        employee=pay_record.employee,
        duty_date=pay_record.duty_date,
        roster=pay_record.roster,
        user=user,
        force_recalculate=True
    )
    return rec


def get_daily_pay_review_workspace(company, duty_date=None, start_date=None, end_date=None,
                                   classification=None, site_id=None, unresolved_only=False,
                                   replacement_only=False, search=None):
    """
    Assembles the executive Daily Pay Review Workspace for payroll preparation.
    Highlights replacement rates, missing rates, and unresolved calculations.
    """
    company_id = company.id if hasattr(company, 'id') else company

    qs = DailyDutyPay.objects.filter(
        company_id=company_id,
        is_deleted=False
    ).select_related(
        'employee', 'employee__designation', 'roster', 'roster__shift',
        'roster__post', 'replacement', 'replaced_employee', 'home_deployment',
        'home_deployment__site', 'home_deployment__post',
        'client', 'contract', 'site', 'post', 'attendance'
    )

    if duty_date:
        d = _parse_date(duty_date)
        qs = qs.filter(duty_date=d)
    else:
        if start_date:
            qs = qs.filter(duty_date__gte=_parse_date(start_date))
        if end_date:
            qs = qs.filter(duty_date__lte=_parse_date(end_date))

    if classification:
        qs = qs.filter(employee__classification=classification)

    if site_id:
        qs = qs.filter(site_id=site_id)

    if unresolved_only:
        qs = qs.filter(calculation_status=DailyPayCalculationStatus.UNRESOLVED)

    if replacement_only:
        qs = qs.filter(is_replacement_duty=True)

    if search:
        s = search.strip()
        qs = qs.filter(
            Q(employee__first_name__icontains=s) |
            Q(employee__last_name__icontains=s) |
            Q(employee__employee_code__icontains=s) |
            Q(site__name__icontains=s) |
            Q(post__post_name__icontains=s) |
            Q(contract__contract_code__icontains=s)
        )

    records = list(qs.order_by('-duty_date', 'employee__first_name'))

    # Aggregate KPIs
    total_records = len(records)
    total_payable_amount = sum(r.payable_amount for r in records)
    replacement_count = sum(1 for r in records if r.is_replacement_duty)
    unresolved_count = sum(1 for r in records if r.calculation_status == DailyPayCalculationStatus.UNRESOLVED)
    frozen_count = sum(1 for r in records if r.is_frozen)
    missing_rate_count = sum(1 for r in records if r.daily_payable_rate <= Decimal('0.00'))

    rows = []
    for r in records:
        emp = r.employee
        # Normal home assignment string
        home_str = 'Unassigned'
        if r.home_deployment:
            home_site = r.home_deployment.site.name if r.home_deployment.site else ''
            home_post = r.home_deployment.post.post_name if r.home_deployment.post else ''
            home_str = f"{home_site}{' • ' + home_post if home_post else ''}"

        # Actual worked duty string
        worked_str = 'General Duty'
        if r.site:
            s_name = r.site.name
            p_name = r.post.post_name if r.post else ''
            worked_str = f"{s_name}{' • ' + p_name if p_name else ''}"

        # Shift details
        shift_str = r.roster.shift.name if r.roster and r.roster.shift else 'Standard'

        # Highlight flags
        is_replacement_rate = r.is_replacement_duty and r.rate_source in [
            DailyPayRateSource.POST_RATE,
            DailyPayRateSource.CONTRACT_RATE,
            DailyPayRateSource.REPLACED_EMPLOYEE_RATE
        ]
        has_missing_rate = r.daily_payable_rate <= Decimal('0.00')
        is_conflicting = bool(r.is_replacement_duty and r.home_deployment and r.home_deployment.site_id != r.site_id)

        rows.append({
            'id': str(r.id),
            'employee_id': str(emp.id),
            'employee_name': f"{emp.first_name} {emp.last_name}".strip(),
            'employee_code': emp.employee_code,
            'classification': getattr(emp, 'classification', 'DIRECT'),
            'designation_name': emp.designation.name if emp.designation else '',
            'duty_date': str(r.duty_date),
            'attendance_status': r.attendance_status,
            'normal_assignment': home_str,
            'actual_duty': worked_str,
            'shift_name': shift_str,
            'is_replacement_duty': r.is_replacement_duty,
            'replaced_employee_id': str(r.replaced_employee_id) if r.replaced_employee_id else None,
            'replaced_employee_name': f"{r.replaced_employee.first_name} {r.replaced_employee.last_name}".strip() if r.replaced_employee else None,
            # Rate & Pay
            'rate_source': r.rate_source,
            'rate_source_label': r.get_rate_source_display(),
            'rate_source_reference': r.rate_source_reference,
            'daily_payable_rate': float(r.daily_payable_rate),
            'payable_percentage': float(r.payable_percentage),
            'payable_amount': float(r.payable_amount),
            # Cost Attribution
            'client_name': r.client.name if r.client else '',
            'contract_code': r.contract.contract_code if r.contract else '',
            'site_name': r.site.name if r.site else '',
            'post_name': r.post.post_name if r.post else '',
            # Status & Indicators
            'calculation_status': r.calculation_status,
            'is_frozen': r.is_frozen,
            'unresolved_reason': r.unresolved_reason,
            'notes': r.notes,
            # UI Highlights
            'is_replacement_rate': is_replacement_rate,
            'has_missing_rate': has_missing_rate,
            'is_conflicting_duty': is_conflicting,
            'is_unresolved': r.calculation_status == DailyPayCalculationStatus.UNRESOLVED
        })

    return {
        'totals': {
            'total_records': total_records,
            'total_payable_amount': float(total_payable_amount),
            'replacement_count': replacement_count,
            'unresolved_count': unresolved_count,
            'missing_rate_count': missing_rate_count,
            'frozen_count': frozen_count
        },
        'records': rows
    }
