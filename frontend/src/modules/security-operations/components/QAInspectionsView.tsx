import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../../../layouts/PageLayout';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { useToastStore } from '../../../stores/toastStore';
import { getQAInspections, submitQAInspection } from '../api';
import type { QAInspection, PaginatedResponse } from '../types';
import { QAInspectionModal } from './QAInspectionModal';

import { QAInspectionDetail } from './QAInspectionDetail';

export const QAInspectionsView: React.FC = () => {
    const [data, setData] = useState<PaginatedResponse<QAInspection> | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedInspection, setSelectedInspection] = useState<QAInspection | null>(null);
    const [selectedInspectionId, setSelectedInspectionId] = useState<string | null>(null);
    const [page, setPage] = useState(1);

    const loadData = useCallback(async () => {
        try {
            const res = await getQAInspections({ page });
            setData(res);
        } catch (error) {
            useToastStore.getState().error('Failed to load QA inspections');
        }
    }, [page]);

    useEffect(() => {
        if (!selectedInspectionId) {
            loadData();
        }
    }, [loadData, selectedInspectionId]);

    const handleAction = async (id: string, action: string) => {
        try {
            if (action === 'submit') {
                await submitQAInspection(id);
            }
            useToastStore.getState().success(`Successfully applied action: ${action}`);
            loadData();
        } catch (error: any) {
            useToastStore.getState().error(`Failed: ${error.response?.data?.error || error.message}`);
        }
    };

    const handleEdit = (inspection: QAInspection) => {
        setSelectedInspection(inspection);
        setIsModalOpen(true);
    };

    const handleNew = () => {
        setSelectedInspection(null);
        setIsModalOpen(true);
    };

    if (selectedInspectionId) {
        return (
            <QAInspectionDetail 
                inspectionId={selectedInspectionId} 
                onBack={() => setSelectedInspectionId(null)} 
            />
        );
    }

    const columns: Column<QAInspection>[] = [
        {
            key: 'inspection_date',
            header: 'Date',
            render: (row: any) => row.inspection_date
        },
        {
            key: 'template',
            header: 'Template',
            render: (row: any) => row.template_name || 'Unknown'
        },
        {
            key: 'site',
            header: 'Contract / Site',
            render: (row: any) => (
                <div>
                    <div>{row.service_contract_number || 'N/A'}</div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{row.operational_site_name}</div>
                </div>
            )
        },
        {
            key: 'inspector',
            header: 'Inspector',
            render: (row: any) => row.inspector_name
        },
        {
            key: 'score',
            header: 'Score',
            render: (row: any) => row.score !== null ? `${row.score}%` : 'N/A'
        },
        {
            key: 'status',
            header: 'Status',
            render: (row: any) => <Badge>{row.status}</Badge>
        },
        {
            key: 'actions',
            header: 'Actions',
            render: (row: any) => (
                <div style={{ display: 'flex', gap: '4px' }}>
                    <Button variant="ghost" onClick={() => setSelectedInspectionId(row.id)} title="View/Conduct">
                        <i className='bx bx-show'></i>
                    </Button>
                    <Button variant="ghost" onClick={() => handleEdit(row)} title="Edit Header">
                        <i className='bx bx-edit'></i>
                    </Button>
                    {row.status === 'DRAFT' && (
                        <Button variant="ghost" onClick={() => handleAction(row.id, 'submit')} title="Submit">
                            <i className='bx bx-send'></i>
                        </Button>
                    )}
                </div>
            )
        }
    ];

    return (
        <div>
            <PageHeader 
                title="Quality Assurance Inspections"
                actions={<Button variant="primary" onClick={handleNew}>New Inspection</Button>}
            />

            <DataTable 
                data={data?.results || []}
                columns={columns}
                keyExtractor={(row: any) => row.id}
                emptyMessage="No QA inspections found."
            />

            {data && data.count > (data.results?.length || 0) && (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '16px', gap: '8px' }}>
                    <Button 
                        variant="secondary" 
                        disabled={!data.previous} 
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                    >
                        Previous
                    </Button>
                    <Button 
                        variant="secondary" 
                        disabled={!data.next} 
                        onClick={() => setPage(p => p + 1)}
                    >
                        Next
                    </Button>
                </div>
            )}

            {isModalOpen && (
                <QAInspectionModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    onSaved={loadData}
                    inspection={selectedInspection}
                />
            )}
        </div>
    );
};
