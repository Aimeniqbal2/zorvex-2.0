import re
from decimal import Decimal
from datetime import date
from django.core.management.base import BaseCommand
from django.db import transaction

from companies.models import Company
from crm.models import CRMEntity
from crm.services.compatibility import get_crm_entity
from inventory.models import PurchaseOrder, PurchaseOrderItem, VendorLedger, Item
from inventory.services.compatibility import resolve_item_from_product
from services.models import ServicePartUsed
from purchasing.models import (
    ProcurementDocument, ProcurementLine, ProcurementNote, ProcurementAuditTrail
)

STATUS_MAPPING = {
    'DRAFT': 'DRAFT',
    'PENDING': 'DRAFT',
    'ORDERED': 'APPROVED',
    'APPROVED': 'APPROVED',
    'RECEIVED': 'RECEIVED',
    'CANCELLED': 'CANCELLED',
    'CLOSED': 'CLOSED',
}


class Command(BaseCommand):
    help = 'Migrates legacy PurchaseOrder and PurchaseOrderItem records into Universal Procurement models.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Simulate migration without committing changes to database.',
        )
        parser.add_argument(
            '--company-id',
            type=int,
            help='Migrate only a specific company by ID.',
        )

    def handle(self, *args, **options):
        dry_run = options.get('dry_run', False)
        company_id = options.get('company_id')

        self.stdout.write("========================================")
        self.stdout.write(f" STARTING PROCUREMENT MIGRATION (Dry Run: {dry_run})")
        self.stdout.write("========================================")

        if company_id:
            companies = Company.objects.filter(id=company_id)
        else:
            companies = Company.objects.all()

        total_pos_migrated = 0
        total_pois_migrated = 0
        total_ledgers_bridged = 0
        total_parts_bridged = 0

        for company in companies:
            self.stdout.write(f"Migrating Company: {company.name} (ID: {company.id})")
            
            try:
                with transaction.atomic():
                    pos_count, pois_count, vl_count, sp_count = self._migrate_company(company, dry_run)
                    
                    total_pos_migrated += pos_count
                    total_pois_migrated += pois_count
                    total_ledgers_bridged += vl_count
                    total_parts_bridged += sp_count

                    if dry_run:
                        transaction.set_rollback(True)
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"Error migrating company {company.name}: {str(e)}"))
                if not dry_run:
                    raise e

        self.stdout.write("========================================")
        self.stdout.write(" PROCUREMENT MIGRATION SUMMARY ")
        self.stdout.write("========================================")
        self.stdout.write(f"Purchase Orders Migrated: {total_pos_migrated}")
        self.stdout.write(f"Purchase Order Items Migrated: {total_pois_migrated}")
        self.stdout.write(f"Vendor Ledgers Bridged: {total_ledgers_bridged}")
        self.stdout.write(f"Service Parts Bridged: {total_parts_bridged}")
        self.stdout.write(self.style.SUCCESS("Procurement migration process completed."))

    def _migrate_company(self, company, dry_run):
        pos = PurchaseOrder.objects.filter(company=company).select_related(
            'vendor', 'vendor__crm_entity', 'crm_entity'
        ).prefetch_related(
            'items', 'items__product', 'items__item'
        )

        pos_count = 0
        pois_count = 0

        for po in pos:
            pos_count += 1

            # 1. Resolve CRM Entity
            crm_obj = get_crm_entity(po) or (po.vendor and get_crm_entity(po.vendor))
            if not crm_obj and po.vendor:
                crm_obj = CRMEntity.objects.filter(company=company, name=po.vendor.name).first()
                if not crm_obj:
                    crm_obj = CRMEntity.objects.create(
                        company=company,
                        name=po.vendor.name,
                        code=f"SUPP-{po.vendor.id}",
                        entity_type="SUPPLIER"
                    )
                po.vendor.crm_entity = crm_obj
                po.vendor.save(update_fields=['crm_entity'])

            status_mapped = STATUS_MAPPING.get(str(po.status).upper(), 'DRAFT')
            doc_number = f"PROC-PO-{po.id}"
            doc_date = po.created_at.date() if getattr(po, 'created_at', None) else date.today()

            # 2. Create or Update ProcurementDocument
            proc_doc, _ = ProcurementDocument.objects.update_or_create(
                company=company,
                number=doc_number,
                defaults={
                    'document_type': 'PURCHASE_ORDER',
                    'status': status_mapped,
                    'document_date': doc_date,
                    'total_amount': po.total_amount,
                    'subtotal_amount': po.total_amount,
                    'crm_entity': crm_obj,
                    'notes': po.notes or "",
                }
            )

            # Bridge PurchaseOrder
            if po.procurement_document_id != proc_doc.id:
                po.procurement_document = proc_doc
                po.save(update_fields=['procurement_document'])

            # 3. Create or Update ProcurementLines
            line_idx = 1
            for poi in po.items.all():
                pois_count += 1
                item_obj = poi.item
                if not item_obj and poi.product:
                    item_obj = resolve_item_from_product(poi.product)
                if not item_obj and poi.product:
                    item_obj = Item.objects.filter(company=company, item_code=f"LEGACY-PROD-{poi.product.id}").first()
                    if not item_obj:
                        item_obj = Item.objects.create(
                            company=company,
                            name=f"{poi.product.brand} {poi.product.model_name}".strip(),
                            item_code=f"LEGACY-PROD-{poi.product.id}",
                            sku=f"SKU-PROD-{poi.product.id}",
                            item_type="PRODUCT"
                        )

                description = ""
                if poi.product:
                    description = f"{poi.product.brand} {poi.product.model_name}".strip()
                elif item_obj:
                    description = item_obj.name

                unit_cost = poi.unit_cost if poi.unit_cost is not None else Decimal('0.00')
                qty = poi.quantity if poi.quantity is not None else Decimal('0.00')
                tot_amount = (qty * unit_cost).quantize(Decimal('0.01'))

                proc_line, _ = ProcurementLine.objects.update_or_create(
                    document=proc_doc,
                    line_number=line_idx,
                    defaults={
                        'company': company,
                        'item': item_obj,
                        'quantity': qty,
                        'unit_price': unit_cost,
                        'total_amount': tot_amount,
                        'description': description,
                    }
                )

                if poi.procurement_line_id != proc_line.id:
                    poi.procurement_line = proc_line
                    poi.save(update_fields=['procurement_line'])

                line_idx += 1

            # 4. Procurement Notes
            if po.notes and po.notes.strip():
                ProcurementNote.objects.get_or_create(
                    company=company,
                    document=proc_doc,
                    text=po.notes.strip(),
                    defaults={'note_type': 'INTERNAL'}
                )

            # 5. Procurement Audit Trail
            audit_detail = f"Migrated from legacy PurchaseOrder #{po.id}"
            ProcurementAuditTrail.objects.get_or_create(
                company=company,
                document=proc_doc,
                details=audit_detail,
                defaults={'event': 'CREATED'}
            )

        # 6. Backfill VendorLedger procurement_document
        vl_count = 0
        for vl in VendorLedger.objects.filter(company=company, procurement_document__isnull=True).iterator():
            match = re.search(r'PO-([a-fA-F0-9\-]+)', vl.reference or "")
            if match:
                po_id_str = match.group(1)
                proc_doc = ProcurementDocument.objects.filter(company=company, number=f"PROC-PO-{po_id_str}").first()
                if not proc_doc:
                    proc_doc = ProcurementDocument.objects.filter(company=company, number__icontains=po_id_str).first()
                if proc_doc:
                    vl.procurement_document = proc_doc
                    vl.save(update_fields=['procurement_document'])
                    vl_count += 1

        # 7. Backfill ServicePartUsed procurement_line
        sp_count = 0
        for sp in ServicePartUsed.objects.filter(company=company, procurement_line__isnull=True, source='vendor').select_related('vendor', 'vendor__crm_entity').iterator():
            if sp.item and sp.vendor and getattr(sp.vendor, 'crm_entity', None):
                proc_line = ProcurementLine.objects.filter(
                    company=company,
                    item=sp.item,
                    document__crm_entity=sp.vendor.crm_entity
                ).first()
                if proc_line:
                    sp.procurement_line = proc_line
                    sp.save(update_fields=['procurement_line'])
                    sp_count += 1

        return pos_count, pois_count, vl_count, sp_count
