from rest_framework.test import APITestCase, APIClient
from rest_framework import status
from django.contrib.auth import get_user_model
from companies.models import Company
from platform_core.models import ModuleDefinition, CompanyModule
from subscriptions.models import SubscriptionPlan, CompanySubscription
from crm.models import CRMEntity, CRMContact, CRMAddress, CRMCommunication
from datetime import date, timedelta
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()
class CRMTestCase(APITestCase):
    def setUp(self):
        # Create companies
        self.company1 = Company.objects.create(name="Company 1")
        self.company2 = Company.objects.create(name="Company 2")
        
        # Setup Subscription Plan so middleware 402 is avoided
        plan = SubscriptionPlan.objects.create(name="Pro", price=100.0)
        today = date.today()
        CompanySubscription.objects.create(company=self.company1, plan=plan, start_date=today, end_date=today + timedelta(days=30), is_active=True)
        CompanySubscription.objects.create(company=self.company2, plan=plan, start_date=today, end_date=today + timedelta(days=30), is_active=True)
        
        # Create module definitions and enable for companies
        self.crm_module, _ = ModuleDefinition.objects.get_or_create(
            code="crm", defaults={"name": "CRM", "description": "CRM Module", "is_core": False, "is_active": True}
        )
        # Ensure it's active
        if not self.crm_module.is_active:
            self.crm_module.is_active = True
            self.crm_module.save()
            
        CompanyModule.objects.get_or_create(company=self.company1, module=self.crm_module, defaults={"enabled": True})
        CompanyModule.objects.get_or_create(company=self.company2, module=self.crm_module, defaults={"enabled": True})
        
        # Create users
        self.user1 = User.objects.create_user(username="u1", email="u1@test.com", password="pw", role="admin", company=self.company1)
        self.user2 = User.objects.create_user(username="u2", email="u2@test.com", password="pw", role="admin", company=self.company2)
        
        self.client1 = APIClient()
        token1 = RefreshToken.for_user(self.user1)
        self.client1.credentials(HTTP_AUTHORIZATION=f'Bearer {token1.access_token}')
        
        self.client2 = APIClient()
        token2 = RefreshToken.for_user(self.user2)
        self.client2.credentials(HTTP_AUTHORIZATION=f'Bearer {token2.access_token}')

    def test_create_entity(self):
        payload = {
            "entity_type": "CUSTOMER",
            "name": "Acme Corp",
            "code": "CUST-001"
        }
        res = self.client1.post('/api/crm/entities/', payload)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(CRMEntity.objects.count(), 1)
        entity = CRMEntity.objects.first()
        self.assertEqual(entity.company, self.company1)

    def test_tenant_isolation(self):
        CRMEntity.objects.create(
            company=self.company1,
            entity_type="CUSTOMER",
            name="Comp1 Cust",
            code="C1"
        )
        CRMEntity.objects.create(
            company=self.company2,
            entity_type="CUSTOMER",
            name="Comp2 Cust",
            code="C2"
        )
        
        # User 1 should only see Comp1 Cust when querying CUSTOMER entities
        res1 = self.client1.get('/api/crm/entities/?entity_type=CUSTOMER')
        results1 = res1.data.get('results', res1.data)
        self.assertEqual(len(results1), 1)
        self.assertEqual(results1[0]['name'], "Comp1 Cust")
        
        # User 2 should only see Comp2 Cust when querying CUSTOMER entities
        res2 = self.client2.get('/api/crm/entities/?entity_type=CUSTOMER')
        results2 = res2.data.get('results', res2.data)
        self.assertEqual(len(results2), 1)
        self.assertEqual(results2[0]['name'], "Comp2 Cust")

    def test_unique_entity_code_per_company(self):
        CRMEntity.objects.create(
            company=self.company1, entity_type="CUSTOMER", name="A", code="UNIQUE1"
        )
        from django.db.utils import IntegrityError
        from django.db import transaction
        # Should fail for same company (might be 400 or 500 due to IntegrityError not caught by DRF)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                self.client1.post('/api/crm/entities/', {
                    "entity_type": "CUSTOMER", "name": "B", "code": "UNIQUE1"
                })
        
        # Should pass for different company
        res2 = self.client2.post('/api/crm/entities/', {
            "entity_type": "CUSTOMER", "name": "B", "code": "UNIQUE1"
        })
        self.assertEqual(res2.status_code, status.HTTP_201_CREATED)

    def test_unique_primary_contact(self):
        entity = CRMEntity.objects.create(
            company=self.company1, entity_type="CUSTOMER", name="A", code="E1"
        )
        # Create first primary contact
        res1 = self.client1.post('/api/crm/contacts/', {
            "entity": entity.id, "first_name": "John", "is_primary": True
        })
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)
        
        from django.db.utils import IntegrityError
        from django.db import transaction
        # Create second primary contact should fail at DB constraint level
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                self.client1.post('/api/crm/contacts/', {
                    "entity": entity.id, "first_name": "Jane", "is_primary": True
                })

    def test_unique_default_billing_address(self):
        entity = CRMEntity.objects.create(
            company=self.company1, entity_type="CUSTOMER", name="A", code="E2"
        )
        res1 = self.client1.post('/api/crm/addresses/', {
            "entity": entity.id, "address_type": "Billing", "city": "Lahore", "line1": "Test", "is_default": True
        })
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)
        
        res2 = self.client1.post('/api/crm/addresses/', {
            "entity": entity.id, "address_type": "Billing", "city": "Karachi", "line1": "Test2", "is_default": True
        })
        self.assertIn(res2.status_code, [status.HTTP_400_BAD_REQUEST, status.HTTP_500_INTERNAL_SERVER_ERROR])
            
    def test_module_gating(self):
        # Disable CRM module for company 1
        from platform_core.models import CompanyModule, ModuleDefinition
        mod = ModuleDefinition.objects.get(code='crm')
        cm = CompanyModule.objects.get(company=self.company1, module=mod)
        cm.enabled = False
        cm.save()
        
        res = self.client1.get('/api/crm/entities/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_auto_generate_code_sequential(self):
        """Verify that CRM entities without a provided code are automatically assigned sequential codes."""
        # 1. Create first customer without code
        res1 = self.client1.post('/api/crm/entities/', {
            "entity_type": "CUSTOMER",
            "name": "Alpha Corp"
        })
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res1.data['code'], 'CUST-0001')

        # 2. Create second customer without code
        res2 = self.client1.post('/api/crm/entities/', {
            "entity_type": "CUSTOMER",
            "name": "Beta Industries"
        })
        self.assertEqual(res2.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res2.data['code'], 'CUST-0002')

        # 3. Create a supplier without code
        res3 = self.client1.post('/api/crm/entities/', {
            "entity_type": "SUPPLIER",
            "name": "Gamma Logistics"
        })
        self.assertEqual(res3.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res3.data['code'], 'SUPP-0001')

        # 4. Create custom code entity
        res4 = self.client1.post('/api/crm/entities/', {
            "entity_type": "CUSTOMER",
            "name": "Custom Client",
            "code": "CUSTOM-99"
        })
        self.assertEqual(res4.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res4.data['code'], 'CUSTOM-99')

        # 5. Company 2 gets its own isolated sequence
        res5 = self.client2.post('/api/crm/entities/', {
            "entity_type": "CUSTOMER",
            "name": "Other Company Customer"
        })
        self.assertEqual(res5.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res5.data['code'], 'CUST-0001')
