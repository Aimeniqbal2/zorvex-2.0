import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { apiClient } from '../api';
import type { PayrollPeriod } from '../types';

interface PayrollRunModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
}

export const PayrollRunModal: React.FC<PayrollRunModalProps> = ({
    isOpen,
    onClose,
    onSave
}) => {
    const [formData, setFormData] = useState({
        payroll_period: '',
        run_type: 'REGULAR',
        status: 'DRAFT'
    });
    
    const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            fetchPeriods();
            setFormData({
                payroll_period: '',
                run_type: 'REGULAR',
                status: 'DRAFT'
            });
        }
    }, [isOpen]);

    const fetchPeriods = async () => {
        try {
            const res = await apiClient.get('/api/hrm/payroll-periods/');
            setPeriods(res.data.results || (Array.isArray(res.data) ? res.data : []));
        } catch (err) {
            console.error(err);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            await apiClient.post('/api/hrm/payroll-runs/', formData);
            onSave();
            onClose();
        } catch (err: any) {
            setError(err.response?.data?.detail || err.message || 'Error creating payroll run');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="New Payroll Run">
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {error && <div style={{ color: 'red' }}>{error}</div>}
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Payroll Period</label>
                    <select
                        name="payroll_period"
                        value={formData.payroll_period}
                        onChange={handleChange}
                        style={{ padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }}
                        required
                    >
                        <option value="">Select Period...</option>
                        {periods.map(p => (
                            <option key={p.id} value={p.id}>{p.name} ({p.start_date} - {p.end_date})</option>
                        ))}
                    </select>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Run Type</label>
                    <select
                        name="run_type"
                        value={formData.run_type}
                        onChange={handleChange}
                        style={{ padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }}
                        required
                    >
                        <option value="REGULAR">Regular</option>
                        <option value="OFF_CYCLE">Off-Cycle</option>
                        <option value="BONUS">Bonus</option>
                    </select>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                    <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button type="submit" variant="primary" disabled={loading}>
                        {loading ? 'Creating...' : 'Create Run'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
