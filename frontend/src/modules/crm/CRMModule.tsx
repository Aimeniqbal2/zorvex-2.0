import React, { useState, useEffect, useCallback } from 'react';
import { PageContainer, PageHeader, Toolbar } from '../../layouts/PageLayout';
import { DataTable } from '../../components/tables/DataTable';
import type { Column } from '../../components/tables/DataTable';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { ErrorState } from '../../components/ui/ErrorState';
import { useToastStore } from '../../stores/toastStore';
import { getEntities, updateEntity } from './api';
import type { CRMEntity, PaginatedResponse, CRMEntityType } from './types';
import { useCrmStore } from './store/useCrmStore';
import { EntityModal } from './components/EntityModal';
import { EntityDetail } from './components/EntityDetail';
import { OpportunitiesList } from './components/bd/OpportunitiesList';
import { ProposalsList } from './components/bd/ProposalsList';
import { ProposalDetail } from './components/bd/ProposalDetail';
import { OpportunityDetail } from './components/bd/OpportunityDetail';
import './styles/crm.css';

const FILTER_TABS: { label: string, value: CRMEntityType | '' }[] = [
    { label: 'All', value: '' },
    { label: 'Customers', value: 'CUSTOMER' },
    { label: 'Suppliers', value: 'SUPPLIER' },
    { label: 'Leads', value: 'LEAD' },
    { label: 'Partners', value: 'PARTNER' }
];

