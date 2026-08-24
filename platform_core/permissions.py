"""
platform_core/permissions.py

Module-aware DRF permission class.

Usage on a ViewSet:
    from platform_core.permissions import ModulePermission

    class InventoryViewSet(TenantModelViewSet):
        required_module = 'inventory'
        permission_classes = [IsAuthenticated, RolePermission, ModulePermission]

The class reads `required_module` from the view instance.
If the attribute is absent, the check is a no-op (backward-compatible).

Returns HTTP 403 with structured JSON when the module is disabled.
"""
import logging
from rest_framework.permissions import BasePermission
from rest_framework.exceptions import PermissionDenied

from .services import is_module_enabled

logger = logging.getLogger(__name__)


class ModulePermission(BasePermission):
    """
    DRF permission that enforces module-level feature gating.

    The view must declare:
        required_module = '<module_code>'   # e.g. 'inventory', 'hr', 'pos'

    If the attribute is missing or None, the permission is granted
    (safe default for platform endpoints that have no module mapping).

    Isolation guarantee: company is always resolved from the authenticated
    user's company_id — never from a query parameter — so Company A cannot
    use Company B's module state.
    """

    message = "This module is not enabled for your company."

    def has_permission(self, request, view):
        # Superusers bypass module gating entirely
        if request.user and request.user.is_superuser:
            return True

        # Read the module code declared on the view class
        module_code = getattr(view, 'required_module', None)
        if not module_code:
            return True   # No module declared — no restriction

        if not (request.user and request.user.is_authenticated):
            return False

        company_id = getattr(request.user, 'company_id', None)
        if not company_id:
            # Users without a company (e.g. platform-level staff) pass through;
            # their access is governed purely by RBAC.
            return True

        enabled = is_module_enabled(company_id, module_code)
        if not enabled:
            logger.info(
                "Module '%s' is disabled for company %s — blocking user %s",
                module_code, company_id, request.user.pk,
            )
            # Raise a structured 403 so the response body includes module name
            raise PermissionDenied(
                detail={
                    'detail': self.message,
                    'module': module_code,
                }
            )

        return True
