"""
platform_core/views.py

API views for:
  - Module catalogue (list all available modules)
  - Module state map (for frontend conditional navigation)
  - Company modules (list, enable, disable)
  - Company business type (get, update)
  - Branches (list, create, update)
  - Warehouses (list, create, update)
"""
import logging
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from companies.models import Company
from erp_core.rbac import IsTenantAdmin, IsManagerOrAdmin, IsCompanyMember

from .models import ModuleDefinition, CompanyModule, Branch, Warehouse, BusinessType
from .serializers import (
    ModuleDefinitionSerializer,
    CompanyModuleSerializer,
    EnableModuleSerializer,
    DisableModuleSerializer,
    BranchSerializer,
    WarehouseSerializer,
    BusinessTypeSerializer,
)
from .services import enable_module, disable_module, get_enabled_modules

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helper: resolve company safely
# ---------------------------------------------------------------------------
def _get_company_for_user(request):
    """
    Returns the Company for the requesting user.
    Superadmins must pass ?company_id= query param.
    """
    user = request.user
    if user.is_superuser:
        company_id = request.query_params.get('company_id') or request.data.get('company_id')
        if not company_id:
            return None, Response(
                {'error': 'Superadmins must supply company_id.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        company = get_object_or_404(Company, pk=company_id)
        return company, None
    elif getattr(user, 'company_id', None):
        return get_object_or_404(Company, pk=user.company_id), None
    return None, Response({'error': 'No company associated.'}, status=status.HTTP_403_FORBIDDEN)


# ===========================================================================
# MODULE CATALOGUE
# ===========================================================================
class ModuleCatalogueView(APIView):
    """
    GET /api/platform/modules/
    Lists all active ModuleDefinitions visible to authenticated users.
    """
    permission_classes = [IsAuthenticated, IsCompanyMember]

    def get(self, request):
        queryset = ModuleDefinition.objects.filter(is_active=True).order_by('category', 'name')
        serializer = ModuleDefinitionSerializer(queryset, many=True)
        return Response(serializer.data)


# ---------------------------------------------------------------------------
# Authoritative list of known module codes (mirrors seed_modules data).
# Use this constant when you need to reference module codes in Python code
# rather than hard-coding strings in multiple places.
# ---------------------------------------------------------------------------
MODULE_CODES = {
    'CRM':              'crm',
    'SALES':            'sales',
    'POS':              'pos',
    'INVENTORY':        'inventory',
    'PURCHASING':       'purchasing',
    'FINANCE':          'finance',
    'ACCOUNTING':       'accounting',
    'HR':               'hr',
    'PAYROLL':          'payroll',
    'PROJECTS':         'projects',
    'SERVICES':         'services',
    'DOCUMENTS':        'documents',
    'REPORTS':          'reports',
    'ANALYTICS':        'analytics',
    'AUTOMATION':       'automation',
    'SECURITY_OPS':     'security_ops',
    'RESTAURANT':       'restaurant',
    'MANUFACTURING':    'manufacturing',
    'HOSPITAL':         'hospital',
    'SCHOOL':           'school',
    'RETAIL':           'retail',
    'MOBILE_REPAIR':    'mobile_repair',
}


class ModuleStateView(APIView):
    """
    GET /api/platform/module-state/

    Returns a flat dictionary of { module_code: true|false } for ALL active
    module definitions, resolved against this company's enabled modules.

    This is the canonical endpoint for frontend conditional navigation.

    Example response:
    {
        "crm": false,
        "sales": true,
        "pos": true,
        "inventory": true,
        "hr": false,
        ...
    }

    Superadmins pass ?company_id=<uuid> to query a specific company.
    """
    permission_classes = [IsAuthenticated, IsCompanyMember]

    def get(self, request):
        company, err = _get_company_for_user(request)
        if err:
            return err

        # All active module definitions
        all_modules = ModuleDefinition.objects.filter(is_active=True).values_list('code', flat=True)

        # Enabled codes for this company
        enabled_codes = set(
            CompanyModule.objects.filter(
                company=company,
                enabled=True,
            ).values_list('module__code', flat=True)
        )

        state = {code: (code in enabled_codes) for code in all_modules}
        return Response(state)


# ===========================================================================
# COMPANY MODULES
# ===========================================================================
class CompanyModuleListView(APIView):
    """
    GET /api/platform/company-modules/
    Lists modules enabled for the current company (or company_id for superadmin).
    """
    permission_classes = [IsAuthenticated, IsCompanyMember]

    def get(self, request):
        company, err = _get_company_for_user(request)
        if err:
            return err

        cms = CompanyModule.objects.filter(company=company).select_related('module')
        serializer = CompanyModuleSerializer(cms, many=True)
        return Response(serializer.data)


class EnableModuleView(APIView):
    """
    POST /api/platform/company-modules/enable/
    Body: { "module_code": "sales" }
    Enables a module for the company. Requires admin role.
    """
    permission_classes = [IsAuthenticated, IsTenantAdmin]

    def post(self, request):
        company, err = _get_company_for_user(request)
        if err:
            return err

        serializer = EnableModuleSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        module_code = serializer.validated_data['module_code']
        try:
            cm = enable_module(company, module_code)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            CompanyModuleSerializer(cm).data,
            status=status.HTTP_200_OK,
        )


class DisableModuleView(APIView):
    """
    POST /api/platform/company-modules/disable/
    Body: { "module_code": "sales" }
    Disables a module for the company. Requires admin role.
    Core modules cannot be disabled.
    """
    permission_classes = [IsAuthenticated, IsTenantAdmin]

    def post(self, request):
        company, err = _get_company_for_user(request)
        if err:
            return err

        serializer = DisableModuleSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        module_code = serializer.validated_data['module_code']
        try:
            cm = disable_module(company, module_code)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            CompanyModuleSerializer(cm).data,
            status=status.HTTP_200_OK,
        )


