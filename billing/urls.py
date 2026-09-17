from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ServiceInvoiceViewSet, ServiceInvoiceLineViewSet,
    ExtraDutyPayrollBridgeViewSet, BillingAccountingConfigurationViewSet,
    BillingPeriodViewSet, BillingSheetViewSet, ClientInvoiceViewSet,
    ClientReceiptViewSet, RecoveryActivityViewSet
)

router = DefaultRouter()
router.register(r'service-invoices', ServiceInvoiceViewSet, basename='serviceinvoice')
router.register(r'invoice-lines', ServiceInvoiceLineViewSet, basename='serviceinvoiceline')
router.register(r'payroll-bridges', ExtraDutyPayrollBridgeViewSet, basename='extradutybridge')
router.register(r'billing-config', BillingAccountingConfigurationViewSet, basename='billingconfig')
router.register(r'billing-periods', BillingPeriodViewSet, basename='billingperiod')
router.register(r'billing-sheets', BillingSheetViewSet, basename='billingsheet')
router.register(r'client-invoices', ClientInvoiceViewSet, basename='clientinvoice')
router.register(r'client-receipts', ClientReceiptViewSet, basename='clientreceipt')
router.register(r'recovery-activities', RecoveryActivityViewSet, basename='recoveryactivity')

urlpatterns = [
    path('', include(router.urls)),
]
