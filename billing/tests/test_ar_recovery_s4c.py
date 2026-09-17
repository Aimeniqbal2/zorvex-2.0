"""
billing/tests/test_ar_recovery_s4c.py
-------------------------------------
Targeted unit tests for Phase S-4C:
- Accounts Receivable (AR) Calculation & Aging Buckets
- Client Receipts, Allocations & Over-allocation Prevention
- Receipt Posting & Partial/Full Invoice Settlement
- Atomic Receipt Reversal & Balance Restoration
- Recovery Activities, Promises to Pay & Payment Reminders
- Multi-tenant Isolation
"""
from decimal import Decimal
from datetime import date, timedelta
from django.test import TestCase
from django.utils import timezone
from django.core.exceptions import ValidationError
from companies.models import Company
from accounts.models import User
from crm.models import CRMEntity
from operations.models import ServiceContract, ServiceContractStatus
from finance.models import (
    Currency, BankAccount, BankAccountType,
    ChartOfAccount, AccountType, SecurityFinanceConfiguration
)
from communications.models import SenderIdentity
from billing.models import (
    BillingSheet,
    BillingSheetStatus,
    ClientInvoice,
    ClientInvoiceLine,
    ClientInvoiceStatus,
    ClientReceipt,
    ReceiptStatus,
    PaymentMethod,
    ClientReceiptAllocation,
    RecoveryStatus,
    RecoveryActivity,
    RecoveryActivityType,
)
from billing.services.ar_calculation_service import ARCalculationService
from billing.services.client_receipt_service import ClientReceiptService
from billing.services.recovery_service import RecoveryService


