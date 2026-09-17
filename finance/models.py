from django.conf import settings
from django.utils import timezone
from decimal import Decimal
"""
finance/models.py
Finance module — tracks expenses, credit accounts, and auto-journal entries from sales/services.
"""
from django.db import models
from erp_core.models import BaseModel
from crm.mixins import CRMBridgeValidationMixin


# ==============================================================================
# PHASE S-4E: EXPENSE MANAGEMENT, PETTY CASH, CLAIMS & COST ALLOCATION
# ==============================================================================

class PaymentMethod(models.TextChoices):
    CASH = 'CASH', 'Cash'
    BANK_TRANSFER = 'BANK_TRANSFER', 'Bank Transfer'
    CHEQUE = 'CHEQUE', 'Cheque'
    ONLINE_TRANSFER = 'ONLINE_TRANSFER', 'Online Transfer'
    DIRECT_DEPOSIT = 'DIRECT_DEPOSIT', 'Direct Deposit'
    WALLET = 'WALLET', 'Digital Wallet'
    OTHER = 'OTHER', 'Other'


class ExpenseType(models.TextChoices):
    DIRECT_EXPENSE = 'DIRECT_EXPENSE', 'Direct Company Expense'
    EMPLOYEE_CLAIM = 'EMPLOYEE_CLAIM', 'Employee Expense Claim'
    PETTY_CASH_EXPENSE = 'PETTY_CASH_EXPENSE', 'Petty Cash Expense'
    EMPLOYEE_ADVANCE_SETTLEMENT = 'ADVANCE_SETTLEMENT', 'Advance Settlement'
    REIMBURSEMENT = 'REIMBURSEMENT', 'Reimbursement'


class ExpenseStatus(models.TextChoices):
    DRAFT = 'DRAFT', 'Draft'
    PENDING_APPROVAL = 'PENDING_APPROVAL', 'Pending Approval'
    APPROVED = 'APPROVED', 'Approved'
    PAID = 'PAID', 'Paid'
    REJECTED = 'REJECTED', 'Rejected'
    CANCELLED = 'CANCELLED', 'Cancelled'
    REVERSED = 'REVERSED', 'Reversed'


class ExpensePaymentStatus(models.TextChoices):
    UNPAID = 'UNPAID', 'Unpaid'
    PARTIALLY_PAID = 'PARTIALLY_PAID', 'Partially Paid'
    PAID = 'PAID', 'Paid'


class EmployeeAdvanceType(models.TextChoices):
    SALARY_ADVANCE = 'SALARY_ADVANCE', 'Salary Advance'
    TRAVEL_ADVANCE = 'TRAVEL_ADVANCE', 'Travel Advance'
    SITE_ADVANCE = 'SITE_ADVANCE', 'Site / Field Advance'
    EMERGENCY_ADVANCE = 'EMERGENCY_ADVANCE', 'Emergency Advance'
    OPERATIONAL_ADVANCE = 'OPERATIONAL_ADVANCE', 'Operational Advance'
    OTHER = 'OTHER', 'Other'


class AdvanceStatus(models.TextChoices):
    DRAFT = 'DRAFT', 'Draft'
    PENDING_APPROVAL = 'PENDING_APPROVAL', 'Pending Approval'
    APPROVED = 'APPROVED', 'Approved'
    PAID = 'PAID', 'Paid'
    SETTLED = 'SETTLED', 'Fully Settled'
    REJECTED = 'REJECTED', 'Rejected'
    CANCELLED = 'CANCELLED', 'Cancelled'


class AdvanceRecoveryMethod(models.TextChoices):
    EXPENSE_SETTLEMENT = 'EXPENSE_SETTLEMENT', 'Expense Settlement'
    PAYROLL_DEDUCTION = 'PAYROLL_DEDUCTION', 'Payroll Deduction'
    CASH_RETURN = 'CASH_RETURN', 'Cash Return'
    MIXED = 'MIXED', 'Mixed / Multiple'


class ExpenseCategory(BaseModel):
    name = models.CharField(max_length=150)
    code = models.CharField(max_length=50, blank=True, default='')
    description = models.TextField(blank=True, default='')
    default_expense_account = models.ForeignKey(
        'finance.ChartOfAccount',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='expense_categories'
    )
    is_active = models.BooleanField(default=True)

    class Meta(BaseModel.Meta):
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'name'],
                condition=models.Q(is_deleted=False),
                name='unique_company_expense_category_name'
            )
        ]

    def clean(self):
        super().clean()
        if self.default_expense_account_id and str(self.default_expense_account.company_id) != str(self.company_id):
            raise ValidationError({'default_expense_account': 'Account must belong to the same company.'})

    def __str__(self):
        return f"{self.name} ({self.code})" if self.code else self.name


class EmployeeAdvance(BaseModel):
    advance_number = models.CharField(max_length=50, blank=True, default='')
    employee = models.ForeignKey('hrm.Employee', on_delete=models.RESTRICT, related_name='advances')
    advance_type = models.CharField(
        max_length=30,
        choices=EmployeeAdvanceType.choices,
        default=EmployeeAdvanceType.OPERATIONAL_ADVANCE
    )
    amount = models.DecimalField(max_digits=15, decimal_places=4)
    settled_amount = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    returned_amount = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    outstanding_balance = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    
    advance_date = models.DateField(default=timezone.now)
    expected_settlement_date = models.DateField(null=True, blank=True)
    recovery_method = models.CharField(
        max_length=30,
        choices=AdvanceRecoveryMethod.choices,
        default=AdvanceRecoveryMethod.EXPENSE_SETTLEMENT
    )
    purpose = models.TextField(blank=True, default='')
    status = models.CharField(max_length=30, choices=AdvanceStatus.choices, default=AdvanceStatus.DRAFT)
    
    bank_account = models.ForeignKey('finance.BankAccount', null=True, blank=True, on_delete=models.RESTRICT, related_name='employee_advances')
    voucher = models.ForeignKey('finance.FinancialVoucher', null=True, blank=True, on_delete=models.SET_NULL, related_name='employee_advances')
    payroll_deduction_ready = models.BooleanField(default=False)
    
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='created_advances')
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='approved_advances')
    approved_at = models.DateTimeField(null=True, blank=True)
    paid_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='paid_advances')
    paid_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True, default='')

    class Meta(BaseModel.Meta):
        ordering = ['-advance_date', '-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'advance_number'],
                condition=models.Q(is_deleted=False) & ~models.Q(advance_number=''),
                name='unique_active_advance_number'
            )
        ]

    def clean(self):
        super().clean()
        if self.employee_id and str(self.employee.company_id) != str(self.company_id):
            raise ValidationError({'employee': 'Employee must belong to the same company.'})
        if self.bank_account_id and str(self.bank_account.company_id) != str(self.company_id):
            raise ValidationError({'bank_account': 'Bank account must belong to the same company.'})
        if self.voucher_id and str(self.voucher.company_id) != str(self.company_id):
            raise ValidationError({'voucher': 'Voucher must belong to the same company.'})

    def save(self, *args, **kwargs):
        if not self.advance_number and self.company_id:
            from erp_core.models import DocumentSequence
            adv_date = self.advance_date or timezone.now().date()
            prefix = f"ADV-{adv_date.strftime('%Y%m')}"
            seq, _ = DocumentSequence.objects.select_for_update().get_or_create(
                company=self.company,
                document_type="EMPLOYEE_ADVANCE",
                prefix=prefix,
                defaults={'current_number': 0}
            )
            seq.current_number += 1
            seq.save(update_fields=['current_number'])
            self.advance_number = f"{prefix}-{seq.current_number:04d}"

        amt = Decimal(str(self.amount or '0.0000')).quantize(Decimal('0.0001'))
        self.amount = amt
        self.settled_amount = Decimal(str(self.settled_amount or '0.0000')).quantize(Decimal('0.0001'))
        self.returned_amount = Decimal(str(self.returned_amount or '0.0000')).quantize(Decimal('0.0001'))
        
        # Calculate outstanding
        calculated_out = amt - self.settled_amount - self.returned_amount
        self.outstanding_balance = max(Decimal('0.0000'), calculated_out)
        
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.advance_number} - {self.employee} ({self.amount}) [{self.status}]"


class Expense(BaseModel):
    expense_number = models.CharField(max_length=50, blank=True, default='')
    expense_date = models.DateField(default=timezone.now)
    expense_type = models.CharField(
        max_length=30,
        choices=ExpenseType.choices,
        default=ExpenseType.DIRECT_EXPENSE
    )
    category = models.ForeignKey(
        ExpenseCategory,
        null=True, blank=True,
        on_delete=models.RESTRICT,
        related_name='expenses'
    )
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default='')
    payee = models.CharField(max_length=200, blank=True, default='')
    
    vendor = models.ForeignKey('purchasing.Vendor', null=True, blank=True, on_delete=models.SET_NULL, related_name='direct_expenses')
    employee = models.ForeignKey('hrm.Employee', null=True, blank=True, on_delete=models.SET_NULL, related_name='expense_claims')
    
    amount = models.DecimalField(max_digits=15, decimal_places=4)
    tax_amount = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    total_amount = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    currency = models.ForeignKey('finance.Currency', null=True, blank=True, on_delete=models.RESTRICT)
    payment_method = models.CharField(max_length=30, choices=PaymentMethod.choices, default=PaymentMethod.CASH)
    
    bank_account = models.ForeignKey('finance.BankAccount', null=True, blank=True, on_delete=models.RESTRICT, related_name='expenses')
    expense_account = models.ForeignKey('finance.ChartOfAccount', null=True, blank=True, on_delete=models.RESTRICT, related_name='expenses')
    cost_center = models.ForeignKey('finance.CostCenter', null=True, blank=True, on_delete=models.RESTRICT, related_name='expenses')
    profit_center = models.ForeignKey('finance.ProfitCenter', null=True, blank=True, on_delete=models.RESTRICT, related_name='expenses')
    client = models.ForeignKey('crm.CRMEntity', null=True, blank=True, on_delete=models.RESTRICT, related_name='expenses')
    contract = models.ForeignKey('operations.ServiceContract', null=True, blank=True, on_delete=models.RESTRICT, related_name='expenses')
    site = models.ForeignKey('operations.OperationalSite', null=True, blank=True, on_delete=models.RESTRICT, related_name='expenses')
    
    status = models.CharField(max_length=30, choices=ExpenseStatus.choices, default=ExpenseStatus.DRAFT)
    payment_status = models.CharField(max_length=30, choices=ExpensePaymentStatus.choices, default=ExpensePaymentStatus.UNPAID)
    paid_amount = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    
    voucher = models.ForeignKey('finance.FinancialVoucher', null=True, blank=True, on_delete=models.SET_NULL, related_name='expenses')
    advance = models.ForeignKey(EmployeeAdvance, null=True, blank=True, on_delete=models.SET_NULL, related_name='settlement_expenses')
    is_split_allocation = models.BooleanField(default=False)
    
    receipt_reference = models.CharField(max_length=150, blank=True, default='')
    receipt_url = models.CharField(max_length=500, blank=True, default='')
    notes = models.TextField(blank=True, default='')
    rejection_reason = models.TextField(blank=True, default='')
    reversal_reason = models.TextField(blank=True, default='')
    
    # Audit trail
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='created_expenses')
    submitted_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='submitted_expenses')
    submitted_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='approved_expenses')
    approved_at = models.DateTimeField(null=True, blank=True)
    rejected_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='rejected_expenses')
    rejected_at = models.DateTimeField(null=True, blank=True)
    paid_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='paid_expenses')
    paid_at = models.DateTimeField(null=True, blank=True)
    reversed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='reversed_expenses')
    reversed_at = models.DateTimeField(null=True, blank=True)

    class Meta(BaseModel.Meta):
        ordering = ['-expense_date', '-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'expense_number'],
                condition=models.Q(is_deleted=False) & ~models.Q(expense_number=''),
                name='unique_active_expense_number'
            )
        ]
        indexes = [
            models.Index(fields=['company', 'expense_type', 'expense_date']),
            models.Index(fields=['company', 'status']),
            models.Index(fields=['company', 'payment_status']),
            models.Index(fields=['company', 'employee']),
            models.Index(fields=['company', 'cost_center']),
            models.Index(fields=['company', 'site']),
        ]

    def clean(self):
        super().clean()
        if self.category_id and str(self.category.company_id) != str(self.company_id):
            raise ValidationError({'category': 'Category must belong to the same company.'})
        if self.vendor_id and str(self.vendor.company_id) != str(self.company_id):
            raise ValidationError({'vendor': 'Vendor must belong to the same company.'})
        if self.employee_id and str(self.employee.company_id) != str(self.company_id):
            raise ValidationError({'employee': 'Employee must belong to the same company.'})
        if self.currency_id and str(self.currency.company_id) != str(self.company_id):
            raise ValidationError({'currency': 'Currency must belong to the same company.'})
        if self.bank_account_id and str(self.bank_account.company_id) != str(self.company_id):
            raise ValidationError({'bank_account': 'Bank account must belong to the same company.'})
        if self.expense_account_id and str(self.expense_account.company_id) != str(self.company_id):
            raise ValidationError({'expense_account': 'Expense GL account must belong to the same company.'})
        if self.cost_center_id and str(self.cost_center.company_id) != str(self.company_id):
            raise ValidationError({'cost_center': 'Cost center must belong to the same company.'})
        if self.profit_center_id and str(self.profit_center.company_id) != str(self.company_id):
            raise ValidationError({'profit_center': 'Profit center must belong to the same company.'})
        if self.client_id and str(self.client.company_id) != str(self.company_id):
            raise ValidationError({'client': 'Client must belong to the same company.'})
        if self.contract_id and str(self.contract.company_id) != str(self.company_id):
            raise ValidationError({'contract': 'Contract must belong to the same company.'})
        if self.site_id and str(self.site.company_id) != str(self.company_id):
            raise ValidationError({'site': 'Operational site must belong to the same company.'})
        if self.voucher_id and str(self.voucher.company_id) != str(self.company_id):
            raise ValidationError({'voucher': 'Voucher must belong to the same company.'})
        if self.advance_id and str(self.advance.company_id) != str(self.company_id):
            raise ValidationError({'advance': 'Advance must belong to the same company.'})

    def save(self, *args, **kwargs):
        if not self.expense_number and self.company_id:
            from erp_core.models import DocumentSequence
            exp_date = self.expense_date or timezone.now().date()
            prefix = f"EXP-{exp_date.strftime('%Y%m')}"
            seq, _ = DocumentSequence.objects.select_for_update().get_or_create(
                company=self.company,
                document_type="EXPENSE",
                prefix=prefix,
                defaults={'current_number': 0}
            )
            seq.current_number += 1
            seq.save(update_fields=['current_number'])
            self.expense_number = f"{prefix}-{seq.current_number:04d}"

        amt = Decimal(str(self.amount or '0.0000')).quantize(Decimal('0.0001'))
        tax = Decimal(str(self.tax_amount or '0.0000')).quantize(Decimal('0.0001'))
        self.amount = amt
        self.tax_amount = tax
        if not self.total_amount:
            self.total_amount = amt + tax
        else:
            self.total_amount = Decimal(str(self.total_amount)).quantize(Decimal('0.0001'))

        # Default GL account from category if not set
        if not self.expense_account_id and self.category and self.category.default_expense_account:
            self.expense_account = self.category.default_expense_account

        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.expense_number} - {self.title} ({self.total_amount}) [{self.status}]"


