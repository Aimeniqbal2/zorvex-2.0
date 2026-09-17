import React, { useState, useEffect } from 'react';
import type {
  TreasuryDashboardData,
  AccountStatementLedger
} from '../api';
import {
  fetchTreasuryDashboard,
  fetchAccountStatementLedger,
  setAccountOpeningBalance,
  createContraTransfer
} from '../api';

interface Props {
  onNavigateToVouchers?: () => void;
  onNavigateToCheques?: () => void;
}

export const TreasuryDashboardTab: React.FC<Props> = ({ onNavigateToVouchers, onNavigateToCheques }) => {
  const [data, setData] = useState<TreasuryDashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Statement Drawer State
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [statementData, setStatementData] = useState<AccountStatementLedger | null>(null);
  const [stmtLoading, setStmtLoading] = useState<boolean>(false);
  const [stmtStartDate, setStmtStartDate] = useState<string>('');
  const [stmtEndDate, setStmtEndDate] = useState<string>('');

  // Contra Modal State
  const [showContraModal, setShowContraModal] = useState<boolean>(false);
  const [contraFromAccount, setContraFromAccount] = useState<string>('');
  const [contraToAccount, setContraToAccount] = useState<string>('');
  const [contraAmount, setContraAmount] = useState<string>('');
  const [contraDate, setContraDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [contraRef, setContraRef] = useState<string>('');
  const [contraDesc, setContraDesc] = useState<string>('');
  const [contraSubmitting, setContraSubmitting] = useState<boolean>(false);
  const [contraError, setContraError] = useState<string | null>(null);

  // Opening Balance Modal State
  const [showOpeningModal, setShowOpeningModal] = useState<boolean>(false);
  const [openingAccountId, setOpeningAccountId] = useState<string>('');
  const [openingAmount, setOpeningAmount] = useState<string>('');
  const [openingDate, setOpeningDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [openingRef, setOpeningRef] = useState<string>('');
  const [openingSubmitting, setOpeningSubmitting] = useState<boolean>(false);
  const [openingError, setOpeningError] = useState<string | null>(null);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchTreasuryDashboard();
      setData(res);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to load treasury dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const handleOpenStatement = async (accountId: string) => {
    setSelectedAccountId(accountId);
    try {
      setStmtLoading(true);
      const res = await fetchAccountStatementLedger(accountId, {
        start_date: stmtStartDate || undefined,
        end_date: stmtEndDate || undefined,
      });
      setStatementData(res);
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to load statement.');
    } finally {
      setStmtLoading(false);
    }
  };

  const handleApplyStmtFilter = async () => {
    if (!selectedAccountId) return;
    try {
      setStmtLoading(true);
      const res = await fetchAccountStatementLedger(selectedAccountId, {
        start_date: stmtStartDate || undefined,
        end_date: stmtEndDate || undefined,
      });
      setStatementData(res);
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to load filtered statement.');
    } finally {
      setStmtLoading(false);
    }
  };

  const handleExecuteContra = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contraFromAccount || !contraToAccount || !contraAmount) {
      setContraError('Source account, destination account, and amount are required.');
      return;
    }
    if (contraFromAccount === contraToAccount) {
      setContraError('Source and destination accounts must be different.');
      return;
    }
    try {
      setContraSubmitting(true);
      setContraError(null);
      await createContraTransfer({
        from_account: contraFromAccount,
        to_account: contraToAccount,
        amount: contraAmount,
        date: contraDate,
        reference: contraRef,
        description: contraDesc,
        auto_post: true,
      });
      setShowContraModal(false);
      setContraAmount('');
      setContraRef('');
      setContraDesc('');
      loadDashboard();
    } catch (err: any) {
      setContraError(err?.response?.data?.detail || err?.message || 'Failed to execute contra transfer.');
    } finally {
      setContraSubmitting(false);
    }
  };

  const handleSetOpeningBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openingAccountId || !openingAmount) {
      setOpeningError('Account and opening amount are required.');
      return;
    }
    try {
      setOpeningSubmitting(true);
      setOpeningError(null);
      await setAccountOpeningBalance(openingAccountId, {
        amount: openingAmount,
        opening_date: openingDate,
        reference: openingRef,
      });
      setShowOpeningModal(false);
      setOpeningAmount('');
      setOpeningRef('');
      loadDashboard();
    } catch (err: any) {
      setOpeningError(err?.response?.data?.detail || err?.message || 'Failed to initialize opening balance.');
    } finally {
      setOpeningSubmitting(false);
    }
  };

  if (loading && !data) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
        <div style={{ fontSize: '24px', marginBottom: '8px' }}>🏦</div>
        Loading Treasury & Cash Management...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header & Quick Action Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#f8fafc' }}>
            Treasury & Liquidity Command Center
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
            Real-time cash positions, operational bank balances, atomic contra transfers, and statement ledgers.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setShowContraModal(true)}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              color: '#fff',
              border: 'none',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 4px rgba(37,99,235,0.2)'
            }}
          >
            <span>🔄</span> New Contra Transfer
          </button>
          <button
            onClick={() => setShowOpeningModal(true)}
            style={{
              padding: '8px 14px',
              borderRadius: '6px',
              background: 'rgba(255,255,255,0.06)',
              color: '#e2e8f0',
              border: '1px solid rgba(255,255,255,0.12)',
              fontWeight: 500,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>⚖️</span> Init Opening Balance
          </button>
          {onNavigateToVouchers && (
            <button
              onClick={onNavigateToVouchers}
              style={{
                padding: '8px 14px',
                borderRadius: '6px',
                background: 'rgba(59,130,246,0.12)',
                color: '#60a5fa',
                border: '1px solid rgba(59,130,246,0.25)',
                fontWeight: 500,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>📑</span> Vouchers Register
            </button>
          )}
          {onNavigateToCheques && (
            <button
              onClick={onNavigateToCheques}
              style={{
                padding: '8px 14px',
                borderRadius: '6px',
                background: 'rgba(168,85,247,0.12)',
                color: '#c084fc',
                border: '1px solid rgba(168,85,247,0.25)',
                fontWeight: 500,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>🎫</span> Cheques Registry
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', borderRadius: '6px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {/* KPI Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        {/* Total Liquidity */}
        <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 500 }}>Total Treasury Liquidity</div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#38bdf8', marginTop: '6px' }}>
            PKR {data?.total_liquidity?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Cash + Bank + Petty Cash + Wallets</div>
        </div>

        {/* Bank Total */}
        <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 500 }}>Commercial Banks</div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#4ade80', marginTop: '6px' }}>
            PKR {data?.bank_total?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Active corporate checking accounts</div>
        </div>

        {/* Cash & Petty Cash Total */}
        <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 500 }}>Cash & Petty Floats</div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#fbbf24', marginTop: '6px' }}>
            PKR {((data?.cash_total || 0) + (data?.petty_cash_total || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Head Office Cash & Branch Petty Floats</div>
        </div>

        {/* Uncleared Cheques */}
        <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 500 }}>Uncleared Cheques Float</div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#c084fc', marginTop: '6px' }}>
            PKR {data?.uncleared_cheques_amount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
          </div>
          <div style={{ fontSize: '11px', color: '#a855f7', marginTop: '4px' }}>
            {data?.uncleared_cheques_count || 0} cheques pending deposit/clearance
          </div>
        </div>
      </div>

      {/* Treasury Accounts Overview Grid */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#f8fafc' }}>
            Treasury Accounts & Running Balances
          </h3>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>
            {data?.accounts?.length || 0} Active Treasury Accounts
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
          {data?.accounts?.map((acc) => {
            const isNegative = acc.current_balance < 0;
            return (
              <div
                key={acc.id}
                style={{
                  background: '#1e293b',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  padding: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '14px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#f8fafc' }}>{acc.account_title}</div>
                      <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                        {acc.bank_name ? `${acc.bank_name} • ` : ''}{acc.account_number || acc.account_type_display}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontWeight: 600,
                        background:
                          acc.account_type === 'BANK'
                            ? 'rgba(59,130,246,0.15)'
                            : acc.account_type === 'PETTY_CASH'
                            ? 'rgba(245,158,11,0.15)'
                            : 'rgba(16,185,129,0.15)',
                        color:
                          acc.account_type === 'BANK'
                            ? '#60a5fa'
                            : acc.account_type === 'PETTY_CASH'
                            ? '#fbbf24'
                            : '#34d399',
                        border: '1px solid rgba(255,255,255,0.08)'
                      }}
                    >
                      {acc.account_type_display}
                    </span>
                  </div>

                  <div style={{ marginTop: '16px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Operational Balance
                    </div>
                    <div
                      style={{
                        fontSize: '20px',
                        fontWeight: 700,
                        color: isNegative ? '#f87171' : '#38bdf8',
                        marginTop: '2px'
                      }}
                    >
                      {acc.currency} {acc.current_balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
                  <div style={{ fontSize: '11px', color: acc.is_opening_balance_locked ? '#10b981' : '#eab308' }}>
                    {acc.is_opening_balance_locked ? '🔒 OB Initialized' : '⚠️ OB Unlocked'}
                  </div>
                  <button
                    onClick={() => handleOpenStatement(acc.id)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '5px',
                      background: 'rgba(59,130,246,0.12)',
                      color: '#60a5fa',
                      border: '1px solid rgba(59,130,246,0.25)',
                      fontSize: '12px',
                      fontWeight: 500,
                      cursor: 'pointer'
                    }}
                  >
                    View Statement 📜
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Treasury Transactions Table */}
      <div style={{ background: '#1e293b', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#f8fafc' }}>
              Recent Operational Movements
            </h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
              Latest money-in, money-out, and contra transfers with running operational balance.
            </p>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8', fontSize: '12px' }}>
                <th style={{ padding: '10px 12px' }}>Date</th>
                <th style={{ padding: '10px 12px' }}>Account</th>
                <th style={{ padding: '10px 12px' }}>Type</th>
                <th style={{ padding: '10px 12px' }}>Reference</th>
                <th style={{ padding: '10px 12px' }}>Description</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Money In</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Money Out</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Running Balance</th>
              </tr>
            </thead>
            <tbody>
              {data?.recent_transactions && data.recent_transactions.length > 0 ? (
                data.recent_transactions.map((tx) => (
                  <tr key={tx.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '10px 12px', color: '#e2e8f0', whiteSpace: 'nowrap' }}>{tx.date}</td>
                    <td style={{ padding: '10px 12px', color: '#f8fafc', fontWeight: 500 }}>{tx.account_title}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: tx.transaction_type.includes('IN') ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                          color: tx.transaction_type.includes('IN') ? '#4ade80' : '#f87171'
                        }}
                      >
                        {tx.transaction_type_display}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#94a3b8' }}>
                      {tx.voucher_number || tx.reference || '—'}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#cbd5e1', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tx.description || '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#4ade80', fontWeight: 600 }}>
                      {tx.money_in > 0 ? tx.money_in.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#f87171', fontWeight: 600 }}>
                      {tx.money_out > 0 ? tx.money_out.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#38bdf8', fontWeight: 700 }}>
                      PKR {tx.running_balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                    No treasury transactions recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Account Statement Drawer / Modal */}
      {selectedAccountId && statementData && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            zIndex: 1000,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '24px',
            backdropFilter: 'blur(4px)'
          }}
        >
          <div
            style={{
              background: '#0f172a',
              borderRadius: '10px',
              border: '1px solid rgba(255,255,255,0.12)',
              width: '100%',
              maxWidth: '900px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)',
              overflow: 'hidden'
            }}
          >
            {/* Statement Header */}
            <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#f8fafc' }}>
                  Account Statement Ledger
                </h3>
                <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '3px' }}>
                  {statementData.bank_account.account_title} ({statementData.bank_account.bank_name || statementData.bank_account.account_type_display})
                </div>
              </div>
              <button
                onClick={() => setSelectedAccountId(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '20px',
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            </div>

            {/* Filter Bar & Summary */}
            <div style={{ padding: '16px 20px', background: '#1e293b', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="date"
                  value={stmtStartDate}
                  onChange={(e) => setStmtStartDate(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: '5px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '12px' }}
                />
                <span style={{ color: '#64748b' }}>to</span>
                <input
                  type="date"
                  value={stmtEndDate}
                  onChange={(e) => setStmtEndDate(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: '5px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '12px' }}
                />
                <button
                  onClick={handleApplyStmtFilter}
                  style={{ padding: '6px 12px', borderRadius: '5px', background: '#3b82f6', color: '#fff', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Filter
                </button>
              </div>

              <div style={{ display: 'flex', gap: '16px', fontSize: '13px' }}>
                <div>
                  <span style={{ color: '#94a3b8' }}>Total In: </span>
                  <span style={{ color: '#4ade80', fontWeight: 600 }}>+{statementData.period_money_in.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div>
                  <span style={{ color: '#94a3b8' }}>Total Out: </span>
                  <span style={{ color: '#f87171', fontWeight: 600 }}>-{statementData.period_money_out.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div>
                  <span style={{ color: '#94a3b8' }}>Closing Bal: </span>
                  <span style={{ color: '#38bdf8', fontWeight: 700 }}>PKR {statementData.closing_balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>

            {/* Statement Table Body */}
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
              {stmtLoading ? (
                <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8' }}>Loading ledger movements...</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8', fontSize: '12px' }}>
                      <th style={{ padding: '8px' }}>Date</th>
                      <th style={{ padding: '8px' }}>Type</th>
                      <th style={{ padding: '8px' }}>Reference</th>
                      <th style={{ padding: '8px' }}>Description</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Money In</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Money Out</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Running Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statementData.transactions.map((tx) => (
                      <tr key={tx.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '8px', color: '#cbd5e1' }}>{tx.date}</td>
                        <td style={{ padding: '8px' }}>
                          <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: tx.transaction_type.includes('IN') ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: tx.transaction_type.includes('IN') ? '#4ade80' : '#f87171' }}>
                            {tx.transaction_type_display}
                          </span>
                        </td>
                        <td style={{ padding: '8px', color: '#94a3b8' }}>{tx.voucher_number || tx.reference}</td>
                        <td style={{ padding: '8px', color: '#e2e8f0' }}>{tx.description}</td>
                        <td style={{ padding: '8px', textAlign: 'right', color: '#4ade80' }}>
                          {tx.money_in > 0 ? tx.money_in.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', color: '#f87171' }}>
                          {tx.money_out > 0 ? tx.money_out.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', color: '#38bdf8', fontWeight: 700 }}>
                          PKR {tx.running_balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Contra Transfer Modal */}
      {showContraModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '24px' }}>
          <div style={{ background: '#0f172a', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)', width: '100%', maxWidth: '520px', padding: '24px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 700, color: '#f8fafc' }}>
              Create Contra Transfer
            </h3>
            {contraError && (
              <div style={{ padding: '10px 14px', borderRadius: '6px', background: 'rgba(239,68,68,0.15)', color: '#fca5a5', fontSize: '12px', marginBottom: '14px' }}>
                {contraError}
              </div>
            )}
            <form onSubmit={handleExecuteContra} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Source Account (Money Out) *</label>
                <select
                  value={contraFromAccount}
                  onChange={(e) => setContraFromAccount(e.target.value)}
                  required
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
                >
                  <option value="">Select source account...</option>
                  {data?.accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.account_title} ({acc.account_type_display} - Bal: PKR {acc.current_balance.toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Destination Account (Money In) *</label>
                <select
                  value={contraToAccount}
                  onChange={(e) => setContraToAccount(e.target.value)}
                  required
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
                >
                  <option value="">Select destination account...</option>
                  {data?.accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.account_title} ({acc.account_type_display} - Bal: PKR {acc.current_balance.toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Transfer Amount *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={contraAmount}
                    onChange={(e) => setContraAmount(e.target.value)}
                    required
                    placeholder="0.00"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Transfer Date *</label>
                  <input
                    type="date"
                    value={contraDate}
                    onChange={(e) => setContraDate(e.target.value)}
                    required
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Reference # (Cheque / Slip / Wire)</label>
                <input
                  type="text"
                  value={contraRef}
                  onChange={(e) => setContraRef(e.target.value)}
                  placeholder="e.g. CHQ-881290 or ATM-WITHDRAW"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Description</label>
                <textarea
                  value={contraDesc}
                  onChange={(e) => setContraDesc(e.target.value)}
                  placeholder="Reason for transfer (e.g. Petty cash float replenishment)..."
                  rows={2}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowContraModal(false)}
                  style={{ padding: '8px 14px', borderRadius: '6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#94a3b8', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={contraSubmitting}
                  style={{ padding: '8px 16px', borderRadius: '6px', background: '#3b82f6', border: 'none', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
                >
                  {contraSubmitting ? 'Transferring...' : 'Execute Contra Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Opening Balance Modal */}
      {showOpeningModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '24px' }}>
          <div style={{ background: '#0f172a', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)', width: '100%', maxWidth: '480px', padding: '24px' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 700, color: '#f8fafc' }}>
              Initialize Opening Balance
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#94a3b8' }}>
              Set the opening operational balance for a treasury account. Once operational transactions exist, this balance will be locked.
            </p>
            {openingError && (
              <div style={{ padding: '10px 14px', borderRadius: '6px', background: 'rgba(239,68,68,0.15)', color: '#fca5a5', fontSize: '12px', marginBottom: '14px' }}>
                {openingError}
              </div>
            )}
            <form onSubmit={handleSetOpeningBalance} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Target Account *</label>
                <select
                  value={openingAccountId}
                  onChange={(e) => setOpeningAccountId(e.target.value)}
                  required
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
                >
                  <option value="">Select account...</option>
                  {data?.accounts
                    .filter((a) => !a.is_opening_balance_locked)
                    .map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.account_title} ({acc.account_type_display})
                      </option>
                    ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Opening Amount (PKR) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={openingAmount}
                    onChange={(e) => setOpeningAmount(e.target.value)}
                    required
                    placeholder="0.00"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>As Of Date *</label>
                  <input
                    type="date"
                    value={openingDate}
                    onChange={(e) => setOpeningDate(e.target.value)}
                    required
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Reference / Audit Note</label>
                <input
                  type="text"
                  value={openingRef}
                  onChange={(e) => setOpeningRef(e.target.value)}
                  placeholder="e.g. Audit Confirmed 2026 Opening Balance"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowOpeningModal(false)}
                  style={{ padding: '8px 14px', borderRadius: '6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#94a3b8', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={openingSubmitting}
                  style={{ padding: '8px 16px', borderRadius: '6px', background: '#3b82f6', border: 'none', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
                >
                  {openingSubmitting ? 'Locking...' : 'Lock Opening Balance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
