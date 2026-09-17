import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { apiClient } from '../api';
import { assignDutyReplacement } from '../api';
import type { DutyRoster } from '../types';

interface DutyReplacementModalProps {
    isOpen: boolean;
    onClose: () => void;
    roster: DutyRoster | null;
    onSuccess?: () => void;
}

export const DutyReplacementModal: React.FC<DutyReplacementModalProps> = ({
    isOpen,
    onClose,
    roster,
    onSuccess
}) => {
    const [employees, setEmployees] = useState<any[]>([]);
    const [replacementEmpId, setReplacementEmpId] = useState('');
    const [reason, setReason] = useState('');
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setReplacementEmpId('');
            setReason('');
            setNotes('');
            setError(null);
            // Fetch active employees (can come from any site/pool)
            apiClient.get('/api/hrm/employees/?employment_status=ACTIVE&page_size=200')
                .then(res => {
                    const list = res.data.results || (Array.isArray(res.data) ? res.data : []);
                    // Filter out the original employee
                    const filtered = list.filter((e: any) => String(e.id) !== String(roster?.employee));
                    setEmployees(filtered);
                    if (filtered.length > 0) setReplacementEmpId(filtered[0].id);
                })
                .catch(() => setEmployees([]));
        }
    }, [isOpen, roster]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!roster || !replacementEmpId) return;
        setLoading(true);
        setError(null);
        try {
            await assignDutyReplacement({
                original_roster_id: roster.id,
                replacement_employee_id: replacementEmpId,
                reason,
                notes
            });
            if (onSuccess) onSuccess();
            onClose();
        } catch (err: any) {
            const errData = err.response?.data;
            const msg = typeof errData === 'object' ? Object.values(errData).flat().join(' ') : (errData?.error || 'Failed to assign replacement');
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={`Assign Replacement Guard — ${roster?.duty_date || ''}`}
        >
            <form onSubmit={handleSubmit} style={{ padding: '16px', maxWidth: '540px', width: '100%', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {error && (
                    <div style={{ padding: '10px 14px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '6px', fontSize: '13px' }}>
                        {error}
                    </div>
                )}

                {/* Duty Details Card */}
                {roster && (
                    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                        <div>
                            <span style={{ color: 'var(--color-text-muted)' }}>Original Guard:</span>
                            <div style={{ fontWeight: 600, fontSize: '13px', marginTop: '2px' }}>{roster.employee_name} ({roster.employee_code || '—'})</div>
                        </div>
                        <div>
                            <span style={{ color: 'var(--color-text-muted)' }}>Site & Post:</span>
                            <div style={{ fontWeight: 600, fontSize: '13px', marginTop: '2px' }}>{roster.site_name} — {roster.post_name || 'General'}</div>
                        </div>
                        <div>
                            <span style={{ color: 'var(--color-text-muted)' }}>Duty Date:</span>
                            <div style={{ fontWeight: 600, marginTop: '2px' }}>{roster.duty_date}</div>
                        </div>
                        <div>
                            <span style={{ color: 'var(--color-text-muted)' }}>Shift:</span>
                            <div style={{ fontWeight: 600, marginTop: '2px' }}>{roster.shift_name} ({roster.shift_start} - {roster.shift_end})</div>
                        </div>
                    </div>
                )}

                {/* Replacement Guard Selection */}
                <div className="form-field">
                    <label className="form-label" style={{ fontSize: '12px', fontWeight: 600 }}>Select Replacement Employee *</label>
                    <select
                        value={replacementEmpId}
                        onChange={e => setReplacementEmpId(e.target.value)}
                        required
                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-background)', color: 'var(--color-text)' }}
                    >
                        {employees.map(emp => (
                            <option key={emp.id} value={emp.id}>
                                {emp.full_name || `${emp.first_name} ${emp.last_name}`} ({emp.employee_code || 'No Code'}) — {emp.designation_name || 'Guard'}
                            </option>
                        ))}
                    </select>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                        * The replacement may come from any site/pool. Their permanent deployment is preserved; only temporary duty coverage is recorded.
                    </div>
                </div>

                <Input 
                    label="Reason for Replacement *" 
                    value={reason} 
                    onChange={e => setReason(e.target.value)} 
                    placeholder="e.g. Medical emergency, urgent family leave, absent without notice" 
                    required 
                />

                <Input 
                    label="Internal Operations Notes (Optional)" 
                    value={notes} 
                    onChange={e => setNotes(e.target.value)} 
                    placeholder="Additional operational instructions or supervisor remarks" 
                />

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                    <Button variant="secondary" type="button" onClick={onClose} disabled={loading}>Cancel</Button>
                    <Button variant="primary" type="submit" disabled={loading}>
                        {loading ? 'Assigning...' : 'Confirm Replacement'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
