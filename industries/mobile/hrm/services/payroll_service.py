from decimal import Decimal, ROUND_HALF_UP
from django.db import transaction
from hrm.models import Employee
from ..models import TechnicianProfile, MobileMonthlyAttendance, MobileMonthlyPayroll

def _round_currency(val: Decimal) -> Decimal:
    """Rounds to 2 decimal places using standard ROUND_HALF_UP."""
    return Decimal(str(val)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

class MobilePayrollService:
    @staticmethod
    def calculate_employee_payroll(
        company,
        employee: Employee,
        year: int,
        month: int,
        basic_salary: Decimal = None,
        loan_principal: Decimal = Decimal('0.00'),
        loan_deduction: Decimal = Decimal('0.00'),
        damaged_parts: Decimal = Decimal('0.00'),
        bill_deduction: Decimal = Decimal('0.00'),
        overtime_hours_override: Decimal = None
    ) -> dict:
        """
        Executes the exact Softech Mobile formula matrix for a single technician:
          - Basic Salary
          - Bonus - Time: Rs. 1,000 if late < 3 and holiday == 0
          - Bonus - Zero Holiday: Rs. 1,000 if half_days < 3 and holiday == 0
          - Overtime: hours * (150 if basic <= 18000 else 250)
          - Late deduction: if late > 2: (basic / 30) * (late / 3)
          - Half day deduction: (basic / 30) * (half_days / 2)
          - Holiday deduction: (basic / 30) * holiday
          - Penalty: Rs. 1,000 if holiday >= 1
          - Total deductions (attendance + loan + damaged parts + bills)
          - Net Gross Total
        """
        # Resolve basic salary
        if basic_salary is None:
            # Check if employee has a salary assignment or base salary in universal HRM
            from hrm.models import EmployeeSalaryAssignment
            assignment = EmployeeSalaryAssignment.objects.filter(
                employee=employee,
                company=company,
                status='ACTIVE',
                is_deleted=False
            ).first()
            if assignment and assignment.salary_structure:
                # Sum base earnings components or take base_salary
                basic_salary = Decimal(str(assignment.base_salary or '20000.00'))
            else:
                basic_salary = Decimal('20000.00')
        else:
            basic_salary = Decimal(str(basic_salary))

        # Fetch attendance counters from MobileMonthlyAttendance
        att = MobileMonthlyAttendance.objects.filter(
            company=company,
            employee=employee,
            year=year,
            month=month,
            is_deleted=False
        ).first()

        late_count = att.late_count if att else 0
        half_day_count = att.half_day_count if att else 0
        holiday_count = att.holiday_count if att else 0
        
        if overtime_hours_override is not None:
            overtime_hours = Decimal(str(overtime_hours_override))
        else:
            overtime_hours = att.overtime_hours if att else Decimal('0.00')

        # Determine OT Hourly Rate
        tech = getattr(employee, 'mobile_technician_profile', None)
        if tech and tech.ot_hourly_rate:
            ot_rate = Decimal(str(tech.ot_hourly_rate))
        else:
            ot_rate = Decimal('150.00') if basic_salary <= Decimal('18000.00') else Decimal('250.00')

        # === 1. Earnings (Allowance & Facilities) ===
        # Bonus - Time: =IF(AND(F13<3,F15<1),1000,0)
        if late_count < 3 and holiday_count < 1:
            bonus_time = Decimal('1000.00')
        else:
            bonus_time = Decimal('0.00')

        # Bonus - Zero Holiday: =IF(AND(F14<3,F15<1),1000,0)
        if half_day_count < 3 and holiday_count < 1:
            bonus_zero_holiday = Decimal('1000.00')
        else:
            bonus_zero_holiday = Decimal('0.00')

        # Overtime Pay
        overtime_pay = _round_currency(overtime_hours * ot_rate)

        # Pay & Allowance = SUM(Basic + Bonus Time + Bonus Zero Holiday + Overtime Pay)
        pay_and_allowances = basic_salary + bonus_time + bonus_zero_holiday + overtime_pay

        # === 2. Attendance Deductions ===
        # Daily rate baseline
        daily_rate = basic_salary / Decimal('30.00')

        # Late Deduction: =IF(F13>2, C13/30*F13/3, 0)
        if late_count > 2:
            late_deduction = _round_currency(daily_rate * (Decimal(str(late_count)) / Decimal('3.00')))
        else:
            late_deduction = Decimal('0.00')

        # Half Day Deduction: =C13/30*F14/2
        half_day_deduction = _round_currency(daily_rate * (Decimal(str(half_day_count)) / Decimal('2.00')))

        # Holiday Deduction: =C13/30*F15
        holiday_deduction = _round_currency(daily_rate * Decimal(str(holiday_count)))

        # Penalty: =IF(F15>=1,1000,0)
        if holiday_count >= 1:
            penalty = Decimal('1000.00')
        else:
            penalty = Decimal('0.00')

        total_attendance_deduction = late_deduction + half_day_deduction + holiday_deduction + penalty

        # === 3. Loan & Incident Deductions ===
        loan_principal = Decimal(str(loan_principal))
        loan_deduction = Decimal(str(loan_deduction))
        loan_balance = max(Decimal('0.00'), loan_principal - loan_deduction)
        damaged_parts = Decimal(str(damaged_parts))
        bill_deduction = Decimal(str(bill_deduction))

        total_other_deductions = loan_deduction + damaged_parts + bill_deduction

        # === 4. Gross Total (Net Pay) ===
        gross_total = _round_currency(pay_and_allowances - total_attendance_deduction - total_other_deductions)

        return {
            'basic_salary': basic_salary,
            'bonus_time': bonus_time,
            'bonus_zero_holiday': bonus_zero_holiday,
            'overtime_hours': overtime_hours,
            'overtime_rate': ot_rate,
            'overtime_pay': overtime_pay,
            'pay_and_allowances': pay_and_allowances,
            'late_count': late_count,
            'late_deduction': late_deduction,
            'half_day_count': half_day_count,
            'half_day_deduction': half_day_deduction,
            'holiday_count': holiday_count,
            'holiday_deduction': holiday_deduction,
            'penalty': penalty,
            'total_attendance_deduction': total_attendance_deduction,
            'loan_principal': loan_principal,
            'loan_deduction': loan_deduction,
            'loan_balance': loan_balance,
            'damaged_parts': damaged_parts,
            'bill_deduction': bill_deduction,
            'total_other_deductions': total_other_deductions,
            'gross_total': gross_total,
        }

    @staticmethod
    @transaction.atomic
    def save_or_update_payroll(company, employee: Employee, year: int, month: int, data: dict):
        """Calculates and persists or updates the MobileMonthlyPayroll record."""
        calc = MobilePayrollService.calculate_employee_payroll(
            company=company,
            employee=employee,
            year=year,
            month=month,
            basic_salary=data.get('basic_salary'),
            loan_principal=data.get('loan_principal', Decimal('0.00')),
            loan_deduction=data.get('loan_deduction', Decimal('0.00')),
            damaged_parts=data.get('damaged_parts', Decimal('0.00')),
            bill_deduction=data.get('bill_deduction', Decimal('0.00')),
            overtime_hours_override=data.get('overtime_hours')
        )

        payroll, _ = MobileMonthlyPayroll.objects.update_or_create(
            company=company,
            employee=employee,
            year=year,
            month=month,
            defaults={
                'basic_salary': calc['basic_salary'],
                'bonus_time': calc['bonus_time'],
                'bonus_zero_holiday': calc['bonus_zero_holiday'],
                'overtime_hours': calc['overtime_hours'],
                'overtime_rate': calc['overtime_rate'],
                'overtime_pay': calc['overtime_pay'],
                'pay_and_allowances': calc['pay_and_allowances'],
                'late_count': calc['late_count'],
                'late_deduction': calc['late_deduction'],
                'half_day_count': calc['half_day_count'],
                'half_day_deduction': calc['half_day_deduction'],
                'holiday_count': calc['holiday_count'],
                'holiday_deduction': calc['holiday_deduction'],
                'penalty': calc['penalty'],
                'total_attendance_deduction': calc['total_attendance_deduction'],
                'loan_principal': calc['loan_principal'],
                'loan_deduction': calc['loan_deduction'],
                'loan_balance': calc['loan_balance'],
                'damaged_parts': calc['damaged_parts'],
                'bill_deduction': calc['bill_deduction'],
                'total_other_deductions': calc['total_other_deductions'],
                'gross_total': calc['gross_total'],
                'notes': data.get('notes', ''),
                'status': data.get('status', 'DRAFT')
            }
        )
        return payroll

    @staticmethod
    def get_monthly_payroll_overview(company, year: int, month: int):
        """Fetches full monthly payroll overview with all calculations for the company."""
        employees = Employee.objects.filter(
            company=company,
            is_active=True,
            is_deleted=False
        ).select_related('mobile_technician_profile', 'department')

        existing_payrolls = {
            p.employee_id: p
            for p in MobileMonthlyPayroll.objects.filter(
                company=company,
                year=year,
                month=month,
                is_deleted=False
            )
        }

        records = []
        for emp in employees:
            p = existing_payrolls.get(emp.id)
            if not p:
                # Live calculation preview
                calc = MobilePayrollService.calculate_employee_payroll(company, emp, year, month)
            else:
                calc = {
                    'basic_salary': p.basic_salary,
                    'bonus_time': p.bonus_time,
                    'bonus_zero_holiday': p.bonus_zero_holiday,
                    'overtime_hours': p.overtime_hours,
                    'overtime_rate': p.overtime_rate,
                    'overtime_pay': p.overtime_pay,
                    'pay_and_allowances': p.pay_and_allowances,
                    'late_count': p.late_count,
                    'late_deduction': p.late_deduction,
                    'half_day_count': p.half_day_count,
                    'half_day_deduction': p.half_day_deduction,
                    'holiday_count': p.holiday_count,
                    'holiday_deduction': p.holiday_deduction,
                    'penalty': p.penalty,
                    'total_attendance_deduction': p.total_attendance_deduction,
                    'loan_principal': p.loan_principal,
                    'loan_deduction': p.loan_deduction,
                    'loan_balance': p.loan_balance,
                    'damaged_parts': p.damaged_parts,
                    'bill_deduction': p.bill_deduction,
                    'total_other_deductions': p.total_other_deductions,
                    'gross_total': p.gross_total,
                }

            tech = getattr(emp, 'mobile_technician_profile', None)
            dept = tech.get_department_type_display() if tech else (emp.department.name if emp.department else 'General')

            records.append({
                'payroll_id': str(p.id) if p else None,
                'employee_id': str(emp.id),
                'employee_code': emp.employee_code or f"EMP-{str(emp.id)[:5]}",
                'employee_name': f"{emp.first_name} {emp.last_name}".strip(),
                'department': dept,
                'designation': emp.designation.name if emp.designation else (tech.get_department_type_display() if tech else 'Technician'),
                'status': p.status if p else 'DRAFT',
                **{k: float(v) if isinstance(v, Decimal) else v for k, v in calc.items()}
            })

        return {
            'year': year,
            'month': month,
            'records': records
        }
