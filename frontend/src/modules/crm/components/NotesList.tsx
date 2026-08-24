import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { ErrorState } from '../../../components/ui/ErrorState';
import { useToastStore } from '../../../stores/toastStore';
import { getNotes, deleteNote } from '../api';
import type { CRMNote } from '../types';
import { NoteModal } from './NoteModal';

interface NotesListProps {
    entityId: string;
}

export const NotesList: React.FC<NotesListProps> = ({ entityId }) => {
    const [notes, setNotes] = useState<CRMNote[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [noteToEdit, setNoteToEdit] = useState<CRMNote | null>(null);

    const fetchNotes = useCallback(async () => {
        setIsLoading(true);
        setHasError(false);
        try {
            const data = await getNotes(entityId);
            setNotes(data.results);
        } catch (error) {
            setHasError(true);
            useToastStore.getState().error('Failed to load notes.');
        } finally {
            setIsLoading(false);
        }
    }, [entityId]);

    useEffect(() => {
        fetchNotes();
    }, [fetchNotes]);

    const handleAdd = () => {
        setNoteToEdit(null);
        setIsModalOpen(true);
    };

    const handleEdit = (note: CRMNote) => {
        setNoteToEdit(note);
        setIsModalOpen(true);
    };

    const handleDelete = async (note: CRMNote) => {
        if (!window.confirm('Are you sure you want to delete this note?')) return;
        try {
            await deleteNote(note.id);
            useToastStore.getState().success('Note deleted successfully');
            fetchNotes();
        } catch (error) {
            useToastStore.getState().error('Failed to delete note');
        }
    };

    const columns: Column<CRMNote>[] = [
        {
            key: 'text',
            header: 'Note',
            render: (n) => (
                <div style={{ whiteSpace: 'pre-wrap', fontSize: '13px', lineHeight: '1.5' }}>
                    {n.text}
                </div>
            )
        },
        {
            key: 'created_at',
            header: 'Created',
            render: (n) => (
                <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                    {new Date(n.created_at).toLocaleString()}
                </div>
            )
        },
        {
            key: 'actions',
            header: 'Actions',
            render: (n) => (
                <div style={{ display: 'flex', gap: '4px' }}>
                    <Button variant="ghost" onClick={() => handleEdit(n)}>
                        <i className='bx bx-edit-alt'></i>
                    </Button>
                    <Button variant="ghost" onClick={() => handleDelete(n)} style={{ color: 'var(--color-error)' }}>
                        <i className='bx bx-trash'></i>
                    </Button>
                </div>
            )
        }
    ];

    if (hasError) {
        return <ErrorState title="Error" message="Failed to load notes" onRetry={fetchNotes} />;
    }

    return (
        <div style={{ backgroundColor: 'var(--color-surface)', padding: '20px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '16px', margin: 0 }}>Notes</h2>
                <Button variant="primary" onClick={handleAdd}>
                    <i className='bx bx-plus'></i> Add Note
                </Button>
            </div>
            
            <DataTable 
                data={notes} 
                columns={columns} 
                isLoading={isLoading} 
                keyExtractor={(row) => row.id} 
                emptyMessage="No notes found."
            />

            <NoteModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSaved={fetchNotes}
                entityId={entityId}
                note={noteToEdit}
            />
        </div>
    );
};
