from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from erp_core.models import Company
from crm.models import CRMEntity, Opportunity, Proposal, ProposalLine
from operations.models import ServiceContract
import datetime

User = get_user_model()

class BusinessDevelopmentTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name='Security Co')
        self.user = User.objects.create_user(
            username='bduser', 
            password='testpassword',
            company=self.company,
            role='admin'
        )
        
        self.entity = CRMEntity.objects.create(
            company=self.company,
            name='Test Client',
            code='CLI-001',
            entity_type='CUSTOMER'
        )
        
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        
    def test_opportunity_creation(self):
        response = self.client.post('/api/crm/opportunities/', {
            'crm_entity': self.entity.id,
            'title': 'Security Guard Service',
            'opportunity_number': 'OPP-001',
            'stage': 'LEAD',
            'estimated_value': 500000
        })
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Opportunity.objects.count(), 1)
        
    def test_proposal_creation_and_totals(self):
        opp = Opportunity.objects.create(
            company=self.company, crm_entity=self.entity, 
            title='Opp1', opportunity_number='O-1', owner=self.user
        )
        prop = Proposal.objects.create(
            company=self.company, opportunity=opp, 
            title='Prop1', proposal_number='P-1', version=1
        )
        line = ProposalLine.objects.create(
            company=self.company, proposal=prop,
            description='Guards', quantity=10, rate=50000
        )
        
        prop.refresh_from_db()
        self.assertEqual(prop.subtotal, 500000)
        self.assertEqual(prop.total, 500000)
        
    def test_contract_conversion_atomic_and_idempotent(self):
        opp = Opportunity.objects.create(
            company=self.company, crm_entity=self.entity, 
            title='Opp1', opportunity_number='O-1', owner=self.user,
            stage='AWARDED'
        )
        prop = Proposal.objects.create(
            company=self.company, opportunity=opp, 
            title='Prop1', proposal_number='P-1', version=1,
            status='ACCEPTED'
        )
        
        response = self.client.post(f'/api/crm/opportunities/{opp.id}/convert_to_contract/')
        self.assertEqual(response.status_code, 200)
        
        opp.refresh_from_db()
        self.assertEqual(opp.stage, 'WON')
        self.assertIsNotNone(opp.converted_contract)
        self.assertEqual(ServiceContract.objects.count(), 1)
        
        # Test idempotency
        response2 = self.client.post(f'/api/crm/opportunities/{opp.id}/convert_to_contract/')
        self.assertEqual(response2.status_code, 200)
        self.assertEqual(ServiceContract.objects.count(), 1)
        
    def test_tenant_isolation(self):
        company2 = Company.objects.create(name='Other Co')
        entity2 = CRMEntity.objects.create(
            company=company2,
            name='Other Client',
            code='CLI-002',
            entity_type='CUSTOMER'
        )
        
        # Trying to create an opportunity with a cross-tenant entity
        response = self.client.post('/api/crm/opportunities/', {
            'crm_entity': entity2.id,
            'title': 'Hack Opportunity',
            'opportunity_number': 'OPP-HACK',
            'stage': 'LEAD'
        })
        self.assertEqual(response.status_code, 400)
