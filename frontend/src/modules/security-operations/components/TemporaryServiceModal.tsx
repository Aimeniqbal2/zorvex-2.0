import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useToastStore } from '../../../stores/toastStore';
import { apiClient } from '../api';
import type { TemporaryServiceRequest } from '../types';
import { createTemporaryService, updateTemporaryService } from '../api';

interface TemporaryServiceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => void;
    service?: TemporaryServiceRequest | null;
}

export const TemporaryServiceModal: React.FC<TemporaryServiceModalProps> = ({ isOpen, onClose, onSaved, service }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [entities, setEntities] = useState<any[]>([]);
    const [sites, setSites] = useState<any[]>([]);
    
    const [formData, setFormData] = useState<Partial<TemporaryServiceRequest>>({
        crm_entity: '',
        operational_site: '',
        reference_number: '',
        start_datetime: '',
        end_datetime: '',
        status: 'DRAFT',
        notes: ''
    });

    useEffect(() => {
        const fetchDependencies = async () => {
            try {
                const [entitiesRes, sitesRes] = await Promise.all([
                    apiClient.get('/api/crm/entities/?active=true'),
                    apiClient.get('/api/operations/sites/?is_active=true')
                ]);
                setEntities(entitiesRes.data.results || entitiesRes.data);
                setSites(sitesRes.data.results || sitesRes.data);
            } catch (err) {
                console.error('Failed to load dependencies', err);
            }
        };
        if (isOpen) {
            fetchDependencies();
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) {
            setErrors({});
            if (service) {
                setFormData({
                    crm_entity: service.crm_entity,
                    operational_site: service.operational_site || '',
                    reference_number: service.reference_number,
                    start_datetime: service.start_datetime ? service.start_datetime.slice(0, 16) : '',
                    end_datetime: service.end_datetime ? service.end_datetime.slice(0, 16) : '',
                    status: service.status,
                    notes: service.notes,
                });
            } else {
                setFormData({
                    crm_entity: '',
                    operational_site: '',
                    reference_number: `TSR-${Math.floor(Math.random() * 10000)}`,
                    start_datetime: '',
                    end_datetime: '',
                    status: 'DRAFT',
                    notes: ''
                });
            }
        }
    }, [isOpen, service]);

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

        const payload: Partial<TemporaryServiceRequest> = {
            ...formData,
            operational_site: formData.operational_site === '' ? null : formData.operational_site,
        };

        try {
            if (service) {
                await updateTemporaryService(service.id, payload);
                useToastStore.getState().success('Temporary Service updated');
            } else {
                await createTemporaryService(payload);
                useToastStore.getState().success('Temporary Service created');
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
            title={service ? 'Edit Temporary Service' : 'Request Temporary Service'}
        >
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-3)' }}>
                    <div className="form-field">
                        <label className="form-label">Client / Entity <span className="required">*</span></label>
                        <select 
                            className={`input-base ${errors.crm_entity ? 'input-error' : ''}`}
                            name="crm_entity"
                            value={formData.crm_entity}
                            onChange={handleChange}
                            required
                        >
                            <option value="">Select Entity...</option>
                            {entities.map(entity => (
                                <option key={entity.id} value={entity.id}>{entity.name}</option>
                            ))}
                        </select>
                        {errors.crm_entity && <span className="input-error-text">{errors.crm_entity.join(', ')}</span>}
                    </div>

                    <div className="form-field">
                        <label className="form-label">Operational Site</label>
                        <select 
                            className={`input-base ${errors.operational_site ? 'input-error' : ''}`}
                            name="operational_site"
                            value={formData.operational_site || ''}
                            onChange={handleChange}
                        >
                            <option value="">None / Temporary Site</option>
                            {sites.map(site => (
                                <option key={site.id} value={site.id}>{site.name}</option>
                            ))}
                        </select>
                        {errors.operational_site && <span className="input-error-text">{errors.operational_site.join(', ')}</span>}
                    </div>

                    <Input 
                        label="Reference Number" 
                        name="reference_number" 
                        value={formData.reference_number} 
                        onChange={handleChange} 
                        required 
                        error={errors.reference_number?.join(', ')}
                    />

                    <div className="form-field">
                        <label className="form-label">Status <span className="required">*</span></label>
                        <select 
                            className={`input-base ${errors.status ? 'input-error' : ''}`}
                            name="status"
                            value={formData.status}
                            onChange={handleChange}
                            required
                            disabled={!!service} // Prevent manual status edit if updating
                        >
                            <option value="DRAFT">Draft</option>
                            <option value="REQUESTED">Requested</option>
                            <option value="APPROVED">Approved</option>
                            <option value="CONFIRMED">Confirmed</option>
                            <option value="COMPLETED">Completed</option>
                        </select>
                        {errors.status && <span className="input-error-text">{errors.status.join(', ')}</span>}
                    </div>

                    <Input 
                        label="Start Date & Time" 
                        name="start_datetime" 
                        type="datetime-local"
                        value={formData.start_datetime} 
                        onChange={handleChange} 
                        required
                        error={errors.start_datetime?.join(', ')}
                    />
                    
                    <Input 
                        label="End Date & Time" 
                        name="end_datetime" 
                        type="datetime-local"
                        value={formData.end_datetime} 
                        onChange={handleChange} 
                        required
                        error={errors.end_datetime?.join(', ')}
                    />
                </div>

                <div className="form-field">
                    <label className="form-label">Notes</label>
                    <textarea 
                        className={`input-base ${errors.notes ? 'input-error' : ''}`}
                        name="notes"
                        value={formData.notes}
                        onChange={handleChange}
                        rows={3}
                    />
                    {errors.notes && <span className="input-error-text">{errors.notes.join(', ')}</span>}
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
