from rest_framework import serializers
from django.db.models import Sum
from .models import Category, Product, StockMovement, Vendor, VendorLedger, PurchaseOrder, PurchaseOrderItem, Item, InventoryBalance, ItemSerial


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name', 'description']
        read_only_fields = ['company']


class ProductListSerializer(serializers.ListSerializer):
    def to_representation(self, data):
        iterable = data.all() if hasattr(data, 'all') else data
        product_ids = [p.id for p in iterable]
        item_codes = [f"LEGACY-PROD-{pid}" for pid in product_ids]
        
        from inventory.models import InventoryBalance
        from django.db.models import Sum
        balances = InventoryBalance.objects.filter(
            item__item_code__in=item_codes
        ).values('item__item_code').annotate(total=Sum('quantity'))
        
        balance_map = { b['item__item_code']: b['total'] for b in balances }
        
        for p in iterable:
            code = f"LEGACY-PROD-{p.id}"
            if code in balance_map and balance_map[code] is not None:
                p.annotated_stock = balance_map[code]
                
        return super().to_representation(data)


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    profit_per_unit = serializers.DecimalField(
        max_digits=10, decimal_places=2, read_only=True
    )
    is_low_stock = serializers.SerializerMethodField()
    price = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    stock_quantity = serializers.SerializerMethodField()

    def get_stock_quantity(self, obj):
        if hasattr(obj, 'annotated_stock'):
            return obj.annotated_stock
            
        from inventory.services.compatibility import resolve_item_from_product
        from django.db.models import Sum
        item_entity = resolve_item_from_product(obj)
        if item_entity:
            stock_res = item_entity.balances.aggregate(total=Sum('quantity'))['total']
            if stock_res is not None:
                return stock_res
        return obj.stock_quantity

    def get_is_low_stock(self, obj):
        stock = self.get_stock_quantity(obj)
        return stock <= obj.low_stock_threshold

    class Meta:
        list_serializer_class = ProductListSerializer
        model = Product
        fields = [
            'id',
            'category',
            'category_name',
            'brand',
            'model_name',
            'color',
            'storage_capacity',
            'barcode',
            'issues',
            'cost_price',
            'sale_price',
            'service_price',
            'commission',
            'price',          # backward-compat property
            'stock_quantity',
            'low_stock_threshold',
            'profit_per_unit',
            'is_low_stock',
        ]
        read_only_fields = ['company', 'stock_quantity']


class StockMovementSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.model_name', read_only=True)

    class Meta:
        model = StockMovement
        fields = ['id', 'product', 'product_name', 'quantity', 'movement_type', 'reference', 'notes', 'created_at']
        read_only_fields = ['company', 'created_at']


class VendorSerializer(serializers.ModelSerializer):
    """
    Vendor with aggregates computed live from VendorLedger entries.
    Ensures correctness even when stored fields are stale.
    """

    class Meta:
        model = Vendor
        fields = [
            'id', 'name', 'contact_email', 'contact_phone', 'address', 'crm_entity',
            'balance_due', 'total_purchases', 'total_paid',
            'created_at',
        ]
        read_only_fields = ['company', 'balance_due', 'total_purchases', 'total_paid']


class VendorLedgerSerializer(serializers.ModelSerializer):
    vendor_name = serializers.CharField(source='vendor.name', read_only=True)

    class Meta:
        model = VendorLedger
        fields = ['id', 'vendor', 'vendor_name', 'crm_entity', 'procurement_document', 'transaction_type', 'amount',
                  'reference', 'notes', 'created_at']
        read_only_fields = ['company', 'created_at']


class PurchaseOrderItemSerializer(serializers.ModelSerializer):
    product_name = serializers.SerializerMethodField()
    total_cost = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = PurchaseOrderItem
        fields = ['id', 'product', 'item', 'procurement_line', 'product_name', 'quantity', 'unit_cost', 'total_cost']
        read_only_fields = ['company']

    def get_product_name(self, obj):
        if obj.item:
            return obj.item.name
        return obj.product.model_name if obj.product else None


class PurchaseOrderSerializer(serializers.ModelSerializer):
    items = PurchaseOrderItemSerializer(many=True, read_only=True)
    vendor_name = serializers.CharField(source='vendor.name', read_only=True)

    class Meta:
        model = PurchaseOrder
        fields = ['id', 'vendor', 'vendor_name', 'crm_entity', 'procurement_document', 'status', 'total_amount', 'notes', 'items', 'created_at']
        read_only_fields = ['company', 'created_at']


class ItemFieldDefinitionSerializer(serializers.ModelSerializer):
    class Meta:
        from .models import ItemFieldDefinition
        model = ItemFieldDefinition
        fields = '__all__'
        read_only_fields = ['company', 'created_at', 'updated_at', 'is_deleted']