class ExpenseAllocation(BaseModel):
    expense = models.ForeignKey(Expense, on_delete=models.CASCADE, related_name='allocations')
    amount = models.DecimalField(max_digits=15, decimal_places=4)
    percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    cost_center = models.ForeignKey('finance.CostCenter', null=True, blank=True, on_delete=models.RESTRICT)
    profit_center = models.ForeignKey('finance.ProfitCenter', null=True, blank=True, on_delete=models.RESTRICT)
    client = models.ForeignKey('crm.CRMEntity', null=True, blank=True, on_delete=models.RESTRICT)
    contract = models.ForeignKey('operations.ServiceContract', null=True, blank=True, on_delete=models.RESTRICT)
    site = models.ForeignKey('operations.OperationalSite', null=True, blank=True, on_delete=models.RESTRICT)
    department = models.ForeignKey('hrm.Department', null=True, blank=True, on_delete=models.RESTRICT)
    description = models.CharField(max_length=255, blank=True, default='')

    def clean(self):
        super().clean()
        if self.cost_center_id and str(self.cost_center.company_id) != str(self.company_id):
            raise ValidationError({'cost_center': 'Cost center must belong to the same company.'})
        if self.profit_center_id and str(self.profit_center.company_id) != str(self.company_id):
            raise ValidationError({'profit_center': 'Profit center must belong to the same company.'})
        if self.client_id and str(self.client.company_id) != str(self.company_id):
            raise ValidationError({'client': 'Client must belong to the same company.'})
        if self.contract_id and str(self.contract.company_id) != str(self.company_id):
            raise ValidationError({'contract': 'Contract must belong to the same company.'})
        if self.site_id and str(self.site.company_id) != str(self.company_id):
            raise ValidationError({'site': 'Operational site must belong to the same company.'})
        if self.department_id and str(self.department.company_id) != str(self.company_id):
            raise ValidationError({'department': 'Department must belong to the same company.'})

    def __str__(self):
        return f"Allocation for {self.expense.expense_number}: {self.amount}"


class PettyCashCustodian(BaseModel):
    bank_account = models.OneToOneField('finance.BankAccount', on_delete=models.CASCADE, related_name='custodian_profile')
    custodian = models.ForeignKey('hrm.Employee', null=True, blank=True, on_delete=models.SET_NULL, related_name='petty_cash_custodies')
    custodian_user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='petty_cash_user_custodies')
    float_limit = models.DecimalField(max_digits=15, decimal_places=4, default=50000)
    replenishment_threshold = models.DecimalField(max_digits=15, decimal_places=4, default=10000)
    max_single_expense_limit = models.DecimalField(max_digits=15, decimal_places=4, default=15000)
    is_active = models.BooleanField(default=True)

    def clean(self):
        super().clean()
        if self.bank_account_id and str(self.bank_account.company_id) != str(self.company_id):
            raise ValidationError({'bank_account': 'Bank account must belong to the same company.'})
        if self.custodian_id and str(self.custodian.company_id) != str(self.company_id):
            raise ValidationError({'custodian': 'Custodian employee must belong to the same company.'})

    def __str__(self):
        return f"Custodian for {self.bank_account.account_title}: {self.custodian or self.custodian_user}"


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

class AccountType(models.TextChoices):
    ASSET = 'ASSET', 'Asset'
    LIABILITY = 'LIABILITY', 'Liability'
    EQUITY = 'EQUITY', 'Equity'
    REVENUE = 'REVENUE', 'Revenue'
    COST_OF_SERVICE = 'COST_OF_SERVICE', 'Cost of Service / COGS'
    EXPENSE = 'EXPENSE', 'Expense'
    OTHER_INCOME = 'OTHER_INCOME', 'Other Income'
    OTHER_EXPENSE = 'OTHER_EXPENSE', 'Other Expense'


class CashFlowCategory(models.TextChoices):
    OPERATING = 'OPERATING', 'Operating Activities'
    INVESTING = 'INVESTING', 'Investing Activities'
    FINANCING = 'FINANCING', 'Financing Activities'
    NON_CASH = 'NON_CASH', 'Non-Cash Item'

class NormalBalance(models.TextChoices):
    DEBIT = 'DEBIT', 'Debit'
    CREDIT = 'CREDIT', 'Credit'

class PeriodStatus(models.TextChoices):
    OPEN = 'OPEN', 'Open'
    SOFT_CLOSED = 'SOFT_CLOSED', 'Soft Closed'
    CLOSED = 'CLOSED', 'Closed'
    LOCKED = 'LOCKED', 'Locked'

class BankAccountType(models.TextChoices):
    BANK = 'BANK', 'Bank'
    CASH = 'CASH', 'Cash'
    PETTY_CASH = 'PETTY_CASH', 'Petty Cash'
    WALLET = 'WALLET', 'Digital Wallet'

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
    account_group = models.ForeignKey(AccountGroup, null=True, blank=True, on_delete=models.RESTRICT)
    parent = models.ForeignKey('self', null=True, blank=True, on_delete=models.RESTRICT, related_name='children')
    account_code = models.CharField(max_length=50)
    account_name = models.CharField(max_length=200)
    account_type = models.CharField(max_length=50, choices=AccountType.choices)
    normal_balance = models.CharField(max_length=10, choices=NormalBalance.choices, blank=True, default=NormalBalance.DEBIT)
    currency = models.ForeignKey('Currency', null=True, blank=True, on_delete=models.RESTRICT)
    opening_balance = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    current_balance = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    is_header = models.BooleanField(default=False)
    allow_posting = models.BooleanField(default=True)
    is_control_account = models.BooleanField(default=False)
    is_system_controlled = models.BooleanField(default=False)
    allow_manual_entries = models.BooleanField(default=True)
    cash_flow_category = models.CharField(max_length=30, choices=CashFlowCategory.choices, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    description = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        constraints = [
            UniqueConstraint(fields=['company', 'account_code'], name='unique_company_account_code_finance')
        ]
        ordering = ['account_code']

    def clean(self):
        super().clean()
        if self.account_type:
            val_upper = str(self.account_type).upper().replace(' ', '_')
            mapping = {
                'ASSET': AccountType.ASSET,
                'LIABILITY': AccountType.LIABILITY,
                'EQUITY': AccountType.EQUITY,
                'REVENUE': AccountType.REVENUE,
                'INCOME': AccountType.REVENUE,
                'COST_OF_SERVICE': AccountType.COST_OF_SERVICE,
                'COGS': AccountType.COST_OF_SERVICE,
                'COST_OF_SALES': AccountType.COST_OF_SERVICE,
                'EXPENSE': AccountType.EXPENSE,
                'OTHER_INCOME': AccountType.OTHER_INCOME,
                'OTHER_EXPENSE': AccountType.OTHER_EXPENSE
            }
            if val_upper in mapping:
                self.account_type = mapping[val_upper]

        if self.parent and self.parent.company_id != self.company_id:
            raise ValidationError("Parent account must belong to the same company.")
        if self.parent and self.parent_id == self.id:
            raise ValidationError("An account cannot be its own parent.")
        if self.account_group and self.account_group.company_id != self.company_id:
            raise ValidationError("Account group must belong to the same company.")
        if self.currency and self.currency.company_id != self.company_id:
            raise ValidationError("Currency must belong to the same company.")
        if self.is_header:
            self.allow_posting = False
        if not self.normal_balance:
            if self.account_type in [AccountType.LIABILITY, AccountType.EQUITY, AccountType.REVENUE, AccountType.OTHER_INCOME, 'LIABILITY', 'EQUITY', 'INCOME', 'REVENUE', 'OTHER_INCOME']:
                self.normal_balance = NormalBalance.CREDIT
            else:
                self.normal_balance = NormalBalance.DEBIT

    def delete(self, *args, **kwargs):
        if self.is_system_controlled:
            raise ValidationError("System-controlled accounts cannot be deleted.")
        if self.children.filter(is_deleted=False).exists():
            raise ValidationError("Cannot delete an account that has sub-accounts.")
        from .models import JournalEntryLine
        if JournalEntryLine.objects.filter(account=self, is_deleted=False).exists():
            raise ValidationError("Cannot delete an account with existing journal entry lines.")
        super().delete(*args, **kwargs)

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
    month = models.PositiveSmallIntegerField(default=1)
    period_number = models.PositiveSmallIntegerField(default=1)
    start_date = models.DateField()
    end_date = models.DateField()
    status = models.CharField(max_length=20, choices=PeriodStatus.choices, default=PeriodStatus.OPEN)

    # Phase S-4K Period Closing Audit & Lifecycle Fields
    soft_closed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='soft_closed_periods')
    soft_closed_at = models.DateTimeField(null=True, blank=True)
    finalized_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='finalized_periods')
    finalized_at = models.DateTimeField(null=True, blank=True)
    locked_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='locked_periods')
    locked_at = models.DateTimeField(null=True, blank=True)
    reopened_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='reopened_periods')
    reopened_at = models.DateTimeField(null=True, blank=True)
    review_notes = models.TextField(blank=True, default='')
    close_notes = models.TextField(blank=True, default='')
    checklist_snapshot = models.JSONField(default=dict, blank=True)

    class Meta(BaseModel.Meta):
        constraints = [
            UniqueConstraint(fields=['company', 'fiscal_year', 'month'], name='unique_company_fy_month')
        ]
        ordering = ['start_date']
        permissions = [
            ("view_period_close", "Can view period close status and checklist"),
            ("run_close_checks", "Can run period close readiness checks"),
            ("soft_close_period", "Can soft close accounting period"),
            ("post_closing_adjustment", "Can post adjustment entries during soft close"),
            ("final_close_period", "Can perform final close on accounting period"),
            ("lock_period", "Can lock closed accounting period"),
            ("reopen_period", "Can reopen closed or soft-closed accounting period"),
            ("view_bank_reconciliation", "Can view bank statement reconciliations"),
            ("import_bank_statement", "Can import bank statements"),
            ("auto_match_bank", "Can auto match bank statement transactions"),
            ("manual_match_bank", "Can manually match bank statement transactions"),
            ("create_bank_adjustment", "Can create bank charge adjustments"),
            ("close_bank_reconciliation", "Can close bank statement reconciliation"),
            ("view_subledger_reconciliation", "Can view subledger reconciliations"),
            ("resolve_reconciliation_exception", "Can resolve reconciliation exceptions"),
            ("perform_cash_count", "Can perform physical cash counts"),
        ]

    def clean(self):
        super().clean()
        if self.fiscal_year and self.fiscal_year.company_id != self.company_id:
            raise ValidationError("Fiscal year must belong to the same company.")
        if not self.period_number and self.month:
            self.period_number = self.month
        elif not self.month and self.period_number:
            self.month = self.period_number

    def __str__(self):
        return f"Period {self.period_number or self.month} ({self.get_status_display()}) - {self.fiscal_year.name}"


class JournalType(models.TextChoices):
    GENERAL = 'GENERAL', 'General Journal'
    SALES = 'SALES', 'Sales Journal'
    RECEIPTS = 'RECEIPTS', 'Receipts Journal'
    PURCHASE = 'PURCHASE', 'Purchase Journal'
    PAYMENTS = 'PAYMENTS', 'Payments Journal'
    PAYROLL = 'PAYROLL', 'Payroll Journal'
    TAX = 'TAX', 'Tax Journal'
    EXPENSE = 'EXPENSE', 'Expense Journal'
    CASH = 'CASH', 'Cash Journal'
    BANK = 'BANK', 'Bank Journal'
    CONTRA = 'CONTRA', 'Contra Journal'
    ADJUSTMENT = 'ADJUSTMENT', 'Adjustment Journal'
    OPENING_BALANCE = 'OPENING_BALANCE', 'Opening Balance Journal'


class JournalStatus(models.TextChoices):
    DRAFT = 'DRAFT', 'Draft'
    PENDING_APPROVAL = 'PENDING_APPROVAL', 'Pending Approval'
    APPROVED = 'APPROVED', 'Approved'
    POSTED = 'POSTED', 'Posted'
    REVERSED = 'REVERSED', 'Reversed'
    CANCELLED = 'CANCELLED', 'Cancelled'


class JournalSourceType(models.TextChoices):
    CLIENT_INVOICE = 'CLIENT_INVOICE', 'Client Invoice'
    CLIENT_RECEIPT = 'CLIENT_RECEIPT', 'Client Receipt / Collection'
    VENDOR_BILL = 'VENDOR_BILL', 'Vendor Bill / Invoice'
    VENDOR_PAYMENT = 'VENDOR_PAYMENT', 'Vendor Payment'
    PURCHASE_RETURN = 'PURCHASE_RETURN', 'Purchase Return'
    VENDOR_CREDIT_NOTE = 'VENDOR_CREDIT_NOTE', 'Vendor Credit Note'
    EXPENSE = 'EXPENSE', 'Direct Expense / Claim'
    PAYROLL_ACCRUAL = 'PAYROLL_ACCRUAL', 'Payroll Accrual'
    SALARY_PAYMENT = 'SALARY_PAYMENT', 'Salary Payment Batch'
    TAX_PAYMENT = 'TAX_PAYMENT', 'Tax Payment / Challan'
    TAX_ADJUSTMENT = 'TAX_ADJUSTMENT', 'Tax Adjustment'
    CONTRA_TRANSFER = 'CONTRA_TRANSFER', 'Treasury Contra Transfer'
    MANUAL_JOURNAL = 'MANUAL_JOURNAL', 'Manual Journal'
    OPENING_BALANCE = 'OPENING_BALANCE', 'Opening Balance'


class Journal(BaseModel):
    code = models.CharField(max_length=50)
    name = models.CharField(max_length=100)
    journal_type = models.CharField(max_length=30, choices=JournalType.choices, default=JournalType.GENERAL)
    description = models.TextField(blank=True, default='')
    is_active = models.BooleanField(default=True)

    class Meta(BaseModel.Meta):
        constraints = [
            UniqueConstraint(fields=['company', 'code'], name='unique_company_journal_code')
        ]

    def clean(self):
        super().clean()
        if not self.code:
            raise ValidationError({'code': 'Journal code is required.'})

    def __str__(self):
        return f"{self.code} - {self.name}"


