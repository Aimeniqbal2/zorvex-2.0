import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '../../../../components/ui/Button';
import { useToastStore } from '../../../../stores/toastStore';
import type {
  BankAccount,
  FinancePaymentMode,
  LiveSalarySheetResponse,
  LiveSalarySheetRow,
  SalarySheetItem,
  SalarySheetLineItem,
} from '../api';
import {
  deleteSalarySheet,
  fetchBankAccounts,
  fetchFinancePaymentModes,
  fetchLiveSalarySheet,
  fetchSalarySheetDetail,
  fetchSalarySheets,
  makeSalarySheet,
  paySalarySheetLines,
  toggleSalaryLineHold,
  updateSalaryDraftLine,
} from '../api';
import { PaymentModesModal } from './PaymentModesModal';
import { SalarySheetPrintModal } from './SalarySheetPrintModal';

const fmtInt = (val: number | string | undefined | null) =>
  Math.round(Number(val || 0)).toLocaleString('en-PK');

const fmtPkr = (val: number | string | undefined | null) =>
  `Rs ${Math.round(Number(val || 0)).toLocaleString('en-PK')}`;

interface SalarySheetWorkspaceProps {
  onOpenGlMappings?: () => void;
}

export const SalarySheetWorkspace: React.FC<SalarySheetWorkspaceProps> = ({
  onOpenGlMappings,
}) => {
  const [viewMode, setViewMode] = useState<'BUILDER' | 'SHEETS'>('BUILDER');
  const [selectedMonth, setSelectedMonth] = useState<string>('AUTO');
  const [searchQuery, setSearchQuery] = useState('');
  const [liveData, setLiveData] = useState<LiveSalarySheetResponse | null>(null);
  const [rows, setRows] = useState<LiveSalarySheetRow[]>([]);
  const [loadingLive, setLoadingLive] = useState(false);
  const [creatingSheet, setCreatingSheet] = useState(false);

  const [paymentModes, setPaymentModes] = useState<FinancePaymentMode[]>([]);
  const [showPaymentModesModal, setShowPaymentModesModal] = useState(false);

  // Generated Sheets List & Detail Viewer
  const [sheets, setSheets] = useState<SalarySheetItem[]>([]);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [activeSheet, setActiveSheet] = useState<SalarySheetItem | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [sheetSearch, setSheetSearch] = useState('');
  const [selectedLineIds, setSelectedLineIds] = useState<Record<string, boolean>>({});
  const [printSheet, setPrintSheet] = useState<SalarySheetItem | null>(null);

  // Pay Modal State
  const [showPayModal, setShowPayModal] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [treasuryAccountId, setTreasuryAccountId] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [paymentReference, setPaymentReference] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [paying, setPaying] = useState(false);

  const loadLivePreview = async (monthParam?: string) => {
    setLoadingLive(true);
    try {
      const m = monthParam ?? selectedMonth;
      const data = await fetchLiveSalarySheet(m === 'AUTO' ? undefined : m);
      setLiveData(data);
      setRows(data.rows || []);
      if (m === 'AUTO' && data.month) {
        setSelectedMonth(data.month);
      }
    } catch (err: any) {
      useToastStore.getState().error(err?.response?.data?.detail || 'Failed to load live salary sheet.');
    } finally {
      setLoadingLive(false);
    }
  };

  const loadSheetsList = async () => {
    setLoadingSheets(true);
    try {
      const list = await fetchSalarySheets();
      setSheets(list);
    } catch (err: any) {
      useToastStore.getState().error('Failed to load generated salary sheets.');
    } finally {
      setLoadingSheets(false);
    }
  };

  const loadModesAndBanks = async () => {
    try {
      const [mList, bList] = await Promise.all([
        fetchFinancePaymentModes(),
        fetchBankAccounts(),
      ]);
      setPaymentModes(mList);
      setBankAccounts(bList);
      if (bList.length > 0 && !treasuryAccountId) {
        setTreasuryAccountId(bList[0].id);
      }
    } catch {
      // non-blocking
    }
  };

  useEffect(() => {
    loadLivePreview('AUTO');
    loadSheetsList();
    loadModesAndBanks();
  }, []);

  const handleMonthChange = (newMonth: string) => {
    setSelectedMonth(newMonth);
    loadLivePreview(newMonth);
  };

  // Recomputes row client-side immediately on toggle/fine edit so totals are instant
  const recomputeRow = (r: LiveSalarySheetRow, patch: Partial<LiveSalarySheetRow>): LiveSalarySheetRow => {
    const crm = liveData?.crm_rules;
    const updated: LiveSalarySheetRow = { ...r, ...patch };
    const fourAmt = updated.four_hrs_ot_enabled ? Math.round(crm?.four_hrs_ot_amount ?? 1000) : 0;
    const siteAmt = updated.site_allowance_enabled ? Math.round(crm?.site_allowance_amount ?? 1000) : 0;
    const totalSalary = Math.round(updated.basic_salary + fourAmt + siteAmt);

    let prorated = 0;
    if (updated.paid_shifts > 0) {
      if (updated.paid_shifts === updated.total_shifts) {
        prorated = totalSalary;
      } else {
        prorated = Math.round((totalSalary / updated.total_shifts) * updated.paid_shifts);
      }
    }
    const gross = Math.round(prorated + updated.overtime_payable);

    // Recompute % deductions if location enabled Admin / Insurance
    const adminAmt =
      updated.admin_charges_enabled && updated.paid_shifts > 0 && totalSalary > 0
        ? (r.total_salary > 0
            ? Math.round((r.admin_charges / r.total_salary) * totalSalary)
            : Math.round(totalSalary * ((crm?.admin_charges_percentage ?? 5) / 100)))
        : 0;
    const insAmt =
      updated.insurance_enabled && updated.paid_shifts > 0 && totalSalary > 0
        ? (r.total_salary > 0
            ? Math.round((r.insurance_amount / r.total_salary) * totalSalary)
            : Math.round(totalSalary * ((crm?.insurance_percentage ?? 2) / 100)))
        : 0;

    const totalDed = Math.round(
      updated.doc_charges +
        updated.eobi_amount +
        adminAmt +
        updated.fine_amount +
        insAmt +
        updated.advance_amount +
        updated.other_deductions
    );
    const net = Math.round(gross - totalDed);

    return {
      ...updated,
      four_hrs_ot_amount: fourAmt,
      site_allowance_amount: siteAmt,
      total_salary: totalSalary,
      prorated_salary: prorated,
      gross_salary_payable: gross,
      admin_charges: adminAmt,
      insurance_amount: insAmt,
      total_deduction: totalDed,
      net_salary_payable: net,
    };
  };

  const handleToggleAllowance = async (
    row: LiveSalarySheetRow,
    field: 'four_hrs_ot_enabled' | 'site_allowance_enabled'
  ) => {
    if (!liveData) return;
    const nextVal = !row[field];
    setRows((prev) => prev.map((r) => (r.employee_id === row.employee_id ? recomputeRow(r, { [field]: nextVal }) : r)));
    try {
      await updateSalaryDraftLine({
        month: liveData.month,
        employee_id: row.employee_id,
        [field]: nextVal,
      });
    } catch {
      useToastStore.getState().error('Failed to save switch state.');
    }
  };

  const handleFineChange = (row: LiveSalarySheetRow, rawVal: string) => {
    const manualFine = Math.max(0, Math.round(Number(rawVal) || 0));
    const fixedOtherFine = Math.max(0, Math.round(row.fine_amount - row.manual_fine_amount));
    const totalFine = manualFine + fixedOtherFine;
    setRows((prev) =>
      prev.map((r) =>
        r.employee_id === row.employee_id
          ? recomputeRow(r, { manual_fine_amount: manualFine, fine_amount: totalFine })
          : r
      )
    );
  };

  const handleFineBlur = async (row: LiveSalarySheetRow) => {
    if (!liveData) return;
    try {
      await updateSalaryDraftLine({
        month: liveData.month,
        employee_id: row.employee_id,
        fine_amount: row.manual_fine_amount,
      });
    } catch {
      useToastStore.getState().error('Failed to save fine amount.');
    }
  };

  const handleModeChange = async (row: LiveSalarySheetRow, modeIdOrName: string) => {
    if (!liveData) return;
    const matched = paymentModes.find((m) => m.id === modeIdOrName || m.name === modeIdOrName);
    const modeId = matched ? matched.id : null;
    const modeName = matched ? matched.name : modeIdOrName;
    setRows((prev) =>
      prev.map((r) =>
        r.employee_id === row.employee_id ? { ...r, payment_mode_id: modeId, mode_of_payment: modeName } : r
      )
    );
    try {
      await updateSalaryDraftLine({
        month: liveData.month,
        employee_id: row.employee_id,
        payment_mode_id: modeId,
        mode_of_payment: modeName,
      });
    } catch {
      useToastStore.getState().error('Failed to save payment mode.');
    }
  };

  const handleMakeSalarySheet = async () => {
    if (!liveData) return;
    if (liveData.has_generated_sheet) {
      useToastStore.getState().info(`Salary sheet ${liveData.existing_sheet_number} already exists for ${liveData.month}.`);
      setViewMode('SHEETS');
      if (liveData.existing_sheet_id) {
        openSheetDetail(liveData.existing_sheet_id);
      }
      return;
    }
    if (rows.length === 0) {
      useToastStore.getState().error('No employee rows to generate a salary sheet.');
      return;
    }
    setCreatingSheet(true);
    try {
      const overrides = rows.map((r) => ({
        employee_id: r.employee_id,
        four_hrs_ot_enabled: r.four_hrs_ot_enabled,
        site_allowance_enabled: r.site_allowance_enabled,
        fine_amount: r.manual_fine_amount,
        payment_mode_id: r.payment_mode_id,
        mode_of_payment: r.mode_of_payment,
      }));
      const created = await makeSalarySheet({ month: liveData.month, overrides });
      useToastStore.getState().success(`Salary Sheet ${created.sheet_number} created for ${created.month}!`);
      await Promise.all([loadLivePreview(liveData.month), loadSheetsList()]);
      setActiveSheet(created);
      setViewMode('SHEETS');
    } catch (err: any) {
      useToastStore.getState().error(err?.response?.data?.detail || 'Failed to generate salary sheet.');
    } finally {
      setCreatingSheet(false);
    }
  };

  const openSheetDetail = async (sheetId: string) => {
    setLoadingDetail(true);
    setSelectedLineIds({});
    try {
      const detail = await fetchSalarySheetDetail(sheetId);
      setActiveSheet(detail);
    } catch (err: any) {
      useToastStore.getState().error('Failed to load salary sheet details.');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleDeleteSheet = async (sheet: SalarySheetItem) => {
    if (
      !window.confirm(
        `Delete Salary Sheet ${sheet.sheet_number} (${sheet.month})? You can then adjust entries and regenerate it.`
      )
    ) {
      return;
    }
    try {
      await deleteSalarySheet(sheet.id);
      useToastStore.getState().success(`Deleted ${sheet.sheet_number}.`);
      if (activeSheet?.id === sheet.id) setActiveSheet(null);
      await Promise.all([loadSheetsList(), loadLivePreview(sheet.month)]);
    } catch (err: any) {
      useToastStore.getState().error(err?.response?.data?.detail || 'Cannot delete salary sheet.');
    }
  };

  const handleToggleHold = async (line: SalarySheetLineItem) => {
    if (!activeSheet) return;
    let reason = line.stop_payment_reason || '';
    if (!line.is_stop_payment) {
      const promptReason = window.prompt('Optional hold reason (or leave blank):', 'Verification Pending');
      if (promptReason === null) return;
      reason = promptReason;
    }
    try {
      const res = await toggleSalaryLineHold(line.id, reason);
      setActiveSheet((prev) =>
        prev
          ? {
              ...prev,
              lines: (prev.lines || []).map((l) =>
                l.id === line.id
                  ? { ...l, is_stop_payment: res.is_stop_payment, stop_payment_reason: res.stop_payment_reason }
                  : l
              ),
            }
          : null
      );
      useToastStore.getState().success(res.is_stop_payment ? 'Employee marked ON HOLD.' : 'Hold released.');
    } catch (err: any) {
      useToastStore.getState().error(err?.response?.data?.detail || 'Failed to update hold status.');
    }
  };

  const handleConfirmPayLines = async () => {
    if (!activeSheet) return;
    const checkedIds = Object.keys(selectedLineIds).filter((id) => selectedLineIds[id]);
    setPaying(true);
    try {
      const res = await paySalarySheetLines(activeSheet.id, {
        line_ids: checkedIds.length > 0 ? checkedIds : undefined,
        treasury_account_id: treasuryAccountId || undefined,
        payment_date: paymentDate,
        payment_reference: paymentReference,
        notes: payNotes,
      });
      useToastStore.getState().success(res.message);
      setShowPayModal(false);
      setPaymentReference('');
      setPayNotes('');
      await Promise.all([openSheetDetail(activeSheet.id), loadSheetsList()]);
    } catch (err: any) {
      useToastStore.getState().error(err?.response?.data?.detail || 'Salary payment failed.');
    } finally {
      setPaying(false);
    }
  };

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.oss_code.toLowerCase().includes(q) ||
        r.employee_name.toLowerCase().includes(q) ||
        r.locations_text.toLowerCase().includes(q) ||
        r.cnic_number.toLowerCase().includes(q)
    );
  }, [rows, searchQuery]);

  const liveTotals = useMemo(() => {
    return filteredRows.reduce(
      (acc, r) => {
        acc.basic += r.basic_salary;
        acc.fourOt += r.four_hrs_ot_amount;
        acc.siteAll += r.site_allowance_amount;
        acc.totalSal += r.total_salary;
        acc.prorated += r.prorated_salary;
        acc.otPay += r.overtime_payable;
        acc.gross += r.gross_salary_payable;
        acc.doc += r.doc_charges;
        acc.eobi += r.eobi_amount;
        acc.admin += r.admin_charges;
        acc.fine += r.fine_amount;
        acc.ins += r.insurance_amount;
        acc.adv += r.advance_amount;
        acc.ded += r.total_deduction;
        acc.net += r.net_salary_payable;
        return acc;
      },
      {
        basic: 0,
        fourOt: 0,
        siteAll: 0,
        totalSal: 0,
        prorated: 0,
        otPay: 0,
        gross: 0,
        doc: 0,
        eobi: 0,
        admin: 0,
        fine: 0,
        ins: 0,
        adv: 0,
        ded: 0,
        net: 0,
      }
    );
  }, [filteredRows]);

  const filteredSheetLines = useMemo(() => {
    const allLines = activeSheet?.lines || [];
    const q = sheetSearch.trim().toLowerCase();
    if (!q) return allLines;
    return allLines.filter(
      (l) =>
        (l.oss_code || '').toLowerCase().includes(q) ||
        (l.employee_name || '').toLowerCase().includes(q) ||
        (l.locations_text || '').toLowerCase().includes(q) ||
        (l.cnic_number || '').toLowerCase().includes(q)
    );
  }, [activeSheet, sheetSearch]);

  const selectedUnpaidCount = useMemo(() => {
    if (!activeSheet?.lines) return 0;
    const ids = Object.keys(selectedLineIds).filter((k) => selectedLineIds[k]);
    if (ids.length > 0) return ids.length;
    return activeSheet.lines.filter((l) => l.payment_status === 'UNPAID' && !l.is_stop_payment && Number(l.net_salary_payable) > 0).length;
  }, [activeSheet, selectedLineIds]);

  const thBase: React.CSSProperties = {
    border: '1px solid var(--color-border)',
    padding: '6px 7px',
    fontSize: '10.5px',
    fontWeight: 700,
    textAlign: 'center',
    whiteSpace: 'nowrap',
    background: 'var(--color-surface-secondary)',
  };

  const tdBase: React.CSSProperties = {
    border: '1px solid var(--color-border)',
    padding: '5px 7px',
    fontSize: '11.5px',
    textAlign: 'center',
    whiteSpace: 'nowrap',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Top Action Header */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setViewMode('BUILDER')}
            style={{
              padding: '7px 14px',
              borderRadius: '7px',
              border: '1px solid var(--color-border)',
              fontWeight: 700,
              fontSize: '12.5px',
              cursor: 'pointer',
              background: viewMode === 'BUILDER' ? 'var(--color-primary)' : 'var(--color-surface-secondary)',
              color: viewMode === 'BUILDER' ? '#fff' : 'var(--color-text)',
            }}
          >
            <i className="bx bx-spreadsheet" style={{ marginRight: '6px' }}></i>
            Monthly Salary Builder
          </button>
          <button
            type="button"
            onClick={() => {
              setViewMode('SHEETS');
              loadSheetsList();
            }}
            style={{
              padding: '7px 14px',
              borderRadius: '7px',
              border: '1px solid var(--color-border)',
              fontWeight: 700,
              fontSize: '12.5px',
              cursor: 'pointer',
              background: viewMode === 'SHEETS' ? 'var(--color-primary)' : 'var(--color-surface-secondary)',
              color: viewMode === 'SHEETS' ? '#fff' : 'var(--color-text)',
            }}
          >
            <i className="bx bx-archive" style={{ marginRight: '6px' }}></i>
            Generated Salary Sheets ({sheets.length})
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <Button size="sm" variant="secondary" onClick={() => setShowPaymentModesModal(true)}>
            <i className="bx bx-credit-card" style={{ marginRight: '5px' }}></i>
            Manage Payment Modes
          </Button>
          {onOpenGlMappings && (
            <Button size="sm" variant="secondary" onClick={onOpenGlMappings}>
              <i className="bx bx-git-branch" style={{ marginRight: '5px' }}></i>
              GL Mappings
            </Button>
          )}
        </div>
      </div>

      {/* VIEW 1: MONTHLY SALARY BUILDER */}
      {viewMode === 'BUILDER' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Filter + Make Sheet Bar */}
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
                  Payroll Month
                </span>
                <select
                  className="input-base"
                  style={{ minWidth: '150px', height: '34px', fontWeight: 700 }}
                  value={liveData?.month || selectedMonth}
                  onChange={(e) => handleMonthChange(e.target.value)}
                >
                  {(liveData?.available_months || [selectedMonth]).map((m) => (
                    <option key={m} value={m}>
                      {m} {m === liveData?.previous_month ? '(Last Month)' : m === liveData?.current_month ? '(Current)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', display: 'block', marginBottom: '2px' }}>
                  Search Employee / Site / CNIC
                </span>
                <input
                  type="text"
                  className="input-base"
                  style={{ width: '240px', height: '34px' }}
                  placeholder="OSS code, name, site, CNIC..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div style={{ paddingTop: '16px' }}>
                <Button size="sm" variant="secondary" onClick={() => loadLivePreview(selectedMonth)} loading={loadingLive}>
                  <i className="bx bx-refresh"></i>
                </Button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {liveData && (
                <div style={{ fontSize: '11.5px', color: 'var(--color-text-muted)', padding: '6px 10px', borderRadius: '6px', background: 'var(--color-surface-secondary)', border: '1px solid var(--color-border)' }}>
                  CRM Rules: <strong>4h OT {fmtPkr(liveData.crm_rules.four_hrs_ot_amount)}</strong> &bull;{' '}
                  <strong>Site Allow {fmtPkr(liveData.crm_rules.site_allowance_amount)}</strong> &bull;{' '}
                  <strong>{liveData.days_in_month} Days</strong>
                </div>
              )}

              {liveData?.has_generated_sheet ? (
                <Button
                  variant="primary"
                  onClick={() => {
                    setViewMode('SHEETS');
                    if (liveData.existing_sheet_id) openSheetDetail(liveData.existing_sheet_id);
                  }}
                >
                  <i className="bx bx-check-shield" style={{ marginRight: '6px' }}></i>
                  Open Sheet ({liveData.existing_sheet_number})
                </Button>
              ) : (
                  <Button
                  variant="primary"
                  onClick={handleMakeSalarySheet}
                  loading={creatingSheet}
                  disabled={loadingLive || rows.length === 0}
                >
                  <i className="bx bx-file-plus" style={{ marginRight: '6px' }}></i>
                  Make Salary Sheet for {liveData?.month || selectedMonth}
                </Button>
              )}
            </div>
          </div>

          {liveData?.has_generated_sheet && (
            <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#047857', fontSize: '12.5px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <span>
                <i className="bx bx-lock-alt" style={{ marginRight: '6px' }}></i>
                <strong>Salary Sheet {liveData.existing_sheet_number}</strong> is already generated and locked for <strong>{liveData.month}</strong>. To rebuild it, delete it from Generated Salary Sheets (only possible before payments are disbursed).
              </span>
            </div>
          )}

          {/* KPI Strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
            <div style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)' }}>EMPLOYEES</div>
              <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '2px' }}>{filteredRows.length}</div>
            </div>
            <div style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)' }}>GROSS SALARY PAYABLE</div>
              <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '2px', color: '#2563eb' }}>{fmtPkr(liveTotals.gross)}</div>
            </div>
            <div style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)' }}>TOTAL DEDUCTIONS</div>
              <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '2px', color: '#dc2626' }}>{fmtPkr(liveTotals.ded)}</div>
            </div>
            <div style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)' }}>NET SALARY PAYABLE</div>
              <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '2px', color: '#059669' }}>{fmtPkr(liveTotals.net)}</div>
            </div>
          </div>

          {/* Live Salary Sheet Table (Matches Sample Image 1) */}
          <div style={{ border: '1px solid var(--color-border)', borderRadius: '10px', overflow: 'auto', maxHeight: '620px', background: 'var(--color-surface)' }}>
            {loadingLive ? (
              <div style={{ padding: '48px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                <i className="bx bx-loader-alt bx-spin" style={{ fontSize: '28px', marginBottom: '8px' }}></i>
                <div>Loading attendance & salary calculations...</div>
              </div>
            ) : filteredRows.length === 0 ? (
              <div style={{ padding: '48px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                No employee attendance or salary records found for <strong>{liveData?.month || selectedMonth}</strong>.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                  <tr>
                    <th rowSpan={2} style={thBase}>S#</th>
                    <th rowSpan={2} style={thBase}>OSS</th>
                    <th rowSpan={2} style={{ ...thBase, textAlign: 'left', minWidth: '140px' }}>Employee&apos;s Name</th>
                    <th rowSpan={2} style={thBase}>Basic Salary</th>
                    <th rowSpan={2} style={thBase}>4 Hrs OT</th>
                    <th rowSpan={2} style={thBase}>Site Allowance</th>
                    <th rowSpan={2} style={thBase}>Total Salary</th>
                    <th rowSpan={2} style={thBase}>Total Shifts</th>
                    <th rowSpan={2} style={thBase}>Paid Shifts</th>
                    <th rowSpan={2} style={thBase}>OT Shifts</th>
                    <th rowSpan={2} style={thBase}>Salary</th>
                    <th rowSpan={2} style={thBase}>OT Payable</th>
                    <th rowSpan={2} style={thBase}>Gross Salary</th>
                    <th colSpan={6} style={{ ...thBase, background: '#e2e8f0', color: '#0f172a' }}>Deduction</th>
                    <th rowSpan={2} style={thBase}>Total Deduction</th>
                    <th rowSpan={2} style={thBase}>Net Salary Payable</th>
                    <th rowSpan={2} style={{ ...thBase, minWidth: '110px' }}>Mode Of Payment</th>
                    <th rowSpan={2} style={{ ...thBase, minWidth: '150px' }}>Location</th>
                    <th rowSpan={2} style={thBase}>Sign / Contact</th>
                    <th rowSpan={2} style={thBase}>CNIC #</th>
                    <th rowSpan={2} style={thBase}>Date of Issue</th>
                  </tr>
                  <tr>
                    <th style={{ ...thBase, background: '#f5c197', color: '#000' }}>Doc Charges</th>
                    <th style={{ ...thBase, background: '#8fd1df', color: '#000' }}>EOBI</th>
                    <th style={{ ...thBase, background: '#b6d19a', color: '#000' }}>Admin Chg</th>
                    <th style={{ ...thBase, background: '#cbc1dc', color: '#000' }}>Fine / Accom</th>
                    <th style={{ ...thBase, background: '#f9dec4', color: '#000' }}>Insurance</th>
                    <th style={{ ...thBase, background: '#ffff00', color: '#000' }}>Adv</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.employee_id}>
                      <td style={tdBase}>{row.serial_no}</td>
                      <td style={{ ...tdBase, fontFamily: 'monospace', fontWeight: 700 }}>{row.oss_code}</td>
                      <td style={{ ...tdBase, textAlign: 'left', fontWeight: 600 }}>{row.employee_name}</td>
                      <td style={tdBase}>{fmtInt(row.basic_salary)}</td>

                      {/* 4 Hrs OT Switchable */}
                      <td style={tdBase}>
                        <button
                          type="button"
                          onClick={() => handleToggleAllowance(row, 'four_hrs_ot_enabled')}
                          title="Toggle 4 Hrs OT (amount synced from CRM Costing Rules)"
                          style={{
                            padding: '2px 7px',
                            borderRadius: '99px',
                            border: '1px solid var(--color-border)',
                            cursor: 'pointer',
                            fontSize: '11px',
                            fontWeight: 700,
                            background: row.four_hrs_ot_enabled ? '#0284c7' : 'var(--color-surface-secondary)',
                            color: row.four_hrs_ot_enabled ? '#fff' : 'var(--color-text-muted)',
                          }}
                        >
                          {row.four_hrs_ot_enabled ? fmtInt(row.four_hrs_ot_amount) : 'OFF (0)'}
                        </button>
                      </td>

                      {/* Site Allowance Switchable */}
                      <td style={tdBase}>
                        <button
                          type="button"
                          onClick={() => handleToggleAllowance(row, 'site_allowance_enabled')}
                          title="Toggle Site Allowance (amount synced from CRM Costing Rules)"
                          style={{
                            padding: '2px 7px',
                            borderRadius: '99px',
                            border: '1px solid var(--color-border)',
                            cursor: 'pointer',
                            fontSize: '11px',
                            fontWeight: 700,
                            background: row.site_allowance_enabled ? '#059669' : 'var(--color-surface-secondary)',
                            color: row.site_allowance_enabled ? '#fff' : 'var(--color-text-muted)',
                          }}
                        >
                          {row.site_allowance_enabled ? fmtInt(row.site_allowance_amount) : 'OFF (0)'}
                        </button>
                      </td>

                      <td style={{ ...tdBase, fontWeight: 700 }}>{fmtInt(row.total_salary)}</td>
                      <td style={tdBase}>{row.total_shifts}</td>
                      <td style={tdBase}>{row.paid_shifts}</td>
                      <td style={tdBase}>{row.overtime_shifts || ''}</td>
                      <td style={{ ...tdBase, fontWeight: 700 }}>{fmtInt(row.prorated_salary)}</td>
                      <td style={tdBase}>{row.overtime_payable > 0 ? fmtInt(row.overtime_payable) : '-'}</td>
                      <td style={{ ...tdBase, fontWeight: 700, color: '#1d4ed8' }}>{fmtInt(row.gross_salary_payable)}</td>

                      <td style={{ ...tdBase, background: 'rgba(245, 193, 151, 0.25)' }}>
                        {row.doc_charges > 0 ? fmtInt(row.doc_charges) : ''}
                      </td>
                      <td style={{ ...tdBase, background: 'rgba(143, 209, 223, 0.25)' }}>
                        {row.eobi_amount > 0 ? fmtInt(row.eobi_amount) : ''}
                      </td>
                      <td style={{ ...tdBase, background: 'rgba(182, 209, 154, 0.25)' }}>
                        {row.admin_charges > 0 ? fmtInt(row.admin_charges) : ''}
                      </td>

                      {/* Manual Fine Input */}
                      <td style={{ ...tdBase, background: 'rgba(203, 193, 220, 0.25)', padding: '3px' }}>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={row.manual_fine_amount || ''}
                          placeholder="0"
                          onChange={(e) => handleFineChange(row, e.target.value)}
                          onBlur={() => handleFineBlur(row)}
                          style={{
                            width: '68px',
                            padding: '2px 5px',
                            fontSize: '11.5px',
                            textAlign: 'right',
                            border: '1px solid var(--color-border)',
                            borderRadius: '4px',
                            background: 'var(--color-surface)',
                            color: 'var(--color-text)',
                          }}
                        />
                      </td>

                      <td style={{ ...tdBase, background: 'rgba(249, 222, 196, 0.25)' }}>
                        {row.insurance_amount > 0 ? fmtInt(row.insurance_amount) : ''}
                      </td>
                      <td style={{ ...tdBase, background: 'rgba(255, 255, 0, 0.18)' }}>
                        {row.advance_amount > 0 ? fmtInt(row.advance_amount) : ''}
                      </td>

                      <td style={{ ...tdBase, fontWeight: 700, color: '#dc2626' }}>{fmtInt(row.total_deduction)}</td>
                      <td style={{ ...tdBase, fontWeight: 800, color: '#059669' }}>{fmtInt(row.net_salary_payable)}</td>

                      {/* Sticky Mode of Payment Dropdown */}
                      <td style={{ ...tdBase, padding: '3px' }}>
                        <select
                          className="input-base"
                          style={{ height: '27px', fontSize: '11px', padding: '0 6px', minWidth: '95px' }}
                          value={row.payment_mode_id || row.mode_of_payment || ''}
                          onChange={(e) => handleModeChange(row, e.target.value)}
                        >
                          {paymentModes.length === 0 && <option value="Cash">Cash</option>}
                          {paymentModes.map((pm) => (
                            <option key={pm.id} value={pm.id}>
                              {pm.name}
                            </option>
                          ))}
                          {row.mode_of_payment &&
                            !paymentModes.some((pm) => pm.id === row.payment_mode_id || pm.name === row.mode_of_payment) && (
                              <option value={row.mode_of_payment}>{row.mode_of_payment}</option>
                            )}
                        </select>
                      </td>

                      {/* Location(s) with small shift counts */}
                      <td style={{ ...tdBase, textAlign: 'left', whiteSpace: 'normal', minWidth: '150px' }}>
                        {row.locations_summary && row.locations_summary.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                            {row.locations_summary.map((loc, i) => (
                              <div key={i} style={{ fontSize: '11px' }}>
                                <strong>{loc.site_name}</strong>{' '}
                                <span style={{ fontSize: '9.5px', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                                  ({[loc.regular_shifts > 0 ? `${loc.regular_shifts}D` : '', loc.ot_shifts > 0 ? `${loc.ot_shifts}OT` : ''].filter(Boolean).join(', ')})
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span>{row.locations_text || '—'}</span>
                        )}
                      </td>

                      <td style={tdBase}>{row.contact_number || '—'}</td>
                      <td style={{ ...tdBase, fontFamily: 'monospace' }}>{row.cnic_number || '—'}</td>
                      <td style={tdBase}>{row.cnic_issue_date || '—'}</td>
                    </tr>
                  ))}

                  {/* Grand Total Footer Row */}
                  <tr style={{ background: 'var(--color-surface-secondary)', fontWeight: 800 }}>
                    <td colSpan={3} style={{ ...tdBase, textAlign: 'right' }}>TOTALS ({filteredRows.length}):</td>
                    <td style={tdBase}>{fmtInt(liveTotals.basic)}</td>
                    <td style={tdBase}>{fmtInt(liveTotals.fourOt)}</td>
                    <td style={tdBase}>{fmtInt(liveTotals.siteAll)}</td>
                    <td style={tdBase}>{fmtInt(liveTotals.totalSal)}</td>
                    <td colSpan={3} style={tdBase}></td>
                    <td style={tdBase}>{fmtInt(liveTotals.prorated)}</td>
                    <td style={tdBase}>{fmtInt(liveTotals.otPay)}</td>
                    <td style={{ ...tdBase, color: '#1d4ed8' }}>{fmtInt(liveTotals.gross)}</td>
                    <td style={tdBase}>{fmtInt(liveTotals.doc)}</td>
                    <td style={tdBase}>{fmtInt(liveTotals.eobi)}</td>
                    <td style={tdBase}>{fmtInt(liveTotals.admin)}</td>
                    <td style={tdBase}>{fmtInt(liveTotals.fine)}</td>
                    <td style={tdBase}>{fmtInt(liveTotals.ins)}</td>
                    <td style={tdBase}>{fmtInt(liveTotals.adv)}</td>
                    <td style={{ ...tdBase, color: '#dc2626' }}>{fmtInt(liveTotals.ded)}</td>
                    <td style={{ ...tdBase, color: '#059669' }}>{fmtInt(liveTotals.net)}</td>
                    <td colSpan={5} style={tdBase}></td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* VIEW 2: GENERATED SALARY SHEETS (UNEDITABLE ARCHIVE + PRINT + PAY) */}
      {viewMode === 'SHEETS' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {!activeSheet ? (
            <div style={{ border: '1px solid var(--color-border)', borderRadius: '10px', overflow: 'hidden', background: 'var(--color-surface)' }}>
              {loadingSheets ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  Loading salary sheets...
                </div>
              ) : sheets.length === 0 ? (
                <div style={{ padding: '48px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  No Salary Sheets generated yet. Switch to <strong>Monthly Salary Builder</strong> and click <strong>Make Salary Sheet</strong>.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: 'var(--color-surface-secondary)', borderBottom: '1px solid var(--color-border)' }}>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Sheet #</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Month</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Title</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Employees</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Gross Payable</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Deductions</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Net Payable</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Paid</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Status</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Prepared By</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sheets.map((s) => (
                      <tr key={s.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 700 }}>{s.sheet_number}</td>
                        <td style={{ padding: '10px 12px', fontWeight: 700 }}>{s.month}</td>
                        <td style={{ padding: '10px 12px' }}>{s.title}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>{s.total_employees}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>{fmtPkr(s.total_gross_payable)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#dc2626' }}>{fmtPkr(s.total_deductions)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#059669' }}>{fmtPkr(s.total_net_payable)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>{fmtPkr(s.total_paid)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '99px',
                              fontSize: '11px',
                              fontWeight: 700,
                              background: s.status === 'PAID' ? '#dcfce7' : s.status === 'PARTIALLY_PAID' ? '#fef3c7' : '#e0f2fe',
                              color: s.status === 'PAID' ? '#15803d' : s.status === 'PARTIALLY_PAID' ? '#b45309' : '#0369a1',
                            }}
                          >
                            {s.status}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: '12px' }}>{s.prepared_by_name || '—'}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '6px' }}>
                            <Button size="sm" variant="primary" onClick={() => openSheetDetail(s.id)} loading={loadingDetail}>
                              Open Sheet
                            </Button>
                            {Number(s.total_paid || 0) <= 0 && (
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
            /* Uneditable Read-Only Detail Viewer */
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
                  <Button size="sm" variant="secondary" onClick={() => setActiveSheet(null)}>
                    &larr; Back to Sheets List
                  </Button>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '14px' }}>
                      {activeSheet.sheet_number} &bull; {activeSheet.title}
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--color-text-muted)' }}>
                      Read-Only Finalized Sheet &bull; Prepared By: <strong>{activeSheet.prepared_by_name || 'Finance'}</strong> &bull; Status: <strong>{activeSheet.status}</strong>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    className="input-base"
                    style={{ width: '200px', height: '32px' }}
                    placeholder="Filter employee / site..."
                    value={sheetSearch}
                    onChange={(e) => setSheetSearch(e.target.value)}
                  />
                  <Button size="sm" variant="secondary" onClick={() => setPrintSheet(activeSheet)}>
                    <i className="bx bx-printer" style={{ marginRight: '5px' }}></i>
                    Print Landscape Sheet
                  </Button>
                  {selectedUnpaidCount > 0 && (
                    <Button size="sm" variant="primary" onClick={() => setShowPayModal(true)}>
                      <i className="bx bx-money" style={{ marginRight: '5px' }}></i>
                      Pay Salaries ({selectedUnpaidCount})
                    </Button>
                  )}
                  {Number(activeSheet.total_paid || 0) <= 0 && (
                    <Button size="sm" variant="secondary" onClick={() => handleDeleteSheet(activeSheet)}>
                      Delete & Recreate
                    </Button>
                  )}
                </div>
              </div>

              <div style={{ border: '1px solid var(--color-border)', borderRadius: '10px', overflow: 'auto', maxHeight: '620px', background: 'var(--color-surface)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                    <tr>
                      <th rowSpan={2} style={thBase}>Sel</th>
                      <th rowSpan={2} style={thBase}>S#</th>
                      <th rowSpan={2} style={thBase}>OSS</th>
                      <th rowSpan={2} style={{ ...thBase, textAlign: 'left', minWidth: '140px' }}>Employee&apos;s Name</th>
                      <th rowSpan={2} style={thBase}>Basic</th>
                      <th rowSpan={2} style={thBase}>4h OT</th>
                      <th rowSpan={2} style={thBase}>Site All</th>
                      <th rowSpan={2} style={thBase}>Total Sal</th>
                      <th rowSpan={2} style={thBase}>Shifts</th>
                      <th rowSpan={2} style={thBase}>Paid</th>
                      <th rowSpan={2} style={thBase}>OT</th>
                      <th rowSpan={2} style={thBase}>Salary</th>
                      <th rowSpan={2} style={thBase}>OT Pay</th>
                      <th rowSpan={2} style={thBase}>Gross</th>
                      <th colSpan={6} style={{ ...thBase, background: '#e2e8f0', color: '#0f172a' }}>Deduction</th>
                      <th rowSpan={2} style={thBase}>Total Ded</th>
                      <th rowSpan={2} style={thBase}>Net Payable</th>
                      <th rowSpan={2} style={thBase}>Mode</th>
                      <th rowSpan={2} style={{ ...thBase, minWidth: '140px' }}>Location</th>
                      <th rowSpan={2} style={thBase}>Contact / CNIC</th>
                      <th rowSpan={2} style={thBase}>Status / Action</th>
                    </tr>
                    <tr>
                      <th style={{ ...thBase, background: '#f5c197', color: '#000' }}>Doc</th>
                      <th style={{ ...thBase, background: '#8fd1df', color: '#000' }}>EOBI</th>
                      <th style={{ ...thBase, background: '#b6d19a', color: '#000' }}>Admin</th>
                      <th style={{ ...thBase, background: '#cbc1dc', color: '#000' }}>Fine</th>
                      <th style={{ ...thBase, background: '#f9dec4', color: '#000' }}>Ins</th>
                      <th style={{ ...thBase, background: '#ffff00', color: '#000' }}>Adv</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSheetLines.map((ln) => {
                      const canSelect = ln.payment_status === 'UNPAID' && !ln.is_stop_payment && Number(ln.net_salary_payable) > 0;
                      const rowBg = ln.is_stop_payment ? 'rgba(214, 147, 143, 0.35)' : undefined;
                      return (
                        <tr key={ln.id} style={{ background: rowBg }}>
                          <td style={tdBase}>
                            <input
                              type="checkbox"
                              disabled={!canSelect}
                              checked={!!selectedLineIds[ln.id]}
                              onChange={(e) =>
                                setSelectedLineIds((prev) => ({ ...prev, [ln.id]: e.target.checked }))
                              }
                            />
                          </td>
                          <td style={tdBase}>{ln.serial_no}</td>
                          <td style={{ ...tdBase, fontFamily: 'monospace', fontWeight: 700 }}>{ln.oss_code}</td>
                          <td style={{ ...tdBase, textAlign: 'left', fontWeight: 600 }}>{ln.employee_name}</td>
                          <td style={tdBase}>{fmtInt(ln.basic_salary)}</td>
                          <td style={tdBase}>{Number(ln.four_hrs_ot_amount) > 0 ? fmtInt(ln.four_hrs_ot_amount) : '-'}</td>
                          <td style={tdBase}>{Number(ln.site_allowance_amount) > 0 ? fmtInt(ln.site_allowance_amount) : '-'}</td>
                          <td style={{ ...tdBase, fontWeight: 700 }}>{fmtInt(ln.total_salary)}</td>
                          <td style={tdBase}>{ln.total_shifts}</td>
                          <td style={tdBase}>{ln.paid_shifts}</td>
                          <td style={tdBase}>{Number(ln.overtime_shifts) || ''}</td>
                          <td style={{ ...tdBase, fontWeight: 700 }}>{fmtInt(ln.prorated_salary)}</td>
                          <td style={tdBase}>{Number(ln.overtime_payable) > 0 ? fmtInt(ln.overtime_payable) : '-'}</td>
                          <td style={{ ...tdBase, fontWeight: 700 }}>{fmtInt(ln.gross_salary_payable)}</td>
                          <td style={{ ...tdBase, background: 'rgba(245, 193, 151, 0.25)' }}>{Number(ln.doc_charges) > 0 ? fmtInt(ln.doc_charges) : ''}</td>
                          <td style={{ ...tdBase, background: 'rgba(143, 209, 223, 0.25)' }}>{Number(ln.eobi_amount) > 0 ? fmtInt(ln.eobi_amount) : ''}</td>
                          <td style={{ ...tdBase, background: 'rgba(182, 209, 154, 0.25)' }}>{Number(ln.admin_charges) > 0 ? fmtInt(ln.admin_charges) : ''}</td>
                          <td style={{ ...tdBase, background: 'rgba(203, 193, 220, 0.25)' }}>{Number(ln.fine_amount) > 0 ? fmtInt(ln.fine_amount) : ''}</td>
                          <td style={{ ...tdBase, background: 'rgba(249, 222, 196, 0.25)' }}>{Number(ln.insurance_amount) > 0 ? fmtInt(ln.insurance_amount) : ''}</td>
                          <td style={{ ...tdBase, background: 'rgba(255, 255, 0, 0.18)' }}>{Number(ln.advance_amount) > 0 ? fmtInt(ln.advance_amount) : ''}</td>
                          <td style={{ ...tdBase, fontWeight: 700, color: '#dc2626' }}>{fmtInt(ln.total_deduction)}</td>
                          <td style={{ ...tdBase, fontWeight: 800, color: '#059669' }}>{fmtInt(ln.net_salary_payable)}</td>
                          <td style={tdBase}>{ln.mode_of_payment || '-'}</td>
                          <td style={{ ...tdBase, textAlign: 'left', whiteSpace: 'normal' }}>{ln.locations_text || '-'}</td>
                          <td style={{ ...tdBase, fontSize: '10.5px' }}>
                            <div>{ln.contact_number || '-'}</div>
                            <div style={{ color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>{ln.cnic_number || ''}</div>
                          </td>
                          <td style={tdBase}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                              <span
                                style={{
                                  padding: '2px 7px',
                                  borderRadius: '99px',
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  background: ln.payment_status === 'PAID' ? '#dcfce7' : ln.is_stop_payment ? '#fee2e2' : '#e0f2fe',
                                  color: ln.payment_status === 'PAID' ? '#15803d' : ln.is_stop_payment ? '#b91c1c' : '#0369a1',
                                }}
                              >
                                {ln.payment_status === 'PAID' ? 'PAID' : ln.is_stop_payment ? 'HOLD' : 'UNPAID'}
                              </span>
                              {ln.payment_status !== 'PAID' && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleHold(ln)}
                                  style={{
                                    border: '1px solid var(--color-border)',
                                    background: 'var(--color-surface)',
                                    borderRadius: '4px',
                                    padding: '2px 6px',
                                    fontSize: '10.5px',
                                    cursor: 'pointer',
                                    color: 'var(--color-text)',
                                  }}
                                >
                                  {ln.is_stop_payment ? 'Unhold' : 'Hold'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pay Salary Sheet Lines Modal */}
      {showPayModal && activeSheet && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9998,
            background: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '480px',
              background: 'var(--color-surface)',
              borderRadius: '10px',
              border: '1px solid var(--color-border)',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>
              Disburse Salaries — {activeSheet.sheet_number}
            </h3>
            <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--color-text-muted)' }}>
              Paying <strong>{selectedUnpaidCount}</strong> employee(s). Creates a posted Payment Voucher, records Treasury outflow, settles due advances, and marks HR Doc Charges as Paid.
            </p>

            <div>
              <label style={{ fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                Treasury Bank / Cash Account *
              </label>
              <select
                className="input-base"
                value={treasuryAccountId}
                onChange={(e) => setTreasuryAccountId(e.target.value)}
              >
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
              <input
                type="date"
                className="input-base"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>

            <div>
              <label style={{ fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                Reference / Advice #
              </label>
              <input
                type="text"
                className="input-base"
                placeholder="e.g. SAL-OCT-2026"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
              />
            </div>

            <div>
              <label style={{ fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                Notes
              </label>
              <input
                type="text"
                className="input-base"
                placeholder="Optional disbursement remarks"
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
              <Button variant="secondary" onClick={() => setShowPayModal(false)} disabled={paying}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleConfirmPayLines} loading={paying}>
                Confirm & Disburse Salaries
              </Button>
            </div>
          </div>
        </div>
      )}

      <PaymentModesModal
        isOpen={showPaymentModesModal}
        onClose={() => setShowPaymentModesModal(false)}
        onUpdated={(modes) => setPaymentModes(modes)}
      />

      <SalarySheetPrintModal
        isOpen={!!printSheet}
        sheet={printSheet}
        onClose={() => setPrintSheet(null)}
      />
    </div>
  );
};
