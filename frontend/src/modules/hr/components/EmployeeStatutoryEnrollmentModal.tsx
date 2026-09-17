import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { apiClient } from '../api';
import type { EmployeeStatutoryEnrollment, StatutoryScheme, Employee } from '../types';

interface EmployeeStatutoryEnrollmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    enrollment: EmployeeStatutoryEnrollment | null;
    schemes: StatutoryScheme[];
    onSave: () => void;
}

export const EmployeeStatutoryEnrollmentModal: React.FC<EmployeeStatutoryEnrollmentModalProps> = ({ isOpen, onClose, enrollment, schemes, onSave }) => {
    const [formData, setFormData] = useState<Partial<EmployeeStatutoryEnrollment>>({
        employee: '',
        scheme: '',
        identifier: '',
        is_active: true,
    });
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<any>(null);

    useEffect(() => {
        if (enrollment) {
            setFormData(enrollment);
        } else {
            setFormData({
                employee: '',
                scheme: '',
                identifier: '',
                is_active: true,
            });
        }
        setError(null);
    }, [enrollment, isOpen]);

    useEffect(() => {
        if (isOpen) {
            apiClient.get('/api/hrm/employees/').then(res => {
                setEmployees(res.data.results || (Array.isArray(res.data) ? res.data : []));
            }).catch(() => {});
        }
    }, [isOpen]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
        setFormData({ ...formData, [e.target.name]: value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            if (enrollment?.id) {
                await apiClient.patch(`/api/hrm/statutory-enrollments/${enrollment.id}/`, formData);
            } else {
                await apiClient.post('/api/hrm/statutory-enrollments/', formData);
            }
            onSave();
            onClose();
        } catch (err: any) {
            setError(err.response?.data || 'Failed to save enrollment');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={enrollment ? 'Edit Enrollment' : 'New Enrollment'}>
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
                    <select name="employee" value={formData.employee || ''} onChange={handleChange} className="input-base" required disabled={!!enrollment}>
                        <option value="">-- Select Employee --</option>
                        {employees.map(e => (
                            <option key={e.id} value={e.id}>{e.employee_code} - {e.first_name} {e.last_name}</option>
                        ))}
                    </select>
                </div>
                
                <div className="form-field">
                    <label className="form-label">Scheme *</label>
                    <select name="scheme" value={formData.scheme || ''} onChange={handleChange} className="input-base" required disabled={!!enrollment}>
                        <option value="">-- Select Scheme --</option>
                        {schemes.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                </div>
                
                <Input label="Identifier (e.g., EOBI No.)" type="text" name="identifier" value={formData.identifier || ''} onChange={handleChange} />
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', background: 'var(--color-surface-hover)', borderRadius: '4px' }}>
                    <input type="checkbox" name="is_active" id="is_active" checked={formData.is_active || false} onChange={handleChange} />
                    <label htmlFor="is_active" style={{ margin: 0 }}>Is Active</label>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                    <Button type="button" variant="secondary" onClick={onClose}>Close</Button>
                    <Button type="submit" variant="primary" loading={loading}>Save</Button>
                </div>
            </form>
        </Modal>
    );
};
