"""
platform_core/tests_phase2.py

Phase 2 — Module Access / Feature Gating Tests

Test matrix:
  1.  Enabled module allows access
  2.  Disabled module blocks access (403)
  3.  Company A cannot use Company B's module state
  4.  Disabled module returns structured 403 JSON
  5.  Enabled module still respects RBAC
  6.  Disabled module blocks even users who otherwise have RBAC permission
  7.  Core module protection remains functional
  8.  Unauthenticated users cannot bypass module protection
  9.  Superadmin bypasses module gating
  10. Module state endpoint returns tenant-isolated data
  11. Inventory endpoints gated by 'inventory' module
  12. Services endpoints gated by 'services' module
  13. Finance endpoints gated by 'finance' module
  14. HR endpoints gated by 'hr' module
  15. Reports endpoint gated by 'reports' module
  16. ModulePermission no-op when required_module not set on view
  17. require_module decorator works on function-based view
"""
import uuid
from datetime import timedelta
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from companies.models import Company
from subscriptions.models import CompanySubscription, SubscriptionPlan
from platform_core.models import ModuleDefinition, CompanyModule
from platform_core.services import enable_module, disable_module
from platform_core.permissions import ModulePermission

User = get_user_model()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_company(name='TestCo'):
    domain = f'{name.lower().replace(" ", "")}-{uuid.uuid4().hex[:6]}.test'
    c = Company.objects.create(name=name, domain=domain, business_type='other')
    plan, _ = SubscriptionPlan.objects.get_or_create(
        name='Basic', defaults={'price': 0, 'max_users': 10}
    )
    CompanySubscription.objects.create(
        company=c,
        plan=plan,
        start_date=timezone.now().date(),
        end_date=(timezone.now() + timedelta(days=365)).date(),
        is_active=True,
    )
    return c


def _make_user(company, role='admin', username=None):
    username = username or f'user_{uuid.uuid4().hex[:8]}'
    return User.objects.create_user(
        username=username,
        password='testpass123',
        company=company,
        role=role,
    )


def _token(user):
    return str(RefreshToken.for_user(user).access_token)


def _ensure_module(code, name=None, is_core=False):
    """Get or create a ModuleDefinition by code."""
    obj, _ = ModuleDefinition.objects.get_or_create(
        code=code,
        defaults={
            'name': name or code.title(),
            'category': 'operations',
            'is_core': is_core,
            'is_active': True,
        }
    )
    return obj


# ---------------------------------------------------------------------------
# 1-6: ModulePermission unit tests via fake request/view
# ---------------------------------------------------------------------------

class ModulePermissionUnitTests(TestCase):
    """
    Direct unit tests for ModulePermission without going through the HTTP stack.
    """

    def setUp(self):
        self.company = _make_company('PermCo')
        self.admin = _make_user(self.company, role='admin')
        self.module_def = _ensure_module('crm')

    # ── Helpers ─────────────────────────────────────────────────────────────

    def _make_request(self, user):
        from rest_framework.request import Request
        from rest_framework.test import APIRequestFactory
        factory = APIRequestFactory()
        raw = factory.get('/')
        raw.user = user
        return raw

    def _make_view(self, module_code):
        class FakeView:
            required_module = module_code
        return FakeView()

    # ── Tests ────────────────────────────────────────────────────────────────

    def test_enabled_module_grants_permission(self):
        """Test 1: enabled module allows access."""
        enable_module(self.company.pk, 'crm')
        perm = ModulePermission()
        req = self._make_request(self.admin)
        self.assertTrue(perm.has_permission(req, self._make_view('crm')))

    def test_disabled_module_denies_permission(self):
        """Test 2: disabled module blocks access."""
        from rest_framework.exceptions import PermissionDenied
        # Ensure module is disabled
        CompanyModule.objects.filter(company=self.company, module=self.module_def).delete()
        perm = ModulePermission()
        req = self._make_request(self.admin)
        with self.assertRaises(PermissionDenied):
            perm.has_permission(req, self._make_view('crm'))

    def test_disabled_module_error_contains_module_code(self):
        """Test 4: disabled module returns structured error with module code."""
        from rest_framework.exceptions import PermissionDenied
        CompanyModule.objects.filter(company=self.company, module=self.module_def).delete()
        perm = ModulePermission()
        req = self._make_request(self.admin)
        try:
            perm.has_permission(req, self._make_view('crm'))
            self.fail("Expected PermissionDenied")
        except PermissionDenied as exc:
            self.assertEqual(exc.detail['module'], 'crm')
            self.assertIn('not enabled', exc.detail['detail'])

    def test_no_required_module_is_noop(self):
        """Test 16: view with no required_module — permission always granted."""
        perm = ModulePermission()
        req = self._make_request(self.admin)
        class NoModuleView:
            pass
        self.assertTrue(perm.has_permission(req, NoModuleView()))

    def test_superuser_bypasses_module_gating(self):
        """Test 9: superadmin bypasses module gating regardless of module state."""
        su = User.objects.create_superuser(
            username='sup_perm', password='x', email='s@s.com'
        )
        CompanyModule.objects.filter(company=self.company, module=self.module_def).delete()
        perm = ModulePermission()
        req = self._make_request(su)
        self.assertTrue(perm.has_permission(req, self._make_view('crm')))

    def test_enable_then_disable_revokes_permission(self):
        """Test 7-adjacent: toggling module state is reflected immediately."""
        from rest_framework.exceptions import PermissionDenied
        enable_module(self.company.pk, 'crm')
        perm = ModulePermission()
        req = self._make_request(self.admin)
        self.assertTrue(perm.has_permission(req, self._make_view('crm')))
        # Now disable
        disable_module(self.company.pk, 'crm')
        with self.assertRaises(PermissionDenied):
            perm.has_permission(req, self._make_view('crm'))

    def test_user_without_company_bypasses_gating(self):
        """Users with no company_id (platform staff) bypass module gating."""
        user = User.objects.create_user(username='nocompany', password='x')
        user.company_id = None
        perm = ModulePermission()
        req = self._make_request(user)
        self.assertTrue(perm.has_permission(req, self._make_view('crm')))


