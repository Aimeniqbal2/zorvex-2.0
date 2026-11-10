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

interface HubConfig {
  id: string;
  label: string;
  icon: string;
  description: string;
}

const HUBS: HubConfig[] = [
  { id: 'overview', label: 'Executive Overview', icon: 'bx bx-bar-chart-alt-2', description: 'Financial KPIs, Cashflow & Diagnostics' },
  { id: 'invoicing', label: 'CRM Invoicing & Billing', icon: 'bx bx-receipt', description: 'Monthly Billing & CRM Generation' },
  { id: 'recovery', label: 'Recovery & AR Collections', icon: 'bx bx-target-lock', description: 'Aging Buckets & Payment Receipts' },
  { id: 'payroll', label: 'Payroll & Salaries', icon: 'bx bx-user-check', description: 'Attendance-based Guard Salaries' },
  { id: 'vendor_payments', label: 'Vendor & PO Payments', icon: 'bx bx-cart', description: 'Centralized AP & Vendor Disbursements' },
  { id: 'vouchers_treasury', label: 'Vouchers & Treasury', icon: 'bx bx-landmark', description: 'Bank Accounts, Cheques & Vouchers' },
  { id: 'profitability', label: 'Profitability & Expenses', icon: 'bx bx-pie-chart-alt-2', description: 'Site Profitability & Direct Claims' },
  { id: 'accounting_reports', label: 'General Ledger & Tax', icon: 'bx bx-book-open', description: 'GL, Statements, Tax & Year-End' },
];

export const SecurityFinanceModule: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('overview');

  // Sub-navigation within hubs
  const [invoicingSubTab, setInvoicingSubTab] = useState<'INVOICES' | 'BILLING_SHEETS'>('INVOICES');
  const [vouchersSubTab, setVouchersSubTab] = useState<'TREASURY' | 'VOUCHERS'>('TREASURY');
  const [profitabilitySubTab, setProfitabilitySubTab] = useState<'PROFITABILITY' | 'EXPENSES'>('PROFITABILITY');
  const [accountingSubTab, setAccountingSubTab] = useState<'GL' | 'STATEMENTS' | 'TAX' | 'CONTROLS' | 'SETUP'>('GL');

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
        setActiveTab('accounting_reports');
        setAccountingSubTab('SETUP');
        break;
      default:
        setActiveTab(tabId);
        break;
    }
  };

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
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'rgba(2, 132, 199, 0.12)',
                border: '1px solid rgba(2, 132, 199, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <i className="bx bx-shield-quarter" style={{ fontSize: '24px', color: '#0284c7' }}></i>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: 'var(--color-text)' }}>
                  Security Industry Finance & Accounting
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
                  Streamlined Hub
                </span>
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--color-text-muted)' }}>
                Authoritative financial management: CRM billing, attendance-based guard salaries, purchasing disbursements, AR recovery, and treasury controls.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Primary Navigation Hubs */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '8px',
          background: 'var(--color-surface, #ffffff)',
          border: '1px solid var(--color-border, #e2e8f0)',
          borderRadius: '12px',
          padding: '8px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
        }}
      >
        {HUBS.map((hub) => {
          const isActive = activeTab === hub.id;
          return (
            <button
              key={hub.id}
              onClick={() => setActiveTab(hub.id)}
              title={hub.description}
              style={{
                flexShrink: 0,
                padding: '9px 14px',
                border: isActive ? '1px solid var(--color-primary, #0284c7)' : '1px solid transparent',
                background: isActive ? 'var(--color-primary, #0284c7)' : 'transparent',
                color: isActive ? '#ffffff' : 'var(--color-text)',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: isActive ? 600 : 500,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
                boxShadow: isActive ? '0 2px 6px rgba(2, 132, 199, 0.3)' : 'none',
              }}
            >
              <i className={hub.icon} style={{ fontSize: '16px', color: isActive ? '#ffffff' : '#0284c7' }}></i>
              <span>{hub.label}</span>
            </button>
          );
        })}
      </div>

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
            border: '1px solid var(--color-border, #e2e8f0)'
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
                gap: '6px'
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
                gap: '6px'
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
            border: '1px solid var(--color-border, #e2e8f0)'
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
                gap: '6px'
              }}
            >
              <i className="bx bx-landmark"></i>
              <span>Treasury & Bank Liquidity</span>
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
                gap: '6px'
              }}
            >
              <i className="bx bx-file"></i>
              <span>Payment & Receipt Vouchers</span>
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
            border: '1px solid var(--color-border, #e2e8f0)'
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
                gap: '6px'
              }}
            >
              <i className="bx bx-building-house"></i>
              <span>Site & Client Profitability</span>
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
                gap: '6px'
              }}
            >
              <i className="bx bx-credit-card"></i>
              <span>Site Expenses & Petty Cash Claims</span>
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
            gap: '8px'
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
                  gap: '5px'
                }}
              >
                <i className={sub.icon}></i>
                <span>{sub.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Tab Panels */}
      <div>
        {activeTab === 'overview' && (
          <ExecutiveFinanceDashboardTab onNavigateTab={handleNavigateFromDashboard} />
        )}

        {activeTab === 'invoicing' && (
          invoicingSubTab === 'INVOICES' ? <ClientInvoicesTab /> : <BillingSheetsTab />
        )}

        {activeTab === 'recovery' && <RecoveryCollectionsTab />}

        {activeTab === 'payroll' && <PayrollFinanceTab />}

        {activeTab === 'vendor_payments' && <VendorPaymentsTab />}

        {activeTab === 'vouchers_treasury' && (
          vouchersSubTab === 'TREASURY' ? (
            <TreasuryDashboardTab
              onNavigateToVouchers={() => setVouchersSubTab('VOUCHERS')}
              onNavigateToCheques={() => setVouchersSubTab('VOUCHERS')}
            />
          ) : (
            <VouchersTab />
          )
        )}

        {activeTab === 'profitability' && (
          profitabilitySubTab === 'PROFITABILITY' ? <ProfitabilityWorkspaceTab /> : <ExpensesTab />
        )}

        {activeTab === 'accounting_reports' && (
          <>
            {accountingSubTab === 'GL' && <GeneralLedgerTab />}
            {accountingSubTab === 'STATEMENTS' && <FinancialStatementsTab />}
            {accountingSubTab === 'TAX' && <TaxManagementTab />}
            {accountingSubTab === 'CONTROLS' && <FinancialControlsTab />}
            {accountingSubTab === 'SETUP' && <FinanceSetupTab />}
          </>
        )}
      </div>
    </div>
  );
};
