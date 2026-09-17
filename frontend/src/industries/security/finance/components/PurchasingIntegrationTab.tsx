import React, { useState, useEffect, useTransition } from 'react';
import type {
  PurchasingAccountingIntegrationItem,
  PurchasingSummaryMetrics,
  PurchasingAccountingLinePreviewItem,
  ChartOfAccount,
  CostCenter,
  ProfitCenter,
} from '../api';
import {
  fetchPurchasingIntegrations,
  fetchPurchasingSummaryMetrics,
  syncPurchasingIntegrations,
  previewPurchasingAccounting,
  refreshPurchasingIntegration,
  fetchChartOfAccounts,
  fetchCostCenters,
  fetchProfitCenters,
} from '../api';
import { AccountingPreviewModal } from './AccountingPreviewModal';
import { ReclassifyLineModal } from './ReclassifyLineModal';
import { PurchasingMappingsModal } from './PurchasingMappingsModal';

export const PurchasingIntegrationTab: React.FC = () => {
  const [, startTransition] = useTransition();

  // Data state
  const [integrations, setIntegrations] = useState<PurchasingAccountingIntegrationItem[]>([]);
  const [metrics, setMetrics] = useState<PurchasingSummaryMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [activeSubTab, setActiveSubTab] = useState<'ALL' | 'BILLS_READY' | 'PAYMENTS' | 'RETURNS_CREDITS' | 'BLOCKED'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Reference lookups for reclassification
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [profitCenters, setProfitCenters] = useState<ProfitCenter[]>([]);

  // Modals
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [selectedPreview, setSelectedPreview] = useState<{
    title: string;
    sourceNumber: string;
    sourceType: string;
    status: string;
    blockingReason?: string;
    lines: PurchasingAccountingLinePreviewItem[];
  } | null>(null);

  const [reclassifyModalOpen, setReclassifyModalOpen] = useState(false);
  const [selectedLineToReclassify, setSelectedLineToReclassify] = useState<PurchasingAccountingLinePreviewItem | null>(null);

  const [mappingsModalOpen, setMappingsModalOpen] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [intList, met, accs, ccs, pcs] = await Promise.all([
        fetchPurchasingIntegrations(),
        fetchPurchasingSummaryMetrics().catch(() => null),
        fetchChartOfAccounts().catch(() => []),
        fetchCostCenters().catch(() => []),
        fetchProfitCenters().catch(() => []),
      ]);
      setIntegrations(intList);
      setMetrics(met);
      setAccounts(accs);
      setCostCenters(ccs);
      setProfitCenters(pcs);
    } catch (err: any) {
      setError(err.message || 'Failed to load purchasing integrations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSyncAll = async () => {
    setSyncing(true);
    setError(null);
    try {
      const resp = await syncPurchasingIntegrations();
      await loadData();
      alert(`Purchasing Sync Completed!\nTotal Synced: ${resp.total_synced} items\n- Vendor Bills: ${resp.vendor_bills_synced}\n- Vendor Payments: ${resp.vendor_payments_synced}\n- Returns: ${resp.purchase_returns_synced}\n- Credit Notes: ${resp.credit_notes_synced}`);
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Failed to sync purchasing records');
    } finally {
      setSyncing(false);
    }
  };

  const handleOpenPreview = async (item: PurchasingAccountingIntegrationItem) => {
    try {
      const preview = await previewPurchasingAccounting(item.source_type, item.source_id);
      setSelectedPreview({
        title: `Accounting Classification Preview — ${item.source_number}`,
        sourceNumber: item.source_number,
        sourceType: item.source_type,
        status: preview.status || item.status,
        blockingReason: preview.blocking_reason || item.blocking_reason,
        lines: preview.lines || item.lines || [],
      });
      setPreviewModalOpen(true);
    } catch (err: any) {
      alert(err?.response?.data?.error || err.message || 'Failed to fetch preview');
    }
  };

  const handleRefreshIntegration = async (id: string) => {
    try {
      await refreshPurchasingIntegration(id);
      await loadData();
    } catch (err: any) {
      alert(err?.response?.data?.error || err.message || 'Failed to refresh integration status');
    }
  };

  const handleLineReclassifySuccess = (updatedLine: PurchasingAccountingLinePreviewItem) => {
    if (selectedPreview) {
      setSelectedPreview({
        ...selectedPreview,
        lines: selectedPreview.lines.map((l) => (l.id === updatedLine.id ? updatedLine : l)),
      });
    }
    loadData();
  };

  // Filtered List
  const filteredIntegrations = integrations.filter((item) => {
    // Sub-tab filter
    if (activeSubTab === 'BILLS_READY') {
      if (item.source_type !== 'VENDOR_BILL' || item.status !== 'READY') return false;
    } else if (activeSubTab === 'PAYMENTS') {
      if (item.source_type !== 'VENDOR_PAYMENT') return false;
    } else if (activeSubTab === 'RETURNS_CREDITS') {
      if (item.source_type !== 'PURCHASE_RETURN' && item.source_type !== 'VENDOR_CREDIT_NOTE') return false;
    } else if (activeSubTab === 'BLOCKED') {
      if (item.status !== 'BLOCKED') return false;
    }

    // Search filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchNum = item.source_number?.toLowerCase().includes(q);
      const matchVendor = item.vendor_name?.toLowerCase().includes(q);
      const matchReason = item.blocking_reason?.toLowerCase().includes(q);
      const matchPO = item.purchase_order_number?.toLowerCase().includes(q);
      if (!matchNum && !matchVendor && !matchReason && !matchPO) return false;
    }

    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Banner & KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            backgroundColor: 'var(--color-surface, #1e293b)',
            borderRadius: '10px',
            border: '1px solid var(--color-border, #334155)',
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary, #94a3b8)', marginBottom: '4px' }}>
            Vendor Bills Ready
          </div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#4ade80' }}>
            {metrics?.total_bills_ready || 0}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-secondary, #94a3b8)', marginTop: '4px' }}>
            PKR {(metrics?.ready_amount || 0).toLocaleString()} ready for GL
          </div>
        </div>

        <div
          style={{
            padding: '16px 20px',
            backgroundColor: 'var(--color-surface, #1e293b)',
            borderRadius: '10px',
            border: '1px solid var(--color-border, #334155)',
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary, #94a3b8)', marginBottom: '4px' }}>
            Blocked Bills / Action Needed
          </div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#f87171' }}>
            {metrics?.total_bills_blocked || 0}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-secondary, #94a3b8)', marginTop: '4px' }}>
            PKR {(metrics?.blocked_amount || 0).toLocaleString()} blocked
          </div>
        </div>

        <div
          style={{
            padding: '16px 20px',
            backgroundColor: 'var(--color-surface, #1e293b)',
            borderRadius: '10px',
            border: '1px solid var(--color-border, #334155)',
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary, #94a3b8)', marginBottom: '4px' }}>
            Payments Integrated
          </div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#38bdf8' }}>
            {metrics?.payments_integrated || 0}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-secondary, #94a3b8)', marginTop: '4px' }}>
            Bank / Cash Treasury Vouchers
          </div>
        </div>

        <div
          style={{
            padding: '16px 20px',
            backgroundColor: 'var(--color-surface, #1e293b)',
            borderRadius: '10px',
            border: '1px solid var(--color-border, #334155)',
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary, #94a3b8)', marginBottom: '4px' }}>
            Returns & Vendor Credits
          </div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#c084fc' }}>
            {(metrics?.returns_integrated || 0) + (metrics?.unallocated_credits || 0)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-secondary, #94a3b8)', marginTop: '4px' }}>
            AP Reversals & Credit Notes
          </div>
        </div>
      </div>

      {/* Control Bar: Subtabs, Search, Sync, Mappings */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          padding: '14px 18px',
          backgroundColor: 'var(--color-surface, #1e293b)',
          borderRadius: '10px',
          border: '1px solid var(--color-border, #334155)',
        }}
      >
        {/* Navigation Sub-Tabs */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[
            { key: 'ALL', label: 'All Transactions' },
            { key: 'BILLS_READY', label: `Vendor Bills Ready (${metrics?.total_bills_ready || 0})` },
            { key: 'PAYMENTS', label: `Payments (${metrics?.payments_integrated || 0})` },
            { key: 'RETURNS_CREDITS', label: 'Returns & Credits' },
            { key: 'BLOCKED', label: `Blocked Items (${metrics?.total_bills_blocked || 0})` },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => startTransition(() => setActiveSubTab(tab.key as any))}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: '1px solid',
                borderColor: activeSubTab === tab.key ? 'var(--color-primary, #3b82f6)' : 'var(--color-border, #334155)',
                backgroundColor: activeSubTab === tab.key ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                color: activeSubTab === tab.key ? 'var(--color-text, #f8fafc)' : 'var(--color-text-secondary, #94a3b8)',
                fontSize: '12px',
                fontWeight: activeSubTab === tab.key ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Search vendor, invoice #, PO..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              backgroundColor: 'var(--color-surface-sunken, #0f172a)',
              border: '1px solid var(--color-border, #334155)',
              color: 'var(--color-text, #f8fafc)',
              fontSize: '12px',
              minWidth: '220px',
            }}
          />

          <button
            onClick={() => setMappingsModalOpen(true)}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              backgroundColor: 'var(--color-surface-hover, #334155)',
              border: '1px solid var(--color-border, #475569)',
              color: 'var(--color-text, #f8fafc)',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            ⚙️ Account Mappings
          </button>

          <button
            onClick={handleSyncAll}
            disabled={syncing}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              backgroundColor: 'var(--color-primary, #3b82f6)',
              border: 'none',
              color: '#fff',
              fontSize: '12px',
              fontWeight: 600,
              cursor: syncing ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            🔄 {syncing ? 'Syncing...' : 'Sync Purchasing'}
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#fca5a5',
            fontSize: '13px',
          }}
        >
          {error}
        </div>
      )}

      {/* Main Table */}
      <div
        style={{
          backgroundColor: 'var(--color-surface, #1e293b)',
          borderRadius: '10px',
          border: '1px solid var(--color-border, #334155)',
          overflow: 'hidden',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr
              style={{
                backgroundColor: 'var(--color-surface-sunken, #0f172a)',
                borderBottom: '1px solid var(--color-border, #334155)',
                color: 'var(--color-text-secondary, #94a3b8)',
              }}
            >
              <th style={{ textAlign: 'left', padding: '12px 14px', fontWeight: 500 }}>Source & Ref</th>
              <th style={{ textAlign: 'left', padding: '12px 14px', fontWeight: 500 }}>Type</th>
              <th style={{ textAlign: 'left', padding: '12px 14px', fontWeight: 500 }}>Vendor / Payee</th>
              <th style={{ textAlign: 'left', padding: '12px 14px', fontWeight: 500 }}>Date</th>
              <th style={{ textAlign: 'left', padding: '12px 14px', fontWeight: 500 }}>AP Control / Treasury Link</th>
              <th style={{ textAlign: 'right', padding: '12px 14px', fontWeight: 500 }}>Amount (PKR)</th>
              <th style={{ textAlign: 'center', padding: '12px 14px', fontWeight: 500 }}>Status</th>
              <th style={{ textAlign: 'center', padding: '12px 14px', fontWeight: 500 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                  Loading purchasing integration records...
                </td>
              </tr>
            ) : filteredIntegrations.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                  No integration records found matching the current criteria.
                </td>
              </tr>
            ) : (
              filteredIntegrations.map((item) => (
                <tr
                  key={item.id}
                  style={{
                    borderBottom: '1px solid var(--color-border, #334155)',
                    backgroundColor: item.status === 'BLOCKED' ? 'rgba(239, 68, 68, 0.04)' : 'transparent',
                  }}
                >
                  {/* Source & Ref */}
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--color-text, #f8fafc)' }}>{item.source_number}</div>
                    {item.purchase_order_number && (
                      <div style={{ fontSize: '11px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                        PO: {item.purchase_order_number}
                      </div>
                    )}
                    {item.grn_number && (
                      <div style={{ fontSize: '11px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                        GRN: {item.grn_number}
                      </div>
                    )}
                  </td>

                  {/* Type */}
                  <td style={{ padding: '12px 14px' }}>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 600,
                        backgroundColor:
                          item.source_type === 'VENDOR_BILL'
                            ? 'rgba(59, 130, 246, 0.15)'
                            : item.source_type === 'VENDOR_PAYMENT'
                            ? 'rgba(34, 197, 94, 0.15)'
                            : 'rgba(168, 85, 247, 0.15)',
                        color:
                          item.source_type === 'VENDOR_BILL'
                            ? '#60a5fa'
                            : item.source_type === 'VENDOR_PAYMENT'
                            ? '#4ade80'
                            : '#c084fc',
                      }}
                    >
                      {item.source_type.replace('_', ' ')}
                    </span>
                  </td>

                  {/* Vendor */}
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ fontWeight: 500 }}>{item.vendor_name || '—'}</div>
                  </td>

                  {/* Date */}
                  <td style={{ padding: '12px 14px', color: 'var(--color-text-secondary, #94a3b8)', whiteSpace: 'nowrap' }}>
                    {item.transaction_date}
                  </td>

                  {/* AP Control / Voucher */}
                  <td style={{ padding: '12px 14px', fontSize: '12px' }}>
                    {item.ap_control_account_code ? (
                      <div>
                        <span style={{ fontWeight: 600, color: '#38bdf8' }}>{item.ap_control_account_code}</span> — {item.ap_control_account_name}
                      </div>
                    ) : item.voucher_number ? (
                      <div>
                        <span style={{ fontWeight: 600, color: '#4ade80' }}>Voucher:</span> {item.voucher_number}
                      </div>
                    ) : (
                      <span style={{ color: 'var(--color-text-secondary, #94a3b8)' }}>—</span>
                    )}
                  </td>

                  {/* Amount */}
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {parseFloat(item.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>

                  {/* Status */}
                  <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 600,
                        backgroundColor:
                          item.status === 'READY'
                            ? 'rgba(34, 197, 94, 0.2)'
                            : item.status === 'BLOCKED'
                            ? 'rgba(239, 68, 68, 0.2)'
                            : 'rgba(234, 179, 8, 0.2)',
                        color:
                          item.status === 'READY'
                            ? '#4ade80'
                            : item.status === 'BLOCKED'
                            ? '#f87171'
                            : '#facc15',
                      }}
                    >
                      {item.status}
                    </span>
                    {item.unresolved_lines_count > 0 && (
                      <div style={{ fontSize: '10px', color: '#f87171', marginTop: '2px' }}>
                        {item.unresolved_lines_count} unmapped line{item.unresolved_lines_count > 1 ? 's' : ''}
                      </div>
                    )}
                  </td>

                  {/* Actions */}
                  <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '6px' }}>
                      <button
                        onClick={() => handleOpenPreview(item)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          backgroundColor: 'var(--color-surface-hover, #334155)',
                          border: '1px solid var(--color-border, #475569)',
                          color: 'var(--color-text, #f8fafc)',
                          fontSize: '11px',
                          cursor: 'pointer',
                        }}
                      >
                        👁️ GL Preview
                      </button>
                      <button
                        onClick={() => handleRefreshIntegration(item.id)}
                        title="Re-evaluate classification & rules"
                        style={{
                          padding: '4px 8px',
                          borderRadius: '6px',
                          backgroundColor: 'var(--color-surface-hover, #334155)',
                          border: '1px solid var(--color-border, #475569)',
                          color: 'var(--color-text-secondary, #94a3b8)',
                          fontSize: '11px',
                          cursor: 'pointer',
                        }}
                      >
                        🔄
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Accounting Preview Modal */}
      {selectedPreview && (
        <AccountingPreviewModal
          isOpen={previewModalOpen}
          onClose={() => setPreviewModalOpen(false)}
          title={selectedPreview.title}
          sourceNumber={selectedPreview.sourceNumber}
          sourceType={selectedPreview.sourceType}
          status={selectedPreview.status}
          blockingReason={selectedPreview.blockingReason}
          lines={selectedPreview.lines}
          onOpenReclassify={(line) => {
            setSelectedLineToReclassify(line);
            setReclassifyModalOpen(true);
          }}
        />
      )}

      {/* Reclassify Line Modal */}
      {selectedLineToReclassify && (
        <ReclassifyLineModal
          isOpen={reclassifyModalOpen}
          onClose={() => setReclassifyModalOpen(false)}
          line={selectedLineToReclassify}
          accounts={accounts}
          costCenters={costCenters}
          profitCenters={profitCenters}
          onSuccess={handleLineReclassifySuccess}
        />
      )}

      {/* Purchasing Mappings Modal */}
      <PurchasingMappingsModal
        isOpen={mappingsModalOpen}
        onClose={() => setMappingsModalOpen(false)}
        accounts={accounts}
        onMappingsChanged={loadData}
      />
    </div>
  );
};
