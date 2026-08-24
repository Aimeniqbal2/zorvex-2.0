from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.utils import timezone
from datetime import timedelta
import io

from django.contrib.auth import get_user_model
User = get_user_model()
from crm.models import CRMEntity
from hrm.models import Employee, Designation
from platform_core.models import Warehouse, ModuleDefinition, CompanyModule
from companies.models import Company
from operations.models import (
    OperationalSite, DutyAssignment, Deployment, IncidentReport, 
    DailyActivityReport, DailyActivityEntry, IncidentAttachment
)

def make_company_with_modules(company_name, modules):
    company = Company.objects.create(name=company_name)
    for mod_code in modules:
        module, _ = ModuleDefinition.objects.get_or_create(code=mod_code, defaults={'name': mod_code.title()})
        CompanyModule.objects.create(company=company, module=module, enabled=True)
    return company

class SecurityOperationsS7Tests(APITestCase):
    def setUp(self):
        self.company = make_company_with_modules('Company A', ['security_ops', 'hrm', 'crm'])
        self.company_b = make_company_with_modules('Company B', ['security_ops', 'hrm', 'crm'])
        
        self.user = User.objects.create_user(username='usera', password='pw', company=self.company, role='manager')
        self.user_b = User.objects.create_user(username='userb', password='pw', company=self.company_b, role='manager')
        
        # Setup Company A resources
        self.crm_entity = CRMEntity.objects.create(company=self.company, name="Client A", entity_type="CUSTOMER")
        self.site = OperationalSite.objects.create(
            company=self.company,
            crm_entity=self.crm_entity,
            name="Main Gate - Company A"
        )
        self.employee = Employee.objects.create(company=self.company, user=self.user, first_name="A", last_name="A", is_active=True)
        self.designation = Designation.objects.create(company=self.company, name="Guard")
        
        self.deployment = Deployment.objects.create(
            company=self.company,
            employee=self.employee,
            site=self.site,
            designation=self.designation,
            start_date=timezone.now().date(),
            status='ACTIVE'
        )
        self.duty = DutyAssignment.objects.create(
            company=self.company,
            deployment=self.deployment,
            employee=self.employee,
            site=self.site,
            date=timezone.now().date(),
            start_time='09:00',
            end_time='17:00'
        )
        
        # Setup Company B resources
        self.crm_entity_b = CRMEntity.objects.create(company=self.company_b, name="Client B", entity_type="CUSTOMER")
        self.site_b = OperationalSite.objects.create(
            company=self.company_b,
            crm_entity=self.crm_entity_b,
            name="Main Gate - Company B"
        )
        self.employee_b = Employee.objects.create(company=self.company_b, user=self.user_b, first_name="B", last_name="B", is_active=True)
        
        self.client.force_authenticate(user=self.user)

    def test_incident_create_and_lifecycle(self):
        url = reverse('incident-list')
        data = {
            'site': self.site.id,
            'reported_by': self.employee.id,
            'duty_assignment': self.duty.id,
            'incident_type': 'SECURITY_BREACH',
            'severity': 'HIGH',
            'occurred_at': timezone.now().isoformat(),
            'title': 'Test Incident',
            'description': 'Someone broke in.',
            'action_taken': 'Called police.'
        }
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('INC-', response.data['incident_number'])
        self.assertEqual(response.data['status'], 'OPEN')
        
        incident_id = response.data['id']
        
        review_url = reverse('incident-review-incident', args=[incident_id])
        review_data = {
            'status': 'RESOLVED',
            'resolution': 'Police arrived and handled it.'
        }
        response = self.client.post(review_url, review_data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'RESOLVED')
        self.assertEqual(response.data['resolution'], 'Police arrived and handled it.')
        self.assertIsNotNone(response.data['reviewed_by'])

    def test_incident_cross_tenant_rejection(self):
        url = reverse('incident-list')
        data = {
            'site': self.site_b.id,
            'reported_by': self.employee.id,
            'incident_type': 'SECURITY_BREACH',
            'severity': 'HIGH',
            'occurred_at': timezone.now().isoformat(),
            'title': 'Test Incident',
            'description': 'Someone broke in.'
        }
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_daily_activity_report_create_and_entries(self):
        url = reverse('daily-activity-report-list')
        dar_data = {
            'site': self.site.id,
            'report_date': timezone.now().date().isoformat(),
            'duty_assignment': self.duty.id,
            'prepared_by': self.employee.id,
            'shift_start': timezone.now().isoformat(),
            'shift_end': (timezone.now() + timedelta(hours=8)).isoformat(),
            'summary': 'Normal shift'
        }
        response = self.client.post(url, dar_data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        dar_id = response.data['id']
        
        entries_url = reverse('activity-entry-list')
        entry_data = {
            'report': dar_id,
            'timestamp': timezone.now().isoformat(),
            'activity_type': 'PATROL',
            'description': 'Patrolled north gate.',
            'recorded_by': self.employee.id
        }
        response = self.client.post(entries_url, entry_data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        response = self.client.get(reverse('daily-activity-report-detail', args=[dar_id]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['entries']), 1)
        self.assertEqual(response.data['entries'][0]['activity_type'], 'PATROL')

    def test_incident_attachment_upload(self):
        incident = IncidentReport.objects.create(
            company=self.company,
            site=self.site,
            reported_by=self.employee,
            incident_type='SECURITY_BREACH',
            severity='HIGH',
            occurred_at=timezone.now(),
            title='Test',
            description='Test'
        )
        url = reverse('incident-attachment-list')
        
        file = io.StringIO("test content")
        file.name = "test.txt"
        
        data = {
            'incident': incident.id,
            'file': file,
            'description': 'A test file'
        }
        response = self.client.post(url, data, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        attachment_id = response.data['id']
        
        download_url = reverse('incident-attachment-download', args=[attachment_id])
        response = self.client.get(download_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.client.force_authenticate(user=self.user_b)
        response = self.client.get(download_url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