class JournalEntry(BaseModel):
    journal = models.ForeignKey(Journal, on_delete=models.RESTRICT, related_name='entries')
    entry_number = models.CharField(max_length=100, blank=True, default='')
    entry_date = models.DateField(default=timezone.now)
    posting_date = models.DateField(null=True, blank=True)
    document_date = models.DateField(null=True, blank=True)
    
    status = models.CharField(max_length=20, choices=JournalStatus.choices, default=JournalStatus.DRAFT)
    reference = models.CharField(max_length=200, blank=True, default='')
    description = models.TextField(blank=True, default='')
    
    source_type = models.CharField(max_length=50, choices=JournalSourceType.choices, blank=True, default='', db_index=True)
    source_id = models.CharField(max_length=100, blank=True, default='', db_index=True)
    source_number = models.CharField(max_length=100, blank=True, default='', db_index=True)
    posting_event = models.CharField(max_length=50, blank=True, default='ORIGINAL', db_index=True)
    
    currency = models.ForeignKey('finance.Currency', null=True, blank=True, on_delete=models.RESTRICT)
    exchange_rate = models.DecimalField(max_digits=15, decimal_places=6, default=Decimal('1.000000'))
    is_manual = models.BooleanField(default=False)
    
    # Audit & Approval
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.RESTRICT, related_name='finance_journalentries_created')
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.RESTRICT, related_name='finance_journalentries_approved')
    approved_at = models.DateTimeField(null=True, blank=True)
    posted_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.RESTRICT, related_name='finance_journalentries_posted')
    posted_at = models.DateTimeField(null=True, blank=True)
    
    # Reversal tracking
    reversal_of = models.ForeignKey('self', null=True, blank=True, on_delete=models.SET_NULL, related_name='reversals')
    reversed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.RESTRICT, related_name='finance_journalentries_reversed')
    reversed_at = models.DateTimeField(null=True, blank=True)
    reversal_reason = models.TextField(blank=True, default='')

    class Meta(BaseModel.Meta):
        db_table = 'finance_universal_journalentry'
        constraints = [
            UniqueConstraint(fields=['company', 'entry_number'], name='unique_company_entry_number'),
        ]
        indexes = [
            models.Index(fields=['company', 'entry_date']),
            models.Index(fields=['company', 'status']),
            models.Index(fields=['company', 'source_type', 'source_id']),
        ]

    @property
    def journal_number(self):
        return self.entry_number

    @property
    def total_debit(self):
        from django.db.models import Sum
        val = self.lines.filter(is_deleted=False).aggregate(t=Sum('debit'))['t']
        return val or Decimal('0.0000')

    @property
    def total_credit(self):
        from django.db.models import Sum
        val = self.lines.filter(is_deleted=False).aggregate(t=Sum('credit'))['t']
        return val or Decimal('0.0000')

    def clean(self):
        super().clean()
        if self.journal_id and self.journal.company_id != self.company_id:
            raise ValidationError({"journal": "Journal must belong to the same company."})
        if self.currency and self.currency.company_id != self.company_id:
            raise ValidationError({"currency": "Currency must belong to the same company."})

        # Set default posting_date / document_date if omitted
        if not self.posting_date:
            self.posting_date = self.entry_date
        if not self.document_date:
            self.document_date = self.entry_date

        if self.pk:
            orig = JournalEntry.objects.filter(pk=self.pk).first()
            # Once posted, no modifications allowed except transitioning to REVERSED
            if orig and orig.status == JournalStatus.POSTED and self.status not in [JournalStatus.POSTED, JournalStatus.REVERSED]:
                raise ValidationError("Cannot modify or cancel a posted journal entry directly. Use reversal.")

        if self.status == JournalStatus.POSTED:
            # Accounting Period Check
            p_date = self.posting_date or self.entry_date
            if p_date:
                from .models import AccountingPeriod
                period = AccountingPeriod.objects.filter(
                    company=self.company,
                    start_date__lte=p_date,
                    end_date__gte=p_date
                ).first()
                if not period:
                    raise ValidationError({"entry_date": "No accounting period found for the given entry date."})
                if period.status in ['CLOSED', 'LOCKED'] and self.source_type != 'YEAR_END_CLOSE' and getattr(self, 'posting_event', '') != 'FY_CLOSE':
                    raise ValidationError({"entry_date": f"Cannot post into a {period.status.lower()} accounting period."})

            # Double-entry balance check (only if instance already exists with lines)
            if self.pk:
                from django.db.models import Sum
                aggregates = self.lines.filter(is_deleted=False).aggregate(t_debit=Sum('debit'), t_credit=Sum('credit'))
                t_debit = (aggregates['t_debit'] or Decimal('0.0000')).quantize(Decimal('0.0001'))
                t_credit = (aggregates['t_credit'] or Decimal('0.0001')).quantize(Decimal('0.0001'))

                if t_debit == Decimal('0.0000') and t_credit == Decimal('0.0000'):
                    raise ValidationError("Empty journal entries cannot be posted.")
                if t_debit != t_credit:
                    raise ValidationError(f"Debits ({t_debit}) and credits ({t_credit}) must balance exactly.")

    def save(self, *args, **kwargs):
        if not self.entry_number and self.company_id:
            from erp_core.models import DocumentSequence
            p_date = self.entry_date or timezone.now().date()
            prefix = f"JE-{p_date.strftime('%Y%m')}"
            seq, _ = DocumentSequence.objects.select_for_update().get_or_create(
                company=self.company,
                document_type="JOURNAL_ENTRY",
                prefix=prefix,
                defaults={'current_number': 0}
            )
            seq.current_number += 1
            seq.save(update_fields=['current_number'])
            self.entry_number = f"{prefix}-{seq.current_number:06d}"

        if not self.posting_date:
            self.posting_date = self.entry_date
        if not self.document_date:
            self.document_date = self.entry_date

        self.clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if self.status == JournalStatus.POSTED:
            raise ValidationError("Cannot delete a posted journal entry.")
        super().delete(*args, **kwargs)

    def __str__(self):
        return f"{self.entry_number} ({self.status})"


class CostCenter(BaseModel):
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=50)
    parent = models.ForeignKey('self', null=True, blank=True, on_delete=models.RESTRICT, related_name='children')
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    
    class Meta(BaseModel.Meta):
        constraints = [
            UniqueConstraint(fields=['company', 'code'], name='unique_company_cost_center_code')
        ]
        ordering = ['code']

    def clean(self):
        super().clean()
        if self.parent and self.parent.company_id != self.company_id:
            raise ValidationError("Parent must belong to the same company.")
        if self.parent and self.parent_id == self.id:
            raise ValidationError("A cost center cannot be its own parent.")
            
    def __str__(self):
        return f"{self.code} - {self.name}"


class ProfitCenter(BaseModel):
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=50)
    parent = models.ForeignKey('self', null=True, blank=True, on_delete=models.RESTRICT, related_name='children')
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta(BaseModel.Meta):
        constraints = [
            UniqueConstraint(fields=['company', 'code'], name='unique_company_profit_center_code')
        ]
        ordering = ['code']

    def clean(self):
        super().clean()
        if self.parent and self.parent.company_id != self.company_id:
            raise ValidationError("Parent must belong to the same company.")
        if self.parent and self.parent_id == self.id:
            raise ValidationError("A profit center cannot be its own parent.")

    def __str__(self):
        return f"{self.code} - {self.name}"


class JournalEntryLine(BaseModel):
    journal_entry = models.ForeignKey(JournalEntry, on_delete=models.CASCADE, related_name='lines')
    account = models.ForeignKey(ChartOfAccount, on_delete=models.RESTRICT, related_name='journal_lines')
    description = models.CharField(max_length=255, blank=True, default='')
    debit = models.DecimalField(max_digits=15, decimal_places=4, default=Decimal('0.0000'))
    credit = models.DecimalField(max_digits=15, decimal_places=4, default=Decimal('0.0000'))
    currency = models.ForeignKey('Currency', null=True, blank=True, on_delete=models.RESTRICT)
    exchange_rate = models.DecimalField(max_digits=15, decimal_places=6, default=Decimal('1.000000'))
    base_amount = models.DecimalField(max_digits=15, decimal_places=4, default=Decimal('0.0000'))
    
    # Financial dimensions
    cost_center = models.ForeignKey(CostCenter, null=True, blank=True, on_delete=models.RESTRICT, related_name='journal_lines')
    profit_center = models.ForeignKey(ProfitCenter, null=True, blank=True, on_delete=models.RESTRICT, related_name='journal_lines')
    crm_entity = models.ForeignKey('crm.CRMEntity', null=True, blank=True, on_delete=models.RESTRICT, related_name='journal_lines')
    contract = models.ForeignKey('operations.ServiceContract', null=True, blank=True, on_delete=models.RESTRICT, related_name='journal_lines')
    site = models.ForeignKey('operations.OperationalSite', null=True, blank=True, on_delete=models.RESTRICT, related_name='journal_lines')
    vendor = models.ForeignKey('purchasing.Vendor', null=True, blank=True, on_delete=models.RESTRICT, related_name='journal_lines')
    employee = models.ForeignKey('hrm.Employee', null=True, blank=True, on_delete=models.RESTRICT, related_name='journal_lines')
    source_line_reference = models.CharField(max_length=150, blank=True, default='')

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
        indexes = [
            models.Index(fields=['company', 'account']),
            models.Index(fields=['company', 'cost_center']),
            models.Index(fields=['company', 'profit_center']),
            models.Index(fields=['company', 'crm_entity']),
        ]

    def clean(self):
        super().clean()
        if self.journal_entry and self.journal_entry.company_id != self.company_id:
            raise ValidationError({"journal_entry": "JournalEntry must belong to the same company."})
        if self.account:
            if self.account.company_id != self.company_id:
                raise ValidationError({"account": "Account must belong to the same company."})
            if not self.account.is_active:
                raise ValidationError({"account": "Cannot post to an inactive account."})
            if self.account.is_header:
                raise ValidationError({"account": "Cannot post directly to a header account."})
            if not self.account.allow_posting:
                raise ValidationError({"account": "Account does not allow direct postings."})

        if self.currency and self.currency.company_id != self.company_id:
            raise ValidationError({"currency": "Currency must belong to the same company."})
        if self.cost_center and self.cost_center.company_id != self.company_id:
            raise ValidationError({"cost_center": "CostCenter must belong to the same company."})
        if self.profit_center and self.profit_center.company_id != self.company_id:
            raise ValidationError({"profit_center": "ProfitCenter must belong to the same company."})
        if self.crm_entity and self.crm_entity.company_id != self.company_id:
            raise ValidationError({"crm_entity": "CRMEntity must belong to the same company."})
        if self.contract and self.contract.company_id != self.company_id:
            raise ValidationError({"contract": "Contract must belong to the same company."})
        if self.site and self.site.company_id != self.company_id:
            raise ValidationError({"site": "Site must belong to the same company."})
        if self.vendor and self.vendor.company_id != self.company_id:
            raise ValidationError({"vendor": "Vendor must belong to the same company."})
        if self.employee and self.employee.company_id != self.company_id:
            raise ValidationError({"employee": "Employee must belong to the same company."})
        
        d = Decimal(str(self.debit or '0.0000')).quantize(Decimal('0.0001'))
        c = Decimal(str(self.credit or '0.0000')).quantize(Decimal('0.0001'))
        self.debit = d
        self.credit = c

        if d == Decimal('0.0000') and c == Decimal('0.0000'):
            raise ValidationError("Either debit or credit must be positive.")
        if d > Decimal('0.0000') and c > Decimal('0.0000'):
            raise ValidationError("Both debit and credit cannot be positive.")

        # Immutability Check
        if self.journal_entry and self.journal_entry.status == JournalStatus.POSTED:
            if self.pk:
                raise ValidationError("Cannot modify lines of a posted journal entry.")
            else:
                raise ValidationError("Cannot add lines to a posted journal entry.")

    def save(self, *args, **kwargs):
        # Calculate base_amount (debit is positive, credit is negative in base currency)
        xr = Decimal(str(self.exchange_rate or '1.000000'))
        net = (self.debit - self.credit) * xr
        self.base_amount = net.quantize(Decimal('0.0001'))
        self.clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if self.journal_entry and self.journal_entry.status == JournalStatus.POSTED:
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


class TaxCategory(models.TextChoices):
    OUTPUT_TAX = 'OUTPUT_TAX', 'Output Tax (Sales Tax / VAT on Revenue)'
    INPUT_TAX = 'INPUT_TAX', 'Input Tax (Purchase Tax / VAT on Purchases)'
    WITHHOLDING_RECEIVABLE = 'WITHHOLDING_RECEIVABLE', 'Withholding Receivable (Deducted by Clients)'
    WITHHOLDING_PAYABLE = 'WITHHOLDING_PAYABLE', 'Withholding Payable (Deducted from Vendors)'
    PAYROLL_TAX = 'PAYROLL_TAX', 'Payroll Tax (Employee Income Tax)'
    OTHER_TAX = 'OTHER_TAX', 'Other Tax / Surcharge'


class TaxRecoverability(models.TextChoices):
    RECOVERABLE = 'RECOVERABLE', 'Fully Recoverable'
    NON_RECOVERABLE = 'NON_RECOVERABLE', 'Non-Recoverable'
    PARTIALLY_RECOVERABLE = 'PARTIALLY_RECOVERABLE', 'Partially Recoverable'


class TaxAuthority(BaseModel):
    name = models.CharField(max_length=150)
    code = models.CharField(max_length=50, blank=True, default='')
    jurisdiction = models.CharField(max_length=100, default='Federal')
    registration_number = models.CharField(max_length=100, blank=True, default='')
    portal_reference = models.CharField(max_length=255, blank=True, default='')
    description = models.TextField(blank=True, default='')
    is_active = models.BooleanField(default=True)

    class Meta(BaseModel.Meta):
        verbose_name_plural = "Tax Authorities"
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'name'],
                condition=models.Q(is_deleted=False),
                name='unique_company_tax_authority_name'
            )
        ]

    def __str__(self):
        return f"{self.name} ({self.jurisdiction})"


class TaxGroup(BaseModel):
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)

    def __str__(self):
        return self.name


class TaxCode(BaseModel):
    code = models.CharField(max_length=50)
    name = models.CharField(max_length=100)
    rate = models.DecimalField(max_digits=7, decimal_places=4, default=0)
    tax_category = models.CharField(max_length=30, choices=TaxCategory.choices, default=TaxCategory.OUTPUT_TAX)
    tax_type = models.CharField(max_length=30, choices=[
        ('SALES', 'Sales'),
        ('PURCHASE', 'Purchase'),
        ('VAT', 'VAT'),
        ('GST', 'GST'),
        ('SERVICE', 'Service'),
        ('WITHHOLDING', 'Withholding'),
    ], default='SERVICE')
    tax_group = models.ForeignKey(TaxGroup, null=True, blank=True, on_delete=models.RESTRICT, related_name='tax_codes')
    tax_authority = models.ForeignKey(TaxAuthority, null=True, blank=True, on_delete=models.RESTRICT, related_name='tax_codes')
    jurisdiction = models.CharField(max_length=100, blank=True, default='Federal')
    effective_from = models.DateField(default=timezone.now)
    effective_to = models.DateField(null=True, blank=True)
    recoverability = models.CharField(max_length=30, choices=TaxRecoverability.choices, default=TaxRecoverability.RECOVERABLE)
    is_withholding = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    description = models.TextField(blank=True, default='')

    # Account mappings (same-company posting accounts)
    output_tax_account = models.ForeignKey('ChartOfAccount', null=True, blank=True, on_delete=models.RESTRICT, related_name='+')
    input_tax_account = models.ForeignKey('ChartOfAccount', null=True, blank=True, on_delete=models.RESTRICT, related_name='+')
    withholding_payable_account = models.ForeignKey('ChartOfAccount', null=True, blank=True, on_delete=models.RESTRICT, related_name='+')
    withholding_receivable_account = models.ForeignKey('ChartOfAccount', null=True, blank=True, on_delete=models.RESTRICT, related_name='+')

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'code'],
                condition=models.Q(is_deleted=False),
                name='unique_company_tax_code'
            )
        ]

    def clean(self):
        super().clean()
        if self.tax_group and self.tax_group.company_id != self.company_id:
            raise ValidationError("TaxGroup must belong to the same company.")
        if self.tax_authority and self.tax_authority.company_id != self.company_id:
            raise ValidationError("TaxAuthority must belong to the same company.")
        for acc_field in ['output_tax_account', 'input_tax_account', 'withholding_payable_account', 'withholding_receivable_account']:
            acc = getattr(self, acc_field)
            if acc and acc.company_id != self.company_id:
                raise ValidationError(f"{acc_field} must belong to the same company.")

    def __str__(self):
        return f"{self.code} - {self.name} ({self.rate}%)"


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
# PHASE C-6 & S-4D: CASH, BANK, TREASURY & FINANCIAL VOUCHERS
# ==============================================================================

