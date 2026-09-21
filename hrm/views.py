from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from erp_core.views import TenantModelViewSet
from erp_core.permissions import RolePermission
from erp_core.middleware import get_current_company
from platform_core.permissions import ModulePermission
from .models import (
    Department, Position, Designation, Employee, Employment,
    EmployeeRecord, Attendance
)
from .serializers import (
    DepartmentSerializer, PositionSerializer, DesignationSerializer,
    EmployeeSerializer, EmploymentSerializer,
    EmployeeRecordSerializer, AttendanceSerializer
)

class DepartmentViewSet(TenantModelViewSet):
    required_module = 'hr'
    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer
    permission_classes = [IsAuthenticated, ModulePermission]

class PositionViewSet(TenantModelViewSet):
    required_module = 'hr'
    queryset = Position.objects.select_related('department').all()
    serializer_class = PositionSerializer
    permission_classes = [IsAuthenticated, ModulePermission]

class DesignationViewSet(TenantModelViewSet):
    required_module = 'hr'
    queryset = Designation.objects.all()
    serializer_class = DesignationSerializer
    permission_classes = [IsAuthenticated, ModulePermission]


def check_security_workforce_access(request, employee):
    """
    Enforces the 5 security workforce authorization pillars:
    1. Tenant Isolation
    2. Company Industry Capability
    3. Enabled CompanyModule
    4. UserModuleAccess / access_mode
    5. RBAC permissions
    """
    from rest_framework.exceptions import PermissionDenied
    from erp_core.middleware import get_current_company
    from platform_core.services import is_module_enabled

    # 1. Tenant Isolation
    active_company_id = get_current_company()
    if not active_company_id and not request.user.is_superuser:
        active_company_id = getattr(request.user, 'company_id', None)

    if active_company_id and str(employee.company_id) != str(active_company_id):
        raise PermissionDenied("Cross-tenant access prohibited.")

    if not request.user.is_superuser and getattr(request.user, 'company_id', None):
        if str(employee.company_id) != str(request.user.company_id):
            raise PermissionDenied("Cross-tenant access prohibited.")

    # 2. Industry Capability
    company = employee.company
    is_sec = str(getattr(company, 'business_type', '')).lower() == 'security'
    if not is_sec:
        try:
            from industries.common.registry import get_industry_package
            pkg = get_industry_package(company.business_type)
            is_sec = bool(pkg and pkg.code == 'security')
        except Exception:
            is_sec = False
    if not is_sec:
        raise PermissionDenied("This operation is only available for security industry companies.")

    # 3. Enabled CompanyModule
    if not is_module_enabled(company.id, 'hr'):
        raise PermissionDenied("HR module is disabled for this company.")
    if not (is_module_enabled(company.id, 'operations') or is_module_enabled(company.id, 'security_ops')):
        raise PermissionDenied("Security operations module is disabled for this company.")

    # 4. UserModuleAccess / access_mode
    if not request.user.is_superuser:
        if getattr(request.user, 'access_mode', 'FULL_COMPANY') == 'CUSTOM':
            granted = set(request.user.custom_module_access.filter(enabled=True).values_list('module__code', flat=True))
            if 'hr' not in granted:
                raise PermissionDenied("User does not have custom module access to HR.")
            if not ({'operations', 'security_ops', 'guards_staff'} & granted):
                raise PermissionDenied("User does not have custom module access to security operations.")

    # 5. RBAC permissions
    if not request.user.is_superuser:
        role = getattr(request.user, 'role', None)
        company_role = getattr(request.user, 'company_role', None)
        perms = set(company_role.permissions) if company_role and hasattr(company_role, 'permissions') else set()

        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            allowed_roles = ['admin', 'super_admin', 'manager', 'staff']
            if role not in allowed_roles and not ({'operations.read', 'hrm.view_employee', 'hrm.read'} & perms):
                raise PermissionDenied("Insufficient read permissions for security workforce records.")
        else:
            allowed_roles = ['admin', 'super_admin', 'manager']
            if role not in allowed_roles and not ({'hrm.change_employee', 'operations.write'} & perms):
                raise PermissionDenied("Insufficient permissions to perform this security workforce action.")


from rest_framework.pagination import PageNumberPagination

class EmployeePagination(PageNumberPagination):
    page_size = 100
    page_size_query_param = 'page_size'
    max_page_size = 2000

