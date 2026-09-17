import React, { useState, useEffect } from 'react';
import type {
  TaxSummaryMetrics,
  TaxTransactionItem,
  TaxPaymentVoucherItem,
  ClientWithholdingCertificateItem,
  VendorWithholdingRecordItem,
  TaxPeriodItem,
  TaxAdjustmentItem,
  TaxAuthorityItem,
  TaxCodeItem,
  BankAccountItem,
  COAItem
} from '../api';
import {
  fetchTaxSummaryMetrics,
  syncAllTaxSources,
  fetchTaxTransactions,
  fetchTaxPaymentVouchers,
  fetchClientWithholdingCertificates,
  fetchVendorWithholdingRecords,
  fetchTaxPeriods,
  fetchTaxAdjustments,
  fetchTaxAuthorities,
  fetchTaxCodes,
  fetchBankAccounts,
  fetchChartOfAccounts,
  approveTaxPaymentVoucher,
  payTaxPaymentVoucher,
  fileTaxPaymentVoucher
} from '../api';
import { NewTaxVoucherModal } from './NewTaxVoucherModal';
import { ClientWithholdingModal } from './ClientWithholdingModal';
import { TaxAdjustmentModal } from './TaxAdjustmentModal';
import { NewTaxCodeModal } from './NewTaxCodeModal';

type SubView = 'transactions' | 'vouchers' | 'client_wht' | 'vendor_wht' | 'periods_adjustments' | 'tax_codes';

