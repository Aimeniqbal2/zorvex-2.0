import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { apiClient } from '../api';
import type { ContractRate } from '../types';

interface ContractRateModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    contractId: string;
    rate: ContractRate | null;
}

interface Designation {
    id: string;
    name: string;
}

export const ContractRateModal: React.FC<ContractRateModalProps> = ({
    isOpen, onClose, onSave, contractId, rate
}) => {
    const [designations, setDesignations] = useState<Designation[]>([]);
    const [formData, setFormData] = useState<Partial<ContractRate>>({
        service_contract: contractId,
        designation: '',
        billing_rate: '',
        pay_rate: '',
        effective_date: ''
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            fetchDesignations();
            if (rate) {
                setFormData({
                    service_contract: rate.service_contract,
                    designation: rate.designation,
                    billing_rate: rate.billing_rate,
                    pay_rate: rate.pay_rate,
                    effective_date: rate.effective_date
                });
            } else {
                setFormData({
                    service_contract: contractId,
                    designation: '',
                    billing_rate: '',
                    pay_rate: '',
                    effective_date: ''
                });
            }
        }
    }, [isOpen, rate, contractId]);

    const fetchDesignations = async () => {
        try {
            const res = await apiClient.get('/api/hrm/designations/');
            setDesignations(res.data.results || res.data);
        } catch (err) {
            console.error('Failed to fetch designations', err);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            if (rate?.id) {
                await apiClient.patch(`/api/operations/contract-rates/${rate.id}/`, formData);
            } else {
                await apiClient.post('/api/operations/contract-rates/', formData);
            }
            onSave();
            onClose();
        } catch (err: any) {
            const errData = err.response?.data;
            setError(
                errData?.non_field_errors?.[0] || errData?.detail || 'Failed to save rate'
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={rate ? 'Edit Rate' : 'Add Rate'}>
            <form onSubmit={handleSubmit} className="space-y-4 p-4">
                {error && <div className="text-red-500 mb-4">{error}</div>}

                <div className="form-field">
                    <label className="form-label">Designation</label>
                    <select
                        name="designation"
                        value={formData.designation}
                        onChange={handleChange}
                        className="input-base"
                        required
                    >
                        <option value="">Select Designation</option>
                        {designations.map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                    </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <Input
                        label="Billing Rate (PKR)"
                        type="number"
                        step="0.01"
                        name="billing_rate"
                        value={formData.billing_rate || ''}
                        onChange={handleChange}
                        required
                    />
                    <Input
                        label="Pay Rate (PKR)"
                        type="number"
                        step="0.01"
                        name="pay_rate"
                        value={formData.pay_rate || ''}
                        onChange={handleChange}
                        required
                    />
                </div>

                <Input
                    label="Effective Date"
                    type="date"
                    name="effective_date"
                    value={formData.effective_date || ''}
                    onChange={handleChange}
                    required
                />

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '24px' }}>
                    <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
                    <Button variant="primary" type="submit" loading={loading}>Save</Button>
                </div>
            </form>
        </Modal>
    );
};
