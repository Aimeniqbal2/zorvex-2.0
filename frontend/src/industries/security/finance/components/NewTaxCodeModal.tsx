import React, { useState } from 'react';
import type {
  TaxCategoryType,
  TaxRecoverabilityType,
  TaxAuthorityItem,
  COAItem,
  TaxCodeItem
} from '../api';
import axios from 'axios';

interface Props {
  authorities: TaxAuthorityItem[];
  accounts: COAItem[];
  onClose: () => void;
  onCreated: (taxCode: TaxCodeItem) => void;
}

export const NewTaxCodeModal: React.FC<Props> = ({
  authorities,
  accounts,
  onClose,
  onCreated
}) => {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [rate, setRate] = useState('');
  const [taxCategory, setTaxCategory] = useState<TaxCategoryType>('OUTPUT_TAX');
  const [recoverability, setRecoverability] = useState<TaxRecoverabilityType>('RECOVERABLE');
  const [authorityId, setAuthorityId] = useState(authorities[0]?.id || '');
  const [jurisdiction, setJurisdiction] = useState('Federal');
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().split('T')[0]);
  const [effectiveTo, setEffectiveTo] = useState('');
  const [outputAccId, setOutputAccId] = useState('');
  const [inputAccId, setInputAccId] = useState('');
  const [whtPayAccId, setWhtPayAccId] = useState('');
  const [whtRecAccId, setWhtRecAccId] = useState('');
  const [isWithholding, setIsWithholding] = useState(false);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !name || !rate) {
      setError('Please provide Code, Name, and Tax Rate.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const resp = await axios.post(
        '/api/finance/tax-codes/',
        {
          code,
          name,
          rate: parseFloat(rate),
          tax_category: taxCategory,
          recoverability,
          tax_authority: authorityId || null,
          jurisdiction,
          effective_from: effectiveFrom,
          effective_to: effectiveTo || null,
          is_withholding: isWithholding || taxCategory.includes('WITHHOLDING'),
          output_tax_account: outputAccId || null,
          input_tax_account: inputAccId || null,
          withholding_payable_account: whtPayAccId || null,
          withholding_receivable_account: whtRecAccId || null,
          description
        },
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      onCreated(resp.data);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to create tax code.');
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
            <span style={{ fontSize: '22px' }}>⚙️</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 600 }}>Create New Tax Code</h3>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                Configure statutory rate and GL ledger mapping
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
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>Tax Code (Unique) *</label>
              <input
                type="text"
                placeholder="e.g. SST-13"
                value={code}
                onChange={e => setCode(e.target.value)}
                required
                style={{
                  width: '100%', padding: '10px', borderRadius: '8px',
                  background: 'var(--color-bg, #0f172a)', border: '1px solid var(--color-border, #334155)',
                  color: '#fff', fontSize: '13px', fontWeight: 600
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>Tax Rate (%) *</label>
              <input
                type="number"
                step="0.0001"
                placeholder="e.g. 13.00"
                value={rate}
                onChange={e => setRate(e.target.value)}
                required
                style={{
                  width: '100%', padding: '10px', borderRadius: '8px',
                  background: 'var(--color-bg, #0f172a)', border: '1px solid var(--color-border, #334155)',
                  color: '#fff', fontSize: '13px', fontWeight: 600
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>Tax Code Name *</label>
            <input
              type="text"
              placeholder="e.g. Sindh Sales Tax on Security Guarding Services"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              style={{
                width: '100%', padding: '10px', borderRadius: '8px',
                background: 'var(--color-bg, #0f172a)', border: '1px solid var(--color-border, #334155)',
                color: '#fff', fontSize: '13px'
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>Tax Category *</label>
              <select
                value={taxCategory}
                onChange={e => setTaxCategory(e.target.value as TaxCategoryType)}
                style={{
                  width: '100%', padding: '10px', borderRadius: '8px',
                  background: 'var(--color-bg, #0f172a)', border: '1px solid var(--color-border, #334155)',
                  color: '#fff', fontSize: '13px'
                }}
              >
                <option value="OUTPUT_TAX">Output Tax (Sales Tax on Revenue)</option>
                <option value="INPUT_TAX">Input Tax (Purchase Tax on Purchases)</option>
                <option value="WITHHOLDING_RECEIVABLE">Withholding Receivable (Client Deducted)</option>
                <option value="WITHHOLDING_PAYABLE">Withholding Payable (Vendor Deducted)</option>
                <option value="PAYROLL_TAX">Payroll Tax (Employee Income Tax)</option>
                <option value="OTHER_TAX">Other Duty / Surcharge</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>Recoverability</label>
              <select
                value={recoverability}
                onChange={e => setRecoverability(e.target.value as TaxRecoverabilityType)}
                style={{
                  width: '100%', padding: '10px', borderRadius: '8px',
                  background: 'var(--color-bg, #0f172a)', border: '1px solid var(--color-border, #334155)',
                  color: '#fff', fontSize: '13px'
                }}
              >
                <option value="RECOVERABLE">Fully Recoverable (Asset)</option>
                <option value="NON_RECOVERABLE">Non-Recoverable (Expense/Asset Cost)</option>
                <option value="PARTIALLY_RECOVERABLE">Partially Recoverable</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>Tax Authority</label>
              <select
                value={authorityId}
                onChange={e => setAuthorityId(e.target.value)}
                style={{
                  width: '100%', padding: '10px', borderRadius: '8px',
                  background: 'var(--color-bg, #0f172a)', border: '1px solid var(--color-border, #334155)',
                  color: '#fff', fontSize: '13px'
                }}
              >
                <option value="">-- None / Generic --</option>
                {authorities.map(a => (
                  <option key={a.id} value={a.id}>{a.name} ({a.jurisdiction})</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>Jurisdiction</label>
              <input
                type="text"
                placeholder="e.g. Sindh / Federal / Punjab"
                value={jurisdiction}
                onChange={e => setJurisdiction(e.target.value)}
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
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>Effective From *</label>
              <input
                type="date"
                value={effectiveFrom}
                onChange={e => setEffectiveFrom(e.target.value)}
                required
                style={{
                  width: '100%', padding: '10px', borderRadius: '8px',
                  background: 'var(--color-bg, #0f172a)', border: '1px solid var(--color-border, #334155)',
                  color: '#fff', fontSize: '13px'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>Effective To (Optional)</label>
              <input
                type="date"
                value={effectiveTo}
                onChange={e => setEffectiveTo(e.target.value)}
                style={{
                  width: '100%', padding: '10px', borderRadius: '8px',
                  background: 'var(--color-bg, #0f172a)', border: '1px solid var(--color-border, #334155)',
                  color: '#fff', fontSize: '13px'
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>Primary GL Posting Account</label>
            <select
              value={taxCategory === 'OUTPUT_TAX' ? outputAccId : (taxCategory === 'INPUT_TAX' ? inputAccId : (taxCategory === 'WITHHOLDING_RECEIVABLE' ? whtRecAccId : whtPayAccId))}
              onChange={e => {
                const val = e.target.value;
                if (taxCategory === 'OUTPUT_TAX') setOutputAccId(val);
                else if (taxCategory === 'INPUT_TAX') setInputAccId(val);
                else if (taxCategory === 'WITHHOLDING_RECEIVABLE') setWhtRecAccId(val);
                else setWhtPayAccId(val);
              }}
              style={{
                width: '100%', padding: '10px', borderRadius: '8px',
                background: 'var(--color-bg, #0f172a)', border: '1px solid var(--color-border, #334155)',
                color: '#fff', fontSize: '13px'
              }}
            >
              <option value="">-- Use System Default Control Account --</option>
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>{acc.account_code} - {acc.account_name} ({acc.account_type})</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', marginBottom: '10px' }}>
              <input
                type="checkbox"
                checked={isWithholding}
                onChange={e => setIsWithholding(e.target.checked)}
              />
              <span>Is Withholding Tax Rule (Deducted at source)</span>
            </label>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>Description / Statutory Reference</label>
            <textarea
              rows={2}
              placeholder="e.g. SRB Section 3(1) - Security services tax"
              value={description}
              onChange={e => setDescription(e.target.value)}
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
              {loading ? 'Creating...' : 'Create Tax Code'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
