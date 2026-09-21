from datetime import date
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth import get_user_model
from companies.models import Company
from finance.models import Currency
from hrm.models import Department, Designation, Employee, EmploymentHistory
from platform_core.models import CompanyModule, ModuleDefinition, UserModuleAccess
from industries.common.registry import register_industry_package
from industries.security.manifest import SecurityPackage

User = get_user_model()

class IndustryAwareHRTests(TestCase):
    def setUp(self):
        # Register Security industry package
        register_industry_package(SecurityPackage)

        # Feature modules
        self.mod_hr, _ = ModuleDefinition.objects.get_or_create(code='hr', defaults={'name': 'HR'})
        self.mod_ops, _ = ModuleDefinition.objects.get_or_create(code='operations', defaults={'name': 'Operations'})
        self.mod_sec_ops, _ = ModuleDefinition.objects.get_or_create(code='security_ops', defaults={'name': 'Security Ops'})

        # 1. Security Company
        self.security_company = Company.objects.create(
            name="Alpha Security Services",
            business_type="security"
        )
        Currency.objects.create(
            company=self.security_company,
            code="PKR",
            name="Pakistani Rupee",
            symbol="Rs",
            is_base_currency=True
        )
        CompanyModule.objects.create(company=self.security_company, module=self.mod_hr, enabled=True)
        CompanyModule.objects.create(company=self.security_company, module=self.mod_ops, enabled=True)
        CompanyModule.objects.create(company=self.security_company, module=self.mod_sec_ops, enabled=True)

        self.sec_superadmin = User.objects.create_user(
            username="sec_super",
            email="sec_super@alpha.com",
            password="password123",
            company=self.security_company,
            role="admin",
            is_superuser=True
        )

        self.sec_admin = User.objects.create_user(
            username="sec_admin",
            email="sec@alpha.com",
            password="password123",
            company=self.security_company,
            role="admin",
            access_mode="FULL_COMPANY"
        )

        self.sec_staff = User.objects.create_user(
            username="sec_staff",
            email="staff@alpha.com",
            password="password123",
            company=self.security_company,
            role="staff",
            access_mode="FULL_COMPANY"
        )

        self.sec_custom_user = User.objects.create_user(
            username="sec_custom",
            email="custom@alpha.com",
            password="password123",
            company=self.security_company,
            role="admin",
            access_mode="CUSTOM"
        )
        # Custom user only granted HR, NOT operations
        UserModuleAccess.objects.create(user=self.sec_custom_user, module=self.mod_hr, enabled=True)

        self.sec_dept = Department.objects.create(company=self.security_company, name="Field Operations")
        self.sec_desig = Designation.objects.create(company=self.security_company, name="Security Guard")

        self.guard = Employee.objects.create(
            company=self.security_company,
            first_name="Ahmed",
            last_name="Khan",
            employee_code="SEC-001",
            classification="DIRECT",
            employment_status="ACTIVE",
            department=self.sec_dept,
            designation=self.sec_desig,
            hire_date=date(2023, 1, 1),
            is_active=True
        )

        # 2. Universal / Non-Security Company
        self.universal_company = Company.objects.create(
            name="Apex Retail Global",
            business_type="retail"
        )
        Currency.objects.create(
            company=self.universal_company,
            code="PKR",
            name="Pakistani Rupee",
            symbol="Rs",
            is_base_currency=True
        )
        CompanyModule.objects.create(company=self.universal_company, module=self.mod_hr, enabled=True)

        self.univ_admin = User.objects.create_user(
            username="univ_admin",
            email="univ@apex.com",
            password="password123",
            company=self.universal_company,
            role="admin",
            access_mode="FULL_COMPANY"
        )

        self.univ_dept = Department.objects.create(company=self.universal_company, name="Sales")
        self.univ_desig = Designation.objects.create(company=self.universal_company, name="Sales Associate")

        self.employee = Employee.objects.create(
            company=self.universal_company,
            first_name="Sara",
            last_name="Ali",
            employee_code="EMP-001",
            classification="INDIRECT",
            employment_status="ACTIVE",
            department=self.univ_dept,
            designation=self.univ_desig,
            hire_date=date(2023, 2, 1),
            is_active=True
        )

        self.inactive_emp = Employee.objects.create(
            company=self.universal_company,
            first_name="Zahid",
            last_name="Malik",
            employee_code="EMP-002",
            classification="INDIRECT",
            employment_status="TERMINATED",
            department=self.univ_dept,
            designation=self.univ_desig,
            hire_date=date(2022, 1, 1),
            is_active=False
        )

        self.client = APIClient()

    # -------------------------------------------------------------------------
    # 1. Security Company HR Routing
    # -------------------------------------------------------------------------
    def test_security_company_hr_routing(self):
        """Security company authoritative routing exposes security industry context and classification filtering."""
        self.client.force_authenticate(user=self.sec_admin)
        cfg_resp = self.client.get('/api/platform/runtime-config/')
        self.assertEqual(cfg_resp.status_code, status.HTTP_200_OK)
        cfg_data = cfg_resp.json()
        self.assertEqual(cfg_data['company']['business_type'], 'security')
        self.assertIsNotNone(cfg_data['industry'])
        self.assertEqual(cfg_data['industry']['code'], 'security')

        # Direct classification filtering
        list_resp = self.client.get('/api/hrm/employees/?classification=DIRECT')
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        results = list_resp.data.get('results', list_resp.data)
        self.assertTrue(any(e['id'] == str(self.guard.id) for e in results))

    # -------------------------------------------------------------------------
    # 2. Non-Security Company HR Routing
    # -------------------------------------------------------------------------
    def test_non_security_company_hr_routing(self):
        """Non-security company HR routing retains universal labels and scoped employee records."""
        self.client.force_authenticate(user=self.univ_admin)
        cfg_resp = self.client.get('/api/platform/runtime-config/')
        self.assertEqual(cfg_resp.status_code, status.HTTP_200_OK)
        cfg_data = cfg_resp.json()
        self.assertEqual(cfg_data['company']['business_type'], 'retail')
        self.assertIsNone(cfg_data.get('industry'))

        # Active status filtering
        list_resp = self.client.get('/api/hrm/employees/?is_active=true')
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        results = list_resp.data.get('results', list_resp.data)
        self.assertTrue(any(e['id'] == str(self.employee.id) for e in results))
        self.assertFalse(any(e['id'] == str(self.inactive_emp.id) for e in results))
        # Guard from other tenant is strictly omitted
        self.assertFalse(any(e['id'] == str(self.guard.id) for e in results))

    # -------------------------------------------------------------------------
    # 3. Company Switching with Existing HR Tab
    # -------------------------------------------------------------------------
    def test_company_switching_with_existing_hr_tab(self):
        """Switching active company context updates config immediately and clears/refetches scoped records."""
        self.client.force_authenticate(user=self.sec_superadmin)

        # Step 1: Active in Security company
        sec_cfg = self.client.get('/api/platform/runtime-config/', HTTP_X_COMPANY_ID=str(self.security_company.id))
        self.assertEqual(sec_cfg.json()['company']['business_type'], 'security')
        sec_emps = self.client.get('/api/hrm/employees/', HTTP_X_COMPANY_ID=str(self.security_company.id))
        sec_ids = [e['id'] for e in sec_emps.data.get('results', sec_emps.data)]
        self.assertIn(str(self.guard.id), sec_ids)
        self.assertNotIn(str(self.employee.id), sec_ids)

        # Step 2: Switch to Universal company
        univ_cfg = self.client.get('/api/platform/runtime-config/', HTTP_X_COMPANY_ID=str(self.universal_company.id))
        self.assertEqual(univ_cfg.json()['company']['business_type'], 'retail')
        univ_emps = self.client.get('/api/hrm/employees/', HTTP_X_COMPANY_ID=str(self.universal_company.id))
        univ_ids = [e['id'] for e in univ_emps.data.get('results', univ_emps.data)]
        self.assertIn(str(self.employee.id), univ_ids)
        self.assertNotIn(str(self.guard.id), univ_ids)

    # -------------------------------------------------------------------------
    # 4. Unauthorized Security Action Rejections (5 Pillars)
    # -------------------------------------------------------------------------
    def test_rejection_pillar_capability(self):
        """Non-security company attempting security-only workforce actions is rejected (403)."""
        self.client.force_authenticate(user=self.univ_admin)
        resp = self.client.get(f'/api/hrm/employees/{self.employee.id}/deployments/')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('only available for security industry', resp.data['detail'])

        resp2 = self.client.post(f'/api/hrm/employees/{self.employee.id}/transfer/', {'new_site': '00000000-0000-0000-0000-000000000000'})
        self.assertEqual(resp2.status_code, status.HTTP_403_FORBIDDEN)

        resp3 = self.client.post(f'/api/hrm/employees/{self.employee.id}/relieve/', {'relieved_date': '2026-09-18'})
        self.assertEqual(resp3.status_code, status.HTTP_403_FORBIDDEN)

        resp4 = self.client.post(f'/api/hrm/employees/{self.employee.id}/resolve-jump/', {'outcome': 'REPLACED'})
        self.assertEqual(resp4.status_code, status.HTTP_403_FORBIDDEN)

    def test_rejection_pillar_company_module_disabled(self):
        """Security company with operations/security_ops disabled in CompanyModule is rejected (403)."""
        # Disable operations modules on security company
        CompanyModule.objects.filter(company=self.security_company, module__code__in=['operations', 'security_ops']).update(enabled=False)
        self.client.force_authenticate(user=self.sec_admin)

        resp = self.client.get(f'/api/hrm/employees/{self.guard.id}/deployments/')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('operations module is disabled', resp.data['detail'])

        # Restore for subsequent tests
        CompanyModule.objects.filter(company=self.security_company, module__code__in=['operations', 'security_ops']).update(enabled=True)

    def test_rejection_pillar_custom_user_module_access(self):
        """User in CUSTOM access mode without explicit grant to security operations is rejected (403)."""
        self.client.force_authenticate(user=self.sec_custom_user)
        resp = self.client.get(f'/api/hrm/employees/{self.guard.id}/deployments/')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('custom module access', resp.data['detail'])

    def test_rejection_pillar_rbac_permissions(self):
        """Staff user without manager/admin role or write permissions is rejected on state-mutating security actions."""
        self.client.force_authenticate(user=self.sec_staff)

        # GET deployments is permitted for staff (read)
        get_resp = self.client.get(f'/api/hrm/employees/{self.guard.id}/deployments/')
        self.assertEqual(get_resp.status_code, status.HTTP_200_OK)

        # POST relieve is rejected for staff (write requires admin/manager)
        post_resp = self.client.post(f'/api/hrm/employees/{self.guard.id}/relieve/', {'relieved_date': '2026-09-18'})
        self.assertEqual(post_resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('Insufficient permissions', post_resp.data['detail'])

    def test_rejection_pillar_tenant_isolation(self):
        """Cross-tenant workforce actions are strictly rejected (403)."""
        self.client.force_authenticate(user=self.univ_admin)
        # Attempting action on guard from another company
        resp = self.client.get(f'/api/hrm/employees/{self.guard.id}/deployments/')
        self.assertIn(resp.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])

    # -------------------------------------------------------------------------
    # 5. Existing Universal HR Regression
    # -------------------------------------------------------------------------
    def test_universal_hr_lifecycle_regression(self):
        """Universal lifecycle actions (promote, change-department, revise-salary, terminate) succeed for non-security companies."""
        self.client.force_authenticate(user=self.univ_admin)

        new_desig = Designation.objects.create(company=self.universal_company, name="Senior Sales Lead")
        new_dept = Department.objects.create(company=self.universal_company, name="Regional Marketing")

        # 1. Promote
        p_resp = self.client.post(f'/api/hrm/employees/{self.employee.id}/promote/', {
            'new_designation': str(new_desig.id),
            'effective_date': '2026-09-18',
            'reason': 'Merit promotion'
        })
        self.assertEqual(p_resp.status_code, status.HTTP_200_OK)
        self.employee.refresh_from_db()
        self.assertEqual(self.employee.designation_id, new_desig.id)

        # 2. Change Department
        d_resp = self.client.post(f'/api/hrm/employees/{self.employee.id}/change-department/', {
            'new_department': str(new_dept.id),
            'effective_date': '2026-09-18',
            'reason': 'Department realignment'
        })
        self.assertEqual(d_resp.status_code, status.HTTP_200_OK)
        self.employee.refresh_from_db()
        self.assertEqual(self.employee.department_id, new_dept.id)

        # 3. Revise Salary
        s_resp = self.client.post(f'/api/hrm/employees/{self.employee.id}/revise-salary/', {
            'base_salary': '65000.00',
            'effective_date': '2026-09-18',
            'reason': 'Annual appraisal'
        })
        self.assertEqual(s_resp.status_code, status.HTTP_200_OK)

        # 4. Terminate
        t_resp = self.client.post(f'/api/hrm/employees/{self.employee.id}/terminate/', {
            'effective_date': '2026-09-18',
            'reason': 'Mutual separation',
            'category': 'MUTUAL'
        })
        self.assertEqual(t_resp.status_code, status.HTTP_200_OK)
        self.employee.refresh_from_db()
        self.assertEqual(self.employee.employment_status, 'TERMINATED')
        self.assertFalse(self.employee.is_active)
