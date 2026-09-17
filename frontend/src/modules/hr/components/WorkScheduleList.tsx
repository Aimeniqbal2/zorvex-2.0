import React, { useState, useEffect } from 'react';
import { apiClient } from '../api';
import type { WorkSchedule } from '../types';
import { Button } from '../../../components/ui/Button';
import { DataTable } from '../../../components/tables/DataTable';
import type { Column } from '../../../components/tables/DataTable';
import { LoadingState } from '../../../components/ui/LoadingState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { Badge } from '../../../components/ui/Badge';
import { WorkScheduleModal } from './WorkScheduleModal';

export const WorkScheduleList: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const [schedules, setSchedules] = useState<WorkSchedule[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedSchedule, setSelectedSchedule] = useState<WorkSchedule | null>(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/api/hrm/work_schedules/');
            const data = res.data.results || (Array.isArray(res.data) ? res.data : []);
            setSchedules(data);
            setError(null);
        } catch (err: any) {
            setError(err.message || 'Failed to load work schedules');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const columns: Column<WorkSchedule>[] = [
        { key: 'Employee', header: 'Employee', render: (s: WorkSchedule) => s.employee_name || s.employee },
        { key: 'Shift', header: 'Shift', render: (s: WorkSchedule) => s.shift_name || s.shift },
        { key: 'Effective', header: 'Effective Dates', render: (s: WorkSchedule) => `${s.effective_from} to ${s.effective_to || 'Present'}` },
        { key: 'Days', header: 'Days of Week', render: (s: WorkSchedule) => s.days_of_week },
        { key: 'Status', header: 'Status', render: (s: WorkSchedule) => (
            <Badge variant={s.is_active ? 'success' : 'default'}>{s.is_active ? 'Active' : 'Inactive'}</Badge>
        )},
        { key: 'actions', header: 'Actions', render: (s: WorkSchedule) => (
            <div style={{ display: 'flex', gap: '8px' }}>
                <Button variant="secondary" onClick={() => { setSelectedSchedule(s); setIsModalOpen(true); }}>Edit</Button>
            </div>
        )}
    ];

    if (loading) return <LoadingState message="Loading work schedules..." />;
    if (error) return <ErrorState message={error} onRetry={fetchData} />;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <Button variant="ghost" onClick={onBack}><i className='bx bx-arrow-back'></i></Button>
                    <h3 style={{ margin: 0 }}>Work Schedules</h3>
                </div>
                <Button variant="primary" onClick={() => { setSelectedSchedule(null); setIsModalOpen(true); }}>Add Schedule</Button>
            </div>
            <DataTable columns={columns} data={schedules} keyExtractor={(item: any) => item.id} />
            <WorkScheduleModal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)} 
                onSave={fetchData} 
                schedule={selectedSchedule} 
            />
        </div>
    );
};
