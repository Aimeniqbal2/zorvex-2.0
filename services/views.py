"""
services/views.py — Complete 3-Phase Service Order Workflow
FIXED:
  - process_payment: removed duplicate credit ledger (Sale.save() handles it automatically)
  - process_payment: handles missing customer_phone gracefully
  - process_payment: correctly passes received_amount for cash/card strict validation
  - Technicians blocked from: create, assign, pay, deliver
"""
import decimal
import logging
from django.utils import timezone
from django.db import transaction
from django.contrib.auth import get_user_model
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from erp_core.permissions import RolePermission
from erp_core.views import TenantModelViewSet
from erp_core.rbac import IsManagerOrAdmin, IsTechnician, IsCashier, TECHNICIAN_ROLES
from platform_core.permissions import ModulePermission
from notifications.models import Notification
from .models import ServiceOrder, ServiceMedia, ServiceWorkLog, ServicePartUsed
from .serializers import (
    ServiceOrderSerializer, ServiceOrderListSerializer,
    ServiceMediaSerializer, ServiceWorkLogSerializer, ServicePartUsedSerializer
)

User = get_user_model()
logger = logging.getLogger(__name__)

PRIVILEGED_ROLES = ('admin', 'manager', 'super_admin', 'cashier')


class ServiceOrderViewSet(TenantModelViewSet):
    required_module = 'services'
    queryset = ServiceOrder.objects.select_related(
        'technician', 'assigned_technician'
    ).prefetch_related('work_logs__technician', 'parts_used__product', 'parts_used__item', 'parts_used__vendor', 'media__uploaded_by').all()
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    allowed_roles  = ['admin', 'manager', 'cashier']
    allowed_reads  = ['admin', 'manager', 'hardware_technician', 'software_technician', 'cashier', 'staff']

    def get_serializer_class(self):
        if self.action == 'list':
            return ServiceOrderListSerializer
        return ServiceOrderSerializer

    def perform_create(self, serializer):
        user = self.request.user
        if user.role in TECHNICIAN_ROLES:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Technicians cannot create service orders.")
        serializer.save(company_id=user.company_id, status='pending')

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role in TECHNICIAN_ROLES:
            qs = qs.filter(assigned_technician=user)
        return qs

    # ── Assign Technician ──────────────────────────────────────────────────────
    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def assign_technician(self, request, pk=None):
        user = request.user
        if user.role not in PRIVILEGED_ROLES and not user.is_superuser:
            return Response(
                {'error': 'Only admin, manager, or cashier can assign technicians.'},
                status=status.HTTP_403_FORBIDDEN
            )

        order = self.get_object()
        technician_id = request.data.get('technician_id')
        if not technician_id:
            return Response({'error': 'technician_id required'}, status=400)

        dept_to_role = {
            'hardware': 'hardware_technician',
            'software': 'software_technician',
        }
        expected_role = dept_to_role.get(order.department)

        try:
            if expected_role:
                tech = User.objects.get(pk=technician_id, company_id=user.company_id, role=expected_role)
            else:
                tech = User.objects.get(pk=technician_id, company_id=user.company_id, role__in=TECHNICIAN_ROLES)
        except User.DoesNotExist:
            dept_label = order.department.capitalize() if order.department else 'correct'
            return Response(
                {'error': f'No {dept_label} technician with that ID found in this company.'},
                status=status.HTTP_404_NOT_FOUND
            )

        order.assigned_technician = tech
        order.technician = tech
        order.save(update_fields=['assigned_technician', 'technician'])

        try:
            Notification.objects.create(
                user=tech, company_id=order.company_id,
                title="New Service Assignment",
                message=f"You've been assigned: {order.device_brand} {order.device_model} for {order.customer_name}"
            )
        except Exception:
            pass

        return Response(ServiceOrderSerializer(order).data)

    # ── Start Technical Phase ──────────────────────────────────────────────────
    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def start_technical_phase(self, request, pk=None):
        order = self.get_object()
        user  = request.user

        is_admin_user  = user.role in ('admin', 'manager', 'super_admin') or user.is_superuser
        is_assigned    = order.assigned_technician_id and str(order.assigned_technician_id) == str(user.pk)

        if not is_admin_user and not is_assigned:
            return Response(
                {'error': 'Only the assigned technician or an admin can start the technical phase.'},
                status=status.HTTP_403_FORBIDDEN
            )
        if order.technical_phase_started:
            return Response({'message': 'Technical phase already started.'})
        if not order.assigned_technician_id:
            return Response({'error': 'Assign a technician first.'}, status=400)

        order.technical_phase_started    = True
        order.technical_phase_started_at = timezone.now()
        order.status     = 'in_progress'
        order.start_time = order.start_time or timezone.now()
        order.save(update_fields=['technical_phase_started', 'technical_phase_started_at', 'status', 'start_time'])

        ServiceWorkLog.objects.create(
            company_id=order.company_id, service_order=order, technician=user,
            status_change='in_progress',
            notes=f"Technical phase started by {user.username} ({user.role})"
        )
        return Response(ServiceOrderSerializer(order).data)

    # ── Update Status ──────────────────────────────────────────────────────────
    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def update_status(self, request, pk=None):
        order      = self.get_object()
        user       = request.user
        new_status = request.data.get('status')
        comments   = request.data.get('comments', '')

        valid_statuses = dict(ServiceOrder.STATUS_CHOICES).keys()
        if new_status not in valid_statuses:
            return Response({'error': f'Invalid status. Use: {list(valid_statuses)}'}, status=400)

        if user.role in TECHNICIAN_ROLES and new_status not in ('ready', 'return', 'in_progress'):
            return Response({'error': 'Technicians can only mark orders as "ready" or "return".'}, status=403)

        if new_status == 'delivered' and user.role not in PRIVILEGED_ROLES and not user.is_superuser:
            return Response({'error': 'Only admin, manager, or cashier can mark as delivered.'}, status=403)

        order.status = new_status
        if comments:
            order.technician_comments = comments
        if new_status in ('ready', 'delivered', 'return') and not order.end_time:
            order.end_time = timezone.now()
            if order.start_time:
                diff = (order.end_time - order.start_time).total_seconds()
                order.hours_worked = round(diff / 3600.0, 2)
        order.save()

        ServiceWorkLog.objects.create(
            company_id=order.company_id, service_order=order, technician=user,
            status_change=new_status, notes=comments or f"Status updated to {new_status}"
        )
        return Response(ServiceOrderSerializer(order).data)

    # ── Process Payment ────────────────────────────────────────────────────────
    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    @transaction.atomic
    def process_payment(self, request, pk=None):
        """
        Phase 3: Final payment processing.

        Payment validation rules:
          - cash / card : received_amount MUST be >= final_amount
          - credit      : received_amount can be 0 — debt is logged to customer ledger
                          (Sale.save() automatically creates the CustomerCreditLedger entry)
          - split       : cash + card portions must sum to final_amount

        Technicians are BLOCKED from this action.
        """
        user = request.user
        if user.role in TECHNICIAN_ROLES:
            return Response({'error': 'Technicians cannot process payments.'}, status=403)
        if user.role not in PRIVILEGED_ROLES and not user.is_superuser:
            return Response({'error': 'Only admin, manager, or cashier can process payments.'}, status=403)

        order = self.get_object()
        if order.is_paid:
            return Response({'error': 'This order is already paid.'}, status=400)

        payment_method     = request.data.get('payment_method', 'cash').lower().strip()
        final_amount_raw   = request.data.get('final_amount', order.estimated_cost)
        received_amount_raw = request.data.get('received_amount', 0)

        try:
            final_amount    = decimal.Decimal(str(final_amount_raw)).quantize(decimal.Decimal('0.01'))
            received_amount = decimal.Decimal(str(received_amount_raw)).quantize(decimal.Decimal('0.01'))
        except (decimal.InvalidOperation, TypeError, ValueError):
            return Response({'error': 'Invalid amount values.'}, status=400)

        # ── Auto-calculate final amount from parts if not provided ─────────────
        parts_total = sum(
            decimal.Decimal(str(p.quantity)) * decimal.Decimal(str(p.unit_cost))
            for p in order.parts_used.all()
        )
        if not request.data.get('final_amount'):
            final_amount = decimal.Decimal(str(order.estimated_cost)) + parts_total

        # ── Strict payment validation ──────────────────────────────────────────
        if payment_method in ('cash', 'card'):
            if received_amount < final_amount:
                return Response({
                    'error': (
                        f'Full payment required. '
                        f'Required: PKR {final_amount}, Received: PKR {received_amount}'
                    )
                }, status=400)
        elif payment_method == 'credit':
            # Credit: no upfront payment required — logged to customer ledger automatically
            # Sale.save() creates the CustomerCreditLedger DEBIT entry
            pass
        elif payment_method == 'split':
            split_cash = decimal.Decimal(str(request.data.get('split_cash', 0)))
            split_card = decimal.Decimal(str(request.data.get('split_card', 0)))
            if abs((split_cash + split_card) - final_amount) > decimal.Decimal('0.02'):
                return Response({
                    'error': f'Split amounts must total PKR {final_amount}.'
                }, status=400)

        # ── Mark order as delivered ────────────────────────────────────────────
        order.payment_method  = payment_method
        order.final_amount    = final_amount
        order.is_paid         = True
        order.status          = 'delivered'
        order.delivery_status = 'delivered'
        order.end_time        = order.end_time or timezone.now()
        order.save()

        # ── Create/link customer profile ───────────────────────────────────────
        from sales.models import Sale, Customer, POSSession
        customer = None
        # Allow request to override customer_phone (used for credit sales with manual entry)
        customer_phone = request.data.get('customer_phone', '').strip() or order.customer_phone
        customer_name  = order.customer_name or 'Unknown'

        if customer_phone:
            customer, _ = Customer.objects.get_or_create(
                company_id=order.company_id,
                phone=customer_phone,
                defaults={'name': customer_name}
            )
        elif payment_method == 'credit':
            # Credit MUST have a customer — create one from name if no phone
            customer, _ = Customer.objects.get_or_create(
                company_id=order.company_id,
                name=customer_name,
                defaults={'phone': ''}
            )

        # ── Create Sale record (triggers finance journal + credit ledger if credit) ──
        session = POSSession.objects.filter(cashier=user, status='OPEN').first()
        sale = Sale.objects.create(
            company_id    = order.company_id,
            cashier       = user,
            customer      = customer,
            subtotal      = final_amount,
            discount_amount = decimal.Decimal('0'),
            tax_amount    = decimal.Decimal('0'),
            total_amount  = final_amount,
            payment_method = payment_method,
            service_order = order,
            pos_session   = session,
        )
        # NOTE: Sale.save() automatically creates CustomerCreditLedger DEBIT for credit
        # Do NOT create it manually here — would cause duplicate ledger entries

        logger.info(
            f"Service order {order.id} paid via {payment_method} | "
            f"Amount: PKR{final_amount} | Sale: {sale.id} | By: {user.username}"
        )
        return Response({
            'status':       'paid',
            'sale_id':      str(sale.id),
            'final_amount': float(final_amount),
            'order':        ServiceOrderSerializer(order).data
        })


