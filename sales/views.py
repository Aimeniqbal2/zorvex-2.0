"""
sales/views.py
POS Sales System — atomic checkout with inventory deduction, profit tracking, and finance integration.
"""
import logging
from django.db import transaction
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from erp_core.permissions import RolePermission
from rest_framework.exceptions import ValidationError
from erp_core.views import TenantModelViewSet
from platform_core.permissions import ModulePermission
from .models import Sale, SaleItem, Customer, CustomerCreditLedger, POSSession
from .serializers import SaleSerializer, SaleItemSerializer, CustomerSerializer, CustomerCreditLedgerSerializer, POSSessionSerializer
from inventory.models import Item, Product

logger = logging.getLogger(__name__)


class CustomerViewSet(TenantModelViewSet):
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(company_id=self.request.user.company_id)

    @action(detail=True, methods=['post'])
    def receive_payment(self, request, pk=None):
        """
        Record a cash/card payment received from a credit customer.
        Creates a CREDIT entry in CustomerCreditLedger and reduces balance.
        Payload: { amount, notes }
        """
        customer = self.get_object()
        amount_raw = request.data.get('amount')
        notes = request.data.get('notes', '').strip()
        if not amount_raw:
            return Response({'error': 'amount is required'}, status=status.HTTP_400_BAD_REQUEST)

        import decimal
        try:
            amount = decimal.Decimal(str(amount_raw))
        except decimal.InvalidOperation:
            return Response({'error': 'Invalid amount'}, status=status.HTTP_400_BAD_REQUEST)

        if amount <= 0:
            return Response({'error': 'Amount must be positive'}, status=status.HTTP_400_BAD_REQUEST)

        # This automatically deducts from customer.balance via CustomerCreditLedger.save()
        entry = CustomerCreditLedger.objects.create(
            company_id=request.user.company_id,
            customer=customer,
            transaction_type='CREDIT',
            amount=amount,
            notes=notes or f'Payment received from {customer.name}'
        )

        # Finance journal entry is now automatically created by CustomerCreditLedger.save()

        # Refresh from DB to get updated balance after F() expression update
        customer.refresh_from_db()
        return Response({
            'status': 'payment_recorded',
            'customer_id': str(customer.id),
            'new_balance': self.get_serializer(customer).data['balance'],
            'entry_id': str(entry.id)
        })

    @action(detail=False, methods=['post'])
    def recalculate_balances(self, request):
        """
        Admin utility: Recalculates total_credit, total_paid, balance for ALL
        customers from their ledger entries. Use to fix stale data.
        POST /api/sales/customers/recalculate_balances/
        """
        from django.db.models import Sum
        company_id = request.user.company_id
        customers = Customer.objects.filter(company_id=company_id)
        fixed = 0
        for c in customers:
            qs = CustomerCreditLedger._default_manager.filter(
                customer_id=c.pk, is_deleted=False
            )
            total_credit = qs.filter(transaction_type='DEBIT').aggregate(
                s=Sum('amount'))['s'] or 0
            total_paid = qs.filter(transaction_type='CREDIT').aggregate(
                s=Sum('amount'))['s'] or 0
            balance = total_credit - total_paid
            Customer._default_manager.filter(pk=c.pk).update(
                total_credit=total_credit,
                total_paid=total_paid,
                balance=balance,
            )
            fixed += 1
        return Response({'status': 'ok', 'customers_fixed': fixed})


class CustomerCreditLedgerViewSet(TenantModelViewSet):
    queryset = CustomerCreditLedger.objects.select_related('customer', 'sale').all()
    serializer_class = CustomerCreditLedgerSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(company_id=self.request.user.company_id)

    def get_queryset(self):
        qs = super().get_queryset()
        # Allow filtering by customer: GET /api/sales/ledger/?customer=<id>
        customer_id = self.request.query_params.get('customer')
        crm_entity_id = self.request.query_params.get('crm_entity')
        
        if crm_entity_id:
            qs = qs.filter(crm_entity_id=crm_entity_id)
        elif customer_id:
            qs = qs.filter(customer_id=customer_id)
            
        return qs.order_by('-created_at')


class POSSessionViewSet(TenantModelViewSet):
    required_module = 'pos'
    queryset = POSSession.objects.all()
    serializer_class = POSSessionSerializer
    permission_classes = [IsAuthenticated, ModulePermission]

    def perform_create(self, serializer):
        active = POSSession.objects.filter(cashier=self.request.user, status='OPEN').first()
        if active:
            raise ValidationError("You already have an active POS session. Please close it first.")
        serializer.save(cashier=self.request.user, company_id=self.request.user.company_id)

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        session = self.get_object()
        if 'status' in request.data and request.data['status'] == 'CLOSED':
            if session.status == 'CLOSED':
                return Response({"error": "Session already closed"}, status=status.HTTP_400_BAD_REQUEST)

            closing_cash = request.data.get('closing_cash')
            if closing_cash is None:
                raise ValidationError("Closing cash amount is required to end the session.")

            from django.db.models import Sum
            total_sales = Sale.objects.filter(
                pos_session=session, payment_method='cash'
            ).aggregate(total=Sum('total_amount'))['total'] or 0
            expected = float(session.opening_cash) + float(total_sales)
            diff = float(closing_cash) - expected

            session.closing_cash = closing_cash
            session.difference = diff
            session.status = 'CLOSED'
            session.end_time = timezone.now()
            session.save()
            return Response(POSSessionSerializer(session).data)

        return super().update(request, *args, **kwargs)


