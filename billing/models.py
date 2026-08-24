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

