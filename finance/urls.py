from .views import (
    AccountGroupViewSet, ChartOfAccountViewSet, FiscalYearViewSet,
    AccountingPeriodViewSet, JournalViewSet, JournalEntryViewSet,
    JournalEntryLineViewSet, CurrencyViewSet, ExchangeRateViewSet,
    TaxGroupViewSet, TaxCodeViewSet, CostCenterViewSet,
    ProfitCenterViewSet, FinancialTagViewSet,
    SalesAccountingConfigurationViewSet,
    FinancialAttachmentViewSet, FinancialAuditTrailViewSet
)
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ExpenseViewSet, CreditAccountViewSet, LegacyJournalEntryViewSet

router = DefaultRouter()
router.register(r'expenses', ExpenseViewSet)
router.register(r'creditaccounts', CreditAccountViewSet)
router.register(r'journal', LegacyJournalEntryViewSet)


router.register(r'account-groups', AccountGroupViewSet, basename='accountgroup')
router.register(r'chart-of-accounts', ChartOfAccountViewSet, basename='chartofaccount')
router.register(r'fiscal-years', FiscalYearViewSet, basename='fiscalyear')
router.register(r'accounting-periods', AccountingPeriodViewSet, basename='accountingperiod')
router.register(r'journals', JournalViewSet, basename='journal')
router.register(r'journal-entries', JournalEntryViewSet, basename='journalentry')
router.register(r'journal-entry-lines', JournalEntryLineViewSet, basename='journalentryline')
router.register(r'currencies', CurrencyViewSet, basename='currency')
router.register(r'exchange-rates', ExchangeRateViewSet, basename='exchangerate')
router.register(r'tax-groups', TaxGroupViewSet, basename='taxgroup')
router.register(r'tax-codes', TaxCodeViewSet, basename='taxcode')
router.register(r'cost-centers', CostCenterViewSet, basename='costcenter')
router.register(r'profit-centers', ProfitCenterViewSet, basename='profitcenter')
router.register(r'financial-tags', FinancialTagViewSet, basename='financialtag')
router.register(r'sales-accounting-config', SalesAccountingConfigurationViewSet, basename='salesaccountingconfig')
from .views import BudgetViewSet, BudgetLineViewSet
router.register(r'budgets', BudgetViewSet, basename='budget')
router.register(r'budget-lines', BudgetLineViewSet, basename='budgetline')
router.register(r'attachments', FinancialAttachmentViewSet, basename='financialattachment')
router.register(r'audit-trails', FinancialAuditTrailViewSet, basename='financialaudittrail')

from .views import BankAccountViewSet, FinancialVoucherViewSet, ChequeViewSet, BankStatementViewSet, FinancialVoucherLineViewSet

router.register(r'bank-accounts', BankAccountViewSet, basename='bankaccount')
router.register(r'vouchers', FinancialVoucherViewSet, basename='financialvoucher')
router.register(r'voucher-lines', FinancialVoucherLineViewSet, basename='financialvoucherline')
router.register(r'cheques', ChequeViewSet, basename='cheque')
router.register(r'bank-statements', BankStatementViewSet, basename='bankstatement')

urlpatterns = [
    path('', include(router.urls)),
]
