import React, { useState, useEffect } from 'react';
import { apiClient } from '../api';
import type { WorkforceAttendance, Employee } from '../types';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { LoadingState } from '../../../components/ui/LoadingState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Badge } from '../../../components/ui/Badge';

export const AttendanceList: React.FC = () => {
    const [attendance, setAttendance] = useState<WorkforceAttendance[]>([]);
    const [employees, setEmployees] = useState<Record<string, Employee>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [attRes, empRes] = await Promise.all([
                apiClient.get('/api/hrm/workforce-attendance/'),
                apiClient.get('/api/hrm/employees/')
            ]);
            
            const attData = attRes.data.results || (Array.isArray(attRes.data) ? attRes.data : []);
            setAttendance(attData);

            const empData = empRes.data.results || (Array.isArray(empRes.data) ? empRes.data : []);
            const empMap: Record<string, Employee> = {};
            empData.forEach((e: Employee) => {
                empMap[e.id] = e;
            });
            setEmployees(empMap);

            setError(null);
        } catch (err: any) {
            setError(err.message || 'Failed to load attendance');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const getStatusVariant = (status: string) => {
        switch (status) {
            case 'PRESENT': return 'success';
            case 'ABSENT': return 'danger';
            case 'LATE': return 'warning';
            case 'HALF_DAY': return 'warning';
            case 'ON_LEAVE': return 'primary';
            default: return 'default';
        }
    };

    const columns: Column<WorkforceAttendance>[] = [
        { key: 'Employee', header: 'Employee', render: (a: WorkforceAttendance) => {
            const emp = employees[a.employee];
            return emp ? `${emp.first_name} ${emp.last_name}` : a.employee;
        }},
        { key: 'Date', header: 'Date', render: (a: WorkforceAttendance) => a.date },
        { key: 'Check In', header: 'Check In', render: (a: WorkforceAttendance) => a.check_in ? new Date(a.check_in).toLocaleString() : '—' },
        { key: 'Check Out', header: 'Check Out', render: (a: WorkforceAttendance) => a.check_out ? new Date(a.check_out).toLocaleString() : '—' },
        { key: 'Status', header: 'Status', render: (a: WorkforceAttendance) => (
            <Badge variant={getStatusVariant(a.status)}>{a.status}</Badge>
        )},
        { key: 'Source', header: 'Source', render: (a: WorkforceAttendance) => (
            <Badge variant="default">{a.source}</Badge>
        )}
    ];

    if (loading) return <LoadingState message="Loading attendance..." />;
    if (error) return <ErrorState message={error} onRetry={fetchData} />;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Workforce Attendance</h3>
                <Button variant="primary" onClick={() => {}}>
                    Sync Operations Duty
                </Button>
            </div>
            <DataTable columns={columns} data={attendance} keyExtractor={(item: any) => item.id} />
        </div>
    );
};
