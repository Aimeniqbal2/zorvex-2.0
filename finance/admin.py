from django.contrib import admin
from .models import (
    Expense, ExpenseCategory, EmployeeAdvance, ExpenseAllocation, PettyCashCustodian,
    CreditAccount, LegacyJournalEntry,
    AccountGroup, ChartOfAccount, FiscalYear, AccountingPeriod,
    Journal, JournalEntry, JournalEntryLine, Currency, ExchangeRate,
    TaxGroup, TaxCode, CostCenter, ProfitCenter, FinancialTag,
    SalesAccountingConfiguration
)

@admin.register(ExpenseCategory)
class ExpenseCategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'code', 'default_expense_account', 'is_active', 'company')
    list_filter = ('is_active', 'company')
    search_fields = ('name', 'code')
    readonly_fields = ('id', 'company', 'created_at', 'updated_at')

@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = ('expense_number', 'title', 'expense_type', 'total_amount', 'category', 'expense_date', 'status', 'payment_status', 'company')
    list_filter = ('expense_type', 'status', 'payment_status', 'expense_date', 'company')
    search_fields = ('expense_number', 'title', 'payee', 'notes')
    readonly_fields = ('id', 'company', 'expense_number', 'created_at', 'updated_at')
    list_select_related = ('company', 'category', 'bank_account', 'expense_account')

@admin.register(EmployeeAdvance)
class EmployeeAdvanceAdmin(admin.ModelAdmin):
    list_display = ('advance_number', 'employee', 'advance_type', 'amount', 'outstanding_balance', 'advance_date', 'status', 'company')
    list_filter = ('advance_type', 'status', 'advance_date', 'company')
    search_fields = ('advance_number', 'purpose')
    readonly_fields = ('id', 'company', 'advance_number', 'created_at', 'updated_at')

@admin.register(ExpenseAllocation)
class ExpenseAllocationAdmin(admin.ModelAdmin):
    list_display = ('expense', 'amount', 'cost_center', 'site', 'company')
    search_fields = ('expense__expense_number', 'description')

@admin.register(PettyCashCustodian)
class PettyCashCustodianAdmin(admin.ModelAdmin):
    list_display = ('bank_account', 'custodian', 'float_limit', 'replenishment_threshold', 'is_active', 'company')

@admin.register(CreditAccount)
class CreditAccountAdmin(admin.ModelAdmin):
    list_display = ('customer_name', 'customer_phone', 'crm_architecture_state', 'balance_due', 'company')
    list_select_related = ('company', 'crm_entity')
    search_fields = ('customer_name', 'customer_phone')
    readonly_fields = ('id', 'company', 'created_at', 'updated_at')
    autocomplete_fields = ('crm_entity',)

    def crm_architecture_state(self, obj):
        from crm.services.compatibility import get_architecture_state
        return get_architecture_state(obj)
    crm_architecture_state.short_description = "CRM Architecture"

@admin.register(LegacyJournalEntry)
class LegacyJournalEntryAdmin(admin.ModelAdmin):
    list_display = ('entry_type', 'amount', 'profit', 'reference', 'date', 'company')
    list_filter = ('entry_type', 'date', 'company')
    search_fields = ('reference', 'description')
    readonly_fields = ('id', 'company', 'created_at', 'updated_at')
    list_select_related = ('company',)

@admin.register(AccountGroup)
class AccountGroupAdmin(admin.ModelAdmin):
    list_display = ('name', 'group_type', 'parent', 'company')
    list_filter = ('group_type', 'company')
    search_fields = ('name',)
    readonly_fields = ('id', 'company', 'created_at', 'updated_at')
    list_select_related = ('company', 'parent')
    autocomplete_fields = ('parent',)

@admin.register(ChartOfAccount)
class ChartOfAccountAdmin(admin.ModelAdmin):
    list_display = ('account_code', 'account_name', 'account_type', 'account_group', 'current_balance', 'company')
    list_filter = ('account_type', 'is_active', 'company')
    search_fields = ('account_code', 'account_name')
    readonly_fields = ('id', 'company', 'created_at', 'updated_at', 'current_balance')
    list_select_related = ('company', 'account_group', 'currency')
    autocomplete_fields = ('account_group', 'currency')