class ARRecoveryS4CTest(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Apex Security Services Ltd", domain="apex.zorvex.com")
        self.other_company = Company.objects.create(name="Competitor Security", domain="comp.zorvex.com")

        self.user = User.objects.create_user(
            username="finance_officer",
            email="finance@apexsecurity.com",
            password="testpassword123",
            first_name="Finance",
            last_name="Officer",
            company_id=self.company.id,
            role="admin"
        )
        self.user.company = self.company
        self.user.save()

        self.currency, _ = Currency.objects.get_or_create(
            company=self.company,
            code="PKR",
            defaults={"name": "Pakistani Rupee", "symbol": "Rs."}
        )

        self.cash_acc = ChartOfAccount.objects.create(
            company=self.company,
            account_code="1000",
            account_name="Main Cash & Bank",
            account_type=AccountType.ASSET
        )

        self.bank_account = BankAccount.objects.create(
            company=self.company,
            account_type=BankAccountType.BANK,
            account_title="Main Operations HBL",
            account_number="12345678901234",
            bank_name="Habib Bank Limited",
            chart_of_account=self.cash_acc,
            currency=self.currency
        )

        self.client = CRMEntity.objects.create(
            company=self.company,
            name="Apex Commercial Tower",
            entity_type="CUSTOMER"
        )

        self.other_client = CRMEntity.objects.create(
            company=self.company,
            name="Metro Mall",
            entity_type="CUSTOMER"
        )

        self.contract = ServiceContract.objects.create(
            company=self.company,
            crm_entity=self.client,
            contract_code="CNT-2026-001",
            start_date=date(2026, 1, 1),
            status=ServiceContractStatus.ACTIVE
        )

        self.sender_id = SenderIdentity.objects.create(
            company=self.company,
            name="Apex Finance",
            email_address="billing@apexsecurity.com",
            verification_status="USABLE",
            provider_type="SYSTEM_DEFAULT"
        )

    def _create_invoice(self, client, grand_total, days_ago=10, due_days_ago=0, number=None):
        inv_date = timezone.now().date() - timedelta(days=days_ago)
        due_date = timezone.now().date() - timedelta(days=due_days_ago)
        inv = ClientInvoice.objects.create(
            company=self.company,
            client=client,
            contract=self.contract,
            invoice_number=number or "",
            period_start=inv_date - timedelta(days=30),
            period_end=inv_date,
            billing_month=inv_date.strftime('%Y-%m'),
            invoice_date=inv_date,
            due_date=due_date,
            currency=self.currency,
            subtotal=grand_total,
            grand_total=grand_total,
            status=ClientInvoiceStatus.ISSUED,
            recovery_status=RecoveryStatus.DUE if due_days_ago > 0 else RecoveryStatus.NOT_DUE
        )
        return inv

    def test_01_create_client_receipt(self):
        """Test creating draft client receipt with auto-numbering and validation."""
        receipt = ClientReceiptService.create_client_receipt(
            company=self.company,
            client=self.client,
            receipt_date=date(2026, 8, 25),
            amount=Decimal('100000.00'),
            payment_method=PaymentMethod.BANK_TRANSFER,
            bank_account=self.bank_account,
            reference_number="TXN-998877",
            received_by=self.user
        )
        self.assertIsNotNone(receipt.id)
        self.assertTrue(receipt.receipt_number.startswith("CR-"))
        self.assertEqual(receipt.status, ReceiptStatus.DRAFT)
        self.assertEqual(receipt.amount, Decimal('100000.00'))
        self.assertEqual(receipt.unallocated_amount, Decimal('100000.00'))

    def test_02_allocate_receipt_and_over_allocation_guard(self):
        """Test receipt allocation to invoice and guard against over-allocation."""
        inv = self._create_invoice(self.client, Decimal('50000.00'), days_ago=5, due_days_ago=-10)

        receipt = ClientReceiptService.create_client_receipt(
            company=self.company,
            client=self.client,
            receipt_date=date(2026, 8, 25),
            amount=Decimal('50000.00')
        )

        # Over-allocating more than invoice outstanding should raise ValidationError
        with self.assertRaises(ValidationError):
            ClientReceiptService.allocate_receipt_to_invoices(
                receipt=receipt,
                allocations_data=[{'invoice_id': str(inv.id), 'amount': '60000.00'}]
            )

        # Valid allocation
        ClientReceiptService.allocate_receipt_to_invoices(
            receipt=receipt,
            allocations_data=[{'invoice_id': str(inv.id), 'amount': '30000.00', 'notes': 'Part payment'}]
        )
        receipt.refresh_from_db()
        self.assertEqual(receipt.allocated_amount, Decimal('30000.00'))
        self.assertEqual(receipt.unallocated_amount, Decimal('20000.00'))

    def test_03_post_client_receipt_partial_and_full_settlement(self):
        """Test posting receipt updates invoice paid_amount and transitions status."""
        inv = self._create_invoice(self.client, Decimal('80000.00'), days_ago=15, due_days_ago=5)

        # 1. Partial Receipt (50,000)
        rec1 = ClientReceiptService.create_client_receipt(
            company=self.company,
            client=self.client,
            receipt_date=date(2026, 8, 20),
            amount=Decimal('50000.00')
        )
        ClientReceiptService.allocate_receipt_to_invoices(
            receipt=rec1,
            allocations_data=[{'invoice_id': str(inv.id), 'amount': '50000.00'}]
        )
        ClientReceiptService.post_client_receipt(rec1, user=self.user)

        inv.refresh_from_db()
        self.assertEqual(inv.paid_amount, Decimal('50000.00'))
        self.assertEqual(inv.outstanding_amount, Decimal('30000.00'))
        self.assertEqual(inv.status, ClientInvoiceStatus.PARTIALLY_PAID)

        # 2. Final Receipt (30,000)
        rec2 = ClientReceiptService.create_client_receipt(
            company=self.company,
            client=self.client,
            receipt_date=date(2026, 8, 25),
            amount=Decimal('30000.00')
        )
        ClientReceiptService.allocate_receipt_to_invoices(
            receipt=rec2,
            allocations_data=[{'invoice_id': str(inv.id), 'amount': '30000.00'}]
        )
        ClientReceiptService.post_client_receipt(rec2, user=self.user)

        inv.refresh_from_db()
        self.assertEqual(inv.paid_amount, Decimal('80000.00'))
        self.assertEqual(inv.outstanding_amount, Decimal('0.00'))
        self.assertEqual(inv.status, ClientInvoiceStatus.PAID)
        self.assertEqual(inv.recovery_status, RecoveryStatus.RECOVERED)

    def test_04_atomic_receipt_reversal(self):
        """Test reversing a posted receipt restores invoice balance and status atomically."""
        inv = self._create_invoice(self.client, Decimal('60000.00'), days_ago=10, due_days_ago=2)

        rec = ClientReceiptService.create_client_receipt(
            company=self.company,
            client=self.client,
            receipt_date=date(2026, 8, 22),
            amount=Decimal('60000.00')
        )
        ClientReceiptService.allocate_receipt_to_invoices(
            receipt=rec,
            allocations_data=[{'invoice_id': str(inv.id), 'amount': '60000.00'}]
        )
        ClientReceiptService.post_client_receipt(rec, user=self.user)

        inv.refresh_from_db()
        self.assertEqual(inv.status, ClientInvoiceStatus.PAID)

        # Reversal without reason fails
        with self.assertRaises(ValidationError):
            ClientReceiptService.reverse_client_receipt(rec, user=self.user, reason="")

        # Reversal with reason succeeds
        ClientReceiptService.reverse_client_receipt(
            rec,
            user=self.user,
            reason="Cheque bounced due to signature mismatch"
        )
        rec.refresh_from_db()
        inv.refresh_from_db()

        self.assertEqual(rec.status, ReceiptStatus.REVERSED)
        self.assertEqual(rec.reversal_reason, "Cheque bounced due to signature mismatch")
        self.assertEqual(inv.paid_amount, Decimal('0.00'))
        self.assertEqual(inv.outstanding_amount, Decimal('60000.00'))
        self.assertEqual(inv.status, ClientInvoiceStatus.ISSUED)
        self.assertEqual(inv.recovery_status, RecoveryStatus.DUE)

    def test_05_ar_aging_buckets_calculation(self):
        """Test AR aging buckets: Current, 1-30, 31-60, 61-90, 90+ days."""
        today = timezone.now().date()

        # Inv 1: Current (due in 5 days)
        self._create_invoice(self.client, Decimal('10000.00'), days_ago=5, due_days_ago=-5, number="INV-CURR")
        # Inv 2: Overdue 15 days (1-30)
        self._create_invoice(self.client, Decimal('20000.00'), days_ago=25, due_days_ago=15, number="INV-1-30")
        # Inv 3: Overdue 45 days (31-60)
        self._create_invoice(self.client, Decimal('30000.00'), days_ago=55, due_days_ago=45, number="INV-31-60")
        # Inv 4: Overdue 75 days (61-90)
        self._create_invoice(self.client, Decimal('40000.00'), days_ago=85, due_days_ago=75, number="INV-61-90")
        # Inv 5: Overdue 120 days (90+)
        self._create_invoice(self.client, Decimal('50000.00'), days_ago=130, due_days_ago=120, number="INV-90P")

        summary = ARCalculationService.get_client_ar_summary(self.client, self.company, as_of_date=today)
        self.assertEqual(summary['current'], Decimal('10000.00'))
        self.assertEqual(summary['aging_1_30'], Decimal('20000.00'))
        self.assertEqual(summary['aging_31_60'], Decimal('30000.00'))
        self.assertEqual(summary['aging_61_90'], Decimal('40000.00'))
        self.assertEqual(summary['aging_90_plus'], Decimal('50000.00'))
        self.assertEqual(summary['outstanding'], Decimal('150000.00'))
        self.assertEqual(summary['overdue'], Decimal('140000.00'))

    def test_06_recovery_activities_and_promise_to_pay(self):
        """Test recording recovery activities, promise to pay does not alter invoice receivable balance."""
        inv = self._create_invoice(self.client, Decimal('45000.00'), days_ago=20, due_days_ago=10)

        activity = RecoveryService.record_recovery_activity(
            company=self.company,
            client=self.client,
            invoice=inv,
            activity_type=RecoveryActivityType.PROMISE_TO_PAY,
            activity_date=date(2026, 8, 24),
            notes="Client promised full cheque by month end",
            promise_amount=Decimal('45000.00'),
            promise_date=date(2026, 8, 31),
            next_followup_date=date(2026, 9, 1),
            created_by=self.user
        )

        self.assertIsNotNone(activity.id)
        inv.refresh_from_db()
        self.assertEqual(inv.recovery_status, RecoveryStatus.PROMISE_TO_PAY)
        # Verify invoice balance is NOT altered by promise to pay
        self.assertEqual(inv.paid_amount, Decimal('0.00'))
        self.assertEqual(inv.outstanding_amount, Decimal('45000.00'))

    def test_07_payment_reminder_email_dispatch(self):
        """Test payment reminder email dispatch via communications service."""
        inv = self._create_invoice(self.client, Decimal('25000.00'), days_ago=12, due_days_ago=5)

        activity = RecoveryService.send_payment_reminder_email(
            invoice=inv,
            user=self.user,
            sender_identity=self.sender_id,
            to_email="billing@apextower.com",
            custom_notes="Please settle before month end to avoid service hold."
        )

        self.assertIsNotNone(activity.id)
        self.assertIsNotNone(activity.outbound_email)
        self.assertEqual(activity.activity_type, RecoveryActivityType.PAYMENT_REMINDER)
        inv.refresh_from_db()
        self.assertEqual(inv.recovery_status, RecoveryStatus.UNDER_FOLLOWUP)

    def test_08_multi_invoice_single_receipt_allocation(self):
        """Test allocating a single client receipt across multiple invoices for the same client."""
        inv1 = self._create_invoice(self.client, Decimal('30000.00'), days_ago=10, due_days_ago=2, number="INV-MULTI-1")
        inv2 = self._create_invoice(self.client, Decimal('70000.00'), days_ago=10, due_days_ago=2, number="INV-MULTI-2")

        rec = ClientReceiptService.create_client_receipt(
            company=self.company,
            client=self.client,
            receipt_date=date(2026, 8, 25),
            amount=Decimal('100000.00')
        )

        ClientReceiptService.allocate_receipt_to_invoices(
            receipt=rec,
            allocations_data=[
                {'invoice_id': str(inv1.id), 'amount': '30000.00'},
                {'invoice_id': str(inv2.id), 'amount': '70000.00'}
            ]
        )

        ClientReceiptService.post_client_receipt(rec, user=self.user)

        inv1.refresh_from_db()
        inv2.refresh_from_db()
        self.assertEqual(inv1.status, ClientInvoiceStatus.PAID)
        self.assertEqual(inv2.status, ClientInvoiceStatus.PAID)
        self.assertEqual(inv1.paid_amount, Decimal('30000.00'))
        self.assertEqual(inv2.paid_amount, Decimal('70000.00'))

    def test_09_multi_tenant_isolation(self):
        """Test multi-tenant isolation rejects cross-company allocations."""
        other_client = CRMEntity.objects.create(
            company=self.other_company,
            name="Other Corp",
            entity_type="CUSTOMER"
        )
        rec = ClientReceiptService.create_client_receipt(
            company=self.company,
            client=self.client,
            receipt_date=date(2026, 8, 25),
            amount=Decimal('50000.00')
        )
        with self.assertRaises(ValidationError):
            ClientReceiptService.create_client_receipt(
                company=self.company,
                client=other_client,
                receipt_date=date(2026, 8, 25),
                amount=Decimal('50000.00')
            )
