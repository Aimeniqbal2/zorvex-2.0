"""
platform_core/urls.py
"""
from django.urls import path
from .views import (
    ModuleCatalogueView,
    ModuleStateView,
    RuntimeConfigView,
    CompanyModuleListView,
    EnableModuleView,
    DisableModuleView,
    CompanyBusinessTypeView,
    BranchListCreateView,
    BranchDetailView,
    WarehouseListCreateView,
    WarehouseDetailView,
    ProvisionCompanyView,
    IndustryTemplateView,
    DashboardStatsView,
)

app_name = 'platform_core'

urlpatterns = [
    # Module catalogue (all available modules)
    path('modules/', ModuleCatalogueView.as_view(), name='module-catalogue'),

    # Module state map (frontend navigation helper)
    path('module-state/', ModuleStateView.as_view(), name='module-state'),
    path('runtime-config/', RuntimeConfigView.as_view(), name='runtime-config'),
    path('dashboard-stats/', DashboardStatsView.as_view(), name='dashboard-stats'),

    # Company-specific module management
    path('company-modules/', CompanyModuleListView.as_view(), name='company-module-list'),
    path('company-modules/enable/', EnableModuleView.as_view(), name='module-enable'),
    path('company-modules/disable/', DisableModuleView.as_view(), name='module-disable'),

    # Company business type
    path('business-type/', CompanyBusinessTypeView.as_view(), name='business-type'),

    # Branches
    path('branches/', BranchListCreateView.as_view(), name='branch-list-create'),
    path('branches/<uuid:pk>/', BranchDetailView.as_view(), name='branch-detail'),

    # Warehouses
    path('warehouses/', WarehouseListCreateView.as_view(), name='warehouse-list-create'),
    path('warehouses/<uuid:pk>/', WarehouseDetailView.as_view(), name='warehouse-detail'),

    # Provisioning
    path('companies/provision/', ProvisionCompanyView.as_view(), name='company-provision'),
    path('industry-template/', IndustryTemplateView.as_view(), name='industry-template'),
]
