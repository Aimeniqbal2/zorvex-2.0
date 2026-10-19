import datetime
from decimal import Decimal
from django.test import TestCase
from django.core.exceptions import ValidationError
from django.contrib.auth import get_user_model

from companies.models import Company
from platform_core.models import Branch
from crm.models import CRMEntity
from hrm.models import (
    Employee, Department, Designation,
    WorkforceAttendance, AttendanceStatus
)
from operations.models import (
    OperationalSite, SecurityPost, Deployment,
    DeploymentAssignmentType, DeploymentStatus,
    DailyDutyPay, DutyType, DailyPayCalculationStatus,
    PayrollCalculationStatus
)
from operations.services.attendance_validation_service import (
    AttendanceValidationService, normalize_attendance_code
)
from operations.services.monthly_muster_service import MonthlyMusterService
from operations.services.payroll_rules_service import PayrollRulesService

User = get_user_model()


class AttendanceSystemValidationAndPersistenceTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="SecureCorp Operations Ltd")
        self.branch = Branch.objects.create(company=self.company, name="Main Operations Branch")
        self.user = User.objects.create_user(username="ops_admin", email="ops@securecorp.com", password="password123")
        self.user.company_id = self.company.id
        self.user.save()

        # Customer / Client
        self.client = CRMEntity.objects.create(
            company=self.company,
            name="Bank Alfalah",
            entity_type='CUSTOMER'
        )

        # Operational Sites
        self.site_a = OperationalSite.objects.create(
            company=self.company,
            name="Bank Alfalah Main Branch",
            crm_entity=self.client
        )
        self.site_b = OperationalSite.objects.create(
            company=self.company,
            name="Bank Alfalah Clifton Branch",
            crm_entity=self.client
        )

        # Department & Designation
        self.dept = Department.objects.create(company=self.company, name="Guarding Operations")
        self.desig_guard = Designation.objects.create(company=self.company, name="Security Guard", code="SG")

        # Guard
        self.guard = Employee.objects.create(
            company=self.company,
            first_name="Tariq",
            last_name="Mahmood",
            employee_code="SEC-00101",
            designation=self.desig_guard,
            employment_status='ACTIVE'
        )

        # Deployment at Site A: Monthly salary PKR 31,000 (October: 31 days -> daily rate 1,000)
        self.dep_a = Deployment.objects.create(
            company=self.company,
            site=self.site_a,
            employee=self.guard,
            designation=self.desig_guard,
            location_monthly_salary=Decimal('31000.00'),
            start_date=datetime.date(2026, 10, 1),
            assignment_type=DeploymentAssignmentType.PERMANENT,
            status=DeploymentStatus.ACTIVE
        )

        # Deployment at Site B: Monthly salary PKR 31,000
        self.dep_b = Deployment.objects.create(
            company=self.company,
            site=self.site_b,
            employee=self.guard,
            designation=self.desig_guard,
            location_monthly_salary=Decimal('31000.00'),
            start_date=datetime.date(2026, 10, 1),
            assignment_type=DeploymentAssignmentType.TEMPORARY,
            status=DeploymentStatus.ACTIVE
        )

    def test_normalize_attendance_code(self):
        """Tests that normalize_attendance_code maps keyboard aliases to canonical codes."""
        self.assertEqual(normalize_attendance_code('1'), 'P')
        self.assertEqual(normalize_attendance_code('P'), 'P')
        self.assertEqual(normalize_attendance_code('O'), 'O')
        self.assertEqual(normalize_attendance_code('ot'), 'O')
        self.assertEqual(normalize_attendance_code('OD'), 'OD')
        self.assertEqual(normalize_attendance_code('od'), 'OD')
        self.assertEqual(normalize_attendance_code('doz'), 'OD')
        self.assertEqual(normalize_attendance_code('PO'), 'PO')
        self.assertEqual(normalize_attendance_code('POD'), 'POD')
        self.assertEqual(normalize_attendance_code('pod'), 'POD')
        self.assertEqual(normalize_attendance_code('P+OD'), 'POD')
        self.assertEqual(normalize_attendance_code('P+O'), 'PO')
        self.assertEqual(normalize_attendance_code('POT'), 'PO')
        self.assertEqual(normalize_attendance_code('WP'), 'WP')
        self.assertEqual(normalize_attendance_code('WO+P'), 'WP')
        self.assertEqual(normalize_attendance_code('D'), 'WP')
        self.assertEqual(normalize_attendance_code('DS'), 'WP')
        self.assertEqual(normalize_attendance_code('WO+OT'), 'WP')
        self.assertEqual(normalize_attendance_code('2'), 'WP')
        self.assertEqual(normalize_attendance_code('W'), 'W')
        self.assertEqual(normalize_attendance_code('WO'), 'W')
        self.assertEqual(normalize_attendance_code('OFF'), 'W')
        self.assertEqual(normalize_attendance_code('A'), 'A')
        self.assertEqual(normalize_attendance_code('0'), 'A')
        self.assertEqual(normalize_attendance_code('L'), 'L')
        self.assertEqual(normalize_attendance_code('PL'), 'L')
        self.assertEqual(normalize_attendance_code(''), '')
        self.assertEqual(normalize_attendance_code(None), '')

    def test_cannot_mark_duplicate_present_on_same_day(self):
        """Rule 1: Guard cannot be marked Present (P) at multiple sites on the same day."""
        updates = [
            {'site_id': str(self.site_a.id), 'employee_id': str(self.guard.id), 'day': 5, 'code': 'P'},
            {'site_id': str(self.site_b.id), 'employee_id': str(self.guard.id), 'day': 5, 'code': 'P'}
        ]
        with self.assertRaises(ValidationError) as ctx:
            AttendanceValidationService.validate_monthly_muster_batch(self.company, 2026, 10, updates)
        self.assertIn("cannot be marked Present (P) at multiple locations", str(ctx.exception))

    def test_overtime_requires_present_at_different_location(self):
        """Rule 4: Standalone Overtime (O) without Present (P) at another location must be rejected."""
        updates = [
            {'site_id': str(self.site_b.id), 'employee_id': str(self.guard.id), 'day': 5, 'code': 'O'}
        ]
        with self.assertRaises(ValidationError) as ctx:
            AttendanceValidationService.validate_monthly_muster_batch(self.company, 2026, 10, updates)
        self.assertIn("without a valid primary Present (P) shift", str(ctx.exception))

    def test_overtime_with_valid_present_at_other_site_passes(self):
        """Rule 4: P at Site A and O at Site B is valid and accepted."""
        updates = [
            {'site_id': str(self.site_a.id), 'employee_id': str(self.guard.id), 'day': 5, 'code': 'P'},
            {'site_id': str(self.site_b.id), 'employee_id': str(self.guard.id), 'day': 5, 'code': 'O'}
        ]
        result = AttendanceValidationService.validate_monthly_muster_batch(self.company, 2026, 10, updates)
        self.assertEqual(len(result['normalized_updates']), 2)

    def test_po_exclusivity(self):
        """Rule 2: PO at Site A consumes full daily capacity and precludes duty at Site B."""
        updates = [
            {'site_id': str(self.site_a.id), 'employee_id': str(self.guard.id), 'day': 5, 'code': 'PO'},
            {'site_id': str(self.site_b.id), 'employee_id': str(self.guard.id), 'day': 5, 'code': 'P'}
        ]
        with self.assertRaises(ValidationError) as ctx:
            AttendanceValidationService.validate_monthly_muster_batch(self.company, 2026, 10, updates)
        self.assertIn("consumes their full 2-shift daily capacity", str(ctx.exception))

    def test_wp_exclusivity(self):
        """Rule 3: Worked on Week Off (WP) consumes full daily capacity and precludes other duties."""
        updates = [
            {'site_id': str(self.site_a.id), 'employee_id': str(self.guard.id), 'day': 5, 'code': 'WP'},
            {'site_id': str(self.site_b.id), 'employee_id': str(self.guard.id), 'day': 5, 'code': 'O'}
        ]
        with self.assertRaises(ValidationError) as ctx:
            AttendanceValidationService.validate_monthly_muster_batch(self.company, 2026, 10, updates)
        self.assertIn("consumes their full daily capacity", str(ctx.exception))

    def test_absent_exclusivity(self):
        """Rule 5: Absent (A) cannot coexist with active duty at another site."""
        updates = [
            {'site_id': str(self.site_a.id), 'employee_id': str(self.guard.id), 'day': 5, 'code': 'A'},
            {'site_id': str(self.site_b.id), 'employee_id': str(self.guard.id), 'day': 5, 'code': 'P'}
        ]
        with self.assertRaises(ValidationError) as ctx:
            AttendanceValidationService.validate_monthly_muster_batch(self.company, 2026, 10, updates)
        self.assertIn("Cannot coexist with active duty", str(ctx.exception))

    def test_weekly_off_exclusivity(self):
        """Rule 6: Weekly Off (W) cannot coexist with active duty at another site."""
        updates = [
            {'site_id': str(self.site_a.id), 'employee_id': str(self.guard.id), 'day': 5, 'code': 'W'},
            {'site_id': str(self.site_b.id), 'employee_id': str(self.guard.id), 'day': 5, 'code': 'P'}
        ]
        with self.assertRaises(ValidationError) as ctx:
            AttendanceValidationService.validate_monthly_muster_batch(self.company, 2026, 10, updates)
        self.assertIn("mark 'WP' (Worked Week Off) instead", str(ctx.exception))

    def test_persistence_p_and_o_across_locations(self):
        """
        Tests persistence when guard works P at Site A and O at Site B:
        - Both DailyDutyPay records are created with proper duty_type.
        - Neither overwrites the other.
        """
        updates = [
            {'site_id': str(self.site_a.id), 'employee_id': str(self.guard.id), 'day': 10, 'code': 'P'},
            {'site_id': str(self.site_b.id), 'employee_id': str(self.guard.id), 'day': 10, 'code': 'O'}
        ]
        res = MonthlyMusterService.save_monthly_muster_updates(
            company=self.company, user=self.user, year=2026, month=10, updates=updates
        )
        self.assertEqual(res['status'], 'success')

        duties = DailyDutyPay.objects.filter(
            company=self.company, employee=self.guard, duty_date=datetime.date(2026, 10, 10)
        ).order_by('duty_type')

        self.assertEqual(duties.count(), 2)

        # Primary duty at Site A
        primary_duty = duties.filter(duty_type=DutyType.PRIMARY).first()
        self.assertIsNotNone(primary_duty)
        self.assertEqual(primary_duty.site_id, self.site_a.id)
        self.assertEqual(primary_duty.attendance_status, AttendanceStatus.PRESENT)
        self.assertEqual(primary_duty.payable_amount, Decimal('1000.00'))  # 31,000 / 31 = 1,000

        # Overtime duty at Site B
        ot_duty = duties.filter(duty_type=DutyType.OVERTIME).first()
        self.assertIsNotNone(ot_duty)
        self.assertEqual(ot_duty.site_id, self.site_b.id)
        self.assertEqual(ot_duty.attendance_status, AttendanceStatus.OVERTIME)
        self.assertEqual(ot_duty.payable_amount, Decimal('1000.00'))

    def test_persistence_po_same_location(self):
        """
        Tests PO creates both PRIMARY and OVERTIME DailyDutyPay rows at the same site.
        """
        updates = [
            {'site_id': str(self.site_a.id), 'employee_id': str(self.guard.id), 'day': 12, 'code': 'PO'}
        ]
        res = MonthlyMusterService.save_monthly_muster_updates(
            company=self.company, user=self.user, year=2026, month=10, updates=updates
        )
        self.assertEqual(res['status'], 'success')

        duties = DailyDutyPay.objects.filter(
            company=self.company, employee=self.guard, duty_date=datetime.date(2026, 10, 12), site=self.site_a
        )
        self.assertEqual(duties.count(), 2)
        self.assertTrue(duties.filter(duty_type=DutyType.PRIMARY).exists())
        self.assertTrue(duties.filter(duty_type=DutyType.OVERTIME).exists())

    def test_clear_cell_at_site_b_does_not_wipe_site_a(self):
        """
        Critical Bug Fix: Clearing empty cell at Site B MUST NOT delete Site A's attendance/duty pay!
        """
        # Step 1: Mark P at Site A and O at Site B
        updates = [
            {'site_id': str(self.site_a.id), 'employee_id': str(self.guard.id), 'day': 15, 'code': 'P'},
            {'site_id': str(self.site_b.id), 'employee_id': str(self.guard.id), 'day': 15, 'code': 'O'}
        ]
        MonthlyMusterService.save_monthly_muster_updates(
            company=self.company, user=self.user, year=2026, month=10, updates=updates
        )

        # Step 2: Clear cell at Site B
        clear_update = [
            {'site_id': str(self.site_b.id), 'employee_id': str(self.guard.id), 'day': 15, 'code': ''}
        ]
        MonthlyMusterService.save_monthly_muster_updates(
            company=self.company, user=self.user, year=2026, month=10, updates=clear_update
        )

        # Site B duty must be deleted
        self.assertFalse(DailyDutyPay.objects.filter(
            company=self.company, employee=self.guard, site=self.site_b, duty_date=datetime.date(2026, 10, 15)
        ).exists())

        # Site A duty must STILL EXIST!
        site_a_duty = DailyDutyPay.objects.filter(
            company=self.company, employee=self.guard, site=self.site_a, duty_date=datetime.date(2026, 10, 15)
        ).first()
        self.assertIsNotNone(site_a_duty)
        self.assertEqual(site_a_duty.attendance_status, AttendanceStatus.PRESENT)

        # WorkforceAttendance must still exist and point to Site A
        att = WorkforceAttendance.objects.filter(
            company=self.company, employee=self.guard, date=datetime.date(2026, 10, 15)
        ).first()
        self.assertIsNotNone(att)
        self.assertEqual(att.site_id, self.site_a.id)

    def test_wp_policy_a_payroll_calculation(self):
        """
        Policy A: WP awards double pay (2 days pay).
        With 1 day WP on Oct 1:
        Base daily rate = 1,000; WP amount = 2,000.
        """
        updates = [
            {'site_id': str(self.site_a.id), 'employee_id': str(self.guard.id), 'day': 1, 'code': 'WP'}
        ]
        MonthlyMusterService.save_monthly_muster_updates(
            company=self.company, user=self.user, year=2026, month=10, updates=updates
        )

        wp_duty = DailyDutyPay.objects.get(
            company=self.company, employee=self.guard, duty_date=datetime.date(2026, 10, 1)
        )
        self.assertEqual(wp_duty.attendance_status, AttendanceStatus.WORKED_WEEKLY_OFF)
        self.assertEqual(wp_duty.payable_percentage, Decimal('200.00'))
        self.assertEqual(wp_duty.payable_amount, Decimal('2000.00'))

        calc = PayrollRulesService.calculate_employee_payroll(
            company=self.company,
            employee=self.guard,
            period_start=datetime.date(2026, 10, 1),
            period_end=datetime.date(2026, 10, 31),
            user=self.user
        )

        self.assertEqual(calc.duty_earnings, Decimal('2000.00'))
        self.assertEqual(calc.duty_days_count, 1)

    def test_overtime_added_to_total_ot_amount_in_payroll(self):
        """
        Tests that overtime duty pay from monthly muster is credited into total_ot_amount.
        """
        updates = [
            {'site_id': str(self.site_a.id), 'employee_id': str(self.guard.id), 'day': 20, 'code': 'P'},
            {'site_id': str(self.site_b.id), 'employee_id': str(self.guard.id), 'day': 20, 'code': 'O'}
        ]
        MonthlyMusterService.save_monthly_muster_updates(
            company=self.company, user=self.user, year=2026, month=10, updates=updates
        )

        calc = PayrollRulesService.calculate_employee_payroll(
            company=self.company,
            employee=self.guard,
            period_start=datetime.date(2026, 10, 1),
            period_end=datetime.date(2026, 10, 31),
            user=self.user
        )

        # Primary shift (1,000) -> duty_earnings
        self.assertEqual(calc.duty_earnings, Decimal('1000.00'))
        self.assertEqual(calc.duty_days_count, 1)
        # Overtime shift (1,000) -> total_ot_amount
        self.assertEqual(calc.total_ot_amount, Decimal('1000.00'))
        # Gross earnings = 1,000 + 1,000 = 2,000
        self.assertEqual(calc.gross_earnings, Decimal('2000.00'))

    def test_unpaid_leave_zero_salary_and_zero_duty_days(self):
        """
        Tests that marking 'L' (Unpaid Leave):
        1. Records WorkforceAttendance with status=UNPAID_LEAVE.
        2. Records DailyDutyPay with 0.00 payable_amount and 0.00 payable_percentage.
        3. Excludes 'L' from payable_days in the muster grid.
        4. Excludes 'L' from duty_days_count and duty_earnings in payroll calculation.
        """
        updates = [
            {'site_id': str(self.site_a.id), 'employee_id': str(self.guard.id), 'day': 4, 'code': 'L'}
        ]
        res = MonthlyMusterService.save_monthly_muster_updates(
            company=self.company, user=self.user, year=2026, month=10, updates=updates
        )
        self.assertEqual(res['status'], 'success')

        # 1. WorkforceAttendance record
        att = WorkforceAttendance.objects.filter(
            company=self.company, employee=self.guard, date=datetime.date(2026, 10, 4)
        ).first()
        self.assertIsNotNone(att)
        self.assertEqual(att.status, AttendanceStatus.UNPAID_LEAVE)
        self.assertEqual(att.site_id, self.site_a.id)

        # 2. DailyDutyPay record
        duty = DailyDutyPay.objects.filter(
            company=self.company, employee=self.guard, duty_date=datetime.date(2026, 10, 4)
        ).first()
        self.assertIsNotNone(duty)
        self.assertEqual(duty.attendance_status, AttendanceStatus.UNPAID_LEAVE)
        self.assertEqual(duty.payable_percentage, Decimal('0.00'))
        self.assertEqual(duty.payable_amount, Decimal('0.00'))

        # 3. Monthly muster grid payable_days
        grid_data = MonthlyMusterService.get_monthly_muster_grid(
            company=self.company, year=2026, month=10, site_id=self.site_a.id
        )
        site_block = next(s for s in grid_data['sites'] if s['site_id'] == str(self.site_a.id))
        guard_row = next(r for r in site_block['guards'] if r['employee_id'] == str(self.guard.id))
        self.assertEqual(guard_row['total_leave'], 1)
        self.assertEqual(guard_row['payable_days'], 0)

        # 4. Payroll calculation
        calc = PayrollRulesService.calculate_employee_payroll(
            company=self.company,
            employee=self.guard,
            period_start=datetime.date(2026, 10, 1),
            period_end=datetime.date(2026, 10, 31),
            user=self.user
        )
        self.assertEqual(calc.duty_days_count, 0)
        self.assertEqual(calc.duty_earnings, Decimal('0.00'))

    def test_overtime_persisted_in_workforce_attendance(self):
        """
        Tests that when a guard has P at Site A and O at Site B:
        Both records are created in WorkforceAttendance with site references.
        """
        updates = [
            {'site_id': str(self.site_a.id), 'employee_id': str(self.guard.id), 'day': 5, 'code': 'P'},
            {'site_id': str(self.site_b.id), 'employee_id': str(self.guard.id), 'day': 5, 'code': 'O'}
        ]
        res = MonthlyMusterService.save_monthly_muster_updates(
            company=self.company, user=self.user, year=2026, month=10, updates=updates
        )
        self.assertEqual(res['status'], 'success')

        att_records = WorkforceAttendance.objects.filter(
            company=self.company, employee=self.guard, date=datetime.date(2026, 10, 5)
        ).order_by('status')

        self.assertEqual(att_records.count(), 2)

        present_att = att_records.filter(status=AttendanceStatus.PRESENT).first()
        self.assertIsNotNone(present_att)
        self.assertEqual(present_att.site_id, self.site_a.id)

        ot_att = att_records.filter(status=AttendanceStatus.OVERTIME).first()
        self.assertIsNotNone(ot_att)
        self.assertEqual(ot_att.site_id, self.site_b.id)

    def test_po_creates_dual_workforce_attendance_records(self):
        """
        Tests that marking 'PO' at Site A creates two WorkforceAttendance records:
        One PRESENT and one OVERTIME, both linked to Site A.
        """
        updates = [
            {'site_id': str(self.site_a.id), 'employee_id': str(self.guard.id), 'day': 6, 'code': 'PO'}
        ]
        res = MonthlyMusterService.save_monthly_muster_updates(
            company=self.company, user=self.user, year=2026, month=10, updates=updates
        )
        self.assertEqual(res['status'], 'success')

        att_records = WorkforceAttendance.objects.filter(
            company=self.company, employee=self.guard, date=datetime.date(2026, 10, 6)
        )
        self.assertEqual(att_records.count(), 2)

        present_att = att_records.filter(status=AttendanceStatus.PRESENT).first()
        self.assertIsNotNone(present_att)
        self.assertEqual(present_att.site_id, self.site_a.id)

        ot_att = att_records.filter(status=AttendanceStatus.OVERTIME).first()
        self.assertIsNotNone(ot_att)
        self.assertEqual(ot_att.site_id, self.site_a.id)

    def test_standalone_overtime_displays_in_muster_grid(self):
        """
        Tests that when a guard has P at Site A and O at Site B on day 5:
        get_monthly_muster_grid returns 'O' for the cell at Site B.
        """
        updates = [
            {'site_id': str(self.site_a.id), 'employee_id': str(self.guard.id), 'day': 5, 'code': 'P'},
            {'site_id': str(self.site_b.id), 'employee_id': str(self.guard.id), 'day': 5, 'code': 'O'}
        ]
        res = MonthlyMusterService.save_monthly_muster_updates(
            company=self.company, user=self.user, year=2026, month=10, updates=updates
        )
        self.assertEqual(res['status'], 'success')

        grid_data = MonthlyMusterService.get_monthly_muster_grid(
            company=self.company, year=2026, month=10, site_id=self.site_b.id
        )
        site_b_block = next(s for s in grid_data['sites'] if s['site_id'] == str(self.site_b.id))
        guard_b_row = next(r for r in site_b_block['guards'] if r['employee_id'] == str(self.guard.id))
        self.assertEqual(guard_b_row['days'].get('5'), 'O')
        self.assertEqual(guard_b_row['total_ot'], 1)

    def test_pod_creates_dual_workforce_attendance_records(self):
        """
        Tests that marking 'POD' at Site A creates two WorkforceAttendance records:
        One PRESENT and one OVERTIME_DOZING, both linked to Site A.
        """
        updates = [
            {'site_id': str(self.site_a.id), 'employee_id': str(self.guard.id), 'day': 7, 'code': 'POD'}
        ]
        res = MonthlyMusterService.save_monthly_muster_updates(
            company=self.company, user=self.user, year=2026, month=10, updates=updates
        )
        self.assertEqual(res['status'], 'success')

        att_records = WorkforceAttendance.objects.filter(
            company=self.company, employee=self.guard, date=datetime.date(2026, 10, 7)
        )
        self.assertEqual(att_records.count(), 2)

        present_att = att_records.filter(status=AttendanceStatus.PRESENT).first()
        self.assertIsNotNone(present_att)
        self.assertEqual(present_att.site_id, self.site_a.id)

        od_att = att_records.filter(status=AttendanceStatus.OVERTIME_DOZING).first()
        self.assertIsNotNone(od_att)
        self.assertEqual(od_att.site_id, self.site_a.id)

    def test_standalone_overtime_dozing_displays_in_muster_grid(self):
        """
        Tests that when a guard has P at Site A and OD at Site B on day 8:
        get_monthly_muster_grid returns 'OD' for the cell at Site B and increments total_od.
        """
        updates = [
            {'site_id': str(self.site_a.id), 'employee_id': str(self.guard.id), 'day': 8, 'code': 'P'},
            {'site_id': str(self.site_b.id), 'employee_id': str(self.guard.id), 'day': 8, 'code': 'OD'}
        ]
        res = MonthlyMusterService.save_monthly_muster_updates(
            company=self.company, user=self.user, year=2026, month=10, updates=updates
        )
        self.assertEqual(res['status'], 'success')

        grid_data = MonthlyMusterService.get_monthly_muster_grid(
            company=self.company, year=2026, month=10, site_id=self.site_b.id
        )
        site_b_block = next(s for s in grid_data['sites'] if s['site_id'] == str(self.site_b.id))
        guard_b_row = next(r for r in site_b_block['guards'] if r['employee_id'] == str(self.guard.id))
        self.assertEqual(guard_b_row['days'].get('8'), 'OD')
        self.assertEqual(guard_b_row['total_od'], 1)



