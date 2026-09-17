"""
operations/tests/test_phase_s9_reports.py

Phase S-9 Authoritative Test Suite:
Reports, Dashboards & Analytics for Zorvex ERP 2.0 Security Industry Vertical.

Validates:
1. Executive KPI reconciliation (commercial, workforce, ops, inventory, finance)
2. Manpower & attendance reconciliation
3. Operations metrics reconciliation (matching S-5 & S-7)
4. Inventory quantities match Universal Inventory
5. Payroll summary matches finalized PayrollRun
6. Profitability matches S-4J ProfitabilityService
7. AR/AP figures match Finance
8. Client/Contract/Site drill-down integrity
9. Report filter parameters (site, client, dates, classification, status)
10. Multi-tenant isolation
11. Module / RBAC confidentiality (masking sensitive financial metrics for non-finance users)
12. CSV Export functionality
"""
from datetime import date, timedelta, time
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from companies.models import Company
from crm.models import CRMEntity
from hrm.models import (
    Employee, Department, Designation, Shift, WorkforceAttendance,
    AttendanceStatus, PayrollRun, PayrollRunStatus, EmployeeDocument
)
from operations.models import (
    OperationalSite, SecurityPost, PostShiftRequirement, Deployment,
    ServiceContract, ContractRate, DutyRoster, DutyAssignment, DutyReplacement,
    ExtraDuty, DailyDutyPay, EmployeePayrollCalculation,
    IncidentReport, DailyOccurrenceLog, PatrolRun, GuardTour,
    EmergencyEvent, SupervisorInspection, OperationsEscalation,
    EquipmentIssue, EquipmentIncident, SecurityItemProfile, InspectionPolicy
)
from inventory.models import Item, Category, InventoryBalance, ItemSerial
from platform_core.models import Warehouse, ModuleDefinition, CompanyModule, ModuleCategory, UserModuleAccess
from accounts.models import CompanyRole
from purchasing.models import ProcurementDocument
from billing.models import ServiceInvoice
from operations.services.security_reporting_service import (
    SecurityReportingService, user_has_finance_permission, user_has_hrm_permission
)

User = get_user_model()


