from django.apps import AppConfig


class PlatformCoreConfig(AppConfig):
    name = 'platform_core'
    verbose_name = 'Platform Core'

    def ready(self):
        """Import signals and register packages when app is ready."""
        try:
            import industries.security.manifest
        except ImportError:
            pass
        try:
            import erp_core.audit_signals
            from erp_core.admin_audit import enhance_all_registered_admins
            enhance_all_registered_admins()
        except Exception:
            pass
