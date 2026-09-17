import logging
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated, BasePermission
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView
from django.utils import timezone
from django.db.models import Count, Q, OuterRef, Subquery, IntegerField, Value
from django.db.models.functions import Coalesce
from datetime import date, timedelta
from erp_core.views import TenantModelViewSet
from erp_core.permissions import RolePermission
from platform_core.permissions import ModulePermission
from erp_core.middleware import get_current_company
from hrm.models import EmploymentHistory

from .models import (
    OperationalSite, ServiceContract, ContractRate,
    Deployment, DeploymentStatus, DeploymentAssignmentType, SecurityPost,
    PostShiftRequirement, DutyRoster, DutyRosterStatus, DutyReplacement, DutySwap,
    DutyAssignment, DutyAssignmentStatus,
    ExtraDuty,
    TemporaryServiceRequest, TemporaryServiceLine,
    QAChecklistTemplate, QAChecklistItem, QAInspection,
    QAInspectionResponse, QAFinding, CorrectiveAction,
    IncidentReport, IncidentAttachment, DailyActivityReport, DailyActivityEntry,
    SiteStaffingRequirement,
    DailyDutyPay, DailyPayRateSource, DailyPayCalculationStatus
)
from .serializers import (
    OperationalSiteSerializer, ServiceContractSerializer,
    ContractRateSerializer, DeploymentSerializer,
    DutyAssignmentSerializer, ExtraDutySerializer,
    TemporaryServiceRequestSerializer, TemporaryServiceLineSerializer,
    QAChecklistTemplateSerializer, QAChecklistItemSerializer, QAInspectionSerializer,
    QAInspectionResponseSerializer, QAFindingSerializer, CorrectiveActionSerializer,
    DeploymentListSerializer, SecurityAttendanceSerializer,
    EquipmentIssueSerializer,
    IncidentReportSerializer, IncidentAttachmentSerializer,
    DailyActivityReportSerializer, DailyActivityEntrySerializer,
    SecurityPostSerializer, DeploymentRelieveSerializer, DeploymentTransferSerializer,
    PostShiftRequirementSerializer, DutyRosterSerializer, DutyReplacementSerializer,
    AssignDutyReplacementActionSerializer, ShiftSwapActionSerializer, BulkGenerateRosterSerializer,
    SetAttendanceActionSerializer, BulkSetAttendanceActionSerializer,
    ApplyLeaveActionSerializer, RestoreJumpActionSerializer,
    SiteStaffingRequirementSerializer,
    DailyDutyPaySerializer, GenerateDailyPayActionSerializer,
    BulkGenerateDailyPayActionSerializer, RecalculateDailyPayActionSerializer
)
from .services.duty_pay_service import (
    generate_daily_duty_pay,
    bulk_generate_daily_pay_inputs,
    recalculate_daily_duty_pay,
    get_daily_pay_review_workspace
)
from .services.control_center_service import ControlCenterService
from hrm.serializers import JumpRecordSerializer, EmployeeAttendanceStateSerializer

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Base Permission Class
# ---------------------------------------------------------------------------

class BaseSecurityOpsViewSet(TenantModelViewSet):
    required_module = 'security_ops'
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager', 'staff']
    required_permissions = ['operations.read']
    
    site_filter_field = 'site_id'

    def get_queryset(self):
        qs = super().get_queryset()
        company_role = getattr(self.request.user, 'company_role', None)
        
        if company_role:
            if 'operations.all_sites' not in company_role.permissions and 'operations.assigned_sites' in company_role.permissions:
                if self.site_filter_field:
                    authorized_site_ids = self.request.user.site_accesses.values_list('site_id', flat=True)
                    kwargs = {f"{self.site_filter_field}__in": authorized_site_ids}
                    qs = qs.filter(**kwargs).distinct()
        return qs


# ---------------------------------------------------------------------------
# Sites
# ---------------------------------------------------------------------------

class OperationalSiteViewSet(BaseSecurityOpsViewSet):
    queryset = OperationalSite.objects.select_related('crm_entity').all()
    serializer_class = OperationalSiteSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'address', 'crm_entity__name']
    ordering_fields = ['name', 'created_at']
    site_filter_field = 'id'

    def get_queryset(self):
        qs = super().get_queryset()
        status_param = self.request.query_params.get('is_active')
        customer_id = self.request.query_params.get('customer')
        if status_param is not None:
            qs = qs.filter(is_active=status_param.lower() == 'true')
        if customer_id:
            qs = qs.filter(crm_entity_id=customer_id)
        return qs

    @action(detail=True, methods=['get'], url_path='manpower-summary')
    def manpower_summary(self, request, pk=None):
        site = self.get_object()
        from operations.services.manpower import calculate_site_manpower
        return Response(calculate_site_manpower(site))


# ---------------------------------------------------------------------------
# Security Posts
# ---------------------------------------------------------------------------

