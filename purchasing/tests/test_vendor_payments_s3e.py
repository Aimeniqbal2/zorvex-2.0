from decimal import Decimal
from datetime import date, timedelta
from django.utils import timezone
from django.core.exceptions import ValidationError
from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth import get_user_model
from companies.models import Company
from platform_core.models import Warehouse, ModuleDefinition, CompanyModule
from platform_core.services import enable_module
from inventory.models import Item, Category
from purchasing.models import (
    Vendor,
    ProcurementDocument,
    ProcurementLine,
    VendorPayment,
    VendorPaymentAllocation
)
from purchasing.services.invoice_service import (
    create_vendor_invoice,
    approve_vendor_invoice,
    post_vendor_bill
)
from purchasing.services.payment_service import (
    create_vendor_payment,
    post_vendor_payment,
    reverse_vendor_payment,
    cancel_draft_payment,
    get_invoice_payment_summary,
    get_vendor_payable_summary,
    get_accounts_payable_list
)

User = get_user_model()


class VendorPaymentS3ETestCase(APITestCase):
    """
    Focused test suite for Phase S-3E: Accounts Payable & Vendor Payments.
    Validates partial & full settlements, multi-invoice allocations, overpayment protection,
    overdue status derivation, atomic reversal, and strict multi-tenant isolation.
    """

    def setUp(self):
        # Enable 'purchasing' module definition (required by ModulePermission on API views)
        self._purchasing_module, _ = ModuleDefinition.objects.get_or_create(
            code='purchasing',
            defaults={'name': 'Purchasing', 'category': 'operations', 'is_active': True}
        )

        # Company A (Primary Security Tenant)
        self.company_a = Company.objects.create(name="SecureCorp Tenant A", is_active=True)
        self.user_a = User.objects.create_user(
            username="security_admin_a",
            email="admin_a@securecorp.com",
            password="testpassword123",
            company=self.company_a,
            role="admin"
        )
        self.staff_a = User.objects.create_user(
            username="security_staff_a",
            email="staff_a@securecorp.com",
            password="testpassword123",
            company=self.company_a,
            role="staff"
        )

        # Company B (Isolated Competitor Tenant)
        self.company_b = Company.objects.create(name="CyberGuard Tenant B", is_active=True)
        self.user_b = User.objects.create_user(
            username="security_admin_b",
            email="admin_b@cyberguard.com",
            password="testpassword123",
            company=self.company_b,
            role="admin"
        )

        # Enable purchasing module for both tenants (required by ModulePermission on API views)
        enable_module(self.company_a, 'purchasing')
        enable_module(self.company_b, 'purchasing')

        # Master Data for Company A
        self.warehouse_a = Warehouse.objects.create(
            name="Main Security Warehouse",
            code="MSW-01",
            company=self.company_a
        )
        self.category_a = Category.objects.create(
            name="CCTV & Surveillance",
            company=self.company_a
        )


        self.camera_item = Item.objects.create(
            name="Hikvision 4K IP Camera",
            sku="HIK-4K-001",
            category=self.category_a,
            company=self.company_a,
            cost_price=Decimal('10000.00'),
        )
        self.nvr_item = Item.objects.create(
            name="Hikvision 16-Ch NVR",
            sku="HIK-NVR-16",
            category=self.category_a,
            company=self.company_a,
            cost_price=Decimal('40000.00'),
        )

        # Vendor for Company A
        self.vendor_a = Vendor.objects.create(
            name="Hikvision Pakistan Official",
            company=self.company_a,
            payment_terms="NET 30",
        )

        # Vendor for Company B
        self.vendor_b = Vendor.objects.create(
            name="Dahua Official Distributor",
            company=self.company_b,
            payment_terms="NET 15",
        )

        # Helper method: Create, approve, and post a PO with GRN and Bill
        self.po_a = self._create_and_post_po(
            company=self.company_a,
            vendor=self.vendor_a,
            warehouse=self.warehouse_a,
            user=self.user_a,
            item=self.camera_item,
            quantity=Decimal('10.0000'),
            unit_price=Decimal('10000.00') # PO total = 100,000
        )

    def _create_and_post_po(self, company, vendor, warehouse, user, item, quantity, unit_price):
        po = ProcurementDocument.objects.create(
            company=company,
            document_type='PURCHASE_ORDER',
            vendor=vendor,
            warehouse=warehouse,
            document_date=date.today(),
            currency='PKR',
            status='APPROVED',
            created_by=user,
            approved_by=user,
            approved_at=timezone.now()
        )
        po_line = ProcurementLine.objects.create(
            company=company,
            document=po,
            item=item,
            quantity=quantity,
            unit_price=unit_price,
            total_amount=(quantity * unit_price).quantize(Decimal('0.01'))
        )
        po.subtotal_amount = po_line.total_amount
        po.total_amount = po_line.total_amount
        po.save()
        return po

    def _create_posted_grn(self, po, quantity):
        grn = ProcurementDocument.objects.create(
            company=po.company,
            document_type='GOODS_RECEIPT',
            parent_document=po,
            vendor=po.vendor,
            warehouse=po.warehouse,
            document_date=date.today(),
            currency='PKR',
            status='POSTED',
            created_by=po.created_by
        )
        po_line = po.lines.first()
        ProcurementLine.objects.create(
            company=po.company,
            document=grn,
            item=po_line.item,
            parent_line=po_line,
            quantity=quantity,
            received_quantity=quantity,
            accepted_quantity=quantity,
            rejected_quantity=Decimal('0.0000'),
            unit_price=po_line.unit_price,
            total_amount=(quantity * po_line.unit_price).quantize(Decimal('0.01'))
        )
        return grn

    def _create_posted_bill(self, po, vendor_inv_num="INV-HIK-001", due_in_days=30, line_qty=Decimal('10.0000'), unit_price=Decimal('10000.00')):
        po_line = po.lines.first()
        inv_payload = {
            'vendor_invoice_number': vendor_inv_num,
            'document_date': date.today().isoformat(),
            'due_date': (date.today() + timedelta(days=due_in_days)).isoformat(),
            'lines': [{
                'po_line_id': str(po_line.id),
                'quantity': float(line_qty),
                'unit_price': float(unit_price),
                'discount_amount': 0,
                'tax_amount': 0
            }]
        }
        invoice = create_vendor_invoice(po, inv_payload, self.user_a)
        approve_vendor_invoice(invoice, self.user_a)
        post_vendor_bill(invoice, self.user_a)
        invoice.refresh_from_db()  # post_vendor_bill saves internally; re-fetch ap_ready/status
        return invoice

    # -------------------------------------------------------------
    # 1. Accounts Payable Initialization & Balance Verification
    # -------------------------------------------------------------
    def test_01_ap_created_from_posted_bill(self):
        """A posted vendor invoice automatically exposes correct AP figures and status UNPAID."""
        self._create_posted_grn(self.po_a, Decimal('10.0000'))
        invoice = self._create_posted_bill(self.po_a, "INV-HIK-101", due_in_days=30)

        # After 3-way matching succeeds, the invoice may be promoted to MATCHED status.
        # Both POSTED and MATCHED are valid AP-ready statuses.
        self.assertIn(invoice.status, ('POSTED', 'MATCHED'))
        self.assertTrue(invoice.ap_ready)
        
        summary = get_invoice_payment_summary(invoice)
        self.assertEqual(summary['total_amount'], Decimal('100000.00'))
        self.assertEqual(summary['paid_amount'], Decimal('0.00'))
        self.assertEqual(summary['outstanding_amount'], Decimal('100000.00'))
        self.assertEqual(summary['payment_status'], 'UNPAID')
        self.assertFalse(summary['is_overdue'])

    # -------------------------------------------------------------
    # 2. Partial Payment Flow
    # -------------------------------------------------------------
    def test_02_partial_payment_updates_status_and_balances(self):
        """A partial payment reduces outstanding balance and sets payment_status='PARTIALLY_PAID'."""
        self._create_posted_grn(self.po_a, Decimal('10.0000'))
        invoice = self._create_posted_bill(self.po_a, "INV-HIK-102", due_in_days=30)

        # Pay PKR 40,000 of 100,000
        payment = create_vendor_payment(
            company_id=self.company_a.id,
            vendor_id=self.vendor_a.id,
            payment_date=date.today(),
            amount=Decimal('40000.00'),
            payment_method='BANK_TRANSFER',
            bank_cash_account='Meezan Bank - Ops Account',
            reference_number='FT-998811',
            allocations_data=[{
                'invoice_id': str(invoice.id),
                'amount': Decimal('40000.00')
            }],
            user=self.user_a,
            auto_post=False
        )

        # While payment is DRAFT, liability is NOT reduced
        sum_draft = get_invoice_payment_summary(invoice)
        self.assertEqual(sum_draft['paid_amount'], Decimal('0.00'))
        self.assertEqual(sum_draft['outstanding_amount'], Decimal('100000.00'))

        # Post payment
        posted_payment = post_vendor_payment(payment.id, user=self.user_a)
        self.assertEqual(posted_payment.status, 'POSTED')

        # Check invoice summary
        invoice.refresh_from_db()
        sum_posted = get_invoice_payment_summary(invoice)
        self.assertEqual(sum_posted['total_amount'], Decimal('100000.00'))
        self.assertEqual(sum_posted['paid_amount'], Decimal('40000.00'))
        self.assertEqual(sum_posted['outstanding_amount'], Decimal('60000.00'))
        self.assertEqual(sum_posted['payment_status'], 'PARTIALLY_PAID')
        self.assertEqual(invoice.payment_status, 'PARTIALLY_PAID')

    # -------------------------------------------------------------
    # 3. Full Settlement with Subsequent Payment
    # -------------------------------------------------------------
    def test_03_full_payment_settles_invoice_completely(self):
        """Second partial payment settles remaining balance to 0 and transitions invoice to PAID."""
        self._create_posted_grn(self.po_a, Decimal('10.0000'))
        invoice = self._create_posted_bill(self.po_a, "INV-HIK-103", due_in_days=30)

        # Payment 1: 40,000
        create_vendor_payment(
            company_id=self.company_a.id,
            vendor_id=self.vendor_a.id,
            payment_date=date.today(),
            amount=Decimal('40000.00'),
            allocations_data=[{'invoice_id': str(invoice.id), 'amount': Decimal('40000.00')}],
            user=self.user_a,
            auto_post=True
        )

        # Payment 2: Remaining 60,000
        create_vendor_payment(
            company_id=self.company_a.id,
            vendor_id=self.vendor_a.id,
            payment_date=date.today(),
            amount=Decimal('60000.00'),
            allocations_data=[{'invoice_id': str(invoice.id), 'amount': Decimal('60000.00')}],
            user=self.user_a,
            auto_post=True
        )

        invoice.refresh_from_db()
        summary = get_invoice_payment_summary(invoice)
        self.assertEqual(summary['paid_amount'], Decimal('100000.00'))
        self.assertEqual(summary['outstanding_amount'], Decimal('0.00'))
        self.assertEqual(summary['payment_status'], 'PAID')
        self.assertEqual(invoice.payment_status, 'PAID')

    # -------------------------------------------------------------
    # 4. Multi-Invoice Allocation from Single Payment Voucher
    # -------------------------------------------------------------
    def test_04_one_payment_allocated_across_multiple_invoices(self):
        """A single lump-sum payment (e.g. 150k) can settle across multiple invoices."""
        self._create_posted_grn(self.po_a, Decimal('10.0000'))
        inv_1 = self._create_posted_bill(self.po_a, "INV-HIK-MULTI-1", line_qty=Decimal('6.0000'), unit_price=Decimal('10000.00')) # 60,000
        inv_2 = self._create_posted_bill(self.po_a, "INV-HIK-MULTI-2", line_qty=Decimal('4.0000'), unit_price=Decimal('10000.00')) # 40,000

        # One payment of 90,000 (settles 60k on inv_1 and 30k on inv_2)
        payment = create_vendor_payment(
            company_id=self.company_a.id,
            vendor_id=self.vendor_a.id,
            payment_date=date.today(),
            amount=Decimal('90000.00'),
            payment_method='CHEQUE',
            cheque_number='CHQ-554411',
            allocations_data=[
                {'invoice_id': str(inv_1.id), 'amount': Decimal('60000.00')},
                {'invoice_id': str(inv_2.id), 'amount': Decimal('30000.00')},
            ],
            user=self.user_a,
            auto_post=True
        )

        self.assertEqual(payment.allocations.count(), 2)
        
        # Inv 1 fully paid
        sum_1 = get_invoice_payment_summary(inv_1)
        self.assertEqual(sum_1['paid_amount'], Decimal('60000.00'))
        self.assertEqual(sum_1['outstanding_amount'], Decimal('0.00'))
        self.assertEqual(sum_1['payment_status'], 'PAID')

        # Inv 2 partially paid
        sum_2 = get_invoice_payment_summary(inv_2)
        self.assertEqual(sum_2['paid_amount'], Decimal('30000.00'))
        self.assertEqual(sum_2['outstanding_amount'], Decimal('10000.00'))
        self.assertEqual(sum_2['payment_status'], 'PARTIALLY_PAID')

    # -------------------------------------------------------------
    # 5. Overpayment Protection
    # -------------------------------------------------------------
    def test_05_overpayment_protection_blocks_excess_allocation(self):
        """Allocating more than the invoice's outstanding balance is blocked with a validation error."""
        self._create_posted_grn(self.po_a, Decimal('10.0000'))
        invoice = self._create_posted_bill(self.po_a, "INV-HIK-OVERPAY", due_in_days=30) # Total 100,000

        # Attempt to allocate 150,000 on a 100,000 invoice
        with self.assertRaises(ValidationError) as ctx:
            create_vendor_payment(
                company_id=self.company_a.id,
                vendor_id=self.vendor_a.id,
                payment_date=date.today(),
                amount=Decimal('150000.00'),
                allocations_data=[{'invoice_id': str(invoice.id), 'amount': Decimal('150000.00')}],
                user=self.user_a,
                auto_post=False
            )
        self.assertIn("Overpayment blocked", str(ctx.exception))

    # -------------------------------------------------------------
    # 6. Overdue Derivation
    # -------------------------------------------------------------
    def test_06_overdue_calculation_for_past_due_invoices(self):
        """When due_date < today and outstanding > 0, status is computed as OVERDUE."""
        self._create_posted_grn(self.po_a, Decimal('10.0000'))
        # Create invoice that was due 10 days ago
        invoice = self._create_posted_bill(self.po_a, "INV-HIK-OVERDUE", due_in_days=-10)

        summary = get_invoice_payment_summary(invoice)
        self.assertTrue(summary['is_overdue'])
        self.assertEqual(summary['payment_status'], 'OVERDUE')

        # Make partial payment (still overdue because balance remains)
        create_vendor_payment(
            company_id=self.company_a.id,
            vendor_id=self.vendor_a.id,
            payment_date=date.today(),
            amount=Decimal('20000.00'),
            allocations_data=[{'invoice_id': str(invoice.id), 'amount': Decimal('20000.00')}],
            user=self.user_a,
            auto_post=True
        )

        sum_after_part = get_invoice_payment_summary(invoice)
        self.assertTrue(sum_after_part['is_overdue'])
        self.assertEqual(sum_after_part['payment_status'], 'OVERDUE')

        # Pay remaining 80,000 (no longer overdue once fully paid)
        create_vendor_payment(
            company_id=self.company_a.id,
            vendor_id=self.vendor_a.id,
            payment_date=date.today(),
            amount=Decimal('80000.00'),
            allocations_data=[{'invoice_id': str(invoice.id), 'amount': Decimal('80000.00')}],
            user=self.user_a,
            auto_post=True
        )

        sum_after_full = get_invoice_payment_summary(invoice)
        self.assertFalse(sum_after_full['is_overdue'])
        self.assertEqual(sum_after_full['payment_status'], 'PAID')

    # -------------------------------------------------------------
    # 7. Payment Reversal Restores Payable Liability
    # -------------------------------------------------------------
    def test_07_payment_reversal_restores_invoice_balance_accurately(self):
        """Reversing a posted payment atomically restores the outstanding balance and payment status."""
        self._create_posted_grn(self.po_a, Decimal('10.0000'))
        invoice = self._create_posted_bill(self.po_a, "INV-HIK-REV", due_in_days=30)

        # Pay 100,000 (invoice becomes PAID)
        payment = create_vendor_payment(
            company_id=self.company_a.id,
            vendor_id=self.vendor_a.id,
            payment_date=date.today(),
            amount=Decimal('100000.00'),
            allocations_data=[{'invoice_id': str(invoice.id), 'amount': Decimal('100000.00')}],
            user=self.user_a,
            auto_post=True
        )
        self.assertEqual(get_invoice_payment_summary(invoice)['payment_status'], 'PAID')

        # Reverse payment with reason
        rev_payment = reverse_vendor_payment(
            payment.id,
            reversal_reason="Cheque bounced by bank due to signature mismatch",
            user=self.user_a
        )
        self.assertEqual(rev_payment.status, 'REVERSED')
        self.assertEqual(rev_payment.reversed_by, self.user_a)
        self.assertIn("bounced", rev_payment.reversal_reason)

        # Verify invoice is restored to UNPAID with 100k outstanding
        invoice.refresh_from_db()
        rev_summary = get_invoice_payment_summary(invoice)
        self.assertEqual(rev_summary['paid_amount'], Decimal('0.00'))
        self.assertEqual(rev_summary['outstanding_amount'], Decimal('100000.00'))
        self.assertEqual(rev_summary['payment_status'], 'UNPAID')
        self.assertEqual(invoice.payment_status, 'UNPAID')

    # -------------------------------------------------------------
    # 8. Vendor Payable Summary Totals
    # -------------------------------------------------------------
    def test_08_vendor_payable_summary_metrics(self):
        """Vendor summary correctly aggregates total purchases, total paid, outstanding, and overdue."""
        self._create_posted_grn(self.po_a, Decimal('10.0000'))
        inv_active = self._create_posted_bill(self.po_a, "INV-HIK-ACTIVE", due_in_days=30, line_qty=Decimal('6.0000'), unit_price=Decimal('10000.00')) # 60k
        inv_overdue = self._create_posted_bill(self.po_a, "INV-HIK-OVERDUE-2", due_in_days=-5, line_qty=Decimal('4.0000'), unit_price=Decimal('10000.00')) # 40k

        # Pay 20k against active invoice
        create_vendor_payment(
            company_id=self.company_a.id,
            vendor_id=self.vendor_a.id,
            payment_date=date.today(),
            amount=Decimal('20000.00'),
            allocations_data=[{'invoice_id': str(inv_active.id), 'amount': Decimal('20000.00')}],
            user=self.user_a,
            auto_post=True
        )

        summary = get_vendor_payable_summary(self.vendor_a.id, self.company_a.id)
        self.assertEqual(summary['total_purchases'], Decimal('100000.00'))
        self.assertEqual(summary['total_paid'], Decimal('20000.00'))
        self.assertEqual(summary['outstanding_payable'], Decimal('80000.00'))
        self.assertEqual(summary['overdue_payable'], Decimal('40000.00'))
        self.assertEqual(summary['total_posted_invoices_count'], 2)
        self.assertEqual(summary['unpaid_invoices_count'], 2)
        self.assertEqual(summary['overdue_invoices_count'], 1)

    # -------------------------------------------------------------
    # 9. Tenant Isolation
    # -------------------------------------------------------------
    def test_09_cross_tenant_payment_isolation(self):
        """Tenant B cannot view, allocate, or post payments against Tenant A invoices."""
        self._create_posted_grn(self.po_a, Decimal('10.0000'))
        inv_a = self._create_posted_bill(self.po_a, "INV-HIK-TENANT-A", due_in_days=30)

        # Tenant B attempts to allocate payment to Tenant A invoice
        self.client.force_authenticate(user=self.user_b)
        response = self.client.post('/api/purchasing/payments/', {
            'vendor': str(self.vendor_b.id),
            'payment_date': date.today().isoformat(),
            'amount': '50000.00',
            'allocations': [{'invoice_id': str(inv_a.id), 'amount': '50000.00'}]
        }, format='json')

        # Either 403 (company context mismatch from middleware) or 400 (validation error
        # from service layer) correctly signals the cross-tenant request was rejected.
        self.assertIn(response.status_code, (status.HTTP_400_BAD_REQUEST, status.HTTP_403_FORBIDDEN))

    # -------------------------------------------------------------
    # 10. REST API Endpoints Integration
    # -------------------------------------------------------------
    def test_10_rest_api_payables_and_payment_endpoints(self):
        """Verify REST API payables list, payment creation, posting, and reversal."""
        self._create_posted_grn(self.po_a, Decimal('10.0000'))
        inv = self._create_posted_bill(self.po_a, "INV-HIK-API-1", due_in_days=30)

        self.client.force_authenticate(user=self.user_a)
        # Attach the company context header required by the purchasing viewset middleware
        self.client.credentials(HTTP_X_COMPANY_ID=str(self.company_a.id))

        # GET /api/purchasing/documents/payables/
        res_ap = self.client.get('/api/purchasing/documents/payables/')
        self.assertEqual(res_ap.status_code, status.HTTP_200_OK)
        self.assertTrue(len(res_ap.data) >= 1)
        found_inv = next((item for item in res_ap.data if item['invoice_id'] == str(inv.id)), None)
        self.assertIsNotNone(found_inv)
        self.assertEqual(Decimal(str(found_inv['outstanding_amount'])), Decimal('100000.00'))

        # POST /api/purchasing/payments/ (Create Draft)
        res_create = self.client.post('/api/purchasing/payments/', {
            'vendor': str(self.vendor_a.id),
            'payment_date': date.today().isoformat(),
            'amount': '50000.00',
            'payment_method': 'BANK_TRANSFER',
            'bank_cash_account': 'HBL Corporate Account',
            'allocations': [{'invoice_id': str(inv.id), 'amount': '50000.00'}]
        }, format='json')
        self.assertEqual(res_create.status_code, status.HTTP_201_CREATED)
        payment_id = res_create.data['id']
        self.assertEqual(res_create.data['status'], 'DRAFT')

        # POST /api/purchasing/payments/{id}/post_payment/
        res_post = self.client.post(f'/api/purchasing/payments/{payment_id}/post_payment/')
        self.assertEqual(res_post.status_code, status.HTTP_200_OK)
        self.assertEqual(res_post.data['status'], 'POSTED')

        # GET /api/purchasing/vendors/{id}/payable_summary/
        res_ven_sum = self.client.get(f'/api/purchasing/vendors/{self.vendor_a.id}/payable_summary/')
        self.assertEqual(res_ven_sum.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(str(res_ven_sum.data['total_paid'])), Decimal('50000.00'))
        self.assertEqual(Decimal(str(res_ven_sum.data['outstanding_payable'])), Decimal('50000.00'))

        # POST /api/purchasing/payments/{id}/reverse_payment/
        res_rev = self.client.post(f'/api/purchasing/payments/{payment_id}/reverse_payment/', {
            'reversal_reason': 'Transaction reversed by bank'
        }, format='json')
        self.assertEqual(res_rev.status_code, status.HTTP_200_OK)
        self.assertEqual(res_rev.data['status'], 'REVERSED')
