from decimal import Decimal
from datetime import date, timedelta
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.management import call_command
from rest_framework.test import APIClient
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken

from companies.models import Company
from subscriptions.models import SubscriptionPlan, CompanySubscription
from crm.models import CRMEntity
from inventory.models import Product, Item, Vendor, VendorLedger, PurchaseOrder, PurchaseOrderItem, InventoryBalance
from services.models import ServiceOrder, ServicePartUsed
from platform_core.models import Warehouse, ModuleDefinition, CompanyModule, ModuleCategory
from purchasing.models import ProcurementDocument, ProcurementLine
from purchasing.services.compatibility import (
    get_procurement_document, resolve_purchase_order, resolve_vendor,
    resolve_procurement_line, resolve_purchase_order_item,
    resolve_procurement_entity, get_architecture_state
)
from inventory.serializers import PurchaseOrderSerializer, PurchaseOrderItemSerializer, VendorLedgerSerializer
from services.serializers import ServicePartUsedSerializer

User = get_user_model()


class Phase5ETests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Phase 5E Test Company")
        self.other_company = Company.objects.create(name="Other Company")

        # Subscription setup
        plan, _ = SubscriptionPlan.objects.get_or_create(
            name="Phase 5E Plan",
            defaults={'price': Decimal('100.00')}
        )
        today = date.today()
        CompanySubscription.objects.create(
            company=self.company,
            plan=plan,
            start_date=today,
            end_date=today + timedelta(days=30),
            is_active=True
        )

        self.user = User.objects.create_user(
            username="phase5e_user",
            password="password123",
            company=self.company,
            role="admin"
        )
        
        self.warehouse = Warehouse.objects.create(company=self.company, name="Main WH", is_default=True)

        # CRM Supplier
        self.crm_vendor = CRMEntity.objects.create(
            company=self.company,
            name="Supplier Inc",
            code="SUPP-5E",
            entity_type="SUPPLIER"
        )
        self.vendor = Vendor.objects.create(
            company=self.company,
            name="Supplier Inc",
            crm_entity=self.crm_vendor
        )

        # Item & Product
        self.item = Item.objects.create(
            company=self.company,
            sku="ITEM-5E",
            item_code="ITEM-5E",
            item_type="PRODUCT"
        )
        self.product = Product.objects.create(
            company=self.company,
            brand="BrandX",
            model_name="ModelY",
            cost_price=Decimal("100.00"),
            sale_price=Decimal("150.00")
        )

        # Enable purchasing module
        self.purchasing_mod, _ = ModuleDefinition.objects.get_or_create(
            code="purchasing",
            defaults={'name': 'Purchasing', 'category': ModuleCategory.OPERATIONS, 'is_core': False, 'is_active': True}
        )
        CompanyModule.objects.get_or_create(company=self.company, module=self.purchasing_mod, defaults={'enabled': True})

        # Enable inventory module
        self.inv_mod, _ = ModuleDefinition.objects.get_or_create(
            code="inventory",
            defaults={'name': 'Inventory', 'category': ModuleCategory.OPERATIONS, 'is_core': True, 'is_active': True}
        )
        CompanyModule.objects.get_or_create(company=self.company, module=self.inv_mod, defaults={'enabled': True})

        self.client = APIClient()
        token = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')

    def test_auto_bridge_creation_on_po_save(self):
        # Phase 5E: PurchaseOrder should auto-create ProcurementDocument
        po = PurchaseOrder.objects.create(
            company=self.company,
            vendor=self.vendor,
            status="DRAFT",
            total_amount=Decimal("1000.00")
        )
        po.refresh_from_db()
        self.assertIsNotNone(po.procurement_document)
        self.assertEqual(po.procurement_document.document_type, "PURCHASE_ORDER")
        self.assertEqual(po.procurement_document.total_amount, Decimal("1000.00"))
        
        poi = PurchaseOrderItem.objects.create(
            company=self.company,
            purchase_order=po,
            product=self.product,
            item=self.item,
            quantity=Decimal("10.00"),
            unit_cost=Decimal("100.00")
        )
        poi.refresh_from_db()
        self.assertIsNotNone(poi.procurement_line)
        self.assertEqual(poi.procurement_line.document, po.procurement_document)
        self.assertEqual(poi.procurement_line.quantity, Decimal("10.00"))
        
    def test_inventory_receiving_through_procurement_document(self):
        po = PurchaseOrder.objects.create(
            company=self.company,
            vendor=self.vendor,
            status="DRAFT",
            total_amount=Decimal("1000.00")
        )
        poi = PurchaseOrderItem.objects.create(
            company=self.company,
            purchase_order=po,
            product=self.product,
            item=self.item,
            quantity=Decimal("10.00"),
            unit_cost=Decimal("100.00")
        )
        
        # Test receiving
        po.status = 'RECEIVED'
        po.save()
        
        # Verify Inventory integration through ProcurementDocument
        balance = InventoryBalance.objects.get(item=self.item, warehouse=self.warehouse)
        self.assertEqual(balance.quantity, Decimal("10.00"))
        
        # Check ProcurementDocument is updated
        po.procurement_document.refresh_from_db()
        self.assertEqual(po.procurement_document.status, "RECEIVED")

    def test_vendor_ledger_procurement_document_resolution(self):
        po = PurchaseOrder.objects.create(
            company=self.company,
            vendor=self.vendor,
            status="DRAFT",
            total_amount=Decimal("1000.00")
        )
        
        ledger = VendorLedger.objects.create(
            company=self.company,
            vendor=self.vendor,
            transaction_type="DEBIT",
            amount=Decimal("1000.00"),
            reference=f"PO-{po.id}"
        )
        
        ledger.refresh_from_db()
        self.assertIsNotNone(ledger.procurement_document)
        self.assertEqual(ledger.procurement_document, po.procurement_document)
        
    def test_service_part_used_auto_resolution(self):
        service_order = ServiceOrder.objects.create(
            company=self.company,
            customer_name="John Doe",
            customer_phone="03001234567",
            device_brand="Samsung",
            device_model="S21"
        )
        
        proc_doc = ProcurementDocument.objects.create(
            company=self.company,
            document_type="PURCHASE_ORDER",
            status="DRAFT",
            number="PO-UNI-001",
            document_date="2026-08-05",
            crm_entity=self.crm_vendor
        )
        proc_line = ProcurementLine.objects.create(
            company=self.company,
            document=proc_doc,
            item=self.item,
            quantity=Decimal("10.00"),
            unit_price=Decimal("100.00"),
            total_amount=Decimal("1000.00")
        )
        
        service_part = ServicePartUsed.objects.create(
            company=self.company,
            service_order=service_order,
            source="vendor",
            procurement_line=proc_line,
            part_name="Screen",
            quantity=Decimal("1.00"),
            unit_cost=Decimal("500.00")
        )
        
        # Should auto-resolve CRM and Vendor
        self.assertEqual(service_part.crm_entity, self.crm_vendor)
        self.assertEqual(service_part.vendor, self.vendor)
