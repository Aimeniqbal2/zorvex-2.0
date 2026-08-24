"""
platform_core/admin.py
"""
from django.contrib import admin
from .models import ModuleDefinition, CompanyModule, Branch, Warehouse


@admin.register(ModuleDefinition)
class ModuleDefinitionAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'category', 'version', 'is_core', 'is_active')
    list_filter  = ('category', 'is_core', 'is_active')
    search_fields = ('code', 'name')
    ordering      = ('category', 'name')
    readonly_fields = ('id', 'created_at', 'updated_at')


@admin.register(CompanyModule)
class CompanyModuleAdmin(admin.ModelAdmin):
    list_display  = ('company', 'module', 'enabled', 'activated_at', 'deactivated_at')
    list_select_related = ('company', 'module')
    list_filter   = ('enabled', 'module__category')
    search_fields = ('company__name', 'module__code', 'module__name')
    readonly_fields = ('id', 'created_at', 'updated_at')
    autocomplete_fields = ['company', 'module']


@admin.register(Branch)
class BranchAdmin(admin.ModelAdmin):
    list_display  = ('company', 'name', 'code', 'phone', 'is_active')
    list_select_related = ('company',)
    list_filter   = ('is_active', 'company')
    search_fields = ('name', 'code', 'company__name')
    readonly_fields = ('id', 'created_at', 'updated_at')


@admin.register(Warehouse)
class WarehouseAdmin(admin.ModelAdmin):
    list_display  = ('company', 'name', 'code', 'branch', 'is_active')
    list_select_related = ('company', 'branch')
    list_filter   = ('is_active', 'company')
    search_fields = ('name', 'code', 'company__name')
    readonly_fields = ('id', 'created_at', 'updated_at')
