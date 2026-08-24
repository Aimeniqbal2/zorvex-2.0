from django.apps import AppConfig


class PlatformCoreConfig(AppConfig):
    name = 'platform_core'
    verbose_name = 'Platform Core'

    def ready(self):
        """Import signals when app is ready."""
        pass  # Future signal registration goes here