@admin.register(FiscalYear)
class FiscalYearAdmin(admin.ModelAdmin):
    list_display = ('name', 'start_date', 'end_date', 'is_current', 'is_closed', 'company')
    list_filter = ('is_current', 'is_closed', 'company')
    search_fields = ('name',)
    readonly_fields = ('id', 'company', 'created_at', 'updated_at')
    list_select_related = ('company',)

@admin.register(AccountingPeriod)
class AccountingPeriodAdmin(admin.ModelAdmin):
    list_display = ('month', 'fiscal_year', 'status', 'start_date', 'end_date', 'company')
    list_filter = ('status', 'company')
    search_fields = ('fiscal_year__name',)
    readonly_fields = ('id', 'company', 'created_at', 'updated_at')
    list_select_related = ('company', 'fiscal_year')
    autocomplete_fields = ('fiscal_year',)

@admin.register(Journal)
class JournalAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'journal_type', 'company')
    list_filter = ('journal_type', 'company')
    search_fields = ('code', 'name')
    readonly_fields = ('id', 'company', 'created_at', 'updated_at')
    list_select_related = ('company',)

class JournalEntryLineInline(admin.TabularInline):
    model = JournalEntryLine
    extra = 0
    autocomplete_fields = ('account', 'currency', 'cost_center', 'profit_center', 'crm_entity')
    readonly_fields = ('id', 'company', 'created_at', 'updated_at')

@admin.register(JournalEntry)
class JournalEntryAdmin(admin.ModelAdmin):
    list_display = ('entry_number', 'journal', 'entry_date', 'status', 'company')
    list_filter = ('status', 'entry_date', 'company')
    search_fields = ('entry_number', 'reference', 'description')
    readonly_fields = ('id', 'company', 'created_at', 'updated_at', 'approved_at', 'posted_at', 'created_by', 'approved_by')
    list_select_related = ('company', 'journal', 'created_by', 'approved_by')
    autocomplete_fields = ('journal', 'created_by', 'approved_by')
    date_hierarchy = 'entry_date'
    inlines = [JournalEntryLineInline]

@admin.register(JournalEntryLine)
class JournalEntryLineAdmin(admin.ModelAdmin):
    list_display = ('journal_entry', 'account', 'debit', 'credit', 'cost_center', 'company')
    list_filter = ('company',)
    search_fields = ('description', 'journal_entry__entry_number', 'account__account_code')
    readonly_fields = ('id', 'company', 'created_at', 'updated_at')
    list_select_related = ('company', 'journal_entry', 'account', 'cost_center', 'profit_center', 'currency', 'crm_entity')
    autocomplete_fields = ('journal_entry', 'account', 'cost_center', 'profit_center', 'currency', 'crm_entity')

@admin.register(Currency)
class CurrencyAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'is_base_currency', 'company')
    list_filter = ('is_base_currency', 'company')
    search_fields = ('code', 'name')
    readonly_fields = ('id', 'company', 'created_at', 'updated_at')
    list_select_related = ('company',)

@admin.register(ExchangeRate)
class ExchangeRateAdmin(admin.ModelAdmin):
    list_display = ('from_currency', 'to_currency', 'rate', 'effective_date', 'company')
    list_filter = ('effective_date', 'company')
    search_fields = ('from_currency__code', 'to_currency__code')
    readonly_fields = ('id', 'company', 'created_at', 'updated_at')
    list_select_related = ('company', 'from_currency', 'to_currency')
    autocomplete_fields = ('from_currency', 'to_currency')

@admin.register(TaxGroup)
class TaxGroupAdmin(admin.ModelAdmin):
    list_display = ('name', 'company')
    list_filter = ('company',)
    search_fields = ('name',)
    readonly_fields = ('id', 'company', 'created_at', 'updated_at')
    list_select_related = ('company',)

@admin.register(TaxCode)
class TaxCodeAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'rate', 'tax_type', 'tax_group', 'company')
    list_filter = ('tax_type', 'company')
    search_fields = ('code', 'name')
    readonly_fields = ('id', 'company', 'created_at', 'updated_at')
    list_select_related = ('company', 'tax_group')
    autocomplete_fields = ('tax_group',)

