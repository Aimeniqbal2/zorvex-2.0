import React, { useState, useEffect } from 'react';
import {
  fetchSiteProfitability,
  fetchClientProfitability,
  fetchContractProfitability,
  fetchUnattributedLines,
  fetchProfitabilityDrilldown,
  fetchAllocationProfiles,
  createAllocationProfile,
  deleteAllocationProfile,
  type SiteProfitabilityRow,
  type ClientProfitabilityRow,
  type ContractProfitabilityRow,
  type UnattributedLineException,
  type AllocationProfileItem
} from '../api';

export const ProfitabilityWorkspaceTab: React.FC = () => {
  const [subView, setSubView] = useState<'SITES' | 'CLIENTS' | 'CONTRACTS' | 'ALLOCATIONS' | 'EXCEPTIONS'>('SITES');

  // Filters
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Data states
  const [sites, setSites] = useState<SiteProfitabilityRow[]>([]);
  const [clients, setClients] = useState<ClientProfitabilityRow[]>([]);
  const [contracts, setContracts] = useState<ContractProfitabilityRow[]>([]);
  const [exceptions, setExceptions] = useState<UnattributedLineException[]>([]);
  const [allocations, setAllocations] = useState<AllocationProfileItem[]>([]);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Drill-down Modal State
  const [drilldownLines, setDrilldownLines] = useState<any[] | null>(null);
  const [drilldownTitle, setDrilldownTitle] = useState<string>('');
  const [showDrilldown, setShowDrilldown] = useState<boolean>(false);

  // Allocation Modal State
  const [showAllocationModal, setShowAllocationModal] = useState<boolean>(false);
  const [newAllocName, setNewAllocName] = useState<string>('');
  const [newAllocMethod, setNewAllocMethod] = useState<'BY_REVENUE' | 'BY_SITE' | 'BY_FIXED_PERCENTAGE'>('BY_REVENUE');
  const [newAllocWeight, setNewAllocWeight] = useState<string>('100.00');

  useEffect(() => {
    loadActiveViewData();
  }, [subView, startDate, endDate]);

  const loadActiveViewData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, any> = {};
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;

      if (subView === 'SITES') {
        const data = await fetchSiteProfitability(params);
        setSites(data);
      } else if (subView === 'CLIENTS') {
        const data = await fetchClientProfitability(params);
        setClients(data);
      } else if (subView === 'CONTRACTS') {
        const data = await fetchContractProfitability(params);
        setContracts(data);
      } else if (subView === 'EXCEPTIONS') {
        const data = await fetchUnattributedLines(params);
        setExceptions(data);
      } else if (subView === 'ALLOCATIONS') {
        const data = await fetchAllocationProfiles();
        setAllocations(data);
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to fetch profitability data');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDrilldown = async (type: string, id: string, name: string) => {
    try {
      const params: Record<string, any> = {};
      if (type === 'SITE') params.site_id = id;
      if (type === 'CONTRACT') params.contract_id = id;
      if (type === 'CLIENT') params.client_id = id;

      const lines = await fetchProfitabilityDrilldown(params);
      setDrilldownLines(lines);
      setDrilldownTitle(`${name} (${type})`);
      setShowDrilldown(true);
    } catch (err: any) {
      alert('Failed to load drill-down: ' + (err?.response?.data?.detail || err.message));
    }
  };

  const handleCreateAllocation = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createAllocationProfile({
        name: newAllocName,
        method: newAllocMethod,
        percentage_or_weight: newAllocWeight,
        target_type: 'SITE',
        is_active: true
      });
      setShowAllocationModal(false);
      setNewAllocName('');
      loadActiveViewData();
    } catch (err: any) {
      alert('Failed to create allocation profile: ' + (err?.response?.data?.detail || err.message));
    }
  };

  const handleDeleteAllocation = async (id: string) => {
    if (!window.confirm('Delete this allocation profile?')) return;
    try {
      await deleteAllocationProfile(id);
      loadActiveViewData();
    } catch (err: any) {
      alert('Failed to delete allocation: ' + (err?.response?.data?.detail || err.message));
    }
  };

  const renderStatusBadge = (status: string) => {
    let color = '#94a3b8';
    let bg = 'rgba(148, 163, 184, 0.15)';
    if (status === 'PROFITABLE') { color = '#34d399'; bg = 'rgba(16, 185, 129, 0.15)'; }
    else if (status === 'LOW_MARGIN') { color = '#fbbf24'; bg = 'rgba(245, 158, 11, 0.15)'; }
    else if (status === 'LOSS_MAKING') { color = '#f87171'; bg = 'rgba(239, 68, 68, 0.15)'; }
    else if (status === 'NO_REVENUE') { color = '#cbd5e1'; bg = 'rgba(100, 116, 139, 0.15)'; }

    return (
      <span style={{ color, background: bg, padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 600 }}>
        {status}
      </span>
    );
  };

  const fmtCurrency = (val: number | string | undefined) => {
    const num = Number(val || 0);
    return `PKR ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div style={{ padding: '0', background: 'transparent', color: 'var(--color-text)', minHeight: '100%', paddingBottom: '60px' }}>
      {/* HEADER BAR */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <i className="bx bx-line-chart" style={{ fontSize: '26px', color: 'var(--color-primary, #0284c7)' }}></i>
            <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
              Security Operational & Management Profitability
            </h1>
          </div>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', marginTop: '4px' }}>
            GL POSTED line-level profitability across Sites, Clients, Contracts & Cost Allocations
          </p>
        </div>
        <div>
          {subView === 'ALLOCATIONS' && (
            <button
              onClick={() => setShowAllocationModal(true)}
              style={{
                padding: '10px 18px',
                background: '#10b981',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <i className="bx bx-plus"></i> Add Allocation Profile
            </button>
          )}
        </div>
      </div>

      {/* SUB-VIEW NAVIGATION */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px', overflowX: 'auto' }}>
        <button
          onClick={() => setSubView('SITES')}
          style={{
            padding: '10px 20px',
            background: subView === 'SITES' ? '#0284c7' : 'transparent',
            color: subView === 'SITES' ? '#fff' : '#94a3b8',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <i className="bx bx-building-house"></i>
          <span>Site Profitability (Key)</span>
        </button>
        <button
          onClick={() => setSubView('CLIENTS')}
          style={{
            padding: '10px 20px',
            background: subView === 'CLIENTS' ? '#0284c7' : 'transparent',
            color: subView === 'CLIENTS' ? '#fff' : '#94a3b8',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <i className="bx bx-user-pin"></i>
          <span>Client Profitability</span>
        </button>
        <button
          onClick={() => setSubView('CONTRACTS')}
          style={{
            padding: '10px 20px',
            background: subView === 'CONTRACTS' ? '#0284c7' : 'transparent',
            color: subView === 'CONTRACTS' ? '#fff' : '#94a3b8',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <i className="bx bx-file"></i>
          <span>Contract Profitability</span>
        </button>
        <button
          onClick={() => setSubView('ALLOCATIONS')}
          style={{
            padding: '10px 20px',
            background: subView === 'ALLOCATIONS' ? '#0284c7' : 'transparent',
            color: subView === 'ALLOCATIONS' ? '#fff' : '#94a3b8',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <i className="bx bx-slider-alt"></i>
          <span>Overhead Allocation Rules</span>
        </button>
        <button
          onClick={() => setSubView('EXCEPTIONS')}
          style={{
            padding: '10px 20px',
            background: subView === 'EXCEPTIONS' ? '#0284c7' : 'transparent',
            color: subView === 'EXCEPTIONS' ? '#fff' : '#94a3b8',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <i className="bx bx-error-circle"></i>
          <span>Unattributed Exceptions</span>
        </button>
      </div>

      {/* DATE FILTERS BAR */}
      {subView !== 'ALLOCATIONS' && (
        <div style={{ background: '#1e293b', padding: '14px 20px', borderRadius: '8px', marginBottom: '24px', display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div>
            <label style={{ fontSize: '12px', color: '#94a3b8', marginRight: '8px' }}>From:</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ padding: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '4px' }} />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: '#94a3b8', marginRight: '8px' }}>To:</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ padding: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '4px' }} />
          </div>
          <button onClick={loadActiveViewData} style={{ padding: '6px 14px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 600, cursor: 'pointer' }}>
            Filter
          </button>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <i className="bx bx-loader-alt bx-spin" style={{ fontSize: '20px' }}></i>
          <span>Computing profitability from posted general ledger...</span>
        </div>
      )}
      {error && <div style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', color: '#fca5a5', padding: '16px', borderRadius: '8px' }}>{error}</div>}

      {/* ------------------------------------------------------------------ */}
      {/* 1. SITES PROFITABILITY VIEW (Key Security Feature) */}
      {/* ------------------------------------------------------------------ */}
      {!loading && subView === 'SITES' && (
        <div style={{ display: 'grid', gap: '20px' }}>
          {sites.length === 0 ? (
            <div style={{ background: '#1e293b', padding: '40px', textAlign: 'center', color: '#94a3b8', borderRadius: '8px' }}>
              No operational sites found or no posted transactions linked to sites.
            </div>
          ) : (
            sites.map((s) => (
              <div key={s.site_id} style={{ background: '#1e293b', padding: '20px', borderRadius: '10px', borderLeft: '4px solid #0284c7' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#f8fafc' }}>{s.site_name} — {s.city}</h2>
                      {renderStatusBadge(s.management_status)}
                    </div>
                    <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>Client: <strong>{s.client_name}</strong></div>
                  </div>
                  <button
                    onClick={() => handleOpenDrilldown('SITE', s.site_id, s.site_name)}
                    style={{ padding: '6px 12px', background: '#334155', color: '#38bdf8', border: '1px solid #0284c7', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <i className="bx bx-search-alt"></i>
                    <span>Drill-Down GL</span>
                  </button>
                </div>

                {/* Profitability Table matching exact spec */}
                <table style={{ width: '100%', fontSize: '14px', borderCollapse: 'collapse', background: '#0f172a', borderRadius: '6px', overflow: 'hidden' }}>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid #334155' }}>
                      <td style={{ padding: '10px 16px', fontWeight: 600, color: '#38bdf8' }}>Service Revenue</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: '#60a5fa' }}>{fmtCurrency(s.revenue)}</td>
                    </tr>
                    <tr style={{ background: '#1e293b' }}><td colSpan={2} style={{ padding: '6px 16px', fontSize: '12px', fontWeight: 700, color: '#94a3b8' }}>DIRECT COSTS</td></tr>
                    <tr style={{ borderBottom: '1px solid #1e293b' }}><td style={{ padding: '8px 24px', color: '#cbd5e1' }}>Guard Salaries & Wages</td><td style={{ padding: '8px 16px', textAlign: 'right', color: '#f87171' }}>({fmtCurrency(s.guard_salaries)})</td></tr>
                    <tr style={{ borderBottom: '1px solid #1e293b' }}><td style={{ padding: '8px 24px', color: '#cbd5e1' }}>Supervisor Salaries</td><td style={{ padding: '8px 16px', textAlign: 'right', color: '#f87171' }}>({fmtCurrency(s.supervisor_salaries)})</td></tr>
                    <tr style={{ borderBottom: '1px solid #1e293b' }}><td style={{ padding: '8px 24px', color: '#cbd5e1' }}>Employee Overtime</td><td style={{ padding: '8px 16px', textAlign: 'right', color: '#f87171' }}>({fmtCurrency(s.employee_ot)})</td></tr>
                    <tr style={{ borderBottom: '1px solid #1e293b' }}><td style={{ padding: '8px 24px', color: '#cbd5e1' }}>Site Transport & Fuel</td><td style={{ padding: '8px 16px', textAlign: 'right', color: '#f87171' }}>({fmtCurrency(s.transport)})</td></tr>
                    <tr style={{ borderBottom: '1px solid #1e293b' }}><td style={{ padding: '8px 24px', color: '#cbd5e1' }}>Equipment & Devices</td><td style={{ padding: '8px 16px', textAlign: 'right', color: '#f87171' }}>({fmtCurrency(s.equipment)})</td></tr>
                    <tr style={{ borderBottom: '1px solid #1e293b' }}><td style={{ padding: '8px 24px', color: '#cbd5e1' }}>Site Utilities & Expense</td><td style={{ padding: '8px 16px', textAlign: 'right', color: '#f87171' }}>({fmtCurrency(s.site_expenses)})</td></tr>

                    <tr style={{ borderTop: '2px solid #334155', background: '#0f172a', fontWeight: 700 }}>
                      <td style={{ padding: '10px 16px', color: '#34d399' }}>DIRECT PROFIT</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', color: '#34d399' }}>{fmtCurrency(s.direct_profit)}</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #334155' }}>
                      <td style={{ padding: '8px 16px', color: '#94a3b8' }}>Allocated Head Office Overhead</td>
                      <td style={{ padding: '8px 16px', textAlign: 'right', color: '#fb923c' }}>({fmtCurrency(s.allocated_ho_overhead)})</td>
                    </tr>
                    <tr style={{ background: '#0284c7', color: '#fff', fontWeight: 700, fontSize: '15px' }}>
                      <td style={{ padding: '12px 16px' }}>NET SITE CONTRIBUTION (Margin: {s.margin_pct}%)</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>{fmtCurrency(s.net_site_contribution)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 2. CLIENTS PROFITABILITY VIEW */}
      {/* ------------------------------------------------------------------ */}
      {!loading && subView === 'CLIENTS' && (
        <div style={{ background: '#1e293b', borderRadius: '8px', padding: '20px' }}>
          <h2 style={{ fontSize: '16px', color: '#38bdf8', marginBottom: '16px' }}>Client Portfolio Profitability Summary</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ background: '#0f172a', color: '#94a3b8', textAlign: 'left' }}>
                <th style={{ padding: '12px' }}>Client Name</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Revenue</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Direct Cost</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Allocated Overhead</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Net Profit</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Margin %</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>Status</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.client_id} style={{ borderBottom: '1px solid #334155' }}>
                  <td style={{ padding: '12px', fontWeight: 600 }}>{c.client_name}</td>
                  <td style={{ padding: '12px', textAlign: 'right', color: '#60a5fa' }}>{fmtCurrency(c.revenue)}</td>
                  <td style={{ padding: '12px', textAlign: 'right', color: '#f87171' }}>{fmtCurrency(c.direct_costs)}</td>
                  <td style={{ padding: '12px', textAlign: 'right', color: '#fb923c' }}>{fmtCurrency(c.allocated_overhead)}</td>
                  <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: c.net_profit >= 0 ? '#34d399' : '#f87171' }}>{fmtCurrency(c.net_profit)}</td>
                  <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>{c.margin_pct}%</td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>{renderStatusBadge(c.management_status)}</td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <button onClick={() => handleOpenDrilldown('CLIENT', c.client_id, c.client_name)} style={{ padding: '4px 10px', background: '#334155', color: '#38bdf8', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Drill-Down</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 3. CONTRACTS PROFITABILITY VIEW */}
      {/* ------------------------------------------------------------------ */}
      {!loading && subView === 'CONTRACTS' && (
        <div style={{ background: '#1e293b', borderRadius: '8px', padding: '20px' }}>
          <h2 style={{ fontSize: '16px', color: '#38bdf8', marginBottom: '16px' }}>Service Contract Profitability</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ background: '#0f172a', color: '#94a3b8', textAlign: 'left' }}>
                <th style={{ padding: '12px' }}>Contract #</th>
                <th style={{ padding: '12px' }}>Client</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Revenue</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Direct Costs</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Net Profit</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Margin %</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((ct) => (
                <tr key={ct.contract_id} style={{ borderBottom: '1px solid #334155' }}>
                  <td style={{ padding: '12px', fontWeight: 600, color: '#38bdf8' }}>{ct.contract_number}</td>
                  <td style={{ padding: '12px' }}>{ct.client_name}</td>
                  <td style={{ padding: '12px', textAlign: 'right', color: '#60a5fa' }}>{fmtCurrency(ct.revenue)}</td>
                  <td style={{ padding: '12px', textAlign: 'right', color: '#f87171' }}>{fmtCurrency(ct.total_direct_cost)}</td>
                  <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: ct.net_profit >= 0 ? '#34d399' : '#f87171' }}>{fmtCurrency(ct.net_profit)}</td>
                  <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>{ct.margin_pct}%</td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>{renderStatusBadge(ct.management_status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 4. ALLOCATION PROFILES VIEW */}
      {/* ------------------------------------------------------------------ */}
      {!loading && subView === 'ALLOCATIONS' && (
        <div style={{ background: '#1e293b', borderRadius: '8px', padding: '20px' }}>
          <h2 style={{ fontSize: '16px', color: '#38bdf8', marginBottom: '16px' }}>Overhead Allocation Rules & Profiles</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ background: '#0f172a', color: '#94a3b8', textAlign: 'left' }}>
                <th style={{ padding: '12px' }}>Profile Name</th>
                <th style={{ padding: '12px' }}>Method</th>
                <th style={{ padding: '12px' }}>Target Type</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Weight / %</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>Active</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {allocations.map((a) => (
                <tr key={a.id} style={{ borderBottom: '1px solid #334155' }}>
                  <td style={{ padding: '12px', fontWeight: 600 }}>{a.name}</td>
                  <td style={{ padding: '12px', color: '#38bdf8' }}>{a.method_display || a.method}</td>
                  <td style={{ padding: '12px' }}>{a.target_type}</td>
                  <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>{a.percentage_or_weight}%</td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <span style={{ color: a.is_active ? '#34d399' : '#94a3b8', fontWeight: 600, fontSize: '12px' }}>
                      {a.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <button onClick={() => handleDeleteAllocation(a.id)} style={{ padding: '4px 10px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 5. UNATTRIBUTED EXCEPTIONS VIEW */}
      {/* ------------------------------------------------------------------ */}
      {!loading && subView === 'EXCEPTIONS' && (
        <div style={{ background: '#1e293b', borderRadius: '8px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <i className="bx bx-error-circle" style={{ fontSize: '20px', color: '#f59e0b' }}></i>
            <h2 style={{ fontSize: '16px', color: '#f59e0b', margin: 0 }}>Unattributed Financial Dimensions Exception Report</h2>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ background: '#0f172a', color: '#94a3b8', textAlign: 'left' }}>
                <th style={{ padding: '12px' }}>Entry #</th>
                <th style={{ padding: '12px' }}>Account</th>
                <th style={{ padding: '12px' }}>Exception Type</th>
                <th style={{ padding: '12px' }}>Narration</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Amount (PKR)</th>
              </tr>
            </thead>
            <tbody>
              {exceptions.map((ex) => (
                <tr key={ex.line_id} style={{ borderBottom: '1px solid #334155' }}>
                  <td style={{ padding: '12px', color: '#38bdf8' }}>{ex.entry_number}</td>
                  <td style={{ padding: '12px' }}>{ex.account_code} - {ex.account_name}</td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>
                      {ex.exception_type}
                    </span>
                  </td>
                  <td style={{ padding: '12px', color: '#cbd5e1' }}>{ex.narration}</td>
                  <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600, color: '#f87171' }}>{fmtCurrency(ex.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* DRILL-DOWN MODAL */}
      {showDrilldown && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#1e293b', padding: '24px', borderRadius: '12px', maxWidth: '850px', width: '100%', maxHeight: '85vh', overflowY: 'auto', color: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="bx bx-search-alt" style={{ fontSize: '22px', color: '#38bdf8' }}></i>
              <h2 style={{ fontSize: '20px', color: '#38bdf8', margin: 0 }}>Profitability GL Drill-Down: {drilldownTitle}</h2>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginTop: '16px' }}>
              <thead>
                <tr style={{ background: '#0f172a', color: '#94a3b8', textAlign: 'left' }}>
                  <th style={{ padding: '10px' }}>Date</th>
                  <th style={{ padding: '10px' }}>Entry #</th>
                  <th style={{ padding: '10px' }}>Account</th>
                  <th style={{ padding: '10px' }}>Narration</th>
                  <th style={{ padding: '10px' }}>Source Ref</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>Debit</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>Credit</th>
                </tr>
              </thead>
              <tbody>
                {drilldownLines?.map((d) => (
                  <tr key={d.line_id} style={{ borderBottom: '1px solid #334155' }}>
                    <td style={{ padding: '10px', color: '#94a3b8' }}>{d.posting_date}</td>
                    <td style={{ padding: '10px', color: '#60a5fa' }}>{d.entry_number}</td>
                    <td style={{ padding: '10px' }}>{d.account_code} - {d.account_name}</td>
                    <td style={{ padding: '10px' }}>{d.description}</td>
                    <td style={{ padding: '10px', color: '#cbd5e1' }}>{d.source_type} ({d.source_number})</td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>{d.debit > 0 ? fmtCurrency(d.debit) : '—'}</td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>{d.credit > 0 ? fmtCurrency(d.credit) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ textAlign: 'right', marginTop: '20px' }}>
              <button onClick={() => setShowDrilldown(false)} style={{ padding: '8px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>
                Close Drill-Down
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ALLOCATION PROFILE MODAL */}
      {showAllocationModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#1e293b', padding: '24px', borderRadius: '12px', maxWidth: '500px', width: '100%', color: '#fff' }}>
            <h2 style={{ fontSize: '18px', color: '#38bdf8', marginTop: 0 }}>+ Create Overhead Allocation Rule</h2>
            <form onSubmit={handleCreateAllocation}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Rule Name</label>
                <input required type="text" value={newAllocName} onChange={(e) => setNewAllocName(e.target.value)} placeholder="e.g. HO Management Allocation" style={{ width: '100%', padding: '8px', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '4px' }} />
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Allocation Method</label>
                <select value={newAllocMethod} onChange={(e: any) => setNewAllocMethod(e.target.value)} style={{ width: '100%', padding: '8px', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '4px' }}>
                  <option value="BY_REVENUE">Proportional by Site Revenue</option>
                  <option value="BY_SITE">Equal Split per Site</option>
                  <option value="BY_FIXED_PERCENTAGE">Fixed Percentage Allocation</option>
                </select>
              </div>
              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Percentage or Weight (%)</label>
                <input type="number" step="0.01" value={newAllocWeight} onChange={(e) => setNewAllocWeight(e.target.value)} style={{ width: '100%', padding: '8px', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '4px' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setShowAllocationModal(false)} style={{ padding: '8px 16px', background: '#334155', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '8px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 600, cursor: 'pointer' }}>Save Profile</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
