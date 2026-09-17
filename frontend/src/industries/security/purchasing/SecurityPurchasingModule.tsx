import React, { useState } from 'react';
import { Card } from '../../../components/ui/Card';
import { useAuthStore } from '../../../auth/authStore';
import { PurchasingDashboard } from './components/PurchasingDashboard';
import { VendorList } from './components/VendorList';
import { VendorWorkspace } from './components/VendorWorkspace';
import { PurchaseOrderList } from './components/PurchaseOrderList';
import { PurchaseOrderWorkspace } from './components/PurchaseOrderWorkspace';
import { GoodsReceiptList } from './components/GoodsReceiptList';
import { VendorBillList } from './components/VendorBillList';
import { AccountsPayableList } from './components/AccountsPayableList';
import { PurchasingReportsTab } from './components/PurchasingReportsTab';
import { VendorPerformanceTab } from './components/VendorPerformanceTab';
import { CRMProcurementDemandView } from './components/CRMProcurementDemandView';

export const SecurityPurchasingModule: React.FC = () => {
    const { user } = useAuthStore();
    const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
    const [selectedPoId, setSelectedPoId] = useState<string | null>(null);
    const [activeSection, setActiveSection] = useState<
        'dashboard' | 'vendors' | 'orders' | 'requests' | 'receipts' | 'bills' | 'payables' | 'reports' | 'performance' | 'crm_demand'
    >('dashboard');

    const canViewPurchasing = user?.permissions?.includes('purchasing.read') || user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'manager';

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
                    onBack={() => setSelectedPoId(null)}
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
                    onBack={() => setSelectedVendorId(null)}
                    onSelectPo={(poId) => setSelectedPoId(poId)}
                />
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', padding: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Navigation Pills */}
                <div style={{
                    display: 'flex',
                    gap: '8px',
                    borderBottom: '1px solid var(--color-border)',
                    paddingBottom: '12px',
                    overflowX: 'auto'
                }}>
                    <button
                        onClick={() => setActiveSection('dashboard')}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '8px',
                            border: '1px solid',
                            borderColor: activeSection === 'dashboard' ? 'var(--color-primary)' : 'var(--color-border)',
                            background: activeSection === 'dashboard' ? 'rgba(99, 102, 241, 0.15)' : 'var(--color-surface)',
                            color: activeSection === 'dashboard' ? 'var(--color-primary)' : 'var(--color-text)',
                            fontWeight: 700,
                            fontSize: '13px',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            display: 'flex', alignItems: 'center', gap: '6px'
                        }}
                    >
                        <i className='bx bx-pie-chart-alt-2'></i> Dashboard & KPIs
                    </button>
                    <button
                        onClick={() => setActiveSection('vendors')}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '8px',
                            border: '1px solid',
                            borderColor: activeSection === 'vendors' ? 'var(--color-primary)' : 'var(--color-border)',
                            background: activeSection === 'vendors' ? 'rgba(99, 102, 241, 0.15)' : 'var(--color-surface)',
                            color: activeSection === 'vendors' ? 'var(--color-primary)' : 'var(--color-text)',
                            fontWeight: 700,
                            fontSize: '13px',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            display: 'flex', alignItems: 'center', gap: '6px'
                        }}
                    >
                        <i className='bx bx-buildings'></i> Vendors & Suppliers
                    </button>
                    <button
                        onClick={() => setActiveSection('orders')}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '8px',
                            border: '1px solid',
                            borderColor: activeSection === 'orders' ? 'var(--color-primary)' : 'var(--color-border)',
                            background: activeSection === 'orders' ? 'rgba(99, 102, 241, 0.15)' : 'var(--color-surface)',
                            color: activeSection === 'orders' ? 'var(--color-primary)' : 'var(--color-text)',
                            fontWeight: 700,
                            fontSize: '13px',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            display: 'flex', alignItems: 'center', gap: '6px'
                        }}
                    >
                        <i className='bx bx-cart'></i> Purchase Orders
                    </button>
                    <button
                        onClick={() => setActiveSection('receipts')}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '8px',
                            border: '1px solid',
                            borderColor: activeSection === 'receipts' ? 'var(--color-primary)' : 'var(--color-border)',
                            background: activeSection === 'receipts' ? 'rgba(99, 102, 241, 0.15)' : 'var(--color-surface)',
                            color: activeSection === 'receipts' ? 'var(--color-primary)' : 'var(--color-text-muted)',
                            fontWeight: 700,
                            fontSize: '13px',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            display: 'flex', alignItems: 'center', gap: '6px'
                        }}
                    >
                        <i className='bx bx-box'></i> Goods Receipts (GRN)
                    </button>
                    <button
                        onClick={() => setActiveSection('bills')}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '8px',
                            border: '1px solid',
                            borderColor: activeSection === 'bills' ? 'var(--color-primary)' : 'var(--color-border)',
                            background: activeSection === 'bills' ? 'rgba(99, 102, 241, 0.15)' : 'var(--color-surface)',
                            color: activeSection === 'bills' ? 'var(--color-primary)' : 'var(--color-text-muted)',
                            fontWeight: 700,
                            fontSize: '13px',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            display: 'flex', alignItems: 'center', gap: '6px'
                        }}
                    >
                        <i className='bx bx-receipt'></i> Vendor Bills
                    </button>
                    <button
                        onClick={() => setActiveSection('payables')}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '8px',
                            border: '1px solid',
                            borderColor: activeSection === 'payables' ? 'var(--color-primary)' : 'var(--color-border)',
                            background: activeSection === 'payables' ? 'rgba(99, 102, 241, 0.15)' : 'var(--color-surface)',
                            color: activeSection === 'payables' ? 'var(--color-primary)' : 'var(--color-text-muted)',
                            fontWeight: 700,
                            fontSize: '13px',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            display: 'flex', alignItems: 'center', gap: '6px'
                        }}
                    >
                        <i className='bx bx-credit-card'></i> Accounts Payable
                    </button>
                    <button
                        onClick={() => setActiveSection('reports')}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '8px',
                            border: '1px solid',
                            borderColor: activeSection === 'reports' ? 'var(--color-primary)' : 'var(--color-border)',
                            background: activeSection === 'reports' ? 'rgba(99, 102, 241, 0.15)' : 'var(--color-surface)',
                            color: activeSection === 'reports' ? 'var(--color-primary)' : 'var(--color-text-muted)',
                            fontWeight: 700,
                            fontSize: '13px',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            display: 'flex', alignItems: 'center', gap: '6px'
                        }}
                    >
                        <i className='bx bx-bar-chart-alt-2'></i> Reports
                    </button>
                    <button
                        onClick={() => setActiveSection('performance')}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '8px',
                            border: '1px solid',
                            borderColor: activeSection === 'performance' ? 'var(--color-primary)' : 'var(--color-border)',
                            background: activeSection === 'performance' ? 'rgba(99, 102, 241, 0.15)' : 'var(--color-surface)',
                            color: activeSection === 'performance' ? 'var(--color-primary)' : 'var(--color-text-muted)',
                            fontWeight: 700,
                            fontSize: '13px',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            display: 'flex', alignItems: 'center', gap: '6px'
                        }}
                    >
                        <i className='bx bx-award'></i> Performance & Comparison
                    </button>
                    <button
                        onClick={() => setActiveSection('crm_demand')}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '8px',
                            border: '1px solid',
                            borderColor: activeSection === 'crm_demand' ? 'var(--color-primary)' : 'var(--color-border)',
                            background: activeSection === 'crm_demand' ? 'rgba(99, 102, 241, 0.15)' : 'var(--color-surface)',
                            color: activeSection === 'crm_demand' ? 'var(--color-primary)' : 'var(--color-text-muted)',
                            fontWeight: 700,
                            fontSize: '13px',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            display: 'flex', alignItems: 'center', gap: '6px'
                        }}
                    >
                        <i className='bx bx-git-pull-request'></i> CRM Demand
                    </button>
                </div>

                {/* Section Render */}
                {activeSection === 'dashboard' && (
                    <PurchasingDashboard 
                        onNavigate={(sec) => setActiveSection(sec)}
                        onSelectPo={(id) => setSelectedPoId(id)}
                        onSelectVendor={(id) => setSelectedVendorId(id)}
                    />
                )}

                {activeSection === 'vendors' && (
                    <VendorList onSelectVendor={(id) => setSelectedVendorId(id)} />
                )}

                {activeSection === 'orders' && (
                    <PurchaseOrderList 
                        onSelectPo={(id) => setSelectedPoId(id)}
                        onOpenVendor={(vId) => setSelectedVendorId(vId)}
                    />
                )}

                {activeSection === 'requests' && (
                    <Card style={{ padding: '36px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                        <i className='bx bx-git-pull-request' style={{ fontSize: '36px', marginBottom: '8px', opacity: 0.5 }}></i>
                        <h4 style={{ margin: '0 0 6px 0', fontSize: '15px' }}>Purchase Requests</h4>
                        <p style={{ margin: 0, fontSize: '13px' }}>
                            Internal store requisition and departmental equipment purchase requests.
                        </p>
                    </Card>
                )}

                {activeSection === 'receipts' && (
                    <GoodsReceiptList 
                        onSelectPO={(poId) => setSelectedPoId(poId)}
                    />
                )}

                {activeSection === 'bills' && (
                    <VendorBillList />
                )}

                {activeSection === 'payables' && (
                    <AccountsPayableList />
                )}

                {activeSection === 'reports' && (
                    <PurchasingReportsTab />
                )}

                {activeSection === 'performance' && (
                    <VendorPerformanceTab />
                )}

                {activeSection === 'crm_demand' && (
                    <CRMProcurementDemandView />
                )}

            </div>
        </div>
    );
};


