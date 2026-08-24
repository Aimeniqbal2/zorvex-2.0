import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { apiClient } from '../api';
import type { Employee, Designation, Department } from '../types';

interface EmployeeModalProps {
    isOpen: boolean;
    onClose: () => void;
    employee: Employee | null;
    onSave: () => void;
}

export const EmployeeModal: React.FC<EmployeeModalProps> = ({ isOpen, onClose, employee, onSave }) => {
    const [formData, setFormData] = useState<Partial<Employee>>({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        designation: '',
        department: '',
        is_active: true
    });
    
    const [designations, setDesignations] = useState<Designation[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<any>(null);

    useEffect(() => {
        if (employee) {
            setFormData({
                ...employee,
                designation: employee?.designation || '',
                department: employee?.department || ''
            });
        } else {
            setFormData({ first_name: '', last_name: '', email: '', phone: '', designation: '', department: '', is_active: true });
        }
        setError(null);
    }, [employee, isOpen]);

    useEffect(() => {
        if (isOpen) {
            apiClient.get('/api/hrm/designations/').then(res => setDesignations(res.data.results || (Array.isArray(res.data) ? res.data : []))).catch(() => setDesignations([]));
            apiClient.get('/api/hrm/departments/').then(res => setDepartments(res.data.results || (Array.isArray(res.data) ? res.data : []))).catch(() => setDepartments([]));
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
            const payload = { ...formData };
            if (!payload.designation) delete payload.designation;
            if (!payload.department) delete payload.department;

            if (employee?.id) {
                await apiClient.patch(`/api/hrm/employees/${employee.id}/`, payload);
            } else {
                await apiClient.post('/api/hrm/employees/', payload);
            }
            onSave();
            onClose();
        } catch (err: any) {
            setError(err.response?.data || 'Failed to save employee');
        } finally {
            setLoading(false);
        }
    };

    const renderError = () => {
        if (!error) return null;
        if (typeof error === 'string') return <div style={{ color: 'var(--color-danger)', fontSize: '14px', marginBottom: '12px' }}>{error}</div>;
        return (
            <div style={{ color: 'var(--color-danger)', fontSize: '14px', marginBottom: '12px', background: 'var(--color-danger-light)', padding: '8px', borderRadius: '4px' }}>
                {Object.entries(error).map(([k, v]) => (
                    <div key={k}><strong>{k === 'non_field_errors' ? '' : k + ':'}</strong> {Array.isArray(v) ? v.join(' ') : String(v)}</div>
                ))}
            </div>
        );
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={employee ? 'Edit Employee' : 'New Employee'}>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px' }}>
                {renderError()}
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <Input
                        label="First Name *"
                        name="first_name"
                        value={formData.first_name || ''}
                        onChange={handleChange}
                        required
                    />
                    <Input
                        label="Last Name *"
                        name="last_name"
                        value={formData.last_name || ''}
                        onChange={handleChange}
                        required
                    />
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <Input
                        label="Email"
                        type="email"
                        name="email"
                        value={formData.email || ''}
                        onChange={handleChange}
                    />
                    <Input
                        label="Phone"
                        name="phone"
                        value={formData.phone || ''}
                        onChange={handleChange}
                    />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div className="form-field">
                        <label className="form-label">Designation</label>
                        <select name="designation" value={formData.designation || ''} onChange={handleChange} className="input-base">
                            <option value="">-- None --</option>
                            {designations.map(d => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-field">
                        <label className="form-label">Department</label>
                        <select name="department" value={formData.department || ''} onChange={handleChange} className="input-base">
                            <option value="">-- None --</option>
                            {departments.map(d => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="form-field" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
                    <input 
                        type="checkbox" 
                        name="is_active" 
                        checked={formData.is_active || false} 
                        onChange={handleChange} 
                        id="employee_is_active" 
                    />
                    <label htmlFor="employee_is_active" className="form-label" style={{ margin: 0 }}>Active</label>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                    <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button type="submit" variant="primary" loading={loading}>Save</Button>
                </div>
            </form>
        </Modal>
    );
};
