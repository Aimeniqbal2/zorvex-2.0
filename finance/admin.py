from django.contrib import admin
from .models import (
    Expense, CreditAccount, LegacyJournalEntry,
    AccountGroup, ChartOfAccount, FiscalYear, AccountingPeriod,
    Journal, JournalEntry, JournalEntryLine, Currency, ExchangeRate,
    TaxGroup, TaxCode, CostCenter, ProfitCenter, FinancialTag,
    SalesAccountingConfiguration
)

@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = ('title', 'amount', 'category', 'date', 'company')
    list_filter = ('category', 'date', 'company')
    search_fields = ('title', 'notes')
    readonly_fields = ('id', 'company', 'created_at', 'updated_at')
    list_select_related = ('company',)

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
