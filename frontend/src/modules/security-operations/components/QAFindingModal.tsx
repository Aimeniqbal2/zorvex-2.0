import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { useToastStore } from '../../../stores/toastStore';
import { createQAFinding, updateQAFinding } from '../api';
import type { QAFinding, QAInspectionResponse } from '../types';

interface QAFindingModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => void;
    inspectionId: string;
    finding?: QAFinding | null;
    responses: QAInspectionResponse[];
}

export const QAFindingModal: React.FC<QAFindingModalProps> = ({ isOpen, onClose, onSaved, inspectionId, finding, responses }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    
    const [formData, setFormData] = useState<Partial<QAFinding>>({
        inspection: inspectionId,
        checklist_item: '',
        description: '',
        severity: 'LOW',
        status: 'OPEN'
    });

    useEffect(() => {
        if (isOpen) {
            setErrors({});
            if (finding) {
                setFormData({
                    inspection: inspectionId,
                    checklist_item: finding.checklist_item || '',
                    description: finding.description,
                    severity: finding.severity,
                    status: finding.status,
                });
            } else {
                setFormData({
                    inspection: inspectionId,
                    checklist_item: '',
                    description: '',
                    severity: 'LOW',
                    status: 'OPEN'
                });
            }
        }
    }, [isOpen, finding, inspectionId]);

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

        const payload: Partial<QAFinding> = {
            ...formData,
            checklist_item: formData.checklist_item === '' ? null : formData.checklist_item,
        };

        try {
            if (finding) {
                await updateQAFinding(finding.id, payload);
                useToastStore.getState().success('Finding updated');
            } else {
                await createQAFinding(payload);
                useToastStore.getState().success('Finding recorded');
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
            title={finding ? 'Edit QA Finding' : 'Record QA Finding'}
        >
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
                
                <div className="form-field">
                    <label className="form-label">Related Checklist Item (Optional)</label>
                    <select 
                        className={`input-base ${errors.checklist_item ? 'input-error' : ''}`}
                        name="checklist_item"
                        value={formData.checklist_item || ''}
                        onChange={handleChange}
                    >
                        <option value="">General / None</option>
                        {responses.map(res => (
                            <option key={res.checklist_item} value={res.checklist_item}>
                                {res.checklist_item_text}
                            </option>
                        ))}
                    </select>
                    {errors.checklist_item && <span className="input-error-text">{errors.checklist_item.join(', ')}</span>}
                </div>

                <div className="form-field">
                    <label className="form-label">Description <span className="required">*</span></label>
                    <textarea 
                        className={`input-base ${errors.description ? 'input-error' : ''}`}
                        name="description"
                        value={formData.description}
                        onChange={handleChange}
                        rows={4}
                        required
                    />
                    {errors.description && <span className="input-error-text">{errors.description.join(', ')}</span>}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-3)' }}>
                    <div className="form-field">
                        <label className="form-label">Severity <span className="required">*</span></label>
                        <select 
                            className={`input-base ${errors.severity ? 'input-error' : ''}`}
                            name="severity"
                            value={formData.severity}
                            onChange={handleChange}
                            required
                        >
                            <option value="LOW">Low</option>
                            <option value="MEDIUM">Medium</option>
                            <option value="HIGH">High</option>
                            <option value="CRITICAL">Critical</option>
                        </select>
                        {errors.severity && <span className="input-error-text">{errors.severity.join(', ')}</span>}
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
                            <option value="OPEN">Open</option>
                            <option value="RESOLVED">Resolved</option>
                        </select>
                        {errors.status && <span className="input-error-text">{errors.status.join(', ')}</span>}
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
