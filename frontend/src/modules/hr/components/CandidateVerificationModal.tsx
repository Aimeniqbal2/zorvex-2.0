import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useToastStore } from '../../../stores/toastStore';
import { apiClient } from '../api';
import type { CandidateVerification } from '../types';

interface CandidateVerificationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => void;
    candidateId: string;
    verification?: CandidateVerification | null;
}

export const CandidateVerificationModal: React.FC<CandidateVerificationModalProps> = ({ isOpen, onClose, onSaved, candidateId, verification }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    
    const [formData, setFormData] = useState<Partial<CandidateVerification>>({
        candidate: candidateId,
        verification_type: '',
        status: 'PENDING',
        reference_number: '',
        verification_date: '',
        expiry_date: '',
        remarks: ''
    });

    useEffect(() => {
        if (isOpen) {
            setErrors({});
            if (verification) {
                setFormData({
                    candidate: candidateId,
                    verification_type: verification.verification_type,
                    status: verification.status,
                    reference_number: verification.reference_number || '',
                    verification_date: verification.verification_date || '',
                    expiry_date: verification.expiry_date || '',
                    remarks: verification.remarks || ''
                });
            } else {
                setFormData({
                    candidate: candidateId,
                    verification_type: '',
                    status: 'PENDING',
                    reference_number: '',
                    verification_date: '',
                    expiry_date: '',
                    remarks: ''
                });
            }
        }
    }, [isOpen, verification, candidateId]);

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
            const payload = { ...formData };
            if (!payload.verification_date) delete payload.verification_date;
            if (!payload.expiry_date) delete payload.expiry_date;

            if (verification) {
                await apiClient.patch(`/api/hrm/candidate-verifications/${verification.id}/`, payload);
                useToastStore.getState().success('Verification updated');
            } else {
                await apiClient.post(`/api/hrm/candidate-verifications/`, payload);
                useToastStore.getState().success('Verification initiated');
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
            title={verification ? 'Edit Verification' : 'Initiate Verification'}
        >
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-3)' }}>
                    <div className="form-field">
                        <label className="form-label">Type <span className="required">*</span></label>
                        <select 
                            className={`input-base ${errors.verification_type ? 'input-error' : ''}`}
                            name="verification_type"
                            value={formData.verification_type}
                            onChange={handleChange}
                            required
                        >
                            <option value="">Select Type...</option>
                            <option value="POLICE">Police Clearance</option>
                            <option value="NADRA">NADRA Verification</option>
                            <option value="MEDICAL">Medical Fitness</option>
                            <option value="REFERENCE">Reference Check</option>
                            <option value="PREVIOUS_EMPLOYMENT">Previous Employment</option>
                        </select>
                        {errors.verification_type && <span className="input-error-text">{errors.verification_type.join(', ')}</span>}
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
                            <option value="PENDING">Pending</option>
                            <option value="IN_PROGRESS">In Progress</option>
                            <option value="COMPLETED">Completed</option>
                            <option value="FAILED">Failed</option>
                        </select>
                        {errors.status && <span className="input-error-text">{errors.status.join(', ')}</span>}
                    </div>

                    <Input 
                        label="Reference Number" 
                        name="reference_number" 
                        value={formData.reference_number || ''} 
                        onChange={handleChange} 
                        error={errors.reference_number?.join(', ')}
                    />
                    
                    <Input 
                        label="Verification Date" 
                        name="verification_date" 
                        type="date"
                        value={formData.verification_date || ''} 
                        onChange={handleChange} 
                        error={errors.verification_date?.join(', ')}
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

                <div className="form-field">
                    <label className="form-label">Remarks</label>
                    <textarea 
                        className={`input-base ${errors.remarks ? 'input-error' : ''}`}
                        name="remarks"
                        value={formData.remarks || ''}
                        onChange={handleChange}
                        rows={3}
                    />
                    {errors.remarks && <span className="input-error-text">{errors.remarks.join(', ')}</span>}
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
