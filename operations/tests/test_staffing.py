from django.test import TestCase
from django.contrib.auth import get_user_model
from datetime import date, timedelta, time
from django.utils import timezone
from companies.models import Company
from crm.models import CRMEntity
from hrm.models import Employee, Designation, Shift, WorkforceAttendance
from operations.models import OperationalSite, ServiceContract, SiteStaffingRequirement, Deployment, DeploymentStatus, DutyAssignment, DutyAssignmentStatus
from operations.services.staffing import get_staffing_coverage

User = get_user_model()

class StaffingCoverageTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="SecureCorp", business_type="other")
        self.other_company = Company.objects.create(name="OtherCorp", business_type="other")

        # CRM entities are required for OperationalSite
        self.crm = CRMEntity.objects.create(
            company=self.company, entity_type='CUSTOMER', name='Test Client', code='TC001'
        )
        self.other_crm = CRMEntity.objects.create(
            company=self.other_company, entity_type='CUSTOMER', name='Other Client', code='OC001'
        )

        self.site = OperationalSite.objects.create(company=self.company, crm_entity=self.crm, name="HQ Site", address="123 Main St", is_active=True)
        self.other_site = OperationalSite.objects.create(company=self.other_company, crm_entity=self.other_crm, name="Other Site", address="456 Other St", is_active=True)
        
        self.contract = ServiceContract.objects.create(company=self.company, crm_entity=self.crm, contract_code="C001", start_date=date.today() - timedelta(days=30))
        self.contract.sites.add(self.site)
        
        self.designation = Designation.objects.create(company=self.company, name="Security Guard")
        self.shift = Shift.objects.create(company=self.company, name="Morning", start_time=time(8, 0), end_time=time(16, 0))
        
        # Create a requirement
        self.req = SiteStaffingRequirement.objects.create(
            company=self.company,
            service_contract=self.contract,
            site=self.site,
            designation=self.designation,
            shift=self.shift,
            required_headcount=3,
            effective_from=date.today() - timedelta(days=10)
        )
        
        self.emp1 = Employee.objects.create(company=self.company, first_name="John", last_name="Doe")
        self.emp2 = Employee.objects.create(company=self.company, first_name="Jane", last_name="Smith")
        
        # Deploy both
        self.dep1 = Deployment.objects.create(
            company=self.company,
            employee=self.emp1,
            site=self.site,
            designation=self.designation,
            service_contract=self.contract,
            start_date=date.today() - timedelta(days=10),
            status=DeploymentStatus.ACTIVE
        )
        self.dep2 = Deployment.objects.create(
            company=self.company,
            employee=self.emp2,
            site=self.site,
            designation=self.designation,
            service_contract=self.contract,
            start_date=date.today() - timedelta(days=10),
            status=DeploymentStatus.ACTIVE
        )

    def test_coverage_calculation(self):
        target_date = date.today()
        # Scheduled 1
        DutyAssignment.objects.create(
            company=self.company,
            deployment=self.dep1,
            employee=self.emp1,
            site=self.site,
            date=target_date,
            start_time=time(8, 0),
            end_time=time(16, 0),
            status=DutyAssignmentStatus.COMPLETED
        )
        
        # Present 1
        WorkforceAttendance.objects.create(
            company=self.company,
            employee=self.emp1,
            date=target_date,
            status='PRESENT'
        )
        
        coverage = get_staffing_coverage(self.company, target_date)
        self.assertEqual(len(coverage), 1)
        c = coverage[0]
        self.assertEqual(c['required'], 3)
        self.assertEqual(c['deployed'], 2)  # John and Jane
        self.assertEqual(c['scheduled'], 1) # Only John
        self.assertEqual(c['present'], 1)   # Only John
        
        self.assertEqual(c['deployment_shortage'], 1)
        self.assertEqual(c['roster_shortage'], 2)
        self.assertEqual(c['attendance_shortage'], 2)
        self.assertEqual(c['status'], 'SHORT')

    def test_tenant_isolation(self):
        # A requirement in another company should not be returned
        other_contract = ServiceContract.objects.create(
            company=self.other_company,
            crm_entity=self.other_crm,
            contract_code="OC001",
            start_date=date.today() - timedelta(days=30)
        )
        other_contract.sites.add(self.other_site)
        other_req = SiteStaffingRequirement.objects.create(
            company=self.other_company,
            service_contract=other_contract,
            site=self.other_site,
            designation=Designation.objects.create(company=self.other_company, name="Manager"),
            shift=Shift.objects.create(company=self.other_company, name="Morning", start_time=time(8, 0), end_time=time(16, 0)),
            required_headcount=5,
            effective_from=date.today()
        )
        
        coverage = get_staffing_coverage(self.company, date.today())
        # Should only return company's requirement
        self.assertEqual(len(coverage), 1)
        self.assertEqual(coverage[0]['requirement_id'], self.req.id)

    def test_historical_resolution(self):
        target_date = date.today()
        # Change req effective_to to yesterday
        self.req.effective_to = target_date - timedelta(days=1)
        self.req.save()
        
        # Create new req starting today
        SiteStaffingRequirement.objects.create(
            company=self.company,
            service_contract=self.contract,
            site=self.site,
            designation=self.designation,
            shift=self.shift,
            required_headcount=5, # Increased headcount
            effective_from=target_date
        )
        
        # Querying today should return 5
        cov_today = get_staffing_coverage(self.company, target_date)
        self.assertEqual(len(cov_today), 1)
        self.assertEqual(cov_today[0]['required'], 5)
        
        # Querying 2 days ago should return 3
        cov_past = get_staffing_coverage(self.company, target_date - timedelta(days=2))
        self.assertEqual(len(cov_past), 1)
        self.assertEqual(cov_past[0]['required'], 3)

    def test_surplus_calculation(self):
        target_date = date.today()
        # Create 5 deployments for 3 required
        for i in range(3, 8):
            emp = Employee.objects.create(company=self.company, first_name=f'Emp{i}', last_name='Test')
            dep = Deployment.objects.create(
                company=self.company,
                employee=emp,
                site=self.site,
                designation=self.designation,
                service_contract=self.contract,
                start_date=date.today() - timedelta(days=10),
                status=DeploymentStatus.ACTIVE
            )
            DutyAssignment.objects.create(
                company=self.company,
                deployment=dep,
                employee=emp,
                site=self.site,
                date=target_date,
                start_time=time(8, 0),
                end_time=time(16, 0),
                status=DutyAssignmentStatus.COMPLETED
            )
            WorkforceAttendance.objects.create(
                company=self.company,
                employee=emp,
                date=target_date,
                status='PRESENT'
            )
            
        coverage = get_staffing_coverage(self.company, target_date)
        c = coverage[0]
        self.assertEqual(c['required'], 3)
        self.assertEqual(c['deployed'], 7)
        self.assertEqual(c['deployment_shortage'], -4) # Surplus
        self.assertEqual(c['status'], 'SURPLUS')

    def test_overlap_rejection(self):
        from django.core.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            SiteStaffingRequirement.objects.create(
                company=self.company,
                service_contract=self.contract,
                site=self.site,
                designation=self.designation,
                shift=self.shift,
                required_headcount=2,
                effective_from=date.today()
            )

    def test_contract_site_mismatch(self):
        from django.core.exceptions import ValidationError
        other_site = OperationalSite.objects.create(company=self.company, crm_entity=self.crm, name='Site B', is_active=True)
        # contract does not have other_site
        with self.assertRaises(ValidationError):
            SiteStaffingRequirement.objects.create(
                company=self.company,
                service_contract=self.contract,
                site=other_site,
                designation=self.designation,
                shift=self.shift,
                required_headcount=2,
                effective_from=date.today()
            )

    def test_cross_tenant_rejection(self):
        from django.core.exceptions import ValidationError
        other_shift = Shift.objects.create(company=self.other_company, name='Evening', start_time=time(16, 0), end_time=time(23, 0))
        with self.assertRaises(ValidationError):
            SiteStaffingRequirement.objects.create(
                company=self.company,
                service_contract=self.contract,
                site=self.site,
                designation=self.designation,
                shift=other_shift, # Cross tenant
                required_headcount=2,
                effective_from=date.today()
            )

