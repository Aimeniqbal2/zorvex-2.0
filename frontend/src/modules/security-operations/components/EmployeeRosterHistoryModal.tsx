import React, { useState, useEffect } from 'react';
import { getEmployeeRosterHistory } from '../api';
import type { DutyRoster } from '../types';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { LoadingState } from '../../../components/ui/LoadingState';

interface EmployeeRosterHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    employeeId: string;
    employeeName?: string;
}

export const EmployeeRosterHistoryModal: React.FC<EmployeeRosterHistoryModalProps> = ({
    isOpen,
    onClose,
    employeeId,
    employeeName
}) => {
    const [history, setHistory] = useState<DutyRoster[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [dateFrom, setDateFrom] = useState<string>('');
    const [dateTo, setDateTo] = useState<string>('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && employeeId) {
            fetchHistory();
        }
    }, [isOpen, employeeId]);

    const fetchHistory = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await getEmployeeRosterHistory(employeeId, dateFrom || undefined, dateTo || undefined);
            setHistory(data);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to load employee roster history');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '16px'
        }}>
            <div style={{
                background: 'var(--color-surface)',
                borderRadius: '8px',
                width: '100%',
                maxWidth: '900px',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                border: '1px solid var(--color-border)'
            }}>
                {/* Header */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '16px 20px',
                    borderBottom: '1px solid var(--color-border)'
                }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
                            Employee Duty Roster History
                        </h2>
                        <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                            {employeeName ? `Guard: ${employeeName}` : `Employee ID: ${employeeId}`}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--color-text-muted)',
                            fontSize: '20px'
                        }}
                    >
                        <i className="bx bx-x" />
                    </button>
                </div>

                {/* Filter Controls */}
                <div style={{
                    padding: '12px 20px',
                    background: 'rgba(0, 0, 0, 0.02)',
                    borderBottom: '1px solid var(--color-border)',
                    display: 'flex',
                    gap: '12px',
                    alignItems: 'center',
                    flexWrap: 'wrap'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>From:</span>
                        <input
                            type="date"
                            className="input-base"
                            value={dateFrom}
                            onChange={e => setDateFrom(e.target.value)}
                            style={{ padding: '4px 8px', fontSize: '13px' }}
                        />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>To:</span>
                        <input
                            type="date"
                            className="input-base"
                            value={dateTo}
                            onChange={e => setDateTo(e.target.value)}
                            style={{ padding: '4px 8px', fontSize: '13px' }}
                        />
                    </div>
                    <Button variant="secondary" size="sm" onClick={fetchHistory}>
                        Filter
                    </Button>
                    {(dateFrom || dateTo) && (
                        <Button variant="ghost" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); fetchHistory(); }}>
                            Clear
                        </Button>
                    )}
                    <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 500, color: 'var(--color-text-muted)' }}>
                        {history.length} duties recorded
                    </span>
                </div>

                {/* Table Content */}
                <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
                    {loading ? (
                        <LoadingState />
                    ) : error ? (
                        <div style={{ color: '#ef4444', textAlign: 'center', padding: '16px' }}>{error}</div>
                    ) : history.length === 0 ? (
                        <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '40px' }}>
                            No duty roster assignments found for this employee.
                        </div>
                    ) : (
                        <div style={{ border: '1px solid var(--color-border)', borderRadius: '6px', overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                <thead>
                                    <tr style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                                        <th style={{ padding: '10px 12px' }}>Duty Date</th>
                                        <th style={{ padding: '10px 12px' }}>Site & Post</th>
                                        <th style={{ padding: '10px 12px' }}>Shift Details</th>
                                        <th style={{ padding: '10px 12px' }}>Duty Type</th>
                                        <th style={{ padding: '10px 12px' }}>Status</th>
                                        <th style={{ padding: '10px 12px' }}>Notes</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {history.map(item => (
                                        <tr key={item.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                            <td style={{ padding: '10px 12px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                                {item.duty_date}
                                            </td>
                                            <td style={{ padding: '10px 12px' }}>
                                                <div style={{ fontWeight: 500 }}>{item.site_name}</div>
                                                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                                                    Post: {item.post_name}
                                                </div>
                                            </td>
                                            <td style={{ padding: '10px 12px' }}>
                                                <div>{item.shift_name} ({item.shift_code})</div>
                                                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                                                    {item.shift_start_time} - {item.shift_end_time}
                                                    {item.shift_crosses_midnight && ' (Overnight)'}
                                                </div>
                                            </td>
                                            <td style={{ padding: '10px 12px' }}>
                                                {item.is_replacement ? (
                                                    <span style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        padding: '2px 8px',
                                                        borderRadius: '12px',
                                                        fontSize: '11px',
                                                        fontWeight: 600,
                                                        background: '#e0e7ff',
                                                        color: '#4338ca'
                                                    }}>
                                                        Temporary Replacement
                                                    </span>
                                                ) : (
                                                    <span style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        padding: '2px 8px',
                                                        borderRadius: '12px',
                                                        fontSize: '11px',
                                                        fontWeight: 600,
                                                        background: '#ecfdf5',
                                                        color: '#065f46'
                                                    }}>
                                                        Regular Deployment
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ padding: '10px 12px' }}>
                                                <Badge variant={
                                                    item.status === 'COMPLETED' ? 'success' :
                                                    item.status === 'SCHEDULED' ? 'primary' :
                                                    item.status === 'REPLACED' ? 'warning' :
                                                    item.status === 'SWAPPED' ? 'default' : 'danger'
                                                }>
                                                    {item.status}
                                                </Badge>
                                            </td>
                                            <td style={{ padding: '10px 12px', color: 'var(--color-text-muted)', fontSize: '12px' }}>
                                                {item.notes || '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    padding: '12px 20px',
                    borderTop: '1px solid var(--color-border)',
                    background: 'var(--color-surface)'
                }}>
                    <Button variant="secondary" onClick={onClose}>Close</Button>
                </div>
            </div>
        </div>
    );
};
