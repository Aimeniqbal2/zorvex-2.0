import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { ErrorState } from '../../../components/ui/ErrorState';
import { useToastStore } from '../../../stores/toastStore';
import { getCommunications, deleteCommunication } from '../api';
import type { CRMCommunication } from '../types';
import { CommunicationModal } from './CommunicationModal';

interface CommunicationsListProps {
    entityId: string;
}

export const CommunicationsList: React.FC<CommunicationsListProps> = ({ entityId }) => {
    const [communications, setCommunications] = useState<CRMCommunication[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [communicationToEdit, setCommunicationToEdit] = useState<CRMCommunication | null>(null);

    const fetchCommunications = useCallback(async () => {
        setIsLoading(true);
        setHasError(false);
        try {
            const data = await getCommunications(entityId);
            setCommunications(data.results);
        } catch (error) {
            setHasError(true);
            useToastStore.getState().error('Failed to load communications.');
        } finally {
            setIsLoading(false);
        }
    }, [entityId]);

    useEffect(() => {
        fetchCommunications();
    }, [fetchCommunications]);

    const handleAdd = () => {
        setCommunicationToEdit(null);
        setIsModalOpen(true);
    };

    const handleEdit = (comm: CRMCommunication) => {
        setCommunicationToEdit(comm);
        setIsModalOpen(true);
    };

    const handleDelete = async (comm: CRMCommunication) => {
        if (!window.confirm('Are you sure you want to delete this communication record?')) return;
        try {
            await deleteCommunication(comm.id);
            useToastStore.getState().success('Communication deleted successfully');
            fetchCommunications();
        } catch (error) {
            useToastStore.getState().error('Failed to delete communication');
        }
    };

    const columns: Column<CRMCommunication>[] = [
        {
            key: 'type',
            header: 'Type',
            render: (c) => (
                <span style={{ 
                    textTransform: 'capitalize', 
                    fontWeight: 500,
                    padding: '4px 8px',
                    borderRadius: '4px',
                    backgroundColor: 'var(--color-surface-secondary)',
                    fontSize: '12px'
                }}>
                    {c.type}
                </span>
            )
        },
        {
            key: 'subject',
            header: 'Subject & Description',
            render: (c) => (
                <div>
                    <div style={{ fontWeight: 500 }}>{c.subject}</div>
                    {c.description && <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>{c.description}</div>}
                </div>
            )
        },
        {
            key: 'timestamp',
            header: 'Date & Time',
            render: (c) => (
                <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                    {new Date(c.timestamp).toLocaleString()}
                </div>
            )
        },
        {
            key: 'actions',
            header: 'Actions',
            render: (c) => (
                <div style={{ display: 'flex', gap: '4px' }}>
                    <Button variant="ghost" onClick={() => handleEdit(c)}>
                        <i className='bx bx-edit-alt'></i>
                    </Button>
                    <Button variant="ghost" onClick={() => handleDelete(c)} style={{ color: 'var(--color-error)' }}>
                        <i className='bx bx-trash'></i>
                    </Button>
                </div>
            )
        }
    ];

    if (hasError) {
        return <ErrorState title="Error" message="Failed to load communications" onRetry={fetchCommunications} />;
    }

    return (
        <div style={{ backgroundColor: 'var(--color-surface)', padding: '20px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '16px', margin: 0 }}>Communications</h2>
                <Button variant="primary" onClick={handleAdd}>
                    <i className='bx bx-plus'></i> Log Communication
                </Button>
            </div>
            
            <DataTable 
                data={communications} 
                columns={columns} 
                isLoading={isLoading} 
                keyExtractor={(row) => row.id} 
                emptyMessage="No communication history."
            />

            <CommunicationModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSaved={fetchCommunications}
                entityId={entityId}
                communication={communicationToEdit}
            />
        </div>
    );
};