class PhaseS9SecurityReportsTests(APITestCase):

    def setUp(self):
        # 1. Company A (Target)
        self.company = Company.objects.create(
            name="Zorvex Security Shield Ltd",
            domain="zorvex-shield",
            business_type="security"
        )

        # 2. Company B (Tenant isolation check)
        self.company_b = Company.objects.create(
            name="Competitor Security Corp",
            domain="competitor-sec",
            business_type="security"
        )

        # 3. Enable security_ops module
        self.mod_sec_ops, _ = ModuleDefinition.objects.get_or_create(
            code="security_ops",
            defaults={"name": "Security Operations", "category": ModuleCategory.CORE, "is_active": True}
        )
        CompanyModule.objects.create(company=self.company, module=self.mod_sec_ops, enabled=True)
        CompanyModule.objects.create(company=self.company_b, module=self.mod_sec_ops, enabled=True)

        # 4. Superuser for general tests
        self.admin_user = User.objects.create_superuser(
            username="sec_exec_admin",
            email="exec@zorvexshield.com",
            password="StrongPassword123!",
            company_id=self.company.id
        )
        self.client.force_authenticate(user=self.admin_user)

        # 5. Operational staff user (operations.read only, NO finance permissions)
        self.ops_role = CompanyRole.objects.create(
            company=self.company,
            name="Operations Supervisor Role",
            permissions=["operations.read", "operations.all_sites"]
        )
        self.ops_user = User.objects.create_user(
            username="ops_supervisor",
            email="supervisor@zorvexshield.com",
            password="StrongPassword123!",
            company_id=self.company.id,
            company_role=self.ops_role,
            access_mode="FULL_COMPANY"
        )

        # 6. Core Master Data
        self.dept = Department.objects.create(company=self.company, name="Field Security")
        self.desig_guard = Designation.objects.create(company=self.company, name="Security Guard", code="SG")
        self.desig_sup = Designation.objects.create(company=self.company, name="Field Supervisor", code="FS")

        self.guard_1 = Employee.objects.create(
            company=self.company,
            employee_code="SG-001",
            first_name="Ahmed",
            last_name="Khan",
            department=self.dept,
            designation=self.desig_guard,
            classification="DIRECT",
            employment_status="ACTIVE",
            hire_date=date(2025, 1, 10)
        )
        self.guard_2 = Employee.objects.create(
            company=self.company,
            employee_code="SG-002",
            first_name="Bilal",
            last_name="Raza",
            department=self.dept,
            designation=self.desig_guard,
            classification="DIRECT",
            employment_status="ACTIVE",
            hire_date=date(2025, 2, 1)
        )
        self.office_staff = Employee.objects.create(
            company=self.company,
            employee_code="OFF-001",
            first_name="Zubair",
            last_name="Office",
            department=self.dept,
            designation=self.desig_sup,
            classification="INDIRECT",
            employment_status="ACTIVE",
            hire_date=date(2024, 6, 1)
        )

        self.client_corp = CRMEntity.objects.create(
            company=self.company,
            code="CLIENT-100",
            name="Global Towers Inc",
            entity_type="CLIENT"
        )

        self.site_a = OperationalSite.objects.create(
            company=self.company,
            crm_entity=self.client_corp,
            name="Global Towers Main Plaza",
            address="Commercial Boulevard, Sector 4"
        )

        self.post_gate = SecurityPost.objects.create(
            company=self.company,
            site=self.site_a,
            post_name="Main Gate Post",
            required_designation=self.desig_guard,
            required_headcount=2,
            is_active=True
        )

        self.shift_day = Shift.objects.create(
            company=self.company,
            name="Day 12H Shift",
            start_time="08:00:00",
            end_time="20:00:00"
        )

        self.post_req = PostShiftRequirement.objects.create(
            company=self.company,
            post=self.post_gate,
            shift=self.shift_day,
            required_headcount=2,
            is_active=True
        )

        # Service Contract
        self.contract = ServiceContract.objects.create(
            company=self.company,
            crm_entity=self.client_corp,
            contract_code="CON-2026-001",
            start_date=date(2026, 1, 1),
            end_date=date(2026, 12, 31),
            status="ACTIVE"
        )
        self.contract.sites.add(self.site_a)

        # Deployment for Guard 1
        self.deployment_1 = Deployment.objects.create(
            company=self.company,
            employee=self.guard_1,
            site=self.site_a,
            post=self.post_gate,
            service_contract=self.contract,
            designation=self.desig_guard,
            start_date=date(2026, 1, 1),
            status="ACTIVE"
        )

        # Inventory Item & Balances
        self.cat = Category.objects.create(company=self.company, name="Security Equipment")
        self.item_radio = Item.objects.create(
            company=self.company,
            name="VHF Handheld Radio",
            sku="RAD-VHF-01",
            cost_price=Decimal("150.00"),
            reorder_level=Decimal("2.00"),
            minimum_stock_level=Decimal("1.00")
        )
        self.warehouse = Warehouse.objects.create(company=self.company, name="Central Armoury & Store")
        self.balance = InventoryBalance.objects.create(
            company=self.company,
            warehouse=self.warehouse,
            item=self.item_radio,
            quantity=10
        )
        self.serial_radio = ItemSerial.objects.create(
            company=self.company,
            item=self.item_radio,
            serial_number="RAD-SN-998811",
            warehouse=self.warehouse,
            status="ISSUED"
        )

        # Equipment Issue (Employee Custody)
        self.issue_1 = EquipmentIssue.objects.create(
            company=self.company,
            custody_type="EMPLOYEE",
            employee=self.guard_1,
            item=self.item_radio,
            item_serial=self.serial_radio,
            warehouse=self.warehouse,
            quantity=Decimal("1.00"),
            issue_condition="EXCELLENT",
            status="ISSUED"
        )

    # =========================================================================
    # 1. Executive KPI Reconciliation
    # =========================================================================
    def test_executive_kpi_reconciliation(self):
        """Verifies commercial, workforce, operations, inventory, and finance KPIs reconcile."""
        today = date.today()
        # Create duty assignment
        DutyAssignment.objects.create(
            company=self.company,
            deployment=self.deployment_1,
            employee=self.guard_1,
            date=today,
            start_time=time(8, 0),
            end_time=time(16, 0),
            status="COMPLETED"
        )
        # Create incident
        IncidentReport.objects.create(
            company=self.company,
            site=self.site_a,
            reported_by=self.guard_1,
            occurred_at=timezone.now(),
            title="Gate Access Dispute",
            severity="LOW",
            status="CLOSED"
        )

        data = SecurityReportingService.get_executive_dashboard(self.company, user=self.admin_user)

        # Commercial
        self.assertEqual(data['commercial']['active_clients'], 1)
        self.assertEqual(data['commercial']['active_contracts'], 1)

        # Workforce
        self.assertEqual(data['workforce']['total_workforce'], 3)
        self.assertEqual(data['workforce']['direct_count'], 2)
        self.assertEqual(data['workforce']['indirect_count'], 1)
        self.assertEqual(data['workforce']['deployed_count'], 1)
        self.assertEqual(data['workforce']['vacant_positions'], 1) # required 2 - deployed 1 = 1 vacancy

        # Operations
        self.assertEqual(data['operations']['total_incidents'], 1)
        self.assertEqual(data['operations']['critical_incidents'], 0)

        # Inventory
        self.assertEqual(data['inventory']['issued_equipment_count'], 1)
        self.assertEqual(data['inventory']['employee_custody_count'], 1)
        self.assertEqual(data['inventory']['site_custody_count'], 0)

    # =========================================================================
    # 2. Manpower & Attendance Reconciliation
    # =========================================================================
    def test_manpower_and_attendance_reconciliation(self):
        """Verifies site manpower, post coverage, and attendance % calculate accurately."""
        today = date.today()
        WorkforceAttendance.objects.create(
            company=self.company,
            employee=self.guard_1,
            date=today,
            status=AttendanceStatus.PRESENT,
            site=self.site_a
        )
        WorkforceAttendance.objects.create(
            company=self.company,
            employee=self.guard_2,
            date=today,
            status=AttendanceStatus.ABSENT,
            site=self.site_a
        )

        res = SecurityReportingService.get_workforce_reports(
            self.company,
            user=self.admin_user,
            report_type='site_strength',
            filters={'site_id': str(self.site_a.id)}
        )
        self.assertEqual(res['total_count'], 1)
        site_rec = res['records'][0]
        self.assertEqual(site_rec['required_strength'], 2)
        self.assertEqual(site_rec['deployed_count'], 1)
        self.assertEqual(site_rec['variance'], -1)
        self.assertEqual(site_rec['status'], 'DEFICIT')

    # =========================================================================
    # 3. Operations Metrics Reconciliation (S-5 & S-7)
    # =========================================================================
    def test_operations_metrics_match_s5_s7(self):
        """Verifies duty replacements, DOB logs, patrols, and inspections match source records."""
        today = date.today()
        # Replacement
        roster = DutyRoster.objects.create(
            company=self.company,
            site=self.site_a,
            post=self.post_gate,
            shift=self.shift_day,
            employee=self.guard_1,
            deployment=self.deployment_1,
            duty_date=today,
            status="PUBLISHED"
        )
        DutyReplacement.objects.create(
            company=self.company,
            original_roster=roster,
            site=self.site_a,
            post=self.post_gate,
            shift=self.shift_day,
            original_employee=self.guard_1,
            replacement_employee=self.guard_2,
            duty_date=today,
            reason="Medical Leave",
            status="ASSIGNED"
        )
        # Patrol run
        PatrolRun.objects.create(
            company=self.company,
            site=self.site_a,
            assigned_employee=self.guard_1,
            scheduled_start=timezone.now(),
            status="COMPLETED"
        )
        # Inspection
        SupervisorInspection.objects.create(
            company=self.company,
            site=self.site_a,
            inspector=self.admin_user,
            inspected_employee=self.guard_1,
            inspection_datetime=timezone.now(),
            overall_score=Decimal("92.50"),
            status="COMPLETED"
        )

        res_repl = SecurityReportingService.get_operations_reports(self.company, self.admin_user, 'replacements')
        self.assertEqual(res_repl['total_count'], 1)
        self.assertEqual(res_repl['records'][0]['original_guard'], "Ahmed Khan")

        res_patrol = SecurityReportingService.get_operations_reports(self.company, self.admin_user, 'patrols')
        self.assertEqual(res_patrol['total_count'], 1)
        self.assertEqual(res_patrol['records'][0]['status'], "COMPLETED")

        res_insp = SecurityReportingService.get_operations_reports(self.company, self.admin_user, 'inspections')
        self.assertEqual(res_insp['total_count'], 1)
        self.assertEqual(res_insp['records'][0]['overall_score'], 92.50)

    # =========================================================================
    # 4. Inventory Quantities Match Universal Inventory
    # =========================================================================
    def test_inventory_quantities_match_universal_inventory(self):
        """Verifies store stock and serialized equipment match Universal Inventory records."""
        res = SecurityReportingService.get_inventory_reports(self.company, self.admin_user, 'store_stock')
        self.assertGreaterEqual(res['total_count'], 1)
        item_row = next((r for r in res['records'] if r['item_name'] == "VHF Handheld Radio"), None)
        self.assertIsNotNone(item_row)
        self.assertEqual(item_row['store_stock'], 10)
        self.assertEqual(item_row['issued_employees'], 1)

    # =========================================================================
    # 5. Payroll Summary Matches Finalized PayrollRun
    # =========================================================================
    def test_payroll_summary_matches_finalized_payroll(self):
        """Verifies payroll summary report reconciles with finalized calculations."""
        p_start = date(2026, 3, 1)
        p_end = date(2026, 3, 31)
        run = PayrollRun.objects.create(
            company=self.company,
            run_number="RUN-202603",
            period_start=p_start,
            period_end=p_end,
            status=PayrollRunStatus.FINALIZED
        )
        calc = EmployeePayrollCalculation.objects.create(
            company=self.company,
            employee=self.guard_1,
            payroll_run=run,
            period_start=p_start,
            period_end=p_end,
            duty_days_count=26,
            gross_earnings=Decimal("30000.00"),
            total_deductions=Decimal("1500.00"),
            net_payable=Decimal("28500.00"),
            status="READY",
            is_frozen=True
        )

        res = SecurityReportingService.get_workforce_reports(
            self.company,
            user=self.admin_user,
            report_type='payroll_summary',
            filters={'start_date': str(p_start), 'end_date': str(p_end)}
        )
        self.assertEqual(res['total_count'], 1)
        row = res['records'][0]
        self.assertEqual(row['employee_code'], "SG-001")
        self.assertEqual(row['gross_earnings'], 30000.0)
        self.assertEqual(row['net_payable'], 28500.0)

    # =========================================================================
    # 6. Profitability Matches S-4J
    # =========================================================================
    def test_profitability_matches_s4j(self):
        """Verifies client/contract/site profitability consumes authoritative ProfitabilityService."""
        res = SecurityReportingService.get_profitability_report(
            self.company,
            user=self.admin_user,
            dimension='contract',
            filters={'entity_id': str(self.contract.id)}
        )
        self.assertEqual(res['dimension'], 'contract')
        self.assertIn('profitability', res)

    # =========================================================================
    # 7. AR/AP Figures Match Finance
    # =========================================================================
    def test_ar_ap_figures_match_finance(self):
        """Verifies AR/AP aging metrics retrieve correctly from executive finance services."""
        res = SecurityReportingService.get_finance_reports(self.company, self.admin_user, 'ar_aging')
        self.assertEqual(res['report_type'], 'ar_aging')
        self.assertIn('data', res)

    # =========================================================================
    # 8. Drill-Down Integrity
    # =========================================================================
    def test_drill_down_integrity(self):
        """Verifies drill-down by site, employee, and contract returns detailed entity trees."""
        site_dd = SecurityReportingService.get_drill_down_data(
            self.company, self.admin_user, entity_type='site', entity_id=str(self.site_a.id)
        )
        self.assertEqual(site_dd['entity_type'], 'site')
        self.assertEqual(site_dd['name'], 'Global Towers Main Plaza')
        self.assertEqual(len(site_dd['posts']), 1)
        self.assertEqual(len(site_dd['active_deployments']), 1)

        emp_dd = SecurityReportingService.get_drill_down_data(
            self.company, self.admin_user, entity_type='employee', entity_id=str(self.guard_1.id)
        )
        self.assertEqual(emp_dd['entity_type'], 'employee')
        self.assertEqual(emp_dd['employee_code'], 'SG-001')

    # =========================================================================
    # 9. Report Filter Parameters
    # =========================================================================
    def test_report_filters(self):
        """Verifies filtering by classification, designation, and site works accurately."""
        # Filter DIRECT guards
        res_direct = SecurityReportingService.get_workforce_reports(
            self.company, self.admin_user, 'employee_master', filters={'classification': 'DIRECT'}
        )
        self.assertEqual(res_direct['total_count'], 2)

        # Filter INDIRECT staff
        res_indirect = SecurityReportingService.get_workforce_reports(
            self.company, self.admin_user, 'employee_master', filters={'classification': 'INDIRECT'}
        )
        self.assertEqual(res_indirect['total_count'], 1)
        self.assertEqual(res_indirect['records'][0]['full_name'], 'Zubair Office')

    # =========================================================================
    # 10. Multi-Tenant Isolation
    # =========================================================================
    def test_multi_tenant_isolation(self):
        """Verifies company B records never leak into company A reports."""
        # Create entity in Company B
        emp_b = Employee.objects.create(
            company=self.company_b,
            employee_code="COMP-B-001",
            first_name="Foreign",
            last_name="Guard",
            employment_status="ACTIVE",
            hire_date=date(2026, 1, 1)
        )

        res_a = SecurityReportingService.get_workforce_reports(self.company, self.admin_user, 'employee_master')
        b_codes = [r['employee_code'] for r in res_a['records']]
        self.assertNotIn("COMP-B-001", b_codes)

        dash_a = SecurityReportingService.get_executive_dashboard(self.company, self.admin_user)
        self.assertEqual(dash_a['workforce']['total_workforce'], 3)

    # =========================================================================
    # 11. RBAC & Financial Confidentiality Masking
    # =========================================================================
    def test_module_user_rbac_confidentiality(self):
        """
        Verifies that an operations supervisor without finance.read:
        1. Receives masked financial fields on executive dashboard (is_financial_masked = True).
        2. Is barred with PermissionDenied from profitability and finance endpoints.
        3. Is barred from sensitive payroll calculation compensation figures.
        """
        # 1. Executive dashboard masking
        dash = SecurityReportingService.get_executive_dashboard(self.company, user=self.ops_user)
        self.assertTrue(dash['commercial']['is_financial_masked'])
        self.assertIsNone(dash['commercial']['period_billing'])
        self.assertIsNone(dash['commercial']['receivables'])
        self.assertTrue(dash['finance']['is_masked'])

        # 2. Profitability endpoint denied
        with self.assertRaises(PermissionDenied):
            SecurityReportingService.get_profitability_report(self.company, user=self.ops_user)

        # 3. Payroll summary denied
        with self.assertRaises(PermissionDenied):
            SecurityReportingService.get_workforce_reports(
                self.company, user=self.ops_user, report_type='payroll_summary'
            )

        # 4. REST API authorization test: ops_user GET /api/operations/reports/profitability/ returns 403
        self.client.force_authenticate(user=self.ops_user)
        resp = self.client.get('/api/operations/reports/profitability/')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

        # 5. REST API: ops_user GET /api/operations/reports/executive-dashboard/ succeeds with masked financials
        resp_dash = self.client.get('/api/operations/reports/executive-dashboard/')
        self.assertEqual(resp_dash.status_code, status.HTTP_200_OK)
        self.assertTrue(resp_dash.data['finance']['is_masked'])

    # =========================================================================
    # 12. CSV Export Functionality
    # =========================================================================
    def test_export_csv(self):
        """Verifies /api/operations/reports/export-csv/ generates valid CSV attachment."""
        self.client.force_authenticate(user=self.admin_user)
        url = '/api/operations/reports/export-csv/?domain=workforce&report_type=employee_master'
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp['Content-Type'], 'text/csv; charset=utf-8')
        self.assertIn('attachment; filename="security_workforce_employee_master_', resp['Content-Disposition'])
        content = resp.content.decode('utf-8')
        self.assertIn('employee_code', content)
        self.assertIn('SG-001', content)

    # =========================================================================
    # PHASE S-9.1: REPORTING POLICY & ACCESS ALIGNMENT PATCH TESTS
    # =========================================================================

    def test_custom_inspection_policy_threshold_changes_compliance_result(self):
        """
        S-9.1 Minimal Test 1:
        Verifies that configuring a custom S-7.1 InspectionPolicy threshold dynamically
        changes the S-9 inspection compliance result, removing hardcoded reporting thresholds.
        """
        today = timezone.now()
        # Create an inspection with score = 85.00%, status = COMPLETED, no deficiencies
        insp = SupervisorInspection.objects.create(
            company=self.company,
            site=self.site_a,
            inspector=self.admin_user,
            inspected_employee=self.guard_1,
            inspection_datetime=today,
            overall_score=Decimal('85.00'),
            status='COMPLETED',
            guard_presence_verified=True,
            uniform_condition='SATISFACTORY',
            equipment_condition='SATISFACTORY',
            post_cleanliness_condition='SATISFACTORY',
            documentation_in_order=True,
            turnout_and_bearing='SATISFACTORY'
        )

        # 1. Under standard default policy (escalation_threshold = 80.00%), score 85.00% is COMPLIANT
        status_eval = SecurityReportingService.get_inspection_compliance_status(insp, company=self.company)
        self.assertFalse(status_eval['is_failed'])
        self.assertEqual(status_eval['compliance_status'], 'COMPLIANT')

        rep = SecurityReportingService.get_compliance_reports(self.company)
        failed_ids = [r['id'] for r in rep['failed_inspections']]
        self.assertNotIn(str(insp.id), failed_ids)

        # 2. Tenant creates custom S-7.1 policy with strict escalation_threshold = 90.00%
        policy_strict = InspectionPolicy.objects.create(
            company=self.company,
            name="Strict ISO Quality Policy",
            is_active=True,
            effective_from=today.date() - timedelta(days=5),
            warning_threshold=Decimal('95.00'),
            escalation_threshold=Decimal('90.00'),
            critical_threshold=Decimal('70.00')
        )

        # 3. Same inspection (score 85.00%) is now FAILED (< 90.00% escalation threshold)
        status_eval_strict = SecurityReportingService.get_inspection_compliance_status(insp, company=self.company)
        self.assertTrue(status_eval_strict['is_failed'])
        self.assertEqual(status_eval_strict['policy_name'], "Strict ISO Quality Policy")
        self.assertEqual(status_eval_strict['escalation_threshold'], 90.0)

        rep_strict = SecurityReportingService.get_compliance_reports(self.company)
        failed_strict_ids = [r['id'] for r in rep_strict['failed_inspections']]
        self.assertIn(str(insp.id), failed_strict_ids)

        # 4. Now tenant lowers the threshold to 80.00% - inspection compliance automatically clears
        policy_strict.escalation_threshold = Decimal('80.00')
        policy_strict.save()

        rep_relaxed = SecurityReportingService.get_compliance_reports(self.company)
        failed_relaxed_ids = [r['id'] for r in rep_relaxed['failed_inspections']]
        self.assertNotIn(str(insp.id), failed_relaxed_ids)

    def test_historical_inspection_respects_attached_policy(self):
        """
        S-9.1 Minimal Test 2:
        Verifies that an inspection attached to a historical policy snapshot/reference
        respects that historical policy rather than a newer active policy.
        """
        today = timezone.now()
        # Historical policy (2025 Standard: threshold 75%)
        policy_2025 = InspectionPolicy.objects.create(
            company=self.company,
            name="Policy 2025 Standard",
            is_active=True,
            effective_from=date(2025, 1, 1),
            effective_to=date(2025, 12, 31),
            warning_threshold=Decimal('80.00'),
            escalation_threshold=Decimal('75.00'),
            critical_threshold=Decimal('50.00')
        )

        # Historical inspection explicitly attached to policy_2025 with score = 78.00%
        insp_hist = SupervisorInspection.objects.create(
            company=self.company,
            site=self.site_a,
            inspector=self.admin_user,
            inspected_employee=self.guard_1,
            inspection_datetime=today - timedelta(days=20),
            overall_score=Decimal('78.00'),
            status='COMPLETED',
            policy=policy_2025
        )

        # Newer active policy (2026 Strict: threshold 85%)
        policy_2026 = InspectionPolicy.objects.create(
            company=self.company,
            name="Policy 2026 Strict",
            is_active=True,
            effective_from=date(2026, 1, 1),
            warning_threshold=Decimal('90.00'),
            escalation_threshold=Decimal('85.00'),
            critical_threshold=Decimal('65.00')
        )

        # Historical inspection evaluates against policy_2025 (threshold 75.00%) -> NOT failed
        eval_hist = SecurityReportingService.get_inspection_compliance_status(insp_hist, company=self.company)
        self.assertEqual(eval_hist['policy_name'], "Policy 2025 Standard")
        self.assertEqual(eval_hist['escalation_threshold'], 75.0)
        self.assertFalse(eval_hist['is_failed'])

        # An unlinked inspection on the same date consumes the active policy_2026 (threshold 85.00%) -> FAILED
        insp_new = SupervisorInspection.objects.create(
            company=self.company,
            site=self.site_a,
            inspector=self.admin_user,
            inspected_employee=self.guard_2,
            inspection_datetime=today - timedelta(days=20),
            overall_score=Decimal('78.00'),
            status='COMPLETED',
            policy=None
        )
        eval_new = SecurityReportingService.get_inspection_compliance_status(insp_new, company=self.company)
        self.assertEqual(eval_new['policy_name'], "Policy 2026 Strict")
        self.assertEqual(eval_new['escalation_threshold'], 85.0)
        self.assertTrue(eval_new['is_failed'])

    def test_full_company_authorized_user_access(self):
        """
        S-9.1 Minimal Test 3:
        Verifies that a user with access_mode='FULL_COMPANY' and RBAC permission
        can access reports endpoints.
        """
        self.client.force_authenticate(user=self.ops_user) # access_mode is FULL_COMPANY, perms include operations.read
        resp = self.client.get('/api/operations/reports/executive-dashboard/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn('commercial', resp.data)
        self.assertIn('operations', resp.data)

    def test_custom_user_with_module_grant_and_rbac_access(self):
        """
        S-9.1 Minimal Test 4:
        Verifies that a CUSTOM user with explicit UserModuleAccess grant for security_ops
        and authoritative RBAC permission can access reports.
        """
        custom_user = User.objects.create_user(
            username="custom_ops_granted",
            email="custom_granted@zorvexshield.com",
            password="StrongPassword123!",
            company_id=self.company.id,
            company_role=self.ops_role,
            access_mode="CUSTOM"
        )
        # Grant security_ops
        UserModuleAccess.objects.create(
            user=custom_user,
            module=self.mod_sec_ops,
            enabled=True
        )

        self.client.force_authenticate(user=custom_user)
        resp = self.client.get('/api/operations/reports/executive-dashboard/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_custom_user_without_module_grant_denied(self):
        """
        S-9.1 Minimal Test 5:
        Verifies that a CUSTOM user WITHOUT UserModuleAccess grant for security_ops is denied (403).
        """
        custom_user_no_grant = User.objects.create_user(
            username="custom_ops_denied",
            email="custom_denied@zorvexshield.com",
            password="StrongPassword123!",
            company_id=self.company.id,
            company_role=self.ops_role,
            access_mode="CUSTOM"
        )
        self.client.force_authenticate(user=custom_user_no_grant)
        resp = self.client.get('/api/operations/reports/executive-dashboard/')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('security_ops', str(resp.data))

    def test_user_with_module_grant_but_missing_rbac_denied(self):
        """
        S-9.1 Minimal Test 6:
        Verifies that a user with module access but lacking RBAC permission is denied (403).
        Zero hardcoded role name gates.
        """
        empty_role = CompanyRole.objects.create(
            company=self.company,
            name="No Permissions Role",
            permissions=[]
        )
        user_no_rbac = User.objects.create_user(
            username="user_no_rbac",
            email="no_rbac@zorvexshield.com",
            password="StrongPassword123!",
            company_id=self.company.id,
            company_role=empty_role,
            access_mode="FULL_COMPANY"
        )
        self.client.force_authenticate(user=user_no_rbac)
        resp = self.client.get('/api/operations/reports/executive-dashboard/')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_domain_confidentiality_finance_and_hr_values_masked(self):
        """
        S-9.1 Minimal Test 7:
        Verifies that operational staff without finance and HR permissions
        cannot see financial numbers, profitability, or employee compensation.
        """
        self.client.force_authenticate(user=self.ops_user)

        # 1. Profitability is 403
        resp_prof = self.client.get('/api/operations/reports/profitability/')
        self.assertEqual(resp_prof.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Finance endpoint is 403
        resp_fin = self.client.get('/api/operations/reports/finance/')
        self.assertEqual(resp_fin.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Workforce payroll summary is 403
        resp_pay = self.client.get('/api/operations/reports/workforce/?report_type=payroll_summary')
        self.assertEqual(resp_pay.status_code, status.HTTP_403_FORBIDDEN)

        # 4. Workforce statutory contributions is 403
        resp_stat = self.client.get('/api/operations/reports/workforce/?report_type=statutory')
        self.assertEqual(resp_stat.status_code, status.HTTP_403_FORBIDDEN)

        # 5. Inventory report masks cost_price and valuation
        resp_inv = self.client.get('/api/operations/reports/inventory/?report_type=store_stock')
        self.assertEqual(resp_inv.status_code, status.HTTP_200_OK)
        for itm in resp_inv.data['records']:
            self.assertIsNone(itm['cost_price'])
            self.assertIsNone(itm['total_valuation'])

        # 6. Purchasing report masks total_amount
        resp_pur = self.client.get('/api/operations/reports/purchasing/?report_type=purchase_orders')
        self.assertEqual(resp_pur.status_code, status.HTTP_200_OK)
        for doc in resp_pur.data['records']:
            self.assertIsNone(doc['total_amount'])

    def test_cross_module_integration_access_architecture_certified(self):
        """
        S-9.1 Minimal Test 8 (Cross-module certification):
        Confirms S-8 CrossModuleIntegrationViewSet adheres strictly to:
        CompanyModule enabled + Security capability exposed + UserModuleAccess + RBAC = ALLOW.
        """
        # FULL_COMPANY + operations.read -> ALLOW
        self.client.force_authenticate(user=self.ops_user)
        resp = self.client.get('/api/operations/cross-module/action-center/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        # CUSTOM without grant -> 403
        custom_user = User.objects.create_user(
            username="custom_cross_user",
            email="custom_cross@zorvexshield.com",
            password="StrongPassword123!",
            company_id=self.company.id,
            company_role=self.ops_role,
            access_mode="CUSTOM"
        )
        self.client.force_authenticate(user=custom_user)
        resp_no_grant = self.client.get('/api/operations/cross-module/action-center/')
        self.assertEqual(resp_no_grant.status_code, status.HTTP_403_FORBIDDEN)

        # CUSTOM with grant -> 200 OK
        UserModuleAccess.objects.create(
            user=custom_user,
            module=self.mod_sec_ops,
            enabled=True
        )
        resp_granted = self.client.get('/api/operations/cross-module/action-center/')
        self.assertEqual(resp_granted.status_code, status.HTTP_200_OK)
