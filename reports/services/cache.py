import hashlib
import json
from django.core.cache import cache
import logging

logger = logging.getLogger(__name__)

class ReportingCacheService:
    def __init__(self, company_id):
        if not company_id:
            raise ValueError("company_id is required.")
        self.company_id = company_id

    def _get_version(self, category):
        """Returns the current cache version for a category (dashboard, financial, inventory)."""
        version_key = f"zorvex:{self.company_id}:versions:{category}"
        try:
            version = cache.get(version_key)
            if not version:
                version = 1
                cache.set(version_key, version, None)  # Never expires
            return version
        except Exception as e:
            logger.warning(f"Cache get failure for version_key={version_key}: {e}")
            return 1

    def _increment_version(self, category):
        """Increments the cache version, effectively invalidating all keys using it."""
        version_key = f"zorvex:{self.company_id}:versions:{category}"
        try:
            try:
                cache.add(version_key, 1, None)
            except Exception:
                pass
            cache.incr(version_key)
        except Exception as e:
            logger.warning(f"Cache incr failure for version_key={version_key}: {e}")

    def generate_key(self, namespace, category, **kwargs):
        """
        Generates a deterministic, tenant-safe cache key incorporating the category version.
        namespace: e.g. 'dashboard_kpis', 'pnl'
        category: e.g. 'dashboard', 'financial', 'inventory'
        kwargs: all parameters affecting the result
        """
        version = self._get_version(category)
        
        # Sort kwargs to ensure deterministic hashing
        sorted_items = sorted(kwargs.items())
        params_str = json.dumps(sorted_items, default=str)
        param_hash = hashlib.md5(params_str.encode('utf-8')).hexdigest()
        
        return f"zorvex:{self.company_id}:reports:{namespace}:v{version}:{param_hash}"

    def get(self, key):
        try:
            return cache.get(key)
        except Exception as e:
            logger.warning(f"Cache get failure for key={key}: {e}")
            return None

    def set(self, key, value, timeout=300):
        try:
            cache.set(key, value, timeout)
        except Exception as e:
            logger.warning(f"Cache set failure for key={key}: {e}")

    def delete(self, key):
        try:
            cache.delete(key)
        except Exception as e:
            logger.warning(f"Cache delete failure for key={key}: {e}")

    def invalidate_dashboard(self):
        self._increment_version('dashboard')

    def invalidate_financial_reports(self):
        self._increment_version('financial')
        self.invalidate_dashboard()

    def invalidate_inventory_reports(self):
        self._increment_version('inventory')
        self.invalidate_dashboard()
