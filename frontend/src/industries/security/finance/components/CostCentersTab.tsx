import React, { useState, useEffect } from 'react';
import {
  fetchCostCenters,
  fetchCostCenterTree,
  createCostCenter,
  updateCostCenter,
} from '../api';
import type { CostCenter } from '../api';

export const CostCentersTab: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [treeData, setTreeData] = useState<CostCenter[]>([]);
  const [viewMode, setViewMode] = useState<'tree' | 'flat'>('tree');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modal State
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editingCC, setEditingCC] = useState<CostCenter | null>(null);
  const [formData, setFormData] = useState<Partial<CostCenter>>({
    code: '',
    name: '',
    parent: null,
    description: '',
    is_active: true,
  });
  const [saving, setSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [flatList, treeList] = await Promise.all([
        fetchCostCenters(),
        fetchCostCenterTree(),
      ]);
      setCostCenters(flatList);
      setTreeData(treeList);
    } catch (err) {
      console.error('Failed to load cost centers', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenModal = (cc?: CostCenter) => {
    setErrorMsg(null);
    if (cc) {
      setEditingCC(cc);
      setFormData({
        code: cc.code,
        name: cc.name,
        parent: cc.parent,
        description: cc.description,
        is_active: cc.is_active,
      });
    } else {
      setEditingCC(null);
      setFormData({
        code: '',
        name: '',
        parent: null,
        description: '',
        is_active: true,
      });
    }
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    try {
      if (editingCC) {
        await updateCostCenter(editingCC.id, formData);
      } else {
        await createCostCenter(formData);
      }
      setModalOpen(false);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.detail || JSON.stringify(err?.response?.data) || 'Failed to save cost center.');
    } finally {
      setSaving(false);
    }
  };

  const filteredCostCenters = costCenters.filter((cc) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return cc.code.toLowerCase().includes(q) || cc.name.toLowerCase().includes(q) || cc.description?.toLowerCase().includes(q);
  });

  const renderTreeNode = (node: CostCenter, depth: number = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    return (
      <div key={node.id} style={{ marginBottom: '6px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            borderRadius: '6px',
            backgroundColor: depth === 0 ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.015)',
            borderLeft: `${3 + depth * 2}px solid #3b82f6`,
            marginLeft: `${depth * 22}px`,
            borderBottom: '1px solid rgba(255,255,255,0.03)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#60a5fa', fontSize: '13px' }}>
              {node.code}
            </span>
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#f8fafc' }}>
              {node.name}
            </span>
            {node.description && (
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>— {node.description}</span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: '11px',
                padding: '2px 6px',
                borderRadius: '4px',
                background: node.is_active ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: node.is_active ? '#4ade80' : '#f87171',
              }}
            >
              {node.is_active ? 'Active' : 'Inactive'}
            </span>
            <button
              onClick={() => handleOpenModal(node)}
              style={{
                padding: '4px 10px',
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
          </div>
        </div>

        {hasChildren && node.children!.map((child) => renderTreeNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
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
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Search cost center code or name..."
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

          <div style={{ display: 'flex', borderRadius: '6px', overflow: 'hidden', border: '1px solid #334155' }}>
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
              🌳 Tree
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
              📋 Flat
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
          }}
        >
          ＋ New Cost Center
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading cost centers...</div>
      ) : viewMode === 'tree' && !searchQuery ? (
        <div
          style={{
            background: 'var(--color-surface, #1e293b)',
            padding: '16px',
            borderRadius: '10px',
            border: '1px solid var(--color-border, rgba(255,255,255,0.06))',
          }}
        >
          {treeData.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>No cost centers defined.</div>
          ) : (
            treeData.map((node) => renderTreeNode(node, 0))
          )}
        </div>
      ) : (
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
                <th style={{ padding: '12px 16px', textAlign: 'left', color: '#94a3b8' }}>Name</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: '#94a3b8' }}>Parent</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: '#94a3b8' }}>Description</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', color: '#94a3b8' }}>Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', color: '#94a3b8' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCostCenters.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                    No cost centers found.
                  </td>
                </tr>
              ) : (
                filteredCostCenters.map((cc) => (
                  <tr key={cc.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontWeight: 600, color: '#60a5fa' }}>
                      {cc.code}
                    </td>
                    <td style={{ padding: '10px 16px', color: '#f8fafc', fontWeight: 500 }}>{cc.name}</td>
                    <td style={{ padding: '10px 16px', color: '#94a3b8' }}>
                      {cc.parent_code ? `${cc.parent_code} - ${cc.parent_name}` : '—'}
                    </td>
                    <td style={{ padding: '10px 16px', color: '#cbd5e1' }}>{cc.description || '—'}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: cc.is_active ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: cc.is_active ? '#4ade80' : '#f87171',
                        }}
                      >
                        {cc.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                      <button
                        onClick={() => handleOpenModal(cc)}
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
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
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
              maxWidth: '480px',
              padding: '24px',
            }}
          >
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#f8fafc' }}>
              {editingCC ? `Edit Cost Center: ${editingCC.code}` : 'New Cost Center'}
            </h3>

            {errorMsg && (
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#fca5a5',
                  fontSize: '12px',
                  marginBottom: '12px',
                }}
              >
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                    Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      background: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                    Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      background: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                  Parent Cost Center (Optional)
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
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="">None (Top-Level)</option>
                  {costCenters
                    .filter((c) => !editingCC || c.id !== editingCC.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} - {c.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                  Description
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
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#cbd5e1', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                />
                Active
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  style={{
                    padding: '8px 14px',
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
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
