from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from erp_core.permissions import RolePermission
from erp_core.views import TenantModelViewSet
from platform_core.permissions import ModulePermission
from .models import Category, Product, StockMovement, Vendor, VendorLedger, PurchaseOrder, PurchaseOrderItem, Item, InventoryBalance, ItemSerial, ItemFieldDefinition
from .serializers import (
    CategorySerializer, ProductSerializer, StockMovementSerializer,
    VendorSerializer, VendorLedgerSerializer, PurchaseOrderSerializer, PurchaseOrderItemSerializer,
    ItemSerializer, InventoryBalanceSerializer, ItemSerialSerializer, ItemFieldDefinitionSerializer
)


class CategoryViewSet(TenantModelViewSet):
    required_module = 'inventory'
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager', 'cashier', 'technician', 'staff']


class ProductViewSet(TenantModelViewSet):
    """
    Products viewset — readable by everyone (POS needs it),
    writable only by admin/manager.
    """
    required_module = 'inventory'
    queryset = Product.objects.select_related('category').all()
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager', 'cashier', 'technician', 'staff']
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['brand', 'model_name', 'barcode', 'color', 'storage_capacity']
    ordering_fields = ['brand', 'sale_price', 'stock_quantity', 'created_at']

    @action(detail=False, methods=['get'])
    def low_stock(self, request):
        """Return all products that are at or below low_stock_threshold."""
        from inventory.models import InventoryBalance
        from django.db.models import Sum
        
        items_with_balance = InventoryBalance.objects.filter(
            company_id=request.user.company_id
        ).values('item__item_code').annotate(total=Sum('quantity'))
        
        item_stock_map = {
            item['item__item_code']: item['total'] for item in items_with_balance
        }
        
        low_stock_product_ids = []
        for p in self.get_queryset():
            stock = item_stock_map.get(f"LEGACY-PROD-{p.id}", 0)
            if stock <= p.low_stock_threshold:
                low_stock_product_ids.append(p.id)
                
        qs = self.get_queryset().filter(id__in=low_stock_product_ids)
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def search_pos(self, request):
        """Fast search for POS: by name or barcode."""
        q = request.query_params.get('q', '').strip()
        if not q:
            return Response([])
        from django.db.models import Q
        qs = self.get_queryset().filter(
            Q(brand__icontains=q) |
            Q(model_name__icontains=q) |
            Q(barcode__iexact=q)
        )[:20]
        return Response(ProductSerializer(qs, many=True).data)

    @action(detail=False, methods=['get'], url_path='kpis')
    def kpis(self, request):
        """
        Return authoritative Inventory KPIs for the current tenant.
        Calculated purely in DB to ensure paginated results do not distort aggregates.
        """
        from django.db.models import Sum, Count, F, Q, Value, CharField, OuterRef, Subquery, IntegerField, DecimalField
        from django.db.models.functions import Concat, Cast, Coalesce
        from inventory.models import InventoryBalance
        
        company_id = request.user.company_id
        
        # Subquery to aggregate balances from the Item architecture if they exist
        item_code_expr = Concat(Value('LEGACY-PROD-'), Cast(OuterRef('id'), CharField()))
        balance_subquery = InventoryBalance.objects.filter(
            item__item_code=item_code_expr,
            company_id=OuterRef('company_id')
        ).values('item__item_code').annotate(
            total_qty=Sum('quantity')
        ).values('total_qty')
        
        products = self.get_queryset().annotate(
            annotated_qty=Subquery(balance_subquery, output_field=DecimalField(max_digits=12, decimal_places=2)),
            final_stock=Coalesce('annotated_qty', Cast('stock_quantity', DecimalField(max_digits=12, decimal_places=2)))
        )
        
        kpis = products.aggregate(
            total_active_skus=Count('id'),
            calculated_asset_value=Sum(F('cost_price') * F('final_stock'), output_field=DecimalField(max_digits=12, decimal_places=2)),
            hardware_shortages=Count('id', filter=Q(final_stock__lte=Coalesce('low_stock_threshold', Value(5), output_field=IntegerField())))
        )
        
        return Response({
            "total_active_skus": kpis.get('total_active_skus') or 0,
            "calculated_asset_value": float(kpis.get('calculated_asset_value') or 0),
            "hardware_shortages": kpis.get('hardware_shortages') or 0
        })



# Fix missing import
from django.db import models


class StockMovementViewSet(TenantModelViewSet):
    required_module = 'inventory'
    queryset = StockMovement.objects.select_related('product', 'item', 'warehouse').all()
    serializer_class = StockMovementSerializer
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager']
    http_method_names = ['get', 'head', 'options']


class VendorViewSet(TenantModelViewSet):
    required_module = 'inventory'
    queryset = Vendor.objects.all()
    serializer_class = VendorSerializer
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager', 'staff', 'technician']


