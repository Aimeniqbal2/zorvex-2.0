import React, { useState } from 'react';
import type { FinancialVoucher } from '../api';
import {
  submitVoucherForApproval,
  approveVoucher,
  postFinancialVoucher,
  reverseFinancialVoucher,
  cancelFinancialVoucher
} from '../api';

interface Props {
  voucher: FinancialVoucher | null;
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

export const VoucherWorkspaceModal: React.FC<Props> = ({ voucher, isOpen, onClose, onRefresh }) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Reversal Prompt Modal
  const [showReverseModal, setShowReverseModal] = useState<boolean>(false);
  const [reversalReason, setReversalReason] = useState<string>('');

  if (!isOpen || !voucher) return null;

  const handleAction = async (actionFn: () => Promise<any>) => {
    try {
      setLoading(true);
      setError(null);
      await actionFn();
      onRefresh();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Action failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteReversal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reversalReason.trim()) {
      setError('A reversal reason is required.');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      await reverseFinancialVoucher(voucher.id, reversalReason);
      setShowReverseModal(false);
      setReversalReason('');
      onRefresh();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to reverse voucher.');
    } finally {
      setLoading(false);
    }
  };

  const isDraft = voucher.status === 'DRAFT';
  const isPending = voucher.status === 'PENDING_APPROVAL';
  const isApproved = voucher.status === 'APPROVED';
  const isPosted = voucher.status === 'POSTED';
  const isReversed = voucher.status === 'REVERSED';
  const isCancelled = voucher.status === 'CANCELLED';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.75)',
        zIndex: 1000,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '24px',
        backdropFilter: 'blur(4px)'
      }}
    >
      <div
        style={{
          background: '#0f172a',
          borderRadius: '10px',
          border: '1px solid rgba(255,255,255,0.12)',
          width: '100%',
          maxWidth: '850px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#1e293b'
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px' }}>📑</span>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#f8fafc' }}>
                {voucher.voucher_number}
              </h3>
              <span
                style={{
                  fontSize: '11px',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  fontWeight: 600,
                  background:
                    isPosted
                      ? 'rgba(34,197,94,0.15)'
                      : isReversed
                      ? 'rgba(239,68,68,0.15)'
                      : isCancelled
                      ? 'rgba(100,116,139,0.2)'
                      : 'rgba(59,130,246,0.15)',
                  color:
                    isPosted
                      ? '#4ade80'
                      : isReversed
                      ? '#f87171'
                      : isCancelled
                      ? '#94a3b8'
                      : '#60a5fa',
                  border: '1px solid rgba(255,255,255,0.08)'
                }}
              >
                {voucher.status_display || voucher.status}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
              {voucher.voucher_type_display || voucher.voucher_type} • Dated: {voucher.date}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '20px',
              cursor: 'pointer'
            }}
          >
            ✕
          </button>
        </div>

        {/* Action Controls Toolbar */}
        <div
          style={{
            padding: '12px 24px',
            background: 'rgba(15,23,42,0.6)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px'
          }}
        >
          <div style={{ display: 'flex', gap: '8px' }}>
            {isDraft && (
              <button
                onClick={() => handleAction(() => submitVoucherForApproval(voucher.id))}
                disabled={loading}
                style={{ padding: '6px 12px', borderRadius: '5px', background: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                📤 Submit for Approval
              </button>
            )}

            {(isDraft || isPending) && (
              <button
                onClick={() => handleAction(() => approveVoucher(voucher.id))}
                disabled={loading}
                style={{ padding: '6px 12px', borderRadius: '5px', background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(16,185,129,0.3)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                ✅ Approve
              </button>
            )}

            {(isDraft || isPending || isApproved) && (
              <button
                onClick={() => handleAction(() => postFinancialVoucher(voucher.id))}
                disabled={loading}
                style={{ padding: '6px 14px', borderRadius: '5px', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#fff', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                🚀 Post & Update Treasury
              </button>
            )}

            {isPosted && (
              <button
                onClick={() => setShowReverseModal(true)}
                disabled={loading}
                style={{ padding: '6px 12px', borderRadius: '5px', background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                ↩️ Reverse Voucher
              </button>
            )}

            {(isDraft || isPending) && (
              <button
                onClick={() => handleAction(() => cancelFinancialVoucher(voucher.id))}
                disabled={loading}
                style={{ padding: '6px 12px', borderRadius: '5px', background: 'transparent', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.12)', fontSize: '12px', cursor: 'pointer' }}
              >
                Cancel Draft
              </button>
            )}
          </div>

          <div style={{ fontSize: '18px', fontWeight: 700, color: '#38bdf8' }}>
            PKR {Number(voucher.total_amount || voucher.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
        </div>

        {/* Content Body */}
        <div style={{ overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {error && (
            <div style={{ padding: '10px 14px', borderRadius: '6px', background: 'rgba(239,68,68,0.15)', color: '#fca5a5', fontSize: '12px' }}>
              {error}
            </div>
          )}

          {/* Details Card */}
          <div style={{ background: '#1e293b', borderRadius: '8px', padding: '16px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', fontSize: '13px' }}>
              <div>
                <span style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>Payee / Counterparty</span>
                <div style={{ color: '#f8fafc', fontWeight: 600, marginTop: '2px' }}>
                  {voucher.counterparty_name || voucher.payee_name || '—'}
                </div>
              </div>

              <div>
                <span style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>Treasury Account</span>
                <div style={{ color: '#f8fafc', fontWeight: 600, marginTop: '2px' }}>
                  {voucher.bank_account_title || '—'}
                  {voucher.destination_bank_account_title ? ` ➔ ${voucher.destination_bank_account_title}` : ''}
                </div>
              </div>

              <div>
                <span style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>Payment Method</span>
                <div style={{ color: '#f8fafc', fontWeight: 500, marginTop: '2px' }}>
                  {voucher.payment_method}
                </div>
              </div>

              <div>
                <span style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>Reference #</span>
                <div style={{ color: '#f8fafc', fontWeight: 500, marginTop: '2px' }}>
                  {voucher.reference || '—'}
                </div>
              </div>

              {voucher.source_document_type && (
                <div>
                  <span style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>Source Document</span>
                  <div style={{ color: '#60a5fa', fontWeight: 500, marginTop: '2px' }}>
                    {voucher.source_document_type} ({voucher.source_document_id?.slice(0, 8)}...)
                  </div>
                </div>
              )}
            </div>

            {voucher.description && (
              <div style={{ marginTop: '14px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '10px' }}>
                <span style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>Description</span>
                <div style={{ color: '#cbd5e1', fontSize: '13px', marginTop: '2px' }}>{voucher.description}</div>
              </div>
            )}
          </div>

          {/* Reversal Audit Box */}
          {isReversed && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '8px', padding: '14px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#f87171' }}>
                ⚠️ Reversal Record
              </div>
              <div style={{ fontSize: '13px', color: '#fca5a5', marginTop: '4px' }}>
                <strong>Reason:</strong> {voucher.reversal_reason || 'No reason recorded'}
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                Reversed By: {voucher.reversed_by_email || 'System'} at {voucher.reversed_at ? new Date(voucher.reversed_at).toLocaleString() : '—'}
              </div>
            </div>
          )}

          {/* Allocation Lines Breakdown */}
          {voucher.lines && voucher.lines.length > 0 && (
            <div>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 600, color: '#f8fafc' }}>
                GL Allocation Lines ({voucher.lines.length})
              </h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8' }}>
                    <th style={{ padding: '8px', textAlign: 'left' }}>Account</th>
                    <th style={{ padding: '8px', textAlign: 'left' }}>Description</th>
                    <th style={{ padding: '8px', textAlign: 'left' }}>Cost Center</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Amount (PKR)</th>
                  </tr>
                </thead>
                <tbody>
                  {voucher.lines.map((line, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '8px', color: '#f8fafc' }}>
                        {line.account_code ? `${line.account_code} - ${line.account_name}` : line.account}
                      </td>
                      <td style={{ padding: '8px', color: '#cbd5e1' }}>{line.description || '—'}</td>
                      <td style={{ padding: '8px', color: '#94a3b8' }}>{line.cost_center_name || '—'}</td>
                      <td style={{ padding: '8px', textAlign: 'right', color: '#4ade80', fontWeight: 600 }}>
                        {Number(line.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Associated Cheques */}
          {voucher.cheques && voucher.cheques.length > 0 && (
            <div>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 600, color: '#f8fafc' }}>
                Associated Cheques ({voucher.cheques.length})
              </h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8' }}>
                    <th style={{ padding: '8px', textAlign: 'left' }}>Cheque #</th>
                    <th style={{ padding: '8px', textAlign: 'left' }}>Status</th>
                    <th style={{ padding: '8px', textAlign: 'left' }}>Issue Date</th>
                    <th style={{ padding: '8px', textAlign: 'left' }}>Payee / Payer</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Amount (PKR)</th>
                  </tr>
                </thead>
                <tbody>
                  {voucher.cheques.map((c) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '8px', color: '#f8fafc', fontWeight: 600 }}>{c.cheque_number}</td>
                      <td style={{ padding: '8px' }}>
                        <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>
                          {c.status_display || c.status}
                        </span>
                      </td>
                      <td style={{ padding: '8px', color: '#cbd5e1' }}>{c.issue_date}</td>
                      <td style={{ padding: '8px', color: '#94a3b8' }}>{c.payee_name || c.payer_name}</td>
                      <td style={{ padding: '8px', textAlign: 'right', color: '#38bdf8', fontWeight: 600 }}>
                        {Number(c.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Audit Footer */}
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '6px', padding: '12px 16px', fontSize: '11px', color: '#64748b', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <div>Created By: <strong style={{ color: '#94a3b8' }}>{voucher.created_by_email || 'System'}</strong></div>
            <div>Approved By: <strong style={{ color: '#94a3b8' }}>{voucher.approved_by_email || '—'}</strong></div>
            <div>Posted By: <strong style={{ color: '#94a3b8' }}>{voucher.posted_by_email || '—'}</strong></div>
          </div>
        </div>
      </div>

      {/* Reversal Confirmation Modal */}
      {showReverseModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1100, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '24px' }}>
          <div style={{ background: '#0f172a', borderRadius: '10px', border: '1px solid rgba(239,68,68,0.3)', width: '100%', maxWidth: '440px', padding: '24px' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 700, color: '#f87171' }}>
              Confirm Voucher Reversal
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#cbd5e1' }}>
              This will atomically reverse the operational treasury movements on all linked bank/cash accounts and mark this voucher as REVERSED.
            </p>
            <form onSubmit={handleExecuteReversal}>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Reversal Reason *</label>
              <textarea
                value={reversalReason}
                onChange={(e) => setReversalReason(e.target.value)}
                required
                rows={3}
                placeholder="Reason for reversal (e.g. Bank wire recalled / entered in error)..."
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '14px' }}>
                <button
                  type="button"
                  onClick={() => setShowReverseModal(false)}
                  style={{ padding: '8px 14px', borderRadius: '6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#94a3b8', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{ padding: '8px 16px', borderRadius: '6px', background: '#ef4444', border: 'none', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
                >
                  {loading ? 'Reversing...' : 'Execute Reversal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
