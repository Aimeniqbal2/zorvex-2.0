import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader, Toolbar } from '../../../layouts/PageLayout';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { useToastStore } from '../../../stores/toastStore';
import { apiClient } from '../api';
import type { Candidate, CandidateDocument, CandidateVerification } from '../types';
import { CandidateVerificationModal } from './CandidateVerificationModal';
import { CandidateDocumentModal } from './CandidateDocumentModal';

interface CandidateDetailProps {
    candidateId: string;
    onBack: () => void;
}

export const CandidateDetail: React.FC<CandidateDetailProps> = ({ candidateId, onBack }) => {
    const [candidate, setCandidate] = useState<Candidate | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isVerificationModalOpen, setIsVerificationModalOpen] = useState(false);
    const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);
    const [selectedVerification, setSelectedVerification] = useState<CandidateVerification | null>(null);
    const [selectedDocument, setSelectedDocument] = useState<CandidateDocument | null>(null);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await apiClient.get(`/api/hrm/candidates/${candidateId}/`);
            setCandidate(res.data);
        } catch (error: any) {
            useToastStore.getState().error('Failed to load candidate details');
        } finally {
            setIsLoading(false);
        }
    }, [candidateId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleAction = async (action: 'select' | 'hire' | 'reject') => {
        try {
            await apiClient.post(`/api/hrm/candidates/${candidateId}/${action}/`);
            useToastStore.getState().success(`Candidate marked as ${action}`);
            loadData();
        } catch (error: any) {
            useToastStore.getState().error(`Failed to ${action} candidate`);
        }
    };

    const handleUpdateDocStatus = async (id: string, status: string) => {
        try {
            await apiClient.patch(`/api/hrm/candidate-documents/${id}/`, { status });
            useToastStore.getState().success('Document status updated');
            loadData();
        } catch (error) {
            useToastStore.getState().error('Failed to update document status');
        }
    };

    const handleUpdateVerificationStatus = async (id: string, status: string) => {
        try {
            await apiClient.patch(`/api/hrm/candidate-verifications/${id}/`, { status });
            useToastStore.getState().success('Verification status updated');
            loadData();
        } catch (error) {
            useToastStore.getState().error('Failed to update verification status');
        }
    };

    if (isLoading || !candidate) {
        return <div style={{ padding: '24px' }}>Loading...</div>;
    }

    const docColumns: Column<CandidateDocument>[] = [
        { key: 'document_type', header: 'Type', render: (row) => row.document_type },
        { key: 'document_number', header: 'Doc Number', render: (row) => row.document_number || 'N/A' },
        { key: 'status', header: 'Status', render: (row) => <Badge>{row.status}</Badge> },
        { 
            key: 'actions', 
            header: 'Actions', 
            render: (row) => (
                <div style={{ display: 'flex', gap: '4px' }}>
                    <select 
                        value={row.status} 
                        onChange={(e) => handleUpdateDocStatus(row.id, e.target.value)}
                        style={{ padding: '4px', borderRadius: '4px', border: '1px solid var(--color-border)' }}
                    >
                        <option value="PENDING">PENDING</option>
                        <option value="VERIFIED">VERIFIED</option>
                        <option value="REJECTED">REJECTED</option>
                    </select>
                    <Button variant="ghost" onClick={() => { setSelectedDocument(row); setIsDocumentModalOpen(true); }} title="Edit">
                        <i className='bx bx-edit'></i>
                    </Button>
                </div>
            )
        }
    ];

    const vetColumns: Column<CandidateVerification>[] = [
        { key: 'verification_type', header: 'Type', render: (row) => row.verification_type },
        { key: 'reference_number', header: 'Reference', render: (row) => row.reference_number || 'N/A' },
        { key: 'status', header: 'Status', render: (row) => <Badge>{row.status}</Badge> },
        { 
            key: 'actions', 
            header: 'Actions', 
            render: (row) => (
                <div style={{ display: 'flex', gap: '4px' }}>
                    <select 
                        value={row.status} 
                        onChange={(e) => handleUpdateVerificationStatus(row.id, e.target.value)}
                        style={{ padding: '4px', borderRadius: '4px', border: '1px solid var(--color-border)' }}
                    >
                        <option value="PENDING">PENDING</option>
                        <option value="IN_PROGRESS">IN_PROGRESS</option>
                        <option value="COMPLETED">COMPLETED</option>
                        <option value="FAILED">FAILED</option>
                    </select>
                    <Button variant="ghost" onClick={() => { setSelectedVerification(row); setIsVerificationModalOpen(true); }} title="Edit">
                        <i className='bx bx-edit'></i>
                    </Button>
                </div>
            )
        }
    ];

    return (
        <div>
            <div style={{ marginBottom: '16px' }}>
                <Button variant="ghost" onClick={onBack}>
                    <i className='bx bx-arrow-back'></i> Back to Recruitment
                </Button>
            </div>

            <PageHeader 
                title={`${candidate.first_name} ${candidate.last_name}`}
                subtitle={`Candidate # ${candidate.candidate_number} | Applied for: ${candidate.applied_designation_name}`}
                actions={
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {candidate.status !== 'HIRED' && candidate.status !== 'REJECTED' && (
                            <Button variant="secondary" onClick={() => handleAction('reject')}>Reject</Button>
                        )}
                        {(candidate.status === 'APPLIED' || candidate.status === 'SCREENING') && (
                            <Button variant="primary" onClick={() => handleAction('select')}>Mark Selected</Button>
                        )}
                        {(candidate.status === 'SELECTED' || candidate.status === 'VERIFICATION') && (
                            <Button variant="primary" onClick={() => handleAction('hire')} style={{ backgroundColor: 'var(--color-success)', borderColor: 'var(--color-success)', color: 'white' }}>Hire Employee</Button>
                        )}
                        <Badge>{candidate.status}</Badge>
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
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Phone</div>
                    <div style={{ fontWeight: 500 }}>{candidate.phone || 'N/A'}</div>
                </div>
                <div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Email</div>
                    <div style={{ fontWeight: 500 }}>{candidate.email || 'N/A'}</div>
                </div>
                <div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>National ID</div>
                    <div style={{ fontWeight: 500 }}>{candidate.national_id || 'N/A'}</div>
                </div>
                <div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Date of Birth</div>
                    <div style={{ fontWeight: 500 }}>{candidate.date_of_birth || 'N/A'}</div>
                </div>
            </div>

            <Toolbar>
                <div style={{ fontWeight: 600 }}>Documents</div>
                <div style={{ flex: 1 }} />
                <Button variant="secondary" onClick={() => { setSelectedDocument(null); setIsDocumentModalOpen(true); }}>Add Document</Button>
            </Toolbar>
            <DataTable 
                data={candidate.documents || []}
                columns={docColumns}
                keyExtractor={(row) => row.id}
                emptyMessage="No documents found."
            />

            <Toolbar>
                <div style={{ fontWeight: 600 }}>Police Verification & Vetting</div>
                <div style={{ flex: 1 }} />
                <Button variant="secondary" onClick={() => { setSelectedVerification(null); setIsVerificationModalOpen(true); }}>Initiate Verification</Button>
            </Toolbar>
            <DataTable 
                data={candidate.verifications || []}
                columns={vetColumns}
                keyExtractor={(row) => row.id}
                emptyMessage="No verifications found."
            />

            {isVerificationModalOpen && (
                <CandidateVerificationModal
                    isOpen={isVerificationModalOpen}
                    onClose={() => setIsVerificationModalOpen(false)}
                    onSaved={loadData}
                    candidateId={candidateId}
                    verification={selectedVerification}
                />
            )}

            {isDocumentModalOpen && (
                <CandidateDocumentModal
                    isOpen={isDocumentModalOpen}
                    onClose={() => setIsDocumentModalOpen(false)}
                    onSaved={loadData}
                    candidateId={candidateId}
                    document={selectedDocument}
                />
            )}
        </div>
    );
};
