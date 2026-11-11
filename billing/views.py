"""
billing/views.py — Phase 8C

ViewSets for billing models, plus explicit @action endpoints for:
  - Generating a ServiceInvoice from DutyAssignments
  - Posting a ServiceInvoice to Finance
  - Processing an ExtraDuty through the payroll bridge
  - Syncing a DutyAssignment to WorkforceAttendance
"""
import logging
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from erp_core.views import TenantModelViewSet
from erp_core.permissions import RolePermission
from platform_core.permissions import ModulePermission

from .models import (
    ServiceInvoice, ServiceInvoiceLine,
    ExtraDutyPayrollBridge, BillingAccountingConfiguration,
    BillingPeriod, BillingSheet, BillingSheetLine, BillingAdjustment,
    ClientInvoice, ClientInvoiceLine, ClientInvoiceStatus,
    BillingSheetStatus, ReceiptStatus, RecoveryStatus,
    ClientReceipt, ClientReceiptAllocation, RecoveryActivity
)
from .serializers import (
    ServiceInvoiceSerializer, ServiceInvoiceLineSerializer,
    ExtraDutyPayrollBridgeSerializer, BillingAccountingConfigurationSerializer,
    BillingPeriodSerializer, BillingSheetSerializer, BillingSheetLineSerializer,
    BillingAdjustmentSerializer, ClientInvoiceSerializer, ClientInvoiceLineSerializer,
    ClientReceiptSerializer, ClientReceiptAllocationSerializer, RecoveryActivitySerializer
)

logger = logging.getLogger(__name__)


