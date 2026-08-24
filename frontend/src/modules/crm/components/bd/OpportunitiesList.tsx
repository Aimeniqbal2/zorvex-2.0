import React, { useState, useEffect } from 'react';
import { Toolbar } from '../../../../layouts/PageLayout';
import { DataTable } from '../../../../components/tables/DataTable';
import type { Column } from '../../../../components/tables/DataTable';
import { Button } from '../../../../components/ui/Button';
import { Badge } from '../../../../components/ui/Badge';
import { getOpportunities } from '../../api';
import type { Opportunity, PaginatedResponse } from '../../types';
import { useToastStore } from '../../../../stores/toastStore';

export const OpportunitiesList: React.FC = () => {
    const [data, setData] = useState<PaginatedResponse<Opportunity> | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchOpps = async () => {
            try {
                const response = await getOpportunities();
                setData(response);
            } catch (err) {
                useToastStore.getState().error('Failed to load opportunities');
            } finally {
                setIsLoading(false);
            }
        };
        fetchOpps();
    }, []);

    const columns: Column<Opportunity>[] = [
        {
            key: 'opportunity_number',
            header: 'Number',
            render: (opp) => opp.opportunity_number
        },
        {
            key: 'title',
            header: 'Title',
            render: (opp) => (
                <div>
                    <div style={{ fontWeight: 500 }}>{opp.title}</div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{opp.crm_entity_name}</div>
                </div>
            )
        },
        {
            key: 'stage',
            header: 'Stage',
            render: (opp) => <Badge>{opp.stage}</Badge>
        },
        {
            key: 'owner',
            header: 'Owner',
            render: (opp) => opp.owner_name || 'Unassigned'
        },
        {
            key: 'actions',
            header: 'Actions',
            render: () => <Button variant="ghost" disabled><i className='bx bx-show'></i></Button>
        }
    ];

    return (
        <div>
            <Toolbar>
                <div style={{ fontWeight: 600 }}>Opportunities Pipeline</div>
                <div style={{ flex: 1 }} />
                <Button variant="primary">Add Opportunity</Button>
            </Toolbar>
            <DataTable 
                data={data?.results || []}
                columns={columns}
                isLoading={isLoading}
                keyExtractor={(row) => row.id}
            />
        </div>
    );
};
