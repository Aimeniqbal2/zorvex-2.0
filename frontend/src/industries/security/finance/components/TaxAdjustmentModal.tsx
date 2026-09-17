import React, { useState } from 'react';
import type { TaxCodeItem, TaxPeriodItem, TaxAdjustmentItem } from '../api';
import { createTaxAdjustment } from '../api';

interface Props {
  taxCodes: TaxCodeItem[];
  taxPeriods: TaxPeriodItem[];
  onClose: () => void;
  onCreated: (adj: TaxAdjustmentItem) => void;
}

export const TaxAdjustmentModal: React.FC<Props> = ({
  taxCodes,
  taxPeriods,
  onClose,
  onCreated
}) => {
  const [taxCodeId, setTaxCodeId] = useState(taxCodes[0]?.id || '');
  const [adjType, setAdjType] = useState('INCREASE_LIABILITY');
  const [amount, setAmount] = useState('');
  const [taxDate, setTaxDate] = useState(new Date().toISOString().split('T')[0]);
  const [periodId, setPeriodId] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taxCodeId || !amount || !reason) {
      setError('Please select a Tax Code, enter an Amount, and provide an Audit Reason.');
      return;
    }
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Amount must be greater than zero.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const adj = await createTaxAdjustment({
        tax_code: taxCodeId,
        adjustment_type: adjType,
        amount: numAmount,
        reason,
        tax_date: taxDate,
        tax_period: periodId || null
      });
      onCreated(adj);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to create tax adjustment.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{
        background: 'var(--color-surface, #1e293b)',
        border: '1px solid var(--color-border, #334155)',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '520px',
        maxHeight: '90vh',
        overflowY: 'auto',
        color: 'var(--color-text, #f8fafc)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
      }}>
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid var(--color-border, #334155)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '22px' }}>⚖️</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 600 }}>Create Audited Tax Adjustment</h3>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                Adjust tax liability or recoverable balance with full audit trails
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: 'var(--color-text-secondary, #94a3b8)',
              fontSize: '20px', cursor: 'pointer'
            }}
          >×</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {error && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: '8px', padding: '12px', color: '#f87171', fontSize: '13px'
            }}>
              {error}
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>Tax Code *</label>
            <select
              value={taxCodeId}
              onChange={e => setTaxCodeId(e.target.value)}
              required
              style={{
                width: '100%', padding: '10px', borderRadius: '8px',
                background: 'var(--color-bg, #0f172a)', border: '1px solid var(--color-border, #334155)',
                color: '#fff', fontSize: '13px'
              }}
            >
              {taxCodes.map(t => (
                <option key={t.id} value={t.id}>{t.code} - {t.name} ({t.rate}%)</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>Adjustment Type *</label>
              <select
                value={adjType}
                onChange={e => setAdjType(e.target.value)}
                style={{
                  width: '100%', padding: '10px', borderRadius: '8px',
                  background: 'var(--color-bg, #0f172a)', border: '1px solid var(--color-border, #334155)',
                  color: '#fff', fontSize: '13px'
                }}
              >
                <option value="INCREASE_LIABILITY">Increase Tax Liability (Debit)</option>
                <option value="DECREASE_LIABILITY">Decrease Tax Liability (Credit)</option>
                <option value="INCREASE_RECOVERABLE">Increase Recoverable Asset</option>
                <option value="DECREASE_RECOVERABLE">Decrease Recoverable Asset</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>Adjustment Amount (PKR) *</label>
              <input
                type="number"
                step="0.01"
                placeholder="e.g. 25000"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                required
                style={{
                  width: '100%', padding: '10px', borderRadius: '8px',
                  background: 'var(--color-bg, #0f172a)', border: '1px solid var(--color-border, #334155)',
                  color: '#fff', fontSize: '13px', fontWeight: 600
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>Effective Date *</label>
              <input
                type="date"
                value={taxDate}
                onChange={e => setTaxDate(e.target.value)}
                required
                style={{
                  width: '100%', padding: '10px', borderRadius: '8px',
                  background: 'var(--color-bg, #0f172a)', border: '1px solid var(--color-border, #334155)',
                  color: '#fff', fontSize: '13px'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>Target Tax Period</label>
              <select
                value={periodId}
                onChange={e => setPeriodId(e.target.value)}
                style={{
                  width: '100%', padding: '10px', borderRadius: '8px',
                  background: 'var(--color-bg, #0f172a)', border: '1px solid var(--color-border, #334155)',
                  color: '#fff', fontSize: '13px'
                }}
              >
                <option value="">-- Optional --</option>
                {taxPeriods.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>Audit Reason & Rationale *</label>
            <textarea
              rows={3}
              placeholder="e.g. Disallowed input tax on expired vendor invoice during external tax audit."
              value={reason}
              onChange={e => setReason(e.target.value)}
              required
              style={{
                width: '100%', padding: '10px', borderRadius: '8px',
                background: 'var(--color-bg, #0f172a)', border: '1px solid var(--color-border, #334155)',
                color: '#fff', fontSize: '13px', resize: 'vertical'
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '9px 16px', borderRadius: '8px',
                background: 'transparent', border: '1px solid var(--color-border, #334155)',
                color: 'var(--color-text-secondary, #94a3b8)', fontSize: '13px', cursor: 'pointer'
              }}
            >Cancel</button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '9px 20px', borderRadius: '8px',
                background: 'var(--color-primary, #3b82f6)', border: 'none',
                color: '#fff', fontSize: '13px', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1
              }}
            >
              {loading ? 'Posting...' : 'Post Audited Adjustment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
