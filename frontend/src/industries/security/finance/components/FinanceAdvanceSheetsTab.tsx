import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '../../../../components/ui/Button';
import { useToastStore } from '../../../../stores/toastStore';
import type {
  AdvanceSheetItem,
  AdvanceSheetLineItem,
  BankAccount,
} from '../api';
import {
  fetchBankAccounts,
  fetchFinanceAdvanceSheetDetail,
  fetchFinanceAdvanceSheets,
  processAdvanceSheetLines,
} from '../api';

const fmtPkr = (val: number | string | undefined | null) =>
  `Rs ${Math.round(Number(val || 0)).toLocaleString('en-PK')}`;

const escapeHtml = (v: any) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

function printFinanceAdvanceSheet(sheet: AdvanceSheetItem) {
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

  win.document.write(`<!doctype html>
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
                  <div><strong>Month:</strong> ${escapeHtml(sheet.month)}</div>
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
            <td colspan="4" style="text-align:right;">TOTAL REQUESTED (${lines.length}):</td>
            <td style="text-align:right;font-family:monospace;">${Math.round(Number(sheet.total_requested_amount || 0)).toLocaleString('en-PK')}</td>
            <td colspan="2">Paid: Rs ${Math.round(Number(sheet.total_paid_amount || 0)).toLocaleString('en-PK')}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td colspan="7" class="sig-td">
              <div style="display:flex;justify-content:space-between;font-size:10.5px;font-weight:700;">
                <span>Prepared By (Ops): ${escapeHtml(sheet.prepared_by_name || 'Operations')}</span>
                <span>Finance Officer: _____________________</span>
                <span>Approved By: _____________________</span>
              </div>
            </td>
          </tr>
        </tfoot>
      </table>
      <script>window.onload = function() { setTimeout(function() { window.print(); }, 250); };</script>
    </body>
  </html>`);
  win.document.close();
}

