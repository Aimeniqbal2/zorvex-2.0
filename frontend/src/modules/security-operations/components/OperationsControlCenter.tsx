import React, { useEffect, useState, useMemo } from 'react';
import { getControlCenterData } from '../api';
import type { 
    ControlCenterData, 
    ControlCenterFilters, 
    ActionCenterItem, 
    SiteHealthItem 
} from '../types';
import { LoadingState } from '../../../components/ui/LoadingState';
import { ErrorState } from '../../../components/ui/ErrorState';
import '../styles/controlCenter.css';

interface OperationsControlCenterProps {
    onNavigate: (tab: any) => void;
}

export const OperationsControlCenter: React.FC<OperationsControlCenterProps> = ({ onNavigate }) => {
    const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
    const [filters, setFilters] = useState<ControlCenterFilters>({
        target_date: todayStr,
        classification: undefined,
        site_id: undefined,
    });

    const [data, setData] = useState<ControlCenterData | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [hasError, setHasError] = useState<boolean>(false);
    const [errorMessage, setErrorMessage] = useState<string>('');
    const [actionFilter, setActionFilter] = useState<'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM'>('ALL');

    useEffect(() => {
        loadData();
    }, [filters.target_date, filters.classification, filters.site_id]);

    const loadData = async () => {
        setIsLoading(true);
        setHasError(false);
        try {
            const result = await getControlCenterData(filters);
            setData(result);
        } catch (err: any) {
            console.error('Failed to load Control Center data:', err);
            setHasError(true);
            setErrorMessage(err.message || 'Unable to connect to Control Center aggregation service');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFilters(prev => ({ ...prev, target_date: e.target.value }));
    };

    const handleClassificationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value;
        setFilters(prev => ({ 
            ...prev, 
            classification: val === 'ALL' ? undefined : (val as 'DIRECT' | 'INDIRECT') 
        }));
    };

    const handleSiteChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value;
        setFilters(prev => ({ ...prev, site_id: val === 'ALL' ? undefined : val }));
    };

    // Filter action items based on selected tab
    const filteredActions = useMemo(() => {
        if (!data?.action_center) return [];
        if (actionFilter === 'ALL') return data.action_center;
        return data.action_center.filter(item => item.priority === actionFilter);
    }, [data?.action_center, actionFilter]);

    if (isLoading && !data) {
        return <LoadingState message="Aggregating workforce & core operations metrics..." />;
    }

    if (hasError || !data) {
        return <ErrorState message={errorMessage || 'Failed to load Control Center.'} onRetry={loadData} />;
    }

    const { 
        workforce, 
        manpower, 
        duty_coverage, 
        attendance, 
        payroll_readiness, 
        lifecycle_alerts, 
        site_health, 
        action_center 
    } = data;

    const criticalCount = action_center.filter(a => a.priority === 'CRITICAL').length;
    const highCount = action_center.filter(a => a.priority === 'HIGH').length;

    // Distinct site list for filter
    const siteOptions = site_health.map(s => ({ id: s.site_id, name: s.site_name }));

    return (
        <div className="control-center-container">
            {/* Top Filter & Refresh Toolbar */}
            <div className="control-center-toolbar">
                <div className="toolbar-title-group">
                    <div className="toolbar-icon-badge">
                        <i className="bx bx-radar"></i>
                    </div>
                    <div>
                        <h2>Operations Control Center</h2>
                        <p>Real-time workforce, roster, attendance & payroll readiness monitoring</p>
                    </div>
                </div>

                <div className="toolbar-controls">
                    <div className="filter-input-group">
                        <label>Date</label>
                        <input 
                            type="date" 
                            value={filters.target_date || todayStr} 
                            onChange={handleDateChange} 
                        />
                    </div>

                    <div className="filter-input-group">
                        <label>Classification</label>
                        <select 
                            value={filters.classification || 'ALL'} 
                            onChange={handleClassificationChange}
                        >
                            <option value="ALL">All Employees</option>
                            <option value="DIRECT">DIRECT (Field Guards)</option>
                            <option value="INDIRECT">INDIRECT (Staff)</option>
                        </select>
                    </div>

                    <div className="filter-input-group">
                        <label>Site</label>
                        <select 
                            value={filters.site_id || 'ALL'} 
                            onChange={handleSiteChange}
                        >
                            <option value="ALL">All Operational Sites</option>
                            {siteOptions.map(site => (
                                <option key={site.id} value={site.id}>{site.name}</option>
                            ))}
                        </select>
                    </div>

                    <button 
                        className="btn btn-secondary" 
                        onClick={loadData}
                        disabled={isLoading}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '36px' }}
                    >
                        <i className={`bx bx-refresh ${isLoading ? 'bx-spin' : ''}`}></i>
                        <span>Sync</span>
                    </button>
                </div>
            </div>

            {/* 1. Executive KPI Summary Cards */}
            <div className="executive-kpi-grid">
                {/* Workforce Overview */}
                <div className="executive-kpi-card kpi-workforce" onClick={() => onNavigate('deployments')}>
                    <div className="kpi-card-header">
                        <span>Workforce Strength</span>
                        <i className="bx bx-user-pin"></i>
                    </div>
                    <div className="kpi-main-metric">
                        <span className="value">{workforce.total_employees}</span>
                        <span className="sub-label">Total Staff</span>
                    </div>
                    <div className="kpi-breakdown-row">
                        <span>Direct: <strong>{workforce.direct_count}</strong></span>
                        <span>Indirect: <strong>{workforce.indirect_count}</strong></span>
                        <span>Active: <strong style={{ color: '#059669' }}>{workforce.active_count}</strong></span>
                    </div>
                </div>

                {/* Manpower & Deployment */}
                <div className="executive-kpi-card kpi-manpower" onClick={() => onNavigate('staffing')}>
                    <div className="kpi-card-header">
                        <span>Manpower Capacity</span>
                        <i className="bx bx-briefcase-alt-2"></i>
                    </div>
                    <div className="kpi-main-metric">
                        <span className="value">{manpower.deployed_strength}</span>
                        <span className="sub-label">/ {manpower.required_strength} Req</span>
                    </div>
                    <div className="kpi-breakdown-row">
                        <span>Vacancies: <strong style={{ color: manpower.vacancies > 0 ? '#ef4444' : 'inherit' }}>{manpower.vacancies}</strong></span>
                        <span>Shortage Sites: <strong style={{ color: manpower.shortage_sites_count > 0 ? '#ef4444' : 'inherit' }}>{manpower.shortage_sites_count}</strong></span>
                        <span>Overstaff: <strong>{manpower.overstaffing}</strong></span>
                    </div>
                </div>

                {/* Duty Coverage */}
                <div className="executive-kpi-card kpi-coverage" onClick={() => onNavigate('roster')}>
                    <div className="kpi-card-header">
                        <span>Today's Duty Coverage</span>
                        <i className="bx bx-calendar-check"></i>
                    </div>
                    <div className="kpi-main-metric">
                        <span className="value">{duty_coverage.rostered_strength}</span>
                        <span className="sub-label">Rostered Guards</span>
                    </div>
                    <div className="kpi-breakdown-row">
                        <span>Replacements: <strong>{duty_coverage.replacement_coverage}</strong></span>
                        <span>Uncovered: <strong style={{ color: duty_coverage.uncovered_vacancies > 0 ? '#ef4444' : 'inherit' }}>{duty_coverage.uncovered_vacancies}</strong></span>
                        <span>Cross-Site: <strong>{duty_coverage.cross_site_replacements_count}</strong></span>
                    </div>
                </div>

                {/* Attendance & JUMP */}
                <div className="executive-kpi-card kpi-attendance" onClick={() => onNavigate('attendance')}>
                    <div className="kpi-card-header">
                        <span>Attendance Control</span>
                        <i className="bx bx-time-five"></i>
                    </div>
                    <div className="kpi-main-metric">
                        <span className="value" style={{ color: '#059669' }}>{attendance.present}</span>
                        <span className="sub-label">Present</span>
                    </div>
                    <div className="kpi-breakdown-row">
                        <span>Absent: <strong style={{ color: attendance.absent > 0 ? '#ef4444' : 'inherit' }}>{attendance.absent}</strong></span>
                        <span>JUMP Active: <strong style={{ color: attendance.active_jump_count > 0 ? '#ef4444' : 'inherit' }}>{attendance.active_jump_count}</strong></span>
                        <span>Leave/Off: <strong>{attendance.paid_leave + attendance.unpaid_leave + attendance.weekly_off}</strong></span>
                    </div>
                </div>

                {/* Payroll Readiness */}
                <div className="executive-kpi-card kpi-payroll" onClick={() => onNavigate('payroll_prep')}>
                    <div className="kpi-card-header">
                        <span>Payroll Readiness</span>
                        <i className="bx bx-wallet-alt"></i>
                    </div>
                    <div className="kpi-main-metric">
                        <span className="value">{payroll_readiness.calculations_ready_count}</span>
                        <span className="sub-label">Ready</span>
                    </div>
                    <div className="kpi-breakdown-row">
                        <span>Blocked: <strong style={{ color: payroll_readiness.calculations_blocked_count > 0 ? '#ef4444' : '#059669' }}>{payroll_readiness.calculations_blocked_count}</strong></span>
                        <span>Daily Pay: <strong>{payroll_readiness.daily_duty_pay_generated_count}</strong></span>
                        <span>Unresolved: <strong style={{ color: payroll_readiness.unresolved_daily_pay_count > 0 ? '#f59e0b' : 'inherit' }}>{payroll_readiness.unresolved_daily_pay_count}</strong></span>
                    </div>
                </div>
            </div>

            {/* 2. Action Center (Prioritized Operational Exceptions) */}
            <div className="action-center-card">
                <div className="action-center-header">
                    <div className="action-header-left">
                        <i className="bx bx-bell" style={{ fontSize: '20px', color: '#ef4444' }}></i>
                        <h3>Action Center</h3>
                        {action_center.length > 0 && (
                            <span className="action-count-pill">{action_center.length} Open Exceptions</span>
                        )}
                    </div>

                    <div className="action-filter-tabs">
                        <button 
                            className={`action-tab-btn ${actionFilter === 'ALL' ? 'active' : ''}`}
                            onClick={() => setActionFilter('ALL')}
                        >
                            All ({action_center.length})
                        </button>
                        <button 
                            className={`action-tab-btn ${actionFilter === 'CRITICAL' ? 'active' : ''}`}
                            onClick={() => setActionFilter('CRITICAL')}
                        >
                            Critical ({criticalCount})
                        </button>
                        <button 
                            className={`action-tab-btn ${actionFilter === 'HIGH' ? 'active' : ''}`}
                            onClick={() => setActionFilter('HIGH')}
                        >
                            High ({highCount})
                        </button>
                        <button 
                            className={`action-tab-btn ${actionFilter === 'MEDIUM' ? 'active' : ''}`}
                            onClick={() => setActionFilter('MEDIUM')}
                        >
                            Medium ({action_center.length - criticalCount - highCount})
                        </button>
                    </div>
                </div>

                {filteredActions.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-muted)' }}>
                        <i className="bx bx-check-double" style={{ fontSize: '36px', color: '#059669', marginBottom: '8px' }}></i>
                        <p style={{ margin: 0, fontWeight: 600 }}>All operational exceptions resolved for this view.</p>
                    </div>
                ) : (
                    <div className="action-items-list">
                        {filteredActions.map((item: ActionCenterItem) => (
                            <div key={item.id} className="action-item-row">
                                <div className="action-item-left">
                                    <span className={`priority-badge priority-${item.priority}`}>
                                        {item.priority}
                                    </span>
                                    <div className="action-item-details">
                                        <span className="action-item-title">{item.title}</span>
                                        <span className="action-item-desc">{item.description}</span>
                                    </div>
                                </div>
                                <button 
                                    className="action-item-btn"
                                    onClick={() => onNavigate(item.tab)}
                                >
                                    <span>{item.action_label}</span>
                                    <i className="bx bx-chevron-right"></i>
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* 3. Multi-Panel Deep Operational Breakdown Grids */}
            <div className="control-grid-two-col">
                {/* Panel 1: Workforce & Lifecycle Alerts */}
                <div className="dashboard-panel">
                    <div className="panel-header">
                        <h4><i className="bx bx-shield-quarter" style={{ color: '#2563eb' }}></i> Workforce & Lifecycle Alerts</h4>
                        <button className="panel-sub-btn" onClick={() => onNavigate('deployments')}>View Workforce</button>
                    </div>

                    {/* JUMP Warnings */}
                    {attendance.active_jump_count > 0 && (
                        <div className="alert-strip-box alert-jump">
                            <div>
                                <strong>{attendance.active_jump_count} Active JUMP / Missing Guards</strong>
                                <div style={{ fontSize: '11px', marginTop: '2px' }}>Guard missing &gt; 7 days without authorized leave</div>
                            </div>
                            <button className="btn btn-sm btn-danger" onClick={() => onNavigate('attendance')}>Review JUMPs</button>
                        </div>
                    )}

                    {attendance.approaching_jump_count > 0 && (
                        <div className="alert-strip-box alert-warning">
                            <div>
                                <strong>{attendance.approaching_jump_count} Guards Approaching JUMP Threshold (4–6 Days Absent)</strong>
                                <div style={{ fontSize: '11px', marginTop: '2px' }}>Preemptive HR follow-up required before 7-day threshold</div>
                            </div>
                            <button className="btn btn-sm btn-warning" onClick={() => onNavigate('attendance')}>Intervene</button>
                        </div>
                    )}

                    {/* Unassigned DIRECT Staff */}
                    {lifecycle_alerts.unassigned_direct_count > 0 && (
                        <div className="alert-strip-box alert-info">
                            <div>
                                <strong>{lifecycle_alerts.unassigned_direct_count} DIRECT Guards Unassigned</strong>
                                <div style={{ fontSize: '11px', marginTop: '2px' }}>Field guards with active status but no post deployment</div>
                            </div>
                            <button className="btn btn-sm btn-primary" onClick={() => onNavigate('deployments')}>Deploy Now</button>
                        </div>
                    )}

                    {/* Summary Counters */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', textAlign: 'center', marginTop: '4px' }}>
                        <div style={{ background: 'var(--color-background)', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
                            <div style={{ fontSize: '18px', fontWeight: 700, color: '#059669' }}>{workforce.active_count}</div>
                            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Active</div>
                        </div>
                        <div style={{ background: 'var(--color-background)', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
                            <div style={{ fontSize: '18px', fontWeight: 700, color: '#f59e0b' }}>{workforce.suspended_count}</div>
                            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Suspended</div>
                        </div>
                        <div style={{ background: 'var(--color-background)', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
                            <div style={{ fontSize: '18px', fontWeight: 700, color: '#ef4444' }}>{workforce.jump_count}</div>
                            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>JUMP</div>
                        </div>
                        <div style={{ background: 'var(--color-background)', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
                            <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-text-muted)' }}>{workforce.resigned_count + workforce.terminated_count}</div>
                            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Separated</div>
                        </div>
                    </div>

                    {/* Suspended Guards List preview */}
                    {lifecycle_alerts.suspended_list.length > 0 && (
                        <div>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '6px' }}>
                                Currently Suspended Staff ({lifecycle_alerts.suspended_list.length})
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '120px', overflowY: 'auto' }}>
                                {lifecycle_alerts.suspended_list.map(emp => (
                                    <div key={emp.employee_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--color-background)', borderRadius: '4px', fontSize: '12px' }}>
                                        <span><strong>{emp.employee_name}</strong> ({emp.employee_code})</span>
                                        <span style={{ color: '#ef4444' }}>Suspended</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Panel 2: Duty Coverage & Roster Health */}
                <div className="dashboard-panel">
                    <div className="panel-header">
                        <h4><i className="bx bx-calendar-star" style={{ color: '#10b981' }}></i> Duty Coverage by Shift</h4>
                        <button className="panel-sub-btn" onClick={() => onNavigate('roster')}>View Roster</button>
                    </div>

                    {duty_coverage.shift_breakdown.length === 0 ? (
                        <div style={{ padding: '16px', color: 'var(--color-text-muted)', textAlign: 'center' }}>
                            No active shifts configured for this target date.
                        </div>
                    ) : (
                        <table className="compact-table">
                            <thead>
                                <tr>
                                    <th>Shift</th>
                                    <th>Req</th>
                                    <th>Rostered</th>
                                    <th>Repl.</th>
                                    <th>Uncovered</th>
                                    <th>Coverage</th>
                                </tr>
                            </thead>
                            <tbody>
                                {duty_coverage.shift_breakdown.map(shift => (
                                    <tr key={shift.shift_id}>
                                        <td><strong>{shift.shift_name}</strong></td>
                                        <td>{shift.required}</td>
                                        <td>{shift.rostered}</td>
                                        <td>{shift.replacement}</td>
                                        <td style={{ color: shift.uncovered > 0 ? '#ef4444' : 'inherit', fontWeight: shift.uncovered > 0 ? 700 : 400 }}>
                                            {shift.uncovered}
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span>{shift.coverage_pct}%</span>
                                                <div className="progress-bar-wrap" style={{ width: '60px' }}>
                                                    <div 
                                                        className="progress-bar-fill" 
                                                        style={{ 
                                                            width: `${Math.min(shift.coverage_pct, 100)}%`,
                                                            background: shift.coverage_pct >= 100 ? '#10b981' : shift.coverage_pct >= 80 ? '#f59e0b' : '#ef4444'
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {/* Vacant Posts Preview */}
                    {manpower.vacant_posts.length > 0 && (
                        <div style={{ marginTop: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                                    Vacant Security Posts ({manpower.vacant_posts_count})
                                </span>
                                <button className="panel-sub-btn" onClick={() => onNavigate('staffing')}>Assign Staff</button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '110px', overflowY: 'auto' }}>
                                {manpower.vacant_posts.slice(0, 4).map(post => (
                                    <div key={post.post_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--color-background)', borderRadius: '4px', fontSize: '12px' }}>
                                        <span><strong>{post.post_name}</strong> @ {post.site_name}</span>
                                        <span style={{ color: '#ef4444', fontWeight: 600 }}>{post.vacancies} Vacancy</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Panel 3: Attendance Exceptions */}
                <div className="dashboard-panel">
                    <div className="panel-header">
                        <h4><i className="bx bx-time" style={{ color: '#f59e0b' }}></i> Attendance Control & Exceptions</h4>
                        <button className="panel-sub-btn" onClick={() => onNavigate('attendance')}>Open Attendance</button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', textAlign: 'center' }}>
                        <div style={{ background: 'var(--color-background)', padding: '8px', borderRadius: '6px' }}>
                            <div style={{ fontSize: '16px', fontWeight: 700, color: '#059669' }}>{attendance.present}</div>
                            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Present</div>
                        </div>
                        <div style={{ background: 'var(--color-background)', padding: '8px', borderRadius: '6px' }}>
                            <div style={{ fontSize: '16px', fontWeight: 700, color: '#ef4444' }}>{attendance.absent}</div>
                            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Absent</div>
                        </div>
                        <div style={{ background: 'var(--color-background)', padding: '8px', borderRadius: '6px' }}>
                            <div style={{ fontSize: '16px', fontWeight: 700, color: '#2563eb' }}>{attendance.weekly_off}</div>
                            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Weekly Off</div>
                        </div>
                        <div style={{ background: 'var(--color-background)', padding: '8px', borderRadius: '6px' }}>
                            <div style={{ fontSize: '16px', fontWeight: 700, color: '#8b5cf6' }}>{attendance.paid_leave + attendance.unpaid_leave}</div>
                            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Leave</div>
                        </div>
                    </div>

                    {/* Rostered Absent Without Replacement */}
                    <div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '6px' }}>
                            Uncovered Absences (Absent without Replacement)
                        </div>
                        {attendance.uncovered_absences_list.length === 0 ? (
                            <div style={{ fontSize: '12px', color: '#059669', padding: '8px', background: 'rgba(16, 185, 129, 0.08)', borderRadius: '6px' }}>
                                <i className="bx bx-check-circle"></i> No uncovered duty absences recorded today.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '140px', overflowY: 'auto' }}>
                                {attendance.uncovered_absences_list.map((abs, idx) => (
                                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '4px', fontSize: '12px' }}>
                                        <div>
                                            <strong>{abs.employee_name}</strong>
                                            <span style={{ color: 'var(--color-text-muted)', marginLeft: '6px' }}>{abs.site_name} - {abs.shift_name}</span>
                                        </div>
                                        <button className="btn btn-sm btn-secondary" onClick={() => onNavigate('roster')}>Cover</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Panel 4: Payroll Readiness & Period Status */}
                <div className="dashboard-panel">
                    <div className="panel-header">
                        <h4><i className="bx bx-dollar-circle" style={{ color: '#8b5cf6' }}></i> Payroll Readiness & Status</h4>
                        <button className="panel-sub-btn" onClick={() => onNavigate('payroll_runs')}>Payroll Runs</button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', textAlign: 'center' }}>
                        <div style={{ background: 'var(--color-background)', padding: '10px', borderRadius: '6px' }}>
                            <div style={{ fontSize: '18px', fontWeight: 700, color: '#059669' }}>{payroll_readiness.calculations_ready_count}</div>
                            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Calcs Ready</div>
                        </div>
                        <div style={{ background: 'var(--color-background)', padding: '10px', borderRadius: '6px' }}>
                            <div style={{ fontSize: '18px', fontWeight: 700, color: payroll_readiness.calculations_blocked_count > 0 ? '#ef4444' : '#059669' }}>
                                {payroll_readiness.calculations_blocked_count}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Blocked Calcs</div>
                        </div>
                        <div style={{ background: 'var(--color-background)', padding: '10px', borderRadius: '6px' }}>
                            <div style={{ fontSize: '18px', fontWeight: 700, color: '#2563eb' }}>
                                ${Number(payroll_readiness.estimated_net_payable || 0).toLocaleString(undefined, { minimumFractionDigits: 0 })}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Est. Net Pay</div>
                        </div>
                    </div>

                    {/* Latest Run & Finance Handoff Status */}
                    <div style={{ padding: '12px', background: 'var(--color-background)', borderRadius: '8px', border: '1px solid var(--color-border)', fontSize: '12.5px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <span style={{ color: 'var(--color-text-muted)' }}>Latest Payroll Run:</span>
                            <strong>{payroll_readiness.latest_payroll_run ? payroll_readiness.latest_payroll_run.run_number : 'No Run Created'}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <span style={{ color: 'var(--color-text-muted)' }}>Run Status:</span>
                            <span className={`status-pill ${payroll_readiness.latest_payroll_run?.status === 'POSTED' ? 'HEALTHY' : 'WARNING'}`}>
                                {payroll_readiness.latest_payroll_run?.status || 'N/A'}
                            </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--color-text-muted)' }}>Finance Handoff:</span>
                            <span className={`status-pill ${payroll_readiness.finance_handoff_status === 'LIABILITY_POSTED' ? 'HEALTHY' : 'WARNING'}`}>
                                {payroll_readiness.finance_handoff_status.replace('_', ' ')}
                            </span>
                        </div>
                    </div>

                    {/* Blocked Calculations detail preview */}
                    {payroll_readiness.blocked_calculations_list.length > 0 && (
                        <div>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: '#ef4444', marginBottom: '4px' }}>
                                Blocked Payroll Calculations ({payroll_readiness.blocked_calculations_list.length})
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '90px', overflowY: 'auto' }}>
                                {payroll_readiness.blocked_calculations_list.slice(0, 3).map((b, idx) => (
                                    <div key={idx} style={{ fontSize: '11.5px', padding: '4px 8px', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '4px' }}>
                                        <strong>{b.employee_name}:</strong> {b.blocking_reasons.join(', ')}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* 4. Operational Site Health Matrix */}
            <div className="site-health-container">
                <div className="site-health-header">
                    <div>
                        <h3>Operational Site Health Matrix</h3>
                        <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                            Authoritative multi-site breakdown of required vs deployed strength, roster coverage and attendance exceptions
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => onNavigate('sites')}>
                            <i className="bx bx-buildings"></i> Manage Sites
                        </button>
                    </div>
                </div>

                <div className="site-health-table-wrap">
                    <table className="site-health-table">
                        <thead>
                            <tr>
                                <th>Site & Client</th>
                                <th>Contract</th>
                                <th>Required</th>
                                <th>Deployed</th>
                                <th>Today's Roster</th>
                                <th>Present</th>
                                <th>Absent</th>
                                <th>Replacement</th>
                                <th>Vacancies</th>
                                <th>JUMP Cases</th>
                                <th>Health Status</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {site_health.length === 0 ? (
                                <tr>
                                    <td colSpan={12} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-muted)' }}>
                                        No operational security sites found for the selected filter.
                                    </td>
                                </tr>
                            ) : (
                                site_health.map((site: SiteHealthItem) => (
                                    <tr key={site.site_id}>
                                        <td>
                                            <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>{site.site_name}</div>
                                            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{site.client_name}</div>
                                        </td>
                                        <td>
                                            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                                {site.contract_code || '—'}
                                            </span>
                                        </td>
                                        <td><strong>{site.required_strength}</strong></td>
                                        <td><strong>{site.deployed_strength}</strong></td>
                                        <td>{site.todays_roster_count}</td>
                                        <td style={{ color: '#059669', fontWeight: 600 }}>{site.present_count}</td>
                                        <td style={{ color: site.absent_count > 0 ? '#ef4444' : 'inherit' }}>{site.absent_count}</td>
                                        <td>{site.replacement_count}</td>
                                        <td style={{ color: site.vacancies > 0 ? '#ef4444' : 'inherit', fontWeight: site.vacancies > 0 ? 600 : 400 }}>
                                            {site.vacancies}
                                        </td>
                                        <td style={{ color: site.jump_cases_count > 0 ? '#ef4444' : 'inherit', fontWeight: site.jump_cases_count > 0 ? 600 : 400 }}>
                                            {site.jump_cases_count}
                                        </td>
                                        <td>
                                            <span className={`status-pill ${site.health_status}`}>
                                                {site.health_status}
                                            </span>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                <button 
                                                    className="btn btn-sm btn-secondary" 
                                                    onClick={() => onNavigate('roster')}
                                                    title="View Roster"
                                                >
                                                    <i className="bx bx-calendar"></i>
                                                </button>
                                                <button 
                                                    className="btn btn-sm btn-secondary" 
                                                    onClick={() => onNavigate('deployments')}
                                                    title="View Deployments"
                                                >
                                                    <i className="bx bx-user-pin"></i>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