class SaleViewSet(TenantModelViewSet):
    required_module = 'sales'
    queryset = Sale.objects.select_related('cashier', 'customer', 'service_order').prefetch_related('items__product', 'items__item').all()
    serializer_class = SaleSerializer
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    allowed_roles = ['admin', 'manager', 'cashier']
    allowed_reads = ['admin', 'manager', 'cashier']

    @transaction.atomic
    def perform_create(self, serializer):
        import decimal
        user = self.request.user

        session = POSSession.objects.filter(cashier=user, status='OPEN').first()
        if not session:
            from rest_framework.exceptions import ValidationError as DRFValidationError
            raise DRFValidationError("No active POS Session. Please open a session before transacting.")

        # ── Payment validation at view level ──────────────────────────────────
        payment_method = self.request.data.get('payment_method', 'cash').lower().strip()
        total_amount_raw    = self.request.data.get('total_amount', 0)
        # Default received to 0 (NOT total_amount) — forces frontend to always send it explicitly
        received_amount_raw = self.request.data.get('received_amount', 0)

        try:
            total_amount    = decimal.Decimal(str(total_amount_raw)).quantize(decimal.Decimal('0.01'))
            received_amount = decimal.Decimal(str(received_amount_raw)).quantize(decimal.Decimal('0.01'))
        except (decimal.InvalidOperation, TypeError):
            total_amount    = decimal.Decimal('0')
            received_amount = decimal.Decimal('0')

        from rest_framework.exceptions import ValidationError as DRFValidationError

        if payment_method in ('cash', 'card'):
            if received_amount < total_amount:
                raise DRFValidationError(
                    f"Insufficient payment for {payment_method.upper()}. "
                    f"Required: PKR {total_amount} | Received: PKR {received_amount}"
                )

        if payment_method == 'credit':
            customer_id = self.request.data.get('customer')
            crm_entity_id = self.request.data.get('crm_entity')
            if not customer_id and not crm_entity_id:
                raise DRFValidationError(
                    "B2B Credit Sales require a linked customer profile. "
                    "Please search and select a customer before issuing credit."
                )

        serializer.save(
            cashier=user,
            pos_session=session,
            company_id=user.company_id
        )

    def destroy(self, request, *args, **kwargs):
        """Prevent deletion if Sale already owns POSTED JournalEntry."""
        sale = self.get_object()
        if sale.journal_entry and sale.journal_entry.status == 'POSTED':
            return Response(
                {"error": "Cannot delete sale with posted accounting records. Cancel it instead to reverse the journal."},
                status=status.HTTP_400_BAD_REQUEST
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=['post'])
    def checkout(self, request, *args, **kwargs):
        """Atomic checkout: Creates Sale, SaleItems, deductions, and journals."""
        with transaction.atomic():
            import decimal
            user = self.request.user

            session = POSSession.objects.filter(cashier=user, status='OPEN').first()
            if not session:
                from rest_framework.exceptions import ValidationError as DRFValidationError
                raise DRFValidationError("No active POS Session. Please open a session before transacting.")

            payment_method = request.data.get('payment_method', 'cash').lower().strip()
            total_amount_raw = request.data.get('total_amount', 0)
            received_amount_raw = request.data.get('received_amount', 0)

            try:
                total_amount = decimal.Decimal(str(total_amount_raw)).quantize(decimal.Decimal('0.01'))
                received_amount = decimal.Decimal(str(received_amount_raw)).quantize(decimal.Decimal('0.01'))
            except (decimal.InvalidOperation, TypeError):
                total_amount = decimal.Decimal('0')
                received_amount = decimal.Decimal('0')

            from rest_framework.exceptions import ValidationError as DRFValidationError

            if payment_method in ('cash', 'card'):
                if received_amount < total_amount:
                    raise DRFValidationError(
                        f"Insufficient payment for {payment_method.upper()}. "
                        f"Required: PKR {total_amount} | Received: PKR {received_amount}"
                    )

            if payment_method == 'credit':
                customer_id = request.data.get('customer')
                crm_entity_id = request.data.get('crm_entity')
                if not customer_id and not crm_entity_id:
                    raise DRFValidationError(
                        "B2B Credit Sales require a linked customer profile. "
                        "Please search and select a customer before issuing credit."
                    )

            # Validate Sale metadata
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)

            sale = serializer.save(
                cashier=user,
                pos_session=session,
                company_id=user.company_id
            )

            lines = request.data.get('lines', [])
            if not lines:
                raise DRFValidationError("Cannot process a sale with no items.")

            from platform_core.models import Warehouse
            from inventory.services.transaction_service import process_transaction
            from inventory.services.compatibility import resolve_item_from_product
            from inventory.services.exceptions import NegativeStockException
            from inventory.models import Product

            warehouse = Warehouse.objects.filter(company_id=user.company_id, is_default=True).first()
            if not warehouse:
                raise DRFValidationError("Company has no default warehouse.")

            total_profit = decimal.Decimal('0')

            for line_data in lines:
                product_id = line_data.get('product')
                item_id = line_data.get('item_id') or line_data.get('item')
                
                if not product_id and not item_id:
                    raise DRFValidationError("Product ID or Item ID is required for all sale items.")
                
                product = None
                item_entity = None
                unit_cost = decimal.Decimal('0')
                
                if item_id:
                    try:
                        item_entity = Item.objects.get(id=item_id, company_id=user.company_id)
                    except Item.DoesNotExist:
                        raise DRFValidationError(f"Item with ID {item_id} not found.")
                    unit_cost = item_entity.cost_price
                elif product_id:
                    try:
                        product = Product.objects.get(id=product_id, company_id=user.company_id)
                    except Product.DoesNotExist:
                        raise DRFValidationError(f"Product with ID {product_id} not found.")
                    item_entity = resolve_item_from_product(product)
                    if not item_entity:
                        raise DRFValidationError(f"Product {product.model_name} is not mapped to an Item.")
                    unit_cost = product.cost_price

                qty_raw = line_data.get('quantity', 1)
                try:
                    quantity = decimal.Decimal(str(qty_raw))
                except (decimal.InvalidOperation, TypeError):
                    raise DRFValidationError("Invalid quantity.")

                unit_price_raw = line_data.get('unit_price')
                try:
                    unit_price = decimal.Decimal(str(unit_price_raw))
                except (decimal.InvalidOperation, TypeError):
                    raise DRFValidationError("Invalid unit_price.")
                
                try:
                    process_transaction(
                        company=user.company,
                        item=item_entity,
                        warehouse=warehouse,
                        movement_type='SALE',
                        quantity=quantity,
                        reference=f"SALE-{str(sale.id)[:8].upper()}",
                        user=user,
                        notes="POS Sale deduction"
                    )
                except NegativeStockException as e:
                    raise DRFValidationError(str(e))

                sale_item = SaleItem(
                    sale=sale,
                    product=product,
                    item=item_entity,
                    quantity=quantity,
                    unit_price=unit_price,
                    unit_cost=unit_cost,
                    company_id=user.company_id
                )
                sale_item.save()
                total_profit += sale_item.line_profit

            # Update Sale profit
            sale.profit = total_profit
            sale.save(update_fields=['profit'])
            
            # Return updated Sale
            return Response(self.get_serializer(sale).data, status=status.HTTP_201_CREATED)


