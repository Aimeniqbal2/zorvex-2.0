"""
Invoice Generator & Client Invoice Dispatch Service for Phase S-4B.

Handles:
1. Generation of ClientInvoice and snapshot ClientInvoiceLine items from an APPROVED BillingSheet.
2. Status transitions (DRAFT -> ISSUED -> SENT).
3. Outbound email dispatch with HTML invoice rendering via universal communications engine.
4. Rendering rich invoice context (branding, company profile, NTN/STRN, bank settlement details).
"""
import logging
from decimal import Decimal
from datetime import date, timedelta
from typing import Dict, Any, Optional

from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError

from billing.models import (
    BillingSheet,
    BillingSheetStatus,
    ClientInvoice,
    ClientInvoiceLine,
    ClientInvoiceStatus,
)
from communications.services import EmailDeliveryService
from communications.models import SenderIdentity, OutboundEmail
from finance.models import SecurityFinanceConfiguration

logger = logging.getLogger(__name__)


class InvoiceGeneratorService:
    """
    Authoritative service for generating and issuing Client Invoices from approved Billing Sheets.
    """

    @classmethod
    @transaction.atomic
    def generate_client_invoice_from_sheet(
        cls,
        billing_sheet: BillingSheet,
        user=None,
        invoice_date: Optional[date] = None,
        due_date: Optional[date] = None,
        payment_terms: str = "Net 30",
        notes: str = "",
    ) -> ClientInvoice:
        """
        Generates an immutable ClientInvoice from an APPROVED BillingSheet.
        Transitions BillingSheet to INVOICED.
        Snapshots all active billing sheet lines to ClientInvoiceLine records.
        """
        if billing_sheet.status != BillingSheetStatus.APPROVED:
            raise ValidationError(
                f"Cannot generate invoice from Billing Sheet '{billing_sheet.sheet_number}'. "
                f"Status must be APPROVED, current status is {billing_sheet.status}."
            )

        if hasattr(billing_sheet, 'invoice') and billing_sheet.invoice is not None:
            raise ValidationError(
                f"Billing Sheet '{billing_sheet.sheet_number}' is already linked to Invoice '{billing_sheet.invoice.invoice_number}'."
            )

        inv_date = invoice_date or timezone.now().date()
        if not due_date:
            due_date = inv_date + timedelta(days=30)

        invoice_number = ClientInvoice.generate_next_invoice_number(billing_sheet.company)

        # Create ClientInvoice
        invoice = ClientInvoice.objects.create(
            company=billing_sheet.company,
            invoice_number=invoice_number,
            client=billing_sheet.client,
            contract=billing_sheet.contract,
            billing_sheet=billing_sheet,
            invoice_date=inv_date,
            due_date=due_date,
            billing_month=billing_sheet.billing_month,
            period_start=billing_sheet.period_start,
            period_end=billing_sheet.period_end,
            currency=billing_sheet.currency,
            payment_terms=payment_terms or "Net 30",
            subtotal=billing_sheet.subtotal,
            tax_amount=billing_sheet.tax_amount,
            grand_total=billing_sheet.total_amount,
            paid_amount=Decimal('0.00'),
            status=ClientInvoiceStatus.DRAFT,
            notes=notes or f"Generated from Billing Sheet {billing_sheet.sheet_number}",
            terms_and_conditions="Payment is due within the specified payment terms. Direct wire or cross-cheque payable to company account.",
            issued_by=user,
        )

        # Snapshot all lines
        sheet_lines = billing_sheet.lines.filter(is_deleted=False).order_by('id')
        invoice_lines = []
        for line in sheet_lines:
            invoice_lines.append(
                ClientInvoiceLine(
                    company=billing_sheet.company,
                    invoice=invoice,
                    billing_sheet_line=line,
                    site=line.site,
                    line_type=line.line_type,
                    description=line.description,
                    designation=line.designation,
                    quantity=line.billable_quantity,
                    unit_rate=line.unit_rate,
                    line_subtotal=line.line_subtotal,
                    tax_rate=line.tax_rate,
                    tax_amount=line.tax_amount,
                    total_amount=line.total_amount,
                    profit_center=line.profit_center,
                    cost_center=line.cost_center,
                )
            )

        ClientInvoiceLine.objects.bulk_create(invoice_lines)

        # Transition BillingSheet status to INVOICED
        billing_sheet.status = BillingSheetStatus.INVOICED
        billing_sheet.save(update_fields=['status', 'updated_at'])

        logger.info("Generated ClientInvoice %s from BillingSheet %s", invoice.invoice_number, billing_sheet.sheet_number)
        return invoice

    @classmethod
    @transaction.atomic
    def issue_client_invoice(cls, invoice: ClientInvoice, user=None) -> ClientInvoice:
        """
        Transitions ClientInvoice from DRAFT to ISSUED.
        """
        if invoice.status != ClientInvoiceStatus.DRAFT:
            raise ValidationError(
                f"Invoice '{invoice.invoice_number}' cannot be issued because its status is {invoice.status}."
            )

        invoice.status = ClientInvoiceStatus.ISSUED
        invoice.issued_at = timezone.now()
        invoice.issued_by = user
        invoice.save(update_fields=['status', 'issued_at', 'issued_by', 'updated_at'])

        logger.info("Issued ClientInvoice %s by %s", invoice.invoice_number, user)
        return invoice

    @classmethod
    def render_invoice_context(cls, invoice: ClientInvoice) -> Dict[str, Any]:
        """
        Prepares rich data dictionary for PDF generation or web view.
        """
        company = invoice.company
        client = invoice.client
        contract = invoice.contract
        sheet = invoice.billing_sheet

        # Fetch Security Finance Configuration if configured
        sec_cfg = SecurityFinanceConfiguration.objects.filter(company=company, is_deleted=False).first()

        lines = invoice.lines.filter(is_deleted=False).select_related('site').order_by('site_id', 'id')

        # Group lines by site for clean presentation
        site_breakdown = {}
        for line in lines:
            site_name = line.site.name if line.site else "Contract General Services"
            site_code = str(line.site.id)[:8] if line.site else "GEN"
            if site_name not in site_breakdown:
                site_breakdown[site_name] = {
                    'site_code': site_code,
                    'site_name': site_name,
                    'lines': [],
                    'site_subtotal': Decimal('0.00'),
                    'site_tax': Decimal('0.00'),
                    'site_total': Decimal('0.00'),
                }
            site_breakdown[site_name]['lines'].append({
                'id': line.id,
                'line_type': line.line_type,
                'line_type_display': line.line_type,
                'description': line.description,
                'designation': line.designation.name if line.designation else None,
                'billing_unit': 'MONTHLY',
                'quantity': float(line.quantity),
                'unit_price': float(line.unit_rate),
                'subtotal': float(line.line_subtotal),
                'tax_rate': float(line.tax_rate),
                'tax_amount': float(line.tax_amount),
                'total_amount': float(line.total_amount),
            })
            site_breakdown[site_name]['site_subtotal'] += line.line_subtotal
            site_breakdown[site_name]['site_tax'] += line.tax_amount
            site_breakdown[site_name]['site_total'] += line.total_amount

        # Convert Decimals to float for JSON safety
        site_groups = []
        for s_name, data in site_breakdown.items():
            site_groups.append({
                'site_name': s_name,
                'site_code': data['site_code'],
                'lines': data['lines'],
                'site_subtotal': float(data['site_subtotal']),
                'site_tax': float(data['site_tax']),
                'site_total': float(data['site_total']),
            })

        # Bank details
        bank_details = {
            'bank_name': getattr(sec_cfg, 'bank_name', '') if sec_cfg else '',
            'account_title': getattr(sec_cfg, 'account_title', '') if sec_cfg else (company.name if company else ''),
            'account_number': getattr(sec_cfg, 'account_number', '') if sec_cfg else '',
            'iban': getattr(sec_cfg, 'iban', '') if sec_cfg else '',
            'branch_code': getattr(sec_cfg, 'branch_code', '') if sec_cfg else '',
        }

        return {
            'invoice_id': invoice.id,
            'invoice_number': invoice.invoice_number,
            'invoice_date': invoice.invoice_date.isoformat() if invoice.invoice_date else "",
            'due_date': invoice.due_date.isoformat() if invoice.due_date else "",
            'billing_month': invoice.billing_month,
            'period_start': invoice.period_start.isoformat() if invoice.period_start else "",
            'period_end': invoice.period_end.isoformat() if invoice.period_end else "",
            'currency': invoice.currency,
            'payment_terms': invoice.payment_terms,
            'status': invoice.status,
            'status_display': invoice.get_status_display(),
            'notes': invoice.notes,
            'terms_and_conditions': invoice.terms_and_conditions,
            'subtotal': float(invoice.subtotal),
            'tax_rate': float(invoice.billing_sheet.tax_rate) if invoice.billing_sheet and hasattr(invoice.billing_sheet, 'tax_rate') else 0.0,
            'tax_amount': float(invoice.tax_amount),
            'grand_total': float(invoice.grand_total),
            'paid_amount': float(invoice.paid_amount),
            'balance_due': float(invoice.grand_total - invoice.paid_amount),
            'company': {
                'id': company.id,
                'name': company.name,
                'ntn': getattr(company, 'tax_number', '') or getattr(company, 'ntn', ''),
                'strn': getattr(company, 'strn', '') or getattr(sec_cfg, 'pra_sales_tax_registration', ''),
                'address': getattr(company, 'address', ''),
                'email': getattr(company, 'email', ''),
                'phone': getattr(company, 'phone', ''),
            },
            'client': {
                'id': client.id if client else None,
                'name': client.name if client else (invoice.contract.client_name if invoice.contract and hasattr(invoice.contract, 'client_name') else "Unknown Client"),
                'trade_name': getattr(client, 'trade_name', '') if client else '',
                'ntn': getattr(client, 'ntn', '') if client else '',
                'strn': getattr(client, 'strn', '') if client else '',
                'billing_address': getattr(client, 'address', '') if client else '',
                'contact_person': getattr(client, 'contact_person', '') if client else '',
                'contact_email': getattr(client, 'email', '') if client else '',
                'contact_phone': getattr(client, 'phone', '') if client else '',
            },
            'contract': {
                'id': contract.id if contract else None,
                'contract_number': getattr(contract, 'contract_code', getattr(contract, 'contract_number', '')) if contract else "",
                'title': getattr(contract, 'title', getattr(contract, 'contract_code', '')) if contract else "",
                'client_name': getattr(contract, 'client_name', contract.crm_entity.name if contract and hasattr(contract, 'crm_entity') else "") if contract else "",
            } if contract else None,
            'billing_sheet': {
                'id': sheet.id if sheet else None,
                'sheet_number': sheet.sheet_number if sheet else "",
            } if sheet else None,
            'sites_breakdown': site_groups,
            'bank_details': bank_details,
        }

    @classmethod
    def generate_invoice_html(cls, invoice: ClientInvoice) -> str:
        """
        Generates branded HTML invoice body for email dispatch or rendering.
        """
        context = cls.render_invoice_context(invoice)
        comp = context['company']
        client = context['client']
        curr = context['currency']

        lines_html = ""
        for site_group in context['sites_breakdown']:
            lines_html += f"""
            <tr style="background-color: #f1f5f9;">
                <td colspan="5" style="padding: 8px 12px; font-weight: bold; color: #1e293b; border-top: 1px solid #cbd5e1; border-bottom: 1px solid #cbd5e1;">
                    📍 Site: {site_group['site_name']} ({site_group['site_code']})
                </td>
            </tr>
            """
            for line in site_group['lines']:
                lines_html += f"""
                <tr>
                    <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; color: #334155;">
                        <strong>{line['line_type_display']}</strong><br/>
                        <span style="font-size: 12px; color: #64748b;">{line['description']}</span>
                    </td>
                    <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: center; color: #334155;">
                        {line['quantity']} {line['billing_unit']}
                    </td>
                    <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #334155;">
                        {curr} {line['unit_price']:,.2f}
                    </td>
                    <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #334155;">
                        {curr} {line['tax_amount']:,.2f} ({line['tax_rate']}%)
                    </td>
                    <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 600; color: #0f172a;">
                        {curr} {line['total_amount']:,.2f}
                    </td>
                </tr>
                """

        bank = context['bank_details']
        bank_html = ""
        if bank.get('bank_name') or bank.get('account_number'):
            bank_html = f"""
            <div style="margin-top: 20px; padding: 12px 16px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;">
                <h4 style="margin: 0 0 8px 0; color: #1e293b; font-size: 14px;">Bank Settlement Details</h4>
                <p style="margin: 2px 0; font-size: 13px; color: #475569;"><strong>Bank:</strong> {bank.get('bank_name', 'N/A')}</p>
                <p style="margin: 2px 0; font-size: 13px; color: #475569;"><strong>Account Title:</strong> {bank.get('account_title', 'N/A')}</p>
                <p style="margin: 2px 0; font-size: 13px; color: #475569;"><strong>Account / IBAN:</strong> {bank.get('account_number', '')} {bank.get('iban', '')}</p>
            </div>
            """

        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8"/>
            <title>Invoice {invoice.invoice_number}</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
            <div style="max-width: 800px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                <!-- Header -->
                <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 20px; margin-bottom: 24px;">
                    <div>
                        <h1 style="margin: 0; font-size: 24px; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px;">{comp['name']}</h1>
                        <p style="margin: 4px 0 0 0; color: #64748b; font-size: 13px;">Security Services & Risk Management Solutions</p>
                        {f"<p style='margin: 2px 0; color: #64748b; font-size: 12px;'>NTN: {comp['ntn']} | STRN: {comp['strn']}</p>" if comp.get('ntn') else ""}
                    </div>
                    <div style="text-align: right;">
                        <h2 style="margin: 0; font-size: 20px; color: #2563eb;">INVOICE</h2>
                        <p style="margin: 4px 0 0 0; font-size: 16px; font-weight: bold; color: #0f172a;">{invoice.invoice_number}</p>
                        <p style="margin: 2px 0; font-size: 13px; color: #64748b;">Date: {invoice.invoice_date}</p>
                        <p style="margin: 2px 0; font-size: 13px; color: #ef4444; font-weight: 600;">Due: {invoice.due_date}</p>
                    </div>
                </div>

                <!-- Bill To & Contract Info -->
                <div style="display: flex; justify-content: space-between; margin-bottom: 24px; font-size: 13px;">
                    <div style="flex: 1; padding-right: 16px;">
                        <h3 style="margin: 0 0 6px 0; font-size: 14px; text-transform: uppercase; color: #64748b;">Billed To</h3>
                        <p style="margin: 0; font-size: 15px; font-weight: bold; color: #0f172a;">{client['name']}</p>
                        {f"<p style='margin: 2px 0; color: #475569;'>{client['billing_address']}</p>" if client.get('billing_address') else ""}
                        {f"<p style='margin: 2px 0; color: #475569;'>NTN: {client['ntn']}</p>" if client.get('ntn') else ""}
                        {f"<p style='margin: 2px 0; color: #475569;'>Attn: {client['contact_person']}</p>" if client.get('contact_person') else ""}
                    </div>
                    <div style="flex: 1; text-align: right;">
                        <h3 style="margin: 0 0 6px 0; font-size: 14px; text-transform: uppercase; color: #64748b;">Billing Details</h3>
                        <p style="margin: 2px 0; color: #475569;"><strong>Billing Month:</strong> {invoice.billing_month}</p>
                        <p style="margin: 2px 0; color: #475569;"><strong>Period:</strong> {invoice.period_start} to {invoice.period_end}</p>
                        <p style="margin: 2px 0; color: #475569;"><strong>Payment Terms:</strong> {invoice.payment_terms}</p>
                        <p style="margin: 2px 0; color: #475569;"><strong>Contract:</strong> {getattr(invoice.contract, 'contract_code', getattr(invoice.contract, 'contract_number', 'N/A')) if invoice.contract else 'N/A'}</p>
                    </div>
                </div>

                <!-- Line Items Table -->
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px;">
                    <thead>
                        <tr style="background-color: #0f172a; color: #ffffff;">
                            <th style="padding: 10px 12px; text-align: left;">Description</th>
                            <th style="padding: 10px 12px; text-align: center;">Qty / Unit</th>
                            <th style="padding: 10px 12px; text-align: right;">Rate</th>
                            <th style="padding: 10px 12px; text-align: right;">Tax</th>
                            <th style="padding: 10px 12px; text-align: right;">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {lines_html}
                    </tbody>
                </table>

                <!-- Totals Summary -->
                <div style="display: flex; justify-content: flex-end; margin-bottom: 24px;">
                    <div style="width: 300px; font-size: 14px;">
                        <div style="display: flex; justify-content: space-between; padding: 4px 0; color: #475569;">
                            <span>Subtotal:</span>
                            <span style="font-weight: 600;">{curr} {context['subtotal']:,.2f}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 4px 0; color: #475569;">
                            <span>Sales Tax ({context['tax_rate']}%):</span>
                            <span style="font-weight: 600;">{curr} {context['tax_amount']:,.2f}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 8px 0; border-top: 2px solid #0f172a; margin-top: 4px; font-size: 16px; font-weight: bold; color: #0f172a;">
                            <span>Total Due:</span>
                            <span style="color: #2563eb;">{curr} {context['grand_total']:,.2f}</span>
                        </div>
                    </div>
                </div>

                {bank_html}

                <!-- Notes & Terms -->
                <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b;">
                    <p style="margin: 4px 0;"><strong>Notes:</strong> {invoice.notes}</p>
                    <p style="margin: 4px 0;"><strong>Terms & Conditions:</strong> {invoice.terms_and_conditions}</p>
                </div>
            </div>
        </body>
        </html>
        """
        return html

    @classmethod
    @transaction.atomic
    def send_client_invoice_email(
        cls,
        invoice: ClientInvoice,
        user=None,
        sender_identity: Optional[SenderIdentity] = None,
        to_email: Optional[str] = None,
        subject: Optional[str] = None,
        body_html: Optional[str] = None,
    ) -> OutboundEmail:
        """
        Dispatches ClientInvoice to client via universal communications engine.
        Transitions invoice status to SENT.
        """
        if invoice.status == ClientInvoiceStatus.DRAFT:
            # Auto-issue if currently DRAFT
            cls.issue_client_invoice(invoice, user=user)

        target_email = to_email
        if not target_email:
            target_email = getattr(invoice.client, 'email', '') if invoice.client else ''
        if not target_email and invoice.contract:
            target_email = getattr(invoice.contract, 'client_email', '')

        if not target_email:
            raise ValidationError(
                f"Cannot send invoice '{invoice.invoice_number}'. No recipient email address found."
            )

        if not sender_identity:
            sender_identity = SenderIdentity.objects.filter(
                company=invoice.company,
                is_active=True,
            ).first()

        if not sender_identity:
            raise ValidationError(
                "Cannot send invoice email: No active SenderIdentity configured for this tenant."
            )

        mail_subject = subject or f"Security Services Invoice {invoice.invoice_number} - {invoice.company.name}"
        mail_html = body_html or cls.generate_invoice_html(invoice)

        # Dispatch through universal communications EmailDeliveryService
        outbound = OutboundEmail.objects.create(
            company=invoice.company,
            sender_identity=sender_identity,
            to=target_email,
            subject=mail_subject,
            body_html=mail_html,
            body_text=f"Client Invoice {invoice.invoice_number} from {invoice.company.name}",
            status='QUEUED',
            context_type='client_invoice',
            context_id=str(invoice.id),
            created_by=user,
        )
        EmailDeliveryService.send_outbound_email(outbound)

        invoice.status = ClientInvoiceStatus.SENT
        invoice.sent_at = timezone.now()
        invoice.sent_by = user
        invoice.outbound_email = outbound
        invoice.save(update_fields=['status', 'sent_at', 'sent_by', 'outbound_email', 'updated_at'])

        logger.info("Sent ClientInvoice %s to %s via OutboundEmail %s", invoice.invoice_number, target_email, outbound.id)
        return outbound


generate_client_invoice_from_sheet = InvoiceGeneratorService.generate_client_invoice_from_sheet
issue_client_invoice = InvoiceGeneratorService.issue_client_invoice
render_invoice_context = InvoiceGeneratorService.render_invoice_context
send_client_invoice_email = InvoiceGeneratorService.send_client_invoice_email
