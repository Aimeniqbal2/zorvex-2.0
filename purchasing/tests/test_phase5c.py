from decimal import Decimal
from datetime import date, timedelta
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.management import call_command

from companies.models import Company
from subscriptions.models import SubscriptionPlan, CompanySubscription
from crm.models import CRMEntity
from inventory.models import Product, Item, Vendor, VendorLedger, PurchaseOrder, PurchaseOrderItem
from services.models import ServiceOrder, ServicePartUsed
from purchasing.models import (
    ProcurementDocument, ProcurementLine, ProcurementNote, ProcurementAuditTrail
)

User = get_user_model()


class Phase5CMigrationTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Phase 5C Test Co")
        self.company2 = Company.objects.create(name="Phase 5C Co 2")

        plan, _ = SubscriptionPlan.objects.get_or_create(
            name="Phase 5C Plan",
            defaults={'price': Decimal('100.00')}
        )
        today = date.today()
        CompanySubscription.objects.create(
            company=self.company, plan=plan, start_date=today, end_date=today + timedelta(days=30), is_active=True
        )
        CompanySubscription.objects.create(
            company=self.company2, plan=plan, start_date=today, end_date=today + timedelta(days=30), is_active=True
        )

        self.user = User.objects.create_user(
            username="phase5c_user", password="password123", company=self.company, role="admin"
        )

        # CRM Supplier
        self.crm_supplier = CRMEntity.objects.create(
            company=self.company, name="Global Supplies Ltd", code="SUPP-5C", entity_type="SUPPLIER"
        )
        self.vendor = Vendor.objects.create(
            company=self.company, name="Global Supplies Ltd", crm_entity=self.crm_supplier
        )

        # Products & Items
        self.product = Product.objects.create(
            company=self.company, brand="Logitech", model_name="MX Master 3",
            cost_price=Decimal("80.00"), sale_price=Decimal("100.00")
        )
        self.item = Item.objects.create(
            company=self.company, name="Logitech MX Master 3", item_code=f"LEGACY-PROD-{self.product.id}", sku="SKU-LOGI-MX3", item_type="PRODUCT"
        )

        # Legacy Purchase Order 1 (Ordered/Approved)
        self.po1 = PurchaseOrder.objects.create(
            company=self.company, vendor=self.vendor, status="ORDERED", total_amount=Decimal("800.00"), notes="Urgent order"
        )
        self.poi1 = PurchaseOrderItem.objects.create(
            company=self.company, purchase_order=self.po1, product=self.product, quantity=Decimal("10.00"), unit_cost=Decimal("80.00")
        )
        self.ledger1 = VendorLedger.objects.create(
            company=self.company, vendor=self.vendor, transaction_type="DEBIT", amount=Decimal("800.00"), reference=f"PO-{self.po1.id}"
        )

        # Legacy Purchase Order 2 (Received)
        self.po2 = PurchaseOrder.objects.create(
            company=self.company, vendor=self.vendor, status="RECEIVED", total_amount=Decimal("400.00")
        )
        self.poi2 = PurchaseOrderItem.objects.create(
            company=self.company, purchase_order=self.po2, product=self.product, item=self.item, quantity=Decimal("5.00"), unit_cost=Decimal("80.00")
        )

        # Service Part Used
        self.service_order = ServiceOrder.objects.create(
            company=self.company, customer_name="Customer 1", customer_phone="03000000000", device_brand="Logitech", device_model="Mouse"
        )
        self.service_part = ServicePartUsed.objects.create(
            company=self.company, service_order=self.service_order, source="vendor", vendor=self.vendor, item=self.item, quantity=Decimal("1.00"), unit_cost=Decimal("80.00")
        )

        # Manual Procurement Document (to test non-deletion during rollback)
        self.manual_doc = ProcurementDocument.objects.create(
            company=self.company, number="MANUAL-PO-999", document_type="PURCHASE_ORDER", status="DRAFT",
            document_date=date.today(), crm_entity=self.crm_supplier
        )

    def test_migration_execution(self):
        call_command('migrate_legacy_procurement')

        self.po1.refresh_from_db()
        self.po2.refresh_from_db()
        self.poi1.refresh_from_db()
        self.poi2.refresh_from_db()

        # Check PO1 bridges
        self.assertIsNotNone(self.po1.procurement_document)
        self.assertEqual(self.po1.procurement_document.number, f"PROC-PO-{self.po1.id}")
        self.assertEqual(self.po1.procurement_document.status, "APPROVED")
        self.assertEqual(self.po1.procurement_document.crm_entity, self.crm_supplier)

        # Check POI1 bridges
        self.assertIsNotNone(self.poi1.procurement_line)
        self.assertEqual(self.poi1.procurement_line.item, self.item)
        self.assertEqual(self.poi1.procurement_line.quantity, Decimal("10.00"))

        # Check Notes & Audit Trail
        self.assertTrue(ProcurementNote.objects.filter(document=self.po1.procurement_document).exists())
        self.assertTrue(ProcurementAuditTrail.objects.filter(document=self.po1.procurement_document).exists())

        # Check VendorLedger bridge
        self.ledger1.refresh_from_db()
        self.assertEqual(self.ledger1.procurement_document, self.po1.procurement_document)

        # Check ServicePartUsed bridge
        self.service_part.refresh_from_db()
        self.assertIsNotNone(self.service_part.procurement_line)

    def test_verification_command(self):
        call_command('migrate_legacy_procurement')
        # Verification command should complete cleanly (exit 0)
        call_command('verify_procurement_migration')

    def test_idempotency_and_no_duplicates(self):
        call_command('migrate_legacy_procurement')
        count1 = ProcurementDocument.objects.count()
        lines1 = ProcurementLine.objects.count()

        # Run second time
        call_command('migrate_legacy_procurement')
        count2 = ProcurementDocument.objects.count()
        lines2 = ProcurementLine.objects.count()

        self.assertEqual(count1, count2)
        self.assertEqual(lines1, lines2)

    def test_rollback_command(self):
        call_command('migrate_legacy_procurement')
        call_command('rollback_procurement_migration')

        self.po1.refresh_from_db()
        self.poi1.refresh_from_db()
        self.ledger1.refresh_from_db()
        self.service_part.refresh_from_db()

        self.assertIsNone(self.po1.procurement_document)
        self.assertIsNone(self.poi1.procurement_line)
        self.assertIsNone(self.ledger1.procurement_document)
        self.assertIsNone(self.service_part.procurement_line)

        # Manual document must still exist
        self.assertTrue(ProcurementDocument.objects.filter(id=self.manual_doc.id).exists())

        # Migrated documents should be gone
        self.assertFalse(ProcurementDocument.objects.filter(number=f"PROC-PO-{self.po1.id}").exists())

    def test_cross_company_isolation(self):
        # Create legacy PO in company 2
        vendor2 = Vendor.objects.create(
            company=self.company2, name="Co2 Vendor",
            crm_entity=CRMEntity.objects.create(company=self.company2, name="Co2 Vendor", code="SUPP-C2", entity_type="SUPPLIER")
        )
        po_c2 = PurchaseOrder.objects.create(company=self.company2, vendor=vendor2, status="DRAFT", total_amount=Decimal("100.00"))

        call_command('migrate_legacy_procurement')

        po_c2.refresh_from_db()
        self.assertEqual(po_c2.procurement_document.company, self.company2)
        self.assertNotEqual(po_c2.procurement_document.company, self.company)
