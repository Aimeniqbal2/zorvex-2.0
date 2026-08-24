from django.conf import settings
"""
finance/models.py
Finance module — tracks expenses, credit accounts, and auto-journal entries from sales/services.
"""
from django.db import models
from erp_core.models import BaseModel
from crm.mixins import CRMBridgeValidationMixin


class Expense(BaseModel):
    CATEGORY_CHOICES = (
        ('food', 'Food'),
        ('charity', 'Charity'),
        ('shop', 'Shop Utilities'),
        ('vendor', 'Vendor Payment'),
        ('salary', 'Salary'),
        ('other', 'Other'),
    )
    title = models.CharField(max_length=200)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    category = models.CharField(max_length=50, choices=CATEGORY_CHOICES)
    date = models.DateField(auto_now_add=True)
    notes = models.TextField(blank=True)

    def __str__(self):
        return f"Expense: {self.title} - PKR{self.amount}"

    class Meta(BaseModel.Meta):
        ordering = ['-date']


class CreditAccount(CRMBridgeValidationMixin, BaseModel):
    """Tracks customers who buy or service on credit."""
    customer_name = models.CharField(max_length=200)
    customer_phone = models.CharField(max_length=20)
    crm_entity = models.ForeignKey('crm.CRMEntity', null=True, blank=True, on_delete=models.RESTRICT)
    balance_due = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    def __str__(self):
        return f"Credit: {self.customer_name} (PKR{self.balance_due} due)"

    def save(self, *args, **kwargs):
        # -- Phase 4E: Auto-resolve CRM bridges --
        from crm.services.compatibility import get_crm_entity, resolve_customer
        if not self.crm_entity_id:
            crm_obj = get_crm_entity(self)
            if crm_obj:
                self.crm_entity = crm_obj
        # ----------------------------------------
        super().save(*args, **kwargs)

    class Meta(BaseModel.Meta):
        ordering = ['customer_name']


class LegacyJournalEntry(BaseModel):
    """
    Auto-created finance ledger entry for every sale and service payment.
    This gives real-time P&L tracking without manual bookkeeping.
    """
    ENTRY_TYPES = (
        ('REVENUE', 'Revenue (Sale)'),
        ('SERVICE', 'Service Revenue'),
        ('EXPENSE', 'Expense'),
        ('ADJUSTMENT', 'Adjustment'),
    )
    entry_type = models.CharField(max_length=20, choices=ENTRY_TYPES)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    profit = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    reference = models.CharField(max_length=100, blank=True, help_text="Sale ID, Service ID, etc.")
    description = models.TextField(blank=True)
    date = models.DateField(auto_now_add=True)

    def __str__(self):
        return f"{self.entry_type} | PKR{self.amount} | Ref: {self.reference}"

    class Meta(BaseModel.Meta):
        db_table = 'finance_journalentry'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['entry_type', 'date']),
        ]


from django.core.exceptions import ValidationError
from django.db.models import UniqueConstraint, CheckConstraint, Q
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType

class AccountGroup(BaseModel):
    name = models.CharField(max_length=100)
    parent = models.ForeignKey('self', null=True, blank=True, on_delete=models.RESTRICT)
    group_type = models.CharField(max_length=20, choices=[
        ('ASSET', 'Assets'),
        ('LIABILITY', 'Liabilities'),
        ('EQUITY', 'Equity'),
        ('INCOME', 'Income'),
        ('EXPENSE', 'Expense'),
        ('COST_OF_SALES', 'Cost of Sales'),
        ('OTHER_INCOME', 'Other Income'),
        ('OTHER_EXPENSE', 'Other Expense'),
    ])

    def clean(self):
        super().clean()
        if self.parent and self.parent.company_id != self.company_id:
            raise ValidationError("Parent group must belong to the same company.")

    def __str__(self):
        return f"{self.name} ({self.group_type})"


