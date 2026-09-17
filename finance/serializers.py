from decimal import Decimal
from django.db import models
from rest_framework import serializers
from .models import (
    AccountGroup, ChartOfAccount, FiscalYear, AccountingPeriod,
    Journal, JournalEntry, JournalEntryLine, Currency, ExchangeRate,
    TaxGroup, TaxCode, CostCenter, ProfitCenter, FinancialTag, LegacyJournalEntry, Expense, CreditAccount,
    FinancialAttachment, FinancialAuditTrail,
    BankAccount, FinancialVoucher, FinancialVoucherLine, Cheque, BankStatement, BankStatementLine,
    TreasuryTransaction, ExpenseCategory, EmployeeAdvance, ExpenseAllocation, PettyCashCustodian,
    PurchasingItemAccountMapping, PurchasingAccountingIntegration, PurchasingAccountingLinePreview,
    PayrollAccountingIntegration, PayrollEmployeeFinanceSnapshot, PayrollAccountMapping,
    EmployeePaymentDestination, SalaryPaymentBatch, SalaryPaymentBatchLine, PayrollDisbursementProviderConfig,
    TaxAuthority, CompanyTaxProfile, TaxPeriod, TaxTransaction,
    ClientWithholdingCertificate, VendorWithholdingRecord, TaxPaymentVoucher, TaxAdjustment,
    AllocationProfile, CashCount, SubledgerReconciliationSnapshot, ControlException
)

class BaseTenantSerializer(serializers.ModelSerializer):
    company = serializers.PrimaryKeyRelatedField(read_only=True)

    def validate(self, attrs):
        request = self.context.get('request')
        company_id = getattr(request, 'user', None) and getattr(request.user, 'company_id', None)
        if hasattr(request, 'META') and request.META.get('HTTP_X_COMPANY_ID'):
            company_id = request.META.get('HTTP_X_COMPANY_ID')
        
        if not company_id:
            return attrs
            
        for field_name, value in attrs.items():
            if value and isinstance(value, models.Model) and hasattr(value, 'company_id'):
                if str(getattr(value, 'company_id')) != str(company_id):
                    raise serializers.ValidationError({
                        field_name: f"{value.__class__.__name__} must belong to your company."
                    })
        return attrs

class AccountGroupSerializer(BaseTenantSerializer):
    class Meta:
        model = AccountGroup
        fields = '__all__'

class ChartOfAccountSerializer(BaseTenantSerializer):
    parent_code = serializers.CharField(source='parent.account_code', read_only=True)
    parent_name = serializers.CharField(source='parent.account_name', read_only=True)
    children_count = serializers.SerializerMethodField()

    class Meta:
        model = ChartOfAccount
        fields = '__all__'
        read_only_fields = ['current_balance']

    def to_internal_value(self, data):
        if 'account_type' in data and data['account_type']:
            val = str(data['account_type']).upper().replace(' ', '_')
            mapping = {
                'ASSET': 'ASSET',
                'LIABILITY': 'LIABILITY',
                'EQUITY': 'EQUITY',
                'REVENUE': 'REVENUE',
                'INCOME': 'REVENUE',
                'COST_OF_SERVICE': 'COST_OF_SERVICE',
                'COGS': 'COST_OF_SERVICE',
                'COST_OF_SALES': 'COST_OF_SERVICE',
                'EXPENSE': 'EXPENSE',
                'OTHER_INCOME': 'OTHER_INCOME',
                'OTHER_EXPENSE': 'OTHER_EXPENSE'
            }
            if val in mapping:
                data = data.copy() if hasattr(data, 'copy') else dict(data)
                data['account_type'] = mapping[val]
        return super().to_internal_value(data)

    def get_children_count(self, obj):
        if hasattr(obj, 'children'):
            return obj.children.filter(is_deleted=False).count()
        return 0

    def validate_account_type(self, value):
        if value:
            val_upper = str(value).upper().replace(' ', '_')
            mapping = {
                'ASSET': 'ASSET',
                'LIABILITY': 'LIABILITY',
                'EQUITY': 'EQUITY',
                'REVENUE': 'REVENUE',
                'INCOME': 'REVENUE',
                'COST_OF_SERVICE': 'COST_OF_SERVICE',
                'COGS': 'COST_OF_SERVICE',
                'COST_OF_SALES': 'COST_OF_SERVICE',
                'EXPENSE': 'EXPENSE',
                'OTHER_INCOME': 'OTHER_INCOME',
                'OTHER_EXPENSE': 'OTHER_EXPENSE'
            }
            if val_upper in mapping:
                return mapping[val_upper]
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        # Verify cross-tenant parent
        parent = attrs.get('parent')
        request = self.context.get('request')
        company_id = getattr(request, 'user', None) and getattr(request.user, 'company_id', None)
        if hasattr(request, 'META') and request.META.get('HTTP_X_COMPANY_ID'):
            company_id = request.META.get('HTTP_X_COMPANY_ID')
        
        if parent and company_id and str(parent.company_id) != str(company_id):
            raise serializers.ValidationError({'parent': 'Parent account must belong to the same company.'})
        return attrs

