import React, { useState, useEffect } from 'react';
import type {
  TaxAuthorityItem,
  BankAccountItem,
  TaxPeriodItem,
  TaxPaymentTypeEnum,
  TaxPaymentVoucherItem
} from '../api';
import {
  createTaxPaymentVoucher
} from '../api';

interface Props {
  authorities: TaxAuthorityItem[];
  bankAccounts: BankAccountItem[];
  taxPeriods: TaxPeriodItem[];
  onClose: () => void;
  onCreated: (voucher: TaxPaymentVoucherItem) => void;
}

export const NewTaxVoucherModal: React.FC<Props> = ({
  authorities,
  bankAccounts,
  taxPeriods,
  onClose,
  onCreated
}) => {
  const [authorityId, setAuthorityId] = useState(authorities[0]?.id || '');
  const [accountId, setAccountId] = useState(bankAccounts[0]?.id || '');
  const [periodId, setPeriodId] = useState('');
  const [taxType, setTaxType] = useState<TaxPaymentTypeEnum>('SALES_TAX');
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [psidNumber, setPsidNumber] = useState('');
  const [challanNumber, setChallanNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authorities.length > 0 && !authorityId) setAuthorityId(authorities[0].id);
    if (bankAccounts.length > 0 && !accountId) setAccountId(bankAccounts[0].id);
  }, [authorities, bankAccounts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authorityId || !accountId || !amount) {
      setError('Please select a Tax Authority, Treasury Bank Account, and enter a payment amount.');
      return;
    }
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Amount must be a positive number.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const voucher = await createTaxPaymentVoucher({
        tax_authority: authorityId,
        treasury_account: accountId,
        amount: numAmount,
        payment_date: paymentDate,
        tax_type: taxType,
        tax_period: periodId || null,
        psid_number: psidNumber,
        challan_number: challanNumber,
        notes
      });
      onCreated(voucher);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to create tax payment voucher.');
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
        maxWidth: '560px',
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
            <span style={{ fontSize: '22px' }}>🏛️</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 600 }}>Create Tax Payment Voucher</h3>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                Deposit taxes to Tax Authority & link with Treasury Bank Account
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>Tax Authority *</label>
              <select
                value={authorityId}
                onChange={e => setAuthorityId(e.target.value)}
                required
                style={{
                  width: '100%', padding: '10px', borderRadius: '8px',
                  background: 'var(--color-bg, #0f172a)', border: '1px solid var(--color-border, #334155)',
                  color: '#fff', fontSize: '13px'
                }}
              >
                {authorities.map(a => (
                  <option key={a.id} value={a.id}>{a.name} ({a.jurisdiction})</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>Tax Category *</label>
              <select
                value={taxType}
                onChange={e => setTaxType(e.target.value as TaxPaymentTypeEnum)}
                style={{
                  width: '100%', padding: '10px', borderRadius: '8px',
                  background: 'var(--color-bg, #0f172a)', border: '1px solid var(--color-border, #334155)',
                  color: '#fff', fontSize: '13px'
                }}
              >
                <option value="SALES_TAX">Sales Tax / Output VAT</option>
                <option value="WITHHOLDING_TAX">Withholding Tax (Vendor/Contractor)</option>
                <option value="PAYROLL_TAX">Payroll Tax (Employee Income Tax)</option>
                <option value="INCOME_TAX">Advance Corporate Income Tax</option>
                <option value="OTHER">Other Duty / Surcharge</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>Treasury Bank Account *</label>
              <select
                value={accountId}
                onChange={e => setAccountId(e.target.value)}
                required
                style={{
                  width: '100%', padding: '10px', borderRadius: '8px',
                  background: 'var(--color-bg, #0f172a)', border: '1px solid var(--color-border, #334155)',
                  color: '#fff', fontSize: '13px'
                }}
              >
                {bankAccounts.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.account_title} (PKR {Number(b.current_balance || 0).toLocaleString()})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>Payment Date *</label>
              <input
                type="date"
                value={paymentDate}
                onChange={e => setPaymentDate(e.target.value)}
                required
                style={{
                  width: '100%', padding: '10px', borderRadius: '8px',
                  background: 'var(--color-bg, #0f172a)', border: '1px solid var(--color-border, #334155)',
                  color: '#fff', fontSize: '13px'
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>Payment Amount (PKR) *</label>
              <input
                type="number"
                step="0.01"
                placeholder="e.g. 150000"
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

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>Compliance Period</label>
              <select
                value={periodId}
                onChange={e => setPeriodId(e.target.value)}
                style={{
                  width: '100%', padding: '10px', borderRadius: '8px',
                  background: 'var(--color-bg, #0f172a)', border: '1px solid var(--color-border, #334155)',
                  color: '#fff', fontSize: '13px'
                }}
              >
                <option value="">-- No Specific Period --</option>
                {taxPeriods.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.period_start} to {p.period_end})</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>PSID / e-Payment Number</label>
              <input
                type="text"
                placeholder="e.g. PSID-9901827"
                value={psidNumber}
                onChange={e => setPsidNumber(e.target.value)}
                style={{
                  width: '100%', padding: '10px', borderRadius: '8px',
                  background: 'var(--color-bg, #0f172a)', border: '1px solid var(--color-border, #334155)',
                  color: '#fff', fontSize: '13px'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>Challan Reference</label>
              <input
                type="text"
                placeholder="e.g. CH-2026-SRB-01"
                value={challanNumber}
                onChange={e => setChallanNumber(e.target.value)}
                style={{
                  width: '100%', padding: '10px', borderRadius: '8px',
                  background: 'var(--color-bg, #0f172a)', border: '1px solid var(--color-border, #334155)',
                  color: '#fff', fontSize: '13px'
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>Notes & Instructions</label>
            <textarea
              rows={2}
              placeholder="e.g. Depositing SST for July security guarding contracts."
              value={notes}
              onChange={e => setNotes(e.target.value)}
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
              {loading ? 'Creating...' : 'Create Tax Voucher'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
