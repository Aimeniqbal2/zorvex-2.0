"""
Invoice Generator & Client Invoice Dispatch Service for Phase S-4B.

Handles:
1. Generation of ClientInvoice and snapshot ClientInvoiceLine items from an APPROVED BillingSheet.
2. Status transitions (DRAFT -> ISSUED -> SENT).
3. Outbound email dispatch with HTML invoice rendering via universal communications engine.
4. Rendering rich invoice context (branding, company profile, NTN/STRN, bank settlement details).
"""
import html as html_escape
import logging
import re
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
from billing.services.invoice_template_service import (
    amount_to_words_pkr,
    get_invoice_templates,
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
        Prepares rich multi-tenant data dictionary for PDF/Print preview, email rendering,
        supporting both CASH ('INVOICE') and CHEQUE ('SALES TAX INVOICE') formats.
        """
        company = invoice.company
        client = invoice.client
        contract = invoice.contract
        sheet = invoice.billing_sheet

        templates_bundle = get_invoice_templates(company)
        branding = templates_bundle['company_defaults']

        sec_cfg = SecurityFinanceConfiguration.objects.filter(company=company, is_deleted=False).first()

        lines = list(
            invoice.lines.filter(is_deleted=False)
            .select_related('site', 'designation')
            .order_by('site_id', 'id')
        )

        # Resolve template format flag from notes ([FMT:CASH] | [FMT:CHEQUE]), fallback by tax amount
        fmt_match = re.search(r'\[FMT:(CASH|CHEQUE)\]', invoice.notes or '', re.IGNORECASE)
        if fmt_match:
            template_mode = fmt_match.group(1).upper()
        else:
            template_mode = 'CHEQUE' if Decimal(str(invoice.tax_amount or 0)) > Decimal('0.00') else 'CASH'

        calc_match = re.search(r'\[MODE:(CONTRACT_RATE|ATTENDANCE_RATE)\]', invoice.notes or '', re.IGNORECASE)
        calculation_mode = calc_match.group(1).upper() if calc_match else 'CONTRACT_RATE'

        # Strip internal tracking tags for clean customer-facing notes
        clean_notes = re.sub(r'\[(?:MODE|SITE|TSR|FMT):[^\]]+\]', '', invoice.notes or '').strip()

        # Resolve client address, contact & tax number cleanly from CRMEntity + CRMAddress/CRMContact
        client_address = ''
        client_contact_person = ''
        client_email = ''
        client_phone = ''
        if client:
            try:
                addr_obj = (
                    client.addresses.filter(is_deleted=False, address_type='Billing').order_by('-is_default').first()
                    or client.addresses.filter(is_deleted=False).order_by('-is_default').first()
                )
                if addr_obj:
                    parts = [addr_obj.line1, addr_obj.line2, addr_obj.city, addr_obj.state]
                    client_address = ', '.join([p for p in parts if p])
            except Exception:
                client_address = ''
            try:
                contact_obj = client.contacts.filter(is_deleted=False).order_by('-is_primary', 'id').first()
                if contact_obj:
                    client_contact_person = f"{contact_obj.first_name} {contact_obj.last_name}".strip()
                    client_email = contact_obj.email or ''
                    client_phone = contact_obj.phone or contact_obj.mobile or ''
            except Exception:
                pass

        # Group lines by site & collect flat serialized lines
        site_breakdown = {}
        flat_lines = []
        primary_site = None
        total_guard_qty = Decimal('0.00')

        for line in lines:
            if line.site and not primary_site:
                primary_site = line.site
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
            line_dict = {
                'id': str(line.id),
                'line_type': line.line_type,
                'line_type_display': line.line_type.replace('_', ' ').title() if line.line_type else 'Security Service',
                'description': line.description,
                'site_name': site_name,
                'designation': line.designation.name if line.designation else None,
                'billing_unit': 'MONTHLY',
                'quantity': float(line.quantity),
                'unit_price': float(line.unit_rate),
                'unit_rate': float(line.unit_rate),
                'line_subtotal': float(line.line_subtotal),
                'subtotal': float(line.line_subtotal),
                'tax_rate': float(line.tax_rate),
                'tax_amount': float(line.tax_amount),
                'total_amount': float(line.total_amount),
            }
            flat_lines.append(line_dict)
            site_breakdown[site_name]['lines'].append(line_dict)
            site_breakdown[site_name]['site_subtotal'] += line.line_subtotal
            site_breakdown[site_name]['site_tax'] += line.tax_amount
            site_breakdown[site_name]['site_total'] += line.total_amount
            total_guard_qty += Decimal(str(line.quantity or 0))

        # Check site tag in notes if line.site wasn't linked
        if not primary_site:
            m_site = re.search(r'\[SITE:([^\]]+)\]', invoice.notes or '')
            if m_site:
                try:
                    from operations.models import OperationalSite
                    primary_site = OperationalSite.objects.filter(id=m_site.group(1), company=company).first()
                except Exception:
                    primary_site = None

        # Lookup CRM ProposalVersion details for Service Charges & Sales Tax breakdown
        sc_per_guard = Decimal('0.00')
        total_service_charges = Decimal('0.00')
        sales_tax_basis = 'MANUAL'
        nominal_tax_rate = Decimal('0.00')
        try:
            from security_crm.models import ProposalServiceLine, SecurityProposal
            prop_ver = None
            if client and primary_site:
                psl = (
                    ProposalServiceLine.objects.filter(
                        company=company, is_deleted=False,
                        location__customer=client, location__name__iexact=primary_site.name
                    )
                    .select_related('proposal_version')
                    .order_by('-proposal_version__version_number')
                    .first()
                )
                if psl:
                    prop_ver = psl.proposal_version
            if not prop_ver and client:
                prop = (
                    SecurityProposal.objects.filter(company=company, customer=client, is_deleted=False)
                    .exclude(status__in=['REJECTED', 'CANCELLED'])
                    .select_related('approved_version')
                    .order_by('-created_at')
                    .first()
                )
                if prop:
                    prop_ver = prop.approved_version or prop.versions.filter(is_deleted=False).order_by('-version_number').first()
            if prop_ver:
                sales_tax_basis = str(getattr(prop_ver, 'sales_tax_basis', 'MANUAL') or 'MANUAL').upper()
                nominal_tax_rate = Decimal(str(getattr(prop_ver, 'tax_rate', 0) or 0))
                sc_per_guard = Decimal(str(getattr(prop_ver, 'service_charges_per_guard', 0) or 0))
        except Exception:
            pass

        subtotal_dec = Decimal(str(invoice.subtotal or 0)).quantize(Decimal('0.01'))
        tax_amt_dec = Decimal(str(invoice.tax_amount or 0)).quantize(Decimal('0.01'))
        grand_total_dec = Decimal(str(invoice.grand_total or 0)).quantize(Decimal('0.01'))

        # Effective tax rate resolution
        if sheet and hasattr(sheet, 'tax_rate') and Decimal(str(sheet.tax_rate or 0)) > 0:
            effective_tax_rate = Decimal(str(sheet.tax_rate))
        elif lines and any(Decimal(str(ln.tax_rate or 0)) > 0 for ln in lines):
            effective_tax_rate = next(Decimal(str(ln.tax_rate)) for ln in lines if Decimal(str(ln.tax_rate or 0)) > 0)
        elif nominal_tax_rate > 0 and tax_amt_dec > 0:
            effective_tax_rate = nominal_tax_rate
        elif subtotal_dec > 0 and tax_amt_dec > 0:
            effective_tax_rate = ((tax_amt_dec / subtotal_dec) * Decimal('100.00')).quantize(Decimal('0.01'))
        else:
            effective_tax_rate = Decimal('0.00')

        # Split Service Charges cleanly for Cheque Sales Tax Invoice display only when valid & <= subtotal
        if calculation_mode == 'CONTRACT_RATE' and sc_per_guard > 0 and total_guard_qty > 0 and sales_tax_basis == 'SERVICE_CHARGES':
            candidate_sc = (sc_per_guard * total_guard_qty).quantize(Decimal('0.01'))
            if candidate_sc <= subtotal_dec:
                total_service_charges = candidate_sc
        elif tax_amt_dec > 0 and nominal_tax_rate > 0 and sales_tax_basis == 'SERVICE_CHARGES':
            # Reverse calculate taxable service charge base if attendance-prorated
            candidate_sc = (tax_amt_dec / (nominal_tax_rate / Decimal('100.00'))).quantize(Decimal('0.01'))
            if candidate_sc <= subtotal_dec:
                total_service_charges = candidate_sc

        guards_subtotal = (subtotal_dec - total_service_charges).quantize(Decimal('0.01'))

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

        bank_details = {
            'bank_name': branding['bank_name'],
            'account_title': branding['bank_account_title'],
            'account_number': branding['bank_account_number'],
            'iban': branding['bank_iban'],
            'branch_code': getattr(sec_cfg, 'branch_code', '') if sec_cfg else '',
        }

        contract_code = ''
        if contract:
            contract_code = getattr(contract, 'contract_code', '') or getattr(contract, 'contract_number', '') or ''

        invoice_payload = {
            'id': str(invoice.id),
            'invoice_number': invoice.invoice_number,
            'invoice_date': invoice.invoice_date.isoformat() if invoice.invoice_date else '',
            'due_date': invoice.due_date.isoformat() if invoice.due_date else '',
            'billing_month': invoice.billing_month or '',
            'period_start': invoice.period_start.isoformat() if invoice.period_start else '',
            'period_end': invoice.period_end.isoformat() if invoice.period_end else '',
            'currency': invoice.currency.code if invoice.currency else 'PKR',
            'payment_terms': invoice.payment_terms or '',
            'status': invoice.status,
            'status_display': invoice.get_status_display(),
            'notes': clean_notes,
            'raw_notes': invoice.notes or '',
            'terms_and_conditions': invoice.terms_and_conditions or '',
            'subtotal': float(subtotal_dec),
            'tax_rate': float(effective_tax_rate),
            'tax_amount': float(tax_amt_dec),
            'grand_total': float(grand_total_dec),
            'paid_amount': float(invoice.paid_amount or 0),
            'balance_due': float(grand_total_dec - Decimal(str(invoice.paid_amount or 0))),
            'template_mode': template_mode,
            'calculation_mode': calculation_mode,
        }

        client_payload = {
            'id': str(client.id) if client else None,
            'name': client.name if client else (getattr(contract, 'client_name', '') or 'Unknown Client'),
            'trade_name': getattr(client, 'display_name', '') if client else '',
            'ntn': (getattr(client, 'tax_number', '') or getattr(client, 'registration_number', '') or '') if client else '',
            'strn': getattr(client, 'registration_number', '') if client else '',
            'billing_address': client_address or (primary_site.name if primary_site else ''),
            'contact_person': client_contact_person,
            'contact_email': client_email,
            'contact_phone': client_phone,
        }

        company_payload = {
            'id': branding['company_id'],
            'name': branding['company_name'],
            'logo_url': branding['logo_url'],
            'ntn': branding['ntn'],
            'strn': branding['strn'],
            'address': branding['address'],
            'email': branding['email'],
            'phone': branding['phone'],
            'website': branding['website'],
        }

        return {
            'invoice_id': str(invoice.id),
            'invoice_number': invoice.invoice_number,
            'invoice_date': invoice_payload['invoice_date'],
            'due_date': invoice_payload['due_date'],
            'billing_month': invoice_payload['billing_month'],
            'period_start': invoice_payload['period_start'],
            'period_end': invoice_payload['period_end'],
            'currency': invoice_payload['currency'],
            'payment_terms': invoice_payload['payment_terms'],
            'status': invoice.status,
            'status_display': invoice_payload['status_display'],
            'notes': clean_notes,
            'terms_and_conditions': invoice_payload['terms_and_conditions'],
            'subtotal': invoice_payload['subtotal'],
            'tax_rate': invoice_payload['tax_rate'],
            'tax_amount': invoice_payload['tax_amount'],
            'grand_total': invoice_payload['grand_total'],
            'paid_amount': invoice_payload['paid_amount'],
            'balance_due': invoice_payload['balance_due'],
            'template_mode': template_mode,
            'calculation_mode': calculation_mode,
            'amount_in_words': amount_to_words_pkr(grand_total_dec),
            'service_charges': {
                'has_breakdown': total_service_charges > Decimal('0.00'),
                'per_guard': float(sc_per_guard),
                'quantity': float(total_guard_qty),
                'amount': float(total_service_charges),
                'guards_subtotal': float(guards_subtotal),
                'sales_tax_basis': sales_tax_basis,
                'sales_tax_rate': float(effective_tax_rate),
                'sales_tax_amount': float(tax_amt_dec),
            },
            'invoice': invoice_payload,
            'lines': flat_lines,
            'company': company_payload,
            'client': client_payload,
            'contract': {
                'id': str(contract.id) if contract else None,
                'contract_number': contract_code,
                'title': getattr(contract, 'title', contract_code) if contract else '',
                'client_name': client_payload['name'],
            } if contract else None,
            'billing_sheet': {
                'id': str(sheet.id) if sheet else None,
                'sheet_number': sheet.sheet_number if sheet else '',
            } if sheet else None,
            'sites_breakdown': site_groups,
            'bank_details': bank_details,
            'templates': {
                'cash': templates_bundle['cash'],
                'cheque': templates_bundle['cheque'],
                'company_defaults': branding,
            },
        }

    @classmethod
    def generate_invoice_html(cls, invoice: ClientInvoice) -> str:
        """
        Generates multi-tenant branded HTML invoice body matching the tenant's
        editable CASH ('INVOICE') or CHEQUE ('SALES TAX INVOICE') template.
        """
        context = cls.render_invoice_context(invoice)
        mode = context.get('template_mode', 'CASH')
        tpl = context['templates']['cheque'] if mode == 'CHEQUE' else context['templates']['cash']
        comp = context['company']
        client = context['client']
        sc = context['service_charges']
        curr = tpl.get('currency_label') or context['currency'] or 'PKR'

        esc = html_escape.escape
        logo_src = tpl.get('custom_logo_url') or comp.get('logo_url') or ''

        # Format date dd-mm-yyyy and month label like "September - 2026"
        inv_date_str = context['invoice_date']
        inv_month_str = context['billing_month']
        period_str = f"{context['period_start']} to {context['period_end']}" if context['period_start'] else ''

        header_html = ""
        if tpl.get('show_header'):
            logo_block = (
                f'<img src="{esc(logo_src)}" alt="Logo" style="max-height: 76px; max-width: 140px; object-fit: contain;" />'
                if (tpl.get('show_logo') and logo_src)
                else f'<div style="font-size: 16px; font-weight: 800; color: #0f172a;">{esc(tpl.get("company_name") or comp["name"])}</div>'
            )
            header_html = f"""
            <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #7f1d1d; padding-bottom: 10px; margin-bottom: 14px;">
                <div>{logo_block}</div>
                <div style="text-align: right; max-width: 65%;">
                    <div style="font-size: 20px; font-weight: 800; color: #0f172a; letter-spacing: 0.3px;">{esc(tpl.get('company_name') or comp['name'])}</div>
                    <div style="font-size: 12px; color: #334155; margin-top: 2px;">{esc(tpl.get('address') or comp.get('address', ''))}</div>
                    <div style="font-size: 12px; color: #334155;">{esc(tpl.get('phone') or comp.get('phone', ''))}</div>
                    <div style="font-size: 12px; color: #1e293b;">
                        {esc(tpl.get('website') or comp.get('website', ''))}
                        {(" &nbsp;|&nbsp; " + esc(tpl.get('email') or comp.get('email', ''))) if (tpl.get('email') or comp.get('email')) else ""}
                    </div>
                </div>
            </div>
            """

        rows_html = ""
        display_lines = context.get('lines') or []
        if not display_lines:
            rows_html = f"""
            <tr>
                <td style="border: 1px solid #0f172a; padding: 8px; text-align: center;">1</td>
                <td style="border: 1px solid #0f172a; padding: 8px;">Security Services</td>
                <td style="border: 1px solid #0f172a; padding: 8px; text-align: center;">1</td>
                <td style="border: 1px solid #0f172a; padding: 8px; text-align: right;">{context['subtotal']:,.0f}</td>
                <td style="border: 1px solid #0f172a; padding: 8px; text-align: right;">{context['subtotal']:,.0f}</td>
            </tr>
            """
        elif mode == 'CHEQUE' and sc.get('has_breakdown'):
            guards_amt = sc['guards_subtotal']
            total_qty = sc['quantity'] or 1
            unit_guard = (guards_amt / total_qty) if total_qty > 0 else guards_amt
            desc_base = display_lines[0]['description'] if len(display_lines) == 1 else f"Security Staff ({client['name']})"
            rows_html = f"""
            <tr>
                <td style="border: 1px solid #0f172a; padding: 6px 8px; text-align: center;">1</td>
                <td style="border: 1px solid #0f172a; padding: 6px 8px;">{esc(desc_base)}</td>
                <td style="border: 1px solid #0f172a; padding: 6px 8px; text-align: center;">{total_qty:g}</td>
                <td style="border: 1px solid #0f172a; padding: 6px 8px; text-align: right;">{unit_guard:,.0f}</td>
                <td style="border: 1px solid #0f172a; padding: 6px 8px; text-align: right;">{guards_amt:,.0f}</td>
            </tr>
            <tr>
                <td style="border: 1px solid #0f172a; padding: 6px 8px;"></td>
                <td style="border: 1px solid #0f172a; padding: 6px 8px; text-align: center; font-weight: 700;">Total</td>
                <td style="border: 1px solid #0f172a; padding: 6px 8px;"></td>
                <td style="border: 1px solid #0f172a; padding: 6px 8px;"></td>
                <td style="border: 1px solid #0f172a; padding: 6px 8px; text-align: right; font-weight: 700;">{guards_amt:,.0f}</td>
            </tr>
            """
        else:
            for idx, ln in enumerate(display_lines, 1):
                rows_html += f"""
                <tr>
                    <td style="border: 1px solid #0f172a; padding: 6px 8px; text-align: center;">{idx}</td>
                    <td style="border: 1px solid #0f172a; padding: 6px 8px;">{esc(ln['description'])}</td>
                    <td style="border: 1px solid #0f172a; padding: 6px 8px; text-align: center;">{ln['quantity']:g}</td>
                    <td style="border: 1px solid #0f172a; padding: 6px 8px; text-align: right;">{ln['unit_rate']:,.0f}</td>
                    <td style="border: 1px solid #0f172a; padding: 6px 8px; text-align: right;">{ln['line_subtotal']:,.0f}</td>
                </tr>
                """

        extra_rows_html = ""
        if mode == 'CHEQUE':
            next_sno = (2 if sc.get('has_breakdown') else len(display_lines) + 1)
            if tpl.get('show_service_charges_row') and sc.get('has_breakdown'):
                extra_rows_html += f"""
                <tr>
                    <td style="border: 1px solid #0f172a; padding: 6px 8px; text-align: center;">{next_sno}</td>
                    <td style="border: 1px solid #0f172a; padding: 6px 8px;">{esc(tpl.get('service_charges_label', 'Service Charges'))}</td>
                    <td style="border: 1px solid #0f172a; padding: 6px 8px; text-align: center;">{sc['quantity']:g}</td>
                    <td style="border: 1px solid #0f172a; padding: 6px 8px; text-align: right;">{sc['per_guard']:,.0f}</td>
                    <td style="border: 1px solid #0f172a; padding: 6px 8px; text-align: right;">{sc['amount']:,.0f}</td>
                </tr>
                """
                next_sno += 1
            if context['tax_amount'] > 0 or context['tax_rate'] > 0:
                extra_rows_html += f"""
                <tr>
                    <td style="border: 1px solid #0f172a; padding: 6px 8px; text-align: center;">{next_sno}</td>
                    <td style="border: 1px solid #0f172a; padding: 6px 8px;">{esc(tpl.get('sales_tax_label', 'Add: Sales Tax'))} {context['tax_rate']:g}%</td>
                    <td style="border: 1px solid #0f172a; padding: 6px 8px;"></td>
                    <td style="border: 1px solid #0f172a; padding: 6px 8px; text-align: right;">{context['tax_rate']:g}%</td>
                    <td style="border: 1px solid #0f172a; padding: 6px 8px; text-align: right;">{context['tax_amount']:,.0f}</td>
                </tr>
                """

        bank_html = ""
        if tpl.get('show_bank_details'):
            b_title = tpl.get('bank_account_title') or context['bank_details'].get('account_title', '')
            b_no = tpl.get('bank_account_number') or context['bank_details'].get('account_number', '')
            b_name = tpl.get('bank_name') or context['bank_details'].get('bank_name', '')
            b_iban = tpl.get('bank_iban') or context['bank_details'].get('iban', '')
            bank_html = f"""
            <div style="margin-top: 18px; width: 420px; font-size: 13px;">
                <div style="font-weight: 700; text-decoration: underline; margin-bottom: 6px;">{esc(tpl.get('bank_section_title', 'Bank Detail'))}</div>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr><td style="border-top: 1px solid #0f172a; border-bottom: 1px solid #0f172a; padding: 3px 6px; font-weight: 700; width: 130px;">Bank A/C Title</td><td style="border-top: 1px solid #0f172a; border-bottom: 1px solid #0f172a; padding: 3px 6px;">: &nbsp;{esc(b_title)}</td></tr>
                    <tr><td style="border-bottom: 1px solid #0f172a; padding: 3px 6px; font-weight: 700;">Bank A/C No</td><td style="border-bottom: 1px solid #0f172a; padding: 3px 6px;">: &nbsp;{esc(b_no)}</td></tr>
                    <tr><td style="border-bottom: 1px solid #0f172a; padding: 3px 6px; font-weight: 700;">Bank Name</td><td style="border-bottom: 1px solid #0f172a; padding: 3px 6px;">: &nbsp;{esc(b_name)}</td></tr>
                    <tr><td style="border-bottom: 1px solid #0f172a; padding: 3px 6px; font-weight: 700;">IBAN No</td><td style="border-bottom: 1px solid #0f172a; padding: 3px 6px;">: &nbsp;{esc(b_iban)}</td></tr>
                </table>
            </div>
            """

        title_style = (
            "font-size: 20px; font-weight: 800; font-style: italic; text-decoration: underline; text-align: center; margin: 8px 0 14px 0;"
            if mode == 'CHEQUE'
            else "font-size: 26px; font-weight: 800; text-decoration: underline; text-align: center; border: 2px solid #0f172a; padding: 10px; margin-bottom: 16px;"
        )

        ntn_box = ""
        if tpl.get('show_tax_numbers'):
            ntn_box = f"""
            <td style="vertical-align: top; text-align: right; font-size: 13px;">
                <div><strong>NTN No:</strong> &nbsp;{esc(tpl.get('ntn') or comp.get('ntn', ''))}</div>
                <div><strong>S. Tax No:</strong> &nbsp;{esc(tpl.get('strn') or comp.get('strn', ''))}</div>
            </td>
            """

        contract_row = (
            f'<tr><td style="padding: 2px 6px; font-weight: 600;">{esc(tpl.get("contract_label", "Contract ID No"))}</td><td>: &nbsp;<strong>{esc(context["contract"]["contract_number"]) if context.get("contract") else "N/A"}</strong></td></tr>'
            if tpl.get('show_contract_id') else ''
        )
        cust_ntn_row = (
            f'<tr><td style="padding: 2px 6px; font-weight: 600;">{esc(tpl.get("customer_ntn_label", "Customer NTN #"))}</td><td>: &nbsp;<strong>{esc(client.get("ntn", ""))}</strong></td></tr>'
            if tpl.get('show_customer_ntn') else ''
        )

        return f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8"/>
            <title>{esc(tpl.get('title', 'INVOICE'))} {esc(invoice.invoice_number)}</title>
        </head>
        <body style="font-family: Georgia, 'Times New Roman', serif; background: #ffffff; color: #0f172a; margin: 0; padding: 24px;">
            <div style="max-width: 780px; margin: 0 auto;">
                {header_html}
                <div style="{title_style}">{esc(tpl.get('title', 'INVOICE'))}</div>

                <table style="width: 100%; margin-bottom: 16px; font-size: 13px;">
                    <tr>
                        <td style="vertical-align: top;">
                            <table style="border-collapse: collapse;">
                                <tr><td style="padding: 2px 6px; font-weight: 600;">{esc(tpl.get('date_label', 'Date'))}</td><td>: &nbsp;<strong>{esc(inv_date_str)}</strong></td></tr>
                                <tr><td style="padding: 2px 6px; font-weight: 600;">{esc(tpl.get('invoice_no_label', 'Invoice #'))}</td><td>: &nbsp;<strong>{esc(invoice.invoice_number)}</strong></td></tr>
                                {contract_row}
                                <tr><td style="padding: 2px 6px; font-weight: 600;">{esc(tpl.get('customer_label', 'Customer Name'))}</td><td>: &nbsp;<strong>{esc(client['name'])}</strong></td></tr>
                                {cust_ntn_row}
                                <tr><td style="padding: 2px 6px; font-weight: 600;">{esc(tpl.get('month_label', 'Invoice Month'))}</td><td>: &nbsp;<strong>{esc(inv_month_str)}</strong></td></tr>
                                <tr><td style="padding: 2px 6px; font-weight: 600;">{esc(tpl.get('period_label', 'Invoice Period'))}</td><td>: &nbsp;<strong>{esc(period_str)}</strong></td></tr>
                            </table>
                        </td>
                        {ntn_box}
                    </tr>
                </table>

                <table style="width: 100%; border-collapse: collapse; border: 2px solid #0f172a; font-size: 13px;">
                    <thead>
                        <tr>
                            <th style="border: 1px solid #0f172a; padding: 6px 8px; width: 48px;">{esc(tpl.get('col_sno_label', 'S/No'))}</th>
                            <th style="border: 1px solid #0f172a; padding: 6px 8px;">{esc(tpl.get('col_description_label', 'Detail of Security Staff Provided'))}</th>
                            <th style="border: 1px solid #0f172a; padding: 6px 8px; width: 64px;">{esc(tpl.get('col_qty_label', 'Qty'))}</th>
                            <th style="border: 1px solid #0f172a; padding: 6px 8px; width: 110px;">{esc(tpl.get('col_rate_label', 'Rate'))}<br/><span style="font-size: 11px; font-weight: 400;">Per Head</span></th>
                            <th style="border: 1px solid #0f172a; padding: 6px 8px; width: 120px;">{esc(tpl.get('col_amount_label', 'Amount'))}<br/><span style="font-size: 11px; font-weight: 400;">{esc(tpl.get('col_amount_sublabel', 'PKR Rupees'))}</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows_html}
                        {extra_rows_html}
                        <tr>
                            <td colspan="4" style="border-top: 2px solid #0f172a; padding: 6px 8px; font-weight: 800;">TOTAL:</td>
                            <td style="border-top: 2px solid #0f172a; border-left: 1px solid #0f172a; padding: 6px 8px; font-weight: 800;">{esc(curr)}</td>
                        </tr>
                        <tr>
                            <td colspan="4" style="border-bottom: 2px solid #0f172a; padding: 4px 8px 8px 8px; font-weight: 700;">(Rupees: {esc(context['amount_in_words'])})</td>
                            <td style="border-bottom: 2px solid #0f172a; border-left: 1px solid #0f172a; padding: 4px 8px 8px 8px; text-align: right; font-weight: 800; font-size: 15px;">{context['grand_total']:,.0f}</td>
                        </tr>
                    </tbody>
                </table>

                <div style="display: flex; justify-content: space-between; margin-top: 64px; font-weight: 700; font-size: 13px;">
                    <div style="border-top: 1px solid #0f172a; width: 180px; padding-top: 4px;">{esc(tpl.get('left_signature_label', 'ACCOUNTS OFFICER'))}</div>
                    <div style="border-top: 1px solid #0f172a; width: 140px; text-align: center; padding-top: 4px;">{esc(tpl.get('right_signature_label', 'G.M'))}</div>
                </div>

                {('<hr style="border: none; border-top: 2px dashed #0f172a; margin: 16px 0;" />' if mode == 'CHEQUE' else '<div style="margin-top: 18px;"></div>')}
                <div style="font-weight: 700; font-size: 13px;">{esc(tpl.get('footer_note', 'Note: Please make the payment by 5th of each month.'))}</div>

                {bank_html}
            </div>
        </body>
        </html>
        """

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
