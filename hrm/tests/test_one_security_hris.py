from decimal import Decimal
from datetime import date, timedelta
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from rest_framework import status
from companies.models import Company
from hrm.models import (
    Employee, Department, Designation, EmployeeDocument,
    EmployeeDocumentType, DocumentVerificationStatus, EmployeeReference,
    WorkforceAttendance, EmployeeAttendanceState, AttendanceStatus,
    PayrollPeriod, PayrollRun, Payslip, PayslipLine
)
from platform_core.models import CompanyModule, ModuleDefinition
from finance.models import EmployeePaymentDestination
from hrm.services.attendance_register_service import AttendanceRegisterService
from hrm.services.payslip_report_service import PayslipReportService
from hrm.services.employee_import_service import EmployeeImportService

User = get_user_model()

class OneSecurityHRISTestCase(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(
            name="One Security (Pvt) Ltd.",
            business_type="security"
        )
        self.other_company = Company.objects.create(
            name="Alpha Corp",
            business_type="universal"
        )
        mod_hr, _ = ModuleDefinition.objects.get_or_create(code='hr', defaults={'name': 'HR'})
        CompanyModule.objects.create(company=self.company, module=mod_hr, enabled=True)

        self.user = User.objects.create_user(
            username="one_sec_admin",
            email="admin@onesecurity.com",
            password="testpassword123",
            company=self.company,
            role="admin",
            access_mode="FULL_COMPANY",
            is_superuser=True
        )
        self.client.force_authenticate(user=self.user)

        self.dept = Department.objects.create(company=self.company, name="Operations")
        self.desig = Designation.objects.create(company=self.company, name="Security Guard", code="SG")

    def test_employee_master_persistence_and_leading_zeros(self):
        """Test employee creation preserving leading zeros and One Security fields."""
        emp = Employee.objects.create(
            company=self.company,
            employee_code="000014",
            previous_employee_code="010571",
            first_name="Saad Khan",
            last_name="Jadoon",
            father_name="Saeed Khan",
            gender="MALE",
            date_of_birth=date(2000, 4, 1),
            place_of_birth="Distric Aptabad",
            children_male=1,
            children_female=0,
            caste="Jadoon",
            cnic_number="13101-7124112-7",
            cnic_issue_date=date(2019, 10, 8),
            cnic_expiry_date=date(2029, 10, 8),
            telephone_number="03185559650",
            phone="03149329381",
            department=self.dept,
            designation=self.desig,
            classification="DIRECT",
            eobi_number="EOBI-09876",
            sessi_number="SESSI-54321",
            insurance_policy_number="INS-112233",
            is_guard_vaccine=True,
            is_guard_apsa_verified=True,
            visible_for_activity=True
        )

        emp.refresh_from_db()
        self.assertEqual(emp.employee_code, "000014")
        self.assertEqual(emp.previous_employee_code, "010571")
        self.assertEqual(emp.caste, "Jadoon")
        self.assertTrue(emp.is_guard_vaccine)
        self.assertTrue(emp.is_guard_apsa_verified)

        # Test API endpoint
        res = self.client.get(f'/api/hrm/employees/{emp.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['previous_employee_code'], "010571")
        self.assertEqual(res.data['telephone_number'], "03185559650")

    def test_payment_destination_synchronization(self):
        """Test S-4G Finance EmployeePaymentDestination sync with Employee serializer."""
        payload = {
            'first_name': 'Zafar',
            'last_name': 'Javed',
            'employee_code': '002244',
            'previous_employee_code': '002244',
            'father_name': 'Khalil Ahmed',
            'department': str(self.dept.id),
            'designation': str(self.desig.id),
            'workforce_type': 'DIRECT',
            'payment_method': 'BANK_TRANSFER',
            'bank_name': 'Habib Bank Limited',
            'account_title': 'Zafar Javed',
            'account_number': '01234567890123',
            'iban': 'PK36HABB0000123456789012'
        }
        res = self.client.post('/api/hrm/employees/', payload)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        emp_id = res.data['id']

        # Verify finance.EmployeePaymentDestination was created
        dest = EmployeePaymentDestination.objects.filter(employee_id=emp_id, is_active=True).first()
        self.assertIsNotNone(dest)
        self.assertEqual(dest.bank_name, 'Habib Bank Limited')
        self.assertEqual(dest.account_number, '01234567890123')

        # Verify read in serializer
        emp_res = self.client.get(f'/api/hrm/employees/{emp_id}/')
        pref = emp_res.data.get('preferred_payment_destination')
        self.assertIsNotNone(pref)
        self.assertEqual(pref['bank_name'], 'Habib Bank Limited')

    def test_reference_person_creation_and_verification(self):
        """Test EmployeeReference creation and verify action."""
        emp = Employee.objects.create(
            company=self.company,
            employee_code="002280",
            first_name="Jamsher",
            last_name="Ahmed"
        )
        ref = EmployeeReference.objects.create(
            company=self.company,
            employee=emp,
            name="Belo Khan",
            relationship="Uncle",
            contact_number="03001234567"
        )

        self.assertFalse(ref.is_verified)
        verify_res = self.client.post(f'/api/hrm/employee-references/{ref.id}/verify/', {
            'remarks': 'Verified via telephonic background check'
        })
        self.assertEqual(verify_res.status_code, status.HTTP_200_OK)
        ref.refresh_from_db()
        self.assertTrue(ref.is_verified)
        self.assertEqual(ref.verified_by, self.user)

    def test_document_verification_with_nadra(self):
        """Test EmployeeDocument verification with NADRA_VERIFICATION type."""
        emp = Employee.objects.create(
            company=self.company,
            employee_code="002403",
            first_name="Mohammad",
            last_name="Ameer"
        )
        doc = EmployeeDocument.objects.create(
            company=self.company,
            employee=emp,
            document_type=EmployeeDocumentType.NADRA_VERIFICATION,
            document_number="NADRA-SLIP-998811",
            verification_status=DocumentVerificationStatus.PENDING
        )
        res = self.client.post(f'/api/hrm/employee-documents/{doc.id}/verify/', {
            'verification_status': 'VERIFIED',
            'notes': 'Manual NADRA verification slip verified on file'
        })
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        doc.refresh_from_db()
        self.assertEqual(doc.verification_status, DocumentVerificationStatus.VERIFIED)

    def test_attendance_register_service_and_endpoint(self):
        """Test AttendanceRegisterService daily resolution and export."""
        emp = Employee.objects.create(
            company=self.company,
            employee_code="002547",
            first_name="Abdul",
            last_name="Hakeem",
            hire_date=date(2026, 9, 1),
            joining_date=date(2026, 9, 1)
        )
        # Create attendance for 2026-09-02
        WorkforceAttendance.objects.create(
            company=self.company,
            employee=emp,
            date=date(2026, 9, 2),
            status=AttendanceStatus.PRESENT
        )
        # Create absent attendance for 2026-09-03
        WorkforceAttendance.objects.create(
            company=self.company,
            employee=emp,
            date=date(2026, 9, 3),
            status=AttendanceStatus.ABSENT
        )

        res = AttendanceRegisterService.get_attendance_register(
            company_id=self.company.id,
            date_from=date(2026, 9, 1),
            date_to=date(2026, 9, 3)
        )
        self.assertEqual(len(res['rows']), 1)
        emp_row = res['rows'][0]
        self.assertEqual(emp_row['employee_code'], "002547")
        self.assertEqual(emp_row['counts']['absent'], 1)

        # Test API endpoint
        api_res = self.client.get('/api/hrm/workforce-attendance/register/?month=9&year=2026')
        self.assertEqual(api_res.status_code, status.HTTP_200_OK)

        # Test CSV Export
        exp_res = self.client.get('/api/hrm/workforce-attendance/export-register/?month=9&year=2026')
        self.assertEqual(exp_res.status_code, status.HTTP_200_OK)
        self.assertIn("002547", exp_res.content.decode())

    def test_payslip_report_and_stop_payment_hold(self):
        """Test Payslip report parameters, stop payment hold toggle, and CSV export."""
        emp = Employee.objects.create(
            company=self.company,
            employee_code="002579",
            first_name="Najeeb",
            last_name="Hussain"
        )
        period = PayrollPeriod.objects.create(
            company=self.company,
            name="May 2026",
            start_date=date(2026, 5, 1),
            end_date=date(2026, 5, 31),
            payment_date=date(2026, 6, 5)
        )
        run = PayrollRun.objects.create(
            company=self.company,
            payroll_period=period,
            run_number="PR-2026-05",
            status="FINALIZED"
        )
        payslip = Payslip.objects.create(
            company=self.company,
            payroll_run=run,
            employee=emp,
            payslip_number="PS-002579-05",
            gross_amount=Decimal('45000.00'),
            deduction_amount=Decimal('3000.00'),
            net_amount=Decimal('42000.00'),
            status="DRAFT"
        )

        # Test stop payment hold toggle
        self.assertFalse(payslip.is_stop_payment)
        toggle_res = self.client.post(f'/api/hrm/payslips/{payslip.id}/toggle-hold/', {
            'reason': 'Disciplinary inquiry pending'
        })
        self.assertEqual(toggle_res.status_code, status.HTTP_200_OK)
        payslip.refresh_from_db()
        self.assertTrue(payslip.is_stop_payment)
        self.assertEqual(payslip.stop_payment_reason, 'Disciplinary inquiry pending')

        # Test report service
        report = PayslipReportService.get_payslip_report(
            company_id=self.company.id,
            month_from=date(2026, 5, 1),
            month_to=date(2026, 5, 31)
        )
        self.assertEqual(len(report['rows']), 1)
        self.assertTrue(report['rows'][0]['is_stop_payment'])

        # Test report endpoint
        rep_res = self.client.get('/api/hrm/payslips/report/?is_stop_payment=YES')
        self.assertEqual(rep_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(rep_res.data['rows']), 1)

    def test_legacy_data_import_service(self):
        """Test EmployeeImportService preview and execution with leading zero retention."""
        csv_content = """legacy_code,first_name,last_name,father_husband_name,cnic_number,joining_date,department,designation,workforce_type
000099,Ali,Mohammad,Nabi Bux,41301-1234567-1,2012-04-18,Operations,Security Guard,DIRECT
000193,Khamiso,Keerano,Nabi Bux,41301-1234567-2,2012-12-22,Operations,Security Guard,DIRECT
"""
        preview = EmployeeImportService.preview(company_id=self.company.id, file_content=csv_content)
        self.assertEqual(preview['total_rows'], 2)
        self.assertEqual(preview['valid_rows'], 2)
        self.assertEqual(preview['preview'][0]['legacy_code'], '000099')

        # Execute
        result = EmployeeImportService.execute(
            company_id=self.company.id,
            file_content=csv_content,
            update_existing=False
        )
        self.assertEqual(result['created'], 2)

        # Check in DB
        emp1 = Employee.objects.get(company=self.company, previous_employee_code='000099')
        self.assertEqual(emp1.previous_employee_code, '000099')
        self.assertIn('Ali', emp1.first_name)
        self.assertEqual(emp1.workforce_type, 'DIRECT')

        # Retry with update_existing=False should skip
        retry_res = EmployeeImportService.execute(
            company_id=self.company.id,
            file_content=csv_content,
            update_existing=False
        )
        self.assertEqual(retry_res['skipped'], 2)
        self.assertEqual(retry_res['created'], 0)

    def test_legacy_data_import_single_full_name_and_tsv(self):
        """Test EmployeeImportService handling single full_name and tab delimiter."""
        tsv_content = "legacy_code\tfull_name\tfather_husband_name\tcnic_number\n000301\tSaif ur Rehman\tFazal ur Rehman\t42201-9988776-5\n"
        preview = EmployeeImportService.preview(company_id=self.company.id, file_content=tsv_content)
        self.assertEqual(preview['total_rows'], 1)
        self.assertEqual(preview['valid_rows'], 1)
        self.assertEqual(preview['preview'][0]['full_name'], 'Saif ur Rehman')

        result = EmployeeImportService.execute(company_id=self.company.id, file_content=tsv_content)
        self.assertEqual(result['created'], 1)
        emp = Employee.objects.get(company=self.company, previous_employee_code='000301')
        self.assertEqual(emp.first_name, 'Saif ur Rehman')
        self.assertEqual(emp.last_name, '')
        self.assertEqual(emp.full_name, 'Saif ur Rehman')

    def test_employee_search_and_classification_filtering(self):
        """Test search by code, name, phone, and filtering by workforce_type/classification."""
        Employee.objects.create(
            company=self.company,
            employee_code="010348",
            previous_employee_code="010348",
            first_name="Abdul Rasheed",
            phone="03001234567",
            classification="DIRECT"
        )
        Employee.objects.create(
            company=self.company,
            employee_code="010349",
            previous_employee_code="010349",
            first_name="Kamran Khan",
            phone="03007654321",
            classification="INDIRECT"
        )

        # 1. Search by code
        res1 = self.client.get('/api/hrm/employees/?search=010348')
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res1.data['results']), 1)
        self.assertEqual(res1.data['results'][0]['employee_code'], '010348')

        # 2. Search by name
        res2 = self.client.get('/api/hrm/employees/?search=Abdul')
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertTrue(any('Abdul' in e['first_name'] for e in res2.data['results']))

        # 3. Filter by workforce_type (DIRECT)
        res3 = self.client.get('/api/hrm/employees/?workforce_type=DIRECT')
        self.assertEqual(res3.status_code, status.HTTP_200_OK)

        # 4. Filter by classification (INDIRECT)
        res4 = self.client.get('/api/hrm/employees/?classification=INDIRECT')
        self.assertEqual(res4.status_code, status.HTTP_200_OK)

        # 5. Verify page_size param works
        res5 = self.client.get('/api/hrm/employees/?page_size=100')
        self.assertEqual(res5.status_code, status.HTTP_200_OK)
        self.assertIn('count', res5.data)
        self.assertIn('results', res5.data)

    def test_legacy_data_import_cnic_protection_and_field_updates(self):
        """
        Verify that:
        1. When CSV has both 'CNIC' and 'Old NIC No', empty 'Old NIC No' does NOT wipe out CNIC.
        2. 'Branch Code' does not overwrite 'Department'.
        3. Updating existing employees properly syncs cnic_number, telephone_number, phone, dob, and caste.
        4. Date of birth in %m/%d/%Y (e.g. 09/28/1980) parses correctly.
        """
        emp = Employee.objects.create(
            company=self.company,
            employee_code="010404",
            previous_employee_code="010404",
            first_name="Aamir Khan",
            father_name="Noor Muhammad Korai",
            phone="03173309492",
            cnic_number="",
            telephone_number=""
        )

        csv_data = (
            "Employee Code,Name,Father Name,DOB,CNIC,Old NIC No,Telephone,Mobile,Caste,Branch Code,Bank Account No\n"
            "010404,Aamir Khan,Noor Muhammad Korai,09/28/1980,41202-9147171-5,,03185559650,03173309492,Korai,0142,0123456789\n"
        )

        preview = EmployeeImportService.preview(company_id=self.company.id, file_content=csv_data)
        self.assertEqual(preview['preview'][0]['cnic'], '41202-9147171-5')

        result = EmployeeImportService.execute(
            company_id=self.company.id,
            file_content=csv_data,
            update_existing=True
        )
        self.assertEqual(result['updated'], 1)

        emp.refresh_from_db()
        self.assertEqual(emp.cnic_number, '41202-9147171-5')
        self.assertEqual(emp.telephone_number, '03185559650')
        self.assertEqual(emp.phone, '03173309492')
        self.assertEqual(emp.date_of_birth, date(1980, 9, 28))
        self.assertEqual(emp.caste, 'Korai')

