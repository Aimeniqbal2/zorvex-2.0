import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { apiClient } from '../api';
import type { StatutoryRule, StatutoryScheme } from '../types';

interface StatutoryRuleModalProps {
    isOpen: boolean;
    onClose: () => void;
    rule: StatutoryRule | null;
    schemes: StatutoryScheme[];
    onSave: () => void;
}

export const StatutoryRuleModal: React.FC<StatutoryRuleModalProps> = ({ isOpen, onClose, rule, schemes, onSave }) => {
    const [formData, setFormData] = useState<Partial<StatutoryRule>>({
        scheme: '',
        effective_from: new Date().toISOString().split('T')[0],
        effective_to: '',
        employee_rate: '0',
        employer_rate: '0',
        wage_ceiling: '',
        wage_floor: '',
        is_flat_amount: false,
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<any>(null);

    useEffect(() => {
        if (rule) {
            setFormData(rule);
        } else {
            setFormData({
                scheme: '',
                effective_from: new Date().toISOString().split('T')[0],
                effective_to: '',
                employee_rate: '0',
                employer_rate: '0',
                wage_ceiling: '',
                wage_floor: '',
                is_flat_amount: false,
            });
        }
        setError(null);
    }, [rule, isOpen]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
        setFormData({ ...formData, [e.target.name]: value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const payload = { ...formData };
            if (!payload.wage_ceiling) payload.wage_ceiling = null as any;
            if (!payload.wage_floor) payload.wage_floor = null as any;
            if (!payload.effective_to) payload.effective_to = null as any;

            if (rule?.id) {
                await apiClient.patch(`/api/hrm/statutory-rules/${rule.id}/`, payload);
            } else {
                await apiClient.post('/api/hrm/statutory-rules/', payload);
            }
            onSave();
            onClose();
        } catch (err: any) {
            setError(err.response?.data || 'Failed to save rule');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={rule ? 'Edit Statutory Rule' : 'New Statutory Rule'}>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px' }}>
                {error && (
                    <div style={{ color: 'var(--color-danger)', fontSize: '14px', background: 'var(--color-danger-light)', padding: '8px', borderRadius: '4px' }}>
                        {typeof error === 'string' ? error : Object.entries(error).map(([k, v]) => (
                            <div key={k}><strong>{k}:</strong> {Array.isArray(v) ? v.join(' ') : String(v)}</div>
                        ))}
                    </div>
                )}
                
                <div className="form-field">
                    <label className="form-label">Scheme *</label>
                    <select name="scheme" value={formData.scheme || ''} onChange={handleChange} className="input-base" required>
                        <option value="">-- Select Scheme --</option>
                        {schemes.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <Input label="Effective From *" type="date" name="effective_from" value={formData.effective_from || ''} onChange={handleChange} required />
                    <Input label="Effective To" type="date" name="effective_to" value={formData.effective_to || ''} onChange={handleChange} />
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', background: 'var(--color-surface-hover)', borderRadius: '4px' }}>
                    <input type="checkbox" name="is_flat_amount" id="is_flat_amount" checked={formData.is_flat_amount || false} onChange={handleChange} />
                    <label htmlFor="is_flat_amount" style={{ margin: 0 }}>Rates are Flat Amounts (not Percentages)</label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <Input label="Employee Rate" type="number" step="0.01" name="employee_rate" value={formData.employee_rate || ''} onChange={handleChange} />
                    <Input label="Employer Rate" type="number" step="0.01" name="employer_rate" value={formData.employer_rate || ''} onChange={handleChange} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <Input label="Wage Floor (Min Base)" type="number" step="0.01" name="wage_floor" value={formData.wage_floor || ''} onChange={handleChange} />
                    <Input label="Wage Ceiling (Max Base)" type="number" step="0.01" name="wage_ceiling" value={formData.wage_ceiling || ''} onChange={handleChange} />
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                    <Button type="button" variant="secondary" onClick={onClose}>Close</Button>
                    <Button type="submit" variant="primary" loading={loading}>Save</Button>
                </div>
            </form>
        </Modal>
    );
};
