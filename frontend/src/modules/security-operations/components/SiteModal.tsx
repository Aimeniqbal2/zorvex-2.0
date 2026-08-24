import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { apiClient } from '../api';
import type { OperationalSite } from '../types';

interface SiteModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    site: OperationalSite | null;
}

export const SiteModal: React.FC<SiteModalProps> = ({ isOpen, onClose, onSave, site }) => {
    const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
    const [formData, setFormData] = useState<Partial<OperationalSite>>({
        crm_entity: '',
        name: '',
        address: '',
        latitude: '',
        longitude: '',
        is_active: true
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            fetchCustomers();
            if (site) {
                setFormData({
                    crm_entity: site.crm_entity,
                    name: site.name,
                    address: site.address,
                    latitude: site.latitude || '',
                    longitude: site.longitude || '',
                    is_active: site.is_active
                });
            } else {
                setFormData({
                    crm_entity: '',
                    name: '',
                    address: '',
                    latitude: '',
                    longitude: '',
                    is_active: true
                });
            }
        }
    }, [isOpen, site]);

    const fetchCustomers = async () => {
        try {
            const res = await apiClient.get('/api/crm/entities/?role=CUSTOMER&active=true');
            setCustomers(res.data.results || res.data);
        } catch (err) {
            console.error('Failed to fetch customers', err);
        }
    };

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
            if (site?.id) {
                await apiClient.patch(`/api/operations/sites/${site.id}/`, formData);
            } else {
                await apiClient.post('/api/operations/sites/', formData);
            }
            onSave();
            onClose();
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Failed to save site');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={site ? 'Edit Site' : 'New Site'}>
            <form onSubmit={handleSubmit} className="space-y-4 p-4">
                {error && <div className="text-red-500 mb-4">{error}</div>}
                
                <div className="form-field">
                    <label className="form-label">Customer</label>
                    <select 
                        name="crm_entity"
                        value={formData.crm_entity}
                        onChange={handleChange}
                        className="input-base"
                        required
                    >
                        <option value="">Select Customer</option>
                        {customers.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                </div>
                
                <Input 
                    label="Site Name"
                    type="text"
                    name="name"
                    value={formData.name || ''}
                    onChange={handleChange}
                    required
                />
                
                <div className="form-field">
                    <label className="form-label">Address</label>
                    <textarea 
                        name="address"
                        value={formData.address || ''}
                        onChange={handleChange}
                        className="input-base"
                        required
                    />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <Input 
                        label="Latitude"
                        type="number"
                        step="any"
                        name="latitude"
                        value={formData.latitude || ''}
                        onChange={handleChange}
                    />
                    <Input 
                        label="Longitude"
                        type="number"
                        step="any"
                        name="longitude"
                        value={formData.longitude || ''}
                        onChange={handleChange}
                    />
                </div>

                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <input 
                        type="checkbox"
                        name="is_active"
                        checked={formData.is_active}
                        onChange={handleChange}
                        id="is_active"
                        style={{ marginRight: '8px' }}
                    />
                    <label htmlFor="is_active" style={{ fontSize: '14px', fontWeight: 500 }}>Active</label>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '24px' }}>
                    <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
                    <Button variant="primary" type="submit" loading={loading}>Save</Button>
                </div>
            </form>
        </Modal>
    );
};
