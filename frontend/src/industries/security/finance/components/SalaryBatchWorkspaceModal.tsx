import React, { useState } from 'react';
import type {
  SalaryPaymentBatchItem,
  SalaryPaymentBatchLineItem,
} from '../api';
import {
  confirmSalaryBatchPayments,
  reverseSalaryBatchLine,
  exportSalaryBatchFile,
} from '../api';

interface SalaryBatchWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  batch: SalaryPaymentBatchItem | null;
  onBatchUpdated: (updatedBatch: SalaryPaymentBatchItem) => void;
}

export const SalaryBatchWorkspaceModal: React.FC<SalaryBatchWorkspaceModalProps> = ({
  isOpen,
  onClose,
  batch,
  onBatchUpdated,
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [reversalModalOpen, setReversalModalOpen] = useState(false);
  const [selectedLineForReversal, setSelectedLineForReversal] = useState<SalaryPaymentBatchLineItem | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !batch) return null;

  const handleExportCSV = async () => {
    try {
      setExporting(true);
      const blob = await exportSalaryBatchFile(batch.id, 'GENERIC_CSV');
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `salary_batch_${batch.batch_number}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to export bank CSV file.');
    } finally {
      setExporting(false);
    }
  };

  const handleBulkConfirmSuccess = async () => {
    if (!batch.lines || batch.lines.length === 0) return;
    if (!window.confirm(`Are you sure you want to mark all ${batch.lines.length} employee lines as SUCCESSFUL? This will generate a posted Treasury Payment Voucher for PKR ${Number(batch.total_amount).toLocaleString()}.`)) {
      return;
    }

    try {
      setSubmitting(true);
      setErrorMsg(null);
      const results = batch.lines.map((l) => ({
        line_id: l.id,
        status: 'SUCCESS' as const,
        payment_reference: `BANK-${batch.batch_number}-${l.employee_code || l.id.slice(0, 6)}`,
      }));

      const updated = await confirmSalaryBatchPayments(batch.id, results);
      onBatchUpdated(updated);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || 'Failed to confirm bulk payments.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSingleConfirm = async (lineId: string, status: 'SUCCESS' | 'FAILED', failureReason = '') => {
    try {
      setSubmitting(true);
      setErrorMsg(null);
      const results = [{
        line_id: lineId,
        status,
        payment_reference: status === 'SUCCESS' ? `CONF-${lineId.slice(0, 8)}` : '',
        failure_reason: failureReason,
      }];
      const updated = await confirmSalaryBatchPayments(batch.id, results);
      onBatchUpdated(updated);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || 'Failed to update line settlement.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmReversal = async () => {
    if (!selectedLineForReversal || !reversalReason) return;
    try {
      setSubmitting(true);
      setErrorMsg(null);
      const updated = await reverseSalaryBatchLine(batch.id, selectedLineForReversal.id, reversalReason);
      onBatchUpdated(updated);
      setReversalModalOpen(false);
      setSelectedLineForReversal(null);
      setReversalReason('');
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || 'Failed to reverse salary line.');
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
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
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
        width: '1100px',
        maxWidth: '96vw',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 30px -5px rgba(0, 0, 0, 0.6)',
        color: 'var(--color-text, #f8fafc)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--color-border, #334155)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(0, 0, 0, 0.15)',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 600 }}>
                🏦 Salary Batch Workspace: {batch.batch_number}
              </h2>
              <span style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: '9999px',
                backgroundColor:
                  batch.status === 'COMPLETED' ? 'rgba(34, 197, 94, 0.2)' :
                  batch.status === 'PARTIALLY_COMPLETED' ? 'rgba(234, 179, 8, 0.2)' :
                  batch.status === 'FAILED' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                color:
                  batch.status === 'COMPLETED' ? '#22c55e' :
                  batch.status === 'PARTIALLY_COMPLETED' ? '#eab308' :
                  batch.status === 'FAILED' ? '#ef4444' : '#60a5fa',
              }}>
                {batch.status.replace(/_/g, ' ')}
              </span>
            </div>
            <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '4px' }}>
              Payroll: <strong>{batch.payroll_period_name}</strong> | Payment Date: {batch.payment_date} | Provider: {batch.payment_provider} ({batch.payment_mode})
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              onClick={handleExportCSV}
              disabled={exporting}
              style={{
                padding: '7px 14px',
                borderRadius: '6px',
                background: 'rgba(59, 130, 246, 0.15)',
                border: '1px solid rgba(59, 130, 246, 0.4)',
                color: '#60a5fa',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              📥 {exporting ? 'Exporting...' : 'Export Bank CSV'}
            </button>

            {batch.status !== 'COMPLETED' && (
              <button
                onClick={handleBulkConfirmSuccess}
                disabled={submitting}
                style={{
                  padding: '7px 14px',
                  borderRadius: '6px',
                  background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                  border: 'none',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                ✅ Confirm All Successful
              </button>
            )}

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
        </div>

        {/* Info Strip */}
        <div style={{
          padding: '12px 24px',
          background: 'rgba(0, 0, 0, 0.1)',
          borderBottom: '1px solid var(--color-border, #334155)',
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '12px',
          fontSize: '0.82rem',
        }}>
          <div>
            <div style={{ color: '#94a3b8' }}>Treasury Account</div>
            <div style={{ fontWeight: 600, color: '#f8fafc' }}>{batch.treasury_account_title}</div>
          </div>
          <div>
            <div style={{ color: '#94a3b8' }}>Total Disbursal</div>
            <div style={{ fontWeight: 700, color: '#60a5fa' }}>PKR {Number(batch.total_amount).toLocaleString()}</div>
          </div>
          <div>
            <div style={{ color: '#94a3b8' }}>Successful Paid</div>
            <div style={{ fontWeight: 700, color: '#22c55e' }}>PKR {Number(batch.successful_amount).toLocaleString()}</div>
          </div>
          <div>
            <div style={{ color: '#94a3b8' }}>Failed / Outstanding</div>
            <div style={{ fontWeight: 700, color: Number(batch.failed_amount) > 0 ? '#ef4444' : '#94a3b8' }}>
              PKR {Number(batch.failed_amount).toLocaleString()}
            </div>
          </div>
          <div>
            <div style={{ color: '#94a3b8' }}>S-4D Treasury Voucher</div>
            <div style={{ fontWeight: 600, color: batch.voucher_number ? '#38bdf8' : '#94a3b8' }}>
              {batch.voucher_number || 'Generated upon confirmation'}
            </div>
          </div>
        </div>

        {errorMsg && (
          <div style={{ margin: '16px 24px 0', padding: '10px 14px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', color: '#ef4444', fontSize: '0.85rem' }}>
            {errorMsg}
          </div>
        )}

        {/* Lines Table */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: 'rgba(0, 0, 0, 0.2)', textAlign: 'left', borderBottom: '1px solid var(--color-border, #334155)' }}>
                <th style={{ padding: '10px 12px', color: '#94a3b8' }}>Employee</th>
                <th style={{ padding: '10px 12px', color: '#94a3b8' }}>Payment Channel & Destination</th>
                <th style={{ padding: '10px 12px', color: '#94a3b8', textAlign: 'right' }}>Net Salary (PKR)</th>
                <th style={{ padding: '10px 12px', color: '#94a3b8' }}>Reference</th>
                <th style={{ padding: '10px 12px', color: '#94a3b8' }}>Status</th>
                <th style={{ padding: '10px 12px', color: '#94a3b8', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(batch.lines || []).map((line, idx) => {
                const dest = line.destination_details || {};
                const isSuccess = line.status === 'SUCCESS';
                const isFailed = line.status === 'FAILED';
                const isReversed = line.status === 'REVERSED';

                return (
                  <tr key={line.id} style={{
                    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                    background: idx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.02)',
                  }}>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 600, color: '#f8fafc' }}>{line.employee_name || 'Employee'}</div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{line.employee_code} | Slip: {line.payslip_number}</div>
                    </td>

                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 500, color: '#cbd5e1' }}>
                        {line.payment_method === 'BANK_TRANSFER' ? `🏦 ${dest.bank_name || 'Bank Transfer'}` :
                         line.payment_method === 'WALLET' ? `📱 ${dest.wallet_provider || 'Mobile Wallet'}` : '💵 Cash Counter'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                        {dest.account_number ? `Acc: ${dest.account_number}` : dest.wallet_number ? `Wallet: ${dest.wallet_number}` : dest.iban ? `IBAN: ${dest.iban}` : 'Cash Disbursal'}
                      </div>
                    </td>

                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#f8fafc' }}>
                      PKR {Number(line.net_salary).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>

                    <td style={{ padding: '10px 12px', color: '#94a3b8', fontSize: '0.8rem' }}>
                      {line.payment_reference || '—'}
                      {line.failure_reason && (
                        <div style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '2px' }}>
                          ⚠️ {line.failure_reason}
                        </div>
                      )}
                    </td>

                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '4px',
                        backgroundColor:
                          isSuccess ? 'rgba(34, 197, 94, 0.2)' :
                          isFailed ? 'rgba(239, 68, 68, 0.2)' :
                          isReversed ? 'rgba(168, 85, 247, 0.2)' : 'rgba(148, 163, 184, 0.2)',
                        color:
                          isSuccess ? '#22c55e' :
                          isFailed ? '#ef4444' :
                          isReversed ? '#c084fc' : '#94a3b8',
                      }}>
                        {line.status}
                      </span>
                    </td>

                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        {!isSuccess && !isReversed && (
                          <>
                            <button
                              onClick={() => handleSingleConfirm(line.id, 'SUCCESS')}
                              disabled={submitting}
                              title="Mark Success"
                              style={{
                                padding: '4px 8px',
                                borderRadius: '4px',
                                background: 'rgba(34, 197, 94, 0.15)',
                                border: '1px solid rgba(34, 197, 94, 0.4)',
                                color: '#22c55e',
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                              }}
                            >
                              ✓ Paid
                            </button>
                            <button
                              onClick={() => {
                                const r = prompt('Reason for payment failure:');
                                if (r !== null) handleSingleConfirm(line.id, 'FAILED', r);
                              }}
                              disabled={submitting}
                              title="Mark Failed"
                              style={{
                                padding: '4px 8px',
                                borderRadius: '4px',
                                background: 'rgba(239, 68, 68, 0.15)',
                                border: '1px solid rgba(239, 68, 68, 0.4)',
                                color: '#ef4444',
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                              }}
                            >
                              ✕ Fail
                            </button>
                          </>
                        )}

                        {isSuccess && (
                          <button
                            onClick={() => {
                              setSelectedLineForReversal(line);
                              setReversalModalOpen(true);
                            }}
                            disabled={submitting}
                            title="Reverse Payment"
                            style={{
                              padding: '4px 8px',
                              borderRadius: '4px',
                              background: 'rgba(168, 85, 247, 0.15)',
                              border: '1px solid rgba(168, 85, 247, 0.4)',
                              color: '#c084fc',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                            }}
                          >
                            ↩ Reverse
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Reversal Dialog Sub-Modal */}
        {reversalModalOpen && selectedLineForReversal && (
          <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
          }}>
            <div style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '20px',
              width: '450px',
              maxWidth: '90vw',
            }}>
              <h3 style={{ margin: '0 0 12px', fontSize: '1.1rem' }}>↩ Reverse Salary Payment</h3>
              <p style={{ fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '16px' }}>
                You are reversing payment of <strong>PKR {Number(selectedLineForReversal.net_salary).toLocaleString()}</strong> for <strong>{selectedLineForReversal.employee_name}</strong>.
                This will record a treasury movement refund and restore the company's payroll liability.
              </p>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>
                Reversal Audit Reason:
              </label>
              <textarea
                value={reversalReason}
                onChange={(e) => setReversalReason(e.target.value)}
                placeholder="e.g. Banking bounce back / Incorrect account title / Stop payment requested"
                style={{
                  width: '100%',
                  height: '70px',
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid #475569',
                  borderRadius: '4px',
                  color: '#f8fafc',
                  padding: '8px',
                  fontSize: '0.85rem',
                  marginBottom: '16px',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  onClick={() => setReversalModalOpen(false)}
                  style={{ padding: '6px 12px', background: 'transparent', border: '1px solid #475569', color: '#cbd5e1', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmReversal}
                  disabled={!reversalReason.trim() || submitting}
                  style={{ padding: '6px 14px', background: '#a855f7', border: 'none', color: '#ffffff', fontWeight: 600, borderRadius: '4px', cursor: 'pointer' }}
                >
                  Confirm Reversal
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--color-border, #334155)',
          display: 'flex',
          justifyContent: 'flex-end',
          background: 'rgba(0, 0, 0, 0.1)',
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 20px',
              borderRadius: '6px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid var(--color-border, #334155)',
              color: '#f8fafc',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Close Workspace
          </button>
        </div>
      </div>
    </div>
  );
};
