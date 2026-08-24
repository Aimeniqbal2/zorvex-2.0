import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useToastStore } from '../../../stores/toastStore';
import type { CRMEntity, CreateCRMEntityPayload, CRMEntityType } from '../types';
import { createEntity, updateEntity } from '../api';

interface EntityModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => void;
    entity?: CRMEntity | null;
}

const ENTITY_TYPES: CRMEntityType[] = [
    'CUSTOMER', 'SUPPLIER', 'LEAD', 'PARTNER', 
    'PERSON', 'COMPANY', 'GOVERNMENT', 'NGO', 
    'EMPLOYEE', 'CONTRACTOR', 'OTHER'
];

export const EntityModal: React.FC<EntityModalProps> = ({ isOpen, onClose, onSaved, entity }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    
    const [formData, setFormData] = useState<CreateCRMEntityPayload>({
        entity_type: 'CUSTOMER',
        name: '',
        display_name: '',
        code: '',
        website: '',
        tax_number: '',
        registration_number: '',
        credit_limit: 0,
        payment_terms: '',
        preferred_currency: 'PKR',
        preferred_language: 'en',
    });

    useEffect(() => {
        if (isOpen) {
            setErrors({});
            if (entity) {
                setFormData({
                    entity_type: entity.entity_type,
                    name: entity.name,
                    display_name: entity.display_name,
                    code: entity.code,
                    website: entity.website,
                    tax_number: entity.tax_number,
                    registration_number: entity.registration_number,
                    credit_limit: entity.credit_limit,
                    payment_terms: entity.payment_terms,
                    preferred_currency: entity.preferred_currency,
                    preferred_language: entity.preferred_language,
                });
            } else {
                setFormData({
                    entity_type: 'CUSTOMER',
                    name: '',
                    display_name: '',
                    code: '',
                    website: '',
                    tax_number: '',
                    registration_number: '',
                    credit_limit: 0,
                    payment_terms: '',
                    preferred_currency: 'PKR',
                    preferred_language: 'en',
                });
            }
        }
    }, [isOpen, entity]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        // Clear field error on change
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: [] }));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setErrors({});

        try {
            if (entity) {
                await updateEntity(entity.id, formData);
                useToastStore.getState().success('Entity updated successfully');
            } else {
                await createEntity(formData);
                useToastStore.getState().success('Entity created successfully');
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
            title={entity ? 'Edit Entity' : 'Create Entity'}
        >
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
                <h3 style={{ fontSize: '14px', borderBottom: '1px solid var(--color-border)', paddingBottom: '4px', marginBottom: '8px' }}>BASIC INFORMATION</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-3)' }}>
                    <div className="form-field">
                        <label className="form-label">Entity Type <span className="required">*</span></label>
                        <select 
                            className={`input-base ${errors.entity_type ? 'input-error' : ''}`}
                            name="entity_type"
                            value={formData.entity_type}
                            onChange={handleChange}
                            required
                        >
                            {ENTITY_TYPES.map(type => (
                                <option key={type} value={type}>{type}</option>
                            ))}
                        </select>
                        {errors.entity_type && <span className="input-error-text">{errors.entity_type.join(', ')}</span>}
                    </div>
                    
                    <Input 
                        label="Code" 
                        name="code" 
                        value={formData.code} 
                        onChange={handleChange} 
                        required 
                        error={errors.code?.join(', ')}
                    />
                    
                    <Input 
                        label="Name" 
                        name="name" 
                        value={formData.name} 
                        onChange={handleChange} 
                        required 
                        error={errors.name?.join(', ')}
                    />
                    
                    <Input 
                        label="Display Name" 
                        name="display_name" 
                        value={formData.display_name} 
                        onChange={handleChange} 
                        error={errors.display_name?.join(', ')}
                        helpText="Optional alias or trading name"
                    />
                </div>

                <h3 style={{ fontSize: '14px', borderBottom: '1px solid var(--color-border)', paddingBottom: '4px', marginBottom: '8px', marginTop: '16px' }}>BUSINESS DETAILS</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-3)' }}>
                    <Input 
                        label="Tax Number" 
                        name="tax_number" 
                        value={formData.tax_number} 
                        onChange={handleChange} 
                        error={errors.tax_number?.join(', ')}
                    />
                    
                    <Input 
                        label="Registration Number" 
                        name="registration_number" 
                        value={formData.registration_number} 
                        onChange={handleChange} 
                        error={errors.registration_number?.join(', ')}
                    />
                    
                    <Input 
                        label="Website" 
                        name="website" 
                        type="url"
                        value={formData.website} 
                        onChange={handleChange} 
                        error={errors.website?.join(', ')}
                        style={{ gridColumn: 'span 2' }}
                    />
                </div>

                <h3 style={{ fontSize: '14px', borderBottom: '1px solid var(--color-border)', paddingBottom: '4px', marginBottom: '8px', marginTop: '16px' }}>COMMERCIAL</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-3)' }}>
                    <Input 
                        label="Credit Limit" 
                        name="credit_limit" 
                        type="number"
                        step="0.01"
                        value={formData.credit_limit} 
                        onChange={handleChange} 
                        error={errors.credit_limit?.join(', ')}
                    />
                    
                    <Input 
                        label="Payment Terms" 
                        name="payment_terms" 
                        value={formData.payment_terms} 
                        onChange={handleChange} 
                        error={errors.payment_terms?.join(', ')}
                    />
                    
                    <Input 
                        label="Preferred Currency" 
                        name="preferred_currency" 
                        value={formData.preferred_currency} 
                        onChange={handleChange} 
                        error={errors.preferred_currency?.join(', ')}
                    />
                    
                    <Input 
                        label="Preferred Language" 
                        name="preferred_language" 
                        value={formData.preferred_language} 
                        onChange={handleChange} 
                        error={errors.preferred_language?.join(', ')}
                    />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--spacing-2)', marginTop: '24px' }}>
                    <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
                    <Button type="submit" variant="primary" disabled={isSubmitting}>
                        {isSubmitting ? 'Saving...' : 'Save'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
