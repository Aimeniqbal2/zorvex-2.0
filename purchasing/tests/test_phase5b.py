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
from inventory.models import Product, Item, Vendor, VendorLedger, PurchaseOrder, PurchaseOrderItem
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


class Phase5BTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Phase 5B Test Company")
        self.other_company = Company.objects.create(name="Other Company")

        # Subscription setup
        plan, _ = SubscriptionPlan.objects.get_or_create(
            name="Phase 5B Plan",
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
            username="phase5b_user",
            password="password123",
            company=self.company,
            role="admin"
        )

        # CRM Supplier
        self.crm_vendor = CRMEntity.objects.create(
            company=self.company,
            name="Supplier Inc",
            code="SUPP-5B",
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
            sku="ITEM-5B",
            item_code="ITEM-5B",
            item_type="PRODUCT"
        )
        self.product = Product.objects.create(
            company=self.company,
            brand="BrandX",
            model_name="ModelY",
            cost_price=Decimal("100.00"),
            sale_price=Decimal("150.00")
        )

        # Legacy Purchase Order & Item
        self.po = PurchaseOrder.objects.create(
            company=self.company,
            vendor=self.vendor,
            crm_entity=self.crm_vendor,
            status="DRAFT",
            total_amount=Decimal("1000.00")
        )
        
        self.proc_doc = self.po.procurement_document
        
        self.poi = PurchaseOrderItem.objects.create(
            company=self.company,
            purchase_order=self.po,
            product=self.product,
            item=self.item,
            quantity=Decimal("10.00"),
            unit_cost=Decimal("100.00")
        )
        
        self.proc_line = self.poi.procurement_line

        # Vendor Ledger
        self.ledger = VendorLedger.objects.create(
            company=self.company,
            vendor=self.vendor,
            crm_entity=self.crm_vendor,
            procurement_document=self.proc_doc,
            transaction_type="DEBIT",
            amount=Decimal("1000.00")
        )

        # Service Order & Service Part
        self.service_order = ServiceOrder.objects.create(
            company=self.company,
            customer_name="John Doe",
            customer_phone="03001234567",
            device_brand="Samsung",
            device_model="S21"
        )
        self.service_part = ServicePartUsed.objects.create(
            company=self.company,
            service_order=self.service_order,
            source="vendor",
            vendor=self.vendor,
            crm_entity=self.crm_vendor,
            procurement_line=self.proc_line,
            part_name="Screen",
            quantity=Decimal("1.00"),
            unit_cost=Decimal("500.00")
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

    def test_bridge_creation_and_associations(self):
        self.assertEqual(self.po.procurement_document, self.proc_doc)
        self.assertEqual(self.poi.procurement_line, self.proc_line)
        self.assertEqual(self.ledger.procurement_document, self.proc_doc)
        self.assertEqual(self.service_part.procurement_line, self.proc_line)

    def test_compatibility_service_helpers(self):
        self.assertEqual(get_procurement_document(self.po), self.proc_doc)
        self.assertEqual(get_procurement_document(self.ledger), self.proc_doc)
        self.assertEqual(resolve_purchase_order(self.proc_doc), self.po)
        self.assertEqual(resolve_vendor(self.crm_vendor), self.vendor)
        self.assertEqual(resolve_procurement_line(self.service_part), self.proc_line)
        self.assertEqual(resolve_purchase_order_item(self.proc_line), self.poi)
        self.assertEqual(resolve_procurement_entity(self.po), self.proc_doc)

    def test_architecture_state_monitoring(self):
        self.assertEqual(get_architecture_state(self.proc_doc), "Universal Purchasing")
        self.assertEqual(get_architecture_state(self.po), "Bridge")
        
        legacy_po = PurchaseOrder.objects.create(
            company=self.company,
            vendor=self.vendor,
            status="DRAFT",
            total_amount=Decimal("500.00")
        )
        # Clear procurement_document auto-resolved by save if any
        PurchaseOrder.objects.filter(id=legacy_po.id).update(procurement_document=None)
        legacy_po.refresh_from_db()
        self.assertEqual(get_architecture_state(legacy_po), "Legacy")

    def test_cross_company_validation(self):
        other_proc_doc = ProcurementDocument.objects.create(
            company=self.other_company,
            document_type="PURCHASE_ORDER",
            number="PO-OTHER-001",
            document_date="2026-08-05",
            crm_entity=CRMEntity.objects.create(company=self.other_company, name="Other", code="O-1", entity_type="SUPPLIER")
        )
        invalid_po = PurchaseOrder(
            company=self.company,
            vendor=self.vendor,
            procurement_document=other_proc_doc,
            status="DRAFT"
        )
        with self.assertRaises(ValidationError):
            invalid_po.clean()

    def test_serializer_upgrades(self):
        po_data = PurchaseOrderSerializer(self.po).data
        self.assertIn('procurement_document', po_data)
        self.assertEqual(po_data['procurement_document'], self.proc_doc.id)

        poi_data = PurchaseOrderItemSerializer(self.poi).data
        self.assertIn('procurement_line', poi_data)
        self.assertEqual(poi_data['procurement_line'], self.proc_line.id)

        ledger_data = VendorLedgerSerializer(self.ledger).data
        self.assertIn('procurement_document', ledger_data)
        self.assertEqual(ledger_data['procurement_document'], self.proc_doc.id)

        sp_data = ServicePartUsedSerializer(self.service_part).data
        self.assertIn('procurement_line', sp_data)
        self.assertEqual(sp_data['procurement_line'], self.proc_line.id)

    def test_audit_procurement_bridge_command(self):
        # Should pass without exception
        call_command('audit_procurement_bridge')

    def test_api_coexistence(self):
        # Legacy PO endpoint
        response1 = self.client.get('/api/inventory/purchaseorders/')
        self.assertEqual(response1.status_code, status.HTTP_200_OK)

        # Universal Procurement endpoint
        response2 = self.client.get('/api/purchasing/documents/')
        self.assertEqual(response2.status_code, status.HTTP_200_OK)
