import React, { useState, useEffect } from 'react';
import {
  fetchFiscalYears,
  createFiscalYear,
  fetchAccountingPeriods,
  setPeriodStatus,
  checkDatePeriod,
} from '../api';
import type {
  FiscalYear,
  AccountingPeriod,
  PeriodStatus,
  PeriodCheckResult,
} from '../api';

const STATUS_CONFIG: Record<PeriodStatus, { label: string; bg: string; text: string; border: string; desc: string }> = {
  OPEN: {
    label: 'Open',
    bg: 'rgba(34, 197, 94, 0.15)',
    text: '#4ade80',
    border: 'rgba(34, 197, 94, 0.3)',
    desc: 'Normal transactions can be posted without restriction.',
  },
  SOFT_CLOSED: {
    label: 'Soft Closed',
    bg: 'rgba(234, 179, 8, 0.15)',
    text: '#fde047',
    border: 'rgba(234, 179, 8, 0.3)',
    desc: 'Ordinary postings are blocked. Only authorized adjusting entries are permitted.',
  },
  CLOSED: {
    label: 'Closed',
    bg: 'rgba(239, 68, 68, 0.15)',
    text: '#f87171',
    border: 'rgba(239, 68, 68, 0.3)',
    desc: 'All postings are strictly prohibited.',
  },
  LOCKED: {
    label: 'Locked',
    bg: 'rgba(148, 163, 184, 0.15)',
    text: '#cbd5e1',
    border: 'rgba(148, 163, 184, 0.3)',
    desc: 'Period is permanently locked for year-end auditing.',
  },
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const AccountingPeriodsTab: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([]);
  const [selectedFYId, setSelectedFYId] = useState<string>('');
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);

  // Fiscal Year Modal
  const [fyModalOpen, setFyModalOpen] = useState<boolean>(false);
  const [fyForm, setFyForm] = useState({ name: '', start_date: '', end_date: '', is_current: true });

  // Period Status Change Modal
  const [statusModalOpen, setStatusModalOpen] = useState<boolean>(false);
  const [selectedPeriod, setSelectedPeriod] = useState<AccountingPeriod | null>(null);
  const [newStatus, setNewStatus] = useState<PeriodStatus>('OPEN');
  const [updatingStatus, setUpdatingStatus] = useState<boolean>(false);

  // Date Check Sandbox
  const [testDate, setTestDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [isAdj, setIsAdj] = useState<boolean>(false);
  const [checkResult, setCheckResult] = useState<PeriodCheckResult | null>(null);

  const loadFiscalYears = async () => {
    setLoading(true);
    try {
      const fys = await fetchFiscalYears();
      setFiscalYears(fys);
      if (fys.length > 0) {
        const current = fys.find((f) => f.is_current) || fys[0];
        setSelectedFYId(current.id);
      }
    } catch (err) {
      console.error('Failed to load fiscal years', err);
    } finally {
      setLoading(false);
    }
  };

  const loadPeriods = async (fyId: string) => {
    if (!fyId) return;
    try {
      const pers = await fetchAccountingPeriods({ fiscal_year: fyId });
      setPeriods(pers);
    } catch (err) {
      console.error('Failed to load periods', err);
    }
  };

  useEffect(() => {
    loadFiscalYears();
  }, []);

  useEffect(() => {
    if (selectedFYId) {
      loadPeriods(selectedFYId);
    }
  }, [selectedFYId]);

  const handleCreateFY = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await createFiscalYear(fyForm);
      setFyModalOpen(false);
      await loadFiscalYears();
      setSelectedFYId(created.id);
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to create fiscal year.');
    }
  };

  const handleOpenStatusModal = (p: AccountingPeriod) => {
    setSelectedPeriod(p);
    setNewStatus(p.status);
    setStatusModalOpen(true);
  };

  const handleUpdateStatus = async () => {
    if (!selectedPeriod) return;
    setUpdatingStatus(true);
    try {
      await setPeriodStatus(selectedPeriod.id, newStatus);
      setStatusModalOpen(false);
      await loadPeriods(selectedFYId);
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to update period status.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleValidateDate = async () => {
    if (!testDate) return;
    try {
      const res = await checkDatePeriod(testDate, isAdj);
      setCheckResult(res);
    } catch (err: any) {
      setCheckResult({
        can_post: false,
        message: err?.response?.data?.detail || 'Date check error',
        period: null,
      });
    }
  };

  const selectedFY = fiscalYears.find((f) => f.id === selectedFYId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Header & Year Selector */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px',
          background: 'var(--color-surface, #1e293b)',
          padding: '18px 24px',
          borderRadius: '12px',
          border: '1px solid var(--color-border, rgba(255,255,255,0.06))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
              Active Fiscal Year
            </label>
            <select
              value={selectedFYId}
              onChange={(e) => setSelectedFYId(e.target.value)}
              style={{
                padding: '8px 14px',
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '8px',
                color: '#f8fafc',
                fontSize: '14px',
                fontWeight: 600,
                minWidth: '200px',
              }}
            >
              {fiscalYears.map((fy) => (
                <option key={fy.id} value={fy.id}>
                  {fy.name} {fy.is_current ? '★ (Current)' : ''}
                </option>
              ))}
            </select>
          </div>

          {selectedFY && (
            <div style={{ fontSize: '13px', color: '#94a3b8', borderLeft: '1px solid #334155', paddingLeft: '16px' }}>
              Date Range: <strong style={{ color: '#f8fafc' }}>{selectedFY.start_date}</strong> to{' '}
              <strong style={{ color: '#f8fafc' }}>{selectedFY.end_date}</strong>
              <div style={{ fontSize: '11px', color: selectedFY.is_closed ? '#f87171' : '#4ade80', marginTop: '2px' }}>
                {selectedFY.is_closed ? '🔒 Fiscal Year Closed' : '🟢 Open for Accounting Periods'}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => {
            const yr = new Date().getFullYear() + 1;
            setFyForm({
              name: `FY-${yr}`,
              start_date: `${yr}-01-01`,
              end_date: `${yr}-12-31`,
              is_current: false,
            });
            setFyModalOpen(true);
          }}
          style={{
            padding: '8px 16px',
            background: '#334155',
            color: '#f8fafc',
            border: 'none',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          ＋ New Fiscal Year
        </button>
      </div>

      {/* Monthly Periods Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#f8fafc' }}>
          Monthly Accounting Periods ({periods.length})
        </h3>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>Loading periods...</div>
        ) : periods.length === 0 ? (
          <div
            style={{
              padding: '30px',
              textAlign: 'center',
              background: 'var(--color-surface, #1e293b)',
              borderRadius: '10px',
              color: '#94a3b8',
            }}
          >
            No accounting periods found for this fiscal year.
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: '14px',
            }}
          >
            {periods.map((p) => {
              const cfg = STATUS_CONFIG[p.status] || STATUS_CONFIG.OPEN;
              const monthLabel = MONTH_NAMES[(p.period_number || p.month) - 1] || `Period ${p.period_number}`;

              return (
                <div
                  key={p.id}
                  style={{
                    background: 'var(--color-surface, #1e293b)',
                    padding: '16px',
                    borderRadius: '10px',
                    border: '1px solid var(--color-border, rgba(255,255,255,0.06))',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '12px',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '15px', fontWeight: 700, color: '#f8fafc' }}>
                        #{p.period_number || p.month} — {monthLabel}
                      </span>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: cfg.bg,
                          color: cfg.text,
                          border: `1px solid ${cfg.border}`,
                        }}
                      >
                        {cfg.label}
                      </span>
                    </div>

                    <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '6px' }}>
                      {p.start_date} → {p.end_date}
                    </div>

                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px', lineHeight: '1.4' }}>
                      {cfg.desc}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                    <button
                      onClick={() => handleOpenStatusModal(p)}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        background: 'rgba(59, 130, 246, 0.15)',
                        color: '#60a5fa',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Change Status →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Date Posting Verification Sandbox */}
      <div
        style={{
          background: 'var(--color-surface, #1e293b)',
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid var(--color-border, rgba(255,255,255,0.06))',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px' }}>🔍</span>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#f8fafc' }}>
            Period Posting Guard Sandbox
          </h3>
        </div>
        <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
          Verify if an invoice, vendor bill, or voucher transaction dated on a specific date will be accepted by the general ledger posting service.
        </p>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="date"
            value={testDate}
            onChange={(e) => setTestDate(e.target.value)}
            style={{
              padding: '8px 12px',
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '6px',
              color: '#f8fafc',
              fontSize: '13px',
            }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#cbd5e1', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={isAdj}
              onChange={(e) => setIsAdj(e.target.checked)}
            />
            Adjustment Entry
          </label>
          <button
            onClick={handleValidateDate}
            style={{
              padding: '8px 16px',
              background: '#3b82f6',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Check Posting Permission
          </button>
        </div>

        {checkResult && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              background: checkResult.can_post ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
              border: `1px solid ${checkResult.can_post ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              color: checkResult.can_post ? '#86efac' : '#fca5a5',
              fontSize: '13px',
            }}
          >
            <strong>{checkResult.can_post ? 'Posting Allowed: ' : 'Posting Prohibited: '}</strong>
            {checkResult.message}
          </div>
        )}
      </div>

      {/* Period Status Modal */}
      {statusModalOpen && selectedPeriod && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
        >
          <div
            style={{
              background: '#1e293b',
              borderRadius: '12px',
              border: '1px solid #334155',
              width: '100%',
              maxWidth: '440px',
              padding: '24px',
            }}
          >
            <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#f8fafc' }}>
              Set Period #{selectedPeriod.period_number} Status
            </h3>
            <p style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '16px' }}>
              {selectedPeriod.start_date} to {selectedPeriod.end_date}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              {(['OPEN', 'SOFT_CLOSED', 'CLOSED'] as PeriodStatus[]).map((st) => {
                const conf = STATUS_CONFIG[st];
                const isSelected = newStatus === st;
                return (
                  <div
                    key={st}
                    onClick={() => setNewStatus(st)}
                    style={{
                      padding: '12px',
                      borderRadius: '8px',
                      border: `1px solid ${isSelected ? conf.border : '#334155'}`,
                      background: isSelected ? conf.bg : '#0f172a',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: '13px', fontWeight: 600, color: isSelected ? conf.text : '#f8fafc' }}>
                      {conf.label}
                    </div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                      {conf.desc}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setStatusModalOpen(false)}
                style={{
                  padding: '8px 14px',
                  background: '#334155',
                  color: '#cbd5e1',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={updatingStatus}
                onClick={handleUpdateStatus}
                style={{
                  padding: '8px 16px',
                  background: '#3b82f6',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: updatingStatus ? 'not-allowed' : 'pointer',
                }}
              >
                {updatingStatus ? 'Saving...' : 'Apply Status'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fiscal Year Modal */}
      {fyModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
        >
          <div
            style={{
              background: '#1e293b',
              borderRadius: '12px',
              border: '1px solid #334155',
              width: '100%',
              maxWidth: '440px',
              padding: '24px',
            }}
          >
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#f8fafc' }}>
              Create Fiscal Year
            </h3>
            <form onSubmit={handleCreateFY} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                  Name *
                </label>
                <input
                  type="text"
                  required
                  value={fyForm.name}
                  onChange={(e) => setFyForm({ ...fyForm, name: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                    Start Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={fyForm.start_date}
                    onChange={(e) => setFyForm({ ...fyForm, start_date: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      background: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                    End Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={fyForm.end_date}
                    onChange={(e) => setFyForm({ ...fyForm, end_date: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      background: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setFyModalOpen(false)}
                  style={{
                    padding: '8px 14px',
                    background: '#334155',
                    color: '#cbd5e1',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '8px 16px',
                    background: '#3b82f6',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
