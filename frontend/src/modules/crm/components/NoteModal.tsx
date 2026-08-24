import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { useToastStore } from '../../../stores/toastStore';
import type { CRMNote, CreateCRMNotePayload } from '../types';
import { createNote, updateNote } from '../api';

interface NoteModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => void;
    entityId: string;
    note?: CRMNote | null;
}

export const NoteModal: React.FC<NoteModalProps> = ({ isOpen, onClose, onSaved, entityId, note }) => {
    const [formData, setFormData] = useState<CreateCRMNotePayload>({
        entity: entityId,
        text: ''
    });
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            if (note) {
                setFormData({
                    entity: entityId,
                    text: note.text
                });
            } else {
                setFormData({
                    entity: entityId,
                    text: ''
                });
            }
            setErrors({});
        }
    }, [isOpen, note, entityId]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
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
            if (note) {
                await updateNote(note.id, formData);
                useToastStore.getState().success('Note updated successfully');
            } else {
                await createNote(formData);
                useToastStore.getState().success('Note created successfully');
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
        <Modal isOpen={isOpen} onClose={onClose} title={note ? 'Edit Note' : 'Add Note'}>
            <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: '24px' }}>
                    <div className="input-group">
                        <label>Note Text <span style={{ color: 'var(--color-error)' }}>*</span></label>
                        <textarea
                            name="text"
                            className="input-field"
                            value={formData.text}
                            onChange={handleChange}
                            rows={6}
                            required
                        />
                        {errors.text && <span className="error-text">{errors.text[0]}</span>}
                    </div>
                </div>
                
                {errors.non_field_errors && (
                    <div style={{ color: 'var(--color-error)', marginBottom: '16px', fontSize: '14px' }}>
                        {errors.non_field_errors.join(' ')}
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
                    <Button type="submit" variant="primary" loading={isSubmitting}>
                        {note ? 'Save Changes' : 'Create Note'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
