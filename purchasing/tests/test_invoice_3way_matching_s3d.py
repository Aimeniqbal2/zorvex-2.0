import uuid
from decimal import Decimal
from datetime import date
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from rest_framework.test import APIClient

from companies.models import Company
from platform_core.models import Warehouse
from inventory.models import Item, Category, InventoryBalance
from crm.models import CRMEntity
from purchasing.models import (
    Vendor, VendorCategory, ProcurementDocument, ProcurementLine, ProcurementAuditTrail
)
from purchasing.services.goods_receipt_service import (
    create_goods_receipt, post_goods_receipt
)
from purchasing.services.invoice_service import (
    create_vendor_invoice, run_three_way_match, override_mismatch,
    approve_vendor_invoice, post_vendor_bill, cancel_vendor_invoice, get_po_billing_summary
)


User = get_user_model()


class VendorInvoice3WayMatchTests(TestCase):
    def setUp(self):
        # Company A
        self.company = Company.objects.create(name="SecureCorp PK", business_type="security")
        self.user = User.objects.create_user(
            username="finance_officer",
            email="finance@securecorp.pk",
            company=self.company,
            is_staff=True,
        )
        self.admin = User.objects.create_superuser(
            username="finance_manager",
            email="manager@securecorp.pk",
            company=self.company,
        )

        # Company B (for multi-tenant isolation testing)
        self.other_company = Company.objects.create(name="Rival Security", business_type="security")
        self.other_user = User.objects.create_user(
            username="other_officer",
            email="other@rival.pk",
            company=self.other_company,
        )


        # Warehouses
        self.warehouse = Warehouse.objects.create(
            company=self.company,
            name="Main Security Depot",
            code="DEPOT-01"
        )
        self.other_warehouse = Warehouse.objects.create(
            company=self.other_company,
            name="Other Warehouse",
            code="OTH-01"
        )

        # Category & Items
        self.item_cat = Category.objects.create(company=self.company, name="CCTV Equipment")

        self.cctv_camera = Item.objects.create(
            company=self.company,
            category=self.item_cat,
            name="4K PTZ Dome Camera",
            sku="CAM-PTZ-4K",
            cost_price=Decimal('15000.00'),
        )
        self.nvr_unit = Item.objects.create(
            company=self.company,
            category=self.item_cat,
            name="32-Channel NVR Server",
            sku="NVR-32CH",
            cost_price=Decimal('45000.00'),
        )

        # CRM Entity & Vendor
        self.crm_supplier = CRMEntity.objects.create(
            company=self.company,
            entity_type='SUPPLIER',
            name="Hikvision Direct Dist"
        )

        self.vendor_cat = VendorCategory.objects.create(company=self.company, name="Hardware Suppliers")
        self.vendor = Vendor.objects.create(
            company=self.company,
            crm_entity=self.crm_supplier,
            category=self.vendor_cat,
            name="Hikvision Direct Dist",
            code="VEND-HIK"
        )

        # Client setup
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

    def _create_approved_po(self, lines=None):
        po = ProcurementDocument.objects.create(
            company=self.company,
            document_type='PURCHASE_ORDER',
            status='APPROVED',
            document_date=date.today(),
            vendor=self.vendor,
            warehouse=self.warehouse,
            currency='PKR',
            created_by=self.user,
        )
        if not lines:
            lines = [
                {'item': self.cctv_camera, 'quantity': Decimal('20.00'), 'unit_price': Decimal('15000.00')},
            ]
        for idx, l in enumerate(lines, start=1):
            item = l.get('item') or Item.objects.get(id=l['item_id'])
            qty = Decimal(str(l['quantity']))
            price = Decimal(str(l['unit_price']))
            ProcurementLine.objects.create(
                company=self.company,
                document=po,
                item=item,
                quantity=qty,
                unit_price=price,
                total_amount=qty * price,
                line_number=idx,
            )
        po.refresh_from_db()
        return po


    def test_invoice_creation_and_auto_numbering(self):
        """Creates vendor invoice, verifies INV-0001 auto-numbering, backend totals, and link to PO."""
        po = self._create_approved_po()
        po_line = po.lines.first()

        inv_data = {
            'vendor_invoice_number': 'VEND-INV-9901',
            'document_date': str(date.today()),
            'due_date': str(date.today()),
            'freight_amount': '500.00',
            'lines': [
                {
                    'po_line_id': str(po_line.id),
                    'quantity': '20',
                    'unit_price': '15000.00',
                    'tax_amount': '1500.00',
                    'discount_amount': '1000.00',
                }
            ]
        }

        invoice = create_vendor_invoice(po, inv_data, self.user)
        self.assertEqual(invoice.number, 'INV-0001')
        self.assertEqual(invoice.document_type, 'VENDOR_INVOICE')
        self.assertEqual(invoice.vendor_invoice_number, 'VEND-INV-9901')
        self.assertEqual(invoice.parent_document, po)
        self.assertEqual(invoice.vendor, self.vendor)

        # Backend calculated totals:
        # Subtotal: 20 * 15000 = 300,000
        # Discount: 1,000
        # Tax: 1,500
        # Freight: 500
        # Grand Total = 300,000 - 1,000 + 1,500 + 500 = 301,000.00
        self.assertEqual(invoice.subtotal_amount, Decimal('300000.00'))
        self.assertEqual(invoice.discount_amount, Decimal('1000.00'))
        self.assertEqual(invoice.tax_amount, Decimal('1500.00'))
        self.assertEqual(invoice.freight_amount, Decimal('500.00'))
        self.assertEqual(invoice.total_amount, Decimal('301000.00'))

    def test_duplicate_vendor_invoice_number_blocked(self):
        """Duplicate vendor invoice number for the same vendor/company is blocked."""
        po = self._create_approved_po()
        po_line = po.lines.first()

        inv_data = {
            'vendor_invoice_number': 'DUP-BILL-100',
            'lines': [{'po_line_id': str(po_line.id), 'quantity': '10'}]
        }
        create_vendor_invoice(po, inv_data, self.user)

        # Attempt duplicate
        with self.assertRaises(ValidationError) as ctx:
            create_vendor_invoice(po, inv_data, self.user)
        self.assertIn('already exists', str(ctx.exception))

    def test_three_way_match_full_match(self):
        """PO 20 @ 15,000 + GRN 20 accepted + Invoice 20 @ 15,000 -> MATCHED."""
        po = self._create_approved_po()
        po_line = po.lines.first()

        # Receive 20 goods via GRN
        grn_data = {
            'warehouse': self.warehouse,
            'document_date': str(date.today()),
            'lines': [{'po_line_id': str(po_line.id), 'quantity': '20', 'accepted_quantity': '20'}]
        }
        grn = create_goods_receipt(po, grn_data, self.user)
        post_goods_receipt(grn, self.user)

        # Create Invoice matching exact quantity and price
        inv_data = {
            'vendor_invoice_number': 'INV-EXACT-20',
            'lines': [{'po_line_id': str(po_line.id), 'quantity': '20', 'unit_price': '15000.00'}]
        }
        invoice = create_vendor_invoice(po, inv_data, self.user)

        self.assertEqual(invoice.match_status, 'MATCHED')
        self.assertEqual(invoice.status, 'MATCHED')
        self.assertEqual(invoice.match_details['overall_match_status'], 'MATCHED')
        self.assertEqual(len(invoice.match_details['mismatch_flags']), 0)

    def test_quantity_mismatch_when_invoicing_unreceived_goods(self):
        """PO 20 @ 15,000 + GRN 18 accepted + Invoice 20 @ 15,000 -> QUANTITY_MISMATCH."""
        po = self._create_approved_po()
        po_line = po.lines.first()

        # GRN with only 18 accepted (2 rejected)
        grn_data = {
            'warehouse': self.warehouse,
            'document_date': str(date.today()),
            'lines': [{'po_line_id': str(po_line.id), 'quantity': '20', 'accepted_quantity': '18', 'rejected_quantity': '2'}]
        }
        grn = create_goods_receipt(po, grn_data, self.user)
        post_goods_receipt(grn, self.user)

        # Vendor bills full 20
        inv_data = {
            'vendor_invoice_number': 'INV-QTY-MISMATCH',
            'lines': [{'po_line_id': str(po_line.id), 'quantity': '20', 'unit_price': '15000.00'}]
        }
        invoice = create_vendor_invoice(po, inv_data, self.user)

        self.assertEqual(invoice.match_status, 'QUANTITY_MISMATCH')
        self.assertEqual(invoice.status, 'MISMATCH')
        self.assertIn('QUANTITY_MISMATCH', invoice.match_details['mismatch_flags'])

    def test_price_mismatch_with_variance_details(self):
        """PO 20 @ 15,000 + GRN 20 accepted + Invoice 20 @ 16,500 -> PRICE_MISMATCH with +10% variance."""
        po = self._create_approved_po()
        po_line = po.lines.first()

        grn_data = {
            'warehouse': self.warehouse,
            'document_date': str(date.today()),
            'lines': [{'po_line_id': str(po_line.id), 'quantity': '20', 'accepted_quantity': '20'}]
        }
        grn = create_goods_receipt(po, grn_data, self.user)
        post_goods_receipt(grn, self.user)

        inv_data = {
            'vendor_invoice_number': 'INV-PRICE-MISMATCH',
            'lines': [{'po_line_id': str(po_line.id), 'quantity': '20', 'unit_price': '16500.00'}]
        }
        invoice = create_vendor_invoice(po, inv_data, self.user)

        self.assertEqual(invoice.match_status, 'PRICE_MISMATCH')
        self.assertEqual(invoice.status, 'MISMATCH')
        line_detail = invoice.match_details['lines'][0]
        self.assertEqual(line_detail['expected_price'], 15000.0)
        self.assertEqual(line_detail['invoiced_price'], 16500.0)
        self.assertEqual(line_detail['price_variance'], 1500.0)
        self.assertEqual(line_detail['variance_percentage'], 10.0)

    def test_partial_invoicing_support(self):
        """PO 100: GRN 1 accepted 60 -> Invoice 1 for 60 MATCHED. Later GRN 2 accepted 40 -> Invoice 2 for 40 MATCHED."""
        po = self._create_approved_po(lines=[
            {'item_id': str(self.cctv_camera.id), 'quantity': '100', 'unit_price': '15000.00'}
        ])
        po_line = po.lines.first()

        # Receipt 1: 60 units
        grn1 = create_goods_receipt(po, {
            'warehouse': self.warehouse,
            'lines': [{'po_line_id': str(po_line.id), 'quantity': '60', 'accepted_quantity': '60'}]
        }, self.user)
        post_goods_receipt(grn1, self.user)

        # Invoice 1: 60 units
        inv1 = create_vendor_invoice(po, {
            'vendor_invoice_number': 'INV-PART-1',
            'lines': [{'po_line_id': str(po_line.id), 'quantity': '60', 'unit_price': '15000.00'}]
        }, self.user)
        self.assertEqual(inv1.match_status, 'MATCHED')

        # Approve and Post Invoice 1
        approve_vendor_invoice(inv1, self.admin)
        post_vendor_bill(inv1, self.admin)
        po_line.refresh_from_db()
        self.assertEqual(po_line.billed_quantity, Decimal('60.0000'))

        # Receipt 2: remaining 40 units
        grn2 = create_goods_receipt(po, {
            'warehouse': self.warehouse,
            'lines': [{'po_line_id': str(po_line.id), 'quantity': '40', 'accepted_quantity': '40'}]
        }, self.user)
        post_goods_receipt(grn2, self.user)

        # Invoice 2: 40 units
        inv2 = create_vendor_invoice(po, {
            'vendor_invoice_number': 'INV-PART-2',
            'lines': [{'po_line_id': str(po_line.id), 'quantity': '40', 'unit_price': '15000.00'}]
        }, self.user)
        self.assertEqual(inv2.match_status, 'MATCHED')

        approve_vendor_invoice(inv2, self.admin)
        post_vendor_bill(inv2, self.admin)
        po_line.refresh_from_db()
        self.assertEqual(po_line.billed_quantity, Decimal('100.0000'))

    def test_over_billing_blocked_by_matching(self):
        """Invoicing 80 when only 60 accepted results in QUANTITY_MISMATCH."""
        po = self._create_approved_po(lines=[
            {'item_id': str(self.cctv_camera.id), 'quantity': '100', 'unit_price': '15000.00'}
        ])
        po_line = po.lines.first()

        grn = create_goods_receipt(po, {
            'warehouse': self.warehouse,
            'lines': [{'po_line_id': str(po_line.id), 'quantity': '60', 'accepted_quantity': '60'}]
        }, self.user)
        post_goods_receipt(grn, self.user)

        inv = create_vendor_invoice(po, {
            'vendor_invoice_number': 'INV-OVER-BILL',
            'lines': [{'po_line_id': str(po_line.id), 'quantity': '80', 'unit_price': '15000.00'}]
        }, self.user)

        self.assertEqual(inv.match_status, 'QUANTITY_MISMATCH')
        self.assertEqual(inv.status, 'MISMATCH')

    def test_mismatch_override_and_approval_workflow(self):
        """Mismatched invoice requires authorized override before approval; ordinary approval fails."""
        po = self._create_approved_po()
        po_line = po.lines.first()

        # No GRN received yet -> Invoicing 20 causes QUANTITY_MISMATCH
        inv = create_vendor_invoice(po, {
            'vendor_invoice_number': 'INV-PRE-PAY',
            'lines': [{'po_line_id': str(po_line.id), 'quantity': '20', 'unit_price': '15000.00'}]
        }, self.user)
        self.assertEqual(inv.status, 'MISMATCH')

        # Direct approval without override raises error
        with self.assertRaises(ValidationError):
            approve_vendor_invoice(inv, self.admin)

        # Authorized override with reason
        override_mismatch(inv, self.admin, reason="Advance milestone billing approved per commercial contract clause 4.2")
        inv.refresh_from_db()
        self.assertEqual(inv.status, 'MATCHED')
        self.assertEqual(inv.override_by, self.admin)
        self.assertIn("Advance milestone billing", inv.override_reason)

        # Now approval succeeds
        approve_vendor_invoice(inv, self.admin)
        inv.refresh_from_db()
        self.assertEqual(inv.status, 'APPROVED')

        # Posting to AP succeeds
        post_vendor_bill(inv, self.admin)
        inv.refresh_from_db()
        self.assertEqual(inv.status, 'POSTED')
        self.assertTrue(inv.ap_ready)
        self.assertEqual(inv.payment_status, 'UNPAID')

    def test_cross_tenant_invoice_blocked(self):
        """Creating invoice against PO or vendor of another company raises validation error."""
        po = self._create_approved_po()
        po_line = po.lines.first()

        # Other company attempts to bill this PO
        other_po = ProcurementDocument.objects.create(
            company=self.other_company,
            document_type='PURCHASE_ORDER',
            status='APPROVED',
            number='PO-OTH-100',
            document_date=date.today(),
            crm_entity=CRMEntity.objects.create(company=self.other_company, entity_type='SUPPLIER', name='Other Sup'),
        )
        with self.assertRaises(ValidationError):
            # Attempting to mix Company A's PO line into Company B's PO invoice
            create_vendor_invoice(other_po, {
                'lines': [{'po_line_id': str(po_line.id), 'quantity': '10'}]
            }, self.other_user)

    def test_api_vendor_invoice_lifecycle(self):
        """Tests REST API actions: create_invoice, run_match, override_mismatch, approve_invoice, post_bill, billing_summary."""
        po = self._create_approved_po()
        po_line = po.lines.first()

        # 1. Create Invoice via API
        payload = {
            'vendor_invoice_number': 'API-INV-001',
            'lines': [{'po_line_id': str(po_line.id), 'quantity': '20', 'unit_price': '16000.00'}]
        }
        resp = self.client.post(f'/api/purchasing/documents/{po.id}/create_invoice/', payload, format='json')
        self.assertEqual(resp.status_code, 201)
        inv_id = resp.data['id']
        self.assertEqual(resp.data['status'], 'MISMATCH')

        # 2. Run match endpoint
        match_resp = self.client.post(f'/api/purchasing/documents/{inv_id}/run_match/', {}, format='json')
        self.assertEqual(match_resp.status_code, 200)
        self.assertIn('match_details', match_resp.data)

        # 3. Override mismatch via API
        override_resp = self.client.post(
            f'/api/purchasing/documents/{inv_id}/override_mismatch/',
            {'reason': 'Authorized price index adjustment'},
            format='json'
        )
        self.assertEqual(override_resp.status_code, 200)
        self.assertEqual(override_resp.data['status'], 'MATCHED')

        # 4. Approve via API
        approve_resp = self.client.post(f'/api/purchasing/documents/{inv_id}/approve_invoice/', {}, format='json')
        self.assertEqual(approve_resp.status_code, 200)
        self.assertEqual(approve_resp.data['status'], 'APPROVED')

        # 5. Post bill via API
        post_resp = self.client.post(f'/api/purchasing/documents/{inv_id}/post_bill/', {}, format='json')
        self.assertEqual(post_resp.status_code, 200)
        self.assertEqual(post_resp.data['status'], 'POSTED')
        self.assertTrue(post_resp.data['ap_ready'])

        # 6. Billing Summary endpoint on PO
        summary_resp = self.client.get(f'/api/purchasing/documents/{po.id}/billing_summary/')
        self.assertEqual(summary_resp.status_code, 200)
        self.assertEqual(len(summary_resp.data['invoices']), 1)
        self.assertEqual(summary_resp.data['invoices'][0]['number'], resp.data['number'])
