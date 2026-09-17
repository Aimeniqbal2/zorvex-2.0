import React, { useState, useEffect } from 'react';
import {
  fetchProfitAndLoss,
  fetchBalanceSheet,
  fetchCashFlow,
  fetchStatementValidation,
  type ProfitAndLossReport,
  type BalanceSheetReport,
  type CashFlowReport,
  type StatementValidationReport,
  fetchCostCenters,
  fetchProfitCenters,
  type CostCenter,
  type ProfitCenter
} from '../api';

export const FinancialStatementsTab: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'PL' | 'BS' | 'CF'>('PL');

  // Filters
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [asOfDate, setAsOfDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedCostCenter, setSelectedCostCenter] = useState<string>('');
  const [selectedProfitCenter, setSelectedProfitCenter] = useState<string>('');

  // Dropdown options
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [profitCenters, setProfitCenters] = useState<ProfitCenter[]>([]);

  // Report States
  const [plReport, setPlReport] = useState<ProfitAndLossReport | null>(null);
  const [bsReport, setBsReport] = useState<BalanceSheetReport | null>(null);
  const [cfReport, setCfReport] = useState<CashFlowReport | null>(null);
  const [validationReport, setValidationReport] = useState<StatementValidationReport | null>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showValidationModal, setShowValidationModal] = useState<boolean>(false);

  useEffect(() => {
    loadDropdowns();
  }, []);

  useEffect(() => {
    loadActiveReport();
  }, [activeSubTab, startDate, endDate, asOfDate, selectedCostCenter, selectedProfitCenter]);

  const loadDropdowns = async () => {
    try {
      const [ccRes, pcRes] = await Promise.all([
        fetchCostCenters().catch(() => []),
        fetchProfitCenters().catch(() => [])
      ]);
      setCostCenters(ccRes);
      setProfitCenters(pcRes);
    } catch (err) {
      console.error('Failed to load dropdowns', err);
    }
  };

  const loadActiveReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const commonParams: Record<string, any> = {};
      if (startDate) commonParams.start_date = startDate;
      if (endDate) commonParams.end_date = endDate;
      if (selectedCostCenter) commonParams.cost_center_id = selectedCostCenter;
      if (selectedProfitCenter) commonParams.profit_center_id = selectedProfitCenter;

      if (activeSubTab === 'PL') {
        const data = await fetchProfitAndLoss(commonParams);
        setPlReport(data);
      } else if (activeSubTab === 'BS') {
        const data = await fetchBalanceSheet({ ...commonParams, as_of_date: asOfDate });
        setBsReport(data);
      } else if (activeSubTab === 'CF') {
        const data = await fetchCashFlow(commonParams);
        setCfReport(data);
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to fetch financial statement');
    } finally {
      setLoading(false);
    }
  };

  const handleRunValidation = async () => {
    try {
      const data = await fetchStatementValidation(asOfDate);
      setValidationReport(data);
      setShowValidationModal(true);
    } catch (err: any) {
      alert('Validation failed: ' + (err?.response?.data?.detail || err.message));
    }
  };

  const handleExportCSV = () => {
    let csvContent = 'data:text/csv;charset=utf-8,';
    if (activeSubTab === 'PL' && plReport) {
      csvContent += 'Profit & Loss Statement\n';
      csvContent += `Period,${plReport.period.start_date || 'Beginning'} to ${plReport.period.end_date || 'Today'}\n\n`;
      csvContent += `Total Revenue,${plReport.totals.total_revenue}\n`;
      csvContent += `Total Cost of Service,${plReport.totals.total_cost_of_service}\n`;
      csvContent += `Gross Profit,${plReport.totals.gross_profit}\n`;
      csvContent += `Gross Margin %,${plReport.totals.gross_margin_pct}%\n`;
      csvContent += `Operating Expenses,${plReport.totals.total_operating_expenses}\n`;
      csvContent += `Net Profit,${plReport.totals.net_profit}\n`;
    } else if (activeSubTab === 'BS' && bsReport) {
      csvContent += `Balance Sheet (As of ${bsReport.as_of_date})\n\n`;
      csvContent += `Total Assets,${bsReport.totals.total_assets}\n`;
      csvContent += `Total Liabilities,${bsReport.totals.total_liabilities}\n`;
      csvContent += `Total Equity,${bsReport.totals.total_equity}\n`;
      csvContent += `Balanced?,${bsReport.is_balanced ? 'YES' : 'NO'}\n`;
    } else if (activeSubTab === 'CF' && cfReport) {
      csvContent += `Cash Flow Statement\n\n`;
      csvContent += `Opening Cash,${cfReport.opening_cash}\n`;
      csvContent += `Operating Activities,${cfReport.operating_activities.total}\n`;
      csvContent += `Investing Activities,${cfReport.investing_activities.total}\n`;
      csvContent += `Financing Activities,${cfReport.financing_activities.total}\n`;
      csvContent += `Closing Cash,${cfReport.closing_cash}\n`;
    }
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${activeSubTab}_Report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const fmtCurrency = (val: number | string | undefined) => {
    const num = Number(val || 0);
    return `PKR ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div style={{ padding: '24px', background: 'var(--color-bg-primary, #0f172a)', color: '#f8fafc', minHeight: '100vh' }}>
      {/* HEADER BAR */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0, color: '#38bdf8' }}>
            📊 Financial Statements & Reports
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '14px', marginTop: '4px' }}>
            Authoritative, double-entry general ledger statements for executive governance
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={handleRunValidation}
            style={{
              padding: '10px 18px',
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            🛡️ Statement Integrity Check
          </button>
          <button
            onClick={handleExportCSV}
            style={{
              padding: '10px 18px',
              background: 'var(--color-surface-elevated, #1e293b)',
              color: '#e2e8f0',
              border: '1px solid #334155',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            📥 Export CSV
          </button>
        </div>
      </div>

      {/* UNPOSTED ITEMS WARNING BANNER */}
      {plReport?.has_unposted_items && (
        <div
          style={{
            background: 'rgba(234, 179, 8, 0.15)',
            border: '1px solid #eab308',
            borderRadius: '8px',
            padding: '14px 20px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            color: '#fef08a'
          }}
        >
          <span style={{ fontSize: '20px' }}>⚠️</span>
          <div>
            <strong>Unposted Queue Alert:</strong> {plReport.unposted_warning} Financial statements reflect POSTED entries only.
          </div>
        </div>
      )}

      {/* SUB-TABS NAVIGATION */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid #334155', paddingBottom: '8px' }}>
        <button
          onClick={() => setActiveSubTab('PL')}
          style={{
            padding: '10px 20px',
            background: activeSubTab === 'PL' ? '#0284c7' : 'transparent',
            color: activeSubTab === 'PL' ? '#fff' : '#94a3b8',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          📈 Profit & Loss Statement
        </button>
        <button
          onClick={() => setActiveSubTab('BS')}
          style={{
            padding: '10px 20px',
            background: activeSubTab === 'BS' ? '#0284c7' : 'transparent',
            color: activeSubTab === 'BS' ? '#fff' : '#94a3b8',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          ⚖️ Balance Sheet
        </button>
        <button
          onClick={() => setActiveSubTab('CF')}
          style={{
            padding: '10px 20px',
            background: activeSubTab === 'CF' ? '#0284c7' : 'transparent',
            color: activeSubTab === 'CF' ? '#fff' : '#94a3b8',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          💧 Cash Flow Statement
        </button>
      </div>

      {/* FILTERS BAR */}
      <div
        style={{
          background: 'var(--color-surface, #1e293b)',
          padding: '16px',
          borderRadius: '8px',
          marginBottom: '24px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '16px',
          alignItems: 'center'
        }}
      >
        {activeSubTab !== 'BS' ? (
          <>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{ padding: '8px', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '4px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{ padding: '8px', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '4px' }}
              />
            </div>
          </>
        ) : (
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>As of Date</label>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              style={{ padding: '8px', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '4px' }}
            />
          </div>
        )}

        <div>
          <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Cost Center</label>
          <select
            value={selectedCostCenter}
            onChange={(e) => setSelectedCostCenter(e.target.value)}
            style={{ padding: '8px', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '4px', minWidth: '160px' }}
          >
            <option value="">All Cost Centers</option>
            {costCenters.map((cc) => (
              <option key={cc.id} value={cc.id}>{cc.name} ({cc.code})</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Profit Center</label>
          <select
            value={selectedProfitCenter}
            onChange={(e) => setSelectedProfitCenter(e.target.value)}
            style={{ padding: '8px', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '4px', minWidth: '160px' }}
          >
            <option value="">All Profit Centers</option>
            {profitCenters.map((pc) => (
              <option key={pc.id} value={pc.id}>{pc.name} ({pc.code})</option>
            ))}
          </select>
        </div>

        <button
          onClick={loadActiveReport}
          style={{
            marginTop: '18px',
            padding: '8px 16px',
            background: '#0284c7',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          🔄 Refresh
        </button>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: '40px', color: '#38bdf8' }}>⏳ Generating authoritative GL statement...</div>}
      {error && <div style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', color: '#fca5a5', padding: '16px', borderRadius: '8px' }}>{error}</div>}

      {/* ------------------------------------------------------------------ */}
      {/* 1. PROFIT & LOSS SUB-TAB */}
      {/* ------------------------------------------------------------------ */}
      {!loading && activeSubTab === 'PL' && plReport && (
        <div>
          {/* Summary KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #3b82f6' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>Total Revenue</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#60a5fa' }}>{fmtCurrency(plReport.totals.total_revenue)}</div>
            </div>
            <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #f97316' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>Cost of Services</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#fb923c' }}>{fmtCurrency(plReport.totals.total_cost_of_service)}</div>
            </div>
            <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #10b981' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>Gross Profit (Margin %)</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#34d399' }}>
                {fmtCurrency(plReport.totals.gross_profit)} ({plReport.totals.gross_margin_pct}%)
              </div>
            </div>
            <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #a855f7' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>Net Profit (Margin %)</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#c084fc' }}>
                {fmtCurrency(plReport.totals.net_profit)} ({plReport.totals.net_margin_pct}%)
              </div>
            </div>
          </div>

          {/* Security Revenue & Direct Cost Breakdowns */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
            <div style={{ background: '#1e293b', padding: '20px', borderRadius: '8px' }}>
              <h3 style={{ fontSize: '16px', color: '#38bdf8', marginBottom: '16px', borderBottom: '1px solid #334155', paddingBottom: '8px' }}>
                🛡️ Security Revenue Breakdown
              </h3>
              <table style={{ width: '100%', fontSize: '14px', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr><td style={{ padding: '8px 0', color: '#cbd5e1' }}>Guarding Revenue</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtCurrency(plReport.security_revenue_breakdown.guarding_revenue)}</td></tr>
                  <tr><td style={{ padding: '8px 0', color: '#cbd5e1' }}>Overtime Revenue</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtCurrency(plReport.security_revenue_breakdown.overtime_revenue)}</td></tr>
                  <tr><td style={{ padding: '8px 0', color: '#cbd5e1' }}>Extra Duty Revenue</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtCurrency(plReport.security_revenue_breakdown.extra_duty_revenue)}</td></tr>
                  <tr><td style={{ padding: '8px 0', color: '#cbd5e1' }}>VIP / Escort Revenue</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtCurrency(plReport.security_revenue_breakdown.vip_escort_revenue)}</td></tr>
                  <tr><td style={{ padding: '8px 0', color: '#cbd5e1' }}>Equipment / Rental Revenue</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtCurrency(plReport.security_revenue_breakdown.equipment_rental_revenue)}</td></tr>
                  <tr><td style={{ padding: '8px 0', color: '#cbd5e1' }}>Other Service Revenue</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtCurrency(plReport.security_revenue_breakdown.other_service_revenue)}</td></tr>
                </tbody>
              </table>
            </div>

            <div style={{ background: '#1e293b', padding: '20px', borderRadius: '8px' }}>
              <h3 style={{ fontSize: '16px', color: '#f97316', marginBottom: '16px', borderBottom: '1px solid #334155', paddingBottom: '8px' }}>
                👮 Direct Cost of Service Breakdown
              </h3>
              <table style={{ width: '100%', fontSize: '14px', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr><td style={{ padding: '8px 0', color: '#cbd5e1' }}>Guard Salaries</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtCurrency(plReport.cost_of_service_breakdown.guard_salaries)}</td></tr>
                  <tr><td style={{ padding: '8px 0', color: '#cbd5e1' }}>Supervisor Salaries</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtCurrency(plReport.cost_of_service_breakdown.supervisor_salaries)}</td></tr>
                  <tr><td style={{ padding: '8px 0', color: '#cbd5e1' }}>Employee Overtime</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtCurrency(plReport.cost_of_service_breakdown.employee_ot)}</td></tr>
                  <tr><td style={{ padding: '8px 0', color: '#cbd5e1' }}>Uniform & Tactical Gear</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtCurrency(plReport.cost_of_service_breakdown.uniform_gear)}</td></tr>
                  <tr><td style={{ padding: '8px 0', color: '#cbd5e1' }}>Site Transport & Fuel</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtCurrency(plReport.cost_of_service_breakdown.site_transport)}</td></tr>
                  <tr><td style={{ padding: '8px 0', color: '#cbd5e1' }}>Operational Equipment</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtCurrency(plReport.cost_of_service_breakdown.operational_equipment)}</td></tr>
                  <tr><td style={{ padding: '8px 0', color: '#cbd5e1' }}>Other Direct Site Costs</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtCurrency(plReport.cost_of_service_breakdown.other_direct_costs)}</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Full Hierarchical Account Table */}
          <div style={{ background: '#1e293b', borderRadius: '8px', padding: '20px' }}>
            <h3 style={{ fontSize: '16px', color: '#e2e8f0', marginBottom: '16px' }}>Detailed General Ledger P&L Statement</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ background: '#0f172a', textAlign: 'left', color: '#94a3b8' }}>
                  <th style={{ padding: '12px' }}>Code</th>
                  <th style={{ padding: '12px' }}>Account Name</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>Amount (PKR)</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ background: '#334155', fontWeight: 700, color: '#38bdf8' }}><td colSpan={3} style={{ padding: '10px 12px' }}>REVENUE</td></tr>
                {plReport.lines.revenue.map((l) => (
                  <tr key={l.account_id} style={{ borderBottom: '1px solid #334155' }}>
                    <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{l.account_code}</td>
                    <td style={{ padding: '10px 12px' }}>{l.account_name}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>{fmtCurrency(l.amount)}</td>
                  </tr>
                ))}

                <tr style={{ background: '#334155', fontWeight: 700, color: '#fb923c' }}><td colSpan={3} style={{ padding: '10px 12px' }}>COST OF SERVICE</td></tr>
                {plReport.lines.cost_of_service.map((l) => (
                  <tr key={l.account_id} style={{ borderBottom: '1px solid #334155' }}>
                    <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{l.account_code}</td>
                    <td style={{ padding: '10px 12px' }}>{l.account_name}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>({fmtCurrency(l.amount)})</td>
                  </tr>
                ))}

                <tr style={{ background: '#1e293b', fontWeight: 700, color: '#34d399', fontSize: '15px' }}>
                  <td colSpan={2} style={{ padding: '12px' }}>GROSS PROFIT</td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>{fmtCurrency(plReport.totals.gross_profit)}</td>
                </tr>

                <tr style={{ background: '#334155', fontWeight: 700, color: '#f43f5e' }}><td colSpan={3} style={{ padding: '10px 12px' }}>OPERATING EXPENSES</td></tr>
                {plReport.lines.operating_expenses.map((l) => (
                  <tr key={l.account_id} style={{ borderBottom: '1px solid #334155' }}>
                    <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{l.account_code}</td>
                    <td style={{ padding: '10px 12px' }}>{l.account_name}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>({fmtCurrency(l.amount)})</td>
                  </tr>
                ))}

                <tr style={{ background: '#0f172a', fontWeight: 700, color: '#c084fc', fontSize: '16px' }}>
                  <td colSpan={2} style={{ padding: '14px' }}>NET PROFIT / (LOSS)</td>
                  <td style={{ padding: '14px', textAlign: 'right' }}>{fmtCurrency(plReport.totals.net_profit)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 2. BALANCE SHEET SUB-TAB */}
      {/* ------------------------------------------------------------------ */}
      {!loading && activeSubTab === 'BS' && bsReport && (
        <div>
          {/* Equation Verification Banner */}
          <div
            style={{
              background: bsReport.is_balanced ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              border: `1px solid ${bsReport.is_balanced ? '#10b981' : '#ef4444'}`,
              borderRadius: '8px',
              padding: '16px 20px',
              marginBottom: '24px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <div>
              <strong style={{ fontSize: '16px', color: bsReport.is_balanced ? '#34d399' : '#fca5a5' }}>
                {bsReport.is_balanced ? '✅ BALANCE SHEET BALANCED (Assets = Liabilities + Equity)' : '❌ BALANCE VARIANCE DETECTED'}
              </strong>
              {bsReport.management_notice && <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>{bsReport.management_notice}</div>}
            </div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: bsReport.is_balanced ? '#34d399' : '#fca5a5' }}>
              Diff: {fmtCurrency(bsReport.balance_difference)}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            {/* ASSETS COLUMN */}
            <div style={{ background: '#1e293b', padding: '20px', borderRadius: '8px' }}>
              <h3 style={{ fontSize: '18px', color: '#38bdf8', marginBottom: '16px', borderBottom: '1px solid #334155', paddingBottom: '8px' }}>
                ASSETS
              </h3>
              <div style={{ marginBottom: '16px' }}>
                <h4 style={{ color: '#94a3b8', fontSize: '14px' }}>Cash & Bank Balances</h4>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#e2e8f0' }}>{fmtCurrency(bsReport.assets.cash_and_bank.total)}</div>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <h4 style={{ color: '#94a3b8', fontSize: '14px' }}>Accounts Receivable</h4>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#e2e8f0' }}>{fmtCurrency(bsReport.assets.accounts_receivable.total)}</div>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <h4 style={{ color: '#94a3b8', fontSize: '14px' }}>Employee Advances & Prepayments</h4>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#e2e8f0' }}>{fmtCurrency(bsReport.assets.employee_advances.total)}</div>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <h4 style={{ color: '#94a3b8', fontSize: '14px' }}>Tax Recoverable Assets</h4>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#e2e8f0' }}>{fmtCurrency(bsReport.assets.tax_recoverable.total)}</div>
              </div>
              <div style={{ borderTop: '2px solid #3b82f6', paddingTop: '12px', marginTop: '24px', display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: 700, color: '#60a5fa' }}>
                <span>TOTAL ASSETS</span>
                <span>{fmtCurrency(bsReport.totals.total_assets)}</span>
              </div>
            </div>

            {/* LIABILITIES & EQUITY COLUMN */}
            <div style={{ background: '#1e293b', padding: '20px', borderRadius: '8px' }}>
              <h3 style={{ fontSize: '18px', color: '#f97316', marginBottom: '16px', borderBottom: '1px solid #334155', paddingBottom: '8px' }}>
                LIABILITIES
              </h3>
              <div style={{ marginBottom: '12px' }}>
                <h4 style={{ color: '#94a3b8', fontSize: '14px' }}>Accounts Payable</h4>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#e2e8f0' }}>{fmtCurrency(bsReport.liabilities.accounts_payable.total)}</div>
              </div>
              <div style={{ marginBottom: '12px' }}>
                <h4 style={{ color: '#94a3b8', fontSize: '14px' }}>Payroll & Salary Payable</h4>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#e2e8f0' }}>{fmtCurrency(bsReport.liabilities.payroll_payable.total)}</div>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <h4 style={{ color: '#94a3b8', fontSize: '14px' }}>Tax Payable Liabilities</h4>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#e2e8f0' }}>{fmtCurrency(bsReport.liabilities.tax_payable.total)}</div>
              </div>

              <h3 style={{ fontSize: '18px', color: '#a855f7', marginTop: '24px', marginBottom: '16px', borderBottom: '1px solid #334155', paddingBottom: '8px' }}>
                EQUITY
              </h3>
              <div style={{ marginBottom: '12px' }}>
                <h4 style={{ color: '#94a3b8', fontSize: '14px' }}>Share Capital</h4>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#e2e8f0' }}>{fmtCurrency(bsReport.equity.capital.total)}</div>
              </div>
              <div style={{ marginBottom: '12px' }}>
                <h4 style={{ color: '#94a3b8', fontSize: '14px' }}>Retained Earnings (Prior Years)</h4>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#e2e8f0' }}>{fmtCurrency(bsReport.equity.retained_earnings.total)}</div>
              </div>
              <div style={{ marginBottom: '16px', background: '#0f172a', padding: '12px', borderRadius: '6px', borderLeft: '4px solid #c084fc' }}>
                <h4 style={{ color: '#c084fc', fontSize: '14px', margin: 0 }}>Current Period Profit / (Loss)</h4>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#fff', marginTop: '4px' }}>{fmtCurrency(bsReport.equity.current_period_profit)}</div>
              </div>

              <div style={{ borderTop: '2px solid #a855f7', paddingTop: '12px', marginTop: '24px', display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: 700, color: '#c084fc' }}>
                <span>TOTAL LIABILITIES & EQUITY</span>
                <span>{fmtCurrency(bsReport.totals.total_liabilities_and_equity)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 3. CASH FLOW SUB-TAB */}
      {/* ------------------------------------------------------------------ */}
      {!loading && activeSubTab === 'CF' && cfReport && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>Opening Cash</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#94a3b8' }}>{fmtCurrency(cfReport.opening_cash)}</div>
            </div>
            <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #10b981' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>Operating Cash Flow</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#34d399' }}>{fmtCurrency(cfReport.operating_activities.total)}</div>
            </div>
            <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #3b82f6' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>Net Cash Movement</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#60a5fa' }}>{fmtCurrency(cfReport.net_cash_movement)}</div>
            </div>
            <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #38bdf8' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>Closing Cash Balance</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#38bdf8' }}>{fmtCurrency(cfReport.closing_cash)}</div>
            </div>
          </div>

          <div style={{ background: '#1e293b', borderRadius: '8px', padding: '20px' }}>
            <h3 style={{ fontSize: '16px', color: '#38bdf8', marginBottom: '16px' }}>Operating Cash Activities</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ background: '#0f172a', color: '#94a3b8', textAlign: 'left' }}>
                  <th style={{ padding: '10px' }}>Date</th>
                  <th style={{ padding: '10px' }}>Entry #</th>
                  <th style={{ padding: '10px' }}>Description</th>
                  <th style={{ padding: '10px' }}>Offset Account</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>Amount (PKR)</th>
                </tr>
              </thead>
              <tbody>
                {cfReport.operating_activities.lines.map((l, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #334155' }}>
                    <td style={{ padding: '10px', color: '#94a3b8' }}>{l.posting_date}</td>
                    <td style={{ padding: '10px' }}>{l.entry_number}</td>
                    <td style={{ padding: '10px' }}>{l.description}</td>
                    <td style={{ padding: '10px', color: '#cbd5e1' }}>{l.offset_account}</td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 600, color: l.amount >= 0 ? '#34d399' : '#f87171' }}>
                      {fmtCurrency(l.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* INTEGRITY CHECK MODAL */}
      {showValidationModal && validationReport && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#1e293b', padding: '24px', borderRadius: '12px', maxWidth: '600px', width: '100%', color: '#fff' }}>
            <h2 style={{ fontSize: '20px', color: '#38bdf8', marginTop: 0 }}>🛡️ Financial Statement Audit & Integrity Validation</h2>
            <p style={{ color: '#94a3b8', fontSize: '14px' }}>As of Date: {validationReport.as_of_date}</p>

            <div style={{ margin: '20px 0' }}>
              {validationReport.checks.map((chk, i) => (
                <div key={i} style={{ background: '#0f172a', padding: '14px', borderRadius: '8px', marginBottom: '12px', borderLeft: `4px solid ${chk.passed ? '#10b981' : '#ef4444'}` }}>
                  <div style={{ fontWeight: 600, color: chk.passed ? '#34d399' : '#fca5a5' }}>
                    {chk.passed ? '✅ PASSED' : '❌ FAILED'}: {chk.name}
                  </div>
                  <div style={{ fontSize: '13px', color: '#cbd5e1', marginTop: '4px' }}>{chk.details}</div>
                </div>
              ))}
            </div>

            <div style={{ textAlign: 'right' }}>
              <button onClick={() => setShowValidationModal(false)} style={{ padding: '8px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>
                Close Audit Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
