from decimal import Decimal
from datetime import date, timedelta
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from companies.models import Company
from subscriptions.models import SubscriptionPlan, CompanySubscription
from platform_core.models import Warehouse, ModuleDefinition, CompanyModule
from inventory.models import Category, Item, InventoryBalance, ItemSerial, StockMovement
from purchasing.models import (
    VendorCategory, Vendor, VendorItem,
    ProcurementDocument, ProcurementLine, ProcurementAuditTrail
)
from purchasing.services.goods_receipt_service import (
    create_goods_receipt, post_goods_receipt, cancel_goods_receipt,
    get_po_receiving_summary
)

User = get_user_model()


class GoodsReceiptS3CTests(TestCase):
    """
    Phase S-3C Unit & Integration Test Suite.
    Validates Goods Receipt (GRN), partial delivery, accepted/rejected stock intake,
    serial tracking, idempotency, and tenant isolation.
    """

    def setUp(self):
        self.company1 = Company.objects.create(
            name="Security Global Tenant 1",
            business_type="security"
        )
        self.company2 = Company.objects.create(
            name="Security Global Tenant 2",
            business_type="security"
        )

        plan, _ = SubscriptionPlan.objects.get_or_create(name="Enterprise Plan", defaults={'price': Decimal('500.00')})
        today = date.today()
        CompanySubscription.objects.create(company=self.company1, plan=plan, start_date=today, end_date=today + timedelta(days=30), is_active=True)
        CompanySubscription.objects.create(company=self.company2, plan=plan, start_date=today, end_date=today + timedelta(days=30), is_active=True)

        purchasing_mod, _ = ModuleDefinition.objects.get_or_create(code="purchasing", defaults={'name': "Purchasing", 'category': 'operations'})
        inventory_mod, _ = ModuleDefinition.objects.get_or_create(code="inventory", defaults={'name': "Inventory", 'category': 'operations'})
        CompanyModule.objects.create(company=self.company1, module=purchasing_mod, enabled=True)
        CompanyModule.objects.create(company=self.company1, module=inventory_mod, enabled=True)
        CompanyModule.objects.create(company=self.company2, module=purchasing_mod, enabled=True)
        CompanyModule.objects.create(company=self.company2, module=inventory_mod, enabled=True)

        self.user1 = User.objects.create_user(
            username="sec_admin1",
            email="admin1@secglobal.com",
            password="Password123!",
            company=self.company1,
            role="admin",
            is_staff=True
        )
        self.user2 = User.objects.create_user(
            username="sec_admin2",
            email="admin2@secglobal.com",
            password="Password123!",
            company=self.company2,
            role="admin",
            is_staff=True
        )


        self.warehouse1 = Warehouse.objects.create(
            company=self.company1,
            name="Main Tactical Armory",
            code="ARMORY-01"
        )
        self.warehouse2 = Warehouse.objects.create(
            company=self.company2,
            name="Tenant 2 Armory",
            code="T2-ARMORY"
        )

        self.category1 = Category.objects.create(
            company=self.company1,
            name="Body Armor & Tactical Gear"
        )

        # Standard non-serial Item
        self.item_vest = Item.objects.create(
            company=self.company1,
            category=self.category1,
            name="Level III Bulletproof Vest",
            sku="VEST-L3-BLK",
            item_code="ITM-VEST-01",
            track_inventory=True,
            track_serial_number=False,
            cost_price=Decimal('250.00'),
            selling_price=Decimal('450.00')
        )

        # Serial-tracked Item
        self.item_radio = Item.objects.create(
            company=self.company1,
            category=self.category1,
            name="Encrypted Tactical VHF Radio",
            sku="RAD-VHF-ENC",
            item_code="ITM-RAD-01",
            track_inventory=True,
            track_serial_number=True,
            cost_price=Decimal('180.00'),
            selling_price=Decimal('320.00')
        )

        self.vendor_cat = VendorCategory.objects.create(
            company=self.company1,
            name="Tactical Defense Manufacturers"
        )
        self.vendor1 = Vendor.objects.create(
            company=self.company1,
            category=self.vendor_cat,
            name="Apex Armor Corp",
            code="VEND-APEX",
            email="orders@apexarmor.com"
        )

        # API Client
        self.client = APIClient()
        self.client.force_authenticate(user=self.user1)

    def create_approved_po(self, lines_info=None):
        """Helper to create an APPROVED Purchase Order with lines."""
        po = ProcurementDocument.objects.create(
            company=self.company1,
            document_type='PURCHASE_ORDER',
            status='APPROVED',
            document_date=date.today(),
            vendor=self.vendor1,
            currency='USD',
            created_by=self.user1
        )
        if not lines_info:
            lines_info = [
                {'item': self.item_vest, 'quantity': Decimal('100.00'), 'unit_price': Decimal('250.00')}
            ]
        for idx, l in enumerate(lines_info, start=1):
            ProcurementLine.objects.create(
                company=self.company1,
                document=po,
                item=l['item'],
                quantity=l['quantity'],
                unit_price=l['unit_price'],
                total_amount=l['quantity'] * l['unit_price'],
                line_number=idx
            )
        return po

    def test_grn_creation_and_auto_numbering(self):
        """Test creating a DRAFT GRN produces tenant-scoped GRN-0001 number."""
        po = self.create_approved_po()
        po_line = po.lines.first()

        grn_data = {
            'warehouse': self.warehouse1,
            'document_date': date.today(),
            'reference_number': 'DC-99881',
            'notes': 'Initial delivery receipt',
            'lines': [
                {
                    'po_line_id': str(po_line.id),
                    'quantity': Decimal('40.00'),
                    'accepted_quantity': Decimal('40.00'),
                    'rejected_quantity': Decimal('0.00')
                }
            ]
        }
        grn = create_goods_receipt(po, grn_data, self.user1)

        self.assertTrue(grn.number.startswith('GRN-'))
        self.assertEqual(grn.status, 'DRAFT')
        self.assertEqual(grn.parent_document, po)
        self.assertEqual(grn.vendor, self.vendor1)
        self.assertEqual(grn.warehouse, self.warehouse1)
        self.assertEqual(grn.lines.count(), 1)

        grn_line = grn.lines.first()
        self.assertEqual(grn_line.accepted_quantity, Decimal('40.00'))
        self.assertEqual(grn_line.parent_line, po_line)

    def test_partial_receiving_and_po_status_progression(self):
        """
        Verify partial receipts update PO status from APPROVED -> PARTIALLY_RECEIVED -> RECEIVED,
        and stock movements / balances update accurately.
        """
        po = self.create_approved_po([
            {'item': self.item_vest, 'quantity': Decimal('100.00'), 'unit_price': Decimal('250.00')}
        ])
        po_line = po.lines.first()

        # Receipt 1: 60 units
        grn1 = create_goods_receipt(po, {
            'warehouse': self.warehouse1,
            'document_date': date.today(),
            'reference_number': 'DC-PART1',
            'lines': [{'po_line_id': str(po_line.id), 'accepted_quantity': Decimal('60.00')}]
        }, self.user1)
        post_goods_receipt(grn1, self.user1)

        po.refresh_from_db()
        po_line.refresh_from_db()
        self.assertEqual(po.status, 'PARTIALLY_RECEIVED')
        self.assertEqual(po_line.received_quantity, Decimal('60.00'))

        # Check Inventory Balance
        bal = InventoryBalance.objects.get(company=self.company1, item=self.item_vest, warehouse=self.warehouse1)
        self.assertEqual(bal.quantity, Decimal('60.00'))

        # Receipt 2: remaining 40 units
        grn2 = create_goods_receipt(po, {
            'warehouse': self.warehouse1,
            'document_date': date.today(),
            'reference_number': 'DC-PART2',
            'lines': [{'po_line_id': str(po_line.id), 'accepted_quantity': Decimal('40.00')}]
        }, self.user1)
        post_goods_receipt(grn2, self.user1)

        po.refresh_from_db()
        po_line.refresh_from_db()
        self.assertEqual(po.status, 'RECEIVED')
        self.assertEqual(po_line.received_quantity, Decimal('100.00'))

        # Check final stock balance: 100
        bal.refresh_from_db()
        self.assertEqual(bal.quantity, Decimal('100.00'))

        # Check StockMovements
        movements = StockMovement.objects.filter(company=self.company1, item=self.item_vest)
        self.assertEqual(movements.count(), 2)

    def test_over_receipt_blocked(self):
        """Test that receiving more than the remaining PO quantity raises an error."""
        po = self.create_approved_po([
            {'item': self.item_vest, 'quantity': Decimal('10.00'), 'unit_price': Decimal('250.00')}
        ])
        po_line = po.lines.first()

        with self.assertRaises(Exception):
            create_goods_receipt(po, {
                'warehouse': self.warehouse1,
                'document_date': date.today(),
                'lines': [{'po_line_id': str(po_line.id), 'quantity': Decimal('15.00')}]
            }, self.user1)

    def test_accepted_vs_rejected_quantity_stock_intake(self):
        """
        Verify that rejected quantities do NOT enter inventory stock,
        while accepted quantities do.
        """
        po = self.create_approved_po([
            {'item': self.item_vest, 'quantity': Decimal('20.00'), 'unit_price': Decimal('250.00')}
        ])
        po_line = po.lines.first()

        # Received 20: 18 accepted, 2 rejected (damaged packaging)
        grn = create_goods_receipt(po, {
            'warehouse': self.warehouse1,
            'document_date': date.today(),
            'reference_number': 'CHALLAN-0044',
            'lines': [
                {
                    'po_line_id': str(po_line.id),
                    'quantity': Decimal('20.00'),
                    'accepted_quantity': Decimal('18.00'),
                    'rejected_quantity': Decimal('2.00'),
                    'rejection_reason': '2 vests had torn fabric and failed ballistic seal check'
                }
            ]
        }, self.user1)

        post_goods_receipt(grn, self.user1)

        # Inventory balance should ONLY be 18
        bal = InventoryBalance.objects.get(company=self.company1, item=self.item_vest, warehouse=self.warehouse1)
        self.assertEqual(bal.quantity, Decimal('18.00'))

        # Check line records
        grn_line = grn.lines.first()
        self.assertEqual(grn_line.accepted_quantity, Decimal('18.00'))
        self.assertEqual(grn_line.rejected_quantity, Decimal('2.00'))
        self.assertIn('torn fabric', grn_line.rejection_reason)

    def test_serial_tracked_item_receiving(self):
        """Verify serial-tracked item receiving creates ItemSerial records in stock."""
        po = self.create_approved_po([
            {'item': self.item_radio, 'quantity': Decimal('3.00'), 'unit_price': Decimal('180.00')}
        ])
        po_line = po.lines.first()

        serials = ['RAD-SN-1001', 'RAD-SN-1002', 'RAD-SN-1003']
        grn = create_goods_receipt(po, {
            'warehouse': self.warehouse1,
            'document_date': date.today(),
            'reference_number': 'CHALLAN-SERIAL',
            'lines': [
                {
                    'po_line_id': str(po_line.id),
                    'accepted_quantity': Decimal('3.00'),
                    'serial_numbers': serials
                }
            ]
        }, self.user1)

        post_goods_receipt(grn, self.user1)

        # Serials should exist in database with IN_STOCK
        created_serials = ItemSerial.objects.filter(
            company=self.company1,
            item=self.item_radio,
            serial_number__in=serials
        )
        self.assertEqual(created_serials.count(), 3)
        for s in created_serials:
            self.assertEqual(s.status, 'IN_STOCK')

    def test_idempotent_grn_posting_blocked(self):
        """Verify posting an already-posted GRN raises ValidationError and does not duplicate stock."""
        po = self.create_approved_po()
        po_line = po.lines.first()

        grn = create_goods_receipt(po, {
            'warehouse': self.warehouse1,
            'document_date': date.today(),
            'lines': [{'po_line_id': str(po_line.id), 'accepted_quantity': Decimal('10.00')}]
        }, self.user1)

        post_goods_receipt(grn, self.user1)

        bal = InventoryBalance.objects.get(company=self.company1, item=self.item_vest, warehouse=self.warehouse1)
        self.assertEqual(bal.quantity, Decimal('10.00'))

        # Attempt second post
        with self.assertRaises(Exception):
            post_goods_receipt(grn, self.user1)

        # Stock remains 10
        bal.refresh_from_db()
        self.assertEqual(bal.quantity, Decimal('10.00'))

    def test_cancel_draft_grn(self):
        """Verify DRAFT GRNs can be cancelled safely, but POSTED GRNs cannot."""
        po = self.create_approved_po()
        po_line = po.lines.first()

        grn = create_goods_receipt(po, {
            'warehouse': self.warehouse1,
            'document_date': date.today(),
            'lines': [{'po_line_id': str(po_line.id), 'accepted_quantity': Decimal('10.00')}]
        }, self.user1)

        cancel_goods_receipt(grn, self.user1)
        grn.refresh_from_db()
        self.assertEqual(grn.status, 'CANCELLED')

        # Cancelled GRN cannot be posted
        with self.assertRaises(Exception):
            post_goods_receipt(grn, self.user1)

    def test_cross_tenant_warehouse_blocked(self):
        """Verify attempting to receive goods into another tenant's warehouse is blocked."""
        po = self.create_approved_po()
        po_line = po.lines.first()

        with self.assertRaises(Exception):
            create_goods_receipt(po, {
                'warehouse': self.warehouse2,  # Belongs to Tenant 2
                'document_date': date.today(),
                'lines': [{'po_line_id': str(po_line.id), 'accepted_quantity': Decimal('10.00')}]
            }, self.user1)

    def test_receiving_summary_endpoint(self):
        """Test API endpoint /api/purchasing/documents/{id}/receiving_summary/."""
        po = self.create_approved_po([
            {'item': self.item_vest, 'quantity': Decimal('50.00'), 'unit_price': Decimal('250.00')},
            {'item': self.item_radio, 'quantity': Decimal('10.00'), 'unit_price': Decimal('180.00')},
        ])
        lines = list(po.lines.all())

        # Post receipt of 20 vests
        grn = create_goods_receipt(po, {
            'warehouse': self.warehouse1,
            'document_date': date.today(),
            'lines': [{'po_line_id': str(lines[0].id), 'accepted_quantity': Decimal('20.00')}]
        }, self.user1)
        post_goods_receipt(grn, self.user1)

        response = self.client.get(f'/api/purchasing/documents/{po.id}/receiving_summary/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        self.assertEqual(data['po_id'], str(po.id))
        self.assertEqual(data['po_status'], 'PARTIALLY_RECEIVED')
        self.assertTrue(data['can_receive'])
        self.assertEqual(len(data['lines']), 2)
        
        # Check first line: ordered 50, received 20, remaining 30
        vest_line = next(l for l in data['lines'] if l['item_id'] == str(self.item_vest.id))
        self.assertEqual(vest_line['ordered_quantity'], 50.0)
        self.assertEqual(vest_line['previously_received'], 20.0)
        self.assertEqual(vest_line['remaining_quantity'], 30.0)

        # Check GRNs list
        self.assertEqual(len(data['grns']), 1)
        self.assertEqual(data['grns'][0]['number'], grn.number)
        self.assertEqual(data['grns'][0]['status'], 'POSTED')