class ChartOfAccount(BaseModel):
    account_group = models.ForeignKey(AccountGroup, on_delete=models.RESTRICT)
    account_code = models.CharField(max_length=50)
    account_name = models.CharField(max_length=200)
    account_type = models.CharField(max_length=50)
    currency = models.ForeignKey('Currency', null=True, blank=True, on_delete=models.RESTRICT)
    opening_balance = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    current_balance = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    is_control_account = models.BooleanField(default=False)
    allow_manual_entries = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    description = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        constraints = [
            UniqueConstraint(fields=['company', 'account_code'], name='unique_company_account_code_finance')
        ]

    def clean(self):
        super().clean()
        if self.account_group and self.account_group.company_id != self.company_id:
            raise ValidationError("Account group must belong to the same company.")
        if self.currency and self.currency.company_id != self.company_id:
            raise ValidationError("Currency must belong to the same company.")

    def __str__(self):
        return f"{self.account_code} - {self.account_name}"


class FiscalYear(BaseModel):
    name = models.CharField(max_length=50)
    start_date = models.DateField()
    end_date = models.DateField()
    is_closed = models.BooleanField(default=False)
    is_current = models.BooleanField(default=False)

    class Meta(BaseModel.Meta):
        constraints = [
            UniqueConstraint(fields=['company'], condition=Q(is_current=True), name='unique_current_fiscal_year')
        ]

    def __str__(self):
        return f"{self.name} ({self.start_date} to {self.end_date})"


class AccountingPeriod(BaseModel):
    fiscal_year = models.ForeignKey(FiscalYear, on_delete=models.RESTRICT)
    month = models.PositiveSmallIntegerField()
    start_date = models.DateField()
    end_date = models.DateField()
    status = models.CharField(max_length=20, choices=[
        ('OPEN', 'Open'),
        ('LOCKED', 'Locked'),
        ('CLOSED', 'Closed'),
    ], default='OPEN')

    class Meta(BaseModel.Meta):
        constraints = [
            UniqueConstraint(fields=['company', 'fiscal_year', 'month'], name='unique_company_fy_month')
        ]

    def clean(self):
        super().clean()
        if self.fiscal_year and self.fiscal_year.company_id != self.company_id:
            raise ValidationError("Fiscal year must belong to the same company.")

    def __str__(self):
        return f"Period {self.month} - {self.fiscal_year.name}"


class Journal(BaseModel):
    code = models.CharField(max_length=50)
    name = models.CharField(max_length=100)
    journal_type = models.CharField(max_length=30, choices=[
        ('GENERAL', 'General'),
        ('SALES', 'Sales'),
        ('PURCHASE', 'Purchase'),
        ('CASH', 'Cash'),
        ('BANK', 'Bank'),
        ('INVENTORY', 'Inventory'),
        ('PAYROLL', 'Payroll'),
        ('OPENING_BALANCE', 'Opening Balance'),
        ('ADJUSTMENT', 'Adjustment'),
    ])

    class Meta(BaseModel.Meta):
        constraints = [
            UniqueConstraint(fields=['company', 'code'], name='unique_company_journal_code')
        ]

    def __str__(self):
        return f"{self.code} - {self.name}"


