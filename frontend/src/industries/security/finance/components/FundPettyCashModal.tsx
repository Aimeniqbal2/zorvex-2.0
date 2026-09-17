import React, { useState } from 'react';
import { fundPettyCash, recordPettyCashExpense } from '../api';

interface FundPettyCashModalProps {
  pettyCashAccount: any;
  bankAccounts: any[];
  categories: any[];
  costCenters: any[];
  mode: 'FUND' | 'EXPENSE';
  onClose: () => void;
  onSuccess: () => void;
}

export const FundPettyCashModal: React.FC<FundPettyCashModalProps> = ({
  pettyCashAccount,
  bankAccounts,
  categories,
  costCenters,
  mode,
  onClose,
  onSuccess
}) => {
  // Funding state
  const [fromAccount, setFromAccount] = useState(bankAccounts.find(b => b.account_type === 'BANK')?.id || '');
  const [fundAmount, setFundAmount] = useState('');
  const [fundRef, setFundRef] = useState('');

  // Routine Expense state
  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [category, setCategory] = useState('');
  const [payee, setPayee] = useState('');
  const [costCenter, setCostCenter] = useState('');
  const [receiptRef, setReceiptRef] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFundSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const amt = parseFloat(fundAmount) || 0;
    if (amt <= 0) {
      setError('Funding amount must be greater than zero.');
      return;
    }
    if (!fromAccount) {
      setError('Please select the source bank/vault account.');
      return;
    }

    setSaving(true);
    try {
      await fundPettyCash({
        from_account: fromAccount,
        to_account: pettyCashAccount.id,
        amount: amt,
        reference: fundRef || 'FLOAT-REPLENISH'
      });
      onSuccess();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const amt = parseFloat(expenseAmount) || 0;
    if (amt <= 0) {
      setError('Expense amount must be greater than zero.');
      return;
    }
    if (!expenseTitle.trim()) {
      setError('Please enter expense title.');
      return;
    }

    setSaving(true);
    try {
      await recordPettyCashExpense({
        petty_cash_account: pettyCashAccount.id,
        title: expenseTitle,
        amount: amt,
        category: category || undefined,
        payee,
        cost_center: costCenter || undefined,
        receipt_reference: receiptRef
      });
      onSuccess();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.75)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{
        background: 'var(--color-surface, #1e222b)',
        border: '1px solid var(--color-border, #333a48)',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '520px',
        maxHeight: '90vh',
        overflowY: 'auto',
        color: 'var(--color-text, #fff)',
        boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--color-border, #333a48)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>
              {mode === 'FUND' ? 'Replenish Petty Cash Float' : 'Record Petty Cash Outflow'}
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--color-text-secondary, #94a3b8)' }}>
              Account: <strong>{pettyCashAccount.account_title}</strong> (Balance: PKR {parseFloat(pettyCashAccount.operational_balance || pettyCashAccount.current_balance || 0).toLocaleString()})
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-text-secondary, #94a3b8)',
              fontSize: '1.5rem',
              cursor: 'pointer',
              lineHeight: 1
            }}
          >
            ×
          </button>
        </div>

        {error && (
          <div style={{
            margin: '16px 24px 0',
            padding: '10px 14px',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid #ef4444',
            borderRadius: '8px',
            color: '#fca5a5',
            fontSize: '0.85rem'
          }}>
            {error}
          </div>
        )}

        {mode === 'FUND' ? (
          <form onSubmit={handleFundSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 500 }}>
                Source Bank / Vault Account *
              </label>
              <select
                value={fromAccount}
                onChange={e => setFromAccount(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border, #333a48)',
                  background: 'var(--color-background, #14171f)',
                  color: '#fff',
                  fontSize: '0.9rem'
                }}
              >
                <option value="">-- Select Source Account --</option>
                {bankAccounts.filter(b => b.id !== pettyCashAccount.id).map(b => (
                  <option key={b.id} value={b.id}>
                    {b.account_title} ({b.account_type}) - PKR {parseFloat(b.current_balance || 0).toLocaleString()}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 500 }}>
                  Replenishment Amount (PKR) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={fundAmount}
                  onChange={e => setFundAmount(e.target.value)}
                  placeholder="0.00"
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border, #333a48)',
                    background: 'var(--color-background, #14171f)',
                    color: '#fff',
                    fontSize: '0.9rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 500 }}>
                  Transfer Reference
                </label>
                <input
                  type="text"
                  value={fundRef}
                  onChange={e => setFundRef(e.target.value)}
                  placeholder="e.g. TR-FLOAT-SEP01"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border, #333a48)',
                    background: 'var(--color-background, #14171f)',
                    color: '#fff',
                    fontSize: '0.9rem'
                  }}
                />
              </div>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              marginTop: '12px',
              paddingTop: '16px',
              borderTop: '1px solid var(--color-border, #333a48)'
            }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--color-border, #333a48)',
                  borderRadius: '6px',
                  color: 'var(--color-text, #fff)',
                  padding: '10px 18px',
                  fontSize: '0.9rem',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                style={{
                  background: '#059669',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  padding: '10px 22px',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.7 : 1
                }}
              >
                {saving ? 'Transferring...' : 'Execute Float Funding'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleExpenseSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 500 }}>
                Expense Description *
              </label>
              <input
                type="text"
                value={expenseTitle}
                onChange={e => setExpenseTitle(e.target.value)}
                placeholder="e.g. Office Tea, Cleaning Supplies & Postage"
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border, #333a48)',
                  background: 'var(--color-background, #14171f)',
                  color: '#fff',
                  fontSize: '0.9rem'
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 500 }}>
                  Amount (PKR) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={expenseAmount}
                  onChange={e => setExpenseAmount(e.target.value)}
                  placeholder="0.00"
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border, #333a48)',
                    background: 'var(--color-background, #14171f)',
                    color: '#fff',
                    fontSize: '0.9rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 500 }}>
                  Category
                </label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border, #333a48)',
                    background: 'var(--color-background, #14171f)',
                    color: '#fff',
                    fontSize: '0.9rem'
                  }}
                >
                  <option value="">-- Select Category --</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 500 }}>
                  Payee
                </label>
                <input
                  type="text"
                  value={payee}
                  onChange={e => setPayee(e.target.value)}
                  placeholder="e.g. Local Stationer"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border, #333a48)',
                    background: 'var(--color-background, #14171f)',
                    color: '#fff',
                    fontSize: '0.9rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 500 }}>
                  Cost Center
                </label>
                <select
                  value={costCenter}
                  onChange={e => setCostCenter(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border, #333a48)',
                    background: 'var(--color-background, #14171f)',
                    color: '#fff',
                    fontSize: '0.9rem'
                  }}
                >
                  <option value="">-- General --</option>
                  {costCenters.map(cc => (
                    <option key={cc.id} value={cc.id}>{cc.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 500 }}>
                  Receipt Ref #
                </label>
                <input
                  type="text"
                  value={receiptRef}
                  onChange={e => setReceiptRef(e.target.value)}
                  placeholder="e.g. CASH-SLIP-42"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border, #333a48)',
                    background: 'var(--color-background, #14171f)',
                    color: '#fff',
                    fontSize: '0.9rem'
                  }}
                />
              </div>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              marginTop: '12px',
              paddingTop: '16px',
              borderTop: '1px solid var(--color-border, #333a48)'
            }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--color-border, #333a48)',
                  borderRadius: '6px',
                  color: 'var(--color-text, #fff)',
                  padding: '10px 18px',
                  fontSize: '0.9rem',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                style={{
                  background: 'var(--color-primary, #3b82f6)',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  padding: '10px 22px',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.7 : 1
                }}
              >
                {saving ? 'Recording...' : 'Disburse Cash'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
