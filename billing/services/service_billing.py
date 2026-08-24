"""
billing/services/service_billing.py

Phase 8C — Service Contract Billing Service.

Generates ServiceInvoice records from completed DutyAssignments, aggregated
by (company, ServiceContract, billing_period). Posts them to Finance via
the existing finance.services.journal.post_journal_entry() function.

ARCHITECTURAL RULES:
- Reuses finance.services.journal.post_journal_entry() — does NOT modify it.
- Does NOT create Sales.Sale records.
- Does NOT directly manipulate JournalEntry objects.
- Uses source_module='operations', source_document_id=ServiceInvoice.id
  for Finance idempotency.
- All operations are transaction.atomic() + select_for_update().
- Requires a BillingAccountingConfiguration for chart-of-account mapping.
"""

import logging
from datetime import date
from decimal import Decimal
from django.db import transaction
from django.core.exceptions import ValidationError

logger = logging.getLogger(__name__)


class BillingError(Exception):
    """Raised when the billing service encounters a non-retryable error."""
    pass


# ============================================================================
# GENERATE SERVICE INVOICE
# ============================================================================

def generate_service_invoice(company_id, service_contract_id, period_start, period_end, tax_code_id=None, currency_id=None):
    """
    Aggregate completed, un-billed DutyAssignments for a ServiceContract
    and billing period into a ServiceInvoice.

    Returns:
        dict: {
            'created': bool,
            'invoice_id': UUID,
            'total_amount': Decimal,
            'line_count': int,
            'message': str
        }

    Raises:
        BillingError: on validation failures.
    """
    from operations.models import (
        ServiceContract, ServiceContractStatus, Deployment, DeploymentStatus,
        DutyAssignment, DutyAssignmentStatus, ContractRate
    )
    from billing.models import ServiceInvoice, ServiceInvoiceLine, ServiceInvoiceStatus
    from finance.models import TaxCode, Currency, ExchangeRate

    with transaction.atomic():
        # ------------------------------------------------------------------ #
        # 1. Load and validate ServiceContract
        # ------------------------------------------------------------------ #
        try:
            contract = ServiceContract.objects.select_for_update().get(
                id=service_contract_id,
                company_id=company_id,
                is_deleted=False
            )
        except ServiceContract.DoesNotExist:
            raise BillingError(
                f"ServiceContract {service_contract_id} not found for company {company_id}."
            )

        if str(contract.company_id) != str(company_id):
            raise BillingError("Cross-company ServiceContract access rejected.")

        if contract.status not in [ServiceContractStatus.ACTIVE]:
            raise BillingError(
                f"ServiceContract {contract.contract_code} is {contract.status}. "
                f"Only ACTIVE contracts can be billed."
            )

        tax_code = None
        if tax_code_id:
            try:
                tax_code = TaxCode.objects.get(id=tax_code_id, company_id=company_id, is_deleted=False)
            except TaxCode.DoesNotExist:
                raise BillingError(f"TaxCode {tax_code_id} not found for company {company_id}.")

        currency = None
        if currency_id:
            try:
                currency = Currency.objects.get(id=currency_id, company_id=company_id, is_deleted=False)
            except Currency.DoesNotExist:
                raise BillingError(f"Currency {currency_id} not found for company {company_id}.")

        billing_config = _get_billing_config(company_id)
        base_currency = billing_config['currency']

        if not currency:
            currency = base_currency

        exchange_rate = Decimal('1.000000')
        if currency != base_currency:
            er = ExchangeRate.objects.filter(
                company_id=company_id,
                from_currency=currency,
                to_currency=base_currency,
                date__lte=period_end,
                is_deleted=False
            ).order_by('-date').first()
            if not er:
                raise BillingError(f"No exchange rate found from {currency.code} to {base_currency.code} as of {period_end}.")
            exchange_rate = er.rate

        # ------------------------------------------------------------------ #
        # 2. Idempotency: check for existing invoice for this period
        # ------------------------------------------------------------------ #
        existing_invoice = ServiceInvoice.objects.filter(
            company_id=company_id,
            service_contract=contract,
            period_start=period_start,
            period_end=period_end,
            is_deleted=False
        ).first()

        if existing_invoice:
            logger.info(
                f"[BILLING] ServiceInvoice already exists for contract={contract.contract_code}, "
                f"period={period_start}–{period_end}: {existing_invoice.invoice_number}"
            )
            return {
                'created': False,
                'invoice_id': existing_invoice.id,
                'total_amount': existing_invoice.total_amount,
                'line_count': existing_invoice.lines.count(),
                'message': 'Invoice already exists for this period. Idempotent return.'
            }

        # ------------------------------------------------------------------ #
        # 3. Collect all Deployments for this contract in the period
        # ------------------------------------------------------------------ #
        deployments = Deployment.objects.filter(
            company_id=company_id,
            service_contract=contract,
            is_deleted=False,
            status__in=[DeploymentStatus.ACTIVE, DeploymentStatus.COMPLETED]
        ).select_related('designation', 'site', 'employee')

        if not deployments.exists():
            raise BillingError(
                f"No active or completed deployments found for contract {contract.contract_code}."
            )

        # ------------------------------------------------------------------ #
        # 4. Collect completed, un-billed DutyAssignments for those deployments
        # ------------------------------------------------------------------ #
        # "Un-billed" = not already included in any ServiceInvoiceLine
        # We track this via source_duty_assignment_ids JSON field.
        already_billed_ids = _get_already_billed_duty_ids(company_id, contract)

        duty_assignments = DutyAssignment.objects.filter(
            company_id=company_id,
            deployment__in=deployments,
            status=DutyAssignmentStatus.COMPLETED,
            date__gte=period_start,
            date__lte=period_end,
            is_deleted=False
        ).select_related('deployment__designation', 'deployment__service_contract', 'site')

        # Filter out already-billed ones
        unbilled_duties = [d for d in duty_assignments if str(d.id) not in already_billed_ids]

        if not unbilled_duties:
            raise BillingError(
                f"No un-billed completed DutyAssignments found for contract "
                f"{contract.contract_code} between {period_start} and {period_end}."
            )

        # ------------------------------------------------------------------ #
        # 5. Resolve ContractRates and compute amounts
        # ------------------------------------------------------------------ #
        # Group by (designation, site)
        groups = {}
        for duty in unbilled_duties:
            designation = duty.deployment.designation
            site = duty.site
            key = (designation.id, site.id if site else None)

            # Compute hours
            hours = _compute_hours(duty)

            # Resolve billing rate
            rate_obj = ContractRate.objects.filter(
                company_id=company_id,
                service_contract=contract,
                designation=designation,
                effective_date__lte=duty.date,
                is_deleted=False
            ).order_by('-effective_date').first()

            if not rate_obj:
                raise BillingError(
                    f"No ContractRate found for designation '{designation.name}' "
                    f"on contract '{contract.contract_code}' for date {duty.date}. "
                    f"Cannot create partial invoice. Fix ContractRate data first."
                )

            billing_rate = rate_obj.billing_rate

            if key not in groups:
                groups[key] = {
                    'designation': designation,
                    'site': site,
                    'billing_rate': billing_rate,
                    'hours': Decimal('0.00'),
                    'duty_ids': []
                }

            groups[key]['hours'] += hours
            groups[key]['duty_ids'].append(str(duty.id))

        # ------------------------------------------------------------------ #
        # 6. Create ServiceInvoice
        # ------------------------------------------------------------------ #
        crm_entity = contract.crm_entity

        subtotal = sum(
            (g['hours'] * g['billing_rate']).quantize(Decimal('0.01'))
            for g in groups.values()
        )

        tax_amount = Decimal('0.00')
        if tax_code:
            tax_amount = (subtotal * tax_code.rate).quantize(Decimal('0.01'))

        total_amount = subtotal + tax_amount
        base_amount = (total_amount * exchange_rate).quantize(Decimal('0.0001'))

        invoice = ServiceInvoice(
            company_id=company_id,
            service_contract=contract,
            crm_entity=crm_entity,
            period_start=period_start,
            period_end=period_end,
            status=ServiceInvoiceStatus.DRAFT,
            subtotal=subtotal,
            total_amount=total_amount,
            tax_code=tax_code,
            tax_amount=tax_amount,
            currency=currency,
            exchange_rate=exchange_rate,
            base_amount=base_amount
        )
        invoice.save()

        # ------------------------------------------------------------------ #
        # 7. Create ServiceInvoiceLines
        # ------------------------------------------------------------------ #
        for group in groups.values():
            line_amount = (group['hours'] * group['billing_rate']).quantize(Decimal('0.01'))
            line = ServiceInvoiceLine(
                company_id=company_id,
                service_invoice=invoice,
                designation=group['designation'],
                operational_site=group['site'],
                description=(
                    f"{group['designation'].name} – "
                    f"{group['site'].name if group['site'] else 'All Sites'}"
                ),
                hours=group['hours'],
                rate=group['billing_rate'],
                amount=line_amount,
                source_duty_assignment_ids=group['duty_ids']
            )
            line.save()

        logger.info(
            f"[BILLING] Created ServiceInvoice {invoice.invoice_number} "
            f"for contract={contract.contract_code}, total={total_amount}, "
            f"lines={len(groups)}, duties={len(unbilled_duties)}"
        )

        return {
            'created': True,
            'invoice_id': invoice.id,
            'total_amount': total_amount,
            'line_count': len(groups),
            'message': f"ServiceInvoice {invoice.invoice_number} created successfully."
        }


