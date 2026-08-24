from django.test import TestCase
from django.core.management import call_command
from django.utils import timezone
from datetime import date
from io import StringIO
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from companies.models import Company
from crm.models import CRMEntity
from hrm.models import (
    EmployeeRecord, Employee, Employment, Department, Attendance,
    WorkforceAttendance, EmployeeSalaryAssignment
)

User = get_user_model()

class UniversalHRMigrationTestCase(TestCase):
    def setUp(self):
        self.company_a = Company.objects.create(name='Company A')
        self.company_b = Company.objects.create(name='Company B')
        
        self.user_a = User.objects.create(username='user_a', company=self.company_a, is_superuser=True)
        self.user_b = User.objects.create(username='user_b', company=self.company_b, is_superuser=True)
        
        self.crm_a = CRMEntity.objects.create(company=self.company_a, name='CRM A', entity_type='PERSON')
        self.dept_a = Department.objects.create(company=self.company_a, name='Dept A')
        
        self.record_a = EmployeeRecord.objects.create(
            company=self.company_a,
            user=self.user_a,
            crm_entity=self.crm_a,
            department=self.dept_a,
            salary=5000
        )
        
        self.record_b = EmployeeRecord.objects.create(
            company=self.company_b,
            user=self.user_b,
            salary=6000
        )
        
    def test_basic_migration(self):
        # 1. EmployeeRecord -> Employee migration
        # 2. EmployeeRecord -> Employment migration
        out = StringIO()
        call_command('migrate_hr_to_universal', stdout=out)
        
        self.record_a.refresh_from_db()
        self.assertIsNotNone(self.record_a.employee)
        
        emp_a = self.record_a.employee
        self.assertEqual(emp_a.company, self.company_a)
        self.assertEqual(emp_a.user, self.user_a)
        self.assertEqual(emp_a.crm_entity, self.crm_a)
        self.assertEqual(emp_a.department, self.dept_a)
        
        # Employment
        employment = Employment.objects.filter(employee=emp_a).first()
        self.assertIsNotNone(employment)
        self.assertEqual(employment.department, self.dept_a)
        
    def test_idempotency_and_duplicates(self):
        # 4. Duplicate prevention, 5. Migration idempotency, 20. Migration rerun
        out = StringIO()
        call_command('migrate_hr_to_universal', stdout=out)
        
        emp_count_before = Employee.objects.count()
        emp_mnt_count_before = Employment.objects.count()
        
        call_command('migrate_hr_to_universal', stdout=out)
        
        emp_count_after = Employee.objects.count()
        emp_mnt_count_after = Employment.objects.count()
        
        self.assertEqual(emp_count_before, emp_count_after)
        self.assertEqual(emp_mnt_count_before, emp_mnt_count_after)
        
    def test_dry_run(self):
        # 6. Dry-run behavior
        out = StringIO()
        try:
            call_command('migrate_hr_to_universal', dry_run=True, stdout=out)
        except Exception as e:
            self.assertEqual(str(e), "DRY RUN ROLLBACK")
            
        self.record_a.refresh_from_db()
        self.assertIsNone(self.record_a.employee)
        self.assertEqual(Employee.objects.count(), 0)

    def test_company_filtering(self):
        # 7. Company filtering
        out = StringIO()
        call_command('migrate_hr_to_universal', company=self.company_a.id, stdout=out)
        
        self.record_a.refresh_from_db()
        self.record_b.refresh_from_db()
        
        self.assertIsNotNone(self.record_a.employee)
        self.assertIsNone(self.record_b.employee)
        
    def test_cross_company_rejection(self):
        # 8. Cross-company rejection
        # Force a cross-company CRM reference (normally blocked by clean, but DB could have it)
        CRMEntity.objects.filter(id=self.crm_a.id).update(company=self.company_b)
        
        out = StringIO()
        call_command('migrate_hr_to_universal', stdout=out)
        
        # It should catch the cross-company and not migrate record_a
        self.record_a.refresh_from_db()
        self.assertIsNone(self.record_a.employee)
        
    def test_verification_command(self):
        # Migrate cleanly
        out = StringIO()
        call_command('migrate_hr_to_universal', stdout=out)
        
        # Verify
        verify_out = StringIO()
        # Should pass
        try:
            call_command('verify_hr_migration', stdout=verify_out)
        except SystemExit:
            self.fail("Verification command failed unexpectedly.")
            
        # Introduce a flaw (cross-company)
        self.record_a.refresh_from_db()
        emp = self.record_a.employee
        Employee.objects.filter(id=emp.id).update(company=self.company_b)
        
        with self.assertRaises(SystemExit):
            call_command('verify_hr_migration', stdout=verify_out)



