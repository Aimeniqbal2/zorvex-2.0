import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useToastStore } from '../../../stores/toastStore';
import { apiClient } from '../api';
import type { CandidateDocument } from '../types';

interface CandidateDocumentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => void;
    candidateId: string;
    document?: CandidateDocument | null;
}

export const CandidateDocumentModal: React.FC<CandidateDocumentModalProps> = ({ isOpen, onClose, onSaved, candidateId, document }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    
    const [formData, setFormData] = useState<Partial<CandidateDocument>>({
        candidate: candidateId,
        document_type: '',
        document_number: '',
        issue_date: '',
        expiry_date: '',
        original_seen: false,
        original_received: false,
        returned: false,
        status: 'PENDING',
        notes: ''
    });

    useEffect(() => {
        if (isOpen) {
            setErrors({});
            if (document) {
                setFormData({
                    candidate: candidateId,
                    document_type: document.document_type,
                    document_number: document.document_number || '',
                    issue_date: document.issue_date || '',
                    expiry_date: document.expiry_date || '',
                    original_seen: document.original_seen,
                    original_received: document.original_received,
                    returned: document.returned,
                    status: document.status,
                    notes: document.notes || ''
                });
            } else {
                setFormData({
                    candidate: candidateId,
                    document_type: '',
                    document_number: '',
                    issue_date: '',
                    expiry_date: '',
                    original_seen: false,
                    original_received: false,
                    returned: false,
                    status: 'PENDING',
                    notes: ''
                });
            }
        }
    }, [isOpen, document, candidateId]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
        setFormData(prev => ({ ...prev, [e.target.name]: value }));
        if (errors[e.target.name]) {
            setErrors(prev => ({ ...prev, [e.target.name]: [] }));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setErrors({});

        try {
            const payload = { ...formData };
            if (!payload.issue_date) delete payload.issue_date;
            if (!payload.expiry_date) delete payload.expiry_date;

            if (document) {
                await apiClient.patch(`/api/hrm/candidate-documents/${document.id}/`, payload);
                useToastStore.getState().success('Document updated');
            } else {
                await apiClient.post(`/api/hrm/candidate-documents/`, payload);
                useToastStore.getState().success('Document added');
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
            title={document ? 'Edit Document' : 'Add Document'}
        >
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-3)' }}>
                    <div className="form-field">
                        <label className="form-label">Type <span className="required">*</span></label>
                        <select 
                            className={`input-base ${errors.document_type ? 'input-error' : ''}`}
                            name="document_type"
                            value={formData.document_type}
                            onChange={handleChange}
                            required
                        >
                            <option value="">Select Type...</option>
                            <option value="CNIC">National ID / CNIC</option>
                            <option value="PASSPORT">Passport</option>
                            <option value="DRIVING_LICENSE">Driving License</option>
                            <option value="EDUCATION_CERT">Education Certificate</option>
                            <option value="EXPERIENCE_LETTER">Experience Letter</option>
                            <option value="DOMICILE">Domicile</option>
                            <option value="OTHER">Other</option>
                        </select>
                        {errors.document_type && <span className="input-error-text">{errors.document_type.join(', ')}</span>}
                    </div>

                    <Input 
                        label="Document Number" 
                        name="document_number" 
                        value={formData.document_number || ''} 
                        onChange={handleChange} 
                        error={errors.document_number?.join(', ')}
                    />
                    
                    <Input 
                        label="Issue Date" 
                        name="issue_date" 
                        type="date"
                        value={formData.issue_date || ''} 
                        onChange={handleChange} 
                        error={errors.issue_date?.join(', ')}
                    />

                    <Input 
                        label="Expiry Date" 
                        name="expiry_date" 
                        type="date"
                        value={formData.expiry_date || ''} 
                        onChange={handleChange} 
                        error={errors.expiry_date?.join(', ')}
                    />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--spacing-3)' }}>
                    <div className="form-field" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
                        <input type="checkbox" name="original_seen" checked={formData.original_seen || false} onChange={handleChange} id="original_seen" />
                        <label htmlFor="original_seen" className="form-label" style={{ margin: 0 }}>Original Seen</label>
                    </div>
                    <div className="form-field" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
                        <input type="checkbox" name="original_received" checked={formData.original_received || false} onChange={handleChange} id="original_received" />
                        <label htmlFor="original_received" className="form-label" style={{ margin: 0 }}>Original Kept</label>
                    </div>
                    <div className="form-field" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
                        <input type="checkbox" name="returned" checked={formData.returned || false} onChange={handleChange} id="returned" />
                        <label htmlFor="returned" className="form-label" style={{ margin: 0 }}>Returned</label>
                    </div>
                </div>

                <div className="form-field">
                    <label className="form-label">Notes</label>
                    <textarea 
                        className={`input-base ${errors.notes ? 'input-error' : ''}`}
                        name="notes"
                        value={formData.notes || ''}
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
