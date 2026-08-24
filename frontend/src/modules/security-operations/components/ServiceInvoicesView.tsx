import React, { useEffect, useState, useCallback } from 'react';
import { getServiceInvoices } from '../api';
import type { ServiceInvoice, PaginatedResponse } from '../types';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { ErrorState } from '../../../components/ui/ErrorState';
import { GenerateInvoiceModal } from './GenerateInvoiceModal';
import { ServiceInvoiceDetail } from './ServiceInvoiceDetail';

const STATUS_VARIANT: Record<string, 'success' | 'danger' | 'default' | 'primary'> = {
    DRAFT: 'default',
    POSTED: 'success',
    CANCELLED: 'danger',
};

const PAYMENT_STATUS_VARIANT: Record<string, 'success' | 'danger' | 'default' | 'warning'> = {
    UNPAID: 'danger',
    PARTIALLY_PAID: 'warning',
    PAID: 'success',
};

export const ServiceInvoicesView: React.FC = () => {
    const [page, setPage] = useState(1);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [data, setData] = useState<PaginatedResponse<ServiceInvoice> | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
    const [detailInvoiceId, setDetailInvoiceId] = useState<string | null>(null);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchQuery), 500);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await getServiceInvoices({
                page,
                search: debouncedSearch || undefined,
                status: statusFilter || undefined,
            });
            setData(result);
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Failed to load invoices'));
        } finally {
            setLoading(false);
        }
    }, [page, debouncedSearch, statusFilter]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const columns: Column<ServiceInvoice>[] = [
        {
            key: 'invoice_number',
            header: 'Invoice No.',
            render: (row) => (
                <button 
                    onClick={() => setDetailInvoiceId(row.id)}
                    className="text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium"
                >
                    {row.invoice_number || 'DRAFT'}
                </button>
            )
        },
        { key: 'customer_name', header: 'Customer', render: (row) => row.customer_name },
        { key: 'contract_code', header: 'Contract', render: (row) => row.contract_code },
        { 
            key: 'period', 
            header: 'Billing Period', 
            render: (row) => `${row.period_start} to ${row.period_end}`
        },
        { 
            key: 'total_amount', 
            header: 'Total', 
            render: (row) => Number(row.total_amount).toLocaleString()
        },
        { 
            key: 'status', 
            header: 'Status',
            render: (row) => (
                <Badge variant={STATUS_VARIANT[row.status] || 'default'}>
                    {row.status}
                </Badge>
            )
        },
        { 
            key: 'payment_status', 
            header: 'Payment',
            render: (row) => (
                <Badge variant={PAYMENT_STATUS_VARIANT[row.payment_status] || 'default'}>
                    {row.payment_status.replace('_', ' ')}
                </Badge>
            )
        }
    ];

    if (error) return <ErrorState message={error.message} onRetry={fetchData} />;

    if (detailInvoiceId) {
        return <ServiceInvoiceDetail invoiceId={detailInvoiceId} onBack={() => {
            setDetailInvoiceId(null);
            fetchData();
        }} />;
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <div className="flex gap-4 flex-1 max-w-2xl">
                    <div className="flex-1">
                        <Input
                            placeholder="Search invoices..."
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setPage(1);
                            }}
                        />
                    </div>
                    <select
                        className="border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={statusFilter}
                        onChange={(e) => {
                            setStatusFilter(e.target.value);
                            setPage(1);
                        }}
                    >
                        <option value="">All Statuses</option>
                        <option value="DRAFT">Draft</option>
                        <option value="POSTED">Posted</option>
                        <option value="CANCELLED">Cancelled</option>
                    </select>
                </div>
                <Button onClick={() => setIsGenerateModalOpen(true)}>
                    Generate Invoice
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

            {isGenerateModalOpen && (
                <GenerateInvoiceModal 
                    onClose={() => setIsGenerateModalOpen(false)}
                    onSuccess={() => {
                        setIsGenerateModalOpen(false);
                        fetchData();
                    }}
                />
            )}
        </div>
    );
};
