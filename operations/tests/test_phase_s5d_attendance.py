import datetime
from django.test import TestCase
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError

from companies.models import Company
from platform_core.models import Branch
from crm.models import CRMEntity
from hrm.models import (
    Employee, Department, Designation,
    WorkforceAttendance, AttendanceStatus,
    EmployeeAttendanceState, JumpRecord, JumpRecordStatus,
    LeaveType, LeaveRequest, Holiday
)
from operations.models import (
    OperationalSite, SecurityPost, ServiceContract,
    Deployment, DeploymentAssignmentType, DeploymentStatus,
    DutyRoster, DutyRosterStatus, DutyReplacement
)
from operations.services.attendance_service import (
    get_or_create_default_state,
    resolve_effective_attendance_status,
    calculate_consecutive_absent_days,
    evaluate_jump_rule,
    restore_employee_from_jump,
    set_employee_daily_attendance,
    bulk_set_attendance,
    apply_leave_range,
    get_daily_attendance_workspace
)

User = get_user_model()


class PhaseS5DAttendanceTests(TestCase):
    def setUp(self):
        # Company A
        self.company = Company.objects.create(name="Alpha Security Ltd")
        self.branch = Branch.objects.create(company=self.company, name="Alpha Head Office")
        self.user = User.objects.create_user(username="ops_officer", email="ops@alpha.com", password="password123")
        self.user.company_id = self.company.id
        self.user.save()

        # Company B (for tenant isolation)
        self.company_b = Company.objects.create(name="Beta Security Corp")
        self.user_b = User.objects.create_user(username="beta_officer", email="ops@beta.com", password="password123")
        self.user_b.company_id = self.company_b.id
        self.user_b.save()

        # Designations
        self.dept = Department.objects.create(company=self.company, name="Security Operations")
        self.desig_guard = Designation.objects.create(company=self.company, name="Security Guard", code="SG")
        self.desig_mgr = Designation.objects.create(company=self.company, name="Office Manager", code="OM")

        # Employees
        self.guard = Employee.objects.create(
            company=self.company,
            first_name="Ahmed",
            last_name="Khan",
            employee_code="SEC-001",
            classification="DIRECT",
            designation=self.desig_guard,
            employment_status="ACTIVE"
        )
        self.office_staff = Employee.objects.create(
            company=self.company,
            first_name="Zainab",
            last_name="Ali",
            employee_code="OFF-001",
            classification="INDIRECT",
            designation=self.desig_mgr,
            employment_status="ACTIVE"
        )

        # Site and Post
        self.client = CRMEntity.objects.create(company=self.company, name="Standard Bank", entity_type="CUSTOMER")
        self.site = OperationalSite.objects.create(
            company=self.company,
            crm_entity=self.client,
            name="Bank HQ Branch",
            address="123 Bank Street"
        )
        self.contract = ServiceContract.objects.create(
            company=self.company,
            crm_entity=self.client,
            contract_code="SC-ALPHA-100",
            start_date=timezone.now().date(),
            end_date=timezone.now().date() + datetime.timedelta(days=365),
            status="ACTIVE"
        )
        self.contract.sites.add(self.site)
        self.post = SecurityPost.objects.create(
            company=self.company,
            site=self.site,
            service_contract=self.contract,
            post_name="Main Gate",
            post_code="MG-1",
            required_designation=self.desig_guard,
            required_headcount=2
        )

        from hrm.models import Shift
        self.shift = Shift.objects.create(
            company=self.company,
            name="Day Shift",
            code="DAY",
            start_time=datetime.time(8, 0),
            end_time=datetime.time(20, 0)
        )

    def test_persistent_present_default(self):
        """Test that PRESENT remains an employee's default state without pre-creating database rows."""
        target_date = timezone.now().date() + datetime.timedelta(days=15)
        status, att, is_mat = resolve_effective_attendance_status(self.guard, target_date)
        
        self.assertEqual(status, AttendanceStatus.PRESENT)
        self.assertIsNone(att)
        self.assertFalse(is_mat)
        # Ensure no WorkforceAttendance row was created in DB
        self.assertFalse(WorkforceAttendance.objects.filter(employee=self.guard, date=target_date).exists())

    def test_persistent_absent_state_toggle(self):
        """Test setting persistent state to ABSENT defaults subsequent dates to ABSENT until modified."""
        today = timezone.now().date()
        att, _ = set_employee_daily_attendance(
            company=self.company,
            employee_id=self.guard.id,
            date=today,
            status=AttendanceStatus.ABSENT,
            notes="Guard did not report",
            user=self.user,
            update_persistent_state=True
        )
        self.assertEqual(att.status, AttendanceStatus.ABSENT)
        self.assertTrue(att.is_finalized)

        # Check persistent state model
        state = EmployeeAttendanceState.objects.get(employee=self.guard)
        self.assertEqual(state.current_state, 'ABSENT')
        self.assertEqual(state.effective_from, today)

        # Future date should now resolve to ABSENT without an explicit row
        future_date = today + datetime.timedelta(days=2)
        status, _, is_mat = resolve_effective_attendance_status(self.guard, future_date)
        self.assertEqual(status, AttendanceStatus.ABSENT)
        self.assertFalse(is_mat)

        # Toggling back to PRESENT returns persistent state to PRESENT
        set_employee_daily_attendance(
            company=self.company,
            employee_id=self.guard.id,
            date=future_date,
            status=AttendanceStatus.PRESENT,
            user=self.user,
            update_persistent_state=True
        )
        state.refresh_from_db()
        self.assertEqual(state.current_state, 'PRESENT')
        self.assertEqual(state.effective_from, future_date)

    def test_scheduled_leave_overrides_persistent_state(self):
        """Test that date-range paid/unpaid leave overrides persistent state and materializes daily records."""
        today = timezone.now().date()
        # First set persistent absent
        set_employee_daily_attendance(
            company=self.company,
            employee_id=self.office_staff.id,
            date=today,
            status=AttendanceStatus.ABSENT,
            update_persistent_state=True
        )

        # Apply 3-day Paid Leave
        start_d = today + datetime.timedelta(days=1)
        end_d = today + datetime.timedelta(days=3)
        res = apply_leave_range(
            company=self.company,
            employee_id=self.office_staff.id,
            start_date=start_d,
            end_date=end_d,
            leave_type_str='PAID_LEAVE',
            reason="Medical recovery",
            user=self.user
        )
        self.assertEqual(res['days'], 3)
        self.assertTrue(res['is_paid'])

        # Check that days in range are materialized as PAID_LEAVE
        for i in range(1, 4):
            check_d = today + datetime.timedelta(days=i)
            status, att, is_mat = resolve_effective_attendance_status(self.office_staff, check_d)
            self.assertEqual(status, AttendanceStatus.PAID_LEAVE)
            self.assertTrue(is_mat)
            self.assertIsNotNone(att)

    def test_holiday_and_weekly_off_excluded_from_jump(self):
        """Test that HOLIDAY and WEEKLY_OFF are distinctly recorded and do not count toward JUMP."""
        today = timezone.now().date()
        # Mark 3 absent days
        for i in range(3):
            d = today - datetime.timedelta(days=(6 - i))
            set_employee_daily_attendance(self.company, self.guard.id, d, AttendanceStatus.ABSENT, user=self.user)

        # Day 4 is a company holiday
        holiday_date = today - datetime.timedelta(days=3)
        Holiday.objects.create(company=self.company, name="National Holiday", date=holiday_date, is_active=True)

        # Day 5 is Weekly Off
        off_date = today - datetime.timedelta(days=2)
        set_employee_daily_attendance(self.company, self.guard.id, off_date, AttendanceStatus.WEEKLY_OFF, user=self.user)

        # Day 6 and 7 are absent
        for i in range(2):
            d = today - datetime.timedelta(days=(1 - i))
            set_employee_daily_attendance(self.company, self.guard.id, d, AttendanceStatus.ABSENT, user=self.user)

        # Check consecutive absent count ending today: should only be 2 because Holiday and Weekly Off broke the streak!
        streak, _ = calculate_consecutive_absent_days(self.guard, today)
        self.assertEqual(streak, 2)
        self.assertEqual(self.guard.employment_status, 'ACTIVE')

    def test_half_day_status_preservation(self):
        """Test that HALF_DAY is distinctly recorded and breaks the JUMP streak."""
        today = timezone.now().date()
        att, _ = set_employee_daily_attendance(
            self.company,
            self.guard.id,
            today,
            AttendanceStatus.HALF_DAY,
            notes="Left early with approval",
            user=self.user
        )
        self.assertEqual(att.status, AttendanceStatus.HALF_DAY)
        
        streak, _ = calculate_consecutive_absent_days(self.guard, today)
        self.assertEqual(streak, 0)

    def test_jump_automation_after_7_consecutive_absent_days(self):
        """Test that 7 consecutive true ABSENT days automatically transitions employee to JUMP status."""
        today = timezone.now().date()
        streak_start = today - datetime.timedelta(days=6)

        # Mark 6 consecutive absent days
        for i in range(6):
            d = streak_start + datetime.timedelta(days=i)
            set_employee_daily_attendance(self.company, self.guard.id, d, AttendanceStatus.ABSENT, user=self.user)

        self.guard.refresh_from_db()
        self.assertEqual(self.guard.employment_status, 'ACTIVE')
        self.assertFalse(JumpRecord.objects.filter(employee=self.guard, status=JumpRecordStatus.ACTIVE_JUMP).exists())

        # Mark 7th consecutive absent day
        att, jump_res = set_employee_daily_attendance(self.company, self.guard.id, today, AttendanceStatus.ABSENT, user=self.user)

        self.guard.refresh_from_db()
        self.assertEqual(self.guard.employment_status, 'JUMP')
        self.assertTrue(jump_res['jump_triggered'])
        self.assertEqual(jump_res['streak'], 7)
        self.assertEqual(jump_res['absent_since'], streak_start)

        # Verify JumpRecord created
        jump_rec = JumpRecord.objects.get(employee=self.guard, status=JumpRecordStatus.ACTIVE_JUMP)
        self.assertEqual(jump_rec.consecutive_absent_days, 7)
        self.assertEqual(jump_rec.absent_since, streak_start)

    def test_return_from_jump_workflow_and_history_preservation(self):
        """Test restoring an employee from JUMP status back to ACTIVE while preserving all absence history."""
        today = timezone.now().date()
        # Put employee into JUMP
        for i in range(7):
            d = today - datetime.timedelta(days=(7 - i))
            set_employee_daily_attendance(self.company, self.guard.id, d, AttendanceStatus.ABSENT, user=self.user)

        self.guard.refresh_from_db()
        self.assertEqual(self.guard.employment_status, 'JUMP')

        # Restore from JUMP
        restore_date = today
        res = restore_employee_from_jump(
            company=self.company,
            employee_id=self.guard.id,
            user=self.user,
            restore_date=restore_date,
            notes="Guard reported with valid medical documentation"
        )
        self.guard.refresh_from_db()
        self.assertEqual(self.guard.employment_status, 'ACTIVE')

        # Check JUMP record marked as RESTORED
        jump_rec = JumpRecord.objects.get(employee=self.guard, status=JumpRecordStatus.RESTORED)
        self.assertEqual(jump_rec.reinstated_by, self.user)
        self.assertIn("valid medical documentation", jump_rec.reinstatement_notes)

        # Check that prior 7 absent records are intact
        absent_count = WorkforceAttendance.objects.filter(
            employee=self.guard,
            status=AttendanceStatus.ABSENT
        ).count()
        self.assertEqual(absent_count, 7)

        # Check restore day is marked PRESENT
        att = WorkforceAttendance.objects.get(employee=self.guard, date=restore_date)
        self.assertEqual(att.status, AttendanceStatus.PRESENT)
        self.assertEqual(att.source, 'JUMP_RESTORE')

    def test_direct_attendance_links_roster_and_replacement_coverage(self):
        """Test that attendance for DIRECT personnel auto-links planned roster duty and reflects replacement coverage."""
        today = timezone.now().date()
        # Create deployment and duty roster for guard
        dep = Deployment.objects.create(
            company=self.company,
            employee=self.guard,
            site=self.site,
            post=self.post,
            start_date=today,
            assignment_type=DeploymentAssignmentType.PERMANENT,
            status=DeploymentStatus.ACTIVE
        )
        roster = DutyRoster.objects.create(
            company=self.company,
            duty_date=today,
            shift=self.shift,
            site=self.site,
            post=self.post,
            employee=self.guard,
            deployment=dep,
            status=DutyRosterStatus.SCHEDULED
        )

        # Create relief guard and replacement
        relief_guard = Employee.objects.create(
            company=self.company,
            first_name="Bilal",
            last_name="Tariq",
            employee_code="SEC-002",
            classification="DIRECT",
            designation=self.desig_guard,
            employment_status="ACTIVE"
        )
        DutyReplacement.objects.create(
            company=self.company,
            original_roster=roster,
            original_employee=self.guard,
            replacement_employee=relief_guard,
            site=self.site,
            post=self.post,
            shift=self.shift,
            duty_date=today,
            reason="Original guard sick",
            status="ASSIGNED"
        )

        # Mark guard as ABSENT
        att, _ = set_employee_daily_attendance(
            company=self.company,
            employee_id=self.guard.id,
            date=today,
            status=AttendanceStatus.ABSENT,
            user=self.user
        )
        self.assertEqual(att.duty_roster, roster)
        self.assertEqual(att.site, self.site)
        self.assertEqual(att.post, self.post)

        # Check daily workspace query
        workspace = get_daily_attendance_workspace(self.company, today)
        guard_row = next((r for r in workspace['workforce'] if r['employee_id'] == str(self.guard.id)), None)
        self.assertIsNotNone(guard_row)
        self.assertTrue(guard_row['has_planned_duty'])
        self.assertEqual(guard_row['site_name'], "Bank HQ Branch")
        self.assertEqual(guard_row['post_name'], "Main Gate")
        self.assertTrue(guard_row['has_replacement_coverage'])
        self.assertEqual(guard_row['replacement_guard_name'], relief_guard.full_name)

    def test_tenant_isolation(self):
        """Test strict tenant isolation prevents accessing or updating attendance across companies."""
        today = timezone.now().date()
        # Attempt to set attendance for company A's employee using company B context
        with self.assertRaises(Employee.DoesNotExist):
            set_employee_daily_attendance(
                company=self.company_b,
                employee_id=self.guard.id,
                date=today,
                status=AttendanceStatus.PRESENT,
                user=self.user_b
            )

        # Attempt to apply leave for company A's employee in company B
        with self.assertRaises(Employee.DoesNotExist):
            apply_leave_range(
                company=self.company_b,
                employee_id=self.guard.id,
                start_date=today,
                end_date=today,
                user=self.user_b
            )