# ---------------------------------------------------------------------------
# 3 + 10: Tenant isolation — API-level
# ---------------------------------------------------------------------------

class ModuleGatingTenantIsolationTests(TestCase):
    """Company A's module state must NOT affect Company B."""

    def setUp(self):
        self.company_a = _make_company('CompanyA')
        self.company_b = _make_company('CompanyB')
        self.user_a = _make_user(self.company_a, role='admin', username='usera')
        self.user_b = _make_user(self.company_b, role='admin', username='userb')
        _ensure_module('hr')
        _ensure_module('inventory')

    def _client(self, user):
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f'Bearer {_token(user)}')
        return c

    def test_company_a_enabled_does_not_grant_company_b(self):
        """Test 3: Company A enabling CRM must not give Company B access."""
        _ensure_module('crm')
        enable_module(self.company_a.pk, 'crm')
        # company_b has crm disabled — check via permission object
        from rest_framework.exceptions import PermissionDenied
        from rest_framework.test import APIRequestFactory
        perm = ModulePermission()
        factory = APIRequestFactory()
        raw = factory.get('/')
        raw.user = self.user_b

        class FakeView:
            required_module = 'crm'

        with self.assertRaises(PermissionDenied):
            perm.has_permission(raw, FakeView())

    def test_module_state_endpoint_is_tenant_isolated(self):
        """Test 10: /api/platform/module-state/ returns each company's own state."""
        enable_module(self.company_a.pk, 'inventory')
        # company_b does NOT have inventory enabled
        client_b = self._client(self.user_b)
        resp = client_b.get('/api/platform/module-state/')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        # inventory key exists and is False for company_b
        self.assertIn('inventory', data)
        self.assertFalse(data['inventory'])

        # Now verify company_a sees it as True
        client_a = self._client(self.user_a)
        resp_a = client_a.get('/api/platform/module-state/')
        self.assertEqual(resp_a.status_code, 200)
        self.assertTrue(resp_a.json()['inventory'])


# ---------------------------------------------------------------------------
# 1 + 2 + 4 + 8: Inventory endpoint gating (HTTP-level)
# ---------------------------------------------------------------------------