from rest_framework.test import APITestCase
from django.urls import reverse
from platform_core.models import ModuleDefinition, CompanyModule

class StaffingAPIAndDashboardTests(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name='SecureCorp', business_type='security')
        self.user = User.objects.create_user(username='manager', password='pwd', company=self.company, role='manager')
        self.staff_user = User.objects.create_user(username='staff', password='pwd', company=self.company, role='staff')
        
        mod, _ = ModuleDefinition.objects.get_or_create(code='security_ops', name='Security')
        CompanyModule.objects.create(company=self.company, module=mod, enabled=True)
        
        self.crm = CRMEntity.objects.create(company=self.company, entity_type='CUSTOMER', name='Test Client', code='TC001')
        self.site = OperationalSite.objects.create(company=self.company, crm_entity=self.crm, name='HQ Site', address='123 Main St', is_active=True)
        self.contract = ServiceContract.objects.create(company=self.company, crm_entity=self.crm, contract_code='C001', start_date=date.today() - timedelta(days=30))
        self.contract.sites.add(self.site)
        self.designation = Designation.objects.create(company=self.company, name='Security Guard')
        self.shift = Shift.objects.create(company=self.company, name='Morning', start_time=time(8, 0), end_time=time(16, 0))

    def test_unauthorized_staffing_write(self):
        self.client.force_authenticate(user=self.staff_user)
        url = reverse('staffing-requirement-list')
        data = {
            'site': self.site.id,
            'service_contract': self.contract.id,
            'designation': self.designation.id,
            'shift': self.shift.id,
            'required_headcount': 2,
            'effective_from': date.today().isoformat()
        }
        res = self.client.post(url, data)
        self.assertEqual(res.status_code, 403)

    def test_security_ops_gating(self):
        self.client.force_authenticate(user=self.user)
        CompanyModule.objects.filter(company=self.company).update(enabled=False)
        url = reverse('staffing-coverage')
        res = self.client.get(url)
        self.assertEqual(res.status_code, 403)
        self.assertIn('not enabled for your company', res.data['detail'])
        
    def test_dashboard_aggregation(self):
        self.client.force_authenticate(user=self.user)
        # Create a requirement and active deployment
        req = SiteStaffingRequirement.objects.create(
            company=self.company,
            service_contract=self.contract,
            site=self.site,
            designation=self.designation,
            shift=self.shift,
            required_headcount=3,
            effective_from=date.today() - timedelta(days=10)
        )
        emp = Employee.objects.create(company=self.company, first_name='John', last_name='Doe')
        Deployment.objects.create(
            company=self.company,
            employee=emp,
            site=self.site,
            designation=self.designation,
            service_contract=self.contract,
            start_date=date.today() - timedelta(days=10),
            status=DeploymentStatus.ACTIVE
        )
        url = reverse('security-dashboard')
        res = self.client.get(url)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['active_deployments'], 1)
