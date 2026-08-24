import React, { useEffect, useState, useCallback } from 'react';
import { getDailyActivityReports } from '../api';
import type { DailyActivityReport, PaginatedResponse } from '../types';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { ErrorState } from '../../../components/ui/ErrorState';
import { DailyActivityReportModal } from './DailyActivityReportModal';
import { DailyActivityDetail } from './DailyActivityDetail';

const STATUS_VARIANT: Record<string, 'success' | 'danger' | 'default' | 'primary' | 'warning'> = {
    DRAFT: 'default',
    SUBMITTED: 'warning',
    REVIEWED: 'success',
};

export const DailyActivityReportsView: React.FC = () => {
    const [page, setPage] = useState(1);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [dateFilter, setDateFilter] = useState('');
    
    const [data, setData] = useState<PaginatedResponse<DailyActivityReport> | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [detailReportId, setDetailReportId] = useState<string | null>(null);

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
            const response = await getDailyActivityReports({
                page,
                search: debouncedSearch || undefined,
                status: statusFilter || undefined,
                report_date: dateFilter || undefined
            });
            setData(response);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Failed to fetch DARs'));
        } finally {
            setLoading(false);
        }
    }, [page, debouncedSearch, statusFilter, dateFilter]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const columns: Column<DailyActivityReport>[] = [
        {
            key: 'report_date',
            header: 'Date',
            render: (row) => (
                <button 
                    onClick={() => setDetailReportId(row.id)}
                    className="text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium"
                >
                    {row.report_date}
                </button>
            )
        },
        { key: 'site_name', header: 'Site', render: (row) => row.site_name },
        { key: 'prepared_by_name', header: 'Prepared By', render: (row) => row.prepared_by_name },
        { 
            key: 'shift_start', 
            header: 'Shift', 
            render: (row) => {
                const s = new Date(row.shift_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const e = new Date(row.shift_end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return `${s} - ${e}`;
            }
        },
        { 
            key: 'entries', 
            header: 'Entries',
            render: (row) => Array.isArray(row.entries) ? row.entries.length : 0 
        },
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

    if (detailReportId) {
        return <DailyActivityDetail reportId={detailReportId} onBack={() => {
            setDetailReportId(null);
            fetchData();
        }} />;
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between gap-4">
                <div className="flex flex-1 flex-col sm:flex-row gap-4">
                    <Input
                        placeholder="Search summaries..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="max-w-xs"
                    />
                    <Input
                        type="date"
                        value={dateFilter}
                        onChange={(e) => { setDateFilter(e.target.value); setPage(1); }}
                        className="w-40"
                    />
                    <select
                        className="h-10 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={statusFilter}
                        onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                    >
                        <option value="">All Statuses</option>
                        <option value="DRAFT">Draft</option>
                        <option value="SUBMITTED">Submitted</option>
                        <option value="REVIEWED">Reviewed</option>
                    </select>
                </div>
                <Button onClick={() => setIsCreateModalOpen(true)}>
                    Create DAR
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
                <DailyActivityReportModal
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
