from decimal import Decimal
from datetime import date
from django.test import TestCase
from django.contrib.auth import get_user_model
from companies.models import Company
from finance.models import Currency, FiscalYear, AccountingPeriod
from hrm.models import (
    Employee, Employment, SalaryStructure, SalaryComponent,
    SalaryStructureComponent, ComponentType, CalculationType,
    EmployeeSalaryAssignment, PayrollPeriod, PayrollRun, PayrollRunStatus, PayslipStatus
)
from hrm.services.payroll_calculation import calculate_payroll_for_run

User = get_user_model()

class Phase8DHRMTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.company = Company.objects.create(name="Phase 8D Company")
        cls.user = User.objects.create_user(username="testuser8d_hrm", password="password", company=cls.company)
        
        cls.currency = Currency.objects.create(company=cls.company, code="USD", name="US Dollar", symbol="$")
        cls.fy = FiscalYear.objects.create(company=cls.company, name="2026", start_date=date(2026, 1, 1), end_date=date(2026, 12, 31))
        
        cls.payroll_period = PayrollPeriod.objects.create(
            company=cls.company, name="August 2026", start_date=date(2026, 8, 1), end_date=date(2026, 8, 31),
            payment_date=date(2026, 8, 31)
        )
        
        cls.employee = Employee.objects.create(
            company=cls.company, employee_code="EMP-8D-001", first_name="John", last_name="Doe",
            email="john@example.com"
        )
        
        cls.employment = Employment.objects.create(
            company=cls.company, employee=cls.employee, start_date=date(2026, 1, 1),
            employment_status="ACTIVE"
        )
        
        cls.base_comp = SalaryComponent.objects.create(
            company=cls.company, name="Basic Pay", code="BASIC",
            component_type=ComponentType.EARNING, calculation_type=CalculationType.FIXED
        )
        
        cls.bonus_comp = SalaryComponent.objects.create(
            company=cls.company, name="Bonus", code="BONUS",
            component_type=ComponentType.EARNING, calculation_type=CalculationType.FORMULA
        )
        
        cls.tax_comp = SalaryComponent.objects.create(
            company=cls.company, name="Income Tax", code="TAX",
            component_type=ComponentType.TAX, calculation_type=CalculationType.FORMULA
        )
        
        cls.structure = SalaryStructure.objects.create(
            company=cls.company, name="Standard Guard", code="STD-GRD",
            currency=cls.currency, effective_from=date(2026, 1, 1)
        )
        
        SalaryStructureComponent.objects.create(
            company=cls.company, salary_structure=cls.structure,
            salary_component=cls.base_comp, sequence=1, amount=Decimal('2000.00')
        )
        
        SalaryStructureComponent.objects.create(
            company=cls.company, salary_structure=cls.structure,
            salary_component=cls.bonus_comp, sequence=2, formula="base * 0.10"
        )
        
        SalaryStructureComponent.objects.create(
            company=cls.company, salary_structure=cls.structure,
            salary_component=cls.tax_comp, sequence=3, formula="gross * 0.05"
        )
        
        cls.assignment = EmployeeSalaryAssignment.objects.create(
            company=cls.company, employee=cls.employee, employment=cls.employment,
            salary_structure=cls.structure, currency=cls.currency,
            base_salary=Decimal('2000.00'), effective_from=date(2026, 1, 1)
        )
        
    def test_8d_6_formula_engine(self):
        run = PayrollRun.objects.create(
            company=self.company, payroll_period=self.payroll_period, status=PayrollRunStatus.DRAFT
        )
        
        res = calculate_payroll_for_run(self.company.id, run.id, self.user.id)
        self.assertEqual(res['success'], 1)
        self.assertEqual(len(res['errors']), 0)
        
        payslip = run.payslips.first()
        self.assertIsNotNone(payslip)
        
        # Base: 2000 (Calculated via FIXED but Assignment has 2000)
        # Bonus: base * 0.10 = 2000 * 0.10 = 200
        # Gross = 2200
        # Tax: gross * 0.05 = 2200 * 0.05 = 110
        # Net = 2200 - 110 = 2090
        
        self.assertEqual(payslip.gross_amount, Decimal('2200.00'))
        self.assertEqual(payslip.tax_amount, Decimal('110.00'))
        self.assertEqual(payslip.net_amount, Decimal('2090.00'))
