import React, { useState } from 'react';
import { PageContainer, PageHeader } from '../../layouts/PageLayout';
import { Card } from '../../components/ui/Card';
import { DocumentList } from './components/DocumentList';
import { ApprovalHistoryList } from './components/ApprovalHistoryList';
import { PendingApprovalsList } from './components/PendingApprovalsList';
import { useAuthStore } from '../../auth/authStore';

export const PurchasingModule: React.FC = () => {
    const [activeTab, setActiveTab] = useState<string>('PURCHASE_REQUEST');
    const { user } = useAuthStore();
    
    // Capability checking
    const canViewPurchasing = user?.permissions?.includes('purchasing.read') || user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'manager';

    if (!canViewPurchasing) {
        return (
            <PageContainer>
                <Card className="bg-red-50 border-red-200">
                    <div className="p-6 text-red-600">
                        You do not have permission to access the Purchasing module.
                    </div>
                </Card>
            </PageContainer>
        );
    }

    const tabs = [
        { id: 'PURCHASE_REQUEST', label: 'Purchase Requests' },
        { id: 'RFQ', label: 'RFQs' },
        { id: 'QUOTATION', label: 'Quotations' },
        { id: 'PURCHASE_ORDER', label: 'Purchase Orders' },
        { id: 'GOODS_RECEIPT', label: 'Goods Receipts' },
        { id: 'PURCHASE_RETURN', label: 'Returns' },
        { id: 'VENDOR_INVOICE', label: 'Vendor Invoices' },
        { id: 'PENDING_APPROVALS', label: 'Pending Approvals' },
        { id: 'APPROVAL_HISTORY', label: 'Approval History' },
    ];

    const renderContent = () => {
        if (activeTab === 'PENDING_APPROVALS') {
            return <PendingApprovalsList />;
        }
        if (activeTab === 'APPROVAL_HISTORY') {
            return <ApprovalHistoryList />;
        }
        return <DocumentList documentType={activeTab} />;
    };

    return (
        <PageContainer>
            <PageHeader title="Universal Purchasing" />
            
            <Card>
                <div style={{ padding: '16px', display: 'flex', gap: '16px', borderBottom: '1px solid var(--color-border)', flexWrap: 'wrap' }}>
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            style={{ 
                                padding: '8px 16px', 
                                borderBottom: activeTab === tab.id ? '2px solid var(--color-primary)' : 'none', 
                                cursor: 'pointer', 
                                background: 'none', 
                                borderTop: 'none', 
                                borderLeft: 'none', 
                                borderRight: 'none', 
                                color: activeTab === tab.id ? 'var(--color-primary)' : 'inherit', 
                                fontWeight: activeTab === tab.id ? 'bold' : 'normal' 
                            }}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
                
                <div style={{ padding: '16px' }}>
                    {renderContent()}
                </div>
            </Card>
        </PageContainer>
    );
};
