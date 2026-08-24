import json
import uuid
from datetime import datetime, timedelta, time, date
import zoneinfo
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from accounts.models import User
from companies.models import Company
from reports.models import ReportSubscription, GeneratedReport
from reports.services.scheduling import SchedulingService
from unittest.mock import patch, MagicMock

@override_settings(CELERY_TASK_ALWAYS_EAGER=True, CELERY_TASK_EAGER_PROPAGATES=True, EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
class Phase8FDScheduledReportingTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        # Create Companies
        cls.company_a = Company.objects.create(name="Stark Industries")
        cls.company_b = Company.objects.create(name="Wayne Enterprises")

        # Create Users
        cls.admin_a = User.objects.create_user(
            username="admin_a", email="admin_a@stark.com", password="pwd", company=cls.company_a, role="admin", is_active=True
        )
        cls.emp_a = User.objects.create_user(
            username="emp_a", email="emp_a@stark.com", password="pwd", company=cls.company_a, role="employee", is_active=True
        )
        cls.admin_b = User.objects.create_user(
            username="admin_b", email="admin_b@wayne.com", password="pwd", company=cls.company_b, role="admin", is_active=True
        )
        # Enable modules
        from platform_core.models import ModuleDefinition, CompanyModule
        reports_mod, _ = ModuleDefinition.objects.get_or_create(code='reports', defaults={'name': 'Reports', 'is_active': True})
        CompanyModule.objects.create(company=cls.company_a, module=reports_mod, enabled=True)
        CompanyModule.objects.create(company=cls.company_b, module=reports_mod, enabled=True)
        finance_mod, _ = ModuleDefinition.objects.get_or_create(code='finance', defaults={'name': 'Finance', 'is_active': True})
        CompanyModule.objects.create(company=cls.company_a, module=finance_mod, enabled=True)

    def setUp(self):
        self.client_a = APIClient()
        self.client_a.force_authenticate(user=self.admin_a)
        
        self.client_emp_a = APIClient()
        self.client_emp_a.force_authenticate(user=self.emp_a)
        
        self.client_b = APIClient()
        self.client_b.force_authenticate(user=self.admin_b)
        
        from django.core import mail
        mail.outbox = []

    def test_01_scheduling_service_timezone_math(self):
        # Base time: 2026-08-12 12:00:00 UTC
        base_time = datetime(2026, 8, 12, 12, 0, 0, tzinfo=zoneinfo.ZoneInfo("UTC"))
        
        # Sub: Karachi, Daily at 18:00
        # 12:00 UTC is 17:00 Karachi. So next run should be today at 18:00 Karachi = 13:00 UTC.
        sub = ReportSubscription(
            frequency='DAILY',
            timezone='Asia/Karachi',
            execution_time=time(18, 0)
        )
        
        next_run = SchedulingService.calculate_next_run_at(sub, base_time)
        self.assertEqual(next_run.hour, 13)
        self.assertEqual(next_run.date(), date(2026, 8, 12))
        
        # If execution time is 16:00 Karachi. 12:00 UTC is 17:00 Karachi. Next run is tomorrow.
        sub.execution_time = time(16, 0)
        next_run = SchedulingService.calculate_next_run_at(sub, base_time)
        self.assertEqual(next_run.hour, 11)
        self.assertEqual(next_run.date(), date(2026, 8, 13))

    def test_02_scheduling_service_relative_parameters(self):
        ref_date = date(2026, 8, 15)
        
        # current_month
        params = {"date_range": "current_month"}
        resolved = SchedulingService.resolve_relative_parameters(params, ref_date)
        self.assertEqual(resolved["start_date"], "2026-08-01")
        self.assertEqual(resolved["end_date"], "2026-08-31")
        
        # previous_month
        params = {"date_range": "previous_month"}
        resolved = SchedulingService.resolve_relative_parameters(params, ref_date)
        self.assertEqual(resolved["start_date"], "2026-07-01")
        self.assertEqual(resolved["end_date"], "2026-07-31")

    def test_03_create_subscription_api(self):
        payload = {
            "name": "Monthly PNL",
            "report_type": "profit_and_loss",
            "frequency": "MONTHLY",
            "timezone": "UTC",
            "execution_time": "09:00:00",
            "day_of_month": 1,
            "parameters": {"date_range": "previous_month"},
            "recipients": ["admin_a@stark.com"]
        }
        
        response = self.client_a.post('/api/reports/subscriptions/', payload, format='json')
        self.assertEqual(response.status_code, 201)
        
        sub_id = response.data['id']
        sub = ReportSubscription.objects.get(id=sub_id)
        self.assertEqual(sub.company, self.company_a)
        self.assertIsNotNone(sub.next_run_at)

    def test_04_create_subscription_rbac(self):
        payload = {
            "name": "Monthly PNL",
            "report_type": "profit_and_loss",
            "frequency": "MONTHLY",
            "timezone": "UTC",
            "execution_time": "09:00:00",
            "day_of_month": 1,
            "parameters": {"date_range": "previous_month"},
        }
        
        # Employee A should be denied
        response = self.client_emp_a.post('/api/reports/subscriptions/', payload, format='json')
        self.assertEqual(response.status_code, 403)

    def test_05_tenant_isolation(self):
        # Admin A creates a sub
        sub = ReportSubscription.objects.create(
            company=self.company_a,
            name="Stark Report",
            report_type="trial_balance",
            execution_time=time(9, 0),
            created_by=self.admin_a
        )
        
        # Admin B tries to list, should not see Stark Report
        response = self.client_b.get('/api/reports/subscriptions/')
        self.assertEqual(len(response.data), 0)
        
        # Admin B tries to retrieve, should get 404
        response = self.client_b.get(f'/api/reports/subscriptions/{sub.id}/')
        self.assertEqual(response.status_code, 404)

    def test_06_celery_dispatch(self):
        # Create a subscription that is due
        sub = ReportSubscription.objects.create(
            company=self.company_a,
            name="Due Report",
            report_type="profit_and_loss",
            execution_time=time(9, 0),
            created_by=self.admin_a,
            is_active=True,
            next_run_at=timezone.now() - timedelta(minutes=5),
            recipients=["admin_a@stark.com"]
        )
        
        from reports.tasks import dispatch_due_reports
        dispatch_due_reports.apply()
        
        sub.refresh_from_db()
        self.assertGreater(sub.next_run_at, timezone.now())
        self.assertIsNotNone(sub.last_run_at)
        
        # A GeneratedReport should have been created and generated
        report = GeneratedReport.objects.filter(subscription=sub).first()
        self.assertIsNotNone(report)
        self.assertEqual(report.status, GeneratedReport.Status.SUCCESS)
        
        # Check email sent
        from django.core import mail
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("Scheduled Report: Due Report", mail.outbox[0].subject)
        
        # Verify the file is attached
        self.assertEqual(len(mail.outbox[0].attachments), 1)
        self.assertEqual(mail.outbox[0].attachments[0][2], 'application/pdf')

    def test_07_run_now_endpoint(self):
        sub = ReportSubscription.objects.create(
            company=self.company_a,
            name="On Demand",
            report_type="profit_and_loss",
            execution_time=time(9, 0),
            created_by=self.admin_a,
            is_active=True,
            next_run_at=timezone.now() + timedelta(days=5),
            recipients=["admin_a@stark.com"]
        )
        
        response = self.client_a.post(f'/api/reports/subscriptions/{sub.id}/run-now/')
        self.assertEqual(response.status_code, 202)
        
        # Verify a new GeneratedReport was created
        report_id = response.data['generated_report_id']
        report = GeneratedReport.objects.get(id=report_id)
        
        # It's eager executed because of CELERY_TASK_ALWAYS_EAGER
        self.assertEqual(report.status, GeneratedReport.Status.SUCCESS)
        
        # Next run at should remain unchanged (or whatever we defined, but run-now doesn't touch it)
        sub.refresh_from_db()
        self.assertGreater(sub.next_run_at, timezone.now() + timedelta(days=4))
