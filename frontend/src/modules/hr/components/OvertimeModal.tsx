import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { apiClient } from '../api';
import type { OvertimeRecord, Employee } from '../types';

interface OvertimeModalProps {
    isOpen: boolean;
    onClose: () => void;
    record: OvertimeRecord | null;
    onSave: () => void;
}

export const OvertimeModal: React.FC<OvertimeModalProps> = ({ isOpen, onClose, record, onSave }) => {
    const [formData, setFormData] = useState<Partial<OvertimeRecord>>({
        employee: '',
        date: new Date().toISOString().split('T')[0],
        start_time: '',
        end_time: '',
        hours: '',
        reason: '',
    });
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<any>(null);

    useEffect(() => {
        if (record) {
            setFormData(record);
        } else {
            setFormData({
                employee: '',
                date: new Date().toISOString().split('T')[0],
                start_time: '',
                end_time: '',
                hours: '',
                reason: '',
            });
        }
        setError(null);
    }, [record, isOpen]);

    useEffect(() => {
        if (isOpen) {
            apiClient.get('/api/hrm/employees/').then(res => {
                setEmployees(res.data.results || (Array.isArray(res.data) ? res.data : []));
            }).catch(() => {});
        }
    }, [isOpen]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            if (record?.id) {
                await apiClient.patch(`/api/hrm/overtime/${record.id}/`, formData);
            } else {
                await apiClient.post('/api/hrm/overtime/', formData);
            }
            onSave();
            onClose();
        } catch (err: any) {
            setError(err.response?.data || 'Failed to save overtime record');
        } finally {
            setLoading(false);
        }
    };

    const isViewOnly = Boolean(record && record.status !== 'PENDING');

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={record ? (isViewOnly ? 'View Overtime Record' : 'Edit Overtime Record') : 'New Overtime Record'}>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px' }}>
                {error && (
                    <div style={{ color: 'var(--color-danger)', fontSize: '14px', background: 'var(--color-danger-light)', padding: '8px', borderRadius: '4px' }}>
                        {typeof error === 'string' ? error : Object.entries(error).map(([k, v]) => (
                            <div key={k}><strong>{k}:</strong> {Array.isArray(v) ? v.join(' ') : String(v)}</div>
                        ))}
                    </div>
                )}
                
                <div className="form-field">
                    <label className="form-label">Employee *</label>
                    <select name="employee" value={formData.employee || ''} onChange={handleChange} className="input-base" required disabled={isViewOnly}>
                        <option value="">-- Select Employee --</option>
                        {employees.map(e => (
                            <option key={e.id} value={e.id}>{e.employee_code} - {e.first_name} {e.last_name}</option>
                        ))}
                    </select>
                </div>
                
                <Input label="Date *" type="date" name="date" value={formData.date || ''} onChange={handleChange} required disabled={isViewOnly} />
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <Input label="Start Time" type="time" name="start_time" value={formData.start_time || ''} onChange={handleChange} disabled={isViewOnly} />
                    <Input label="End Time" type="time" name="end_time" value={formData.end_time || ''} onChange={handleChange} disabled={isViewOnly} />
                </div>
                
                <Input label="Hours *" type="number" step="0.01" name="hours" value={formData.hours || ''} onChange={handleChange} required disabled={isViewOnly} />
                
                <div className="form-field">
                    <label className="form-label">Reason</label>
                    <textarea name="reason" value={formData.reason || ''} onChange={handleChange} className="input-base" rows={3} disabled={isViewOnly} />
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                    <Button type="button" variant="secondary" onClick={onClose}>Close</Button>
                    {!isViewOnly && (
                        <Button type="submit" variant="primary" loading={loading}>Save</Button>
                    )}
                </div>
            </form>
        </Modal>
    );
};
