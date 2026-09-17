import React, { useState, useEffect } from 'react';
import {
    getVendorInvoices,
    type VendorInvoice
} from '../api';
import { VendorInvoiceDetailModal } from './VendorInvoiceDetailModal';
import { VendorPaymentModal } from './VendorPaymentModal';

export const VendorBillList: React.FC = () => {
    const [invoices, setInvoices] = useState<VendorInvoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [matchFilter, setMatchFilter] = useState<string>('ALL');
    const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
    const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<VendorInvoice | null>(null);

    useEffect(() => {
        fetchInvoices();
    }, [statusFilter, matchFilter]);

    const fetchInvoices = async () => {
        try {
            setLoading(true);
            const params: any = {};
            if (statusFilter !== 'ALL') params.status = statusFilter;
            if (matchFilter !== 'ALL') params.match_status = matchFilter;
            if (search.trim()) params.search = search.trim();

            const data = await getVendorInvoices(params);
            setInvoices(data);
        } catch (err) {
            console.error("Failed to load vendor invoices:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        fetchInvoices();
    };

    const getStatusPill = (status: string) => {
        switch (status) {
            case 'POSTED':
                return { label: 'POSTED (AP READY)', bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', border: 'rgba(16, 185, 129, 0.3)' };
            case 'APPROVED':
                return { label: 'APPROVED', bg: 'rgba(59, 130, 246, 0.15)', text: '#60a5fa', border: 'rgba(59, 130, 246, 0.3)' };
            case 'MATCHED':
                return { label: 'MATCHED', bg: 'rgba(16, 185, 129, 0.12)', text: '#10b981', border: 'rgba(16, 185, 129, 0.25)' };
            case 'MISMATCH':
                return { label: 'MISMATCH', bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171', border: 'rgba(239, 68, 68, 0.3)' };
            case 'CANCELLED':
                return { label: 'CANCELLED', bg: 'rgba(148, 163, 184, 0.15)', text: '#94a3b8', border: 'rgba(148, 163, 184, 0.25)' };
            default:
                return { label: status || 'DRAFT', bg: 'rgba(148, 163, 184, 0.1)', text: '#cbd5e1', border: 'rgba(148, 163, 184, 0.2)' };
        }
    };

    const getMatchPill = (matchStatus?: string) => {
        switch (matchStatus) {
            case 'MATCHED':
                return { label: '✅ Matched', color: '#34d399' };
            case 'QUANTITY_MISMATCH':
                return { label: '⚠️ Qty Mismatch', color: '#f87171' };
            case 'PRICE_MISMATCH':
                return { label: '⚠️ Rate Mismatch', color: '#fbbf24' };
            case 'MISMATCH':
                return { label: '❌ Mismatch', color: '#f87171' };
            default:
                return { label: '⏳ Pending', color: '#94a3b8' };
        }
    };

    const filteredInvoices = invoices.filter(inv => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
            inv.number?.toLowerCase().includes(q) ||
            inv.vendor_invoice_number?.toLowerCase().includes(q) ||
            inv.vendor_name?.toLowerCase().includes(q) ||
            inv.parent_document_number?.toLowerCase().includes(q)
        );
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Header & Controls */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '16px'
            }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc' }}>
                        Vendor Bills & Three-Way Matching
                    </h2>
                    <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#94a3b8' }}>
                        Financial verification layer matching Purchase Orders, Goods Receipts (GRN), and Vendor Invoices before Accounts Payable.
                    </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '8px' }}>
                        <input
                            type="text"
                            placeholder="Search bill #, PO #, vendor..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            style={{
                                padding: '8px 12px',
                                borderRadius: '6px',
                                backgroundColor: 'var(--color-surface, #1e293b)',
                                border: '1px solid var(--color-border, #334155)',
                                color: '#f8fafc',
                                fontSize: '0.85rem',
                                width: '220px'
                            }}
                        />
                    </form>

                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        style={{
                            padding: '8px 12px',
                            borderRadius: '6px',
                            backgroundColor: 'var(--color-surface, #1e293b)',
                            border: '1px solid var(--color-border, #334155)',
                            color: '#f8fafc',
                            fontSize: '0.85rem'
                        }}
                    >
                        <option value="ALL">All Statuses</option>
                        <option value="PENDING_MATCH">Pending Match</option>
                        <option value="MATCHED">Matched</option>
                        <option value="MISMATCH">Mismatch</option>
                        <option value="APPROVED">Approved</option>
                        <option value="POSTED">Posted (AP Ready)</option>
                        <option value="CANCELLED">Cancelled</option>
                    </select>

                    <select
                        value={matchFilter}
                        onChange={(e) => setMatchFilter(e.target.value)}
                        style={{
                            padding: '8px 12px',
                            borderRadius: '6px',
                            backgroundColor: 'var(--color-surface, #1e293b)',
                            border: '1px solid var(--color-border, #334155)',
                            color: '#f8fafc',
                            fontSize: '0.85rem'
                        }}
                    >
                        <option value="ALL">All Match Results</option>
                        <option value="MATCHED">Matched</option>
                        <option value="QUANTITY_MISMATCH">Qty Mismatch</option>
                        <option value="PRICE_MISMATCH">Price Mismatch</option>
                        <option value="MISMATCH">Any Mismatch</option>
                    </select>
                </div>
            </div>

            {/* Invoices Table */}
            <div style={{
                backgroundColor: 'var(--color-surface, #1e293b)',
                borderRadius: '10px',
                border: '1px solid var(--color-border, #334155)',
                overflow: 'hidden'
            }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                        <tr style={{
                            backgroundColor: 'rgba(15, 23, 42, 0.6)',
                            borderBottom: '1px solid var(--color-border, #334155)',
                            color: '#94a3b8',
                            textAlign: 'left'
                        }}>
                            <th style={{ padding: '12px 16px' }}>Invoice / Bill #</th>
                            <th style={{ padding: '12px 16px' }}>Vendor</th>
                            <th style={{ padding: '12px 16px' }}>Linked PO</th>
                            <th style={{ padding: '12px 16px' }}>Bill Date / Due</th>
                            <th style={{ padding: '12px 16px' }}>3-Way Match</th>
                            <th style={{ padding: '12px 16px', textAlign: 'right' }}>Bill Total</th>
                            <th style={{ padding: '12px 16px', textAlign: 'right' }}>Paid</th>
                            <th style={{ padding: '12px 16px', textAlign: 'right' }}>Outstanding</th>
                            <th style={{ padding: '12px 16px', textAlign: 'center' }}>Status</th>
                            <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                                    Loading vendor bills...
                                </td>
                            </tr>
                        ) : filteredInvoices.length === 0 ? (
                            <tr>
                                <td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                                    No vendor bills found matching criteria.
                                </td>
                            </tr>
                        ) : (
                            filteredInvoices.map(inv => {
                                const pill = getStatusPill(inv.status);
                                const matchPill = getMatchPill(inv.match_status);
                                const totalAmt = Number(inv.total_amount || 0);
                                const paidAmt = Number(inv.paid_amount || 0);
                                const outstandingAmt = inv.outstanding_amount !== undefined ? Number(inv.outstanding_amount) : Math.max(0, totalAmt - paidAmt);
                                const isOverdue = Boolean(inv.is_overdue);

                                return (
                                    <tr
                                        key={inv.id}
                                        onClick={() => setSelectedInvoiceId(inv.id)}
                                        style={{
                                            borderBottom: '1px solid rgba(51, 65, 85, 0.4)',
                                            cursor: 'pointer',
                                            transition: 'background-color 0.15s'
                                        }}
                                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.05)')}
                                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                                    >
                                        <td style={{ padding: '12px 16px' }}>
                                            <div style={{ fontWeight: 600, color: '#f8fafc' }}>{inv.number}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#60a5fa' }}>
                                                Ref: {inv.vendor_invoice_number || 'N/A'}
                                            </div>
                                        </td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <div style={{ fontWeight: 500, color: '#f1f5f9' }}>{inv.vendor_name || 'Supplier'}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{inv.vendor_code}</div>
                                        </td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <span style={{
                                                padding: '2px 8px',
                                                borderRadius: '4px',
                                                fontSize: '0.75rem',
                                                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                                                color: '#60a5fa',
                                                border: '1px solid rgba(59, 130, 246, 0.2)'
                                            }}>
                                                {inv.parent_document_number || 'N/A'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px 16px', color: '#94a3b8' }}>
                                            <div>{inv.document_date}</div>
                                            {inv.due_date && (
                                                <div style={{ fontSize: '0.75rem', color: isOverdue && outstandingAmt > 0 ? '#f87171' : '#64748b', fontWeight: isOverdue && outstandingAmt > 0 ? 700 : 400 }}>
                                                    Due: {inv.due_date}
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: matchPill.color }}>
                                                {matchPill.label}
                                            </span>
                                            {inv.override_by_name && (
                                                <div style={{ fontSize: '0.7rem', color: '#93c5fd' }}>Overridden</div>
                                            )}
                                        </td>
                                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#f8fafc' }}>
                                            {inv.currency} {totalAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                        <td style={{ padding: '12px 16px', textAlign: 'right', color: '#94a3b8' }}>
                                            {inv.currency} {paidAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: outstandingAmt > 0 ? '#f59e0b' : '#34d399' }}>
                                            {inv.currency} {outstandingAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                            <span style={{
                                                padding: '4px 8px',
                                                borderRadius: '6px',
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                                backgroundColor: pill.bg,
                                                color: pill.text,
                                                border: `1px solid ${pill.border}`
                                            }}>
                                                {pill.label}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedInvoiceId(inv.id);
                                                    }}
                                                    style={{
                                                        padding: '4px 10px',
                                                        borderRadius: '4px',
                                                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                                                        border: '1px solid rgba(59, 130, 246, 0.3)',
                                                        color: '#60a5fa',
                                                        fontSize: '0.8rem',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    Inspect
                                                </button>
                                                {inv.status === 'POSTED' && outstandingAmt > 0 && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedInvoiceForPayment(inv);
                                                        }}
                                                        style={{
                                                            padding: '4px 10px',
                                                            borderRadius: '4px',
                                                            backgroundColor: 'rgba(16, 185, 129, 0.15)',
                                                            border: '1px solid rgba(16, 185, 129, 0.3)',
                                                            color: '#34d399',
                                                            fontSize: '0.8rem',
                                                            fontWeight: 600,
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '4px'
                                                        }}
                                                    >
                                                        <i className='bx bx-credit-card'></i> Pay
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Invoice Detail Modal */}
            {selectedInvoiceId && (
                <VendorInvoiceDetailModal
                    isOpen={Boolean(selectedInvoiceId)}
                    onClose={() => setSelectedInvoiceId(null)}
                    invoiceId={selectedInvoiceId}
                    onInvoiceUpdated={fetchInvoices}
                />
            )}

            {/* Record Payment Modal */}
            {selectedInvoiceForPayment && (
                <VendorPaymentModal
                    isOpen={Boolean(selectedInvoiceForPayment)}
                    onClose={() => setSelectedInvoiceForPayment(null)}
                    onPaymentCreated={fetchInvoices}
                    defaultVendorId={selectedInvoiceForPayment.vendor || undefined}
                    defaultInvoiceId={selectedInvoiceForPayment.id}
                />
            )}
        </div>
    );
};
