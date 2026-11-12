import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { useToastStore } from '../../../stores/toastStore';
import type {
  OpsAdvanceBuilderResponse,
  OpsAdvanceBuilderRow,
  OpsAdvanceSheetItem,
} from '../api';
import {
  deleteOpsAdvanceSheet,
  fetchOpsAdvanceBuilder,
  fetchOpsAdvanceSheetDetail,
  fetchOpsAdvanceSheets,
  makeOpsAdvanceSheet,
  updateOpsAdvanceDraft,
} from '../api';

const fmtPkr = (val: number | string | undefined | null) =>
  `Rs ${Math.round(Number(val || 0)).toLocaleString('en-PK')}`;

const escapeHtml = (v: any) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

function printAdvanceSheetDocument(sheet: OpsAdvanceSheetItem) {
  const win = window.open('', '_blank', 'width=1100,height=850');
  if (!win) return;
  const branding = sheet.branding || {};
  const companyName = (branding.company_name || 'COMPANY').toUpperCase();
  const logoHtml = branding.logo_url
    ? `<img src="${escapeHtml(branding.logo_url)}" style="height:40px;object-fit:contain;margin-right:12px;" />`
    : '';
  const lines = sheet.lines || [];

  const rowsHtml = lines
    .map(
      (l) => `
      <tr>
        <td>${l.serial_no}</td>
        <td style="font-family:monospace;font-weight:700;">${escapeHtml(l.oss_code)}</td>
        <td style="text-align:left;font-weight:600;">${escapeHtml(l.employee_name)}</td>
        <td style="text-align:left;">${escapeHtml(l.location_deployed || 'Unassigned')}</td>
        <td style="text-align:right;font-family:monospace;font-weight:700;">${Math.round(Number(l.amount || 0)).toLocaleString('en-PK')}</td>
        <td style="font-weight:700;">${escapeHtml(l.payment_status)}</td>
        <td style="font-weight:700;">${l.deduction_status === 'CLEARED' ? 'Cleared' : 'Not Deducted Yet'}</td>
      </tr>`
    )
    .join('');

  const html = `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(sheet.sheet_number)} - ${escapeHtml(sheet.title)}</title>
      <style>
        @page { size: A4 portrait; margin: 8mm; }
        body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        table { width: 100%; border-collapse: collapse; font-size: 10.5px; page-break-inside: auto; }
        thead { display: table-header-group !important; }
        tbody { display: table-row-group !important; }
        tfoot { display: table-footer-group !important; }
        tr { page-break-inside: avoid !important; break-inside: avoid !important; }
        th, td { border: 1px solid #334155; padding: 5px 6px; text-align: center; }
        thead th { background: #f1f5f9 !important; font-weight: 700; }
        .banner-th { border: none !important; background: #fff !important; padding: 0 0 8px 0 !important; text-align: left !important; }
        .hdr-box { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 6px; }
        .sig-td { border: none !important; padding-top: 26px !important; }
      </style>
    </head>
    <body>
      <table>
        <thead>
          <tr>
            <th colspan="7" class="banner-th">
              <div class="hdr-box">
                <div style="display:flex;align-items:center;">
                  ${logoHtml}
                  <div>
                    <div style="font-size:14px;font-weight:800;">${escapeHtml(companyName)}</div>
                    <div style="font-size:12px;font-weight:700;">${escapeHtml(sheet.title)}</div>
                  </div>
                </div>
                <div style="text-align:right;font-size:10px;">
                  <div><strong>Sheet #:</strong> ${escapeHtml(sheet.sheet_number)}</div>
                  <div><strong>Month:</strong> ${escapeHtml(sheet.month)} (${escapeHtml(sheet.period_start)} to ${escapeHtml(sheet.period_end)})</div>
                </div>
              </div>
            </th>
          </tr>
          <tr>
            <th style="width:40px;">S#</th>
            <th style="width:80px;">Code</th>
            <th style="text-align:left;">Employee Name</th>
            <th style="text-align:left;">Location Deployed</th>
            <th style="text-align:right;width:105px;">Advance (PKR)</th>
            <th style="width:85px;">Finance Status</th>
            <th style="width:115px;">Salary Deduction</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
          <tr style="background:#f8fafc;font-weight:800;">
            <td colspan="4" style="text-align:right;">TOTAL REQUESTED (${lines.length} Employees):</td>
            <td style="text-align:right;font-family:monospace;">${Math.round(Number(sheet.total_requested_amount || 0)).toLocaleString('en-PK')}</td>
            <td colspan="2">Paid: Rs ${Math.round(Number(sheet.total_paid_amount || 0)).toLocaleString('en-PK')}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td colspan="7" class="sig-td">
              <div style="display:flex;justify-content:space-between;font-size:10.5px;font-weight:700;">
                <span>Prepared By (Ops): ${escapeHtml(sheet.prepared_by_name || 'Operations')}</span>
                <span>Finance Approval: _____________________</span>
                <span>Authorized Sign: _____________________</span>
              </div>
            </td>
          </tr>
        </tfoot>
      </table>
      <script>window.onload = function() { setTimeout(function() { window.print(); }, 250); };</script>
    </body>
  </html>`;
  win.document.write(html);
  win.document.close();
}

