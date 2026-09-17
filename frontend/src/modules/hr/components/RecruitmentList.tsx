import React, { useState, useEffect } from 'react';
import { apiClient } from '../api';
import type { Candidate } from '../types';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/tables/DataTable';
import { LoadingState } from '../../../components/ui/LoadingState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { CandidateModal } from './CandidateModal';
import { Badge } from '../../../components/ui/Badge';

import { CandidateDetail } from './CandidateDetail';

export const RecruitmentList: React.FC = () => {
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
    const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);

    const fetchCandidates = async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/api/hrm/candidates/');
            setCandidates(res.data.results || (Array.isArray(res.data) ? res.data : []));
            setError(null);
        } catch (err: any) {
            setError(err.message || 'Failed to load candidates');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!selectedCandidateId) {
            fetchCandidates();
        }
    }, [selectedCandidateId]);

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'APPLIED': return 'primary';
            case 'SCREENING': return 'warning';
            case 'SELECTED': return 'default';
            case 'VERIFICATION': return 'warning';
            case 'APPROVED': return 'success';
            case 'HIRED': return 'success';
            case 'REJECTED': return 'danger';
            default: return 'default';
        }
    };

    if (selectedCandidateId) {
        return <CandidateDetail candidateId={selectedCandidateId} onBack={() => setSelectedCandidateId(null)} />;
    }

    const columns = [
        { key: 'No.', header: 'No.', render: (c: Candidate) => c.candidate_number },
        { key: 'Name', header: 'Name',  render: (c: Candidate) => `${c.first_name} ${c.last_name}` },
        { key: 'Applied For', header: 'Applied For',  render: (c: Candidate) => c.applied_designation_name || '—' },
        { key: 'Phone', header: 'Phone', render: (c: Candidate) => c.phone },
        { key: 'status', 
            header: 'Status', 
            render: (c: Candidate) => (
                <Badge variant={getStatusColor(c.status)}>{c.status}</Badge>
            )
        },
        { key: 'Date', header: 'Date', render: (c: Candidate) => c.application_date },
        { key: 'actions', header: 'Actions',
            render: (c: Candidate) => (
                <div style={{ display: 'flex', gap: '4px' }}>
                    <Button 
                        variant="secondary" 
                        onClick={() => setSelectedCandidateId(c.id)}
                    >
                        View / Vetting
                    </Button>
                    <Button 
                        variant="ghost" 
                        onClick={() => { setSelectedCandidate(c); setIsModalOpen(true); }}
                    >
                        <i className='bx bx-edit'></i> Edit Bio
                    </Button>
                </div>
            )
        }
    ];

    if (loading) return <LoadingState message="Loading recruitment..." />;
    if (error) return <ErrorState message={error} onRetry={fetchCandidates} />;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Recruitment & Vetting</h3>
                <Button variant="primary" onClick={() => { setSelectedCandidate(null); setIsModalOpen(true); }}>
                    New Candidate
                </Button>
            </div>
            <DataTable columns={columns} data={candidates} keyExtractor={(item: any) => item.id} />
            
            {isModalOpen && (
                <CandidateModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    candidate={selectedCandidate}
                    onSave={fetchCandidates}
                />
            )}
        </div>
    );
};