class JournalEntry(BaseModel):
    journal = models.ForeignKey(Journal, on_delete=models.RESTRICT)
    entry_number = models.CharField(max_length=100)
    entry_date = models.DateField()
    status = models.CharField(max_length=20, choices=[
        ('DRAFT', 'Draft'),
        ('POSTED', 'Posted'),
        ('CANCELLED', 'Cancelled'),
        ('REVERSED', 'Reversed'),
    ], default='DRAFT')
    reference = models.CharField(max_length=200, blank=True)
    description = models.TextField(blank=True)
    
    source_module = models.CharField(max_length=50, blank=True)
    source_document_type = models.CharField(max_length=100, blank=True)
    source_document_id = models.UUIDField(null=True, blank=True)
    
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.RESTRICT, related_name='finance_journalentries_created')
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.RESTRICT, related_name='finance_journalentries_approved')
    approved_at = models.DateTimeField(null=True, blank=True)
    posted_at = models.DateTimeField(null=True, blank=True)

    class Meta(BaseModel.Meta):
        db_table = 'finance_universal_journalentry'
        constraints = [
            UniqueConstraint(fields=['company', 'entry_number'], name='unique_company_entry_number')
        ]

    def clean(self):
        super().clean()
        if self.journal and self.journal.company_id != self.company_id:
            raise ValidationError("Journal must belong to the same company.")
            
        if self.pk:
            orig = JournalEntry.objects.get(pk=self.pk)
            # If it was already posted, no edits allowed
            if orig.status == 'POSTED':
                raise ValidationError("Cannot modify a posted journal entry.")
                
        if self.status == 'POSTED':
            # Accounting Period Check
            if self.entry_date:
                from .models import AccountingPeriod
                period = AccountingPeriod.objects.filter(
                    company=self.company,
                    start_date__lte=self.entry_date,
                    end_date__gte=self.entry_date
                ).first()
                if not period:
                    raise ValidationError({"entry_date": "No accounting period found for the given entry date."})
                if period.status in ['CLOSED', 'LOCKED']:
                    raise ValidationError({"entry_date": f"Cannot post into a {period.status.lower()} accounting period."})
            
            # Double-entry balance check
            if not self.pk:
                raise ValidationError({"status": "Cannot create a journal entry directly as POSTED."})
                
            from django.db.models import Sum
            from decimal import Decimal
            aggregates = self.lines.filter(is_deleted=False).aggregate(t_debit=Sum('debit'), t_credit=Sum('credit'))
            t_debit = aggregates['t_debit'] or Decimal('0.0000')
            t_credit = aggregates['t_credit'] or Decimal('0.0000')
            
            if t_debit == Decimal('0.0000') and t_credit == Decimal('0.0000'):
                raise ValidationError("Empty journal entries cannot be posted.")
            if t_debit != t_credit:
                raise ValidationError("Debits and credits must balance.")

    def delete(self, *args, **kwargs):
        if self.status == 'POSTED':
            raise ValidationError("Cannot delete a posted journal entry.")
        super().delete(*args, **kwargs)

    def __str__(self):
        return f"{self.entry_number} ({self.status})"


class CostCenter(BaseModel):
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=50)
    parent = models.ForeignKey('self', null=True, blank=True, on_delete=models.RESTRICT)
    
    def clean(self):
        super().clean()
        if self.parent and self.parent.company_id != self.company_id:
            raise ValidationError("Parent must belong to the same company.")
            
    def __str__(self):
        return f"{self.code} - {self.name}"


class ProfitCenter(BaseModel):
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=50)
    parent = models.ForeignKey('self', null=True, blank=True, on_delete=models.RESTRICT)

    def clean(self):
        super().clean()
        if self.parent and self.parent.company_id != self.company_id:
            raise ValidationError("Parent must belong to the same company.")

    def __str__(self):
        return f"{self.code} - {self.name}"


