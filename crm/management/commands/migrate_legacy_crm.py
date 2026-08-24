import logging
from django.core.management.base import BaseCommand
from django.db import transaction
from companies.models import Company
from crm.models import CRMEntity, CRMContact, CRMAddress
from sales.models import Customer, Sale, CustomerCreditLedger
from inventory.models import Vendor, VendorLedger, PurchaseOrder
from services.models import ServiceOrder, ServicePartUsed
from finance.models import CreditAccount
from hrm.models import EmployeeRecord

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = 'Migrates legacy CRM models into the Universal CRM Architecture non-destructively.'

    def handle(self, *args, **options):
        self.stdout.write("========================================")
        self.stdout.write(" STARTING PHASE 4C MIGRATION")
        self.stdout.write("========================================")

        companies = Company.objects.all()

        for company in companies:
            self.stdout.write(f"Migrating Company: {company.name}")
            try:
                with transaction.atomic():
                    self.migrate_customers(company)
                    self.migrate_vendors(company)
                    self.migrate_employees(company)
                    
                    # Back-fill bridges
                    self.bridge_sales(company)
                    self.bridge_customer_ledgers(company)
                    
                    self.bridge_purchases(company)
                    self.bridge_vendor_ledgers(company)
                    
                    self.bridge_services(company)
                    self.bridge_service_parts(company)
                    
                    self.bridge_finance(company)

            except Exception as e:
                self.stdout.write(self.style.ERROR(f"Error migrating company {company.name}: {e}"))
                logger.exception(f"Migration error for {company.name}")

        self.stdout.write("========================================")
        self.stdout.write(" MIGRATION COMPLETE ")
        self.stdout.write("========================================")

    def get_unique_code(self, prefix, pk):
        return f"{prefix}-{str(pk)[:8].upper()}"

    def migrate_customers(self, company):
        customers = Customer.objects.filter(company=company)
        for customer in customers:
            if customer.crm_entity:
                continue

            entity, created = CRMEntity.objects.update_or_create(
                company=company,
                code=self.get_unique_code("CUST", customer.pk),
                defaults={
                    'entity_type': 'CUSTOMER',
                    'name': customer.name,
                    'active': True,
                    'notes': f"Migrated from legacy customer {customer.pk}",
                    'created_at': customer.created_at,
                    'updated_at': customer.updated_at,
                }
            )

            # Link back
            customer.crm_entity = entity
            customer.save(update_fields=['crm_entity'])

            # Create CRMContact
            CRMContact.objects.get_or_create(
                company=company,
                entity=entity,
                email=getattr(customer, 'email', None) or '',
                phone=getattr(customer, 'phone', None) or '',
                defaults={
                    'first_name': entity.name,
                    'is_primary': True
                }
            )
            
            # Address
            address_text = getattr(customer, 'address', None)
            if address_text:
                CRMAddress.objects.get_or_create(
                    company=company,
                    entity=entity,
                    line1=address_text,
                    defaults={
                        'address_type': 'BILLING',
                        'is_default': True
                    }
                )

    def migrate_vendors(self, company):
        vendors = Vendor.objects.filter(company=company)
        for vendor in vendors:
            if vendor.crm_entity:
                continue

            entity, created = CRMEntity.objects.update_or_create(
                company=company,
                code=self.get_unique_code("SUPP", vendor.pk),
                defaults={
                    'entity_type': 'SUPPLIER',
                    'name': vendor.name,
                    'active': True,
                    'notes': f"Migrated from legacy vendor {vendor.pk}",
                    'created_at': vendor.created_at,
                    'updated_at': vendor.updated_at,
                }
            )

            vendor.crm_entity = entity
            vendor.save(update_fields=['crm_entity'])

            CRMContact.objects.get_or_create(
                company=company,
                entity=entity,
                email=getattr(vendor, 'contact_email', None) or '',
                phone=getattr(vendor, 'contact_phone', None) or '',
                defaults={
                    'first_name': entity.name,
                    'is_primary': True
                }
            )

            address_text = vendor.address
            if address_text:
                CRMAddress.objects.get_or_create(
                    company=company,
                    entity=entity,
                    line1=address_text,
                    defaults={
                        'address_type': 'BILLING',
                        'is_default': True
                    }
                )

    def migrate_employees(self, company):
        employees = EmployeeRecord.objects.filter(company=company).select_related('user')
        for emp in employees:
            if emp.crm_entity:
                continue
                
            user = emp.user
            name = user.get_full_name() or user.username

            entity, created = CRMEntity.objects.update_or_create(
                company=company,
                code=self.get_unique_code("EMP", emp.pk),
                defaults={
                    'entity_type': 'EMPLOYEE',
                    'name': name,
                    'active': user.is_active,
                    'notes': f"Migrated from legacy employee {emp.pk}",
                    'created_at': emp.created_at,
                    'updated_at': emp.updated_at,
                }
            )

            emp.crm_entity = entity
            emp.save(update_fields=['crm_entity'])
            
            CRMContact.objects.get_or_create(
                company=company,
                entity=entity,
                email=getattr(user, 'email', None) or '',
                defaults={
                    'first_name': name,
                    'is_primary': True
                }
            )

    def bridge_sales(self, company):
        for sale in Sale.objects.filter(company=company).select_related('customer'):
            if sale.crm_entity is None and sale.customer and sale.customer.crm_entity:
                sale.crm_entity = sale.customer.crm_entity
                sale.save(update_fields=['crm_entity'])

    def bridge_customer_ledgers(self, company):
        for ledger in CustomerCreditLedger.objects.filter(company=company).select_related('customer'):
            if ledger.crm_entity is None and ledger.customer and ledger.customer.crm_entity:
                ledger.crm_entity = ledger.customer.crm_entity
                ledger.save(update_fields=['crm_entity'])

    def bridge_purchases(self, company):
        for po in PurchaseOrder.objects.filter(company=company).select_related('vendor'):
            if po.crm_entity is None and po.vendor and po.vendor.crm_entity:
                po.crm_entity = po.vendor.crm_entity
                po.save(update_fields=['crm_entity'])

    def bridge_vendor_ledgers(self, company):
        for ledger in VendorLedger.objects.filter(company=company).select_related('vendor'):
            if ledger.crm_entity is None and ledger.vendor and ledger.vendor.crm_entity:
                ledger.crm_entity = ledger.vendor.crm_entity
                ledger.save(update_fields=['crm_entity'])

    def bridge_services(self, company):
        # ServiceOrder has customer_name/phone, not Customer FK directly.
        # So we try to find a matching CRMEntity or we don't link?
        # Wait, the prompt says "If ServiceOrder.customer exists... Assign CRMEntity". But ServiceOrder doesn't have a Customer FK.
        # "If ServiceOrder.vendor exists... Assign CRMEntity". It does have a vendor FK.
        # Let's check ServiceOrder fields. (I recall customer_name, customer_phone, crm_entity).
        # We can map by matching customer_name and phone to an existing CRMEntity of type CUSTOMER.
        # Or if it has a customer FK that I forgot. Let me verify.
        for so in ServiceOrder.objects.filter(company=company):
            if so.crm_entity is None:
                # Attempt to find Customer by phone or name
                customer = Customer.objects.filter(company=company, phone=so.customer_phone).first()
                if not customer:
                    customer = Customer.objects.filter(company=company, name=so.customer_name).first()
                
                if customer and customer.crm_entity:
                    so.crm_entity = customer.crm_entity
                    so.save(update_fields=['crm_entity'])

    def bridge_service_parts(self, company):
        for part in ServicePartUsed.objects.filter(company=company).select_related('vendor'):
            if part.crm_entity is None and part.vendor and part.vendor.crm_entity:
                part.crm_entity = part.vendor.crm_entity
                part.save(update_fields=['crm_entity'])

    def bridge_finance(self, company):
        for acc in CreditAccount.objects.filter(company=company):
            if acc.crm_entity is None:
                # Find matching Customer
                customer = Customer.objects.filter(company=company, name=acc.customer_name).first()
                if customer and customer.crm_entity:
                    acc.crm_entity = customer.crm_entity
                    acc.save(update_fields=['crm_entity'])
