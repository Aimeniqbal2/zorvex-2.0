import datetime
from decimal import Decimal
from django.urls import reverse
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from companies.models import Company
from erp_core.models import DocumentSequence
from finance.models import Currency, ChartOfAccount, AccountGroup, FinancialVoucher, JournalEntry, FiscalYear, AccountingPeriod, Journal
from hrm.models import (
    Employee, Employment, SalaryComponent, SalaryStructure,
    SalaryStructureComponent, EmployeeSalaryAssignment,
    PayrollPeriod, PayrollRun, PayrollRunStatus, ComponentType, CalculationType,
    Payslip, PayslipLine, Designation, OvertimeRecord, OvertimeStatus,
    CompanyPayrollPolicy, PayrollAccountingConfiguration, PayrollDisbursement,
    StatutoryScheme, StatutorySchemeType, StatutoryRule, EmployeeStatutoryEnrollment,
    PayslipStatutoryDeduction, PayrollDisbursementStatus
)
from operations.models import ExtraDuty, ExtraDutyStatus, OperationalSite, ServiceContract, ContractRate
from hrm.services.payroll_calculation import calculate_payroll_for_employee
from billing.models import ExtraDutyPayrollBridge
from operations.services.payroll_bridge import process_extra_duty_payroll
from hrm.services.payroll_disbursement_service import execute_payroll_disbursement
from hrm.services.finance_integration import post_payroll_to_finance
from crm.models import CRMEntity

User = get_user_model()

