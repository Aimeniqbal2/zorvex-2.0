import React, { useState, useEffect, useCallback } from 'react';
import {
    getOperationalSites,
    getShifts,
    getDutyRosters,
    deleteDutyRoster,
    getSiteCoverageSummary,
    getSiteRangeCoverage,
    bulkGenerateDutyRoster
} from '../api';
import type {
    OperationalSite,
    Shift,
    DutyRoster,
    SiteCoverageSummary,
    SiteRangeCoverageSummary
} from '../types';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { LoadingState } from '../../../components/ui/LoadingState';
import { ErrorState } from '../../../components/ui/ErrorState';
import { DutyRosterModal } from './DutyRosterModal';
import { DutyReplacementModal } from './DutyReplacementModal';
import { DutySwapModal } from './DutySwapModal';
import { ShiftSetupModal } from './ShiftSetupModal';
import { PostShiftRequirementModal } from './PostShiftRequirementModal';
import { EmployeeRosterHistoryModal } from './EmployeeRosterHistoryModal';

function navigateDate(dateStr: string, deltaDays: number): string {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + deltaDays);
    return d.toISOString().split('T')[0];
}

function getStartOfWeek(dateStr: string): string {
    const d = new Date(dateStr);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when Sunday
    const mon = new Date(d.setDate(diff));
    return mon.toISOString().split('T')[0];
}

function getWeekDays(startMonStr: string): string[] {
    const days: string[] = [];
    for (let i = 0; i < 7; i++) {
        days.push(navigateDate(startMonStr, i));
    }
    return days;
}

