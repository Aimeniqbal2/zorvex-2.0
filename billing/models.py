"""
billing/models.py

Phase 8C — Universal Billing Module.
Provides customer-facing B2B service invoices generated from completed
operational work (DutyAssignments) against ServiceContracts.

Also hosts ExtraDutyPayrollBridge — the idempotency record for
injecting ExtraDuty hours into payroll as variable PayslipLine entries.

ARCHITECTURAL RULES:
- Does NOT replace or extend sales.Sale (POS-oriented).
- Does NOT create OvertimeRecord from ExtraDuty.
- Reuses finance.services.journal.post_journal_entry() for posting.
- All models inherit BaseModel (UUID pk, company FK, soft-delete, TenantManager).
"""

from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError
from erp_core.models import BaseModel
from django.db.models import UniqueConstraint, Q


# ============================================================================
# SERVICE INVOICE STATUSES
# ============================================================================

class ServiceInvoiceStatus(models.TextChoices):
    DRAFT = 'DRAFT', 'Draft'
    POSTED = 'POSTED', 'Posted'
    CANCELLED = 'CANCELLED', 'Cancelled'

class ServiceInvoicePaymentStatus(models.TextChoices):
    UNPAID = 'UNPAID', 'Unpaid'
    PARTIALLY_PAID = 'PARTIALLY_PAID', 'Partially Paid'
    PAID = 'PAID', 'Paid'


# ============================================================================
# SERVICE INVOICE
# One per (company, service_contract, period_start, period_end).
# Aggregates completed DutyAssignments for customer billing.
# ============================================================================

class ServiceInvoice(BaseModel):
    service_contract = models.ForeignKey(
        'operations.ServiceContract',
        on_delete=models.RESTRICT,
        null=True, blank=True,
        related_name='service_invoices'
    )
    crm_entity = models.ForeignKey(
        'crm.CRMEntity',
        on_delete=models.RESTRICT,
        related_name='service_invoices'
    )
    invoice_number = models.CharField(max_length=100, blank=True, default='')
    period_start = models.DateField()
    period_end = models.DateField()
    status = models.CharField(
        max_length=20,
        choices=ServiceInvoiceStatus.choices,
        default=ServiceInvoiceStatus.DRAFT
    )
    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    notes = models.TextField(blank=True, default='')
    tax_code = models.ForeignKey(
        'finance.TaxCode',
        on_delete=models.RESTRICT,
        null=True, blank=True,
        related_name='service_invoices'
    )
    tax_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    journal_entry = models.ForeignKey(
        'finance.JournalEntry',
        on_delete=models.RESTRICT,
        null=True, blank=True,
        related_name='service_invoices'
    )
    due_date = models.DateField(null=True, blank=True)
    paid_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    payment_status = models.CharField(
        max_length=20,
        choices=ServiceInvoicePaymentStatus.choices,
        default=ServiceInvoicePaymentStatus.UNPAID
    )
    currency = models.ForeignKey(
        'finance.Currency',
        on_delete=models.RESTRICT,
        null=True, blank=True,
        related_name='service_invoices'
    )
    exchange_rate = models.DecimalField(max_digits=15, decimal_places=6, default=1)
    base_amount = models.DecimalField(max_digits=15, decimal_places=4, default=0)

    class Meta:
        ordering = ['-period_end']
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'invoice_number'],
                condition=models.Q(is_deleted=False) & ~models.Q(invoice_number=''),
                name='unique_active_service_invoice_number'
            ),
            models.UniqueConstraint(
                fields=['company', 'service_contract', 'period_start', 'period_end'],
                condition=models.Q(is_deleted=False),
                name='unique_active_service_invoice_period'
            ),
        ]

    def clean(self):
        super().clean()
        if self.service_contract_id and str(self.service_contract.company_id) != str(self.company_id):
            raise ValidationError({'service_contract': 'Service contract must belong to the same company.'})
        if self.crm_entity_id and str(self.crm_entity.company_id) != str(self.company_id):
            raise ValidationError({'crm_entity': 'CRM Entity must belong to the same company.'})
        if self.journal_entry_id and str(self.journal_entry.company_id) != str(self.company_id):
            raise ValidationError({'journal_entry': 'Journal entry must belong to the same company.'})
        if self.period_start and self.period_end and self.period_end < self.period_start:
            raise ValidationError({'period_end': 'Period end cannot be before period start.'})
        # Immutability: posted invoices cannot have core fields changed
        if self.pk:
            try:
                orig = ServiceInvoice.objects.get(pk=self.pk)
                if orig.status == ServiceInvoiceStatus.POSTED:
                    if (orig.service_contract_id != self.service_contract_id or
                            orig.crm_entity_id != self.crm_entity_id or
                            orig.period_start != self.period_start or
                            orig.period_end != self.period_end or
                            orig.total_amount != self.total_amount or
                            orig.tax_code_id != self.tax_code_id or
                            orig.tax_amount != self.tax_amount):
                        raise ValidationError('Cannot modify core fields of a posted service invoice.')
            except ServiceInvoice.DoesNotExist:
                pass

    def save(self, *args, **kwargs):
        if not self.invoice_number:
            from erp_core.models import DocumentSequence
            from django.utils import timezone
            prefix = f"SVC-{timezone.now().strftime('%Y%m')}"
            self.invoice_number = DocumentSequence.get_next_number(self.company, 'SERVICE_INVOICE', prefix)
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.invoice_number} ({self.service_contract})"


