from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from operations.models import TemporaryServiceRequest, QAChecklistTemplate, QAChecklistItem, QAInspection, DutyAssignment, TemporaryServiceLine, OperationalSite
from crm.models import CRMEntity
from hrm.models import Designation
from companies.models import Company
from platform_core.models import ModuleDefinition
from platform_core.services import enable_module
from django.utils import timezone
from datetime import timedelta

User = get_user_model()

class C9PhaseTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name='Test Company C9')
        self.other_company = Company.objects.create(name='Other Company C9')
        
        # Create and enable module
        ModuleDefinition.objects.get_or_create(
            code='security_ops',
            defaults={'name': 'Security Operations', 'description': 'Security Operations'}
        )
        enable_module(self.company, 'security_ops')
        enable_module(self.other_company, 'security_ops')
        
        # Also need CRM and HRM for the test?
        ModuleDefinition.objects.get_or_create(code='crm', defaults={'name':'CRM'})
        enable_module(self.company, 'crm')
        ModuleDefinition.objects.get_or_create(code='hrm', defaults={'name':'HRM'})
        enable_module(self.company, 'hrm')
        ModuleDefinition.objects.get_or_create(code='billing', defaults={'name':'Billing'})
        enable_module(self.company, 'billing')
        
        self.user = User.objects.create_user(
            username='c9admin',
            password='password',
            company=self.company,
            role='admin'
        )
        self.other_user = User.objects.create_user(
            username='c9other',
            password='password',
            company=self.other_company,
            role='admin'
        )
        
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        
        self.crm_entity = CRMEntity.objects.create(
            company=self.company,
            name='ABC Events',
            entity_type='CUSTOMER'
        )
        self.designation = Designation.objects.create(
            company=self.company,
            name='Event Guard'
        )
        self.site = OperationalSite.objects.create(
            company=self.company,
            crm_entity=self.crm_entity,
            name='Main Event Hall',
            address='123 Event Street'
        )

    def test_e2e_temporary_service(self):
        # 1. Create Temporary Service
        now = timezone.now()
        response = self.client.post('/api/operations/temporary-services/', {
            'company': self.company.id,
            'crm_entity': self.crm_entity.id,
            'title': 'Concert Security',
            'reference_number': 'TS-1001',
            'start_datetime': now,
            'end_datetime': now + timedelta(days=2),
            'status': 'REQUESTED',
            'operational_site': self.site.id
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        ts_id = response.data['id']
        
        # Add Line
        line_resp = self.client.post('/api/operations/temporary-service-lines/', {
            'company': self.company.id,
            'temporary_service': ts_id,
            'designation': self.designation.id,
            'required_headcount': 5,
            'billing_rate': 25.00,
            'pay_rate': 15.00,
            'shift_start': '10:00:00',
            'shift_end': '18:00:00'
        })
        self.assertEqual(line_resp.status_code, status.HTTP_201_CREATED, line_resp.data)
        line_id = line_resp.data['id']
        
        # 2. Approve
        app_resp = self.client.post(f'/api/operations/temporary-services/{ts_id}/approve/')
        self.assertEqual(app_resp.status_code, status.HTTP_200_OK)
        ts = TemporaryServiceRequest.objects.get(id=ts_id)
        self.assertEqual(ts.status, 'APPROVED')
        
        # 3. Confirm
        conf_resp = self.client.post(f'/api/operations/temporary-services/{ts_id}/confirm/')
        self.assertEqual(conf_resp.status_code, status.HTTP_200_OK)
        ts.refresh_from_db()
        self.assertEqual(ts.status, 'CONFIRMED')
        
        # 4. Generate Duties
        from hrm.models import Employee
        emp = Employee.objects.create(
            company=self.company,
            first_name='John',
            last_name='Guard',
            employee_code='G001',
            designation=self.designation
        )
        
        duty_resp = self.client.post(f'/api/operations/temporary-services/{ts_id}/generate_duties/', {
            'assignments': [
                {'employee_id': emp.id, 'line_id': line_id, 'date': now.date().isoformat()}
            ]
        }, format='json')
        self.assertEqual(duty_resp.status_code, status.HTTP_200_OK, duty_resp.data)
        
        # Verify Duty
        duties = DutyAssignment.objects.filter(temporary_service_id=ts_id)
        self.assertEqual(duties.count(), 1)
        
        # 5. Complete
        comp_resp = self.client.post(f'/api/operations/temporary-services/{ts_id}/complete/')
        self.assertEqual(comp_resp.status_code, status.HTTP_200_OK)
        
        # 6. Generate Invoice
        inv_resp = self.client.post(f'/api/operations/temporary-services/{ts_id}/generate_invoice/')
        self.assertEqual(inv_resp.status_code, status.HTTP_200_OK, inv_resp.data)
        self.assertIn('invoice_id', inv_resp.data)
        
        from billing.models import ServiceInvoice, ServiceInvoiceLine
        invoice = ServiceInvoice.objects.get(id=inv_resp.data['invoice_id'])
        self.assertEqual(invoice.invoice_number, f'TS-{ts_id}')
        lines = ServiceInvoiceLine.objects.filter(service_invoice=invoice)
        self.assertEqual(lines.count(), 1)
        # hours calculation: 10:00 to 18:00 -> 8 hours. 5 pax * 25 rate * 8 hours * 3 days
        self.assertEqual(lines.first().amount, 5 * 25 * 8 * 3)

        # 7. Test Invoice Idempotency
        inv_resp_2 = self.client.post(f'/api/operations/temporary-services/{ts_id}/generate_invoice/')
        self.assertEqual(inv_resp_2.status_code, status.HTTP_200_OK)
        self.assertEqual(inv_resp_2.data['status'], 'Invoice already exists')
        self.assertEqual(inv_resp_2.data['invoice_id'], invoice.id)
