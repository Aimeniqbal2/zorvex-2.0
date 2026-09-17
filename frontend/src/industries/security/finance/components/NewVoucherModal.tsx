import React, { useState, useEffect } from 'react';
import type {
  FinancialVoucherType,
  VoucherPaymentMethod,
  BankAccount,
  ChartOfAccount,
  CostCenter,
  FinancialVoucherLineItem
} from '../api';
import {
  createFinancialVoucher,
  fetchBankAccounts,
  fetchChartOfAccounts,
  fetchCostCenters
} from '../api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const NewVoucherModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
  const [voucherType, setVoucherType] = useState<FinancialVoucherType>('RECEIPT_VOUCHER');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<VoucherPaymentMethod>('BANK_TRANSFER');
  const [bankAccountId, setBankAccountId] = useState<string>('');
  const [destinationBankAccountId, setDestinationBankAccountId] = useState<string>('');
  const [paymentAccountId] = useState<string>('');
  const [counterpartyName, setCounterpartyName] = useState<string>('');
  const [reference, setReference] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [autoPost, setAutoPost] = useState<boolean>(false);

  // Dynamic Lines
  const [lines, setLines] = useState<FinancialVoucherLineItem[]>([]);

  // Reference data
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadRefData();
    }
  }, [isOpen]);

  const loadRefData = async () => {
    try {
      const [bankRes, coaRes, ccRes] = await Promise.all([
        fetchBankAccounts(),
        fetchChartOfAccounts(),
        fetchCostCenters()
      ]);
      setBankAccounts(bankRes);
      setAccounts(coaRes);
      setCostCenters(ccRes);
    } catch (err: any) {
      console.error('Failed to load reference data:', err);
    }
  };

  const handleAddLine = () => {
    setLines([
      ...lines,
      {
        account: accounts[0]?.id || '',
        amount: '',
        description: '',
        cost_center: null
      }
    ]);
  };

  const handleRemoveLine = (idx: number) => {
    setLines(lines.filter((_, i) => i !== idx));
  };

  const handleLineChange = (idx: number, field: keyof FinancialVoucherLineItem, val: any) => {
    const updated = [...lines];
    updated[idx] = { ...updated[idx], [field]: val };
    setLines(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) {
      setError('Please enter a valid amount.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await createFinancialVoucher({
        voucher_type: voucherType,
        date,
        amount,
        bank_account: bankAccountId || undefined,
        destination_bank_account: destinationBankAccountId || undefined,
        payment_account: paymentAccountId || undefined,
        payment_method: paymentMethod,
        counterparty_name: counterpartyName,
        reference,
        description,
        lines_data: lines.length > 0 ? lines : undefined,
        auto_post: autoPost
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to create financial voucher.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const isContra = voucherType === 'CONTRA_VOUCHER' || voucherType === 'CONTRA';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.75)',
        zIndex: 1000,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '24px',
        backdropFilter: 'blur(4px)'
      }}
    >
      <div
        style={{
          background: '#0f172a',
          borderRadius: '10px',
          border: '1px solid rgba(255,255,255,0.12)',
          width: '100%',
          maxWidth: '750px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#f8fafc' }}>
              Create Financial Voucher
            </h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
              Universal voucher entry for cash, bank, contra, and journal movements.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '20px',
              cursor: 'pointer'
            }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {error && (
            <div style={{ padding: '10px 14px', borderRadius: '6px', background: 'rgba(239,68,68,0.15)', color: '#fca5a5', fontSize: '12px' }}>
              {error}
            </div>
          )}

          {/* Type & Date */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Voucher Type *</label>
              <select
                value={voucherType}
                onChange={(e) => setVoucherType(e.target.value as FinancialVoucherType)}
                required
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
              >
                <option value="RECEIPT_VOUCHER">Receipt Voucher (Universal)</option>
                <option value="BANK_RECEIPT">Bank Receipt (Money In)</option>
                <option value="CASH_RECEIPT">Cash Receipt (Money In)</option>
                <option value="PAYMENT_VOUCHER">Payment Voucher (Universal)</option>
                <option value="BANK_PAYMENT">Bank Payment (Money Out)</option>
                <option value="CASH_PAYMENT">Cash Payment (Money Out)</option>
                <option value="CONTRA_VOUCHER">Contra Transfer (Two-sided)</option>
                <option value="PETTY_CASH_VOUCHER">Petty Cash Voucher</option>
                <option value="JOURNAL_VOUCHER">Journal Voucher</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Voucher Date *</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
              />
            </div>
          </div>

          {/* Amount & Payment Method */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Total Amount (PKR) *</label>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                placeholder="0.00"
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Payment Method *</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as VoucherPaymentMethod)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
              >
                <option value="BANK_TRANSFER">Bank Transfer / Wire</option>
                <option value="CHEQUE">Cheque</option>
                <option value="CASH">Cash</option>
                <option value="ONLINE_TRANSFER">Online Transfer</option>
                <option value="DIRECT_DEPOSIT">Direct Deposit</option>
                <option value="WALLET">Wallet (Easypaisa/Jazzcash)</option>
              </select>
            </div>
          </div>

          {/* Bank / Cash Accounts */}
          <div style={{ display: 'grid', gridTemplateColumns: isContra ? '1fr 1fr' : '1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>
                {isContra ? 'Source Account (From) *' : 'Treasury Account (Bank / Cash)'}
              </label>
              <select
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
              >
                <option value="">Select account...</option>
                {bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.account_title} ({b.account_type_display} - Bal: PKR {b.current_balance})
                  </option>
                ))}
              </select>
            </div>

            {isContra && (
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Destination Account (To) *</label>
                <select
                  value={destinationBankAccountId}
                  onChange={(e) => setDestinationBankAccountId(e.target.value)}
                  required={isContra}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
                >
                  <option value="">Select destination...</option>
                  {bankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.account_title} ({b.account_type_display})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Payee / Counterparty & Reference */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Payee / Client / Counterparty</label>
              <input
                type="text"
                value={counterpartyName}
                onChange={(e) => setCounterpartyName(e.target.value)}
                placeholder="e.g. Standard Chartered Bank / Client Name"
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Reference # (Cheque/Slip/Invoice)</label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. CHQ-99812 or INV-1002"
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Description / Purpose</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Operational details and rationale for this voucher..."
              style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
            />
          </div>

          {/* Line Items Breakdown (Optional) */}
          {!isContra && (
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
                  Account Allocation Breakdown (Optional)
                </span>
                <button
                  type="button"
                  onClick={handleAddLine}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '4px',
                    background: 'rgba(59,130,246,0.15)',
                    color: '#60a5fa',
                    border: '1px solid rgba(59,130,246,0.3)',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  + Add Line
                </button>
              </div>

              {lines.map((l, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr 1.5fr auto', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                  <select
                    value={l.account}
                    onChange={(e) => handleLineChange(idx, 'account', e.target.value)}
                    style={{ padding: '6px 8px', borderRadius: '4px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '12px' }}
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.account_code} - {a.account_name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Amount"
                    value={l.amount}
                    onChange={(e) => handleLineChange(idx, 'amount', e.target.value)}
                    style={{ padding: '6px 8px', borderRadius: '4px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '12px' }}
                  />
                  <input
                    type="text"
                    placeholder="Description"
                    value={l.description}
                    onChange={(e) => handleLineChange(idx, 'description', e.target.value)}
                    style={{ padding: '6px 8px', borderRadius: '4px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '12px' }}
                  />
                  <select
                    value={l.cost_center || ''}
                    onChange={(e) => handleLineChange(idx, 'cost_center', e.target.value || null)}
                    style={{ padding: '6px 8px', borderRadius: '4px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '12px' }}
                  >
                    <option value="">Cost Center...</option>
                    {costCenters.map((cc) => (
                      <option key={cc.id} value={cc.id}>
                        {cc.code} - {cc.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => handleRemoveLine(idx)}
                    style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '14px' }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Auto Post Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '14px' }}>
            <input
              type="checkbox"
              id="autoPostCheckbox"
              checked={autoPost}
              onChange={(e) => setAutoPost(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <label htmlFor="autoPostCheckbox" style={{ fontSize: '12px', color: '#cbd5e1', cursor: 'pointer' }}>
              Post & Update Treasury Immediately (Skips Draft state)
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{ padding: '8px 14px', borderRadius: '6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#94a3b8', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{ padding: '8px 18px', borderRadius: '6px', background: '#3b82f6', border: 'none', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
            >
              {loading ? 'Creating Voucher...' : autoPost ? 'Create & Post Voucher' : 'Save as Draft'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
