import { useState } from 'react';
import { PageContainer, PageHeader } from '../../layouts/PageLayout';
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
    const { user } = useAuthStore();
    
    // Capability checking
    const canViewFinance = user?.permissions?.includes('finance.read') || user?.role === 'admin' || user?.role === 'super_admin';
    const canWriteFinance = user?.permissions?.includes('finance.write') || user?.role === 'admin' || user?.role === 'super_admin';

    if (!canViewFinance) {
        return (
            <PageContainer>
                <Card className="bg-red-50 border-red-200">
                    <div className="card-content p-6 text-red-600">
                        You do not have permission to access the Accounting & Finance module.
                    </div>
                </Card>
            </PageContainer>
        );
    }

    const tabs = [
        { id: 'overview', label: 'Overview' },
        { id: 'coa', label: 'Chart of Accounts' },
        { id: 'account_groups', label: 'Account Groups' },
        { id: 'fiscal_setup', label: 'Fiscal Setup' },
        { id: 'journals', label: 'Journals' },
        { id: 'receivables', label: 'Receivables' },
        { id: 'taxes', label: 'Taxes' },
        { id: 'cost_centers', label: 'Cost Centers' },
        { id: 'budgets', label: 'Budgets' },
        { id: 'cash_bank', label: 'Cash & Bank' },
        { id: 'vouchers', label: 'Vouchers' },
        { id: 'reports', label: 'Reports' },
    ];

    return (
        <PageContainer>
            <PageHeader title="Finance & Accounting" />
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
                    {activeTab === 'overview' && (
                        <div style={{ color: 'var(--color-text-muted)' }}>
                            <p>Select a tab above to manage financial data.</p>
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
        </PageContainer>
    );
}
