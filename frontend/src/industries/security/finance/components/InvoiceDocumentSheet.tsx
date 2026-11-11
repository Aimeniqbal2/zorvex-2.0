import React from 'react';
import type { InvoicePreviewContext, InvoiceTemplateConfig } from '../api';

interface InvoiceDocumentSheetProps {
  context: InvoicePreviewContext;
  modeOverride?: 'CASH' | 'CHEQUE';
  templateOverride?: InvoiceTemplateConfig;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatDisplayDate(iso?: string): string {
  if (!iso) return '-';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function formatMonthTitle(ym?: string): string {
  if (!ym) return '-';
  const parts = ym.split('-');
  if (parts.length !== 2) return ym;
  const idx = Number(parts[1]) - 1;
  const name = MONTH_NAMES[idx] || parts[1];
  return `${name}- ${parts[0]}`;
}

function formatLongDate(iso?: string): string {
  if (!iso) return '-';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  const idx = Number(parts[1]) - 1;
  const name = MONTH_NAMES[idx] || parts[1];
  return `${name} ${Number(parts[2])}, ${parts[0]}`;
}

function fmtMoney(n?: number): string {
  const num = Number(n || 0);
  const hasDecimals = Math.abs(num - Math.round(num)) > 0.004;
  return num.toLocaleString(undefined, {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: hasDecimals ? 2 : 0,
  });
}

export const InvoiceDocumentSheet: React.FC<InvoiceDocumentSheetProps> = ({
  context,
  modeOverride,
  templateOverride,
}) => {
  const mode: 'CASH' | 'CHEQUE' = modeOverride || context.template_mode || 'CASH';
  const tpl: InvoiceTemplateConfig =
    templateOverride ||
    (mode === 'CHEQUE' ? context.templates?.cheque : context.templates?.cash) ||
    ({} as InvoiceTemplateConfig);

  const comp = context.company || { id: '', name: '', address: '', phone: '', email: '' };
  const client = context.client || { id: null, name: 'Unknown Client', billing_address: '' };
  const inv = context.invoice || ({} as InvoicePreviewContext['invoice']);
  const lines = context.lines || [];
  const sc = context.service_charges || {
    has_breakdown: false,
    per_guard: 0,
    quantity: 0,
    amount: 0,
    guards_subtotal: Number(inv.subtotal || context.subtotal || 0),
    sales_tax_basis: 'MANUAL',
    sales_tax_rate: Number(context.tax_rate || 0),
    sales_tax_amount: Number(inv.tax_amount || context.tax_amount || 0),
  };

  const subtotal = Number(inv.subtotal ?? context.subtotal ?? 0);
  const taxAmount = Number(inv.tax_amount ?? context.tax_amount ?? 0);
  const taxRate = Number(inv.tax_rate ?? context.tax_rate ?? 0);
  const grandTotal = Number(inv.grand_total ?? context.grand_total ?? 0);
  const currLabel = tpl.currency_label || inv.currency || context.currency || 'PKR';

  const logoSrc = tpl.custom_logo_url || comp.logo_url || '';
  const companyDisplayName = tpl.company_name || comp.name || 'Company';
  const companyAddress = tpl.address || comp.address || '';
  const companyPhone = tpl.phone || comp.phone || '';
  const companyWebsite = tpl.website || comp.website || '';
  const companyEmail = tpl.email || comp.email || '';
  const companyNtn = tpl.ntn || comp.ntn || '';
  const companyStrn = tpl.strn || comp.strn || '';

  const bankTitle = tpl.bank_account_title || context.bank_details?.account_title || companyDisplayName;
  const bankNo = tpl.bank_account_number || context.bank_details?.account_number || '';
  const bankName = tpl.bank_name || context.bank_details?.bank_name || '';
  const bankIban = tpl.bank_iban || context.bank_details?.iban || '';

  const periodText =
    inv.period_start && inv.period_end
      ? `${formatLongDate(inv.period_start)} to ${formatLongDate(inv.period_end)}`
      : '-';

  const contractCode = context.contract?.contract_number || inv.contract_code || '-';
  const showScBreakdown = mode === 'CHEQUE' && tpl.show_service_charges_row && sc.has_breakdown;
  const primaryDesc =
    lines.length === 1
      ? lines[0].description
      : client.billing_address
      ? `Security Guards (${client.billing_address})`
      : 'Security Guards';
  const totalQty = sc.quantity > 0 ? sc.quantity : lines.reduce((acc, l) => acc + Number(l.quantity || 0), 0) || 1;
  const perHeadGuard = totalQty > 0 ? sc.guards_subtotal / totalQty : sc.guards_subtotal;
  const extraStartIndex = showScBreakdown ? 2 : Math.max(lines.length, 1) + 1;

  return (
    <div
      style={{
        background: '#ffffff',
        color: '#0f172a',
        fontFamily: "Georgia, 'Times New Roman', serif",
        padding: '28px 34px',
        maxWidth: '780px',
        margin: '0 auto',
        fontSize: '13.5px',
        lineHeight: 1.45,
      }}
    >
      {/* Dynamic Multi-Tenant Header (Enabled by default on Cheque / Sales Tax Invoice) */}
      {tpl.show_header && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            borderBottom: '3px solid #7f1d1d',
            paddingBottom: '10px',
            marginBottom: '14px',
            gap: '16px',
          }}
        >
          <div style={{ minWidth: '120px', display: 'flex', alignItems: 'center' }}>
            {tpl.show_logo && logoSrc ? (
              <img
                src={logoSrc}
                alt={companyDisplayName}
                style={{ maxHeight: '78px', maxWidth: '140px', objectFit: 'contain' }}
              />
            ) : (
              <div
                style={{
                  width: '72px',
                  height: '72px',
                  borderRadius: '12px',
                  border: '2px solid #0f172a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'system-ui, sans-serif',
                  fontWeight: 800,
                  fontSize: '20px',
                  letterSpacing: '1px',
                  color: '#0f172a',
                  background: '#f8fafc',
                }}
              >
                {companyDisplayName
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((w) => w[0]?.toUpperCase() || '')
                  .join('')}
              </div>
            )}
          </div>

          <div style={{ textAlign: 'right', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            <div style={{ fontSize: '21px', fontWeight: 800, color: '#0f172a', letterSpacing: '0.3px' }}>
              {companyDisplayName}
            </div>
            {companyAddress && (
              <div style={{ fontSize: '11.5px', color: '#334155', marginTop: '2px', whiteSpace: 'pre-line' }}>
                {companyAddress}
              </div>
            )}
            {companyPhone && (
              <div style={{ fontSize: '11.5px', color: '#334155', marginTop: '2px' }}>
                Ph: {companyPhone}
              </div>
            )}
            {(companyWebsite || companyEmail) && (
              <div style={{ fontSize: '11.5px', color: '#1e293b', marginTop: '2px' }}>
                {[companyWebsite, companyEmail].filter(Boolean).join('  |  ')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Title Box (Image 3 = Boxed Bold Underlined INVOICE; Image 4 = Bold Italic Underlined SALES TAX INVOICE) */}
      {mode === 'CHEQUE' ? (
        <div
          style={{
            textAlign: 'center',
            fontSize: '20px',
            fontWeight: 800,
            fontStyle: 'italic',
            textDecoration: 'underline',
            margin: '6px 0 14px 0',
            letterSpacing: '0.5px',
          }}
        >
          {tpl.title || 'SALES TAX INVOICE'}
        </div>
      ) : (
        <div
          style={{
            textAlign: 'center',
            border: '2px solid #0f172a',
            padding: '10px 16px',
            marginBottom: '16px',
          }}
        >
          <span
            style={{
              fontFamily: 'system-ui, sans-serif',
              fontSize: '28px',
              fontWeight: 800,
              textDecoration: 'underline',
              letterSpacing: '1px',
            }}
          >
            {tpl.title || 'INVOICE'}
          </span>
        </div>
      )}

      {/* Metadata Section */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '16px',
          marginBottom: '16px',
        }}
      >
        <table style={{ borderCollapse: 'collapse', fontSize: '13.5px' }}>
          <tbody>
            <tr>
              <td style={{ padding: '2px 10px 2px 0', minWidth: '155px' }}>
                {tpl.date_label || (mode === 'CHEQUE' ? 'S. Tax Invoice Date' : 'Date')}
              </td>
              <td style={{ padding: '2px 8px' }}>:</td>
              <td style={{ padding: '2px 0', fontWeight: 700 }}>{formatDisplayDate(inv.invoice_date || context.invoice_date)}</td>
            </tr>
            <tr>
              <td style={{ padding: '2px 10px 2px 0' }}>
                {tpl.invoice_no_label || (mode === 'CHEQUE' ? 'S. Tax Invoice #' : 'Invoice #')}
              </td>
              <td style={{ padding: '2px 8px' }}>:</td>
              <td style={{ padding: '2px 0', fontWeight: 700 }}>{inv.invoice_number || context.invoice_number}</td>
            </tr>
            {tpl.show_contract_id && (
              <tr>
                <td style={{ padding: '2px 10px 2px 0' }}>{tpl.contract_label || 'Contract ID No'}</td>
                <td style={{ padding: '2px 8px' }}>:</td>
                <td style={{ padding: '2px 0', fontWeight: 700 }}>{contractCode}</td>
              </tr>
            )}
            <tr>
              <td style={{ padding: '2px 10px 2px 0' }}>{tpl.customer_label || 'Customer Name'}</td>
              <td style={{ padding: '2px 8px' }}>:</td>
              <td style={{ padding: '2px 0', fontWeight: 700 }}>{client.name}</td>
            </tr>
            {tpl.show_customer_ntn && (
              <tr>
                <td style={{ padding: '2px 10px 2px 0' }}>{tpl.customer_ntn_label || 'Customer NTN #'}</td>
                <td style={{ padding: '2px 8px' }}>:</td>
                <td style={{ padding: '2px 0', fontWeight: 700 }}>{client.ntn || '-'}</td>
              </tr>
            )}
            <tr>
              <td style={{ padding: '2px 10px 2px 0' }}>{tpl.month_label || 'Invoice Month'}</td>
              <td style={{ padding: '2px 8px' }}>:</td>
              <td style={{ padding: '2px 0', fontWeight: 700 }}>{formatMonthTitle(inv.billing_month || context.billing_month)}</td>
            </tr>
            <tr>
              <td style={{ padding: '2px 10px 2px 0' }}>{tpl.period_label || 'Invoice Period'}</td>
              <td style={{ padding: '2px 8px' }}>:</td>
              <td style={{ padding: '2px 0', fontWeight: 700 }}>{periodText}</td>
            </tr>
          </tbody>
        </table>

        {tpl.show_tax_numbers && (
          <table style={{ borderCollapse: 'collapse', fontSize: '13px', fontWeight: 700 }}>
            <tbody>
              <tr>
                <td style={{ padding: '2px 14px 2px 0', textAlign: 'left' }}>NTN No:</td>
                <td style={{ padding: '2px 0', textAlign: 'right' }}>{companyNtn || '-'}</td>
              </tr>
              <tr>
                <td style={{ padding: '2px 14px 2px 0', textAlign: 'left' }}>S. Tax No:</td>
                <td style={{ padding: '2px 0', textAlign: 'right' }}>{companyStrn || '-'}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {/* Main Bordered Line Items Table */}
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          border: '2px solid #0f172a',
          fontSize: '13.5px',
        }}
      >
        <thead>
          <tr>
            <th style={{ border: '1.5px solid #0f172a', padding: '6px 8px', width: '50px', textAlign: 'center' }}>
              {tpl.col_sno_label || 'S/No'}
            </th>
            <th style={{ border: '1.5px solid #0f172a', padding: '6px 10px', textAlign: 'center' }}>
              {tpl.col_description_label || 'Detail of Security Staff Provided'}
            </th>
            <th style={{ border: '1.5px solid #0f172a', padding: '6px 8px', width: '60px', textAlign: 'center' }}>
              {tpl.col_qty_label || 'Qty'}
            </th>
            <th style={{ border: '1.5px solid #0f172a', padding: '6px 8px', width: '110px', textAlign: 'center' }}>
              <div style={{ fontWeight: 700 }}>{tpl.col_rate_label || 'Rate Per Head'}</div>
            </th>
            <th style={{ border: '1.5px solid #0f172a', padding: '6px 8px', width: '125px', textAlign: 'center' }}>
              <div style={{ fontWeight: 700 }}>{tpl.col_amount_label || 'Amount'}</div>
              <div style={{ fontSize: '11px', fontWeight: 400 }}>{tpl.col_amount_sublabel || 'PKR Rupees'}</div>
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.length === 0 ? (
            <tr>
              <td style={{ border: '1px solid #0f172a', padding: '8px', textAlign: 'center' }}>1</td>
              <td style={{ border: '1px solid #0f172a', padding: '8px 10px' }}>Security Personnel Services</td>
              <td style={{ border: '1px solid #0f172a', padding: '8px', textAlign: 'center' }}>1</td>
              <td style={{ border: '1px solid #0f172a', padding: '8px 10px', textAlign: 'right' }}>{fmtMoney(subtotal)}</td>
              <td style={{ border: '1px solid #0f172a', padding: '8px 10px', textAlign: 'right' }}>{fmtMoney(subtotal)}</td>
            </tr>
          ) : showScBreakdown ? (
            <>
              <tr>
                <td style={{ border: '1px solid #0f172a', padding: '6px 8px', textAlign: 'center' }}>1</td>
                <td style={{ border: '1px solid #0f172a', padding: '6px 10px' }}>{primaryDesc}</td>
                <td style={{ border: '1px solid #0f172a', padding: '6px 8px', textAlign: 'center' }}>{totalQty}</td>
                <td style={{ border: '1px solid #0f172a', padding: '6px 10px', textAlign: 'right' }}>{fmtMoney(perHeadGuard)}</td>
                <td style={{ border: '1px solid #0f172a', padding: '6px 10px', textAlign: 'right' }}>{fmtMoney(sc.guards_subtotal)}</td>
              </tr>
              <tr>
                <td style={{ border: '1px solid #0f172a', padding: '5px 8px' }}></td>
                <td style={{ border: '1px solid #0f172a', padding: '5px 10px', textAlign: 'center', fontWeight: 700 }}>Total</td>
                <td style={{ border: '1px solid #0f172a', padding: '5px 8px' }}></td>
                <td style={{ border: '1px solid #0f172a', padding: '5px 10px' }}></td>
                <td style={{ border: '1px solid #0f172a', padding: '5px 10px', textAlign: 'right', fontWeight: 700 }}>
                  {fmtMoney(sc.guards_subtotal)}
                </td>
              </tr>
              <tr>
                <td style={{ border: '1px solid #0f172a', padding: '6px 8px', textAlign: 'center' }}>2</td>
                <td style={{ border: '1px solid #0f172a', padding: '6px 10px' }}>{tpl.service_charges_label || 'Service Charges'}</td>
                <td style={{ border: '1px solid #0f172a', padding: '6px 8px', textAlign: 'center' }}>{totalQty}</td>
                <td style={{ border: '1px solid #0f172a', padding: '6px 10px', textAlign: 'right' }}>{fmtMoney(sc.per_guard)}</td>
                <td style={{ border: '1px solid #0f172a', padding: '6px 10px', textAlign: 'right' }}>{fmtMoney(sc.amount)}</td>
              </tr>
            </>
          ) : (
            lines.map((ln, idx) => (
              <tr key={ln.id || idx}>
                <td style={{ border: '1px solid #0f172a', padding: '7px 8px', textAlign: 'center' }}>{idx + 1}</td>
                <td style={{ border: '1px solid #0f172a', padding: '7px 10px' }}>{ln.description}</td>
                <td style={{ border: '1px solid #0f172a', padding: '7px 8px', textAlign: 'center' }}>{ln.quantity}</td>
                <td style={{ border: '1px solid #0f172a', padding: '7px 10px', textAlign: 'right' }}>{fmtMoney(ln.unit_rate)}</td>
                <td style={{ border: '1px solid #0f172a', padding: '7px 10px', textAlign: 'right' }}>{fmtMoney(ln.line_subtotal)}</td>
              </tr>
            ))
          )}

          {/* Sales Tax Row (Shown on Cheque / Sales Tax Invoice or when taxAmount > 0) */}
          {(taxAmount > 0 || (mode === 'CHEQUE' && taxRate > 0)) && (
            <tr>
              <td style={{ border: '1px solid #0f172a', padding: '6px 8px', textAlign: 'center' }}>
                {showScBreakdown ? 3 : extraStartIndex}
              </td>
              <td style={{ border: '1px solid #0f172a', padding: '6px 10px' }}>
                {tpl.sales_tax_label || 'Add: Sales Tax on Service'} {taxRate > 0 ? `${taxRate}%` : ''}
              </td>
              <td style={{ border: '1px solid #0f172a', padding: '6px 8px' }}></td>
              <td style={{ border: '1px solid #0f172a', padding: '6px 10px', textAlign: 'right' }}>
                {taxRate > 0 ? `${taxRate}%` : '-'}
              </td>
              <td style={{ border: '1px solid #0f172a', padding: '6px 10px', textAlign: 'right' }}>
                {fmtMoney(taxAmount)}
              </td>
            </tr>
          )}

          {/* Grand Total Section matching Image 3 & 4 */}
          <tr>
            <td
              colSpan={4}
              style={{
                borderTop: '2px solid #0f172a',
                padding: '6px 10px 2px 10px',
                fontWeight: 800,
              }}
            >
              TOTAL:
            </td>
            <td
              style={{
                borderTop: '2px solid #0f172a',
                borderLeft: '1.5px solid #0f172a',
                padding: '6px 10px 2px 10px',
                fontWeight: 800,
              }}
            >
              {currLabel}
            </td>
          </tr>
          <tr>
            <td
              colSpan={4}
              style={{
                borderBottom: '2px solid #0f172a',
                padding: '2px 10px 8px 10px',
                fontWeight: 700,
              }}
            >
              (Rupees:{context.amount_in_words || 'Only.'})
            </td>
            <td
              style={{
                borderBottom: '2px solid #0f172a',
                borderLeft: '1.5px solid #0f172a',
                padding: '2px 10px 8px 10px',
                textAlign: 'right',
                fontWeight: 800,
                fontSize: '15px',
              }}
            >
              {fmtMoney(grandTotal)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Payment Note + Signature Block matching Image 3 vs Image 4 order cleanly */}
      {mode === 'CASH' ? (
        <>
          <div style={{ marginTop: '14px', fontWeight: 700, fontSize: '13.5px' }}>
            {tpl.footer_note || 'Note: Please make the payment by 5th of each month.'}
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: '72px',
              fontWeight: 700,
              fontSize: '13px',
            }}
          >
            <div style={{ borderTop: '1.5px solid #0f172a', width: '190px', paddingTop: '4px' }}>
              {tpl.left_signature_label || 'ACCOUNTS OFFICER'}
            </div>
            <div style={{ borderTop: '1.5px solid #0f172a', width: '160px', textAlign: 'center', paddingTop: '4px' }}>
              {tpl.right_signature_label || 'G.M'}
            </div>
          </div>
        </>
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: '68px',
              fontWeight: 700,
              fontSize: '13px',
            }}
          >
            <div style={{ borderTop: '1.5px solid #0f172a', width: '190px', paddingTop: '4px' }}>
              {tpl.left_signature_label || 'ACCOUNTS OFFICER'}
            </div>
            <div style={{ borderTop: '1.5px solid #0f172a', width: '160px', textAlign: 'center', paddingTop: '4px' }}>
              {tpl.right_signature_label || 'G.M'}
            </div>
          </div>

          <hr style={{ border: 'none', borderTop: '2px dashed #0f172a', margin: '18px 0 10px 0' }} />

          <div style={{ fontWeight: 700, fontSize: '13.5px' }}>
            {tpl.footer_note || 'Note: Please make the payment by 5th of each month.'}
          </div>
        </>
      )}

