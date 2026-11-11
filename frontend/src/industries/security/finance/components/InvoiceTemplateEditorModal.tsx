import React, { useState, useEffect } from 'react';
import type {
  InvoiceTemplateConfig,
  InvoiceTemplatesBundle,
  InvoicePreviewContext,
} from '../api';
import { fetchInvoiceTemplates, saveInvoiceTemplates } from '../api';
import { InvoiceDocumentSheet } from './InvoiceDocumentSheet';

interface InvoiceTemplateEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (bundle: InvoiceTemplatesBundle) => void;
}

export const InvoiceTemplateEditorModal: React.FC<InvoiceTemplateEditorModalProps> = ({
  isOpen,
  onClose,
  onSaved,
}) => {
  const [activeType, setActiveType] = useState<'CASH' | 'CHEQUE'>('CHEQUE');
  const [bundle, setBundle] = useState<InvoiceTemplatesBundle | null>(null);
  const [cashForm, setCashForm] = useState<InvoiceTemplateConfig | null>(null);
  const [chequeForm, setChequeForm] = useState<InvoiceTemplateConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setErrorMsg(null);
      setSuccessMsg(null);
      try {
        const res = await fetchInvoiceTemplates();
        if (!mounted) return;
        setBundle(res);
        setCashForm({ ...res.cash });
        setChequeForm({ ...res.cheque });
      } catch (err: any) {
        if (mounted) {
          setErrorMsg(err?.response?.data?.error || err.message || 'Failed to load company invoice templates.');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const currentForm = activeType === 'CHEQUE' ? chequeForm : cashForm;
  const updateField = <K extends keyof InvoiceTemplateConfig>(key: K, value: InvoiceTemplateConfig[K]) => {
    if (activeType === 'CHEQUE') {
      setChequeForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    } else {
      setCashForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      alert('Please select a logo image smaller than 1 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        updateField('custom_logo_url', reader.result);
        updateField('show_logo', true);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleResetToDefaults = () => {
    if (!bundle?.company_defaults) return;
    const d = bundle.company_defaults;
    if (activeType === 'CASH' && cashForm) {
      setCashForm({
        ...cashForm,
        title: 'INVOICE',
        show_header: false,
        show_logo: false,
        company_name: d.company_name,
        address: d.address,
        phone: d.phone,
        website: d.website,
        email: d.email,
        custom_logo_url: '',
        show_tax_numbers: false,
        ntn: d.ntn,
        strn: d.strn,
        date_label: 'Date',
        invoice_no_label: 'Invoice #',
        show_contract_id: false,
        customer_label: 'Customer Name',
        show_customer_ntn: false,
        month_label: 'Invoice Month',
        period_label: 'Invoice Period',
        col_sno_label: 'S/No',
        col_description_label: 'Detail of Security Staff Provided',
        col_qty_label: 'Qty',
        col_rate_label: 'Rate Per Head',
        col_amount_label: 'Amount',
        col_amount_sublabel: 'PKR Rupees',
        show_service_charges_row: false,
        currency_label: 'PKR',
        footer_note: 'Note: Please make the payment by 5th of each month.',
        left_signature_label: 'ACCOUNTS OFFICER',
        right_signature_label: 'G.M',
        show_bank_details: false,
        bank_section_title: 'Bank Detail',
        bank_account_title: d.bank_account_title,
        bank_account_number: d.bank_account_number,
        bank_name: d.bank_name,
        bank_iban: d.bank_iban,
      });
    } else if (activeType === 'CHEQUE' && chequeForm) {
      setChequeForm({
        ...chequeForm,
        title: 'SALES TAX INVOICE',
        show_header: true,
        show_logo: true,
        company_name: d.company_name,
        address: d.address,
        phone: d.phone,
        website: d.website,
        email: d.email,
        custom_logo_url: '',
        show_tax_numbers: true,
        ntn: d.ntn,
        strn: d.strn,
        date_label: 'S. Tax Invoice Date',
        invoice_no_label: 'S. Tax Invoice #',
        show_contract_id: true,
        contract_label: 'Contract ID No',
        customer_label: 'Customer Name',
        show_customer_ntn: true,
        customer_ntn_label: 'Customer NTN #',
        month_label: 'Invoice Month',
        period_label: 'Invoice Period',
        col_sno_label: 'S/No',
        col_description_label: 'Detail of Security Staff Provided',
        col_qty_label: 'Qty',
        col_rate_label: 'Rate Per Head',
        col_amount_label: 'Amount',
        col_amount_sublabel: 'PKR Rupees',
        show_service_charges_row: true,
        service_charges_label: 'Service Charges',
        sales_tax_label: 'Add: Sales Tax on Service',
        currency_label: 'PKR',
        footer_note: 'Note: Please make the payment by 5th of each month.',
        left_signature_label: 'ACCOUNTS OFFICER',
        right_signature_label: 'G.M',
        show_bank_details: true,
        bank_section_title: 'Bank Detail',
        bank_account_title: d.bank_account_title,
        bank_account_number: d.bank_account_number,
        bank_name: d.bank_name,
        bank_iban: d.bank_iban,
      });
    }
  };

  const handleSave = async () => {
    if (!cashForm || !chequeForm) return;
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const updated = await saveInvoiceTemplates({
        cash: cashForm,
        cheque: chequeForm,
      });
      setBundle(updated);
      setCashForm({ ...updated.cash });
      setChequeForm({ ...updated.cheque });
      setSuccessMsg('Saved templates for this company.');
      if (onSaved) onSaved(updated);
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.error || err.message || 'Failed to save templates.');
    } finally {
      setSaving(false);
    }
  };

  // Sample multi-tenant live preview context driven by active company's data
  const sampleContext: InvoicePreviewContext | null =
    currentForm && bundle
      ? {
          template_mode: activeType,
          calculation_mode: 'CONTRACT_RATE',
          amount_in_words:
            activeType === 'CHEQUE'
              ? 'Ninety Seven Thousand One Hundred and Forty Seven Only.'
              : 'Two Hundred and Fifty Two Thousand Only.',
          service_charges: {
            has_breakdown: activeType === 'CHEQUE',
            per_guard: 3000,
            quantity: 3,
            amount: 9000,
            guards_subtotal: 87427,
            sales_tax_basis: 'SERVICE_CHARGES',
            sales_tax_rate: 8,
            sales_tax_amount: 720,
          },
          company: {
            id: bundle.company_defaults.company_id,
            name: currentForm.company_name || bundle.company_defaults.company_name,
            logo_url: bundle.company_defaults.logo_url,
            address: currentForm.address,
            phone: currentForm.phone,
            email: currentForm.email,
            website: currentForm.website,
            ntn: currentForm.ntn,
            strn: currentForm.strn,
          },
          client: {
            id: 'sample-client',
            name: 'Sample Client (Main Site)',
            ntn: '1847659-7',
            billing_address: 'Main Commercial Site',
          },
          contract: {
            id: 'sample-contract',
            contract_number: 'SC-CONTRACT-001',
            title: 'Security Services Contract',
            client_name: 'Sample Client (Main Site)',
          },
          invoice: {
            id: 'sample-inv',
            invoice_number: 'INV-202611-001',
            contract_code: 'SC-CONTRACT-001',
            invoice_date: '2026-10-01',
            due_date: '2026-10-31',
            billing_month: '2026-10',
            period_start: '2026-10-01',
            period_end: '2026-10-31',
            payment_terms: 'NET_30',
            subtotal: activeType === 'CHEQUE' ? 96427 : 252000,
            tax_rate: activeType === 'CHEQUE' ? 8 : 0,
            tax_amount: activeType === 'CHEQUE' ? 720 : 0,
            grand_total: activeType === 'CHEQUE' ? 97147 : 252000,
            paid_amount: 0,
            status: 'DRAFT',
            notes: '',
            terms_and_conditions: '',
          },
          lines: [
            {
              id: 'line-1',
              line_type: 'REGULAR_SERVICE',
              description: activeType === 'CHEQUE' ? 'Security Guards' : 'Security Guard (Main Site)',
              site_name: 'Main Site',
              quantity: activeType === 'CHEQUE' ? 3 : 6,
              unit_rate: activeType === 'CHEQUE' ? 29142 : 42000,
              line_subtotal: activeType === 'CHEQUE' ? 87427 : 252000,
              tax_rate: activeType === 'CHEQUE' ? 8 : 0,
              tax_amount: activeType === 'CHEQUE' ? 720 : 0,
              total_amount: activeType === 'CHEQUE' ? 97147 : 252000,
            },
          ],
          bank_details: {
            bank_name: currentForm.bank_name,
            account_title: currentForm.bank_account_title,
            account_number: currentForm.bank_account_number,
            iban: currentForm.bank_iban,
          },
          templates: bundle,
        }
      : null;

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '7px 10px',
    borderRadius: '6px',
    border: '1px solid var(--color-border, #cbd5e1)',
    background: 'var(--color-surface, #ffffff)',
    color: 'var(--color-text, #0f172a)',
    fontSize: '12.5px',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--color-text-muted, #64748b)',
    marginBottom: '4px',
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.78)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10020,
        padding: '16px',
      }}
    >
      <div
        style={{
          background: 'var(--color-surface, #ffffff)',
          color: 'var(--color-text, #0f172a)',
          borderRadius: '14px',
          width: '100%',
          maxWidth: '1320px',
          height: '92vh',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid var(--color-border, #e2e8f0)',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4)',
        }}
      >
        {/* Top Modal Header */}
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--color-border, #e2e8f0)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
            background: 'var(--color-surface-secondary, #f8fafc)',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>
              Edit Company Invoice Templates (Cash & Cheque / Sales Tax)
            </h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--color-text-muted, #64748b)' }}>
              Active tenant: <strong>{bundle?.company_defaults.company_name || '...'}</strong> — templates save separately per company.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setActiveType('CASH')}
              style={{
                padding: '7px 14px',
                borderRadius: '6px',
                border: activeType === 'CASH' ? 'none' : '1px solid var(--color-border, #cbd5e1)',
                background: activeType === 'CASH' ? '#0f172a' : 'var(--color-surface, #ffffff)',
                color: activeType === 'CASH' ? '#ffffff' : 'var(--color-text, #0f172a)',
                fontWeight: 600,
                fontSize: '12.5px',
                cursor: 'pointer',
              }}
            >
              Cash Template (INVOICE)
            </button>
            <button
              type="button"
              onClick={() => setActiveType('CHEQUE')}
              style={{
                padding: '7px 14px',
                borderRadius: '6px',
                border: activeType === 'CHEQUE' ? 'none' : '1px solid var(--color-border, #cbd5e1)',
                background: activeType === 'CHEQUE' ? '#0284c7' : 'var(--color-surface, #ffffff)',
                color: activeType === 'CHEQUE' ? '#ffffff' : 'var(--color-text, #0f172a)',
                fontWeight: 600,
                fontSize: '12.5px',
                cursor: 'pointer',
              }}
            >
              Cheque Template (SALES TAX INVOICE)
            </button>
            <button
              type="button"
              onClick={handleResetToDefaults}
              style={{
                padding: '7px 12px',
                borderRadius: '6px',
                border: '1px solid var(--color-border, #cbd5e1)',
                background: 'var(--color-surface, #ffffff)',
                color: 'var(--color-text, #334155)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Reset Defaults
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading}
              style={{
                padding: '7px 16px',
                borderRadius: '6px',
                border: 'none',
                background: '#16a34a',
                color: '#ffffff',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Saving...' : 'Save Company Templates'}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '7px 12px',
                borderRadius: '6px',
                border: '1px solid var(--color-border, #cbd5e1)',
                background: 'var(--color-surface, #ffffff)',
                fontSize: '12.5px',
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>

        {(errorMsg || successMsg) && (
          <div
            style={{
              padding: '8px 20px',
              background: errorMsg ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)',
              color: errorMsg ? '#dc2626' : '#16a34a',
              fontSize: '12.5px',
              fontWeight: 600,
            }}
          >
            {errorMsg || successMsg}
          </div>
        )}

        {/* Body Split: Form Left | Live Preview Right */}
        {loading || !currentForm ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
            Loading company invoice template settings...
          </div>
        ) : (
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '460px 1fr', minHeight: 0 }}>
            {/* Left Scrollable Controls */}
            <div
              style={{
                padding: '16px 20px',
                borderRight: '1px solid var(--color-border, #e2e8f0)',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              {/* Section 1: Header & Company Branding */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px', border: '1px solid var(--color-border, #e2e8f0)', borderRadius: '8px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: '#0284c7' }}>
                  1. Company Header & Logo
                </div>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={currentForm.show_header}
                      onChange={(e) => updateField('show_header', e.target.checked)}
                    />
                    Show Company Header
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={currentForm.show_logo}
                      onChange={(e) => updateField('show_logo', e.target.checked)}
                    />
                    Show Company Logo
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={currentForm.show_tax_numbers}
                      onChange={(e) => updateField('show_tax_numbers', e.target.checked)}
                    />
                    Show NTN / S. Tax No
                  </label>
                </div>

                <div>
                  <label style={labelStyle}>Invoice Document Title</label>
                  <input
                    style={inputStyle}
                    value={currentForm.title}
                    onChange={(e) => updateField('title', e.target.value)}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Company Display Name</label>
                  <input
                    style={inputStyle}
                    value={currentForm.company_name}
                    onChange={(e) => updateField('company_name', e.target.value)}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Office Address</label>
                  <textarea
                    rows={2}
                    style={{ ...inputStyle, resize: 'vertical' }}
                    value={currentForm.address}
                    onChange={(e) => updateField('address', e.target.value)}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <label style={labelStyle}>Phone(s)</label>
                    <input style={inputStyle} value={currentForm.phone} onChange={(e) => updateField('phone', e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Website</label>
                    <input style={inputStyle} value={currentForm.website} onChange={(e) => updateField('website', e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Email</label>
                    <input style={inputStyle} value={currentForm.email} onChange={(e) => updateField('email', e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Upload Custom Logo (optional)</label>
                    <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ fontSize: '11px', width: '100%' }} />
                  </div>
                </div>
                {currentForm.custom_logo_url && (
                  <button
                    type="button"
                    onClick={() => updateField('custom_logo_url', '')}
                    style={{ alignSelf: 'flex-start', padding: '4px 10px', fontSize: '11px', borderRadius: '4px', border: '1px solid #ef4444', color: '#ef4444', background: 'transparent', cursor: 'pointer' }}
                  >
                    Remove Custom Logo (Use Company Default)
                  </button>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <label style={labelStyle}>NTN No</label>
                    <input style={inputStyle} value={currentForm.ntn} onChange={(e) => updateField('ntn', e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>S. Tax No</label>
                    <input style={inputStyle} value={currentForm.strn} onChange={(e) => updateField('strn', e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Section 2: Metadata & Table Columns */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px', border: '1px solid var(--color-border, #e2e8f0)', borderRadius: '8px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: '#0284c7' }}>
                  2. Labels, Columns & Tax Breakdown
                </div>
                <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', fontSize: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={currentForm.show_contract_id} onChange={(e) => updateField('show_contract_id', e.target.checked)} />
                    Show Contract ID No
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={currentForm.show_customer_ntn} onChange={(e) => updateField('show_customer_ntn', e.target.checked)} />
                    Show Customer NTN #
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={currentForm.show_service_charges_row} onChange={(e) => updateField('show_service_charges_row', e.target.checked)} />
                    Show Service Charges Row
                  </label>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <label style={labelStyle}>Date Label</label>
                    <input style={inputStyle} value={currentForm.date_label} onChange={(e) => updateField('date_label', e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Invoice # Label</label>
                    <input style={inputStyle} value={currentForm.invoice_no_label} onChange={(e) => updateField('invoice_no_label', e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Description Column</label>
                    <input style={inputStyle} value={currentForm.col_description_label} onChange={(e) => updateField('col_description_label', e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Rate Column</label>
                    <input style={inputStyle} value={currentForm.col_rate_label} onChange={(e) => updateField('col_rate_label', e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Service Charges Label</label>
                    <input style={inputStyle} value={currentForm.service_charges_label} onChange={(e) => updateField('service_charges_label', e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Sales Tax Label</label>
                    <input style={inputStyle} value={currentForm.sales_tax_label} onChange={(e) => updateField('sales_tax_label', e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Section 3: Signatures, Note & Bank Details */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px', border: '1px solid var(--color-border, #e2e8f0)', borderRadius: '8px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: '#0284c7' }}>
                  3. Signatures, Payment Note & Bank Detail
                </div>
                <div>
                  <label style={labelStyle}>Footer Payment Note</label>
                  <input style={inputStyle} value={currentForm.footer_note} onChange={(e) => updateField('footer_note', e.target.value)} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <label style={labelStyle}>Left Signature Title</label>
                    <input style={inputStyle} value={currentForm.left_signature_label} onChange={(e) => updateField('left_signature_label', e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Right Signature Title</label>
                    <input style={inputStyle} value={currentForm.right_signature_label} onChange={(e) => updateField('right_signature_label', e.target.value)} />
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px' }}>
                  <input type="checkbox" checked={currentForm.show_bank_details} onChange={(e) => updateField('show_bank_details', e.target.checked)} />
                  Show Bank Detail Block on Invoice
                </label>
                {currentForm.show_bank_details && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                      <label style={labelStyle}>Bank A/C Title</label>
                      <input style={inputStyle} value={currentForm.bank_account_title} onChange={(e) => updateField('bank_account_title', e.target.value)} />
                    </div>
                    <div>
                      <label style={labelStyle}>Bank A/C No</label>
                      <input style={inputStyle} value={currentForm.bank_account_number} onChange={(e) => updateField('bank_account_number', e.target.value)} />
                    </div>
                    <div>
                      <label style={labelStyle}>Bank Name</label>
                      <input style={inputStyle} value={currentForm.bank_name} onChange={(e) => updateField('bank_name', e.target.value)} />
                    </div>
                    <div>
                      <label style={labelStyle}>IBAN No</label>
                      <input style={inputStyle} value={currentForm.bank_iban} onChange={(e) => updateField('bank_iban', e.target.value)} />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Live Preview Pane */}
            <div style={{ background: '#e2e8f0', overflowY: 'auto', padding: '24px' }}>
              <div style={{ maxWidth: '790px', margin: '0 auto', boxShadow: '0 10px 25px rgba(15,23,42,0.18)', background: '#ffffff' }}>
                {sampleContext && (
                  <InvoiceDocumentSheet
                    context={sampleContext}
                    modeOverride={activeType}
                    templateOverride={currentForm}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