@admin.register(CostCenter)
class CostCenterAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'parent', 'company')
    list_filter = ('company',)
    search_fields = ('code', 'name')
    readonly_fields = ('id', 'company', 'created_at', 'updated_at')
    list_select_related = ('company', 'parent')
    autocomplete_fields = ('parent',)

@admin.register(ProfitCenter)
class ProfitCenterAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'parent', 'company')
    list_filter = ('company',)
    search_fields = ('code', 'name')
    readonly_fields = ('id', 'company', 'created_at', 'updated_at')
    list_select_related = ('company', 'parent')
    autocomplete_fields = ('parent',)

@admin.register(FinancialTag)
class FinancialTagAdmin(admin.ModelAdmin):
    list_display = ('name', 'color', 'company')
    list_filter = ('company',)
    search_fields = ('name',)
    readonly_fields = ('id', 'company', 'created_at', 'updated_at')
    list_select_related = ('company',)

@admin.register(SalesAccountingConfiguration)
class SalesAccountingConfigurationAdmin(admin.ModelAdmin):
    list_display = ('company', 'is_active', 'default_currency')
    list_filter = ('is_active', 'company')
    search_fields = ('company__name',)
    readonly_fields = ('id', 'company', 'created_at', 'updated_at')
    list_select_related = ('company', 'default_currency')
    autocomplete_fields = (
        'sales_revenue_account', 'accounts_receivable_account', 'cash_account', 
        'bank_account', 'sales_discount_account', 'sales_return_account', 
        'sales_tax_account', 'rounding_account', 'default_currency'
    )


from .models import BankAccount, SecurityFinanceConfiguration

@admin.register(BankAccount)
class BankAccountAdmin(admin.ModelAdmin):
    list_display = ('account_title', 'account_type', 'bank_name', 'account_number', 'chart_of_account', 'is_active', 'company')
    list_filter = ('account_type', 'is_active', 'company')
    search_fields = ('account_title', 'bank_name', 'account_number', 'iban')
    readonly_fields = ('id', 'company', 'created_at', 'updated_at', 'current_balance')
    list_select_related = ('company', 'chart_of_account', 'currency')
    autocomplete_fields = ('chart_of_account', 'currency')


@admin.register(SecurityFinanceConfiguration)
class SecurityFinanceConfigurationAdmin(admin.ModelAdmin):
    list_display = ('company', 'is_active', 'default_currency', 'default_bank_account')
    list_filter = ('is_active', 'company')
    search_fields = ('company__name',)
    readonly_fields = ('id', 'company', 'created_at', 'updated_at')
    list_select_related = ('company', 'default_bank_account', 'default_currency')
    autocomplete_fields = (
        'accounts_receivable_account', 'accounts_payable_account', 'payroll_payable_account',
        'tax_payable_account', 'security_service_revenue_account', 'overtime_revenue_account',
        'extra_duty_revenue_account', 'salary_cost_account', 'overtime_cost_account',
        'inventory_equipment_account', 'default_bank_account', 'default_currency'
    )


from .models import PurchasingItemAccountMapping, PurchasingAccountingIntegration, PurchasingAccountingLinePreview


@admin.register(PurchasingItemAccountMapping)
class PurchasingItemAccountMappingAdmin(admin.ModelAdmin):
    list_display = ('id', 'company', 'item', 'item_category', 'expense_category', 'account_classification', 'debit_account', 'is_active')
    list_filter = ('account_classification', 'is_active', 'company')
    search_fields = ('item__name', 'item_category__name', 'expense_category__name', 'debit_account__account_name')
    readonly_fields = ('id', 'created_at', 'updated_at')


class PurchasingAccountingLinePreviewInline(admin.TabularInline):
    model = PurchasingAccountingLinePreview
    extra = 0
    readonly_fields = ('line_number', 'item_name', 'item_type', 'amount', 'debit_account', 'credit_account', 'is_tax_line', 'is_unresolved', 'unresolved_reason')


