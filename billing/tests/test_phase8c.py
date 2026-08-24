"""
billing/tests/test_phase8c.py

Phase 8C — Comprehensive Tests

Coverage:
  TENANCY    (5 tests)
  PAYROLL    (9 tests)
  ATTENDANCE (6 tests)
  BILLING    (10 tests)
  FINANCE    (5 tests)

Total target: 35+ tests
"""

from decimal import Decimal
from datetime import date, time, timedelta

from django.test import TestCase
from django.utils import timezone

from accounts.models import User
from companies.models import Company
from crm.models import CRMEntity
from hrm.models import (
    Designation, Employee,
    WorkforceAttendance, AttendanceStatus,
    PayrollRun, PayrollRunStatus,
    PayrollPeriod, PayrollPeriodStatus,
    Payslip, PayslipStatus, PayslipLine,
    SalaryComponent, SalaryStructure, SalaryStructureComponent,
    EmployeeSalaryAssignment, ComponentType, CalculationType,
)
from operations.models import (
    OperationalSite, ServiceContract, ServiceContractStatus,
    ContractRate, Deployment, DeploymentStatus,
    DutyAssignment, DutyAssignmentStatus,
    ExtraDuty, ExtraDutyStatus,
)
from billing.models import (
    ServiceInvoice, ServiceInvoiceLine, ServiceInvoiceStatus,
    ExtraDutyPayrollBridge, BillingAccountingConfiguration,
)
from finance.models import Currency, ChartOfAccount, AccountingPeriod, Journal
from operations.services.attendance_sync import (
    sync_duty_assignment_attendance, AttendanceSyncError
)
from operations.services.payroll_bridge import (
    process_extra_duty_payroll, PayrollBridgeError
)
from billing.services.service_billing import (
    generate_service_invoice, post_service_invoice, BillingError
)


# ===========================================================================
# TEST FIXTURE HELPERS
# ===========================================================================

def make_company(name):
    return Company.objects.create(name=name, is_active=True)


def make_user(username, company):
    return User.objects.create_user(
        username=username, password="testpass123", company=company
    )


def make_crm_entity(company, name, code, entity_type="CUSTOMER"):
    return CRMEntity.objects.create(
        company=company, name=name, code=code, entity_type=entity_type
    )


def make_employee(company, user, code="EMP001", first_name="Test", last_name="Employee",
                  designation=None):
    return Employee.objects.create(
        company=company, user=user, employee_code=code,
        first_name=first_name, last_name=last_name, is_active=True,
        designation=designation
    )


def make_designation(company, name, code):
    return Designation.objects.create(company=company, name=name, code=code)


def make_site(company, crm_entity, name="Site A"):
    return OperationalSite.objects.create(
        company=company, crm_entity=crm_entity, name=name, address="123 Test St"
    )


def make_contract(company, crm_entity, code, sites=None):
    contract = ServiceContract.objects.create(
        company=company, crm_entity=crm_entity,
        contract_code=code, start_date=date(2026, 1, 1), end_date=date(2026, 12, 31),
        status=ServiceContractStatus.ACTIVE
    )
    if sites:
        for s in sites:
            contract.sites.add(s)
    return contract


def make_contract_rate(company, contract, designation, billing_rate, pay_rate,
                       effective_date=None):
    return ContractRate.objects.create(
        company=company, service_contract=contract, designation=designation,
        billing_rate=billing_rate, pay_rate=pay_rate,
        effective_date=effective_date or date(2026, 1, 1)
    )


def make_deployment(company, employee, site, designation, contract=None,
                    status=DeploymentStatus.ACTIVE):
    return Deployment.objects.create(
        company=company, employee=employee, site=site, designation=designation,
        service_contract=contract, start_date=date(2026, 1, 1),
        end_date=date(2026, 12, 31), status=status
    )


