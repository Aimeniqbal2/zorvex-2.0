import React, { useState, useEffect, useMemo, useRef } from 'react';
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

interface AttendanceViewProps {
    initialSiteId?: string;
}

export const AttendanceView: React.FC<AttendanceViewProps> = ({ initialSiteId }) => {
    const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [siteFilter, setSiteFilter] = useState(initialSiteId || '');
    const [siteSearchText, setSiteSearchText] = useState('');
    const [isSiteDropdownOpen, setIsSiteDropdownOpen] = useState(false);
    const siteDropdownRef = useRef<HTMLDivElement>(null);
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [searchQuery, setSearchQuery] = useState('');
    const [sites, setSites] = useState<OperationalSite[]>([]);

    useEffect(() => {
        if (initialSiteId) {
            setSiteFilter(initialSiteId);
        }
    }, [initialSiteId]);

    // Keep site search input synchronized with selected site
    useEffect(() => {
        if (siteFilter) {
            const found = sites.find(s => s.id === siteFilter);
            if (found) {
                setSiteSearchText(found.name + (found.customer_name ? ` (${found.customer_name})` : ''));
            }
        } else {
            setSiteSearchText('');
        }
    }, [siteFilter, sites]);

    // Close site dropdown when clicking outside
    useEffect(() => {
        const handleOutsideClick = (event: MouseEvent) => {
            if (siteDropdownRef.current && !siteDropdownRef.current.contains(event.target as Node)) {
                setIsSiteDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleOutsideClick);
        return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, []);

    const [workspace, setWorkspace] = useState<DailyAttendanceWorkspace | null>(null);
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

    // Load available sites
    useEffect(() => {
        getOperationalSites({ is_active: true, page_size: 500 })
            .then(res => setSites(res.results || []))
            .catch(() => setSites([]));
    }, []);

    // Filter sites based on typed search query in combobox
    const filteredSites = useMemo(() => {
        if (!siteSearchText.trim()) return sites;
        const q = siteSearchText.toLowerCase();
        return sites.filter(s =>
            s.name.toLowerCase().includes(q) ||
            (s.customer_name && s.customer_name.toLowerCase().includes(q))
        );
    }, [sites, siteSearchText]);

    // Load attendance workspace data (strictly DIRECT deployed workforce)
    const fetchWorkspace = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await getDailyAttendanceWorkspace({
                date: selectedDate,
                classification: 'DIRECT',
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
    }, [selectedDate, siteFilter, statusFilter]);

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
            setActionSuccess(`Attendance marked: ${newStatus}`);
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
            setActionSuccess(res.message || `Updated ${res.updated_count} records.`);
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
        return list;
    }, [records, searchQuery]);

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

    const totalLeaveAndOff = (totals.paid_leave || 0) + (totals.unpaid_leave || 0) + (totals.weekly_off || 0) + (totals.holiday || 0) + (totals.half_day || 0);
    const activeSite = sites.find(s => s.id === siteFilter);

    return (
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--color-text, #f8fafc)' }}>
                        Daily Attendance
                    </h2>
                    <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                        Record and verify daily workforce muster by location and date.
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
                        <i className="bx bx-calendar-plus" style={{ marginRight: '6px' }}></i>
                        Apply Leave
                    </Button>
                    <Button variant="secondary" onClick={fetchWorkspace} disabled={loading}>
                        <i className="bx bx-refresh" style={{ marginRight: '6px' }}></i>
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Notification and Errors */}
            {actionSuccess && (
                <div style={{
                    padding: '8px 14px',
                    borderRadius: '6px',
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    color: '#10b981',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <span>✓ {actionSuccess}</span>
                    <button onClick={() => setActionSuccess(null)} style={{ background: 'none', border: 'none', color: '#10b981', cursor: 'pointer', fontSize: '14px' }}>✕</button>
                </div>
            )}

            {error && (
                <div style={{
                    padding: '8px 14px',
                    borderRadius: '6px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#ef4444',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <span>{error}</span>
                    <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px' }}>✕</button>
                </div>
            )}

            {/* Top Toolbar: Date & Site Selector */}
            <div style={{
                background: 'var(--color-surface, #1e293b)',
                border: '1px solid var(--color-border, #334155)',
                borderRadius: '8px',
                padding: '14px 16px',
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '14px'
            }}>
                {/* Date Navigation */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', marginRight: '4px' }}>
                        Date:
                    </span>
                    <button
                        type="button"
                        onClick={() => changeDateBy(-1)}
                        style={{
                            padding: '6px 10px',
                            background: 'var(--color-surface-hover, rgba(255,255,255,0.05))',
                            border: '1px solid var(--color-border)',
                            color: 'var(--color-text)',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px'
                        }}
                    >
                        ‹
                    </button>
                    <Input
                        type="date"
                        value={selectedDate}
                        onChange={e => setSelectedDate(e.target.value)}
                        style={{ width: '150px', fontWeight: 600, padding: '5px 8px' }}
                    />
                    <button
                        type="button"
                        onClick={() => changeDateBy(1)}
                        style={{
                            padding: '6px 10px',
                            background: 'var(--color-surface-hover, rgba(255,255,255,0.05))',
                            border: '1px solid var(--color-border)',
                            color: 'var(--color-text)',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px'
                        }}
                    >
                        ›
                    </button>
                    <button
                        type="button"
                        onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
                        style={{
                            padding: '6px 10px',
                            background: 'none',
                            border: '1px solid var(--color-border)',
                            color: 'var(--color-text-secondary)',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            marginLeft: '4px'
                        }}
                    >
                        Today
                    </button>
                </div>

                {/* Searchable Location / Site Combobox */}
                <div 
                    ref={siteDropdownRef} 
                    style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px', minWidth: '320px', flex: '1 1 320px', maxWidth: '440px' }}
                >
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                        Site / Location:
                    </span>
                    <div style={{ position: 'relative', width: '100%' }}>
                        <input
                            type="text"
                            placeholder="Type or select site (e.g. Denning)..."
                            value={siteSearchText}
                            onFocus={() => setIsSiteDropdownOpen(true)}
                            onChange={e => {
                                setSiteSearchText(e.target.value);
                                setIsSiteDropdownOpen(true);
                            }}
                            onKeyDown={e => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    if (filteredSites.length > 0) {
                                        const s = filteredSites[0];
                                        setSiteFilter(s.id);
                                        setSiteSearchText(s.name + (s.customer_name ? ` (${s.customer_name})` : ''));
                                        setIsSiteDropdownOpen(false);
                                    }
                                } else if (e.key === 'Escape') {
                                    setIsSiteDropdownOpen(false);
                                }
                            }}
                            style={{
                                width: '100%',
                                height: '36px',
                                padding: '0 32px 0 10px',
                                fontSize: '13px',
                                fontWeight: 600,
                                borderRadius: '6px',
                                border: '1px solid var(--color-border)',
                                background: 'var(--color-surface)',
                                color: 'var(--color-text)',
                                boxSizing: 'border-box'
                            }}
                        />

                        {/* Clear or Dropdown Caret Icon */}
                        <div style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {siteFilter && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSiteFilter('');
                                        setSiteSearchText('');
                                        setIsSiteDropdownOpen(false);
                                    }}
                                    title="Clear location filter"
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: 'var(--color-text-muted)',
                                        cursor: 'pointer',
                                        fontSize: '13px',
                                        padding: '2px'
                                    }}
                                >
                                    ✕
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setIsSiteDropdownOpen(prev => !prev)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--color-text-muted)',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    padding: '2px'
                                }}
                            >
                                ▾
                            </button>
                        </div>

                        {/* Floating Dropdown List */}
                        {isSiteDropdownOpen && (
                            <div style={{
                                position: 'absolute',
                                top: '40px',
                                left: 0,
                                right: 0,
                                maxHeight: '280px',
                                overflowY: 'auto',
                                background: 'var(--color-surface)',
                                border: '1px solid var(--color-border)',
                                borderRadius: '6px',
                                boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                                zIndex: 100,
                                padding: '4px 0'
                            }}>
                                <div
                                    onClick={() => {
                                        setSiteFilter('');
                                        setSiteSearchText('');
                                        setIsSiteDropdownOpen(false);
                                    }}
                                    style={{
                                        padding: '8px 12px',
                                        fontSize: '13px',
                                        cursor: 'pointer',
                                        fontWeight: siteFilter === '' ? 700 : 500,
                                        color: siteFilter === '' ? 'var(--color-primary)' : 'var(--color-text)',
                                        background: siteFilter === '' ? 'var(--color-surface-hover)' : 'transparent',
                                        borderBottom: '1px solid var(--color-border)'
                                    }}
                                >
                                    📍 All Operational Sites ({sites.length})
                                </div>

                                {filteredSites.length === 0 ? (
                                    <div style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                        No sites matching "{siteSearchText}"
                                    </div>
                                ) : (
                                    filteredSites.map(s => {
                                        const isSelected = s.id === siteFilter;
                                        return (
                                            <div
                                                key={s.id}
                                                onClick={() => {
                                                    setSiteFilter(s.id);
                                                    setSiteSearchText(s.name + (s.customer_name ? ` (${s.customer_name})` : ''));
                                                    setIsSiteDropdownOpen(false);
                                                }}
                                                style={{
                                                    padding: '8px 12px',
                                                    fontSize: '13px',
                                                    cursor: 'pointer',
                                                    fontWeight: isSelected ? 700 : 500,
                                                    color: isSelected ? 'var(--color-primary)' : 'var(--color-text)',
                                                    background: isSelected ? 'var(--color-surface-hover)' : 'transparent',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center'
                                                }}
                                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
                                                onMouseLeave={e => (e.currentTarget.style.background = isSelected ? 'var(--color-surface-hover)' : 'transparent')}
                                            >
                                                <span>{s.name}</span>
                                                {s.customer_name && (
                                                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginLeft: '8px' }}>
                                                        {s.customer_name}
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Guard Name / Code Search Bar */}
                <div style={{ minWidth: '240px', flex: '1 1 240px', maxWidth: '360px' }}>
                    <Input
                        placeholder="Search guard name or code..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        style={{ padding: '6px 10px', fontSize: '13px' }}
                    />
                </div>
            </div>

            {/* Quick Muster & 4 Clean Neutral KPI Cards */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '12px'
            }}>
                {/* Total Workforce */}
                <div 
                    onClick={() => setStatusFilter('ALL')}
                    style={{
                        background: 'var(--color-surface, #1e293b)',
                        border: statusFilter === 'ALL' ? '2px solid var(--color-primary, #3b82f6)' : '1px solid var(--color-border, #334155)',
                        borderRadius: '8px',
                        padding: '12px 16px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                    }}
                >
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary, #94a3b8)', textTransform: 'uppercase' }}>
                        Total Deployed
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-text, #f8fafc)', marginTop: '2px' }}>
                        {totals.total_workforce}
                    </div>
                </div>

                {/* Present (Green Accent) */}
                <div 
                    onClick={() => setStatusFilter('PRESENT')}
                    style={{
                        background: 'var(--color-surface, #1e293b)',
                        border: statusFilter === 'PRESENT' ? '2px solid #10b981' : '1px solid var(--color-border, #334155)',
                        borderRadius: '8px',
                        padding: '12px 16px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                    }}
                >
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#10b981', textTransform: 'uppercase' }}>
                        ✓ Present
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: '#10b981', marginTop: '2px' }}>
                        {totals.present}
                    </div>
                </div>

                {/* Absent (Red Accent) */}
                <div 
                    onClick={() => setStatusFilter('ABSENT')}
                    style={{
                        background: 'var(--color-surface, #1e293b)',
                        border: statusFilter === 'ABSENT' ? '2px solid #ef4444' : '1px solid var(--color-border, #334155)',
                        borderRadius: '8px',
                        padding: '12px 16px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                    }}
                >
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#ef4444', textTransform: 'uppercase' }}>
                        ✕ Absent
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: '#ef4444', marginTop: '2px' }}>
                        {totals.absent}
                    </div>
                </div>

                {/* Leave & Off (Neutral Gray) */}
                <div 
                    onClick={() => setStatusFilter('PAID_LEAVE')}
                    style={{
                        background: 'var(--color-surface, #1e293b)',
                        border: statusFilter === 'PAID_LEAVE' ? '2px solid var(--color-text-secondary)' : '1px solid var(--color-border, #334155)',
                        borderRadius: '8px',
                        padding: '12px 16px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                    }}
                >
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary, #94a3b8)', textTransform: 'uppercase' }}>
                        Leave & Off
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-text-secondary, #94a3b8)', marginTop: '2px' }}>
                        {totalLeaveAndOff}
                    </div>
                </div>
            </div>

            {/* Quick Action Bar for Site Attendance */}
            <div style={{
                background: 'var(--color-surface, #1e293b)',
                border: '1px solid var(--color-border, #334155)',
                borderRadius: '8px',
                padding: '10px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>
                        {activeSite ? activeSite.name : 'All Operational Sites'}:
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                        {filteredRecords.length} Guards Listed
                    </span>
                    {statusFilter !== 'ALL' && (
                        <button
                            type="button"
                            onClick={() => setStatusFilter('ALL')}
                            style={{
                                background: 'rgba(255,255,255,0.06)',
                                border: '1px solid var(--color-border)',
                                color: 'var(--color-primary)',
                                borderRadius: '4px',
                                padding: '2px 8px',
                                fontSize: '11px',
                                cursor: 'pointer',
                                marginLeft: '6px'
                            }}
                        >
                            Filter: {statusFilter} ✕
                        </button>
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {/* Bulk Selection Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                            fontSize: '12px',
                            fontWeight: 600,
                            padding: '4px 10px',
                            borderRadius: '6px',
                            background: selectedEmployeeIds.length > 0 ? 'rgba(59, 130, 246, 0.14)' : 'var(--color-surface-hover, rgba(255,255,255,0.05))',
                            color: selectedEmployeeIds.length > 0 ? 'var(--color-primary, #3b82f6)' : 'var(--color-text-secondary)',
                            border: '1px solid var(--color-border)'
                        }}>
                            {selectedEmployeeIds.length} Checked
                        </span>

                        <select
                            value={bulkStatus}
                            onChange={e => setBulkStatus(e.target.value as AttendanceStatusCode)}
                            disabled={selectedEmployeeIds.length === 0 || bulkLoading}
                            style={{
                                padding: '6px 12px',
                                background: 'var(--color-surface)',
                                border: '1px solid var(--color-border)',
                                color: 'var(--color-text)',
                                borderRadius: '6px',
                                fontSize: '13px',
                                fontWeight: 600,
                                cursor: selectedEmployeeIds.length === 0 ? 'not-allowed' : 'pointer',
                                opacity: selectedEmployeeIds.length === 0 ? 0.6 : 1
                            }}
                        >
                            <option value="PRESENT" style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}>Mark Present</option>
                            <option value="ABSENT" style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}>Mark Absent</option>
                            <option value="PAID_LEAVE" style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}>Mark Paid Leave</option>
                            <option value="UNPAID_LEAVE" style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}>Mark Unpaid Leave</option>
                            <option value="WEEKLY_OFF" style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}>Mark Weekly Off</option>
                            <option value="HALF_DAY" style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}>Mark Half Day</option>
                        </select>

                        <Button
                            size="small"
                            variant="primary"
                            onClick={handleBulkApply}
                            disabled={selectedEmployeeIds.length === 0 || bulkLoading}
                            style={{
                                padding: '6px 14px',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                        >
                            {bulkLoading ? <i className="bx bx-loader-alt bx-spin"></i> : <i className="bx bx-check"></i>}
                            Apply
                        </Button>
                    </div>
                </div>
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
                        <i className="bx bx-loader-alt bx-spin" style={{ fontSize: '24px', marginBottom: '8px' }}></i>
                        <div>Loading attendance sheet...</div>
                    </div>
                ) : filteredRecords.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted, #64748b)' }}>
                        No guards found for the selected site or filters.
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                        <thead>
                            <tr style={{
                                background: 'var(--color-surface-hover, rgba(255,255,255,0.03))',
                                borderBottom: '1px solid var(--color-border, #334155)'
                            }}>
                                <th style={{ padding: '12px 14px', width: '36px', textAlign: 'center' }}>
                                    <input
                                        type="checkbox"
                                        checked={allSelected}
                                        onChange={toggleSelectAll}
                                        style={{ cursor: 'pointer' }}
                                    />
                                </th>
                                <th style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--color-text)' }}>Guard / Employee</th>
                                <th style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--color-text)' }}>Site & Post</th>
                                <th style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--color-text)', minWidth: '220px' }}>Mark Attendance</th>
                                <th style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--color-text)' }}>Shift</th>
                                <th style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--color-text)' }}>Daily Rate</th>
                                <th style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--color-text)' }}>Month Muster</th>
                                <th style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--color-text)', textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRecords.map((row, idx) => {
                                const isSelected = selectedEmployeeIds.includes(row.employee_id);
                                const isUpdating = updatingId === row.employee_id;
                                const isPresent = row.effective_status === 'PRESENT';
                                const isAbsent = row.effective_status === 'ABSENT';
                                const isOtherStatus = !isPresent && !isAbsent;

                                return (
                                    <tr
                                        key={row.employee_id}
                                        style={{
                                            borderBottom: idx === filteredRecords.length - 1 ? 'none' : '1px solid var(--color-border, #1e293b)',
                                            background: isSelected 
                                                ? 'rgba(59, 130, 246, 0.05)' 
                                                : (row.is_jump_active ? 'rgba(239, 68, 68, 0.03)' : 'transparent'),
                                            opacity: isUpdating ? 0.5 : 1,
                                            transition: 'background 0.1s ease'
                                        }}
                                    >
                                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => toggleSelectRow(row.employee_id)}
                                                style={{ cursor: 'pointer' }}
                                            />
                                        </td>

                                        {/* Guard Name, Code & Designation */}
                                        <td style={{ padding: '12px 14px' }}>
                                            <div style={{ fontWeight: 600, color: 'var(--color-text, #f8fafc)', fontSize: '13.5px' }}>
                                                {row.employee_name}
                                            </div>
                                            <div style={{ fontSize: '11.5px', color: 'var(--color-text-secondary, #94a3b8)', marginTop: '2px' }}>
                                                {row.employee_code} • {row.designation_name || 'Guard'}
                                            </div>
                                        </td>

                                        {/* Site & Post */}
                                        <td style={{ padding: '12px 14px' }}>
                                            <div style={{ fontWeight: 500, color: 'var(--color-text, #f8fafc)' }}>
                                                {row.site_name || 'General Deployment'}
                                            </div>
                                            <div style={{ fontSize: '11px', color: 'var(--color-text-muted, #64748b)' }}>
                                                {row.post_name || 'General Post'}
                                            </div>
                                        </td>

                                        {/* 1-Click Simple Attendance Buttons (Present / Absent / Other) */}
                                        <td style={{ padding: '12px 14px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                {/* Present Button */}
                                                <button
                                                    type="button"
                                                    onClick={() => handleQuickStatusChange(row.employee_id, 'PRESENT')}
                                                    style={{
                                                        padding: '5px 12px',
                                                        borderRadius: '4px',
                                                        border: isPresent ? '1px solid #10b981' : '1px solid var(--color-border)',
                                                        background: isPresent ? '#10b981' : 'transparent',
                                                        color: isPresent ? '#ffffff' : 'var(--color-text-secondary)',
                                                        fontWeight: 600,
                                                        fontSize: '12px',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.15s ease'
                                                    }}
                                                >
                                                    ✓ Present
                                                </button>

                                                {/* Absent Button */}
                                                <button
                                                    type="button"
                                                    onClick={() => handleQuickStatusChange(row.employee_id, 'ABSENT')}
                                                    style={{
                                                        padding: '5px 12px',
                                                        borderRadius: '4px',
                                                        border: isAbsent ? '1px solid #ef4444' : '1px solid var(--color-border)',
                                                        background: isAbsent ? '#ef4444' : 'transparent',
                                                        color: isAbsent ? '#ffffff' : 'var(--color-text-secondary)',
                                                        fontWeight: 600,
                                                        fontSize: '12px',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.15s ease'
                                                    }}
                                                >
                                                    ✕ Absent
                                                </button>

                                                {/* Other Status Dropdown */}
                                                <select
                                                    value={isOtherStatus ? row.effective_status : ''}
                                                    onChange={e => {
                                                        if (e.target.value) {
                                                            handleQuickStatusChange(row.employee_id, e.target.value as AttendanceStatusCode);
                                                        }
                                                    }}
                                                    style={{
                                                        padding: '5px 8px',
                                                        borderRadius: '4px',
                                                        border: isOtherStatus ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                                                        background: isOtherStatus ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                                                        color: isOtherStatus ? 'var(--color-primary)' : 'var(--color-text-muted)',
                                                        fontSize: '12px',
                                                        fontWeight: isOtherStatus ? 600 : 400,
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    <option value="">
                                                        {isOtherStatus ? row.effective_status.replace('_', ' ') : 'More ▾'}
                                                    </option>
                                                    <option value="PAID_LEAVE">Paid Leave</option>
                                                    <option value="UNPAID_LEAVE">Unpaid Leave</option>
                                                    <option value="WEEKLY_OFF">Weekly Off</option>
                                                    <option value="HALF_DAY">Half Day</option>
                                                    <option value="HOLIDAY">Holiday</option>
                                                </select>
                                            </div>
                                        </td>

                                        {/* Shift */}
                                        <td style={{ padding: '12px 14px', color: 'var(--color-text-secondary)' }}>
                                            {row.shift_name || 'Standard'}
                                        </td>

                                        {/* Daily Rate & Today Pay */}
                                        <td style={{ padding: '12px 14px' }}>
                                            <div style={{ fontWeight: 600, color: 'var(--color-text, #f8fafc)' }}>
                                                PKR {Number(row.daily_salary_rate || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                                <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 400 }}> / day</span>
                                            </div>
                                            <div style={{ fontSize: '11px', marginTop: '2px' }}>
                                                {isPresent ? (
                                                    <span style={{ color: '#10b981', fontWeight: 600 }}>Earned (+)</span>
                                                ) : isAbsent ? (
                                                    <span style={{ color: '#ef4444' }}>Deducted (-)</span>
                                                ) : (
                                                    <span style={{ color: 'var(--color-text-muted)' }}>{row.effective_status}</span>
                                                )}
                                            </div>
                                        </td>

                                        {/* Month Muster Summary */}
                                        <td style={{ padding: '12px 14px' }}>
                                            <div style={{ fontSize: '12.5px' }}>
                                                <span style={{ color: '#10b981', fontWeight: 600 }}>{row.month_present_days || 0}d P</span>
                                                {Number(row.month_absent_days || 0) > 0 && (
                                                    <span style={{ color: '#ef4444', marginLeft: '6px', fontWeight: 600 }}>• {row.month_absent_days}d A</span>
                                                )}
                                            </div>
                                        </td>

                                        {/* Actions */}
                                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                                                {row.is_jump_active && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedEmpForRestore(row);
                                                            setRestoreModalOpen(true);
                                                        }}
                                                        style={{
                                                            padding: '4px 8px',
                                                            borderRadius: '4px',
                                                            border: '1px solid #10b981',
                                                            background: 'rgba(16, 185, 129, 0.1)',
                                                            color: '#10b981',
                                                            fontSize: '11.5px',
                                                            fontWeight: 600,
                                                            cursor: 'pointer'
                                                        }}
                                                        title="Restore from JUMP to Active"
                                                    >
                                                        Restore
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedEmpForLeave({ id: row.employee_id, name: row.employee_name });
                                                        setLeaveModalOpen(true);
                                                    }}
                                                    style={{
                                                        padding: '4px 8px',
                                                        borderRadius: '4px',
                                                        border: '1px solid var(--color-border)',
                                                        background: 'transparent',
                                                        color: 'var(--color-text-secondary)',
                                                        fontSize: '11.5px',
                                                        cursor: 'pointer'
                                                    }}
                                                    title="Apply scheduled leave"
                                                >
                                                    Leave
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedEmpForHistory({ id: row.employee_id, name: row.employee_name, code: row.employee_code });
                                                        setHistoryModalOpen(true);
                                                    }}
                                                    style={{
                                                        padding: '4px 8px',
                                                        borderRadius: '4px',
                                                        border: '1px solid var(--color-border)',
                                                        background: 'transparent',
                                                        color: 'var(--color-text-secondary)',
                                                        fontSize: '11.5px',
                                                        cursor: 'pointer'
                                                    }}
                                                    title="View attendance history"
                                                >
                                                    History
                                                </button>
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
                    setActionSuccess('Leave recorded successfully.');
                    fetchWorkspace();
                }}
            />

            <RestoreJumpModal
                isOpen={restoreModalOpen}
                onClose={() => setRestoreModalOpen(false)}
                record={selectedEmpForRestore}
                onSuccess={() => {
                    setActionSuccess('Employee restored to ACTIVE status.');
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
