import json
from rest_framework.test import APITestCase
from django.urls import reverse
from rest_framework import status
from datetime import date, timedelta
from accounts.models import User
from companies.models import Company
from crm.models import CRMEntity
from hrm.models import Designation
from operations.models import OperationalSite, ServiceContract, ContractRate, ServiceContractStatus

class Phase8AOperationsTests(APITestCase):
    def setUp(self):
        # Company A
        self.company_a = Company.objects.create(name="Company A", is_active=True)
        
        # Modules
        from platform_core.models import ModuleDefinition, CompanyModule
        mod, _ = ModuleDefinition.objects.get_or_create(code='security_ops', name='Security')
        CompanyModule.objects.get_or_create(company=self.company_a, module=mod, defaults={'enabled': True})

        self.user_a = User.objects.create_user(
            username="user_a", password="testpassword123", company=self.company_a, role='admin'
        )
        
        # Company B
        self.company_b = Company.objects.create(name="Company B", is_active=True)
        CompanyModule.objects.get_or_create(company=self.company_b, module=mod, defaults={'enabled': True})

        self.user_b = User.objects.create_user(
            username="user_b", password="testpassword123", company=self.company_b, role='admin'
        )

        # Company A resources
        self.crm_entity_a = CRMEntity.objects.create(
            company=self.company_a, name="Client A", code="C-001", entity_type="CUSTOMER"
        )
        self.designation_a = Designation.objects.create(
            company=self.company_a, name="Security Guard A", code="SGA-001"
        )

        # Company B resources
        self.crm_entity_b = CRMEntity.objects.create(
            company=self.company_b, name="Client B", code="C-002", entity_type="CUSTOMER"
        )
        self.designation_b = Designation.objects.create(
            company=self.company_b, name="Security Guard B", code="SGB-001"
        )

    def test_create_operational_site_success(self):
        self.client.force_authenticate(user=self.user_a)
        data = {
            "crm_entity": self.crm_entity_a.id,
            "name": "Downtown Site",
            "address": "123 Main St",
            "latitude": "34.052200",
            "longitude": "-118.243700"
        }
        response = self.client.post(reverse('operationalsite-list'), data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(OperationalSite.objects.count(), 1)
        self.assertEqual(OperationalSite.objects.first().company, self.company_a)

    def test_create_operational_site_cross_company_rejection(self):
        self.client.force_authenticate(user=self.user_a)
        # User A tries to link a CRMEntity from Company B
        data = {
            "crm_entity": self.crm_entity_b.id,
            "name": "Stolen Site",
            "address": "123 Main St"
        }
        response = self.client.post(reverse('operationalsite-list'), data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(OperationalSite.objects.count(), 0)

    def test_create_service_contract_success(self):
        self.client.force_authenticate(user=self.user_a)
        data = {
            "crm_entity": self.crm_entity_a.id,
            "contract_code": "SC-A-001",
            "start_date": "2024-01-01",
            "end_date": "2024-12-31"
        }
        response = self.client.post(reverse('servicecontract-list'), data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ServiceContract.objects.count(), 1)

    def test_service_contract_date_validation(self):
        self.client.force_authenticate(user=self.user_a)
        data = {
            "crm_entity": self.crm_entity_a.id,
            "contract_code": "SC-A-002",
            "start_date": "2024-12-31",
            "end_date": "2024-01-01"
        }
        response = self.client.post(reverse('servicecontract-list'), data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('end_date', response.data)

    def test_service_contract_tenant_uniqueness(self):
        self.client.force_authenticate(user=self.user_a)
        data = {
            "crm_entity": self.crm_entity_a.id,
            "contract_code": "SC-UNIQUE",
            "start_date": "2024-01-01",
            "end_date": "2024-12-31"
        }
        self.client.post(reverse('servicecontract-list'), data)
        
        # User A trying again should fail
        response_a = self.client.post(reverse('servicecontract-list'), data)
        self.assertEqual(response_a.status_code, status.HTTP_400_BAD_REQUEST)

        # User B trying same code is allowed because it's tenant-aware
        self.client.force_authenticate(user=self.user_b)
        data_b = {
            "crm_entity": self.crm_entity_b.id,
            "contract_code": "SC-UNIQUE",
            "start_date": "2024-01-01",
            "end_date": "2024-12-31"
        }
        response_b = self.client.post(reverse('servicecontract-list'), data_b)
        self.assertEqual(response_b.status_code, status.HTTP_201_CREATED)

    def test_create_contract_rate_success(self):
        self.client.force_authenticate(user=self.user_a)
        contract = ServiceContract.objects.create(
            company=self.company_a, crm_entity=self.crm_entity_a,
            contract_code="SC-A-003", start_date="2024-01-01", end_date="2024-12-31"
        )
        data = {
            "service_contract": contract.id,
            "designation": self.designation_a.id,
            "billing_rate": "15.00",
            "pay_rate": "10.00",
            "effective_date": "2024-01-01"
        }
        response = self.client.post(reverse('contractrate-list'), data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ContractRate.objects.count(), 1)

    def test_create_contract_rate_cross_company_rejection(self):
        self.client.force_authenticate(user=self.user_a)
        contract = ServiceContract.objects.create(
            company=self.company_a, crm_entity=self.crm_entity_a,
            contract_code="SC-A-004", start_date="2024-01-01", end_date="2024-12-31"
        )
        data = {
            "service_contract": contract.id,
            "designation": self.designation_b.id, # from company B
            "billing_rate": "15.00",
            "pay_rate": "10.00",
            "effective_date": "2024-01-01"
        }
        response = self.client.post(reverse('contractrate-list'), data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(ContractRate.objects.count(), 0)

    def test_soft_deletion_and_isolation(self):
        self.client.force_authenticate(user=self.user_a)
        site = OperationalSite.objects.create(
            company=self.company_a, crm_entity=self.crm_entity_a,
            name="Delete Me"
        )
        response = self.client.delete(reverse('operationalsite-detail', args=[site.id]))
        self.assertEqual(response.status_code, status.HTTP_200_OK) # Custom destroy returns 200
        
        # Verify it's soft deleted
        site.refresh_from_db()
        self.assertTrue(site.is_deleted)
        
        # Verify it does not show up in list
        response = self.client.get(reverse('operationalsite-list'))
        data_list = response.data.get('results', response.data) if isinstance(response.data, dict) else response.data
        self.assertEqual(len(data_list), 0)

    def test_service_contract_lifecycle_immutability(self):
        contract = ServiceContract.objects.create(
            company=self.company_a, crm_entity=self.crm_entity_a,
            contract_code="SC-TERM", start_date="2024-01-01",
            status=ServiceContractStatus.TERMINATED
        )
        
        self.client.force_authenticate(user=self.user_a)
        
        # Try to change core fields (contract_code)
        data = {
            "crm_entity": self.crm_entity_a.id,
            "contract_code": "SC-CHANGED",
            "start_date": "2024-01-01",
            "status": "TERMINATED"
        }
        response = self.client.put(reverse('servicecontract-detail', args=[contract.id]), data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("non_field_errors", response.data)
        
    def test_m2m_cross_company_rejection(self):
        self.client.force_authenticate(user=self.user_a)
        site_b = OperationalSite.objects.create(
            company=self.company_b, crm_entity=self.crm_entity_b, name="Site B"
        )
        data = {
            "crm_entity": self.crm_entity_a.id,
            "contract_code": "SC-M2M",
            "start_date": "2024-01-01",
            "sites": [site_b.id]
        }
        response = self.client.post(reverse('servicecontract-list'), data)
        
        # Wait, DRF might handle M2M natively inside serializer depending on setup.
        # But our signal should catch it or the primary foreign key check should block it.
        # Let's verify the response.
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