def _get_already_billed_duty_ids(company_id, contract):
    """Return a set of DutyAssignment ID strings already included in an invoice."""
    from billing.models import ServiceInvoiceLine
    billed = set()
    lines = ServiceInvoiceLine.objects.filter(
        company_id=company_id,
        service_invoice__service_contract=contract,
        is_deleted=False
    )
    for line in lines:
        for duty_id in (line.source_duty_assignment_ids or []):
            billed.add(str(duty_id))
    return billed


def _compute_hours(duty):
    """Derive hours from DutyAssignment.start_time and end_time."""
    if not duty.start_time or not duty.end_time:
        return Decimal('0.00')
    from datetime import datetime, date as ddate
    start_dt = datetime.combine(ddate.today(), duty.start_time)
    end_dt = datetime.combine(ddate.today(), duty.end_time)
    delta = end_dt - start_dt
    return Decimal(str(round(delta.total_seconds() / 3600, 4)))


# ============================================================================
# POST SERVICE INVOICE TO FINANCE
# ============================================================================

def post_service_invoice(company_id, invoice_id, user=None):
    """
    Post a DRAFT ServiceInvoice to Finance via post_journal_entry().

    Uses:
        source_module = 'operations'
        source_document_id = invoice.id

    Returns:
        dict: {
            'posted': bool,
            'journal_entry_id': UUID,
            'message': str
        }

    Raises:
        BillingError: on validation failures.
    """
    from billing.models import ServiceInvoice, ServiceInvoiceStatus
    from finance.services.journal import post_journal_entry
    from finance.models import (
        JournalEntry, Journal, AccountingPeriod, ChartOfAccount
    )

    with transaction.atomic():
        # ------------------------------------------------------------------ #
        # 1. Load and lock the invoice
        # ------------------------------------------------------------------ #
        try:
            invoice = ServiceInvoice.objects.select_for_update().get(
                id=invoice_id,
                company_id=company_id,
                is_deleted=False
            )
        except ServiceInvoice.DoesNotExist:
            raise BillingError(
                f"ServiceInvoice {invoice_id} not found for company {company_id}."
            )

        # ------------------------------------------------------------------ #
        # 2. Idempotency: already posted → return existing JournalEntry
        # ------------------------------------------------------------------ #
        if invoice.journal_entry_id:
            logger.info(
                f"[BILLING] Invoice {invoice.invoice_number} already posted "
                f"to JournalEntry {invoice.journal_entry_id}."
            )
            return {
                'posted': False,
                'journal_entry_id': invoice.journal_entry_id,
                'message': 'Invoice already posted. Idempotent return.'
            }

        if invoice.status == ServiceInvoiceStatus.POSTED:
            raise BillingError(
                f"Invoice {invoice.invoice_number} is POSTED but has no journal_entry FK. "
                f"Data inconsistency detected."
            )

        if invoice.status == ServiceInvoiceStatus.CANCELLED:
            raise BillingError(
                f"Cannot post a CANCELLED invoice."
            )

        # Finance idempotency: check if a JE already exists for this document
        existing_je = JournalEntry.objects.filter(
            company_id=company_id,
            source_module='operations',
            source_document_id=invoice.id,
            is_deleted=False
        ).exclude(status='REVERSED').first()

        if existing_je:
            invoice.journal_entry = existing_je
            invoice.status = ServiceInvoiceStatus.POSTED
            invoice.save(update_fields=['journal_entry', 'status'])
            return {
                'posted': False,
                'journal_entry_id': existing_je.id,
                'message': 'Existing JournalEntry found and linked. Idempotent.'
            }

        # ------------------------------------------------------------------ #
        # 3. Validate accounting period is OPEN
        # ------------------------------------------------------------------ #
        posting_date = invoice.period_end
        period = AccountingPeriod.objects.filter(
            company_id=company_id,
            start_date__lte=posting_date,
            end_date__gte=posting_date,
            is_deleted=False
        ).first()

        if not period:
            raise BillingError(
                f"No accounting period found for {posting_date}. Cannot post invoice."
            )

        if period.status != 'OPEN':
            raise BillingError(
                f"Accounting period is {period.status}. Must be OPEN to post invoice."
            )

        # ------------------------------------------------------------------ #
        # 4. Resolve accounts from BillingAccountingConfiguration
        # ------------------------------------------------------------------ #
        billing_config = _get_billing_config(company_id)

        ar_account = billing_config['accounts_receivable']
        revenue_account = billing_config['service_revenue']
        tax_payable_account = billing_config.get('tax_payable')
        currency = invoice.currency if invoice.currency else billing_config['currency']
        exchange_rate = invoice.exchange_rate

        if invoice.tax_amount > 0 and not tax_payable_account:
            raise BillingError("Tax is applied but tax_payable_account is not configured in BillingAccountingConfiguration.")

        # ------------------------------------------------------------------ #
        # 5. Resolve Journal (SALES or GENERAL)
        # ------------------------------------------------------------------ #
        journal = Journal.objects.filter(
            company_id=company_id,
            journal_type='SALES',
            is_deleted=False
        ).first()

        if not journal:
            journal, _ = Journal.objects.get_or_create(
                company_id=company_id,
                code='SERVICES',
                defaults={
                    'name': 'Services Revenue Journal',
                    'journal_type': 'SALES'
                }
            )

        # ------------------------------------------------------------------ #
        # 6. Build double-entry lines (Amounts passed in BASE currency)
        #    DR: Accounts Receivable (customer owes us)
        #    CR: Service Revenue
        # ------------------------------------------------------------------ #
        base_subtotal = (invoice.subtotal * exchange_rate).quantize(Decimal('0.01'))
        base_tax = (invoice.tax_amount * exchange_rate).quantize(Decimal('0.01'))
        base_total = base_subtotal + base_tax
        
        lines = [
            {
                'account': ar_account,
                'debit': base_total,
                'credit': Decimal('0.00'),
                'currency': currency,
                'exchange_rate': exchange_rate,
                'crm_entity': invoice.crm_entity
            },
            {
                'account': revenue_account,
                'debit': Decimal('0.00'),
                'credit': base_subtotal,
                'currency': currency,
                'exchange_rate': exchange_rate,
                'crm_entity': invoice.crm_entity
            }
        ]

        if invoice.tax_amount > 0:
            lines.append({
                'account': tax_payable_account,
                'debit': Decimal('0.00'),
                'credit': base_tax,
                'currency': currency,
                'exchange_rate': exchange_rate,
                'crm_entity': invoice.crm_entity
            })

        # ------------------------------------------------------------------ #
        # 7. Post via existing journal service — do NOT modify it
        # ------------------------------------------------------------------ #
        journal_entry = post_journal_entry(
            company=invoice.company,
            journal=journal,
            entry_date=posting_date,
            description=f"Service Invoice {invoice.invoice_number} – {invoice.service_contract.contract_code}",
            lines=lines,
            reference=invoice.invoice_number,
            source_module='operations',
            source_document_type='ServiceInvoice',
            source_document_id=invoice.id,
            created_by=user
        )

        # ------------------------------------------------------------------ #
        # 8. Link journal entry back to invoice and mark POSTED
        # ------------------------------------------------------------------ #
        invoice.journal_entry = journal_entry
        invoice.status = ServiceInvoiceStatus.POSTED
        invoice.save(update_fields=['journal_entry', 'status'])

        logger.info(
            f"[BILLING] Posted ServiceInvoice {invoice.invoice_number} "
            f"→ JournalEntry {journal_entry.id}"
        )

        return {
            'posted': True,
            'journal_entry_id': journal_entry.id,
            'message': f"Invoice {invoice.invoice_number} posted successfully."
        }


