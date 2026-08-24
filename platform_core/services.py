"""
platform_core/services.py

Business-logic layer for module management.
All public functions are the canonical API for enabling/disabling modules.
"""
import logging
from django.utils import timezone

from .models import ModuleDefinition, CompanyModule

logger = logging.getLogger(__name__)


def get_enabled_modules(company):
    """
    Return a queryset of ModuleDefinition objects that are currently
    enabled for the given company.

    Args:
        company: Company instance or company_id (UUID).

    Returns:
        QuerySet[ModuleDefinition]
    """
    company_id = getattr(company, 'pk', company)
    return ModuleDefinition.objects.filter(
        company_modules__company_id=company_id,
        company_modules__enabled=True,
        is_active=True,
    ).distinct()


def is_module_enabled(company, module_code: str) -> bool:
    """
    Return True if the module identified by *module_code* is enabled
    for the given company.

    Args:
        company:     Company instance or company_id (UUID).
        module_code: The unique code of the ModuleDefinition.

    Returns:
        bool
    """
    company_id = getattr(company, 'pk', company)
    return CompanyModule.objects.filter(
        company_id=company_id,
        module__code=module_code,
        module__is_active=True,
        enabled=True,
    ).exists()


def enable_module(company, module_code: str) -> CompanyModule:
    """
    Enable a module for the given company.
    Creates the CompanyModule record if it does not already exist.
    Raises ValueError for unknown / inactive module codes.

    Args:
        company:     Company instance or company_id (UUID).
        module_code: The unique code of the ModuleDefinition.

    Returns:
        CompanyModule instance (enabled=True)
    """
    company_id = getattr(company, 'pk', company)

    try:
        module = ModuleDefinition.objects.get(code=module_code, is_active=True)
    except ModuleDefinition.DoesNotExist:
        raise ValueError(f"No active module with code '{module_code}' found.")

    cm, created = CompanyModule.objects.get_or_create(
        company_id=company_id,
        module=module,
        defaults={'enabled': True, 'activated_at': timezone.now()},
    )

    if not created and not cm.enabled:
        cm.enabled = True
        cm.activated_at = timezone.now()
        cm.deactivated_at = None
        cm.save(update_fields=['enabled', 'activated_at', 'deactivated_at', 'updated_at'])
        logger.info("Module '%s' re-enabled for company %s", module_code, company_id)
    elif created:
        logger.info("Module '%s' enabled for company %s", module_code, company_id)

    return cm


def disable_module(company, module_code: str) -> CompanyModule:
    """
    Disable a module for the given company.
    Core modules cannot be disabled — raises ValueError in that case.

    Args:
        company:     Company instance or company_id (UUID).
        module_code: The unique code of the ModuleDefinition.

    Returns:
        CompanyModule instance (enabled=False)
    """
    company_id = getattr(company, 'pk', company)

    try:
        module = ModuleDefinition.objects.get(code=module_code)
    except ModuleDefinition.DoesNotExist:
        raise ValueError(f"No module with code '{module_code}' found.")

    if module.is_core:
        raise ValueError(f"Module '{module_code}' is a core module and cannot be disabled.")

    try:
        cm = CompanyModule.objects.get(company_id=company_id, module=module)
    except CompanyModule.DoesNotExist:
        raise ValueError(
            f"Module '{module_code}' is not activated for company {company_id}."
        )

    if cm.enabled:
        cm.enabled = False
        cm.deactivated_at = timezone.now()
        cm.save(update_fields=['enabled', 'deactivated_at', 'updated_at'])
        logger.info("Module '%s' disabled for company %s", module_code, company_id)

    return cm
