import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useToastStore } from '../../../stores/toastStore';
import type { CRMAddress, CreateCRMAddressPayload } from '../types';
import { createAddress, updateAddress } from '../api';

interface AddressModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => void;
    entityId: string;
    address?: CRMAddress | null;
}

export const AddressModal: React.FC<AddressModalProps> = ({ isOpen, onClose, onSaved, entityId, address }) => {
    const [formData, setFormData] = useState<CreateCRMAddressPayload>({
        entity: entityId,
        address_type: 'Other',
        line1: '',
        line2: '',
        city: '',
        state: '',
        country: 'Pakistan',
        postal_code: '',
        is_default: false
    });
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            if (address) {
                setFormData({
                    entity: entityId,
                    address_type: address.address_type,
                    line1: address.line1,
                    line2: address.line2,
                    city: address.city,
                    state: address.state,
                    country: address.country,
                    postal_code: address.postal_code,
                    is_default: address.is_default
                });
            } else {
                setFormData({
                    entity: entityId,
                    address_type: 'Other',
                    line1: '',
                    line2: '',
                    city: '',
                    state: '',
                    country: 'Pakistan',
                    postal_code: '',
                    is_default: false
                });
            }
            setErrors({});
        }
    }, [isOpen, address, entityId]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined;
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
            if (address) {
                await updateAddress(address.id, formData);
                useToastStore.getState().success('Address updated successfully');
            } else {
                await createAddress(formData);
                useToastStore.getState().success('Address created successfully');
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
        <Modal isOpen={isOpen} onClose={onClose} title={address ? 'Edit Address' : 'Add Address'}>
            <form onSubmit={handleSubmit}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px', marginBottom: '24px' }}>
                    
                    <div className="input-group">
                        <label>Address Type</label>
                        <select 
                            name="address_type" 
                            className="input-field" 
                            value={formData.address_type} 
                            onChange={handleChange}
                        >
                            <option value="Billing">Billing</option>
                            <option value="Shipping">Shipping</option>
                            <option value="Office">Office</option>
                            <option value="Warehouse">Warehouse</option>
                            <option value="Home">Home</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>

                    <Input
                        label="Line 1"
                        name="line1"
                        value={formData.line1}
                        onChange={handleChange}
                        required
                        error={errors.line1?.[0]}
                    />
                    <Input
                        label="Line 2"
                        name="line2"
                        value={formData.line2 || ''}
                        onChange={handleChange}
                        error={errors.line2?.[0]}
                    />
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <Input
                            label="City"
                            name="city"
                            value={formData.city}
                            onChange={handleChange}
                            required
                            error={errors.city?.[0]}
                        />
                        <Input
                            label="State/Province"
                            name="state"
                            value={formData.state || ''}
                            onChange={handleChange}
                            error={errors.state?.[0]}
                        />
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <Input
                            label="Postal Code"
                            name="postal_code"
                            value={formData.postal_code || ''}
                            onChange={handleChange}
                            error={errors.postal_code?.[0]}
                        />
                        <Input
                            label="Country"
                            name="country"
                            value={formData.country || ''}
                            onChange={handleChange}
                            error={errors.country?.[0]}
                        />
                    </div>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '8px' }}>
                        <input type="checkbox" name="is_default" checked={formData.is_default} onChange={handleChange} />
                        Default Address for this Type
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
                        {address ? 'Save Changes' : 'Create Address'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