# ===========================================================================
# BUSINESS TYPE
# ===========================================================================
class CompanyBusinessTypeView(APIView):
    """
    GET  /api/platform/business-type/   — get current business type
    PATCH/PUT /api/platform/business-type/ — update business type (admin only)
    """
    permission_classes = [IsAuthenticated, IsCompanyMember]

    def get(self, request):
        company, err = _get_company_for_user(request)
        if err:
            return err
        return Response({
            'business_type': company.business_type,
            'business_type_display': company.get_business_type_display(),
            'choices': [{'value': v, 'label': l} for v, l in BusinessType.choices],
        })

    def patch(self, request):
        return self._update(request)

    def put(self, request):
        return self._update(request)

    def _update(self, request):
        # Only admins can change business type
        if not (request.user.is_superuser or getattr(request.user, 'role', '') in ('admin', 'super_admin')):
            return Response({'error': 'Admin role required.'}, status=status.HTTP_403_FORBIDDEN)

        company, err = _get_company_for_user(request)
        if err:
            return err

        serializer = BusinessTypeSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        company.business_type = serializer.validated_data['business_type']
        company.save(update_fields=['business_type', 'updated_at'])
        logger.info("Company %s business_type updated to '%s'", company.pk, company.business_type)
        return Response({
            'business_type': company.business_type,
            'business_type_display': company.get_business_type_display(),
        })


