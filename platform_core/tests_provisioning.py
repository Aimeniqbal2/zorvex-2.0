from rest_framework.test import APIClient
from rest_framework import status
from django.urls import reverse
from django.test import TestCase
from accounts.models import User
from companies.models import Company
from platform_core.models import CompanyModule, Warehouse

class TestCompanyProvisioning(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.superadmin = User.objects.create_user(
            username='sysadmin', 
            password='123',
            email='sys@admin.com',
            role='super_admin'
        )
        self.client.force_authenticate(user=self.superadmin)
        self.provision_url = reverse('platform_core:company-provision')

    def test_security_company_provisioning(self):
        payload = {
            "name": "Acme Security",
            "business_type": "security",
            "admin_username": "acme_admin",
            "admin_password": "secure123",
            "admin_email": "admin@acmesecurity.com",
            "selected_modules": ["crm", "hr", "inventory", "security_ops"]
        }

        response = self.client.post(self.provision_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

        company_id = response.data['company_id']
        
        # Verify Company was created
        company = Company.objects.get(id=company_id)
        self.assertEqual(company.name, "Acme Security")
        self.assertEqual(company.business_type, "security")

        # Verify Initial Administrator
        admin = User.objects.get(username="acme_admin")
        self.assertEqual(admin.company_id, company.id)
        self.assertEqual(admin.role, "admin")

        # Verify Module State
        enabled_modules = list(CompanyModule.objects.filter(company_id=company.id, enabled=True).values_list('module__code', flat=True))
        self.assertIn("crm", enabled_modules)
        self.assertIn("hr", enabled_modules)
        self.assertIn("security_ops", enabled_modules)

        # Verify Default Warehouse
        self.assertTrue(Warehouse.objects.filter(company_id=company.id, name="Main Warehouse").exists())

    def test_provisioning_validates_dependencies(self):
        payload = {
            "name": "Bad Setup",
            "business_type": "security",
            "admin_username": "bad_admin",
            "admin_password": "secure123",
            "admin_email": "admin@bad.com",
            "selected_modules": ["security_ops"] # Missing crm and hr
        }

        response = self.client.post(self.provision_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("requires 'crm'", response.data['error'])

        # Ensure atomicity (company shouldn't be created)
        self.assertFalse(Company.objects.filter(name="Bad Setup").exists())
