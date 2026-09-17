import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../../../layouts/PageLayout';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { useToastStore } from '../../../stores/toastStore';
import { getCorrectiveActions, resolveCorrectiveAction, verifyCorrectiveAction } from '../api';
import type { CorrectiveAction, PaginatedResponse } from '../types';

export const CorrectiveActionsView: React.FC = () => {
    const [data, setData] = useState<PaginatedResponse<CorrectiveAction> | null>(null);
    const [page, setPage] = useState(1);

    const loadData = useCallback(async () => {
        try {
            const res = await getCorrectiveActions({ page } as any);
            setData(res);
        } catch (error) {
            useToastStore.getState().error('Failed to load corrective actions');
        }
    }, [page]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleAction = async (id: string, action: string) => {
        try {
            if (action === 'resolve') {
                await resolveCorrectiveAction(id);
                useToastStore.getState().success('Action marked as resolved');
            } else if (action === 'verify') {
                const notes = window.prompt('Verification notes (optional):') || '';
                await verifyCorrectiveAction(id, notes);
                useToastStore.getState().success('Action verified');
            }
            loadData();
        } catch (error: any) {
            useToastStore.getState().error(`Failed: ${error.response?.data?.error || error.message}`);
        }
    };

    const columns: Column<CorrectiveAction>[] = [
        {
            key: 'finding',
            header: 'Finding',
            render: (row: any) => row.finding_description || 'View Finding'
        },
        {
            key: 'description',
            header: 'Action Plan',
            render: (row: any) => row.description
        },
        {
            key: 'assigned_to',
            header: 'Assigned To',
            render: (row: any) => row.assigned_to_name
        },
        {
            key: 'due_date',
            header: 'Due Date',
            render: (row: any) => row.due_date
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
                    {row.status === 'PENDING' || row.status === 'IN_PROGRESS' ? (
                        <Button variant="ghost" onClick={() => handleAction(row.id, 'resolve')} title="Mark Resolved">
                            <i className='bx bx-check'></i>
                        </Button>
                    ) : null}
                    {row.status === 'RESOLVED' && (
                        <Button variant="ghost" onClick={() => handleAction(row.id, 'verify')} title="Verify">
                            <i className='bx bx-check-double'></i>
                        </Button>
                    )}
                </div>
            )
        }
    ];

    return (
        <div>
            <PageHeader 
                title="Corrective Actions"
            />

            <DataTable 
                data={data?.results || []}
                columns={columns}
                keyExtractor={(row: any) => row.id}
                emptyMessage="No corrective actions found."
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
        </div>
    );
};