class BankAccount(BaseModel):
    account_type = models.CharField(max_length=20, choices=BankAccountType.choices, default=BankAccountType.BANK)
    bank_name = models.CharField(max_length=100, blank=True)
    account_title = models.CharField(max_length=150)
    account_number = models.CharField(max_length=50, blank=True)
    iban = models.CharField(max_length=50, blank=True)
    branch_name = models.CharField(max_length=100, blank=True)
    currency = models.ForeignKey('Currency', null=True, blank=True, on_delete=models.RESTRICT)
    chart_of_account = models.ForeignKey(ChartOfAccount, on_delete=models.RESTRICT, related_name='bank_accounts')
    opening_balance = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    current_balance = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    opening_balance_date = models.DateField(null=True, blank=True)
    opening_balance_reference = models.CharField(max_length=100, blank=True, default='')
    opening_balance_set_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='set_bank_opening_balances'
    )
    is_opening_balance_locked = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'account_number'],
                condition=models.Q(is_active=True) & ~models.Q(account_number=''),
                name='unique_active_bank_account'
            )
        ]
        ordering = ['account_title']

    def clean(self):
        super().clean()
        if self.chart_of_account_id and str(self.chart_of_account.company_id) != str(self.company_id):
            raise ValidationError({'chart_of_account': 'Chart of account must belong to the same company.'})
        if self.chart_of_account_id and self.chart_of_account.account_type not in [AccountType.ASSET, 'ASSET']:
            raise ValidationError({'chart_of_account': 'Bank/Cash account must be linked to an Asset account.'})
        if self.currency and self.currency.company_id != self.company_id:
            raise ValidationError({'currency': 'Currency must belong to the same company.'})

    def __str__(self):
        return f"{self.account_title} ({self.get_account_type_display()})"

    @property
    def account_name(self):
        return self.account_title

    @property
    def gl_account(self):
        return self.chart_of_account


class SecurityFinanceConfiguration(BaseModel):
    accounts_receivable_account = models.ForeignKey(ChartOfAccount, null=True, blank=True, on_delete=models.RESTRICT, related_name='+')
    accounts_payable_account = models.ForeignKey(ChartOfAccount, null=True, blank=True, on_delete=models.RESTRICT, related_name='+')
    payroll_payable_account = models.ForeignKey(ChartOfAccount, null=True, blank=True, on_delete=models.RESTRICT, related_name='+')
    tax_payable_account = models.ForeignKey(ChartOfAccount, null=True, blank=True, on_delete=models.RESTRICT, related_name='+')
    security_service_revenue_account = models.ForeignKey(ChartOfAccount, null=True, blank=True, on_delete=models.RESTRICT, related_name='+')
    overtime_revenue_account = models.ForeignKey(ChartOfAccount, null=True, blank=True, on_delete=models.RESTRICT, related_name='+')
    extra_duty_revenue_account = models.ForeignKey(ChartOfAccount, null=True, blank=True, on_delete=models.RESTRICT, related_name='+')
    salary_cost_account = models.ForeignKey(ChartOfAccount, null=True, blank=True, on_delete=models.RESTRICT, related_name='+')
    overtime_cost_account = models.ForeignKey(ChartOfAccount, null=True, blank=True, on_delete=models.RESTRICT, related_name='+')
    inventory_equipment_account = models.ForeignKey(ChartOfAccount, null=True, blank=True, on_delete=models.RESTRICT, related_name='+')
    default_bank_account = models.ForeignKey(BankAccount, null=True, blank=True, on_delete=models.RESTRICT, related_name='+')
    default_currency = models.ForeignKey('Currency', null=True, blank=True, on_delete=models.RESTRICT, related_name='+')
    is_active = models.BooleanField(default=True)

    class Meta(BaseModel.Meta):
        constraints = [
            UniqueConstraint(fields=['company'], condition=Q(is_active=True), name='unique_active_security_finance_config')
        ]

    def clean(self):
        super().clean()
        accounts = [
            self.accounts_receivable_account, self.accounts_payable_account,
            self.payroll_payable_account, self.tax_payable_account,
            self.security_service_revenue_account, self.overtime_revenue_account,
            self.extra_duty_revenue_account, self.salary_cost_account,
            self.overtime_cost_account, self.inventory_equipment_account
        ]
        for acc in accounts:
            if acc and acc.company_id != self.company_id:
                raise ValidationError(f"Account {acc} must belong to the same company.")
        if self.default_bank_account and self.default_bank_account.company_id != self.company_id:
            raise ValidationError("Bank account must belong to the same company.")
        if self.default_currency and self.default_currency.company_id != self.company_id:
            raise ValidationError("Currency must belong to the same company.")

    def __str__(self):
        return f"Security Finance Configuration ({self.company.name})"


class VoucherType(models.TextChoices):
    RECEIPT_VOUCHER = 'RECEIPT_VOUCHER', 'Receipt Voucher'
    PAYMENT_VOUCHER = 'PAYMENT_VOUCHER', 'Payment Voucher'
    BANK_RECEIPT = 'BANK_RECEIPT', 'Bank Receipt'
    BANK_PAYMENT = 'BANK_PAYMENT', 'Bank Payment'
    CASH_RECEIPT = 'CASH_RECEIPT', 'Cash Receipt'
    CASH_PAYMENT = 'CASH_PAYMENT', 'Cash Payment'
    CONTRA_VOUCHER = 'CONTRA_VOUCHER', 'Contra Voucher'
    JOURNAL_VOUCHER = 'JOURNAL_VOUCHER', 'Journal Voucher'
    PETTY_CASH_VOUCHER = 'PETTY_CASH_VOUCHER', 'Petty Cash Voucher'
    # Backward compatibility:
    PAYMENT = 'PAYMENT', 'Payment Voucher (Legacy)'
    RECEIPT = 'RECEIPT', 'Receipt Voucher (Legacy)'
    CONTRA = 'CONTRA', 'Contra Voucher (Legacy)'
    JOURNAL = 'JOURNAL', 'Journal Voucher (Legacy)'


class VoucherStatus(models.TextChoices):
    DRAFT = 'DRAFT', 'Draft'
    PENDING_APPROVAL = 'PENDING_APPROVAL', 'Pending Approval'
    APPROVED = 'APPROVED', 'Approved'
    POSTED = 'POSTED', 'Posted'
    REVERSED = 'REVERSED', 'Reversed'
    CANCELLED = 'CANCELLED', 'Cancelled'


class FinancialVoucher(BaseModel):
    voucher_type = models.CharField(max_length=30, choices=VoucherType.choices)
    voucher_number = models.CharField(max_length=100, blank=True, default='')
    date = models.DateField()
    
    # Treasury Account Links
    bank_account = models.ForeignKey(
        BankAccount,
        null=True, blank=True,
        on_delete=models.RESTRICT,
        related_name='vouchers',
        help_text='Primary treasury bank/cash/wallet account'
    )
    destination_bank_account = models.ForeignKey(
        BankAccount,
        null=True, blank=True,
        on_delete=models.RESTRICT,
        related_name='contra_destination_vouchers',
        help_text='Destination treasury account for contra transfers'
    )
    payment_account = models.ForeignKey(
        ChartOfAccount,
        null=True, blank=True,
        on_delete=models.RESTRICT,
        related_name='vouchers',
        help_text='Direct Chart of Account link'
    )
    
    currency = models.ForeignKey('Currency', null=True, blank=True, on_delete=models.RESTRICT)
    exchange_rate = models.DecimalField(max_digits=15, decimal_places=6, default=1)
    
    amount = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    total_amount = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    
    payment_method = models.CharField(max_length=30, choices=PaymentMethod.choices, default=PaymentMethod.CASH)
    reference = models.CharField(max_length=100, blank=True, default='')
    description = models.TextField(blank=True, default='')
    
    # Counterparty Details
    payee_name = models.CharField(max_length=200, blank=True, default='')
    counterparty_name = models.CharField(max_length=200, blank=True, default='')
    customer = models.ForeignKey('crm.CRMEntity', null=True, blank=True, on_delete=models.SET_NULL, related_name='vouchers')
    
    status = models.CharField(max_length=30, choices=VoucherStatus.choices, default=VoucherStatus.DRAFT)
    
    journal_entry = models.ForeignKey(JournalEntry, null=True, blank=True, on_delete=models.RESTRICT, related_name='vouchers')
    
    # Audit & Approval Trails
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='created_financial_vouchers')
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='approved_financial_vouchers')
    approved_at = models.DateTimeField(null=True, blank=True)
    posted_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='posted_financial_vouchers')
    posted_at = models.DateTimeField(null=True, blank=True)
    reversed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='reversed_financial_vouchers')
    reversed_at = models.DateTimeField(null=True, blank=True)
    reversal_reason = models.TextField(blank=True, default='')
    reversal_voucher = models.ForeignKey('self', null=True, blank=True, on_delete=models.SET_NULL, related_name='reversed_vouchers')
    
    # Source Document Traceability & Idempotency
    source_module = models.CharField(max_length=50, blank=True, default='')
    source_document_type = models.CharField(max_length=100, blank=True, default='')
    source_document_id = models.UUIDField(null=True, blank=True)

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'voucher_number'],
                condition=models.Q(is_deleted=False) & ~models.Q(voucher_number=''),
                name='unique_active_voucher_number'
            ),
            models.UniqueConstraint(
                fields=['company', 'source_document_type', 'source_document_id'],
                condition=models.Q(is_deleted=False) & ~models.Q(source_document_id=None) & ~models.Q(status=VoucherStatus.CANCELLED),
                name='unique_source_document_voucher'
            )
        ]
        indexes = [
            models.Index(fields=['company', 'voucher_type', 'date']),
            models.Index(fields=['company', 'status']),
            models.Index(fields=['company', 'source_document_type', 'source_document_id']),
        ]

    def clean(self):
        super().clean()
        if self.bank_account_id and str(self.bank_account.company_id) != str(self.company_id):
            raise ValidationError({'bank_account': 'Bank account must belong to the same company.'})
        if self.destination_bank_account_id and str(self.destination_bank_account.company_id) != str(self.company_id):
            raise ValidationError({'destination_bank_account': 'Destination account must belong to the same company.'})
        if self.destination_bank_account_id and self.bank_account_id == self.destination_bank_account_id:
            raise ValidationError({'destination_bank_account': 'Source and destination accounts cannot be identical.'})
        if self.payment_account_id and str(self.payment_account.company_id) != str(self.company_id):
            raise ValidationError({'payment_account': 'Account must belong to the same company.'})
        if self.customer_id and str(self.customer.company_id) != str(self.company_id):
            raise ValidationError({'customer': 'Customer/Entity must belong to the same company.'})
        if self.currency_id and str(self.currency.company_id) != str(self.company_id):
            raise ValidationError({'currency': 'Currency must belong to the same company.'})

    def save(self, *args, **kwargs):
        if not self.voucher_number:
            from erp_core.models import DocumentSequence
            vtype = self.voucher_type
            prefix_map = {
                VoucherType.PAYMENT_VOUCHER: 'PV',
                VoucherType.PAYMENT: 'PV',
                VoucherType.RECEIPT_VOUCHER: 'RV',
                VoucherType.RECEIPT: 'RV',
                VoucherType.BANK_RECEIPT: 'BR',
                VoucherType.BANK_PAYMENT: 'BP',
                VoucherType.CASH_RECEIPT: 'CR',
                VoucherType.CASH_PAYMENT: 'CP',
                VoucherType.CONTRA_VOUCHER: 'CV',
                VoucherType.CONTRA: 'CV',
                VoucherType.JOURNAL_VOUCHER: 'JV',
                VoucherType.JOURNAL: 'JV',
                VoucherType.PETTY_CASH_VOUCHER: 'PCV',
            }
            code = prefix_map.get(vtype, 'FV')
            date_str = self.date.strftime('%Y%m') if self.date else '2026'
            prefix = f"{code}-{date_str}"
            self.voucher_number = DocumentSequence.get_next_number(self.company, "VOUCHER", prefix)

        # Sync amount and total_amount
        if self.amount and not self.total_amount:
            self.total_amount = self.amount
        elif self.total_amount and not self.amount:
            self.amount = self.total_amount

        # Sync payee_name and counterparty_name
        if self.payee_name and not self.counterparty_name:
            self.counterparty_name = self.payee_name
        elif self.counterparty_name and not self.payee_name:
            self.payee_name = self.counterparty_name

        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.voucher_number} - {self.get_voucher_type_display()} ({self.total_amount}) [{self.status}]"


class FinancialVoucherLine(BaseModel):
    voucher = models.ForeignKey(FinancialVoucher, on_delete=models.CASCADE, related_name='lines')
    account = models.ForeignKey(ChartOfAccount, on_delete=models.RESTRICT)
    amount = models.DecimalField(max_digits=15, decimal_places=4)
    description = models.CharField(max_length=255, blank=True, default='')
    cost_center = models.ForeignKey(CostCenter, null=True, blank=True, on_delete=models.RESTRICT)
    profit_center = models.ForeignKey(ProfitCenter, null=True, blank=True, on_delete=models.RESTRICT)
    
    # Optional relation to a specific invoice
    invoice = models.ForeignKey('billing.ServiceInvoice', null=True, blank=True, on_delete=models.SET_NULL, related_name='voucher_lines')

    def clean(self):
        super().clean()
        if self.account_id and str(self.account.company_id) != str(self.company_id):
            raise ValidationError({'account': 'Account must belong to the same company.'})
        if self.cost_center_id and str(self.cost_center.company_id) != str(self.company_id):
            raise ValidationError({'cost_center': 'Cost center must belong to the same company.'})
        if self.profit_center_id and str(self.profit_center.company_id) != str(self.company_id):
            raise ValidationError({'profit_center': 'Profit center must belong to the same company.'})
        if self.invoice_id and str(self.invoice.company_id) != str(self.company_id):
            raise ValidationError({'invoice': 'Invoice must belong to the same company.'})

    def __str__(self):
        return f"{self.voucher.voucher_number} - {self.account.account_code}: {self.amount}"


class TreasuryTransactionType(models.TextChoices):
    MONEY_IN = 'MONEY_IN', 'Money In'
    MONEY_OUT = 'MONEY_OUT', 'Money Out'
    TRANSFER_IN = 'TRANSFER_IN', 'Transfer In'
    TRANSFER_OUT = 'TRANSFER_OUT', 'Transfer Out'
    OPENING_BALANCE = 'OPENING_BALANCE', 'Opening Balance'


class TreasuryTransaction(BaseModel):
    """
    Operational cash & bank ledger tracking all movements across Treasury Accounts.
    Provides running operational balances prior to final General Ledger posting.
    """
    bank_account = models.ForeignKey(
        BankAccount,
        on_delete=models.CASCADE,
        related_name='treasury_transactions'
    )
    transaction_date = models.DateField()
    voucher = models.ForeignKey(
        FinancialVoucher,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='treasury_transactions'
    )
    transaction_type = models.CharField(
        max_length=30,
        choices=TreasuryTransactionType.choices,
        default=TreasuryTransactionType.MONEY_IN
    )
    reference = models.CharField(max_length=100, blank=True, default='')
    description = models.TextField(blank=True, default='')
    money_in = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    money_out = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    running_balance = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    status = models.CharField(max_length=20, default='POSTED')
    is_reversal = models.BooleanField(default=False)
    
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='created_treasury_transactions'
    )
    reversed_at = models.DateTimeField(null=True, blank=True)
    reversed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='reversed_treasury_transactions'
    )

    class Meta(BaseModel.Meta):
        ordering = ['-transaction_date', '-created_at']
        indexes = [
            models.Index(fields=['company', 'bank_account', 'transaction_date']),
        ]

    def clean(self):
        super().clean()
        if self.bank_account_id and str(self.bank_account.company_id) != str(self.company_id):
            raise ValidationError({'bank_account': 'Bank account must belong to the same company.'})
        if self.voucher_id and str(self.voucher.company_id) != str(self.company_id):
            raise ValidationError({'voucher': 'Voucher must belong to the same company.'})

    def __str__(self):
        return f"{self.bank_account.account_title}: +{self.money_in} / -{self.money_out} (Bal: {self.running_balance})"


