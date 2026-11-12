import React from 'react';
import { Button } from '../../../components/ui/Button';

export interface PayslipPrintRow {
  id: string;
  payslip_number: string;
  sheet_number?: string;
  month?: string;
  month_display?: string;
  period_start?: string;
  period_end?: string;
  days_in_month?: number;
  prepared_by_name?: string;
  employee_code: string;
  employee_name: string;
  father_name?: string;
  designation_name?: string;
  department_name?: string;
  locations_text?: string;
  contact_number?: string;
  cnic_number?: string;
  cnic_issue_date?: string | null;
  basic_salary: number;
  four_hrs_ot_amount: number;
  site_allowance_amount: number;
  total_salary: number;
  total_shifts: number;
  paid_shifts: number;
  overtime_shifts: number;
  prorated_salary: number;
  overtime_payable: number;
  gross_salary_payable: number;
  doc_charges: number;
  eobi_amount: number;
  admin_charges: number;
  fine_amount: number;
  insurance_amount: number;
  advance_amount: number;
  other_deductions: number;
  total_deduction: number;
  net_salary_payable: number;
  mode_of_payment?: string;
  payment_status?: string;
  is_paid?: boolean;
  is_stop_payment?: boolean;
  stop_payment_reason?: string;
}

export interface PayslipBranding {
  company_name?: string;
  logo_url?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
}

interface PayslipPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  rows: PayslipPrintRow[];
  branding?: PayslipBranding;
  title?: string;
}

const fmtPkr = (v: number | undefined | null) =>
  `Rs ${Math.round(Number(v || 0)).toLocaleString('en-PK')}`;

