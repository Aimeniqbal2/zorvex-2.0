import React, { useState } from 'react';
import { Modal } from '../../../../components/ui/Modal';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { useToastStore } from '../../../../stores/toastStore';
import { createEntity, createAddress, createContact } from '../../../../modules/crm/api';
import { createClientLocation } from '../api';

interface SecurityClientModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => void;
}

interface InlineContactLine {
    id: string;
    name: string;
    job_title: string;
    email: string;
    phone: string;
    whatsapp: string;
}

export const SecurityClientModal: React.FC<SecurityClientModalProps> = ({ isOpen, onClose, onSaved }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    // Basic & Business Details
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [taxNumber, setTaxNumber] = useState('');
    const [registrationNumber, setRegistrationNumber] = useState('');
    const [website, setWebsite] = useState('');

    // Head Office Address
    const [addressLine, setAddressLine] = useState('');
    const [addressCity, setAddressCity] = useState('');
    const [addressState, setAddressState] = useState('');
    const [addressCountry, setAddressCountry] = useState('Pakistan');

    // Dynamic Contact Lines
    const [contacts, setContacts] = useState<InlineContactLine[]>([
        { id: 'c-1', name: '', job_title: '', email: '', phone: '', whatsapp: '' }
    ]);

    const handleAddContactLine = () => {
        setContacts(prev => [
            ...prev,
            { id: `c-${Date.now()}-${Math.random()}`, name: '', job_title: '', email: '', phone: '', whatsapp: '' }
        ]);
    };

    const handleRemoveContactLine = (id: string) => {
        setContacts(prev => {
            if (prev.length <= 1) {
                return [{ id: 'c-1', name: '', job_title: '', email: '', phone: '', whatsapp: '' }];
            }
            return prev.filter(c => c.id !== id);
        });
    };

    const handleContactChange = (id: string, field: keyof InlineContactLine, value: string) => {
        setContacts(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
    };

    const resetForm = () => {
        setName('');
        setCode('');
        setTaxNumber('');
        setRegistrationNumber('');
        setWebsite('');
        setAddressLine('');
        setAddressCity('');
        setAddressState('');
        setAddressCountry('Pakistan');
        setContacts([{ id: 'c-1', name: '', job_title: '', email: '', phone: '', whatsapp: '' }]);
        setErrors({});
    };

    const handleModalClose = () => {
        resetForm();
        onClose();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrors({});

        if (!name.trim()) {
            setErrors({ name: 'Client name is required.' });
            return;
        }

        setIsSubmitting(true);
        try {
            // 1. Create CRM Entity as CUSTOMER
            const entityPayload: any = {
                entity_type: 'CUSTOMER',
                name: name.trim(),
                display_name: name.trim(),
                preferred_currency: 'PKR',
                preferred_language: 'en'
            };

            if (code.trim()) entityPayload.code = code.trim();
            if (taxNumber.trim()) entityPayload.tax_number = taxNumber.trim();
            if (registrationNumber.trim()) entityPayload.registration_number = registrationNumber.trim();
            if (website.trim()) entityPayload.website = website.trim();

            const createdEntity = await createEntity(entityPayload);

            // 2. Create Head Office Address if provided
            if (addressLine.trim() || addressCity.trim()) {
                try {
                    await createAddress({
                        entity: createdEntity.id,
                        address_type: 'Office',
                        line1: addressLine.trim() || 'Head Office',
                        city: addressCity.trim() || 'Karachi',
                        state: addressState.trim() || '',
                        country: addressCountry.trim() || 'Pakistan',
                        is_default: true
                    });
                } catch (addrErr) {
                    console.warn('Could not save primary address:', addrErr);
                }
            }

            // 3. Create Contact Persons
            const validContacts = contacts.filter(c => c.name.trim().length > 0);
            for (let i = 0; i < validContacts.length; i++) {
                const c = validContacts[i];
                const parts = c.name.trim().split(' ');
                const first_name = parts[0];
                const last_name = parts.slice(1).join(' ');

                try {
                    await createContact({
                        entity: createdEntity.id,
                        first_name,
                        last_name: last_name || '',
                        job_title: c.job_title.trim() || undefined,
                        email: c.email.trim() || undefined,
                        phone: c.phone.trim() || undefined,
                        whatsapp: c.whatsapp.trim() || undefined,
                        is_primary: i === 0,
                        receives_notifications: true
                    });
                } catch (contErr) {
                    console.warn(`Could not save contact ${c.name}:`, contErr);
                }
            }

            // 4. Create Initial Default Location (Head Office)
            try {
                const primaryCont = validContacts[0];
                const fullAddr = [addressLine.trim(), addressCity.trim(), addressState.trim()].filter(Boolean).join(', ');
                await createClientLocation({
                    customer: createdEntity.id,
                    name: 'Head Office',
                    address: fullAddr || (name.trim() + ' Head Office'),
                    contact_person: primaryCont?.name.trim() || undefined,
                    designation: primaryCont?.job_title.trim() || undefined,
                    phone: primaryCont?.phone.trim() || undefined,
                    whatsapp: primaryCont?.whatsapp.trim() || undefined,
                    email: primaryCont?.email.trim() || undefined,
                    is_active: true
                });
            } catch (locErr) {
                console.warn('Could not auto-register initial client location:', locErr);
            }

            useToastStore.getState().success(`Client "${createdEntity.name}" created successfully.`);
            resetForm();
            onSaved();
            onClose();
        } catch (error: any) {
            const serverErrors = error.response?.data;
            if (serverErrors && typeof serverErrors === 'object') {
                const fieldErrors: Record<string, string> = {};
                Object.keys(serverErrors).forEach(key => {
                    const val = serverErrors[key];
                    fieldErrors[key] = Array.isArray(val) ? val.join(' ') : String(val);
                });
                setErrors(fieldErrors);
                useToastStore.getState().error('Please fix the errors in the form.');
            } else {
                useToastStore.getState().error(error.message || 'Failed to create client.');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleModalClose}
            title="Create Client"
            width="980px"
            footer={
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', width: '100%' }}>
                    <Button variant="secondary" onClick={handleModalClose} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button 
                        variant="primary" 
                        onClick={handleSubmit} 
                        disabled={isSubmitting}
                        style={{ minWidth: '120px' }}
                    >
                        {isSubmitting ? 'Saving...' : 'Save Client'}
                    </Button>
                </div>
            }
        >
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                
                {/* SECTION 1: BASIC INFORMATION */}
                <div>
                    <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '8px', 
                        borderBottom: '1px solid var(--color-border)', 
                        paddingBottom: '8px', 
                        marginBottom: '16px' 
                    }}>
                        <i className='bx bx-building' style={{ fontSize: '18px', color: 'var(--color-primary)' }}></i>
                        <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--color-text)', textTransform: 'uppercase' }}>
                            Basic Information
                        </h4>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '16px' }}>
                        <div>
                            <Input
                                label="Client Name"
                                required
                                placeholder="e.g. Pakistan Mortgage Refinance Company"
                                value={name}
                                onChange={(e) => {
                                    setName(e.target.value);
                                    if (errors.name) setErrors(prev => ({ ...prev, name: '' }));
                                }}
                                error={errors.name}
                            />
                        </div>
                        <div>
                            <Input
                                label="Code"
                                placeholder="Auto-generated (e.g. CUST-0001)"
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                helpText="Optional: Leave blank to auto-generate code"
                                error={errors.code}
                            />
                        </div>
                    </div>
                </div>

                {/* SECTION 2: BUSINESS DETAILS */}
                <div>
                    <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '8px', 
                        borderBottom: '1px solid var(--color-border)', 
                        paddingBottom: '8px', 
                        marginBottom: '16px' 
                    }}>
                        <i className='bx bx-briefcase' style={{ fontSize: '18px', color: 'var(--color-primary)' }}></i>
                        <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--color-text)', textTransform: 'uppercase' }}>
                            Business Details
                        </h4>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                        <div>
                            <Input
                                label="Tax Number / NTN"
                                placeholder="e.g. 1234567-8"
                                value={taxNumber}
                                onChange={(e) => setTaxNumber(e.target.value)}
                                error={errors.tax_number}
                            />
                        </div>
                        <div>
                            <Input
                                label="Registration Number"
                                placeholder="e.g. SECP-98765"
                                value={registrationNumber}
                                onChange={(e) => setRegistrationNumber(e.target.value)}
                                error={errors.registration_number}
                            />
                        </div>
                        <div>
                            <Input
                                label="Website"
                                placeholder="https://example.com"
                                value={website}
                                onChange={(e) => setWebsite(e.target.value)}
                                error={errors.website}
                            />
                        </div>
                    </div>
                </div>

                {/* SECTION 3: HEAD OFFICE ADDRESS */}
                <div>
                    <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '8px', 
                        borderBottom: '1px solid var(--color-border)', 
                        paddingBottom: '8px', 
                        marginBottom: '16px' 
                    }}>
                        <i className='bx bx-map-pin' style={{ fontSize: '18px', color: 'var(--color-primary)' }}></i>
                        <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--color-text)', textTransform: 'uppercase' }}>
                            Head Office Address
                        </h4>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '16px' }}>
                        <div>
                            <Input
                                label="Street Address"
                                placeholder="e.g. Suite 402, Business Center, Shahrah-e-Faisal"
                                value={addressLine}
                                onChange={(e) => setAddressLine(e.target.value)}
                            />
                        </div>
                        <div>
                            <Input
                                label="City"
                                placeholder="e.g. Karachi"
                                value={addressCity}
                                onChange={(e) => setAddressCity(e.target.value)}
                            />
                        </div>
                        <div>
                            <Input
                                label="State / Province"
                                placeholder="e.g. Sindh"
                                value={addressState}
                                onChange={(e) => setAddressState(e.target.value)}
                            />
                        </div>
                        <div>
                            <Input
                                label="Country"
                                value={addressCountry}
                                onChange={(e) => setAddressCountry(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                {/* SECTION 4: CONTACT PERSONS (DYNAMIC TABLE LINES) */}
                <div>
                    <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        borderBottom: '1px solid var(--color-border)', 
                        paddingBottom: '8px', 
                        marginBottom: '12px' 
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <i className='bx bx-user-pin' style={{ fontSize: '18px', color: 'var(--color-primary)' }}></i>
                            <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--color-text)', textTransform: 'uppercase' }}>
                                Contact Persons
                            </h4>
                        </div>
                        <Button 
                            type="button" 
                            variant="secondary" 
                            size="sm" 
                            onClick={handleAddContactLine}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                            <i className='bx bx-plus'></i> Add Contact Line
                        </Button>
                    </div>

                    <p style={{ margin: '0 0 12px 0', fontSize: '12.5px', color: 'var(--color-text-muted)' }}>
                        Add key decision-makers and contacts for this client. The first contact will be marked as Primary.
                    </p>

                    <div style={{ 
                        overflowX: 'auto', 
                        border: '1px solid var(--color-border)', 
                        borderRadius: '8px',
                        background: 'var(--color-surface)' 
                    }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '780px' }}>
                            <thead>
                                <tr style={{ background: 'var(--color-background-subtle, rgba(0,0,0,0.02))', borderBottom: '1px solid var(--color-border)' }}>
                                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, width: '22%' }}>Contact Person Name *</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, width: '20%' }}>Job Title / Designation</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, width: '20%' }}>Email</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, width: '17%' }}>Phone</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, width: '17%' }}>WhatsApp</th>
                                    <th style={{ padding: '10px 8px', textAlign: 'center', width: '4%' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {contacts.map((contact, index) => (
                                    <tr key={contact.id} style={{ borderBottom: index < contacts.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                                        <td style={{ padding: '8px 10px' }}>
                                            <input
                                                type="text"
                                                placeholder={index === 0 ? "e.g. Tariq Mehmood (Primary)" : "e.g. Asim Khan"}
                                                value={contact.name}
                                                onChange={(e) => handleContactChange(contact.id, 'name', e.target.value)}
                                                style={{
                                                    width: '100%',
                                                    padding: '7px 10px',
                                                    borderRadius: '6px',
                                                    border: '1px solid var(--color-border)',
                                                    background: 'var(--color-background)',
                                                    color: 'var(--color-text)',
                                                    fontSize: '13px',
                                                    outline: 'none'
                                                }}
                                            />
                                        </td>
                                        <td style={{ padding: '8px 10px' }}>
                                            <input
                                                type="text"
                                                placeholder="e.g. Admin Manager / Director"
                                                value={contact.job_title}
                                                onChange={(e) => handleContactChange(contact.id, 'job_title', e.target.value)}
                                                style={{
                                                    width: '100%',
                                                    padding: '7px 10px',
                                                    borderRadius: '6px',
                                                    border: '1px solid var(--color-border)',
                                                    background: 'var(--color-background)',
                                                    color: 'var(--color-text)',
                                                    fontSize: '13px',
                                                    outline: 'none'
                                                }}
                                            />
                                        </td>
                                        <td style={{ padding: '8px 10px' }}>
                                            <input
                                                type="email"
                                                placeholder="e.g. contact@client.com"
                                                value={contact.email}
                                                onChange={(e) => handleContactChange(contact.id, 'email', e.target.value)}
                                                style={{
                                                    width: '100%',
                                                    padding: '7px 10px',
                                                    borderRadius: '6px',
                                                    border: '1px solid var(--color-border)',
                                                    background: 'var(--color-background)',
                                                    color: 'var(--color-text)',
                                                    fontSize: '13px',
                                                    outline: 'none'
                                                }}
                                            />
                                        </td>
                                        <td style={{ padding: '8px 10px' }}>
                                            <input
                                                type="tel"
                                                placeholder="e.g. 0300-1234567"
                                                value={contact.phone}
                                                onChange={(e) => handleContactChange(contact.id, 'phone', e.target.value)}
                                                style={{
                                                    width: '100%',
                                                    padding: '7px 10px',
                                                    borderRadius: '6px',
                                                    border: '1px solid var(--color-border)',
                                                    background: 'var(--color-background)',
                                                    color: 'var(--color-text)',
                                                    fontSize: '13px',
                                                    outline: 'none'
                                                }}
                                            />
                                        </td>
                                        <td style={{ padding: '8px 10px' }}>
                                            <input
                                                type="tel"
                                                placeholder="e.g. 0300-1234567"
                                                value={contact.whatsapp}
                                                onChange={(e) => handleContactChange(contact.id, 'whatsapp', e.target.value)}
                                                style={{
                                                    width: '100%',
                                                    padding: '7px 10px',
                                                    borderRadius: '6px',
                                                    border: '1px solid var(--color-border)',
                                                    background: 'var(--color-background)',
                                                    color: 'var(--color-text)',
                                                    fontSize: '13px',
                                                    outline: 'none'
                                                }}
                                            />
                                        </td>
                                        <td style={{ padding: '8px 4px', textAlign: 'center' }}>
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveContactLine(contact.id)}
                                                title="Delete Line"
                                                style={{
                                                    background: 'transparent',
                                                    border: 'none',
                                                    color: 'var(--color-danger, #ef4444)',
                                                    cursor: 'pointer',
                                                    padding: '4px',
                                                    borderRadius: '4px',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}
                                            >
                                                <i className='bx bx-trash' style={{ fontSize: '16px' }}></i>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

            </form>
        </Modal>
    );
};
