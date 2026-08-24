import React, { useState, useEffect } from 'react';
import { apiClient } from '../api';
import type { PayrollPeriod } from '../types';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { LoadingState } from '../../../components/ui/LoadingState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Badge } from '../../../components/ui/Badge';
import { PayrollPeriodModal } from './PayrollPeriodModal';

export const PayrollPeriodList: React.FC = () => {
    const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedPeriod, setSelectedPeriod] = useState<PayrollPeriod | null>(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/api/hrm/payroll-periods/');
            const data = res.data.results || (Array.isArray(res.data) ? res.data : []);
            setPeriods(data);
            setError(null);
        } catch (err: any) {
            setError(err.message || 'Failed to load payroll periods');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const columns: Column<PayrollPeriod>[] = [
        { key: 'Name', header: 'Name', render: (p: PayrollPeriod) => p.name },
        { key: 'Dates', header: 'Dates', render: (p: PayrollPeriod) => `${p.start_date} to ${p.end_date}` },
        { key: 'Status', header: 'Status', render: (p: PayrollPeriod) => (
            <Badge variant={p.status === 'OPEN' ? 'success' : 'default'}>{p.status}</Badge>
        )},
        { key: 'actions', header: 'Actions', render: (p: PayrollPeriod) => (
            <div style={{ display: 'flex', gap: '8px' }}>
                <Button variant="secondary" onClick={() => { setSelectedPeriod(p); setIsModalOpen(true); }}>Edit</Button>
            </div>
        )}
    ];

    if (loading) return <LoadingState message="Loading payroll periods..." />;
    if (error) return <ErrorState message={error} onRetry={fetchData} />;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Payroll Periods</h3>
                <Button variant="primary" onClick={() => { setSelectedPeriod(null); setIsModalOpen(true); }}>Create Period</Button>
            </div>
            <DataTable columns={columns} data={periods} keyExtractor={(item: any) => item.id} />
            <PayrollPeriodModal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)} 
                period={selectedPeriod} 
                onSave={fetchData} 
            />
        </div>
    );
};
