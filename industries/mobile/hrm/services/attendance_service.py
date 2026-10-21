import calendar
from datetime import date
from decimal import Decimal
from django.db import transaction
from hrm.models import Employee
from ..models import TechnicianProfile, MobileMonthlyAttendance, MobileAttendanceCode

class MobileAttendanceService:
    @staticmethod
    def get_month_calendar_meta(year: int, month: int):
        """Returns days list with day number, ISO date, and short day name (e.g. 'Tue')."""
        num_days = calendar.monthrange(year, month)[1]
        days = []
        for d in range(1, num_days + 1):
            cur_date = date(year, month, d)
            # Sunday is day index 6 in Python calendar (Monday=0), or day_name == 'Sun'
            day_name = cur_date.strftime('%a')
            days.append({
                'day': d,
                'date': cur_date.isoformat(),
                'day_name': day_name,
                'is_sunday': cur_date.weekday() == 6,
            })
        return days

    @staticmethod
    def get_monthly_grid(company, year: int, month: int, department_filter: str = None):
        """
        Retrieves the complete monthly attendance sheet grid matching Softech's Data Sheet.
        Includes all active technicians in company with their daily codes and aggregate totals.
        """
        calendar_meta = MobileAttendanceService.get_month_calendar_meta(year, month)

        # Fetch employees who have a TechnicianProfile under this company
        qs = Employee.objects.filter(
            company=company,
            is_active=True,
            is_deleted=False
        ).select_related('mobile_technician_profile', 'department')

        if department_filter:
            qs = qs.filter(mobile_technician_profile__department_type=department_filter)

        # Pre-fetch existing attendance records for the month
        existing_records = {
            rec.employee_id: rec
            for rec in MobileMonthlyAttendance.objects.filter(
                company=company,
                year=year,
                month=month,
                is_deleted=False
            )
        }

        records_to_create = []
        for emp in qs:
            if emp.id not in existing_records:
                new_rec = MobileMonthlyAttendance(
                    company=company,
                    employee=emp,
                    year=year,
                    month=month,
                    days_data={}
                )
                records_to_create.append(new_rec)

        if records_to_create:
            MobileMonthlyAttendance.objects.bulk_create(records_to_create)
            for rec in records_to_create:
                existing_records[rec.employee_id] = rec

        rows = []
        for emp in qs:
            att = existing_records.get(emp.id)
            tech = getattr(emp, 'mobile_technician_profile', None)
            dept_name = tech.get_department_type_display() if tech else (emp.department.name if emp.department else 'General')
            
            rows.append({
                'employee_id': str(emp.id),
                'employee_code': emp.employee_code or f"EMP-{str(emp.id)[:5]}",
                'employee_name': f"{emp.first_name} {emp.last_name}".strip(),
                'department': dept_name,
                'department_code': tech.department_type if tech else 'OTHER',
                'shift_time': tech.shift_time.strftime('%H:%M') if tech and tech.shift_time else '12:00',
                'ot_rate': float(tech.ot_hourly_rate) if tech else 250.0,
                'days': att.days_data if att else {},
                'totals': {
                    'present': att.present_count if att else 0,
                    'late': att.late_count if att else 0,
                    'half_day': att.half_day_count if att else 0,
                    'holiday': att.holiday_count if att else 0,
                    'overtime': float(att.overtime_hours) if att else 0.0,
                    'allowed_half_day': att.allowed_half_day_count if att else 0,
                    'allowed_holiday': att.allowed_holiday_count if att else 0,
                }
            })

        return {
            'year': year,
            'month': month,
            'calendar': calendar_meta,
            'rows': rows,
        }

    @staticmethod
    @transaction.atomic
    def save_cell(company, employee_id, year: int, month: int, day: int, code: str):
        """Saves a single day's attendance code for an employee and recalculates counters."""
        att, _ = MobileMonthlyAttendance.objects.get_or_create(
            company=company,
            employee_id=employee_id,
            year=year,
            month=month,
            defaults={'days_data': {}}
        )

        code_clean = (code or '').strip().upper()
        days_data = dict(att.days_data)
        if code_clean:
            days_data[str(day)] = code_clean
        else:
            days_data.pop(str(day), None)

        att.days_data = days_data
        att.recalculate_counters()
        att.save(update_fields=[
            'days_data', 'present_count', 'late_count', 'half_day_count',
            'holiday_count', 'overtime_hours', 'allowed_half_day_count',
            'allowed_holiday_count', 'updated_at'
        ])
        return att

    @staticmethod
    @transaction.atomic
    def batch_update_grid(company, year: int, month: int, updates: list):
        """
        Batch saves attendance updates.
        updates format: [{'employee_id': '...', 'days': {'1': 'P', '2': 'L', ...}}]
        """
        updated_records = []
        for item in updates:
            emp_id = item.get('employee_id')
            days_dict = item.get('days', {})

            att, _ = MobileMonthlyAttendance.objects.get_or_create(
                company=company,
                employee_id=emp_id,
                year=year,
                month=month,
                defaults={'days_data': {}}
            )

            current_days = dict(att.days_data)
            for d, code in days_dict.items():
                c = (code or '').strip().upper()
                if c:
                    current_days[str(d)] = c
                else:
                    current_days.pop(str(d), None)

            att.days_data = current_days
            att.recalculate_counters()
            att.save()
            updated_records.append(att)

        return updated_records