export const PayslipPrintModal: React.FC<PayslipPrintModalProps> = ({
  isOpen,
  onClose,
  rows,
  branding = {},
  title = 'Pay Slips Preview',
}) => {
  if (!isOpen || rows.length === 0) return null;

  const companyName = (branding.company_name || 'COMPANY').toUpperCase();
  const logoUrl = branding.logo_url || '';

  const handlePrint = () => {
    const el = document.getElementById('payslip-print-container');
    if (!el) return;
    const win = window.open('', '_blank', 'width=980,height=850');
    if (!win) {
      window.print();
      return;
    }
    win.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${companyName} - Pay Slips</title>
          <style>
            @page { size: A4 portrait; margin: 8mm; }
            body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            .slip-card { border: 1.5px solid #0f172a; border-radius: 6px; padding: 12px 14px; margin-bottom: 14px; page-break-inside: avoid !important; break-inside: avoid !important; background: #fff; }
            .slip-hdr { display: flex; justify-content: space-between; align-items: center; border-bottom: 1.5px solid #0f172a; padding-bottom: 8px; margin-bottom: 8px; }
            .slip-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px 10px; font-size: 11px; margin-bottom: 10px; }
            .cols-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            thead { display: table-header-group !important; }
            th, td { border: 1px solid #cbd5e1; padding: 4px 7px; }
            th { background: #f1f5f9; text-align: left; font-size: 10.5px; }
            .amt { text-align: right; font-family: monospace; font-weight: 600; }
            .net-bar { margin-top: 8px; padding: 7px 10px; background: #f8fafc; border: 1px solid #0f172a; display: flex; justify-content: space-between; align-items: center; font-weight: 700; font-size: 12px; }
            .sig-line { margin-top: 22px; display: flex; justify-content: space-between; font-size: 10.5px; font-weight: 700; }
          </style>
        </head>
        <body>
          ${el.innerHTML}
          <script>window.onload = function() { setTimeout(function() { window.print(); }, 250); };</script>
        </body>
      </html>
    `);
    win.document.close();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(15, 23, 42, 0.72)',
        display: 'flex',
        flexDirection: 'column',
        padding: '16px',
      }}
    >
      <div
        style={{
          background: '#1e293b',
          color: '#fff',
          padding: '10px 16px',
          borderRadius: '10px 10px 0 0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <strong style={{ fontSize: '14px' }}>{title}</strong>
          <span style={{ marginLeft: '10px', fontSize: '12px', color: '#94a3b8' }}>
            {rows.length} Pay Slip{rows.length > 1 ? 's' : ''} &bull; {companyName}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button variant="primary" size="sm" onClick={handlePrint}>
            <i className="bx bx-printer" style={{ marginRight: '5px' }}></i>
            {rows.length > 1 ? `Print All / Save PDF (${rows.length})` : 'Print / Save PDF'}
          </Button>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      <div
        id="payslip-print-container"
        style={{
          flex: 1,
          overflow: 'auto',
          background: '#e2e8f0',
          padding: '18px',
          borderRadius: '0 0 10px 10px',
        }}
      >
        {rows.map((r) => (
          <div
            key={r.id}
            className="slip-card"
            style={{
              maxWidth: '860px',
              margin: '0 auto 16px auto',
              background: '#fff',
              color: '#0f172a',
              border: '1.5px solid #0f172a',
              borderRadius: '8px',
              padding: '16px 18px',
            }}
          >
            {/* Multi-tenant Header */}
            <div
              className="slip-hdr"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '2px solid #0f172a',
                paddingBottom: '10px',
                marginBottom: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {logoUrl && (
                  <img src={logoUrl} alt={companyName} style={{ height: '46px', objectFit: 'contain' }} />
                )}
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 800, letterSpacing: '0.4px' }}>{companyName}</div>
                  {(branding.address || branding.phone || branding.email) && (
                    <div style={{ fontSize: '10.5px', color: '#475569' }}>
                      {[branding.address, branding.phone, branding.email].filter(Boolean).join(' | ')}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '14px', fontWeight: 800 }}>SALARY PAY SLIP</div>
                <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#1d4ed8' }}>
                  {r.month_display || r.month || ''}
                </div>
                <div style={{ fontSize: '10px', color: '#64748b' }}>
                  Slip #: {r.payslip_number} {r.sheet_number ? `• ${r.sheet_number}` : ''}
                </div>
              </div>
            </div>

            {/* Employee Metadata */}
            <div
              className="slip-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '6px 12px',
                fontSize: '11.5px',
                marginBottom: '12px',
                padding: '8px 10px',
                background: '#f8fafc',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
              }}
            >
              <div><strong>OSS Code:</strong> {r.employee_code}</div>
              <div><strong>Employee:</strong> {r.employee_name}</div>
              <div><strong>Father Name:</strong> {r.father_name || '—'}</div>
              <div><strong>Designation:</strong> {r.designation_name || 'Security Guard'}</div>
              <div><strong>CNIC #:</strong> {r.cnic_number || '—'}</div>
              <div><strong>Contact:</strong> {r.contact_number || '—'}</div>
              <div><strong>Mode of Payment:</strong> {r.mode_of_payment || 'Cash'}</div>
              <div>
                <strong>Status:</strong>{' '}
                {r.is_stop_payment ? 'ON HOLD' : (r.is_paid ? 'PAID' : 'UNPAID')}
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <strong>Locations & Shifts:</strong> {r.locations_text || '—'} &nbsp;|&nbsp;{' '}
                <strong>Total Days:</strong> {r.total_shifts} &nbsp;|&nbsp;{' '}
                <strong>Paid Shifts:</strong> {r.paid_shifts} &nbsp;|&nbsp;{' '}
                <strong>OT Shifts:</strong> {r.overtime_shifts}
              </div>
            </div>

            {/* Earnings & Deductions Side by Side */}
            <div className="cols-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                <thead>
                  <tr>
                    <th style={{ border: '1px solid #cbd5e1', padding: '5px 8px', background: '#f1f5f9', textAlign: 'left' }}>Earnings & Salary</th>
                    <th style={{ border: '1px solid #cbd5e1', padding: '5px 8px', background: '#f1f5f9', textAlign: 'right' }}>Amount (PKR)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ border: '1px solid #cbd5e1', padding: '4px 8px' }}>Basic Salary</td>
                    <td className="amt" style={{ border: '1px solid #cbd5e1', padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{fmtPkr(r.basic_salary)}</td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #cbd5e1', padding: '4px 8px' }}>4 Hrs OT</td>
                    <td className="amt" style={{ border: '1px solid #cbd5e1', padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{fmtPkr(r.four_hrs_ot_amount)}</td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #cbd5e1', padding: '4px 8px' }}>Site Allowance</td>
                    <td className="amt" style={{ border: '1px solid #cbd5e1', padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{fmtPkr(r.site_allowance_amount)}</td>
                  </tr>
                  <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                    <td style={{ border: '1px solid #cbd5e1', padding: '4px 8px' }}>Total Monthly Salary</td>
                    <td className="amt" style={{ border: '1px solid #cbd5e1', padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{fmtPkr(r.total_salary)}</td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #cbd5e1', padding: '4px 8px' }}>Salary ({r.paid_shifts}/{r.total_shifts} shifts)</td>
                    <td className="amt" style={{ border: '1px solid #cbd5e1', padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{fmtPkr(r.prorated_salary)}</td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #cbd5e1', padding: '4px 8px' }}>Overtime Payable ({r.overtime_shifts} OT)</td>
                    <td className="amt" style={{ border: '1px solid #cbd5e1', padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{fmtPkr(r.overtime_payable)}</td>
                  </tr>
                  <tr style={{ background: '#ecfdf5', fontWeight: 800 }}>
                    <td style={{ border: '1px solid #cbd5e1', padding: '5px 8px' }}>Gross Salary Payable</td>
                    <td className="amt" style={{ border: '1px solid #cbd5e1', padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{fmtPkr(r.gross_salary_payable)}</td>
                  </tr>
                </tbody>
              </table>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                <thead>
                  <tr>
                    <th style={{ border: '1px solid #cbd5e1', padding: '5px 8px', background: '#f1f5f9', textAlign: 'left' }}>Deductions</th>
                    <th style={{ border: '1px solid #cbd5e1', padding: '5px 8px', background: '#f1f5f9', textAlign: 'right' }}>Amount (PKR)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ border: '1px solid #cbd5e1', padding: '4px 8px' }}>Doc Charges</td>
                    <td className="amt" style={{ border: '1px solid #cbd5e1', padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{fmtPkr(r.doc_charges)}</td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #cbd5e1', padding: '4px 8px' }}>EOBI</td>
                    <td className="amt" style={{ border: '1px solid #cbd5e1', padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{fmtPkr(r.eobi_amount)}</td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #cbd5e1', padding: '4px 8px' }}>Admin Charges</td>
                    <td className="amt" style={{ border: '1px solid #cbd5e1', padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{fmtPkr(r.admin_charges)}</td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #cbd5e1', padding: '4px 8px' }}>Fine / Gd Accomo</td>
                    <td className="amt" style={{ border: '1px solid #cbd5e1', padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{fmtPkr(r.fine_amount)}</td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #cbd5e1', padding: '4px 8px' }}>Insurance</td>
                    <td className="amt" style={{ border: '1px solid #cbd5e1', padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{fmtPkr(r.insurance_amount)}</td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #cbd5e1', padding: '4px 8px' }}>Advance Recovery {r.other_deductions > 0 ? '+ Other' : ''}</td>
                    <td className="amt" style={{ border: '1px solid #cbd5e1', padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{fmtPkr((r.advance_amount || 0) + (r.other_deductions || 0))}</td>
                  </tr>
                  <tr style={{ background: '#fef2f2', fontWeight: 800 }}>
                    <td style={{ border: '1px solid #cbd5e1', padding: '5px 8px' }}>Total Deduction</td>
                    <td className="amt" style={{ border: '1px solid #cbd5e1', padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace', color: '#dc2626' }}>{fmtPkr(r.total_deduction)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div
              className="net-bar"
              style={{
                marginTop: '10px',
                padding: '8px 12px',
                background: '#f8fafc',
                border: '1.5px solid #0f172a',
                borderRadius: '6px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontWeight: 800,
                fontSize: '13px',
              }}
            >
              <span>NET SALARY PAYABLE ({r.mode_of_payment || 'Cash'})</span>
              <span style={{ fontSize: '15px', color: '#059669' }}>{fmtPkr(r.net_salary_payable)}</span>
            </div>

            <div className="sig-line" style={{ marginTop: '24px', display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', fontWeight: 700 }}>
              <span>Prepared By: {r.prepared_by_name || 'Finance Department'}</span>
              <span>Accounts / HR Approval: ___________________</span>
              <span>Employee Signature: ___________________</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

