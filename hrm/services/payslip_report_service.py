import csv
import io
from datetime import datetime, date, timedelta
from django.utils import timezone
from django.db.models import Q
from hrm.models import Payslip, PayslipDisbursement, PayrollDisbursement

class PayslipReportService:
    @staticmethod
    def get_payslip_report(
        company_id,
        date_from=None,
        date_to=None,
        month_from=None,
        month_to=None,
        date_range_preset=None,
        employee_from=None,
        employee_to=None,
        employee_id=None,
        site_id=None,
        client_id=None,
        region=None,
        day_supervisor=None,
        night_supervisor=None,
        is_paid='BOTH',
        is_stop_payment='BOTH',
        account_type='ALL',
        salary_type=None,
        in_main_payroll=True
    ):
        """
        Generates Payslip Report matching One Security legacy HRIS specifications.
        Values come strictly from finalized immutable Payslip records.
        Payment status checks actual Finance disbursement records.
        """
        today = timezone.now().date()

        # 1. Preset date range resolution
        if date_range_preset:
            p = str(date_range_preset).lower()
            if p == 'today':
                date_from = today
                date_to = today
            elif p == 'last_7_days':
                date_from = today - timedelta(days=7)
                date_to = today
            elif p == 'last_15_days':
                date_from = today - timedelta(days=15)
                date_to = today
            elif p == 'last_30_days':
                date_from = today - timedelta(days=30)
                date_to = today
            elif p == 'last_60_days':
                date_from = today - timedelta(days=60)
                date_to = today
            elif p == 'last_90_days':
                date_from = today - timedelta(days=90)
                date_to = today

        # 2. Month range resolution
        if month_from or month_to:
            try:
                if month_from:
                    mf = datetime.strptime(str(month_from), '%Y-%m-%d').date() if '-' in str(month_from) else today
                    date_from = mf.replace(day=1)
                if month_to:
                    mt = datetime.strptime(str(month_to), '%Y-%m-%d').date() if '-' in str(month_to) else today
                    # month end
                    if mt.month == 12:
                        date_to = date(mt.year + 1, 1, 1) - timedelta(days=1)
                    else:
                        date_to = date(mt.year, mt.month + 1, 1) - timedelta(days=1)
            except Exception:
                pass

        qs = Payslip.objects.filter(company_id=company_id, is_deleted=False).select_related(
            'employee', 'employee__department', 'employee__designation',
            'payroll_run', 'payroll_run__payroll_period', 'stop_payment_by'
        ).prefetch_related('lines', 'lines__salary_component', 'employee__payment_destinations')

        # Date range filtering on payroll period or created_at
        if date_from:
            qs = qs.filter(
                Q(payroll_run__payroll_period__start_date__gte=date_from) |
                Q(created_at__date__gte=date_from)
            )
        if date_to:
            qs = qs.filter(
                Q(payroll_run__payroll_period__end_date__lte=date_to) |
                Q(created_at__date__lte=date_to)
            )

        # Employee code range
        if employee_id:
            qs = qs.filter(employee_id=employee_id)
        if employee_from:
            qs = qs.filter(employee__employee_code__gte=employee_from)
        if employee_to:
            qs = qs.filter(employee__employee_code__lte=employee_to)

        # Stop payment filter
        if str(is_stop_payment).upper() == 'YES':
            qs = qs.filter(is_stop_payment=True)
        elif str(is_stop_payment).upper() == 'NO':
            qs = qs.filter(is_stop_payment=False)

        # Main payroll filter (non-supplementary runs)
        if in_main_payroll:
            qs = qs.exclude(payroll_run__notes__icontains='supplementary')

        payslips = list(qs.order_by('employee__employee_code', '-created_at'))

        # Check real finance disbursement statuses
        payslip_ids = [p.id for p in payslips]
        disbursements = PayslipDisbursement.objects.filter(
            company_id=company_id,
            payslip_id__in=payslip_ids,
            is_deleted=False
        )
        # Map: payslip_id -> True if disbursed
        disbursed_map = {
            d.payslip_id: (d.status in ('DISBURSED', 'COMPLETED', 'PAID'))
            for d in disbursements
        }

        # Check operational deployments for site/client/supervisor if needed
        site_client_map = {}
        try:
            from operations.models import Deployment
            emp_ids = [p.employee_id for p in payslips]
            deps = Deployment.objects.filter(
                company_id=company_id,
                employee_id__in=emp_ids,
                is_deleted=False
            ).select_related('site', 'site__client', 'site__branch')
            for dep in deps:
                if dep.employee_id not in site_client_map:
                    site_client_map[dep.employee_id] = {
                        'site_id': str(dep.site_id) if dep.site_id else '',
                        'site_name': dep.site.name if dep.site else '',
                        'client_id': str(dep.site.client_id) if dep.site and dep.site.client_id else '',
                        'client_name': dep.site.client.name if dep.site and dep.site.client else '',
                        'region': dep.site.branch.name if dep.site and dep.site.branch else '',
                    }
        except Exception:
            pass

        report_rows = []
        tot_gross = 0
        tot_deductions = 0
        tot_net = 0
        paid_count = 0
        unpaid_count = 0
        hold_count = 0

        for ps in payslips:
            emp = ps.employee
            is_disbursed = disbursed_map.get(ps.id, False)
            pay_status = 'PAID' if is_disbursed else 'UNPAID'

            # Apply is_paid filter
            if str(is_paid).upper() == 'PAID' and pay_status != 'PAID':
                continue
            if str(is_paid).upper() == 'UNPAID' and pay_status != 'UNPAID':
                continue

            op_info = site_client_map.get(emp.id, {})
            if site_id and op_info.get('site_id') != str(site_id):
                continue
            if client_id and op_info.get('client_id') != str(client_id):
                continue
            if region and region.lower() not in op_info.get('region', '').lower():
                continue

            # Resolve payment destination
            dest = emp.payment_destinations.filter(is_active=True, is_preferred=True).first()
            if not dest:
                dest = emp.payment_destinations.filter(is_active=True).first()

            acct_type = 'CASH'
            dest_info = ''
            if dest:
                if dest.payment_method == 'BANK_TRANSFER':
                    acct_type = 'BANK'
                    dest_info = f"{dest.bank_name} - {dest.account_number or dest.iban}"
                elif dest.payment_method == 'WALLET':
                    acct_type = 'WALLET'
                    dest_info = f"{dest.wallet_provider} - {dest.wallet_number}"
                else:
                    acct_type = dest.payment_method
                    dest_info = dest.get_payment_method_display()

            if str(account_type).upper() not in ('ALL', 'BOTH') and acct_type != str(account_type).upper():
                continue

            # Parse lines for breakdown
            earnings = []
            deductions = []
            eobi_amount = 0
            sessi_amount = 0
            advance_amount = 0
            penalty_amount = 0
            mess_amount = 0

            for line in ps.lines.all():
                code = (line.salary_component.code if line.salary_component else '').upper()
                amt = float(line.amount)
                if line.component_type == 'EARNING':
                    earnings.append({
                        'name': line.description or (line.salary_component.name if line.salary_component else 'Earning'),
                        'amount': amt
                    })
                elif line.component_type == 'DEDUCTION':
                    deductions.append({
                        'name': line.description or (line.salary_component.name if line.salary_component else 'Deduction'),
                        'amount': amt
                    })
                    if 'EOBI' in code or 'EOBI' in (line.description or '').upper():
                        eobi_amount += amt
                    elif 'SESSI' in code or 'SESSI' in (line.description or '').upper() or 'PESSI' in code:
                        sessi_amount += amt
                    elif 'ADVANCE' in code or 'ADVANCE' in (line.description or '').upper():
                        advance_amount += amt
                    elif 'PENALTY' in code or 'FINE' in code:
                        penalty_amount += amt
                    elif 'MESS' in code:
                        mess_amount += amt

            gross = float(ps.gross_amount)
            ded = float(ps.deduction_amount)
            net = float(ps.net_amount)

            tot_gross += gross
            tot_deductions += ded
            tot_net += net

            if pay_status == 'PAID':
                paid_count += 1
            else:
                unpaid_count += 1
            if ps.is_stop_payment:
                hold_count += 1

            period_name = ps.payroll_run.payroll_period.name if (ps.payroll_run and ps.payroll_run.payroll_period) else ''

            report_rows.append({
                'payslip_id': str(ps.id),
                'payslip_number': ps.payslip_number,
                'period': period_name,
                'employee_id': str(emp.id),
                'employee_code': emp.employee_code,
                'previous_employee_code': emp.previous_employee_code,
                'full_name': emp.get_full_name(),
                'father_name': emp.father_name,
                'designation': emp.designation.name if emp.designation else '',
                'department': emp.department.name if emp.department else '',
                'site': op_info.get('site_name', ''),
                'client': op_info.get('client_name', ''),
                'region': op_info.get('region', ''),
                'gross_amount': gross,
                'deduction_amount': ded,
                'net_amount': net,
                'payment_status': pay_status,
                'is_stop_payment': ps.is_stop_payment,
                'stop_payment_reason': ps.stop_payment_reason,
                'stop_payment_by': ps.stop_payment_by.get_full_name() if ps.stop_payment_by else '',
                'stop_payment_at': ps.stop_payment_at.strftime('%Y-%m-%d %H:%M') if ps.stop_payment_at else '',
                'account_type': acct_type,
                'destination_info': dest_info,
                'eobi': eobi_amount,
                'sessi': sessi_amount,
                'advance': advance_amount,
                'penalty': penalty_amount,
                'mess': mess_amount,
                'earnings': earnings,
                'deductions': deductions
            })

        return {
            'rows': report_rows,
            'totals': {
                'total_payslips': len(report_rows),
                'total_gross': tot_gross,
                'total_deductions': tot_deductions,
                'total_net': tot_net,
                'paid_count': paid_count,
                'unpaid_count': unpaid_count,
                'hold_count': hold_count
            }
        }

    @staticmethod
    def export_payslip_report_csv(data):
        output = io.StringIO()
        writer = csv.writer(output)

        writer.writerow([
            'Payslip #', 'Period', 'Employee Code', 'Legacy Code', 'Name', 'Father Name',
            'Designation', 'Department', 'Site/Location', 'Client',
            'Payment Status', 'Hold Status', 'Hold Reason',
            'Account Type', 'Payment Details',
            'Gross Amount', 'Total Deductions', 'Net Amount',
            'EOBI', 'SESSI', 'Advance', 'Penalty', 'Mess'
        ])

        for r in data.get('rows', []):
            writer.writerow([
                r.get('payslip_number', ''),
                r.get('period', ''),
                r.get('employee_code', ''),
                r.get('previous_employee_code', ''),
                r.get('full_name', ''),
                r.get('father_name', ''),
                r.get('designation', ''),
                r.get('department', ''),
                r.get('site', ''),
                r.get('client', ''),
                r.get('payment_status', ''),
                'HOLD' if r.get('is_stop_payment') else 'ACTIVE',
                r.get('stop_payment_reason', ''),
                r.get('account_type', ''),
                r.get('destination_info', ''),
                f"{r.get('gross_amount', 0):.2f}",
                f"{r.get('deduction_amount', 0):.2f}",
                f"{r.get('net_amount', 0):.2f}",
                f"{r.get('eobi', 0):.2f}",
                f"{r.get('sessi', 0):.2f}",
                f"{r.get('advance', 0):.2f}",
                f"{r.get('penalty', 0):.2f}",
                f"{r.get('mess', 0):.2f}"
            ])

        return output.getvalue()
