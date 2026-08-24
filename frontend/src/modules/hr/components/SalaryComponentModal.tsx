import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { apiClient } from '../api';
import type { SalaryComponent } from '../types';

interface SalaryComponentModalProps {
    isOpen: boolean;
    onClose: () => void;
    component?: SalaryComponent | null;
    onSave: () => void;
}

export const SalaryComponentModal: React.FC<SalaryComponentModalProps> = ({
    isOpen,
    onClose,
    component,
    onSave
}) => {
    const [formData, setFormData] = useState({
        code: '',
        name: '',
        component_type: 'EARNING',
        calculation_type: 'FIXED',
        is_taxable: true,
        is_active: true
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (component) {
            setFormData({
                code: component.code,
                name: component.name,
                component_type: (component as any).type || component.component_type || 'EARNING',
                calculation_type: component.calculation_type || 'FIXED',
                is_taxable: component.is_taxable ?? true,
                is_active: component.is_active ?? true
            });
        } else {
            setFormData({
                code: '',
                name: '',
                component_type: 'EARNING',
                calculation_type: 'FIXED',
                is_taxable: true,
                is_active: true
            });
        }
    }, [component, isOpen]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
        setFormData(prev => ({ ...prev, [name]: val }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            if (component?.id) {
                await apiClient.put(`/api/hrm/salary-components/${component.id}/`, formData);
            } else {
                await apiClient.post('/api/hrm/salary-components/', formData);
            }
            onSave();
            onClose();
        } catch (err: any) {
            setError(err.response?.data?.detail || err.message || 'Error saving component');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={component ? 'Edit Component' : 'Create Component'}>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {error && <div style={{ color: 'red' }}>{error}</div>}
                
                <Input
                    label="Code"
                    name="code"
                    value={formData.code}
                    onChange={handleChange}
                    required
                />
                
                <Input
                    label="Name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                />

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Component Type</label>
                    <select
                        name="component_type"
                        value={formData.component_type}
                        onChange={handleChange}
                        style={{ padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }}
                    >
                        <option value="EARNING">Earning</option>
                        <option value="DEDUCTION">Deduction</option>
                    </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Calculation Type</label>
                    <select
                        name="calculation_type"
                        value={formData.calculation_type}
                        onChange={handleChange}
                        style={{ padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }}
                    >
                        <option value="FIXED">Fixed Amount</option>
                        <option value="PERCENTAGE">Percentage of Base</option>
                        <option value="FORMULA">Formula</option>
                    </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                        type="checkbox"
                        id="is_taxable"
                        name="is_taxable"
                        checked={formData.is_taxable}
                        onChange={handleChange}
                    />
                    <label htmlFor="is_taxable">Is Taxable</label>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                        type="checkbox"
                        id="is_active"
                        name="is_active"
                        checked={formData.is_active}
                        onChange={handleChange}
                    />
                    <label htmlFor="is_active">Is Active</label>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                    <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button type="submit" variant="primary" disabled={loading}>
                        {loading ? 'Saving...' : 'Save'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