class ItemFieldValueSerializer(serializers.ModelSerializer):
    key = serializers.CharField(source='field_definition.key', read_only=True)
    
    class Meta:
        from .models import ItemFieldValue
        model = ItemFieldValue
        fields = ['id', 'field_definition', 'key', 'value']
        read_only_fields = ['company', 'created_at', 'updated_at', 'is_deleted']


class ItemSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    current_stock = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True, required=False)
    custom_fields = serializers.DictField(child=serializers.JSONField(), write_only=True, required=False)
    custom_attributes = serializers.SerializerMethodField(read_only=True)
    
    class Meta:
        model = Item
        fields = '__all__'
        read_only_fields = ['company', 'created_at', 'updated_at', 'is_deleted', 'current_stock']

    def get_custom_attributes(self, obj):
        if not hasattr(obj, 'custom_fields'):
            return {}
        values = obj.custom_fields.select_related('field_definition').all()
        return {v.field_definition.key: v.value for v in values}

    def _save_custom_fields(self, item, custom_fields_data, is_create=False):
        if custom_fields_data is None:
            if not is_create:
                return
            custom_fields_data = {}
            
        company = self.context['request'].user.company
        category = item.category
        
        from .models import ItemFieldDefinition, ItemFieldValue
        from django.db.models import Q
        import datetime
        
        defs = ItemFieldDefinition.objects.filter(
            company=company,
            active=True
        ).filter(Q(category=category) | Q(category__isnull=True))
        
        def_map = {d.key: d for d in defs}
        
        keys_to_process = def_map.keys() if is_create else custom_fields_data.keys()
        
        for key in keys_to_process:
            if key not in def_map:
                continue 
            
            field_def = def_map[key]
            val = custom_fields_data.get(key, None)
            
            if is_create and (val is None or val == ''):
                val = field_def.default_value
            
            if field_def.required and (val is None or val == '' or val == []):
                raise serializers.ValidationError({f"custom_fields.{key}": "This field is required."})
                
            if val is not None and val != '':
                if field_def.field_type in ['SELECT', 'MULTI_SELECT']:
                    options = field_def.options or []
                    if field_def.field_type == 'SELECT':
                        if val not in options:
                            raise serializers.ValidationError({f"custom_fields.{key}": "Invalid option selected."})
                    else: 
                        if not isinstance(val, list):
                            raise serializers.ValidationError({f"custom_fields.{key}": "Expected a list."})
                        for v in val:
                            if v not in options:
                                raise serializers.ValidationError({f"custom_fields.{key}": f"Invalid option: {v}"})
                if field_def.field_type == 'NUMBER':
                    try:
                        int(val)
                    except ValueError:
                        raise serializers.ValidationError({f"custom_fields.{key}": "Must be an integer."})
                if field_def.field_type == 'DECIMAL':
                    try:
                        float(val)
                    except ValueError:
                        raise serializers.ValidationError({f"custom_fields.{key}": "Must be a number."})
                if field_def.field_type == 'BOOLEAN':
                    if str(val).lower() not in ['true', 'false', '1', '0']:
                        if not isinstance(val, bool):
                            raise serializers.ValidationError({f"custom_fields.{key}": "Must be a boolean."})
                    if isinstance(val, str):
                        val = val.lower() in ['true', '1']
                if field_def.field_type == 'DATE':
                    try:
                        datetime.date.fromisoformat(str(val))
                    except ValueError:
                        raise serializers.ValidationError({f"custom_fields.{key}": "Invalid date format."})
                if field_def.field_type == 'DATETIME':
                    try:
                        datetime.datetime.fromisoformat(str(val).replace('Z', '+00:00'))
                    except ValueError:
                        raise serializers.ValidationError({f"custom_fields.{key}": "Invalid datetime format."})
            
            ItemFieldValue.objects.update_or_create(
                item=item,
                field_definition=field_def,
                defaults={'company': company, 'value': val}
            )

    def create(self, validated_data):
        custom_fields = validated_data.pop('custom_fields', None)
        item = super().create(validated_data)
        self._save_custom_fields(item, custom_fields, is_create=True)
        return item

    def update(self, instance, validated_data):
        custom_fields = validated_data.pop('custom_fields', None)
        item = super().update(instance, validated_data)
        self._save_custom_fields(item, custom_fields, is_create=False)
        return item


class InventoryBalanceSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.name', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    
    class Meta:
        model = InventoryBalance
        fields = '__all__'
        read_only_fields = ['company', 'created_at', 'updated_at', 'is_deleted']


class ItemSerialSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.name', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    
    class Meta:
        model = ItemSerial
        fields = '__all__'
        read_only_fields = ['company', 'created_at', 'updated_at', 'is_deleted']