export const RosterView: React.FC = () => {
    const today = new Date().toISOString().split('T')[0];
    const [viewMode, setViewMode] = useState<'daily' | 'weekly'>('daily');
    const [selectedDate, setSelectedDate] = useState<string>(today);
    const [selectedSite, setSelectedSite] = useState<string>('');
    const [selectedShift, setSelectedShift] = useState<string>('');

    const [sites, setSites] = useState<OperationalSite[]>([]);
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [rosters, setRosters] = useState<DutyRoster[]>([]);
    const [coverageSummary, setCoverageSummary] = useState<SiteCoverageSummary | null>(null);
    const [rangeCoverage, setRangeCoverage] = useState<SiteRangeCoverageSummary | null>(null);

    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [hasError, setHasError] = useState<boolean>(false);
    const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'danger' } | null>(null);

    // Modals
    const [isRosterModalOpen, setIsRosterModalOpen] = useState<boolean>(false);
    const [editingRoster, setEditingRoster] = useState<DutyRoster | null>(null);
    const [defaultModalValues, setDefaultModalValues] = useState<{ site?: string; duty_date?: string; shift?: string; post?: string }>({});

    const [isReplacementModalOpen, setIsReplacementModalOpen] = useState<boolean>(false);
    const [rosterForReplacement, setRosterForReplacement] = useState<DutyRoster | null>(null);

    const [isSwapModalOpen, setIsSwapModalOpen] = useState<boolean>(false);
    const [rosterForSwap, setRosterForSwap] = useState<DutyRoster | null>(null);

    const [isShiftModalOpen, setIsShiftModalOpen] = useState<boolean>(false);
    const [isPostShiftReqModalOpen, setIsPostShiftReqModalOpen] = useState<boolean>(false);

    const [isEmployeeHistoryModalOpen, setIsEmployeeHistoryModalOpen] = useState<boolean>(false);
    const [historyEmployee, setHistoryEmployee] = useState<{ id: string; name: string } | null>(null);

    // Initial site & shift load
    useEffect(() => {
        const init = async () => {
            try {
                const [sitesData, shiftsData] = await Promise.all([
                    getOperationalSites({ is_active: true }),
                    getShifts({ is_active: true })
                ]);
                const siteList = sitesData.results || (Array.isArray(sitesData) ? sitesData : []);
                setSites(siteList);
                setShifts(shiftsData);
                if (siteList.length > 0 && !selectedSite) {
                    setSelectedSite(siteList[0].id);
                }
            } catch (e) {
                console.error('Failed to load sites/shifts', e);
            }
        };
        init();
    }, []);

    // Main fetch
    const fetchData = useCallback(async () => {
        if (!selectedSite) return;
        setIsLoading(true);
        setHasError(false);
        try {
            if (viewMode === 'daily') {
                const [rosterData, covData] = await Promise.all([
                    getDutyRosters({
                        site: selectedSite,
                        duty_date: selectedDate,
                        shift: selectedShift || undefined
                    }),
                    getSiteCoverageSummary(selectedSite, selectedDate, selectedShift || undefined)
                ]);
                setRosters(rosterData);
                setCoverageSummary(covData);
            } else {
                const mon = getStartOfWeek(selectedDate);
                const sun = navigateDate(mon, 6);
                const [rosterData, rangeData] = await Promise.all([
                    getDutyRosters({
                        site: selectedSite,
                        duty_date_after: mon,
                        duty_date_before: sun,
                        shift: selectedShift || undefined
                    }),
                    getSiteRangeCoverage(selectedSite, mon, sun)
                ]);
                setRosters(rosterData);
                setRangeCoverage(rangeData);
            }
        } catch (e) {
            console.error('Failed to fetch roster data', e);
            setHasError(true);
        } finally {
            setIsLoading(false);
        }
    }, [selectedSite, selectedDate, selectedShift, viewMode]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleDeleteRoster = async (rosterId: string) => {
        if (!confirm('Are you sure you want to remove this duty roster slot?')) return;
        try {
            await deleteDutyRoster(rosterId);
            setActionMessage({ text: 'Duty roster entry removed successfully.', type: 'success' });
            setTimeout(() => setActionMessage(null), 4000);
            fetchData();
        } catch (err: any) {
            setActionMessage({ text: err.response?.data?.error || 'Failed to remove duty roster entry.', type: 'danger' });
        }
    };

    const handleBulkGenerate = async () => {
        if (!selectedSite || !selectedShift) {
            alert('Please select both a Site and a specific Shift from the filters above to bulk generate roster entries.');
            return;
        }
        if (!confirm(`Generate roster entries for date ${selectedDate} from active permanent deployments?`)) return;

        try {
            const res = await bulkGenerateDutyRoster({
                site_id: selectedSite,
                duty_date: selectedDate,
                shift_id: selectedShift,
                overwrite_existing: false
            });
            setActionMessage({ text: res.message, type: 'success' });
            setTimeout(() => setActionMessage(null), 5000);
            fetchData();
        } catch (err: any) {
            setActionMessage({ text: err.response?.data?.error || 'Bulk generation failed.', type: 'danger' });
        }
    };

    const weekStartMon = getStartOfWeek(selectedDate);
    const weekDays = getWeekDays(weekStartMon);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Header & Controls Toolbar */}
            <div style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                padding: '16px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px'
            }}>
                {/* Top Row: Title + Primary Actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>Security Duty Roster</h2>
                        <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                            Operational manpower scheduling, coverage requirements, temporary replacements, and shift swaps.
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <Button
                            variant="secondary"
                            icon="bx-time-five"
                            onClick={() => setIsShiftModalOpen(true)}
                        >
                            Shift Templates
                        </Button>
                        <Button
                            variant="secondary"
                            icon="bx-target-lock"
                            onClick={() => setIsPostShiftReqModalOpen(true)}
                        >
                            Post Shift Targets
                        </Button>
                        <Button
                            variant="secondary"
                            icon="bx-bolt-circle"
                            onClick={handleBulkGenerate}
                            title="Auto-roster active deployed guards for this site and shift"
                        >
                            Bulk Generate
                        </Button>
                        <Button
                            variant="primary"
                            icon="bx-plus"
                            onClick={() => {
                                setEditingRoster(null);
                                setDefaultModalValues({ site: selectedSite, duty_date: selectedDate, shift: selectedShift });
                                setIsRosterModalOpen(true);
                            }}
                        >
                            Schedule Duty
                        </Button>
                    </div>
                </div>

                {/* Filter & Navigation Bar */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    flexWrap: 'wrap',
                    paddingTop: '12px',
                    borderTop: '1px solid var(--color-border)'
                }}>
                    {/* View Switcher */}
                    <div style={{
                        display: 'inline-flex',
                        border: '1px solid var(--color-border)',
                        borderRadius: '6px',
                        overflow: 'hidden'
                    }}>
                        <button
                            onClick={() => setViewMode('daily')}
                            style={{
                                padding: '6px 14px',
                                fontSize: '13px',
                                fontWeight: 500,
                                background: viewMode === 'daily' ? 'var(--color-primary)' : 'var(--color-surface)',
                                color: viewMode === 'daily' ? '#fff' : 'var(--color-text)',
                                border: 'none',
                                cursor: 'pointer'
                            }}
                        >
                            <i className="bx bx-calendar-event" style={{ marginRight: '4px' }} /> Daily View
                        </button>
                        <button
                            onClick={() => setViewMode('weekly')}
                            style={{
                                padding: '6px 14px',
                                fontSize: '13px',
                                fontWeight: 500,
                                background: viewMode === 'weekly' ? 'var(--color-primary)' : 'var(--color-surface)',
                                color: viewMode === 'weekly' ? '#fff' : 'var(--color-text)',
                                border: 'none',
                                cursor: 'pointer'
                            }}
                        >
                            <i className="bx bx-calendar-week" style={{ marginRight: '4px' }} /> Weekly Matrix
                        </button>
                    </div>

                    {/* Date Navigation */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                            className="btn btn-secondary"
                            onClick={() => setSelectedDate(navigateDate(selectedDate, viewMode === 'daily' ? -1 : -7))}
                            style={{ padding: '6px 10px' }}
                            title="Previous"
                        >
                            <i className="bx bx-chevron-left" />
                        </button>

                        <input
                            type="date"
                            value={selectedDate}
                            onChange={e => setSelectedDate(e.target.value)}
                            className="input-base"
                            style={{ padding: '5px 10px', fontSize: '13px', width: '140px' }}
                        />

                        <button
                            className="btn btn-secondary"
                            onClick={() => setSelectedDate(navigateDate(selectedDate, viewMode === 'daily' ? 1 : 7))}
                            style={{ padding: '6px 10px' }}
                            title="Next"
                        >
                            <i className="bx bx-chevron-right" />
                        </button>

                        <button
                            className="btn btn-ghost"
                            onClick={() => setSelectedDate(today)}
                            style={{ padding: '6px 12px', fontSize: '13px' }}
                        >
                            Today
                        </button>
                    </div>

                    {/* Site Selector */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
                        <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Site:</span>
                        <select
                            value={selectedSite}
                            onChange={e => setSelectedSite(e.target.value)}
                            className="input-base"
                            style={{ padding: '6px 10px', fontSize: '13px', minWidth: '180px' }}
                        >
                            {sites.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Shift Filter */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Shift:</span>
                        <select
                            value={selectedShift}
                            onChange={e => setSelectedShift(e.target.value)}
                            className="input-base"
                            style={{ padding: '6px 10px', fontSize: '13px', minWidth: '140px' }}
                        >
                            <option value="">All Shifts</option>
                            {shifts.map(s => (
                                <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Notification alert */}
            {actionMessage && (
                <div style={{
                    padding: '12px 16px',
                    borderRadius: '6px',
                    background: actionMessage.type === 'success' ? '#ecfdf5' : '#fef2f2',
                    border: `1px solid ${actionMessage.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
                    color: actionMessage.type === 'success' ? '#065f46' : '#991b1b',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <span>{actionMessage.text}</span>
                    <button onClick={() => setActionMessage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
                </div>
            )}

            {/* Top Vacancy & Coverage Metric Cards (Daily Mode) */}
            {viewMode === 'daily' && coverageSummary && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: '12px'
                }}>
                    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '14px 16px' }}>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 500 }}>Required Strength</div>
                        <div style={{ fontSize: '24px', fontWeight: 700, marginTop: '4px' }}>
                            {coverageSummary.required_strength}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>Post shift targets</div>
                    </div>

                    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '14px 16px' }}>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 500 }}>Rostered Guards</div>
                        <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-primary)', marginTop: '4px' }}>
                            {coverageSummary.rostered_strength}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>Regular duty slots</div>
                    </div>

                    <div style={{
                        background: 'var(--color-surface)',
                        border: `1px solid ${coverageSummary.vacancies > 0 ? '#fca5a5' : 'var(--color-border)'}`,
                        borderRadius: '8px',
                        padding: '14px 16px'
                    }}>
                        <div style={{ fontSize: '12px', color: coverageSummary.vacancies > 0 ? '#ef4444' : 'var(--color-text-muted)', fontWeight: 500 }}>
                            Vacancies
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: 700, color: coverageSummary.vacancies > 0 ? '#ef4444' : 'inherit', marginTop: '4px' }}>
                            {coverageSummary.vacancies}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                            {coverageSummary.vacancies > 0 ? 'Uncovered posts' : 'All posts assigned'}
                        </div>
                    </div>

                    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '14px 16px' }}>
                        <div style={{ fontSize: '12px', color: '#6366f1', fontWeight: 500 }}>Replacement Coverage</div>
                        <div style={{ fontSize: '24px', fontWeight: 700, color: '#6366f1', marginTop: '4px' }}>
                            {coverageSummary.replacement_coverage}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>Temporary relief guards</div>
                    </div>

                    <div style={{
                        background: 'var(--color-surface)',
                        border: `1px solid ${coverageSummary.final_covered_strength >= coverageSummary.required_strength ? '#86efac' : '#fdba74'}`,
                        borderRadius: '8px',
                        padding: '14px 16px'
                    }}>
                        <div style={{
                            fontSize: '12px',
                            color: coverageSummary.final_covered_strength >= coverageSummary.required_strength ? '#10b981' : '#f97316',
                            fontWeight: 500
                        }}>
                            Final Covered Strength
                        </div>
                        <div style={{
                            fontSize: '24px',
                            fontWeight: 700,
                            color: coverageSummary.final_covered_strength >= coverageSummary.required_strength ? '#10b981' : '#f97316',
                            marginTop: '4px'
                        }}>
                            {coverageSummary.final_covered_strength} / {coverageSummary.required_strength}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                            {coverageSummary.final_covered_strength >= coverageSummary.required_strength ? '100% Fully Manned' : 'Manning Deficit'}
                        </div>
                    </div>
                </div>
            )}

            {/* Loading & Error States */}
            {isLoading && <LoadingState />}
            {hasError && !isLoading && <ErrorState message="Failed to load roster data." onRetry={fetchData} />}

            {/* Daily View Content */}
            {!isLoading && !hasError && viewMode === 'daily' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Shift / Post Coverage Breakdown */}
                    {coverageSummary && coverageSummary.shifts && coverageSummary.shifts.length > 0 && (
                        <div style={{
                            background: 'var(--color-surface)',
                            border: '1px solid var(--color-border)',
                            borderRadius: '8px',
                            overflow: 'hidden'
                        }}>
                            <div style={{
                                padding: '12px 16px',
                                borderBottom: '1px solid var(--color-border)',
                                background: 'rgba(0, 0, 0, 0.02)',
                                fontWeight: 600,
                                fontSize: '14px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}>
                                <span>Shift & Post Manpower Target Breakdown</span>
                                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 'normal' }}>
                                    {selectedDate}
                                </span>
                            </div>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)', textAlign: 'left' }}>
                                            <th style={{ padding: '10px 14px' }}>Shift</th>
                                            <th style={{ padding: '10px 14px' }}>Post</th>
                                            <th style={{ padding: '10px 14px', textAlign: 'center' }}>Required</th>
                                            <th style={{ padding: '10px 14px', textAlign: 'center' }}>Rostered</th>
                                            <th style={{ padding: '10px 14px', textAlign: 'center' }}>Vacant</th>
                                            <th style={{ padding: '10px 14px', textAlign: 'center' }}>Replacement</th>
                                            <th style={{ padding: '10px 14px', textAlign: 'center' }}>Final Covered</th>
                                            <th style={{ padding: '10px 14px', textAlign: 'center' }}>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {coverageSummary.shifts.map(shiftItem => (
                                            <React.Fragment key={shiftItem.shift_id}>
                                                {shiftItem.posts.map(postItem => (
                                                    <tr key={`${shiftItem.shift_id}-${postItem.post_id || 'general'}`} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                        <td style={{ padding: '10px 14px', fontWeight: 500 }}>
                                                            {shiftItem.shift_name}
                                                            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                                                                {shiftItem.start_time} - {shiftItem.end_time}
                                                                {shiftItem.is_overnight && ' (Overnight)'}
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '10px 14px' }}>
                                                            <div style={{ fontWeight: 600 }}>{postItem.post_name}</div>
                                                            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                                                                {postItem.required_designation_name || postItem.required_designation || 'General Guard'}
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600 }}>
                                                            {postItem.required}
                                                        </td>
                                                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                                            {postItem.rostered}
                                                        </td>
                                                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                                            {postItem.vacant > 0 ? (
                                                                <span style={{ color: '#ef4444', fontWeight: 600 }}>{postItem.vacant}</span>
                                                            ) : (
                                                                <span style={{ color: 'var(--color-text-muted)' }}>0</span>
                                                            )}
                                                        </td>
                                                        <td style={{ padding: '10px 14px', textAlign: 'center', color: '#6366f1' }}>
                                                            {postItem.replacement_assigned}
                                                        </td>
                                                        <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600 }}>
                                                            <span style={{ color: postItem.final_covered >= postItem.required ? '#10b981' : '#ef4444' }}>
                                                                {postItem.final_covered}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                                            <Badge variant={postItem.final_covered >= postItem.required && postItem.required > 0 ? 'success' : postItem.required === 0 ? 'default' : 'danger'}>
                                                                {postItem.final_covered >= postItem.required ? 'COVERED' : 'SHORT'}
                                                            </Badge>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </React.Fragment>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Detailed Roster Table */}
                    <div style={{
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        borderRadius: '8px',
                        overflow: 'hidden'
                    }}>
                        <div style={{
                            padding: '14px 16px',
                            borderBottom: '1px solid var(--color-border)',
                            background: 'rgba(0, 0, 0, 0.02)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <div>
                                <span style={{ fontWeight: 600, fontSize: '15px' }}>Scheduled Duty Slots</span>
                                <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                    ({rosters.length} assigned guards)
                                </span>
                            </div>
                            <Button
                                variant="secondary"
                                size="sm"
                                icon="bx-plus"
                                onClick={() => {
                                    setEditingRoster(null);
                                    setDefaultModalValues({ site: selectedSite, duty_date: selectedDate, shift: selectedShift });
                                    setIsRosterModalOpen(true);
                                }}
                            >
                                Add Slot
                            </Button>
                        </div>

                        {rosters.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-text-muted)' }}>
                                <i className="bx bx-calendar-x" style={{ fontSize: '40px', marginBottom: '8px', display: 'block' }} />
                                <div style={{ fontSize: '15px', fontWeight: 500, marginBottom: '6px' }}>No duty roster records found</div>
                                <div style={{ fontSize: '13px', marginBottom: '16px' }}>
                                    No duties scheduled for {selectedDate}. Use "Bulk Generate" or "Schedule Duty" to assign personnel.
                                </div>
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={() => {
                                        setEditingRoster(null);
                                        setDefaultModalValues({ site: selectedSite, duty_date: selectedDate, shift: selectedShift });
                                        setIsRosterModalOpen(true);
                                    }}
                                >
                                    Schedule Duty
                                </Button>
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)', textAlign: 'left' }}>
                                            <th style={{ padding: '12px 14px' }}>Guard</th>
                                            <th style={{ padding: '12px 14px' }}>Designation</th>
                                            <th style={{ padding: '12px 14px' }}>Post</th>
                                            <th style={{ padding: '12px 14px' }}>Shift Details</th>
                                            <th style={{ padding: '12px 14px' }}>Coverage Type</th>
                                            <th style={{ padding: '12px 14px' }}>Status</th>
                                            <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rosters.map(roster => (
                                            <tr key={roster.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                <td style={{ padding: '12px 14px' }}>
                                                    <div style={{ fontWeight: 600 }}>{roster.employee_name}</div>
                                                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                                                        ID: {roster.employee_code || roster.employee.substring(0, 8)}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '12px 14px' }}>
                                                    {roster.employee_designation || roster.designation_name || '—'}
                                                </td>
                                                <td style={{ padding: '12px 14px' }}>
                                                    <div style={{ fontWeight: 500 }}>{roster.post_name || 'General Post'}</div>
                                                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                                                        {roster.site_name}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '12px 14px' }}>
                                                    <div style={{ fontWeight: 500 }}>{roster.shift_name} ({roster.shift_code})</div>
                                                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                                                        {roster.shift_start || roster.shift_start_time} - {roster.shift_end || roster.shift_end_time}
                                                        {(roster.shift_is_overnight || roster.shift_crosses_midnight) && ' (Cross-Midnight)'}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '12px 14px' }}>
                                                    {roster.is_replacement ? (
                                                        <div>
                                                            <span style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                padding: '2px 8px',
                                                                borderRadius: '12px',
                                                                fontSize: '11px',
                                                                fontWeight: 600,
                                                                background: '#e0e7ff',
                                                                color: '#4338ca'
                                                            }}>
                                                                Temporary Replacement
                                                            </span>
                                                            {roster.original_employee_name && (
                                                                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                                                                    Covering: {roster.original_employee_name}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            padding: '2px 8px',
                                                            borderRadius: '12px',
                                                            fontSize: '11px',
                                                            fontWeight: 600,
                                                            background: '#ecfdf5',
                                                            color: '#065f46'
                                                        }}>
                                                            Permanent Deployment
                                                        </span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '12px 14px' }}>
                                                    <Badge variant={
                                                        roster.status === 'COMPLETED' ? 'success' :
                                                        roster.status === 'SCHEDULED' ? 'primary' :
                                                        roster.status === 'REPLACED' ? 'warning' :
                                                        roster.status === 'SWAPPED' ? 'default' : 'danger'
                                                    }>
                                                        {roster.status}
                                                    </Badge>
                                                </td>
                                                <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                                                    <div style={{ display: 'inline-flex', gap: '6px' }}>
                                                        {roster.status === 'SCHEDULED' && (
                                                            <>
                                                                <button
                                                                    onClick={() => {
                                                                        setRosterForReplacement(roster);
                                                                        setIsReplacementModalOpen(true);
                                                                    }}
                                                                    style={{
                                                                        padding: '4px 8px',
                                                                        fontSize: '12px',
                                                                        borderRadius: '4px',
                                                                        border: '1px solid var(--color-border)',
                                                                        background: 'var(--color-surface)',
                                                                        color: '#6366f1',
                                                                        cursor: 'pointer',
                                                                        fontWeight: 500
                                                                    }}
                                                                    title="Assign replacement guard"
                                                                >
                                                                    Replace
                                                                </button>
                                                                <button
                                                                    onClick={() => {
                                                                        setRosterForSwap(roster);
                                                                        setIsSwapModalOpen(true);
                                                                    }}
                                                                    style={{
                                                                        padding: '4px 8px',
                                                                        fontSize: '12px',
                                                                        borderRadius: '4px',
                                                                        border: '1px solid var(--color-border)',
                                                                        background: 'var(--color-surface)',
                                                                        color: '#0284c7',
                                                                        cursor: 'pointer',
                                                                        fontWeight: 500
                                                                    }}
                                                                    title="Swap duty with another guard"
                                                                >
                                                                    Swap
                                                                </button>
                                                            </>
                                                        )}
                                                        <button
                                                            onClick={() => {
                                                                setHistoryEmployee({ id: roster.employee, name: roster.employee_name || 'Guard' });
                                                                setIsEmployeeHistoryModalOpen(true);
                                                            }}
                                                            style={{
                                                                padding: '4px 8px',
                                                                fontSize: '12px',
                                                                borderRadius: '4px',
                                                                border: '1px solid var(--color-border)',
                                                                background: 'var(--color-surface)',
                                                                color: 'var(--color-text-muted)',
                                                                cursor: 'pointer'
                                                            }}
                                                            title="View guard's full duty history"
                                                        >
                                                            History
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteRoster(roster.id)}
                                                            style={{
                                                                padding: '4px 8px',
                                                                fontSize: '12px',
                                                                borderRadius: '4px',
                                                                border: '1px solid var(--color-border)',
                                                                background: 'var(--color-surface)',
                                                                color: '#ef4444',
                                                                cursor: 'pointer'
                                                            }}
                                                            title="Remove duty slot"
                                                        >
                                                            <i className="bx bx-trash" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Weekly Matrix View Content */}
            {!isLoading && !hasError && viewMode === 'weekly' && rangeCoverage && (
                <div style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    overflow: 'hidden'
                }}>
                    <div style={{
                        padding: '14px 16px',
                        borderBottom: '1px solid var(--color-border)',
                        background: 'rgba(0, 0, 0, 0.02)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}>
                        <span style={{ fontWeight: 600, fontSize: '15px' }}>
                            Weekly Planning Matrix ({weekStartMon} to {navigateDate(weekStartMon, 6)})
                        </span>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                            Site: {rangeCoverage.site_name || 'Selected Site'}
                        </div>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
                                    <th style={{ padding: '10px 12px', textAlign: 'left', minWidth: '160px' }}>Post</th>
                                    {weekDays.map(d => {
                                        const dayObj = new Date(d);
                                        const dayName = dayObj.toLocaleDateString(undefined, { weekday: 'short' });
                                        const isToday = d === today;
                                        return (
                                            <th key={d} style={{
                                                padding: '10px 8px',
                                                textAlign: 'center',
                                                minWidth: '130px',
                                                background: isToday ? 'rgba(59, 130, 246, 0.08)' : undefined
                                            }}>
                                                <div style={{ fontWeight: 600, color: isToday ? 'var(--color-primary)' : 'inherit' }}>{dayName}</div>
                                                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{d.substring(5)}</div>
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {/* Summary row per day */}
                                <tr style={{ borderBottom: '2px solid var(--color-border)', background: 'rgba(0,0,0,0.02)' }}>
                                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>Coverage Status</td>
                                    {weekDays.map(d => {
                                        const dayCov = rangeCoverage.days.find(item => item.date === d);
                                        const req = dayCov ? dayCov.required_strength : 0;
                                        const cov = dayCov ? dayCov.final_covered_strength : 0;
                                        const isFullyCovered = cov >= req && req > 0;
                                        return (
                                            <td key={d} style={{ padding: '8px', textAlign: 'center' }}>
                                                <div style={{ fontWeight: 700, color: isFullyCovered ? '#10b981' : req === 0 ? 'var(--color-text-muted)' : '#ef4444' }}>
                                                    {cov} / {req}
                                                </div>
                                                <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>
                                                    {req === 0 ? 'No Targets' : isFullyCovered ? 'Covered' : 'Short'}
                                                </div>
                                            </td>
                                        );
                                    })}
                                </tr>

                                {/* Posts grouped rows */}
                                {Array.from(new Set(rosters.map(r => r.post).filter((p): p is string => Boolean(p)))).map(postId => {
                                    const postRosters = rosters.filter(r => r.post === postId);
                                    const postName = postRosters[0]?.post_name || postId;
                                    return (
                                        <tr key={postId} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                            <td style={{ padding: '10px 12px', fontWeight: 600, verticalAlign: 'top' }}>
                                                {postName}
                                            </td>
                                            {weekDays.map(d => {
                                                const dayRosters = postRosters.filter(r => r.duty_date === d);
                                                return (
                                                    <td key={d} style={{ padding: '8px', verticalAlign: 'top', borderLeft: '1px solid var(--color-border)' }}>
                                                        {dayRosters.length === 0 ? (
                                                            <button
                                                                onClick={() => {
                                                                    setEditingRoster(null);
                                                                    setDefaultModalValues({ site: selectedSite, duty_date: d, post: postId, shift: selectedShift });
                                                                    setIsRosterModalOpen(true);
                                                                }}
                                                                style={{
                                                                    width: '100%',
                                                                    padding: '4px',
                                                                    border: '1px dashed var(--color-border)',
                                                                    background: 'none',
                                                                    color: 'var(--color-text-muted)',
                                                                    borderRadius: '4px',
                                                                    cursor: 'pointer',
                                                                    fontSize: '11px'
                                                                }}
                                                            >
                                                                + Assign
                                                            </button>
                                                        ) : (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                {dayRosters.map(r => (
                                                                    <div
                                                                        key={r.id}
                                                                        style={{
                                                                            padding: '4px 6px',
                                                                            borderRadius: '4px',
                                                                            background: r.is_replacement ? '#e0e7ff' : '#f1f5f9',
                                                                            border: `1px solid ${r.is_replacement ? '#c7d2fe' : '#e2e8f0'}`,
                                                                            fontSize: '11px'
                                                                        }}
                                                                    >
                                                                        <div style={{ fontWeight: 600, color: r.is_replacement ? '#3730a3' : '#1e293b' }}>
                                                                            {r.employee_name}
                                                                        </div>
                                                                        <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>
                                                                            {r.shift_code} • {r.status}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Modals */}
            <DutyRosterModal
                isOpen={isRosterModalOpen}
                onClose={() => { setIsRosterModalOpen(false); setEditingRoster(null); }}
                onSave={fetchData}
                editingRoster={editingRoster}
                defaultSiteId={defaultModalValues.site}
                defaultDutyDate={defaultModalValues.duty_date}
                defaultShiftId={defaultModalValues.shift}
                defaultPostId={defaultModalValues.post}
            />

            {rosterForReplacement && (
                <DutyReplacementModal
                    isOpen={isReplacementModalOpen}
                    onClose={() => { setIsReplacementModalOpen(false); setRosterForReplacement(null); }}
                    onSuccess={fetchData}
                    roster={rosterForReplacement}
                />
            )}

            {rosterForSwap && (
                <DutySwapModal
                    isOpen={isSwapModalOpen}
                    onClose={() => { setIsSwapModalOpen(false); setRosterForSwap(null); }}
                    onSuccess={fetchData}
                    rosterA={rosterForSwap}
                />
            )}

            <ShiftSetupModal
                isOpen={isShiftModalOpen}
                onClose={() => setIsShiftModalOpen(false)}
                onSave={async () => {
                    const shiftsData = await getShifts({ is_active: true });
                    setShifts(shiftsData);
                }}
            />

            <PostShiftRequirementModal
                isOpen={isPostShiftReqModalOpen}
                onClose={() => setIsPostShiftReqModalOpen(false)}
                onSave={fetchData}
                initialSiteId={selectedSite}
            />

            {historyEmployee && (
                <EmployeeRosterHistoryModal
                    isOpen={isEmployeeHistoryModalOpen}
                    onClose={() => { setIsEmployeeHistoryModalOpen(false); setHistoryEmployee(null); }}
                    employeeId={historyEmployee.id}
                    employeeName={historyEmployee.name}
                />
            )}
        </div>
    );
};
