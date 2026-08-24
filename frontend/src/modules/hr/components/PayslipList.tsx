import React, { useState, useEffect } from 'react';
import { apiClient } from '../api';
import type { Payslip, Employee, PayrollRun, PayrollPeriod } from '../types';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { LoadingState } from '../../../components/ui/LoadingState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Badge } from '../../../components/ui/Badge';
import { PayslipDetailModal } from './PayslipDetailModal';

export const PayslipList: React.FC = () => {
    const [payslips, setPayslips] = useState<Payslip[]>([]);
    const [employees, setEmployees] = useState<Record<string, Employee>>({});
    const [runs, setRuns] = useState<Record<string, PayrollRun>>({});
    const [periods, setPeriods] = useState<Record<string, PayrollPeriod>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedPayslip, setSelectedPayslip] = useState<Payslip | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [slipRes, empRes, runRes, periodRes] = await Promise.all([
                apiClient.get('/api/hrm/payslips/'),
                apiClient.get('/api/hrm/employees/'),
                apiClient.get('/api/hrm/payroll-runs/'),
                apiClient.get('/api/hrm/payroll-periods/')
            ]);
            
            const slipData = slipRes.data.results || (Array.isArray(slipRes.data) ? slipRes.data : []);
            setPayslips(slipData);

            const empData = empRes.data.results || (Array.isArray(empRes.data) ? empRes.data : []);
            const empMap: Record<string, Employee> = {};
            empData.forEach((e: Employee) => { empMap[e.id] = e; });
            setEmployees(empMap);

            const runData = runRes.data.results || (Array.isArray(runRes.data) ? runRes.data : []);
            const rMap: Record<string, PayrollRun> = {};
            runData.forEach((r: PayrollRun) => { rMap[r.id] = r; });
            setRuns(rMap);
            
            const periodData = periodRes.data.results || (Array.isArray(periodRes.data) ? periodRes.data : []);
            const pMap: Record<string, PayrollPeriod> = {};
            periodData.forEach((p: PayrollPeriod) => { pMap[p.id] = p; });
            setPeriods(pMap);

            setError(null);
        } catch (err: any) {
            setError(err.message || 'Failed to load payslips');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const getStatusVariant = (status: string) => {
        switch (status) {
            case 'PAID': return 'success';
            case 'APPROVED': return 'primary';
            case 'DRAFT': return 'default';
            default: return 'default';
        }
    };

    const columns: Column<Payslip>[] = [
        { key: 'Employee', header: 'Employee', render: (p: Payslip) => {
            const emp = employees[p.employee];
            return emp ? `${emp.first_name} ${emp.last_name}` : p.employee;
        }},
        { key: 'Period', header: 'Period', render: (p: Payslip) => {
            const run = runs[p.payroll_run];
            if (!run) return '—';
            const period = periods[run.payroll_period];
            return period ? period.name : run.payroll_period;
        }},
        { key: 'Gross', header: 'Gross Pay', render: (p: Payslip) => p.gross_pay },
        { key: 'Deductions', header: 'Deductions', render: (p: Payslip) => p.total_deductions },
        { key: 'Net', header: 'Net Pay', render: (p: Payslip) => p.net_pay },
        { key: 'Status', header: 'Status', render: (p: Payslip) => (
            <Badge variant={getStatusVariant(p.status)}>{p.status}</Badge>
        )},
        { key: 'actions', header: 'Actions', render: (p: Payslip) => (
            <div style={{ display: 'flex', gap: '8px' }}>
                <Button variant="secondary" onClick={() => { setSelectedPayslip(p); setIsDetailOpen(true); }}>View Details</Button>
            </div>
        )}
    ];

    if (loading) return <LoadingState message="Loading payslips..." />;
    if (error) return <ErrorState message={error} onRetry={fetchData} />;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Payslips</h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <Button variant="secondary" onClick={() => {}}>Generate PDFs</Button>
                </div>
            </div>
            <DataTable columns={columns} data={payslips} keyExtractor={(item: any) => item.id} />
            <PayslipDetailModal 
                isOpen={isDetailOpen} 
                onClose={() => setIsDetailOpen(false)} 
                payslip={selectedPayslip} 
            />
        </div>
    );
};
