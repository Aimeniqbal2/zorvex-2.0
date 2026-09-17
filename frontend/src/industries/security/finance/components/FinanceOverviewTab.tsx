import React, { useState, useEffect } from 'react';
import {
  fetchChartOfAccounts,
  fetchAccountingPeriods,
  fetchCostCenters,
  fetchProfitCenters,
  fetchBankAccounts,
  fetchSecurityFinanceConfig,
  provisionSecurityCOA,
  checkDatePeriod,
} from '../api';
import type {
  ChartOfAccount,
  AccountingPeriod,
  SecurityFinanceConfiguration,
  PeriodCheckResult,
} from '../api';

interface Props {
  onNavigateTab: (tab: string) => void;
  onRefreshAll?: () => void;
}

export const FinanceOverviewTab: React.FC<Props> = ({ onNavigateTab, onRefreshAll }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [costCentersCount, setCostCentersCount] = useState<number>(0);
  const [profitCentersCount, setProfitCentersCount] = useState<number>(0);
  const [bankAccountsCount, setBankAccountsCount] = useState<number>(0);
  const [config, setConfig] = useState<SecurityFinanceConfiguration | null>(null);

  // Provisioning state
  const [isProvisioning, setIsProvisioning] = useState<boolean>(false);
  const [provisionMsg, setProvisionMsg] = useState<string | null>(null);

  // Date Check Interactive State
  const [checkDateInput, setCheckDateInput] = useState<string>(new Date().toISOString().split('T')[0]);
  const [isAdjustmentInput, setIsAdjustmentInput] = useState<boolean>(false);
  const [dateCheckResult, setDateCheckResult] = useState<PeriodCheckResult | null>(null);
  const [isCheckingDate, setIsCheckingDate] = useState<boolean>(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [accs, pers, ccs, pcs, bas, cfg] = await Promise.all([
        fetchChartOfAccounts(),
        fetchAccountingPeriods(),
        fetchCostCenters(),
        fetchProfitCenters(),
        fetchBankAccounts(),
        fetchSecurityFinanceConfig().catch(() => null),
      ]);
      setAccounts(accs);
      setPeriods(pers);
      setCostCentersCount(ccs.length);
      setProfitCentersCount(pcs.length);
      setBankAccountsCount(bas.length);
      setConfig(cfg);
    } catch (err) {
      console.error('Failed to load finance overview', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleProvisionCOA = async () => {
    if (!confirm('This will provision the standard Security Industry Chart of Accounts (Assets, Liabilities, Guarding Revenue, Cost of Services, SG&A), standard 12 fiscal periods, default cost & profit centers, and control accounts mapping. Continue?')) {
      return;
    }
    setIsProvisioning(true);
    setProvisionMsg(null);
    try {
      const res = await provisionSecurityCOA();
      setProvisionMsg(`Successfully provisioned! Accounts: ${res.total_accounts}, Cost Centers: ${res.created_counts.cost_centers}, Bank Accounts: ${res.created_counts.bank_accounts}`);
      await loadData();
      if (onRefreshAll) onRefreshAll();
    } catch (err: any) {
      setProvisionMsg(`Provisioning failed: ${err?.response?.data?.detail || err.message}`);
    } finally {
      setIsProvisioning(false);
    }
  };

  const handleRunDateCheck = async () => {
    if (!checkDateInput) return;
    setIsCheckingDate(true);
    try {
      const res = await checkDatePeriod(checkDateInput, isAdjustmentInput);
      setDateCheckResult(res);
    } catch (err: any) {
      setDateCheckResult({
        can_post: false,
        message: err?.response?.data?.detail || 'Error validating date period.',
        period: null,
      });
    } finally {
      setIsCheckingDate(false);
    }
  };

  const openPeriodsCount = periods.filter((p) => p.status === 'OPEN').length;
  const isConfigured = !!(
    config?.accounts_receivable_account &&
    config?.accounts_payable_account &&
    config?.security_service_revenue_account
  );

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading Finance Overview...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.98))',
          padding: '24px',
          borderRadius: '12px',
          border: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>🏛️</span>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: '#f8fafc' }}>
              Security Finance Foundation
            </h2>
            <span
              style={{
                fontSize: '11px',
                padding: '3px 8px',
                borderRadius: '12px',
                background: isConfigured ? 'rgba(34, 197, 94, 0.2)' : 'rgba(234, 179, 8, 0.2)',
                color: isConfigured ? '#4ade80' : '#fde047',
                border: `1px solid ${isConfigured ? 'rgba(34, 197, 94, 0.4)' : 'rgba(234, 179, 8, 0.4)'}`,
              }}
            >
              {isConfigured ? '✓ Configured' : '⚠️ Setup Pending'}
            </span>
          </div>
          <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: '#94a3b8', maxWidth: '650px' }}>
            Central general ledger controls, Security Industry Chart of Accounts, accounting period locks, cost/profit center dimensions, and financial posting configurations.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleProvisionCOA}
            disabled={isProvisioning}
            style={{
              padding: '10px 18px',
              backgroundColor: '#3b82f6',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '13px',
              cursor: isProvisioning ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
            }}
          >
            <span>⚡</span>
            {isProvisioning ? 'Provisioning...' : 'Provision Standard Security COA'}
          </button>
        </div>
      </div>

      {provisionMsg && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            background: provisionMsg.includes('failed') ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
            border: `1px solid ${provisionMsg.includes('failed') ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)'}`,
            color: provisionMsg.includes('failed') ? '#fca5a5' : '#86efac',
            fontSize: '13px',
          }}
        >
          {provisionMsg}
        </div>
      )}

      {/* KPI Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '16px',
        }}
      >
        <div
          onClick={() => onNavigateTab('chart_of_accounts')}
          style={{
            background: 'var(--color-surface, #1e293b)',
            padding: '18px',
            borderRadius: '10px',
            border: '1px solid var(--color-border, rgba(255,255,255,0.06))',
            cursor: 'pointer',
            transition: 'transform 0.15s ease',
          }}
        >
          <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Chart of Accounts
          </div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: '#f8fafc', margin: '8px 0 4px 0' }}>
            {accounts.length}
          </div>
          <div style={{ fontSize: '12px', color: '#60a5fa' }}>Click to view accounts & tree →</div>
        </div>

        <div
          onClick={() => onNavigateTab('accounting_periods')}
          style={{
            background: 'var(--color-surface, #1e293b)',
            padding: '18px',
            borderRadius: '10px',
            border: '1px solid var(--color-border, rgba(255,255,255,0.06))',
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Fiscal Periods
          </div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: '#4ade80', margin: '8px 0 4px 0' }}>
            {openPeriodsCount}{' '}
            <span style={{ fontSize: '14px', color: '#94a3b8', fontWeight: 400 }}>/ {periods.length} Open</span>
          </div>
          <div style={{ fontSize: '12px', color: '#4ade80' }}>Click to manage periods →</div>
        </div>

        <div
          onClick={() => onNavigateTab('cost_centers')}
          style={{
            background: 'var(--color-surface, #1e293b)',
            padding: '18px',
            borderRadius: '10px',
            border: '1px solid var(--color-border, rgba(255,255,255,0.06))',
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Cost Centers
          </div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: '#f8fafc', margin: '8px 0 4px 0' }}>
            {costCentersCount}
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8' }}>HQ, Field Ops, HR, Finance</div>
        </div>

        <div
          onClick={() => onNavigateTab('profit_centers')}
          style={{
            background: 'var(--color-surface, #1e293b)',
            padding: '18px',
            borderRadius: '10px',
            border: '1px solid var(--color-border, rgba(255,255,255,0.06))',
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Profit Centers
          </div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: '#f8fafc', margin: '8px 0 4px 0' }}>
            {profitCentersCount}
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8' }}>Manned Guarding & CIT Escorts</div>
        </div>

        <div
          onClick={() => onNavigateTab('bank_accounts')}
          style={{
            background: 'var(--color-surface, #1e293b)',
            padding: '18px',
            borderRadius: '10px',
            border: '1px solid var(--color-border, rgba(255,255,255,0.06))',
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Bank & Cash Accounts
          </div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: '#38bdf8', margin: '8px 0 4px 0' }}>
            {bankAccountsCount}
          </div>
          <div style={{ fontSize: '12px', color: '#38bdf8' }}>Manage treasury & cash boxes →</div>
        </div>
      </div>

      {/* Dual Columns: Posting Validator & Quick Setup Summary */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: '20px',
        }}
      >
        {/* Date Posting Validator Widget */}
        <div
          style={{
            background: 'var(--color-surface, #1e293b)',
            padding: '20px',
            borderRadius: '12px',
            border: '1px solid var(--color-border, rgba(255,255,255,0.06))',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>🔒</span>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#f8fafc' }}>
              Transaction Posting Validator
            </h3>
          </div>
          <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
            Test whether financial transactions (e.g. client invoices, vendor bills, payroll entries) can be posted on a given date under current period locks.
          </p>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="date"
              value={checkDateInput}
              onChange={(e) => setCheckDateInput(e.target.value)}
              style={{
                padding: '8px 12px',
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '6px',
                color: '#f8fafc',
                fontSize: '13px',
              }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#cbd5e1', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isAdjustmentInput}
                onChange={(e) => setIsAdjustmentInput(e.target.checked)}
              />
              Is Period Adjustment
            </label>
            <button
              onClick={handleRunDateCheck}
              disabled={isCheckingDate}
              style={{
                padding: '8px 14px',
                background: '#475569',
                color: '#f8fafc',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {isCheckingDate ? 'Checking...' : 'Validate Date'}
            </button>
          </div>

          {dateCheckResult && (
            <div
              style={{
                padding: '12px',
                borderRadius: '8px',
                background: dateCheckResult.can_post ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                border: `1px solid ${dateCheckResult.can_post ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
              }}
            >
              <span style={{ fontSize: '18px' }}>{dateCheckResult.can_post ? '✅' : '❌'}</span>
              <div>
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: dateCheckResult.can_post ? '#4ade80' : '#f87171',
                  }}
                >
                  {dateCheckResult.can_post ? 'Posting Allowed' : 'Posting Blocked'}
                </div>
                <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '2px' }}>
                  {dateCheckResult.message}
                </div>
                {dateCheckResult.period && (
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                    Period #{dateCheckResult.period.period_number} ({dateCheckResult.period.start_date} to{' '}
                    {dateCheckResult.period.end_date}) — Status: <strong>{dateCheckResult.period.status}</strong>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Security Finance Posting Configuration Summary */}
        <div
          style={{
            background: 'var(--color-surface, #1e293b)',
            padding: '20px',
            borderRadius: '12px',
            border: '1px solid var(--color-border, rgba(255,255,255,0.06))',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px' }}>⚙️</span>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#f8fafc' }}>
                Control Accounts Setup
              </h3>
            </div>
            <button
              onClick={() => onNavigateTab('finance_setup')}
              style={{
                padding: '4px 10px',
                background: 'rgba(59, 130, 246, 0.15)',
                color: '#60a5fa',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Configure →
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ color: '#94a3b8' }}>Accounts Receivable (AR):</span>
              <span style={{ color: '#f8fafc', fontWeight: 500 }}>
                {config?.accounts_receivable_account_name || '1200 - Accounts Receivable'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ color: '#94a3b8' }}>Accounts Payable (AP):</span>
              <span style={{ color: '#f8fafc', fontWeight: 500 }}>
                {config?.accounts_payable_account_name || '2100 - Accounts Payable'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ color: '#94a3b8' }}>Security Guarding Revenue:</span>
              <span style={{ color: '#f8fafc', fontWeight: 500 }}>
                {config?.security_service_revenue_account_name || '4100 - Security Guarding Service Revenue'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ color: '#94a3b8' }}>Guard Salary Costs:</span>
              <span style={{ color: '#f8fafc', fontWeight: 500 }}>
                {config?.salary_cost_account_name || '5100 - Guard Base Salaries'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
              <span style={{ color: '#94a3b8' }}>Default Operating Bank:</span>
              <span style={{ color: '#f8fafc', fontWeight: 500 }}>
                {config?.default_bank_account_title || 'Main Operations Bank (HBL)'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