class JournalEntryLine(BaseModel):
    journal_entry = models.ForeignKey(JournalEntry, on_delete=models.CASCADE, related_name='lines')
    account = models.ForeignKey(ChartOfAccount, on_delete=models.RESTRICT)
    description = models.CharField(max_length=255, blank=True)
    debit = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    credit = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    currency = models.ForeignKey('Currency', null=True, blank=True, on_delete=models.RESTRICT)
    exchange_rate = models.DecimalField(max_digits=15, decimal_places=6, default=1)
    
    cost_center = models.ForeignKey(CostCenter, null=True, blank=True, on_delete=models.RESTRICT)
    profit_center = models.ForeignKey(ProfitCenter, null=True, blank=True, on_delete=models.RESTRICT)
    crm_entity = models.ForeignKey('crm.CRMEntity', null=True, blank=True, on_delete=models.RESTRICT)

    class Meta(BaseModel.Meta):
        constraints = [
            CheckConstraint(
                condition=(
                    (Q(debit__gt=0) & Q(credit=0)) |
                    (Q(credit__gt=0) & Q(debit=0))
                ),
                name='debit_or_credit_positive'
            )
        ]

    def clean(self):
        super().clean()
        if self.journal_entry and self.journal_entry.company_id != self.company_id:
            raise ValidationError("JournalEntry must belong to the same company.")
        if self.account and self.account.company_id != self.company_id:
            raise ValidationError("Account must belong to the same company.")
        if self.currency and self.currency.company_id != self.company_id:
            raise ValidationError("Currency must belong to the same company.")
        if self.cost_center and self.cost_center.company_id != self.company_id:
            raise ValidationError("CostCenter must belong to the same company.")
        if self.profit_center and self.profit_center.company_id != self.company_id:
            raise ValidationError("ProfitCenter must belong to the same company.")
        if self.crm_entity and self.crm_entity.company_id != self.company_id:
            raise ValidationError("CRMEntity must belong to the same company.")
        
        if self.debit == 0 and self.credit == 0:
            raise ValidationError("Either debit or credit must be positive.")
        if self.debit > 0 and self.credit > 0:
            raise ValidationError("Both debit and credit cannot be positive.")

        # Immutability Check
        if self.journal_entry and self.journal_entry.status == 'POSTED':
            if self.pk:
                # Modifying existing line of POSTED entry
                raise ValidationError("Cannot modify lines of a posted journal entry.")
            else:
                # Adding new line to POSTED entry
                raise ValidationError("Cannot add lines to a posted journal entry.")

    def delete(self, *args, **kwargs):
        if self.journal_entry and self.journal_entry.status == 'POSTED':
            raise ValidationError("Cannot delete lines of a posted journal entry.")
        super().delete(*args, **kwargs)

    def __str__(self):
        return f"{self.account.account_code}: D={self.debit} C={self.credit}"


class Currency(BaseModel):
    code = models.CharField(max_length=10)
    name = models.CharField(max_length=50)
    symbol = models.CharField(max_length=10, blank=True)
    decimal_places = models.PositiveSmallIntegerField(default=2)
    is_base_currency = models.BooleanField(default=False)

    class Meta(BaseModel.Meta):
        constraints = [
            UniqueConstraint(fields=['company'], condition=Q(is_base_currency=True), name='unique_base_currency_per_company')
        ]

    def __str__(self):
        return self.code


class ExchangeRate(BaseModel):
    from_currency = models.ForeignKey(Currency, related_name='rates_from', on_delete=models.CASCADE)
    to_currency = models.ForeignKey(Currency, related_name='rates_to', on_delete=models.CASCADE)
    rate = models.DecimalField(max_digits=15, decimal_places=6)
    effective_date = models.DateField()

    def clean(self):
        super().clean()
        if self.from_currency and self.from_currency.company_id != self.company_id:
            raise ValidationError("Currency must belong to the same company.")
        if self.to_currency and self.to_currency.company_id != self.company_id:
            raise ValidationError("Currency must belong to the same company.")

    def __str__(self):
        return f"{self.from_currency.code} to {self.to_currency.code} @ {self.rate}"


class TaxGroup(BaseModel):
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)

    def __str__(self):
        return self.name


class TaxCode(BaseModel):
    code = models.CharField(max_length=50)
    name = models.CharField(max_length=100)
    rate = models.DecimalField(max_digits=5, decimal_places=4)
    tax_type = models.CharField(max_length=30, choices=[
        ('SALES', 'Sales'),
        ('PURCHASE', 'Purchase'),
        ('VAT', 'VAT'),
        ('GST', 'GST'),
        ('SERVICE', 'Service'),
        ('WITHHOLDING', 'Withholding'),
    ])
    tax_group = models.ForeignKey(TaxGroup, null=True, blank=True, on_delete=models.RESTRICT, related_name='tax_codes')

    def clean(self):
        super().clean()
        if self.tax_group and self.tax_group.company_id != self.company_id:
            raise ValidationError("TaxGroup must belong to the same company.")

    def __str__(self):
        return f"{self.code} ({self.rate}%)"


class FinancialTag(BaseModel):
    name = models.CharField(max_length=50)
    color = models.CharField(max_length=20, default="#000000")
    
    def __str__(self):
        return self.name