      {/* Bank Detail Table (Shown on Cheque template or whenever toggled on in Editor) */}
      {tpl.show_bank_details && (
        <div style={{ marginTop: '18px', maxWidth: '460px', fontSize: '13px' }}>
          <div style={{ fontWeight: 800, textDecoration: 'underline', marginBottom: '6px' }}>
            {tpl.bank_section_title || 'Bank Detail'}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{ borderTop: '1px solid #0f172a', borderBottom: '1px solid #0f172a', padding: '3px 6px', fontWeight: 700, width: '135px' }}>
                  Bank A/C Title
                </td>
                <td style={{ borderTop: '1px solid #0f172a', borderBottom: '1px solid #0f172a', padding: '3px 6px' }}>
                  : &nbsp;{bankTitle || '-'}
                </td>
              </tr>
              <tr>
                <td style={{ borderBottom: '1px solid #0f172a', padding: '3px 6px', fontWeight: 700 }}>
                  Bank A/C No
                </td>
                <td style={{ borderBottom: '1px solid #0f172a', padding: '3px 6px' }}>
                  : &nbsp;{bankNo || '-'}
                </td>
              </tr>
              <tr>
                <td style={{ borderBottom: '1px solid #0f172a', padding: '3px 6px', fontWeight: 700 }}>
                  Bank Name
                </td>
                <td style={{ borderBottom: '1px solid #0f172a', padding: '3px 6px' }}>
                  : &nbsp;{bankName || '-'}
                </td>
              </tr>
              <tr>
                <td style={{ borderBottom: '1px solid #0f172a', padding: '3px 6px', fontWeight: 700 }}>
                  IBAN No
                </td>
                <td style={{ borderBottom: '1px solid #0f172a', padding: '3px 6px' }}>
                  : &nbsp;{bankIban || '-'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

