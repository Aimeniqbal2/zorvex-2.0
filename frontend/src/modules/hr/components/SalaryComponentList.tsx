import React, { useState, useEffect } from 'react';
import { apiClient } from '../api';
import type { SalaryComponent } from '../types';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { LoadingState } from '../../../components/ui/LoadingState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Badge } from '../../../components/ui/Badge';
import { SalaryComponentModal } from './SalaryComponentModal';

export const SalaryComponentList: React.FC = () => {
    const [components, setComponents] = useState<SalaryComponent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedComponent, setSelectedComponent] = useState<SalaryComponent | null>(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/api/hrm/salary-components/');
            const data = res.data.results || (Array.isArray(res.data) ? res.data : []);
            setComponents(data);
            setError(null);
        } catch (err: any) {
            setError(err.message || 'Failed to load salary components');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const columns: Column<SalaryComponent>[] = [
        { key: 'Code', header: 'Code', render: (c: SalaryComponent) => c.code },
        { key: 'Name', header: 'Name', render: (c: SalaryComponent) => c.name },
        { key: 'Type', header: 'Type', render: (c: SalaryComponent) => (
            <Badge variant={c.type === 'EARNING' ? 'success' : c.type === 'DEDUCTION' ? 'danger' : 'default'}>{c.type}</Badge>
        )},
        { key: 'CalcType', header: 'Calculation', render: (c: SalaryComponent) => c.calculation_type },
        { key: 'Taxable', header: 'Taxable', render: (c: SalaryComponent) => c.is_taxable ? 'Yes' : 'No' },
        { key: 'Status', header: 'Status', render: (c: SalaryComponent) => (
            <Badge variant={c.is_active ? 'success' : 'default'}>{c.is_active ? 'Active' : 'Inactive'}</Badge>
        )},
        { key: 'actions', header: 'Actions', render: (c: SalaryComponent) => (
            <div style={{ display: 'flex', gap: '8px' }}>
                <Button variant="secondary" onClick={() => { setSelectedComponent(c); setIsModalOpen(true); }}>Edit</Button>
            </div>
        )}
    ];

    if (loading) return <LoadingState message="Loading components..." />;
    if (error) return <ErrorState message={error} onRetry={fetchData} />;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Salary Components</h3>
                <Button variant="primary" onClick={() => { setSelectedComponent(null); setIsModalOpen(true); }}>Create Component</Button>
            </div>
            <DataTable columns={columns} data={components} keyExtractor={(item: any) => item.id} />
            <SalaryComponentModal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)} 
                component={selectedComponent} 
                onSave={fetchData} 
            />
        </div>
    );
};