class FinancialNote(BaseModel):
    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.UUIDField()
    content_object = GenericForeignKey('content_type', 'object_id')
    note = models.TextField()
    author = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)


class FinancialAttachment(BaseModel):
    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.UUIDField()
    content_object = GenericForeignKey('content_type', 'object_id')
    file = models.FileField(upload_to='finance/attachments/%Y/%m/')
    filename = models.CharField(max_length=255)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)


class FinancialAuditTrail(BaseModel):
    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.UUIDField()
    content_object = GenericForeignKey('content_type', 'object_id')
    action = models.CharField(max_length=50)
    changes = models.JSONField(default=dict)
    performed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
class SalesAccountingConfiguration(BaseModel):
    sales_revenue_account = models.ForeignKey(ChartOfAccount, on_delete=models.RESTRICT, related_name='+')
    accounts_receivable_account = models.ForeignKey(ChartOfAccount, on_delete=models.RESTRICT, related_name='+')
    cash_account = models.ForeignKey(ChartOfAccount, on_delete=models.RESTRICT, related_name='+')
    bank_account = models.ForeignKey(ChartOfAccount, null=True, blank=True, on_delete=models.RESTRICT, related_name='+')
    sales_discount_account = models.ForeignKey(ChartOfAccount, null=True, blank=True, on_delete=models.RESTRICT, related_name='+')
    sales_return_account = models.ForeignKey(ChartOfAccount, null=True, blank=True, on_delete=models.RESTRICT, related_name='+')
    sales_tax_account = models.ForeignKey(ChartOfAccount, null=True, blank=True, on_delete=models.RESTRICT, related_name='+')
    rounding_account = models.ForeignKey(ChartOfAccount, null=True, blank=True, on_delete=models.RESTRICT, related_name='+')
    default_currency = models.ForeignKey(Currency, on_delete=models.RESTRICT)
    is_active = models.BooleanField(default=True)

    class Meta(BaseModel.Meta):
        constraints = [
            UniqueConstraint(fields=['company'], condition=Q(is_active=True), name='unique_active_sales_accounting_config')
        ]

    def clean(self):
        super().clean()
        
        accounts = [
            self.sales_revenue_account, self.accounts_receivable_account, self.cash_account, 
            self.bank_account, self.sales_discount_account, self.sales_return_account, 
            self.sales_tax_account, self.rounding_account
        ]
        for acc in accounts:
            if acc and acc.company_id != self.company_id:
                raise ValidationError(f"Account {acc} must belong to the same company.")
                
        if self.default_currency and self.default_currency.company_id != self.company_id:
            raise ValidationError("Currency must belong to the same company.")
            
        account_ids = [acc.id for acc in accounts if acc]
        if len(account_ids) != len(set(account_ids)):
            raise ValidationError("Duplicate accounts are prohibited in configuration.")

    def __str__(self):
        return f"Sales Accounting Config ({self.company.name})"


class Budget(BaseModel):
    name = models.CharField(max_length=200)
    fiscal_year = models.ForeignKey(FiscalYear, on_delete=models.RESTRICT)
    currency = models.ForeignKey(Currency, on_delete=models.RESTRICT)
    status = models.CharField(max_length=20, choices=[
        ('DRAFT', 'Draft'),
        ('SUBMITTED', 'Submitted'),
        ('APPROVED', 'Approved'),
        ('ACTIVE', 'Active'),
        ('CLOSED', 'Closed'),
        ('CANCELLED', 'Cancelled'),
    ], default='DRAFT')
    description = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.RESTRICT, related_name='budgets_created')
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.RESTRICT, related_name='budgets_approved')
    approved_at = models.DateTimeField(null=True, blank=True)

    class Meta(BaseModel.Meta):
        constraints = [
            UniqueConstraint(fields=['company', 'name', 'fiscal_year'], name='unique_company_budget_name_fy')
        ]
        indexes = [
            models.Index(fields=['company', 'fiscal_year', 'status']),
        ]

    def clean(self):
        super().clean()
        if self.fiscal_year and self.fiscal_year.company_id != self.company_id:
            raise ValidationError({'fiscal_year': 'Fiscal year must belong to the same company.'})
        if self.currency and self.currency.company_id != self.company_id:
            raise ValidationError({'currency': 'Currency must belong to the same company.'})
        if self.created_by_id and hasattr(self.created_by, 'company_id') and self.created_by.company_id != self.company_id:
            raise ValidationError({'created_by': 'User must belong to the same company.'})
        if self.approved_by_id and hasattr(self.approved_by, 'company_id') and self.approved_by.company_id != self.company_id:
            raise ValidationError({'approved_by': 'User must belong to the same company.'})

    def __str__(self):
        return f"{self.name} ({self.fiscal_year.name})"


