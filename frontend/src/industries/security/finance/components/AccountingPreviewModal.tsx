import React from 'react';
import type { PurchasingAccountingLinePreviewItem } from '../api';

interface AccountingPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  sourceNumber: string;
  sourceType: string;
  status: string;
  blockingReason?: string;
  lines: PurchasingAccountingLinePreviewItem[];
  onOpenReclassify?: (line: PurchasingAccountingLinePreviewItem) => void;
}

export const AccountingPreviewModal: React.FC<AccountingPreviewModalProps> = ({
  isOpen,
  onClose,
  title,
  sourceNumber,
  sourceType,
  status,
  blockingReason,
  lines,
  onOpenReclassify,
}) => {
  if (!isOpen) return null;

  const totalDebits = lines.reduce((acc, l) => acc + (l.debit_account ? parseFloat(l.amount || '0') : 0), 0);
  const totalCredits = lines.reduce((acc, l) => acc + (l.credit_account ? parseFloat(l.amount || '0') : 0), 0);
  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.001;

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
        zIndex: 1050,
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--color-surface, #1e293b)',
          borderRadius: '12px',
          width: '900px',
          maxWidth: '95vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
          border: '1px solid var(--color-border, #334155)',
          color: 'var(--color-text, #f8fafc)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--color-border, #334155)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>{title}</h2>
              <span
                style={{
                  padding: '3px 8px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  backgroundColor:
                    status === 'READY'
                      ? 'rgba(34, 197, 94, 0.2)'
                      : status === 'BLOCKED'
                      ? 'rgba(239, 68, 68, 0.2)'
                      : 'rgba(234, 179, 8, 0.2)',
                  color:
                    status === 'READY'
                      ? '#4ade80'
                      : status === 'BLOCKED'
                      ? '#f87171'
                      : '#facc15',
                }}
              >
                {status}
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--color-text-secondary, #94a3b8)' }}>
              Source: <strong style={{ color: 'var(--color-text, #f8fafc)' }}>{sourceNumber}</strong> ({sourceType.replace('_', ' ')})
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              color: 'var(--color-text-secondary, #94a3b8)',
              padding: '4px 8px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Blocking Alert */}
        {blockingReason && (
          <div
            style={{
              margin: '16px 24px 0',
              padding: '12px 16px',
              borderRadius: '8px',
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#fca5a5',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <span style={{ fontSize: '16px' }}>⚠️</span>
            <div>
              <strong>Action Required:</strong> {blockingReason}
            </div>
          </div>
        )}

        {/* Body / Table */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border, #334155)', color: 'var(--color-text-secondary, #94a3b8)' }}>
                <th style={{ textAlign: 'left', padding: '8px 10px', fontWeight: 500 }}>#</th>
                <th style={{ textAlign: 'left', padding: '8px 10px', fontWeight: 500 }}>Item / Description</th>
                <th style={{ textAlign: 'left', padding: '8px 10px', fontWeight: 500 }}>Debit Account</th>
                <th style={{ textAlign: 'left', padding: '8px 10px', fontWeight: 500 }}>Credit Account</th>
                <th style={{ textAlign: 'left', padding: '8px 10px', fontWeight: 500 }}>Cost Center / Dimensions</th>
                <th style={{ textAlign: 'right', padding: '8px 10px', fontWeight: 500 }}>Amount (PKR)</th>
                <th style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 500 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                    No journal entry preview lines found.
                  </td>
                </tr>
              ) : (
                lines.map((line, idx) => (
                  <tr
                    key={line.id || idx}
                    style={{
                      borderBottom: '1px solid var(--color-border, #334155)',
                      backgroundColor: line.is_unresolved ? 'rgba(239, 68, 68, 0.05)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '10px', color: 'var(--color-text-secondary, #94a3b8)' }}>{line.line_number}</td>
                    <td style={{ padding: '10px' }}>
                      <div style={{ fontWeight: 500 }}>{line.item_name || (line.is_tax_line ? 'Tax Line' : 'Line')}</div>
                      {line.description && (
                        <div style={{ fontSize: '11px', color: 'var(--color-text-secondary, #94a3b8)' }}>{line.description}</div>
                      )}
                    </td>
                    <td style={{ padding: '10px' }}>
                      {line.debit_account_code ? (
                        <div>
                          <span style={{ fontWeight: 600, color: '#38bdf8' }}>{line.debit_account_code}</span> — {line.debit_account_name}
                        </div>
                      ) : (
                        <span style={{ color: '#f87171', fontWeight: 600 }}>Unmapped Debit</span>
                      )}
                    </td>
                    <td style={{ padding: '10px' }}>
                      {line.credit_account_code ? (
                        <div>
                          <span style={{ fontWeight: 600, color: '#a78bfa' }}>{line.credit_account_code}</span> — {line.credit_account_name}
                        </div>
                      ) : (
                        <span style={{ color: '#f87171', fontWeight: 600 }}>Unmapped Credit</span>
                      )}
                    </td>
                    <td style={{ padding: '10px', fontSize: '12px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                      {line.site_name && <div>📍 Site: {line.site_name}</div>}
                      {line.cost_center_name && <div>🏢 CC: {line.cost_center_name}</div>}
                      {line.warehouse_name && <div>📦 WH: {line.warehouse_name}</div>}
                      {!line.site_name && !line.cost_center_name && !line.warehouse_name && <span>—</span>}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 600 }}>
                      {parseFloat(line.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      {onOpenReclassify && (
                        <button
                          onClick={() => onOpenReclassify(line)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '6px',
                            backgroundColor: 'var(--color-surface-hover, #334155)',
                            border: '1px solid var(--color-border, #475569)',
                            color: 'var(--color-text, #f8fafc)',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          Reclassify
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Balance Summary Box */}
          <div
            style={{
              marginTop: '20px',
              padding: '14px 18px',
              borderRadius: '8px',
              backgroundColor: 'var(--color-surface-sunken, #0f172a)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              border: '1px solid var(--color-border, #334155)',
            }}
          >
            <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--color-text-secondary, #94a3b8)' }}>Total Debits:</span>
                <div style={{ fontWeight: 600, color: '#38bdf8' }}>
                  PKR {totalDebits.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--color-text-secondary, #94a3b8)' }}>Total Credits:</span>
                <div style={{ fontWeight: 600, color: '#a78bfa' }}>
                  PKR {totalCredits.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  backgroundColor: isBalanced ? '#22c55e' : '#ef4444',
                }}
              />
              <span style={{ fontSize: '13px', fontWeight: 600, color: isBalanced ? '#4ade80' : '#f87171' }}>
                {isBalanced ? 'Balanced Double-Entry' : 'Unbalanced Posting Preview'}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--color-border, #334155)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '8px 18px',
              borderRadius: '6px',
              backgroundColor: 'var(--color-surface-hover, #334155)',
              border: '1px solid var(--color-border, #475569)',
              color: 'var(--color-text, #f8fafc)',
              fontSize: '13px',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Close Preview
          </button>
        </div>
      </div>
    </div>
  );
};
