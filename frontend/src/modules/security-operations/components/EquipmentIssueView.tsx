import React, { useEffect, useState, useCallback } from 'react';
import { getEquipmentIssues } from '../api';
import type { EquipmentIssue, PaginatedResponse } from '../types';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { Badge } from '../../../components/ui/Badge';
import { Input } from '../../../components/ui/Input';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Button } from '../../../components/ui/Button';
import { EquipmentIssueModal } from './EquipmentIssueModal';
import { EquipmentReturnModal } from './EquipmentReturnModal';

export const EquipmentIssueView: React.FC = () => {
    const [page, setPage] = useState(1);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    
    const [data, setData] = useState<PaginatedResponse<EquipmentIssue> | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    
    const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
    const [returnModalIssue, setReturnModalIssue] = useState<EquipmentIssue | null>(null);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(searchQuery);
            setPage(1);
        }, 400);
        return () => clearTimeout(handler);
    }, [searchQuery]);

    const fetchIssues = useCallback(async () => {
        setIsLoading(true);
        setHasError(false);
        try {
            const response = await getEquipmentIssues({ page, search: debouncedSearch, status: statusFilter || undefined });
            setData(response);
        } catch (err) {
            setHasError(true);
        } finally {
            setIsLoading(false);
        }
    }, [page, debouncedSearch, statusFilter]);

    useEffect(() => {
        fetchIssues();
    }, [fetchIssues]);

    const getStatusVariant = (status: string) => {
        switch (status) {
            case 'ISSUED': return 'warning';
            case 'RETURNED': return 'success';
            case 'LOST': return 'danger';
            case 'DAMAGED': return 'danger';
            default: return 'default';
        }
    };

    const columns: Column<EquipmentIssue>[] = [
        { key: 'employee_name', header: 'Employee' },
        { key: 'item_name', header: 'Item' },
        { key: 'serial_number', header: 'Serial No', render: (row: EquipmentIssue) => row.serial_number || '-' },
        { key: 'quantity', header: 'Qty', render: (row: EquipmentIssue) => Number(row.quantity).toFixed(2) },
        { key: 'issued_at', header: 'Issued At', render: (row: EquipmentIssue) => new Date(row.issued_at).toLocaleString() },
        { key: 'warehouse_name', header: 'Warehouse' },
        { 
            key: 'status', 
            header: 'Status',
            render: (row: EquipmentIssue) => <Badge variant={getStatusVariant(row.status) as any}>{row.status}</Badge>
        },
        {
            key: 'actions',
            header: 'Actions',
            render: (row: EquipmentIssue) => (
                row.status === 'ISSUED' ? (
                    <button 
                        onClick={() => setReturnModalIssue(row)}
                        className="text-blue-600 hover:text-blue-800"
                    >
                        Return
                    </button>
                ) : null
            )
        }
    ];

    if (hasError && !data) {
        return <ErrorState message="Failed to load equipment issues." onRetry={fetchIssues} />;
    }

    return (
        <div className="view-container">
            <div className="view-toolbar flex justify-between items-center mb-4 gap-4">
                <div className="flex items-center gap-4">
                    <Input 
                        placeholder="Search employee or item..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{ width: '300px' }}
                    />
                    <select 
                        value={statusFilter}
                        onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                        className="p-2 border rounded border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                    >
                        <option value="">All Statuses</option>
                        <option value="ISSUED">Issued</option>
                        <option value="RETURNED">Returned</option>
                        <option value="LOST">Lost</option>
                        <option value="DAMAGED">Damaged</option>
                    </select>
                </div>
                
                <Button variant="primary" onClick={() => setIsIssueModalOpen(true)}>
                    Issue Equipment
                </Button>
            </div>

            <div className="view-table-container">
                <DataTable<EquipmentIssue>
                    data={data?.results || []}
                    columns={columns}
                    isLoading={isLoading}
                    keyExtractor={(row) => row.id}
                    emptyMessage={searchQuery || statusFilter ? "No equipment issues match your search." : "No equipment issues yet."}
                    pagination={data ? {
                        page: page,
                        pageSize: 10,
                        totalItems: data.count,
                        onPageChange: (newPage) => setPage(newPage)
                    } : undefined}
                />
            </div>

            <EquipmentIssueModal 
                isOpen={isIssueModalOpen}
                onClose={() => setIsIssueModalOpen(false)}
                onSave={fetchIssues}
            />

            {returnModalIssue && (
                <EquipmentReturnModal
                    isOpen={!!returnModalIssue}
                    issue={returnModalIssue}
                    onClose={() => setReturnModalIssue(null)}
                    onSave={() => {
                        setReturnModalIssue(null);
                        fetchIssues();
                    }}
                />
            )}
        </div>
    );
};
