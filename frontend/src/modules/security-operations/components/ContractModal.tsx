import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { apiClient } from '../api';
import type { ServiceContract, OperationalSite } from '../types';

interface ContractModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    contract: ServiceContract | null;
}

export const ContractModal: React.FC<ContractModalProps> = ({ isOpen, onClose, onSave, contract }) => {
    const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
    const [sites, setSites] = useState<OperationalSite[]>([]);
    
    const [formData, setFormData] = useState<Partial<ServiceContract>>({
        crm_entity: '',
        contract_code: '',
        start_date: '',
        end_date: '',
        status: 'DRAFT',
        notes: '',
        sites: []
    });
    
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            fetchCustomers();
            if (contract) {
                setFormData({
                    crm_entity: contract.crm_entity,
                    contract_code: contract.contract_code,
                    start_date: contract.start_date,
                    end_date: contract.end_date || '',
                    status: contract.status,
                    notes: contract.notes || '',
                    sites: contract.sites || []
                });
                if (contract.crm_entity) {
                    fetchSites(contract.crm_entity);
                }
            } else {
                setFormData({
                    crm_entity: '',
                    contract_code: '',
                    start_date: '',
                    end_date: '',
                    status: 'DRAFT',
                    notes: '',
                    sites: []
                });
                setSites([]);
            }
        }
    }, [isOpen, contract]);

    const fetchCustomers = async () => {
        try {
            const res = await apiClient.get('/api/crm/entities/?role=CUSTOMER&active=true');
            setCustomers(res.data.results || res.data);
        } catch (err) {
            console.error('Failed to fetch customers', err);
        }
    };

    const fetchSites = async (customerId: string) => {
        try {
            const res = await apiClient.get(`/api/operations/sites/?customer=${customerId}&is_active=true`);
            setSites(res.data.results || res.data);
        } catch (err) {
            console.error('Failed to fetch sites', err);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        
        if (name === 'crm_entity') {
            fetchSites(value);
            setFormData(prev => ({ ...prev, sites: [] }));
        }
    };

    const handleSiteToggle = (siteId: string) => {
        setFormData(prev => {
            const currentSites = prev.sites || [];
            if (currentSites.includes(siteId)) {
                return { ...prev, sites: currentSites.filter(id => id !== siteId) };
            } else {
                return { ...prev, sites: [...currentSites, siteId] };
            }
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        
        const payload = {
            ...formData,
            end_date: formData.end_date || null
        };

        try {
            if (contract?.id) {
                await apiClient.patch(`/api/operations/contracts/${contract.id}/`, payload);
            } else {
                await apiClient.post('/api/operations/contracts/', payload);
            }
            onSave();
            onClose();
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Failed to save contract');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={contract ? 'Edit Contract' : 'New Contract'}>
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
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <Input 
                        label="Contract Code"
                        type="text"
                        name="contract_code"
                        value={formData.contract_code || ''}
                        onChange={handleChange}
                        required
                    />
                    <div className="form-field">
                        <label className="form-label">Status</label>
                        <select 
                            name="status"
                            value={formData.status}
                            onChange={handleChange}
                            className="input-base"
                            required
                        >
                            <option value="DRAFT">Draft</option>
                            <option value="ACTIVE">Active</option>
                            <option value="SUSPENDED">Suspended</option>
                            <option value="EXPIRED">Expired</option>
                            <option value="TERMINATED">Terminated</option>
                        </select>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <Input 
                        label="Start Date"
                        type="date"
                        name="start_date"
                        value={formData.start_date || ''}
                        onChange={handleChange}
                        required
                    />
                    <Input 
                        label="End Date"
                        type="date"
                        name="end_date"
                        value={formData.end_date || ''}
                        onChange={handleChange}
                    />
                </div>

                <div className="form-field">
                    <label className="form-label">Notes</label>
                    <textarea 
                        name="notes"
                        value={formData.notes || ''}
                        onChange={handleChange}
                        className="input-base"
                    />
                </div>

                {formData.crm_entity && (
                    <div className="form-field">
                        <label className="form-label">Assigned Sites</label>
                        <div className="input-base" style={{ maxHeight: '160px', overflowY: 'auto' }}>
                            {sites.length === 0 ? (
                                <div style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>No active sites found for this customer.</div>
                            ) : (
                                sites.map(site => (
                                    <div key={site.id} style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                                        <input 
                                            type="checkbox"
                                            id={`site-${site.id}`}
                                            checked={(formData.sites || []).includes(site.id)}
                                            onChange={() => handleSiteToggle(site.id)}
                                            style={{ marginRight: '8px' }}
                                        />
                                        <label htmlFor={`site-${site.id}`} style={{ fontSize: '14px' }}>{site.name}</label>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '24px' }}>
                    <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
                    <Button variant="primary" type="submit" loading={loading}>Save</Button>
                </div>
            </form>
        </Modal>
    );
};
