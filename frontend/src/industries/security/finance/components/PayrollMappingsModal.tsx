import React, { useState, useEffect } from 'react';
import type {
  PayrollAccountMappingItem,
  ChartOfAccount,
} from '../api';
import {
  fetchPayrollMappings,
  createPayrollMapping,
  deletePayrollMapping,
} from '../api';

interface PayrollMappingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  chartOfAccounts: ChartOfAccount[];
}

export const PayrollMappingsModal: React.FC<PayrollMappingsModalProps> = ({
  isOpen,
  onClose,
  chartOfAccounts,
}) => {
  const [mappings, setMappings] = useState<PayrollAccountMappingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  // Form State
  const [classificationType, setClassificationType] = useState<'COST_OF_SERVICE' | 'OPERATING_EXPENSE' | 'DIRECT_COST'>('COST_OF_SERVICE');
  const [salaryExpenseAccountId, setSalaryExpenseAccountId] = useState('');
  const [overtimeExpenseAccountId, setOvertimeExpenseAccountId] = useState('');
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadMappings = async () => {
    try {
      setLoading(true);
      const data = await fetchPayrollMappings();
      setMappings(data);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || 'Failed to load payroll account mappings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadMappings();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!salaryExpenseAccountId) {
      setErrorMsg('Please select a Salary Expense GL Account.');
      return;
    }

    try {
      setCreating(true);
      setErrorMsg(null);
      await createPayrollMapping({
        classification_type: classificationType,
        salary_expense_account: salaryExpenseAccountId,
        overtime_expense_account: overtimeExpenseAccountId || null,
        notes,
        is_active: true,
      });

      setNotes('');
      await loadMappings();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || 'Failed to save mapping rule.');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this payroll accounting rule?')) return;
    try {
      await deletePayrollMapping(id);
      await loadMappings();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to delete mapping.');
    }
  };

  const expenseAccounts = chartOfAccounts.filter((a) => a.account_type === 'COST_OF_SERVICE' || a.account_type === 'EXPENSE');

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: 'var(--color-surface, #1e293b)',
        border: '1px solid var(--color-border, #334155)',
        borderRadius: '12px',
        width: '850px',
        maxWidth: '95vw',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
        color: 'var(--color-text, #f8fafc)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--color-border, #334155)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
              ⚙️ Payroll & Salary GL Account Routing Rules
            </h2>
            <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '4px' }}>
              Deterministic Precedence: Employee Override &rarr; Designation &rarr; Department &rarr; Company Configuration
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.5rem',
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            &times;
          </button>
        </div>

        {errorMsg && (
          <div style={{ margin: '16px 24px 0', padding: '10px 14px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', color: '#ef4444', fontSize: '0.85rem' }}>
            {errorMsg}
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Create Rule Form */}
          <form onSubmit={handleCreate} style={{
            padding: '16px',
            background: 'rgba(0, 0, 0, 0.2)',
            border: '1px solid var(--color-border, #334155)',
            borderRadius: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#60a5fa' }}>
              Add New Salary Routing Mapping
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Classification</label>
                <select
                  value={classificationType}
                  onChange={(e) => setClassificationType(e.target.value as any)}
                  style={{ width: '100%', padding: '6px 10px', background: 'rgba(0,0,0,0.3)', border: '1px solid #475569', borderRadius: '4px', color: '#f8fafc', fontSize: '0.85rem' }}
                >
                  <option value="COST_OF_SERVICE">Cost of Service (Guards)</option>
                  <option value="OPERATING_EXPENSE">Operating Expense (HQ Staff)</option>
                  <option value="DIRECT_COST">Direct Site Project Cost</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Salary Expense Account *</label>
                <select
                  value={salaryExpenseAccountId}
                  onChange={(e) => setSalaryExpenseAccountId(e.target.value)}
                  required
                  style={{ width: '100%', padding: '6px 10px', background: 'rgba(0,0,0,0.3)', border: '1px solid #475569', borderRadius: '4px', color: '#f8fafc', fontSize: '0.85rem' }}
                >
                  <option value="">-- Select Expense Account --</option>
                  {expenseAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.account_code} - {a.account_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Overtime Expense Account</label>
                <select
                  value={overtimeExpenseAccountId}
                  onChange={(e) => setOvertimeExpenseAccountId(e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', background: 'rgba(0,0,0,0.3)', border: '1px solid #475569', borderRadius: '4px', color: '#f8fafc', fontSize: '0.85rem' }}
                >
                  <option value="">-- Optional OT Account --</option>
                  {expenseAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.account_code} - {a.account_name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Rule notes / description"
                style={{ flex: 1, padding: '6px 10px', background: 'rgba(0,0,0,0.3)', border: '1px solid #475569', borderRadius: '4px', color: '#f8fafc', fontSize: '0.85rem' }}
              />
              <button
                type="submit"
                disabled={creating}
                style={{
                  padding: '6px 16px',
                  background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                  border: 'none',
                  color: '#ffffff',
                  fontWeight: 600,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                {creating ? 'Saving...' : '+ Add Rule'}
              </button>
            </div>
          </form>

          {/* Active Rules List */}
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#cbd5e1', marginBottom: '8px' }}>
              Active Routing Rules ({mappings.length})
            </div>

            {loading ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>Loading rules...</div>
            ) : mappings.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', background: 'rgba(0,0,0,0.1)', borderRadius: '6px' }}>
                No custom routing mappings configured. All payroll runs fall back to Company Configuration defaults (Guards: 5100/5200, Staff: 6200).
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ background: 'rgba(0, 0, 0, 0.2)', textAlign: 'left', borderBottom: '1px solid var(--color-border, #334155)' }}>
                    <th style={{ padding: '8px 12px', color: '#94a3b8' }}>Scope / Target</th>
                    <th style={{ padding: '8px 12px', color: '#94a3b8' }}>Classification</th>
                    <th style={{ padding: '8px 12px', color: '#94a3b8' }}>Salary Expense Account</th>
                    <th style={{ padding: '8px 12px', color: '#94a3b8' }}>OT Account</th>
                    <th style={{ padding: '8px 12px', color: '#94a3b8' }}>Notes</th>
                    <th style={{ padding: '8px 12px', color: '#94a3b8', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {mappings.map((m) => (
                    <tr key={m.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600, color: '#f8fafc' }}>
                        {m.employee_name ? `👤 ${m.employee_name}` : m.designation_name ? `🏷️ ${m.designation_name}` : m.department_name ? `🏢 ${m.department_name}` : '🌐 Default'}
                      </td>
                      <td style={{ padding: '8px 12px', color: '#cbd5e1' }}>{m.classification_type}</td>
                      <td style={{ padding: '8px 12px', color: '#60a5fa' }}>
                        {m.salary_expense_account_code} - {m.salary_expense_account_name}
                      </td>
                      <td style={{ padding: '8px 12px', color: '#94a3b8' }}>
                        {m.overtime_expense_account_code ? `${m.overtime_expense_account_code} - ${m.overtime_expense_account_name}` : '—'}
                      </td>
                      <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{m.notes || '—'}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <button
                          onClick={() => handleDelete(m.id)}
                          style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1rem' }}
                          title="Delete Rule"
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--color-border, #334155)',
          display: 'flex',
          justifyContent: 'flex-end',
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid var(--color-border, #334155)',
              color: '#f8fafc',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
