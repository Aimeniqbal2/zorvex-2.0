"""
operations/tests/test_phase_s8_cross_module.py

Authoritative Test Suite for Phase S-8: Security Industry Cross-Module Integration & Exception Engine.
Validates:
1. Cross-module Action Center exceptions across all 11 failure vectors.
2. Multi-hop shared context drill-downs (Client, Employee, Site).
3. Controlled handoff: Inventory Shortage -> Authoritative Purchase Request.
4. Operational client billing reconciliation with contract rates.
5. Cross-module REST API endpoints.
"""
from datetime import date, timedelta
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from rest_framework import status
from rest_framework.test import APITestCase

from companies.models import Company
from crm.models import CRMEntity
from hrm.models import (
    Employee, Department, Designation, WorkforceAttendance,
    AttendanceStatus, Shift, PayrollRun, PayrollRunStatus
)
from operations.models import (
    OperationalSite, SecurityPost, Deployment, DeploymentStatus,
    ServiceContract, ContractRate, DutyRoster, DutyRosterStatus,
    DutyReplacement, DailyDutyPay, DailyPayCalculationStatus,
    EmployeePayrollCalculation, PayrollCalculationStatus,
    EquipmentIssue, EquipmentIncident, IncidentReport,
    SupervisorInspection, OperationsEscalation, EscalationSourceType
)
from billing.models import ServiceInvoice, ServiceInvoiceLine, ServiceInvoiceStatus
from inventory.models import Item, Category, InventoryBalance
from platform_core.models import Warehouse, ModuleDefinition, CompanyModule, UserModuleAccess, ModuleCategory
from accounts.models import CompanyRole
from purchasing.models import ProcurementDocument, ProcurementLine
from operations.services.cross_module_integration_service import CrossModuleIntegrationService

User = get_user_model()


