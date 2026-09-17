import React, { useState } from 'react';
import type { ExpenseItem } from '../api';
import {
  submitExpense,
  approveExpense,
  rejectExpense,
  payExpense,
  reverseExpense,
  cancelExpense
} from '../api';

interface ExpenseWorkspaceModalProps {
  expense: ExpenseItem;
  bankAccounts: any[];
  onClose: () => void;
  onRefresh: () => void;
}

export const ExpenseWorkspaceModal: React.FC<ExpenseWorkspaceModalProps> = ({
  expense,
  bankAccounts,
  onClose,
  onRefresh
}) => {
  const [currentExpense, setCurrentExpense] = useState<ExpenseItem>(expense);
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Pay modal state
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedBank, setSelectedBank] = useState(bankAccounts[0]?.id || '');
  const [paymentMethod, setPaymentMethod] = useState('BANK_TRANSFER');
  const [paymentRef, setPaymentRef] = useState('');

  // Reject / Reversal state
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showReverseModal, setShowReverseModal] = useState(false);
  const [reason, setReason] = useState('');

  const handleSubmit = async () => {
    setActionError(null);
    setLoading(true);
    try {
      const res = await submitExpense(currentExpense.id);
      setCurrentExpense(res.expense);
      onRefresh();
    } catch (err: any) {
      setActionError(err?.response?.data?.detail || err?.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    setActionError(null);
    setLoading(true);
    try {
      const res = await approveExpense(currentExpense.id);
      setCurrentExpense(res.expense);
      onRefresh();
    } catch (err: any) {
      setActionError(err?.response?.data?.detail || err?.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRejectConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setActionError('Please specify rejection reason.');
      return;
    }
    setActionError(null);
    setLoading(true);
    try {
      const res = await rejectExpense(currentExpense.id, reason);
      setCurrentExpense(res.expense);
      setShowRejectModal(false);
      onRefresh();
    } catch (err: any) {
      setActionError(err?.response?.data?.detail || err?.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePayConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBank) {
      setActionError('Please select a payment account.');
      return;
    }
    setActionError(null);
    setLoading(true);
    try {
      const res = await payExpense(currentExpense.id, {
        bank_account: selectedBank,
        payment_method: paymentMethod,
        reference: paymentRef
      });
      setCurrentExpense(res.expense);
      setShowPayModal(false);
      onRefresh();
    } catch (err: any) {
      setActionError(err?.response?.data?.detail || err?.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReverseConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setActionError('Please specify reversal reason.');
      return;
    }
    setActionError(null);
    setLoading(true);
    try {
      const res = await reverseExpense(currentExpense.id, reason);
      setCurrentExpense(res.expense);
      setShowReverseModal(false);
      onRefresh();
    } catch (err: any) {
      setActionError(err?.response?.data?.detail || err?.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelDraft = async () => {
    if (!confirm('Are you sure you want to cancel this draft expense?')) return;
    setActionError(null);
    setLoading(true);
    try {
      const res = await cancelExpense(currentExpense.id);
      setCurrentExpense(res.expense);
      onRefresh();
    } catch (err: any) {
      setActionError(err?.response?.data?.detail || err?.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { bg: string; color: string }> = {
      DRAFT: { bg: '#475569', color: '#f1f5f9' },
      PENDING_APPROVAL: { bg: '#d97706', color: '#fef3c7' },
      APPROVED: { bg: '#2563eb', color: '#dbeafe' },
      PAID: { bg: '#059669', color: '#d1fae5' },
      REJECTED: { bg: '#dc2626', color: '#fee2e2' },
      REVERSED: { bg: '#7c3aed', color: '#ede9fe' },
      CANCELLED: { bg: '#334155', color: '#94a3b8' }
    };
    const s = map[status] || { bg: '#475569', color: '#fff' };
    return (
      <span style={{
        padding: '4px 10px',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: 600,
        backgroundColor: s.bg,
        color: s.color,
        display: 'inline-flex',
        alignItems: 'center'
      }}>
        {status.replace(/_/g, ' ')}
      </span>
    );
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
        maxWidth: '780px',
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
                {currentExpense.expense_number}
              </h3>
              {getStatusBadge(currentExpense.status)}
              <span style={{
                fontSize: '0.75rem',
                color: 'var(--color-text-secondary, #94a3b8)',
                background: 'rgba(255,255,255,0.06)',
                padding: '2px 8px',
                borderRadius: '4px'
              }}>
                {currentExpense.expense_type.replace(/_/g, ' ')}
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--color-text-secondary, #94a3b8)' }}>
              {currentExpense.title}
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

        {/* Content */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {actionError && (
            <div style={{
              padding: '12px 16px',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid #ef4444',
              borderRadius: '8px',
              color: '#fca5a5',
              fontSize: '0.875rem'
            }}>
              {actionError}
            </div>
          )}

          {/* Amount and Key Stats */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '12px',
            backgroundColor: 'rgba(255,255,255,0.02)',
            padding: '16px',
            borderRadius: '8px',
            border: '1px solid var(--color-border, #333a48)'
          }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary, #94a3b8)' }}>Total Amount</div>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#38bdf8', marginTop: '2px' }}>
                PKR {parseFloat(currentExpense.total_amount || '0').toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary, #94a3b8)' }}>Expense Date</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 500, marginTop: '2px' }}>
                {currentExpense.expense_date}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary, #94a3b8)' }}>Category</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 500, marginTop: '2px' }}>
                {currentExpense.category_name || 'Uncategorized'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary, #94a3b8)' }}>Payee / Beneficiary</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 500, marginTop: '2px' }}>
                {currentExpense.payee || currentExpense.employee_name || currentExpense.vendor_name || 'N/A'}
              </div>
            </div>
          </div>

          {/* Details Section */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--color-text-secondary, #94a3b8)' }}>Cost Center: </span>
                <strong>{currentExpense.cost_center_name || 'General / None'}</strong>
              </div>
              <div style={{ fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--color-text-secondary, #94a3b8)' }}>Site: </span>
                <strong>{currentExpense.site_name || 'None'}</strong>
              </div>
              <div style={{ fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--color-text-secondary, #94a3b8)' }}>Receipt Ref: </span>
                <strong>{currentExpense.receipt_reference || 'N/A'}</strong>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--color-text-secondary, #94a3b8)' }}>Payment Status: </span>
                <strong>{currentExpense.payment_status}</strong>
              </div>
              <div style={{ fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--color-text-secondary, #94a3b8)' }}>Treasury Voucher: </span>
                <strong style={{ color: currentExpense.voucher_number ? '#10b981' : '#94a3b8' }}>
                  {currentExpense.voucher_number || 'Not Generated Yet'}
                </strong>
              </div>
              {currentExpense.bank_account_title && (
                <div style={{ fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--color-text-secondary, #94a3b8)' }}>Paid From Account: </span>
                  <strong>{currentExpense.bank_account_title}</strong>
                </div>
              )}
            </div>
          </div>

          {/* Split Allocations Table if present */}
          {currentExpense.is_split_allocation && currentExpense.allocations && currentExpense.allocations.length > 0 && (
            <div>
              <h4 style={{ fontSize: '0.9rem', margin: '0 0 8px', fontWeight: 600 }}>Split Cost Allocations</h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border, #333a48)', textAlign: 'left', color: '#94a3b8' }}>
                    <th style={{ padding: '6px' }}>Cost Center</th>
                    <th style={{ padding: '6px' }}>Site</th>
                    <th style={{ padding: '6px' }}>Description</th>
                    <th style={{ padding: '6px', textAlign: 'right' }}>Amount (PKR)</th>
                  </tr>
                </thead>
                <tbody>
                  {currentExpense.allocations.map((alloc, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '8px 6px' }}>{alloc.cost_center_name || '-'}</td>
                      <td style={{ padding: '8px 6px' }}>{alloc.site_name || '-'}</td>
                      <td style={{ padding: '8px 6px' }}>{alloc.description || '-'}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600 }}>
                        {parseFloat(String(alloc.amount)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Reversal / Rejection notes if any */}
          {currentExpense.rejection_reason && (
            <div style={{
              padding: '10px 14px',
              borderRadius: '6px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              fontSize: '0.85rem'
            }}>
              <strong style={{ color: '#fca5a5' }}>Rejection Reason: </strong> {currentExpense.rejection_reason}
            </div>
          )}

          {currentExpense.reversal_reason && (
            <div style={{
              padding: '10px 14px',
              borderRadius: '6px',
              background: 'rgba(168, 85, 247, 0.1)',
              border: '1px solid rgba(168, 85, 247, 0.3)',
              fontSize: '0.85rem'
            }}>
              <strong style={{ color: '#d8b4fe' }}>Audit Reversal Reason: </strong> {currentExpense.reversal_reason}
            </div>
          )}
        </div>

        {/* Action Controls Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--color-border, #333a48)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(0,0,0,0.2)'
        }}>
          <div>
            {currentExpense.status === 'DRAFT' && (
              <button
                onClick={handleCancelDraft}
                disabled={loading}
                style={{
                  background: 'transparent',
                  border: '1px solid #ef4444',
                  color: '#ef4444',
                  borderRadius: '6px',
                  padding: '8px 14px',
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                Cancel Draft
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            {currentExpense.status === 'DRAFT' && (
              <button
                onClick={handleSubmit}
                disabled={loading}
                style={{
                  background: '#3b82f6',
                  border: 'none',
                  color: '#fff',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Submit for Approval
              </button>
            )}

            {currentExpense.status === 'PENDING_APPROVAL' && (
              <>
                <button
                  onClick={() => setShowRejectModal(true)}
                  disabled={loading}
                  style={{
                    background: 'transparent',
                    border: '1px solid #ef4444',
                    color: '#ef4444',
                    borderRadius: '6px',
                    padding: '8px 14px',
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  Reject
                </button>
                <button
                  onClick={handleApprove}
                  disabled={loading}
                  style={{
                    background: '#10b981',
                    border: 'none',
                    color: '#fff',
                    borderRadius: '6px',
                    padding: '8px 18px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Approve Expense
                </button>
              </>
            )}

            {currentExpense.status === 'APPROVED' && (
              <button
                onClick={() => setShowPayModal(true)}
                disabled={loading}
                style={{
                  background: '#059669',
                  border: 'none',
                  color: '#fff',
                  borderRadius: '6px',
                  padding: '8px 18px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Disburse / Pay via Treasury
              </button>
            )}

            {currentExpense.status === 'PAID' && (
              <button
                onClick={() => setShowReverseModal(true)}
                disabled={loading}
                style={{
                  background: '#7c3aed',
                  border: 'none',
                  color: '#fff',
                  borderRadius: '6px',
                  padding: '8px 14px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Audit Reversal
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Pay Modal Subdialog */}
      {showPayModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--color-surface, #1e222b)',
            border: '1px solid var(--color-border, #333a48)',
            borderRadius: '10px',
            width: '100%',
            maxWidth: '480px',
            padding: '20px',
            color: '#fff'
          }}>
            <h4 style={{ margin: '0 0 6px', fontSize: '1.1rem' }}>Disburse Expense Payment</h4>
            <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: '#94a3b8' }}>
              Create and post a Financial Payment Voucher linked to Treasury accounts.
            </p>

            <form onSubmit={handlePayConfirm} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px' }}>Bank / Cash Account *</label>
                <select
                  value={selectedBank}
                  onChange={e => setSelectedBank(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border, #333a48)',
                    background: 'var(--color-background, #14171f)',
                    color: '#fff',
                    fontSize: '0.85rem'
                  }}
                >
                  {bankAccounts.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.account_title} ({b.account_type}) - PKR {parseFloat(b.current_balance || 0).toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px' }}>Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border, #333a48)',
                    background: 'var(--color-background, #14171f)',
                    color: '#fff',
                    fontSize: '0.85rem'
                  }}
                >
                  <option value="BANK_TRANSFER">Bank Transfer / Online</option>
                  <option value="CASH">Cash</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="DIRECT_DEPOSIT">Direct Deposit</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px' }}>Payment Reference / Cheque #</label>
                <input
                  type="text"
                  value={paymentRef}
                  onChange={e => setPaymentRef(e.target.value)}
                  placeholder="e.g. TR-998812"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border, #333a48)',
                    background: 'var(--color-background, #14171f)',
                    color: '#fff',
                    fontSize: '0.85rem'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowPayModal(false)}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--color-border, #333a48)',
                    color: '#fff',
                    borderRadius: '6px',
                    padding: '8px 14px',
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    background: '#059669',
                    border: 'none',
                    color: '#fff',
                    borderRadius: '6px',
                    padding: '8px 18px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {loading ? 'Posting...' : 'Confirm & Disburse'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Modal Subdialog */}
      {showRejectModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--color-surface, #1e222b)',
            border: '1px solid var(--color-border, #333a48)',
            borderRadius: '10px',
            width: '100%',
            maxWidth: '440px',
            padding: '20px',
            color: '#fff'
          }}>
            <h4 style={{ margin: '0 0 6px', fontSize: '1.1rem', color: '#ef4444' }}>Reject Expense</h4>
            <p style={{ margin: '0 0 14px', fontSize: '0.85rem', color: '#94a3b8' }}>
              Please provide the reason for rejecting this expense claim.
            </p>

            <form onSubmit={handleRejectConfirm} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <textarea
                rows={3}
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="e.g. Duplicate claim or missing official fuel receipt"
                required
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border, #333a48)',
                  background: 'var(--color-background, #14171f)',
                  color: '#fff',
                  fontSize: '0.85rem'
                }}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowRejectModal(false)}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--color-border, #333a48)',
                    color: '#fff',
                    borderRadius: '6px',
                    padding: '8px 14px',
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    background: '#ef4444',
                    border: 'none',
                    color: '#fff',
                    borderRadius: '6px',
                    padding: '8px 18px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {loading ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reverse Modal Subdialog */}
      {showReverseModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--color-surface, #1e222b)',
            border: '1px solid var(--color-border, #333a48)',
            borderRadius: '10px',
            width: '100%',
            maxWidth: '440px',
            padding: '20px',
            color: '#fff'
          }}>
            <h4 style={{ margin: '0 0 6px', fontSize: '1.1rem', color: '#a855f7' }}>Perform Audit Reversal</h4>
            <p style={{ margin: '0 0 14px', fontSize: '0.85rem', color: '#94a3b8' }}>
              This will reverse the paid status and reverse the linked Treasury Financial Voucher.
            </p>

            <form onSubmit={handleReverseConfirm} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <textarea
                rows={3}
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Reason for audit reversal..."
                required
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border, #333a48)',
                  background: 'var(--color-background, #14171f)',
                  color: '#fff',
                  fontSize: '0.85rem'
                }}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowReverseModal(false)}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--color-border, #333a48)',
                    color: '#fff',
                    borderRadius: '6px',
                    padding: '8px 14px',
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    background: '#7c3aed',
                    border: 'none',
                    color: '#fff',
                    borderRadius: '6px',
                    padding: '8px 18px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
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
