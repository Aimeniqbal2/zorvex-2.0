import React, { useState, useEffect } from 'react';
import { apiClient } from '../api';
import type { Shift } from '../types';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { LoadingState } from '../../../components/ui/LoadingState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Badge } from '../../../components/ui/Badge';

export const ShiftList: React.FC = () => {
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/api/hrm/shifts/');
            const data = res.data.results || (Array.isArray(res.data) ? res.data : []);
            setShifts(data);
            setError(null);
        } catch (err: any) {
            setError(err.message || 'Failed to load shifts');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const columns: Column<Shift>[] = [
        { key: 'Code', header: 'Code', render: (s: Shift) => s.code },
        { key: 'Name', header: 'Name', render: (s: Shift) => s.name },
        { key: 'Timing', header: 'Timing', render: (s: Shift) => `${s.start_time} - ${s.end_time}` },
        { key: 'Night', header: 'Night Shift', render: (s: Shift) => (
            <Badge variant={s.is_night_shift ? 'primary' : 'default'}>{s.is_night_shift ? 'Yes' : 'No'}</Badge>
        )},
        { key: 'Status', header: 'Status', render: (s: Shift) => (
            <Badge variant={s.is_active ? 'success' : 'default'}>{s.is_active ? 'Active' : 'Inactive'}</Badge>
        )},
        { key: 'actions', header: 'Actions', render: (_s: Shift) => (
            <div style={{ display: 'flex', gap: '8px' }}>
                <Button variant="secondary">Edit</Button>
            </div>
        )}
    ];

    if (loading) return <LoadingState message="Loading shifts..." />;
    if (error) return <ErrorState message={error} onRetry={fetchData} />;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Work Shifts</h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <Button variant="secondary" onClick={() => {}}>Work Schedules</Button>
                    <Button variant="primary" onClick={() => {}}>Add Shift</Button>
                </div>
            </div>
            <DataTable columns={columns} data={shifts} keyExtractor={(item: any) => item.id} />
        </div>
    );
};
