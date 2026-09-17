from django.test import TestCase, Client
from django.urls import reverse
from accounts.models import User
from companies.models import Company
from platform_core.models import ModuleDefinition, ModuleCategory, CompanyModule, UserModuleAccess, BusinessType
from industries.common.registry import register_industry_package
from industries.security.manifest import SecurityPackage
from accounts.admin_forms import CustomUserChangeForm, CustomUserCreationForm

class DjangoAdminUserAccessTests(TestCase):
    def setUp(self):
        register_industry_package(SecurityPackage)
        
        # Superadmin client
        self.client = Client()
        self.superadmin = User.objects.create_superuser(
            username='admin', email='admin@test.com', password='password'
        )
        self.client.login(username='admin', password='password')

        # Companies
        self.security_co = Company.objects.create(name='SecCo', business_type=BusinessType.SECURITY, domain='sec')
        self.tech_co = Company.objects.create(name='TechCo', business_type=BusinessType.OTHER, domain='tech')

        # Modules
        self.mod_crm = ModuleDefinition.objects.create(code='crm', name='CRM', category=ModuleCategory.CORE, is_core=True)
        self.mod_hr = ModuleDefinition.objects.create(code='hr', name='HR', category=ModuleCategory.HR)
        self.mod_inventory = ModuleDefinition.objects.create(code='inventory', name='Inventory', category=ModuleCategory.OPERATIONS)

        # Company Modules
        CompanyModule.objects.create(company=self.security_co, module=self.mod_crm, enabled=True)
        CompanyModule.objects.create(company=self.security_co, module=self.mod_hr, enabled=True)
        # inventory disabled for security_co
        
        CompanyModule.objects.create(company=self.tech_co, module=self.mod_inventory, enabled=True)
        # crm disabled for tech_co

        # Existing User
        self.existing_user = User.objects.create_user(
            username='sec_user', password='password', company=self.security_co, access_mode='CUSTOM'
        )
        UserModuleAccess.objects.create(user=self.existing_user, module=self.mod_crm, enabled=True)

    def test_ajax_view_security_labels(self):
        """Security company shows only its enabled modules, mapped correctly."""
        url = reverse('admin:user_company_modules')
        response = self.client.get(url, {'company_id': self.security_co.id})
        self.assertEqual(response.status_code, 200)
        
        data = response.json()['modules']
        self.assertEqual(len(data), 2)
        
        codes = [m['code'] for m in data]
        self.assertIn('crm', codes)
        self.assertIn('hr', codes)
        self.assertNotIn('inventory', codes) # disabled
        
        # Label mapping
        crm_module = next(m for m in data if m['code'] == 'crm')
        self.assertEqual(crm_module['name'], 'Clients & Contracts')
        
    def test_ajax_view_non_security_labels(self):
        """non-Security company shows its own enabled modules."""
        url = reverse('admin:user_company_modules')
        response = self.client.get(url, {'company_id': self.tech_co.id})
        data = response.json()['modules']
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['code'], 'inventory')
        self.assertEqual(data[0]['name'], 'Inventory') # Normal name

    def test_custom_assignments_save_correctly(self):
        """CUSTOM assignments save correctly and disabled CompanyModule cannot be granted; cross-company blocked."""
        # Using the CustomUserChangeForm
        form_data = {
            'username': 'sec_user',
            'company': self.security_co.id,
            'access_mode': 'CUSTOM',
            'custom_modules': ['hr'], # Only request hr
            'role': 'staff',
            'date_joined': '2026-01-01 12:00:00'
        }
        form = CustomUserChangeForm(instance=self.existing_user, data=form_data)
        if not form.is_valid():
            print(form.errors)
        self.assertTrue(form.is_valid())
        
        form.save()
        
        # Verify
        access = UserModuleAccess.objects.filter(user=self.existing_user, enabled=True).values_list('module__code', flat=True)
        self.assertIn('hr', access)
        self.assertNotIn('crm', access) # Was overwritten

    def test_cross_company_module_assignment_is_blocked(self):
        """cross-company module assignment is blocked at form validation."""
        form_data = {
            'username': 'sec_user',
            'company': self.security_co.id,
            'access_mode': 'CUSTOM',
            'custom_modules': ['hr', 'inventory'], # Request inventory (disabled/cross-company)
            'role': 'staff',
            'date_joined': '2026-01-01 12:00:00'
        }
        form = CustomUserChangeForm(instance=self.existing_user, data=form_data)
        self.assertFalse(form.is_valid())
        self.assertIn('custom_modules', form.errors)

    def test_full_company_works_correctly(self):
        """FULL_COMPANY works correctly."""
        form_data = {
            'username': 'sec_user',
            'company': self.security_co.id,
            'access_mode': 'FULL_COMPANY',
            'custom_modules': ['hr'], # Should be ignored and wiped
            'role': 'staff',
            'date_joined': '2026-01-01 12:00:00'
        }
        form = CustomUserChangeForm(instance=self.existing_user, data=form_data)
        self.assertTrue(form.is_valid())
        form.save()
        
        # Verify access wiped
        access = UserModuleAccess.objects.filter(user=self.existing_user, enabled=True)
        self.assertEqual(access.count(), 0)

    def test_editing_existing_user_loads_correct_access(self):
        """editing existing user loads correct access."""
        form = CustomUserChangeForm(instance=self.existing_user)
        self.assertIn('crm', form.fields['custom_modules'].initial)
        
        # Choices should be populated for the user's company
        choices = dict(form.fields['custom_modules'].choices)
        self.assertIn('crm', choices)
        self.assertIn('hr', choices)
        self.assertNotIn('inventory', choices)

    def test_legacy_role_does_not_determine_effective_module_access(self):
        """legacy role does not determine effective module access."""
        self.existing_user.role = 'cashier'
        self.existing_user.access_mode = 'CUSTOM'
        self.existing_user.save()
        
        # The form should still obey custom_modules and access_mode, not force cashier modules
        form_data = {
            'username': 'sec_user',
            'company': self.security_co.id,
            'access_mode': 'CUSTOM',
            'custom_modules': [],
            'role': 'cashier',
            'date_joined': '2026-01-01 12:00:00'
        }
        form = CustomUserChangeForm(instance=self.existing_user, data=form_data)
        if not form.is_valid():
            print(form.errors)
        self.assertTrue(form.is_valid())
        form.save()
        
        access = UserModuleAccess.objects.filter(user=self.existing_user, enabled=True)
        self.assertEqual(access.count(), 0) # No modules despite being cashier