class SaleItemViewSet(TenantModelViewSet):
    required_module = 'sales'
    queryset = SaleItem.objects.select_related('sale', 'product', 'item').all()
    serializer_class = SaleItemSerializer
    permission_classes = [IsAuthenticated, ModulePermission]

    def perform_create(self, serializer):
        with transaction.atomic():
            product = serializer.validated_data.get('product')
            item = serializer.validated_data.get('item')
            quantity = serializer.validated_data.get('quantity', 1)
            
            if not product and not item:
                raise ValidationError("SaleItem requires either a product or an item.")

            from platform_core.models import Warehouse
            from inventory.services.transaction_service import process_transaction
            from inventory.services.compatibility import resolve_item_from_product
            from inventory.services.exceptions import NegativeStockException
            
            # Capture cost_price at time of sale for profit calculation
            unit_cost = item.cost_price if item else product.cost_price

            # Deduct inventory stock and record movement via Inventory Engine
            sale = serializer.validated_data.get('sale')
            item_entity = item or resolve_item_from_product(product)
            
            if item_entity:
                warehouse = Warehouse.objects.filter(company_id=self.request.user.company_id, is_default=True).first()
                if not warehouse:
                    raise ValidationError("Company has no default warehouse.")
                
                try:
                    process_transaction(
                        company=self.request.user.company,
                        item=item_entity,
                        warehouse=warehouse,
                        movement_type='SALE',
                        quantity=quantity,
                        reference=f"SALE-{str(sale.id)[:8].upper()}" if sale else "",
                        user=self.request.user,
                        notes=f"POS Sale deduction"
                    )
                except NegativeStockException as e:
                    raise ValidationError(str(e))
            else:
                raise ValidationError("Product is not mapped to an Item and no Item was provided.")

            # Save item with captured cost
            item = serializer.save(
                company_id=self.request.user.company_id,
                unit_cost=unit_cost
            )

            # Update profit on the parent sale
            sale = item.sale
            total_profit = sum(
                i.quantity * (i.unit_price - i.unit_cost)
                for i in sale.items.all()
            )
            sale.profit = total_profit
            sale.save(update_fields=['profit'])
            logger.info(f"SaleItem saved: {item_entity.name if item_entity else product.model_name} x{quantity} | Profit: {item.line_profit}")
