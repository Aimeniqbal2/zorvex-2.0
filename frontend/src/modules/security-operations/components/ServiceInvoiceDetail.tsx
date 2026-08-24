import React, { useState, useEffect } from 'react';
import { getServiceInvoice, postServiceInvoice, cancelServiceInvoice } from '../api';
import type { ServiceInvoice } from '../types';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Card } from '../../../components/ui/Card';
import { DataTable } from '../../../components/tables/DataTable';

interface ServiceInvoiceDetailProps {
    invoiceId: string;
    onBack: () => void;
}

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

export const ServiceInvoiceDetail: React.FC<ServiceInvoiceDetailProps> = ({ invoiceId, onBack }) => {
    const [invoice, setInvoice] = useState<ServiceInvoice | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);

    const fetchInvoice = async () => {
        setLoading(true);
        try {
            const data = await getServiceInvoice(invoiceId);
            setInvoice(data);
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Failed to load invoice'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchInvoice();
    }, [invoiceId]);

    const handlePost = async () => {
        if (!confirm('Are you sure you want to POST this invoice? This will create a financial journal entry.')) return;
        
        setActionLoading(true);
        setActionError(null);
        try {
            await postServiceInvoice(invoiceId);
            await fetchInvoice();
        } catch (err: any) {
            setActionError(err?.response?.data?.error || err.message || 'Failed to post invoice');
        } finally {
            setActionLoading(false);
        }
    };

    const handleCancel = async () => {
        if (!confirm('Are you sure you want to CANCEL this invoice? This cannot be undone.')) return;
        
        setActionLoading(true);
        setActionError(null);
        try {
            await cancelServiceInvoice(invoiceId);
            await fetchInvoice();
        } catch (err: any) {
            setActionError(err?.response?.data?.error || err.message || 'Failed to cancel invoice');
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-gray-500">Loading invoice details...</div>;
    if (error) return <ErrorState message={error.message} onRetry={fetchInvoice} />;
    if (!invoice) return <div className="p-8 text-center text-gray-500">Invoice not found.</div>;

    const lineColumns = [
        { key: 'description', header: 'Description', render: (row: any) => row.description },
        { key: 'site_name', header: 'Site', render: (row: any) => row.site_name || '-' },
        { key: 'designation_name', header: 'Designation', render: (row: any) => row.designation_name || '-' },
        { key: 'quantity', header: 'Qty', render: (row: any) => Number(row.quantity).toLocaleString() },
        { key: 'unit_price', header: 'Rate', render: (row: any) => Number(row.unit_price).toLocaleString() },
        { key: 'total_amount', header: 'Amount', render: (row: any) => Number(row.total_amount).toLocaleString() },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="secondary" onClick={onBack}>
                        <i className="bx bx-arrow-back mr-2"></i> Back
                    </Button>
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                            Invoice {invoice.invoice_number || '(Draft)'}
                            <Badge variant={STATUS_VARIANT[invoice.status]}>{invoice.status}</Badge>
                            {invoice.status === 'POSTED' && (
                                <Badge variant={PAYMENT_STATUS_VARIANT[invoice.payment_status]}>
                                    {invoice.payment_status.replace('_', ' ')}
                                </Badge>
                            )}
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            {invoice.customer_name} • Contract {invoice.contract_code}
                        </p>
                    </div>
                </div>
                
                <div className="flex gap-2">
                    {invoice.status === 'DRAFT' && (
                        <>
                            <Button variant="danger" onClick={handleCancel} disabled={actionLoading}>
                                Cancel Invoice
                            </Button>
                            <Button onClick={handlePost} disabled={actionLoading}>
                                Post Invoice
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {actionError && (
                <div className="p-4 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 rounded-lg text-sm">
                    {actionError}
                </div>
            )}

            {/* Info Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                    <div className="p-4">
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Billing Period</p>
                        <p className="font-medium text-gray-900 dark:text-white">
                            {invoice.period_start} to {invoice.period_end}
                        </p>
                    </div>
                </Card>
                <Card>
                    <div className="p-4">
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total Amount</p>
                        <p className="font-medium text-gray-900 dark:text-white">
                            ${Number(invoice.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </p>
                    </div>
                </Card>
                <Card>
                    <div className="p-4">
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Paid Amount</p>
                        <p className="font-medium text-gray-900 dark:text-white">
                            ${Number(invoice.paid_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </p>
                    </div>
                </Card>
                <Card>
                    <div className="p-4">
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Due Date</p>
                        <p className="font-medium text-gray-900 dark:text-white">
                            {invoice.due_date || 'N/A'}
                        </p>
                    </div>
                </Card>
            </div>

            {/* Invoice Lines */}
            <Card>
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">Invoice Lines</h3>
                </div>
                <div className="p-0">
                    <DataTable
                        keyExtractor={(row) => row.id}
                        columns={lineColumns}
                        data={invoice.lines || []}
                    />
                </div>
                <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex justify-end">
                    <div className="w-64 space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500 dark:text-gray-400">Subtotal</span>
                            <span className="font-medium dark:text-white">${Number(invoice.subtotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                        {/* If taxes are implemented */}
                        <div className="flex justify-between text-lg font-bold">
                            <span className="text-gray-900 dark:text-white">Total</span>
                            <span className="text-gray-900 dark:text-white">${Number(invoice.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                    </div>
                </div>
            </Card>
        </div>
    );
};
