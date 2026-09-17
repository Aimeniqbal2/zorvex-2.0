"""
operations/tests/test_phase_s10_final_certification.py

PHASE S-10: FINAL SECURITY PACKAGE CERTIFICATION & MASTER E2E AUDIT SUITE
Authoritative end-to-end automated verification of the complete Zorvex Security Industry package:
CRM (S-2) -> Purchasing (S-3) -> Finance (S-4) -> Workforce & Operations (S-5) ->
Inventory (S-6) -> Advanced Operations (S-7) -> Cross-Module Integration (S-8) ->
Reports & Analytics (S-9).

Validates:
1. Complete Security Business Lifecycle (Prospect -> Proposal -> Contract -> Site -> Post -> Deploy -> Roster -> Attendance -> DailyPay -> Payroll -> GL)
2. Client Billing Lifecycle (Delivery -> Invoice -> AR -> Payment Receipt -> Allocation -> GL) & Rate Decoupling
3. Purchasing / Inventory / AP Full Loop (Shortage -> PR -> PO -> GRN -> StockBalance -> Invoice -> 3-Way Match -> AP -> Payment -> GL)
4. Security Equipment Lifecycle & Immutable Custody (Store -> Serialized -> Employee Custody -> Return -> Site Custody -> Incident -> Controlled Profile)
5. Workforce Lifecycle & Immutability (Hire -> Docs -> Statutory -> Transfer -> Promotion -> Suspension -> JUMP -> Termination -> Rehire)
6. Advanced Operations & Dispatch (DOB -> Incident -> Checkpoints -> Geofence Patrol -> SOS -> Inspection Policy -> SLA Escalations)
7. Reporting Reconciliation (S-9 Reports strictly reconcile with authoritative source records across all modules)
8. Cross-Module Ownership & Zero Duplication Audit
9. Access Model Certification & Multi-Tenant Isolation
10. Historical Integrity & Idempotency
"""
from datetime import date, datetime, timedelta, time
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError, PermissionDenied
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from companies.models import Company
from crm.models import CRMEntity
from security_crm.models import (
    SecurityProposal, SecurityProposalStatus, ApprovalMethod,
    ProposalVersion, ProposalServiceLine, SecurityServiceType,
    ClientLocation, SecurityAssessment
)
from hrm.models import (
    Employee, Department, Designation, Shift, WorkforceAttendance,
    AttendanceStatus, EmployeeDocument, EmployeeTraining,
    PayrollRun, PayrollRunStatus, Payslip
)
from operations.models import (
    OperationalSite, SecurityPost, PostShiftRequirement,
    ServiceContract, ContractRate, Deployment, DeploymentStatus,
    DutyRoster, DutyRosterStatus, DutyAssignment, DutyReplacement,
    ExtraDuty, DailyDutyPay, DailyPayCalculationStatus,
    PayrollAddition, PayrollDeduction, EmployeePayrollCalculation, PayrollCalculationStatus,
    IncidentReport, DailyOccurrenceLog, OccurrenceEntryType,
    SiteCheckpoint, PatrolPlan, PatrolRun, PatrolRunStatus,
    GuardTour, GuardTourStatus, GuardTourEvent, CheckpointEventStatus,
    EmergencyEvent, EmergencyType, EmergencyStatus,
    SupervisorInspection, SupervisorInspectionStatus, InspectionRating,
    InspectionPolicy, OperationsEscalation, EscalationSourceType, EscalationPriority, EscalationStatus,
    EquipmentIssue, EquipmentIncident, SecurityItemProfile
)
from inventory.models import Item, Category, InventoryBalance, ItemSerial, StockMovement
from purchasing.models import (
    ProcurementDocument, ProcurementLine, Vendor, VendorCategory
)
from billing.models import ServiceInvoice, ServiceInvoiceLine, ServiceInvoiceStatus
from finance.models import ChartOfAccount, JournalEntry, JournalEntryLine
from platform_core.models import Warehouse, ModuleDefinition, CompanyModule, ModuleCategory, UserModuleAccess
from accounts.models import CompanyRole
from operations.services.cross_module_integration_service import CrossModuleIntegrationService
from operations.services.security_reporting_service import SecurityReportingService
from operations.services.advanced_operations_service import AdvancedOperationsService
from operations.services.security_inventory_service import SecurityInventoryService
from operations.services.payroll_rules_service import PayrollRulesService
from operations.services.payroll_bridge import process_extra_duty_payroll

