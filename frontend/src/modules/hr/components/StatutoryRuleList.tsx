import React, { useState, useEffect } from 'react';
import { apiClient } from '../api';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { LoadingState } from '../../../components/ui/LoadingState';
import { ErrorState } from '../../../components/ui/ErrorState';

import { StatutoryRuleModal } from './StatutoryRuleModal';
import type { StatutoryRule, StatutoryScheme } from '../types';

export const StatutoryRuleList: React.FC = () => {
    const [rules, setRules] = useState<StatutoryRule[]>([]);
    const [schemes, setSchemes] = useState<Record<string, StatutoryScheme>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedRule, setSelectedRule] = useState<StatutoryRule | null>(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [rulesRes, schemesRes] = await Promise.all([
                apiClient.get('/api/hrm/statutory-rules/'),
                apiClient.get('/api/hrm/statutory-schemes/')
            ]);
            const rData = rulesRes.data.results || (Array.isArray(rulesRes.data) ? rulesRes.data : []);
            setRules(rData);

            const sData = schemesRes.data.results || (Array.isArray(schemesRes.data) ? schemesRes.data : []);
            const sMap: Record<string, StatutoryScheme> = {};
            sData.forEach((s: StatutoryScheme) => {
                sMap[s.id] = s;
            });
            setSchemes(sMap);
            setError(null);
        } catch (err: any) {
            setError(err.message || 'Failed to load statutory rules');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const columns: Column<StatutoryRule>[] = [
        { key: 'Scheme', header: 'Scheme', render: (r: StatutoryRule) => schemes[r.scheme]?.name || r.scheme },
        { key: 'EffectiveDates', header: 'Effective Dates', render: (r: StatutoryRule) => `${r.effective_from} to ${r.effective_to || 'Present'}` },
        { key: 'EmployeeRate', header: 'Employee Contrib', render: (r: StatutoryRule) => `${r.employee_rate}${r.is_flat_amount ? '' : '%'}` },
        { key: 'EmployerRate', header: 'Employer Contrib', render: (r: StatutoryRule) => `${r.employer_rate}${r.is_flat_amount ? '' : '%'}` },
        { key: 'Ceiling', header: 'Wage Ceiling', render: (r: StatutoryRule) => r.wage_ceiling || '—' },
        { key: 'actions', header: 'Actions', render: (r: StatutoryRule) => (
            <div style={{ display: 'flex', gap: '8px' }}>
                <Button variant="secondary" onClick={() => { setSelectedRule(r); setIsModalOpen(true); }}>Edit</Button>
            </div>
        )}
    ];

    if (loading) return <LoadingState message="Loading rules..." />;
    if (error) return <ErrorState message={error} onRetry={fetchData} />;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                <Button variant="primary" onClick={() => { setSelectedRule(null); setIsModalOpen(true); }}>Add Rule</Button>
            </div>
            <DataTable columns={columns} data={rules} keyExtractor={(item: any) => item.id} />
            
            {isModalOpen && (
                <StatutoryRuleModal 
                    isOpen={isModalOpen} 
                    onClose={() => setIsModalOpen(false)} 
                    rule={selectedRule} 
                    onSave={fetchData}
                    schemes={Object.values(schemes)}
                />
            )}
        </div>
    );
};
