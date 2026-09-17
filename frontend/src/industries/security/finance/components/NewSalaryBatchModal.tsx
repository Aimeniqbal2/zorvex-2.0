import React, { useState } from 'react';
import type {
  PayrollAccountingIntegrationItem,
  BankAccount,
  SalaryPaymentBatchItem,
} from '../api';
import { createSalaryBatch } from '../api';

interface NewSalaryBatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  integration: PayrollAccountingIntegrationItem | null;
  bankAccounts: BankAccount[];
  onBatchCreated: (batch: SalaryPaymentBatchItem) => void;
}

export const NewSalaryBatchModal: React.FC<NewSalaryBatchModalProps> = ({
  isOpen,
  onClose,
  integration,
  bankAccounts,
  onBatchCreated,
}) => {
  const [treasuryAccountId, setTreasuryAccountId] = useState(bankAccounts[0]?.id || '');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMode, setPaymentMode] = useState<'MANUAL' | 'BANK_FILE' | 'API' | 'HOST_TO_HOST'>('MANUAL');
  const [paymentProvider, setPaymentProvider] = useState<'MANUAL' | 'HBL' | 'JS_BANK' | 'DUBAI_ISLAMIC_BANK' | 'EASYPAISA' | 'JAZZCASH' | 'OTHER'>('MANUAL');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Selected snapshot IDs (defaults to all unpaid/failed snapshots)
  const unpaidSnapshots = (integration?.employee_snapshots || []).filter(
    (s) => s.payment_status === 'UNPAID' || s.payment_status === 'FAILED'
  );
  const [selectedIds, setSelectedIds] = useState<string[]>(unpaidSnapshots.map((s) => s.id));

  if (!isOpen || !integration) return null;

  const toggleSelectAll = () => {
    if (selectedIds.length === unpaidSnapshots.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(unpaidSnapshots.map((s) => s.id));
    }
  };

  const toggleSnapshot = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((item) => item !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const selectedTotal = unpaidSnapshots
    .filter((s) => selectedIds.includes(s.id))
    .reduce((acc, curr) => acc + Number(curr.net_salary || 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!treasuryAccountId) {
      setErrorMsg('Please select a Treasury Bank/Cash Account.');
      return;
    }
    if (selectedIds.length === 0) {
      setErrorMsg('Please select at least one employee for this salary disbursement batch.');
      return;
    }

    try {
      setSubmitting(true);
      setErrorMsg(null);
      const newBatch = await createSalaryBatch({
        payroll_integration: integration.id,
        treasury_account: treasuryAccountId,
        payment_date: paymentDate,
        payment_mode: paymentMode,
        payment_provider: paymentProvider,
        selected_snapshot_ids: selectedIds,
        notes,
      });

      onBatchCreated(newBatch);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || 'Failed to create salary payment batch.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: 'var(--color-surface, #1e293b)',
        border: '1px solid var(--color-border, #334155)',
        borderRadius: '12px',
        width: '800px',
        maxWidth: '95vw',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
        color: 'var(--color-text, #f8fafc)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--color-border, #334155)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
              ➕ Create Salary Disbursement Batch
            </h2>
            <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '4px' }}>
              Payroll: <strong>{integration.payroll_period_name}</strong> (Liability: PKR {Number(integration.remaining_liability).toLocaleString()})
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.5rem',
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            &times;
          </button>
        </div>

        {errorMsg && (
          <div style={{ margin: '16px 24px 0', padding: '10px 14px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', color: '#ef4444', fontSize: '0.85rem' }}>
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {/* Treasury Account */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px', fontWeight: 500 }}>
                  Disbursement Treasury Account *
                </label>
                <select
                  value={treasuryAccountId}
                  onChange={(e) => setTreasuryAccountId(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid var(--color-border, #334155)',
                    color: '#f8fafc',
                    fontSize: '0.9rem',
                  }}
                >
                  <option value="">-- Select Treasury Account --</option>
                  {bankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.account_title} ({b.account_type}) - PKR {Number(b.current_balance || 0).toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>

              {/* Payment Date */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px', fontWeight: 500 }}>
                  Payment / Disbursal Date *
                </label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid var(--color-border, #334155)',
                    color: '#f8fafc',
                    fontSize: '0.9rem',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {/* Payment Mode */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px', fontWeight: 500 }}>
                  Disbursement Mode
                </label>
                <select
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid var(--color-border, #334155)',
                    color: '#f8fafc',
                    fontSize: '0.9rem',
                  }}
                >
                  <option value="MANUAL">Manual Bank / Cash Confirmation</option>
                  <option value="BANK_FILE">Bank Payment File (CSV Export)</option>
                  <option value="API">Corporate Banking API</option>
                  <option value="HOST_TO_HOST">Host-to-Host File System</option>
                </select>
              </div>

              {/* Payment Provider */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px', fontWeight: 500 }}>
                  Banking / Wallet Provider
                </label>
                <select
                  value={paymentProvider}
                  onChange={(e) => setPaymentProvider(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid var(--color-border, #334155)',
                    color: '#f8fafc',
                    fontSize: '0.9rem',
                  }}
                >
                  <option value="MANUAL">Manual / Cash</option>
                  <option value="HBL">Habib Bank Limited (HBL)</option>
                  <option value="JS_BANK">JS Bank Corporate</option>
                  <option value="DUBAI_ISLAMIC_BANK">Dubai Islamic Bank (DIB)</option>
                  <option value="EASYPAISA">Easypaisa Corporate Bulk</option>
                  <option value="JAZZCASH">JazzCash Corporate Bulk</option>
                  <option value="OTHER">Other Banking Provider</option>
                </select>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px', fontWeight: 500 }}>
                Batch Reference & Notes (Optional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. 1st Tranche — Operations Field Guards Disbursal"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid var(--color-border, #334155)',
                  color: '#f8fafc',
                  fontSize: '0.9rem',
                }}
              />
            </div>

            {/* Employee Selection List */}
            <div style={{ marginTop: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: 600 }}>
                  Select Employees to Include ({selectedIds.length} of {unpaidSnapshots.length})
                </label>
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#60a5fa',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  {selectedIds.length === unpaidSnapshots.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              <div style={{
                maxHeight: '220px',
                overflowY: 'auto',
                border: '1px solid var(--color-border, #334155)',
                borderRadius: '6px',
                background: 'rgba(0, 0, 0, 0.2)',
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <tbody>
                    {unpaidSnapshots.map((s) => {
                      const isSelected = selectedIds.includes(s.id);
                      return (
                        <tr
                          key={s.id}
                          onClick={() => toggleSnapshot(s.id)}
                          style={{
                            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                            cursor: 'pointer',
                            backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                          }}
                        >
                          <td style={{ padding: '8px 12px', width: '30px' }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              style={{ cursor: 'pointer' }}
                            />
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <span style={{ fontWeight: 600, color: '#f8fafc' }}>{s.employee_name || 'Employee'}</span>
                            <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: '6px' }}>({s.employee_code})</span>
                          </td>
                          <td style={{ padding: '8px 12px', color: '#94a3b8' }}>
                            {s.department_name || 'Operations'}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#f8fafc' }}>
                            PKR {Number(s.net_salary).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Batch Total Summary */}
            <div style={{
              padding: '12px 16px',
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '8px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span style={{ fontSize: '0.9rem', color: '#93c5fd', fontWeight: 500 }}>
                Selected Batch Total ({selectedIds.length} employees):
              </span>
              <span style={{ fontSize: '1.15rem', color: '#60a5fa', fontWeight: 700 }}>
                PKR {selectedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Footer */}
          <div style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--color-border, #334155)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            background: 'rgba(0, 0, 0, 0.1)',
          }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                background: 'transparent',
                border: '1px solid var(--color-border, #334155)',
                color: '#cbd5e1',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || selectedIds.length === 0}
              style={{
                padding: '8px 20px',
                borderRadius: '6px',
                background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                border: 'none',
                color: '#ffffff',
                fontWeight: 600,
                cursor: 'pointer',
                opacity: submitting || selectedIds.length === 0 ? 0.6 : 1,
              }}
            >
              {submitting ? 'Creating Batch...' : 'Create Batch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
