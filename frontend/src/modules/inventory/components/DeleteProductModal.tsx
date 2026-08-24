import React, { useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { deleteProduct } from '../api';
import type { Product } from '../types';
import { useToastStore } from '../../../stores/toastStore';

interface DeleteProductModalProps {
    product: Product | null;
    onClose: () => void;
    onSuccess: () => void;
}

export const DeleteProductModal: React.FC<DeleteProductModalProps> = ({ product, onClose, onSuccess }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { success, error } = useToastStore();

    const handleDelete = async () => {
        if (!product) return;

        setIsSubmitting(true);
        try {
            await deleteProduct(product.id);
            success('Product deleted successfully');
            onSuccess();
            onClose();
        } catch (err) {
            error('Failed to delete product');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal 
            isOpen={!!product} 
            onClose={onClose} 
            title="Delete Product?"
            footer={
                <>
                    <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
                    <Button variant="danger" onClick={handleDelete} loading={isSubmitting}>Delete</Button>
                </>
            }
        >
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <i className='bx bx-error-circle' style={{ fontSize: '48px', color: 'var(--color-danger)', marginBottom: '16px' }}></i>
                <p style={{ margin: '0 0 8px 0', fontSize: '16px' }}>
                    Are you sure you want to delete <br/>
                    <strong>"{product?.model_name}"</strong>?
                </p>
                <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '14px' }}>
                    This action cannot be undone.
                </p>
            </div>
        </Modal>
    );
};
