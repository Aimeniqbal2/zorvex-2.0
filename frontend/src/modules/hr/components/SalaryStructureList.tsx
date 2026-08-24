import React, { useState, useEffect } from 'react';
import { apiClient } from '../api';
import type { SalaryStructure } from '../types';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { LoadingState } from '../../../components/ui/LoadingState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Badge } from '../../../components/ui/Badge';
import { SalaryStructureModal } from './SalaryStructureModal';

export const SalaryStructureList: React.FC = () => {
    const [structures, setStructures] = useState<SalaryStructure[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedStructure, setSelectedStructure] = useState<SalaryStructure | null>(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/api/hrm/salary-structures/');
            const data = res.data.results || (Array.isArray(res.data) ? res.data : []);
            setStructures(data);
            setError(null);
        } catch (err: any) {
            setError(err.message || 'Failed to load salary structures');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const columns: Column<SalaryStructure>[] = [
        { key: 'Code', header: 'Code', render: (s: SalaryStructure) => s.code },
        { key: 'Name', header: 'Name', render: (s: SalaryStructure) => s.name },
        { key: 'Status', header: 'Status', render: (s: SalaryStructure) => (
            <Badge variant={s.is_active ? 'success' : 'default'}>{s.is_active ? 'Active' : 'Inactive'}</Badge>
        )},
        { key: 'actions', header: 'Actions', render: (s: SalaryStructure) => (
            <div style={{ display: 'flex', gap: '8px' }}>
                <Button variant="secondary" onClick={() => { setSelectedStructure(s); setIsModalOpen(true); }}>Edit & Components</Button>
            </div>
        )}
    ];

    if (loading) return <LoadingState message="Loading salary structures..." />;
    if (error) return <ErrorState message={error} onRetry={fetchData} />;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Salary Structures</h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <Button variant="primary" onClick={() => { setSelectedStructure(null); setIsModalOpen(true); }}>Create Structure</Button>
                </div>
            </div>
            <DataTable columns={columns} data={structures} keyExtractor={(item: any) => item.id} />
            <SalaryStructureModal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)} 
                structure={selectedStructure} 
                onSave={fetchData} 
            />
        </div>
    );
};
