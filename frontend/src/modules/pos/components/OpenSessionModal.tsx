import React, { useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useToastStore } from '../../../stores/toastStore';
import { usePosStore } from '../store/usePosStore';
import { openSession } from '../api';

interface OpenSessionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export const OpenSessionModal: React.FC<OpenSessionModalProps> = ({ isOpen, onClose, onSuccess }) => {
    const [openingCash, setOpeningCash] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { error, success } = useToastStore();
    const { setSession } = usePosStore();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!openingCash || isNaN(Number(openingCash)) || Number(openingCash) < 0) {
            error('Please enter a valid opening cash amount');
            return;
        }

        setIsSubmitting(true);
        try {
            const session = await openSession(openingCash);
            setSession(session);
            success('POS Session opened successfully');
            onSuccess();
        } catch (err: any) {
            console.error('Error opening session:', err);
            error(err.response?.data?.detail || 'Failed to open POS session');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title="Open POS Session"
            footer={
                <>
                    <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button type="submit" variant="primary" disabled={isSubmitting || !openingCash} onClick={handleSubmit}>
                        {isSubmitting ? 'Opening...' : 'Open Session'}
                    </Button>
                </>
            }
        >
            <p style={{ marginBottom: 'var(--spacing-4)', color: 'var(--color-text-muted)' }}>
                You must open a session before you can process any sales.
            </p>
            <Input
                label="Opening Cash (PKR)"
                type="number"
                min="0"
                step="0.01"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                placeholder="0.00"
                required
                autoFocus
            />
        </Modal>
    );
};
