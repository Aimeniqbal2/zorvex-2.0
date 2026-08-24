"""
platform_core/tests.py

Tests for:
  - Tenant isolation (branch/warehouse)
  - Module enable/disable (services layer)
  - Duplicate module prevention
  - Branch/warehouse isolation
  - Unauthorized module changes
  - Superadmin access
  - Company admin access
  - Core module protection
"""
import uuid
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APITestCase, APIClient
from rest_framework import status

from accounts.models import User
from companies.models import Company
from .models import ModuleDefinition, CompanyModule, Branch, Warehouse, BusinessType
from .services import enable_module, disable_module, get_enabled_modules, is_module_enabled


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def make_company(name='TestCo', domain=None):
    domain = domain or f'{name.lower().replace(" ", "")}-{uuid.uuid4().hex[:6]}.test'
    return Company.objects.create(name=name, domain=domain, business_type='retail')


def make_user(company, username=None, role='admin', is_superuser=False):
    username = username or f'user_{uuid.uuid4().hex[:6]}'
    user = User.objects.create_user(
        username=username,
        password='Testpass123!',
        company=company if not is_superuser else None,
        role=role,
        is_superuser=is_superuser,
    )
    return user


def make_module(code, name='Test Module', category='core', is_core=False, is_active=True):
    return ModuleDefinition.objects.create(
        code=code, name=name, category=category,
        is_core=is_core, is_active=is_active,
    )


# ---------------------------------------------------------------------------
# Service layer tests
# ---------------------------------------------------------------------------
class ModuleServiceTests(TestCase):

    def setUp(self):
        self.company = make_company('ServiceCo')
        self.mod = make_module('sales', 'Sales', category='operations')
        self.core_mod = make_module('pos_core', 'POS Core', category='core', is_core=True)

    def test_enable_module_creates_record(self):
        cm = enable_module(self.company, 'sales')
        self.assertTrue(cm.enabled)
        self.assertIsNotNone(cm.activated_at)

    def test_enable_module_idempotent(self):
        enable_module(self.company, 'sales')
        cm2 = enable_module(self.company, 'sales')   # second call
        self.assertTrue(cm2.enabled)
        self.assertEqual(CompanyModule.objects.filter(company=self.company, module=self.mod).count(), 1)

    def test_enable_then_disable_then_reenable(self):
        enable_module(self.company, 'sales')
        disable_module(self.company, 'sales')
        cm = enable_module(self.company, 'sales')
        self.assertTrue(cm.enabled)
        self.assertIsNone(cm.deactivated_at)

    def test_disable_module_sets_flag(self):
        enable_module(self.company, 'sales')
        cm = disable_module(self.company, 'sales')
        self.assertFalse(cm.enabled)
        self.assertIsNotNone(cm.deactivated_at)

    def test_disable_core_module_raises(self):
        enable_module(self.company, 'pos_core')
        with self.assertRaises(ValueError):
            disable_module(self.company, 'pos_core')

    def test_disable_not_activated_raises(self):
        with self.assertRaises(ValueError):
            disable_module(self.company, 'sales')

    def test_enable_unknown_code_raises(self):
        with self.assertRaises(ValueError):
            enable_module(self.company, 'nonexistent_xyz')

    def test_is_module_enabled_true(self):
        enable_module(self.company, 'sales')
        self.assertTrue(is_module_enabled(self.company, 'sales'))

    def test_is_module_enabled_false_when_disabled(self):
        enable_module(self.company, 'sales')
        disable_module(self.company, 'sales')
        self.assertFalse(is_module_enabled(self.company, 'sales'))

    def test_is_module_enabled_false_when_not_activated(self):
        self.assertFalse(is_module_enabled(self.company, 'sales'))

    def test_get_enabled_modules(self):
        enable_module(self.company, 'sales')
        modules = list(get_enabled_modules(self.company))
        codes = [m.code for m in modules]
        self.assertIn('sales', codes)

    def test_duplicate_company_module_prevented(self):
        """CompanyModule unique_together prevents duplicate DB records."""
        enable_module(self.company, 'sales')
        # Attempt direct create
        with self.assertRaises(Exception):
            CompanyModule.objects.create(company=self.company, module=self.mod)


