import React, { useState, useEffect } from 'react';
import { apiClient } from '../api';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { LoadingState } from '../../../components/ui/LoadingState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Badge } from '../../../components/ui/Badge';
import { StatutorySchemeModal } from './StatutorySchemeModal';
import { StatutoryRuleList } from './StatutoryRuleList';
import { EmployeeStatutoryEnrollmentList } from './EmployeeStatutoryEnrollmentList';
import type { StatutoryScheme } from '../types';

export const StatutorySchemeList: React.FC = () => {
    const [schemes, setSchemes] = useState<StatutoryScheme[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedScheme, setSelectedScheme] = useState<StatutoryScheme | null>(null);
    const [activeTab, setActiveTab] = useState<'SCHEMES' | 'RULES' | 'ENROLLMENTS'>('SCHEMES');

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/api/hrm/statutory-schemes/');
            const data = res.data.results || (Array.isArray(res.data) ? res.data : []);
            setSchemes(data);
            setError(null);
        } catch (err: any) {
            setError(err.message || 'Failed to load statutory schemes');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const columns: Column<StatutoryScheme>[] = [
        { key: 'Name', header: 'Scheme Name', render: (s: StatutoryScheme) => s.name },
        { key: 'Type', header: 'Type', render: (s: StatutoryScheme) => s.scheme_type },
        { key: 'Status', header: 'Status', render: (s: StatutoryScheme) => (
            <Badge variant={s.is_active ? 'success' : 'default'}>{s.is_active ? 'Active' : 'Inactive'}</Badge>
        )},
        { key: 'actions', header: 'Actions', render: (s: StatutoryScheme) => (
            <div style={{ display: 'flex', gap: '8px' }}>
                <Button variant="secondary" onClick={() => { setSelectedScheme(s); setIsModalOpen(true); }}>Edit</Button>
            </div>
        )}
    ];

    if (loading) return <LoadingState message="Loading statutory schemes..." />;
    if (error) return <ErrorState message={error} onRetry={fetchData} />;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', gap: '16px', borderBottom: '1px solid var(--color-border)' }}>
                <button 
                    style={{ padding: '8px 16px', borderBottom: activeTab === 'SCHEMES' ? '2px solid var(--color-primary)' : 'none', cursor: 'pointer', background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none', color: activeTab === 'SCHEMES' ? 'var(--color-primary)' : 'inherit', fontWeight: activeTab === 'SCHEMES' ? 'bold' : 'normal' }}
                    onClick={() => setActiveTab('SCHEMES')}
                >
                    Schemes
                </button>
                <button 
                    style={{ padding: '8px 16px', borderBottom: activeTab === 'RULES' ? '2px solid var(--color-primary)' : 'none', cursor: 'pointer', background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none', color: activeTab === 'RULES' ? 'var(--color-primary)' : 'inherit', fontWeight: activeTab === 'RULES' ? 'bold' : 'normal' }}
                    onClick={() => setActiveTab('RULES')}
                >
                    Rules
                </button>
                <button 
                    style={{ padding: '8px 16px', borderBottom: activeTab === 'ENROLLMENTS' ? '2px solid var(--color-primary)' : 'none', cursor: 'pointer', background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none', color: activeTab === 'ENROLLMENTS' ? 'var(--color-primary)' : 'inherit', fontWeight: activeTab === 'ENROLLMENTS' ? 'bold' : 'normal' }}
                    onClick={() => setActiveTab('ENROLLMENTS')}
                >
                    Enrollments
                </button>
            </div>

            {activeTab === 'SCHEMES' && (
                <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0 }}>Statutory Schemes</h3>
                        <Button variant="primary" onClick={() => { setSelectedScheme(null); setIsModalOpen(true); }}>Add Scheme</Button>
                    </div>
                    <DataTable columns={columns} data={schemes} keyExtractor={(item: any) => item.id} />
                    
                    {isModalOpen && (
                        <StatutorySchemeModal 
                            isOpen={isModalOpen} 
                            onClose={() => setIsModalOpen(false)} 
                            scheme={selectedScheme} 
                            onSave={fetchData} 
                        />
                    )}
                </>
            )}

            {activeTab === 'RULES' && <StatutoryRuleList />}
            {activeTab === 'ENROLLMENTS' && <EmployeeStatutoryEnrollmentList />}
        </div>
    );
};
