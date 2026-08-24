import sys
from django.core.management.base import BaseCommand
from purchasing.models import ProcurementDocument, ProcurementLine
from inventory.models import PurchaseOrder, PurchaseOrderItem, VendorLedger
from services.models import ServicePartUsed


class Command(BaseCommand):
    help = 'Audits the procurement bridge coverage, integrity, and cross-company constraints.'

    def handle(self, *args, **options):
        self.stdout.write("========================================")
        self.stdout.write(" AUDITING PROCUREMENT BRIDGES ")
        self.stdout.write("========================================")

        errors = 0
        warnings = 0

        valid_doc_ids = set(ProcurementDocument.objects.values_list('id', flat=True))
        valid_line_ids = set(ProcurementLine.objects.values_list('id', flat=True))

        po_total = 0
        po_bridged = 0
        po_missing = 0
        po_broken = 0
        po_cross_company = 0

        for po in PurchaseOrder.objects.select_related('procurement_document').iterator():
            po_total += 1
            if po.procurement_document_id:
                if po.procurement_document_id not in valid_doc_ids:
                    po_broken += 1
                    errors += 1
                else:
                    po_bridged += 1
                    if po.company_id != po.procurement_document.company_id:
                        po_cross_company += 1
                        errors += 1
            else:
                po_missing += 1
                warnings += 1

        poi_total = 0
        poi_bridged = 0
        poi_missing = 0
        poi_broken = 0
        poi_cross_company = 0
        line_mismatches = 0

        for poi in PurchaseOrderItem.objects.select_related('procurement_line', 'purchase_order__procurement_document').iterator():
            poi_total += 1
            if poi.procurement_line_id:
                if poi.procurement_line_id not in valid_line_ids:
                    poi_broken += 1
                    errors += 1
                else:
                    poi_bridged += 1
                    if poi.company_id != poi.procurement_line.company_id:
                        poi_cross_company += 1
                        errors += 1
                    
                    po_doc = poi.purchase_order.procurement_document if poi.purchase_order else None
                    if po_doc and poi.procurement_line.document_id != po_doc.id:
                        line_mismatches += 1
                        errors += 1
            else:
                poi_missing += 1
                warnings += 1

        vl_total = 0
        vl_bridged = 0
        vl_missing = 0
        vl_broken = 0
        vl_cross_company = 0

        for vl in VendorLedger.objects.select_related('procurement_document').iterator():
            vl_total += 1
            if vl.procurement_document_id:
                if vl.procurement_document_id not in valid_doc_ids:
                    vl_broken += 1
                    errors += 1
                else:
                    vl_bridged += 1
                    if vl.company_id != vl.procurement_document.company_id:
                        vl_cross_company += 1
                        errors += 1
            else:
                vl_missing += 1
                warnings += 1

        sp_total = 0
        sp_bridged = 0
        sp_missing = 0
        sp_broken = 0
        sp_cross_company = 0

        for sp in ServicePartUsed.objects.select_related('procurement_line').iterator():
            sp_total += 1
            if sp.procurement_line_id:
                if sp.procurement_line_id not in valid_line_ids:
                    sp_broken += 1
                    errors += 1
                else:
                    sp_bridged += 1
                    if sp.company_id != sp.procurement_line.company_id:
                        sp_cross_company += 1
                        errors += 1
            else:
                sp_missing += 1
                warnings += 1

        total_broken = po_broken + poi_broken + vl_broken + sp_broken
        total_cross = po_cross_company + poi_cross_company + vl_cross_company + sp_cross_company

        self.stdout.write(f"Purchase Orders: Total={po_total}, Bridged={po_bridged}, Unbridged={po_missing}")
        self.stdout.write(f"Purchase Order Items: Total={poi_total}, Bridged={poi_bridged}, Unbridged={poi_missing}")
        self.stdout.write(f"Vendor Ledgers: Total={vl_total}, Bridged={vl_bridged}, Unbridged={vl_missing}")
        self.stdout.write(f"Service Parts Used: Total={sp_total}, Bridged={sp_bridged}, Unbridged={sp_missing}")
        self.stdout.write(f"Broken Bridges: {total_broken}")
        self.stdout.write(f"Cross Company Violations: {total_cross}")
        self.stdout.write(f"Line/Document Mismatches: {line_mismatches}")
        self.stdout.write(f"Warnings (Unbridged Legacy Records): {warnings}")
        self.stdout.write(f"Errors (Broken/Cross-Company/Mismatches): {errors}")

        if errors > 0:
            self.stdout.write(self.style.ERROR("FAIL: Critical bridge integrity errors identified."))
            sys.exit(1)
        elif warnings > 0:
            self.stdout.write(self.style.WARNING("WARNING: Legacy records exist without procurement bridges (expected before migration)."))
        else:
            self.stdout.write(self.style.SUCCESS("PASS: Procurement bridges fully audited and verified."))
