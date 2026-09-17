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
import { DeploymentTransferModal } from './DeploymentTransferModal';
import { DeploymentRelieveModal } from './DeploymentRelieveModal';
import { DeploymentHistoryModal } from './DeploymentHistoryModal';

const STATUS_VARIANT: Record<string, 'success' | 'danger' | 'default' | 'primary'> = {
    DRAFT: 'default',
    PLANNED: 'primary',
    ACTIVE: 'success',
    COMPLETED: 'default',
    RELIEVED: 'default',
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

    // Edit/Create Modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedDeployment, setSelectedDeployment] = useState<Deployment | null>(null);

    // Transfer Modal
    const [isTransferOpen, setIsTransferOpen] = useState(false);
    const [transferId, setTransferId] = useState<string | null>(null);
    const [transferEmpName, setTransferEmpName] = useState<string>('');

    // Relieve Modal
    const [isRelieveOpen, setIsRelieveOpen] = useState(false);
    const [relieveId, setRelieveId] = useState<string | null>(null);
    const [relieveEmpName, setRelieveEmpName] = useState<string>('');

    // History Modal
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [historyEmpId, setHistoryEmpId] = useState<string | null>(null);
    const [historyEmpName, setHistoryEmpName] = useState<string>('');

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
        { 
            key: 'employee_name', 
            header: 'Employee', 
            render: (row) => (
                <div>
                    <div style={{ fontWeight: 600 }}>{row.employee_name || '—'}</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                        {row.employee_code ? `${row.employee_code} • ` : ''}{row.employee_classification || 'DIRECT'}
                    </div>
                </div>
            ) 
        },
        { 
            key: 'site_name', 
            header: 'Site & Post', 
            render: (row) => (
                <div>
                    <div>{row.site_name || '—'}</div>
                    {row.post_name && <div style={{ fontSize: '11px', color: 'var(--color-primary)' }}>Post: {row.post_name}</div>}
                </div>
            ) 
        },
        { key: 'designation_name', header: 'Designation', render: (row) => row.designation_name || '—' },
        { 
            key: 'assignment_type', 
            header: 'Type', 
            render: (row) => (
                <Badge variant={row.assignment_type === 'PERMANENT' ? 'primary' : 'default'}>
                    {row.assignment_type || 'PERMANENT'}
                </Badge>
            ) 
        },
        { 
            key: 'start_date', 
            header: 'Period', 
            render: (row) => (
                <div style={{ fontSize: '12px' }}>
                    <div>From: {row.start_date}</div>
                    <div style={{ color: 'var(--color-text-muted)' }}>To: {row.end_date || 'Ongoing'}</div>
                </div>
            ) 
        },
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
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {row.status === 'ACTIVE' && (
                        <>
                            <button
                                style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontWeight: 600, cursor: 'pointer', fontSize: '12px' }}
                                onClick={() => {
                                    setTransferId(row.id);
                                    setTransferEmpName(row.employee_name || 'Guard');
                                    setIsTransferOpen(true);
                                }}
                            >
                                Transfer
                            </button>
                            <button
                                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '12px' }}
                                onClick={() => {
                                    setRelieveId(row.id);
                                    setRelieveEmpName(row.employee_name || 'Guard');
                                    setIsRelieveOpen(true);
                                }}
                            >
                                Relieve
                            </button>
                        </>
                    )}
                    <button
                        style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '12px' }}
                        onClick={() => {
                            setHistoryEmpId(row.employee);
                            setHistoryEmpName(row.employee_name || 'Employee');
                            setIsHistoryOpen(true);
                        }}
                    >
                        History
                    </button>
                    <button
                        style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '12px' }}
                        onClick={() => { setSelectedDeployment(row); setIsModalOpen(true); }}
                    >
                        Edit
                    </button>
                </div>
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
                        className="input-base"
                        style={{ width: '150px' }}
                    >
                        <option value="">All Statuses</option>
                        <option value="ACTIVE">Active</option>
                        <option value="RELIEVED">Relieved</option>
                        <option value="PLANNED">Planned</option>
                        <option value="DRAFT">Draft</option>
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
                    emptyMessage={searchQuery ? "No deployments match your search." : "No deployments recorded yet."}
                    pagination={data ? {
                        page: page,
                        pageSize: 10,
                        totalItems: data.count,
                        onPageChange: (newPage) => setPage(newPage)
                    } : undefined}
                />
            </div>

            {/* Edit / Create Modal */}
            <DeploymentModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={fetchDeployments}
                deployment={selectedDeployment}
            />

            {/* Transfer Modal */}
            <DeploymentTransferModal
                isOpen={isTransferOpen}
                onClose={() => setIsTransferOpen(false)}
                deploymentId={transferId}
                employeeName={transferEmpName}
                onTransferred={fetchDeployments}
            />

            {/* Relieve Modal */}
            <DeploymentRelieveModal
                isOpen={isRelieveOpen}
                onClose={() => setIsRelieveOpen(false)}
                deploymentId={relieveId}
                employeeName={relieveEmpName}
                onRelieved={fetchDeployments}
            />

            {/* History Modal */}
            <DeploymentHistoryModal
                isOpen={isHistoryOpen}
                onClose={() => setIsHistoryOpen(false)}
                employeeId={historyEmpId}
                employeeName={historyEmpName}
            />
        </div>
    );
};
