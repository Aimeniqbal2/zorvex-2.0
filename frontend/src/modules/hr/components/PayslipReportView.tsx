import React, { useEffect, useState } from 'react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { apiClient } from '../api';
import { LoadingState } from '../../../components/ui/LoadingState';
import { useToastStore } from '../../../stores/toastStore';
import { PayslipPrintModal, type PayslipPrintRow, type PayslipBranding } from './PayslipPrintModal';

interface SiteOption {
  id: string;
  name: string;
  client_id: string;
  client_name: string;
}

const fmtInt = (val: number | string | undefined | null) =>
  Math.round(Number(val || 0)).toLocaleString('en-PK');

const fmtPkr = (val: number | string | undefined | null) =>
  `Rs ${Math.round(Number(val || 0)).toLocaleString('en-PK')}`;

export const PayslipReportView: React.FC = () => {
  const [dateRangePreset, setDateRangePreset] = useState<string>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');
  const [employeeFrom, setEmployeeFrom] = useState<string>('');
  const [employeeTo, setEmployeeTo] = useState<string>('');
  const [siteId, setSiteId] = useState<string>('');
  const [region, setRegion] = useState<string>('');
  const [clientFilter, setClientFilter] = useState<string>('');
  const [monthFrom, setMonthFrom] = useState<string>('');
  const [monthTo, setMonthTo] = useState<string>('');
  const [isPaid, setIsPaid] = useState<string>('BOTH');
  const [isStopPayment, setIsStopPayment] = useState<string>('BOTH');
  const [modeOfPayment, setModeOfPayment] = useState<string>('ALL');
  const [allEmployees, setAllEmployees] = useState<boolean>(true);
  const [inMainPayroll, setInMainPayroll] = useState<boolean>(true);

  const [loading, setLoading] = useState<boolean>(false);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [paymentModes, setPaymentModes] = useState<string[]>([]);
  const [branding, setBranding] = useState<PayslipBranding>({});
  const [rows, setRows] = useState<PayslipPrintRow[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const [printRows, setPrintRows] = useState<PayslipPrintRow[]>([]);
  const [printTitle, setPrintTitle] = useState<string>('Pay Slips Preview');

  const buildParams = (overrideMonth?: string) => {
    const params: Record<string, string> = {
      is_paid: isPaid,
      is_stop_payment: isStopPayment,
      in_main_payroll: String(inMainPayroll),
    };
    const m = overrideMonth !== undefined ? overrideMonth : selectedMonth;
    if (m && m !== 'ALL') params.month = m;
    if (dateRangePreset && dateRangePreset !== 'ALL') params.date_range_preset = dateRangePreset;
    if (dateRangePreset === 'date_range') {
      if (monthFrom) params.date_from = monthFrom;
      if (monthTo) params.date_to = monthTo;
    }
    if (employeeFrom.trim()) params.employee_from = employeeFrom.trim();
    if (employeeTo.trim()) params.employee_to = employeeTo.trim();
    if (siteId.trim()) params.site_id = siteId.trim();
    if (region.trim()) params.region = region.trim();
    if (clientFilter.trim()) params.client_id = clientFilter.trim();
    if (modeOfPayment && modeOfPayment !== 'ALL') params.mode_of_payment = modeOfPayment;
    return params;
  };

  const fetchReport = async (overrideMonth?: string) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await apiClient.get('/api/hrm/payslips/report/', {
        params: buildParams(overrideMonth),
      });
      const data = resp.data || {};
      setBranding(data.branding || {});
      setAvailableMonths(data.available_months || []);
      setSites(data.sites || []);
      setPaymentModes(data.payment_modes || []);
      setRows(data.rows || []);
      setSummary(data.summary || null);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to load pay slips report.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport('ALL');
  }, []);

  const handleClear = () => {
    setDateRangePreset('ALL');
    setSelectedMonth('ALL');
    setEmployeeFrom('');
    setEmployeeTo('');
    setSiteId('');
    setRegion('');
    setClientFilter('');
    setMonthFrom('');
    setMonthTo('');
    setIsPaid('BOTH');
    setIsStopPayment('BOTH');
    setModeOfPayment('ALL');
    setAllEmployees(true);
    setInMainPayroll(true);
  };

  const handleExportCsv = async () => {
    try {
      const resp = await apiClient.get('/api/hrm/payslips/export-report/', {
        params: buildParams(),
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([resp.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `payslips_${selectedMonth || 'report'}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      useToastStore.getState().error('Failed to export payslips CSV.');
    }
  };

  const handleToggleHold = async (row: PayslipPrintRow) => {
    try {
      await apiClient.post(`/api/hrm/payslips/${row.id}/toggle-hold/`, {
        reason: row.is_stop_payment ? '' : 'Hold from Pay Slips Report',
      });
      useToastStore.getState().success(row.is_stop_payment ? 'Hold released.' : 'Pay slip placed ON HOLD.');
      fetchReport();
    } catch (err: any) {
      useToastStore.getState().error(err?.response?.data?.detail || 'Failed to update hold status.');
    }
  };

  const companyHeading = branding.company_name
    ? `Pay Slips — ${branding.company_name} Report Parameters`
    : 'Pay Slips — HRIS Report Parameters';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Card>
        <div style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="bx bx-receipt"></i>
                {companyHeading}
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                Reads finalized Monthly Salary Sheets directly from Finance (with legacy payroll fallback). Filter by Employee Code range, Location/Site, Month, Payment Mode, Paid or Hold status.
              </p>
            </div>
          </div>

          {/* Preset Radio Strip */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '14px',
              padding: '10px 14px',
              borderRadius: '8px',
              background: 'var(--color-surface-secondary)',
              border: '1px solid var(--color-border)',
              marginBottom: '14px',
              fontSize: '12.5px',
            }}
          >
            {[
              { id: 'ALL', label: 'All Periods' },
              { id: 'date_range', label: 'Date Range' },
              { id: 'TODAY', label: 'Today' },
              { id: 'LAST_7_DAYS', label: 'Last 7 Days' },
              { id: 'LAST_15_DAYS', label: 'Last 15 Days' },
              { id: 'LAST_30_DAYS', label: 'Last 30 Days' },
              { id: 'LAST_60_DAYS', label: 'Last 60 Days' },
              { id: 'LAST_90_DAYS', label: 'Last 90 Days' },
            ].map((p) => (
              <label key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontWeight: dateRangePreset === p.id ? 700 : 500 }}>
                <input
                  type="radio"
                  name="payslipPreset"
                  checked={dateRangePreset === p.id}
                  onChange={() => setDateRangePreset(p.id)}
                />
                {p.label}
              </label>
            ))}
          </div>

          {/* Filter Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px', marginBottom: '14px' }}>
            <div>
              <label className="form-label" style={{ fontSize: '11.5px', fontWeight: 700 }}>From Employee Code</label>
              <input
                type="text"
                className="input-base"
                placeholder="e.g. 000014"
                value={employeeFrom}
                onChange={(e) => setEmployeeFrom(e.target.value)}
              />
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '11.5px', fontWeight: 700 }}>To Employee Code</label>
              <input
                type="text"
                className="input-base"
                placeholder="e.g. 099999"
                value={employeeTo}
                onChange={(e) => setEmployeeTo(e.target.value)}
              />
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '11.5px', fontWeight: 700 }}>Location / Site</label>
              <select
                className="input-base"
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
              >
                <option value="">All Locations / Sites</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.client_name ? `(${s.client_name})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '11.5px', fontWeight: 700 }}>Region / Branch</label>
              <input
                type="text"
                className="input-base"
                placeholder="e.g. KHI, LHR, ISB"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
              />
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '11.5px', fontWeight: 700 }}>Client</label>
              <input
                type="text"
                className="input-base"
                placeholder="Client Name"
                value={clientFilter}
                onChange={(e) => setClientFilter(e.target.value)}
              />
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '11.5px', fontWeight: 700 }}>Salary Sheet Month</label>
              <select
                className="input-base"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              >
                <option value="ALL">All Months</option>
                {availableMonths.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            {dateRangePreset === 'date_range' && (
              <>
                <div>
                  <label className="form-label" style={{ fontSize: '11.5px', fontWeight: 700 }}>From Date</label>
                  <input type="date" className="input-base" value={monthFrom} onChange={(e) => setMonthFrom(e.target.value)} />
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: '11.5px', fontWeight: 700 }}>To Date</label>
                  <input type="date" className="input-base" value={monthTo} onChange={(e) => setMonthTo(e.target.value)} />
                </div>
              </>
            )}

            <div>
              <label className="form-label" style={{ fontSize: '11.5px', fontWeight: 700 }}>Is Paid</label>
              <select className="input-base" value={isPaid} onChange={(e) => setIsPaid(e.target.value)}>
                <option value="BOTH">Both</option>
                <option value="PAID">Paid Only</option>
                <option value="UNPAID">Unpaid Only</option>
              </select>
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '11.5px', fontWeight: 700 }}>Is Stop Payment (Hold)</label>
              <select className="input-base" value={isStopPayment} onChange={(e) => setIsStopPayment(e.target.value)}>
                <option value="BOTH">Both</option>
                <option value="HOLD">On Hold Only</option>
                <option value="ACTIVE">Not On Hold</option>
              </select>
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '11.5px', fontWeight: 700 }}>Mode of Payment</label>
              <select className="input-base" value={modeOfPayment} onChange={(e) => setModeOfPayment(e.target.value)}>
                <option value="ALL">All Modes</option>
                {paymentModes.map((pm) => (
                  <option key={pm} value={pm}>{pm}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Bottom Checkboxes & Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12.5px' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input type="checkbox" checked={allEmployees} onChange={(e) => setAllEmployees(e.target.checked)} />
                All Employees
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input type="checkbox" checked={inMainPayroll} onChange={(e) => setInMainPayroll(e.target.checked)} />
                In Main Payroll
              </label>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <Button variant="secondary" size="sm" onClick={handleClear}>
                <i className="bx bx-refresh" style={{ marginRight: '4px' }}></i>
                Clear Form
              </Button>
              <Button variant="secondary" size="sm" onClick={handleExportCsv}>
                <i className="bx bx-download" style={{ marginRight: '4px' }}></i>
                Export CSV
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={rows.length === 0}
                onClick={() => {
                  setPrintTitle(`Batch Pay Slips (${rows.length})`);
                  setPrintRows(rows);
                }}
              >
                <i className="bx bx-printer" style={{ marginRight: '4px' }}></i>
                Print All Previewed ({rows.length} PDF)
              </Button>
              <Button variant="primary" size="sm" onClick={() => fetchReport()} loading={loading}>
                <i className="bx bx-search" style={{ marginRight: '4px' }}></i>
                Preview
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {error && (
        <div style={{ padding: '12px 16px', borderRadius: '8px', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {/* Summary Strip */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px' }}>
          <div style={{ padding: '11px 14px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)' }}>MATCHED PAYSLIPS</div>
            <div style={{ fontSize: '18px', fontWeight: 800 }}>{summary.total_count}</div>
          </div>
          <div style={{ padding: '11px 14px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)' }}>TOTAL GROSS</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#2563eb' }}>{fmtPkr(summary.total_gross)}</div>
          </div>
          <div style={{ padding: '11px 14px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)' }}>TOTAL DEDUCTIONS</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#dc2626' }}>{fmtPkr(summary.total_deductions)}</div>
          </div>
          <div style={{ padding: '11px 14px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)' }}>NET PAYABLE</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#059669' }}>{fmtPkr(summary.total_net)}</div>
          </div>
          <div style={{ padding: '11px 14px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)' }}>PAID / UNPAID / HOLD</div>
            <div style={{ fontSize: '14px', fontWeight: 700, marginTop: '3px' }}>
              <span style={{ color: '#15803d' }}>{summary.paid_count} Paid</span> &bull;{' '}
              <span style={{ color: '#0369a1' }}>{summary.unpaid_count} Unpaid</span> &bull;{' '}
              <span style={{ color: '#dc2626' }}>{summary.hold_count} Hold</span>
            </div>
          </div>
        </div>
      )}

      {/* Results Table */}
      <Card>
        <div style={{ overflow: 'auto', maxHeight: '560px' }}>
          {loading ? (
            <LoadingState message="Loading payslips report..." />
          ) : rows.length === 0 ? (
            <div style={{ padding: '44px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
              No pay slips match the selected filters. Try selecting <strong>All Months</strong> or adjusting employee/location filters and clicking <strong>Preview</strong>.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--color-surface-secondary)', zIndex: 1 }}>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>Slip # / Month</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>OSS</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>Employee</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>Locations</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Total Salary</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center' }}>Shifts / OT</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Gross</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Deductions</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Net Payable</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center' }}>Mode</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    style={{
                      borderBottom: '1px solid var(--color-border)',
                      background: r.is_stop_payment ? 'rgba(220, 38, 38, 0.08)' : undefined,
                    }}
                  >
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ fontFamily: 'monospace', fontWeight: 700 }}>{r.payslip_number}</div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{r.month_display || r.month}</div>
                    </td>
                    <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 700 }}>{r.employee_code}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ fontWeight: 600 }}>{r.employee_name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{r.cnic_number || r.contact_number || ''}</div>
                    </td>
                    <td style={{ padding: '8px 10px', maxWidth: '180px', whiteSpace: 'normal', fontSize: '11.5px' }}>
                      {r.locations_text || '—'}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmtInt(r.total_salary)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                      {r.paid_shifts}/{r.total_shifts}
                      {r.overtime_shifts > 0 ? ` (+${r.overtime_shifts} OT)` : ''}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>{fmtInt(r.gross_salary_payable)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#dc2626' }}>{fmtInt(r.total_deduction)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: '#059669' }}>
                      {fmtInt(r.net_salary_payable)}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>{r.mode_of_payment || '—'}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                      <span
                        style={{
                          padding: '2px 7px',
                          borderRadius: '99px',
                          fontSize: '10.5px',
                          fontWeight: 700,
                          background: r.is_paid ? '#dcfce7' : r.is_stop_payment ? '#fee2e2' : '#e0f2fe',
                          color: r.is_paid ? '#15803d' : r.is_stop_payment ? '#b91c1c' : '#0369a1',
                        }}
                      >
                        {r.is_paid ? 'PAID' : r.is_stop_payment ? 'HOLD' : 'UNPAID'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '5px' }}>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => {
                            setPrintTitle(`Pay Slip — ${r.employee_name} (${r.month_display || r.month})`);
                            setPrintRows([r]);
                          }}
                        >
                          Slip / Print
                        </Button>
                        {!r.is_paid && (
                          <Button size="sm" variant="secondary" onClick={() => handleToggleHold(r)}>
                            {r.is_stop_payment ? 'Unhold' : 'Hold'}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <PayslipPrintModal
        isOpen={printRows.length > 0}
        onClose={() => setPrintRows([])}
        rows={printRows}
        branding={branding}
        title={printTitle}
      />
    </div>
  );
};
