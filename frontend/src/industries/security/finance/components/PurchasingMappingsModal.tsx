import React, { useState, useEffect } from 'react';
import type {
  PurchasingItemAccountMappingItem,
  ChartOfAccount,
  ExpenseCategory,
} from '../api';
import {
  fetchPurchasingMappings,
  createPurchasingMapping,
  deletePurchasingMapping,
  fetchInventoryCategories,
  fetchInventoryItems,
  fetchExpenseCategories,
} from '../api';

interface PurchasingMappingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: ChartOfAccount[];
  onMappingsChanged?: () => void;
}

export const PurchasingMappingsModal: React.FC<PurchasingMappingsModalProps> = ({
  isOpen,
  onClose,
  accounts,
  onMappingsChanged,
}) => {
  if (!isOpen) return null;

  const [mappings, setMappings] = useState<PurchasingItemAccountMappingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reference data
  const [items, setItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);

  // Form State
  const [mappingType, setMappingType] = useState<'ITEM' | 'CATEGORY' | 'EXPENSE_CATEGORY'>('ITEM');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedExpenseCatId, setSelectedExpenseCatId] = useState('');
  const [selectedClassification, setSelectedClassification] = useState('INVENTORY_ASSET');
  const [selectedDebitAccountId, setSelectedDebitAccountId] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const selectableAccounts = accounts.filter((acc) => !acc.is_header && acc.allow_posting && acc.is_active);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [maps, itms, cats, expCats] = await Promise.all([
        fetchPurchasingMappings(),
        fetchInventoryItems().catch(() => []),
        fetchInventoryCategories().catch(() => []),
        fetchExpenseCategories().catch(() => []),
      ]);
      setMappings(maps);
      setItems(itms);
      setCategories(cats);
      setExpenseCategories(expCats);
    } catch (err: any) {
      setError(err.message || 'Failed to load purchasing mappings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDebitAccountId) {
      setError('Please select a Debit Account.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload: Partial<PurchasingItemAccountMappingItem> = {
        account_classification: selectedClassification,
        debit_account: selectedDebitAccountId,
        notes,
        is_active: true,
      };

      if (mappingType === 'ITEM') {
        if (!selectedItemId) throw new Error('Please select an item.');
        payload.item = selectedItemId;
      } else if (mappingType === 'CATEGORY') {
        if (!selectedCategoryId) throw new Error('Please select an inventory category.');
        payload.item_category = selectedCategoryId;
      } else if (mappingType === 'EXPENSE_CATEGORY') {
        if (!selectedExpenseCatId) throw new Error('Please select an expense category.');
        payload.expense_category = selectedExpenseCatId;
      }

      await createPurchasingMapping(payload);
      // Reset form
      setSelectedItemId('');
      setSelectedCategoryId('');
      setSelectedExpenseCatId('');
      setNotes('');
      await loadData();
      if (onMappingsChanged) onMappingsChanged();
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Failed to create mapping rule');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this mapping rule?')) return;
    try {
      await deletePurchasingMapping(id);
      await loadData();
      if (onMappingsChanged) onMappingsChanged();
    } catch (err: any) {
      alert(err?.response?.data?.error || err.message || 'Failed to delete mapping rule');
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1050,
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--color-surface, #1e293b)',
          borderRadius: '12px',
          width: '950px',
          maxWidth: '95vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
          border: '1px solid var(--color-border, #334155)',
          color: 'var(--color-text, #f8fafc)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--color-border, #334155)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Purchasing Item & Category Account Mappings</h2>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--color-text-secondary, #94a3b8)' }}>
              Configure deterministic debit account rules by Specific Item, Inventory Category, or Expense Category.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              color: 'var(--color-text-secondary, #94a3b8)',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {error && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '6px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                color: '#fca5a5',
                fontSize: '13px',
                border: '1px solid rgba(239, 68, 68, 0.3)',
              }}
            >
              {error}
            </div>
          )}

          {/* New Rule Creation Form */}
          <form
            onSubmit={handleCreate}
            style={{
              padding: '16px',
              borderRadius: '8px',
              backgroundColor: 'var(--color-surface-sunken, #0f172a)',
              border: '1px solid var(--color-border, #334155)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#38bdf8' }}>+ Add New Mapping Rule</div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              {/* Type */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, marginBottom: '4px' }}>Rule Target</label>
                <select
                  value={mappingType}
                  onChange={(e) => setMappingType(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--color-surface, #1e293b)',
                    border: '1px solid var(--color-border, #334155)',
                    color: 'var(--color-text, #f8fafc)',
                    fontSize: '12px',
                  }}
                >
                  <option value="ITEM">Specific Inventory Item</option>
                  <option value="CATEGORY">Inventory Category</option>
                  <option value="EXPENSE_CATEGORY">Direct Expense Category</option>
                </select>
              </div>

              {/* Target Selector */}
              {mappingType === 'ITEM' && (
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, marginBottom: '4px' }}>Select Item</label>
                  <select
                    value={selectedItemId}
                    onChange={(e) => setSelectedItemId(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      backgroundColor: 'var(--color-surface, #1e293b)',
                      border: '1px solid var(--color-border, #334155)',
                      color: 'var(--color-text, #f8fafc)',
                      fontSize: '12px',
                    }}
                  >
                    <option value="">Choose item...</option>
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.sku ? `[${it.sku}] ` : ''}{it.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {mappingType === 'CATEGORY' && (
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, marginBottom: '4px' }}>Inventory Category</label>
                  <select
                    value={selectedCategoryId}
                    onChange={(e) => setSelectedCategoryId(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      backgroundColor: 'var(--color-surface, #1e293b)',
                      border: '1px solid var(--color-border, #334155)',
                      color: 'var(--color-text, #f8fafc)',
                      fontSize: '12px',
                    }}
                  >
                    <option value="">Choose category...</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {mappingType === 'EXPENSE_CATEGORY' && (
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, marginBottom: '4px' }}>Expense Category</label>
                  <select
                    value={selectedExpenseCatId}
                    onChange={(e) => setSelectedExpenseCatId(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      backgroundColor: 'var(--color-surface, #1e293b)',
                      border: '1px solid var(--color-border, #334155)',
                      color: 'var(--color-text, #f8fafc)',
                      fontSize: '12px',
                    }}
                  >
                    <option value="">Choose expense category...</option>
                    {expenseCategories.map((ec) => (
                      <option key={ec.id} value={ec.id}>
                        {ec.name} ({ec.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Classification */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, marginBottom: '4px' }}>Classification</label>
                <select
                  value={selectedClassification}
                  onChange={(e) => setSelectedClassification(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--color-surface, #1e293b)',
                    border: '1px solid var(--color-border, #334155)',
                    color: 'var(--color-text, #f8fafc)',
                    fontSize: '12px',
                  }}
                >
                  <option value="INVENTORY_ASSET">Inventory Asset (Balance Sheet)</option>
                  <option value="FIXED_ASSET">Fixed Asset (Equipment / Vehicles)</option>
                  <option value="OPERATING_EXPENSE">Operating Expense (P&L)</option>
                  <option value="DIRECT_COST">Direct Cost of Service (P&L)</option>
                  <option value="WIP_PROJECT">Work in Progress / Project</option>
                </select>
              </div>

              {/* Debit Account */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, marginBottom: '4px' }}>Target Debit GL Account *</label>
                <select
                  value={selectedDebitAccountId}
                  onChange={(e) => setSelectedDebitAccountId(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--color-surface, #1e293b)',
                    border: '1px solid var(--color-border, #334155)',
                    color: 'var(--color-text, #f8fafc)',
                    fontSize: '12px',
                  }}
                >
                  <option value="">Select Account...</option>
                  {selectableAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.account_code} — {acc.account_name} ({acc.account_type})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '4px' }}>
              <input
                type="text"
                placeholder="Optional notes or rationale..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  borderRadius: '6px',
                  backgroundColor: 'var(--color-surface, #1e293b)',
                  border: '1px solid var(--color-border, #334155)',
                  color: 'var(--color-text, #f8fafc)',
                  fontSize: '12px',
                }}
              />
              <button
                type="submit"
                disabled={saving}
                style={{
                  padding: '6px 16px',
                  borderRadius: '6px',
                  backgroundColor: 'var(--color-primary, #3b82f6)',
                  border: 'none',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {saving ? 'Adding...' : 'Save Mapping Rule'}
              </button>
            </div>
          </form>

          {/* Existing Rules Table */}
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
              Active Mapping Rules ({mappings.length})
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border, #334155)', color: 'var(--color-text-secondary, #94a3b8)' }}>
                  <th style={{ textAlign: 'left', padding: '8px' }}>Precedence / Target</th>
                  <th style={{ textAlign: 'left', padding: '8px' }}>Classification</th>
                  <th style={{ textAlign: 'left', padding: '8px' }}>Target Debit GL Account</th>
                  <th style={{ textAlign: 'left', padding: '8px' }}>Notes</th>
                  <th style={{ textAlign: 'center', padding: '8px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '16px' }}>Loading mappings...</td>
                  </tr>
                ) : mappings.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '16px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                      No custom mapping rules configured. Defaulting to Company Configuration settings.
                    </td>
                  </tr>
                ) : (
                  mappings.map((m) => (
                    <tr key={m.id} style={{ borderBottom: '1px solid var(--color-border, #334155)' }}>
                      <td style={{ padding: '8px' }}>
                        {m.item_name ? (
                          <div>
                            <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '10px', backgroundColor: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', marginRight: '6px' }}>
                              ITEM
                            </span>
                            <strong>{m.item_name}</strong> {m.item_sku && `(${m.item_sku})`}
                          </div>
                        ) : m.item_category_name ? (
                          <div>
                            <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '10px', backgroundColor: 'rgba(168, 85, 247, 0.2)', color: '#c084fc', marginRight: '6px' }}>
                              INV CAT
                            </span>
                            <strong>{m.item_category_name}</strong>
                          </div>
                        ) : (
                          <div>
                            <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '10px', backgroundColor: 'rgba(234, 179, 8, 0.2)', color: '#facc15', marginRight: '6px' }}>
                              EXP CAT
                            </span>
                            <strong>{m.expense_category_name}</strong>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '8px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                        {m.account_classification}
                      </td>
                      <td style={{ padding: '8px' }}>
                        <span style={{ fontWeight: 600, color: '#38bdf8' }}>{m.debit_account_code}</span> — {m.debit_account_name}
                      </td>
                      <td style={{ padding: '8px', color: 'var(--color-text-secondary, #94a3b8)' }}>{m.notes || '—'}</td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <button
                          onClick={() => handleDelete(m.id)}
                          style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            backgroundColor: 'rgba(239, 68, 68, 0.15)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            color: '#f87171',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid var(--color-border, #334155)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '6px 16px',
              borderRadius: '6px',
              backgroundColor: 'var(--color-surface-hover, #334155)',
              border: '1px solid var(--color-border, #475569)',
              color: 'var(--color-text, #f8fafc)',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
