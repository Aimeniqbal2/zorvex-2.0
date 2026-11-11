"""
Multi-tenant Invoice Template & PKR Amount-in-Words service.

Stores per-company editable CASH ("INVOICE") and CHEQUE ("SALES TAX INVOICE")
template configurations in platform_core.CompanyModule.configuration so every
tenant company manages its own branding, headers, columns, notes, signatures,
and bank remittance details without any hardcoded tenant identity.
"""
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict


_ONES = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
]
_TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
_SCALES = ['', 'Thousand', 'Million', 'Billion', 'Trillion']


def _under_thousand(n: int) -> str:
    parts = []
    hundreds, rem = divmod(n, 100)
    if hundreds:
        parts.append(f"{_ONES[hundreds]} Hundred")
        if rem:
            parts.append("and")
    if rem:
        if rem < 20:
            parts.append(_ONES[rem])
        else:
            t, o = divmod(rem, 10)
            if o:
                parts.append(f"{_TENS[t]} {_ONES[o]}")
            else:
                parts.append(_TENS[t])
    return " ".join(parts)


def amount_to_words_pkr(amount: Any) -> str:
    """
    Converts a numeric amount into clean English currency words ending with 'Only.'.
    """
    try:
        dec = Decimal(str(amount or 0)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    except Exception:
        return "Zero Only."

    if dec < 0:
        dec = abs(dec)

    whole = int(dec)
    paisa = int((dec - Decimal(whole)) * 100)

    if whole == 0 and paisa == 0:
        return "Zero Only."

    if whole == 0:
        words = "Zero"
    else:
        chunks = []
        scale_idx = 0
        rem = whole
        while rem > 0 and scale_idx < len(_SCALES):
            rem, chunk = divmod(rem, 1000)
            if chunk:
                chunk_words = _under_thousand(chunk)
                scale_label = _SCALES[scale_idx]
                chunks.append(f"{chunk_words} {scale_label}".strip())
            scale_idx += 1
        words = " ".join(reversed(chunks))

    if paisa > 0:
        paisa_words = _under_thousand(paisa)
        return f"{words} and {paisa_words} Paisa Only."
    return f"{words} Only."


TEMPLATE_FIELDS_BOOL = {
    'show_header',
    'show_logo',
    'show_tax_numbers',
    'show_contract_id',
    'show_customer_ntn',
    'show_service_charges_row',
    'show_bank_details',
}

TEMPLATE_FIELDS_STR = {
    'title',
    'company_name',
    'address',
    'phone',
    'website',
    'email',
    'custom_logo_url',
    'ntn',
    'strn',
    'date_label',
    'invoice_no_label',
    'contract_label',
    'customer_label',
    'customer_ntn_label',
    'month_label',
    'period_label',
    'col_sno_label',
    'col_description_label',
    'col_qty_label',
    'col_rate_label',
    'col_amount_label',
    'col_amount_sublabel',
    'service_charges_label',
    'sales_tax_label',
    'currency_label',
    'footer_note',
    'left_signature_label',
    'right_signature_label',
    'bank_section_title',
    'bank_account_title',
    'bank_account_number',
    'bank_name',
    'bank_iban',
}


def get_company_branding_defaults(company) -> Dict[str, Any]:
    """
    Dynamically builds branding & bank remittance defaults for the active tenant company.
    Never hardcodes another tenant's identity.
    """
    from finance.models import SecurityFinanceConfiguration, BankAccount

    sec_cfg = SecurityFinanceConfiguration.objects.filter(
        company=company, is_deleted=False
    ).order_by('-is_active', '-created_at').first()

    active_bank = (
        BankAccount.objects.filter(company=company, is_active=True, is_deleted=False, account_type='BANK').first()
        or BankAccount.objects.filter(company=company, is_active=True, is_deleted=False).first()
    )

    sender_email = ''
    try:
        from communications.models import SenderIdentity
        sender = SenderIdentity.objects.filter(company=company, is_active=True).first()
        if sender:
            sender_email = getattr(sender, 'from_email', '') or getattr(sender, 'email', '') or ''
    except Exception:
        sender_email = ''

    logo_url = ''
    try:
        if getattr(company, 'logo', None) and getattr(company.logo, 'name', ''):
            logo_url = company.logo.url
    except Exception:
        logo_url = ''

    domain = (getattr(company, 'domain', '') or '').strip()
    website = f"www.{domain}" if (domain and '.' in domain and not domain.startswith('http')) else domain

    ntn = (
        getattr(company, 'tax_id', '')
        or getattr(company, 'tax_number', '')
        or getattr(company, 'ntn', '')
        or ''
    )
    strn = (
        getattr(company, 'strn', '')
        or (getattr(sec_cfg, 'pra_sales_tax_registration', '') if sec_cfg else '')
        or ''
    )

    bank_name = (getattr(sec_cfg, 'bank_name', '') if sec_cfg else '') or (active_bank.bank_name if active_bank else '') or ''
    bank_title = (getattr(sec_cfg, 'account_title', '') if sec_cfg else '') or (active_bank.account_title if active_bank else '') or (company.name if company else '')
    bank_no = (getattr(sec_cfg, 'account_number', '') if sec_cfg else '') or (active_bank.account_number if active_bank else '') or ''
    bank_iban = (getattr(sec_cfg, 'iban', '') if sec_cfg else '') or (active_bank.iban if active_bank else '') or ''

    return {
        'company_id': str(company.id) if company else '',
        'company_name': company.name if company else '',
        'logo_url': logo_url,
        'address': getattr(company, 'address', '') or '',
        'phone': getattr(company, 'phone', '') or '',
        'email': getattr(company, 'email', '') or sender_email or '',
        'website': website,
        'ntn': ntn,
        'strn': strn,
        'bank_name': bank_name,
        'bank_account_title': bank_title,
        'bank_account_number': bank_no,
        'bank_iban': bank_iban,
    }


def _default_cash_template(defaults: Dict[str, Any]) -> Dict[str, Any]:
    return {
        'title': 'INVOICE',
        'show_header': False,
        'show_logo': False,
        'company_name': defaults['company_name'],
        'address': defaults['address'],
        'phone': defaults['phone'],
        'website': defaults['website'],
        'email': defaults['email'],
        'custom_logo_url': '',
        'show_tax_numbers': False,
        'ntn': defaults['ntn'],
        'strn': defaults['strn'],
        'date_label': 'Date',
        'invoice_no_label': 'Invoice #',
        'show_contract_id': False,
        'contract_label': 'Contract ID No',
        'customer_label': 'Customer Name',
        'show_customer_ntn': False,
        'customer_ntn_label': 'Customer NTN #',
        'month_label': 'Invoice Month',
        'period_label': 'Invoice Period',
        'col_sno_label': 'S/No',
        'col_description_label': 'Detail of Security Staff Provided',
        'col_qty_label': 'Qty',
        'col_rate_label': 'Rate Per Head',
        'col_amount_label': 'Amount',
        'col_amount_sublabel': 'PKR Rupees',
        'show_service_charges_row': False,
        'service_charges_label': 'Service Charges',
        'sales_tax_label': 'Add: Sales Tax on Service',
        'currency_label': 'PKR',
        'footer_note': 'Note: Please make the payment by 5th of each month.',
        'left_signature_label': 'ACCOUNTS OFFICER',
        'right_signature_label': 'G.M',
        'show_bank_details': False,
        'bank_section_title': 'Bank Detail',
        'bank_account_title': defaults['bank_account_title'],
        'bank_account_number': defaults['bank_account_number'],
        'bank_name': defaults['bank_name'],
        'bank_iban': defaults['bank_iban'],
    }


def _default_cheque_template(defaults: Dict[str, Any]) -> Dict[str, Any]:
    return {
        'title': 'SALES TAX INVOICE',
        'show_header': True,
        'show_logo': True,
        'company_name': defaults['company_name'],
        'address': defaults['address'],
        'phone': defaults['phone'],
        'website': defaults['website'],
        'email': defaults['email'],
        'custom_logo_url': '',
        'show_tax_numbers': True,
        'ntn': defaults['ntn'],
        'strn': defaults['strn'],
        'date_label': 'S. Tax Invoice Date',
        'invoice_no_label': 'S. Tax Invoice #',
        'show_contract_id': True,
        'contract_label': 'Contract ID No',
        'customer_label': 'Customer Name',
        'show_customer_ntn': True,
        'customer_ntn_label': 'Customer NTN #',
        'month_label': 'Invoice Month',
        'period_label': 'Invoice Period',
        'col_sno_label': 'S/No',
        'col_description_label': 'Detail of Security Staff Provided',
        'col_qty_label': 'Qty',
        'col_rate_label': 'Rate Per Head',
        'col_amount_label': 'Amount',
        'col_amount_sublabel': 'PKR Rupees',
        'show_service_charges_row': True,
        'service_charges_label': 'Service Charges',
        'sales_tax_label': 'Add: Sales Tax on Service',
        'currency_label': 'PKR',
        'footer_note': 'Note: Please make the payment by 5th of each month.',
        'left_signature_label': 'ACCOUNTS OFFICER',
        'right_signature_label': 'G.M',
        'show_bank_details': True,
        'bank_section_title': 'Bank Detail',
        'bank_account_title': defaults['bank_account_title'],
        'bank_account_number': defaults['bank_account_number'],
        'bank_name': defaults['bank_name'],
        'bank_iban': defaults['bank_iban'],
    }


def _merge_template(base: Dict[str, Any], saved: Any) -> Dict[str, Any]:
    if not isinstance(saved, dict):
        return dict(base)
    merged = dict(base)
    for k in TEMPLATE_FIELDS_BOOL:
        if k in saved and isinstance(saved[k], bool):
            merged[k] = saved[k]
    for k in TEMPLATE_FIELDS_STR:
        if k in saved and saved[k] is not None:
            val = str(saved[k])
            # For key identity/bank fields, keep dynamic company default if saved value was left empty
            if val == '' and k in {'company_name', 'bank_account_title'} and base.get(k):
                continue
            merged[k] = val
    return merged


def _find_company_module(company, create_if_missing: bool = False):
    from platform_core.models import CompanyModule, ModuleDefinition

    for code in ('billing', 'security_finance', 'finance'):
        cm = CompanyModule.objects.filter(
            company=company, module__code=code
        ).select_related('module').first()
        if cm:
            cfg = cm.configuration if isinstance(cm.configuration, dict) else {}
            if 'invoice_templates' in cfg or code == 'billing':
                return cm

    any_cm = CompanyModule.objects.filter(company=company).select_related('module').order_by('created_at').first()
    if any_cm and isinstance(any_cm.configuration, dict) and 'invoice_templates' in any_cm.configuration:
        return any_cm

    if not create_if_missing:
        return any_cm

    mod_def, _ = ModuleDefinition.objects.get_or_create(
        code='billing',
        defaults={
            'name': 'Billing & Invoicing',
            'description': 'Client invoicing and customizable tenant invoice templates.',
            'category': 'finance',
            'is_active': True,
        }
    )
    cm, _ = CompanyModule.objects.get_or_create(
        company=company,
        module=mod_def,
        defaults={'enabled': True, 'configuration': {}}
    )
    return cm


def get_invoice_templates(company) -> Dict[str, Any]:
    """
    Returns { cash, cheque, company_defaults } for the given tenant company.
    """
    defaults = get_company_branding_defaults(company)
    cash_base = _default_cash_template(defaults)
    cheque_base = _default_cheque_template(defaults)

    cm = _find_company_module(company, create_if_missing=False)
    stored = {}
    if cm and isinstance(cm.configuration, dict):
        stored = cm.configuration.get('invoice_templates') or {}

    return {
        'cash': _merge_template(cash_base, stored.get('cash')),
        'cheque': _merge_template(cheque_base, stored.get('cheque')),
        'company_defaults': defaults,
    }


def save_invoice_templates(company, payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Saves edited CASH and/or CHEQUE templates into the tenant's CompanyModule.configuration.
    """
    defaults = get_company_branding_defaults(company)
    cm = _find_company_module(company, create_if_missing=True)

    cfg = dict(cm.configuration) if isinstance(cm.configuration, dict) else {}
    existing = dict(cfg.get('invoice_templates') or {})

    if isinstance(payload.get('cash'), dict):
        existing['cash'] = _merge_template(_default_cash_template(defaults), payload['cash'])
    elif 'cash' not in existing:
        existing['cash'] = _default_cash_template(defaults)

    if isinstance(payload.get('cheque'), dict):
        existing['cheque'] = _merge_template(_default_cheque_template(defaults), payload['cheque'])
    elif 'cheque' not in existing:
        existing['cheque'] = _default_cheque_template(defaults)

    cfg['invoice_templates'] = existing
    cm.configuration = cfg
    cm.save(update_fields=['configuration', 'updated_at'])

    return get_invoice_templates(company)
