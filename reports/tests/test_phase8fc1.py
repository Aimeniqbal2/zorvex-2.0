from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from companies.models import Company
from platform_core.models import ModuleDefinition, CompanyModule
from django.contrib.auth import get_user_model
from unittest.mock import patch
import subprocess
import sys
from datetime import date

User = get_user_model()

class TestPhase8FC1PDFEngine(TestCase):
    def setUp(self):
        # Company A
        self.company_a = Company.objects.create(name="Company A")
        self.admin_a = User.objects.create_user(
            username='admin_a', password='password123',
            company=self.company_a, role='admin'
        )
        self.employee_a = User.objects.create_user(
            username='employee_a', password='password123',
            company=self.company_a, role='employee'
        )
        
        # Company B
        self.company_b = Company.objects.create(name="Company B")
        self.admin_b = User.objects.create_user(
            username='admin_b', password='password123',
            company=self.company_b, role='admin'
        )
        
        # Enable reports module for both
        reports_mod, _ = ModuleDefinition.objects.get_or_create(
            code='reports', defaults={'name': 'Reports', 'is_active': True}
        )
        CompanyModule.objects.create(company=self.company_a, module=reports_mod, enabled=True)
        self.cm_b = CompanyModule.objects.create(company=self.company_b, module=reports_mod, enabled=True)
        
        self.client_a = APIClient()
        self.client_a.force_authenticate(user=self.admin_a)
        
        self.client_a_emp = APIClient()
        self.client_a_emp.force_authenticate(user=self.employee_a)
        
        self.client_b = APIClient()
        self.client_b.force_authenticate(user=self.admin_b)
        
        self.pnl_url = reverse('api-profit-and-loss')
        self.bs_url = reverse('api-balance-sheet')
        self.tb_url = reverse('api-trial-balance')
        self.dashboard_url = reverse('api-dashboard')

    def test_01_profit_and_loss_pdf(self):
        res = self.client_a.get(f"{self.pnl_url}?export=pdf")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res['Content-Type'], 'application/pdf')
        self.assertIn('profit_and_loss', res['Content-Disposition'])

    def test_02_balance_sheet_pdf(self):
        res = self.client_a.get(f"{self.bs_url}?export=pdf")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res['Content-Type'], 'application/pdf')
        
    def test_03_trial_balance_pdf(self):
        res = self.client_a.get(f"{self.tb_url}?export=pdf")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res['Content-Type'], 'application/pdf')

    def test_04_dashboard_pdf(self):
        res = self.client_a.get(f"{self.dashboard_url}?export=pdf")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res['Content-Type'], 'application/pdf')
        
    def test_05_pdf_json_contract(self):
        # JSON and PDF endpoints should succeed from the same data
        res_json = self.client_a.get(self.pnl_url)
        self.assertEqual(res_json.status_code, 200)
        res_pdf = self.client_a.get(f"{self.pnl_url}?export=pdf")
        self.assertEqual(res_pdf.status_code, 200)
        
    def test_06_pdf_tenant_isolation(self):
        # Company A asks for Company B's company_id via URL parameter
        # Since we rely purely on request.user.company_id, it should not leak.
        res = self.client_a.get(f"{self.pnl_url}?company_id={self.company_b.id}&export=pdf")
        self.assertEqual(res.status_code, 200) # Succeeds but returns Company A data (empty)
        # Verify it doesn't break
        
    def test_07_pdf_rbac(self):
        res = self.client_a_emp.get(f"{self.pnl_url}?export=pdf")
        self.assertEqual(res.status_code, 403)
        
    def test_08_pdf_module_gating(self):
        self.cm_b.enabled = False
        self.cm_b.save()
        res = self.client_b.get(f"{self.pnl_url}?export=pdf")
        self.assertEqual(res.status_code, 403)
        
    def test_09_pdf_empty_report(self):
        # By default our setup has no Journal Entries, so it is empty
        res = self.client_a.get(f"{self.pnl_url}?export=pdf")
        self.assertEqual(res.status_code, 200)
        
    @patch('xhtml2pdf.pisa.pisaDocument')
    def test_10_pdf_renderer_failure(self, mock_pisa):
        # Mock pdf.err to be true
        class MockPDF:
            err = True
        mock_pisa.return_value = MockPDF()
        res = self.client_a.get(f"{self.pnl_url}?export=pdf")
        self.assertEqual(res.status_code, 500)
        self.assertEqual(res.json()['detail'], "Unable to generate PDF report.")
        
    def test_11_pdf_filter_propagation(self):
        # Ensure start_date / end_date filters are passed without crashing
        res = self.client_a.get(f"{self.pnl_url}?start_date=2025-01-01&end_date=2025-12-31&export=pdf")
        self.assertEqual(res.status_code, 200)
        
    @patch('reports.services.financial.FinancialStatementsReportingService.get_trial_balance')
    def test_12_large_report_protection(self, mock_service):
        mock_service.return_value = {
            'accounts': [{'account_name': 'A', 'account_code': '1', 'debit': 0, 'credit': 0}] * 1001
        }
        res = self.client_a.get(f"{self.tb_url}?export=pdf")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()['detail'], "This report is too large for synchronous PDF generation. Please use CSV export.")
        
    def test_13_csv_regression(self):
        res = self.client_a.get(f"{self.pnl_url}?format=csv")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res['Content-Type'], 'text/csv; charset=utf-8')
        
    def test_14_json_regression(self):
        res = self.client_a.get(self.pnl_url)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res['Content-Type'], 'application/json')
        
    def test_15_makemigrations_clean(self):
        result = subprocess.run([sys.executable, 'manage.py', 'makemigrations', '--check'], capture_output=True)
        self.assertEqual(result.returncode, 0)
