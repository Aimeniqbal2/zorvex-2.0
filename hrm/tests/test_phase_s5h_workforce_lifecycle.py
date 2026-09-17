from datetime import date, timedelta
from decimal import Decimal
import json

from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework.test import APIClient

from companies.models import Company
from hrm.models import (
    Employee,
    EmploymentHistory,
    EmployeeSalaryAssignment,
    Designation,
    Department,
    SalaryStructure,
    JumpRecord,
    JumpRecordStatus,
    WorkforceAttendance,
    AttendanceStatus,
    Shift,
    PayrollRun,
    PayrollRunStatus,
    Payslip,
    PayslipStatus,
)
from hrm.services.lifecycle_service import LifecycleService, LifecycleEventType
from finance.models import Currency
from operations.models import (
    OperationalSite,
    SecurityPost,
    ServiceContract,
    Deployment,
    DeploymentStatus,
    DutyRoster,
    EmployeePayrollCalculation,
    DailyDutyPay,
)
from operations.services.payroll_run_service import PayrollRunService
from crm.models import CRMEntity

User = get_user_model()


class PhaseS5HWorkforceLifecycleTests(TestCase):
    def setUp(self):
        # 1. Company & Users
        self.company = Company.objects.create(
            name="Zorvex Security Corp",
            is_active=True
        )
        self.company_other = Company.objects.create(
            name="Other Enterprise Ltd",
            is_active=True
        )
        self.user = User.objects.create_superuser(
            username="ops_admin",
            email="ops@zorvex.test",
            password="password123",
            company=self.company
        )
        self.user_other = User.objects.create_superuser(
            username="other_admin",
            email="other@zorvex.test",
            password="password123",
            company=self.company_other
        )

        # 2. Currencies
        self.currency = Currency.objects.create(
            company=self.company,
            name="Pakistani Rupee",
            code="PKR",
            symbol="Rs",
            is_base_currency=True
        )

        # 3. Org Structure
        self.dept_operations = Department.objects.create(
            company=self.company,
            name="Operations & Guarding"
        )
        self.dept_admin = Department.objects.create(
            company=self.company,
            name="Administration"
        )
        self.dept_other = Department.objects.create(
            company=self.company_other,
            name="Operations Other"
        )

        self.desig_guard = Designation.objects.create(
            company=self.company,
            name="Security Guard",
            code="SG"
        )
        self.desig_senior = Designation.objects.create(
            company=self.company,
            name="Senior Guard",
            code="SSG"
        )
        self.desig_supervisor = Designation.objects.create(
            company=self.company,
            name="Field Supervisor",
            code="FS"
        )
        self.desig_other = Designation.objects.create(
            company=self.company_other,
            name="Other Guard",
            code="OG"
        )

        # 4. Employee Master
        self.employee = Employee.objects.create(
            company=self.company,
            first_name="Ahmed",
            last_name="Khan",
            employee_code="SG-001",
            cnic_number="35202-1234567-1",
            phone="03001234567",
            department=self.dept_operations,
            designation=self.desig_guard,
            classification="DIRECT",
            employment_status="ACTIVE",
            hire_date=date(2026, 1, 1),
            is_active=True
        )

        # Initial Salary Assignment
        self.salary_assignment = EmployeeSalaryAssignment.objects.create(
            company=self.company,
            employee=self.employee,
            currency=self.currency,
            base_salary=Decimal("30000.00"),
            daily_rate=Decimal("1000.00"),
            single_ot_rate=Decimal("150.00"),
            double_ot_rate=Decimal("300.00"),
            effective_from=date(2026, 1, 1),
            status="ACTIVE"
        )

        # 5. Operational Site & Deployment
        self.client_corp = CRMEntity.objects.create(
            company=self.company,
            name="Apex Commercial Plaza",
            entity_type="CUSTOMER"
        )
        self.site_a = OperationalSite.objects.create(
            company=self.company,
            crm_entity=self.client_corp,
            name="Apex Tower Alpha",
            address="Karachi",
            is_active=True
        )
        self.site_b = OperationalSite.objects.create(
            company=self.company,
            crm_entity=self.client_corp,
            name="Apex Distribution Hub",
            address="Karachi",
            is_active=True
        )
        self.contract_a = ServiceContract.objects.create(
            company=self.company,
            crm_entity=self.client_corp,
            contract_code="SC-2026-001",
            start_date=date(2026, 1, 1),
            status="ACTIVE"
        )
        self.contract_a.sites.add(self.site_a, self.site_b)

        self.post_gate = SecurityPost.objects.create(
            company=self.company,
            site=self.site_a,
            service_contract=self.contract_a,
            post_name="Main Gate Post",
            required_designation=self.desig_guard
        )

        # Active Deployment
        self.deployment_a = Deployment.objects.create(
            company=self.company,
            employee=self.employee,
            site=self.site_a,
            post=self.post_gate,
            service_contract=self.contract_a,
            designation=self.desig_guard,
            start_date=date(2026, 1, 1),
            status=DeploymentStatus.ACTIVE,
            assigned_by=self.user
        )

        # API Client
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_01_promotion_preserves_previous_designation(self):
        """
        Promotion updates designation and records old designation in EmploymentHistory.
        """
        history = LifecycleService.promote_or_change_designation(
            employee=self.employee,
            new_designation=self.desig_senior,
            effective_date=date(2026, 6, 1),
            reason="Outstanding performance & punctuality",
            approved_by=self.user,
            user=self.user,
            is_promotion=True
        )

        self.employee.refresh_from_db()
        self.assertEqual(self.employee.designation, self.desig_senior)
        self.assertEqual(history.event_type, LifecycleEventType.PROMOTION)
        self.assertEqual(history.old_value, "Security Guard")
        self.assertEqual(history.new_value, "Senior Guard")
        self.assertEqual(history.reason, "Outstanding performance & punctuality")
        self.assertEqual(history.approved_by, self.user)

        # API endpoint verification
        res = self.client.post(
            f"/api/hrm/employees/{self.employee.id}/promote/",
            {
                "new_designation": str(self.desig_supervisor.id),
                "effective_date": "2026-07-01",
                "reason": "Promotion to supervisor",
                "is_promotion": True,
            },
            format="json"
        )
        self.assertEqual(res.status_code, 200)
        self.employee.refresh_from_db()
        self.assertEqual(self.employee.designation, self.desig_supervisor)

    def test_02_salary_revision_creates_new_effective_compensation(self):
        """
        Salary revision sets effective_to on existing assignment and provisions a new assignment.
        Historical assignment is never mutated in-place.
        """
        rev_date = date(2026, 6, 1)
        new_assign, history = LifecycleService.revise_salary(
            employee=self.employee,
            base_salary=Decimal("38000.00"),
            effective_date=rev_date,
            daily_rate=Decimal("1266.67"),
            single_ot_rate=Decimal("180.00"),
            double_ot_rate=Decimal("360.00"),
            reason="Annual merit increment",
            approved_by=self.user,
            user=self.user
        )

        # Check old assignment capped
        self.salary_assignment.refresh_from_db()
        self.assertEqual(self.salary_assignment.effective_to, rev_date - timedelta(days=1))
        self.assertEqual(self.salary_assignment.base_salary, Decimal("30000.00"))

        # Check new assignment active
        self.assertEqual(new_assign.base_salary, Decimal("38000.00"))
        self.assertEqual(new_assign.effective_from, rev_date)
        self.assertIsNone(new_assign.effective_to)
        self.assertEqual(new_assign.status, "ACTIVE")

        # Check history record
        self.assertEqual(history.event_type, LifecycleEventType.SALARY_REVISION)
        old_comp = json.loads(history.old_value)
        self.assertEqual(Decimal(old_comp['base_salary']), Decimal("30000.00"))
        new_comp = json.loads(history.new_value)
        self.assertEqual(Decimal(new_comp['base_salary']), Decimal("38000.00"))

    def test_03_transfer_uses_existing_deployment_workflow(self):
        """
        Transfer relieves old deployment and creates new active deployment at destination site.
        """
        trans_date = date(2026, 5, 15)
        new_dep, history = LifecycleService.transfer_deployment(
            employee=self.employee,
            new_site=self.site_b,
            start_date=trans_date,
            relief_reason="Client requested guard rotation",
            approved_by=self.user,
            user=self.user
        )

        self.deployment_a.refresh_from_db()
        self.assertEqual(self.deployment_a.status, DeploymentStatus.RELIEVED)
        self.assertEqual(self.deployment_a.relieved_date, trans_date)
        self.assertIn("rotation", self.deployment_a.relief_reason)

        self.assertEqual(new_dep.status, DeploymentStatus.ACTIVE)
        self.assertEqual(new_dep.site, self.site_b)
        self.assertEqual(new_dep.start_date, trans_date)

        self.assertEqual(history.event_type, LifecycleEventType.TRANSFER)
        self.assertEqual(history.old_value, "Site: Apex Tower Alpha")
        self.assertEqual(history.new_value, "Site: Apex Distribution Hub")

    def test_04_suspension_blocks_normal_active_assignment(self):
        """
        Suspending an employee sets status to SUSPENDED.
        Attempting to assign active deployment or duty roster raises validation error.
        """
        history = LifecycleService.suspend_employee(
            employee=self.employee,
            effective_date=date(2026, 6, 10),
            reason="Pending investigation for disciplinary violation",
            approved_by=self.user,
            user=self.user
        )

        self.employee.refresh_from_db()
        self.assertEqual(self.employee.employment_status, "SUSPENDED")
        self.assertEqual(history.event_type, LifecycleEventType.SUSPENSION)

        # Attempt to create active deployment while suspended must fail
        with self.assertRaises(ValidationError) as ctx:
            dep_fail = Deployment(
                company=self.company,
                employee=self.employee,
                site=self.site_b,
                service_contract=self.contract_a,
                start_date=date(2026, 6, 11),
                status=DeploymentStatus.ACTIVE
            )
            dep_fail.clean()
        self.assertIn("Only ACTIVE employees can receive an ACTIVE deployment", str(ctx.exception))

        # Attempt to assign in DutyRoster while suspended must fail
        from datetime import time
        shift = Shift.objects.create(
            company=self.company,
            name="Day Shift 0800-2000",
            code="DS-12",
            start_time=time(8, 0),
            end_time=time(20, 0)
        )
        with self.assertRaises(ValidationError) as ctx_roster:
            roster_fail = DutyRoster(
                company=self.company,
                employee=self.employee,
                site=self.site_b,
                shift=shift,
                duty_date=date(2026, 6, 11)
            )
            roster_fail.clean()
        self.assertIn("Only ACTIVE employees can be assigned to duty roster", str(ctx_roster.exception))

        # Reinstatement back to active duty
        reinstate_hist = LifecycleService.reinstate_employee(
            employee=self.employee,
            effective_date=date(2026, 6, 15),
            reason="Exonerated after formal inquiry",
            approved_by=self.user,
            user=self.user
        )
        self.employee.refresh_from_db()
        self.assertEqual(self.employee.employment_status, "ACTIVE")
        self.assertEqual(reinstate_hist.event_type, LifecycleEventType.REINSTATEMENT)

    def test_05_resignation_closes_active_deployment_and_preserves_history(self):
        """
        Resignation closes active deployment, sets employment_status to RESIGNED,
        marks is_active=False, and preserves complete employee history without deleting.
        """
        res_date = date(2026, 7, 31)
        lwd = date(2026, 7, 31)

        history = LifecycleService.resign_employee(
            employee=self.employee,
            resignation_date=res_date,
            last_working_date=lwd,
            reason="Personal relocation to home town",
            notice_details="1 month written notice served",
            approved_by=self.user,
            user=self.user
        )

        self.employee.refresh_from_db()
        self.assertEqual(self.employee.employment_status, "RESIGNED")
        self.assertFalse(self.employee.is_active)
        self.assertEqual(self.employee.resignation_date, res_date)
        self.assertEqual(self.employee.last_working_date, lwd)

        # Active deployment must be closed/relieved
        self.deployment_a.refresh_from_db()
        self.assertEqual(self.deployment_a.status, DeploymentStatus.RELIEVED)
        self.assertEqual(self.deployment_a.relieved_date, lwd)
        self.assertIn("Resigned", self.deployment_a.relief_reason)

        # History preserved
        self.assertEqual(history.event_type, LifecycleEventType.RESIGNATION)
        self.assertEqual(history.old_value, "ACTIVE")
        self.assertEqual(history.new_value, "RESIGNED")
        self.assertTrue(Employee.objects.filter(pk=self.employee.pk).exists())

    def test_06_termination_preserves_history(self):
        """
        Controlled termination closes active deployment, sets TERMINATED, and preserves audit trail.
        """
        term_date = date(2026, 8, 1)
        history = LifecycleService.terminate_employee(
            employee=self.employee,
            effective_date=term_date,
            reason="Serious breach of security protocols",
            category="MISCONDUCT",
            authorized_by=self.user,
            user=self.user
        )

        self.employee.refresh_from_db()
        self.assertEqual(self.employee.employment_status, "TERMINATED")
        self.assertFalse(self.employee.is_active)
        self.assertEqual(self.employee.termination_date, term_date)

        self.deployment_a.refresh_from_db()
        self.assertEqual(self.deployment_a.status, DeploymentStatus.RELIEVED)
        self.assertEqual(history.event_type, LifecycleEventType.TERMINATION)

    def test_07_jump_resolved_without_automatic_termination(self):
        """
        JUMP alert itself never automatically forces termination.
        HR explicitly resolves JumpRecord as RETURNED/REINSTATED, RESIGNED, or TERMINATED.
        """
        # Place employee in JUMP status with JumpRecord
        self.employee.employment_status = "JUMP"
        self.employee.save(update_fields=['employment_status'])

        jump_rec = JumpRecord.objects.create(
            company=self.company,
            employee=self.employee,
            absent_since=date(2026, 5, 1),
            consecutive_absent_days=7,
            reason="7 days unexcused absence",
            status=JumpRecordStatus.ACTIVE_JUMP
        )

        # 1. Resolve as RETURNED / REINSTATED
        j_rec, hist = LifecycleService.resolve_jump(
            employee=self.employee,
            outcome="REINSTATED",
            jump_record_id=jump_rec.id,
            reason="Guard provided medical hospitalization certificate",
            approved_by=self.user,
            user=self.user
        )

        self.employee.refresh_from_db()
        self.assertEqual(self.employee.employment_status, "ACTIVE")
        j_rec.refresh_from_db()
        self.assertEqual(j_rec.status, JumpRecordStatus.RESTORED)
        self.assertEqual(hist.event_type, LifecycleEventType.JUMP_OUTCOME)
        self.assertEqual(hist.new_value, "REINSTATED")

        # 2. Test another jump resolved as RESIGNED
        self.employee.employment_status = "JUMP"
        self.employee.save(update_fields=['employment_status'])
        jump_rec2 = JumpRecord.objects.create(
            company=self.company,
            employee=self.employee,
            absent_since=date(2026, 6, 1),
            consecutive_absent_days=7,
            status=JumpRecordStatus.ACTIVE_JUMP
        )

        j_rec2, hist2 = LifecycleService.resolve_jump(
            employee=self.employee,
            outcome="RESIGNED",
            jump_record_id=jump_rec2.id,
            reason="Guard confirmed resignation over phone",
            approved_by=self.user,
            user=self.user
        )
        self.employee.refresh_from_db()
        self.assertEqual(self.employee.employment_status, "RESIGNED")
        j_rec2.refresh_from_db()
        self.assertEqual(j_rec2.status, JumpRecordStatus.RESIGNED)

    def test_08_rehire_reuses_same_employee_master(self):
        """
        Rehiring a separated employee reactivates the SAME employee record
        without creating duplicate employee master records.
        """
        # Separate employee
        LifecycleService.resign_employee(
            employee=self.employee,
            resignation_date=date(2026, 7, 1),
            reason="Resigned",
            approved_by=self.user,
            user=self.user
        )
        original_pk = self.employee.pk
        total_employees_before = Employee.objects.filter(company=self.company).count()

        # Rehire employee into new position and compensation
        rehire_date = date(2026, 9, 1)
        emp, new_assign, history = LifecycleService.rehire_employee(
            employee=self.employee,
            rehire_date=rehire_date,
            designation=self.desig_senior,
            department=self.dept_operations,
            classification="DIRECT",
            base_salary=Decimal("42000.00"),
            approved_by=self.user,
            user=self.user,
            notes="Rehired as Senior Guard after previous good standing resignation"
        )

        total_employees_after = Employee.objects.filter(company=self.company).count()
        self.assertEqual(total_employees_before, total_employees_after, "Rehire must not create duplicate Employee record")
        self.assertEqual(emp.pk, original_pk)
        self.assertEqual(emp.employment_status, "ACTIVE")
        self.assertTrue(emp.is_active)
        self.assertEqual(emp.rehire_date, rehire_date)
        self.assertEqual(emp.designation, self.desig_senior)

        self.assertIsNotNone(new_assign)
        self.assertEqual(new_assign.base_salary, Decimal("42000.00"))
        self.assertEqual(history.event_type, LifecycleEventType.REHIRE)

    def test_09_historical_finalized_payroll_unaffected_by_later_salary_changes(self):
        """
        Finalized historical payroll runs & payslips are immutable and frozen.
        Subsequent salary revisions do not alter historical finalized pay.
        """
        # 1. Create a finalized PayrollRun and Payslip for Jan 2026
        run = PayrollRun.objects.create(
            company=self.company,
            period_start=date(2026, 1, 1),
            period_end=date(2026, 1, 31),
            status=PayrollRunStatus.FINALIZED,
            gross_earnings=Decimal("30000.00"),
            net_payroll=Decimal("30000.00"),
            finalized_by=self.user,
            finalized_at=timezone.now()
        )
        ps = Payslip.objects.create(
            company=self.company,
            payroll_run=run,
            employee=self.employee,
            salary_assignment=self.salary_assignment,
            payslip_number="PS-202601-001",
            status=PayslipStatus.FINALIZED,
            is_frozen=True,
            gross_amount=Decimal("30000.00"),
            net_amount=Decimal("30000.00"),
            period_start=date(2026, 1, 1),
            period_end=date(2026, 1, 31),
            rate_snapshot={'base_salary': '30000.00'}
        )

        # 2. Later salary revision in March 2026 to 90,000
        LifecycleService.revise_salary(
            employee=self.employee,
            base_salary=Decimal("90000.00"),
            effective_date=date(2026, 3, 1),
            reason="Massive raise in March",
            approved_by=self.user,
            user=self.user
        )

        # 3. Verify Jan 2026 payroll run and payslip remain 100% frozen and unchanged
        ps.refresh_from_db()
        run.refresh_from_db()
        self.assertTrue(ps.is_frozen)
        self.assertEqual(ps.status, PayslipStatus.FINALIZED)
        self.assertEqual(ps.gross_amount, Decimal("30000.00"))
        self.assertEqual(ps.net_amount, Decimal("30000.00"))
        self.assertEqual(ps.rate_snapshot.get('base_salary'), '30000.00')
        self.assertEqual(run.gross_earnings, Decimal("30000.00"))
        self.assertEqual(run.net_payroll, Decimal("30000.00"))

        # 4. Attempting to revert finalized payroll or payslip is blocked
        with self.assertRaises(ValidationError):
            ps.status = PayslipStatus.DRAFT
            ps.clean()

        with self.assertRaises(ValidationError):
            run.status = PayrollRunStatus.CALCULATED
            run.clean()

    def test_10_tenant_isolation(self):
        """
        Ensures cross-tenant operations are strictly blocked.
        """
        # Attempting to assign cross-tenant designation raises validation error
        with self.assertRaises(ValidationError):
            LifecycleService.promote_or_change_designation(
                employee=self.employee,
                new_designation=self.desig_other,
                effective_date=date.today(),
                approved_by=self.user
            )

        # Attempting to assign cross-tenant department raises validation error
        with self.assertRaises(ValidationError):
            LifecycleService.change_department(
                employee=self.employee,
                new_department=self.dept_other,
                effective_date=date.today(),
                approved_by=self.user
            )

        # API isolation: user_other cannot access employee of company
        self.client.force_authenticate(user=self.user_other)
        res = self.client.get(f"/api/hrm/employees/{self.employee.id}/timeline/")
        self.assertEqual(res.status_code, 404)

    def test_11_unified_timeline(self):
        """
        Unified timeline combines EmploymentHistory, Deployments, and JumpRecords
        into a single sorted chronological view.
        """
        # Trigger some events
        LifecycleService.promote_or_change_designation(
            employee=self.employee,
            new_designation=self.desig_senior,
            effective_date=date(2026, 2, 1),
            reason="Mid-year review promotion",
            approved_by=self.user,
            user=self.user
        )
        LifecycleService.revise_salary(
            employee=self.employee,
            base_salary=Decimal("35000.00"),
            effective_date=date(2026, 2, 1),
            reason="Salary bump",
            approved_by=self.user,
            user=self.user
        )

        timeline = LifecycleService.get_unified_timeline(self.employee)
        self.assertGreaterEqual(len(timeline), 3)

        # API endpoint check
        res = self.client.get(f"/api/hrm/employees/{self.employee.id}/timeline/")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIsInstance(data, list)
        self.assertGreaterEqual(len(data), 3)
        event_types = [item['event_type'] for item in data]
        self.assertIn('PROMOTION', event_types)
        self.assertIn('SALARY_REVISION', event_types)
        self.assertIn('DEPLOYMENT_START', event_types)
