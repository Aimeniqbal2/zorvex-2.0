import uuid
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from companies.models import Company
from platform_core.models import ModuleDefinition, CompanyModule, ModuleCategory
from industries.security.manifest import SecurityPackage
from industries.security.installer import install_security_package
from industries.common.registry import get_industry_package

User = get_user_model()

class SecurityIndustryTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="SecureCorp", business_type="other")
        self.other_company = Company.objects.create(name="StandardCorp", business_type="other")
        
        self.user = User.objects.create_user(
            username="admin_secure",
            email="admin@secure.com",
            password="testpassword",
            company=self.company,
            role="admin"
        )
        
        self.other_user = User.objects.create_user(
            username="admin_standard",
            email="admin@standard.com",
            password="testpassword",
            company=self.other_company,
            role="admin"
        )
        
        # Create universal module definitions
        for code in ['crm', 'hr', 'finance', 'purchasing', 'inventory', 'security_ops', 'sales']:
            ModuleDefinition.objects.create(
                code=code, 
                name=code.capitalize(), 
                category=ModuleCategory.CORE, 
                is_active=True
            )
            
        self.client = APIClient()

    def test_industry_package_registry(self):
        """Test that the Security package can be registered and retrieved."""
        pkg = get_industry_package("security")
        self.assertIsNotNone(pkg)
        self.assertEqual(pkg.code, "security")

    def test_install_security_package(self):
        """Test installing the security package enables required modules and updates business type."""
        result = install_security_package(self.company)
        self.assertTrue(result)
        
        # Refresh from db
        self.company.refresh_from_db()
        self.assertEqual(self.company.business_type, "security")
        
        # Check enabled modules
        enabled = set(CompanyModule.objects.filter(company=self.company, enabled=True).values_list('module__code', flat=True))
        
        # Should have these from capabilities
        expected_modules = {'crm', 'hr', 'finance', 'purchasing', 'inventory', 'security_ops'}
        self.assertTrue(expected_modules.issubset(enabled))
        self.assertNotIn('sales', enabled)

    def test_installation_idempotent(self):
        """Test that calling install_security_package multiple times is safe."""
        install_security_package(self.company)
        install_security_package(self.company)
        
        # Count should still be exact number of required modules, no duplicates
        count = CompanyModule.objects.filter(company=self.company).count()
        self.assertEqual(count, 6)

    def test_other_company_unaffected(self):
        """Test that installing on one company does not affect another."""
        install_security_package(self.company)
        
        self.other_company.refresh_from_db()
        self.assertEqual(self.other_company.business_type, "other")
        
        enabled = CompanyModule.objects.filter(company=self.other_company, enabled=True).count()
        self.assertEqual(enabled, 0)

    def test_runtime_configuration_api(self):
        """Test the /api/platform/runtime-config/ endpoint returns industry configuration."""
        install_security_package(self.company)
        
        # Enable sales for standard company
        sales_mod = ModuleDefinition.objects.get(code='sales')
        CompanyModule.objects.create(company=self.other_company, module=sales_mod, enabled=True)
        
        # Test Security Company
        self.client.force_authenticate(user=self.user)
        response = self.client.get('/api/platform/runtime-config/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        data = response.json()
        self.assertIsNotNone(data.get('industry'))
        self.assertEqual(data['industry']['code'], 'security')
        self.assertTrue(any(c['code'] == 'clients_contracts' and c['enabled'] for c in data['capabilities']))
        self.assertTrue(data['engines'].get('crm', False))
        
        # Test Standard Company (No Industry Package)
        self.client.force_authenticate(user=self.other_user)
        response = self.client.get('/api/platform/runtime-config/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        data = response.json()
        self.assertIsNone(data.get('industry'))
        self.assertEqual(len(data.get('capabilities', [])), 0)
        self.assertTrue(data['engines'].get('sales', False))
        self.assertFalse(data['engines'].get('crm', False))

    def test_frontend_runtime_routing_rules(self):
        """
        Tests the conditions required by the frontend WorkspaceManager routing rules:
        - Security company + CRM access -> industry='security', crm=True (renders SecurityCRMModule)
        - Non-Security company + CRM access -> industry=None, crm=True (renders Universal CRM)
        - CRM-disabled Security company -> crm=False (cannot access)
        - CUSTOM user without CRM access -> crm=False (cannot access)
        """
        install_security_package(self.company)
        crm_mod = ModuleDefinition.objects.get(code='crm')
        
        # 1. Security company + CRM (admin user)
        self.client.force_authenticate(user=self.user)
        res = self.client.get('/api/platform/runtime-config/').json()
        self.assertEqual(res['industry']['code'], 'security')
        self.assertTrue(res['engines']['crm'])
        
        # 2. Non-Security company + CRM
        CompanyModule.objects.create(company=self.other_company, module=crm_mod, enabled=True)
        self.client.force_authenticate(user=self.other_user)
        res = self.client.get('/api/platform/runtime-config/').json()
        self.assertIsNone(res.get('industry'))
        self.assertTrue(res['engines']['crm'])
        
        # 3. CRM-disabled Security company
        CompanyModule.objects.filter(company=self.company, module=crm_mod).update(enabled=False)
        self.client.force_authenticate(user=self.user)
        res = self.client.get('/api/platform/runtime-config/').json()
        self.assertFalse(res['engines']['crm'])
        
        # 4. CUSTOM user without CRM access
        CompanyModule.objects.filter(company=self.company, module=crm_mod).update(enabled=True)
        from platform_core.models import UserModuleAccess
        custom_user = User.objects.create_user('custom', 'custom@test.com', 'pwd', company=self.company, access_mode='CUSTOM')
        self.client.force_authenticate(user=custom_user)
        res = self.client.get('/api/platform/runtime-config/').json()
        self.assertFalse(res['engines']['crm'])
