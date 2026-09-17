import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useToastStore } from '../../../stores/toastStore';
import { createCorrectiveAction, updateCorrectiveAction, apiClient } from '../api';
import type { CorrectiveAction, QAFinding } from '../types';

interface CorrectiveActionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => void;
    finding: QAFinding;
    action?: CorrectiveAction | null;
}

export const CorrectiveActionModal: React.FC<CorrectiveActionModalProps> = ({ isOpen, onClose, onSaved, finding, action }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [employees, setEmployees] = useState<any[]>([]);
    
    const [formData, setFormData] = useState<Partial<CorrectiveAction>>({
        finding: finding.id,
        description: '',
        assigned_to: '',
        due_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
        status: 'PENDING'
    });

    useEffect(() => {
        if (isOpen) {
            apiClient.get('/api/hrm/employees/?is_active=true').then((res: any) => {
                setEmployees(res.data.results || res.data);
            }).catch(console.error);
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) {
            setErrors({});
            if (action) {
                setFormData({
                    finding: action.finding,
                    description: action.description,
                    assigned_to: action.assigned_to,
                    due_date: action.due_date,
                    status: action.status,
                });
            } else {
                setFormData({
                    finding: finding.id,
                    description: '',
                    assigned_to: '',
                    due_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
                    status: 'PENDING'
                });
            }
        }
    }, [isOpen, action, finding.id]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData((prev: any) => ({ ...prev, [name]: value }));
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: [] }));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setErrors({});

        try {
            if (action) {
                await updateCorrectiveAction(action.id, formData);
                useToastStore.getState().success('Corrective action updated');
            } else {
                await createCorrectiveAction(formData);
                useToastStore.getState().success('Corrective action created');
            }
            onSaved();
            onClose();
        } catch (error: any) {
            if (error.response?.data) {
                setErrors(error.response.data);
                useToastStore.getState().error('Please check the form for validation errors.');
            } else {
                useToastStore.getState().error('An unexpected error occurred.');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={action ? 'Edit Corrective Action' : 'Create Corrective Action'}
        >
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
                <div style={{ padding: '12px', background: 'var(--color-surface-hover)', borderRadius: '4px', fontSize: '14px' }}>
                    <strong>Finding:</strong> {finding.description}
                </div>

                <div className="form-field">
                    <label className="form-label">Action Description <span className="required">*</span></label>
                    <textarea 
                        className={`input-base ${errors.description ? 'input-error' : ''}`}
                        name="description"
                        value={formData.description}
                        onChange={handleChange}
                        rows={3}
                        required
                    />
                    {errors.description && <span className="input-error-text">{errors.description.join(', ')}</span>}
                </div>

                <div className="form-field">
                    <label className="form-label">Assign To <span className="required">*</span></label>
                    <select 
                        className={`input-base ${errors.assigned_to ? 'input-error' : ''}`}
                        name="assigned_to"
                        value={formData.assigned_to}
                        onChange={handleChange}
                        required
                    >
                        <option value="">Select Employee...</option>
                        {employees.map(emp => (
                            <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>
                        ))}
                    </select>
                    {errors.assigned_to && <span className="input-error-text">{errors.assigned_to.join(', ')}</span>}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-3)' }}>
                    <Input 
                        label="Due Date" 
                        name="due_date" 
                        type="date"
                        value={formData.due_date} 
                        onChange={handleChange} 
                        required
                        error={errors.due_date?.join(', ')}
                    />

                    <div className="form-field">
                        <label className="form-label">Status <span className="required">*</span></label>
                        <select 
                            className={`input-base ${errors.status ? 'input-error' : ''}`}
                            name="status"
                            value={formData.status}
                            onChange={handleChange}
                            required
                        >
                            <option value="PENDING">Pending</option>
                            <option value="IN_PROGRESS">In Progress</option>
                            <option value="COMPLETED">Completed</option>
                            <option value="VERIFIED">Verified</option>
                        </select>
                        {errors.status && <span className="input-error-text">{errors.status.join(', ')}</span>}
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--spacing-2)', marginTop: '16px' }}>
                    <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
                    <Button type="submit" variant="primary" disabled={isSubmitting}>
                        {isSubmitting ? 'Saving...' : 'Save'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
