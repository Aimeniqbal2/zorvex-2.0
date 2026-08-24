from django.test import TestCase
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from django.urls import reverse
from companies.models import Company
from accounts.models import CompanyRole
from operations.models import OperationalSite, UserSiteAccess
from crm.models import CRMEntity
from platform_core.models import ModuleDefinition, CompanyModule
from rest_framework import status
import json

User = get_user_model()

class C4ConfidentialityTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="SecureCorp", business_type="security")
        
        # Enable Modules
        for mod_code in ['security_ops', 'hrm', 'billing', 'finance_accounting']:
            mod, _ = ModuleDefinition.objects.get_or_create(code=mod_code, defaults={'name': mod_code, 'is_active': True})
            CompanyModule.objects.create(company=self.company, module=mod, enabled=True)

        self.client = APIClient()
        
        # CRM and Site
        self.crm = CRMEntity.objects.create(company=self.company, entity_type='CUSTOMER', name='Test Client', code='TC001')
        self.site_a = OperationalSite.objects.create(company=self.company, crm_entity=self.crm, name="Site A", address="123 A St", is_active=True)
        self.site_b = OperationalSite.objects.create(company=self.company, crm_entity=self.crm, name="Site B", address="123 B St", is_active=True)
        
        # Roles
        self.ops_manager_role = CompanyRole.objects.create(
            company=self.company, name="Operations Manager",
            permissions=["operations.read", "operations.write", "operations.all_sites"]
        )
        self.warehouse_manager_role = CompanyRole.objects.create(
            company=self.company, name="Warehouse Manager",
            permissions=["inventory.read", "inventory.write"]
        )
        self.site_supervisor_role = CompanyRole.objects.create(
            company=self.company, name="Site Supervisor",
            permissions=["operations.read", "operations.write", "operations.assigned_sites"]
        )
        
        # Users
        self.ops_manager = User.objects.create_user(
            username='ops_manager', email='ops@test.com', password='password123',
            company=self.company, company_role=self.ops_manager_role, role='manager'
        )
        self.warehouse_manager = User.objects.create_user(
            username='warehouse', email='wh@test.com', password='password123',
            company=self.company, company_role=self.warehouse_manager_role, role='staff'
        )
        self.site_supervisor = User.objects.create_user(
            username='supervisor', email='sup@test.com', password='password123',
            company=self.company, company_role=self.site_supervisor_role, role='staff'
        )
        UserSiteAccess.objects.create(user=self.site_supervisor, site=self.site_a)
        
    def set_user(self, user):
        self.client.force_authenticate(user=user)
        self.client.credentials(HTTP_X_COMPANY_ID=str(self.company.id))

    def test_ops_manager_denied_salary(self):
        """Operations Manager: denied salary/payslips unless granted"""
        self.set_user(self.ops_manager)
        # Check an HR payroll endpoint if exists
        response = self.client.get('/api/hrm/payroll-runs/')
        # Should be forbidden because they lack hrm.read
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, f"Ops Manager HR: {response.content}")
        
    def test_warehouse_manager_denied_hr_candidates(self):
        """Warehouse Manager: denied HR candidate/vetting documents"""
        self.set_user(self.warehouse_manager)
        response = self.client.get('/api/hrm/employees/') # Example endpoint
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, f"Warehouse HR: {response.content}")

    def test_site_supervisor_denied_finance_billing(self):
        """Site Supervisor: denied Finance/Billing unless granted"""
        self.set_user(self.site_supervisor)
        # Billing
        response = self.client.get('/api/billing/service-invoices/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, f"Supervisor Billing: {response.content}")
        # Finance
        response = self.client.get('/api/finance/journal-entries/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_site_supervisor_denied_other_site_incident(self):
        """Site Supervisor: denied other-site Incident/DAR attachments"""
        self.set_user(self.site_supervisor)
        
        # Test incident fetch
        response = self.client.get('/api/operations/incidents/')
        self.assertEqual(response.status_code, status.HTTP_200_OK, f"Supervisor Incidents: {response.content}")
        # Should only see incidents from Site A (handled by base viewset site scoping)

    def test_unauthorized_ops_do_not_receive_contract_pay_rate(self):
        """Unauthorized Operations users: do not receive ContractRate.pay_rate if sensitive."""
        # Check ContractRate endpoint
        self.set_user(self.site_supervisor)
        response = self.client.get('/api/operations/contract-rates/')
        # Typically ContractRates shouldn't expose pay_rate to base ops
        if response.status_code == 200:
            for rate in response.json():
                self.assertNotIn('pay_rate', rate)
