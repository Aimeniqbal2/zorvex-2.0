import datetime
from decimal import Decimal
from django.urls import reverse
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from django.db.utils import IntegrityError
from django.core.exceptions import ValidationError
from companies.models import Company
from finance.models import Currency
from hrm.models import (
    Employee, Employment, SalaryComponent, SalaryStructure,
    SalaryStructureComponent, EmployeeSalaryAssignment,
    PayrollPeriod, PayrollRun, PayrollRunStatus, ComponentType, CalculationType,
    Designation, OvertimeRecord, OvertimeStatus,
    CompanyPayrollPolicy, PayslipStatus
)
from hrm.services.payroll_calculation import calculate_payroll_for_employee

User = get_user_model()

class PhaseR7ETests(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name='Test Company R7E', business_type='SECURITY')
        self.company_b = Company.objects.create(name='Test Company R7E B', business_type='SECURITY')
        
        self.currency = Currency.objects.create(company=self.company, code='USD', name='US Dollar', symbol='$')
        self.designation = Designation.objects.create(company=self.company, name='Security Guard')
        
        self.admin = User.objects.create_user(username='admin_r7e', password='password123', company=self.company, role='admin')
        self.client.force_authenticate(user=self.admin)
        
        self.employee = Employee.objects.create(company=self.company, first_name='Jane', last_name='Doe', designation=self.designation)
        self.employment = Employment.objects.create(company=self.company, employee=self.employee, start_date=datetime.date(2026, 1, 1), employment_type='FULL_TIME')
        
        self.base_comp = SalaryComponent.objects.create(company=self.company, code='BASE', name='Base Salary', component_type=ComponentType.EARNING, calculation_type=CalculationType.FIXED)
        self.structure = SalaryStructure.objects.create(company=self.company, name='Base', currency=self.currency, effective_from=datetime.date(2026, 1, 1))
        SalaryStructureComponent.objects.create(company=self.company, salary_structure=self.structure, salary_component=self.base_comp, amount=Decimal('5000.00'), sequence=1)
        self.assignment = EmployeeSalaryAssignment.objects.create(company=self.company, employee=self.employee, employment=self.employment, salary_structure=self.structure, currency=self.currency, effective_from=datetime.date(2026, 1, 1), base_salary=Decimal('5000.00'), status='ACTIVE')

    def _setup_payroll(self, month):
        period = PayrollPeriod.objects.create(
            company=self.company, name=f'{month} 2026', 
            start_date=datetime.date(2026, month, 1), 
            end_date=datetime.date(2026, month, 28),
            payment_date=datetime.date(2026, month, 28)
        )
        run = PayrollRun.objects.create(company=self.company, payroll_period=period, run_number=f'PR-{month}')
        return run

    def test_no_policy_system_defaults(self):
        # 1. no policy -> system defaults
        ot = OvertimeRecord.objects.create(
            company=self.company, employee=self.employee, date=datetime.date(2026, 1, 15),
            hours=Decimal('10.00'), status=OvertimeStatus.APPROVED
        )
        run = self._setup_payroll(1)
        payslip = calculate_payroll_for_employee(self.company.id, run, self.employee, self.assignment)
        
        # default: 160 hours, 1.5 multiplier
        # base: 5000. 5000/160 * 1.5 = 46.875 hourly OT rate
        # 46.875 * 10 hours = 468.75
        self.assertEqual(payslip.gross_amount, Decimal('5468.75'))

    def test_company_policy_overrides_defaults(self):
        # 2. company policy overrides defaults
        CompanyPayrollPolicy.objects.create(
            company=self.company,
            standard_monthly_hours=Decimal('200.00'),
            overtime_multiplier=Decimal('2.00')
        )
        ot = OvertimeRecord.objects.create(
            company=self.company, employee=self.employee, date=datetime.date(2026, 1, 15),
            hours=Decimal('10.00'), status=OvertimeStatus.APPROVED
        )
        run = self._setup_payroll(1)
        payslip = calculate_payroll_for_employee(self.company.id, run, self.employee, self.assignment)
        
        # 5000 / 200 * 2.0 = 50 hourly OT rate. * 10 = 500
        self.assertEqual(payslip.gross_amount, Decimal('5500.00'))

    def test_duplicate_active_policy_prevented(self):
        # 3. duplicate active policy prevented
        CompanyPayrollPolicy.objects.create(company=self.company, standard_monthly_hours=Decimal('160.00'), overtime_multiplier=Decimal('1.50'))
        with self.assertRaises(IntegrityError):
            CompanyPayrollPolicy.objects.create(company=self.company, standard_monthly_hours=Decimal('200.00'), overtime_multiplier=Decimal('2.00'))

    def test_cross_company_policy_isolation(self):
        # 4. cross-company policy isolation
        CompanyPayrollPolicy.objects.create(company=self.company_b, standard_monthly_hours=Decimal('100.00'), overtime_multiplier=Decimal('3.00'))
        
        ot = OvertimeRecord.objects.create(
            company=self.company, employee=self.employee, date=datetime.date(2026, 1, 15),
            hours=Decimal('10.00'), status=OvertimeStatus.APPROVED
        )
        run = self._setup_payroll(1)
        payslip = calculate_payroll_for_employee(self.company.id, run, self.employee, self.assignment)
        
        # Company A should fall back to defaults (160h, 1.5x) and ignore Company B's policy
        self.assertEqual(payslip.gross_amount, Decimal('5468.75'))

    def test_invalid_policy_values_rejected(self):
        # 5. invalid standard hours rejected
        # 6. invalid multiplier rejected
        policy1 = CompanyPayrollPolicy(company=self.company, standard_monthly_hours=Decimal('0.00'), overtime_multiplier=Decimal('1.50'))
        with self.assertRaises(ValidationError):
            policy1.full_clean()
            
        policy2 = CompanyPayrollPolicy(company=self.company, standard_monthly_hours=Decimal('160.00'), overtime_multiplier=Decimal('-1.00'))
        with self.assertRaises(ValidationError):
            policy2.full_clean()

    def test_api_writable_policy_contract(self):
        # 7. React/API writable policy contract
        url = '/api/hrm/company-payroll-policy/'
        data = {
            'standard_monthly_hours': '250.00',
            'overtime_multiplier': '1.75',
            'is_active': True
        }
        res = self.client.post(url, data, format='json')
        if res.status_code != 201:
            print("ERROR RESPONSE:", res.status_code, res.content)
        self.assertEqual(res.status_code, 201)
        
        policy = CompanyPayrollPolicy.objects.get(company=self.company, is_active=True)
        self.assertEqual(policy.standard_monthly_hours, Decimal('250.00'))
        
        # Another post should update the active one by setting the old to inactive
        data2 = {
            'standard_monthly_hours': '220.00',
            'overtime_multiplier': '2.50',
            'is_active': True
        }
        res2 = self.client.post(url, data2)
        self.assertEqual(res2.status_code, 201)
        
        active_policies = CompanyPayrollPolicy.objects.filter(company=self.company, is_active=True)
        self.assertEqual(active_policies.count(), 1)
        self.assertEqual(active_policies.first().standard_monthly_hours, Decimal('220.00'))

    def test_historical_payroll_stability(self):
        # 8. finalized historical payroll unchanged after policy edit
        CompanyPayrollPolicy.objects.create(
            company=self.company,
            standard_monthly_hours=Decimal('200.00'),
            overtime_multiplier=Decimal('2.00')
        )
        ot = OvertimeRecord.objects.create(
            company=self.company, employee=self.employee, date=datetime.date(2026, 1, 15),
            hours=Decimal('10.00'), status=OvertimeStatus.APPROVED
        )
        run = self._setup_payroll(1)
        payslip = calculate_payroll_for_employee(self.company.id, run, self.employee, self.assignment)
        
        self.assertEqual(payslip.gross_amount, Decimal('5500.00'))
        
        # finalize payslip
        payslip.status = PayslipStatus.FINALIZED
        payslip.save()
        
        # edit policy
        CompanyPayrollPolicy.objects.filter(company=self.company).update(is_active=False)
        CompanyPayrollPolicy.objects.create(
            company=self.company,
            standard_monthly_hours=Decimal('250.00'),
            overtime_multiplier=Decimal('1.50')
        )
        
        # historical payslip unchanged
        payslip.refresh_from_db()
        self.assertEqual(payslip.gross_amount, Decimal('5500.00'))
        
        # new payroll uses new policy
        ot2 = OvertimeRecord.objects.create(
            company=self.company, employee=self.employee, date=datetime.date(2026, 2, 15),
            hours=Decimal('10.00'), status=OvertimeStatus.APPROVED
        )
        run2 = self._setup_payroll(2)
        payslip2 = calculate_payroll_for_employee(self.company.id, run2, self.employee, self.assignment)
        
        # 5000 / 250 = 20 * 1.5 = 30 * 10 = 300
        # 5000 + 300 = 5300
        self.assertEqual(payslip2.gross_amount, Decimal('5300.00'))
