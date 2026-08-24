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
    ExtraDutyPayrollBridge, BillingAccountingConfiguration
)
from .serializers import (
    ServiceInvoiceSerializer, ServiceInvoiceLineSerializer,
    ExtraDutyPayrollBridgeSerializer, BillingAccountingConfigurationSerializer
)

logger = logging.getLogger(__name__)


class ServiceInvoiceViewSet(TenantModelViewSet):
    queryset = ServiceInvoice.objects.all()
    serializer_class = ServiceInvoiceSerializer
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    required_module = 'billing'
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager', 'staff']
    required_read_permissions = ['billing.read']
    required_write_permissions = ['billing.write']

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
    required_read_permissions = ['billing.read']
    required_write_permissions = ['billing.write']


class ExtraDutyPayrollBridgeViewSet(TenantModelViewSet):
    queryset = ExtraDutyPayrollBridge.objects.all()
    serializer_class = ExtraDutyPayrollBridgeSerializer
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    required_module = 'billing'
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager', 'staff']
    required_read_permissions = ['billing.read']
    required_write_permissions = ['billing.write']


class BillingAccountingConfigurationViewSet(TenantModelViewSet):
    queryset = BillingAccountingConfiguration.objects.all()
    serializer_class = BillingAccountingConfigurationSerializer
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    required_module = 'billing'
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager', 'staff']
    required_read_permissions = ['billing.read']
    required_write_permissions = ['billing.write']


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
