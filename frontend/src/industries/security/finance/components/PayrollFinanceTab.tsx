import React, { useState, useEffect } from 'react';
import type {
  PayrollAccountingIntegrationItem,
  SalaryPaymentBatchItem,
  PayrollFinanceSummaryMetrics,
  BankAccount,
  ChartOfAccount,
  PayrollAccountingPreviewItem,
} from '../api';
import {
  fetchPayrollIntegrations,
  fetchSalaryBatches,
  fetchPayrollFinanceSummaryMetrics,
  syncPayrollRun,
  fetchPayrollIntegrationPreview,
  fetchBankAccounts,
  fetchChartOfAccounts,
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
  const [integrations, setIntegrations] = useState<PayrollAccountingIntegrationItem[]>([]);
  const [batches, setBatches] = useState<SalaryPaymentBatchItem[]>([]);
  const [metrics, setMetrics] = useState<PayrollFinanceSummaryMetrics | null>(null);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>(initialBankAccounts || []);
  const [chartOfAccounts, setChartOfAccounts] = useState<ChartOfAccount[]>(initialChartOfAccounts || []);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'INTEGRATIONS' | 'BATCHES'>('INTEGRATIONS');

  // Modals state
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewData, setPreviewData] = useState<PayrollAccountingPreviewItem | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<SalaryPaymentBatchItem | null>(null);

  const [newBatchModalOpen, setNewBatchModalOpen] = useState(false);
  const [selectedIntegrationForBatch, setSelectedIntegrationForBatch] = useState<PayrollAccountingIntegrationItem | null>(null);

  const [mappingsModalOpen, setMappingsModalOpen] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [intData, batchData, metricData, banks, coas] = await Promise.all([
        fetchPayrollIntegrations(),
        fetchSalaryBatches(),
        fetchPayrollFinanceSummaryMetrics().catch(() => null),
        fetchBankAccounts().catch(() => []),
        fetchChartOfAccounts().catch(() => []),
      ]);
      setIntegrations(intData);
      setBatches(batchData);
      if (metricData) setMetrics(metricData);
      if (banks && banks.length) setBankAccounts(banks);
      if (coas && coas.length) setChartOfAccounts(coas);
    } catch (err: any) {
      console.error('Failed to load payroll finance data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSyncAll = async () => {
    try {
      setSyncing(true);
      await syncPayrollRun();
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to sync finalized payroll runs.');
    } finally {
      setSyncing(false);
    }
  };

  const handleOpenPreview = async (integrationId: string) => {
    try {
      setPreviewLoading(true);
      setPreviewModalOpen(true);
      const data = await fetchPayrollIntegrationPreview(integrationId);
      setPreviewData(data);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to generate accounting preview.');
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header Toolbar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'var(--color-surface, #1e293b)',
        padding: '16px 20px',
        borderRadius: '10px',
        border: '1px solid var(--color-border, #334155)',
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>👥</span> Payroll & Salary Finance Workspace
            <span style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              background: 'rgba(34, 197, 94, 0.15)',
              color: '#22c55e',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              padding: '2px 8px',
              borderRadius: '9999px',
            }}>
              Phase S-4G Certified
            </span>
          </h1>
          <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '4px' }}>
            Recognize HRM payroll liabilities, map direct guard/staff costs, and manage multi-channel salary disbursements.
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setMappingsModalOpen(true)}
            style={{
              padding: '8px 14px',
              borderRadius: '6px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--color-border, #334155)',
              color: '#f8fafc',
              fontSize: '0.85rem',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            ⚙️ GL Routing Mappings
          </button>

          <button
            onClick={handleSyncAll}
            disabled={syncing}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
              border: 'none',
              color: '#ffffff',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            🔄 {syncing ? 'Syncing...' : 'Sync Finalized Payrolls'}
          </button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '16px',
      }}>
        <div style={{
          background: 'var(--color-surface, #1e293b)',
          padding: '16px',
          borderRadius: '10px',
          border: '1px solid var(--color-border, #334155)',
        }}>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Net Payroll Recognized
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f8fafc', marginTop: '6px' }}>
            PKR {Number(metrics?.total_net_payable || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
            Across {metrics?.total_payroll_runs || integrations.length} finalized payroll runs
          </div>
        </div>

        <div style={{
          background: 'var(--color-surface, #1e293b)',
          padding: '16px',
          borderRadius: '10px',
          border: '1px solid var(--color-border, #334155)',
        }}>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Total Salary Disbursed
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#22c55e', marginTop: '6px' }}>
            PKR {Number(metrics?.total_salary_paid || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
            Confirmed via Treasury Vouchers
          </div>
        </div>

        <div style={{
          background: 'var(--color-surface, #1e293b)',
          padding: '16px',
          borderRadius: '10px',
          border: '1px solid var(--color-border, #334155)',
        }}>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Outstanding Payroll Liability
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f59e0b', marginTop: '6px' }}>
            PKR {Number(metrics?.outstanding_payroll_liability || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
            Remaining net wages to disburse
          </div>
        </div>

        <div style={{
          background: 'var(--color-surface, #1e293b)',
          padding: '16px',
          borderRadius: '10px',
          border: '1px solid var(--color-border, #334155)',
        }}>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Salary Payment Batches
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#38bdf8', marginTop: '6px' }}>
            {batches.length} Batches
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
            {batches.filter((b) => b.status === 'COMPLETED').length} settled | {batches.filter((b) => b.status !== 'COMPLETED').length} active/pending
          </div>
        </div>
      </div>

      {/* Sub-tab Navigation */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--color-border, #334155)', paddingBottom: '2px' }}>
        <button
          onClick={() => setActiveSubTab('INTEGRATIONS')}
          style={{
            padding: '8px 16px',
            background: 'transparent',
            border: 'none',
            borderBottom: activeSubTab === 'INTEGRATIONS' ? '2px solid #3b82f6' : '2px solid transparent',
            color: activeSubTab === 'INTEGRATIONS' ? '#60a5fa' : '#94a3b8',
            fontWeight: 600,
            fontSize: '0.9rem',
            cursor: 'pointer',
          }}
        >
          📋 Finalized Payroll Recognitions ({integrations.length})
        </button>

        <button
          onClick={() => setActiveSubTab('BATCHES')}
          style={{
            padding: '8px 16px',
            background: 'transparent',
            border: 'none',
            borderBottom: activeSubTab === 'BATCHES' ? '2px solid #3b82f6' : '2px solid transparent',
            color: activeSubTab === 'BATCHES' ? '#60a5fa' : '#94a3b8',
            fontWeight: 600,
            fontSize: '0.9rem',
            cursor: 'pointer',
          }}
        >
          🏦 Salary Disbursement Batches ({batches.length})
        </button>
      </div>

      {/* Sub-tab Content: Integrations */}
      {activeSubTab === 'INTEGRATIONS' && (
        <div style={{
          background: 'var(--color-surface, #1e293b)',
          borderRadius: '10px',
          border: '1px solid var(--color-border, #334155)',
          overflow: 'hidden',
        }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading payroll records...</div>
          ) : integrations.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
              No finalized payroll runs integrated yet. Click <strong>"Sync Finalized Payrolls"</strong> to pull approved payroll runs.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: 'rgba(0, 0, 0, 0.2)', textAlign: 'left', borderBottom: '1px solid var(--color-border, #334155)' }}>
                  <th style={{ padding: '12px 16px', color: '#94a3b8' }}>Payroll Run</th>
                  <th style={{ padding: '12px 16px', color: '#94a3b8' }}>Period</th>
                  <th style={{ padding: '12px 16px', color: '#94a3b8', textAlign: 'right' }}>Gross Payroll</th>
                  <th style={{ padding: '12px 16px', color: '#94a3b8', textAlign: 'right' }}>Overtime / Allowances</th>
                  <th style={{ padding: '12px 16px', color: '#94a3b8', textAlign: 'right' }}>Deductions / Adv. Rec.</th>
                  <th style={{ padding: '12px 16px', color: '#94a3b8', textAlign: 'right' }}>Net Payable (PKR)</th>
                  <th style={{ padding: '12px 16px', color: '#94a3b8', textAlign: 'right' }}>Remaining Liability</th>
                  <th style={{ padding: '12px 16px', color: '#94a3b8' }}>Status</th>
                  <th style={{ padding: '12px 16px', color: '#94a3b8', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {integrations.map((item) => {
                  const isReady = item.status === 'READY';
                  const isSettled = item.status === 'SETTLED';
                  const isBlocked = item.status === 'BLOCKED';
                  const isPartial = item.status === 'PARTIALLY_DISBURSED';

                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 600, color: '#f8fafc' }}>{item.payroll_run_number}</div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Date: {item.transaction_date}</div>
                      </td>

                      <td style={{ padding: '12px 16px', color: '#cbd5e1' }}>
                        {item.payroll_period_name}
                      </td>

                      <td style={{ padding: '12px 16px', textAlign: 'right', color: '#cbd5e1' }}>
                        PKR {Number(item.gross_payroll).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>

                      <td style={{ padding: '12px 16px', textAlign: 'right', color: '#38bdf8' }}>
                        PKR {(Number(item.total_overtime) + Number(item.total_allowances)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>

                      <td style={{ padding: '12px 16px', textAlign: 'right', color: '#f87171' }}>
                        PKR {(Number(item.total_deductions) + Number(item.total_tax) + Number(item.total_advance_recovery)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>

                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#f8fafc' }}>
                        PKR {Number(item.net_payroll_payable).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>

                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: Number(item.remaining_liability) > 0 ? '#f59e0b' : '#22c55e' }}>
                        PKR {Number(item.remaining_liability).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>

                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '4px',
                          backgroundColor:
                            isSettled ? 'rgba(34, 197, 94, 0.2)' :
                            isReady ? 'rgba(59, 130, 246, 0.2)' :
                            isPartial ? 'rgba(234, 179, 8, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                          color:
                            isSettled ? '#22c55e' :
                            isReady ? '#60a5fa' :
                            isPartial ? '#eab308' : '#ef4444',
                        }}>
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
                              background: 'rgba(255, 255, 255, 0.08)',
                              border: '1px solid var(--color-border, #334155)',
                              color: '#f8fafc',
                              fontSize: '0.78rem',
                              cursor: 'pointer',
                            }}
                          >
                            ⚖️ Accrual Preview
                          </button>

                          {!isSettled && !isBlocked && (
                            <button
                              onClick={() => handleOpenNewBatch(item)}
                              style={{
                                padding: '5px 12px',
                                borderRadius: '4px',
                                background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                                border: 'none',
                                color: '#ffffff',
                                fontSize: '0.78rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              ➕ Create Batch
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
        <div style={{
          background: 'var(--color-surface, #1e293b)',
          borderRadius: '10px',
          border: '1px solid var(--color-border, #334155)',
          overflow: 'hidden',
        }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading salary batches...</div>
          ) : batches.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
              No salary batches created yet. Go to <strong>"Finalized Payroll Recognitions"</strong> and click <strong>"Create Batch"</strong>.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: 'rgba(0, 0, 0, 0.2)', textAlign: 'left', borderBottom: '1px solid var(--color-border, #334155)' }}>
                  <th style={{ padding: '12px 16px', color: '#94a3b8' }}>Batch Number</th>
                  <th style={{ padding: '12px 16px', color: '#94a3b8' }}>Payroll Period</th>
                  <th style={{ padding: '12px 16px', color: '#94a3b8' }}>Disbursement Channel</th>
                  <th style={{ padding: '12px 16px', color: '#94a3b8' }}>Treasury Bank</th>
                  <th style={{ padding: '12px 16px', color: '#94a3b8', textAlign: 'center' }}>Employees</th>
                  <th style={{ padding: '12px 16px', color: '#94a3b8', textAlign: 'right' }}>Total Amount (PKR)</th>
                  <th style={{ padding: '12px 16px', color: '#94a3b8' }}>Status</th>
                  <th style={{ padding: '12px 16px', color: '#94a3b8', textAlign: 'center' }}>Workspace</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => {
                  const isCompleted = batch.status === 'COMPLETED';
                  const isPartial = batch.status === 'PARTIALLY_COMPLETED';
                  const isFailed = batch.status === 'FAILED';

                  return (
                    <tr key={batch.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 600, color: '#f8fafc' }}>{batch.batch_number}</div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Date: {batch.payment_date}</div>
                      </td>

                      <td style={{ padding: '12px 16px', color: '#cbd5e1' }}>
                        {batch.payroll_period_name}
                      </td>

                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ color: '#f8fafc', fontWeight: 500 }}>{batch.payment_provider}</div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{batch.payment_mode}</div>
                      </td>

                      <td style={{ padding: '12px 16px', color: '#cbd5e1' }}>
                        {batch.treasury_account_title}
                      </td>

                      <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600 }}>
                        {batch.total_employees}
                      </td>

                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#60a5fa' }}>
                        PKR {Number(batch.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>

                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '4px',
                          backgroundColor:
                            isCompleted ? 'rgba(34, 197, 94, 0.2)' :
                            isPartial ? 'rgba(234, 179, 8, 0.2)' :
                            isFailed ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                          color:
                            isCompleted ? '#22c55e' :
                            isPartial ? '#eab308' :
                            isFailed ? '#ef4444' : '#60a5fa',
                        }}>
                          {batch.status.replace(/_/g, ' ')}
                        </span>
                      </td>

                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <button
                          onClick={() => handleOpenWorkspace(batch)}
                          style={{
                            padding: '6px 14px',
                            borderRadius: '4px',
                            background: 'rgba(59, 130, 246, 0.15)',
                            border: '1px solid rgba(59, 130, 246, 0.4)',
                            color: '#60a5fa',
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