export const FinanceAdvanceSheetsTab: React.FC = () => {
  const [sheets, setSheets] = useState<AdvanceSheetItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [activeSheet, setActiveSheet] = useState<AdvanceSheetItem | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});

  // Pay Modal
  const [showPayModal, setShowPayModal] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [treasuryAccountId, setTreasuryAccountId] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [paymentReference, setPaymentReference] = useState('');
  const [processing, setProcessing] = useState(false);

  const loadList = async () => {
    setLoadingList(true);
    try {
      const list = await fetchFinanceAdvanceSheets();
      setSheets(list);
    } catch {
      useToastStore.getState().error('Failed to load Advance Sheets.');
    } finally {
      setLoadingList(false);
    }
  };

  const loadBanks = async () => {
    try {
      const banks = await fetchBankAccounts();
      setBankAccounts(banks);
      if (banks.length > 0 && !treasuryAccountId) {
        setTreasuryAccountId(banks[0].id);
      }
    } catch {
      // non-blocking
    }
  };

  useEffect(() => {
    loadList();
    loadBanks();
  }, []);

  const openSheet = async (id: string) => {
    setLoadingDetail(true);
    setSelectedIds({});
    try {
      const detail = await fetchFinanceAdvanceSheetDetail(id);
      setActiveSheet(detail);
    } catch {
      useToastStore.getState().error('Failed to load Advance Sheet details.');
    } finally {
      setLoadingDetail(false);
    }
  };

  const pendingLines = useMemo(
    () => (activeSheet?.lines || []).filter((l) => l.payment_status === 'PENDING'),
    [activeSheet]
  );

  const filteredLines = useMemo(() => {
    const lines = activeSheet?.lines || [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return lines;
    return lines.filter(
      (l) =>
        (l.oss_code || '').toLowerCase().includes(q) ||
        (l.employee_name || '').toLowerCase().includes(q) ||
        (l.location_deployed || '').toLowerCase().includes(q)
    );
  }, [activeSheet, searchQuery]);

  const checkedIds = useMemo(
    () => Object.keys(selectedIds).filter((id) => selectedIds[id]),
    [selectedIds]
  );

  const targetCount = checkedIds.length > 0 ? checkedIds.length : pendingLines.length;
  const targetAmount = useMemo(() => {
    const src = checkedIds.length > 0
      ? pendingLines.filter((l) => selectedIds[l.id])
      : pendingLines;
    return src.reduce((sum, l) => sum + Number(l.amount || 0), 0);
  }, [pendingLines, checkedIds, selectedIds]);

  const toggleAllPending = () => {
    if (checkedIds.length === pendingLines.length) {
      setSelectedIds({});
    } else {
      const next: Record<string, boolean> = {};
      pendingLines.forEach((l) => {
        next[l.id] = true;
      });
      setSelectedIds(next);
    }
  };

  const handlePaySubmit = async () => {
    if (!activeSheet || targetCount === 0) return;
    setProcessing(true);
    try {
      const res = await processAdvanceSheetLines(activeSheet.id, {
        action: 'PAY',
        line_ids: checkedIds.length > 0 ? checkedIds : pendingLines.map((l) => l.id),
        treasury_account_id: treasuryAccountId || undefined,
        payment_date: paymentDate,
        payment_reference: paymentReference,
      });
      useToastStore.getState().success(res.message);
      setShowPayModal(false);
      setPaymentReference('');
      setSelectedIds({});
      await Promise.all([openSheet(activeSheet.id), loadList()]);
    } catch (err: any) {
      useToastStore.getState().error(err?.response?.data?.detail || 'Advance payment failed.');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!activeSheet || targetCount === 0) return;
    const reason = window.prompt(
      `Enter rejection reason for ${targetCount} selected advance(s):`,
      'Rejected by Finance'
    );
    if (reason === null) return;
    setProcessing(true);
    try {
      const res = await processAdvanceSheetLines(activeSheet.id, {
        action: 'REJECT',
        line_ids: checkedIds.length > 0 ? checkedIds : pendingLines.map((l) => l.id),
        rejection_reason: reason,
      });
      useToastStore.getState().success(res.message);
      setSelectedIds({});
      await Promise.all([openSheet(activeSheet.id), loadList()]);
    } catch (err: any) {
      useToastStore.getState().error(err?.response?.data?.detail || 'Reject failed.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', padding: '14px 18px', borderRadius: '10px', border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>
            Advance Sheets (Submitted by Operations)
          </h2>
          <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: 'var(--color-text-muted)' }}>
            Uneditable monthly advance sheets created by Operations. Approve &amp; Pay selected or all requests from Treasury — paid advances deduct automatically in the corresponding month&apos;s Salary Sheet.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={loadList} loading={loadingList}>
          <i className="bx bx-refresh" style={{ marginRight: '5px' }}></i>
          Refresh
        </Button>
      </div>

      {!activeSheet ? (
        <div style={{ border: '1px solid var(--color-border)', borderRadius: '10px', overflow: 'hidden', background: 'var(--color-surface)' }}>
          {loadingList ? (
            <div style={{ padding: '44px', textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading Advance Sheets...</div>
          ) : sheets.length === 0 ? (
            <div style={{ padding: '44px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
              No Advance Sheets submitted from Operations yet.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--color-surface-secondary)', borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Sheet #</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Month</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Prepared By (Ops)</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>Employees</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Requested</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Paid</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Rejected</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>Pending</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {sheets.map((s) => (
                  <tr key={s.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 700 }}>{s.sheet_number}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 700 }}>{s.month}</td>
                    <td style={{ padding: '10px 12px', fontSize: '12px' }}>{s.prepared_by_name || 'Operations'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>{s.total_employees}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>{fmtPkr(s.total_requested_amount)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#15803d', fontWeight: 700 }}>{fmtPkr(s.total_paid_amount)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#b91c1c' }}>{fmtPkr(s.total_rejected_amount)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700 }}>{s.pending_count ?? 0}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: 700, background: s.status === 'PROCESSED' ? '#dcfce7' : '#fef3c7', color: s.status === 'PROCESSED' ? '#15803d' : '#b45309' }}>
                        {s.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <Button size="sm" variant="primary" onClick={() => openSheet(s.id)} loading={loadingDetail}>
                        Open &amp; Review
                      </Button>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <Button size="sm" variant="secondary" onClick={() => setActiveSheet(null)}>
                &larr; Back to Advance Sheets
              </Button>
              <div>
                <div style={{ fontWeight: 800, fontSize: '14px' }}>{activeSheet.sheet_number} &bull; {activeSheet.title}</div>
                <div style={{ fontSize: '11.5px', color: 'var(--color-text-muted)' }}>
                  Uneditable Operations Sheet &bull; Prepared By: <strong>{activeSheet.prepared_by_name || 'Operations'}</strong> &bull; Pending: <strong>{pendingLines.length}</strong>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <input
                type="text"
                className="input-base"
                style={{ width: '210px', height: '32px' }}
                placeholder="Search code, name, site..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <Button size="sm" variant="secondary" onClick={() => printFinanceAdvanceSheet(activeSheet)}>
                <i className="bx bx-printer" style={{ marginRight: '5px' }}></i>
                Print Sheet
              </Button>
              {pendingLines.length > 0 && (
                <>
                  <Button size="sm" variant="secondary" onClick={handleReject} loading={processing}>
                    Reject ({targetCount})
                  </Button>
                  <Button size="sm" variant="primary" onClick={() => setShowPayModal(true)} loading={processing}>
                    <i className="bx bx-check-circle" style={{ marginRight: '5px' }}></i>
                    Approve &amp; Pay ({targetCount} &bull; {fmtPkr(targetAmount)})
                  </Button>
                </>
              )}
            </div>
          </div>

          <div style={{ border: '1px solid var(--color-border)', borderRadius: '10px', overflow: 'auto', maxHeight: '600px', background: 'var(--color-surface)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--color-surface-secondary)', zIndex: 2 }}>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '9px 10px', textAlign: 'center', width: '40px' }}>
                    <input
                      type="checkbox"
                      checked={pendingLines.length > 0 && checkedIds.length === pendingLines.length}
                      onChange={toggleAllPending}
                      disabled={pendingLines.length === 0}
                    />
                  </th>
                  <th style={{ padding: '9px 10px', textAlign: 'center' }}>S#</th>
                  <th style={{ padding: '9px 10px', textAlign: 'left' }}>Employee Code</th>
                  <th style={{ padding: '9px 10px', textAlign: 'left' }}>Employee Name</th>
                  <th style={{ padding: '9px 10px', textAlign: 'left' }}>Location Deployed</th>
                  <th style={{ padding: '9px 10px', textAlign: 'right' }}>Advance Amount</th>
                  <th style={{ padding: '9px 10px', textAlign: 'center' }}>Finance Status</th>
                  <th style={{ padding: '9px 10px', textAlign: 'center' }}>Salary Deduction</th>
                  <th style={{ padding: '9px 10px', textAlign: 'left' }}>Voucher / Ref</th>
                </tr>
              </thead>
              <tbody>
                {filteredLines.map((ln: AdvanceSheetLineItem) => {
                  const isPending = ln.payment_status === 'PENDING';
                  return (
                    <tr key={ln.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          disabled={!isPending}
                          checked={!!selectedIds[ln.id]}
                          onChange={(e) =>
                            setSelectedIds((prev) => ({ ...prev, [ln.id]: e.target.checked }))
                          }
                        />
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>{ln.serial_no}</td>
                      <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 700 }}>{ln.oss_code}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 600 }}>{ln.employee_name}</td>
                      <td style={{ padding: '8px 10px' }}>{ln.location_deployed}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800 }}>{fmtPkr(ln.amount)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
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
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        {ln.payment_status === 'REJECTED' ? (
                          <span style={{ fontSize: '11.5px', color: 'var(--color-text-muted)' }}>Rejected</span>
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
                      <td style={{ padding: '8px 10px', fontSize: '11.5px', color: 'var(--color-text-muted)' }}>
                        {ln.voucher_number ? `${ln.voucher_number} (${ln.payment_reference || ''})` : ln.rejection_reason || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pay Modal */}
      {showPayModal && activeSheet && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ width: '100%', maxWidth: '460px', background: 'var(--color-surface)', borderRadius: '10px', border: '1px solid var(--color-border)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>
              Approve &amp; Pay Advances — {activeSheet.sheet_number}
            </h3>
            <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--color-text-muted)' }}>
              Disbursing <strong>{fmtPkr(targetAmount)}</strong> to <strong>{targetCount}</strong> employee(s). Deducts immediately from selected Treasury Bank/Cash Account and schedules payroll deduction for <strong>{activeSheet.month}</strong>.
            </p>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                Treasury Bank / Cash Account *
              </label>
              <select className="input-base" value={treasuryAccountId} onChange={(e) => setTreasuryAccountId(e.target.value)}>
                {bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.account_title} ({b.account_type}) — Bal: {Number(b.current_balance || 0).toLocaleString()}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                Payment Date *
              </label>
              <input type="date" className="input-base" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                Payment Reference
              </label>
              <input type="text" className="input-base" placeholder="e.g. ADV-REF-001" value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
              <Button variant="secondary" onClick={() => setShowPayModal(false)} disabled={processing}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handlePaySubmit} loading={processing}>
                Confirm Payment &amp; Deduct Treasury
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

