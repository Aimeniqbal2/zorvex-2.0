from decimal import Decimal
from django.test import TestCase
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.utils import timezone
from datetime import date, timedelta
from rest_framework.test import APIClient
from django.urls import reverse
from rest_framework_simplejwt.tokens import RefreshToken

from companies.models import Company
from subscriptions.models import CompanySubscription, SubscriptionPlan
from finance.models import Currency
from django.contrib.auth import get_user_model
from hrm.models import (
    Employee, Employment, SalaryComponent, SalaryStructure, SalaryStructureComponent,
    EmployeeSalaryAssignment, PayrollPeriod, PayrollRun, Payslip, PayslipLine,
    ComponentType, CalculationType, PayrollRunStatus, PayslipStatus
)
from hrm.services.payroll_calculation import calculate_payroll_for_run, finalize_payroll_run, PayrollCalculationError

User = get_user_model()

class UniversalPayrollCalculationEngineTestCase(TestCase):
    def setUp(self):
        self.company_a = Company.objects.create(name='Company A')
        self.company_b = Company.objects.create(name='Company B')
        
        self.user_a = User.objects.create(username='user_a', company=self.company_a, is_superuser=True)
        self.user_a.set_password('password')
        self.user_a.save()
        
        self.currency = Currency.objects.create(company=self.company_a, code='USD', name='US Dollar')
        
        self.emp1 = Employee.objects.create(company=self.company_a, first_name='John', last_name='Doe')
        self.employment1 = Employment.objects.create(
            company=self.company_a, employee=self.emp1,
            start_date=date(2023, 1, 1), is_current=True
        )
        
        self.emp2_cross = Employee.objects.create(company=self.company_b, first_name='Jane', last_name='Smith')
        self.employment2 = Employment.objects.create(
            company=self.company_b, employee=self.emp2_cross,
            start_date=date(2023, 1, 1), is_current=True
        )
        
        plan = SubscriptionPlan.objects.create(name="Enterprise", price=100)
        CompanySubscription.objects.create(
            company=self.company_a, plan=plan, start_date=date.today(),
            end_date=date.today() + timedelta(days=30), is_active=True
        )

        # Basic Earning (FIXED)
        self.comp_basic = SalaryComponent.objects.create(
            company=self.company_a, name='Basic', code='B1',
            component_type=ComponentType.EARNING, calculation_type=CalculationType.FIXED
        )
        # HRA Earning (PERCENTAGE)
        self.comp_hra = SalaryComponent.objects.create(
            company=self.company_a, name='HRA', code='H1',
            component_type=ComponentType.EARNING, calculation_type=CalculationType.PERCENTAGE
        )
        # Tax (FIXED)
        self.comp_tax = SalaryComponent.objects.create(
            company=self.company_a, name='Tax', code='T1',
            component_type=ComponentType.TAX, calculation_type=CalculationType.FIXED
        )
        # Prov Fund (PERCENTAGE DEDUCTION)
        self.comp_pf = SalaryComponent.objects.create(
            company=self.company_a, name='PF', code='P1',
            component_type=ComponentType.DEDUCTION, calculation_type=CalculationType.PERCENTAGE
        )
        
        self.structure = SalaryStructure.objects.create(
            company=self.company_a, name='Standard', code='STD',
            currency=self.currency, effective_from=date(2023, 1, 1)
        )
        
        # 5000 fixed basic
        SalaryStructureComponent.objects.create(
            company=self.company_a, salary_structure=self.structure, salary_component=self.comp_basic,
            amount=Decimal('5000.00'), sequence=1
        )
        # 10% of base
        SalaryStructureComponent.objects.create(
            company=self.company_a, salary_structure=self.structure, salary_component=self.comp_hra,
            percentage=Decimal('10.00'), sequence=2
        )
        # 100 fixed tax
        SalaryStructureComponent.objects.create(
            company=self.company_a, salary_structure=self.structure, salary_component=self.comp_tax,
            amount=Decimal('100.00'), sequence=3
        )
        # 5% deduction
        SalaryStructureComponent.objects.create(
            company=self.company_a, salary_structure=self.structure, salary_component=self.comp_pf,
            percentage=Decimal('5.00'), sequence=4
        )
        
        # Assign to emp1 with base_salary = 5000
        self.assignment = EmployeeSalaryAssignment.objects.create(
            company=self.company_a, employee=self.emp1, employment=self.employment1,
            salary_structure=self.structure, currency=self.currency,
            base_salary=Decimal('5000.00'), effective_from=date(2023, 1, 1)
        )
        
        self.period = PayrollPeriod.objects.create(
            company=self.company_a, name='Jan 2023',
            start_date=date(2023, 1, 1), end_date=date(2023, 1, 31),
            payment_date=date(2023, 2, 5)
        )
        self.run = PayrollRun.objects.create(company=self.company_a, payroll_period=self.period)

    def test_calculate_payroll_success(self):
        results = calculate_payroll_for_run(self.company_a.id, self.run.id, self.user_a.id)
        self.assertEqual(results['success'], 1)
        self.assertEqual(len(results['errors']), 0)
        
        self.run.refresh_from_db()
        self.assertEqual(self.run.status, PayrollRunStatus.CALCULATED)
        
        payslip = Payslip.objects.get(payroll_run=self.run, employee=self.emp1)
        self.assertEqual(payslip.status, PayslipStatus.CALCULATED)
        
        # Basic = 5000 (fixed)
        # HRA = 10% of 5000 = 500 (percentage)
        # Gross = 5500
        self.assertEqual(payslip.gross_amount, Decimal('5500.00'))
        
        # PF = 5% of 5000 = 250
        self.assertEqual(payslip.deduction_amount, Decimal('250.00'))
        
        # Tax = 100 fixed
        self.assertEqual(payslip.tax_amount, Decimal('100.00'))
        
        # Net = 5500 - 250 - 100 = 5150
        self.assertEqual(payslip.net_amount, Decimal('5150.00'))
        
        self.assertEqual(payslip.lines.count(), 4)

    def test_cross_company_isolation(self):
        # Assign emp2 (Company B) to Company A's run/period structure (malicious)
        with self.assertRaises(ValidationError):
            assignment2 = EmployeeSalaryAssignment.objects.create(
                company=self.company_a, employee=self.emp2_cross, employment=self.employment1, # cross employee
                salary_structure=self.structure, currency=self.currency,
                base_salary=Decimal('5000.00'), effective_from=date(2023, 1, 1)
            )

    def test_idempotency_and_duplicates(self):
        calculate_payroll_for_run(self.company_a.id, self.run.id, self.user_a.id)
        self.assertEqual(Payslip.objects.count(), 1)
        
        # Run again
        calculate_payroll_for_run(self.company_a.id, self.run.id, self.user_a.id)
        self.assertEqual(Payslip.objects.count(), 1) # Still 1 payslip! Old one deleted and recreated

    def test_finalized_immutability(self):
        calculate_payroll_for_run(self.company_a.id, self.run.id, self.user_a.id)
        finalize_payroll_run(self.company_a.id, self.run.id, self.user_a.id)
        
        self.run.refresh_from_db()
        self.assertEqual(self.run.status, PayrollRunStatus.FINALIZED)
        
        # Try calculating again
        with self.assertRaises(PayrollCalculationError):
            calculate_payroll_for_run(self.company_a.id, self.run.id, self.user_a.id)
            
        payslip = Payslip.objects.first()
        self.assertEqual(payslip.status, PayslipStatus.FINALIZED)

    def test_management_command(self):
        call_command('calculate_payroll', str(self.run.id))
        self.run.refresh_from_db()
        self.assertEqual(self.run.status, PayrollRunStatus.CALCULATED)

    def test_api_endpoint(self):
        client = APIClient()
        token = RefreshToken.for_user(self.user_a)
        client.credentials(
            HTTP_AUTHORIZATION=f'Bearer {token.access_token}',
            HTTP_X_COMPANY_ID=str(self.company_a.id)
        )
        
        url = reverse('payrollrun-calculate', kwargs={'pk': self.run.id})
        response = client.post(url, HTTP_X_COMPANY_ID=str(self.company_a.id))
        
        if response.status_code != 200:
            print(response.content)
        self.assertEqual(response.status_code, 200)
        self.run.refresh_from_db()
        self.assertEqual(self.run.status, PayrollRunStatus.CALCULATED)
        
        url_finalize = reverse('payrollrun-finalize', kwargs={'pk': self.run.id})
        response = client.post(url_finalize, HTTP_X_COMPANY_ID=str(self.company_a.id))
        self.assertEqual(response.status_code, 200)
        self.run.refresh_from_db()
        self.assertEqual(self.run.status, PayrollRunStatus.FINALIZED)
