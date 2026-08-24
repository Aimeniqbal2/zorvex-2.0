import React, { useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useToastStore } from '../../../stores/toastStore';
import { createAttachment } from '../api';

interface AttachmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => void;
    entityId: string;
}

export const AttachmentModal: React.FC<AttachmentModalProps> = ({ isOpen, onClose, onSaved, entityId }) => {
    const [file, setFile] = useState<File | null>(null);
    const [description, setDescription] = useState('');
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setFile(e.target.files[0]);
            if (errors.file) {
                setErrors(prev => ({ ...prev, file: [] }));
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) {
            setErrors({ file: ['Please select a file to upload.'] });
            return;
        }

        setIsSubmitting(true);
        setErrors({});

        try {
            await createAttachment({
                entity: entityId,
                file: file,
                description: description
            });
            useToastStore.getState().success('Attachment uploaded successfully');
            setFile(null);
            setDescription('');
            onSaved();
            onClose();
        } catch (error: any) {
            if (error.response?.data) {
                setErrors(error.response.data);
                useToastStore.getState().error('Please check the form for errors.');
            } else {
                useToastStore.getState().error('An unexpected error occurred during upload.');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    // Reset state on close could be managed via useEffect if needed, but simplified here.

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Upload Attachment">
            <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: '24px' }}>
                    <div className="input-group" style={{ marginBottom: '16px' }}>
                        <label>File <span style={{ color: 'var(--color-error)' }}>*</span></label>
                        <input
                            type="file"
                            onChange={handleFileChange}
                            className="input-field"
                            required
                        />
                        {errors.file && <span className="error-text">{errors.file[0]}</span>}
                    </div>

                    <Input
                        label="Description"
                        name="description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        error={errors.description?.[0]}
                    />
                </div>
                
                {errors.non_field_errors && (
                    <div style={{ color: 'var(--color-error)', marginBottom: '16px', fontSize: '14px' }}>
                        {errors.non_field_errors.join(' ')}
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
                    <Button type="submit" variant="primary" loading={isSubmitting} disabled={!file}>
                        Upload
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
