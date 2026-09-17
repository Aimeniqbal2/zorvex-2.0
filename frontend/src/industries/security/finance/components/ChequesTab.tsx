import React, { useState, useEffect } from 'react';
import type { ChequeItem, ChequeStatus, BankAccount } from '../api';
import {
  fetchCheques,
  createCheque,
  depositCheque,
  clearCheque,
  bounceCheque,
  fetchBankAccounts,
} from '../api';

export const ChequesTab: React.FC = () => {
  const [cheques, setCheques] = useState<ChequeItem[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [selectedAccount, setSelectedAccount] = useState<string>('');

  // Register Modal
  const [showRegisterModal, setShowRegisterModal] = useState<boolean>(false);
  const [newChequeNum, setNewChequeNum] = useState<string>('');
  const [newAmount, setNewAmount] = useState<string>('');
  const [newIssueDate, setNewIssueDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [newDueDate] = useState<string>('');
  const [newPayee, setNewPayee] = useState<string>('');
  const [newPayer, setNewPayer] = useState<string>('');
  const [newDrawerBank, setNewDrawerBank] = useState<string>('');
  const [newStatus, setNewStatus] = useState<ChequeStatus>('RECEIVED');
  const [newBankAccountId, setNewBankAccountId] = useState<string>('');
  const [registerSubmitting, setRegisterSubmitting] = useState<boolean>(false);

  // Deposit Modal
  const [depositChequeItem, setDepositChequeItem] = useState<ChequeItem | null>(null);
  const [depositTargetAccountId, setDepositTargetAccountId] = useState<string>('');

  // Bounce Modal
  const [bounceChequeItem, setBounceChequeItem] = useState<ChequeItem | null>(null);
  const [bounceReason, setBounceReason] = useState<string>('');

  // Clear Prompt
  const [clearChequeItem, setClearChequeItem] = useState<ChequeItem | null>(null);
  const [clearingDate, setClearingDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const loadCheques = async () => {
    try {
      setLoading(true);
      setError(null);
      const [cRes, bRes] = await Promise.all([
        fetchCheques({
          search: searchQuery || undefined,
          status: selectedStatus || undefined,
          bank_account: selectedAccount || undefined
        }),
        fetchBankAccounts()
      ]);
      setCheques(cRes);
      setBankAccounts(bRes);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to load cheques.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCheques();
  }, [selectedStatus, selectedAccount]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadCheques();
  };

  const handleRegisterCheque = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChequeNum || !newAmount) {
      alert('Cheque number and amount are required.');
      return;
    }
    try {
      setRegisterSubmitting(true);
      await createCheque({
        cheque_number: newChequeNum,
        amount: newAmount,
        issue_date: newIssueDate,
        due_date: newDueDate || undefined,
        payee_name: newPayee,
        payer_name: newPayer,
        drawer_bank: newDrawerBank,
        status: newStatus,
        bank_account: newBankAccountId || undefined
      });
      setShowRegisterModal(false);
      setNewChequeNum('');
      setNewAmount('');
      setNewPayee('');
      setNewPayer('');
      setNewDrawerBank('');
      loadCheques();
    } catch (err: any) {
      alert(err?.response?.data?.detail || err?.message || 'Failed to register cheque.');
    } finally {
      setRegisterSubmitting(false);
    }
  };

  const handleExecuteDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!depositChequeItem || !depositTargetAccountId) return;
    try {
      await depositCheque(depositChequeItem.id, depositTargetAccountId);
      setDepositChequeItem(null);
      loadCheques();
    } catch (err: any) {
      alert(err?.response?.data?.detail || err?.message || 'Failed to deposit cheque.');
    }
  };

  const handleExecuteClear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clearChequeItem) return;
    try {
      await clearCheque(clearChequeItem.id, clearingDate);
      setClearChequeItem(null);
      loadCheques();
    } catch (err: any) {
      alert(err?.response?.data?.detail || err?.message || 'Failed to clear cheque.');
    }
  };

  const handleExecuteBounce = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bounceChequeItem || !bounceReason.trim()) {
      alert('Bounce reason is required.');
      return;
    }
    try {
      await bounceCheque(bounceChequeItem.id, bounceReason);
      setBounceChequeItem(null);
      setBounceReason('');
      loadCheques();
    } catch (err: any) {
      alert(err?.response?.data?.detail || err?.message || 'Failed to record bounced cheque.');
    }
  };

  // Metrics
  const unclearedCheques = cheques.filter((c) => ['ISSUED', 'RECEIVED', 'DEPOSITED'].includes(c.status));
  const unclearedAmount = unclearedCheques.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
  const clearedChequesCount = cheques.filter((c) => c.status === 'CLEARED').length;
  const bouncedChequesCount = cheques.filter((c) => c.status === 'BOUNCED').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header & Quick Action */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#f8fafc' }}>
            Cheque Registry & Clearance Engine
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
            Track client receipt cheques, issued vendor cheques, bank deposits, and clearing states.
          </p>
        </div>
        <button
          onClick={() => setShowRegisterModal(true)}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            background: 'linear-gradient(135deg, #a855f7 0%, #9333ea 100%)',
            color: '#fff',
            border: 'none',
            fontWeight: 600,
            fontSize: '13px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 2px 4px rgba(147,51,234,0.2)'
          }}
        >
          <span>➕</span> Register Cheque
        </button>
      </div>

      {/* Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
        <div style={{ background: '#1e293b', padding: '14px 18px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8' }}>Uncleared Cheques Float</div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#c084fc', marginTop: '4px' }}>
            PKR {unclearedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{unclearedCheques.length} pending clearance</div>
        </div>

        <div style={{ background: '#1e293b', padding: '14px 18px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8' }}>Cleared Cheques</div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#4ade80', marginTop: '4px' }}>{clearedChequesCount}</div>
        </div>

        <div style={{ background: '#1e293b', padding: '14px 18px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8' }}>Bounced / Returned</div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#f87171', marginTop: '4px' }}>{bouncedChequesCount}</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          <input
            type="text"
            placeholder="Search by Cheque #, Payee, Payer, Bank..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ flex: 1, minWidth: '220px', padding: '8px 12px', borderRadius: '6px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
          />

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '6px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
          >
            <option value="">All Cheque Statuses</option>
            <option value="RECEIVED">Received</option>
            <option value="DEPOSITED">Deposited</option>
            <option value="ISSUED">Issued</option>
            <option value="CLEARED">Cleared</option>
            <option value="BOUNCED">Bounced</option>
            <option value="CANCELLED">Cancelled</option>
          </select>

          <select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '6px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
          >
            <option value="">All Bank Accounts</option>
            {bankAccounts.map((b) => (
              <option key={b.id} value={b.id}>
                {b.account_title}
              </option>
            ))}
          </select>

          <button
            type="submit"
            style={{ padding: '8px 16px', borderRadius: '6px', background: '#3b82f6', color: '#fff', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
          >
            Search
          </button>
        </form>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', borderRadius: '6px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {/* Cheques Table */}
      <div style={{ background: '#1e293b', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8', fontSize: '12px', background: 'rgba(15,23,42,0.4)' }}>
                <th style={{ padding: '12px 14px' }}>Cheque #</th>
                <th style={{ padding: '12px 14px' }}>Status</th>
                <th style={{ padding: '12px 14px' }}>Issue Date</th>
                <th style={{ padding: '12px 14px' }}>Payee / Payer</th>
                <th style={{ padding: '12px 14px' }}>Drawer Bank</th>
                <th style={{ padding: '12px 14px' }}>Deposit Account</th>
                <th style={{ padding: '12px 14px', textAlign: 'right' }}>Amount (PKR)</th>
                <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
                    Loading cheques...
                  </td>
                </tr>
              ) : cheques.length > 0 ? (
                cheques.map((c) => {
                  const isReceived = c.status === 'RECEIVED';
                  const isDeposited = c.status === 'DEPOSITED';
                  const isIssued = c.status === 'ISSUED';
                  const isCleared = c.status === 'CLEARED';
                  const isBounced = c.status === 'BOUNCED';

                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '12px 14px', color: '#c084fc', fontWeight: 600 }}>{c.cheque_number}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontWeight: 600,
                            background: isCleared
                              ? 'rgba(34,197,94,0.15)'
                              : isBounced
                              ? 'rgba(239,68,68,0.15)'
                              : isDeposited
                              ? 'rgba(59,130,246,0.15)'
                              : 'rgba(245,158,11,0.15)',
                            color: isCleared
                              ? '#4ade80'
                              : isBounced
                              ? '#f87171'
                              : isDeposited
                              ? '#60a5fa'
                              : '#fbbf24'
                          }}
                        >
                          {c.status_display || c.status}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', color: '#cbd5e1' }}>{c.issue_date}</td>
                      <td style={{ padding: '12px 14px', color: '#f8fafc', fontWeight: 500 }}>
                        {c.payee_name || c.payer_name || '—'}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#94a3b8' }}>{c.drawer_bank || '—'}</td>
                      <td style={{ padding: '12px 14px', color: '#94a3b8' }}>{c.bank_account_title || '—'}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', color: '#38bdf8', fontWeight: 700 }}>
                        {Number(c.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                          {isReceived && (
                            <button
                              onClick={() => setDepositChequeItem(c)}
                              style={{ padding: '4px 8px', borderRadius: '4px', background: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)', fontSize: '11px', cursor: 'pointer' }}
                            >
                              Deposit
                            </button>
                          )}
                          {(isDeposited || isIssued) && (
                            <button
                              onClick={() => setClearChequeItem(c)}
                              style={{ padding: '4px 8px', borderRadius: '4px', background: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)', fontSize: '11px', cursor: 'pointer' }}
                            >
                              Clear
                            </button>
                          )}
                          {(isDeposited || isIssued || isReceived) && (
                            <button
                              onClick={() => setBounceChequeItem(c)}
                              style={{ padding: '4px 8px', borderRadius: '4px', background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', fontSize: '11px', cursor: 'pointer' }}
                            >
                              Bounce
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>
                    No cheques found matching the criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Register Cheque Modal */}
      {showRegisterModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '24px' }}>
          <div style={{ background: '#0f172a', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)', width: '100%', maxWidth: '500px', padding: '24px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 700, color: '#f8fafc' }}>
              Register Cheque
            </h3>
            <form onSubmit={handleRegisterCheque} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Cheque Number *</label>
                  <input
                    type="text"
                    value={newChequeNum}
                    onChange={(e) => setNewChequeNum(e.target.value)}
                    required
                    placeholder="e.g. 00891234"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Amount (PKR) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                    required
                    placeholder="0.00"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Issue Date *</label>
                  <input
                    type="date"
                    value={newIssueDate}
                    onChange={(e) => setNewIssueDate(e.target.value)}
                    required
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Status *</label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as ChequeStatus)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
                  >
                    <option value="RECEIVED">Received (From Client)</option>
                    <option value="ISSUED">Issued (To Vendor/Employee)</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Payee / Payer Name</label>
                <input
                  type="text"
                  value={newPayee}
                  onChange={(e) => setNewPayee(e.target.value)}
                  placeholder="Entity name"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Drawer Bank Name</label>
                <input
                  type="text"
                  value={newDrawerBank}
                  onChange={(e) => setNewDrawerBank(e.target.value)}
                  placeholder="e.g. Meezan Bank / HBL / MCB"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Bank Account (If already assigned)</label>
                <select
                  value={newBankAccountId}
                  onChange={(e) => setNewBankAccountId(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
                >
                  <option value="">None / Pending Deposit</option>
                  {bankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.account_title}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  style={{ padding: '8px 14px', borderRadius: '6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#94a3b8', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={registerSubmitting}
                  style={{ padding: '8px 16px', borderRadius: '6px', background: '#a855f7', border: 'none', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
                >
                  {registerSubmitting ? 'Registering...' : 'Save Cheque'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deposit Modal */}
      {depositChequeItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '24px' }}>
          <div style={{ background: '#0f172a', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)', width: '100%', maxWidth: '440px', padding: '24px' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>
              Deposit Cheque #{depositChequeItem.cheque_number}
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#94a3b8' }}>
              Select the corporate bank account into which this cheque (PKR {Number(depositChequeItem.amount).toLocaleString()}) is deposited.
            </p>
            <form onSubmit={handleExecuteDeposit}>
              <select
                value={depositTargetAccountId}
                onChange={(e) => setDepositTargetAccountId(e.target.value)}
                required
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px', marginBottom: '16px' }}
              >
                <option value="">Select target bank account...</option>
                {bankAccounts.filter(b => b.account_type === 'BANK').map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.account_title} ({b.bank_name})
                  </option>
                ))}
              </select>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setDepositChequeItem(null)}
                  style={{ padding: '8px 14px', borderRadius: '6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#94a3b8', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 16px', borderRadius: '6px', background: '#3b82f6', border: 'none', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
                >
                  Confirm Deposit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Clear Cheque Modal */}
      {clearChequeItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '24px' }}>
          <div style={{ background: '#0f172a', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)', width: '100%', maxWidth: '400px', padding: '24px' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 700, color: '#4ade80' }}>
              Clear Cheque #{clearChequeItem.cheque_number}
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#94a3b8' }}>
              Confirm cheque clearance of PKR {Number(clearChequeItem.amount).toLocaleString()}.
            </p>
            <form onSubmit={handleExecuteClear}>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Clearing Date *</label>
              <input
                type="date"
                value={clearingDate}
                onChange={(e) => setClearingDate(e.target.value)}
                required
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px', marginBottom: '16px' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setClearChequeItem(null)}
                  style={{ padding: '8px 14px', borderRadius: '6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#94a3b8', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 16px', borderRadius: '6px', background: '#10b981', border: 'none', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
                >
                  Mark Cleared
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bounce Cheque Modal */}
      {bounceChequeItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '24px' }}>
          <div style={{ background: '#0f172a', borderRadius: '10px', border: '1px solid rgba(239,68,68,0.3)', width: '100%', maxWidth: '440px', padding: '24px' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 700, color: '#f87171' }}>
              Mark Cheque #{bounceChequeItem.cheque_number} as Bounced
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#cbd5e1' }}>
              Record returned or dishonored cheque status.
            </p>
            <form onSubmit={handleExecuteBounce}>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Bounce Reason *</label>
              <textarea
                value={bounceReason}
                onChange={(e) => setBounceReason(e.target.value)}
                required
                rows={3}
                placeholder="Reason for bounce (e.g. Insufficient funds / signature mismatch)..."
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px', marginBottom: '16px' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setBounceChequeItem(null)}
                  style={{ padding: '8px 14px', borderRadius: '6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#94a3b8', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 16px', borderRadius: '6px', background: '#ef4444', border: 'none', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
                >
                  Confirm Bounce
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
