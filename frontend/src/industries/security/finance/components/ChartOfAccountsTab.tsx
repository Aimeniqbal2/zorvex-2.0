import React, { useState, useEffect } from 'react';
import {
  fetchChartOfAccounts,
  fetchCOATree,
  createAccount,
  updateAccount,
  deleteAccount,
} from '../api';
import type {
  ChartOfAccount,
  AccountType,
  NormalBalance,
} from '../api';

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  ASSET: 'Asset',
  LIABILITY: 'Liability',
  EQUITY: 'Equity',
  REVENUE: 'Revenue',
  COST_OF_SERVICE: 'Cost of Service / COGS',
  EXPENSE: 'Operating Expense',
  OTHER_INCOME: 'Other Income',
  OTHER_EXPENSE: 'Other Expense',
};

const ACCOUNT_TYPE_COLORS: Record<AccountType, string> = {
  ASSET: '#3b82f6',
  LIABILITY: '#f97316',
  EQUITY: '#a855f7',
  REVENUE: '#22c55e',
  COST_OF_SERVICE: '#eab308',
  EXPENSE: '#ec4899',
  OTHER_INCOME: '#14b8a6',
  OTHER_EXPENSE: '#64748b',
};

export const ChartOfAccountsTab: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [treeData, setTreeData] = useState<ChartOfAccount[]>([]);
  const [viewMode, setViewMode] = useState<'tree' | 'flat'>('tree');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [filterActive] = useState<string>('true');

  // Modal State
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editingAccount, setEditingAccount] = useState<ChartOfAccount | null>(null);
  const [formData, setFormData] = useState<Partial<ChartOfAccount>>({
    account_code: '',
    account_name: '',
    account_type: 'ASSET',
    normal_balance: 'DEBIT',
    parent: null,
    is_header: false,
    allow_posting: true,
    is_control_account: false,
    is_active: true,
    description: '',
  });
  const [saving, setSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [flatList, treeList] = await Promise.all([
        fetchChartOfAccounts({ is_active: filterActive === 'all' ? undefined : filterActive }),
        fetchCOATree(),
      ]);
      setAccounts(flatList);
      setTreeData(treeList);
    } catch (err) {
      console.error('Failed to load accounts', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filterActive]);

  const handleOpenModal = (account?: ChartOfAccount) => {
    setErrorMsg(null);
    if (account) {
      setEditingAccount(account);
      setFormData({
        account_code: account.account_code,
        account_name: account.account_name,
        account_type: account.account_type,
        normal_balance: account.normal_balance,
        parent: account.parent,
        is_header: account.is_header,
        allow_posting: account.allow_posting,
        is_control_account: account.is_control_account,
        is_active: account.is_active,
        description: account.description,
      });
    } else {
      setEditingAccount(null);
      setFormData({
        account_code: '',
        account_name: '',
        account_type: 'ASSET',
        normal_balance: 'DEBIT',
        parent: null,
        is_header: false,
        allow_posting: true,
        is_control_account: false,
        is_active: true,
        description: '',
      });
    }
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    try {
      if (editingAccount) {
        await updateAccount(editingAccount.id, formData);
      } else {
        await createAccount(formData);
      }
      setModalOpen(false);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.detail || JSON.stringify(err?.response?.data) || 'Failed to save account.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (account: ChartOfAccount) => {
    if (account.is_system_controlled) {
      alert('System-controlled accounts cannot be deleted.');
      return;
    }
    if (!confirm(`Are you sure you want to delete account ${account.account_code} - ${account.account_name}?`)) {
      return;
    }
    try {
      await deleteAccount(account.id);
      await loadData();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to delete account.');
    }
  };

  const filteredAccounts = accounts.filter((acc) => {
    if (filterType && acc.account_type !== filterType) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        acc.account_code.toLowerCase().includes(q) ||
        acc.account_name.toLowerCase().includes(q) ||
        acc.description?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const renderTreeNode = (node: ChartOfAccount, depth: number = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const typeColor = ACCOUNT_TYPE_COLORS[node.account_type] || '#64748b';

    return (
      <div key={node.id} style={{ marginBottom: '4px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            borderRadius: '6px',
            backgroundColor: node.is_header
              ? 'rgba(255, 255, 255, 0.04)'
              : 'rgba(255, 255, 255, 0.015)',
            borderLeft: `${3 + depth * 2}px solid ${typeColor}`,
            marginLeft: `${depth * 20}px`,
            borderBottom: '1px solid rgba(255,255,255,0.03)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                fontFamily: 'monospace',
                fontWeight: 700,
                color: '#f8fafc',
                fontSize: '13px',
                minWidth: '60px',
              }}
            >
              {node.account_code}
            </span>
            <span
              style={{
                fontSize: '13px',
                fontWeight: node.is_header ? 700 : 500,
                color: node.is_header ? '#f8fafc' : '#cbd5e1',
              }}
            >
              {node.account_name}
            </span>

            <span
              style={{
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: `${typeColor}22`,
                color: typeColor,
                border: `1px solid ${typeColor}44`,
                fontWeight: 600,
              }}
            >
              {ACCOUNT_TYPE_LABELS[node.account_type] || node.account_type}
            </span>

            {node.is_header && (
              <span
                style={{
                  fontSize: '10px',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(148, 163, 184, 0.15)',
                  color: '#94a3b8',
                }}
              >
                HEADER
              </span>
            )}

            {node.is_control_account && (
              <span
                style={{
                  fontSize: '10px',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(234, 179, 8, 0.15)',
                  color: '#fde047',
                  border: '1px solid rgba(234, 179, 8, 0.3)',
                }}
              >
                CONTROL ACC
              </span>
            )}

            {!node.allow_posting && !node.is_header && (
              <span style={{ fontSize: '10px', color: '#f87171' }}>[Non-Posting]</span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ fontSize: '12px', fontFamily: 'monospace', color: '#cbd5e1' }}>
              PKR {parseFloat(node.current_balance || '0').toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => handleOpenModal(node)}
                style={{
                  padding: '4px 8px',
                  background: 'rgba(59, 130, 246, 0.15)',
                  color: '#60a5fa',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                Edit
              </button>
              {!node.is_system_controlled && !hasChildren && (
                <button
                  onClick={() => handleDelete(node)}
                  style={{
                    padding: '4px 8px',
                    background: 'rgba(239, 68, 68, 0.15)',
                    color: '#f87171',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>

        {hasChildren && node.children!.map((child) => renderTreeNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Controls Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          background: 'var(--color-surface, #1e293b)',
          padding: '16px',
          borderRadius: '10px',
          border: '1px solid var(--color-border, rgba(255,255,255,0.06))',
        }}
      >
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search code or account title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: '8px 12px',
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '6px',
              color: '#f8fafc',
              fontSize: '13px',
              minWidth: '240px',
            }}
          />

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            style={{
              padding: '8px 12px',
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '6px',
              color: '#f8fafc',
              fontSize: '13px',
            }}
          >
            <option value="">All Account Types</option>
            {Object.entries(ACCOUNT_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>

          <div
            style={{
              display: 'flex',
              borderRadius: '6px',
              overflow: 'hidden',
              border: '1px solid #334155',
            }}
          >
            <button
              onClick={() => setViewMode('tree')}
              style={{
                padding: '6px 12px',
                border: 'none',
                background: viewMode === 'tree' ? '#3b82f6' : '#0f172a',
                color: '#f8fafc',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              🌳 Tree View
            </button>
            <button
              onClick={() => setViewMode('flat')}
              style={{
                padding: '6px 12px',
                border: 'none',
                background: viewMode === 'flat' ? '#3b82f6' : '#0f172a',
                color: '#f8fafc',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              📋 Flat List
            </button>
          </div>
        </div>

        <button
          onClick={() => handleOpenModal()}
          style={{
            padding: '8px 16px',
            background: '#3b82f6',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span>＋</span> Add General Ledger Account
        </button>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
          Loading Chart of Accounts...
        </div>
      ) : viewMode === 'tree' && !filterType && !searchQuery ? (
        <div
          style={{
            background: 'var(--color-surface, #1e293b)',
            padding: '16px',
            borderRadius: '10px',
            border: '1px solid var(--color-border, rgba(255,255,255,0.06))',
          }}
        >
          {treeData.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
              No Chart of Accounts found. Click "Provision Standard Security COA" from the Overview tab to initialize.
            </div>
          ) : (
            treeData.map((node) => renderTreeNode(node, 0))
          )}
        </div>
      ) : (
        /* Flat List Table */
        <div
          style={{
            background: 'var(--color-surface, #1e293b)',
            borderRadius: '10px',
            border: '1px solid var(--color-border, rgba(255,255,255,0.06))',
            overflowX: 'auto',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: '#94a3b8' }}>Code</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: '#94a3b8' }}>Account Title</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: '#94a3b8' }}>Type</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: '#94a3b8' }}>Parent Code</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', color: '#94a3b8' }}>Normal Bal</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', color: '#94a3b8' }}>Header</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', color: '#94a3b8' }}>Posting</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', color: '#94a3b8' }}>Current Balance</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', color: '#94a3b8' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                    No accounts matching query.
                  </td>
                </tr>
              ) : (
                filteredAccounts.map((acc) => (
                  <tr
                    key={acc.id}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      backgroundColor: acc.is_header ? 'rgba(255,255,255,0.02)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontWeight: 600, color: '#f8fafc' }}>
                      {acc.account_code}
                    </td>
                    <td style={{ padding: '10px 16px', color: '#f8fafc', fontWeight: acc.is_header ? 600 : 400 }}>
                      {acc.account_name}
                      {acc.is_control_account && (
                        <span style={{ marginLeft: '6px', fontSize: '10px', color: '#fde047' }}>★ Control</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          color: ACCOUNT_TYPE_COLORS[acc.account_type] || '#cbd5e1',
                          fontWeight: 600,
                        }}
                      >
                        {ACCOUNT_TYPE_LABELS[acc.account_type] || acc.account_type}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', color: '#94a3b8' }}>
                      {acc.parent_code ? `${acc.parent_code} (${acc.parent_name})` : '—'}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'center', color: '#cbd5e1' }}>
                      {acc.normal_balance}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                      {acc.is_header ? '✓' : '—'}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                      {acc.allow_posting ? (
                        <span style={{ color: '#4ade80' }}>Yes</span>
                      ) : (
                        <span style={{ color: '#f87171' }}>No</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'monospace', color: '#f8fafc' }}>
                      PKR {parseFloat(acc.current_balance || '0').toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                      <button
                        onClick={() => handleOpenModal(acc)}
                        style={{
                          padding: '4px 8px',
                          background: 'rgba(59, 130, 246, 0.15)',
                          color: '#60a5fa',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '11px',
                          cursor: 'pointer',
                          marginRight: '6px',
                        }}
                      >
                        Edit
                      </button>
                      {!acc.is_system_controlled && (
                        <button
                          onClick={() => handleDelete(acc)}
                          style={{
                            padding: '4px 8px',
                            background: 'rgba(239, 68, 68, 0.15)',
                            color: '#f87171',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Account Add/Edit Modal */}
      {modalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
        >
          <div
            style={{
              background: '#1e293b',
              borderRadius: '12px',
              border: '1px solid #334155',
              width: '100%',
              maxWidth: '560px',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 600, color: '#f8fafc' }}>
                {editingAccount ? `Edit Account: ${editingAccount.account_code}` : 'New General Ledger Account'}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {errorMsg && (
              <div
                style={{
                  padding: '10px',
                  borderRadius: '6px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#fca5a5',
                  fontSize: '12px',
                  marginBottom: '14px',
                }}
              >
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                    Account Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.account_code}
                    onChange={(e) => setFormData({ ...formData, account_code: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      background: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                    Account Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.account_name}
                    onChange={(e) => setFormData({ ...formData, account_name: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      background: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                    Account Type *
                  </label>
                  <select
                    value={formData.account_type}
                    onChange={(e) => setFormData({ ...formData, account_type: e.target.value as AccountType })}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      background: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                    }}
                  >
                    {Object.entries(ACCOUNT_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                    Normal Balance
                  </label>
                  <select
                    value={formData.normal_balance}
                    onChange={(e) => setFormData({ ...formData, normal_balance: e.target.value as NormalBalance })}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      background: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="DEBIT">Debit</option>
                    <option value="CREDIT">Credit</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                  Parent Account (Optional)
                </label>
                <select
                  value={formData.parent || ''}
                  onChange={(e) => setFormData({ ...formData, parent: e.target.value || null })}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="">None (Top-Level Node)</option>
                  {accounts
                    .filter((a) => !editingAccount || a.id !== editingAccount.id)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.account_code} - {a.account_name} ({ACCOUNT_TYPE_LABELS[a.account_type] || a.account_type})
                      </option>
                    ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginTop: '4px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#cbd5e1', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.is_header}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        is_header: e.target.checked,
                        allow_posting: e.target.checked ? false : formData.allow_posting,
                      })
                    }
                  />
                  Header Account
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#cbd5e1', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.allow_posting && !formData.is_header}
                    disabled={formData.is_header}
                    onChange={(e) => setFormData({ ...formData, allow_posting: e.target.checked })}
                  />
                  Allow Direct Posting
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#cbd5e1', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.is_control_account}
                    onChange={(e) => setFormData({ ...formData, is_control_account: e.target.checked })}
                  />
                  Control Account
                </label>
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                  Description / Purpose
                </label>
                <textarea
                  rows={2}
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  style={{
                    padding: '8px 16px',
                    background: '#334155',
                    color: '#cbd5e1',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    padding: '8px 16px',
                    background: '#3b82f6',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: saving ? 'not-allowed' : 'pointer',
                  }}
                >
                  {saving ? 'Saving...' : 'Save Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
