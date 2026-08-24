import React, { useState, useEffect } from 'react';
import { apiClient } from '../api';
import type { EmployeeSalaryAssignment } from '../types';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { LoadingState } from '../../../components/ui/LoadingState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Badge } from '../../../components/ui/Badge';
import { EmployeeSalaryAssignmentModal } from './EmployeeSalaryAssignmentModal';

export const EmployeeSalaryAssignmentList: React.FC = () => {
    const [assignments, setAssignments] = useState<EmployeeSalaryAssignment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedAssignment, setSelectedAssignment] = useState<EmployeeSalaryAssignment | null>(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/api/hrm/employee-salary-assignments/');
            const data = res.data.results || (Array.isArray(res.data) ? res.data : []);
            setAssignments(data);
            setError(null);
        } catch (err: any) {
            setError(err.message || 'Failed to load assignments');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const columns: Column<EmployeeSalaryAssignment>[] = [
        { key: 'Employee', header: 'Employee ID', render: (a: EmployeeSalaryAssignment) => a.employee },
        { key: 'Structure', header: 'Structure ID', render: (a: EmployeeSalaryAssignment) => a.salary_structure },
        { key: 'Base', header: 'Base Salary', render: (a: EmployeeSalaryAssignment) => `${a.base_salary} ${a.currency}` },
        { key: 'Effective', header: 'Effective', render: (a: EmployeeSalaryAssignment) => `${a.effective_from} to ${a.effective_to || 'Present'}` },
        { key: 'Status', header: 'Status', render: (a: EmployeeSalaryAssignment) => (
            <Badge variant={a.status === 'ACTIVE' ? 'success' : 'default'}>{a.status}</Badge>
        )},
        { key: 'actions', header: 'Actions', render: (a: EmployeeSalaryAssignment) => (
            <div style={{ display: 'flex', gap: '8px' }}>
                <Button variant="secondary" onClick={() => { setSelectedAssignment(a); setIsModalOpen(true); }}>Edit</Button>
            </div>
        )}
    ];

    if (loading) return <LoadingState message="Loading assignments..." />;
    if (error) return <ErrorState message={error} onRetry={fetchData} />;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Salary Assignments</h3>
                <Button variant="primary" onClick={() => { setSelectedAssignment(null); setIsModalOpen(true); }}>Assign Salary</Button>
            </div>
            <DataTable columns={columns} data={assignments} keyExtractor={(item: any) => item.id} />
            <EmployeeSalaryAssignmentModal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)} 
                assignment={selectedAssignment} 
                onSave={fetchData} 
            />
        </div>
    );
};