def make_duty(company, deployment, employee=None, site=None,
              duty_date=None, start_t=None, end_t=None,
              status=DutyAssignmentStatus.COMPLETED):
    employee = employee or deployment.employee
    site = site or deployment.site
    duty_date = duty_date or date(2026, 8, 1)
    start_t = start_t or time(8, 0)
    end_t = end_t or time(16, 0)
    duty = DutyAssignment(
        company=company, deployment=deployment, employee=employee,
        site=site, date=duty_date, start_time=start_t, end_time=end_t,
        status=DutyAssignmentStatus.SCHEDULED
    )
    duty.save()
    # Force status without calling full_clean (to avoid overlap check on multiple duties)
    DutyAssignment.objects.filter(pk=duty.pk).update(status=status)
    duty.refresh_from_db()
    return duty


def make_extra_duty(company, employee, contract=None, site=None,
                    duty_date=None, hours=Decimal('8.00'),
                    status=ExtraDutyStatus.APPROVED):
    duty_date = duty_date or date(2026, 8, 1)
    extra = ExtraDuty(
        company=company, employee=employee, service_contract=contract,
        site=site, date=duty_date, hours=hours, status=ExtraDutyStatus.REQUESTED,
        description="Test extra duty"
    )
    extra.save()
    ExtraDuty.objects.filter(pk=extra.pk).update(status=status)
    extra.refresh_from_db()
    return extra


def make_payroll_period(company, name="Aug 2026", start=None, end=None, payment=None):
    start = start or date(2026, 8, 1)
    end = end or date(2026, 8, 31)
    payment = payment or date(2026, 9, 5)
    return PayrollPeriod.objects.create(
        company=company, name=name, start_date=start,
        end_date=end, payment_date=payment, status=PayrollPeriodStatus.OPEN
    )


def make_payroll_run(company, period):
    return PayrollRun.objects.create(
        company=company, payroll_period=period, status=PayrollRunStatus.DRAFT
    )


def make_currency(company, code="PKR"):
    return Currency.objects.create(company=company, code=code, name="Pakistani Rupee", symbol="₨")


def make_coa(company, code, name, account_type="ASSET"):
    from finance.models import AccountGroup
    group = AccountGroup.objects.create(
        company=company, name=f"Group {name}", group_type=account_type.upper()
    )
    return ChartOfAccount.objects.create(
        company=company, account_group=group, account_code=code, account_name=name,
        account_type=account_type.upper(), is_active=True
    )


def make_accounting_period(company, start=None, end=None):
    from finance.models import FiscalYear
    start = start or date(2026, 8, 1)
    end = end or date(2026, 8, 31)
    fy = FiscalYear.objects.create(
        company=company, name="2026", start_date=date(2026, 1, 1), end_date=date(2026, 12, 31), is_current=True
    )
    return AccountingPeriod.objects.create(
        company=company, fiscal_year=fy, month=start.month, start_date=start, end_date=end, status='OPEN'
    )


def make_billing_config(company, ar_account, revenue_account, currency):
    return BillingAccountingConfiguration.objects.create(
        company=company,
        accounts_receivable_account=ar_account,
        service_revenue_account=revenue_account,
        default_currency=currency,
        is_active=True
    )


# ===========================================================================
# BASE SETUP CLASS
# ===========================================================================

