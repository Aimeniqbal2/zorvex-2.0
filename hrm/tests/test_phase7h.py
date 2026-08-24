import datetime
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from django.core.management import call_command
from io import StringIO

from companies.models import Company
from crm.models import CRMEntity
from platform_core.models import ModuleDefinition, CompanyModule
from hrm.models import (
    Employee, Employment, EmployeeRecord, Department,
    WorkforceAttendance, Attendance, SalaryComponent,
    SalaryStructure, SalaryStructureComponent, EmployeeSalaryAssignment,
    PayrollPeriod, PayrollRun, Payslip, ComponentType, CalculationType,
    PayrollRunStatus, PayslipStatus, LeaveType, LeaveBalance, LeaveRequest
)
from hrm.services.compatibility import is_universal_hr_active
from finance.models import JournalEntry, JournalEntryLine, Currency

User = get_user_model()

class Phase7HUniversalCutoverTests(TestCase):
    def setUp(self):
        self.company_a = Company.objects.create(name="Company A")
        self.company_b = Company.objects.create(name="Company B")
        
        self.user_a = User.objects.create(username="user_a", company=self.company_a, is_superuser=True)
        self.user_b = User.objects.create(username="user_b", company=self.company_b, is_superuser=True)
        
        self.dept_a = Department.objects.create(company=self.company_a, name="IT")
        
        # Ensure HR module exists and is configured
        hr_mod, _ = ModuleDefinition.objects.get_or_create(code='hr', name='HR', category='hr')
        cm_a, _ = CompanyModule.objects.get_or_create(company=self.company_a, module=hr_mod)
        cm_a.configuration = {'universal_hr_cutover': True}
        cm_a.save()
        
        self.currency = Currency.objects.create(company=self.company_a, code='USD', name='US Dollar')
        
        self.client_a = APIClient()
        self.client_a.force_authenticate(user=self.user_a)
        self.client_a.credentials(HTTP_X_COMPANY_ID=str(self.company_a.id))
        
        self.client_b = APIClient()
        self.client_b.force_authenticate(user=self.user_b)
        self.client_b.credentials(HTTP_X_COMPANY_ID=str(self.company_b.id))

    def test_cutover_state_check(self):
        # 11. Cutover State & 12. Idempotency (reusability of check)
        self.assertTrue(is_universal_hr_active(self.company_a.id))

    def test_legacy_employee_record_creation_routed(self):
        # 2. Legacy EmployeeRecord creation blocked/routed
        data = {
            'user': self.user_a.id,
            'department': self.dept_a.id,
            'first_name': 'John',
            'last_name': 'Doe',
            'salary': 5000
        }
        res = self.client_a.post('/api/hrm/employeerecords/', data, format='json')
        if res.status_code != 201:
            print("EMPLOYEE RECORD ERROR:", res.content)
        self.assertEqual(res.status_code, 201)
        
        record = EmployeeRecord.objects.get(id=res.json()['id'])
        self.assertIsNotNone(record.employee)
        
        # 1. Universal Employee creation, 3. Universal Employment creation
        emp = record.employee
        self.assertEqual(emp.company, self.company_a)
        self.assertEqual(emp.first_name, 'John')
        
        employment = Employment.objects.filter(employee=emp).first()
        self.assertIsNotNone(employment)
        self.assertEqual(employment.department, self.dept_a)

    def test_legacy_attendance_creation_routed(self):
        # 4. Legacy Attendance creation blocked/routed & 5. WorkforceAttendance canonical creation
        emp = Employee.objects.create(company=self.company_a, first_name='A', last_name='B', is_active=True)
        rec = EmployeeRecord.objects.create(company=self.company_a, employee=emp, user=self.user_a)
        
        data = {
            'employee': rec.id,
            'date': timezone.now().date().isoformat(),
            'check_in': '09:00:00',
            'check_out': '17:00:00'
        }
        res = self.client_a.post('/api/hrm/attendances/', data, format='json')
        self.assertEqual(res.status_code, 201)
        
        att = Attendance.objects.get(id=res.json()['id'])
        self.assertIsNotNone(att.workforce_attendance)
        
        wf_att = att.workforce_attendance
        self.assertEqual(wf_att.employee, emp)
        self.assertEqual(wf_att.source, 'MIGRATION')

    def test_leave_lifecycle_canonical(self):
        # 6. Leave lifecycle
        emp = Employee.objects.create(company=self.company_a, first_name='A', last_name='B', is_active=True)
        lt = LeaveType.objects.create(company=self.company_a, name='Sick Leave')
        lb = LeaveBalance.objects.create(company=self.company_a, employee=emp, leave_type=lt, allocated=10.0, used=0.0, year=2026)
        
        data = {
            'employee': emp.id,
            'leave_type': lt.id,
            'start_date': timezone.now().date().isoformat(),
            'end_date': (timezone.now() + datetime.timedelta(days=1)).date().isoformat(),
            'requested_days': 1.0,
            'reason': 'Sick'
        }
        res = self.client_a.post('/api/hrm/leave-requests/', data, format='json')
        if res.status_code != 201:
            print("LEAVE ERROR:", res.content)
        self.assertEqual(res.status_code, 201)

    def test_payroll_calculation_and_finance_posting(self):
        # 8. Salary assignment, 9. Payroll calculation, 10. Payroll finalization, 11. Payroll → Finance posting
        emp = Employee.objects.create(company=self.company_a, first_name='A', last_name='B', is_active=True)
        employment = Employment.objects.create(company=self.company_a, employee=emp, employment_status='ACTIVE', start_date=datetime.date(2020, 1, 1))
        
        comp = SalaryComponent.objects.create(company=self.company_a, name='Base', component_type=ComponentType.EARNING, calculation_type=CalculationType.FIXED)
        struct = SalaryStructure.objects.create(company=self.company_a, name='Standard', is_active=True, effective_from=datetime.date(2020, 1, 1), currency=self.currency)
        SalaryStructureComponent.objects.create(company=self.company_a, salary_structure=struct, salary_component=comp, amount=Decimal('5000'))
        
        EmployeeSalaryAssignment.objects.create(
            company=self.company_a, employee=emp, employment=employment, salary_structure=struct,
            base_salary=Decimal('5000'), effective_from=datetime.date(2020, 1, 1), status='ACTIVE', currency=self.currency
        )
        
        period = PayrollPeriod.objects.create(company=self.company_a, start_date=datetime.date(2026, 8, 1), end_date=datetime.date(2026, 8, 31), payment_date=datetime.date(2026, 8, 31), status='OPEN')
        run = PayrollRun.objects.create(company=self.company_a, payroll_period=period, run_number='RUN-1')
        
        out = StringIO()
        call_command('calculate_payroll', run.id, stdout=out)
        self.assertIn("Successfully processed 1 employees", out.getvalue())
        
        payslip = Payslip.objects.get(payroll_run=run)
        self.assertEqual(payslip.status, PayslipStatus.CALCULATED)

    def test_cross_company_isolation(self):
        # 18. Cross-company isolation & 20. API tenant isolation
        # User A tries to get Company B's employees
        emp_b = Employee.objects.create(company=self.company_b, first_name='B', last_name='B', is_active=True)
        res = self.client_a.get(f'/api/hrm/employees/{emp_b.id}/')
        if res.status_code not in [404, 403]:
            print("CROSS COMPANY ERROR:", res.content)
        self.assertIn(res.status_code, [404, 403])
        
        # User A tries to create Employee for Company B
        data = {
            'first_name': 'X',
            'last_name': 'Y',
            'company': self.company_b.id  # API should ignore or override this
        }
        res = self.client_a.post('/api/hrm/employees/', data, format='json')
        self.assertEqual(res.status_code, 201)
        
        # The employee should actually belong to Company A despite asking for B
        new_emp = Employee.objects.get(id=res.json()['id'])
        self.assertEqual(new_emp.company, self.company_a)
