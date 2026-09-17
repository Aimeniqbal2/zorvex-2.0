import React, { useState, useEffect } from 'react';
import { Modal } from '../../../../components/ui/Modal';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { useToastStore } from '../../../../stores/toastStore';
import { createVendor, updateVendor, getVendorCategories, type Vendor, type VendorCategory } from '../api';

interface VendorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved: (vendor: Vendor) => void;
    vendor?: Vendor | null;
}

export const VendorModal: React.FC<VendorModalProps> = ({
    isOpen,
    onClose,
    onSaved,
    vendor
}) => {
    const [categories, setCategories] = useState<VendorCategory[]>([]);
    const [name, setName] = useState('');
    const [category, setCategory] = useState('');
    const [contactPerson, setContactPerson] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [address, setAddress] = useState('');
    const [website, setWebsite] = useState('');
    const [taxNumber, setTaxNumber] = useState('');
    const [registrationNumber, setRegistrationNumber] = useState('');
    const [paymentTerms, setPaymentTerms] = useState('Net 30');
    const [creditLimit, setCreditLimit] = useState('0');
    const [bankName, setBankName] = useState('');
    const [accountTitle, setAccountTitle] = useState('');
    const [accountNumber, setAccountNumber] = useState('');
    const [iban, setIban] = useState('');
    const [swiftCode, setSwiftCode] = useState('');
    const [statusVal, setStatusVal] = useState<'ACTIVE' | 'INACTIVE' | 'BLOCKED' | 'PENDING_REVIEW'>('ACTIVE');
    const [notes, setNotes] = useState('');
    const [rating, setRating] = useState(5);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen) {
            loadCategories();
            if (vendor) {
                setName(vendor.name || '');
                setCategory(vendor.category || '');
                setContactPerson(vendor.contact_person || '');
                setPhone(vendor.phone || '');
                setEmail(vendor.email || '');
                setAddress(vendor.address || '');
                setWebsite(vendor.website || '');
                setTaxNumber(vendor.tax_number || '');
                setRegistrationNumber(vendor.registration_number || '');
                setPaymentTerms(vendor.payment_terms || 'Net 30');
                setCreditLimit(String(vendor.credit_limit || '0'));
                setBankName(vendor.bank_name || '');
                setAccountTitle(vendor.account_title || '');
                setAccountNumber(vendor.account_number || '');
                setIban(vendor.iban || '');
                setSwiftCode(vendor.swift_code || '');
                setStatusVal(vendor.status || 'ACTIVE');
                setNotes(vendor.notes || '');
                setRating(vendor.rating || 5);
            } else {
                setName('');
                setCategory('');
                setContactPerson('');
                setPhone('');
                setEmail('');
                setAddress('');
                setWebsite('');
                setTaxNumber('');
                setRegistrationNumber('');
                setPaymentTerms('Net 30');
                setCreditLimit('0');
                setBankName('');
                setAccountTitle('');
                setAccountNumber('');
                setIban('');
                setSwiftCode('');
                setStatusVal('ACTIVE');
                setNotes('');
                setRating(5);
            }
        }
    }, [isOpen, vendor]);

    const loadCategories = async () => {
        try {
            const data = await getVendorCategories();
            setCategories(data || []);
        } catch {
            // fallback
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            useToastStore.getState().error('Vendor Name is required.');
            return;
        }

        setIsSaving(true);
        try {
            const payload: Partial<Vendor> = {
                name: name.trim(),
                category: category || null,
                contact_person: contactPerson.trim(),
                phone: phone.trim(),
                email: email.trim(),
                address: address.trim(),
                website: website.trim(),
                tax_number: taxNumber.trim(),
                registration_number: registrationNumber.trim(),
                payment_terms: paymentTerms,
                credit_limit: parseFloat(creditLimit) || 0,
                bank_name: bankName.trim(),
                account_title: accountTitle.trim(),
                account_number: accountNumber.trim(),
                iban: iban.trim(),
                swift_code: swiftCode.trim(),
                status: statusVal,
                notes: notes.trim(),
                rating
            };

            let res: Vendor;
            if (vendor) {
                res = await updateVendor(vendor.id, payload);
                useToastStore.getState().success(`Vendor ${res.name} updated successfully.`);
            } else {
                res = await createVendor(payload);
                useToastStore.getState().success(`Vendor ${res.name} created successfully (${res.code}).`);
            }
            onSaved(res);
            onClose();
        } catch (err: any) {
            useToastStore.getState().error(err?.response?.data?.detail || 'Failed to save vendor.');
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={vendor ? `Edit Vendor — ${vendor.code}` : "Add New Security Vendor"} 
            size="large"
        >
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '72vh', overflowY: 'auto', paddingRight: '4px' }}>
                
                {/* 1. General & Categorization */}
                <div style={{ background: 'var(--color-surface-secondary)', padding: '14px 16px', borderRadius: '10px', border: '1px solid var(--color-border)' }}>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 700, marginBottom: '10px' }}>
                        General & Categorization
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                        <div>
                            <Input
                                label="Vendor Name *"
                                placeholder="e.g. Apex Security Supplies Ltd"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '4px' }}>
                                Vendor Category
                            </label>
                            <select
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '9px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--color-border)',
                                    background: 'var(--color-surface)',
                                    color: 'var(--color-text)',
                                    fontSize: '13px'
                                }}
                            >
                                <option value="">-- Select Category --</option>
                                {categories.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '4px' }}>
                                Status
                            </label>
                            <select
                                value={statusVal}
                                onChange={(e) => setStatusVal(e.target.value as any)}
                                style={{
                                    width: '100%',
                                    padding: '9px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--color-border)',
                                    background: 'var(--color-surface)',
                                    color: 'var(--color-text)',
                                    fontSize: '13px'
                                }}
                            >
                                <option value="ACTIVE">Active</option>
                                <option value="PENDING_REVIEW">Pending Review</option>
                                <option value="INACTIVE">Inactive</option>
                                <option value="BLOCKED">Blocked</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* 2. Contact Information */}
                <div style={{ background: 'var(--color-surface-secondary)', padding: '14px 16px', borderRadius: '10px', border: '1px solid var(--color-border)' }}>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 700, marginBottom: '10px' }}>
                        Primary Contact Details
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                        <Input
                            label="Contact Person"
                            placeholder="e.g. Majid Khan"
                            value={contactPerson}
                            onChange={(e) => setContactPerson(e.target.value)}
                        />
                        <Input
                            label="Phone Number"
                            placeholder="e.g. +92 300 1234567"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                        />
                        <Input
                            label="Email Address"
                            type="email"
                            placeholder="e.g. sales@vendor.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                        <Input
                            label="Website URL"
                            placeholder="e.g. https://www.vendor.com"
                            value={website}
                            onChange={(e) => setWebsite(e.target.value)}
                        />
                    </div>
                    <div style={{ marginTop: '10px' }}>
                        <Input
                            label="Business / Warehouse Address"
                            placeholder="e.g. Plot 45, Industrial Area, Sector I-9, Islamabad"
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                        />
                    </div>
                </div>

                {/* 3. Commercial & Tax Details */}
                <div style={{ background: 'var(--color-surface-secondary)', padding: '14px 16px', borderRadius: '10px', border: '1px solid var(--color-border)' }}>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 700, marginBottom: '10px' }}>
                        Commercial & Tax Terms
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                        <Input
                            label="NTN / Tax Number"
                            placeholder="e.g. 1234567-8"
                            value={taxNumber}
                            onChange={(e) => setTaxNumber(e.target.value)}
                        />
                        <Input
                            label="Registration / SECP Number"
                            placeholder="e.g. 0089871"
                            value={registrationNumber}
                            onChange={(e) => setRegistrationNumber(e.target.value)}
                        />
                        <div>
                            <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '4px' }}>
                                Payment Terms
                            </label>
                            <select
                                value={paymentTerms}
                                onChange={(e) => setPaymentTerms(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '9px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--color-border)',
                                    background: 'var(--color-surface)',
                                    color: 'var(--color-text)',
                                    fontSize: '13px'
                                }}
                            >
                                <option value="Immediate">Immediate / Advance</option>
                                <option value="Net 15">Net 15 Days</option>
                                <option value="Net 30">Net 30 Days</option>
                                <option value="Net 45">Net 45 Days</option>
                                <option value="Net 60">Net 60 Days</option>
                                <option value="Custom">Custom Terms</option>
                            </select>
                        </div>
                        <Input
                            label="Credit Limit (PKR)"
                            type="number"
                            placeholder="0.00"
                            value={creditLimit}
                            onChange={(e) => setCreditLimit(e.target.value)}
                        />
                    </div>
                </div>

                {/* 4. Bank Settlement Details */}
                <div style={{ background: 'var(--color-surface-secondary)', padding: '14px 16px', borderRadius: '10px', border: '1px solid var(--color-border)' }}>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 700, marginBottom: '10px' }}>
                        Bank Settlement Details
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                        <Input
                            label="Bank Name"
                            placeholder="e.g. Meezan Bank Ltd"
                            value={bankName}
                            onChange={(e) => setBankName(e.target.value)}
                        />
                        <Input
                            label="Account Title"
                            placeholder="e.g. Apex Security Supplies Pvt Ltd"
                            value={accountTitle}
                            onChange={(e) => setAccountTitle(e.target.value)}
                        />
                        <Input
                            label="Account Number"
                            placeholder="e.g. 010101010101"
                            value={accountNumber}
                            onChange={(e) => setAccountNumber(e.target.value)}
                        />
                        <Input
                            label="IBAN"
                            placeholder="e.g. PK36MEZN00010101010101"
                            value={iban}
                            onChange={(e) => setIban(e.target.value)}
                        />
                    </div>
                </div>

                {/* 5. Notes */}
                <div>
                    <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '4px' }}>
                        Operational Notes & Vendor Background
                    </label>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={3}
                        placeholder="Add special notes, preferred delivery terms, or supplier remarks..."
                        style={{
                            width: '100%',
                            padding: '9px 12px',
                            borderRadius: '8px',
                            border: '1px solid var(--color-border)',
                            background: 'var(--color-surface)',
                            color: 'var(--color-text)',
                            fontSize: '13px',
                            fontFamily: 'inherit',
                            boxSizing: 'border-box'
                        }}
                    />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid var(--color-border)', paddingTop: '14px', marginTop: '4px' }}>
                    <Button type="button" variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="submit" variant="primary" disabled={isSaving}>
                        {isSaving ? 'Saving...' : vendor ? 'Save Changes' : 'Create Vendor'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
