import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import {
    getDailyAttendanceWorkspace,
    setAttendanceStatus,
    bulkSetAttendance,
    getOperationalSites
} from '../api';
import type {
    DailyAttendanceRow,
    DailyAttendanceWorkspace,
    AttendanceStatusCode,
    OperationalSite
} from '../types';
import { ApplyLeaveModal } from './ApplyLeaveModal';
import { RestoreJumpModal } from './RestoreJumpModal';
import { AttendanceHistoryModal } from './AttendanceHistoryModal';

export const AttendanceView: React.FC = () => {
    const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [classificationFilter, setClassificationFilter] = useState<'ALL' | 'DIRECT' | 'INDIRECT'>('ALL');
    const [siteFilter, setSiteFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [searchQuery, setSearchQuery] = useState('');

    const [workspace, setWorkspace] = useState<DailyAttendanceWorkspace | null>(null);
    const [sites, setSites] = useState<OperationalSite[]>([]);
    const [loading, setLoading] = useState(true);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [actionSuccess, setActionSuccess] = useState<string | null>(null);

    // Multi-selection for bulk operations
    const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
    const [bulkStatus, setBulkStatus] = useState<AttendanceStatusCode>('PRESENT');
    const [bulkLoading, setBulkLoading] = useState(false);

    // Modals state
    const [leaveModalOpen, setLeaveModalOpen] = useState(false);
    const [selectedEmpForLeave, setSelectedEmpForLeave] = useState<{ id: string; name: string } | null>(null);

    const [restoreModalOpen, setRestoreModalOpen] = useState(false);
    const [selectedEmpForRestore, setSelectedEmpForRestore] = useState<DailyAttendanceRow | null>(null);

    const [historyModalOpen, setHistoryModalOpen] = useState(false);
    const [selectedEmpForHistory, setSelectedEmpForHistory] = useState<{ id: string; name: string; code?: string } | null>(null);

    // Watchlist view tab
    const [activeTab, setActiveTab] = useState<'ATTENDANCE' | 'JUMP_WATCHLIST'>('ATTENDANCE');

    // Load available sites
    useEffect(() => {
        getOperationalSites({ is_active: true, page: 1 })
            .then(res => setSites(res.results || []))
            .catch(() => setSites([]));
    }, []);

    // Load attendance workspace data
    const fetchWorkspace = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await getDailyAttendanceWorkspace({
                date: selectedDate,
                classification: classificationFilter === 'ALL' ? undefined : classificationFilter,
                site: siteFilter || undefined,
                search: searchQuery || undefined,
                status: statusFilter === 'ALL' ? undefined : statusFilter
            });
            setWorkspace(data);
            setSelectedEmployeeIds([]);
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Failed to load attendance data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchWorkspace();
    }, [selectedDate, classificationFilter, siteFilter, statusFilter]);

    // Handle Quick Date Navigation
    const changeDateBy = (days: number) => {
        const d = new Date(selectedDate);
        d.setDate(d.getDate() + days);
        setSelectedDate(d.toISOString().split('T')[0]);
    };

    // Quick inline status change
    const handleQuickStatusChange = async (employeeId: string, newStatus: AttendanceStatusCode) => {
        setUpdatingId(employeeId);
        setActionSuccess(null);
        try {
            await setAttendanceStatus({
                employee_id: employeeId,
                date: selectedDate,
                status: newStatus
            });
            setActionSuccess(`Attendance status updated to ${newStatus}`);
            await fetchWorkspace();
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Failed to update attendance status');
        } finally {
            setUpdatingId(null);
        }
    };

    // Bulk status update
    const handleBulkApply = async () => {
        if (selectedEmployeeIds.length === 0) return;
        setBulkLoading(true);
        setError(null);
        setActionSuccess(null);
        try {
            const res = await bulkSetAttendance({
                employee_ids: selectedEmployeeIds,
                date: selectedDate,
                status: bulkStatus
            });
            setActionSuccess(res.message || `Updated ${res.updated_count} employee records.`);
            setSelectedEmployeeIds([]);
            await fetchWorkspace();
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Failed to execute bulk attendance update');
        } finally {
            setBulkLoading(false);
        }
    };

    const records = workspace?.workforce || workspace?.records || [];

    // Filter records for search query client-side if needed
    const filteredRecords = useMemo(() => {
        let list = records;
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(r =>
                r.employee_name.toLowerCase().includes(q) ||
                r.employee_code.toLowerCase().includes(q) ||
                (r.site_name && r.site_name.toLowerCase().includes(q)) ||
                (r.post_name && r.post_name.toLowerCase().includes(q))
            );
        }
        if (activeTab === 'JUMP_WATCHLIST') {
            list = list.filter(r => r.is_jump_active || (r.consecutive_absent_days >= 5) || r.is_jump_warning);
        }
        return list;
    }, [records, searchQuery, activeTab]);

    const allSelected = filteredRecords.length > 0 && selectedEmployeeIds.length === filteredRecords.length;

    const toggleSelectAll = () => {
        if (allSelected) {
            setSelectedEmployeeIds([]);
        } else {
            setSelectedEmployeeIds(filteredRecords.map(r => r.employee_id));
        }
    };

    const toggleSelectRow = (empId: string) => {
        if (selectedEmployeeIds.includes(empId)) {
            setSelectedEmployeeIds(selectedEmployeeIds.filter(id => id !== empId));
        } else {
            setSelectedEmployeeIds([...selectedEmployeeIds, empId]);
        }
    };

    const totals = workspace?.totals || {
        total_workforce: 0,
        present: 0,
        absent: 0,
        paid_leave: 0,
        unpaid_leave: 0,
        holiday: 0,
        weekly_off: 0,
        half_day: 0,
        jump_missing: 0,
        finalized: 0,
        unfinalized: 0
    };

    const uncoveredCount = workspace?.uncovered_absences_count ?? 0;

    return (
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Top Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: 'var(--color-text, #f8fafc)' }}>
                        Workforce Attendance & JUMP Management
                    </h1>
                    <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                        Central daily muster, persistent state tracking, date-range leave & automated 7-day JUMP governance
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <Button
                        variant="secondary"
                        onClick={() => {
                            setSelectedEmpForLeave(null);
                            setLeaveModalOpen(true);
                        }}
                    >
                        + Apply Date-Range Leave
                    </Button>
                    <Button variant="secondary" onClick={fetchWorkspace} disabled={loading}>
                        ↻ Refresh
                    </Button>
                </div>
            </div>

            {/* Date Navigator & Classification Pills */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                background: 'var(--color-surface, #1e293b)',
                padding: '14px 18px',
                borderRadius: '8px',
                border: '1px solid var(--color-border, #334155)'
            }}>
                {/* Date Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Button variant="secondary" size="small" onClick={() => changeDateBy(-1)}>
                        ‹ Prev
                    </Button>
                    <Input
                        type="date"
                        value={selectedDate}
                        onChange={e => setSelectedDate(e.target.value)}
                        style={{ width: '160px', fontWeight: 600 }}
                    />
                    <Button variant="secondary" size="small" onClick={() => changeDateBy(1)}>
                        Next ›
                    </Button>
                    <Button
                        variant="ghost"
                        size="small"
                        onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
                    >
                        Today
                    </Button>
                </div>

                {/* Classification Toggle */}
                <div style={{ display: 'flex', background: 'var(--color-surface-hover, rgba(255,255,255,0.05))', borderRadius: '6px', padding: '3px' }}>
                    <button
                        onClick={() => setClassificationFilter('ALL')}
                        style={{
                            padding: '6px 14px',
                            borderRadius: '4px',
                            border: 'none',
                            background: classificationFilter === 'ALL' ? 'var(--color-primary, #3b82f6)' : 'transparent',
                            color: classificationFilter === 'ALL' ? '#ffffff' : 'var(--color-text-secondary, #94a3b8)',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: 'pointer'
                        }}
                    >
                        All Workforce
                    </button>
                    <button
                        onClick={() => setClassificationFilter('DIRECT')}
                        style={{
                            padding: '6px 14px',
                            borderRadius: '4px',
                            border: 'none',
                            background: classificationFilter === 'DIRECT' ? 'var(--color-primary, #3b82f6)' : 'transparent',
                            color: classificationFilter === 'DIRECT' ? '#ffffff' : 'var(--color-text-secondary, #94a3b8)',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: 'pointer'
                        }}
                    >
                        DIRECT (Guards)
                    </button>
                    <button
                        onClick={() => setClassificationFilter('INDIRECT')}
                        style={{
                            padding: '6px 14px',
                            borderRadius: '4px',
                            border: 'none',
                            background: classificationFilter === 'INDIRECT' ? 'var(--color-primary, #3b82f6)' : 'transparent',
                            color: classificationFilter === 'INDIRECT' ? '#ffffff' : 'var(--color-text-secondary, #94a3b8)',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: 'pointer'
                        }}
                    >
                        INDIRECT (Office)
                    </button>
                </div>

                {/* Site Filter */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--color-text-secondary, #94a3b8)' }}>Site:</span>
                    <select
                        value={siteFilter}
                        onChange={e => setSiteFilter(e.target.value)}
                        style={{
                            padding: '8px 12px',
                            background: 'var(--color-surface, #1e293b)',
                            border: '1px solid var(--color-border, #334155)',
                            color: 'var(--color-text, #f8fafc)',
                            borderRadius: '6px',
                            fontSize: '13px',
                            minWidth: '180px'
                        }}
                    >
                        <option value="">All Operational Sites</option>
                        {sites.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Metrics KPI Cards */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: '12px'
            }}>
                <div style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    background: 'var(--color-surface, #1e293b)',
                    border: '1px solid var(--color-border, #334155)'
                }}>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary, #94a3b8)', textTransform: 'uppercase' }}>Total Workforce</div>
                    <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-text, #f8fafc)', marginTop: '4px' }}>
                        {totals.total_workforce}
                    </div>
                </div>

                <div style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    background: 'rgba(34, 197, 94, 0.08)',
                    border: '1px solid rgba(34, 197, 94, 0.3)'
                }}>
                    <div style={{ fontSize: '11px', color: '#22c55e', textTransform: 'uppercase', fontWeight: 600 }}>Present</div>
                    <div style={{ fontSize: '22px', fontWeight: 700, color: '#22c55e', marginTop: '4px' }}>
                        {totals.present}
                    </div>
                </div>

                <div style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.3)'
                }}>
                    <div style={{ fontSize: '11px', color: '#ef4444', textTransform: 'uppercase', fontWeight: 600 }}>Absent</div>
                    <div style={{ fontSize: '22px', fontWeight: 700, color: '#ef4444', marginTop: '4px' }}>
                        {totals.absent}
                    </div>
                </div>

                <div style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    background: 'rgba(59, 130, 246, 0.08)',
                    border: '1px solid rgba(59, 130, 246, 0.3)'
                }}>
                    <div style={{ fontSize: '11px', color: '#3b82f6', textTransform: 'uppercase', fontWeight: 600 }}>Paid Leave</div>
                    <div style={{ fontSize: '22px', fontWeight: 700, color: '#3b82f6', marginTop: '4px' }}>
                        {totals.paid_leave}
                    </div>
                </div>

                <div style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    background: 'rgba(245, 158, 11, 0.08)',
                    border: '1px solid rgba(245, 158, 11, 0.3)'
                }}>
                    <div style={{ fontSize: '11px', color: '#f59e0b', textTransform: 'uppercase', fontWeight: 600 }}>Unpaid Leave</div>
                    <div style={{ fontSize: '22px', fontWeight: 700, color: '#f59e0b', marginTop: '4px' }}>
                        {totals.unpaid_leave}
                    </div>
                </div>

                <div style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    background: 'rgba(100, 116, 139, 0.08)',
                    border: '1px solid rgba(100, 116, 139, 0.3)'
                }}>
                    <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Weekly Off</div>
                    <div style={{ fontSize: '22px', fontWeight: 700, color: '#94a3b8', marginTop: '4px' }}>
                        {totals.weekly_off}
                    </div>
                </div>

                <div style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    background: 'rgba(20, 184, 166, 0.08)',
                    border: '1px solid rgba(20, 184, 166, 0.3)'
                }}>
                    <div style={{ fontSize: '11px', color: '#14b8a6', textTransform: 'uppercase', fontWeight: 600 }}>Half Day</div>
                    <div style={{ fontSize: '22px', fontWeight: 700, color: '#14b8a6', marginTop: '4px' }}>
                        {totals.half_day}
                    </div>
                </div>

                <div style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    background: totals.jump_missing > 0 ? 'rgba(239, 68, 68, 0.2)' : 'var(--color-surface, #1e293b)',
                    border: totals.jump_missing > 0 ? '1px solid #ef4444' : '1px solid var(--color-border, #334155)',
                    cursor: 'pointer'
                }} onClick={() => setActiveTab('JUMP_WATCHLIST')}>
                    <div style={{ fontSize: '11px', color: totals.jump_missing > 0 ? '#ef4444' : 'var(--color-text-secondary, #94a3b8)', textTransform: 'uppercase', fontWeight: 700 }}>
                        🚨 JUMP / Missing
                    </div>
                    <div style={{ fontSize: '22px', fontWeight: 700, color: totals.jump_missing > 0 ? '#ef4444' : 'var(--color-text, #f8fafc)', marginTop: '4px' }}>
                        {totals.jump_missing}
                    </div>
                </div>
            </div>

            {/* Uncovered Absences Warning Banner */}
            {uncoveredCount > 0 && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '8px',
                    color: '#ef4444',
                    fontSize: '13px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '18px' }}>⚠️</span>
                        <span>
                            <strong>Staffing Alert:</strong> {uncoveredCount} rostered security guard(s) are marked ABSENT without an assigned replacement guard!
                        </span>
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 600 }}>Immediate supervisor coverage required</span>
                </div>
            )}

            {/* Notification and Errors */}
            {actionSuccess && (
                <div style={{
                    padding: '10px 14px',
                    borderRadius: '6px',
                    background: 'rgba(34, 197, 94, 0.1)',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    color: '#22c55e',
                    fontSize: '13px'
                }}>
                    ✓ {actionSuccess}
                </div>
            )}

            {error && (
                <div style={{
                    padding: '10px 14px',
                    borderRadius: '6px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#ef4444',
                    fontSize: '13px'
                }}>
                    {error}
                </div>
            )}

            {/* Main Tabs and Actions Toolbar */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px'
            }}>
                {/* Tab switcher */}
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={() => setActiveTab('ATTENDANCE')}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '6px',
                            border: '1px solid var(--color-border, #334155)',
                            background: activeTab === 'ATTENDANCE' ? 'var(--color-surface-hover, rgba(255,255,255,0.08))' : 'transparent',
                            color: activeTab === 'ATTENDANCE' ? 'var(--color-primary, #3b82f6)' : 'var(--color-text-secondary, #94a3b8)',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: 'pointer'
                        }}
                    >
                        Daily Attendance Sheet ({filteredRecords.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('JUMP_WATCHLIST')}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '6px',
                            border: '1px solid var(--color-border, #334155)',
                            background: activeTab === 'JUMP_WATCHLIST' ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
                            color: activeTab === 'JUMP_WATCHLIST' ? '#ef4444' : 'var(--color-text-secondary, #94a3b8)',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <span>🚨 JUMP / Missing Watchlist</span>
                        {totals.jump_missing > 0 && (
                            <span style={{
                                background: '#ef4444',
                                color: '#ffffff',
                                borderRadius: '10px',
                                padding: '1px 6px',
                                fontSize: '11px',
                                fontWeight: 700
                            }}>
                                {totals.jump_missing}
                            </span>
                        )}
                    </button>
                </div>

                {/* Bulk status actions */}
                {activeTab === 'ATTENDANCE' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--color-text-muted, #64748b)' }}>
                            {selectedEmployeeIds.length} selected
                        </span>
                        <select
                            value={bulkStatus}
                            onChange={e => setBulkStatus(e.target.value as AttendanceStatusCode)}
                            style={{
                                padding: '6px 10px',
                                background: 'var(--color-surface, #1e293b)',
                                border: '1px solid var(--color-border, #334155)',
                                color: 'var(--color-text, #f8fafc)',
                                borderRadius: '6px',
                                fontSize: '13px'
                            }}
                            disabled={selectedEmployeeIds.length === 0 || bulkLoading}
                        >
                            <option value="PRESENT">Mark PRESENT</option>
                            <option value="ABSENT">Mark ABSENT</option>
                            <option value="HALF_DAY">Mark HALF DAY</option>
                            <option value="WEEKLY_OFF">Mark WEEKLY OFF</option>
                            <option value="HOLIDAY">Mark HOLIDAY</option>
                        </select>
                        <Button
                            variant="primary"
                            size="small"
                            onClick={handleBulkApply}
                            disabled={selectedEmployeeIds.length === 0 || bulkLoading}
                        >
                            {bulkLoading ? 'Updating...' : 'Apply to Selected'}
                        </Button>
                    </div>
                )}
            </div>

            {/* Quick Search & Filter Toolbar */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '240px' }}>
                    <Input
                        placeholder="Search employee by name, ID code, site or post..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                </div>

                {activeTab === 'ATTENDANCE' && (
                    <div style={{ display: 'flex', gap: '6px', overflowX: 'auto' }}>
                        {['ALL', 'PRESENT', 'ABSENT', 'PAID_LEAVE', 'UNPAID_LEAVE', 'WEEKLY_OFF', 'HALF_DAY'].map(st => (
                            <button
                                key={st}
                                onClick={() => setStatusFilter(st)}
                                style={{
                                    padding: '5px 12px',
                                    borderRadius: '16px',
                                    border: '1px solid var(--color-border, #334155)',
                                    background: statusFilter === st ? 'var(--color-primary, #3b82f6)' : 'transparent',
                                    color: statusFilter === st ? '#ffffff' : 'var(--color-text-secondary, #94a3b8)',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap'
                                }}
                            >
                                {st}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Attendance Table */}
            <div style={{
                background: 'var(--color-surface, #1e293b)',
                borderRadius: '8px',
                border: '1px solid var(--color-border, #334155)',
                overflowX: 'auto'
            }}>
                {loading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-secondary, #94a3b8)' }}>
                        Loading attendance workspace...
                    </div>
                ) : filteredRecords.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted, #64748b)' }}>
                        {activeTab === 'JUMP_WATCHLIST'
                            ? 'No workforce members currently on JUMP status or with warning absence streaks.'
                            : 'No attendance records match the selected filters.'}
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                        <thead>
                            <tr style={{
                                background: 'var(--color-surface-hover, rgba(255,255,255,0.05))',
                                borderBottom: '1px solid var(--color-border, #334155)'
                            }}>
                                <th style={{ padding: '12px', width: '40px', textAlign: 'center' }}>
                                    <input
                                        type="checkbox"
                                        checked={allSelected}
                                        onChange={toggleSelectAll}
                                        style={{ cursor: 'pointer' }}
                                    />
                                </th>
                                <th style={{ padding: '12px 14px', fontWeight: 600 }}>Employee</th>
                                <th style={{ padding: '12px 14px', fontWeight: 600 }}>Site & Post</th>
                                <th style={{ padding: '12px 14px', fontWeight: 600 }}>Shift & Planned Duty</th>
                                <th style={{ padding: '12px 14px', fontWeight: 600 }}>Today's Status</th>
                                <th style={{ padding: '12px 14px', fontWeight: 600 }}>Replacement Coverage</th>
                                <th style={{ padding: '12px 14px', fontWeight: 600 }}>Absence Streak / JUMP</th>
                                <th style={{ padding: '12px 14px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRecords.map(row => {
                                const isSelected = selectedEmployeeIds.includes(row.employee_id);
                                const isUpdating = updatingId === row.employee_id;
                                const isDirect = row.classification === 'DIRECT';
                                const isAbsent = row.effective_status === 'ABSENT';
                                const hasReplacement = row.has_replacement_coverage || row.replacement_coverage?.has_replacement;
                                const reliefName = row.replacement_guard_name || row.replacement_coverage?.replacement_guard_name;

                                return (
                                    <tr
                                        key={row.employee_id}
                                        style={{
                                            borderBottom: '1px solid var(--color-border, #1e293b)',
                                            background: row.is_jump_active
                                                ? 'rgba(239, 68, 68, 0.05)'
                                                : (isSelected ? 'rgba(59, 130, 246, 0.05)' : 'transparent'),
                                            opacity: isUpdating ? 0.5 : 1
                                        }}
                                    >
                                        <td style={{ padding: '12px', textAlign: 'center' }}>
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => toggleSelectRow(row.employee_id)}
                                                style={{ cursor: 'pointer' }}
                                            />
                                        </td>

                                        {/* Employee */}
                                        <td style={{ padding: '12px 14px' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontWeight: 600, color: 'var(--color-text, #f8fafc)' }}>
                                                        {row.employee_name}
                                                    </span>
                                                    <span style={{
                                                        fontSize: '10px',
                                                        fontWeight: 700,
                                                        padding: '1px 5px',
                                                        borderRadius: '3px',
                                                        background: isDirect ? 'rgba(59, 130, 246, 0.15)' : 'rgba(100, 116, 139, 0.15)',
                                                        color: isDirect ? '#3b82f6' : '#94a3b8'
                                                    }}>
                                                        {row.classification}
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary, #94a3b8)', marginTop: '2px' }}>
                                                    {row.employee_code} • {row.designation_name || 'Staff'}
                                                </div>
                                            </div>
                                        </td>

                                        {/* Site & Post */}
                                        <td style={{ padding: '12px 14px' }}>
                                            {row.site_name ? (
                                                <div>
                                                    <div style={{ fontWeight: 500, color: 'var(--color-text, #f8fafc)' }}>
                                                        {row.site_name}
                                                    </div>
                                                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                                                        {row.post_name || 'General Deployment'}
                                                    </div>
                                                </div>
                                            ) : (
                                                <span style={{ color: 'var(--color-text-muted, #64748b)', fontSize: '12px' }}>
                                                    {isDirect ? 'Unassigned' : 'Head Office'}
                                                </span>
                                            )}
                                        </td>

                                        {/* Shift & Planned Duty */}
                                        <td style={{ padding: '12px 14px' }}>
                                            {row.has_planned_duty || row.shift_name ? (
                                                <div>
                                                    <div style={{ fontWeight: 500, color: 'var(--color-text, #f8fafc)' }}>
                                                        {row.shift_name}
                                                    </div>
                                                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                                                        {row.planned_duty || 'Rostered Duty'}
                                                        {row.is_replacement_duty && (
                                                            <span style={{ color: '#f59e0b', marginLeft: '4px' }}>(Relief)</span>
                                                        )}
                                                    </div>
                                                </div>
                                            ) : (
                                                <span style={{ color: 'var(--color-text-muted, #64748b)', fontSize: '12px' }}>
                                                    {isDirect ? 'No Shift Rostered' : 'Standard Office'}
                                                </span>
                                            )}
                                        </td>

                                        {/* Status & Quick Toggle */}
                                        <td style={{ padding: '12px 14px' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                <select
                                                    value={row.effective_status}
                                                    onChange={e => handleQuickStatusChange(row.employee_id, e.target.value as AttendanceStatusCode)}
                                                    style={{
                                                        padding: '4px 8px',
                                                        borderRadius: '6px',
                                                        fontSize: '12px',
                                                        fontWeight: 600,
                                                        cursor: 'pointer',
                                                        background: 'var(--color-surface, #1e293b)',
                                                        border: `1px solid ${
                                                            row.effective_status === 'PRESENT' ? '#22c55e' :
                                                            row.effective_status === 'ABSENT' ? '#ef4444' :
                                                            row.effective_status === 'PAID_LEAVE' ? '#3b82f6' :
                                                            row.effective_status === 'UNPAID_LEAVE' ? '#f59e0b' :
                                                            row.effective_status === 'HALF_DAY' ? '#14b8a6' :
                                                            'var(--color-border, #334155)'
                                                        }`,
                                                        color:
                                                            row.effective_status === 'PRESENT' ? '#22c55e' :
                                                            row.effective_status === 'ABSENT' ? '#ef4444' :
                                                            row.effective_status === 'PAID_LEAVE' ? '#3b82f6' :
                                                            row.effective_status === 'UNPAID_LEAVE' ? '#f59e0b' :
                                                            row.effective_status === 'HALF_DAY' ? '#14b8a6' :
                                                            'var(--color-text, #f8fafc)'
                                                    }}
                                                >
                                                    <option value="PRESENT">PRESENT</option>
                                                    <option value="ABSENT">ABSENT</option>
                                                    <option value="PAID_LEAVE">PAID LEAVE</option>
                                                    <option value="UNPAID_LEAVE">UNPAID LEAVE</option>
                                                    <option value="WEEKLY_OFF">WEEKLY OFF</option>
                                                    <option value="HOLIDAY">HOLIDAY</option>
                                                    <option value="HALF_DAY">HALF DAY</option>
                                                </select>
                                                <div style={{ fontSize: '10px', color: 'var(--color-text-muted, #64748b)' }}>
                                                    {row.is_materialized ? '● Finalized' : '○ Persistent Default'}
                                                </div>
                                            </div>
                                        </td>

                                        {/* Replacement Coverage (DIRECT only) */}
                                        <td style={{ padding: '12px 14px' }}>
                                            {isDirect ? (
                                                isAbsent ? (
                                                    hasReplacement ? (
                                                        <span style={{
                                                            fontSize: '11px',
                                                            color: '#22c55e',
                                                            background: 'rgba(34, 197, 94, 0.1)',
                                                            padding: '3px 8px',
                                                            borderRadius: '4px',
                                                            border: '1px solid rgba(34, 197, 94, 0.3)',
                                                            fontWeight: 600
                                                        }}>
                                                            ✓ Covered by {reliefName || 'Relief'}
                                                        </span>
                                                    ) : (
                                                        <span style={{
                                                            fontSize: '11px',
                                                            color: '#ef4444',
                                                            background: 'rgba(239, 68, 68, 0.1)',
                                                            padding: '3px 8px',
                                                            borderRadius: '4px',
                                                            border: '1px solid rgba(239, 68, 68, 0.3)',
                                                            fontWeight: 600
                                                        }}>
                                                            ⚠️ Uncovered
                                                        </span>
                                                    )
                                                ) : (
                                                    <span style={{ color: 'var(--color-text-muted, #64748b)', fontSize: '12px' }}>
                                                        —
                                                    </span>
                                                )
                                            ) : (
                                                <span style={{ color: 'var(--color-text-muted, #64748b)', fontSize: '12px' }}>
                                                    N/A (Indirect)
                                                </span>
                                            )}
                                        </td>

                                        {/* Absence Streak / JUMP */}
                                        <td style={{ padding: '12px 14px' }}>
                                            {row.is_jump_active ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                    <span style={{
                                                        fontSize: '11px',
                                                        fontWeight: 700,
                                                        color: '#ffffff',
                                                        background: '#ef4444',
                                                        padding: '2px 6px',
                                                        borderRadius: '3px',
                                                        textAlign: 'center'
                                                    }}>
                                                        🚨 JUMP / MISSING
                                                    </span>
                                                    <Button
                                                        size="small"
                                                        variant="primary"
                                                        onClick={() => {
                                                            setSelectedEmpForRestore(row);
                                                            setRestoreModalOpen(true);
                                                        }}
                                                        style={{ fontSize: '11px', padding: '2px 6px', background: '#22c55e', borderColor: '#22c55e' }}
                                                    >
                                                        Restore to Active
                                                    </Button>
                                                </div>
                                            ) : row.consecutive_absent_days >= 5 ? (
                                                <span style={{
                                                    fontSize: '11px',
                                                    color: '#f59e0b',
                                                    background: 'rgba(245, 158, 11, 0.15)',
                                                    padding: '3px 8px',
                                                    borderRadius: '4px',
                                                    border: '1px solid rgba(245, 158, 11, 0.3)',
                                                    fontWeight: 600
                                                }}>
                                                    ⚠️ {row.consecutive_absent_days}d Absent (JUMP Alert)
                                                </span>
                                            ) : row.consecutive_absent_days > 0 ? (
                                                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                                                    {row.consecutive_absent_days} day(s) absent
                                                </span>
                                            ) : (
                                                <span style={{ fontSize: '12px', color: '#22c55e' }}>
                                                    Active
                                                </span>
                                            )}
                                        </td>

                                        {/* Row Actions */}
                                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                                <Button
                                                    size="small"
                                                    variant="secondary"
                                                    onClick={() => {
                                                        setSelectedEmpForLeave({ id: row.employee_id, name: row.employee_name });
                                                        setLeaveModalOpen(true);
                                                    }}
                                                    title="Apply scheduled leave"
                                                >
                                                    Leave
                                                </Button>
                                                <Button
                                                    size="small"
                                                    variant="ghost"
                                                    onClick={() => {
                                                        setSelectedEmpForHistory({ id: row.employee_id, name: row.employee_name, code: row.employee_code });
                                                        setHistoryModalOpen(true);
                                                    }}
                                                    title="View attendance history"
                                                >
                                                    History
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Modals */}
            <ApplyLeaveModal
                isOpen={leaveModalOpen}
                onClose={() => setLeaveModalOpen(false)}
                employeeId={selectedEmpForLeave?.id}
                employeeName={selectedEmpForLeave?.name}
                defaultDate={selectedDate}
                onSuccess={() => {
                    setActionSuccess('Date-range leave recorded successfully.');
                    fetchWorkspace();
                }}
            />

            <RestoreJumpModal
                isOpen={restoreModalOpen}
                onClose={() => setRestoreModalOpen(false)}
                record={selectedEmpForRestore}
                onSuccess={() => {
                    setActionSuccess('Employee restored from JUMP to ACTIVE status.');
                    fetchWorkspace();
                }}
            />

            <AttendanceHistoryModal
                isOpen={historyModalOpen}
                onClose={() => setHistoryModalOpen(false)}
                employeeId={selectedEmpForHistory?.id || null}
                employeeName={selectedEmpForHistory?.name || null}
                employeeCode={selectedEmpForHistory?.code || null}
            />
        </div>
    );
};
