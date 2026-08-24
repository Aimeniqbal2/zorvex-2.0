from django.core.management.base import BaseCommand
from django.apps import apps

class Command(BaseCommand):
    help = 'Audits the CRM Compatibility Bridge.'

    def handle(self, *args, **options):
        self.stdout.write("==================================================")
        self.stdout.write(" CRM COMPATIBILITY BRIDGE AUDIT")
        self.stdout.write("==================================================")

        models_to_check = [
            ('sales', 'Customer'),
            ('sales', 'CustomerCreditLedger'),
            ('sales', 'Sale'),
            ('inventory', 'Vendor'),
            ('inventory', 'VendorLedger'),
            ('inventory', 'PurchaseOrder'),
            ('services', 'ServiceOrder'),
            ('services', 'ServicePartUsed'),
            ('finance', 'CreditAccount'),
            ('hrm', 'EmployeeRecord'),
        ]

        total_invalid_company = 0
        total_missing = 0
        total_valid = 0

        for app_label, model_name in models_to_check:
            try:
                model = apps.get_model(app_label, model_name)
            except LookupError:
                continue

            invalid_company = 0
            missing = 0
            valid = 0
            
            for obj in model.objects.select_related('crm_entity').all():
                if obj.crm_entity is None:
                    missing += 1
                elif getattr(obj, 'company_id', None) != getattr(obj.crm_entity, 'company_id', None):
                    invalid_company += 1
                else:
                    valid += 1
            
            total_invalid_company += invalid_company
            total_missing += missing
            total_valid += valid

            self.stdout.write(f"--- {app_label}.{model_name} ---")
            self.stdout.write(f"Valid bridge references: {valid}")
            self.stdout.write(f"Missing CRMEntity: {missing}")
            self.stdout.write(f"Cross-company violations: {invalid_company}")
            self.stdout.write("")
        
        self.stdout.write("==================================================")
        self.stdout.write(f"Total Valid: {total_valid}")
        self.stdout.write(f"Total Missing: {total_missing}")
        self.stdout.write(f"Total Violations: {total_invalid_company}")
        if total_invalid_company > 0:
            self.stdout.write(self.style.ERROR("FAIL: Cross-company boundaries violated."))
        else:
            self.stdout.write(self.style.SUCCESS("PASS: No cross-company boundary violations."))
        self.stdout.write("==================================================")
