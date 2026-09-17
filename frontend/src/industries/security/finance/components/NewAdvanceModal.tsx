import React, { useState } from 'react';
import type { EmployeeAdvanceItem } from '../api';
import { createEmployeeAdvance } from '../api';

interface NewAdvanceModalProps {
  employees: any[];
  onClose: () => void;
  onSuccess: (advance: EmployeeAdvanceItem) => void;
}

export const NewAdvanceModal: React.FC<NewAdvanceModalProps> = ({
  employees,
  onClose,
  onSuccess
}) => {
  const [employee, setEmployee] = useState('');
  const [advanceType, setAdvanceType] = useState('SALARY_ADVANCE');
  const [amount, setAmount] = useState('');
  const [advanceDate, setAdvanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [expectedSettlementDate, setExpectedSettlementDate] = useState('');
  const [recoveryMethod, setRecoveryMethod] = useState('EXPENSE_SETTLEMENT');
  const [purpose, setPurpose] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!employee) {
      setError('Please select the employee requesting advance.');
      return;
    }
    const parsedAmount = parseFloat(amount) || 0;
    if (parsedAmount <= 0) {
      setError('Advance amount must be greater than zero.');
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, any> = {
        employee,
        advance_type: advanceType,
        amount: parsedAmount,
        advance_date: advanceDate,
        expected_settlement_date: expectedSettlementDate || undefined,
        recovery_method: recoveryMethod,
        purpose,
        submit_now: true
      };

      const res = await createEmployeeAdvance(payload);
      onSuccess(res);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err.message || 'Failed to request advance.');
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
        maxWidth: '580px',
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
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Request Employee Advance</h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--color-text-secondary, #94a3b8)' }}>
              Operational floats, salary advances, and site deployment advances.
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
                Employee *
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
                Advance Type
              </label>
              <select
                value={advanceType}
                onChange={e => setAdvanceType(e.target.value)}
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
                <option value="SALARY_ADVANCE">Salary Advance</option>
                <option value="SITE_ADVANCE">Site Operations Advance</option>
                <option value="TRAVEL_ADVANCE">Travel / Inspection Advance</option>
                <option value="EMERGENCY_ADVANCE">Emergency Welfare Advance</option>
                <option value="OPERATIONAL_ADVANCE">General Operational Advance</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 500 }}>
                Advance Amount (PKR) *
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
                Recovery Method
              </label>
              <select
                value={recoveryMethod}
                onChange={e => setRecoveryMethod(e.target.value)}
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
                <option value="EXPENSE_SETTLEMENT">Expense Voucher Settlement</option>
                <option value="PAYROLL_DEDUCTION">Monthly Payroll Deduction</option>
                <option value="CASH_RETURN">Cash Return to Treasury</option>
                <option value="MIXED">Mixed (Expenses + Cash Return)</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 500 }}>
                Advance Date
              </label>
              <input
                type="date"
                value={advanceDate}
                onChange={e => setAdvanceDate(e.target.value)}
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
                Expected Settlement Date
              </label>
              <input
                type="date"
                value={expectedSettlementDate}
                onChange={e => setExpectedSettlementDate(e.target.value)}
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
              Purpose & Operational Notes
            </label>
            <textarea
              rows={3}
              value={purpose}
              onChange={e => setPurpose(e.target.value)}
              placeholder="e.g. Fuel & rations advance for 5-day outstation security deployment in Gwadar site"
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
                background: 'var(--color-primary, #3b82f6)',
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
              {saving ? 'Requesting...' : 'Submit Advance Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
