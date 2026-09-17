import React, { useState, useEffect } from 'react';
import type {
  BillingSheet,
  BillingSheetStatus
} from '../api';
import {
  fetchBillingSheets,
  fetchServiceContracts,
  buildBillingSheetFromContract
} from '../api';
import { BillingSheetWorkspaceModal } from './BillingSheetWorkspaceModal';

export const BillingSheetsTab: React.FC = () => {
  const [sheets, setSheets] = useState<BillingSheet[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [monthFilter, setMonthFilter] = useState<string>('');

  // Selected sheet for workspace modal
  const [selectedSheetId, setSelectedSheetId] = useState<string | null>(null);

  // New Sheet Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [contracts, setContracts] = useState<any[]>([]);
  const [selectedContractId, setSelectedContractId] = useState<string>('');
  const [periodStart, setPeriodStart] = useState<string>('');
  const [periodEnd, setPeriodEnd] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [creating, setCreating] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadSheets = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchBillingSheets();
      setSheets(data);
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Failed to load billing sheets.');
    } finally {
      setLoading(false);
    }
  };

  const loadContracts = async () => {
    try {
      const data = await fetchServiceContracts({ status: 'ACTIVE' });
      setContracts(data);
    } catch (err) {
      console.error('Failed to load contracts', err);
    }
  };

  useEffect(() => {
    loadSheets();
    loadContracts();
  }, []);

  const handleOpenCreateModal = () => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
    setPeriodStart(firstDay);
    setPeriodEnd(lastDay);
    setSelectedContractId(contracts[0]?.id || '');
    setNotes('');
    setCreateError(null);
    setIsCreateModalOpen(true);
  };

  const handleCreateSheet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContractId || !periodStart || !periodEnd) {
      setCreateError('Please select a contract and specify period start and end dates.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const newSheet = await buildBillingSheetFromContract({
        contract_id: selectedContractId,
        period_start: periodStart,
        period_end: periodEnd,
        notes
      });
      setIsCreateModalOpen(false);
      await loadSheets();
      setSelectedSheetId(newSheet.id);
    } catch (err: any) {
      setCreateError(err?.response?.data?.error || err.message || 'Failed to generate billing sheet.');
    } finally {
      setCreating(false);
    }
  };

  const filteredSheets = sheets.filter((sheet) => {
    const matchesSearch =
      (sheet.sheet_number && sheet.sheet_number.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (sheet.client_name && sheet.client_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (sheet.contract_code && sheet.contract_code.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === 'ALL' || sheet.status === statusFilter;
    const matchesMonth = !monthFilter || sheet.billing_month === monthFilter;
    return matchesSearch && matchesStatus && matchesMonth;
  });

  const getStatusBadge = (status: BillingSheetStatus) => {
    switch (status) {
      case 'DRAFT':
        return <span style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, background: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8' }}>DRAFT</span>;
      case 'UNDER_REVIEW':
        return <span style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, background: 'rgba(234, 179, 8, 0.15)', color: '#eab308' }}>UNDER REVIEW</span>;
      case 'APPROVED':
        return <span style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e' }}>APPROVED</span>;
      case 'INVOICED':
        return <span style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' }}>INVOICED</span>;
      case 'CANCELLED':
        return <span style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}>CANCELLED</span>;
      default:
        return <span>{status}</span>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
            Client Billing Sheets
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--color-text-muted)' }}>
            Authoritative pre-invoice billing calculation from contract rates and field deployments.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={loadSheets}
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
          <button
            onClick={handleOpenCreateModal}
            style={{
              padding: '8px 18px',
              borderRadius: '6px',
              border: 'none',
              background: 'var(--color-primary, #0284c7)',
              color: '#ffffff',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>+</span> Generate Billing Sheet
          </button>
        </div>
      </div>

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
            placeholder="Search by sheet #, client, contract..."
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
            <option value="UNDER_REVIEW">Under Review</option>
            <option value="APPROVED">Approved</option>
            <option value="INVOICED">Invoiced</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>

        <div>
          <input
            type="month"
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            style={{
              padding: '7px 12px',
              borderRadius: '6px',
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg)',
              color: 'var(--color-text)',
              fontSize: '13px'
            }}
          />
        </div>

        {monthFilter && (
          <button
            onClick={() => setMonthFilter('')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-primary, #0284c7)',
              cursor: 'pointer',
              fontSize: '12px',
              textDecoration: 'underline'
            }}
          >
            Clear Month
          </button>
        )}
      </div>

      {/* Sheets List Table */}
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
            Loading billing sheets...
          </div>
        ) : error ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#ef4444' }}>{error}</div>
        ) : filteredSheets.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            No billing sheets found matching criteria. Click <strong>Generate Billing Sheet</strong> to create one.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'var(--color-bg-subtle, rgba(0,0,0,0.03))', borderBottom: '1px solid var(--color-border)' }}>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Sheet #</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Client</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Contract</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Period</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Base Subtotal</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Total Amount</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Status</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSheets.map((sheet) => (
                <tr
                  key={sheet.id}
                  style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }}
                  onClick={() => setSelectedSheetId(sheet.id)}
                >
                  <td style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--color-primary, #0284c7)' }}>
                    {sheet.sheet_number}
                  </td>
                  <td style={{ padding: '14px 16px', fontWeight: 500, color: 'var(--color-text)' }}>
                    {sheet.client_name || 'Client'}
                  </td>
                  <td style={{ padding: '14px 16px', color: 'var(--color-text-muted)' }}>
                    {sheet.contract_code || 'Contract'}
                  </td>
                  <td style={{ padding: '14px 16px', color: 'var(--color-text-muted)' }}>
                    {sheet.period_start} → {sheet.period_end}
                  </td>
                  <td style={{ padding: '14px 16px', color: 'var(--color-text)' }}>
                    PKR {Number(sheet.subtotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--color-text)' }}>
                    PKR {Number(sheet.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '14px 16px' }}>{getStatusBadge(sheet.status)}</td>
                  <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedSheetId(sheet.id);
                      }}
                      style={{
                        padding: '5px 12px',
                        borderRadius: '5px',
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-surface)',
                        color: 'var(--color-text)',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 500
                      }}
                    >
                      Open Workspace →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal: Generate Billing Sheet */}
      {isCreateModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px'
          }}
        >
          <div
            style={{
              background: 'var(--color-surface)',
              borderRadius: '10px',
              border: '1px solid var(--color-border)',
              width: '100%',
              maxWidth: '520px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
              overflow: 'hidden'
            }}
          >
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: 'var(--color-text)' }}>
                Generate Client Billing Sheet
              </h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--color-text-muted)' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSheet} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {createError && (
                <div style={{ padding: '10px 14px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '6px', fontSize: '13px' }}>
                  {createError}
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--color-text-muted)' }}>
                  Active Security Contract *
                </label>
                <select
                  value={selectedContractId}
                  onChange={(e) => setSelectedContractId(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-bg)',
                    color: 'var(--color-text)',
                    fontSize: '13px'
                  }}
                >
                  <option value="">Select Contract</option>
                  {contracts.map((ctr) => (
                    <option key={ctr.id} value={ctr.id}>
                      {ctr.contract_code} — {ctr.crm_entity_name || ctr.crm_entity?.name || 'Client'}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--color-text-muted)' }}>
                    Period Start Date *
                  </label>
                  <input
                    type="date"
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    required
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
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--color-text-muted)' }}>
                    Period End Date *
                  </label>
                  <input
                    type="date"
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    required
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
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--color-text-muted)' }}>
                  Notes / Billing Instructions
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="e.g. Regular monthly guarding billing as per master contract schedule."
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

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface)',
                    color: 'var(--color-text)',
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  style={{
                    padding: '8px 20px',
                    borderRadius: '6px',
                    border: 'none',
                    background: 'var(--color-primary, #0284c7)',
                    color: '#ffffff',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 600
                  }}
                >
                  {creating ? 'Building...' : 'Pull Activity & Create Sheet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sheet Workspace Modal */}
      {selectedSheetId && (
        <BillingSheetWorkspaceModal
          sheetId={selectedSheetId}
          onClose={() => {
            setSelectedSheetId(null);
            loadSheets();
          }}
          onSheetUpdated={loadSheets}
        />
      )}
    </div>
  );
};
