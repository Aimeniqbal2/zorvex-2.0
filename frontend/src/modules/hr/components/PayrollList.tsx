import React, { useState, useEffect } from 'react';
import { apiClient } from '../api';
import type { PayrollRun, PayrollPeriod } from '../types';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { LoadingState } from '../../../components/ui/LoadingState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Badge } from '../../../components/ui/Badge';
import { PayrollRunModal } from './PayrollRunModal';

export const PayrollList: React.FC = () => {
    const [runs, setRuns] = useState<PayrollRun[]>([]);
    const [periods, setPeriods] = useState<Record<string, PayrollPeriod>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [runRes, periodRes] = await Promise.all([
                apiClient.get('/api/hrm/payroll-runs/'),
                apiClient.get('/api/hrm/payroll-periods/')
            ]);
            
            const runData = runRes.data.results || (Array.isArray(runRes.data) ? runRes.data : []);
            setRuns(runData);

            const periodData = periodRes.data.results || (Array.isArray(periodRes.data) ? periodRes.data : []);
            const pMap: Record<string, PayrollPeriod> = {};
            periodData.forEach((p: PayrollPeriod) => {
                pMap[p.id] = p;
            });
            setPeriods(pMap);

            setError(null);
        } catch (err: any) {
            setError(err.message || 'Failed to load payroll runs');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleAction = async (id: string, actionName: string) => {
        try {
            await apiClient.post(`/api/hrm/payroll-runs/${id}/${actionName}/`);
            fetchData();
        } catch (err: any) {
            alert(`Failed to ${actionName}: ` + (err.response?.data?.error || err.message));
        }
    };

    const columns: Column<PayrollRun>[] = [
        { key: 'RunNumber', header: 'Run Number', render: (p: PayrollRun) => (p as any).run_number },
        { key: 'Period', header: 'Period', render: (p: PayrollRun) => periods[(p as any).payroll_period]?.name || 'N/A' },
        { key: 'Status', header: 'Status', render: (p: PayrollRun) => (
            <Badge variant={p.status === 'DRAFT' ? 'default' : p.status === 'PROCESSING' ? 'warning' : p.status === 'CALCULATED' ? 'primary' : p.status === 'APPROVED' ? 'primary' : p.status === 'FINALIZED' ? 'success' : 'default'}>{p.status}</Badge>
        )},
        { key: 'actions', header: 'Actions', render: (p: PayrollRun) => (
            <div style={{ display: 'flex', gap: '8px' }}>
                <Button variant="secondary" onClick={() => handleAction(p.id, 'calculate')}>Calculate</Button>
                {p.status === 'CALCULATED' && (
                    <Button variant="primary" onClick={() => handleAction(p.id, 'finalize')}>Finalize</Button>
                )}
            </div>
        )}
    ];

    if (loading) return <LoadingState message="Loading payroll..." />;
    if (error) return <ErrorState message={error} onRetry={fetchData} />;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Payroll Runs</h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <Button variant="primary" onClick={() => setIsModalOpen(true)}>New Run</Button>
                </div>
            </div>
            <DataTable columns={columns} data={runs} keyExtractor={(item: any) => item.id} />
            <PayrollRunModal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)} 
                onSave={fetchData} 
            />
        </div>
    );
};
