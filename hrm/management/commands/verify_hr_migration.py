import logging
from django.core.management.base import BaseCommand
from hrm.models import EmployeeRecord, Employee, Employment, Attendance, WorkforceAttendance, EmployeeSalaryAssignment, PayrollRun

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = "Verify legacy HR data migration and check for data integrity issues."

    def add_arguments(self, parser):
        parser.add_argument('--company', type=int, help='Company ID to run the verification for.')

    def handle(self, *args, **options):
        company_id = options.get('company')

        self.stdout.write("========================================")
        self.stdout.write(" UNIVERSAL HR MIGRATION VERIFICATION ")
        self.stdout.write("========================================")
        
        warnings = []
        criticals = []

        # 1. EmployeeRecord without Universal Employee
        qs = EmployeeRecord.objects.all()
        if company_id:
            qs = qs.filter(company_id=company_id)
        
        for record in qs:
            if not record.employee_id:
                criticals.append(f"[CRITICAL] EmployeeRecord {record.id} (Company {record.company_id}) has no Universal Employee.")
            else:
                if record.employee.company_id != record.company_id:
                    criticals.append(f"[CRITICAL] EmployeeRecord {record.id} (Company {record.company_id}) linked to Employee {record.employee_id} from Company {record.employee.company_id}.")

        # 2. Employee without Employment where migration requires one
        emps = Employee.objects.all()
        if company_id:
            emps = emps.filter(company_id=company_id)
            
        for emp in emps:
            # Duplicate detection - Employee ↔ User
            if emp.user:
                dupes = Employee.objects.filter(user=emp.user).exclude(id=emp.id)
                if dupes.exists():
                    criticals.append(f"[CRITICAL] Employee {emp.id} and {dupes.first().id} share the same User {emp.user_id}.")
            
            # Employment checks
            emp_count = Employment.objects.filter(employee=emp).count()
            if emp_count == 0:
                warnings.append(f"[WARNING] Employee {emp.id} (Company {emp.company_id}) has no Employment record.")
            elif emp_count > 1:
                # Is there a duplicate active employment?
                active_count = Employment.objects.filter(employee=emp, employment_status='ACTIVE').count()
                if active_count > 1:
                    criticals.append(f"[CRITICAL] Employee {emp.id} has {active_count} active Employment records.")
            
            # CRM checks
            if emp.crm_entity_id and emp.crm_entity.company_id != emp.company_id:
                criticals.append(f"[CRITICAL] Employee {emp.id} linked to CRMEntity from a different company.")

        # 3. Legacy Attendance without WorkforceAttendance
        atts = Attendance.objects.all()
        if company_id:
            atts = atts.filter(company_id=company_id)
            
        for att in atts:
            if not att.workforce_attendance_id:
                warnings.append(f"[WARNING] Legacy Attendance {att.id} has no WorkforceAttendance bridge.")
            else:
                if att.workforce_attendance.company_id != att.company_id:
                    criticals.append(f"[CRITICAL] Cross-company attendance mapping for Attendance {att.id}.")

        # 4. Payroll Records pointing to invalid Employees
        runs = PayrollRun.objects.all()
        if company_id:
            runs = runs.filter(company_id=company_id)
            
        for run in runs:
            if run.journal_entry_id and run.journal_entry.company_id != run.company_id:
                criticals.append(f"[CRITICAL] PayrollRun {run.id} linked to Finance JournalEntry from different company.")
            for slip in run.payslips.all():
                if slip.employee.company_id != slip.company_id:
                    criticals.append(f"[CRITICAL] Payslip {slip.id} belongs to Employee from different company.")

        for msg in warnings:
            self.stdout.write(self.style.WARNING(msg))
        
        for msg in criticals:
            self.stdout.write(self.style.ERROR(msg))

        if criticals:
            self.stdout.write(self.style.ERROR(f"\nVerification FAILED with {len(criticals)} critical errors and {len(warnings)} warnings."))
            exit(1)
        else:
            self.stdout.write(self.style.SUCCESS(f"\nVerification PASSED with 0 critical errors and {len(warnings)} warnings."))
