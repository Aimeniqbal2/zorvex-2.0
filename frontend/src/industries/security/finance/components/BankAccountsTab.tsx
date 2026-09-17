import React, { useState, useEffect } from 'react';
import {
  fetchBankAccounts,
  createBankAccount,
  updateBankAccount,
  fetchChartOfAccounts,
} from '../api';
import type {
  BankAccount,
  BankAccountType,
  ChartOfAccount,
} from '../api';

const BANK_TYPE_CONFIG: Record<BankAccountType, { label: string; icon: string; color: string }> = {
  BANK: { label: 'Bank Account', icon: '🏦', color: '#38bdf8' },
  CASH: { label: 'Office Vault Cash', icon: '💵', color: '#4ade80' },
  PETTY_CASH: { label: 'Petty Cash Box', icon: '🪙', color: '#fbbf24' },
  WALLET: { label: 'Digital Wallet', icon: '📱', color: '#c084fc' },
};

export const BankAccountsTab: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [glAccounts, setGlAccounts] = useState<ChartOfAccount[]>([]);
  const [filterType, setFilterType] = useState<string>('');

  // Modal State
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editingBA, setEditingBA] = useState<BankAccount | null>(null);
  const [formData, setFormData] = useState<Partial<BankAccount>>({
    account_type: 'BANK',
    account_title: '',
    bank_name: '',
    account_number: '',
    iban: '',
    branch_name: '',
    chart_of_account: '',
    opening_balance: '0.00',
    is_active: true,
  });
  const [saving, setSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [bas, accs] = await Promise.all([
        fetchBankAccounts(),
        fetchChartOfAccounts({ account_type: 'ASSET', allow_posting: true }),
      ]);
      setBankAccounts(bas);
      setGlAccounts(accs);
    } catch (err) {
      console.error('Failed to load bank accounts', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenModal = (ba?: BankAccount) => {
    setErrorMsg(null);
    if (ba) {
      setEditingBA(ba);
      setFormData({
        account_type: ba.account_type,
        account_title: ba.account_title,
        bank_name: ba.bank_name,
        account_number: ba.account_number,
        iban: ba.iban,
        branch_name: ba.branch_name,
        chart_of_account: ba.chart_of_account,
        opening_balance: ba.opening_balance,
        is_active: ba.is_active,
      });
    } else {
      setEditingBA(null);
      setFormData({
        account_type: 'BANK',
        account_title: '',
        bank_name: '',
        account_number: '',
        iban: '',
        branch_name: '',
        chart_of_account: glAccounts.length > 0 ? glAccounts[0].id : '',
        opening_balance: '0.00',
        is_active: true,
      });
    }
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    try {
      if (editingBA) {
        await updateBankAccount(editingBA.id, formData);
      } else {
        await createBankAccount(formData);
      }
      setModalOpen(false);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.detail || JSON.stringify(err?.response?.data) || 'Failed to save bank account.');
    } finally {
      setSaving(false);
    }
  };

  const filteredAccounts = bankAccounts.filter((ba) => {
    if (filterType && ba.account_type !== filterType) return false;
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Action Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          background: 'var(--color-surface, #1e293b)',
          padding: '16px',
          borderRadius: '10px',
          border: '1px solid var(--color-border, rgba(255,255,255,0.06))',
        }}
      >
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            style={{
              padding: '8px 12px',
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '6px',
              color: '#f8fafc',
              fontSize: '13px',
            }}
          >
            <option value="">All Account Types</option>
            {Object.entries(BANK_TYPE_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>
                {v.icon} {v.label}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={() => handleOpenModal()}
          style={{
            padding: '8px 16px',
            background: '#38bdf8',
            color: '#0f172a',
            border: 'none',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          ＋ Add Bank / Cash Account
        </button>
      </div>

      {/* Grid of Bank Accounts */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading treasury accounts...</div>
      ) : filteredAccounts.length === 0 ? (
        <div
          style={{
            padding: '40px',
            textAlign: 'center',
            background: 'var(--color-surface, #1e293b)',
            borderRadius: '10px',
            color: '#94a3b8',
          }}
        >
          No bank or cash accounts configured. Click "Add Bank / Cash Account" or provision standard Security COA.
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '16px',
          }}
        >
          {filteredAccounts.map((ba) => {
            const conf = BANK_TYPE_CONFIG[ba.account_type] || BANK_TYPE_CONFIG.BANK;
            return (
              <div
                key={ba.id}
                style={{
                  background: 'var(--color-surface, #1e293b)',
                  borderRadius: '12px',
                  border: '1px solid var(--color-border, rgba(255,255,255,0.06))',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '14px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '20px' }}>{conf.icon}</span>
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: 600, color: '#f8fafc' }}>
                          {ba.account_title}
                        </div>
                        <div style={{ fontSize: '12px', color: conf.color, fontWeight: 500 }}>
                          {ba.bank_name || conf.label}
                        </div>
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: ba.is_active ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: ba.is_active ? '#4ade80' : '#f87171',
                      }}
                    >
                      {ba.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  {ba.account_number && (
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '10px' }}>
                      Acc #: <strong style={{ color: '#f8fafc', fontFamily: 'monospace' }}>{ba.account_number}</strong>
                    </div>
                  )}
                  {ba.iban && (
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px', fontFamily: 'monospace' }}>
                      IBAN: {ba.iban}
                    </div>
                  )}
                  {ba.branch_name && (
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                      Branch: {ba.branch_name}
                    </div>
                  )}

                  <div style={{ marginTop: '12px', padding: '8px 10px', background: '#0f172a', borderRadius: '6px', fontSize: '11px', color: '#94a3b8' }}>
                    Linked GL Account:{' '}
                    <strong style={{ color: '#cbd5e1' }}>
                      {ba.chart_of_account_code} - {ba.chart_of_account_name}
                    </strong>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>Current Balance</div>
                    <div style={{ fontSize: '16px', fontWeight: 700, fontFamily: 'monospace', color: '#f8fafc' }}>
                      PKR {parseFloat(ba.current_balance || '0').toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <button
                    onClick={() => handleOpenModal(ba)}
                    style={{
                      padding: '6px 12px',
                      background: 'rgba(56, 189, 248, 0.15)',
                      color: '#38bdf8',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Edit Account
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
        >
          <div
            style={{
              background: '#1e293b',
              borderRadius: '12px',
              border: '1px solid #334155',
              width: '100%',
              maxWidth: '520px',
              padding: '24px',
            }}
          >
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#f8fafc' }}>
              {editingBA ? `Edit Account: ${editingBA.account_title}` : 'Add Bank or Cash Account'}
            </h3>

            {errorMsg && (
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#fca5a5',
                  fontSize: '12px',
                  marginBottom: '12px',
                }}
              >
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                    Account Type *
                  </label>
                  <select
                    value={formData.account_type}
                    onChange={(e) => setFormData({ ...formData, account_type: e.target.value as BankAccountType })}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      background: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                    }}
                  >
                    {Object.entries(BANK_TYPE_CONFIG).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.icon} {v.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                    Account Title / Label *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Main Operations HBL"
                    value={formData.account_title}
                    onChange={(e) => setFormData({ ...formData, account_title: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      background: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              {formData.account_type === 'BANK' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                        Bank Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Habib Bank Limited"
                        value={formData.bank_name || ''}
                        onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          background: '#0f172a',
                          border: '1px solid #334155',
                          borderRadius: '6px',
                          color: '#f8fafc',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                        Account Number
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 0012345678901"
                        value={formData.account_number || ''}
                        onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          background: '#0f172a',
                          border: '1px solid #334155',
                          borderRadius: '6px',
                          color: '#f8fafc',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                        IBAN
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. PK36HABB..."
                        value={formData.iban || ''}
                        onChange={(e) => setFormData({ ...formData, iban: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          background: '#0f172a',
                          border: '1px solid #334155',
                          borderRadius: '6px',
                          color: '#f8fafc',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                        Branch Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. I.I. Chundrigar Branch"
                        value={formData.branch_name || ''}
                        onChange={(e) => setFormData({ ...formData, branch_name: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          background: '#0f172a',
                          border: '1px solid #334155',
                          borderRadius: '6px',
                          color: '#f8fafc',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                  Linked GL Asset Account *
                </label>
                <select
                  required
                  value={formData.chart_of_account}
                  onChange={(e) => setFormData({ ...formData, chart_of_account: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="">Select Asset Account...</option>
                  {glAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.account_code} - {acc.account_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                  Opening Balance (PKR)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.opening_balance}
                  onChange={(e) => setFormData({ ...formData, opening_balance: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  style={{
                    padding: '8px 14px',
                    background: '#334155',
                    color: '#cbd5e1',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    padding: '8px 16px',
                    background: '#38bdf8',
                    color: '#0f172a',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: saving ? 'not-allowed' : 'pointer',
                  }}
                >
                  {saving ? 'Saving...' : 'Save Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