class FiscalYearSerializer(BaseTenantSerializer):
    periods_count = serializers.SerializerMethodField()

    class Meta:
        model = FiscalYear
        fields = '__all__'

    def get_periods_count(self, obj):
        return obj.accountingperiod_set.filter(is_deleted=False).count()

class AccountingPeriodSerializer(BaseTenantSerializer):
    fiscal_year_name = serializers.CharField(source='fiscal_year.name', read_only=True)

    class Meta:
        model = AccountingPeriod
        fields = '__all__'

class LegacyJournalEntrySerializer(BaseTenantSerializer):
    class Meta:
        model = LegacyJournalEntry
        fields = '__all__'

class ExpenseSerializer(BaseTenantSerializer):
    class Meta:
        model = Expense
        fields = '__all__'

class CreditAccountSerializer(BaseTenantSerializer):
    class Meta:
        model = CreditAccount
        fields = '__all__'


class JournalSerializer(BaseTenantSerializer):
    entry_count = serializers.IntegerField(source='entries.count', read_only=True)

    class Meta:
        model = Journal
        fields = '__all__'


class JournalEntryLineSerializer(BaseTenantSerializer):
    account_code = serializers.CharField(source='account.account_code', read_only=True)
    account_name = serializers.CharField(source='account.account_name', read_only=True)
    account_type = serializers.CharField(source='account.account_type', read_only=True)
    normal_balance = serializers.CharField(source='account.normal_balance', read_only=True)
    
    cost_center_code = serializers.CharField(source='cost_center.code', read_only=True)
    cost_center_name = serializers.CharField(source='cost_center.name', read_only=True)
    profit_center_code = serializers.CharField(source='profit_center.code', read_only=True)
    profit_center_name = serializers.CharField(source='profit_center.name', read_only=True)
    client_name = serializers.CharField(source='crm_entity.name', read_only=True)
    contract_code = serializers.CharField(source='contract.contract_code', read_only=True)
    site_name = serializers.CharField(source='site.name', read_only=True)
    vendor_name = serializers.CharField(source='vendor.name', read_only=True)
    employee_name = serializers.SerializerMethodField()

    class Meta:
        model = JournalEntryLine
        fields = '__all__'
        read_only_fields = ['journal_entry', 'base_amount']

    def get_employee_name(self, obj):
        if obj.employee:
            return f"{obj.employee.first_name} {obj.employee.last_name}".strip()
        return None