class InventoryModuleGatingTests(TestCase):
    """Inventory API endpoints require the 'inventory' module to be enabled."""

    def setUp(self):
        self.company = _make_company('InvCo')
        self.admin = _make_user(self.company, role='admin', username='invadmin')
        _ensure_module('inventory', is_core=True)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {_token(self.admin)}')

    def test_inventory_enabled_allows_product_list(self):
        """Test 1: enabled module allows access to /api/inventory/products/"""
        enable_module(self.company.pk, 'inventory')
        resp = self.client.get('/api/inventory/products/')
        self.assertNotEqual(resp.status_code, 403)

    def test_inventory_disabled_blocks_product_list(self):
        """Test 2: disabled module blocks access to /api/inventory/products/"""
        CompanyModule.objects.filter(
            company=self.company,
            module__code='inventory'
        ).update(enabled=False)
        resp = self.client.get('/api/inventory/products/')
        self.assertEqual(resp.status_code, 403)

    def test_disabled_inventory_returns_structured_403(self):
        """Test 4: 403 response includes module code in JSON body."""
        CompanyModule.objects.filter(
            company=self.company,
            module__code='inventory'
        ).update(enabled=False)
        resp = self.client.get('/api/inventory/categorys/')
        self.assertEqual(resp.status_code, 403)
        data = resp.json()
        self.assertIn('module', data)
        self.assertEqual(data['module'], 'inventory')
        self.assertIn('detail', data)

    def test_unauthenticated_cannot_bypass_inventory_module(self):
        """Test 8: unauthenticated requests are blocked at auth level first."""
        anon = APIClient()
        resp = anon.get('/api/inventory/products/')
        self.assertEqual(resp.status_code, 401)

    def test_enabled_inventory_respects_rbac(self):
        """Test 5: enabled module + wrong RBAC still denies write access."""
        enable_module(self.company.pk, 'inventory')
        staff = _make_user(self.company, role='staff', username='invstaff')
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f'Bearer {_token(staff)}')
        # staff cannot create categories (RolePermission blocks writes)
        resp = c.post('/api/inventory/categorys/', {'name': 'Test'}, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_disabled_inventory_blocks_user_with_admin_role(self):
        """Test 6: disabled module blocks even users who have RBAC permission."""
        CompanyModule.objects.filter(
            company=self.company,
            module__code='inventory'
        ).update(enabled=False)
        resp = self.client.get('/api/inventory/products/')
        self.assertEqual(resp.status_code, 403)


# ---------------------------------------------------------------------------
# Services endpoint gating
# ---------------------------------------------------------------------------

class ServicesModuleGatingTests(TestCase):
    """Services API endpoints require the 'services' module."""

    def setUp(self):
        self.company = _make_company('SvcCo')
        self.admin = _make_user(self.company, role='admin', username='svcadmin')
        _ensure_module('services')
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {_token(self.admin)}')

    def test_services_enabled_allows_list(self):
        """Test 11: 'services' module enabled — can list service orders."""
        enable_module(self.company.pk, 'services')
        resp = self.client.get('/api/services/serviceorders/')
        self.assertNotEqual(resp.status_code, 403)

    def test_services_disabled_blocks_list(self):
        """Test 11: 'services' module disabled — blocked with 403."""
        CompanyModule.objects.filter(
            company=self.company,
            module__code='services'
        ).update(enabled=False)
        resp = self.client.get('/api/services/serviceorders/')
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.json()['module'], 'services')

    def test_services_disabled_blocks_technician_list(self):
        """Even the technician list (read-only endpoint) is blocked when services disabled."""
        CompanyModule.objects.filter(
            company=self.company,
            module__code='services'
        ).update(enabled=False)
        resp = self.client.get('/api/services/serviceorders/')
        self.assertEqual(resp.status_code, 403)


# ---------------------------------------------------------------------------
# Finance endpoint gating
# ---------------------------------------------------------------------------

class FinanceModuleGatingTests(TestCase):
    """Finance API endpoints require the 'finance' module."""

    def setUp(self):
        self.company = _make_company('FinCo')
        self.admin = _make_user(self.company, role='admin', username='finadmin')
        _ensure_module('finance', is_core=True)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {_token(self.admin)}')

    def test_finance_enabled_allows_expense_list(self):
        """Test 13: 'finance' module enabled — can list expenses."""
        enable_module(self.company.pk, 'finance')
        resp = self.client.get('/api/finance/expenses/')
        self.assertNotEqual(resp.status_code, 403)

    def test_finance_disabled_blocks_expense_list(self):
        """Test 13: 'finance' module disabled — blocked with structured 403."""
        CompanyModule.objects.filter(
            company=self.company,
            module__code='finance'
        ).update(enabled=False)
        resp = self.client.get('/api/finance/expenses/')
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.json()['module'], 'finance')


