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
import { RecoveryCollectionsTab } from './components/RecoveryCollectionsTab';
import { VendorPaymentsTab } from './components/VendorPaymentsTab';
import { PayrollFinanceTab } from './components/PayrollFinanceTab';
import { TaxManagementTab } from './components/TaxManagementTab';
import { GeneralLedgerTab } from './components/GeneralLedgerTab';
import { PayslipReportView } from '../../../modules/hr/components/PayslipReportView';
import { FinanceAdvanceSheetsTab } from './components/FinanceAdvanceSheetsTab';

interface HubConfig {
  id: string;
  label: string;
  icon: string;
  description: string;
}

const HUBS: HubConfig[] = [
  { id: 'overview', label: 'Executive Overview', icon: 'bx-bar-chart-alt-2', description: 'Financial KPIs, Cashflow & Diagnostics' },
  { id: 'invoicing', label: 'CRM Invoicing & Billing', icon: 'bx-receipt', description: 'Monthly Billing & CRM Generation' },
  { id: 'recovery', label: 'Recovery & AR Collections', icon: 'bx-target-lock', description: 'Aging Buckets & Payment Receipts' },
  { id: 'payroll', label: 'Payroll & Salaries', icon: 'bx-user-check', description: 'Monthly Salary Sheets & Disbursements' },
  { id: 'advance_sheets', label: 'Advance Sheets', icon: 'bx-wallet', description: 'Approve, Pay or Reject Operations Advance Sheets' },
  { id: 'payslips_report', label: 'Pay Slips Report', icon: 'bx-file', description: 'Employee Pay Slips Preview & Print' },
  { id: 'vendor_payments', label: 'Vendor & PO Payments', icon: 'bx-cart', description: 'Centralized AP & Vendor Disbursements' },
  { id: 'vouchers_treasury', label: 'Vouchers & Treasury', icon: 'bx-landmark', description: 'Bank Accounts, Cheques & Vouchers' },
  { id: 'profitability', label: 'Profitability & Expenses', icon: 'bx-pie-chart-alt-2', description: 'Site Profitability & Direct Claims' },
  { id: 'accounting_reports', label: 'General Ledger & Tax', icon: 'bx-book-open', description: 'GL, Statements, Tax & Year-End' },
  { id: 'settings', label: 'Finance Settings', icon: 'bx-cog', description: 'COA Mappings & Payment Modes' },
];

