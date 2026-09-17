import React, { useState, useEffect } from 'react';
import { Modal } from '../../../../components/ui/Modal';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { useToastStore } from '../../../../stores/toastStore';
import { createOpportunity, updateOpportunity, getEntities } from '../../api';
import type { Opportunity, CRMEntity } from '../../types';

interface OpportunityModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => void;
    opportunity?: Opportunity | null;
}

const STAGES = ['LEAD', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'AWARDED', 'WON', 'LOST'];

export const OpportunityModal: React.FC<OpportunityModalProps> = ({ isOpen, onClose, onSaved, opportunity }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [entities, setEntities] = useState<CRMEntity[]>([]);
    
    const [formData, setFormData] = useState<Partial<Opportunity>>({
        crm_entity: '',
        title: '',
        stage: 'LEAD',
        estimated_value: '',
        probability: '',
        expected_close_date: '',
        source: '',
        notes: '',
        loss_reason: '',
        competitor: ''
    });

    useEffect(() => {
        const fetchEntities = async () => {
            try {
                // Get all active entities to show in the dropdown
                const res = await getEntities({ active: true });
                setEntities(res.results || []);
            } catch (err) {
                console.error('Failed to load entities', err);
            }
        };
        if (isOpen) {
            fetchEntities();
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) {
            setErrors({});
            if (opportunity) {
                setFormData({
                    crm_entity: opportunity.crm_entity,
                    title: opportunity.title,
                    stage: opportunity.stage,
                    estimated_value: opportunity.estimated_value,
                    probability: opportunity.probability,
                    expected_close_date: opportunity.expected_close_date || '',
                    source: opportunity.source,
                    notes: opportunity.notes,
                    loss_reason: opportunity.loss_reason,
                    competitor: opportunity.competitor,
                });
            } else {
                setFormData({
                    crm_entity: '',
                    title: '',
                    stage: 'LEAD',
                    estimated_value: '',
                    probability: '',
                    expected_close_date: '',
                    source: '',
                    notes: '',
                    loss_reason: '',
                    competitor: ''
                });
            }
        }
    }, [isOpen, opportunity]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: [] }));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setErrors({});

        // Validate payload values: replace empty strings with undefined or null where appropriate
        const payload: Partial<Opportunity> = {
            ...formData,
            estimated_value: formData.estimated_value === '' ? undefined : formData.estimated_value,
            probability: formData.probability === '' ? undefined : formData.probability,
            expected_close_date: formData.expected_close_date === '' ? null : formData.expected_close_date,
        };

        try {
            if (opportunity) {
                await updateOpportunity(opportunity.id, payload);
                useToastStore.getState().success('Opportunity updated successfully');
            } else {
                await createOpportunity(payload);
                useToastStore.getState().success('Opportunity created successfully');
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
            title={opportunity ? 'Edit Opportunity' : 'Add Opportunity'}
        >
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-3)' }}>
                    <div className="form-field" style={{ gridColumn: 'span 2' }}>
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
                                <option key={entity.id} value={entity.id}>
                                    {entity.name} {entity.code ? `(${entity.code})` : ''}
                                </option>
                            ))}
                        </select>
                        {errors.crm_entity && <span className="input-error-text">{errors.crm_entity.join(', ')}</span>}
                    </div>

                    <div style={{ gridColumn: 'span 2' }}>
                        <Input 
                            label="Opportunity Title" 
                            name="title" 
                            value={formData.title} 
                            onChange={handleChange} 
                            required 
                            error={errors.title?.join(', ')}
                        />
                    </div>
                    
                    <div className="form-field">
                        <label className="form-label">Stage <span className="required">*</span></label>
                        <select 
                            className={`input-base ${errors.stage ? 'input-error' : ''}`}
                            name="stage"
                            value={formData.stage}
                            onChange={handleChange}
                            required
                        >
                            {STAGES.map(stage => (
                                <option key={stage} value={stage}>{stage}</option>
                            ))}
                        </select>
                        {errors.stage && <span className="input-error-text">{errors.stage.join(', ')}</span>}
                    </div>
                    
                    <Input 
                        label="Source" 
                        name="source" 
                        value={formData.source} 
                        onChange={handleChange} 
                        error={errors.source?.join(', ')}
                    />

                    <Input 
                        label="Estimated Value" 
                        name="estimated_value" 
                        type="number"
                        step="0.01"
                        value={formData.estimated_value as string} 
                        onChange={handleChange} 
                        error={errors.estimated_value?.join(', ')}
                    />
                    
                    <Input 
                        label="Probability (%)" 
                        name="probability" 
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={formData.probability as string} 
                        onChange={handleChange} 
                        error={errors.probability?.join(', ')}
                    />

                    <Input 
                        label="Expected Close Date" 
                        name="expected_close_date" 
                        type="date"
                        value={formData.expected_close_date as string} 
                        onChange={handleChange} 
                        error={errors.expected_close_date?.join(', ')}
                    />
                    
                    <Input 
                        label="Competitor" 
                        name="competitor" 
                        value={formData.competitor} 
                        onChange={handleChange} 
                        error={errors.competitor?.join(', ')}
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

                {formData.stage === 'LOST' && (
                    <div className="form-field">
                        <label className="form-label">Loss Reason</label>
                        <textarea 
                            className={`input-base ${errors.loss_reason ? 'input-error' : ''}`}
                            name="loss_reason"
                            value={formData.loss_reason}
                            onChange={handleChange}
                            rows={2}
                            required
                        />
                        {errors.loss_reason && <span className="input-error-text">{errors.loss_reason.join(', ')}</span>}
                    </div>
                )}

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
