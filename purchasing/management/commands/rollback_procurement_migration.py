from django.core.management.base import BaseCommand
from django.db import transaction

from inventory.models import PurchaseOrder, PurchaseOrderItem, VendorLedger
from services.models import ServicePartUsed
from purchasing.models import ProcurementDocument, ProcurementLine, ProcurementNote, ProcurementAttachment, ProcurementAuditTrail


class Command(BaseCommand):
    help = 'Rolls back the Universal Procurement data migration cleanly and safely.'

    def handle(self, *args, **options):
        self.stdout.write("========================================")
        self.stdout.write(" ROLLING BACK PROCUREMENT MIGRATION ")
        self.stdout.write("========================================")

        with transaction.atomic():
            # 1. Unlink bridges on legacy models
            po_unlinked = PurchaseOrder.objects.filter(procurement_document__number__startswith='PROC-PO-').update(procurement_document=None)
            poi_unlinked = PurchaseOrderItem.objects.filter(procurement_line__document__number__startswith='PROC-PO-').update(procurement_line=None)
            vl_unlinked = VendorLedger.objects.filter(procurement_document__number__startswith='PROC-PO-').update(procurement_document=None)
            sp_unlinked = ServicePartUsed.objects.filter(procurement_line__document__number__startswith='PROC-PO-').update(procurement_line=None)

            # Also clear any remaining bridges pointing to PROC-PO- documents/lines
            PurchaseOrder.objects.filter(procurement_document__isnull=False).filter(procurement_document__number__startswith='PROC-PO-').update(procurement_document=None)
            PurchaseOrderItem.objects.filter(procurement_line__isnull=False).filter(procurement_line__document__number__startswith='PROC-PO-').update(procurement_line=None)

            # 2. Find migrated document IDs
            migrated_docs = ProcurementDocument.objects.filter(number__startswith='PROC-PO-')
            migrated_doc_ids = list(migrated_docs.values_list('id', flat=True))
            doc_count = len(migrated_doc_ids)

            # Delete related notes, attachments, audit trails, lines, and documents
            ProcurementNote.objects.filter(document_id__in=migrated_doc_ids).delete()
            ProcurementAttachment.objects.filter(document_id__in=migrated_doc_ids).delete()
            ProcurementAuditTrail.objects.filter(document_id__in=migrated_doc_ids).delete()
            ProcurementLine.objects.filter(document_id__in=migrated_doc_ids).delete()
            migrated_docs.delete()

        self.stdout.write(f"Unlinked PurchaseOrders: {po_unlinked}")
        self.stdout.write(f"Unlinked PurchaseOrderItems: {poi_unlinked}")
        self.stdout.write(f"Unlinked VendorLedgers: {vl_unlinked}")
        self.stdout.write(f"Unlinked ServicePartUsed: {sp_unlinked}")
        self.stdout.write(f"Deleted Migrated Procurement Documents: {doc_count}")
        self.stdout.write(self.style.SUCCESS("Rollback completed successfully."))
