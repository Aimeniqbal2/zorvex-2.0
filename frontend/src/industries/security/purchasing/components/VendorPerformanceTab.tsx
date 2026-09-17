import React, { useState, useEffect } from 'react';
import { Card } from '../../../../components/ui/Card';
import {
    getVendorPerformance,
    getVendorComparison,
    getUniversalInventoryItems,
    type VendorPerformanceMetrics,
    type VendorItemComparison,
    type UniversalItem
} from '../api';

export const VendorPerformanceTab: React.FC = () => {
    const [performanceList, setPerformanceList] = useState<VendorPerformanceMetrics[]>([]);
    const [items, setItems] = useState<UniversalItem[]>([]);
    const [selectedItemId, setSelectedItemId] = useState<string>('');
    const [itemComparison, setItemComparison] = useState<VendorItemComparison | null>(null);
    const [loadingPerf, setLoadingPerf] = useState<boolean>(true);
    const [loadingComp, setLoadingComp] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [activeSubTab, setActiveSubTab] = useState<'scorecards' | 'comparison'>('scorecards');

    useEffect(() => {
        const loadInitialData = async () => {
            setLoadingPerf(true);
            setError(null);
            try {
                const [perfRes, itemsRes] = await Promise.all([
                    getVendorPerformance(),
                    getUniversalInventoryItems()
                ]);
                setPerformanceList(Array.isArray(perfRes) ? perfRes : [perfRes]);
                setItems(itemsRes);
                if (itemsRes.length > 0) {
                    setSelectedItemId(itemsRes[0].id);
                }
            } catch (err: any) {
                console.error('Failed to load vendor performance:', err);
                setError(err.response?.data?.detail || 'Failed to load vendor metrics.');
            } finally {
                setLoadingPerf(false);
            }
        };
        loadInitialData();
    }, []);

    useEffect(() => {
        if (!selectedItemId) return;
        const loadComparison = async () => {
            setLoadingComp(true);
            try {
                const compRes = await getVendorComparison(selectedItemId);
                setItemComparison(compRes);
            } catch (err: any) {
                console.error('Failed to load item vendor comparison:', err);
            } finally {
                setLoadingComp(false);
            }
        };
        loadComparison();
    }, [selectedItemId]);

    const formatCurrency = (val?: string | number) => {
        const num = Number(val || 0);
        return `PKR ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Header & Sub-tab Switcher */}
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
                        <i className='bx bx-award' style={{ color: '#10b981' }}></i>
                        Vendor Performance Analytics & Multi-Supplier Comparison
                    </h2>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                        Live fulfillment, lead-time metrics, quality rates, and item supplier comparisons based on real transactions.
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={() => setActiveSubTab('scorecards')}
                        style={{
                            padding: '8px 14px',
                            borderRadius: '8px',
                            border: '1px solid',
                            borderColor: activeSubTab === 'scorecards' ? 'var(--color-primary)' : 'var(--color-border)',
                            background: activeSubTab === 'scorecards' ? 'rgba(99, 102, 241, 0.15)' : 'var(--color-surface-hover)',
                            color: activeSubTab === 'scorecards' ? 'var(--color-primary)' : 'var(--color-text)',
                            fontWeight: 700,
                            fontSize: '12px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <i className='bx bx-id-card'></i> Vendor Scorecards ({performanceList.length})
                    </button>
                    <button
                        onClick={() => setActiveSubTab('comparison')}
                        style={{
                            padding: '8px 14px',
                            borderRadius: '8px',
                            border: '1px solid',
                            borderColor: activeSubTab === 'comparison' ? 'var(--color-primary)' : 'var(--color-border)',
                            background: activeSubTab === 'comparison' ? 'rgba(99, 102, 241, 0.15)' : 'var(--color-surface-hover)',
                            color: activeSubTab === 'comparison' ? 'var(--color-primary)' : 'var(--color-text)',
                            fontWeight: 700,
                            fontSize: '12px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <i className='bx bx-git-compare'></i> Item Supplier Comparison
                    </button>
                </div>
            </div>

            {error && (
                <div style={{ padding: '12px 16px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontSize: '13px' }}>
                    <i className='bx bx-error-circle'></i> {error}
                </div>
            )}

            {/* SUB-TAB 1: VENDOR SCORECARDS */}
            {activeSubTab === 'scorecards' && (
                <div>
                    {loadingPerf ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                            <i className='bx bx-loader-alt bx-spin' style={{ fontSize: '28px', color: 'var(--color-primary)' }}></i>
                            <div style={{ marginTop: '8px', fontSize: '13px', fontWeight: 600 }}>Calculating supplier performance metrics...</div>
                        </div>
                    ) : performanceList.length === 0 ? (
                        <Card style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                            <i className='bx bx-buildings' style={{ fontSize: '36px', color: 'var(--color-border)' }}></i>
                            <div style={{ marginTop: '8px', fontSize: '14px', fontWeight: 600 }}>No vendors found.</div>
                        </Card>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '16px' }}>
                            {performanceList.map((p) => {
                                const onTimeGood = p.on_time_delivery_pct >= 90;
                                const fulfillGood = p.quantity_fulfillment_pct >= 95;
                                const returnGood = p.return_rate_pct <= 2;

                                return (
                                    <Card key={p.vendor_id} style={{ padding: '20px', background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                        {/* Vendor Header */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--color-text)' }}>{p.vendor_name}</span>
                                                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', background: 'var(--color-surface-hover)', padding: '2px 6px', borderRadius: '4px' }}>
                                                        {p.vendor_code}
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                                                    Category: {p.category}
                                                </div>
                                            </div>

                                            {/* Manual Rating Badge (Not Overwritten) */}
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(245, 158, 11, 0.1)', padding: '4px 8px', borderRadius: '6px' }}>
                                                    <i className='bx bxs-star' style={{ color: '#f59e0b', fontSize: '14px' }}></i>
                                                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#f59e0b' }}>
                                                        {p.manual_rating ? `${p.manual_rating} / 5` : 'Unrated'}
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '2px' }}>Manual Rating</div>
                                            </div>
                                        </div>

                                        {/* Key Metrics Grid */}
                                        <div style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(3, 1fr)',
                                            gap: '8px',
                                            background: 'var(--color-surface-hover)',
                                            padding: '12px',
                                            borderRadius: '8px',
                                            textAlign: 'center'
                                        }}>
                                            <div>
                                                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Avg Lead Time</div>
                                                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text)', marginTop: '2px' }}>
                                                    {p.average_delivery_time_days} days
                                                </div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>On-Time %</div>
                                                <div style={{ fontSize: '15px', fontWeight: 700, color: onTimeGood ? '#10b981' : '#f59e0b', marginTop: '2px' }}>
                                                    {p.on_time_delivery_pct}%
                                                </div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Fulfillment %</div>
                                                <div style={{ fontSize: '15px', fontWeight: 700, color: fulfillGood ? '#10b981' : '#f59e0b', marginTop: '2px' }}>
                                                    {p.quantity_fulfillment_pct}%
                                                </div>
                                            </div>
                                        </div>

                                        {/* Quality & Spend Summary */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span style={{ color: 'var(--color-text-muted)' }}>Quality Return / Defect Rate:</span>
                                                <span style={{ fontWeight: 700, color: returnGood ? 'var(--color-text)' : '#ef4444' }}>
                                                    {p.return_rate_pct}%
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span style={{ color: 'var(--color-text-muted)' }}>3-Way Invoice Match Rate:</span>
                                                <span style={{ fontWeight: 700, color: '#10b981' }}>
                                                    {p.invoice_match_rate_pct}% ({p.price_variance_count} variances)
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span style={{ color: 'var(--color-text-muted)' }}>Total Purchase Volume:</span>
                                                <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>
                                                    {formatCurrency(p.total_purchase_value)} ({p.number_of_orders} orders)
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span style={{ color: 'var(--color-text-muted)' }}>Live Outstanding Payable:</span>
                                                <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>
                                                    {formatCurrency(p.outstanding_payable)}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Last Order Footer */}
                                        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--color-text-muted)' }}>
                                            <span>Last Order: {p.last_purchase_date || 'No orders yet'}</span>
                                            {Number(p.unallocated_credit || 0) > 0 && (
                                                <span style={{ color: '#f59e0b', fontWeight: 600 }}>Credit: {formatCurrency(p.unallocated_credit)}</span>
                                            )}
                                        </div>
                                    </Card>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* SUB-TAB 2: ITEM SUPPLIER COMPARISON */}
            {activeSubTab === 'comparison' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Item Selector Bar */}
                    <Card style={{ padding: '16px 20px', background: 'var(--color-surface)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                            <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text)' }}>
                                Select Inventory Item to Compare:
                            </label>
                            <select
                                value={selectedItemId}
                                onChange={(e) => setSelectedItemId(e.target.value)}
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--color-border)',
                                    background: 'var(--color-surface)',
                                    color: 'var(--color-text)',
                                    fontSize: '13px',
                                    minWidth: '280px',
                                    fontWeight: 600
                                }}
                            >
                                {items.map(item => (
                                    <option key={item.id} value={item.id}>
                                        {item.name} ({item.sku || 'No SKU'}) — Cost: {formatCurrency(item.cost_price)}
                                    </option>
                                ))}
                            </select>
                            {itemComparison && (
                                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                    Found <strong>{itemComparison.suppliers_count}</strong> historical / catalogue suppliers.
                                </span>
                            )}
                        </div>
                    </Card>

                    {/* Comparison Table */}
                    <Card style={{ padding: '0px', overflow: 'hidden', background: 'var(--color-surface)' }}>
                        {loadingComp ? (
                            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                                <i className='bx bx-loader-alt bx-spin' style={{ fontSize: '28px', color: 'var(--color-primary)' }}></i>
                                <div style={{ marginTop: '8px', fontSize: '13px', fontWeight: 600 }}>Comparing vendor pricing & lead times...</div>
                            </div>
                        ) : !itemComparison || itemComparison.vendors.length === 0 ? (
                            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                                <i className='bx bx-search-alt' style={{ fontSize: '36px', color: 'var(--color-border)' }}></i>
                                <div style={{ marginTop: '8px', fontSize: '14px', fontWeight: 600 }}>No purchase order history found for this item across vendors.</div>
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                    <thead>
                                        <tr style={{ background: 'var(--color-surface-hover)', borderBottom: '1px solid var(--color-border)', textAlign: 'left', color: 'var(--color-text-muted)' }}>
                                            <th style={{ padding: '12px 14px' }}>Vendor</th>
                                            <th style={{ padding: '12px 14px' }}>Manual Rating</th>
                                            <th style={{ padding: '12px 14px' }}>Latest Price</th>
                                            <th style={{ padding: '12px 14px' }}>Lowest Price</th>
                                            <th style={{ padding: '12px 14px' }}>Avg Price</th>
                                            <th style={{ padding: '12px 14px' }}>Qty Supplied</th>
                                            <th style={{ padding: '12px 14px' }}>Lead Time</th>
                                            <th style={{ padding: '12px 14px' }}>On-Time %</th>
                                            <th style={{ padding: '12px 14px' }}>Return Rate %</th>
                                            <th style={{ padding: '12px 14px' }}>Last Order Date</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {itemComparison.vendors.map((v) => (
                                            <tr key={v.vendor_id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                <td style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--color-text)' }}>
                                                    {v.vendor_name} <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 400 }}>({v.vendor_code})</span>
                                                </td>
                                                <td style={{ padding: '12px 14px' }}>
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', color: '#f59e0b', fontWeight: 700 }}>
                                                        <i className='bx bxs-star'></i> {v.manual_rating || '-'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--color-primary)' }}>
                                                    {formatCurrency(v.latest_purchase_price)}
                                                </td>
                                                <td style={{ padding: '12px 14px', color: '#10b981', fontWeight: 600 }}>
                                                    {formatCurrency(v.lowest_purchase_price)}
                                                </td>
                                                <td style={{ padding: '12px 14px' }}>
                                                    {formatCurrency(v.average_purchase_price)}
                                                </td>
                                                <td style={{ padding: '12px 14px', fontWeight: 600 }}>
                                                    {v.total_qty_ordered}
                                                </td>
                                                <td style={{ padding: '12px 14px' }}>
                                                    {v.lead_time_days} days
                                                </td>
                                                <td style={{ padding: '12px 14px', fontWeight: 700, color: v.on_time_delivery_pct >= 90 ? '#10b981' : '#f59e0b' }}>
                                                    {v.on_time_delivery_pct}%
                                                </td>
                                                <td style={{ padding: '12px 14px', fontWeight: 600, color: v.return_rate_pct > 2 ? '#ef4444' : 'var(--color-text)' }}>
                                                    {v.return_rate_pct}%
                                                </td>
                                                <td style={{ padding: '12px 14px', color: 'var(--color-text-muted)' }}>
                                                    {v.latest_order_date}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Card>
                </div>
            )}
        </div>
    );
};
