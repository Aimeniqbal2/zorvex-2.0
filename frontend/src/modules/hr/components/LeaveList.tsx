import React, { useState, useEffect } from 'react';
import { apiClient } from '../api';
import type { LeaveRequest } from '../types';

import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { LoadingState } from '../../../components/ui/LoadingState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Badge } from '../../../components/ui/Badge';

export const LeaveList: React.FC = () => {
    const [requests, setRequests] = useState<LeaveRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [reqRes] = await Promise.all([
                apiClient.get('/api/hrm/leave-requests/'),
            ]);
            
            const reqData = reqRes.data.results || (Array.isArray(reqRes.data) ? reqRes.data : []);
            setRequests(reqData);

            setError(null);
        } catch (err: any) {
            setError(err.message || 'Failed to load leave requests');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleStatusChange = async (id: string, status: string) => {
        try {
            await apiClient.patch(`/api/hrm/leave-requests/${id}/`, { status });
            fetchData();
        } catch (err: any) {
            alert('Failed to update leave status: ' + (err.response?.data?.error || err.message));
        }
    };

    const columns: Column<LeaveRequest>[] = [
        { key: 'Employee', header: 'Employee', render: (l: LeaveRequest) => l.employee },
        { key: 'Type', header: 'Leave Type', render: (l: LeaveRequest) => l.leave_type },
        { key: 'Dates', header: 'Dates', render: (l: LeaveRequest) => `${l.start_date} to ${l.end_date}` },
        { key: 'Days', header: 'Requested Days', render: (l: LeaveRequest) => (l as any).requested_days },
        { key: 'Status', header: 'Status', render: (l: LeaveRequest) => (
            <Badge variant={l.status === 'APPROVED' ? 'success' : l.status === 'PENDING' ? 'warning' : l.status === 'REJECTED' ? 'danger' : 'default'}>{l.status}</Badge>
        )},
        { key: 'actions', header: 'Actions', render: (l: LeaveRequest) => (
            <div style={{ display: 'flex', gap: '8px' }}>
                {l.status === 'PENDING' && (
                    <>
                        <Button variant="primary" onClick={() => handleStatusChange(l.id, 'APPROVED')}>Approve</Button>
                        <Button variant="secondary" onClick={() => handleStatusChange(l.id, 'REJECTED')}>Reject</Button>
                    </>
                )}
                <Button variant="secondary">View</Button>
            </div>
        )}
    ];

    if (loading) return <LoadingState message="Loading leaves..." />;
    if (error) return <ErrorState message={error} onRetry={fetchData} />;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Leave Requests</h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <Button variant="secondary" onClick={() => {}}>Types & Balances</Button>
                    <Button variant="primary" onClick={() => {}}>Request Leave</Button>
                </div>
            </div>
            <DataTable columns={columns} data={requests} keyExtractor={(item: any) => item.id} />
        </div>
    );
};
