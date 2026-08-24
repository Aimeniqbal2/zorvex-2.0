from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from companies.models import Company
from inventory.models import Product
from platform_core.models import ModuleDefinition, CompanyModule
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()

class SuperadminIsolationTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Create Companies
        self.company_a = Company.objects.create(name="Company A", domain="companya")
        self.company_b = Company.objects.create(name="Company B", domain="companyb")
        self.company_c = Company.objects.create(name="Company C", domain="companyc")

        # Create Module and Enable it
        inv_mod = ModuleDefinition.objects.create(name="Inventory", code="inventory", category="operations", is_active=True)
        CompanyModule.objects.create(company=self.company_a, module=inv_mod, enabled=True)
        CompanyModule.objects.create(company=self.company_b, module=inv_mod, enabled=True)

        from subscriptions.models import CompanySubscription, SubscriptionPlan
        from datetime import date, timedelta
        plan = SubscriptionPlan.objects.create(name="Pro", price=100.0)
        today = date.today()
        CompanySubscription.objects.create(company=self.company_a, plan=plan, start_date=today, end_date=today + timedelta(days=30), is_active=True)
        CompanySubscription.objects.create(company=self.company_b, plan=plan, start_date=today, end_date=today + timedelta(days=30), is_active=True)

        # Create Users
        self.superadmin = User.objects.create(
            username="super@zorvex.com", email="super@zorvex.com", role="super_admin", is_superuser=True
        )
        self.superadmin.set_password("password")
        self.superadmin.save()

        self.user_a = User.objects.create(
            username="user_a@zorvex.com", email="user_a@zorvex.com", company=self.company_a, role="admin"
        )
        self.user_b = User.objects.create(
            username="user_b@zorvex.com", email="user_b@zorvex.com", company=self.company_b, role="staff"
        )
        self.user_c = User.objects.create(
            username="user_c@zorvex.com", email="user_c@zorvex.com", company=self.company_c, role="manager"
        )

        # Generate tokens
        self.token_super = str(RefreshToken.for_user(self.superadmin).access_token)
        self.token_a = str(RefreshToken.for_user(self.user_a).access_token)
        self.token_b = str(RefreshToken.for_user(self.user_b).access_token)

        # Create Products
        self.product_a1 = Product.objects.create(
            company=self.company_a, brand="Brand A", model_name="A1"
        )
        self.product_b1 = Product.objects.create(
            company=self.company_b, brand="Brand B", model_name="B1"
        )
        self.product_c1 = Product.objects.create(
            company=self.company_c, brand="Brand C", model_name="C1"
        )

    def test_superadmin_no_context_returns_400(self):
        """Superadmin without company context must get 400 Validation Error on tenant endpoints."""
        response = self.client.get('/api/inventory/products/', HTTP_AUTHORIZATION=f'Bearer {self.token_super}')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Company context is required", response.data['detail'])

    def test_superadmin_with_company_a_context(self):
        """Superadmin with Company A context gets only A1."""
        response = self.client.get('/api/inventory/products/', HTTP_AUTHORIZATION=f'Bearer {self.token_super}', HTTP_X_COMPANY_ID=str(self.company_a.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        results = response.data if isinstance(response.data, list) else response.data.get('results')
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['model_name'], "A1")

    def test_superadmin_with_company_b_context(self):
        """Superadmin with Company B context gets only B1."""
        response = self.client.get('/api/inventory/products/', HTTP_AUTHORIZATION=f'Bearer {self.token_super}', HTTP_X_COMPANY_ID=str(self.company_b.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        results = response.data if isinstance(response.data, list) else response.data.get('results')
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['model_name'], "B1")

    def test_normal_user_a_cannot_access_b_context(self):
        """Normal user A attempting X-Company-ID for B must remain Company A."""
        response = self.client.get('/api/inventory/products/', HTTP_AUTHORIZATION=f'Bearer {self.token_a}', HTTP_X_COMPANY_ID=str(self.company_b.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        results = response.data if isinstance(response.data, list) else response.data.get('results')
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['model_name'], "A1")

    def test_normal_user_b_cannot_access_a_context(self):
        """Normal user B attempting X-Company-ID for A must remain Company B."""
        response = self.client.get('/api/inventory/products/', HTTP_AUTHORIZATION=f'Bearer {self.token_b}', HTTP_X_COMPANY_ID=str(self.company_a.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        results = response.data if isinstance(response.data, list) else response.data.get('results')
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['model_name'], "B1")
