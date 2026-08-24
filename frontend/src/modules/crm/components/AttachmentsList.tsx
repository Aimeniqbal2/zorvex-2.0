import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { ErrorState } from '../../../components/ui/ErrorState';
import { useToastStore } from '../../../stores/toastStore';
import { getAttachments, deleteAttachment, downloadAttachment } from '../api';
import type { CRMAttachment } from '../types';
import { AttachmentModal } from './AttachmentModal';

interface AttachmentsListProps {
    entityId: string;
}

export const AttachmentsList: React.FC<AttachmentsListProps> = ({ entityId }) => {
    const [attachments, setAttachments] = useState<CRMAttachment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    
    const [isModalOpen, setIsModalOpen] = useState(false);

    const fetchAttachments = useCallback(async () => {
        setIsLoading(true);
        setHasError(false);
        try {
            const data = await getAttachments(entityId);
            setAttachments(data.results);
        } catch (error) {
            setHasError(true);
            useToastStore.getState().error('Failed to load attachments.');
        } finally {
            setIsLoading(false);
        }
    }, [entityId]);

    useEffect(() => {
        fetchAttachments();
    }, [fetchAttachments]);

    const handleAdd = () => {
        setIsModalOpen(true);
    };

    const handleDelete = async (attachment: CRMAttachment) => {
        if (!window.confirm('Are you sure you want to delete this attachment?')) return;
        try {
            await deleteAttachment(attachment.id);
            useToastStore.getState().success('Attachment deleted successfully');
            fetchAttachments();
        } catch (error) {
            useToastStore.getState().error('Failed to delete attachment');
        }
    };

    const columns: Column<CRMAttachment>[] = [
        {
            key: 'file',
            header: 'File',
            render: (a) => {
                const filename = a.file.split('/').pop() || 'File';
                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <i className='bx bx-file-blank' style={{ fontSize: '20px', color: 'var(--color-primary)' }}></i>
                        <button 
                            type="button" 
                            onClick={() => downloadAttachment(a.id, filename)}
                            style={{ 
                                fontWeight: 500, 
                                color: 'var(--color-primary)', 
                                textDecoration: 'none', 
                                background: 'none', 
                                border: 'none', 
                                padding: 0, 
                                cursor: 'pointer',
                                font: 'inherit'
                            }}>
                            {filename}
                        </button>
                    </div>
                );
            }
        },
        {
            key: 'description',
            header: 'Description',
            render: (a) => (
                <div style={{ fontSize: '13px' }}>
                    {a.description || <span style={{ color: 'var(--color-text-muted)' }}>—</span>}
                </div>
            )
        },
        {
            key: 'created_at',
            header: 'Uploaded Date',
            render: (a) => (
                <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                    {new Date(a.created_at).toLocaleString()}
                </div>
            )
        },
        {
            key: 'actions',
            header: 'Actions',
            render: (a) => {
                const filename = a.file.split('/').pop() || 'File';
                return (
                    <div style={{ display: 'flex', gap: '4px' }}>
                        <Button variant="ghost" type="button" onClick={() => downloadAttachment(a.id, filename)}>
                            <i className='bx bx-download'></i>
                        </Button>
                        <Button variant="ghost" onClick={() => handleDelete(a)} style={{ color: 'var(--color-error)' }}>
                            <i className='bx bx-trash'></i>
                        </Button>
                    </div>
                );
            }
        }
    ];

    if (hasError) {
        return <ErrorState title="Error" message="Failed to load attachments" onRetry={fetchAttachments} />;
    }

    return (
        <div style={{ backgroundColor: 'var(--color-surface)', padding: '20px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '16px', margin: 0 }}>Attachments</h2>
                <Button variant="primary" onClick={handleAdd}>
                    <i className='bx bx-upload'></i> Upload File
                </Button>
            </div>
            
            <DataTable 
                data={attachments} 
                columns={columns} 
                isLoading={isLoading} 
                keyExtractor={(row) => row.id} 
                emptyMessage="No attachments found."
            />

            <AttachmentModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSaved={fetchAttachments}
                entityId={entityId}
            />
        </div>
    );
};