class EmployeeViewSet(TenantModelViewSet):
    required_module = 'hr'
    queryset = Employee.objects.select_related(
        'user', 'crm_entity', 'department', 'position', 'designation', 'branch'
    ).prefetch_related(
        'next_of_kin', 'documents', 'trainings', 'history_logs', 'salary_assignments', 'statutory_enrollments'
    ).all()
    serializer_class = EmployeeSerializer
    permission_classes = [IsAuthenticated, ModulePermission]
    pagination_class = EmployeePagination

    def get_queryset(self):
        qs = super().get_queryset()
        if not hasattr(self, 'request') or not self.request:
            return qs
        classification = self.request.query_params.get('classification') or self.request.query_params.get('workforce_type')
        if classification:
            qs = qs.filter(classification=classification)
        department = self.request.query_params.get('department')
        if department:
            qs = qs.filter(department_id=department)
        designation = self.request.query_params.get('designation')
        if designation:
            qs = qs.filter(designation_id=designation)
        employment_status = self.request.query_params.get('employment_status')
        if employment_status:
            qs = qs.filter(employment_status=employment_status)
        background_type = self.request.query_params.get('background_type')
        if background_type:
            qs = qs.filter(background_type=background_type)
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            if is_active.lower() in ('true', '1'):
                qs = qs.filter(is_active=True)
            elif is_active.lower() in ('false', '0'):
                qs = qs.filter(is_active=False)
        joining_date_from = self.request.query_params.get('joining_date_from')
        if joining_date_from:
            qs = qs.filter(joining_date__gte=joining_date_from)
        joining_date_to = self.request.query_params.get('joining_date_to')
        if joining_date_to:
            qs = qs.filter(joining_date__lte=joining_date_to)
        site_id = self.request.query_params.get('site_id') or self.request.query_params.get('location_id')
        client_id = self.request.query_params.get('client_id')
        if site_id or client_id:
            try:
                from operations.models import Deployment
                dep_qs = Deployment.objects.filter(is_deleted=False)
                if site_id:
                    dep_qs = dep_qs.filter(site_id=site_id)
                if client_id:
                    dep_qs = dep_qs.filter(site__client_id=client_id)
                matched_emp_ids = dep_qs.values_list('employee_id', flat=True).distinct()
                qs = qs.filter(id__in=matched_emp_ids)
            except Exception:
                pass
        search = self.request.query_params.get('search')
        search_field = (self.request.query_params.get('search_field') or 'ALL').upper()
        if search:
            from django.db.models import Q
            if search_field == 'NAME':
                qs = qs.filter(Q(first_name__icontains=search) | Q(last_name__icontains=search) | Q(father_name__icontains=search))
            elif search_field == 'CODE':
                qs = qs.filter(Q(employee_code__icontains=search) | Q(previous_employee_code__icontains=search))
            elif search_field == 'CNIC':
                qs = qs.filter(cnic_number__icontains=search)
            elif search_field == 'PHONE':
                qs = qs.filter(Q(phone__icontains=search) | Q(telephone_number__icontains=search))
            else:
                qs = qs.filter(
                    Q(first_name__icontains=search) |
                    Q(last_name__icontains=search) |
                    Q(father_name__icontains=search) |
                    Q(employee_code__icontains=search) |
                    Q(previous_employee_code__icontains=search) |
                    Q(cnic_number__icontains=search) |
                    Q(phone__icontains=search) |
                    Q(telephone_number__icontains=search) |
                    Q(caste__icontains=search)
                )
        return qs

    def perform_create(self, serializer):
        from erp_core.middleware import get_current_company
        company_id = get_current_company() or getattr(self.request.user, 'company_id', None)
        
        provided_code = serializer.validated_data.get('employee_code')
        if not provided_code:
            from erp_core.models import DocumentSequence
            from companies.models import Company
            comp = Company.objects.get(pk=company_id)
            new_code = DocumentSequence.get_next_number(comp, "EMPLOYEE", "EMP")
            serializer.save(company_id=company_id, employee_code=new_code)
        else:
            serializer.save(company_id=company_id)

    @action(detail=True, methods=['get'], url_path='deployments')
    def deployments(self, request, pk=None):
        employee = self.get_object()
        check_security_workforce_access(request, employee)
        from operations.models import Deployment, DeploymentStatus
        from operations.serializers import DeploymentListSerializer
        deps = Deployment.objects.filter(
            company=employee.company,
            employee=employee,
            is_deleted=False
        ).select_related('site', 'post', 'service_contract', 'designation', 'crm_entity').order_by('-start_date')
        
        current = deps.filter(status=DeploymentStatus.ACTIVE).first()
        return Response({
            'current': DeploymentListSerializer(current).data if current else None,
            'history': DeploymentListSerializer(deps, many=True).data
        })

    @action(detail=True, methods=['post'], url_path='promote')
    def promote(self, request, pk=None):
        employee = self.get_object()
        from hrm.serializers import PromoteDesignationActionSerializer, EmploymentHistorySerializer
        from hrm.services.lifecycle_service import LifecycleService
        serializer = PromoteDesignationActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        from hrm.models import Designation
        new_desig = get_object_or_404(Designation, pk=data['new_designation'], company=employee.company)
        history = LifecycleService.promote_or_change_designation(
            employee=employee,
            new_designation=new_desig,
            effective_date=data.get('effective_date'),
            reason=data.get('reason', ''),
            is_promotion=data.get('is_promotion', True),
            approved_by=request.user,
            user=request.user,
            notes=data.get('notes', '')
        )
        return Response({
            'status': 'success',
            'employee': EmployeeSerializer(employee).data,
            'history': EmploymentHistorySerializer(history).data
        })

    @action(detail=True, methods=['post'], url_path='change-department')
    def change_department(self, request, pk=None):
        employee = self.get_object()
        from hrm.serializers import ChangeDepartmentActionSerializer, EmploymentHistorySerializer
        from hrm.services.lifecycle_service import LifecycleService
        serializer = ChangeDepartmentActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        from hrm.models import Department
        new_dept = get_object_or_404(Department, pk=data['new_department'], company=employee.company)
        history = LifecycleService.change_department(
            employee=employee,
            new_department=new_dept,
            effective_date=data.get('effective_date'),
            reason=data.get('reason', ''),
            approved_by=request.user,
            user=request.user,
            notes=data.get('notes', '')
        )
        return Response({
            'status': 'success',
            'employee': EmployeeSerializer(employee).data,
            'history': EmploymentHistorySerializer(history).data
        })

    @action(detail=True, methods=['post'], url_path='change-classification')
    def change_classification(self, request, pk=None):
        employee = self.get_object()
        from hrm.serializers import ChangeClassificationActionSerializer, EmploymentHistorySerializer
        from hrm.services.lifecycle_service import LifecycleService
        serializer = ChangeClassificationActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        history = LifecycleService.change_classification(
            employee=employee,
            new_classification=data['new_classification'],
            effective_date=data.get('effective_date'),
            reason=data.get('reason', ''),
            approved_by=request.user,
            user=request.user,
            notes=data.get('notes', '')
        )
        return Response({
            'status': 'success',
            'employee': EmployeeSerializer(employee).data,
            'history': EmploymentHistorySerializer(history).data
        })

    @action(detail=True, methods=['post'], url_path='revise-salary')
    def revise_salary(self, request, pk=None):
        employee = self.get_object()
        from hrm.serializers import ReviseSalaryActionSerializer, EmployeeSalaryAssignmentSerializer, EmploymentHistorySerializer
        from hrm.services.lifecycle_service import LifecycleService
        serializer = ReviseSalaryActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        curr_model = None
        if data.get('currency'):
            from finance.models import Currency
            curr_model = get_object_or_404(Currency, pk=data['currency'], company=employee.company)

        struct_model = None
        if data.get('salary_structure'):
            from hrm.models import SalaryStructure
            struct_model = get_object_or_404(SalaryStructure, pk=data['salary_structure'], company=employee.company)

        assignment, history = LifecycleService.revise_salary(
            employee=employee,
            base_salary=data['base_salary'],
            effective_date=data.get('effective_date'),
            daily_rate=data.get('daily_rate'),
            single_ot_rate=data.get('single_ot_rate'),
            double_ot_rate=data.get('double_ot_rate'),
            currency=curr_model,
            salary_structure=struct_model,
            reason=data.get('reason', ''),
            approved_by=request.user,
            user=request.user,
            notes=data.get('notes', '')
        )
        return Response({
            'status': 'success',
            'assignment': EmployeeSalaryAssignmentSerializer(assignment).data,
            'history': EmploymentHistorySerializer(history).data
        })

    @action(detail=True, methods=['post'], url_path='transfer')
    def transfer(self, request, pk=None):
        employee = self.get_object()
        check_security_workforce_access(request, employee)
        from hrm.serializers import TransferDeploymentActionSerializer, EmploymentHistorySerializer
        from hrm.services.lifecycle_service import LifecycleService
        from operations.serializers import DeploymentListSerializer
        serializer = TransferDeploymentActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        from operations.models import OperationalSite, SecurityPost, ServiceContract
        new_site = get_object_or_404(OperationalSite, pk=data['new_site'], company=employee.company)
        new_post = None
        if data.get('new_post'):
            new_post = get_object_or_404(SecurityPost, pk=data['new_post'], site=new_site)
        new_sc = None
        if data.get('new_service_contract'):
            new_sc = get_object_or_404(ServiceContract, pk=data['new_service_contract'], company=employee.company)
        new_desig = None
        if data.get('new_designation'):
            from hrm.models import Designation
            new_desig = get_object_or_404(Designation, pk=data['new_designation'], company=employee.company)

        new_dep, history = LifecycleService.transfer_deployment(
            employee=employee,
            new_site=new_site,
            new_post=new_post,
            new_service_contract=new_sc,
            new_designation=new_desig,
            start_date=data.get('start_date'),
            relief_reason=data.get('relief_reason', ''),
            notes=data.get('notes', ''),
            approved_by=request.user,
            user=request.user
        )
        return Response({
            'status': 'success',
            'deployment': DeploymentListSerializer(new_dep).data,
            'history': EmploymentHistorySerializer(history).data
        })

    @action(detail=True, methods=['post'], url_path='relieve')
    def relieve(self, request, pk=None):
        employee = self.get_object()
        check_security_workforce_access(request, employee)
        from hrm.serializers import RelieveDeploymentActionSerializer, EmploymentHistorySerializer
        from hrm.services.lifecycle_service import LifecycleService
        from operations.serializers import DeploymentListSerializer
        serializer = RelieveDeploymentActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        dep, history = LifecycleService.relieve_deployment(
            employee=employee,
            relieved_date=data.get('relieved_date'),
            relief_reason=data.get('relief_reason', ''),
            notes=data.get('notes', ''),
            approved_by=request.user,
            user=request.user
        )
        return Response({
            'status': 'success',
            'deployment': DeploymentListSerializer(dep).data,
            'history': EmploymentHistorySerializer(history).data
        })

    @action(detail=True, methods=['post'], url_path='suspend')
    def suspend(self, request, pk=None):
        employee = self.get_object()
        from hrm.serializers import SuspendEmployeeActionSerializer, EmploymentHistorySerializer
        from hrm.services.lifecycle_service import LifecycleService
        serializer = SuspendEmployeeActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        history = LifecycleService.suspend_employee(
            employee=employee,
            effective_date=data.get('effective_date'),
            reason=data.get('reason', ''),
            approved_by=request.user,
            user=request.user,
            notes=data.get('notes', '')
        )
        return Response({
            'status': 'success',
            'employee': EmployeeSerializer(employee).data,
            'history': EmploymentHistorySerializer(history).data
        })

    @action(detail=True, methods=['post'], url_path='reinstate')
    def reinstate(self, request, pk=None):
        employee = self.get_object()
        from hrm.serializers import ReinstateEmployeeActionSerializer, EmploymentHistorySerializer
        from hrm.services.lifecycle_service import LifecycleService
        serializer = ReinstateEmployeeActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        history = LifecycleService.reinstate_employee(
            employee=employee,
            effective_date=data.get('effective_date'),
            reason=data.get('reason', ''),
            approved_by=request.user,
            user=request.user,
            notes=data.get('notes', '')
        )
        return Response({
            'status': 'success',
            'employee': EmployeeSerializer(employee).data,
            'history': EmploymentHistorySerializer(history).data
        })

    @action(detail=True, methods=['post'], url_path='resign')
    def resign(self, request, pk=None):
        employee = self.get_object()
        from hrm.serializers import ResignEmployeeActionSerializer, EmploymentHistorySerializer
        from hrm.services.lifecycle_service import LifecycleService
        serializer = ResignEmployeeActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        history = LifecycleService.resign_employee(
            employee=employee,
            resignation_date=data.get('resignation_date'),
            last_working_date=data.get('last_working_date'),
            reason=data.get('reason', ''),
            notice_details=data.get('notice_details', ''),
            approved_by=request.user,
            user=request.user,
            notes=data.get('notes', '')
        )
        return Response({
            'status': 'success',
            'employee': EmployeeSerializer(employee).data,
            'history': EmploymentHistorySerializer(history).data
        })

    @action(detail=True, methods=['post'], url_path='terminate')
    def terminate(self, request, pk=None):
        employee = self.get_object()
        from hrm.serializers import TerminateEmployeeActionSerializer, EmploymentHistorySerializer
        from hrm.services.lifecycle_service import LifecycleService
        serializer = TerminateEmployeeActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        history = LifecycleService.terminate_employee(
            employee=employee,
            effective_date=data.get('effective_date'),
            reason=data.get('reason', ''),
            category=data.get('category', ''),
            authorized_by=request.user,
            user=request.user,
            notes=data.get('notes', '')
        )
        return Response({
            'status': 'success',
            'employee': EmployeeSerializer(employee).data,
            'history': EmploymentHistorySerializer(history).data
        })

    @action(detail=True, methods=['post'], url_path='resolve-jump')
    def resolve_jump(self, request, pk=None):
        employee = self.get_object()
        check_security_workforce_access(request, employee)
        from hrm.serializers import ResolveJumpActionSerializer, EmploymentHistorySerializer, JumpRecordSerializer
        from hrm.services.lifecycle_service import LifecycleService
        serializer = ResolveJumpActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        jump_rec, history = LifecycleService.resolve_jump(
            employee=employee,
            outcome=data['outcome'],
            jump_record_id=data.get('jump_record_id'),
            effective_date=data.get('effective_date'),
            reason=data.get('reason', ''),
            approved_by=request.user,
            user=request.user,
            notes=data.get('notes', '')
        )
        return Response({
            'status': 'success',
            'employee': EmployeeSerializer(employee).data,
            'history': EmploymentHistorySerializer(history).data if history else None,
            'jump_record': JumpRecordSerializer(jump_rec).data if jump_rec else None
        })

    @action(detail=True, methods=['post'], url_path='rehire')
    def rehire(self, request, pk=None):
        employee = self.get_object()
        from hrm.serializers import RehireEmployeeActionSerializer, EmploymentHistorySerializer
        from hrm.services.lifecycle_service import LifecycleService
        serializer = RehireEmployeeActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        desig_model = None
        if data.get('designation'):
            from hrm.models import Designation
            desig_model = get_object_or_404(Designation, pk=data['designation'], company=employee.company)

        dept_model = None
        if data.get('department'):
            from hrm.models import Department
            dept_model = get_object_or_404(Department, pk=data['department'], company=employee.company)

        emp, assign, history = LifecycleService.rehire_employee(
            employee=employee,
            rehire_date=data.get('rehire_date'),
            designation=desig_model,
            department=dept_model,
            classification=data.get('classification'),
            base_salary=data.get('base_salary'),
            daily_rate=data.get('daily_rate'),
            single_ot_rate=data.get('single_ot_rate'),
            double_ot_rate=data.get('double_ot_rate'),
            approved_by=request.user,
            user=request.user,
            notes=data.get('notes', '')
        )
        return Response({
            'status': 'success',
            'employee': EmployeeSerializer(emp).data,
            'history': EmploymentHistorySerializer(history).data
        })

    @action(detail=True, methods=['get'], url_path='timeline')
    def timeline(self, request, pk=None):
        employee = self.get_object()
        from hrm.services.lifecycle_service import LifecycleService
        timeline_data = LifecycleService.get_unified_timeline(employee)
        return Response(timeline_data)

    @action(detail=True, methods=['post'], url_path='record-event')
    def record_event(self, request, pk=None):
        employee = self.get_object()
        from hrm.models import EmploymentHistory
        from hrm.serializers import CreateLifecycleEventActionSerializer, EmploymentHistorySerializer
        from datetime import date
        serializer = CreateLifecycleEventActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        history = EmploymentHistory.objects.create(
            company=employee.company,
            employee=employee,
            event_type=data['event_type'],
            effective_date=data.get('effective_date') or date.today(),
            old_value=data.get('old_value', ''),
            new_value=data.get('new_value', ''),
            reason=data.get('reason', ''),
            notes=data.get('notes', ''),
            approved_by=request.user,
            changed_by=request.user,
            metadata=data.get('metadata', {})
        )
        return Response({
            'status': 'success',
            'history': EmploymentHistorySerializer(history).data
        })

    @action(detail=False, methods=['get'], url_path='export-register')
    def export_register(self, request):
        import csv
        import io
        from django.http import HttpResponse
        qs = self.filter_queryset(self.get_queryset())
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            'Employee Code', 'Legacy Code', 'Full Name', 'Father/Husband Name',
            'Gender', 'DOB', 'CNIC', 'Phone', 'Landline', 'Department', 'Designation',
            'Workforce Type', 'Joining Date', 'Status', 'EOBI #', 'SESSI #', 'Address'
        ])
        for emp in qs:
            writer.writerow([
                emp.employee_code,
                emp.previous_employee_code,
                emp.get_full_name(),
                emp.father_name,
                emp.gender,
                emp.date_of_birth.strftime('%Y-%m-%d') if emp.date_of_birth else '',
                emp.cnic_number,
                emp.phone or emp.telephone_number,
                emp.telephone_number,
                emp.department.name if emp.department else '',
                emp.designation.name if emp.designation else '',
                emp.workforce_type,
                emp.joining_date.strftime('%Y-%m-%d') if emp.joining_date else '',
                'ACTIVE' if emp.is_active else 'INACTIVE',
                emp.eobi_number,
                emp.sessi_number,
                emp.permanent_address or emp.current_address
            ])
        response = HttpResponse(output.getvalue(), content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="employee_register.csv"'
        return response

    @action(detail=False, methods=['get'], url_path='import-template')
    def import_template(self, request):
        from hrm.services.employee_import_service import EmployeeImportService
        from django.http import HttpResponse
        csv_data = EmployeeImportService.get_template_csv()
        response = HttpResponse(csv_data, content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="employee_import_template.csv"'
        return response

    @action(detail=False, methods=['post'], url_path='import-preview')
    def import_preview(self, request):
        from hrm.services.employee_import_service import EmployeeImportService
        file_obj = request.FILES.get('file')
        content = file_obj if file_obj else request.data.get('content', '')
        if not content:
            return Response({'error': 'CSV file or content is required.'}, status=status.HTTP_400_BAD_REQUEST)
        company_id = get_current_company() or getattr(request.user, 'company_id', None)
        res = EmployeeImportService.preview(company_id=company_id, file_content=content)
        return Response(res, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='import-execute')
    def import_execute(self, request):
        from hrm.services.employee_import_service import EmployeeImportService
        file_obj = request.FILES.get('file')
        content = file_obj if file_obj else request.data.get('content', '')
        if not content:
            return Response({'error': 'CSV file or content is required.'}, status=status.HTTP_400_BAD_REQUEST)
        update_existing = request.data.get('update_existing', False)
        if isinstance(update_existing, str):
            update_existing = update_existing.lower() in ('true', '1')
        company_id = get_current_company() or getattr(request.user, 'company_id', None)
        res = EmployeeImportService.execute(
            company_id=company_id,
            file_content=content,
            update_existing=update_existing,
            user=request.user
        )
        return Response(res, status=status.HTTP_200_OK)

class EmploymentViewSet(TenantModelViewSet):
    required_module = 'hr'
    queryset = Employment.objects.select_related(
        'employee', 'department', 'position', 'designation', 'branch'
    ).all()
    serializer_class = EmploymentSerializer
    permission_classes = [IsAuthenticated, ModulePermission]

class EmployeeRecordViewSet(TenantModelViewSet):
    required_module = 'hr'
    queryset = EmployeeRecord.objects.select_related('user', 'crm_entity', 'department').all()
    serializer_class = EmployeeRecordSerializer
    permission_classes = [IsAuthenticated, ModulePermission]

    def create(self, request, *args, **kwargs):
        from hrm.models import Employee, Employment, EmployeeRecord
        from crm.models import CRMEntity
        from django.utils import timezone
        
        company_id = request.user.company_id
        
        # We need to bridge legacy create to Universal
        # Standard legacy payload has 'user', 'department', 'salary' etc.
        data = request.data
        
        user_id = data.get('user')
        department_id = data.get('department')
        
        first_name = data.get('first_name', 'Employee')
        last_name = data.get('last_name', 'Unknown')
        
        # 1. Create Universal Employee
        employee = Employee.objects.create(
            company_id=company_id,
            user_id=user_id,
            department_id=department_id,
            first_name=first_name,
            last_name=last_name,
            is_active=True
        )
        
        # 2. Create Universal Employment
        employment = Employment.objects.create(
            company_id=company_id,
            employee=employee,
            department_id=department_id,
            employment_status='ACTIVE',
            employment_type='FULL_TIME',
            start_date=timezone.now().date(),
            is_current=True
        )
        
        # 3. Create the historical EmployeeRecord
        legacy_record = super().create(request, *args, **kwargs)
        record = EmployeeRecord.objects.get(id=legacy_record.data['id'])
        record.employee = employee
        record.save(update_fields=['employee'])
        
        legacy_record.data['id'] = record.id
        return legacy_record

class AttendanceViewSet(TenantModelViewSet):
    required_module = 'hr'
    queryset = Attendance.objects.select_related('employee').all()
    serializer_class = AttendanceSerializer
    permission_classes = [IsAuthenticated, ModulePermission]

    def create(self, request, *args, **kwargs):
        from hrm.models import WorkforceAttendance, Attendance
        from django.utils import timezone
        import datetime
        
        # We need to bridge legacy create to Universal
        data = request.data
        employee_id = data.get('employee')
        
        # 1. Create the legacy attendance
        legacy_response = super().create(request, *args, **kwargs)
        legacy = Attendance.objects.get(id=legacy_response.data['id'])
        
        # 2. Bridge to WorkforceAttendance
        if legacy.employee and legacy.employee.employee:
            new_att = WorkforceAttendance.objects.create(
                company_id=legacy.company_id,
                employee=legacy.employee.employee,
                date=legacy.date,
                check_in=datetime.datetime.combine(legacy.date, legacy.check_in) if legacy.check_in else None,
                check_out=datetime.datetime.combine(legacy.date, legacy.check_out) if legacy.check_out else None,
                source='MIGRATION'
            )
            legacy.workforce_attendance = new_att
            legacy.save(update_fields=['workforce_attendance'])
            
        return legacy_response

from .models import (
    WorkforceAttendance, Shift, WorkSchedule, LeaveType, LeaveBalance, LeaveRequest, Holiday, OvertimeRecord
)
from .serializers import (
    WorkforceAttendanceSerializer, ShiftSerializer, WorkScheduleSerializer, LeaveTypeSerializer, 
    LeaveBalanceSerializer, LeaveRequestSerializer, HolidaySerializer, OvertimeRecordSerializer
)

class WorkforceAttendanceViewSet(TenantModelViewSet):
    queryset = WorkforceAttendance.objects.select_related('employee', 'employment').all()
    serializer_class = WorkforceAttendanceSerializer

    @action(detail=False, methods=['get'], url_path='register')
    def register(self, request):
        company_id = get_current_company() or getattr(request.user, 'company_id', None)
        from hrm.services.attendance_register_service import AttendanceRegisterService
        data = AttendanceRegisterService.get_attendance_register(
            company_id=company_id,
            date_from=request.query_params.get('date_from'),
            date_to=request.query_params.get('date_to'),
            month=request.query_params.get('month'),
            year=request.query_params.get('year'),
            employee_id=request.query_params.get('employee_id'),
            employee_from=request.query_params.get('employee_from'),
            employee_to=request.query_params.get('employee_to'),
            workforce_type=request.query_params.get('workforce_type'),
            department_id=request.query_params.get('department_id'),
            designation_id=request.query_params.get('designation_id'),
            site_id=request.query_params.get('site_id'),
            shift_id=request.query_params.get('shift_id'),
            client_id=request.query_params.get('client_id'),
            status_filter=request.query_params.get('status')
        )
        return Response(data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='export-register')
    def export_register(self, request):
        company_id = get_current_company() or getattr(request.user, 'company_id', None)
        from hrm.services.attendance_register_service import AttendanceRegisterService
        data = AttendanceRegisterService.get_attendance_register(
            company_id=company_id,
            date_from=request.query_params.get('date_from'),
            date_to=request.query_params.get('date_to'),
            month=request.query_params.get('month'),
            year=request.query_params.get('year'),
            employee_id=request.query_params.get('employee_id'),
            employee_from=request.query_params.get('employee_from'),
            employee_to=request.query_params.get('employee_to'),
            workforce_type=request.query_params.get('workforce_type'),
            department_id=request.query_params.get('department_id'),
            designation_id=request.query_params.get('designation_id'),
            site_id=request.query_params.get('site_id'),
            shift_id=request.query_params.get('shift_id'),
            client_id=request.query_params.get('client_id'),
            status_filter=request.query_params.get('status')
        )
        csv_content = AttendanceRegisterService.export_attendance_register_csv(data)
        from django.http import HttpResponse
        response = HttpResponse(csv_content, content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="attendance_register.csv"'
        return response

class ShiftViewSet(TenantModelViewSet):
    queryset = Shift.objects.all()
    serializer_class = ShiftSerializer

class WorkScheduleViewSet(TenantModelViewSet):
    queryset = WorkSchedule.objects.select_related('employee', 'employment', 'shift').all()
    serializer_class = WorkScheduleSerializer

class LeaveTypeViewSet(TenantModelViewSet):
    queryset = LeaveType.objects.all()
    serializer_class = LeaveTypeSerializer

class LeaveBalanceViewSet(TenantModelViewSet):
    queryset = LeaveBalance.objects.select_related('employee', 'employment', 'leave_type').all()
    serializer_class = LeaveBalanceSerializer

class LeaveRequestViewSet(TenantModelViewSet):
    queryset = LeaveRequest.objects.select_related('employee', 'employment', 'leave_type', 'approved_by').all()
    serializer_class = LeaveRequestSerializer

class HolidayViewSet(TenantModelViewSet):
    queryset = Holiday.objects.all()
    serializer_class = HolidaySerializer

class OvertimeRecordViewSet(TenantModelViewSet):
    queryset = OvertimeRecord.objects.select_related('employee', 'employment', 'attendance', 'approved_by').all()
    serializer_class = OvertimeRecordSerializer


# ============================================================================
# PHASE 7D: UNIVERSAL PAYROLL FOUNDATION VIEWS
# ============================================================================

from hrm.models import (
    SalaryComponent, SalaryStructure, SalaryStructureComponent, EmployeeSalaryAssignment,
    PayrollPeriod, PayrollRun, Payslip, PayslipLine
)
from hrm.serializers import (
    SalaryComponentSerializer, SalaryStructureSerializer, SalaryStructureComponentSerializer,
    EmployeeSalaryAssignmentSerializer, PayrollPeriodSerializer, PayrollRunSerializer,
    PayslipSerializer, PayslipLineSerializer
)

class SalaryComponentViewSet(TenantModelViewSet):
    queryset = SalaryComponent.objects.filter(is_deleted=False)
    serializer_class = SalaryComponentSerializer
    module_name = 'HRM'

class SalaryStructureViewSet(TenantModelViewSet):
    queryset = SalaryStructure.objects.filter(is_deleted=False)
    serializer_class = SalaryStructureSerializer
    module_name = 'HRM'

class SalaryStructureComponentViewSet(TenantModelViewSet):
    queryset = SalaryStructureComponent.objects.filter(is_deleted=False)
    serializer_class = SalaryStructureComponentSerializer
    module_name = 'HRM'

class EmployeeSalaryAssignmentViewSet(TenantModelViewSet):
    queryset = EmployeeSalaryAssignment.objects.filter(is_deleted=False)
    serializer_class = EmployeeSalaryAssignmentSerializer
    module_name = 'HRM'

class PayrollPeriodViewSet(TenantModelViewSet):
    queryset = PayrollPeriod.objects.filter(is_deleted=False)
    serializer_class = PayrollPeriodSerializer
    module_name = 'HRM'

from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import status
from hrm.services.payroll_calculation import calculate_payroll_for_run, finalize_payroll_run, PayrollCalculationError

class PayrollRunViewSet(TenantModelViewSet):
    queryset = PayrollRun.objects.filter(is_deleted=False)
    serializer_class = PayrollRunSerializer
    module_name = 'HRM'
    permission_classes = [IsAuthenticated, RolePermission]
    required_read_permissions = ['hrm.read']
    required_write_permissions = ['hrm.write']
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager', 'staff']
    
    @action(detail=True, methods=['post'], url_path='calculate', url_name='calculate')
    def calculate_payroll(self, request, pk=None):
        payroll_run = self.get_object()
        try:
            results = calculate_payroll_for_run(
                company_id=request.user.company_id,
                run_id=payroll_run.id,
                user_id=request.user.id
            )
            # ExtraDuty reinjection
            try:
                from operations.services.payroll_bridge import reinject_approved_bridges_for_run
                reinject_results = reinject_approved_bridges_for_run(
                    payroll_run_id=payroll_run.id,
                    company_id=request.user.company_id
                )
                results['extra_duty_reinjection'] = reinject_results
            except ImportError:
                pass
            return Response({'status': 'calculation complete', 'results': results}, status=status.HTTP_200_OK)
        except PayrollCalculationError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': f'Unexpected error: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'], url_path='finalize', url_name='finalize')
    def finalize_payroll(self, request, pk=None):
        payroll_run = self.get_object()
        try:
            finalize_payroll_run(
                company_id=request.user.company_id,
                run_id=payroll_run.id,
                user_id=request.user.id
            )
            return Response({'status': 'payroll finalized'}, status=status.HTTP_200_OK)
        except PayrollCalculationError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': f'Unexpected error: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['get', 'post'], url_path='preview-finance', url_name='preview-finance')
    def preview_finance(self, request, pk=None):
        payroll_run = self.get_object()
        try:
            from hrm.services.finance_integration import preview_payroll_journal
            from rest_framework.exceptions import ValidationError
            lines = preview_payroll_journal(payroll_run)
            return Response({'status': 'preview generated', 'lines': [
                {
                    'account_id': l['account'].id,
                    'account_name': l['account'].name,
                    'description': l['description'],
                    'debit': str(l['debit']),
                    'credit': str(l['credit']),
                } for l in lines
            ]}, status=status.HTTP_200_OK)
        except ValidationError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': f'Unexpected error: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'], url_path='post-finance', url_name='post-finance')
    def post_finance(self, request, pk=None):
        payroll_run = self.get_object()
        try:
            from hrm.services.finance_integration import post_payroll_to_finance
            from rest_framework.exceptions import ValidationError
            journal_entry = post_payroll_to_finance(payroll_run.id, request.user.id)
            return Response({'status': 'finance posted', 'journal_entry_id': journal_entry.id}, status=status.HTTP_200_OK)
        except ValidationError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': f'Unexpected error: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class PayslipViewSet(TenantModelViewSet):
    queryset = Payslip.objects.filter(is_deleted=False)
    serializer_class = PayslipSerializer
    module_name = 'HRM'

    @action(detail=True, methods=['post'], url_path='toggle-hold')
    def toggle_hold(self, request, pk=None):
        payslip = self.get_object()
        payslip.is_stop_payment = not payslip.is_stop_payment
        if payslip.is_stop_payment:
            payslip.stop_payment_reason = request.data.get('reason', 'Payment hold placed')
            payslip.stop_payment_at = timezone.now()
            payslip.stop_payment_by = request.user
        else:
            payslip.stop_payment_reason = ''
            payslip.stop_payment_at = None
            payslip.stop_payment_by = None
        payslip.save()
        return Response(PayslipSerializer(payslip).data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='report')
    def report(self, request):
        company_id = get_current_company() or getattr(request.user, 'company_id', None)
        from hrm.services.payslip_report_service import PayslipReportService
        data = PayslipReportService.get_payslip_report(
            company_id=company_id,
            date_from=request.query_params.get('date_from'),
            date_to=request.query_params.get('date_to'),
            month_from=request.query_params.get('month_from'),
            month_to=request.query_params.get('month_to'),
            date_range_preset=request.query_params.get('date_range_preset'),
            employee_from=request.query_params.get('employee_from'),
            employee_to=request.query_params.get('employee_to'),
            employee_id=request.query_params.get('employee_id'),
            site_id=request.query_params.get('site_id') or request.query_params.get('location_id'),
            client_id=request.query_params.get('client_id'),
            region=request.query_params.get('region'),
            is_paid=request.query_params.get('is_paid', 'BOTH'),
            is_stop_payment=request.query_params.get('is_stop_payment', 'BOTH'),
            account_type=request.query_params.get('account_type', 'ALL'),
            in_main_payroll=request.query_params.get('in_main_payroll', 'true').lower() in ('true', '1')
        )
        return Response(data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='export-report')
    def export_report(self, request):
        company_id = get_current_company() or getattr(request.user, 'company_id', None)
        from hrm.services.payslip_report_service import PayslipReportService
        data = PayslipReportService.get_payslip_report(
            company_id=company_id,
            date_from=request.query_params.get('date_from'),
            date_to=request.query_params.get('date_to'),
            month_from=request.query_params.get('month_from'),
            month_to=request.query_params.get('month_to'),
            date_range_preset=request.query_params.get('date_range_preset'),
            employee_from=request.query_params.get('employee_from'),
            employee_to=request.query_params.get('employee_to'),
            employee_id=request.query_params.get('employee_id'),
            site_id=request.query_params.get('site_id') or request.query_params.get('location_id'),
            client_id=request.query_params.get('client_id'),
            region=request.query_params.get('region'),
            is_paid=request.query_params.get('is_paid', 'BOTH'),
            is_stop_payment=request.query_params.get('is_stop_payment', 'BOTH'),
            account_type=request.query_params.get('account_type', 'ALL'),
            in_main_payroll=request.query_params.get('in_main_payroll', 'true').lower() in ('true', '1')
        )
        csv_content = PayslipReportService.export_payslip_report_csv(data)
        from django.http import HttpResponse
        response = HttpResponse(csv_content, content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="payslip_report.csv"'
        return response

    @action(detail=False, methods=['post'], url_path='bulk-print')
    def bulk_print(self, request):
        company_id = get_current_company() or getattr(request.user, 'company_id', None)
        payslip_ids = request.data.get('payslip_ids', [])
        from hrm.services.payslip_report_service import PayslipReportService
        data = PayslipReportService.get_payslip_report(
            company_id=company_id,
            is_paid='BOTH',
            is_stop_payment='BOTH',
            account_type='ALL',
            in_main_payroll=False
        )
        if payslip_ids:
            p_set = set(str(pid) for pid in payslip_ids)
            data['rows'] = [r for r in data['rows'] if str(r['payslip_id']) in p_set]
        return Response(data, status=status.HTTP_200_OK)

class PayslipLineViewSet(TenantModelViewSet):
    queryset = PayslipLine.objects.filter(is_deleted=False)
    serializer_class = PayslipLineSerializer
    module_name = 'HRM'

from .serializers import (
    PayrollAccountingConfigurationSerializer,
    CompanyPayrollPolicySerializer,
    PayrollDisbursementSerializer,
    PayslipDisbursementSerializer
)
from .models import (
    PayrollAccountingConfiguration,
    CompanyPayrollPolicy,
    PayrollDisbursement,
    PayslipDisbursement
)

class CompanyPayrollPolicyViewSet(TenantModelViewSet):
    serializer_class = CompanyPayrollPolicySerializer

    def get_queryset(self):
        company_id = getattr(self.request.user, 'company_id', None)
        return CompanyPayrollPolicy.objects.filter(company_id=company_id, is_deleted=False)
        
    def perform_create(self, serializer):
        company_id = getattr(self.request.user, 'company_id', None)
        # Ensure only one active policy
        CompanyPayrollPolicy.objects.filter(company_id=company_id, is_active=True).update(is_active=False)
        serializer.save(company_id=company_id)

class PayrollAccountingConfigurationViewSet(TenantModelViewSet):
    queryset = PayrollAccountingConfiguration.objects.all()
    serializer_class = PayrollAccountingConfigurationSerializer
    module_name = 'HRM'


# ============================================================================
# PHASE C-1: RECRUITMENT & VETTING
# ============================================================================
from .models import Candidate, CandidateDocument, CandidateVerification
from .serializers import CandidateSerializer, CandidateDocumentSerializer, CandidateVerificationSerializer
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import transaction
import datetime
from django.http import HttpResponseForbidden, FileResponse

class CandidateViewSet(TenantModelViewSet):
    queryset = Candidate.objects.all()
    serializer_class = CandidateSerializer
    filterset_fields = ['status', 'applied_designation']
    search_fields = ['candidate_number', 'first_name', 'last_name', 'national_id', 'phone']

    @action(detail=True, methods=['post'])
    def select(self, request, pk=None):
        candidate = self.get_object()
        if candidate.status not in ['APPLIED', 'SCREENING', 'VERIFICATION']:
            return Response({'error': 'Invalid status transition'}, status=400)
        candidate.status = 'SELECTED'
        candidate.selection_date = datetime.date.today()
        candidate.selected_by = request.user
        candidate.save()
        return Response(CandidateSerializer(candidate).data)

    @action(detail=True, methods=['post'])
    def hire(self, request, pk=None):
        candidate = self.get_object()
        if candidate.status != 'SELECTED' and candidate.status != 'VERIFICATION':
            return Response({'error': 'Candidate must be SELECTED or VERIFICATION to hire'}, status=400)
        
        if candidate.converted_employee:
            return Response({'error': 'Candidate already hired'}, status=400)

        with transaction.atomic():
            from .models import Employee, Employment
            employee = Employee.objects.create(
                company=request.company,
                first_name=candidate.first_name,
                last_name=candidate.last_name,
                email=candidate.email,
                phone=candidate.phone,
                date_of_birth=candidate.date_of_birth,
                hire_date=datetime.date.today(),
                designation=candidate.applied_designation,
                is_active=True
            )
            
            employment = Employment.objects.create(
                company=request.company,
                employee=employee,
                employment_type='FULL_TIME',
                employment_status='ACTIVE',
                designation=candidate.applied_designation,
                start_date=datetime.date.today(),
                is_current=True
            )
            
            candidate.converted_employee = employee
            candidate.status = 'HIRED'
            candidate.save()

        return Response(CandidateSerializer(candidate).data)

class CandidateDocumentViewSet(TenantModelViewSet):
    queryset = CandidateDocument.objects.all()
    serializer_class = CandidateDocumentSerializer
    filterset_fields = ['candidate', 'document_type']

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        doc = self.get_object()
        if not doc.attachment:
            return Response({'error': 'No attachment'}, status=404)
        return FileResponse(doc.attachment.open('rb'), as_attachment=True, filename=doc.attachment.name)

class CandidateVerificationViewSet(TenantModelViewSet):
    queryset = CandidateVerification.objects.all()
    serializer_class = CandidateVerificationSerializer
    filterset_fields = ['candidate', 'status', 'verification_type']

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        ver = self.get_object()
        if not ver.attachment:
            return Response({'error': 'No attachment'}, status=404)
        return FileResponse(ver.attachment.open('rb'), as_attachment=True, filename=ver.attachment.name)

# ==============================================================================
# PHASE C-6: STATUTORY PAYROLL & PAYROLL DISBURSEMENT
# ==============================================================================
from .models import (
    StatutoryScheme, StatutoryRule, EmployeeStatutoryEnrollment,
    PayslipStatutoryDeduction, PayrollDisbursement, PayslipDisbursement
)
from .serializers import (
    StatutorySchemeSerializer, StatutoryRuleSerializer, EmployeeStatutoryEnrollmentSerializer,
    PayslipStatutoryDeductionSerializer, PayrollDisbursementSerializer, PayslipDisbursementSerializer
)

class StatutorySchemeViewSet(TenantModelViewSet):
    queryset = StatutoryScheme.objects.all()
    serializer_class = StatutorySchemeSerializer

class StatutoryRuleViewSet(TenantModelViewSet):
    queryset = StatutoryRule.objects.all()
    serializer_class = StatutoryRuleSerializer

class EmployeeStatutoryEnrollmentViewSet(TenantModelViewSet):
    queryset = EmployeeStatutoryEnrollment.objects.all()
    serializer_class = EmployeeStatutoryEnrollmentSerializer

class PayrollDisbursementViewSet(TenantModelViewSet):
    queryset = PayrollDisbursement.objects.all()
    serializer_class = PayrollDisbursementSerializer

    @action(detail=True, methods=['post'])
    def process_disbursement(self, request, pk=None):
        disbursement = self.get_object()
        from .services.payroll_disbursement_service import execute_payroll_disbursement
        try:
            execute_payroll_disbursement(disbursement, request.user)
            return Response({'status': 'Disbursement completed successfully.'})
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

class PayslipDisbursementViewSet(TenantModelViewSet):
    queryset = PayslipDisbursement.objects.all()
    serializer_class = PayslipDisbursementSerializer


# ==============================================================================
# PHASE S-5A: WORKFORCE FOUNDATION VIEWSETS
# ==============================================================================
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import status
from .models import (
    EmployeeNextOfKin, EmployeeDocument, EmployeeTraining, EmploymentHistory,
    StatutorySchemeRateHistory, EmployeeReference
)
from .serializers import (
    EmployeeNextOfKinSerializer, EmployeeDocumentSerializer, EmployeeTrainingSerializer,
    EmploymentHistorySerializer, StatutorySchemeRateHistorySerializer, EmployeeReferenceSerializer
)

class EmployeeNextOfKinViewSet(TenantModelViewSet):
    queryset = EmployeeNextOfKin.objects.select_related('employee').all()
    serializer_class = EmployeeNextOfKinSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['employee', 'is_primary']

class EmployeeDocumentViewSet(TenantModelViewSet):
    queryset = EmployeeDocument.objects.select_related('employee', 'verified_by').all()
    serializer_class = EmployeeDocumentSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['employee', 'document_type', 'verification_status']

    @action(detail=True, methods=['post'])
    def verify(self, request, pk=None):
        doc = self.get_object()
        verification_status = request.data.get('verification_status', 'VERIFIED')
        notes = request.data.get('notes', '')
        doc.verify(user=request.user, status_val=verification_status, notes_val=notes)
        return Response(EmployeeDocumentSerializer(doc).data, status=status.HTTP_200_OK)

class EmployeeTrainingViewSet(TenantModelViewSet):
    queryset = EmployeeTraining.objects.select_related('employee').all()
    serializer_class = EmployeeTrainingSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['employee', 'status', 'training_type']

class EmploymentHistoryViewSet(TenantModelViewSet):
    queryset = EmploymentHistory.objects.select_related('employee', 'changed_by').all()
    serializer_class = EmploymentHistorySerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['employee', 'event_type']

class StatutorySchemeRateHistoryViewSet(TenantModelViewSet):
    queryset = StatutorySchemeRateHistory.objects.select_related('scheme').all()
    serializer_class = StatutorySchemeRateHistorySerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['scheme']

class EmployeeReferenceViewSet(TenantModelViewSet):
    queryset = EmployeeReference.objects.select_related('employee', 'verified_by').all()
    serializer_class = EmployeeReferenceSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['employee', 'is_verified']

    @action(detail=True, methods=['post'], url_path='verify')
    def verify(self, request, pk=None):
        ref = self.get_object()
        ref.is_verified = True
        ref.verified_by = request.user
        ref.verified_at = timezone.now()
        ref.remarks = request.data.get('remarks', ref.remarks)
        ref.save()
        return Response(EmployeeReferenceSerializer(ref).data, status=status.HTTP_200_OK)

