import React, { useState, useEffect } from 'react';
import type { EmployeeAdvanceItem, ExpenseItem } from '../api';
import { settleEmployeeAdvance, fetchExpenses } from '../api';

interface SettleAdvanceModalProps {
  advance: EmployeeAdvanceItem;
  bankAccounts: any[];
  onClose: () => void;
  onSuccess: (summary: any) => void;
}

export const SettleAdvanceModal: React.FC<SettleAdvanceModalProps> = ({
  advance,
  bankAccounts,
  onClose,
  onSuccess
}) => {
  const [candidateExpenses, setCandidateExpenses] = useState<ExpenseItem[]>([]);
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<string[]>([]);
  const [cashReturned, setCashReturned] = useState('0');
  const [cashReturnBank, setCashReturnBank] = useState(bankAccounts[0]?.id || '');
  const [loading, setLoading] = useState(false);
  const [fetchingExp, setFetchingExp] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const outstanding = parseFloat(advance.outstanding_balance || '0');

  useEffect(() => {
    const loadEmployeeExpenses = async () => {
      setFetchingExp(true);
      try {
        // Fetch unpaid or approved expenses for this employee
        const res = await fetchExpenses({
          employee: advance.employee,
          status: 'APPROVED'
        });
        setCandidateExpenses(res);
      } catch (err: any) {
        console.error('Failed to load candidate expenses', err);
      } finally {
        setFetchingExp(false);
      }
    };
    loadEmployeeExpenses();
  }, [advance.employee]);

  const handleToggleExpense = (id: string) => {
    if (selectedExpenseIds.includes(id)) {
      setSelectedExpenseIds(selectedExpenseIds.filter(x => x !== id));
    } else {
      setSelectedExpenseIds([...selectedExpenseIds, id]);
    }
  };

  const selectedExpenses = candidateExpenses.filter(e => selectedExpenseIds.includes(e.id));
  const totalSelectedExpenseAmt = selectedExpenses.reduce((sum, e) => sum + (parseFloat(e.total_amount) || 0), 0);
  const parsedCashReturn = parseFloat(cashReturned) || 0;
  const totalSettledProposal = totalSelectedExpenseAmt + parsedCashReturn;

  const excess = totalSettledProposal > outstanding ? totalSettledProposal - outstanding : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (selectedExpenseIds.length === 0 && parsedCashReturn <= 0) {
      setError('Please select at least one expense voucher or specify an unspent cash return amount.');
      return;
    }

    if (parsedCashReturn > 0 && !cashReturnBank) {
      setError('Please select a destination cash/bank account for unspent cash return.');
      return;
    }

    setLoading(true);
    try {
      const res = await settleEmployeeAdvance(advance.id, {
        expense_ids: selectedExpenseIds,
        cash_returned: parsedCashReturn,
        cash_return_bank_account: parsedCashReturn > 0 ? cashReturnBank : undefined
      });
      onSuccess(res.summary);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err.message || 'Failed to settle advance.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.75)',
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
        maxWidth: '680px',
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
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
              Settle Advance: {advance.advance_number}
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--color-text-secondary, #94a3b8)' }}>
              Employee: <strong>{advance.employee_name}</strong> | Outstanding Balance: <strong style={{ color: '#38bdf8' }}>PKR {outstanding.toLocaleString()}</strong>
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
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

          {/* Candidate Expenses Section */}
          <div>
            <h4 style={{ margin: '0 0 8px', fontSize: '0.95rem', fontWeight: 600 }}>
              1. Select Approved Expenses Submitted by Employee
            </h4>
            {fetchingExp ? (
              <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                Loading submitted expenses...
              </div>
            ) : candidateExpenses.length === 0 ? (
              <div style={{
                padding: '14px',
                borderRadius: '6px',
                background: 'rgba(255,255,255,0.02)',
                border: '1px dashed var(--color-border, #333a48)',
                textAlign: 'center',
                color: '#94a3b8',
                fontSize: '0.85rem'
              }}>
                No approved unlinked expenses found for {advance.employee_name}. (You can settle via Cash Return below).
              </div>
            ) : (
              <div style={{
                maxHeight: '180px',
                overflowY: 'auto',
                border: '1px solid var(--color-border, #333a48)',
                borderRadius: '6px'
              }}>
                {candidateExpenses.map(exp => {
                  const isSelected = selectedExpenseIds.includes(exp.id);
                  return (
                    <div
                      key={exp.id}
                      onClick={() => handleToggleExpense(exp.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                        />
                        <div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{exp.expense_number} - {exp.title}</div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                            {exp.expense_date} | {exp.category_name || 'Expense'}
                          </div>
                        </div>
                      </div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#38bdf8' }}>
                        PKR {parseFloat(exp.total_amount).toLocaleString()}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Cash Return Section */}
          <div style={{
            padding: '14px',
            borderRadius: '8px',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid var(--color-border, #333a48)'
          }}>
            <h4 style={{ margin: '0 0 10px', fontSize: '0.95rem', fontWeight: 600 }}>
              2. Unspent Cash Returned to Treasury (Optional)
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px' }}>
                  Cash Return Amount (PKR)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={cashReturned}
                  onChange={e => setCashReturned(e.target.value)}
                  placeholder="0.00"
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
                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px' }}>
                  Destination Bank / Cash Account
                </label>
                <select
                  value={cashReturnBank}
                  onChange={e => setCashReturnBank(e.target.value)}
                  disabled={parsedCashReturn <= 0}
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
                      {b.account_title} ({b.account_type})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Settlement Summary Calculation */}
          <div style={{
            padding: '14px',
            borderRadius: '8px',
            background: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.85rem'
          }}>
            <div>
              <div>Expenses Claimed: <strong>PKR {totalSelectedExpenseAmt.toLocaleString()}</strong></div>
              <div>Cash Returned: <strong>PKR {parsedCashReturn.toLocaleString()}</strong></div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: '#94a3b8' }}>Remaining Advance Balance:</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: totalSettledProposal >= outstanding ? '#10b981' : '#38bdf8' }}>
                PKR {Math.max(0, outstanding - totalSettledProposal).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              {excess > 0 && (
                <div style={{ fontSize: '0.75rem', color: '#f59e0b', marginTop: '2px' }}>
                  * Excess claim of PKR {excess.toLocaleString()} requires company reimbursement.
                </div>
              )}
            </div>
          </div>

          {/* Footer buttons */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            marginTop: '8px',
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
              disabled={loading}
              style={{
                background: '#10b981',
                border: 'none',
                borderRadius: '6px',
                color: '#fff',
                padding: '10px 22px',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1
              }}
            >
              {loading ? 'Settling...' : 'Confirm Advance Settlement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
