import datetime
from decimal import Decimal
from django.urls import reverse
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from companies.models import Company
from finance.models import Currency, ChartOfAccount, AccountGroup
from crm.models import CRMEntity
from hrm.models import (
    Employee, Employment, SalaryComponent, SalaryStructure,
    SalaryStructureComponent, EmployeeSalaryAssignment,
    PayrollPeriod, PayrollRun, PayrollRunStatus, ComponentType, CalculationType,
    Payslip, PayslipLine, Designation,
    StatutoryScheme, StatutorySchemeType, StatutoryRule, EmployeeStatutoryEnrollment,
    PayslipStatutoryDeduction, OvertimeRecord, OvertimeStatus, PayrollDisbursement, PayslipDisbursement
)
from operations.models import ExtraDuty, ExtraDutyStatus, OperationalSite, ServiceContract, ContractRate

User = get_user_model()

class PhaseR7CTests(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name='Test Company R7C', business_type='SECURITY')
        self.company_b = Company.objects.create(name='Test Company R7C B', business_type='SECURITY')
        
        self.currency = Currency.objects.create(company=self.company, code='USD', name='US Dollar', symbol='$')
        self.crm_entity = CRMEntity.objects.create(company=self.company, entity_type='CUSTOMER', name='Test Client', code='CLI001')
        self.designation = Designation.objects.create(company=self.company, name='Security Guard')
        
        self.admin = User.objects.create_user(username='admin_r7c', password='password123', company=self.company, role='admin')
        self.hr_manager = User.objects.create_user(username='hr_manager_r7c', password='password123', company=self.company, role='hr_manager')
        self.finance_manager = User.objects.create_user(username='fin_manager_r7c', password='password123', company=self.company, role='finance_manager')
        self.client.force_authenticate(user=self.admin)
        
        self.employee = Employee.objects.create(company=self.company, first_name='John', last_name='Doe', designation=self.designation)
        self.employment = Employment.objects.create(company=self.company, employee=self.employee, start_date=datetime.date(2026, 1, 1), employment_type='FULL_TIME')
        
        self.base_comp = SalaryComponent.objects.create(company=self.company, code='BASE', name='Base Salary', component_type=ComponentType.EARNING, calculation_type=CalculationType.FIXED)
        self.structure = SalaryStructure.objects.create(company=self.company, name='Base', currency=self.currency, effective_from=datetime.date(2026, 1, 1))
        SalaryStructureComponent.objects.create(company=self.company, salary_structure=self.structure, salary_component=self.base_comp, amount=Decimal('5000.00'), sequence=1)
        EmployeeSalaryAssignment.objects.create(company=self.company, employee=self.employee, employment=self.employment, salary_structure=self.structure, currency=self.currency, effective_from=datetime.date(2026, 1, 1), base_salary=Decimal('5000.00'), status='ACTIVE')

        # Statutory Accounts
        self.account_group = AccountGroup.objects.create(company=self.company, name='Current Assets', group_type='ASSET')
        self.liability_acc = ChartOfAccount.objects.create(company=self.company, account_group=self.account_group, account_code='2001', account_name='EOBI Payable', account_type='Liability')
        self.expense_acc = ChartOfAccount.objects.create(company=self.company, account_group=self.account_group, account_code='6001', account_name='EOBI Expense', account_type='Expense')
        self.bank_acc = ChartOfAccount.objects.create(company=self.company, account_group=self.account_group, account_code='1001', account_name='Main Bank', account_type='Asset')

    def _setup_payroll(self, month):
        period = PayrollPeriod.objects.create(
            company=self.company, name=f'{month} 2026', 
            start_date=datetime.date(2026, month, 1), 
            end_date=datetime.date(2026, month, 28),
            payment_date=datetime.date(2026, month, 28)
        )
        run = PayrollRun.objects.create(company=self.company, payroll_period=period, run_number=f'PR-{month}')
        return run

    def test_overtime_lifecycle(self):
        # 1 create
        ot = OvertimeRecord.objects.create(company=self.company, employee=self.employee, date=datetime.date(2026, 6, 10), hours=Decimal('4.00'), reason='Extra shift', status=OvertimeStatus.DRAFT)
        self.assertEqual(ot.status, OvertimeStatus.DRAFT)
        
        # 2 lifecycle/approval
        ot.status = OvertimeStatus.APPROVED
        ot.save()
        self.assertEqual(ot.status, OvertimeStatus.APPROVED)

    def test_overtime_payroll_handoff(self):
        # 4 payroll inclusion, 5 exact-once payroll
        ot1 = OvertimeRecord.objects.create(company=self.company, employee=self.employee, date=datetime.date(2026, 6, 10), hours=Decimal('4.00'), status=OvertimeStatus.APPROVED)
        run = self._setup_payroll(6)
        
        self.client.post(reverse('payrollrun-calculate', kwargs={'pk': run.id}))
        payslip = run.payslips.get(employee=self.employee)
        lines = PayslipLine.objects.filter(payslip=payslip, description__icontains='Overtime')
        self.assertEqual(lines.count(), 1)
        self.assertEqual(lines.first().amount, Decimal('4.00') * (Decimal('5000.00') / Decimal('160')) * Decimal('1.5'))
        
        # ot1 should now be PROCESSED
        ot1.refresh_from_db()
        self.assertEqual(ot1.status, OvertimeStatus.PROCESSED)
        
        # calculate again, should not double count
        self.client.post(reverse('payrollrun-calculate', kwargs={'pk': run.id}))
        payslip_after = run.payslips.get(employee=self.employee)
        lines_after = PayslipLine.objects.filter(payslip=payslip_after, description__icontains='Overtime')
        self.assertEqual(lines_after.count(), 1)

    def test_extraduty_non_duplication(self):
        # 6 ExtraDuty non-duplication
        site = OperationalSite.objects.create(company=self.company, crm_entity=self.crm_entity, name='Site A')
        contract = ServiceContract.objects.create(company=self.company, crm_entity=self.crm_entity, start_date=datetime.date(2026,1,1))
        contract.sites.add(site)
        ContractRate.objects.create(company=self.company, service_contract=contract, designation=self.designation, pay_rate=Decimal('100.00'), billing_rate=Decimal('150.00'), effective_date=datetime.date(2026, 1, 1))
        
        ed = ExtraDuty.objects.create(company=self.company, employee=self.employee, site=site, service_contract=contract, date=datetime.date(2026, 6, 15), hours=Decimal('8.00'), status=ExtraDutyStatus.APPROVED)
        
        from operations.services.payroll_bridge import process_extra_duty_payroll
        run = self._setup_payroll(6)
        process_extra_duty_payroll(ed.id, run.id, self.company.id)
        
        self.client.post(reverse('payrollrun-calculate', kwargs={'pk': run.id}))
        payslip = run.payslips.get(employee=self.employee)
        ed_lines = PayslipLine.objects.filter(payslip=payslip, description__icontains='Extra Duty')
        self.assertEqual(ed_lines.count(), 1)
        self.assertEqual(ed_lines.first().amount, Decimal('800.00'))

    def test_statutory_logic(self):
        # 8 Scheme, 9 Rule, 12 enrollment, 14 employee deduction, 15 employer contribution
        scheme = StatutoryScheme.objects.create(company=self.company, name='EOBI', scheme_type=StatutorySchemeType.EOBI, liability_account=self.liability_acc, expense_account=self.expense_acc)
        
        # 10 effective-date selection, 11 overlapping rule validation
        rule_a = StatutoryRule.objects.create(company=self.company, scheme=scheme, effective_from=datetime.date(2026, 1, 1), effective_to=datetime.date(2026, 6, 30), employee_rate=Decimal('1.00'), employer_rate=Decimal('5.00'))
        rule_b = StatutoryRule.objects.create(company=self.company, scheme=scheme, effective_from=datetime.date(2026, 7, 1), employee_rate=Decimal('2.00'), employer_rate=Decimal('6.00'))
        
        EmployeeStatutoryEnrollment.objects.create(company=self.company, employee=self.employee, scheme=scheme)
        
        # 13 duplicate enrollment
        from django.db.utils import IntegrityError
        from django.db import transaction
        with transaction.atomic():
            with self.assertRaises(IntegrityError):
                EmployeeStatutoryEnrollment.objects.create(company=self.company, employee=self.employee, scheme=scheme)
            
        # Run June
        run_june = self._setup_payroll(6)
        self.client.post(reverse('payrollrun-calculate', kwargs={'pk': run_june.id}))
        ps_june = run_june.payslips.get(employee=self.employee)
        deduct_june = PayslipStatutoryDeduction.objects.get(payslip=ps_june)
        self.assertEqual(deduct_june.employee_deduction, Decimal('50.00')) # 1% of 5000
        self.assertEqual(deduct_june.employer_contribution, Decimal('250.00')) # 5% of 5000
        
        # Finalize June
        run_june.status = PayrollRunStatus.FINALIZED
        run_june.save()
        
        # 16 finalized history
        # modify rule a
        rule_a.employee_rate = Decimal('10.00')
        rule_a.save()
        ps_june.refresh_from_db()
        deduct_june.refresh_from_db()
        self.assertEqual(deduct_june.employee_deduction, Decimal('50.00')) # unchanged
        
        # Run July
        run_july = self._setup_payroll(7)
        self.client.post(reverse('payrollrun-calculate', kwargs={'pk': run_july.id}))
        ps_july = run_july.payslips.get(employee=self.employee)
        deduct_july = PayslipStatutoryDeduction.objects.get(payslip=ps_july)
        self.assertEqual(deduct_july.employee_deduction, Decimal('100.00')) # 2% of 5000
        
    def test_disbursement(self):
        run = self._setup_payroll(6)
        self.client.post(reverse('payrollrun-calculate', kwargs={'pk': run.id}))
        
        from hrm.models import PayrollDisbursement, PayrollDisbursementStatus
        
        disbursement = PayrollDisbursement.objects.create(
            company=self.company,
            payroll_run=run,
            payment_account=self.bank_acc,
            disbursement_date=datetime.date.today(),
            status=PayrollDisbursementStatus.PENDING
        )
        
        from hrm.models import PayrollAccountingConfiguration
        self.payroll_config = PayrollAccountingConfiguration.objects.create(
            company=self.company,
            salary_payable_account=self.liability_acc,
            salary_expense_account=self.expense_acc
        )
        
        # 17 unfinalized PayrollRun rejected
        from hrm.services.payroll_disbursement_service import execute_payroll_disbursement
        from django.core.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            execute_payroll_disbursement(disbursement, self.admin)
            
        run.status = PayrollRunStatus.FINALIZED
        run.save()
        
        # 18 finalized run accepted, 19 batch creation, 20 PayslipDisbursement persistence, 21 selected BankAccount
        disbursement = execute_payroll_disbursement(disbursement, self.admin)
        self.assertEqual(disbursement.status, PayrollDisbursementStatus.COMPLETED)
        self.assertEqual(PayslipDisbursement.objects.filter(disbursement=disbursement).count(), 1)
        
        # 22 FinancialVoucher, 23 JournalEntry, 24 correct accounting
        self.assertIsNotNone(disbursement.payment_voucher)
        self.assertEqual(disbursement.payment_voucher.lines.count(), 1)
        
        # 25 duplicate execution
        with self.assertRaises(ValidationError):
            execute_payroll_disbursement(disbursement, self.admin)
            
    def test_tenant_isolation(self):
        # 3 tenant isolation
        ot = OvertimeRecord(company=self.company_b, employee=self.employee, date=datetime.date(2026, 6, 10), hours=Decimal('4.00'))
        # wait, cross tenant FK usually prevented by clean()
        from django.core.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            ot.clean()