class ChequeStatus(models.TextChoices):
    ISSUED = 'ISSUED', 'Issued'
    RECEIVED = 'RECEIVED', 'Received'
    DEPOSITED = 'DEPOSITED', 'Deposited'
    CLEARED = 'CLEARED', 'Cleared'
    BOUNCED = 'BOUNCED', 'Bounced'
    CANCELLED = 'CANCELLED', 'Cancelled'


class Cheque(BaseModel):
    cheque_number = models.CharField(max_length=100)
    bank_account = models.ForeignKey(
        BankAccount,
        null=True, blank=True,
        on_delete=models.RESTRICT,
        related_name='cheques'
    )
    voucher = models.ForeignKey(
        FinancialVoucher,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='cheques'
    )
    issue_date = models.DateField()
    due_date = models.DateField(null=True, blank=True)
    clearing_date = models.DateField(null=True, blank=True)
    amount = models.DecimalField(max_digits=15, decimal_places=4)
    
    payee_name = models.CharField(max_length=200, blank=True, default='')
    payer_name = models.CharField(max_length=200, blank=True, default='')
    drawer_bank = models.CharField(max_length=150, blank=True, default='')
    
    status = models.CharField(max_length=20, choices=ChequeStatus.choices, default=ChequeStatus.ISSUED)
    notes = models.TextField(blank=True, default='')
    
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='created_cheques'
    )
    cleared_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='cleared_cheques'
    )
    bounced_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='bounced_cheques'
    )
    bounce_reason = models.TextField(blank=True, default='')
    
    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'bank_account', 'cheque_number'],
                condition=models.Q(is_deleted=False) & models.Q(status__in=[ChequeStatus.ISSUED, ChequeStatus.DEPOSITED, ChequeStatus.CLEARED]),
                name='unique_active_cheque'
            )
        ]
        ordering = ['-issue_date', '-created_at']

    def clean(self):
        super().clean()
        if self.bank_account_id and str(self.bank_account.company_id) != str(self.company_id):
            raise ValidationError({'bank_account': 'Bank account must belong to the same company.'})
        if self.voucher_id and str(self.voucher.company_id) != str(self.company_id):
            raise ValidationError({'voucher': 'Voucher must belong to the same company.'})

    def __str__(self):
        return f"Cheque {self.cheque_number} - {self.amount} [{self.status}]"


class ReconciliationStatus(models.TextChoices):
    DRAFT = 'DRAFT', 'Draft'
    IN_PROGRESS = 'IN_PROGRESS', 'In Progress'
    RECONCILED = 'RECONCILED', 'Reconciled'
    CLOSED = 'CLOSED', 'Closed'


class MatchStatus(models.TextChoices):
    AUTO_MATCHED = 'AUTO_MATCHED', 'Auto Matched'
    MANUALLY_MATCHED = 'MANUALLY_MATCHED', 'Manually Matched'
    PARTIAL_MATCH = 'PARTIAL_MATCH', 'Partial Match'
    UNMATCHED = 'UNMATCHED', 'Unmatched'
    IGNORED_WITH_REASON = 'IGNORED_WITH_REASON', 'Ignored with Reason'


class BankStatement(BaseModel):
    bank_account = models.ForeignKey(BankAccount, on_delete=models.CASCADE, related_name='statements')
    statement_number = models.CharField(max_length=50, blank=True, default='')
    statement_date = models.DateField(null=True, blank=True)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    opening_balance = models.DecimalField(max_digits=15, decimal_places=4, default=Decimal('0.0000'))
    closing_balance = models.DecimalField(max_digits=15, decimal_places=4, default=Decimal('0.0000'))
    file_import_hash = models.CharField(max_length=64, blank=True, default='', db_index=True)
    status = models.CharField(max_length=20, choices=ReconciliationStatus.choices, default=ReconciliationStatus.DRAFT)
    reconciled_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='reconciled_bank_statements')
    reconciled_at = models.DateTimeField(null=True, blank=True)
    closed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='closed_bank_statements')
    closed_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True, default='')

    class Meta(BaseModel.Meta):
        ordering = ['-end_date', '-created_at']

    def clean(self):
        super().clean()
        if self.bank_account_id and str(self.bank_account.company_id) != str(self.company_id):
            raise ValidationError({'bank_account': 'Bank account must belong to the same company.'})

    def __str__(self):
        return f"{self.bank_account.account_name} - {self.statement_number or self.end_date}"


class BankStatementLine(BaseModel):
    statement = models.ForeignKey(BankStatement, on_delete=models.CASCADE, related_name='lines')
    statement_date = models.DateField(null=True, blank=True)
    transaction_date = models.DateField(null=True, blank=True)
    bank_reference = models.CharField(max_length=100, blank=True, default='')
    reference = models.CharField(max_length=100, blank=True, default='')
    external_transaction_id = models.CharField(max_length=100, blank=True, default='', db_index=True)
    description = models.CharField(max_length=255, blank=True, default='')
    debit = models.DecimalField(max_digits=15, decimal_places=4, default=Decimal('0.0000'))
    credit = models.DecimalField(max_digits=15, decimal_places=4, default=Decimal('0.0000'))
    running_balance = models.DecimalField(max_digits=15, decimal_places=4, null=True, blank=True)
    match_status = models.CharField(max_length=30, choices=MatchStatus.choices, default=MatchStatus.UNMATCHED)
    status = models.CharField(max_length=20, default='UNMATCHED')
    matched_treasury_transaction = models.ForeignKey('TreasuryTransaction', null=True, blank=True, on_delete=models.SET_NULL, related_name='matched_statement_lines')
    matched_financial_voucher = models.ForeignKey('FinancialVoucher', null=True, blank=True, on_delete=models.SET_NULL, related_name='matched_statement_lines')
    matched_cheque = models.ForeignKey('Cheque', null=True, blank=True, on_delete=models.SET_NULL, related_name='matched_statement_lines')
    matched_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='matched_bank_lines')
    matched_at = models.DateTimeField(null=True, blank=True)
    match_method = models.CharField(max_length=50, blank=True, default='')
    match_reason = models.TextField(blank=True, default='')
    ignore_reason = models.TextField(blank=True, default='')
    adjustment_journal = models.ForeignKey('JournalEntry', null=True, blank=True, on_delete=models.SET_NULL, related_name='bank_statement_adjustments')
    journal_entry_line = models.ForeignKey('JournalEntryLine', null=True, blank=True, on_delete=models.SET_NULL, related_name='reconciliations')

    class Meta(BaseModel.Meta):
        ordering = ['statement_date', 'id']

    def clean(self):
        super().clean()
        if self.journal_entry_line_id and str(self.journal_entry_line.company_id) != str(self.company_id):
            raise ValidationError({'journal_entry_line': 'Journal entry line must belong to the same company.'})

    def __str__(self):
        return f"{self.statement_date or self.transaction_date} - {self.description}"


# ==============================================================================
# PHASE S-4F: PURCHASING → FINANCE ACCOUNTING INTEGRATION
# ==============================================================================

class PurchasingIntegrationSourceType(models.TextChoices):
    VENDOR_BILL = 'VENDOR_BILL', 'Vendor Bill / Invoice'
    VENDOR_PAYMENT = 'VENDOR_PAYMENT', 'Vendor Payment'
    PURCHASE_RETURN = 'PURCHASE_RETURN', 'Purchase Return'
    VENDOR_CREDIT_NOTE = 'VENDOR_CREDIT_NOTE', 'Vendor Credit Note'


class PurchasingAccountingStatus(models.TextChoices):
    PENDING_CLASSIFICATION = 'PENDING_CLASSIFICATION', 'Pending Classification'
    READY = 'READY', 'Ready for GL Posting'
    BLOCKED = 'BLOCKED', 'Blocked (Missing Mapping/Period/Tenant)'
    POSTED_LATER = 'POSTED_LATER', 'Posted Later'
    REVERSED = 'REVERSED', 'Reversed / Voided'


class PurchasingItemAccountMapping(BaseModel):
    """
    Tenant-scoped accounting mapping rules for inventory items, item categories, or expense categories.
    Determines the debit account classification for purchasing line items.
    """
    item = models.ForeignKey('inventory.Item', on_delete=models.CASCADE, null=True, blank=True, related_name='accounting_mappings')
    item_category = models.ForeignKey('inventory.Category', on_delete=models.CASCADE, null=True, blank=True, related_name='purchasing_accounting_mappings')
    expense_category = models.ForeignKey('finance.ExpenseCategory', on_delete=models.CASCADE, null=True, blank=True, related_name='purchasing_mappings')
    
    account_classification = models.CharField(
        max_length=50,
        default='INVENTORY_ASSET',
        choices=(
            ('INVENTORY_ASSET', 'Inventory Asset'),
            ('OPERATING_EXPENSE', 'Operating Expense'),
            ('FIXED_ASSET', 'Fixed Asset'),
            ('PREPAID_EXPENSE', 'Prepaid Expense'),
            ('OTHER', 'Other')
        )
    )
    debit_account = models.ForeignKey(ChartOfAccount, on_delete=models.RESTRICT, related_name='purchasing_item_debit_mappings')
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta(BaseModel.Meta):
        verbose_name_plural = "Purchasing Item Account Mappings"

    def clean(self):
        super().clean()
        if self.debit_account_id and str(self.debit_account.company_id) != str(self.company_id):
            raise ValidationError({'debit_account': 'Debit account must belong to the same company.'})
        if self.item_id and str(self.item.company_id) != str(self.company_id):
            raise ValidationError({'item': 'Inventory Item must belong to the same company.'})
        if self.item_category_id and str(self.item_category.company_id) != str(self.company_id):
            raise ValidationError({'item_category': 'Category must belong to the same company.'})
        if self.expense_category_id and str(self.expense_category.company_id) != str(self.company_id):
            raise ValidationError({'expense_category': 'Expense category must belong to the same company.'})

    def __str__(self):
        target = self.item.name if self.item else (self.item_category.name if self.item_category else (self.expense_category.name if self.expense_category else 'Generic'))
        return f"{target} -> {self.debit_account.account_name} ({self.account_classification})"


