import json
from datetime import date, time, timedelta
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
User = get_user_model()
from crm.models import CRMEntity
from hrm.models import Employee, WorkforceAttendance, AttendanceStatus
from operations.models import (
    OperationalSite, ServiceContract, Deployment, DeploymentStatus,
    DutyAssignment, DutyAssignmentStatus, ExtraDuty, ExtraDutyStatus, ContractRate,
    Designation
)
from companies.models import Company
from platform_core.models import ModuleDefinition, CompanyModule
from billing.models import ExtraDutyPayrollBridge
from hrm.models import PayrollRun, PayrollPeriod

class S5BaseTest(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name='Test Security Co')
        self.company2 = Company.objects.create(name='Other Co')

        module, _ = ModuleDefinition.objects.get_or_create(code='security_ops', defaults={'name': 'Security Ops', 'is_active': True})
        CompanyModule.objects.get_or_create(company=self.company, module=module, defaults={'enabled': True})
        CompanyModule.objects.get_or_create(company=self.company2, module=module, defaults={'enabled': True})

        # Company 1
        self.admin = User.objects.create_user(username='admin_c1', email='admin1@test.com', password='password123', company=self.company)
        self.admin.role = 'admin'
        self.admin.save()

        self.employee1 = Employee.objects.create(
            company=self.company, first_name='John', last_name='Doe',
            employee_code='E001'
        )
        self.crm_entity = CRMEntity.objects.create(company=self.company, name='Test Client', entity_type='CUSTOMER')
        self.site1 = OperationalSite.objects.create(
            company=self.company, name='Main Gate', address='123 Main St', crm_entity=self.crm_entity
        )
        self.contract1 = ServiceContract.objects.create(
            company=self.company, contract_code='C001', start_date=date(2023, 1, 1), status='ACTIVE', crm_entity=self.crm_entity
        )
        self.contract1.sites.add(self.site1)

        self.designation = Designation.objects.create(company=self.company, name='Guard')
        self.deployment1 = Deployment.objects.create(
            company=self.company, employee=self.employee1, site=self.site1, designation=self.designation,
            start_date=date(2024, 1, 1), status=DeploymentStatus.ACTIVE
        )

        self.duty1 = DutyAssignment.objects.create(
            company=self.company, deployment=self.deployment1,
            employee=self.employee1, site=self.site1,
            date=date.today(), start_time=time(8, 0), end_time=time(16, 0),
            status=DutyAssignmentStatus.COMPLETED
        )

        # Company 2
        self.admin2 = User.objects.create_user(username='admin_c2', email='admin2@test.com', password='password123', company=self.company2)
        self.admin2.role = 'admin'
        self.admin2.save()

        self.employee2 = Employee.objects.create(
            company=self.company2, first_name='Jane', last_name='Doe',
            employee_code='E002'
        )
        self.crm_entity2 = CRMEntity.objects.create(company=self.company2, name='Other Client', entity_type='CUSTOMER')
        self.site2 = OperationalSite.objects.create(
            company=self.company2, name='Back Gate', address='456 Back St', crm_entity=self.crm_entity2
        )