class ServiceInvoiceViewSet(TenantModelViewSet):
    queryset = ServiceInvoice.objects.all()
    serializer_class = ServiceInvoiceSerializer
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    required_module = 'billing'
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager', 'staff']
    required_read_permissions = ['billing.read', 'finance.read', 'security_finance.read', 'operations.read']
    required_write_permissions = ['billing.write', 'finance.write', 'security_finance.write']

    def get_queryset(self):
        qs = super().get_queryset()
        crm_entity_id = self.request.query_params.get('crm_entity')
        if crm_entity_id:
            qs = qs.filter(crm_entity_id=crm_entity_id)
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)
        return qs

    @action(detail=False, methods=['post'], url_path='generate')
    def generate(self, request):
        """
        POST /api/billing/service-invoices/generate/

        Body:
            service_contract_id: UUID
            period_start: date (YYYY-MM-DD)
            period_end: date (YYYY-MM-DD)
            tax_code_id: UUID (optional)
        """
        from billing.services.service_billing import generate_service_invoice, BillingError
        company_id = self._get_company_id(request)

        service_contract_id = request.data.get('service_contract_id')
        period_start = request.data.get('period_start')
        period_end = request.data.get('period_end')
        tax_code_id = request.data.get('tax_code_id')

        if not all([service_contract_id, period_start, period_end]):
            return Response(
                {'error': 'service_contract_id, period_start, and period_end are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            result = generate_service_invoice(
                company_id=company_id,
                service_contract_id=service_contract_id,
                period_start=period_start,
                period_end=period_end,
                tax_code_id=tax_code_id
            )
            http_status = status.HTTP_201_CREATED if result['created'] else status.HTTP_200_OK
            return Response(result, status=http_status)
        except BillingError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.exception(f"[BILLING] Unexpected error in generate: {e}")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'], url_path='post')
    def post_invoice(self, request, pk=None):
        """
        POST /api/billing/service-invoices/{id}/post/
        """
        from billing.services.service_billing import post_service_invoice, BillingError
        company_id = self._get_company_id(request)

        try:
            result = post_service_invoice(
                company_id=company_id,
                invoice_id=pk,
                user=request.user
            )
            http_status = status.HTTP_200_OK if result['posted'] else status.HTTP_200_OK
            return Response(result, status=http_status)
        except BillingError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.exception(f"[BILLING] Unexpected error in post_invoice: {e}")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel_invoice(self, request, pk=None):
        """
        POST /api/billing/service-invoices/{id}/cancel/
        """
        from billing.services.service_billing import cancel_service_invoice, BillingError
        company_id = self._get_company_id(request)

        try:
            result = cancel_service_invoice(
                company_id=company_id,
                invoice_id=pk,
                user=request.user
            )
            http_status = status.HTTP_200_OK
            return Response(result, status=http_status)
        except BillingError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.exception(f"[BILLING] Unexpected error in cancel: {e}")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'], url_path='record-payment')
    def record_payment(self, request, pk=None):
        """
        POST /api/billing/service-invoices/{id}/record-payment/
        """
        from billing.services.service_billing import record_invoice_payment, BillingError
        company_id = self._get_company_id(request)
        
        amount = request.data.get('amount')
        payment_date = request.data.get('payment_date')
        payment_method = request.data.get('payment_method', '')
        reference = request.data.get('reference', '')
        bank_account_id = request.data.get('bank_account_id', None)

        if not all([amount, payment_date]):
            return Response(
                {'error': 'amount and payment_date are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            result = record_invoice_payment(
                invoice_id=pk,
                amount=amount,
                payment_date=payment_date,
                payment_method=payment_method,
                reference=reference,
                company_id=company_id,
                bank_account_id=bank_account_id,
                user=request.user
            )
            http_status = status.HTTP_201_CREATED if result.get('recorded') else status.HTTP_200_OK
            return Response(result, status=http_status)
        except BillingError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.exception(f"[BILLING] Unexpected error in record_payment: {e}")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _get_company_id(self, request):
        from erp_core.middleware import get_current_company
        from rest_framework.exceptions import ValidationError
        company_id = (
            get_current_company()
            or request.META.get('HTTP_X_COMPANY_ID')
            or getattr(request.user, 'company_id', None)
        )
        if not company_id:
            raise ValidationError({'detail': 'Company context is required.'})
        return company_id


class ServiceInvoiceLineViewSet(TenantModelViewSet):
    queryset = ServiceInvoiceLine.objects.all()
    serializer_class = ServiceInvoiceLineSerializer
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    required_module = 'billing'
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager', 'staff']
    required_read_permissions = ['billing.read', 'finance.read', 'security_finance.read', 'operations.read']
    required_write_permissions = ['billing.write', 'finance.write', 'security_finance.write']


class ExtraDutyPayrollBridgeViewSet(TenantModelViewSet):
    queryset = ExtraDutyPayrollBridge.objects.all()
    serializer_class = ExtraDutyPayrollBridgeSerializer
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    required_module = 'billing'
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager', 'staff']
    required_read_permissions = ['billing.read', 'finance.read', 'security_finance.read', 'operations.read']
    required_write_permissions = ['billing.write', 'finance.write', 'security_finance.write']


class BillingAccountingConfigurationViewSet(TenantModelViewSet):
    queryset = BillingAccountingConfiguration.objects.all()
    serializer_class = BillingAccountingConfigurationSerializer
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    required_module = 'billing'
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager', 'staff']
    required_read_permissions = ['billing.read', 'finance.read', 'security_finance.read', 'operations.read']
    required_write_permissions = ['billing.write', 'finance.write', 'security_finance.write']


# ============================================================================
# OPERATIONS-SIDE EXTRA ACTIONS
# These live here but are exposed via operations URLs (mounted in operations/views.py)
# ============================================================================

def sync_attendance_action(request, duty_id):
    """
    POST /api/v1/operations/duty-assignments/{id}/sync-attendance/
    Called from operations views.
    """
    from operations.services.attendance_sync import sync_duty_assignment_attendance, AttendanceSyncError
    from erp_core.middleware import get_current_company
    company_id = (
        get_current_company()
        or request.META.get('HTTP_X_COMPANY_ID')
        or getattr(request.user, 'company_id', None)
    )
    try:
        result = sync_duty_assignment_attendance(duty_id, company_id)
        http_status = status.HTTP_201_CREATED if result['created'] else status.HTTP_200_OK
        return Response(result, status=http_status)
    except AttendanceSyncError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


def process_extra_duty_payroll_action(request, extra_duty_id):
    """
    POST /api/v1/operations/extra-duties/{id}/process-payroll/
    Called from operations views.
    """
    from operations.services.payroll_bridge import process_extra_duty_payroll, PayrollBridgeError
    from erp_core.middleware import get_current_company
    company_id = (
        get_current_company()
        or request.META.get('HTTP_X_COMPANY_ID')
        or getattr(request.user, 'company_id', None)
    )
    payroll_run_id = request.data.get('payroll_run_id')
    if not payroll_run_id:
        return Response(
            {'error': 'payroll_run_id is required.'},
            status=status.HTTP_400_BAD_REQUEST
        )
    try:
        result = process_extra_duty_payroll(extra_duty_id, payroll_run_id, company_id)
        http_status = status.HTTP_201_CREATED if result['created'] else status.HTTP_200_OK
        return Response(result, status=http_status)
    except PayrollBridgeError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


# ============================================================================
# PHASE S-4B VIEWSETS
# ============================================================================

from .models import (
    BillingPeriod, BillingSheet, BillingSheetLine, BillingAdjustment,
    ClientInvoice, ClientInvoiceLine, ClientInvoiceStatus
)
from .serializers import (
    BillingPeriodSerializer, BillingSheetSerializer, BillingSheetLineSerializer,
    BillingAdjustmentSerializer, ClientInvoiceSerializer, ClientInvoiceLineSerializer
)
from .services.billing_sheet_service import (
    build_billing_sheet_from_contract, add_billing_adjustment,
    submit_for_review, approve_billing_sheet, cancel_billing_sheet
)
from .services.invoice_generator_service import (
    generate_client_invoice_from_sheet, issue_client_invoice,
    send_client_invoice_email, render_invoice_context
)
from datetime import datetime


class BillingPeriodViewSet(TenantModelViewSet):
    queryset = BillingPeriod.objects.all()
    serializer_class = BillingPeriodSerializer
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    required_module = 'billing'
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager', 'staff']
    required_read_permissions = ['billing.read', 'finance.read', 'security_finance.read', 'operations.read']
    required_write_permissions = ['billing.write', 'finance.write', 'security_finance.write']


class BillingSheetViewSet(TenantModelViewSet):
    queryset = BillingSheet.objects.all()
    serializer_class = BillingSheetSerializer
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    required_module = 'billing'
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager', 'staff']
    required_read_permissions = ['billing.read', 'finance.read', 'security_finance.read', 'operations.read']
    required_write_permissions = ['billing.write', 'finance.write', 'security_finance.write']

    @action(detail=False, methods=['post'], url_path='build-from-contract')
    def build_from_contract(self, request):
        """
        POST /api/billing/billing-sheets/build-from-contract/
        Body: { contract_id, period_start, period_end, currency_id?, notes? }
        """
        from erp_core.middleware import get_current_company
        from companies.models import Company
        company_id = (
            get_current_company()
            or request.META.get('HTTP_X_COMPANY_ID')
            or getattr(request.user, 'company_id', None)
        )
        company = getattr(request.user, 'company', None)
        if not company and company_id:
            company = Company.objects.filter(id=company_id).first()

        contract_id = request.data.get('contract_id')
        period_start_str = request.data.get('period_start')
        period_end_str = request.data.get('period_end')
        currency_id = request.data.get('currency_id')
        notes = request.data.get('notes', '')

        if not all([contract_id, period_start_str, period_end_str]):
            return Response(
                {'error': 'contract_id, period_start, and period_end are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            period_start = datetime.strptime(str(period_start_str).strip(), '%Y-%m-%d').date()
            period_end = datetime.strptime(str(period_end_str).strip(), '%Y-%m-%d').date()
        except ValueError:
            return Response({'error': 'Invalid date format. Use YYYY-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            sheet = build_billing_sheet_from_contract(
                company=company,
                contract_id=contract_id,
                period_start=period_start,
                period_end=period_end,
                user=request.user,
                currency_id=currency_id,
                notes=notes
            )
            serializer = self.get_serializer(sheet)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except Exception as e:
            logger.exception(f"[BILLING_SHEET] Error building sheet: {e}")
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='add-adjustment')
    def add_adjustment(self, request, pk=None):
        """
        POST /api/billing/billing-sheets/{id}/add-adjustment/
        Body: { adjustment_type, reason, amount, site_id?, tax_rate? }
        """
        sheet = self.get_object()
        adj_type = request.data.get('adjustment_type')
        reason = request.data.get('reason')
        amount = request.data.get('amount')
        site_id = request.data.get('site_id')
        tax_rate = request.data.get('tax_rate')

        if not all([adj_type, reason, amount]):
            return Response({'error': 'adjustment_type, reason, and amount are required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            adj = add_billing_adjustment(
                billing_sheet=sheet,
                adjustment_type=adj_type,
                reason=reason,
                amount=amount,
                user=request.user,
                site_id=site_id,
                tax_rate=tax_rate
            )
            serializer = self.get_serializer(sheet)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='submit-for-review')
    def submit_review(self, request, pk=None):
        sheet = self.get_object()
        try:
            sheet = submit_for_review(sheet, user=request.user)
            return Response(self.get_serializer(sheet).data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='approve')
    def approve(self, request, pk=None):
        sheet = self.get_object()
        try:
            sheet = approve_billing_sheet(sheet, user=request.user)
            return Response(self.get_serializer(sheet).data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel(self, request, pk=None):
        sheet = self.get_object()
        reason = request.data.get('reason', '')
        try:
            sheet = cancel_billing_sheet(sheet, user=request.user, reason=reason)
            return Response(self.get_serializer(sheet).data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='generate-invoice')
    def generate_invoice(self, request, pk=None):
        sheet = self.get_object()
        invoice_date_str = request.data.get('invoice_date')
        due_date_str = request.data.get('due_date')
        payment_terms = request.data.get('payment_terms')

        invoice_date = None
        if invoice_date_str:
            try:
                invoice_date = datetime.strptime(str(invoice_date_str).strip(), '%Y-%m-%d').date()
            except ValueError:
                return Response({'error': 'Invalid invoice_date format. Use YYYY-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST)

        due_date = None
        if due_date_str:
            try:
                due_date = datetime.strptime(str(due_date_str).strip(), '%Y-%m-%d').date()
            except ValueError:
                return Response({'error': 'Invalid due_date format. Use YYYY-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            invoice = generate_client_invoice_from_sheet(
                billing_sheet=sheet,
                user=request.user,
                invoice_date=invoice_date,
                due_date=due_date,
                payment_terms=payment_terms
            )
            return Response(ClientInvoiceSerializer(invoice).data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class ClientInvoiceViewSet(TenantModelViewSet):
    queryset = ClientInvoice.objects.all()
    serializer_class = ClientInvoiceSerializer
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    required_module = 'billing'
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager', 'staff']
    required_read_permissions = ['billing.read', 'finance.read', 'security_finance.read', 'operations.read']
    required_write_permissions = ['billing.write', 'finance.write', 'security_finance.write']

    @staticmethod
    def _parse_billing_month(company, billing_month_str=None):
        import calendar
        from datetime import date
        from django.utils import timezone
        from operations.models import DailyDutyPay, TemporaryServiceRequest

        today = timezone.now().date()
        current_month = f"{today.year}-{today.month:02d}"
        if today.month == 1:
            previous_month = f"{today.year - 1}-12"
        else:
            previous_month = f"{today.year}-{today.month - 1:02d}"

        # Collect distinct available months from live operations, temporary services & invoices
        month_set = {current_month, previous_month}
        try:
            for d in DailyDutyPay.objects.filter(company=company, is_deleted=False).dates('duty_date', 'month', order='DESC')[:12]:
                month_set.add(f"{d.year}-{d.month:02d}")
            for dt in TemporaryServiceRequest.objects.filter(company=company, is_deleted=False).dates('start_datetime', 'month', order='DESC')[:12]:
                month_set.add(f"{dt.year}-{dt.month:02d}")
            for bm in ClientInvoice.objects.filter(company=company, is_deleted=False).values_list('billing_month', flat=True).distinct()[:12]:
                if bm and len(str(bm)) == 7:
                    month_set.add(str(bm))
        except Exception:
            pass
        available_months = sorted(month_set, reverse=True)

        chosen = (billing_month_str or '').strip()
        if not chosen or chosen.upper() == 'AUTO':
            # Prefer previous month if it has DutyPay/Temp data and current month has none yet, else current month
            prev_yr, prev_mo = map(int, previous_month.split('-'))
            curr_yr, curr_mo = map(int, current_month.split('-'))
            has_curr = DailyDutyPay.objects.filter(
                company=company, duty_date__year=curr_yr, duty_date__month=curr_mo, is_deleted=False
            ).exists()
            has_prev = DailyDutyPay.objects.filter(
                company=company, duty_date__year=prev_yr, duty_date__month=prev_mo, is_deleted=False
            ).exists() or TemporaryServiceRequest.objects.filter(
                company=company, start_datetime__year=prev_yr, start_datetime__month=prev_mo, is_deleted=False
            ).exists()
            chosen = previous_month if (has_prev and not has_curr) else current_month

        try:
            year, month = map(int, chosen.split('-'))
            days_in_month = calendar.monthrange(year, month)[1]
        except Exception:
            year, month = today.year, today.month
            days_in_month = calendar.monthrange(year, month)[1]
            chosen = f"{year}-{month:02d}"

        period_start = date(year, month, 1)
        period_end = date(year, month, days_in_month)
        return year, month, days_in_month, period_start, period_end, chosen, current_month, previous_month, available_months

    @staticmethod
    def _build_crm_billing_preview(company, billing_month_str=None):
        from decimal import Decimal
        from collections import defaultdict
        from django.db.models import Q
        from crm.models import CRMEntity
        from security_crm.models import SecurityProposal, ProposalServiceLine
        from operations.models import (
            OperationalSite, ServiceContract, ContractRate, SecurityPost,
            DailyDutyPay, DutyType, TemporaryServiceRequest
        )
        from operations.services.monthly_muster_service import MonthlyMusterService
        from hrm.models import AttendanceStatus

        (
            year, month, days_in_month, period_start, period_end,
            selected_month, current_month, previous_month, available_months
        ) = ClientInvoiceViewSet._parse_billing_month(company, billing_month_str)

        # Gather all CRM clients tied to sites, proposals, contracts, or temporary services
        sites = list(OperationalSite.objects.filter(
            company=company, is_active=True, is_deleted=False, crm_entity__isnull=False
        ).select_related('crm_entity').order_by('name'))

        proposals = list(SecurityProposal.objects.filter(
            company=company, is_deleted=False
        ).exclude(
            status__in=['REJECTED', 'CANCELLED']
        ).select_related('customer', 'contract', 'approved_version').prefetch_related('versions'))

        contracts = list(ServiceContract.objects.filter(
            company=company, is_deleted=False
        ).exclude(
            status__in=['TERMINATED', 'CANCELLED']
        ).select_related('crm_entity').prefetch_related('sites', 'rates', 'rates__designation'))

        temp_requests = list(TemporaryServiceRequest.objects.filter(
            company=company, is_deleted=False
        ).exclude(status='CANCELLED').filter(
            start_datetime__date__lte=period_end
        ).filter(
            Q(end_datetime__isnull=True, start_datetime__date__gte=period_start) |
            Q(end_datetime__date__gte=period_start)
        ).select_related('crm_entity', 'operational_site').order_by('start_datetime'))

        client_map = {}
        for s in sites:
            if s.crm_entity and not s.crm_entity.is_deleted and s.crm_entity.active:
                client_map[str(s.crm_entity_id)] = s.crm_entity
        for p in proposals:
            if p.customer and not p.customer.is_deleted and p.customer.active:
                client_map[str(p.customer_id)] = p.customer
        for c in contracts:
            if c.crm_entity and not c.crm_entity.is_deleted and c.crm_entity.active:
                client_map[str(c.crm_entity_id)] = c.crm_entity
        for t in temp_requests:
            if t.crm_entity and not t.crm_entity.is_deleted:
                client_map[str(t.crm_entity_id)] = t.crm_entity

        if not client_map:
            for c in CRMEntity.objects.filter(company=company, is_deleted=False, active=True, entity_type__in=['CUSTOMER', 'CLIENT', 'BOTH'])[:100]:
                client_map[str(c.id)] = c

        # Priority order for SecurityProposal
        status_rank = {
            'ACTIVE': 1, 'SIGNED': 2, 'SIGNING': 3, 'APPROVED': 4,
            'FINAL_PROPOSAL': 5, 'AWAITING_APPROVAL': 6, 'SENT': 7,
            'SITE_ASSESSMENT': 8, 'MEETING': 9, 'DRAFT': 10, 'ON_HOLD': 11,
        }
        proposals_by_client = defaultdict(list)
        for p in proposals:
            proposals_by_client[str(p.customer_id)].append(p)
        for cid in proposals_by_client:
            proposals_by_client[cid].sort(key=lambda p: (status_rank.get(p.status, 99), -p.created_at.timestamp()))

        # Map active proposal version per client (and version -> service_lines)
        active_version_ids = []
        primary_version_by_client = {}
        for cid, plist in proposals_by_client.items():
            for p in plist:
                ver = p.approved_version or p.versions.filter(is_deleted=False).order_by('-version_number').first()
                if ver:
                    active_version_ids.append(ver.id)
                    if cid not in primary_version_by_client:
                        primary_version_by_client[cid] = (p, ver)

        service_lines = list(ProposalServiceLine.objects.filter(
            company=company, is_deleted=False, proposal_version_id__in=active_version_ids
        ).exclude(location__is_deleted=True).select_related('service_type', 'location', 'proposal_version'))

        lines_by_client_loc = defaultdict(list)
        lines_by_client_unscoped = defaultdict(list)
        for sl in service_lines:
            if not getattr(sl, 'location_id', None) and (not getattr(sl, 'proposal_version', None) or not getattr(sl.proposal_version, 'proposal_id', None)):
                continue
            cid = str(sl.location.customer_id) if sl.location_id else str(sl.proposal_version.proposal.customer_id)
            if sl.location_id and sl.location.name:
                norm_name = ' '.join(sl.location.name.lower().split())
                lines_by_client_loc[(cid, norm_name)].append(sl)
            else:
                lines_by_client_unscoped[cid].append(sl)

        # Fetch muster grid once for exact Attendance-Delivered Fulfilled Shifts across all sites
        muster_by_site = {}
        try:
            muster = MonthlyMusterService.get_monthly_muster_grid(company, year, month)
            for sb in muster.get('sites', []):
                muster_by_site[str(sb.get('site_id'))] = sb
        except Exception:
            pass

        # Fallback: direct DailyDutyPay shift count & designation-level shifts per site
        duty_pays = list(DailyDutyPay.objects.filter(
            company=company, duty_date__gte=period_start, duty_date__lte=period_end, is_deleted=False
        ).select_related('site', 'post__required_designation', 'employee__designation'))
        dp_shifts_by_site = defaultdict(int)
        dp_shifts_by_site_desig = defaultdict(lambda: defaultdict(int))
        active_att_statuses = {
            AttendanceStatus.PRESENT, 'PRESENT', 'P',
            AttendanceStatus.OVERTIME, 'OVERTIME', 'O',
            getattr(AttendanceStatus, 'OVERTIME_DOZING', 'OVERTIME_DOZING'), 'OVERTIME_DOZING', 'OD',
            AttendanceStatus.WORKED_WEEKLY_OFF, 'WORKED_WEEKLY_OFF', 'WP', 'DOUBLE_SHIFT',
        }
        for dp in duty_pays:
            if not dp.site_id:
                continue
            st = str(dp.attendance_status or '').upper()
            if st in active_att_statuses or dp.duty_type == DutyType.OVERTIME:
                sid = str(dp.site_id)
                dp_shifts_by_site[sid] += 1
                desig_name = ''
                if dp.post and dp.post.required_designation:
                    desig_name = dp.post.required_designation.name.strip().lower()
                elif dp.employee and dp.employee.designation:
                    desig_name = dp.employee.designation.name.strip().lower()
                dp_shifts_by_site_desig[sid][desig_name] += 1

        # Existing non-cancelled ClientInvoices for this month
        existing_invs = list(ClientInvoice.objects.filter(
            company=company, billing_month=selected_month, is_deleted=False
        ).exclude(status=ClientInvoiceStatus.CANCELLED).prefetch_related('lines'))
        inv_by_site = {}
        inv_by_tsr = {}
        for inv in existing_invs:
            for ln in inv.lines.filter(is_deleted=False):
                if ln.site_id and str(ln.site_id) not in inv_by_site:
                    inv_by_site[str(ln.site_id)] = inv
            notes_txt = inv.notes or ''
            import re
            for m in re.finditer(r'\[TSR:([^\]]+)\]', notes_txt):
                inv_by_tsr[m.group(1)] = inv
            for m in re.finditer(r'\[SITE:([^\]]+)\]', notes_txt):
                if m.group(1) not in inv_by_site:
                    inv_by_site[m.group(1)] = inv

        posts_by_site = defaultdict(list)
        for p in SecurityPost.objects.filter(company=company, is_active=True, is_deleted=False).select_related('required_designation'):
            posts_by_site[str(p.site_id)].append(p)

        permanent_items = []
        for site in sites:
            cid = str(site.crm_entity_id)
            sid = str(site.id)
            loc_key = (cid, ' '.join((site.name or '').lower().split()))
            site_lines = lines_by_client_loc.get(loc_key, [])

            # Find matching contract for site
            contract = None
            for c in contracts:
                if str(c.crm_entity_id) == cid and (c.sites.filter(id=site.id).exists() or not c.sites.exists()):
                    contract = c
                    break

            prop_pair = primary_version_by_client.get(cid)
            prop_ver = prop_pair[1] if prop_pair else None
            if not site_lines and not lines_by_client_loc and prop_ver:
                site_lines = lines_by_client_unscoped.get(cid, [])
            elif not site_lines and cid in lines_by_client_unscoped and len([s2 for s2 in sites if str(s2.crm_entity_id) == cid]) == 1:
                site_lines = lines_by_client_unscoped.get(cid, [])

            if site_lines:
                prop_ver = site_lines[0].proposal_version

            # Calculate Option 1: CRM Contract Rate
            contract_monthly_rate = Decimal('0.00')
            total_contract_heads = 0
            line_breakdown = []
            for sl in site_lines:
                if str(sl.billing_unit or 'MONTHLY').upper() in ['MONTHLY', 'MONTH']:
                    amt = (Decimal(str(sl.quantity or 0)) * Decimal(str(sl.client_rate or 0))).quantize(Decimal('0.01'))
                    contract_monthly_rate += amt
                    total_contract_heads += int(sl.quantity or 0)
                    daily_client_rate = (Decimal(str(sl.client_rate or 0)) / Decimal(str(days_in_month))).quantize(Decimal('0.01')) if days_in_month > 0 else Decimal('0.00')
                    line_breakdown.append({
                        'service_type': sl.service_type.name if sl.service_type else 'Security Personnel',
                        'quantity': int(sl.quantity or 0),
                        'client_rate': float(sl.client_rate or 0),
                        'daily_client_rate': float(daily_client_rate),
                        'monthly_subtotal': float(amt),
                    })

            # Fallback to ServiceContract -> ContractRate if no ProposalServiceLine
            if contract_monthly_rate <= Decimal('0.00') and contract:
                rates_map = {str(r.designation_id): Decimal(str(r.billing_rate or 0)) for r in contract.rates.filter(is_deleted=False)}
                for p in posts_by_site.get(sid, []):
                    b_rate = rates_map.get(str(p.required_designation_id), Decimal('0.00'))
                    if b_rate > 0 and p.required_headcount > 0:
                        amt = (b_rate * Decimal(str(p.required_headcount))).quantize(Decimal('0.01'))
                        contract_monthly_rate += amt
                        total_contract_heads += int(p.required_headcount)
                        daily_client_rate = (b_rate / Decimal(str(days_in_month))).quantize(Decimal('0.01')) if days_in_month > 0 else Decimal('0.00')
                        line_breakdown.append({
                            'service_type': p.required_designation.name if p.required_designation else p.post_name,
                            'quantity': int(p.required_headcount),
                            'client_rate': float(b_rate),
                            'daily_client_rate': float(daily_client_rate),
                            'monthly_subtotal': float(amt),
                        })

            # Fulfilled shifts from Monthly Muster (fallback to DailyDutyPay count)
            muster_sb = muster_by_site.get(sid)
            if muster_sb and isinstance(muster_sb.get('daily_totals'), dict):
                fulfilled_shifts = sum(int(v or 0) for v in muster_sb['daily_totals'].values())
            else:
                fulfilled_shifts = dp_shifts_by_site.get(sid, 0)

            # Calculate Option 2: Attendance-Delivered Client Rate (NEVER guard salary)
            if total_contract_heads > 0 and contract_monthly_rate > 0 and days_in_month > 0:
                avg_daily_bill_rate = (contract_monthly_rate / Decimal(str(total_contract_heads)) / Decimal(str(days_in_month))).quantize(Decimal('0.01'))
            else:
                avg_daily_bill_rate = Decimal('0.00')

            # Try designation-accurate shift total if line_breakdown + DailyDutyPay designation counts exist
            attendance_amount = Decimal('0.00')
            site_desig_shifts = dp_shifts_by_site_desig.get(sid, {})
            if line_breakdown and sum(site_desig_shifts.values()) == fulfilled_shifts and fulfilled_shifts > 0 and len(line_breakdown) > 1:
                unmatched_shifts = fulfilled_shifts
                for lb in line_breakdown:
                    st_lower = lb['service_type'].lower()
                    matched_cnt = 0
                    for d_name, cnt in site_desig_shifts.items():
                        if d_name and (d_name in st_lower or st_lower in d_name):
                            matched_cnt += cnt
                    if matched_cnt > 0:
                        attendance_amount += (Decimal(str(lb['daily_client_rate'])) * Decimal(str(matched_cnt))).quantize(Decimal('0.01'))
                        unmatched_shifts -= matched_cnt
                if unmatched_shifts > 0:
                    attendance_amount += (avg_daily_bill_rate * Decimal(str(unmatched_shifts))).quantize(Decimal('0.01'))
            else:
                attendance_amount = (avg_daily_bill_rate * Decimal(str(fulfilled_shifts))).quantize(Decimal('0.01'))

            if fulfilled_shifts > 0 and avg_daily_bill_rate > 0:
                effective_daily_bill_rate = (attendance_amount / Decimal(str(fulfilled_shifts))).quantize(Decimal('0.01'))
            else:
                effective_daily_bill_rate = avg_daily_bill_rate

            tax_rate = Decimal(str(getattr(prop_ver, 'tax_rate', 0) or 0))
            payment_terms = getattr(prop_ver, 'payment_terms', None) or 'NET_30'
            existing_inv = inv_by_site.get(sid)

            permanent_items.append({
                'client_id': cid,
                'client_name': site.crm_entity.name,
                'site_id': sid,
                'site_name': site.name,
                'contract_id': str(contract.id) if contract else None,
                'contract_code': contract.contract_code if contract else (prop_pair[0].proposal_number if prop_pair else 'CRM-CONTRACT'),
                'contract_heads': total_contract_heads,
                'contract_monthly_rate': float(contract_monthly_rate),
                'fulfilled_shifts': fulfilled_shifts,
                'guard_daily_bill_rate': float(effective_daily_bill_rate),
                'attendance_monthly_amount': float(attendance_amount),
                'tax_rate': float(tax_rate),
                'payment_terms': payment_terms,
                'line_breakdown': line_breakdown,
                'existing_invoice_id': str(existing_inv.id) if existing_inv else None,
                'existing_invoice_number': existing_inv.invoice_number if existing_inv else None,
                'existing_invoice_status': existing_inv.status if existing_inv else None,
            })

        temporary_items = []
        for t in temp_requests:
            tid = str(t.id)
            existing_inv = inv_by_tsr.get(tid)
            raw_dt = t.start_datetime.date().isoformat() if t.start_datetime else selected_month
            sub_amt = Decimal(str(t.total_manpower_cost or 0)) + Decimal(str(t.total_equipment_cost or 0))
            if sub_amt <= 0 and Decimal(str(t.grand_total or 0)) > 0:
                sub_amt = Decimal(str(t.grand_total or 0)) - Decimal(str(t.tax_amount or 0))
            temporary_items.append({
                'temporary_service_id': tid,
                'client_id': str(t.crm_entity_id),
                'client_name': t.crm_entity.name if t.crm_entity else 'Unknown Client',
                'title': t.title,
                'reference_number': t.reference_number,
                'venue': t.site_name or (t.operational_site.name if t.operational_site else 'Temporary Event Venue'),
                'site_id': str(t.operational_site_id) if t.operational_site_id else None,
                'date_str': raw_dt,
                'status': t.status,
                'billing_type': t.billing_type,
                'subtotal': float(sub_amt),
                'tax_amount': float(t.tax_amount or 0),
                'amount': float(t.grand_total or sub_amt),
                'existing_invoice_id': str(existing_inv.id) if existing_inv else None,
                'existing_invoice_number': existing_inv.invoice_number if existing_inv else None,
                'existing_invoice_status': existing_inv.status if existing_inv else None,
            })

        clients_list = sorted(
            [{'id': str(c.id), 'name': c.name, 'email': getattr(c, 'email', '') or '', 'phone': getattr(c, 'phone', '') or ''} for c in client_map.values()],
            key=lambda x: x['name'].lower()
        )

        unbilled_perm = [p for p in permanent_items if not p['existing_invoice_id'] and (p['contract_monthly_rate'] > 0 or p['fulfilled_shifts'] > 0)]
        unbilled_temp = [t for t in temporary_items if not t['existing_invoice_id'] and t['status'] in ['APPROVED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'] and t['amount'] > 0]

        return {
            'billing_month': selected_month,
            'current_month': current_month,
            'previous_month': previous_month,
            'available_months': available_months,
            'days_in_month': days_in_month,
            'clients': clients_list,
            'permanent_services': permanent_items,
            'temporary_services': temporary_items,
            'summary': {
                'total_clients': len(clients_list),
                'total_locations': len(permanent_items),
                'total_temp_services': len(temporary_items),
                'unbilled_locations_count': len(unbilled_perm),
                'unbilled_temp_count': len(unbilled_temp),
                'total_crm_contract_value': sum(p['contract_monthly_rate'] for p in permanent_items),
                'total_attendance_value': sum(p['attendance_monthly_amount'] for p in permanent_items),
                'total_temp_value': sum(t['amount'] for t in temporary_items),
            }
        }

    @action(detail=True, methods=['post'], url_path='issue')
    def issue(self, request, pk=None):
        invoice = self.get_object()
        try:
            invoice = issue_client_invoice(invoice, user=request.user)
            return Response(self.get_serializer(invoice).data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], url_path='crm-billing-preview')
    def crm_billing_preview(self, request):
        """
        GET /api/billing/client-invoices/crm-billing-preview/?month=YYYY-MM
        Returns live CRM contract rates, Attendance-Delivered rates, Temporary Services,
        and invoicing status per client location for the billing month.
        """
        from companies.models import Company
        try:
            company_id = self._get_company_id(request)
            company = Company.objects.get(id=company_id)
            billing_month = request.query_params.get('month') or request.query_params.get('billing_month')
            data = self._build_crm_billing_preview(company, billing_month)
            return Response(data, status=status.HTTP_200_OK)
        except Exception as e:
            logger.exception("Error generating CRM billing preview: %s", e)
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='auto-sync-month')
    def auto_sync_month(self, request):
        """
        POST /api/billing/client-invoices/auto-sync-month/
        Idempotently drafts ClientInvoices from live CRM Proposals/Contracts,
        Operations Attendance, and Temporary Services for the given month(s)
        so Finance can review, switch rate mode (CRM vs Attendance), and Approve & Issue.
        """
        from datetime import date, timedelta
        from decimal import Decimal
        from django.db import transaction
        from django.utils import timezone
        from companies.models import Company
        from crm.models import CRMEntity
        from operations.models import OperationalSite, ServiceContract
        from finance.models import SecurityFinanceConfiguration
        from finance.services.period_service import ensure_open_period_and_foundation

        try:
            company_id = self._get_company_id(request)
            company = Company.objects.get(id=company_id)
            ensure_open_period_and_foundation(company, timezone.now().date())
        except Exception as e:
            logger.exception("Auto-sync company/period resolution failed: %s", e)
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        billing_month = request.data.get('billing_month')
        months_list = request.data.get('months')
        calc_mode = str(request.data.get('calculation_mode', 'CONTRACT_RATE')).upper()
        initial_status = str(request.data.get('initial_status', 'DRAFT')).upper()
        if initial_status not in [ClientInvoiceStatus.DRAFT, ClientInvoiceStatus.ISSUED]:
            initial_status = ClientInvoiceStatus.DRAFT

        _, _, _, _, _, _, current_month, previous_month, _ = self._parse_billing_month(company, billing_month)
        if months_list and isinstance(months_list, list):
            months_to_sync = [str(m) for m in months_list if m]
        elif billing_month:
            months_to_sync = [str(billing_month)]
        else:
            months_to_sync = [previous_month, current_month]

        fin_cfg = SecurityFinanceConfiguration.objects.filter(company=company, is_active=True).first()
        currency = fin_cfg.default_currency if fin_cfg else None
        inv_date = timezone.now().date()
        due_date = inv_date + timedelta(days=30)

        created_invoices = []
        skipped_count = 0

        try:
          with transaction.atomic():
            for bm in months_to_sync:
                preview = self._build_crm_billing_preview(company, bm)
                yr, mo = map(int, preview['billing_month'].split('-'))
                p_start = date(yr, mo, 1)
                import calendar
                p_end = date(yr, mo, calendar.monthrange(yr, mo)[1])

                # 1. Permanent locations
                for item in preview['permanent_services']:
                    if item.get('existing_invoice_id'):
                        skipped_count += 1
                        continue
                    crm_val = Decimal(str(item.get('contract_monthly_rate') or 0))
                    att_val = Decimal(str(item.get('attendance_monthly_amount') or 0))
                    if crm_val <= 0 and att_val <= 0 and (item.get('fulfilled_shifts') or 0) <= 0:
                        continue

                    use_mode = calc_mode
                    if use_mode == 'ATTENDANCE_RATE' and att_val > 0:
                        subtotal = att_val.quantize(Decimal('0.01'))
                    elif use_mode == 'CONTRACT_RATE' and crm_val > 0:
                        subtotal = crm_val.quantize(Decimal('0.01'))
                    elif crm_val > 0:
                        use_mode = 'CONTRACT_RATE'
                        subtotal = crm_val.quantize(Decimal('0.01'))
                    else:
                        use_mode = 'ATTENDANCE_RATE'
                        subtotal = att_val.quantize(Decimal('0.01'))

                    if subtotal <= 0:
                        continue

                    tax_rate = Decimal(str(item.get('tax_rate') or 0))
                    tax_amt = (subtotal * (tax_rate / Decimal('100.00'))).quantize(Decimal('0.01'))
                    grand_total = subtotal + tax_amt
                    client = CRMEntity.objects.filter(id=item['client_id'], company=company).first()
                    site_obj = OperationalSite.objects.filter(id=item['site_id'], company=company).first()
                    contract_obj = ServiceContract.objects.filter(id=item['contract_id'], company=company).first() if item.get('contract_id') else None
                    if not client or not site_obj:
                        continue

                    mode_tag = f"[MODE:{use_mode}] [SITE:{site_obj.id}]"
                    inv = ClientInvoice.objects.create(
                        company=company,
                        invoice_number=ClientInvoice.generate_next_invoice_number(company),
                        client=client,
                        contract=contract_obj,
                        billing_month=preview['billing_month'],
                        period_start=p_start,
                        period_end=p_end,
                        invoice_date=inv_date,
                        due_date=due_date,
                        currency=currency,
                        payment_terms=item.get('payment_terms') or 'NET_30',
                        subtotal=subtotal,
                        tax_amount=tax_amt,
                        grand_total=grand_total,
                        paid_amount=Decimal('0.00'),
                        status=initial_status,
                        issued_at=timezone.now() if initial_status == ClientInvoiceStatus.ISSUED else None,
                        issued_by=request.user if initial_status == ClientInvoiceStatus.ISSUED else None,
                        notes=f"Security Services - {site_obj.name} ({preview['billing_month']}) {mode_tag}"
                    )

                    if use_mode == 'CONTRACT_RATE' and item.get('line_breakdown'):
                        for lb in item['line_breakdown']:
                            l_sub = Decimal(str(lb['monthly_subtotal'])).quantize(Decimal('0.01'))
                            l_tax = (l_sub * (tax_rate / Decimal('100.00'))).quantize(Decimal('0.01'))
                            ClientInvoiceLine.objects.create(
                                company=company,
                                invoice=inv,
                                line_type='REGULAR_SERVICE',
                                description=f"{lb['service_type']} @ {site_obj.name} (CRM Rate - {preview['billing_month']})",
                                site=site_obj,
                                quantity=Decimal(str(lb['quantity'] or 1)),
                                unit_rate=Decimal(str(lb['client_rate'] or 0)),
                                line_subtotal=l_sub,
                                tax_rate=tax_rate,
                                tax_amount=l_tax,
                                total_amount=l_sub + l_tax
                            )
                    else:
                        shifts = Decimal(str(item.get('fulfilled_shifts') or 1))
                        d_rate = Decimal(str(item.get('guard_daily_bill_rate') or 0))
                        desc_lbl = (
                            f"Attendance-Delivered Security @ {site_obj.name} ({int(shifts)} Shifts x Rs {d_rate:,.2f}/shift)"
                            if use_mode == 'ATTENDANCE_RATE'
                            else f"CRM Retainer Security @ {site_obj.name} ({preview['billing_month']})"
                        )
                        ClientInvoiceLine.objects.create(
                            company=company,
                            invoice=inv,
                            line_type='REGULAR_SERVICE',
                            description=desc_lbl,
                            site=site_obj,
                            quantity=shifts if use_mode == 'ATTENDANCE_RATE' else Decimal('1.00'),
                            unit_rate=d_rate if use_mode == 'ATTENDANCE_RATE' else subtotal,
                            line_subtotal=subtotal,
                            tax_rate=tax_rate,
                            tax_amount=tax_amt,
                            total_amount=grand_total
                        )
                    created_invoices.append(inv)

                # 2. Temporary Services
                for t in preview['temporary_services']:
                    if t.get('existing_invoice_id'):
                        skipped_count += 1
                        continue
                    if t.get('status') not in ['APPROVED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED']:
                        continue
                    t_sub = Decimal(str(t.get('subtotal') or 0)).quantize(Decimal('0.01'))
                    t_tax = Decimal(str(t.get('tax_amount') or 0)).quantize(Decimal('0.01'))
                    t_total = Decimal(str(t.get('amount') or 0)).quantize(Decimal('0.01'))
                    if t_total <= 0:
                        continue
                    if t_sub <= 0:
                        t_sub = t_total - t_tax
                    client = CRMEntity.objects.filter(id=t['client_id'], company=company).first()
                    if not client:
                        continue
                    site_obj = OperationalSite.objects.filter(id=t['site_id'], company=company).first() if t.get('site_id') else None

                    inv = ClientInvoice.objects.create(
                        company=company,
                        invoice_number=ClientInvoice.generate_next_invoice_number(company),
                        client=client,
                        billing_month=preview['billing_month'],
                        period_start=p_start,
                        period_end=p_end,
                        invoice_date=inv_date,
                        due_date=due_date,
                        currency=currency,
                        payment_terms='NET_15',
                        subtotal=t_sub,
                        tax_amount=t_tax,
                        grand_total=t_total,
                        paid_amount=Decimal('0.00'),
                        status=initial_status,
                        issued_at=timezone.now() if initial_status == ClientInvoiceStatus.ISSUED else None,
                        issued_by=request.user if initial_status == ClientInvoiceStatus.ISSUED else None,
                        notes=f"Temporary Event Service: {t['title']} ({t['venue']}) [TSR:{t['temporary_service_id']}]"
                    )
                    ClientInvoiceLine.objects.create(
                        company=company,
                        invoice=inv,
                        line_type='TEMPORARY_SERVICE',
                        description=f"Temporary Security: {t['title']} @ {t['venue']} ({t['date_str']})",
                        site=site_obj,
                        quantity=Decimal('1.00'),
                        unit_rate=t_sub,
                        line_subtotal=t_sub,
                        tax_rate=Decimal('0.00'),
                        tax_amount=t_tax,
                        total_amount=t_total
                    )
                    created_invoices.append(inv)

          return Response({
              'success': True,
              'created_count': len(created_invoices),
              'skipped_count': skipped_count,
              'months_synced': months_to_sync,
              'invoices': ClientInvoiceSerializer(created_invoices, many=True).data
          }, status=status.HTTP_200_OK)
        except Exception as e:
          logger.exception("Error inside auto_sync_month: %s", e)
          return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='switch-calculation-mode')
    def switch_calculation_mode(self, request, pk=None):
        """
        POST /api/billing/client-invoices/{id}/switch-calculation-mode/
        Switches a DRAFT invoice between CONTRACT_RATE (CRM Rate) and ATTENDANCE_RATE
        (Fulfilled Attendance Shifts x Client Daily Billing Rate), recalculating lines live.
        """
        import re
        from decimal import Decimal
        from django.db import transaction

        invoice = self.get_object()
        if invoice.status != ClientInvoiceStatus.DRAFT:
            return Response(
                {'error': f'Calculation mode can only be switched on DRAFT invoices (current status: {invoice.status}).'},
                status=status.HTTP_400_BAD_REQUEST
            )

        calc_mode = str(request.data.get('calculation_mode', 'CONTRACT_RATE')).upper()
        if calc_mode not in ['CONTRACT_RATE', 'ATTENDANCE_RATE']:
            return Response({'error': 'Invalid calculation_mode.'}, status=status.HTTP_400_BAD_REQUEST)

        # Find associated site from lines or notes tag
        site_id = None
        first_line = invoice.lines.filter(is_deleted=False, site__isnull=False).first()
        if first_line and first_line.site_id:
            site_id = str(first_line.site_id)
        else:
            m = re.search(r'\[SITE:([^\]]+)\]', invoice.notes or '')
            if m:
                site_id = m.group(1)

        if not site_id:
            return Response({'error': 'Only location-based security invoices support switching between CRM Contract Rate and Attendance Rate.'}, status=status.HTTP_400_BAD_REQUEST)

        preview = self._build_crm_billing_preview(invoice.company, invoice.billing_month)
        matched = next((p for p in preview['permanent_services'] if p['site_id'] == site_id), None)
        if not matched:
            return Response({'error': 'Site commercial details could not be found in CRM/Operations.'}, status=status.HTTP_404_NOT_FOUND)

        tax_rate = Decimal(str(request.data.get('tax_rate', matched.get('tax_rate') or 0)))

        with transaction.atomic():
            invoice.lines.filter(is_deleted=False).delete()

            if calc_mode == 'ATTENDANCE_RATE':
                shifts = Decimal(str(request.data.get('fulfilled_shifts', matched['fulfilled_shifts'] or 0)))
                daily_rate = Decimal(str(request.data.get('guard_daily_bill_rate', matched['guard_daily_bill_rate'] or 0)))
                if 'fulfilled_shifts' not in request.data and 'guard_daily_bill_rate' not in request.data and matched.get('attendance_monthly_amount'):
                    subtotal = Decimal(str(matched['attendance_monthly_amount'])).quantize(Decimal('0.01'))
                else:
                    subtotal = (shifts * daily_rate).quantize(Decimal('0.01'))
                tax_amt = (subtotal * (tax_rate / Decimal('100.00'))).quantize(Decimal('0.01'))
                grand_total = subtotal + tax_amt
                ClientInvoiceLine.objects.create(
                    company=invoice.company,
                    invoice=invoice,
                    line_type='REGULAR_SERVICE',
                    description=f"Attendance-Delivered Security @ {matched['site_name']} ({int(shifts)} Shifts x Rs {daily_rate:,.2f}/shift)",
                    site_id=site_id,
                    quantity=shifts if shifts > 0 else Decimal('1.00'),
                    unit_rate=daily_rate,
                    line_subtotal=subtotal,
                    tax_rate=tax_rate,
                    tax_amount=tax_amt,
                    total_amount=grand_total
                )
            else:
                subtotal = Decimal(str(matched['contract_monthly_rate'] or 0)).quantize(Decimal('0.01'))
                tax_amt = (subtotal * (tax_rate / Decimal('100.00'))).quantize(Decimal('0.01'))
                grand_total = subtotal + tax_amt
                if matched.get('line_breakdown'):
                    for lb in matched['line_breakdown']:
                        l_sub = Decimal(str(lb['monthly_subtotal'])).quantize(Decimal('0.01'))
                        l_tax = (l_sub * (tax_rate / Decimal('100.00'))).quantize(Decimal('0.01'))
                        ClientInvoiceLine.objects.create(
                            company=invoice.company,
                            invoice=invoice,
                            line_type='REGULAR_SERVICE',
                            description=f"{lb['service_type']} @ {matched['site_name']} (CRM Rate - {invoice.billing_month})",
                            site_id=site_id,
                            quantity=Decimal(str(lb['quantity'] or 1)),
                            unit_rate=Decimal(str(lb['client_rate'] or 0)),
                            line_subtotal=l_sub,
                            tax_rate=tax_rate,
                            tax_amount=l_tax,
                            total_amount=l_sub + l_tax
                        )
                else:
                    ClientInvoiceLine.objects.create(
                        company=invoice.company,
                        invoice=invoice,
                        line_type='REGULAR_SERVICE',
                        description=f"CRM Retainer Security @ {matched['site_name']} ({invoice.billing_month})",
                        site_id=site_id,
                        quantity=Decimal('1.00'),
                        unit_rate=subtotal,
                        line_subtotal=subtotal,
                        tax_rate=tax_rate,
                        tax_amount=tax_amt,
                        total_amount=grand_total
                    )

            clean_notes = re.sub(r'\[MODE:[^\]]+\]', '', invoice.notes or '').strip()
            invoice.notes = f"{clean_notes} [MODE:{calc_mode}]".strip()
            invoice.subtotal = subtotal
            invoice.tax_amount = tax_amt
            invoice.grand_total = grand_total
            invoice.save()

        invoice.refresh_from_db()
        return Response(self.get_serializer(invoice).data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='approve-all-drafts')
    def approve_all_drafts(self, request):
        """
        POST /api/billing/client-invoices/approve-all-drafts/
        Approves & Issues all matching DRAFT invoices into Receivables.
        """
        company_id = self._get_company_id(request)
        billing_month = request.data.get('billing_month')
        invoice_ids = request.data.get('invoice_ids')

        qs = ClientInvoice.objects.filter(company_id=company_id, status=ClientInvoiceStatus.DRAFT, is_deleted=False)
        if billing_month:
            qs = qs.filter(billing_month=billing_month)
        if invoice_ids and isinstance(invoice_ids, list):
            qs = qs.filter(id__in=invoice_ids)

        issued = []
        for inv in qs:
            try:
                issued.append(issue_client_invoice(inv, user=request.user))
            except Exception as exc:
                logger.warning("Failed issuing invoice %s: %s", inv.invoice_number, exc)

        return Response({
            'success': True,
            'issued_count': len(issued),
            'invoices': ClientInvoiceSerializer(issued, many=True).data
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='generate-from-crm')
    def generate_from_crm(self, request):
        """
        POST /api/billing/client-invoices/generate-from-crm/
        Generates official ClientInvoice(s) from CRM & Operations data.
        Supports both CONTRACT_RATE and ATTENDANCE_RATE calculations,
        for Permanent and Temporary services, either grouped per location
        or consolidated into a single invoice, as DRAFT or ISSUED.
        """
        from datetime import datetime, date, timedelta
        from decimal import Decimal
        from django.db import transaction
        from django.utils import timezone
        from crm.models import CRMEntity
        from operations.models import OperationalSite, ServiceContract
        from finance.models import SecurityFinanceConfiguration
        from finance.services.period_service import ensure_open_period_and_foundation

        company_id = self._get_company_id(request)
        client_id = request.data.get('client_id')
        billing_month = request.data.get('billing_month')  # 'YYYY-MM'
        invoice_date_str = request.data.get('invoice_date')
        due_date_str = request.data.get('due_date')
        payment_terms = request.data.get('payment_terms', 'NET_30')
        group_by = request.data.get('group_by', 'PER_LOCATION')  # 'PER_LOCATION' | 'CONSOLIDATED'
        tax_rate = Decimal(str(request.data.get('tax_rate') or '0.00'))
        services = request.data.get('services', [])
        initial_status = str(request.data.get('initial_status', ClientInvoiceStatus.ISSUED)).upper()
        if initial_status not in [ClientInvoiceStatus.DRAFT, ClientInvoiceStatus.ISSUED]:
            initial_status = ClientInvoiceStatus.ISSUED

        if not client_id:
            return Response({'error': 'client_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not billing_month:
            return Response({'error': 'billing_month is required (format YYYY-MM).'}, status=status.HTTP_400_BAD_REQUEST)
        if not services:
            return Response({'error': 'No services selected for invoicing.'}, status=status.HTTP_400_BAD_REQUEST)

        client = CRMEntity.objects.filter(id=client_id, company_id=company_id).first()
        if not client:
            return Response({'error': 'Client not found.'}, status=status.HTTP_404_NOT_FOUND)

        ensure_open_period_and_foundation(client.company, timezone.now().date())

        inv_date = datetime.strptime(str(invoice_date_str).strip(), '%Y-%m-%d').date() if invoice_date_str else timezone.now().date()
        due_date = datetime.strptime(str(due_date_str).strip(), '%Y-%m-%d').date() if due_date_str else (inv_date + timedelta(days=30))

        try:
            year, month = map(int, billing_month.split('-'))
            import calendar
            _, last_day = calendar.monthrange(year, month)
            period_start = date(year, month, 1)
            period_end = date(year, month, last_day)
        except Exception:
            period_start = inv_date
            period_end = inv_date

        fin_cfg = SecurityFinanceConfiguration.objects.filter(company_id=company_id, is_active=True).first()
        currency = fin_cfg.default_currency if fin_cfg else None

        def _parse_service_line(s):
            s_type = str(s.get('type', 'PERMANENT')).upper()
            calc_mode = str(s.get('calculation_mode', 'CONTRACT_RATE')).upper()
            s_id = s.get('site_id')
            s_obj = OperationalSite.objects.filter(id=s_id, company_id=company_id).first() if s_id else None
            site_label = s.get('site_name') or (s_obj.name if s_obj else 'General Site')

            if s_type == 'TEMPORARY':
                qty = Decimal('1.00')
                rate = Decimal(str(s.get('temporary_amount', s.get('unit_rate', 0))))
                line_sub = (qty * rate).quantize(Decimal('0.01'))
                line_type = 'TEMPORARY_SERVICE'
                t_title = s.get('temporary_title') or 'Temporary Security Service'
                desc = s.get('description') or f"Temporary Security: {t_title}"
                tag = f"[TSR:{s.get('temporary_service_id')}]" if s.get('temporary_service_id') else ''
            elif calc_mode == 'ATTENDANCE_RATE':
                qty = Decimal(str(s.get('fulfilled_shifts', s.get('quantity', 0))))
                rate = Decimal(str(s.get('guard_daily_bill_rate', s.get('unit_rate', 0))))
                line_sub = (qty * rate).quantize(Decimal('0.01'))
                line_type = 'REGULAR_SERVICE'
                desc = s.get('description') or f"Attendance-Delivered Security @ {site_label} ({int(qty)} Shifts x Rs {rate:,.2f})"
                tag = f"[MODE:ATTENDANCE_RATE] [SITE:{s_id}]" if s_id else "[MODE:ATTENDANCE_RATE]"
            else:
                # CONTRACT_RATE or direct quantity*unit_rate
                if 'contract_monthly_rate' in s:
                    qty = Decimal('1.00')
                    rate = Decimal(str(s.get('contract_monthly_rate', 0)))
                else:
                    qty = Decimal(str(s.get('quantity', 1)))
                    rate = Decimal(str(s.get('unit_rate', 0)))
                line_sub = (qty * rate).quantize(Decimal('0.01'))
                line_type = s.get('service_type', 'REGULAR_SERVICE')
                desc = s.get('description') or f"CRM Retainer Security @ {site_label} ({billing_month})"
                tag = f"[MODE:CONTRACT_RATE] [SITE:{s_id}]" if s_id else "[MODE:CONTRACT_RATE]"

            line_tax = (line_sub * (tax_rate / Decimal('100.0'))).quantize(Decimal('0.01'))
            return {
                'line_type': line_type,
                'description': desc,
                'site': s_obj,
                'quantity': qty,
                'unit_rate': rate,
                'line_subtotal': line_sub,
                'tax_rate': tax_rate,
                'tax_amount': line_tax,
                'total_amount': line_sub + line_tax,
                'tag': tag,
                'site_label': site_label,
                'contract_id': s.get('contract_id')
            }

        created_invoices = []

        with transaction.atomic():
            if group_by == 'PER_LOCATION':
                grouped_services = {}
                for svc in services:
                    key = str(svc.get('site_id') or svc.get('temporary_service_id') or svc.get('reference') or 'general')
                    grouped_services.setdefault(key, []).append(svc)

                for _grp_key, svc_list in grouped_services.items():
                    subtotal = Decimal('0.00')
                    lines_data = []
                    site_obj = None
                    tags = []
                    contract_id_hint = None

                    for s in svc_list:
                        parsed = _parse_service_line(s)
                        subtotal += parsed['line_subtotal']
                        if parsed['site'] and not site_obj:
                            site_obj = parsed['site']
                        if parsed['contract_id'] and not contract_id_hint:
                            contract_id_hint = parsed['contract_id']
                        if parsed['tag']:
                            tags.append(parsed['tag'])
                        lines_data.append(parsed)

                    tax_amount = (subtotal * (tax_rate / Decimal('100.0'))).quantize(Decimal('0.01'))
                    grand_total = subtotal + tax_amount
                    loc_name = site_obj.name if site_obj else (lines_data[0]['site_label'] if lines_data else 'General Services')
                    contract_obj = (
                        ServiceContract.objects.filter(id=contract_id_hint, company_id=company_id).first()
                        if contract_id_hint
                        else ServiceContract.objects.filter(crm_entity=client, company_id=company_id, status='ACTIVE').first()
                    )

                    inv = ClientInvoice.objects.create(
                        company_id=company_id,
                        invoice_number=ClientInvoice.generate_next_invoice_number(client.company),
                        client=client,
                        contract=contract_obj,
                        billing_month=billing_month,
                        period_start=period_start,
                        period_end=period_end,
                        invoice_date=inv_date,
                        due_date=due_date,
                        currency=currency,
                        payment_terms=payment_terms,
                        subtotal=subtotal,
                        tax_amount=tax_amount,
                        grand_total=grand_total,
                        paid_amount=Decimal('0.00'),
                        status=initial_status,
                        issued_at=timezone.now() if initial_status == ClientInvoiceStatus.ISSUED else None,
                        issued_by=request.user if initial_status == ClientInvoiceStatus.ISSUED else None,
                        notes=f"Services for {loc_name} ({billing_month}) {' '.join(tags)}".strip()
                    )

                    for ld in lines_data:
                        ClientInvoiceLine.objects.create(
                            company_id=company_id,
                            invoice=inv,
                            line_type=ld['line_type'],
                            description=ld['description'],
                            site=ld['site'],
                            quantity=ld['quantity'],
                            unit_rate=ld['unit_rate'],
                            line_subtotal=ld['line_subtotal'],
                            tax_rate=ld['tax_rate'],
                            tax_amount=ld['tax_amount'],
                            total_amount=ld['total_amount']
                        )

                    created_invoices.append(inv)

            else:
                subtotal = Decimal('0.00')
                lines_data = []
                tags = []
                contract_id_hint = None

                for s in services:
                    parsed = _parse_service_line(s)
                    subtotal += parsed['line_subtotal']
                    if parsed['contract_id'] and not contract_id_hint:
                        contract_id_hint = parsed['contract_id']
                    if parsed['tag']:
                        tags.append(parsed['tag'])
                    lines_data.append(parsed)

                tax_amount = (subtotal * (tax_rate / Decimal('100.0'))).quantize(Decimal('0.01'))
                grand_total = subtotal + tax_amount
                contract_obj = (
                    ServiceContract.objects.filter(id=contract_id_hint, company_id=company_id).first()
                    if contract_id_hint
                    else ServiceContract.objects.filter(crm_entity=client, company_id=company_id, status='ACTIVE').first()
                )

                inv = ClientInvoice.objects.create(
                    company_id=company_id,
                    invoice_number=ClientInvoice.generate_next_invoice_number(client.company),
                    client=client,
                    contract=contract_obj,
                    billing_month=billing_month,
                    period_start=period_start,
                    period_end=period_end,
                    invoice_date=inv_date,
                    due_date=due_date,
                    currency=currency,
                    payment_terms=payment_terms,
                    subtotal=subtotal,
                    tax_amount=tax_amount,
                    grand_total=grand_total,
                    paid_amount=Decimal('0.00'),
                    status=initial_status,
                    issued_at=timezone.now() if initial_status == ClientInvoiceStatus.ISSUED else None,
                    issued_by=request.user if initial_status == ClientInvoiceStatus.ISSUED else None,
                    notes=f"Consolidated Security Services ({billing_month}) {' '.join(tags)}".strip()
                )

                for ld in lines_data:
                    ClientInvoiceLine.objects.create(
                        company_id=company_id,
                        invoice=inv,
                        line_type=ld['line_type'],
                        description=ld['description'],
                        site=ld['site'],
                        quantity=ld['quantity'],
                        unit_rate=ld['unit_rate'],
                        line_subtotal=ld['line_subtotal'],
                        tax_rate=ld['tax_rate'],
                        tax_amount=ld['tax_amount'],
                        total_amount=ld['total_amount']
                    )

                created_invoices.append(inv)

        serialized = ClientInvoiceSerializer(created_invoices, many=True).data
        return Response({
            'success': True,
            'count': len(serialized),
            'invoices': serialized
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='record-payment')
    def record_payment(self, request, pk=None):
        """
        POST /api/billing/client-invoices/{id}/record-payment/
        Records client payment collection, updates invoice.paid_amount,
        marks status to PAID or PARTIALLY_PAID, updates BankAccount Treasury balance,
        and logs recovery activity.
        """
        from datetime import datetime
        from decimal import Decimal
        from django.db import transaction
        from django.utils import timezone
        from finance.models import BankAccount, TreasuryTransactionType
        from finance.services.treasury_service import TreasuryService
        from .models import ClientReceipt, ClientReceiptAllocation, ReceiptStatus, RecoveryStatus, RecoveryActivity

        invoice = self.get_object()
        amount_val = request.data.get('amount')
        payment_method = request.data.get('payment_method', 'BANK_TRANSFER')
        bank_account_id = request.data.get('bank_account_id')
        reference_number = request.data.get('reference_number', '')
        cheque_number = request.data.get('cheque_number', '')
        receipt_date_str = request.data.get('receipt_date')
        notes = request.data.get('notes', '')

        if not amount_val:
            return Response({'error': 'amount is required.'}, status=status.HTTP_400_BAD_REQUEST)

        amount = Decimal(str(amount_val)).quantize(Decimal('0.01'))
        if amount <= 0:
            return Response({'error': 'amount must be greater than zero.'}, status=status.HTTP_400_BAD_REQUEST)

        receipt_date = timezone.now().date()
        if receipt_date_str:
            try:
                receipt_date = datetime.strptime(str(receipt_date_str).strip(), '%Y-%m-%d').date()
            except ValueError:
                pass

        bank_account = None
        if bank_account_id:
            bank_account = BankAccount.objects.filter(id=bank_account_id, company_id=invoice.company_id).first()
        if not bank_account:
            bank_account = BankAccount.objects.filter(company_id=invoice.company_id, is_active=True, is_deleted=False).first()

        with transaction.atomic():
            receipt = ClientReceipt.objects.create(
                company=invoice.company,
                client=invoice.client,
                receipt_date=receipt_date,
                amount=amount,
                payment_method=payment_method,
                bank_account=bank_account,
                reference_number=reference_number,
                cheque_number=cheque_number,
                notes=notes or f"Recovery against invoice {invoice.invoice_number}",
                received_by=request.user,
                status=ReceiptStatus.POSTED,
                posted_at=timezone.now(),
                posted_by=request.user
            )

            ClientReceiptAllocation.objects.create(
                company=invoice.company,
                receipt=receipt,
                invoice=invoice,
                allocated_amount=amount
            )

            invoice.paid_amount = (invoice.paid_amount or Decimal('0.00')) + amount
            if invoice.paid_amount >= invoice.grand_total:
                invoice.status = ClientInvoiceStatus.PAID
                invoice.recovery_status = RecoveryStatus.RECOVERED
            else:
                invoice.status = ClientInvoiceStatus.PARTIALLY_PAID
                invoice.recovery_status = RecoveryStatus.PARTIALLY_RECOVERED
            invoice.save()

            if bank_account:
                TreasuryService.record_treasury_movement(
                    bank_account=bank_account,
                    transaction_type=TreasuryTransactionType.MONEY_IN,
                    money_in=amount,
                    money_out=Decimal('0.0000'),
                    reference=receipt.receipt_number or reference_number or invoice.invoice_number,
                    description=f"Client Recovery ({invoice.client.name}) - Invoice {invoice.invoice_number}",
                    transaction_date=receipt_date,
                    user=request.user,
                )

            RecoveryActivity.objects.create(
                company=invoice.company,
                client=invoice.client,
                invoice=invoice,
                activity_type='PAYMENT_COLLECTION',
                activity_date=receipt_date,
                notes=f"Collected PKR {amount:,.2f} via {payment_method}. Ref: {reference_number or cheque_number}",
                recovery_status_outcome=invoice.recovery_status,
                created_by=request.user
            )

        return Response(self.get_serializer(invoice).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='send-email')
    def send_email(self, request, pk=None):
        invoice = self.get_object()
        sender_id = request.data.get('sender_identity_id')
        to_email = request.data.get('to_email')
        subject = request.data.get('subject')
        body_html = request.data.get('body_html')

        sender = None
        if sender_id:
            from communications.models import SenderIdentity
            sender = SenderIdentity.objects.filter(id=sender_id, company=invoice.company).first()

        try:
            res = send_client_invoice_email(
                invoice=invoice,
                user=request.user,
                sender_identity=sender,
                to_email=to_email,
                subject=subject,
                body_html=body_html
            )
            return Response({'success': True, 'detail': 'Invoice email dispatched successfully.', 'outbound_email_id': res.id, 'status': res.status}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'], url_path='preview-context')
    def preview_context(self, request, pk=None):
        invoice = self.get_object()
        try:
            data = render_invoice_context(invoice)
            return Response(data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='send-reminder')
    def send_reminder(self, request, pk=None):
        invoice = self.get_object()
        sender_id = request.data.get('sender_identity_id')
        to_email = request.data.get('to_email')
        custom_notes = request.data.get('notes', '')

        sender = None
        if sender_id:
            from communications.models import SenderIdentity
            sender = SenderIdentity.objects.filter(id=sender_id, company=invoice.company).first()

        from billing.services.recovery_service import RecoveryService
        try:
            act = RecoveryService.send_payment_reminder_email(
                invoice=invoice,
                user=request.user,
                sender_identity=sender,
                to_email=to_email,
                custom_notes=custom_notes
            )
            return Response({'status': 'sent', 'activity_id': str(act.id)}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], url_path='ar-summary')
    def ar_summary(self, request):
        from erp_core.middleware import get_current_company
        from companies.models import Company
        company_id = self._get_company_id(request)
        company = Company.objects.get(id=company_id)

        from billing.services.ar_calculation_service import ARCalculationService
        try:
            summary = ARCalculationService.get_company_ar_summary(company)
            return Response(summary, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], url_path='aging-report')
    def aging_report(self, request):
        from companies.models import Company
        company_id = self._get_company_id(request)
        company = Company.objects.get(id=company_id)

        from billing.services.ar_calculation_service import ARCalculationService
        try:
            report = ARCalculationService.get_ar_aging_report(company)
            return Response(report, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], url_path='recovery-worklist')
    def recovery_worklist(self, request):
        from companies.models import Company
        company_id = self._get_company_id(request)
        company = Company.objects.get(id=company_id)

        from billing.services.recovery_service import RecoveryService
        try:
            worklist = RecoveryService.get_recovery_worklist(company)
            return Response(worklist, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], url_path='client-ar-summary')
    def client_ar_summary(self, request):
        from companies.models import Company
        from crm.models import CRMEntity
        company_id = self._get_company_id(request)
        company = Company.objects.get(id=company_id)

        client_id = request.query_params.get('client_id')
        if not client_id:
            return Response({'error': 'client_id query parameter is required.'}, status=status.HTTP_400_BAD_REQUEST)

        client = CRMEntity.objects.filter(id=client_id, company=company).first()
        if not client:
            return Response({'error': 'Client not found.'}, status=status.HTTP_404_NOT_FOUND)

        from billing.services.ar_calculation_service import ARCalculationService
        try:
            summary = ARCalculationService.get_client_ar_summary(client, company)
            return Response(summary, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class ClientReceiptViewSet(TenantModelViewSet):
    queryset = ClientReceipt.objects.all()
    serializer_class = ClientReceiptSerializer
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    required_module = 'billing'
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager', 'staff']
    required_read_permissions = ['billing.read', 'finance.read', 'security_finance.read', 'operations.read']
    required_write_permissions = ['billing.write', 'finance.write', 'security_finance.write']

    @action(detail=True, methods=['post'], url_path='allocate')
    def allocate(self, request, pk=None):
        receipt = self.get_object()
        allocations_data = request.data.get('allocations', [])
        from billing.services.client_receipt_service import ClientReceiptService
        try:
            receipt = ClientReceiptService.allocate_receipt_to_invoices(
                receipt=receipt,
                allocations_data=allocations_data,
                user=request.user
            )
            return Response(self.get_serializer(receipt).data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='post')
    def post_receipt(self, request, pk=None):
        receipt = self.get_object()
        from billing.services.client_receipt_service import ClientReceiptService
        try:
            receipt = ClientReceiptService.post_client_receipt(receipt=receipt, user=request.user)
            return Response(self.get_serializer(receipt).data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='reverse')
    def reverse(self, request, pk=None):
        receipt = self.get_object()
        reason = request.data.get('reason', '')
        if not reason:
            return Response({'error': 'Reversal reason is required.'}, status=status.HTTP_400_BAD_REQUEST)

        from billing.services.client_receipt_service import ClientReceiptService
        try:
            receipt = ClientReceiptService.reverse_client_receipt(receipt=receipt, user=request.user, reason=reason)
            return Response(self.get_serializer(receipt).data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class RecoveryActivityViewSet(TenantModelViewSet):
    queryset = RecoveryActivity.objects.all()
    serializer_class = RecoveryActivitySerializer
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    required_module = 'billing'
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager', 'staff']
    required_read_permissions = ['billing.read', 'finance.read', 'security_finance.read', 'operations.read']
    required_write_permissions = ['billing.write', 'finance.write', 'security_finance.write']

    def create(self, request, *args, **kwargs):
        client_id = request.data.get('client')
        invoice_id = request.data.get('invoice')
        activity_type = request.data.get('activity_type', 'PHONE_CALL')
        activity_date_str = request.data.get('activity_date')
        notes = request.data.get('notes', '')
        promise_amount = request.data.get('promise_amount')
        promise_date_str = request.data.get('promise_date')
        next_followup_date_str = request.data.get('next_followup_date') or request.data.get('follow_up_date')
        recovery_status_outcome = request.data.get('recovery_status_outcome')

        from crm.models import CRMEntity
        from companies.models import Company
        company_id = self._get_company_id(request)
        company = Company.objects.get(id=company_id)

        client = CRMEntity.objects.filter(id=client_id, company=company).first()
        if not client:
            return Response({'error': 'Valid client is required.'}, status=status.HTTP_400_BAD_REQUEST)

        invoice = None
        if invoice_id:
            invoice = ClientInvoice.objects.filter(id=invoice_id, company=company).first()

        from datetime import datetime
        activity_date = None
        if activity_date_str:
            try:
                activity_date = datetime.strptime(str(activity_date_str).strip(), '%Y-%m-%d').date()
            except ValueError:
                pass

        promise_date = None
        if promise_date_str:
            try:
                promise_date = datetime.strptime(str(promise_date_str).strip(), '%Y-%m-%d').date()
            except ValueError:
                pass

        next_followup_date = None
        if next_followup_date_str:
            try:
                next_followup_date = datetime.strptime(str(next_followup_date_str).strip(), '%Y-%m-%d').date()
            except ValueError:
                pass

        from billing.services.recovery_service import RecoveryService
        try:
            act = RecoveryService.record_recovery_activity(
                company=company,
                client=client,
                invoice=invoice,
                activity_type=activity_type,
                activity_date=activity_date,
                notes=notes,
                promise_amount=promise_amount,
                promise_date=promise_date,
                next_followup_date=next_followup_date,
                recovery_status_outcome=recovery_status_outcome,
                created_by=request.user
            )
            return Response(self.get_serializer(act).data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
