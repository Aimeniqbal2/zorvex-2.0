import React, { useState, useEffect } from 'react';
import { Card } from '../../../../components/ui/Card';
import {
    getPurchasingDashboardKPIs,
    getPurchasingExceptions,
    type PurchasingDashboardKPIs,
    type PurchasingExceptions
} from '../api';

interface PurchasingDashboardProps {
    onNavigate: (section: 'vendors' | 'orders' | 'requests' | 'receipts' | 'bills' | 'payables' | 'reports' | 'performance' | 'crm_demand') => void;
    onSelectPo?: (poId: string) => void;
    onSelectVendor?: (vendorId: string) => void;
}

export const PurchasingDashboard: React.FC<PurchasingDashboardProps> = ({
    onNavigate,
    onSelectPo,
    onSelectVendor: _onSelectVendor
}) => {
    const [kpis, setKpis] = useState<PurchasingDashboardKPIs | null>(null);
    const [exceptions, setExceptions] = useState<PurchasingExceptions | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedTab, setSelectedTab] = useState<'overview' | 'exceptions'>('overview');

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [kpiRes, excRes] = await Promise.all([
                getPurchasingDashboardKPIs(),
                getPurchasingExceptions()
            ]);
            setKpis(kpiRes);
            setExceptions(excRes);
        } catch (err: any) {
            console.error('Failed to load purchasing dashboard data:', err);
            setError(err.response?.data?.detail || 'Failed to load dashboard metrics.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const formatCurrency = (val?: string | number) => {
        const num = Number(val || 0);
        return `PKR ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    if (loading && !kpis) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                    <i className='bx bx-loader-alt bx-spin' style={{ fontSize: '36px', color: 'var(--color-primary)' }}></i>
                    <span style={{ fontSize: '14px', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                        Loading Purchasing Dashboard & KPIs...
                    </span>
                </div>
            </div>
        );
    }

    if (error && !kpis) {
        return (
            <div style={{ padding: '24px' }}>
                <Card style={{ padding: '24px', borderColor: 'rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.05)' }}>
                    <div style={{ color: '#ef4444', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <i className='bx bx-error-circle' style={{ fontSize: '20px' }}></i>
                        {error}
                    </div>
                    <button
                        onClick={fetchData}
                        style={{
                            marginTop: '12px',
                            padding: '6px 14px',
                            borderRadius: '6px',
                            border: 'none',
                            background: '#ef4444',
                            color: '#fff',
                            fontWeight: 600,
                            cursor: 'pointer'
                        }}
                    >
                        Retry
                    </button>
                </Card>
            </div>
        );
    }

    const excSummary = exceptions?.summary;
    const hasExceptions = (excSummary?.total_exceptions_count || 0) > 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Header & Quick Action Banner */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '16px',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: '12px',
                padding: '16px 20px'
            }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <i className='bx bx-shield-quarter' style={{ color: 'var(--color-primary)' }}></i>
                        Security Purchasing Operational Dashboard
                    </h2>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                        Live Procurement KPIs, Accounts Payable status & Exception Center (As of: {kpis?.as_of_date || 'Today'})
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <button
                        onClick={() => setSelectedTab(selectedTab === 'overview' ? 'exceptions' : 'overview')}
                        style={{
                            padding: '8px 14px',
                            borderRadius: '8px',
                            border: '1px solid',
                            borderColor: hasExceptions ? 'rgba(239, 68, 68, 0.4)' : 'var(--color-border)',
                            background: hasExceptions ? 'rgba(239, 68, 68, 0.1)' : 'var(--color-surface-hover)',
                            color: hasExceptions ? '#ef4444' : 'var(--color-text)',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <i className={`bx ${hasExceptions ? 'bx-error-circle' : 'bx-check-circle'}`}></i>
                        {hasExceptions ? `Exceptions (${excSummary?.total_exceptions_count})` : 'Zero Exceptions'}
                    </button>

                    <button
                        onClick={fetchData}
                        style={{
                            padding: '8px 12px',
                            borderRadius: '8px',
                            border: '1px solid var(--color-border)',
                            background: 'var(--color-surface)',
                            color: 'var(--color-text)',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                        }}
                        title="Refresh metrics"
                    >
                        <i className='bx bx-refresh'></i> Refresh
                    </button>
                </div>
            </div>

            {/* Exception Warning Banner if Active */}
            {hasExceptions && selectedTab === 'overview' && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 18px',
                    borderRadius: '10px',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    background: 'rgba(239, 68, 68, 0.06)',
                    color: 'var(--color-text)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <i className='bx bx-alarm-exclamation' style={{ fontSize: '24px', color: '#ef4444' }}></i>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: '13px', color: '#ef4444' }}>
                                Action Required: {excSummary?.total_exceptions_count} Procurement & AP Exceptions Detected
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                                {excSummary?.overdue_deliveries_count || 0} overdue deliveries, {excSummary?.match_mismatches_count || 0} 3-way match mismatches, {excSummary?.overdue_payables_count || 0} overdue bills.
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={() => setSelectedTab('exceptions')}
                        style={{
                            padding: '6px 14px',
                            borderRadius: '6px',
                            border: 'none',
                            background: '#ef4444',
                            color: '#fff',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer'
                        }}
                    >
                        Review Exceptions
                    </button>
                </div>
            )}

            {/* KPI Summary Cards Grid (10 KPIs) */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '16px'
            }}>
                {/* 1. Open Purchase Orders */}
                <Card style={{ padding: '18px', background: 'var(--color-surface)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600 }}>Open Purchase Orders</div>
                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className='bx bx-cart' style={{ fontSize: '18px' }}></i>
                        </div>
                    </div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--color-text)', marginTop: '8px' }}>
                        {kpis?.open_purchase_orders_count || 0}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-primary)', fontWeight: 600, marginTop: '4px' }}>
                        {formatCurrency(kpis?.open_purchase_orders_value)}
                    </div>
                    <div
                        onClick={() => onNavigate('orders')}
                        style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                        <span>View Orders</span> <i className='bx bx-right-arrow-alt'></i>
                    </div>
                </Card>

                {/* 2. Pending Approvals */}
                <Card style={{ padding: '18px', background: 'var(--color-surface)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600 }}>Pending Approvals</div>
                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className='bx bx-check-shield' style={{ fontSize: '18px' }}></i>
                        </div>
                    </div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: '#f59e0b', marginTop: '8px' }}>
                        {kpis?.pending_approvals_count || 0}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                        {kpis?.pending_po_approvals_count || 0} POs, {kpis?.pending_return_approvals_count || 0} Returns
                    </div>
                    <div
                        onClick={() => onNavigate('orders')}
                        style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                        <span>Approval Queue</span> <i className='bx bx-right-arrow-alt'></i>
                    </div>
                </Card>

                {/* 3. Pending Deliveries */}
                <Card style={{ padding: '18px', background: 'var(--color-surface)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600 }}>Pending Deliveries</div>
                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className='bx bx-package' style={{ fontSize: '18px' }}></i>
                        </div>
                    </div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--color-text)', marginTop: '8px' }}>
                        {kpis?.pending_deliveries_count || 0}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                        {kpis?.partially_received_pos_count || 0} Partially Received
                    </div>
                    <div
                        onClick={() => onNavigate('receipts')}
                        style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                        <span>Receive Goods (GRN)</span> <i className='bx bx-right-arrow-alt'></i>
                    </div>
                </Card>

                {/* 4. Posted Vendor Bills */}
                <Card style={{ padding: '18px', background: 'var(--color-surface)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600 }}>Posted Bills</div>
                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className='bx bx-receipt' style={{ fontSize: '18px' }}></i>
                        </div>
                    </div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--color-text)', marginTop: '8px' }}>
                        {kpis?.posted_bills_count || 0}
                    </div>
                    <div style={{ fontSize: '12px', color: '#10b981', fontWeight: 600, marginTop: '4px' }}>
                        {formatCurrency(kpis?.posted_bills_value)}
                    </div>
                    <div
                        onClick={() => onNavigate('bills')}
                        style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                        <span>View Bills</span> <i className='bx bx-right-arrow-alt'></i>
                    </div>
                </Card>

                {/* 5. Outstanding Payables */}
                <Card style={{ padding: '18px', background: 'var(--color-surface)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600 }}>Total Outstanding AP</div>
                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className='bx bx-wallet' style={{ fontSize: '18px' }}></i>
                        </div>
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--color-primary)', marginTop: '8px' }}>
                        {formatCurrency(kpis?.outstanding_payables)}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                        Net of return credits
                    </div>
                    <div
                        onClick={() => onNavigate('payables')}
                        style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                        <span>AP Aging & Ledger</span> <i className='bx bx-right-arrow-alt'></i>
                    </div>
                </Card>

                {/* 6. Overdue Payables */}
                <Card style={{ padding: '18px', background: 'var(--color-surface)', borderColor: Number(kpis?.overdue_payables || 0) > 0 ? 'rgba(239, 68, 68, 0.3)' : undefined }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600 }}>Overdue Payables</div>
                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className='bx bx-time' style={{ fontSize: '18px' }}></i>
                        </div>
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#ef4444', marginTop: '8px' }}>
                        {formatCurrency(kpis?.overdue_payables)}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                        Past due date
                    </div>
                    <div
                        onClick={() => onNavigate('payables')}
                        style={{ fontSize: '11px', color: '#ef4444', marginTop: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}
                    >
                        <span>Settle Overdue</span> <i className='bx bx-right-arrow-alt'></i>
                    </div>
                </Card>

                {/* 7. Payments This Period */}
                <Card style={{ padding: '18px', background: 'var(--color-surface)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600 }}>Payments Disbursed</div>
                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className='bx bx-check-double' style={{ fontSize: '18px' }}></i>
                        </div>
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#10b981', marginTop: '8px' }}>
                        {formatCurrency(kpis?.payments_period_total)}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                        {kpis?.payments_period_count || 0} Posted Vouchers
                    </div>
                    <div
                        onClick={() => onNavigate('payables')}
                        style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                        <span>Payment History</span> <i className='bx bx-right-arrow-alt'></i>
                    </div>
                </Card>

                {/* 8. Purchase Returns & Credits */}
                <Card style={{ padding: '18px', background: 'var(--color-surface)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600 }}>Returns & Credits</div>
                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className='bx bx-undo' style={{ fontSize: '18px' }}></i>
                        </div>
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#f59e0b', marginTop: '8px' }}>
                        {formatCurrency(kpis?.purchase_returns_total)}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                        {formatCurrency(kpis?.unallocated_vendor_credits)} unallocated credit
                    </div>
                    <div
                        onClick={() => onNavigate('payables')}
                        style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                        <span>Returns & Credit Notes</span> <i className='bx bx-right-arrow-alt'></i>
                    </div>
                </Card>
            </div>

            {/* Tab Toggle: Operational Overview vs Exception Center */}
            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px' }}>
                <button
                    onClick={() => setSelectedTab('overview')}
                    style={{
                        padding: '8px 16px',
                        borderRadius: '6px',
                        border: 'none',
                        background: selectedTab === 'overview' ? 'var(--color-primary)' : 'transparent',
                        color: selectedTab === 'overview' ? '#fff' : 'var(--color-text-muted)',
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: 'pointer'
                    }}
                >
                    <i className='bx bx-grid-alt'></i> Operational Workspaces
                </button>
                <button
                    onClick={() => setSelectedTab('exceptions')}
                    style={{
                        padding: '8px 16px',
                        borderRadius: '6px',
                        border: 'none',
                        background: selectedTab === 'exceptions' ? '#ef4444' : 'transparent',
                        color: selectedTab === 'exceptions' ? '#fff' : 'var(--color-text-muted)',
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}
                >
                    <i className='bx bx-error'></i> Exception Center ({excSummary?.total_exceptions_count || 0})
                </button>
            </div>

            {/* TAB 1: OPERATIONAL WORKSPACES SHORTCUTS */}
            {selectedTab === 'overview' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                    <Card style={{ padding: '20px', background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(99, 102, 241, 0.15)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <i className='bx bx-bar-chart-alt-2' style={{ fontSize: '22px' }}></i>
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--color-text)' }}>Purchasing Reports</h3>
                                <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-muted)' }}>13 operational reports with CSV export</p>
                            </div>
                        </div>
                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-muted)', lineHeight: '1.5' }}>
                            Detailed breakdowns by vendor spend, item volume, PO status, GRN QC history, and 3-way match variances.
                        </p>
                        <button
                            onClick={() => onNavigate('reports')}
                            style={{
                                marginTop: 'auto',
                                padding: '8px 14px',
                                borderRadius: '6px',
                                border: '1px solid var(--color-primary)',
                                background: 'transparent',
                                color: 'var(--color-primary)',
                                fontWeight: 700,
                                fontSize: '12px',
                                cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                            }}
                        >
                            Open Reports Suite <i className='bx bx-right-arrow-alt'></i>
                        </button>
                    </Card>

                    <Card style={{ padding: '20px', background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <i className='bx bx-trending-up' style={{ fontSize: '22px' }}></i>
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--color-text)' }}>Vendor Performance</h3>
                                <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-muted)' }}>On-time %, Lead Time & Item Comparison</p>
                            </div>
                        </div>
                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-muted)', lineHeight: '1.5' }}>
                            Historical lead times, fulfillment rates, and multi-supplier pricing comparison matrices per inventory item.
                        </p>
                        <button
                            onClick={() => onNavigate('performance')}
                            style={{
                                marginTop: 'auto',
                                padding: '8px 14px',
                                borderRadius: '6px',
                                border: '1px solid #10b981',
                                background: 'transparent',
                                color: '#10b981',
                                fontWeight: 700,
                                fontSize: '12px',
                                cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                            }}
                        >
                            View Performance Matrix <i className='bx bx-right-arrow-alt'></i>
                        </button>
                    </Card>

                    <Card style={{ padding: '20px', background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <i className='bx bx-git-pull-request' style={{ fontSize: '22px' }}></i>
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--color-text)' }}>Security CRM Demand</h3>
                                <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-muted)' }}>S-2H Contract Equipment Sourcing</p>
                            </div>
                        </div>
                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-muted)', lineHeight: '1.5' }}>
                            Incoming equipment requirements from signed security client proposals ready for procurement sourcing.
                        </p>
                        <button
                            onClick={() => onNavigate('crm_demand')}
                            style={{
                                marginTop: 'auto',
                                padding: '8px 14px',
                                borderRadius: '6px',
                                border: '1px solid #f59e0b',
                                background: 'transparent',
                                color: '#f59e0b',
                                fontWeight: 700,
                                fontSize: '12px',
                                cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                            }}
                        >
                            Inspect CRM Demand <i className='bx bx-right-arrow-alt'></i>
                        </button>
                    </Card>
                </div>
            )}

            {/* TAB 2: EXCEPTION CENTER */}
            {selectedTab === 'exceptions' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* 1. Overdue PO Deliveries */}
                    <Card style={{ padding: '18px', background: 'var(--color-surface)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className='bx bx-time' style={{ color: '#ef4444', fontSize: '18px' }}></i>
                                Overdue Purchase Order Deliveries ({exceptions?.overdue_deliveries.length || 0})
                            </div>
                            <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Expected delivery date exceeded</span>
                        </div>
                        {exceptions?.overdue_deliveries.length === 0 ? (
                            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                                ✅ No overdue purchase order deliveries.
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left', color: 'var(--color-text-muted)' }}>
                                            <th style={{ padding: '8px' }}>PO Number</th>
                                            <th style={{ padding: '8px' }}>Vendor</th>
                                            <th style={{ padding: '8px' }}>Item</th>
                                            <th style={{ padding: '8px' }}>Pending Qty</th>
                                            <th style={{ padding: '8px' }}>Expected Date</th>
                                            <th style={{ padding: '8px' }}>Days Overdue</th>
                                            <th style={{ padding: '8px', textAlign: 'right' }}>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {exceptions?.overdue_deliveries.map((d, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                <td style={{ padding: '8px', fontWeight: 600, color: 'var(--color-primary)' }}>{d.po_number}</td>
                                                <td style={{ padding: '8px' }}>{d.vendor_name}</td>
                                                <td style={{ padding: '8px' }}>{d.item_name}</td>
                                                <td style={{ padding: '8px', fontWeight: 700 }}>{d.pending_quantity}</td>
                                                <td style={{ padding: '8px' }}>{d.expected_delivery_date}</td>
                                                <td style={{ padding: '8px', color: '#ef4444', fontWeight: 700 }}>{d.days_overdue} days</td>
                                                <td style={{ padding: '8px', textAlign: 'right' }}>
                                                    <button
                                                        onClick={() => onSelectPo ? onSelectPo(d.po_id) : onNavigate('orders')}
                                                        style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', cursor: 'pointer', fontSize: '11px' }}
                                                    >
                                                        Open PO
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Card>

                    {/* 2. 3-Way Match Mismatches */}
                    <Card style={{ padding: '18px', background: 'var(--color-surface)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className='bx bx-git-compare' style={{ color: '#f59e0b', fontSize: '18px' }}></i>
                                3-Way Match Exceptions ({exceptions?.match_mismatches.length || 0})
                            </div>
                            <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Price or quantity discrepancies vs PO/GRN</span>
                        </div>
                        {exceptions?.match_mismatches.length === 0 ? (
                            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                                ✅ No 3-way match variances detected.
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left', color: 'var(--color-text-muted)' }}>
                                            <th style={{ padding: '8px' }}>Bill #</th>
                                            <th style={{ padding: '8px' }}>Vendor</th>
                                            <th style={{ padding: '8px' }}>Bill Date</th>
                                            <th style={{ padding: '8px' }}>Total Amount</th>
                                            <th style={{ padding: '8px' }}>Issue</th>
                                            <th style={{ padding: '8px', textAlign: 'right' }}>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {exceptions?.match_mismatches.map((m, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                <td style={{ padding: '8px', fontWeight: 600 }}>{m.bill_number}</td>
                                                <td style={{ padding: '8px' }}>{m.vendor_name}</td>
                                                <td style={{ padding: '8px' }}>{m.document_date}</td>
                                                <td style={{ padding: '8px', fontWeight: 700 }}>{formatCurrency(m.total_amount)}</td>
                                                <td style={{ padding: '8px' }}>
                                                    <span style={{ padding: '2px 8px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', fontSize: '11px', fontWeight: 700 }}>
                                                        {m.issue}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '8px', textAlign: 'right' }}>
                                                    <button
                                                        onClick={() => onNavigate('bills')}
                                                        style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', cursor: 'pointer', fontSize: '11px' }}
                                                    >
                                                        Review Match
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Card>

                    {/* 3. Overdue Accounts Payable */}
                    <Card style={{ padding: '18px', background: 'var(--color-surface)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <i className='bx bx-error-alt' style={{ color: '#ef4444', fontSize: '18px' }}></i>
                                Overdue Payables ({exceptions?.overdue_payables.length || 0})
                            </div>
                            <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Unpaid invoices exceeding payment terms</span>
                        </div>
                        {exceptions?.overdue_payables.length === 0 ? (
                            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                                ✅ No overdue vendor liabilities.
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left', color: 'var(--color-text-muted)' }}>
                                            <th style={{ padding: '8px' }}>Bill #</th>
                                            <th style={{ padding: '8px' }}>Vendor</th>
                                            <th style={{ padding: '8px' }}>Due Date</th>
                                            <th style={{ padding: '8px' }}>Days Overdue</th>
                                            <th style={{ padding: '8px' }}>Outstanding Balance</th>
                                            <th style={{ padding: '8px', textAlign: 'right' }}>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {exceptions?.overdue_payables.map((o, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                <td style={{ padding: '8px', fontWeight: 600 }}>{o.bill_number}</td>
                                                <td style={{ padding: '8px' }}>{o.vendor_name}</td>
                                                <td style={{ padding: '8px' }}>{o.due_date}</td>
                                                <td style={{ padding: '8px', color: '#ef4444', fontWeight: 700 }}>{o.days_overdue} days</td>
                                                <td style={{ padding: '8px', fontWeight: 700, color: '#ef4444' }}>{formatCurrency(o.outstanding_payable)}</td>
                                                <td style={{ padding: '8px', textAlign: 'right' }}>
                                                    <button
                                                        onClick={() => onNavigate('payables')}
                                                        style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #10b981', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}
                                                    >
                                                        Pay Voucher
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Card>

                    {/* 4. Unallocated Credits & Pending Reconciliations */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                        <Card style={{ padding: '18px', background: 'var(--color-surface)' }}>
                            <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--color-text)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <i className='bx bx-credit-card-front' style={{ color: '#f59e0b' }}></i>
                                Unallocated Vendor Credits ({exceptions?.unallocated_credits.length || 0})
                            </div>
                            {exceptions?.unallocated_credits.length === 0 ? (
                                <div style={{ padding: '12px', color: 'var(--color-text-muted)', fontSize: '12px' }}>Zero unallocated credit notes.</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {exceptions?.unallocated_credits.map((c, i) => (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', borderRadius: '6px', background: 'var(--color-surface-hover)', fontSize: '12px' }}>
                                            <div>
                                                <span style={{ fontWeight: 600 }}>{c.credit_note_number}</span> ({c.vendor_name})
                                            </div>
                                            <span style={{ fontWeight: 700, color: '#f59e0b' }}>{formatCurrency(c.unallocated_amount)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Card>

                        <Card style={{ padding: '18px', background: 'var(--color-surface)' }}>
                            <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--color-text)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <i className='bx bx-check-double' style={{ color: '#6366f1' }}></i>
                                Reconciliation Variances ({exceptions?.pending_reconciliations.length || 0})
                            </div>
                            {exceptions?.pending_reconciliations.length === 0 ? (
                                <div style={{ padding: '12px', color: 'var(--color-text-muted)', fontSize: '12px' }}>All vendor statements reconciled.</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {exceptions?.pending_reconciliations.map((r, i) => (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', borderRadius: '6px', background: 'var(--color-surface-hover)', fontSize: '12px' }}>
                                            <div>
                                                <span style={{ fontWeight: 600 }}>{r.reconciliation_number}</span> ({r.vendor_name})
                                            </div>
                                            <span style={{ fontWeight: 700, color: '#ef4444' }}>Variance: {formatCurrency(r.variance)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Card>
                    </div>
                </div>
            )}
        </div>
    );
};