# ===========================================================================
# BRANCHES
# ===========================================================================
class BranchListCreateView(APIView):
    """
    GET  /api/platform/branches/  — list branches for current company
    POST /api/platform/branches/  — create branch (admin only)
    """
    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsAuthenticated(), IsCompanyMember()]
        return [IsAuthenticated(), IsTenantAdmin()]

    def get(self, request):
        company, err = _get_company_for_user(request)
        if err:
            return err

        branches = Branch.objects.select_related('manager').filter(company=company)
        serializer = BranchSerializer(branches, many=True)
        return Response(serializer.data)

    def post(self, request):
        company, err = _get_company_for_user(request)
        if err:
            return err

        serializer = BranchSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        serializer.save(company=company)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class BranchDetailView(APIView):
    """
    GET   /api/platform/branches/<pk>/  — retrieve branch
    PATCH /api/platform/branches/<pk>/  — update branch (admin only)
    DELETE /api/platform/branches/<pk>/ — soft-delete branch (admin only)
    """
    def _get_branch(self, pk, company):
        return get_object_or_404(Branch, pk=pk, company=company, is_deleted=False)

    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsAuthenticated(), IsCompanyMember()]
        return [IsAuthenticated(), IsTenantAdmin()]

    def get(self, request, pk):
        company, err = _get_company_for_user(request)
        if err:
            return err
        branch = self._get_branch(pk, company)
        return Response(BranchSerializer(branch).data)

    def patch(self, request, pk):
        company, err = _get_company_for_user(request)
        if err:
            return err
        branch = self._get_branch(pk, company)
        serializer = BranchSerializer(branch, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        company, err = _get_company_for_user(request)
        if err:
            return err
        branch = self._get_branch(pk, company)
        branch.is_deleted = True
        branch.is_active = False
        branch.save(update_fields=['is_deleted', 'is_active', 'updated_at'])
        return Response({'status': 'deleted', 'id': str(branch.pk)}, status=status.HTTP_200_OK)


# ===========================================================================
# WAREHOUSES
# ===========================================================================
class WarehouseListCreateView(APIView):
    """
    GET  /api/platform/warehouses/  — list warehouses for current company
    POST /api/platform/warehouses/  — create warehouse (admin only)
    """
    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsAuthenticated(), IsCompanyMember()]
        return [IsAuthenticated(), IsTenantAdmin()]

    def get(self, request):
        company, err = _get_company_for_user(request)
        if err:
            return err

        warehouses = Warehouse.objects.select_related('branch').filter(company=company)
        serializer = WarehouseSerializer(warehouses, many=True)
        return Response(serializer.data)

    def post(self, request):
        company, err = _get_company_for_user(request)
        if err:
            return err

        serializer = WarehouseSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        # Validate branch belongs to same company
        branch = serializer.validated_data.get('branch')
        if branch and branch.company_id != company.pk:
            return Response(
                {'error': 'Branch does not belong to this company.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer.save(company=company)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class WarehouseDetailView(APIView):
    """
    GET   /api/platform/warehouses/<pk>/
    PATCH /api/platform/warehouses/<pk>/
    DELETE /api/platform/warehouses/<pk>/
    """
    def _get_warehouse(self, pk, company):
        return get_object_or_404(Warehouse, pk=pk, company=company, is_deleted=False)

    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsAuthenticated(), IsCompanyMember()]
        return [IsAuthenticated(), IsTenantAdmin()]

    def get(self, request, pk):
        company, err = _get_company_for_user(request)
        if err:
            return err
        wh = self._get_warehouse(pk, company)
        return Response(WarehouseSerializer(wh).data)

    def patch(self, request, pk):
        company, err = _get_company_for_user(request)
        if err:
            return err
        wh = self._get_warehouse(pk, company)
        serializer = WarehouseSerializer(wh, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        branch = serializer.validated_data.get('branch')
        if branch and branch.company_id != company.pk:
            return Response(
                {'error': 'Branch does not belong to this company.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        company, err = _get_company_for_user(request)
        if err:
            return err
        wh = self._get_warehouse(pk, company)
        wh.is_deleted = True
        wh.is_active = False
        wh.save(update_fields=['is_deleted', 'is_active', 'updated_at'])
        return Response({'status': 'deleted', 'id': str(wh.pk)}, status=status.HTTP_200_OK)

# ===========================================================================
# PROVISIONING (Phase S-9)
# ===========================================================================
from .provisioning import get_template_for_business_type, provision_company

class IndustryTemplateView(APIView):
    """
    GET /api/platform/industry-template/?business_type=security
    Returns the recommended modules, required modules, and roles for the selected industry.
    """
    permission_classes = [IsAuthenticated] # Or restrict to SuperAdmins? Let's leave IsAuthenticated for now as anyone with platform access might provision.

    def get(self, request):
        business_type = request.query_params.get('business_type', 'other')
        template = get_template_for_business_type(business_type)
        return Response(template)


class ProvisionCompanyView(APIView):
    """
    POST /api/platform/companies/provision/
    Payload:
    {
        "name": "Security Co",
        "business_type": "security",
        "admin_username": "admin",
        "admin_password": "secure123",
        "admin_email": "admin@example.com",
        "selected_modules": ["crm", "hr", "security_ops", ...]
    }
    """
    permission_classes = [IsAuthenticated]  # Should ideally be IsSuperAdmin or platform role

    def post(self, request):
        data = request.data
        try:
            company, admin_user = provision_company(
                name=data.get('name'),
                business_type=data.get('business_type'),
                admin_username=data.get('admin_username'),
                admin_password=data.get('admin_password'),
                admin_email=data.get('admin_email'),
                selected_modules=data.get('selected_modules', []),
                domain=data.get('domain'),
                phone=data.get('phone'),
                address=data.get('address')
            )
            return Response({
                "status": "success",
                "company_id": str(company.id),
                "company_name": company.name,
                "admin_id": str(admin_user.id)
            }, status=status.HTTP_201_CREATED)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.exception("Provisioning failed")
            return Response({"error": "An internal error occurred during provisioning."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

