import React, { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../api';
import type { DutyAssignment, OperationalSite } from '../types';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { LoadingState } from '../../../components/ui/LoadingState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { DutyAssignmentModal } from './DutyAssignmentModal';

const STATUS_VARIANT: Record<string, 'success' | 'danger' | 'default' | 'primary'> = {
    SCHEDULED: 'default',
    IN_PROGRESS: 'primary',
    COMPLETED: 'success',
    ABSENT: 'danger',
    CANCELLED: 'danger',
};

function formatTime(t: string) {
    if (!t) return '';
    const [h, m] = t.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    return `${hour % 12 || 12}:${m} ${ampm}`;
}

function navigateDate(date: string, delta: number): string {
    const d = new Date(date);
    d.setDate(d.getDate() + delta);
    return d.toISOString().split('T')[0];
}

function formatDisplayDate(date: string): string {
    return new Date(date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

export const RosterView: React.FC = () => {
    const today = new Date().toISOString().split('T')[0];
    const [selectedDate, setSelectedDate] = useState(today);
    const [selectedSite, setSelectedSite] = useState('');
    const [sites, setSites] = useState<OperationalSite[]>([]);
    const [duties, setDuties] = useState<DutyAssignment[]>([]);
    const [coverage, setCoverage] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [hasError, setHasError] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedDuty, setSelectedDuty] = useState<DutyAssignment | null>(null);
    const [prefilledDuty, setPrefilledDuty] = useState<Partial<DutyAssignment>>({});

    useEffect(() => {
        apiClient.get('/api/operations/sites/?is_active=true&page_size=200')
            .then(r => setSites(r.data.results || r.data))
            .catch(() => {});
    }, []);

    const fetchRoster = useCallback(async () => {
        setIsLoading(true);
        setHasError(false);
        try {
            const params = new URLSearchParams({ date: selectedDate });
            if (selectedSite) params.set('site', selectedSite);
            
            const [dutiesRes, covRes] = await Promise.all([
                apiClient.get(`/api/operations/duty-assignments/roster/?${params}`),
                apiClient.get(`/api/operations/staffing-coverage/?${params}`)
            ]);
            
            setDuties(dutiesRes.data);
            setCoverage(Array.isArray(covRes.data) ? covRes.data : []);
        } catch {
            setHasError(true);
        } finally {
            setIsLoading(false);
        }
    }, [selectedDate, selectedSite]);

    useEffect(() => { fetchRoster(); }, [fetchRoster]);

    // Group duties by site
    const grouped = duties.reduce<Record<string, { site_name: string; duties: DutyAssignment[] }>>((acc, d) => {
        const key = d.site;
        if (!acc[key]) acc[key] = { site_name: d.site_name || d.site, duties: [] };
        acc[key].duties.push(d);
        return acc;
    }, {});

    const handleSyncAttendance = async (dutyId: string) => {
        try {
            const res = await apiClient.post(`/api/operations/duty-assignments/${dutyId}/sync-attendance/`);
            alert(res.data.message || 'Attendance synced.');
            fetchRoster();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Sync failed.');
        }
    };

    return (
        <div className="view-container">
            {/* Toolbar */}
            <div className="view-toolbar flex flex-wrap items-center gap-3 mb-4">
                <button
                    className="btn btn-secondary"
                    onClick={() => setSelectedDate(navigateDate(selectedDate, -1))}
                    title="Previous day"
                >← Prev</button>

                <input
                    type="date"
                    value={selectedDate}
                    onChange={e => setSelectedDate(e.target.value)}
                    className="border rounded p-2"
                />

                <button
                    className="btn btn-secondary"
                    onClick={() => setSelectedDate(navigateDate(selectedDate, 1))}
                    title="Next day"
                >Next →</button>

                <button
                    className="btn btn-ghost"
                    onClick={() => setSelectedDate(today)}
                >Today</button>

                <select
                    value={selectedSite}
                    onChange={e => setSelectedSite(e.target.value)}
                    className="border rounded p-2 ml-auto"
                    style={{ minWidth: 180 }}
                >
                    <option value="">All Sites</option>
                    {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>

                <Button
                    variant="primary"
                    icon="bx-plus"
                    onClick={() => { setSelectedDuty(null); setIsModalOpen(true); }}
                >New Duty</Button>
            </div>

            <div className="text-sm text-gray-500 mb-4 font-medium">{formatDisplayDate(selectedDate)}</div>

            {isLoading && <LoadingState />}
            {hasError && !isLoading && <ErrorState message="Failed to load roster." onRetry={fetchRoster} />}

            {!isLoading && !hasError && Object.keys(grouped).length === 0 && (
                <div className="empty-state">
                    <div className="empty-state-icon"><i className="bx bx-calendar-x" /></div>
                    <div className="empty-state-title">No duties scheduled</div>
                    <div className="empty-state-description">
                        {selectedSite ? 'No duties for this site on this date.' : 'No duties scheduled for this date.'}
                    </div>
                    <Button variant="primary" onClick={() => { setSelectedDuty(null); setIsModalOpen(true); }}>
                        Schedule Duty
                    </Button>
                </div>
            )}

            {!isLoading && Object.entries(grouped).map(([siteId, { site_name, duties: siteDuties }]) => (
                <div key={siteId} className="roster-site-block mb-6">
                    <div className="roster-site-header">
                        <h3 className="font-semibold text-base">{site_name}</h3>
                        <span className="text-sm text-gray-500">{siteDuties.length} assigned</span>
                    </div>
                    
                    {/* Coverage Summary */}
                    {coverage.filter(c => String(c.site_id) === siteId).length > 0 && (
                        <div className="coverage-summary" style={{ marginBottom: '16px', padding: '12px', background: '#f8fafc', borderRadius: '4px' }}>
                            <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem' }}>Staffing Requirements</h4>
                            <table className="data-table w-full text-sm">
                                <thead>
                                    <tr>
                                        <th>Designation</th>
                                        <th>Shift</th>
                                        <th>Required</th>
                                        <th>Scheduled</th>
                                        <th>Shortage</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {coverage.filter(c => String(c.site_id) === siteId).map((c, i) => (
                                        <tr key={i}>
                                            <td>{c.designation_name}</td>
                                            <td>{c.shift_name}</td>
                                            <td>{c.required}</td>
                                            <td>{c.scheduled}</td>
                                            <td style={{ color: c.roster_shortage > 0 ? '#dc2626' : 'inherit', fontWeight: c.roster_shortage > 0 ? 'bold' : 'normal' }}>
                                                {c.roster_shortage}
                                            </td>
                                            <td>
                                                <Badge variant={c.status === 'SHORT' ? 'danger' : c.status === 'SURPLUS' ? 'primary' : 'success'}>
                                                    {c.status}
                                                </Badge>
                                            </td>
                                            <td>
                                                {c.roster_shortage > 0 && (
                                                    <Button variant="secondary" onClick={() => {
                                                        setSelectedDuty(null);
                                                        setPrefilledDuty({
                                                            site: c.site_id,
                                                            date: selectedDate,
                                                            // We would prefill designation and shift if duty assignment supported it easily in the UI
                                                        });
                                                        setIsModalOpen(true);
                                                    }}>Assign Duty</Button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <table className="data-table w-full mt-2">
                        <thead>
                            <tr>
                                <th>Employee</th>
                                <th>Shift Time</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {siteDuties.map(duty => (
                                <tr key={duty.id}>
                                    <td>{duty.employee_name || duty.employee}</td>
                                    <td>{formatTime(duty.start_time)} – {formatTime(duty.end_time)}</td>
                                    <td>
                                        <Badge variant={STATUS_VARIANT[duty.status] || 'default'}>
                                            {duty.status.replace('_', ' ')}
                                        </Badge>
                                    </td>
                                    <td className="flex gap-2 items-center">
                                        <button
                                            className="text-blue-600 hover:underline text-sm"
                                            onClick={() => { setSelectedDuty(duty); setIsModalOpen(true); }}
                                        >Edit</button>
                                        {duty.status === 'COMPLETED' && (
                                            <button
                                                className="text-green-600 hover:underline text-sm"
                                                onClick={() => handleSyncAttendance(duty.id)}
                                            >Sync ✓</button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ))}

            <DutyAssignmentModal
                isOpen={isModalOpen}
                onClose={() => { setIsModalOpen(false); setPrefilledDuty({}); }}
                onSave={fetchRoster}
                assignment={selectedDuty || (prefilledDuty as any)}
            />
        </div>
    );
};
