import React, { useState, useEffect } from 'react';
import { Modal } from '../../../../components/ui/Modal';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { useToastStore } from '../../../../stores/toastStore';
import { createVendorContact, updateVendorContact, type VendorContact } from '../api';

interface VendorContactModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => void;
    vendorId: string;
    contact?: VendorContact | null;
}

export const VendorContactModal: React.FC<VendorContactModalProps> = ({
    isOpen,
    onClose,
    onSaved,
    vendorId,
    contact
}) => {
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [jobTitle, setJobTitle] = useState('');
    const [department, setDepartment] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [isPrimary, setIsPrimary] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen) {
            if (contact) {
                setFirstName(contact.first_name || '');
                setLastName(contact.last_name || '');
                setJobTitle(contact.job_title || '');
                setDepartment(contact.department || '');
                setPhone(contact.phone || contact.mobile || '');
                setEmail(contact.email || '');
                setIsPrimary(contact.is_primary || false);
            } else {
                setFirstName('');
                setLastName('');
                setJobTitle('');
                setDepartment('');
                setPhone('');
                setEmail('');
                setIsPrimary(false);
            }
        }
    }, [isOpen, contact]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!firstName.trim()) {
            useToastStore.getState().error('First name is required.');
            return;
        }

        setIsSaving(true);
        try {
            const payload: Partial<VendorContact> = {
                first_name: firstName.trim(),
                last_name: lastName.trim(),
                job_title: jobTitle.trim(),
                department: department.trim(),
                phone: phone.trim(),
                email: email.trim(),
                is_primary: isPrimary
            };

            if (contact) {
                await updateVendorContact(contact.id, payload);
                useToastStore.getState().success('Vendor contact updated.');
            } else {
                await createVendorContact(vendorId, payload);
                useToastStore.getState().success('Vendor contact added.');
            }
            onSaved();
            onClose();
        } catch (err: any) {
            useToastStore.getState().error(err?.response?.data?.detail || 'Failed to save contact.');
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={contact ? "Edit Vendor Contact" : "Add Vendor Contact"} size="medium">
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <Input
                        label="First Name *"
                        placeholder="e.g. Asad"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        required
                    />
                    <Input
                        label="Last Name"
                        placeholder="e.g. Mehmood"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                    />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <Input
                        label="Job Designation"
                        placeholder="e.g. Key Account Manager"
                        value={jobTitle}
                        onChange={(e) => setJobTitle(e.target.value)}
                    />
                    <Input
                        label="Department"
                        placeholder="e.g. Sales / Operations"
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                    />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <Input
                        label="Phone / Mobile"
                        placeholder="e.g. +92 300 9876543"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                    />
                    <Input
                        label="Email Address"
                        type="email"
                        placeholder="e.g. asad@vendor.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    <input
                        type="checkbox"
                        id="contact-is-primary"
                        checked={isPrimary}
                        onChange={(e) => setIsPrimary(e.target.checked)}
                    />
                    <label htmlFor="contact-is-primary" style={{ fontSize: '13px', color: 'var(--color-text)', cursor: 'pointer' }}>
                        Set as primary vendor contact
                    </label>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                    <Button type="button" variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="submit" variant="primary" disabled={isSaving}>
                        {isSaving ? 'Saving...' : contact ? 'Update Contact' : 'Add Contact'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
