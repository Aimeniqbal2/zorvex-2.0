import React, { useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { createCategory } from '../api';
import { useToastStore } from '../../../stores/toastStore';

interface CategoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export const CategoryModal: React.FC<CategoryModalProps> = ({ isOpen, onClose, onSuccess }) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { success, error } = useToastStore();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setIsSubmitting(true);
        try {
            await createCategory({ name, description });
            success('Category created successfully');
            onSuccess();
            onClose();
            setName('');
            setDescription('');
        } catch (err) {
            error('Failed to create category');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title="New Category"
            footer={
                <>
                    <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
                    <Button variant="primary" onClick={handleSubmit} loading={isSubmitting}>Create Category</Button>
                </>
            }
        >
            <form onSubmit={handleSubmit} className="modal-form">
                <Input 
                    label="Category Name" 
                    value={name} 
                    onChange={e => setName(e.target.value)} 
                    required 
                    placeholder="e.g. Smartphones"
                />
                <Input 
                    label="Description (Optional)" 
                    value={description} 
                    onChange={e => setDescription(e.target.value)} 
                    placeholder="Brief description"
                />
            </form>
        </Modal>
    );
};
