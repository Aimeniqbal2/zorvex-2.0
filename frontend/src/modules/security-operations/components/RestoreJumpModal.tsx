import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { restoreEmployeeFromJump } from '../api';
import type { DailyAttendanceRow, JumpRecordItem } from '../types';

interface RestoreJumpModalProps {
    isOpen: boolean;
    onClose: () => void;
    record: DailyAttendanceRow | JumpRecordItem | null;
    onSuccess?: () => void;
}

export const RestoreJumpModal: React.FC<RestoreJumpModalProps> = ({
    isOpen,
    onClose,
    record,
    onSuccess
}) => {
    const [restoreDate, setRestoreDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setRestoreDate(new Date().toISOString().split('T')[0]);
            setNotes('');
            setError(null);
        }
    }, [isOpen]);

    if (!record) return null;

    // Support both DailyAttendanceRow and JumpRecordItem
    const employeeId = 'employee_id' in record ? record.employee_id : record.employee;
    const employeeName = record.employee_name || 'Selected Employee';
    const employeeCode = record.employee_code || '';
    const consecutiveDays = record.consecutive_absent_days || 7;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!employeeId) return;

        setLoading(true);
        setError(null);
        try {
            await restoreEmployeeFromJump({
                employee_id: employeeId,
                restore_date: restoreDate,
                notes: notes || undefined
            });
            if (onSuccess) onSuccess();
            onClose();
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Failed to restore employee from JUMP');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Formal Return from JUMP / Reinstatement">
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

                <div style={{
                    padding: '14px 16px',
                    borderRadius: '8px',
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text, #f8fafc)' }}>
                            {employeeName}
                        </span>
                        <span style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '4px',
                            background: '#ef4444',
                            color: '#ffffff'
                        }}>
                            STATUS: JUMP / MISSING
                        </span>
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                        Employee ID: <strong>{employeeCode}</strong> • Consecutive Absences: <strong style={{ color: '#ef4444' }}>{consecutiveDays} days</strong>
                    </div>
                </div>

                <div>
                    <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary, #94a3b8)', display: 'block', marginBottom: '6px' }}>
                        Reinstatement / Return Date <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <Input
                        type="date"
                        value={restoreDate}
                        onChange={e => setRestoreDate(e.target.value)}
                        required
                    />
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted, #64748b)', marginTop: '4px' }}>
                        The employee will be materialized as PRESENT on this date, and persistent state set to PRESENT.
                    </div>
                </div>

                <div>
                    <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary, #94a3b8)', display: 'block', marginBottom: '6px' }}>
                        Formal Return / Approval Notes <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <textarea
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder="Document explanation for unauthorized absence, supervisor verification, disciplinary penalty or medical proof..."
                        rows={4}
                        required
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
                    padding: '12px 14px',
                    borderRadius: '6px',
                    background: 'rgba(34, 197, 94, 0.08)',
                    border: '1px dashed rgba(34, 197, 94, 0.3)',
                    fontSize: '12px',
                    color: 'var(--color-text-secondary, #94a3b8)',
                    lineHeight: '1.5'
                }}>
                    ✓ <strong>Audit Integrity Assurance:</strong> Prior absence history will be completely preserved. The JUMP incident is logged as RESTORED with your operator username and timestamp.
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                    <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
                        Cancel
                    </Button>
                    <Button type="submit" variant="primary" disabled={loading} style={{ background: '#22c55e', borderColor: '#22c55e' }}>
                        {loading ? 'Restoring...' : 'Restore Employee to ACTIVE'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
