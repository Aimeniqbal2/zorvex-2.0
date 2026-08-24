import React, { useEffect, useState, useCallback } from 'react';
import { getServiceContracts } from '../api';
import type { ServiceContract, PaginatedResponse } from '../types';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { Badge } from '../../../components/ui/Badge';
import { Input } from '../../../components/ui/Input';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Button } from '../../../components/ui/Button';
import { ContractModal } from './ContractModal';

export const ContractsView: React.FC = () => {
    const [page, setPage] = useState(1);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    
    const [data, setData] = useState<PaginatedResponse<ServiceContract> | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedContract, setSelectedContract] = useState<ServiceContract | null>(null);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(searchQuery);
            setPage(1);
        }, 400);
        return () => clearTimeout(handler);
    }, [searchQuery]);

    const fetchContracts = useCallback(async () => {
        setIsLoading(true);
        setHasError(false);
        try {
            const response = await getServiceContracts({ page, search: debouncedSearch });
            setData(response);
        } catch (err) {
            setHasError(true);
        } finally {
            setIsLoading(false);
        }
    }, [page, debouncedSearch]);

    useEffect(() => {
        fetchContracts();
    }, [fetchContracts]);

    const columns: Column<ServiceContract>[] = [
        { key: 'contract_code', header: 'Contract Code' },
        { key: 'customer_name', header: 'Customer', render: (row: ServiceContract) => row.customer_name || 'N/A' },
        { key: 'start_date', header: 'Start Date' },
        { key: 'end_date', header: 'End Date', render: (row: ServiceContract) => row.end_date || '-' },
                { 
            key: 'status', 
            header: 'Status',
            render: (row: ServiceContract) => {
                if (row.status === 'ACTIVE') return <Badge variant="success">Active</Badge>;
                if (row.status === 'DRAFT') return <Badge variant="default">Draft</Badge>;
                if (row.status === 'TERMINATED') return <Badge variant="danger">Terminated</Badge>;
                if (row.status === 'COMPLETED') return <Badge variant="primary">Completed</Badge>;
                return <Badge>{row.status}</Badge>;
            }
        },
        { key: 'sites_count', header: 'Sites', render: (row: ServiceContract) => row.sites ? row.sites.length : 0 },
        {
            key: 'actions',
            header: 'Actions',
            render: (row: ServiceContract) => (
                <button 
                    onClick={() => { setSelectedContract(row); setIsModalOpen(true); }}
                    className="text-blue-600 hover:text-blue-800"
                >
                    Edit
                </button>
            )
        }
    ];

    if (hasError && !data) {
        return <ErrorState message="Failed to load contracts." onRetry={fetchContracts} />;
    }

    return (
        <div className="view-container">
            <div className="view-toolbar flex justify-between items-center mb-4">
                <Input 
                    placeholder="Search contracts..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ width: '300px' }}
                />
                <Button variant="primary" onClick={() => { setSelectedContract(null); setIsModalOpen(true); }}>
                    New Contract
                </Button>
            </div>

            <div className="view-table-container">
                <DataTable<ServiceContract>
                    data={data?.results || []}
                    columns={columns}
                    isLoading={isLoading}
                    keyExtractor={(row) => row.id}
                    emptyMessage={searchQuery ? "No contracts match your search." : "No service contracts yet."}
                    pagination={data ? {
                        page: page,
                        pageSize: 10,
                        totalItems: data.count,
                        onPageChange: (newPage) => setPage(newPage)
                    } : undefined}
                />
            </div>

            <ContractModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={fetchContracts}
                contract={selectedContract}
            />
        </div>
    );
};
