import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { usePosStore } from '../store/usePosStore';

interface TaxModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const TaxModal: React.FC<TaxModalProps> = ({ isOpen, onClose }) => {
    const { taxRate, setTaxRate } = usePosStore();
    
    // Store taxRate as string for input handling, multiply by 100 to show as percentage (e.g. 0.16 -> 16)
    const [rateStr, setRateStr] = useState<string>('');
    const [error, setError] = useState<string>('');

    useEffect(() => {
        if (isOpen) {
            setRateStr(taxRate > 0 ? (taxRate * 100).toString() : '0');
            setError('');
        }
    }, [isOpen, taxRate]);

    const handleApply = () => {
        setError('');
        const numValue = parseFloat(rateStr);

        if (isNaN(numValue) || numValue < 0) {
            setError('Please enter a valid positive number.');
            return;
        }

        if (numValue > 100) {
            setError('Tax rate cannot exceed 100%.');
            return;
        }

        // Convert percentage back to decimal (e.g., 16 -> 0.16)
        setTaxRate(numValue / 100);
        onClose();
    };

    const handleRemove = () => {
        setTaxRate(0);
        onClose();
    };

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title="Configure Tax Rate"
            footer={
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                    <Button variant="danger" onClick={handleRemove} disabled={taxRate === 0}>
                        Remove Tax
                    </Button>
                    <div style={{ display: 'flex', gap: 'var(--spacing-2)' }}>
                        <Button variant="secondary" onClick={onClose}>Cancel</Button>
                        <Button variant="primary" onClick={handleApply}>Apply</Button>
                    </div>
                </div>
            }
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
                <Input
                    label="Tax Rate (%)"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={rateStr}
                    onChange={(e) => {
                        setRateStr(e.target.value);
                        setError('');
                    }}
                    error={error}
                    placeholder="e.g. 16"
                    autoFocus
                />
            </div>
        </Modal>
    );
};
