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
    ClientInvoice, ClientInvoiceLine,
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


# ============================================================================
# PHASE S-4B VIEWSETS
# ============================================================================

from .models import (
    BillingPeriod, BillingSheet, BillingSheetLine, BillingAdjustment,
    ClientInvoice, ClientInvoiceLine
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
    required_read_permissions = ['billing.read']
    required_write_permissions = ['billing.write']


class BillingSheetViewSet(TenantModelViewSet):
    queryset = BillingSheet.objects.all()
    serializer_class = BillingSheetSerializer
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    required_module = 'billing'
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager', 'staff']
    required_read_permissions = ['billing.read']
    required_write_permissions = ['billing.write']

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
    required_read_permissions = ['billing.read']
    required_write_permissions = ['billing.write']

    @action(detail=True, methods=['post'], url_path='issue')
    def issue(self, request, pk=None):
        invoice = self.get_object()
        try:
            invoice = issue_client_invoice(invoice, user=request.user)
            return Response(self.get_serializer(invoice).data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

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
    required_read_permissions = ['billing.read']
    required_write_permissions = ['billing.write']

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
    required_read_permissions = ['billing.read']
    required_write_permissions = ['billing.write']

    def create(self, request, *args, **kwargs):
        client_id = request.data.get('client')
        invoice_id = request.data.get('invoice')
        activity_type = request.data.get('activity_type', 'PHONE_CALL')
        activity_date_str = request.data.get('activity_date')
        notes = request.data.get('notes', '')
        promise_amount = request.data.get('promise_amount')
        promise_date_str = request.data.get('promise_date')
        next_followup_date_str = request.data.get('next_followup_date')
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
