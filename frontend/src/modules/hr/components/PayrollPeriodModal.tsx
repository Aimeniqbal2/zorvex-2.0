import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { apiClient } from '../api';
import type { PayrollPeriod } from '../types';

interface PayrollPeriodModalProps {
    isOpen: boolean;
    onClose: () => void;
    period?: PayrollPeriod | null;
    onSave: () => void;
}

export const PayrollPeriodModal: React.FC<PayrollPeriodModalProps> = ({
    isOpen,
    onClose,
    period,
    onSave
}) => {
    const [formData, setFormData] = useState({
        name: '',
        start_date: '',
        end_date: '',
        processing_deadline: '',
        status: 'OPEN'
    });
    
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (period) {
            setFormData({
                name: period.name,
                start_date: period.start_date,
                end_date: period.end_date,
                processing_deadline: period.processing_deadline || '',
                status: period.status || 'OPEN'
            });
        } else {
            setFormData({
                name: '',
                start_date: '',
                end_date: '',
                processing_deadline: '',
                status: 'OPEN'
            });
        }
    }, [period, isOpen]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const dataToSubmit = { ...formData };
            if (!dataToSubmit.processing_deadline) delete (dataToSubmit as any).processing_deadline;

            if (period?.id) {
                await apiClient.put(`/api/hrm/payroll-periods/${period.id}/`, dataToSubmit);
            } else {
                await apiClient.post('/api/hrm/payroll-periods/', dataToSubmit);
            }
            onSave();
            onClose();
        } catch (err: any) {
            setError(err.response?.data?.detail || err.message || 'Error saving period');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={period ? 'Edit Payroll Period' : 'New Payroll Period'}>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {error && <div style={{ color: 'red' }}>{error}</div>}
                
                <Input label="Name" name="name" value={formData.name} onChange={handleChange} required />
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <Input type="date" label="Start Date" name="start_date" value={formData.start_date} onChange={handleChange} required />
                    <Input type="date" label="End Date" name="end_date" value={formData.end_date} onChange={handleChange} required />
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <Input type="date" label="Processing Deadline" name="processing_deadline" value={formData.processing_deadline} onChange={handleChange} />
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Status</label>
                        <select
                            name="status"
                            value={formData.status}
                            onChange={handleChange}
                            style={{ padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }}
                            required
                        >
                            <option value="OPEN">Open</option>
                            <option value="PROCESSING">Processing</option>
                            <option value="CLOSED">Closed</option>
                        </select>
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                    <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button type="submit" variant="primary" disabled={loading}>
                        {loading ? 'Saving...' : 'Save Period'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