class JournalEntrySerializer(BaseTenantSerializer):
    journal_code = serializers.CharField(source='journal.code', read_only=True)
    journal_name = serializers.CharField(source='journal.name', read_only=True)
    journal_type = serializers.CharField(source='journal.journal_type', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    posted_by_name = serializers.SerializerMethodField()
    reversed_by_name = serializers.SerializerMethodField()
    reversal_of_number = serializers.CharField(source='reversal_of.entry_number', read_only=True)
    
    total_debit = serializers.DecimalField(max_digits=15, decimal_places=4, read_only=True)
    total_credit = serializers.DecimalField(max_digits=15, decimal_places=4, read_only=True)
    
    lines = JournalEntryLineSerializer(many=True, required=False)

    class Meta:
        model = JournalEntry
        fields = '__all__'
        read_only_fields = [
            'entry_number', 'status', 'total_debit', 'total_credit',
            'created_by', 'approved_by', 'approved_at', 'posted_by', 'posted_at',
            'reversal_of', 'reversed_by', 'reversed_at'
        ]

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else None

    def get_approved_by_name(self, obj):
        return obj.approved_by.get_full_name() if obj.approved_by else None

    def get_posted_by_name(self, obj):
        return obj.posted_by.get_full_name() if obj.posted_by else None

    def get_reversed_by_name(self, obj):
        return obj.reversed_by.get_full_name() if obj.reversed_by else None

    def create(self, validated_data):
        from finance.services.posting_service import AccountingPostingService
        lines_data = validated_data.pop('lines', [])
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        company = validated_data.get('company') or getattr(user, 'company', None)
        
        journal = validated_data.get('journal')
        if not journal and company:
            journal = AccountingPostingService.get_or_create_journal(company, 'GENERAL')
            validated_data['journal'] = journal

        if lines_data:
            return AccountingPostingService.post_journal_entry(
                company=company,
                journal=journal,
                posting_date=validated_data.get('posting_date') or validated_data.get('entry_date'),
                document_date=validated_data.get('document_date'),
                lines=lines_data,
                source_type=validated_data.get('source_type', 'MANUAL_JOURNAL'),
                reference=validated_data.get('reference', ''),
                description=validated_data.get('description', ''),
                currency=validated_data.get('currency'),
                exchange_rate=validated_data.get('exchange_rate', Decimal('1.000000')),
                is_manual=True,
                user=user
            )
        
        entry = JournalEntry.objects.create(**validated_data)
        return entry


class ManualJournalLineCreateSerializer(serializers.Serializer):
    account_id = serializers.UUIDField()
    debit = serializers.DecimalField(max_digits=15, decimal_places=4, default=Decimal('0.0000'))
    credit = serializers.DecimalField(max_digits=15, decimal_places=4, default=Decimal('0.0000'))
    description = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')
    cost_center_id = serializers.UUIDField(required=False, allow_null=True)
    profit_center_id = serializers.UUIDField(required=False, allow_null=True)
    crm_entity_id = serializers.UUIDField(required=False, allow_null=True)
    contract_id = serializers.UUIDField(required=False, allow_null=True)
    site_id = serializers.UUIDField(required=False, allow_null=True)
    vendor_id = serializers.UUIDField(required=False, allow_null=True)
    employee_id = serializers.UUIDField(required=False, allow_null=True)


class ManualJournalCreateSerializer(serializers.Serializer):
    journal_id = serializers.UUIDField(required=False, allow_null=True)
    posting_date = serializers.DateField(required=False)
    document_date = serializers.DateField(required=False)
    reference = serializers.CharField(max_length=200, required=False, allow_blank=True, default='')
    description = serializers.CharField(required=True)
    lines = ManualJournalLineCreateSerializer(many=True, required=True)
    allow_control_account_override = serializers.BooleanField(default=False, required=False)


class JournalReversalRequestSerializer(serializers.Serializer):
    reason = serializers.CharField(required=True, min_length=5)
    reversal_date = serializers.DateField(required=False, allow_null=True)


class CurrencySerializer(serializers.ModelSerializer):
    class Meta:
        model = Currency
        fields = '__all__'

class ExchangeRateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExchangeRate
        fields = '__all__'

class TaxGroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxGroup
        fields = '__all__'

class TaxCodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxCode
        fields = '__all__'

class CostCenterSerializer(BaseTenantSerializer):
    parent_code = serializers.CharField(source='parent.code', read_only=True)
    parent_name = serializers.CharField(source='parent.name', read_only=True)
    children_count = serializers.SerializerMethodField()

    class Meta:
        model = CostCenter
        fields = '__all__'

    def get_children_count(self, obj):
        return obj.children.filter(is_deleted=False).count() if hasattr(obj, 'children') else 0

class ProfitCenterSerializer(BaseTenantSerializer):
    parent_code = serializers.CharField(source='parent.code', read_only=True)
    parent_name = serializers.CharField(source='parent.name', read_only=True)
    children_count = serializers.SerializerMethodField()

    class Meta:
        model = ProfitCenter
        fields = '__all__'

    def get_children_count(self, obj):
        return obj.children.filter(is_deleted=False).count() if hasattr(obj, 'children') else 0

class FinancialTagSerializer(BaseTenantSerializer):
    class Meta:
        model = FinancialTag
        fields = '__all__'

from .models import SalesAccountingConfiguration, SecurityFinanceConfiguration

class SecurityFinanceConfigurationSerializer(BaseTenantSerializer):
    accounts_receivable_account_name = serializers.CharField(source='accounts_receivable_account.account_name', read_only=True)
    accounts_payable_account_name = serializers.CharField(source='accounts_payable_account.account_name', read_only=True)
    payroll_payable_account_name = serializers.CharField(source='payroll_payable_account.account_name', read_only=True)
    tax_payable_account_name = serializers.CharField(source='tax_payable_account.account_name', read_only=True)
    security_service_revenue_account_name = serializers.CharField(source='security_service_revenue_account.account_name', read_only=True)
    overtime_revenue_account_name = serializers.CharField(source='overtime_revenue_account.account_name', read_only=True)
    extra_duty_revenue_account_name = serializers.CharField(source='extra_duty_revenue_account.account_name', read_only=True)
    salary_cost_account_name = serializers.CharField(source='salary_cost_account.account_name', read_only=True)
    overtime_cost_account_name = serializers.CharField(source='overtime_cost_account.account_name', read_only=True)
    inventory_equipment_account_name = serializers.CharField(source='inventory_equipment_account.account_name', read_only=True)
    default_bank_account_title = serializers.CharField(source='default_bank_account.account_title', read_only=True)
    default_currency_code = serializers.CharField(source='default_currency.code', read_only=True)

    class Meta:
        model = SecurityFinanceConfiguration
        fields = '__all__'

class SalesAccountingConfigurationSerializer(BaseTenantSerializer):
    class Meta:
        model = SalesAccountingConfiguration
        fields = '__all__'


from .models import Budget, BudgetLine

class BudgetLineSerializer(BaseTenantSerializer):
    class Meta:
        model = BudgetLine
        fields = '__all__'

class BudgetSerializer(BaseTenantSerializer):
    lines = BudgetLineSerializer(many=True, read_only=True)
    class Meta:
        model = Budget
        fields = '__all__'

class FinancialAttachmentSerializer(BaseTenantSerializer):
    class Meta:
        model = FinancialAttachment
        fields = '__all__'

class FinancialAuditTrailSerializer(BaseTenantSerializer):
    class Meta:
        model = FinancialAuditTrail
        fields = '__all__'

# ==============================================================================
# PHASE C-6 & S-4D: CASH, BANK, TREASURY & FINANCIAL VOUCHERS
# ==============================================================================
from .models import TreasuryTransaction

class BankAccountSerializer(BaseTenantSerializer):
    chart_of_account_name = serializers.CharField(source='chart_of_account.account_name', read_only=True)
    chart_of_account_code = serializers.CharField(source='chart_of_account.account_code', read_only=True)
    account_type_display = serializers.CharField(source='get_account_type_display', read_only=True)
    currency_code = serializers.CharField(source='currency.code', read_only=True)
    opening_balance_set_by_email = serializers.CharField(source='opening_balance_set_by.email', read_only=True)

    class Meta:
        model = BankAccount
        fields = '__all__'


class TreasuryTransactionSerializer(BaseTenantSerializer):
    bank_account_title = serializers.CharField(source='bank_account.account_title', read_only=True)
    bank_account_type = serializers.CharField(source='bank_account.account_type', read_only=True)
    transaction_type_display = serializers.CharField(source='get_transaction_type_display', read_only=True)
    voucher_number = serializers.CharField(source='voucher.voucher_number', read_only=True)
    voucher_type = serializers.CharField(source='voucher.voucher_type', read_only=True)
    created_by_email = serializers.CharField(source='created_by.email', read_only=True)
    reversed_by_email = serializers.CharField(source='reversed_by.email', read_only=True)

    class Meta:
        model = TreasuryTransaction
        fields = '__all__'


class FinancialVoucherLineSerializer(BaseTenantSerializer):
    account_name = serializers.CharField(source='account.account_name', read_only=True)
    account_code = serializers.CharField(source='account.account_code', read_only=True)
    cost_center_name = serializers.CharField(source='cost_center.name', read_only=True)
    profit_center_name = serializers.CharField(source='profit_center.name', read_only=True)

    class Meta:
        model = FinancialVoucherLine
        fields = '__all__'


class ChequeSerializer(BaseTenantSerializer):
    bank_account_title = serializers.CharField(source='bank_account.account_title', read_only=True)
    voucher_number = serializers.CharField(source='voucher.voucher_number', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    created_by_email = serializers.CharField(source='created_by.email', read_only=True)
    cleared_by_email = serializers.CharField(source='cleared_by.email', read_only=True)
    bounced_by_email = serializers.CharField(source='bounced_by.email', read_only=True)

    class Meta:
        model = Cheque
        fields = '__all__'


class FinancialVoucherSerializer(BaseTenantSerializer):
    lines = FinancialVoucherLineSerializer(many=True, read_only=True)
    cheques = ChequeSerializer(many=True, read_only=True)
    bank_account_title = serializers.CharField(source='bank_account.account_title', read_only=True)
    destination_bank_account_title = serializers.CharField(source='destination_bank_account.account_title', read_only=True)
    payment_account_name = serializers.CharField(source='payment_account.account_name', read_only=True)
    customer_name = serializers.CharField(source='customer.name', read_only=True)
    voucher_type_display = serializers.CharField(source='get_voucher_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    currency_code = serializers.CharField(source='currency.code', read_only=True)
    created_by_email = serializers.CharField(source='created_by.email', read_only=True)
    approved_by_email = serializers.CharField(source='approved_by.email', read_only=True)
    posted_by_email = serializers.CharField(source='posted_by.email', read_only=True)
    reversed_by_email = serializers.CharField(source='reversed_by.email', read_only=True)

    class Meta:
        model = FinancialVoucher
        fields = '__all__'


class BankStatementLineSerializer(BaseTenantSerializer):
    class Meta:
        model = BankStatementLine
        fields = '__all__'

class BankStatementSerializer(BaseTenantSerializer):
    lines = BankStatementLineSerializer(many=True, read_only=True)
    class Meta:
        model = BankStatement
        fields = '__all__'


class ExpenseCategorySerializer(BaseTenantSerializer):
    default_expense_account_name = serializers.CharField(source='default_expense_account.account_name', read_only=True)
    default_expense_account_code = serializers.CharField(source='default_expense_account.account_code', read_only=True)

    class Meta:
        model = ExpenseCategory
        fields = '__all__'


class ExpenseAllocationSerializer(BaseTenantSerializer):
    cost_center_name = serializers.CharField(source='cost_center.name', read_only=True)
    profit_center_name = serializers.CharField(source='profit_center.name', read_only=True)
    client_name = serializers.CharField(source='client.name', read_only=True)
    contract_code = serializers.CharField(source='contract.contract_code', read_only=True)
    site_name = serializers.CharField(source='site.name', read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True)

    class Meta:
        model = ExpenseAllocation
        fields = '__all__'


class ExpenseSerializer(BaseTenantSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    category_code = serializers.CharField(source='category.code', read_only=True)
    employee_name = serializers.SerializerMethodField()
    vendor_name = serializers.CharField(source='vendor.name', read_only=True)
    bank_account_title = serializers.CharField(source='bank_account.account_title', read_only=True)
    bank_account_type = serializers.CharField(source='bank_account.account_type', read_only=True)
    expense_account_name = serializers.CharField(source='expense_account.account_name', read_only=True)
    expense_account_code = serializers.CharField(source='expense_account.account_code', read_only=True)
    cost_center_name = serializers.CharField(source='cost_center.name', read_only=True)
    profit_center_name = serializers.CharField(source='profit_center.name', read_only=True)
    client_name = serializers.CharField(source='client.name', read_only=True)
    contract_code = serializers.CharField(source='contract.contract_code', read_only=True)
    site_name = serializers.CharField(source='site.name', read_only=True)
    voucher_number = serializers.CharField(source='voucher.voucher_number', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    allocations = ExpenseAllocationSerializer(many=True, read_only=True)

    class Meta:
        model = Expense
        fields = '__all__'

    def get_employee_name(self, obj):
        if obj.employee:
            return f"{obj.employee.first_name} {obj.employee.last_name}".strip()
        return None

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username or obj.created_by.email
        return None


class EmployeeAdvanceSerializer(BaseTenantSerializer):
    employee_name = serializers.SerializerMethodField()
    employee_code = serializers.CharField(source='employee.employee_code', read_only=True)
    bank_account_title = serializers.CharField(source='bank_account.account_title', read_only=True)
    voucher_number = serializers.CharField(source='voucher.voucher_number', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()

    class Meta:
        model = EmployeeAdvance
        fields = '__all__'

    def get_employee_name(self, obj):
        if obj.employee:
            return f"{obj.employee.first_name} {obj.employee.last_name}".strip()
        return None

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username or obj.created_by.email
        return None

    def get_approved_by_name(self, obj):
        if obj.approved_by:
            return obj.approved_by.get_full_name() or obj.approved_by.username or obj.approved_by.email
        return None


class PettyCashCustodianSerializer(BaseTenantSerializer):
    bank_account_title = serializers.CharField(source='bank_account.account_title', read_only=True)
    bank_account_number = serializers.CharField(source='bank_account.account_number', read_only=True)
    operational_balance = serializers.DecimalField(source='bank_account.current_balance', max_digits=15, decimal_places=4, read_only=True)
    custodian_name = serializers.SerializerMethodField()

    class Meta:
        model = PettyCashCustodian
        fields = '__all__'

    def get_custodian_name(self, obj):
        if obj.custodian:
            return f"{obj.custodian.first_name} {obj.custodian.last_name}".strip()
        if obj.custodian_user:
            return obj.custodian_user.get_full_name() or obj.custodian_user.username or obj.custodian_user.email
        return None


# ==============================================================================
# PHASE S-4F: PURCHASING → FINANCE SERIALIZERS
# ==============================================================================

class PurchasingItemAccountMappingSerializer(BaseTenantSerializer):
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_category_name = serializers.CharField(source='item_category.name', read_only=True)
    expense_category_name = serializers.CharField(source='expense_category.name', read_only=True)
    debit_account_code = serializers.CharField(source='debit_account.account_code', read_only=True)
    debit_account_name = serializers.CharField(source='debit_account.account_name', read_only=True)

    class Meta:
        model = PurchasingItemAccountMapping
        fields = '__all__'


class PurchasingAccountingLinePreviewSerializer(BaseTenantSerializer):
    debit_account_code = serializers.CharField(source='debit_account.account_code', read_only=True)
    debit_account_name = serializers.CharField(source='debit_account.account_name', read_only=True)
    credit_account_code = serializers.CharField(source='credit_account.account_code', read_only=True)
    credit_account_name = serializers.CharField(source='credit_account.account_name', read_only=True)
    cost_center_name = serializers.CharField(source='cost_center.name', read_only=True)
    profit_center_name = serializers.CharField(source='profit_center.name', read_only=True)
    site_name = serializers.CharField(source='site.name', read_only=True)
    contract_code = serializers.CharField(source='contract.contract_code', read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)

    class Meta:
        model = PurchasingAccountingLinePreview
        fields = '__all__'


class PurchasingAccountingIntegrationSerializer(BaseTenantSerializer):
    vendor_name = serializers.CharField(source='vendor.name', read_only=True)
    crm_entity_name = serializers.CharField(source='crm_entity.name', read_only=True)
    purchase_order_number = serializers.CharField(source='purchase_order.number', read_only=True)
    ap_control_account_code = serializers.CharField(source='ap_control_account.account_code', read_only=True)
    ap_control_account_name = serializers.CharField(source='ap_control_account.account_name', read_only=True)
    voucher_number = serializers.CharField(source='voucher.voucher_number', read_only=True)
    reviewed_by_name = serializers.SerializerMethodField()
    lines = PurchasingAccountingLinePreviewSerializer(many=True, read_only=True)

    class Meta:
        model = PurchasingAccountingIntegration
        fields = '__all__'

    def get_reviewed_by_name(self, obj):
        if obj.reviewed_by:
            return obj.reviewed_by.get_full_name() or obj.reviewed_by.username or obj.reviewed_by.email
        return None


# ============================================================================
# PHASE S-4G: PAYROLL -> FINANCE INTEGRATION & SALARY DISBURSEMENT
# ============================================================================

class PayrollAccountMappingSerializer(BaseTenantSerializer):
    employee_name = serializers.SerializerMethodField()
    employee_code = serializers.CharField(source='employee.employee_code', read_only=True)
    designation_name = serializers.CharField(source='designation.name', read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True)
    salary_expense_account_code = serializers.CharField(source='salary_expense_account.account_code', read_only=True)
    salary_expense_account_name = serializers.CharField(source='salary_expense_account.account_name', read_only=True)
    overtime_expense_account_code = serializers.CharField(source='overtime_expense_account.account_code', read_only=True)
    overtime_expense_account_name = serializers.CharField(source='overtime_expense_account.account_name', read_only=True)
    cost_center_name = serializers.CharField(source='cost_center.name', read_only=True)
    profit_center_name = serializers.CharField(source='profit_center.name', read_only=True)

    class Meta:
        model = PayrollAccountMapping
        fields = '__all__'

    def get_employee_name(self, obj):
        if obj.employee:
            return f"{obj.employee.first_name} {obj.employee.last_name}".strip()
        return ""


class EmployeePaymentDestinationSerializer(BaseTenantSerializer):
    employee_name = serializers.SerializerMethodField()
    employee_code = serializers.CharField(source='employee.employee_code', read_only=True)

    class Meta:
        model = EmployeePaymentDestination
        fields = '__all__'

    def get_employee_name(self, obj):
        if obj.employee:
            return f"{obj.employee.first_name} {obj.employee.last_name}".strip()
        return ""


class PayrollEmployeeFinanceSnapshotSerializer(BaseTenantSerializer):
    employee_name = serializers.SerializerMethodField()
    employee_code = serializers.CharField(source='employee.employee_code', read_only=True)
    payslip_number = serializers.CharField(source='payslip.payslip_number', read_only=True)
    salary_expense_account_code = serializers.CharField(source='salary_expense_account.account_code', read_only=True)
    salary_expense_account_name = serializers.CharField(source='salary_expense_account.account_name', read_only=True)
    overtime_expense_account_code = serializers.CharField(source='overtime_expense_account.account_code', read_only=True)
    overtime_expense_account_name = serializers.CharField(source='overtime_expense_account.account_name', read_only=True)
    cost_center_name = serializers.CharField(source='cost_center.name', read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True)
    site_name = serializers.CharField(source='site.name', read_only=True)

    class Meta:
        model = PayrollEmployeeFinanceSnapshot
        fields = '__all__'

    def get_employee_name(self, obj):
        if obj.employee:
            return f"{obj.employee.first_name} {obj.employee.last_name}".strip()
        return ""


class PayrollAccountingIntegrationSerializer(BaseTenantSerializer):
    payroll_run_number = serializers.CharField(source='payroll_run.run_number', read_only=True)
    payroll_payable_account_code = serializers.CharField(source='payroll_payable_account.account_code', read_only=True)
    payroll_payable_account_name = serializers.CharField(source='payroll_payable_account.account_name', read_only=True)
    employee_snapshots = PayrollEmployeeFinanceSnapshotSerializer(many=True, read_only=True)

    class Meta:
        model = PayrollAccountingIntegration
        fields = '__all__'


class SalaryPaymentBatchLineSerializer(BaseTenantSerializer):
    employee_name = serializers.SerializerMethodField()
    employee_code = serializers.CharField(source='employee.employee_code', read_only=True)
    payslip_number = serializers.CharField(source='payslip.payslip_number', read_only=True)
    reversed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = SalaryPaymentBatchLine
        fields = '__all__'

    def get_employee_name(self, obj):
        if obj.employee:
            return f"{obj.employee.first_name} {obj.employee.last_name}".strip()
        return ""

    def get_reversed_by_name(self, obj):
        if obj.reversed_by:
            return obj.reversed_by.get_full_name() or obj.reversed_by.username or obj.reversed_by.email
        return None


class SalaryPaymentBatchSerializer(BaseTenantSerializer):
    payroll_run_number = serializers.CharField(source='payroll_integration.payroll_run.run_number', read_only=True)
    payroll_period_name = serializers.CharField(source='payroll_integration.payroll_period_name', read_only=True)
    treasury_account_title = serializers.CharField(source='treasury_account.account_title', read_only=True)
    treasury_account_type = serializers.CharField(source='treasury_account.account_type', read_only=True)
    voucher_number = serializers.CharField(source='voucher.voucher_number', read_only=True)
    prepared_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    lines = SalaryPaymentBatchLineSerializer(many=True, read_only=True)

    class Meta:
        model = SalaryPaymentBatch
        fields = '__all__'

    def get_prepared_by_name(self, obj):
        if obj.prepared_by:
            return obj.prepared_by.get_full_name() or obj.prepared_by.username or obj.prepared_by.email
        return None

    def get_approved_by_name(self, obj):
        if obj.approved_by:
            return obj.approved_by.get_full_name() or obj.approved_by.username or obj.approved_by.email
        return None


class PayrollDisbursementProviderConfigSerializer(BaseTenantSerializer):
    class Meta:
        model = PayrollDisbursementProviderConfig
        fields = '__all__'


# ==============================================================================
# PHASE S-4H: TAX MANAGEMENT SERIALIZERS
# ==============================================================================

class TaxAuthoritySerializer(BaseTenantSerializer):
    class Meta:
        model = TaxAuthority
        fields = '__all__'


class CompanyTaxProfileSerializer(BaseTenantSerializer):
    default_sales_tax_code_title = serializers.CharField(source='default_sales_tax_code.name', read_only=True)
    default_purchase_tax_code_title = serializers.CharField(source='default_purchase_tax_code.name', read_only=True)
    default_client_wht_code_title = serializers.CharField(source='default_client_wht_code.name', read_only=True)
    default_vendor_wht_code_title = serializers.CharField(source='default_vendor_wht_code.name', read_only=True)

    class Meta:
        model = CompanyTaxProfile
        fields = '__all__'


class TaxPeriodSerializer(BaseTenantSerializer):
    tax_authority_name = serializers.CharField(source='tax_authority.name', read_only=True)
    filed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = TaxPeriod
        fields = '__all__'

    def get_filed_by_name(self, obj):
        if obj.filed_by:
            return obj.filed_by.get_full_name() or obj.filed_by.username or obj.filed_by.email
        return None


class TaxTransactionSerializer(BaseTenantSerializer):
    tax_code_code = serializers.CharField(source='tax_code.code', read_only=True)
    tax_code_name = serializers.CharField(source='tax_code.name', read_only=True)
    gl_account_code = serializers.CharField(source='gl_account.account_code', read_only=True)
    gl_account_name = serializers.CharField(source='gl_account.account_name', read_only=True)
    tax_period_name = serializers.CharField(source='tax_period.name', read_only=True)

    class Meta:
        model = TaxTransaction
        fields = '__all__'


class ClientWithholdingCertificateSerializer(BaseTenantSerializer):
    client_name = serializers.CharField(source='client.name', read_only=True)
    invoice_number = serializers.CharField(source='client_invoice.invoice_number', read_only=True)
    tax_code_name = serializers.CharField(source='tax_code.name', read_only=True)
    verified_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ClientWithholdingCertificate
        fields = '__all__'

    def get_verified_by_name(self, obj):
        if obj.verified_by:
            return obj.verified_by.get_full_name() or obj.verified_by.username or obj.verified_by.email
        return None


class VendorWithholdingRecordSerializer(BaseTenantSerializer):
    vendor_name = serializers.CharField(source='vendor.name', read_only=True)
    vendor_bill_number = serializers.CharField(source='vendor_bill.number', read_only=True)
    tax_code_name = serializers.CharField(source='tax_code.name', read_only=True)

    class Meta:
        model = VendorWithholdingRecord
        fields = '__all__'


class TaxPaymentVoucherSerializer(BaseTenantSerializer):
    tax_authority_name = serializers.CharField(source='tax_authority.name', read_only=True)
    treasury_account_title = serializers.CharField(source='treasury_account.account_title', read_only=True)
    voucher_reference = serializers.CharField(source='voucher.voucher_number', read_only=True)
    prepared_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()

    class Meta:
        model = TaxPaymentVoucher
        fields = '__all__'

    def get_prepared_by_name(self, obj):
        if obj.prepared_by:
            return obj.prepared_by.get_full_name() or obj.prepared_by.username or obj.prepared_by.email
        return None

    def get_approved_by_name(self, obj):
        if obj.approved_by:
            return obj.approved_by.get_full_name() or obj.approved_by.username or obj.approved_by.email
        return None


class TaxAdjustmentSerializer(BaseTenantSerializer):
    tax_code_name = serializers.CharField(source='tax_code.name', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()

    class Meta:
        model = TaxAdjustment
        fields = '__all__'

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username or obj.created_by.email
        return None

    def get_approved_by_name(self, obj):
        if obj.approved_by:
            return obj.approved_by.get_full_name() or obj.approved_by.username or obj.approved_by.email
        return None


class AllocationProfileSerializer(BaseTenantSerializer):
    source_cost_center_name = serializers.CharField(source='source_cost_center.name', read_only=True)
    target_site_name = serializers.CharField(source='target_site.name', read_only=True)
    target_contract_number = serializers.CharField(source='target_contract.contract_number', read_only=True)
    target_profit_center_name = serializers.CharField(source='target_profit_center.name', read_only=True)
    method_display = serializers.CharField(source='get_method_display', read_only=True)

    class Meta:
        model = AllocationProfile
        fields = '__all__'


class CashCountSerializer(BaseTenantSerializer):
    cash_account_name = serializers.CharField(source='cash_account.account_name', read_only=True)
    counted_by_name = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = CashCount
        fields = '__all__'

    def get_counted_by_name(self, obj):
        if obj.counted_by:
            return obj.counted_by.get_full_name() or obj.counted_by.username or obj.counted_by.email
        return None

    def get_reviewed_by_name(self, obj):
        if obj.reviewed_by:
            return obj.reviewed_by.get_full_name() or obj.reviewed_by.username or obj.reviewed_by.email
        return None


class SubledgerReconciliationSnapshotSerializer(BaseTenantSerializer):
    period_name = serializers.CharField(source='period.__str__', read_only=True)

    class Meta:
        model = SubledgerReconciliationSnapshot
        fields = '__all__'


class ControlExceptionSerializer(BaseTenantSerializer):
    period_name = serializers.CharField(source='period.__str__', read_only=True)
    resolved_by_name = serializers.SerializerMethodField()
    severity_display = serializers.CharField(source='get_severity_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = ControlException
        fields = '__all__'

    def get_resolved_by_name(self, obj):
        if obj.resolved_by:
            return obj.resolved_by.get_full_name() or obj.resolved_by.username or obj.resolved_by.email
        return None

