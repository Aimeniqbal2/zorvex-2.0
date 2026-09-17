import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader, Toolbar } from '../../../../layouts/PageLayout';
import { Button } from '../../../../components/ui/Button';
import { Badge } from '../../../../components/ui/Badge';
import { DataTable } from '../../../../components/tables/DataTable';
import type { Column } from '../../../../components/tables/DataTable';
import { useToastStore } from '../../../../stores/toastStore';
import { 
    getProposal, getProposalLines, submitProposal, acceptProposal, deleteProposalLine 
} from '../../api';
import type { Proposal, ProposalLine } from '../../types';
import { ProposalModal } from './ProposalModal';
import { ProposalLineModal } from './ProposalLineModal';
import { ErrorState } from '../../../../components/ui/ErrorState';

interface ProposalDetailProps {
    proposalId: string;
    onBack: () => void;
}

export const ProposalDetail: React.FC<ProposalDetailProps> = ({ proposalId, onBack }) => {
    const [proposal, setProposal] = useState<Proposal | null>(null);
    const [lines, setLines] = useState<ProposalLine[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    
    // Modals
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isLineModalOpen, setIsLineModalOpen] = useState(false);
    const [lineToEdit, setLineToEdit] = useState<ProposalLine | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        setHasError(false);
        try {
            const [propData, linesData] = await Promise.all([
                getProposal(proposalId),
                getProposalLines(proposalId)
            ]);
            setProposal(propData);
            setLines(linesData.results || []);
        } catch (error) {
            setHasError(true);
            useToastStore.getState().error('Failed to load proposal details');
        } finally {
            setIsLoading(false);
        }
    }, [proposalId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleEditLine = (line: ProposalLine) => {
        setLineToEdit(line);
        setIsLineModalOpen(true);
    };

    const handleAddLine = () => {
        setLineToEdit(null);
        setIsLineModalOpen(true);
    };

    const handleDeleteLine = async (id: string) => {
        if (!window.confirm('Are you sure you want to delete this line item?')) return;
        try {
            await deleteProposalLine(id);
            useToastStore.getState().success('Line deleted successfully');
            loadData();
        } catch (error) {
            useToastStore.getState().error('Failed to delete line');
        }
    };

    const handleSubmit = async () => {
        if (!window.confirm('Are you sure you want to submit this proposal?')) return;
        setIsProcessing(true);
        try {
            await submitProposal(proposalId);
            useToastStore.getState().success('Proposal submitted successfully');
            loadData();
        } catch (error) {
            useToastStore.getState().error('Failed to submit proposal');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleAccept = async () => {
        if (!window.confirm('Are you sure you want to mark this proposal as accepted?')) return;
        setIsProcessing(true);
        try {
            await acceptProposal(proposalId);
            useToastStore.getState().success('Proposal accepted successfully');
            loadData();
        } catch (error) {
            useToastStore.getState().error('Failed to accept proposal');
        } finally {
            setIsProcessing(false);
        }
    };

    const lineColumns: Column<ProposalLine>[] = [
        {
            key: 'description',
            header: 'Description',
            render: (line) => (
                <div>
                    <div style={{ fontWeight: 500 }}>{line.description}</div>
                    {line.designation_name && <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{line.designation_name}</div>}
                </div>
            )
        },
        {
            key: 'quantity',
            header: 'Qty',
            render: (line) => line.quantity
        },
        {
            key: 'unit',
            header: 'Unit',
            render: (line) => line.unit
        },
        {
            key: 'rate',
            header: 'Rate',
            render: (line) => line.rate
        },
        {
            key: 'amount',
            header: 'Amount',
            render: (line) => line.amount
        },
        {
            key: 'actions',
            header: 'Actions',
            render: (line) => (
                <div style={{ display: 'flex', gap: '4px' }}>
                    <Button variant="ghost" onClick={() => handleEditLine(line)} disabled={proposal?.status !== 'DRAFT'}>
                        <i className='bx bx-edit'></i>
                    </Button>
                    <Button variant="ghost" onClick={() => handleDeleteLine(line.id)} disabled={proposal?.status !== 'DRAFT'}>
                        <i className='bx bx-trash' style={{ color: 'var(--color-error)' }}></i>
                    </Button>
                </div>
            )
        }
    ];

    if (hasError) {
        return (
            <ErrorState 
                title="Failed to load proposal" 
                message="There was an error retrieving the proposal details." 
                onRetry={loadData} 
            />
        );
    }

    if (isLoading || !proposal) {
        return <div style={{ padding: '24px' }}>Loading proposal details...</div>;
    }

    return (
        <div>
            <div style={{ marginBottom: '16px' }}>
                <Button variant="ghost" onClick={onBack}>
                    <i className='bx bx-arrow-back'></i> Back to List
                </Button>
            </div>

            <PageHeader 
                title={`${proposal.proposal_number} - ${proposal.title}`}
                subtitle={`Opportunity: ${proposal.opportunity_title} | Version: ${proposal.version}`}
                actions={
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {proposal.status === 'DRAFT' && (
                            <>
                                <Button variant="secondary" onClick={() => setIsEditModalOpen(true)}>Edit Header</Button>
                                <Button variant="primary" onClick={handleSubmit} loading={isProcessing}>Submit Proposal</Button>
                            </>
                        )}
                        {['SUBMITTED', 'REVISED'].includes(proposal.status) && (
                            <Button variant="primary" onClick={handleAccept} loading={isProcessing}>Accept Proposal</Button>
                        )}
                        <Badge>{proposal.status}</Badge>
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
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Issue Date</div>
                    <div style={{ fontWeight: 500 }}>{proposal.issue_date}</div>
                </div>
                <div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Valid Until</div>
                    <div style={{ fontWeight: 500 }}>{proposal.valid_until || 'N/A'}</div>
                </div>
                <div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Currency</div>
                    <div style={{ fontWeight: 500 }}>{proposal.currency}</div>
                </div>
                <div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Subtotal</div>
                    <div style={{ fontWeight: 500 }}>{proposal.subtotal}</div>
                </div>
                <div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Total</div>
                    <div style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{proposal.total}</div>
                </div>
            </div>

            <Toolbar>
                <div style={{ fontWeight: 600 }}>Line Items</div>
                <div style={{ flex: 1 }} />
                {proposal.status === 'DRAFT' && (
                    <Button variant="primary" onClick={handleAddLine}>Add Line</Button>
                )}
            </Toolbar>
            
            <DataTable 
                data={lines}
                columns={lineColumns}
                keyExtractor={(row) => row.id}
                emptyMessage="No line items found for this proposal."
            />

            {/* Modals */}
            {isEditModalOpen && (
                <ProposalModal
                    isOpen={isEditModalOpen}
                    onClose={() => setIsEditModalOpen(false)}
                    onSaved={loadData}
                    proposal={proposal}
                />
            )}

            {isLineModalOpen && (
                <ProposalLineModal
                    isOpen={isLineModalOpen}
                    onClose={() => setIsLineModalOpen(false)}
                    onSaved={loadData}
                    proposalId={proposalId}
                    line={lineToEdit}
                />
            )}
        </div>
    );
};
