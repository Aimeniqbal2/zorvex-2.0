from decimal import Decimal
from datetime import date, timedelta
from django.test import TestCase
from django.utils import timezone
from django.core.exceptions import ValidationError
from rest_framework.test import APIClient
from rest_framework import status

from accounts.models import User
from companies.models import Company
from crm.models import CRMEntity
from hrm.models import Designation
from operations.models import (
    OperationalSite, ServiceContract, ServiceContractStatus,
    ContractRate, Deployment, DeploymentStatus, ExtraDuty, ExtraDutyStatus
)
from finance.models import (
    ProfitCenter, CostCenter, Currency, SecurityFinanceConfiguration, BankAccount
)
from communications.models import SenderIdentity, OutboundEmail
from platform_core.models import ModuleDefinition
from platform_core.services import enable_module
from billing.models import (
    BillingPeriod, BillingPeriodStatus,
    BillingSheet, BillingSheetStatus, BillingSheetLine,
    BillingAdjustment, AdjustmentType, BillingLineType,
    ClientInvoice, ClientInvoiceStatus
)
from billing.services.billing_sheet_service import (
    build_billing_sheet_from_contract, add_billing_adjustment,
    recalculate_billing_sheet, submit_for_review, approve_billing_sheet,
    cancel_billing_sheet
)
from billing.services.invoice_generator_service import (
    generate_client_invoice_from_sheet, issue_client_invoice,
    send_client_invoice_email, render_invoice_context
)


