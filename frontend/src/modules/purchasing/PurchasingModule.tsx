import React, { useState } from 'react';
import { Card } from '../../components/ui/Card';
import { DocumentList } from './components/DocumentList';
import { ApprovalHistoryList } from './components/ApprovalHistoryList';
import { PendingApprovalsList } from './components/PendingApprovalsList';
import { useAuthStore } from '../../auth/authStore';

export const PurchasingModule: React.FC = () => {
    const [activeTab, setActiveTab] = useState<string>('PURCHASE_REQUEST');
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const { user } = useAuthStore();
    
    // Capability checking
    const canViewPurchasing = user?.permissions?.includes('purchasing.read') || user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'manager';

    if (!canViewPurchasing) {
        return (
            <div className="module-container">
                <Card className="bg-red-50 border-red-200">
                    <div className="p-6 text-red-600">
                        You do not have permission to access the Purchasing module.
                    </div>
                </Card>
            </div>
        );
    }

    const tabs = [
        { id: 'PURCHASE_REQUEST', label: 'Purchase Requests', icon: 'bx-git-pull-request' },
        { id: 'RFQ', label: 'RFQs', icon: 'bx-comment-detail' },
        { id: 'QUOTATION', label: 'Quotations', icon: 'bx-file' },
        { id: 'PURCHASE_ORDER', label: 'Purchase Orders', icon: 'bx-receipt' },
        { id: 'GOODS_RECEIPT', label: 'Goods Receipts', icon: 'bx-box' },
        { id: 'PURCHASE_RETURN', label: 'Returns', icon: 'bx-undo' },
        { id: 'VENDOR_INVOICE', label: 'Vendor Invoices', icon: 'bx-file-blank' },
        { id: 'PENDING_APPROVALS', label: 'Pending Approvals', icon: 'bx-time-five' },
        { id: 'APPROVAL_HISTORY', label: 'Approval History', icon: 'bx-history' },
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
        <div className="module-container">
            <div className="module-header">
                <div className="header-content">
                    <button className="sidebar-toggle-btn" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
                        <i className={`bx ${isSidebarOpen ? 'bx-menu-alt-left' : 'bx-menu'}`}></i>
                    </button>
                    <div>
                        <h1>Universal Purchasing</h1>
                        <p>Manage purchase requests, orders, receipts, and vendor invoices.</p>
                    </div>
                </div>
            </div>

            <div className="module-body-layout">
                <div className={`module-sidebar ${isSidebarOpen ? 'open' : 'closed'}`}>
                    <div className="module-sidebar-nav">
                        {tabs.map(tab => (
                            <button 
                                key={tab.id}
                                className={`sidebar-nav-btn ${activeTab === tab.id ? 'active' : ''}`}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                <i className={`bx ${tab.icon}`}></i>
                                <span>{tab.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="module-main">
                    <div className="module-content">
                        <Card>
                            <div style={{ padding: '24px' }}>
                                {renderContent()}
                            </div>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
};
