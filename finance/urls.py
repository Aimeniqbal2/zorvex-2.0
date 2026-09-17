from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    ExpenseViewSet, ExpenseCategoryViewSet, EmployeeAdvanceViewSet, PettyCashViewSet,
    CreditAccountViewSet, LegacyJournalEntryViewSet,
    AccountGroupViewSet, ChartOfAccountViewSet, FiscalYearViewSet,
    AccountingPeriodViewSet, JournalViewSet, JournalEntryViewSet,
    JournalEntryLineViewSet, CurrencyViewSet, ExchangeRateViewSet,
    TaxGroupViewSet, TaxCodeViewSet, CostCenterViewSet,
    ProfitCenterViewSet, FinancialTagViewSet,
    SalesAccountingConfigurationViewSet, BudgetViewSet, BudgetLineViewSet,
    FinancialAttachmentViewSet, FinancialAuditTrailViewSet,
    BankAccountViewSet, FinancialVoucherViewSet, FinancialVoucherLineViewSet,
    ChequeViewSet, BankStatementViewSet, SecurityFinanceConfigurationViewSet,
    TreasuryTransactionViewSet,
    PurchasingItemAccountMappingViewSet, PurchasingAccountingIntegrationViewSet,
    PayrollAccountMappingViewSet, EmployeePaymentDestinationViewSet,
    PayrollAccountingIntegrationViewSet, SalaryPaymentBatchViewSet,
    PayrollDisbursementProviderConfigViewSet,
    TaxAuthorityViewSet, CompanyTaxProfileViewSet, TaxPeriodViewSet,
    TaxTransactionViewSet, ClientWithholdingCertificateViewSet,
    VendorWithholdingRecordViewSet, TaxPaymentVoucherViewSet, TaxAdjustmentViewSet,
    GeneralLedgerViewSet, AllocationProfileViewSet, FinancialStatementsViewSet, ProfitabilityViewSet,
    CashCountViewSet, SubledgerReconciliationViewSet, ControlExceptionViewSet, YearEndClosingViewSet,
    ExecutiveFinanceDashboardViewSet
)

router = DefaultRouter()
router.register(r'executive-dashboard', ExecutiveFinanceDashboardViewSet, basename='executivedashboard')
router.register(r'period-close-controls', SubledgerReconciliationViewSet, basename='subledgerreconciliation')
router.register(r'cash-counts', CashCountViewSet, basename='cashcount')
router.register(r'control-exceptions', ControlExceptionViewSet, basename='controlexception')
router.register(r'year-end-closing', YearEndClosingViewSet, basename='yearendclosing')
router.register(r'financial-statements', FinancialStatementsViewSet, basename='financialstatements')
router.register(r'profitability', ProfitabilityViewSet, basename='profitability')
router.register(r'allocation-profiles', AllocationProfileViewSet, basename='allocationprofile')
router.register(r'general-ledger', GeneralLedgerViewSet, basename='generalledger')
router.register(r'tax-authorities', TaxAuthorityViewSet, basename='taxauthority')
router.register(r'company-tax-profile', CompanyTaxProfileViewSet, basename='companytaxprofile')
router.register(r'tax-periods', TaxPeriodViewSet, basename='taxperiod')
router.register(r'tax-transactions', TaxTransactionViewSet, basename='taxtransaction')
router.register(r'client-withholding-certificates', ClientWithholdingCertificateViewSet, basename='clientwithholdingcertificate')
router.register(r'vendor-withholding-records', VendorWithholdingRecordViewSet, basename='vendorwithholdingrecord')
router.register(r'tax-payment-vouchers', TaxPaymentVoucherViewSet, basename='taxpaymentvoucher')
router.register(r'tax-adjustments', TaxAdjustmentViewSet, basename='taxadjustment')

router.register(r'payroll-account-mappings', PayrollAccountMappingViewSet, basename='payrollaccountmapping')
router.register(r'employee-payment-destinations', EmployeePaymentDestinationViewSet, basename='employeepaymentdestination')
router.register(r'payroll-integrations', PayrollAccountingIntegrationViewSet, basename='payrollintegration')
router.register(r'salary-payment-batches', SalaryPaymentBatchViewSet, basename='salarypaymentbatch')
router.register(r'payroll-provider-configs', PayrollDisbursementProviderConfigViewSet, basename='payrollproviderconfig')
router.register(r'purchasing-mappings', PurchasingItemAccountMappingViewSet, basename='purchasingmapping')
router.register(r'purchasing-integrations', PurchasingAccountingIntegrationViewSet, basename='purchasingintegration')
router.register(r'expense-categories', ExpenseCategoryViewSet, basename='expensecategory')
router.register(r'expenses', ExpenseViewSet, basename='expense')
router.register(r'employee-advances', EmployeeAdvanceViewSet, basename='employeeadvance')
router.register(r'petty-cash', PettyCashViewSet, basename='pettycash')
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
router.register(r'budgets', BudgetViewSet, basename='budget')
router.register(r'budget-lines', BudgetLineViewSet, basename='budgetline')
router.register(r'attachments', FinancialAttachmentViewSet, basename='financialattachment')
router.register(r'audit-trails', FinancialAuditTrailViewSet, basename='financialaudittrail')

router.register(r'bank-accounts', BankAccountViewSet, basename='bankaccount')
router.register(r'vouchers', FinancialVoucherViewSet, basename='financialvoucher')
router.register(r'financial-vouchers', FinancialVoucherViewSet, basename='financialvoucher_alt')
router.register(r'treasury-transactions', TreasuryTransactionViewSet, basename='treasurytransaction')
router.register(r'voucher-lines', FinancialVoucherLineViewSet, basename='financialvoucherline')
router.register(r'cheques', ChequeViewSet, basename='cheque')
router.register(r'bank-statements', BankStatementViewSet, basename='bankstatement')
router.register(r'security-finance-config', SecurityFinanceConfigurationViewSet, basename='securityfinanceconfig')

urlpatterns = [
    path('', include(router.urls)),
]