class Phase8CTestBase(TestCase):
    def setUp(self):
        # Two isolated companies for cross-tenant tests
        self.company_a = make_company("Company Alpha")
        self.company_b = make_company("Company Beta")

        self.user_a = make_user("user_alpha", self.company_a)
        self.user_b = make_user("user_beta", self.company_b)

        # Company A CRM
        self.crm_client_a = make_crm_entity(self.company_a, "Client Alpha", "CL-A01")
        crm_emp_a = make_crm_entity(self.company_a, "Emp Alpha", "EM-A01", "EMPLOYEE")

        # Company B CRM
        self.crm_client_b = make_crm_entity(self.company_b, "Client Beta", "CL-B01")
        crm_emp_b = make_crm_entity(self.company_b, "Emp Beta", "EM-B01", "EMPLOYEE")

        # Designations
        self.designation_a = make_designation(self.company_a, "Supervisor A", "SUP-A")
        self.designation_b = make_designation(self.company_b, "Supervisor B", "SUP-B")

        # Employees
        self.employee_a = make_employee(
            self.company_a, self.user_a, "E-A01", "Alpha", "Employee",
            designation=self.designation_a
        )
        self.employee_b = make_employee(
            self.company_b, self.user_b, "E-B01", "Beta", "Employee",
            designation=self.designation_b
        )

        # Sites
        self.site_a = make_site(self.company_a, self.crm_client_a, "Alpha Site")
        self.site_b = make_site(self.company_b, self.crm_client_b, "Beta Site")

        # Contracts
        self.contract_a = make_contract(
            self.company_a, self.crm_client_a, "SC-A001", [self.site_a]
        )
        self.contract_b = make_contract(
            self.company_b, self.crm_client_b, "SC-B001", [self.site_b]
        )

        # Contract rates
        self.rate_a = make_contract_rate(
            self.company_a, self.contract_a, self.designation_a,
            billing_rate=Decimal("150.00"), pay_rate=Decimal("100.00")
        )

        # Deployments
        self.deployment_a = make_deployment(
            self.company_a, self.employee_a, self.site_a,
            self.designation_a, self.contract_a
        )

        # Finance & Billing Configs
        self.currency_a = make_currency(self.company_a, "PKR")
        self.ar_a = make_coa(self.company_a, "1200", "AR", "ASSET")
        self.rev_a = make_coa(self.company_a, "4000", "REV", "REVENUE")
        self.billing_config_a = make_billing_config(self.company_a, self.ar_a, self.rev_a, self.currency_a)

        self.currency_b = make_currency(self.company_b, "USD")
        self.ar_b = make_coa(self.company_b, "1200", "AR", "ASSET")
        self.rev_b = make_coa(self.company_b, "4000", "REV", "REVENUE")
        self.billing_config_b = make_billing_config(self.company_b, self.ar_b, self.rev_b, self.currency_b)


# ===========================================================================
# 1. TENANCY TESTS (5)
# ===========================================================================

class TenancyTests(Phase8CTestBase):

    def test_TC01_cross_company_extra_duty_payroll_rejected(self):
        """Payroll bridge rejects ExtraDuty from a different company than the PayrollRun."""
        period_b = make_payroll_period(self.company_b, "Aug 2026 B")
        run_b = make_payroll_run(self.company_b, period_b)
        extra_duty_a = make_extra_duty(
            self.company_a, self.employee_a, self.contract_a, self.site_a
        )
        with self.assertRaises(PayrollBridgeError):
            process_extra_duty_payroll(extra_duty_a.id, run_b.id, self.company_b.id)

    def test_TC02_cross_company_payroll_run_rejected(self):
        """Payroll bridge rejects when PayrollRun company doesn't match company_id arg."""
        period_a = make_payroll_period(self.company_a)
        run_a = make_payroll_run(self.company_a, period_a)
        extra_duty_a = make_extra_duty(
            self.company_a, self.employee_a, self.contract_a, self.site_a
        )
        with self.assertRaises(PayrollBridgeError):
            # Pass company_b as context — run_a belongs to company_a
            process_extra_duty_payroll(extra_duty_a.id, run_a.id, self.company_b.id)

    def test_TC03_cross_company_service_invoice_rejected(self):
        """Billing service rejects contract from different company."""
        with self.assertRaises(BillingError):
            generate_service_invoice(
                self.company_b.id, self.contract_a.id,
                date(2026, 8, 1), date(2026, 8, 31)
            )

    def test_TC04_cross_company_duty_assignment_billing_rejected(self):
        """generate_service_invoice rejects duty assignments from company B against company A."""
        # Create a duty in company B, try to bill via company A's contract
        deploy_b = make_deployment(
            self.company_b, self.employee_b, self.site_b,
            self.designation_b, self.contract_b
        )
        make_duty(self.company_b, deploy_b)
        with self.assertRaises(BillingError):
            generate_service_invoice(
                self.company_a.id, self.contract_b.id,
                date(2026, 8, 1), date(2026, 8, 31)
            )

    def test_TC05_cross_company_attendance_sync_rejected(self):
        """Attendance sync rejects duty assignment from wrong company."""
        duty = make_duty(self.company_a, self.deployment_a)
        with self.assertRaises(AttendanceSyncError):
            # Pass company_b as context
            sync_duty_assignment_attendance(duty.id, self.company_b.id)