class BudgetLine(BaseModel):
    budget = models.ForeignKey(Budget, on_delete=models.CASCADE, related_name='lines')
    account = models.ForeignKey(ChartOfAccount, on_delete=models.RESTRICT)
    cost_center = models.ForeignKey(CostCenter, null=True, blank=True, on_delete=models.RESTRICT)
    profit_center = models.ForeignKey(ProfitCenter, null=True, blank=True, on_delete=models.RESTRICT)
    period = models.ForeignKey(AccountingPeriod, null=True, blank=True, on_delete=models.RESTRICT)
    amount = models.DecimalField(max_digits=15, decimal_places=4)

    class Meta(BaseModel.Meta):
        constraints = [
            UniqueConstraint(
                fields=['budget', 'account', 'cost_center', 'profit_center', 'period'],
                name='unique_budget_line_intersection'
            )
        ]
        indexes = [
            models.Index(fields=['budget', 'account', 'period']),
        ]

    def clean(self):
        super().clean()
        if self.budget and self.budget.company_id != self.company_id:
            raise ValidationError({'budget': 'Budget must belong to the same company.'})
        if self.account and self.account.company_id != self.company_id:
            raise ValidationError({'account': 'Account must belong to the same company.'})
        if self.cost_center and self.cost_center.company_id != self.company_id:
            raise ValidationError({'cost_center': 'Cost center must belong to the same company.'})
        if self.profit_center and self.profit_center.company_id != self.company_id:
            raise ValidationError({'profit_center': 'Profit center must belong to the same company.'})
        if self.period:
            if self.period.company_id != self.company_id:
                raise ValidationError({'period': 'Period must belong to the same company.'})
            if self.budget and self.period.fiscal_year_id != self.budget.fiscal_year_id:
                raise ValidationError({'period': "Accounting period must belong to the budget's fiscal year."})
        
        # Application-level uniqueness check due to DB NULL handling
        qs = BudgetLine.objects.filter(
            budget=self.budget,
            account=self.account,
            cost_center=self.cost_center,
            profit_center=self.profit_center,
            period=self.period
        ).exclude(pk=self.pk)
        if qs.exists():
            raise ValidationError('A budget line with these exact dimensions already exists.')

    def __str__(self):
        return f"{self.budget.name} - {self.account.account_code}: {self.amount}"

# ==============================================================================
# PHASE C-6: CASH, BANK & VOUCHERS
# ==============================================================================

class BankAccount(BaseModel):
    bank_name = models.CharField(max_length=100)
    account_title = models.CharField(max_length=150)
    account_number = models.CharField(max_length=50)
    iban = models.CharField(max_length=50, blank=True)
    branch_name = models.CharField(max_length=100, blank=True)
    chart_of_account = models.ForeignKey(ChartOfAccount, on_delete=models.RESTRICT, related_name='bank_accounts')
    is_active = models.BooleanField(default=True)

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'account_number'],
                condition=models.Q(is_active=True),
                name='unique_active_bank_account'
            )
        ]

    def clean(self):
        super().clean()
        if self.chart_of_account_id and str(self.chart_of_account.company_id) != str(self.company_id):
            raise ValidationError({'chart_of_account': 'Chart of account must belong to the same company.'})
        if self.chart_of_account_id and self.chart_of_account.account_type != AccountType.ASSET:
            raise ValidationError({'chart_of_account': 'Bank account must be linked to an Asset account.'})

    def __str__(self):
        return f"{self.bank_name} - {self.account_number}"


