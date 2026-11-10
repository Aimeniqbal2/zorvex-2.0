import React, { useState, useEffect } from 'react';
import type {
  PayrollAccountingIntegrationItem,
  SalaryPaymentBatchItem,
  PayrollFinanceSummaryMetrics,
  BankAccount,
  ChartOfAccount,
  PayrollAccountingPreviewItem,
  LiveAttendanceSalariesResponse,
  LiveAttendanceEmployeeSalaryRow,
} from '../api';
import {
  fetchPayrollIntegrations,
  fetchSalaryBatches,
  fetchPayrollFinanceSummaryMetrics,
  syncPayrollRun,
  fetchPayrollIntegrationPreview,
  fetchBankAccounts,
  fetchChartOfAccounts,
  fetchLiveAttendanceSalaries,
  finalizeAndSyncPayrollMonth,
  payGuardSalaries,
} from '../api';
import { PayrollAccountingPreviewModal } from './PayrollAccountingPreviewModal';
import { SalaryBatchWorkspaceModal } from './SalaryBatchWorkspaceModal';
import { NewSalaryBatchModal } from './NewSalaryBatchModal';
import { PayrollMappingsModal } from './PayrollMappingsModal';

interface PayrollFinanceTabProps {
  bankAccounts?: BankAccount[];
  chartOfAccounts?: ChartOfAccount[];
}

