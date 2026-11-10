import React, { useState, useEffect } from 'react';
import type { BankAccount } from '../api';
import {
  fetchVendorBills,
  fetchPurchaseOrders,
  fetchVendorPayments,
  createVendorPayment,
  fetchVendors,
  fetchBankAccounts
} from '../api';

export const VendorPaymentsTab: React.FC = () => {
  const [bills, setBills] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Sub-tabs
  const [activeSubTab, setActiveSubTab] = useState<'PENDING_BILLS' | 'PAYMENTS_HISTORY'>('PENDING_BILLS');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedVendorFilter, setSelectedVendorFilter] = useState<string>('ALL');
  const [docTypeFilter, setDocTypeFilter] = useState<'ALL' | 'VENDOR_INVOICE' | 'PURCHASE_ORDER'>('ALL');

  // Payment Modal
  const [payModalOpen, setPayModalOpen] = useState<boolean>(false);
  const [selectedBill, setSelectedBill] = useState<any | null>(null);
  const [payAmount, setPayAmount] = useState<string>('');
  const [payMethod, setPayMethod] = useState<string>('BANK_TRANSFER');
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>('');
  const [refNumber, setRefNumber] = useState<string>('');
  const [chequeNumber, setChequeNumber] = useState<string>('');
  const [chequeDate, setChequeDate] = useState<string>('');
  const [payDate, setPayDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [payNotes, setPayNotes] = useState<string>('');
  const [submittingPayment, setSubmittingPayment] = useState<boolean>(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [billsData, posData, paymentsData, vendorsData, banksData] = await Promise.all([
        fetchVendorBills(),
        fetchPurchaseOrders(),
        fetchVendorPayments(),
        fetchVendors(),
        fetchBankAccounts()
      ]);

      const invList = Array.isArray(billsData) ? billsData : ((billsData as any)?.results || []);
      const poList = (Array.isArray(posData) ? posData : ((posData as any)?.results || [])).filter(
        (po: any) => ['APPROVED', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED'].includes(po.status)
      );

      setBills([...invList, ...poList]);
      setPayments(Array.isArray(paymentsData) ? paymentsData : ((paymentsData as any)?.results || []));
      setVendors(Array.isArray(vendorsData) ? vendorsData : ((vendorsData as any)?.results || []));

      const bankList = Array.isArray(banksData) ? banksData : ((banksData as any)?.results || []);
      const activeBanks = bankList.filter((b: BankAccount) => b.is_active);
      setBankAccounts(activeBanks.length > 0 ? activeBanks : bankList);
      if ((activeBanks.length > 0 ? activeBanks : bankList).length > 0 && !selectedBankAccountId) {
        setSelectedBankAccountId((activeBanks.length > 0 ? activeBanks : bankList)[0].id);
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err.message || 'Failed to load purchasing & vendor payments data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter payable bills & purchase orders
  const pendingBills = bills.filter((b) => {
    const total = Number(b.total_amount || b.amount || 0);
    const paid = Number(b.paid_amount || 0);
    const balance = b.outstanding_amount !== undefined ? Number(b.outstanding_amount) : (total - paid);
    if (b.document_type === 'VENDOR_INVOICE' && b.status !== 'POSTED') return false;
    return !['CANCELLED', 'REJECTED', 'DRAFT'].includes(b.status) && balance > 0;
  });

  const filteredBills = pendingBills.filter((b) => {
    const vendorName = b.vendor_name || b.vendor?.name || '';
    const docNum = b.number || b.reference_number || '';
    const matchesSearch =
      vendorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      docNum.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesVendor = selectedVendorFilter === 'ALL' || String(b.vendor?.id || b.vendor) === selectedVendorFilter;
    const matchesDocType = docTypeFilter === 'ALL' || b.document_type === docTypeFilter;
    return matchesSearch && matchesVendor && matchesDocType;
  });

  // Filter Payments
  const filteredPayments = payments.filter((p) => {
    const vendorName = p.vendor_name || p.vendor?.name || '';
    const pNum = p.payment_number || p.reference_number || '';
    return (
      vendorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pNum.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  // Executive AP Metrics
  const totalPayable = pendingBills.reduce((acc, b) => {
    const total = Number(b.total_amount || b.amount || 0);
    const paid = Number(b.paid_amount || 0);
    return acc + (total - paid);
  }, 0);

  const totalPaidThisMonth = payments.reduce((acc, p) => {
    return acc + (Number(p.amount) || 0);
  }, 0);

  const overdueBills = pendingBills.filter((b) => {
    if (!b.due_date) return false;
    return new Date(b.due_date).getTime() < new Date().getTime();
  });

  const totalOverdue = overdueBills.reduce((acc, b) => {
    const total = Number(b.total_amount || b.amount || 0);
    const paid = Number(b.paid_amount || 0);
    return acc + (total - paid);
  }, 0);

  // Open Pay Modal
  const handleOpenPayModal = (bill: any) => {
    const total = Number(bill.total_amount || bill.amount || 0);
    const paid = Number(bill.paid_amount || 0);
    const balance = total - paid;

    setSelectedBill(bill);
    setPayAmount(String(balance > 0 ? balance : total));
    setPayMethod('BANK_TRANSFER');
    setRefNumber('');
    setChequeNumber('');
    setChequeDate('');
    setPayDate(new Date().toISOString().split('T')[0]);
    const docLabel = bill.document_type === 'PURCHASE_ORDER' ? 'Purchase Order' : 'Vendor Bill';
    setPayNotes(`Payment for ${docLabel} ${bill.number || bill.reference_number || ''}`);
    setPayModalOpen(true);
  };

  // Submit Payment
  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBill) return;

    const amt = parseFloat(payAmount);
    if (!amt || amt <= 0) {
      alert('Please enter a valid disbursement amount.');
      return;
    }

    const vendorId = selectedBill.vendor?.id || selectedBill.vendor;
    if (!vendorId) {
      alert('Missing vendor information on this bill/PO.');
      return;
    }

    const chosenBank = bankAccounts.find((b) => b.id === selectedBankAccountId);

    setSubmittingPayment(true);
    try {
      await createVendorPayment({
        vendor: String(vendorId),
        payment_date: payDate,
        amount: amt,
        payment_method: payMethod,
        bank_account_id: selectedBankAccountId || undefined,
        bank_cash_account: chosenBank ? `${chosenBank.bank_name || ''} - ${chosenBank.account_title}` : undefined,
        reference_number: refNumber || undefined,
        cheque_number: chequeNumber || undefined,
        cheque_date: chequeDate || undefined,
        notes: payNotes || undefined,
        allocations: [{ invoice_id: selectedBill.id, amount: amt }],
        auto_post: true
      });

      alert(`Vendor payment of Rs ${amt.toLocaleString()} processed successfully!`);
      setPayModalOpen(false);
      await loadData();
    } catch (err: any) {
      alert(err?.response?.data?.detail || err?.response?.data?.error || err.message || 'Failed to process vendor payment.');
    } finally {
      setSubmittingPayment(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
              Store & Vendor Purchasing Payments
            </h2>
            <span
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '6px',
                background: 'rgba(2, 132, 199, 0.12)',
                color: '#0284c7',
                fontWeight: 600
              }}
            >
              Finance Centralized AP
            </span>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--color-text-muted)' }}>
            All purchase orders, vendor invoices, security equipment bills, and uniform disbursements settled exclusively in Finance.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setActiveSubTab('PENDING_BILLS')}
            style={{
              padding: '8px 14px',
              borderRadius: '6px',
              border: activeSubTab === 'PENDING_BILLS' ? '1px solid #0284c7' : '1px solid var(--color-border)',
              background: activeSubTab === 'PENDING_BILLS' ? '#0284c7' : 'var(--color-surface)',
              color: activeSubTab === 'PENDING_BILLS' ? '#ffffff' : 'var(--color-text)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <i className="bx bx-receipt" style={{ marginRight: '6px' }}></i>
            Pending Bills & POs ({pendingBills.length})
          </button>
          <button
            onClick={() => setActiveSubTab('PAYMENTS_HISTORY')}
            style={{
              padding: '8px 14px',
              borderRadius: '6px',
              border: activeSubTab === 'PAYMENTS_HISTORY' ? '1px solid #0284c7' : '1px solid var(--color-border)',
              background: activeSubTab === 'PAYMENTS_HISTORY' ? '#0284c7' : 'var(--color-surface)',
              color: activeSubTab === 'PAYMENTS_HISTORY' ? '#ffffff' : 'var(--color-text)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <i className="bx bx-history" style={{ marginRight: '6px' }}></i>
            Payment Disbursements ({payments.length})
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

      {/* AP Executive Summary KPIs */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '14px'
        }}
      >
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
              Total Accounts Payable
            </span>
            <i className="bx bx-store-alt" style={{ fontSize: '20px', color: '#0284c7' }}></i>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 800, marginTop: '8px', color: '#0284c7' }}>
            Rs {totalPayable.toLocaleString()}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            Across {pendingBills.length} pending vendor bills
          </div>
        </div>

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
              Overdue Payables
            </span>
            <i className="bx bx-alarm-exclamation" style={{ fontSize: '20px', color: '#dc2626' }}></i>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 800, marginTop: '8px', color: '#dc2626' }}>
            Rs {totalOverdue.toLocaleString()}
          </div>
          <div style={{ fontSize: '11.5px', color: '#dc2626', marginTop: '4px', fontWeight: 600 }}>
            {overdueBills.length} bills past payment due date
          </div>
        </div>

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
              Total Disbursed to Vendors
            </span>
            <i className="bx bx-check-shield" style={{ fontSize: '20px', color: '#16a34a' }}></i>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 800, marginTop: '8px', color: '#16a34a' }}>
            Rs {totalPaidThisMonth.toLocaleString()}
          </div>
          <div style={{ fontSize: '11.5px', color: '#16a34a', marginTop: '4px' }}>
            Total payments confirmed & posted
          </div>
        </div>

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
              Registered Vendors
            </span>
            <i className="bx bx-group" style={{ fontSize: '20px', color: '#8b5cf6' }}></i>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 800, marginTop: '8px', color: '#8b5cf6' }}>
            {vendors.length}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            Store, equipment & service suppliers
          </div>
        </div>
      </div>

      {/* Main View Area */}
      {activeSubTab === 'PENDING_BILLS' ? (
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
                placeholder="Search by vendor name, bill #, or PO reference..."
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

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <select
                value={docTypeFilter}
                onChange={(e) => setDocTypeFilter(e.target.value as 'ALL' | 'VENDOR_INVOICE' | 'PURCHASE_ORDER')}
                style={{
                  padding: '7px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border, #cbd5e1)',
                  fontSize: '13px',
                  background: 'var(--color-surface, #ffffff)',
                  color: 'inherit'
                }}
              >
                <option value="ALL">All Bills & POs</option>
                <option value="VENDOR_INVOICE">Vendor Invoices Only</option>
                <option value="PURCHASE_ORDER">Purchase Orders Only</option>
              </select>

              <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Vendor:</span>
              <select
                value={selectedVendorFilter}
                onChange={(e) => setSelectedVendorFilter(e.target.value)}
                style={{
                  padding: '7px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border, #cbd5e1)',
                  fontSize: '13px',
                  background: 'var(--color-surface, #ffffff)',
                  color: 'inherit'
                }}
              >
                <option value="ALL">All Vendors</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name || v.vendor_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
              <i className="bx bx-loader-alt bx-spin" style={{ fontSize: '28px', color: '#0284c7' }}></i>
              <p style={{ marginTop: '8px' }}>Loading vendor bills & purchase orders...</p>
            </div>
          ) : error ? (
            <div style={{ padding: '20px', background: '#fef2f2', color: '#b91c1c', borderRadius: '8px' }}>
              {error}
            </div>
          ) : filteredBills.length === 0 ? (
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
              <h4 style={{ margin: 0, fontSize: '16px' }}>No Pending Vendor Bills!</h4>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px' }}>
                All store and equipment purchasing bills have been paid in full.
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
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>Vendor & Supplier</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>Bill / Document #</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600 }}>Bill Date</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600 }}>Due Date</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>Bill Amount</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>Paid</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>Balance Due</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBills.map((bill) => {
                    const total = Number(bill.total_amount || bill.amount || 0);
                    const paid = Number(bill.paid_amount || 0);
                    const balance = total - paid;
                    const isOverdue = bill.due_date && new Date(bill.due_date).getTime() < new Date().getTime();

                    return (
                      <tr key={bill.id} style={{ borderBottom: '1px solid var(--color-border, #e2e8f0)' }}>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>
                            {bill.vendor_name || bill.vendor?.name || 'Vendor'}
                          </div>
                          {bill.warehouse && (
                            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                              Store: {bill.warehouse?.name || 'Main Warehouse'}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontWeight: 600, color: '#0284c7' }}>
                              {bill.number || bill.reference_number || 'DOC'}
                            </span>
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 700,
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: bill.document_type === 'PURCHASE_ORDER' ? 'rgba(124, 58, 237, 0.12)' : 'rgba(2, 132, 199, 0.12)',
                                color: bill.document_type === 'PURCHASE_ORDER' ? '#7c3aed' : '#0284c7'
                              }}
                            >
                              {bill.document_type === 'PURCHASE_ORDER' ? 'PO' : 'INVOICE'}
                            </span>
                          </div>
                          {bill.parent_document && (
                            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                              PO: {bill.parent_document.number || bill.parent_document}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          {bill.document_date || bill.issue_date || bill.created_at
                            ? new Date(bill.document_date || bill.issue_date || bill.created_at).toLocaleDateString()
                            : 'N/A'}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <div style={{ color: isOverdue ? '#ef4444' : 'inherit', fontWeight: isOverdue ? 600 : 400 }}>
                            {bill.due_date || 'N/A'}
                          </div>
                          {isOverdue && (
                            <div style={{ fontSize: '10.5px', color: '#ef4444', fontWeight: 600 }}>
                              OVERDUE
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 500 }}>
                          Rs {total.toLocaleString()}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', color: '#16a34a' }}>
                          Rs {paid.toLocaleString()}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#ef4444', fontSize: '14px' }}>
                          Rs {balance.toLocaleString()}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <button
                            onClick={() => handleOpenPayModal(bill)}
                            style={{
                              padding: '6px 14px',
                              borderRadius: '6px',
                              border: 'none',
                              background: '#0284c7',
                              color: '#ffffff',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              boxShadow: '0 2px 5px rgba(2, 132, 199, 0.35)'
                            }}
                          >
                            <i className="bx bx-credit-card"></i>
                            <span>Disburse Payment</span>
                          </button>
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
        /* Payments History SubTab */
        <div
          style={{
            background: 'var(--color-surface, #ffffff)',
            border: '1px solid var(--color-border, #e2e8f0)',
            borderRadius: '12px',
            overflow: 'hidden',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
          }}
        >
          {filteredPayments.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
              No vendor payment disbursements recorded yet.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--color-surface-secondary, #f8fafc)', borderBottom: '1px solid var(--color-border, #e2e8f0)' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>Payment #</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>Vendor</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600 }}>Date</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600 }}>Method</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>Reference / Cheque</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>Amount Disbursed</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayments.map((p) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--color-border, #e2e8f0)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: '#0284c7' }}>
                      {p.payment_number || 'VPAY'}
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                      {p.vendor_name || p.vendor?.name || 'Vendor'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      {p.payment_date || (p.created_at ? new Date(p.created_at).toLocaleDateString() : 'N/A')}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: 'rgba(2, 132, 199, 0.1)',
                          color: '#0284c7',
                          fontSize: '11px',
                          fontWeight: 600
                        }}
                      >
                        {p.payment_method || 'BANK'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div>{p.reference_number || p.cheque_number || '—'}</div>
                      {p.notes && <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{p.notes}</div>}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>
                      Rs {Number(p.amount).toLocaleString()}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <span
                        style={{
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: p.status === 'POSTED' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                          color: p.status === 'POSTED' ? '#16a34a' : '#ca8a04',
                          fontWeight: 600,
                          fontSize: '11px'
                        }}
                      >
                        {p.status || 'POSTED'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Process Vendor Payment Modal */}
      {payModalOpen && selectedBill && (
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
                <i className="bx bx-credit-card" style={{ fontSize: '24px', color: '#0284c7' }}></i>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700 }}>Disburse Vendor Payment</h3>
              </div>
              <button
                onClick={() => setPayModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}
              >
                <i className="bx bx-x"></i>
              </button>
            </div>

            <div style={{ padding: '12px', background: 'var(--color-surface-secondary, #f8fafc)', borderRadius: '8px', marginBottom: '16px', fontSize: '12.5px' }}>
              <div>Vendor: <strong>{selectedBill.vendor_name || selectedBill.vendor?.name}</strong></div>
              <div>Bill / Doc #: <strong>{selectedBill.number || selectedBill.reference_number}</strong></div>
              <div>Total: <strong>Rs {Number(selectedBill.total_amount || selectedBill.amount).toLocaleString()}</strong> | Already Paid: <strong>Rs {Number(selectedBill.paid_amount || 0).toLocaleString()}</strong></div>
            </div>

            <form onSubmit={handleSubmitPayment} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Disbursement Amount (PKR) <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
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
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
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
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
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
                  Disburse From Treasury Bank Account
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
                    Bank Reference / UTR #
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. UTR-98214"
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
                    placeholder="e.g. CHQ-77881"
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

              {payMethod === 'CHEQUE' && (
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Cheque Clearing / Maturity Date
                  </label>
                  <input
                    type="date"
                    value={chequeDate}
                    onChange={(e) => setChequeDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--color-border, #cbd5e1)',
                      fontSize: '13px'
                    }}
                  />
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Remittance Notes / Narration
                </label>
                <textarea
                  rows={2}
                  placeholder="Payment remarks..."
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
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
                  onClick={() => setPayModalOpen(false)}
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
                  disabled={submittingPayment}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#0284c7',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: submittingPayment ? 'not-allowed' : 'pointer'
                  }}
                >
                  {submittingPayment ? 'Processing...' : 'Disburse & Commit Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
