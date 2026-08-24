from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views_subscriptions import ReportSubscriptionViewSet
from .views import (
    DashboardAPIView,
    ExportCSVAPIView,
    MonthlyAnalyticsAPIView,
    TrialBalanceAPIView,
    ProfitAndLossAPIView,
    BalanceSheetAPIView,
    GeneralLedgerAPIView,
    AccountLedgerAPIView,
    PayrollSummaryAPIView,
    WorkforceUtilizationAPIView,
    ContractProfitabilityAPIView,
    OperationsPerformanceAPIView,
    InventoryValuationAPIView,
    LowStockReportAPIView,
    VendorSpendAPIView,
    ProcurementCycleTimeAPIView,
    CustomerLifetimeValueAPIView,
    ARAgingAPIView,
    CustomerBalanceAPIView,
    CustomerStatementAPIView,
    ARReconciliationAPIView,
    ComparativeProfitAndLossAPIView,
    CashMovementAPIView,
    FinancialDrillDownAPIView,
    GeneratedReportCreateAPIView,
    GeneratedReportStatusAPIView,
    GeneratedReportDownloadAPIView,
)
from .views_analytics import (
    AnalyticsDashboardView,
    AnalyticsMetadataView,
    AnalyticsKPIView,
    AnalyticsTrendsView,
)
from .views import (
    TargetViewSet, 
    BudgetVsActualAPIView, 
    TargetPerformanceAPIView
)

from .views_builder import SavedReportViewSet, ReportBuilderMetadataView, ReportBuilderPreviewView

router = DefaultRouter()
router.register(r'subscriptions', ReportSubscriptionViewSet, basename='report-subscription')
router.register(r'targets', TargetViewSet, basename='target')
router.register(r'builder/saved', SavedReportViewSet, basename='saved-report')

urlpatterns = [
    path('', include(router.urls)),
    path('builder/metadata/', ReportBuilderMetadataView.as_view(), name='api-report-builder-metadata'),
    path('builder/preview/', ReportBuilderPreviewView.as_view(), name='api-report-builder-preview'),
    path('dashboard/', DashboardAPIView.as_view(), name='api-dashboard'),
    path('export/', ExportCSVAPIView.as_view(), name='api-export-csv'),
    path('monthly/', MonthlyAnalyticsAPIView.as_view(), name='api-monthly-analytics'),

    # Phase 8G-1: Advanced Analytics
    path('analytics/dashboard/', AnalyticsDashboardView.as_view(), name='api-analytics-dashboard'),
    path('analytics/metadata/', AnalyticsMetadataView.as_view(), name='api-analytics-metadata'),
    path('analytics/trends/', AnalyticsTrendsView.as_view(), name='api-analytics-trends'),
    path('analytics/kpis/<str:kpi_code>/', AnalyticsKPIView.as_view(), name='api-analytics-kpi'),
    path('analytics/budget-vs-actual/', BudgetVsActualAPIView.as_view(), name='api-analytics-budget-vs-actual'),
    path('analytics/target-performance/', TargetPerformanceAPIView.as_view(), name='api-analytics-target-performance'),

    # Financial Statements
    path('finance/general-ledger/', GeneralLedgerAPIView.as_view(), name='api-report-general-ledger'),
    path('finance/account-ledger/', AccountLedgerAPIView.as_view(), name='api-report-account-ledger'),
    path('finance/trial-balance/', TrialBalanceAPIView.as_view(), name='api-report-trial-balance'),
    path('finance/pnl/', ProfitAndLossAPIView.as_view(), name='api-report-pnl'),
    path('finance/comparative/', ComparativeProfitAndLossAPIView.as_view(), name='api-report-comparative'),
    path('finance/cash-movement/', CashMovementAPIView.as_view(), name='api-report-cash-movement'),
    path('finance/drill-down/', FinancialDrillDownAPIView.as_view(), name='api-report-drill-down'),
    path('finance/balance-sheet/', BalanceSheetAPIView.as_view(), name='api-report-balance-sheet'),

    # Accounts Receivable
    path('finance/ar-aging/', ARAgingAPIView.as_view(), name='api-report-ar-aging'),
    path('finance/customer-balances/', CustomerBalanceAPIView.as_view(), name='api-report-customer-balances'),
    path('finance/customer-statement/', CustomerStatementAPIView.as_view(), name='api-report-customer-statement'),
    path('finance/ar-reconciliation/', ARReconciliationAPIView.as_view(), name='api-report-ar-reconciliation'),

    # HR Analytics
    path('hr/payroll-summary/', PayrollSummaryAPIView.as_view(), name='api-report-payroll-summary'),
    path('hr/workforce-utilization/', WorkforceUtilizationAPIView.as_view(), name='api-report-workforce-utilization'),

    # Operations Analytics
    path('operations/contract-profitability/', ContractProfitabilityAPIView.as_view(), name='api-report-contract-profitability'),
    path('operations/performance/', OperationsPerformanceAPIView.as_view(), name='api-report-operations-performance'),

    # Inventory Analytics
    path('inventory/valuation/', InventoryValuationAPIView.as_view(), name='api-report-inventory-valuation'),
    path('inventory/low-stock/', LowStockReportAPIView.as_view(), name='api-report-low-stock'),

    # Purchasing Analytics
    path('purchasing/vendor-spend/', VendorSpendAPIView.as_view(), name='api-report-vendor-spend'),
    path('purchasing/cycle-time/', ProcurementCycleTimeAPIView.as_view(), name='api-report-cycle-time'),

    # CRM Analytics
    path('crm/customer-ltv/', CustomerLifetimeValueAPIView.as_view(), name='api-report-customer-ltv'),
    
    # Async Generated Reports (Phase 8F-C2)
    path('generated/', GeneratedReportCreateAPIView.as_view(), name='api-report-generated-create'),
    path('generated/<uuid:pk>/', GeneratedReportStatusAPIView.as_view(), name='api-report-generated-status'),
    path('generated/<uuid:pk>/download/', GeneratedReportDownloadAPIView.as_view(), name='api-report-generated-download'),
]
