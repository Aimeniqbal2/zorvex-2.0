from django.test import TestCase
from django.urls import reverse
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from companies.models import Company
from platform_core.models import ModuleDefinition, CompanyModule

User = get_user_model()

class TestDashboardRefactoringPhase8FA(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.company = Company.objects.create(name='Test Company', max_users=10)
        
        reports_mod, _ = ModuleDefinition.objects.get_or_create(code='reports', name='Reports', is_active=True)
        CompanyModule.objects.create(company=self.company, module=reports_mod)

        self.admin_user = User.objects.create_user(
            username='admin_test',
            password='password123',
            company=self.company,
            role='admin'
        )

        self.employee_user = User.objects.create_user(
            username='emp_test',
            password='password123',
            company=self.company,
            role='employee'
        )

    def test_dashboard_unauthenticated(self):
        url = reverse('api-dashboard')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 401)

    def test_dashboard_authenticated(self):
        self.client.force_authenticate(user=self.admin_user)
        url = reverse('api-dashboard')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        
        # Check that it returns expected structure
        self.assertIn('total_revenue', data)
        self.assertIn('total_expenses', data)
        self.assertIn('net_profit', data)
        self.assertIn('active_repairs', data)
        self.assertIn('low_stock_items', data)
        self.assertIn('kpi_changes', data)
        self.assertIn('revenue_trends', data)
        self.assertIn('repair_stats', data)
        self.assertIn('recent_sales', data)

    def test_dashboard_tenant_isolation(self):
        self.client.force_authenticate(user=self.admin_user)
        url = reverse('api-dashboard')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn('total_revenue', data)

    def test_dashboard_rbac_financial_hiding(self):
        self.client.force_authenticate(user=self.employee_user)
        url = reverse('api-dashboard')
        
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        
        # Finance metrics should be zeroed out
        self.assertEqual(data['total_revenue'], 0.0)
        self.assertEqual(data['total_expenses'], 0.0)
        self.assertEqual(data['net_profit'], 0.0)
