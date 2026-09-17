import React from 'react';
import type { PayrollAccountingPreviewItem } from '../api';

interface PayrollAccountingPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  previewData: PayrollAccountingPreviewItem | null;
  loading: boolean;
}

export const PayrollAccountingPreviewModal: React.FC<PayrollAccountingPreviewModalProps> = ({
  isOpen,
  onClose,
  previewData,
  loading,
}) => {
  if (!isOpen) return null;

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
        width: '900px',
        maxWidth: '95vw',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
        color: 'var(--color-text, #f8fafc)',
        padding: '24px',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--color-border, #334155)', paddingBottom: '12px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>⚖️</span> Payroll Accrual Accounting Preview
            </h2>
            <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '4px' }}>
              Run: <strong>{previewData?.payroll_run_number || 'N/A'}</strong> ({previewData?.payroll_period || 'Period'})
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

        {/* Content */}
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
            <div style={{ display: 'inline-block', width: '32px', height: '32px', border: '3px solid #3b82f6', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <div style={{ marginTop: '12px' }}>Computing Balanced Double-Entry Preview...</div>
          </div>
        ) : !previewData?.exists ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px' }}>
            {previewData?.error || 'No financial preview available for this payroll run.'}
          </div>
        ) : (
          <div>
            {/* Status Alert Banner */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              borderRadius: '8px',
              marginBottom: '20px',
              backgroundColor: previewData.is_balanced ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: `1px solid ${previewData.is_balanced ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.2rem' }}>{previewData.is_balanced ? '✅' : '⚠️'}</span>
                <div>
                  <div style={{ fontWeight: 600, color: previewData.is_balanced ? '#22c55e' : '#ef4444' }}>
                    {previewData.is_balanced ? 'Balanced Double-Entry Accrual' : 'Unbalanced Journal Preview'}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                    Debit Sum = Credit Sum (Ready for final GL posting in Phase S-4I)
                  </div>
                </div>
              </div>

              {previewData.blocking_reason && (
                <div style={{ fontSize: '0.8rem', color: '#ef4444', maxWidth: '300px' }}>
                  <strong>Blocked:</strong> {previewData.blocking_reason}
                </div>
              )}
            </div>

            {/* Table */}
            <div style={{ overflowX: 'auto', border: '1px solid var(--color-border, #334155)', borderRadius: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ background: 'rgba(0, 0, 0, 0.2)', textAlign: 'left', borderBottom: '1px solid var(--color-border, #334155)' }}>
                    <th style={{ padding: '10px 14px', color: '#94a3b8', width: '50px' }}>#</th>
                    <th style={{ padding: '10px 14px', color: '#94a3b8', width: '90px' }}>Entry Type</th>
                    <th style={{ padding: '10px 14px', color: '#94a3b8' }}>GL Account</th>
                    <th style={{ padding: '10px 14px', color: '#94a3b8' }}>Description</th>
                    <th style={{ padding: '10px 14px', color: '#94a3b8' }}>Cost Center</th>
                    <th style={{ padding: '10px 14px', color: '#94a3b8', textAlign: 'right' }}>Debit (PKR)</th>
                    <th style={{ padding: '10px 14px', color: '#94a3b8', textAlign: 'right' }}>Credit (PKR)</th>
                  </tr>
                </thead>
                <tbody>
                  {previewData.lines.map((line, idx) => {
                    const isDebit = line.type === 'DEBIT';
                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.02)' }}>
                        <td style={{ padding: '10px 14px', color: '#64748b' }}>{line.line_number}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '4px',
                            backgroundColor: isDebit ? 'rgba(59, 130, 246, 0.2)' : 'rgba(168, 85, 247, 0.2)',
                            color: isDebit ? '#60a5fa' : '#c084fc',
                          }}>
                            {line.type}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontWeight: 600, color: '#f1f5f9' }}>{line.account_code}</div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{line.account_name}</div>
                        </td>
                        <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>{line.description}</td>
                        <td style={{ padding: '10px 14px', color: '#94a3b8' }}>{line.cost_center_name || '—'}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: isDebit ? '#60a5fa' : 'transparent' }}>
                          {isDebit ? line.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: !isDebit ? '#c084fc' : 'transparent' }}>
                          {!isDebit ? line.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'rgba(0, 0, 0, 0.4)', fontWeight: 700, borderTop: '2px solid var(--color-border, #334155)' }}>
                    <td colSpan={5} style={{ padding: '12px 14px', textAlign: 'right', color: '#f8fafc' }}>
                      Totals:
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: '#60a5fa', fontSize: '1rem' }}>
                      PKR {previewData.total_debits.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: '#c084fc', fontSize: '1rem' }}>
                      PKR {previewData.total_credits.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 18px',
              borderRadius: '6px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid var(--color-border, #334155)',
              color: '#f8fafc',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Close Preview
          </button>
        </div>
      </div>
    </div>
  );
};
