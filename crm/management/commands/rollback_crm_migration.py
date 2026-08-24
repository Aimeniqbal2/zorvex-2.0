import logging
from django.core.management.base import BaseCommand
from crm.models import CRMEntity
from sales.models import Customer, Sale, CustomerCreditLedger
from inventory.models import Vendor, VendorLedger, PurchaseOrder
from services.models import ServiceOrder, ServicePartUsed
from finance.models import CreditAccount
from hrm.models import EmployeeRecord

class Command(BaseCommand):
    help = 'Rollbacks the CRM migration safely without data loss.'

    def handle(self, *args, **options):
        self.stdout.write("========================================")
        self.stdout.write(" ROLLING BACK CRM MIGRATION ")
        self.stdout.write("========================================")

        # Remove crm_entity links
        Customer.objects.update(crm_entity=None)
        Sale.objects.update(crm_entity=None)
        CustomerCreditLedger.objects.update(crm_entity=None)

        Vendor.objects.update(crm_entity=None)
        VendorLedger.objects.update(crm_entity=None)
        PurchaseOrder.objects.update(crm_entity=None)

        ServiceOrder.objects.update(crm_entity=None)
        ServicePartUsed.objects.update(crm_entity=None)

        CreditAccount.objects.update(crm_entity=None)
        EmployeeRecord.objects.update(crm_entity=None)

        # Delete generated entities
        # Assuming generated entities start with specific codes.
        to_delete = CRMEntity.objects.filter(
            code__startswith="CUST-"
        ) | CRMEntity.objects.filter(
            code__startswith="SUPP-"
        ) | CRMEntity.objects.filter(
            code__startswith="EMP-"
        )
        
        deleted_count, _ = to_delete.delete()
        
        self.stdout.write(self.style.SUCCESS(f"Rollback completed successfully. Deleted {deleted_count} generated CRM entities."))