def _get_billing_config(company_id):
    """
    Retrieve or raise BillingError if BillingAccountingConfiguration is missing.
    """
    from billing.models import BillingAccountingConfiguration
    config = BillingAccountingConfiguration.objects.filter(
        company_id=company_id,
        is_active=True,
        is_deleted=False
    ).first()

    if not config:
        raise BillingError(
            f"No active BillingAccountingConfiguration found for company {company_id}. "
            f"Please set up the billing accounting configuration before posting invoices."
        )

    return {
        'accounts_receivable': config.accounts_receivable_account,
        'service_revenue': config.service_revenue_account,
        'tax_payable': config.tax_payable_account,
        'payment_account': config.payment_account,
        'currency': config.default_currency,
    }


# ============================================================================
# CANCEL SERVICE INVOICE
# ============================================================================

def cancel_service_invoice(invoice_id, company_id, user=None):
    from billing.models import ServiceInvoice, ServiceInvoiceStatus
    from finance.services.journal import post_journal_entry

    with transaction.atomic():
        try:
            invoice = ServiceInvoice.objects.select_for_update().get(
                id=invoice_id,
                company_id=company_id,
                is_deleted=False
            )
        except ServiceInvoice.DoesNotExist:
            raise BillingError(f"ServiceInvoice {invoice_id} not found.")

        if invoice.status == ServiceInvoiceStatus.CANCELLED:
            # Idempotent return
            return {
                'cancelled': False,
                'message': 'Invoice already cancelled.'
            }

        if invoice.status == ServiceInvoiceStatus.DRAFT:
            invoice.status = ServiceInvoiceStatus.CANCELLED
            invoice.save(update_fields=['status'])
            return {
                'cancelled': True,
                'message': 'Draft invoice cancelled.'
            }

        # It's POSTED
        if invoice.payments.filter(is_deleted=False).exists():
            raise BillingError("Cannot cancel an invoice that has payments. Please reverse payments first.")

        existing_entry = invoice.journal_entry
        if not existing_entry:
            raise BillingError("Invoice is POSTED but missing journal_entry. Data inconsistency.")

        lines = []
        for line in existing_entry.lines.filter(is_deleted=False):
            lines.append({
                'account': line.account,
                'debit': line.credit,
                'credit': line.debit,
                'currency': line.currency,
                'exchange_rate': getattr(line, 'exchange_rate', Decimal('1.000000')),
                'crm_entity': line.crm_entity,
                'cost_center': line.cost_center,
                'profit_center': line.profit_center
            })

        posting_date = invoice.period_end
        
        reversal_entry = post_journal_entry(
            company=invoice.company,
            journal=existing_entry.journal,
            entry_date=posting_date,
            description=f"Reversal of {existing_entry.entry_number}",
            lines=lines,
            reference=existing_entry.entry_number,
            source_module='operations',
            source_document_type='ServiceInvoiceReversal',
            source_document_id=invoice.id,
            created_by=user
        )

        existing_entry.status = 'REVERSED'
        existing_entry.save(update_fields=['status'])

        invoice.status = ServiceInvoiceStatus.CANCELLED
        invoice.save(update_fields=['status'])

        return {
            'cancelled': True,
            'reversal_entry_id': reversal_entry.id,
            'message': 'Posted invoice cancelled and reversed.'
        }


