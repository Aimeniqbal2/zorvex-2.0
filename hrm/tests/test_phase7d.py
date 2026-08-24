from django.test import TestCase
from django.core.exceptions import ValidationError
from datetime import date, timedelta
from hrm.models import (
    Employee, Employment, SalaryComponent, SalaryStructure, SalaryStructureComponent,
    EmployeeSalaryAssignment, PayrollPeriod, PayrollRun, Payslip, PayslipLine,
    ComponentType, CalculationType, PayrollPeriodStatus, PayrollRunStatus, PayslipStatus
)
from companies.models import Company
from finance.models import Currency
from django.contrib.auth import get_user_model

User = get_user_model()

class UniversalPayrollFoundationTestCase(TestCase):
    def setUp(self):
        self.company_a = Company.objects.create(name='Company A')
        self.company_b = Company.objects.create(name='Company B')

        self.user_a = User.objects.create(username='user_a', company=self.company_a)
        
        self.currency_a = Currency.objects.create(company=self.company_a, code='USD', name='US Dollar')
        self.currency_b = Currency.objects.create(company=self.company_b, code='EUR', name='Euro')
        
        self.emp_a = Employee.objects.create(
            company=self.company_a,
            first_name='John',
            last_name='Doe'
        )
        self.emp_b = Employee.objects.create(
            company=self.company_b,
            first_name='Jane',
            last_name='Smith'
        )
        
        self.employment_a = Employment.objects.create(
            company=self.company_a,
            employee=self.emp_a,
            start_date=date(2023, 1, 1),
            is_current=True
        )

    def test_salary_component_creation_and_isolation(self):
        # 1. SalaryComponent creation
        comp = SalaryComponent.objects.create(
            company=self.company_a,
            name='Basic Salary',
            code='BASIC',
            component_type=ComponentType.EARNING,
            calculation_type=CalculationType.FIXED
        )
        self.assertEqual(SalaryComponent.objects.count(), 1)
        
        # 3. SalaryComponent uniqueness per company
        from django.db import transaction
        with transaction.atomic():
            with self.assertRaises(Exception): # IntegrityError
                SalaryComponent.objects.create(
                    company=self.company_a,
                    name='Duplicate Basic',
                    code='BASIC'
                )
            
        # Allowed in another company
        SalaryComponent.objects.create(
            company=self.company_b,
            name='Basic Salary',
            code='BASIC'
        )
        self.assertEqual(SalaryComponent.objects.count(), 2)

    def test_salary_structure_creation_and_relations(self):
        # 4. SalaryStructure creation
        struct = SalaryStructure.objects.create(
            company=self.company_a,
            name='Standard Structure',
            code='STD',
            currency=self.currency_a,
            effective_from=date(2023, 1, 1)
        )
        self.assertEqual(SalaryStructure.objects.count(), 1)
        
        comp = SalaryComponent.objects.create(
            company=self.company_a, name='Basic', code='B1'
        )
        
        # 5. Structure/component relationship
        struct_comp = SalaryStructureComponent.objects.create(
            company=self.company_a,
            salary_structure=struct,
            salary_component=comp,
            amount=5000
        )
        self.assertEqual(struct.components.count(), 1)
        
        # 6. Cross-company component rejection
        comp_b = SalaryComponent.objects.create(
            company=self.company_b, name='Basic', code='B1'
        )
        bad_struct_comp = SalaryStructureComponent(
            company=self.company_a,
            salary_structure=struct,
            salary_component=comp_b, # Cross-company
            amount=5000
        )
        with self.assertRaises(ValidationError):
            bad_struct_comp.full_clean()

    def test_employee_salary_assignment(self):
        struct = SalaryStructure.objects.create(
            company=self.company_a, name='Struct', code='S1',
            currency=self.currency_a, effective_from=date(2023, 1, 1)
        )
        
        # 7. EmployeeSalaryAssignment creation
        assign1 = EmployeeSalaryAssignment.objects.create(
            company=self.company_a,
            employee=self.emp_a,
            employment=self.employment_a,
            salary_structure=struct,
            currency=self.currency_a,
            base_salary=60000,
            effective_from=date(2023, 1, 1)
        )
        self.assertEqual(EmployeeSalaryAssignment.objects.count(), 1)
        
        # 8. Cross-company employee rejection
        bad_assign = EmployeeSalaryAssignment(
            company=self.company_a,
            employee=self.emp_b, # Cross-company
            employment=self.employment_a,
            salary_structure=struct,
            currency=self.currency_a,
            base_salary=60000,
            effective_from=date(2023, 1, 1)
        )
        with self.assertRaises(ValidationError):
            bad_assign.full_clean()
            
        # 9. Effective-date validation
        bad_assign2 = EmployeeSalaryAssignment(
            company=self.company_a,
            employee=self.emp_a,
            salary_structure=struct,
            currency=self.currency_a,
            effective_from=date(2023, 12, 31),
            effective_to=date(2023, 1, 1) # Invalid
        )
        with self.assertRaises(ValidationError):
            bad_assign2.full_clean()

        # 10. Overlapping active salary assignment rejection
        overlap_assign = EmployeeSalaryAssignment(
            company=self.company_a,
            employee=self.emp_a,
            salary_structure=struct,
            currency=self.currency_a,
            base_salary=70000,
            effective_from=date(2023, 6, 1) # Overlaps with assign1
        )
        with self.assertRaises(ValidationError):
            overlap_assign.full_clean()

    def test_payroll_period_and_run(self):
        # 11. PayrollPeriod creation
        period1 = PayrollPeriod.objects.create(
            company=self.company_a,
            name='Jan 2023',
            start_date=date(2023, 1, 1),
            end_date=date(2023, 1, 31),
            payment_date=date(2023, 2, 5)
        )
        self.assertEqual(PayrollPeriod.objects.count(), 1)
        
        # 12. Payroll period overlap prevention
        overlap_period = PayrollPeriod(
            company=self.company_a,
            name='Mid Jan 2023',
            start_date=date(2023, 1, 15),
            end_date=date(2023, 2, 15),
            payment_date=date(2023, 2, 20)
        )
        with self.assertRaises(ValidationError):
            overlap_period.full_clean()

        # 13. PayrollRun creation & 14. DocumentSequence numbering
        run1 = PayrollRun.objects.create(
            company=self.company_a,
            payroll_period=period1
        )
        self.assertTrue(run1.run_number.startswith('PR-202301-'))
        
        # 15. Payslip creation & 17. Cross-company payslip rejection
        struct = SalaryStructure.objects.create(
            company=self.company_a, name='Struct', code='S1',
            currency=self.currency_a, effective_from=date(2023, 1, 1)
        )
        assign = EmployeeSalaryAssignment.objects.create(
            company=self.company_a, employee=self.emp_a, salary_structure=struct,
            currency=self.currency_a, effective_from=date(2023, 1, 1)
        )
        payslip = Payslip.objects.create(
            company=self.company_a,
            payroll_run=run1,
            employee=self.emp_a,
            salary_assignment=assign,
            currency=self.currency_a
        )
        self.assertTrue(payslip.payslip_number.startswith('PS-202301-'))
        
        # 16. PayslipLine creation
        comp = SalaryComponent.objects.create(
            company=self.company_a, name='Basic', code='B1'
        )
        line = PayslipLine.objects.create(
            company=self.company_a,
            payslip=payslip,
            salary_component=comp,
            component_type=ComponentType.EARNING,
            amount=5000
        )
        self.assertEqual(payslip.lines.count(), 1)
        
        # 20. Finalized payroll immutability
        run1.status = PayrollRunStatus.FINALIZED
        run1.save()
        
        run1.status = PayrollRunStatus.DRAFT
        with self.assertRaises(ValidationError):
            run1.full_clean()
