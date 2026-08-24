"""
reports/services/hr_analytics.py

Phase 8E-1 — HR Analytics Reporting Service
Covers Workforce Utilization (DutyAssignment & WorkforceAttendance)
and Payroll Summary (PayrollRun, Payslip, PayslipLine).
"""
from datetime import datetime, date
from decimal import Decimal
from django.db.models import Sum, Count, Q, DecimalField
from django.db.models.functions import Coalesce

from reports.services.base import BaseReportingService
from operations.models import DutyAssignment
from hrm.models import WorkforceAttendance, PayrollRun, Payslip, PayslipLine


class HRAnalyticsReportingService(BaseReportingService):
    def get_workforce_utilization(self, start_date=None, end_date=None, group_by=None):
        """
        Calculates workforce utilization by comparing scheduled duty assignment hours
        against actual attendance check-in/check-out hours.
        Optimized to avoid full model hydration by using values().iterator().
        """
        # 1. Scheduled Hours from DutyAssignment
        duty_qs = DutyAssignment.objects.filter(
            company_id=self.company_id,
            is_deleted=False,
            start_time__isnull=False,
            end_time__isnull=False
        ).exclude(status='CANCELLED')

        duty_qs = self.filter_by_date(duty_qs, 'date', start_date, end_date)

        duty_fields = ['employee_id', 'employee__first_name', 'employee__last_name', 
                       'employee__department_id', 'employee__department__name', 
                       'site_id', 'site__name', 'start_time', 'end_time']
        
        duty_records = duty_qs.values(*duty_fields).iterator(chunk_size=2000)

        scheduled_map = {}
        total_scheduled_hours = 0.0

        for duty in duty_records:
            dt_start = datetime.combine(date.min, duty['start_time'])
            dt_end = datetime.combine(date.min, duty['end_time'])
            hours = max(0.0, (dt_end - dt_start).total_seconds() / 3600.0)

            total_scheduled_hours += hours

            group_key = 'all'
            group_label = 'All Employees'
            if group_by == 'employee':
                group_key = str(duty['employee_id'])
                group_label = f"{duty['employee__first_name']} {duty['employee__last_name']}".strip()
            elif group_by == 'department':
                group_key = str(duty['employee__department_id']) if duty['employee__department_id'] else 'unassigned'
                group_label = duty['employee__department__name'] if duty['employee__department__name'] else 'Unassigned'
            elif group_by == 'site':
                group_key = str(duty['site_id'])
                group_label = duty['site__name'] if duty['site__name'] else 'Unknown Site'

            if group_key not in scheduled_map:
                scheduled_map[group_key] = {'label': group_label, 'scheduled': 0.0, 'actual': 0.0}
            scheduled_map[group_key]['scheduled'] += hours

        # 2. Actual Hours from WorkforceAttendance
        att_qs = WorkforceAttendance.objects.filter(
            company_id=self.company_id,
            is_deleted=False,
            check_in__isnull=False,
            check_out__isnull=False,
        )
        att_qs = self.filter_by_date(att_qs, 'date', start_date, end_date)
        
        att_fields = ['employee_id', 'employee__first_name', 'employee__last_name', 
                      'employee__department_id', 'employee__department__name', 
                      'check_in', 'check_out']
                      
        att_records = att_qs.values(*att_fields).iterator(chunk_size=2000)

        total_actual_hours = 0.0

        for att in att_records:
            hours = max(0.0, (att['check_out'] - att['check_in']).total_seconds() / 3600.0)
            total_actual_hours += hours

            group_key = 'all'
            group_label = 'All Employees'
            if group_by == 'employee':
                group_key = str(att['employee_id'])
                group_label = f"{att['employee__first_name']} {att['employee__last_name']}".strip()
            elif group_by == 'department':
                group_key = str(att['employee__department_id']) if att['employee__department_id'] else 'unassigned'
                group_label = att['employee__department__name'] if att['employee__department__name'] else 'Unassigned'
            elif group_by == 'site':
                group_key = 'unassigned_attendance'
                group_label = 'Attendance (Unlinked to Site)'

            if group_key not in scheduled_map:
                scheduled_map[group_key] = {'label': group_label, 'scheduled': 0.0, 'actual': 0.0}
            scheduled_map[group_key]['actual'] += hours

        total_utilization = (
            round((total_actual_hours / total_scheduled_hours) * 100, 2)
            if total_scheduled_hours > 0 else 0.0
        )

        breakdown = []
        for g_id, data in scheduled_map.items():
            sch = data['scheduled']
            act = data['actual']
            util = round((act / sch) * 100, 2) if sch > 0 else 0.0
            breakdown.append({
                'group_id': g_id,
                'label': data['label'],
                'scheduled_hours': round(sch, 2),
                'actual_hours': round(act, 2),
                'utilization_percentage': util,
            })

        return {
            'start_date': str(start_date) if start_date else None,
            'end_date': str(end_date) if end_date else None,
            'group_by': group_by,
            'total_scheduled_hours': round(total_scheduled_hours, 2),
            'total_actual_hours': round(total_actual_hours, 2),
            'overall_utilization_percentage': total_utilization,
            'breakdown': breakdown,
        }

    def get_payroll_summary(self, start_date=None, end_date=None):
        """
        Summarizes payroll activity within a date range across PayrollRun, Payslip, and PayslipLine.
        """
        payslips = Payslip.objects.filter(
            company_id=self.company_id,
            is_deleted=False,
        )
        if start_date:
            payslips = payslips.filter(payroll_run__payroll_period__start_date__gte=start_date)
        if end_date:
            payslips = payslips.filter(payroll_run__payroll_period__end_date__lte=end_date)

        totals = payslips.aggregate(
            total_gross=Coalesce(Sum('gross_amount'), Decimal('0.00'), output_field=DecimalField()),
            total_tax=Coalesce(Sum('tax_amount'), Decimal('0.00'), output_field=DecimalField()),
            total_deductions=Coalesce(Sum('deduction_amount'), Decimal('0.00'), output_field=DecimalField()),
            total_net=Coalesce(Sum('net_amount'), Decimal('0.00'), output_field=DecimalField()),
            count_payslips=Count('id'),
            count_runs=Count('payroll_run', distinct=True),
        )

        # Breakdown by salary component type via PayslipLine
        lines = PayslipLine.objects.filter(
            payslip__company_id=self.company_id,
            payslip__is_deleted=False,
        )
        if start_date:
            lines = lines.filter(payslip__payroll_run__payroll_period__start_date__gte=start_date)
        if end_date:
            lines = lines.filter(payslip__payroll_run__payroll_period__end_date__lte=end_date)

        component_breakdown = (
            lines.values('salary_component__name', 'component_type')
            .annotate(total_amount=Coalesce(Sum('amount'), Decimal('0.00'), output_field=DecimalField()))
            .order_by('component_type', 'salary_component__name')
        )

        components = [
            {
                'component_name': c['salary_component__name'],
                'component_type': c['component_type'],
                'total_amount': float(c['total_amount']),
            }
            for c in component_breakdown
        ]

        return {
            'start_date': str(start_date) if start_date else None,
            'end_date': str(end_date) if end_date else None,
            'total_payroll_runs': totals['count_runs'],
            'total_payslips': totals['count_payslips'],
            'gross_payroll': float(totals['total_gross']),
            'tax': float(totals['total_tax']),
            'deductions': float(totals['total_deductions']),
            'net_payroll': float(totals['total_net']),
            'components_breakdown': components,
        }
