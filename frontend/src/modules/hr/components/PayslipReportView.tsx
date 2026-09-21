import React, { useState } from 'react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { apiClient } from '../api';
import { LoadingState } from '../../../components/ui/LoadingState';

export const PayslipReportView: React.FC = () => {
    // Parameters matching One Security Screenshot 3
    const [dateRangePreset, setDateRangePreset] = useState<string>('date_range');
    const [employeeFrom, setEmployeeFrom] = useState<string>('');
    const [employeeTo, setEmployeeTo] = useState<string>('');
    const [locationFrom, setLocationFrom] = useState<string>('');
    const [region, setRegion] = useState<string>('');
    const [clientFrom, setClientFrom] = useState<string>('');
    const [daySupervisor, setDaySupervisor] = useState<string>('');
    const [nightSupervisor, setNightSupervisor] = useState<string>('');
    const [monthFrom, setMonthFrom] = useState<string>('2026-05-01');
    const [monthTo, setMonthTo] = useState<string>('2026-05-31');
    const [isPaid, setIsPaid] = useState<string>('BOTH');
    const [isStopPayment, setIsStopPayment] = useState<string>('BOTH');
    const [accountType, setAccountType] = useState<string>('ALL');
    const [salaryType, setSalaryType] = useState<string>('BOTH');
    const [allEmployees, setAllEmployees] = useState<boolean>(true);
    const [inMainPayroll, setInMainPayroll] = useState<boolean>(true);

    const [loading, setLoading] = useState<boolean>(false);
    const [reportData, setReportData] = useState<any | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [printableMode, setPrintableMode] = useState<boolean>(false);

    const handlePreview = async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            if (dateRangePreset !== 'date_range') {
                params.append('date_range_preset', dateRangePreset);
            } else {
                params.append('month_from', monthFrom);
                params.append('month_to', monthTo);
            }
            if (employeeFrom) params.append('employee_from', employeeFrom);
            if (employeeTo) params.append('employee_to', employeeTo);
            if (locationFrom) params.append('site_id', locationFrom);
            if (clientFrom) params.append('client_id', clientFrom);
            if (region) params.append('region', region);
            if (daySupervisor) params.append('day_supervisor', daySupervisor);
            if (nightSupervisor) params.append('night_supervisor', nightSupervisor);
            if (salaryType && salaryType !== 'BOTH') params.append('salary_type', salaryType);
            params.append('is_paid', isPaid);
            params.append('is_stop_payment', isStopPayment);
            params.append('account_type', accountType);
            params.append('in_main_payroll', String(inMainPayroll));

            const res = await apiClient.get(`/api/hrm/payslips/report/?${params.toString()}`);
            setReportData(res.data);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to generate payslip report');
        } finally {
            setLoading(false);
        }
    };

    const handleExportCSV = () => {
        const params = new URLSearchParams();
        if (dateRangePreset !== 'date_range') {
            params.append('date_range_preset', dateRangePreset);
        } else {
            params.append('month_from', monthFrom);
            params.append('month_to', monthTo);
        }
        if (employeeFrom) params.append('employee_from', employeeFrom);
        if (employeeTo) params.append('employee_to', employeeTo);
        if (daySupervisor) params.append('day_supervisor', daySupervisor);
        if (nightSupervisor) params.append('night_supervisor', nightSupervisor);
        if (salaryType && salaryType !== 'BOTH') params.append('salary_type', salaryType);
        params.append('is_paid', isPaid);
        params.append('is_stop_payment', isStopPayment);
        params.append('account_type', accountType);
        params.append('in_main_payroll', String(inMainPayroll));
        window.open(`/api/hrm/payslips/export-report/?${params.toString()}`, '_blank');
    };

    const handleToggleHold = async (payslipId: string, currentHold: boolean) => {
        const reason = !currentHold ? prompt('Enter reason for payment hold:', 'Verification pending') : '';
        if (!currentHold && reason === null) return;
        try {
            await apiClient.post(`/api/hrm/payslips/${payslipId}/toggle-hold/`, { reason: reason || 'Payment hold' });
            handlePreview();
        } catch (e) {
            alert('Failed to update stop payment status');
        }
    };

    const handleClearForm = () => {
        setDateRangePreset('date_range');
        setEmployeeFrom('');
        setEmployeeTo('');
        setLocationFrom('');
        setRegion('');
        setClientFrom('');
        setDaySupervisor('');
        setNightSupervisor('');
        setMonthFrom('2026-05-01');
        setMonthTo('2026-05-31');
        setIsPaid('BOTH');
        setIsStopPayment('BOTH');
        setAccountType('ALL');
        setSalaryType('BOTH');
        setAllEmployees(true);
        setInMainPayroll(true);
        setReportData(null);
    };

    const handlePrint = () => {
        setPrintableMode(true);
        setTimeout(() => {
            window.print();
        }, 300);
    };

    if (printableMode) {
        return (
            <div style={{ background: '#fff', color: '#000', padding: '24px', minHeight: '100vh' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '20px', textTransform: 'uppercase' }}>One Security (Pvt) Ltd.</h2>
                        <div style={{ fontSize: '14px', fontWeight: 600 }}>CONFIDENTIAL WORKFORCE SALARY SLIPS & DISBURSEMENT SHEET</div>
                        <div style={{ fontSize: '12px', color: '#555' }}>Generated: {new Date().toLocaleString()} | Period: {monthFrom} to {monthTo}</div>
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => setPrintableMode(false)}>
                        <i className="bx bx-arrow-back"></i> Back to Report View
                    </Button>
                </div>

                {reportData?.rows?.map((r: any) => (
                    <div key={r.payslip_id} style={{ border: '2px solid #333', borderRadius: '4px', padding: '16px', marginBottom: '24px', pageBreakInside: 'avoid' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #ccc', paddingBottom: '8px', marginBottom: '12px' }}>
                            <div>
                                <strong style={{ fontSize: '16px' }}>{r.full_name}</strong> ({r.designation})
                                <div style={{ fontSize: '12px' }}>Code: <strong>{r.previous_employee_code || r.employee_code}</strong> | Father: {r.father_name || '—'}</div>
                                <div style={{ fontSize: '12px' }}>Department: {r.department} | Deployment Site: {r.site || '—'}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '13px', fontWeight: 600 }}>Payslip #{r.payslip_number}</div>
                                <div style={{ fontSize: '12px' }}>Period: {r.period}</div>
                                <div style={{ fontSize: '12px', fontWeight: 600, color: r.payment_status === 'PAID' ? '#166534' : '#991b1b' }}>
                                    Status: {r.payment_status} {r.is_stop_payment ? '(STOP-PAYMENT HOLD)' : ''}
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '12.5px' }}>
                            <div>
                                <div style={{ fontWeight: 600, borderBottom: '1px solid #eee', paddingBottom: '4px', color: '#166534' }}>EARNINGS & ADDITIONS</div>
                                {r.earnings?.map((e: any, idx: number) => (
                                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                                        <span>{e.name}:</span>
                                        <strong>PKR {e.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                                    </div>
                                ))}
                                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #ddd', marginTop: '6px', paddingTop: '4px' }}>
                                    <strong>Gross Salary:</strong>
                                    <strong>PKR {r.gross_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                                </div>
                            </div>

                            <div>
                                <div style={{ fontWeight: 600, borderBottom: '1px solid #eee', paddingBottom: '4px', color: '#991b1b' }}>STATUTORY & OTHER DEDUCTIONS</div>
                                {r.deductions?.map((d: any, idx: number) => (
                                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                                        <span>{d.name}:</span>
                                        <strong>PKR {d.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                                    </div>
                                ))}
                                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #ddd', marginTop: '6px', paddingTop: '4px' }}>
                                    <strong>Total Deductions:</strong>
                                    <strong>PKR {r.deduction_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', borderTop: '2px solid #333', paddingTop: '10px' }}>
                            <div style={{ fontSize: '12px' }}>
                                <div>Payment Method: <strong>{r.account_type}</strong> — {r.destination_info || 'Cash Counter'}</div>
                            </div>
                            <div style={{ fontSize: '16px', fontWeight: 700 }}>
                                Net Payable: PKR {r.net_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginTop: '30px', fontSize: '11px', textAlign: 'center' }}>
                            <div style={{ borderTop: '1px solid #999', paddingTop: '4px' }}>Prepared By (HR)</div>
                            <div style={{ borderTop: '1px solid #999', paddingTop: '4px' }}>Audited (Finance / Accounts)</div>
                            <div style={{ borderTop: '1px solid #999', paddingTop: '4px' }}>Employee Signature / Thumb</div>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Filter Parameters Form (Matching Screenshot 3) */}
            <Card>
                <div style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '12px', marginBottom: '16px' }}>
                    <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <i className="bx bx-receipt" style={{ color: 'var(--color-primary)' }}></i>
                        Pay Slips — One Security HRIS Report Parameters
                    </h2>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: 'var(--color-text-muted)' }}>
                        Default settings are for all records between specified parameter ranges. Values snapshot directly from finalized payroll.
                    </p>
                </div>

                {/* Preset Radio Buttons Row */}
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', background: 'var(--color-surface-hover, #f8fafc)', padding: '10px 14px', borderRadius: '6px', fontSize: '12.5px', marginBottom: '16px' }}>
                    {[
                        { id: 'date_range', label: 'Date Range' },
                        { id: 'today', label: 'Today' },
                        { id: 'last_7_days', label: 'Last 7 Days' },
                        { id: 'last_15_days', label: 'Last 15 Days' },
                        { id: 'last_30_days', label: 'Last 30 Days' },
                        { id: 'last_60_days', label: 'Last 60 Days' },
                        { id: 'last_90_days', label: 'Last 90 Days' }
                    ].map(preset => (
                        <label key={preset.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                            <input
                                type="radio"
                                name="datePreset"
                                checked={dateRangePreset === preset.id}
                                onChange={() => setDateRangePreset(preset.id)}
                            />
                            {preset.label}
                        </label>
                    ))}
                </div>

                {/* Form Fields Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', fontSize: '13px' }}>
                    <div>
                        <label style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '11.5px', marginBottom: '3px' }}>From Employee Code</label>
                        <input
                            type="text"
                            placeholder="e.g. 000014"
                            value={employeeFrom}
                            onChange={(e) => setEmployeeFrom(e.target.value)}
                            style={{ width: '100%', height: '34px', padding: '0 10px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', boxSizing: 'border-box' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '11.5px', marginBottom: '3px' }}>To Employee Code</label>
                        <input
                            type="text"
                            placeholder="e.g. 099999"
                            value={employeeTo}
                            onChange={(e) => setEmployeeTo(e.target.value)}
                            style={{ width: '100%', height: '34px', padding: '0 10px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', boxSizing: 'border-box' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '11.5px', marginBottom: '3px' }}>Location / Site</label>
                        <input
                            type="text"
                            placeholder="Filter by Site ID / Name"
                            value={locationFrom}
                            onChange={(e) => setLocationFrom(e.target.value)}
                            style={{ width: '100%', height: '34px', padding: '0 10px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', boxSizing: 'border-box' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '11.5px', marginBottom: '3px' }}>Region / Branch</label>
                        <input
                            type="text"
                            placeholder="Filter by Region"
                            value={region}
                            onChange={(e) => setRegion(e.target.value)}
                            style={{ width: '100%', height: '34px', padding: '0 10px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', boxSizing: 'border-box' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '11.5px', marginBottom: '3px' }}>From Client</label>
                        <input
                            type="text"
                            placeholder="Client Name / ID"
                            value={clientFrom}
                            onChange={(e) => setClientFrom(e.target.value)}
                            style={{ width: '100%', height: '34px', padding: '0 10px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', boxSizing: 'border-box' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '11.5px', marginBottom: '3px' }}>From Month</label>
                        <input
                            type="date"
                            value={monthFrom}
                            onChange={(e) => setMonthFrom(e.target.value)}
                            style={{ width: '100%', height: '34px', padding: '0 10px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', boxSizing: 'border-box' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '11.5px', marginBottom: '3px' }}>To Month</label>
                        <input
                            type="date"
                            value={monthTo}
                            onChange={(e) => setMonthTo(e.target.value)}
                            style={{ width: '100%', height: '34px', padding: '0 10px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', boxSizing: 'border-box' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '11.5px', marginBottom: '3px' }}>Is Paid</label>
                        <select
                            value={isPaid}
                            onChange={(e) => setIsPaid(e.target.value)}
                            style={{ width: '100%', height: '34px', padding: '0 10px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', boxSizing: 'border-box' }}
                        >
                            <option value="BOTH">Both</option>
                            <option value="PAID">Paid</option>
                            <option value="UNPAID">Unpaid</option>
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '11.5px', marginBottom: '3px' }}>Is Stop Payment (Hold)</label>
                        <select
                            value={isStopPayment}
                            onChange={(e) => setIsStopPayment(e.target.value)}
                            style={{ width: '100%', height: '34px', padding: '0 10px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', boxSizing: 'border-box' }}
                        >
                            <option value="BOTH">Both</option>
                            <option value="YES">Yes (Hold Placed)</option>
                            <option value="NO">No (Active)</option>
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '11.5px', marginBottom: '3px' }}>Account Type</label>
                        <select
                            value={accountType}
                            onChange={(e) => setAccountType(e.target.value)}
                            style={{ width: '100%', height: '34px', padding: '0 10px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', boxSizing: 'border-box' }}
                        >
                            <option value="ALL">All</option>
                            <option value="BANK">Bank Transfer</option>
                            <option value="WALLET">Mobile Wallet</option>
                            <option value="CASH">Cash</option>
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '11.5px', marginBottom: '3px' }}>Day Supervisor</label>
                        <input
                            type="text"
                            placeholder="Supervisor Name / ID"
                            value={daySupervisor}
                            onChange={(e) => setDaySupervisor(e.target.value)}
                            style={{ width: '100%', height: '34px', padding: '0 10px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', boxSizing: 'border-box' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '11.5px', marginBottom: '3px' }}>Night Supervisor</label>
                        <input
                            type="text"
                            placeholder="Supervisor Name / ID"
                            value={nightSupervisor}
                            onChange={(e) => setNightSupervisor(e.target.value)}
                            style={{ width: '100%', height: '34px', padding: '0 10px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', boxSizing: 'border-box' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '11.5px', marginBottom: '3px' }}>Salary Type</label>
                        <select
                            value={salaryType}
                            onChange={(e) => setSalaryType(e.target.value)}
                            style={{ width: '100%', height: '34px', padding: '0 10px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', boxSizing: 'border-box' }}
                        >
                            <option value="BOTH">Both</option>
                            <option value="REGULAR">Regular / Base</option>
                            <option value="OVERTIME">Overtime Only</option>
                        </select>
                    </div>
                </div>

                {/* Checkboxes */}
                <div style={{ display: 'flex', gap: '24px', marginTop: '16px', fontSize: '13px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={allEmployees}
                            onChange={(e) => setAllEmployees(e.target.checked)}
                        />
                        All Employees
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={inMainPayroll}
                            onChange={(e) => setInMainPayroll(e.target.checked)}
                        />
                        In Main Payroll
                    </label>
                </div>

                {/* Bottom Action Buttons matching Screenshot 3 */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px', borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
                    <Button variant="secondary" onClick={handleClearForm}>
                        <i className="bx bx-reset"></i> Clear Form
                    </Button>
                    <Button variant="secondary" onClick={handleExportCSV}>
                        <i className="bx bx-download"></i> Export CSV
                    </Button>
                    <Button variant="secondary" onClick={handlePrint} disabled={!reportData?.rows?.length}>
                        <i className="bx bx-printer"></i> Print
                    </Button>
                    <Button variant="primary" onClick={handlePreview} disabled={loading}>
                        <i className="bx bx-search"></i> {loading ? 'Loading...' : 'Preview'}
                    </Button>
                </div>
            </Card>

            {/* Results Display */}
            {loading ? (
                <LoadingState message="Generating One Security payslip report..." />
            ) : error ? (
                <div style={{ color: 'var(--color-danger)', padding: '16px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '6px' }}>{error}</div>
            ) : reportData?.rows ? (
                <Card style={{ padding: 0, overflow: 'hidden' }}>
                    {/* Totals Banner */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', padding: '14px 18px', background: 'var(--color-surface-hover, #f8fafc)', borderBottom: '1px solid var(--color-border)', fontSize: '12.5px' }}>
                        <div>Payslips: <strong>{reportData.totals.total_payslips}</strong></div>
                        <div>Gross: <strong style={{ color: '#10b981' }}>PKR {reportData.totals.total_gross.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></div>
                        <div>Deductions: <strong style={{ color: '#ef4444' }}>PKR {reportData.totals.total_deductions.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></div>
                        <div>Net Pay: <strong>PKR {reportData.totals.total_net.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></div>
                        <div>Paid: <strong style={{ color: '#10b981' }}>{reportData.totals.paid_count}</strong></div>
                        <div>Unpaid: <strong style={{ color: '#f59e0b' }}>{reportData.totals.unpaid_count}</strong></div>
                        <div>On Hold: <strong style={{ color: '#ef4444' }}>{reportData.totals.hold_count}</strong></div>
                    </div>

                    <div style={{ overflowX: 'auto', maxHeight: '550px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                            <thead>
                                <tr style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', textAlign: 'left', position: 'sticky', top: 0, zIndex: 1 }}>
                                    <th style={{ padding: '10px 12px' }}>Code</th>
                                    <th style={{ padding: '10px 12px' }}>Employee</th>
                                    <th style={{ padding: '10px 12px' }}>Designation</th>
                                    <th style={{ padding: '10px 12px' }}>Deployment Site</th>
                                    <th style={{ padding: '10px 12px' }}>Payment Mode</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Gross</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Deductions</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Net Salary</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>Finance Status</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>Hold Status</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {reportData.rows.map((r: any) => (
                                    <tr key={r.payslip_id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                        <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--color-primary)' }}>
                                            {r.previous_employee_code || r.employee_code}
                                        </td>
                                        <td style={{ padding: '10px 12px' }}>
                                            <div style={{ fontWeight: 500 }}>{r.full_name}</div>
                                            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{r.father_name || '—'}</div>
                                        </td>
                                        <td style={{ padding: '10px 12px', color: 'var(--color-text-muted)' }}>
                                            {r.designation}
                                        </td>
                                        <td style={{ padding: '10px 12px', color: 'var(--color-text-muted)' }}>
                                            {r.site || 'General Pool'}
                                        </td>
                                        <td style={{ padding: '10px 12px' }}>
                                            <span style={{ fontSize: '11.5px', fontWeight: 500 }}>{r.account_type}</span>
                                            <div style={{ fontSize: '10.5px', color: 'var(--color-text-muted)' }}>{r.destination_info}</div>
                                        </td>
                                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#10b981', fontWeight: 600 }}>
                                            PKR {r.gross_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#ef4444', fontWeight: 600 }}>
                                            PKR {r.deduction_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>
                                            PKR {r.net_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                            <span style={{
                                                fontSize: '11px',
                                                padding: '2px 8px',
                                                borderRadius: '4px',
                                                fontWeight: 600,
                                                background: r.payment_status === 'PAID' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                                color: r.payment_status === 'PAID' ? '#10b981' : '#f59e0b'
                                            }}>
                                                {r.payment_status}
                                            </span>
                                        </td>
                                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                            {r.is_stop_payment ? (
                                                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }} title={r.stop_payment_reason}>
                                                    HOLD
                                                </span>
                                            ) : (
                                                <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>ACTIVE</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={() => handleToggleHold(r.payslip_id, r.is_stop_payment)}
                                                style={{ fontSize: '11px', padding: '2px 8px' }}
                                            >
                                                {r.is_stop_payment ? 'Release' : 'Hold'}
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                                {reportData.rows.length === 0 && (
                                    <tr>
                                        <td colSpan={11} style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                                            No payslips found matching the specified parameters.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>
            ) : null}
        </div>
    );
};
