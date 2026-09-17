import React, { useState, useEffect } from 'react';
import type {
  BillingSheet,
  AdjustmentType
} from '../api';
import {
  fetchBillingSheetById,
  addBillingSheetAdjustment,
  submitBillingSheetForReview,
  approveBillingSheet,
  cancelBillingSheet,
  generateClientInvoiceFromSheet
} from '../api';

interface Props {
  sheetId: string;
  onClose: () => void;
  onSheetUpdated?: () => void;
}

export const BillingSheetWorkspaceModal: React.FC<Props> = ({ sheetId, onClose, onSheetUpdated }) => {
  const [sheet, setSheet] = useState<BillingSheet | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'lines' | 'adjustments' | 'audit'>('lines');

  // Adjustment Modal
  const [isAdjModalOpen, setIsAdjModalOpen] = useState<boolean>(false);
  const [adjType, setAdjType] = useState<AdjustmentType>('ADDITIONAL_CHARGE');
  const [adjReason, setAdjReason] = useState<string>('');
  const [adjAmount, setAdjAmount] = useState<string>('');
  const [adjSiteId, setAdjSiteId] = useState<string>('');
  const [adjError, setAdjError] = useState<string | null>(null);

  // Generate Invoice Modal
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState<boolean>(false);
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState<string>('');
  const [paymentTerms, setPaymentTerms] = useState<string>('NET_30');
  const [invoiceError, setInvoiceError] = useState<string | null>(null);

  const loadSheet = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchBillingSheetById(sheetId);
      setSheet(data);
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Failed to load billing sheet.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSheet();
  }, [sheetId]);

  const handleAction = async (actionFn: () => Promise<any>) => {
    setActionLoading(true);
    setError(null);
    try {
      await actionFn();
      await loadSheet();
      if (onSheetUpdated) onSheetUpdated();
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Action failed.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjReason || !adjAmount) {
      setAdjError('Please provide a reason and amount for the adjustment.');
      return;
    }
    setAdjError(null);
    setActionLoading(true);
    try {
      await addBillingSheetAdjustment(sheetId, {
        adjustment_type: adjType,
        reason: adjReason,
        amount: adjAmount,
        site_id: adjSiteId || undefined
      });
      setIsAdjModalOpen(false);
      setAdjReason('');
      setAdjAmount('');
      setAdjSiteId('');
      await loadSheet();
      if (onSheetUpdated) onSheetUpdated();
    } catch (err: any) {
      setAdjError(err?.response?.data?.error || err.message || 'Failed to add adjustment.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleGenerateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setInvoiceError(null);
    setActionLoading(true);
    try {
      await generateClientInvoiceFromSheet(sheetId, {
        invoice_date: invoiceDate,
        due_date: dueDate || undefined,
        payment_terms: paymentTerms
      });
      setIsInvoiceModalOpen(false);
      await loadSheet();
      if (onSheetUpdated) onSheetUpdated();
    } catch (err: any) {
      setInvoiceError(err?.response?.data?.error || err.message || 'Failed to generate invoice.');
    } finally {
      setActionLoading(false);
    }
  };

  if (!sheet && loading) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
        <div style={{ background: 'var(--color-surface)', padding: '30px', borderRadius: '10px', color: 'var(--color-text)' }}>
          Loading Billing Sheet Workspace...
        </div>
      </div>
    );
  }

  if (!sheet) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '24px'
      }}
    >
      <div
        style={{
          background: 'var(--color-surface)',
          borderRadius: '12px',
          border: '1px solid var(--color-border)',
          width: '100%',
          maxWidth: '1100px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
          overflow: 'hidden'
        }}
      >
        {/* Workspace Top Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--color-bg-subtle, rgba(0,0,0,0.02))'
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--color-text)' }}>
                {sheet.sheet_number}
              </h2>
              <span
                style={{
                  padding: '3px 10px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 700,
                  background:
                    sheet.status === 'APPROVED'
                      ? 'rgba(34, 197, 94, 0.15)'
                      : sheet.status === 'INVOICED'
                      ? 'rgba(59, 130, 246, 0.15)'
                      : sheet.status === 'UNDER_REVIEW'
                      ? 'rgba(234, 179, 8, 0.15)'
                      : 'rgba(148, 163, 184, 0.15)',
                  color:
                    sheet.status === 'APPROVED'
                      ? '#22c55e'
                      : sheet.status === 'INVOICED'
                      ? '#3b82f6'
                      : sheet.status === 'UNDER_REVIEW'
                      ? '#eab308'
                      : '#94a3b8'
                }}
              >
                {sheet.status}
              </span>
            </div>
            <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
              Client: <strong>{sheet.client_name}</strong> | Contract: <strong>{sheet.contract_code}</strong> | Period: {sheet.period_start} → {sheet.period_end} ({sheet.billing_month})
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {sheet.status === 'DRAFT' && (
              <button
                disabled={actionLoading}
                onClick={() => handleAction(() => submitBillingSheetForReview(sheet.id))}
                style={{
                  padding: '7px 14px',
                  borderRadius: '6px',
                  border: '1px solid #eab308',
                  background: 'rgba(234, 179, 8, 0.1)',
                  color: '#eab308',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Submit For Review
              </button>
            )}

            {sheet.status === 'UNDER_REVIEW' && (
              <button
                disabled={actionLoading}
                onClick={() => handleAction(() => approveBillingSheet(sheet.id))}
                style={{
                  padding: '7px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#22c55e',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Approve Billing Sheet
              </button>
            )}

            {sheet.status === 'APPROVED' && (
              <button
                disabled={actionLoading}
                onClick={() => setIsInvoiceModalOpen(true)}
                style={{
                  padding: '7px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'var(--color-primary, #0284c7)',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>⚡</span> Generate Client Invoice
              </button>
            )}

            {sheet.status === 'INVOICED' && sheet.generated_invoice_number && (
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#3b82f6', padding: '6px 12px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '6px' }}>
                ✓ Invoiced ({sheet.generated_invoice_number})
              </div>
            )}

            {sheet.status !== 'INVOICED' && sheet.status !== 'CANCELLED' && (
              <button
                disabled={actionLoading}
                onClick={() => {
                  const reason = prompt('Please enter reason for cancellation:');
                  if (reason) {
                    handleAction(() => cancelBillingSheet(sheet.id, reason));
                  }
                }}
                style={{
                  padding: '7px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border)',
                  background: 'transparent',
                  color: '#ef4444',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                Cancel Sheet
              </button>
            )}

            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '20px',
                cursor: 'pointer',
                color: 'var(--color-text-muted)',
                marginLeft: '10px'
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {error && (
          <div style={{ padding: '10px 24px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontSize: '13px' }}>
            {error}
          </div>
        )}

        {/* Financial Metrics Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '12px',
            padding: '16px 24px',
            borderBottom: '1px solid var(--color-border)',
            background: 'var(--color-bg)'
          }}
        >
          <div style={{ padding: '10px', background: 'var(--color-surface)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600 }}>BASE SERVICES</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text)', marginTop: '4px' }}>
              PKR {Number(sheet.base_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div style={{ padding: '10px', background: 'var(--color-surface)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600 }}>OVERTIME</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text)', marginTop: '4px' }}>
              PKR {Number(sheet.ot_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div style={{ padding: '10px', background: 'var(--color-surface)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600 }}>EXTRA DUTY</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text)', marginTop: '4px' }}>
              PKR {Number(sheet.extra_duty_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div style={{ padding: '10px', background: 'var(--color-surface)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600 }}>ADJUSTMENTS</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: Number(sheet.adjustment_amount) - Number(sheet.discount_amount) >= 0 ? 'var(--color-text)' : '#ef4444', marginTop: '4px' }}>
              PKR {(Number(sheet.adjustment_amount) - Number(sheet.discount_amount)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div style={{ padding: '10px', background: 'var(--color-surface)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600 }}>TAX / SALES TAX</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text)', marginTop: '4px' }}>
              PKR {Number(sheet.tax_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div style={{ padding: '10px', background: 'rgba(2, 132, 199, 0.08)', borderRadius: '8px', border: '1px solid var(--color-primary, #0284c7)' }}>
            <div style={{ fontSize: '11px', color: 'var(--color-primary, #0284c7)', fontWeight: 700 }}>GRAND TOTAL</div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--color-primary, #0284c7)', marginTop: '4px' }}>
              PKR {Number(sheet.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* Tab Selector */}
        <div style={{ display: 'flex', gap: '8px', padding: '12px 24px 0 24px', borderBottom: '1px solid var(--color-border)' }}>
          <button
            onClick={() => setActiveTab('lines')}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderBottom: activeTab === 'lines' ? '2px solid var(--color-primary, #0284c7)' : '2px solid transparent',
              background: 'none',
              color: activeTab === 'lines' ? 'var(--color-primary, #0284c7)' : 'var(--color-text-muted)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Billable Service Lines ({sheet.lines?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('adjustments')}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderBottom: activeTab === 'adjustments' ? '2px solid var(--color-primary, #0284c7)' : '2px solid transparent',
              background: 'none',
              color: activeTab === 'adjustments' ? 'var(--color-primary, #0284c7)' : 'var(--color-text-muted)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Manual Adjustments ({sheet.adjustments?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderBottom: activeTab === 'audit' ? '2px solid var(--color-primary, #0284c7)' : '2px solid transparent',
              background: 'none',
              color: activeTab === 'audit' ? 'var(--color-primary, #0284c7)' : 'var(--color-text-muted)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Audit & Notes
          </button>
        </div>

        {/* Tab Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {activeTab === 'lines' && (
            <div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
                    <th style={{ padding: '8px 10px', fontWeight: 600 }}>Type</th>
                    <th style={{ padding: '8px 10px', fontWeight: 600 }}>Description</th>
                    <th style={{ padding: '8px 10px', fontWeight: 600 }}>Site</th>
                    <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>Qty</th>
                    <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>Rate (PKR)</th>
                    <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>Subtotal (PKR)</th>
                    <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>Total (PKR)</th>
                  </tr>
                </thead>
                <tbody>
                  {sheet.lines?.map((ln) => (
                    <tr key={ln.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '10px', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '12px' }}>
                        {ln.line_type.replace('_', ' ')}
                      </td>
                      <td style={{ padding: '10px', color: 'var(--color-text)' }}>
                        <div>{ln.description}</div>
                        {ln.source && (
                          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                            Source: {ln.source}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '10px', color: 'var(--color-text-muted)' }}>
                        {ln.site_name || 'All Sites'}
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right', color: 'var(--color-text)' }}>
                        {Number(ln.billable_quantity).toFixed(2)}
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right', color: 'var(--color-text)' }}>
                        {Number(ln.unit_rate).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right', color: 'var(--color-text)' }}>
                        {Number(ln.line_subtotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700, color: 'var(--color-text)' }}>
                        {Number(ln.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'adjustments' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                  Add authorized surcharges, deductions, discounts, or manual corrections to this billing sheet.
                </div>
                {sheet.status !== 'APPROVED' && sheet.status !== 'INVOICED' && sheet.status !== 'CANCELLED' && (
                  <button
                    onClick={() => setIsAdjModalOpen(true)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '6px',
                      border: 'none',
                      background: 'var(--color-primary, #0284c7)',
                      color: '#ffffff',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    + Add Adjustment
                  </button>
                )}
              </div>

              {sheet.adjustments?.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--color-text-muted)', background: 'var(--color-bg)', borderRadius: '8px' }}>
                  No manual adjustments added to this billing sheet yet.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
                      <th style={{ padding: '8px 10px', fontWeight: 600 }}>Type</th>
                      <th style={{ padding: '8px 10px', fontWeight: 600 }}>Reason</th>
                      <th style={{ padding: '8px 10px', fontWeight: 600 }}>Site</th>
                      <th style={{ padding: '8px 10px', fontWeight: 600 }}>Added By</th>
                      <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>Amount (PKR)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sheet.adjustments?.map((adj) => (
                      <tr key={adj.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '10px', fontWeight: 600 }}>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '10px',
                              fontSize: '11px',
                              background:
                                adj.adjustment_type === 'ADDITIONAL_CHARGE'
                                  ? 'rgba(59, 130, 246, 0.1)'
                                  : adj.adjustment_type === 'DISCOUNT'
                                  ? 'rgba(34, 197, 94, 0.1)'
                                  : 'rgba(239, 68, 68, 0.1)',
                              color:
                                adj.adjustment_type === 'ADDITIONAL_CHARGE'
                                  ? '#3b82f6'
                                  : adj.adjustment_type === 'DISCOUNT'
                                  ? '#22c55e'
                                  : '#ef4444'
                            }}
                          >
                            {adj.adjustment_type.replace('_', ' ')}
                          </span>
                        </td>
                        <td style={{ padding: '10px', color: 'var(--color-text)' }}>{adj.reason}</td>
                        <td style={{ padding: '10px', color: 'var(--color-text-muted)' }}>{adj.site_name || 'All Sites'}</td>
                        <td style={{ padding: '10px', color: 'var(--color-text-muted)' }}>{adj.created_by_name || 'Finance User'}</td>
                        <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700, color: 'var(--color-text)' }}>
                          {Number(adj.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === 'audit' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '13px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
                <div style={{ padding: '14px', background: 'var(--color-bg)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600 }}>PREPARED BY</div>
                  <div style={{ fontWeight: 600, color: 'var(--color-text)', marginTop: '4px' }}>{sheet.prepared_by_name || 'System / Admin'}</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>{sheet.prepared_at ? new Date(sheet.prepared_at).toLocaleString() : '—'}</div>
                </div>
                <div style={{ padding: '14px', background: 'var(--color-bg)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600 }}>REVIEWED BY</div>
                  <div style={{ fontWeight: 600, color: 'var(--color-text)', marginTop: '4px' }}>{sheet.reviewed_by_name || 'Pending Review'}</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>{sheet.reviewed_at ? new Date(sheet.reviewed_at).toLocaleString() : '—'}</div>
                </div>
                <div style={{ padding: '14px', background: 'var(--color-bg)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600 }}>APPROVED BY</div>
                  <div style={{ fontWeight: 600, color: 'var(--color-text)', marginTop: '4px' }}>{sheet.approved_by_name || 'Pending Approval'}</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>{sheet.approved_at ? new Date(sheet.approved_at).toLocaleString() : '—'}</div>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                  Billing Sheet Notes
                </label>
                <div style={{ padding: '12px', background: 'var(--color-bg)', borderRadius: '6px', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
                  {sheet.notes || 'No special notes recorded.'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal: Add Manual Adjustment */}
        {isAdjModalOpen && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10000,
              padding: '20px'
            }}
          >
            <div
              style={{
                background: 'var(--color-surface)',
                borderRadius: '10px',
                border: '1px solid var(--color-border)',
                width: '100%',
                maxWidth: '460px',
                overflow: 'hidden'
              }}
            >
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--color-text)' }}>
                  Add Manual Adjustment
                </h3>
                <button
                  onClick={() => setIsAdjModalOpen(false)}
                  style={{ background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', color: 'var(--color-text-muted)' }}
                >
                  ✕
                </button>
              </div>
              <form onSubmit={handleAddAdjustment} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {adjError && (
                  <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '6px', fontSize: '12px' }}>
                    {adjError}
                  </div>
                )}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: 'var(--color-text-muted)' }}>
                    Adjustment Type *
                  </label>
                  <select
                    value={adjType}
                    onChange={(e) => setAdjType(e.target.value as AdjustmentType)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}
                  >
                    <option value="ADDITIONAL_CHARGE">Additional Surcharge / Charge</option>
                    <option value="DEDUCTION">Operational Deduction</option>
                    <option value="DISCOUNT">Commercial Discount</option>
                    <option value="CORRECTION">Billing Correction</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: 'var(--color-text-muted)' }}>
                    Reason / Description *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. VIP Guard Protocol Vehicle surcharge"
                    value={adjReason}
                    onChange={(e) => setAdjReason(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: 'var(--color-text-muted)' }}>
                    Amount (PKR) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="0.00"
                    value={adjAmount}
                    onChange={(e) => setAdjAmount(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setIsAdjModalOpen(false)}
                    style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: 'var(--color-primary, #0284c7)', color: '#ffffff', fontWeight: 600 }}
                  >
                    {actionLoading ? 'Saving...' : 'Add Adjustment'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Generate Client Invoice */}
        {isInvoiceModalOpen && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10000,
              padding: '20px'
            }}
          >
            <div
              style={{
                background: 'var(--color-surface)',
                borderRadius: '10px',
                border: '1px solid var(--color-border)',
                width: '100%',
                maxWidth: '480px',
                overflow: 'hidden'
              }}
            >
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--color-text)' }}>
                  Generate Client Invoice
                </h3>
                <button
                  onClick={() => setIsInvoiceModalOpen(false)}
                  style={{ background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', color: 'var(--color-text-muted)' }}
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleGenerateInvoice} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {invoiceError && (
                  <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '6px', fontSize: '12px' }}>
                    {invoiceError}
                  </div>
                )}

                <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                  This will generate an official client invoice in DRAFT status with immutable snapshot rates from billing sheet <strong>{sheet.sheet_number}</strong>.
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: 'var(--color-text-muted)' }}>
                      Invoice Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={invoiceDate}
                      onChange={(e) => setInvoiceDate(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: 'var(--color-text-muted)' }}>
                      Due Date (Optional)
                    </label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: 'var(--color-text-muted)' }}>
                    Payment Terms
                  </label>
                  <select
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}
                  >
                    <option value="DUE_ON_RECEIPT">Due on Receipt</option>
                    <option value="NET_15">Net 15 Days</option>
                    <option value="NET_30">Net 30 Days</option>
                    <option value="NET_60">Net 60 Days</option>
                  </select>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setIsInvoiceModalOpen(false)}
                    style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    style={{ padding: '8px 18px', borderRadius: '6px', border: 'none', background: 'var(--color-primary, #0284c7)', color: '#ffffff', fontWeight: 600 }}
                  >
                    {actionLoading ? 'Generating...' : 'Confirm & Generate Invoice'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
