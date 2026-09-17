import React, { useState, useEffect, useRef } from 'react';
import { Modal } from '../../../../components/ui/Modal';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { useToastStore } from '../../../../stores/toastStore';
import { createOpportunityAward, getProposals } from '../../api';
import type { Proposal } from '../../types';

interface OpportunityAwardModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => void;
    opportunityId: string;
}

const AWARD_METHODS = ['EMAIL', 'LETTER', 'PORTAL', 'OTHER'];

export const OpportunityAwardModal: React.FC<OpportunityAwardModalProps> = ({ isOpen, onClose, onSaved, opportunityId }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [proposals, setProposals] = useState<Proposal[]>([]);
    
    const [formData, setFormData] = useState({
        opportunity: opportunityId,
        proposal: '',
        method: 'EMAIL',
        award_reference: '',
        award_date: new Date().toISOString().split('T')[0],
        effective_date: '',
        notes: ''
    });
    
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const fetchProposals = async () => {
            try {
                const res = await getProposals({ opportunity: opportunityId });
                setProposals(res.results || []);
            } catch (err) {
                console.error('Failed to load proposals', err);
            }
        };
        if (isOpen) {
            fetchProposals();
            setFormData({
                opportunity: opportunityId,
                proposal: '',
                method: 'EMAIL',
                award_reference: '',
                award_date: new Date().toISOString().split('T')[0],
                effective_date: '',
                notes: ''
            });
            setErrors({});
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    }, [isOpen, opportunityId]);

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

        try {
            const file = fileInputRef.current?.files?.[0];
            
            if (file) {
                const payloadData = new FormData();
                payloadData.append('opportunity', formData.opportunity);
                if (formData.proposal) payloadData.append('proposal', formData.proposal);
                payloadData.append('method', formData.method);
                payloadData.append('award_reference', formData.award_reference);
                payloadData.append('award_date', formData.award_date);
                if (formData.effective_date) payloadData.append('effective_date', formData.effective_date);
                if (formData.notes) payloadData.append('notes', formData.notes);
                payloadData.append('attachment', file);
                
                await createOpportunityAward(payloadData);
            } else {
                const payload = {
                    ...formData,
                    proposal: formData.proposal === '' ? null : formData.proposal,
                    effective_date: formData.effective_date === '' ? null : formData.effective_date
                };
                await createOpportunityAward(payload as any);
            }
            
            useToastStore.getState().success('Award recorded successfully');
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
            title="Record Award"
        >
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-3)' }}>
                    <div className="form-field" style={{ gridColumn: 'span 2' }}>
                        <label className="form-label">Related Proposal</label>
                        <select 
                            className={`input-base ${errors.proposal ? 'input-error' : ''}`}
                            name="proposal"
                            value={formData.proposal}
                            onChange={handleChange}
                        >
                            <option value="">None (Direct Award)</option>
                            {proposals.map(prop => (
                                <option key={prop.id} value={prop.id}>
                                    {prop.proposal_number} - {prop.title}
                                </option>
                            ))}
                        </select>
                        {errors.proposal && <span className="input-error-text">{errors.proposal.join(', ')}</span>}
                    </div>

                    <div className="form-field">
                        <label className="form-label">Award Method <span className="required">*</span></label>
                        <select 
                            className={`input-base ${errors.method ? 'input-error' : ''}`}
                            name="method"
                            value={formData.method}
                            onChange={handleChange}
                            required
                        >
                            {AWARD_METHODS.map(method => (
                                <option key={method} value={method}>{method}</option>
                            ))}
                        </select>
                        {errors.method && <span className="input-error-text">{errors.method.join(', ')}</span>}
                    </div>

                    <Input 
                        label="Award Reference" 
                        name="award_reference" 
                        value={formData.award_reference} 
                        onChange={handleChange} 
                        required 
                        error={errors.award_reference?.join(', ')}
                    />

                    <Input 
                        label="Award Date" 
                        name="award_date" 
                        type="date"
                        value={formData.award_date} 
                        onChange={handleChange} 
                        error={errors.award_date?.join(', ')}
                        required
                    />
                    
                    <Input 
                        label="Effective Date" 
                        name="effective_date" 
                        type="date"
                        value={formData.effective_date} 
                        onChange={handleChange} 
                        error={errors.effective_date?.join(', ')}
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

                <div className="form-field">
                    <label className="form-label">Attachment Document (Optional)</label>
                    <input 
                        type="file"
                        className={`input-base ${errors.attachment ? 'input-error' : ''}`}
                        ref={fileInputRef}
                        accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                    />
                    {errors.attachment && <span className="input-error-text">{errors.attachment.join(', ')}</span>}
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
