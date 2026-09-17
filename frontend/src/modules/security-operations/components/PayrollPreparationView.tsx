import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import {
    getPayrollPreparationWorkspace,
    calculateEmployeePayroll,
    calculatePeriodPayroll,
    markCalculationReady
} from '../api';
import type {
    EmployeePayrollCalculationItem,
    PayrollPreparationWorkspace
} from '../types';
import { PayrollCalculationDetailModal } from './PayrollCalculationDetailModal';
import { PayrollAdditionModal } from './PayrollAdditionModal';
import { PayrollDeductionModal } from './PayrollDeductionModal';

export const PayrollPreparationView: React.FC = () => {
    // Current month start & end defaults
    const now = new Date();
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    const [periodStart, setPeriodStart] = useState<string>(defaultStart);
    const [periodEnd, setPeriodEnd] = useState<string>(defaultEnd);
    const [classificationFilter, setClassificationFilter] = useState<'ALL' | 'DIRECT' | 'INDIRECT'>('ALL');
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [searchQuery, setSearchQuery] = useState<string>('');

    const [workspace, setWorkspace] = useState<PayrollPreparationWorkspace | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [calculatingPeriod, setCalculatingPeriod] = useState<boolean>(false);
    const [recalculatingEmpId, setRecalculatingEmpId] = useState<string | null>(null);
    const [markingReadyId, setMarkingReadyId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Modals
    const [selectedCalculationId, setSelectedCalculationId] = useState<string | null>(null);
    const [additionModalOpen, setAdditionModalOpen] = useState<boolean>(false);
    const [deductionModalOpen, setDeductionModalOpen] = useState<boolean>(false);

    const fetchWorkspace = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await getPayrollPreparationWorkspace({
                period_start: periodStart,
                period_end: periodEnd,
                classification: classificationFilter === 'ALL' ? undefined : classificationFilter,
                status: statusFilter === 'ALL' ? undefined : statusFilter,
                search: searchQuery || undefined
            });
            setWorkspace(data);
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Failed to load payroll preparation data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchWorkspace();
    }, [periodStart, periodEnd, classificationFilter, statusFilter]);

    // Calculate Entire Period
    const handleCalculatePeriod = async () => {
        setCalculatingPeriod(true);
        setError(null);
        setSuccessMessage(null);
        try {
            const res = await calculatePeriodPayroll({
                period_start: periodStart,
                period_end: periodEnd
            });
            setSuccessMessage(`Period calculation complete: ${res.calculated_count} calculated, ${res.blocked_count} blocked.`);
            await fetchWorkspace();
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Bulk period calculation failed');
        } finally {
            setCalculatingPeriod(false);
        }
    };

    // Recalculate single employee
    const handleRecalculateEmployee = async (employeeId: string) => {
        setRecalculatingEmpId(employeeId);
        setError(null);
        setSuccessMessage(null);
        try {
            const res = await calculateEmployeePayroll({
                employee_id: employeeId,
                period_start: periodStart,
                period_end: periodEnd,
                force_recalculate: true
            });
            setSuccessMessage(`Recalculated payroll for ${res.employee_name}. Net: ₨ ${res.net_payable}`);
            await fetchWorkspace();
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Recalculation failed');
        } finally {
            setRecalculatingEmpId(null);
        }
    };

    // Mark single calculation Ready
    const handleMarkReady = async (calcId: string) => {
        setMarkingReadyId(calcId);
        setError(null);
        setSuccessMessage(null);
        try {
            await markCalculationReady({ calculation_id: calcId });
            setSuccessMessage('Calculation successfully marked as READY.');
            await fetchWorkspace();
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Could not mark calculation ready');
        } finally {
            setMarkingReadyId(null);
        }
    };

    const records = workspace?.records || [];
    const totals = workspace?.totals || {
        total_records: 0,
        total_gross_earnings: 0,
        total_net_payable: 0,
        total_statutory_deductions: 0,
        total_ot_amount: 0,
        total_advance_recovery: 0,
        blocked_count: 0,
        ready_count: 0,
        calculated_count: 0
    };

    // Client-side search filter
    const filteredRecords = useMemo(() => {
        if (!searchQuery.trim()) return records;
        const q = searchQuery.toLowerCase();
        return records.filter((r: EmployeePayrollCalculationItem) =>
            r.employee_name.toLowerCase().includes(q) ||
            r.employee_code.toLowerCase().includes(q) ||
            (r.designation_name && r.designation_name.toLowerCase().includes(q))
        );
    }, [records, searchQuery]);

    const formatCurrency = (val: string | number) => {
        const num = typeof val === 'string' ? parseFloat(val) : val;
        if (isNaN(num)) return '₨ 0.00';
        return `₨ ${num.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const renderStatusBadge = (r: EmployeePayrollCalculationItem) => {
        if (r.status === 'BLOCKED') {
            return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-start' }}>
                    <span
                        title={r.blocking_reasons?.join('; ')}
                        style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 700,
                            background: 'rgba(239, 68, 68, 0.2)',
                            color: '#f87171',
                            border: '1px solid #ef4444',
                            cursor: 'help'
                        }}
                    >
                        ⚠️ BLOCKED ({r.blocking_reasons?.length || 1})
                    </span>
                    {r.blocking_reasons && r.blocking_reasons.length > 0 && (
                        <span style={{ fontSize: '10px', color: '#fca5a5', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.blocking_reasons[0]}
                        </span>
                    )}
                </div>
            );
        }
        if (r.status === 'READY') {
            return (
                <span style={{
                    padding: '3px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 700,
                    background: 'rgba(16, 185, 129, 0.2)',
                    color: '#34d399',
                    border: '1px solid #10b981'
                }}>
                    ✓ READY
                </span>
            );
        }
        if (r.status === 'CALCULATED') {
            return (
                <span style={{
                    padding: '3px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    background: 'rgba(59, 130, 246, 0.15)',
                    color: '#60a5fa',
                    border: '1px solid #3b82f6'
                }}>
                    ● CALCULATED
                </span>
            );
        }
        return (
            <span style={{
                padding: '3px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 600,
                background: 'rgba(148, 163, 184, 0.15)',
                color: '#94a3b8',
                border: '1px solid #475569'
            }}>
                DRAFT
            </span>
        );
    };

    return (
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Top Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: 'var(--color-text, #f8fafc)' }}>
                        Payroll Preparation & Calculation Rules
                    </h1>
                    <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                        Duty earnings, statutory schemes (EOBI/SESSI), overtime, additions, safe advance recovery & net payable
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <Button
                        variant="primary"
                        onClick={handleCalculatePeriod}
                        disabled={loading || calculatingPeriod}
                    >
                        {calculatingPeriod ? 'Calculating Entire Period...' : '⚡ Run Period Calculation'}
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={() => setAdditionModalOpen(true)}
                    >
                        + Add Addition / Bonus
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={() => setDeductionModalOpen(true)}
                    >
                        + Add Deduction
                    </Button>
                    <Button variant="secondary" onClick={fetchWorkspace} disabled={loading}>
                        ↻ Refresh
                    </Button>
                </div>
            </div>

            {/* Notification Messages */}
            {error && (
                <div style={{
                    padding: '12px 16px',
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid #ef4444',
                    borderRadius: '8px',
                    color: '#f87171',
                    fontSize: '13px'
                }}>
                    {error}
                </div>
            )}
            {successMessage && (
                <div style={{
                    padding: '12px 16px',
                    background: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid #10b981',
                    borderRadius: '8px',
                    color: '#34d399',
                    fontSize: '13px'
                }}>
                    {successMessage}
                </div>
            )}

            {/* Period Selector & Filter Controls Bar */}
            <div style={{
                background: 'var(--color-surface, #1e293b)',
                border: '1px solid var(--color-border, #334155)',
                borderRadius: '10px',
                padding: '16px',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '16px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary, #94a3b8)' }}>
                        Payroll Period:
                    </label>
                    <Input
                        type="date"
                        value={periodStart}
                        onChange={(e) => setPeriodStart(e.target.value)}
                        style={{ width: '135px', padding: '6px 10px', fontSize: '13px' }}
                    />
                    <span style={{ color: 'var(--color-text-secondary, #94a3b8)' }}>to</span>
                    <Input
                        type="date"
                        value={periodEnd}
                        onChange={(e) => setPeriodEnd(e.target.value)}
                        style={{ width: '135px', padding: '6px 10px', fontSize: '13px' }}
                    />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary, #94a3b8)' }}>
                        Classification:
                    </label>
                    <select
                        style={{
                            padding: '6px 10px',
                            background: 'var(--color-surface, #1e293b)',
                            border: '1px solid var(--color-border, #334155)',
                            borderRadius: '6px',
                            color: 'var(--color-text, #f8fafc)',
                            fontSize: '13px'
                        }}
                        value={classificationFilter}
                        onChange={(e) => setClassificationFilter(e.target.value as any)}
                    >
                        <option value="ALL">All Classifications</option>
                        <option value="DIRECT">Direct (Field/Guards)</option>
                        <option value="INDIRECT">Indirect (Office/Staff)</option>
                    </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary, #94a3b8)' }}>
                        Status:
                    </label>
                    <select
                        style={{
                            padding: '6px 10px',
                            background: 'var(--color-surface, #1e293b)',
                            border: '1px solid var(--color-border, #334155)',
                            borderRadius: '6px',
                            color: 'var(--color-text, #f8fafc)',
                            fontSize: '13px'
                        }}
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                    >
                        <option value="ALL">All Statuses</option>
                        <option value="CALCULATED">Calculated</option>
                        <option value="BLOCKED">Blocked</option>
                        <option value="READY">Ready for Run</option>
                        <option value="DRAFT">Draft</option>
                    </select>
                </div>

                <div style={{ flex: 1, minWidth: '200px' }}>
                    <Input
                        placeholder="Search employee name, code, designation..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{ padding: '6px 10px', fontSize: '13px' }}
                    />
                </div>
            </div>

            {/* KPI Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '14px' }}>
                <div style={{
                    background: 'var(--color-surface, #1e293b)',
                    border: '1px solid var(--color-border, #334155)',
                    borderRadius: '8px',
                    padding: '14px 16px'
                }}>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-secondary, #94a3b8)', fontWeight: 500 }}>
                        Total Prepared
                    </span>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-text, #f8fafc)', marginTop: '4px' }}>
                        {totals.total_records}
                    </div>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>Calculations in period</span>
                </div>

                <div style={{
                    background: 'var(--color-surface, #1e293b)',
                    border: '1px solid var(--color-border, #334155)',
                    borderRadius: '8px',
                    padding: '14px 16px'
                }}>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-secondary, #94a3b8)', fontWeight: 500 }}>
                        Total Gross Earnings
                    </span>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#38bdf8', marginTop: '4px' }}>
                        {formatCurrency(totals.total_gross_earnings)}
                    </div>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>Duty + OT + Additions</span>
                </div>

                <div style={{
                    background: 'var(--color-surface, #1e293b)',
                    border: '1px solid var(--color-border, #334155)',
                    borderRadius: '8px',
                    padding: '14px 16px'
                }}>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-secondary, #94a3b8)', fontWeight: 500 }}>
                        Statutory Deductions
                    </span>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#f87171', marginTop: '4px' }}>
                        -{formatCurrency(totals.total_statutory_deductions)}
                    </div>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>EOBI & SESSI/PESSI (Emp)</span>
                </div>

                <div style={{
                    background: 'var(--color-surface, #1e293b)',
                    border: '1px solid var(--color-border, #334155)',
                    borderRadius: '8px',
                    padding: '14px 16px'
                }}>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-secondary, #94a3b8)', fontWeight: 500 }}>
                        Advance Recovered
                    </span>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#fb923c', marginTop: '4px' }}>
                        -{formatCurrency(totals.total_advance_recovery)}
                    </div>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>Non-over-recovery safe</span>
                </div>

                <div style={{
                    background: 'var(--color-surface, #1e293b)',
                    border: '1px solid var(--color-border, #334155)',
                    borderRadius: '8px',
                    padding: '14px 16px'
                }}>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-secondary, #94a3b8)', fontWeight: 500 }}>
                        Total Net Payable
                    </span>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#34d399', marginTop: '4px' }}>
                        {formatCurrency(totals.total_net_payable)}
                    </div>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>Authorized Take-Home</span>
                </div>

                <div style={{
                    background: totals.blocked_count > 0 ? 'rgba(239, 68, 68, 0.1)' : 'var(--color-surface, #1e293b)',
                    border: `1px solid ${totals.blocked_count > 0 ? '#ef4444' : 'var(--color-border, #334155)'}`,
                    borderRadius: '8px',
                    padding: '14px 16px'
                }}>
                    <span style={{ fontSize: '12px', color: totals.blocked_count > 0 ? '#f87171' : 'var(--color-text-secondary, #94a3b8)', fontWeight: 600 }}>
                        Blocked Calculations
                    </span>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: totals.blocked_count > 0 ? '#f87171' : 'var(--color-text, #f8fafc)', marginTop: '4px' }}>
                        {totals.blocked_count}
                    </div>
                    <span style={{ fontSize: '11px', color: totals.blocked_count > 0 ? '#fca5a5' : '#64748b' }}>
                        {totals.blocked_count > 0 ? 'Requires remediation' : 'No blockers'}
                    </span>
                </div>

                <div style={{
                    background: 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    borderRadius: '8px',
                    padding: '14px 16px'
                }}>
                    <span style={{ fontSize: '12px', color: '#34d399', fontWeight: 600 }}>
                        Ready for Run
                    </span>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#34d399', marginTop: '4px' }}>
                        {totals.ready_count}
                    </div>
                    <span style={{ fontSize: '11px', color: '#6ee7b7' }}>Ready for Phase S-5G</span>
                </div>
            </div>

            {/* Main Records Table */}
            <div style={{
                background: 'var(--color-surface, #1e293b)',
                border: '1px solid var(--color-border, #334155)',
                borderRadius: '10px',
                overflow: 'hidden'
            }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border, #334155)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--color-text, #f8fafc)' }}>
                        Employee Payroll Breakdown ({filteredRecords.length})
                    </h3>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                        Showing {filteredRecords.length} of {records.length} records
                    </span>
                </div>

                {loading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-secondary, #94a3b8)' }}>
                        Loading payroll calculations...
                    </div>
                ) : filteredRecords.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-secondary, #94a3b8)' }}>
                        No payroll calculation records found for the selected period and filters.
                        <div style={{ marginTop: '12px' }}>
                            <Button variant="primary" onClick={handleCalculatePeriod} disabled={calculatingPeriod}>
                                ⚡ Run Calculation for Period ({periodStart} to {periodEnd})
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ background: 'rgba(15, 23, 42, 0.6)', borderBottom: '1px solid var(--color-border, #334155)' }}>
                                    <th style={{ padding: '12px 14px', color: 'var(--color-text-secondary, #94a3b8)', fontWeight: 600 }}>Employee</th>
                                    <th style={{ padding: '12px 14px', color: 'var(--color-text-secondary, #94a3b8)', fontWeight: 600, textAlign: 'right' }}>Duty Earnings</th>
                                    <th style={{ padding: '12px 14px', color: 'var(--color-text-secondary, #94a3b8)', fontWeight: 600, textAlign: 'right' }}>Overtime (S+D)</th>
                                    <th style={{ padding: '12px 14px', color: 'var(--color-text-secondary, #94a3b8)', fontWeight: 600, textAlign: 'right' }}>Additions</th>
                                    <th style={{ padding: '12px 14px', color: 'var(--color-text-secondary, #94a3b8)', fontWeight: 600, textAlign: 'right' }}>Gross Pay</th>
                                    <th style={{ padding: '12px 14px', color: 'var(--color-text-secondary, #94a3b8)', fontWeight: 600, textAlign: 'right' }}>Statutory (Emp)</th>
                                    <th style={{ padding: '12px 14px', color: 'var(--color-text-secondary, #94a3b8)', fontWeight: 600, textAlign: 'right' }}>Other Ded.</th>
                                    <th style={{ padding: '12px 14px', color: 'var(--color-text-secondary, #94a3b8)', fontWeight: 600, textAlign: 'right' }}>Advance Rec.</th>
                                    <th style={{ padding: '12px 14px', color: 'var(--color-text-secondary, #94a3b8)', fontWeight: 600, textAlign: 'right' }}>Net Payable</th>
                                    <th style={{ padding: '12px 14px', color: 'var(--color-text-secondary, #94a3b8)', fontWeight: 600 }}>Status</th>
                                    <th style={{ padding: '12px 14px', color: 'var(--color-text-secondary, #94a3b8)', fontWeight: 600, textAlign: 'center' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRecords.map((r) => {
                                    const additionsSum = r.allowances_amount + r.bonuses_amount + r.other_additions_amount;
                                    return (
                                        <tr
                                            key={r.id}
                                            style={{
                                                borderBottom: '1px solid var(--color-border, #334155)',
                                                background: r.status === 'BLOCKED' ? 'rgba(239, 68, 68, 0.03)' : undefined
                                            }}
                                        >
                                            <td style={{ padding: '12px 14px' }}>
                                                <div style={{ fontWeight: 600, color: 'var(--color-text, #f8fafc)' }}>
                                                    {r.employee_name}
                                                </div>
                                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
                                                    <span style={{ fontSize: '11px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                                                        {r.employee_code}
                                                    </span>
                                                    <span style={{
                                                        padding: '1px 5px',
                                                        borderRadius: '3px',
                                                        fontSize: '9px',
                                                        fontWeight: 700,
                                                        background: r.classification === 'DIRECT' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(168, 85, 247, 0.15)',
                                                        color: r.classification === 'DIRECT' ? '#38bdf8' : '#a855f7'
                                                    }}>
                                                        {r.classification}
                                                    </span>
                                                    {r.designation_name && (
                                                        <span style={{ fontSize: '10px', color: '#64748b' }}>
                                                            • {r.designation_name}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                                                <div style={{ fontWeight: 600, color: 'var(--color-text, #f8fafc)' }}>
                                                    {formatCurrency(r.duty_earnings)}
                                                </div>
                                                <span style={{ fontSize: '10px', color: '#64748b' }}>
                                                    {r.duty_days_count} days
                                                </span>
                                            </td>

                                            <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                                                <div style={{ fontWeight: 500, color: '#38bdf8' }}>
                                                    {formatCurrency(r.total_ot_amount)}
                                                </div>
                                                <span style={{ fontSize: '10px', color: '#64748b' }}>
                                                    S: {formatCurrency(r.single_ot_amount)} | D: {formatCurrency(r.double_ot_amount)}
                                                </span>
                                            </td>

                                            <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                                                <div style={{ fontWeight: 500, color: '#a78bfa' }}>
                                                    {formatCurrency(additionsSum)}
                                                </div>
                                                <span style={{ fontSize: '10px', color: '#64748b' }}>
                                                    Alw: {formatCurrency(r.allowances_amount)}
                                                </span>
                                            </td>

                                            <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#38bdf8' }}>
                                                {formatCurrency(r.gross_earnings)}
                                            </td>

                                            <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                                                <div style={{ fontWeight: 600, color: '#f87171' }}>
                                                    -{formatCurrency(r.total_statutory_deductions)}
                                                </div>
                                                <span
                                                    title={`Employer Share: ${formatCurrency(r.total_employer_statutory)} (Excl. from Net)`}
                                                    style={{ fontSize: '10px', color: '#60a5fa', cursor: 'help' }}
                                                >
                                                    Empr: {formatCurrency(r.total_employer_statutory)}
                                                </span>
                                            </td>

                                            <td style={{ padding: '12px 14px', textAlign: 'right', color: '#f87171' }}>
                                                -{formatCurrency(r.total_other_deductions)}
                                            </td>

                                            <td style={{ padding: '12px 14px', textAlign: 'right', color: '#fb923c' }}>
                                                -{formatCurrency(r.advance_recovery_amount)}
                                            </td>

                                            <td style={{
                                                padding: '12px 14px',
                                                textAlign: 'right',
                                                fontWeight: 800,
                                                fontSize: '13px',
                                                color: r.net_payable < 0 ? '#ef4444' : '#10b981'
                                            }}>
                                                {formatCurrency(r.net_payable)}
                                            </td>

                                            <td style={{ padding: '12px 14px' }}>
                                                {renderStatusBadge(r)}
                                            </td>

                                            <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                                                <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                                                    <button
                                                        onClick={() => setSelectedCalculationId(r.id)}
                                                        title="Audit Line Items & Rules Breakdown"
                                                        style={{
                                                            padding: '5px 8px',
                                                            background: 'rgba(59, 130, 246, 0.15)',
                                                            border: '1px solid #3b82f6',
                                                            borderRadius: '4px',
                                                            color: '#60a5fa',
                                                            fontSize: '11px',
                                                            fontWeight: 600,
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        Audit
                                                    </button>
                                                    <button
                                                        onClick={() => handleRecalculateEmployee(r.employee_id)}
                                                        disabled={recalculatingEmpId === r.employee_id}
                                                        title="Recalculate this employee"
                                                        style={{
                                                            padding: '5px 8px',
                                                            background: 'rgba(148, 163, 184, 0.15)',
                                                            border: '1px solid #475569',
                                                            borderRadius: '4px',
                                                            color: '#94a3b8',
                                                            fontSize: '11px',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        {recalculatingEmpId === r.employee_id ? '...' : '↻'}
                                                    </button>
                                                    {r.status === 'CALCULATED' && !r.has_blockers && (
                                                        <button
                                                            onClick={() => handleMarkReady(r.id)}
                                                            disabled={markingReadyId === r.id}
                                                            title="Mark Ready for Payroll Run"
                                                            style={{
                                                                padding: '5px 8px',
                                                                background: 'rgba(16, 185, 129, 0.15)',
                                                                border: '1px solid #10b981',
                                                                borderRadius: '4px',
                                                                color: '#34d399',
                                                                fontSize: '11px',
                                                                fontWeight: 600,
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            ✓
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modals */}
            {selectedCalculationId && (
                <PayrollCalculationDetailModal
                    calculationId={selectedCalculationId}
                    onClose={() => setSelectedCalculationId(null)}
                    onStatusUpdated={fetchWorkspace}
                />
            )}

            {additionModalOpen && (
                <PayrollAdditionModal
                    isOpen={additionModalOpen}
                    onClose={() => setAdditionModalOpen(false)}
                    onSaved={fetchWorkspace}
                />
            )}

            {deductionModalOpen && (
                <PayrollDeductionModal
                    isOpen={deductionModalOpen}
                    onClose={() => setDeductionModalOpen(false)}
                    onSaved={fetchWorkspace}
                />
            )}
        </div>
    );
};