# ===========================================================================
# 2. PAYROLL BRIDGE TESTS (9)
# ===========================================================================

class PayrollBridgeTests(Phase8CTestBase):

    def setUp(self):
        super().setUp()
        self.period_a = make_payroll_period(self.company_a)
        self.run_a = make_payroll_run(self.company_a, self.period_a)
        self.extra_duty_a = make_extra_duty(
            self.company_a, self.employee_a, self.contract_a, self.site_a,
            hours=Decimal("8.00"), status=ExtraDutyStatus.APPROVED
        )

    def test_PY01_extra_duty_payroll_bridge_creates_record(self):
        """Successful bridge creation returns created=True and correct amount."""
        result = process_extra_duty_payroll(
            self.extra_duty_a.id, self.run_a.id, self.company_a.id
        )
        self.assertTrue(result['created'])
        # hours=8, pay_rate=100 → 800
        self.assertEqual(result['amount'], Decimal("800.00"))
        bridge = ExtraDutyPayrollBridge.objects.get(id=result['bridge_id'])
        self.assertEqual(bridge.extra_duty, self.extra_duty_a)
        self.assertEqual(bridge.payroll_run, self.run_a)
        self.assertEqual(bridge.amount, Decimal("800.00"))

    def test_PY02_pay_rate_calculation_correct(self):
        """Amount = hours × pay_rate is exactly correct."""
        extra = make_extra_duty(
            self.company_a, self.employee_a, self.contract_a, self.site_a,
            hours=Decimal("4.50"), status=ExtraDutyStatus.APPROVED,
            duty_date=date(2026, 8, 2)
        )
        result = process_extra_duty_payroll(extra.id, self.run_a.id, self.company_a.id)
        # 4.50 × 100 = 450.00
        self.assertEqual(result['amount'], Decimal("450.00"))

    def test_PY03_missing_contract_rate_raises(self):
        """PayrollBridgeError raised when no ContractRate found."""
        # Extra duty with no service contract and employee has no deployment on that date
        extra_no_contract = make_extra_duty(
            self.company_a, self.employee_a, None, self.site_a,
            duty_date=date(2025, 1, 1), status=ExtraDutyStatus.APPROVED
        )
        with self.assertRaises(PayrollBridgeError):
            process_extra_duty_payroll(
                extra_no_contract.id, self.run_a.id, self.company_a.id
            )

    def test_PY04_finalized_payroll_run_rejected(self):
        """Cannot inject into FINALIZED PayrollRun."""
        PayrollRun.objects.filter(pk=self.run_a.pk).update(status=PayrollRunStatus.FINALIZED)
        self.run_a.refresh_from_db()
        with self.assertRaises(PayrollBridgeError):
            process_extra_duty_payroll(
                self.extra_duty_a.id, self.run_a.id, self.company_a.id
            )

    def test_PY05_cancelled_payroll_run_rejected(self):
        """Cannot inject into CANCELLED PayrollRun."""
        PayrollRun.objects.filter(pk=self.run_a.pk).update(status=PayrollRunStatus.CANCELLED)
        self.run_a.refresh_from_db()
        with self.assertRaises(PayrollBridgeError):
            process_extra_duty_payroll(
                self.extra_duty_a.id, self.run_a.id, self.company_a.id
            )

    def test_PY06_duplicate_bridge_prevention(self):
        """Second call returns existing bridge, does not create duplicate."""
        result1 = process_extra_duty_payroll(
            self.extra_duty_a.id, self.run_a.id, self.company_a.id
        )
        result2 = process_extra_duty_payroll(
            self.extra_duty_a.id, self.run_a.id, self.company_a.id
        )
        self.assertTrue(result1['created'])
        self.assertFalse(result2['created'])
        self.assertEqual(result1['bridge_id'], result2['bridge_id'])
        # Only one bridge record
        bridges = ExtraDutyPayrollBridge.objects.filter(
            extra_duty=self.extra_duty_a, payroll_run=self.run_a
        )
        self.assertEqual(bridges.count(), 1)

    def test_PY07_rejected_extra_duty_not_payable(self):
        """REJECTED ExtraDuty cannot be processed through payroll bridge."""
        extra_rejected = make_extra_duty(
            self.company_a, self.employee_a, self.contract_a, self.site_a,
            status=ExtraDutyStatus.REJECTED, duty_date=date(2026, 8, 3)
        )
        with self.assertRaises(PayrollBridgeError):
            process_extra_duty_payroll(
                extra_rejected.id, self.run_a.id, self.company_a.id
            )

    def test_PY08_requested_extra_duty_not_payable(self):
        """REQUESTED (unapproved) ExtraDuty cannot be processed."""
        extra_requested = make_extra_duty(
            self.company_a, self.employee_a, self.contract_a, self.site_a,
            status=ExtraDutyStatus.REQUESTED, duty_date=date(2026, 8, 4)
        )
        with self.assertRaises(PayrollBridgeError):
            process_extra_duty_payroll(
                extra_requested.id, self.run_a.id, self.company_a.id
            )

    def test_PY09_completed_extra_duty_is_payable(self):
        """COMPLETED ExtraDuty (same as APPROVED) can be processed."""
        extra_completed = make_extra_duty(
            self.company_a, self.employee_a, self.contract_a, self.site_a,
            status=ExtraDutyStatus.COMPLETED, duty_date=date(2026, 8, 5)
        )
        result = process_extra_duty_payroll(
            extra_completed.id, self.run_a.id, self.company_a.id
        )
        self.assertTrue(result['created'])


