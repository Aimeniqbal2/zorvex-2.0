"""
platform_core/decorators.py

Function-based view decorator for module gating.

Usage on a function-based view:
    from platform_core.decorators import require_module

    @api_view(['GET'])
    @require_module('reports')
    def my_report_view(request):
        ...

For class-based views (APIView / ViewSet), prefer ModulePermission instead
(see platform_core/permissions.py) as it integrates natively with DRF's
permission pipeline and OpenAPI schema generation.
"""
import logging
from functools import wraps
from rest_framework.response import Response
from rest_framework import status

from .services import is_module_enabled

logger = logging.getLogger(__name__)


def require_module(module_code: str):
    """
    Decorator that gates a function-based API view behind a module check.

    Args:
        module_code: The ModuleDefinition.code to require.

    Returns a 403 response with structured JSON if the module is disabled.
    Superusers bypass the check.
    Authenticated users without a company_id also bypass (governed by RBAC).
    """
    def decorator(view_func):
        @wraps(view_func)
        def wrapper(request, *args, **kwargs):
            user = request.user

            # Superusers are never module-gated
            if getattr(user, 'is_superuser', False):
                return view_func(request, *args, **kwargs)

            if not (user and user.is_authenticated):
                return Response(
                    {'detail': 'Authentication required.'},
                    status=status.HTTP_401_UNAUTHORIZED,
                )

            company_id = getattr(user, 'company_id', None)
            if company_id and not is_module_enabled(company_id, module_code):
                logger.info(
                    "Module '%s' disabled for company %s — blocking %s",
                    module_code, company_id, user.pk,
                )
                return Response(
                    {
                        'detail': 'This module is not enabled for your company.',
                        'module': module_code,
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

            return view_func(request, *args, **kwargs)
        return wrapper
    return decorator