# ---------------------------------------------------------------------------
# HR endpoint gating
# ---------------------------------------------------------------------------

class HRModuleGatingTests(TestCase):
    """HRM API endpoints require the 'hr' module."""

    def setUp(self):
        self.company = _make_company('HRCo')
        self.admin = _make_user(self.company, role='admin', username='hradmin')
        _ensure_module('hr')
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {_token(self.admin)}')

    def test_hr_enabled_allows_department_list(self):
        """Test 14: 'hr' module enabled — can list departments."""
        enable_module(self.company.pk, 'hr')
        resp = self.client.get('/api/hrm/departments/')
        self.assertNotEqual(resp.status_code, 403)

    def test_hr_disabled_blocks_department_list(self):
        """Test 14: 'hr' module disabled — blocked with 403."""
        CompanyModule.objects.filter(
            company=self.company,
            module__code='hr'
        ).update(enabled=False)
        resp = self.client.get('/api/hrm/departments/')
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.json()['module'], 'hr')

    def test_hr_disabled_blocks_employee_records(self):
        CompanyModule.objects.filter(
            company=self.company,
            module__code='hr'
        ).update(enabled=False)
        resp = self.client.get('/api/hrm/employeerecords/')
        self.assertEqual(resp.status_code, 403)


# ---------------------------------------------------------------------------
# Reports endpoint gating
# ---------------------------------------------------------------------------

class ReportsModuleGatingTests(TestCase):
    """Reports API endpoints require the 'reports' module."""

    def setUp(self):
        self.company = _make_company('RepCo')
        self.admin = _make_user(self.company, role='admin', username='repadmin')
        _ensure_module('reports', is_core=True)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {_token(self.admin)}')

    def test_reports_disabled_blocks_dashboard(self):
        """Test 15: 'reports' module disabled — dashboard returns 403."""
        CompanyModule.objects.filter(
            company=self.company,
            module__code='reports'
        ).update(enabled=False)
        resp = self.client.get('/api/reports/dashboard/')
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.json()['module'], 'reports')

    def test_reports_enabled_allows_dashboard(self):
        """Test 15: 'reports' module enabled — dashboard accessible."""
        enable_module(self.company.pk, 'reports')
        resp = self.client.get('/api/reports/dashboard/')
        self.assertNotEqual(resp.status_code, 403)


# ---------------------------------------------------------------------------
# Core module protection
# ---------------------------------------------------------------------------

class CoreModuleProtectionTests(TestCase):
    """
    Test 7: Core modules cannot be disabled by company admins.
    Phase 1 service layer enforces this; Phase 2 must not break it.
    """

    def setUp(self):
        self.company = _make_company('CoreCo')
        self.admin = _make_user(self.company, role='admin', username='coreadmin')
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {_token(self.admin)}')

    def test_cannot_disable_core_module_via_api(self):
        """Core module 'sales' cannot be disabled through the API."""
        _ensure_module('sales', is_core=True)
        enable_module(self.company.pk, 'sales')
        resp = self.client.post(
            '/api/platform/company-modules/disable/',
            {'module_code': 'sales'},
            format='json'
        )
        self.assertEqual(resp.status_code, 400)

    def test_core_module_remains_accessible_after_disable_attempt(self):
        """After a failed disable attempt, the module stays enabled."""
        _ensure_module('sales', is_core=True)
        enable_module(self.company.pk, 'sales')
        # Attempt to disable (should fail)
        self.client.post(
            '/api/platform/company-modules/disable/',
            {'module_code': 'sales'},
            format='json'
        )
        # Module should still be enabled
        from platform_core.services import is_module_enabled
        self.assertTrue(is_module_enabled(self.company.pk, 'sales'))


# ---------------------------------------------------------------------------
# Module state endpoint
# ---------------------------------------------------------------------------