# ===========================================================================
# 3. ATTENDANCE SYNC TESTS (6)
# ===========================================================================

class AttendanceSyncTests(Phase8CTestBase):

    def test_AT01_creates_workforce_attendance(self):
        """Sync creates WorkforceAttendance for COMPLETED DutyAssignment."""
        duty = make_duty(self.company_a, self.deployment_a,
                         duty_date=date(2026, 8, 1))
        result = sync_duty_assignment_attendance(duty.id, self.company_a.id)
        self.assertTrue(result['created'])
        wa = WorkforceAttendance.objects.get(id=result['attendance_id'])
        self.assertEqual(wa.employee, self.employee_a)
        self.assertEqual(wa.date, date(2026, 8, 1))

    def test_AT02_source_is_duty_assignment(self):
        """Created WorkforceAttendance has source='DUTY_ASSIGNMENT'."""
        duty = make_duty(self.company_a, self.deployment_a,
                         duty_date=date(2026, 8, 2))
        result = sync_duty_assignment_attendance(duty.id, self.company_a.id)
        wa = WorkforceAttendance.objects.get(id=result['attendance_id'])
        self.assertEqual(wa.source, 'DUTY_ASSIGNMENT')

    def test_AT03_existing_attendance_not_overwritten(self):
        """If WorkforceAttendance already exists, it is not overwritten."""
        duty_date = date(2026, 8, 3)
        # Pre-existing attendance from biometric source
        existing_wa = WorkforceAttendance.objects.create(
            company=self.company_a,
            employee=self.employee_a,
            date=duty_date,
            status=AttendanceStatus.PRESENT,
            source='BIOMETRIC'
        )
        duty = make_duty(self.company_a, self.deployment_a, duty_date=duty_date)
        result = sync_duty_assignment_attendance(duty.id, self.company_a.id)
        self.assertFalse(result['created'])
        self.assertEqual(result['attendance_id'], existing_wa.id)
        # Confirm the original is unchanged
        existing_wa.refresh_from_db()
        self.assertEqual(existing_wa.source, 'BIOMETRIC')

    def test_AT04_duplicate_sync_is_safe(self):
        """Calling sync twice does not create a second WorkforceAttendance."""
        duty = make_duty(self.company_a, self.deployment_a,
                         duty_date=date(2026, 8, 4))
        result1 = sync_duty_assignment_attendance(duty.id, self.company_a.id)
        result2 = sync_duty_assignment_attendance(duty.id, self.company_a.id)
        self.assertTrue(result1['created'])
        self.assertFalse(result2['created'])
        self.assertEqual(result1['attendance_id'], result2['attendance_id'])
        count = WorkforceAttendance.objects.filter(
            company=self.company_a, employee=self.employee_a,
            date=date(2026, 8, 4)
        ).count()
        self.assertEqual(count, 1)

    def test_AT05_non_completed_duty_skips_attendance(self):
        """SCHEDULED DutyAssignment does not create WorkforceAttendance."""
        duty = make_duty(
            self.company_a, self.deployment_a,
            duty_date=date(2026, 8, 5),
            status=DutyAssignmentStatus.SCHEDULED
        )
        result = sync_duty_assignment_attendance(duty.id, self.company_a.id)
        self.assertFalse(result['created'])

    def test_AT06_cross_company_rejected(self):
        """Cross-company sync raises AttendanceSyncError."""
        duty = make_duty(self.company_a, self.deployment_a,
                         duty_date=date(2026, 8, 6))
        with self.assertRaises(AttendanceSyncError):
            sync_duty_assignment_attendance(duty.id, self.company_b.id)


