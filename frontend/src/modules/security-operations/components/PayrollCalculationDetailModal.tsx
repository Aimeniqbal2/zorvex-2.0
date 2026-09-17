import React, { useState, useEffect } from 'react';
import { Button } from '../../../components/ui/Button';
import { getPayrollCalculationDetail, markCalculationReady } from '../api';
import type { EmployeePayrollCalculationItem, PayrollCalculationLineItem } from '../types';

interface Props {
    calculationId: string;
    onClose: () => void;
    onStatusUpdated?: () => void;
}

export const PayrollCalculationDetailModal: React.FC<Props> = ({
    calculationId,
    onClose,
    onStatusUpdated
}) => {
    const [detail, setDetail] = useState<EmployeePayrollCalculationItem | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [actionLoading, setActionLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const loadDetail = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await getPayrollCalculationDetail(calculationId);
            setDetail(data);
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Failed to load calculation details');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadDetail();
    }, [calculationId]);

    const handleMarkReady = async () => {
        if (!detail) return;
        setActionLoading(true);
        setError(null);
        setSuccessMessage(null);
        try {
            const updated = await markCalculationReady({ calculation_id: detail.id });
            setDetail(updated);
            setSuccessMessage('Payroll calculation marked as READY for final payroll run.');
            if (onStatusUpdated) onStatusUpdated();
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Failed to mark as ready');
        } finally {
            setActionLoading(false);
        }
    };

    const formatCurrency = (val: string | number | undefined) => {
        if (val === undefined || val === null) return '₨ 0.00';
        const num = typeof val === 'string' ? parseFloat(val) : val;
        if (isNaN(num)) return '₨ 0.00';
        return `₨ ${num.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const lines: PayrollCalculationLineItem[] = detail?.lines || [];

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
        }}>
            <div style={{
                background: 'var(--color-surface, #1e293b)',
                borderRadius: '12px',
                border: '1px solid var(--color-border, #334155)',
                width: '100%',
                maxWidth: '1000px',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                overflow: 'hidden'
            }}>
                {/* Header */}
                <div style={{
                    padding: '20px 24px',
                    borderBottom: '1px solid var(--color-border, #334155)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--color-text, #f8fafc)' }}>
                                Payroll Calculation Audit & Breakdown
                            </h2>
                            {detail?.status === 'BLOCKED' && (
                                <span style={{
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    background: 'rgba(239, 68, 68, 0.2)',
                                    color: '#f87171',
                                    border: '1px solid #ef4444'
                                }}>
                                    ⚠️ BLOCKED
                                </span>
                            )}
                            {detail?.status === 'READY' && (
                                <span style={{
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    background: 'rgba(16, 185, 129, 0.2)',
                                    color: '#34d399',
                                    border: '1px solid #10b981'
                                }}>
                                    ✓ READY
                                </span>
                            )}
                            {detail?.status === 'CALCULATED' && (
                                <span style={{
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    background: 'rgba(59, 130, 246, 0.2)',
                                    color: '#60a5fa',
                                    border: '1px solid #3b82f6'
                                }}>
                                    ● CALCULATED
                                </span>
                            )}
                        </div>
                        <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                            {detail ? `${detail.employee_name} (${detail.employee_code}) — Period: ${detail.period_start} to ${detail.period_end}` : 'Loading...'}
                        </p>
                    </div>

                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--color-text-secondary, #94a3b8)',
                            fontSize: '20px',
                            cursor: 'pointer'
                        }}
                    >
                        ✕
                    </button>
                </div>

                {/* Content */}
                <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {error && (
                        <div style={{
                            padding: '12px 16px',
                            background: 'rgba(239, 68, 68, 0.1)',
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
                            background: 'rgba(16, 185, 129, 0.1)',
                            border: '1px solid #10b981',
                            borderRadius: '8px',
                            color: '#34d399',
                            fontSize: '13px'
                        }}>
                            {successMessage}
                        </div>
                    )}

                    {/* Blockers alert */}
                    {detail?.has_blockers && detail.blocking_reasons && detail.blocking_reasons.length > 0 && (
                        <div style={{
                            padding: '14px 18px',
                            background: 'rgba(239, 68, 68, 0.12)',
                            border: '1px solid rgba(239, 68, 68, 0.4)',
                            borderRadius: '8px'
                        }}>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#f87171', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>⚠️</span>
                                <span>Calculation Blocked ({detail.blocking_reasons.length} issue{detail.blocking_reasons.length > 1 ? 's' : ''}):</span>
                            </div>
                            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', color: '#fca5a5' }}>
                                {detail.blocking_reasons.map((reason, idx) => (
                                    <li key={idx} style={{ marginBottom: '3px' }}>{reason}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Employer statutory contribution info banner */}
                    {detail && detail.total_employer_statutory > 0 && (
                        <div style={{
                            padding: '12px 16px',
                            background: 'rgba(59, 130, 246, 0.08)',
                            border: '1px solid rgba(59, 130, 246, 0.3)',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            fontSize: '12px',
                            color: '#93c5fd'
                        }}>
                            <span style={{ fontSize: '16px' }}>ℹ️</span>
                            <span>
                                <strong>Employer Statutory Contribution:</strong> {formatCurrency(detail.total_employer_statutory)} (EOBI: {formatCurrency(detail.eobi_employer_amount)}, SESSI: {formatCurrency(detail.sessi_employer_amount)}, PESSI: {formatCurrency(detail.pessi_employer_amount)}) is an employer liability and is <strong>strictly excluded</strong> from employee deductions.
                            </span>
                        </div>
                    )}

                    {/* Financial Summary Grid */}
                    {detail && (
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))',
                            gap: '12px',
                            background: 'rgba(15, 23, 42, 0.4)',
                            padding: '14px',
                            borderRadius: '8px',
                            border: '1px solid var(--color-border, #334155)'
                        }}>
                            <div>
                                <span style={{ fontSize: '11px', color: 'var(--color-text-secondary, #94a3b8)', textTransform: 'uppercase' }}>Duty Earnings</span>
                                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text, #f8fafc)', marginTop: '2px' }}>
                                    {formatCurrency(detail.duty_earnings)}
                                </div>
                                <span style={{ fontSize: '10px', color: '#64748b' }}>{detail.duty_days_count} days worked</span>
                            </div>

                            <div>
                                <span style={{ fontSize: '11px', color: 'var(--color-text-secondary, #94a3b8)', textTransform: 'uppercase' }}>Overtime Total</span>
                                <div style={{ fontSize: '14px', fontWeight: 600, color: '#38bdf8', marginTop: '2px' }}>
                                    {formatCurrency(detail.total_ot_amount)}
                                </div>
                                <span style={{ fontSize: '10px', color: '#64748b' }}>
                                    S: {formatCurrency(detail.single_ot_amount)} | D: {formatCurrency(detail.double_ot_amount)}
                                </span>
                            </div>

                            <div>
                                <span style={{ fontSize: '11px', color: 'var(--color-text-secondary, #94a3b8)', textTransform: 'uppercase' }}>Additions</span>
                                <div style={{ fontSize: '14px', fontWeight: 600, color: '#a78bfa', marginTop: '2px' }}>
                                    {formatCurrency(detail.allowances_amount + detail.bonuses_amount + detail.other_additions_amount)}
                                </div>
                                <span style={{ fontSize: '10px', color: '#64748b' }}>
                                    Allowances & Bonuses
                                </span>
                            </div>

                            <div>
                                <span style={{ fontSize: '11px', color: 'var(--color-text-secondary, #94a3b8)', textTransform: 'uppercase' }}>Gross Earnings</span>
                                <div style={{ fontSize: '15px', fontWeight: 700, color: '#34d399', marginTop: '2px' }}>
                                    {formatCurrency(detail.gross_earnings)}
                                </div>
                                <span style={{ fontSize: '10px', color: '#64748b' }}>Before Deductions</span>
                            </div>

                            <div>
                                <span style={{ fontSize: '11px', color: 'var(--color-text-secondary, #94a3b8)', textTransform: 'uppercase' }}>Statutory Deductions</span>
                                <div style={{ fontSize: '14px', fontWeight: 600, color: '#f87171', marginTop: '2px' }}>
                                    -{formatCurrency(detail.total_statutory_deductions)}
                                </div>
                                <span style={{ fontSize: '10px', color: '#64748b' }}>
                                    EOBI: {formatCurrency(detail.eobi_employee_amount)} | SESSI: {formatCurrency(detail.sessi_employee_amount)} | PESSI: {formatCurrency(detail.pessi_employee_amount)}
                                </span>
                            </div>

                            <div>
                                <span style={{ fontSize: '11px', color: 'var(--color-text-secondary, #94a3b8)', textTransform: 'uppercase' }}>Advance Recovery</span>
                                <div style={{ fontSize: '14px', fontWeight: 600, color: '#fb923c', marginTop: '2px' }}>
                                    -{formatCurrency(detail.advance_recovery_amount)}
                                </div>
                                <span style={{ fontSize: '10px', color: '#64748b' }}>Directly Settled</span>
                            </div>

                            <div>
                                <span style={{ fontSize: '11px', color: 'var(--color-text-secondary, #94a3b8)', textTransform: 'uppercase' }}>Other Deductions</span>
                                <div style={{ fontSize: '14px', fontWeight: 600, color: '#f87171', marginTop: '2px' }}>
                                    -{formatCurrency(detail.total_other_deductions)}
                                </div>
                                <span style={{ fontSize: '10px', color: '#64748b' }}>Patrolling, Ins., etc.</span>
                            </div>

                            <div style={{
                                background: 'rgba(16, 185, 129, 0.1)',
                                padding: '6px 10px',
                                borderRadius: '6px',
                                border: '1px solid rgba(16, 185, 129, 0.3)'
                            }}>
                                <span style={{ fontSize: '11px', color: '#34d399', fontWeight: 700, textTransform: 'uppercase' }}>Net Payable</span>
                                <div style={{
                                    fontSize: '16px',
                                    fontWeight: 800,
                                    color: detail.net_payable < 0 ? '#ef4444' : '#10b981',
                                    marginTop: '2px'
                                }}>
                                    {formatCurrency(detail.net_payable)}
                                </div>
                                <span style={{ fontSize: '10px', color: '#64748b' }}>Authorized Net</span>
                            </div>
                        </div>
                    )}

                    {/* Line Items Table */}
                    <div>
                        <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: 600, color: 'var(--color-text, #f8fafc)' }}>
                            Calculation Line Items ({lines.length})
                        </h3>

                        {loading ? (
                            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--color-text-secondary, #94a3b8)' }}>
                                Loading line items...
                            </div>
                        ) : lines.length === 0 ? (
                            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--color-text-secondary, #94a3b8)', background: 'rgba(15, 23, 42, 0.2)', borderRadius: '8px' }}>
                                No line items recorded for this calculation.
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto', border: '1px solid var(--color-border, #334155)', borderRadius: '8px' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                                    <thead>
                                        <tr style={{ background: 'rgba(15, 23, 42, 0.6)', borderBottom: '1px solid var(--color-border, #334155)' }}>
                                            <th style={{ padding: '10px 12px', color: 'var(--color-text-secondary, #94a3b8)', fontWeight: 600 }}>Type</th>
                                            <th style={{ padding: '10px 12px', color: 'var(--color-text-secondary, #94a3b8)', fontWeight: 600 }}>Description</th>
                                            <th style={{ padding: '10px 12px', color: 'var(--color-text-secondary, #94a3b8)', fontWeight: 600 }}>Date</th>
                                            <th style={{ padding: '10px 12px', color: 'var(--color-text-secondary, #94a3b8)', fontWeight: 600, textAlign: 'right' }}>Units</th>
                                            <th style={{ padding: '10px 12px', color: 'var(--color-text-secondary, #94a3b8)', fontWeight: 600, textAlign: 'right' }}>Rate</th>
                                            <th style={{ padding: '10px 12px', color: 'var(--color-text-secondary, #94a3b8)', fontWeight: 600, textAlign: 'right' }}>Amount</th>
                                            <th style={{ padding: '10px 12px', color: 'var(--color-text-secondary, #94a3b8)', fontWeight: 600, textAlign: 'right' }}>Employer Share</th>
                                            <th style={{ padding: '10px 12px', color: 'var(--color-text-secondary, #94a3b8)', fontWeight: 600 }}>Notes / Audit Source</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {lines.map((line) => {
                                            const isEarning = line.category === 'EARNING';
                                            return (
                                                <tr key={line.id} style={{ borderBottom: '1px solid var(--color-border, #334155)' }}>
                                                    <td style={{ padding: '8px 12px' }}>
                                                        <span style={{
                                                            padding: '2px 6px',
                                                            borderRadius: '3px',
                                                            fontSize: '10px',
                                                            fontWeight: 600,
                                                            background: isEarning ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                                            color: isEarning ? '#34d399' : '#f87171'
                                                        }}>
                                                            {line.line_type}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '8px 12px', fontWeight: 500, color: 'var(--color-text, #f8fafc)' }}>
                                                        {line.description}
                                                    </td>
                                                    <td style={{ padding: '8px 12px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                                                        {line.duty_date || '—'}
                                                    </td>
                                                    <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--color-text-secondary, #94a3b8)' }}>
                                                        {line.units}
                                                    </td>
                                                    <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--color-text-secondary, #94a3b8)' }}>
                                                        {formatCurrency(line.rate)}
                                                    </td>
                                                    <td style={{
                                                        padding: '8px 12px',
                                                        textAlign: 'right',
                                                        fontWeight: 600,
                                                        color: isEarning ? '#34d399' : '#f87171'
                                                    }}>
                                                        {isEarning ? '+' : '-'}{formatCurrency(line.amount)}
                                                    </td>
                                                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#60a5fa' }}>
                                                        {Number(line.employer_amount) > 0 ? formatCurrency(line.employer_amount) : '—'}
                                                    </td>
                                                    <td style={{ padding: '8px 12px', color: 'var(--color-text-secondary, #94a3b8)', fontSize: '11px' }}>
                                                        {line.notes || '—'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div style={{
                    padding: '16px 24px',
                    borderTop: '1px solid var(--color-border, #334155)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'rgba(15, 23, 42, 0.3)'
                }}>
                    <div>
                        {detail && (
                            <span style={{ fontSize: '12px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                                Status: <strong>{detail.status}</strong>
                            </span>
                        )}
                    </div>

                    <div style={{ display: 'flex', gap: '10px' }}>
                        {detail && detail.status !== 'READY' && (
                            <Button
                                variant="primary"
                                onClick={handleMarkReady}
                                disabled={actionLoading || detail.has_blockers}
                            >
                                {actionLoading ? 'Verifying...' : '✓ Mark Ready for Payroll Run'}
                            </Button>
                        )}
                        <Button variant="secondary" onClick={onClose}>
                            Close
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};
