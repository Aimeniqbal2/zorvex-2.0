"""
purchasing/tests/test_purchase_returns_s3f.py

Comprehensive Phase S-3F unit and integration test suite:
- Purchase return creation and line calculations
- Partial returns and over-return prevention
- Universal inventory stock reversal on POSTED returns
- Serial-tracked item return state transitions
- Rejected-at-GRN quantity non-inventory credit note handling
- Credit note payable adjustments & non-negative payable guarantee on paid bills
- Idempotency guards against duplicate postings
- Strict multi-tenant isolation
- REST API lifecycle endpoints
"""

from decimal import Decimal
from datetime import date
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from rest_framework.test import APIClient
from rest_framework import status

from companies.models import Company
from platform_core.models import Warehouse, ModuleDefinition, CompanyModule
from crm.models import CRMEntity
from inventory.models import Category, Item, InventoryBalance, ItemSerial, StockMovement
from purchasing.models import (
    Vendor,
    ProcurementDocument,
    ProcurementLine,
    PurchaseReturn,
    PurchaseReturnLine,
    VendorCreditNote
)
from purchasing.services.goods_receipt_service import (
    create_goods_receipt,
    post_goods_receipt
)
from purchasing.services.payment_service import (
    create_vendor_payment,
    post_vendor_payment,
    get_invoice_payment_summary
)
from purchasing.services.return_service import (
    create_purchase_return,
    submit_purchase_return,
    approve_purchase_return,
    post_purchase_return,
    cancel_purchase_return,
    get_returnable_grn_lines,
    get_vendor_returns_summary
)

User = get_user_model()


