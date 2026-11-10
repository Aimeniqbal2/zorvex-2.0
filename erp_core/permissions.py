import logging
from rest_framework.permissions import BasePermission

logger = logging.getLogger(__name__)

TECHNICIAN_ROLES = ('hardware_technician', 'software_technician')


class RolePermission(BasePermission):
    """
    Dynamic role-based permission class.
    Views set `allowed_roles` list attribute to control who can write.
    GET requests are allowed for admin, manager, cashier, technicians, and staff by default.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        if request.user.is_superuser:
            return True

        role = getattr(request.user, 'role', None)
        company_role = getattr(request.user, 'company_role', None)

        if role in ('super_admin', 'admin'):
            # Company Admin always has full company administration rights unless explicitly restricted by CUSTOM mode in ModulePermission
            if role == 'super_admin' or not company_role:
                return True
            if '*' in (company_role.permissions or []):
                return True

        if company_role:
            perms_list = company_role.permissions or []
            if '*' in perms_list:
                return True
            if request.method in ('GET', 'HEAD', 'OPTIONS'):
                req_perms = getattr(view, 'required_read_permissions', getattr(view, 'required_permissions', []))
            else:
                req_perms = getattr(view, 'required_write_permissions', getattr(view, 'required_permissions', []))
                
            if req_perms:
                # Match either explicit permission OR module wildcard (e.g. 'finance.*' matches 'finance.read')
                for req in req_perms:
                    mod_prefix = req.split('.')[0] + '.*' if '.' in req else req
                    if req in perms_list or mod_prefix in perms_list:
                        return True
                # Company Admin ('admin') fallback unless view forbids admin
                if role == 'admin' and 'admin' in getattr(view, 'allowed_roles', ['admin']):
                    return True
                return False # strictly enforce if view has required_permissions defined
            # If no req_perms defined, allow fallback to legacy for now

        # For safe GET methods — allow all authenticated company members
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            allowed_reads = getattr(
                view, 'allowed_reads',
                ['admin', 'manager', 'cashier', *TECHNICIAN_ROLES, 'staff']
            )
            allowed = role in allowed_reads
            if not allowed:
                logger.warning(f"Role {role} blocked from GET on {view.__class__.__name__}")
            return allowed

        # For write methods — check specific allowed_roles
        allowed_roles = getattr(view, 'allowed_roles', ['admin'])
        allowed = role in allowed_roles
        if not allowed:
            logger.warning(f"Role {role} blocked from {request.method} on {view.__class__.__name__}")
        return allowed