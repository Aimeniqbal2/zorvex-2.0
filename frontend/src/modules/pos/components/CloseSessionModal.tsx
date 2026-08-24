import React, { useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useToastStore } from '../../../stores/toastStore';
import { usePosStore } from '../store/usePosStore';
import { closeSession } from '../api';

interface CloseSessionModalProps {
    isOpen: boolean;
    onClose: () => void;
    sessionId: string;
}

export const CloseSessionModal: React.FC<CloseSessionModalProps> = ({ isOpen, onClose, sessionId }) => {
    const [closingCash, setClosingCash] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { error, success } = useToastStore();
    const { setSession } = usePosStore();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!closingCash || isNaN(Number(closingCash)) || Number(closingCash) < 0) {
            error('Please enter a valid closing cash amount');
            return;
        }

        setIsSubmitting(true);
        try {
            await closeSession(sessionId, closingCash);
            setSession(null); // Clear active session on success
            success('POS Session closed successfully');
            onClose();
        } catch (err: any) {
            console.error('Error closing session:', err);
            error(err.response?.data?.detail || 'Failed to close POS session');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title="Close POS Session"
            footer={
                <>
                    <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button type="submit" variant="primary" disabled={isSubmitting || !closingCash} onClick={handleSubmit}>
                        {isSubmitting ? 'Closing...' : 'Close Session'}
                    </Button>
                </>
            }
        >
            <p style={{ marginBottom: 'var(--spacing-4)', color: 'var(--color-text-muted)' }}>
                Enter the final cash in drawer to close the current session.
            </p>
            <Input
                label="Closing Cash (PKR)"
                type="number"
                min="0"
                step="0.01"
                value={closingCash}
                onChange={(e) => setClosingCash(e.target.value)}
                placeholder="0.00"
                required
                autoFocus
            />
        </Modal>
    );
};
