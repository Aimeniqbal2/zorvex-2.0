import React, { useState, useEffect } from 'react';
import { Modal } from '../../../../components/ui/Modal';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { useToastStore } from '../../../../stores/toastStore';
import { createProposal, updateProposal, getOpportunities } from '../../api';
import type { Proposal, Opportunity } from '../../types';

interface ProposalModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => void;
    proposal?: Proposal | null;
}

const STATUSES = ['DRAFT', 'INTERNAL_REVIEW', 'SUBMITTED', 'REVISED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'];

export const ProposalModal: React.FC<ProposalModalProps> = ({ isOpen, onClose, onSaved, proposal }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
    
    const [formData, setFormData] = useState<Partial<Proposal>>({
        opportunity: '',
        title: '',
        issue_date: new Date().toISOString().split('T')[0],
        valid_until: '',
        status: 'DRAFT',
        currency: 'PKR',
        scope: '',
        terms: '',
        notes: ''
    });

    useEffect(() => {
        const fetchOpps = async () => {
            try {
                // Fetch basic opportunities
                const res = await getOpportunities();
                setOpportunities(res.results || []);
            } catch (err) {
                console.error('Failed to load opportunities', err);
            }
        };
        if (isOpen) {
            fetchOpps();
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) {
            setErrors({});
            if (proposal) {
                setFormData({
                    opportunity: proposal.opportunity,
                    title: proposal.title,
                    issue_date: proposal.issue_date || '',
                    valid_until: proposal.valid_until || '',
                    status: proposal.status,
                    currency: proposal.currency,
                    scope: proposal.scope,
                    terms: proposal.terms,
                    notes: proposal.notes,
                });
            } else {
                setFormData({
                    opportunity: '',
                    title: '',
                    issue_date: new Date().toISOString().split('T')[0],
                    valid_until: '',
                    status: 'DRAFT',
                    currency: 'PKR',
                    scope: '',
                    terms: '',
                    notes: ''
                });
            }
        }
    }, [isOpen, proposal]);

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

        const payload: Partial<Proposal> = {
            ...formData,
            valid_until: formData.valid_until === '' ? undefined : formData.valid_until,
            issue_date: formData.issue_date === '' ? undefined : formData.issue_date,
        };

        try {
            if (proposal) {
                await updateProposal(proposal.id, payload);
                useToastStore.getState().success('Proposal updated successfully');
            } else {
                await createProposal(payload);
                useToastStore.getState().success('Proposal created successfully');
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
            title={proposal ? 'Edit Proposal Header' : 'Create Proposal'}
        >
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-3)' }}>
                    <div className="form-field" style={{ gridColumn: 'span 2' }}>
                        <label className="form-label">Opportunity <span className="required">*</span></label>
                        <select 
                            className={`input-base ${errors.opportunity ? 'input-error' : ''}`}
                            name="opportunity"
                            value={formData.opportunity}
                            onChange={handleChange}
                            required
                        >
                            <option value="">Select Opportunity...</option>
                            {opportunities.map(opp => (
                                <option key={opp.id} value={opp.id}>
                                    {opp.opportunity_number} - {opp.title}
                                </option>
                            ))}
                        </select>
                        {errors.opportunity && <span className="input-error-text">{errors.opportunity.join(', ')}</span>}
                    </div>

                    <div style={{ gridColumn: 'span 2' }}>
                        <Input 
                            label="Proposal Title" 
                            name="title" 
                            value={formData.title} 
                            onChange={handleChange} 
                            required 
                            error={errors.title?.join(', ')}
                        />
                    </div>
                    
                    <div className="form-field">
                        <label className="form-label">Status <span className="required">*</span></label>
                        <select 
                            className={`input-base ${errors.status ? 'input-error' : ''}`}
                            name="status"
                            value={formData.status}
                            onChange={handleChange}
                            required
                        >
                            {STATUSES.map(status => (
                                <option key={status} value={status}>{status}</option>
                            ))}
                        </select>
                        {errors.status && <span className="input-error-text">{errors.status.join(', ')}</span>}
                    </div>

                    <Input 
                        label="Currency" 
                        name="currency" 
                        value={formData.currency} 
                        onChange={handleChange} 
                        required
                        error={errors.currency?.join(', ')}
                    />

                    <Input 
                        label="Issue Date" 
                        name="issue_date" 
                        type="date"
                        value={formData.issue_date as string} 
                        onChange={handleChange} 
                        error={errors.issue_date?.join(', ')}
                        required
                    />
                    
                    <Input 
                        label="Valid Until" 
                        name="valid_until" 
                        type="date"
                        value={(formData.valid_until as string) || undefined} 
                        onChange={handleChange} 
                        error={errors.valid_until?.join(', ')}
                    />
                </div>

                <div className="form-field">
                    <label className="form-label">Scope</label>
                    <textarea 
                        className={`input-base ${errors.scope ? 'input-error' : ''}`}
                        name="scope"
                        value={formData.scope}
                        onChange={handleChange}
                        rows={3}
                    />
                    {errors.scope && <span className="input-error-text">{errors.scope.join(', ')}</span>}
                </div>

                <div className="form-field">
                    <label className="form-label">Terms</label>
                    <textarea 
                        className={`input-base ${errors.terms ? 'input-error' : ''}`}
                        name="terms"
                        value={formData.terms}
                        onChange={handleChange}
                        rows={3}
                    />
                    {errors.terms && <span className="input-error-text">{errors.terms.join(', ')}</span>}
                </div>

                <div className="form-field">
                    <label className="form-label">Notes</label>
                    <textarea 
                        className={`input-base ${errors.notes ? 'input-error' : ''}`}
                        name="notes"
                        value={formData.notes}
                        onChange={handleChange}
                        rows={2}
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
