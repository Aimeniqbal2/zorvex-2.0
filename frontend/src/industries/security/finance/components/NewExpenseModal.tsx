import React, { useState } from 'react';
import type {
  ExpenseCategory,
  ExpenseAllocationItem,
  ExpenseItem,
} from '../api';
import { createExpense } from '../api';

interface NewExpenseModalProps {
  categories: ExpenseCategory[];
  bankAccounts: any[];
  costCenters: any[];
  profitCenters: any[];
  sites: any[];
  onClose: () => void;
  onSuccess: (expense: ExpenseItem) => void;
}

export const NewExpenseModal: React.FC<NewExpenseModalProps> = ({
  categories,
  bankAccounts,
  costCenters,
  profitCenters,
  sites,
  onClose,
  onSuccess
}) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [expenseType] = useState('DIRECT_EXPENSE');
  const [amount, setAmount] = useState('');
  const [taxAmount, setTaxAmount] = useState('0');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [payee, setPayee] = useState('');
  const [costCenter, setCostCenter] = useState('');
  const [profitCenter, setProfitCenter] = useState('');
  const [site, setSite] = useState('');
  const [receiptReference, setReceiptReference] = useState('');
  const [description] = useState('');
  const [notes] = useState('');
  const [submitNow, setSubmitNow] = useState(true);
  const [autoPay, setAutoPay] = useState(false);
  const [bankAccount, setBankAccount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('BANK_TRANSFER');

  // Split allocation
  const [isSplitAllocation, setIsSplitAllocation] = useState(false);
  const [allocations, setAllocations] = useState<ExpenseAllocationItem[]>([
    { amount: '', cost_center: '', profit_center: '', site: '', description: '' }
  ]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedAmount = parseFloat(amount) || 0;
  const parsedTax = parseFloat(taxAmount) || 0;
  const totalAmount = parsedAmount + parsedTax;

  const handleAddAllocationRow = () => {
    setAllocations([
      ...allocations,
      { amount: '', cost_center: '', profit_center: '', site: '', description: '' }
    ]);
  };

  const handleRemoveAllocationRow = (idx: number) => {
    setAllocations(allocations.filter((_, i) => i !== idx));
  };

  const handleAllocationChange = (idx: number, field: keyof ExpenseAllocationItem, val: any) => {
    const next = [...allocations];
    next[idx] = { ...next[idx], [field]: val };
    setAllocations(next);
  };

  const totalAllocated = allocations.reduce((sum, a) => sum + (parseFloat(String(a.amount)) || 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Please provide an expense title.');
      return;
    }
    if (parsedAmount <= 0) {
      setError('Expense amount must be greater than zero.');
      return;
    }

    if (isSplitAllocation) {
      if (Math.abs(totalAllocated - totalAmount) > 0.01) {
        setError(`Split allocation sum (${totalAllocated.toFixed(2)}) must equal total expense amount (${totalAmount.toFixed(2)}).`);
        return;
      }
    }

    if (autoPay && !bankAccount) {
      setError('Please select a payment bank/cash account for immediate payment.');
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, any> = {
        title,
        expense_type: expenseType,
        category: category || undefined,
        amount: parsedAmount,
        tax_amount: parsedTax,
        expense_date: expenseDate,
        payee,
        cost_center: !isSplitAllocation ? (costCenter || undefined) : undefined,
        profit_center: !isSplitAllocation ? (profitCenter || undefined) : undefined,
        site: !isSplitAllocation ? (site || undefined) : undefined,
        receipt_reference: receiptReference,
        description,
        notes,
        submit_now: submitNow,
        auto_pay: autoPay,
        bank_account: autoPay ? bankAccount : undefined,
        payment_method: autoPay ? paymentMethod : undefined,
        allocations: isSplitAllocation ? allocations.map(a => ({
          amount: parseFloat(String(a.amount)) || 0,
          cost_center: a.cost_center || undefined,
          profit_center: a.profit_center || undefined,
          site: a.site || undefined,
          description: a.description
        })) : undefined
      };

      const res = await createExpense(payload);
      onSuccess(res);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err.message || 'Failed to record expense.');
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
        maxWidth: '740px',
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
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Record Company Expense</h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--color-text-secondary, #94a3b8)' }}>
              Direct vendor invoices, office utility bills, fleet fueling & site expenses.
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

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 500 }}>
                Expense Title / Description *
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Head Office Generator Diesel Fuel"
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
                Expense Category
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
                  <option key={c.id} value={c.id}>
                    {c.name} {c.code ? `(${c.code})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 500 }}>
                Amount (PKR) *
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
                Tax Amount (PKR)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={taxAmount}
                onChange={e => setTaxAmount(e.target.value)}
                placeholder="0.00"
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
                Total (PKR)
              </label>
              <div style={{
                padding: '10px 12px',
                borderRadius: '6px',
                border: '1px solid var(--color-border, #333a48)',
                background: 'rgba(255,255,255,0.04)',
                color: '#38bdf8',
                fontWeight: 600,
                fontSize: '0.95rem'
              }}>
                PKR {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 500 }}>
                Expense Date
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

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 500 }}>
                Payee / Vendor Name
              </label>
              <input
                type="text"
                value={payee}
                onChange={e => setPayee(e.target.value)}
                placeholder="e.g. Shell Petrol Station / K-Electric"
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
                Receipt / Bill Ref #
              </label>
              <input
                type="text"
                value={receiptReference}
                onChange={e => setReceiptReference(e.target.value)}
                placeholder="e.g. INV-9901"
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

          {/* Allocation mode toggle */}
          <div style={{
            padding: '14px',
            borderRadius: '8px',
            backgroundColor: 'rgba(255,255,255,0.02)',
            border: '1px solid var(--color-border, #333a48)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isSplitAllocation ? '12px' : '0' }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Cost Allocation</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary, #94a3b8)', marginLeft: '10px' }}>
                  {isSplitAllocation ? 'Split across multiple cost centers / sites' : 'Single primary department / site'}
                </span>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
                <input
                  type="checkbox"
                  checked={isSplitAllocation}
                  onChange={e => setIsSplitAllocation(e.target.checked)}
                />
                Enable Split Cost Allocation
              </label>
            </div>

            {!isSplitAllocation ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginTop: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px' }}>Cost Center</label>
                  <select
                    value={costCenter}
                    onChange={e => setCostCenter(e.target.value)}
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
                    <option value="">-- None (Company Wide) --</option>
                    {costCenters.map(cc => (
                      <option key={cc.id} value={cc.id}>{cc.name} ({cc.code})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px' }}>Profit Center</label>
                  <select
                    value={profitCenter}
                    onChange={e => setProfitCenter(e.target.value)}
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
                    <option value="">-- None --</option>
                    {profitCenters.map(pc => (
                      <option key={pc.id} value={pc.id}>{pc.name} ({pc.code})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px' }}>Operational Site</label>
                  <select
                    value={site}
                    onChange={e => setSite(e.target.value)}
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
                    <option value="">-- None --</option>
                    {sites.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {allocations.map((alloc, idx) => (
                  <div key={idx} style={{
                    display: 'grid',
                    gridTemplateColumns: '120px 1fr 1fr 1fr 32px',
                    gap: '8px',
                    alignItems: 'center'
                  }}>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Amount"
                      value={alloc.amount}
                      onChange={e => handleAllocationChange(idx, 'amount', e.target.value)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '6px',
                        border: '1px solid var(--color-border, #333a48)',
                        background: 'var(--color-background, #14171f)',
                        color: '#fff',
                        fontSize: '0.85rem'
                      }}
                    />
                    <select
                      value={alloc.cost_center || ''}
                      onChange={e => handleAllocationChange(idx, 'cost_center', e.target.value)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '6px',
                        border: '1px solid var(--color-border, #333a48)',
                        background: 'var(--color-background, #14171f)',
                        color: '#fff',
                        fontSize: '0.85rem'
                      }}
                    >
                      <option value="">-- Cost Center --</option>
                      {costCenters.map(cc => (
                        <option key={cc.id} value={cc.id}>{cc.name}</option>
                      ))}
                    </select>

                    <select
                      value={alloc.site || ''}
                      onChange={e => handleAllocationChange(idx, 'site', e.target.value)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '6px',
                        border: '1px solid var(--color-border, #333a48)',
                        background: 'var(--color-background, #14171f)',
                        color: '#fff',
                        fontSize: '0.85rem'
                      }}
                    >
                      <option value="">-- Site --</option>
                      {sites.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>

                    <input
                      type="text"
                      placeholder="Notes / Dept"
                      value={alloc.description || ''}
                      onChange={e => handleAllocationChange(idx, 'description', e.target.value)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '6px',
                        border: '1px solid var(--color-border, #333a48)',
                        background: 'var(--color-background, #14171f)',
                        color: '#fff',
                        fontSize: '0.85rem'
                      }}
                    />

                    <button
                      type="button"
                      onClick={() => handleRemoveAllocationRow(idx)}
                      disabled={allocations.length === 1}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: allocations.length === 1 ? '#555' : '#ef4444',
                        cursor: allocations.length === 1 ? 'not-allowed' : 'pointer',
                        fontSize: '1.2rem',
                        padding: '0'
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                  <button
                    type="button"
                    onClick={handleAddAllocationRow}
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid var(--color-border, #333a48)',
                      borderRadius: '6px',
                      color: 'var(--color-text, #fff)',
                      padding: '6px 12px',
                      fontSize: '0.8rem',
                      cursor: 'pointer'
                    }}
                  >
                    + Add Split Line
                  </button>

                  <div style={{ fontSize: '0.85rem' }}>
                    Allocated: <strong style={{ color: Math.abs(totalAllocated - totalAmount) < 0.01 ? '#22c55e' : '#ef4444' }}>
                      PKR {totalAllocated.toFixed(2)}
                    </strong> / PKR {totalAmount.toFixed(2)}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Workflow & Instant Pay Checkboxes */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
              <input
                type="checkbox"
                checked={submitNow}
                onChange={e => setSubmitNow(e.target.checked)}
              />
              Submit immediately for management approval (Skip Draft state)
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
              <input
                type="checkbox"
                checked={autoPay}
                onChange={e => setAutoPay(e.target.checked)}
              />
              Immediate Settlement (Pay from Treasury Account now)
            </label>

            {autoPay && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
                padding: '12px',
                borderRadius: '6px',
                background: 'rgba(16, 185, 129, 0.06)',
                border: '1px solid rgba(16, 185, 129, 0.2)'
              }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px' }}>Bank / Cash Account *</label>
                  <select
                    value={bankAccount}
                    onChange={e => setBankAccount(e.target.value)}
                    required={autoPay}
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
                    <option value="">-- Select Treasury Account --</option>
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
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value)}
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
              </div>
            )}
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
              {saving ? 'Recording...' : 'Record Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
