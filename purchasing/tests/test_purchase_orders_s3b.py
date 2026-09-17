from decimal import Decimal
from datetime import date, timedelta
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from rest_framework.test import APIClient
from rest_framework import status

from companies.models import Company
from subscriptions.models import SubscriptionPlan, CompanySubscription
from inventory.models import Item, Category
from platform_core.models import Warehouse, ModuleDefinition, CompanyModule
from purchasing.models import VendorCategory, Vendor, VendorItem, ProcurementDocument, ProcurementLine

User = get_user_model()


class PurchaseOrderS3BTests(TestCase):
    def setUp(self):
        self.company_a = Company.objects.create(name="Security Corp A", business_type="security")
        self.company_b = Company.objects.create(name="Security Corp B", business_type="security")

        # Subscriptions
        plan, _ = SubscriptionPlan.objects.get_or_create(name="Enterprise Plan", defaults={'price': Decimal('500.00')})
        today = date.today()
        CompanySubscription.objects.create(company=self.company_a, plan=plan, start_date=today, end_date=today + timedelta(days=30), is_active=True)
        CompanySubscription.objects.create(company=self.company_b, plan=plan, start_date=today, end_date=today + timedelta(days=30), is_active=True)

        # Users
        self.admin_a = User.objects.create_user(username="admin_corp_a", password="password123", company=self.company_a, role="admin")
        self.staff_a = User.objects.create_user(username="staff_corp_a", password="password123", company=self.company_a, role="staff")
        self.admin_b = User.objects.create_user(username="admin_corp_b", password="password123", company=self.company_b, role="admin")

        # Purchasing Module
        self.module_def, _ = ModuleDefinition.objects.get_or_create(code="purchasing", defaults={'name': "Purchasing", 'category': 'operations'})
        CompanyModule.objects.create(company=self.company_a, module=self.module_def, enabled=True)
        CompanyModule.objects.create(company=self.company_b, module=self.module_def, enabled=True)

        # Warehouses
        self.warehouse_a = Warehouse.objects.create(company=self.company_a, name="Central Security Armory", code="ARM-01")
        self.warehouse_b = Warehouse.objects.create(company=self.company_b, name="Beta Depot", code="DEP-01")

        # Categories & Vendors
        cat_sec = VendorCategory.objects.create(company=self.company_a, name="Tactical Gear", code="TAC")
        self.vendor_a = Vendor.objects.create(company=self.company_a, name="Apex Arms & Comms", category=cat_sec, payment_terms="Net 30")
        self.vendor_b = Vendor.objects.create(company=self.company_b, name="Beta Suppliers Ltd")

        # Items
        inv_cat = Category.objects.create(company=self.company_a, name="Radios")
        self.item_walkie = Item.objects.create(
            company=self.company_a,
            name="Walkie Talkie UHF Pro",
            sku="WT-PRO-99",
            category=inv_cat,
            cost_price=Decimal("12000.00"),
            selling_price=Decimal("18000.00")
        )
        self.item_vest = Item.objects.create(
            company=self.company_a,
            name="Ballistic Vest Level 3",
            sku="VEST-LV3",
            category=inv_cat,
            cost_price=Decimal("25000.00"),
            selling_price=Decimal("35000.00")
        )

        # Vendor Item catalogue mapping
        self.vi_walkie = VendorItem.objects.create(
            company=self.company_a,
            vendor=self.vendor_a,
            item=self.item_walkie,
            vendor_sku="APEX-WT-99",
            vendor_price=Decimal("11500.00"),
            lead_time_days=5
        )

        # Clients
        self.client_admin_a = APIClient()
        self.client_admin_a.force_authenticate(user=self.admin_a)

        self.client_staff_a = APIClient()
        self.client_staff_a.force_authenticate(user=self.staff_a)

        self.client_admin_b = APIClient()
        self.client_admin_b.force_authenticate(user=self.admin_b)

    def test_po_creation_and_automatic_tenant_numbering(self):
        """Creating purchase orders automatically generates sequential tenant-scoped PO numbers."""
        po1 = ProcurementDocument.objects.create(
            company=self.company_a,
            document_type='PURCHASE_ORDER',
            document_date=date.today(),
            vendor=self.vendor_a,
            warehouse=self.warehouse_a
        )
        self.assertTrue(po1.number.startswith("PO-"))
        self.assertEqual(po1.number, "PO-0001")

        po2 = ProcurementDocument.objects.create(
            company=self.company_a,
            document_type='PURCHASE_ORDER',
            document_date=date.today(),
            vendor=self.vendor_a,
            warehouse=self.warehouse_a
        )
        self.assertEqual(po2.number, "PO-0002")

    def test_vendor_and_item_tenant_validation(self):
        """Cross-tenant vendor or item in a PO is blocked by validation."""
        # Attempting to assign Company B vendor to Company A PO
        po = ProcurementDocument(
            company=self.company_a,
            document_type='PURCHASE_ORDER',
            document_date=date.today(),
            vendor=self.vendor_b
        )
        with self.assertRaises(ValidationError):
            po.full_clean()

    def test_multi_line_po_and_backend_totals(self):
        """Multi-line PO accurately computes subtotal, discounts, taxes, and grand totals on the backend."""
        payload = {
            'document_type': 'PURCHASE_ORDER',
            'vendor': str(self.vendor_a.id),
            'warehouse': str(self.warehouse_a.id),
            'document_date': str(date.today()),
            'expected_delivery_date': str(date.today() + timedelta(days=7)),
            'payment_terms': 'Net 30',
            'lines': [
                {
                    'item': str(self.item_walkie.id),
                    'vendor_item': str(self.vi_walkie.id),
                    'vendor_sku': 'APEX-WT-99',
                    'quantity': 10,
                    'unit_price': 11500.00,
                    'discount_amount': 5000.00, # discount of 5k
                    'tax_amount': 2000.00       # tax of 2k
                    # line total = (10 * 11500) - 5000 + 2000 = 115,000 - 5000 + 2000 = 112,000
                },
                {
                    'item': str(self.item_vest.id),
                    'quantity': 4,
                    'unit_price': 25000.00,
                    'discount_amount': 0.00,
                    'tax_amount': 0.00
                    # line total = 4 * 25,000 = 100,000
                }
            ]
        }

        res = self.client_admin_a.post('/api/purchasing/documents/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        po_id = res.data['id']

        po = ProcurementDocument.objects.get(id=po_id)
        # Expected subtotal = 115,000 + 100,000 = 215,000
        self.assertEqual(po.subtotal_amount, Decimal('215000.00'))
        self.assertEqual(po.discount_amount, Decimal('5000.00'))
        self.assertEqual(po.tax_amount, Decimal('2000.00'))
        # Grand total = 215,000 - 5,000 + 2,000 = 212,000
        self.assertEqual(po.total_amount, Decimal('212000.00'))
        self.assertEqual(po.status, 'DRAFT')

    def test_submit_for_approval_and_empty_po_blocking(self):
        """PO transitions from DRAFT to PENDING_APPROVAL; empty PO cannot be submitted."""
        po = ProcurementDocument.objects.create(
            company=self.company_a,
            document_type='PURCHASE_ORDER',
            document_date=date.today(),
            vendor=self.vendor_a,
            status='DRAFT'
        )

        # Submitting empty PO fails
        res_empty = self.client_admin_a.post(f'/api/purchasing/documents/{po.id}/submit_for_approval/')
        self.assertEqual(res_empty.status_code, status.HTTP_400_BAD_REQUEST)

        # Add line item
        ProcurementLine.objects.create(
            company=self.company_a,
            document=po,
            item=self.item_walkie,
            quantity=5,
            unit_price=Decimal('11500.00')
        )

        # Now submit succeeds
        res_submit = self.client_admin_a.post(f'/api/purchasing/documents/{po.id}/submit_for_approval/')
        self.assertEqual(res_submit.status_code, status.HTTP_200_OK)
        po.refresh_from_db()
        self.assertEqual(po.status, 'PENDING_APPROVAL')

    def test_approve_and_reject_po_flow(self):
        """Admin can approve or reject PENDING_APPROVAL PO with recorded audit details."""
        po = ProcurementDocument.objects.create(
            company=self.company_a,
            document_type='PURCHASE_ORDER',
            document_date=date.today(),
            vendor=self.vendor_a,
            status='DRAFT'
        )
        ProcurementLine.objects.create(
            company=self.company_a,
            document=po,
            item=self.item_walkie,
            quantity=5,
            unit_price=Decimal('11500.00')
        )

        # Submit
        self.client_admin_a.post(f'/api/purchasing/documents/{po.id}/submit_for_approval/')

        # Reject
        res_reject = self.client_admin_a.post(f'/api/purchasing/documents/{po.id}/reject/', {
            'reason': 'Excessive quantity requested, revise down to 3.'
        })
        self.assertEqual(res_reject.status_code, status.HTTP_200_OK)
        po.refresh_from_db()
        self.assertEqual(po.status, 'DRAFT')
        self.assertEqual(po.rejection_reason, 'Excessive quantity requested, revise down to 3.')

        # Re-submit
        self.client_admin_a.post(f'/api/purchasing/documents/{po.id}/submit_for_approval/')

        # Approve
        res_approve = self.client_admin_a.post(f'/api/purchasing/documents/{po.id}/approve/', {
            'approval_notes': 'Authorized by Security Operations Director.'
        })
        self.assertEqual(res_approve.status_code, status.HTTP_200_OK)
        po.refresh_from_db()
        self.assertEqual(po.status, 'APPROVED')
        self.assertEqual(po.approved_by, self.admin_a)
        self.assertIsNotNone(po.approved_at)

    def test_unauthorized_approval_blocked(self):
        """Staff user without approval permission cannot approve PO."""
        po = ProcurementDocument.objects.create(
            company=self.company_a,
            document_type='PURCHASE_ORDER',
            document_date=date.today(),
            vendor=self.vendor_a,
            status='PENDING_APPROVAL'
        )
        ProcurementLine.objects.create(
            company=self.company_a,
            document=po,
            item=self.item_walkie,
            quantity=5,
            unit_price=Decimal('11500.00')
        )

        res = self.client_staff_a.post(f'/api/purchasing/documents/{po.id}/approve/')
        self.assertIn(res.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_400_BAD_REQUEST])
        po.refresh_from_db()
        self.assertNotEqual(po.status, 'APPROVED')


    def test_approved_po_edit_protection(self):
        """Once a PO is APPROVED, commercial lines and vendor cannot be freely modified."""
        po = ProcurementDocument.objects.create(
            company=self.company_a,
            document_type='PURCHASE_ORDER',
            document_date=date.today(),
            vendor=self.vendor_a,
            status='APPROVED'
        )
        ProcurementLine.objects.create(
            company=self.company_a,
            document=po,
            item=self.item_walkie,
            quantity=5,
            unit_price=Decimal('11500.00')
        )

        # Attempt to modify line items on approved PO
        res_edit = self.client_admin_a.patch(f'/api/purchasing/documents/{po.id}/', {
            'lines': [
                {
                    'item': str(self.item_walkie.id),
                    'quantity': 50, # altered quantity
                    'unit_price': 8000.00
                }
            ]
        }, format='json')
        self.assertEqual(res_edit.status_code, status.HTTP_400_BAD_REQUEST)

    def test_po_cancellation(self):
        """PO can be cancelled with recorded cancellation reason."""
        po = ProcurementDocument.objects.create(
            company=self.company_a,
            document_type='PURCHASE_ORDER',
            document_date=date.today(),
            vendor=self.vendor_a,
            status='APPROVED'
        )

        res = self.client_admin_a.post(f'/api/purchasing/documents/{po.id}/cancel/', {
            'reason': 'Vendor out of stock.'
        })
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        po.refresh_from_db()
        self.assertEqual(po.status, 'CANCELLED')
        self.assertIn('Vendor out of stock.', po.notes)

    def test_tenant_isolation_po(self):
        """Company B cannot view, retrieve, or approve Company A purchase orders."""
        po_a = ProcurementDocument.objects.create(
            company=self.company_a,
            document_type='PURCHASE_ORDER',
            document_date=date.today(),
            vendor=self.vendor_a,
            status='PENDING_APPROVAL'
        )

        res_b = self.client_admin_b.get(f'/api/purchasing/documents/{po_a.id}/')
        self.assertEqual(res_b.status_code, status.HTTP_404_NOT_FOUND)

        res_b_approve = self.client_admin_b.post(f'/api/purchasing/documents/{po_a.id}/approve/')
        self.assertEqual(res_b_approve.status_code, status.HTTP_404_NOT_FOUND)