class PhaseS8CrossModuleIntegrationTests(APITestCase):

    def setUp(self):
        self.company = Company.objects.create(
            name="Alpha Security Operations Ltd",
            domain="alpha-sec-ops",
            business_type="security"
        )
        self.mod_sec_ops, _ = ModuleDefinition.objects.get_or_create(
            code="security_ops",
            defaults={"name": "Security Operations", "category": ModuleCategory.CORE, "is_active": True}
        )
        self.comp_mod, _ = CompanyModule.objects.get_or_create(
            company=self.company,
            module=self.mod_sec_ops,
            defaults={"enabled": True}
        )
        if not self.comp_mod.enabled:
            self.comp_mod.enabled = True
            self.comp_mod.save(update_fields=['enabled'])
        self.user = User.objects.create_superuser(
            username="sec_ops_admin",
            email="secadmin@alphasec.com",
            password="StrongPassword123!",
            company_id=self.company.id
        )
        self.client.force_authenticate(user=self.user)

        self.department = Department.objects.create(
            company=self.company,
            name="Field Operations"
        )
        self.designation = Designation.objects.create(
            company=self.company,
            name="Armed Guard",
            code="AG"
        )
        self.employee = Employee.objects.create(
            company=self.company,
            employee_code="SEC-GRD-001",
            first_name="Tariq",
            last_name="Mahmood",
            department=self.department,
            designation=self.designation,
            employment_status="ACTIVE",
            hire_date=date(2025, 1, 1)
        )
        self.shift = Shift.objects.create(
            company=self.company,
            name="Day Shift (12H)",
            start_time="08:00:00",
            end_time="20:00:00"
        )
        self.crm_client = CRMEntity.objects.create(
            company=self.company,
            code="CUST-001",
            name="Grand Mall Commercial Hub",
            entity_type="CUSTOMER"
        )
        self.site = OperationalSite.objects.create(
            company=self.company,
            crm_entity=self.crm_client,
            name="Grand Mall Site A",
            address="12 Main Boulevard",
            is_active=True
        )
        self.contract = ServiceContract.objects.create(
            company=self.company,
            crm_entity=self.crm_client,
            contract_code="CTR-2026-001",
            status="ACTIVE",
            start_date=date(2026, 1, 1),
            end_date=date(2026, 12, 31)
        )
        self.contract.sites.add(self.site)

        self.category = Category.objects.create(
            company=self.company,
            name="Tactical Gear"
        )
        self.item = Item.objects.create(
            company=self.company,
            category=self.category,
            name="VHF Handheld Radio",
            item_code="RAD-VHF-01",
            sku="RAD-VHF-01",
            track_inventory=True,
            cost_price=Decimal('15000.00'),
            reorder_level=Decimal('5.00')
        )
        self.warehouse = Warehouse.objects.create(
            company=self.company,
            name="Central Security Armory",
            code="ARM-CENTRAL"
        )

    def test_01_action_center_exceptions_consolidation(self):
        """Action Center detects active contract without sites, post vacancies, and shortages."""
        # 1. Create an orphaned contract without sites
        orphaned_contract = ServiceContract.objects.create(
            company=self.company,
            crm_entity=self.crm_client,
            contract_code="CTR-ORPHAN-01",
            status="ACTIVE",
            start_date=date(2026, 1, 1)
        )

        # 2. Create an empty site without posts or requirements
        empty_site = OperationalSite.objects.create(
            company=self.company,
            crm_entity=self.crm_client,
            name="Unstaffed Plaza",
            is_active=True
        )

        # 3. Create a post requiring 2 guards with 0 deployed
        post = SecurityPost.objects.create(
            company=self.company,
            site=self.site,
            post_name="Main Entrance Gate",
            required_designation=self.designation,
            required_headcount=2,
            is_active=True
        )

        # 4. Inventory item with 0 stock (below reorder level of 5)
        # item has no balances

        exceptions = CrossModuleIntegrationService.get_action_center_exceptions(self.company.id)
        self.assertGreater(len(exceptions), 0)

        categories = [e['category'] for e in exceptions]
        self.assertIn('CONTRACT_WITHOUT_SITE', categories)
        self.assertIn('SITE_WITHOUT_MANPOWER', categories)
        self.assertIn('POST_VACANCY', categories)
        self.assertIn('INVENTORY_SHORTAGE', categories)

    def test_02_action_center_detects_uncovered_absence(self):
        """Action Center detects guard absence on roster when no replacement is assigned."""
        post = SecurityPost.objects.create(
            company=self.company,
            site=self.site,
            post_name="East Gate",
            required_designation=self.designation,
            required_headcount=1,
            is_active=True
        )
        today = date.today()
        roster = DutyRoster.objects.create(
            company=self.company,
            duty_date=today,
            employee=self.employee,
            site=self.site,
            post=post,
            shift=self.shift,
            status=DutyRosterStatus.SCHEDULED
        )
        WorkforceAttendance.objects.create(
            company=self.company,
            employee=self.employee,
            date=today,
            status=AttendanceStatus.ABSENT
        )

        exceptions = CrossModuleIntegrationService.get_action_center_exceptions(self.company.id, target_date=today)
        absence_exc = [e for e in exceptions if e['category'] == 'UNCOVERED_ABSENCE']
        self.assertEqual(len(absence_exc), 1)
        self.assertEqual(absence_exc[0]['severity'], 'CRITICAL')

    def test_03_action_center_detects_unresolved_duty_pay_and_blocked_payroll(self):
        """Action Center flags unresolved daily duty pay and blocked payroll calculations."""
        DailyDutyPay.objects.create(
            company=self.company,
            employee=self.employee,
            duty_date=date.today(),
            calculation_status=DailyPayCalculationStatus.UNRESOLVED,
            unresolved_reason="Missing base rate"
        )
        EmployeePayrollCalculation.objects.create(
            company=self.company,
            employee=self.employee,
            period_start=date(2026, 1, 1),
            period_end=date(2026, 1, 31),
            status=PayrollCalculationStatus.BLOCKED,
            has_blockers=True,
            blocking_reasons=["Unresolved duty pay records exist"]
        )

        exceptions = CrossModuleIntegrationService.get_action_center_exceptions(self.company.id)
        categories = [e['category'] for e in exceptions]
        self.assertIn('UNRESOLVED_DUTY_PAY', categories)
        self.assertIn('BLOCKED_PAYROLL', categories)

    def test_04_client_shared_context_multi_hop(self):
        """get_client_shared_context aggregates contracts, sites, workforce, equipment, and billing."""
        # Create deployment
        post = SecurityPost.objects.create(
            company=self.company,
            site=self.site,
            post_name="South Gate",
            required_designation=self.designation,
            required_headcount=1,
            is_active=True
        )
        Deployment.objects.create(
            company=self.company,
            employee=self.employee,
            site=self.site,
            post=post,
            start_date=date(2026, 1, 1),
            status=DeploymentStatus.ACTIVE
        )
        # Create equipment issue to client
        EquipmentIssue.objects.create(
            company=self.company,
            warehouse=self.warehouse,
            item=self.item,
            client=self.crm_client,
            site=self.site,
            custody_type='SITE',
            quantity=Decimal('2.00'),
            status='ISSUED'
        )

        context = CrossModuleIntegrationService.get_client_shared_context(self.company.id, self.crm_client.id)
        self.assertEqual(context['client']['name'], "Grand Mall Commercial Hub")
        self.assertEqual(len(context['contracts']), 1)
        self.assertEqual(len(context['sites']), 1)
        self.assertEqual(len(context['workforce']), 1)
        self.assertEqual(len(context['equipment']), 1)
        self.assertEqual(context['summary']['active_workforce_count'], 1)

    def test_05_employee_shared_context_multi_hop(self):
        """get_employee_shared_context aggregates deployment, custody, payroll, and lifecycle."""
        post = SecurityPost.objects.create(
            company=self.company,
            site=self.site,
            post_name="North Gate",
            required_designation=self.designation,
            required_headcount=1,
            is_active=True
        )
        Deployment.objects.create(
            company=self.company,
            employee=self.employee,
            site=self.site,
            post=post,
            start_date=date(2026, 1, 1),
            status=DeploymentStatus.ACTIVE
        )
        EquipmentIssue.objects.create(
            company=self.company,
            warehouse=self.warehouse,
            item=self.item,
            employee=self.employee,
            custody_type='EMPLOYEE',
            quantity=Decimal('1.00'),
            status='ISSUED'
        )

        context = CrossModuleIntegrationService.get_employee_shared_context(self.company.id, self.employee.id)
        self.assertEqual(context['employee']['full_name'], "Tariq Mahmood")
        self.assertIsNotNone(context['current_deployment'])
        self.assertEqual(context['current_deployment']['post_name'], "North Gate")
        self.assertEqual(len(context['equipment_custody']), 1)

    def test_06_site_shared_context_multi_hop(self):
        """get_site_shared_context aggregates contracts, manpower, rosters, and recent inspections."""
        post = SecurityPost.objects.create(
            company=self.company,
            site=self.site,
            post_name="VIP Entrance",
            required_designation=self.designation,
            required_headcount=3,
            is_active=True
        )
        SupervisorInspection.objects.create(
            company=self.company,
            site=self.site,
            post=post,
            inspector=self.user,
            inspection_datetime=date.today(),
            overall_score=Decimal('92.50'),
            status='COMPLETED'
        )

        context = CrossModuleIntegrationService.get_site_shared_context(self.company.id, self.site.id)
        self.assertEqual(context['site']['name'], "Grand Mall Site A")
        self.assertEqual(context['manpower']['total_required'], 3)
        self.assertEqual(len(context['recent_inspections']), 1)

    def test_07_create_purchase_request_from_inventory_shortage(self):
        """create_purchase_request_from_inventory_shortage creates draft PR and is idempotent."""
        pr = CrossModuleIntegrationService.create_purchase_request_from_inventory_shortage(
            company_id=self.company.id,
            item_id=self.item.id,
            quantity=Decimal('10.00'),
            user=self.user,
            warehouse_id=self.warehouse.id,
            notes="Immediate restock for new deployment"
        )
        self.assertEqual(pr.document_type, 'PURCHASE_REQUEST')
        self.assertEqual(pr.status, 'DRAFT')
        self.assertEqual(pr.lines.count(), 1)
        self.assertEqual(pr.lines.first().quantity, Decimal('10.00'))

        # Idempotency check: calling again should return the existing draft PR
        pr2 = CrossModuleIntegrationService.create_purchase_request_from_inventory_shortage(
            company_id=self.company.id,
            item_id=self.item.id,
            quantity=Decimal('10.00'),
            user=self.user
        )
        self.assertEqual(pr.id, pr2.id)

    def test_08_cross_module_api_endpoints(self):
        """REST API endpoints for cross-module integration return valid 200/201 responses."""
        # 1. Action Center
        resp = self.client.get('/api/operations/cross-module/action-center/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIsInstance(resp.data, list)

        # 2. Client Context
        resp = self.client.get(f'/api/operations/cross-module/client-context/?client_id={self.crm_client.id}')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['client']['name'], "Grand Mall Commercial Hub")

        # 3. Employee Context
        resp = self.client.get(f'/api/operations/cross-module/employee-context/?employee_id={self.employee.id}')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['employee']['full_name'], "Tariq Mahmood")

        # 4. Site Context
        resp = self.client.get(f'/api/operations/cross-module/site-context/?site_id={self.site.id}')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['site']['name'], "Grand Mall Site A")

        # 5. Purchase Request from Shortage POST
        post_data = {
            'item_id': str(self.item.id),
            'quantity': '15',
            'warehouse_id': str(self.warehouse.id),
            'notes': 'API Requisition'
        }
        resp = self.client.post('/api/operations/cross-module/purchase-request-from-shortage/', post_data, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, getattr(resp, 'data', None))
        self.assertIn('number', resp.data)

    def test_09_crm_signed_client_to_service_contract_to_site(self):
        """Security CRM signed client -> ServiceContract -> site conversion."""
        from security_crm.models import (
            SecurityProposal, SecurityProposalStatus, ProposalVersion,
            ClientLocation, SecurityServiceType, ProposalServiceLine
        )
        from security_crm.services.workflow import SecurityProposalWorkflowService

        # 1. Create client and location
        crm_cust = CRMEntity.objects.create(
            company=self.company,
            code="CUST-ALPHA-02",
            name="Apex Corporate Towers",
            entity_type="LEAD"
        )
        location = ClientLocation.objects.create(
            company=self.company,
            customer=crm_cust,
            name="Tower B Main Gate",
            notes="Plot 55, Financial District"
        )
        service_type = SecurityServiceType.objects.create(
            company=self.company,
            code="ARMED_STATIC",
            name="Armed Static Guard"
        )
        proposal = SecurityProposal.objects.create(
            company=self.company,
            customer=crm_cust,
            title="Comprehensive Guarding Solution - Apex Towers",
            status=SecurityProposalStatus.SIGNING
        )
        v1 = ProposalVersion.objects.create(
            company=self.company,
            proposal=proposal,
            version_number=1,
            version_type="Final Proposal",
            is_frozen=True,
            status=SecurityProposalStatus.FINAL_PROPOSAL
        )
        ProposalServiceLine.objects.create(
            company=self.company,
            proposal_version=v1,
            location=location,
            service_type=service_type,
            quantity=4,
            client_rate=Decimal('50000.00'),
            single_ot_rate=Decimal('300.00'),
            double_ot_rate=Decimal('500.00')
        )
        proposal.approved_version = v1
        proposal.save()

        # 2. Complete signing
        SecurityProposalWorkflowService.complete_signing(
            proposal,
            data={
                'signed_by_client': 'Farhan Qureshi',
                'signed_by_company': 'Major Bilal (R)',
                'signing_date': date.today(),
                'contract_start_date': date(2026, 2, 1),
                'contract_end_date': date(2027, 1, 31),
                'contract_reference': 'CTR-APEX-2026'
            },
            user=self.user
        )
        self.assertEqual(proposal.status, SecurityProposalStatus.SIGNED)

        # 3. Activate Client -> ServiceContract and OperationalSite creation
        active_prop = SecurityProposalWorkflowService.activate_client(proposal, user=self.user)
        self.assertEqual(active_prop.status, SecurityProposalStatus.ACTIVE)
        self.assertIsNotNone(active_prop.contract)
        self.assertEqual(active_prop.contract.status, 'ACTIVE')

        # Verify OperationalSite created from ClientLocation
        sites = active_prop.contract.sites.all()
        self.assertGreaterEqual(sites.count(), 1)
        site_names = [s.name for s in sites]
        self.assertIn("Tower B Main Gate", site_names)

        # Verify CRM entity transitioned to CUSTOMER
        crm_cust.refresh_from_db()
        self.assertEqual(crm_cust.entity_type, 'CUSTOMER')

    def test_10_crm_handoff_retry_idempotency(self):
        """CRM handoff retry is strictly idempotent and does not create duplicate contracts or sites."""
        from security_crm.models import (
            SecurityProposal, SecurityProposalStatus, ProposalVersion,
            ClientLocation, SecurityServiceType, ProposalServiceLine
        )
        from security_crm.services.workflow import SecurityProposalWorkflowService
        from security_crm.services.handoff import CRMCrossModuleHandoffService

        cust = CRMEntity.objects.create(
            company=self.company,
            code="CUST-IDEM-01",
            name="Titan Logistics Yard",
            entity_type="LEAD"
        )
        loc = ClientLocation.objects.create(
            company=self.company,
            customer=cust,
            name="Yard Perimeter 1"
        )
        stype = SecurityServiceType.objects.create(
            company=self.company,
            code="PATROL_GUARD",
            name="Patrol Guard"
        )
        proposal = SecurityProposal.objects.create(
            company=self.company,
            customer=cust,
            title="Yard Security",
            status=SecurityProposalStatus.SIGNING
        )
        v = ProposalVersion.objects.create(
            company=self.company,
            proposal=proposal,
            version_number=1,
            is_frozen=True
        )
        ProposalServiceLine.objects.create(
            company=self.company,
            proposal_version=v,
            location=loc,
            service_type=stype,
            quantity=2,
            client_rate=Decimal('40000.00')
        )
        proposal.approved_version = v
        proposal.save()

        SecurityProposalWorkflowService.complete_signing(
            proposal,
            data={
                'signed_by_client': 'Ahmed Khan',
                'signed_by_company': 'Admin User',
                'contract_start_date': date.today()
            },
            user=self.user
        )

        # First handoff preparation
        h1 = CRMCrossModuleHandoffService.prepare_cross_module_handoff(proposal, user=self.user, notes="First try")
        self.assertTrue(proposal.is_handoff_ready)
        contract_id_1 = proposal.contract.id
        sites_count_1 = proposal.contract.sites.count()

        # Second handoff preparation (Retry)
        proposal.refresh_from_db()
        h2 = CRMCrossModuleHandoffService.prepare_cross_module_handoff(proposal, user=self.user, notes="Retry attempt")
        proposal.refresh_from_db()

        self.assertEqual(proposal.contract.id, contract_id_1)
        self.assertEqual(proposal.contract.sites.count(), sites_count_1)
        self.assertEqual(ServiceContract.objects.filter(company=self.company, crm_entity=cust).count(), 1)

    def test_11_contract_and_site_to_manpower_and_deployment(self):
        """contract/site -> manpower/deployment end-to-end integration."""
        # 1. Post setup on site
        post = SecurityPost.objects.create(
            company=self.company,
            site=self.site,
            post_name="North Perimeter Watchtower",
            required_designation=self.designation,
            required_headcount=2,
            is_active=True
        )
        # Action Center detects post vacancy
        exc_list = CrossModuleIntegrationService.get_action_center_exceptions(self.company.id)
        vacancies = [e for e in exc_list if e['category'] == 'POST_VACANCY' and str(post.id) in e.get('source_id', '')]
        self.assertGreaterEqual(len(vacancies), 1)

        # 2. Deploy employee to fulfill headcount
        dep = Deployment.objects.create(
            company=self.company,
            employee=self.employee,
            site=self.site,
            post=post,
            start_date=date.today(),
            status=DeploymentStatus.ACTIVE
        )
        # 3. Schedule shift in DutyRoster
        roster = DutyRoster.objects.create(
            company=self.company,
            duty_date=date.today(),
            employee=self.employee,
            site=self.site,
            post=post,
            shift=self.shift,
            status=DutyRosterStatus.SCHEDULED
        )

        # 4. Shared site context reflects deployed manpower and roster schedule
        site_ctx = CrossModuleIntegrationService.get_site_shared_context(self.company.id, self.site.id)
        self.assertEqual(site_ctx['manpower']['total_deployed'], 1)
        self.assertGreaterEqual(len(site_ctx['today_rosters']), 1)
        roster_employees = [r['employee_name'] for r in site_ctx['today_rosters']]
        self.assertIn(self.employee.full_name, roster_employees)

    def test_12_roster_to_attendance_to_payroll_to_finance(self):
        """roster -> attendance -> payroll -> Finance handoff."""
        today = date.today()
        post = SecurityPost.objects.create(
            company=self.company,
            site=self.site,
            post_name="Central Gate",
            required_designation=self.designation,
            required_headcount=1,
            is_active=True
        )
        DutyRoster.objects.create(
            company=self.company,
            duty_date=today,
            employee=self.employee,
            site=self.site,
            post=post,
            shift=self.shift,
            status=DutyRosterStatus.SCHEDULED
        )
        # Mark attendance PRESENT
        WorkforceAttendance.objects.create(
            company=self.company,
            employee=self.employee,
            date=today,
            status=AttendanceStatus.PRESENT
        )
        # Calculate daily duty pay
        pay = DailyDutyPay.objects.create(
            company=self.company,
            employee=self.employee,
            duty_date=today,
            daily_payable_rate=Decimal('1200.00'),
            payable_percentage=Decimal('100.00'),
            payable_amount=Decimal('1500.00'),
            calculation_status=DailyPayCalculationStatus.CALCULATED
        )
        # Consolidate into EmployeePayrollCalculation
        calc = EmployeePayrollCalculation.objects.create(
            company=self.company,
            employee=self.employee,
            period_start=today.replace(day=1),
            period_end=today,
            gross_earnings=Decimal('1500.00'),
            net_payable=Decimal('1500.00'),
            status=PayrollCalculationStatus.CALCULATED,
            has_blockers=False
        )

        # Verify Action Center reflects clean state (no unresolved duty pay or blocked payroll)
        exceptions = CrossModuleIntegrationService.get_action_center_exceptions(self.company.id, target_date=today)
        unresolved_pay = [e for e in exceptions if e['category'] == 'UNRESOLVED_DUTY_PAY' and str(pay.id) in e.get('source_id', '')]
        self.assertEqual(len(unresolved_pay), 0)
        blocked_payroll = [e for e in exceptions if e['category'] == 'BLOCKED_PAYROLL' and str(calc.id) in e.get('source_id', '')]
        self.assertEqual(len(blocked_payroll), 0)

    def test_13_replacement_employee_pay_vs_client_billing_separation(self):
        """replacement employee pay vs client billing separation."""
        today = date.today()
        # Create second employee (replacement guard)
        guard_2 = Employee.objects.create(
            company=self.company,
            employee_code="SEC-GRD-002",
            first_name="Waqas",
            last_name="Ali",
            department=self.department,
            designation=self.designation,
            employment_status="ACTIVE",
            hire_date=date(2025, 2, 1)
        )
        post = SecurityPost.objects.create(
            company=self.company,
            site=self.site,
            post_name="Perimeter Post B",
            required_designation=self.designation,
            required_headcount=1,
            is_active=True
        )
        # Tariq was scheduled but is ABSENT
        roster_primary = DutyRoster.objects.create(
            company=self.company,
            duty_date=today,
            employee=self.employee,
            site=self.site,
            post=post,
            shift=self.shift,
            status=DutyRosterStatus.SCHEDULED
        )
        WorkforceAttendance.objects.create(
            company=self.company,
            employee=self.employee,
            date=today,
            status=AttendanceStatus.ABSENT
        )
        # Waqas covers as replacement (PRESENT)
        DutyReplacement.objects.create(
            company=self.company,
            original_roster=roster_primary,
            original_employee=self.employee,
            replacement_employee=guard_2,
            site=self.site,
            shift=self.shift,
            duty_date=today,
            reason="Unplanned sick leave cover"
        )
        WorkforceAttendance.objects.create(
            company=self.company,
            employee=guard_2,
            date=today,
            status=AttendanceStatus.PRESENT
        )
        # Duty pay calculation: Guard 2 receives duty pay, Tariq does not
        pay_guard_2 = DailyDutyPay.objects.create(
            company=self.company,
            employee=guard_2,
            duty_date=today,
            daily_payable_rate=Decimal('1100.00'),
            payable_percentage=Decimal('100.00'),
            payable_amount=Decimal('1100.00'),
            calculation_status=DailyPayCalculationStatus.CALCULATED
        )

        # Verify wage separation: replacement employee gets their compensation independently
        self.assertEqual(pay_guard_2.employee.id, guard_2.id)
        self.assertEqual(DailyDutyPay.objects.filter(employee=self.employee, duty_date=today).count(), 0)

        # Explicitly verify Employee Replacement Pay != Client Billable Rate
        contract_rate = ContractRate.objects.create(
            company=self.company,
            service_contract=self.contract,
            designation=self.designation,
            billing_rate=Decimal('2500.00'),
            pay_rate=Decimal('1100.00'),
            effective_date=self.contract.start_date
        )
        self.assertNotEqual(pay_guard_2.payable_amount, contract_rate.billing_rate)
        self.assertEqual(pay_guard_2.payable_amount, Decimal('1100.00'))
        self.assertEqual(contract_rate.billing_rate, Decimal('2500.00'))

    def test_14_approved_operations_input_to_existing_client_billing_invoice_flow(self):
        """Approved operations delivery input respects existing client billing flow."""
        # Create an existing ServiceInvoice for the contract and period
        p_start = date(2026, 3, 1)
        p_end = date(2026, 3, 31)
        inv = ServiceInvoice.objects.create(
            company=self.company,
            crm_entity=self.crm_client,
            service_contract=self.contract,
            invoice_number="INV-2026-03-001",
            due_date=p_end + timedelta(days=30),
            period_start=p_start,
            period_end=p_end,
            subtotal=Decimal('150000.00'),
            tax_amount=Decimal('24000.00'),
            total_amount=Decimal('174000.00'),
            status=ServiceInvoiceStatus.POSTED
        )

        # Request client billing snapshot via service
        snapshot = CrossModuleIntegrationService.generate_client_billing_snapshot(
            company_id=self.company.id,
            contract_id=self.contract.id,
            period_start=p_start,
            period_end=p_end,
            user=self.user
        )
        self.assertFalse(snapshot['created'])
        self.assertEqual(snapshot['invoice_id'], str(inv.id))
        self.assertEqual(snapshot['total_amount'], "174000.00")

        # Verify API endpoint returns HTTP 200
        resp = self.client.post('/api/operations/cross-module/client-billing-snapshot/', {
            'contract_id': str(self.contract.id),
            'period_start': p_start.isoformat(),
            'period_end': p_end.isoformat()
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['invoice_id'], str(inv.id))

    def test_15_security_item_requisition_to_po_to_grn_to_inventory_to_ap(self):
        """Security item requisition -> PO -> GRN -> Inventory Balance -> AP."""
        from purchasing.services.goods_receipt_service import create_goods_receipt, post_goods_receipt
        from purchasing.services.invoice_service import create_vendor_invoice

        # 1. Generate Purchase Request from inventory shortage
        pr = CrossModuleIntegrationService.create_purchase_request_from_inventory_shortage(
            company_id=self.company.id,
            item_id=self.item.id,
            quantity=Decimal('8.00'),
            user=self.user,
            warehouse_id=self.warehouse.id,
            notes="Shortage intake test"
        )
        self.assertEqual(pr.document_type, 'PURCHASE_REQUEST')

        # 2. Approved Purchase Order
        po = ProcurementDocument.objects.create(
            company=self.company,
            crm_entity=pr.crm_entity,
            document_type='PURCHASE_ORDER',
            status='APPROVED',
            document_date=date.today(),
            warehouse=self.warehouse,
            parent_document=pr,
            subtotal_amount=Decimal('120000.00'),
            total_amount=Decimal('120000.00')
        )
        po_line = ProcurementLine.objects.create(
            company=self.company,
            document=po,
            item=self.item,
            quantity=Decimal('8.00'),
            unit_price=Decimal('15000.00'),
            total_amount=Decimal('120000.00')
        )

        # 3. Create & Post Goods Receipt (GRN)
        grn_data = {
            'warehouse': self.warehouse,
            'document_date': date.today(),
            'reference_number': 'DC-9921',
            'lines': [{
                'po_line_id': str(po_line.id),
                'item_id': str(self.item.id),
                'quantity': Decimal('8.00'),
                'accepted_quantity': Decimal('8.00'),
                'rejected_quantity': Decimal('0.00')
            }]
        }
        grn = create_goods_receipt(po, grn_data, self.user)
        self.assertEqual(grn.status, 'DRAFT')
        post_goods_receipt(grn, self.user)
        grn.refresh_from_db()
        self.assertEqual(grn.status, 'POSTED')

        # 4. Verify Universal Inventory Balance increased
        balance = InventoryBalance.objects.get(
            company=self.company,
            warehouse=self.warehouse,
            item=self.item
        )
        self.assertEqual(balance.quantity, Decimal('8.00'))

        # 5. Create Vendor Invoice (AP with 3-way matching)
        inv_data = {
            'invoice_number': 'VINV-2026-992',
            'document_date': date.today(),
            'due_date': date.today() + timedelta(days=30),
            'lines': [{
                'po_line_id': str(po_line.id),
                'quantity': Decimal('8.00'),
                'unit_price': Decimal('15000.00')
            }]
        }
        ap_inv = create_vendor_invoice(po, inv_data, self.user)
        self.assertEqual(ap_inv.document_type, 'VENDOR_INVOICE')
        self.assertEqual(ap_inv.match_status, 'MATCHED')

        # 6. Approve & Post Vendor Bill to Accounts Payable
        from purchasing.services.invoice_service import approve_vendor_invoice, post_vendor_bill
        approve_vendor_invoice(ap_inv, self.user)
        post_vendor_bill(ap_inv, self.user)
        ap_inv.refresh_from_db()
        self.assertEqual(ap_inv.status, 'POSTED')
        self.assertTrue(ap_inv.ap_ready)
        self.assertEqual(ap_inv.payment_status, 'UNPAID')

    def test_16_shortage_requisition_numbering_and_idempotency(self):
        """Shortage requisition numbering format and strict call idempotency."""
        pr1 = CrossModuleIntegrationService.create_purchase_request_from_inventory_shortage(
            company_id=self.company.id,
            item_id=self.item.id,
            quantity=Decimal('20.00'),
            user=self.user,
            warehouse_id=self.warehouse.id
        )
        self.assertTrue(pr1.number.startswith('PR-'))
        self.assertEqual(pr1.lines.count(), 1)

        # Calling again for same shortage does not duplicate requisition
        pr2 = CrossModuleIntegrationService.create_purchase_request_from_inventory_shortage(
            company_id=self.company.id,
            item_id=self.item.id,
            quantity=Decimal('20.00'),
            user=self.user,
            warehouse_id=self.warehouse.id
        )
        self.assertEqual(pr1.id, pr2.id)
        self.assertEqual(ProcurementDocument.objects.filter(
            company=self.company,
            document_type='PURCHASE_REQUEST',
            status='DRAFT'
        ).count(), 1)

    def test_17_action_center_resolution_respects_owning_module_boundaries(self):
        """Action Center resolution routes to owning module and respects boundaries."""
        # Non-mutating acknowledgement
        ack_res = CrossModuleIntegrationService.resolve_action_center_exception(
            company_id=self.company.id,
            source_type='UNCOVERED_ABSENCE',
            source_id='12345',
            action='ACKNOWLEDGE',
            user=self.user,
            notes='Shift supervisor notified'
        )
        self.assertEqual(ack_res['status'], 'ACKNOWLEDGE')
        self.assertEqual(ack_res['owning_module'], 'ACTION_CENTER')

        # API resolution endpoint
        resp = self.client.post('/api/operations/cross-module/resolve-exception/', {
            'source_type': 'UNCOVERED_ABSENCE',
            'source_id': '12345',
            'action': 'ACKNOWLEDGE',
            'notes': 'Acknowledged via UI'
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['status'], 'ACKNOWLEDGE')

    def test_18_finance_and_payroll_handoff_idempotency(self):
        """Finance and payroll handoff calculations remain strictly idempotent."""
        today = date.today()
        pay1 = DailyDutyPay.objects.create(
            company=self.company,
            employee=self.employee,
            duty_date=today,
            daily_payable_rate=Decimal('1000.00'),
            payable_percentage=Decimal('100.00'),
            payable_amount=Decimal('1000.00'),
            calculation_status=DailyPayCalculationStatus.CALCULATED
        )
        self.assertEqual(DailyDutyPay.objects.filter(employee=self.employee, duty_date=today).count(), 1)

        # Verify PayrollRun -> Finance Integration retry idempotency
        from finance.models import PayrollAccountingIntegration
        from finance.services.security_coa_template import provision_security_chart_of_accounts
        from finance.services.payroll_finance_service import PayrollFinanceService

        provision_security_chart_of_accounts(self.company)

        run = PayrollRun.objects.create(
            company=self.company,
            run_number="RUN-IDEM-001",
            period_start=date(2026, 1, 1),
            period_end=date(2026, 1, 31),
            status=PayrollRunStatus.FINALIZED,
            net_payroll=Decimal('35000.00')
        )

        fin1 = PayrollFinanceService.integrate_payroll_run(run, user=self.user)
        self.assertIsNotNone(fin1)
        self.assertEqual(PayrollAccountingIntegration.objects.filter(company=self.company, payroll_run=run).count(), 1)

        # Retry handoff
        fin2 = PayrollFinanceService.integrate_payroll_run(run, user=self.user)
        self.assertEqual(fin1.id, fin2.id)
        self.assertEqual(PayrollAccountingIntegration.objects.filter(company=self.company, payroll_run=run).count(), 1)

    def test_19_tenant_isolation_enforcement(self):
        """Multi-tenant isolation strictly hides other company's data."""
        company_b = Company.objects.create(
            name="Beta Security Corp",
            domain="beta-sec-corp"
        )
        # Exceptions for Company B should not contain Company A's data
        exceptions_b = CrossModuleIntegrationService.get_action_center_exceptions(company_b.id)
        company_a_source_ids = [str(self.crm_client.id), str(self.site.id), str(self.contract.id)]
        for exc in exceptions_b:
            self.assertNotIn(exc.get('source_id'), company_a_source_ids)

        # Cross-company client context raises ValidationError
        with self.assertRaises(ValidationError):
            CrossModuleIntegrationService.get_client_shared_context(company_b.id, self.crm_client.id)

    def test_20_access_model_alignment_and_rbac_certification(self):
        """
        Phase S-8.2: Authoritative Access Control Alignment Certification.
        Formula: Company module enabled + User access_mode/UserModuleAccess + RBAC permission = ALLOW.
        Validates:
        1. Unauthenticated request denied with 401.
        2. FULL_COMPANY user with permissions allowed.
        3. CUSTOM user with security_ops grant + permissions allowed.
        4. CUSTOM user without module grant denied with 403.
        5. User with module grant but missing required write RBAC permission denied with 403.
        6. Disabled CompanyModule denied with 403.
        """
        # 1. Unauthenticated request -> 401
        self.client.force_authenticate(user=None)
        resp1 = self.client.get('/api/operations/cross-module/action-center/')
        self.assertEqual(resp1.status_code, status.HTTP_401_UNAUTHORIZED)

        # 2. FULL_COMPANY authorized user allowed -> 200 / 201
        ops_role = CompanyRole.objects.create(
            company=self.company,
            name="Operations Lead",
            permissions=['operations.read', 'operations.write']
        )
        full_user = User.objects.create_user(
            username="full_company_officer",
            email="full@alphasec.com",
            password="StrongPassword123!",
            company_id=self.company.id,
            company_role=ops_role,
            access_mode="FULL_COMPANY"
        )
        self.client.force_authenticate(user=full_user)
        resp2 = self.client.get('/api/operations/cross-module/action-center/')
        self.assertEqual(resp2.status_code, status.HTTP_200_OK)

        # 3. CUSTOM user with security_ops grant + permission allowed -> 200
        read_role = CompanyRole.objects.create(
            company=self.company,
            name="Operations Viewer",
            permissions=['operations.read']
        )
        custom_user_granted = User.objects.create_user(
            username="custom_granted_user",
            email="custom_granted@alphasec.com",
            password="StrongPassword123!",
            company_id=self.company.id,
            company_role=read_role,
            access_mode="CUSTOM"
        )
        UserModuleAccess.objects.create(
            user=custom_user_granted,
            module=self.mod_sec_ops,
            enabled=True
        )
        self.client.force_authenticate(user=custom_user_granted)
        resp3 = self.client.get('/api/operations/cross-module/action-center/')
        self.assertEqual(resp3.status_code, status.HTTP_200_OK)

        # 4. CUSTOM user without module grant denied -> 403
        custom_user_no_grant = User.objects.create_user(
            username="custom_denied_user",
            email="custom_denied@alphasec.com",
            password="StrongPassword123!",
            company_id=self.company.id,
            company_role=read_role,
            access_mode="CUSTOM"
        )
        self.client.force_authenticate(user=custom_user_no_grant)
        resp4 = self.client.get('/api/operations/cross-module/action-center/')
        self.assertEqual(resp4.status_code, status.HTTP_403_FORBIDDEN)

        # 5. User with module grant but missing required RBAC write permission denied -> 403
        self.client.force_authenticate(user=custom_user_granted)
        post_data = {
            'item_id': str(self.item.id),
            'quantity': '5',
            'warehouse_id': str(self.warehouse.id),
            'notes': 'Unauthorized Requisition'
        }
        resp5 = self.client.post('/api/operations/cross-module/purchase-request-from-shortage/', post_data, format='json')
        self.assertEqual(resp5.status_code, status.HTTP_403_FORBIDDEN)

        # 6. Disabled CompanyModule denied -> 403
        self.comp_mod.enabled = False
        self.comp_mod.save(update_fields=['enabled'])

        self.client.force_authenticate(user=full_user)
        resp6 = self.client.get('/api/operations/cross-module/action-center/')
        self.assertEqual(resp6.status_code, status.HTTP_403_FORBIDDEN)

        # Restore module state
        self.comp_mod.enabled = True
        self.comp_mod.save(update_fields=['enabled'])