class PurchasingAccountingIntegration(BaseModel):
    """
    Tenant-aware snapshot and classification record for a purchasing event
    (Vendor Bill, Vendor Payment, Purchase Return, Vendor Credit Note) ready for accounting.
    """
    source_type = models.CharField(max_length=30, choices=PurchasingIntegrationSourceType.choices)
    source_id = models.CharField(max_length=100)
    source_number = models.CharField(max_length=100)
    transaction_date = models.DateField(default=timezone.now)
    
    amount = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    tax_amount = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    currency = models.ForeignKey('Currency', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    currency_code = models.CharField(max_length=10, default='PKR')
    
    status = models.CharField(
        max_length=30,
        choices=PurchasingAccountingStatus.choices,
        default=PurchasingAccountingStatus.PENDING_CLASSIFICATION
    )
    blocking_reason = models.TextField(blank=True)
    
    vendor = models.ForeignKey('purchasing.Vendor', null=True, blank=True, on_delete=models.SET_NULL, related_name='accounting_integrations')
    crm_entity = models.ForeignKey('crm.CRMEntity', null=True, blank=True, on_delete=models.SET_NULL, related_name='purchasing_accounting_integrations')
    purchase_order = models.ForeignKey('purchasing.ProcurementDocument', null=True, blank=True, on_delete=models.SET_NULL, related_name='purchasing_po_integrations')
    
    finance_config = models.ForeignKey(SecurityFinanceConfiguration, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    ap_control_account = models.ForeignKey(ChartOfAccount, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    voucher = models.ForeignKey('FinancialVoucher', null=True, blank=True, on_delete=models.SET_NULL, related_name='purchasing_integrations')
    
    notes = models.TextField(blank=True)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='reviewed_purchasing_integrations')
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(fields=['company', 'source_type', 'source_id'], name='unique_company_purchasing_integration')
        ]
        indexes = [
            models.Index(fields=['company', 'source_type', 'status']),
            models.Index(fields=['company', 'transaction_date']),
        ]
        verbose_name_plural = "Purchasing Accounting Integrations"

    def clean(self):
        super().clean()
        if self.vendor_id and str(self.vendor.company_id) != str(self.company_id):
            raise ValidationError({'vendor': 'Vendor must belong to the same company.'})
        if self.ap_control_account_id and str(self.ap_control_account.company_id) != str(self.company_id):
            raise ValidationError({'ap_control_account': 'AP Control account must belong to the same company.'})
        if self.voucher_id and str(self.voucher.company_id) != str(self.company_id):
            raise ValidationError({'voucher': 'Voucher must belong to the same company.'})
        if self.finance_config_id and str(self.finance_config.company_id) != str(self.company_id):
            raise ValidationError({'finance_config': 'Finance config must belong to the same company.'})

    def __str__(self):
        return f"{self.get_source_type_display()} #{self.source_number} — {self.amount} ({self.status})"


class PurchasingAccountingLinePreview(BaseModel):
    """
    Line-level double-entry accounting preview for purchasing transactions.
    Carries dimensional attribution (Cost Center, Site, Contract, Profit Center, Department).
    """
    integration = models.ForeignKey(PurchasingAccountingIntegration, on_delete=models.CASCADE, related_name='lines')
    source_line_id = models.CharField(max_length=100, blank=True)
    line_number = models.PositiveIntegerField(default=1)
    item_name = models.CharField(max_length=255)
    item_type = models.CharField(max_length=50, default='INVENTORY_ITEM')
    description = models.TextField(blank=True)
    
    amount = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    debit_account = models.ForeignKey(ChartOfAccount, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    credit_account = models.ForeignKey(ChartOfAccount, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    
    cost_center = models.ForeignKey(CostCenter, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    profit_center = models.ForeignKey(ProfitCenter, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    site = models.ForeignKey('operations.OperationalSite', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    contract = models.ForeignKey('operations.ServiceContract', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    department = models.ForeignKey('hrm.Department', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    warehouse = models.ForeignKey('platform_core.Warehouse', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    
    is_tax_line = models.BooleanField(default=False)
    is_unresolved = models.BooleanField(default=False)
    unresolved_reason = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        ordering = ['line_number']
        verbose_name_plural = "Purchasing Accounting Line Previews"

    def clean(self):
        super().clean()
        if self.debit_account_id and str(self.debit_account.company_id) != str(self.company_id):
            raise ValidationError({'debit_account': 'Debit account must belong to the same company.'})
        if self.credit_account_id and str(self.credit_account.company_id) != str(self.company_id):
            raise ValidationError({'credit_account': 'Credit account must belong to the same company.'})
        if self.cost_center_id and str(self.cost_center.company_id) != str(self.company_id):
            raise ValidationError({'cost_center': 'Cost center must belong to the same company.'})
        if self.site_id and str(self.site.company_id) != str(self.company_id):
            raise ValidationError({'site': 'Site must belong to the same company.'})

    def __str__(self):
        return f"Line #{self.line_number}: {self.item_name} ({self.amount})"


# ============================================================================
# PHASE S-4G: PAYROLL -> FINANCE INTEGRATION & SALARY DISBURSEMENT
# ============================================================================

class PayrollAccountingStatus(models.TextChoices):
    PENDING_CLASSIFICATION = 'PENDING_CLASSIFICATION', 'Pending Classification'
    READY = 'READY', 'Ready for Disbursement'
    BLOCKED = 'BLOCKED', 'Blocked'
    PARTIALLY_DISBURSED = 'PARTIALLY_DISBURSED', 'Partially Disbursed'
    SETTLED = 'SETTLED', 'Fully Settled'
    CANCELLED = 'CANCELLED', 'Cancelled'


class PayrollEmployeePaymentStatus(models.TextChoices):
    UNPAID = 'UNPAID', 'Unpaid'
    IN_BATCH = 'IN_BATCH', 'In Payment Batch'
    PAID = 'PAID', 'Paid'
    FAILED = 'FAILED', 'Payment Failed'
    REVERSED = 'REVERSED', 'Payment Reversed'


class SalaryPaymentBatchStatus(models.TextChoices):
    DRAFT = 'DRAFT', 'Draft'
    PENDING_APPROVAL = 'PENDING_APPROVAL', 'Pending Approval'
    APPROVED = 'APPROVED', 'Approved'
    READY_FOR_PAYMENT = 'READY_FOR_PAYMENT', 'Ready for Payment'
    PROCESSING = 'PROCESSING', 'Processing'
    COMPLETED = 'COMPLETED', 'Completed'
    PARTIALLY_COMPLETED = 'PARTIALLY_COMPLETED', 'Partially Completed'
    FAILED = 'FAILED', 'Failed'
    CANCELLED = 'CANCELLED', 'Cancelled'
    REVERSED = 'REVERSED', 'Reversed'


class SalaryPaymentLineStatus(models.TextChoices):
    PENDING = 'PENDING', 'Pending'
    VALIDATED = 'VALIDATED', 'Validated'
    PROCESSING = 'PROCESSING', 'Processing'
    SUCCESS = 'SUCCESS', 'Success'
    FAILED = 'FAILED', 'Failed'
    SKIPPED = 'SKIPPED', 'Skipped'
    REVERSED = 'REVERSED', 'Reversed'


class PayrollAccountMapping(BaseModel):
    """
    Configurable mapping architecture to route salary costs by Employee, Designation,
    Department, or Employment Type to specific ChartOfAccount and CostCenter.
    """
    employee = models.ForeignKey('hrm.Employee', null=True, blank=True, on_delete=models.CASCADE, related_name='+')
    designation = models.ForeignKey('hrm.Designation', null=True, blank=True, on_delete=models.CASCADE, related_name='+')
    department = models.ForeignKey('hrm.Department', null=True, blank=True, on_delete=models.CASCADE, related_name='+')
    employment_type = models.CharField(max_length=50, blank=True, default='')
    
    classification_type = models.CharField(
        max_length=50,
        choices=[
            ('COST_OF_SERVICE', 'Direct Cost of Service (Guards/Field)'),
            ('OPERATING_EXPENSE', 'Operating Expense (HQ/Staff/Admin)'),
            ('DIRECT_COST', 'Direct Site Project Cost'),
        ],
        default='COST_OF_SERVICE'
    )
    salary_expense_account = models.ForeignKey(ChartOfAccount, on_delete=models.RESTRICT, related_name='+')
    overtime_expense_account = models.ForeignKey(ChartOfAccount, null=True, blank=True, on_delete=models.RESTRICT, related_name='+')
    cost_center = models.ForeignKey(CostCenter, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    profit_center = models.ForeignKey(ProfitCenter, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True, default='')

    class Meta(BaseModel.Meta):
        verbose_name_plural = "Payroll Account Mappings"

    def clean(self):
        super().clean()
        if self.salary_expense_account_id and str(self.salary_expense_account.company_id) != str(self.company_id):
            raise ValidationError({'salary_expense_account': 'Salary expense account must belong to the same company.'})
        if self.overtime_expense_account_id and str(self.overtime_expense_account.company_id) != str(self.company_id):
            raise ValidationError({'overtime_expense_account': 'Overtime expense account must belong to the same company.'})
        if self.cost_center_id and str(self.cost_center.company_id) != str(self.company_id):
            raise ValidationError({'cost_center': 'Cost center must belong to the same company.'})
        if self.employee_id and str(self.employee.company_id) != str(self.company_id):
            raise ValidationError({'employee': 'Employee must belong to the same company.'})
        if self.designation_id and str(self.designation.company_id) != str(self.company_id):
            raise ValidationError({'designation': 'Designation must belong to the same company.'})
        if self.department_id and str(self.department.company_id) != str(self.company_id):
            raise ValidationError({'department': 'Department must belong to the same company.'})

    def __str__(self):
        target = f"{self.employee.first_name} {self.employee.last_name}".strip() if self.employee else (self.designation.name if self.designation else (self.department.name if self.department else "Default"))
        return f"Payroll Mapping: {target} -> {self.salary_expense_account.account_code}"


class EmployeePaymentDestination(BaseModel):
    """
    Reusable banking and mobile wallet destination data per employee.
    """
    employee = models.ForeignKey('hrm.Employee', on_delete=models.CASCADE, related_name='payment_destinations')
    payment_method = models.CharField(
        max_length=50,
        choices=[
            ('BANK_TRANSFER', 'Bank Transfer'),
            ('WALLET', 'Mobile Wallet'),
            ('CASH', 'Cash Counter / Disbursal'),
            ('CHEQUE', 'Cheque'),
        ],
        default='BANK_TRANSFER'
    )
    bank_name = models.CharField(max_length=100, blank=True, default='')
    account_title = models.CharField(max_length=150, blank=True, default='')
    account_number = models.CharField(max_length=50, blank=True, default='')
    iban = models.CharField(max_length=50, blank=True, default='')
    wallet_provider = models.CharField(
        max_length=50,
        choices=[
            ('EASYPAISA', 'Easypaisa'),
            ('JAZZCASH', 'JazzCash'),
            ('NAYAPAY', 'NayaPay'),
            ('SADAPAY', 'SadaPay'),
            ('OTHER', 'Other Wallet'),
        ],
        blank=True,
        default=''
    )
    wallet_number = models.CharField(max_length=50, blank=True, default='')
    is_preferred = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)

    class Meta(BaseModel.Meta):
        verbose_name_plural = "Employee Payment Destinations"

    def clean(self):
        super().clean()
        if self.employee_id and str(self.employee.company_id) != str(self.company_id):
            raise ValidationError({'employee': 'Employee must belong to the same company.'})

    def __str__(self):
        dest = self.account_number if self.payment_method == 'BANK_TRANSFER' else self.wallet_number
        return f"{self.employee} ({self.get_payment_method_display()} - {dest})"


class PayrollAccountingIntegration(BaseModel):
    """
    Idempotent snapshot and accounting recognition for an approved/finalized PayrollRun.
    """
    payroll_run = models.ForeignKey('hrm.PayrollRun', on_delete=models.RESTRICT, related_name='finance_integrations')
    payroll_period_name = models.CharField(max_length=150)
    transaction_date = models.DateField()
    
    gross_payroll = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    total_allowances = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    total_overtime = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    total_deductions = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    total_tax = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    total_advance_recovery = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    net_payroll_payable = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    
    total_paid = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    remaining_liability = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    
    status = models.CharField(
        max_length=50,
        choices=PayrollAccountingStatus.choices,
        default=PayrollAccountingStatus.PENDING_CLASSIFICATION
    )
    blocking_reason = models.TextField(blank=True, default='')
    
    payroll_payable_account = models.ForeignKey(ChartOfAccount, null=True, blank=True, on_delete=models.RESTRICT, related_name='+')
    tax_payable_account = models.ForeignKey(ChartOfAccount, null=True, blank=True, on_delete=models.RESTRICT, related_name='+')
    advance_clearing_account = models.ForeignKey(ChartOfAccount, null=True, blank=True, on_delete=models.RESTRICT, related_name='+')
    
    total_employees = models.PositiveIntegerField(default=0)
    unresolved_employees_count = models.PositiveIntegerField(default=0)

    class Meta(BaseModel.Meta):
        constraints = [
            UniqueConstraint(
                fields=['company', 'payroll_run'],
                name='unique_company_payroll_run_finance_integration'
            )
        ]
        verbose_name_plural = "Payroll Accounting Integrations"

    def clean(self):
        super().clean()
        if self.payroll_run_id and str(self.payroll_run.company_id) != str(self.company_id):
            raise ValidationError({'payroll_run': 'Payroll run must belong to the same company.'})
        if self.payroll_payable_account_id and str(self.payroll_payable_account.company_id) != str(self.company_id):
            raise ValidationError({'payroll_payable_account': 'Payroll payable account must belong to the same company.'})

    def __str__(self):
        return f"Payroll Integration: {self.payroll_run.run_number} ({self.status}) - Net: {self.net_payroll_payable}"


class PayrollEmployeeFinanceSnapshot(BaseModel):
    """
    Employee-level snapshot for financial disbursement and multi-dimensional cost routing.
    """
    integration = models.ForeignKey(PayrollAccountingIntegration, on_delete=models.CASCADE, related_name='employee_snapshots')
    employee = models.ForeignKey('hrm.Employee', on_delete=models.RESTRICT, related_name='payroll_finance_snapshots')
    payslip = models.ForeignKey('hrm.Payslip', on_delete=models.RESTRICT, related_name='finance_snapshots')
    
    gross_earnings = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    allowances = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    overtime_pay = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    deductions = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    advance_recovery = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    tax_amount = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    net_salary = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    
    salary_expense_account = models.ForeignKey(ChartOfAccount, null=True, blank=True, on_delete=models.RESTRICT, related_name='+')
    overtime_expense_account = models.ForeignKey(ChartOfAccount, null=True, blank=True, on_delete=models.RESTRICT, related_name='+')
    cost_center = models.ForeignKey(CostCenter, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    profit_center = models.ForeignKey(ProfitCenter, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    site = models.ForeignKey('operations.OperationalSite', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    department = models.ForeignKey('hrm.Department', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    
    payment_status = models.CharField(
        max_length=50,
        choices=PayrollEmployeePaymentStatus.choices,
        default=PayrollEmployeePaymentStatus.UNPAID
    )
    is_unresolved = models.BooleanField(default=False)
    unresolved_reason = models.TextField(blank=True, default='')

    class Meta(BaseModel.Meta):
        constraints = [
            UniqueConstraint(
                fields=['company', 'integration', 'employee'],
                name='unique_integration_employee_finance_snapshot'
            )
        ]
        verbose_name_plural = "Payroll Employee Finance Snapshots"

    def clean(self):
        super().clean()
        if self.employee_id and str(self.employee.company_id) != str(self.company_id):
            raise ValidationError({'employee': 'Employee must belong to the same company.'})
        if self.payslip_id and str(self.payslip.company_id) != str(self.company_id):
            raise ValidationError({'payslip': 'Payslip must belong to the same company.'})

    def __str__(self):
        return f"{self.employee} - Net: {self.net_salary} ({self.payment_status})"


class SalaryPaymentBatch(BaseModel):
    """
    Batch of salary disbursements processed via Manual Bank Confirmation, Bank File Export, or API Provider.
    """
    batch_number = models.CharField(max_length=50)
    payroll_integration = models.ForeignKey(PayrollAccountingIntegration, on_delete=models.RESTRICT, related_name='payment_batches')
    payment_date = models.DateField()
    
    payment_mode = models.CharField(
        max_length=50,
        choices=[
            ('MANUAL', 'Manual Bank / Cash Confirmation'),
            ('BANK_FILE', 'Bank Payment File Export (CSV/Text)'),
            ('API', 'Live Corporate Banking API Provider'),
            ('HOST_TO_HOST', 'Host-to-Host File Transfer'),
        ],
        default='MANUAL'
    )
    payment_provider = models.CharField(
        max_length=50,
        choices=[
            ('MANUAL', 'Manual / Internal Disbursal'),
            ('HBL', 'Habib Bank Limited (HBL)'),
            ('JS_BANK', 'JS Bank Corporate'),
            ('DUBAI_ISLAMIC_BANK', 'Dubai Islamic Bank (DIB)'),
            ('EASYPAISA', 'Easypaisa Corporate Bulk'),
            ('JAZZCASH', 'JazzCash Corporate Bulk'),
            ('OTHER', 'Other Provider'),
        ],
        default='MANUAL'
    )
    treasury_account = models.ForeignKey(BankAccount, on_delete=models.RESTRICT, related_name='+')
    voucher = models.ForeignKey(FinancialVoucher, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    
    total_employees = models.PositiveIntegerField(default=0)
    total_amount = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    successful_amount = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    failed_amount = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    
    status = models.CharField(
        max_length=50,
        choices=SalaryPaymentBatchStatus.choices,
        default=SalaryPaymentBatchStatus.DRAFT
    )
    
    prepared_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    submitted_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    completed_at = models.DateTimeField(null=True, blank=True)
    
    reference = models.CharField(max_length=100, blank=True, default='')
    notes = models.TextField(blank=True, default='')

    class Meta(BaseModel.Meta):
        constraints = [
            UniqueConstraint(
                fields=['company', 'batch_number'],
                name='unique_company_salary_payment_batch_number'
            )
        ]
        verbose_name_plural = "Salary Payment Batches"

    def clean(self):
        super().clean()
        if self.treasury_account_id and str(self.treasury_account.company_id) != str(self.company_id):
            raise ValidationError({'treasury_account': 'Treasury account must belong to the same company.'})
        if self.payroll_integration_id and str(self.payroll_integration.company_id) != str(self.company_id):
            raise ValidationError({'payroll_integration': 'Payroll integration must belong to the same company.'})

    def save(self, *args, **kwargs):
        from erp_core.models import DocumentSequence
        if not self.batch_number:
            date_str = (self.payment_date or timezone.now().date()).strftime("%Y%m")
            self.batch_number = DocumentSequence.get_next_number(self.company, "SALARY_BATCH", f"SPB-{date_str}")
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.batch_number} ({self.get_status_display()}) - PKR {self.total_amount}"


class SalaryPaymentBatchLine(BaseModel):
    """
    Individual employee disbursement transaction within a SalaryPaymentBatch.
    """
    batch = models.ForeignKey(SalaryPaymentBatch, on_delete=models.CASCADE, related_name='lines')
    employee = models.ForeignKey('hrm.Employee', on_delete=models.RESTRICT, related_name='+')
    payslip = models.ForeignKey('hrm.Payslip', on_delete=models.RESTRICT, related_name='+')
    employee_snapshot = models.ForeignKey(PayrollEmployeeFinanceSnapshot, on_delete=models.RESTRICT, related_name='+')
    
    net_salary = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    payment_method = models.CharField(max_length=50, default='BANK_TRANSFER')
    destination_details = models.JSONField(default=dict)
    payment_reference = models.CharField(max_length=100, blank=True, default='')
    
    status = models.CharField(
        max_length=50,
        choices=SalaryPaymentLineStatus.choices,
        default=SalaryPaymentLineStatus.PENDING
    )
    failure_code = models.CharField(max_length=50, blank=True, default='')
    failure_reason = models.TextField(blank=True, default='')
    processed_at = models.DateTimeField(null=True, blank=True)
    
    reversed_at = models.DateTimeField(null=True, blank=True)
    reversed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    reversal_reason = models.TextField(blank=True, default='')

    class Meta(BaseModel.Meta):
        constraints = [
            UniqueConstraint(
                fields=['company', 'batch', 'employee'],
                name='unique_batch_employee_salary_payment_line'
            )
        ]
        verbose_name_plural = "Salary Payment Batch Lines"

    def clean(self):
        super().clean()
        if self.employee_id and str(self.employee.company_id) != str(self.company_id):
            raise ValidationError({'employee': 'Employee must belong to the same company.'})
        if self.payslip_id and str(self.payslip.company_id) != str(self.company_id):
            raise ValidationError({'payslip': 'Payslip must belong to the same company.'})

    def __str__(self):
        return f"{self.batch.batch_number} - {self.employee} ({self.status}) - PKR {self.net_salary}"


class PayrollDisbursementProviderConfig(BaseModel):
    """
    Company-level configuration for salary payment providers and export file adapters.
    """
    provider = models.CharField(max_length=50)
    mode = models.CharField(max_length=50, default='MANUAL')
    corporate_id = models.CharField(max_length=100, blank=True, default='')
    account_number = models.CharField(max_length=100, blank=True, default='')
    file_adapter = models.CharField(max_length=50, default='GENERIC_CSV')
    api_enabled = models.BooleanField(default=False)
    encrypted_credentials = models.TextField(blank=True, default='')
    is_active = models.BooleanField(default=True)

    class Meta(BaseModel.Meta):
        verbose_name_plural = "Payroll Disbursement Provider Configs"

    def __str__(self):
        return f"{self.provider} ({self.mode}) - Company: {self.company.name}"


# ==============================================================================
# PHASE S-4H: TAX MANAGEMENT, TAX INVOICES, WITHHOLDING & TAX VOUCHERS
# ==============================================================================

class TaxTransactionSourceType(models.TextChoices):
    CLIENT_INVOICE = 'CLIENT_INVOICE', 'Client Service Invoice'
    CLIENT_RECEIPT = 'CLIENT_RECEIPT', 'Client Receipt / Settlement'
    VENDOR_BILL = 'VENDOR_BILL', 'Vendor Invoice / Bill'
    VENDOR_PAYMENT = 'VENDOR_PAYMENT', 'Vendor Payment'
    PAYROLL = 'PAYROLL', 'Payroll Run'
    EXPENSE = 'EXPENSE', 'Company Expense'
    ADJUSTMENT = 'ADJUSTMENT', 'Tax Adjustment'


class TaxDirection(models.TextChoices):
    OUTPUT = 'OUTPUT', 'Output (Payable to Authority)'
    INPUT = 'INPUT', 'Input (Recoverable from Authority)'
    WITHHOLDING_IN = 'WITHHOLDING_IN', 'Withheld by Client (Receivable/Credit)'
    WITHHOLDING_OUT = 'WITHHOLDING_OUT', 'Withheld from Vendor (Payable)'


class TaxTransactionStatus(models.TextChoices):
    CALCULATED = 'CALCULATED', 'Calculated'
    POSTED_SOURCE = 'POSTED_SOURCE', 'Posted at Source'
    PAYABLE = 'PAYABLE', 'Payable / Accrued'
    PAID = 'PAID', 'Paid / Deposited'
    FILED = 'FILED', 'Filed in Return'
    CANCELLED = 'CANCELLED', 'Cancelled'
    REVERSED = 'REVERSED', 'Reversed'


class TaxPeriodType(models.TextChoices):
    MONTHLY = 'MONTHLY', 'Monthly'
    QUARTERLY = 'QUARTERLY', 'Quarterly'
    ANNUAL = 'ANNUAL', 'Annual'
    CUSTOM = 'CUSTOM', 'Custom Period'


class TaxPeriodStatus(models.TextChoices):
    OPEN = 'OPEN', 'Open'
    FILED = 'FILED', 'Filed'
    CLOSED = 'CLOSED', 'Closed'


class TaxVoucherStatus(models.TextChoices):
    DRAFT = 'DRAFT', 'Draft'
    APPROVED = 'APPROVED', 'Approved'
    PAID = 'PAID', 'Paid'
    FILED = 'FILED', 'Filed / CPR Issued'
    CANCELLED = 'CANCELLED', 'Cancelled'


class TaxPaymentType(models.TextChoices):
    SALES_TAX = 'SALES_TAX', 'Sales Tax / Output VAT'
    WITHHOLDING_TAX = 'WITHHOLDING_TAX', 'Withholding Tax (Vendor / Contractor)'
    PAYROLL_TAX = 'PAYROLL_TAX', 'Payroll Income Tax (Salaries)'
    INCOME_TAX = 'INCOME_TAX', 'Advance Corporate Income Tax'
    OTHER = 'OTHER', 'Other Duty / Surcharge'


class WithholdingVerificationStatus(models.TextChoices):
    PENDING_VERIFICATION = 'PENDING_VERIFICATION', 'Pending Verification'
    VERIFIED = 'VERIFIED', 'Verified with Authority'
    REJECTED = 'REJECTED', 'Rejected / Invalid'
    EXPIRED = 'EXPIRED', 'Expired'


class VendorWithholdingStatus(models.TextChoices):
    DEDUCTED = 'DEDUCTED', 'Deducted at Payment'
    DEPOSITED = 'DEPOSITED', 'Deposited to Treasury'
    CERTIFICATE_ISSUED = 'CERTIFICATE_ISSUED', 'Certificate Issued to Vendor'
    CANCELLED = 'CANCELLED', 'Cancelled'


class TaxAdjustmentType(models.TextChoices):
    INCREASE_LIABILITY = 'INCREASE_LIABILITY', 'Increase Tax Liability'
    DECREASE_LIABILITY = 'DECREASE_LIABILITY', 'Decrease Tax Liability'
    INCREASE_RECOVERABLE = 'INCREASE_RECOVERABLE', 'Increase Recoverable Tax'
    DECREASE_RECOVERABLE = 'DECREASE_RECOVERABLE', 'Decrease Recoverable Tax'


class CompanyTaxProfile(BaseModel):
    """
    Company-level profile configuration for Tax registrations and default routing codes.
    """
    company = models.OneToOneField('companies.Company', on_delete=models.CASCADE, related_name='tax_profile')
    ntn_number = models.CharField(max_length=50, blank=True, default='', verbose_name="National Tax Number (NTN)")
    strn_number = models.CharField(max_length=50, blank=True, default='', verbose_name="Sales Tax Reg Number (STRN)")
    tax_status = models.CharField(
        max_length=50,
        default='ACTIVE_FILER',
        choices=[
            ('ACTIVE_FILER', 'Active Filer'),
            ('INACTIVE_FILER', 'Inactive / Late Filer'),
            ('NON_FILER', 'Non-Filer'),
            ('EXEMPT', 'Exempt Entity'),
        ]
    )
    default_jurisdiction = models.CharField(max_length=100, default='Federal')
    default_sales_tax_code = models.ForeignKey(TaxCode, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    default_purchase_tax_code = models.ForeignKey(TaxCode, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    default_client_wht_code = models.ForeignKey(TaxCode, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    default_vendor_wht_code = models.ForeignKey(TaxCode, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    is_active = models.BooleanField(default=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Company Tax Profile"
        verbose_name_plural = "Company Tax Profiles"

    def __str__(self):
        return f"Tax Profile: {self.company.name} (NTN: {self.ntn_number or 'Unregistered'})"


class TaxPeriod(BaseModel):
    """
    Tracks tax-specific compliance and reporting periods separate from financial accounting periods.
    """
    name = models.CharField(max_length=100)
    period_type = models.CharField(max_length=20, choices=TaxPeriodType.choices, default=TaxPeriodType.MONTHLY)
    period_start = models.DateField()
    period_end = models.DateField()
    tax_authority = models.ForeignKey(TaxAuthority, null=True, blank=True, on_delete=models.SET_NULL, related_name='tax_periods')
    tax_category = models.CharField(max_length=30, choices=TaxCategory.choices, default=TaxCategory.OUTPUT_TAX)
    due_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=TaxPeriodStatus.choices, default=TaxPeriodStatus.OPEN)
    filed_at = models.DateTimeField(null=True, blank=True)
    filed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    acknowledgement_reference = models.CharField(max_length=100, blank=True, default='')
    notes = models.TextField(blank=True, default='')

    class Meta(BaseModel.Meta):
        ordering = ['-period_end', '-period_start']
        verbose_name_plural = "Tax Periods"
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'period_start', 'period_end', 'tax_category', 'tax_authority'],
                condition=models.Q(is_deleted=False),
                name='unique_company_period_dates_tax_category'
            )
        ]

    def clean(self):
        super().clean()
        if self.period_start and self.period_end and self.period_end < self.period_start:
            raise ValidationError("Period end date cannot be earlier than start date.")
        if self.tax_authority and self.tax_authority.company_id != self.company_id:
            raise ValidationError("Tax authority must belong to the same company.")

    def __str__(self):
        return f"{self.name} ({self.period_start} to {self.period_end}) - {self.get_status_display()}"


class TaxTransaction(BaseModel):
    """
    Universal tax ledger snapshot linking source documents (Client Invoice, Vendor Bill, Payroll, Expense)
    to tax categories, rates, liabilities, and recoverable assets.
    """
    tax_code = models.ForeignKey(TaxCode, on_delete=models.RESTRICT, related_name='tax_transactions')
    tax_category = models.CharField(max_length=30, choices=TaxCategory.choices)
    source_type = models.CharField(max_length=30, choices=TaxTransactionSourceType.choices)
    source_id = models.CharField(max_length=100, db_index=True)
    source_number = models.CharField(max_length=100, blank=True, default='', db_index=True)
    tax_date = models.DateField(db_index=True)
    tax_period = models.ForeignKey(TaxPeriod, null=True, blank=True, on_delete=models.SET_NULL, related_name='transactions')
    counterparty_name = models.CharField(max_length=200, blank=True, default='')
    counterparty_tax_id = models.CharField(max_length=50, blank=True, default='')
    taxable_amount = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    tax_rate = models.DecimalField(max_digits=7, decimal_places=4, default=0)
    tax_amount = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    is_recoverable = models.BooleanField(default=True)
    direction = models.CharField(max_length=20, choices=TaxDirection.choices)
    gl_account = models.ForeignKey('ChartOfAccount', null=True, blank=True, on_delete=models.RESTRICT, related_name='+')
    status = models.CharField(max_length=30, choices=TaxTransactionStatus.choices, default=TaxTransactionStatus.CALCULATED)
    notes = models.TextField(blank=True, default='')

    class Meta(BaseModel.Meta):
        ordering = ['-tax_date', '-created_at']
        verbose_name_plural = "Tax Transactions"
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'source_type', 'source_id', 'tax_code'],
                condition=models.Q(is_deleted=False),
                name='unique_company_source_tax_transaction'
            )
        ]

    def clean(self):
        super().clean()
        if self.tax_code and self.tax_code.company_id != self.company_id:
            raise ValidationError("Tax code must belong to the same company.")
        if self.tax_period and self.tax_period.company_id != self.company_id:
            raise ValidationError("Tax period must belong to the same company.")
        if self.gl_account and self.gl_account.company_id != self.company_id:
            raise ValidationError("GL account must belong to the same company.")

    def __str__(self):
        return f"{self.source_type} #{self.source_number} - {self.tax_code.code}: PKR {self.tax_amount}"


class ClientWithholdingCertificate(BaseModel):
    """
    Evidence and tracking for income / sales tax withheld by clients from our invoices.
    """
    certificate_number = models.CharField(max_length=100, db_index=True)
    client = models.ForeignKey('crm.CRMEntity', on_delete=models.RESTRICT, related_name='withholding_certificates')
    client_invoice = models.ForeignKey('billing.ClientInvoice', null=True, blank=True, on_delete=models.SET_NULL, related_name='withholding_certificates')
    tax_code = models.ForeignKey(TaxCode, on_delete=models.RESTRICT, related_name='client_withholding_certificates')
    tax_period = models.ForeignKey(TaxPeriod, null=True, blank=True, on_delete=models.SET_NULL, related_name='client_withholding_certificates')
    withheld_amount = models.DecimalField(max_digits=15, decimal_places=4)
    gross_taxable_amount = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    certificate_date = models.DateField()
    cpr_challan_no = models.CharField(max_length=100, blank=True, default='', verbose_name="CPR / Challan Number")
    verification_status = models.CharField(
        max_length=30,
        choices=WithholdingVerificationStatus.choices,
        default=WithholdingVerificationStatus.PENDING_VERIFICATION
    )
    verified_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='verified_withholdings')
    verified_at = models.DateTimeField(null=True, blank=True)
    attachment = models.FileField(upload_to='finance/withholding_certificates/%Y/%m/', null=True, blank=True)
    notes = models.TextField(blank=True, default='')

    class Meta(BaseModel.Meta):
        ordering = ['-certificate_date', '-created_at']
        verbose_name_plural = "Client Withholding Certificates"
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'client', 'certificate_number'],
                condition=models.Q(is_deleted=False),
                name='unique_company_client_wht_cert'
            )
        ]

    def clean(self):
        super().clean()
        if self.client and str(self.client.company_id) != str(self.company_id):
            raise ValidationError("Client must belong to the same company.")
        if self.tax_code and self.tax_code.company_id != self.company_id:
            raise ValidationError("Tax code must belong to the same company.")
        if self.client_invoice and str(self.client_invoice.company_id) != str(self.company_id):
            raise ValidationError("Client invoice must belong to the same company.")

    def __str__(self):
        return f"WHT Cert #{self.certificate_number} - {self.client.name} (PKR {self.withheld_amount})"


class VendorWithholdingRecord(BaseModel):
    """
    Tracks tax withheld by us from vendor bills during payment execution,
    prior to deposit into the government treasury.
    """
    vendor = models.ForeignKey('purchasing.Vendor', on_delete=models.RESTRICT, related_name='withholding_records')
    vendor_bill = models.ForeignKey('purchasing.ProcurementDocument', null=True, blank=True, on_delete=models.SET_NULL, related_name='withholding_records')
    vendor_payment = models.ForeignKey('purchasing.VendorPayment', null=True, blank=True, on_delete=models.SET_NULL, related_name='withholding_records')
    tax_code = models.ForeignKey(TaxCode, on_delete=models.RESTRICT, related_name='vendor_withholding_records')
    tax_period = models.ForeignKey(TaxPeriod, null=True, blank=True, on_delete=models.SET_NULL, related_name='vendor_withholding_records')
    taxable_amount = models.DecimalField(max_digits=15, decimal_places=4)
    tax_rate = models.DecimalField(max_digits=7, decimal_places=4)
    withheld_amount = models.DecimalField(max_digits=15, decimal_places=4)
    withheld_date = models.DateField()
    status = models.CharField(max_length=30, choices=VendorWithholdingStatus.choices, default=VendorWithholdingStatus.DEDUCTED)
    cpr_number = models.CharField(max_length=100, blank=True, default='', verbose_name="CPR (Treasury Receipt) No.")
    challan_reference = models.CharField(max_length=100, blank=True, default='')
    certificate_issued_date = models.DateField(null=True, blank=True)
    certificate_number = models.CharField(max_length=100, blank=True, default='')
    notes = models.TextField(blank=True, default='')

    class Meta(BaseModel.Meta):
        ordering = ['-withheld_date', '-created_at']
        verbose_name_plural = "Vendor Withholding Records"

    def clean(self):
        super().clean()
        if self.vendor and str(self.vendor.company_id) != str(self.company_id):
            raise ValidationError("Vendor must belong to the same company.")
        if self.tax_code and self.tax_code.company_id != self.company_id:
            raise ValidationError("Tax code must belong to the same company.")

    def __str__(self):
        return f"Vendor WHT: {self.vendor.name} - PKR {self.withheld_amount} ({self.status})"


class TaxPaymentVoucher(BaseModel):
    """
    Represents formal tax deposits/payments made to Government Tax Authorities (FBR, SRB, PRA, etc.)
    integrating directly with Treasury Cash/Bank Accounts and S-4D Financial Vouchers.
    """
    voucher_number = models.CharField(max_length=100, blank=True, default='', db_index=True)
    tax_period = models.ForeignKey(TaxPeriod, null=True, blank=True, on_delete=models.SET_NULL, related_name='tax_payment_vouchers')
    tax_type = models.CharField(max_length=30, choices=TaxPaymentType.choices, default=TaxPaymentType.SALES_TAX)
    tax_authority = models.ForeignKey(TaxAuthority, on_delete=models.RESTRICT, related_name='payment_vouchers')
    amount = models.DecimalField(max_digits=15, decimal_places=4)
    payment_date = models.DateField()
    treasury_account = models.ForeignKey('BankAccount', on_delete=models.RESTRICT, related_name='tax_payment_vouchers')
    voucher = models.ForeignKey('FinancialVoucher', null=True, blank=True, on_delete=models.SET_NULL, related_name='tax_payment_vouchers')
    psid_number = models.CharField(max_length=100, blank=True, default='', verbose_name="PSID / e-Payment Number")
    challan_number = models.CharField(max_length=100, blank=True, default='')
    cpr_number = models.CharField(max_length=100, blank=True, default='', verbose_name="CPR / Treasury Receipt No.")
    status = models.CharField(max_length=30, choices=TaxVoucherStatus.choices, default=TaxVoucherStatus.DRAFT)
    prepared_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='prepared_tax_vouchers')
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='approved_tax_vouchers')
    paid_at = models.DateTimeField(null=True, blank=True)
    filed_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True, default='')
    attachment = models.FileField(upload_to='finance/tax_vouchers/%Y/%m/', null=True, blank=True)

    class Meta(BaseModel.Meta):
        ordering = ['-payment_date', '-created_at']
        verbose_name_plural = "Tax Payment Vouchers"
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'voucher_number'],
                condition=models.Q(is_deleted=False) & ~models.Q(voucher_number=''),
                name='unique_company_tax_voucher_number'
            )
        ]

    def save(self, *args, **kwargs):
        if not self.voucher_number:
            from erp_core.models import DocumentSequence
            prefix = f"TXV-{self.payment_date.strftime('%Y%m') if self.payment_date else timezone.now().strftime('%Y%m')}"
            self.voucher_number = DocumentSequence.get_next_number(self.company, 'TAX_VOUCHER', prefix)
        self.clean()
        super().save(*args, **kwargs)

    def clean(self):
        super().clean()
        if self.tax_authority and self.tax_authority.company_id != self.company_id:
            raise ValidationError("Tax authority must belong to the same company.")
        if self.treasury_account and self.treasury_account.company_id != self.company_id:
            raise ValidationError("Treasury account must belong to the same company.")
        if self.voucher and self.voucher.company_id != self.company_id:
            raise ValidationError("Financial voucher must belong to the same company.")

    def __str__(self):
        return f"{self.voucher_number} - {self.tax_authority.name} (PKR {self.amount}) [{self.status}]"


class TaxAdjustment(BaseModel):
    """
    Audited tax balance adjustments.
    """
    adjustment_number = models.CharField(max_length=100, blank=True, default='', db_index=True)
    tax_code = models.ForeignKey(TaxCode, on_delete=models.RESTRICT, related_name='tax_adjustments')
    tax_period = models.ForeignKey(TaxPeriod, null=True, blank=True, on_delete=models.SET_NULL, related_name='adjustments')
    adjustment_type = models.CharField(max_length=30, choices=TaxAdjustmentType.choices)
    amount = models.DecimalField(max_digits=15, decimal_places=4)
    tax_date = models.DateField()
    reason = models.TextField()
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='created_tax_adjustments')
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='approved_tax_adjustments')
    status = models.CharField(max_length=20, choices=[('DRAFT', 'Draft'), ('APPROVED', 'Approved'), ('REJECTED', 'Rejected')], default='DRAFT')

    class Meta(BaseModel.Meta):
        ordering = ['-tax_date', '-created_at']
        verbose_name_plural = "Tax Adjustments"

    def save(self, *args, **kwargs):
        if not self.adjustment_number:
            from erp_core.models import DocumentSequence
            prefix = f"TXA-{self.tax_date.strftime('%Y%m') if self.tax_date else timezone.now().strftime('%Y%m')}"
            self.adjustment_number = DocumentSequence.get_next_number(self.company, 'TAX_ADJUSTMENT', prefix)
        self.clean()
        super().save(*args, **kwargs)

    def clean(self):
        super().clean()
        if self.tax_code and self.tax_code.company_id != self.company_id:
            raise ValidationError("Tax code must belong to the same company.")
        if self.tax_period and self.tax_period.company_id != self.company_id:
            raise ValidationError("Tax period must belong to the same company.")

    def __str__(self):
        return f"{self.adjustment_number} - {self.tax_code.code} (PKR {self.amount}) [{self.status}]"


