from django.core.management.base import BaseCommand
from inventory.models import Product, StockMovement
from sales.models import SaleItem
from services.models import ServicePartUsed
from inventory.models import PurchaseOrderItem
from django.db import models

class Command(BaseCommand):
    help = 'Audits the inventory bridge state before Phase 3C data migration.'

    def handle(self, *args, **options):
        self.stdout.write(self.style.WARNING("--- INVENTORY BRIDGE AUDIT ---"))

        total_products = Product.objects.count()
        total_sale_items = SaleItem.objects.filter(item__isnull=True).count()
        total_po_items = PurchaseOrderItem.objects.filter(item__isnull=True).count()
        total_service_parts = ServicePartUsed.objects.filter(item__isnull=True).count()
        total_movements = StockMovement.objects.filter(item__isnull=True).count()

        self.stdout.write(f"Total Products to migrate: {total_products}")
        self.stdout.write(f"SaleItems missing Item FK: {total_sale_items}")
        self.stdout.write(f"PurchaseOrderItems missing Item FK: {total_po_items}")
        self.stdout.write(f"ServicePartUsed missing Item FK: {total_service_parts}")
        self.stdout.write(f"StockMovements missing Item FK: {total_movements}")

        if total_products == 0 and total_sale_items == 0 and total_po_items == 0 and total_service_parts == 0 and total_movements == 0:
            self.stdout.write(self.style.SUCCESS("All clear! Ready for Phase 3C Data Migration."))
        else:
            self.stdout.write(self.style.ERROR("Migration will be required in Phase 3C."))
