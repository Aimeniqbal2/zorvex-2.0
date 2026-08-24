"""
platform_core/serializers.py
"""
from rest_framework import serializers
from .models import ModuleDefinition, CompanyModule, Branch, Warehouse, BusinessType



# ---------------------------------------------------------------------------
# Module serializers
# ---------------------------------------------------------------------------
class ModuleDefinitionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ModuleDefinition
        fields = [
            'id', 'code', 'name', 'description', 'category',
            'version', 'icon', 'is_core', 'is_active', 'config_schema',
        ]
        read_only_fields = ['id']


class CompanyModuleSerializer(serializers.ModelSerializer):
    module_code = serializers.CharField(source='module.code', read_only=True)
    module_name = serializers.CharField(source='module.name', read_only=True)
    module_category = serializers.CharField(source='module.category', read_only=True)
    module_icon = serializers.CharField(source='module.icon', read_only=True)
    is_core = serializers.BooleanField(source='module.is_core', read_only=True)

    class Meta:
        model = CompanyModule
        fields = [
            'id', 'company', 'module', 'module_code', 'module_name',
            'module_category', 'module_icon', 'is_core',
            'enabled', 'configuration', 'activated_at', 'deactivated_at',
        ]
        read_only_fields = ['id', 'company', 'activated_at', 'deactivated_at']


class EnableModuleSerializer(serializers.Serializer):
    module_code = serializers.CharField(max_length=60)


class DisableModuleSerializer(serializers.Serializer):
    module_code = serializers.CharField(max_length=60)


# ---------------------------------------------------------------------------
# Branch serializer
# ---------------------------------------------------------------------------
class BranchSerializer(serializers.ModelSerializer):
    manager_name = serializers.SerializerMethodField()

    class Meta:
        model = Branch
        fields = [
            'id', 'company', 'name', 'code', 'address', 'phone',
            'email', 'manager', 'manager_name', 'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'company', 'created_at', 'updated_at']

    def get_manager_name(self, obj):
        if obj.manager_id:
            return str(obj.manager)
        return None


# ---------------------------------------------------------------------------
# Warehouse serializer
# ---------------------------------------------------------------------------
class WarehouseSerializer(serializers.ModelSerializer):
    branch_name = serializers.CharField(source='branch.name', read_only=True)

    class Meta:
        model = Warehouse
        fields = [
            'id', 'company', 'branch', 'branch_name', 'name', 'code',
            'address', 'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'company', 'created_at', 'updated_at']


# ---------------------------------------------------------------------------
# BusinessType serializer (simple choices list)
# ---------------------------------------------------------------------------
class BusinessTypeSerializer(serializers.Serializer):
    business_type = serializers.ChoiceField(
        choices=BusinessType.choices,
        help_text='The business vertical for this company.'
    )
