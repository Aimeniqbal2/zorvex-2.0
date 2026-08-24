import datetime
from decimal import Decimal
from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth import get_user_model
from companies.models import Company
from finance.models import Currency
from crm.models import CRMEntity
from hrm.models import (
    Employee, Employment, SalaryComponent, SalaryStructure,
    SalaryStructureComponent, EmployeeSalaryAssignment,
    PayrollPeriod, PayrollRun, PayrollRunStatus, ComponentType, CalculationType, PayslipLine,
    Designation
)
from operations.models import ExtraDuty, ExtraDutyStatus, OperationalSite, ServiceContract, ContractRate

User = get_user_model()

class PhaseC2ATests(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name='Test Security Co', business_type='SECURITY')
        self.currency = Currency.objects.create(company=self.company, code='USD', name='US Dollar', symbol='$')
        self.crm_entity = CRMEntity.objects.create(
            company=self.company,
            entity_type='CUSTOMER',
            name='Test Client',
            code='CLI001'
        )
        self.designation = Designation.objects.create(company=self.company, name='Security Guard')
        
        self.user = User.objects.create_user(
            username='hr_admin_c2a',
            password='password123',
            company=self.company,
            role='ADMIN'
        )
        self.client.force_authenticate(user=self.user)
        
        self.employee = Employee.objects.create(
            company=self.company,
            first_name='Ahmed',
            last_name='Khan',
            designation=self.designation
        )
        self.employment = Employment.objects.create(
            company=self.company,
            employee=self.employee,
            start_date=datetime.date(2023, 1, 1),
            employment_type='FULL_TIME'
        )
        
        self.period = PayrollPeriod.objects.create(
            company=self.company,
            name='Oct 2026',
            start_date=datetime.date(2026, 10, 1),
            end_date=datetime.date(2026, 10, 31),
            payment_date=datetime.date(2026, 11, 5)
        )
        
        self.payroll_run = PayrollRun.objects.create(
            company=self.company,
            payroll_period=self.period,
            run_number='PR-OCT26-001'
        )

    def test_generic_deduction_and_extra_duty_inclusion(self):
        # 1. Salary Component (Generic Deduction)
        deduction_comp = SalaryComponent.objects.create(
            company=self.company,
            code='UNIFORM_REC',
            name='Uniform Recovery',
            component_type=ComponentType.DEDUCTION,
            calculation_type=CalculationType.FIXED,
            is_active=True
        )
        
        # 1b. Salary Component (Base Salary)
        base_comp = SalaryComponent.objects.create(
            company=self.company,
            code='BASE_SALARY',
            name='Base Salary',
            component_type=ComponentType.EARNING,
            calculation_type=CalculationType.FIXED,
            is_active=True
        )

        # 2. Salary Structure
        structure = SalaryStructure.objects.create(
            company=self.company,
            name='Guard Base',
            currency=self.currency,
            effective_from=datetime.date(2026, 1, 1)
        )

        # 3. Structure Component
        SalaryStructureComponent.objects.create(
            company=self.company,
            salary_structure=structure,
            salary_component=base_comp,
            amount=Decimal('1000.00'),
            sequence=5
        )
        
        SalaryStructureComponent.objects.create(
            company=self.company,
            salary_structure=structure,
            salary_component=deduction_comp,
            amount=Decimal('500.00'),
            sequence=10
        )
        
        # 4. Assignment
        assignment = EmployeeSalaryAssignment.objects.create(
            company=self.company,
            employee=self.employee,
            employment=self.employment,
            salary_structure=structure,
            currency=self.currency,
            effective_from=datetime.date(2026, 1, 1),
            base_salary=Decimal('25000.00'),
            status='ACTIVE'
        )

        # 5. Site & Extra Duty
        site = OperationalSite.objects.create(company=self.company, crm_entity=self.crm_entity, name='Site A')
        contract = ServiceContract.objects.create(company=self.company, crm_entity=self.crm_entity, start_date=datetime.date(2026,1,1))
        contract.sites.add(site)
        ContractRate.objects.create(
            company=self.company,
            service_contract=contract,
            designation=self.designation,
            billing_rate=Decimal('150.00'),
            pay_rate=Decimal('100.00'),
            effective_date=datetime.date(2026, 1, 1)
        )
        
        ed = ExtraDuty.objects.create(
            company=self.company,
            employee=self.employee,
            site=site,
            service_contract=contract,
            date=datetime.date(2026, 10, 15),
            hours=Decimal('8.00'),
            status=ExtraDutyStatus.APPROVED
        )
        
        from operations.services.payroll_bridge import process_extra_duty_payroll
        process_extra_duty_payroll(ed.id, self.payroll_run.id, self.company.id)

        # 6. Process Payroll (via API or service)
        url = reverse('payrollrun-calculate', kwargs={'pk': self.payroll_run.id})
        res = self.client.post(url)
        self.assertEqual(res.status_code, 200)
        
        # 7. Check Payslip Lines
        payslip = self.payroll_run.payslips.get(employee=self.employee)
        
        lines = PayslipLine.objects.filter(payslip=payslip)
        
        # Check deduction inclusion
        uniform_line = lines.filter(salary_component=deduction_comp).first()
        self.assertIsNotNone(uniform_line)
        self.assertEqual(uniform_line.amount, Decimal('500.00'))
        
        # Check Extra Duty inclusion
        ed_line = lines.filter(description__contains='Extra Duty').first()
        self.assertIsNotNone(ed_line)
        self.assertEqual(ed_line.amount, Decimal('800.00'))  # 8 hours * 100 rate
        
        self.assertEqual(payslip.gross_amount, Decimal('1800.00')) # Base (1000) + Extra (800)
        self.assertEqual(payslip.net_amount, Decimal('1300.00')) # 1800 - 500

    def test_payroll_idempotency_extra_duty(self):
        # We need to ensure calculating twice doesn't double ExtraDuty
        # ... this can be tested by simply calling calculate again
        # We will set up a quick structure with an earning so net is not negative.
        earning_comp = SalaryComponent.objects.create(
            company=self.company,
            code='BASE_EARNING',
            name='Base Earning',
            component_type=ComponentType.EARNING,
            calculation_type=CalculationType.FIXED,
            is_active=True
        )
        structure = SalaryStructure.objects.create(company=self.company, name='Guard Base', currency=self.currency, effective_from=datetime.date(2026, 1, 1))
        SalaryStructureComponent.objects.create(
            company=self.company, salary_structure=structure, salary_component=earning_comp, amount=Decimal('30000.00'), sequence=1
        )
        EmployeeSalaryAssignment.objects.create(
            company=self.company, employee=self.employee, employment=self.employment,
            salary_structure=structure, effective_from=datetime.date(2026, 1, 1),
            currency=self.currency,
            base_salary=Decimal('30000.00'), status='ACTIVE'
        )

        site = OperationalSite.objects.create(company=self.company, crm_entity=self.crm_entity, name='Site A')
        contract = ServiceContract.objects.create(company=self.company, crm_entity=self.crm_entity, start_date=datetime.date(2026,1,1))
        contract.sites.add(site)
        ContractRate.objects.create(
            company=self.company, service_contract=contract, designation=self.designation,
            pay_rate=Decimal('100.00'), billing_rate=Decimal('150.00'), effective_date=datetime.date(2026, 1, 1)
        )
        
        ed = ExtraDuty.objects.create(
            company=self.company, employee=self.employee, site=site, service_contract=contract,
            date=datetime.date(2026, 10, 15), hours=Decimal('8.00'), status=ExtraDutyStatus.APPROVED
        )
        
        from operations.services.payroll_bridge import process_extra_duty_payroll
        process_extra_duty_payroll(ed.id, self.payroll_run.id, self.company.id)

        url = reverse('payrollrun-calculate', kwargs={'pk': self.payroll_run.id})
        
        # Calculate once
        self.client.post(url)
        payslip1 = self.payroll_run.payslips.get(employee=self.employee)
        net1 = payslip1.net_amount
        
        # Calculate twice
        self.client.post(url)
        payslip2 = self.payroll_run.payslips.get(employee=self.employee)
        net2 = payslip2.net_amount
        
        self.assertEqual(net1, net2)
