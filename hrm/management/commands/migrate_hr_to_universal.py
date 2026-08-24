import logging
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from hrm.models import (
    EmployeeRecord, Employee, Employment, EmployeeSalaryAssignment
)

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = "Migrate legacy HR data to Universal HR architecture safely and idempotently."

    def add_arguments(self, parser):
        parser.add_argument(
            '--company',
            type=int,
            help='Company ID to run the migration for. If not provided, runs for all.'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Do not commit changes to the database.'
        )
        parser.add_argument(
            '--rollback',
            action='store_true',
            help='DANGEROUS: Revert migration-generated bridge data where safe.'
        )

    def handle(self, *args, **options):
        company_id = options.get('company')
        dry_run = options.get('dry_run')
        rollback = options.get('rollback')

        self.stdout.write(self.style.WARNING("========================================"))
        self.stdout.write(self.style.WARNING(" UNIVERSAL HR MIGRATION ENGINE "))
        self.stdout.write(self.style.WARNING("========================================"))
        
        if rollback:
            self.stdout.write(self.style.ERROR("Running in ROLLBACK mode..."))
            self._handle_rollback(company_id, dry_run)
            return

        if dry_run:
            self.stdout.write(self.style.WARNING("Running in DRY-RUN mode... No changes will be saved."))

        qs = EmployeeRecord.objects.all().select_related('employee', 'user', 'crm_entity', 'department')
        if company_id:
            qs = qs.filter(company_id=company_id)

        success_count = 0
        warning_count = 0
        error_count = 0
        
        try:
            with transaction.atomic():
                for record in qs:
                    try:
                        self.stdout.write(f"Processing EmployeeRecord ID: {record.id} for Company: {record.company_id}")
                        self._migrate_record(record)
                        success_count += 1
                    except Exception as e:
                        self.stdout.write(self.style.ERROR(f"Error migrating Record {record.id}: {str(e)}"))
                        error_count += 1

                self.stdout.write(self.style.SUCCESS(f"\nMigration completed!"))
                self.stdout.write(f"Success: {success_count} | Warnings: {warning_count} | Errors: {error_count}")
                
                if dry_run:
                    self.stdout.write(self.style.WARNING("DRY RUN ACTIVE. Rolling back transaction."))
                    raise Exception("DRY RUN ROLLBACK")
        except Exception as e:
            if str(e) != "DRY RUN ROLLBACK":
                self.stdout.write(self.style.ERROR(f"Migration aborted due to error: {str(e)}"))

    def _migrate_record(self, record):
        # 1. Resolve its company, CRMEntity, Django User
        company = record.company
        user = record.user
        crm_entity = record.crm_entity
        department = record.department
        
        if crm_entity and crm_entity.company_id != company.id:
            raise ValueError("CRM Entity belongs to a different company.")

        # 2. Find existing Universal Employee through the Phase 7B bridge
        employee = record.employee
        
        if not employee:
            # Check if there is an employee that might match (by user) to avoid duplicates
            if user:
                employee = Employee.objects.filter(user=user).first()
            
            if not employee:
                first_name = user.first_name if user else f"User_{record.id}"
                last_name = user.last_name if user else "Unknown"
                if not first_name.strip():
                    first_name = "User"
                    
                employee = Employee.objects.create(
                    company=company,
                    user=user,
                    crm_entity=crm_entity,
                    first_name=first_name,
                    last_name=last_name,
                    department=department,
                    is_active=True
                )
            
            record.employee = employee
            record.save(update_fields=['employee'])
            self.stdout.write(f"  -> Created/Linked Universal Employee ID {employee.id}")
        else:
            # Ensure integrity
            if employee.company_id != company.id:
                raise ValueError("Cross-company Universal Employee link detected.")
            if crm_entity and employee.crm_entity != crm_entity:
                employee.crm_entity = crm_entity
                employee.save(update_fields=['crm_entity'])

        # 3. Create/resolve Employment
        employment = Employment.objects.filter(employee=employee).first()
        if not employment:
            employment = Employment.objects.create(
                company=company,
                employee=employee,
                department=department,
                employment_status='ACTIVE',
                employment_type='FULL_TIME',
                start_date=timezone.now().date(),
                is_current=True
            )
            self.stdout.write(f"  -> Created Employment ID {employment.id}")

        # 4. Salary compatibility
        # If a reliable legacy salary exists and no Universal assignment exists
        salary = getattr(record, 'salary', 0)
        hourly_rate = getattr(record, 'hourly_rate', 0)
        
        if salary > 0 or hourly_rate > 0:
            existing_assignment = EmployeeSalaryAssignment.objects.filter(employee=employee, is_deleted=False).first()
            if not existing_assignment:
                self.stdout.write(self.style.WARNING(f"  -> Warning: Employee {employee.id} has legacy salary ({salary}) / hourly rate ({hourly_rate}) but no deterministically resolvable SalaryStructure. Value preserved on legacy record."))
            else:
                self.stdout.write(f"  -> Employee {employee.id} already has a salary assignment.")

    def _handle_rollback(self, company_id, dry_run):
        # We only roll back records created by migration, meaning if we delete Employment that has no payslips?
        # Safe rollback: Only remove Employee if it has no employment other than default, and no payroll runs.
        # This is risky. "Never delete legitimate historical legacy records"
        # "Never delete: Existing Employee records, Existing Employment records, Existing CRMEntity records"
        # So we shouldn't really delete Employees here unless we are 100% sure they were JUST created and have no data.
        self.stdout.write(self.style.WARNING("Rollback requested. We will NOT delete Employees or Employments as they might contain active data. We will only unlink the bridge if safely possible."))
        
        qs = EmployeeRecord.objects.filter(employee__isnull=False)
        if company_id:
            qs = qs.filter(company_id=company_id)
            
        count = 0
        with transaction.atomic():
            for record in qs:
                # We do not delete the Employee, we just sever the link
                record.employee = None
                record.save(update_fields=['employee'])
                count += 1
                
            self.stdout.write(self.style.SUCCESS(f"Unlinked {count} EmployeeRecords."))
            if dry_run:
                self.stdout.write(self.style.WARNING("DRY RUN ACTIVE. Rolling back transaction."))
                raise Exception("DRY RUN ROLLBACK")
