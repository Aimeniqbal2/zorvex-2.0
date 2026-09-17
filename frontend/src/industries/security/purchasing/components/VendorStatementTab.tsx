import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../../../../components/ui/Button';
import { Card } from '../../../../components/ui/Card';
import { useToastStore } from '../../../../stores/toastStore';
import { useAuthStore } from '../../../../auth/authStore';
import {
    getVendorStatement,
    getVendorAging,
    getVendorReconciliations,
    createVendorReconciliation,
    resolveVendorReconciliation,
    type VendorStatement,
    type VendorAging,
    type VendorReconciliation
} from '../api';

interface VendorStatementTabProps {
    vendorId: string;
    vendorName?: string;
}

export const VendorStatementTab: React.FC<VendorStatementTabProps> = ({
    vendorId,
    vendorName
}) => {
    const { user } = useAuthStore();
    const isFinanceOrAdmin = user?.role === 'admin' || user?.role === 'finance' || (user as any)?.is_superuser;

    const [activeSection, setActiveSection] = useState<'statement' | 'aging' | 'reconciliation'>('statement');
    const [loading, setLoading] = useState<boolean>(true);

    // Statement State
    const [statement, setStatement] = useState<VendorStatement | null>(null);
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');

    // Aging State
    const [aging, setAging] = useState<VendorAging | null>(null);
    const [selectedBucketFilter, setSelectedBucketFilter] = useState<string>('ALL');

    // Reconciliation State
    const [reconciliations, setReconciliations] = useState<VendorReconciliation[]>([]);
    const [showReconcileModal, setShowReconcileModal] = useState<boolean>(false);
    const [vendorReportedBalance, setVendorReportedBalance] = useState<string>('');
    const [statementDate, setStatementDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [asOfDate, setAsOfDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [recNotes, setRecNotes] = useState<string>('');
    const [submittingRec, setSubmittingRec] = useState<boolean>(false);

    // Resolve Modal State
    const [selectedRecForResolve, setSelectedRecForResolve] = useState<VendorReconciliation | null>(null);
    const [resolutionNotes, setResolutionNotes] = useState<string>('');
    const [submittingResolve, setSubmittingResolve] = useState<boolean>(false);

    const loadStatementData = useCallback(async () => {
        try {
            setLoading(true);
            const [stmtData, agingData, recData] = await Promise.all([
                getVendorStatement(vendorId, {
                    start_date: startDate || undefined,
                    end_date: endDate || undefined
                }),
                getVendorAging(vendorId),
                getVendorReconciliations({ vendor: vendorId })
            ]);
            setStatement(stmtData);
            setAging(agingData);
            setReconciliations(recData);
        } catch (err: any) {
            console.error('Failed to load vendor statement data:', err);
            useToastStore.getState().error(err?.response?.data?.detail || 'Failed to load vendor statement.');
        } finally {
            setLoading(false);
        }
    }, [vendorId, startDate, endDate]);

    useEffect(() => {
        if (vendorId) {
            loadStatementData();
        }
    }, [vendorId, loadStatementData]);

    const handleCreateReconciliation = async (e: React.FormEvent) => {
        e.preventDefault();
        if (vendorReportedBalance === '') {
            useToastStore.getState().error('Please enter the vendor reported balance.');
            return;
        }

        try {
            setSubmittingRec(true);
            const newRec = await createVendorReconciliation({
                vendor: vendorId,
                statement_date: statementDate,
                as_of_date: asOfDate,
                vendor_reported_balance: parseFloat(vendorReportedBalance) || 0,
                notes: recNotes
            });

            useToastStore.getState().success(
                newRec.status === 'MATCHED'
                    ? 'Reconciliation created: Zero variance detected (MATCHED).'
                    : `Reconciliation created: Variance of ${newRec.currency} ${Number(newRec.variance).toLocaleString()} detected.`
            );
            setShowReconcileModal(false);
            setVendorReportedBalance('');
            setRecNotes('');
            loadStatementData();
        } catch (err: any) {
            console.error('Failed to create reconciliation:', err);
            useToastStore.getState().error(err?.response?.data?.detail || 'Failed to create reconciliation.');
        } finally {
            setSubmittingRec(false);
        }
    };

    const handleResolveReconciliation = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedRecForResolve) return;
        if (!resolutionNotes.trim()) {
            useToastStore.getState().error('Resolution investigation notes are required.');
            return;
        }

        try {
            setSubmittingResolve(true);
            await resolveVendorReconciliation(selectedRecForResolve.id, resolutionNotes.trim());
            useToastStore.getState().success('Reconciliation discrepancy resolved successfully.');
            setSelectedRecForResolve(null);
            setResolutionNotes('');
            loadStatementData();
        } catch (err: any) {
            console.error('Failed to resolve reconciliation:', err);
            useToastStore.getState().error(err?.response?.data?.detail || 'Failed to resolve reconciliation.');
        } finally {
            setSubmittingResolve(false);
        }
    };

    const handleExportCSV = () => {
        if (!statement || !statement.transactions.length) {
            useToastStore.getState().error('No transaction records available to export.');
            return;
        }

        const headers = ['Date', 'Type', 'Reference', 'Vendor Ref', 'PO Ref', 'Description', 'Debit', 'Credit', 'Running Balance', 'Status'];
        const rows = statement.transactions.map(t => [
            t.date,
            t.type_display,
            t.reference,
            t.vendor_reference,
            t.parent_reference,
            `"${(t.description || '').replace(/"/g, '""')}"`,
            t.debit,
            t.credit,
            t.running_balance,
            t.status
        ]);

        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `Statement_${vendorName || 'Vendor'}_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const getTxTypeBadge = (type: string) => {
        switch (type) {
            case 'INVOICE':
                return { label: 'Vendor Bill', bg: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: 'rgba(59, 130, 246, 0.3)' };
            case 'PAYMENT':
                return { label: 'Payment Voucher', bg: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: 'rgba(16, 185, 129, 0.3)' };
            case 'PAYMENT_REVERSAL':
                return { label: 'Payment Reversal', bg: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: 'rgba(239, 68, 68, 0.3)' };
            case 'CREDIT_NOTE':
                return { label: 'Credit Note', bg: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', border: 'rgba(168, 85, 247, 0.3)' };
            default:
                return { label: type, bg: 'rgba(255, 255, 255, 0.05)', color: '#94a3b8', border: 'rgba(255, 255, 255, 0.1)' };
        }
    };

    const getRecStatusBadge = (st: string) => {
        switch (st) {
            case 'MATCHED':
                return { label: 'Matched (Zero Variance)', bg: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: 'rgba(16, 185, 129, 0.3)' };
            case 'VARIANCE':
                return { label: 'Variance Detected', bg: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: 'rgba(239, 68, 68, 0.3)' };
            case 'RESOLVED':
                return { label: 'Resolved', bg: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: 'rgba(59, 130, 246, 0.3)' };
            default:
                return { label: 'Pending Review', bg: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: 'rgba(245, 158, 11, 0.3)' };
        }
    };

    const filteredAgingInvoices = aging?.invoices.filter(inv => {
        if (selectedBucketFilter === 'ALL') return true;
        return inv.bucket === selectedBucketFilter;
    }) || [];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Top KPI Metrics Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                <Card style={{ padding: '1.25rem', backgroundColor: 'var(--color-surface, #1e293b)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #94a3b8)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                        Total Invoiced (Purchases)
                    </div>
                    <div style={{ fontSize: '1.375rem', fontWeight: 700, color: '#60a5fa' }}>
                        {statement?.currency || 'PKR'} {Number(statement?.total_purchases || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                </Card>

                <Card style={{ padding: '1.25rem', backgroundColor: 'var(--color-surface, #1e293b)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #94a3b8)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                        Total Paid (Settled)
                    </div>
                    <div style={{ fontSize: '1.375rem', fontWeight: 700, color: '#34d399' }}>
                        {statement?.currency || 'PKR'} {Number(statement?.total_payments || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                </Card>

                <Card style={{ padding: '1.25rem', backgroundColor: 'var(--color-surface, #1e293b)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #94a3b8)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                        Returns & Credit Notes
                    </div>
                    <div style={{ fontSize: '1.375rem', fontWeight: 700, color: '#c084fc' }}>
                        {statement?.currency || 'PKR'} {Number(statement?.total_credit_notes || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                </Card>

                <Card style={{ padding: '1.25rem', backgroundColor: 'var(--color-surface, #1e293b)', borderLeft: '4px solid #f59e0b' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #94a3b8)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                        Outstanding Payable
                    </div>
                    <div style={{
                        fontSize: '1.375rem',
                        fontWeight: 700,
                        color: Number(statement?.outstanding_payable || 0) > 0 ? '#fbbf24' : '#34d399'
                    }}>
                        {statement?.currency || 'PKR'} {Number(statement?.outstanding_payable || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                </Card>

                <Card style={{ padding: '1.25rem', backgroundColor: 'var(--color-surface, #1e293b)', borderLeft: '4px solid #38bdf8' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #94a3b8)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                        Unallocated Credit
                    </div>
                    <div style={{ fontSize: '1.375rem', fontWeight: 700, color: '#38bdf8' }}>
                        {statement?.currency || 'PKR'} {Number(statement?.unallocated_credit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                </Card>
            </div>

            {/* Navigation & Section Tabs */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border, rgba(255, 255, 255, 0.1))', paddingBottom: '0.75rem' }}>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <Button
                        variant={activeSection === 'statement' ? 'primary' : 'ghost'}
                        onClick={() => setActiveSection('statement')}
                    >
                        📜 Chronological Statement ({statement?.transactions_count || 0})
                    </Button>
                    <Button
                        variant={activeSection === 'aging' ? 'primary' : 'ghost'}
                        onClick={() => setActiveSection('aging')}
                    >
                        ⏱️ AP Aging Breakdown ({aging?.open_invoices_count || 0} Open Bills)
                    </Button>
                    <Button
                        variant={activeSection === 'reconciliation' ? 'primary' : 'ghost'}
                        onClick={() => setActiveSection('reconciliation')}
                    >
                        ⚖️ Balance Reconciliation ({reconciliations.length})
                    </Button>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    {activeSection === 'statement' && (
                        <Button variant="secondary" onClick={handleExportCSV}>
                            📥 Export Statement CSV
                        </Button>
                    )}
                    {isFinanceOrAdmin && (
                        <Button variant="primary" onClick={() => setShowReconcileModal(true)}>
                            ➕ New Statement Reconciliation
                        </Button>
                    )}
                </div>
            </div>

            {/* Section 1: Chronological Statement */}
            {activeSection === 'statement' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* Date Filters Bar */}
                    <Card style={{ padding: '0.875rem 1.25rem', backgroundColor: 'var(--color-surface, #1e293b)', display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-muted, #94a3b8)' }}>Filter Period:</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <label style={{ fontSize: '0.75rem', color: '#94a3b8' }}>From:</label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                style={{
                                    padding: '0.375rem 0.5rem',
                                    borderRadius: '6px',
                                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                                    border: '1px solid var(--color-border, rgba(255, 255, 255, 0.1))',
                                    color: '#fff',
                                    fontSize: '0.8125rem'
                                }}
                            />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <label style={{ fontSize: '0.75rem', color: '#94a3b8' }}>To:</label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                style={{
                                    padding: '0.375rem 0.5rem',
                                    borderRadius: '6px',
                                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                                    border: '1px solid var(--color-border, rgba(255, 255, 255, 0.1))',
                                    color: '#fff',
                                    fontSize: '0.8125rem'
                                }}
                            />
                        </div>
                        {(startDate || endDate) && (
                            <Button variant="ghost" size="sm" onClick={() => { setStartDate(''); setEndDate(''); }}>
                                Clear Dates
                            </Button>
                        )}
                        <span style={{ marginLeft: 'auto', fontSize: '0.8125rem', color: '#94a3b8' }}>
                            Opening Balance: <strong style={{ color: '#fff' }}>{statement?.currency} {Number(statement?.opening_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                        </span>
                    </Card>

                    {/* Statement Table */}
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
                                    <th style={{ padding: '0.875rem 1rem' }}>Date</th>
                                    <th style={{ padding: '0.875rem 1rem' }}>Type</th>
                                    <th style={{ padding: '0.875rem 1rem' }}>Reference</th>
                                    <th style={{ padding: '0.875rem 1rem' }}>Description</th>
                                    <th style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>Debit (Billed)</th>
                                    <th style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>Credit (Paid / Ret)</th>
                                    <th style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>Running Balance</th>
                                    <th style={{ padding: '0.875rem 1rem' }}>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                                            Calculating statement transactions...
                                        </td>
                                    </tr>
                                ) : !statement || statement.transactions.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                                            No financial transactions found for this vendor.
                                        </td>
                                    </tr>
                                ) : (
                                    statement.transactions.map((tx, idx) => {
                                        const badge = getTxTypeBadge(tx.transaction_type);
                                        return (
                                            <tr
                                                key={idx}
                                                style={{
                                                    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                                                    transition: 'background-color 0.15s ease'
                                                }}
                                                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)')}
                                                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                                            >
                                                <td style={{ padding: '0.875rem 1rem', whiteSpace: 'nowrap', color: '#cbd5e1' }}>
                                                    {tx.date}
                                                </td>
                                                <td style={{ padding: '0.875rem 1rem' }}>
                                                    <span style={{
                                                        padding: '0.25rem 0.5rem',
                                                        borderRadius: '4px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 600,
                                                        backgroundColor: badge.bg,
                                                        color: badge.color,
                                                        border: `1px solid ${badge.border}`
                                                    }}>
                                                        {badge.label}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.875rem 1rem', fontWeight: 600, color: '#f8fafc' }}>
                                                    {tx.reference}
                                                </td>
                                                <td style={{ padding: '0.875rem 1rem', color: '#cbd5e1', fontSize: '0.8125rem' }}>
                                                    {tx.description}
                                                </td>
                                                <td style={{ padding: '0.875rem 1rem', textAlign: 'right', fontWeight: 600, color: Number(tx.debit) > 0 ? '#60a5fa' : '#64748b' }}>
                                                    {Number(tx.debit) > 0 ? Number(tx.debit).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                                                </td>
                                                <td style={{ padding: '0.875rem 1rem', textAlign: 'right', fontWeight: 600, color: Number(tx.credit) > 0 ? '#34d399' : '#64748b' }}>
                                                    {Number(tx.credit) > 0 ? Number(tx.credit).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                                                </td>
                                                <td style={{ padding: '0.875rem 1rem', textAlign: 'right', fontWeight: 700, color: Number(tx.running_balance) > 0 ? '#fbbf24' : '#34d399' }}>
                                                    {statement.currency} {Number(tx.running_balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </td>
                                                <td style={{ padding: '0.875rem 1rem' }}>
                                                    <span style={{
                                                        fontSize: '0.75rem',
                                                        fontWeight: 600,
                                                        color: tx.status === 'PAID' || tx.status === 'POSTED' ? '#34d399' : '#fbbf24'
                                                    }}>
                                                        {tx.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </Card>
                </div>
            )}

            {/* Section 2: AP Aging Breakdown */}
            {activeSection === 'aging' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {/* Aging Buckets Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
                        <div
                            onClick={() => setSelectedBucketFilter(selectedBucketFilter === 'CURRENT' ? 'ALL' : 'CURRENT')}
                            style={{
                                padding: '1rem',
                                borderRadius: '8px',
                                backgroundColor: selectedBucketFilter === 'CURRENT' ? 'rgba(59, 130, 246, 0.2)' : 'var(--color-surface, #1e293b)',
                                border: selectedBucketFilter === 'CURRENT' ? '2px solid #3b82f6' : '1px solid var(--color-border, rgba(255, 255, 255, 0.1))',
                                cursor: 'pointer'
                            }}
                        >
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Current (Not Due)</div>
                            <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#60a5fa', marginTop: '0.25rem' }}>
                                {aging?.currency} {Number(aging?.current || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </div>
                        </div>

                        <div
                            onClick={() => setSelectedBucketFilter(selectedBucketFilter === 'DAYS_1_30' ? 'ALL' : 'DAYS_1_30')}
                            style={{
                                padding: '1rem',
                                borderRadius: '8px',
                                backgroundColor: selectedBucketFilter === 'DAYS_1_30' ? 'rgba(245, 158, 11, 0.2)' : 'var(--color-surface, #1e293b)',
                                border: selectedBucketFilter === 'DAYS_1_30' ? '2px solid #f59e0b' : '1px solid var(--color-border, rgba(255, 255, 255, 0.1))',
                                cursor: 'pointer'
                            }}
                        >
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>1–30 Days Overdue</div>
                            <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#fbbf24', marginTop: '0.25rem' }}>
                                {aging?.currency} {Number(aging?.days_1_30 || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </div>
                        </div>

                        <div
                            onClick={() => setSelectedBucketFilter(selectedBucketFilter === 'DAYS_31_60' ? 'ALL' : 'DAYS_31_60')}
                            style={{
                                padding: '1rem',
                                borderRadius: '8px',
                                backgroundColor: selectedBucketFilter === 'DAYS_31_60' ? 'rgba(249, 115, 22, 0.2)' : 'var(--color-surface, #1e293b)',
                                border: selectedBucketFilter === 'DAYS_31_60' ? '2px solid #f97316' : '1px solid var(--color-border, rgba(255, 255, 255, 0.1))',
                                cursor: 'pointer'
                            }}
                        >
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>31–60 Days Overdue</div>
                            <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#fb923c', marginTop: '0.25rem' }}>
                                {aging?.currency} {Number(aging?.days_31_60 || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </div>
                        </div>

                        <div
                            onClick={() => setSelectedBucketFilter(selectedBucketFilter === 'DAYS_61_90' ? 'ALL' : 'DAYS_61_90')}
                            style={{
                                padding: '1rem',
                                borderRadius: '8px',
                                backgroundColor: selectedBucketFilter === 'DAYS_61_90' ? 'rgba(239, 68, 68, 0.2)' : 'var(--color-surface, #1e293b)',
                                border: selectedBucketFilter === 'DAYS_61_90' ? '2px solid #ef4444' : '1px solid var(--color-border, rgba(255, 255, 255, 0.1))',
                                cursor: 'pointer'
                            }}
                        >
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>61–90 Days Overdue</div>
                            <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#f87171', marginTop: '0.25rem' }}>
                                {aging?.currency} {Number(aging?.days_61_90 || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </div>
                        </div>

                        <div
                            onClick={() => setSelectedBucketFilter(selectedBucketFilter === 'DAYS_OVER_90' ? 'ALL' : 'DAYS_OVER_90')}
                            style={{
                                padding: '1rem',
                                borderRadius: '8px',
                                backgroundColor: selectedBucketFilter === 'DAYS_OVER_90' ? 'rgba(220, 38, 38, 0.3)' : 'var(--color-surface, #1e293b)',
                                border: selectedBucketFilter === 'DAYS_OVER_90' ? '2px solid #dc2626' : '1px solid var(--color-border, rgba(255, 255, 255, 0.1))',
                                cursor: 'pointer'
                            }}
                        >
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>90+ Days Critical</div>
                            <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#ef4444', marginTop: '0.25rem' }}>
                                {aging?.currency} {Number(aging?.days_over_90 || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </div>
                        </div>
                    </div>

                    {/* Aging Invoices Table */}
                    <Card style={{
                        backgroundColor: 'var(--color-surface, #1e293b)',
                        border: '1px solid var(--color-border, rgba(255, 255, 255, 0.1))',
                        borderRadius: '12px',
                        overflow: 'hidden'
                    }}>
                        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-border, rgba(255, 255, 255, 0.1))', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h4 style={{ margin: 0, fontSize: '0.9375rem', color: '#f8fafc' }}>
                                Unpaid Bills Aging List {selectedBucketFilter !== 'ALL' && `(Filtered: ${selectedBucketFilter})`}
                            </h4>
                            {selectedBucketFilter !== 'ALL' && (
                                <Button variant="ghost" size="sm" onClick={() => setSelectedBucketFilter('ALL')}>
                                    Show All Buckets
                                </Button>
                            )}
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
                                    <th style={{ padding: '0.875rem 1rem' }}>Bill #</th>
                                    <th style={{ padding: '0.875rem 1rem' }}>Vendor Ref</th>
                                    <th style={{ padding: '0.875rem 1rem' }}>Parent PO</th>
                                    <th style={{ padding: '0.875rem 1rem' }}>Bill Date</th>
                                    <th style={{ padding: '0.875rem 1rem' }}>Due Date</th>
                                    <th style={{ padding: '0.875rem 1rem' }}>Overdue</th>
                                    <th style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>Original Bill</th>
                                    <th style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>Paid / Credits</th>
                                    <th style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>Outstanding</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredAgingInvoices.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                                            No outstanding unpaid bills in this aging bucket.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredAgingInvoices.map((inv) => (
                                        <tr
                                            key={inv.invoice_id}
                                            style={{
                                                borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                                                transition: 'background-color 0.15s ease'
                                            }}
                                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)')}
                                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                                        >
                                            <td style={{ padding: '0.875rem 1rem', fontWeight: 600, color: '#f8fafc' }}>
                                                {inv.invoice_number}
                                            </td>
                                            <td style={{ padding: '0.875rem 1rem', color: '#cbd5e1' }}>
                                                {inv.vendor_invoice_number}
                                            </td>
                                            <td style={{ padding: '0.875rem 1rem', color: '#38bdf8' }}>
                                                {inv.parent_po_number}
                                            </td>
                                            <td style={{ padding: '0.875rem 1rem', color: '#94a3b8' }}>
                                                {inv.document_date}
                                            </td>
                                            <td style={{ padding: '0.875rem 1rem', color: inv.days_overdue > 0 ? '#f87171' : '#cbd5e1' }}>
                                                {inv.due_date}
                                            </td>
                                            <td style={{ padding: '0.875rem 1rem' }}>
                                                <span style={{
                                                    fontSize: '0.75rem',
                                                    fontWeight: 600,
                                                    color: inv.days_overdue > 60 ? '#ef4444' : inv.days_overdue > 0 ? '#fbbf24' : '#34d399'
                                                }}>
                                                    {inv.days_overdue > 0 ? `${inv.days_overdue} days overdue` : 'Current'}
                                                </span>
                                            </td>
                                            <td style={{ padding: '0.875rem 1rem', textAlign: 'right', color: '#cbd5e1' }}>
                                                {Number(inv.original_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                            <td style={{ padding: '0.875rem 1rem', textAlign: 'right', color: '#34d399' }}>
                                                {Number(Number(inv.paid_amount) + Number(inv.return_credit)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                            <td style={{ padding: '0.875rem 1rem', textAlign: 'right', fontWeight: 700, color: '#fbbf24' }}>
                                                {aging?.currency} {Number(inv.outstanding_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </Card>
                </div>
            )}

            {/* Section 3: Balance Reconciliation */}
            {activeSection === 'reconciliation' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <Card style={{
                        backgroundColor: 'var(--color-surface, #1e293b)',
                        border: '1px solid var(--color-border, rgba(255, 255, 255, 0.1))',
                        borderRadius: '12px',
                        overflow: 'hidden'
                    }}>
                        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-border, rgba(255, 255, 255, 0.1))', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h4 style={{ margin: '0 0 2px 0', fontSize: '0.9375rem', color: '#f8fafc' }}>
                                    Vendor Statement Balance Reconciliations
                                </h4>
                                <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8' }}>
                                    Periodic comparison of Zorvex calculated ledger balances against vendor self-reported figures.
                                </p>
                            </div>
                            {isFinanceOrAdmin && (
                                <Button variant="primary" size="sm" onClick={() => setShowReconcileModal(true)}>
                                    ➕ Record Vendor Statement
                                </Button>
                            )}
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
                                    <th style={{ padding: '0.875rem 1rem' }}>Statement Date</th>
                                    <th style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>Reported Balance</th>
                                    <th style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>System Balance</th>
                                    <th style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>Variance</th>
                                    <th style={{ padding: '0.875rem 1rem' }}>Status</th>
                                    <th style={{ padding: '0.875rem 1rem' }}>Reconciled By</th>
                                    <th style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {reconciliations.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                                            No statement reconciliations recorded yet.
                                        </td>
                                    </tr>
                                ) : (
                                    reconciliations.map((rec) => {
                                        const badge = getRecStatusBadge(rec.status);
                                        const hasVariance = Number(rec.variance) !== 0;
                                        return (
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
                                                    {rec.statement_date}
                                                </td>
                                                <td style={{ padding: '0.875rem 1rem', textAlign: 'right', color: '#cbd5e1' }}>
                                                    {rec.currency} {Number(rec.vendor_reported_balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </td>
                                                <td style={{ padding: '0.875rem 1rem', textAlign: 'right', color: '#60a5fa', fontWeight: 600 }}>
                                                    {rec.currency} {Number(rec.system_balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </td>
                                                <td style={{ padding: '0.875rem 1rem', textAlign: 'right', fontWeight: 700, color: hasVariance ? '#ef4444' : '#34d399' }}>
                                                    {rec.currency} {Number(rec.variance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </td>
                                                <td style={{ padding: '0.875rem 1rem' }}>
                                                    <span style={{
                                                        padding: '0.25rem 0.5rem',
                                                        borderRadius: '4px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 600,
                                                        backgroundColor: badge.bg,
                                                        color: badge.color,
                                                        border: `1px solid ${badge.border}`
                                                    }}>
                                                        {badge.label}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.875rem 1rem', fontSize: '0.8125rem', color: '#94a3b8' }}>
                                                    {rec.reconciled_by_name || 'System'}
                                                </td>
                                                <td style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>
                                                    {isFinanceOrAdmin && rec.status === 'VARIANCE' && (
                                                        <Button
                                                            variant="secondary"
                                                            size="sm"
                                                            onClick={() => setSelectedRecForResolve(rec)}
                                                            style={{ fontSize: '0.75rem', color: '#60a5fa', borderColor: '#3b82f6' }}
                                                        >
                                                            Resolve Variance
                                                        </Button>
                                                    )}
                                                    {rec.status === 'RESOLVED' && (
                                                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Resolved</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </Card>
                </div>
            )}

            {/* Reconciliation Modal */}
            {showReconcileModal && (
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
                                Record Vendor Statement Balance
                            </h3>
                            <button onClick={() => setShowReconcileModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.25rem', cursor: 'pointer' }}>
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleCreateReconciliation} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', padding: '0.875rem', borderRadius: '8px', fontSize: '0.8125rem', color: '#93c5fd' }}>
                                <strong>Current Zorvex System Balance:</strong> {statement?.currency} {Number(statement?.outstanding_payable || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.375rem' }}>Statement Date *</label>
                                    <input
                                        type="date"
                                        required
                                        value={statementDate}
                                        onChange={(e) => setStatementDate(e.target.value)}
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
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.375rem' }}>Cutoff As-Of Date *</label>
                                    <input
                                        type="date"
                                        required
                                        value={asOfDate}
                                        onChange={(e) => setAsOfDate(e.target.value)}
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
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.375rem' }}>
                                    Vendor Reported Statement Balance ({statement?.currency || 'PKR'}) *
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    required
                                    placeholder="e.g. 500000.00"
                                    value={vendorReportedBalance}
                                    onChange={(e) => setVendorReportedBalance(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.625rem',
                                        borderRadius: '6px',
                                        backgroundColor: 'rgba(0, 0, 0, 0.3)',
                                        border: '1px solid var(--color-border, rgba(255, 255, 255, 0.1))',
                                        color: '#fff',
                                        fontSize: '1rem',
                                        fontWeight: 600
                                    }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.375rem' }}>Investigation Notes / Audit Reference</label>
                                <textarea
                                    rows={3}
                                    placeholder="Notes on statement receipt, reference numbers, or billing discrepancies..."
                                    value={recNotes}
                                    onChange={(e) => setRecNotes(e.target.value)}
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

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                                <Button type="button" variant="secondary" onClick={() => setShowReconcileModal(false)}>
                                    Cancel
                                </Button>
                                <Button type="submit" variant="primary" disabled={submittingRec}>
                                    {submittingRec ? 'Reconciling...' : 'Save & Compare Statement'}
                                </Button>
                            </div>
                        </form>
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
                                Resolve Reconciliation Variance ({selectedRecForResolve.reconciliation_number})
                            </h3>
                            <button onClick={() => setSelectedRecForResolve(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.25rem', cursor: 'pointer' }}>
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleResolveReconciliation} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '0.875rem', borderRadius: '8px', fontSize: '0.8125rem', color: '#fca5a5' }}>
                                <strong>Variance:</strong> {selectedRecForResolve.currency} {Number(selectedRecForResolve.variance).toLocaleString()} (System: {Number(selectedRecForResolve.system_balance).toLocaleString()} vs Vendor: {Number(selectedRecForResolve.vendor_reported_balance).toLocaleString()})
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.375rem' }}>
                                    Resolution Investigation Notes *
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
                                <Button type="submit" variant="primary" disabled={submittingResolve}>
                                    {submittingResolve ? 'Resolving...' : 'Confirm Resolution'}
                                </Button>
                            </div>
                        </form>
                    </Card>
                </div>
            )}
        </div>
    );
};
