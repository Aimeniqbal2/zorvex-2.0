import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../../../layouts/PageLayout';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { useToastStore } from '../../../stores/toastStore';
import { getTemporaryServices, actionTemporaryService } from '../api';
import type { TemporaryServiceRequest, PaginatedResponse } from '../types';
import { TemporaryServiceModal } from './TemporaryServiceModal';

export const TemporaryServicesView: React.FC = () => {
    const [data, setData] = useState<PaginatedResponse<TemporaryServiceRequest> | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedService, setSelectedService] = useState<TemporaryServiceRequest | null>(null);
    const [page, setPage] = useState(1);

    const loadData = useCallback(async () => {
        try {
            const res = await getTemporaryServices({ page });
            setData(res);
        } catch (error) {
            useToastStore.getState().error('Failed to load temporary services');
        }
    }, [page]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleAction = async (id: string, action: string) => {
        try {
            await actionTemporaryService(id, action);
            useToastStore.getState().success(`Successfully applied action: ${action}`);
            loadData();
        } catch (error: any) {
            useToastStore.getState().error(`Failed: ${error.response?.data?.error || error.message}`);
        }
    };

    const handleEdit = (service: TemporaryServiceRequest) => {
        setSelectedService(service);
        setIsModalOpen(true);
    };

    const handleNew = () => {
        setSelectedService(null);
        setIsModalOpen(true);
    };

    const columns: Column<TemporaryServiceRequest>[] = [
        {
            key: 'reference_number',
            header: 'Reference',
            render: (row: any) => row.reference_number
        },
        {
            key: 'customer',
            header: 'Customer',
            render: (row: any) => row.crm_entity_name || 'Unknown'
        },
        {
            key: 'site',
            header: 'Site',
            render: (row: any) => row.operational_site_name || 'Temporary Site'
        },
        {
            key: 'start',
            header: 'Start',
            render: (row: any) => new Date(row.start_datetime).toLocaleString()
        },
        {
            key: 'end',
            header: 'End',
            render: (row: any) => new Date(row.end_datetime).toLocaleString()
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
                    <Button variant="ghost" onClick={() => handleEdit(row)}>
                        <i className='bx bx-edit'></i>
                    </Button>
                    {(row.status === 'DRAFT' || row.status === 'REQUESTED') && (
                        <Button variant="ghost" onClick={() => handleAction(row.id, 'approve')} title="Approve">
                            <i className='bx bx-check'></i>
                        </Button>
                    )}
                    {row.status === 'APPROVED' && (
                        <>
                            <Button variant="ghost" onClick={() => handleAction(row.id, 'confirm')} title="Confirm">
                                <i className='bx bx-check-double'></i>
                            </Button>
                            <Button variant="ghost" onClick={() => handleAction(row.id, 'generate_duties')} title="Generate Duties">
                                <i className='bx bx-calendar-event'></i>
                            </Button>
                        </>
                    )}
                    {row.status === 'CONFIRMED' && (
                        <>
                            <Button variant="ghost" onClick={() => handleAction(row.id, 'generate_duties')} title="Generate Duties">
                                <i className='bx bx-calendar-event'></i>
                            </Button>
                            <Button variant="ghost" onClick={() => handleAction(row.id, 'complete')} title="Complete">
                                <i className='bx bx-flag'></i>
                            </Button>
                        </>
                    )}
                    {row.status === 'COMPLETED' && (
                        <Button variant="ghost" onClick={() => handleAction(row.id, 'generate_invoice')} title="Generate Invoice">
                            <i className='bx bx-receipt'></i>
                        </Button>
                    )}
                </div>
            )
        }
    ];

    return (
        <div>
            <PageHeader 
                title="Temporary Security Services"
                actions={<Button variant="primary" onClick={handleNew}>Request Service</Button>}
            />

            <DataTable 
                data={data?.results || []}
                columns={columns}
                keyExtractor={(row: any) => row.id}
                emptyMessage="No temporary services found."
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
                <TemporaryServiceModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    onSaved={loadData}
                    service={selectedService}
                />
            )}
        </div>
    );
};
