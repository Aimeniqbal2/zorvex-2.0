from decimal import Decimal
from datetime import date, timedelta
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from rest_framework.test import APIClient
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken

from companies.models import Company
from subscriptions.models import SubscriptionPlan, CompanySubscription
from crm.models import CRMEntity
from inventory.models import Item
from platform_core.models import Warehouse, ModuleDefinition, CompanyModule, ModuleCategory
from purchasing.models import (
    ProcurementTag, ProcurementDocument, ProcurementLine,
    ApprovalWorkflow, ApprovalStep, ApprovalHistory,
    ProcurementNote, ProcurementAttachment, ProcurementAuditTrail
)

User = get_user_model()


class Phase5ATests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Purchasing Test Company")
        self.other_company = Company.objects.create(name="Other Company")
        
        # Subscriptions setup
        plan, _ = SubscriptionPlan.objects.get_or_create(
            name="Test Plan",
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
            username="purchasing_user",
            password="password123",
            company=self.company,
            role="admin"
        )
        
        # CRM Entity
        self.crm_entity = CRMEntity.objects.create(
            company=self.company,
            name="Global Supplier Inc",
            code="SUPP-100",
            entity_type="SUPPLIER"
        )
        
        # Item
        self.item = Item.objects.create(
            company=self.company,
            sku="ITEM-100",
            item_code="ITEM-100",
            item_type="PRODUCT"
        )
        
        # Warehouse
        self.warehouse = Warehouse.objects.create(
            company=self.company,
            name="Main Warehouse",
            code="WH-1"
        )

        # Enable purchasing module
        self.mod_def, _ = ModuleDefinition.objects.get_or_create(
            code="purchasing",
            defaults={
                'name': 'Purchasing',
                'category': ModuleCategory.OPERATIONS,
                'is_core': False,
                'is_active': True
            }
        )
        if not self.mod_def.is_active:
            self.mod_def.is_active = True
            self.mod_def.save()

        CompanyModule.objects.get_or_create(
            company=self.company,
            module=self.mod_def,
            defaults={'enabled': True}
        )

        self.client = APIClient()
        token = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')

    def test_procurement_document_creation(self):
        doc = ProcurementDocument.objects.create(
            company=self.company,
            document_type="PURCHASE_ORDER",
            status="DRAFT",
            number="PO-2026-001",
            document_date="2026-08-05",
            crm_entity=self.crm_entity,
            warehouse=self.warehouse,
            created_by=self.user
        )
        self.assertEqual(doc.number, "PO-2026-001")
        self.assertEqual(doc.crm_entity, self.crm_entity)
        self.assertEqual(doc.warehouse, self.warehouse)
        self.assertEqual(doc.status, "DRAFT")

    def test_procurement_line_creation(self):
        doc = ProcurementDocument.objects.create(
            company=self.company,
            document_type="PURCHASE_ORDER",
            number="PO-2026-002",
            document_date="2026-08-05",
            crm_entity=self.crm_entity
        )
        line = ProcurementLine.objects.create(
            company=self.company,
            document=doc,
            item=self.item,
            quantity=Decimal("10.00"),
            unit_price=Decimal("150.00"),
            total_amount=Decimal("1500.00")
        )
        self.assertEqual(line.document, doc)
        self.assertEqual(line.item, self.item)
        self.assertEqual(line.quantity, Decimal("10.00"))

    def test_crm_and_item_linkage(self):
        doc = ProcurementDocument.objects.create(
            company=self.company,
            document_type="RFQ",
            number="RFQ-2026-001",
            document_date="2026-08-05",
            crm_entity=self.crm_entity
        )
        line = ProcurementLine.objects.create(
            document=doc,
            item=self.item,
            quantity=Decimal("5.00"),
            unit_price=Decimal("200.00")
        )
        self.assertEqual(doc.crm_entity.name, "Global Supplier Inc")
        self.assertEqual(line.item.sku, "ITEM-100")

    def test_cross_company_validation_crm_entity(self):
        other_crm = CRMEntity.objects.create(
            company=self.other_company,
            name="Other Vendor",
            code="SUPP-OTHER",
            entity_type="SUPPLIER"
        )
        doc = ProcurementDocument(
            company=self.company,
            document_type="PURCHASE_ORDER",
            number="PO-INVALID-1",
            document_date="2026-08-05",
            crm_entity=other_crm
        )
        with self.assertRaises(ValidationError):
            doc.clean()

    def test_cross_company_validation_item(self):
        doc = ProcurementDocument.objects.create(
            company=self.company,
            document_type="PURCHASE_ORDER",
            number="PO-2026-003",
            document_date="2026-08-05",
            crm_entity=self.crm_entity
        )
        other_item = Item.objects.create(
            company=self.other_company,
            sku="ITEM-OTHER",
            item_type="PRODUCT"
        )
        line = ProcurementLine(
            company=self.company,
            document=doc,
            item=other_item,
            quantity=Decimal("1.00"),
            unit_price=Decimal("100.00")
        )
        with self.assertRaises(ValidationError):
            line.clean()

    def test_approval_workflow_and_steps(self):
        wf = ApprovalWorkflow.objects.create(
            company=self.company,
            name="High Value PO Approval",
            module="purchasing",
            min_amount=Decimal("10000.00")
        )
        step1 = ApprovalStep.objects.create(
            workflow=wf,
            step_number=1,
            name="Manager Review",
            approver_role="manager"
        )
        step2 = ApprovalStep.objects.create(
            workflow=wf,
            step_number=2,
            name="Admin Approval",
            approver_user=self.user
        )
        self.assertEqual(wf.steps.count(), 2)

        history = ApprovalHistory.objects.create(
            company=self.company,
            workflow=wf,
            step=step1,
            document_id=1,
            action="APPROVED",
            action_by=self.user,
            comments="Approved for processing"
        )
        self.assertEqual(history.action, "APPROVED")

    def test_tags_notes_attachments_audit_trails(self):
        tag = ProcurementTag.objects.create(company=self.company, name="Urgent", color="#FF0000")
        doc = ProcurementDocument.objects.create(
            company=self.company,
            document_type="PURCHASE_ORDER",
            number="PO-2026-004",
            document_date="2026-08-05",
            crm_entity=self.crm_entity
        )
        doc.tags.add(tag)
        self.assertIn(tag, doc.tags.all())

        note = ProcurementNote.objects.create(
            document=doc,
            user=self.user,
            note_type="VENDOR",
            text="Please deliver to loading dock 2."
        )
        self.assertEqual(note.document, doc)

        audit = ProcurementAuditTrail.objects.create(
            document=doc,
            user=self.user,
            event="CREATED",
            details="Initial creation"
        )
        self.assertEqual(audit.event, "CREATED")

    def test_api_procurement_document_endpoint(self):
        response = self.client.get('/api/purchasing/documents/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        post_data = {
            "document_type": "PURCHASE_ORDER",
            "status": "DRAFT",
            "number": "PO-API-001",
            "document_date": "2026-08-05",
            "crm_entity": self.crm_entity.id
        }
        create_resp = self.client.post('/api/purchasing/documents/', post_data, format='json')
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(create_resp.data['number'], "PO-API-001")

    def test_api_module_gating(self):
        # Disable module access
        CompanyModule.objects.filter(company=self.company, module=self.mod_def).update(enabled=False)
        response = self.client.get('/api/purchasing/documents/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
