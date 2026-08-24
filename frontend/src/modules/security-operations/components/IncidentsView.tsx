import React, { useEffect, useState, useCallback } from 'react';
import { getIncidents } from '../api';
import type { IncidentReport, PaginatedResponse } from '../types';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { ErrorState } from '../../../components/ui/ErrorState';
import { IncidentReportModal } from './IncidentReportModal';
import { IncidentDetail } from './IncidentDetail';

const STATUS_VARIANT: Record<string, 'success' | 'danger' | 'default' | 'primary'> = {
    OPEN: 'danger',
    UNDER_REVIEW: 'primary',
    RESOLVED: 'success',
    CLOSED: 'default',
};

const SEVERITY_VARIANT: Record<string, 'success' | 'danger' | 'default' | 'warning'> = {
    LOW: 'default',
    MEDIUM: 'warning',
    HIGH: 'danger',
    CRITICAL: 'danger',
};

export const IncidentsView: React.FC = () => {
    const [page, setPage] = useState(1);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [severityFilter, setSeverityFilter] = useState('');
    
    const [data, setData] = useState<PaginatedResponse<IncidentReport> | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [detailIncidentId, setDetailIncidentId] = useState<string | null>(null);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(searchQuery);
            setPage(1);
        }, 500);
        return () => clearTimeout(handler);
    }, [searchQuery]);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const response = await getIncidents({
                page,
                search: debouncedSearch || undefined,
                status: statusFilter || undefined,
                severity: severityFilter || undefined
            });
            setData(response);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Failed to fetch incidents'));
        } finally {
            setLoading(false);
        }
    }, [page, debouncedSearch, statusFilter, severityFilter]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const columns: Column<IncidentReport>[] = [
        {
            key: 'incident_number',
            header: 'Incident No.',
            render: (row) => (
                <button 
                    onClick={() => setDetailIncidentId(row.id)}
                    className="text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium"
                >
                    {row.incident_number}
                </button>
            )
        },
        { key: 'occurred_at', header: 'Date & Time', render: (row) => new Date(row.occurred_at).toLocaleString() },
        { key: 'site_name', header: 'Site', render: (row) => row.site_name },
        { key: 'title', header: 'Title', render: (row) => row.title },
        { key: 'incident_type', header: 'Type', render: (row) => row.incident_type },
        { 
            key: 'severity', 
            header: 'Severity',
            render: (row) => (
                <Badge variant={SEVERITY_VARIANT[row.severity] || 'default'}>
                    {row.severity.replace('_', ' ')}
                </Badge>
            )
        },
        { key: 'employee_name', header: 'Reported By', render: (row) => row.employee_name },
        { 
            key: 'status', 
            header: 'Status',
            render: (row) => (
                <Badge variant={STATUS_VARIANT[row.status] || 'default'}>
                    {row.status.replace('_', ' ')}
                </Badge>
            )
        }
    ];

    if (error) return <ErrorState message={error.message} onRetry={fetchData} />;

    if (detailIncidentId) {
        return <IncidentDetail incidentId={detailIncidentId} onBack={() => {
            setDetailIncidentId(null);
            fetchData();
        }} />;
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between gap-4">
                <div className="flex flex-1 flex-col sm:flex-row gap-4">
                    <Input
                        placeholder="Search incidents..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="max-w-xs"
                    />
                    <select
                        className="h-10 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={statusFilter}
                        onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                    >
                        <option value="">All Statuses</option>
                        <option value="OPEN">Open</option>
                        <option value="UNDER_REVIEW">Under Review</option>
                        <option value="RESOLVED">Resolved</option>
                        <option value="CLOSED">Closed</option>
                    </select>
                    <select
                        className="h-10 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={severityFilter}
                        onChange={(e) => { setSeverityFilter(e.target.value); setPage(1); }}
                    >
                        <option value="">All Severities</option>
                        <option value="LOW">Low</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="HIGH">High</option>
                        <option value="CRITICAL">Critical</option>
                    </select>
                </div>
                <Button onClick={() => setIsCreateModalOpen(true)}>
                    Report Incident
                </Button>
            </div>

            <DataTable
                keyExtractor={(row) => row.id}
                columns={columns as any}
                data={data?.results || []}
                isLoading={loading}
                pagination={{
                    page,
                    pageSize: 10,
                    onPageChange: setPage,
                    totalItems: data?.count || 0
                }}
            />

            {isCreateModalOpen && (
                <IncidentReportModal
                    onClose={() => setIsCreateModalOpen(false)}
                    onSuccess={() => {
                        setIsCreateModalOpen(false);
                        fetchData();
                    }}
                />
            )}
        </div>
    );
};