class VendorLedgerViewSet(TenantModelViewSet):
    """View and record vendor payable transactions."""
    required_module = 'inventory'
    queryset = VendorLedger.objects.select_related('vendor').all()
    serializer_class = VendorLedgerSerializer
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager', 'technician']

    def perform_create(self, serializer):
        serializer.save(company_id=self.request.user.company_id)

    def get_queryset(self):
        qs = super().get_queryset().order_by('-created_at')
        vendor_id = self.request.query_params.get('vendor')
        crm_entity_id = self.request.query_params.get('crm_entity')
        if crm_entity_id:
            qs = qs.filter(crm_entity_id=crm_entity_id)
        elif vendor_id:
            qs = qs.filter(vendor_id=vendor_id)
        return qs

    @action(detail=False, methods=['post'])
    def pay_vendor(self, request):
        """
        Record a payment to a vendor — creates a CREDIT entry and reduces balance.
        Payload: { vendor_id, amount, notes } or { crm_entity_id, amount, notes }
        """
        vendor_id = request.data.get('vendor_id')
        crm_entity_id = request.data.get('crm_entity_id')
        amount = request.data.get('amount')
        notes = request.data.get('notes', '')

        if not (vendor_id or crm_entity_id) or not amount:
            return Response({'error': 'vendor_id or crm_entity_id, and amount required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            if crm_entity_id:
                # Find vendor through bridge
                vendor = Vendor.objects.get(crm_entity_id=crm_entity_id, company_id=request.user.company_id)
            else:
                vendor = Vendor.objects.get(pk=vendor_id, company_id=request.user.company_id)
        except Vendor.DoesNotExist:
            return Response({'error': 'Vendor not found'}, status=status.HTTP_404_NOT_FOUND)

        import decimal
        amount_dec = decimal.Decimal(str(amount))
        # Create CREDIT ledger entry — VendorLedger.save() auto-updates balance_due/total_paid
        entry = VendorLedger.objects.create(
            company_id=request.user.company_id,
            vendor=vendor,
            crm_entity_id=crm_entity_id or vendor.crm_entity_id,
            transaction_type='CREDIT',
            amount=amount_dec,
            reference=f"PMT-{str(vendor.id)[:8].upper()}",
            notes=notes or f"Payment to {vendor.name}"
        )
        # Refresh vendor from DB to get updated balance_due after F() expressions
        vendor.refresh_from_db()
        return Response({
            'status': 'paid',
            'vendor_id':  str(vendor.id),
            'vendor_name': vendor.name,
            'balance_due': float(vendor.balance_due),
            'total_paid': float(vendor.total_paid),
            'total_purchases': float(vendor.total_purchases),
            'entry_id': str(entry.id)
        })

    @action(detail=False, methods=['post'])
    def recalculate_balances(self, request):
        """
        Admin utility: Re-aggregate all vendor balances from VendorLedger entries.
        POST /api/inventory/vendorledger/recalculate_balances/
        """
        from django.db.models import Sum
        company_id = request.user.company_id
        vendors = Vendor.objects.filter(company_id=company_id)
        fixed = 0
        for v in vendors:
            qs = VendorLedger._default_manager.filter(vendor_id=v.pk, is_deleted=False)
            total_purchases = qs.filter(transaction_type='DEBIT').aggregate(
                s=Sum('amount'))['s'] or 0
            total_paid = qs.filter(transaction_type='CREDIT').aggregate(
                s=Sum('amount'))['s'] or 0
            Vendor._default_manager.filter(pk=v.pk).update(
                total_purchases=total_purchases,
                total_paid=total_paid,
                balance_due=total_purchases - total_paid,
            )
            fixed += 1
        return Response({'status': 'ok', 'vendors_fixed': fixed})


class PurchaseOrderViewSet(TenantModelViewSet):
    required_module = 'purchasing'
    queryset = PurchaseOrder.objects.select_related('vendor', 'procurement_document', 'crm_entity').prefetch_related('items__product', 'items__item', 'items__procurement_line').all()
    serializer_class = PurchaseOrderSerializer
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager']

    def perform_create(self, serializer):
        # Allow normal creation, signals/save will auto-bridge
        super().perform_create(serializer)

    def perform_update(self, serializer):
        super().perform_update(serializer)

    def perform_destroy(self, instance):
        if instance.procurement_document and instance.procurement_document.status not in ['DRAFT', 'CANCELLED']:
            from rest_framework.exceptions import ValidationError
            raise ValidationError("Cannot delete a Purchase Order that has an active Procurement Document.")
        super().perform_destroy(instance)

    @action(detail=True, methods=['post'])
    def receive(self, request, pk=None):
        po = self.get_object()
        if po.procurement_document:
            if po.procurement_document.status == 'RECEIVED':
                return Response({'status': 'already_received'}, status=status.HTTP_400_BAD_REQUEST)
            po.status = 'RECEIVED'
            po.save(update_fields=['status'])
            po.procurement_document.status = 'RECEIVED'
            po.procurement_document.save(update_fields=['status'])
        else:
            if po.status == 'RECEIVED':
                return Response({'status': 'already_received'}, status=status.HTTP_400_BAD_REQUEST)
            po.status = 'RECEIVED'
            po.save(update_fields=['status'])
        return Response({'status': 'received'})



class PurchaseOrderItemViewSet(TenantModelViewSet):
    required_module = 'purchasing'
    queryset = PurchaseOrderItem.objects.select_related('product', 'item', 'purchase_order').all()
    serializer_class = PurchaseOrderItemSerializer
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager']

class ItemViewSet(TenantModelViewSet):
    required_module = 'inventory'
    queryset = Item.objects.select_related('category').all()
    serializer_class = ItemSerializer
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager', 'cashier', 'technician', 'staff']
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'sku', 'item_code', 'barcode', 'brand']
    ordering_fields = ['name', 'created_at']

    def get_queryset(self):
        from django.db.models import Sum, DecimalField
        from django.db.models.functions import Coalesce
        qs = Item.objects.select_related('category').all()
        # Add tenant filter manually here before annotation just to be safe, 
        # though TenantModelViewSet does it in super().get_queryset()
        # But super().get_queryset() will apply the base filtering.
        qs = super().get_queryset()
        return qs.annotate(
            current_stock=Coalesce(
                Sum('balances__quantity'),
                0.0,
                output_field=DecimalField(max_digits=12, decimal_places=2)
            )
        )

    @action(detail=True, methods=['post'], url_path='opening_stock')
    def opening_stock(self, request, pk=None):
        item = self.get_object()
        warehouse_id = request.data.get('warehouse_id')
        quantity = request.data.get('quantity')

        if not item.track_inventory:
            return Response({"error": "Item does not track inventory"}, status=status.HTTP_400_BAD_REQUEST)

        if not warehouse_id or quantity is None:
            return Response({"error": "warehouse_id and quantity are required"}, status=status.HTTP_400_BAD_REQUEST)

        import decimal
        try:
            qty = decimal.Decimal(str(quantity))
            if qty < 0:
                return Response({"error": "Quantity cannot be negative"}, status=status.HTTP_400_BAD_REQUEST)
        except (decimal.InvalidOperation, ValueError, TypeError):
            return Response({"error": "Invalid quantity"}, status=status.HTTP_400_BAD_REQUEST)

        if qty > 0:
            from platform_core.models import Warehouse
            try:
                warehouse = Warehouse.objects.get(id=warehouse_id, company_id=request.user.company_id)
            except Warehouse.DoesNotExist:
                return Response({"error": "Warehouse not found"}, status=status.HTTP_404_NOT_FOUND)

            from inventory.services.transaction_service import process_transaction
            from inventory.services.exceptions import InventoryValidationException
            try:
                # Assuming request.user.company is a valid Company instance since TenantModelViewSet works
                # If it's a proxy or user.company isn't accessible, we query it.
                from companies.models import Company
                company = Company.objects.get(id=request.user.company_id)
                process_transaction(
                    company=company,
                    item=item,
                    warehouse=warehouse,
                    movement_type='OPENING_BALANCE',
                    quantity=qty,
                    reference='OPENING',
                    user=request.user,
                    notes='Opening stock entry'
                )
            except InventoryValidationException as e:
                return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({"status": "ok"})

class InventoryBalanceViewSet(TenantModelViewSet):
    required_module = 'inventory'
    queryset = InventoryBalance.objects.select_related('item', 'warehouse').all()
    serializer_class = InventoryBalanceSerializer
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager', 'cashier', 'technician', 'staff']
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['item__name', 'item__sku', 'warehouse__name']
    ordering_fields = ['quantity', 'created_at']

class ItemSerialViewSet(TenantModelViewSet):
    required_module = 'inventory'
    queryset = ItemSerial.objects.select_related('item', 'warehouse').all()
    serializer_class = ItemSerialSerializer
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager', 'cashier', 'technician', 'staff']
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['serial_number', 'item__name', 'item__sku', 'warehouse__name']
    ordering_fields = ['serial_number', 'status', 'created_at']

class ItemFieldDefinitionViewSet(TenantModelViewSet):
    required_module = 'inventory'
    queryset = ItemFieldDefinition.objects.all()
    serializer_class = ItemFieldDefinitionSerializer
    permission_classes = [IsAuthenticated, RolePermission, ModulePermission]
    allowed_roles = ['admin', 'manager']
    allowed_reads = ['admin', 'manager', 'cashier', 'technician', 'staff']
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'key']
    ordering_fields = ['sort_order', 'name']
    
    def get_queryset(self):
        qs = super().get_queryset()
        category_id = self.request.query_params.get('category')
        if category_id:
            from django.db.models import Q
            qs = qs.filter(Q(category_id=category_id) | Q(category__isnull=True))
        
        is_active = self.request.query_params.get('active')
        if is_active is not None:
            active_bool = is_active.lower() == 'true'
            qs = qs.filter(active=active_bool)
            
        return qs