# ---------------------------------------------------------------------------
# Tenant isolation tests
# ---------------------------------------------------------------------------
class TenantIsolationTests(TestCase):

    def setUp(self):
        self.company_a = make_company('CompanyA')
        self.company_b = make_company('CompanyB')
        self.mod = make_module('inventory', 'Inventory', category='operations')

    def test_enable_for_one_company_does_not_affect_other(self):
        enable_module(self.company_a, 'inventory')
        self.assertTrue(is_module_enabled(self.company_a, 'inventory'))
        self.assertFalse(is_module_enabled(self.company_b, 'inventory'))

    def test_branch_isolation(self):
        Branch.all_objects.create(company=self.company_a, name='Branch A', code='BRA-01')
        # company_b should not see company_a's branches via scoped manager
        # (manager uses thread-local, so we test with all_objects directly)
        a_branches = Branch.all_objects.filter(company=self.company_a)
        b_branches = Branch.all_objects.filter(company=self.company_b)
        self.assertEqual(a_branches.count(), 1)
        self.assertEqual(b_branches.count(), 0)

    def test_warehouse_isolation(self):
        Warehouse.all_objects.create(company=self.company_a, name='WH1', code='WH-A')
        a_wh = Warehouse.all_objects.filter(company=self.company_a)
        b_wh = Warehouse.all_objects.filter(company=self.company_b)
        self.assertEqual(a_wh.count(), 1)
        self.assertEqual(b_wh.count(), 0)


