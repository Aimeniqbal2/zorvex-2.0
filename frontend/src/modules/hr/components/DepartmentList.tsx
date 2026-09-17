import React, { useState, useEffect } from 'react';
import { apiClient } from '../api';
import type { Department } from '../types';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/tables/DataTable';
import { LoadingState } from '../../../components/ui/LoadingState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { DepartmentModal } from './DepartmentModal';

export const DepartmentList: React.FC = () => {
    const [departments, setDepartments] = useState<Department[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null);

    const fetchDepartments = async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/api/hrm/departments/');
            setDepartments(res.data?.results || (Array.isArray(res.data) ? res.data : []));
            setError(null);
        } catch (err: any) {
            setError(err.message || 'Failed to load departments');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDepartments();
    }, []);

    const columns = [
        { key: 'name', header: 'Name', render: (d: Department) => d.name },
    ];

    if (loading) return <LoadingState message="Loading departments..." />;
    if (error) return <ErrorState message={error} onRetry={fetchDepartments} />;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Departments</h3>
                <Button variant="primary" onClick={() => {
                    setSelectedDepartment(null);
                    setIsModalOpen(true);
                }}>
                    Add Department
                </Button>
            </div>
            <DataTable 
                data={departments}
                columns={columns}
                keyExtractor={(d) => d.id}
                emptyMessage="No departments found."
            />
            
            <DepartmentModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                department={selectedDepartment}
                onSave={fetchDepartments}
            />
        </div>
    );
};
