"""
billing/urls.py — Phase 8C
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ServiceInvoiceViewSet, ServiceInvoiceLineViewSet,
    ExtraDutyPayrollBridgeViewSet, BillingAccountingConfigurationViewSet
)

router = DefaultRouter()
router.register(r'service-invoices', ServiceInvoiceViewSet, basename='serviceinvoice')
router.register(r'invoice-lines', ServiceInvoiceLineViewSet, basename='serviceinvoiceline')
router.register(r'payroll-bridges', ExtraDutyPayrollBridgeViewSet, basename='extradutybridge')
router.register(r'billing-config', BillingAccountingConfigurationViewSet, basename='billingconfig')

urlpatterns = [
    path('', include(router.urls)),
]
