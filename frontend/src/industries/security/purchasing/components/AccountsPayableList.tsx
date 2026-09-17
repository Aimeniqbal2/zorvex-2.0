import React, { useState, useEffect } from 'react';
import { Button } from '../../../../components/ui/Button';
import { Card } from '../../../../components/ui/Card';
import { useToastStore } from '../../../../stores/toastStore';
import { useAuthStore } from '../../../../auth/authStore';
import {
    getAccountsPayableList,
    getVendors,
    getCompanyAPAging,
    getVendorReconciliations,
    resolveVendorReconciliation,
    type AccountsPayableItem,
    type Vendor,
    type CompanyAPAging,
    type VendorReconciliation
} from '../api';
import { VendorPaymentModal } from './VendorPaymentModal';
import { VendorInvoiceDetailModal } from './VendorInvoiceDetailModal';
import { VendorPaymentsTab } from './VendorPaymentsTab';

export const AccountsPayableList: React.FC = () => {
    const { user } = useAuthStore();
    const [payables, setPayables] = useState<AccountsPayableItem[]>([]);
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeSubTab, setActiveSubTab] = useState<'payables' | 'vouchers' | 'aging' | 'reconciliations'>('payables');

    // Aging State
    const [companyAging, setCompanyAging] = useState<CompanyAPAging | null>(null);
    const [agingLoading, setAgingLoading] = useState(false);

    // Reconciliations State
    const [reconciliations, setReconciliations] = useState<VendorReconciliation[]>([]);
    const [recLoading, setRecLoading] = useState(false);
    const [selectedRecForResolve, setSelectedRecForResolve] = useState<VendorReconciliation | null>(null);
    const [resolutionNotes, setResolutionNotes] = useState('');
    const [resolving, setResolving] = useState(false);

    // Filters
    const [search, setSearch] = useState('');
    const [vendorFilter, setVendorFilter] = useState('ALL');
    const [statusFilter, setStatusFilter] = useState('ALL');

    // Modals
    const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<AccountsPayableItem | null>(null);
    const [selectedInvoiceForDetail, setSelectedInvoiceForDetail] = useState<string | null>(null);
    const [showNewPaymentModal, setShowNewPaymentModal] = useState(false);

    const canManagePayments = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'finance' || user?.role === 'super_admin';

    useEffect(() => {
        loadVendors();
    }, []);

    useEffect(() => {
        if (activeSubTab === 'payables') {
            loadPayables();
        } else if (activeSubTab === 'aging') {
            loadCompanyAging();
        } else if (activeSubTab === 'reconciliations') {
            loadReconciliations();
        }
    }, [vendorFilter, statusFilter, activeSubTab]);

    const loadVendors = async () => {
        try {
            const vData = await getVendors();
            setVendors(vData);
        } catch (err) {
            console.error('Failed to load vendors:', err);
        }
    };

    const loadPayables = async () => {
        try {
            setLoading(true);
            const params: any = {};
            if (vendorFilter !== 'ALL') params.vendor = vendorFilter;
            if (statusFilter !== 'ALL') params.status = statusFilter;
            if (search.trim()) params.search = search.trim();

            const data = await getAccountsPayableList(params);
            setPayables(data);
        } catch (err) {
            console.error('Failed to load accounts payable:', err);
            useToastStore.getState().error('Failed to load accounts payable.');
        } finally {
            setLoading(false);
        }
    };

    const loadCompanyAging = async () => {
        try {
            setAgingLoading(true);
            const params: any = {};
            if (vendorFilter !== 'ALL') params.vendor = vendorFilter;
            const data = await getCompanyAPAging(params);
            setCompanyAging(data);
        } catch (err) {
            console.error('Failed to load AP aging:', err);
            useToastStore.getState().error('Failed to load AP aging report.');
        } finally {
            setAgingLoading(false);
        }
    };

    const loadReconciliations = async () => {
        try {
            setRecLoading(true);
            const params: any = {};
            if (vendorFilter !== 'ALL') params.vendor = vendorFilter;
            const data = await getVendorReconciliations(params);
            setReconciliations(data);
        } catch (err) {
            console.error('Failed to load reconciliations:', err);
            useToastStore.getState().error('Failed to load vendor reconciliations.');
        } finally {
            setRecLoading(false);
        }
    };

    const handleResolveVariance = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedRecForResolve || !resolutionNotes.trim()) return;
        try {
            setResolving(true);
            await resolveVendorReconciliation(selectedRecForResolve.id, resolutionNotes.trim());
            useToastStore.getState().success('Discrepancy marked as resolved.');
            setSelectedRecForResolve(null);
            setResolutionNotes('');
            loadReconciliations();
        } catch (err: any) {
            console.error('Failed to resolve variance:', err);
            useToastStore.getState().error(err?.response?.data?.detail || 'Failed to resolve variance.');
        } finally {
            setResolving(false);
        }
    };

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        loadPayables();
    };

    const getPaymentStatusBadge = (status: string, isOverdue: boolean) => {
        if (status === 'PAID') {
            return { label: 'PAID (Settled)', bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', border: 'rgba(16, 185, 129, 0.3)' };
        }
        if (status === 'PARTIALLY_PAID') {
            return {
                label: isOverdue ? 'PARTIALLY PAID (OVERDUE)' : 'PARTIALLY PAID',
                bg: isOverdue ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                text: isOverdue ? '#f87171' : '#fbbf24',
                border: isOverdue ? 'rgba(239, 68, 68, 0.3)' : 'rgba(245, 158, 11, 0.3)'
            };
        }
        if (status === 'OVERDUE' || isOverdue) {
            return { label: 'OVERDUE', bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171', border: 'rgba(239, 68, 68, 0.3)' };
        }
        return { label: 'UNPAID', bg: 'rgba(56, 189, 248, 0.15)', text: '#38bdf8', border: 'rgba(56, 189, 248, 0.3)' };
    };

    const filteredPayables = payables.filter(item => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
            item.invoice_number?.toLowerCase().includes(q) ||
            item.vendor_invoice_number?.toLowerCase().includes(q) ||
            item.vendor_name?.toLowerCase().includes(q) ||
            item.vendor_code?.toLowerCase().includes(q) ||
            item.parent_document_number?.toLowerCase().includes(q)
        );
    });

    // KPI Metrics
    const totalBilled = filteredPayables.reduce((sum, i) => sum + Number(i.total_amount || 0), 0);
    const totalPaid = filteredPayables.reduce((sum, i) => sum + Number(i.paid_amount || 0), 0);
    const totalOutstanding = filteredPayables.reduce((sum, i) => sum + Number(i.outstanding_amount || 0), 0);
    const totalOverdue = filteredPayables
        .filter(i => i.is_overdue && Number(i.outstanding_amount) > 0)
        .reduce((sum, i) => sum + Number(i.outstanding_amount || 0), 0);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px'
            }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text, #f8fafc)' }}>
                        Accounts Payable & Vendor Disbursements
                    </h2>
                    <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--color-text-muted, #94a3b8)' }}>
                        Monitor open liabilities, partial settlements, due dates, and record multi-invoice payment vouchers.
                    </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {/* Sub-tab Switcher */}
                    <div style={{
                        display: 'flex',
                        background: 'var(--color-surface-secondary, #0f172a)',
                        padding: '3px',
                        borderRadius: '8px',
                        border: '1px solid var(--color-border, #334155)'
                    }}>
                        <button
                            type="button"
                            onClick={() => setActiveSubTab('payables')}
                            style={{
                                padding: '6px 14px',
                                borderRadius: '6px',
                                background: activeSubTab === 'payables' ? 'var(--color-primary, #6366f1)' : 'transparent',
                                color: activeSubTab === 'payables' ? '#fff' : 'var(--color-text-muted)',
                                border: 'none',
                                fontWeight: activeSubTab === 'payables' ? 700 : 500,
                                fontSize: '12px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                        >
                            <i className='bx bx-receipt'></i> Open Payables ({payables.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveSubTab('vouchers')}
                            style={{
                                padding: '6px 14px',
                                borderRadius: '6px',
                                background: activeSubTab === 'vouchers' ? 'var(--color-primary, #6366f1)' : 'transparent',
                                color: activeSubTab === 'vouchers' ? '#fff' : 'var(--color-text-muted)',
                                border: 'none',
                                fontWeight: activeSubTab === 'vouchers' ? 700 : 500,
                                fontSize: '12px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                        >
                            <i className='bx bx-credit-card'></i> Payment Vouchers
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveSubTab('aging')}
                            style={{
                                padding: '6px 14px',
                                borderRadius: '6px',
                                background: activeSubTab === 'aging' ? 'var(--color-primary, #6366f1)' : 'transparent',
                                color: activeSubTab === 'aging' ? '#fff' : 'var(--color-text-muted)',
                                border: 'none',
                                fontWeight: activeSubTab === 'aging' ? 700 : 500,
                                fontSize: '12px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                        >
                            <i className='bx bx-time-five'></i> AP Aging Matrix
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveSubTab('reconciliations')}
                            style={{
                                padding: '6px 14px',
                                borderRadius: '6px',
                                background: activeSubTab === 'reconciliations' ? 'var(--color-primary, #6366f1)' : 'transparent',
                                color: activeSubTab === 'reconciliations' ? '#fff' : 'var(--color-text-muted)',
                                border: 'none',
                                fontWeight: activeSubTab === 'reconciliations' ? 700 : 500,
                                fontSize: '12px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                        >
                            <i className='bx bx-check-shield'></i> Balance Reconciliations
                        </button>
                    </div>

                    {canManagePayments && (
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => setShowNewPaymentModal(true)}
                        >
                            <i className='bx bx-plus-circle'></i> Record Payment
                        </Button>
                    )}
                </div>
            </div>

            {/* Sub-tab 1: Open Payables */}
            {activeSubTab === 'payables' && (
                <>
                    {/* KPI Metrics */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                        <Card style={{ padding: '16px 20px', borderRadius: '10px', background: 'var(--color-surface, #1e293b)' }}>
                            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                                Total Billed Liabilities
                            </div>
                            <div style={{ fontSize: '20px', fontWeight: 800, color: '#f8fafc', marginTop: '4px' }}>
                                PKR {totalBilled.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </div>
                        </Card>

                        <Card style={{ padding: '16px 20px', borderRadius: '10px', background: 'var(--color-surface, #1e293b)' }}>
                            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                                Total Paid Settlements
                            </div>
                            <div style={{ fontSize: '20px', fontWeight: 800, color: '#34d399', marginTop: '4px' }}>
                                PKR {totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </div>
                        </Card>

                        <Card style={{ padding: '16px 20px', borderRadius: '10px', background: 'var(--color-surface, #1e293b)' }}>
                            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                                Outstanding Payables
                            </div>
                            <div style={{ fontSize: '20px', fontWeight: 800, color: '#f59e0b', marginTop: '4px' }}>
                                PKR {totalOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </div>
                        </Card>

                        <Card style={{ padding: '16px 20px', borderRadius: '10px', background: 'var(--color-surface, #1e293b)' }}>
                            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                                Overdue Payables
                            </div>
                            <div style={{ fontSize: '20px', fontWeight: 800, color: '#f87171', marginTop: '4px' }}>
                                PKR {totalOverdue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </div>
                        </Card>
                    </div>

                    {/* Filter & Search Bar */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '12px',
                        flexWrap: 'wrap'
                    }}>
                        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '8px' }}>
                            <input
                                type="text"
                                placeholder="Search bill #, vendor, PO #..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    background: 'var(--color-surface, #1e293b)',
                                    border: '1px solid var(--color-border, #334155)',
                                    color: '#f8fafc',
                                    fontSize: '13px',
                                    width: '240px'
                                }}
                            />
                            <Button variant="secondary" size="sm" type="submit">
                                <i className='bx bx-search'></i>
                            </Button>
                        </form>

                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            {/* Vendor filter */}
                            <select
                                value={vendorFilter}
                                onChange={(e) => setVendorFilter(e.target.value)}
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    background: 'var(--color-surface, #1e293b)',
                                    border: '1px solid var(--color-border, #334155)',
                                    color: '#f8fafc',
                                    fontSize: '13px'
                                }}
                            >
                                <option value="ALL">All Vendors</option>
                                {vendors.map(v => (
                                    <option key={v.id} value={v.id}>{v.name}</option>
                                ))}
                            </select>

                            {/* Status filter */}
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    background: 'var(--color-surface, #1e293b)',
                                    border: '1px solid var(--color-border, #334155)',
                                    color: '#f8fafc',
                                    fontSize: '13px'
                                }}
                            >
                                <option value="ALL">All Payment Statuses</option>
                                <option value="UNPAID">UNPAID</option>
                                <option value="PARTIALLY_PAID">PARTIALLY PAID</option>
                                <option value="OVERDUE">OVERDUE</option>
                                <option value="PAID">PAID (Settled)</option>
                            </select>
                        </div>
                    </div>

                    {/* Payables Table */}
                    <Card style={{ padding: 0, borderRadius: '12px', overflow: 'hidden' }}>
                        {loading ? (
                            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                                <i className='bx bx-loader-alt bx-spin' style={{ fontSize: '28px', marginBottom: '8px' }}></i>
                                <div>Loading open accounts payable...</div>
                            </div>
                        ) : filteredPayables.length === 0 ? (
                            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                                <i className='bx bx-check-circle' style={{ fontSize: '36px', marginBottom: '8px', color: '#10b981' }}></i>
                                <h4 style={{ margin: '0 0 4px 0', fontSize: '14px' }}>No Payable Bills Found</h4>
                                <p style={{ margin: 0, fontSize: '12px' }}>
                                    {search || statusFilter !== 'ALL' || vendorFilter !== 'ALL'
                                        ? 'No open bills match your active filter criteria.'
                                        : 'All posted vendor bills have been fully settled.'}
                                </p>
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                                    <thead>
                                        <tr style={{ background: 'var(--color-surface-secondary, #0f172a)', borderBottom: '1px solid var(--color-border, #334155)', color: 'var(--color-text-muted)' }}>
                                            <th style={{ padding: '12px 16px' }}>Vendor</th>
                                            <th style={{ padding: '12px 16px' }}>Bill #</th>
                                            <th style={{ padding: '12px 16px' }}>Vendor Inv #</th>
                                            <th style={{ padding: '12px 16px' }}>PO #</th>
                                            <th style={{ padding: '12px 16px' }}>Due Date</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'right' }}>Bill Total</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'right' }}>Paid Amount</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'right' }}>Outstanding</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'center' }}>Status</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredPayables.map(inv => {
                                            const statusBadge = getPaymentStatusBadge(inv.payment_status, inv.is_overdue);
                                            const outstanding = Number(inv.outstanding_amount || 0);

                                            return (
                                                <tr
                                                    key={inv.invoice_id}
                                                    style={{
                                                        borderBottom: '1px solid var(--color-border, #334155)',
                                                        background: inv.is_overdue && outstanding > 0 ? 'rgba(239, 68, 68, 0.03)' : 'transparent',
                                                        transition: 'background 0.15s'
                                                    }}
                                                >
                                                    <td style={{ padding: '12px 16px', color: '#f8fafc' }}>
                                                        <div style={{ fontWeight: 600 }}>{inv.vendor_name}</div>
                                                        {inv.vendor_code && (
                                                            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{inv.vendor_code}</div>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--color-primary, #6366f1)' }}>
                                                        {inv.invoice_number}
                                                    </td>
                                                    <td style={{ padding: '12px 16px', color: '#f8fafc' }}>
                                                        {inv.vendor_invoice_number}
                                                    </td>
                                                    <td style={{ padding: '12px 16px', color: 'var(--color-text-muted)' }}>
                                                        {inv.parent_document_number || 'N/A'}
                                                    </td>
                                                    <td style={{ padding: '12px 16px' }}>
                                                        {inv.due_date ? (
                                                            <span style={{ color: inv.is_overdue && outstanding > 0 ? '#f87171' : 'var(--color-text-muted)', fontWeight: inv.is_overdue && outstanding > 0 ? 700 : 400 }}>
                                                                {new Date(inv.due_date).toLocaleDateString()}
                                                                {inv.is_overdue && outstanding > 0 && (
                                                                    <span style={{ fontSize: '10px', marginLeft: '4px', padding: '1px 4px', background: 'rgba(239, 68, 68, 0.2)', borderRadius: '4px' }}>
                                                                        OVERDUE
                                                                    </span>
                                                                )}
                                                            </span>
                                                        ) : (
                                                            <span style={{ color: 'var(--color-text-muted)' }}>N/A</span>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                                        {inv.currency} {Number(inv.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </td>
                                                    <td style={{ padding: '12px 16px', textAlign: 'right', color: '#94a3b8' }}>
                                                        {inv.currency} {Number(inv.paid_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </td>
                                                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: outstanding > 0 ? '#f59e0b' : '#34d399' }}>
                                                        {inv.currency} {outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
                                                            {/* View Bill Detail */}
                                                            <button
                                                                type="button"
                                                                onClick={() => setSelectedInvoiceForDetail(inv.invoice_id)}
                                                                title="View Bill Details"
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

                                                            {/* Record Payment Button */}
                                                            {canManagePayments && outstanding > 0 && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setSelectedInvoiceForPayment(inv)}
                                                                    title="Record Payment for this Bill"
                                                                    style={{
                                                                        padding: '4px 10px',
                                                                        borderRadius: '6px',
                                                                        background: 'rgba(16, 185, 129, 0.15)',
                                                                        border: '1px solid rgba(16, 185, 129, 0.3)',
                                                                        color: '#10b981',
                                                                        fontSize: '12px',
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
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Card>
                </>
            )}

            {/* Sub-tab 2: Payment Vouchers */}
            {activeSubTab === 'vouchers' && (
                <VendorPaymentsTab />
            )}

            {/* Sub-tab 3: Company-Wide AP Aging Matrix */}
            {activeSubTab === 'aging' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {/* Summary KPI Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1rem' }}>
                        <Card style={{ padding: '1.25rem', backgroundColor: 'var(--color-surface, #1e293b)' }}>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Total AP Outstanding</div>
                            <div style={{ fontSize: '1.375rem', fontWeight: 700, color: '#fbbf24', marginTop: '0.25rem' }}>
                                PKR {Number(companyAging?.summary.total_outstanding || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </div>
                        </Card>
                        <Card style={{ padding: '1.25rem', backgroundColor: 'var(--color-surface, #1e293b)' }}>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Current (Not Due)</div>
                            <div style={{ fontSize: '1.375rem', fontWeight: 700, color: '#60a5fa', marginTop: '0.25rem' }}>
                                PKR {Number(companyAging?.summary.current || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </div>
                        </Card>
                        <Card style={{ padding: '1.25rem', backgroundColor: 'var(--color-surface, #1e293b)' }}>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>1–30 Days Overdue</div>
                            <div style={{ fontSize: '1.375rem', fontWeight: 700, color: '#fbbf24', marginTop: '0.25rem' }}>
                                PKR {Number(companyAging?.summary.days_1_30 || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </div>
                        </Card>
                        <Card style={{ padding: '1.25rem', backgroundColor: 'var(--color-surface, #1e293b)' }}>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>31–60 Days Overdue</div>
                            <div style={{ fontSize: '1.375rem', fontWeight: 700, color: '#fb923c', marginTop: '0.25rem' }}>
                                PKR {Number(companyAging?.summary.days_31_60 || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </div>
                        </Card>
                        <Card style={{ padding: '1.25rem', backgroundColor: 'var(--color-surface, #1e293b)' }}>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>61–90 Days Overdue</div>
                            <div style={{ fontSize: '1.375rem', fontWeight: 700, color: '#f87171', marginTop: '0.25rem' }}>
                                PKR {Number(companyAging?.summary.days_61_90 || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </div>
                        </Card>
                        <Card style={{ padding: '1.25rem', backgroundColor: 'var(--color-surface, #1e293b)' }}>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>90+ Days Critical</div>
                            <div style={{ fontSize: '1.375rem', fontWeight: 700, color: '#ef4444', marginTop: '0.25rem' }}>
                                PKR {Number(companyAging?.summary.days_over_90 || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </div>
                        </Card>
                    </div>

                    {/* Vendors Aging Table */}
                    <Card style={{
                        backgroundColor: 'var(--color-surface, #1e293b)',
                        border: '1px solid var(--color-border, rgba(255, 255, 255, 0.1))',
                        borderRadius: '12px',
                        overflow: 'hidden'
                    }}>
                        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-border, rgba(255, 255, 255, 0.1))', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h4 style={{ margin: 0, fontSize: '0.9375rem', color: '#f8fafc' }}>
                                Vendor Aging Summary (As of {companyAging?.as_of_date || new Date().toISOString().split('T')[0]})
                            </h4>
                            <span style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>
                                {companyAging?.summary.vendors_count || 0} Vendors with Active Balances
                            </span>
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                            <thead>
                                <tr style={{
                                    backgroundColor: 'rgba(0,0,0,0.25)',
                                    borderBottom: '1px solid var(--color-border, rgba(255, 255, 255, 0.1))',
                                    color: 'var(--color-text-muted, #94a3b8)',
                                    fontSize: '0.75rem',
                                    textTransform: 'uppercase'
                                }}>
                                    <th style={{ padding: '0.875rem 1rem' }}>Vendor</th>
                                    <th style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>Current</th>
                                    <th style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>1–30 Days</th>
                                    <th style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>31–60 Days</th>
                                    <th style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>61–90 Days</th>
                                    <th style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>90+ Days</th>
                                    <th style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>Total Outstanding</th>
                                </tr>
                            </thead>
                            <tbody>
                                {agingLoading ? (
                                    <tr>
                                        <td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                                            Calculating company-wide AP aging...
                                        </td>
                                    </tr>
                                ) : !companyAging || companyAging.vendors.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                                            No outstanding payables found across vendors.
                                        </td>
                                    </tr>
                                ) : (
                                    companyAging.vendors.map((v) => (
                                        <tr
                                            key={v.vendor_id}
                                            style={{
                                                borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                                                transition: 'background-color 0.15s ease'
                                            }}
                                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)')}
                                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                                        >
                                            <td style={{ padding: '0.875rem 1rem', fontWeight: 600, color: '#f8fafc' }}>
                                                {v.vendor_name} ({v.vendor_code})
                                            </td>
                                            <td style={{ padding: '0.875rem 1rem', textAlign: 'right', color: '#60a5fa' }}>
                                                {Number(v.current) > 0 ? Number(v.current).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                                            </td>
                                            <td style={{ padding: '0.875rem 1rem', textAlign: 'right', color: '#fbbf24' }}>
                                                {Number(v.days_1_30) > 0 ? Number(v.days_1_30).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                                            </td>
                                            <td style={{ padding: '0.875rem 1rem', textAlign: 'right', color: '#fb923c' }}>
                                                {Number(v.days_31_60) > 0 ? Number(v.days_31_60).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                                            </td>
                                            <td style={{ padding: '0.875rem 1rem', textAlign: 'right', color: '#f87171' }}>
                                                {Number(v.days_61_90) > 0 ? Number(v.days_61_90).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                                            </td>
                                            <td style={{ padding: '0.875rem 1rem', textAlign: 'right', color: '#ef4444', fontWeight: 600 }}>
                                                {Number(v.days_over_90) > 0 ? Number(v.days_over_90).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                                            </td>
                                            <td style={{ padding: '0.875rem 1rem', textAlign: 'right', fontWeight: 700, color: '#f8fafc' }}>
                                                {v.currency} {Number(v.total_outstanding).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </Card>
                </div>
            )}

            {/* Sub-tab 4: Statement Reconciliations */}
            {activeSubTab === 'reconciliations' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <Card style={{
                        backgroundColor: 'var(--color-surface, #1e293b)',
                        border: '1px solid var(--color-border, rgba(255, 255, 255, 0.1))',
                        borderRadius: '12px',
                        overflow: 'hidden'
                    }}>
                        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-border, rgba(255, 255, 255, 0.1))', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h4 style={{ margin: '0 0 2px 0', fontSize: '0.9375rem', color: '#f8fafc' }}>
                                    Company-Wide Vendor Statement Reconciliations
                                </h4>
                                <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8' }}>
                                    Audit history of vendor statement balances, detected variances, and investigation resolution notes.
                                </p>
                            </div>
                        </div>

                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                            <thead>
                                <tr style={{
                                    backgroundColor: 'rgba(0,0,0,0.25)',
                                    borderBottom: '1px solid var(--color-border, rgba(255, 255, 255, 0.1))',
                                    color: 'var(--color-text-muted, #94a3b8)',
                                    fontSize: '0.75rem',
                                    textTransform: 'uppercase'
                                }}>
                                    <th style={{ padding: '0.875rem 1rem' }}>Rec #</th>
                                    <th style={{ padding: '0.875rem 1rem' }}>Vendor</th>
                                    <th style={{ padding: '0.875rem 1rem' }}>Statement Date</th>
                                    <th style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>Vendor Reported</th>
                                    <th style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>System Balance</th>
                                    <th style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>Variance</th>
                                    <th style={{ padding: '0.875rem 1rem' }}>Status</th>
                                    <th style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recLoading ? (
                                    <tr>
                                        <td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                                            Loading statement reconciliations...
                                        </td>
                                    </tr>
                                ) : reconciliations.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                                            No vendor statement reconciliations recorded.
                                        </td>
                                    </tr>
                                ) : (
                                    reconciliations.map((rec) => (
                                        <tr
                                            key={rec.id}
                                            style={{
                                                borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                                                transition: 'background-color 0.15s ease'
                                            }}
                                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)')}
                                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                                        >
                                            <td style={{ padding: '0.875rem 1rem', fontWeight: 600, color: '#f8fafc' }}>
                                                {rec.reconciliation_number}
                                            </td>
                                            <td style={{ padding: '0.875rem 1rem', color: '#cbd5e1' }}>
                                                {rec.vendor_name} ({rec.vendor_code})
                                            </td>
                                            <td style={{ padding: '0.875rem 1rem', color: '#cbd5e1' }}>
                                                {rec.statement_date}
                                            </td>
                                            <td style={{ padding: '0.875rem 1rem', textAlign: 'right', color: '#cbd5e1' }}>
                                                {rec.currency} {Number(rec.vendor_reported_balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                            <td style={{ padding: '0.875rem 1rem', textAlign: 'right', color: '#60a5fa', fontWeight: 600 }}>
                                                {rec.currency} {Number(rec.system_balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                            <td style={{ padding: '0.875rem 1rem', textAlign: 'right', fontWeight: 700, color: Number(rec.variance) !== 0 ? '#ef4444' : '#34d399' }}>
                                                {rec.currency} {Number(rec.variance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                            <td style={{ padding: '0.875rem 1rem' }}>
                                                <span style={{
                                                    padding: '0.25rem 0.5rem',
                                                    borderRadius: '4px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 600,
                                                    backgroundColor: rec.status === 'MATCHED' ? 'rgba(16, 185, 129, 0.15)' : rec.status === 'VARIANCE' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                                                    color: rec.status === 'MATCHED' ? '#34d399' : rec.status === 'VARIANCE' ? '#f87171' : '#60a5fa',
                                                    border: `1px solid ${rec.status === 'MATCHED' ? 'rgba(16, 185, 129, 0.3)' : rec.status === 'VARIANCE' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`
                                                }}>
                                                    {rec.status_display || rec.status}
                                                </span>
                                            </td>
                                            <td style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>
                                                {rec.status === 'VARIANCE' && canManagePayments && (
                                                    <Button
                                                        variant="secondary"
                                                        size="sm"
                                                        onClick={() => setSelectedRecForResolve(rec)}
                                                        style={{ fontSize: '0.75rem', color: '#60a5fa', borderColor: '#3b82f6' }}
                                                    >
                                                        Resolve
                                                    </Button>
                                                )}
                                                {rec.status === 'RESOLVED' && (
                                                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Resolved</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </Card>
                </div>
            )}

            {/* Resolve Variance Modal */}
            {selectedRecForResolve && (
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
                    backdropFilter: 'blur(4px)'
                }}>
                    <Card style={{
                        width: '540px',
                        backgroundColor: 'var(--color-surface, #1e293b)',
                        border: '1px solid var(--color-border, rgba(255, 255, 255, 0.1))',
                        borderRadius: '12px',
                        overflow: 'hidden'
                    }}>
                        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--color-border, rgba(255, 255, 255, 0.1))', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: '1.125rem', color: '#f8fafc' }}>
                                Resolve Variance Discrepancy ({selectedRecForResolve.reconciliation_number})
                            </h3>
                            <button onClick={() => setSelectedRecForResolve(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.25rem', cursor: 'pointer' }}>
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleResolveVariance} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '0.875rem', borderRadius: '8px', fontSize: '0.8125rem', color: '#fca5a5' }}>
                                <strong>Vendor:</strong> {selectedRecForResolve.vendor_name} ({selectedRecForResolve.vendor_code})<br />
                                <strong>Variance:</strong> {selectedRecForResolve.currency} {Number(selectedRecForResolve.variance).toLocaleString()} (System: {Number(selectedRecForResolve.system_balance).toLocaleString()} vs Reported: {Number(selectedRecForResolve.vendor_reported_balance).toLocaleString()})
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.375rem' }}>
                                    Investigation Resolution Notes *
                                </label>
                                <textarea
                                    required
                                    rows={4}
                                    placeholder="Document explanation for variance (e.g. transit timing difference, pending debit note, invoice in next period)..."
                                    value={resolutionNotes}
                                    onChange={(e) => setResolutionNotes(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.625rem',
                                        borderRadius: '6px',
                                        backgroundColor: 'rgba(0, 0, 0, 0.3)',
                                        border: '1px solid var(--color-border, rgba(255, 255, 255, 0.1))',
                                        color: '#fff',
                                        fontSize: '0.875rem'
                                    }}
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                                <Button type="button" variant="secondary" onClick={() => setSelectedRecForResolve(null)}>
                                    Cancel
                                </Button>
                                <Button type="submit" variant="primary" disabled={resolving}>
                                    {resolving ? 'Resolving...' : 'Confirm Resolution'}
                                </Button>
                            </div>
                        </form>
                    </Card>
                </div>
            )}

            {/* Record Payment Modal */}
            {(showNewPaymentModal || selectedInvoiceForPayment) && (
                <VendorPaymentModal
                    isOpen={Boolean(showNewPaymentModal || selectedInvoiceForPayment)}
                    onClose={() => {
                        setShowNewPaymentModal(false);
                        setSelectedInvoiceForPayment(null);
                    }}
                    onPaymentCreated={loadPayables}
                    defaultVendorId={selectedInvoiceForPayment?.vendor_id || undefined}
                    defaultInvoiceId={selectedInvoiceForPayment?.invoice_id || undefined}
                />
            )}

            {/* Bill Detail Modal */}
            {selectedInvoiceForDetail && (
                <VendorInvoiceDetailModal
                    isOpen={Boolean(selectedInvoiceForDetail)}
                    onClose={() => setSelectedInvoiceForDetail(null)}
                    invoiceId={selectedInvoiceForDetail}
                    onInvoiceUpdated={loadPayables}
                />
            )}
        </div>
    );
};