# ============================================================================
# RECORD INVOICE PAYMENT
# ============================================================================

def record_invoice_payment(invoice_id, amount, payment_date, payment_method, reference, company_id, bank_account_id=None, user=None):
    from billing.models import ServiceInvoice, ServiceInvoiceStatus, ServiceInvoicePayment, ServiceInvoicePaymentStatus
    from finance.models import Journal, BankAccount
    from finance.services.journal import post_journal_entry

    amount = Decimal(str(amount)).quantize(Decimal('0.01'))
    if amount <= 0:
        raise BillingError("Payment amount must be greater than 0.")

    with transaction.atomic():
        try:
            invoice = ServiceInvoice.objects.select_for_update().get(
                id=invoice_id,
                company_id=company_id,
                is_deleted=False
            )
        except ServiceInvoice.DoesNotExist:
            raise BillingError(f"ServiceInvoice {invoice_id} not found.")

        if invoice.status == ServiceInvoiceStatus.CANCELLED:
            raise BillingError("Cannot record payment for a CANCELLED invoice.")

        if invoice.status == ServiceInvoiceStatus.DRAFT:
            raise BillingError("Cannot record payment for a DRAFT invoice. Post it first.")

        # Idempotency / Duplicate Check
        if reference:
            existing_payment = ServiceInvoicePayment.objects.filter(
                company_id=company_id,
                service_invoice=invoice,
                reference=reference,
                is_deleted=False
            ).first()
            if existing_payment:
                return {
                    'recorded': False,
                    'payment_id': existing_payment.id,
                    'message': 'Payment with this reference already exists. Idempotent return.'
                }

        outstanding = invoice.total_amount - invoice.paid_amount
        if amount > outstanding:
            raise BillingError(f"Payment amount {amount} exceeds outstanding balance {outstanding}.")

        billing_config = _get_billing_config(company_id)
        
        payment_gl_account = None
        if bank_account_id:
            bank_account = BankAccount.objects.filter(id=bank_account_id, company_id=company_id).first()
            if not bank_account:
                raise BillingError("Invalid bank account selected.")
            payment_gl_account = bank_account.chart_of_account
        else:
            payment_gl_account = billing_config.get('payment_account')

        ar_account = billing_config['accounts_receivable']
        currency = billing_config['currency']

        if not payment_gl_account:
            raise BillingError("Payment account is not configured and no bank account was provided.")

        # Resolve Receipt Journal
        journal, _ = Journal.objects.get_or_create(
            company_id=company_id,
            code='RECEIPTS',
            defaults={
                'name': 'Cash Receipts Journal',
                'journal_type': 'CASH'
            }
        )

        currency = invoice.currency if invoice.currency else billing_config['currency']
        exchange_rate = invoice.exchange_rate
        base_amount = (amount * exchange_rate).quantize(Decimal('0.01'))

        lines = [
            {
                'account': payment_gl_account,
                'debit': base_amount,
                'credit': Decimal('0.00'),
                'currency': currency,
                'exchange_rate': exchange_rate,
                'crm_entity': invoice.crm_entity
            },
            {
                'account': ar_account,
                'debit': Decimal('0.00'),
                'credit': base_amount,
                'currency': currency,
                'exchange_rate': exchange_rate,
                'crm_entity': invoice.crm_entity
            }
        ]

        journal_entry = post_journal_entry(
            company=invoice.company,
            journal=journal,
            entry_date=payment_date,
            description=f"Payment for Invoice {invoice.invoice_number}",
            lines=lines,
            reference=reference,
            source_module='operations',
            source_document_type='ServiceInvoicePayment',
            source_document_id=invoice.id, # temporary until we have the payment id
            created_by=user
        )

        payment = ServiceInvoicePayment(
            company_id=company_id,
            service_invoice=invoice,
            payment_date=payment_date,
            amount=amount,
            payment_method=payment_method,
            reference=reference,
            journal_entry=journal_entry
        )
        payment.save()
        
        # update source_document_id to the payment id now that we have it
        journal_entry.source_document_id = payment.id
        journal_entry.save(update_fields=['source_document_id'])

        invoice.paid_amount += amount
        if invoice.paid_amount >= invoice.total_amount:
            invoice.payment_status = ServiceInvoicePaymentStatus.PAID
        else:
            invoice.payment_status = ServiceInvoicePaymentStatus.PARTIALLY_PAID
        
        invoice.save(update_fields=['paid_amount', 'payment_status'])

        return {
            'recorded': True,
            'payment_id': payment.id,
            'journal_entry_id': journal_entry.id,
            'message': 'Payment recorded successfully.'
        }
