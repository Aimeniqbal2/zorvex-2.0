import React, { useState, useEffect } from 'react';
import { Modal } from '../../../../components/ui/Modal';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { useToastStore } from '../../../../stores/toastStore';
import { createProposalLine, updateProposalLine } from '../../api';
import type { ProposalLine } from '../../types';

interface ProposalLineModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => void;
    proposalId: string;
    line?: ProposalLine | null;
}

export const ProposalLineModal: React.FC<ProposalLineModalProps> = ({ isOpen, onClose, onSaved, proposalId, line }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    
    const [formData, setFormData] = useState<Partial<ProposalLine>>({
        proposal: proposalId,
        description: '',
        designation: '',
        quantity: 1,
        unit: 'Month',
        rate: 0
    });

    useEffect(() => {
        if (isOpen) {
            setErrors({});
            if (line) {
                setFormData({
                    proposal: proposalId,
                    description: line.description,
                    designation: line.designation || '',
                    quantity: line.quantity,
                    unit: line.unit,
                    rate: line.rate
                });
            } else {
                setFormData({
                    proposal: proposalId,
                    description: '',
                    designation: '',
                    quantity: 1,
                    unit: 'Month',
                    rate: 0
                });
            }
        }
    }, [isOpen, line, proposalId]);

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

        // Calculate amount just in case, though backend should handle it
        const payload = {
            ...formData,
            designation: formData.designation === '' ? null : formData.designation
        };

        try {
            if (line) {
                await updateProposalLine(line.id, payload);
                useToastStore.getState().success('Line updated successfully');
            } else {
                await createProposalLine(payload);
                useToastStore.getState().success('Line added successfully');
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
            title={line ? 'Edit Line Item' : 'Add Line Item'}
        >
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--spacing-3)' }}>
                    <div className="form-field">
                        <label className="form-label">Description <span className="required">*</span></label>
                        <textarea 
                            className={`input-base ${errors.description ? 'input-error' : ''}`}
                            name="description"
                            value={formData.description}
                            onChange={handleChange}
                            rows={3}
                            required
                        />
                        {errors.description && <span className="input-error-text">{errors.description.join(', ')}</span>}
                    </div>

                    {/* Simple text input for designation for now, or UUID if they know it. Usually it's a select. 
                        Let's keep it as text input for UUID or leave blank for custom lines. */}
                    <Input 
                        label="Designation (Optional ID)" 
                        name="designation" 
                        value={formData.designation as string} 
                        onChange={handleChange} 
                        error={errors.designation?.join(', ')}
                        helpText="Leave empty for custom line items."
                    />

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--spacing-3)' }}>
                        <Input 
                            label="Quantity" 
                            name="quantity" 
                            type="number"
                            step="0.01"
                            value={formData.quantity as string} 
                            onChange={handleChange} 
                            required
                            error={errors.quantity?.join(', ')}
                        />
                        
                        <Input 
                            label="Unit" 
                            name="unit" 
                            value={formData.unit} 
                            onChange={handleChange} 
                            required
                            error={errors.unit?.join(', ')}
                            placeholder="e.g. Month, Hour"
                        />
                        
                        <Input 
                            label="Rate (Unit Price)" 
                            name="rate" 
                            type="number"
                            step="0.01"
                            value={formData.rate as string} 
                            onChange={handleChange} 
                            required
                            error={errors.rate?.join(', ')}
                        />
                    </div>
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
