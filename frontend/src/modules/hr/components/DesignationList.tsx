import React, { useState, useEffect } from 'react';
import { apiClient } from '../api';
import type { Designation } from '../types';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/tables/DataTable';
import { LoadingState } from '../../../components/ui/LoadingState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { DesignationModal } from './DesignationModal';

export const DesignationList: React.FC = () => {
    const [designations, setDesignations] = useState<Designation[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedDesignation, setSelectedDesignation] = useState<Designation | null>(null);

    const fetchDesignations = async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/api/hrm/designations/');
            setDesignations(res.data.results || (Array.isArray(res.data) ? res.data : []));
            setError(null);
        } catch (err: any) {
            setError(err.message || 'Failed to load designations');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDesignations();
    }, []);

    const columns = [
        { key: 'Code', header: 'Code',  },
        { key: 'Name', header: 'Name',  },
        { key: 'actions', header: 'Actions',
            render: (d: Designation) => (
                <Button 
                    variant="secondary" 
                    
                    onClick={() => { setSelectedDesignation(d); setIsModalOpen(true); }}
                >
                    Edit
                </Button>
            )
        }
    ];

    if (loading) return <LoadingState message="Loading designations..." />;
    if (error) return <ErrorState message={error} onRetry={fetchDesignations} />;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Designations</h3>
                <Button variant="primary" onClick={() => { setSelectedDesignation(null); setIsModalOpen(true); }}>
                    Add Designation
                </Button>
            </div>
            <DataTable columns={columns} data={designations} keyExtractor={(item: any) => item.id} />
            
            {isModalOpen && (
                <DesignationModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    designation={selectedDesignation}
                    onSave={fetchDesignations}
                />
            )}
        </div>
    );
};
