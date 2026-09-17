import uuid
from django.test import TestCase
from rest_framework.test import APIClient
from accounts.models import User
from companies.models import Company
from platform_core.models import (
    ModuleDefinition,
    ModuleCategory,
    CompanyModule,
    UserModuleAccess,
    BusinessType
)
from industries.common.registry import _REGISTRY, register_industry_package
from industries.security.manifest import SecurityPackage

class UserAccessModeTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        
        # Ensure Security package is registered for tests
        register_industry_package(SecurityPackage)
        
        # 1. Base Company
        self.company = Company.objects.create(
            name="Alpha Security",
            business_type=BusinessType.SECURITY,
            domain="alpha.test"
        )
        
        # 2. Other Company
        self.other_company = Company.objects.create(
            name="Beta IT",
            business_type=BusinessType.OTHER,
            domain="beta.test"
        )
        
        # 3. Create Core Modules
        self.mod_crm = ModuleDefinition.objects.create(code='crm', name='CRM', category=ModuleCategory.CORE, is_core=True)
        self.mod_hr = ModuleDefinition.objects.create(code='hr', name='HR', category=ModuleCategory.HR)
        self.mod_finance = ModuleDefinition.objects.create(code='finance', name='Finance', category=ModuleCategory.FINANCE)
        self.mod_inventory = ModuleDefinition.objects.create(code='inventory', name='Inventory', category=ModuleCategory.OPERATIONS)
        self.mod_security = ModuleDefinition.objects.create(code='security_ops', name='Security Operations', category=ModuleCategory.SECURITY)
        
        # 4. Enable Modules for Company
        CompanyModule.objects.create(company=self.company, module=self.mod_crm, enabled=True)
        CompanyModule.objects.create(company=self.company, module=self.mod_hr, enabled=True)
        CompanyModule.objects.create(company=self.company, module=self.mod_finance, enabled=True)
        # Note: Inventory and Security Ops are initially disabled
        
        # Enable some for other company
        CompanyModule.objects.create(company=self.other_company, module=self.mod_inventory, enabled=True)
        
        # 5. Create Superadmin
        self.superadmin = User.objects.create_superuser(
            username='super', password='password', email='super@test.com'
        )

        # 6. Users
        self.user_full = User.objects.create_user(
            username='user_full', password='password', company=self.company, access_mode='FULL_COMPANY'
        )
        
        self.user_custom = User.objects.create_user(
            username='user_custom', password='password', company=self.company, access_mode='CUSTOM'
        )
        # Explicitly grant CRM and Finance to CUSTOM user
        UserModuleAccess.objects.create(user=self.user_custom, module=self.mod_crm, enabled=True)
        UserModuleAccess.objects.create(user=self.user_custom, module=self.mod_finance, enabled=True)

    def test_full_company_access(self):
        """FULL_COMPANY user should get all enabled modules automatically."""
        self.client.force_authenticate(user=self.user_full)
        response = self.client.get('/api/platform/runtime-config/')
        self.assertEqual(response.status_code, 200)
        
        data = response.json()
        user_modules = data['user_modules']
        
        self.assertIn('crm', user_modules)
        self.assertIn('hr', user_modules)
        self.assertIn('finance', user_modules)
        self.assertNotIn('inventory', user_modules)
        
        # Test dynamic addition
        CompanyModule.objects.create(company=self.company, module=self.mod_inventory, enabled=True)
        response = self.client.get('/api/platform/runtime-config/')
        user_modules = response.json()['user_modules']
        self.assertIn('inventory', user_modules)

    def test_custom_access(self):
        """CUSTOM user should only get explicitly granted modules that are also enabled for the company."""
        self.client.force_authenticate(user=self.user_custom)
        response = self.client.get('/api/platform/runtime-config/')
        data = response.json()
        user_modules = data['user_modules']
        
        self.assertIn('crm', user_modules)
        self.assertIn('finance', user_modules)
        self.assertNotIn('hr', user_modules) # Enabled for company, but not granted to user
        
        # Test dynamic addition to company doesn't grant to CUSTOM user
        CompanyModule.objects.create(company=self.company, module=self.mod_inventory, enabled=True)
        response = self.client.get('/api/platform/runtime-config/')
        user_modules = response.json()['user_modules']
        self.assertNotIn('inventory', user_modules)

    def test_company_module_disable_overrides_user(self):
        """Disabling a company module should immediately revoke access for CUSTOM user."""
        self.client.force_authenticate(user=self.user_custom)
        # Verify initially accessible
        resp1 = self.client.get('/api/platform/runtime-config/')
        self.assertIn('finance', resp1.json()['user_modules'])
        
        # Disable at company level
        cm = CompanyModule.objects.get(company=self.company, module=self.mod_finance)
        cm.enabled = False
        cm.save()
        
        resp2 = self.client.get('/api/platform/runtime-config/')
        self.assertNotIn('finance', resp2.json()['user_modules'])

    def test_tenant_isolation(self):
        """User cannot be granted modules disabled for company or from other companies."""
        self.client.force_authenticate(user=self.superadmin)
        
        # Try to grant 'inventory' (which is disabled for Alpha Security, but enabled for Beta IT)
        payload = {
            'username': 'newuser',
            'password': 'password',
            'company': self.company.id,
            'access_mode': 'CUSTOM',
            'custom_modules': ['crm', 'inventory']
        }
        
        response = self.client.post('/api/accounts/users/', payload, format='json')
        self.assertEqual(response.status_code, 201)
        
        # Verify custom_module_access
        new_user = User.objects.get(username='newuser')
        granted = new_user.custom_module_access.values_list('module__code', flat=True)
        self.assertIn('crm', granted)
        self.assertNotIn('inventory', granted, "Should not grant inventory because it is disabled for company")
        
    def test_security_capability_mapping(self):
        """Verify capabilities are restricted to effective user access."""
        self.client.force_authenticate(user=self.user_custom)
        response = self.client.get('/api/platform/runtime-config/')
        caps = response.json()['capabilities']
        
        # Should have clients (mapped to crm) enabled
        clients_cap = next(c for c in caps if c['code'] == 'clients_contracts')
        self.assertTrue(clients_cap['enabled'])
        
        # Should have guards (mapped to hr) disabled because user lacks HR access
        guards_cap = next(c for c in caps if c['code'] == 'guards_staff')
        self.assertFalse(guards_cap['enabled'])
