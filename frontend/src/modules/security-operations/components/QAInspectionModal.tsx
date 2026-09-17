import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useToastStore } from '../../../stores/toastStore';
import { createQAInspection, updateQAInspection, getQATemplates, apiClient } from '../api';
import type { QAInspection, QAChecklistTemplate } from '../types';

interface QAInspectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => void;
    inspection?: QAInspection | null;
}

export const QAInspectionModal: React.FC<QAInspectionModalProps> = ({ isOpen, onClose, onSaved, inspection }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [templates, setTemplates] = useState<QAChecklistTemplate[]>([]);
    const [contracts, setContracts] = useState<any[]>([]);
    const [sites, setSites] = useState<any[]>([]);
    const [inspectors, setInspectors] = useState<any[]>([]);
    
    const [formData, setFormData] = useState<Partial<QAInspection>>({
        template: '',
        service_contract: '',
        operational_site: '',
        inspector: '',
        inspection_date: new Date().toISOString().split('T')[0],
        status: 'DRAFT',
        notes: ''
    });

    useEffect(() => {
        const fetchDependencies = async () => {
            try {
                const [tplRes, contractsRes, sitesRes, inspRes] = await Promise.all([
                    getQATemplates(),
                    apiClient.get('/api/operations/contracts/?status=ACTIVE'),
                    apiClient.get('/api/operations/sites/?is_active=true'),
                    apiClient.get('/api/hrm/employees/?is_active=true')
                ]);
                setTemplates(tplRes);
                setContracts(contractsRes.data.results || contractsRes.data);
                setSites(sitesRes.data.results || sitesRes.data);
                setInspectors(inspRes.data.results || inspRes.data);
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
            if (inspection) {
                setFormData({
                    template: inspection.template,
                    service_contract: inspection.service_contract || '',
                    operational_site: inspection.operational_site,
                    inspector: inspection.inspector,
                    inspection_date: inspection.inspection_date,
                    status: inspection.status,
                    notes: inspection.notes,
                });
            } else {
                setFormData({
                    template: '',
                    service_contract: '',
                    operational_site: '',
                    inspector: '',
                    inspection_date: new Date().toISOString().split('T')[0],
                    status: 'DRAFT',
                    notes: ''
                });
            }
        }
    }, [isOpen, inspection]);

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

        const payload: Partial<QAInspection> = {
            ...formData,
            service_contract: formData.service_contract === '' ? null : formData.service_contract,
        };

        try {
            if (inspection) {
                await updateQAInspection(inspection.id, payload);
                useToastStore.getState().success('Inspection updated');
            } else {
                await createQAInspection(payload);
                useToastStore.getState().success('Inspection created');
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
            title={inspection ? 'Edit QA Inspection' : 'New QA Inspection'}
        >
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-3)' }}>
                    <div className="form-field">
                        <label className="form-label">QA Template <span className="required">*</span></label>
                        <select 
                            className={`input-base ${errors.template ? 'input-error' : ''}`}
                            name="template"
                            value={formData.template}
                            onChange={handleChange}
                            required
                            disabled={!!inspection} // Usually shouldn't change template after creation
                        >
                            <option value="">Select Template...</option>
                            {templates.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                        </select>
                        {errors.template && <span className="input-error-text">{errors.template.join(', ')}</span>}
                    </div>

                    <div className="form-field">
                        <label className="form-label">Operational Site <span className="required">*</span></label>
                        <select 
                            className={`input-base ${errors.operational_site ? 'input-error' : ''}`}
                            name="operational_site"
                            value={formData.operational_site}
                            onChange={handleChange}
                            required
                        >
                            <option value="">Select Site...</option>
                            {sites.map(site => (
                                <option key={site.id} value={site.id}>{site.name}</option>
                            ))}
                        </select>
                        {errors.operational_site && <span className="input-error-text">{errors.operational_site.join(', ')}</span>}
                    </div>

                    <div className="form-field">
                        <label className="form-label">Service Contract</label>
                        <select 
                            className={`input-base ${errors.service_contract ? 'input-error' : ''}`}
                            name="service_contract"
                            value={formData.service_contract || ''}
                            onChange={handleChange}
                        >
                            <option value="">None / Temporary Site</option>
                            {contracts.map(c => (
                                <option key={c.id} value={c.id}>{c.contract_code} - {c.customer_name}</option>
                            ))}
                        </select>
                        {errors.service_contract && <span className="input-error-text">{errors.service_contract.join(', ')}</span>}
                    </div>

                    <div className="form-field">
                        <label className="form-label">Inspector <span className="required">*</span></label>
                        <select 
                            className={`input-base ${errors.inspector ? 'input-error' : ''}`}
                            name="inspector"
                            value={formData.inspector}
                            onChange={handleChange}
                            required
                        >
                            <option value="">Select Inspector...</option>
                            {inspectors.map(emp => (
                                <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name} ({emp.employee_code})</option>
                            ))}
                        </select>
                        {errors.inspector && <span className="input-error-text">{errors.inspector.join(', ')}</span>}
                    </div>

                    <Input 
                        label="Inspection Date" 
                        name="inspection_date" 
                        type="date"
                        value={formData.inspection_date} 
                        onChange={handleChange} 
                        required
                        error={errors.inspection_date?.join(', ')}
                    />
                    
                    <div className="form-field">
                        <label className="form-label">Status <span className="required">*</span></label>
                        <select 
                            className={`input-base ${errors.status ? 'input-error' : ''}`}
                            name="status"
                            value={formData.status}
                            onChange={handleChange}
                            required
                            disabled={!!inspection}
                        >
                            <option value="DRAFT">Draft</option>
                            <option value="SUBMITTED">Submitted</option>
                            <option value="REVIEWED">Reviewed</option>
                        </select>
                        {errors.status && <span className="input-error-text">{errors.status.join(', ')}</span>}
                    </div>
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
