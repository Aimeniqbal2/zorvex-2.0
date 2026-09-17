import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { applyLeaveRange, apiClient } from '../api';

interface ApplyLeaveModalProps {
    isOpen: boolean;
    onClose: () => void;
    employeeId?: string | null;
    employeeName?: string | null;
    defaultDate?: string;
    onSuccess?: () => void;
}

export const ApplyLeaveModal: React.FC<ApplyLeaveModalProps> = ({
    isOpen,
    onClose,
    employeeId,
    employeeName,
    defaultDate,
    onSuccess
}) => {
    const [employees, setEmployees] = useState<any[]>([]);
    const [selectedEmpId, setSelectedEmpId] = useState('');
    const [leaveType, setLeaveType] = useState<'PAID_LEAVE' | 'UNPAID_LEAVE'>('PAID_LEAVE');
    const [startDate, setStartDate] = useState(defaultDate || new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(defaultDate || new Date().toISOString().split('T')[0]);
    const [reason, setReason] = useState('');
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setError(null);
            setReason('');
            setNotes('');
            const initialDate = defaultDate || new Date().toISOString().split('T')[0];
            setStartDate(initialDate);
            setEndDate(initialDate);

            if (employeeId) {
                setSelectedEmpId(employeeId);
            } else {
                apiClient.get('/api/hrm/employees/?page_size=300')
                    .then(res => {
                        const list = res.data.results || (Array.isArray(res.data) ? res.data : []);
                        setEmployees(list);
                        if (list.length > 0 && !selectedEmpId) {
                            setSelectedEmpId(list[0].id);
                        }
                    })
                    .catch(() => setEmployees([]));
            }
        }
    }, [isOpen, employeeId, defaultDate]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const targetId = employeeId || selectedEmpId;
        if (!targetId) {
            setError('Please select an employee');
            return;
        }
        if (!startDate || !endDate) {
            setError('Please select start and end dates');
            return;
        }
        if (startDate > endDate) {
            setError('Start date cannot be after end date');
            return;
        }

        setLoading(true);
        setError(null);
        try {
            await applyLeaveRange({
                employee_id: targetId,
                leave_type: leaveType,
                start_date: startDate,
                end_date: endDate,
                reason: reason || undefined,
                notes: notes || undefined
            });
            if (onSuccess) onSuccess();
            onClose();
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Failed to record leave');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Apply Date-Range Leave">
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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

                {employeeId ? (
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary, #94a3b8)', display: 'block', marginBottom: '6px' }}>
                            Employee
                        </label>
                        <div style={{
                            padding: '10px 12px',
                            background: 'var(--color-surface-hover, rgba(255,255,255,0.05))',
                            border: '1px solid var(--color-border, #334155)',
                            borderRadius: '6px',
                            fontSize: '14px',
                            fontWeight: 600
                        }}>
                            {employeeName || employeeId}
                        </div>
                    </div>
                ) : (
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary, #94a3b8)', display: 'block', marginBottom: '6px' }}>
                            Select Employee <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <select
                            value={selectedEmpId}
                            onChange={e => setSelectedEmpId(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                background: 'var(--color-surface, #1e293b)',
                                border: '1px solid var(--color-border, #334155)',
                                color: 'var(--color-text, #f8fafc)',
                                borderRadius: '6px',
                                fontSize: '14px'
                            }}
                            required
                        >
                            <option value="">-- Choose Employee --</option>
                            {employees.map(emp => (
                                <option key={emp.id} value={emp.id}>
                                    {emp.first_name} {emp.last_name} ({emp.employee_id}) — {emp.employee_classification || 'STAFF'}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                <div>
                    <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary, #94a3b8)', display: 'block', marginBottom: '6px' }}>
                        Leave Classification <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <label style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '10px 12px',
                            borderRadius: '6px',
                            border: `1px solid ${leaveType === 'PAID_LEAVE' ? '#3b82f6' : 'var(--color-border, #334155)'}`,
                            background: leaveType === 'PAID_LEAVE' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                            cursor: 'pointer'
                        }}>
                            <input
                                type="radio"
                                name="leaveType"
                                value="PAID_LEAVE"
                                checked={leaveType === 'PAID_LEAVE'}
                                onChange={() => setLeaveType('PAID_LEAVE')}
                            />
                            <div>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: '#3b82f6' }}>PAID LEAVE</div>
                                <div style={{ fontSize: '11px', color: 'var(--color-text-muted, #64748b)' }}>Salary remains payable</div>
                            </div>
                        </label>

                        <label style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '10px 12px',
                            borderRadius: '6px',
                            border: `1px solid ${leaveType === 'UNPAID_LEAVE' ? '#f59e0b' : 'var(--color-border, #334155)'}`,
                            background: leaveType === 'UNPAID_LEAVE' ? 'rgba(245, 158, 11, 0.1)' : 'transparent',
                            cursor: 'pointer'
                        }}>
                            <input
                                type="radio"
                                name="leaveType"
                                value="UNPAID_LEAVE"
                                checked={leaveType === 'UNPAID_LEAVE'}
                                onChange={() => setLeaveType('UNPAID_LEAVE')}
                            />
                            <div>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: '#f59e0b' }}>UNPAID LEAVE</div>
                                <div style={{ fontSize: '11px', color: 'var(--color-text-muted, #64748b)' }}>Unpaid • Excludes JUMP</div>
                            </div>
                        </label>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary, #94a3b8)', display: 'block', marginBottom: '6px' }}>
                            Start Date <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <Input
                            type="date"
                            value={startDate}
                            onChange={e => setStartDate(e.target.value)}
                            required
                        />
                    </div>
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary, #94a3b8)', display: 'block', marginBottom: '6px' }}>
                            End Date <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <Input
                            type="date"
                            value={endDate}
                            onChange={e => setEndDate(e.target.value)}
                            required
                        />
                    </div>
                </div>

                <div>
                    <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary, #94a3b8)', display: 'block', marginBottom: '6px' }}>
                        Reason
                    </label>
                    <Input
                        placeholder="e.g. Medical emergency, annual family visit"
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                    />
                </div>

                <div>
                    <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary, #94a3b8)', display: 'block', marginBottom: '6px' }}>
                        Administrative Notes
                    </label>
                    <textarea
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder="Optional approval or operator notes..."
                        rows={3}
                        style={{
                            width: '100%',
                            padding: '10px 12px',
                            background: 'var(--color-surface, #1e293b)',
                            border: '1px solid var(--color-border, #334155)',
                            color: 'var(--color-text, #f8fafc)',
                            borderRadius: '6px',
                            fontSize: '13px',
                            fontFamily: 'inherit',
                            resize: 'vertical'
                        }}
                    />
                </div>

                <div style={{
                    padding: '10px 14px',
                    borderRadius: '6px',
                    background: 'rgba(59, 130, 246, 0.06)',
                    border: '1px dashed rgba(59, 130, 246, 0.3)',
                    fontSize: '12px',
                    color: 'var(--color-text-secondary, #94a3b8)',
                    lineHeight: '1.5'
                }}>
                    ℹ️ <strong>Approved Leave Rule:</strong> Both Paid and Unpaid Leave dates break the 7-day absence streak and are strictly excluded from triggering JUMP / Missing status.
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                    <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
                        Cancel
                    </Button>
                    <Button type="submit" variant="primary" disabled={loading}>
                        {loading ? 'Recording Leave...' : 'Confirm Leave Range'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
