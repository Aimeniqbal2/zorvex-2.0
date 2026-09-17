import React, { useState, useEffect } from 'react';
import { Button } from '../../../../components/ui/Button';
import { Card } from '../../../../components/ui/Card';
import { useToastStore } from '../../../../stores/toastStore';
import { useAuthStore } from '../../../../auth/authStore';
import {
    getVendorPayments,
    postVendorPayment,
    cancelDraftPayment,
    type VendorPayment
} from '../api';
import { VendorPaymentModal } from './VendorPaymentModal';
import { ReversePaymentModal } from './ReversePaymentModal';

interface VendorPaymentsTabProps {
    vendorId?: string;
    vendorName?: string;
}

export const VendorPaymentsTab: React.FC<VendorPaymentsTabProps> = ({
    vendorId,
    vendorName
}) => {
    const { user } = useAuthStore();
    const [payments, setPayments] = useState<VendorPayment[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [search, setSearch] = useState<string>('');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [selectedPaymentForReverse, setSelectedPaymentForReverse] = useState<VendorPayment | null>(null);
    const [selectedPaymentForView, setSelectedPaymentForView] = useState<VendorPayment | null>(null);

    const canManagePayments = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'finance' || user?.role === 'super_admin';

    useEffect(() => {
        loadPayments();
    }, [vendorId, statusFilter]);

    const loadPayments = async () => {
        try {
            setLoading(true);
            const params: any = {};
            if (vendorId) params.vendor = vendorId;
            if (statusFilter !== 'ALL') params.status = statusFilter;
            if (search.trim()) params.search = search.trim();

            const data = await getVendorPayments(params);
            setPayments(data);
        } catch (err) {
            console.error('Failed to load vendor payments:', err);
            useToastStore.getState().error('Failed to load payment vouchers.');
        } finally {
            setLoading(false);
        }
    };

    const handlePostPayment = async (payment: VendorPayment) => {
        if (!window.confirm(`Post payment voucher ${payment.payment_number} (${payment.currency} ${Number(payment.amount).toLocaleString()}) to Accounts Payable?`)) return;
        try {
            await postVendorPayment(payment.id);
            useToastStore.getState().success(`Payment ${payment.payment_number} posted successfully.`);
            loadPayments();
        } catch (err: any) {
            console.error('Failed to post payment:', err);
            const msg = err.response?.data?.detail || 'Failed to post payment.';
            useToastStore.getState().error(msg);
        }
    };

    const handleCancelPayment = async (payment: VendorPayment) => {
        if (!window.confirm(`Cancel draft payment ${payment.payment_number}?`)) return;
        try {
            await cancelDraftPayment(payment.id);
            useToastStore.getState().success(`Draft payment ${payment.payment_number} cancelled.`);
            loadPayments();
        } catch (err: any) {
            console.error('Failed to cancel draft payment:', err);
            const msg = err.response?.data?.detail || 'Failed to cancel draft payment.';
            useToastStore.getState().error(msg);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'POSTED':
                return { label: 'POSTED', bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', border: 'rgba(16, 185, 129, 0.3)' };
            case 'DRAFT':
                return { label: 'DRAFT', bg: 'rgba(148, 163, 184, 0.15)', text: '#94a3b8', border: 'rgba(148, 163, 184, 0.3)' };
            case 'REVERSED':
                return { label: 'REVERSED', bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171', border: 'rgba(239, 68, 68, 0.3)' };
            case 'CANCELLED':
                return { label: 'CANCELLED', bg: 'rgba(100, 116, 139, 0.15)', text: '#64748b', border: 'rgba(100, 116, 139, 0.3)' };
            default:
                return { label: status, bg: 'rgba(148, 163, 184, 0.1)', text: '#cbd5e1', border: 'rgba(148, 163, 184, 0.2)' };
        }
    };

    const getMethodLabel = (method: string) => {
        switch (method) {
            case 'BANK_TRANSFER': return 'Bank Transfer';
            case 'ONLINE_TRANSFER': return 'Online Transfer';
            case 'CHEQUE': return 'Cheque';
            case 'CASH': return 'Cash';
            default: return 'Other';
        }
    };

    const filteredPayments = payments.filter(p => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
            p.payment_number?.toLowerCase().includes(q) ||
            p.vendor_name?.toLowerCase().includes(q) ||
            p.reference_number?.toLowerCase().includes(q) ||
            p.cheque_number?.toLowerCase().includes(q) ||
            p.bank_cash_account?.toLowerCase().includes(q)
        );
    });

    const totalPostedAmount = filteredPayments
        .filter(p => p.status === 'POSTED')
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Header & Controls */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px'
            }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--color-text, #f8fafc)' }}>
                        {vendorName ? `${vendorName} — Payment Vouchers` : 'Vendor Payment Vouchers'}
                    </h3>
                    <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--color-text-muted, #94a3b8)' }}>
                        Disbursements, bank settlements, cheque vouchers, and Accounts Payable reconciliations.
                    </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                        <input
                            type="text"
                            placeholder="Search payment #, ref, cheque..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            style={{
                                padding: '7px 12px',
                                borderRadius: '6px',
                                background: 'var(--color-surface, #1e293b)',
                                border: '1px solid var(--color-border, #334155)',
                                color: '#f8fafc',
                                fontSize: '12px',
                                width: '220px'
                            }}
                        />
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            style={{
                                padding: '7px 12px',
                                borderRadius: '6px',
                                background: 'var(--color-surface, #1e293b)',
                                border: '1px solid var(--color-border, #334155)',
                                color: '#f8fafc',
                                fontSize: '12px'
                            }}
                        >
                            <option value="ALL">All Statuses</option>
                            <option value="POSTED">POSTED (Settled)</option>
                            <option value="DRAFT">DRAFT</option>
                            <option value="REVERSED">REVERSED</option>
                            <option value="CANCELLED">CANCELLED</option>
                        </select>
                    </div>

                    {canManagePayments && (
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => setShowCreateModal(true)}
                        >
                            <i className='bx bx-plus-circle'></i> Record Payment
                        </Button>
                    )}
                </div>
            </div>

            {/* Quick Metrics Bar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                <Card style={{ padding: '14px 18px', borderRadius: '10px', background: 'var(--color-surface, #1e293b)' }}>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                        Total Posted Settlements
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#34d399', marginTop: '4px' }}>
                        PKR {totalPostedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                </Card>

                <Card style={{ padding: '14px 18px', borderRadius: '10px', background: 'var(--color-surface, #1e293b)' }}>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                        Total Vouchers
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#38bdf8', marginTop: '4px' }}>
                        {filteredPayments.length} Voucher{filteredPayments.length !== 1 ? 's' : ''}
                    </div>
                </Card>

                <Card style={{ padding: '14px 18px', borderRadius: '10px', background: 'var(--color-surface, #1e293b)' }}>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                        Draft Payments
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#f59e0b', marginTop: '4px' }}>
                        {filteredPayments.filter(p => p.status === 'DRAFT').length}
                    </div>
                </Card>

                <Card style={{ padding: '14px 18px', borderRadius: '10px', background: 'var(--color-surface, #1e293b)' }}>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                        Reversed Payments
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#f87171', marginTop: '4px' }}>
                        {filteredPayments.filter(p => p.status === 'REVERSED').length}
                    </div>
                </Card>
            </div>

            {/* Payments Table */}
            <Card style={{ padding: 0, borderRadius: '12px', overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                        <i className='bx bx-loader-alt bx-spin' style={{ fontSize: '28px', marginBottom: '8px' }}></i>
                        <div>Loading payment vouchers...</div>
                    </div>
                ) : filteredPayments.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                        <i className='bx bx-credit-card' style={{ fontSize: '36px', marginBottom: '8px', opacity: 0.5 }}></i>
                        <h4 style={{ margin: '0 0 4px 0', fontSize: '14px' }}>No Payment Vouchers Found</h4>
                        <p style={{ margin: 0, fontSize: '12px' }}>
                            {search || statusFilter !== 'ALL'
                                ? 'No payments match your active filter criteria.'
                                : 'No payment vouchers have been recorded for this vendor yet.'}
                        </p>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ background: 'var(--color-surface-secondary, #0f172a)', borderBottom: '1px solid var(--color-border, #334155)', color: 'var(--color-text-muted)' }}>
                                    <th style={{ padding: '12px 16px' }}>Payment #</th>
                                    {!vendorId && <th style={{ padding: '12px 16px' }}>Vendor</th>}
                                    <th style={{ padding: '12px 16px' }}>Disbursement Date</th>
                                    <th style={{ padding: '12px 16px' }}>Method & Account</th>
                                    <th style={{ padding: '12px 16px' }}>Reference / Cheque</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Total Amount</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'center' }}>Allocated Bills</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'center' }}>Status</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredPayments.map(p => {
                                    const statusBadge = getStatusBadge(p.status);
                                    return (
                                        <tr
                                            key={p.id}
                                            style={{
                                                borderBottom: '1px solid var(--color-border, #334155)',
                                                transition: 'background 0.15s'
                                            }}
                                        >
                                            <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--color-primary, #6366f1)' }}>
                                                {p.payment_number}
                                            </td>
                                            {!vendorId && (
                                                <td style={{ padding: '12px 16px', color: '#f8fafc' }}>
                                                    <div style={{ fontWeight: 600 }}>{p.vendor_name || 'Direct Supplier'}</div>
                                                    {p.vendor_code && (
                                                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{p.vendor_code}</div>
                                                    )}
                                                </td>
                                            )}
                                            <td style={{ padding: '12px 16px', color: 'var(--color-text-muted)' }}>
                                                {new Date(p.payment_date).toLocaleDateString()}
                                            </td>
                                            <td style={{ padding: '12px 16px' }}>
                                                <div style={{ fontWeight: 600, color: '#f8fafc' }}>
                                                    {getMethodLabel(p.payment_method)}
                                                </div>
                                                {p.bank_cash_account && (
                                                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                                                        {p.bank_cash_account}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: '12px 16px', color: 'var(--color-text-muted)' }}>
                                                {p.payment_method === 'CHEQUE' ? (
                                                    <div>
                                                        <span style={{ color: '#38bdf8', fontWeight: 600 }}>CHQ #{p.cheque_number}</span>
                                                        {p.cheque_date && (
                                                            <div style={{ fontSize: '11px' }}>Date: {new Date(p.cheque_date).toLocaleDateString()}</div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    p.reference_number || 'N/A'
                                                )}
                                            </td>
                                            <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#34d399' }}>
                                                {p.currency} {Number(p.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                {p.allocations && p.allocations.length > 0 ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedPaymentForView(p)}
                                                        style={{
                                                            padding: '3px 8px',
                                                            borderRadius: '6px',
                                                            background: 'rgba(56, 189, 248, 0.12)',
                                                            border: '1px solid rgba(56, 189, 248, 0.3)',
                                                            color: '#38bdf8',
                                                            fontSize: '11px',
                                                            fontWeight: 600,
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        {p.allocations.length} Bill{p.allocations.length !== 1 ? 's' : ''} Allocated
                                                    </button>
                                                ) : (
                                                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Unallocated</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                <span style={{
                                                    fontSize: '11px',
                                                    fontWeight: 700,
                                                    padding: '3px 8px',
                                                    borderRadius: '6px',
                                                    background: statusBadge.bg,
                                                    color: statusBadge.text,
                                                    border: `1px solid ${statusBadge.border}`
                                                }}>
                                                    {statusBadge.label}
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                                    {/* View Allocations / Details */}
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedPaymentForView(p)}
                                                        title="View Allocations"
                                                        style={{
                                                            padding: '4px 8px',
                                                            borderRadius: '6px',
                                                            background: 'var(--color-surface-secondary, #0f172a)',
                                                            border: '1px solid var(--color-border, #334155)',
                                                            color: 'var(--color-text-muted)',
                                                            fontSize: '12px',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        <i className='bx bx-show'></i>
                                                    </button>

                                                    {/* Actions for DRAFT */}
                                                    {p.status === 'DRAFT' && canManagePayments && (
                                                        <>
                                                            <button
                                                                type="button"
                                                                onClick={() => handlePostPayment(p)}
                                                                title="Post Payment"
                                                                style={{
                                                                    padding: '4px 10px',
                                                                    borderRadius: '6px',
                                                                    background: 'rgba(16, 185, 129, 0.15)',
                                                                    border: '1px solid rgba(16, 185, 129, 0.3)',
                                                                    color: '#10b981',
                                                                    fontSize: '12px',
                                                                    fontWeight: 600,
                                                                    cursor: 'pointer'
                                                                }}
                                                            >
                                                                <i className='bx bx-check'></i> Post
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleCancelPayment(p)}
                                                                title="Cancel Draft"
                                                                style={{
                                                                    padding: '4px 8px',
                                                                    borderRadius: '6px',
                                                                    background: 'rgba(239, 68, 68, 0.1)',
                                                                    border: '1px solid rgba(239, 68, 68, 0.2)',
                                                                    color: '#ef4444',
                                                                    fontSize: '12px',
                                                                    cursor: 'pointer'
                                                                }}
                                                            >
                                                                <i className='bx bx-trash'></i>
                                                            </button>
                                                        </>
                                                    )}

                                                    {/* Actions for POSTED */}
                                                    {p.status === 'POSTED' && canManagePayments && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setSelectedPaymentForReverse(p)}
                                                            title="Reverse Payment"
                                                            style={{
                                                                padding: '4px 10px',
                                                                borderRadius: '6px',
                                                                background: 'rgba(239, 68, 68, 0.12)',
                                                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                                                color: '#f87171',
                                                                fontSize: '12px',
                                                                fontWeight: 600,
                                                                cursor: 'pointer',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '4px'
                                                            }}
                                                        >
                                                            <i className='bx bx-undo'></i> Reverse
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
                )}
            </Card>

            {/* View Payment Allocation Modal */}
            {selectedPaymentForView && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.75)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    backdropFilter: 'blur(4px)',
                    padding: '16px'
                }}>
                    <div style={{
                        background: 'var(--color-surface, #1e293b)',
                        border: '1px solid var(--color-border, #334155)',
                        borderRadius: '14px',
                        width: '100%',
                        maxWidth: '680px',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                        overflow: 'hidden'
                    }}>
                        <div style={{
                            padding: '18px 24px',
                            borderBottom: '1px solid var(--color-border, #334155)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: 'var(--color-surface-secondary, #0f172a)'
                        }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>
                                    Payment Voucher Details — {selectedPaymentForView.payment_number}
                                </h3>
                                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                    Vendor: {selectedPaymentForView.vendor_name} | {new Date(selectedPaymentForView.payment_date).toLocaleDateString()}
                                </span>
                            </div>
                            <button
                                onClick={() => setSelectedPaymentForView(null)}
                                style={{ background: 'transparent', border: 'none', color: 'var(--color-text-muted)', fontSize: '22px', cursor: 'pointer' }}
                            >
                                <i className='bx bx-x'></i>
                            </button>
                        </div>

                        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '70vh', overflowY: 'auto' }}>
                            {/* Summary Cards */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                                <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--color-surface-secondary, #0f172a)' }}>
                                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Total Amount</div>
                                    <div style={{ fontSize: '16px', fontWeight: 700, color: '#34d399' }}>
                                        {selectedPaymentForView.currency} {Number(selectedPaymentForView.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </div>
                                </div>
                                <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--color-surface-secondary, #0f172a)' }}>
                                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Method</div>
                                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#f8fafc' }}>
                                        {getMethodLabel(selectedPaymentForView.payment_method)}
                                    </div>
                                </div>
                                <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--color-surface-secondary, #0f172a)' }}>
                                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Status</div>
                                    <div style={{ fontSize: '14px', fontWeight: 700, color: selectedPaymentForView.status === 'POSTED' ? '#34d399' : '#f87171' }}>
                                        {selectedPaymentForView.status}
                                    </div>
                                </div>
                            </div>

                            {selectedPaymentForView.reversal_reason && (
                                <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', color: '#f87171', fontSize: '12px' }}>
                                    <strong>Reversal Reason:</strong> {selectedPaymentForView.reversal_reason}
                                    {selectedPaymentForView.reversed_by_name && (
                                        <span style={{ color: 'var(--color-text-muted)', marginLeft: '8px' }}>
                                            (by {selectedPaymentForView.reversed_by_name} on {selectedPaymentForView.reversed_at ? new Date(selectedPaymentForView.reversed_at).toLocaleDateString() : ''})
                                        </span>
                                    )}
                                </div>
                            )}

                            {/* Linked Invoices */}
                            <div>
                                <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>
                                    Allocated Bills / Invoices
                                </h4>
                                {selectedPaymentForView.allocations && selectedPaymentForView.allocations.length > 0 ? (
                                    <div style={{ border: '1px solid var(--color-border, #334155)', borderRadius: '8px', overflow: 'hidden' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                                            <thead>
                                                <tr style={{ background: 'var(--color-surface-secondary, #0f172a)', borderBottom: '1px solid var(--color-border, #334155)', color: 'var(--color-text-muted)' }}>
                                                    <th style={{ padding: '8px 12px' }}>Bill #</th>
                                                    <th style={{ padding: '8px 12px' }}>Vendor Inv #</th>
                                                    <th style={{ padding: '8px 12px' }}>PO Reference</th>
                                                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Bill Total</th>
                                                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Settled Amount</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {selectedPaymentForView.allocations.map(alloc => (
                                                    <tr key={alloc.id} style={{ borderBottom: '1px solid var(--color-border, #334155)' }}>
                                                        <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--color-primary, #6366f1)' }}>
                                                            {alloc.invoice_number}
                                                        </td>
                                                        <td style={{ padding: '8px 12px', color: '#f8fafc' }}>
                                                            {alloc.vendor_invoice_number}
                                                        </td>
                                                        <td style={{ padding: '8px 12px', color: 'var(--color-text-muted)' }}>
                                                            {alloc.parent_po_number || 'N/A'}
                                                        </td>
                                                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                                                            PKR {Number(alloc.invoice_total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                        </td>
                                                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#38bdf8' }}>
                                                            PKR {Number(alloc.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>
                                        No invoices linked to this voucher (unallocated advance).
                                    </div>
                                )}
                            </div>
                        </div>

                        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--color-border, #334155)', display: 'flex', justifyContent: 'flex-end', background: 'var(--color-surface-secondary, #0f172a)' }}>
                            <Button variant="secondary" size="sm" onClick={() => setSelectedPaymentForView(null)}>
                                Close
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modals */}
            <VendorPaymentModal
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                onPaymentCreated={loadPayments}
                defaultVendorId={vendorId}
            />

            <ReversePaymentModal
                isOpen={Boolean(selectedPaymentForReverse)}
                onClose={() => setSelectedPaymentForReverse(null)}
                onPaymentReversed={loadPayments}
                payment={selectedPaymentForReverse}
            />
        </div>
    );
};