class VoucherType(models.TextChoices):
    PAYMENT = 'PAYMENT', 'Payment Voucher'
    RECEIPT = 'RECEIPT', 'Receipt Voucher'
    CONTRA = 'CONTRA', 'Contra Voucher'
    JOURNAL = 'JOURNAL', 'Journal Voucher'

class VoucherStatus(models.TextChoices):
    DRAFT = 'DRAFT', 'Draft'
    APPROVED = 'APPROVED', 'Approved'
    POSTED = 'POSTED', 'Posted'
    CANCELLED = 'CANCELLED', 'Cancelled'

class PaymentMethod(models.TextChoices):
    CASH = 'CASH', 'Cash'
    BANK_TRANSFER = 'BANK_TRANSFER', 'Bank Transfer'
    CHEQUE = 'CHEQUE', 'Cheque'

class FinancialVoucher(BaseModel):
    voucher_type = models.CharField(max_length=20, choices=VoucherType.choices)
    voucher_number = models.CharField(max_length=50)
    date = models.DateField()
    payment_account = models.ForeignKey(ChartOfAccount, on_delete=models.RESTRICT, related_name='vouchers')
    payment_method = models.CharField(max_length=20, choices=PaymentMethod.choices, default=PaymentMethod.CASH)
    reference = models.CharField(max_length=100, blank=True)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=VoucherStatus.choices, default=VoucherStatus.DRAFT)
    
    # Payee / Customer relation (using generic string for now or specific relation if needed)
    payee_name = models.CharField(max_length=200, blank=True)
    customer = models.ForeignKey('crm.CRMEntity', null=True, blank=True, on_delete=models.SET_NULL, related_name='vouchers')
    
    total_amount = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    journal_entry = models.ForeignKey(JournalEntry, null=True, blank=True, on_delete=models.RESTRICT, related_name='vouchers')

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'voucher_number'],
                condition=models.Q(status__in=[VoucherStatus.DRAFT, VoucherStatus.APPROVED, VoucherStatus.POSTED]),
                name='unique_active_voucher_number'
            )
        ]
        indexes = [
            models.Index(fields=['company', 'voucher_type', 'date']),
        ]

    def clean(self):
        super().clean()
        if self.payment_account_id and str(self.payment_account.company_id) != str(self.company_id):
            raise ValidationError({'payment_account': 'Account must belong to the same company.'})
        if self.customer_id and str(self.customer.company_id) != str(self.company_id):
            raise ValidationError({'customer': 'Customer must belong to the same company.'})
            
    def save(self, *args, **kwargs):
        if not self.voucher_number:
            prefix = f"{'PV' if self.voucher_type == VoucherType.PAYMENT else 'RV' if self.voucher_type == VoucherType.RECEIPT else 'CV'}-{self.date.strftime('%Y%m')}"
            self.voucher_number = DocumentSequence.get_next_number(self.company, "VOUCHER", prefix)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.voucher_number} - {self.total_amount}"


class FinancialVoucherLine(BaseModel):
    voucher = models.ForeignKey(FinancialVoucher, on_delete=models.CASCADE, related_name='lines')
    account = models.ForeignKey(ChartOfAccount, on_delete=models.RESTRICT)
    amount = models.DecimalField(max_digits=15, decimal_places=4)
    description = models.CharField(max_length=255, blank=True)
    cost_center = models.ForeignKey(CostCenter, null=True, blank=True, on_delete=models.RESTRICT)
    
    # Optional relation to a specific invoice
    invoice = models.ForeignKey('billing.ServiceInvoice', null=True, blank=True, on_delete=models.SET_NULL, related_name='voucher_lines')

    def clean(self):
        super().clean()
        if self.account_id and str(self.account.company_id) != str(self.company_id):
            raise ValidationError({'account': 'Account must belong to the same company.'})
        if self.cost_center_id and str(self.cost_center.company_id) != str(self.company_id):
            raise ValidationError({'cost_center': 'Cost center must belong to the same company.'})
        if self.invoice_id and str(self.invoice.company_id) != str(self.company_id):
            raise ValidationError({'invoice': 'Invoice must belong to the same company.'})

    def __str__(self):
        return f"{self.voucher.voucher_number} - {self.account.account_code}: {self.amount}"


