import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Badge } from '../../../components/ui/Badge';
import { getShifts, createShift, updateShift, deleteShift } from '../api';
import type { Shift } from '../types';

interface ShiftSetupModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave?: () => void;
    onChanged?: () => void;
}

export const ShiftSetupModal: React.FC<ShiftSetupModalProps> = ({
    isOpen,
    onClose,
    onSave,
    onChanged
}) => {
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Editing / creating state
    const [editingShift, setEditingShift] = useState<Shift | null>(null);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        code: '',
        start_time: '08:00:00',
        end_time: '20:00:00',
        is_overnight: false,
        is_active: true
    });

    const loadShifts = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await getShifts();
            setShifts(data);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to load shifts');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            loadShifts();
            setIsFormOpen(false);
            setEditingShift(null);
        }
    }, [isOpen]);

    const handleOpenCreate = () => {
        setEditingShift(null);
        setFormData({
            name: '',
            code: '',
            start_time: '08:00:00',
            end_time: '20:00:00',
            is_overnight: false,
            is_active: true
        });
        setIsFormOpen(true);
    };

    const handleOpenEdit = (shift: Shift) => {
        setEditingShift(shift);
        setFormData({
            name: shift.name,
            code: shift.code,
            start_time: shift.start_time,
            end_time: shift.end_time,
            is_overnight: shift.is_overnight,
            is_active: shift.is_active
        });
        setIsFormOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        try {
            if (editingShift) {
                await updateShift(editingShift.id, formData);
            } else {
                await createShift(formData);
            }
            setIsFormOpen(false);
            loadShifts();
            if (onChanged) onChanged();
            if (onSave) onSave();
        } catch (err: any) {
            const errData = err.response?.data;
            const msg = typeof errData === 'object' ? Object.values(errData).flat().join(' ') : (errData || 'Failed to save shift');
            setError(msg);
        }
    };

    const handleDelete = async (shiftId: string) => {
        if (!confirm('Are you sure you want to delete this shift template?')) return;
        try {
            await deleteShift(shiftId);
            loadShifts();
            if (onChanged) onChanged();
            if (onSave) onSave();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to delete shift');
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Shift Templates & Work Rotations">
            <div style={{ padding: '16px', maxWidth: '750px', width: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {error && (
                    <div style={{ padding: '10px 14px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '6px', fontSize: '13px' }}>
                        {error}
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                        Define operational shift hours, cross-midnight overnight flags, and duty duration.
                    </div>
                    {!isFormOpen && (
                        <Button variant="primary" size="sm" icon="bx-plus" onClick={handleOpenCreate}>
                            Add Shift Template
                        </Button>
                    )}
                </div>

                {isFormOpen && (
                    <form onSubmit={handleSave} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>
                            {editingShift ? `Edit Shift: ${editingShift.name}` : 'Create New Shift Template'}
                        </h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <Input label="Shift Name *" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Day 12H, Night Guard, Early Morning" required />
                            <Input label="Shift Code *" value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })} placeholder="e.g. D12, N12, MOR-8" required />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <Input label="Start Time *" type="time" value={formData.start_time} onChange={e => setFormData({ ...formData, start_time: e.target.value })} required />
                            <Input label="End Time *" type="time" value={formData.end_time} onChange={e => setFormData({ ...formData, end_time: e.target.value })} required />
                        </div>
                        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                                <input type="checkbox" checked={formData.is_overnight} onChange={e => setFormData({ ...formData, is_overnight: e.target.checked })} />
                                <span>Crosses Midnight (Overnight Shift)</span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                                <input type="checkbox" checked={formData.is_active} onChange={e => setFormData({ ...formData, is_active: e.target.checked })} />
                                <span>Active</span>
                            </label>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                            <Button variant="secondary" size="sm" type="button" onClick={() => setIsFormOpen(false)}>Cancel</Button>
                            <Button variant="primary" size="sm" type="submit">Save Shift</Button>
                        </div>
                    </form>
                )}

                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid var(--color-border)', textAlign: 'left' }}>
                                <th style={{ padding: '8px' }}>Shift</th>
                                <th style={{ padding: '8px' }}>Code</th>
                                <th style={{ padding: '8px' }}>Timing</th>
                                <th style={{ padding: '8px' }}>Duration</th>
                                <th style={{ padding: '8px' }}>Overnight</th>
                                <th style={{ padding: '8px' }}>Status</th>
                                <th style={{ padding: '8px', textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading shifts...</td>
                                </tr>
                            ) : shifts.length === 0 ? (
                                <tr>
                                    <td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>No shift templates defined. Click "Add Shift Template" to configure.</td>
                                </tr>
                            ) : (
                                shifts.map(sh => (
                                    <tr key={sh.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                        <td style={{ padding: '8px', fontWeight: 600 }}>{sh.name}</td>
                                        <td style={{ padding: '8px' }}><code>{sh.code}</code></td>
                                        <td style={{ padding: '8px' }}>{sh.start_time} → {sh.end_time}</td>
                                        <td style={{ padding: '8px' }}>{sh.duration_hours ? `${sh.duration_hours} hrs` : '—'}</td>
                                        <td style={{ padding: '8px' }}>
                                            {sh.is_overnight ? <Badge variant="warning">YES</Badge> : <span style={{ color: 'var(--color-text-muted)' }}>No</span>}
                                        </td>
                                        <td style={{ padding: '8px' }}>
                                            <Badge variant={sh.is_active ? 'success' : 'default'}>{sh.is_active ? 'ACTIVE' : 'INACTIVE'}</Badge>
                                        </td>
                                        <td style={{ padding: '8px', textAlign: 'right' }}>
                                            <div style={{ display: 'inline-flex', gap: '6px' }}>
                                                <Button size="sm" variant="secondary" onClick={() => handleOpenEdit(sh)}>Edit</Button>
                                                <Button size="sm" variant="danger" onClick={() => handleDelete(sh.id)}>Delete</Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                    <Button variant="secondary" onClick={onClose}>Close</Button>
                </div>
            </div>
        </Modal>
    );
};
