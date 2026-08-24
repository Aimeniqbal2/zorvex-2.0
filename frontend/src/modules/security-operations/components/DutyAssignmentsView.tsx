import React, { useEffect, useState, useCallback } from 'react';
import { getDutyAssignments } from '../api';
import type { DutyAssignment, PaginatedResponse } from '../types';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { ErrorState } from '../../../components/ui/ErrorState';
import { DutyAssignmentModal } from './DutyAssignmentModal';
import { apiClient } from '../api';

const STATUS_VARIANT: Record<string, 'success' | 'danger' | 'default' | 'primary'> = {
    SCHEDULED: 'default',
    IN_PROGRESS: 'primary',
    COMPLETED: 'success',
    ABSENT: 'danger',
    CANCELLED: 'danger',
};

export const DutyAssignmentsView: React.FC = () => {
    const [page, setPage] = useState(1);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [dateFilter, setDateFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    const [data, setData] = useState<PaginatedResponse<DutyAssignment> | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedDuty, setSelectedDuty] = useState<DutyAssignment | null>(null);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(searchQuery);
            setPage(1);
        }, 400);
        return () => clearTimeout(handler);
    }, [searchQuery]);

    const fetchDuties = useCallback(async () => {
        setIsLoading(true);
        setHasError(false);
        try {
            const params: Record<string, string | number> = { page };
            if (debouncedSearch) params.search = debouncedSearch;
            if (dateFilter) params.date = dateFilter;
            if (statusFilter) params.status = statusFilter;
            const response = await getDutyAssignments(params as any);
            setData(response);
        } catch {
            setHasError(true);
        } finally {
            setIsLoading(false);
        }
    }, [page, debouncedSearch, dateFilter, statusFilter]);

    useEffect(() => { fetchDuties(); }, [fetchDuties]);

    const handleSyncAttendance = async (dutyId: string) => {
        try {
            const res = await apiClient.post(`/api/operations/duty-assignments/${dutyId}/sync-attendance/`);
            alert(res.data.message || 'Attendance synced.');
            fetchDuties();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Sync failed.');
        }
    };

    const columns: Column<DutyAssignment>[] = [
        { key: 'employee_name', header: 'Employee', render: (row) => row.employee_name || '—' },
        { key: 'site_name', header: 'Site', render: (row) => row.site_name || '—' },
        { key: 'date', header: 'Date' },
        { key: 'start_time', header: 'Start' },
        { key: 'end_time', header: 'End' },
        {
            key: 'status',
            header: 'Status',
            render: (row) => (
                <Badge variant={STATUS_VARIANT[row.status] || 'default'}>
                    {row.status.replace('_', ' ')}
                </Badge>
            )
        },
        {
            key: 'actions',
            header: 'Actions',
            render: (row) => (
                <div className="flex gap-2 items-center">
                    <button
                        className="text-blue-600 hover:underline text-sm"
                        onClick={() => { setSelectedDuty(row); setIsModalOpen(true); }}
                    >Edit</button>
                    {row.status === 'COMPLETED' && (
                        <button
                            className="text-green-600 hover:underline text-sm"
                            onClick={() => handleSyncAttendance(row.id)}
                        >Sync ✓</button>
                    )}
                </div>
            )
        }
    ];

    if (hasError && !data) {
        return <ErrorState message="Failed to load duty assignments." onRetry={fetchDuties} />;
    }

    return (
        <div className="view-container">
            <div className="view-toolbar flex flex-wrap justify-between items-center gap-2 mb-4">
                <div className="flex flex-wrap gap-2 items-center">
                    <Input
                        placeholder="Search duties..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{ width: '200px' }}
                    />
                    <input
                        type="date"
                        value={dateFilter}
                        onChange={e => { setDateFilter(e.target.value); setPage(1); }}
                        className="border rounded p-2 text-sm"
                        title="Filter by date"
                    />
                    <select
                        value={statusFilter}
                        onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                        className="border rounded p-2 text-sm"
                    >
                        <option value="">All Statuses</option>
                        <option value="SCHEDULED">Scheduled</option>
                        <option value="IN_PROGRESS">In Progress</option>
                        <option value="COMPLETED">Completed</option>
                        <option value="ABSENT">Absent</option>
                        <option value="CANCELLED">Cancelled</option>
                    </select>
                </div>
                <Button variant="primary" icon="bx-plus" onClick={() => { setSelectedDuty(null); setIsModalOpen(true); }}>
                    New Duty
                </Button>
            </div>

            <div className="view-table-container">
                <DataTable<DutyAssignment>
                    data={data?.results || []}
                    columns={columns}
                    isLoading={isLoading}
                    keyExtractor={(row) => row.id}
                    emptyMessage={searchQuery ? 'No duty assignments match your search.' : 'No duty assignments yet.'}
                    pagination={data ? {
                        page,
                        pageSize: 10,
                        totalItems: data.count,
                        onPageChange: setPage
                    } : undefined}
                />
            </div>

            <DutyAssignmentModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={fetchDuties}
                assignment={selectedDuty}
            />
        </div>
    );
};
