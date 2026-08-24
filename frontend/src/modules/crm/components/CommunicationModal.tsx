import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useToastStore } from '../../../stores/toastStore';
import type { CRMCommunication, CreateCRMCommunicationPayload } from '../types';
import { createCommunication, updateCommunication } from '../api';

interface CommunicationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => void;
    entityId: string;
    communication?: CRMCommunication | null;
}

export const CommunicationModal: React.FC<CommunicationModalProps> = ({ isOpen, onClose, onSaved, entityId, communication }) => {
    
    // Default to current date/time in local ISO format for datetime-local input
    const getLocalISOString = () => {
        const tzoffset = (new Date()).getTimezoneOffset() * 60000;
        return (new Date(Date.now() - tzoffset)).toISOString().slice(0, 16);
    };

    const [formData, setFormData] = useState<CreateCRMCommunicationPayload>({
        entity: entityId,
        type: 'note',
        subject: '',
        description: '',
        timestamp: getLocalISOString()
    });
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            if (communication) {
                setFormData({
                    entity: entityId,
                    type: communication.type,
                    subject: communication.subject,
                    description: communication.description || '',
                    timestamp: communication.timestamp.slice(0, 16)
                });
            } else {
                setFormData({
                    entity: entityId,
                    type: 'note',
                    subject: '',
                    description: '',
                    timestamp: getLocalISOString()
                });
            }
            setErrors({});
        }
    }, [isOpen, communication, entityId]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: [] }));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setErrors({});

        try {
            if (communication) {
                await updateCommunication(communication.id, formData);
                useToastStore.getState().success('Communication updated successfully');
            } else {
                await createCommunication(formData);
                useToastStore.getState().success('Communication logged successfully');
            }
            onSaved();
            onClose();
        } catch (error: any) {
            if (error.response?.data) {
                setErrors(error.response.data);
                useToastStore.getState().error('Please check the form for errors.');
            } else {
                useToastStore.getState().error('An unexpected error occurred.');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={communication ? 'Edit Communication' : 'Log Communication'}>
            <form onSubmit={handleSubmit}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px', marginBottom: '24px' }}>
                    
                    <div className="input-group">
                        <label>Type</label>
                        <select 
                            name="type" 
                            className="input-field" 
                            value={formData.type} 
                            onChange={handleChange}
                        >
                            <option value="phone">Phone</option>
                            <option value="meeting">Meeting</option>
                            <option value="email">Email</option>
                            <option value="note">Note</option>
                            <option value="whatsapp">WhatsApp</option>
                            <option value="visit">Visit</option>
                            <option value="support">Support</option>
                            <option value="quotation">Quotation</option>
                        </select>
                    </div>

                    <Input
                        label="Subject"
                        name="subject"
                        value={formData.subject}
                        onChange={handleChange}
                        required
                        error={errors.subject?.[0]}
                    />
                    
                    <div className="input-group">
                        <label>Description</label>
                        <textarea
                            name="description"
                            className="input-field"
                            value={formData.description || ''}
                            onChange={handleChange}
                            rows={4}
                        />
                        {errors.description && <span className="error-text">{errors.description[0]}</span>}
                    </div>

                    <Input
                        label="Date & Time"
                        name="timestamp"
                        type="datetime-local"
                        value={formData.timestamp}
                        onChange={handleChange}
                        required
                        error={errors.timestamp?.[0]}
                    />
                </div>
                
                {errors.non_field_errors && (
                    <div style={{ color: 'var(--color-error)', marginBottom: '16px', fontSize: '14px' }}>
                        {errors.non_field_errors.join(' ')}
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
                    <Button type="submit" variant="primary" loading={isSubmitting}>
                        {communication ? 'Save Changes' : 'Log Communication'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