export const SecurityFinanceModule: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);

  // Sub-navigation within hubs
  const [invoicingSubTab, setInvoicingSubTab] = useState<'INVOICES' | 'BILLING_SHEETS'>('INVOICES');
  const [vouchersSubTab, setVouchersSubTab] = useState<'TREASURY' | 'VOUCHERS'>('TREASURY');
  const [profitabilitySubTab, setProfitabilitySubTab] = useState<'PROFITABILITY' | 'EXPENSES'>('PROFITABILITY');
  const [accountingSubTab, setAccountingSubTab] = useState<'GL' | 'STATEMENTS' | 'TAX' | 'CONTROLS' | 'SETUP'>('GL');

  // Keep visited hubs & sub-tabs mounted for instant 0ms tab switching with zero redundant API re-fetches
  const [visitedTabs, setVisitedTabs] = useState<Record<string, boolean>>({ overview: true });
  const [visitedInvoicingSubs, setVisitedInvoicingSubs] = useState<Record<string, boolean>>({ INVOICES: true });
  const [visitedVouchersSubs, setVisitedVouchersSubs] = useState<Record<string, boolean>>({ TREASURY: true });
  const [visitedProfitSubs, setVisitedProfitSubs] = useState<Record<string, boolean>>({ PROFITABILITY: true });
  const [visitedAcctSubs, setVisitedAcctSubs] = useState<Record<string, boolean>>({ GL: true });

  React.useEffect(() => {
    setVisitedTabs((prev) => (prev[activeTab] ? prev : { ...prev, [activeTab]: true }));
  }, [activeTab]);

  React.useEffect(() => {
    if (activeTab === 'invoicing') {
      setVisitedInvoicingSubs((prev) => (prev[invoicingSubTab] ? prev : { ...prev, [invoicingSubTab]: true }));
    } else if (activeTab === 'vouchers_treasury') {
      setVisitedVouchersSubs((prev) => (prev[vouchersSubTab] ? prev : { ...prev, [vouchersSubTab]: true }));
    } else if (activeTab === 'profitability') {
      setVisitedProfitSubs((prev) => (prev[profitabilitySubTab] ? prev : { ...prev, [profitabilitySubTab]: true }));
    } else if (activeTab === 'accounting_reports') {
      setVisitedAcctSubs((prev) => (prev[accountingSubTab] ? prev : { ...prev, [accountingSubTab]: true }));
    }
  }, [activeTab, invoicingSubTab, vouchersSubTab, profitabilitySubTab, accountingSubTab]);

  const handleNavigateFromDashboard = (tabId: string) => {
    switch (tabId) {
      case 'client_invoices':
        setActiveTab('invoicing');
        setInvoicingSubTab('INVOICES');
        break;
      case 'billing_sheets':
        setActiveTab('invoicing');
        setInvoicingSubTab('BILLING_SHEETS');
        break;
      case 'ar_recovery':
        setActiveTab('recovery');
        break;
      case 'payroll_finance':
        setActiveTab('payroll');
        break;
      case 'purchasing_integration':
        setActiveTab('vendor_payments');
        break;
      case 'treasury':
        setActiveTab('vouchers_treasury');
        setVouchersSubTab('TREASURY');
        break;
      case 'vouchers':
      case 'cheques':
        setActiveTab('vouchers_treasury');
        setVouchersSubTab('VOUCHERS');
        break;
      case 'profitability_workspace':
        setActiveTab('profitability');
        setProfitabilitySubTab('PROFITABILITY');
        break;
      case 'expenses':
        setActiveTab('profitability');
        setProfitabilitySubTab('EXPENSES');
        break;
      case 'general_ledger':
        setActiveTab('accounting_reports');
        setAccountingSubTab('GL');
        break;
      case 'tax_management':
        setActiveTab('accounting_reports');
        setAccountingSubTab('TAX');
        break;
      case 'financial_statements':
        setActiveTab('accounting_reports');
        setAccountingSubTab('STATEMENTS');
        break;
      case 'financial_controls':
        setActiveTab('accounting_reports');
        setAccountingSubTab('CONTROLS');
        break;
      case 'finance_setup':
        setActiveTab('settings');
        break;
      default:
        setActiveTab(tabId);
        break;
    }
  };

  return (
    <div className="module-container">
      {/* Header matching HR Left Collapsible Layout */}
      <div className="module-header">
        <div className="header-content">
          <button
            className="sidebar-toggle-btn"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            title="Toggle Finance Sidebar"
          >
            <i className={`bx ${isSidebarOpen ? 'bx-menu-alt-left' : 'bx-menu'}`}></i>
          </button>
          <div>
            <h1>Finance &amp; Accounting — Financial Hub</h1>
            <p>
              CRM billing, monthly salary sheets, pay slips, purchasing disbursements, AR recovery, and treasury controls.
            </p>
          </div>
        </div>
      </div>

      {/* Collapsible Left Sidebar + Main Workspace */}
      <div className="module-body-layout">
        <div className={`module-sidebar ${isSidebarOpen ? 'open' : 'closed'}`}>
          <div className="module-sidebar-nav">
            {HUBS.map((hub) => (
              <button
                key={hub.id}
                className={`sidebar-nav-btn ${activeTab === hub.id ? 'active' : ''}`}
                onClick={() => setActiveTab(hub.id)}
                title={hub.description}
              >
                <i className={`bx ${hub.icon}`}></i>
                <span>{hub.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="module-main">
          <div className="module-content" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Hub Sub-Header Toggle Bars */}
            {activeTab === 'invoicing' && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'var(--color-surface-secondary, #f8fafc)',
                  padding: '8px 14px',
                  borderRadius: '10px',
                  border: '1px solid var(--color-border, #e2e8f0)',
                  flexWrap: 'wrap',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setInvoicingSubTab('INVOICES')}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '6px',
                      border: invoicingSubTab === 'INVOICES' ? '1px solid #0284c7' : '1px solid var(--color-border)',
                      background: invoicingSubTab === 'INVOICES' ? '#0284c7' : 'var(--color-surface)',
                      color: invoicingSubTab === 'INVOICES' ? '#ffffff' : 'var(--color-text)',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <i className="bx bx-receipt"></i>
                    <span>Client Invoices Register</span>
                  </button>
                  <button
                    onClick={() => setInvoicingSubTab('BILLING_SHEETS')}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '6px',
                      border: invoicingSubTab === 'BILLING_SHEETS' ? '1px solid #0284c7' : '1px solid var(--color-border)',
                      background: invoicingSubTab === 'BILLING_SHEETS' ? '#0284c7' : 'var(--color-surface)',
                      color: invoicingSubTab === 'BILLING_SHEETS' ? '#ffffff' : 'var(--color-text)',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <i className="bx bx-spreadsheet"></i>
                    <span>Monthly Service Billing Sheets</span>
                  </button>
                </div>
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                  Invoices support both <strong>CRM Contract Rate</strong> and <strong>Attendance Wise</strong> billing.
                </span>
              </div>
            )}

            {activeTab === 'vouchers_treasury' && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'var(--color-surface-secondary, #f8fafc)',
                  padding: '8px 14px',
                  borderRadius: '10px',
                  border: '1px solid var(--color-border, #e2e8f0)',
                  flexWrap: 'wrap',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setVouchersSubTab('TREASURY')}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '6px',
                      border: vouchersSubTab === 'TREASURY' ? '1px solid #0284c7' : '1px solid var(--color-border)',
                      background: vouchersSubTab === 'TREASURY' ? '#0284c7' : 'var(--color-surface)',
                      color: vouchersSubTab === 'TREASURY' ? '#ffffff' : 'var(--color-text)',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <i className="bx bx-landmark"></i>
                    <span>Bank &amp; Cash Treasury</span>
                  </button>
                  <button
                    onClick={() => setVouchersSubTab('VOUCHERS')}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '6px',
                      border: vouchersSubTab === 'VOUCHERS' ? '1px solid #0284c7' : '1px solid var(--color-border)',
                      background: vouchersSubTab === 'VOUCHERS' ? '#0284c7' : 'var(--color-surface)',
                      color: vouchersSubTab === 'VOUCHERS' ? '#ffffff' : 'var(--color-text)',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <i className="bx bx-file"></i>
                    <span>Payment, Receipt &amp; Journal Vouchers</span>
                  </button>
                </div>
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                  Authoritative cash, bank, contra and journal voucher accounting.
                </span>
              </div>
            )}

            {activeTab === 'profitability' && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'var(--color-surface-secondary, #f8fafc)',
                  padding: '8px 14px',
                  borderRadius: '10px',
                  border: '1px solid var(--color-border, #e2e8f0)',
                  flexWrap: 'wrap',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setProfitabilitySubTab('PROFITABILITY')}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '6px',
                      border: profitabilitySubTab === 'PROFITABILITY' ? '1px solid #0284c7' : '1px solid var(--color-border)',
                      background: profitabilitySubTab === 'PROFITABILITY' ? '#0284c7' : 'var(--color-surface)',
                      color: profitabilitySubTab === 'PROFITABILITY' ? '#ffffff' : 'var(--color-text)',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <i className="bx bx-building-house"></i>
                    <span>Site &amp; Client Profitability</span>
                  </button>
                  <button
                    onClick={() => setProfitabilitySubTab('EXPENSES')}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '6px',
                      border: profitabilitySubTab === 'EXPENSES' ? '1px solid #0284c7' : '1px solid var(--color-border)',
                      background: profitabilitySubTab === 'EXPENSES' ? '#0284c7' : 'var(--color-surface)',
                      color: profitabilitySubTab === 'EXPENSES' ? '#ffffff' : 'var(--color-text)',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <i className="bx bx-credit-card"></i>
                    <span>Site Expenses &amp; Petty Cash Claims</span>
                  </button>
                </div>
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                  Real-time margins: Revenue vs Guard Attendance Wages vs Direct Site Costs.
                </span>
              </div>
            )}

            {activeTab === 'accounting_reports' && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'var(--color-surface-secondary, #f8fafc)',
                  padding: '8px 14px',
                  borderRadius: '10px',
                  border: '1px solid var(--color-border, #e2e8f0)',
                  flexWrap: 'wrap',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {[
                    { id: 'GL', label: 'General Ledger', icon: 'bx bx-book-open' },
                    { id: 'STATEMENTS', label: 'Financial Statements', icon: 'bx bx-line-chart' },
                    { id: 'TAX', label: 'Taxes & Withholding', icon: 'bx bx-pie-chart-alt-2' },
                    { id: 'CONTROLS', label: 'Financial Controls', icon: 'bx bx-shield-quarter' },
                    { id: 'SETUP', label: 'Chart of Accounts & Setup', icon: 'bx bx-cog' },
                  ].map((sub) => (
                    <button
                      key={sub.id}
                      onClick={() => setAccountingSubTab(sub.id as any)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: accountingSubTab === sub.id ? '1px solid #0284c7' : '1px solid var(--color-border)',
                        background: accountingSubTab === sub.id ? '#0284c7' : 'var(--color-surface)',
                        color: accountingSubTab === sub.id ? '#ffffff' : 'var(--color-text)',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                      }}
                    >
                      <i className={sub.icon}></i>
                      <span>{sub.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Main Tab Panels (visited tabs stay mounted cleanly via CSS display for instant switching) */}
            <div>
              {visitedTabs.overview && (
                <div style={{ display: activeTab === 'overview' ? 'block' : 'none' }}>
                  <ExecutiveFinanceDashboardTab onNavigateTab={handleNavigateFromDashboard} />
                </div>
              )}

              {visitedTabs.invoicing && (
                <div style={{ display: activeTab === 'invoicing' ? 'block' : 'none' }}>
                  {visitedInvoicingSubs.INVOICES && (
                    <div style={{ display: invoicingSubTab === 'INVOICES' ? 'block' : 'none' }}>
                      <ClientInvoicesTab />
                    </div>
                  )}
                  {visitedInvoicingSubs.BILLING_SHEETS && (
                    <div style={{ display: invoicingSubTab === 'BILLING_SHEETS' ? 'block' : 'none' }}>
                      <BillingSheetsTab />
                    </div>
                  )}
                </div>
              )}

              {visitedTabs.recovery && (
                <div style={{ display: activeTab === 'recovery' ? 'block' : 'none' }}>
                  <RecoveryCollectionsTab />
                </div>
              )}

              {visitedTabs.payroll && (
                <div style={{ display: activeTab === 'payroll' ? 'block' : 'none' }}>
                  <PayrollFinanceTab />
                </div>
              )}

              {visitedTabs.advance_sheets && (
                <div style={{ display: activeTab === 'advance_sheets' ? 'block' : 'none' }}>
                  <FinanceAdvanceSheetsTab />
                </div>
              )}

              {visitedTabs.payslips_report && (
                <div style={{ display: activeTab === 'payslips_report' ? 'block' : 'none' }}>
                  <PayslipReportView />
                </div>
              )}

              {visitedTabs.vendor_payments && (
                <div style={{ display: activeTab === 'vendor_payments' ? 'block' : 'none' }}>
                  <VendorPaymentsTab />
                </div>
              )}

              {visitedTabs.vouchers_treasury && (
                <div style={{ display: activeTab === 'vouchers_treasury' ? 'block' : 'none' }}>
                  {visitedVouchersSubs.TREASURY && (
                    <div style={{ display: vouchersSubTab === 'TREASURY' ? 'block' : 'none' }}>
                      <TreasuryDashboardTab
                        onNavigateToVouchers={() => setVouchersSubTab('VOUCHERS')}
                        onNavigateToCheques={() => setVouchersSubTab('VOUCHERS')}
                      />
                    </div>
                  )}
                  {visitedVouchersSubs.VOUCHERS && (
                    <div style={{ display: vouchersSubTab === 'VOUCHERS' ? 'block' : 'none' }}>
                      <VouchersTab />
                    </div>
                  )}
                </div>
              )}

              {visitedTabs.profitability && (
                <div style={{ display: activeTab === 'profitability' ? 'block' : 'none' }}>
                  {visitedProfitSubs.PROFITABILITY && (
                    <div style={{ display: profitabilitySubTab === 'PROFITABILITY' ? 'block' : 'none' }}>
                      <ProfitabilityWorkspaceTab />
                    </div>
                  )}
                  {visitedProfitSubs.EXPENSES && (
                    <div style={{ display: profitabilitySubTab === 'EXPENSES' ? 'block' : 'none' }}>
                      <ExpensesTab />
                    </div>
                  )}
                </div>
              )}

              {visitedTabs.accounting_reports && (
                <div style={{ display: activeTab === 'accounting_reports' ? 'block' : 'none' }}>
                  {visitedAcctSubs.GL && (
                    <div style={{ display: accountingSubTab === 'GL' ? 'block' : 'none' }}>
                      <GeneralLedgerTab />
                    </div>
                  )}
                  {visitedAcctSubs.STATEMENTS && (
                    <div style={{ display: accountingSubTab === 'STATEMENTS' ? 'block' : 'none' }}>
                      <FinancialStatementsTab />
                    </div>
                  )}
                  {visitedAcctSubs.TAX && (
                    <div style={{ display: accountingSubTab === 'TAX' ? 'block' : 'none' }}>
                      <TaxManagementTab />
                    </div>
                  )}
                  {visitedAcctSubs.CONTROLS && (
                    <div style={{ display: accountingSubTab === 'CONTROLS' ? 'block' : 'none' }}>
                      <FinancialControlsTab />
                    </div>
                  )}
                  {visitedAcctSubs.SETUP && (
                    <div style={{ display: accountingSubTab === 'SETUP' ? 'block' : 'none' }}>
                      <FinanceSetupTab />
                    </div>
                  )}
                </div>
              )}

              {visitedTabs.settings && (
                <div style={{ display: activeTab === 'settings' ? 'block' : 'none' }}>
                  <FinanceSetupTab />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
