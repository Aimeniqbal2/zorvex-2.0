import React, { useEffect, useState, useCallback } from 'react';
import { getExtraDuties } from '../api';
import type { ExtraDuty, PaginatedResponse } from '../types';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { Badge } from '../../../components/ui/Badge';
import { Input } from '../../../components/ui/Input';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Button } from '../../../components/ui/Button';
import { ExtraDutyModal } from './ExtraDutyModal';
import { Modal } from '../../../components/ui/Modal';
import { apiClient, approveExtraDuty, rejectExtraDuty, processExtraDutyPayroll } from '../api';

export const ExtraDutyView: React.FC = () => {
    const [page, setPage] = useState(1);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    
    const [data, setData] = useState<PaginatedResponse<ExtraDuty> | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedExtraDuty, setSelectedExtraDuty] = useState<ExtraDuty | undefined>();
    const [processModalOpen, setProcessModalOpen] = useState(false);
    const [dutyToProcess, setDutyToProcess] = useState<string | null>(null);
    const [payrollRuns, setPayrollRuns] = useState<any[]>([]);
    const [selectedPayrollRun, setSelectedPayrollRun] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(searchQuery);
            setPage(1);
        }, 400);
        return () => clearTimeout(handler);
    }, [searchQuery]);

    const fetchExtraDuties = useCallback(async () => {
        setIsLoading(true);
        setHasError(false);
        try {
            const response = await getExtraDuties({ page, search: debouncedSearch });
            setData(response);
        } catch (err) {
            setHasError(true);
        } finally {
            setIsLoading(false);
        }
    }, [page, debouncedSearch]);

    useEffect(() => {
        fetchExtraDuties();
    }, [fetchExtraDuties]);

    const handleApprove = async (id: string) => {
        try {
            await approveExtraDuty(id);
            fetchExtraDuties();
        } catch (err) {
            alert('Failed to approve extra duty.');
        }
    };

    const handleReject = async (id: string) => {
        try {
            await rejectExtraDuty(id);
            fetchExtraDuties();
        } catch (err) {
            alert('Failed to reject extra duty.');
        }
    };

    const openProcessModal = async (id: string) => {
        setDutyToProcess(id);
        setProcessModalOpen(true);
        try {
            const res = await apiClient.get('/api/hrm/payroll-runs/');
            setPayrollRuns(res.data.results || res.data || []);
        } catch (err) {
            console.error('Failed to fetch payroll runs', err);
        }
    };

    const handleProcessPayroll = async () => {
        if (!dutyToProcess || !selectedPayrollRun) return;
        setIsProcessing(true);
        try {
            await processExtraDutyPayroll(dutyToProcess, selectedPayrollRun);
            alert('Extra duty processed to payroll successfully!');
            setProcessModalOpen(false);
            setDutyToProcess(null);
            fetchExtraDuties();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to process to payroll.');
        } finally {
            setIsProcessing(false);
        }
    };

    const columns: Column<ExtraDuty>[] = [
        { key: 'employee_name', header: 'Employee', render: (row: ExtraDuty) => row.employee_name || 'N/A' },
        { key: 'site_name', header: 'Site', render: (row: ExtraDuty) => row.site_name || 'N/A' },
        { key: 'date', header: 'Date' },
        { key: 'hours', header: 'Hours' },
        { 
            key: 'status', 
            header: 'Status',
            render: (row: ExtraDuty) => {
                if (row.status === 'APPROVED') return <Badge variant="success">Approved</Badge>;
                if (row.status === 'REQUESTED') return <Badge variant="warning">Requested</Badge>;
                if (row.status === 'REJECTED') return <Badge variant="danger">Rejected</Badge>;
                if (row.status === 'COMPLETED') return <Badge variant="primary">Completed</Badge>;
                return <Badge>{row.status}</Badge>;
            }
        },
        { key: 'description', header: 'Reason', render: (row: ExtraDuty) => row.description || '-' },
        {
            key: 'actions',
            header: 'Actions',
            render: (row: ExtraDuty) => (
                <div style={{ display: 'flex', gap: '8px' }}>
                    {row.status === 'REQUESTED' && (
                        <>
                            <button className="zorvex-btn-sm" onClick={() => { setSelectedExtraDuty(row); setModalOpen(true); }}>Edit</button>
                            <button className="zorvex-btn-sm" style={{ backgroundColor: '#28a745', color: 'white' }} onClick={() => handleApprove(row.id)}>Approve</button>
                            <button className="zorvex-btn-sm" style={{ backgroundColor: '#dc3545', color: 'white' }} onClick={() => handleReject(row.id)}>Reject</button>
                        </>
                    )}
                    {(row.status === 'APPROVED' || row.status === 'COMPLETED') && (
                        <button className="zorvex-btn-sm" style={{ backgroundColor: '#17a2b8', color: 'white' }} onClick={() => openProcessModal(row.id)}>
                            Process Payroll
                        </button>
                    )}
                </div>
            )
        }
    ];

    if (hasError && !data) {
        return <ErrorState message="Failed to load extra duties." onRetry={fetchExtraDuties} />;
    }

    return (
        <div className="view-container">
            <div className="view-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Input 
                    placeholder="Search extra duties..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ width: '300px' }}
                />
                <Button variant="primary" onClick={() => { setSelectedExtraDuty(undefined); setModalOpen(true); }}>
                    + New Extra Duty
                </Button>
            </div>

            <div className="view-table-container">
                <DataTable<ExtraDuty>
                    data={data?.results || []}
                    columns={columns}
                    isLoading={isLoading}
                    keyExtractor={(row) => row.id}
                    emptyMessage={searchQuery ? "No extra duties match your search." : "No extra duties reported."}
                    pagination={data ? {
                        page: page,
                        pageSize: 10,
                        totalItems: data.count,
                        onPageChange: (newPage) => setPage(newPage)
                    } : undefined}
                />
            </div>

            <ExtraDutyModal 
                isOpen={modalOpen} 
                onClose={() => setModalOpen(false)} 
                onSaved={fetchExtraDuties} 
                extraDuty={selectedExtraDuty} 
            />

            {processModalOpen && (
                <Modal isOpen={processModalOpen} title="Process to Payroll" onClose={() => setProcessModalOpen(false)}>
                    <div style={{ padding: '20px', minWidth: '300px' }}>
                        <div className="form-group">
                            <label>Select Payroll Run</label>
                            <select 
                                className="zorvex-input" 
                                value={selectedPayrollRun} 
                                onChange={e => setSelectedPayrollRun(e.target.value)}
                            >
                                <option value="">Select...</option>
                                {payrollRuns.map(pr => (
                                    <option key={pr.id} value={pr.id}>{pr.reference} - {pr.status}</option>
                                ))}
                            </select>
                        </div>
                        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <Button variant="secondary" onClick={() => setProcessModalOpen(false)}>Cancel</Button>
                            <Button variant="primary" onClick={handleProcessPayroll} loading={isProcessing} disabled={!selectedPayrollRun}>Process</Button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};
