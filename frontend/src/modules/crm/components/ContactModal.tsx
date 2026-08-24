import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useToastStore } from '../../../stores/toastStore';
import type { CRMContact, CreateCRMContactPayload } from '../types';
import { createContact, updateContact } from '../api';

interface ContactModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => void;
    entityId: string;
    contact?: CRMContact | null;
}

export const ContactModal: React.FC<ContactModalProps> = ({ isOpen, onClose, onSaved, entityId, contact }) => {
    const [formData, setFormData] = useState<CreateCRMContactPayload>({
        entity: entityId,
        first_name: '',
        last_name: '',
        job_title: '',
        department: '',
        email: '',
        phone: '',
        mobile: '',
        whatsapp: '',
        is_primary: false,
        receives_invoices: false,
        receives_quotes: false,
        receives_notifications: true
    });
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            if (contact) {
                setFormData({
                    entity: entityId,
                    first_name: contact.first_name,
                    last_name: contact.last_name,
                    job_title: contact.job_title,
                    department: contact.department,
                    email: contact.email,
                    phone: contact.phone,
                    mobile: contact.mobile,
                    whatsapp: contact.whatsapp,
                    is_primary: contact.is_primary,
                    receives_invoices: contact.receives_invoices,
                    receives_quotes: contact.receives_quotes,
                    receives_notifications: contact.receives_notifications
                });
            } else {
                setFormData({
                    entity: entityId,
                    first_name: '',
                    last_name: '',
                    job_title: '',
                    department: '',
                    email: '',
                    phone: '',
                    mobile: '',
                    whatsapp: '',
                    is_primary: false,
                    receives_invoices: false,
                    receives_quotes: false,
                    receives_notifications: true
                });
            }
            setErrors({});
        }
    }, [isOpen, contact, entityId]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
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
            if (contact) {
                await updateContact(contact.id, formData);
                useToastStore.getState().success('Contact updated successfully');
            } else {
                await createContact(formData);
                useToastStore.getState().success('Contact created successfully');
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
        <Modal isOpen={isOpen} onClose={onClose} title={contact ? 'Edit Contact' : 'Add Contact'}>
            <form onSubmit={handleSubmit}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                    <Input
                        label="First Name"
                        name="first_name"
                        value={formData.first_name}
                        onChange={handleChange}
                        required
                        error={errors.first_name?.[0]}
                    />
                    <Input
                        label="Last Name"
                        name="last_name"
                        value={formData.last_name || ''}
                        onChange={handleChange}
                        error={errors.last_name?.[0]}
                    />
                    <Input
                        label="Job Title"
                        name="job_title"
                        value={formData.job_title || ''}
                        onChange={handleChange}
                        error={errors.job_title?.[0]}
                    />
                    <Input
                        label="Department"
                        name="department"
                        value={formData.department || ''}
                        onChange={handleChange}
                        error={errors.department?.[0]}
                    />
                    <Input
                        label="Email"
                        name="email"
                        type="email"
                        value={formData.email || ''}
                        onChange={handleChange}
                        error={errors.email?.[0]}
                    />
                    <Input
                        label="Phone"
                        name="phone"
                        value={formData.phone || ''}
                        onChange={handleChange}
                        error={errors.phone?.[0]}
                    />
                    <Input
                        label="Mobile"
                        name="mobile"
                        value={formData.mobile || ''}
                        onChange={handleChange}
                        error={errors.mobile?.[0]}
                    />
                    <Input
                        label="WhatsApp"
                        name="whatsapp"
                        value={formData.whatsapp || ''}
                        onChange={handleChange}
                        error={errors.whatsapp?.[0]}
                    />
                </div>

                <h4 style={{ marginBottom: '12px', fontSize: '14px', color: 'var(--color-text-muted)' }}>Preferences</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input type="checkbox" name="is_primary" checked={formData.is_primary} onChange={handleChange} />
                        Primary Contact
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input type="checkbox" name="receives_invoices" checked={formData.receives_invoices} onChange={handleChange} />
                        Receives Invoices
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input type="checkbox" name="receives_quotes" checked={formData.receives_quotes} onChange={handleChange} />
                        Receives Quotes
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input type="checkbox" name="receives_notifications" checked={formData.receives_notifications} onChange={handleChange} />
                        Receives Notifications
                    </label>
                </div>
                {errors.non_field_errors && (
                    <div style={{ color: 'var(--color-error)', marginBottom: '16px', fontSize: '14px' }}>
                        {errors.non_field_errors.join(' ')}
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
                    <Button type="submit" variant="primary" loading={isSubmitting}>
                        {contact ? 'Save Changes' : 'Create Contact'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
