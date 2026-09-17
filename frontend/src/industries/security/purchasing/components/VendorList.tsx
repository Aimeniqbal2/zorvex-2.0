import React, { useState, useEffect } from 'react';
import { Button } from '../../../../components/ui/Button';
import { Card } from '../../../../components/ui/Card';
import { Input } from '../../../../components/ui/Input';
import { useToastStore } from '../../../../stores/toastStore';
import { 
    getVendors, getVendorCategories, deleteVendor, 
    type Vendor, type VendorCategory 
} from '../api';
import { VendorModal } from './VendorModal';

interface VendorListProps {
    onSelectVendor: (vendorId: string) => void;
}

export const VendorList: React.FC<VendorListProps> = ({ onSelectVendor }) => {
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [categories, setCategories] = useState<VendorCategory[]>([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    // Add / Edit Modal
    const [showModal, setShowModal] = useState(false);
    const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);

    useEffect(() => {
        loadData();
    }, [categoryFilter, statusFilter]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [vData, cData] = await Promise.all([
                getVendors({
                    search: search.trim() || undefined,
                    category: categoryFilter || undefined,
                    status: statusFilter || undefined
                }),
                getVendorCategories().catch(() => [])
            ]);
            setVendors(vData);
            setCategories(cData);
        } catch {
            useToastStore.getState().error('Failed to load vendors.');
        } finally {
            setLoading(false);
        }
    };

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        loadData();
    };

    const handleDeleteVendor = async (e: React.MouseEvent, id: string, name: string) => {
        e.stopPropagation();
        if (!window.confirm(`Are you sure you want to delete vendor "${name}"?`)) return;
        try {
            await deleteVendor(id);
            useToastStore.getState().success('Vendor deleted.');
            await loadData();
        } catch {
            useToastStore.getState().error('Failed to delete vendor.');
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Header with Title and Add Button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>Security Vendors & Suppliers</h2>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--color-text-muted)' }}>
                        Manage supplier profiles, uniform makers, CCTV providers, and contracted equipment vendors.
                    </p>
                </div>
                <Button 
                    variant="primary" 
                    onClick={() => { setEditingVendor(null); setShowModal(true); }}
                >
                    <i className='bx bx-plus'></i> Add Vendor
                </Button>
            </div>

            {/* Filter Bar */}
            <Card style={{ padding: '14px 16px', borderRadius: '10px' }}>
                <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ flex: 1, minWidth: '220px' }}>
                        <Input
                            placeholder="Search by vendor name, code, contact person, phone..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>

                    <div style={{ width: '180px' }}>
                        <select
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
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
                            <option value="">All Categories</option>
                            {categories.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ width: '150px' }}>
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
                            <option value="ACTIVE">Active</option>
                            <option value="PENDING_REVIEW">Pending Review</option>
                            <option value="INACTIVE">Inactive</option>
                            <option value="BLOCKED">Blocked</option>
                        </select>
                    </div>

                    <Button type="submit" variant="secondary" size="sm">
                        <i className='bx bx-search'></i> Search
                    </Button>
                </form>
            </Card>

            {/* Vendor Table */}
            <Card style={{ padding: '0px', borderRadius: '12px', overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: '36px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                        <i className='bx bx-loader-alt bx-spin' style={{ fontSize: '28px', marginBottom: '8px' }}></i>
                        <div>Loading vendors...</div>
                    </div>
                ) : vendors.length === 0 ? (
                    <div style={{ padding: '48px 16px', textAlign: 'center' }}>
                        <i className='bx bx-buildings' style={{ fontSize: '36px', color: 'var(--color-text-muted)', marginBottom: '8px' }}></i>
                        <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '4px' }}>No Vendors Found</div>
                        <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
                            Get started by creating your first vendor record or clear filters.
                        </div>
                        <Button variant="primary" size="sm" onClick={() => { setEditingVendor(null); setShowModal(true); }}>
                            <i className='bx bx-plus'></i> Add First Vendor
                        </Button>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
                            <thead>
                                <tr style={{ background: 'var(--color-surface-secondary)', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)', textAlign: 'left' }}>
                                    <th style={{ padding: '12px 16px' }}>Vendor</th>
                                    <th style={{ padding: '12px 16px' }}>Category</th>
                                    <th style={{ padding: '12px 16px' }}>Primary Contact</th>
                                    <th style={{ padding: '12px 16px' }}>Phone / Email</th>
                                    <th style={{ padding: '12px 16px' }}>Payment Terms</th>
                                    <th style={{ padding: '12px 16px' }}>Supplied Items</th>
                                    <th style={{ padding: '12px 16px' }}>Status</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {vendors.map(v => (
                                    <tr 
                                        key={v.id}
                                        onClick={() => onSelectVendor(v.id)}
                                        style={{ 
                                            borderBottom: '1px solid var(--color-border)', 
                                            cursor: 'pointer',
                                            transition: 'background 0.15s'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-surface-secondary)'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <td style={{ padding: '14px 16px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <div style={{ 
                                                    width: '34px', height: '34px', borderRadius: '8px', 
                                                    background: 'rgba(99, 102, 241, 0.15)', color: 'var(--color-primary, #6366f1)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' 
                                                }}>
                                                    <i className='bx bx-buildings'></i>
                                                </div>
                                                <div>
                                                    <strong style={{ color: 'var(--color-text)' }}>{v.name}</strong>
                                                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>
                                                        {v.code}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '14px 16px' }}>
                                            <span style={{ 
                                                padding: '3px 8px', borderRadius: '6px', 
                                                background: 'var(--color-surface-secondary)', 
                                                border: '1px solid var(--color-border)', 
                                                fontSize: '12px', color: 'var(--color-text)' 
                                            }}>
                                                {v.category_name || 'General Supplier'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '14px 16px' }}>
                                            {v.contact_person || <span style={{ color: 'var(--color-text-muted)' }}>—</span>}
                                        </td>
                                        <td style={{ padding: '14px 16px', fontSize: '12.5px' }}>
                                            <div>{v.phone || '—'}</div>
                                            <div style={{ color: 'var(--color-text-muted)' }}>{v.email}</div>
                                        </td>
                                        <td style={{ padding: '14px 16px', fontWeight: 600 }}>
                                            {v.payment_terms || 'Net 30'}
                                        </td>
                                        <td style={{ padding: '14px 16px' }}>
                                            <span style={{ 
                                                padding: '2px 8px', borderRadius: '6px', 
                                                background: 'rgba(99, 102, 241, 0.1)', 
                                                color: 'var(--color-primary)', fontWeight: 700, fontSize: '12px' 
                                            }}>
                                                {v.items_count || 0} items
                                            </span>
                                        </td>
                                        <td style={{ padding: '14px 16px' }}>
                                            <span style={{ 
                                                fontSize: '11px', padding: '2px 8px', borderRadius: '6px', 
                                                background: v.status === 'ACTIVE' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                                color: v.status === 'ACTIVE' ? '#10b981' : '#ef4444',
                                                border: `1px solid ${v.status === 'ACTIVE' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                                                fontWeight: 700
                                            }}>
                                                {v.status}
                                            </span>
                                        </td>
                                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                                            <div style={{ display: 'inline-flex', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                                                <Button 
                                                    variant="ghost" 
                                                    size="sm" 
                                                    onClick={() => onSelectVendor(v.id)}
                                                    title="Open Vendor Workspace"
                                                >
                                                    <i className='bx bx-right-arrow-alt' style={{ fontSize: '18px' }}></i>
                                                </Button>
                                                <button
                                                    type="button"
                                                    onClick={(e) => handleDeleteVendor(e, v.id, v.name)}
                                                    style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'transparent', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                    title="Delete Vendor"
                                                >
                                                    <i className='bx bx-trash'></i>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {/* Vendor Create/Edit Modal */}
            <VendorModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                onSaved={() => loadData()}
                vendor={editingVendor}
            />
        </div>
    );
};