class ClientBillingS4BTestCase(TestCase):
    def setUp(self):
        # Company A
        self.company = Company.objects.create(name="Shield Security Ltd", domain="shield.zorvex.com")
        self.user = User.objects.create_user(
            username="finance_admin",
            email="finance@shield.com",
            password="pass",
            company_id=self.company.id,
            role="admin"
        )
        self.user.company = self.company
        self.user.save()

        # Company B (for tenancy isolation tests)
        self.company_b = Company.objects.create(name="Apex Guard Corp", domain="apex.zorvex.com")
        self.user_b = User.objects.create_user(
            username="apex_admin",
            email="admin@apex.com",
            password="pass",
            company_id=self.company_b.id,
            role="admin"
        )

        # Enable billing and finance modules
        mod_billing, _ = ModuleDefinition.objects.get_or_create(code='billing', defaults={'name': 'Billing'})
        mod_finance, _ = ModuleDefinition.objects.get_or_create(code='finance', defaults={'name': 'Finance'})
        enable_module(self.company, 'billing')
        enable_module(self.company, 'finance')

        # Currency & Profit/Cost Centers
        self.currency, _ = Currency.objects.get_or_create(
            company=self.company, code='PKR',
            defaults={'name': 'Pakistani Rupee', 'symbol': 'Rs.'}
        )
        self.profit_center = ProfitCenter.objects.create(
            company=self.company, code='MANNED-GUARDING', name='Manned Guarding Services'
        )
        self.cost_center = CostCenter.objects.create(
            company=self.company, code='FIELD-OPS', name='Field Operations'
        )

        # SenderIdentity for email tests
        SenderIdentity.objects.create(
            company=self.company, name="Billing Ops", email_address="billing@zorvex.com",
            provider_type='SYSTEM_DEFAULT', verification_status='USABLE', is_active=True, is_default=True
        )

        # Client & Sites
        self.client_entity = CRMEntity.objects.create(
            company=self.company, name="Habib Metro Bank", entity_type="CUSTOMER"
        )
        self.site_hq = OperationalSite.objects.create(
            company=self.company, crm_entity=self.client_entity, name="HMB Head Office", address="Karachi"
        )
        self.site_branch = OperationalSite.objects.create(
            company=self.company, crm_entity=self.client_entity, name="HMB Clifton Branch", address="Clifton Karachi"
        )

        # Service Contract
        self.contract = ServiceContract.objects.create(
            company=self.company,
            crm_entity=self.client_entity,
            contract_code="SEC-CTR-2026-001",
            start_date=date(2026, 1, 1),
            end_date=date(2026, 12, 31),
            status=ServiceContractStatus.ACTIVE
        )
        self.contract.sites.add(self.site_hq, self.site_branch)

        # Designation & Rates
        self.desig_guard = Designation.objects.create(
            company=self.company, name="Security Guard"
        )
        self.desig_supervisor = Designation.objects.create(
            company=self.company, name="Security Supervisor"
        )
        self.rate_guard = ContractRate.objects.create(
            company=self.company,
            service_contract=self.contract,
            designation=self.desig_guard,
            billing_rate=Decimal('65000.00'),
            pay_rate=Decimal('35000.00'),
            effective_date=date(2026, 1, 1)
        )
        self.rate_supervisor = ContractRate.objects.create(
            company=self.company,
            service_contract=self.contract,
            designation=self.desig_supervisor,
            billing_rate=Decimal('90000.00'),
            pay_rate=Decimal('50000.00'),
            effective_date=date(2026, 1, 1)
        )

        # Employee & Deployment
        from hrm.models import Employee
        self.emp1 = Employee.objects.create(
            company=self.company, user=self.user, first_name="Ahmed", last_name="Khan",
            designation=self.desig_guard
        )
        self.emp2 = Employee.objects.create(
            company=self.company, first_name="Bilal", last_name="Hassan",
            designation=self.desig_guard
        )
        self.emp_sup = Employee.objects.create(
            company=self.company, first_name="Tariq", last_name="Mahmood",
            designation=self.desig_supervisor
        )

        self.dep1 = Deployment.objects.create(
            company=self.company, employee=self.emp1, site=self.site_hq,
            service_contract=self.contract, designation=self.desig_guard,
            start_date=date(2026, 1, 1), status=DeploymentStatus.ACTIVE
        )
        self.dep2 = Deployment.objects.create(
            company=self.company, employee=self.emp2, site=self.site_branch,
            service_contract=self.contract, designation=self.desig_guard,
            start_date=date(2026, 1, 1), status=DeploymentStatus.ACTIVE
        )
        self.dep3 = Deployment.objects.create(
            company=self.company, employee=self.emp_sup, site=self.site_hq,
            service_contract=self.contract, designation=self.desig_supervisor,
            start_date=date(2026, 1, 1), status=DeploymentStatus.ACTIVE
        )

        # Approved Extra Duty in period
        self.extra_duty = ExtraDuty.objects.create(
            company=self.company,
            employee=self.emp1,
            site=self.site_hq,
            service_contract=self.contract,
            date=date(2026, 9, 15),
            hours=Decimal('10.00'),
            description="VIP Cash Escort Duty",
            status=ExtraDutyStatus.APPROVED,
            approved_by=self.user
        )

        # API Client
        self.api_client = APIClient()
        self.api_client.force_authenticate(user=self.user)
        self.api_client.credentials(HTTP_X_COMPANY_ID=str(self.company.id))

    def test_build_billing_sheet_from_contract_and_rate_resolution(self):
        sheet = build_billing_sheet_from_contract(
            company=self.company,
            contract_id=self.contract.id,
            period_start=date(2026, 9, 1),
            period_end=date(2026, 9, 30),
            user=self.user
        )
        self.assertEqual(sheet.status, BillingSheetStatus.DRAFT)
        self.assertEqual(sheet.client, self.client_entity)
        self.assertEqual(sheet.contract, self.contract)
        self.assertEqual(sheet.billing_month, '2026-09')

        lines = sheet.lines.filter(is_deleted=False)
        self.assertTrue(lines.exists())

        # Expected 2 guards (65,000 each = 130,000) + 1 supervisor (90,000) = 220,000 base
        # Extra duty: 10 hrs * 500 = 5,000
        # Total expected subtotal = 225,000
        self.assertEqual(sheet.base_amount, Decimal('220000.00'))
        self.assertEqual(sheet.extra_duty_amount, Decimal('5000.00'))
        self.assertEqual(sheet.subtotal, Decimal('225000.00'))
        self.assertEqual(sheet.total_amount, Decimal('225000.00'))

    def test_duplicate_active_billing_period_prevented(self):
        # 1st build succeeds
        sheet1 = build_billing_sheet_from_contract(
            company=self.company,
            contract_id=self.contract.id,
            period_start=date(2026, 9, 1),
            period_end=date(2026, 9, 30),
            user=self.user
        )
        # 2nd build for same contract & period fails
        with self.assertRaises(ValidationError):
            build_billing_sheet_from_contract(
                company=self.company,
                contract_id=self.contract.id,
                period_start=date(2026, 9, 1),
                period_end=date(2026, 9, 30),
                user=self.user
            )

        # Cancel sheet 1 allows building sheet 2 (revision)
        cancel_billing_sheet(sheet1, user=self.user, reason="Contract scope updated")
        sheet2 = build_billing_sheet_from_contract(
            company=self.company,
            contract_id=self.contract.id,
            period_start=date(2026, 9, 1),
            period_end=date(2026, 9, 30),
            user=self.user
        )
        self.assertEqual(sheet2.status, BillingSheetStatus.DRAFT)

    def test_manual_adjustment_and_recalculation(self):
        sheet = build_billing_sheet_from_contract(
            company=self.company,
            contract_id=self.contract.id,
            period_start=date(2026, 9, 1),
            period_end=date(2026, 9, 30),
            user=self.user
        )
        initial_subtotal = sheet.subtotal

        # Add additional charge of 15,000 for specialized weapon training
        add_billing_adjustment(
            billing_sheet=sheet,
            adjustment_type=AdjustmentType.ADDITIONAL_CHARGE,
            reason="Special Weapon Tactical Charge",
            amount=Decimal('15000.00'),
            user=self.user
        )
        sheet.refresh_from_db()
        self.assertEqual(sheet.adjustment_amount, Decimal('15000.00'))
        self.assertEqual(sheet.subtotal, initial_subtotal + Decimal('15000.00'))

        # Add discount of 5,000
        add_billing_adjustment(
            billing_sheet=sheet,
            adjustment_type=AdjustmentType.DISCOUNT,
            reason="Corporate Early Bird Discount",
            amount=Decimal('5000.00'),
            user=self.user
        )
        sheet.refresh_from_db()
        self.assertEqual(sheet.discount_amount, Decimal('5000.00'))
        self.assertEqual(sheet.subtotal, initial_subtotal + Decimal('15000.00') - Decimal('5000.00'))

    def test_multi_site_attribution_preserved(self):
        sheet = build_billing_sheet_from_contract(
            company=self.company,
            contract_id=self.contract.id,
            period_start=date(2026, 9, 1),
            period_end=date(2026, 9, 30),
            user=self.user
        )
        lines = sheet.lines.filter(is_deleted=False)
        site_ids = {line.site_id for line in lines if line.site_id}
        self.assertIn(self.site_hq.id, site_ids)
        self.assertIn(self.site_branch.id, site_ids)

    def test_approval_workflow_and_invoice_generation(self):
        sheet = build_billing_sheet_from_contract(
            company=self.company,
            contract_id=self.contract.id,
            period_start=date(2026, 9, 1),
            period_end=date(2026, 9, 30),
            user=self.user
        )
        # Cannot generate invoice from DRAFT sheet
        with self.assertRaises(ValidationError):
            generate_client_invoice_from_sheet(sheet, user=self.user)

        # Advance to UNDER_REVIEW
        submit_for_review(sheet, user=self.user)
        self.assertEqual(sheet.status, BillingSheetStatus.UNDER_REVIEW)

        # Approve sheet
        approve_billing_sheet(sheet, user=self.user)
        self.assertEqual(sheet.status, BillingSheetStatus.APPROVED)
        self.assertIsNotNone(sheet.approved_at)

        # Generate invoice
        invoice = generate_client_invoice_from_sheet(
            billing_sheet=sheet,
            user=self.user,
            invoice_date=date(2026, 9, 30),
            payment_terms="NET_30"
        )
        self.assertEqual(invoice.status, ClientInvoiceStatus.DRAFT)
        self.assertEqual(invoice.client, self.client_entity)
        self.assertEqual(invoice.grand_total, sheet.total_amount)
        self.assertTrue(invoice.invoice_number.startswith("INV-"))

        # Billing sheet marked as INVOICED
        sheet.refresh_from_db()
        self.assertEqual(sheet.status, BillingSheetStatus.INVOICED)

        # Lines snapshotted
        self.assertEqual(invoice.lines.count(), sheet.lines.count())

    def test_invoice_historical_rate_immutability(self):
        sheet = build_billing_sheet_from_contract(
            company=self.company,
            contract_id=self.contract.id,
            period_start=date(2026, 9, 1),
            period_end=date(2026, 9, 30),
            user=self.user
        )
        approve_billing_sheet(sheet, user=self.user)
        invoice = generate_client_invoice_from_sheet(sheet, user=self.user)
        orig_grand_total = invoice.grand_total

        # Modify contract rate in operations (future rate hike)
        self.rate_guard.billing_rate = Decimal('80000.00')
        self.rate_guard.save()

        # Historical invoice total and snapshot lines remain unaltered
        invoice.refresh_from_db()
        self.assertEqual(invoice.grand_total, orig_grand_total)

    def test_invoice_issue_and_email_dispatch(self):
        sheet = build_billing_sheet_from_contract(
            company=self.company,
            contract_id=self.contract.id,
            period_start=date(2026, 9, 1),
            period_end=date(2026, 9, 30),
            user=self.user
        )
        approve_billing_sheet(sheet, user=self.user)
        invoice = generate_client_invoice_from_sheet(sheet, user=self.user)

        # Issue invoice
        issue_client_invoice(invoice, user=self.user)
        self.assertEqual(invoice.status, ClientInvoiceStatus.ISSUED)
        self.assertIsNotNone(invoice.issued_at)

        # Send email
        result = send_client_invoice_email(
            invoice=invoice,
            user=self.user,
            to_email="cfo@habibmetro.com"
        )
        self.assertIn(result.status, ['SENT', 'QUEUED'])
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, ClientInvoiceStatus.SENT)
        self.assertIsNotNone(invoice.outbound_email)
        self.assertEqual(invoice.outbound_email.context_type, 'client_invoice')

    def test_cross_tenant_contract_isolation_blocked(self):
        # User from Company B attempting to access Company A contract
        with self.assertRaises(Exception):
            build_billing_sheet_from_contract(
                company=self.company_b,
                contract_id=self.contract.id,
                period_start=date(2026, 9, 1),
                period_end=date(2026, 9, 30),
                user=self.user_b
            )

    def test_api_workflow_end_to_end(self):
        # 1. Build billing sheet via REST API
        url_build = "/api/billing/billing-sheets/build-from-contract/"
        payload = {
            "contract_id": str(self.contract.id),
            "period_start": "2026-09-01",
            "period_end": "2026-09-30",
            "notes": "Monthly billing sheet via API"
        }
        res = self.api_client.post(url_build, data=payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        sheet_id = res.data['id']

        # 2. Add adjustment via REST API
        url_adj = f"/api/billing/billing-sheets/{sheet_id}/add-adjustment/"
        res_adj = self.api_client.post(url_adj, data={
            "adjustment_type": "ADDITIONAL_CHARGE",
            "reason": "Emergency Patrol Vehicle Deployment",
            "amount": "20000.00"
        }, format='json')
        self.assertEqual(res_adj.status_code, status.HTTP_200_OK)

        # 3. Submit for review
        url_review = f"/api/billing/billing-sheets/{sheet_id}/submit-for-review/"
        res_rev = self.api_client.post(url_review)
        self.assertEqual(res_rev.status_code, status.HTTP_200_OK)
        self.assertEqual(res_rev.data['status'], 'UNDER_REVIEW')

        # 4. Approve
        url_app = f"/api/billing/billing-sheets/{sheet_id}/approve/"
        res_app = self.api_client.post(url_app)
        self.assertEqual(res_app.status_code, status.HTTP_200_OK)
        self.assertEqual(res_app.data['status'], 'APPROVED')

        # 5. Generate Invoice
        url_gen = f"/api/billing/billing-sheets/{sheet_id}/generate-invoice/"
        res_gen = self.api_client.post(url_gen, data={
            "invoice_date": "2026-09-30",
            "due_date": "2026-10-30",
            "payment_terms": "NET_30"
        }, format='json')
        self.assertEqual(res_gen.status_code, status.HTTP_201_CREATED)
        invoice_id = res_gen.data['id']

        # 6. Issue Invoice
        url_issue = f"/api/billing/client-invoices/{invoice_id}/issue/"
        res_issue = self.api_client.post(url_issue)
        self.assertEqual(res_issue.status_code, status.HTTP_200_OK)
        self.assertEqual(res_issue.data['status'], 'ISSUED')

        # 7. Preview Context
        url_prev = f"/api/billing/client-invoices/{invoice_id}/preview-context/"
        res_prev = self.api_client.get(url_prev)
        self.assertEqual(res_prev.status_code, status.HTTP_200_OK)
        self.assertIn('invoice_number', res_prev.data)
        self.assertEqual(res_prev.data['client']['name'], self.client_entity.name)

        # 8. Send Email
        url_send = f"/api/billing/client-invoices/{invoice_id}/send-email/"
        res_send = self.api_client.post(url_send, data={"to_email": "billing@habibmetro.com"}, format='json')
        self.assertEqual(res_send.status_code, status.HTTP_200_OK)
        self.assertTrue(res_send.data['success'])