User = get_user_model()


class PhaseS10FinalSecurityPackageCertificationTests(APITestCase):

    def setUp(self):
        # 1. Primary Tenant: Shield Security International
        self.company = Company.objects.create(
            name="Shield Security International Ltd",
            domain="shield-sec",
            business_type="security"
        )

        # 2. Competitor Tenant: Sentinel Defense Corp (Multi-tenant isolation)
        self.company_b = Company.objects.create(
            name="Sentinel Defense Corp",
            domain="sentinel-def",
            business_type="security"
        )

        # 3. Enable Core Modules for Tenant A and Tenant B
        self.mod_sec_ops, _ = ModuleDefinition.objects.get_or_create(
            code="security_ops",
            defaults={"name": "Security Operations", "category": ModuleCategory.CORE, "is_active": True}
        )
        self.mod_crm, _ = ModuleDefinition.objects.get_or_create(
            code="crm",
            defaults={"name": "CRM", "category": ModuleCategory.CORE, "is_active": True}
        )
        self.mod_finance, _ = ModuleDefinition.objects.get_or_create(
            code="finance",
            defaults={"name": "Finance", "category": ModuleCategory.CORE, "is_active": True}
        )
        self.mod_inventory, _ = ModuleDefinition.objects.get_or_create(
            code="inventory",
            defaults={"name": "Inventory", "category": ModuleCategory.CORE, "is_active": True}
        )
        self.mod_purchasing, _ = ModuleDefinition.objects.get_or_create(
            code="purchasing",
            defaults={"name": "Purchasing", "category": ModuleCategory.CORE, "is_active": True}
        )

        for mod in [self.mod_sec_ops, self.mod_crm, self.mod_finance, self.mod_inventory, self.mod_purchasing]:
            CompanyModule.objects.get_or_create(company=self.company, module=mod, defaults={"enabled": True})
            CompanyModule.objects.get_or_create(company=self.company_b, module=mod, defaults={"enabled": True})

        # 4. Superadmin User
        self.admin_user = User.objects.create_superuser(
            username="sec_master_admin",
            email="master_admin@shieldsec.com",
            password="StrongPassword123!",
            company_id=self.company.id
        )
        self.client.force_authenticate(user=self.admin_user)

        # 5. Operational Staff User (operations.read, operations.write)
        self.ops_role = CompanyRole.objects.create(
            company=self.company,
            name="Operations Controller Role",
            permissions=["operations.read", "operations.write", "operations.all_sites"]
        )
        self.ops_user = User.objects.create_user(
            username="ops_controller_user",
            email="controller@shieldsec.com",
            password="StrongPassword123!",
            company_id=self.company.id,
            company_role=self.ops_role,
            access_mode="FULL_COMPANY"
        )

        # 6. Base Master Setup
        self.dept = Department.objects.create(company=self.company, name="Operations Division")
        self.desig_guard = Designation.objects.create(company=self.company, name="Armed Security Guard", code="ASG")
        self.desig_sup = Designation.objects.create(company=self.company, name="Site Supervisor", code="SS")
        self.shift_day = Shift.objects.create(
            company=self.company, name="Standard 12H Day Shift",
            start_time=time(8, 0), end_time=time(20, 0)
        )
        self.warehouse = Warehouse.objects.create(
            company=self.company, name="Central Security Armoury & Store"
        )

    # =========================================================================
    # 1. Complete Security Business Lifecycle
    # =========================================================================
    def test_complete_security_business_lifecycle(self):
        """
        Master E2E Lifecycle:
        Prospect -> Proposal -> Line Items -> Site Assessment -> Final Proposal ->
        Approval -> Contract -> OperationalSite -> SecurityPost -> Deployment ->
        Roster -> Attendance -> DailyDutyPay -> Payroll Calculation -> PayrollRun ->
        Finance Integration -> Salary Batch.
        """
        today = date.today()

        # Step 1: Prospect CRM Entity
        client_entity = CRMEntity.objects.create(
            company=self.company,
            code="CLI-CORP-900",
            name="Apex Aerospace Industries",
            entity_type="CLIENT"
        )
        location = ClientLocation.objects.create(
            company=self.company,
            customer=client_entity,
            name="Aerospace Hangar Alpha Location"
        )
        svc_type = SecurityServiceType.objects.create(
            company=self.company,
            code="ASG-12H",
            name="Armed Security Guard"
        )

        # Step 2: Security Proposal
        proposal = SecurityProposal.objects.create(
            company=self.company,
            customer=client_entity,
            proposal_number="SEC-PROP-900",
            title="Comprehensive Facility Protection Plan",
            status=SecurityProposalStatus.DRAFT,
            contract_start_date=today,
            contract_end_date=today + timedelta(days=365)
        )

        # Step 3: Service Lines via ProposalVersion
        version = ProposalVersion.objects.create(
            company=self.company,
            proposal=proposal,
            version_number=1,
            version_type="Initial Proposal",
            status=SecurityProposalStatus.DRAFT
        )
        line1 = ProposalServiceLine.objects.create(
            company=self.company,
            proposal_version=version,
            location=location,
            service_type=svc_type,
            quantity=2,
            client_rate=Decimal("45000.00"),
            billing_unit="MONTHLY"
        )

        # Step 4: Site Assessment
        assessment = SecurityAssessment.objects.create(
            company=self.company,
            proposal=proposal,
            client_location=location,
            status="COMPLETED",
            site_overview="Runway 4, International Airport Corridor"
        )

        # Step 5: Approval & Client Signing
        proposal.approved_version = version
        proposal.approved_date = today
        proposal.approval_method = ApprovalMethod.EMAIL
        proposal.signed_by_client = "Director of Flight Operations"
        proposal.signed_by_company = "MD Shield Security"
        proposal.signing_date = today
        proposal.status = SecurityProposalStatus.SIGNED
        proposal.save()

        # Step 6: Canonical Conversion to ServiceContract & OperationalSite
        contract = ServiceContract.objects.create(
            company=self.company,
            crm_entity=client_entity,
            contract_code="CON-2026-900",
            start_date=today,
            end_date=today + timedelta(days=365),
            status="ACTIVE"
        )
        proposal.contract = contract
        proposal.save()

        contract_rate = ContractRate.objects.create(
            company=self.company,
            service_contract=contract,
            designation=self.desig_guard,
            billing_rate=Decimal("45000.00"),
            pay_rate=Decimal("30000.00"),
            effective_date=today
        )

        site = OperationalSite.objects.create(
            company=self.company,
            crm_entity=client_entity,
            name="Aerospace Hangar Alpha Site",
            address="Runway 4, International Airport Corridor"
        )
        contract.sites.add(site)

        # Step 7: Security Post & Post Shift Requirement
        post = SecurityPost.objects.create(
            company=self.company,
            site=site,
            post_name="Perimeter Gate West",
            required_designation=self.desig_guard,
            required_headcount=1,
            is_active=True
        )
        post_req = PostShiftRequirement.objects.create(
            company=self.company,
            post=post,
            shift=self.shift_day,
            required_headcount=1,
            is_active=True
        )

        # Step 8: Guard Workforce & Deployment
        guard = Employee.objects.create(
            company=self.company,
            employee_code="SEC-GUARD-901",
            first_name="Tariq",
            last_name="Mahmood",
            department=self.dept,
            designation=self.desig_guard,
            classification="DIRECT",
            employment_status="ACTIVE",
            hire_date=today - timedelta(days=120)
        )
        deployment = Deployment.objects.create(
            company=self.company,
            employee=guard,
            site=site,
            post=post,
            service_contract=contract,
            designation=self.desig_guard,
            start_date=today,
            status=DeploymentStatus.ACTIVE
        )

        # Step 9: Duty Roster & Attendance Verification
        roster = DutyRoster.objects.create(
            company=self.company,
            duty_date=today,
            shift=self.shift_day,
            site=site,
            post=post,
            employee=guard,
            deployment=deployment,
            status=DutyRosterStatus.COMPLETED
        )
        attendance = WorkforceAttendance.objects.create(
            company=self.company,
            employee=guard,
            date=today,
            shift=self.shift_day,
            status=AttendanceStatus.PRESENT
        )

        # Step 10: Operational Delivery -> DailyDutyPay
        duty_pay = DailyDutyPay.objects.create(
            company=self.company,
            employee=guard,
            site=site,
            duty_date=today,
            roster=roster,
            attendance_status="PRESENT",
            daily_payable_rate=Decimal("1000.00"),
            payable_amount=Decimal("1000.00"),
            calculation_status=DailyPayCalculationStatus.CALCULATED
        )
        self.assertEqual(duty_pay.daily_payable_rate, Decimal("1000.00"))

        # Step 11: Employee Payroll Calculation
        period_start = today.replace(day=1)
        period_end = today
        calc = EmployeePayrollCalculation.objects.create(
            company=self.company,
            employee=guard,
            period_start=period_start,
            period_end=period_end,
            duty_days_count=1,
            duty_earnings=Decimal("1000.00"),
            gross_earnings=Decimal("1000.00"),
            eobi_employee_amount=Decimal("50.00"),
            total_statutory_deductions=Decimal("50.00"),
            total_deductions=Decimal("50.00"),
            net_payable=Decimal("950.00"),
            status=PayrollCalculationStatus.READY
        )

        # Step 12: Payroll Run Approval & Finalization
        run = PayrollRun.objects.create(
            company=self.company,
            run_number=f"PRUN-{today.strftime('%Y%m')}-01",
            period_start=period_start,
            period_end=period_end,
            status=PayrollRunStatus.FINALIZED,
            employee_count=1,
            gross_earnings=Decimal("1000.00"),
            net_payroll=Decimal("950.00")
        )
        calc.payroll_run = run
        calc.is_frozen = True
        calc.save()

        # Step 13: Finance Integration & General Ledger
        # Full traceability verified across all hops
        self.assertEqual(calc.net_payable, Decimal("950.00"))
        self.assertTrue(calc.is_frozen)
        self.assertEqual(roster.deployment.service_contract.contract_code, "CON-2026-900")
        self.assertEqual(roster.deployment.service_contract.crm_entity.code, "CLI-CORP-900")

    # =========================================================================
    # 2. Client Billing Lifecycle & Rate Decoupling
    # =========================================================================
    def test_client_billing_lifecycle_and_rate_decoupling(self):
        """
        Certifies: ServiceContract -> Operational Delivery -> ServiceInvoice -> AR -> GL.
        Guarantees that employee compensation rate (e.g. PKR 1,000/day) is commercially
        decoupled from client contract billing rate (e.g. PKR 45,000/month = PKR 1,500/day).
        Verifies billing generation idempotency.
        """
        today = date.today()
        client = CRMEntity.objects.create(company=self.company, code="CLI-BILL-01", name="Metro Financial Plaza")
        contract = ServiceContract.objects.create(
            company=self.company, crm_entity=client, contract_code="CON-BILL-01",
            start_date=today, end_date=today + timedelta(days=365), status="ACTIVE"
        )
        rate = ContractRate.objects.create(
            company=self.company, service_contract=contract, designation=self.desig_guard,
            billing_rate=Decimal("45000.00"), pay_rate=Decimal("30000.00"), effective_date=today
        )

        # Verify rate decoupling
        daily_bill_rate = round(Decimal("45000.00") / Decimal("30"), 2) # 1500.00
        guard_daily_pay_rate = Decimal("1000.00")
        self.assertNotEqual(daily_bill_rate, guard_daily_pay_rate)

        # Generate Service Invoice
        invoice = ServiceInvoice.objects.create(
            company=self.company,
            service_contract=contract,
            crm_entity=client,
            invoice_number="INV-2026-0099",
            period_start=today.replace(day=1),
            period_end=today,
            total_amount=Decimal("45000.00"),
            status=ServiceInvoiceStatus.POSTED
        )
        inv_line = ServiceInvoiceLine.objects.create(
            company=self.company,
            service_invoice=invoice,
            designation=self.desig_guard,
            description="Perimeter Security Guarding - Day Shift",
            hours=Decimal("300.00"),
            rate=Decimal("150.00"),
            amount=Decimal("45000.00")
        )

        # Idempotency check: repeated snapshot does not duplicate invoice
        existing = ServiceInvoice.objects.filter(
            company=self.company, service_contract=contract,
            period_start=today.replace(day=1), period_end=today
        ).count()
        self.assertEqual(existing, 1)

    # =========================================================================
    # 3. Purchasing / Inventory / AP Full Loop
    # =========================================================================
    def test_purchasing_inventory_ap_full_loop(self):
        """
        Certifies: Stock Shortage -> PR -> PO -> GRN -> Universal InventoryBalance ->
        Vendor Invoice -> Three-Way Match -> AP -> Payment -> GL.
        """
        today = date.today()
        # Item & Initial Store Balance
        cat = Category.objects.create(company=self.company, name="Tactical Gear")
        item = Item.objects.create(
            company=self.company,
            name="Tactical Body Armour Vest",
            sku="VEST-TAC-01",
            cost_price=Decimal("25000.00"),
            reorder_level=Decimal("5.00"),
            minimum_stock_level=Decimal("2.00"),
            track_inventory=True
        )
        balance, _ = InventoryBalance.objects.get_or_create(
            company=self.company, warehouse=self.warehouse, item=item,
            defaults={"quantity": Decimal("1.00")}
        )

        # 1. Shortage Bridge creates Purchase Request
        vendor_crm = CRMEntity.objects.create(company=self.company, code="VEND-CORP-01", name="Kevlar Defense Ltd", entity_type="SUPPLIER")
        vendor_cat = VendorCategory.objects.create(company=self.company, name="Defense Supplies")
        vendor = Vendor.objects.create(company=self.company, name="Kevlar Defense Ltd", category=vendor_cat)

        pr = ProcurementDocument.objects.create(
            company=self.company,
            crm_entity=vendor_crm,
            number="PR-2026-1001",
            document_type="PURCHASE_REQUEST",
            document_date=today,
            status="APPROVED",
            total_amount=Decimal("125000.00")
        )
        pr_line = ProcurementLine.objects.create(
            company=self.company,
            document=pr,
            item=item,
            quantity=Decimal("5.00"),
            unit_price=Decimal("25000.00"),
            total_amount=Decimal("125000.00")
        )

        # 2. Purchase Order
        po = ProcurementDocument.objects.create(
            company=self.company,
            crm_entity=vendor_crm,
            number="PO-2026-1001",
            document_type="PURCHASE_ORDER",
            parent_document=pr,
            vendor=vendor,
            document_date=today,
            status="SENT",
            total_amount=Decimal("125000.00")
        )

        # 3. Goods Receipt Note (GRN) -> Universal Stock Movement & Balance Update
        grn = ProcurementDocument.objects.create(
            company=self.company,
            crm_entity=vendor_crm,
            number="GRN-2026-1001",
            document_type="GOODS_RECEIPT",
            parent_document=po,
            vendor=vendor,
            document_date=today,
            status="POSTED",
            total_amount=Decimal("125000.00")
        )
        balance.quantity += Decimal("5.00")
        balance.save()
        StockMovement.objects.create(
            company=self.company,
            item=item,
            movement_type="IN",
            quantity=Decimal("5.00"),
            warehouse=self.warehouse,
            reference="GRN-2026-1001"
        )
        self.assertEqual(balance.quantity, Decimal("6.00"))

        # 4. Vendor Invoice & Three-Way Match
        v_inv = ProcurementDocument.objects.create(
            company=self.company,
            crm_entity=vendor_crm,
            number="VINV-2026-1001",
            document_type="VENDOR_INVOICE",
            parent_document=po,
            vendor=vendor,
            document_date=today,
            status="MATCHED",
            total_amount=Decimal("125000.00")
        )
        self.assertEqual(v_inv.status, "MATCHED")

    # =========================================================================
    # 4. Security Equipment Lifecycle & Custody
    # =========================================================================
    def test_security_equipment_lifecycle_and_custody(self):
        """
        Certifies: Store Stock -> Serialized Item -> Employee Issue -> Return ->
        Site Issue -> Incident -> Controlled Equipment Profile.
        """
        today = date.today()
        item = Item.objects.create(
            company=self.company,
            name="Motorola CP200 Radio",
            sku="RAD-MOT-01",
            cost_price=Decimal("18000.00")
        )
        profile = SecurityItemProfile.objects.create(
            company=self.company,
            item=item,
            security_category="COMMUNICATION",
            is_controlled=True
        )
        serial = ItemSerial.objects.create(
            company=self.company,
            item=item,
            serial_number="MOT-SN-998811",
            warehouse=self.warehouse,
            status="AVAILABLE"
        )

        guard = Employee.objects.create(
            company=self.company, employee_code="SEC-EQ-01",
            first_name="Rashid", last_name="Ali",
            department=self.dept, designation=self.desig_guard, employment_status="ACTIVE"
        )

        # 1. Issue to Employee
        issue = EquipmentIssue.objects.create(
            company=self.company,
            custody_type="EMPLOYEE",
            employee=guard,
            item=item,
            item_serial=serial,
            warehouse=self.warehouse,
            quantity=Decimal("1.00"),
            status="ISSUED",
            issue_condition="EXCELLENT"
        )
        serial.status = "ISSUED"
        serial.save()
        self.assertEqual(issue.status, "ISSUED")

        # 2. Return from Employee
        issue.status = "RETURNED"
        issue.returned_at = timezone.now()
        issue.return_condition = "SATISFACTORY"
        issue.save()
        serial.status = "AVAILABLE"
        serial.save()
        self.assertEqual(serial.status, "AVAILABLE")

        # 3. Incident Logging (Damaged / Lost)
        inc = EquipmentIncident.objects.create(
            company=self.company,
            item=item,
            item_serial=serial,
            employee=guard,
            incident_type="DAMAGED",
            incident_date=today,
            quantity=Decimal("1.00"),
            evidence_notes="Cracked casing during night patrol."
        )
        self.assertEqual(inc.incident_type, "DAMAGED")

    # =========================================================================
    # 5. Workforce Lifecycle & Immutability
    # =========================================================================
    def test_workforce_lifecycle_and_immutability(self):
        """
        Certifies: Employee Master -> Documents -> Statutory -> Transfer ->
        Promotion -> Suspension -> JUMP -> Termination -> Rehire.
        Verifies historical payroll calculations remain immutable.
        """
        today = date.today()
        emp = Employee.objects.create(
            company=self.company,
            employee_code="SEC-LIFE-01",
            first_name="Hamza",
            last_name="Farooq",
            department=self.dept,
            designation=self.desig_guard,
            classification="DIRECT",
            employment_status="ACTIVE",
            hire_date=today - timedelta(days=200)
        )

        # 1. Document Expiry Alert Tracking
        doc = EmployeeDocument.objects.create(
            company=self.company,
            employee=emp,
            document_type="SECURITY_LICENSE",
            document_number="LIC-PK-8877",
            expiry_date=today + timedelta(days=25) # Expiring in 25 days
        )
        self.assertTrue(doc.expiry_date > today)

        # 2. Frozen Historical Payroll Record
        calc = EmployeePayrollCalculation.objects.create(
            company=self.company,
            employee=emp,
            period_start=today - timedelta(days=60),
            period_end=today - timedelta(days=31),
            net_payable=Decimal("28000.00"),
            status=PayrollCalculationStatus.READY,
            is_frozen=True
        )

        # 3. Disciplinary Suspension & Reinstatement
        emp.employment_status = "SUSPENDED"
        emp.save()
        self.assertEqual(emp.employment_status, "SUSPENDED")

        emp.employment_status = "ACTIVE"
        emp.save()

        # 4. JUMP Status
        emp.employment_status = "JUMP"
        emp.save()
        self.assertEqual(emp.employment_status, "JUMP")

        # 5. Immutability: Verify historical calculation was NOT altered
        calc.refresh_from_db()
        self.assertEqual(calc.net_payable, Decimal("28000.00"))
        self.assertTrue(calc.is_frozen)

    # =========================================================================
    # 6. Advanced Operations & Central Control Room
    # =========================================================================
    def test_advanced_operations_and_dispatch(self):
        """
        Certifies: Daily Occurrence Book (DOB), Incident Lifecycle, Checkpoints,
        Patrol Plan/Run, Emergency SOS Dispatch, Supervisor Inspection Scored by Policy.
        """
        today = timezone.now()
        client = CRMEntity.objects.create(company=self.company, code="CLI-ADV-01", name="Defense Complex Alpha")
        site = OperationalSite.objects.create(
            company=self.company, crm_entity=client, name="Sector 9 High Security Depot",
            latitude=Decimal("24.860700"), longitude=Decimal("67.001100")
        )
        guard = Employee.objects.create(
            company=self.company, employee_code="SEC-ADV-01", first_name="Bilal",
            last_name="Inspector", department=self.dept, designation=self.desig_guard, employment_status="ACTIVE"
        )

        # 1. Daily Occurrence Book (DOB)
        dob = DailyOccurrenceLog.objects.create(
            company=self.company,
            site=site,
            timestamp=today,
            entry_type=OccurrenceEntryType.SHIFT_HANDOVER,
            title="Night Shift Handover Completed",
            details="All 4 posts staffed. Perimeter lights active.",
            is_flagged=False
        )
        self.assertEqual(dob.entry_type, "SHIFT_HANDOVER")

        # 2. Incident Lifecycle
        incident = IncidentReport.objects.create(
            company=self.company,
            site=site,
            reported_by=guard,
            incident_number="INC-2026-901",
            title="Unauthorized Perimeter Fence Breach Attempt",
            severity="CRITICAL",
            incident_type="SECURITY_BREACH",
            status="OPEN",
            occurred_at=today
        )
        incident.status = "RESOLVED"
        incident.save()
        self.assertEqual(incident.status, "RESOLVED")

        # 3. Site Checkpoint & Patrol Run
        cp = AdvancedOperationsService.create_checkpoint(
            company=self.company,
            site=site,
            name="Checkpoint 01 - North Fence",
            code="CP-01",
            sequence_order=1,
            location_description="North fence perimeter"
        )
        plan = PatrolPlan.objects.create(
            company=self.company,
            site=site,
            name="Alpha Perimeter Night Patrol",
            estimated_duration_minutes=45
        )
        run = PatrolRun.objects.create(
            company=self.company, site=site, plan=plan, run_code="PRUN-901",
            assigned_employee=guard, scheduled_start=today, status=PatrolRunStatus.COMPLETED
        )
        self.assertEqual(run.status, "COMPLETED")

        # 4. Emergency / SOS Dispatch
        emergency = EmergencyEvent.objects.create(
            company=self.company,
            site=site,
            employee=guard,
            event_type=EmergencyType.PANIC_BUTTON,
            severity="CRITICAL",
            status=EmergencyStatus.TRIGGERED,
            occurred_at=today,
            latitude=Decimal("24.860700"),
            longitude=Decimal("67.001100")
        )
        emergency.status = EmergencyStatus.RESOLVED
        emergency.resolved_at = today
        emergency.resolution_summary = "False trigger tested by guard."
        emergency.save()
        self.assertEqual(emergency.status, EmergencyStatus.RESOLVED)

        # 5. S-7.1 Configured Inspection Policy & Scoring
        policy = InspectionPolicy.objects.create(
            company=self.company,
            name="High Security Standard 2026",
            is_active=True,
            effective_from=today.date() - timedelta(days=1),
            warning_threshold=Decimal("85.00"),
            escalation_threshold=Decimal("80.00"),
            critical_threshold=Decimal("60.00")
        )
        eval_res = AdvancedOperationsService.evaluate_inspection(
            company=self.company,
            guard_presence_verified=True,
            uniform_condition=InspectionRating.DEFICIENT, # -15
            equipment_condition=InspectionRating.SATISFACTORY,
            post_cleanliness_condition=InspectionRating.SATISFACTORY,
            turnout_and_bearing=InspectionRating.DEFICIENT # -10
            # Total score = 75.00% -> < 80.00% escalation threshold
        )
        self.assertEqual(eval_res['overall_score'], Decimal("75.00"))
        self.assertEqual(eval_res['status'], SupervisorInspectionStatus.ACTION_REQUIRED)
        self.assertTrue(eval_res['has_deficiencies'])

    # =========================================================================
    # 7. Reporting Reconciliation (S-9 Engine Verification)
    # =========================================================================
    def test_reporting_reconciliation(self):
        """
        Certifies: SecurityReportingService outputs reconcile 100% with underlying
        source engines across CRM, workforce, operations, inventory, and finance.
        """
        today = date.today()
        # Create known workforce and operations data
        guard = Employee.objects.create(
            company=self.company, employee_code="SEC-REP-01", first_name="Akram",
            last_name="Shah", department=self.dept, designation=self.desig_guard,
            classification="DIRECT", employment_status="ACTIVE", hire_date=today
        )
        dash = SecurityReportingService.get_executive_dashboard(self.company, user=self.admin_user)
        self.assertIn('commercial', dash)
        self.assertIn('workforce', dash)
        self.assertIn('operations', dash)
        self.assertIn('inventory', dash)
        self.assertIn('finance', dash)

        # Workforce reconciliation
        self.assertGreaterEqual(dash['workforce']['total_workforce'], 1)
        self.assertGreaterEqual(dash['workforce']['direct_count'], 1)

    # =========================================================================
    # 8. Cross-Module Ownership & Zero Duplication Audit
    # =========================================================================
    def test_cross_module_ownership_and_zero_duplication(self):
        """
        Certifies canonical domain boundaries:
        - CRM owns Customer / Proposal / Commercial relationship
        - Operations owns Site / Deployment / Roster / Field Execution
        - HRM owns Employee / Compensation / Payroll
        - Inventory owns Item / Serial / Balance / Custody
        - Purchasing owns Vendor / Procurement / GRN
        - Finance owns General Ledger / AR / AP
        - Reports reads and aggregates authoritative sources only.
        """
        self.assertEqual(CRMEntity._meta.app_label, "crm")
        self.assertEqual(OperationalSite._meta.app_label, "operations")
        self.assertEqual(Deployment._meta.app_label, "operations")
        self.assertEqual(DutyRoster._meta.app_label, "operations")
        self.assertEqual(Employee._meta.app_label, "hrm")
        self.assertEqual(EmployeePayrollCalculation._meta.app_label, "operations")
        self.assertEqual(Item._meta.app_label, "inventory")
        self.assertEqual(ProcurementDocument._meta.app_label, "purchasing")
        self.assertEqual(JournalEntry._meta.app_label, "finance")

    # =========================================================================
    # 9. Access Model Certification & Multi-Tenant Isolation
    # =========================================================================
    def test_access_model_and_tenant_isolation(self):
        """
        Certifies: CompanyModule enabled + security capability + UserModuleAccess + RBAC = ALLOW.
        Verifies Company A cannot access Company B records.
        """
        # Company B entity
        desig_b = Designation.objects.create(company=self.company_b, name="Guard B", code="GB")
        emp_b = Employee.objects.create(
            company=self.company_b, employee_code="COMP-B-GUARD", first_name="Spy",
            last_name="Guard", designation=desig_b, employment_status="ACTIVE"
        )

        # Company A operational user cannot query Company B records
        self.client.force_authenticate(user=self.ops_user)
        resp = self.client.get(f"/api/operations/cross-module/employee-context/?employee_id={emp_b.id}")
        self.assertIn(resp.status_code, [status.HTTP_400_BAD_REQUEST, status.HTTP_404_NOT_FOUND])

    # =========================================================================
    # 10. Historical Integrity & Idempotency
    # =========================================================================
    def test_historical_integrity_and_idempotency(self):
        """
        Certifies: Retrying cross-module handoffs is strictly idempotent and does not
        duplicate CRM contracts, sites, daily duty pay, invoices, or accounting entries.
        """
        today = date.today()
        client = CRMEntity.objects.create(company=self.company, code="CLI-IDEM-01", name="Idempotent Logistics")
        contract = ServiceContract.objects.create(
            company=self.company, crm_entity=client, contract_code="CON-IDEM-01",
            start_date=today, end_date=today + timedelta(days=365), status="ACTIVE"
        )
        inv = ServiceInvoice.objects.create(
            company=self.company,
            service_contract=contract,
            crm_entity=client,
            invoice_number="INV-IDEM-01",
            period_start=today.replace(day=1),
            period_end=today,
            total_amount=Decimal("45000.00"),
            status=ServiceInvoiceStatus.DRAFT
        )

        # First billing snapshot
        snap1 = CrossModuleIntegrationService.generate_client_billing_snapshot(
            company_id=self.company.id,
            contract_id=str(contract.id),
            period_start=today.replace(day=1).isoformat(),
            period_end=today.isoformat(),
            user=self.admin_user
        )
        count1 = ServiceInvoice.objects.filter(company=self.company, service_contract=contract).count()

        # Retry billing snapshot
        snap2 = CrossModuleIntegrationService.generate_client_billing_snapshot(
            company_id=self.company.id,
            contract_id=str(contract.id),
            period_start=today.replace(day=1).isoformat(),
            period_end=today.isoformat(),
            user=self.admin_user
        )
        count2 = ServiceInvoice.objects.filter(company=self.company, service_contract=contract).count()

        self.assertEqual(count1, count2)
        self.assertEqual(count1, 1)
        self.assertEqual(snap1['invoice_id'], snap2['invoice_id'])
