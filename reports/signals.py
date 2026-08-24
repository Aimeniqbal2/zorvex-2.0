from django.db.models.signals import post_save
from django.dispatch import receiver
from finance.models import JournalEntry
from inventory.models import StockMovement
from reports.services.cache import ReportingCacheService

@receiver(post_save, sender=JournalEntry)
def invalidate_financial_reports_cache(sender, instance, **kwargs):
    """
    Invalidates the financial reporting cache when a JournalEntry is created/updated.
    Only triggers invalidation if the entry is POSTED.
    """
    if instance.status == 'POSTED' and getattr(instance, 'company_id', None):
        cache_service = ReportingCacheService(company_id=instance.company_id)
        cache_service.invalidate_financial_reports()

@receiver(post_save, sender=StockMovement)
def invalidate_inventory_reports_cache(sender, instance, **kwargs):
    """
    Invalidates the inventory reporting cache when a StockMovement occurs.
    """
    if getattr(instance, 'company_id', None):
        cache_service = ReportingCacheService(company_id=instance.company_id)
        cache_service.invalidate_inventory_reports()
