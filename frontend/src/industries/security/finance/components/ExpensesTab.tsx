import React, { useState, useEffect } from 'react';
import type {
  ExpenseItem,
  ExpenseCategory,
  EmployeeAdvanceItem,
  PettyCashSummaryAccount,
  ExpenseSummaryMetrics,
} from '../api';
import {
  fetchExpenses,
  fetchExpenseCategories,
  fetchEmployeeAdvances,
  fetchPettyCashSummary,
  fetchExpenseSummaryMetrics,
  fetchEmployees,
  fetchOperationalSites,
  fetchCostCenters,
  fetchProfitCenters,
  fetchTreasuryDashboard,
  approveEmployeeAdvance,
  rejectEmployeeAdvance,
  payEmployeeAdvance,
  createExpenseCategory
} from '../api';
import { NewExpenseModal } from './NewExpenseModal';
import { NewClaimModal } from './NewClaimModal';
import { NewAdvanceModal } from './NewAdvanceModal';
import { ExpenseWorkspaceModal } from './ExpenseWorkspaceModal';
import { SettleAdvanceModal } from './SettleAdvanceModal';
import { FundPettyCashModal } from './FundPettyCashModal';

export const ExpensesTab: React.FC = () => {
  const [subView, setSubView] = useState<'EXPENSES' | 'CLAIMS' | 'PETTY_CASH' | 'ADVANCES' | 'CATEGORIES'>('EXPENSES');

  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [advances, setAdvances] = useState<EmployeeAdvanceItem[]>([]);
  const [pettyCashSummary, setPettyCashSummary] = useState<PettyCashSummaryAccount[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [metrics, setMetrics] = useState<ExpenseSummaryMetrics | null>(null);

  // References
  const [employees, setEmployees] = useState<any[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [profitCenters, setProfitCenters] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);

  // Modals state
  const [showNewExpenseModal, setShowNewExpenseModal] = useState(false);
  const [showNewClaimModal, setShowNewClaimModal] = useState(false);
  const [showNewAdvanceModal, setShowNewAdvanceModal] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<ExpenseItem | null>(null);
  const [settlingAdvance, setSettlingAdvance] = useState<EmployeeAdvanceItem | null>(null);
  const [pettyCashModalData, setPettyCashModalData] = useState<{ account: any; mode: 'FUND' | 'EXPENSE' } | null>(null);

  // Advance Payment Modal
  const [payingAdvance, setPayingAdvance] = useState<EmployeeAdvanceItem | null>(null);
  const [advancePayBank, setAdvancePayBank] = useState('');
  const [advancePayMethod, setAdvancePayMethod] = useState('BANK_TRANSFER');
  const [advancePayRef, setAdvancePayRef] = useState('');
  const [advanceActionLoading, setAdvanceActionLoading] = useState(false);

  // New Category inline modal
  const [showNewCategoryModal, setShowNewCategoryModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatCode, setNewCatCode] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');

  // Filters
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCostCenter, setFilterCostCenter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [
        expRes,
        advRes,
        pcRes,
        catRes,
        metRes,
        empRes,
        siteRes,
        ccRes,
        pcCoaRes,
        treasuryRes
      ] = await Promise.all([
        fetchExpenses(),
        fetchEmployeeAdvances(),
        fetchPettyCashSummary(),
        fetchExpenseCategories(),
        fetchExpenseSummaryMetrics(),
        fetchEmployees().catch(() => []),
        fetchOperationalSites().catch(() => []),
        fetchCostCenters().catch(() => []),
        fetchProfitCenters().catch(() => []),
        fetchTreasuryDashboard().catch(() => ({ accounts: [] }))
      ]);

      setExpenses(expRes);
      setAdvances(advRes);
      setPettyCashSummary(pcRes);
      setCategories(catRes);
      setMetrics(metRes);
      setEmployees(empRes);
      setSites(Array.isArray(siteRes) ? siteRes : []);
      setCostCenters(ccRes);
      setProfitCenters(pcCoaRes);
      setBankAccounts(treasuryRes?.accounts || []);
    } catch (err: any) {
      console.error('Failed to load expense management data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleApproveAdvance = async (id: string) => {
    try {
      await approveEmployeeAdvance(id);
      loadData();
    } catch (err: any) {
      alert(err?.response?.data?.detail || err?.response?.data?.error || err.message);
    }
  };

  const handleRejectAdvance = async (id: string) => {
    const reason = prompt('Please enter rejection reason:');
    if (!reason) return;
    try {
      await rejectEmployeeAdvance(id, reason);
      loadData();
    } catch (err: any) {
      alert(err?.response?.data?.detail || err?.response?.data?.error || err.message);
    }
  };

  const handlePayAdvanceConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingAdvance || !advancePayBank) return;
    setAdvanceActionLoading(true);
    try {
      await payEmployeeAdvance(payingAdvance.id, {
        bank_account: advancePayBank,
        payment_method: advancePayMethod,
        reference: advancePayRef
      });
      setPayingAdvance(null);
      loadData();
    } catch (err: any) {
      alert(err?.response?.data?.detail || err?.response?.data?.error || err.message);
    } finally {
      setAdvanceActionLoading(false);
    }
  };

  const handleCreateCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    try {
      await createExpenseCategory({
        name: newCatName,
        code: newCatCode || undefined,
        description: newCatDesc,
        is_active: true
      });
      setShowNewCategoryModal(false);
      setNewCatName('');
      setNewCatCode('');
      setNewCatDesc('');
      loadData();
    } catch (err: any) {
      alert(err?.response?.data?.detail || err?.response?.data?.error || err.message);
    }
  };

  // Filtered Expense lists
  const filteredCompanyExpenses = expenses.filter(e => {
    if (e.expense_type === 'EMPLOYEE_CLAIM') return false;
    if (filterCategory && e.category !== filterCategory) return false;
    if (filterStatus && e.status !== filterStatus) return false;
    if (filterCostCenter && e.cost_center !== filterCostCenter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const match =
        e.expense_number.toLowerCase().includes(q) ||
        e.title.toLowerCase().includes(q) ||
        (e.payee && e.payee.toLowerCase().includes(q)) ||
        (e.receipt_reference && e.receipt_reference.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  const filteredClaims = expenses.filter(e => {
    if (e.expense_type !== 'EMPLOYEE_CLAIM') return false;
    if (filterStatus && e.status !== filterStatus) return false;
    if (filterCostCenter && e.cost_center !== filterCostCenter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const match =
        e.expense_number.toLowerCase().includes(q) ||
        e.title.toLowerCase().includes(q) ||
        (e.employee_name && e.employee_name.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  const filteredAdvances = advances.filter(a => {
    if (filterStatus && a.status !== filterStatus) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const match =
        a.advance_number.toLowerCase().includes(q) ||
        (a.employee_name && a.employee_name.toLowerCase().includes(q)) ||
        (a.purpose && a.purpose.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  const getStatusBadge = (status: string) => {
    const map: Record<string, { bg: string; color: string }> = {
      DRAFT: { bg: '#475569', color: '#f1f5f9' },
      PENDING_APPROVAL: { bg: '#d97706', color: '#fef3c7' },
      APPROVED: { bg: '#2563eb', color: '#dbeafe' },
      PAID: { bg: '#059669', color: '#d1fae5' },
      SETTLED: { bg: '#10b981', color: '#ecfdf5' },
      REJECTED: { bg: '#dc2626', color: '#fee2e2' },
      REVERSED: { bg: '#7c3aed', color: '#ede9fe' },
      CANCELLED: { bg: '#334155', color: '#94a3b8' }
    };
    const s = map[status] || { bg: '#475569', color: '#fff' };
    return (
      <span style={{
        padding: '3px 8px',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: 600,
        backgroundColor: s.bg,
        color: s.color,
        display: 'inline-flex',
        alignItems: 'center'
      }}>
        {status.replace(/_/g, ' ')}
      </span>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header & Sub-nav */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-text, #fff)' }}>
            Expense & Petty Cash Management
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--color-text-secondary, #94a3b8)' }}>
            Company operating expenses, employee reimbursement claims, petty cash floats & staff advances.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          {subView === 'EXPENSES' && (
            <button
              onClick={() => setShowNewExpenseModal(true)}
              style={{
                background: 'var(--color-primary, #3b82f6)',
                color: '#fff',
                border: 'none',
                padding: '9px 16px',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              + Record Expense
            </button>
          )}

          {subView === 'CLAIMS' && (
            <button
              onClick={() => setShowNewClaimModal(true)}
              style={{
                background: '#10b981',
                color: '#fff',
                border: 'none',
                padding: '9px 16px',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              + Submit Claim
            </button>
          )}

          {subView === 'ADVANCES' && (
            <button
              onClick={() => setShowNewAdvanceModal(true)}
              style={{
                background: '#3b82f6',
                color: '#fff',
                border: 'none',
                padding: '9px 16px',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              + Request Advance
            </button>
          )}

          {subView === 'CATEGORIES' && (
            <button
              onClick={() => setShowNewCategoryModal(true)}
              style={{
                background: 'var(--color-primary, #3b82f6)',
                color: '#fff',
                border: 'none',
                padding: '9px 16px',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer'
              }}
            >
              + New Category
            </button>
          )}

          <button
            onClick={loadData}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid var(--color-border, #333a48)',
              color: 'var(--color-text, #fff)',
              padding: '9px 14px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.85rem'
            }}
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '14px'
      }}>
        <div style={{
          background: 'var(--color-surface, #1e222b)',
          border: '1px solid var(--color-border, #333a48)',
          borderRadius: '10px',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary, #94a3b8)' }}>Total Expenses Paid</span>
          <span style={{ fontSize: '1.35rem', fontWeight: 700, color: '#38bdf8', marginTop: '4px' }}>
            PKR {(metrics?.total_spent || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        </div>

        <div style={{
          background: 'var(--color-surface, #1e222b)',
          border: '1px solid var(--color-border, #333a48)',
          borderRadius: '10px',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary, #94a3b8)' }}>Pending Approval</span>
          <span style={{ fontSize: '1.35rem', fontWeight: 700, color: '#f59e0b', marginTop: '4px' }}>
            PKR {(metrics?.pending_approval || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        </div>

        <div style={{
          background: 'var(--color-surface, #1e222b)',
          border: '1px solid var(--color-border, #333a48)',
          borderRadius: '10px',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary, #94a3b8)' }}>Approved (Awaiting Payment)</span>
          <span style={{ fontSize: '1.35rem', fontWeight: 700, color: '#3b82f6', marginTop: '4px' }}>
            PKR {(metrics?.approved_unpaid || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        </div>

        <div style={{
          background: 'var(--color-surface, #1e222b)',
          border: '1px solid var(--color-border, #333a48)',
          borderRadius: '10px',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary, #94a3b8)' }}>Petty Cash Outflows</span>
          <span style={{ fontSize: '1.35rem', fontWeight: 700, color: '#10b981', marginTop: '4px' }}>
            PKR {(metrics?.petty_cash_spent || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        </div>

        <div style={{
          background: 'var(--color-surface, #1e222b)',
          border: '1px solid var(--color-border, #333a48)',
          borderRadius: '10px',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary, #94a3b8)' }}>Pending Claims Count</span>
          <span style={{ fontSize: '1.35rem', fontWeight: 700, color: '#a855f7', marginTop: '4px' }}>
            {metrics?.pending_claims_count || 0} claims
          </span>
        </div>
      </div>

      {/* Sub-view Navigation Bar */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--color-border, #333a48)',
        gap: '8px'
      }}>
        {[
          { key: 'EXPENSES', label: 'Company Expenses', icon: '🧾' },
          { key: 'CLAIMS', label: 'Employee Claims', icon: '👥' },
          { key: 'PETTY_CASH', label: 'Petty Cash Floats', icon: '💼' },
          { key: 'ADVANCES', label: 'Employee Advances', icon: '💳' },
          { key: 'CATEGORIES', label: 'Expense Categories', icon: '🏷️' }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setSubView(tab.key as any)}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: subView === tab.key ? '2px solid var(--color-primary, #3b82f6)' : '2px solid transparent',
              color: subView === tab.key ? '#fff' : 'var(--color-text-secondary, #94a3b8)',
              fontWeight: subView === tab.key ? 600 : 400,
              padding: '10px 16px',
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>{tab.icon}</span> {tab.label}
          </button>
        ))}
      </div>

      {/* Search & Filters Row */}
      {subView !== 'CATEGORIES' && (
        <div style={{
          display: 'flex',
          gap: '12px',
          flexWrap: 'wrap',
          alignItems: 'center',
          backgroundColor: 'var(--color-surface, #1e222b)',
          padding: '12px 16px',
          borderRadius: '8px',
          border: '1px solid var(--color-border, #333a48)'
        }}>
          <input
            type="text"
            placeholder="Search by ref #, title, payee..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              flex: '1 1 200px',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid var(--color-border, #333a48)',
              background: 'var(--color-background, #14171f)',
              color: '#fff',
              fontSize: '0.85rem'
            }}
          />

          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid var(--color-border, #333a48)',
              background: 'var(--color-background, #14171f)',
              color: '#fff',
              fontSize: '0.85rem'
            }}
          >
            <option value="">-- All Statuses --</option>
            <option value="DRAFT">Draft</option>
            <option value="PENDING_APPROVAL">Pending Approval</option>
            <option value="APPROVED">Approved</option>
            <option value="PAID">Paid</option>
            <option value="REVERSED">Reversed</option>
            <option value="REJECTED">Rejected</option>
          </select>

          {subView === 'EXPENSES' && (
            <select
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid var(--color-border, #333a48)',
                background: 'var(--color-background, #14171f)',
                color: '#fff',
                fontSize: '0.85rem'
              }}
            >
              <option value="">-- All Categories --</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}

          <select
            value={filterCostCenter}
            onChange={e => setFilterCostCenter(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid var(--color-border, #333a48)',
              background: 'var(--color-background, #14171f)',
              color: '#fff',
              fontSize: '0.85rem'
            }}
          >
            <option value="">-- All Cost Centers --</option>
            {costCenters.map(cc => (
              <option key={cc.id} value={cc.id}>{cc.name}</option>
            ))}
          </select>

          {(filterStatus || filterCategory || filterCostCenter || searchTerm) && (
            <button
              onClick={() => {
                setFilterStatus('');
                setFilterCategory('');
                setFilterCostCenter('');
                setSearchTerm('');
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#38bdf8',
                fontSize: '0.85rem',
                cursor: 'pointer'
              }}
            >
              Clear Filters
            </button>
          )}
        </div>
      )}

      {/* Main Content Areas */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
          Loading expense records...
        </div>
      ) : (
        <>
          {/* SubView 1: Company Expenses */}
          {subView === 'EXPENSES' && (
            <div style={{
              background: 'var(--color-surface, #1e222b)',
              borderRadius: '10px',
              border: '1px solid var(--color-border, #333a48)',
              overflow: 'hidden'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{
                    backgroundColor: 'rgba(255,255,255,0.02)',
                    borderBottom: '1px solid var(--color-border, #333a48)',
                    color: '#94a3b8',
                    textAlign: 'left'
                  }}>
                    <th style={{ padding: '12px 16px' }}>Expense #</th>
                    <th style={{ padding: '12px 16px' }}>Date</th>
                    <th style={{ padding: '12px 16px' }}>Title & Description</th>
                    <th style={{ padding: '12px 16px' }}>Category</th>
                    <th style={{ padding: '12px 16px' }}>Cost Center / Site</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Total (PKR)</th>
                    <th style={{ padding: '12px 16px' }}>Status</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCompanyExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
                        No direct company expenses found.
                      </td>
                    </tr>
                  ) : (
                    filteredCompanyExpenses.map(exp => (
                      <tr
                        key={exp.id}
                        onClick={() => setSelectedExpense(exp)}
                        style={{
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                          cursor: 'pointer',
                          transition: 'background-color 0.15s'
                        }}
                      >
                        <td style={{ padding: '12px 16px', fontWeight: 600, color: '#38bdf8' }}>
                          {exp.expense_number}
                        </td>
                        <td style={{ padding: '12px 16px', color: '#cbd5e1' }}>{exp.expense_date}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 600, color: '#f8fafc' }}>{exp.title}</div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                            {exp.payee ? `Payee: ${exp.payee}` : (exp.vendor_name ? `Vendor: ${exp.vendor_name}` : '')}
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', color: '#cbd5e1' }}>
                          {exp.category_name || '-'}
                        </td>
                        <td style={{ padding: '12px 16px', color: '#94a3b8' }}>
                          {exp.is_split_allocation ? (
                            <span style={{ color: '#a855f7', fontWeight: 600 }}>Split Allocated</span>
                          ) : (
                            exp.cost_center_name || exp.site_name || 'Company Wide'
                          )}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#f8fafc' }}>
                          {parseFloat(exp.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '12px 16px' }}>{getStatusBadge(exp.status)}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedExpense(exp);
                            }}
                            style={{
                              background: 'rgba(255,255,255,0.06)',
                              border: '1px solid var(--color-border, #333a48)',
                              borderRadius: '4px',
                              color: '#38bdf8',
                              padding: '4px 10px',
                              fontSize: '0.75rem',
                              cursor: 'pointer'
                            }}
                          >
                            Open Workspace
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* SubView 2: Employee Claims */}
          {subView === 'CLAIMS' && (
            <div style={{
              background: 'var(--color-surface, #1e222b)',
              borderRadius: '10px',
              border: '1px solid var(--color-border, #333a48)',
              overflow: 'hidden'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{
                    backgroundColor: 'rgba(255,255,255,0.02)',
                    borderBottom: '1px solid var(--color-border, #333a48)',
                    color: '#94a3b8',
                    textAlign: 'left'
                  }}>
                    <th style={{ padding: '12px 16px' }}>Claim #</th>
                    <th style={{ padding: '12px 16px' }}>Date</th>
                    <th style={{ padding: '12px 16px' }}>Claimant Employee</th>
                    <th style={{ padding: '12px 16px' }}>Purpose / Details</th>
                    <th style={{ padding: '12px 16px' }}>Cost Center</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Claim Amount (PKR)</th>
                    <th style={{ padding: '12px 16px' }}>Status</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClaims.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
                        No employee reimbursement claims found.
                      </td>
                    </tr>
                  ) : (
                    filteredClaims.map(claim => (
                      <tr
                        key={claim.id}
                        onClick={() => setSelectedExpense(claim)}
                        style={{
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                          cursor: 'pointer',
                          transition: 'background-color 0.15s'
                        }}
                      >
                        <td style={{ padding: '12px 16px', fontWeight: 600, color: '#10b981' }}>
                          {claim.expense_number}
                        </td>
                        <td style={{ padding: '12px 16px', color: '#cbd5e1' }}>{claim.expense_date}</td>
                        <td style={{ padding: '12px 16px', fontWeight: 600, color: '#f8fafc' }}>
                          {claim.employee_name || claim.payee}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div>{claim.title}</div>
                          {claim.receipt_reference && (
                            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                              Ref: {claim.receipt_reference}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px', color: '#94a3b8' }}>
                          {claim.cost_center_name || 'General'}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#f8fafc' }}>
                          {parseFloat(claim.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '12px 16px' }}>{getStatusBadge(claim.status)}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedExpense(claim);
                            }}
                            style={{
                              background: 'rgba(255,255,255,0.06)',
                              border: '1px solid var(--color-border, #333a48)',
                              borderRadius: '4px',
                              color: '#10b981',
                              padding: '4px 10px',
                              fontSize: '0.75rem',
                              cursor: 'pointer'
                            }}
                          >
                            Review & Reimburse
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* SubView 3: Petty Cash Floats */}
          {subView === 'PETTY_CASH' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: '16px'
              }}>
                {pettyCashSummary.length === 0 ? (
                  <div style={{
                    padding: '30px',
                    textAlign: 'center',
                    color: '#94a3b8',
                    gridColumn: '1 / -1',
                    background: 'var(--color-surface, #1e222b)',
                    borderRadius: '10px',
                    border: '1px solid var(--color-border, #333a48)'
                  }}>
                    No Petty Cash treasury accounts configured yet.
                  </div>
                ) : (
                  pettyCashSummary.map(pc => (
                    <div
                      key={pc.id}
                      style={{
                        background: 'var(--color-surface, #1e222b)',
                        border: '1px solid var(--color-border, #333a48)',
                        borderRadius: '10px',
                        padding: '20px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '14px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>{pc.account_title}</h4>
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                            Box / Ref: {pc.account_number || 'PC-FLOAT'}
                          </span>
                        </div>
                        {pc.needs_replenishment && (
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            background: 'rgba(239, 68, 68, 0.15)',
                            color: '#ef4444',
                            fontSize: '0.75rem',
                            fontWeight: 600
                          }}>
                            Low Float Alert
                          </span>
                        )}
                      </div>

                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '10px',
                        backgroundColor: 'rgba(255,255,255,0.02)',
                        padding: '12px',
                        borderRadius: '6px'
                      }}>
                        <div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Current Float</div>
                          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: pc.needs_replenishment ? '#ef4444' : '#10b981', marginTop: '2px' }}>
                            PKR {pc.operational_balance.toLocaleString()}
                          </div>
                        </div>

                        <div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Float Limit</div>
                          <div style={{ fontSize: '0.95rem', fontWeight: 600, marginTop: '4px' }}>
                            PKR {pc.float_limit.toLocaleString()}
                          </div>
                        </div>
                      </div>

                      <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                        Custodian: <strong style={{ color: '#fff' }}>{pc.custodian_name || 'Unassigned'}</strong>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                        <button
                          onClick={() => setPettyCashModalData({ account: pc, mode: 'FUND' })}
                          style={{
                            flex: 1,
                            background: '#059669',
                            border: 'none',
                            color: '#fff',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            fontWeight: 600,
                            fontSize: '0.8rem',
                            cursor: 'pointer'
                          }}
                        >
                          + Replenish Float
                        </button>
                        <button
                          onClick={() => setPettyCashModalData({ account: pc, mode: 'EXPENSE' })}
                          style={{
                            flex: 1,
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid var(--color-border, #333a48)',
                            color: '#fff',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            fontWeight: 500,
                            fontSize: '0.8rem',
                            cursor: 'pointer'
                          }}
                        >
                          - Disburse Cash
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* SubView 4: Employee Advances */}
          {subView === 'ADVANCES' && (
            <div style={{
              background: 'var(--color-surface, #1e222b)',
              borderRadius: '10px',
              border: '1px solid var(--color-border, #333a48)',
              overflow: 'hidden'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{
                    backgroundColor: 'rgba(255,255,255,0.02)',
                    borderBottom: '1px solid var(--color-border, #333a48)',
                    color: '#94a3b8',
                    textAlign: 'left'
                  }}>
                    <th style={{ padding: '12px 16px' }}>Advance #</th>
                    <th style={{ padding: '12px 16px' }}>Date</th>
                    <th style={{ padding: '12px 16px' }}>Employee</th>
                    <th style={{ padding: '12px 16px' }}>Type & Purpose</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Total (PKR)</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Outstanding (PKR)</th>
                    <th style={{ padding: '12px 16px' }}>Status</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAdvances.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
                        No employee advances found.
                      </td>
                    </tr>
                  ) : (
                    filteredAdvances.map(adv => (
                      <tr
                        key={adv.id}
                        style={{
                          borderBottom: '1px solid rgba(255,255,255,0.04)'
                        }}
                      >
                        <td style={{ padding: '12px 16px', fontWeight: 600, color: '#38bdf8' }}>
                          {adv.advance_number}
                        </td>
                        <td style={{ padding: '12px 16px', color: '#cbd5e1' }}>{adv.advance_date}</td>
                        <td style={{ padding: '12px 16px', fontWeight: 600, color: '#f8fafc' }}>
                          {adv.employee_name}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div>{adv.advance_type.replace(/_/g, ' ')}</div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{adv.purpose || '-'}</div>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>
                          {parseFloat(adv.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: parseFloat(adv.outstanding_balance) > 0 ? '#f59e0b' : '#10b981' }}>
                          {parseFloat(adv.outstanding_balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '12px 16px' }}>{getStatusBadge(adv.status)}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            {adv.status === 'PENDING_APPROVAL' && (
                              <>
                                <button
                                  onClick={() => handleApproveAdvance(adv.id)}
                                  style={{
                                    background: '#10b981',
                                    border: 'none',
                                    color: '#fff',
                                    borderRadius: '4px',
                                    padding: '4px 8px',
                                    fontSize: '0.75rem',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleRejectAdvance(adv.id)}
                                  style={{
                                    background: 'transparent',
                                    border: '1px solid #ef4444',
                                    color: '#ef4444',
                                    borderRadius: '4px',
                                    padding: '4px 8px',
                                    fontSize: '0.75rem',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Reject
                                </button>
                              </>
                            )}

                            {adv.status === 'APPROVED' && (
                              <button
                                onClick={() => {
                                  setPayingAdvance(adv);
                                  setAdvancePayBank(bankAccounts[0]?.id || '');
                                }}
                                style={{
                                  background: '#059669',
                                  border: 'none',
                                  color: '#fff',
                                  borderRadius: '4px',
                                  padding: '4px 10px',
                                  fontSize: '0.75rem',
                                  fontWeight: 600,
                                  cursor: 'pointer'
                                }}
                              >
                                Disburse Advance
                              </button>
                            )}

                            {adv.status === 'PAID' && parseFloat(adv.outstanding_balance) > 0 && (
                              <button
                                onClick={() => setSettlingAdvance(adv)}
                                style={{
                                  background: '#3b82f6',
                                  border: 'none',
                                  color: '#fff',
                                  borderRadius: '4px',
                                  padding: '4px 10px',
                                  fontSize: '0.75rem',
                                  fontWeight: 600,
                                  cursor: 'pointer'
                                }}
                              >
                                Settle Advance
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* SubView 5: Categories */}
          {subView === 'CATEGORIES' && (
            <div style={{
              background: 'var(--color-surface, #1e222b)',
              borderRadius: '10px',
              border: '1px solid var(--color-border, #333a48)',
              overflow: 'hidden'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{
                    backgroundColor: 'rgba(255,255,255,0.02)',
                    borderBottom: '1px solid var(--color-border, #333a48)',
                    color: '#94a3b8',
                    textAlign: 'left'
                  }}>
                    <th style={{ padding: '12px 16px' }}>Category Name</th>
                    <th style={{ padding: '12px 16px' }}>Code</th>
                    <th style={{ padding: '12px 16px' }}>Description</th>
                    <th style={{ padding: '12px 16px' }}>Default GL Expense Account</th>
                    <th style={{ padding: '12px 16px' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map(cat => (
                    <tr key={cat.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: '#f8fafc' }}>{cat.name}</td>
                      <td style={{ padding: '12px 16px', color: '#38bdf8' }}>{cat.code || '-'}</td>
                      <td style={{ padding: '12px 16px', color: '#94a3b8' }}>{cat.description || '-'}</td>
                      <td style={{ padding: '12px 16px', color: '#cbd5e1' }}>
                        {cat.default_expense_account_name ? `${cat.default_expense_account_name} (${cat.default_expense_account_code})` : 'Auto-mapped'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: cat.is_active ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                          color: cat.is_active ? '#10b981' : '#ef4444',
                          fontSize: '0.75rem',
                          fontWeight: 600
                        }}>
                          {cat.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {showNewExpenseModal && (
        <NewExpenseModal
          categories={categories}
          bankAccounts={bankAccounts}
          costCenters={costCenters}
          profitCenters={profitCenters}
          sites={sites}
          onClose={() => setShowNewExpenseModal(false)}
          onSuccess={() => {
            setShowNewExpenseModal(false);
            loadData();
          }}
        />
      )}

      {showNewClaimModal && (
        <NewClaimModal
          categories={categories}
          employees={employees}
          costCenters={costCenters}
          sites={sites}
          onClose={() => setShowNewClaimModal(false)}
          onSuccess={() => {
            setShowNewClaimModal(false);
            loadData();
          }}
        />
      )}

      {showNewAdvanceModal && (
        <NewAdvanceModal
          employees={employees}
          onClose={() => setShowNewAdvanceModal(false)}
          onSuccess={() => {
            setShowNewAdvanceModal(false);
            loadData();
          }}
        />
      )}

      {selectedExpense && (
        <ExpenseWorkspaceModal
          expense={selectedExpense}
          bankAccounts={bankAccounts}
          onClose={() => setSelectedExpense(null)}
          onRefresh={loadData}
        />
      )}

      {settlingAdvance && (
        <SettleAdvanceModal
          advance={settlingAdvance}
          bankAccounts={bankAccounts}
          onClose={() => setSettlingAdvance(null)}
          onSuccess={() => {
            setSettlingAdvance(null);
            loadData();
          }}
        />
      )}

      {pettyCashModalData && (
        <FundPettyCashModal
          pettyCashAccount={pettyCashModalData.account}
          bankAccounts={bankAccounts}
          categories={categories}
          costCenters={costCenters}
          mode={pettyCashModalData.mode}
          onClose={() => setPettyCashModalData(null)}
          onSuccess={() => {
            setPettyCashModalData(null);
            loadData();
          }}
        />
      )}

      {/* Advance Disbursal Dialog */}
      {payingAdvance && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--color-surface, #1e222b)',
            border: '1px solid var(--color-border, #333a48)',
            borderRadius: '10px',
            width: '100%',
            maxWidth: '480px',
            padding: '20px',
            color: '#fff'
          }}>
            <h4 style={{ margin: '0 0 6px', fontSize: '1.1rem' }}>Disburse Employee Advance</h4>
            <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: '#94a3b8' }}>
              Advance: <strong>{payingAdvance.advance_number}</strong> to <strong>{payingAdvance.employee_name}</strong> for <strong style={{ color: '#38bdf8' }}>PKR {parseFloat(payingAdvance.amount).toLocaleString()}</strong>.
            </p>

            <form onSubmit={handlePayAdvanceConfirm} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px' }}>Source Bank / Cash Account *</label>
                <select
                  value={advancePayBank}
                  onChange={e => setAdvancePayBank(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border, #333a48)',
                    background: 'var(--color-background, #14171f)',
                    color: '#fff',
                    fontSize: '0.85rem'
                  }}
                >
                  {bankAccounts.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.account_title} ({b.account_type}) - PKR {parseFloat(b.current_balance || 0).toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px' }}>Payment Method</label>
                <select
                  value={advancePayMethod}
                  onChange={e => setAdvancePayMethod(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border, #333a48)',
                    background: 'var(--color-background, #14171f)',
                    color: '#fff',
                    fontSize: '0.85rem'
                  }}
                >
                  <option value="BANK_TRANSFER">Bank Transfer / Online</option>
                  <option value="CASH">Cash</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="DIRECT_DEPOSIT">Direct Deposit</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px' }}>Payment Reference / Cheque #</label>
                <input
                  type="text"
                  value={advancePayRef}
                  onChange={e => setAdvancePayRef(e.target.value)}
                  placeholder="e.g. ADV-DISB-9988"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border, #333a48)',
                    background: 'var(--color-background, #14171f)',
                    color: '#fff',
                    fontSize: '0.85rem'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setPayingAdvance(null)}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--color-border, #333a48)',
                    color: '#fff',
                    borderRadius: '6px',
                    padding: '8px 14px',
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={advanceActionLoading}
                  style={{
                    background: '#059669',
                    border: 'none',
                    color: '#fff',
                    borderRadius: '6px',
                    padding: '8px 18px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {advanceActionLoading ? 'Posting...' : 'Confirm & Disburse'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Category Modal */}
      {showNewCategoryModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--color-surface, #1e222b)',
            border: '1px solid var(--color-border, #333a48)',
            borderRadius: '10px',
            width: '100%',
            maxWidth: '440px',
            padding: '20px',
            color: '#fff'
          }}>
            <h4 style={{ margin: '0 0 14px', fontSize: '1.1rem' }}>Create Expense Category</h4>

            <form onSubmit={handleCreateCategorySubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px' }}>Category Name *</label>
                <input
                  type="text"
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  placeholder="e.g. Generator Fuel & Lubricants"
                  required
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border, #333a48)',
                    background: 'var(--color-background, #14171f)',
                    color: '#fff',
                    fontSize: '0.85rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px' }}>Category Code</label>
                <input
                  type="text"
                  value={newCatCode}
                  onChange={e => setNewCatCode(e.target.value)}
                  placeholder="e.g. FUEL"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border, #333a48)',
                    background: 'var(--color-background, #14171f)',
                    color: '#fff',
                    fontSize: '0.85rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px' }}>Description</label>
                <textarea
                  rows={2}
                  value={newCatDesc}
                  onChange={e => setNewCatDesc(e.target.value)}
                  placeholder="Category purpose..."
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border, #333a48)',
                    background: 'var(--color-background, #14171f)',
                    color: '#fff',
                    fontSize: '0.85rem'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowNewCategoryModal(false)}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--color-border, #333a48)',
                    color: '#fff',
                    borderRadius: '6px',
                    padding: '8px 14px',
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    background: 'var(--color-primary, #3b82f6)',
                    border: 'none',
                    color: '#fff',
                    borderRadius: '6px',
                    padding: '8px 18px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
