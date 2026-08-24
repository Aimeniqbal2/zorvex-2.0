import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { usePosStore } from '../store/usePosStore';

interface DiscountModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const DiscountModal: React.FC<DiscountModalProps> = ({ isOpen, onClose }) => {
    const { discount, setDiscount, getSubtotal } = usePosStore();
    
    const [type, setType] = useState<'percentage' | 'flat'>(discount?.type || 'percentage');
    const [value, setValue] = useState<string>(discount?.value.toString() || '');
    const [error, setError] = useState<string>('');

    // Reset internal state when modal opens to match store
    useEffect(() => {
        if (isOpen) {
            setType(discount?.type || 'percentage');
            setValue(discount?.value.toString() || '');
            setError('');
        }
    }, [isOpen, discount]);

    const handleApply = () => {
        setError('');
        const numValue = parseFloat(value);

        if (isNaN(numValue) || numValue < 0) {
            setError('Please enter a valid positive number.');
            return;
        }

        const subtotal = getSubtotal();

        if (type === 'percentage') {
            if (numValue > 100) {
                setError('Percentage cannot exceed 100%.');
                return;
            }
        } else {
            if (numValue > subtotal) {
                setError(`Flat discount cannot exceed subtotal (PKR ${subtotal.toLocaleString()}).`);
                return;
            }
        }

        setDiscount({ type, value: numValue });
        onClose();
    };

    const handleRemove = () => {
        setDiscount(null);
        onClose();
    };

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title="Apply Discount"
            footer={
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                    <Button variant="danger" onClick={handleRemove} disabled={!discount}>
                        Remove Discount
                    </Button>
                    <div style={{ display: 'flex', gap: 'var(--spacing-2)' }}>
                        <Button variant="secondary" onClick={onClose}>Cancel</Button>
                        <Button variant="primary" onClick={handleApply}>Apply</Button>
                    </div>
                </div>
            }
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
                <div style={{ display: 'flex', gap: 'var(--spacing-2)' }}>
                    <Button 
                        variant={type === 'percentage' ? 'primary' : 'secondary'} 
                        onClick={() => { setType('percentage'); setError(''); }}
                        style={{ flex: 1 }}
                    >
                        Percentage (%)
                    </Button>
                    <Button 
                        variant={type === 'flat' ? 'primary' : 'secondary'} 
                        onClick={() => { setType('flat'); setError(''); }}
                        style={{ flex: 1 }}
                    >
                        Flat Amount (PKR)
                    </Button>
                </div>

                <Input
                    label={type === 'percentage' ? 'Discount Percentage (%)' : 'Flat Discount (PKR)'}
                    type="number"
                    min="0"
                    step={type === 'percentage' ? '0.1' : '1'}
                    value={value}
                    onChange={(e) => {
                        setValue(e.target.value);
                        setError('');
                    }}
                    error={error}
                    placeholder={type === 'percentage' ? 'e.g. 10' : 'e.g. 500'}
                    autoFocus
                />
            </div>
        </Modal>
    );
};
