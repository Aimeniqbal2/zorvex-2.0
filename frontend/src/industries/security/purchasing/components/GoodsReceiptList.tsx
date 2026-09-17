import React, { useState, useEffect } from 'react';
import {
    type GoodsReceipt, type Warehouse,
    getGoodsReceipts, postGoodsReceipt, cancelGoodsReceipt, getWarehouses
} from '../api';


interface GoodsReceiptListProps {
    onSelectReceipt?: (receiptId: string) => void;
    onSelectPO?: (poId: string) => void;
    vendorIdFilter?: string;
}

export const GoodsReceiptList: React.FC<GoodsReceiptListProps> = ({
    onSelectReceipt,
    onSelectPO,
    vendorIdFilter
}) => {
    const [receipts, setReceipts] = useState<GoodsReceipt[]>([]);
    const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [search, setSearch] = useState<string>('');
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [warehouseFilter, setWarehouseFilter] = useState<string>('ALL');
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const loadData = async () => {
        setLoading(true);
        setErrorMessage(null);
        try {
            const [whList, grnList] = await Promise.all([
                getWarehouses(),
                getGoodsReceipts({
                    search: search || undefined,
                    status: statusFilter !== 'ALL' ? statusFilter : undefined,
                    warehouse: warehouseFilter !== 'ALL' ? warehouseFilter : undefined,
                    vendor: vendorIdFilter || undefined
                })
            ]);
            setWarehouses(whList);
            setReceipts(grnList);
        } catch (err: any) {
            console.error("Failed to load goods receipts", err);
            setErrorMessage(err.response?.data?.detail || "Failed to load goods receipts.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [search, statusFilter, warehouseFilter, vendorIdFilter]);

    const handlePostGRN = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm("Are you sure you want to post this Goods Receipt? Accepted quantities will be added to warehouse usable inventory.")) {
            return;
        }
        setActionLoading(id);
        setErrorMessage(null);
        try {
            await postGoodsReceipt(id);
            await loadData();
        } catch (err: any) {
            console.error("Failed to post GRN", err);
            setErrorMessage(err.response?.data?.detail || "Failed to post Goods Receipt.");
        } finally {
            setActionLoading(null);
        }
    };

    const handleCancelGRN = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm("Are you sure you want to cancel this draft Goods Receipt?")) {
            return;
        }
        setActionLoading(id);
        setErrorMessage(null);
        try {
            await cancelGoodsReceipt(id);
            await loadData();
        } catch (err: any) {
            console.error("Failed to cancel GRN", err);
            setErrorMessage(err.response?.data?.detail || "Failed to cancel Goods Receipt.");
        } finally {
            setActionLoading(null);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'POSTED':
                return { label: 'POSTED / IN STOCK', bg: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: 'rgba(16, 185, 129, 0.3)' };
            case 'DRAFT':
                return { label: 'DRAFT', bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: 'rgba(245, 158, 11, 0.3)' };
            case 'CANCELLED':
                return { label: 'CANCELLED', bg: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8', border: 'rgba(148, 163, 184, 0.3)' };
            default:
                return { label: status, bg: 'rgba(255, 255, 255, 0.08)', color: '#ffffff', border: 'rgba(255, 255, 255, 0.15)' };
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Filter Toolbar */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1rem',
                backgroundColor: 'var(--color-surface, #1e2238)',
                border: '1px solid var(--color-border, #2d325a)',
                borderRadius: '12px',
                padding: '1rem 1.25rem'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: '240px' }}>
                    <span style={{ fontSize: '1.1rem', color: '#94a3b8' }}>🔍</span>
                    <input
                        type="text"
                        placeholder="Search GRN #, PO #, Vendor, Challan..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '8px 12px',
                            backgroundColor: 'rgba(0, 0, 0, 0.25)',
                            border: '1px solid var(--color-border, #2d325a)',
                            borderRadius: '8px',
                            color: '#ffffff',
                            fontSize: '0.88rem'
                        }}
                    />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    {/* Warehouse Filter */}
                    <select
                        value={warehouseFilter}
                        onChange={(e) => setWarehouseFilter(e.target.value)}
                        style={{
                            padding: '8px 12px',
                            backgroundColor: 'rgba(0, 0, 0, 0.25)',
                            border: '1px solid var(--color-border, #2d325a)',
                            borderRadius: '8px',
                            color: '#ffffff',
                            fontSize: '0.85rem'
                        }}
                    >
                        <option value="ALL">All Warehouses</option>
                        {warehouses.map(wh => (
                            <option key={wh.id} value={wh.id}>{wh.name}</option>
                        ))}
                    </select>

                    {/* Status Filter */}
                    <div style={{ display: 'flex', backgroundColor: 'rgba(0, 0, 0, 0.25)', borderRadius: '8px', padding: '3px', border: '1px solid var(--color-border, #2d325a)' }}>
                        {['ALL', 'POSTED', 'DRAFT', 'CANCELLED'].map((st) => (
                            <button
                                key={st}
                                onClick={() => setStatusFilter(st)}
                                style={{
                                    padding: '5px 12px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    backgroundColor: statusFilter === st ? '#38bdf8' : 'transparent',
                                    color: statusFilter === st ? '#0f172a' : '#94a3b8',
                                    fontWeight: statusFilter === st ? 600 : 500,
                                    fontSize: '0.78rem',
                                    cursor: 'pointer'
                                }}
                            >
                                {st}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={loadData}
                        style={{
                            padding: '8px 14px',
                            backgroundColor: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid var(--color-border, #2d325a)',
                            borderRadius: '8px',
                            color: '#94a3b8',
                            fontSize: '0.85rem',
                            cursor: 'pointer'
                        }}
                    >
                        🔄 Refresh
                    </button>
                </div>
            </div>

            {/* Error banner */}
            {errorMessage && (
                <div style={{
                    padding: '0.85rem 1.25rem',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '8px',
                    color: '#f87171',
                    fontSize: '0.85rem'
                }}>
                    ⚠️ {errorMessage}
                </div>
            )}

            {/* Table */}
            <div style={{
                backgroundColor: 'var(--color-surface, #1e2238)',
                border: '1px solid var(--color-border, #2d325a)',
                borderRadius: '12px',
                overflow: 'hidden'
            }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                    <thead>
                        <tr style={{ backgroundColor: 'rgba(0, 0, 0, 0.35)', borderBottom: '1px solid var(--color-border, #2d325a)' }}>
                            <th style={{ padding: '12px 16px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>GRN Number</th>
                            <th style={{ padding: '12px 16px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Purchase Order</th>
                            <th style={{ padding: '12px 16px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Vendor</th>
                            <th style={{ padding: '12px 16px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Warehouse</th>
                            <th style={{ padding: '12px 16px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Receipt Date</th>
                            <th style={{ padding: '12px 16px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Reference / Challan</th>
                            <th style={{ padding: '12px 16px', textAlign: 'right', color: '#94a3b8', fontWeight: 600 }}>Accepted / Rejected</th>
                            <th style={{ padding: '12px 16px', textAlign: 'center', color: '#94a3b8', fontWeight: 600 }}>Status</th>
                            <th style={{ padding: '12px 16px', textAlign: 'right', color: '#94a3b8', fontWeight: 600 }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={9} style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                                    ⏳ Loading goods receipts...
                                </td>
                            </tr>
                        ) : receipts.length === 0 ? (
                            <tr>
                                <td colSpan={9} style={{ textAlign: 'center', padding: '3.5rem 1rem', color: '#94a3b8' }}>
                                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📦</div>
                                    <div style={{ fontSize: '1rem', fontWeight: 600, color: '#ffffff' }}>No Goods Receipts Found</div>
                                    <div style={{ fontSize: '0.85rem', marginTop: '4px' }}>
                                        Receive goods against approved purchase orders to create goods receipt records.
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            receipts.map((grn, idx) => {
                                const badge = getStatusBadge(grn.status);
                                const totAccepted = grn.lines?.reduce((acc, l) => acc + (parseFloat(String(l.accepted_quantity)) || 0), 0) || 0;
                                const totRejected = grn.lines?.reduce((acc, l) => acc + (parseFloat(String(l.rejected_quantity)) || 0), 0) || 0;

                                return (
                                    <tr
                                        key={grn.id}
                                        onClick={() => onSelectReceipt && onSelectReceipt(grn.id)}
                                        style={{
                                            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                                            backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.01)',
                                            cursor: onSelectReceipt ? 'pointer' : 'default',
                                            transition: 'background-color 0.15s ease'
                                        }}
                                    >
                                        <td style={{ padding: '14px 16px', fontWeight: 600, color: '#38bdf8' }}>
                                            📥 {grn.number}
                                        </td>
                                        <td style={{ padding: '14px 16px' }}>
                                            {grn.parent_document_number ? (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (grn.parent_document && onSelectPO) {
                                                            onSelectPO(grn.parent_document);
                                                        }
                                                    }}
                                                    style={{
                                                        background: 'transparent',
                                                        border: 'none',
                                                        color: '#ffffff',
                                                        textDecoration: 'underline',
                                                        cursor: 'pointer',
                                                        fontWeight: 600,
                                                        fontSize: '0.85rem',
                                                        padding: 0
                                                    }}
                                                >
                                                    {grn.parent_document_number}
                                                </button>
                                            ) : (
                                                <span style={{ color: '#94a3b8' }}>N/A</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '14px 16px', color: '#ffffff', fontWeight: 500 }}>
                                            {grn.vendor_name || 'N/A'}
                                        </td>
                                        <td style={{ padding: '14px 16px', color: '#94a3b8' }}>
                                            {grn.warehouse_name || 'Main Warehouse'}
                                        </td>
                                        <td style={{ padding: '14px 16px', color: '#ffffff' }}>
                                            {grn.document_date || 'N/A'}
                                        </td>
                                        <td style={{ padding: '14px 16px', color: '#94a3b8' }}>
                                            {grn.reference_number || '—'}
                                        </td>
                                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                                            <span style={{ color: '#10b981', fontWeight: 600 }}>{totAccepted} accepted</span>
                                            {totRejected > 0 && (
                                                <span style={{ color: '#f87171', marginLeft: '6px', fontSize: '0.78rem' }}>
                                                    ({totRejected} rej)
                                                </span>
                                            )}
                                        </td>
                                        <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                                            <span style={{
                                                display: 'inline-block',
                                                padding: '4px 10px',
                                                borderRadius: '20px',
                                                fontSize: '0.72rem',
                                                fontWeight: 700,
                                                letterSpacing: '0.5px',
                                                backgroundColor: badge.bg,
                                                color: badge.color,
                                                border: `1px solid ${badge.border}`
                                            }}>
                                                {badge.label}
                                            </span>
                                        </td>
                                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                                            {grn.status === 'DRAFT' ? (
                                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                    <button
                                                        onClick={(e) => handlePostGRN(grn.id, e)}
                                                        disabled={actionLoading === grn.id}
                                                        style={{
                                                            padding: '5px 12px',
                                                            backgroundColor: '#10b981',
                                                            border: 'none',
                                                            borderRadius: '6px',
                                                            color: '#ffffff',
                                                            fontWeight: 600,
                                                            fontSize: '0.78rem',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        {actionLoading === grn.id ? 'Posting...' : 'Post Stock IN'}
                                                    </button>
                                                    <button
                                                        onClick={(e) => handleCancelGRN(grn.id, e)}
                                                        disabled={actionLoading === grn.id}
                                                        style={{
                                                            padding: '5px 10px',
                                                            backgroundColor: 'rgba(239, 68, 68, 0.15)',
                                                            border: '1px solid rgba(239, 68, 68, 0.3)',
                                                            borderRadius: '6px',
                                                            color: '#f87171',
                                                            fontWeight: 500,
                                                            fontSize: '0.78rem',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            ) : (
                                                <span style={{ color: '#64748b', fontSize: '0.78rem' }}>Complete</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