# ==============================================================================
# PHASE S-4J: OVERHEAD ALLOCATION PROFILES FOR MANAGEMENT PROFITABILITY
# ==============================================================================

class AllocationMethod(models.TextChoices):
    BY_REVENUE = 'BY_REVENUE', 'By Revenue'
    BY_HEADCOUNT = 'BY_HEADCOUNT', 'By Headcount'
    BY_SITE = 'BY_SITE', 'By Site'
    BY_FIXED_PERCENTAGE = 'BY_FIXED_PERCENTAGE', 'By Fixed Percentage'
    MANUAL = 'MANUAL', 'Manual'


class AllocationTargetType(models.TextChoices):
    CONTRACT = 'CONTRACT', 'Contract'
    SITE = 'SITE', 'Site'
    PROFIT_CENTER = 'PROFIT_CENTER', 'Profit Center'


class AllocationProfile(BaseModel):
    """
    Management overhead allocation rules.
    Allocates indirect cost center expenses to target contracts/sites/profit centers for reporting.
    """
    name = models.CharField(max_length=150)
    method = models.CharField(max_length=30, choices=AllocationMethod.choices, default=AllocationMethod.BY_REVENUE)
    source_cost_center = models.ForeignKey(CostCenter, null=True, blank=True, on_delete=models.SET_NULL, related_name='allocation_sources')
    target_type = models.CharField(max_length=30, choices=AllocationTargetType.choices, default=AllocationTargetType.SITE)
    target_site = models.ForeignKey('operations.OperationalSite', null=True, blank=True, on_delete=models.CASCADE, related_name='allocation_targets')
    target_contract = models.ForeignKey('operations.ServiceContract', null=True, blank=True, on_delete=models.CASCADE, related_name='allocation_targets')
    target_profit_center = models.ForeignKey(ProfitCenter, null=True, blank=True, on_delete=models.CASCADE, related_name='allocation_targets')
    percentage_or_weight = models.DecimalField(max_digits=8, decimal_places=4, default=Decimal('0.0000'))
    effective_from = models.DateField(null=True, blank=True)
    effective_to = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    description = models.TextField(blank=True, default='')

    class Meta(BaseModel.Meta):
        ordering = ['name']
        permissions = [
            ("view_financial_statements", "Can view financial statements"),
            ("view_company_pl", "Can view company P&L"),
            ("view_balance_sheet", "Can view balance sheet"),
            ("view_cash_flow", "Can view cash flow statement"),
            ("view_profitability", "Can view profitability workspace"),
            ("view_client_profitability", "Can view client profitability"),
            ("view_site_profitability", "Can view site profitability"),
            ("manage_allocation_profiles", "Can manage overhead allocation profiles"),
            ("export_financial_statements", "Can export financial statements"),
        ]

    def clean(self):
        super().clean()
        if self.source_cost_center and self.source_cost_center.company_id != self.company_id:
            raise ValidationError({"source_cost_center": "Source cost center must belong to the same company."})
        if self.target_profit_center and self.target_profit_center.company_id != self.company_id:
            raise ValidationError({"target_profit_center": "Target profit center must belong to the same company."})

    def __str__(self):
        return f"{self.name} ({self.get_method_display()})"


