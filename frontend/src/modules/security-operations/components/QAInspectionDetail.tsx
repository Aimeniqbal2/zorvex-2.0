import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader, Toolbar } from '../../../layouts/PageLayout';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { useToastStore } from '../../../stores/toastStore';
import { getQAInspection, apiClient, submitQAInspection } from '../api';
import type { QAInspection, QAInspectionResponse, QAFinding } from '../types';
import { QAFindingModal } from './QAFindingModal';
import { CorrectiveActionModal } from './CorrectiveActionModal';

interface QAInspectionDetailProps {
    inspectionId: string;
    onBack: () => void;
}

export const QAInspectionDetail: React.FC<QAInspectionDetailProps> = ({ inspectionId, onBack }) => {
    const [inspection, setInspection] = useState<QAInspection | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isFindingModalOpen, setIsFindingModalOpen] = useState(false);
    const [selectedFinding, setSelectedFinding] = useState<QAFinding | null>(null);
    const [isActionModalOpen, setIsActionModalOpen] = useState(false);
    const [actionFindingContext, setActionFindingContext] = useState<QAFinding | null>(null);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await getQAInspection(inspectionId);
            setInspection(data);
        } catch (error) {
            useToastStore.getState().error('Failed to load inspection details');
        } finally {
            setIsLoading(false);
        }
    }, [inspectionId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleSubmit = async () => {
        if (!window.confirm('Are you sure you want to submit this inspection?')) return;
        setIsProcessing(true);
        try {
            await submitQAInspection(inspectionId);
            useToastStore.getState().success('Inspection submitted');
            loadData();
        } catch (error) {
            useToastStore.getState().error('Failed to submit inspection');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleUpdateResponse = async (id: string, result: string, notes: string) => {
        try {
            await apiClient.patch(`/api/operations/qa-responses/${id}/`, { result, notes });
            useToastStore.getState().success('Response updated');
            loadData();
        } catch (error) {
            useToastStore.getState().error('Failed to update response');
        }
    };

    const handleEditFinding = (finding: QAFinding) => {
        setSelectedFinding(finding);
        setIsFindingModalOpen(true);
    };

    const handleNewFinding = () => {
        setSelectedFinding(null);
        setIsFindingModalOpen(true);
    };

    const handleCreateAction = (finding: QAFinding) => {
        setActionFindingContext(finding);
        setIsActionModalOpen(true);
    };

    if (isLoading || !inspection) {
        return <div style={{ padding: '24px' }}>Loading...</div>;
    }

    const responseColumns: Column<QAInspectionResponse>[] = [
        {
            key: 'checklist_item',
            header: 'Item',
            render: (res) => res.checklist_item_text || res.checklist_item
        },
        {
            key: 'result',
            header: 'Result',
            render: (res: any) => (
                <select 
                    value={res.result} 
                    onChange={(e) => handleUpdateResponse(res.id, e.target.value, res.notes)}
                    disabled={inspection.status !== 'DRAFT'}
                    style={{ padding: '4px', borderRadius: '4px', border: '1px solid var(--color-border)' }}
                >
                    <option value="PASS">PASS</option>
                    <option value="FAIL">FAIL</option>
                    <option value="N/A">N/A</option>
                </select>
            )
        },
        {
            key: 'notes',
            header: 'Notes',
            render: (res: any) => (
                <input 
                    type="text" 
                    value={res.notes || ''}
                    onChange={(e) => handleUpdateResponse(res.id, res.result, e.target.value)}
                    disabled={inspection.status !== 'DRAFT'}
                    style={{ padding: '4px', width: '100%', border: '1px solid var(--color-border)', borderRadius: '4px' }}
                    onBlur={(e) => handleUpdateResponse(res.id, res.result, e.target.value)}
                />
            )
        }
    ];

    const findingColumns: Column<QAFinding>[] = [
        {
            key: 'item',
            header: 'Checklist Item',
            render: (find: any) => find.checklist_item_text || 'General'
        },
        { key: 'finding_text', header: 'Finding', render: (row: QAFinding) => row.description },
        { key: 'severity', header: 'Severity', render: (row: QAFinding) => <Badge variant={row.severity === 'HIGH' ? 'danger' : row.severity === 'MEDIUM' ? 'warning' : 'default'}>{row.severity}</Badge> },
        {
            key: 'status',
            header: 'Status',
            render: (find: any) => <Badge>{find.status}</Badge>
        },
        { key: 'actions', header: 'Actions', render: (row: QAFinding) => (
            <div style={{ display: 'flex', gap: '8px' }}>
                    <Button variant="ghost" onClick={() => handleEditFinding(row)} title="Edit Finding">
                        <i className='bx bx-edit'></i>
                    </Button>
                    <Button variant="ghost" onClick={() => handleCreateAction(row)} title="Create Action Plan">
                        <i className='bx bx-plus-circle'></i>
                    </Button>
                </div>
            )
        }
    ];

    return (
        <div>
            <div style={{ marginBottom: '16px' }}>
                <Button variant="ghost" onClick={onBack}>
                    <i className='bx bx-arrow-back'></i> Back to List
                </Button>
            </div>

            <PageHeader 
                title={`Inspection: ${inspection.template_name}`}
                subtitle={`${inspection.operational_site_name} | ${inspection.inspection_date}`}
                actions={
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {inspection.status === 'DRAFT' && (
                            <Button variant="primary" onClick={handleSubmit} loading={isProcessing}>Submit</Button>
                        )}
                        <Badge>{inspection.status}</Badge>
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
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Inspector</div>
                    <div style={{ fontWeight: 500 }}>{inspection.inspector_name}</div>
                </div>
                <div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Contract</div>
                    <div style={{ fontWeight: 500 }}>{inspection.service_contract_number || 'N/A'}</div>
                </div>
                <div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Score</div>
                    <div style={{ fontWeight: 500 }}>{inspection.score !== null ? `${inspection.score}%` : 'Pending'}</div>
                </div>
            </div>

            <Toolbar>
                <div style={{ fontWeight: 600 }}>Inspection Items</div>
            </Toolbar>
            <DataTable 
                data={inspection.responses || []}
                columns={responseColumns}
                keyExtractor={(row: any) => row.id}
                emptyMessage="No items to inspect."
            />

            <Toolbar>
                <div style={{ fontWeight: 600 }}>Findings</div>
                <div style={{ flex: 1 }} />
                <Button variant="secondary" onClick={handleNewFinding}>Record Finding</Button>
            </Toolbar>
            <DataTable 
                data={inspection.findings || []}
                columns={findingColumns}
                keyExtractor={(row: any) => row.id}
                emptyMessage="No findings recorded."
            />

            {isFindingModalOpen && (
                <QAFindingModal
                    isOpen={isFindingModalOpen}
                    onClose={() => setIsFindingModalOpen(false)}
                    onSaved={loadData}
                    inspectionId={inspectionId}
                    finding={selectedFinding}
                    responses={inspection.responses || []}
                />
            )}

            {isActionModalOpen && actionFindingContext && (
                <CorrectiveActionModal
                    isOpen={isActionModalOpen}
                    onClose={() => setIsActionModalOpen(false)}
                    onSaved={loadData}
                    finding={actionFindingContext}
                />
            )}
        </div>
    );
};
