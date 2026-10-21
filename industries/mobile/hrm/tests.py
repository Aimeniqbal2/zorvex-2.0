from decimal import Decimal
from django.test import TestCase
from companies.models import Company
from hrm.models import Employee, Department
from .models import TechnicianProfile, MobileMonthlyAttendance, MobileDepartment
from .services.attendance_service import MobileAttendanceService
from .services.payroll_service import MobilePayrollService
from .services.payslip_pdf_service import MobilePayslipPDFService

class MobileHRMCalculationTestCase(TestCase):
    def setUp(self):
        self.company = Company.objects.create(
            name="Softech Lab Test",
            business_type="mobile",
            subdomain="softech-test"
        )
        self.dept = Department.objects.create(
            company=self.company,
            name="Hardware"
        )
        self.employee = Employee.objects.create(
            company=self.company,
            employee_code="EMP001",
            first_name="Muhammad",
            last_name="Jahanzaib",
            department=self.dept,
            is_active=True
        )
        self.tech = TechnicianProfile.objects.create(
            company=self.company,
            employee=self.employee,
            department_type=MobileDepartment.HARDWARE,
            shift_time='12:00:00',
            late_grace_minutes=10,
            half_day_cutoff_minutes=60,
            ot_hourly_rate=Decimal('250.00'),
            phone_1_model='Vivo Y21',
            phone_1_imei_1='863456051234567'
        )

    def test_attendance_counters_and_service(self):
        # Mark day 1 P, day 2 L, day 3 D, day 4 H, day 5 HA, day 6 DA, day 7 O
        MobileAttendanceService.save_cell(self.company, self.employee.id, 2026, 9, 1, 'P')
        MobileAttendanceService.save_cell(self.company, self.employee.id, 2026, 9, 2, 'L')
        MobileAttendanceService.save_cell(self.company, self.employee.id, 2026, 9, 3, 'D')
        MobileAttendanceService.save_cell(self.company, self.employee.id, 2026, 9, 4, 'H')
        MobileAttendanceService.save_cell(self.company, self.employee.id, 2026, 9, 5, 'HA')
        MobileAttendanceService.save_cell(self.company, self.employee.id, 2026, 9, 6, 'DA')
        MobileAttendanceService.save_cell(self.company, self.employee.id, 2026, 9, 7, 'O')

        att = MobileMonthlyAttendance.objects.get(
            company=self.company,
            employee=self.employee,
            year=2026,
            month=9
        )
        self.assertEqual(att.present_count, 1)
        self.assertEqual(att.late_count, 1)
        self.assertEqual(att.half_day_count, 1)
        self.assertEqual(att.holiday_count, 1)
        self.assertEqual(att.allowed_holiday_count, 1)
        self.assertEqual(att.allowed_half_day_count, 1)
        self.assertEqual(att.overtime_hours, Decimal('1.00'))

    def test_payroll_formulas_case_a_full_bonus(self):
        # Technician with 1 Late, 0 Half Day, 0 Holidays -> Earns Time Bonus + Zero-Holiday Bonus
        MobileAttendanceService.save_cell(self.company, self.employee.id, 2026, 9, 1, 'L')
        for d in range(2, 31):
            MobileAttendanceService.save_cell(self.company, self.employee.id, 2026, 9, d, 'P')

        calc = MobilePayrollService.calculate_employee_payroll(
            company=self.company,
            employee=self.employee,
            year=2026,
            month=9,
            basic_salary=Decimal('20000.00')
        )

        self.assertEqual(calc['basic_salary'], Decimal('20000.00'))
        self.assertEqual(calc['bonus_time'], Decimal('1000.00'))
        self.assertEqual(calc['bonus_zero_holiday'], Decimal('1000.00'))
        self.assertEqual(calc['late_deduction'], Decimal('0.00'))
        self.assertEqual(calc['holiday_deduction'], Decimal('0.00'))
        self.assertEqual(calc['penalty'], Decimal('0.00'))
        self.assertEqual(calc['gross_total'], Decimal('22000.00'))

    def test_payroll_formulas_case_b_deductions_and_penalty(self):
        # 3 Lates, 1 Holiday -> Late deduction: (30000/30) * (3/3) = 1000
        # Holiday deduction: (30000/30) * 1 = 1000
        # Penalty: 1000
        # Total Deductions: 3000
        MobileAttendanceService.save_cell(self.company, self.employee.id, 2026, 9, 1, 'L')
        MobileAttendanceService.save_cell(self.company, self.employee.id, 2026, 9, 2, 'L')
        MobileAttendanceService.save_cell(self.company, self.employee.id, 2026, 9, 3, 'L')
        MobileAttendanceService.save_cell(self.company, self.employee.id, 2026, 9, 4, 'H')

        calc = MobilePayrollService.calculate_employee_payroll(
            company=self.company,
            employee=self.employee,
            year=2026,
            month=9,
            basic_salary=Decimal('30000.00')
        )

        self.assertEqual(calc['bonus_time'], Decimal('0.00'))
        self.assertEqual(calc['bonus_zero_holiday'], Decimal('0.00'))
        self.assertEqual(calc['late_deduction'], Decimal('1000.00'))
        self.assertEqual(calc['holiday_deduction'], Decimal('1000.00'))
        self.assertEqual(calc['penalty'], Decimal('1000.00'))
        self.assertEqual(calc['total_attendance_deduction'], Decimal('3000.00'))
        self.assertEqual(calc['gross_total'], Decimal('27000.00'))

    def test_payroll_overtime_calculation(self):
        # 10 Overtime Hours at 250/hr = 2,500
        calc = MobilePayrollService.calculate_employee_payroll(
            company=self.company,
            employee=self.employee,
            year=2026,
            month=9,
            basic_salary=Decimal('20000.00'),
            overtime_hours_override=Decimal('10.00')
        )
        self.assertEqual(calc['overtime_pay'], Decimal('2500.00'))

    def test_pdf_payslip_generation(self):
        pdf_bytes = MobilePayslipPDFService.generate_payslip_pdf(
            company=self.company,
            employee=self.employee,
            year=2026,
            month=9
        )
        self.assertIsNotNone(pdf_bytes)
        self.assertTrue(pdf_bytes.startswith(b'%PDF'))
