"""
companies/management/commands/purge_company_data.py
Purges all operational, transactional, and demo records for a specified tenant,
while preserving the company entity, users, subscriptions, and module definitions.
"""
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.apps import apps
from companies.models import Company

# Strict dependency order (child/referencing models first, parent models last)
ORDERED_DELETION = [
    # 1. Billing
    'billing.ClientInvoiceLine',
    'billing.ClientInvoice',
    'billing.BillingSheetLine',
    'billing.BillingSheet',
    'billing.BillingPeriod',
    'billing.ServiceInvoiceLine',
    'billing.ServiceInvoice',

    # 2. Operations Activity & Inspections
    'operations.EmergencyEvent',
    'operations.OperationsEscalation',
    'operations.SupervisorInspection',
    'operations.IncidentReport',
    'operations.DailyOccurrenceLog',
    'operations.PatrolRun',
    'operations.PatrolPlan',
    'operations.SiteCheckpoint',

    # 3. Operations Equipment
    'operations.EquipmentIncident',
    'operations.EquipmentIssue',
    'operations.SecurityItemProfile',
    'operations.SecurityStoreProfile',

    # 4. Operations Rostering, Pay, & Sites
    'operations.DailyDutyPay',
    'operations.EmployeePayrollCalculation',
    'operations.DutyReplacement',
    'operations.DutyAssignment',
    'operations.DutyRoster',
    'operations.PostShiftRequirement',
    'operations.Deployment',
    'operations.SecurityPost',
    'operations.ContractRate',
    'operations.ServiceContract',
    'operations.InspectionPolicy',
    'operations.OperationalSite',

    # 5. Purchasing
    'purchasing.ProcurementAuditTrail',
    'purchasing.ApprovalHistory',
    'purchasing.ProcurementLine',
    'purchasing.ProcurementDocument',
    'purchasing.Vendor',

    # 6. Security CRM
    'security_crm.AssessmentEquipmentRecommendation',
    'security_crm.AssessmentStaffingRecommendation',
    'security_crm.AssessmentRiskFinding',
    'security_crm.SecurityAssessment',
    'security_crm.ProposalServiceLine',
    'security_crm.ProposalVersion',
    'security_crm.SecurityProposal',
    'security_crm.ClientLocation',
    'security_crm.SecurityServiceType',

    # 7. CRM
    'crm.CRMContact',
    'crm.CRMEntityRole',
    'crm.CRMEntity',

    # 8. HRM
    'hrm.WorkforceAttendance',
    'hrm.EmploymentHistory',
    'hrm.EmployeeTraining',
    'hrm.EmployeeDocument',
    'hrm.EmployeeNextOfKin',
    'hrm.Employee',
    'hrm.Shift',
    'hrm.SalaryComponent',
    'hrm.Designation',
    'hrm.Department',

    # 9. Inventory
    'inventory.ItemSerial',
    'inventory.InventoryBalance',
    'inventory.Item',
    'inventory.Category',

    # 10. Finance
    'finance.JournalEntryLine',
    'finance.JournalEntry',
    'finance.Journal',
    'finance.AccountingPeriod',
    'finance.FiscalYear',
    'finance.ChartOfAccount',
    'finance.SecurityFinanceConfiguration',

    # 11. Platform Core
    'platform_core.Warehouse',
    'platform_core.DocumentSequence',
]

EXCLUDE_MODELS = {
    'companies.Company',
    'accounts.User',
    'subscriptions.CompanySubscription',
    'platform_core.CompanyModule',
}


class Command(BaseCommand):
    help = 'Purges all demo/operational data for a given tenant company while preserving the company, users, and subscriptions.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--company',
            type=str,
            default='One Security',
            help='Company name or ID to purge demo data from (default: "One Security")',
        )
        parser.add_argument(
            '--confirm',
            action='store_true',
            help='Actually execute the deletion. Without this flag, runs in dry-run mode.',
        )

    def handle(self, *args, **options):
        company_query = options['company']
        confirm = options['confirm']

        try:
            company = Company.objects.get(name__icontains=company_query)
        except Company.DoesNotExist:
            raise CommandError(f"Company matching '{company_query}' was not found.")
        except Company.MultipleObjectsReturned:
            raise CommandError(f"Multiple companies match '{company_query}'. Please provide exact name or UUID.")

        self.stdout.write(self.style.WARNING(f"\nTarget Tenant: {company.name} [{company.id}]"))

        if not confirm:
            self.stdout.write(self.style.NOTICE("MODE: DRY RUN (no data will be modified. Add --confirm to execute)\n"))
        else:
            self.stdout.write(self.style.SUCCESS("MODE: LIVE DELETION\n"))

        with transaction.atomic():
            total_deleted = 0
            for model_label in ORDERED_DELETION:
                app_label, model_name = model_label.split('.')
                try:
                    model = apps.get_model(app_label, model_name)
                except LookupError:
                    continue

                fields = [f.name for f in model._meta.fields]
                if 'company' in fields:
                    qs = model.objects.filter(company=company)
                else:
                    qs = model.objects.filter(company_id=company.id)

                cnt = qs.count()
                if cnt > 0:
                    del_res = qs.delete()
                    total_deleted += del_res[0]
                    self.stdout.write(f"  - Deleted {model_label}: {del_res[0]} records")

            # Check if any other unlisted models still hold company data
            remaining = 0
            for model in apps.get_models():
                label = f"{model._meta.app_label}.{model.__name__}"
                if label in EXCLUDE_MODELS:
                    continue
                fields = [f.name for f in model._meta.fields]
                if 'company' in fields:
                    c = model.objects.filter(company=company).count()
                    if c > 0:
                        self.stdout.write(self.style.WARNING(f"  - WARNING: {label} still has {c} records!"))
                        remaining += c

            if not confirm:
                transaction.set_rollback(True)
                self.stdout.write(self.style.NOTICE(f"\n[DRY RUN COMPLETE] Total {total_deleted} demo records would be deleted."))
                self.stdout.write("To permanently apply, re-run with: python manage.py purge_company_data --confirm\n")
            else:
                self.stdout.write(self.style.SUCCESS(f"\n[SUCCESS] Successfully purged {total_deleted} demo records from {company.name}!"))
                if remaining > 0:
                    self.stdout.write(self.style.WARNING(f"Note: {remaining} unlisted records remained."))
                else:
                    self.stdout.write(self.style.SUCCESS("Database for this company is now completely clean and ready for real data.\n"))
