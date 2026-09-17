import React, { useState, useEffect } from 'react';
import type { FinancialVoucher, BankAccount } from '../api';
import {
  fetchFinancialVouchers,
  fetchBankAccounts
} from '../api';
import { NewVoucherModal } from './NewVoucherModal';
import { VoucherWorkspaceModal } from './VoucherWorkspaceModal';

export const VouchersTab: React.FC = () => {
  const [vouchers, setVouchers] = useState<FinancialVoucher[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [startDate] = useState<string>('');
  const [endDate] = useState<string>('');

  // Modals
  const [showNewModal, setShowNewModal] = useState<boolean>(false);
  const [selectedVoucher, setSelectedVoucher] = useState<FinancialVoucher | null>(null);

  const loadVouchers = async () => {
    try {
      setLoading(true);
      setError(null);
      const [vRes, bRes] = await Promise.all([
        fetchFinancialVouchers({
          search: searchQuery || undefined,
          voucher_type: selectedType || undefined,
          status: selectedStatus || undefined,
          bank_account: selectedAccount || undefined,
          start_date: startDate || undefined,
          end_date: endDate || undefined,
        }),
        fetchBankAccounts()
      ]);
      setVouchers(vRes);
      setBankAccounts(bRes);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to load vouchers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVouchers();
  }, [selectedType, selectedStatus, selectedAccount, startDate, endDate]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadVouchers();
  };

  // Metrics
  const totalAmount = vouchers.reduce((acc, v) => acc + (Number(v.total_amount || v.amount) || 0), 0);
  const postedCount = vouchers.filter((v) => v.status === 'POSTED').length;
  const draftCount = vouchers.filter((v) => v.status === 'DRAFT').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header & Quick Action Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#f8fafc' }}>
            Financial Vouchers Register
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
            Receipt, Payment, Contra, and Journal vouchers governing treasury cash movements.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setShowNewModal(true)}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              color: '#fff',
              border: 'none',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 4px rgba(37,99,235,0.2)'
            }}
          >
            <span>➕</span> Create Voucher
          </button>
        </div>
      </div>

      {/* Metric Highlights */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
        <div style={{ background: '#1e293b', padding: '14px 18px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8' }}>Total Registered Vouchers</div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#f8fafc', marginTop: '4px' }}>{vouchers.length}</div>
        </div>
        <div style={{ background: '#1e293b', padding: '14px 18px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8' }}>Total Vouchers Value</div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#38bdf8', marginTop: '4px' }}>
            PKR {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div style={{ background: '#1e293b', padding: '14px 18px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8' }}>Posted & Settled</div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#4ade80', marginTop: '4px' }}>{postedCount}</div>
        </div>
        <div style={{ background: '#1e293b', padding: '14px 18px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8' }}>Draft / In Progress</div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#fbbf24', marginTop: '4px' }}>{draftCount}</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          <input
            type="text"
            placeholder="Search by Voucher #, Payee, Ref..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ flex: 1, minWidth: '220px', padding: '8px 12px', borderRadius: '6px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
          />

          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '6px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
          >
            <option value="">All Voucher Types</option>
            <option value="RECEIPT_VOUCHER">Receipt Voucher</option>
            <option value="BANK_RECEIPT">Bank Receipt</option>
            <option value="CASH_RECEIPT">Cash Receipt</option>
            <option value="PAYMENT_VOUCHER">Payment Voucher</option>
            <option value="BANK_PAYMENT">Bank Payment</option>
            <option value="CASH_PAYMENT">Cash Payment</option>
            <option value="CONTRA_VOUCHER">Contra Transfer</option>
            <option value="PETTY_CASH_VOUCHER">Petty Cash</option>
            <option value="JOURNAL_VOUCHER">Journal Voucher</option>
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '6px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
          >
            <option value="">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="PENDING_APPROVAL">Pending Approval</option>
            <option value="APPROVED">Approved</option>
            <option value="POSTED">Posted</option>
            <option value="REVERSED">Reversed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>

          <select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '6px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
          >
            <option value="">All Treasury Accounts</option>
            {bankAccounts.map((b) => (
              <option key={b.id} value={b.id}>
                {b.account_title}
              </option>
            ))}
          </select>

          <button
            type="submit"
            style={{ padding: '8px 16px', borderRadius: '6px', background: '#3b82f6', color: '#fff', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
          >
            Search
          </button>
        </form>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', borderRadius: '6px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {/* Vouchers Table */}
      <div style={{ background: '#1e293b', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8', fontSize: '12px', background: 'rgba(15,23,42,0.4)' }}>
                <th style={{ padding: '12px 14px' }}>Voucher #</th>
                <th style={{ padding: '12px 14px' }}>Type</th>
                <th style={{ padding: '12px 14px' }}>Date</th>
                <th style={{ padding: '12px 14px' }}>Payee / Counterparty</th>
                <th style={{ padding: '12px 14px' }}>Account</th>
                <th style={{ padding: '12px 14px' }}>Payment Method</th>
                <th style={{ padding: '12px 14px', textAlign: 'right' }}>Amount (PKR)</th>
                <th style={{ padding: '12px 14px', textAlign: 'center' }}>Status</th>
                <th style={{ padding: '12px 14px', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
                    Loading financial vouchers...
                  </td>
                </tr>
              ) : vouchers.length > 0 ? (
                vouchers.map((v) => {
                  const isPosted = v.status === 'POSTED';
                  const isReversed = v.status === 'REVERSED';
                  const isCancelled = v.status === 'CANCELLED';

                  return (
                    <tr
                      key={v.id}
                      onClick={() => setSelectedVoucher(v)}
                      style={{
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        cursor: 'pointer',
                        transition: 'background 0.1s ease'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '12px 14px', color: '#60a5fa', fontWeight: 600 }}>{v.voucher_number}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontWeight: 500,
                            background: v.voucher_type.includes('RECEIPT')
                              ? 'rgba(34,197,94,0.15)'
                              : v.voucher_type.includes('PAYMENT')
                              ? 'rgba(239,68,68,0.15)'
                              : 'rgba(59,130,246,0.15)',
                            color: v.voucher_type.includes('RECEIPT')
                              ? '#4ade80'
                              : v.voucher_type.includes('PAYMENT')
                              ? '#f87171'
                              : '#60a5fa'
                          }}
                        >
                          {v.voucher_type_display || v.voucher_type}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', color: '#cbd5e1', whiteSpace: 'nowrap' }}>{v.date}</td>
                      <td style={{ padding: '12px 14px', color: '#f8fafc', fontWeight: 500 }}>
                        {v.counterparty_name || v.payee_name || '—'}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#94a3b8' }}>
                        {v.bank_account_title || '—'}
                        {v.destination_bank_account_title ? ` ➔ ${v.destination_bank_account_title}` : ''}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#cbd5e1' }}>{v.payment_method}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', color: '#38bdf8', fontWeight: 700 }}>
                        {Number(v.total_amount || v.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontWeight: 600,
                            background: isPosted
                              ? 'rgba(34,197,94,0.15)'
                              : isReversed
                              ? 'rgba(239,68,68,0.15)'
                              : isCancelled
                              ? 'rgba(100,116,139,0.2)'
                              : 'rgba(59,130,246,0.15)',
                            color: isPosted
                              ? '#4ade80'
                              : isReversed
                              ? '#f87171'
                              : isCancelled
                              ? '#94a3b8'
                              : '#60a5fa'
                          }}
                        >
                          {v.status_display || v.status}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedVoucher(v);
                          }}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '4px',
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: '#e2e8f0',
                            fontSize: '11px',
                            cursor: 'pointer'
                          }}
                        >
                          View ➔
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>
                    No financial vouchers match the selected criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Creation Modal */}
      <NewVoucherModal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        onSuccess={loadVouchers}
      />

      {/* Workspace / Details Modal */}
      <VoucherWorkspaceModal
        voucher={selectedVoucher}
        isOpen={!!selectedVoucher}
        onClose={() => setSelectedVoucher(null)}
        onRefresh={loadVouchers}
      />
    </div>
  );
};