# ============================================================================
# SERVICE INVOICE LINE
# One line per (designation + site) grouping within the invoice.
# References source DutyAssignments via JSON list for aggregation traceability.
# ============================================================================

class ServiceInvoiceLine(BaseModel):
    service_invoice = models.ForeignKey(
        ServiceInvoice,
        on_delete=models.CASCADE,
        related_name='lines'
    )
    designation = models.ForeignKey(
        'hrm.Designation',
        on_delete=models.RESTRICT,
        related_name='invoice_lines'
    )
    operational_site = models.ForeignKey(
        'operations.OperationalSite',
        on_delete=models.RESTRICT,
        null=True, blank=True,
        related_name='invoice_lines'
    )
    description = models.CharField(max_length=255, blank=True, default='')
    hours = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    rate = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    # JSON list of DutyAssignment UUIDs (strings) for traceability
    source_duty_assignment_ids = models.JSONField(default=list)

    class Meta:
        ordering = ['created_at']

    def clean(self):
        super().clean()
        if self.service_invoice_id and str(self.service_invoice.company_id) != str(self.company_id):
            raise ValidationError({'service_invoice': 'Service invoice must belong to the same company.'})
        if self.designation_id and str(self.designation.company_id) != str(self.company_id):
            raise ValidationError({'designation': 'Designation must belong to the same company.'})
        if self.operational_site_id and str(self.operational_site.company_id) != str(self.company_id):
            raise ValidationError({'operational_site': 'Operational site must belong to the same company.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.service_invoice.invoice_number} - {self.designation.name} - {self.operational_site.name if self.operational_site else 'All'}"


# ============================================================================
# SERVICE INVOICE PAYMENT
# Tracks payments made against a POSTED ServiceInvoice.
# ============================================================================

class ServiceInvoicePayment(BaseModel):
    service_invoice = models.ForeignKey(
        ServiceInvoice,
        on_delete=models.CASCADE,
        related_name='payments'
    )
    payment_date = models.DateField()
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    payment_method = models.CharField(max_length=50, blank=True, default='')
    reference = models.CharField(max_length=100, blank=True, default='')
    journal_entry = models.ForeignKey(
        'finance.JournalEntry',
        on_delete=models.RESTRICT,
        related_name='service_invoice_payments'
    )

    class Meta:
        ordering = ['-payment_date', '-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'service_invoice', 'reference'],
                condition=models.Q(is_deleted=False) & ~models.Q(reference=''),
                name='unique_active_service_invoice_payment_reference'
            ),
        ]

    def clean(self):
        super().clean()
        if self.service_invoice_id and str(self.service_invoice.company_id) != str(self.company_id):
            raise ValidationError({'service_invoice': 'Service invoice must belong to the same company.'})
        if self.journal_entry_id and str(self.journal_entry.company_id) != str(self.company_id):
            raise ValidationError({'journal_entry': 'Journal entry must belong to the same company.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Payment {self.amount} for {self.service_invoice.invoice_number}"


# ============================================================================
# EXTRA DUTY PAYROLL BRIDGE
# Idempotency record for injecting ExtraDuty hours into a PayrollRun.
# Unique per (company, extra_duty, payroll_run) — prevents double-billing.
# ============================================================================

class ExtraDutyPayrollBridge(BaseModel):
    extra_duty = models.ForeignKey(
        'operations.ExtraDuty',
        on_delete=models.RESTRICT,
        related_name='payroll_bridges'
    )
    payroll_run = models.ForeignKey(
        'hrm.PayrollRun',
        on_delete=models.RESTRICT,
        related_name='extra_duty_bridges'
    )
    payslip = models.ForeignKey(
        'hrm.Payslip',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='extra_duty_bridges'
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-processed_at']
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'extra_duty', 'payroll_run'],
                condition=models.Q(is_deleted=False),
                name='unique_active_extra_duty_payroll_bridge'
            )
        ]

    def clean(self):
        super().clean()
        if self.extra_duty_id and str(self.extra_duty.company_id) != str(self.company_id):
            raise ValidationError({'extra_duty': 'Extra duty must belong to the same company.'})
        if self.payroll_run_id and str(self.payroll_run.company_id) != str(self.company_id):
            raise ValidationError({'payroll_run': 'Payroll run must belong to the same company.'})
        if self.payslip_id and str(self.payslip.company_id) != str(self.company_id):
            raise ValidationError({'payslip': 'Payslip must belong to the same company.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Bridge: ExtraDuty {self.extra_duty_id} → Run {self.payroll_run_id} ({self.amount})"


# ============================================================================
# BILLING ACCOUNTING CONFIGURATION
# Maps chart-of-accounts for service invoice journal posting.
# Modelled after finance.SalesAccountingConfiguration (same pattern).
# ============================================================================

class BillingAccountingConfiguration(BaseModel):
    """
    Per-company configuration that maps the two GL accounts required to post
    a ServiceInvoice to Finance:

      DR  Accounts Receivable  ← customer owes us
      CR  Service Revenue      ← income recognised
    """
    accounts_receivable_account = models.ForeignKey(
        'finance.ChartOfAccount',
        on_delete=models.RESTRICT,
        related_name='+',
        help_text='Accounts Receivable (Asset) account'
    )
    service_revenue_account = models.ForeignKey(
        'finance.ChartOfAccount',
        on_delete=models.RESTRICT,
        related_name='+',
        help_text='Service Revenue (Income) account'
    )
    tax_payable_account = models.ForeignKey(
        'finance.ChartOfAccount',
        on_delete=models.RESTRICT,
        related_name='+',
        null=True, blank=True,
        help_text='Tax Payable (Liability) account'
    )
    payment_account = models.ForeignKey(
        'finance.ChartOfAccount',
        on_delete=models.RESTRICT,
        related_name='+',
        null=True, blank=True,
        help_text='Cash/Bank (Asset) account for payments'
    )
    default_currency = models.ForeignKey(
        'finance.Currency',
        on_delete=models.RESTRICT
    )
    is_active = models.BooleanField(default=True)

    class Meta(BaseModel.Meta):
        constraints = [
            UniqueConstraint(
                fields=['company'],
                condition=Q(is_active=True),
                name='unique_active_billing_accounting_config'
            )
        ]

    def clean(self):
        super().clean()
        accounts = [self.accounts_receivable_account, self.service_revenue_account, self.tax_payable_account, self.payment_account]
        for acc in accounts:
            if acc and acc.company_id != self.company_id:
                raise ValidationError(f"Account {acc} must belong to the same company.")
        if self.default_currency and self.default_currency.company_id != self.company_id:
            raise ValidationError("Currency must belong to the same company.")
        account_ids = [acc.id for acc in accounts if acc]
        if len(account_ids) != len(set(account_ids)):
            raise ValidationError("Accounts Receivable, Service Revenue, and Tax Payable must be different accounts.")

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Billing Accounting Config ({self.company})"


# ============================================================================
# PHASE S-4B: SECURITY CLIENT BILLING, BILLING SHEETS & CLIENT INVOICES
# ============================================================================

class BillingPeriodStatus(models.TextChoices):
    OPEN = 'OPEN', 'Open'
    PROCESSING = 'PROCESSING', 'Processing'
    FINALIZED = 'FINALIZED', 'Finalized'
    CLOSED = 'CLOSED', 'Closed'


class BillingPeriod(BaseModel):
    client = models.ForeignKey(
        'crm.CRMEntity',
        on_delete=models.RESTRICT,
        related_name='billing_periods'
    )
    contract = models.ForeignKey(
        'operations.ServiceContract',
        on_delete=models.RESTRICT,
        related_name='billing_periods'
    )
    period_start = models.DateField()
    period_end = models.DateField()
    billing_month = models.CharField(max_length=7, help_text="Format YYYY-MM")
    status = models.CharField(
        max_length=20,
        choices=BillingPeriodStatus.choices,
        default=BillingPeriodStatus.OPEN
    )
    notes = models.TextField(blank=True, default='')

    class Meta(BaseModel.Meta):
        ordering = ['-period_end', '-period_start']
        constraints = [
            UniqueConstraint(
                fields=['company', 'contract', 'period_start', 'period_end'],
                condition=Q(is_deleted=False),
                name='unique_billing_period_per_contract'
            )
        ]

    def clean(self):
        super().clean()
        if self.client_id and str(self.client.company_id) != str(self.company_id):
            raise ValidationError({'client': 'Client must belong to the same company.'})
        if self.contract_id and str(self.contract.company_id) != str(self.company_id):
            raise ValidationError({'contract': 'Contract must belong to the same company.'})
        if self.period_start and self.period_end and self.period_end < self.period_start:
            raise ValidationError({'period_end': 'Period end date cannot be before period start date.'})

    def __str__(self):
        return f"{self.contract.contract_code} [{self.billing_month}] ({self.status})"


class BillingSheetStatus(models.TextChoices):
    DRAFT = 'DRAFT', 'Draft'
    UNDER_REVIEW = 'UNDER_REVIEW', 'Under Review'
    APPROVED = 'APPROVED', 'Approved'
    INVOICED = 'INVOICED', 'Invoiced'
    CANCELLED = 'CANCELLED', 'Cancelled'


class BillingLineType(models.TextChoices):
    REGULAR_SERVICE = 'REGULAR_SERVICE', 'Regular Security Services'
    SUPERVISOR = 'SUPERVISOR', 'Security Supervisors'
    GUARD = 'GUARD', 'Guards / Designations'
    SINGLE_OT = 'SINGLE_OT', 'Single Overtime'
    DOUBLE_OT = 'DOUBLE_OT', 'Double Overtime'
    EXTRA_DUTY = 'EXTRA_DUTY', 'Extra Duty'
    TEMPORARY_SERVICE = 'TEMPORARY_SERVICE', 'Temporary Guards'
    VIP_ESCORT = 'VIP_ESCORT', 'VIP Escort / Temporary Services'
    EQUIPMENT_RENTAL = 'EQUIPMENT_RENTAL', 'Equipment Rental / Charges'
    ADDITIONAL_CHARGE = 'ADDITIONAL_CHARGE', 'Additional Charges'
    DISCOUNT_ADJUSTMENT = 'DISCOUNT_ADJUSTMENT', 'Discount / Adjustment'
    OTHER = 'OTHER', 'Other Contractual Charges'


class BillingLineSource(models.TextChoices):
    CONTRACT = 'CONTRACT', 'Contract Terms'
    OPERATIONS = 'OPERATIONS', 'Operational Activity'
    MANUAL_ADJUSTMENT = 'MANUAL_ADJUSTMENT', 'Manual Adjustment'


class AdjustmentType(models.TextChoices):
    ADDITIONAL_CHARGE = 'ADDITIONAL_CHARGE', 'Additional Charge'
    DEDUCTION = 'DEDUCTION', 'Deduction'
    DISCOUNT = 'DISCOUNT', 'Discount'
    CORRECTION = 'CORRECTION', 'Correction'


class BillingSheet(BaseModel):
    sheet_number = models.CharField(max_length=100, blank=True, default='')
    client = models.ForeignKey(
        'crm.CRMEntity',
        on_delete=models.RESTRICT,
        related_name='billing_sheets'
    )
    contract = models.ForeignKey(
        'operations.ServiceContract',
        on_delete=models.RESTRICT,
        related_name='billing_sheets'
    )
    billing_period = models.ForeignKey(
        BillingPeriod,
        on_delete=models.RESTRICT,
        null=True, blank=True,
        related_name='billing_sheets'
    )
    period_start = models.DateField()
    period_end = models.DateField()
    billing_month = models.CharField(max_length=7, help_text="Format YYYY-MM")
    currency = models.ForeignKey(
        'finance.Currency',
        on_delete=models.RESTRICT,
        null=True, blank=True,
        related_name='billing_sheets'
    )
    exchange_rate = models.DecimalField(max_digits=15, decimal_places=6, default=1)
    status = models.CharField(
        max_length=30,
        choices=BillingSheetStatus.choices,
        default=BillingSheetStatus.DRAFT
    )
    prepared_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='prepared_billing_sheets'
    )
    prepared_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='reviewed_billing_sheets'
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='approved_billing_sheets'
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True, default='')

    # Financial Totals (Decimal arithmetic)
    base_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    ot_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    extra_duty_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    equipment_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    adjustment_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    class Meta(BaseModel.Meta):
        ordering = ['-period_end', '-created_at']
        constraints = [
            UniqueConstraint(
                fields=['company', 'sheet_number'],
                condition=Q(is_deleted=False) & ~Q(sheet_number=''),
                name='unique_billing_sheet_number'
            ),
            UniqueConstraint(
                fields=['company', 'contract', 'period_start', 'period_end'],
                condition=Q(is_deleted=False) & ~Q(status=BillingSheetStatus.CANCELLED),
                name='unique_active_contract_billing_period'
            ),
        ]

    def clean(self):
        super().clean()
        if self.client_id and str(self.client.company_id) != str(self.company_id):
            raise ValidationError({'client': 'Client must belong to the same company.'})
        if self.contract_id and str(self.contract.company_id) != str(self.company_id):
            raise ValidationError({'contract': 'Contract must belong to the same company.'})
        if self.period_start and self.period_end and self.period_end < self.period_start:
            raise ValidationError({'period_end': 'Period end date cannot be before start date.'})
        if self.currency_id and str(self.currency.company_id) != str(self.company_id):
            raise ValidationError({'currency': 'Currency must belong to the same company.'})

    def save(self, *args, **kwargs):
        if not self.sheet_number:
            from erp_core.models import DocumentSequence
            from django.utils import timezone
            prefix = f"BS-{timezone.now().strftime('%Y%m')}"
            self.sheet_number = DocumentSequence.get_next_number(self.company, 'BILLING_SHEET', prefix)
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.sheet_number} - {self.client.name} ({self.status})"


