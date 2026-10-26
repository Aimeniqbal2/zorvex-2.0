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
            domain="softech-test.zorvex.com"
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


class MobileHRMRoleBasedSystemTestCase(TestCase):
    def setUp(self):
        from django.contrib.auth import get_user_model
        from datetime import date, timedelta
        from rest_framework.test import APIClient
        from .models import (
            CompanyPolicy, OnboardingCandidate,
            EmployeeLeaveRequest, EmployeeExitRequest,
            MobileDepartment
        )
        from .services.appointment_pdf_service import MobileAppointmentPDFService

        User = get_user_model()
        self.company = Company.objects.create(
            name="Softech Systems International",
            business_type="mobile",
            domain="softech-intl.zorvex.com"
        )
        self.user = User.objects.create_user(
            username='softech_admin',
            email='admin@softech.com',
            password='password123',
            company=self.company,
            role='admin'
        )
        self.dept = Department.objects.create(
            company=self.company,
            name="Hardware"
        )
        self.employee = Employee.objects.create(
            company=self.company,
            employee_code="EMP10",
            first_name="Shahzaib",
            last_name="Akbar",
            department=self.dept,
            is_active=True
        )
        self.tech = TechnicianProfile.objects.create(
            company=self.company,
            employee=self.employee,
            department_type=MobileDepartment.HARDWARE,
            shift_time='11:00:00',
            late_grace_minutes=15,
            half_day_cutoff_minutes=60,
            basic_salary=Decimal('20000.00'),
            phone_1_model='iPhone 11 Pro',
            phone_1_imei_1='358963124567890'
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_company_policy_lifecycle(self):
        from .models import CompanyPolicy
        policy = CompanyPolicy.objects.create(
            company=self.company,
            title="Softech Rules & Regulations",
            version="2.0",
            content="1. Shift starts at 11:00 AM\n2. 1-Month notice period required.",
            is_active=True
        )
        res = self.client.get('/api/mobile/hrm/policies/active/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['title'], "Softech Rules & Regulations")
        self.assertEqual(res.data['version'], "2.0")

    def test_onboarding_candidate_and_appointment_pdf(self):
        from .models import OnboardingCandidate, MobileDepartment
        from .services.appointment_pdf_service import MobileAppointmentPDFService
        from datetime import date

        cand = OnboardingCandidate.objects.create(
            company=self.company,
            full_name="Subhan Sheikh",
            phone="0300-9876543",
            position="Mobile Hardware Specialist",
            department_type=MobileDepartment.HARDWARE,
            offered_salary=Decimal('22000.00'),
            allowance="Travel 1000 Pkr/= (Every Week)",
            working_hours="11:00 to 9:00",
            notice_period="One Month",
            appointment_date=date.today(),
            appointment_month="October",
            status="OFFERED"
        )
        pdf_bytes = MobileAppointmentPDFService.generate_appointment_pdf(self.company, cand)
        self.assertIsNotNone(pdf_bytes)
        self.assertTrue(pdf_bytes.startswith(b'%PDF'))

        # API Download
        res = self.client.get(f'/api/mobile/hrm/candidates/{cand.id}/download-appointment-letter/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res['Content-Type'], 'application/pdf')

    def test_candidate_conversion_to_employee(self):
        from .models import OnboardingCandidate, MobileDepartment

        cand = OnboardingCandidate.objects.create(
            company=self.company,
            full_name="Farhan Khan",
            phone="0312-3456789",
            position="Software Lab Flasher",
            department_type=MobileDepartment.SOFTWARE,
            offered_salary=Decimal('18000.00'),
            status="OFFERED"
        )
        res = self.client.post(f'/api/mobile/hrm/candidates/{cand.id}/convert-to-employee/')
        self.assertEqual(res.status_code, 200)
        cand.refresh_from_db()
        self.assertEqual(cand.status, 'HIRED')
        self.assertIsNotNone(cand.converted_employee)
        self.assertEqual(cand.converted_employee.first_name, 'Farhan')
        self.assertEqual(cand.converted_employee.last_name, 'Khan')

    def test_leave_request_workflow(self):
        from .models import EmployeeLeaveRequest
        from datetime import date

        leave = EmployeeLeaveRequest.objects.create(
            company=self.company,
            employee=self.employee,
            leave_type='HALF_DAY',
            request_date=date.today(),
            reason="Medical relief requirement",
            status='PENDING'
        )
        res = self.client.post(f'/api/mobile/hrm/leave-requests/{leave.id}/approve/')
        self.assertEqual(res.status_code, 200)
        leave.refresh_from_db()
        self.assertEqual(leave.status, 'APPROVED')

    def test_exit_request_notice_countdown(self):
        from .models import EmployeeExitRequest
        from datetime import date, timedelta

        today = date.today()
        lwd = today + timedelta(days=30)
        exit_req = EmployeeExitRequest.objects.create(
            company=self.company,
            employee=self.employee,
            resignation_date=today,
            last_working_day=lwd,
            reason="Relocating to another city",
            clearance_status='PENDING'
        )
        self.assertGreaterEqual(exit_req.days_remaining, 29)
        self.assertLessEqual(exit_req.days_remaining, 31)

        # Update clearance checklist via action
        res = self.client.patch(
            f'/api/mobile/hrm/exit-requests/{exit_req.id}/update-clearance/',
            {
                'device_1_returned': True,
                'tools_returned': True,
                'clearance_status': 'CLEARANCE'
            },
            format='json'
        )
        self.assertEqual(res.status_code, 200)
        exit_req.refresh_from_db()
        self.assertTrue(exit_req.device_1_returned)
        self.assertEqual(exit_req.clearance_status, 'CLEARANCE')

    def test_employee_self_service_api(self):
        from .models import CompanyPolicy
        CompanyPolicy.objects.create(
            company=self.company,
            title="Softech Rules",
            version="1.0",
            content="Standard rules.",
            is_active=True
        )
        res = self.client.get(f'/api/mobile/hrm/self-service/?employee_id={self.employee.id}')
        self.assertEqual(res.status_code, 200)
        self.assertIn('employee', res.data)
        self.assertIn('profile', res.data)
        self.assertIn('attendance', res.data)
        self.assertIn('active_policy', res.data)
        self.assertEqual(res.data['employee']['first_name'], 'Shahzaib')