@admin.register(PurchasingAccountingIntegration)
class PurchasingAccountingIntegrationAdmin(admin.ModelAdmin):
    list_display = ('source_number', 'source_type', 'transaction_date', 'vendor', 'amount', 'currency_code', 'status', 'company')
    list_filter = ('source_type', 'status', 'company')
    search_fields = ('source_number', 'vendor__name', 'blocking_reason')
    readonly_fields = ('id', 'created_at', 'updated_at')
    inlines = [PurchasingAccountingLinePreviewInline]


# ============================================================================
# PHASE S-4G: PAYROLL -> FINANCE INTEGRATION & SALARY DISBURSEMENT ADMIN
# ============================================================================

from .models import (
    PayrollAccountingIntegration, PayrollEmployeeFinanceSnapshot, PayrollAccountMapping,
    EmployeePaymentDestination, SalaryPaymentBatch, SalaryPaymentBatchLine, PayrollDisbursementProviderConfig
)


@admin.register(PayrollAccountMapping)
class PayrollAccountMappingAdmin(admin.ModelAdmin):
    list_display = ('id', 'company', 'employee', 'designation', 'department', 'classification_type', 'salary_expense_account', 'is_active')
    list_filter = ('classification_type', 'is_active', 'company')
    search_fields = ('employee__first_name', 'employee__last_name', 'designation__name', 'department__name')
    readonly_fields = ('id', 'created_at', 'updated_at')


@admin.register(EmployeePaymentDestination)
class EmployeePaymentDestinationAdmin(admin.ModelAdmin):
    list_display = ('id', 'company', 'employee', 'payment_method', 'bank_name', 'account_number', 'wallet_provider', 'wallet_number', 'is_preferred', 'is_active')
    list_filter = ('payment_method', 'wallet_provider', 'is_preferred', 'is_active', 'company')
    search_fields = ('employee__first_name', 'employee__last_name', 'account_number', 'iban', 'wallet_number')
    readonly_fields = ('id', 'created_at', 'updated_at')


class PayrollEmployeeFinanceSnapshotInline(admin.TabularInline):
    model = PayrollEmployeeFinanceSnapshot
    extra = 0
    readonly_fields = ('employee', 'payslip', 'gross_earnings', 'overtime_pay', 'advance_recovery', 'tax_amount', 'net_salary', 'salary_expense_account', 'payment_status', 'is_unresolved')


@admin.register(PayrollAccountingIntegration)
class PayrollAccountingIntegrationAdmin(admin.ModelAdmin):
    list_display = ('payroll_period_name', 'payroll_run', 'transaction_date', 'gross_payroll', 'net_payroll_payable', 'total_paid', 'remaining_liability', 'status', 'company')
    list_filter = ('status', 'company')
    search_fields = ('payroll_run__run_number', 'payroll_period_name', 'blocking_reason')
    readonly_fields = ('id', 'created_at', 'updated_at')
    inlines = [PayrollEmployeeFinanceSnapshotInline]


class SalaryPaymentBatchLineInline(admin.TabularInline):
    model = SalaryPaymentBatchLine
    extra = 0
    readonly_fields = ('employee', 'payslip', 'net_salary', 'payment_method', 'payment_reference', 'status', 'failure_code', 'failure_reason')


@admin.register(SalaryPaymentBatch)
class SalaryPaymentBatchAdmin(admin.ModelAdmin):
    list_display = ('batch_number', 'payment_date', 'payment_mode', 'payment_provider', 'treasury_account', 'total_employees', 'total_amount', 'successful_amount', 'failed_amount', 'status', 'company')
    list_filter = ('payment_mode', 'payment_provider', 'status', 'company')
    search_fields = ('batch_number', 'reference', 'notes')
    readonly_fields = ('id', 'created_at', 'updated_at')
    inlines = [SalaryPaymentBatchLineInline]


@admin.register(PayrollDisbursementProviderConfig)
class PayrollDisbursementProviderConfigAdmin(admin.ModelAdmin):
    list_display = ('provider', 'mode', 'file_adapter', 'api_enabled', 'is_active', 'company')
    list_filter = ('mode', 'file_adapter', 'api_enabled', 'is_active', 'company')
    search_fields = ('provider', 'corporate_id', 'account_number')
    readonly_fields = ('id', 'created_at', 'updated_at')


