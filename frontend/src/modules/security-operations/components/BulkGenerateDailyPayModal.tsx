import React, { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { bulkGenerateDailyDutyPay } from '../api';

interface BulkGenerateDailyPayModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    initialStartDate?: string;
    initialEndDate?: string;
}

export const BulkGenerateDailyPayModal: React.FC<BulkGenerateDailyPayModalProps> = ({
    isOpen,
    onClose,
    onSuccess,
    initialStartDate,
    initialEndDate
}) => {
    const today = new Date().toISOString().split('T')[0];
    const [startDate, setStartDate] = useState(initialStartDate || today);
    const [endDate, setEndDate] = useState(initialEndDate || today);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<{
        message: string;
        total_processed: number;
        created_count: number;
        updated_count: number;
        unresolved_count: number;
    } | null>(null);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setResult(null);

        if (!startDate || !endDate) {
            setError('Please select both start date and end date.');
            return;
        }

        if (startDate > endDate) {
            setError('Start date cannot be after end date.');
            return;
        }

        setLoading(true);
        try {
            const res = await bulkGenerateDailyDutyPay({
                start_date: startDate,
                end_date: endDate
            });
            setResult({
                message: res.message,
                total_processed: res.total_processed,
                created_count: res.created_count,
                updated_count: res.updated_count,
                unresolved_count: res.unresolved_count
            });
            setTimeout(() => {
                onSuccess();
            }, 1200);
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Failed to generate daily duty pay records.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px'
        }}>
            <div style={{
                background: 'var(--color-surface, #1e293b)',
                borderRadius: '12px',
                border: '1px solid var(--color-border, #334155)',
                width: '100%',
                maxWidth: '480px',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 10px 10px -5px rgba(0, 0, 0, 0.3)',
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
                        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--color-text, #f8fafc)' }}>
                            ⚡ Bulk Generate Daily Pay Inputs
                        </h3>
                        <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                            Resolve attendance, roster & replacement duty rates for payroll preparation
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={loading}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--color-text-secondary, #94a3b8)',
                            cursor: 'pointer',
                            fontSize: '20px',
                            padding: '4px'
                        }}
                    >
                        ✕
                    </button>
                </div>

                {/* Form Body */}
                <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    {error && (
                        <div style={{
                            padding: '12px 16px',
                            background: 'rgba(239, 68, 68, 0.15)',
                            border: '1px solid #ef4444',
                            borderRadius: '8px',
                            color: '#fca5a5',
                            fontSize: '13px'
                        }}>
                            {error}
                        </div>
                    )}

                    {result && (
                        <div style={{
                            padding: '12px 16px',
                            background: 'rgba(16, 185, 129, 0.15)',
                            border: '1px solid #10b981',
                            borderRadius: '8px',
                            color: '#6ee7b7',
                            fontSize: '13px'
                        }}>
                            <div style={{ fontWeight: 600 }}>{result.message}</div>
                            <div style={{ fontSize: '12px', marginTop: '4px' }}>
                                Processed: {result.total_processed} | Created: {result.created_count} | Updated: {result.updated_count} | Unresolved: {result.unresolved_count}
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--color-text-secondary, #94a3b8)', marginBottom: '6px' }}>
                                From Date *
                            </label>
                            <Input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                disabled={loading}
                                required
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--color-text-secondary, #94a3b8)', marginBottom: '6px' }}>
                                To Date *
                            </label>
                            <Input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                disabled={loading}
                                required
                            />
                        </div>
                    </div>

                    <div style={{
                        padding: '12px 16px',
                        background: 'rgba(59, 130, 246, 0.08)',
                        border: '1px solid rgba(59, 130, 246, 0.25)',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: 'var(--color-text-secondary, #94a3b8)',
                        lineHeight: '1.5'
                    }}>
                        <strong style={{ color: '#60a5fa' }}>Daily Duty Engine Rules:</strong>
                        <ul style={{ margin: '6px 0 0 0', paddingLeft: '18px' }}>
                            <li>Normal duty resolves employee compensation daily rate or base salary / divisor (default 30).</li>
                            <li>Temporary replacement duties automatically earn the worked post/contract rate.</li>
                            <li>Attendance percentages apply: Present (100%), Half Day (50%), Absent/Unpaid (0%).</li>
                            <li>Existing non-finalized records will be updated idempotently.</li>
                        </ul>
                    </div>

                    <div style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: '12px',
                        marginTop: '8px'
                    }}>
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={onClose}
                            disabled={loading}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            disabled={loading}
                        >
                            {loading ? 'Processing Daily Pay...' : 'Generate Daily Pay'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};