export const PayrollFinanceTab: React.FC<PayrollFinanceTabProps> = ({
  bankAccounts: initialBankAccounts,
  chartOfAccounts: initialChartOfAccounts,
}) => {
  const [liveData, setLiveData] = useState<LiveAttendanceSalariesResponse | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>('AUTO');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [payFilter, setPayFilter] = useState<'ALL' | 'UNPAID' | 'PAID'>('ALL');
  const [selectedEmpIds, setSelectedEmpIds] = useState<string[]>([]);

  const [integrations, setIntegrations] = useState<PayrollAccountingIntegrationItem[]>([]);
  const [batches, setBatches] = useState<SalaryPaymentBatchItem[]>([]);
  const [metrics, setMetrics] = useState<PayrollFinanceSummaryMetrics | null>(null);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>(initialBankAccounts || []);
  const [chartOfAccounts, setChartOfAccounts] = useState<ChartOfAccount[]>(initialChartOfAccounts || []);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'LIVE_SALARIES' | 'INTEGRATIONS' | 'BATCHES'>('LIVE_SALARIES');

  // Pay Guard Salary Modal
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payTargetEmpIds, setPayTargetEmpIds] = useState<string[]>([]);
  const [payTargetLabel, setPayTargetLabel] = useState<string>('');
  const [payTreasuryId, setPayTreasuryId] = useState<string>('');
  const [payProvider, setPayProvider] = useState<string>('MANUAL');
  const [payDate, setPayDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [payRef, setPayRef] = useState<string>('');
  const [payNotes, setPayNotes] = useState<string>('');
  const [payingSaving, setPayingSaving] = useState(false);

  // Modals state
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewData, setPreviewData] = useState<PayrollAccountingPreviewItem | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<SalaryPaymentBatchItem | null>(null);

  const [newBatchModalOpen, setNewBatchModalOpen] = useState(false);
  const [selectedIntegrationForBatch, setSelectedIntegrationForBatch] = useState<PayrollAccountingIntegrationItem | null>(null);

  const [mappingsModalOpen, setMappingsModalOpen] = useState(false);

  const loadData = async (monthOverride?: string) => {
    const targetMonth = monthOverride ?? selectedMonth;
    try {
      setLoading(true);
      setErrorMsg(null);
      const [liveRes, intData, batchData, metricData, banks, coas] = await Promise.all([
        fetchLiveAttendanceSalaries(targetMonth === 'AUTO' ? undefined : targetMonth).catch((err) => {
          console.error('Failed to load live attendance salaries:', err);
          return null;
        }),
        fetchPayrollIntegrations().catch(() => []),
        fetchSalaryBatches().catch(() => []),
        fetchPayrollFinanceSummaryMetrics().catch(() => null),
        fetchBankAccounts().catch(() => []),
        fetchChartOfAccounts().catch(() => []),
      ]);

      if (liveRes) {
        setLiveData(liveRes);
        if (targetMonth === 'AUTO' && liveRes.month) {
          setSelectedMonth(liveRes.month);
        }
      }
      setIntegrations(Array.isArray(intData) ? intData : []);
      setBatches(Array.isArray(batchData) ? batchData : []);
      if (metricData) setMetrics(metricData);
      if (banks && banks.length) {
        const activeBanks = banks.filter((b) => b.is_active);
        const usable = activeBanks.length > 0 ? activeBanks : banks;
        setBankAccounts(usable);
        if (!payTreasuryId && usable.length > 0) {
          setPayTreasuryId(usable[0].id);
        }
      }
      if (coas && coas.length) setChartOfAccounts(coas);
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.detail || err.message || 'Failed to load payroll finance workspace.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(selectedMonth);
  }, [selectedMonth]);

  const handleFinalizeMonth = async () => {
    const monthToFinalize = liveData?.month || (selectedMonth !== 'AUTO' ? selectedMonth : '');
    if (!monthToFinalize) return;
    try {
      setSyncing(true);
      const res = await finalizeAndSyncPayrollMonth({ month: monthToFinalize });
      await loadData(monthToFinalize);
      alert(res.message || `Finalized ${res.finalized_count} employee salaries for ${monthToFinalize}.`);
    } catch (err: any) {
      alert(err?.response?.data?.detail || err.message || 'Failed to finalize monthly attendance payroll.');
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncAll = async () => {
    try {
      setSyncing(true);
      await syncPayrollRun();
      await loadData();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to sync finalized payroll runs.');
    } finally {
      setSyncing(false);
    }
  };

  const openPayModalForEmployees = (empList: LiveAttendanceEmployeeSalaryRow[]) => {
    const unpaid = empList.filter((e) => e.payment_status !== 'PAID' && e.net_salary > 0);
    if (unpaid.length === 0) {
      alert('No unpaid employees with positive net salary selected.');
      return;
    }
    const totalAmt = unpaid.reduce((acc, e) => acc + e.net_salary, 0);
    setPayTargetEmpIds(unpaid.map((e) => e.employee_id));
    setPayTargetLabel(
      unpaid.length === 1
        ? `${unpaid[0].employee_name} (${unpaid[0].employee_code}) — PKR ${totalAmt.toLocaleString()}`
        : `${unpaid.length} Employees Selected — Total PKR ${totalAmt.toLocaleString()}`
    );
    setPayRef('');
    setPayNotes(`Guard Salary Payment (${liveData?.month || selectedMonth})`);
    setPayModalOpen(true);
  };

  const handleConfirmGuardPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const monthToPay = liveData?.month || (selectedMonth !== 'AUTO' ? selectedMonth : '');
    if (!monthToPay) return;
    try {
      setPayingSaving(true);
      const res = await payGuardSalaries({
        month: monthToPay,
        employee_ids: payTargetEmpIds,
        treasury_account_id: payTreasuryId || undefined,
        payment_date: payDate,
        payment_reference: payRef || undefined,
        payment_provider: payProvider,
        notes: payNotes || undefined,
      });
      setPayModalOpen(false);
      setSelectedEmpIds([]);
      await loadData(monthToPay);
      alert(res.message || 'Salary disbursement recorded and marked PAID.');
    } catch (err: any) {
      alert(err?.response?.data?.detail || err.message || 'Failed to disburse employee salaries.');
    } finally {
      setPayingSaving(false);
    }
  };

  const handleOpenPreview = async (integrationId: string) => {
    try {
      setPreviewLoading(true);
      setPreviewModalOpen(true);
      const data = await fetchPayrollIntegrationPreview(integrationId);
      setPreviewData(data);
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to generate accounting preview.');
      setPreviewModalOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleOpenNewBatch = (integration: PayrollAccountingIntegrationItem) => {
    setSelectedIntegrationForBatch(integration);
    setNewBatchModalOpen(true);
  };

  const handleOpenWorkspace = (batch: SalaryPaymentBatchItem) => {
    setSelectedBatch(batch);
    setWorkspaceModalOpen(true);
  };

  const handleBatchUpdated = (updatedBatch: SalaryPaymentBatchItem) => {
    setSelectedBatch(updatedBatch);
    setBatches((prev) => prev.map((b) => (b.id === updatedBatch.id ? updatedBatch : b)));
    loadData();
  };

  const liveEmployees = liveData?.employees || [];
  const filteredEmployees = liveEmployees.filter((emp) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      emp.employee_name.toLowerCase().includes(q) ||
      emp.employee_code.toLowerCase().includes(q) ||
      emp.designation_name.toLowerCase().includes(q) ||
      emp.sites.some((s) => s.toLowerCase().includes(q));
    const matchesPay =
      payFilter === 'ALL' ||
      (payFilter === 'PAID' && emp.payment_status === 'PAID') ||
      (payFilter === 'UNPAID' && emp.payment_status !== 'PAID');
    return matchesSearch && matchesPay;
  });

  const selectableUnpaid = filteredEmployees.filter((e) => e.payment_status !== 'PAID' && e.net_salary > 0);
  const allUnpaidSelected =
    selectableUnpaid.length > 0 && selectableUnpaid.every((e) => selectedEmpIds.includes(e.employee_id));

  const toggleSelectAll = () => {
    if (allUnpaidSelected) {
      setSelectedEmpIds([]);
    } else {
      setSelectedEmpIds(selectableUnpaid.map((e) => e.employee_id));
    }
  };

  const toggleSelectOne = (empId: string) => {
    setSelectedEmpIds((prev) =>
      prev.includes(empId) ? prev.filter((id) => id !== empId) : [...prev, empId]
    );
  };

  const summary = liveData?.summary;
  const recognizedNet = summary ? summary.total_net_payable : Number(metrics?.total_net_payable || 0);
  const disbursedNet = summary ? summary.total_paid : Number(metrics?.total_salary_paid || 0);
  const remainingNet = summary ? summary.remaining_payable : Number(metrics?.outstanding_payroll_liability || 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header Toolbar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          background: 'var(--color-surface, #ffffff)',
          padding: '16px 20px',
          borderRadius: '10px',
          border: '1px solid var(--color-border, #e2e8f0)',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text, #0f172a)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span>Payroll & Attendance Salaries</span>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                background: 'rgba(34, 197, 94, 0.14)',
                color: '#16a34a',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                padding: '2px 8px',
                borderRadius: '9999px',
              }}
            >
              Operations Muster Linked
            </span>
          </h2>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted, #64748b)', marginTop: '4px' }}>
            Automatic monthly guard & staff salaries computed from Operations duty muster, overtime, additions, deductions, and advances.
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={liveData?.month || (selectedMonth !== 'AUTO' ? selectedMonth : '')}
            onChange={(e) => setSelectedMonth(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid var(--color-border, #cbd5e1)',
              background: 'var(--color-surface, #ffffff)',
              color: 'var(--color-text, #0f172a)',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            {(liveData?.available_months || []).map((m) => (
              <option key={m} value={m}>
                {m}
                {m === liveData?.previous_month ? ' (Last Month)' : m === liveData?.current_month ? ' (Current Month)' : ''}
              </option>
            ))}
          </select>

          <button
            onClick={() => setMappingsModalOpen(true)}
            style={{
              padding: '8px 14px',
              borderRadius: '6px',
              background: 'var(--color-surface, #ffffff)',
              border: '1px solid var(--color-border, #cbd5e1)',
              color: 'var(--color-text, #0f172a)',
              fontSize: '0.85rem',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            GL Routing Mappings
          </button>

          {!liveData?.is_finalized && liveEmployees.length > 0 && (
            <button
              onClick={handleFinalizeMonth}
              disabled={syncing}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                background: '#16a34a',
                border: 'none',
                color: '#ffffff',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {syncing ? 'Finalizing...' : 'Approve & Finalize Salaries'}
            </button>
          )}

          {selectedEmpIds.length > 0 && (
            <button
              onClick={() => openPayModalForEmployees(liveEmployees.filter((e) => selectedEmpIds.includes(e.employee_id)))}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                background: '#0284c7',
                border: 'none',
                color: '#ffffff',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Pay Selected Guards ({selectedEmpIds.length})
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div style={{ padding: '12px 16px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', color: '#dc2626', fontSize: '13px', fontWeight: 500 }}>
          {errorMsg}
        </div>
      )}

      {/* KPI Metric Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '16px',
        }}
      >
        <div
          style={{
            background: 'var(--color-surface, #ffffff)',
            padding: '16px',
            borderRadius: '10px',
            border: '1px solid var(--color-border, #e2e8f0)',
          }}
        >
          <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            Monthly Net Payroll ({liveData?.month || '—'})
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-text, #0f172a)', marginTop: '6px' }}>
            PKR {recognizedNet.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #64748b)', marginTop: '4px' }}>
            {summary?.employee_count || 0} active guards/staff worked
          </div>
        </div>

        <div
          style={{
            background: 'var(--color-surface, #ffffff)',
            padding: '16px',
            borderRadius: '10px',
            border: '1px solid var(--color-border, #e2e8f0)',
          }}
        >
          <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            Salaries Paid
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#16a34a', marginTop: '6px' }}>
            PKR {disbursedNet.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #64748b)', marginTop: '4px' }}>
            {summary?.paid_count || 0} guards paid & settled
          </div>
        </div>

        <div
          style={{
            background: 'var(--color-surface, #ffffff)',
            padding: '16px',
            borderRadius: '10px',
            border: '1px solid var(--color-border, #e2e8f0)',
          }}
        >
          <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            Remaining Payable
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#d97706', marginTop: '6px' }}>
            PKR {remainingNet.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #64748b)', marginTop: '4px' }}>
            {summary?.unpaid_count || 0} guards awaiting payment
          </div>
        </div>

        <div
          style={{
            background: 'var(--color-surface, #ffffff)',
            padding: '16px',
            borderRadius: '10px',
            border: '1px solid var(--color-border, #e2e8f0)',
          }}
        >
          <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            Salary Payment Batches
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#0284c7', marginTop: '6px' }}>
            {batches.length} Batches
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #64748b)', marginTop: '4px' }}>
            {batches.filter((b) => b.status === 'COMPLETED').length} settled | {batches.filter((b) => b.status !== 'COMPLETED').length} pending
          </div>
        </div>
      </div>

      {/* Sub-tab Navigation */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--color-border, #e2e8f0)', paddingBottom: '2px', flexWrap: 'wrap' }}>
        <button
          onClick={() => setActiveSubTab('LIVE_SALARIES')}
          style={{
            padding: '8px 16px',
            background: 'transparent',
            border: 'none',
            borderBottom: activeSubTab === 'LIVE_SALARIES' ? '2px solid #0284c7' : '2px solid transparent',
            color: activeSubTab === 'LIVE_SALARIES' ? '#0284c7' : 'var(--color-text-muted, #64748b)',
            fontWeight: 600,
            fontSize: '0.9rem',
            cursor: 'pointer',
          }}
        >
          Employee Attendance Salaries ({liveEmployees.length})
        </button>

        <button
          onClick={() => setActiveSubTab('INTEGRATIONS')}
          style={{
            padding: '8px 16px',
            background: 'transparent',
            border: 'none',
            borderBottom: activeSubTab === 'INTEGRATIONS' ? '2px solid #0284c7' : '2px solid transparent',
            color: activeSubTab === 'INTEGRATIONS' ? '#0284c7' : 'var(--color-text-muted, #64748b)',
            fontWeight: 600,
            fontSize: '0.9rem',
            cursor: 'pointer',
          }}
        >
          Finalized Payroll Runs ({integrations.length})
        </button>

        <button
          onClick={() => setActiveSubTab('BATCHES')}
          style={{
            padding: '8px 16px',
            background: 'transparent',
            border: 'none',
            borderBottom: activeSubTab === 'BATCHES' ? '2px solid #0284c7' : '2px solid transparent',
            color: activeSubTab === 'BATCHES' ? '#0284c7' : 'var(--color-text-muted, #64748b)',
            fontWeight: 600,
            fontSize: '0.9rem',
            cursor: 'pointer',
          }}
        >
          Salary Payment Batches ({batches.length})
        </button>
      </div>

      {/* Sub-tab 1: Live Operations Attendance Salaries */}
      {activeSubTab === 'LIVE_SALARIES' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Filter + Quick Pay Row */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '10px',
              background: 'var(--color-surface, #ffffff)',
              padding: '12px 16px',
              borderRadius: '10px',
              border: '1px solid var(--color-border, #e2e8f0)',
            }}
          >
            <input
              type="text"
              placeholder="Search by employee code, name, site, or designation..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: '1 1 260px',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid var(--color-border, #cbd5e1)',
                background: 'var(--color-bg, #f8fafc)',
                color: 'var(--color-text, #0f172a)',
                fontSize: '13px',
              }}
            />
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <select
                value={payFilter}
                onChange={(e) => setPayFilter(e.target.value as 'ALL' | 'UNPAID' | 'PAID')}
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border, #cbd5e1)',
                  background: 'var(--color-surface, #ffffff)',
                  color: 'var(--color-text, #0f172a)',
                  fontSize: '13px',
                }}
              >
                <option value="ALL">All Statuses</option>
                <option value="UNPAID">Unpaid Only</option>
                <option value="PAID">Paid Only</option>
              </select>

              {selectableUnpaid.length > 0 && (
                <button
                  onClick={() => openPayModalForEmployees(selectableUnpaid)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#0284c7',
                    color: '#ffffff',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Pay All Unpaid ({selectableUnpaid.length})
                </button>
              )}
            </div>
          </div>

          <div
            style={{
              background: 'var(--color-surface, #ffffff)',
              borderRadius: '10px',
              border: '1px solid var(--color-border, #e2e8f0)',
              overflowX: 'auto',
            }}
          >
            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted, #64748b)' }}>
                Calculating guard & staff attendance salaries from Operations...
              </div>
            ) : filteredEmployees.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted, #64748b)' }}>
                No attendance duty pay records found for month <strong>{liveData?.month || selectedMonth}</strong>. Try switching months above.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
                <thead>
                  <tr style={{ background: 'var(--color-surface-secondary, #f8fafc)', textAlign: 'left', borderBottom: '1px solid var(--color-border, #e2e8f0)' }}>
                    <th style={{ padding: '12px 12px', width: '36px', textAlign: 'center' }}>
                      <input type="checkbox" checked={allUnpaidSelected} onChange={toggleSelectAll} />
                    </th>
                    <th style={{ padding: '12px 14px', color: 'var(--color-text-muted, #64748b)' }}>Guard / Employee</th>
                    <th style={{ padding: '12px 14px', color: 'var(--color-text-muted, #64748b)' }}>Deployed Site(s)</th>
                    <th style={{ padding: '12px 14px', color: 'var(--color-text-muted, #64748b)', textAlign: 'center' }}>Days / OT</th>
                    <th style={{ padding: '12px 14px', color: 'var(--color-text-muted, #64748b)', textAlign: 'right' }}>Duty + OT Pay</th>
                    <th style={{ padding: '12px 14px', color: 'var(--color-text-muted, #64748b)', textAlign: 'right' }}>Deductions / Adv</th>
                    <th style={{ padding: '12px 14px', color: 'var(--color-text-muted, #64748b)', textAlign: 'right' }}>Net Payable (PKR)</th>
                    <th style={{ padding: '12px 14px', color: 'var(--color-text-muted, #64748b)' }}>Status</th>
                    <th style={{ padding: '12px 14px', color: 'var(--color-text-muted, #64748b)', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.map((emp) => {
                    const isPaid = emp.payment_status === 'PAID';
                    const isChecked = selectedEmpIds.includes(emp.employee_id);
                    return (
                      <tr key={emp.employee_id} style={{ borderBottom: '1px solid var(--color-border, #e2e8f0)' }}>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          {!isPaid && emp.net_salary > 0 && (
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleSelectOne(emp.employee_id)}
                            />
                          )}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ fontWeight: 600, color: 'var(--color-text, #0f172a)' }}>{emp.employee_name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #64748b)' }}>
                            {emp.employee_code} • {emp.designation_name}
                          </div>
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--color-text-muted, #64748b)', fontSize: '0.8rem' }}>
                          {emp.sites.length > 0 ? emp.sites.join(', ') : emp.department_name}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                          <span style={{ fontWeight: 600, color: 'var(--color-text, #0f172a)' }}>{emp.present_days}D</span>
                          {emp.ot_shifts > 0 && (
                            <span style={{ marginLeft: '6px', color: '#0284c7', fontWeight: 600 }}>+{emp.ot_shifts} OT</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--color-text, #0f172a)' }}>
                          <div>PKR {emp.gross_earnings.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                          {emp.overtime_pay > 0 && (
                            <div style={{ fontSize: '0.72rem', color: '#0284c7' }}>
                              incl. OT PKR {emp.overtime_pay.toLocaleString()}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', color: '#dc2626' }}>
                          PKR {emp.deductions.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: isPaid ? '#16a34a' : 'var(--color-text, #0f172a)' }}>
                          PKR {emp.net_salary.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              padding: '3px 8px',
                              borderRadius: '12px',
                              background: isPaid
                                ? 'rgba(34, 197, 94, 0.14)'
                                : emp.is_finalized
                                ? 'rgba(234, 179, 8, 0.15)'
                                : 'rgba(59, 130, 246, 0.12)',
                              color: isPaid ? '#16a34a' : emp.is_finalized ? '#d97706' : '#0284c7',
                            }}
                          >
                            {isPaid ? 'PAID' : emp.is_finalized ? 'FINALIZED • UNPAID' : 'ATTENDANCE LIVE'}
                          </span>
                          {isPaid && emp.payment_reference && (
                            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted, #64748b)', marginTop: '2px' }}>
                              Ref: {emp.payment_reference}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                          {!isPaid && emp.net_salary > 0 ? (
                            <button
                              onClick={() => openPayModalForEmployees([emp])}
                              style={{
                                padding: '5px 12px',
                                borderRadius: '6px',
                                border: 'none',
                                background: '#16a34a',
                                color: '#ffffff',
                                fontSize: '0.78rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              Pay Salary
                            </button>
                          ) : isPaid ? (
                            <span style={{ fontSize: '0.78rem', color: '#16a34a', fontWeight: 600 }}>Disbursed</span>
                          ) : (
                            <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted, #64748b)' }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Sub-tab Content: Integrations */}
      {activeSubTab === 'INTEGRATIONS' && (
        <div
          style={{
            background: 'var(--color-surface, #ffffff)',
            borderRadius: '10px',
            border: '1px solid var(--color-border, #e2e8f0)',
            overflowX: 'auto',
          }}
        >
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border, #e2e8f0)', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={handleSyncAll}
              disabled={syncing}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                background: '#0284c7',
                border: 'none',
                color: '#ffffff',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {syncing ? 'Syncing...' : 'Sync Existing Finalized Payroll Runs'}
            </button>
          </div>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted, #64748b)' }}>Loading payroll runs...</div>
          ) : integrations.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted, #64748b)' }}>
              No finalized payroll runs yet. Go to <strong>Employee Attendance Salaries</strong> and click <strong>"Approve & Finalize Salaries"</strong>.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: 'var(--color-surface-secondary, #f8fafc)', textAlign: 'left', borderBottom: '1px solid var(--color-border, #e2e8f0)' }}>
                  <th style={{ padding: '12px 16px', color: 'var(--color-text-muted, #64748b)' }}>Payroll Run</th>
                  <th style={{ padding: '12px 16px', color: 'var(--color-text-muted, #64748b)' }}>Period</th>
                  <th style={{ padding: '12px 16px', color: 'var(--color-text-muted, #64748b)', textAlign: 'right' }}>Gross Payroll</th>
                  <th style={{ padding: '12px 16px', color: 'var(--color-text-muted, #64748b)', textAlign: 'right' }}>OT / Allowances</th>
                  <th style={{ padding: '12px 16px', color: 'var(--color-text-muted, #64748b)', textAlign: 'right' }}>Deductions</th>
                  <th style={{ padding: '12px 16px', color: 'var(--color-text-muted, #64748b)', textAlign: 'right' }}>Net Payable (PKR)</th>
                  <th style={{ padding: '12px 16px', color: 'var(--color-text-muted, #64748b)', textAlign: 'right' }}>Remaining</th>
                  <th style={{ padding: '12px 16px', color: 'var(--color-text-muted, #64748b)' }}>Status</th>
                  <th style={{ padding: '12px 16px', color: 'var(--color-text-muted, #64748b)', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {integrations.map((item) => {
                  const isReady = item.status === 'READY';
                  const isSettled = item.status === 'SETTLED';
                  const isBlocked = item.status === 'BLOCKED';
                  const isPartial = item.status === 'PARTIALLY_DISBURSED';

                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid var(--color-border, #e2e8f0)' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--color-text, #0f172a)' }}>{item.payroll_run_number}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #64748b)' }}>Date: {item.transaction_date}</div>
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--color-text, #0f172a)' }}>{item.payroll_period_name}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--color-text, #0f172a)' }}>
                        PKR {Number(item.gross_payroll).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', color: '#0284c7' }}>
                        PKR {(Number(item.total_overtime) + Number(item.total_allowances)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', color: '#dc2626' }}>
                        PKR {(Number(item.total_deductions) + Number(item.total_tax) + Number(item.total_advance_recovery)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--color-text, #0f172a)' }}>
                        PKR {Number(item.net_payroll_payable).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: Number(item.remaining_liability) > 0 ? '#d97706' : '#16a34a' }}>
                        PKR {Number(item.remaining_liability).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '4px',
                            backgroundColor: isSettled
                              ? 'rgba(34, 197, 94, 0.15)'
                              : isReady
                              ? 'rgba(59, 130, 246, 0.15)'
                              : isPartial
                              ? 'rgba(234, 179, 8, 0.15)'
                              : 'rgba(239, 68, 68, 0.15)',
                            color: isSettled ? '#16a34a' : isReady ? '#0284c7' : isPartial ? '#d97706' : '#dc2626',
                          }}
                        >
                          {item.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                          <button
                            onClick={() => handleOpenPreview(item.id)}
                            style={{
                              padding: '5px 10px',
                              borderRadius: '4px',
                              background: 'var(--color-surface, #ffffff)',
                              border: '1px solid var(--color-border, #cbd5e1)',
                              color: 'var(--color-text, #0f172a)',
                              fontSize: '0.78rem',
                              cursor: 'pointer',
                            }}
                          >
                            Accrual Preview
                          </button>

                          {!isSettled && !isBlocked && (
                            <button
                              onClick={() => handleOpenNewBatch(item)}
                              style={{
                                padding: '5px 12px',
                                borderRadius: '4px',
                                background: '#0284c7',
                                border: 'none',
                                color: '#ffffff',
                                fontSize: '0.78rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              + Create Batch
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Sub-tab Content: Batches */}
      {activeSubTab === 'BATCHES' && (
        <div
          style={{
            background: 'var(--color-surface, #ffffff)',
            borderRadius: '10px',
            border: '1px solid var(--color-border, #e2e8f0)',
            overflowX: 'auto',
          }}
        >
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted, #64748b)' }}>Loading salary batches...</div>
          ) : batches.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted, #64748b)' }}>
              No salary disbursement batches recorded yet. Use <strong>Pay Salary</strong> on any employee or create a batch.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: 'var(--color-surface-secondary, #f8fafc)', textAlign: 'left', borderBottom: '1px solid var(--color-border, #e2e8f0)' }}>
                  <th style={{ padding: '12px 16px', color: 'var(--color-text-muted, #64748b)' }}>Batch Number</th>
                  <th style={{ padding: '12px 16px', color: 'var(--color-text-muted, #64748b)' }}>Payroll Period</th>
                  <th style={{ padding: '12px 16px', color: 'var(--color-text-muted, #64748b)' }}>Channel</th>
                  <th style={{ padding: '12px 16px', color: 'var(--color-text-muted, #64748b)' }}>Treasury Account</th>
                  <th style={{ padding: '12px 16px', color: 'var(--color-text-muted, #64748b)', textAlign: 'center' }}>Employees</th>
                  <th style={{ padding: '12px 16px', color: 'var(--color-text-muted, #64748b)', textAlign: 'right' }}>Total Amount</th>
                  <th style={{ padding: '12px 16px', color: 'var(--color-text-muted, #64748b)' }}>Status</th>
                  <th style={{ padding: '12px 16px', color: 'var(--color-text-muted, #64748b)', textAlign: 'center' }}>Workspace</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => {
                  const isCompleted = batch.status === 'COMPLETED';
                  const isPartial = batch.status === 'PARTIALLY_COMPLETED';
                  const isFailed = batch.status === 'FAILED';

                  return (
                    <tr key={batch.id} style={{ borderBottom: '1px solid var(--color-border, #e2e8f0)' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--color-text, #0f172a)' }}>{batch.batch_number}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #64748b)' }}>Date: {batch.payment_date}</div>
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--color-text, #0f172a)' }}>{batch.payroll_period_name}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ color: 'var(--color-text, #0f172a)', fontWeight: 500 }}>{batch.payment_provider}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #64748b)' }}>{batch.payment_mode}</div>
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--color-text, #0f172a)' }}>{batch.treasury_account_title}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600 }}>{batch.total_employees}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#0284c7' }}>
                        PKR {Number(batch.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '4px',
                            backgroundColor: isCompleted
                              ? 'rgba(34, 197, 94, 0.15)'
                              : isPartial
                              ? 'rgba(234, 179, 8, 0.15)'
                              : isFailed
                              ? 'rgba(239, 68, 68, 0.15)'
                              : 'rgba(59, 130, 246, 0.15)',
                            color: isCompleted ? '#16a34a' : isPartial ? '#d97706' : isFailed ? '#dc2626' : '#0284c7',
                          }}
                        >
                          {batch.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <button
                          onClick={() => handleOpenWorkspace(batch)}
                          style={{
                            padding: '6px 14px',
                            borderRadius: '4px',
                            background: 'rgba(2, 132, 199, 0.12)',
                            border: '1px solid rgba(2, 132, 199, 0.35)',
                            color: '#0284c7',
                            fontWeight: 600,
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                          }}
                        >
                          Open Workspace &rarr;
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal: Pay Selected Guard(s) Salary */}
      {payModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1050,
            padding: '20px',
          }}
        >
          <div
            style={{
              background: 'var(--color-surface, #ffffff)',
              color: 'var(--color-text, #0f172a)',
              borderRadius: '12px',
              border: '1px solid var(--color-border, #e2e8f0)',
              width: '100%',
              maxWidth: '480px',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border, #e2e8f0)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Disburse Guard Salary</h3>
              <button onClick={() => setPayModalOpen(false)} style={{ border: 'none', background: 'none', fontSize: '18px', cursor: 'pointer' }}>
                ✕
              </button>
            </div>
            <form onSubmit={handleConfirmGuardPayment} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(2, 132, 199, 0.08)', color: '#0284c7', fontWeight: 600, fontSize: '13px' }}>
                {payTargetLabel}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Treasury Bank / Cash Account
                </label>
                <select
                  value={payTreasuryId}
                  onChange={(e) => setPayTreasuryId(e.target.value)}
                  required
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--color-border, #cbd5e1)', background: 'var(--color-surface, #ffffff)', color: 'var(--color-text, #0f172a)', fontSize: '13px' }}
                >
                  {bankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.account_title} ({b.bank_name || b.account_type}) — Bal: PKR {Number(b.current_balance || 0).toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Payment Channel</label>
                  <select
                    value={payProvider}
                    onChange={(e) => setPayProvider(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--color-border, #cbd5e1)', background: 'var(--color-surface, #ffffff)', color: 'var(--color-text, #0f172a)', fontSize: '13px' }}
                  >
                    <option value="MANUAL">Cash / Bank Transfer</option>
                    <option value="HBL">HBL</option>
                    <option value="JS_BANK">JS Bank</option>
                    <option value="DUBAI_ISLAMIC_BANK">Dubai Islamic Bank</option>
                    <option value="EASYPAISA">Easypaisa</option>
                    <option value="JAZZCASH">JazzCash</option>
                    <option value="OTHER">Other Channel</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Payment Date</label>
                  <input
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    required
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--color-border, #cbd5e1)', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Reference / Slip / Cheque #</label>
                <input
                  type="text"
                  placeholder="Optional payment reference"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--color-border, #cbd5e1)', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Notes</label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--color-border, #cbd5e1)', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setPayModalOpen(false)}
                  style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid var(--color-border, #cbd5e1)', background: 'var(--color-surface, #ffffff)', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={payingSaving}
                  style={{ padding: '8px 18px', borderRadius: '6px', border: 'none', background: '#16a34a', color: '#ffffff', fontWeight: 600, cursor: 'pointer' }}
                >
                  {payingSaving ? 'Processing Payment...' : 'Confirm & Mark Paid'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modals */}
      <PayrollAccountingPreviewModal
        isOpen={previewModalOpen}
        onClose={() => setPreviewModalOpen(false)}
        previewData={previewData}
        loading={previewLoading}
      />

      <SalaryBatchWorkspaceModal
        isOpen={workspaceModalOpen}
        onClose={() => setWorkspaceModalOpen(false)}
        batch={selectedBatch}
        onBatchUpdated={handleBatchUpdated}
      />

      <NewSalaryBatchModal
        isOpen={newBatchModalOpen}
        onClose={() => setNewBatchModalOpen(false)}
        integration={selectedIntegrationForBatch}
        bankAccounts={bankAccounts}
        onBatchCreated={() => {
          loadData();
          setActiveSubTab('BATCHES');
        }}
      />

      <PayrollMappingsModal
        isOpen={mappingsModalOpen}
        onClose={() => setMappingsModalOpen(false)}
        chartOfAccounts={chartOfAccounts}
      />
    </div>
  );
};