# =====================================================================
# PHASE S-4K — PERIOD CLOSING, BANK RECONCILIATION & FINANCIAL CONTROLS
# =====================================================================


class CashCountStatus(models.TextChoices):
    DRAFT = 'DRAFT', 'Draft'
    SUBMITTED = 'SUBMITTED', 'Submitted'
    VERIFIED = 'VERIFIED', 'Verified'
    VARIANCE_LOGGED = 'VARIANCE_LOGGED', 'Variance Logged'


class CashCount(BaseModel):
    """
    Periodic physical cash count verification for Cash and Petty Cash accounts.
    """
    cash_account = models.ForeignKey(BankAccount, on_delete=models.CASCADE, related_name='cash_counts')
    count_date = models.DateField()
    system_balance = models.DecimalField(max_digits=15, decimal_places=4, default=Decimal('0.0000'))
    physical_count = models.DecimalField(max_digits=15, decimal_places=4, default=Decimal('0.0000'))
    difference = models.DecimalField(max_digits=15, decimal_places=4, default=Decimal('0.0000'))
    variance_reason = models.TextField(blank=True, default='')
    counted_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.RESTRICT, related_name='counted_cash_counts')
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='reviewed_cash_counts')
    status = models.CharField(max_length=20, choices=CashCountStatus.choices, default=CashCountStatus.DRAFT)

    class Meta(BaseModel.Meta):
        ordering = ['-count_date', '-created_at']

    def clean(self):
        super().clean()
        if self.cash_account and self.cash_account.company_id != self.company_id:
            raise ValidationError({"cash_account": "Cash account must belong to the same company."})
        if self.cash_account and self.cash_account.account_type not in ['CASH', 'PETTY_CASH']:
            raise ValidationError({"cash_account": "Cash count can only be performed on Cash or Petty Cash accounts."})

    def save(self, *args, **kwargs):
        self.difference = self.physical_count - self.system_balance
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Cash Count {self.cash_account.account_name} on {self.count_date} (Diff: {self.difference})"


class SubledgerReconciliationSnapshot(BaseModel):
    """
    Preserves audit-safe reconciliation state between GL control accounts and subledgers at period close.
    """
    period = models.ForeignKey(AccountingPeriod, on_delete=models.CASCADE, related_name='subledger_snapshots')
    snapshot_date = models.DateTimeField(auto_now_add=True)

    # Accounts Receivable
    ar_gl_balance = models.DecimalField(max_digits=15, decimal_places=4, default=Decimal('0.0000'))
    ar_subledger_balance = models.DecimalField(max_digits=15, decimal_places=4, default=Decimal('0.0000'))
    ar_difference = models.DecimalField(max_digits=15, decimal_places=4, default=Decimal('0.0000'))

    # Accounts Payable
    ap_gl_balance = models.DecimalField(max_digits=15, decimal_places=4, default=Decimal('0.0000'))
    ap_subledger_balance = models.DecimalField(max_digits=15, decimal_places=4, default=Decimal('0.0000'))
    ap_difference = models.DecimalField(max_digits=15, decimal_places=4, default=Decimal('0.0000'))

    # Payroll Liability
    payroll_gl_balance = models.DecimalField(max_digits=15, decimal_places=4, default=Decimal('0.0000'))
    payroll_subledger_balance = models.DecimalField(max_digits=15, decimal_places=4, default=Decimal('0.0000'))
    payroll_difference = models.DecimalField(max_digits=15, decimal_places=4, default=Decimal('0.0000'))

    # Tax Liability
    tax_gl_balance = models.DecimalField(max_digits=15, decimal_places=4, default=Decimal('0.0000'))
    tax_subledger_balance = models.DecimalField(max_digits=15, decimal_places=4, default=Decimal('0.0000'))
    tax_difference = models.DecimalField(max_digits=15, decimal_places=4, default=Decimal('0.0000'))

    # Treasury Cash & Bank
    treasury_gl_balance = models.DecimalField(max_digits=15, decimal_places=4, default=Decimal('0.0000'))
    treasury_operational_balance = models.DecimalField(max_digits=15, decimal_places=4, default=Decimal('0.0000'))
    treasury_difference = models.DecimalField(max_digits=15, decimal_places=4, default=Decimal('0.0000'))

    is_all_reconciled = models.BooleanField(default=False)

    class Meta(BaseModel.Meta):
        ordering = ['-snapshot_date']

    def __str__(self):
        return f"Subledger Snapshot {self.period} - Reconciled: {self.is_all_reconciled}"


class ControlExceptionSeverity(models.TextChoices):
    INFO = 'INFO', 'Information'
    WARNING = 'WARNING', 'Warning'
    BLOCKER = 'BLOCKER', 'Blocker'


class ControlExceptionStatus(models.TextChoices):
    OPEN = 'OPEN', 'Open'
    INVESTIGATING = 'INVESTIGATING', 'Investigating'
    RESOLVED = 'RESOLVED', 'Resolved'
    EXPLICITLY_ACCEPTED = 'EXPLICITLY_ACCEPTED', 'Explicitly Accepted'


class ControlExceptionType(models.TextChoices):
    UNBALANCED_CONTROL = 'UNBALANCED_CONTROL', 'Unbalanced Control Account Reconciliation'
    UNRECONCILED_BANK = 'UNRECONCILED_BANK', 'Unreconciled Bank Account'
    CASH_VARIANCE = 'CASH_VARIANCE', 'Physical Cash Count Variance'
    UNPOSTED_SOURCE_EVENT = 'UNPOSTED_SOURCE_EVENT', 'Unposted Source Financial Event'
    UNCLEARED_OLD_CHEQUE = 'UNCLEARED_OLD_CHEQUE', 'Uncleared Old Cheque'
    SOFT_CLOSED_ADJUSTMENT_PENDING = 'SOFT_CLOSED_ADJUSTMENT_PENDING', 'Soft-Closed Adjustment Pending Approval'
    PERIOD_CLOSE_BLOCKER = 'PERIOD_CLOSE_BLOCKER', 'Period Close Blocker'


class ControlException(BaseModel):
    """
    Actionable exception items monitored in the Financial Control Center.
    """
    period = models.ForeignKey(AccountingPeriod, null=True, blank=True, on_delete=models.CASCADE, related_name='control_exceptions')
    exception_type = models.CharField(max_length=40, choices=ControlExceptionType.choices)
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default='')
    amount = models.DecimalField(max_digits=15, decimal_places=4, default=Decimal('0.0000'))
    severity = models.CharField(max_length=20, choices=ControlExceptionSeverity.choices, default=ControlExceptionSeverity.WARNING)
    status = models.CharField(max_length=30, choices=ControlExceptionStatus.choices, default=ControlExceptionStatus.OPEN)
    resolved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='resolved_control_exceptions')
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolution_explanation = models.TextField(blank=True, default='')

    class Meta(BaseModel.Meta):
        ordering = ['-created_at']

    def __str__(self):
        return f"[{self.severity}] {self.title} ({self.get_status_display()})"


