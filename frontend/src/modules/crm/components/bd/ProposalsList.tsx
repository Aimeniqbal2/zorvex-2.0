import React, { useState, useEffect } from 'react';
import { Toolbar } from '../../../../layouts/PageLayout';
import { DataTable } from '../../../../components/tables/DataTable';
import type { Column } from '../../../../components/tables/DataTable';
import { Button } from '../../../../components/ui/Button';
import { Badge } from '../../../../components/ui/Badge';
import { getProposals } from '../../api';
import type { Proposal, PaginatedResponse } from '../../types';
import { useToastStore } from '../../../../stores/toastStore';
import { ProposalModal } from './ProposalModal';
import { useCrmStore } from '../../store/useCrmStore';

export const ProposalsList: React.FC = () => {
    const [data, setData] = useState<PaginatedResponse<Proposal> | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const { setSelectedProposalId } = useCrmStore();

    const fetchProposals = async () => {
        setIsLoading(true);
        try {
            const response = await getProposals();
            setData(response);
        } catch (err) {
            useToastStore.getState().error('Failed to load proposals');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchProposals();
    }, []);

    const columns: Column<Proposal>[] = [
        {
            key: 'proposal_number',
            header: 'Proposal No',
            render: (prop) => `${prop.proposal_number} v${prop.version}`
        },
        {
            key: 'title',
            header: 'Title',
            render: (prop) => (
                <div>
                    <div style={{ fontWeight: 500 }}>{prop.title}</div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Opp: {prop.opportunity_title}</div>
                </div>
            )
        },
        {
            key: 'status',
            header: 'Status',
            render: (prop) => <Badge>{prop.status}</Badge>
        },
        {
            key: 'total',
            header: 'Total',
            render: (prop) => `${prop.currency} ${prop.total}`
        },
        {
            key: 'actions',
            header: 'Actions',
            render: (prop) => (
                <Button variant="ghost" onClick={() => setSelectedProposalId(prop.id)}>
                    <i className='bx bx-show'></i>
                </Button>
            )
        }
    ];

    return (
        <div>
            <Toolbar>
                <div style={{ fontWeight: 600 }}>Proposals</div>
                <div style={{ flex: 1 }} />
                <Button variant="primary" onClick={() => setIsModalOpen(true)}>Create Proposal</Button>
            </Toolbar>
            <DataTable 
                data={data?.results || []}
                columns={columns}
                isLoading={isLoading}
                keyExtractor={(row) => row.id}
            />
            {isModalOpen && (
                <ProposalModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    onSaved={fetchProposals}
                />
            )}
        </div>
    );
};
