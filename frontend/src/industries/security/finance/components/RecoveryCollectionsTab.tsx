import React, { useState, useEffect } from 'react';
import type { ClientInvoice, BankAccount, ARSummaryData } from '../api';
import {
  fetchClientInvoices,
  fetchARSummary,
  fetchBankAccounts,
  recordClientInvoicePayment,
  recordRecoveryActivity,
  fetchRecoveryActivities
} from '../api';

export const RecoveryCollectionsTab: React.FC = () => {
  const [invoices, setInvoices] = useState<ClientInvoice[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [summary, setSummary] = useState<ARSummaryData | null>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [agingFilter, setAgingFilter] = useState<string>('ALL');
  const [activeSubView, setActiveSubView] = useState<'RECEIVABLES' | 'ACTIVITY_LOG'>('RECEIVABLES');

  // Record Payment Modal
  const [paymentModalOpen, setPaymentModalOpen] = useState<boolean>(false);
  const [selectedInvoice, setSelectedInvoice] = useState<ClientInvoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('BANK_TRANSFER');
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>('');
  const [refNumber, setRefNumber] = useState<string>('');
  const [chequeNumber, setChequeNumber] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentNotes, setPaymentNotes] = useState<string>('');
  const [recordingPayment, setRecordingPayment] = useState<boolean>(false);

  // Follow-up Activity Modal
  const [activityModalOpen, setActivityModalOpen] = useState<boolean>(false);
  const [activityInvoice, setActivityInvoice] = useState<ClientInvoice | null>(null);
  const [activityType, setActivityType] = useState<string>('CALL');
  const [followUpDate, setFollowUpDate] = useState<string>('');
  const [promiseAmount, setPromiseAmount] = useState<string>('');
  const [activityNotes, setActivityNotes] = useState<string>('');
  const [loggingActivity, setLoggingActivity] = useState<boolean>(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [invs, arSum, banks, acts] = await Promise.all([
        fetchClientInvoices(),
        fetchARSummary().catch(() => null),
        fetchBankAccounts().catch(() => []),
        fetchRecoveryActivities().catch(() => [])
      ]);

      setInvoices(invs);
      setSummary(arSum);
      setBankAccounts(banks.filter((b) => b.is_active));
      if (banks.length > 0 && !selectedBankAccountId) {
        setSelectedBankAccountId(banks[0].id);
      }
      setActivities(acts);
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Failed to load recovery data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Calculate Aging Days
  const getAgingDays = (dueDateStr: string): number => {
    if (!dueDateStr) return 0;
    const due = new Date(dueDateStr).getTime();
    const now = new Date().getTime();
    const diffDays = Math.floor((now - due) / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  // Get Aging Bucket Label
  const getAgingBucket = (dueDateStr: string): { label: string; color: string; bg: string; key: string } => {
    const days = getAgingDays(dueDateStr);
    if (days === 0) {
      return { label: 'Current (On Time)', color: '#16a34a', bg: 'rgba(22, 163, 74, 0.1)', key: 'CURRENT' };
    } else if (days <= 30) {
      return { label: '1 - 30 Days Overdue', color: '#0284c7', bg: 'rgba(2, 132, 199, 0.1)', key: '1_30' };
    } else if (days <= 60) {
      return { label: '31 - 60 Days Overdue', color: '#eab308', bg: 'rgba(234, 179, 8, 0.1)', key: '31_60' };
    } else if (days <= 90) {
      return { label: '61 - 90 Days Overdue', color: '#f97316', bg: 'rgba(249, 115, 22, 0.1)', key: '61_90' };
    } else {
      return { label: '90+ Days Critical', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)', key: '90_PLUS' };
    }
  };

  // Filter Invoices
  const unpaidInvoices = invoices.filter((inv) => {
    const grand = Number(inv.grand_total) || 0;
    const paid = Number(inv.paid_amount) || 0;
    const balance = grand - paid;
    return inv.status !== 'CANCELLED' && inv.status !== 'CREDITED' && balance > 0;
  });

  const filteredInvoices = unpaidInvoices.filter((inv) => {
    const matchesSearch =
      (inv.invoice_number && inv.invoice_number.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (inv.client_name && inv.client_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (inv.contract_code && inv.contract_code.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (agingFilter === 'ALL') return true;
    const bucket = getAgingBucket(inv.due_date);
    return bucket.key === agingFilter;
  });

  // Calculate local aging metrics if API summary wasn't available
  const totalOutstanding = unpaidInvoices.reduce((acc, inv) => {
    return acc + ((Number(inv.grand_total) || 0) - (Number(inv.paid_amount) || 0));
  }, 0);

  const totalCollected = invoices.reduce((acc, inv) => {
    return acc + (Number(inv.paid_amount) || 0);
  }, 0);

  const bucket1_30 = unpaidInvoices
    .filter((inv) => getAgingDays(inv.due_date) > 0 && getAgingDays(inv.due_date) <= 30)
    .reduce((acc, inv) => acc + ((Number(inv.grand_total) || 0) - (Number(inv.paid_amount) || 0)), 0);

  const bucket31_60 = unpaidInvoices
    .filter((inv) => getAgingDays(inv.due_date) > 30 && getAgingDays(inv.due_date) <= 60)
    .reduce((acc, inv) => acc + ((Number(inv.grand_total) || 0) - (Number(inv.paid_amount) || 0)), 0);

  const bucket61_90 = unpaidInvoices
    .filter((inv) => getAgingDays(inv.due_date) > 60 && getAgingDays(inv.due_date) <= 90)
    .reduce((acc, inv) => acc + ((Number(inv.grand_total) || 0) - (Number(inv.paid_amount) || 0)), 0);

  const bucket90Plus = unpaidInvoices
    .filter((inv) => getAgingDays(inv.due_date) > 90)
    .reduce((acc, inv) => acc + ((Number(inv.grand_total) || 0) - (Number(inv.paid_amount) || 0)), 0);

  // Open Payment Modal
  const handleOpenPaymentModal = (inv: ClientInvoice) => {
    const balance = (Number(inv.grand_total) || 0) - (Number(inv.paid_amount) || 0);
    setSelectedInvoice(inv);
    setPaymentAmount(String(balance));
    setPaymentMethod('BANK_TRANSFER');
    setRefNumber('');
    setChequeNumber('');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPaymentNotes('');
    setPaymentModalOpen(true);
  };

  // Submit Payment
  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;
    const amt = parseFloat(paymentAmount);
    if (!amt || amt <= 0) {
      alert('Please enter a valid payment amount.');
      return;
    }

    setRecordingPayment(true);
    try {
      await recordClientInvoicePayment(selectedInvoice.id, {
        amount: amt,
        payment_method: paymentMethod,
        bank_account_id: selectedBankAccountId || undefined,
        reference_number: refNumber || undefined,
        cheque_number: chequeNumber || undefined,
        receipt_date: paymentDate,
        notes: paymentNotes || undefined
      });

      alert(`Payment of Rs ${amt.toLocaleString()} recorded successfully!`);
      setPaymentModalOpen(false);
      await loadData();
    } catch (err: any) {
      alert(err?.response?.data?.error || err.message || 'Failed to record payment receipt.');
    } finally {
      setRecordingPayment(false);
    }
  };

  // Open Activity Modal
  const handleOpenActivityModal = (inv: ClientInvoice) => {
    setActivityInvoice(inv);
    setActivityType('CALL');
    setFollowUpDate('');
    setPromiseAmount('');
    setActivityNotes('');
    setActivityModalOpen(true);
  };

  // Submit Activity
  const handleSubmitActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activityNotes.trim()) {
      alert('Please enter notes regarding this recovery follow-up.');
      return;
    }

    setLoggingActivity(true);
    try {
      await recordRecoveryActivity({
        invoice: activityInvoice?.id,
        client: activityInvoice?.client,
        activity_type: activityType,
        follow_up_date: followUpDate || undefined,
        promise_amount: promiseAmount ? parseFloat(promiseAmount) : undefined,
        notes: activityNotes
      });

      alert('Recovery follow-up activity logged successfully.');
      setActivityModalOpen(false);
      await loadData();
    } catch (err: any) {
      alert(err?.response?.data?.error || err.message || 'Failed to log recovery activity.');
    } finally {
      setLoggingActivity(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
            AR Recovery & Payment Collections
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--color-text-muted)' }}>
            Real-time aging analysis, client recovery tracking, payment receipt vouchers, and promise-to-pay logging.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setActiveSubView('RECEIVABLES')}
            style={{
              padding: '8px 14px',
              borderRadius: '6px',
              border: activeSubView === 'RECEIVABLES' ? '1px solid #0284c7' : '1px solid var(--color-border)',
              background: activeSubView === 'RECEIVABLES' ? '#0284c7' : 'var(--color-surface)',
              color: activeSubView === 'RECEIVABLES' ? '#ffffff' : 'var(--color-text)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <i className="bx bx-list-ul" style={{ marginRight: '6px' }}></i>
            Outstanding Receivables
          </button>
          <button
            onClick={() => setActiveSubView('ACTIVITY_LOG')}
            style={{
              padding: '8px 14px',
              borderRadius: '6px',
              border: activeSubView === 'ACTIVITY_LOG' ? '1px solid #0284c7' : '1px solid var(--color-border)',
              background: activeSubView === 'ACTIVITY_LOG' ? '#0284c7' : 'var(--color-surface)',
              color: activeSubView === 'ACTIVITY_LOG' ? '#ffffff' : 'var(--color-text)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <i className="bx bx-history" style={{ marginRight: '6px' }}></i>
            Follow-up History ({activities.length})
          </button>
          <button
            onClick={loadData}
            style={{
              padding: '8px 14px',
              borderRadius: '6px',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            <i className="bx bx-refresh"></i>
          </button>
        </div>
      </div>

      {/* KPI Cards — Aging Buckets */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '14px'
        }}
      >
        {/* Total Outstanding */}
        <div
          style={{
            background: 'var(--color-surface, #ffffff)',
            padding: '16px',
            borderRadius: '12px',
            border: '1px solid var(--color-border, #e2e8f0)',
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)', fontWeight: 600 }}>
              Total Outstanding AR
            </span>
            <i className="bx bx-wallet" style={{ fontSize: '20px', color: '#0284c7' }}></i>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 800, marginTop: '8px', color: 'var(--color-text)' }}>
            Rs {(summary?.total_outstanding || totalOutstanding).toLocaleString()}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            Across {unpaidInvoices.length} unpaid invoices
          </div>
        </div>

        {/* 1 - 30 Days */}
        <div
          style={{
            background: 'var(--color-surface, #ffffff)',
            padding: '16px',
            borderRadius: '12px',
            border: '1px solid var(--color-border, #e2e8f0)',
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#0284c7', fontWeight: 600 }}>
              1 - 30 Days
            </span>
            <i className="bx bx-time-five" style={{ fontSize: '20px', color: '#0284c7' }}></i>
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, marginTop: '8px', color: '#0284c7' }}>
            Rs {(summary?.aging?.days_1_30 || bucket1_30).toLocaleString()}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            Recent dues
          </div>
        </div>

        {/* 31 - 60 Days */}
        <div
          style={{
            background: 'var(--color-surface, #ffffff)',
            padding: '16px',
            borderRadius: '12px',
            border: '1px solid var(--color-border, #e2e8f0)',
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#eab308', fontWeight: 600 }}>
              31 - 60 Days
            </span>
            <i className="bx bx-alarm-exclamation" style={{ fontSize: '20px', color: '#eab308' }}></i>
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, marginTop: '8px', color: '#ca8a04' }}>
            Rs {(summary?.aging?.days_31_60 || bucket31_60).toLocaleString()}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            Follow-up required
          </div>
        </div>

        {/* 61 - 90 Days */}
        <div
          style={{
            background: 'var(--color-surface, #ffffff)',
            padding: '16px',
            borderRadius: '12px',
            border: '1px solid var(--color-border, #e2e8f0)',
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#f97316', fontWeight: 600 }}>
              61 - 90 Days
            </span>
            <i className="bx bx-error" style={{ fontSize: '20px', color: '#f97316' }}></i>
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, marginTop: '8px', color: '#ea580c' }}>
            Rs {(summary?.aging?.days_61_90 || bucket61_90).toLocaleString()}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            Escalate to accounts
          </div>
        </div>

        {/* 90+ Days Critical */}
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.04)',
            padding: '16px',
            borderRadius: '12px',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#dc2626', fontWeight: 700 }}>
              90+ Days Overdue
            </span>
            <i className="bx bx-shield-x" style={{ fontSize: '20px', color: '#dc2626' }}></i>
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '8px', color: '#dc2626' }}>
            Rs {(summary?.aging?.days_90_plus || bucket90Plus).toLocaleString()}
          </div>
          <div style={{ fontSize: '11.5px', color: '#dc2626', marginTop: '4px', fontWeight: 600 }}>
            Critical attention needed
          </div>
        </div>

        {/* Total Collected */}
        <div
          style={{
            background: 'rgba(34, 197, 94, 0.04)',
            padding: '16px',
            borderRadius: '12px',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#16a34a', fontWeight: 600 }}>
              Total Recovered
            </span>
            <i className="bx bx-check-shield" style={{ fontSize: '20px', color: '#16a34a' }}></i>
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '8px', color: '#16a34a' }}>
            Rs {(summary?.total_paid || totalCollected).toLocaleString()}
          </div>
          <div style={{ fontSize: '11.5px', color: '#16a34a', marginTop: '4px' }}>
            Recoveries credited
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {activeSubView === 'RECEIVABLES' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Filters Bar */}
          <div
            style={{
              display: 'flex',
              gap: '12px',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--color-surface, #ffffff)',
              padding: '12px 16px',
              borderRadius: '10px',
              border: '1px solid var(--color-border, #e2e8f0)'
            }}
          >
            {/* Search */}
            <div style={{ position: 'relative', minWidth: '280px', flex: 1 }}>
              <i
                className="bx bx-search"
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '18px',
                  color: 'var(--color-text-muted)'
                }}
              ></i>
              <input
                type="text"
                placeholder="Search by client, invoice #, or contract..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px 8px 36px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border, #cbd5e1)',
                  fontSize: '13px',
                  background: 'var(--color-surface-secondary, #f8fafc)',
                  color: 'inherit'
                }}
              />
            </div>

            {/* Aging Filter */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {[
                { key: 'ALL', label: 'All Unpaid' },
                { key: 'CURRENT', label: 'Current' },
                { key: '1_30', label: '1 - 30d' },
                { key: '31_60', label: '31 - 60d' },
                { key: '61_90', label: '61 - 90d' },
                { key: '90_PLUS', label: '90+ Days' }
              ].map((b) => (
                <button
                  key={b.key}
                  onClick={() => setAgingFilter(b.key)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: agingFilter === b.key ? '1px solid #0284c7' : '1px solid var(--color-border)',
                    background: agingFilter === b.key ? 'rgba(2, 132, 199, 0.12)' : 'transparent',
                    color: agingFilter === b.key ? '#0284c7' : 'var(--color-text)',
                    fontSize: '12px',
                    fontWeight: agingFilter === b.key ? 600 : 500,
                    cursor: 'pointer'
                  }}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
              <i className="bx bx-loader-alt bx-spin" style={{ fontSize: '28px', color: '#0284c7' }}></i>
              <p style={{ marginTop: '8px' }}>Loading accounts receivable ledger...</p>
            </div>
          ) : error ? (
            <div style={{ padding: '20px', background: '#fef2f2', color: '#b91c1c', borderRadius: '8px' }}>
              {error}
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div
              style={{
                padding: '40px',
                textAlign: 'center',
                background: 'var(--color-surface)',
                borderRadius: '12px',
                border: '1px dashed var(--color-border)',
                color: 'var(--color-text-muted)'
              }}
            >
              <i className="bx bx-check-circle" style={{ fontSize: '36px', color: '#16a34a', marginBottom: '8px' }}></i>
              <h4 style={{ margin: 0, fontSize: '16px' }}>No Outstanding Invoices in this view!</h4>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px' }}>
                All clients in this category have cleared their balances or no records match your filter.
              </p>
            </div>
          ) : (
            <div
              style={{
                background: 'var(--color-surface, #ffffff)',
                border: '1px solid var(--color-border, #e2e8f0)',
                borderRadius: '12px',
                overflow: 'hidden',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: 'var(--color-surface-secondary, #f8fafc)', borderBottom: '1px solid var(--color-border, #e2e8f0)' }}>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>Client & Invoice</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600 }}>Billing Month</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600 }}>Due Date</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600 }}>Aging Bucket</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>Invoiced Total</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>Collected</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>Balance Due</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>Recovery Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.map((inv) => {
                    const grand = Number(inv.grand_total) || 0;
                    const paid = Number(inv.paid_amount) || 0;
                    const balance = grand - paid;
                    const bucket = getAgingBucket(inv.due_date);
                    const days = getAgingDays(inv.due_date);

                    return (
                      <tr key={inv.id} style={{ borderBottom: '1px solid var(--color-border, #e2e8f0)' }}>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>
                            {inv.client_name || 'Client'}
                          </div>
                          <div style={{ fontSize: '11.5px', color: '#0284c7', display: 'flex', gap: '8px', marginTop: '2px' }}>
                            <span><strong>#{inv.invoice_number}</strong></span>
                            {inv.contract_code && <span>• {inv.contract_code}</span>}
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 500 }}>
                          {inv.billing_month || 'N/A'}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12.5px' }}>
                          <div>{inv.due_date || 'N/A'}</div>
                          {days > 0 && (
                            <div style={{ fontSize: '11px', color: '#ef4444', fontWeight: 600 }}>
                              {days} days overdue
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <span
                            style={{
                              padding: '3px 8px',
                              borderRadius: '6px',
                              background: bucket.bg,
                              color: bucket.color,
                              fontWeight: 600,
                              fontSize: '11px',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {bucket.label}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 500 }}>
                          Rs {grand.toLocaleString()}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', color: '#16a34a', fontWeight: 500 }}>
                          Rs {paid.toLocaleString()}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#ef4444', fontSize: '14px' }}>
                          Rs {balance.toLocaleString()}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '6px' }}>
                            <button
                              onClick={() => handleOpenPaymentModal(inv)}
                              title="Record client payment receipt"
                              style={{
                                padding: '6px 10px',
                                borderRadius: '6px',
                                border: 'none',
                                background: '#16a34a',
                                color: '#ffffff',
                                fontSize: '11.5px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <i className="bx bx-check-circle"></i>
                              <span>Record Payment</span>
                            </button>
                            <button
                              onClick={() => handleOpenActivityModal(inv)}
                              title="Log phone call, email, or client promise to pay"
                              style={{
                                padding: '6px 9px',
                                borderRadius: '6px',
                                border: '1px solid var(--color-border)',
                                background: 'var(--color-surface)',
                                color: 'var(--color-text)',
                                fontSize: '11.5px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <i className="bx bx-phone-call"></i>
                              <span>Follow-up</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* Activity Log Subview */
        <div
          style={{
            background: 'var(--color-surface, #ffffff)',
            border: '1px solid var(--color-border, #e2e8f0)',
            borderRadius: '12px',
            padding: '20px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
          }}
        >
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600 }}>
            Recovery Follow-up & Promise-to-Pay Log
          </h3>

          {activities.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
              No follow-up activities recorded yet. Click "Follow-up" on any invoice to log calls or commitments.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {activities.map((act) => (
                <div
                  key={act.id}
                  style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border, #e2e8f0)',
                    background: 'var(--color-surface-secondary, #f8fafc)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '12px'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: 'rgba(2, 132, 199, 0.12)',
                          color: '#0284c7',
                          fontWeight: 700,
                          fontSize: '11px'
                        }}
                      >
                        {act.activity_type}
                      </span>
                      <strong style={{ fontSize: '13px' }}>{act.client_name || 'Client'}</strong>
                      {act.invoice_number && (
                        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                          • Invoice #{act.invoice_number}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '12.5px', marginTop: '4px', color: 'var(--color-text)' }}>
                      {act.notes}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    {act.promise_amount && (
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#16a34a' }}>
                        Promised: Rs {Number(act.promise_amount).toLocaleString()}
                      </div>
                    )}
                    {act.follow_up_date && (
                      <div style={{ fontSize: '11.5px', color: '#eab308', fontWeight: 600 }}>
                        Next Follow-up: {act.follow_up_date}
                      </div>
                    )}
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                      {act.created_at ? new Date(act.created_at).toLocaleDateString() : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Record Payment Receipt Modal */}
      {paymentModalOpen && selectedInvoice && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '20px'
          }}
        >
          <div
            style={{
              background: 'var(--color-surface, #ffffff)',
              color: 'var(--color-text)',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '520px',
              padding: '24px',
              border: '1px solid var(--color-border)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="bx bx-check-shield" style={{ fontSize: '24px', color: '#16a34a' }}></i>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700 }}>Record Payment Receipt</h3>
              </div>
              <button
                onClick={() => setPaymentModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}
              >
                <i className="bx bx-x"></i>
              </button>
            </div>

            <div style={{ padding: '12px', background: 'var(--color-surface-secondary, #f8fafc)', borderRadius: '8px', marginBottom: '16px', fontSize: '12.5px' }}>
              <div>Client: <strong>{selectedInvoice.client_name}</strong></div>
              <div>Invoice: <strong>#{selectedInvoice.invoice_number}</strong> ({selectedInvoice.billing_month})</div>
              <div>Total: <strong>Rs {Number(selectedInvoice.grand_total).toLocaleString()}</strong> | Already Paid: <strong>Rs {Number(selectedInvoice.paid_amount).toLocaleString()}</strong></div>
            </div>

            <form onSubmit={handleSubmitPayment} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Amount Received (PKR) <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border, #cbd5e1)',
                    fontSize: '13px'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Payment Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--color-border, #cbd5e1)',
                      fontSize: '13px'
                    }}
                  >
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="CASH">Cash</option>
                    <option value="ONLINE_TRANSFER">Online / Raast</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Payment Date
                  </label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--color-border, #cbd5e1)',
                      fontSize: '13px'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Deposit Into Treasury Bank Account
                </label>
                <select
                  value={selectedBankAccountId}
                  onChange={(e) => setSelectedBankAccountId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border, #cbd5e1)',
                    fontSize: '13px'
                  }}
                >
                  {bankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.bank_name} - {b.account_title} ({b.account_number})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Reference / Transaction #
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. TXN-9841"
                    value={refNumber}
                    onChange={(e) => setRefNumber(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--color-border, #cbd5e1)',
                      fontSize: '13px'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Cheque # (If applicable)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. CHQ-0412"
                    value={chequeNumber}
                    onChange={(e) => setChequeNumber(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--color-border, #cbd5e1)',
                      fontSize: '13px'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Notes / Narration
                </label>
                <textarea
                  rows={2}
                  placeholder="Recovery receipt remarks..."
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border, #cbd5e1)',
                    fontSize: '13px',
                    resize: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setPaymentModalOpen(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface)',
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={recordingPayment}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#16a34a',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: recordingPayment ? 'not-allowed' : 'pointer'
                  }}
                >
                  {recordingPayment ? 'Processing...' : 'Confirm & Commit Receipt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Follow-up Activity Modal */}
      {activityModalOpen && activityInvoice && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '20px'
          }}
        >
          <div
            style={{
              background: 'var(--color-surface, #ffffff)',
              color: 'var(--color-text)',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '480px',
              padding: '24px',
              border: '1px solid var(--color-border)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="bx bx-phone-call" style={{ fontSize: '24px', color: '#0284c7' }}></i>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700 }}>Log Recovery Follow-up</h3>
              </div>
              <button
                onClick={() => setActivityModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}
              >
                <i className="bx bx-x"></i>
              </button>
            </div>

            <form onSubmit={handleSubmitActivity} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Activity Type
                  </label>
                  <select
                    value={activityType}
                    onChange={(e) => setActivityType(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--color-border, #cbd5e1)',
                      fontSize: '13px'
                    }}
                  >
                    <option value="CALL">Phone Call</option>
                    <option value="EMAIL">Email Sent</option>
                    <option value="VISIT">Client Site Visit</option>
                    <option value="PROMISE_TO_PAY">Promise to Pay</option>
                    <option value="DISPUTE">Billing Dispute</option>
                    <option value="LEGAL_NOTICE">Legal Notice</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Next Follow-up Date
                  </label>
                  <input
                    type="date"
                    value={followUpDate}
                    onChange={(e) => setFollowUpDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--color-border, #cbd5e1)',
                      fontSize: '13px'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Promised Amount (PKR) (Optional)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 50000"
                  value={promiseAmount}
                  onChange={(e) => setPromiseAmount(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border, #cbd5e1)',
                    fontSize: '13px'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Conversation Notes & Commitment Details <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="Details of call with finance manager, agreed payment date..."
                  value={activityNotes}
                  onChange={(e) => setActivityNotes(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border, #cbd5e1)',
                    fontSize: '13px',
                    resize: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setActivityModalOpen(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface)',
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loggingActivity}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#0284c7',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: loggingActivity ? 'not-allowed' : 'pointer'
                  }}
                >
                  {loggingActivity ? 'Saving...' : 'Save Follow-up'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