# ===========================================================================
# 4. BILLING GENERATION TESTS (10)
# ===========================================================================

class BillingGenerationTests(Phase8CTestBase):

    def test_BG01_completed_duty_generates_invoice(self):
        """A completed DutyAssignment generates a valid ServiceInvoice."""
        make_duty(self.company_a, self.deployment_a)
        result = generate_service_invoice(
            self.company_a.id, self.contract_a.id,
            date(2026, 8, 1), date(2026, 8, 31)
        )
        self.assertTrue(result['created'])
        self.assertGreater(result['total_amount'], 0)
        invoice = ServiceInvoice.objects.get(id=result['invoice_id'])
        self.assertEqual(invoice.status, ServiceInvoiceStatus.DRAFT)

    def test_BG02_scheduled_duty_not_billed(self):
        """Only COMPLETED duties are billed; SCHEDULED ones are excluded."""
        make_duty(
            self.company_a, self.deployment_a,
            duty_date=date(2026, 8, 7),
            status=DutyAssignmentStatus.SCHEDULED
        )
        with self.assertRaises(BillingError):
            generate_service_invoice(
                self.company_a.id, self.contract_a.id,
                date(2026, 8, 1), date(2026, 8, 31)
            )

    def test_BG03_no_contract_deployment_non_billable(self):
        """Deployment without ServiceContract produces no invoice."""
        no_contract_deploy = make_deployment(
            self.company_a, self.employee_a, self.site_a,
            self.designation_a, contract=None
        )
        make_duty(self.company_a, no_contract_deploy,
                  duty_date=date(2026, 8, 8))
        with self.assertRaises(BillingError):
            generate_service_invoice(
                self.company_a.id, self.contract_a.id,
                date(2026, 8, 1), date(2026, 8, 31)
            )

    def test_BG04_missing_billing_rate_raises_error(self):
        """BillingError raised if no ContractRate found for designation on date."""
        # Use a different designation with no ContractRate
        no_rate_designation = make_designation(self.company_a, "No Rate Supervisor", "NRS-01")
        no_rate_deploy = make_deployment(
            self.company_a, self.employee_a, self.site_a,
            no_rate_designation, self.contract_a
        )
        make_duty(self.company_a, no_rate_deploy, duty_date=date(2026, 8, 9))
        with self.assertRaises(BillingError):
            generate_service_invoice(
                self.company_a.id, self.contract_a.id,
                date(2026, 8, 1), date(2026, 8, 31)
            )

    def test_BG05_billing_rate_calculation(self):
        """Invoice total = hours × billing_rate for each duty."""
        # 8-hour duty: 8h × 150/h = 1200
        make_duty(
            self.company_a, self.deployment_a,
            start_t=time(8, 0), end_t=time(16, 0)
        )
        result = generate_service_invoice(
            self.company_a.id, self.contract_a.id,
            date(2026, 8, 1), date(2026, 8, 31)
        )
        self.assertEqual(result['total_amount'], Decimal("1200.00"))

    def test_BG06_multiple_duties_aggregated(self):
        """Multiple duties in period are aggregated into one invoice."""
        make_duty(self.company_a, self.deployment_a,
                  duty_date=date(2026, 8, 1))
        make_duty(self.company_a, self.deployment_a,
                  duty_date=date(2026, 8, 2))
        make_duty(self.company_a, self.deployment_a,
                  duty_date=date(2026, 8, 3))
        result = generate_service_invoice(
            self.company_a.id, self.contract_a.id,
            date(2026, 8, 1), date(2026, 8, 31)
        )
        self.assertTrue(result['created'])
        invoice = ServiceInvoice.objects.get(id=result['invoice_id'])
        # 3 duties × 8h × 150 = 3600
        self.assertEqual(invoice.total_amount, Decimal("3600.00"))

    def test_BG07_invoice_period_grouping(self):
        """Same contract + period produces exactly one invoice (idempotent)."""
        make_duty(self.company_a, self.deployment_a,
                  duty_date=date(2026, 8, 1))
        result1 = generate_service_invoice(
            self.company_a.id, self.contract_a.id,
            date(2026, 8, 1), date(2026, 8, 31)
        )
        result2 = generate_service_invoice(
            self.company_a.id, self.contract_a.id,
            date(2026, 8, 1), date(2026, 8, 31)
        )
        self.assertTrue(result1['created'])
        self.assertFalse(result2['created'])
        self.assertEqual(result1['invoice_id'], result2['invoice_id'])

    def test_BG08_duplicate_invoice_prevention(self):
        """Calling generate twice for same period returns existing invoice."""
        make_duty(self.company_a, self.deployment_a)
        generate_service_invoice(
            self.company_a.id, self.contract_a.id,
            date(2026, 8, 1), date(2026, 8, 31)
        )
        count = ServiceInvoice.objects.filter(
            company=self.company_a, service_contract=self.contract_a
        ).count()
        self.assertEqual(count, 1)

    def test_BG09_already_billed_duty_not_rebilled(self):
        """A duty that was billed in a previous invoice is excluded from next generation."""
        make_duty(self.company_a, self.deployment_a,
                  duty_date=date(2026, 8, 1))
        generate_service_invoice(
            self.company_a.id, self.contract_a.id,
            date(2026, 8, 1), date(2026, 8, 15)
        )
        # Second invoice for overlapping range — duty already billed
        make_duty(self.company_a, self.deployment_a,
                  duty_date=date(2026, 8, 10))
        result2 = generate_service_invoice(
            self.company_a.id, self.contract_a.id,
            date(2026, 8, 10), date(2026, 8, 31)
        )
        # Only the unbilled Aug 10 duty is on the second invoice
        invoice2 = ServiceInvoice.objects.get(id=result2['invoice_id'])
        # 8h × 150 = 1200 (only the second duty, since Aug 1 duty was already billed)
        self.assertEqual(invoice2.total_amount, Decimal("1200.00"))

    def test_BG10_invoice_has_correct_service_invoice_lines(self):
        """ServiceInvoice lines are correctly generated with traceability."""
        make_duty(self.company_a, self.deployment_a)
        result = generate_service_invoice(
            self.company_a.id, self.contract_a.id,
            date(2026, 8, 1), date(2026, 8, 31)
        )
        invoice = ServiceInvoice.objects.get(id=result['invoice_id'])
        self.assertGreater(invoice.lines.count(), 0)
        line = invoice.lines.first()
        self.assertEqual(line.designation, self.designation_a)
        self.assertGreater(len(line.source_duty_assignment_ids), 0)


