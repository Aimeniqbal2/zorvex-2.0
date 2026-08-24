import React, { useState, useEffect } from 'react';
import { apiClient } from '../api';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { LoadingState } from '../../../components/ui/LoadingState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Badge } from '../../../components/ui/Badge';
import { StaffingRequirementModal } from './StaffingRequirementModal';

export const StaffingRequirementsView: React.FC = () => {
    const [requirements, setRequirements] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedReq, setSelectedReq] = useState<any | null>(null);

    const fetchRequirements = async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/api/operations/staffing-requirements/');
            setRequirements(res.data.results || (Array.isArray(res.data) ? res.data : []));
            setError(null);
        } catch (err: any) {
            setError(err.message || 'Failed to load staffing requirements');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRequirements();
    }, []);

    const columns: Column<any>[] = [
        { key: 'Contract', header: 'Contract', render: (r: any) => r.contract_code },
        { key: 'Site', header: 'Site', render: (r: any) => r.site_name },
        { key: 'Designation', header: 'Designation', render: (r: any) => r.designation_name },
        { key: 'Shift', header: 'Shift', render: (r: any) => r.shift_name },
        { key: 'Required', header: 'Required Headcount', render: (r: any) => r.required_headcount },
        { key: 'EffectiveFrom', header: 'Effective From', render: (r: any) => r.effective_from },
        { key: 'Status', header: 'Status', render: (r: any) => (
            <Badge variant={r.is_active ? 'success' : 'default'}>
                {r.is_active ? 'Active' : 'Inactive'}
            </Badge>
        )},
        { key: 'actions', header: 'Actions', render: (r: any) => (
            <div style={{ display: 'flex', gap: '8px' }}>
                <Button variant="secondary" onClick={() => { setSelectedReq(r); setIsModalOpen(true); }}>Edit</Button>
            </div>
        )}
    ];

    if (loading) return <LoadingState message="Loading staffing requirements..." />;
    if (error) return <ErrorState message={error} onRetry={fetchRequirements} />;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Staffing Requirements</h3>
                <Button variant="primary" onClick={() => { setSelectedReq(null); setIsModalOpen(true); }}>
                    Add Requirement
                </Button>
            </div>
            
            <DataTable columns={columns} data={requirements} keyExtractor={(item: any) => item.id} />
            
            {isModalOpen && (
                <StaffingRequirementModal 
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    requirement={selectedReq}
                    onSave={fetchRequirements}
                />
            )}
        </div>
    );
};
