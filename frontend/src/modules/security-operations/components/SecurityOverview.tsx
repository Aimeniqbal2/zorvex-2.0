import React, { useEffect, useState } from 'react';
import { getSecurityOperationsSummary } from '../api';
import type { SecurityOperationsSummary } from '../types';
import { LoadingState } from '../../../components/ui/LoadingState';
import { ErrorState } from '../../../components/ui/ErrorState';

interface SecurityOverviewProps {
    onNavigate: (tab: any) => void;
}

export const SecurityOverview: React.FC<SecurityOverviewProps> = ({ onNavigate }) => {
    const [summary, setSummary] = useState<SecurityOperationsSummary | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        fetchSummary();
    }, []);

    const fetchSummary = async () => {
        setIsLoading(true);
        setHasError(false);
        try {
            const data = await getSecurityOperationsSummary();
            setSummary(data);
        } catch (error) {
            console.error("Failed to fetch dashboard summary", error);
            setHasError(true);
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading) {
        return <LoadingState message="Loading security operations..." />;
    }

    if (hasError || !summary) {
        return <ErrorState message="Failed to load dashboard." onRetry={fetchSummary} />;
    }

    return (
        <div className="security-dashboard">
            <div className="kpi-grid">
                <div className="kpi-card" onClick={() => onNavigate('sites')}>
                    <div className="kpi-title">Active Sites</div>
                    <div className="kpi-value">{summary.active_sites}</div>
                </div>
                <div className="kpi-card" onClick={() => onNavigate('deployments')}>
                    <div className="kpi-title">Active Deployments</div>
                    <div className="kpi-value">{summary.active_deployments}</div>
                </div>
                <div className="kpi-card" onClick={() => onNavigate('deployments')}>
                    <div className="kpi-title">Deployed Staff</div>
                    <div className="kpi-value">{summary.deployed_staff}</div>
                </div>
                <div className="kpi-card" onClick={() => onNavigate('duties')}>
                    <div className="kpi-title">Today's Duties</div>
                    <div className="kpi-value">{summary.todays_duties}</div>
                </div>
                <div className="kpi-card" onClick={() => onNavigate('duties')}>
                    <div className="kpi-title">Completed Duties</div>
                    <div className="kpi-value">{summary.completed_duties}</div>
                </div>
                <div className="kpi-card" onClick={() => onNavigate('attendance')}>
                    <div className="kpi-title">Attendance Synced</div>
                    <div className="kpi-value">{summary.attendance_synced}</div>
                </div>
                <div className="kpi-card" onClick={() => onNavigate('extra_duties')}>
                    <div className="kpi-title">Pending Extra Duties</div>
                    <div className="kpi-value" style={{ color: summary.extra_duties_pending > 0 ? 'var(--color-warning)' : 'inherit' }}>
                        {summary.extra_duties_pending}
                    </div>
                </div>
                <div className="kpi-card" onClick={() => onNavigate('extra_duties')}>
                    <div className="kpi-title">Approved Extra Duties</div>
                    <div className="kpi-value" style={{ color: summary.extra_duties_approved > 0 ? 'var(--color-success)' : 'inherit' }}>
                        {summary.extra_duties_approved}
                    </div>
                </div>
                <div className="kpi-card" onClick={() => onNavigate('deployments')}>
                    <div className="kpi-title">Staffing Shortage</div>
                    <div className="kpi-value" style={{ color: summary.staffing_shortage > 0 ? 'var(--color-danger)' : 'inherit' }}>
                        {summary.staffing_shortage}
                    </div>
                </div>
                <div className="kpi-card" onClick={() => onNavigate('equipment_issues')}>
                    <div className="kpi-title">Issued Equipment</div>
                    <div className="kpi-value">{summary.currently_issued_equipment}</div>
                </div>
            </div>

            <div style={{ marginTop: '24px', padding: '24px', background: 'var(--color-surface)', borderRadius: '8px', border: '1px solid var(--color-danger)' }}>
                <h3 style={{ color: 'var(--color-danger)' }}>Needs Attention</h3>
                <div className="kpi-grid" style={{ marginTop: '16px' }}>
                    <div className="kpi-card" onClick={() => onNavigate('incidents')}>
                        <div className="kpi-title">Critical Incidents</div>
                        <div className="kpi-value" style={{ color: summary.critical_incidents > 0 ? 'var(--color-danger)' : 'inherit' }}>
                            {summary.critical_incidents}
                        </div>
                    </div>
                    <div className="kpi-card" onClick={() => onNavigate('incidents')}>
                        <div className="kpi-title">Open Incidents</div>
                        <div className="kpi-value" style={{ color: summary.open_incidents > 0 ? 'var(--color-warning)' : 'inherit' }}>
                            {summary.open_incidents}
                        </div>
                    </div>
                    <div className="kpi-card" onClick={() => onNavigate('daily_activity')}>
                        <div className="kpi-title">DARs Pending Review</div>
                        <div className="kpi-value" style={{ color: summary.pending_dars > 0 ? 'var(--color-primary)' : 'inherit' }}>
                            {summary.pending_dars}
                        </div>
                    </div>
                </div>
            </div>
            
            <div style={{ marginTop: '24px', padding: '24px', background: 'var(--color-surface)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                <h3>Quick Actions</h3>
                <p style={{ color: 'var(--color-text-muted)', marginBottom: '16px' }}>Navigate through the tabs to manage daily field operations.</p>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    <button className="btn btn-secondary" onClick={() => onNavigate('sites')}><i className="bx bx-buildings"></i> View Sites</button>
                    <button className="btn btn-secondary" onClick={() => onNavigate('deployments')}><i className="bx bx-shield-quarter"></i> View Deployments</button>
                    <button className="btn btn-secondary" onClick={() => onNavigate('roster')}><i className="bx bx-calendar"></i> Shift Roster</button>
                    <button className="btn btn-secondary" onClick={() => onNavigate('attendance')}><i className="bx bx-time-five"></i> Attendance</button>
                    <button className="btn btn-secondary" onClick={() => onNavigate('incidents')}><i className="bx bx-error"></i> Report Incident</button>
                    <button className="btn btn-secondary" onClick={() => onNavigate('daily_activity')}><i className="bx bx-file"></i> View DARs</button>
                </div>
            </div>
        </div>
    );
};