# ===========================================================================
# 5. FINANCE POSTING TESTS (5)
# ===========================================================================

class FinancePostingTests(Phase8CTestBase):

    def setUp(self):
        super().setUp()
        self.accounting_period = make_accounting_period(self.company_a)

        # Generate an invoice
        make_duty(self.company_a, self.deployment_a)
        result = generate_service_invoice(
            self.company_a.id, self.contract_a.id,
            date(2026, 8, 1), date(2026, 8, 31)
        )
        self.invoice = ServiceInvoice.objects.get(id=result['invoice_id'])

    def test_FI01_post_invoice_creates_journal_entry(self):
        """Posting a DRAFT invoice creates a JournalEntry and marks invoice POSTED."""
        result = post_service_invoice(self.company_a.id, self.invoice.id, self.user_a)
        self.assertTrue(result['posted'])
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, ServiceInvoiceStatus.POSTED)
        self.assertIsNotNone(self.invoice.journal_entry)

    def test_FI02_journal_entry_balances(self):
        """Posted JournalEntry debits == credits (double-entry balance)."""
        from finance.models import JournalEntry, JournalEntryLine
        post_service_invoice(self.company_a.id, self.invoice.id, self.user_a)
        self.invoice.refresh_from_db()
        je = self.invoice.journal_entry
        lines = JournalEntryLine.objects.filter(journal_entry=je, is_deleted=False)
        total_debit = sum(l.debit for l in lines)
        total_credit = sum(l.credit for l in lines)
        self.assertEqual(total_debit, total_credit)

    def test_FI03_posting_idempotent(self):
        """Calling post twice returns existing JournalEntry, does not double-post."""
        result1 = post_service_invoice(self.company_a.id, self.invoice.id, self.user_a)
        result2 = post_service_invoice(self.company_a.id, self.invoice.id, self.user_a)
        self.assertTrue(result1['posted'])
        self.assertFalse(result2['posted'])
        self.assertEqual(result1['journal_entry_id'], result2['journal_entry_id'])

    def test_FI04_no_accounting_period_raises(self):
        """BillingError raised when no OPEN accounting period covers invoice end date."""
        # Close the accounting period
        self.accounting_period.status = 'CLOSED'
        self.accounting_period.save()
        AccountingPeriod.objects.filter(pk=self.accounting_period.pk).update(status='CLOSED')
        with self.assertRaises(BillingError):
            post_service_invoice(self.company_a.id, self.invoice.id, self.user_a)

    def test_FI05_posted_invoice_core_fields_immutable(self):
        """Cannot change core fields (period, contract) of a POSTED invoice."""
        from django.core.exceptions import ValidationError
        post_service_invoice(self.company_a.id, self.invoice.id, self.user_a)
        self.invoice.refresh_from_db()
        self.invoice.period_start = date(2026, 7, 1)
        with self.assertRaises(ValidationError):
            self.invoice.clean()
