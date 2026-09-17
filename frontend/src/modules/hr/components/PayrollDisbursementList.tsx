import React, { useState, useEffect } from 'react';
import { apiClient } from '../api';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { LoadingState } from '../../../components/ui/LoadingState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Badge } from '../../../components/ui/Badge';
import { PayrollDisbursementModal } from './PayrollDisbursementModal';
import type { PayrollDisbursement } from '../types';

export const PayrollDisbursementList: React.FC = () => {
    const [disbursements, setDisbursements] = useState<PayrollDisbursement[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/api/hrm/payroll-disbursements/');
            setDisbursements(res.data.results || (Array.isArray(res.data) ? res.data : []));
            setError(null);
        } catch (err: any) {
            setError(err.message || 'Failed to load disbursements');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const columns: Column<PayrollDisbursement>[] = [
        { key: 'Run', header: 'Payroll Run', render: (d: PayrollDisbursement) => d.payroll_run_name || d.payroll_run },
        { key: 'Date', header: 'Date', render: (d: PayrollDisbursement) => d.disbursement_date },
        { key: 'Amount', header: 'Total Amount', render: (d: PayrollDisbursement) => d.total_amount },
        { key: 'Account', header: 'Payment Account', render: (d: PayrollDisbursement) => d.payment_account_name || d.payment_account },
        { key: 'Status', header: 'Status', render: (d: PayrollDisbursement) => (
            <Badge variant={d.status === 'COMPLETED' ? 'success' : d.status === 'FAILED' ? 'danger' : 'warning'}>{d.status}</Badge>
        )},
    ];

    if (loading) return <LoadingState message="Loading disbursements..." />;
    if (error) return <ErrorState message={error} onRetry={fetchData} />;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Payroll Disbursements</h3>
                <Button variant="primary" onClick={() => setIsModalOpen(true)}>Execute Disbursement</Button>
            </div>
            <DataTable columns={columns} data={disbursements} keyExtractor={(item: any) => item.id} />
            
            {isModalOpen && (
                <PayrollDisbursementModal 
                    isOpen={isModalOpen} 
                    onClose={() => setIsModalOpen(false)} 
                    onSave={fetchData} 
                />
            )}
        </div>
    );
};
