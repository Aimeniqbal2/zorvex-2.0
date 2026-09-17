import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { getEmployeeAttendanceHistory } from '../api';
import type { EmployeeAttendanceHistoryItem, AttendanceStatusCode } from '../types';

interface AttendanceHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    employeeId: string | null;
    employeeName: string | null;
    employeeCode?: string | null;
}

const getStatusBadgeStyle = (status: AttendanceStatusCode): { bg: string; color: string; border: string } => {
    switch (status) {
        case 'PRESENT':
            return { bg: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', border: 'rgba(34, 197, 94, 0.3)' };
        case 'ABSENT':
            return { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: 'rgba(239, 68, 68, 0.3)' };
        case 'PAID_LEAVE':
            return { bg: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', border: 'rgba(59, 130, 246, 0.3)' };
        case 'UNPAID_LEAVE':
            return { bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: 'rgba(245, 158, 11, 0.3)' };
        case 'HOLIDAY':
            return { bg: 'rgba(168, 85, 247, 0.15)', color: '#a855f7', border: 'rgba(168, 85, 247, 0.3)' };
        case 'WEEKLY_OFF':
            return { bg: 'rgba(100, 116, 139, 0.15)', color: '#94a3b8', border: 'rgba(100, 116, 139, 0.3)' };
        case 'HALF_DAY':
            return { bg: 'rgba(20, 184, 166, 0.15)', color: '#14b8a6', border: 'rgba(20, 184, 166, 0.3)' };
        default:
            return { bg: 'rgba(148, 163, 184, 0.1)', color: '#94a3b8', border: 'transparent' };
    }
};

export const AttendanceHistoryModal: React.FC<AttendanceHistoryModalProps> = ({
    isOpen,
    onClose,
    employeeId,
    employeeName,
    employeeCode
}) => {
    const [history, setHistory] = useState<EmployeeAttendanceHistoryItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [dateFrom, setDateFrom] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d.toISOString().split('T')[0];
    });
    const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);

    const fetchHistory = async () => {
        if (!employeeId) return;
        setLoading(true);
        setError(null);
        try {
            const data = await getEmployeeAttendanceHistory(employeeId, dateFrom, dateTo);
            setHistory(data);
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Failed to fetch history');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen && employeeId) {
            fetchHistory();
        }
    }, [isOpen, employeeId]);

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Attendance History — ${employeeName || 'Employee'}`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: '650px' }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'var(--color-surface, #1e293b)',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border, #334155)'
                }}>
                    <div>
                        <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text, #f8fafc)' }}>
                            {employeeName}
                        </span>
                        {employeeCode && (
                            <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                                ({employeeCode})
                            </span>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <Input
                            type="date"
                            value={dateFrom}
                            onChange={e => setDateFrom(e.target.value)}
                            style={{ width: '140px', padding: '6px 10px', fontSize: '13px' }}
                        />
                        <span style={{ color: 'var(--color-text-muted, #64748b)' }}>to</span>
                        <Input
                            type="date"
                            value={dateTo}
                            onChange={e => setDateTo(e.target.value)}
                            style={{ width: '140px', padding: '6px 10px', fontSize: '13px' }}
                        />
                        <Button variant="secondary" size="small" onClick={fetchHistory} disabled={loading}>
                            Filter
                        </Button>
                    </div>
                </div>

                {error && (
                    <div style={{
                        padding: '10px 14px',
                        borderRadius: '6px',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: '#ef4444',
                        fontSize: '13px'
                    }}>
                        {error}
                    </div>
                )}

                <div style={{ maxHeight: '420px', overflowY: 'auto', border: '1px solid var(--color-border, #334155)', borderRadius: '8px' }}>
                    {loading ? (
                        <div style={{ padding: '30px', textAlign: 'center', color: 'var(--color-text-secondary, #94a3b8)' }}>
                            Loading history records...
                        </div>
                    ) : history.length === 0 ? (
                        <div style={{ padding: '30px', textAlign: 'center', color: 'var(--color-text-muted, #64748b)' }}>
                            No finalized attendance records found in this date range.
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ background: 'var(--color-surface-hover, rgba(255,255,255,0.05))', borderBottom: '1px solid var(--color-border, #334155)' }}>
                                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>Date</th>
                                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>Status</th>
                                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>Site / Post</th>
                                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>Shift</th>
                                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>Source</th>
                                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>Recorded By</th>
                                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>Notes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {history.map(row => {
                                    const badge = getStatusBadgeStyle(row.status);
                                    return (
                                        <tr key={row.id} style={{ borderBottom: '1px solid var(--color-border, #1e293b)' }}>
                                            <td style={{ padding: '10px 12px', fontWeight: 500, fontFamily: 'monospace' }}>
                                                {row.date}
                                            </td>
                                            <td style={{ padding: '10px 12px' }}>
                                                <span style={{
                                                    padding: '3px 8px',
                                                    borderRadius: '4px',
                                                    fontSize: '11px',
                                                    fontWeight: 700,
                                                    background: badge.bg,
                                                    color: badge.color,
                                                    border: `1px solid ${badge.border}`
                                                }}>
                                                    {row.status}
                                                </span>
                                            </td>
                                            <td style={{ padding: '10px 12px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                                                {row.site_name ? (
                                                    <span>{row.site_name}{row.post_name ? ` • ${row.post_name}` : ''}</span>
                                                ) : (
                                                    <span style={{ color: 'var(--color-text-muted, #64748b)' }}>—</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '10px 12px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                                                {row.shift_name || '—'}
                                            </td>
                                            <td style={{ padding: '10px 12px', fontSize: '11px', color: 'var(--color-text-muted, #64748b)' }}>
                                                {row.source}
                                            </td>
                                            <td style={{ padding: '10px 12px', fontSize: '12px' }}>
                                                {row.recorded_by_name || '—'}
                                            </td>
                                            <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                                                {row.notes || '—'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button variant="secondary" onClick={onClose}>
                        Close
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
