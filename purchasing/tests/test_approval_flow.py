from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from platform_core.models import Warehouse, ModuleDefinition, CompanyModule
from companies.models import Company
from crm.models import CRMEntity
from inventory.models import Item
from purchasing.models import ProcurementDocument, ProcurementLine, ApprovalWorkflow, ApprovalStep, ApprovalHistory

User = get_user_model()

class PurchasingApprovalFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.company = Company.objects.create(name="Test Company")
        self.other_company = Company.objects.create(name="Other Company")
        
        self.admin_user = User.objects.create_user(
            username="admin", password="password", company=self.company, role="admin"
        )
        self.regular_user = User.objects.create_user(
            username="user", password="password", company=self.company, role="manager"
        )
        self.other_admin = User.objects.create_user(
            username="other_admin", password="password", company=self.other_company, role="admin"
        )
        
        self.purchasing_module = ModuleDefinition.objects.create(code="purchasing", name="Purchasing")
        CompanyModule.objects.create(company=self.company, module=self.purchasing_module, enabled=True)
        CompanyModule.objects.create(company=self.other_company, module=self.purchasing_module, enabled=True)

        
        self.warehouse = Warehouse.objects.create(company=self.company, name="Main Warehouse")
        self.supplier = CRMEntity.objects.create(company=self.company, name="Test Supplier", entity_type="SUPPLIER")
        self.item = Item.objects.create(company=self.company, name="Test Item", item_type="GOODS")
        
        self.client.force_authenticate(user=self.admin_user)
        
    def create_document(self, doc_type="PURCHASE_REQUEST"):
        doc = ProcurementDocument.objects.create(
            company=self.company,
            document_type=doc_type,
            status="DRAFT",
            number="TEST-001",
            document_date="2023-01-01",
            crm_entity=self.supplier,
            warehouse=self.warehouse,
            created_by=self.admin_user,
            total_amount=500
        )
        ProcurementLine.objects.create(
            company=self.company,
            document=doc,
            item=self.item,
            quantity=5,
            unit_price=100,
            total_amount=500
        )
        return doc

    def test_pr_submit_to_pending_approval(self):
        doc = self.create_document()
        response = self.client.post(f'/api/purchasing/documents/{doc.id}/submit/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        doc.refresh_from_db()
        self.assertEqual(doc.status, 'PENDING_APPROVAL')
        
        history = ApprovalHistory.objects.filter(document_id=doc.id).last()
        self.assertIsNotNone(history)
        self.assertEqual(history.action, 'SUBMITTED')

    def test_pending_approval_discovery(self):
        doc = self.create_document()
        self.client.post(f'/api/purchasing/documents/{doc.id}/submit/')
        
        response = self.client.get('/api/purchasing/documents/pending_approvals/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id'], str(doc.id))

    def test_authorized_approve_without_workflow(self):
        doc = self.create_document()
        self.client.post(f'/api/purchasing/documents/{doc.id}/submit/')
        
        response = self.client.post(f'/api/purchasing/documents/{doc.id}/approve/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        doc.refresh_from_db()
        self.assertEqual(doc.status, 'APPROVED')
        
        history = ApprovalHistory.objects.filter(document_id=doc.id).last()
        self.assertEqual(history.action, 'APPROVED')

    def test_unauthorized_approve(self):
        doc = self.create_document()
        self.client.post(f'/api/purchasing/documents/{doc.id}/submit/')
        
        self.client.force_authenticate(user=self.regular_user)
        response = self.client.post(f'/api/purchasing/documents/{doc.id}/approve/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        
    def test_rejection_requires_comment(self):
        doc = self.create_document()
        self.client.post(f'/api/purchasing/documents/{doc.id}/submit/')
        
        response = self.client.post(f'/api/purchasing/documents/{doc.id}/reject/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        
        response = self.client.post(f'/api/purchasing/documents/{doc.id}/reject/', {'comments': 'Too expensive'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        doc.refresh_from_db()
        self.assertEqual(doc.status, 'REJECTED')

    def test_multi_step_workflow(self):
        wf = ApprovalWorkflow.objects.create(
            company=self.company, name="Standard PR Workflow", module="purchasing", document_type="PURCHASE_REQUEST", active=True
        )
        s1 = ApprovalStep.objects.create(company=self.company, workflow=wf, step_number=1, name="Step 1", approver_role="manager")
        s2 = ApprovalStep.objects.create(company=self.company, workflow=wf, step_number=2, name="Step 2", approver_role="admin")
        
        doc = self.create_document()
        self.client.force_authenticate(user=self.regular_user)
        self.client.post(f'/api/purchasing/documents/{doc.id}/submit/')
        
        doc.refresh_from_db()
        self.assertEqual(doc.status, 'PENDING_APPROVAL')
        
        response = self.client.post(f'/api/purchasing/documents/{doc.id}/approve/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        doc.refresh_from_db()
        self.assertEqual(doc.status, 'PENDING_APPROVAL')
        
        response = self.client.post(f'/api/purchasing/documents/{doc.id}/approve/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(f'/api/purchasing/documents/{doc.id}/approve/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        doc.refresh_from_db()
        self.assertEqual(doc.status, 'APPROVED')

    def test_tenant_isolation(self):
        doc = self.create_document()
        self.client.post(f'/api/purchasing/documents/{doc.id}/submit/')
        
        self.client.force_authenticate(user=self.other_admin)
        response = self.client.post(f'/api/purchasing/documents/{doc.id}/approve/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
