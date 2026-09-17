import React, { useState, useEffect } from 'react';
import { Button } from '../../../../components/ui/Button';
import { Card } from '../../../../components/ui/Card';
import { Input } from '../../../../components/ui/Input';
import { useToastStore } from '../../../../stores/toastStore';
import { 
    getPurchaseOrders, getVendors, 
    type PurchaseOrder, type Vendor 
} from '../api';
import { PurchaseOrderModal } from './PurchaseOrderModal';

interface PurchaseOrderListProps {
    onSelectPo: (poId: string) => void;
    onOpenVendor?: (vendorId: string) => void;
}

export const PurchaseOrderList: React.FC<PurchaseOrderListProps> = ({ 
    onSelectPo,
    onOpenVendor 
}) => {
    const [orders, setOrders] = useState<PurchaseOrder[]>([]);
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [search, setSearch] = useState('');
    const [vendorFilter, setVendorFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    // Modal
    const [showCreateModal, setShowCreateModal] = useState(false);

    useEffect(() => {
        loadData();
    }, [vendorFilter, statusFilter]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [poData, vData] = await Promise.all([
                getPurchaseOrders({
                    search: search.trim() || undefined,
                    vendor: vendorFilter || undefined,
                    status: statusFilter || undefined
                }),
                getVendors().catch(() => [])
            ]);
            setOrders(poData);
            setVendors(vData);
        } catch {
            useToastStore.getState().error('Failed to load purchase orders.');
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        loadData();
    };

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'APPROVED':
                return { bg: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: 'rgba(16, 185, 129, 0.3)' };
            case 'PENDING_APPROVAL':
                return { bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: 'rgba(245, 158, 11, 0.3)' };
            case 'SENT':
                return { bg: 'rgba(99, 102, 241, 0.15)', color: 'var(--color-primary, #6366f1)', border: 'rgba(99, 102, 241, 0.3)' };
            case 'CANCELLED':
            case 'REJECTED':
                return { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: 'rgba(239, 68, 68, 0.3)' };
            default:
                return { bg: 'var(--color-surface-secondary)', color: 'var(--color-text-muted)', border: 'var(--color-border)' };
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Title & Action Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>Purchase Orders & Commitments</h2>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--color-text-muted)' }}>
                        Create, track, review, and approve purchase orders for equipment, uniforms, and security supplies.
                    </p>
                </div>
                <Button variant="primary" onClick={() => setShowCreateModal(true)}>
                    <i className='bx bx-plus'></i> Create Purchase Order
                </Button>
            </div>

            {/* Filter Card */}
            <Card style={{ padding: '14px 16px', borderRadius: '10px' }}>
                <form onSubmit={handleSearch} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ flex: 1, minWidth: '220px' }}>
                        <Input
                            placeholder="Search by PO number, reference, or supplier..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>

                    <div style={{ width: '200px' }}>
                        <select
                            value={vendorFilter}
                            onChange={(e) => setVendorFilter(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '9px 12px',
                                borderRadius: '8px',
                                border: '1px solid var(--color-border)',
                                background: 'var(--color-surface)',
                                color: 'var(--color-text)',
                                fontSize: '13px'
                            }}
                        >
                            <option value="">All Suppliers / Vendors</option>
                            {vendors.map(v => (
                                <option key={v.id} value={v.id}>{v.name}</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ width: '170px' }}>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '9px 12px',
                                borderRadius: '8px',
                                border: '1px solid var(--color-border)',
                                background: 'var(--color-surface)',
                                color: 'var(--color-text)',
                                fontSize: '13px'
                            }}
                        >
                            <option value="">All Statuses</option>
                            <option value="DRAFT">Draft</option>
                            <option value="PENDING_APPROVAL">Pending Approval</option>
                            <option value="APPROVED">Approved</option>
                            <option value="SENT">Sent / Confirmed</option>
                            <option value="PARTIALLY_RECEIVED">Partially Received</option>
                            <option value="RECEIVED">Received</option>
                            <option value="CANCELLED">Cancelled</option>
                        </select>
                    </div>

                    <Button type="submit" variant="secondary" size="sm">
                        <i className='bx bx-search'></i> Search
                    </Button>
                </form>
            </Card>

            {/* PO List Table */}
            <Card style={{ padding: '0px', borderRadius: '12px', overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: '36px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                        <i className='bx bx-loader-alt bx-spin' style={{ fontSize: '28px', marginBottom: '8px' }}></i>
                        <div>Loading purchase orders...</div>
                    </div>
                ) : orders.length === 0 ? (
                    <div style={{ padding: '48px 16px', textAlign: 'center' }}>
                        <i className='bx bx-cart' style={{ fontSize: '36px', color: 'var(--color-text-muted)', marginBottom: '8px' }}></i>
                        <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '4px' }}>No Purchase Orders Found</div>
                        <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
                            Create your first purchase order to request equipment from vendors.
                        </div>
                        <Button variant="primary" size="sm" onClick={() => setShowCreateModal(true)}>
                            <i className='bx bx-plus'></i> Create First PO
                        </Button>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
                            <thead>
                                <tr style={{ background: 'var(--color-surface-secondary)', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)', textAlign: 'left' }}>
                                    <th style={{ padding: '12px 16px' }}>PO Number</th>
                                    <th style={{ padding: '12px 16px' }}>Vendor / Supplier</th>
                                    <th style={{ padding: '12px 16px' }}>Order Date</th>
                                    <th style={{ padding: '12px 16px' }}>Expected Delivery</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Grand Total</th>
                                    <th style={{ padding: '12px 16px' }}>Status</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orders.map(po => {
                                    const style = getStatusStyle(po.status);
                                    return (
                                        <tr 
                                            key={po.id}
                                            onClick={() => onSelectPo(po.id)}
                                            style={{ 
                                                borderBottom: '1px solid var(--color-border)', 
                                                cursor: 'pointer',
                                                transition: 'background 0.15s'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-surface-secondary)'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <td style={{ padding: '14px 16px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <i className='bx bx-cart' style={{ color: 'var(--color-primary)', fontSize: '18px' }}></i>
                                                    <strong style={{ color: 'var(--color-text)' }}>{po.number}</strong>
                                                </div>
                                            </td>
                                            <td style={{ padding: '14px 16px' }}>
                                                <div 
                                                    onClick={(e) => {
                                                        if (po.vendor && onOpenVendor) {
                                                            e.stopPropagation();
                                                            onOpenVendor(po.vendor);
                                                        }
                                                    }}
                                                    style={{ fontWeight: 600, color: po.vendor ? 'var(--color-primary)' : 'inherit' }}
                                                >
                                                    {po.vendor_name || po.crm_entity_name || 'Vendor'}
                                                </div>
                                                {po.warehouse_name && (
                                                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                                                        Dest: {po.warehouse_name}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: '14px 16px' }}>
                                                {new Date(po.document_date).toLocaleDateString()}
                                            </td>
                                            <td style={{ padding: '14px 16px' }}>
                                                {po.expected_delivery_date ? new Date(po.expected_delivery_date).toLocaleDateString() : '—'}
                                            </td>
                                            <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--color-primary)' }}>
                                                PKR {Number(po.total_amount || 0).toLocaleString()}
                                            </td>
                                            <td style={{ padding: '14px 16px' }}>
                                                <span style={{ 
                                                    fontSize: '11px', padding: '3px 8px', borderRadius: '6px', 
                                                    background: style.bg, color: style.color, border: `1px solid ${style.border}`,
                                                    fontWeight: 700
                                                }}>
                                                    {po.status}
                                                </span>
                                            </td>
                                            <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                                                <Button 
                                                    variant="ghost" 
                                                    size="sm" 
                                                    onClick={() => onSelectPo(po.id)}
                                                    title="Open PO Workspace"
                                                >
                                                    <i className='bx bx-right-arrow-alt' style={{ fontSize: '18px' }}></i>
                                                </Button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {/* Create PO Modal */}
            <PurchaseOrderModal
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                onSaved={(newPo) => {
                    loadData();
                    onSelectPo(newPo.id);
                }}
            />
        </div>
    );
};
