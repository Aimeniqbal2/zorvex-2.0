import React, { useState, useEffect, useRef } from 'react';
import type {
  ClientInvoice,
  ClientInvoiceStatus,
  InvoicePreviewContext,
  CRMBillingPreviewResponse
} from '../api';
import {
  fetchClientInvoices,
  issueClientInvoice,
  sendClientInvoiceEmail,
  fetchClientInvoicePreviewContext,
  fetchCRMBillingPreview,
  autoSyncCRMInvoices,
  switchInvoiceCalculationMode,
  approveAllDraftInvoices
} from '../api';
import { CRMInvoicingModal } from './CRMInvoicingModal';

export const ClientInvoicesTab: React.FC = () => {
  const [invoices, setInvoices] = useState<ClientInvoice[]>([]);
  const [crmPreview, setCrmPreview] = useState<CRMBillingPreviewResponse | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');
  const [loading, setLoading] = useState<boolean>(true);
  const [syncingCRM, setSyncingCRM] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const initialAutoSyncedRef = useRef<boolean>(false);

  // CRM Invoicing Modal
  const [isCRMModalOpen, setIsCRMModalOpen] = useState<boolean>(false);

  // Action Loading
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  // Preview / Print Modal
  const [previewInvoiceId, setPreviewInvoiceId] = useState<string | null>(null);
  const [previewContext, setPreviewContext] = useState<InvoicePreviewContext | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);

  // Email Modal
  const [emailInvoiceId, setEmailInvoiceId] = useState<string | null>(null);
  const [emailTo, setEmailTo] = useState<string>('');
  const [emailSubject, setEmailSubject] = useState<string>('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);

  const loadInvoices = async (runInitialAutoSync = false) => {
    setLoading(true);
    setError(null);
    try {
      const previewMonthArg = selectedMonth !== 'ALL' ? selectedMonth : 'AUTO';
      const [invData, prevData] = await Promise.all([
        fetchClientInvoices(),
        fetchCRMBillingPreview(previewMonthArg).catch(() => null)
      ]);
      let finalInvoices = invData;
      let finalPreview = prevData;

      // On first open, automatically draft unbilled last-month/current-month CRM & Attendance invoices
      if (
        runInitialAutoSync &&
        !initialAutoSyncedRef.current &&
        prevData &&
        ((prevData.summary?.unbilled_locations_count || 0) > 0 || (prevData.summary?.unbilled_temp_count || 0) > 0)
      ) {
        initialAutoSyncedRef.current = true;
        try {
          const syncRes = await autoSyncCRMInvoices({
            months: [prevData.previous_month, prevData.current_month].filter(Boolean),
            calculation_mode: 'CONTRACT_RATE',
            initial_status: 'DRAFT'
          });
          if (syncRes.created_count > 0) {
            finalInvoices = await fetchClientInvoices();
            finalPreview = await fetchCRMBillingPreview(previewMonthArg).catch(() => prevData);
          }
        } catch {
          // Non-fatal: keep preview visible so user can trigger manual sync
        }
      }

      setInvoices(finalInvoices);
      if (finalPreview) setCrmPreview(finalPreview);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.response?.data?.detail || err.message || 'Failed to load client invoices.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoices(true);
  }, [selectedMonth]);

  const handleSyncCRMMonth = async (mode: 'CONTRACT_RATE' | 'ATTENDANCE_RATE' = 'CONTRACT_RATE') => {
    setSyncingCRM(true);
    try {
      const targetMonths = selectedMonth !== 'ALL'
        ? [selectedMonth]
        : [crmPreview?.previous_month, crmPreview?.current_month].filter((m): m is string => Boolean(m));
      const res = await autoSyncCRMInvoices({
        months: targetMonths.length > 0 ? targetMonths : undefined,
        calculation_mode: mode,
        initial_status: 'DRAFT'
      });
      await loadInvoices(false);
      alert(
        res.created_count > 0
          ? `Prepared ${res.created_count} Draft invoice(s) from CRM & Operations for ${res.months_synced.join(', ')}. Review and click "Approve & Issue" to post to Receivables.`
          : `All active client locations and approved temporary services for ${res.months_synced.join(', ')} are already invoiced.`
      );
    } catch (err: any) {
      alert(err?.response?.data?.error || err?.response?.data?.detail || err.message || 'Failed to sync CRM invoices.');
    } finally {
      setSyncingCRM(false);
    }
  };

  const handleIssueInvoice = async (invoiceId: string) => {
    setActionLoading(true);
    try {
      await issueClientInvoice(invoiceId);
      await loadInvoices(false);
    } catch (err: any) {
      alert(err?.response?.data?.error || err.message || 'Failed to approve & issue invoice.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSwitchMode = async (inv: ClientInvoice, nextMode: 'CONTRACT_RATE' | 'ATTENDANCE_RATE') => {
    setActionLoading(true);
    try {
      await switchInvoiceCalculationMode(inv.id, { calculation_mode: nextMode });
      await loadInvoices(false);
    } catch (err: any) {
      alert(err?.response?.data?.error || err.message || 'Failed to recalculate invoice calculation mode.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveAllDrafts = async () => {
    const draftIds = filteredInvoices.filter((i) => i.status === 'DRAFT').map((i) => i.id);
    if (draftIds.length === 0) return;
    setActionLoading(true);
    try {
      const res = await approveAllDraftInvoices({ invoice_ids: draftIds });
      await loadInvoices(false);
      alert(`Approved & Issued ${res.issued_count} invoice(s) into Accounts Receivable.`);
    } catch (err: any) {
      alert(err?.response?.data?.error || err.message || 'Failed to approve draft invoices.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenPreview = async (invoiceId: string) => {
    setPreviewInvoiceId(invoiceId);
    setPreviewLoading(true);
    try {
      const ctx = await fetchClientInvoicePreviewContext(invoiceId);
      setPreviewContext(ctx);
    } catch (err: any) {
      alert(err?.response?.data?.error || err.message || 'Failed to load invoice preview.');
      setPreviewInvoiceId(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleOpenEmailModal = (inv: ClientInvoice) => {
    setEmailInvoiceId(inv.id);
    setEmailTo('');
    setEmailSubject(`Security Services Invoice ${inv.invoice_number} - ${inv.billing_month}`);
    setEmailError(null);
    setEmailSuccess(null);
  };

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInvoiceId) return;
    setActionLoading(true);
    setEmailError(null);
    setEmailSuccess(null);
    try {
      const res = await sendClientInvoiceEmail(emailInvoiceId, {
        to_email: emailTo || undefined,
        subject: emailSubject || undefined
      });
      if (res.success) {
        setEmailSuccess('Invoice email dispatched successfully.');
        await loadInvoices();
        setTimeout(() => {
          setEmailInvoiceId(null);
        }, 1500);
      } else {
        setEmailError(res.error || 'Failed to dispatch email.');
      }
    } catch (err: any) {
      setEmailError(err?.response?.data?.error || err.message || 'Email dispatch failed.');
    } finally {
      setActionLoading(false);
    }
  };

  const filteredInvoices = invoices.filter((inv) => {
    const matchesSearch =
      (inv.invoice_number && inv.invoice_number.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (inv.client_name && inv.client_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (inv.contract_code && inv.contract_code.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (inv.notes && inv.notes.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === 'ALL' || inv.status === statusFilter;
    const matchesMonth = selectedMonth === 'ALL' || inv.billing_month === selectedMonth;
    return matchesSearch && matchesStatus && matchesMonth;
  });

  const draftInvoicesCount = filteredInvoices.filter((i) => i.status === 'DRAFT').length;
  const availableMonths = Array.from(
    new Set([
      ...(crmPreview?.available_months || []),
      ...invoices.map((i) => i.billing_month).filter(Boolean)
    ])
  ).sort((a, b) => b.localeCompare(a));

  const getStatusBadge = (status: ClientInvoiceStatus) => {
    switch (status) {
      case 'DRAFT':
        return <span style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, background: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8' }}>DRAFT</span>;
      case 'ISSUED':
        return <span style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, background: 'rgba(234, 179, 8, 0.15)', color: '#eab308' }}>ISSUED</span>;
      case 'SENT':
        return <span style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' }}>SENT</span>;
      case 'PARTIALLY_PAID':
        return <span style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, background: 'rgba(168, 85, 247, 0.15)', color: '#a855f7' }}>PARTIALLY PAID</span>;
      case 'PAID':
        return <span style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e' }}>PAID</span>;
      case 'CANCELLED':
        return <span style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}>CANCELLED</span>;
      default:
        return <span>{status}</span>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
            Security Client Invoices
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--color-text-muted)' }}>
            Official billing invoices generated from approved Billing Sheets with rate snapshot immutability.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {draftInvoicesCount > 0 && (
            <button
              onClick={handleApproveAllDrafts}
              disabled={actionLoading}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: 'none',
                background: '#16a34a',
                color: '#ffffff',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <i className="bx bx-check-double" style={{ fontSize: '16px' }}></i>
              <span>Approve & Issue All Drafts ({draftInvoicesCount})</span>
            </button>
          )}
          <button
            onClick={() => handleSyncCRMMonth('CONTRACT_RATE')}
            disabled={syncingCRM}
            style={{
              padding: '8px 14px',
              borderRadius: '6px',
              border: '1px solid #0284c7',
              background: 'rgba(2, 132, 199, 0.1)',
              color: '#0284c7',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <i className={`bx ${syncingCRM ? 'bx-loader-alt bx-spin' : 'bx-sync'}`}></i>
            <span>{syncingCRM ? 'Syncing CRM...' : 'Sync CRM & Operations Drafts'}</span>
          </button>
          <button
            onClick={() => setIsCRMModalOpen(true)}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
              background: 'var(--color-primary, #0284c7)',
              color: '#ffffff',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 6px rgba(2, 132, 199, 0.35)'
            }}
          >
            <i className="bx bx-plus-circle" style={{ fontSize: '16px' }}></i>
            <span>Generate from CRM & Attendance</span>
          </button>
          <button
            onClick={() => loadInvoices(false)}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Live CRM & Attendance Rate Comparison Banner */}
      {crmPreview && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '12px',
            padding: '14px 16px',
            borderRadius: '10px',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)'
          }}
        >
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
              Active CRM Locations ({crmPreview.billing_month})
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-text)', marginTop: '4px' }}>
              {crmPreview.summary.total_locations} Sites • {crmPreview.summary.total_temp_services} Temp Events
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
              Option 1: CRM Contract Value
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#0284c7', marginTop: '4px' }}>
              PKR {Number(crmPreview.summary.total_crm_contract_value || 0).toLocaleString()}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
              Option 2: Attendance-Delivered Value
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#7c3aed', marginTop: '4px' }}>
              PKR {Number(crmPreview.summary.total_attendance_value || 0).toLocaleString()}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
              Temporary Services Value
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#16a34a', marginTop: '4px' }}>
              PKR {Number(crmPreview.summary.total_temp_value || 0).toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* Filters Bar */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          padding: '14px',
          borderRadius: '8px',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          flexWrap: 'wrap',
          alignItems: 'center'
        }}
      >
        <div style={{ flex: '1 1 240px' }}>
          <input
            type="text"
            placeholder="Search by invoice #, client, location, contract..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg)',
              color: 'var(--color-text)',
              fontSize: '13px'
            }}
          />
        </div>

        <div>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg)',
              color: 'var(--color-text)',
              fontSize: '13px'
            }}
          >
            <option value="ALL">All Months</option>
            {availableMonths.map((m) => (
              <option key={m} value={m}>
                {m}{m === crmPreview?.previous_month ? ' (Last Month)' : m === crmPreview?.current_month ? ' (Current Month)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg)',
              color: 'var(--color-text)',
              fontSize: '13px'
            }}
          >
            <option value="ALL">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="ISSUED">Issued</option>
            <option value="SENT">Sent</option>
            <option value="PARTIALLY_PAID">Partially Paid</option>
            <option value="PAID">Paid</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Invoices List Table */}
      <div
        style={{
          background: 'var(--color-surface)',
          borderRadius: '8px',
          border: '1px solid var(--color-border)',
          overflow: 'hidden'
        }}
      >
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            Loading client invoices...
          </div>
        ) : error ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#ef4444' }}>{error}</div>
        ) : filteredInvoices.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            No client invoices generated yet. Invoices are generated from approved <strong>Billing Sheets</strong>.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'var(--color-bg-subtle, rgba(0,0,0,0.03))', borderBottom: '1px solid var(--color-border)' }}>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Invoice #</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Client</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Contract</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Billing Period</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Invoice Date</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Due Date</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Grand Total</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Status</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map((inv) => (
                <tr key={inv.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--color-primary, #0284c7)' }}>{inv.invoice_number}</div>
                    {inv.lines && inv.lines[0]?.site_name && (
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                        Location: {inv.lines[0].site_name}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '14px 16px', fontWeight: 500, color: 'var(--color-text)' }}>
                    {inv.client_name || 'Client'}
                  </td>
                  <td style={{ padding: '14px 16px', color: 'var(--color-text-muted)' }}>
                    <div>{inv.contract_code || 'CRM Contract'}</div>
                    {inv.notes && inv.notes.includes('[MODE:ATTENDANCE_RATE]') ? (
                      <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#7c3aed' }}>Option 2: Attendance Rate</span>
                    ) : inv.notes && inv.notes.includes('[TSR:') ? (
                      <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#16a34a' }}>Temporary Event</span>
                    ) : (
                      <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#0284c7' }}>Option 1: CRM Contract Rate</span>
                    )}
                  </td>
                  <td style={{ padding: '14px 16px', color: 'var(--color-text-muted)' }}>
                    {inv.billing_month} ({inv.period_start} → {inv.period_end})
                  </td>
                  <td style={{ padding: '14px 16px', color: 'var(--color-text)' }}>
                    {inv.invoice_date}
                  </td>
                  <td style={{ padding: '14px 16px', color: 'var(--color-text-muted)' }}>
                    {inv.due_date || '—'}
                  </td>
                  <td style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--color-text)' }}>
                    PKR {Number(inv.grand_total).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '14px 16px' }}>{getStatusBadge(inv.status)}</td>
                  <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => handleOpenPreview(inv.id)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '4px',
                          border: '1px solid var(--color-border)',
                          background: 'var(--color-surface)',
                          color: 'var(--color-text)',
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                      >
                        Preview / Print
                      </button>

                      {inv.status === 'DRAFT' && inv.notes && inv.notes.includes('[SITE:') && (
                        <button
                          disabled={actionLoading}
                          onClick={() =>
                            handleSwitchMode(
                              inv,
                              inv.notes?.includes('[MODE:ATTENDANCE_RATE]') ? 'CONTRACT_RATE' : 'ATTENDANCE_RATE'
                            )
                          }
                          style={{
                            padding: '4px 10px',
                            borderRadius: '4px',
                            border: '1px solid #7c3aed',
                            background: 'rgba(124, 58, 237, 0.1)',
                            color: '#7c3aed',
                            cursor: 'pointer',
                            fontSize: '11.5px',
                            fontWeight: 600
                          }}
                          title="Switch between CRM Monthly Contract Rate and Attendance-Delivered Client Rate"
                        >
                          {inv.notes?.includes('[MODE:ATTENDANCE_RATE]') ? 'Use CRM Rate' : 'Use Attendance Rate'}
                        </button>
                      )}

                      {inv.status === 'DRAFT' && (
                        <button
                          disabled={actionLoading}
                          onClick={() => handleIssueInvoice(inv.id)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '4px',
                            border: 'none',
                            background: '#16a34a',
                            color: '#ffffff',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 600
                          }}
                        >
                          Approve & Issue
                        </button>
                      )}

                      {(inv.status === 'ISSUED' || inv.status === 'SENT') && (
                        <button
                          onClick={() => handleOpenEmailModal(inv)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '4px',
                            border: 'none',
                            background: 'var(--color-primary, #0284c7)',
                            color: '#ffffff',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 600
                          }}
                        >
                          Send Email
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal: Email Invoice */}
      {emailInvoiceId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '20px'
          }}
        >
          <div
            style={{
              background: 'var(--color-surface)',
              borderRadius: '10px',
              border: '1px solid var(--color-border)',
              width: '100%',
              maxWidth: '500px',
              overflow: 'hidden'
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--color-text)' }}>
                Send Invoice via Email
              </h3>
              <button
                onClick={() => setEmailInvoiceId(null)}
                style={{ background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', color: 'var(--color-text-muted)' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSendEmail} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {emailError && (
                <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '6px', fontSize: '12px' }}>
                  {emailError}
                </div>
              )}
              {emailSuccess && (
                <div style={{ padding: '8px 12px', background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', borderRadius: '6px', fontSize: '12px' }}>
                  {emailSuccess}
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: 'var(--color-text-muted)' }}>
                  Recipient Email (Optional, defaults to client primary email)
                </label>
                <input
                  type="email"
                  placeholder="e.g. accounts@clientcorp.com"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: 'var(--color-text-muted)' }}>
                  Subject
                </label>
                <input
                  type="text"
                  required
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}
                />
              </div>

              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                The invoice will be dispatched via Universal Communications with complete branding, line items breakdown, and bank remittance information.
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setEmailInvoiceId(null)}
                  style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  style={{ padding: '8px 18px', borderRadius: '6px', border: 'none', background: 'var(--color-primary, #0284c7)', color: '#ffffff', fontWeight: 600 }}
                >
                  {actionLoading ? 'Sending...' : 'Dispatch Email'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Print / PDF Preview Modal */}
      {previewInvoiceId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '24px'
          }}
        >
          <div
            style={{
              background: '#ffffff',
              color: '#0f172a',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '850px',
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              overflow: 'hidden'
            }}
          >
            {/* Preview Toolbar */}
            <div style={{ padding: '14px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: '15px', color: '#1e293b' }}>
                Invoice Preview — {previewContext?.invoice?.invoice_number}
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => window.print()}
                  style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#1e293b', fontWeight: 600, cursor: 'pointer', fontSize: '12px' }}
                >
                  🖨 Print / Save as PDF
                </button>
                <button
                  onClick={() => {
                    setPreviewInvoiceId(null);
                    setPreviewContext(null);
                  }}
                  style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Printable Invoice Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '36px 40px', background: '#ffffff', fontFamily: "'Segoe UI', Roboto, sans-serif" }}>
              {previewLoading || !previewContext ? (
                <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>Loading preview...</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
                  {/* Header Row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.5px' }}>
                        {previewContext.company.name}
                      </h1>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                        {previewContext.company.address || 'Corporate Headquarters'}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                        Email: {previewContext.company.email} | Phone: {previewContext.company.phone || '+92 21 111-ZORVEX'}
                      </div>
                      {(previewContext.company.ntn || previewContext.company.strn) && (
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                          {previewContext.company.ntn && <span>NTN: {previewContext.company.ntn} </span>}
                          {previewContext.company.strn && <span>| STRN: {previewContext.company.strn}</span>}
                        </div>
                      )}
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '22px', fontWeight: 800, color: '#0284c7', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        TAX INVOICE
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>
                        {previewContext.invoice.invoice_number}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                        Date: {previewContext.invoice.invoice_date}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                        Due Date: {previewContext.invoice.due_date || 'Due on Receipt'}
                      </div>
                    </div>
                  </div>

                  <hr style={{ border: 'none', borderTop: '2px solid #e2e8f0', margin: 0 }} />

                  {/* Billed To & Contract Reference */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div style={{ background: '#f8fafc', padding: '14px 18px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        BILLED TO
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>
                        {previewContext.client.name}
                      </div>
                      <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>
                        {previewContext.client.billing_address || 'Official Client Address'}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                        {previewContext.client.email || ''}
                      </div>
                    </div>

                    <div style={{ background: '#f8fafc', padding: '14px 18px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        BILLING SPECIFICATIONS
                      </div>
                      <div style={{ fontSize: '12px', color: '#334155', marginTop: '4px' }}>
                        Contract Code: <strong>{previewContext.invoice.contract_code}</strong>
                      </div>
                      <div style={{ fontSize: '12px', color: '#334155', marginTop: '2px' }}>
                        Billing Period: <strong>{previewContext.invoice.period_start} → {previewContext.invoice.period_end}</strong>
                      </div>
                      <div style={{ fontSize: '12px', color: '#334155', marginTop: '2px' }}>
                        Billing Month: <strong>{previewContext.invoice.billing_month}</strong>
                      </div>
                      <div style={{ fontSize: '12px', color: '#334155', marginTop: '2px' }}>
                        Payment Terms: <strong>{previewContext.invoice.payment_terms}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Line Items Table */}
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: '#0f172a', color: '#ffffff' }}>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>Description</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>Site</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>Qty</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>Unit Rate</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>Total (PKR)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewContext.lines.map((ln, idx) => (
                        <tr key={ln.id || idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '10px 12px', color: '#0f172a' }}>
                            <div style={{ fontWeight: 600 }}>{ln.description}</div>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>{ln.line_type.replace('_', ' ')}</div>
                          </td>
                          <td style={{ padding: '10px 12px', color: '#475569' }}>{ln.site_name}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: '#0f172a' }}>
                            {Number(ln.quantity).toFixed(2)}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: '#0f172a' }}>
                            {Number(ln.unit_rate).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                            {Number(ln.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Totals Breakdown */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{ width: '300px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                        <span>Subtotal:</span>
                        <span>PKR {Number(previewContext.invoice.subtotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                        <span>Sales Tax / Tax:</span>
                        <span>PKR {Number(previewContext.invoice.tax_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                      <hr style={{ border: 'none', borderTop: '1px solid #cbd5e1', margin: '4px 0' }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '15px', color: '#0284c7' }}>
                        <span>Grand Total:</span>
                        <span>PKR {Number(previewContext.invoice.grand_total).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </div>

                  {/* Bank Account Remittance Details */}
                  {previewContext.bank_details && previewContext.bank_details.bank_name && (
                    <div style={{ background: '#f8fafc', padding: '14px 18px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}>
                      <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>BANK REMITTANCE DETAILS</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', color: '#334155' }}>
                        <div>Bank: <strong>{previewContext.bank_details.bank_name}</strong></div>
                        <div>Account Title: <strong>{previewContext.bank_details.account_title}</strong></div>
                        <div>Account No: <strong>{previewContext.bank_details.account_number}</strong></div>
                        <div>IBAN: <strong>{previewContext.bank_details.iban || '—'}</strong></div>
                      </div>
                    </div>
                  )}

                  {/* Footer Notes */}
                  <div style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center', marginTop: '10px' }}>
                    Thank you for partnering with {previewContext.company.name}. This is a computer-generated tax invoice and requires no physical signature.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CRM Invoicing Modal */}
      <CRMInvoicingModal
        isOpen={isCRMModalOpen}
        onClose={() => setIsCRMModalOpen(false)}
        onSuccess={() => loadInvoices(false)}
      />
    </div>
  );
};
