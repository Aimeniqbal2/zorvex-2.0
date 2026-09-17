import React, { useState } from 'react';
import { ExecutiveFinanceDashboardTab } from './components/ExecutiveFinanceDashboardTab';
import { FinancialControlsTab } from './components/FinancialControlsTab';
import { FinancialStatementsTab } from './components/FinancialStatementsTab';
import { ProfitabilityWorkspaceTab } from './components/ProfitabilityWorkspaceTab';
import { TreasuryDashboardTab } from './components/TreasuryDashboardTab';
import { VouchersTab } from './components/VouchersTab';
import { ExpensesTab } from './components/ExpensesTab';
import { FinanceSetupTab } from './components/FinanceSetupTab';
import { BillingSheetsTab } from './components/BillingSheetsTab';
import { ClientInvoicesTab } from './components/ClientInvoicesTab';
import { PurchasingIntegrationTab } from './components/PurchasingIntegrationTab';
import { PayrollFinanceTab } from './components/PayrollFinanceTab';
import { TaxManagementTab } from './components/TaxManagementTab';
import { GeneralLedgerTab } from './components/GeneralLedgerTab';

interface TabConfig {
  id: string;
  label: string;
  icon: string;
}

const TABS: TabConfig[] = [
  { id: 'executive_dashboard', label: 'Executive Overview', icon: 'bx bx-bar-chart-alt-2' },
  { id: 'billing_sheets', label: 'Billing Sheets', icon: 'bx bx-spreadsheet' },
  { id: 'client_invoices', label: 'Client Invoices', icon: 'bx bx-receipt' },
  { id: 'ar_recovery', label: 'AR & Recovery', icon: 'bx bx-target-lock' },
  { id: 'treasury', label: 'Treasury & Banking', icon: 'bx bx-landmark' },
  { id: 'vouchers', label: 'Financial Vouchers', icon: 'bx bx-file' },
  { id: 'expenses', label: 'Expenses & Claims', icon: 'bx bx-credit-card' },
  { id: 'purchasing_integration', label: 'Purchasing Integration', icon: 'bx bx-cart' },
  { id: 'payroll_finance', label: 'Payroll & Salaries', icon: 'bx bx-user-check' },
  { id: 'tax_management', label: 'Taxes & Withholding', icon: 'bx bx-pie-chart-alt-2' },
  { id: 'general_ledger', label: 'General Ledger', icon: 'bx bx-book-open' },
  { id: 'financial_statements', label: 'Financial Statements', icon: 'bx bx-line-chart' },
  { id: 'profitability_workspace', label: 'Site Profitability', icon: 'bx bx-building-house' },
  { id: 'financial_controls', label: 'Financial Controls', icon: 'bx bx-shield-quarter' },
  { id: 'finance_setup', label: 'Setup & Config', icon: 'bx bx-cog' },
];

export const SecurityFinanceModule: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('executive_dashboard');

  return (
    <div
      style={{
        padding: '24px',
        maxWidth: '1440px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        color: 'var(--color-text)',
        height: '100%',
        overflowY: 'auto',
        boxSizing: 'border-box',
        paddingBottom: '80px',
      }}
    >
      {/* Module Title Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'rgba(2, 132, 199, 0.12)',
                border: '1px solid rgba(2, 132, 199, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <i className="bx bx-wallet" style={{ fontSize: '22px', color: '#0284c7' }}></i>
            </div>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: 'var(--color-text)' }}>
              Security Finance & Accounting
            </h1>
            <span
              style={{
                fontSize: '11px',
                padding: '3px 8px',
                borderRadius: '6px',
                background: 'rgba(34, 197, 94, 0.15)',
                color: '#16a34a',
                fontWeight: 600,
                border: '1px solid rgba(34, 197, 94, 0.3)',
              }}
            >
              Phase S-4 Certified
            </span>
          </div>
          <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: 'var(--color-text-muted)' }}>
            Authoritative Financial Governance — Real-time P&L, Health Diagnostics, Treasury, Purchasing Integration, Payroll, Tax & Year-End Closing Controls.
          </p>
        </div>
      </div>

      {/* Tabs Navigation Bar */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '6px',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: '12px',
          padding: '10px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
        }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flexShrink: 0,
                padding: '8px 13px',
                border: isActive ? '1px solid var(--color-primary, #0284c7)' : '1px solid var(--color-border)',
                background: isActive ? 'var(--color-primary, #0284c7)' : 'var(--color-surface-secondary)',
                color: isActive ? '#ffffff' : 'var(--color-text)',
                borderRadius: '8px',
                fontSize: '12.5px',
                fontWeight: isActive ? 600 : 500,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
                boxShadow: isActive ? '0 2px 6px rgba(2, 132, 199, 0.35)' : 'none',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'var(--color-surface-elevated, #e2e8f0)';
                  e.currentTarget.style.borderColor = 'var(--color-primary, #0284c7)';
                  e.currentTarget.style.color = 'var(--color-primary, #0284c7)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'var(--color-surface-secondary)';
                  e.currentTarget.style.borderColor = 'var(--color-border)';
                  e.currentTarget.style.color = 'var(--color-text)';
                }
              }}
            >
              <i className={tab.icon} style={{ fontSize: '15px', color: isActive ? '#ffffff' : 'var(--color-primary, #0284c7)' }}></i>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content Panels */}
      <div>
        {activeTab === 'executive_dashboard' && (
          <ExecutiveFinanceDashboardTab onNavigateTab={(t) => setActiveTab(t)} />
        )}
        {activeTab === 'financial_controls' && <FinancialControlsTab />}
        {activeTab === 'financial_statements' && <FinancialStatementsTab />}
        {activeTab === 'profitability_workspace' && <ProfitabilityWorkspaceTab />}
        {activeTab === 'general_ledger' && <GeneralLedgerTab />}
        {activeTab === 'tax_management' && <TaxManagementTab />}
        {activeTab === 'payroll_finance' && <PayrollFinanceTab />}
        {activeTab === 'purchasing_integration' && <PurchasingIntegrationTab />}
        {activeTab === 'treasury' && (
          <TreasuryDashboardTab
            onNavigateToVouchers={() => setActiveTab('vouchers')}
            onNavigateToCheques={() => setActiveTab('cheques')}
          />
        )}
        {activeTab === 'vouchers' && <VouchersTab />}
        {activeTab === 'expenses' && <ExpensesTab />}
        {activeTab === 'billing_sheets' && <BillingSheetsTab />}
        {activeTab === 'client_invoices' && <ClientInvoicesTab />}
        {activeTab === 'ar_recovery' && <ClientInvoicesTab />}
        {activeTab === 'finance_setup' && <FinanceSetupTab />}
      </div>
    </div>
  );
};


