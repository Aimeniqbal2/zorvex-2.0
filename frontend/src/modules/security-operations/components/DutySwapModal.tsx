import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { getDutyRosters, swapDutyRoster } from '../api';
import type { DutyRoster } from '../types';

interface DutySwapModalProps {
    isOpen: boolean;
    onClose: () => void;
    rosterA: DutyRoster | null;
    onSuccess?: () => void;
}

export const DutySwapModal: React.FC<DutySwapModalProps> = ({
    isOpen,
    onClose,
    rosterA,
    onSuccess
}) => {
    const [availableRosters, setAvailableRosters] = useState<DutyRoster[]>([]);
    const [selectedRosterBId, setSelectedRosterBId] = useState('');
    const [reason, setReason] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && rosterA) {
            setSelectedRosterBId('');
            setReason('');
            setError(null);
            // Fetch scheduled rosters for nearby dates / same site to allow swap
            getDutyRosters({ 
                site: rosterA.site, 
                status: 'SCHEDULED', 
                page_size: 100 
            })
                .then(list => {
                    // Filter out rosterA itself and same employee
                    const filtered = list.filter(r => r.id !== rosterA.id && r.employee !== rosterA.employee);
                    setAvailableRosters(filtered);
                    if (filtered.length > 0) setSelectedRosterBId(filtered[0].id);
                })
                .catch(() => setAvailableRosters([]));
        }
    }, [isOpen, rosterA]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!rosterA || !selectedRosterBId) return;
        setLoading(true);
        setError(null);
        try {
            await swapDutyRoster({
                roster_a_id: rosterA.id,
                roster_b_id: selectedRosterBId,
                reason
            });
            if (onSuccess) onSuccess();
            onClose();
        } catch (err: any) {
            const errData = err.response?.data;
            const msg = typeof errData === 'object' ? Object.values(errData).flat().join(' ') : (errData?.error || 'Failed to swap duty');
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const selectedRosterB = availableRosters.find(r => r.id === selectedRosterBId);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Controlled Shift Swap">
            <form onSubmit={handleSubmit} style={{ padding: '16px', maxWidth: '540px', width: '100%', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {error && (
                    <div style={{ padding: '10px 14px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '6px', fontSize: '13px' }}>
                        {error}
                    </div>
                )}

                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                    Exchange scheduled duties between two guards. Both duties will be updated and an audit log recorded.
                </div>

                {/* Side by side preview */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '12px', fontSize: '12px' }}>
                        <div style={{ color: 'var(--color-primary)', fontWeight: 600, marginBottom: '4px' }}>Guard A (Initiating)</div>
                        <div style={{ fontWeight: 600, fontSize: '13px' }}>{rosterA?.employee_name}</div>
                        <div style={{ color: 'var(--color-text-muted)', marginTop: '4px' }}>Date: {rosterA?.duty_date}</div>
                        <div style={{ color: 'var(--color-text-muted)' }}>Shift: {rosterA?.shift_name}</div>
                        <div style={{ color: 'var(--color-text-muted)' }}>Post: {rosterA?.post_name || 'General'}</div>
                    </div>

                    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '12px', fontSize: '12px' }}>
                        <div style={{ color: '#10b981', fontWeight: 600, marginBottom: '4px' }}>Guard B (Target)</div>
                        {selectedRosterB ? (
                            <>
                                <div style={{ fontWeight: 600, fontSize: '13px' }}>{selectedRosterB.employee_name}</div>
                                <div style={{ color: 'var(--color-text-muted)', marginTop: '4px' }}>Date: {selectedRosterB.duty_date}</div>
                                <div style={{ color: 'var(--color-text-muted)' }}>Shift: {selectedRosterB.shift_name}</div>
                                <div style={{ color: 'var(--color-text-muted)' }}>Post: {selectedRosterB.post_name || 'General'}</div>
                            </>
                        ) : (
                            <div style={{ color: 'var(--color-text-muted)', marginTop: '8px' }}>Select a target duty slot below</div>
                        )}
                    </div>
                </div>

                {/* Target Duty Slot Selection */}
                <div className="form-field">
                    <label className="form-label" style={{ fontSize: '12px', fontWeight: 600 }}>Swap with Duty Slot *</label>
                    <select
                        value={selectedRosterBId}
                        onChange={e => setSelectedRosterBId(e.target.value)}
                        required
                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-background)', color: 'var(--color-text)' }}
                    >
                        {availableRosters.length === 0 ? (
                            <option value="">No other scheduled duties found to swap with</option>
                        ) : (
                            availableRosters.map(r => (
                                <option key={r.id} value={r.id}>
                                    {r.employee_name} — {r.duty_date} ({r.shift_name} @ {r.post_name || 'General'})
                                </option>
                            ))
                        )}
                    </select>
                </div>

                <Input 
                    label="Reason for Swap (Audit Log)" 
                    value={reason} 
                    onChange={e => setReason(e.target.value)} 
                    placeholder="e.g. Mutual agreement between guards for personal commitments" 
                />

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                    <Button variant="secondary" type="button" onClick={onClose} disabled={loading}>Cancel</Button>
                    <Button variant="primary" type="submit" disabled={loading || !selectedRosterBId}>
                        {loading ? 'Swapping...' : 'Execute Shift Swap'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