# ============================================================================
# PHASE S-4H: TAX MANAGEMENT ADMIN
# ============================================================================

from .models import (
    TaxAuthority, CompanyTaxProfile, TaxPeriod, TaxTransaction,
    ClientWithholdingCertificate, VendorWithholdingRecord, TaxPaymentVoucher, TaxAdjustment
)


@admin.register(TaxAuthority)
class TaxAuthorityAdmin(admin.ModelAdmin):
    list_display = ('name', 'code', 'jurisdiction', 'registration_number', 'is_active', 'company')
    list_filter = ('jurisdiction', 'is_active', 'company')
    search_fields = ('name', 'code', 'registration_number')
    readonly_fields = ('id', 'created_at', 'updated_at')


@admin.register(CompanyTaxProfile)
class CompanyTaxProfileAdmin(admin.ModelAdmin):
    list_display = ('company', 'ntn_number', 'strn_number', 'tax_status', 'default_jurisdiction', 'is_active')
    list_filter = ('tax_status', 'is_active', 'company')
    search_fields = ('ntn_number', 'strn_number', 'company__name')
    readonly_fields = ('id', 'created_at', 'updated_at')


@admin.register(TaxPeriod)
class TaxPeriodAdmin(admin.ModelAdmin):
    list_display = ('name', 'period_type', 'period_start', 'period_end', 'tax_category', 'tax_authority', 'status', 'company')
    list_filter = ('period_type', 'tax_category', 'status', 'company')
    search_fields = ('name', 'acknowledgement_reference')
    readonly_fields = ('id', 'created_at', 'updated_at')


@admin.register(TaxTransaction)
class TaxTransactionAdmin(admin.ModelAdmin):
    list_display = ('source_number', 'source_type', 'tax_category', 'tax_code', 'tax_date', 'taxable_amount', 'tax_amount', 'direction', 'status', 'company')
    list_filter = ('tax_category', 'source_type', 'direction', 'status', 'company')
    search_fields = ('source_number', 'counterparty_name', 'counterparty_tax_id')
    readonly_fields = ('id', 'created_at', 'updated_at')


@admin.register(ClientWithholdingCertificate)
class ClientWithholdingCertificateAdmin(admin.ModelAdmin):
    list_display = ('certificate_number', 'client', 'certificate_date', 'withheld_amount', 'verification_status', 'cpr_challan_no', 'company')
    list_filter = ('verification_status', 'company')
    search_fields = ('certificate_number', 'client__name', 'cpr_challan_no')
    readonly_fields = ('id', 'created_at', 'updated_at')


@admin.register(VendorWithholdingRecord)
class VendorWithholdingRecordAdmin(admin.ModelAdmin):
    list_display = ('vendor', 'withheld_date', 'taxable_amount', 'tax_rate', 'withheld_amount', 'status', 'cpr_number', 'company')
    list_filter = ('status', 'company')
    search_fields = ('vendor__name', 'cpr_number', 'certificate_number')
    readonly_fields = ('id', 'created_at', 'updated_at')


@admin.register(TaxPaymentVoucher)
class TaxPaymentVoucherAdmin(admin.ModelAdmin):
    list_display = ('voucher_number', 'tax_authority', 'tax_type', 'amount', 'payment_date', 'treasury_account', 'status', 'company')
    list_filter = ('tax_type', 'status', 'company')
    search_fields = ('voucher_number', 'challan_number', 'psid_number', 'cpr_number')
    readonly_fields = ('id', 'created_at', 'updated_at')


@admin.register(TaxAdjustment)
class TaxAdjustmentAdmin(admin.ModelAdmin):
    list_display = ('adjustment_number', 'tax_code', 'adjustment_type', 'amount', 'tax_date', 'status', 'company')
    list_filter = ('adjustment_type', 'status', 'company')
    search_fields = ('adjustment_number', 'reason')
    readonly_fields = ('id', 'created_at', 'updated_at')
