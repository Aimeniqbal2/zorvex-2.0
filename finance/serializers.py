
from django.db import models
from rest_framework import serializers
from .models import (
    AccountGroup, ChartOfAccount, FiscalYear, AccountingPeriod,
    Journal, JournalEntry, JournalEntryLine, Currency, ExchangeRate,
    TaxGroup, TaxCode, CostCenter, ProfitCenter, FinancialTag, LegacyJournalEntry, Expense, CreditAccount,
    FinancialAttachment, FinancialAuditTrail,
    BankAccount, FinancialVoucher, FinancialVoucherLine, Cheque, BankStatement, BankStatementLine
)

class BaseTenantSerializer(serializers.ModelSerializer):
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

class AccountGroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = AccountGroup
        fields = '__all__'

class ChartOfAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChartOfAccount
        fields = '__all__'
        read_only_fields = ['current_balance']

class FiscalYearSerializer(serializers.ModelSerializer):
    class Meta:
        model = FiscalYear
        fields = '__all__'

class AccountingPeriodSerializer(serializers.ModelSerializer):
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


class JournalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Journal
        fields = '__all__'

class JournalEntryLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = JournalEntryLine
        fields = '__all__'
        read_only_fields = ['journal_entry']

class JournalEntrySerializer(serializers.ModelSerializer):
    lines = JournalEntryLineSerializer(many=True, required=False)

    class Meta:
        model = JournalEntry
        fields = '__all__'

    def create(self, validated_data):
        lines_data = validated_data.pop('lines', [])
        entry = JournalEntry.objects.create(**validated_data)
        for line_data in lines_data:
            JournalEntryLine.objects.create(journal_entry=entry, **line_data)
        return entry

    def update(self, instance, validated_data):
        lines_data = validated_data.pop('lines', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        if lines_data is not None:
            instance.lines.all().delete()
            for line_data in lines_data:
                JournalEntryLine.objects.create(journal_entry=instance, **line_data)
        return instance

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

class CostCenterSerializer(serializers.ModelSerializer):
    class Meta:
        model = CostCenter
        fields = '__all__'

class ProfitCenterSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProfitCenter
        fields = '__all__'

class FinancialTagSerializer(serializers.ModelSerializer):
    class Meta:
        model = FinancialTag
        fields = '__all__'

from .models import SalesAccountingConfiguration
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
# PHASE C-6: CASH, BANK & VOUCHERS
# ==============================================================================

class BankAccountSerializer(BaseTenantSerializer):
    class Meta:
        model = BankAccount
        fields = '__all__'

class FinancialVoucherLineSerializer(BaseTenantSerializer):
    class Meta:
        model = FinancialVoucherLine
        fields = '__all__'

class FinancialVoucherSerializer(BaseTenantSerializer):
    lines = FinancialVoucherLineSerializer(many=True, read_only=True)
    class Meta:
        model = FinancialVoucher
        fields = '__all__'

class ChequeSerializer(BaseTenantSerializer):
    class Meta:
        model = Cheque
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
