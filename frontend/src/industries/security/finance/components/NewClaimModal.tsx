import React, { useState } from 'react';
import type { ExpenseCategory, ExpenseItem } from '../api';
import { createExpense } from '../api';

interface NewClaimModalProps {
  categories: ExpenseCategory[];
  employees: any[];
  costCenters: any[];
  sites: any[];
  onClose: () => void;
  onSuccess: (expense: ExpenseItem) => void;
}

export const NewClaimModal: React.FC<NewClaimModalProps> = ({
  categories,
  employees,
  costCenters,
  sites,
  onClose,
  onSuccess
}) => {
  const [employee, setEmployee] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [costCenter, setCostCenter] = useState('');
  const [site, setSite] = useState('');
  const [receiptReference, setReceiptReference] = useState('');
  const [receiptUrl, setReceiptUrl] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!employee) {
      setError('Please select an employee submitting the claim.');
      return;
    }
    if (!title.trim()) {
      setError('Please specify the claim purpose / title.');
      return;
    }
    const parsedAmount = parseFloat(amount) || 0;
    if (parsedAmount <= 0) {
      setError('Claim amount must be greater than zero.');
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, any> = {
        title,
        expense_type: 'EMPLOYEE_CLAIM',
        employee,
        category: category || undefined,
        amount: parsedAmount,
        tax_amount: 0,
        expense_date: expenseDate,
        cost_center: costCenter || undefined,
        site: site || undefined,
        receipt_reference: receiptReference,
        receipt_url: receiptUrl,
        description: description || undefined,
        submit_now: true,
        auto_pay: false
      };

      const res = await createExpense(payload);
      onSuccess(res);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err.message || 'Failed to submit claim.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.7)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{
        background: 'var(--color-surface, #1e222b)',
        border: '1px solid var(--color-border, #333a48)',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '620px',
        maxHeight: '90vh',
        overflowY: 'auto',
        color: 'var(--color-text, #fff)',
        boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--color-border, #333a48)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Submit Employee Claim</h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--color-text-secondary, #94a3b8)' }}>
              Out-of-pocket expenses incurred by guards, supervisors, or staff for reimbursement.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-text-secondary, #94a3b8)',
              fontSize: '1.5rem',
              cursor: 'pointer',
              lineHeight: 1
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {error && (
            <div style={{
              padding: '12px 16px',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid #ef4444',
              borderRadius: '8px',
              color: '#fca5a5',
              fontSize: '0.875rem'
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 500 }}>
                Claimant Employee *
              </label>
              <select
                value={employee}
                onChange={e => setEmployee(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border, #333a48)',
                  background: 'var(--color-background, #14171f)',
                  color: '#fff',
                  fontSize: '0.9rem'
                }}
              >
                <option value="">-- Select Employee --</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name} ({emp.employee_code || 'EMP'})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 500 }}>
                Category
              </label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border, #333a48)',
                  background: 'var(--color-background, #14171f)',
                  color: '#fff',
                  fontSize: '0.9rem'
                }}
              >
                <option value="">-- Select Category --</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 500 }}>
              Claim Purpose / Description *
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Travel & Taxi Fare for Night Patrol Supervision"
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '6px',
                border: '1px solid var(--color-border, #333a48)',
                background: 'var(--color-background, #14171f)',
                color: '#fff',
                fontSize: '0.9rem'
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 500 }}>
                Claim Amount (PKR) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border, #333a48)',
                  background: 'var(--color-background, #14171f)',
                  color: '#fff',
                  fontSize: '0.9rem'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 500 }}>
                Expense Incurred Date
              </label>
              <input
                type="date"
                value={expenseDate}
                onChange={e => setExpenseDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border, #333a48)',
                  background: 'var(--color-background, #14171f)',
                  color: '#fff',
                  fontSize: '0.9rem'
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 500 }}>
                Department / Cost Center
              </label>
              <select
                value={costCenter}
                onChange={e => setCostCenter(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border, #333a48)',
                  background: 'var(--color-background, #14171f)',
                  color: '#fff',
                  fontSize: '0.9rem'
                }}
              >
                <option value="">-- General --</option>
                {costCenters.map(cc => (
                  <option key={cc.id} value={cc.id}>{cc.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 500 }}>
                Operational Site (Optional)
              </label>
              <select
                value={site}
                onChange={e => setSite(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border, #333a48)',
                  background: 'var(--color-background, #14171f)',
                  color: '#fff',
                  fontSize: '0.9rem'
                }}
              >
                <option value="">-- None --</option>
                {sites.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 500 }}>
                Physical Bill / Receipt Ref #
              </label>
              <input
                type="text"
                value={receiptReference}
                onChange={e => setReceiptReference(e.target.value)}
                placeholder="e.g. REC-8821"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border, #333a48)',
                  background: 'var(--color-background, #14171f)',
                  color: '#fff',
                  fontSize: '0.9rem'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 500 }}>
                Scanned Bill / Receipt URL (Optional)
              </label>
              <input
                type="url"
                value={receiptUrl}
                onChange={e => setReceiptUrl(e.target.value)}
                placeholder="https://..."
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border, #333a48)',
                  background: 'var(--color-background, #14171f)',
                  color: '#fff',
                  fontSize: '0.9rem'
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 500 }}>
              Additional Details / Justification (Optional)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g. Approved for night patrolling deployment"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '6px',
                border: '1px solid var(--color-border, #333a48)',
                background: 'var(--color-background, #14171f)',
                color: '#fff',
                fontSize: '0.9rem',
                resize: 'vertical'
              }}
            />
          </div>

          {/* Footer buttons */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            marginTop: '12px',
            paddingTop: '16px',
            borderTop: '1px solid var(--color-border, #333a48)'
          }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: '1px solid var(--color-border, #333a48)',
                borderRadius: '6px',
                color: 'var(--color-text, #fff)',
                padding: '10px 18px',
                fontSize: '0.9rem',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving}
              style={{
                background: '#10b981',
                border: 'none',
                borderRadius: '6px',
                color: '#fff',
                padding: '10px 22px',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1
              }}
            >
              {saving ? 'Submitting...' : 'Submit Claim'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