class PhaseR7DTests(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name='Test Company R7D', business_type='SECURITY')
        self.company_b = Company.objects.create(name='Test Company R7D B', business_type='SECURITY')
        
        self.currency = Currency.objects.create(company=self.company, code='USD', name='US Dollar', symbol='$')
        self.designation = Designation.objects.create(company=self.company, name='Security Guard')
        
        self.admin = User.objects.create_user(username='admin_r7d', password='password123', company=self.company, role='admin')
        self.client.force_authenticate(user=self.admin)
        
        self.employee = Employee.objects.create(company=self.company, first_name='John', last_name='Doe', designation=self.designation)
        self.employment = Employment.objects.create(company=self.company, employee=self.employee, start_date=datetime.date(2026, 1, 1), employment_type='FULL_TIME')
        
        self.base_comp = SalaryComponent.objects.create(company=self.company, code='BASE', name='Base Salary', component_type=ComponentType.EARNING, calculation_type=CalculationType.FIXED)
        self.structure = SalaryStructure.objects.create(company=self.company, name='Base', currency=self.currency, effective_from=datetime.date(2026, 1, 1))
        SalaryStructureComponent.objects.create(company=self.company, salary_structure=self.structure, salary_component=self.base_comp, amount=Decimal('5000.00'), sequence=1)
        self.assignment = EmployeeSalaryAssignment.objects.create(company=self.company, employee=self.employee, employment=self.employment, salary_structure=self.structure, currency=self.currency, effective_from=datetime.date(2026, 1, 1), base_salary=Decimal('5000.00'), status='ACTIVE')

        self.account_group = AccountGroup.objects.create(company=self.company, name='Current Assets', group_type='ASSET')
        self.salary_expense_acc = ChartOfAccount.objects.create(company=self.company, account_group=self.account_group, account_code='6002', account_name='Salary Expense', account_type='Expense')
        self.salary_payable_acc = ChartOfAccount.objects.create(company=self.company, account_group=self.account_group, account_code='2002', account_name='Salary Payable', account_type='Liability')
        self.bank_acc = ChartOfAccount.objects.create(company=self.company, account_group=self.account_group, account_code='1002', account_name='Main Bank', account_type='Asset')

        self.payroll_config = PayrollAccountingConfiguration.objects.create(
            company=self.company,
            salary_expense_account=self.salary_expense_acc,
            salary_payable_account=self.salary_payable_acc,
            is_active=True
        )

        # Finance infrastructure required by post_payroll_to_finance
        self.fy = FiscalYear.objects.create(
            company=self.company, name='FY2026',
            start_date=datetime.date(2026, 1, 1),
            end_date=datetime.date(2026, 12, 31)
        )
        self.acc_period = AccountingPeriod.objects.create(
            company=self.company,
            fiscal_year=self.fy,
            month=1,
            start_date=datetime.date(2026, 1, 1),
            end_date=datetime.date(2026, 1, 31),
            status='OPEN'
        )
        self.journal = Journal.objects.create(
            company=self.company, code='PAY', name='Payroll Journal', journal_type='PAYROLL'
        )

    def _setup_payroll(self, month):
        period = PayrollPeriod.objects.create(
            company=self.company, name=f'{month} 2026', 
            start_date=datetime.date(2026, month, 1), 
            end_date=datetime.date(2026, month, 28),
            payment_date=datetime.date(2026, month, 28)
        )
        run = PayrollRun.objects.create(company=self.company, payroll_period=period, run_number=f'PR-{month}')
        return run

    def test_company_overtime_policy(self):
        # 1 & 2 & 3. company-specific overtime divisor, multiplier, calculation
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
        calculate_payroll_for_employee(self.company.id, run, self.employee, self.assignment)
        
        payslip = Payslip.objects.get(payroll_run=run, employee=self.employee)
        ot_line = payslip.lines.get(salary_component__code='OVERTIME_PAY')
        
        # Base: 5000, Divisor: 200 => Hourly: 25.00
        # Multiplier: 2.00 => Rate: 50.00
        # Hours: 10 => Total: 500.00
        self.assertEqual(ot_line.amount, Decimal('500.00'))

    def test_draft_recalculation_exact_once(self):
        # 4. draft recalculation exact-once
        ot = OvertimeRecord.objects.create(
            company=self.company, employee=self.employee, date=datetime.date(2026, 1, 15),
            hours=Decimal('10.00'), status=OvertimeStatus.APPROVED
        )
        
        run = self._setup_payroll(1)
        calculate_payroll_for_employee(self.company.id, run, self.employee, self.assignment)
        
        # Recalculate (wipes draft payslips)
        Payslip.objects.filter(payroll_run=run).delete()
        calculate_payroll_for_employee(self.company.id, run, self.employee, self.assignment)
        
        payslip = Payslip.objects.get(payroll_run=run, employee=self.employee)
        ot_lines = payslip.lines.filter(salary_component__code='OVERTIME_PAY')
        self.assertEqual(ot_lines.count(), 1)
        
        ot.refresh_from_db()
        self.assertEqual(ot.processed_payslip, payslip)
        self.assertEqual(ot.status, OvertimeStatus.PROCESSED)

    def test_second_payroll_run_no_reuse(self):
        # 5 & 7. second PayrollRun does not reuse consumed overtime & finalization source integrity
        ot = OvertimeRecord.objects.create(
            company=self.company, employee=self.employee, date=datetime.date(2026, 1, 15),
            hours=Decimal('10.00'), status=OvertimeStatus.APPROVED
        )
        run1 = self._setup_payroll(1)
        calculate_payroll_for_employee(self.company.id, run1, self.employee, self.assignment)
        
        run1.status = PayrollRunStatus.FINALIZED
        run1.save()
        payslip1 = Payslip.objects.get(payroll_run=run1, employee=self.employee)
        payslip1.status = 'FINALIZED'
        payslip1.save()
        
        # Second payroll run for the same period
        run2 = PayrollRun.objects.create(company=self.company, payroll_period=run1.payroll_period, run_number='PR-2')
        calculate_payroll_for_employee(self.company.id, run2, self.employee, self.assignment)
        
        payslip2 = Payslip.objects.get(payroll_run=run2, employee=self.employee)
        ot_lines = payslip2.lines.filter(salary_component__code='OVERTIME_PAY')
        self.assertEqual(ot_lines.count(), 0) # Should not be paid again

    def test_failed_payroll_does_not_consume(self):
        # 6. failed payroll does not incorrectly consume overtime
        ot = OvertimeRecord.objects.create(
            company=self.company, employee=self.employee, date=datetime.date(2026, 1, 15),
            hours=Decimal('10.00'), status=OvertimeStatus.APPROVED
        )
        run = self._setup_payroll(1)
        
        # Force a failure (cross-company mismatch)
        try:
            calculate_payroll_for_employee(self.company_b.id, run, self.employee, self.assignment)
        except Exception:
            pass
            
        ot.refresh_from_db()
        self.assertEqual(ot.status, OvertimeStatus.APPROVED) # Still APPROVED, not consumed
        self.assertIsNone(ot.processed_payslip)

    def test_extraduty_non_duplication(self):
        # 8. ExtraDuty non-duplication
        crm_entity = CRMEntity.objects.create(company=self.company, entity_type='CLIENT', name='Client A')
        site = OperationalSite.objects.create(company=self.company, crm_entity=crm_entity, name='Site A')
        contract = ServiceContract.objects.create(company=self.company, crm_entity=crm_entity, start_date=datetime.date(2026, 1, 1))
        contract.sites.add(site)
        ContractRate.objects.create(company=self.company, service_contract=contract, designation=self.designation, effective_date=datetime.date(2026, 1, 1), pay_rate=Decimal('20.00'), billing_rate=Decimal('30.00'))
        
        ed = ExtraDuty.objects.create(
            company=self.company, employee=self.employee, date=datetime.date(2026, 1, 15),
            hours=Decimal('5.00'), status=ExtraDutyStatus.APPROVED, service_contract=contract
        )
        run = self._setup_payroll(1)
        calculate_payroll_for_employee(self.company.id, run, self.employee, self.assignment)
        
        # Process extra duty
        res = process_extra_duty_payroll(ed.id, run.id, self.company.id)
        self.assertTrue(res['created'])
        
        # Process again
        res2 = process_extra_duty_payroll(ed.id, run.id, self.company.id)
        self.assertFalse(res2['created']) # Idempotent

    def test_cross_tenant_policy(self):
        # 9. cross-tenant overtime policy
        CompanyPayrollPolicy.objects.create(company=self.company_b, standard_monthly_hours=Decimal('100.00'), overtime_multiplier=Decimal('3.00'))
        CompanyPayrollPolicy.objects.create(company=self.company, standard_monthly_hours=Decimal('200.00'), overtime_multiplier=Decimal('2.00'))
        
        ot = OvertimeRecord.objects.create(
            company=self.company, employee=self.employee, date=datetime.date(2026, 1, 15),
            hours=Decimal('10.00'), status=OvertimeStatus.APPROVED
        )
        run = self._setup_payroll(1)
        calculate_payroll_for_employee(self.company.id, run, self.employee, self.assignment)
        payslip = Payslip.objects.get(payroll_run=run, employee=self.employee)
        ot_line = payslip.lines.get(salary_component__code='OVERTIME_PAY')
        
        # Base: 5000, Divisor: 200, Mult: 2 => Hourly: 50. Hours: 10 => 500
        self.assertEqual(ot_line.amount, Decimal('500.00'))

    def test_historical_payroll_policy_change(self):
        # 10. historical payroll after policy change
        CompanyPayrollPolicy.objects.create(company=self.company, standard_monthly_hours=Decimal('160.00'), overtime_multiplier=Decimal('1.50'))
        
        ot = OvertimeRecord.objects.create(company=self.company, employee=self.employee, date=datetime.date(2026, 1, 15), hours=Decimal('10.00'), status=OvertimeStatus.APPROVED)
        run = self._setup_payroll(1)
        calculate_payroll_for_employee(self.company.id, run, self.employee, self.assignment)
        
        payslip = Payslip.objects.get(payroll_run=run, employee=self.employee)
        payslip.status = 'FINALIZED'
        payslip.save()
        old_amount = payslip.lines.get(salary_component__code='OVERTIME_PAY').amount
        
        # Change policy
        policy = CompanyPayrollPolicy.objects.get(company=self.company)
        policy.overtime_multiplier = Decimal('2.00')
        policy.save()
        
        # Historical payslip remains unchanged
        payslip.refresh_from_db()
        self.assertEqual(payslip.lines.get(salary_component__code='OVERTIME_PAY').amount, old_amount)

    def test_statutory_effective_dating(self):
        # 11, 12, 13, 14. statutory effective rules and enrollment persistence
        scheme = StatutoryScheme.objects.create(company=self.company, name='Tax', scheme_type=StatutorySchemeType.INCOME_TAX, is_active=True, liability_account=self.salary_payable_acc)
        # Rule A (effective before Feb)
        StatutoryRule.objects.create(company=self.company, scheme=scheme, effective_from=datetime.date(2025, 1, 1), employee_rate=Decimal('10.00'), employer_rate=Decimal('0.00'))
        # Rule B (effective Feb onwards)
        StatutoryRule.objects.create(company=self.company, scheme=scheme, effective_from=datetime.date(2026, 2, 1), employee_rate=Decimal('12.00'), employer_rate=Decimal('0.00'))
        
        EmployeeStatutoryEnrollment.objects.create(company=self.company, employee=self.employee, scheme=scheme, is_active=True)
        
        # Payroll Jan
        run_jan = self._setup_payroll(1)
        calculate_payroll_for_employee(self.company.id, run_jan, self.employee, self.assignment)
        ps_jan = Payslip.objects.get(payroll_run=run_jan)
        deduction_jan = PayslipStatutoryDeduction.objects.get(payslip=ps_jan, scheme=scheme)
        self.assertEqual(deduction_jan.employee_deduction, Decimal('500.00')) # 10% of 5000
        
        ps_jan.status = 'FINALIZED'
        ps_jan.save()
        
        # Payroll Feb
        run_feb = self._setup_payroll(2)
        calculate_payroll_for_employee(self.company.id, run_feb, self.employee, self.assignment)
        ps_feb = Payslip.objects.get(payroll_run=run_feb)
        deduction_feb = PayslipStatutoryDeduction.objects.get(payslip=ps_feb, scheme=scheme)
        self.assertEqual(deduction_feb.employee_deduction, Decimal('600.00')) # 12% of 5000
        
        # Finalized statutory history test
        deduction_jan.refresh_from_db()
        self.assertEqual(deduction_jan.employee_deduction, Decimal('500.00'))

    def test_disbursement_and_handoff(self):
        # 15, 16, 17, 18. disbursement, duplicate disbursement, voucher, journal
        run = self._setup_payroll(1)
        calculate_payroll_for_employee(self.company.id, run, self.employee, self.assignment)
        payslip = Payslip.objects.get(payroll_run=run)
        
        run.status = PayrollRunStatus.FINALIZED
        run.save()
        
        disbursement = PayrollDisbursement.objects.create(
            company=self.company, payroll_run=run, payment_account=self.bank_acc, disbursement_date=datetime.date(2026, 1, 28)
        )
        
        # 15. Execute disbursement
        disbursement = execute_payroll_disbursement(disbursement, self.admin)
        self.assertEqual(disbursement.status, PayrollDisbursementStatus.COMPLETED)
        self.assertIsNotNone(disbursement.payment_voucher)
        self.assertEqual(disbursement.payment_voucher.total_amount, payslip.net_amount)
        
        # 16. Duplicate disbursement protection
        with self.assertRaises(Exception):
            execute_payroll_disbursement(disbursement, self.admin)
            
        # 17. Financial Voucher Handoff
        self.assertIsNotNone(disbursement.payment_voucher)
        self.assertEqual(disbursement.payment_voucher.voucher_type, 'PAYMENT')
        self.assertTrue(disbursement.payment_voucher.lines.exists())
        
        # 18. Journal Entry Handoff (separate step: post payroll to finance)
        je = post_payroll_to_finance(run.id, self.admin.id)
        run.refresh_from_db()
        self.assertIsNotNone(run.journal_entry)
        self.assertEqual(je.status, 'POSTED')

