import React, { useState, useEffect } from 'react';
import { apiClient } from '../api';
import type { OvertimeRecord } from '../types';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { LoadingState } from '../../../components/ui/LoadingState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Badge } from '../../../components/ui/Badge';
import { OvertimeModal } from './OvertimeModal';

export const OvertimeList: React.FC = () => {
    const [records, setRecords] = useState<OvertimeRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedRecord, setSelectedRecord] = useState<OvertimeRecord | null>(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/api/hrm/overtime/');
            setRecords(res.data.results || (Array.isArray(res.data) ? res.data : []));
            setError(null);
        } catch (err: any) {
            setError(err.message || 'Failed to load overtime records');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleStatusChange = async (id: string, action: 'approve' | 'reject') => {
        try {
            const status = action === 'approve' ? 'APPROVED' : 'REJECTED';
            await apiClient.patch(`/api/hrm/overtime/${id}/`, { status });
            fetchData();
        } catch (err: any) {
            alert('Failed to update status: ' + (err.response?.data?.detail || err.message));
        }
    };

    const columns: Column<OvertimeRecord>[] = [
        { key: 'Employee', header: 'Employee', render: (r: OvertimeRecord) => r.employee_name || r.employee },
        { key: 'Date', header: 'Date', render: (r: OvertimeRecord) => r.date },
        { key: 'Hours', header: 'Hours', render: (r: OvertimeRecord) => r.hours },
        { key: 'Status', header: 'Status', render: (r: OvertimeRecord) => (
            <Badge variant={r.status === 'APPROVED' ? 'success' : r.status === 'PENDING' ? 'warning' : r.status === 'REJECTED' ? 'danger' : 'default'}>{r.status}</Badge>
        )},
        { key: 'Reason', header: 'Reason', render: (r: OvertimeRecord) => r.reason || '—' },
        { key: 'actions', header: 'Actions', render: (r: OvertimeRecord) => (
            <div style={{ display: 'flex', gap: '8px' }}>
                {r.status === 'PENDING' && (
                    <>
                        <Button variant="primary" onClick={() => handleStatusChange(r.id, 'approve')}>Approve</Button>
                        <Button variant="secondary" onClick={() => handleStatusChange(r.id, 'reject')}>Reject</Button>
                    </>
                )}
                {r.status === 'PENDING' && (
                    <Button variant="secondary" onClick={() => { setSelectedRecord(r); setIsModalOpen(true); }}>Edit</Button>
                )}
                {r.status !== 'PENDING' && (
                    <Button variant="secondary" onClick={() => { setSelectedRecord(r); setIsModalOpen(true); }}>View</Button>
                )}
            </div>
        )}
    ];

    if (loading) return <LoadingState message="Loading overtime records..." />;
    if (error) return <ErrorState message={error} onRetry={fetchData} />;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Overtime Records</h3>
                <Button variant="primary" onClick={() => { setSelectedRecord(null); setIsModalOpen(true); }}>Add Overtime</Button>
            </div>
            <DataTable columns={columns} data={records} keyExtractor={(item: any) => item.id} />
            
            {isModalOpen && (
                <OvertimeModal 
                    isOpen={isModalOpen} 
                    onClose={() => setIsModalOpen(false)} 
                    onSave={fetchData} 
                    record={selectedRecord} 
                />
            )}
        </div>
    );
};
