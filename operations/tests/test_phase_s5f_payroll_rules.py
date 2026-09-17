import datetime
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from django.core.exceptions import ValidationError

from companies.models import Company
from accounts.models import User
from crm.models import CRMEntity
from finance.models import Currency, BankAccount, EmployeeAdvance, AdvanceStatus, AdvanceRecoveryMethod, EmployeeAdvanceType
from hrm.models import (
    Employee, Designation, EmployeeSalaryAssignment, CompanyPayrollPolicy,
    StatutoryScheme, StatutorySchemeType, StatutorySchemeRateHistory,
    EmployeeStatutoryEnrollment, OvertimeRecord, OvertimeStatus, OvertimeType,
    WorkforceAttendance, AttendanceStatus, Shift
)
from operations.models import (
    OperationalSite, SecurityPost, ServiceContract, DutyRoster,
    DailyDutyPay, DailyPayRateSource, DailyPayCalculationStatus,
    PayrollAddition, PayrollAdditionType, PayrollAdditionFrequency,
    PayrollDeduction, PayrollDeductionType, PayrollDeductionFrequency,
    PayrollCalculationStatus, EmployeePayrollCalculation
)
from operations.services.payroll_rules_service import PayrollRulesService
from finance.services.advance_service import EmployeeAdvanceService


