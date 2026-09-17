import React, { useState, useEffect } from 'react';
import {
    getVendorInvoice,
    runThreeWayMatch,
    overrideMismatch,
    approveVendorInvoice,
    postVendorBill,
    cancelVendorInvoice,
    type VendorInvoice,
    type ThreeWayMatchDetails
} from '../api';

interface VendorInvoiceDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    invoiceId: string;
    onInvoiceUpdated?: () => void;
}

export const VendorInvoiceDetailModal: React.FC<VendorInvoiceDetailModalProps> = ({
    isOpen,
    onClose,
    invoiceId,
    onInvoiceUpdated
}) => {
    const [invoice, setInvoice] = useState<VendorInvoice | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Discrepancy Override modal state
    const [showOverrideModal, setShowOverrideModal] = useState(false);
    const [overrideReason, setOverrideReason] = useState('');

    // Cancel modal state
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [cancelReason, setCancelReason] = useState('');

    // Active tab
    const [activeTab, setActiveTab] = useState<'match' | 'lines' | 'audit'>('match');

    useEffect(() => {
        if (isOpen && invoiceId) {
            fetchInvoice();
        }
    }, [isOpen, invoiceId]);

    const fetchInvoice = async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await getVendorInvoice(invoiceId);
            setInvoice(data);
        } catch (err: any) {
            console.error("Failed to load vendor invoice:", err);
            setError(err?.response?.data?.detail || "Could not retrieve vendor invoice details.");
        } finally {
            setLoading(false);
        }
    };

    const handleRunMatch = async () => {
        try {
            setActionLoading(true);
            setError(null);
            const res = await runThreeWayMatch(invoiceId);
            setInvoice(res.invoice);
            setSuccessMessage("Three-Way Matching re-evaluated successfully.");
            if (onInvoiceUpdated) onInvoiceUpdated();
        } catch (err: any) {
            console.error("Failed to re-run match:", err);
            setError(err?.response?.data?.detail || "Failed to run three-way match.");
        } finally {
            setActionLoading(false);
        }
    };

    const handleOverrideMismatch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!overrideReason.trim()) {
            setError("Override authorization reason is required.");
            return;
        }

        try {
            setActionLoading(true);
            setError(null);
            const updated = await overrideMismatch(invoiceId, overrideReason.trim());
            setInvoice(updated);
            setShowOverrideModal(false);
            setOverrideReason('');
            setSuccessMessage("Discrepancy override authorized. Invoice is now ready for approval.");
            if (onInvoiceUpdated) onInvoiceUpdated();
        } catch (err: any) {
            console.error("Failed to override mismatch:", err);
            setError(err?.response?.data?.detail || "Failed to authorize discrepancy override.");
        } finally {
            setActionLoading(false);
        }
    };

    const handleApprove = async () => {
        try {
            setActionLoading(true);
            setError(null);
            const updated = await approveVendorInvoice(invoiceId);
            setInvoice(updated);
            setSuccessMessage("Vendor Invoice approved successfully.");
            if (onInvoiceUpdated) onInvoiceUpdated();
        } catch (err: any) {
            console.error("Failed to approve invoice:", err);
            setError(err?.response?.data?.detail || "Failed to approve invoice.");
        } finally {
            setActionLoading(false);
        }
    };

    const handlePostBill = async () => {
        try {
            setActionLoading(true);
            setError(null);
            const updated = await postVendorBill(invoiceId);
            setInvoice(updated);
            setSuccessMessage("Vendor Bill posted to Accounts Payable as AP Ready.");
            if (onInvoiceUpdated) onInvoiceUpdated();
        } catch (err: any) {
            console.error("Failed to post bill:", err);
            setError(err?.response?.data?.detail || "Failed to post vendor bill.");
        } finally {
            setActionLoading(false);
        }
    };

    const handleCancelInvoice = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setActionLoading(true);
            setError(null);
            const updated = await cancelVendorInvoice(invoiceId, cancelReason.trim());
            setInvoice(updated);
            setShowCancelModal(false);
            setCancelReason('');
            setSuccessMessage("Vendor Invoice cancelled successfully.");
            if (onInvoiceUpdated) onInvoiceUpdated();
        } catch (err: any) {
            console.error("Failed to cancel invoice:", err);
            setError(err?.response?.data?.detail || "Failed to cancel invoice.");
        } finally {
            setActionLoading(false);
        }
    };

    if (!isOpen) return null;

    const matchDetails: ThreeWayMatchDetails | undefined = invoice?.match_details;
    const isMatched = invoice?.status === 'MATCHED' || invoice?.match_status === 'MATCHED';
    const isMismatch = invoice?.status === 'MISMATCH' || (invoice?.match_status && invoice?.match_status !== 'MATCHED' && invoice?.match_status !== 'PENDING_MATCH');
    const isApproved = invoice?.status === 'APPROVED';
    const isPosted = invoice?.status === 'POSTED';
    const isCancelled = invoice?.status === 'CANCELLED';

    const getMatchStatusBadge = (status?: string) => {
        switch (status) {
            case 'MATCHED':
                return { label: '3-Way Matched', bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', border: 'rgba(16, 185, 129, 0.3)' };
            case 'QUANTITY_MISMATCH':
                return { label: 'Quantity Mismatch', bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171', border: 'rgba(239, 68, 68, 0.3)' };
            case 'PRICE_MISMATCH':
                return { label: 'Price Mismatch', bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.3)' };
            case 'MISMATCH':
                return { label: 'Discrepancy Detected', bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171', border: 'rgba(239, 68, 68, 0.3)' };
            default:
                return { label: status || 'Pending Match', bg: 'rgba(148, 163, 184, 0.15)', text: '#94a3b8', border: 'rgba(148, 163, 184, 0.3)' };
        }
    };

    const getStatusBadge = (status?: string) => {
        switch (status) {
            case 'POSTED':
                return { label: 'POSTED (AP READY)', bg: 'rgba(16, 185, 129, 0.2)', text: '#10b981', border: 'rgba(16, 185, 129, 0.4)' };
            case 'APPROVED':
                return { label: 'APPROVED', bg: 'rgba(59, 130, 246, 0.2)', text: '#60a5fa', border: 'rgba(59, 130, 246, 0.4)' };
            case 'MATCHED':
                return { label: 'MATCHED', bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', border: 'rgba(16, 185, 129, 0.3)' };
            case 'MISMATCH':
                return { label: 'MISMATCH', bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171', border: 'rgba(239, 68, 68, 0.3)' };
            case 'CANCELLED':
                return { label: 'CANCELLED', bg: 'rgba(100, 116, 139, 0.2)', text: '#94a3b8', border: 'rgba(100, 116, 139, 0.3)' };
            default:
                return { label: status || 'DRAFT', bg: 'rgba(148, 163, 184, 0.15)', text: '#cbd5e1', border: 'rgba(148, 163, 184, 0.3)' };
        }
    };

    const matchBadge = getMatchStatusBadge(invoice?.match_status);
    const statusBadge = getStatusBadge(invoice?.status);

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1050,
            padding: '16px'
        }}>
            <div style={{
                backgroundColor: 'var(--color-surface, #1e293b)',
                color: 'var(--color-text, #f8fafc)',
                borderRadius: '12px',
                border: '1px solid var(--color-border, #334155)',
                width: '100%',
                maxWidth: '1080px',
                maxHeight: '94vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)'
            }}>
                {/* Top Header */}
                <div style={{
                    padding: '20px 24px',
                    borderBottom: '1px solid var(--color-border, #334155)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>
                            {invoice?.number || 'Vendor Bill'}
                        </h2>
                        {invoice?.vendor_invoice_number && (
                            <span style={{
                                padding: '4px 10px',
                                borderRadius: '6px',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                color: '#e2e8f0',
                                border: '1px solid #475569'
                            }}>
                                Bill Ref: {invoice.vendor_invoice_number}
                            </span>
                        )}
                        <span style={{
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            backgroundColor: statusBadge.bg,
                            color: statusBadge.text,
                            border: `1px solid ${statusBadge.border}`
                        }}>
                            {statusBadge.label}
                        </span>
                        <span style={{
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            backgroundColor: matchBadge.bg,
                            color: matchBadge.text,
                            border: `1px solid ${matchBadge.border}`
                        }}>
                            {matchBadge.label}
                        </span>
                        {invoice?.ap_ready && (
                            <span style={{
                                padding: '4px 10px',
                                borderRadius: '6px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                backgroundColor: 'rgba(16, 185, 129, 0.25)',
                                color: '#34d399',
                                border: '1px solid rgba(16, 185, 129, 0.5)'
                            }}>
                                🏛️ AP Ready
                            </span>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#94a3b8',
                            fontSize: '1.5rem',
                            cursor: 'pointer',
                            padding: '4px'
                        }}
                    >
                        ✕
                    </button>
                </div>

                {/* Info Bar */}
                {invoice && (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                        gap: '16px',
                        padding: '16px 24px',
                        backgroundColor: 'rgba(15, 23, 42, 0.5)',
                        borderBottom: '1px solid var(--color-border, #334155)',
                        fontSize: '0.85rem'
                    }}>
                        <div>
                            <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Vendor</span>
                            <strong style={{ color: '#f8fafc' }}>{invoice.vendor_name || 'Direct Supplier'}</strong>
                        </div>
                        <div>
                            <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Parent PO</span>
                            <strong style={{ color: '#38bdf8' }}>{invoice.parent_document_number || 'N/A'}</strong>
                        </div>
                        <div>
                            <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Invoice Date / Due</span>
                            <span style={{ color: '#f8fafc' }}>{invoice.document_date} {invoice.due_date ? `(Due: ${invoice.due_date})` : ''}</span>
                        </div>
                        <div>
                            <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Original Bill</span>
                            <strong style={{ color: '#f8fafc', fontSize: '0.9375rem' }}>
                                {invoice.currency} {Number(invoice.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </strong>
                        </div>
                        {Number((invoice as any).return_credit || 0) > 0 && (
                            <div>
                                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Less: Return Credits</span>
                                <strong style={{ color: '#f87171', fontSize: '0.9375rem' }}>
                                    - {invoice.currency} {Number((invoice as any).return_credit).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </strong>
                            </div>
                        )}
                        <div>
                            <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Outstanding Payable</span>
                            <strong style={{
                                color: Number(invoice.outstanding_amount ?? invoice.total_amount) > 0 ? '#fbbf24' : '#10b981',
                                fontSize: '1rem'
                            }}>
                                {invoice.currency} {Number(invoice.outstanding_amount ?? invoice.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </strong>
                        </div>
                        <div>
                            <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Payment Status</span>
                            <span style={{
                                color: invoice.payment_status === 'PAID' ? '#10b981' : invoice.payment_status === 'OVERDUE' ? '#ef4444' : '#f59e0b',
                                fontWeight: 600
                            }}>
                                {invoice.payment_status || 'UNPAID'}
                            </span>
                        </div>
                    </div>
                )}

                {/* Tab Navigation */}
                <div style={{
                    display: 'flex',
                    gap: '8px',
                    padding: '0 24px',
                    borderBottom: '1px solid var(--color-border, #334155)',
                    backgroundColor: 'rgba(15, 23, 42, 0.2)'
                }}>
                    <button
                        onClick={() => setActiveTab('match')}
                        style={{
                            padding: '12px 16px',
                            background: 'transparent',
                            border: 'none',
                            borderBottom: activeTab === 'match' ? '2px solid #3b82f6' : '2px solid transparent',
                            color: activeTab === 'match' ? '#3b82f6' : '#94a3b8',
                            fontWeight: 600,
                            fontSize: '0.875rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <span>⚖️</span>
                        <span>Three-Way Match Verification</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('lines')}
                        style={{
                            padding: '12px 16px',
                            background: 'transparent',
                            border: 'none',
                            borderBottom: activeTab === 'lines' ? '2px solid #3b82f6' : '2px solid transparent',
                            color: activeTab === 'lines' ? '#3b82f6' : '#94a3b8',
                            fontWeight: 600,
                            fontSize: '0.875rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <span>📋</span>
                        <span>Invoice Line Items ({invoice?.lines?.length || 0})</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('audit')}
                        style={{
                            padding: '12px 16px',
                            background: 'transparent',
                            border: 'none',
                            borderBottom: activeTab === 'audit' ? '2px solid #3b82f6' : '2px solid transparent',
                            color: activeTab === 'audit' ? '#3b82f6' : '#94a3b8',
                            fontWeight: 600,
                            fontSize: '0.875rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <span>📜</span>
                        <span>Audit Trail & Overrides</span>
                    </button>
                </div>

                {/* Body Content */}
                <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {error && (
                        <div style={{
                            padding: '12px 16px',
                            borderRadius: '8px',
                            backgroundColor: 'rgba(239, 68, 68, 0.15)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            color: '#f87171',
                            fontSize: '0.875rem'
                        }}>
                            ⚠️ {error}
                        </div>
                    )}

                    {successMessage && (
                        <div style={{
                            padding: '12px 16px',
                            borderRadius: '8px',
                            backgroundColor: 'rgba(16, 185, 129, 0.15)',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            color: '#34d399',
                            fontSize: '0.875rem'
                        }}>
                            ✅ {successMessage}
                        </div>
                    )}

                    {loading ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                            Loading vendor bill details...
                        </div>
                    ) : !invoice ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                            Invoice not found.
                        </div>
                    ) : (
                        <>
                            {/* TAB 1: THREE-WAY MATCH */}
                            {activeTab === 'match' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    {/* Mismatch Alert / Override Alert */}
                                    {invoice.override_by_name && (
                                        <div style={{
                                            padding: '14px 18px',
                                            borderRadius: '8px',
                                            backgroundColor: 'rgba(59, 130, 246, 0.12)',
                                            border: '1px solid rgba(59, 130, 246, 0.3)',
                                            color: '#93c5fd',
                                            fontSize: '0.85rem'
                                        }}>
                                            <div style={{ fontWeight: 600, marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span>🛡️</span>
                                                <span>Discrepancy Authorized by {invoice.override_by_name}</span>
                                            </div>
                                            <div>Reason: "{invoice.override_reason}"</div>
                                        </div>
                                    )}

                                    {isMismatch && !invoice.override_by_name && (
                                        <div style={{
                                            padding: '16px 20px',
                                            borderRadius: '8px',
                                            backgroundColor: 'rgba(239, 68, 68, 0.12)',
                                            border: '1px solid rgba(239, 68, 68, 0.3)',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            flexWrap: 'wrap',
                                            gap: '12px'
                                        }}>
                                            <div>
                                                <div style={{ fontWeight: 700, color: '#f87171', fontSize: '0.95rem' }}>
                                                    ⚠️ Discrepancy Detected in 3-Way Match
                                                </div>
                                                <div style={{ fontSize: '0.8rem', color: '#fca5a5', marginTop: '4px' }}>
                                                    This bill differs from purchase order rates or received stock. It requires authorized approval override before proceeding to Accounts Payable.
                                                </div>
                                            </div>
                                            {!isApproved && !isPosted && !isCancelled && (
                                                <button
                                                    onClick={() => setShowOverrideModal(true)}
                                                    style={{
                                                        padding: '8px 16px',
                                                        borderRadius: '6px',
                                                        backgroundColor: '#ef4444',
                                                        color: '#ffffff',
                                                        border: 'none',
                                                        fontWeight: 600,
                                                        fontSize: '0.85rem',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    Authorize Override
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    {/* Match Breakdown Table */}
                                    <div style={{
                                        border: '1px solid var(--color-border, #334155)',
                                        borderRadius: '8px',
                                        overflow: 'hidden'
                                    }}>
                                        <div style={{
                                            padding: '12px 16px',
                                            backgroundColor: 'rgba(15, 23, 42, 0.7)',
                                            borderBottom: '1px solid var(--color-border, #334155)',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }}>
                                            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                                                Comparison: PO vs Goods Receipt (GRN) vs Vendor Bill
                                            </span>
                                            <button
                                                onClick={handleRunMatch}
                                                disabled={actionLoading || isPosted || isCancelled}
                                                style={{
                                                    padding: '4px 10px',
                                                    borderRadius: '4px',
                                                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                                                    border: '1px solid #475569',
                                                    color: '#f8fafc',
                                                    fontSize: '0.75rem',
                                                    cursor: actionLoading ? 'not-allowed' : 'pointer'
                                                }}
                                            >
                                                🔄 Re-run Match
                                            </button>
                                        </div>

                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                            <thead>
                                                <tr style={{ backgroundColor: 'rgba(15, 23, 42, 0.4)', borderBottom: '1px solid var(--color-border, #334155)', color: '#94a3b8', textAlign: 'left' }}>
                                                    <th style={{ padding: '10px 12px' }}>Line Item</th>
                                                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>Ordered (PO)</th>
                                                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>Received (GRN)</th>
                                                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>Invoiced</th>
                                                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>PO Rate</th>
                                                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Invoiced Rate</th>
                                                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Variance</th>
                                                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>Match Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {matchDetails?.lines && matchDetails.lines.length > 0 ? (
                                                    matchDetails.lines.map((line, idx) => {
                                                        const isLineQtyMatched = line.quantity_matched;
                                                        const isLinePriceMatched = line.price_matched;
                                                        const isFullyMatched = isLineQtyMatched && isLinePriceMatched;

                                                        return (
                                                            <tr
                                                                key={line.po_line_id || idx}
                                                                style={{
                                                                    borderBottom: '1px solid rgba(51, 65, 85, 0.4)',
                                                                    backgroundColor: isFullyMatched ? 'rgba(16, 185, 129, 0.03)' : 'rgba(239, 68, 68, 0.05)'
                                                                }}
                                                            >
                                                                <td style={{ padding: '12px' }}>
                                                                    <div style={{ fontWeight: 600, color: '#f8fafc' }}>{line.item_name}</div>
                                                                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{line.item_sku}</div>
                                                                    {line.discrepancy_reasons && line.discrepancy_reasons.length > 0 && (
                                                                        <div style={{ marginTop: '4px' }}>
                                                                            {line.discrepancy_reasons.map((r, rIdx) => (
                                                                                <span
                                                                                    key={rIdx}
                                                                                    style={{
                                                                                        display: 'inline-block',
                                                                                        padding: '2px 6px',
                                                                                        borderRadius: '4px',
                                                                                        fontSize: '0.7rem',
                                                                                        backgroundColor: 'rgba(239, 68, 68, 0.2)',
                                                                                        color: '#f87171',
                                                                                        marginRight: '4px'
                                                                                    }}
                                                                                >
                                                                                    ⚠️ {r}
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </td>
                                                                <td style={{ padding: '12px', textAlign: 'center', color: '#94a3b8' }}>
                                                                    {line.ordered_quantity}
                                                                </td>
                                                                <td style={{ padding: '12px', textAlign: 'center', color: '#10b981', fontWeight: 500 }}>
                                                                    {line.accepted_quantity}
                                                                </td>
                                                                <td style={{
                                                                    padding: '12px',
                                                                    textAlign: 'center',
                                                                    fontWeight: 600,
                                                                    color: isLineQtyMatched ? '#f8fafc' : '#f87171'
                                                                }}>
                                                                    {line.invoiced_quantity}
                                                                </td>
                                                                <td style={{ padding: '12px', textAlign: 'right', color: '#94a3b8' }}>
                                                                    {invoice.currency} {line.expected_price?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                                </td>
                                                                <td style={{
                                                                    padding: '12px',
                                                                    textAlign: 'right',
                                                                    fontWeight: 600,
                                                                    color: isLinePriceMatched ? '#f8fafc' : '#fbbf24'
                                                                }}>
                                                                    {invoice.currency} {line.invoiced_price?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                                </td>
                                                                <td style={{ padding: '12px', textAlign: 'right' }}>
                                                                    {line.price_variance !== 0 ? (
                                                                        <span style={{
                                                                            fontWeight: 600,
                                                                            color: line.price_variance > 0 ? '#f87171' : '#34d399'
                                                                        }}>
                                                                            {line.price_variance > 0 ? '+' : ''}
                                                                            {invoice.currency} {line.price_variance?.toLocaleString(undefined, { minimumFractionDigits: 2 })} ({line.variance_percentage}%)
                                                                        </span>
                                                                    ) : (
                                                                        <span style={{ color: '#64748b' }}>0.00 (0%)</span>
                                                                    )}
                                                                </td>
                                                                <td style={{ padding: '12px', textAlign: 'center' }}>
                                                                    {isFullyMatched ? (
                                                                        <span style={{
                                                                            padding: '3px 8px',
                                                                            borderRadius: '4px',
                                                                            fontSize: '0.75rem',
                                                                            fontWeight: 600,
                                                                            backgroundColor: 'rgba(16, 185, 129, 0.15)',
                                                                            color: '#34d399'
                                                                        }}>
                                                                            ✅ MATCHED
                                                                        </span>
                                                                    ) : (
                                                                        <span style={{
                                                                            padding: '3px 8px',
                                                                            borderRadius: '4px',
                                                                            fontSize: '0.75rem',
                                                                            fontWeight: 600,
                                                                            backgroundColor: 'rgba(239, 68, 68, 0.15)',
                                                                            color: '#f87171'
                                                                        }}>
                                                                            ❌ MISMATCH
                                                                        </span>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })
                                                ) : (
                                                    <tr>
                                                        <td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
                                                            No match analysis data available. Click 'Re-run Match' above.
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* TAB 2: INVOICE LINE ITEMS */}
                            {activeTab === 'lines' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    <div style={{ border: '1px solid var(--color-border, #334155)', borderRadius: '8px', overflow: 'hidden' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                            <thead>
                                                <tr style={{ backgroundColor: 'rgba(15, 23, 42, 0.6)', borderBottom: '1px solid var(--color-border, #334155)', color: '#94a3b8', textAlign: 'left' }}>
                                                    <th style={{ padding: '10px 12px' }}>#</th>
                                                    <th style={{ padding: '10px 12px' }}>Item Description</th>
                                                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>Invoiced Qty</th>
                                                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Unit Price</th>
                                                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Tax</th>
                                                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Discount</th>
                                                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Line Total</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {invoice.lines && invoice.lines.map((l, idx) => (
                                                    <tr key={l.id || idx} style={{ borderBottom: '1px solid rgba(51, 65, 85, 0.4)' }}>
                                                        <td style={{ padding: '10px 12px', color: '#64748b' }}>{l.line_number || idx + 1}</td>
                                                        <td style={{ padding: '10px 12px' }}>
                                                            <div style={{ fontWeight: 600, color: '#f8fafc' }}>{l.item_name || l.description || 'Item'}</div>
                                                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{l.item_sku}</div>
                                                        </td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600 }}>{l.quantity}</td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#94a3b8' }}>
                                                            {invoice.currency} {Number(l.unit_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                        </td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#94a3b8' }}>
                                                            {invoice.currency} {Number(l.tax_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                        </td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#10b981' }}>
                                                            - {invoice.currency} {Number(l.discount_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                        </td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#f8fafc' }}>
                                                            {invoice.currency} {Number(l.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Financial Breakdown Card */}
                                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                        <div style={{
                                            width: '320px',
                                            backgroundColor: 'rgba(15, 23, 42, 0.6)',
                                            padding: '16px',
                                            borderRadius: '8px',
                                            border: '1px solid var(--color-border, #334155)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '8px'
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#94a3b8' }}>
                                                <span>Subtotal:</span>
                                                <span>{invoice.currency} {Number(invoice.subtotal_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#94a3b8' }}>
                                                <span>Discount:</span>
                                                <span style={{ color: '#10b981' }}>- {invoice.currency} {Number(invoice.discount_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#94a3b8' }}>
                                                <span>Tax:</span>
                                                <span>+ {invoice.currency} {Number(invoice.tax_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#94a3b8' }}>
                                                <span>Freight:</span>
                                                <span>+ {invoice.currency} {Number(invoice.freight_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                            </div>
                                            <div style={{
                                                borderTop: '1px solid var(--color-border, #334155)',
                                                paddingTop: '8px',
                                                marginTop: '4px',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                fontSize: '1.05rem',
                                                fontWeight: 700,
                                                color: '#38bdf8'
                                            }}>
                                                <span>Grand Total:</span>
                                                <span>{invoice.currency} {Number(invoice.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* TAB 3: AUDIT TRAIL */}
                            {activeTab === 'audit' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {invoice.audit_trails && invoice.audit_trails.length > 0 ? (
                                        invoice.audit_trails.map((item: any, idx: number) => (
                                            <div
                                                key={idx}
                                                style={{
                                                    padding: '12px 16px',
                                                    borderRadius: '6px',
                                                    backgroundColor: 'rgba(15, 23, 42, 0.5)',
                                                    border: '1px solid var(--color-border, #334155)',
                                                    fontSize: '0.85rem'
                                                }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', marginBottom: '4px' }}>
                                                    <span style={{ fontWeight: 600, color: '#e2e8f0' }}>{item.event}</span>
                                                    <span style={{ fontSize: '0.75rem' }}>{new Date(item.created_at).toLocaleString()}</span>
                                                </div>
                                                <div style={{ color: '#cbd5e1' }}>{item.details}</div>
                                                {item.user_name && (
                                                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
                                                        By: {item.user_name}
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    ) : (
                                        <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
                                            No audit history records found.
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer Action Bar */}
                {invoice && (
                    <div style={{
                        padding: '16px 24px',
                        borderTop: '1px solid var(--color-border, #334155)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        backgroundColor: 'rgba(15, 23, 42, 0.4)'
                    }}>
                        <div>
                            {!isCancelled && !isPosted && (
                                <button
                                    onClick={() => setShowCancelModal(true)}
                                    disabled={actionLoading}
                                    style={{
                                        padding: '8px 14px',
                                        borderRadius: '6px',
                                        backgroundColor: 'transparent',
                                        border: '1px solid rgba(239, 68, 68, 0.4)',
                                        color: '#f87171',
                                        fontSize: '0.8rem',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Cancel Invoice
                                </button>
                            )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <button
                                onClick={onClose}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '6px',
                                    backgroundColor: 'transparent',
                                    border: '1px solid var(--color-border, #334155)',
                                    color: '#94a3b8',
                                    fontSize: '0.85rem',
                                    cursor: 'pointer'
                                }}
                            >
                                Close
                            </button>

                            {/* Approve Button */}
                            {!isApproved && !isPosted && !isCancelled && (
                                <button
                                    onClick={handleApprove}
                                    disabled={actionLoading || !isMatched}
                                    title={!isMatched ? "Cannot approve invoice with unresolved discrepancies. Authorize override first." : undefined}
                                    style={{
                                        padding: '8px 18px',
                                        borderRadius: '6px',
                                        backgroundColor: isMatched ? '#3b82f6' : '#334155',
                                        color: '#ffffff',
                                        border: 'none',
                                        fontWeight: 600,
                                        fontSize: '0.85rem',
                                        cursor: !isMatched || actionLoading ? 'not-allowed' : 'pointer',
                                        opacity: !isMatched ? 0.6 : 1
                                    }}
                                >
                                    {actionLoading ? 'Processing...' : 'Approve Invoice'}
                                </button>
                            )}

                            {/* Post to Accounts Payable Button */}
                            {isApproved && !isPosted && !isCancelled && (
                                <button
                                    onClick={handlePostBill}
                                    disabled={actionLoading}
                                    style={{
                                        padding: '8px 20px',
                                        borderRadius: '6px',
                                        backgroundColor: '#10b981',
                                        color: '#ffffff',
                                        border: 'none',
                                        fontWeight: 600,
                                        fontSize: '0.85rem',
                                        cursor: actionLoading ? 'not-allowed' : 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    <span>🏛️</span>
                                    <span>Post to Accounts Payable (AP Ready)</span>
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Modal: Authorize Discrepancy Override */}
            {showOverrideModal && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    zIndex: 1100,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '16px'
                }}>
                    <div style={{
                        backgroundColor: 'var(--color-surface, #1e293b)',
                        borderRadius: '10px',
                        border: '1px solid #ef4444',
                        width: '100%',
                        maxWidth: '520px',
                        padding: '24px',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)'
                    }}>
                        <h3 style={{ margin: '0 0 8px 0', fontSize: '1.15rem', color: '#f87171' }}>
                            🛡️ Authorize 3-Way Match Override
                        </h3>
                        <p style={{ margin: '0 0 16px 0', fontSize: '0.85rem', color: '#94a3b8' }}>
                            Please state the commercial or operational justification for accepting this rate/quantity variance. Your username and timestamp will be attached to the audit record.
                        </p>
                        <form onSubmit={handleOverrideMismatch}>
                            <textarea
                                required
                                rows={4}
                                placeholder="e.g. Contractual price revision approved per SLA addendum #2. Received stock confirmed by warehouse supervisor."
                                value={overrideReason}
                                onChange={(e) => setOverrideReason(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    borderRadius: '6px',
                                    backgroundColor: '#0f172a',
                                    border: '1px solid #334155',
                                    color: '#f8fafc',
                                    fontSize: '0.85rem',
                                    marginBottom: '16px'
                                }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button
                                    type="button"
                                    onClick={() => setShowOverrideModal(false)}
                                    style={{
                                        padding: '8px 14px',
                                        borderRadius: '6px',
                                        backgroundColor: 'transparent',
                                        border: '1px solid #334155',
                                        color: '#94a3b8',
                                        fontSize: '0.85rem',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={actionLoading}
                                    style={{
                                        padding: '8px 16px',
                                        borderRadius: '6px',
                                        backgroundColor: '#ef4444',
                                        color: '#ffffff',
                                        border: 'none',
                                        fontWeight: 600,
                                        fontSize: '0.85rem',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Confirm Authorization
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Cancel Invoice */}
            {showCancelModal && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    zIndex: 1100,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '16px'
                }}>
                    <div style={{
                        backgroundColor: 'var(--color-surface, #1e293b)',
                        borderRadius: '10px',
                        border: '1px solid #64748b',
                        width: '100%',
                        maxWidth: '480px',
                        padding: '24px',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)'
                    }}>
                        <h3 style={{ margin: '0 0 8px 0', fontSize: '1.15rem', color: '#f8fafc' }}>
                            Cancel Vendor Invoice
                        </h3>
                        <p style={{ margin: '0 0 16px 0', fontSize: '0.85rem', color: '#94a3b8' }}>
                            Are you sure you want to cancel this vendor invoice? Any billed quantities reserved against the PO will be released.
                        </p>
                        <form onSubmit={handleCancelInvoice}>
                            <textarea
                                rows={3}
                                placeholder="Reason for cancellation (optional)..."
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    borderRadius: '6px',
                                    backgroundColor: '#0f172a',
                                    border: '1px solid #334155',
                                    color: '#f8fafc',
                                    fontSize: '0.85rem',
                                    marginBottom: '16px'
                                }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button
                                    type="button"
                                    onClick={() => setShowCancelModal(false)}
                                    style={{
                                        padding: '8px 14px',
                                        borderRadius: '6px',
                                        backgroundColor: 'transparent',
                                        border: '1px solid #334155',
                                        color: '#94a3b8',
                                        fontSize: '0.85rem',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Keep Invoice
                                </button>
                                <button
                                    type="submit"
                                    disabled={actionLoading}
                                    style={{
                                        padding: '8px 16px',
                                        borderRadius: '6px',
                                        backgroundColor: '#ef4444',
                                        color: '#ffffff',
                                        border: 'none',
                                        fontWeight: 600,
                                        fontSize: '0.85rem',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Confirm Cancellation
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