class BillingSheetLine(BaseModel):
    billing_sheet = models.ForeignKey(
        BillingSheet,
        on_delete=models.CASCADE,
        related_name='lines'
    )
    line_type = models.CharField(
        max_length=50,
        choices=BillingLineType.choices,
        default=BillingLineType.REGULAR_SERVICE
    )
    description = models.CharField(max_length=255)
    site = models.ForeignKey(
        'operations.OperationalSite',
        on_delete=models.RESTRICT,
        null=True, blank=True,
        related_name='billing_lines'
    )
    designation = models.ForeignKey(
        'hrm.Designation',
        on_delete=models.RESTRICT,
        null=True, blank=True,
        related_name='billing_lines'
    )
    billing_unit = models.CharField(max_length=50, default='MONTH')
    contract_quantity = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    actual_quantity = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    billable_quantity = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    unit_rate = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    ot_rate = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    line_subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    source = models.CharField(
        max_length=30,
        choices=BillingLineSource.choices,
        default=BillingLineSource.CONTRACT
    )
    profit_center = models.ForeignKey(
        'finance.ProfitCenter',
        on_delete=models.RESTRICT,
        null=True, blank=True,
        related_name='billing_lines'
    )
    cost_center = models.ForeignKey(
        'finance.CostCenter',
        on_delete=models.RESTRICT,
        null=True, blank=True,
        related_name='billing_lines'
    )
    source_reference = models.CharField(max_length=100, blank=True, default='')

    class Meta(BaseModel.Meta):
        ordering = ['created_at']

    def clean(self):
        super().clean()
        if self.billing_sheet_id and str(self.billing_sheet.company_id) != str(self.company_id):
            raise ValidationError({'billing_sheet': 'Billing sheet must belong to the same company.'})
        if self.site_id and str(self.site.company_id) != str(self.company_id):
            raise ValidationError({'site': 'Site must belong to the same company.'})
        if self.designation_id and str(self.designation.company_id) != str(self.company_id):
            raise ValidationError({'designation': 'Designation must belong to the same company.'})
        if self.profit_center_id and str(self.profit_center.company_id) != str(self.company_id):
            raise ValidationError({'profit_center': 'Profit center must belong to the same company.'})
        if self.cost_center_id and str(self.cost_center.company_id) != str(self.company_id):
            raise ValidationError({'cost_center': 'Cost center must belong to the same company.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.billing_sheet.sheet_number} - {self.description} ({self.total_amount})"


class BillingAdjustment(BaseModel):
    billing_sheet = models.ForeignKey(
        BillingSheet,
        on_delete=models.CASCADE,
        related_name='adjustments'
    )
    adjustment_type = models.CharField(
        max_length=30,
        choices=AdjustmentType.choices,
        default=AdjustmentType.ADDITIONAL_CHARGE
    )
    reason = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    site = models.ForeignKey(
        'operations.OperationalSite',
        on_delete=models.RESTRICT,
        null=True, blank=True,
        related_name='billing_adjustments'
    )
    profit_center = models.ForeignKey(
        'finance.ProfitCenter',
        on_delete=models.RESTRICT,
        null=True, blank=True,
        related_name='billing_adjustments'
    )
    cost_center = models.ForeignKey(
        'finance.CostCenter',
        on_delete=models.RESTRICT,
        null=True, blank=True,
        related_name='billing_adjustments'
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True
    )

    class Meta(BaseModel.Meta):
        ordering = ['created_at']

    def clean(self):
        super().clean()
        if self.billing_sheet_id and str(self.billing_sheet.company_id) != str(self.company_id):
            raise ValidationError({'billing_sheet': 'Billing sheet must belong to the same company.'})
        if self.site_id and str(self.site.company_id) != str(self.company_id):
            raise ValidationError({'site': 'Site must belong to the same company.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.adjustment_type}: {self.reason} ({self.amount})"


class ClientInvoiceStatus(models.TextChoices):
    DRAFT = 'DRAFT', 'Draft'
    ISSUED = 'ISSUED', 'Issued'
    SENT = 'SENT', 'Sent'
    PARTIALLY_PAID = 'PARTIALLY_PAID', 'Partially Paid'
    PAID = 'PAID', 'Paid'
    CANCELLED = 'CANCELLED', 'Cancelled'
    CREDITED = 'CREDITED', 'Credited'


class ReceiptStatus(models.TextChoices):
    DRAFT = 'DRAFT', 'Draft'
    POSTED = 'POSTED', 'Posted'
    REVERSED = 'REVERSED', 'Reversed'


class PaymentMethod(models.TextChoices):
    BANK_TRANSFER = 'BANK_TRANSFER', 'Bank Transfer'
    CHEQUE = 'CHEQUE', 'Cheque'
    CASH = 'CASH', 'Cash'
    ONLINE = 'ONLINE', 'Online / Card'
    PAY_ORDER = 'PAY_ORDER', 'Pay Order'
    OTHER = 'OTHER', 'Other'


class RecoveryStatus(models.TextChoices):
    NOT_DUE = 'NOT_DUE', 'Not Due'
    DUE = 'DUE', 'Due'
    UNDER_FOLLOWUP = 'UNDER_FOLLOWUP', 'Under Follow-up'
    PROMISE_TO_PAY = 'PROMISE_TO_PAY', 'Promise to Pay'
    PARTIALLY_RECOVERED = 'PARTIALLY_RECOVERED', 'Partially Recovered'
    DISPUTED = 'DISPUTED', 'Disputed'
    ESCALATED = 'ESCALATED', 'Escalated'
    RECOVERED = 'RECOVERED', 'Recovered'


class RecoveryActivityType(models.TextChoices):
    PHONE_CALL = 'PHONE_CALL', 'Phone Call'
    EMAIL = 'EMAIL', 'Email'
    MEETING = 'MEETING', 'Meeting'
    PAYMENT_REMINDER = 'PAYMENT_REMINDER', 'Payment Reminder'
    PROMISE_TO_PAY = 'PROMISE_TO_PAY', 'Promise to Pay'
    DISPUTE = 'DISPUTE', 'Dispute'
    ESCALATION = 'ESCALATION', 'Escalation'
    OTHER = 'OTHER', 'Other'


class ClientInvoice(BaseModel):
    invoice_number = models.CharField(max_length=100, blank=True, default='')
    client = models.ForeignKey(
        'crm.CRMEntity',
        on_delete=models.RESTRICT,
        related_name='client_invoices'
    )
    contract = models.ForeignKey(
        'operations.ServiceContract',
        on_delete=models.RESTRICT,
        null=True, blank=True,
        related_name='client_invoices'
    )
    billing_sheet = models.OneToOneField(
        BillingSheet,
        on_delete=models.RESTRICT,
        null=True, blank=True,
        related_name='generated_invoice'
    )
    period_start = models.DateField()
    period_end = models.DateField()
    billing_month = models.CharField(max_length=7)
    invoice_date = models.DateField()
    due_date = models.DateField()
    currency = models.ForeignKey(
        'finance.Currency',
        on_delete=models.RESTRICT,
        null=True, blank=True,
        related_name='client_invoices'
    )
    exchange_rate = models.DecimalField(max_digits=15, decimal_places=6, default=1)
    payment_terms = models.CharField(max_length=100, default='NET_30')
    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    grand_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    paid_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    status = models.CharField(
        max_length=30,
        choices=ClientInvoiceStatus.choices,
        default=ClientInvoiceStatus.DRAFT
    )
    recovery_status = models.CharField(
        max_length=30,
        choices=RecoveryStatus.choices,
        default=RecoveryStatus.NOT_DUE
    )
    notes = models.TextField(blank=True, default='')
    terms_and_conditions = models.TextField(blank=True, default='')
    issued_at = models.DateTimeField(null=True, blank=True)
    issued_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='issued_client_invoices'
    )
    sent_at = models.DateTimeField(null=True, blank=True)
    sent_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='sent_client_invoices'
    )
    outbound_email = models.ForeignKey(
        'communications.OutboundEmail',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='invoices'
    )

    class Meta(BaseModel.Meta):
        ordering = ['-invoice_date', '-created_at']
        constraints = [
            UniqueConstraint(
                fields=['company', 'invoice_number'],
                condition=Q(is_deleted=False) & ~Q(invoice_number=''),
                name='unique_active_client_invoice_number'
            ),
        ]

    @property
    def outstanding_amount(self):
        from decimal import Decimal
        return max(Decimal('0.00'), (self.grand_total or Decimal('0.00')) - (self.paid_amount or Decimal('0.00')))

    @property
    def is_overdue(self):
        from django.utils import timezone
        from decimal import Decimal
        if self.status in [ClientInvoiceStatus.PAID, ClientInvoiceStatus.CANCELLED, ClientInvoiceStatus.CREDITED]:
            return False
        return bool(self.due_date and self.due_date < timezone.now().date() and self.outstanding_amount > Decimal('0.00'))

    @property
    def days_overdue(self):
        from django.utils import timezone
        if not self.is_overdue:
            return 0
        return max(0, (timezone.now().date() - self.due_date).days)

    def clean(self):
        super().clean()
        if self.client_id and str(self.client.company_id) != str(self.company_id):
            raise ValidationError({'client': 'Client must belong to the same company.'})
        if self.contract_id and str(self.contract.company_id) != str(self.company_id):
            raise ValidationError({'contract': 'Contract must belong to the same company.'})
        if self.billing_sheet_id and str(self.billing_sheet.company_id) != str(self.company_id):
            raise ValidationError({'billing_sheet': 'Billing sheet must belong to the same company.'})
        if self.period_start and self.period_end and self.period_end < self.period_start:
            raise ValidationError({'period_end': 'Period end date cannot be before start date.'})
        if self.currency_id and str(self.currency.company_id) != str(self.company_id):
            raise ValidationError({'currency': 'Currency must belong to the same company.'})

    @classmethod
    def generate_next_invoice_number(cls, company):
        from erp_core.models import DocumentSequence
        from django.utils import timezone
        prefix = f"INV-{timezone.now().strftime('%Y%m')}"
        return DocumentSequence.get_next_number(company, 'CLIENT_INVOICE', prefix)

    def save(self, *args, **kwargs):
        if not self.invoice_number:
            self.invoice_number = self.generate_next_invoice_number(self.company)
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.invoice_number} - {self.client.name} (PKR {self.grand_total})"


class ClientInvoiceLine(BaseModel):
    invoice = models.ForeignKey(
        ClientInvoice,
        on_delete=models.CASCADE,
        related_name='lines'
    )
    billing_sheet_line = models.ForeignKey(
        BillingSheetLine,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='invoice_lines'
    )
    line_type = models.CharField(max_length=50)
    description = models.CharField(max_length=255)
    site = models.ForeignKey(
        'operations.OperationalSite',
        on_delete=models.RESTRICT,
        null=True, blank=True,
        related_name='client_invoice_lines'
    )
    designation = models.ForeignKey(
        'hrm.Designation',
        on_delete=models.RESTRICT,
        null=True, blank=True,
        related_name='client_invoice_lines'
    )
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=1)
    unit_rate = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    line_subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    profit_center = models.ForeignKey(
        'finance.ProfitCenter',
        on_delete=models.RESTRICT,
        null=True, blank=True,
        related_name='client_invoice_lines'
    )
    cost_center = models.ForeignKey(
        'finance.CostCenter',
        on_delete=models.RESTRICT,
        null=True, blank=True,
        related_name='client_invoice_lines'
    )

    class Meta(BaseModel.Meta):
        ordering = ['created_at']

    def clean(self):
        super().clean()
        if self.invoice_id and str(self.invoice.company_id) != str(self.company_id):
            raise ValidationError({'invoice': 'Invoice must belong to the same company.'})
        if self.site_id and str(self.site.company_id) != str(self.company_id):
            raise ValidationError({'site': 'Site must belong to the same company.'})
        if self.designation_id and str(self.designation.company_id) != str(self.company_id):
            raise ValidationError({'designation': 'Designation must belong to the same company.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.invoice.invoice_number} - {self.description} ({self.total_amount})"


class ClientReceipt(BaseModel):
    receipt_number = models.CharField(max_length=100, blank=True, default='')
    client = models.ForeignKey(
        'crm.CRMEntity',
        on_delete=models.RESTRICT,
        related_name='client_receipts'
    )
    receipt_date = models.DateField()
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    currency = models.ForeignKey(
        'finance.Currency',
        on_delete=models.RESTRICT,
        null=True, blank=True,
        related_name='client_receipts'
    )
    exchange_rate = models.DecimalField(max_digits=15, decimal_places=6, default=1)
    payment_method = models.CharField(
        max_length=30,
        choices=PaymentMethod.choices,
        default=PaymentMethod.BANK_TRANSFER
    )
    bank_account = models.ForeignKey(
        'finance.BankAccount',
        on_delete=models.RESTRICT,
        null=True, blank=True,
        related_name='client_receipts'
    )
    reference_number = models.CharField(max_length=100, blank=True, default='')
    cheque_number = models.CharField(max_length=100, blank=True, default='')
    cheque_date = models.DateField(null=True, blank=True)
    drawn_bank = models.CharField(max_length=150, blank=True, default='')
    notes = models.TextField(blank=True, default='')
    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='received_client_receipts'
    )
    status = models.CharField(
        max_length=30,
        choices=ReceiptStatus.choices,
        default=ReceiptStatus.DRAFT
    )
    posted_at = models.DateTimeField(null=True, blank=True)
    posted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='posted_client_receipts'
    )
    reversed_at = models.DateTimeField(null=True, blank=True)
    reversed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='reversed_client_receipts'
    )
    reversal_reason = models.TextField(blank=True, default='')

    class Meta(BaseModel.Meta):
        ordering = ['-receipt_date', '-created_at']
        constraints = [
            UniqueConstraint(
                fields=['company', 'receipt_number'],
                condition=Q(is_deleted=False) & ~Q(receipt_number=''),
                name='unique_active_client_receipt_number'
            ),
        ]

    @property
    def allocated_amount(self):
        from decimal import Decimal
        total = Decimal('0.00')
        for alloc in self.allocations.filter(is_deleted=False):
            total += alloc.allocated_amount
        return total

    @property
    def unallocated_amount(self):
        from decimal import Decimal
        return max(Decimal('0.00'), (self.amount or Decimal('0.00')) - self.allocated_amount)

    def clean(self):
        super().clean()
        if self.client_id and str(self.client.company_id) != str(self.company_id):
            raise ValidationError({'client': 'Client must belong to the same company.'})
        if self.currency_id and str(self.currency.company_id) != str(self.company_id):
            raise ValidationError({'currency': 'Currency must belong to the same company.'})
        if self.bank_account_id and str(self.bank_account.company_id) != str(self.company_id):
            raise ValidationError({'bank_account': 'Bank account must belong to the same company.'})
        if self.amount is not None and self.amount <= 0:
            raise ValidationError({'amount': 'Receipt amount must be strictly greater than zero.'})

    def save(self, *args, **kwargs):
        if not self.receipt_number:
            from erp_core.models import DocumentSequence
            from django.utils import timezone
            prefix = f"CR-{timezone.now().strftime('%Y%m')}"
            self.receipt_number = DocumentSequence.get_next_number(self.company, 'CLIENT_RECEIPT', prefix)
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.receipt_number} - {self.client.name} (PKR {self.amount}) [{self.status}]"


