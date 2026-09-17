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
    const [filterTab, setFilterTab] = useState<'ALL' | 'DIRECT' | 'INDIRECT' | 'JUMP'>('ALL');
    const [searchQuery, setSearchQuery] = useState('');

    const fetchEmployees = async () => {
        setLoading(true);
        try {
            let url = '/api/hrm/employees/';
            const params: string[] = [];
            if (filterTab === 'DIRECT') params.push('classification=DIRECT');
            if (filterTab === 'INDIRECT') params.push('classification=INDIRECT');
            if (filterTab === 'JUMP') params.push('employment_status=JUMP');
            if (searchQuery) params.push(`search=${encodeURIComponent(searchQuery)}`);
            if (params.length > 0) url += `?${params.join('&')}`;

            const res = await apiClient.get(url);
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
    }, [filterTab]);

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        fetchEmployees();
    };

    const columns = [
        { key: 'employee_code', header: 'Code', render: (e: Employee) => <strong style={{ color: 'var(--color-primary)' }}>{e.employee_code || '—'}</strong> },
        { 
            key: 'Name', 
            header: 'Full Name & CNIC',  
            render: (e: Employee) => (
                <div>
                    <div style={{ fontWeight: 600 }}>{e.full_name || `${e.first_name} ${e.last_name}`}</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{e.cnic_number || 'No CNIC registered'}</div>
                </div>
            ) 
        },
        { 
            key: 'Classification', 
            header: 'Classification',  
            render: (e: Employee) => (
                <span className={`badge ${e.classification === 'DIRECT' ? 'badge-primary' : 'badge-secondary'}`} style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '4px' }}>
                    {e.classification === 'DIRECT' ? 'Direct (Field Guard)' : 'Indirect (Office)'}
                </span>
            ) 
        },
        { key: 'Designation', header: 'Designation', render: (e: Employee) => e.designation_name || '—' },
        { key: 'Department', header: 'Department', render: (e: Employee) => e.department_name || '—' },
        { 
            key: 'Status', 
            header: 'Status',  
            render: (e: Employee) => {
                let badgeClass = 'badge-success';
                if (e.employment_status === 'SUSPENDED' || e.employment_status === 'JUMP') badgeClass = 'badge-warning';
                if (e.employment_status === 'TERMINATED' || e.employment_status === 'RESIGNED') badgeClass = 'badge-danger';
                return (
                    <span className={`badge ${badgeClass}`} style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '4px' }}>
                        {e.employment_status || (e.is_active ? 'ACTIVE' : 'INACTIVE')}
                    </span>
                );
            } 
        },
        {
            key: 'Training',
            header: 'Training',
            render: (e: Employee) => (
                <span className={`badge ${e.training_completed ? 'badge-success' : 'badge-secondary'}`} style={{ fontSize: '10px' }}>
                    {e.training_completed ? '✓ Completed' : 'Pending'}
                </span>
            )
        },
        { 
            key: 'actions', 
            header: 'Actions',
            render: (e: Employee) => (
                <Button 
                    variant="secondary" 
                    onClick={() => { setSelectedEmployee(e); setIsModalOpen(true); }}
                >
                    View / Edit
                </Button>
            )
        }
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>Workforce & Employee Master</h3>
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-muted)' }}>
                        Authoritative Employee Records, Statutory Contributions, Verification & History
                    </p>
                </div>
                <Button variant="primary" onClick={() => { setSelectedEmployee(null); setIsModalOpen(true); }}>
                    + Register New Guard / Employee
                </Button>
            </div>

            {/* Filter tabs & Search bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', background: 'var(--color-surface)', padding: '12px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                    {(['ALL', 'DIRECT', 'INDIRECT', 'JUMP'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setFilterTab(tab)}
                            style={{
                                padding: '6px 14px',
                                borderRadius: '6px',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '13px',
                                fontWeight: filterTab === tab ? 600 : 400,
                                background: filterTab === tab ? 'var(--color-primary)' : 'transparent',
                                color: filterTab === tab ? '#fff' : 'var(--color-text)'
                            }}
                        >
                            {tab === 'ALL' ? 'All Employees' : tab === 'DIRECT' ? 'Direct (Guards / Field)' : tab === 'INDIRECT' ? 'Indirect (Office Staff)' : 'Jump / Missing'}
                        </button>
                    ))}
                </div>

                <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '8px' }}>
                    <input
                        type="text"
                        placeholder="Search by Code, Name, CNIC, Phone..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: '1px solid var(--color-border)',
                            background: 'var(--color-background)',
                            color: 'var(--color-text)',
                            fontSize: '13px',
                            width: '260px'
                        }}
                    />
                    <Button type="submit" variant="secondary">Search</Button>
                </form>
            </div>

            {loading ? (
                <LoadingState message="Loading workforce data..." />
            ) : error ? (
                <ErrorState message={error} onRetry={fetchEmployees} />
            ) : (
                <DataTable columns={columns} data={employees} keyExtractor={(item: any) => item.id} />
            )}
            
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
