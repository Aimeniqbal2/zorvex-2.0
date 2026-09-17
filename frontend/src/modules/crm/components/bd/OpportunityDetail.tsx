import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader, Toolbar } from '../../../../layouts/PageLayout';
import { Button } from '../../../../components/ui/Button';
import { Badge } from '../../../../components/ui/Badge';
import { DataTable } from '../../../../components/tables/DataTable';
import type { Column } from '../../../../components/tables/DataTable';
import { useToastStore } from '../../../../stores/toastStore';
import { useCrmStore } from '../../store/useCrmStore';
import { 
    getOpportunity, getProposals, getOpportunityAwards, convertOpportunityToContract, downloadAwardAttachment
} from '../../api';
import type { Opportunity, Proposal, OpportunityAward } from '../../types';
import { OpportunityModal } from './OpportunityModal';
import { OpportunityAwardModal } from './OpportunityAwardModal';
import { ProposalModal } from './ProposalModal';
import { ErrorState } from '../../../../components/ui/ErrorState';

interface OpportunityDetailProps {
    opportunityId: string;
    onBack: () => void;
}

export const OpportunityDetail: React.FC<OpportunityDetailProps> = ({ opportunityId, onBack }) => {
    const { setSelectedProposalId } = useCrmStore();
    const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
    const [proposals, setProposals] = useState<Proposal[]>([]);
    const [awards, setAwards] = useState<OpportunityAward[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    
    // Modals
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isProposalModalOpen, setIsProposalModalOpen] = useState(false);
    const [isAwardModalOpen, setIsAwardModalOpen] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        setHasError(false);
        try {
            const [oppData, propData, awardsData] = await Promise.all([
                getOpportunity(opportunityId),
                getProposals({ opportunity: opportunityId }),
                getOpportunityAwards(opportunityId)
            ]);
            setOpportunity(oppData);
            setProposals(propData.results || []);
            setAwards(awardsData.results || []);
        } catch (error) {
            setHasError(true);
            useToastStore.getState().error('Failed to load opportunity details');
        } finally {
            setIsLoading(false);
        }
    }, [opportunityId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleConvertToContract = async () => {
        if (!window.confirm('Are you sure you want to convert this opportunity to a contract?')) return;
        setIsProcessing(true);
        try {
            await convertOpportunityToContract(opportunityId);
            useToastStore.getState().success('Successfully converted to contract');
            loadData();
        } catch (error) {
            useToastStore.getState().error('Failed to convert to contract');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDownloadAttachment = async (awardId: string, filename: string) => {
        try {
            await downloadAwardAttachment(awardId, filename);
        } catch (error) {
            useToastStore.getState().error('Failed to download attachment');
        }
    };

    const proposalColumns: Column<Proposal>[] = [
        {
            key: 'proposal_number',
            header: 'Number',
            render: (prop) => `${prop.proposal_number} v${prop.version}`
        },
        {
            key: 'title',
            header: 'Title',
            render: (prop) => prop.title
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

    const awardColumns: Column<OpportunityAward>[] = [
        {
            key: 'award_reference',
            header: 'Reference',
            render: (award) => award.award_reference
        },
        {
            key: 'proposal',
            header: 'Proposal',
            render: (award) => award.proposal_number || 'Direct Award'
        },
        {
            key: 'method',
            header: 'Method',
            render: (award) => <Badge variant="default">{award.method}</Badge>
        },
        {
            key: 'award_date',
            header: 'Date',
            render: (award) => award.award_date
        },
        {
            key: 'actions',
            header: 'Actions',
            render: (award) => (
                award.attachment ? (
                    <Button variant="ghost" onClick={() => handleDownloadAttachment(award.id, `award_${award.award_reference}`)}>
                        <i className='bx bx-download'></i>
                    </Button>
                ) : <span style={{ color: 'var(--color-text-muted)' }}>No File</span>
            )
        }
    ];

    if (hasError) {
        return (
            <ErrorState 
                title="Failed to load opportunity" 
                message="There was an error retrieving the opportunity details." 
                onRetry={loadData} 
            />
        );
    }

    if (isLoading || !opportunity) {
        return <div style={{ padding: '24px' }}>Loading opportunity details...</div>;
    }

    return (
        <div>
            <div style={{ marginBottom: '16px' }}>
                <Button variant="ghost" onClick={onBack}>
                    <i className='bx bx-arrow-back'></i> Back to List
                </Button>
            </div>

            <PageHeader 
                title={`${opportunity.opportunity_number} - ${opportunity.title}`}
                subtitle={`Client: ${opportunity.crm_entity_name}`}
                actions={
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <Button variant="secondary" onClick={() => setIsEditModalOpen(true)}>Edit</Button>
                        {opportunity.stage === 'AWARDED' && !opportunity.converted_contract && (
                            <Button variant="primary" onClick={handleConvertToContract} loading={isProcessing}>
                                Convert to Contract
                            </Button>
                        )}
                        {opportunity.converted_contract && (
                            <Badge variant="success">Contracted ({opportunity.converted_contract_code})</Badge>
                        )}
                        <Badge>{opportunity.stage}</Badge>
                    </div>
                }
            />

            <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                gap: '16px', 
                marginBottom: '24px',
                padding: '16px',
                background: 'var(--color-surface)',
                borderRadius: '8px',
                border: '1px solid var(--color-border)'
            }}>
                <div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Estimated Value</div>
                    <div style={{ fontWeight: 500 }}>{opportunity.estimated_value || 'N/A'}</div>
                </div>
                <div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Probability</div>
                    <div style={{ fontWeight: 500 }}>{opportunity.probability ? `${opportunity.probability}%` : 'N/A'}</div>
                </div>
                <div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Expected Close</div>
                    <div style={{ fontWeight: 500 }}>{opportunity.expected_close_date || 'N/A'}</div>
                </div>
                <div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Owner</div>
                    <div style={{ fontWeight: 500 }}>{opportunity.owner_name || 'Unassigned'}</div>
                </div>
                <div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Source</div>
                    <div style={{ fontWeight: 500 }}>{opportunity.source || 'N/A'}</div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div>
                    <Toolbar>
                        <div style={{ fontWeight: 600 }}>Proposals</div>
                        <div style={{ flex: 1 }} />
                        <Button variant="secondary" onClick={() => setIsProposalModalOpen(true)}>New Proposal</Button>
                    </Toolbar>
                    <DataTable 
                        data={proposals}
                        columns={proposalColumns}
                        keyExtractor={(row) => row.id}
                        emptyMessage="No proposals found for this opportunity."
                    />
                </div>

                <div>
                    <Toolbar>
                        <div style={{ fontWeight: 600 }}>Awards</div>
                        <div style={{ flex: 1 }} />
                        <Button variant="secondary" onClick={() => setIsAwardModalOpen(true)}>Record Award</Button>
                    </Toolbar>
                    <DataTable 
                        data={awards}
                        columns={awardColumns}
                        keyExtractor={(row) => row.id}
                        emptyMessage="No awards recorded yet."
                    />
                </div>
            </div>

            {/* Modals */}
            {isEditModalOpen && (
                <OpportunityModal
                    isOpen={isEditModalOpen}
                    onClose={() => setIsEditModalOpen(false)}
                    onSaved={loadData}
                    opportunity={opportunity}
                />
            )}

            {isProposalModalOpen && (
                <ProposalModal
                    isOpen={isProposalModalOpen}
                    onClose={() => setIsProposalModalOpen(false)}
                    onSaved={loadData}
                />
            )}

            {isAwardModalOpen && (
                <OpportunityAwardModal
                    isOpen={isAwardModalOpen}
                    onClose={() => setIsAwardModalOpen(false)}
                    onSaved={loadData}
                    opportunityId={opportunityId}
                />
            )}
        </div>
    );
};