class TechnicianListView(TenantModelViewSet):
    """
    Read-only list of technicians for the assignment modal.
    GET /api/services/technicians/?department=hardware
    GET /api/services/technicians/?department=software
    GET /api/services/technicians/   → all technicians
    """
    queryset = User.objects.none()
    permission_classes = [IsAuthenticated]

    def list(self, request, *args, **kwargs):
        user = request.user
        if user.role in TECHNICIAN_ROLES:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Technicians cannot access the assignment list.")

        company_id = user.company_id
        department = request.query_params.get('department', '').lower()
        dept_role_map = {'hardware': 'hardware_technician', 'software': 'software_technician'}

        if department in dept_role_map:
            techs = User.objects.filter(company_id=company_id, role=dept_role_map[department])
        else:
            techs = User.objects.filter(company_id=company_id, role__in=TECHNICIAN_ROLES)

        return Response([
            {
                'id':         str(t.id),
                'username':   t.username,
                'full_name':  t.get_full_name() or t.username,
                'email':      t.email,
                'role':       t.role,
                'role_label': 'Hardware Technician' if t.role == 'hardware_technician' else 'Software Technician',
            }
            for t in techs
        ])


class ServiceWorkLogViewSet(TenantModelViewSet):
    required_module = 'services'
    queryset = ServiceWorkLog.objects.select_related('technician').all()
    serializer_class = ServiceWorkLogSerializer
    permission_classes = [IsAuthenticated, ModulePermission]

    def perform_create(self, serializer):
        serializer.save(company_id=self.request.user.company_id, technician=self.request.user)


class ServicePartUsedViewSet(TenantModelViewSet):
    required_module = 'services'
    queryset = ServicePartUsed.objects.select_related('product', 'vendor', 'service_order').all()
    serializer_class = ServicePartUsedSerializer
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    allowed_roles = ['admin', 'manager', *TECHNICIAN_ROLES]

    def perform_create(self, serializer):
        serializer.save(company_id=self.request.user.company_id)


class ServiceMediaViewSet(TenantModelViewSet):
    required_module = 'services'
    queryset = ServiceMedia.objects.select_related('service_order', 'uploaded_by').all()
    serializer_class = ServiceMediaSerializer
    permission_classes = [IsAuthenticated, ModulePermission]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def perform_create(self, serializer):
        serializer.save(company_id=self.request.user.company_id, uploaded_by=self.request.user)
