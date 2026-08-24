import sys
from django.core.management.base import BaseCommand
from crm.models import CRMEntity
from sales.models import Customer, Sale, CustomerCreditLedger
from inventory.models import Vendor, VendorLedger, PurchaseOrder
from services.models import ServiceOrder, ServicePartUsed
from finance.models import CreditAccount
from hrm.models import EmployeeRecord

class Command(BaseCommand):
    help = 'Verifies the CRM migration.'

    def handle(self, *args, **options):
        self.stdout.write("========================================")
        self.stdout.write(" VERIFYING CRM MIGRATION ")
        self.stdout.write("========================================")

        errors = 0
        total_customers_migrated = 0
        total_customers_pending = 0
        total_vendors_migrated = 0
        total_employees_migrated = 0
        missing_entities = 0
        duplicate_codes = 0
        cross_company_violations = 0

        # Check Customers
        for c in Customer.objects.select_related('crm_entity'):
            if c.crm_entity:
                total_customers_migrated += 1
                if c.company_id != c.crm_entity.company_id:
                    cross_company_violations += 1
                    errors += 1
            else:
                total_customers_pending += 1
                missing_entities += 1
                errors += 1

        # Check Vendors
        for v in Vendor.objects.select_related('crm_entity'):
            if v.crm_entity:
                total_vendors_migrated += 1
                if v.company_id != v.crm_entity.company_id:
                    cross_company_violations += 1
                    errors += 1
            else:
                missing_entities += 1
                errors += 1

        # Check Employees
        for e in EmployeeRecord.objects.select_related('crm_entity'):
            if e.crm_entity:
                total_employees_migrated += 1
                if e.company_id != e.crm_entity.company_id:
                    cross_company_violations += 1
                    errors += 1
            else:
                missing_entities += 1
                errors += 1

        # Check Duplicate Codes
        codes = list(CRMEntity.objects.values_list('company_id', 'code'))
        if len(codes) != len(set(codes)):
            duplicate_codes += (len(codes) - len(set(codes)))
            errors += duplicate_codes

        # Task 2.4 - Broken Bridges
        valid_crm_ids = set(CRMEntity.objects.values_list('id', flat=True))
        total_broken_bridges = 0
        def check_bridges(queryset):
            nonlocal total_broken_bridges, errors
            for obj in queryset.iterator():
                if obj.crm_entity_id and obj.crm_entity_id not in valid_crm_ids:
                    total_broken_bridges += 1
                    errors += 1

        check_bridges(Customer.objects.all())
        check_bridges(Vendor.objects.all())
        check_bridges(EmployeeRecord.objects.all())
        check_bridges(Sale.objects.all())
        check_bridges(PurchaseOrder.objects.all())
        check_bridges(CustomerCreditLedger.objects.all())
        check_bridges(VendorLedger.objects.all())
        check_bridges(ServiceOrder.objects.all())
        check_bridges(ServicePartUsed.objects.all())
        check_bridges(CreditAccount.objects.all())

        # Task 2.1, 2.2, 2.3
        total_orphans = 0
        total_missing_primary_contacts = 0
        total_missing_addresses = 0
        warnings = 0
        total_contacts = 0
        total_addresses = 0

        entities = CRMEntity.objects.prefetch_related(
            'customer_set', 'vendor_set', 'employeerecord_set',
            'sale_set', 'purchaseorder_set', 'customercreditledger_set',
            'vendorledger_set', 'serviceorder_set', 'servicepartused_set',
            'creditaccount_set', 'contacts', 'addresses', 'communications',
            'outgoing_relationships', 'incoming_relationships', 'internal_notes', 'attachments'
        ).all()

        total_entities = 0
        for entity in entities:
            total_entities += 1
            c_set = list(entity.contacts.all())
            a_set = list(entity.addresses.all())
            total_contacts += len(c_set)
            total_addresses += len(a_set)

            has_legacy = bool(entity.customer_set.all() or entity.vendor_set.all() or entity.employeerecord_set.all())
            has_bridges = bool(
                entity.sale_set.all() or entity.purchaseorder_set.all() or
                entity.customercreditledger_set.all() or entity.vendorledger_set.all() or
                entity.serviceorder_set.all() or entity.servicepartused_set.all() or
                entity.creditaccount_set.all()
            )
            has_details = bool(
                c_set or a_set or
                entity.communications.all() or entity.outgoing_relationships.all() or
                entity.incoming_relationships.all() or entity.internal_notes.all() or
                entity.attachments.all()
            )

            if not has_legacy and not has_bridges and not has_details:
                total_orphans += 1
                warnings += 1

            if has_legacy:
                primary_contacts = [c for c in c_set if c.is_primary]
                if len(primary_contacts) != 1:
                    total_missing_primary_contacts += 1
                    errors += 1

            for vendor in entity.vendor_set.all():
                if vendor.address and str(vendor.address).strip():
                    if not a_set:
                        total_missing_addresses += 1
                        errors += 1

        self.stdout.write(f"CRM Entities: {total_entities}")
        self.stdout.write(f"Customers: {total_customers_migrated + total_customers_pending}")
        self.stdout.write(f"Vendors: {total_vendors_migrated}")
        self.stdout.write(f"Employees: {total_employees_migrated}")
        self.stdout.write(f"Contacts: {total_contacts}")
        self.stdout.write(f"Addresses: {total_addresses}")
        self.stdout.write(f"Broken Bridges: {total_broken_bridges}")
        self.stdout.write(f"Orphans: {total_orphans}")
        self.stdout.write(f"Warnings: {warnings}")

        if errors > 0 or total_missing_primary_contacts > 0 or total_missing_addresses > 0 or total_broken_bridges > 0:
            self.stdout.write(self.style.ERROR("FAIL: Integrity issues found."))
            sys.exit(1)
        else:
            self.stdout.write(self.style.SUCCESS("PASS: Migration completely verified."))
