import React, { useState } from 'react';
import type {
  PurchasingAccountingLinePreviewItem,
  ChartOfAccount,
  CostCenter,
  ProfitCenter,
} from '../api';
import { reclassifyIntegrationLine } from '../api';

interface ReclassifyLineModalProps {
  isOpen: boolean;
  onClose: () => void;
  line: PurchasingAccountingLinePreviewItem | null;
  accounts: ChartOfAccount[];
  costCenters: CostCenter[];
  profitCenters: ProfitCenter[];
  onSuccess: (updatedLine: PurchasingAccountingLinePreviewItem) => void;
}

export const ReclassifyLineModal: React.FC<ReclassifyLineModalProps> = ({
  isOpen,
  onClose,
  line,
  accounts,
  costCenters,
  profitCenters,
  onSuccess,
}) => {
  if (!isOpen || !line) return null;

  const [debitAccountId, setDebitAccountId] = useState<string>(line.debit_account || '');
  const [creditAccountId, setCreditAccountId] = useState<string>(line.credit_account || '');
  const [costCenterId, setCostCenterId] = useState<string>(line.cost_center || '');
  const [profitCenterId, setProfitCenterId] = useState<string>(line.profit_center || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter posting-allowed, non-header accounts
  const selectableAccounts = accounts.filter((acc) => !acc.is_header && acc.allow_posting && acc.is_active);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!line) return;

    setSaving(true);
    setError(null);
    try {
      const resp = await reclassifyIntegrationLine(line.id, {
        debit_account_id: debitAccountId || undefined,
        credit_account_id: creditAccountId || undefined,
        cost_center_id: costCenterId || undefined,
        profit_center_id: profitCenterId || undefined,
      });
      onSuccess(resp.line);
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Failed to reclassify line');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--color-surface, #1e293b)',
          borderRadius: '12px',
          width: '550px',
          maxWidth: '95vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
          border: '1px solid var(--color-border, #334155)',
          color: 'var(--color-text, #f8fafc)',
        }}
      >
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--color-border, #334155)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Reclassify Line #{line.line_number}</h3>
            <span style={{ fontSize: '12px', color: 'var(--color-text-secondary, #94a3b8)' }}>
              {line.item_name || 'Line'} — PKR {parseFloat(line.amount).toLocaleString()}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '18px',
              cursor: 'pointer',
              color: 'var(--color-text-secondary, #94a3b8)',
            }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {error && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '6px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                color: '#fca5a5',
                fontSize: '13px',
                border: '1px solid rgba(239, 68, 68, 0.3)',
              }}
            >
              {error}
            </div>
          )}

          {line.is_unresolved && line.unresolved_reason && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '6px',
                backgroundColor: 'rgba(234, 179, 8, 0.15)',
                color: '#fde047',
                fontSize: '12px',
                border: '1px solid rgba(234, 179, 8, 0.3)',
              }}
            >
              ⚠️ {line.unresolved_reason}
            </div>
          )}

          {/* Debit Account */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>
              Debit Account (Asset / Expense / WIP) *
            </label>
            <select
              value={debitAccountId}
              onChange={(e) => setDebitAccountId(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                backgroundColor: 'var(--color-surface-sunken, #0f172a)',
                border: '1px solid var(--color-border, #334155)',
                color: 'var(--color-text, #f8fafc)',
                fontSize: '13px',
              }}
            >
              <option value="">Select Debit Account...</option>
              {selectableAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.account_code} — {acc.account_name} ({acc.account_type})
                </option>
              ))}
            </select>
          </div>

          {/* Credit Account */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>
              Credit Account (AP / Liability / Bank) *
            </label>
            <select
              value={creditAccountId}
              onChange={(e) => setCreditAccountId(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                backgroundColor: 'var(--color-surface-sunken, #0f172a)',
                border: '1px solid var(--color-border, #334155)',
                color: 'var(--color-text, #f8fafc)',
                fontSize: '13px',
              }}
            >
              <option value="">Select Credit Account...</option>
              {selectableAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.account_code} — {acc.account_name} ({acc.account_type})
                </option>
              ))}
            </select>
          </div>

          {/* Cost Center */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>
              Cost Center (Optional)
            </label>
            <select
              value={costCenterId}
              onChange={(e) => setCostCenterId(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                backgroundColor: 'var(--color-surface-sunken, #0f172a)',
                border: '1px solid var(--color-border, #334155)',
                color: 'var(--color-text, #f8fafc)',
                fontSize: '13px',
              }}
            >
              <option value="">No Cost Center</option>
              {costCenters.map((cc) => (
                <option key={cc.id} value={cc.id}>
                  {cc.code} — {cc.name}
                </option>
              ))}
            </select>
          </div>

          {/* Profit Center */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>
              Profit Center (Optional)
            </label>
            <select
              value={profitCenterId}
              onChange={(e) => setProfitCenterId(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                backgroundColor: 'var(--color-surface-sunken, #0f172a)',
                border: '1px solid var(--color-border, #334155)',
                color: 'var(--color-text, #f8fafc)',
                fontSize: '13px',
              }}
            >
              <option value="">No Profit Center</option>
              {profitCenters.map((pc) => (
                <option key={pc.id} value={pc.id}>
                  {pc.code} — {pc.name}
                </option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                backgroundColor: 'var(--color-surface-hover, #334155)',
                border: '1px solid var(--color-border, #475569)',
                color: 'var(--color-text, #f8fafc)',
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
                padding: '8px 18px',
                borderRadius: '6px',
                backgroundColor: 'var(--color-primary, #3b82f6)',
                border: 'none',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Saving...' : 'Save Reclassification'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
