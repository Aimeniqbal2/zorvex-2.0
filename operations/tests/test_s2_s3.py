import uuid
from decimal import Decimal
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth import get_user_model
from companies.models import Company
from platform_core.models import ModuleDefinition, CompanyModule
from crm.models import CRMEntity, CRMEntityRole
from hrm.models import Employee, Designation
from operations.models import OperationalSite, ServiceContract, ContractRate, Deployment, DutyAssignment, ExtraDuty

User = get_user_model()

class SecurityOperationsS2S3Tests(APITestCase):
    def setUp(self):
        # Module
        self.module, _ = ModuleDefinition.objects.get_or_create(code='security_ops', defaults={'name': 'Security Operations'})
        
        # Company A
        self.company_a = Company.objects.create(name="Company A")
        CompanyModule.objects.create(company=self.company_a, module=self.module, enabled=True)
        self.user_a = User.objects.create_user(username="usera", password="password", company=self.company_a, role="manager")

        # Company B
        self.company_b = Company.objects.create(name="Company B")
        CompanyModule.objects.create(company=self.company_b, module=self.module, enabled=True)
        self.user_b = User.objects.create_user(username="userb", password="password", company=self.company_b, role="manager")

        # Base Data A
        self.crm_a = CRMEntity.objects.create(company=self.company_a, name="Customer A", code="CUST-A", entity_type="CUSTOMER", status="ACTIVE")
        CRMEntityRole.objects.create(company=self.company_a, entity=self.crm_a, role='CUSTOMER')
        self.desig_a = Designation.objects.create(company=self.company_a, name="Guard")
        self.emp_a = Employee.objects.create(company=self.company_a, user=self.user_a, designation=self.desig_a)

        # Base Data B
        self.crm_b = CRMEntity.objects.create(company=self.company_b, name="Customer B", code="CUST-B", entity_type="CUSTOMER", status="ACTIVE")
        CRMEntityRole.objects.create(company=self.company_b, entity=self.crm_b, role='CUSTOMER')

    def test_dashboard_tenant_isolation(self):
        # Create some data for A
        site_a = OperationalSite.objects.create(company=self.company_a, crm_entity=self.crm_a, name="Site A", is_active=True)
        contract_a = ServiceContract.objects.create(company=self.company_a, crm_entity=self.crm_a, contract_code="C-A", start_date=timezone.now().date(), status="ACTIVE")
        contract_a.sites.add(site_a)
        
        dep_a = Deployment.objects.create(company=self.company_a, employee=self.emp_a, site=site_a, designation=self.desig_a, start_date=timezone.now().date(), status="ACTIVE")
        DutyAssignment.objects.create(company=self.company_a, deployment=dep_a, employee=self.emp_a, site=site_a, date=timezone.now().date(), start_time="09:00", end_time="17:00", status="SCHEDULED")

        # Get dashboard for A
        self.client.force_authenticate(user=self.user_a)
        response = self.client.get('/api/operations/dashboard/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['active_sites'], 1)
        self.assertEqual(data['active_contracts'], 1)
        self.assertEqual(data['active_deployments'], 1)
        self.assertEqual(data['todays_duties'], 1)

        # Get dashboard for B (should be 0)
        self.client.force_authenticate(user=self.user_b)
        response = self.client.get('/api/operations/dashboard/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['active_sites'], 0)
        self.assertEqual(data['active_contracts'], 0)
        self.assertEqual(data['active_deployments'], 0)
        self.assertEqual(data['todays_duties'], 0)

    def test_site_crud_and_validation(self):
        self.client.force_authenticate(user=self.user_a)
        
        # Create
        response = self.client.post('/api/operations/sites/', {
            'crm_entity': self.crm_a.id,
            'name': 'New Site',
            'address': '123 Test',
            'is_active': True
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        site_id = response.data['id']

        # Reject Cross-Tenant CRM
        response_bad = self.client.post('/api/operations/sites/', {
            'crm_entity': self.crm_b.id,
            'name': 'Bad Site',
            'address': '123 Test',
            'is_active': True
        })
        self.assertEqual(response_bad.status_code, status.HTTP_400_BAD_REQUEST)
        
        # Read
        response = self.client.get(f'/api/operations/sites/{site_id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Edit
        response = self.client.patch(f'/api/operations/sites/{site_id}/', {'name': 'Updated Site'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Updated Site')

    def test_contract_crud_and_validation(self):
        self.client.force_authenticate(user=self.user_a)
        
        # Create Contract
        response = self.client.post('/api/operations/contracts/', {
            'crm_entity': self.crm_a.id,
            'contract_code': 'CONT-01',
            'start_date': '2023-01-01',
            'end_date': '2023-12-31',
            'status': 'ACTIVE'
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        contract_id = response.data['id']

        # Date validation
        response_bad_dates = self.client.post('/api/operations/contracts/', {
            'crm_entity': self.crm_a.id,
            'contract_code': 'CONT-02',
            'start_date': '2024-01-01',
            'end_date': '2023-12-31',
            'status': 'ACTIVE'
        })
        self.assertEqual(response_bad_dates.status_code, status.HTTP_400_BAD_REQUEST)

    def test_contract_rate(self):
        self.client.force_authenticate(user=self.user_a)
        contract = ServiceContract.objects.create(company=self.company_a, crm_entity=self.crm_a, contract_code="C-R", start_date="2023-01-01")
        
        response = self.client.post('/api/operations/contract-rates/', {
            'service_contract': contract.id,
            'designation': self.desig_a.id,
            'billing_rate': '50000',
            'pay_rate': '30000',
            'effective_date': '2023-01-01'
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