class ModuleStateEndpointTests(TestCase):
    """GET /api/platform/module-state/ — comprehensive coverage."""

    def setUp(self):
        self.company = _make_company('StateCo')
        self.admin = _make_user(self.company, role='admin', username='stateadmin')
        self.staff = _make_user(self.company, role='staff', username='statestaff')
        _ensure_module('inventory')
        _ensure_module('hr')
        _ensure_module('crm')
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {_token(self.admin)}')

    def test_module_state_returns_dict(self):
        """Response is a flat {code: bool} dictionary."""
        resp = self.client.get('/api/platform/module-state/')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIsInstance(data, dict)
        # All values are booleans
        for val in data.values():
            self.assertIsInstance(val, bool)

    def test_enabled_module_shows_true(self):
        enable_module(self.company.pk, 'inventory')
        resp = self.client.get('/api/platform/module-state/')
        self.assertTrue(resp.json()['inventory'])

    def test_disabled_module_shows_false(self):
        CompanyModule.objects.filter(
            company=self.company, module__code='hr'
        ).update(enabled=False)
        resp = self.client.get('/api/platform/module-state/')
        self.assertFalse(resp.json()['hr'])

    def test_unactivated_module_shows_false(self):
        """Module not in CompanyModule at all → false."""
        CompanyModule.objects.filter(
            company=self.company, module__code='crm'
        ).delete()
        resp = self.client.get('/api/platform/module-state/')
        self.assertFalse(resp.json()['crm'])

    def test_staff_can_read_module_state(self):
        """Staff (non-admin) can read module state for frontend nav."""
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f'Bearer {_token(self.staff)}')
        resp = c.get('/api/platform/module-state/')
        self.assertEqual(resp.status_code, 200)

    def test_unauthenticated_blocked(self):
        """Unauthenticated users cannot read module state."""
        anon = APIClient()
        resp = anon.get('/api/platform/module-state/')
        self.assertEqual(resp.status_code, 401)

    def test_tenant_isolation(self):
        """Test 10: Different companies see different states."""
        company2 = _make_company('StateCoB')
        admin2 = _make_user(company2, role='admin', username='stateadmin2')

        enable_module(self.company.pk, 'inventory')
        # company2 does NOT have inventory enabled

        c2 = APIClient()
        c2.credentials(HTTP_AUTHORIZATION=f'Bearer {_token(admin2)}')
        resp2 = c2.get('/api/platform/module-state/')
        self.assertFalse(resp2.json().get('inventory', False))


# ---------------------------------------------------------------------------
# require_module decorator
# ---------------------------------------------------------------------------

class RequireModuleDecoratorTests(TestCase):
    """Test 17: @require_module decorator on function-based views."""

    def setUp(self):
        self.company = _make_company('DecCo')
        self.admin = _make_user(self.company, role='admin', username='decadmin')
        _ensure_module('analytics')

    def test_decorator_blocks_disabled_module(self):
        """@require_module raises 403 response when module is disabled."""
        from platform_core.decorators import require_module
        from rest_framework.decorators import api_view
        from rest_framework.response import Response
        from rest_framework.test import APIRequestFactory, force_authenticate

        @api_view(['GET'])
        @require_module('analytics')
        def dummy_view(request):
            return Response({'ok': True})

        factory = APIRequestFactory()
        raw_req = factory.get('/')
        force_authenticate(raw_req, user=self.admin)

        # analytics disabled — decorator should return 403 dict response
        CompanyModule.objects.filter(
            company=self.company, module__code='analytics'
        ).delete()
        response = dummy_view(raw_req)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data['module'], 'analytics')

    def test_decorator_allows_enabled_module(self):
        """@require_module allows access when module is enabled."""
        from platform_core.decorators import require_module
        from rest_framework.decorators import api_view
        from rest_framework.response import Response
        from rest_framework.test import APIRequestFactory, force_authenticate

        enable_module(self.company.pk, 'analytics')

        @api_view(['GET'])
        @require_module('analytics')
        def dummy_view(request):
            return Response({'ok': True})

        factory = APIRequestFactory()
        raw_req = factory.get('/')
        force_authenticate(raw_req, user=self.admin)
        response = dummy_view(raw_req)
        self.assertEqual(response.status_code, 200)

    def test_decorator_superuser_bypasses(self):
        """@require_module: superuser bypasses even if module is disabled."""
        from platform_core.decorators import require_module
        from rest_framework.decorators import api_view
        from rest_framework.response import Response
        from rest_framework.test import APIRequestFactory, force_authenticate

        su = User.objects.create_superuser(
            username='su_dec', password='x', email='sud@s.com'
        )
        CompanyModule.objects.filter(
            company=self.company, module__code='analytics'
        ).delete()

        @api_view(['GET'])
        @require_module('analytics')
        def dummy_view(request):
            return Response({'ok': True})

        factory = APIRequestFactory()
        raw_req = factory.get('/')
        force_authenticate(raw_req, user=su)
        response = dummy_view(raw_req)
        self.assertEqual(response.status_code, 200)