class SecurityPostViewSet(BaseSecurityOpsViewSet):
    queryset = SecurityPost.objects.select_related('site', 'service_contract', 'required_designation').all()
    serializer_class = SecurityPostSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['post_name', 'post_code', 'site__name', 'required_designation__name']
    ordering_fields = ['post_name', 'required_headcount', 'created_at']
    site_filter_field = 'site_id'

    def get_queryset(self):
        qs = super().get_queryset()
        site_id = self.request.query_params.get('site')
        contract_id = self.request.query_params.get('contract')
        is_active = self.request.query_params.get('is_active')
        if site_id:
            qs = qs.filter(site_id=site_id)
        if contract_id:
            qs = qs.filter(service_contract_id=contract_id)
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == 'true')
        return qs

    @action(detail=True, methods=['get', 'post'], url_path='shift-requirements')
    def shift_requirements(self, request, pk=None):
        post = self.get_object()
        if request.method == 'GET':
            reqs = post.shift_requirements.filter(is_deleted=False).select_related('shift', 'post')
            serializer = PostShiftRequirementSerializer(reqs, many=True)
            return Response(serializer.data)
        elif request.method == 'POST':
            data = request.data.copy()
            data['post'] = post.id
            serializer = PostShiftRequirementSerializer(data=data, context={'request': request})
            serializer.is_valid(raise_exception=True)
            serializer.save(company_id=post.company_id)
            return Response(serializer.data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Post Shift Requirements
# ---------------------------------------------------------------------------

class PostShiftRequirementViewSet(BaseSecurityOpsViewSet):
    queryset = PostShiftRequirement.objects.select_related('post', 'post__site', 'shift').all()
    serializer_class = PostShiftRequirementSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['post__post_name', 'shift__name', 'post__site__name']
    ordering_fields = ['post__post_name', 'required_headcount', 'created_at']
    site_filter_field = 'post__site_id'

    def get_queryset(self):
        qs = super().get_queryset()
        post_id = self.request.query_params.get('post')
        shift_id = self.request.query_params.get('shift')
        site_id = self.request.query_params.get('site')
        if post_id:
            qs = qs.filter(post_id=post_id)
        if shift_id:
            qs = qs.filter(shift_id=shift_id)
        if site_id:
            qs = qs.filter(post__site_id=site_id)
        return qs


# ---------------------------------------------------------------------------
# Duty Rosters
# ---------------------------------------------------------------------------

class DutyRosterViewSet(BaseSecurityOpsViewSet):
    queryset = DutyRoster.objects.select_related(
        'employee', 'employee__designation', 'site', 'post', 'shift',
        'replacement_for__employee', 'deployment'
    ).all()
    serializer_class = DutyRosterSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['employee__first_name', 'employee__last_name', 'employee__employee_code', 'site__name', 'post__post_name', 'shift__name']
    ordering_fields = ['duty_date', 'created_at']
    site_filter_field = 'site_id'

    def get_queryset(self):
        qs = super().get_queryset()
        site_id = self.request.query_params.get('site')
        post_id = self.request.query_params.get('post')
        shift_id = self.request.query_params.get('shift')
        employee_id = self.request.query_params.get('employee')
        duty_date = self.request.query_params.get('date') or self.request.query_params.get('duty_date')
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        status_param = self.request.query_params.get('status')
        is_replacement = self.request.query_params.get('is_replacement')

        if site_id:
            qs = qs.filter(site_id=site_id)
        if post_id:
            qs = qs.filter(post_id=post_id)
        if shift_id:
            qs = qs.filter(shift_id=shift_id)
        if employee_id:
            qs = qs.filter(employee_id=employee_id)
        if duty_date:
            qs = qs.filter(duty_date=duty_date)
        if date_from:
            qs = qs.filter(duty_date__gte=date_from)
        if date_to:
            qs = qs.filter(duty_date__lte=date_to)
        if status_param:
            qs = qs.filter(status=status_param.upper())
        if is_replacement is not None:
            qs = qs.filter(is_replacement=is_replacement.lower() == 'true')
        return qs

    @action(detail=False, methods=['get'], url_path='coverage-summary')
    def coverage_summary(self, request):
        site_id = request.query_params.get('site')
        duty_date = request.query_params.get('date') or request.query_params.get('duty_date') or str(timezone.now().date())
        shift_id = request.query_params.get('shift')

        if not site_id:
            return Response({'error': 'site parameter is required'}, status=status.HTTP_400_BAD_REQUEST)

        from operations.services.roster_coverage import calculate_site_shift_coverage
        try:
            summary = calculate_site_shift_coverage(site_id, duty_date, shift_id=shift_id)
            return Response(summary)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], url_path='range-coverage')
    def range_coverage(self, request):
        site_id = request.query_params.get('site')
        start_date = request.query_params.get('start_date') or str(timezone.now().date())
        end_date = request.query_params.get('end_date') or str(timezone.now().date() + timedelta(days=6))

        if not site_id:
            return Response({'error': 'site parameter is required'}, status=status.HTTP_400_BAD_REQUEST)

        from operations.services.roster_coverage import calculate_range_coverage
        try:
            summary = calculate_range_coverage(site_id, start_date, end_date)
            return Response(summary)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='assign-replacement')
    def assign_replacement(self, request):
        serializer = AssignDutyReplacementActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        company = get_current_company()
        company_id = company.id if company else request.user.company_id

        try:
            original_roster = DutyRoster.objects.select_related('employee', 'site', 'post', 'shift').get(
                pk=data['original_roster_id'],
                company_id=company_id,
                is_deleted=False
            )
        except DutyRoster.DoesNotExist:
            return Response({'error': 'Original duty roster slot not found.'}, status=status.HTTP_404_NOT_FOUND)

        if original_roster.status not in [DutyRosterStatus.SCHEDULED]:
            return Response(
                {'error': f'Cannot replace duty with status {original_roster.status}. Must be SCHEDULED.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        from hrm.models import Employee
        try:
            replacement_emp = Employee.objects.get(
                pk=data['replacement_employee_id'],
                company_id=company_id,
                is_deleted=False
            )
        except Employee.DoesNotExist:
            return Response({'error': 'Replacement employee not found in this company.'}, status=status.HTTP_404_NOT_FOUND)

        if replacement_emp.employment_status != 'ACTIVE':
            return Response(
                {'error': f'Replacement employee must be ACTIVE (currently {replacement_emp.employment_status}).'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if replacement_emp.id == original_roster.employee_id:
            return Response({'error': 'Replacement employee cannot be the same as original employee.'}, status=status.HTTP_400_BAD_REQUEST)

        conflict = DutyRoster.objects.filter(
            company_id=company_id,
            employee=replacement_emp,
            duty_date=original_roster.duty_date,
            shift=original_roster.shift,
            status__in=[DutyRosterStatus.SCHEDULED, DutyRosterStatus.COMPLETED],
            is_deleted=False
        ).exists()

        if conflict:
            return Response({
                'error': f'Replacement employee {replacement_emp.full_name or replacement_emp.first_name} already has an active duty scheduled on {original_roster.duty_date} for {original_roster.shift.name}.'
            }, status=status.HTTP_400_BAD_REQUEST)

        from django.db import transaction
        with transaction.atomic():
            original_roster.status = DutyRosterStatus.REPLACED
            original_roster.notes = f"{original_roster.notes}\n[REPLACED] Replaced by {replacement_emp.full_name or replacement_emp.first_name}: {data['reason']}".strip()
            original_roster.save(update_fields=['status', 'notes', 'updated_at'])

            new_roster = DutyRoster.objects.create(
                company_id=company_id,
                duty_date=original_roster.duty_date,
                shift=original_roster.shift,
                site=original_roster.site,
                post=original_roster.post,
                employee=replacement_emp,
                deployment=None,
                status=DutyRosterStatus.SCHEDULED,
                is_replacement=True,
                replacement_for=original_roster,
                rostered_by=request.user,
                notes=f"[REPLACEMENT COVERAGE] Covering for {original_roster.employee.full_name or original_roster.employee.first_name}. Reason: {data['reason']}"
            )

            replacement_log = DutyReplacement.objects.create(
                company_id=company_id,
                original_roster=original_roster,
                original_employee=original_roster.employee,
                replacement_employee=replacement_emp,
                site=original_roster.site,
                post=original_roster.post,
                shift=original_roster.shift,
                duty_date=original_roster.duty_date,
                reason=data['reason'],
                status='ASSIGNED',
                assigned_by=request.user,
                replacement_roster=new_roster,
                notes=data.get('notes', '')
            )

        return Response({
            'message': 'Replacement employee successfully assigned.',
            'replacement_id': str(replacement_log.id),
            'new_roster_id': str(new_roster.id),
            'original_roster_id': str(original_roster.id)
        }, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], url_path='swap-duty')
    def swap_duty(self, request):
        serializer = ShiftSwapActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        company = get_current_company()
        company_id = company.id if company else request.user.company_id

        try:
            roster_a = DutyRoster.objects.select_related('employee', 'shift', 'site').get(
                pk=data['roster_a_id'],
                company_id=company_id,
                is_deleted=False
            )
            roster_b = DutyRoster.objects.select_related('employee', 'shift', 'site').get(
                pk=data['roster_b_id'],
                company_id=company_id,
                is_deleted=False
            )
        except DutyRoster.DoesNotExist:
            return Response({'error': 'One or both duty roster records not found.'}, status=status.HTTP_404_NOT_FOUND)

        if roster_a.status != DutyRosterStatus.SCHEDULED or roster_b.status != DutyRosterStatus.SCHEDULED:
            return Response({'error': 'Only SCHEDULED duties can be swapped.'}, status=status.HTTP_400_BAD_REQUEST)

        emp_a = roster_a.employee
        emp_b = roster_b.employee

        if emp_a.id == emp_b.id:
            return Response({'error': 'Cannot swap duty with the same employee.'}, status=status.HTTP_400_BAD_REQUEST)

        conflict_a = DutyRoster.objects.filter(
            company_id=company_id,
            employee=emp_a,
            duty_date=roster_b.duty_date,
            shift=roster_b.shift,
            status__in=[DutyRosterStatus.SCHEDULED, DutyRosterStatus.COMPLETED],
            is_deleted=False
        ).exclude(pk=roster_a.id).exists()

        if conflict_a:
            return Response({'error': f'Employee {emp_a.full_name or emp_a.first_name} already has a duty scheduled on {roster_b.duty_date} for {roster_b.shift.name}.'}, status=status.HTTP_400_BAD_REQUEST)

        conflict_b = DutyRoster.objects.filter(
            company_id=company_id,
            employee=emp_b,
            duty_date=roster_a.duty_date,
            shift=roster_a.shift,
            status__in=[DutyRosterStatus.SCHEDULED, DutyRosterStatus.COMPLETED],
            is_deleted=False
        ).exclude(pk=roster_b.id).exists()

        if conflict_b:
            return Response({'error': f'Employee {emp_b.full_name or emp_b.first_name} already has a duty scheduled on {roster_a.duty_date} for {roster_a.shift.name}.'}, status=status.HTTP_400_BAD_REQUEST)

        from django.db import transaction
        with transaction.atomic():
            roster_a.employee = emp_b
            roster_a.notes = f"{roster_a.notes}\n[SWAPPED] Swapped with {emp_a.full_name or emp_a.first_name}. Reason: {data.get('reason', 'Shift swap')}".strip()
            roster_a.save(update_fields=['employee', 'notes', 'updated_at'])

            roster_b.employee = emp_a
            roster_b.notes = f"{roster_b.notes}\n[SWAPPED] Swapped with {emp_b.full_name or emp_b.first_name}. Reason: {data.get('reason', 'Shift swap')}".strip()
            roster_b.save(update_fields=['employee', 'notes', 'updated_at'])

            swap_record = DutySwap.objects.create(
                company_id=company_id,
                roster_a=roster_a,
                roster_b=roster_b,
                employee_a=emp_a,
                employee_b=emp_b,
                reason=data.get('reason', ''),
                swapped_by=request.user
            )

        return Response({
            'message': f'Duties successfully swapped between {emp_a.full_name or emp_a.first_name} and {emp_b.full_name or emp_b.first_name}.',
            'swap_id': str(swap_record.id)
        })

    @action(detail=False, methods=['post'], url_path='bulk-generate')
    def bulk_generate(self, request):
        serializer = BulkGenerateRosterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        company = get_current_company()
        company_id = company.id if company else request.user.company_id

        deployments = Deployment.objects.filter(
            company_id=company_id,
            site_id=data['site_id'],
            status=DeploymentStatus.ACTIVE,
            is_deleted=False
        ).select_related('employee', 'post')

        created_count = 0
        skipped_count = 0

        for dep in deployments:
            if getattr(dep.employee, 'employment_status', None) != 'ACTIVE':
                skipped_count += 1
                continue

            exists = DutyRoster.objects.filter(
                company_id=company_id,
                employee=dep.employee,
                duty_date=data['duty_date'],
                shift_id=data['shift_id'],
                status__in=[DutyRosterStatus.SCHEDULED, DutyRosterStatus.COMPLETED],
                is_deleted=False
            ).exists()

            if exists:
                skipped_count += 1
                continue

            DutyRoster.objects.create(
                company_id=company_id,
                duty_date=data['duty_date'],
                shift_id=data['shift_id'],
                site_id=data['site_id'],
                post=dep.post,
                employee=dep.employee,
                deployment=dep,
                status=DutyRosterStatus.SCHEDULED,
                rostered_by=request.user,
                notes="Auto-generated from active deployment."
            )
            created_count += 1

        return Response({
            'message': f'Roster generated: {created_count} scheduled, {skipped_count} skipped.',
            'created_count': created_count,
            'skipped_count': skipped_count
        })

    @action(detail=False, methods=['get'], url_path='by-employee')
    def by_employee(self, request):
        emp_id = request.query_params.get('employee')
        if not emp_id:
            return Response({'error': 'employee parameter required'}, status=status.HTTP_400_BAD_REQUEST)

        qs = self.get_queryset().filter(employee_id=emp_id)
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        if date_from:
            qs = qs.filter(duty_date__gte=date_from)
        if date_to:
            qs = qs.filter(duty_date__lte=date_to)

        serializer = self.get_serializer(qs.order_by('-duty_date')[:100], many=True)
        return Response(serializer.data)


# ---------------------------------------------------------------------------
# Duty Replacements
# ---------------------------------------------------------------------------

class DutyReplacementViewSet(BaseSecurityOpsViewSet):
    queryset = DutyReplacement.objects.select_related(
        'original_employee', 'replacement_employee', 'site', 'post', 'shift', 'assigned_by'
    ).all()
    serializer_class = DutyReplacementSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['original_employee__first_name', 'replacement_employee__first_name', 'site__name', 'reason']
    ordering_fields = ['duty_date', 'created_at']
    site_filter_field = 'site_id'

    def get_queryset(self):
        qs = super().get_queryset()
        site_id = self.request.query_params.get('site')
        duty_date = self.request.query_params.get('date')
        if site_id:
            qs = qs.filter(site_id=site_id)
        if duty_date:
            qs = qs.filter(duty_date=duty_date)
        return qs


# ---------------------------------------------------------------------------
# Contracts
# ---------------------------------------------------------------------------

class ServiceContractViewSet(BaseSecurityOpsViewSet):
    queryset = ServiceContract.objects.select_related('crm_entity').prefetch_related('sites').all()
    serializer_class = ServiceContractSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['contract_code', 'crm_entity__name']
    ordering_fields = ['start_date', 'created_at']
    site_filter_field = 'sites__id'

    def get_queryset(self):
        qs = super().get_queryset()
        status_param = self.request.query_params.get('status')
        customer_id = self.request.query_params.get('customer')
        if status_param:
            qs = qs.filter(status__iexact=status_param)
        if customer_id:
            qs = qs.filter(crm_entity_id=customer_id)
        return qs


# ---------------------------------------------------------------------------
# Contract Rates
# ---------------------------------------------------------------------------

class ContractRateViewSet(BaseSecurityOpsViewSet):
    queryset = ContractRate.objects.select_related('service_contract', 'designation').all()
    serializer_class = ContractRateSerializer
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ['effective_date', 'created_at']
    site_filter_field = 'service_contract__sites__id'

    def get_queryset(self):
        qs = super().get_queryset()
        contract_id = self.request.query_params.get('contract')
        if contract_id:
            qs = qs.filter(service_contract_id=contract_id)
        return qs


# ---------------------------------------------------------------------------
# Deployments — with staffing annotations
# ---------------------------------------------------------------------------

class DeploymentViewSet(BaseSecurityOpsViewSet):
    """
    Each Deployment = one Employee at one Site/Post under one Designation.
    Manages active, relieved, transferred deployments with strict rules and history.
    """
    queryset = Deployment.objects.select_related(
        'employee', 'employee__user', 'site', 'post', 'service_contract', 'designation', 'crm_entity'
    ).all()
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = [
        'employee__first_name', 'employee__last_name', 'employee__employee_code',
        'site__name', 'post__post_name', 'designation__name', 'service_contract__contract_code'
    ]
    ordering_fields = ['start_date', 'created_at', 'status']

    def get_serializer_class(self):
        if self.action in ['list', 'employee_history']:
            return DeploymentListSerializer
        return DeploymentSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        site_id = self.request.query_params.get('site')
        post_id = self.request.query_params.get('post')
        employee_id = self.request.query_params.get('employee')
        contract_id = self.request.query_params.get('contract')
        designation_id = self.request.query_params.get('designation')
        assignment_type = self.request.query_params.get('assignment_type')
        status_param = self.request.query_params.get('status')
        active_on = self.request.query_params.get('active_on')  # YYYY-MM-DD

        if site_id:
            qs = qs.filter(site_id=site_id)
        if post_id:
            qs = qs.filter(post_id=post_id)
        if employee_id:
            qs = qs.filter(employee_id=employee_id)
        if contract_id:
            qs = qs.filter(service_contract_id=contract_id)
        if designation_id:
            qs = qs.filter(designation_id=designation_id)
        if assignment_type:
            qs = qs.filter(assignment_type__iexact=assignment_type)
        if status_param:
            qs = qs.filter(status__iexact=status_param)
        if active_on:
            try:
                from datetime import date
                d = date.fromisoformat(active_on)
                qs = qs.filter(
                    start_date__lte=d
                ).filter(
                    Q(end_date__isnull=True) | Q(end_date__gte=d)
                )
            except ValueError:
                pass
        return qs

    def perform_create(self, serializer):
        user = self.request.user if self.request.user.is_authenticated else None
        dep = serializer.save(assigned_by=user)
        if dep.status == DeploymentStatus.ACTIVE:
            try:
                EmploymentHistory.objects.create(
                    company=dep.company,
                    employee=dep.employee,
                    event_type='TRANSFER',
                    effective_date=dep.start_date,
                    changed_by=user,
                    notes=f"Deployment assigned: Site '{dep.site.name}', Post '{dep.post.post_name if dep.post else 'General'}', Type: {dep.assignment_type}"
                )
            except Exception as e:
                logger.warning(f"Could not log EmploymentHistory on deployment create: {e}")

    @action(detail=False, methods=['post'], url_path='assign')
    def assign(self, request):
        serializer = DeploymentSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path='site-manpower')
    def site_manpower(self, request):
        site_id = request.query_params.get('site')
        company_id = get_current_company() or request.META.get('HTTP_X_COMPANY_ID') or getattr(request.user, 'company_id', None)
        if not company_id:
            return Response({'error': 'Company context required.'}, status=400)
        from operations.services.manpower import calculate_site_manpower, calculate_all_sites_manpower
        if site_id:
            site = OperationalSite.objects.filter(id=site_id, company_id=company_id).first()
            if not site:
                return Response({'error': 'Site not found.'}, status=404)
            return Response(calculate_site_manpower(site))
        return Response(calculate_all_sites_manpower(company_id))

    @action(detail=False, methods=['get'], url_path='current')
    def current_deployment(self, request):
        employee_id = request.query_params.get('employee')
        if not employee_id:
            return Response({'error': 'employee query parameter is required.'}, status=400)
        dep = self.get_queryset().filter(employee_id=employee_id, status=DeploymentStatus.ACTIVE).first()
        if not dep:
            return Response(None, status=200)
        return Response(DeploymentListSerializer(dep).data)

    @action(detail=False, methods=['get'], url_path='employee-history')
    def employee_history(self, request):
        employee_id = request.query_params.get('employee')
        if not employee_id:
            return Response({'error': 'employee query parameter is required.'}, status=400)
        deps = self.get_queryset().filter(employee_id=employee_id).order_by('-start_date')
        return Response(DeploymentListSerializer(deps, many=True).data)

    @action(detail=True, methods=['post'], url_path='relieve')
    def relieve(self, request, pk=None):
        deployment = self.get_object()
        if deployment.status != DeploymentStatus.ACTIVE:
            return Response({'error': 'Only ACTIVE deployments can be relieved.'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = DeploymentRelieveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        relieved_date = serializer.validated_data.get('relieved_date') or date.today()
        relief_reason = serializer.validated_data.get('relief_reason', '')

        user = request.user if request.user.is_authenticated else None
        deployment.status = DeploymentStatus.RELIEVED
        deployment.end_date = relieved_date
        deployment.relieved_date = relieved_date
        deployment.relief_reason = relief_reason
        deployment.relieved_by = user
        deployment.save()

        try:
            EmploymentHistory.objects.create(
                company=deployment.company,
                employee=deployment.employee,
                event_type='TRANSFER',
                effective_date=relieved_date,
                changed_by=user,
                notes=f"Deployment relieved from Site '{deployment.site.name}'. Reason: {relief_reason or 'Relieved'}"
            )
        except Exception as e:
            logger.warning(f"Could not log EmploymentHistory on relieve: {e}")

        return Response(DeploymentListSerializer(deployment).data)

    @action(detail=True, methods=['post'], url_path='transfer')
    def transfer(self, request, pk=None):
        deployment = self.get_object()
        if deployment.status != DeploymentStatus.ACTIVE:
            return Response({'error': 'Only ACTIVE deployments can be transferred.'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = DeploymentTransferSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        relieved_date = data.get('relieved_date') or date.today()
        relief_reason = data.get('relief_reason', '')
        new_site_id = data.get('new_site')
        new_post_id = data.get('new_post')
        new_contract_id = data.get('new_contract')
        new_designation_id = data.get('new_designation') or deployment.designation_id
        new_start_date = data.get('new_start_date') or relieved_date
        new_assignment_type = data.get('new_assignment_type', DeploymentAssignmentType.PERMANENT)
        notes = data.get('notes', '')

        from django.db import transaction
        user = request.user if request.user.is_authenticated else None
        with transaction.atomic():
            # 1. Relieve old deployment
            deployment.status = DeploymentStatus.RELIEVED
            deployment.end_date = relieved_date
            deployment.relieved_date = relieved_date
            deployment.relief_reason = relief_reason or "Transferred to new site"
            deployment.relieved_by = user
            deployment.save()

            # 2. Create new active deployment
            new_dep = Deployment(
                company=deployment.company,
                employee=deployment.employee,
                site_id=new_site_id,
                post_id=new_post_id,
                service_contract_id=new_contract_id,
                designation_id=new_designation_id,
                assignment_type=new_assignment_type,
                start_date=new_start_date,
                status=DeploymentStatus.ACTIVE,
                assigned_by=user,
                notes=notes
            )
            new_dep.clean()
            new_dep.save()

            # 3. Record EmploymentHistory
            try:
                EmploymentHistory.objects.create(
                    company=deployment.company,
                    employee=deployment.employee,
                    event_type='TRANSFER',
                    effective_date=new_start_date,
                    changed_by=user,
                    notes=f"Deployment transferred from Site '{deployment.site.name}' to Site '{new_dep.site.name}'"
                )
            except Exception as e:
                logger.warning(f"Could not log EmploymentHistory on transfer: {e}")

        return Response({
            'old_deployment': DeploymentListSerializer(deployment).data,
            'new_deployment': DeploymentListSerializer(new_dep).data
        }, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path='staffing-summary')
    def staffing_summary(self, request):
        """
        GET /api/operations/deployments/staffing-summary/?site=<id>
        Returns per-site/designation breakdown.
        """
        company_id = get_current_company() or request.META.get('HTTP_X_COMPANY_ID') or getattr(request.user, 'company_id', None)
        if not company_id:
            return Response({'error': 'Company context required.'}, status=400)

        qs = Deployment.objects.filter(
            company_id=company_id,
            is_deleted=False,
            status=DeploymentStatus.ACTIVE
        ).select_related('site', 'designation')

        site_id = request.query_params.get('site')
        if site_id:
            qs = qs.filter(site_id=site_id)

        summary = (
            qs.values(
                'site_id', 'site__name',
                'designation_id', 'designation__name'
            )
            .annotate(assigned_count=Count('id'))
            .order_by('site__name', 'designation__name')
        )

        return Response(list(summary))


# ---------------------------------------------------------------------------
# Duty Assignments
# ---------------------------------------------------------------------------

class DutyAssignmentViewSet(BaseSecurityOpsViewSet):
    queryset = DutyAssignment.objects.select_related(
        'deployment', 'employee', 'employee__user', 'site', 'deployment__designation'
    ).all()
    serializer_class = DutyAssignmentSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['employee__first_name', 'employee__last_name', 'site__name']
    ordering_fields = ['date', 'start_time', 'created_at']

    def get_queryset(self):
        qs = super().get_queryset()
        date_param = self.request.query_params.get('date')
        site_id = self.request.query_params.get('site')
        deployment_id = self.request.query_params.get('deployment')
        employee_id = self.request.query_params.get('employee')
        status_param = self.request.query_params.get('status')

        if date_param:
            qs = qs.filter(date=date_param)
        if site_id:
            qs = qs.filter(site_id=site_id)
        if deployment_id:
            qs = qs.filter(deployment_id=deployment_id)
        if employee_id:
            qs = qs.filter(employee_id=employee_id)
        if status_param:
            qs = qs.filter(status__iexact=status_param)
        return qs

    @action(detail=True, methods=['post'], url_path='sync-attendance')
    def sync_attendance(self, request, pk=None):
        """
        POST /api/operations/duty-assignments/{id}/sync-attendance/
        Idempotent. Only works on COMPLETED duties.
        """
        from operations.services.attendance_sync import (
            sync_duty_assignment_attendance, AttendanceSyncError
        )
        company_id = self._resolve_company(request)
        try:
            result = sync_duty_assignment_attendance(pk, company_id)
            http_status = status.HTTP_201_CREATED if result['created'] else status.HTTP_200_OK
            return Response(result, status=http_status)
        except AttendanceSyncError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.exception(f"[ATTENDANCE_SYNC] Unexpected error: {e}")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _resolve_company(self, request):
        from rest_framework.exceptions import ValidationError
        company_id = (
            get_current_company()
            or request.META.get('HTTP_X_COMPANY_ID')
            or getattr(request.user, 'company_id', None)
        )
        if not company_id:
            raise ValidationError({'detail': 'Company context is required.'})
        return company_id

    @action(detail=False, methods=['get'], url_path='roster')
    def roster(self, request):
        """
        GET /api/operations/duty-assignments/roster/?date=YYYY-MM-DD&site=<id>

        Returns all duty assignments for a given date grouped by site.
        """
        date_param = request.query_params.get('date')
        site_id = request.query_params.get('site')

        company_id = get_current_company() or request.META.get('HTTP_X_COMPANY_ID') or getattr(request.user, 'company_id', None)
        if not company_id:
            return Response({'error': 'Company context required.'}, status=400)

        qs = DutyAssignment.objects.filter(
            company_id=company_id,
            is_deleted=False
        ).select_related(
            'deployment', 'employee', 'employee__user', 'site', 'deployment__designation'
        )

        if date_param:
            qs = qs.filter(date=date_param)
        else:
            qs = qs.filter(date=timezone.localtime().date())

        if site_id:
            qs = qs.filter(site_id=site_id)

        qs = qs.order_by('site__name', 'start_time')

        serializer = DutyAssignmentSerializer(qs, many=True, context={'request': request})
        return Response(serializer.data)


# ---------------------------------------------------------------------------
# Attendance (Security Operations Adapter)
# ---------------------------------------------------------------------------

class SecurityAttendanceViewSet(BaseSecurityOpsViewSet):
    """
    Phase S-5D — Central Attendance, Leave, Weekly Off & JUMP Management.
    Provides central office attendance recording for DIRECT and INDIRECT personnel,
    persistent PRESENT/ABSENT state tracking, leave range materialization, and 7-day JUMP automation.
    """
    from hrm.models import WorkforceAttendance, JumpRecord
    queryset = WorkforceAttendance.objects.select_related(
        'employee', 'employee__designation', 'duty_roster', 'site', 'post', 'shift', 'recorded_by'
    ).all()
    serializer_class = SecurityAttendanceSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['employee__first_name', 'employee__last_name', 'employee__employee_code', 'notes']
    ordering_fields = ['date', 'created_at']

    def get_queryset(self):
        qs = super().get_queryset()
        date_param = self.request.query_params.get('date')
        status_param = self.request.query_params.get('status')
        employee_id = self.request.query_params.get('employee')
        site_id = self.request.query_params.get('site')
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')

        if date_param:
            qs = qs.filter(date=date_param)
        if date_from:
            qs = qs.filter(date__gte=date_from)
        if date_to:
            qs = qs.filter(date__lte=date_to)
        if status_param:
            qs = qs.filter(status__iexact=status_param)
        if employee_id:
            qs = qs.filter(employee_id=employee_id)
        if site_id:
            qs = qs.filter(site_id=site_id)
        return qs

    @action(detail=False, methods=['get'], url_path='daily-view')
    def daily_view(self, request):
        """
        GET /api/operations/attendance/daily-view/?date=YYYY-MM-DD&classification=DIRECT|INDIRECT&site=<id>&search=
        Consolidated daily workspace showing planned duty, effective status, replacement coverage, and JUMP metrics.
        """
        company_id = self._resolve_company(request)
        target_date = request.query_params.get('date') or str(timezone.now().date())
        classification = request.query_params.get('classification')
        site_id = request.query_params.get('site')
        search = request.query_params.get('search')
        status_filter = request.query_params.get('status')

        from operations.services.attendance_service import get_daily_attendance_workspace
        try:
            workspace = get_daily_attendance_workspace(
                company=company_id,
                target_date=target_date,
                classification=classification,
                site_id=site_id,
                search=search,
                status_filter=status_filter
            )
            return Response(workspace)
        except Exception as e:
            logger.exception(f"Error compiling daily attendance workspace: {e}")
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='set-status')
    def set_status(self, request):
        """
        POST /api/operations/attendance/set-status/
        Sets attendance status for an employee on a single date.
        """
        serializer = SetAttendanceActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        company_id = self._resolve_company(request)
        user = request.user if request.user.is_authenticated else None

        from operations.services.attendance_service import set_employee_daily_attendance
        try:
            att, jump_res = set_employee_daily_attendance(
                company=company_id,
                employee_id=data['employee_id'],
                date=data['date'],
                status=data['status'],
                notes=data.get('notes', ''),
                source=data.get('source', 'CENTRAL_OFFICE'),
                user=user,
                update_persistent_state=data.get('update_persistent_state', False)
            )
            return Response({
                'message': f"Attendance updated to {data['status']}.",
                'attendance': SecurityAttendanceSerializer(att).data,
                'jump_result': jump_res
            }, status=status.HTTP_200_OK)
        except Exception as e:
            logger.exception(f"Error setting employee attendance: {e}")
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='bulk-set')
    def bulk_set(self, request):
        """
        POST /api/operations/attendance/bulk-set/
        Batch updates attendance for multiple employees on a date.
        """
        serializer = BulkSetAttendanceActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        company_id = self._resolve_company(request)
        user = request.user if request.user.is_authenticated else None

        from operations.services.attendance_service import bulk_set_attendance
        try:
            res = bulk_set_attendance(
                company=company_id,
                employee_ids=data['employee_ids'],
                date=data['date'],
                status=data['status'],
                notes=data.get('notes', ''),
                source=data.get('source', 'CENTRAL_OFFICE'),
                user=user,
                update_persistent_state=data.get('update_persistent_state', False)
            )
            return Response(res, status=status.HTTP_200_OK)
        except Exception as e:
            logger.exception(f"Error in bulk attendance: {e}")
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='apply-leave')
    def apply_leave(self, request):
        """
        POST /api/operations/attendance/apply-leave/
        Applies date-range leave (PAID_LEAVE or UNPAID_LEAVE).
        """
        serializer = ApplyLeaveActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        company_id = self._resolve_company(request)
        user = request.user if request.user.is_authenticated else None

        from operations.services.attendance_service import apply_leave_range
        try:
            res = apply_leave_range(
                company=company_id,
                employee_id=data['employee_id'],
                start_date=data['start_date'],
                end_date=data['end_date'],
                leave_type_str=data.get('leave_type', 'PAID_LEAVE'),
                reason=data.get('reason', ''),
                notes=data.get('notes', ''),
                user=user
            )
            return Response(res, status=status.HTTP_201_CREATED)
        except Exception as e:
            logger.exception(f"Error applying leave range: {e}")
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], url_path='jumps')
    def jumps(self, request):
        """
        GET /api/operations/attendance/jumps/?status=ACTIVE_JUMP|RESTORED
        Returns list of JUMP records with employee details and audit history.
        """
        company_id = self._resolve_company(request)
        from hrm.models import JumpRecord
        qs = JumpRecord.objects.filter(company_id=company_id, is_deleted=False).select_related(
            'employee', 'reinstated_by'
        )
        status_param = request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param.upper())
        employee_id = request.query_params.get('employee')
        if employee_id:
            qs = qs.filter(employee_id=employee_id)

        serializer = JumpRecordSerializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['post'], url_path='restore-jump')
    def restore_jump(self, request):
        """
        POST /api/operations/attendance/restore-jump/
        Restores an employee from JUMP status to ACTIVE with audit history.
        """
        serializer = RestoreJumpActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        company_id = self._resolve_company(request)
        user = request.user if request.user.is_authenticated else None

        from operations.services.attendance_service import restore_employee_from_jump
        try:
            res = restore_employee_from_jump(
                company=company_id,
                employee_id=data['employee_id'],
                user=user,
                restore_date=data.get('restore_date'),
                notes=data.get('notes', '')
            )
            return Response(res, status=status.HTTP_200_OK)
        except Exception as e:
            logger.exception(f"Error restoring employee from JUMP: {e}")
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='evaluate-jump')
    def evaluate_jump(self, request):
        """
        POST /api/operations/attendance/evaluate-jump/
        Evaluates the 7-day JUMP rule for a specific employee.
        """
        employee_id = request.data.get('employee_id')
        reference_date = request.data.get('date') or str(timezone.now().date())
        if not employee_id:
            return Response({'error': 'employee_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        company_id = self._resolve_company(request)
        from hrm.models import Employee
        try:
            emp = Employee.objects.get(pk=employee_id, company_id=company_id)
            from operations.services.attendance_service import evaluate_jump_rule
            res = evaluate_jump_rule(emp, reference_date)
            return Response(res, status=status.HTTP_200_OK)
        except Employee.DoesNotExist:
            return Response({'error': 'Employee not found.'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], url_path='by-employee')
    def by_employee(self, request):
        """
        GET /api/operations/attendance/by-employee/?employee=<id>&date_from=&date_to=
        Returns chronological attendance history for an employee.
        """
        employee_id = request.query_params.get('employee')
        if not employee_id:
            return Response({'error': 'employee parameter is required'}, status=status.HTTP_400_BAD_REQUEST)

        company_id = self._resolve_company(request)
        from hrm.models import WorkforceAttendance
        qs = WorkforceAttendance.objects.filter(
            company_id=company_id,
            employee_id=employee_id,
            is_deleted=False
        ).select_related('duty_roster', 'site', 'post', 'shift', 'recorded_by').order_by('-date')

        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        if date_from:
            qs = qs.filter(date__gte=date_from)
        if date_to:
            qs = qs.filter(date__lte=date_to)

        serializer = SecurityAttendanceSerializer(qs, many=True)
        return Response(serializer.data)


# ---------------------------------------------------------------------------
# Extra Duties
# ---------------------------------------------------------------------------

class ExtraDutyViewSet(BaseSecurityOpsViewSet):
    queryset = ExtraDuty.objects.select_related('employee', 'employee__user', 'site', 'service_contract').all()
    serializer_class = ExtraDutySerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['employee__first_name', 'employee__last_name', 'site__name']
    ordering_fields = ['date', 'created_at']

    def get_queryset(self):
        qs = super().get_queryset()
        date_param = self.request.query_params.get('date')
        status_param = self.request.query_params.get('status')
        employee_id = self.request.query_params.get('employee')
        if date_param:
            qs = qs.filter(date=date_param)
        if status_param:
            qs = qs.filter(status__iexact=status_param)
        if employee_id:
            qs = qs.filter(employee_id=employee_id)
        return qs

    @action(detail=True, methods=['post'], url_path='approve')
    def approve(self, request, pk=None):
        extra_duty = self.get_object()
        from operations.models import ExtraDutyStatus
        if extra_duty.status != ExtraDutyStatus.REQUESTED:
            return Response({'error': f'Cannot approve Extra Duty in status {extra_duty.status}'}, status=status.HTTP_400_BAD_REQUEST)
        
        extra_duty.status = ExtraDutyStatus.APPROVED
        extra_duty.approved_by = request.user
        extra_duty.save()
        serializer = self.get_serializer(extra_duty)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='reject')
    def reject(self, request, pk=None):
        extra_duty = self.get_object()
        from operations.models import ExtraDutyStatus
        if extra_duty.status != ExtraDutyStatus.REQUESTED:
            return Response({'error': f'Cannot reject Extra Duty in status {extra_duty.status}'}, status=status.HTTP_400_BAD_REQUEST)
        
        extra_duty.status = ExtraDutyStatus.REJECTED
        extra_duty.save()
        serializer = self.get_serializer(extra_duty)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='process-payroll')
    def process_payroll(self, request, pk=None):
        """
        POST /api/operations/extra-duties/{id}/process-payroll/
        Body: { payroll_run_id: UUID }
        """
        from operations.services.payroll_bridge import (
            process_extra_duty_payroll, PayrollBridgeError
        )
        company_id = self._resolve_company(request)
        payroll_run_id = request.data.get('payroll_run_id')
        if not payroll_run_id:
            return Response({'error': 'payroll_run_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            result = process_extra_duty_payroll(pk, payroll_run_id, company_id)
            http_status = status.HTTP_201_CREATED if result['created'] else status.HTTP_200_OK
            return Response(result, status=http_status)
        except PayrollBridgeError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.exception(f"[PAYROLL_BRIDGE] Unexpected error: {e}")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _resolve_company(self, request):
        from rest_framework.exceptions import ValidationError
        company_id = (
            get_current_company()
            or request.META.get('HTTP_X_COMPANY_ID')
            or getattr(request.user, 'company_id', None)
        )
        if not company_id:
            raise ValidationError({'detail': 'Company context is required.'})
        return company_id


# ---------------------------------------------------------------------------
# Equipment Issues
# ---------------------------------------------------------------------------

class EquipmentIssueViewSet(BaseSecurityOpsViewSet):
    from .models import EquipmentIssue
    queryset = EquipmentIssue.objects.select_related(
        'employee', 'employee__user', 'item', 'item_serial', 'warehouse', 'site', 'client', 'contract', 'issued_by', 'returned_by', 'resolved_by'
    ).all()
    serializer_class = EquipmentIssueSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['employee__first_name', 'employee__last_name', 'item__name', 'item_serial__serial_number', 'site__name']
    ordering_fields = ['issued_at', 'expected_return_date', 'status']

    def get_queryset(self):
        qs = super().get_queryset()
        status_param = self.request.query_params.get('status')
        custody_type = self.request.query_params.get('custody_type')
        employee_id = self.request.query_params.get('employee')
        item_id = self.request.query_params.get('item')
        site_id = self.request.query_params.get('site')

        if status_param:
            qs = qs.filter(status__iexact=status_param)
        if custody_type:
            qs = qs.filter(custody_type__iexact=custody_type)
        if employee_id:
            qs = qs.filter(employee_id=employee_id)
        if item_id:
            qs = qs.filter(item_id=item_id)
        if site_id:
            qs = qs.filter(site_id=site_id)
        return qs

    def _resolve_company(self, request):
        from rest_framework.exceptions import ValidationError
        company_id = (
            get_current_company()
            or request.META.get('HTTP_X_COMPANY_ID')
            or getattr(request.user, 'company_id', None)
        )
        if not company_id:
            raise ValidationError({'detail': 'Company context is required.'})
        return company_id

    def create(self, request, *args, **kwargs):
        company_id = self._resolve_company(request)
        from companies.models import Company
        from platform_core.models import CompanyModule
        from operations.services.security_inventory_service import SecurityInventoryService
        has_inventory = CompanyModule.objects.filter(company_id=company_id, module__code='inventory', enabled=True).exists()
        if not has_inventory:
            return Response({'error': 'Inventory module is required for equipment issuance.'}, status=status.HTTP_403_FORBIDDEN)

        company = Company.objects.get(id=company_id)
        data = request.data.copy()
        custody_type = data.get('custody_type', 'EMPLOYEE')
        store_id = data.get('store_id') or data.get('warehouse')
        item_id = data.get('item_id') or data.get('item')
        employee_id = data.get('employee_id') or data.get('employee')
        site_id = data.get('site_id') or data.get('site')
        serial_number = data.get('serial_number')
        if not serial_number and data.get('item_serial'):
            from inventory.models import ItemSerial
            try:
                serial_obj = ItemSerial.objects.get(id=data.get('item_serial'))
                serial_number = serial_obj.serial_number
            except Exception:
                pass
        quantity = data.get('quantity', 1)
        expected_return_date = data.get('expected_return_date')
        purpose = data.get('purpose', '')
        condition = data.get('condition', 'GOOD')
        notes = data.get('notes', '')
        auth_code = data.get('authorization_code', '')

        try:
            issue = SecurityInventoryService.issue_equipment(
                company=company,
                user=request.user,
                store_id=store_id,
                item_id=item_id,
                custody_type=custody_type,
                employee_id=employee_id,
                site_id=site_id,
                serial_number=serial_number,
                quantity=quantity,
                expected_return_date=expected_return_date,
                purpose=purpose,
                condition=condition,
                notes=notes,
                authorization_code=auth_code
            )
            serializer = self.get_serializer(issue)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='return')
    def return_equipment(self, request, pk=None):
        issue = self.get_object()
        store_id = request.data.get('store_id') or getattr(issue.warehouse, 'id', None)
        return_condition = request.data.get('condition') or request.data.get('return_condition', 'GOOD')
        notes = request.data.get('notes', '')
        auth_code = request.data.get('authorization_code', '')

        from operations.services.security_inventory_service import SecurityInventoryService
        try:
            returned_issue = SecurityInventoryService.return_equipment(
                company=issue.company,
                user=request.user,
                issue_id=issue.id,
                store_id=store_id,
                condition=return_condition,
                notes=notes,
                authorization_code=auth_code
            )
            return Response(self.get_serializer(returned_issue).data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class EquipmentIncidentViewSet(BaseSecurityOpsViewSet):
    from .models import EquipmentIncident
    queryset = EquipmentIncident.objects.select_related(
        'item', 'item_serial', 'warehouse', 'employee', 'site', 'reported_by', 'resolved_by', 'equipment_issue'
    ).all()
    from .serializers import EquipmentIncidentSerializer
    serializer_class = EquipmentIncidentSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['item__name', 'item_serial__serial_number', 'employee__first_name', 'employee__last_name', 'condition_description', 'evidence_notes']
    ordering_fields = ['incident_date', 'created_at', 'status']

    def get_queryset(self):
        qs = super().get_queryset()
        status_param = self.request.query_params.get('status')
        incident_type = self.request.query_params.get('incident_type')
        item_id = self.request.query_params.get('item')
        employee_id = self.request.query_params.get('employee')
        site_id = self.request.query_params.get('site')

        if status_param:
            qs = qs.filter(status=status_param)
        if incident_type:
            qs = qs.filter(incident_type=incident_type)
        if item_id:
            qs = qs.filter(item_id=item_id)
        if employee_id:
            qs = qs.filter(employee_id=employee_id)
        if site_id:
            qs = qs.filter(site_id=site_id)
        return qs


class SecurityInventoryViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    required_module = 'security_ops'
    allowed_roles = ['admin', 'manager', 'armorer', 'armory_officer', 'staff']
    allowed_reads = ['admin', 'manager', 'armorer', 'armory_officer', 'staff']
    required_permissions = ['operations.read']

    def _resolve_company(self, request):
        from companies.models import Company
        company_id = (
            get_current_company()
            or request.META.get('HTTP_X_COMPANY_ID')
            or getattr(request.user, 'company_id', None)
        )
        if not company_id:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'detail': 'Company context is required.'})
        return Company.objects.get(id=company_id)

    @action(detail=False, methods=['get'], url_path='overview')
    def overview(self, request):
        company = self._resolve_company(request)
        from operations.services.security_inventory_service import SecurityInventoryService
        availability = SecurityInventoryService.get_stock_availability(company.id)
        from operations.models import EquipmentIssue, EquipmentIncident, SecurityStoreProfile, SecurityItemProfile
        active_emp_issues = EquipmentIssue.objects.filter(company=company, custody_type='EMPLOYEE', status='ISSUED').count()
        active_site_issues = EquipmentIssue.objects.filter(company=company, custody_type='SITE', status='ISSUED').count()
        open_incidents = EquipmentIncident.objects.filter(company=company, status__in=['REPORTED', 'UNDER_INVESTIGATION']).count()
        store_count = SecurityStoreProfile.objects.filter(company=company).count()
        controlled_items_count = SecurityItemProfile.objects.filter(company=company, is_controlled=True).count()

        summary = availability.get('summary', {})
        items = availability.get('items', [])

        return Response({
            'total_items': summary.get('total_items_count', len(items)),
            'total_stores': store_count,
            'active_employee_issues': active_emp_issues,
            'active_site_issues': active_site_issues,
            'open_incidents': open_incidents,
            'controlled_items_count': controlled_items_count,
            'total_managed_units': summary.get('total_equipment_assets', 0),
            'total_lost_units': summary.get('total_lost_quantity', 0),
            'total_damaged_units': summary.get('total_damaged_quantity', 0),
        })

    @action(detail=False, methods=['get', 'post'], url_path='stores')
    def stores(self, request):
        company = self._resolve_company(request)
        from operations.models import SecurityStoreProfile, SecurityStoreType
        from platform_core.models import Warehouse
        from operations.serializers import SecurityStoreProfileSerializer
        if request.method == 'GET':
            profiles = SecurityStoreProfile.objects.filter(company=company).select_related('warehouse', 'site', 'supervisor')
            data = SecurityStoreProfileSerializer(profiles, many=True).data
            warehouses = Warehouse.objects.filter(company=company).values('id', 'name', 'code')
            return Response({'stores': data, 'all_warehouses': list(warehouses)})

        warehouse_id = request.data.get('warehouse_id')
        name = request.data.get('name')
        code = request.data.get('code')
        store_type = request.data.get('store_type', SecurityStoreType.MAIN_STORE)
        site_id = request.data.get('site_id')
        is_armory = request.data.get('is_armory', store_type == SecurityStoreType.ARMORY)
        requires_strong_auth = request.data.get('requires_strong_auth', is_armory)
        supervisor_id = request.data.get('supervisor_id')
        notes = request.data.get('notes', '')

        if not warehouse_id:
            if not name or not code:
                return Response({'error': 'Name and code are required to create warehouse.'}, status=status.HTTP_400_BAD_REQUEST)
            warehouse, _ = Warehouse.objects.get_or_create(
                company=company,
                code=code,
                defaults={'name': name, 'address': notes}
            )
        else:
            warehouse = Warehouse.objects.get(id=warehouse_id, company=company)

        profile, created = SecurityStoreProfile.objects.update_or_create(
            company=company,
            warehouse=warehouse,
            defaults={
                'store_type': store_type,
                'site_id': site_id,
                'is_armory': is_armory,
                'requires_strong_auth': requires_strong_auth,
                'supervisor_id': supervisor_id,
                'notes': notes
            }
        )
        return Response(SecurityStoreProfileSerializer(profile).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='stock-availability')
    def stock_availability(self, request):
        company = self._resolve_company(request)
        from operations.services.security_inventory_service import SecurityInventoryService
        data = SecurityInventoryService.get_stock_availability(
            company_id=company.id,
            warehouse_id=request.query_params.get('warehouse_id') or request.query_params.get('store_id'),
            site_id=request.query_params.get('site_id'),
            category_id=request.query_params.get('category_id'),
            security_category=request.query_params.get('category'),
            search=request.query_params.get('search'),
            is_controlled=request.query_params.get('is_controlled')
        )
        return Response(data.get('items', []))

    @action(detail=False, methods=['post'], url_path='issue')
    def issue(self, request):
        company = self._resolve_company(request)
        from operations.serializers import IssueEquipmentActionSerializer, EquipmentIssueSerializer
        serializer = IssueEquipmentActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        from operations.services.security_inventory_service import SecurityInventoryService
        try:
            issue = SecurityInventoryService.issue_equipment(
                company=company,
                user=request.user,
                **serializer.validated_data
            )
            return Response(EquipmentIssueSerializer(issue).data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='return')
    def return_equipment_action(self, request):
        company = self._resolve_company(request)
        from operations.serializers import ReturnEquipmentActionSerializer, EquipmentIssueSerializer
        serializer = ReturnEquipmentActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        from operations.services.security_inventory_service import SecurityInventoryService
        try:
            issue = SecurityInventoryService.return_equipment(
                company=company,
                user=request.user,
                **serializer.validated_data
            )
            return Response(EquipmentIssueSerializer(issue).data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='transfer')
    def transfer(self, request):
        company = self._resolve_company(request)
        from operations.serializers import StoreTransferActionSerializer
        serializer = StoreTransferActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        from operations.services.security_inventory_service import SecurityInventoryService
        try:
            movement = SecurityInventoryService.transfer_store_stock(
                company=company,
                user=request.user,
                **serializer.validated_data
            )
            return Response({
                'status': 'success',
                'movement_id': str(movement.id),
                'reference': movement.reference,
                'quantity': float(movement.quantity)
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='report-incident')
    def report_incident(self, request):
        company = self._resolve_company(request)
        from operations.serializers import ReportIncidentActionSerializer, EquipmentIncidentSerializer
        serializer = ReportIncidentActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        from operations.services.security_inventory_service import SecurityInventoryService
        try:
            incident = SecurityInventoryService.report_incident(
                company=company,
                user=request.user,
                **serializer.validated_data
            )
            return Response(EquipmentIncidentSerializer(incident).data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='resolve-incident/(?P<incident_id>[^/.]+)')
    def resolve_incident(self, request, incident_id=None):
        company = self._resolve_company(request)
        from operations.serializers import ResolveIncidentActionSerializer, EquipmentIncidentSerializer
        serializer = ResolveIncidentActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        from operations.services.security_inventory_service import SecurityInventoryService
        try:
            incident = SecurityInventoryService.resolve_incident(
                company=company,
                user=request.user,
                incident_id=incident_id,
                **serializer.validated_data
            )
            return Response(EquipmentIncidentSerializer(incident).data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], url_path='incidents')
    def incidents(self, request):
        company = self._resolve_company(request)
        from operations.models import EquipmentIncident
        from operations.serializers import EquipmentIncidentSerializer
        qs = EquipmentIncident.objects.filter(company=company).select_related(
            'item', 'item_serial', 'warehouse', 'employee', 'site', 'reported_by', 'resolved_by', 'equipment_issue'
        )
        status_param = request.query_params.get('status')
        incident_type = request.query_params.get('incident_type')
        item_id = request.query_params.get('item_id')
        employee_id = request.query_params.get('employee_id')
        site_id = request.query_params.get('site_id')

        if status_param:
            qs = qs.filter(status=status_param)
        if incident_type:
            qs = qs.filter(incident_type=incident_type)
        if item_id:
            qs = qs.filter(item_id=item_id)
        if employee_id:
            qs = qs.filter(employee_id=employee_id)
        if site_id:
            qs = qs.filter(site_id=site_id)

        data = EquipmentIncidentSerializer(qs.order_by('-incident_date', '-created_at'), many=True).data
        return Response(data)

    @action(detail=False, methods=['get'], url_path='employee-custody/(?P<employee_id>[^/.]+)')
    def employee_custody(self, request, employee_id=None):
        company = self._resolve_company(request)
        from operations.services.security_inventory_service import SecurityInventoryService
        emp_id = employee_id or request.query_params.get('employee_id')
        if not emp_id:
            return Response({'error': 'employee_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        data = SecurityInventoryService.get_employee_custody(company, emp_id)
        return Response(data)

    @action(detail=False, methods=['get'], url_path='site-equipment/(?P<site_id>[^/.]+)')
    def site_equipment(self, request, site_id=None):
        company = self._resolve_company(request)
        from operations.services.security_inventory_service import SecurityInventoryService
        s_id = site_id or request.query_params.get('site_id')
        if not s_id:
            return Response({'error': 'site_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        data = SecurityInventoryService.get_site_equipment(company, s_id)
        return Response(data)

    @action(detail=False, methods=['get'], url_path='serialized-history/(?P<serial>[^/.]+)')
    def serialized_history(self, request, serial=None):
        company = self._resolve_company(request)
        from operations.services.security_inventory_service import SecurityInventoryService
        serial_num = serial or request.query_params.get('serial') or request.query_params.get('serial_number')
        if not serial_num:
            return Response({'error': 'serial is required.'}, status=status.HTTP_400_BAD_REQUEST)
        data = SecurityInventoryService.get_serialized_equipment_history(company, serial_num)
        return Response(data)

    @action(detail=False, methods=['get', 'post'], url_path='item-profiles')
    def item_profiles(self, request):
        company = self._resolve_company(request)
        from operations.models import SecurityItemProfile
        from inventory.models import Item
        from operations.serializers import SecurityItemProfileSerializer
        if request.method == 'GET':
            profiles = SecurityItemProfile.objects.filter(company=company).select_related('item')
            data = SecurityItemProfileSerializer(profiles, many=True).data
            all_items = Item.objects.filter(company=company).values('id', 'name', 'item_code', 'track_serial_number')
            return Response({'profiles': data, 'items': list(all_items)})

        item_id = request.data.get('item_id')
        if not item_id:
            return Response({'error': 'item_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        item = Item.objects.get(id=item_id, company=company)
        profile, created = SecurityItemProfile.objects.update_or_create(
            company=company,
            item=item,
            defaults={
                'security_category': request.data.get('security_category', 'OTHER'),
                'is_controlled': request.data.get('is_controlled', False),
                'requires_authorization': request.data.get('requires_authorization', False),
                'license_required': request.data.get('license_required', False),
                'license_reference': request.data.get('license_reference', ''),
                'permit_reference': request.data.get('permit_reference', ''),
                'permit_expiry_date': request.data.get('permit_expiry_date'),
                'storage_location': request.data.get('storage_location', ''),
                'notes': request.data.get('notes', ''),
            }
        )
        return Response(SecurityItemProfileSerializer(profile).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

class SecurityOperationsDashboardView(APIView):
    required_module = 'security_ops'
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager', 'staff']

    def get(self, request):
        company_id = get_current_company() or request.META.get('HTTP_X_COMPANY_ID') or getattr(request.user, 'company_id', None)
        if not company_id:
            return Response({'error': 'Company context required.'}, status=400)

        sites_qs = OperationalSite.objects.filter(company_id=company_id, is_deleted=False)
        contracts_qs = ServiceContract.objects.filter(company_id=company_id, is_deleted=False)
        deployments_qs = Deployment.objects.filter(company_id=company_id, is_deleted=False)
        duty_qs = DutyAssignment.objects.filter(company_id=company_id, is_deleted=False)
        extra_duty_qs = ExtraDuty.objects.filter(company_id=company_id, is_deleted=False)
        from operations.models import EquipmentIssue, EquipmentIssueStatus
        equipment_qs = EquipmentIssue.objects.filter(company_id=company_id, is_deleted=False)

        today = timezone.localtime().date()
        thirty_days_from_now = today + timedelta(days=30)

        active_sites = sites_qs.filter(is_active=True).count()
        active_contracts = contracts_qs.filter(status='ACTIVE').count()
        active_deployments = deployments_qs.filter(status=DeploymentStatus.ACTIVE).count()

        # Deployed staff = unique employees in active deployments
        deployed_staff = deployments_qs.filter(
            status=DeploymentStatus.ACTIVE
        ).values('employee_id').distinct().count()

        todays_duties_qs = duty_qs.filter(date=today)
        todays_duties = todays_duties_qs.count()
        completed_duties = todays_duties_qs.filter(status='COMPLETED').count()

        # How many of today's completed duties are synced?
        # A duty is synced if there is a WorkforceAttendance for that employee on that date
        from hrm.models import WorkforceAttendance
        synced_attendances = WorkforceAttendance.objects.filter(
            company_id=company_id,
            date=today,
            is_deleted=False
        ).count()

        extra_duties_pending = extra_duty_qs.filter(status='REQUESTED').count()
        extra_duties_approved = extra_duty_qs.filter(status='APPROVED').count()

        expiring_contracts = contracts_qs.filter(
            status='ACTIVE',
            end_date__isnull=False,
            end_date__lte=thirty_days_from_now,
            end_date__gte=today
        ).count()

        currently_issued_equipment = equipment_qs.filter(status=EquipmentIssueStatus.ISSUED).count()
        
        open_incidents = IncidentReport.objects.filter(company_id=company_id, is_deleted=False, status='OPEN').count()
        critical_incidents = IncidentReport.objects.filter(company_id=company_id, is_deleted=False, severity='CRITICAL').count()
        pending_dars = DailyActivityReport.objects.filter(company_id=company_id, is_deleted=False, status='SUBMITTED').count()

        from billing.models import ServiceInvoice, ServiceInvoiceStatus, ServiceInvoicePaymentStatus
        from django.db.models import Sum, F

        invoices_qs = ServiceInvoice.objects.filter(company_id=company_id, is_deleted=False)
        pending_invoices = invoices_qs.filter(status=ServiceInvoiceStatus.DRAFT).count()
        
        # Outstanding receivables = sum of (total_amount - paid_amount) for POSTED invoices that are not fully paid
        outstanding_receivables_agg = invoices_qs.filter(
            status=ServiceInvoiceStatus.POSTED,
        ).exclude(
            payment_status=ServiceInvoicePaymentStatus.PAID
        ).aggregate(
            total_outstanding=Sum(F('total_amount') - F('paid_amount'))
        )
        outstanding_receivables = outstanding_receivables_agg['total_outstanding'] or 0
        
        # Current period billed (last 30 days or current month)
        current_period_billed_agg = invoices_qs.filter(
            status=ServiceInvoiceStatus.POSTED,
            created_at__gte=timezone.now() - timedelta(days=30)
        ).aggregate(
            total_billed=Sum('total_amount')
        )
        current_period_billed = current_period_billed_agg['total_billed'] or 0

        return Response({
            'active_sites': active_sites,
            'active_contracts': active_contracts,
            'active_deployments': active_deployments,
            'deployed_staff': deployed_staff,
            'todays_duties': todays_duties,
            'completed_duties': completed_duties,
            'attendance_synced': synced_attendances,
            'extra_duties_pending': extra_duties_pending,
            'extra_duties_approved': extra_duties_approved,
            'expiring_contracts': expiring_contracts,
            'currently_issued_equipment': currently_issued_equipment,
            'staffing_shortage': 0,
            'open_incidents': open_incidents,
            'critical_incidents': critical_incidents,
            'pending_dars': pending_dars,
            'pending_invoices': pending_invoices,
            'outstanding_receivables': float(outstanding_receivables),
            'current_period_billed': float(current_period_billed),
        })


class SecurityOperationsControlCenterView(APIView):
    """
    Phase S-5I: Executive Control Center for Security Workforce & Core Operations.
    Consolidates workforce, manpower, duty coverage, attendance, payroll readiness,
    site health, and prioritized action center exceptions.
    """
    required_module = 'security_ops'
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager', 'staff']

    def get(self, request):
        company_id = get_current_company() or request.META.get('HTTP_X_COMPANY_ID') or getattr(request.user, 'company_id', None)
        if not company_id:
            return Response({'error': 'Company context required.'}, status=400)

        target_date = request.query_params.get('target_date') or request.query_params.get('date')
        client_id = request.query_params.get('client') or request.query_params.get('client_id')
        contract_id = request.query_params.get('contract') or request.query_params.get('contract_id')
        site_id = request.query_params.get('site') or request.query_params.get('site_id')
        shift_id = request.query_params.get('shift') or request.query_params.get('shift_id')
        classification = request.query_params.get('classification')
        designation_id = request.query_params.get('designation') or request.query_params.get('designation_id')
        employment_status = request.query_params.get('employment_status')
        section = request.query_params.get('section')

        if section == 'workforce':
            data = ControlCenterService.get_workforce_summary(
                company_id=company_id,
                classification=classification,
                designation_id=designation_id,
                employment_status=employment_status
            )
        elif section == 'manpower':
            data = ControlCenterService.get_manpower_summary(
                company_id=company_id,
                client_id=client_id,
                contract_id=contract_id,
                site_id=site_id,
                designation_id=designation_id
            )
        elif section == 'duty_coverage':
            data = ControlCenterService.get_roster_coverage_summary(
                company_id=company_id,
                target_date=target_date,
                client_id=client_id,
                contract_id=contract_id,
                site_id=site_id,
                shift_id=shift_id
            )
        elif section == 'attendance':
            data = ControlCenterService.get_attendance_summary(
                company_id=company_id,
                target_date=target_date,
                site_id=site_id,
                classification=classification
            )
        elif section == 'payroll_readiness':
            data = ControlCenterService.get_payroll_readiness_summary(
                company_id=company_id,
                target_date=target_date
            )
        elif section == 'lifecycle_alerts':
            data = ControlCenterService.get_lifecycle_alerts(company_id=company_id)
        elif section == 'site_health':
            data = ControlCenterService.get_site_health_view(
                company_id=company_id,
                target_date=target_date,
                client_id=client_id,
                contract_id=contract_id
            )
        elif section == 'action_center':
            data = ControlCenterService.get_action_center(
                company_id=company_id,
                target_date=target_date
            )
        else:
            data = ControlCenterService.get_control_center_data(
                company_id=company_id,
                target_date=target_date,
                client_id=client_id,
                contract_id=contract_id,
                site_id=site_id,
                shift_id=shift_id,
                classification=classification,
                designation_id=designation_id,
                employment_status=employment_status
            )

        return Response(data, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Incidents & Activity Reports
# ---------------------------------------------------------------------------

class IncidentReportViewSet(BaseSecurityOpsViewSet):
    queryset = IncidentReport.objects.select_related(
        'site', 'client', 'contract', 'post', 'shift', 'roster', 'reported_by', 'assigned_to', 'closed_by', 'duty_assignment'
    ).prefetch_related('attachments').all()
    serializer_class = IncidentReportSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['incident_number', 'title', 'description', 'site__name', 'involved_persons']
    ordering_fields = ['occurred_at', 'reported_at', 'severity', 'status']

    def get_queryset(self):
        queryset = super().get_queryset()
        site_id = self.request.query_params.get('site')
        if site_id:
            queryset = queryset.filter(site_id=site_id)
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        severity = self.request.query_params.get('severity')
        if severity:
            queryset = queryset.filter(severity=severity)
        client_id = self.request.query_params.get('client')
        if client_id:
            queryset = queryset.filter(client_id=client_id)
        contract_id = self.request.query_params.get('contract')
        if contract_id:
            queryset = queryset.filter(contract_id=contract_id)
        return queryset

    def perform_create(self, serializer):
        incident = serializer.save(company_id=self.request.user.company_id)
        if incident.severity in ['CRITICAL', 'HIGH']:
            from operations.services.advanced_operations_service import AdvancedOperationsService
            from operations.models import EscalationSourceType, EscalationPriority
            AdvancedOperationsService.create_escalation(
                company=incident.company_id,
                source_type=EscalationSourceType.INCIDENT,
                source_id=str(incident.id),
                site=incident.site,
                title=f"Incident Escalation: {incident.title}",
                description=f"Severity: {incident.severity} - {incident.description[:300]}",
                priority=EscalationPriority.CRITICAL if incident.severity == 'CRITICAL' else EscalationPriority.HIGH,
                assigned_to=incident.assigned_to
            )

    @action(detail=True, methods=['post'], url_path='transition')
    def transition_incident(self, request, pk=None):
        from operations.services.advanced_operations_service import AdvancedOperationsService
        incident = self.get_object()
        new_status = request.data.get('status')
        resolution = request.data.get('resolution', '')
        immediate_action = request.data.get('immediate_action', '')
        assigned_to_id = request.data.get('assigned_to_id') or request.data.get('assigned_to')

        assigned_to_user = None
        if assigned_to_id:
            from django.contrib.auth import get_user_model
            User = get_user_model()
            assigned_to_user = User.objects.filter(id=assigned_to_id).first()

        try:
            updated_incident = AdvancedOperationsService.transition_incident_status(
                company=incident.company_id,
                incident_id=str(incident.id),
                new_status=new_status,
                user=request.user,
                resolution=resolution,
                immediate_action=immediate_action,
                assigned_to=assigned_to_user
            )
            return Response(self.get_serializer(updated_incident).data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='review')
    def review_incident(self, request, pk=None):
        incident = self.get_object()
        new_status = request.data.get('status')
        resolution = request.data.get('resolution', '')
        valid_statuses = ['INVESTIGATING', 'ACTION_REQUIRED', 'UNDER_REVIEW', 'RESOLVED', 'CLOSED']
        if new_status not in valid_statuses:
            return Response({'error': f'Invalid status. Choose from: {valid_statuses}'}, status=status.HTTP_400_BAD_REQUEST)

        from operations.services.advanced_operations_service import AdvancedOperationsService
        updated = AdvancedOperationsService.transition_incident_status(
            company=incident.company_id,
            incident_id=str(incident.id),
            new_status=new_status,
            user=request.user,
            resolution=resolution
        )
        return Response(self.get_serializer(updated).data)


class IncidentAttachmentViewSet(BaseSecurityOpsViewSet):
    queryset = IncidentAttachment.objects.select_related('incident', 'uploaded_by').all()
    serializer_class = IncidentAttachmentSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        incident_id = self.request.query_params.get('incident')
        if incident_id:
            queryset = queryset.filter(incident_id=incident_id)
        return queryset

    def perform_create(self, serializer):
        serializer.save(company_id=self.request.user.company_id, uploaded_by=self.request.user)

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        attachment = self.get_object()
        if not attachment.file:
            from rest_framework.exceptions import NotFound
            raise NotFound("File not found.")
        
        from django.http import FileResponse
        import os
        filename = os.path.basename(attachment.file.name)
        return FileResponse(attachment.file.open('rb'), as_attachment=True, filename=filename)


class DailyActivityReportViewSet(BaseSecurityOpsViewSet):
    queryset = DailyActivityReport.objects.select_related('site', 'prepared_by', 'duty_assignment').prefetch_related('entries').all()
    serializer_class = DailyActivityReportSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['site__name', 'summary']
    ordering_fields = ['report_date', 'shift_start', 'status']

    def get_queryset(self):
        queryset = super().get_queryset()
        site_id = self.request.query_params.get('site')
        if site_id:
            queryset = queryset.filter(site_id=site_id)
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        date_filter = self.request.query_params.get('report_date')
        if date_filter:
            queryset = queryset.filter(report_date=date_filter)
        return queryset

    @action(detail=True, methods=['post'], url_path='submit')
    def submit_report(self, request, pk=None):
        report = self.get_object()
        if report.status != 'DRAFT':
            return Response({'error': 'Can only submit draft reports'}, status=status.HTTP_400_BAD_REQUEST)
        report.status = 'SUBMITTED'
        report.save()
        return Response(self.get_serializer(report).data)

    @action(detail=True, methods=['post'], url_path='review')
    def review_report(self, request, pk=None):
        report = self.get_object()
        report.status = 'REVIEWED'
        report.reviewed_by = request.user
        report.reviewed_at = timezone.now()
        report.save()
        return Response(self.get_serializer(report).data)


class DailyActivityEntryViewSet(BaseSecurityOpsViewSet):
    queryset = DailyActivityEntry.objects.select_related('report', 'recorded_by').all()
    serializer_class = DailyActivityEntrySerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        report_id = self.request.query_params.get('report')
        if report_id:
            queryset = queryset.filter(report_id=report_id)
        return queryset

# ---------------------------------------------------------------------------
# Staffing Requirements and Coverage
# ---------------------------------------------------------------------------

class SiteStaffingRequirementViewSet(BaseSecurityOpsViewSet):
    queryset = SiteStaffingRequirement.objects.select_related('service_contract', 'site', 'designation', 'shift').all()
    serializer_class = SiteStaffingRequirementSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['service_contract__contract_code', 'site__name', 'designation__name', 'shift__name']
    ordering_fields = ['effective_from', 'required_headcount', 'created_at']

    def get_queryset(self):
        qs = super().get_queryset()
        contract_id = self.request.query_params.get('contract')
        site_id = self.request.query_params.get('site')
        designation_id = self.request.query_params.get('designation')
        shift_id = self.request.query_params.get('shift')
        is_active = self.request.query_params.get('is_active')
        
        if contract_id:
            qs = qs.filter(service_contract_id=contract_id)
        if site_id:
            qs = qs.filter(site_id=site_id)
        if designation_id:
            qs = qs.filter(designation_id=designation_id)
        if shift_id:
            qs = qs.filter(shift_id=shift_id)
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == 'true')
        return qs

class StaffingCoverageView(APIView):
    required_module = 'security_ops'
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager', 'staff']

    def get(self, request):
        company_id = get_current_company() or request.META.get('HTTP_X_COMPANY_ID') or getattr(request.user, 'company_id', None)
        if not company_id:
            return Response({'error': 'Company context required.'}, status=400)
            
        date_str = request.query_params.get('date')
        if not date_str:
            target_date = timezone.localtime().date()
        else:
            try:
                from datetime import date
                target_date = date.fromisoformat(date_str)
            except ValueError:
                return Response({'error': 'Invalid date format. Use YYYY-MM-DD.'}, status=400)
                
        contract_id = request.query_params.get('contract')
        site_id = request.query_params.get('site')
        shift_id = request.query_params.get('shift')
        designation_id = request.query_params.get('designation')
        
        from operations.services.staffing import get_staffing_coverage
        coverage_data = get_staffing_coverage(
            company=company_id,
            target_date=target_date,
            contract_id=contract_id,
            site_id=site_id,
            shift_id=shift_id,
            designation_id=designation_id
        )
        
        return Response(coverage_data)



class TemporaryServiceRequestViewSet(BaseSecurityOpsViewSet):
    queryset = TemporaryServiceRequest.objects.all().prefetch_related('lines').select_related('crm_entity', 'operational_site', 'requested_by', 'approved_by')
    serializer_class = TemporaryServiceRequestSerializer
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    required_module = 'security_ops'


    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        ts = self.get_object()
        if ts.status not in ['DRAFT', 'REQUESTED']:
            return Response({'error': 'Invalid status for approval'}, status=status.HTTP_400_BAD_REQUEST)
        ts.status = 'APPROVED'
        ts.approved_by = request.user
        ts.save()
        return Response({'status': 'Approved', 'id': ts.id})

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        ts = self.get_object()
        if ts.status != 'APPROVED':
            return Response({'error': 'Only APPROVED services can be confirmed'}, status=status.HTTP_400_BAD_REQUEST)
        ts.status = 'CONFIRMED'
        ts.save()
        return Response({'status': 'Confirmed', 'id': ts.id})

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        ts = self.get_object()
        ts.status = 'CANCELLED'
        ts.save()
        return Response({'status': 'Cancelled', 'id': ts.id})
        
    @action(detail=True, methods=['post'])
    def generate_duties(self, request, pk=None):
        ts = self.get_object()
        if ts.status not in ['APPROVED', 'CONFIRMED']:
            return Response({'error': 'Service must be approved/confirmed.'}, status=status.HTTP_400_BAD_REQUEST)
        
        employees_payload = request.data.get('assignments', [])
        created_count = 0
        from .models import DutyAssignment
        from hrm.models import Employee
        
        for assignment in employees_payload:
            emp_id = assignment.get('employee_id')
            line_id = assignment.get('line_id')
            date_str = assignment.get('date')
            try:
                from django.utils.dateparse import parse_date
                if isinstance(date_str, str):
                    parsed_date = parse_date(date_str)
                else:
                    parsed_date = date_str
                    
                emp = Employee.objects.get(id=emp_id, company=ts.company)
                line = ts.lines.get(id=line_id)
                DutyAssignment.objects.create(
                    company=ts.company,
                    temporary_service=ts,
                    employee=emp,
                    site=ts.operational_site,
                    date=parsed_date,
                    start_time=line.shift_start,
                    end_time=line.shift_end,
                )
                created_count += 1
            except Exception as e:
                return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
                
        return Response({'status': f'{created_count} duties generated.'})

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        ts = self.get_object()
        ts.status = 'COMPLETED'
        ts.completed_at = timezone.now()
        ts.save()
        return Response({'status': 'Completed', 'id': ts.id})
        
    @action(detail=True, methods=['post'])
    def generate_invoice(self, request, pk=None):
        ts = self.get_object()
        if ts.status != 'COMPLETED':
            return Response({'error': 'Service must be completed.'}, status=status.HTTP_400_BAD_REQUEST)
            
        from billing.models import ServiceInvoice, ServiceInvoiceLine
        
        existing = ServiceInvoice.objects.filter(company=ts.company, invoice_number=f'TS-{ts.id}').first()
        if existing:
            return Response({'status': 'Invoice already exists', 'invoice_id': existing.id})
            
        invoice = ServiceInvoice.objects.create(
            company=ts.company,
            crm_entity=ts.crm_entity,
            period_start=ts.start_datetime.date(),
            period_end=ts.end_datetime.date(),
            invoice_number=f'TS-{ts.id}',
            notes=f"Billing for Temporary Service {ts.reference_number}"
        )
        
        from decimal import Decimal
        total_amount = Decimal(0)
        
        for line in ts.lines.all():
            days = (ts.end_datetime.date() - ts.start_datetime.date()).days + 1
            if line.shift_start and line.shift_end:
                h1 = line.shift_start.hour + line.shift_start.minute/60.0
                h2 = line.shift_end.hour + line.shift_end.minute/60.0
                hours = h2 - h1 if h2 > h1 else 24 - h1 + h2
            else:
                hours = 8
            
            amount = Decimal(line.required_headcount) * line.billing_rate * Decimal(int(hours)) * Decimal(days)
            ServiceInvoiceLine.objects.create(
                company=ts.company,
                service_invoice=invoice,
                designation=line.designation,
                operational_site=ts.operational_site,
                description=f"{line.designation.name} ({line.required_headcount} pax, {int(hours)}h/day, {days} days)",
                hours=Decimal(int(hours)) * Decimal(days) * Decimal(line.required_headcount),
                rate=line.billing_rate,
                amount=amount
            )
            total_amount += amount
            
        invoice.subtotal = total_amount
        invoice.total_amount = total_amount
        invoice.save()
        return Response({'status': 'Invoice generated', 'invoice_id': invoice.id})

class TemporaryServiceLineViewSet(BaseSecurityOpsViewSet):
    queryset = TemporaryServiceLine.objects.all().select_related('designation')
    serializer_class = TemporaryServiceLineSerializer
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    required_module = 'security_ops'

class QAChecklistTemplateViewSet(BaseSecurityOpsViewSet):
    queryset = QAChecklistTemplate.objects.all().prefetch_related('items')
    serializer_class = QAChecklistTemplateSerializer
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    required_module = 'security_ops'

class QAChecklistItemViewSet(BaseSecurityOpsViewSet):
    queryset = QAChecklistItem.objects.all()
    serializer_class = QAChecklistItemSerializer
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    required_module = 'security_ops'

class QAInspectionViewSet(BaseSecurityOpsViewSet):
    queryset = QAInspection.objects.all().prefetch_related('responses', 'findings').select_related('template', 'service_contract', 'operational_site', 'inspector')
    serializer_class = QAInspectionSerializer
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    required_module = 'security_ops'


class QAInspectionResponseViewSet(BaseSecurityOpsViewSet):
    queryset = QAInspectionResponse.objects.all()
    serializer_class = QAInspectionResponseSerializer
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    required_module = 'security_ops'

class QAFindingViewSet(BaseSecurityOpsViewSet):
    queryset = QAFinding.objects.all().select_related('checklist_item')
    serializer_class = QAFindingSerializer
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    required_module = 'security_ops'

class CorrectiveActionViewSet(BaseSecurityOpsViewSet):
    queryset = CorrectiveAction.objects.all().select_related('finding', 'assigned_to')
    serializer_class = CorrectiveActionSerializer

    @action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        ca = self.get_object()
        ca.status = 'RESOLVED'
        ca.completed_at = timezone.now()
        ca.save()
        return Response({'status': 'Resolved'})

    @action(detail=True, methods=['post'])
    def verify(self, request, pk=None):
        ca = self.get_object()
        if ca.status != 'RESOLVED':
            return Response({'error': 'Can only verify resolved actions'}, status=status.HTTP_400_BAD_REQUEST)
        ca.status = 'VERIFIED'
        ca.verified_by = request.user
        ca.verification_notes = request.data.get('notes', '')
        ca.save()
        return Response({'status': 'Verified'})
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    required_module = 'security_ops'


# ---------------------------------------------------------------------------
# Phase S-5E: Daily Duty Pay & Temporary Assignment Pay ViewSet
# ---------------------------------------------------------------------------

class DailyDutyPayViewSet(BaseSecurityOpsViewSet):
    queryset = DailyDutyPay.objects.select_related(
        'employee', 'employee__designation', 'roster', 'roster__shift',
        'roster__post', 'replacement', 'replaced_employee', 'home_deployment',
        'client', 'contract', 'site', 'post', 'attendance'
    ).all()
    serializer_class = DailyDutyPaySerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = [
        'employee__first_name', 'employee__last_name', 'employee__employee_code',
        'site__name', 'post__post_name', 'contract__contract_code'
    ]
    ordering_fields = ['duty_date', 'daily_payable_rate', 'payable_amount', 'created_at']

    def get_queryset(self):
        qs = super().get_queryset()
        emp_id = self.request.query_params.get('employee')
        site_id = self.request.query_params.get('site')
        contract_id = self.request.query_params.get('contract')
        duty_date = self.request.query_params.get('date')
        status_filter = self.request.query_params.get('status')
        calc_status = self.request.query_params.get('calculation_status')
        is_replacement = self.request.query_params.get('is_replacement')

        if emp_id:
            qs = qs.filter(employee_id=emp_id)
        if site_id:
            qs = qs.filter(site_id=site_id)
        if contract_id:
            qs = qs.filter(contract_id=contract_id)
        if duty_date:
            qs = qs.filter(duty_date=duty_date)
        if status_filter:
            qs = qs.filter(attendance_status=status_filter)
        if calc_status:
            qs = qs.filter(calculation_status=calc_status)
        if is_replacement is not None:
            qs = qs.filter(is_replacement_duty=(is_replacement.lower() in ['true', '1']))

        return qs

    @action(detail=False, methods=['get'], url_path='review-workspace')
    def review_workspace(self, request):
        company = get_current_company()
        if not company:
            return Response({'error': 'Tenant company context required'}, status=status.HTTP_400_BAD_REQUEST)

        duty_date = request.query_params.get('date')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        classification = request.query_params.get('classification')
        site_id = request.query_params.get('site')
        unresolved_only = request.query_params.get('unresolved_only', '').lower() in ['true', '1']
        replacement_only = request.query_params.get('replacement_only', '').lower() in ['true', '1']
        search = request.query_params.get('search')

        workspace = get_daily_pay_review_workspace(
            company=company,
            duty_date=duty_date,
            start_date=start_date,
            end_date=end_date,
            classification=classification,
            site_id=site_id,
            unresolved_only=unresolved_only,
            replacement_only=replacement_only,
            search=search
        )
        return Response(workspace, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='generate')
    def generate_single(self, request):
        company = get_current_company()
        if not company:
            return Response({'error': 'Tenant company context required'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = GenerateDailyPayActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            pay_record, created = generate_daily_duty_pay(
                company=company,
                employee=data['employee_id'],
                duty_date=data['duty_date'],
                user=request.user,
                force_recalculate=data.get('force_recalculate', False)
            )
            out_ser = DailyDutyPaySerializer(pay_record, context={'request': request})
            return Response({
                'message': 'Daily duty pay record generated successfully' if created else 'Daily duty pay record updated',
                'record': out_ser.data,
                'created': created
            }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='bulk-generate')
    def bulk_generate(self, request):
        company = get_current_company()
        if not company:
            return Response({'error': 'Tenant company context required'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = BulkGenerateDailyPayActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            result = bulk_generate_daily_pay_inputs(
                company=company,
                start_date=data['start_date'],
                end_date=data['end_date'],
                employee_ids=data.get('employee_ids'),
                user=request.user
            )
            return Response({
                'message': f"Processed {result['total_processed']} potential duty slots. Created: {result['created_count']}, Updated: {result['updated_count']}, Unresolved: {result['unresolved_count']}.",
                'result': result
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='recalculate')
    def recalculate(self, request):
        company = get_current_company()
        if not company:
            return Response({'error': 'Tenant company context required'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = RecalculateDailyPayActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        pay_record_id = serializer.validated_data['pay_record_id']

        try:
            rec = recalculate_daily_duty_pay(
                company=company,
                pay_record_id=pay_record_id,
                user=request.user
            )
            out_ser = DailyDutyPaySerializer(rec, context={'request': request})
            return Response({
                'message': 'Daily duty pay recalculated successfully',
                'record': out_ser.data
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], url_path='unresolved')
    def unresolved_list(self, request):
        company = get_current_company()
        if not company:
            return Response({'error': 'Tenant company context required'}, status=status.HTTP_400_BAD_REQUEST)

        unresolved_qs = self.get_queryset().filter(
            Q(calculation_status=DailyPayCalculationStatus.UNRESOLVED) |
            Q(daily_payable_rate__lte=Decimal('0.00'))
        ).exclude(attendance_status__in=['ABSENT', 'UNPAID_LEAVE'])

        serializer = self.get_serializer(unresolved_qs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='replacements')
    def replacements_list(self, request):
        company = get_current_company()
        if not company:
            return Response({'error': 'Tenant company context required'}, status=status.HTTP_400_BAD_REQUEST)

        qs = self.get_queryset().filter(is_replacement_duty=True)
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='by-employee')
    def by_employee(self, request):
        company = get_current_company()
        if not company:
            return Response({'error': 'Tenant company context required'}, status=status.HTTP_400_BAD_REQUEST)

        emp_id = request.query_params.get('employee')
        if not emp_id:
            return Response({'error': 'Employee query parameter is required'}, status=status.HTTP_400_BAD_REQUEST)

        qs = self.get_queryset().filter(employee_id=emp_id)
        d_from = request.query_params.get('date_from')
        d_to = request.query_params.get('date_to')
        if d_from:
            qs = qs.filter(duty_date__gte=d_from)
        if d_to:
            qs = qs.filter(duty_date__lte=d_to)

        serializer = self.get_serializer(qs.order_by('-duty_date'), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


# ==============================================================================
# Phase S-5F: Payroll Rules, Statutory Deductions & Compensation ViewSets
# ==============================================================================
from .models import (
    PayrollAddition, PayrollDeduction,
    EmployeePayrollCalculation, PayrollCalculationLine
)
from .serializers import (
    PayrollAdditionSerializer, PayrollDeductionSerializer,
    EmployeePayrollCalculationSerializer, PayrollCalculationLineSerializer,
    CalculateEmployeePayrollActionSerializer, CalculatePeriodPayrollActionSerializer,
    MarkCalculationReadyActionSerializer
)
from operations.services.payroll_rules_service import PayrollRulesService


class PayrollAdditionViewSet(TenantModelViewSet):
    queryset = PayrollAddition.objects.select_related('employee').all()
    serializer_class = PayrollAdditionSerializer
    filterset_fields = ['employee', 'addition_type', 'frequency', 'is_active', 'is_approved']
    search_fields = ['name', 'employee__first_name', 'employee__last_name', 'employee__employee_code']


class PayrollDeductionViewSet(TenantModelViewSet):
    queryset = PayrollDeduction.objects.select_related('employee', 'advance').all()
    serializer_class = PayrollDeductionSerializer
    filterset_fields = ['employee', 'deduction_type', 'frequency', 'is_active', 'is_approved']
    search_fields = ['name', 'employee__first_name', 'employee__last_name', 'employee__employee_code']


class EmployeePayrollCalculationViewSet(TenantModelViewSet):
    queryset = EmployeePayrollCalculation.objects.select_related('employee', 'employee__designation').prefetch_related('lines').all()
    serializer_class = EmployeePayrollCalculationSerializer
    filterset_fields = ['employee', 'status', 'has_blockers', 'period_start', 'period_end']
    search_fields = ['employee__first_name', 'employee__last_name', 'employee__employee_code']

    @action(detail=False, methods=['get'], url_path='preparation-workspace')
    def preparation_workspace(self, request):
        company = get_current_company()
        if not company:
            return Response({'error': 'Tenant company context required'}, status=status.HTTP_400_BAD_REQUEST)

        period_start = request.query_params.get('period_start')
        period_end = request.query_params.get('period_end')

        if not period_start or not period_end:
            # Default to current month if unspecified
            today = timezone.now().date()
            period_start = period_start or today.replace(day=1).isoformat()
            # Last day of month
            import calendar
            _, last_day = calendar.monthrange(today.year, today.month)
            period_end = period_end or today.replace(day=last_day).isoformat()

        classification = request.query_params.get('classification')
        site_id = request.query_params.get('site_id')
        calc_status = request.query_params.get('status')
        search = request.query_params.get('search')

        try:
            workspace_data = PayrollRulesService.get_payroll_preparation_workspace(
                company=company,
                period_start=period_start,
                period_end=period_end,
                classification=classification,
                site_id=site_id,
                status=calc_status,
                search=search
            )
            return Response(workspace_data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='calculate-employee')
    def calculate_employee(self, request):
        company = get_current_company()
        if not company:
            return Response({'error': 'Tenant company context required'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = CalculateEmployeePayrollActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            calc = PayrollRulesService.calculate_employee_payroll(
                company=company,
                employee=data['employee_id'],
                period_start=data['period_start'],
                period_end=data['period_end'],
                user=request.user,
                force_recalculate=data.get('force_recalculate', True)
            )
            out_ser = self.get_serializer(calc, context={'request': request})
            return Response({
                'message': f"Payroll calculated successfully for {calc.employee}",
                'calculation': out_ser.data
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='calculate-period')
    def calculate_period(self, request):
        company = get_current_company()
        if not company:
            return Response({'error': 'Tenant company context required'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = CalculatePeriodPayrollActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            result = PayrollRulesService.calculate_period_payroll(
                company=company,
                period_start=data['period_start'],
                period_end=data['period_end'],
                employee_ids=data.get('employee_ids'),
                user=request.user
            )
            return Response({
                'message': f"Processed {result['total_processed']} employees. Calculated: {result['calculated_count']}, Blocked: {result['blocked_count']}.",
                'result': result
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='mark-ready')
    def mark_ready(self, request):
        company = get_current_company()
        if not company:
            return Response({'error': 'Tenant company context required'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = MarkCalculationReadyActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            calc = PayrollRulesService.mark_calculation_ready(
                company=company,
                calculation_id=serializer.validated_data['calculation_id'],
                user=request.user
            )
            out_ser = self.get_serializer(calc, context={'request': request})
            return Response({
                'message': f"Payroll calculation for {calc.employee} marked READY.",
                'calculation': out_ser.data
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], url_path='blockers')
    def blockers_list(self, request):
        company = get_current_company()
        if not company:
            return Response({'error': 'Tenant company context required'}, status=status.HTTP_400_BAD_REQUEST)

        qs = self.get_queryset().filter(status=PayrollCalculationStatus.BLOCKED)
        p_start = request.query_params.get('period_start')
        p_end = request.query_params.get('period_end')
        if p_start:
            qs = qs.filter(period_start__gte=p_start)
        if p_end:
            qs = qs.filter(period_end__lte=p_end)

        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


from hrm.models import PayrollRun, Payslip, PayslipStatus, PayrollRunStatus
from operations.serializers import (
    OperationalPayrollRunSerializer, OperationalPayslipSerializer,
    CreatePayrollRunFromReadySerializer, CancelPayrollRunActionSerializer
)
from operations.services.payroll_run_service import PayrollRunService


class OperationalPayrollRunViewSet(TenantModelViewSet):
    queryset = PayrollRun.objects.select_related(
        'payroll_period', 'prepared_by', 'reviewed_by', 'approved_by', 'finalized_by'
    ).prefetch_related('finance_integrations', 'payslips', 'operational_calculations').all()
    serializer_class = OperationalPayrollRunSerializer
    filterset_fields = ['status', 'payroll_month', 'period_start', 'period_end']
    search_fields = ['run_number', 'payroll_period__name', 'notes']

    @action(detail=False, methods=['get'], url_path='summary-list')
    def summary_list(self, request):
        company = get_current_company()
        if not company:
            return Response({'error': 'Tenant company context required'}, status=status.HTTP_400_BAD_REQUEST)
        status_filter = request.query_params.get('status')
        month_filter = request.query_params.get('payroll_month')
        runs = PayrollRunService.get_runs_list(company, status=status_filter, payroll_month=month_filter)
        return Response(runs, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='create-from-ready')
    def create_from_ready(self, request):
        company = get_current_company()
        if not company:
            return Response({'error': 'Tenant company context required'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = CreatePayrollRunFromReadySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            payroll_run = PayrollRunService.create_payroll_run_from_calculations(
                company=company,
                period_start=data['period_start'],
                period_end=data['period_end'],
                calculation_ids=data.get('calculation_ids'),
                user=request.user,
                notes=data.get('notes', '')
            )
            out_ser = self.get_serializer(payroll_run, context={'request': request})
            return Response({
                'message': f"Payroll run {payroll_run.run_number} created with {payroll_run.employee_count} employee(s).",
                'payroll_run': out_ser.data
            }, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='submit-for-review')
    def submit_review(self, request, pk=None):
        company = get_current_company()
        payroll_run = self.get_object()
        try:
            payroll_run = PayrollRunService.submit_for_review(company, payroll_run, user=request.user)
            out_ser = self.get_serializer(payroll_run, context={'request': request})
            return Response({
                'message': f"Payroll run {payroll_run.run_number} submitted for review.",
                'payroll_run': out_ser.data
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='approve')
    def approve(self, request, pk=None):
        company = get_current_company()
        payroll_run = self.get_object()
        try:
            payroll_run = PayrollRunService.approve_payroll_run(company, payroll_run, user=request.user)
            out_ser = self.get_serializer(payroll_run, context={'request': request})
            return Response({
                'message': f"Payroll run {payroll_run.run_number} approved successfully.",
                'payroll_run': out_ser.data
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='finalize')
    def finalize(self, request, pk=None):
        company = get_current_company()
        payroll_run = self.get_object()
        try:
            result = PayrollRunService.finalize_payroll_run(company, payroll_run, user=request.user)
            payroll_run.refresh_from_db()
            out_ser = self.get_serializer(payroll_run, context={'request': request})
            return Response({
                'message': f"Payroll run {payroll_run.run_number} finalized and handed off to Finance.",
                'result': result,
                'payroll_run': out_ser.data
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel(self, request, pk=None):
        company = get_current_company()
        payroll_run = self.get_object()
        serializer = CancelPayrollRunActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            payroll_run = PayrollRunService.cancel_payroll_run(
                company, payroll_run, user=request.user, reason=serializer.validated_data.get('reason', '')
            )
            out_ser = self.get_serializer(payroll_run, context={'request': request})
            return Response({
                'message': f"Payroll run {payroll_run.run_number} cancelled.",
                'payroll_run': out_ser.data
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'], url_path='payslips')
    def get_payslips(self, request, pk=None):
        payroll_run = self.get_object()
        payslips = payroll_run.payslips.filter(is_deleted=False).select_related(
            'employee', 'employee__designation', 'employee__department', 'currency'
        ).prefetch_related('lines').order_by('employee__first_name')
        ser = OperationalPayslipSerializer(payslips, many=True, context={'request': request})
        return Response(ser.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'], url_path='finance-status')
    def finance_status(self, request, pk=None):
        payroll_run = self.get_object()
        fin = payroll_run.finance_integrations.first()
        if not fin:
            return Response({
                'integrated': False,
                'message': 'No Finance integration found for this payroll run.'
            }, status=status.HTTP_200_OK)
        batches = list(fin.payment_batches.filter(is_deleted=False).values(
            'id', 'batch_number', 'status', 'total_amount', 'total_employees', 'payment_date'
        ))
        return Response({
            'integrated': True,
            'id': str(fin.id),
            'status': fin.status,
            'status_label': fin.get_status_display(),
            'gross_payroll': str(fin.gross_payroll),
            'net_payroll_payable': str(fin.net_payroll_payable),
            'remaining_liability': str(fin.remaining_liability),
            'total_paid': str(fin.total_paid),
            'total_employees': fin.total_employees,
            'unresolved_employees_count': fin.unresolved_employees_count,
            'blocking_reason': fin.blocking_reason,
            'payroll_payable_account': fin.payroll_payable_account.account_code if fin.payroll_payable_account else None,
            'payment_batches': batches
        }, status=status.HTTP_200_OK)


class OperationalPayslipViewSet(TenantModelViewSet):
    queryset = Payslip.objects.select_related(
        'payroll_run', 'employee', 'employee__designation', 'employee__department', 'currency'
    ).prefetch_related('lines').all()
    serializer_class = OperationalPayslipSerializer
    filterset_fields = ['payroll_run', 'employee', 'status']
    search_fields = ['payslip_number', 'employee__first_name', 'employee__last_name', 'employee__employee_code']

    @action(detail=True, methods=['get'], url_path='detail-snapshot')
    def detail_snapshot(self, request, pk=None):
        payslip = self.get_object()
        ser = self.get_serializer(payslip, context={'request': request})
        return Response({
            'payslip': ser.data,
            'company_name': payslip.company.name,
            'employee_name': f"{payslip.employee.first_name} {payslip.employee.last_name}".strip(),
            'designation': payslip.employee.designation.name if payslip.employee.designation else 'Security Guard',
            'department': payslip.employee.department.name if payslip.employee.department else 'Operations',
            'period_label': f"{payslip.period_start} to {payslip.period_end}",
            'currency_code': payslip.currency.code if payslip.currency else 'PKR'
        }, status=status.HTTP_200_OK)


# ==============================================================================
# PHASE S-7: ADVANCED SECURITY OPERATIONS VIEWSETS
# ==============================================================================

from .models import (
    DailyOccurrenceLog, SiteCheckpoint, PatrolPlan, PatrolRun,
    GuardTour, GuardTourEvent, EmergencyEvent, SupervisorInspection,
    OperationsEscalation, InspectionPolicy, InspectionCriterionPolicy
)
from .serializers import (
    DailyOccurrenceLogSerializer, SiteCheckpointSerializer,
    PatrolPlanSerializer, PatrolRunSerializer, GuardTourSerializer,
    GuardTourEventSerializer, EmergencyEventSerializer,
    SupervisorInspectionSerializer, OperationsEscalationSerializer,
    VerifyCheckpointActionSerializer, TriggerEmergencyActionSerializer,
    AcknowledgeEmergencyActionSerializer, ResolveEmergencyActionSerializer,
    ResolveEscalationActionSerializer, InspectionPolicySerializer,
    InspectionCriterionPolicySerializer
)
from operations.services.advanced_operations_service import AdvancedOperationsService


class DailyOccurrenceLogViewSet(BaseSecurityOpsViewSet):
    queryset = DailyOccurrenceLog.objects.select_related(
        'site', 'post', 'shift', 'employee', 'logged_by', 'incident_reference'
    ).all()
    serializer_class = DailyOccurrenceLogSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['title', 'details', 'site__name']
    ordering_fields = ['timestamp', 'created_at']

    def get_queryset(self):
        qs = super().get_queryset()
        site_id = self.request.query_params.get('site')
        entry_type = self.request.query_params.get('entry_type')
        is_flagged = self.request.query_params.get('is_flagged')
        if site_id:
            qs = qs.filter(site_id=site_id)
        if entry_type:
            qs = qs.filter(entry_type=entry_type)
        if is_flagged is not None:
            qs = qs.filter(is_flagged=is_flagged.lower() == 'true')
        return qs

    def perform_create(self, serializer):
        serializer.save(company_id=self.request.user.company_id, logged_by=self.request.user)


class SiteCheckpointViewSet(BaseSecurityOpsViewSet):
    queryset = SiteCheckpoint.objects.select_related('site').all()
    serializer_class = SiteCheckpointSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'code', 'location_description', 'site__name']
    ordering_fields = ['sequence_order', 'code', 'created_at']

    def get_queryset(self):
        qs = super().get_queryset()
        site_id = self.request.query_params.get('site')
        is_active = self.request.query_params.get('is_active')
        if site_id:
            qs = qs.filter(site_id=site_id)
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == 'true')
        return qs


class PatrolPlanViewSet(BaseSecurityOpsViewSet):
    queryset = PatrolPlan.objects.select_related('site', 'shift', 'assigned_employee').all()
    serializer_class = PatrolPlanSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'description', 'site__name']
    ordering_fields = ['name', 'created_at']

    def get_queryset(self):
        qs = super().get_queryset()
        site_id = self.request.query_params.get('site')
        frequency = self.request.query_params.get('frequency')
        is_active = self.request.query_params.get('is_active')
        if site_id:
            qs = qs.filter(site_id=site_id)
        if frequency:
            qs = qs.filter(frequency=frequency)
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == 'true')
        return qs


class PatrolRunViewSet(BaseSecurityOpsViewSet):
    queryset = PatrolRun.objects.select_related(
        'site', 'plan', 'shift', 'assigned_employee', 'roster'
    ).all()
    serializer_class = PatrolRunSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['run_code', 'site__name', 'notes']
    ordering_fields = ['scheduled_start', 'status', 'created_at']

    def get_queryset(self):
        qs = super().get_queryset()
        site_id = self.request.query_params.get('site')
        status_param = self.request.query_params.get('status')
        plan_id = self.request.query_params.get('plan')
        if site_id:
            qs = qs.filter(site_id=site_id)
        if status_param:
            qs = qs.filter(status=status_param)
        if plan_id:
            qs = qs.filter(plan_id=plan_id)
        return qs

    @action(detail=True, methods=['post'], url_path='complete')
    def complete_run(self, request, pk=None):
        run = self.get_object()
        status_choice = request.data.get('status', 'COMPLETED')
        completion_notes = request.data.get('completion_notes', '')
        try:
            completed_run = AdvancedOperationsService.complete_patrol_run(
                company=run.company_id,
                run_id=str(run.id),
                status=status_choice,
                completion_notes=completion_notes
            )
            return Response(self.get_serializer(completed_run).data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class GuardTourViewSet(BaseSecurityOpsViewSet):
    queryset = GuardTour.objects.select_related(
        'site', 'patrol_run', 'shift', 'assigned_employee', 'roster'
    ).prefetch_related('events', 'events__checkpoint').all()
    serializer_class = GuardTourSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['tour_name', 'site__name', 'notes']
    ordering_fields = ['start_time', 'status', 'created_at']

    def get_queryset(self):
        qs = super().get_queryset()
        site_id = self.request.query_params.get('site')
        status_param = self.request.query_params.get('status')
        if site_id:
            qs = qs.filter(site_id=site_id)
        if status_param:
            qs = qs.filter(status=status_param)
        return qs

    @action(detail=True, methods=['post'], url_path='verify-checkpoint')
    def verify_checkpoint(self, request, pk=None):
        tour = self.get_object()
        serializer = VerifyCheckpointActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            event = AdvancedOperationsService.verify_checkpoint(
                company=tour.company_id,
                tour_id=str(tour.id),
                checkpoint_id=str(data['checkpoint_id']),
                user=request.user,
                verification_source=data.get('verification_source', 'MANUAL'),
                latitude=data.get('latitude'),
                longitude=data.get('longitude'),
                accuracy_meters=data.get('accuracy_meters'),
                notes=data.get('notes', '')
            )
            return Response(GuardTourEventSerializer(event).data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='complete')
    def complete_tour(self, request, pk=None):
        tour = self.get_object()
        notes = request.data.get('notes', '')
        try:
            completed_tour = AdvancedOperationsService.complete_guard_tour(
                company=tour.company_id,
                tour_id=str(tour.id),
                user=request.user,
                notes=notes
            )
            return Response(self.get_serializer(completed_tour).data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class EmergencyEventViewSet(BaseSecurityOpsViewSet):
    queryset = EmergencyEvent.objects.select_related(
        'site', 'post', 'employee', 'reported_by', 'acknowledged_by', 'assigned_responder'
    ).all()
    serializer_class = EmergencyEventSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['description', 'site__name']
    ordering_fields = ['occurred_at', 'status', 'created_at']

    def get_queryset(self):
        qs = super().get_queryset()
        site_id = self.request.query_params.get('site')
        status_param = self.request.query_params.get('status')
        event_type = self.request.query_params.get('event_type')
        if site_id:
            qs = qs.filter(site_id=site_id)
        if status_param:
            qs = qs.filter(status=status_param)
        if event_type:
            qs = qs.filter(event_type=event_type)
        return qs

    @action(detail=False, methods=['post'], url_path='trigger')
    def trigger_emergency(self, request):
        serializer = TriggerEmergencyActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            emergency = AdvancedOperationsService.trigger_emergency(
                company=request.user.company_id,
                site=data['site_id'],
                event_type=data.get('event_type', 'PANIC_BUTTON'),
                severity=data.get('severity', 'CRITICAL'),
                employee=data.get('employee_id'),
                reported_by=request.user,
                description=data.get('description', ''),
                latitude=data.get('latitude'),
                longitude=data.get('longitude'),
                accuracy_meters=data.get('accuracy_meters')
            )
            return Response(self.get_serializer(emergency).data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='acknowledge')
    def acknowledge(self, request, pk=None):
        emergency = self.get_object()
        serializer = AcknowledgeEmergencyActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        responder = None
        if data.get('responder_id'):
            from django.contrib.auth import get_user_model
            User = get_user_model()
            responder = User.objects.filter(id=data['responder_id']).first()

        try:
            ack_em = AdvancedOperationsService.acknowledge_emergency(
                company=emergency.company_id,
                emergency_id=str(emergency.id),
                user=request.user,
                responder=responder,
                response_notes=data.get('response_notes', '')
            )
            return Response(self.get_serializer(ack_em).data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='resolve')
    def resolve(self, request, pk=None):
        emergency = self.get_object()
        serializer = ResolveEmergencyActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            res_em = AdvancedOperationsService.resolve_emergency(
                company=emergency.company_id,
                emergency_id=str(emergency.id),
                user=request.user,
                resolution_summary=data['resolution_summary'],
                is_false_alarm=data.get('is_false_alarm', False)
            )
            return Response(self.get_serializer(res_em).data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class SupervisorInspectionViewSet(BaseSecurityOpsViewSet):
    queryset = SupervisorInspection.objects.select_related(
        'site', 'post', 'shift', 'inspector', 'reviewed_by'
    ).all()
    serializer_class = SupervisorInspectionSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['deficiencies_observed', 'corrective_action_required', 'notes', 'site__name']
    ordering_fields = ['inspection_datetime', 'overall_score', 'status', 'created_at']

    def get_queryset(self):
        qs = super().get_queryset()
        site_id = self.request.query_params.get('site')
        status_param = self.request.query_params.get('status')
        if site_id:
            qs = qs.filter(site_id=site_id)
        if status_param:
            qs = qs.filter(status=status_param)
        return qs

    def perform_create(self, serializer):
        inspection = serializer.save(company_id=self.request.user.company_id, inspector=self.request.user)
        evaluation = AdvancedOperationsService.evaluate_inspection(
            company=inspection.company_id,
            guard_presence_verified=inspection.guard_presence_verified,
            uniform_condition=inspection.uniform_condition,
            equipment_condition=inspection.equipment_condition,
            post_cleanliness_condition=inspection.post_cleanliness_condition,
            documentation_in_order=inspection.documentation_in_order,
            turnout_and_bearing=inspection.turnout_and_bearing,
            deficiencies_observed=inspection.deficiencies_observed,
            corrective_action_required=inspection.corrective_action_required,
            inspection_date=inspection.inspection_datetime
        )
        inspection.overall_score = evaluation['overall_score']
        inspection.status = evaluation['status']
        inspection.policy = evaluation['policy']
        inspection.save()

        if evaluation['has_deficiencies']:
            from operations.models import EscalationSourceType
            AdvancedOperationsService.create_escalation(
                company=inspection.company_id,
                source_type=EscalationSourceType.INSPECTION_FAILURE,
                source_id=str(inspection.id),
                site=inspection.site,
                title=f"Inspection Deficiencies @ {inspection.site.name} ({evaluation['overall_score']}%)",
                description=f"Deficiencies: {inspection.deficiencies_observed}. Action: {inspection.corrective_action_required}",
                priority=evaluation['escalation_priority']
            )


class OperationsEscalationViewSet(BaseSecurityOpsViewSet):
    queryset = OperationsEscalation.objects.select_related('site', 'assigned_to').all()
    serializer_class = OperationsEscalationSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['title', 'description', 'site__name']
    ordering_fields = ['priority', 'due_at', 'status', 'created_at']

    def get_queryset(self):
        qs = super().get_queryset()
        site_id = self.request.query_params.get('site')
        status_param = self.request.query_params.get('status')
        priority = self.request.query_params.get('priority')
        source_type = self.request.query_params.get('source_type')
        if site_id:
            qs = qs.filter(site_id=site_id)
        if status_param:
            qs = qs.filter(status=status_param)
        if priority:
            qs = qs.filter(priority=priority)
        if source_type:
            qs = qs.filter(source_type=source_type)
        return qs

    @action(detail=True, methods=['post'], url_path='acknowledge')
    def acknowledge(self, request, pk=None):
        esc = self.get_object()
        esc.status = 'ACKNOWLEDGED'
        esc.acknowledged_at = timezone.now()
        esc.save(update_fields=['status', 'acknowledged_at', 'updated_at'])
        return Response(self.get_serializer(esc).data)

    @action(detail=True, methods=['post'], url_path='resolve')
    def resolve_escalation(self, request, pk=None):
        escalation = self.get_object()
        serializer = ResolveEscalationActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        updated = AdvancedOperationsService.resolve_escalation(
            escalation=escalation,
            resolution_notes=serializer.validated_data['resolution_notes']
        )
        return Response(self.get_serializer(updated).data)


class InspectionPolicyViewSet(BaseSecurityOpsViewSet):
    queryset = InspectionPolicy.objects.prefetch_related('criteria').all()
    serializer_class = InspectionPolicySerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name']
    ordering_fields = ['effective_from', 'name', 'created_at']

    @action(detail=True, methods=['post'], url_path='configure-criteria')
    def configure_criteria(self, request, pk=None):
        policy = self.get_object()
        criteria_data = request.data.get('criteria', [])
        for item in criteria_data:
            code = item.get('criterion_code')
            weight = item.get('deduction_weight')
            is_active = item.get('is_active', True)
            if code and weight is not None:
                InspectionCriterionPolicy.objects.update_or_create(
                    company_id=request.user.company_id,
                    policy=policy,
                    criterion_code=code,
                    defaults={
                        'deduction_weight': Decimal(str(weight)),
                        'is_active': is_active
                    }
                )
        serializer = self.get_serializer(policy)
        return Response(serializer.data, status=status.HTTP_200_OK)


class AdvancedOperationsViewSet(viewsets.ViewSet):
    """
    Control Room Queue, Operations Dashboard, and Geofence Verification API.
    """
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    required_module = 'security_ops'
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager', 'staff']
    required_permissions = ['operations.read']

    def _resolve_company_id(self, request):
        company_id = (
            get_current_company()
            or request.META.get('HTTP_X_COMPANY_ID')
            or getattr(request.user, 'company_id', None)
        )
        if not company_id:
            raise ValidationError({'detail': 'Company context is required.'})
        return company_id

    @action(detail=False, methods=['get'], url_path='control-room')
    def control_room_queue(self, request):
        company_id = self._resolve_company_id(request)
        data = AdvancedOperationsService.get_control_room_queue(company_id)
        return Response(data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='dashboard')
    def operations_dashboard(self, request):
        company_id = self._resolve_company_id(request)
        data = AdvancedOperationsService.get_advanced_ops_dashboard(company_id)
        return Response(data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='geofence-validate')
    def geofence_validate(self, request):
        company_id = self._resolve_company_id(request)
        site_id = request.data.get('site_id')
        lat = request.data.get('latitude')
        lon = request.data.get('longitude')
        if not site_id:
            return Response({'error': 'site_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        site = OperationalSite.objects.get(id=site_id, company_id=company_id)
        geofence_status = AdvancedOperationsService.evaluate_geofence(site, lat, lon)
        return Response({
            'site_id': str(site.id),
            'site_name': site.name,
            'center_latitude': str(site.latitude) if site.latitude else None,
            'center_longitude': str(site.longitude) if site.longitude else None,
            'radius_meters': site.geofence_radius_meters or 100,
            'evaluated_status': geofence_status
        }, status=status.HTTP_200_OK)


class SecurityCrossModuleRBACPermission(BasePermission):
    """
    Phase S-8.2: Authoritative Zorvex Access Control for Cross-Module Integration.
    Enforces the Zorvex Access Formula:
        Company module enabled (security_ops)
        +
        Security capability exposed (company business_type / industry)
        +
        User access_mode / UserModuleAccess (FULL_COMPANY or explicit CUSTOM grant)
        +
        Authoritative RBAC Permission (operations.read for views, operations.write for sensitive actions)
        = ALLOW

    Does NOT depend on legacy static role names (admin/manager/cashier).
    Backend authorization is authoritative.
    """
    message = "You do not have permission to perform this cross-module operation."

    ACTION_PERMISSIONS = {
        # Safe / Context Read operations
        'action_center': ['operations.read', 'operations.all_sites', 'operations.assigned_sites'],
        'client_context': ['operations.read', 'operations.all_sites', 'operations.assigned_sites'],
        'employee_context': ['operations.read', 'operations.all_sites', 'operations.assigned_sites'],
        'site_context': ['operations.read', 'operations.all_sites', 'operations.assigned_sites'],
        # Sensitive Write / Mutation operations
        'purchase_request_from_shortage': ['operations.write', 'inventory.write', 'purchasing.write'],
        'client_billing_snapshot': ['operations.write', 'finance.write', 'billing.write'],
        'resolve_exception': ['operations.write'],
    }

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False

        # Superusers bypass authorization checks
        if user.is_superuser or getattr(user, 'role', None) == 'super_admin':
            return True

        company_id = (
            get_current_company()
            or request.META.get('HTTP_X_COMPANY_ID')
            or getattr(user, 'company_id', None)
        )
        if not company_id:
            raise PermissionDenied({'detail': 'Company context is required.'})

        # 1. Company Module Enabled (security_ops)
        from platform_core.services import is_module_enabled
        if not is_module_enabled(company_id, 'security_ops'):
            raise PermissionDenied({
                'detail': 'Module security_ops is not enabled for your company.',
                'module': 'security_ops'
            })

        # 2. Security Capability Exposed
        if not is_security_capability_exposed(company_id):
            raise PermissionDenied({
                'detail': 'Security capability is not exposed for your company industry profile.',
                'capability': 'security_ops'
            })

        # 3. User access_mode / UserModuleAccess
        if getattr(user, 'access_mode', 'FULL_COMPANY') == 'CUSTOM':
            has_grant = user.custom_module_access.filter(
                module__code='security_ops',
                enabled=True
            ).exists()
            if not has_grant:
                raise PermissionDenied({
                    'detail': 'You do not have custom module access to security_ops.',
                    'module': 'security_ops'
                })

        # 4. RBAC Granular Permissions (authoritative gate, independent of static role strings)
        action = getattr(view, 'action', None)
        required_perms = self.ACTION_PERMISSIONS.get(action)
        if not required_perms:
            if request.method in ('GET', 'HEAD', 'OPTIONS'):
                required_perms = ['operations.read']
            else:
                required_perms = ['operations.write']

        # Determine user's active permissions from company_role or direct user permissions
        user_perms = set()
        company_role = getattr(user, 'company_role', None)
        if company_role and company_role.is_active:
            user_perms.update(company_role.permissions or [])

        if hasattr(user, 'get_all_permissions'):
            user_perms.update(user.get_all_permissions())

        # Wildcard or Admin permission check
        if getattr(user, 'is_superuser', False) or getattr(user, 'role', None) in ('super_admin', 'admin') or '*' in user_perms or 'operations.*' in user_perms:
            return True

        # Check if user has ANY of the required permissions for this action
        if any(perm in user_perms for perm in required_perms):
            return True

        raise PermissionDenied({
            'detail': f"Action '{action or request.method}' requires one of permissions: {required_perms}.",
            'required_permissions': required_perms
        })


class CrossModuleIntegrationViewSet(viewsets.ViewSet):
    """
    Phase S-8: Authoritative Cross-Module Integration Hub.
    Provides action-center exceptions, shared context navigation,
    controlled purchase request handoffs from shortages, and client billing reconciliation.
    """
    permission_classes = [IsAuthenticated, SecurityCrossModuleRBACPermission]
    required_module = 'security_ops'
    required_permissions = ['operations.read']

    def _resolve_company_id(self, request):
        company_id = (
            get_current_company()
            or request.META.get('HTTP_X_COMPANY_ID')
            or getattr(request.user, 'company_id', None)
        )
        if not company_id:
            raise ValidationError({'detail': 'Company context is required.'})
        return company_id

    @action(detail=False, methods=['get'], url_path='action-center')
    def action_center(self, request):
        from operations.services.cross_module_integration_service import CrossModuleIntegrationService
        company_id = self._resolve_company_id(request)
        target_date = request.query_params.get('target_date') or request.query_params.get('date')
        data = CrossModuleIntegrationService.get_action_center_exceptions(company_id, target_date=target_date)
        return Response(data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='client-context')
    def client_context(self, request):
        from operations.services.cross_module_integration_service import CrossModuleIntegrationService
        company_id = self._resolve_company_id(request)
        client_id = request.query_params.get('client_id') or request.query_params.get('client')
        if not client_id:
            return Response({'error': 'client_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            data = CrossModuleIntegrationService.get_client_shared_context(company_id, client_id)
            return Response(data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], url_path='employee-context')
    def employee_context(self, request):
        from operations.services.cross_module_integration_service import CrossModuleIntegrationService
        company_id = self._resolve_company_id(request)
        employee_id = request.query_params.get('employee_id') or request.query_params.get('employee')
        if not employee_id:
            return Response({'error': 'employee_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            data = CrossModuleIntegrationService.get_employee_shared_context(company_id, employee_id)
            return Response(data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], url_path='site-context')
    def site_context(self, request):
        from operations.services.cross_module_integration_service import CrossModuleIntegrationService
        company_id = self._resolve_company_id(request)
        site_id = request.query_params.get('site_id') or request.query_params.get('site')
        if not site_id:
            return Response({'error': 'site_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            data = CrossModuleIntegrationService.get_site_shared_context(company_id, site_id)
            return Response(data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='purchase-request-from-shortage')
    def purchase_request_from_shortage(self, request):
        from decimal import Decimal
        from operations.services.cross_module_integration_service import CrossModuleIntegrationService
        company_id = self._resolve_company_id(request)
        item_id = request.data.get('item_id')
        qty = request.data.get('quantity', 1)
        warehouse_id = request.data.get('warehouse_id')
        notes = request.data.get('notes', '')
        if not item_id:
            return Response({'error': 'item_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            quantity = Decimal(str(qty))
        except Exception:
            return Response({'error': 'Invalid quantity'}, status=status.HTTP_400_BAD_REQUEST)

        doc = CrossModuleIntegrationService.create_purchase_request_from_inventory_shortage(
            company_id=company_id,
            item_id=item_id,
            quantity=quantity,
            user=request.user,
            warehouse_id=warehouse_id,
            notes=notes
        )
        return Response({
            'id': str(doc.id),
            'number': doc.number,
            'status': doc.status,
            'document_type': doc.document_type,
            'total_amount': str(doc.total_amount),
            'message': f"Purchase Request {doc.number} processed successfully."
        }, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], url_path='client-billing-snapshot')
    def client_billing_snapshot(self, request):
        from operations.services.cross_module_integration_service import CrossModuleIntegrationService
        company_id = self._resolve_company_id(request)
        contract_id = request.data.get('contract_id')
        period_start = request.data.get('period_start')
        period_end = request.data.get('period_end')
        if not contract_id or not period_start or not period_end:
            return Response({'error': 'contract_id, period_start, and period_end are required'}, status=status.HTTP_400_BAD_REQUEST)

        result = CrossModuleIntegrationService.generate_client_billing_snapshot(
            company_id=company_id,
            contract_id=contract_id,
            period_start=period_start,
            period_end=period_end,
            user=request.user
        )
        return Response(result, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='resolve-exception')
    def resolve_exception(self, request):
        from operations.services.cross_module_integration_service import CrossModuleIntegrationService
        company_id = self._resolve_company_id(request)
        source_type = request.data.get('source_type')
        source_id = request.data.get('source_id')
        action_name = request.data.get('action', 'ACKNOWLEDGE')
        notes = request.data.get('notes', '')
        extra_params = request.data.get('extra_params', {})
        if not source_type or not source_id:
            return Response({'error': 'source_type and source_id are required'}, status=status.HTTP_400_BAD_REQUEST)

        result = CrossModuleIntegrationService.resolve_action_center_exception(
            company_id=company_id,
            source_type=source_type,
            source_id=source_id,
            action=action_name,
            user=request.user,
            notes=notes,
            extra_params=extra_params
        )
        return Response(result, status=status.HTTP_200_OK)


def is_security_capability_exposed(company_or_id) -> bool:
    """
    Phase S-9.1: Verifies that the tenant company exposes the 'security_ops' capability.
    Enforces the Zorvex Access Architecture:
    CompanyModule enabled + Security capability exposed + UserModuleAccess + RBAC = ALLOW.
    """
    from companies.models import Company
    if isinstance(company_or_id, Company):
        company = company_or_id
    else:
        company = Company.objects.filter(id=company_or_id).first()

    if not company:
        return False

    b_type = getattr(company, 'business_type', None)
    # If no industry constraint is set (universal/empty), capability is available
    if not b_type or b_type == 'security':
        return True

    try:
        from industries.common.registry import get_industry_package
        pkg = get_industry_package(b_type)
        if pkg:
            return any(cap.engine == 'security_ops' or cap.code == 'operations' for cap in pkg.get_capabilities())
        return False
    except Exception:
        return b_type == 'security'


class SecurityReportsRBACPermission(BasePermission):
    """
    Phase S-9 / S-9.1: Authoritative Zorvex Access Control for Security vertical Reports & Analytics.
    Enforces the Zorvex Access Formula:
        Company module enabled (security_ops)
        +
        Security capability exposed
        +
        User access_mode / UserModuleAccess (FULL_COMPANY or explicit CUSTOM grant)
        +
        Granular RBAC & Domain Confidentiality:
          - Base: operations.read or reports.read
          - Finance / Profitability: finance.read
          - Workforce Payroll / Statutory: hrm.read / payroll.read
        = ALLOW
    Zero hardcoded static role strings.
    """
    message = "You do not have permission to access Security reports and analytics."

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False

        if user.is_superuser or getattr(user, 'role', None) == 'super_admin':
            return True

        company_id = (
            get_current_company()
            or request.META.get('HTTP_X_COMPANY_ID')
            or getattr(user, 'company_id', None)
        )
        if not company_id:
            raise PermissionDenied({'detail': 'Company context is required.'})

        # 1. Company Module Enabled
        from platform_core.services import is_module_enabled
        if not is_module_enabled(company_id, 'security_ops'):
            raise PermissionDenied({
                'detail': 'Module security_ops is not enabled for your company.',
                'module': 'security_ops'
            })

        # 2. Security Capability Exposed
        if not is_security_capability_exposed(company_id):
            raise PermissionDenied({
                'detail': 'Security capability is not exposed for your company industry profile.',
                'capability': 'security_ops'
            })

        # 3. User access_mode / UserModuleAccess
        if getattr(user, 'access_mode', 'FULL_COMPANY') == 'CUSTOM':
            has_grant = user.custom_module_access.filter(
                module__code='security_ops',
                enabled=True
            ).exists()
            if not has_grant:
                raise PermissionDenied({
                    'detail': 'You do not have custom module access to security_ops.',
                    'module': 'security_ops'
                })

        # 4. Granular RBAC Permissions & Domain Confidentiality
        action = getattr(view, 'action', None)
        user_perms = set()
        company_role = getattr(user, 'company_role', None)
        if company_role and company_role.is_active:
            user_perms.update(company_role.permissions or [])
        if hasattr(user, 'get_all_permissions'):
            user_perms.update(user.get_all_permissions())

        # Wildcard or Admin permission check
        if getattr(user, 'is_superuser', False) or getattr(user, 'role', None) in ('super_admin', 'admin') or '*' in user_perms:
            return True

        # Financial reports strictly require financial permissions
        if action in ('profitability', 'finance'):
            if not any(p in user_perms for p in ('finance.*', 'finance.read', 'finance.write')):
                raise PermissionDenied({'detail': 'Financial reports require finance.read permission.'})
            return True

        # Workforce payroll & statutory reports strictly require HR/Payroll permissions
        if action == 'workforce':
            report_type = request.query_params.get('report_type', 'employee_master')
            if report_type in ('payroll_summary', 'statutory'):
                if not any(p in user_perms for p in ('hrm.*', 'hrm.read', 'hrm.write', 'payroll.read', 'payroll.*', 'finance.*', 'finance.read')):
                    raise PermissionDenied({'detail': 'Access to Payroll & Statutory reports requires HR/Payroll permissions.'})

        # CSV export confidentiality gate
        if action == 'export_csv':
            domain = request.query_params.get('domain', 'workforce')
            report_type = request.query_params.get('report_type', 'employee_master')
            if domain in ('finance', 'profitability'):
                if not any(p in user_perms for p in ('finance.*', 'finance.read', 'finance.write')):
                    raise PermissionDenied({'detail': 'Exporting financial reports requires finance.read permission.'})
            elif domain == 'workforce' and report_type in ('payroll_summary', 'statutory'):
                if not any(p in user_perms for p in ('hrm.*', 'hrm.read', 'hrm.write', 'payroll.read', 'payroll.*', 'finance.*', 'finance.read')):
                    raise PermissionDenied({'detail': 'Exporting payroll reports requires HR/Payroll permissions.'})

        required_base = ['operations.read', 'operations.all_sites', 'operations.assigned_sites', 'reports.read']
        if any(p in user_perms for p in required_base):
            return True

        raise PermissionDenied({'detail': 'You do not have permission to view operations reports.'})


class SecurityReportsViewSet(viewsets.ViewSet):
    """
    Phase S-9: Management Reporting and Analytical API for Security Industry Vertical.
    """
    permission_classes = [IsAuthenticated, SecurityReportsRBACPermission]

    def _resolve_company(self, request):
        from companies.models import Company
        company_id = (
            get_current_company()
            or request.META.get('HTTP_X_COMPANY_ID')
            or getattr(request.user, 'company_id', None)
        )
        company = Company.objects.filter(id=company_id).first()
        if not company:
            raise PermissionDenied("Active company context is required.")
        return company

    @action(detail=False, methods=['get'], url_path='executive-dashboard')
    def executive_dashboard(self, request):
        from operations.services.security_reporting_service import SecurityReportingService
        company = self._resolve_company(request)
        data = SecurityReportingService.get_executive_dashboard(
            company=company,
            user=request.user,
            filters=request.query_params
        )
        return Response(data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='profitability')
    def profitability(self, request):
        from operations.services.security_reporting_service import SecurityReportingService
        company = self._resolve_company(request)
        dimension = request.query_params.get('dimension', 'contract')
        data = SecurityReportingService.get_profitability_report(
            company=company,
            user=request.user,
            dimension=dimension,
            filters=request.query_params
        )
        return Response(data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='workforce')
    def workforce(self, request):
        from operations.services.security_reporting_service import SecurityReportingService
        company = self._resolve_company(request)
        report_type = request.query_params.get('report_type', 'employee_master')
        data = SecurityReportingService.get_workforce_reports(
            company=company,
            user=request.user,
            report_type=report_type,
            filters=request.query_params
        )
        return Response(data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='operations')
    def operations(self, request):
        from operations.services.security_reporting_service import SecurityReportingService
        company = self._resolve_company(request)
        report_type = request.query_params.get('report_type', 'site_manpower')
        data = SecurityReportingService.get_operations_reports(
            company=company,
            user=request.user,
            report_type=report_type,
            filters=request.query_params
        )
        return Response(data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='inventory')
    def inventory(self, request):
        from operations.services.security_reporting_service import SecurityReportingService
        company = self._resolve_company(request)
        report_type = request.query_params.get('report_type', 'store_stock')
        data = SecurityReportingService.get_inventory_reports(
            company=company,
            user=request.user,
            report_type=report_type,
            filters=request.query_params
        )
        return Response(data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='purchasing')
    def purchasing(self, request):
        from operations.services.security_reporting_service import SecurityReportingService
        company = self._resolve_company(request)
        report_type = request.query_params.get('report_type', 'purchase_orders')
        data = SecurityReportingService.get_purchasing_reports(
            company=company,
            user=request.user,
            report_type=report_type,
            filters=request.query_params
        )
        return Response(data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='finance')
    def finance(self, request):
        from operations.services.security_reporting_service import SecurityReportingService
        company = self._resolve_company(request)
        report_type = request.query_params.get('report_type', 'ar_aging')
        data = SecurityReportingService.get_finance_reports(
            company=company,
            user=request.user,
            report_type=report_type,
            filters=request.query_params
        )
        return Response(data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='compliance')
    def compliance(self, request):
        from operations.services.security_reporting_service import SecurityReportingService
        company = self._resolve_company(request)
        data = SecurityReportingService.get_compliance_reports(
            company=company,
            user=request.user,
            filters=request.query_params
        )
        return Response(data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='trends')
    def trends(self, request):
        from operations.services.security_reporting_service import SecurityReportingService
        company = self._resolve_company(request)
        months = int(request.query_params.get('months', 6))
        data = SecurityReportingService.get_trends_report(
            company=company,
            user=request.user,
            months=months
        )
        return Response(data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='drill-down')
    def drill_down(self, request):
        from operations.services.security_reporting_service import SecurityReportingService
        company = self._resolve_company(request)
        entity_type = request.query_params.get('entity_type', 'site')
        entity_id = request.query_params.get('entity_id', '')
        data = SecurityReportingService.get_drill_down_data(
            company=company,
            user=request.user,
            entity_type=entity_type,
            entity_id=entity_id
        )
        return Response(data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='export-csv')
    def export_csv(self, request):
        from operations.services.security_reporting_service import SecurityReportingService
        company = self._resolve_company(request)
        domain = request.query_params.get('domain', 'workforce')
        report_type = request.query_params.get('report_type', 'employee_master')
        return SecurityReportingService.export_report_csv(
            company=company,
            user=request.user,
            domain=domain,
            report_type=report_type,
            filters=request.query_params
        )







