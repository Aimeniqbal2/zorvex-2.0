import json
from rest_framework.test import APITestCase
from django.urls import reverse
from rest_framework import status
from datetime import date, time, timedelta
from accounts.models import User
from companies.models import Company
from crm.models import CRMEntity
from hrm.models import Designation, Employee, OvertimeRecord, PayrollRun
from operations.models import (
    OperationalSite, ServiceContract, 
    Deployment, DeploymentStatus,
    DutyAssignment, DutyAssignmentStatus,
    ExtraDuty, ExtraDutyStatus
)

class Phase8BOperationsTests(APITestCase):
    def setUp(self):
        # Company A
        self.company_a = Company.objects.create(name="Company A", is_active=True)
        
        # Modules
        from platform_core.models import ModuleDefinition, CompanyModule
        mod, _ = ModuleDefinition.objects.get_or_create(code='security_ops', name='Security')
        CompanyModule.objects.get_or_create(company=self.company_a, module=mod, defaults={'enabled': True})

        self.user_a = User.objects.create_user(
            username="user_a", password="testpassword123", company=self.company_a, role='admin'
        )
        
        # Company B
        self.company_b = Company.objects.create(name="Company B", is_active=True)
        CompanyModule.objects.get_or_create(company=self.company_b, module=mod, defaults={'enabled': True})

        self.user_b = User.objects.create_user(
            username="user_b", password="testpassword123", company=self.company_b, role='admin'
        )

        # Company A resources
        self.crm_entity_a = CRMEntity.objects.create(
            company=self.company_a, name="Client A", code="C-001", entity_type="CUSTOMER"
        )
        self.designation_a = Designation.objects.create(
            company=self.company_a, name="Security Guard A", code="SGA-001"
        )
        # Create Employee using CRMEntity trick
        crm_emp_a = CRMEntity.objects.create(
            company=self.company_a, name="Emp A", code="EMP-001", entity_type="EMPLOYEE"
        )
        self.employee_a = Employee.objects.create(
            company=self.company_a, crm_entity=crm_emp_a, user=self.user_a, employee_code="E001"
        )
        
        self.site_a = OperationalSite.objects.create(
            company=self.company_a, crm_entity=self.crm_entity_a, name="Site A", address="123 A St"
        )
        self.contract_a = ServiceContract.objects.create(
            company=self.company_a, crm_entity=self.crm_entity_a,
            contract_code="SC-A-001", start_date="2026-01-01", end_date="2026-12-31"
        )
        self.contract_a.sites.add(self.site_a)

        # Company B resources
        self.crm_entity_b = CRMEntity.objects.create(
            company=self.company_b, name="Client B", code="C-002", entity_type="CUSTOMER"
        )
        self.designation_b = Designation.objects.create(
            company=self.company_b, name="Security Guard B", code="SGB-001"
        )
        crm_emp_b = CRMEntity.objects.create(
            company=self.company_b, name="Emp B", code="EMP-002", entity_type="EMPLOYEE"
        )
        self.employee_b = Employee.objects.create(
            company=self.company_b, crm_entity=crm_emp_b, user=self.user_b, employee_code="E002"
        )
        self.site_b = OperationalSite.objects.create(
            company=self.company_b, crm_entity=self.crm_entity_b, name="Site B", address="123 B St"
        )
        self.contract_b = ServiceContract.objects.create(
            company=self.company_b, crm_entity=self.crm_entity_b,
            contract_code="SC-B-001", start_date="2026-01-01", end_date="2026-12-31"
        )
        self.contract_b.sites.add(self.site_b)

    # --- DEPLOYMENT TESTS ---

    def test_successful_deployment(self):
        self.client.force_authenticate(user=self.user_a)
        data = {
            "employee": self.employee_a.id,
            "site": self.site_a.id,
            "service_contract": self.contract_a.id,
            "designation": self.designation_a.id,
            "start_date": "2026-08-01",
            "end_date": "2026-08-31",
            "status": "DRAFT"
        }
        response = self.client.post(reverse('deployment-list'), data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Deployment.objects.count(), 1)

    def test_cross_tenant_employee_site_rejection(self):
        self.client.force_authenticate(user=self.user_a)
        data = {
            "employee": self.employee_b.id,  # from company B
            "site": self.site_a.id,
            "designation": self.designation_a.id,
            "start_date": "2026-08-01",
        }
        response = self.client.post(reverse('deployment-list'), data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        
        data["employee"] = self.employee_a.id
        data["site"] = self.site_b.id # from company B
        response = self.client.post(reverse('deployment-list'), data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cross_tenant_designation_rejection(self):
        self.client.force_authenticate(user=self.user_a)
        data = {
            "employee": self.employee_a.id,
            "site": self.site_a.id,
            "designation": self.designation_b.id,
            "start_date": "2026-08-01",
        }
        response = self.client.post(reverse('deployment-list'), data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invalid_service_contract(self):
        self.client.force_authenticate(user=self.user_a)
        site_a2 = OperationalSite.objects.create(
            company=self.company_a, crm_entity=self.crm_entity_a, name="Site A2", address="123 A2 St"
        )
        data = {
            "employee": self.employee_a.id,
            "site": site_a2.id,
            "service_contract": self.contract_a.id, # does not cover site A2
            "designation": self.designation_a.id,
            "start_date": "2026-08-01",
        }
        response = self.client.post(reverse('deployment-list'), data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_deployment_date_validation(self):
        self.client.force_authenticate(user=self.user_a)
        data = {
            "employee": self.employee_a.id,
            "site": self.site_a.id,
            "designation": self.designation_a.id,
            "start_date": "2026-08-31",
            "end_date": "2026-08-01", # invalid
        }
        response = self.client.post(reverse('deployment-list'), data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_deployment_active_immutability(self):
        dep = Deployment.objects.create(
            company=self.company_a, employee=self.employee_a, site=self.site_a,
            designation=self.designation_a, start_date="2026-08-01", status=DeploymentStatus.ACTIVE
        )
        self.client.force_authenticate(user=self.user_a)
        
        emp2 = Employee.objects.create(
            company=self.company_a, crm_entity=self.crm_entity_a, employee_code="E001-2"
        )
        
        data = {
            "employee": emp2.id,
            "site": self.site_a.id,
            "designation": self.designation_a.id,
            "start_date": "2026-08-01",
        }
        response = self.client.put(reverse('deployment-detail', args=[dep.id]), data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # --- DUTY ASSIGNMENT TESTS ---
    
    def setUp_duty(self):
        self.dep = Deployment.objects.create(
            company=self.company_a, employee=self.employee_a, site=self.site_a,
            designation=self.designation_a, start_date="2026-08-01", end_date="2026-08-31",
            status=DeploymentStatus.ACTIVE
        )

    def test_successful_duty_assignment(self):
        self.setUp_duty()
        self.client.force_authenticate(user=self.user_a)
        data = {
            "deployment": self.dep.id,
            "employee": self.employee_a.id,
            "site": self.site_a.id,
            "date": date(2026, 8, 15),
            "start_time": "09:00:00",
            "end_time": "17:00:00"
        }
        response = self.client.post(reverse('dutyassignment-list'), data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(DutyAssignment.objects.count(), 1)

    def test_duty_deployment_mismatch(self):
        self.setUp_duty()
        self.client.force_authenticate(user=self.user_a)
        emp2 = Employee.objects.create(
            company=self.company_a, crm_entity=self.crm_entity_a, employee_code="E001-2"
        )
        data = {
            "deployment": self.dep.id,
            "employee": emp2.id, # Mismatch
            "site": self.site_a.id,
            "date": date(2026, 8, 15),
            "start_time": "09:00:00",
            "end_time": "17:00:00"
        }
        response = self.client.post(reverse('dutyassignment-list'), data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_duty_outside_deployment_dates(self):
        self.setUp_duty()
        self.client.force_authenticate(user=self.user_a)
        data = {
            "deployment": self.dep.id,
            "employee": self.employee_a.id,
            "site": self.site_a.id,
            "date": "2026-09-05", # outside
            "start_time": "09:00:00",
            "end_time": "17:00:00"
        }
        response = self.client.post(reverse('dutyassignment-list'), data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_overlapping_duty_rejection(self):
        self.setUp_duty()
        DutyAssignment.objects.create(
            company=self.company_a, deployment=self.dep, employee=self.employee_a, site=self.site_a,
            date=date(2026, 8, 15), start_time="09:00:00", end_time="17:00:00"
        )
        
        self.client.force_authenticate(user=self.user_a)
        data = {
            "deployment": self.dep.id,
            "employee": self.employee_a.id,
            "site": self.site_a.id,
            "date": date(2026, 8, 15),
            "start_time": "13:00:00",
            "end_time": "18:00:00" # overlaps
        }
        response = self.client.post(reverse('dutyassignment-list'), data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        
    def test_touching_shifts_allowed(self):
        self.setUp_duty()
        DutyAssignment.objects.create(
            company=self.company_a, deployment=self.dep, employee=self.employee_a, site=self.site_a,
            date=date(2026, 8, 15), start_time="09:00:00", end_time="13:00:00"
        )
        
        self.client.force_authenticate(user=self.user_a)
        data = {
            "deployment": self.dep.id,
            "employee": self.employee_a.id,
            "site": self.site_a.id,
            "date": date(2026, 8, 15),
            "start_time": "13:00:00",
            "end_time": "17:00:00" # touches but no overlap
        }
        response = self.client.post(reverse('dutyassignment-list'), data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
    def test_completed_duty_immutability(self):
        self.setUp_duty()
        duty = DutyAssignment.objects.create(
            company=self.company_a, deployment=self.dep, employee=self.employee_a, site=self.site_a,
            date=date(2026, 8, 15), start_time="09:00:00", end_time="13:00:00", status=DutyAssignmentStatus.COMPLETED
        )
        self.client.force_authenticate(user=self.user_a)
        data = {
            "deployment": self.dep.id,
            "employee": self.employee_a.id,
            "site": self.site_a.id,
            "date": "2026-08-16", # change date
            "start_time": "09:00:00",
            "end_time": "13:00:00",
            "status": "COMPLETED"
        }
        response = self.client.put(reverse('dutyassignment-detail', args=[duty.id]), data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # --- EXTRA DUTY TESTS ---
    
    def test_successful_extra_duty(self):
        self.client.force_authenticate(user=self.user_a)
        data = {
            "employee": self.employee_a.id,
            "site": self.site_a.id,
            "date": "2026-08-20",
            "hours": "4.5",
            "description": "VIP Cover"
        }
        response = self.client.post(reverse('extraduty-list'), data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ExtraDuty.objects.count(), 1)
        
    def test_invalid_hours(self):
        self.client.force_authenticate(user=self.user_a)
        data = {
            "employee": self.employee_a.id,
            "date": "2026-08-20",
            "hours": "-1.0"
        }
        response = self.client.post(reverse('extraduty-list'), data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        
    def test_approved_extra_duty_immutability(self):
        ed = ExtraDuty.objects.create(
            company=self.company_a, employee=self.employee_a, date="2026-08-20", hours=4,
            status=ExtraDutyStatus.APPROVED
        )
        self.client.force_authenticate(user=self.user_a)
        data = {
            "employee": self.employee_a.id,
            "date": "2026-08-20",
            "hours": "5.0", # changed hours
            "status": "APPROVED"
        }
        response = self.client.put(reverse('extraduty-detail', args=[ed.id]), data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_tenant_safe_approved_by(self):
        self.client.force_authenticate(user=self.user_a)
        data = {
            "employee": self.employee_a.id,
            "date": "2026-08-20",
            "hours": "4.0",
            "approved_by": self.user_b.id # User from Company B
        }
        response = self.client.post(reverse('extraduty-list'), data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_extra_duty_does_not_modify_overtime(self):
        self.client.force_authenticate(user=self.user_a)
        data = {
            "employee": self.employee_a.id,
            "date": "2026-08-20",
            "hours": "4.5"
        }
        self.client.post(reverse('extraduty-list'), data)
        # Ensure it does not create an OvertimeRecord
        self.assertEqual(OvertimeRecord.objects.count(), 0)
        
    def test_extra_duty_does_not_modify_payroll(self):
        self.client.force_authenticate(user=self.user_a)
        data = {
            "employee": self.employee_a.id,
            "date": "2026-08-20",
            "hours": "4.5"
        }
        self.client.post(reverse('extraduty-list'), data)
        self.assertEqual(PayrollRun.objects.count(), 0)

    # --- API SECURITY TESTS ---
    
    def test_unauthenticated_access(self):
        response = self.client.get(reverse('deployment-list'))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
