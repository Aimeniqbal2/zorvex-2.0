import sys
from django.core.management.base import BaseCommand
from hrm.models import PayrollRun
from hrm.services.payroll_calculation import calculate_payroll_for_run, PayrollCalculationError

class Command(BaseCommand):
    help = 'Calculates payroll for a given PayrollRun ID'

    def add_arguments(self, parser):
        parser.add_argument('payroll_run_id', type=str, help='UUID of the PayrollRun to calculate')
        parser.add_argument('--user_id', type=str, help='UUID of the user performing the calculation (optional)')

    def handle(self, *args, **options):
        run_id = options['payroll_run_id']
        user_id = options.get('user_id')
        
        try:
            payroll_run = PayrollRun.objects.get(id=run_id, is_deleted=False)
        except PayrollRun.DoesNotExist:
            self.stdout.write(self.style.ERROR(f"PayrollRun with ID {run_id} not found."))
            sys.exit(1)
            
        company_id = payroll_run.company_id
        
        if not user_id:
            # Fallback for management command
            from django.contrib.auth import get_user_model
            User = get_user_model()
            admin_user = User.objects.filter(company_id=company_id, is_superuser=True).first()
            if admin_user:
                user_id = admin_user.id
            else:
                self.stdout.write(self.style.ERROR("No user_id provided and no superuser found for company."))
                sys.exit(1)
        
        self.stdout.write(f"Calculating payroll for Run {payroll_run.run_number} (Company {company_id})")
        
        try:
            results = calculate_payroll_for_run(company_id, run_id, user_id)
            self.stdout.write(self.style.SUCCESS(f"Successfully processed {results['success']} employees."))
            if results['errors']:
                self.stdout.write(self.style.WARNING("Encountered the following errors:"))
                for err in results['errors']:
                    self.stdout.write(self.style.WARNING(f"- {err}"))
        except PayrollCalculationError as e:
            self.stdout.write(self.style.ERROR(f"Calculation Error: {str(e)}"))
            sys.exit(1)
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Unexpected Error: {str(e)}"))
            sys.exit(1)
