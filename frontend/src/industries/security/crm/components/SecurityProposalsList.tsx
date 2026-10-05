import React, { useState, useEffect, useCallback } from 'react';
import { Toolbar } from '../../../../layouts/PageLayout';
import { DataTable } from '../../../../components/tables/DataTable';
import type { Column } from '../../../../components/tables/DataTable';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { ErrorState } from '../../../../components/ui/ErrorState';
import { getSecurityProposals, deleteSecurityProposal } from '../api';
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

    const handleDelete = async (p: SecurityProposal) => {
        if (!window.confirm(`Are you sure you want to delete requirement sheet "${p.proposal_number}"? This action cannot be undone.`)) {
            return;
        }
        try {
            await deleteSecurityProposal(p.id);
            loadData();
        } catch (err: any) {
            alert(err.message || 'Failed to delete requirement sheet');
        }
    };

    useEffect(() => {
        loadData();
    }, [loadData]);

    const columns: Column<SecurityProposal>[] = [
        {
            key: 'proposal_number',
            header: 'Req #',
            render: (p) => <strong style={{ fontFamily: 'monospace' }}>{p.proposal_number}</strong>
        },
        {
            key: 'customer',
            header: 'Client',
            render: (p) => <strong>{p.customer_name || 'Unknown'}</strong>
        },
        {
            key: 'title',
            header: 'Requirement Scope',
            render: (p) => p.title
        },
        {
            key: 'status',
            header: 'Operations Status',
            render: (p) => (
                <span style={{ 
                    padding: '3px 8px', 
                    borderRadius: '12px', 
                    fontSize: '11.5px', 
                    fontWeight: 600,
                    background: p.status === 'ACTIVE' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                    color: p.status === 'ACTIVE' ? '#10b981' : '#6366f1',
                    border: `1px solid ${p.status === 'ACTIVE' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(99, 102, 241, 0.3)'}`
                }}>
                    <i className={p.status === 'ACTIVE' ? 'bx bx-check-shield' : 'bx bx-time'}></i> {p.status === 'ACTIVE' ? 'Live in Operations' : p.status}
                </span>
            )
        },
        {
            key: 'actions',
            header: 'Actions',
            render: (p) => (
                <div style={{ display: 'flex', gap: '8px' }}>
                    <Button variant="ghost" onClick={() => onOpenProposal(p.id)}>
                        <i className='bx bx-edit-alt'></i> Open Requirements
                    </Button>
                    <Button variant="danger" onClick={() => handleDelete(p)}>
                        Delete
                    </Button>
                </div>
            )
        }
    ];

    if (hasError) {
        return (
            <ErrorState 
                title="Failed to load requirements" 
                message="There was an error communicating with the server." 
                onRetry={loadData} 
            />
        );
    }

    return (
        <div>
            <Toolbar>
                <div style={{ width: '320px' }}>
                    <Input 
                        placeholder="Search requirements by client, Req #..." 
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
                emptyMessage="No client requirements found."
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
