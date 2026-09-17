import React, { useEffect, useState } from 'react';
import type {
  ExecutiveDashboardData,
  FinancialHealthSummary,
  FinanceActionItem
} from '../api';
import {
  fetchExecutiveOverview,
  fetchFinancialHealth,
  fetchRevenueExpenseTrends,
  fetchReceivablesSnapshot,
  fetchPayablesSnapshot,
  fetchPayrollSnapshot,
  fetchTaxSnapshot,
  fetchTreasurySnapshot,
  fetchProfitabilitySnapshot,
  fetchAccountingHealth,
  fetchFinanceActionCenter
} from '../api';

interface ExecutiveFinanceDashboardTabProps {
  onNavigateTab?: (tabId: string) => void;
}

export const ExecutiveFinanceDashboardTab: React.FC<ExecutiveFinanceDashboardTabProps> = ({ onNavigateTab }) => {
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<ExecutiveDashboardData | null>(null);
  const [health, setHealth] = useState<FinancialHealthSummary | null>(null);
  const [trends, setTrends] = useState<any[]>([]);
  const [arSnapshot, setArSnapshot] = useState<any>(null);
  const [apSnapshot, setApSnapshot] = useState<any>(null);
  const [payrollSnapshot, setPayrollSnapshot] = useState<any>(null);
  const [taxSnapshot, setTaxSnapshot] = useState<any>(null);
  const [treasurySnapshot, setTreasurySnapshot] = useState<any>(null);
  const [profitabilitySnapshot, setProfitabilitySnapshot] = useState<any>(null);
  const [acctHealth, setAcctHealth] = useState<any>(null);
  const [actionQueue, setActionQueue] = useState<FinanceActionItem[]>([]);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [
        dashRes, healthRes, trendRes, arRes, apRes, payRes, taxRes, tresRes, profRes, acctRes, actRes
      ] = await Promise.all([
        fetchExecutiveOverview(),
        fetchFinancialHealth(),
        fetchRevenueExpenseTrends(),
        fetchReceivablesSnapshot(),
        fetchPayablesSnapshot(),
        fetchPayrollSnapshot(),
        fetchTaxSnapshot(),
        fetchTreasurySnapshot(),
        fetchProfitabilitySnapshot(),
        fetchAccountingHealth(),
        fetchFinanceActionCenter()
      ]);

      setDashboard(dashRes);
      setHealth(healthRes);
      setTrends(trendRes || []);
      setArSnapshot(arRes);
      setApSnapshot(apRes);
      setPayrollSnapshot(payRes);
      setTaxSnapshot(taxRes);
      setTreasurySnapshot(tresRes);
      setProfitabilitySnapshot(profRes);
      setAcctHealth(acctRes);
      setActionQueue(actRes || []);
    } catch (err) {
      console.error("Error loading Executive Finance Dashboard:", err);
    } finally {
      setLoading(false);
    }
  };

  const getHealthBadge = (status: string) => {
    if (status === 'HEALTHY') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontWeight: 600, fontSize: '0.8rem' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
          HEALTHY
        </span>
      );
    }
    if (status === 'ATTENTION') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', fontWeight: 600, fontSize: '0.8rem' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f59e0b' }}></span>
          ATTENTION
        </span>
      );
    }
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', fontWeight: 600, fontSize: '0.8rem' }}>
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444' }}></span>
        CRITICAL
      </span>
    );
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-secondary, #94a3b8)' }}>
        <div className="spinner" style={{ marginBottom: '16px' }} />
        <h3>Loading Security Finance Executive Workspace...</h3>
      </div>
    );
  }

  const kpis = dashboard?.kpis;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* 1. Header Banner & Period Controls */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%)',
        borderRadius: '16px',
        padding: '24px',
        border: '1px solid var(--color-border, #334155)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <i className="bx bx-shield-quarter" style={{ fontSize: '26px', color: '#38bdf8' }}></i>
            <h2 style={{ margin: 0, fontSize: '1.6rem', color: '#f8fafc', fontWeight: 700 }}>
              Security Finance Executive Dashboard
            </h2>
          </div>
          <p style={{ margin: '6px 0 0 0', color: '#94a3b8', fontSize: '0.9rem' }}>
            Consolidated Financial Integrity Workspace — Real-time P&L, Health Diagnostics, Subledger Snapshots & Action Queue
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>CURRENT ACCOUNTING PERIOD</span>
            <span style={{ fontSize: '0.95rem', color: '#38bdf8', fontWeight: 600 }}>
              {dashboard?.period?.current_period_name || 'Active FY 2026'} ({dashboard?.period?.period_close_status})
            </span>
          </div>
          <button
            onClick={loadAllData}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              background: '#0284c7',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <i className="bx bx-refresh"></i>
            <span>Refresh Metrics</span>
          </button>
        </div>
      </div>

      {/* 2. Executive KPI Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px'
      }}>
        <div className="card" style={{ padding: '18px', background: 'var(--color-surface)', borderRadius: '12px', border: '1px solid var(--color-border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>REVENUE (THIS PERIOD)</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-primary, #0284c7)', marginTop: '6px' }}>
            PKR {Number(kpis?.revenue_this_period || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#16a34a', marginTop: '4px' }}>
            Gross Margin: {Number(kpis?.gross_margin_percentage || 0).toFixed(1)}%
          </div>
        </div>

        <div className="card" style={{ padding: '18px', background: 'var(--color-surface)', borderRadius: '12px', border: '1px solid var(--color-border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>NET PROFIT / LOSS</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: (kpis?.net_profit || 0) >= 0 ? '#16a34a' : '#dc2626', marginTop: '6px' }}>
            PKR {Number(kpis?.net_profit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            Net Margin: {Number(kpis?.net_margin_percentage || 0).toFixed(1)}%
          </div>
        </div>

        <div className="card" style={{ padding: '18px', background: 'var(--color-surface)', borderRadius: '12px', border: '1px solid var(--color-border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>CASH & BANK BALANCE</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#d97706', marginTop: '6px' }}>
            PKR {Number(kpis?.cash_bank_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            Collections: PKR {Number(kpis?.collections_this_period || 0).toLocaleString()}
          </div>
        </div>

        <div className="card" style={{ padding: '18px', background: 'var(--color-surface)', borderRadius: '12px', border: '1px solid var(--color-border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>ACCOUNTS RECEIVABLE</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text)', marginTop: '6px' }}>
            PKR {Number(kpis?.accounts_receivable || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '4px' }}>
            Overdue: PKR {Number(kpis?.overdue_receivables || 0).toLocaleString()}
          </div>
        </div>

        <div className="card" style={{ padding: '18px', background: 'var(--color-surface)', borderRadius: '12px', border: '1px solid var(--color-border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>ACCOUNTS PAYABLE</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text)', marginTop: '6px' }}>
            PKR {Number(kpis?.accounts_payable || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#d97706', marginTop: '4px' }}>
            Paid This Period: PKR {Number(kpis?.vendor_payments_this_period || 0).toLocaleString()}
          </div>
        </div>
      </div>

      {/* 3. Financial Health Summary Section */}
      <div style={{
        background: 'var(--color-surface)',
        borderRadius: '12px',
        padding: '20px',
        border: '1px solid var(--color-border)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
      }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i className="bx bx-pulse" style={{ fontSize: '20px', color: 'var(--color-primary, #0284c7)' }}></i>
          <span>Financial Health Diagnostics & Compliance Status</span>
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          
          <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--color-surface-secondary)', border: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Liquidity Position</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text)', marginTop: '2px' }}>
                Cash: PKR {Number(health?.liquidity?.cash_balance || 0).toLocaleString()}
              </div>
            </div>
            {getHealthBadge(health?.liquidity?.status || 'HEALTHY')}
          </div>

          <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--color-surface-secondary)', border: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Receivables Health</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text)', marginTop: '2px' }}>
                Overdue: PKR {Number(health?.receivables_health?.overdue_ar || 0).toLocaleString()}
              </div>
            </div>
            {getHealthBadge(health?.receivables_health?.status || 'HEALTHY')}
          </div>

          <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--color-surface-secondary)', border: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Payables Health</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text)', marginTop: '2px' }}>
                Overdue: PKR {Number(health?.payables_health?.overdue_ap || 0).toLocaleString()}
              </div>
            </div>
            {getHealthBadge(health?.payables_health?.status || 'HEALTHY')}
          </div>

          <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--color-surface-secondary)', border: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Payroll Liability</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text)', marginTop: '2px' }}>
                Failures: {health?.payroll_status?.failed_batches || 0}
              </div>
            </div>
            {getHealthBadge(health?.payroll_status?.status || 'HEALTHY')}
          </div>

          <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--color-surface-secondary)', border: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Tax Compliance</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text)', marginTop: '2px' }}>
                Unfiled: {health?.tax_compliance?.unfiled_vouchers || 0}
              </div>
            </div>
            {getHealthBadge(health?.tax_compliance?.status || 'HEALTHY')}
          </div>

          <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--color-surface-secondary)', border: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>GL Posting Queue</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text)', marginTop: '2px' }}>
                Unposted: {health?.gl_posting_status?.unposted_queue_count || 0}
              </div>
            </div>
            {getHealthBadge(health?.gl_posting_status?.status || 'HEALTHY')}
          </div>

        </div>
      </div>

      {/* 4. Finance Action Center Queue */}
      <div style={{
        background: 'var(--color-surface)',
        borderRadius: '12px',
        padding: '20px',
        border: '1px solid var(--color-border)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
      }}>
        <h3 style={{ margin: '0 0 14px 0', fontSize: '1.1rem', color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i className="bx bx-bolt-circle" style={{ fontSize: '20px', color: '#d97706' }}></i>
          <span>Finance Action Center ({actionQueue.length} Active Action Items)</span>
        </h3>
        {actionQueue.length === 0 ? (
          <div style={{ color: '#16a34a', fontSize: '0.9rem', padding: '12px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <i className="bx bx-check-circle" style={{ fontSize: '18px' }}></i>
            <span>Clear! No pending action items requiring financial attention.</span>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px' }}>
            {actionQueue.map((act) => (
              <div
                key={act.id}
                style={{
                  padding: '14px',
                  borderRadius: '10px',
                  background: act.severity === 'CRITICAL' ? 'rgba(239, 68, 68, 0.08)' : act.severity === 'HIGH' ? 'rgba(245, 158, 11, 0.08)' : 'var(--color-surface-secondary)',
                  border: `1px solid ${act.severity === 'CRITICAL' ? 'rgba(239, 68, 68, 0.3)' : act.severity === 'HIGH' ? 'rgba(245, 158, 11, 0.3)' : 'var(--color-border)'}`,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: act.severity === 'CRITICAL' ? '#dc2626' : '#d97706' }}>
                      {act.severity} • {act.category}
                    </span>
                    <span style={{ fontSize: '0.8rem', background: 'var(--color-surface)', padding: '2px 8px', borderRadius: '10px', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
                      Count: {act.count}
                    </span>
                  </div>
                  <h4 style={{ margin: '8px 0 4px 0', fontSize: '0.95rem', color: 'var(--color-text)' }}>{act.title}</h4>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{act.description}</p>
                </div>
                {onNavigateTab && (
                  <button
                    onClick={() => onNavigateTab(act.target_tab)}
                    style={{
                      marginTop: '12px',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      background: 'rgba(2, 132, 199, 0.12)',
                      color: 'var(--color-primary, #0284c7)',
                      border: '1px solid rgba(2, 132, 199, 0.25)',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      alignSelf: 'flex-start'
                    }}
                  >
                    Go to Workflow ➔
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. Revenue & Expense Trend Table */}
      <div style={{
        background: 'var(--color-surface)',
        borderRadius: '12px',
        padding: '20px',
        border: '1px solid var(--color-border)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
      }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i className="bx bx-line-chart" style={{ fontSize: '20px', color: 'var(--color-primary, #0284c7)' }}></i>
          <span>Posted GL Revenue, Expense & Cash Movement Trends (6-Month Horizon)</span>
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)', textTransform: 'uppercase', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                <th style={{ padding: '10px', textAlign: 'left' }}>Period</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Revenue</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Cost of Service</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Gross Profit</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Operating Expense</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Net Profit</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Cash In</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Cash Out</th>
              </tr>
            </thead>
            <tbody>
              {trends.map((tr, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '10px', fontWeight: 600, color: 'var(--color-text)' }}>{tr.month_name}</td>
                  <td style={{ padding: '10px', textAlign: 'right', color: 'var(--color-primary, #0284c7)' }}>PKR {Number(tr.revenue).toLocaleString()}</td>
                  <td style={{ padding: '10px', textAlign: 'right', color: 'var(--color-text)' }}>PKR {Number(tr.cost_of_services).toLocaleString()}</td>
                  <td style={{ padding: '10px', textAlign: 'right', fontWeight: 600, color: '#16a34a' }}>PKR {Number(tr.gross_profit).toLocaleString()}</td>
                  <td style={{ padding: '10px', textAlign: 'right', color: 'var(--color-text)' }}>PKR {Number(tr.operating_expenses).toLocaleString()}</td>
                  <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700, color: Number(tr.net_profit) >= 0 ? '#16a34a' : '#dc2626' }}>
                    PKR {Number(tr.net_profit).toLocaleString()}
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right', color: '#16a34a' }}>PKR {Number(tr.cash_in).toLocaleString()}</td>
                  <td style={{ padding: '10px', textAlign: 'right', color: '#dc2626' }}>PKR {Number(tr.cash_out).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. Sub-Module Snapshots Grid (AR, AP, Payroll, Tax, Treasury, Profitability) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
        
        {/* AR Snapshot */}
        <div style={{ background: 'var(--color-surface)', padding: '16px', borderRadius: '12px', border: '1px solid var(--color-border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h4 style={{ margin: 0, color: 'var(--color-text)', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i className="bx bx-target-lock" style={{ color: 'var(--color-primary, #0284c7)' }}></i>
              <span>Receivables Snapshot (S-4C)</span>
            </h4>
            {onNavigateTab && <button onClick={() => onNavigateTab('ar_recovery')} style={{ background: 'none', border: 'none', color: 'var(--color-primary, #0284c7)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>Drill Down ➔</button>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Total AR Balance:</span>
              <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>PKR {Number(arSnapshot?.total_ar || 0).toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Current (0-30 Days):</span>
              <span style={{ color: 'var(--color-text)' }}>PKR {Number(arSnapshot?.current || 0).toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Overdue (31-60 Days):</span>
              <span style={{ color: '#d97706', fontWeight: 600 }}>PKR {Number(arSnapshot?.b_31_60 || 0).toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Critical Overdue (90+ Days):</span>
              <span style={{ color: '#dc2626', fontWeight: 600 }}>PKR {Number(arSnapshot?.b_90_plus || 0).toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--color-border)', paddingTop: '6px', marginTop: '4px' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Disputed / Broken Promises:</span>
              <span style={{ color: '#dc2626', fontWeight: 600 }}>{arSnapshot?.disputed_count || 0} / {arSnapshot?.broken_promises_count || 0}</span>
            </div>
          </div>
        </div>

        {/* AP Snapshot */}
        <div style={{ background: 'var(--color-surface)', padding: '16px', borderRadius: '12px', border: '1px solid var(--color-border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h4 style={{ margin: 0, color: 'var(--color-text)', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i className="bx bx-cart" style={{ color: 'var(--color-primary, #0284c7)' }}></i>
              <span>Payables Snapshot (S-4F)</span>
            </h4>
            {onNavigateTab && <button onClick={() => onNavigateTab('purchasing_integration')} style={{ background: 'none', border: 'none', color: 'var(--color-primary, #0284c7)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>Drill Down ➔</button>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Total AP Balance:</span>
              <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>PKR {Number(apSnapshot?.total_ap || 0).toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Due Within 7 Days:</span>
              <span style={{ color: '#d97706', fontWeight: 600 }}>PKR {Number(apSnapshot?.due_soon_ap || 0).toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Overdue Bills:</span>
              <span style={{ color: '#dc2626', fontWeight: 600 }}>PKR {Number(apSnapshot?.overdue_ap || 0).toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--color-border)', paddingTop: '6px', marginTop: '4px' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Unallocated Vendor Credits:</span>
              <span style={{ color: '#16a34a', fontWeight: 600 }}>PKR {Number(apSnapshot?.unallocated_vendor_credits || 0).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Treasury Snapshot */}
        <div style={{ background: 'var(--color-surface)', padding: '16px', borderRadius: '12px', border: '1px solid var(--color-border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h4 style={{ margin: 0, color: 'var(--color-text)', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i className="bx bx-landmark" style={{ color: 'var(--color-primary, #0284c7)' }}></i>
              <span>Treasury Snapshot (S-4D)</span>
            </h4>
            {onNavigateTab && <button onClick={() => onNavigateTab('treasury')} style={{ background: 'none', border: 'none', color: 'var(--color-primary, #0284c7)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>Drill Down ➔</button>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Operational Liquidity:</span>
              <span style={{ fontWeight: 600, color: '#16a34a' }}>PKR {Number(treasurySnapshot?.operational_balance || 0).toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Uncleared Cheques:</span>
              <span style={{ color: 'var(--color-text)' }}>PKR {Number(treasurySnapshot?.uncleared_cheques_amount || 0).toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Unreconciled Bank Lines:</span>
              <span style={{ color: '#d97706', fontWeight: 600 }}>{treasurySnapshot?.unreconciled_bank_lines_count || 0} line(s)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--color-border)', paddingTop: '6px', marginTop: '4px' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Cash Count Variances:</span>
              <span style={{ color: treasurySnapshot?.cash_count_variances_count ? '#dc2626' : '#16a34a', fontWeight: 600 }}>{treasurySnapshot?.cash_count_variances_count || 0} flagged</span>
            </div>
          </div>
        </div>

        {/* Payroll Snapshot */}
        <div style={{ background: 'var(--color-surface)', padding: '16px', borderRadius: '12px', border: '1px solid var(--color-border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h4 style={{ margin: 0, color: 'var(--color-text)', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i className="bx bx-user-check" style={{ color: 'var(--color-primary, #0284c7)' }}></i>
              <span>Payroll Finance (S-4G)</span>
            </h4>
            {onNavigateTab && <button onClick={() => onNavigateTab('payroll_finance')} style={{ background: 'none', border: 'none', color: 'var(--color-primary, #0284c7)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>Drill Down ➔</button>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Net Payroll Payable:</span>
              <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>PKR {Number(payrollSnapshot?.net_payroll_amount || 0).toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Paid Salary Transfers:</span>
              <span style={{ color: '#16a34a' }}>PKR {Number(payrollSnapshot?.paid_amount || 0).toLocaleString()} ({payrollSnapshot?.successful_transfers || 0} batches)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Outstanding Liability:</span>
              <span style={{ color: '#d97706', fontWeight: 600 }}>PKR {Number(payrollSnapshot?.outstanding_liability || 0).toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--color-border)', paddingTop: '6px', marginTop: '4px' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Failed Transfers:</span>
              <span style={{ color: payrollSnapshot?.failed_transfers ? '#dc2626' : '#16a34a', fontWeight: 600 }}>{payrollSnapshot?.failed_transfers || 0} batch(es)</span>
            </div>
          </div>
        </div>

        {/* Tax Snapshot */}
        <div style={{ background: 'var(--color-surface)', padding: '16px', borderRadius: '12px', border: '1px solid var(--color-border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h4 style={{ margin: 0, color: 'var(--color-text)', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i className="bx bx-pie-chart-alt-2" style={{ color: 'var(--color-primary, #0284c7)' }}></i>
              <span>Tax & Withholding (S-4H)</span>
            </h4>
            {onNavigateTab && <button onClick={() => onNavigateTab('tax_management')} style={{ background: 'none', border: 'none', color: 'var(--color-primary, #0284c7)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>Drill Down ➔</button>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Output Tax Collected:</span>
              <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>PKR {Number(taxSnapshot?.output_tax || 0).toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Input Tax Recoverable:</span>
              <span style={{ color: '#16a34a' }}>PKR {Number(taxSnapshot?.recoverable_input_tax || 0).toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Vendor WHT Payable:</span>
              <span style={{ color: '#d97706', fontWeight: 600 }}>PKR {Number(taxSnapshot?.vendor_wht_payable || 0).toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--color-border)', paddingTop: '6px', marginTop: '4px' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Unfiled Tax Vouchers:</span>
              <span style={{ color: taxSnapshot?.unfiled_tax_vouchers_count ? '#d97706' : '#16a34a', fontWeight: 600 }}>{taxSnapshot?.unfiled_tax_vouchers_count || 0} voucher(s)</span>
            </div>
          </div>
        </div>

        {/* Accounting Health Snapshot */}
        <div style={{ background: 'var(--color-surface)', padding: '16px', borderRadius: '12px', border: '1px solid var(--color-border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h4 style={{ margin: 0, color: 'var(--color-text)', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i className="bx bx-book-open" style={{ color: 'var(--color-primary, #0284c7)' }}></i>
              <span>Accounting Integrity (S-4I/K)</span>
            </h4>
            {onNavigateTab && <button onClick={() => onNavigateTab('general_ledger')} style={{ background: 'none', border: 'none', color: 'var(--color-primary, #0284c7)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>Drill Down ➔</button>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Trial Balance Equation:</span>
              <span style={{ fontWeight: 600, color: acctHealth?.trial_balance_status === 'BALANCED' ? '#16a34a' : '#dc2626' }}>
                {acctHealth?.trial_balance_status || 'BALANCED'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Balance Sheet Equation:</span>
              <span style={{ fontWeight: 600, color: acctHealth?.balance_sheet_status === 'BALANCED' ? '#16a34a' : '#dc2626' }}>
                {acctHealth?.balance_sheet_status || 'BALANCED'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Unposted Entry Queue:</span>
              <span style={{ color: 'var(--color-text)' }}>{acctHealth?.unposted_queue_count || 0} entry(ies)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--color-border)', paddingTop: '6px', marginTop: '4px' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Reversed Journal Entries:</span>
              <span style={{ color: 'var(--color-text)' }}>{acctHealth?.reversed_journals_count || 0} entry(ies)</span>
            </div>
          </div>
        </div>

        {/* Profitability Snapshot */}
        <div style={{ background: 'var(--color-surface)', padding: '16px', borderRadius: '12px', border: '1px solid var(--color-border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h4 style={{ margin: 0, color: 'var(--color-text)', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i className="bx bx-building-house" style={{ color: 'var(--color-primary, #0284c7)' }}></i>
              <span>Site Profitability (S-4J)</span>
            </h4>
            {onNavigateTab && <button onClick={() => onNavigateTab('profitability_workspace')} style={{ background: 'none', border: 'none', color: 'var(--color-primary, #0284c7)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>Drill Down ➔</button>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Low-Margin Contracts:</span>
              <span style={{ color: '#d97706', fontWeight: 600 }}>{profitabilitySnapshot?.low_margin_contracts_count || 0} contract(s)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Loss-Making Sites:</span>
              <span style={{ color: '#dc2626', fontWeight: 600 }}>{profitabilitySnapshot?.loss_making_sites_count || 0} site(s)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Unattributed GL Lines:</span>
              <span style={{ color: 'var(--color-text)' }}>{profitabilitySnapshot?.unattributed_lines_count || 0} line(s)</span>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};
