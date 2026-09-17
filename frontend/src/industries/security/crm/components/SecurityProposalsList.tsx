import React, { useState, useEffect, useCallback } from 'react';
import { Toolbar } from '../../../../layouts/PageLayout';
import { DataTable } from '../../../../components/tables/DataTable';
import type { Column } from '../../../../components/tables/DataTable';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { ErrorState } from '../../../../components/ui/ErrorState';
import { getSecurityProposals } from '../api';
import type { SecurityProposal } from '../api';

interface Props {
    onOpenProposal: (id: string) => void;
}

export const SecurityProposalsList: React.FC<Props> = ({ onOpenProposal }) => {
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    
    const [data, setData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        setHasError(false);
        try {
            const response = await getSecurityProposals({
                page,
                search
            });
            setData(response);
        } catch (error) {
            setHasError(true);
        } finally {
            setIsLoading(false);
        }
    }, [page, search]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const columns: Column<SecurityProposal>[] = [
        {
            key: 'proposal_number',
            header: 'Proposal #',
            render: (p) => <strong style={{ fontFamily: 'monospace' }}>{p.proposal_number}</strong>
        },
        {
            key: 'customer',
            header: 'Client',
            render: (p) => p.customer_name || 'Unknown'
        },
        {
            key: 'title',
            header: 'Title',
            render: (p) => p.title
        },
        {
            key: 'status',
            header: 'Status',
            render: (p) => p.status
        },
        {
            key: 'actions',
            header: 'Actions',
            render: (p) => (
                <Button variant="ghost" onClick={() => onOpenProposal(p.id)}>
                    Open
                </Button>
            )
        }
    ];

    if (hasError) {
        return (
            <ErrorState 
                title="Failed to load proposals" 
                message="There was an error communicating with the server." 
                onRetry={loadData} 
            />
        );
    }

    return (
        <div>
            <Toolbar>
                <div style={{ width: '300px' }}>
                    <Input 
                        placeholder="Search proposals..." 
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </Toolbar>

            <DataTable 
                data={data?.results || []}
                columns={columns}
                isLoading={isLoading}
                keyExtractor={(row) => row.id}
                emptyMessage="No proposals found."
                pagination={data ? {
                    page,
                    pageSize: 20,
                    totalItems: data.count,
                    onPageChange: setPage
                } : undefined}
            />
        </div>
    );
};