# ---------------------------------------------------------------------------
# API endpoint tests
# ---------------------------------------------------------------------------
class ModuleAPITests(APITestCase):

    def setUp(self):
        self.company = make_company('APICo')
        self.admin   = make_user(self.company, role='admin')
        self.staff   = make_user(self.company, role='staff')
        self.superadmin = make_user(None, role='super_admin', is_superuser=True)
        self.mod = make_module('crm', 'CRM', category='operations')

        # Force-create subscription so middleware passes
        from subscriptions.models import SubscriptionPlan, CompanySubscription
        import datetime
        plan = SubscriptionPlan.objects.create(name='Test', price=0)
        CompanySubscription.objects.create(
            company=self.company,
            plan=plan,
            start_date=datetime.date.today(),
            end_date=datetime.date(2099, 1, 1),
            is_active=True,
        )

    def _auth(self, user):
        self.client.force_authenticate(user=user)

    # ---- catalogue ----
    def test_catalogue_requires_auth(self):
        resp = self.client.get('/api/platform/modules/')
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_catalogue_accessible_by_admin(self):
        self._auth(self.admin)
        resp = self.client.get('/api/platform/modules/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_catalogue_accessible_by_staff(self):
        self._auth(self.staff)
        resp = self.client.get('/api/platform/modules/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    # ---- enable ----
    def test_enable_module_admin_success(self):
        self._auth(self.admin)
        resp = self.client.post('/api/platform/company-modules/enable/', {'module_code': 'crm'})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data['enabled'])

    def test_enable_module_staff_forbidden(self):
        self._auth(self.staff)
        resp = self.client.post('/api/platform/company-modules/enable/', {'module_code': 'crm'})
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_enable_unknown_module_400(self):
        self._auth(self.admin)
        resp = self.client.post('/api/platform/company-modules/enable/', {'module_code': 'unknown_xyz'})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    # ---- disable ----
    def test_disable_module_admin_success(self):
        enable_module(self.company, 'crm')
        self._auth(self.admin)
        resp = self.client.post('/api/platform/company-modules/disable/', {'module_code': 'crm'})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertFalse(resp.data['enabled'])

    def test_disable_core_module_400(self):
        core_mod = make_module('erp_core_sys', 'Core Sys', is_core=True)
        enable_module(self.company, 'erp_core_sys')
        self._auth(self.admin)
        resp = self.client.post('/api/platform/company-modules/disable/', {'module_code': 'erp_core_sys'})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_disable_module_staff_forbidden(self):
        enable_module(self.company, 'crm')
        self._auth(self.staff)
        resp = self.client.post('/api/platform/company-modules/disable/', {'module_code': 'crm'})
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    # ---- list company modules ----
    def test_company_module_list(self):
        enable_module(self.company, 'crm')
        self._auth(self.admin)
        resp = self.client.get('/api/platform/company-modules/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        codes = [r['module_code'] for r in resp.data]
        self.assertIn('crm', codes)

    # ---- superadmin needs company_id ----
    def test_superadmin_without_company_id_400(self):
        self._auth(self.superadmin)
        resp = self.client.post('/api/platform/company-modules/enable/', {'module_code': 'crm'})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_superadmin_with_company_id_can_enable(self):
        self._auth(self.superadmin)
        resp = self.client.post(
            '/api/platform/company-modules/enable/',
            {'module_code': 'crm', 'company_id': str(self.company.pk)},
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)


class BranchAPITests(APITestCase):

    def setUp(self):
        self.company = make_company('BranchCo')
        self.admin   = make_user(self.company, role='admin')
        self.staff   = make_user(self.company, role='staff')

        from subscriptions.models import SubscriptionPlan, CompanySubscription
        import datetime
        plan = SubscriptionPlan.objects.create(name='Test', price=0)
        CompanySubscription.objects.create(
            company=self.company, plan=plan,
            start_date=datetime.date.today(),
            end_date=datetime.date(2099, 1, 1),
            is_active=True,
        )

    def _auth(self, user):
        self.client.force_authenticate(user=user)

    def test_create_branch_admin_success(self):
        self._auth(self.admin)
        resp = self.client.post('/api/platform/branches/', {
            'name': 'Main Branch', 'code': 'MB-01',
            'address': '123 Main St', 'phone': '0300-0000000',
        })
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data['name'], 'Main Branch')

    def test_create_branch_staff_forbidden(self):
        self._auth(self.staff)
        resp = self.client.post('/api/platform/branches/', {'name': 'Branch X', 'code': 'BX-01'})
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_list_branches_staff_allowed(self):
        Branch.all_objects.create(company=self.company, name='HQ', code='HQ-01')
        self._auth(self.staff)
        resp = self.client.get('/api/platform/branches/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_branch_cross_company_isolation(self):
        other_company = make_company('OtherCo')
        Branch.all_objects.create(company=other_company, name='Other Branch', code='OB-01')
        self._auth(self.admin)
        resp = self.client.get('/api/platform/branches/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        # Our company has no branches yet
        self.assertEqual(len(resp.data), 0)

    def test_update_branch(self):
        branch = Branch.all_objects.create(company=self.company, name='Old Name', code='OB-01')
        self._auth(self.admin)
        resp = self.client.patch(f'/api/platform/branches/{branch.pk}/', {'name': 'New Name'})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['name'], 'New Name')

    def test_delete_branch_soft(self):
        branch = Branch.all_objects.create(company=self.company, name='To Delete', code='DEL-01')
        self._auth(self.admin)
        resp = self.client.delete(f'/api/platform/branches/{branch.pk}/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        branch.refresh_from_db()
        self.assertTrue(branch.is_deleted)


class WarehouseAPITests(APITestCase):

    def setUp(self):
        self.company = make_company('WhCo')
        self.admin   = make_user(self.company, role='admin')
        self.staff   = make_user(self.company, role='staff')

        from subscriptions.models import SubscriptionPlan, CompanySubscription
        import datetime
        plan = SubscriptionPlan.objects.create(name='Test', price=0)
        CompanySubscription.objects.create(
            company=self.company, plan=plan,
            start_date=datetime.date.today(),
            end_date=datetime.date(2099, 1, 1),
            is_active=True,
        )

    def _auth(self, user):
        self.client.force_authenticate(user=user)

    def test_create_warehouse_admin(self):
        self._auth(self.admin)
        resp = self.client.post('/api/platform/warehouses/', {
            'name': 'Main WH', 'code': 'MWH-01', 'address': 'Industrial Zone'
        })
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_create_warehouse_staff_forbidden(self):
        self._auth(self.staff)
        resp = self.client.post('/api/platform/warehouses/', {'name': 'WH', 'code': 'W-01'})
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_warehouse_cross_company_isolation(self):
        other = make_company('OtherWH')
        Warehouse.all_objects.create(company=other, name='Other WH', code='OWH-01')
        self._auth(self.admin)
        resp = self.client.get('/api/platform/warehouses/')
        self.assertEqual(len(resp.data), 0)

    def test_warehouse_branch_wrong_company_rejected(self):
        other = make_company('ForeignCo')
        foreign_branch = Branch.all_objects.create(company=other, name='FB', code='FB-01')
        self._auth(self.admin)
        resp = self.client.post('/api/platform/warehouses/', {
            'name': 'Bad WH', 'code': 'BWH-01',
            'branch': str(foreign_branch.pk),
        })
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class BusinessTypeAPITests(APITestCase):

    def setUp(self):
        self.company = make_company('BTCo')
        self.admin   = make_user(self.company, role='admin')
        self.staff   = make_user(self.company, role='staff')

        from subscriptions.models import SubscriptionPlan, CompanySubscription
        import datetime
        plan = SubscriptionPlan.objects.create(name='BT Plan', price=0)
        CompanySubscription.objects.create(
            company=self.company, plan=plan,
            start_date=datetime.date.today(),
            end_date=datetime.date(2099, 1, 1),
            is_active=True,
        )

    def _auth(self, user):
        self.client.force_authenticate(user=user)

    def test_get_business_type(self):
        self._auth(self.admin)
        resp = self.client.get('/api/platform/business-type/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn('business_type', resp.data)

    def test_update_business_type_admin(self):
        self._auth(self.admin)
        resp = self.client.patch('/api/platform/business-type/', {'business_type': 'restaurant'})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['business_type'], 'restaurant')

    def test_update_business_type_staff_forbidden(self):
        self._auth(self.staff)
        resp = self.client.patch('/api/platform/business-type/', {'business_type': 'hotel'})
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_update_invalid_business_type(self):
        self._auth(self.admin)
        resp = self.client.patch('/api/platform/business-type/', {'business_type': 'invalid_type'})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
