import React, { useState, useEffect } from 'react';
import { apiClient } from '../api';
import type { LeaveType } from '../types';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { LoadingState } from '../../../components/ui/LoadingState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Badge } from '../../../components/ui/Badge';

export const LeaveTypesList: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/api/hrm/leave-types/');
            const data = res.data.results || (Array.isArray(res.data) ? res.data : []);
            setLeaveTypes(data);
            setError(null);
        } catch (err: any) {
            setError(err.message || 'Failed to load leave types');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const columns: Column<LeaveType>[] = [
        { key: 'Code', header: 'Code', render: (l: LeaveType) => l.code },
        { key: 'Name', header: 'Name', render: (l: LeaveType) => l.name },
        { key: 'Paid', header: 'Paid', render: (l: LeaveType) => (
            <Badge variant={l.is_paid ? 'success' : 'default'}>{l.is_paid ? 'Yes' : 'No'}</Badge>
        )},
        { key: 'Max', header: 'Max Days / Yr', render: (l: LeaveType) => l.max_days_per_year },
        { key: 'Status', header: 'Status', render: (l: LeaveType) => (
            <Badge variant={l.is_active ? 'success' : 'default'}>{l.is_active ? 'Active' : 'Inactive'}</Badge>
        )}
    ];

    if (loading) return <LoadingState message="Loading leave types..." />;
    if (error) return <ErrorState message={error} onRetry={fetchData} />;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <Button variant="ghost" onClick={onBack}><i className='bx bx-arrow-back'></i></Button>
                    <h3 style={{ margin: 0 }}>Leave Types & Balances</h3>
                </div>
            </div>
            <DataTable columns={columns} data={leaveTypes} keyExtractor={(item: any) => item.id} />
        </div>
    );
};
