import React, { useState, useEffect } from 'react';
import { apiClient } from '../api';
import type { Employee } from '../types';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/tables/DataTable';
import { LoadingState } from '../../../components/ui/LoadingState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { EmployeeModal } from './EmployeeModal';

export const EmployeeList: React.FC = () => {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

    const fetchEmployees = async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/api/hrm/employees/');
            setEmployees(res.data.results || (Array.isArray(res.data) ? res.data : []));
            setError(null);
        } catch (err: any) {
            setError(err.message || 'Failed to load employees');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEmployees();
    }, []);

    const columns = [
        { key: 'Code', header: 'Code',  },
        { key: 'Name', header: 'Name',  render: (e: Employee) => `${e.first_name} ${e.last_name}` },
        { key: 'Designation', header: 'Designation',  render: (e: Employee) => e.designation_name || '—' },
        { key: 'Department', header: 'Department',  render: (e: Employee) => e.department_name || '—' },
        { key: 'Status', header: 'Status',  render: (e: Employee) => e.is_active ? 'Active' : 'Inactive' },
        { key: 'actions', header: 'Actions',
            render: (e: Employee) => (
                <Button 
                    variant="secondary" 
                    
                    onClick={() => { setSelectedEmployee(e); setIsModalOpen(true); }}
                >
                    Edit
                </Button>
            )
        }
    ];

    if (loading) return <LoadingState message="Loading employees..." />;
    if (error) return <ErrorState message={error} onRetry={fetchEmployees} />;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Employees</h3>
                <Button variant="primary" onClick={() => { setSelectedEmployee(null); setIsModalOpen(true); }}>
                    Add Employee
                </Button>
            </div>
            <DataTable columns={columns} data={employees} keyExtractor={(item: any) => item.id} />
            
            {isModalOpen && (
                <EmployeeModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    employee={selectedEmployee}
                    onSave={fetchEmployees}
                />
            )}
        </div>
    );
};