class ChequeStatus(models.TextChoices):
    ISSUED = 'ISSUED', 'Issued'
    RECEIVED = 'RECEIVED', 'Received'
    DEPOSITED = 'DEPOSITED', 'Deposited'
    CLEARED = 'CLEARED', 'Cleared'
    BOUNCED = 'BOUNCED', 'Bounced'
    CANCELLED = 'CANCELLED', 'Cancelled'

class Cheque(BaseModel):
    cheque_number = models.CharField(max_length=50)
    bank_account = models.ForeignKey(BankAccount, null=True, blank=True, on_delete=models.RESTRICT, related_name='cheques')
    voucher = models.ForeignKey(FinancialVoucher, on_delete=models.RESTRICT, related_name='cheques')
    issue_date = models.DateField()
    due_date = models.DateField(null=True, blank=True)
    amount = models.DecimalField(max_digits=15, decimal_places=4)
    payee_name = models.CharField(max_length=200)
    status = models.CharField(max_length=20, choices=ChequeStatus.choices, default=ChequeStatus.ISSUED)
    clearing_date = models.DateField(null=True, blank=True)
    
    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'bank_account', 'cheque_number'],
                condition=models.Q(status__in=[ChequeStatus.ISSUED, ChequeStatus.DEPOSITED, ChequeStatus.CLEARED]),
                name='unique_active_cheque'
            )
        ]

    def clean(self):
        super().clean()
        if self.bank_account_id and str(self.bank_account.company_id) != str(self.company_id):
            raise ValidationError({'bank_account': 'Bank account must belong to the same company.'})
        if self.voucher_id and str(self.voucher.company_id) != str(self.company_id):
            raise ValidationError({'voucher': 'Voucher must belong to the same company.'})

    def __str__(self):
        return f"Cheque {self.cheque_number} - {self.amount}"


class BankStatement(BaseModel):
    bank_account = models.ForeignKey(BankAccount, on_delete=models.RESTRICT, related_name='statements')
    statement_date = models.DateField()
    start_date = models.DateField()
    end_date = models.DateField()
    opening_balance = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    closing_balance = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    
    def clean(self):
        super().clean()
        if self.bank_account_id and str(self.bank_account.company_id) != str(self.company_id):
            raise ValidationError({'bank_account': 'Bank account must belong to the same company.'})

    def __str__(self):
        return f"{self.bank_account.bank_name} - {self.end_date}"


class ReconciliationStatus(models.TextChoices):
    UNMATCHED = 'UNMATCHED', 'Unmatched'
    MATCHED = 'MATCHED', 'Matched'
    RECONCILED = 'RECONCILED', 'Reconciled'

class BankStatementLine(BaseModel):
    statement = models.ForeignKey(BankStatement, on_delete=models.CASCADE, related_name='lines')
    transaction_date = models.DateField()
    description = models.CharField(max_length=255)
    reference = models.CharField(max_length=100, blank=True)
    debit = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    credit = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    status = models.CharField(max_length=20, choices=ReconciliationStatus.choices, default=ReconciliationStatus.UNMATCHED)
    journal_entry_line = models.ForeignKey(JournalEntryLine, null=True, blank=True, on_delete=models.SET_NULL, related_name='reconciliations')

    def clean(self):
        super().clean()
        if self.journal_entry_line_id and str(self.journal_entry_line.company_id) != str(self.company_id):
            raise ValidationError({'journal_entry_line': 'Journal entry line must belong to the same company.'})

    def __str__(self):
        return f"{self.transaction_date} - {self.description}"

