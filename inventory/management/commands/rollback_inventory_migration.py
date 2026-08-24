import logging
from django.core.management.base import BaseCommand
from django.db import transaction
from inventory.models import Item, InventoryBalance, StockMovement, PurchaseOrderItem
from sales.models import SaleItem
from services.models import ServicePartUsed

class Command(BaseCommand):
    help = "Rollback the Phase 3D inventory migration."

    def add_arguments(self, parser):
        parser.add_argument('--confirm', action='store_true', help='Confirm rollback')

    def handle(self, *args, **options):
        if not options['confirm']:
            self.stderr.write(self.style.ERROR("You must use --confirm to execute the rollback."))
            return

        self.stdout.write(self.style.WARNING("Starting Migration Rollback..."))

        try:
            with transaction.atomic():
                # 1. Clear Bridge Models
                sales_cleared = SaleItem.objects.filter(item__item_code__startswith="LEGACY-PROD-").update(item=None)
                self.stdout.write(f"Cleared {sales_cleared} SaleItem links.")

                po_cleared = PurchaseOrderItem.objects.filter(item__item_code__startswith="LEGACY-PROD-").update(item=None)
                self.stdout.write(f"Cleared {po_cleared} PurchaseOrderItem links.")

                service_cleared = ServicePartUsed.objects.filter(item__item_code__startswith="LEGACY-PROD-").update(item=None)
                self.stdout.write(f"Cleared {service_cleared} ServicePartUsed links.")

                # 2. Clear Stock Movements
                # We revert type mapping, but we don't strictly have to if it works, but better to clear the item.
                # Since movement_type might have changed to LEGACY_*, we can revert them if needed, but the prompt says:
                # "clear Item links from bridge models"
                sm_cleared = StockMovement.objects.filter(item__item_code__startswith="LEGACY-PROD-").update(
                    item=None,
                    warehouse=None
                    # Could revert LEGACY_IN to IN here if strictly necessary, but not strictly requested.
                )
                
                # Revert movement types
                StockMovement.objects.filter(movement_type='LEGACY_IN').update(movement_type='IN')
                StockMovement.objects.filter(movement_type='LEGACY_OUT').update(movement_type='OUT')
                StockMovement.objects.filter(movement_type='LEGACY_ADJUST').update(movement_type='ADJUST')
                
                self.stdout.write(f"Cleared {sm_cleared} StockMovement links and reverted types.")

                # 3. Remove InventoryBalances
                migrated_items = Item.objects.filter(item_code__startswith="LEGACY-PROD-")
                balances_deleted, _ = InventoryBalance.objects.filter(item__in=migrated_items).delete()
                self.stdout.write(f"Deleted {balances_deleted} InventoryBalances.")

                # 4. Remove Migrated Items
                items_deleted, _ = migrated_items.delete()
                self.stdout.write(f"Deleted {items_deleted} migrated Items.")
                
                self.stdout.write(self.style.SUCCESS("Rollback completed successfully!"))
                
        except Exception as e:
            self.stderr.write(self.style.ERROR(f"Rollback failed: {e}"))