class PurchaseReturnsS3FTestCase(TestCase):
    def setUp(self):
        # Module definition for API permissions
        self._purchasing_module, _ = ModuleDefinition.objects.get_or_create(
            code='purchasing',
            defaults={'name': 'Purchasing', 'category': 'operations', 'is_active': True}
        )

        # 1. Primary Tenant setup
        self.company1 = Company.objects.create(name="Apex Defense Systems")
        CompanyModule.objects.get_or_create(
            company=self.company1,
            module=self._purchasing_module,
            defaults={'enabled': True}
        )
        self.user1 = User.objects.create_user(
            username="security_proc_lead",
            email="lead@apexdefense.com",
            password="SecurePassword123!",
            company_id=self.company1.id,
            role="admin"
        )
        self.warehouse1 = Warehouse.objects.create(
            company=self.company1,
            name="Main Security Depot",
            code="WH-APEX-01"
        )
        self.crm_vendor1 = CRMEntity.objects.create(
            company=self.company1,
            entity_type='VENDOR',
            name="Hikvision Pakistan (Pvt) Ltd"
        )
        self.vendor1 = Vendor.objects.create(
            company=self.company1,
            name="Hikvision Pakistan (Pvt) Ltd",
            code="VEND-HIK-01",
            crm_entity=self.crm_vendor1
        )
        self.cat1 = Category.objects.create(company=self.company1, name="CCTV Equipment")
        self.item_camera = Item.objects.create(
            company=self.company1,
            category=self.cat1,
            name="4K PTZ Dome Camera",
            sku="CAM-4K-PTZ",
            track_inventory=True,
            track_serial_number=False,
            cost_price=Decimal("25000.00")
        )
        self.item_radio = Item.objects.create(
            company=self.company1,
            category=self.cat1,
            name="Digital Tactical Radio",
            sku="RAD-VHF-TAC",
            track_inventory=True,
            track_serial_number=True,
            cost_price=Decimal("40000.00")
        )

        # 2. Secondary Tenant setup (for cross-tenant tests)
        self.company2 = Company.objects.create(name="Shield Guards Ltd")
        self.user2 = User.objects.create_user(
            username="shield_officer",
            email="officer@shieldguards.com",
            password="SecurePassword123!",
            company_id=self.company2.id,
            role="admin"
        )
        self.warehouse2 = Warehouse.objects.create(
            company=self.company2,
            name="Shield Central Depot",
            code="WH-SHIELD-01"
        )
        self.vendor2 = Vendor.objects.create(
            company=self.company2,
            name="Dahua Tech PK",
            code="VEND-DAH-02"
        )

        # Helper method: Create Approved PO and Posted GRN
        self.po1 = ProcurementDocument.objects.create(
            company=self.company1,
            document_type='PURCHASE_ORDER',
            status='APPROVED',
            document_date=date.today(),
            vendor=self.vendor1,
            crm_entity=self.crm_vendor1,
            warehouse=self.warehouse1,
            total_amount=Decimal('2500000.00'),
            created_by=self.user1
        )
        self.po_line1 = ProcurementLine.objects.create(
            company=self.company1,
            document=self.po1,
            item=self.item_camera,
            quantity=Decimal('100.0000'),
            unit_price=Decimal('25000.00'),
            total_amount=Decimal('2500000.00'),
            line_number=1
        )

        # Receive 100 Cameras on GRN
        self.grn1 = create_goods_receipt(
            po=self.po1,
            grn_data={
                'warehouse': self.warehouse1,
                'document_date': date.today(),
                'reference_number': 'DC-HIK-8891',
                'lines': [
                    {
                        'po_line_id': str(self.po_line1.id),
                        'item_id': str(self.item_camera.id),
                        'quantity': Decimal('100.0000'),
                        'accepted_quantity': Decimal('100.0000'),
                        'rejected_quantity': Decimal('0.0000'),
                    }
                ]
            },
            user=self.user1
        )
        self.grn1 = post_goods_receipt(self.grn1, user=self.user1)
        self.grn_line1 = self.grn1.lines.first()

    def test_01_return_creation(self):
        """Test creating a DRAFT purchase return with lines and auto-numbering."""
        ret = create_purchase_return(
            company_id=self.company1.id,
            vendor_id=self.vendor1.id,
            warehouse_id=self.warehouse1.id,
            return_date=date.today(),
            reason='DEFECTIVE',
            goods_receipt_id=self.grn1.id,
            lines_data=[
                {
                    'grn_line_id': str(self.grn_line1.id),
                    'item_id': str(self.item_camera.id),
                    'return_quantity': Decimal('10.0000'),
                    'unit_cost': Decimal('25000.00'),
                    'reason': 'Lens defective'
                }
            ],
            notes="Returning 10 units with blurred optical sensor.",
            user=self.user1
        )
        self.assertIsNotNone(ret.id)
        self.assertTrue(ret.return_number.startswith('RET-'))
        self.assertEqual(ret.status, 'DRAFT')
        self.assertEqual(ret.total_return_amount, Decimal('250000.00'))
        self.assertEqual(ret.lines.count(), 1)
        
        line = ret.lines.first()
        self.assertEqual(line.return_quantity, Decimal('10.0000'))
        self.assertEqual(line.total_amount, Decimal('250000.00'))

    def test_02_partial_return(self):
        """Test sequential partial returns: 100 received -> Return 10 -> Return 5 -> Remaining 85."""
        # Check initial returnable lines
        lines = get_returnable_grn_lines(self.grn1)
        self.assertEqual(lines[0]['returnable_qty'], 100.0)

        # 1st Return: 10 units
        ret1 = create_purchase_return(
            company_id=self.company1.id,
            vendor_id=self.vendor1.id,
            warehouse_id=self.warehouse1.id,
            return_date=date.today(),
            goods_receipt_id=self.grn1.id,
            lines_data=[
                {
                    'grn_line_id': str(self.grn_line1.id),
                    'item_id': str(self.item_camera.id),
                    'return_quantity': Decimal('10.0000'),
                    'unit_cost': Decimal('25000.00'),
                }
            ],
            user=self.user1
        )
        post_purchase_return(ret1, user=self.user1)

        # Check returnable lines after 1st return
        lines = get_returnable_grn_lines(self.grn1)
        self.assertEqual(lines[0]['returnable_qty'], 90.0)

        # 2nd Return: 5 units
        ret2 = create_purchase_return(
            company_id=self.company1.id,
            vendor_id=self.vendor1.id,
            warehouse_id=self.warehouse1.id,
            return_date=date.today(),
            goods_receipt_id=self.grn1.id,
            lines_data=[
                {
                    'grn_line_id': str(self.grn_line1.id),
                    'item_id': str(self.item_camera.id),
                    'return_quantity': Decimal('5.0000'),
                    'unit_cost': Decimal('25000.00'),
                }
            ],
            user=self.user1
        )
        post_purchase_return(ret2, user=self.user1)

        # Check remaining returnable qty
        lines = get_returnable_grn_lines(self.grn1)
        self.assertEqual(lines[0]['returnable_qty'], 85.0)

    def test_03_over_return_blocked(self):
        """Test that attempting to return more than accepted available quantity is strictly blocked."""
        # Attempt to return 110 units when only 100 received
        with self.assertRaises(ValidationError) as ctx:
            create_purchase_return(
                company_id=self.company1.id,
                vendor_id=self.vendor1.id,
                warehouse_id=self.warehouse1.id,
                return_date=date.today(),
                goods_receipt_id=self.grn1.id,
                lines_data=[
                    {
                        'grn_line_id': str(self.grn_line1.id),
                        'item_id': str(self.item_camera.id),
                        'return_quantity': Decimal('110.0000'),
                        'unit_cost': Decimal('25000.00'),
                    }
                ],
                user=self.user1
            )
        self.assertIn("Over-return blocked", str(ctx.exception))

    def test_04_stock_decreases_only_on_posted_return(self):
        """Test that stock balance remains untouched in DRAFT/APPROVED and decrements ONLY on POSTED."""
        bal_before = InventoryBalance.objects.get(item=self.item_camera, warehouse=self.warehouse1).quantity
        self.assertEqual(bal_before, Decimal('100.0000'))

        # Create DRAFT return
        ret = create_purchase_return(
            company_id=self.company1.id,
            vendor_id=self.vendor1.id,
            warehouse_id=self.warehouse1.id,
            return_date=date.today(),
            goods_receipt_id=self.grn1.id,
            lines_data=[
                {
                    'grn_line_id': str(self.grn_line1.id),
                    'item_id': str(self.item_camera.id),
                    'return_quantity': Decimal('20.0000'),
                    'unit_cost': Decimal('25000.00'),
                }
            ],
            user=self.user1
        )
        # Check stock in DRAFT
        bal_draft = InventoryBalance.objects.get(item=self.item_camera, warehouse=self.warehouse1).quantity
        self.assertEqual(bal_draft, Decimal('100.0000'))

        # Approve return
        approve_purchase_return(ret, user=self.user1)
        bal_approved = InventoryBalance.objects.get(item=self.item_camera, warehouse=self.warehouse1).quantity
        self.assertEqual(bal_approved, Decimal('100.0000'))

        # Post return
        post_purchase_return(ret, user=self.user1)
        bal_posted = InventoryBalance.objects.get(item=self.item_camera, warehouse=self.warehouse1).quantity
        self.assertEqual(bal_posted, Decimal('80.0000'))

        # Verify StockMovement record created with PURCHASE_RETURN type
        movement = StockMovement.objects.filter(
            company=self.company1,
            item=self.item_camera,
            movement_type='PURCHASE_RETURN',
            reference=ret.return_number
        ).first()
        self.assertIsNotNone(movement)
        self.assertEqual(movement.quantity, Decimal('20.0000'))

    def test_05_rejected_grn_quantity_not_double_reversed(self):
        """Test that goods rejected during receipt (never in stock) do NOT trigger stock-out but generate credit."""
        # Create GRN with 10 accepted and 5 rejected
        po2 = ProcurementDocument.objects.create(
            company=self.company1,
            document_type='PURCHASE_ORDER',
            status='APPROVED',
            document_date=date.today(),
            vendor=self.vendor1,
            warehouse=self.warehouse1,
            total_amount=Decimal('375000.00')
        )
        po_line2 = ProcurementLine.objects.create(
            company=self.company1,
            document=po2,
            item=self.item_camera,
            quantity=Decimal('15.0000'),
            unit_price=Decimal('25000.00'),
            total_amount=Decimal('375000.00')
        )
        grn2 = create_goods_receipt(
            po=po2,
            grn_data={
                'warehouse': self.warehouse1,
                'document_date': date.today(),
                'lines': [
                    {
                        'po_line_id': str(po_line2.id),
                        'item_id': str(self.item_camera.id),
                        'quantity': Decimal('15.0000'),
                        'accepted_quantity': Decimal('10.0000'),
                        'rejected_quantity': Decimal('5.0000'),
                        'rejection_reason': 'Cracked outer glass'
                    }
                ]
            },
            user=self.user1
        )
        post_goods_receipt(grn2, user=self.user1)
        grn_line2 = grn2.lines.first()

        bal_start = InventoryBalance.objects.get(item=self.item_camera, warehouse=self.warehouse1).quantity

        # Return the 5 rejected items (is_rejected_at_grn=True)
        ret = create_purchase_return(
            company_id=self.company1.id,
            vendor_id=self.vendor1.id,
            warehouse_id=self.warehouse1.id,
            return_date=date.today(),
            goods_receipt_id=grn2.id,
            lines_data=[
                {
                    'grn_line_id': str(grn_line2.id),
                    'item_id': str(self.item_camera.id),
                    'return_quantity': Decimal('5.0000'),
                    'unit_cost': Decimal('25000.00'),
                    'is_rejected_at_grn': True,
                    'reason': 'Damaged in transit'
                }
            ],
            user=self.user1
        )
        ret, credit_note = post_purchase_return(ret, user=self.user1)

        # Inventory balance must NOT decrease (rejected items never entered usable stock)
        bal_end = InventoryBalance.objects.get(item=self.item_camera, warehouse=self.warehouse1).quantity
        self.assertEqual(bal_end, bal_start)

        # But financial credit note of 5 x 25,000 = 125,000 IS generated
        self.assertEqual(credit_note.amount, Decimal('125000.00'))

    def test_06_serialized_item_return(self):
        """Test returning serialized items: exact serials required, transitions to RETURNED status."""
        po_rad = ProcurementDocument.objects.create(
            company=self.company1,
            document_type='PURCHASE_ORDER',
            status='APPROVED',
            document_date=date.today(),
            vendor=self.vendor1,
            warehouse=self.warehouse1,
            total_amount=Decimal('80000.00')
        )
        po_line_rad = ProcurementLine.objects.create(
            company=self.company1,
            document=po_rad,
            item=self.item_radio,
            quantity=Decimal('2.0000'),
            unit_price=Decimal('40000.00'),
            total_amount=Decimal('80000.00')
        )
        grn_rad = create_goods_receipt(
            po=po_rad,
            grn_data={
                'warehouse': self.warehouse1,
                'document_date': date.today(),
                'lines': [
                    {
                        'po_line_id': str(po_line_rad.id),
                        'item_id': str(self.item_radio.id),
                        'quantity': Decimal('2.0000'),
                        'accepted_quantity': Decimal('2.0000'),
                        'serial_numbers': ['RAD-SN-001', 'RAD-SN-002']
                    }
                ]
            },
            user=self.user1
        )
        post_goods_receipt(grn_rad, user=self.user1)
        grn_line_rad = grn_rad.lines.first()

        # Both serials should be IN_STOCK
        self.assertEqual(ItemSerial.objects.get(company=self.company1, serial_number='RAD-SN-001').status, 'IN_STOCK')
        self.assertEqual(ItemSerial.objects.get(company=self.company1, serial_number='RAD-SN-002').status, 'IN_STOCK')

        # Return 1 serial (RAD-SN-001)
        ret_rad = create_purchase_return(
            company_id=self.company1.id,
            vendor_id=self.vendor1.id,
            warehouse_id=self.warehouse1.id,
            return_date=date.today(),
            goods_receipt_id=grn_rad.id,
            lines_data=[
                {
                    'grn_line_id': str(grn_line_rad.id),
                    'item_id': str(self.item_radio.id),
                    'return_quantity': Decimal('1.0000'),
                    'unit_cost': Decimal('40000.00'),
                    'serial_numbers': ['RAD-SN-001']
                }
            ],
            user=self.user1
        )
        post_purchase_return(ret_rad, user=self.user1)

        # RAD-SN-001 should now be RETURNED, RAD-SN-002 remains IN_STOCK
        self.assertEqual(ItemSerial.objects.get(company=self.company1, serial_number='RAD-SN-001').status, 'RETURNED')
        self.assertEqual(ItemSerial.objects.get(company=self.company1, serial_number='RAD-SN-002').status, 'IN_STOCK')

    def test_07_credit_note_adjusts_outstanding_payable(self):
        """Test that return credit note offsets linked invoice outstanding liability."""
        # Create posted vendor invoice of 500,000
        inv = ProcurementDocument.objects.create(
            company=self.company1,
            document_type='VENDOR_INVOICE',
            status='POSTED',
            document_date=date.today(),
            due_date=date.today(),
            vendor=self.vendor1,
            parent_document=self.po1,
            total_amount=Decimal('500000.00'),
            currency='PKR'
        )

        summary_before = get_invoice_payment_summary(inv)
        self.assertEqual(summary_before['outstanding_amount'], Decimal('500000.00'))

        # Return 2 cameras = 50,000 credit linked to this invoice
        ret = create_purchase_return(
            company_id=self.company1.id,
            vendor_id=self.vendor1.id,
            warehouse_id=self.warehouse1.id,
            return_date=date.today(),
            goods_receipt_id=self.grn1.id,
            vendor_invoice_id=inv.id,
            lines_data=[
                {
                    'grn_line_id': str(self.grn_line1.id),
                    'item_id': str(self.item_camera.id),
                    'return_quantity': Decimal('2.0000'),
                    'unit_cost': Decimal('25000.00'),
                }
            ],
            user=self.user1
        )
        ret, credit_note = post_purchase_return(ret, user=self.user1)

        self.assertEqual(credit_note.allocated_amount, Decimal('50000.00'))
        self.assertEqual(credit_note.unallocated_amount, Decimal('0.00'))

        # Check updated invoice summary
        summary_after = get_invoice_payment_summary(inv)
        self.assertEqual(summary_after['original_amount'], Decimal('500000.00'))
        self.assertEqual(summary_after['return_credit'], Decimal('50000.00'))
        self.assertEqual(summary_after['net_amount'], Decimal('450000.00'))
        self.assertEqual(summary_after['outstanding_amount'], Decimal('450000.00'))
        self.assertEqual(summary_after['payment_status'], 'PARTIALLY_PAID')

    def test_08_paid_invoice_creates_vendor_credit_instead_of_negative_payable(self):
        """Test non-negative payable rule: fully paid bill + return creates unallocated vendor credit."""
        inv = ProcurementDocument.objects.create(
            company=self.company1,
            document_type='VENDOR_INVOICE',
            status='POSTED',
            document_date=date.today(),
            vendor=self.vendor1,
            total_amount=Decimal('100000.00'),
            currency='PKR'
        )
        # Fully pay the 100,000 bill
        pay = create_vendor_payment(
            company_id=self.company1.id,
            vendor_id=self.vendor1.id,
            payment_date=date.today(),
            amount=Decimal('100000.00'),
            allocations_data=[{'invoice_id': str(inv.id), 'amount': Decimal('100000.00')}],
            user=self.user1,
            auto_post=True
        )

        summary_paid = get_invoice_payment_summary(inv)
        self.assertEqual(summary_paid['outstanding_amount'], Decimal('0.00'))
        self.assertEqual(summary_paid['payment_status'], 'PAID')

        # Now return 1 camera = 25,000 credit against this fully paid bill
        ret = create_purchase_return(
            company_id=self.company1.id,
            vendor_id=self.vendor1.id,
            warehouse_id=self.warehouse1.id,
            return_date=date.today(),
            goods_receipt_id=self.grn1.id,
            vendor_invoice_id=inv.id,
            lines_data=[
                {
                    'grn_line_id': str(self.grn_line1.id),
                    'item_id': str(self.item_camera.id),
                    'return_quantity': Decimal('1.0000'),
                    'unit_cost': Decimal('25000.00'),
                }
            ],
            user=self.user1
        )
        ret, credit_note = post_purchase_return(ret, user=self.user1)

        # Allocated against bill is 0.00 (since outstanding was already 0.00), Unallocated credit is 25,000
        self.assertEqual(credit_note.allocated_amount, Decimal('0.00'))
        self.assertEqual(credit_note.unallocated_amount, Decimal('25000.00'))

        # Check invoice summary: outstanding must NOT be -25,000, but 0.00 with unallocated_credit = 25,000
        summary_after = get_invoice_payment_summary(inv)
        self.assertEqual(summary_after['outstanding_amount'], Decimal('0.00'))
        self.assertEqual(summary_after['unallocated_credit'], Decimal('25000.00'))
        self.assertEqual(summary_after['payment_status'], 'PAID')

    def test_09_duplicate_posting_blocked(self):
        """Test that posting an already POSTED return is rejected idempotently."""
        ret = create_purchase_return(
            company_id=self.company1.id,
            vendor_id=self.vendor1.id,
            warehouse_id=self.warehouse1.id,
            return_date=date.today(),
            goods_receipt_id=self.grn1.id,
            lines_data=[
                {
                    'grn_line_id': str(self.grn_line1.id),
                    'item_id': str(self.item_camera.id),
                    'return_quantity': Decimal('2.0000'),
                    'unit_cost': Decimal('25000.00'),
                }
            ],
            user=self.user1
        )
        post_purchase_return(ret, user=self.user1)

        with self.assertRaises(ValidationError) as ctx:
            post_purchase_return(ret, user=self.user1)
        self.assertIn("already been posted", str(ctx.exception))

    def test_10_cross_tenant_return_blocked(self):
        """Test that cross-tenant return creation and posting is rejected."""
        with self.assertRaises(Exception):
            create_purchase_return(
                company_id=self.company2.id,  # Company 2 context
                vendor_id=self.vendor2.id,
                warehouse_id=self.warehouse2.id,
                return_date=date.today(),
                goods_receipt_id=self.grn1.id,  # Company 1 GRN!
                lines_data=[
                    {
                        'grn_line_id': str(self.grn_line1.id),
                        'item_id': str(self.item_camera.id),
                        'return_quantity': Decimal('1.0000'),
                        'unit_cost': Decimal('25000.00'),
                    }
                ],
                user=self.user2
            )

    def test_11_rest_api_returns_and_credit_notes(self):
        """Test REST API endpoints for Returns and Credit Notes."""
        client = APIClient()
        client.force_authenticate(user=self.user1)

        # 1. Fetch returnable lines for GRN
        res_lines = client.get(f'/api/purchasing/returns/returnable_lines/?goods_receipt={self.grn1.id}')
        self.assertEqual(res_lines.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_lines.data), 1)
        self.assertEqual(res_lines.data[0]['returnable_qty'], 100.0)

        # 2. Create Return via API
        payload = {
            'vendor': str(self.vendor1.id),
            'warehouse': str(self.warehouse1.id),
            'goods_receipt': str(self.grn1.id),
            'return_date': str(date.today()),
            'reason': 'DAMAGED',
            'notes': 'API test return',
            'lines': [
                {
                    'grn_line_id': str(self.grn_line1.id),
                    'item_id': str(self.item_camera.id),
                    'return_quantity': 4,
                    'unit_cost': 25000.00
                }
            ]
        }
        res_create = client.post('/api/purchasing/returns/', payload, format='json')
        self.assertEqual(res_create.status_code, status.HTTP_201_CREATED)
        ret_id = res_create.data['id']

        # 3. Submit for approval
        res_sub = client.post(f'/api/purchasing/returns/{ret_id}/submit_for_approval/')
        self.assertEqual(res_sub.status_code, status.HTTP_200_OK)
        self.assertEqual(res_sub.data['status'], 'PENDING_APPROVAL')

        # 4. Approve
        res_app = client.post(f'/api/purchasing/returns/{ret_id}/approve/')
        self.assertEqual(res_app.status_code, status.HTTP_200_OK)
        self.assertEqual(res_app.data['status'], 'APPROVED')

        # 5. Post Return
        res_post = client.post(f'/api/purchasing/returns/{ret_id}/post_return/')
        self.assertEqual(res_post.status_code, status.HTTP_200_OK)
        self.assertEqual(res_post.data['return']['status'], 'POSTED')
        self.assertTrue(res_post.data['credit_note_number'].startswith('CN-'))

        # 6. Query Credit Notes endpoint
        res_cn = client.get(f'/api/purchasing/credit-notes/?vendor={self.vendor1.id}')
        self.assertEqual(res_cn.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(res_cn.data['results'] if 'results' in res_cn.data else res_cn.data), 1)

        # 7. Query Vendor returns summary
        res_sum = client.get(f'/api/purchasing/vendors/{self.vendor1.id}/returns_summary/')
        self.assertEqual(res_sum.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(res_sum.data['posted_returns_count'], 1)
