import React, { useState, useEffect } from 'react';
import {
  fetchSecurityFinanceConfig,
  updateSecurityFinanceConfig,
  fetchChartOfAccounts,
  fetchBankAccounts,
} from '../api';
import type {
  SecurityFinanceConfiguration,
  ChartOfAccount,
  BankAccount,
} from '../api';

export const FinanceSetupTab: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [config, setConfig] = useState<SecurityFinanceConfiguration>({
    accounts_receivable_account: null,
    accounts_payable_account: null,
    payroll_payable_account: null,
    tax_payable_account: null,
    security_service_revenue_account: null,
    overtime_revenue_account: null,
    extra_duty_revenue_account: null,
    salary_cost_account: null,
    overtime_cost_account: null,
    inventory_equipment_account: null,
    default_bank_account: null,
    default_currency: null,
    is_active: true,
  });

  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [cfg, accs, bas] = await Promise.all([
        fetchSecurityFinanceConfig(),
        fetchChartOfAccounts({ is_active: true }),
        fetchBankAccounts({ is_active: true }),
      ]);
      if (cfg) setConfig(cfg);
      setAccounts(accs);
      setBankAccounts(bas);
    } catch (err) {
      console.error('Failed to load finance configuration', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveMsg(null);
    try {
      const updated = await updateSecurityFinanceConfig(config);
      setConfig(updated);
      setSaveMsg({ type: 'success', text: 'Security Finance posting configuration saved successfully!' });
    } catch (err: any) {
      setSaveMsg({
        type: 'error',
        text: err?.response?.data?.detail || JSON.stringify(err?.response?.data) || 'Failed to save configuration.',
      });
    } finally {
      setSaving(false);
    }
  };

  // Filter helper functions
  const filterAccounts = (types: string[]) =>
    accounts.filter((a) => types.includes(a.account_type) && !a.is_header);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header Banner */}
      <div
        style={{
          background: 'var(--color-surface, #1e293b)',
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid var(--color-border, rgba(255,255,255,0.06))',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#f8fafc' }}>
          ⚙️ Security Finance Posting Configuration
        </h2>
        <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
          Define system-wide default General Ledger control accounts used for automated billing sheet posting, vendor bill matching, payroll settlement, and cash disbursements.
        </p>
      </div>

      {saveMsg && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            background: saveMsg.type === 'success' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${saveMsg.type === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            color: saveMsg.type === 'success' ? '#86efac' : '#fca5a5',
            fontSize: '13px',
          }}
        >
          {saveMsg.text}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading configuration...</div>
      ) : (
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Section 1: Receivables & Payables Controls */}
          <div
            style={{
              background: 'var(--color-surface, #1e293b)',
              padding: '20px',
              borderRadius: '12px',
              border: '1px solid var(--color-border, rgba(255,255,255,0.06))',
            }}
          >
            <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 600, color: '#38bdf8' }}>
              1. Balance Sheet Control Accounts (AR / AP / Payroll / Tax)
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
                  Accounts Receivable (Trade Debtors) *
                </label>
                <select
                  value={config.accounts_receivable_account || ''}
                  onChange={(e) => setConfig({ ...config, accounts_receivable_account: e.target.value || null })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="">Select AR Account...</option>
                  {filterAccounts(['ASSET']).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.account_code} - {a.account_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
                  Accounts Payable (Trade Creditors) *
                </label>
                <select
                  value={config.accounts_payable_account || ''}
                  onChange={(e) => setConfig({ ...config, accounts_payable_account: e.target.value || null })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="">Select AP Account...</option>
                  {filterAccounts(['LIABILITY']).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.account_code} - {a.account_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
                  Guard & Staff Payroll Payable
                </label>
                <select
                  value={config.payroll_payable_account || ''}
                  onChange={(e) => setConfig({ ...config, payroll_payable_account: e.target.value || null })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="">Select Payroll Payable Account...</option>
                  {filterAccounts(['LIABILITY']).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.account_code} - {a.account_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
                  Statutory Tax Payable (WHT / Sales Tax)
                </label>
                <select
                  value={config.tax_payable_account || ''}
                  onChange={(e) => setConfig({ ...config, tax_payable_account: e.target.value || null })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="">Select Tax Payable Account...</option>
                  {filterAccounts(['LIABILITY']).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.account_code} - {a.account_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Security Guarding Revenue Accounts */}
          <div
            style={{
              background: 'var(--color-surface, #1e293b)',
              padding: '20px',
              borderRadius: '12px',
              border: '1px solid var(--color-border, rgba(255,255,255,0.06))',
            }}
          >
            <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 600, color: '#4ade80' }}>
              2. Guarding Revenue & Billing Accounts
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
                  Guarding Contract Service Revenue *
                </label>
                <select
                  value={config.security_service_revenue_account || ''}
                  onChange={(e) => setConfig({ ...config, security_service_revenue_account: e.target.value || null })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="">Select Revenue Account...</option>
                  {filterAccounts(['REVENUE', 'OTHER_INCOME']).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.account_code} - {a.account_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
                  Guard Overtime Billing Revenue
                </label>
                <select
                  value={config.overtime_revenue_account || ''}
                  onChange={(e) => setConfig({ ...config, overtime_revenue_account: e.target.value || null })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="">Select OT Revenue Account...</option>
                  {filterAccounts(['REVENUE', 'OTHER_INCOME']).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.account_code} - {a.account_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
                  Extra Duty & VIP Escort Revenue
                </label>
                <select
                  value={config.extra_duty_revenue_account || ''}
                  onChange={(e) => setConfig({ ...config, extra_duty_revenue_account: e.target.value || null })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="">Select Escort Revenue Account...</option>
                  {filterAccounts(['REVENUE', 'OTHER_INCOME']).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.account_code} - {a.account_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section 3: Direct Guard Costs & Store Inventory */}
          <div
            style={{
              background: 'var(--color-surface, #1e293b)',
              padding: '20px',
              borderRadius: '12px',
              border: '1px solid var(--color-border, rgba(255,255,255,0.06))',
            }}
          >
            <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 600, color: '#f59e0b' }}>
              3. Guard Costs of Service & Equipment Inventory
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
                  Guard Base Salary Cost *
                </label>
                <select
                  value={config.salary_cost_account || ''}
                  onChange={(e) => setConfig({ ...config, salary_cost_account: e.target.value || null })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="">Select Salary Cost Account...</option>
                  {filterAccounts(['COST_OF_SERVICE', 'EXPENSE']).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.account_code} - {a.account_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
                  Guard Overtime & Holiday Cost
                </label>
                <select
                  value={config.overtime_cost_account || ''}
                  onChange={(e) => setConfig({ ...config, overtime_cost_account: e.target.value || null })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="">Select OT Cost Account...</option>
                  {filterAccounts(['COST_OF_SERVICE', 'EXPENSE']).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.account_code} - {a.account_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
                  Store Inventory & Uniforms Account
                </label>
                <select
                  value={config.inventory_equipment_account || ''}
                  onChange={(e) => setConfig({ ...config, inventory_equipment_account: e.target.value || null })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="">Select Inventory Account...</option>
                  {filterAccounts(['ASSET']).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.account_code} - {a.account_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section 4: Treasury & Default Bank */}
          <div
            style={{
              background: 'var(--color-surface, #1e293b)',
              padding: '20px',
              borderRadius: '12px',
              border: '1px solid var(--color-border, rgba(255,255,255,0.06))',
            }}
          >
            <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 600, color: '#c084fc' }}>
              4. Default Treasury Account
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
                  Default Operating Bank / Cash Account
                </label>
                <select
                  value={config.default_bank_account || ''}
                  onChange={(e) => setConfig({ ...config, default_bank_account: e.target.value || null })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="">Select Default Bank Account...</option>
                  {bankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.account_title} ({b.bank_name || b.account_type}) - PKR {b.current_balance}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '10px 24px',
                background: '#3b82f6',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
              }}
            >
              {saving ? 'Saving Configuration...' : 'Save Finance Configuration'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
