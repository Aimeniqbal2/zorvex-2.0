from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from datetime import date, timedelta
from django.contrib.auth import get_user_model

from companies.models import Company
from finance.models import Currency, ChartOfAccount, AccountGroup, FiscalYear, AccountingPeriod, Journal, JournalEntry
from hrm.models import (
    Employee, Employment, SalaryComponent, SalaryStructure, SalaryStructureComponent,
    EmployeeSalaryAssignment, PayrollPeriod, PayrollRun, Payslip, PayslipLine,
    ComponentType, CalculationType, PayrollRunStatus, PayslipStatus, PayrollAccountingConfiguration
)
from hrm.services.payroll_calculation import calculate_payroll_for_run, finalize_payroll_run
from hrm.services.finance_integration import preview_payroll_journal, post_payroll_to_finance

User = get_user_model()

class UniversalPayrollFinanceIntegrationTestCase(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name='Company A')
        self.user = User.objects.create(username='user_a', company=self.company, is_superuser=True)
        
        # Finance Setup
        self.currency = Currency.objects.create(company=self.company, code='USD', name='US Dollar')
        self.fiscal_year = FiscalYear.objects.create(
            company=self.company, name='2023', start_date=date(2023, 1, 1), end_date=date(2023, 12, 31)
        )
        self.period = AccountingPeriod.objects.create(
            company=self.company, fiscal_year=self.fiscal_year, month=1,
            start_date=date(2023, 1, 1), end_date=date(2023, 1, 31), status='OPEN'
        )
        self.journal = Journal.objects.create(company=self.company, name='General Journal', code='GJ')
        
        self.account_group = AccountGroup.objects.create(company=self.company, name='Expenses', group_type='EXPENSE')
        self.salary_expense = ChartOfAccount.objects.create(
            company=self.company, account_group=self.account_group, account_name='Salary Expense', account_code='6000'
        )
        self.liability_group = AccountGroup.objects.create(company=self.company, name='Liabilities', group_type='LIABILITY')
        self.salary_payable = ChartOfAccount.objects.create(
            company=self.company, account_group=self.liability_group, account_name='Salary Payable', account_code='2000'
        )
        self.tax_payable = ChartOfAccount.objects.create(
            company=self.company, account_group=self.liability_group, account_name='Tax Payable', account_code='2100'
        )
        
        self.config = PayrollAccountingConfiguration.objects.create(
            company=self.company,
            salary_expense_account=self.salary_expense,
            salary_payable_account=self.salary_payable,
            tax_payable_account=self.tax_payable,
            is_active=True
        )
        
        # HR Setup
        self.emp = Employee.objects.create(company=self.company, first_name='John', last_name='Doe')
        self.employment = Employment.objects.create(company=self.company, employee=self.emp, start_date=date(2023, 1, 1), is_current=True)
        
        self.comp_basic = SalaryComponent.objects.create(
            company=self.company, name='Basic', code='B1',
            component_type=ComponentType.EARNING, calculation_type=CalculationType.FIXED
        )
        self.comp_tax = SalaryComponent.objects.create(
            company=self.company, name='Tax', code='T1',
            component_type=ComponentType.TAX, calculation_type=CalculationType.FIXED, is_taxable=True
        )
        
        self.structure = SalaryStructure.objects.create(
            company=self.company, name='Standard', currency=self.currency, effective_from=date(2023, 1, 1)
        )
        SalaryStructureComponent.objects.create(company=self.company, salary_structure=self.structure, salary_component=self.comp_basic, amount=Decimal('5000'))
        SalaryStructureComponent.objects.create(company=self.company, salary_structure=self.structure, salary_component=self.comp_tax, amount=Decimal('500'))
        
        self.assignment = EmployeeSalaryAssignment.objects.create(
            company=self.company, employee=self.emp, employment=self.employment,
            salary_structure=self.structure, currency=self.currency, base_salary=Decimal('5000'),
            effective_from=date(2023, 1, 1)
        )
        
        self.payroll_period = PayrollPeriod.objects.create(
            company=self.company, name='Jan 2023 Payroll',
            start_date=date(2023, 1, 1), end_date=date(2023, 1, 31), payment_date=date(2023, 2, 5)
        )
        self.run = PayrollRun.objects.create(
            company=self.company, payroll_period=self.payroll_period, status=PayrollRunStatus.DRAFT
        )
        
    def test_payroll_journal_preview_and_posting(self):
        # 1. Calculate Payroll
        calculate_payroll_for_run(self.company.id, self.run.id, self.user.id)
        
        # 2. Finalize Payroll
        finalize_payroll_run(self.company.id, self.run.id, self.user.id)
        self.run.refresh_from_db()
        self.assertEqual(self.run.status, PayrollRunStatus.FINALIZED)
        
        # 3. Preview Journal
        lines = preview_payroll_journal(self.run)
        self.assertEqual(len(lines), 3)
        
        total_debit = sum(l['debit'] for l in lines)
        total_credit = sum(l['credit'] for l in lines)
        self.assertEqual(total_debit, Decimal('5000.00'))
        self.assertEqual(total_credit, Decimal('5000.00'))
        
        # 4. Post to Finance
        journal_entry = post_payroll_to_finance(self.run.id, self.user.id)
        self.assertIsNotNone(journal_entry)
        self.assertEqual(journal_entry.status, 'POSTED')
        self.assertEqual(journal_entry.lines.count(), 3)
        
        # Verify run has reference
        self.run.refresh_from_db()
        self.assertEqual(self.run.journal_entry, journal_entry)