class S5AttendanceTests(S5BaseTest):
    def test_valid_sync_and_idempotency(self):
        self.client.force_authenticate(user=self.admin)
        url = reverse('dutyassignment-sync-attendance', kwargs={'pk': self.duty1.id})
        
        # Sync 1
        response = self.client.post(url, HTTP_X_COMPANY_ID=str(self.company.id))
        self.assertIn(response.status_code, [status.HTTP_200_OK, status.HTTP_201_CREATED])
        self.assertEqual(WorkforceAttendance.objects.filter(company=self.company, employee=self.employee1).count(), 1)
        
        # Sync 2 (Idempotency)
        response = self.client.post(url, HTTP_X_COMPANY_ID=str(self.company.id))
        self.assertIn(response.status_code, [status.HTTP_200_OK, status.HTTP_201_CREATED])
        self.assertEqual(WorkforceAttendance.objects.filter(company=self.company, employee=self.employee1).count(), 1)

    def test_invalid_status_sync(self):
        self.client.force_authenticate(user=self.admin)
        self.duty1.status = DutyAssignmentStatus.SCHEDULED
        self.duty1.save()
        
        url = reverse('dutyassignment-sync-attendance', kwargs={'pk': self.duty1.id})
        response = self.client.post(url, HTTP_X_COMPANY_ID=str(self.company.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['created'], False)
        self.assertEqual(WorkforceAttendance.objects.filter(company=self.company, employee=self.employee1).count(), 0)

    def test_cross_tenant_sync(self):
        self.client.force_authenticate(user=self.admin2)
        url = reverse('dutyassignment-sync-attendance', kwargs={'pk': self.duty1.id})
        response = self.client.post(url, HTTP_X_COMPANY_ID=str(self.company2.id))
        self.assertIn(response.status_code, [status.HTTP_404_NOT_FOUND, status.HTTP_400_BAD_REQUEST])

    def test_attendance_list_tenant_isolation(self):
        WorkforceAttendance.objects.create(
            company=self.company, employee=self.employee1, date=date.today(), status=AttendanceStatus.PRESENT
        )
        WorkforceAttendance.objects.create(
            company=self.company2, employee=self.employee2, date=date.today(), status=AttendanceStatus.PRESENT
        )
        
        self.client.force_authenticate(user=self.admin)
        url = reverse('attendance-list')
        response = self.client.get(url, HTTP_X_COMPANY_ID=str(self.company.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        data = response.data.get('results', response.data) if isinstance(response.data, dict) else response.data
        self.assertEqual(len(data), 1)
        self.assertEqual(str(data[0]['employee']), str(self.employee1.id))

    def test_attendance_filters(self):
        WorkforceAttendance.objects.create(
            company=self.company, employee=self.employee1, date=date.today(), status=AttendanceStatus.PRESENT
        )
        self.client.force_authenticate(user=self.admin)
        url = reverse('attendance-list')
        
        # Test Date Filter
        response = self.client.get(url, {'date': date.today().isoformat()}, HTTP_X_COMPANY_ID=str(self.company.id))
        data = response.data.get('results', response.data) if isinstance(response.data, dict) else response.data
        self.assertEqual(len(data), 1)
        
        response = self.client.get(url, {'date': (date.today() - timedelta(days=1)).isoformat()}, HTTP_X_COMPANY_ID=str(self.company.id))
        data = response.data.get('results', response.data) if isinstance(response.data, dict) else response.data
        self.assertEqual(len(data), 0)
        
        # Test Employee Filter
        response = self.client.get(url, {'employee': str(self.employee1.id)}, HTTP_X_COMPANY_ID=str(self.company.id))
        data = response.data.get('results', response.data) if isinstance(response.data, dict) else response.data
        self.assertEqual(len(data), 1)


class S5ExtraDutyTests(S5BaseTest):
    def setUp(self):
        super().setUp()
        self.payroll_period = PayrollPeriod.objects.create(
            company=self.company, name="Test Period", start_date=date(2024,1,1), end_date=date(2024,1,31), status='ACTIVE', payment_date=date(2024,2,1)
        )
        self.payroll_run = PayrollRun.objects.create(
            company=self.company, payroll_period=self.payroll_period, status='DRAFT'
        )

    def test_create_extra_duty(self):
        self.client.force_authenticate(user=self.admin)
        url = reverse('extraduty-list')
        data = {
            'employee': str(self.employee1.id),
            'site': str(self.site1.id),
            'date': date.today().isoformat(),
            'hours': '4.00'
        }
        response = self.client.post(url, data, format='json', HTTP_X_COMPANY_ID=str(self.company.id))
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ExtraDuty.objects.count(), 1)

    def test_update_while_editable(self):
        ed = ExtraDuty.objects.create(
            company=self.company, employee=self.employee1, site=self.site1, date=date.today(), hours=4.0
        )
        self.client.force_authenticate(user=self.admin)
        url = reverse('extraduty-detail', kwargs={'pk': ed.id})
        data = {'hours': '5.00'}
        response = self.client.patch(url, data, format='json', HTTP_X_COMPANY_ID=str(self.company.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ed.refresh_from_db()
        self.assertEqual(ed.hours, 5.0)

    def test_cross_tenant_employee_site(self):
        self.client.force_authenticate(user=self.admin)
        url = reverse('extraduty-list')
        data = {
            'employee': str(self.employee2.id), # Cross tenant employee
            'site': str(self.site1.id),
            'date': date.today().isoformat(),
            'hours': '4.00'
        }
        response = self.client.post(url, data, format='json', HTTP_X_COMPANY_ID=str(self.company.id))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_approval_workflow_and_payroll(self):
        # Create Contract Rate for Payroll Bridge
        ContractRate.objects.create(
            company=self.company, service_contract=self.contract1, designation=self.designation, billing_rate=15, pay_rate=10, effective_date=date(2023,1,1)
        )

        ed = ExtraDuty.objects.create(
            company=self.company, employee=self.employee1, site=self.site1, service_contract=self.contract1, date=date.today(), hours=4.0, status=ExtraDutyStatus.REQUESTED
        )
        self.client.force_authenticate(user=self.admin)

        # Process Payroll before Approval (Should Fail)
        url_process = reverse('extraduty-process-payroll', kwargs={'pk': ed.id})
        res = self.client.post(url_process, {'payroll_run_id': str(self.payroll_run.id)}, format='json', HTTP_X_COMPANY_ID=str(self.company.id))
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        # Approve
        url_approve = reverse('extraduty-approve', kwargs={'pk': ed.id})
        res = self.client.post(url_approve, HTTP_X_COMPANY_ID=str(self.company.id))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ed.refresh_from_db()
        self.assertEqual(ed.status, ExtraDutyStatus.APPROVED)

        # Process Payroll (Should Succeed)
        res = self.client.post(url_process, {'payroll_run_id': str(self.payroll_run.id)}, format='json', HTTP_X_COMPANY_ID=str(self.company.id))
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ExtraDutyPayrollBridge.objects.count(), 1)
        
        # Idempotency Test
        res = self.client.post(url_process, {'payroll_run_id': str(self.payroll_run.id)}, format='json', HTTP_X_COMPANY_ID=str(self.company.id))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['created'], False)
        self.assertEqual(ExtraDutyPayrollBridge.objects.count(), 1)
