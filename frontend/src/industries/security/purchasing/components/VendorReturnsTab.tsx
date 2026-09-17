import React, { useState, useEffect } from 'react';
import { Button } from '../../../../components/ui/Button';
import { Card } from '../../../../components/ui/Card';
import { useToastStore } from '../../../../stores/toastStore';
import { useAuthStore } from '../../../../auth/authStore';
import {
    getPurchaseReturns,
    getVendorCreditNotes,
    getVendorReturnsSummary,
    submitReturnForApproval,
    approvePurchaseReturn,
    postPurchaseReturn,
    cancelPurchaseReturn,
    type PurchaseReturn,
    type VendorCreditNote,
    type VendorReturnsSummary
} from '../api';
import { PurchaseReturnModal } from './PurchaseReturnModal';

interface VendorReturnsTabProps {
    vendorId?: string;
    vendorName?: string;
}

export const VendorReturnsTab: React.FC<VendorReturnsTabProps> = ({
    vendorId,
    vendorName
}) => {
    const { user } = useAuthStore();
    const [returns, setReturns] = useState<PurchaseReturn[]>([]);
    const [creditNotes, setCreditNotes] = useState<VendorCreditNote[]>([]);
    const [summary, setSummary] = useState<VendorReturnsSummary | null>(null);

    const [activeSubTab, setActiveSubTab] = useState<'returns' | 'credit_notes'>('returns');
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [search, setSearch] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(true);

    const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
    const [selectedReturnForDetail, setSelectedReturnForDetail] = useState<PurchaseReturn | null>(null);

    const canManageReturns = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'finance' || user?.role === 'super_admin';

    useEffect(() => {
        loadData();
    }, [vendorId, statusFilter]);

    const loadData = async () => {
        try {
            setLoading(true);
            const params: any = {};
            if (vendorId) params.vendor = vendorId;
            if (statusFilter !== 'ALL') params.status = statusFilter;
            if (search.trim()) params.search = search.trim();

            const [returnsData, cnData] = await Promise.all([
                getPurchaseReturns(params),
                getVendorCreditNotes(vendorId ? { vendor: vendorId } : undefined)
            ]);

            setReturns(returnsData);
            setCreditNotes(cnData);

            if (vendorId) {
                const sumData = await getVendorReturnsSummary(vendorId);
                setSummary(sumData);
            }
        } catch (err) {
            console.error('Failed to load purchase returns / credit notes:', err);
            useToastStore.getState().error('Failed to load return documents.');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmitForApproval = async (ret: PurchaseReturn) => {
        try {
            await submitReturnForApproval(ret.id);
            useToastStore.getState().success(`Return ${ret.return_number} submitted for approval.`);
            loadData();
        } catch (err: any) {
            console.error('Failed to submit return:', err);
            const msg = err.response?.data?.detail || 'Failed to submit return.';
            useToastStore.getState().error(msg);
        }
    };

    const handleApproveReturn = async (ret: PurchaseReturn) => {
        try {
            await approvePurchaseReturn(ret.id);
            useToastStore.getState().success(`Return ${ret.return_number} approved.`);
            loadData();
        } catch (err: any) {
            console.error('Failed to approve return:', err);
            const msg = err.response?.data?.detail || 'Failed to approve return.';
            useToastStore.getState().error(msg);
        }
    };

    const handlePostReturn = async (ret: PurchaseReturn) => {
        if (!window.confirm(
            `Post Purchase Return ${ret.return_number}?\n\nThis will:\n1. Execute Stock OUT in Universal Inventory\n2. Transition serial numbers to RETURNED\n3. Issue Vendor Credit Note and adjust Accounts Payable balance.`
        )) return;

        try {
            const res = await postPurchaseReturn(ret.id);
            useToastStore.getState().success(
                `Purchase Return ${ret.return_number} posted! Vendor Credit Note ${res.credit_note_number} generated.`
            );
            loadData();
        } catch (err: any) {
            console.error('Failed to post purchase return:', err);
            const msg = err.response?.data?.detail || 'Failed to post return.';
            useToastStore.getState().error(msg);
        }
    };

    const handleCancelReturn = async (ret: PurchaseReturn) => {
        const reason = window.prompt(`Reason for cancelling Return ${ret.return_number}:`);
        if (reason === null) return;

        try {
            await cancelPurchaseReturn(ret.id, reason);
            useToastStore.getState().success(`Return ${ret.return_number} cancelled.`);
            loadData();
        } catch (err: any) {
            console.error('Failed to cancel return:', err);
            const msg = err.response?.data?.detail || 'Failed to cancel return.';
            useToastStore.getState().error(msg);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'POSTED':
                return { label: 'POSTED', bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', border: 'rgba(16, 185, 129, 0.3)' };
            case 'APPROVED':
                return { label: 'APPROVED', bg: 'rgba(59, 130, 246, 0.15)', text: '#60a5fa', border: 'rgba(59, 130, 246, 0.3)' };
            case 'PENDING_APPROVAL':
                return { label: 'PENDING APPROVAL', bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.3)' };
            case 'DRAFT':
                return { label: 'DRAFT', bg: 'rgba(148, 163, 184, 0.15)', text: '#94a3b8', border: 'rgba(148, 163, 184, 0.3)' };
            case 'CANCELLED':
                return { label: 'CANCELLED', bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171', border: 'rgba(239, 68, 68, 0.3)' };
            default:
                return { label: status, bg: 'rgba(148, 163, 184, 0.1)', text: '#cbd5e1', border: 'rgba(148, 163, 184, 0.2)' };
        }
    };

    const getReasonBadge = (reason: string) => {
        switch (reason) {
            case 'DEFECTIVE': return { label: 'Defective', bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171' };
            case 'DAMAGED': return { label: 'Damaged', bg: 'rgba(249, 115, 22, 0.15)', text: '#fb923c' };
            case 'WRONG_ITEM': return { label: 'Wrong Item', bg: 'rgba(168, 85, 247, 0.15)', text: '#c084fc' };
            case 'EXCESS_QUANTITY': return { label: 'Excess Qty', bg: 'rgba(59, 130, 246, 0.15)', text: '#60a5fa' };
            case 'QUALITY_REJECTED': return { label: 'Quality Rejected', bg: 'rgba(236, 72, 153, 0.15)', text: '#f472b6' };
            case 'WARRANTY_RETURN': return { label: 'Warranty Return', bg: 'rgba(20, 184, 166, 0.15)', text: '#2dd4bf' };
            default: return { label: reason, bg: 'rgba(148, 163, 184, 0.15)', text: '#94a3b8' };
        }
    };

    // Derived metric cards
    const totalReturnedValue = summary ? summary.total_returned_value : returns.filter(r => r.status === 'POSTED').reduce((acc, r) => acc + Number(r.total_return_amount || 0), 0);
    const totalCreditNotesAmount = summary ? summary.total_credit_notes_amount : creditNotes.reduce((acc, c) => acc + Number(c.amount || 0), 0);
    const totalUnallocatedCredit = summary ? summary.total_unallocated_credit : creditNotes.reduce((acc, c) => acc + Number(c.unallocated_amount || 0), 0);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Header & Metric Cards */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '1rem'
            }}>
                {/* Metric 1: Total Returns */}
                <Card style={{
                    padding: '1.25rem',
                    backgroundColor: 'var(--color-surface, #1e293b)',
                    border: '1px solid var(--color-border, rgba(255, 255, 255, 0.1))',
                    borderRadius: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.375rem'
                }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted, #94a3b8)', textTransform: 'uppercase' }}>
                        Total Returns
                    </span>
                    <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text, #f8fafc)' }}>
                        {returns.length}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#38bdf8' }}>
                        {returns.filter(r => r.status === 'POSTED').length} Posted | {returns.filter(r => r.status === 'DRAFT').length} Draft
                    </span>
                </Card>

                {/* Metric 2: Total Returned Value */}
                <Card style={{
                    padding: '1.25rem',
                    backgroundColor: 'var(--color-surface, #1e293b)',
                    border: '1px solid var(--color-border, rgba(255, 255, 255, 0.1))',
                    borderRadius: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.375rem'
                }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted, #94a3b8)', textTransform: 'uppercase' }}>
                        Total Return Value
                    </span>
                    <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f87171' }}>
                        {Number(totalReturnedValue).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #94a3b8)' }}>
                        Posted inventory reversals
                    </span>
                </Card>

                {/* Metric 3: Credit Notes Total */}
                <Card style={{
                    padding: '1.25rem',
                    backgroundColor: 'var(--color-surface, #1e293b)',
                    border: '1px solid var(--color-border, rgba(255, 255, 255, 0.1))',
                    borderRadius: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.375rem'
                }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted, #94a3b8)', textTransform: 'uppercase' }}>
                        Credit Notes Issued
                    </span>
                    <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#34d399' }}>
                        {Number(totalCreditNotesAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #94a3b8)' }}>
                        {creditNotes.length} notes linked to bills
                    </span>
                </Card>

                {/* Metric 4: Unallocated Credit Balance */}
                <Card style={{
                    padding: '1.25rem',
                    backgroundColor: 'var(--color-surface, #1e293b)',
                    border: '1px solid var(--color-border, rgba(255, 255, 255, 0.1))',
                    borderRadius: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.375rem',
                    background: Number(totalUnallocatedCredit) > 0 ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(16, 185, 129, 0.02) 100%)' : undefined
                }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted, #94a3b8)', textTransform: 'uppercase' }}>
                        Unallocated Credit Balance
                    </span>
                    <span style={{ fontSize: '1.5rem', fontWeight: 700, color: Number(totalUnallocatedCredit) > 0 ? '#34d399' : '#94a3b8' }}>
                        {Number(totalUnallocatedCredit).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: Number(totalUnallocatedCredit) > 0 ? '#34d399' : 'var(--color-text-muted, #94a3b8)' }}>
                        Available for future AP settlements
                    </span>
                </Card>
            </div>

            {/* Action Bar & Sub-Tabs */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1rem',
                padding: '1rem',
                borderRadius: '12px',
                backgroundColor: 'var(--color-surface, #1e293b)',
                border: '1px solid var(--color-border, rgba(255, 255, 255, 0.1))'
            }}>
                {/* Sub-tab switcher */}
                <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(0,0,0,0.2)', padding: '0.25rem', borderRadius: '8px' }}>
                    <button
                        onClick={() => setActiveSubTab('returns')}
                        style={{
                            padding: '0.5rem 1rem',
                            borderRadius: '6px',
                            border: 'none',
                            fontWeight: 600,
                            fontSize: '0.875rem',
                            cursor: 'pointer',
                            backgroundColor: activeSubTab === 'returns' ? 'var(--color-primary, #3b82f6)' : 'transparent',
                            color: activeSubTab === 'returns' ? '#fff' : 'var(--color-text-muted, #94a3b8)'
                        }}
                    >
                        Purchase Returns ({returns.length})
                    </button>
                    <button
                        onClick={() => setActiveSubTab('credit_notes')}
                        style={{
                            padding: '0.5rem 1rem',
                            borderRadius: '6px',
                            border: 'none',
                            fontWeight: 600,
                            fontSize: '0.875rem',
                            cursor: 'pointer',
                            backgroundColor: activeSubTab === 'credit_notes' ? 'var(--color-primary, #3b82f6)' : 'transparent',
                            color: activeSubTab === 'credit_notes' ? '#fff' : 'var(--color-text-muted, #94a3b8)'
                        }}
                    >
                        Vendor Credit Notes ({creditNotes.length})
                    </button>
                </div>

                {/* Filters & Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    {activeSubTab === 'returns' && (
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            style={{
                                padding: '0.5rem 0.75rem',
                                borderRadius: '8px',
                                backgroundColor: 'var(--color-surface-hover, #0f172a)',
                                border: '1px solid var(--color-border, rgba(255, 255, 255, 0.15))',
                                color: 'var(--color-text, #f8fafc)',
                                fontSize: '0.875rem'
                            }}
                        >
                            <option value="ALL">All Statuses</option>
                            <option value="DRAFT">Draft</option>
                            <option value="PENDING_APPROVAL">Pending Approval</option>
                            <option value="APPROVED">Approved</option>
                            <option value="POSTED">Posted</option>
                            <option value="CANCELLED">Cancelled</option>
                        </select>
                    )}

                    <input
                        type="text"
                        placeholder="Search number, ref or notes..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && loadData()}
                        style={{
                            padding: '0.5rem 0.75rem',
                            borderRadius: '8px',
                            backgroundColor: 'var(--color-surface-hover, #0f172a)',
                            border: '1px solid var(--color-border, rgba(255, 255, 255, 0.15))',
                            color: 'var(--color-text, #f8fafc)',
                            fontSize: '0.875rem',
                            minWidth: '220px'
                        }}
                    />

                    {canManageReturns && (
                        <Button
                            variant="primary"
                            onClick={() => setShowCreateModal(true)}
                            style={{
                                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                                border: 'none',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}
                        >
                            <span>↩</span> Initiate Return
                        </Button>
                    )}
                </div>
            </div>

            {/* Content Section */}
            {loading ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted, #94a3b8)' }}>
                    Loading return records...
                </div>
            ) : activeSubTab === 'returns' ? (
                /* Returns Table */
                <Card style={{
                    backgroundColor: 'var(--color-surface, #1e293b)',
                    border: '1px solid var(--color-border, rgba(255, 255, 255, 0.1))',
                    borderRadius: '12px',
                    overflow: 'hidden'
                }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                        <thead>
                            <tr style={{
                                backgroundColor: 'rgba(0,0,0,0.25)',
                                borderBottom: '1px solid var(--color-border, rgba(255, 255, 255, 0.1))',
                                color: 'var(--color-text-muted, #94a3b8)',
                                fontSize: '0.75rem',
                                textTransform: 'uppercase'
                            }}>
                                <th style={{ padding: '0.875rem 1rem' }}>Return #</th>
                                {!vendorId && <th style={{ padding: '0.875rem 1rem' }}>Vendor</th>}
                                <th style={{ padding: '0.875rem 1rem' }}>GRN / PO Ref</th>
                                <th style={{ padding: '0.875rem 1rem' }}>Date</th>
                                <th style={{ padding: '0.875rem 1rem' }}>Reason</th>
                                <th style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>Total Return</th>
                                <th style={{ padding: '0.875rem 1rem' }}>Status</th>
                                <th style={{ padding: '0.875rem 1rem' }}>Credit Note</th>
                                <th style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {returns.length === 0 ? (
                                <tr>
                                    <td colSpan={vendorId ? 8 : 9} style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted, #94a3b8)' }}>
                                        No purchase returns found{vendorName ? ` for ${vendorName}` : ''}.
                                    </td>
                                </tr>
                            ) : (
                                returns.map(ret => {
                                    const sBadge = getStatusBadge(ret.status);
                                    const rBadge = getReasonBadge(ret.reason);
                                    return (
                                        <tr
                                            key={ret.id}
                                            style={{
                                                borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                                                transition: 'background-color 0.15s ease'
                                            }}
                                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)')}
                                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                                        >
                                            <td style={{ padding: '0.875rem 1rem', fontWeight: 600, color: 'var(--color-text, #f8fafc)' }}>
                                                {ret.return_number}
                                            </td>
                                            {!vendorId && (
                                                <td style={{ padding: '0.875rem 1rem', color: 'var(--color-text, #f8fafc)' }}>
                                                    {ret.vendor_name || 'Vendor'}
                                                </td>
                                            )}
                                            <td style={{ padding: '0.875rem 1rem', color: 'var(--color-text-muted, #94a3b8)' }}>
                                                <div>{ret.goods_receipt_number !== 'N/A' ? ret.goods_receipt_number : '-'}</div>
                                                {ret.purchase_order_number !== 'N/A' && (
                                                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>PO: {ret.purchase_order_number}</div>
                                                )}
                                            </td>
                                            <td style={{ padding: '0.875rem 1rem', color: 'var(--color-text-muted, #94a3b8)' }}>
                                                {ret.return_date}
                                            </td>
                                            <td style={{ padding: '0.875rem 1rem' }}>
                                                <span style={{
                                                    fontSize: '0.75rem',
                                                    padding: '0.2rem 0.5rem',
                                                    borderRadius: '4px',
                                                    backgroundColor: rBadge.bg,
                                                    color: rBadge.text,
                                                    fontWeight: 600
                                                }}>
                                                    {rBadge.label}
                                                </span>
                                            </td>
                                            <td style={{ padding: '0.875rem 1rem', textAlign: 'right', fontWeight: 700, color: '#f87171' }}>
                                                {ret.currency} {Number(ret.total_return_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                            <td style={{ padding: '0.875rem 1rem' }}>
                                                <span style={{
                                                    fontSize: '0.75rem',
                                                    padding: '0.25rem 0.625rem',
                                                    borderRadius: '9999px',
                                                    backgroundColor: sBadge.bg,
                                                    color: sBadge.text,
                                                    border: `1px solid ${sBadge.border}`,
                                                    fontWeight: 600,
                                                    display: 'inline-block'
                                                }}>
                                                    {sBadge.label}
                                                </span>
                                            </td>
                                            <td style={{ padding: '0.875rem 1rem' }}>
                                                {ret.credit_note_number ? (
                                                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#34d399', background: 'rgba(16, 185, 129, 0.1)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                                                        {ret.credit_note_number}
                                                    </span>
                                                ) : (
                                                    <span style={{ color: '#64748b', fontSize: '0.75rem' }}>Pending Post</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>
                                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.375rem' }}>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => setSelectedReturnForDetail(ret)}
                                                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                                                    >
                                                        Details
                                                    </Button>

                                                    {canManageReturns && ret.status === 'DRAFT' && (
                                                        <>
                                                            <Button
                                                                variant="secondary"
                                                                size="sm"
                                                                onClick={() => handleSubmitForApproval(ret)}
                                                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderColor: '#3b82f6', color: '#60a5fa' }}
                                                            >
                                                                Submit
                                                            </Button>
                                                            <Button
                                                                variant="secondary"
                                                                size="sm"
                                                                onClick={() => handleCancelReturn(ret)}
                                                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderColor: '#ef4444', color: '#f87171' }}
                                                            >
                                                                Cancel
                                                            </Button>
                                                        </>
                                                    )}

                                                    {canManageReturns && ret.status === 'PENDING_APPROVAL' && (
                                                        <Button
                                                            variant="secondary"
                                                            size="sm"
                                                            onClick={() => handleApproveReturn(ret)}
                                                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderColor: '#10b981', color: '#34d399' }}
                                                        >
                                                            Approve
                                                        </Button>
                                                    )}

                                                    {canManageReturns && ret.status === 'APPROVED' && (
                                                        <Button
                                                            variant="primary"
                                                            size="sm"
                                                            onClick={() => handlePostReturn(ret)}
                                                            style={{
                                                                padding: '0.25rem 0.625rem',
                                                                fontSize: '0.75rem',
                                                                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                                                border: 'none',
                                                                fontWeight: 600
                                                            }}
                                                        >
                                                            Post & Reverse
                                                        </Button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </Card>
            ) : (
                /* Vendor Credit Notes Table */
                <Card style={{
                    backgroundColor: 'var(--color-surface, #1e293b)',
                    border: '1px solid var(--color-border, rgba(255, 255, 255, 0.1))',
                    borderRadius: '12px',
                    overflow: 'hidden'
                }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                        <thead>
                            <tr style={{
                                backgroundColor: 'rgba(0,0,0,0.25)',
                                borderBottom: '1px solid var(--color-border, rgba(255, 255, 255, 0.1))',
                                color: 'var(--color-text-muted, #94a3b8)',
                                fontSize: '0.75rem',
                                textTransform: 'uppercase'
                            }}>
                                <th style={{ padding: '0.875rem 1rem' }}>Credit Note #</th>
                                {!vendorId && <th style={{ padding: '0.875rem 1rem' }}>Vendor</th>}
                                <th style={{ padding: '0.875rem 1rem' }}>Return #</th>
                                <th style={{ padding: '0.875rem 1rem' }}>Linked Invoice #</th>
                                <th style={{ padding: '0.875rem 1rem' }}>Date</th>
                                <th style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>Total Credit</th>
                                <th style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>Allocated to Bill</th>
                                <th style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>Unallocated Balance</th>
                                <th style={{ padding: '0.875rem 1rem' }}>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {creditNotes.length === 0 ? (
                                <tr>
                                    <td colSpan={vendorId ? 8 : 9} style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted, #94a3b8)' }}>
                                        No vendor credit notes found.
                                    </td>
                                </tr>
                            ) : (
                                creditNotes.map(cn => {
                                    const isUnallocated = Number(cn.unallocated_amount) > 0;
                                    return (
                                        <tr
                                            key={cn.id}
                                            style={{
                                                borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                                                transition: 'background-color 0.15s ease'
                                            }}
                                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)')}
                                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                                        >
                                            <td style={{ padding: '0.875rem 1rem', fontWeight: 600, color: '#34d399' }}>
                                                {cn.credit_note_number}
                                            </td>
                                            {!vendorId && (
                                                <td style={{ padding: '0.875rem 1rem', color: 'var(--color-text, #f8fafc)' }}>
                                                    {cn.vendor_name}
                                                </td>
                                            )}
                                            <td style={{ padding: '0.875rem 1rem', color: 'var(--color-text-muted, #94a3b8)' }}>
                                                {cn.return_number || '-'}
                                            </td>
                                            <td style={{ padding: '0.875rem 1rem', color: 'var(--color-text-muted, #94a3b8)' }}>
                                                {cn.invoice_number !== 'N/A' ? cn.invoice_number : 'General Credit'}
                                            </td>
                                            <td style={{ padding: '0.875rem 1rem', color: 'var(--color-text-muted, #94a3b8)' }}>
                                                {cn.credit_date}
                                            </td>
                                            <td style={{ padding: '0.875rem 1rem', textAlign: 'right', fontWeight: 700, color: 'var(--color-text, #f8fafc)' }}>
                                                {cn.currency} {Number(cn.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                            <td style={{ padding: '0.875rem 1rem', textAlign: 'right', color: '#60a5fa' }}>
                                                {cn.currency} {Number(cn.allocated_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                            <td style={{ padding: '0.875rem 1rem', textAlign: 'right', fontWeight: 600, color: isUnallocated ? '#34d399' : '#94a3b8' }}>
                                                {cn.currency} {Number(cn.unallocated_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                            <td style={{ padding: '0.875rem 1rem' }}>
                                                <span style={{
                                                    fontSize: '0.75rem',
                                                    padding: '0.2rem 0.5rem',
                                                    borderRadius: '4px',
                                                    backgroundColor: cn.status === 'POSTED' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                                    color: cn.status === 'POSTED' ? '#34d399' : '#f87171',
                                                    fontWeight: 600
                                                }}>
                                                    {cn.status}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </Card>
            )}

            {/* Create Return Modal */}
            <PurchaseReturnModal
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                onSuccess={() => loadData()}
                initialVendorId={vendorId}
            />

            {/* Return Detail View Modal */}
            {selectedReturnForDetail && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.75)',
                    backdropFilter: 'blur(6px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    padding: '1.5rem'
                }}>
                    <Card style={{
                        width: '100%',
                        maxWidth: '840px',
                        maxHeight: '90vh',
                        display: 'flex',
                        flexDirection: 'column',
                        backgroundColor: 'var(--color-surface, #1e293b)',
                        border: '1px solid var(--color-border, rgba(255, 255, 255, 0.1))',
                        borderRadius: '16px',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                        overflow: 'hidden'
                    }}>
                        {/* Header */}
                        <div style={{
                            padding: '1.25rem 1.5rem',
                            borderBottom: '1px solid var(--color-border, rgba(255, 255, 255, 0.1))',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-text, #f8fafc)' }}>
                                    Purchase Return {selectedReturnForDetail.return_number}
                                </h3>
                                <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted, #94a3b8)' }}>
                                    Vendor: {selectedReturnForDetail.vendor_name} ({selectedReturnForDetail.vendor_code})
                                </span>
                            </div>
                            <button
                                onClick={() => setSelectedReturnForDetail(null)}
                                style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '1.5rem', cursor: 'pointer' }}
                            >
                                ×
                            </button>
                        </div>

                        {/* Body */}
                        <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            {/* Summary row */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '10px' }}>
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Status</div>
                                    <div style={{ fontWeight: 600, color: '#f8fafc', marginTop: '0.25rem' }}>{selectedReturnForDetail.status}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Warehouse</div>
                                    <div style={{ fontWeight: 600, color: '#f8fafc', marginTop: '0.25rem' }}>{selectedReturnForDetail.warehouse_name}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Return Date</div>
                                    <div style={{ fontWeight: 600, color: '#f8fafc', marginTop: '0.25rem' }}>{selectedReturnForDetail.return_date}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Total Value</div>
                                    <div style={{ fontWeight: 700, color: '#f87171', marginTop: '0.25rem' }}>
                                        {selectedReturnForDetail.currency} {Number(selectedReturnForDetail.total_return_amount).toLocaleString()}
                                    </div>
                                </div>
                            </div>

                            {/* Lines Table */}
                            <div>
                                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', fontWeight: 600, color: '#f8fafc', textTransform: 'uppercase' }}>
                                    Returned Items ({selectedReturnForDetail.lines?.length || 0})
                                </h4>
                                <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', overflow: 'hidden' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                                        <thead>
                                            <tr style={{ background: 'rgba(0,0,0,0.3)', color: '#94a3b8', textTransform: 'uppercase', fontSize: '0.6875rem' }}>
                                                <th style={{ padding: '0.625rem 0.75rem', textAlign: 'left' }}>Item</th>
                                                <th style={{ padding: '0.625rem 0.75rem', textAlign: 'right' }}>Return Qty</th>
                                                <th style={{ padding: '0.625rem 0.75rem', textAlign: 'right' }}>Unit Cost</th>
                                                <th style={{ padding: '0.625rem 0.75rem', textAlign: 'right' }}>Line Total</th>
                                                <th style={{ padding: '0.625rem 0.75rem', textAlign: 'left' }}>Reason & Serials</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedReturnForDetail.lines?.map(l => (
                                                <tr key={l.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                                    <td style={{ padding: '0.625rem 0.75rem', color: '#f8fafc', fontWeight: 500 }}>
                                                        {l.item_name} <span style={{ color: '#64748b', fontSize: '0.75rem' }}>({l.item_sku})</span>
                                                    </td>
                                                    <td style={{ padding: '0.625rem 0.75rem', textAlign: 'right', fontWeight: 600, color: '#f87171' }}>
                                                        {l.return_quantity} {l.item_unit_of_measure}
                                                    </td>
                                                    <td style={{ padding: '0.625rem 0.75rem', textAlign: 'right', color: '#94a3b8' }}>
                                                        {Number(l.unit_cost).toLocaleString()}
                                                    </td>
                                                    <td style={{ padding: '0.625rem 0.75rem', textAlign: 'right', fontWeight: 600, color: '#f8fafc' }}>
                                                        {Number(l.total_amount).toLocaleString()}
                                                    </td>
                                                    <td style={{ padding: '0.625rem 0.75rem', color: '#94a3b8' }}>
                                                        <div>{l.reason}</div>
                                                        {l.serial_numbers && l.serial_numbers.length > 0 && (
                                                            <div style={{ fontSize: '0.6875rem', color: '#60a5fa', marginTop: '0.25rem' }}>
                                                                Serials: {l.serial_numbers.join(', ')}
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Audit / Notes */}
                            {selectedReturnForDetail.notes && (
                                <div style={{ fontSize: '0.8125rem', color: '#94a3b8', background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '6px' }}>
                                    <strong>Notes:</strong> {selectedReturnForDetail.notes}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--color-border, rgba(255, 255, 255, 0.1))', display: 'flex', justifyContent: 'flex-end' }}>
                            <Button variant="secondary" onClick={() => setSelectedReturnForDetail(null)}>
                                Close
                            </Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
};
