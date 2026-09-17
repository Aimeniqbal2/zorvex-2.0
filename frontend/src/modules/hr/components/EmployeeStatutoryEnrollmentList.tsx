import React, { useState, useEffect } from 'react';
import { apiClient } from '../api';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { LoadingState } from '../../../components/ui/LoadingState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Badge } from '../../../components/ui/Badge';
import { EmployeeStatutoryEnrollmentModal } from './EmployeeStatutoryEnrollmentModal';
import type { EmployeeStatutoryEnrollment, StatutoryScheme } from '../types';

export const EmployeeStatutoryEnrollmentList: React.FC = () => {
    const [enrollments, setEnrollments] = useState<EmployeeStatutoryEnrollment[]>([]);
    const [schemes, setSchemes] = useState<Record<string, StatutoryScheme>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedEnrollment, setSelectedEnrollment] = useState<EmployeeStatutoryEnrollment | null>(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [enrollmentsRes, schemesRes] = await Promise.all([
                apiClient.get('/api/hrm/statutory-enrollments/'),
                apiClient.get('/api/hrm/statutory-schemes/')
            ]);
            const eData = enrollmentsRes.data.results || (Array.isArray(enrollmentsRes.data) ? enrollmentsRes.data : []);
            setEnrollments(eData);

            const sData = schemesRes.data.results || (Array.isArray(schemesRes.data) ? schemesRes.data : []);
            const sMap: Record<string, StatutoryScheme> = {};
            sData.forEach((s: StatutoryScheme) => {
                sMap[s.id] = s;
            });
            setSchemes(sMap);
            setError(null);
        } catch (err: any) {
            setError(err.message || 'Failed to load statutory enrollments');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleToggleActive = async (id: string, currentStatus: boolean) => {
        try {
            await apiClient.patch(`/api/hrm/statutory-enrollments/${id}/`, { is_active: !currentStatus });
            fetchData();
        } catch (err: any) {
            alert('Failed to update status: ' + (err.response?.data?.detail || err.message));
        }
    };

    const columns: Column<EmployeeStatutoryEnrollment>[] = [
        { key: 'Employee', header: 'Employee', render: (e: EmployeeStatutoryEnrollment) => e.employee_name || e.employee },
        { key: 'Scheme', header: 'Scheme', render: (e: EmployeeStatutoryEnrollment) => schemes[e.scheme]?.name || e.scheme },
        { key: 'Identifier', header: 'Identifier', render: (e: EmployeeStatutoryEnrollment) => e.identifier || '—' },
        { key: 'Status', header: 'Status', render: (e: EmployeeStatutoryEnrollment) => (
            <Badge variant={e.is_active ? 'success' : 'default'}>{e.is_active ? 'Active' : 'Inactive'}</Badge>
        )},
        { key: 'actions', header: 'Actions', render: (e: EmployeeStatutoryEnrollment) => (
            <div style={{ display: 'flex', gap: '8px' }}>
                <Button variant="secondary" onClick={() => { setSelectedEnrollment(e); setIsModalOpen(true); }}>Edit</Button>
                <Button variant={e.is_active ? 'danger' : 'primary'} onClick={() => handleToggleActive(e.id, e.is_active)}>
                    {e.is_active ? 'Deactivate' : 'Activate'}
                </Button>
            </div>
        )}
    ];

    if (loading) return <LoadingState message="Loading enrollments..." />;
    if (error) return <ErrorState message={error} onRetry={fetchData} />;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                <Button variant="primary" onClick={() => { setSelectedEnrollment(null); setIsModalOpen(true); }}>Enroll Employee</Button>
            </div>
            <DataTable columns={columns} data={enrollments} keyExtractor={(item: any) => item.id} />
            
            {isModalOpen && (
                <EmployeeStatutoryEnrollmentModal 
                    isOpen={isModalOpen} 
                    onClose={() => setIsModalOpen(false)} 
                    enrollment={selectedEnrollment} 
                    onSave={fetchData}
                    schemes={Object.values(schemes)}
                />
            )}
        </div>
    );
};
