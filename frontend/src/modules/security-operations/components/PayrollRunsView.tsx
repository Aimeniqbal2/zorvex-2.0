import React, { useState, useEffect } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import {
    getPayrollRuns,
    createPayrollRunFromReady,
    getPayrollRunDetail,
    submitPayrollRunForReview,
    approvePayrollRun,
    finalizePayrollRun,
    cancelPayrollRun,
    getPayrollRunPayslips,
    getPayrollRunFinanceStatus
} from '../api';
import type {
    PayrollRunItem,
    OperationalPayslipItem,
    PayrollRunStatus
} from '../types';
import { PayslipPrintModal } from './PayslipPrintModal';

export const PayrollRunsView: React.FC = () => {
    // Current month defaults
    const now = new Date();
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    const [runs, setRuns] = useState<PayrollRunItem[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Filters
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [searchQuery, setSearchQuery] = useState<string>('');

    // Create Modal State
    const [createModalOpen, setCreateModalOpen] = useState<boolean>(false);
    const [createPeriodStart, setCreatePeriodStart] = useState<string>(defaultStart);
    const [createPeriodEnd, setCreatePeriodEnd] = useState<string>(defaultEnd);
    const [createRunNumber, setCreateRunNumber] = useState<string>('');
    const [createPayrollMonth, setCreatePayrollMonth] = useState<string>(
        now.toLocaleString('default', { month: 'long', year: 'numeric' })
    );
    const [creating, setCreating] = useState<boolean>(false);

    // Detail Modal State
    const [selectedRun, setSelectedRun] = useState<PayrollRunItem | null>(null);
    const [runPayslips, setRunPayslips] = useState<OperationalPayslipItem[]>([]);
    const [financeStatus, setFinanceStatus] = useState<any | null>(null);
    const [detailLoading, setDetailLoading] = useState<boolean>(false);
    const [activeDetailTab, setActiveDetailTab] = useState<'payslips' | 'finance'>('payslips');

    // Action Processing State
    const [actionLoading, setActionLoading] = useState<boolean>(false);

    // Payslip Modal State
    const [selectedPayslip, setSelectedPayslip] = useState<OperationalPayslipItem | null>(null);
    const [payslipModalOpen, setPayslipModalOpen] = useState<boolean>(false);

    const fetchRuns = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await getPayrollRuns({
                status: statusFilter === 'ALL' ? undefined : statusFilter,
                search: searchQuery || undefined
            });
            setRuns(data);
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Failed to load payroll runs');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRuns();
    }, [statusFilter]);

    const handleOpenDetail = async (run: PayrollRunItem) => {
        setSelectedRun(run);
        setDetailLoading(true);
        setActiveDetailTab('payslips');
        try {
            const [detail, slips, fin] = await Promise.all([
                getPayrollRunDetail(run.id),
                getPayrollRunPayslips(run.id),
                getPayrollRunFinanceStatus(run.id)
            ]);
            setSelectedRun(detail);
            setRunPayslips(slips);
            setFinanceStatus(fin);
        } catch (err: any) {
            console.error('Failed to load run details:', err);
        } finally {
            setDetailLoading(false);
        }
    };

    const handleCreateRun = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreating(true);
        setError(null);
        setSuccessMessage(null);
        try {
            const newRun = await createPayrollRunFromReady({
                period_start: createPeriodStart,
                period_end: createPeriodEnd,
                run_number: createRunNumber.trim() || undefined,
                payroll_month: createPayrollMonth.trim() || undefined
            });
            setSuccessMessage(`Payroll run ${newRun.run_number} created with ${newRun.employee_count} employees.`);
            setCreateModalOpen(false);
            await fetchRuns();
            handleOpenDetail(newRun);
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Failed to create payroll run');
        } finally {
            setCreating(false);
        }
    };

    const handleSubmitForReview = async () => {
        if (!selectedRun) return;
        setActionLoading(true);
        setError(null);
        try {
            const res = await submitPayrollRunForReview(selectedRun.id);
            setSuccessMessage(res.message);
            await handleOpenDetail(res.run);
            await fetchRuns();
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Failed to submit run for review');
        } finally {
            setActionLoading(false);
        }
    };

    const handleApprove = async () => {
        if (!selectedRun) return;
        setActionLoading(true);
        setError(null);
        try {
            const res = await approvePayrollRun(selectedRun.id);
            setSuccessMessage(res.message);
            await handleOpenDetail(res.run);
            await fetchRuns();
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Failed to approve payroll run');
        } finally {
            setActionLoading(false);
        }
    };

    const handleFinalize = async () => {
        if (!selectedRun) return;
        if (!window.confirm('Finalizing this run will freeze all duty pay and inputs, commit employee advance recoveries, and hand off liabilities to Finance S-4G. This action is irreversible. Proceed?')) {
            return;
        }
        setActionLoading(true);
        setError(null);
        try {
            const res = await finalizePayrollRun(selectedRun.id);
            setSuccessMessage(`Payroll run finalized! Settled ${res.advances_settled_count} advance(s) and created S-4G Finance liability.`);
            await handleOpenDetail(res.run);
            await fetchRuns();
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Failed to finalize payroll run');
        } finally {
            setActionLoading(false);
        }
    };

    const handleCancel = async () => {
        if (!selectedRun) return;
        const reason = window.prompt('Enter reason for cancelling this payroll run:');
        if (reason === null) return;
        setActionLoading(true);
        setError(null);
        try {
            const res = await cancelPayrollRun(selectedRun.id, reason);
            setSuccessMessage(res.message);
            setSelectedRun(null);
            await fetchRuns();
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Failed to cancel payroll run');
        } finally {
            setActionLoading(false);
        }
    };

    const getStatusBadge = (status: PayrollRunStatus) => {
        const styles: Record<PayrollRunStatus, { bg: string; color: string; label: string }> = {
            DRAFT: { bg: '#f1f5f9', color: '#475569', label: 'Draft' },
            CALCULATED: { bg: '#e0f2fe', color: '#0369a1', label: 'Calculated' },
            UNDER_REVIEW: { bg: '#fef3c7', color: '#b45309', label: 'Under Review' },
            APPROVED: { bg: '#dbeafe', color: '#1d4ed8', label: 'Approved' },
            FINALIZED: { bg: '#dcfce7', color: '#15803d', label: 'Finalized' },
            CANCELLED: { bg: '#fee2e2', color: '#b91c1c', label: 'Cancelled' }
        };
        const s = styles[status] || styles.DRAFT;
        return (
            <span style={{
                backgroundColor: s.bg,
                color: s.color,
                padding: '4px 10px',
                borderRadius: '9999px',
                fontSize: '12px',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
            }}>
                {s.label}
            </span>
        );
    };

    return (
        <div className="payroll-runs-view" style={{ padding: '24px' }}>
            {/* Header & Control Bar */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '24px',
                flexWrap: 'wrap',
                gap: '16px'
            }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: 'var(--color-text, #0f172a)' }}>
                        Payroll Runs & Payslips
                    </h2>
                    <p style={{ margin: '4px 0 0 0', color: 'var(--color-text-muted, #64748b)', fontSize: '14px' }}>
                        Phase S-5G: Controlled payroll execution, immutable payslip snapshots & S-4G Finance handoff.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <Button variant="secondary" onClick={fetchRuns}>
                        <i className="bx bx-refresh" style={{ marginRight: '6px' }}></i>
                        Refresh
                    </Button>
                    <Button variant="primary" onClick={() => setCreateModalOpen(true)}>
                        <i className="bx bx-plus" style={{ marginRight: '6px' }}></i>
                        Create Payroll Run
                    </Button>
                </div>
            </div>

            {/* Notification Alerts */}
            {error && (
                <div style={{
                    backgroundColor: '#fee2e2',
                    border: '1px solid #f87171',
                    color: '#991b1b',
                    padding: '12px 16px',
                    borderRadius: '6px',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    <i className="bx bx-error-circle" style={{ fontSize: '18px' }}></i>
                    <span>{error}</span>
                </div>
            )}
            {successMessage && (
                <div style={{
                    backgroundColor: '#dcfce7',
                    border: '1px solid #86efac',
                    color: '#166534',
                    padding: '12px 16px',
                    borderRadius: '6px',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    <i className="bx bx-check-circle" style={{ fontSize: '18px' }}></i>
                    <span>{successMessage}</span>
                </div>
            )}

            {/* Filters Row */}
            <div style={{
                display: 'flex',
                gap: '16px',
                alignItems: 'center',
                marginBottom: '20px',
                flexWrap: 'wrap'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text, #334155)' }}>Status:</label>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: '1px solid var(--color-border, #cbd5e1)',
                            fontSize: '13px',
                            backgroundColor: 'var(--color-surface, #fff)'
                        }}
                    >
                        <option value="ALL">All Statuses</option>
                        <option value="DRAFT">Draft</option>
                        <option value="CALCULATED">Calculated</option>
                        <option value="UNDER_REVIEW">Under Review</option>
                        <option value="APPROVED">Approved</option>
                        <option value="FINALIZED">Finalized</option>
                        <option value="CANCELLED">Cancelled</option>
                    </select>
                </div>
                <div style={{ flex: 1, minWidth: '240px' }}>
                    <Input
                        placeholder="Search by run number or month..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && fetchRuns()}
                    />
                </div>
            </div>

            {/* Payroll Runs Table */}
            <div style={{
                backgroundColor: 'var(--color-surface, #ffffff)',
                border: '1px solid var(--color-border, #e2e8f0)',
                borderRadius: '8px',
                overflow: 'hidden',
                boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
            }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                    <thead style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <tr>
                            <th style={{ padding: '12px 16px', fontWeight: 600, color: '#475569' }}>Run # / Month</th>
                            <th style={{ padding: '12px 16px', fontWeight: 600, color: '#475569' }}>Period</th>
                            <th style={{ padding: '12px 16px', fontWeight: 600, color: '#475569', textAlign: 'center' }}>Employees</th>
                            <th style={{ padding: '12px 16px', fontWeight: 600, color: '#475569', textAlign: 'right' }}>Gross Earnings</th>
                            <th style={{ padding: '12px 16px', fontWeight: 600, color: '#475569', textAlign: 'right' }}>Deductions</th>
                            <th style={{ padding: '12px 16px', fontWeight: 600, color: '#475569', textAlign: 'right' }}>Net Payroll</th>
                            <th style={{ padding: '12px 16px', fontWeight: 600, color: '#475569', textAlign: 'center' }}>Status</th>
                            <th style={{ padding: '12px 16px', fontWeight: 600, color: '#475569', textAlign: 'center' }}>Finance Status</th>
                            <th style={{ padding: '12px 16px', fontWeight: 600, color: '#475569', textAlign: 'center' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={9} style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>
                                    <i className="bx bx-loader-alt bx-spin" style={{ fontSize: '24px', marginBottom: '8px' }}></i>
                                    <div>Loading payroll runs...</div>
                                </td>
                            </tr>
                        ) : runs.length === 0 ? (
                            <tr>
                                <td colSpan={9} style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>
                                    <i className="bx bx-receipt" style={{ fontSize: '36px', color: '#cbd5e1', marginBottom: '8px' }}></i>
                                    <div style={{ fontWeight: 600 }}>No payroll runs found</div>
                                    <div style={{ fontSize: '12px', marginTop: '4px' }}>
                                        Prepare calculations in Payroll Prep and click "Create Payroll Run".
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            runs.map((run) => (
                                <tr
                                    key={run.id}
                                    style={{
                                        borderBottom: '1px solid #f1f5f9',
                                        transition: 'background-color 0.15s'
                                    }}
                                    className="table-row-hover"
                                >
                                    <td style={{ padding: '12px 16px' }}>
                                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{run.run_number}</div>
                                        <div style={{ fontSize: '11px', color: '#64748b' }}>{run.payroll_month || 'Monthly'}</div>
                                    </td>
                                    <td style={{ padding: '12px 16px', color: '#334155' }}>
                                        {run.period_start} <span style={{ color: '#94a3b8' }}>to</span> {run.period_end}
                                    </td>
                                    <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600 }}>
                                        {run.employee_count}
                                    </td>
                                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 500, color: '#15803d' }}>
                                        ₨ {Number(run.gross_earnings || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 500, color: '#b91c1c' }}>
                                        ₨ {Number(run.employee_deductions || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#1e3a8a' }}>
                                        ₨ {Number(run.net_payroll || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                        {getStatusBadge(run.status)}
                                    </td>
                                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                        {run.finance_integrated ? (
                                            <span style={{
                                                backgroundColor: '#dcfce7',
                                                color: '#15803d',
                                                fontSize: '11px',
                                                fontWeight: 600,
                                                padding: '2px 8px',
                                                borderRadius: '4px',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}>
                                                <i className="bx bx-check-double"></i> Integrated
                                            </span>
                                        ) : (
                                            <span style={{
                                                backgroundColor: '#f1f5f9',
                                                color: '#64748b',
                                                fontSize: '11px',
                                                fontWeight: 500,
                                                padding: '2px 8px',
                                                borderRadius: '4px'
                                            }}>
                                                Pending Handoff
                                            </span>
                                        )}
                                    </td>
                                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => handleOpenDetail(run)}
                                        >
                                            <i className="bx bx-show" style={{ marginRight: '4px' }}></i>
                                            View Details
                                        </Button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Create Payroll Run Modal */}
            {createModalOpen && (
                <div className="modal-overlay" style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000
                }}>
                    <div style={{
                        backgroundColor: 'var(--color-surface, #ffffff)',
                        borderRadius: '8px',
                        width: '100%',
                        maxWidth: '520px',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
                        padding: '24px'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Create Payroll Run</h3>
                            <button
                                onClick={() => setCreateModalOpen(false)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#64748b' }}
                            >
                                <i className="bx bx-x"></i>
                            </button>
                        </div>
                        <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>
                            Pulls all <strong>READY</strong> EmployeePayrollCalculations within the selected period and generates immutable payslip drafts.
                        </p>
                        <form onSubmit={handleCreateRun}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>
                                        Period Start
                                    </label>
                                    <Input
                                        type="date"
                                        value={createPeriodStart}
                                        onChange={(e) => setCreatePeriodStart(e.target.value)}
                                        required
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>
                                        Period End
                                    </label>
                                    <Input
                                        type="date"
                                        value={createPeriodEnd}
                                        onChange={(e) => setCreatePeriodEnd(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>
                                    Payroll Month (e.g. September 2026)
                                </label>
                                <Input
                                    value={createPayrollMonth}
                                    onChange={(e) => setCreatePayrollMonth(e.target.value)}
                                    placeholder="e.g. September 2026"
                                    required
                                />
                            </div>
                            <div style={{ marginBottom: '24px' }}>
                                <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>
                                    Run Number (Optional - Auto-generated if left blank)
                                </label>
                                <Input
                                    value={createRunNumber}
                                    onChange={(e) => setCreateRunNumber(e.target.value)}
                                    placeholder="e.g. PR-2026-09-01"
                                />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                                <Button variant="secondary" type="button" onClick={() => setCreateModalOpen(false)}>
                                    Cancel
                                </Button>
                                <Button variant="primary" type="submit" disabled={creating}>
                                    {creating ? (
                                        <>
                                            <i className="bx bx-loader-alt bx-spin" style={{ marginRight: '6px' }}></i>
                                            Creating Run...
                                        </>
                                    ) : (
                                        'Create Payroll Run'
                                    )}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Run Detail Modal */}
            {selectedRun && (
                <div className="modal-overlay" style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    padding: '20px'
                }}>
                    <div style={{
                        backgroundColor: 'var(--color-surface, #ffffff)',
                        borderRadius: '8px',
                        width: '100%',
                        maxWidth: '1050px',
                        maxHeight: '94vh',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                    }}>
                        {/* Detail Header & Action Toolbar */}
                        <div style={{
                            padding: '18px 24px',
                            borderBottom: '1px solid #e2e8f0',
                            backgroundColor: '#f8fafc',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '12px'
                        }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>
                                        Payroll Run: {selectedRun.run_number}
                                    </h3>
                                    {getStatusBadge(selectedRun.status)}
                                    {selectedRun.finance_integrated && (
                                        <span style={{
                                            backgroundColor: '#dcfce7',
                                            color: '#15803d',
                                            padding: '2px 8px',
                                            borderRadius: '4px',
                                            fontSize: '11px',
                                            fontWeight: 600
                                        }}>
                                            <i className="bx bx-check-double"></i> S-4G Finance Integrated
                                        </span>
                                    )}
                                </div>
                                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                                    Period: <strong>{selectedRun.period_start}</strong> to <strong>{selectedRun.period_end}</strong> ({selectedRun.payroll_month})
                                </div>
                            </div>
                            {/* Workflow Actions */}
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                {(selectedRun.status === 'DRAFT' || selectedRun.status === 'CALCULATED') && (
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        disabled={actionLoading}
                                        onClick={handleSubmitForReview}
                                    >
                                        <i className="bx bx-send" style={{ marginRight: '4px' }}></i>
                                        Submit For Review
                                    </Button>
                                )}
                                {selectedRun.status === 'UNDER_REVIEW' && (
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        disabled={actionLoading}
                                        onClick={handleApprove}
                                        style={{ backgroundColor: '#2563eb' }}
                                    >
                                        <i className="bx bx-check" style={{ marginRight: '4px' }}></i>
                                        Approve Run
                                    </Button>
                                )}
                                {selectedRun.status === 'APPROVED' && (
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        disabled={actionLoading}
                                        onClick={handleFinalize}
                                        style={{ backgroundColor: '#15803d', borderColor: '#15803d' }}
                                    >
                                        <i className="bx bx-lock" style={{ marginRight: '4px' }}></i>
                                        Finalize & Handoff to Finance
                                    </Button>
                                )}
                                {selectedRun.status !== 'FINALIZED' && selectedRun.status !== 'CANCELLED' && (
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        disabled={actionLoading}
                                        onClick={handleCancel}
                                        style={{ color: '#b91c1c', borderColor: '#fca5a5' }}
                                    >
                                        <i className="bx bx-x" style={{ marginRight: '4px' }}></i>
                                        Cancel Run
                                    </Button>
                                )}
                                <Button variant="secondary" size="sm" onClick={() => setSelectedRun(null)}>
                                    Close
                                </Button>
                            </div>
                        </div>

                        {/* Financial Metrics Cards */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(4, 1fr)',
                            gap: '16px',
                            padding: '16px 24px',
                            backgroundColor: '#ffffff',
                            borderBottom: '1px solid #e2e8f0'
                        }}>
                            <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Employees</div>
                                <div style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>
                                    {selectedRun.employee_count}
                                </div>
                            </div>
                            <div style={{ padding: '12px', backgroundColor: '#f0fdf4', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
                                <div style={{ fontSize: '11px', fontWeight: 600, color: '#166534', textTransform: 'uppercase' }}>Gross Earnings</div>
                                <div style={{ fontSize: '20px', fontWeight: 700, color: '#15803d', marginTop: '2px' }}>
                                    ₨ {Number(selectedRun.gross_earnings || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </div>
                            </div>
                            <div style={{ padding: '12px', backgroundColor: '#fef2f2', borderRadius: '6px', border: '1px solid #fecaca' }}>
                                <div style={{ fontSize: '11px', fontWeight: 600, color: '#991b1b', textTransform: 'uppercase' }}>Employee Deductions</div>
                                <div style={{ fontSize: '20px', fontWeight: 700, color: '#b91c1c', marginTop: '2px' }}>
                                    ₨ {Number(selectedRun.employee_deductions || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </div>
                            </div>
                            <div style={{ padding: '12px', backgroundColor: '#eff6ff', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
                                <div style={{ fontSize: '11px', fontWeight: 600, color: '#1e40af', textTransform: 'uppercase' }}>Net Payroll</div>
                                <div style={{ fontSize: '20px', fontWeight: 700, color: '#1e3a8a', marginTop: '2px' }}>
                                    ₨ {Number(selectedRun.net_payroll || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </div>
                            </div>
                        </div>

                        {/* Detail Navigation Tabs */}
                        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', padding: '0 24px', backgroundColor: '#f8fafc' }}>
                            <button
                                onClick={() => setActiveDetailTab('payslips')}
                                style={{
                                    padding: '12px 16px',
                                    border: 'none',
                                    background: 'none',
                                    fontWeight: activeDetailTab === 'payslips' ? 600 : 500,
                                    color: activeDetailTab === 'payslips' ? '#2563eb' : '#64748b',
                                    borderBottom: activeDetailTab === 'payslips' ? '2px solid #2563eb' : 'none',
                                    cursor: 'pointer',
                                    fontSize: '13px'
                                }}
                            >
                                <i className="bx bx-receipt" style={{ marginRight: '6px' }}></i>
                                Payslips ({runPayslips.length})
                            </button>
                            <button
                                onClick={() => setActiveDetailTab('finance')}
                                style={{
                                    padding: '12px 16px',
                                    border: 'none',
                                    background: 'none',
                                    fontWeight: activeDetailTab === 'finance' ? 600 : 500,
                                    color: activeDetailTab === 'finance' ? '#2563eb' : '#64748b',
                                    borderBottom: activeDetailTab === 'finance' ? '2px solid #2563eb' : 'none',
                                    cursor: 'pointer',
                                    fontSize: '13px'
                                }}
                            >
                                <i className="bx bx-building" style={{ marginRight: '6px' }}></i>
                                S-4G Finance Handoff
                            </button>
                        </div>

                        {/* Modal Tab Body */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
                            {detailLoading ? (
                                <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                                    <i className="bx bx-loader-alt bx-spin" style={{ fontSize: '24px' }}></i>
                                    <div style={{ marginTop: '8px' }}>Loading run items...</div>
                                </div>
                            ) : activeDetailTab === 'payslips' ? (
                                <div>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#475569', textAlign: 'left' }}>
                                                <th style={{ padding: '8px 12px' }}>Employee</th>
                                                <th style={{ padding: '8px 12px' }}>Designation</th>
                                                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Duty Pay</th>
                                                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Gross</th>
                                                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Statutory</th>
                                                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Total Ded.</th>
                                                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Net Salary</th>
                                                <th style={{ padding: '8px 12px', textAlign: 'center' }}>Payslip</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {runPayslips.map((slip) => {
                                                const statutory = Number(slip.eobi_employee || 0) + Number(slip.sessi_employee || 0) + Number(slip.pessi_employee || 0);
                                                return (
                                                    <tr key={slip.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                        <td style={{ padding: '8px 12px' }}>
                                                            <div style={{ fontWeight: 600, color: '#0f172a' }}>{slip.employee_name}</div>
                                                            <div style={{ fontSize: '11px', color: '#64748b' }}>{slip.employee_code}</div>
                                                        </td>
                                                        <td style={{ padding: '8px 12px', color: '#334155' }}>
                                                            {slip.designation_name || 'Guard'}
                                                        </td>
                                                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                                                            ₨ {Number(slip.duty_earnings || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                        </td>
                                                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 500, color: '#15803d' }}>
                                                            ₨ {Number(slip.gross_earnings || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                        </td>
                                                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#b91c1c' }}>
                                                            ₨ {statutory.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                        </td>
                                                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#b91c1c' }}>
                                                            ₨ {Number(slip.total_deductions || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                        </td>
                                                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#1e3a8a' }}>
                                                            ₨ {Number(slip.net_salary || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                        </td>
                                                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                                            <Button
                                                                variant="secondary"
                                                                size="sm"
                                                                onClick={() => {
                                                                    setSelectedPayslip(slip);
                                                                    setPayslipModalOpen(true);
                                                                }}
                                                            >
                                                                <i className="bx bx-printer" style={{ marginRight: '4px' }}></i>
                                                                Print
                                                            </Button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div>
                                    {financeStatus ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                            <div style={{
                                                padding: '16px',
                                                backgroundColor: financeStatus.integrated ? '#f0fdf4' : '#fffbeb',
                                                border: `1px solid ${financeStatus.integrated ? '#bbf7d0' : '#fde68a'}`,
                                                borderRadius: '6px'
                                            }}>
                                                <div style={{ fontWeight: 600, color: financeStatus.integrated ? '#166534' : '#92400e', fontSize: '14px' }}>
                                                    {financeStatus.integrated ? 'Payroll Accounting Integration Active (Liability Recognized)' : 'Payroll Not Yet Finalized / Integrated'}
                                                </div>
                                                <div style={{ fontSize: '13px', color: '#4b5563', marginTop: '4px' }}>
                                                    {financeStatus.integrated
                                                        ? 'On finalization, payroll liabilities are recognized in Finance S-4G. In accordance with financial separation of duties, Salary Payment Batches are NOT generated automatically. Finance explicitly creates disbursement batches selecting treasury accounts and banking channels.'
                                                        : 'Finalize the payroll run to post payroll liabilities and enable salary disbursement in Finance S-4G.'}
                                                </div>
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                                                <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                                    <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Accounting Integration ID:</span>
                                                    <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '12px', marginTop: '2px', wordBreak: 'break-all' }}>
                                                        {financeStatus.id || 'Pending Finalization'}
                                                    </div>
                                                </div>
                                                <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                                    <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Net Payroll Liability:</span>
                                                    <div style={{ fontWeight: 700, color: '#1e3a8a', fontSize: '14px', marginTop: '2px' }}>
                                                        ₨ {Number(financeStatus.net_payroll_payable || selectedRun.net_payroll || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </div>
                                                </div>
                                                <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                                    <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Remaining Liability:</span>
                                                    <div style={{ fontWeight: 700, color: '#b91c1c', fontSize: '14px', marginTop: '2px' }}>
                                                        ₨ {Number(financeStatus.remaining_liability || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </div>
                                                </div>
                                                <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                                    <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Control Account:</span>
                                                    <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '13px', marginTop: '2px' }}>
                                                        {financeStatus.payroll_payable_account ? `A/C ${financeStatus.payroll_payable_account}` : 'Configured AP Account'}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Salary Payment Batches Section */}
                                            <div style={{
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '6px',
                                                padding: '16px',
                                                backgroundColor: '#f8fafc'
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>
                                                        Salary Payment Batches (Finance S-4G)
                                                    </h4>
                                                    <span style={{ fontSize: '12px', color: '#64748b' }}>
                                                        Initiated & disbursed explicitly by Finance Treasury
                                                    </span>
                                                </div>
                                                {financeStatus.payment_batches && financeStatus.payment_batches.length > 0 ? (
                                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginTop: '8px' }}>
                                                        <thead>
                                                            <tr style={{ borderBottom: '1px solid #cbd5e1', textAlign: 'left', color: '#475569' }}>
                                                                <th style={{ padding: '6px 8px' }}>Batch #</th>
                                                                <th style={{ padding: '6px 8px' }}>Payment Date</th>
                                                                <th style={{ padding: '6px 8px', textAlign: 'center' }}>Employees</th>
                                                                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Total Amount</th>
                                                                <th style={{ padding: '6px 8px', textAlign: 'center' }}>Status</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {financeStatus.payment_batches.map((b: any) => (
                                                                <tr key={b.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                                    <td style={{ padding: '6px 8px', fontWeight: 600 }}>{b.batch_number}</td>
                                                                    <td style={{ padding: '6px 8px' }}>{b.payment_date}</td>
                                                                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>{b.total_employees}</td>
                                                                    <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>
                                                                        ₨ {Number(b.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                                    </td>
                                                                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                                                        <span style={{
                                                                            backgroundColor: '#e0f2fe',
                                                                            color: '#0369a1',
                                                                            padding: '2px 6px',
                                                                            borderRadius: '4px',
                                                                            fontSize: '11px',
                                                                            fontWeight: 600
                                                                        }}>
                                                                            {b.status}
                                                                        </span>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                ) : (
                                                    <div style={{
                                                        padding: '12px',
                                                        backgroundColor: '#ffffff',
                                                        borderRadius: '4px',
                                                        border: '1px dashed #cbd5e1',
                                                        fontSize: '12px',
                                                        color: '#64748b',
                                                        marginTop: '8px'
                                                    }}>
                                                        <i className="bx bx-info-circle" style={{ marginRight: '6px' }}></i>
                                                        No payment batches created yet. Finalization recognizes the payroll liability in Finance; salary payment batches are explicitly created and processed by the Finance Treasury team.
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ color: '#64748b', textAlign: 'center', padding: '24px' }}>
                                            No Finance integration record available.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Payslip Print Modal */}
            <PayslipPrintModal
                isOpen={payslipModalOpen}
                onClose={() => setPayslipModalOpen(false)}
                payslip={selectedPayslip}
            />
        </div>
    );
};
