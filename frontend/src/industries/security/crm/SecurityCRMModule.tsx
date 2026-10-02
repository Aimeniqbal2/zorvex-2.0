import React, { useState, useEffect, useCallback } from 'react';
import { PageContainer, PageHeader, Toolbar } from '../../../layouts/PageLayout';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { ErrorState } from '../../../components/ui/ErrorState';
import { getEntities, deleteEntity } from '../../../modules/crm/api';
import type { CRMEntity, PaginatedResponse } from '../../../modules/crm/types';
import { EntityModal } from '../../../modules/crm/components/EntityModal';
import { SecurityCustomerDetail } from './components/SecurityCustomerDetail';
import { SecurityProposalsList } from './components/SecurityProposalsList';
import { SecurityProposalDetail } from './components/SecurityProposalDetail';
import { FastCostingGridTab } from './components/FastCostingGridTab';
import { useToastStore } from '../../../stores/toastStore';
import '../../../modules/crm/styles/crm.css';

export const SecurityCRMModule: React.FC = () => {
    // Persistent state
    const [activeTab, setActiveTab] = useState<'customers' | 'proposals' | 'costing_grid'>('customers');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    
    // Data State
    const [data, setData] = useState<PaginatedResponse<CRMEntity> | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Modal State
    const [isEntityModalOpen, setIsEntityModalOpen] = useState(false);

    // Detail Views
    const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
    const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);

    const fetchCustomers = useCallback(async () => {
        setIsLoading(true);
        setHasError(false);
        try {
            // Security CRM primarily uses CUSTOMER type
            const response = await getEntities({
                page,
                search,
                entity_type: 'CUSTOMER'
            });
            setData(response);
        } catch (error) {
            setHasError(true);
        } finally {
            setIsLoading(false);
        }
    }, [page, search, refreshTrigger]);

    const handleDeleteCustomer = async (entity: CRMEntity) => {
        if (!window.confirm(`Are you sure you want to delete client "${entity.name}"? This action will permanently remove the client and all associated proposals and records.`)) {
            return;
        }
        try {
            await deleteEntity(entity.id);
            useToastStore.getState().success(`Client "${entity.name}" deleted successfully.`);
            setRefreshTrigger(prev => prev + 1);
        } catch (err: any) {
            useToastStore.getState().error(err?.response?.data?.error || err?.response?.data?.detail || err?.message || 'Failed to delete client.');
        }
    };

    useEffect(() => {
        if (activeTab === 'customers' && !selectedCustomerId && !selectedProposalId) {
            fetchCustomers();
        }
    }, [fetchCustomers, activeTab, selectedCustomerId, selectedProposalId]);

    const columns: Column<CRMEntity>[] = [
        {
            key: 'name',
            header: 'Client Name',
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
            key: 'primary_contact',
            header: 'Primary Contact',
            render: (entity) => {
                const primary = entity.contacts?.find(c => c.is_primary) || entity.contacts?.[0];
                if (!primary) return <span style={{ color: 'var(--color-text-muted)' }}>—</span>;
                return (
                    <div>
                        <div>{primary.first_name} {primary.last_name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{primary.phone || primary.email}</div>
                    </div>
                );
            }
        },
        {
            key: 'locations',
            header: 'Locations',
            render: (entity) => {
                return <span>{entity.addresses?.length || 0}</span>;
            }
        },
        {
            key: 'actions',
            header: 'Actions',
            render: (entity) => (
                <div style={{ display: 'flex', gap: '8px' }}>
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => setSelectedCustomerId(entity.id)} 
                        aria-label="Open"
                        title="Open Client Details"
                    >
                        <i className='bx bx-folder-open'></i> Open
                    </Button>
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        style={{ color: 'var(--color-danger, #ef4444)' }}
                        onClick={() => handleDeleteCustomer(entity)} 
                        aria-label="Delete"
                        title="Delete Client"
                    >
                        <i className='bx bx-trash'></i> Delete
                    </Button>
                </div>
            )
        }
    ];

    if (hasError) {
        return (
            <PageContainer>
                <ErrorState 
                    title="Failed to load Clients" 
                    message="There was an error communicating with the server." 
                    onRetry={() => setRefreshTrigger(prev => prev + 1)} 
                />
            </PageContainer>
        );
    }

    if (selectedProposalId) {
        return (
            <PageContainer>
                <SecurityProposalDetail 
                    proposalId={selectedProposalId} 
                    onBack={() => {
                        setSelectedProposalId(null);
                        setRefreshTrigger(prev => prev + 1);
                    }} 
                />
            </PageContainer>
        );
    }

    if (selectedCustomerId) {
        return (
            <PageContainer>
                <SecurityCustomerDetail 
                    customerId={selectedCustomerId} 
                    onBack={() => {
                        setSelectedCustomerId(null);
                        setRefreshTrigger(prev => prev + 1);
                    }}
                    onOpenProposal={(id) => setSelectedProposalId(id)}
                />
            </PageContainer>
        );
    }

    return (
        <PageContainer style={activeTab === 'costing_grid' ? { height: '100%', maxHeight: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '12px 20px 8px' } : undefined}>
            {activeTab !== 'costing_grid' && (
                <PageHeader 
                    title="Clients & Contracts" 
                    subtitle="Manage security clients, locations, and proposals"
                    actions={
                        activeTab === 'customers' && (
                            <Button variant="primary" onClick={() => setIsEntityModalOpen(true)}>
                                <i className='bx bx-plus'></i> Add Client
                            </Button>
                        )
                    }
                />
            )}

            <div className="crm-tabs" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', borderBottom: '1px solid var(--color-border)', paddingBottom: activeTab === 'costing_grid' ? '8px' : '16px', marginBottom: activeTab === 'costing_grid' ? '8px' : '16px' }}>
                <button
                    style={{
                        padding: '8px 16px',
                        background: activeTab === 'customers' ? 'var(--color-primary)' : 'var(--color-background)',
                        border: `1px solid ${activeTab === 'customers' ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        borderRadius: '20px',
                        color: activeTab === 'customers' ? 'white' : 'var(--color-text-muted)',
                        fontWeight: 500,
                        fontSize: '13.5px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        boxShadow: activeTab === 'customers' ? '0 4px 10px rgba(var(--color-primary-rgb), 0.25)' : 'none'
                    }}
                    onClick={() => setActiveTab('customers')}
                >
                    Customers
                </button>
                <button
                    style={{
                        padding: '8px 16px',
                        background: activeTab === 'proposals' ? 'var(--color-primary)' : 'var(--color-background)',
                        border: `1px solid ${activeTab === 'proposals' ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        borderRadius: '20px',
                        color: activeTab === 'proposals' ? 'white' : 'var(--color-text-muted)',
                        fontWeight: 500,
                        fontSize: '13.5px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        boxShadow: activeTab === 'proposals' ? '0 4px 10px rgba(var(--color-primary-rgb), 0.25)' : 'none'
                    }}
                    onClick={() => setActiveTab('proposals')}
                >
                    Proposals
                </button>
                <button
                    style={{
                        padding: '8px 16px',
                        background: activeTab === 'costing_grid' ? 'var(--color-primary)' : 'var(--color-background)',
                        border: `1px solid ${activeTab === 'costing_grid' ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        borderRadius: '20px',
                        color: activeTab === 'costing_grid' ? 'white' : 'var(--color-text-muted)',
                        fontWeight: 600,
                        fontSize: '13.5px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        boxShadow: activeTab === 'costing_grid' ? '0 4px 10px rgba(var(--color-primary-rgb), 0.25)' : 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}
                    onClick={() => setActiveTab('costing_grid')}
                >
                    <i className='bx bx-table'></i> Fast Costing Grid
                </button>
            </div>

            {activeTab === 'customers' && (
                <>
                    <Toolbar>
                        <div style={{ width: '300px' }}>
                            <Input 
                                placeholder="Search clients..." 
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
                        emptyMessage="No clients found."
                        pagination={data ? {
                            page,
                            pageSize: 20,
                            totalItems: data.count,
                            onPageChange: setPage
                        } : undefined}
                    />
                </>
            )}

            {activeTab === 'proposals' && (
                <SecurityProposalsList 
                    onOpenProposal={(id) => setSelectedProposalId(id)} 
                />
            )}

            {activeTab === 'costing_grid' && (
                <FastCostingGridTab />
            )}

            <EntityModal
                isOpen={isEntityModalOpen}
                onClose={() => setIsEntityModalOpen(false)}
                onSaved={() => {
                    setRefreshTrigger(prev => prev + 1);
                }}
                entity={null}
            />
        </PageContainer>
    );
};
