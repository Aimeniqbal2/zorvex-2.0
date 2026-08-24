import sys
from django.core.management.base import BaseCommand
from purchasing.models import ProcurementDocument, ProcurementLine
from inventory.models import PurchaseOrder, PurchaseOrderItem, VendorLedger
from services.models import ServicePartUsed


class Command(BaseCommand):
    help = 'Verifies the integrity, completeness, and safety of the Universal Procurement migration.'

    def handle(self, *args, **options):
        self.stdout.write("========================================")
        self.stdout.write(" VERIFYING PROCUREMENT MIGRATION ")
        self.stdout.write("========================================")

        errors = 0
        warnings = 0

        valid_doc_choices = dict(ProcurementDocument.STATUS_CHOICES)
        valid_doc_ids = set(ProcurementDocument.objects.values_list('id', flat=True))
        valid_line_ids = set(ProcurementLine.objects.values_list('id', flat=True))

        # Check 1: Purchase Order Bridge Coverage & Tenant Isolation
        po_total = 0
        po_unbridged = 0
        po_cross_company = 0
        for po in PurchaseOrder.objects.select_related('procurement_document').iterator():
            po_total += 1
            if not po.procurement_document_id:
                po_unbridged += 1
                errors += 1
                self.stdout.write(self.style.ERROR(f"Error: PurchaseOrder #{po.id} missing procurement_document bridge."))
            elif po.procurement_document_id not in valid_doc_ids:
                errors += 1
                self.stdout.write(self.style.ERROR(f"Error: PurchaseOrder #{po.id} has broken procurement_document FK."))
            elif po.company_id != po.procurement_document.company_id:
                po_cross_company += 1
                errors += 1
                self.stdout.write(self.style.ERROR(f"Error: PurchaseOrder #{po.id} cross-company match with ProcurementDocument #{po.procurement_document_id}."))

        # Check 2: Purchase Order Item Bridge Coverage & Line Integrity
        poi_total = 0
        poi_unbridged = 0
        poi_cross_company = 0
        line_doc_mismatch = 0
        for poi in PurchaseOrderItem.objects.select_related('procurement_line', 'purchase_order__procurement_document').iterator():
            poi_total += 1
            if not poi.procurement_line_id:
                poi_unbridged += 1
                errors += 1
                self.stdout.write(self.style.ERROR(f"Error: PurchaseOrderItem #{poi.id} missing procurement_line bridge."))
            elif poi.procurement_line_id not in valid_line_ids:
                errors += 1
                self.stdout.write(self.style.ERROR(f"Error: PurchaseOrderItem #{poi.id} has broken procurement_line FK."))
            elif poi.company_id != poi.procurement_line.company_id:
                poi_cross_company += 1
                errors += 1
                self.stdout.write(self.style.ERROR(f"Error: PurchaseOrderItem #{poi.id} cross-company match with ProcurementLine #{poi.procurement_line_id}."))
            else:
                po_doc_id = poi.purchase_order.procurement_document_id if poi.purchase_order else None
                if po_doc_id and poi.procurement_line.document_id != po_doc_id:
                    line_doc_mismatch += 1
                    errors += 1
                    self.stdout.write(self.style.ERROR(f"Error: PurchaseOrderItem #{poi.id} line document mismatch."))

        # Check 3: CRM Links on ProcurementDocument
        doc_no_crm = 0
        doc_crm_cross = 0
        invalid_status_cnt = 0
        for doc in ProcurementDocument.objects.select_related('crm_entity').iterator():
            if not doc.crm_entity_id:
                doc_no_crm += 1
                errors += 1
                self.stdout.write(self.style.ERROR(f"Error: ProcurementDocument #{doc.id} ({doc.number}) missing CRMEntity."))
            elif doc.company_id != doc.crm_entity.company_id:
                doc_crm_cross += 1
                errors += 1
                self.stdout.write(self.style.ERROR(f"Error: ProcurementDocument #{doc.id} cross-company CRMEntity reference."))

            if doc.status not in valid_doc_choices:
                invalid_status_cnt += 1
                errors += 1
                self.stdout.write(self.style.ERROR(f"Error: ProcurementDocument #{doc.id} invalid status '{doc.status}'."))

        # Check 4: Item Links on ProcurementLine (Never Product)
        line_no_item = 0
        line_item_cross = 0
        for line in ProcurementLine.objects.select_related('item').iterator():
            if not line.item_id:
                line_no_item += 1
                errors += 1
                self.stdout.write(self.style.ERROR(f"Error: ProcurementLine #{line.id} missing Item reference."))
            elif line.company_id != line.item.company_id:
                line_item_cross += 1
                errors += 1
                self.stdout.write(self.style.ERROR(f"Error: ProcurementLine #{line.id} cross-company Item reference."))

        # Check 5: VendorLedger Bridges
        vl_total = 0
        vl_unbridged = 0
        for vl in VendorLedger.objects.select_related('procurement_document').iterator():
            vl_total += 1
            if vl.procurement_document_id:
                if vl.procurement_document_id not in valid_doc_ids:
                    errors += 1
                    self.stdout.write(self.style.ERROR(f"Error: VendorLedger #{vl.id} broken procurement_document FK."))
                elif vl.company_id != vl.procurement_document.company_id:
                    errors += 1
                    self.stdout.write(self.style.ERROR(f"Error: VendorLedger #{vl.id} cross-company procurement_document reference."))
            else:
                vl_unbridged += 1
                warnings += 1

        # Check 6: ServicePartUsed Bridges
        sp_total = 0
        sp_unbridged = 0
        for sp in ServicePartUsed.objects.select_related('procurement_line').iterator():
            sp_total += 1
            if sp.procurement_line_id:
                if sp.procurement_line_id not in valid_line_ids:
                    errors += 1
                    self.stdout.write(self.style.ERROR(f"Error: ServicePartUsed #{sp.id} broken procurement_line FK."))
                elif sp.company_id != sp.procurement_line.company_id:
                    errors += 1
                    self.stdout.write(self.style.ERROR(f"Error: ServicePartUsed #{sp.id} cross-company procurement_line reference."))
            else:
                sp_unbridged += 1

        self.stdout.write("========================================")
        self.stdout.write(" PROCUREMENT MIGRATION VERIFICATION ")
        self.stdout.write("========================================")
        self.stdout.write(f"Purchase Orders: Total={po_total}, Unbridged={po_unbridged}")
        self.stdout.write(f"Purchase Order Items: Total={poi_total}, Unbridged={poi_unbridged}")
        self.stdout.write(f"Vendor Ledgers: Total={vl_total}, Unbridged={vl_unbridged}")
        self.stdout.write(f"Service Parts Used: Total={sp_total}, Unbridged={sp_unbridged}")
        self.stdout.write(f"Documents Missing CRM: {doc_no_crm}")
        self.stdout.write(f"Lines Missing Item: {line_no_item}")
        self.stdout.write(f"Cross-Company Breaches: {po_cross_company + poi_cross_company + doc_crm_cross + line_item_cross}")
        self.stdout.write(f"Invalid Status Count: {invalid_status_cnt}")
        self.stdout.write(f"Total Errors: {errors}")
        self.stdout.write(f"Total Warnings: {warnings}")

        if errors > 0:
            self.stdout.write(self.style.ERROR("FAIL: Procurement migration verification failed."))
            sys.exit(1)
        else:
            self.stdout.write(self.style.SUCCESS("PASS: Universal Purchasing migration verified successfully."))
