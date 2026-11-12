import React, { useState, useEffect } from 'react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { useAuthStore } from '../../../auth/authStore';
import { useAppStore } from '../../../stores/appStore';
import { VendorList } from './components/VendorList';
import { VendorWorkspace } from './components/VendorWorkspace';
import { PurchaseOrderList } from './components/PurchaseOrderList';
import { PurchaseOrderWorkspace } from './components/PurchaseOrderWorkspace';
import { GoodsReceiptList } from './components/GoodsReceiptList';
import { VendorBillList } from './components/VendorBillList';
import { PurchasingReportsTab } from './components/PurchasingReportsTab';
import { PurchaseOrderModal } from './components/PurchaseOrderModal';
import { VendorModal } from './components/VendorModal';
import { getPurchasingDashboardKPIs, type PurchasingDashboardKPIs } from './api';

export const SecurityPurchasingModule: React.FC = () => {
    const { user } = useAuthStore();
    const { enabledModules, userModules } = useAppStore();
    const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
    const [selectedPoId, setSelectedPoId] = useState<string | null>(null);
    const [activeSection, setActiveSection] = useState<'orders' | 'vendors' | 'receipts' | 'bills' | 'reports'>('orders');

    // Quick Modals from Header
    const [isCreatePoOpen, setIsCreatePoOpen] = useState(false);
    const [isCreateVendorOpen, setIsCreateVendorOpen] = useState(false);

    // KPI Metrics
    const [kpis, setKpis] = useState<PurchasingDashboardKPIs | null>(null);
    const [loadingKpis, setLoadingKpis] = useState(false);

    const hasModuleGrant =
        Boolean(enabledModules?.purchasing) ||
        userModules.includes('purchasing');

    const canViewPurchasing =
        hasModuleGrant ||
        user?.permissions?.includes('purchasing.read') ||
        user?.role === 'admin' ||
        user?.role === 'super_admin' ||
        user?.role === 'manager';

    const loadKPIs = async () => {
        setLoadingKpis(true);
        try {
            const data = await getPurchasingDashboardKPIs();
            setKpis(data);
        } catch {
            // Silently fall back to default or empty
        } finally {
            setLoadingKpis(false);
        }
    };

    useEffect(() => {
        if (canViewPurchasing) {
            loadKPIs();
        }
    }, [canViewPurchasing]);

    if (!canViewPurchasing) {
        return (
            <div style={{ padding: '24px' }}>
                <Card style={{ padding: '24px', borderColor: 'rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.05)' }}>
                    <div style={{ color: '#ef4444', fontWeight: 600 }}>
                        <i className='bx bx-lock-alt'></i> You do not have permission to access the Purchasing & Vendors module.
                    </div>
                </Card>
            </div>
        );
    }

    // Detail view: PO Workspace
    if (selectedPoId) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', padding: '20px' }}>
                <PurchaseOrderWorkspace 
                    poId={selectedPoId} 
                    onBack={() => {
                        setSelectedPoId(null);
                        loadKPIs();
                    }}
                    onOpenVendor={(vId) => {
                        setSelectedPoId(null);
                        setSelectedVendorId(vId);
                    }}
                />
            </div>
        );
    }

    // Detail view: Vendor Workspace
    if (selectedVendorId) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', padding: '20px' }}>
                <VendorWorkspace 
                    vendorId={selectedVendorId} 
                    onBack={() => {
                        setSelectedVendorId(null);
                        loadKPIs();
                    }}
                    onSelectPo={(poId) => setSelectedPoId(poId)}
                />
            </div>
        );
    }

    const formatCurrency = (val?: string | number) => {
        const num = Number(val || 0);
        return `PKR ${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', padding: '20px', gap: '20px' }}>
            {/* Top Header & Fast Actions */}
            <div style={{
                background: 'var(--color-surface, #ffffff)',
                border: '1px solid var(--color-border, #e5e7eb)',
                borderRadius: '12px',
                padding: '20px 24px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                                width: '42px', height: '42px', borderRadius: '10px',
                                background: 'rgba(99, 102, 241, 0.12)', color: 'var(--color-primary, #6366f1)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px'
                            }}>
                                <i className="bx bx-cart-alt"></i>
                            </div>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-text, #111827)' }}>
                                    Purchasing & Vendor Management
                                </h2>
                                <p style={{ margin: '2px 0 0', color: 'var(--color-text-muted, #6b7280)', fontSize: '0.875rem' }}>
                                    Manage suppliers, purchase orders, store goods receipts (GRN), and vendor bills.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <Button 
                            variant="secondary" 
                            onClick={() => setIsCreateVendorOpen(true)}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            <i className="bx bx-user-plus"></i> + Add Supplier
                        </Button>
                        <Button 
                            variant="primary" 
                            onClick={() => setIsCreatePoOpen(true)}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            <i className="bx bx-plus-circle"></i> + New Purchase Order
                        </Button>
                    </div>
                </div>

                {/* Workflow Helper Strip */}
                <div style={{
                    marginTop: '16px',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: 'var(--color-surface-subtle, #f9fafb)',
                    border: '1px solid var(--color-border, #e5e7eb)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                    fontSize: '12.5px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-muted, #6b7280)' }}>
                        <span style={{ fontWeight: 600, color: 'var(--color-text, #111827)' }}>
                            <i className="bx bx-git-commit" style={{ marginRight: '4px', color: 'var(--color-primary)' }}></i>
                            Purchasing Flow:
                        </span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <strong>1.</strong> Create Purchase Order
                        </span>
                        <span>➔</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <strong>2.</strong> Receive Goods to Store (GRN)
                        </span>
                        <span>➔</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <strong>3.</strong> Process Bill & Payment
                        </span>
                    </div>

                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <span style={{ fontSize: '11.5px', color: '#10b981', fontWeight: 600, background: 'rgba(16, 185, 129, 0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                            <i className="bx bx-check-circle" style={{ marginRight: '3px' }}></i> GRN auto-updates Store Inventory
                        </span>
                    </div>
                </div>

                {/* KPI Metrics */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '14px',
                    marginTop: '16px'
                }}>
                    <div style={{
                        padding: '14px 16px',
                        borderRadius: '10px',
                        background: 'var(--color-surface-subtle, #f9fafb)',
                        border: '1px solid var(--color-border, #e5e7eb)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px'
                    }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted, #6b7280)', textTransform: 'uppercase' }}>
                            Open Purchase Orders
                        </span>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                            <span style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-primary, #6366f1)' }}>
                                {loadingKpis ? '...' : (kpis?.open_purchase_orders_count ?? 0)}
                            </span>
                            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                {kpis?.open_purchase_orders_value ? formatCurrency(kpis.open_purchase_orders_value) : ''}
                            </span>
                        </div>
                    </div>

                    <div style={{
                        padding: '14px 16px',
                        borderRadius: '10px',
                        background: 'var(--color-surface-subtle, #f9fafb)',
                        border: '1px solid var(--color-border, #e5e7eb)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px'
                    }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted, #6b7280)', textTransform: 'uppercase' }}>
                            Pending Store Deliveries
                        </span>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                            <span style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f59e0b' }}>
                                {loadingKpis ? '...' : (kpis?.pending_deliveries_count ?? 0)}
                            </span>
                            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                awaiting GRN intake
                            </span>
                        </div>
                    </div>

                    <div style={{
                        padding: '14px 16px',
                        borderRadius: '10px',
                        background: 'var(--color-surface-subtle, #f9fafb)',
                        border: '1px solid var(--color-border, #e5e7eb)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px'
                    }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted, #6b7280)', textTransform: 'uppercase' }}>
                            Approved / Posted Bills
                        </span>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                            <span style={{ fontSize: '1.4rem', fontWeight: 700, color: '#10b981' }}>
                                {loadingKpis ? '...' : (kpis?.posted_bills_count ?? 0)}
                            </span>
                            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                supplier bills
                            </span>
                        </div>
                    </div>

                    <div style={{
                        padding: '14px 16px',
                        borderRadius: '10px',
                        background: 'var(--color-surface-subtle, #f9fafb)',
                        border: '1px solid var(--color-border, #e5e7eb)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px'
                    }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted, #6b7280)', textTransform: 'uppercase' }}>
                            Outstanding Payables
                        </span>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                            <span style={{ fontSize: '1.4rem', fontWeight: 700, color: '#ef4444' }}>
                                {loadingKpis ? '...' : formatCurrency(kpis?.outstanding_payables || 0)}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Streamlined Navigation Tabs */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid var(--color-border, #e5e7eb)',
                paddingBottom: '4px',
                flexWrap: 'wrap',
                gap: '8px'
            }}>
                <div style={{ display: 'flex', gap: '8px', overflowX: 'auto' }}>
                    <button
                        onClick={() => setActiveSection('orders')}
                        style={{
                            padding: '9px 18px',
                            borderRadius: '8px',
                            border: '1px solid',
                            borderColor: activeSection === 'orders' ? 'var(--color-primary, #6366f1)' : 'var(--color-border, #e5e7eb)',
                            background: activeSection === 'orders' ? 'rgba(99, 102, 241, 0.12)' : 'var(--color-surface, #ffffff)',
                            color: activeSection === 'orders' ? 'var(--color-primary, #6366f1)' : 'var(--color-text, #374151)',
                            fontWeight: activeSection === 'orders' ? 700 : 500,
                            fontSize: '13.5px',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '7px',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <i className='bx bx-cart' style={{ fontSize: '16px' }}></i>
                        Purchase Orders
                    </button>

                    <button
                        onClick={() => setActiveSection('vendors')}
                        style={{
                            padding: '9px 18px',
                            borderRadius: '8px',
                            border: '1px solid',
                            borderColor: activeSection === 'vendors' ? 'var(--color-primary, #6366f1)' : 'var(--color-border, #e5e7eb)',
                            background: activeSection === 'vendors' ? 'rgba(99, 102, 241, 0.12)' : 'var(--color-surface, #ffffff)',
                            color: activeSection === 'vendors' ? 'var(--color-primary, #6366f1)' : 'var(--color-text, #374151)',
                            fontWeight: activeSection === 'vendors' ? 700 : 500,
                            fontSize: '13.5px',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '7px',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <i className='bx bx-buildings' style={{ fontSize: '16px' }}></i>
                        Suppliers & Vendors
                    </button>

                    <button
                        onClick={() => setActiveSection('receipts')}
                        style={{
                            padding: '9px 18px',
                            borderRadius: '8px',
                            border: '1px solid',
                            borderColor: activeSection === 'receipts' ? 'var(--color-primary, #6366f1)' : 'var(--color-border, #e5e7eb)',
                            background: activeSection === 'receipts' ? 'rgba(99, 102, 241, 0.12)' : 'var(--color-surface, #ffffff)',
                            color: activeSection === 'receipts' ? 'var(--color-primary, #6366f1)' : 'var(--color-text, #374151)',
                            fontWeight: activeSection === 'receipts' ? 700 : 500,
                            fontSize: '13.5px',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '7px',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <i className='bx bx-box' style={{ fontSize: '16px' }}></i>
                        Goods Receipts (GRN)
                    </button>

                    <button
                        onClick={() => setActiveSection('bills')}
                        style={{
                            padding: '9px 18px',
                            borderRadius: '8px',
                            border: '1px solid',
                            borderColor: activeSection === 'bills' ? 'var(--color-primary, #6366f1)' : 'var(--color-border, #e5e7eb)',
                            background: activeSection === 'bills' ? 'rgba(99, 102, 241, 0.12)' : 'var(--color-surface, #ffffff)',
                            color: activeSection === 'bills' ? 'var(--color-primary, #6366f1)' : 'var(--color-text, #374151)',
                            fontWeight: activeSection === 'bills' ? 700 : 500,
                            fontSize: '13.5px',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '7px',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <i className='bx bx-receipt' style={{ fontSize: '16px' }}></i>
                        Vendor Bills (3-Way Match)
                    </button>
                </div>

                <div>
                    <button
                        onClick={() => setActiveSection(activeSection === 'reports' ? 'orders' : 'reports')}
                        style={{
                            padding: '7px 14px',
                            borderRadius: '6px',
                            border: '1px solid var(--color-border, #e5e7eb)',
                            background: activeSection === 'reports' ? 'var(--color-surface-secondary, #f1f5f9)' : 'transparent',
                            color: 'var(--color-text-muted, #6b7280)',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '5px'
                        }}
                    >
                        <i className='bx bx-bar-chart-alt-2'></i>
                        {activeSection === 'reports' ? 'Close Reports' : 'Purchasing Reports'}
                    </button>
                </div>
            </div>

            {/* Active Content Rendering */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {activeSection === 'orders' && (
                    <PurchaseOrderList 
                        onSelectPo={(id) => setSelectedPoId(id)}
                        onOpenVendor={(vId) => setSelectedVendorId(vId)}
                    />
                )}

                {activeSection === 'vendors' && (
                    <VendorList onSelectVendor={(id) => setSelectedVendorId(id)} />
                )}

                {activeSection === 'receipts' && (
                    <GoodsReceiptList 
                        onSelectPO={(poId) => setSelectedPoId(poId)}
                    />
                )}

                {activeSection === 'bills' && (
                    <VendorBillList />
                )}

                {activeSection === 'reports' && (
                    <PurchasingReportsTab />
                )}
            </div>

            {/* Global Header Modals */}
            {isCreatePoOpen && (
                <PurchaseOrderModal
                    isOpen={isCreatePoOpen}
                    onClose={() => setIsCreatePoOpen(false)}
                    onSaved={(po) => {
                        setIsCreatePoOpen(false);
                        setSelectedPoId(po.id);
                        loadKPIs();
                    }}
                />
            )}

            {isCreateVendorOpen && (
                <VendorModal
                    isOpen={isCreateVendorOpen}
                    onClose={() => setIsCreateVendorOpen(false)}
                    onSaved={(vendor) => {
                        setIsCreateVendorOpen(false);
                        setSelectedVendorId(vendor.id);
                        loadKPIs();
                    }}
                />
            )}
        </div>
    );
};