export const OperationsAdvanceSheetTab: React.FC = () => {
  const [subTab, setSubTab] = useState<'BUILDER' | 'SHEETS'>('BUILDER');
  const [selectedMonth, setSelectedMonth] = useState<string>('AUTO');
  const [searchQuery, setSearchQuery] = useState('');
  const [builderData, setBuilderData] = useState<OpsAdvanceBuilderResponse | null>(null);
  const [rows, setRows] = useState<OpsAdvanceBuilderRow[]>([]);
  const [loadingBuilder, setLoadingBuilder] = useState(false);
  const [makingSheet, setMakingSheet] = useState(false);

  const [sheets, setSheets] = useState<OpsAdvanceSheetItem[]>([]);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [activeSheet, setActiveSheet] = useState<OpsAdvanceSheetItem | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const loadBuilder = async (mParam?: string) => {
    setLoadingBuilder(true);
    try {
      const m = mParam ?? selectedMonth;
      const res = await fetchOpsAdvanceBuilder(m === 'AUTO' ? undefined : m);
      setBuilderData(res);
      setRows(res.rows || []);
      if (m === 'AUTO' && res.month) {
        setSelectedMonth(res.month);
      }
    } catch (err: any) {
      useToastStore.getState().error(err?.response?.data?.detail || 'Failed to load Advance Sheet builder.');
    } finally {
      setLoadingBuilder(false);
    }
  };

  const loadSheets = async () => {
    setLoadingSheets(true);
    try {
      const list = await fetchOpsAdvanceSheets();
      setSheets(list);
    } catch {
      useToastStore.getState().error('Failed to load Advance Sheets list.');
    } finally {
      setLoadingSheets(false);
    }
  };

  useEffect(() => {
    loadBuilder('AUTO');
    loadSheets();
  }, []);

  const handleMonthChange = (m: string) => {
    setSelectedMonth(m);
    loadBuilder(m);
  };

  const handleAmountChange = (empId: string, valStr: string) => {
    const cleanNum = Math.max(0, Math.round(Number(valStr) || 0));
    setRows((prev) =>
      prev.map((r) => (r.employee_id === empId ? { ...r, draft_amount: cleanNum } : r))
    );
  };

  const handleAmountBlur = async (row: OpsAdvanceBuilderRow) => {
    if (!builderData) return;
    try {
      await updateOpsAdvanceDraft({
        month: builderData.month,
        employee_id: row.employee_id,
        amount: row.draft_amount,
      });
    } catch {
      useToastStore.getState().error('Failed to save advance amount.');
    }
  };

  const handleMakeSheet = async () => {
    if (!builderData) return;
    const positiveRows = rows.filter((r) => r.draft_amount > 0);
    if (positiveRows.length === 0) {
      useToastStore.getState().error('Enter an Advance Amount (> 0) for at least one employee first.');
      return;
    }
    setMakingSheet(true);
    try {
      const created = await makeOpsAdvanceSheet({
        month: builderData.month,
        overrides: positiveRows.map((r) => ({
          employee_id: r.employee_id,
          amount: r.draft_amount,
        })),
      });
      useToastStore.getState().success(
        `Advance Sheet ${created.sheet_number} created and sent to Finance for approval!`
      );
      await Promise.all([loadBuilder(builderData.month), loadSheets()]);
      setActiveSheet(created);
      setSubTab('SHEETS');
    } catch (err: any) {
      useToastStore.getState().error(err?.response?.data?.detail || 'Failed to create Advance Sheet.');
    } finally {
      setMakingSheet(false);
    }
  };

  const openDetail = async (sheetId: string) => {
    setLoadingDetail(true);
    try {
      const detail = await fetchOpsAdvanceSheetDetail(sheetId);
      setActiveSheet(detail);
    } catch {
      useToastStore.getState().error('Failed to open Advance Sheet.');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleDeleteSheet = async (sheet: OpsAdvanceSheetItem) => {
    if (!window.confirm(`Delete Advance Sheet ${sheet.sheet_number} (${sheet.month})?`)) return;
    try {
      await deleteOpsAdvanceSheet(sheet.id);
      useToastStore.getState().success(`Deleted ${sheet.sheet_number}.`);
      if (activeSheet?.id === sheet.id) setActiveSheet(null);
      await Promise.all([loadSheets(), loadBuilder(sheet.month)]);
    } catch (err: any) {
      useToastStore.getState().error(err?.response?.data?.detail || 'Cannot delete Advance Sheet.');
    }
  };

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.oss_code.toLowerCase().includes(q) ||
        r.employee_name.toLowerCase().includes(q) ||
        r.location_deployed.toLowerCase().includes(q)
    );
  }, [rows, searchQuery]);

  const draftStats = useMemo(() => {
    const withDraft = rows.filter((r) => r.draft_amount > 0);
    return {
      count: withDraft.length,
      total: withDraft.reduce((s, r) => s + r.draft_amount, 0),
    };
  }, [rows]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Top Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px',
          padding: '14px 18px',
          borderRadius: '10px',
          border: '1px solid var(--color-border)',
          background: 'var(--color-surface)',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>
            Operations Monthly Advance Sheets
          </h2>
          <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: 'var(--color-text-muted)' }}>
            Location Deployed updates automatically from Present attendance. Enter advance amounts and generate monthly Advance Sheets for Finance approval &amp; disbursement.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setSubTab('BUILDER')}
            style={{
              padding: '8px 14px',
              borderRadius: '7px',
              border: '1px solid var(--color-border)',
              fontWeight: 700,
              fontSize: '12.5px',
              cursor: 'pointer',
              background: subTab === 'BUILDER' ? 'var(--color-primary)' : 'var(--color-surface-secondary)',
              color: subTab === 'BUILDER' ? '#fff' : 'var(--color-text)',
            }}
          >
            Enter Monthly Advances
          </button>
          <button
            type="button"
            onClick={() => {
              setSubTab('SHEETS');
              loadSheets();
            }}
            style={{
              padding: '8px 14px',
              borderRadius: '7px',
              border: '1px solid var(--color-border)',
              fontWeight: 700,
              fontSize: '12.5px',
              cursor: 'pointer',
              background: subTab === 'SHEETS' ? 'var(--color-primary)' : 'var(--color-surface-secondary)',
              color: subTab === 'SHEETS' ? '#fff' : 'var(--color-text)',
            }}
          >
            Monthly Advance Sheets ({sheets.length})
          </button>
        </div>
      </div>

      {/* SUBTAB 1: BUILDER */}
      {subTab === 'BUILDER' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '10px',
              padding: '12px 16px',
              borderRadius: '10px',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', display: 'block', marginBottom: '2px' }}>
                  Advance Month
                </span>
                <select
                  className="input-base"
                  style={{ minWidth: '140px', height: '34px', fontWeight: 700 }}
                  value={builderData?.month || selectedMonth}
                  onChange={(e) => handleMonthChange(e.target.value)}
                >
                  {(builderData?.available_months || [selectedMonth]).map((m) => (
                    <option key={m} value={m}>
                      {m} {m === builderData?.current_month ? '(Current)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', display: 'block', marginBottom: '2px' }}>
                  Search Code / Name / Location
                </span>
                <input
                  type="text"
                  className="input-base"
                  style={{ width: '250px', height: '34px' }}
                  placeholder="Search employee code, name, site..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div style={{ paddingTop: '16px' }}>
                <Button size="sm" variant="secondary" onClick={() => loadBuilder(selectedMonth)} loading={loadingBuilder}>
                  <i className="bx bx-refresh"></i>
                </Button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '12.5px', padding: '6px 12px', borderRadius: '6px', background: 'var(--color-surface-secondary)', border: '1px solid var(--color-border)' }}>
                New Draft: <strong>{draftStats.count}</strong> Emp &bull; <strong>{fmtPkr(draftStats.total)}</strong>
              </div>
              <Button
                variant="primary"
                onClick={handleMakeSheet}
                loading={makingSheet}
                disabled={draftStats.count === 0}
              >
                <i className="bx bx-send" style={{ marginRight: '6px' }}></i>
                Make Advance Sheet ({builderData?.month || selectedMonth})
              </Button>
            </div>
          </div>

          <div style={{ border: '1px solid var(--color-border)', borderRadius: '10px', overflow: 'auto', maxHeight: '600px', background: 'var(--color-surface)' }}>
            {loadingBuilder ? (
              <div style={{ padding: '44px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                Loading employees &amp; live attendance locations...
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--color-surface-secondary)', zIndex: 2 }}>
                  <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <th style={{ padding: '9px 12px', textAlign: 'center', width: '50px' }}>S#</th>
                    <th style={{ padding: '9px 12px', textAlign: 'left', width: '110px' }}>Employee Code</th>
                    <th style={{ padding: '9px 12px', textAlign: 'left' }}>Employee Name</th>
                    <th style={{ padding: '9px 12px', textAlign: 'left' }}>Location Deployed (Auto)</th>
                    <th style={{ padding: '9px 12px', textAlign: 'left' }}>Month Submitted Status</th>
                    <th style={{ padding: '9px 12px', textAlign: 'right', width: '170px' }}>Advance Amount (PKR)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.employee_id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '7px 12px', textAlign: 'center' }}>{row.serial_no}</td>
                      <td style={{ padding: '7px 12px', fontFamily: 'monospace', fontWeight: 700 }}>{row.oss_code}</td>
                      <td style={{ padding: '7px 12px', fontWeight: 600 }}>
                        <div>{row.employee_name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{row.designation_name}</div>
                      </td>
                      <td style={{ padding: '7px 12px' }}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: '6px',
                            fontSize: '11.5px',
                            fontWeight: 600,
                            background: row.location_deployed === 'Unassigned' ? 'var(--color-surface-secondary)' : 'rgba(16, 185, 129, 0.12)',
                            color: row.location_deployed === 'Unassigned' ? 'var(--color-text-muted)' : '#047857',
                          }}
                        >
                          {row.location_deployed}
                        </span>
                      </td>
                      <td style={{ padding: '7px 12px', fontSize: '11.5px' }}>
                        {row.submitted_total > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span>
                              Requested: <strong>{fmtPkr(row.submitted_total)}</strong> ({row.latest_payment_status})
                            </span>
                            <span style={{ color: row.latest_deduction_status === 'CLEARED' ? '#15803d' : '#b45309', fontWeight: 700 }}>
                              {row.latest_deduction_status === 'CLEARED' ? 'Cleared in Salary' : 'Not Deducted Yet'}
                            </span>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '7px 12px', textAlign: 'right' }}>
                        <input
                          type="number"
                          min="0"
                          step="100"
                          placeholder="0"
                          value={row.draft_amount || ''}
                          onChange={(e) => handleAmountChange(row.employee_id, e.target.value)}
                          onBlur={() => handleAmountBlur(row)}
                          style={{
                            width: '130px',
                            padding: '5px 8px',
                            textAlign: 'right',
                            fontWeight: 700,
                            borderRadius: '6px',
                            border: row.draft_amount > 0 ? '1.5px solid #0284c7' : '1px solid var(--color-border)',
                            background: 'var(--color-surface)',
                            color: 'var(--color-text)',
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* SUBTAB 2: SUBMITTED ADVANCE SHEETS */}
      {subTab === 'SHEETS' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {!activeSheet ? (
            <div style={{ border: '1px solid var(--color-border)', borderRadius: '10px', overflow: 'hidden', background: 'var(--color-surface)' }}>
              {loadingSheets ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading advance sheets...</div>
              ) : sheets.length === 0 ? (
                <div style={{ padding: '44px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  No Advance Sheets submitted yet.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: 'var(--color-surface-secondary)', borderBottom: '1px solid var(--color-border)' }}>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Sheet #</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Month</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Employees</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Requested</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Paid (Finance)</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Rejected</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Finance Status</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Cleared Count</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sheets.map((s) => (
                      <tr key={s.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 700 }}>{s.sheet_number}</td>
                        <td style={{ padding: '10px 12px', fontWeight: 700 }}>{s.month}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>{s.total_employees}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>{fmtPkr(s.total_requested_amount)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#15803d', fontWeight: 700 }}>{fmtPkr(s.total_paid_amount)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#b91c1c' }}>{fmtPkr(s.total_rejected_amount)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: 700, background: s.status === 'PROCESSED' ? '#dcfce7' : '#fef3c7', color: s.status === 'PROCESSED' ? '#15803d' : '#b45309' }}>
                            {s.status}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          {s.cleared_count ?? 0} / {s.paid_count ?? 0}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '6px' }}>
                            <Button size="sm" variant="primary" onClick={() => openDetail(s.id)} loading={loadingDetail}>
                              Open Sheet
                            </Button>
                            {Number(s.total_paid_amount || 0) <= 0 && (
                              <Button size="sm" variant="secondary" onClick={() => handleDeleteSheet(s)}>
                                Delete
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Button size="sm" variant="secondary" onClick={() => setActiveSheet(null)}>
                    &larr; Back to List
                  </Button>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '14px' }}>{activeSheet.sheet_number} &bull; {activeSheet.title}</div>
                    <div style={{ fontSize: '11.5px', color: 'var(--color-text-muted)' }}>
                      Requested: <strong>{fmtPkr(activeSheet.total_requested_amount)}</strong> &bull; Paid by Finance: <strong>{fmtPkr(activeSheet.total_paid_amount)}</strong>
                    </div>
                  </div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => printAdvanceSheetDocument(activeSheet)}>
                  <i className="bx bx-printer" style={{ marginRight: '5px' }}></i>
                  Print Advance Sheet
                </Button>
              </div>

              <div style={{ border: '1px solid var(--color-border)', borderRadius: '10px', overflow: 'auto', background: 'var(--color-surface)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                  <thead>
                    <tr style={{ background: 'var(--color-surface-secondary)', borderBottom: '1px solid var(--color-border)' }}>
                      <th style={{ padding: '9px 12px', textAlign: 'center' }}>S#</th>
                      <th style={{ padding: '9px 12px', textAlign: 'left' }}>Employee Code</th>
                      <th style={{ padding: '9px 12px', textAlign: 'left' }}>Employee Name</th>
                      <th style={{ padding: '9px 12px', textAlign: 'left' }}>Location Deployed</th>
                      <th style={{ padding: '9px 12px', textAlign: 'right' }}>Advance Amount</th>
                      <th style={{ padding: '9px 12px', textAlign: 'center' }}>Finance Approval Status</th>
                      <th style={{ padding: '9px 12px', textAlign: 'center' }}>Salary Deduction Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(activeSheet.lines || []).map((ln) => (
                      <tr key={ln.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>{ln.serial_no}</td>
                        <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontWeight: 700 }}>{ln.oss_code}</td>
                        <td style={{ padding: '8px 12px', fontWeight: 600 }}>{ln.employee_name}</td>
                        <td style={{ padding: '8px 12px' }}>{ln.location_deployed}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>{fmtPkr(ln.amount)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '99px',
                              fontSize: '11px',
                              fontWeight: 700,
                              background: ln.payment_status === 'PAID' ? '#dcfce7' : ln.payment_status === 'REJECTED' ? '#fee2e2' : '#fef3c7',
                              color: ln.payment_status === 'PAID' ? '#15803d' : ln.payment_status === 'REJECTED' ? '#b91c1c' : '#b45309',
                            }}
                          >
                            {ln.payment_status}
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          {ln.payment_status === 'REJECTED' ? (
                            <span style={{ fontSize: '11.5px', color: 'var(--color-text-muted)' }}>Rejected (Not Applicable)</span>
                          ) : (
                            <span
                              style={{
                                padding: '2px 8px',
                                borderRadius: '99px',
                                fontSize: '11px',
                                fontWeight: 700,
                                background: ln.deduction_status === 'CLEARED' ? '#dcfce7' : '#e0f2fe',
                                color: ln.deduction_status === 'CLEARED' ? '#15803d' : '#0369a1',
                              }}
                            >
                              {ln.deduction_status === 'CLEARED' ? `CLEARED${ln.cleared_in_sheet_number ? ` (${ln.cleared_in_sheet_number})` : ''}` : 'NOT DEDUCTED YET'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

