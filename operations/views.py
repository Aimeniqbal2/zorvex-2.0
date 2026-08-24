import logging
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.utils import timezone
from django.db.models import Count, Q, OuterRef, Subquery, IntegerField, Value
from django.db.models.functions import Coalesce
from datetime import timedelta

from erp_core.views import TenantModelViewSet
from erp_core.permissions import RolePermission
from platform_core.permissions import ModulePermission
from erp_core.middleware import get_current_company

from .models import (
    OperationalSite, ServiceContract, ContractRate,
    Deployment, DeploymentStatus,
    DutyAssignment, DutyAssignmentStatus,
    ExtraDuty,
    TemporaryServiceRequest, TemporaryServiceLine,
    QAChecklistTemplate, QAChecklistItem, QAInspection,
    QAInspectionResponse, QAFinding, CorrectiveAction,
    IncidentReport, IncidentAttachment, DailyActivityReport, DailyActivityEntry,
    SiteStaffingRequirement
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
    SiteStaffingRequirementSerializer
)

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
    Each Deployment = one Employee at one Site under one Designation.
    Staffing shortage = count active deployments vs required.
    """
    queryset = Deployment.objects.select_related(
        'employee', 'employee__user', 'site', 'service_contract', 'designation'
    ).all()
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['employee__first_name', 'employee__last_name', 'site__name', 'designation__name']
    ordering_fields = ['start_date', 'created_at', 'status']

    def get_serializer_class(self):
        if self.action == 'list':
            return DeploymentListSerializer
        return DeploymentSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        site_id = self.request.query_params.get('site')
        contract_id = self.request.query_params.get('contract')
        designation_id = self.request.query_params.get('designation')
        status_param = self.request.query_params.get('status')
        active_on = self.request.query_params.get('active_on')  # YYYY-MM-DD

        if site_id:
            qs = qs.filter(site_id=site_id)
        if contract_id:
            qs = qs.filter(service_contract_id=contract_id)
        if designation_id:
            qs = qs.filter(designation_id=designation_id)
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

    @action(detail=False, methods=['get'], url_path='staffing-summary')
    def staffing_summary(self, request):
        """
        GET /api/operations/deployments/staffing-summary/?site=<id>

        Returns per-site/designation breakdown:
        {
          site_id, site_name, designation_id, designation_name,
          assigned_count, active_deployment_count
        }

        Architecture note: Deployment = one employee. So assigned_count
        equals the number of ACTIVE Deployments per (site, designation).
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

        # Group by site + designation
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
    Read-only adapter for operational managers to view WorkforceAttendance.
    Actual creation/updates happen via DutyAssignment sync or HR Module.
    """
    from hrm.models import WorkforceAttendance
    queryset = WorkforceAttendance.objects.select_related('employee', 'employee__user').all()
    serializer_class = SecurityAttendanceSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['employee__first_name', 'employee__last_name']
    ordering_fields = ['date', 'check_in']

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
        
    def create(self, request, *args, **kwargs):
        return Response({"error": "Use duty-assignments/{id}/sync-attendance/ or HR module to create attendance."}, status=status.HTTP_405_METHOD_NOT_ALLOWED)
        
    def update(self, request, *args, **kwargs):
        return Response({"error": "Updates must go through HR module."}, status=status.HTTP_405_METHOD_NOT_ALLOWED)
        
    def partial_update(self, request, *args, **kwargs):
        return Response({"error": "Updates must go through HR module."}, status=status.HTTP_405_METHOD_NOT_ALLOWED)


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
        'employee', 'employee__user', 'item', 'item_serial', 'warehouse', 'site', 'issued_by', 'returned_by'
    ).all()
    serializer_class = EquipmentIssueSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['employee__first_name', 'employee__last_name', 'item__name', 'item_serial__serial_number']
    ordering_fields = ['issued_at', 'expected_return_date', 'status']

    def get_queryset(self):
        qs = super().get_queryset()
        status_param = self.request.query_params.get('status')
        employee_id = self.request.query_params.get('employee')
        item_id = self.request.query_params.get('item')
        site_id = self.request.query_params.get('site')

        if status_param:
            qs = qs.filter(status__iexact=status_param)
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
        """
        Custom create to execute inventory transaction automatically.
        Requires BOTH security_ops and inventory modules.
        """
        company_id = self._resolve_company(request)
        
        # Check inventory module permission
        # The easiest way is to let transaction_service handle it or check ModulePermission
        from platform_core.models import CompanyModule
        has_inventory = CompanyModule.objects.filter(company_id=company_id, module__code='inventory', enabled=True).exists()
        if not has_inventory:
            return Response({'error': 'Inventory module is required for equipment issuance.'}, status=status.HTTP_403_FORBIDDEN)
            
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        item_id = serializer.validated_data['item'].id
        warehouse_id = serializer.validated_data['warehouse'].id
        quantity = serializer.validated_data.get('quantity', 1)
        item_serial = serializer.validated_data.get('item_serial')
        
        from inventory.models import Item, ItemSerial
        from inventory.services.transaction_service import process_transaction
        from inventory.services.exceptions import InventoryException, NegativeStockException
        from django.core.exceptions import ValidationError
        from django.db import transaction
        
        item = Item.objects.get(id=item_id)
        warehouse = serializer.validated_data['warehouse']
        
        try:
            with transaction.atomic():
                # 1. Create issue record
                issue = serializer.save(issued_by=request.user, company_id=company_id)
                
                # 2. Process inventory movement
                serial_list = [item_serial.serial_number] if item_serial else None
                ref = f"EQP-ISSUE-{issue.id}"
                
                process_transaction(
                    company=item.company,
                    item=item,
                    warehouse=warehouse,
                    movement_type='EMPLOYEE_ISSUE',
                    quantity=quantity,
                    reference=ref,
                    user=request.user,
                    notes=f"Issued to employee {issue.employee_id}",
                    serial_numbers=serial_list
                )
                
        except (InventoryException, NegativeStockException, ValidationError) as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.exception("Equipment issue failed")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
        headers = self.get_success_headers(serializer.data)
        return Response(self.get_serializer(issue).data, status=status.HTTP_201_CREATED, headers=headers)

    @action(detail=True, methods=['post'], url_path='return')
    def return_equipment(self, request, pk=None):
        issue = self.get_object()
        from operations.models import EquipmentIssueStatus
        if issue.status != EquipmentIssueStatus.ISSUED:
            return Response({'error': f'Cannot return equipment in status {issue.status}'}, status=status.HTTP_400_BAD_REQUEST)
            
        return_condition = request.data.get('return_condition', '')
        notes = request.data.get('notes', '')
        
        from inventory.services.transaction_service import process_transaction
        from inventory.services.exceptions import InventoryException, NegativeStockException
        from django.core.exceptions import ValidationError
        from django.db import transaction
        
        try:
            with transaction.atomic():
                issue.status = EquipmentIssueStatus.RETURNED
                issue.returned_at = timezone.now()
                issue.returned_by = request.user
                if return_condition:
                    issue.return_condition = return_condition
                if notes:
                    issue.notes = f"{issue.notes}\nReturn notes: {notes}".strip()
                issue.save()
                
                serial_list = [issue.item_serial.serial_number] if issue.item_serial else None
                ref = f"EQP-RET-{issue.id}"
                
                process_transaction(
                    company=issue.company,
                    item=issue.item,
                    warehouse=issue.warehouse,
                    movement_type='EMPLOYEE_RETURN',
                    quantity=issue.quantity,
                    reference=ref,
                    user=request.user,
                    notes=f"Returned by employee {issue.employee_id}",
                    serial_numbers=serial_list
                )
        except (InventoryException, NegativeStockException, ValidationError) as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.exception("Equipment return failed")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
        return Response(self.get_serializer(issue).data)


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


# ---------------------------------------------------------------------------
# Incidents & Activity Reports
# ---------------------------------------------------------------------------

class IncidentReportViewSet(BaseSecurityOpsViewSet):
    queryset = IncidentReport.objects.select_related('site', 'reported_by', 'duty_assignment').prefetch_related('attachments').all()
    serializer_class = IncidentReportSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['incident_number', 'title', 'description', 'site__name']
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
            
        return queryset

    @action(detail=True, methods=['post'], url_path='review')
    def review_incident(self, request, pk=None):
        incident = self.get_object()
        new_status = request.data.get('status')
        resolution = request.data.get('resolution', '')
        
        if new_status not in ['UNDER_REVIEW', 'RESOLVED', 'CLOSED']:
            return Response({'error': 'Invalid status for review'}, status=status.HTTP_400_BAD_REQUEST)
            
        incident.status = new_status
        if resolution:
            incident.resolution = resolution
        incident.reviewed_by = request.user
        incident.reviewed_at = timezone.now()
        incident.save()
        
        return Response(self.get_serializer(incident).data)


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
