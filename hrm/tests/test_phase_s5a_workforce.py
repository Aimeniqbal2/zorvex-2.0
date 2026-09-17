from decimal import Decimal
from datetime import date, timedelta
from django.test import TestCase
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from companies.models import Company
from finance.models import Currency, ChartOfAccount
from hrm.models import (
    Department, Designation, Position, Employee, EmployeeNextOfKin,
    EmployeeDocument, EmployeeDocumentType, DocumentVerificationStatus,
    EmployeeTraining, EmploymentHistory, StatutoryScheme, StatutorySchemeType,
    StatutorySchemeRateHistory, EmployeeStatutoryEnrollment, EmployeeSalaryAssignment
)

User = get_user_model()

class PhaseS5AWorkforceFoundationTests(TestCase):
    def setUp(self):
        self.company1 = Company.objects.create(name="Company One")
        self.company2 = Company.objects.create(name="Company Two")

        self.user1 = User.objects.create_user(
            username="user1", email="user1@cmp1.com", password="password123", company=self.company1, is_superuser=True
        )
        self.user2 = User.objects.create_user(
            username="user2", email="user2@cmp2.com", password="password123", company=self.company2, is_superuser=True
        )

        self.currency1 = Currency.objects.create(company=self.company1, code="PKR", name="Pakistani Rupee", symbol="Rs")
        self.currency2 = Currency.objects.create(company=self.company2, code="USD", name="US Dollar", symbol="$")

        self.dept1 = Department.objects.create(company=self.company1, name="Operations")
        self.desig_guard = Designation.objects.create(company=self.company1, name="Security Guard")
        self.desig_mgr = Designation.objects.create(company=self.company1, name="Operations Manager")

        self.client = APIClient()
        self.client.force_authenticate(user=self.user1)

    def test_employee_creation_and_auto_code_generation(self):
        emp = Employee.objects.create(
            company=self.company1,
            first_name="Tariq",
            last_name="Mahmood",
            date_of_birth=date(1990, 5, 15),
            hire_date=date(2023, 1, 1),
            classification="DIRECT",
            cnic_number="35202-1234567-1",
            department=self.dept1,
            designation=self.desig_guard
        )
        self.assertTrue(emp.employee_code.startswith("EMP-"))
        self.assertEqual(emp.full_name, "Tariq Mahmood")
        self.assertEqual(emp.joining_date, date(2023, 1, 1))
        self.assertIsNotNone(emp.age)
        self.assertFalse(emp.training_completed)

        # Check employment history logged
        history = EmploymentHistory.objects.filter(company=self.company1, employee=emp)
        self.assertTrue(history.filter(event_type='JOINING').exists())

    def test_direct_vs_indirect_classification_filtering(self):
        emp_direct = Employee.objects.create(
            company=self.company1,
            first_name="Guard",
            last_name="One",
            classification="DIRECT",
            designation=self.desig_guard
        )
        emp_indirect = Employee.objects.create(
            company=self.company1,
            first_name="Manager",
            last_name="One",
            classification="INDIRECT",
            designation=self.desig_mgr
        )

        response = self.client.get('/api/hrm/employees/?classification=DIRECT')
        self.assertEqual(response.status_code, 200)
        results = response.data.get('results', response.data)
        codes = [e['employee_code'] for e in results]
        self.assertIn(emp_direct.employee_code, codes)
        self.assertNotIn(emp_indirect.employee_code, codes)

    def test_next_of_kin_primary_enforcement(self):
        emp = Employee.objects.create(company=self.company1, first_name="Ali", last_name="Khan")
        kin1 = EmployeeNextOfKin.objects.create(
            company=self.company1,
            employee=emp,
            name="Father Khan",
            relationship="Father",
            contact_number="03001234567",
            is_primary=True
        )
        kin2 = EmployeeNextOfKin.objects.create(
            company=self.company1,
            employee=emp,
            name="Brother Khan",
            relationship="Brother",
            contact_number="03007654321",
            is_primary=True
        )

        kin1.refresh_from_db()
        self.assertFalse(kin1.is_primary)
        self.assertTrue(kin2.is_primary)

    def test_employee_document_and_verification_workflow(self):
        emp = Employee.objects.create(company=self.company1, first_name="Bilal", last_name="Ahmed")
        doc = EmployeeDocument.objects.create(
            company=self.company1,
            employee=emp,
            document_type=EmployeeDocumentType.POLICE_VERIFICATION,
            document_number="POL-998822",
            verification_status=DocumentVerificationStatus.PENDING
        )

        # Execute verify action via model method
        doc.verify(user=self.user1, status_val=DocumentVerificationStatus.VERIFIED, notes_val="Police clear record verified")
        doc.refresh_from_db()
        self.assertEqual(doc.verification_status, DocumentVerificationStatus.VERIFIED)
        self.assertEqual(doc.verified_by, self.user1)

        # Check EmploymentHistory logged
        hist = EmploymentHistory.objects.filter(company=self.company1, employee=emp, event_type='DOCUMENT_VERIFICATION').first()
        self.assertIsNotNone(hist)
        self.assertIn("VERIFIED", hist.new_value)

        # Execute verify via API endpoint
        doc2 = EmployeeDocument.objects.create(
            company=self.company1,
            employee=emp,
            document_type=EmployeeDocumentType.CNIC,
            document_number="35202-9999999-9",
            verification_status=DocumentVerificationStatus.PENDING
        )
        res = self.client.post(f'/api/hrm/employee-documents/{doc2.id}/verify/', {
            'verification_status': 'VERIFIED',
            'notes': 'NADRA CNIC Verified'
        })
        self.assertEqual(res.status_code, 200)
        doc2.refresh_from_db()
        self.assertEqual(doc2.verification_status, 'VERIFIED')

    def test_employee_training_completed_property(self):
        emp = Employee.objects.create(company=self.company1, first_name="Usman", last_name="Ghani")
        self.assertFalse(emp.training_completed)

        training = EmployeeTraining.objects.create(
            company=self.company1,
            employee=emp,
            training_type="Basic Security & Fire Safety",
            training_date=date(2023, 6, 1),
            status="COMPLETED"
        )
        self.assertTrue(emp.training_completed)

    def test_statutory_scheme_rate_resolution_hierarchy(self):
        account = ChartOfAccount.objects.create(
            company=self.company1, account_code="2100-EOBI", account_name="EOBI Payable",
            account_type="LIABILITY", is_active=True
        )
        eobi = StatutoryScheme.objects.create(
            company=self.company1,
            code="EOBI",
            name="EOBI Contribution",
            scheme_type=StatutorySchemeType.EOBI,
            employee_default_rate=Decimal('1.00'),
            employer_default_rate=Decimal('5.00'),
            liability_account=account
        )

        emp = Employee.objects.create(company=self.company1, first_name="Rashid", last_name="Minhas")
        enrollment = EmployeeStatutoryEnrollment.objects.create(
            company=self.company1,
            employee=emp,
            scheme=eobi,
            is_enabled=True,
            use_company_default=True
        )

        # 1. Default Scheme Rate Resolution
        emp_rate, empr_rate, active = EmployeeStatutoryEnrollment.resolve_rate(
            self.company1, emp, "EOBI", date(2026, 1, 1)
        )
        self.assertTrue(active)
        self.assertEqual(emp_rate, Decimal('1.00'))
        self.assertEqual(empr_rate, Decimal('5.00'))

        # 2. Scheme Effective Rate History Resolution
        rate_hist = StatutorySchemeRateHistory.objects.create(
            company=self.company1,
            scheme=eobi,
            employee_default_rate=Decimal('2.00'),
            employer_default_rate=Decimal('6.00'),
            effective_from=date(2026, 1, 1)
        )
        emp_rate_hist, empr_rate_hist, active_hist = EmployeeStatutoryEnrollment.resolve_rate(
            self.company1, emp, "EOBI", date(2026, 3, 1)
        )
        self.assertEqual(emp_rate_hist, Decimal('2.00'))
        self.assertEqual(empr_rate_hist, Decimal('6.00'))

        # 3. Employee Specific Override Resolution
        enrollment.use_company_default = False
        enrollment.employee_rate_override = Decimal('1.50')
        enrollment.employer_rate_override = Decimal('4.50')
        enrollment.save()

        emp_rate_ovr, empr_rate_ovr, active_ovr = EmployeeStatutoryEnrollment.resolve_rate(
            self.company1, emp, "EOBI", date(2026, 3, 1)
        )
        self.assertEqual(emp_rate_ovr, Decimal('1.50'))
        self.assertEqual(empr_rate_ovr, Decimal('4.50'))

    def test_compensation_baseline_resolution(self):
        emp = Employee.objects.create(company=self.company1, first_name="Zafar", last_name="Iqbal")
        assignment = EmployeeSalaryAssignment.objects.create(
            company=self.company1,
            employee=emp,
            currency=self.currency1,
            base_salary=Decimal('45000.00'),
            single_ot_rate=Decimal('250.00'),
            double_ot_rate=Decimal('500.00'),
            effective_from=date(2026, 1, 1),
            status='ACTIVE'
        )

        resolved = EmployeeSalaryAssignment.resolve_compensation(self.company1, emp, date(2026, 2, 1))
        self.assertIsNotNone(resolved)
        self.assertEqual(resolved.base_salary, Decimal('45000.00'))
        self.assertEqual(resolved.single_ot_rate, Decimal('250.00'))
        self.assertEqual(resolved.double_ot_rate, Decimal('500.00'))

    def test_tenant_isolation_security(self):
        emp_cmp2 = Employee.objects.create(company=self.company2, first_name="Other", last_name="Tenant")

        # Authenticated as user1 (Company 1) trying to fetch Company 2 employee
        res = self.client.get(f'/api/hrm/employees/{emp_cmp2.id}/')
        self.assertEqual(res.status_code, 404)

    def test_additional_document_types(self):
        emp = Employee.objects.create(company=self.company1, first_name="Hamza", last_name="Shabbir")
        doc1 = EmployeeDocument.objects.create(
            company=self.company1, employee=emp, document_type=EmployeeDocumentType.OTHER_VERIFICATION, document_number="OV-001"
        )
        doc2 = EmployeeDocument.objects.create(
            company=self.company1, employee=emp, document_type=EmployeeDocumentType.EDUCATION_DOCUMENT, document_number="EDU-002"
        )
        doc3 = EmployeeDocument.objects.create(
            company=self.company1, employee=emp, document_type=EmployeeDocumentType.OTHER, document_number="OTH-003"
        )

        self.assertEqual(doc1.document_type, 'OTHER_VERIFICATION')
        self.assertEqual(doc2.document_type, 'EDUCATION_DOCUMENT')
        self.assertEqual(doc3.document_type, 'OTHER')

    def test_employment_history_extended_auditing(self):
        dept2 = Department.objects.create(company=self.company1, name="Intelligence")
        emp = Employee.objects.create(
            company=self.company1, first_name="Sajid", last_name="Ali", department=self.dept1
        )
        # Department Change
        emp.department = dept2
        emp.save()
        self.assertTrue(EmploymentHistory.objects.filter(company=self.company1, employee=emp, event_type='DEPARTMENT_CHANGE').exists())

        # Salary Change
        EmployeeSalaryAssignment.objects.create(
            company=self.company1,
            employee=emp,
            currency=self.currency1,
            base_salary=Decimal('50000.00'),
            single_ot_rate=Decimal('300.00'),
            double_ot_rate=Decimal('600.00'),
            effective_from=date(2026, 1, 1),
            status='ACTIVE'
        )
        self.assertTrue(EmploymentHistory.objects.filter(company=self.company1, employee=emp, event_type='SALARY_CHANGE').exists())

        # Statutory Enrollment Change
        account = ChartOfAccount.objects.create(
            company=self.company1, account_code="2101-SESSI", account_name="SESSI Payable",
            account_type="LIABILITY", is_active=True
        )
        scheme = StatutoryScheme.objects.create(
            company=self.company1, code="SESSI", name="SESSI Contribution", scheme_type=StatutorySchemeType.SOCIAL_SECURITY, liability_account=account
        )
        EmployeeStatutoryEnrollment.objects.create(
            company=self.company1,
            employee=emp,
            scheme=scheme,
            is_enabled=True
        )
        self.assertTrue(EmploymentHistory.objects.filter(company=self.company1, employee=emp, event_type='STATUTORY_ENROLLMENT_CHANGE').exists())