class PhaseS5FPayrollRulesTestCase(TestCase):
    def setUp(self):
        self.company1 = Company.objects.create(name="Security First Co")
        self.company2 = Company.objects.create(name="Apex Guard Ltd")

        self.user1 = User.objects.create_user(
            username="payroll_admin",
            email="payroll@sec1.com"
        )
        self.user1.company_id = self.company1.id
        self.user1.save()

        self.currency = Currency.objects.create(
            company=self.company1,
            code="PKR",
            name="Pakistani Rupee",
            symbol="Rs"
        )

        self.policy = CompanyPayrollPolicy.objects.create(
            company=self.company1,
            daily_rate_divisor=Decimal('30.00'),
            standard_monthly_hours=Decimal('208.00'),
            overtime_multiplier=Decimal('1.50'),
            holiday_pay_percentage=Decimal('100.00'),
            weekly_off_pay_percentage=Decimal('100.00'),
            is_active=True
        )

        self.designation_guard = Designation.objects.create(
            company=self.company1,
            name="Security Guard",
            code="SG-01"
        )

        # Employee 1
        self.emp1 = Employee.objects.create(
            company=self.company1,
            employee_code="EMP-101",
            first_name="Bilal",
            last_name="Khan",
            designation=self.designation_guard,
            employment_status="ACTIVE",
            hire_date=datetime.date(2025, 1, 1),
            classification="DIRECT"
        )

        # Employee 2 (Tenant 2)
        self.emp_t2 = Employee.objects.create(
            company=self.company2,
            employee_code="EMP-T2",
            first_name="Tariq",
            last_name="Aziz",
            employment_status="ACTIVE",
            hire_date=datetime.date(2025, 1, 1)
        )

        # Employee 1 Salary Assignment (Base 30,000, Single OT: 150, Double OT: 300)
        self.salary_assignment = EmployeeSalaryAssignment.objects.create(
            company=self.company1,
            employee=self.emp1,
            currency=self.currency,
            base_salary=Decimal('30000.00'),
            daily_rate=Decimal('1000.00'),
            single_ot_rate=Decimal('150.00'),
            double_ot_rate=Decimal('300.00'),
            effective_from=datetime.date(2026, 1, 1),
            status='ACTIVE'
        )

        self.client = CRMEntity.objects.create(
            company=self.company1,
            name="Metro Mall",
            entity_type='CUSTOMER'
        )
        self.site = OperationalSite.objects.create(
            company=self.company1,
            crm_entity=self.client,
            name="Mall Sector A",
            address="Commercial Area"
        )
        self.post = SecurityPost.objects.create(
            company=self.company1,
            site=self.site,
            post_name="Gate 1 Guard Post",
            required_designation=self.designation_guard,
            daily_pay_rate=Decimal('1000.00')
        )
        self.contract = ServiceContract.objects.create(
            company=self.company1,
            crm_entity=self.client,
            contract_code="CONT-2026-MALL",
            start_date=datetime.date(2026, 1, 1),
            end_date=datetime.date(2026, 12, 31)
        )

        self.period_start = datetime.date(2026, 9, 1)
        self.period_end = datetime.date(2026, 9, 30)

    def test_daily_duty_earnings_consumed_correctly(self):
        """Finalized DailyDutyPay records are accurately aggregated into duty_earnings and duty_days_count."""
        # Create 3 daily duties: 2 PRESENT (1000 each) and 1 HALF_DAY (500)
        DailyDutyPay.objects.create(
            company=self.company1,
            employee=self.emp1,
            duty_date=datetime.date(2026, 9, 1),
            attendance_status=AttendanceStatus.PRESENT,
            site=self.site,
            post=self.post,
            contract=self.contract,
            rate_source=DailyPayRateSource.POST_RATE,
            daily_payable_rate=Decimal('1000.00'),
            payable_percentage=Decimal('100.00'),
            payable_amount=Decimal('1000.00'),
            calculation_status=DailyPayCalculationStatus.CALCULATED
        )
        DailyDutyPay.objects.create(
            company=self.company1,
            employee=self.emp1,
            duty_date=datetime.date(2026, 9, 2),
            attendance_status=AttendanceStatus.PRESENT,
            site=self.site,
            post=self.post,
            contract=self.contract,
            rate_source=DailyPayRateSource.POST_RATE,
            daily_payable_rate=Decimal('1000.00'),
            payable_percentage=Decimal('100.00'),
            payable_amount=Decimal('1000.00'),
            calculation_status=DailyPayCalculationStatus.CALCULATED
        )
        DailyDutyPay.objects.create(
            company=self.company1,
            employee=self.emp1,
            duty_date=datetime.date(2026, 9, 3),
            attendance_status=AttendanceStatus.HALF_DAY,
            site=self.site,
            post=self.post,
            contract=self.contract,
            rate_source=DailyPayRateSource.POST_RATE,
            daily_payable_rate=Decimal('1000.00'),
            payable_percentage=Decimal('50.00'),
            payable_amount=Decimal('500.00'),
            calculation_status=DailyPayCalculationStatus.CALCULATED
        )

        calc = PayrollRulesService.calculate_employee_payroll(
            company=self.company1,
            employee=self.emp1,
            period_start=self.period_start,
            period_end=self.period_end,
            user=self.user1
        )

        self.assertEqual(calc.duty_days_count, 3)
        self.assertEqual(calc.duty_earnings, Decimal('2500.00'))
        self.assertEqual(calc.gross_earnings, Decimal('2500.00'))
        self.assertEqual(calc.status, PayrollCalculationStatus.CALCULATED)
        self.assertFalse(calc.has_blockers)

    def test_single_and_double_overtime_calculation(self):
        """Approved Single and Double OT records consume correct compensation rates and accumulate into gross."""
        # 1 Single OT: 4 hours @ 150 = 600
        OvertimeRecord.objects.create(
            company=self.company1,
            employee=self.emp1,
            date=datetime.date(2026, 9, 5),
            hours=Decimal('4.00'),
            ot_type=OvertimeType.SINGLE_OT,
            status=OvertimeStatus.APPROVED,
            reason="Night shift extension"
        )
        # 1 Double OT: 2 hours @ 300 = 600
        OvertimeRecord.objects.create(
            company=self.company1,
            employee=self.emp1,
            date=datetime.date(2026, 9, 6),
            hours=Decimal('2.00'),
            ot_type=OvertimeType.DOUBLE_OT,
            status=OvertimeStatus.APPROVED,
            reason="Sunday emergency post coverage"
        )
        # 1 Pending OT: should NOT be included in payroll
        OvertimeRecord.objects.create(
            company=self.company1,
            employee=self.emp1,
            date=datetime.date(2026, 9, 7),
            hours=Decimal('5.00'),
            ot_type=OvertimeType.SINGLE_OT,
            status=OvertimeStatus.PENDING,
            reason="Unapproved OT"
        )

        calc = PayrollRulesService.calculate_employee_payroll(
            company=self.company1,
            employee=self.emp1,
            period_start=self.period_start,
            period_end=self.period_end,
            user=self.user1
        )

        self.assertEqual(calc.single_ot_hours, Decimal('4.00'))
        self.assertEqual(calc.single_ot_amount, Decimal('600.00'))
        self.assertEqual(calc.double_ot_hours, Decimal('2.00'))
        self.assertEqual(calc.double_ot_amount, Decimal('600.00'))
        self.assertEqual(calc.total_ot_amount, Decimal('1200.00'))
        self.assertEqual(calc.gross_earnings, Decimal('1200.00'))

    def test_statutory_eobi_employee_specific_override_and_employer_exclusion(self):
        """EOBI calculates employee deduction and employer contribution separately; employer contribution does NOT reduce net."""
        DailyDutyPay.objects.create(
            company=self.company1,
            employee=self.emp1,
            duty_date=datetime.date(2026, 9, 1),
            attendance_status=AttendanceStatus.PRESENT,
            payable_amount=Decimal('10000.00'),
            daily_payable_rate=Decimal('10000.00'),
            calculation_status=DailyPayCalculationStatus.CALCULATED
        )

        eobi = StatutoryScheme.objects.create(
            company=self.company1,
            code="EOBI",
            name="Employees Old-Age Benefits",
            scheme_type=StatutorySchemeType.EOBI,
            employee_default_rate=Decimal('1.00'),
            employer_default_rate=Decimal('5.00'),
            is_active=True
        )

        # Employee enrollment with specific override: Employee 2.00%, Employer 6.00%
        EmployeeStatutoryEnrollment.objects.create(
            company=self.company1,
            employee=self.emp1,
            scheme=eobi,
            identifier="EOBI-999281",
            is_enabled=True,
            use_company_default=False,
            employee_rate_override=Decimal('2.00'),
            employer_rate_override=Decimal('6.00'),
            is_active=True
        )

        calc = PayrollRulesService.calculate_employee_payroll(
            company=self.company1,
            employee=self.emp1,
            period_start=self.period_start,
            period_end=self.period_end,
            user=self.user1
        )

        # Basis = 10,000. Employee deduction = 2% of 10,000 = 200. Employer contribution = 6% of 10,000 = 600.
        self.assertEqual(calc.eobi_employee_amount, Decimal('200.00'))
        self.assertEqual(calc.eobi_employer_amount, Decimal('600.00'))
        self.assertEqual(calc.total_statutory_deductions, Decimal('200.00'))
        self.assertEqual(calc.total_employer_statutory, Decimal('600.00'))

        # Employer amount must NOT reduce employee net salary!
        # Net = Gross (10,000) - Employee Deduction (200) = 9,800
        self.assertEqual(calc.net_payable, Decimal('9800.00'))

    def test_statutory_sessi_pessi_company_fallback_rate(self):
        """SESSI/PESSI resolves company effective default rate when no employee override exists."""
        DailyDutyPay.objects.create(
            company=self.company1,
            employee=self.emp1,
            duty_date=datetime.date(2026, 9, 1),
            attendance_status=AttendanceStatus.PRESENT,
            payable_amount=Decimal('20000.00'),
            daily_payable_rate=Decimal('20000.00'),
            calculation_status=DailyPayCalculationStatus.CALCULATED
        )

        sessi = StatutoryScheme.objects.create(
            company=self.company1,
            code="SESSI",
            name="Sindh Employees Social Security",
            scheme_type=StatutorySchemeType.SOCIAL_SECURITY,
            employee_default_rate=Decimal('1.50'),
            employer_default_rate=Decimal('6.00'),
            is_active=True
        )

        # Enrollment using company default
        EmployeeStatutoryEnrollment.objects.create(
            company=self.company1,
            employee=self.emp1,
            scheme=sessi,
            identifier="SESSI-4421",
            is_enabled=True,
            use_company_default=True,
            is_active=True
        )

        calc = PayrollRulesService.calculate_employee_payroll(
            company=self.company1,
            employee=self.emp1,
            period_start=self.period_start,
            period_end=self.period_end,
            user=self.user1
        )

        # Basis = 20,000. Emp = 1.5% = 300, Empr = 6% = 1200
        self.assertEqual(calc.sessi_pessi_employee_amount, Decimal('300.00'))
        self.assertEqual(calc.sessi_pessi_employer_amount, Decimal('1200.00'))
        self.assertEqual(calc.net_payable, Decimal('19700.00'))

    def test_patrolling_and_insurance_deductions(self):
        """Configurable patrolling and insurance deductions are evaluated and deducted from gross."""
        DailyDutyPay.objects.create(
            company=self.company1,
            employee=self.emp1,
            duty_date=datetime.date(2026, 9, 1),
            attendance_status=AttendanceStatus.PRESENT,
            payable_amount=Decimal('15000.00'),
            daily_payable_rate=Decimal('15000.00'),
            calculation_status=DailyPayCalculationStatus.CALCULATED
        )

        PayrollDeduction.objects.create(
            company=self.company1,
            employee=self.emp1,
            deduction_type=PayrollDeductionType.PATROLLING,
            frequency=PayrollDeductionFrequency.ONE_TIME,
            name="Bike Fuel & Patrolling Deduction",
            amount=Decimal('800.00'),
            effective_date=datetime.date(2026, 9, 15),
            is_active=True,
            is_approved=True
        )

        PayrollDeduction.objects.create(
            company=self.company1,
            employee=self.emp1,
            deduction_type=PayrollDeductionType.INSURANCE,
            frequency=PayrollDeductionFrequency.RECURRING,
            name="Health & Life Insurance Premium",
            amount=Decimal('450.00'),
            effective_from=datetime.date(2026, 1, 1),
            is_active=True,
            is_approved=True
        )

        calc = PayrollRulesService.calculate_employee_payroll(
            company=self.company1,
            employee=self.emp1,
            period_start=self.period_start,
            period_end=self.period_end,
            user=self.user1
        )

        self.assertEqual(calc.patrolling_deduction, Decimal('800.00'))
        self.assertEqual(calc.insurance_deduction, Decimal('450.00'))
        self.assertEqual(calc.total_other_deductions, Decimal('1250.00'))
        self.assertEqual(calc.net_payable, Decimal('13750.00'))

    def test_one_time_and_recurring_additions_and_deductions(self):
        """Multiple addition and deduction types (bonus, allowance, fine) combine accurately into gross and deductions."""
        DailyDutyPay.objects.create(
            company=self.company1,
            employee=self.emp1,
            duty_date=datetime.date(2026, 9, 1),
            attendance_status=AttendanceStatus.PRESENT,
            payable_amount=Decimal('5000.00'),
            daily_payable_rate=Decimal('5000.00'),
            calculation_status=DailyPayCalculationStatus.CALCULATED
        )

        # Recurring Allowance
        PayrollAddition.objects.create(
            company=self.company1,
            employee=self.emp1,
            addition_type=PayrollAdditionType.ALLOWANCE,
            frequency=PayrollAdditionFrequency.RECURRING,
            name="Mobile Allowance",
            amount=Decimal('500.00'),
            effective_from=datetime.date(2026, 1, 1),
            is_active=True,
            is_approved=True
        )
        # One-time Bonus
        PayrollAddition.objects.create(
            company=self.company1,
            employee=self.emp1,
            addition_type=PayrollAdditionType.BONUS,
            frequency=PayrollAdditionFrequency.ONE_TIME,
            name="Eid Special Bonus",
            amount=Decimal('2000.00'),
            effective_date=datetime.date(2026, 9, 10),
            is_active=True,
            is_approved=True
        )
        # One-time Fine / Other Deduction
        PayrollDeduction.objects.create(
            company=self.company1,
            employee=self.emp1,
            deduction_type=PayrollDeductionType.FINE,
            frequency=PayrollDeductionFrequency.ONE_TIME,
            name="Late Post Reporting Penalty",
            amount=Decimal('300.00'),
            effective_date=datetime.date(2026, 9, 12),
            is_active=True,
            is_approved=True
        )

        calc = PayrollRulesService.calculate_employee_payroll(
            company=self.company1,
            employee=self.emp1,
            period_start=self.period_start,
            period_end=self.period_end,
            user=self.user1
        )

        self.assertEqual(calc.allowances_amount, Decimal('500.00'))
        self.assertEqual(calc.bonuses_amount, Decimal('2000.00'))
        self.assertEqual(calc.gross_earnings, Decimal('7500.00')) # 5000 duty + 500 allow + 2000 bonus
        self.assertEqual(calc.other_deductions_amount, Decimal('300.00'))
        self.assertEqual(calc.net_payable, Decimal('7200.00'))

    def test_employee_advance_recovery_and_no_over_recovery(self):
        """Advance recovery reduces outstanding balance, respects remaining balance, and never creates negative balance."""
        DailyDutyPay.objects.create(
            company=self.company1,
            employee=self.emp1,
            duty_date=datetime.date(2026, 9, 1),
            attendance_status=AttendanceStatus.PRESENT,
            payable_amount=Decimal('10000.00'),
            daily_payable_rate=Decimal('10000.00'),
            calculation_status=DailyPayCalculationStatus.CALCULATED
        )

        # Create paid advance with 1500 balance
        advance = EmployeeAdvance.objects.create(
            company=self.company1,
            employee=self.emp1,
            advance_type=EmployeeAdvanceType.SALARY_ADVANCE,
            amount=Decimal('1500.00'),
            settled_amount=Decimal('0.00'),
            returned_amount=Decimal('0.00'),
            outstanding_balance=Decimal('1500.00'),
            status=AdvanceStatus.PAID,
            recovery_method=AdvanceRecoveryMethod.PAYROLL_DEDUCTION,
            payroll_deduction_ready=True
        )

        # Request deduction of 1000 against this advance
        PayrollDeduction.objects.create(
            company=self.company1,
            employee=self.emp1,
            deduction_type=PayrollDeductionType.ADVANCE_RECOVERY,
            frequency=PayrollDeductionFrequency.ONE_TIME,
            name="Advance Recovery Installment",
            amount=Decimal('1000.00'),
            advance=advance,
            effective_date=datetime.date(2026, 9, 20),
            is_active=True,
            is_approved=True
        )

        calc = PayrollRulesService.calculate_employee_payroll(
            company=self.company1,
            employee=self.emp1,
            period_start=self.period_start,
            period_end=self.period_end,
            user=self.user1
        )

        self.assertEqual(calc.advance_recovery_amount, Decimal('1000.00'))
        self.assertEqual(calc.net_payable, Decimal('9000.00'))

        # Now test over-recovery prevention on EmployeeAdvanceService
        with self.assertRaises(ValidationError):
            EmployeeAdvanceService.record_payroll_deduction(
                advance=advance,
                deduction_amount=Decimal('2000.00') # Exceeds 1500
            )

    def test_unresolved_daily_pay_blocks_ready_status(self):
        """Unresolved DailyDutyPay in period flags calculation as BLOCKED and prohibits marking READY."""
        DailyDutyPay.objects.create(
            company=self.company1,
            employee=self.emp1,
            duty_date=datetime.date(2026, 9, 1),
            attendance_status=AttendanceStatus.PRESENT,
            payable_amount=Decimal('0.00'),
            daily_payable_rate=Decimal('0.00'),
            calculation_status=DailyPayCalculationStatus.UNRESOLVED,
            unresolved_reason="Missing post rate and contract designation rate"
        )

        calc = PayrollRulesService.calculate_employee_payroll(
            company=self.company1,
            employee=self.emp1,
            period_start=self.period_start,
            period_end=self.period_end,
            user=self.user1
        )

        self.assertEqual(calc.status, PayrollCalculationStatus.BLOCKED)
        self.assertTrue(calc.has_blockers)
        self.assertIn("Unresolved daily duty pay on 2026-09-01", calc.blocking_reasons[0])

        # Attempting to mark READY must raise ValidationError
        with self.assertRaises(ValidationError):
            PayrollRulesService.mark_calculation_ready(
                company=self.company1,
                calculation_id=calc.id,
                user=self.user1
            )

    def test_net_salary_calculation_and_negative_guard(self):
        """If total deductions exceed gross earnings, calculation is BLOCKED and cannot be marked READY."""
        DailyDutyPay.objects.create(
            company=self.company1,
            employee=self.emp1,
            duty_date=datetime.date(2026, 9, 1),
            attendance_status=AttendanceStatus.PRESENT,
            payable_amount=Decimal('2000.00'),
            daily_payable_rate=Decimal('2000.00'),
            calculation_status=DailyPayCalculationStatus.CALCULATED
        )

        # Huge deduction exceeding 2000
        PayrollDeduction.objects.create(
            company=self.company1,
            employee=self.emp1,
            deduction_type=PayrollDeductionType.FINE,
            frequency=PayrollDeductionFrequency.ONE_TIME,
            name="Major Disciplinary Penalty",
            amount=Decimal('3500.00'),
            effective_date=datetime.date(2026, 9, 10),
            is_active=True,
            is_approved=True
        )

        calc = PayrollRulesService.calculate_employee_payroll(
            company=self.company1,
            employee=self.emp1,
            period_start=self.period_start,
            period_end=self.period_end,
            user=self.user1
        )

        self.assertEqual(calc.status, PayrollCalculationStatus.BLOCKED)
        self.assertTrue(calc.has_blockers)
        self.assertTrue(any("negative" in r.lower() for r in calc.blocking_reasons))

    def test_tenant_isolation(self):
        """Ensure calculations, additions and deductions are strictly partitioned per company."""
        # Add deduction in Company 2
        PayrollDeduction.objects.create(
            company=self.company2,
            employee=self.emp_t2,
            deduction_type=PayrollDeductionType.PATROLLING,
            frequency=PayrollDeductionFrequency.ONE_TIME,
            name="Apex Patrolling",
            amount=Decimal('999.00'),
            effective_date=datetime.date(2026, 9, 15),
            is_active=True,
            is_approved=True
        )

        # Company 1 employee calculation must not see Company 2 deductions
        calc1 = PayrollRulesService.calculate_employee_payroll(
            company=self.company1,
            employee=self.emp1,
            period_start=self.period_start,
            period_end=self.period_end,
            user=self.user1
        )
        self.assertEqual(calc1.patrolling_deduction, Decimal('0.00'))

        # Cross-company calculation request must fail
        with self.assertRaises(Employee.DoesNotExist):
            PayrollRulesService.calculate_employee_payroll(
                company=self.company1,
                employee=self.emp_t2, # Belongs to company 2
                period_start=self.period_start,
                period_end=self.period_end,
                user=self.user1
            )

    def test_independent_eobi_sessi_pessi_calculation(self):
        """Independent EOBI, SESSI, and PESSI calculations expose separate employee/employer amounts and rate snapshots."""
        DailyDutyPay.objects.create(
            company=self.company1,
            employee=self.emp1,
            duty_date=datetime.date(2026, 9, 1),
            attendance_status=AttendanceStatus.PRESENT,
            payable_amount=Decimal('20000.00'),
            daily_payable_rate=Decimal('20000.00'),
            calculation_status=DailyPayCalculationStatus.CALCULATED
        )

        eobi = StatutoryScheme.objects.create(
            company=self.company1,
            code="EOBI",
            name="Employees Old-Age Benefits",
            scheme_type=StatutorySchemeType.EOBI,
            employee_default_rate=Decimal('1.00'),
            employer_default_rate=Decimal('5.00'),
            is_active=True
        )
        sessi = StatutoryScheme.objects.create(
            company=self.company1,
            code="SESSI",
            name="Sindh Employees Social Security",
            scheme_type=StatutorySchemeType.SOCIAL_SECURITY,
            employee_default_rate=Decimal('1.50'),
            employer_default_rate=Decimal('6.00'),
            is_active=True
        )
        pessi = StatutoryScheme.objects.create(
            company=self.company1,
            code="PESSI",
            name="Punjab Employees Social Security",
            scheme_type=StatutorySchemeType.SOCIAL_SECURITY,
            employee_default_rate=Decimal('2.00'),
            employer_default_rate=Decimal('7.00'),
            is_active=True
        )

        EmployeeStatutoryEnrollment.objects.create(
            company=self.company1,
            employee=self.emp1,
            scheme=eobi,
            is_enabled=True,
            use_company_default=True,
            is_active=True
        )
        EmployeeStatutoryEnrollment.objects.create(
            company=self.company1,
            employee=self.emp1,
            scheme=sessi,
            is_enabled=True,
            use_company_default=True,
            is_active=True
        )
        EmployeeStatutoryEnrollment.objects.create(
            company=self.company1,
            employee=self.emp1,
            scheme=pessi,
            is_enabled=True,
            use_company_default=True,
            is_active=True
        )

        calc = PayrollRulesService.calculate_employee_payroll(
            company=self.company1,
            employee=self.emp1,
            period_start=self.period_start,
            period_end=self.period_end,
            user=self.user1
        )

        # Base = 20,000
        # EOBI: 1% = 200, Empr: 5% = 1000
        self.assertEqual(calc.eobi_employee_amount, Decimal('200.00'))
        self.assertEqual(calc.eobi_employer_amount, Decimal('1000.00'))

        # SESSI: 1.5% = 300, Empr: 6% = 1200
        self.assertEqual(calc.sessi_employee_amount, Decimal('300.00'))
        self.assertEqual(calc.sessi_employer_amount, Decimal('1200.00'))

        # PESSI: 2% = 400, Empr: 7% = 1400
        self.assertEqual(calc.pessi_employee_amount, Decimal('400.00'))
        self.assertEqual(calc.pessi_employer_amount, Decimal('1400.00'))

        # Total employee statutory deductions = 200 + 300 + 400 = 900
        self.assertEqual(calc.total_statutory_deductions, Decimal('900.00'))

        # Total employer statutory = 1000 + 1200 + 1400 = 3600 (excluded from net)
        self.assertEqual(calc.total_employer_statutory, Decimal('3600.00'))
        self.assertEqual(calc.net_payable, Decimal('19100.00'))

        # Check line items expose rate snapshot and line types
        lines = list(calc.lines.filter(category='DEDUCTION'))
        line_types = [l.line_type for l in lines]
        self.assertIn('STATUTORY_EOBI', line_types)
        self.assertIn('STATUTORY_SESSI', line_types)
        self.assertIn('STATUTORY_PESSI', line_types)

        eobi_line = next(l for l in lines if l.line_type == 'STATUTORY_EOBI')
        self.assertEqual(eobi_line.amount, Decimal('200.00'))
        self.assertEqual(eobi_line.employer_amount, Decimal('1000.00'))
        self.assertEqual(eobi_line.rate_snapshot.get('employee_rate'), 1.0)
        self.assertEqual(eobi_line.rate_snapshot.get('employer_rate'), 5.0)

    def test_statutory_scheme_disabled_while_others_enabled(self):
        """When an employee's enrollment is disabled for a scheme, it does not apply."""
        DailyDutyPay.objects.create(
            company=self.company1,
            employee=self.emp1,
            duty_date=datetime.date(2026, 9, 1),
            attendance_status=AttendanceStatus.PRESENT,
            payable_amount=Decimal('20000.00'),
            daily_payable_rate=Decimal('20000.00'),
            calculation_status=DailyPayCalculationStatus.CALCULATED
        )

        eobi = StatutoryScheme.objects.create(
            company=self.company1,
            code="EOBI",
            name="Employees Old-Age Benefits",
            scheme_type=StatutorySchemeType.EOBI,
            employee_default_rate=Decimal('1.00'),
            employer_default_rate=Decimal('5.00'),
            is_active=True
        )
        sessi = StatutoryScheme.objects.create(
            company=self.company1,
            code="SESSI",
            name="Sindh Employees Social Security",
            scheme_type=StatutorySchemeType.SOCIAL_SECURITY,
            employee_default_rate=Decimal('1.50'),
            employer_default_rate=Decimal('6.00'),
            is_active=True
        )

        # EOBI enabled
        EmployeeStatutoryEnrollment.objects.create(
            company=self.company1,
            employee=self.emp1,
            scheme=eobi,
            is_enabled=True,
            use_company_default=True,
            is_active=True
        )
        # SESSI disabled
        EmployeeStatutoryEnrollment.objects.create(
            company=self.company1,
            employee=self.emp1,
            scheme=sessi,
            is_enabled=False,
            use_company_default=True,
            is_active=True
        )

        calc = PayrollRulesService.calculate_employee_payroll(
            company=self.company1,
            employee=self.emp1,
            period_start=self.period_start,
            period_end=self.period_end,
            user=self.user1
        )

        self.assertEqual(calc.eobi_employee_amount, Decimal('200.00'))
        self.assertEqual(calc.sessi_employee_amount, Decimal('0.00'))
        self.assertEqual(calc.sessi_employer_amount, Decimal('0.00'))
        self.assertEqual(calc.total_statutory_deductions, Decimal('200.00'))
        self.assertEqual(calc.net_payable, Decimal('19800.00'))

    def test_missing_ot_rate_becomes_blocked_instead_of_hardcoded_divisor(self):
        """Missing OT rate flags calculation as BLOCKED rather than using hardcoded divisor."""
        # Employee with salary assignment without single_ot_rate or double_ot_rate
        emp_no_ot = Employee.objects.create(
            company=self.company1,
            employee_code="EMP-NO-OT",
            first_name="Zahid",
            last_name="Hussain",
            designation=self.designation_guard,
            employment_status="ACTIVE",
            hire_date=datetime.date(2025, 1, 1),
            classification="DIRECT"
        )

        EmployeeSalaryAssignment.objects.create(
            company=self.company1,
            employee=emp_no_ot,
            currency=self.currency,
            base_salary=Decimal('24000.00'),
            daily_rate=Decimal('800.00'),
            single_ot_rate=Decimal('0.00'), # Missing / 0.00 rate!
            double_ot_rate=Decimal('0.00'), # Missing / 0.00 rate!
            effective_from=datetime.date(2026, 1, 1),
            status='ACTIVE'
        )

        DailyDutyPay.objects.create(
            company=self.company1,
            employee=emp_no_ot,
            duty_date=datetime.date(2026, 9, 1),
            attendance_status=AttendanceStatus.PRESENT,
            payable_amount=Decimal('800.00'),
            daily_payable_rate=Decimal('800.00'),
            calculation_status=DailyPayCalculationStatus.CALCULATED
        )

        # Approved overtime without override rate
        OvertimeRecord.objects.create(
            company=self.company1,
            employee=emp_no_ot,
            date=datetime.date(2026, 9, 2),
            hours=Decimal('4.00'),
            ot_type=OvertimeType.SINGLE_OT,
            status=OvertimeStatus.APPROVED,
            rate_override=None,
            reason="Night patrol extra hours"
        )

        calc = PayrollRulesService.calculate_employee_payroll(
            company=self.company1,
            employee=emp_no_ot,
            period_start=self.period_start,
            period_end=self.period_end,
            user=self.user1
        )

        # Must NOT use 240 (24000 / 240 = 100). Must be marked BLOCKED!
        self.assertEqual(calc.status, PayrollCalculationStatus.BLOCKED)
        self.assertTrue(calc.has_blockers)
        self.assertTrue(any("Missing overtime rate" in r for r in calc.blocking_reasons))

        # Prohibits marking ready
        with self.assertRaises(ValidationError):
            PayrollRulesService.mark_calculation_ready(company=self.company1, calculation_id=calc.id)