export const CRMModule: React.FC = () => {
    // Persistent state
    const { 
        activeTab, setActiveTab,
        activeEntityTypeFilter, setEntityTypeFilter, 
        search, setSearch, 
        page, setPage,
        ordering,
        selectedEntityId, setSelectedEntityId,
        selectedProposalId, setSelectedProposalId,
        selectedOpportunityId, setSelectedOpportunityId
    } = useCrmStore();
    
    const [debouncedSearch, setDebouncedSearch] = useState(search);
    
    // Data State
    const [data, setData] = useState<PaginatedResponse<CRMEntity> | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Modal State
    const [isEntityModalOpen, setIsEntityModalOpen] = useState(false);
    const [entityToEdit, setEntityToEdit] = useState<CRMEntity | null>(null);

    // Debounce search
    useEffect(() => {
        const handler = setTimeout(() => {
            if (debouncedSearch !== search) {
                setDebouncedSearch(search);
            }
        }, 400);
        return () => clearTimeout(handler);
    }, [search, debouncedSearch]);

    // Fetch Entities
    const fetchEntities = useCallback(async () => {
        setIsLoading(true);
        setHasError(false);
        try {
            const response = await getEntities({
                page,
                search: debouncedSearch,
                entity_type: activeEntityTypeFilter,
                ordering
            });
            setData(response);
            
            // Safety against invalid page
            if (response.results.length === 0 && page > 1) {
                setPage(page - 1);
            }
        } catch (error) {
            setHasError(true);
        } finally {
            setIsLoading(false);
        }
    }, [page, debouncedSearch, activeEntityTypeFilter, ordering, refreshTrigger, setPage]);

    useEffect(() => {
        fetchEntities();
    }, [fetchEntities]);

    // Handlers
    const handleAddEntity = () => {
        setEntityToEdit(null);
        setIsEntityModalOpen(true);
    };

    const handleEditEntity = (entity: CRMEntity) => {
        setEntityToEdit(entity);
        setIsEntityModalOpen(true);
    };

    const handleToggleActive = async (entity: CRMEntity) => {
        try {
            await updateEntity(entity.id, { active: !entity.active });
            useToastStore.getState().success(`Entity ${entity.active ? 'deactivated' : 'reactivated'} successfully`);
            setRefreshTrigger(prev => prev + 1);
        } catch (error) {
            useToastStore.getState().error('Failed to update entity status');
        }
    };

    // Columns
    const columns: Column<CRMEntity>[] = [
        {
            key: 'code',
            header: 'Code',
            render: (entity) => <span style={{ fontFamily: 'monospace', color: 'var(--color-text-muted)' }}>{entity.code}</span>
        },
        {
            key: 'name',
            header: 'Name',
            render: (entity) => (
                <div>
                    <div style={{ fontWeight: 500 }}>{entity.name}</div>
                    {entity.display_name && entity.display_name !== entity.name && (
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{entity.display_name}</div>
                    )}
                </div>
            )
        },
        {
            key: 'entity_type',
            header: 'Type',
            render: (entity) => {
                let badgeVariant: 'default' | 'primary' | 'success' | 'warning' | 'error' = 'default';
                if (entity.entity_type === 'CUSTOMER') badgeVariant = 'primary';
                if (entity.entity_type === 'SUPPLIER') badgeVariant = 'warning';
                if (entity.entity_type === 'LEAD') badgeVariant = 'success';
                
                return <Badge variant={badgeVariant}>{entity.entity_type}</Badge>;
            }
        },
        {
            key: 'primary_contact',
            header: 'Primary Contact',
            render: (entity) => {
                const primary = entity.contacts?.find(c => c.is_primary) || entity.contacts?.[0];
                if (!primary) return <span style={{ color: 'var(--color-text-muted)' }}>—</span>;
                return (
                    <div>
                        <div>{primary.first_name} {primary.last_name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{primary.email || primary.phone}</div>
                    </div>
                );
            }
        },
        {
            key: 'status',
            header: 'Status',
            render: (entity) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ 
                        width: '8px', 
                        height: '8px', 
                        borderRadius: '50%', 
                        backgroundColor: entity.active ? 'var(--color-success)' : 'var(--color-error)' 
                    }} />
                    <span>{entity.active ? 'Active' : 'Inactive'}</span>
                </div>
            )
        },
        {
            key: 'actions',
            header: 'Actions',
            render: (entity) => (
                <div style={{ display: 'flex', gap: '4px' }}>
                    <Button variant="ghost" onClick={() => setSelectedEntityId(entity.id)} aria-label="View">
                        <i className='bx bx-show'></i>
                    </Button>
                    <Button variant="ghost" onClick={() => handleEditEntity(entity)} aria-label="Edit">
                        <i className='bx bx-edit-alt'></i>
                    </Button>
                    <Button 
                        variant="ghost" 
                        onClick={() => handleToggleActive(entity)} 
                        aria-label={entity.active ? 'Deactivate' : 'Reactivate'}
                        title={entity.active ? 'Deactivate' : 'Reactivate'}
                    >
                        <i className={entity.active ? 'bx bx-user-x' : 'bx bx-user-check'} style={{ color: entity.active ? 'var(--color-error)' : 'var(--color-success)' }}></i>
                    </Button>
                </div>
            )
        }
    ];

    if (hasError) {
        return (
            <PageContainer>
                <ErrorState 
                    title="Failed to load CRM entities" 
                    message="There was an error communicating with the server." 
                    onRetry={() => setRefreshTrigger(prev => prev + 1)} 
                />
            </PageContainer>
        );
    }

    if (selectedEntityId) {
        return (
            <PageContainer>
                <EntityDetail 
                    entityId={selectedEntityId} 
                    onBack={() => {
                        setSelectedEntityId(null);
                        setRefreshTrigger(prev => prev + 1); // Refresh list on return to see updates
                    }} 
                />
            </PageContainer>
        );
    }

    if (selectedProposalId) {
        return (
            <PageContainer>
                <ProposalDetail 
                    proposalId={selectedProposalId} 
                    onBack={() => {
                        setSelectedProposalId(null);
                        setRefreshTrigger(prev => prev + 1);
                    }} 
                />
            </PageContainer>
        );
    }

    if (selectedOpportunityId) {
        return (
            <PageContainer>
                <OpportunityDetail 
                    opportunityId={selectedOpportunityId} 
                    onBack={() => {
                        setSelectedOpportunityId(null);
                        setRefreshTrigger(prev => prev + 1);
                    }} 
                />
            </PageContainer>
        );
    }

    return (
        <PageContainer>
            <PageHeader 
                title="CRM" 
                subtitle="Manage customers, suppliers, leads, and partners"
                actions={
                    <Button variant="primary" onClick={handleAddEntity}>
                        <i className='bx bx-plus'></i> Add Entity
                    </Button>
                }
            />

            <div className="crm-tabs" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', borderBottom: '1px solid var(--color-border)', paddingBottom: '16px', marginBottom: '16px' }}>
                {['entities', 'opportunities', 'proposals'].map(tab => (
                    <button
                        key={tab}
                        style={{
                            padding: '8px 16px',
                            background: activeTab === tab ? 'var(--color-primary)' : 'var(--color-background)',
                            border: `1px solid ${activeTab === tab ? 'var(--color-primary)' : 'var(--color-border)'}`,
                            borderRadius: '20px',
                            color: activeTab === tab ? 'white' : 'var(--color-text-muted)',
                            fontWeight: 500,
                            fontSize: '13.5px',
                            cursor: 'pointer',
                            textTransform: 'capitalize',
                            transition: 'all 0.2s ease',
                            whiteSpace: 'nowrap',
                            boxShadow: activeTab === tab ? '0 4px 10px rgba(var(--color-primary-rgb), 0.25)' : 'none'
                        }}
                        onClick={() => setActiveTab(tab as any)}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {activeTab === 'entities' && (
                <>
                    <div className="crm-filters">
                        {FILTER_TABS.map(tab => (
                            <button
                                key={tab.label}
                                className={`crm-filter-btn ${activeEntityTypeFilter === tab.value ? 'active' : ''}`}
                                onClick={() => setEntityTypeFilter(tab.value)}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

            <Toolbar>
                <div style={{ width: '300px' }}>
                    <Input 
                        placeholder="Search entities..." 
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
                emptyMessage="No entities found matching your criteria."
                pagination={data ? {
                    page,
                    pageSize: 20, // Default DRF page size, ideally dynamic
                    totalItems: data.count,
                    onPageChange: setPage
                } : undefined}
            />
            </>
            )}

            {activeTab === 'opportunities' && <OpportunitiesList />}
            {activeTab === 'proposals' && <ProposalsList />}

            <EntityModal
                isOpen={isEntityModalOpen}
                onClose={() => setIsEntityModalOpen(false)}
                onSaved={() => setRefreshTrigger(prev => prev + 1)}
                entity={entityToEdit}
            />
        </PageContainer>
    );
};
