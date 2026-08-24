from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from companies.models import Company
from reports.models import GeneratedReport
from platform_core.models import ModuleDefinition, CompanyModule
from django.contrib.auth import get_user_model
from unittest.mock import patch
from django.utils import timezone
from datetime import timedelta
import tempfile
import os

User = get_user_model()

class TestPhase8FC2(TestCase):
    def setUp(self):
        self.company_a = Company.objects.create(name="Company A", address="123", tax_id="T1")
        self.admin_a = User.objects.create_user(username='admin_a', password='password123', company=self.company_a, role='admin')
        self.employee_a = User.objects.create_user(username='employee_a', password='password123', company=self.company_a, role='employee')
        
        self.company_b = Company.objects.create(name="Company B")
        self.admin_b = User.objects.create_user(username='admin_b', password='password123', company=self.company_b, role='admin')
        
        reports_mod, _ = ModuleDefinition.objects.get_or_create(code='reports', defaults={'name': 'Reports', 'is_active': True})
        CompanyModule.objects.create(company=self.company_a, module=reports_mod, enabled=True)
        CompanyModule.objects.create(company=self.company_b, module=reports_mod, enabled=True)
        
        self.client_a = APIClient()
        self.client_a.force_authenticate(user=self.admin_a)
        
        self.client_a_emp = APIClient()
        self.client_a_emp.force_authenticate(user=self.employee_a)
        
        self.client_b = APIClient()
        self.client_b.force_authenticate(user=self.admin_b)
        
        self.create_url = reverse('api-report-generated-create')

    @patch('reports.tasks.generate_pdf_report.delay')
    def test_01_create_job(self, mock_delay):
        mock_delay.return_value.id = "mock-task-id"
        res = self.client_a.post(self.create_url, {
            "report_type": "profit_and_loss",
            "parameters": {"start_date": "2025-01-01", "end_date": "2025-12-31"}
        }, format='json')
        self.assertEqual(res.status_code, 202)
        self.assertEqual(res.data['status'], GeneratedReport.Status.PENDING)
        self.assertEqual(res.data['task_id'], "mock-task-id")
        
        report = GeneratedReport.objects.get(id=res.data['id'])
        self.assertEqual(report.company_id, self.company_a.id)

    def test_02_create_invalid_report_type(self):
        res = self.client_a.post(self.create_url, {"report_type": "non_existent"}, format='json')
        self.assertEqual(res.status_code, 400)
        
    def test_03_create_rbac(self):
        # Employee shouldn't be able to generate financial report
        res = self.client_a_emp.post(self.create_url, {"report_type": "profit_and_loss"}, format='json')
        self.assertEqual(res.status_code, 403)

    def test_04_status_tenant_isolation(self):
        report = GeneratedReport.objects.create(
            company_id=self.company_a.id, created_by=self.admin_a,
            report_type="dashboard", status=GeneratedReport.Status.PENDING
        )
        url = reverse('api-report-generated-status', kwargs={'pk': report.id})
        
        res = self.client_b.get(url)
        self.assertEqual(res.status_code, 404)

        res_a = self.client_a.get(url)
        self.assertEqual(res_a.status_code, 200)

    def test_05_download_not_ready(self):
        report = GeneratedReport.objects.create(
            company_id=self.company_a.id, created_by=self.admin_a,
            report_type="profit_and_loss", status=GeneratedReport.Status.PROCESSING
        )
        url = reverse('api-report-generated-download', kwargs={'pk': report.id})
        res = self.client_a.get(url)
        self.assertEqual(res.status_code, 400)

    def test_06_download_expired(self):
        report = GeneratedReport.objects.create(
            company_id=self.company_a.id, created_by=self.admin_a,
            report_type="profit_and_loss", status=GeneratedReport.Status.SUCCESS,
            expires_at=timezone.now() - timedelta(days=1)
        )
        url = reverse('api-report-generated-download', kwargs={'pk': report.id})
        res = self.client_a.get(url)
        self.assertEqual(res.status_code, 400)

    def test_07_download_success(self):
        report = GeneratedReport.objects.create(
            company_id=self.company_a.id, created_by=self.admin_a,
            report_type="dashboard", status=GeneratedReport.Status.SUCCESS
        )
        # Create a dummy file
        from django.core.files.base import ContentFile
        report.file.save('test.pdf', ContentFile(b'mock-pdf-bytes'))
        report.file_name = 'test.pdf'
        report.save()
        
        url = reverse('api-report-generated-download', kwargs={'pk': report.id})
        res = self.client_a.get(url)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res['Content-Type'], 'application/pdf')
        
    def test_08_celery_task_integration(self):
        from reports.tasks import generate_pdf_report
        report = GeneratedReport.objects.create(
            company_id=self.company_a.id, created_by=self.admin_a,
            report_type="trial_balance", parameters={"as_of_date": "2025-12-31"},
            status=GeneratedReport.Status.PENDING
        )
        # Run sync
        generate_pdf_report(report.id)
        
        report.refresh_from_db()
        self.assertEqual(report.status, GeneratedReport.Status.SUCCESS)
        self.assertTrue(report.file.name.endswith('.pdf'))
        self.assertIsNotNone(report.completed_at)
        self.assertIsNotNone(report.expires_at)
