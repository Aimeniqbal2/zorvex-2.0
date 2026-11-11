import React, { useState, useEffect } from 'react';
import {
  fetchCRMBillingPreview,
  generateClientInvoiceFromCRM
} from '../api';
import type { CRMInvoiceServiceItem, CRMBillingPreviewResponse } from '../api';

interface CRMInvoicingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface SiteServiceConfig {
  siteId: string;
  siteName: string;
  contractId?: string;
  contractCode?: string;
  included: boolean;
  calcMode: 'CONTRACT_RATE' | 'ATTENDANCE_RATE';
  contractMonthlyRate: number;
  fulfilledShifts: number;
  guardDailyBillRate: number;
  salesTaxBasis: string;
  salesTaxAmount: number;
  attendanceTaxAmount: number;
  existingInvoiceNumber?: string | null;
  existingInvoiceStatus?: string | null;
  loadingAttendance: boolean;
}

interface TempServiceConfig {
  id: string;
  title: string;
  venue: string;
  dateStr: string;
  amount: number;
  included: boolean;
  existingInvoiceNumber?: string | null;
}

export const CRMInvoicingModal: React.FC<CRMInvoicingModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const todayStr = now.toISOString().split('T')[0];
  const defaultDueDate = new Date(now.getTime() + 15 * 86400000).toISOString().split('T')[0];

  const [previewData, setPreviewData] = useState<CRMBillingPreviewResponse | null>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [billingMonth, setBillingMonth] = useState<string>('');
  const [invoiceDate, setInvoiceDate] = useState<string>(todayStr);
  const [dueDate, setDueDate] = useState<string>(defaultDueDate);
  const [paymentTerms, setPaymentTerms] = useState<string>('NET_30');
  const [taxRate, setTaxRate] = useState<number>(0);
  const [taxOverrideEdited, setTaxOverrideEdited] = useState<boolean>(false);
  const [templateMode, setTemplateMode] = useState<'AUTO' | 'CASH' | 'CHEQUE'>('AUTO');
  const [groupBy, setGroupBy] = useState<'PER_LOCATION' | 'CONSOLIDATED'>('PER_LOCATION');
  const [initialStatus, setInitialStatus] = useState<'DRAFT' | 'ISSUED'>('DRAFT');

  // Loaded Services State
  const [siteConfigs, setSiteConfigs] = useState<SiteServiceConfig[]>([]);
  const [tempConfigs, setTempConfigs] = useState<TempServiceConfig[]>([]);
  const [loadingServices, setLoadingServices] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch full CRM + Operations preview whenever modal opens or billingMonth changes
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    const loadPreview = async () => {
      setLoadingServices(true);
      setErrorMessage(null);
      try {
        const res = await fetchCRMBillingPreview(billingMonth || 'AUTO');
        if (!isMounted) return;
        setPreviewData(res);
        setClients(res.clients || []);
        if (!billingMonth && res.billing_month) {
          setBillingMonth(res.billing_month);
        }
        if (res.clients && res.clients.length > 0) {
          const validSelected = res.clients.some((c) => c.id === selectedClientId);
          if (!selectedClientId || !validSelected) {
            setSelectedClientId(res.clients[0].id);
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setErrorMessage(err?.response?.data?.error || err.message || 'Failed to load CRM & Operations billing data.');
        }
      } finally {
        if (isMounted) setLoadingServices(false);
      }
    };
    loadPreview();
    return () => {
      isMounted = false;
    };
  }, [isOpen, billingMonth]);

  // Filter sites & temporary services from preview when selectedClientId or previewData changes
  useEffect(() => {
    if (!previewData || !selectedClientId) {
      setSiteConfigs([]);
      setTempConfigs([]);
      return;
    }

    const clientPermSites = (previewData.permanent_services || []).filter(
      (s) => String(s.client_id) === String(selectedClientId)
    );

    const configs: SiteServiceConfig[] = clientPermSites.map((s) => ({
      siteId: s.site_id,
      siteName: s.site_name,
      contractId: s.contract_id || undefined,
      contractCode: s.contract_code || 'CRM-CONTRACT',
      included: !s.existing_invoice_id,
      calcMode: 'CONTRACT_RATE',
      contractMonthlyRate: Number(s.contract_monthly_rate || 0),
      fulfilledShifts: Number(s.fulfilled_shifts || 0),
      guardDailyBillRate: Number(s.guard_daily_bill_rate || 0),
      salesTaxBasis: s.sales_tax_basis || 'MANUAL',
      salesTaxAmount: Number(s.sales_tax_amount || 0),
      attendanceTaxAmount: Number(s.attendance_tax_amount || 0),
      existingInvoiceNumber: s.existing_invoice_number,
      existingInvoiceStatus: s.existing_invoice_status,
      loadingAttendance: false
    }));
    setSiteConfigs(configs);
    setTaxOverrideEdited(false);

    if (clientPermSites.length > 0) {
      setTaxRate(Number(clientPermSites[0].tax_rate || 0));
      if (clientPermSites[0].payment_terms) setPaymentTerms(clientPermSites[0].payment_terms);
    } else {
      setTaxRate(0);
    }

    const clientTemp = (previewData.temporary_services || [])
      .filter((t) => String(t.client_id) === String(selectedClientId))
      .map((t) => ({
        id: t.temporary_service_id,
        title: t.title,
        venue: t.venue,
        dateStr: t.date_str,
        amount: Number(t.amount || 0),
        included: !t.existing_invoice_id && ['APPROVED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(t.status),
        existingInvoiceNumber: t.existing_invoice_number
      }));
    setTempConfigs(clientTemp);
  }, [previewData, selectedClientId]);

  // Update a site configuration
  const handleUpdateSite = (idx: number, updates: Partial<SiteServiceConfig>) => {
    setSiteConfigs((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], ...updates };
      return copy;
    });
  };

  // Update a temporary service configuration
  const handleUpdateTemp = (idx: number, included: boolean) => {
    setTempConfigs((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], included };
      return copy;
    });
  };

  // Calculate live preview totals
  const subtotal = siteConfigs.reduce((acc, site) => {
    if (!site.included) return acc;
    if (site.calcMode === 'CONTRACT_RATE') {
      return acc + site.contractMonthlyRate;
    } else {
      return acc + (site.fulfilledShifts * site.guardDailyBillRate);
    }
  }, 0) + tempConfigs.reduce((acc, t) => {
    return t.included ? acc + t.amount : acc;
  }, 0);

  const crmCalculatedTax = siteConfigs.reduce((acc, site) => {
    if (!site.included) return acc;
    return acc + (site.calcMode === 'CONTRACT_RATE' ? site.salesTaxAmount : site.attendanceTaxAmount);
  }, 0);

  const taxAmount = taxOverrideEdited
    ? Math.round((subtotal * taxRate) / 100)
    : Number(crmCalculatedTax.toFixed(2));
  const grandTotal = subtotal + taxAmount;

  const handleGenerateInvoices = async () => {
    if (!selectedClientId) {
      alert('Please select a client.');
      return;
    }

    const servicesToInvoice: CRMInvoiceServiceItem[] = [];

    // Permanent Sites
    siteConfigs.forEach((s) => {
      if (s.included) {
        servicesToInvoice.push({
          type: 'PERMANENT',
          site_id: s.siteId,
          site_name: s.siteName,
          contract_id: s.contractId,
          calculation_mode: s.calcMode,
          contract_monthly_rate: s.contractMonthlyRate,
          fulfilled_shifts: s.fulfilledShifts,
          guard_daily_bill_rate: s.guardDailyBillRate,
          sales_tax_amount: taxOverrideEdited
            ? undefined
            : (s.calcMode === 'CONTRACT_RATE' ? s.salesTaxAmount : s.attendanceTaxAmount)
        });
      }
    });

    // Temporary Services
    tempConfigs.forEach((t) => {
      if (t.included) {
        servicesToInvoice.push({
          type: 'TEMPORARY',
          temporary_service_id: t.id,
          temporary_title: t.title,
          temporary_amount: t.amount,
          calculation_mode: 'CONTRACT_RATE'
        });
      }
    });

    if (servicesToInvoice.length === 0) {
      alert('Please select at least one site or temporary service to invoice.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    try {
      const effectiveMonth = billingMonth || currentMonthStr;
      const res = await generateClientInvoiceFromCRM({
        client_id: selectedClientId,
        billing_month: effectiveMonth,
        invoice_date: invoiceDate,
        due_date: dueDate,
        payment_terms: paymentTerms,
        tax_rate: taxRate,
        template_mode: templateMode === 'AUTO' ? undefined : templateMode,
        group_by: groupBy,
        initial_status: initialStatus,
        services: servicesToInvoice
      });

      alert(`Success! Generated ${res.count} ${initialStatus === 'DRAFT' ? 'Draft' : 'Issued'} invoice(s) for ${effectiveMonth}.`);
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.response?.data?.error || err.message || 'Failed to generate CRM invoices.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
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
        zIndex: 1050,
        padding: '20px'
      }}
    >
      <div
        style={{
          background: 'var(--color-surface, #ffffff)',
          color: 'var(--color-text, #0f172a)',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          width: '100%',
          maxWidth: '1000px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid var(--color-border, #e2e8f0)',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--color-border, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--color-surface-secondary, #f8fafc)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'rgba(2, 132, 199, 0.12)',
                color: '#0284c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px'
              }}
            >
              <i className="bx bx-receipt"></i>
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>
                Generate Client Invoices from CRM & Attendance
              </h2>
              <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--color-text-muted, #64748b)' }}>
                Automated monthly invoicing for permanent security locations and event temporary services.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '22px',
              cursor: 'pointer',
              color: 'var(--color-text-muted, #64748b)'
            }}
          >
            <i className="bx bx-x"></i>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {errorMessage && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '8px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#b91c1c',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <i className="bx bx-error-circle" style={{ fontSize: '18px' }}></i>
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Form Top Controls */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: '16px',
              background: 'var(--color-surface-secondary, #f8fafc)',
              padding: '16px',
              borderRadius: '12px',
              border: '1px solid var(--color-border, #e2e8f0)'
            }}
          >
            {/* Client Picker */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                Select Client <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border, #cbd5e1)',
                  fontSize: '13px',
                  background: 'var(--color-surface, #ffffff)',
                  color: 'inherit'
                }}
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || c.company_name || 'Client'} ({c.code || c.id.slice(0, 6)})
                  </option>
                ))}
              </select>
            </div>

            {/* Billing Month */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                Billing Month <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="month"
                value={billingMonth || currentMonthStr}
                onChange={(e) => setBillingMonth(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border, #cbd5e1)',
                  fontSize: '13px',
                  background: 'var(--color-surface, #ffffff)',
                  color: 'inherit'
                }}
              />
            </div>

            {/* Workflow Status Choice */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                Approval Workflow Stage
              </label>
              <select
                value={initialStatus}
                onChange={(e) => setInitialStatus(e.target.value as 'DRAFT' | 'ISSUED')}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border, #cbd5e1)',
                  fontSize: '13px',
                  background: 'var(--color-surface, #ffffff)',
                  color: 'inherit'
                }}
              >
                <option value="DRAFT">Save as Draft (Approve in Finance → AR)</option>
                <option value="ISSUED">Approve & Issue Immediately (Post to AR)</option>
              </select>
            </div>

            {/* Invoice Date */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                Invoice Date
              </label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border, #cbd5e1)',
                  fontSize: '13px',
                  background: 'var(--color-surface, #ffffff)',
                  color: 'inherit'
                }}
              />
            </div>

            {/* Due Date */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border, #cbd5e1)',
                  fontSize: '13px',
                  background: 'var(--color-surface, #ffffff)',
                  color: 'inherit'
                }}
              />
            </div>

            {/* Payment Terms */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                Payment Terms
              </label>
              <select
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border, #cbd5e1)',
                  fontSize: '13px',
                  background: 'var(--color-surface, #ffffff)',
                  color: 'inherit'
                }}
              >
                <option value="DUE_ON_RECEIPT">Due on Receipt</option>
                <option value="NET_15">Net 15 Days</option>
                <option value="NET_30">Net 30 Days</option>
                <option value="NET_45">Net 45 Days</option>
                <option value="NET_60">Net 60 Days</option>
              </select>
            </div>

            {/* Tax Rate & Invoice Template Mode */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                Sales Tax Rate (% {taxOverrideEdited ? 'Manual' : 'from CRM'})
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={taxRate}
                onChange={(e) => {
                  setTaxOverrideEdited(true);
                  setTaxRate(Number(e.target.value) || 0);
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border, #cbd5e1)',
                  fontSize: '13px',
                  background: 'var(--color-surface, #ffffff)',
                  color: 'inherit'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                Invoice Template Format
              </label>
              <select
                value={templateMode}
                onChange={(e) => setTemplateMode(e.target.value as 'AUTO' | 'CASH' | 'CHEQUE')}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border, #cbd5e1)',
                  fontSize: '13px',
                  background: 'var(--color-surface, #ffffff)',
                  color: 'inherit'
                }}
              >
                <option value="AUTO">Auto (Cash if 0 Tax, Cheque if Tax &gt; 0)</option>
                <option value="CASH">Cash — Standard INVOICE</option>
                <option value="CHEQUE">Cheque — SALES TAX INVOICE</option>
              </select>
            </div>

            {/* Invoicing Mode (Grouping) */}
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                Invoice Structure / Grouping
              </label>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="group_by"
                    checked={groupBy === 'PER_LOCATION'}
                    onChange={() => setGroupBy('PER_LOCATION')}
                  />
                  <span>
                    <strong>Separate Invoice Per Location</strong> (Individual invoice for each site)
                  </span>
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="group_by"
                    checked={groupBy === 'CONSOLIDATED'}
                    onChange={() => setGroupBy('CONSOLIDATED')}
                  />
                  <span>
                    <strong>Consolidated Invoice</strong> (Single monthly bill for all sites)
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Section: Permanent Sites & Rate Calculation */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className="bx bx-buildings" style={{ color: '#0284c7' }}></i>
                  Permanent Locations & Services
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--color-text-muted, #64748b)' }}>
                  Choose whether each site is billed at the <strong>Contract Monthly Rate</strong> or as per <strong>Delivered Shifts Attendance</strong>.
                </p>
              </div>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted, #64748b)' }}>
                {siteConfigs.filter((s) => s.included).length} of {siteConfigs.length} Sites Selected
              </span>
            </div>

            {loadingServices ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted, #64748b)' }}>
                <i className="bx bx-loader-alt bx-spin" style={{ fontSize: '24px', color: '#0284c7' }}></i>
                <p style={{ margin: '8px 0 0 0', fontSize: '13px' }}>Loading client locations and attendance register...</p>
              </div>
            ) : siteConfigs.length === 0 ? (
              <div
                style={{
                  padding: '20px',
                  borderRadius: '8px',
                  background: 'var(--color-surface-secondary, #f8fafc)',
                  textAlign: 'center',
                  color: 'var(--color-text-muted, #64748b)',
                  border: '1px dashed var(--color-border, #cbd5e1)',
                  fontSize: '13px'
                }}
              >
                No permanent operational sites linked to this client.
              </div>
            ) : (
              <div
                style={{
                  border: '1px solid var(--color-border, #e2e8f0)',
                  borderRadius: '10px',
                  overflow: 'hidden'
                }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                  <thead>
                    <tr style={{ background: 'var(--color-surface-secondary, #f8fafc)', borderBottom: '1px solid var(--color-border, #e2e8f0)' }}>
                      <th style={{ padding: '10px 14px', width: '36px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={siteConfigs.every((s) => s.included)}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setSiteConfigs((prev) => prev.map((s) => ({ ...s, included: checked })));
                          }}
                        />
                      </th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600 }}>Location / Site</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600 }}>Billing Calculation Mode</th>
                      <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600 }}>Attendance Shifts</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>Rate / Shift</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>Billable Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {siteConfigs.map((site, idx) => {
                      const amount =
                        site.calcMode === 'CONTRACT_RATE'
                          ? site.contractMonthlyRate
                          : site.fulfilledShifts * site.guardDailyBillRate;

                      return (
                        <tr
                          key={site.siteId}
                          style={{
                            borderBottom: '1px solid var(--color-border, #e2e8f0)',
                            opacity: site.included ? 1 : 0.45,
                            background: site.included ? 'transparent' : 'var(--color-surface-secondary, #f8fafc)'
                          }}
                        >
                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={site.included}
                              onChange={(e) => handleUpdateSite(idx, { included: e.target.checked })}
                            />
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ fontWeight: 600 }}>{site.siteName}</div>
                            <div style={{ fontSize: '11px', color: 'var(--color-text-muted, #64748b)' }}>
                              Contract: {site.contractCode}
                              {site.existingInvoiceNumber && (
                                <span style={{ marginLeft: '6px', color: '#0284c7', fontWeight: 600 }}>
                                  • Already Invoiced ({site.existingInvoiceNumber} - {site.existingInvoiceStatus})
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontSize: '12px' }}>
                                <input
                                  type="radio"
                                  name={`calc_mode_${site.siteId}`}
                                  checked={site.calcMode === 'CONTRACT_RATE'}
                                  onChange={() => handleUpdateSite(idx, { calcMode: 'CONTRACT_RATE' })}
                                  disabled={!site.included}
                                />
                                <span>Option 1: CRM Contract Rate</span>
                              </label>
                              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontSize: '12px' }}>
                                <input
                                  type="radio"
                                  name={`calc_mode_${site.siteId}`}
                                  checked={site.calcMode === 'ATTENDANCE_RATE'}
                                  onChange={() => handleUpdateSite(idx, { calcMode: 'ATTENDANCE_RATE' })}
                                  disabled={!site.included}
                                />
                                <span style={{ color: '#0284c7', fontWeight: 600 }}>Option 2: Attendance Wise</span>
                              </label>
                            </div>
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                            {site.loadingAttendance ? (
                              <i className="bx bx-loader-alt bx-spin" style={{ color: '#0284c7' }}></i>
                            ) : (
                              <span
                                style={{
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  background: site.fulfilledShifts > 0 ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                  color: site.fulfilledShifts > 0 ? '#16a34a' : '#ef4444',
                                  fontWeight: 600,
                                  fontSize: '11.5px'
                                }}
                              >
                                {site.fulfilledShifts} Shifts
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                            {site.calcMode === 'ATTENDANCE_RATE' ? (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Rs</span>
                                <input
                                  type="number"
                                  value={site.guardDailyBillRate}
                                  onChange={(e) => handleUpdateSite(idx, { guardDailyBillRate: Number(e.target.value) || 0 })}
                                  disabled={!site.included}
                                  style={{
                                    width: '80px',
                                    padding: '4px 6px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--color-border, #cbd5e1)',
                                    textAlign: 'right',
                                    fontSize: '12px'
                                  }}
                                />
                              </div>
                            ) : (
                              <span style={{ color: 'var(--color-text-muted)' }}>Fixed Monthly</span>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#0284c7' }}>
                            Rs {amount.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section: Temporary Event Services */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className="bx bx-calendar-event" style={{ color: '#8b5cf6' }}></i>
                  Temporary & Event Services (TSR)
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--color-text-muted, #64748b)' }}>
                  Direct event security deployments, protocol escort vehicles, and screening equipment.
                </p>
              </div>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted, #64748b)' }}>
                {tempConfigs.filter((t) => t.included).length} of {tempConfigs.length} TSR Selected
              </span>
            </div>

            {tempConfigs.length === 0 ? (
              <div
                style={{
                  padding: '16px',
                  borderRadius: '8px',
                  background: 'var(--color-surface-secondary, #f8fafc)',
                  textAlign: 'center',
                  color: 'var(--color-text-muted, #64748b)',
                  border: '1px dashed var(--color-border, #cbd5e1)',
                  fontSize: '12.5px'
                }}
              >
                No temporary services found for this client in {billingMonth}.
              </div>
            ) : (
              <div
                style={{
                  border: '1px solid var(--color-border, #e2e8f0)',
                  borderRadius: '10px',
                  overflow: 'hidden'
                }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                  <thead>
                    <tr style={{ background: 'var(--color-surface-secondary, #f8fafc)', borderBottom: '1px solid var(--color-border, #e2e8f0)' }}>
                      <th style={{ padding: '10px 14px', width: '36px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={tempConfigs.every((t) => t.included)}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setTempConfigs((prev) => prev.map((t) => ({ ...t, included: checked })));
                          }}
                        />
                      </th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600 }}>Event / Title</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600 }}>Venue Location</th>
                      <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600 }}>Date</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>Bill Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tempConfigs.map((t, idx) => (
                      <tr
                        key={t.id}
                        style={{
                          borderBottom: '1px solid var(--color-border, #e2e8f0)',
                          opacity: t.included ? 1 : 0.45
                        }}
                      >
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={t.included}
                            onChange={(e) => handleUpdateTemp(idx, e.target.checked)}
                          />
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 600 }}>{t.title}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--color-text-muted)' }}>{t.venue}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>{t.dateStr}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#8b5cf6' }}>
                          Rs {t.amount.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Live Calculations Summary Box */}
          <div
            style={{
              padding: '16px 20px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.05), rgba(139, 92, 246, 0.05))',
              border: '1px solid rgba(2, 132, 199, 0.2)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '16px'
            }}
          >
            <div>
              <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                Live Invoicing Calculation Summary
              </span>
              <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '3px' }}>
                Mode: <strong>{groupBy === 'PER_LOCATION' ? 'Separate Invoices Per Location' : 'Single Consolidated Client Bill'}</strong>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Services Subtotal</div>
                <div style={{ fontSize: '15px', fontWeight: 600 }}>Rs {subtotal.toLocaleString()}</div>
              </div>
              {taxAmount > 0 && (
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                    Sales Tax {taxOverrideEdited ? `(${taxRate}%)` : '(CRM Formula)'}
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: '#eab308' }}>Rs {taxAmount.toLocaleString()}</div>
                </div>
              )}
              <div
                style={{
                  paddingLeft: '16px',
                  borderLeft: '2px solid var(--color-border, #cbd5e1)'
                }}
              >
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Grand Invoiced Total</div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#16a34a' }}>
                  Rs {grandTotal.toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--color-border, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '12px',
            background: 'var(--color-surface-secondary, #f8fafc)'
          }}
        >
          <button
            onClick={onClose}
            disabled={submitting}
            style={{
              padding: '9px 18px',
              borderRadius: '8px',
              border: '1px solid var(--color-border, #cbd5e1)',
              background: 'var(--color-surface, #ffffff)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>

          <button
            onClick={handleGenerateInvoices}
            disabled={submitting || (siteConfigs.filter((s) => s.included).length === 0 && tempConfigs.filter((t) => t.included).length === 0)}
            style={{
              padding: '9px 22px',
              borderRadius: '8px',
              border: 'none',
              background: '#0284c7',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 600,
              cursor: submitting ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 2px 6px rgba(2, 132, 199, 0.4)'
            }}
          >
            {submitting ? (
              <>
                <i className="bx bx-loader-alt bx-spin"></i>
                <span>Generating Invoices...</span>
              </>
            ) : (
              <>
                <i className="bx bx-check-circle"></i>
                <span>Generate Official Client Invoice(s)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

