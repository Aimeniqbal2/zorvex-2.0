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
  approveAllDraftInvoices,
  setInvoiceTemplateMode
} from '../api';
import { CRMInvoicingModal } from './CRMInvoicingModal';
import { InvoiceDocumentSheet } from './InvoiceDocumentSheet';
import { InvoiceTemplateEditorModal } from './InvoiceTemplateEditorModal';

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

  // CRM Invoicing & Template Editor Modals
  const [isCRMModalOpen, setIsCRMModalOpen] = useState<boolean>(false);
  const [isTemplateEditorOpen, setIsTemplateEditorOpen] = useState<boolean>(false);

  // Action Loading
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  // Preview / Print Modal
  const [previewInvoiceId, setPreviewInvoiceId] = useState<string | null>(null);
  const [previewContext, setPreviewContext] = useState<InvoicePreviewContext | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [switchingFormat, setSwitchingFormat] = useState<boolean>(false);
  const printAreaRef = useRef<HTMLDivElement | null>(null);

  // Email Modal
  const [emailInvoiceId, setEmailInvoiceId] = useState<string | null>(null);
  const [emailTo, setEmailTo] = useState<string>('');
  const [emailSubject, setEmailSubject] = useState<string>('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);

  const loadInvoices = async (runInitialAutoSync = false, onlyPreview = false) => {
    if (!onlyPreview) setLoading(true);
    setError(null);
    try {
      const previewMonthArg = selectedMonth !== 'ALL' ? selectedMonth : 'AUTO';
      if (onlyPreview) {
        const prevData = await fetchCRMBillingPreview(previewMonthArg).catch(() => null);
        if (prevData) setCrmPreview(prevData);
        return;
      }

      const [invData, prevData] = await Promise.all([
        fetchClientInvoices({ page_size: 1000 }),
        fetchCRMBillingPreview(previewMonthArg).catch(() => null)
      ]);
      setInvoices(invData);
      if (prevData) setCrmPreview(prevData);
      setLoading(false);

      const crmMismatchDraftExists = Boolean(
        prevData?.permanent_services?.some((p) => {
          if (!p.existing_invoice_id || p.existing_invoice_status !== 'DRAFT') return false;
          const inv = invData.find((i) => String(i.id) === String(p.existing_invoice_id));
          if (!inv || (inv.notes || '').includes('[MODE:ATTENDANCE_RATE]')) return false;
          const expected = Number(p.crm_total_invoice_amount ?? p.contract_monthly_rate ?? 0);
          return expected > 0 && Math.abs(Number(inv.grand_total || 0) - expected) > 0.5;
        })
      );

      // Non-blocking first-open sync: render existing invoices immediately and sync unbilled or mismatched CRM drafts
      if (
        runInitialAutoSync &&
        !initialAutoSyncedRef.current &&
        prevData &&
        (
          (prevData.summary?.unbilled_locations_count || 0) > 0 ||
          (prevData.summary?.unbilled_temp_count || 0) > 0 ||
          crmMismatchDraftExists
        )
      ) {
        initialAutoSyncedRef.current = true;
        setSyncingCRM(true);
        try {
          const syncRes = await autoSyncCRMInvoices({
            months: [prevData.previous_month, prevData.current_month].filter(Boolean),
            calculation_mode: 'CONTRACT_RATE',
            initial_status: 'DRAFT'
          });
          if (syncRes.created_count > 0 || (syncRes.updated_count || 0) > 0) {
            const [refInv, refPrev] = await Promise.all([
              fetchClientInvoices({
                billing_month: selectedMonth !== 'ALL' ? selectedMonth : undefined,
                page_size: 1000
              }),
              fetchCRMBillingPreview(previewMonthArg).catch(() => prevData)
            ]);
            setInvoices(refInv);
            if (refPrev) setCrmPreview(refPrev);
          }
        } catch {
          // Non-fatal: keep preview visible so user can trigger manual sync
        } finally {
          setSyncingCRM(false);
        }
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.response?.data?.detail || err.message || 'Failed to load client invoices.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const isInitial = !initialAutoSyncedRef.current && invoices.length === 0;
    loadInvoices(isInitial, !isInitial);
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
        res.created_count > 0 || (res.updated_count || 0) > 0
          ? `Synced CRM & Operations for ${res.months_synced.join(', ')}: ${res.created_count} created, ${res.updated_count || 0} draft(s) updated to exact CRM rates.`
          : `All active client locations and approved temporary services for ${res.months_synced.join(', ')} match CRM rates.`
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
            onClick={() => setIsTemplateEditorOpen(true)}
            style={{
              padding: '8px 14px',
              borderRadius: '6px',
              border: '1px solid var(--color-border, #cbd5e1)',
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <i className="bx bx-edit-alt" style={{ fontSize: '16px', color: '#0284c7' }}></i>
            <span>Edit Templates</span>
          </button>
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

        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
          Showing {filteredInvoices.length} of {invoices.length} invoice(s)
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
                    <div>PKR {Number(inv.grand_total).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                    {(() => {
                      const isCheque = (inv.notes || '').includes('[FMT:CHEQUE]') || (!(inv.notes || '').includes('[FMT:CASH]') && Number(inv.tax_amount || 0) > 0);
                      return (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await setInvoiceTemplateMode(inv.id, isCheque ? 'CASH' : 'CHEQUE');
                              loadInvoices(false);
                            } catch (err: any) {
                              alert(err?.response?.data?.error || err.message || 'Failed to update invoice format.');
                            }
                          }}
                          title="Click to switch between Cash (INVOICE) and Cheque (SALES TAX INVOICE) format"
                          style={{
                            marginTop: '4px',
                            padding: '2px 7px',
                            borderRadius: '10px',
                            border: 'none',
                            fontSize: '10.5px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            background: isCheque ? 'rgba(2, 132, 199, 0.14)' : 'rgba(15, 23, 42, 0.08)',
                            color: isCheque ? '#0284c7' : '#334155'
                          }}
                        >
                          {isCheque ? 'Cheque / Sales Tax' : 'Cash Invoice'}
                        </button>
                      );
                    })()}
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
            <div
              style={{
                padding: '12px 20px',
                background: '#f8fafc',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '10px',
                flexWrap: 'wrap'
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '15px', color: '#1e293b' }}>
                Invoice Preview — {previewContext?.invoice?.invoice_number || previewContext?.invoice_number || ''}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {previewInvoiceId && previewContext && (
                  <div
                    style={{
                      display: 'inline-flex',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      overflow: 'hidden',
                      background: '#ffffff'
                    }}
                  >
                    <button
                      type="button"
                      disabled={switchingFormat}
                      onClick={async () => {
                        setSwitchingFormat(true);
                        try {
                          const updated = await setInvoiceTemplateMode(previewInvoiceId, 'CASH');
                          setPreviewContext(updated);
                          loadInvoices(false);
                        } catch (err: any) {
                          alert(err?.response?.data?.error || err.message || 'Failed to switch template format.');
                        } finally {
                          setSwitchingFormat(false);
                        }
                      }}
                      style={{
                        padding: '6px 12px',
                        border: 'none',
                        background: previewContext.template_mode === 'CASH' ? '#0f172a' : '#ffffff',
                        color: previewContext.template_mode === 'CASH' ? '#ffffff' : '#334155',
                        fontWeight: 600,
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      Cash (INVOICE)
                    </button>
                    <button
                      type="button"
                      disabled={switchingFormat}
                      onClick={async () => {
                        setSwitchingFormat(true);
                        try {
                          const updated = await setInvoiceTemplateMode(previewInvoiceId, 'CHEQUE');
                          setPreviewContext(updated);
                          loadInvoices(false);
                        } catch (err: any) {
                          alert(err?.response?.data?.error || err.message || 'Failed to switch template format.');
                        } finally {
                          setSwitchingFormat(false);
                        }
                      }}
                      style={{
                        padding: '6px 12px',
                        border: 'none',
                        borderLeft: '1px solid #cbd5e1',
                        background: previewContext.template_mode === 'CHEQUE' ? '#0284c7' : '#ffffff',
                        color: previewContext.template_mode === 'CHEQUE' ? '#ffffff' : '#334155',
                        fontWeight: 600,
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      Cheque (SALES TAX)
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setIsTemplateEditorOpen(true)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#0284c7',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  Edit Template
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const el = printAreaRef.current;
                    if (!el) {
                      window.print();
                      return;
                    }
                    const iframe = document.createElement('iframe');
                    iframe.style.position = 'fixed';
                    iframe.style.right = '0';
                    iframe.style.bottom = '0';
                    iframe.style.width = '0';
                    iframe.style.height = '0';
                    iframe.style.border = '0';
                    document.body.appendChild(iframe);
                    const doc = iframe.contentWindow?.document;
                    if (doc) {
                      doc.open();
                      doc.write(
                        `<!DOCTYPE html><html><head><title>Invoice ${previewContext?.invoice?.invoice_number || previewContext?.invoice_number || ''}</title><style>@page{size:A4;margin:10mm;}body{margin:0;background:#fff;color:#0f172a;-webkit-print-color-adjust:exact;print-color-adjust:exact;}</style></head><body>${el.innerHTML}</body></html>`
                      );
                      doc.close();
                      setTimeout(() => {
                        iframe.contentWindow?.focus();
                        iframe.contentWindow?.print();
                        setTimeout(() => document.body.removeChild(iframe), 1000);
                      }, 150);
                    }
                  }}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#0f172a',
                    color: '#ffffff',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  Print / Save PDF
                </button>
                <button
                  type="button"
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
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px', background: '#cbd5e1' }}>
              {previewLoading || !previewContext ? (
                <div style={{ textAlign: 'center', padding: '60px', color: '#334155', background: '#ffffff', borderRadius: '8px' }}>
                  Loading invoice preview...
                </div>
              ) : (
                <div ref={printAreaRef} style={{ boxShadow: '0 8px 24px rgba(15,23,42,0.18)', background: '#ffffff' }}>
                  <InvoiceDocumentSheet context={previewContext} />
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

      {/* Multi-Tenant Cash & Cheque Invoice Template Editor Modal */}
      <InvoiceTemplateEditorModal
        isOpen={isTemplateEditorOpen}
        onClose={() => setIsTemplateEditorOpen(false)}
        onSaved={async () => {
          if (previewInvoiceId) {
            try {
              const updatedCtx = await fetchClientInvoicePreviewContext(previewInvoiceId);
              setPreviewContext(updatedCtx);
            } catch {
              // Ignore if preview closed concurrently
            }
          }
        }}
      />
    </div>
  );
};