export const TaxManagementTab: React.FC = () => {
  const [activeSubView, setActiveSubView] = useState<SubView>('transactions');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [metrics, setMetrics] = useState<TaxSummaryMetrics | null>(null);

  // Data lists
  const [transactions, setTransactions] = useState<TaxTransactionItem[]>([]);
  const [vouchers, setVouchers] = useState<TaxPaymentVoucherItem[]>([]);
  const [clientCerts, setClientCerts] = useState<ClientWithholdingCertificateItem[]>([]);
  const [vendorWhtRecords, setVendorWhtRecords] = useState<VendorWithholdingRecordItem[]>([]);
  const [periods, setPeriods] = useState<TaxPeriodItem[]>([]);
  const [adjustments, setAdjustments] = useState<TaxAdjustmentItem[]>([]);
  const [authorities, setAuthorities] = useState<TaxAuthorityItem[]>([]);
  const [taxCodes, setTaxCodes] = useState<TaxCodeItem[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountItem[]>([]);
  const [coaAccounts, setCoaAccounts] = useState<COAItem[]>([]);

  // Modals
  const [showVoucherModal, setShowVoucherModal] = useState(false);
  const [showClientWhtModal, setShowClientWhtModal] = useState(false);
  const [verifyingCert, setVerifyingCert] = useState<ClientWithholdingCertificateItem | null>(null);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [showTaxCodeModal, setShowTaxCodeModal] = useState(false);

  // Filters
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [filterSourceType, setFilterSourceType] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [
        m,
        txList,
        vList,
        cwList,
        vwList,
        pList,
        adjList,
        authList,
        tcList,
        baList,
        coaList
      ] = await Promise.all([
        fetchTaxSummaryMetrics().catch(() => null),
        fetchTaxTransactions().catch(() => []),
        fetchTaxPaymentVouchers().catch(() => []),
        fetchClientWithholdingCertificates().catch(() => []),
        fetchVendorWithholdingRecords().catch(() => []),
        fetchTaxPeriods().catch(() => []),
        fetchTaxAdjustments().catch(() => []),
        fetchTaxAuthorities().catch(() => []),
        fetchTaxCodes().catch(() => []),
        fetchBankAccounts().catch(() => []),
        fetchChartOfAccounts().catch(() => [])
      ]);

      setMetrics(m);
      setTransactions(txList);
      setVouchers(vList);
      setClientCerts(cwList);
      setVendorWhtRecords(vwList);
      setPeriods(pList);
      setAdjustments(adjList);
      setAuthorities(authList);
      setTaxCodes(tcList);
      setBankAccounts(baList);
      setCoaAccounts(coaList);
    } catch (err) {
      console.error('Error loading tax data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSyncAll = async () => {
    setSyncing(true);
    try {
      const res = await syncAllTaxSources();
      setMetrics(res.summary);
      await loadData();
    } catch (err) {
      console.error('Error syncing tax sources:', err);
    } finally {
      setSyncing(false);
    }
  };

  const handleApproveVoucher = async (voucherId: string) => {
    try {
      await approveTaxPaymentVoucher(voucherId);
      loadData();
    } catch (err) {
      console.error('Failed to approve voucher:', err);
    }
  };

  const handlePayVoucher = async (voucherId: string) => {
    const cpr = window.prompt('Enter Treasury CPR / Challan Receipt Number (optional):') || '';
    try {
      await payTaxPaymentVoucher(voucherId, cpr);
      loadData();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to process tax payment.');
    }
  };

  const handleFileVoucher = async (voucherId: string) => {
    const cpr = window.prompt('Enter Government Return / Acknowledgment CPR:') || '';
    try {
      await fileTaxPaymentVoucher(voucherId, cpr);
      loadData();
    } catch (err) {
      console.error('Failed to file voucher:', err);
    }
  };

  const filteredTransactions = transactions.filter(t => {
    if (filterCategory !== 'ALL' && t.tax_category !== filterCategory) return false;
    if (filterSourceType !== 'ALL' && t.source_type !== filterSourceType) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (
        t.source_number.toLowerCase().includes(q) ||
        t.counterparty_name.toLowerCase().includes(q) ||
        (t.tax_code_name && t.tax_code_name.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '4px 0' }}>
      {loading && (
        <div style={{
          padding: '8px 16px', borderRadius: '8px',
          background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)',
          color: '#60a5fa', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px'
        }}>
          <span>⏳</span> Refreshing universal tax metrics and transaction ledgers...
        </div>
      )}

      {/* 1. Live KPI Summary Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '14px'
      }}>
        <div style={{
          background: 'var(--color-surface, #1e293b)',
          border: '1px solid var(--color-border, #334155)',
          borderRadius: '10px',
          padding: '16px',
          display: 'flex', flexDirection: 'column', gap: '4px'
        }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary, #94a3b8)', textTransform: 'uppercase' }}>
            Output Sales Tax (Revenue)
          </span>
          <span style={{ fontSize: '20px', fontWeight: 700, color: '#f59e0b' }}>
            PKR {metrics?.total_output_tax ? metrics.total_output_tax.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}
          </span>
          <span style={{ fontSize: '11px', color: 'var(--color-text-secondary, #94a3b8)' }}>
            Gross billing sales tax liability
          </span>
        </div>

        <div style={{
          background: 'var(--color-surface, #1e293b)',
          border: '1px solid var(--color-border, #334155)',
          borderRadius: '10px',
          padding: '16px',
          display: 'flex', flexDirection: 'column', gap: '4px'
        }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary, #94a3b8)', textTransform: 'uppercase' }}>
            Input Tax (Recoverable Asset)
          </span>
          <span style={{ fontSize: '20px', fontWeight: 700, color: '#10b981' }}>
            PKR {metrics?.total_input_recoverable_tax ? metrics.total_input_recoverable_tax.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}
          </span>
          <span style={{ fontSize: '11px', color: 'var(--color-text-secondary, #94a3b8)' }}>
            Purchasing & expense VAT credits
          </span>
        </div>

        <div style={{
          background: 'var(--color-surface, #1e293b)',
          border: '1px solid var(--color-border, #334155)',
          borderRadius: '10px',
          padding: '16px',
          display: 'flex', flexDirection: 'column', gap: '4px'
        }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary, #94a3b8)', textTransform: 'uppercase' }}>
            Net Sales Tax Position
          </span>
          <span style={{
            fontSize: '20px',
            fontWeight: 700,
            color: (metrics?.net_tax_payable || 0) > 0 ? '#ef4444' : '#3b82f6'
          }}>
            {(metrics?.net_tax_payable || 0) > 0
              ? `PKR ${metrics?.net_tax_payable?.toLocaleString(undefined, { minimumFractionDigits: 2 })} (Payable)`
              : `PKR ${metrics?.net_tax_credit?.toLocaleString(undefined, { minimumFractionDigits: 2 })} (Credit)`}
          </span>
          <span style={{ fontSize: '11px', color: 'var(--color-text-secondary, #94a3b8)' }}>
            Output Tax minus Recoverable Input
          </span>
        </div>

        <div style={{
          background: 'var(--color-surface, #1e293b)',
          border: '1px solid var(--color-border, #334155)',
          borderRadius: '10px',
          padding: '16px',
          display: 'flex', flexDirection: 'column', gap: '4px'
        }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary, #94a3b8)', textTransform: 'uppercase' }}>
            Vendor & Payroll WHT Due
          </span>
          <span style={{ fontSize: '20px', fontWeight: 700, color: '#ec4899' }}>
            PKR {((metrics?.total_withholding_payable || 0) + (metrics?.total_payroll_tax || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
          <span style={{ fontSize: '11px', color: 'var(--color-text-secondary, #94a3b8)' }}>
            Vendor WHT: PKR {metrics?.total_withholding_payable?.toLocaleString()} | Staff: PKR {metrics?.total_payroll_tax?.toLocaleString()}
          </span>
        </div>

        <div style={{
          background: 'var(--color-surface, #1e293b)',
          border: '1px solid var(--color-border, #334155)',
          borderRadius: '10px',
          padding: '16px',
          display: 'flex', flexDirection: 'column', gap: '4px'
        }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary, #94a3b8)', textTransform: 'uppercase' }}>
            Total Tax Paid & Outstanding
          </span>
          <span style={{ fontSize: '20px', fontWeight: 700, color: '#38bdf8' }}>
            PKR {metrics?.total_tax_paid ? metrics.total_tax_paid.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}
          </span>
          <span style={{ fontSize: '11px', color: '#f87171' }}>
            Outstanding: PKR {metrics?.total_tax_outstanding ? metrics.total_tax_outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}
          </span>
        </div>
      </div>

      {/* 2. Actions Bar */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '12px',
        background: 'var(--color-surface, #1e293b)',
        padding: '14px 18px',
        borderRadius: '10px',
        border: '1px solid var(--color-border, #334155)'
      }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {(
            [
              { id: 'transactions', label: '🏛️ Tax Ledger', badge: transactions.length },
              { id: 'vouchers', label: '📑 Payment Vouchers', badge: vouchers.length },
              { id: 'client_wht', label: '📜 Client WHT (Receivable)', badge: clientCerts.length },
              { id: 'vendor_wht', label: '📋 Vendor WHT (Payable)', badge: vendorWhtRecords.length },
              { id: 'periods_adjustments', label: '⚖️ Periods & Adjustments', badge: periods.length + adjustments.length },
              { id: 'tax_codes', label: '⚙️ Tax Codes', badge: taxCodes.length }
            ] as const
          ).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveSubView(tab.id)}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                border: 'none',
                background: activeSubView === tab.id ? 'var(--color-primary, #3b82f6)' : 'rgba(255, 255, 255, 0.05)',
                color: activeSubView === tab.id ? '#fff' : 'var(--color-text-secondary, #94a3b8)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              {tab.label}
              <span style={{
                fontSize: '10px',
                background: activeSubView === tab.id ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)',
                padding: '2px 6px',
                borderRadius: '10px'
              }}>
                {tab.badge}
              </span>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={handleSyncAll}
            disabled={syncing}
            style={{
              padding: '8px 14px', borderRadius: '8px',
              background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.4)',
              color: '#60a5fa', fontSize: '12px', fontWeight: 600, cursor: syncing ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}
          >
            {syncing ? '⏳ Syncing...' : '⚡ Sync All Sources'}
          </button>

          <button
            onClick={() => setShowVoucherModal(true)}
            style={{
              padding: '8px 14px', borderRadius: '8px',
              background: 'var(--color-primary, #3b82f6)', border: 'none',
              color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer'
            }}
          >
            + Tax Payment Voucher
          </button>

          <button
            onClick={() => {
              setVerifyingCert(null);
              setShowClientWhtModal(true);
            }}
            style={{
              padding: '8px 14px', borderRadius: '8px',
              background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.4)',
              color: '#34d399', fontSize: '12px', fontWeight: 600, cursor: 'pointer'
            }}
          >
            + Record Client WHT
          </button>

          <button
            onClick={() => setShowAdjustmentModal(true)}
            style={{
              padding: '8px 14px', borderRadius: '8px',
              background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.4)',
              color: '#fbbf24', fontSize: '12px', fontWeight: 600, cursor: 'pointer'
            }}
          >
            + Tax Adjustment
          </button>

          <button
            onClick={() => setShowTaxCodeModal(true)}
            style={{
              padding: '8px 14px', borderRadius: '8px',
              background: 'rgba(148, 163, 184, 0.15)', border: '1px solid rgba(148, 163, 184, 0.3)',
              color: '#e2e8f0', fontSize: '12px', fontWeight: 600, cursor: 'pointer'
            }}
          >
            + New Tax Code
          </button>
        </div>
      </div>

      {/* 3. Sub-View Content */}

      {/* SUBVIEW A: Tax Transactions Ledger */}
      {activeSubView === 'transactions' && (
        <div style={{
          background: 'var(--color-surface, #1e293b)',
          border: '1px solid var(--color-border, #334155)',
          borderRadius: '10px',
          overflow: 'hidden'
        }}>
          <div style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--color-border, #334155)',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Search by source #, counterparty, tax code..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{
                  padding: '8px 12px', borderRadius: '8px',
                  background: 'var(--color-bg, #0f172a)', border: '1px solid var(--color-border, #334155)',
                  color: '#fff', fontSize: '13px', width: '260px'
                }}
              />

              <select
                value={filterCategory}
                onChange={e => setFilterCategory(e.target.value)}
                style={{
                  padding: '8px 12px', borderRadius: '8px',
                  background: 'var(--color-bg, #0f172a)', border: '1px solid var(--color-border, #334155)',
                  color: '#fff', fontSize: '13px'
                }}
              >
                <option value="ALL">All Categories</option>
                <option value="OUTPUT_TAX">Output Tax</option>
                <option value="INPUT_TAX">Input Tax</option>
                <option value="WITHHOLDING_RECEIVABLE">Withholding Receivable</option>
                <option value="WITHHOLDING_PAYABLE">Withholding Payable</option>
                <option value="PAYROLL_TAX">Payroll Tax</option>
              </select>

              <select
                value={filterSourceType}
                onChange={e => setFilterSourceType(e.target.value)}
                style={{
                  padding: '8px 12px', borderRadius: '8px',
                  background: 'var(--color-bg, #0f172a)', border: '1px solid var(--color-border, #334155)',
                  color: '#fff', fontSize: '13px'
                }}
              >
                <option value="ALL">All Sources</option>
                <option value="CLIENT_INVOICE">Client Invoice</option>
                <option value="CLIENT_RECEIPT">Client Receipt / WHT</option>
                <option value="VENDOR_BILL">Vendor Bill</option>
                <option value="VENDOR_PAYMENT">Vendor Payment</option>
                <option value="PAYROLL">Payroll</option>
                <option value="EXPENSE">Expense</option>
                <option value="ADJUSTMENT">Adjustment</option>
              </select>
            </div>

            <span style={{ fontSize: '12px', color: 'var(--color-text-secondary, #94a3b8)' }}>
              Showing {filteredTransactions.length} of {transactions.length} records
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'rgba(0, 0, 0, 0.2)', borderBottom: '1px solid var(--color-border, #334155)', color: 'var(--color-text-secondary, #94a3b8)' }}>
                  <th style={{ padding: '12px 16px' }}>Date</th>
                  <th style={{ padding: '12px 16px' }}>Source Ref</th>
                  <th style={{ padding: '12px 16px' }}>Tax Category</th>
                  <th style={{ padding: '12px 16px' }}>Counterparty</th>
                  <th style={{ padding: '12px 16px' }}>Tax Code & Rate</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Taxable Base</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Tax Amount</th>
                  <th style={{ padding: '12px 16px' }}>Direction</th>
                  <th style={{ padding: '12px 16px' }}>GL Account</th>
                  <th style={{ padding: '12px 16px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-secondary, #94a3b8)' }}>
                      No tax transactions found matching criteria. Click <b>⚡ Sync All Sources</b> to load records.
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map(tx => (
                    <tr key={tx.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>{tx.tax_date}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: '4px',
                          background: 'rgba(255, 255, 255, 0.06)', fontSize: '11px', fontWeight: 600
                        }}>
                          {tx.source_type}
                        </span>
                        <div style={{ fontWeight: 600, marginTop: '2px' }}>{tx.source_number}</div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                          background:
                            tx.tax_category === 'OUTPUT_TAX' ? 'rgba(245, 158, 11, 0.15)' :
                            tx.tax_category === 'INPUT_TAX' ? 'rgba(16, 185, 129, 0.15)' :
                            tx.tax_category === 'WITHHOLDING_RECEIVABLE' ? 'rgba(59, 130, 246, 0.15)' :
                            tx.tax_category === 'WITHHOLDING_PAYABLE' ? 'rgba(236, 72, 153, 0.15)' :
                            'rgba(168, 85, 247, 0.15)',
                          color:
                            tx.tax_category === 'OUTPUT_TAX' ? '#fbbf24' :
                            tx.tax_category === 'INPUT_TAX' ? '#34d399' :
                            tx.tax_category === 'WITHHOLDING_RECEIVABLE' ? '#60a5fa' :
                            tx.tax_category === 'WITHHOLDING_PAYABLE' ? '#f472b6' :
                            '#c084fc'
                        }}>
                          {tx.tax_category}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>{tx.counterparty_name}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <b>{tx.tax_code_code || tx.tax_code}</b> ({Number(tx.tax_rate || 0)}%)
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 500 }}>
                        PKR {Number(tx.taxable_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: tx.direction.includes('INPUT') || tx.direction.includes('WITHHOLDING_IN') ? '#34d399' : '#fbbf24' }}>
                        PKR {Number(tx.tax_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                          {tx.direction}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: '11px' }}>{tx.gl_account_code ? `${tx.gl_account_code} - ${tx.gl_account_name}` : 'Default Control'}</span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
                          background: tx.status === 'PAID' || tx.status === 'POSTED_SOURCE' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                          color: tx.status === 'PAID' || tx.status === 'POSTED_SOURCE' ? '#34d399' : '#fbbf24'
                        }}>
                          {tx.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUBVIEW B: Tax Payment Vouchers */}
      {activeSubView === 'vouchers' && (
        <div style={{
          background: 'var(--color-surface, #1e293b)',
          border: '1px solid var(--color-border, #334155)',
          borderRadius: '10px',
          overflow: 'hidden'
        }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--color-border, #334155)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Government Tax Payment & Deposit Vouchers</h4>
            <button
              onClick={() => setShowVoucherModal(true)}
              style={{
                padding: '7px 14px', borderRadius: '8px',
                background: 'var(--color-primary, #3b82f6)', border: 'none',
                color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer'
              }}
            >
              + Create Voucher
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'rgba(0, 0, 0, 0.2)', borderBottom: '1px solid var(--color-border, #334155)', color: 'var(--color-text-secondary, #94a3b8)' }}>
                  <th style={{ padding: '12px 16px' }}>Voucher #</th>
                  <th style={{ padding: '12px 16px' }}>Payment Date</th>
                  <th style={{ padding: '12px 16px' }}>Tax Authority</th>
                  <th style={{ padding: '12px 16px' }}>Tax Type</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Amount (PKR)</th>
                  <th style={{ padding: '12px 16px' }}>Treasury Bank</th>
                  <th style={{ padding: '12px 16px' }}>PSID / Challan #</th>
                  <th style={{ padding: '12px 16px' }}>Status</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {vouchers.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-secondary, #94a3b8)' }}>
                      No tax payment vouchers created yet.
                    </td>
                  </tr>
                ) : (
                  vouchers.map(v => (
                    <tr key={v.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 600 }}>{v.voucher_number}</td>
                      <td style={{ padding: '12px 16px' }}>{v.payment_date}</td>
                      <td style={{ padding: '12px 16px' }}>{v.tax_authority_name}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: '4px', background: 'rgba(255, 255, 255, 0.08)', fontSize: '11px' }}>
                          {v.tax_type}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700 }}>
                        PKR {Number(v.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '12px 16px' }}>{v.treasury_account_title}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <div>{v.psid_number || v.challan_number || '--'}</div>
                        {v.cpr_number && <span style={{ fontSize: '11px', color: '#10b981' }}>CPR: {v.cpr_number}</span>}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                          background:
                            v.status === 'FILED' ? 'rgba(16, 185, 129, 0.2)' :
                            v.status === 'PAID' ? 'rgba(59, 130, 246, 0.2)' :
                            v.status === 'APPROVED' ? 'rgba(245, 158, 11, 0.2)' :
                            'rgba(148, 163, 184, 0.2)',
                          color:
                            v.status === 'FILED' ? '#34d399' :
                            v.status === 'PAID' ? '#60a5fa' :
                            v.status === 'APPROVED' ? '#fbbf24' :
                            '#94a3b8'
                        }}>
                          {v.status}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          {v.status === 'DRAFT' && (
                            <button
                              onClick={() => handleApproveVoucher(v.id)}
                              style={{
                                padding: '5px 10px', borderRadius: '6px',
                                background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)',
                                color: '#fbbf24', fontSize: '11px', fontWeight: 600, cursor: 'pointer'
                              }}
                            >
                              Approve
                            </button>
                          )}
                          {(v.status === 'APPROVED' || v.status === 'DRAFT') && (
                            <button
                              onClick={() => handlePayVoucher(v.id)}
                              style={{
                                padding: '5px 10px', borderRadius: '6px',
                                background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)',
                                color: '#34d399', fontSize: '11px', fontWeight: 600, cursor: 'pointer'
                              }}
                            >
                              Pay & Deposit
                            </button>
                          )}
                          {v.status === 'PAID' && (
                            <button
                              onClick={() => handleFileVoucher(v.id)}
                              style={{
                                padding: '5px 10px', borderRadius: '6px',
                                background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)',
                                color: '#60a5fa', fontSize: '11px', fontWeight: 600, cursor: 'pointer'
                              }}
                            >
                              Mark Filed / CPR
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUBVIEW C: Client Withholding Certificates (Receivable) */}
      {activeSubView === 'client_wht' && (
        <div style={{
          background: 'var(--color-surface, #1e293b)',
          border: '1px solid var(--color-border, #334155)',
          borderRadius: '10px',
          overflow: 'hidden'
        }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--color-border, #334155)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Client Tax Withholding Certificates (Advance Tax Asset)</h4>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                Track TDS certificates issued by clients for income / sales tax deduction recovery
              </p>
            </div>
            <button
              onClick={() => {
                setVerifyingCert(null);
                setShowClientWhtModal(true);
              }}
              style={{
                padding: '7px 14px', borderRadius: '8px',
                background: '#10b981', border: 'none',
                color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer'
              }}
            >
              + Record Certificate
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'rgba(0, 0, 0, 0.2)', borderBottom: '1px solid var(--color-border, #334155)', color: 'var(--color-text-secondary, #94a3b8)' }}>
                  <th style={{ padding: '12px 16px' }}>Cert #</th>
                  <th style={{ padding: '12px 16px' }}>Date</th>
                  <th style={{ padding: '12px 16px' }}>Client</th>
                  <th style={{ padding: '12px 16px' }}>Tax Rate / Rule</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Withheld (PKR)</th>
                  <th style={{ padding: '12px 16px' }}>CPR / Challan #</th>
                  <th style={{ padding: '12px 16px' }}>Verification Status</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {clientCerts.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-secondary, #94a3b8)' }}>
                      No client withholding certificates recorded yet.
                    </td>
                  </tr>
                ) : (
                  clientCerts.map(c => (
                    <tr key={c.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 600 }}>{c.certificate_number}</td>
                      <td style={{ padding: '12px 16px' }}>{c.certificate_date}</td>
                      <td style={{ padding: '12px 16px' }}>{c.client_name}</td>
                      <td style={{ padding: '12px 16px' }}>{c.tax_code_name}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#34d399' }}>
                        PKR {Number(c.withheld_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '12px 16px' }}>{c.cpr_challan_no || '--'}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                          background: c.verification_status === 'VERIFIED' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                          color: c.verification_status === 'VERIFIED' ? '#34d399' : '#fbbf24'
                        }}>
                          {c.verification_status}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        {c.verification_status !== 'VERIFIED' && (
                          <button
                            onClick={() => {
                              setVerifyingCert(c);
                              setShowClientWhtModal(true);
                            }}
                            style={{
                              padding: '5px 12px', borderRadius: '6px',
                              background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)',
                              color: '#34d399', fontSize: '11px', fontWeight: 600, cursor: 'pointer'
                            }}
                          >
                            Verify & Confirm
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUBVIEW D: Vendor Withholding Records (Payable) */}
      {activeSubView === 'vendor_wht' && (
        <div style={{
          background: 'var(--color-surface, #1e293b)',
          border: '1px solid var(--color-border, #334155)',
          borderRadius: '10px',
          overflow: 'hidden'
        }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--color-border, #334155)' }}>
            <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Vendor Withholding Tax Register (Liability to Treasury)</h4>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-secondary, #94a3b8)' }}>
              Taxes deducted from vendor bills pending deposit to Federal/Provincial authorities
            </p>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'rgba(0, 0, 0, 0.2)', borderBottom: '1px solid var(--color-border, #334155)', color: 'var(--color-text-secondary, #94a3b8)' }}>
                  <th style={{ padding: '12px 16px' }}>Date</th>
                  <th style={{ padding: '12px 16px' }}>Vendor</th>
                  <th style={{ padding: '12px 16px' }}>Bill #</th>
                  <th style={{ padding: '12px 16px' }}>Tax Code & Rate</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Taxable Base (PKR)</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Withheld Amount (PKR)</th>
                  <th style={{ padding: '12px 16px' }}>Status</th>
                  <th style={{ padding: '12px 16px' }}>CPR / Certificate #</th>
                </tr>
              </thead>
              <tbody>
                {vendorWhtRecords.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-secondary, #94a3b8)' }}>
                      No vendor withholding records found.
                    </td>
                  </tr>
                ) : (
                  vendorWhtRecords.map(vw => (
                    <tr key={vw.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <td style={{ padding: '12px 16px' }}>{vw.withheld_date}</td>
                      <td style={{ padding: '12px 16px', fontWeight: 600 }}>{vw.vendor_name}</td>
                      <td style={{ padding: '12px 16px' }}>{vw.vendor_bill_number || '--'}</td>
                      <td style={{ padding: '12px 16px' }}>{vw.tax_code_name} ({Number(vw.tax_rate)}%)</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        PKR {Number(vw.taxable_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#f472b6' }}>
                        PKR {Number(vw.withheld_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
                          background: vw.status === 'DEPOSITED' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(236, 72, 153, 0.2)',
                          color: vw.status === 'DEPOSITED' ? '#34d399' : '#f472b6'
                        }}>
                          {vw.status}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>{vw.cpr_number || vw.certificate_number || '--'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUBVIEW E: Periods & Adjustments */}
      {activeSubView === 'periods_adjustments' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {/* Tax Periods */}
          <div style={{
            background: 'var(--color-surface, #1e293b)',
            border: '1px solid var(--color-border, #334155)',
            borderRadius: '10px',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--color-border, #334155)' }}>
              <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Statutory Tax Periods</h4>
            </div>
            <div style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {periods.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--color-text-secondary, #94a3b8)', fontSize: '13px' }}>
                  No statutory periods defined.
                </div>
              ) : (
                periods.map(p => (
                  <div key={p.id} style={{
                    padding: '12px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '13px' }}>{p.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                        {p.period_start} to {p.period_end} • {p.tax_authority_name}
                      </div>
                    </div>
                    <span style={{
                      padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
                      background: p.status === 'OPEN' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                      color: p.status === 'OPEN' ? '#34d399' : '#94a3b8'
                    }}>
                      {p.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Tax Adjustments */}
          <div style={{
            background: 'var(--color-surface, #1e293b)',
            border: '1px solid var(--color-border, #334155)',
            borderRadius: '10px',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--color-border, #334155)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Audited Tax Adjustments</h4>
              <button
                onClick={() => setShowAdjustmentModal(true)}
                style={{
                  padding: '5px 12px', borderRadius: '6px',
                  background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)',
                  color: '#fbbf24', fontSize: '11px', fontWeight: 600, cursor: 'pointer'
                }}
              >
                + New Adjustment
              </button>
            </div>
            <div style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {adjustments.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--color-text-secondary, #94a3b8)', fontSize: '13px' }}>
                  No tax adjustments on record.
                </div>
              ) : (
                adjustments.map(adj => (
                  <div key={adj.id} style={{
                    padding: '12px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '13px' }}>{adj.adjustment_number} — {adj.tax_code_name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                        {adj.tax_date} • {adj.reason}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, fontSize: '13px', color: '#fbbf24' }}>
                        PKR {Number(adj.amount).toLocaleString()}
                      </div>
                      <span style={{ fontSize: '10px', color: '#10b981' }}>{adj.status}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUBVIEW F: Tax Codes Configuration */}
      {activeSubView === 'tax_codes' && (
        <div style={{
          background: 'var(--color-surface, #1e293b)',
          border: '1px solid var(--color-border, #334155)',
          borderRadius: '10px',
          overflow: 'hidden'
        }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--color-border, #334155)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Configured Statutory Tax Codes</h4>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                Universal rates, effective validity dates, and GL account bindings
              </p>
            </div>
            <button
              onClick={() => setShowTaxCodeModal(true)}
              style={{
                padding: '7px 14px', borderRadius: '8px',
                background: 'var(--color-primary, #3b82f6)', border: 'none',
                color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer'
              }}
            >
              + Create Tax Code
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'rgba(0, 0, 0, 0.2)', borderBottom: '1px solid var(--color-border, #334155)', color: 'var(--color-text-secondary, #94a3b8)' }}>
                  <th style={{ padding: '12px 16px' }}>Code</th>
                  <th style={{ padding: '12px 16px' }}>Name</th>
                  <th style={{ padding: '12px 16px' }}>Category</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Rate (%)</th>
                  <th style={{ padding: '12px 16px' }}>Recoverability</th>
                  <th style={{ padding: '12px 16px' }}>Jurisdiction</th>
                  <th style={{ padding: '12px 16px' }}>Effective Validity</th>
                  <th style={{ padding: '12px 16px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {taxCodes.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-secondary, #94a3b8)' }}>
                      No tax codes configured yet.
                    </td>
                  </tr>
                ) : (
                  taxCodes.map(tc => (
                    <tr key={tc.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 600 }}>{tc.code}</td>
                      <td style={{ padding: '12px 16px' }}>{tc.name}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', background: 'rgba(255,255,255,0.06)' }}>
                          {(tc as any).tax_category || 'OUTPUT_TAX'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700 }}>
                        {Number(tc.rate || 0)}%
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: '11px' }}>{(tc as any).recoverability || 'RECOVERABLE'}</span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>{(tc as any).jurisdiction || 'Federal'}</td>
                      <td style={{ padding: '12px 16px', fontSize: '11px' }}>
                        {(tc as any).effective_from || 'Always'} {(tc as any).effective_to ? `to ${(tc as any).effective_to}` : ''}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: '11px', color: tc.is_active ? '#10b981' : '#f87171' }}>
                          {tc.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. Modals */}
      {showVoucherModal && (
        <NewTaxVoucherModal
          authorities={authorities}
          bankAccounts={bankAccounts}
          taxPeriods={periods}
          onClose={() => setShowVoucherModal(false)}
          onCreated={voucher => {
            setShowVoucherModal(false);
            setVouchers(prev => [voucher, ...prev]);
            loadData();
          }}
        />
      )}

      {showClientWhtModal && (
        <ClientWithholdingModal
          clients={coaAccounts.filter(a => a.account_code.startsWith('12')).map(a => ({ id: a.id, name: a.account_name }))}
          taxCodes={taxCodes}
          certificate={verifyingCert}
          onClose={() => {
            setShowClientWhtModal(false);
            setVerifyingCert(null);
          }}
          onSaved={() => {
            setShowClientWhtModal(false);
            setVerifyingCert(null);
            loadData();
          }}
        />
      )}

      {showAdjustmentModal && (
        <TaxAdjustmentModal
          taxCodes={taxCodes}
          taxPeriods={periods}
          onClose={() => setShowAdjustmentModal(false)}
          onCreated={adj => {
            setShowAdjustmentModal(false);
            setAdjustments(prev => [adj, ...prev]);
            loadData();
          }}
        />
      )}

      {showTaxCodeModal && (
        <NewTaxCodeModal
          authorities={authorities}
          accounts={coaAccounts}
          onClose={() => setShowTaxCodeModal(false)}
          onCreated={tc => {
            setShowTaxCodeModal(false);
            setTaxCodes(prev => [...prev, tc]);
            loadData();
          }}
        />
      )}
    </div>
  );
};
