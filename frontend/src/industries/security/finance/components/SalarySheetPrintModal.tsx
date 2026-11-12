import React from 'react';
import { Button } from '../../../../components/ui/Button';
import { SalarySheetItem } from '../api';

interface SalarySheetPrintModalProps {
  sheet: SalarySheetItem | null;
  isOpen: boolean;
  onClose: () => void;
}

const fmtInt = (val: number | string | undefined | null) => {
  const n = Math.round(Number(val || 0));
  if (n === 0) return '-';
  return n.toLocaleString('en-PK');
};

const fmtNum = (val: number | string | undefined | null) => {
  const n = Number(val || 0);
  if (n === 0) return '';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
};

export const SalarySheetPrintModal: React.FC<SalarySheetPrintModalProps> = ({
  sheet,
  isOpen,
  onClose,
}) => {
  if (!isOpen || !sheet) return null;

  const lines = sheet.lines || [];
  const branding = sheet.branding || {};
  const companyName = (branding.company_name || 'COMPANY').toUpperCase();
  const logoSrc = branding.logo_url || '';

  const handlePrint = () => {
    const el = document.getElementById('salary-sheet-print-document');
    if (!el) return;
    const win = window.open('', '_blank', 'width=1300,height=900');
    if (!win) {
      window.print();
      return;
    }
    win.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${sheet.title || sheet.sheet_number}</title>
          <style>
            @page { size: A4 landscape; margin: 6mm; }
            body { font-family: Arial, Helvetica, sans-serif; color: #000; margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            table { width: 100%; border-collapse: collapse; font-size: 8.5px; page-break-inside: auto; }
            thead { display: table-header-group !important; }
            tbody { display: table-row-group !important; }
            tfoot { display: table-footer-group !important; }
            tr { page-break-inside: avoid !important; break-inside: avoid !important; }
            th, td { border: 1px solid #000; padding: 2px 3px; text-align: center; vertical-align: middle; line-height: 1.2; }
            .banner-th { border: none !important; background: #fff !important; padding: 0 0 4px 0 !important; text-align: left !important; }
            .txt-left { text-align: left !important; }
            .txt-right { text-align: right !important; }
            .bold { font-weight: 700; }
            .hdr-wrap { display: flex; align-items: center; justify-content: center; position: relative; margin-bottom: 4px; min-height: 44px; }
            .hdr-logo { position: absolute; left: 8px; top: 0; height: 40px; object-fit: contain; }
            .hdr-title { text-align: center; }
            .hdr-title h2 { margin: 0; font-size: 13px; letter-spacing: 0.4px; }
            .hdr-title h3 { margin: 2px 0 0; font-size: 11px; }
            .hdr-sub { font-size: 9px; margin-top: 2px; color: #222; }
            .days-bar { font-size: 10px; font-weight: 700; margin-bottom: 2px; display: flex; justify-content: space-between; }
            .col-doc { background-color: #f5c197 !important; }
            .col-eobi { background-color: #8fd1df !important; }
            .col-admin { background-color: #b6d19a !important; }
            .col-fine { background-color: #cbc1dc !important; }
            .col-ins { background-color: #f9dec4 !important; }
            .col-adv { background-color: #ffff00 !important; }
            .hold-row td { background-color: #d6938f !important; }
            .sig-row td { border: none !important; padding-top: 18px !important; font-size: 9.5px; font-weight: 700; text-align: center; }
            .sig-line { border-top: 1px solid #000; display: inline-block; min-width: 115px; padding-top: 3px; }
          </style>
        </head>
        <body>
          ${el.innerHTML}
          <script>
            window.onload = function() {
              setTimeout(function() { window.print(); }, 250);
            };
          </script>
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
        padding: '14px',
      }}
    >
      {/* Top Toolbar */}
      <div
        style={{
          background: '#1e293b',
          color: '#fff',
          padding: '10px 16px',
          borderRadius: '10px 10px 0 0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <div>
          <strong style={{ fontSize: '14px' }}>{sheet.title}</strong>
          <span style={{ marginLeft: '12px', fontSize: '12px', color: '#94a3b8' }}>
            {sheet.sheet_number} &bull; {lines.length} Employees &bull; Prepared by {sheet.prepared_by_name || 'Finance'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button variant="primary" size="sm" onClick={handlePrint}>
            <i className="bx bx-printer" style={{ marginRight: '5px' }}></i>
            Print Salary Sheet (Landscape)
          </Button>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      {/* Scrollable Preview Area */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          background: '#fff',
          color: '#000',
          padding: '16px',
          borderRadius: '0 0 10px 10px',
        }}
      >
        <div id="salary-sheet-print-document">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px', color: '#000' }}>
            <thead>
              <tr>
                <th colSpan={26} className="banner-th" style={{ border: 'none', background: '#fff', padding: '0 0 4px 0', textAlign: 'left' }}>
                  <div className="hdr-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', marginBottom: '4px', minHeight: '46px' }}>
                    {logoSrc && (
                      <img
                        src={logoSrc}
                        alt={companyName}
                        className="hdr-logo"
                        style={{ position: 'absolute', left: '8px', top: 0, height: '42px', objectFit: 'contain' }}
                      />
                    )}
                    <div className="hdr-title" style={{ textAlign: 'center' }}>
                      <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 800 }}>{companyName}</h2>
                      <h3 style={{ margin: '2px 0 0', fontSize: '12px', fontWeight: 700 }}>{sheet.title}</h3>
                      {(branding.address || branding.phone || branding.email) && (
                        <div className="hdr-sub" style={{ fontSize: '10px', color: '#333', marginTop: '2px' }}>
                          {[branding.address, branding.phone, branding.email].filter(Boolean).join(' | ')}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="days-bar" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', fontWeight: 700 }}>
                    <span>{sheet.days_in_month} &nbsp; Total Days</span>
                    <span>Sheet Ref: {sheet.sheet_number} &nbsp; ({sheet.period_start} to {sheet.period_end})</span>
                  </div>
                </th>
              </tr>
              <tr>
                <th rowSpan={2} style={{ border: '1px solid #000', padding: '3px', background: '#f8fafc' }}>S#</th>
                <th rowSpan={2} style={{ border: '1px solid #000', padding: '3px', background: '#f8fafc' }}>OSS</th>
                <th rowSpan={2} style={{ border: '1px solid #000', padding: '3px', background: '#f8fafc', minWidth: '88px' }}>Employee&apos;s Name</th>
                <th rowSpan={2} style={{ border: '1px solid #000', padding: '3px', background: '#f8fafc' }}>Basic Salary</th>
                <th rowSpan={2} style={{ border: '1px solid #000', padding: '3px', background: '#f8fafc' }}>4 Hrs OT</th>
                <th rowSpan={2} style={{ border: '1px solid #000', padding: '3px', background: '#f8fafc' }}>Site Allowance</th>
                <th rowSpan={2} style={{ border: '1px solid #000', padding: '3px', background: '#f8fafc' }}>Total Salary</th>
                <th rowSpan={2} style={{ border: '1px solid #000', padding: '3px', background: '#f8fafc' }}>Total Shifts</th>
                <th rowSpan={2} style={{ border: '1px solid #000', padding: '3px', background: '#f8fafc' }}>Paid Shifts</th>
                <th rowSpan={2} style={{ border: '1px solid #000', padding: '3px', background: '#f8fafc' }}>Over Time Shifts / Per Hrs</th>
                <th rowSpan={2} style={{ border: '1px solid #000', padding: '3px', background: '#f8fafc' }}>Salary</th>
                <th rowSpan={2} style={{ border: '1px solid #000', padding: '3px', background: '#f8fafc' }}>Arrears + Over Time Payable</th>
                <th rowSpan={2} style={{ border: '1px solid #000', padding: '3px', background: '#f8fafc' }}>Gross Salary Payable</th>
                <th colSpan={6} style={{ border: '1px solid #000', padding: '3px', background: '#e2e8f0', textAlign: 'center' }}>Deduction</th>
                <th rowSpan={2} style={{ border: '1px solid #000', padding: '3px', background: '#f8fafc' }}>Total Deduction</th>
                <th rowSpan={2} style={{ border: '1px solid #000', padding: '3px', background: '#f8fafc' }}>Net Salary Payable</th>
                <th rowSpan={2} style={{ border: '1px solid #000', padding: '3px', background: '#f8fafc' }}>Mode Of Payment</th>
                <th rowSpan={2} style={{ border: '1px solid #000', padding: '3px', background: '#f8fafc', minWidth: '80px' }}>Location</th>
                <th rowSpan={2} style={{ border: '1px solid #000', padding: '3px', background: '#f8fafc' }}>Sign / Contact</th>
                <th rowSpan={2} style={{ border: '1px solid #000', padding: '3px', background: '#f8fafc' }}>CNIC #</th>
                <th rowSpan={2} style={{ border: '1px solid #000', padding: '3px', background: '#f8fafc' }}>Date of Issue</th>
              </tr>
              <tr>
                <th className="col-doc" style={{ border: '1px solid #000', padding: '3px', background: '#f5c197' }}>Doc Charges</th>
                <th className="col-eobi" style={{ border: '1px solid #000', padding: '3px', background: '#8fd1df' }}>EOBI</th>
                <th className="col-admin" style={{ border: '1px solid #000', padding: '3px', background: '#b6d19a' }}>Admin Charges</th>
                <th className="col-fine" style={{ border: '1px solid #000', padding: '3px', background: '#cbc1dc' }}>Fine/ Gd Accomo</th>
                <th className="col-ins" style={{ border: '1px solid #000', padding: '3px', background: '#f9dec4' }}>Insurance</th>
                <th className="col-adv" style={{ border: '1px solid #000', padding: '3px', background: '#ffff00' }}>Adv</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((ln) => {
                const isHold = ln.is_stop_payment;
                const rowBg = isHold ? '#d6938f' : undefined;
                const cellStyle = (bg?: string): React.CSSProperties => ({
                  border: '1px solid #000',
                  padding: '3px',
                  textAlign: 'center',
                  background: isHold ? '#d6938f' : bg,
                });
                return (
                  <tr key={ln.id} className={isHold ? 'hold-row' : undefined}>
                    <td style={cellStyle()}>{ln.serial_no}</td>
                    <td style={cellStyle()}>{ln.oss_code}</td>
                    <td className="txt-left" style={{ ...cellStyle(), textAlign: 'left', fontWeight: 600 }}>{ln.employee_name}</td>
                    <td style={cellStyle()}>{fmtInt(ln.basic_salary)}</td>
                    <td style={cellStyle()}>{Number(ln.four_hrs_ot_amount) > 0 ? fmtInt(ln.four_hrs_ot_amount) : '-'}</td>
                    <td style={cellStyle()}>{Number(ln.site_allowance_amount) > 0 ? fmtInt(ln.site_allowance_amount) : '-'}</td>
                    <td style={{ ...cellStyle(), fontWeight: 700 }}>{fmtInt(ln.total_salary)}</td>
                    <td style={cellStyle()}>{ln.total_shifts}</td>
                    <td style={cellStyle()}>{fmtNum(ln.paid_shifts) || '0'}</td>
                    <td style={cellStyle()}>{fmtNum(ln.overtime_shifts)}</td>
                    <td style={{ ...cellStyle(), fontWeight: 700 }}>{fmtInt(ln.prorated_salary)}</td>
                    <td style={cellStyle()}>{fmtInt(ln.overtime_payable)}</td>
                    <td style={{ ...cellStyle(), fontWeight: 700 }}>{fmtInt(ln.gross_salary_payable)}</td>
                    <td className="col-doc" style={cellStyle('#f5c197')}>{Number(ln.doc_charges) > 0 ? fmtInt(ln.doc_charges) : ''}</td>
                    <td className="col-eobi" style={cellStyle('#8fd1df')}>{Number(ln.eobi_amount) > 0 ? fmtInt(ln.eobi_amount) : ''}</td>
                    <td className="col-admin" style={cellStyle('#b6d19a')}>{Number(ln.admin_charges) > 0 ? fmtInt(ln.admin_charges) : ''}</td>
                    <td className="col-fine" style={cellStyle('#cbc1dc')}>{Number(ln.fine_amount) > 0 ? fmtInt(ln.fine_amount) : ''}</td>
                    <td className="col-ins" style={cellStyle('#f9dec4')}>{Number(ln.insurance_amount) > 0 ? fmtInt(ln.insurance_amount) : ''}</td>
                    <td className="col-adv" style={cellStyle('#ffff00')}>{Number(ln.advance_amount) > 0 ? fmtInt(ln.advance_amount) : ''}</td>
                    <td style={{ ...cellStyle(rowBg), fontWeight: 700 }}>{fmtInt(ln.total_deduction)}</td>
                    <td style={{ ...cellStyle(rowBg), fontWeight: 700 }}>{fmtInt(ln.net_salary_payable)}</td>
                    <td style={cellStyle()}>{ln.mode_of_payment || '-'}</td>
                    <td style={{ ...cellStyle(), fontSize: '8px' }}>
                      {ln.locations_summary && ln.locations_summary.length > 0 ? (
                        <div>
                          {ln.locations_summary.map((ls, i) => (
                            <div key={i}>
                              <strong>{ls.site_name}</strong>{' '}
                              <span style={{ fontSize: '7.5px' }}>
                                ({[ls.regular_shifts > 0 ? `${ls.regular_shifts}D` : '', ls.ot_shifts > 0 ? `${ls.ot_shifts}OT` : ''].filter(Boolean).join(', ')})
                              </span>
                            </div>
                          ))}
                          {isHold && <div style={{ fontWeight: 800 }}>HOLD</div>}
                        </div>
                      ) : (
                        <span>{ln.locations_text || '-'}{isHold ? ' HOLD' : ''}</span>
                      )}
                    </td>
                    <td style={{ ...cellStyle(), fontSize: '8px' }}>{ln.contact_number || ''}</td>
                    <td style={{ ...cellStyle(), fontSize: '8px' }}>{ln.cnic_number || ''}</td>
                    <td style={{ ...cellStyle(), fontSize: '8px', whiteSpace: 'nowrap' }}>{ln.cnic_issue_date || ''}</td>
                  </tr>
                );
              })}

              {/* Totals Row */}
              <tr style={{ background: '#f1f5f9', fontWeight: 800 }}>
                <td colSpan={3} style={{ border: '1px solid #000', padding: '4px', textAlign: 'right' }}>GRAND TOTAL ({lines.length}):</td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>{fmtInt(sheet.total_basic_salary)}</td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>{fmtInt(sheet.total_four_hrs_ot)}</td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>{fmtInt(sheet.total_site_allowance)}</td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>{fmtInt(sheet.total_salary)}</td>
                <td colSpan={3} style={{ border: '1px solid #000', padding: '4px' }}></td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>{fmtInt(lines.reduce((s, x) => s + Number(x.prorated_salary || 0), 0))}</td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>{fmtInt(sheet.total_overtime_payable)}</td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>{fmtInt(sheet.total_gross_payable)}</td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', background: '#f5c197' }}>{fmtInt(sheet.total_doc_charges)}</td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', background: '#8fd1df' }}>{fmtInt(sheet.total_eobi)}</td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', background: '#b6d19a' }}>{fmtInt(sheet.total_admin_charges)}</td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', background: '#cbc1dc' }}>{fmtInt(sheet.total_fine)}</td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', background: '#f9dec4' }}>{fmtInt(sheet.total_insurance)}</td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', background: '#ffff00' }}>{fmtInt(sheet.total_advance)}</td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>{fmtInt(sheet.total_deductions)}</td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>{fmtInt(sheet.total_net_payable)}</td>
                <td colSpan={5} style={{ border: '1px solid #000', padding: '4px' }}></td>
              </tr>
            </tbody>

            {/* Signature Footer repeated cleanly */}
            <tfoot>
              <tr className="sig-row">
                <td colSpan={26} style={{ border: 'none', paddingTop: '22px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 24px', fontSize: '10px', fontWeight: 700 }}>
                    <div style={{ textAlign: 'center', minWidth: '140px' }}>
                      <div style={{ marginBottom: '22px', fontSize: '10px', fontWeight: 600 }}>{sheet.prepared_by_name || 'Finance Officer'}</div>
                      <div style={{ borderTop: '1px solid #000', paddingTop: '3px' }}>Prepared By</div>
                    </div>
                    <div style={{ textAlign: 'center', minWidth: '130px' }}>
                      <div style={{ marginBottom: '22px' }}>&nbsp;</div>
                      <div style={{ borderTop: '1px solid #000', paddingTop: '3px' }}>Operation Officer</div>
                    </div>
                    <div style={{ textAlign: 'center', minWidth: '130px' }}>
                      <div style={{ marginBottom: '22px' }}>&nbsp;</div>
                      <div style={{ borderTop: '1px solid #000', paddingTop: '3px' }}>HR Officer</div>
                    </div>
                    <div style={{ textAlign: 'center', minWidth: '110px' }}>
                      <div style={{ marginBottom: '22px' }}>&nbsp;</div>
                      <div style={{ borderTop: '1px solid #000', paddingTop: '3px' }}>COO</div>
                    </div>
                    <div style={{ textAlign: 'center', minWidth: '110px' }}>
                      <div style={{ marginBottom: '22px' }}>&nbsp;</div>
                      <div style={{ borderTop: '1px solid #000', paddingTop: '3px' }}>CEO</div>
                    </div>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};
