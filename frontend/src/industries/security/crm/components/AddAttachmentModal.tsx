import React, { useState } from 'react';
import { Modal } from '../../../../components/ui/Modal';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { useToastStore } from '../../../../stores/toastStore';
import { addAssessmentAttachment } from '../api';
import type { AssessmentAttachment } from '../api';

interface Props {
    isOpen: boolean;
    assessmentId: string;
    onClose: () => void;
    onAdded: (attachment: AssessmentAttachment) => void;
}

export const AddAttachmentModal: React.FC<Props> = ({
    isOpen,
    assessmentId,
    onClose,
    onAdded
}) => {
    const [title, setTitle] = useState('');
    const [category, setCategory] = useState<'SITE_PHOTO' | 'LAYOUT_DOCUMENT' | 'CLIENT_DOCUMENT' | 'EXISTING_SETUP' | 'OTHER'>('SITE_PHOTO');
    const [fileUrl, setFileUrl] = useState('');
    const [notes, setNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) {
            useToastStore.getState().error('Please enter a title for the evidence / document.');
            return;
        }

        setIsSubmitting(true);
        try {
            const att = await addAssessmentAttachment(assessmentId, {
                title,
                category,
                file_url: fileUrl,
                notes
            });

            useToastStore.getState().success('Assessment evidence uploaded/recorded.');
            onAdded(att);
            onClose();
        } catch (err: any) {
            useToastStore.getState().error(err.response?.data?.error || 'Failed to add attachment.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Upload Site Evidence & Documents" width="550px">
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                        Title / Caption *
                    </label>
                    <Input 
                        placeholder="e.g. Main Gate Barrier Inspection, Facility Floor Plan v2"
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        required
                    />
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                        Category *
                    </label>
                    <select 
                        value={category} 
                        onChange={e => setCategory(e.target.value as any)}
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: '6px', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                    >
                        <option value="SITE_PHOTO">Site Survey Photo</option>
                        <option value="LAYOUT_DOCUMENT">Layout / Blueprint Document</option>
                        <option value="EXISTING_SETUP">Existing Security Setup Photo</option>
                        <option value="CLIENT_DOCUMENT">Client Handout / Policy Document</option>
                        <option value="OTHER">Other Evidence</option>
                    </select>
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                        Document / Image URL or Storage Link
                    </label>
                    <Input 
                        placeholder="https://... or storage reference"
                        value={fileUrl}
                        onChange={e => setFileUrl(e.target.value)}
                    />
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                        Observation Notes
                    </label>
                    <textarea 
                        rows={3}
                        placeholder="Notes regarding what is shown in this photo/document..."
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: '6px', background: 'var(--color-surface)', color: 'var(--color-text)', resize: 'vertical' }}
                    />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                    <Button type="button" variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="submit" variant="primary" loading={isSubmitting}>
                        <i className='bx bx-upload'></i> Save Attachment
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