class ClientReceiptAllocation(BaseModel):
    receipt = models.ForeignKey(
        ClientReceipt,
        on_delete=models.CASCADE,
        related_name='allocations'
    )
    invoice = models.ForeignKey(
        ClientInvoice,
        on_delete=models.RESTRICT,
        related_name='receipt_allocations'
    )
    allocated_amount = models.DecimalField(max_digits=14, decimal_places=2)
    notes = models.CharField(max_length=255, blank=True, default='')

    class Meta(BaseModel.Meta):
        ordering = ['created_at']
        constraints = [
            UniqueConstraint(
                fields=['receipt', 'invoice'],
                condition=Q(is_deleted=False),
                name='unique_active_receipt_invoice_allocation'
            ),
        ]

    def clean(self):
        super().clean()
        if self.receipt_id and str(self.receipt.company_id) != str(self.company_id):
            raise ValidationError({'receipt': 'Receipt must belong to the same company.'})
        if self.invoice_id and str(self.invoice.company_id) != str(self.company_id):
            raise ValidationError({'invoice': 'Invoice must belong to the same company.'})
        if self.receipt_id and self.invoice_id and str(self.receipt.client_id) != str(self.invoice.client_id):
            raise ValidationError({'invoice': 'Invoice must belong to the same client as receipt.'})
        if self.allocated_amount is not None and self.allocated_amount <= 0:
            raise ValidationError({'allocated_amount': 'Allocated amount must be strictly greater than zero.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.receipt.receipt_number} -> {self.invoice.invoice_number} ({self.allocated_amount})"


class RecoveryActivity(BaseModel):
    client = models.ForeignKey(
        'crm.CRMEntity',
        on_delete=models.CASCADE,
        related_name='recovery_activities'
    )
    invoice = models.ForeignKey(
        ClientInvoice,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='recovery_activities'
    )
    activity_type = models.CharField(
        max_length=30,
        choices=RecoveryActivityType.choices,
        default=RecoveryActivityType.PHONE_CALL
    )
    activity_date = models.DateField()
    notes = models.TextField(blank=True, default='')
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='assigned_recovery_activities'
    )
    promise_amount = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    promise_date = models.DateField(null=True, blank=True)
    next_followup_date = models.DateField(null=True, blank=True)
    recovery_status_outcome = models.CharField(
        max_length=30,
        choices=RecoveryStatus.choices,
        default=RecoveryStatus.UNDER_FOLLOWUP
    )
    outbound_email = models.ForeignKey(
        'communications.OutboundEmail',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='recovery_activities'
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='created_recovery_activities'
    )

    class Meta(BaseModel.Meta):
        ordering = ['-activity_date', '-created_at']

    def clean(self):
        super().clean()
        if self.client_id and str(self.client.company_id) != str(self.company_id):
            raise ValidationError({'client': 'Client must belong to the same company.'})
        if self.invoice_id and str(self.invoice.company_id) != str(self.company_id):
            raise ValidationError({'invoice': 'Invoice must belong to the same company.'})
        if self.invoice_id and str(self.invoice.client_id) != str(self.client_id):
            raise ValidationError({'invoice': 'Invoice must belong to the same client.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.activity_type} - {self.client.name} ({self.activity_date}) [{self.recovery_status_outcome}]"

