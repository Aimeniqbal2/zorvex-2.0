import React, { useState } from 'react';
import { AccountingPeriodsTab } from './AccountingPeriodsTab';

export const FinancialControlsTab: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'periods' | 'bank_recon' | 'cash_counts' | 'snapshots' | 'yearend'>('periods');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', gap: '10px', borderBottom: '1px solid #334155', paddingBottom: '8px' }}>
        <button
          onClick={() => setActiveSubTab('periods')}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            background: activeSubTab === 'periods' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
            color: activeSubTab === 'periods' ? '#38bdf8' : '#94a3b8',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.85rem'
          }}
        >
          📅 Period Close Manager
        </button>
        <button
          onClick={() => setActiveSubTab('bank_recon')}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            background: activeSubTab === 'bank_recon' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
            color: activeSubTab === 'bank_recon' ? '#38bdf8' : '#94a3b8',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.85rem'
          }}
        >
          🏦 Bank Statement Reconciliation
        </button>
        <button
          onClick={() => setActiveSubTab('cash_counts')}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            background: activeSubTab === 'cash_counts' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
            color: activeSubTab === 'cash_counts' ? '#38bdf8' : '#94a3b8',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.85rem'
          }}
        >
          💵 Physical Cash Count Manager
        </button>
        <button
          onClick={() => setActiveSubTab('yearend')}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            background: activeSubTab === 'yearend' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
            color: activeSubTab === 'yearend' ? '#38bdf8' : '#94a3b8',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.85rem'
          }}
        >
          🔒 Year-End Close Engine
        </button>
      </div>

      {activeSubTab === 'periods' && <AccountingPeriodsTab />}
      {activeSubTab === 'bank_recon' && (
        <div style={{ padding: '24px', background: 'var(--color-surface, #1e293b)', borderRadius: '12px', border: '1px solid #334155' }}>
          <h3 style={{ margin: '0 0 12px 0', color: '#f8fafc' }}>🏦 Bank Statement Auto-Matching & Reconciliation</h3>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
            Import bank statements (CSV/OFX hash-protected) and match against posted Treasury Vouchers, Cheques, and Vendor Payments within ±5 day windows.
          </p>
        </div>
      )}
      {activeSubTab === 'cash_counts' && (
        <div style={{ padding: '24px', background: 'var(--color-surface, #1e293b)', borderRadius: '12px', border: '1px solid #334155' }}>
          <h3 style={{ margin: '0 0 12px 0', color: '#f8fafc' }}>💵 Physical Cash Inventory Count</h3>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
            Record physical cash counts per petty cash vault and calculate variances against GL system balances.
          </p>
        </div>
      )}
      {activeSubTab === 'yearend' && (
        <div style={{ padding: '24px', background: 'var(--color-surface, #1e293b)', borderRadius: '12px', border: '1px solid #334155' }}>
          <h3 style={{ margin: '0 0 12px 0', color: '#f8fafc' }}>🔒 Year-End Closing Engine</h3>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
            Clears Revenue, Cost of Service, Expense, and Other Income nominal accounts to Retained Earnings (3200) idempotently.
          </p>
        </div>
      )}
    </div>
  );
};
