import React, { useEffect, useState, useCallback } from 'react';
import { getDeployments } from '../api';
import type { Deployment, PaginatedResponse } from '../types';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { ErrorState } from '../../../components/ui/ErrorState';
import { DeploymentModal } from './DeploymentModal';

const STATUS_VARIANT: Record<string, 'success' | 'danger' | 'default' | 'primary'> = {
    DRAFT: 'default',
    PLANNED: 'primary',
    ACTIVE: 'success',
    COMPLETED: 'default',
    CANCELLED: 'danger',
};

export const DeploymentsView: React.FC = () => {
    const [page, setPage] = useState(1);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    const [data, setData] = useState<PaginatedResponse<Deployment> | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedDeployment, setSelectedDeployment] = useState<Deployment | null>(null);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(searchQuery);
            setPage(1);
        }, 400);
        return () => clearTimeout(handler);
    }, [searchQuery]);

    const fetchDeployments = useCallback(async () => {
        setIsLoading(true);
        setHasError(false);
        try {
            const response = await getDeployments({ page, search: debouncedSearch, status: statusFilter });
            setData(response);
        } catch {
            setHasError(true);
        } finally {
            setIsLoading(false);
        }
    }, [page, debouncedSearch, statusFilter]);

    useEffect(() => { fetchDeployments(); }, [fetchDeployments]);

    const columns: Column<Deployment>[] = [
        { key: 'employee_name', header: 'Employee', render: (row) => row.employee_name || '—' },
        { key: 'site_name', header: 'Site', render: (row) => row.site_name || '—' },
        { key: 'designation_name', header: 'Designation', render: (row) => row.designation_name || '—' },
        { key: 'contract_code', header: 'Contract', render: (row) => row.contract_code || '—' },
        { key: 'start_date', header: 'Start' },
        { key: 'end_date', header: 'End', render: (row) => row.end_date || '—' },
        {
            key: 'status',
            header: 'Status',
            render: (row) => (
                <Badge variant={STATUS_VARIANT[row.status] || 'default'}>
                    {row.status.charAt(0) + row.status.slice(1).toLowerCase()}
                </Badge>
            )
        },
        {
            key: 'actions',
            header: 'Actions',
            render: (row) => (
                <button
                    className="text-blue-600 hover:underline text-sm"
                    onClick={() => { setSelectedDeployment(row); setIsModalOpen(true); }}
                >Edit</button>
            )
        }
    ];

    if (hasError && !data) {
        return <ErrorState message="Failed to load deployments." onRetry={fetchDeployments} />;
    }

    return (
        <div className="view-container">
            <div className="view-toolbar flex flex-wrap justify-between items-center gap-2 mb-4">
                <div className="flex gap-2 items-center">
                    <Input
                        placeholder="Search deployments..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{ width: '240px' }}
                    />
                    <select
                        value={statusFilter}
                        onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                        className="border rounded p-2 text-sm"
                    >
                        <option value="">All Statuses</option>
                        <option value="DRAFT">Draft</option>
                        <option value="PLANNED">Planned</option>
                        <option value="ACTIVE">Active</option>
                        <option value="COMPLETED">Completed</option>
                        <option value="CANCELLED">Cancelled</option>
                    </select>
                </div>
                <Button variant="primary" icon="bx-plus" onClick={() => { setSelectedDeployment(null); setIsModalOpen(true); }}>
                    New Deployment
                </Button>
            </div>

            <div className="view-table-container">
                <DataTable<Deployment>
                    data={data?.results || []}
                    columns={columns}
                    isLoading={isLoading}
                    keyExtractor={(row) => row.id}
                    emptyMessage={searchQuery ? 'No deployments match your search.' : 'No deployments yet. Create your first deployment.'}
                    pagination={data ? {
                        page,
                        pageSize: 10,
                        totalItems: data.count,
                        onPageChange: setPage
                    } : undefined}
                />
            </div>

            <DeploymentModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={fetchDeployments}
                deployment={selectedDeployment}
            />
        </div>
    );
};
