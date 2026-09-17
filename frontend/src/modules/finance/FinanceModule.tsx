import { useState } from 'react';
import { Card } from '../../components/ui/Card';
import ChartOfAccountsView from './components/ChartOfAccountsView';
import JournalsView from './components/JournalsView';
import ReportsView from './components/ReportsView';
import AccountGroupsView from './components/AccountGroupsView';
import FiscalSetupView from './components/FiscalSetupView';
import TaxSetupView from './components/TaxSetupView';
import CostCentersView from './components/CostCentersView';
import BudgetsView from './components/BudgetsView';
import ReceivablesView from './components/ReceivablesView';
import CashBankView from './components/CashBankView';
import VouchersView from './components/VouchersView';

import { useAuthStore } from '../../auth/authStore';

export default function FinanceModule() {
    const [activeTab, setActiveTab] = useState('overview');
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const { user } = useAuthStore();
    
    // Capability checking
    const canViewFinance = user?.permissions?.includes('finance.read') || user?.role === 'admin' || user?.role === 'super_admin';
    const canWriteFinance = user?.permissions?.includes('finance.write') || user?.role === 'admin' || user?.role === 'super_admin';

    if (!canViewFinance) {
        return (
            <div className="module-container">
                <Card className="bg-red-50 border-red-200">
                    <div className="card-content p-6 text-red-600">
                        You do not have permission to access the Accounting & Finance module.
                    </div>
                </Card>
            </div>
        );
    }

    const tabs = [
        { id: 'overview', label: 'Overview', icon: 'bx-grid-alt' },
        { id: 'coa', label: 'Chart of Accounts', icon: 'bx-book' },
        { id: 'account_groups', label: 'Account Groups', icon: 'bx-layer' },
        { id: 'fiscal_setup', label: 'Fiscal Setup', icon: 'bx-calendar' },
        { id: 'journals', label: 'Journals', icon: 'bx-book-content' },
        { id: 'receivables', label: 'Receivables', icon: 'bx-money' },
        { id: 'taxes', label: 'Taxes', icon: 'bx-receipt' },
        { id: 'cost_centers', label: 'Cost Centers', icon: 'bx-building' },
        { id: 'budgets', label: 'Budgets', icon: 'bx-pie-chart-alt' },
        { id: 'cash_bank', label: 'Cash & Bank', icon: 'bx-wallet' },
        { id: 'vouchers', label: 'Vouchers', icon: 'bx-file' },
        { id: 'reports', label: 'Reports', icon: 'bx-bar-chart-alt-2' },
    ];

    return (
        <div className="module-container">
            <div className="module-header">
                <div className="header-content">
                    <button className="sidebar-toggle-btn" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
                        <i className={`bx ${isSidebarOpen ? 'bx-menu-alt-left' : 'bx-menu'}`}></i>
                    </button>
                    <div>
                        <h1>Finance & Accounting</h1>
                        <p>Manage chart of accounts, journals, budgets, and financial reports.</p>
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
                                {activeTab === 'overview' && (
                                    <div style={{ color: 'var(--color-text-muted)' }}>
                                        <p>Select a tab from the sidebar to manage financial data.</p>
                                    </div>
                                )}
                                {activeTab === 'coa' && <ChartOfAccountsView />}
                                {activeTab === 'account_groups' && <AccountGroupsView />}
                                {activeTab === 'fiscal_setup' && <FiscalSetupView />}
                                {activeTab === 'journals' && <JournalsView canWrite={canWriteFinance} />}
                                {activeTab === 'receivables' && <ReceivablesView canWrite={canWriteFinance} />}
                                {activeTab === 'taxes' && <TaxSetupView />}
                                {activeTab === 'cost_centers' && <CostCentersView />}
                                {activeTab === 'budgets' && <BudgetsView />}
                                {activeTab === 'cash_bank' && <CashBankView />}
                                {activeTab === 'vouchers' && <VouchersView />}
                                {activeTab === 'reports' && <ReportsView />}
                            </div>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}
