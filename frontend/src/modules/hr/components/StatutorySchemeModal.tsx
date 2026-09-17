import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { apiClient } from '../api';
import type { StatutoryScheme } from '../types';

interface StatutorySchemeModalProps {
    isOpen: boolean;
    onClose: () => void;
    scheme?: StatutoryScheme | null;
    onSave: () => void;
}

export const StatutorySchemeModal: React.FC<StatutorySchemeModalProps> = ({
    isOpen,
    onClose,
    scheme,
    onSave
}) => {
    const [formData, setFormData] = useState({
        name: '',
        scheme_type: 'TAX',
        description: '',
        is_active: true
    });
    
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (scheme) {
            setFormData({
                name: scheme.name || '',
                scheme_type: scheme.scheme_type || 'TAX',
                description: scheme.description || '',
                is_active: scheme.is_active !== undefined ? scheme.is_active : true
            });
        } else {
            setFormData({
                name: '',
                scheme_type: 'TAX',
                description: '',
                is_active: true
            });
        }
    }, [scheme, isOpen]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
        setFormData(prev => ({ ...prev, [name]: val }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            if (scheme?.id) {
                await apiClient.put(`/api/hrm/statutory-schemes/${scheme.id}/`, formData);
            } else {
                await apiClient.post('/api/hrm/statutory-schemes/', formData);
            }
            onSave();
            onClose();
        } catch (err: any) {
            setError(err.response?.data?.detail || err.response?.data?.non_field_errors?.[0] || err.message || 'Error saving statutory scheme');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={scheme ? 'Edit Statutory Scheme' : 'New Statutory Scheme'}>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {error && <div style={{ color: 'red' }}>{error}</div>}
                
                <Input label="Name" name="name" value={formData.name} onChange={handleChange} required />
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Type</label>
                    <select
                        name="scheme_type"
                        value={formData.scheme_type}
                        onChange={handleChange}
                        style={{ padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }}
                        required
                    >
                        <option value="TAX">Tax</option>
                        <option value="EOBI">EOBI</option>
                        <option value="SOCIAL_SECURITY">Social Security</option>
                        <option value="PROVIDENT_FUND">Provident Fund</option>
                        <option value="GRATUITY">Gratuity</option>
                        <option value="OTHER">Other</option>
                    </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Description</label>
                    <textarea 
                        name="description"
                        value={formData.description}
                        onChange={handleChange}
                        rows={3}
                        style={{ padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db', resize: 'vertical' }}
                    />
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input 
                        type="checkbox" 
                        id="is_active" 
                        name="is_active" 
                        checked={formData.is_active} 
                        onChange={handleChange} 
                    />
                    <label htmlFor="is_active" style={{ fontSize: '0.875rem', fontWeight: 500 }}>Is Active</label>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                    <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button type="submit" variant="primary" disabled={loading}>
                        {loading ? 'Saving...' : 'Save Scheme'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
