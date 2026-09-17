import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import {
    getDailyPayReviewWorkspace,
    recalculateDailyDutyPay,
    getOperationalSites
} from '../api';
import type {
    DailyDutyPayItem,
    DailyPayReviewWorkspace,
    OperationalSite
} from '../types';
import { BulkGenerateDailyPayModal } from './BulkGenerateDailyPayModal';

export const DailyPayReviewView: React.FC = () => {
    const today = new Date().toISOString().split('T')[0];
    const [selectedDate, setSelectedDate] = useState<string>(today);
    const [dateMode, setDateMode] = useState<'SINGLE' | 'RANGE'>('SINGLE');
    const [startDate, setStartDate] = useState<string>(today);
    const [endDate, setEndDate] = useState<string>(today);

    const [classificationFilter, setClassificationFilter] = useState<'ALL' | 'DIRECT' | 'INDIRECT'>('ALL');
    const [siteFilter, setSiteFilter] = useState<string>('');
    const [unresolvedOnly, setUnresolvedOnly] = useState<boolean>(false);
    const [replacementOnly, setReplacementOnly] = useState<boolean>(false);
    const [searchQuery, setSearchQuery] = useState<string>('');

    const [workspace, setWorkspace] = useState<DailyPayReviewWorkspace | null>(null);
    const [sites, setSites] = useState<OperationalSite[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [recalculatingId, setRecalculatingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Modal state
    const [bulkModalOpen, setBulkModalOpen] = useState<boolean>(false);

    // Load available sites
    useEffect(() => {
        getOperationalSites({ is_active: true, page: 1 })
            .then(res => setSites(res.results || []))
            .catch(() => setSites([]));
    }, []);

    // Load workspace data
    const fetchWorkspace = async () => {
        setLoading(true);
        setError(null);
        try {
            const params: any = {
                classification: classificationFilter === 'ALL' ? undefined : classificationFilter,
                site_id: siteFilter || undefined,
                unresolved_only: unresolvedOnly || undefined,
                replacement_only: replacementOnly || undefined,
                search: searchQuery || undefined
            };

            if (dateMode === 'SINGLE') {
                params.duty_date = selectedDate;
            } else {
                params.start_date = startDate;
                params.end_date = endDate;
            }

            const data = await getDailyPayReviewWorkspace(params);
            setWorkspace(data);
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Failed to load daily pay data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchWorkspace();
    }, [selectedDate, dateMode, startDate, endDate, classificationFilter, siteFilter, unresolvedOnly, replacementOnly]);

    // Handle single day date increment/decrement
    const changeDateBy = (days: number) => {
        const d = new Date(selectedDate);
        d.setDate(d.getDate() + days);
        setSelectedDate(d.toISOString().split('T')[0]);
    };

    // Recalculate single record
    const handleRecalculate = async (id: string) => {
        setRecalculatingId(id);
        setError(null);
        setSuccessMessage(null);
        try {
            const updated = await recalculateDailyDutyPay({ daily_duty_pay_id: id });
            setSuccessMessage(`Recalculated pay for ${updated.employee_name} (${updated.duty_date}): ₨ ${updated.payable_amount}`);
            await fetchWorkspace();
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Recalculation failed');
        } finally {
            setRecalculatingId(null);
        }
    };

    const records = workspace?.records || [];
    const totals = workspace?.totals || {
        total_records: 0,
        total_payable_amount: 0,
        replacement_count: 0,
        unresolved_count: 0,
        missing_rate_count: 0,
        frozen_count: 0
    };

    // Client-side search filtering
    const filteredRecords = useMemo(() => {
        if (!searchQuery.trim()) return records;
        const q = searchQuery.toLowerCase();
        return records.filter((r: DailyDutyPayItem) =>
            r.employee_name.toLowerCase().includes(q) ||
            r.employee_code.toLowerCase().includes(q) ||
            (r.site_name && r.site_name.toLowerCase().includes(q)) ||
            (r.post_name && r.post_name.toLowerCase().includes(q)) ||
            (r.contract_code && r.contract_code.toLowerCase().includes(q)) ||
            (r.replaced_employee_name && r.replaced_employee_name.toLowerCase().includes(q))
        );
    }, [records, searchQuery]);

    // Format currency
    const formatCurrency = (val: string | number) => {
        const num = typeof val === 'string' ? parseFloat(val) : val;
        if (isNaN(num)) return '₨ 0.00';
        return `₨ ${num.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    // Helper: attendance status pill
    const renderAttendanceBadge = (status: string) => {
        const colors: Record<string, { bg: string; color: string; border: string }> = {
            PRESENT: { bg: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '#10b981' },
            ABSENT: { bg: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '#ef4444' },
            HALF_DAY: { bg: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: '#f59e0b' },
            PAID_LEAVE: { bg: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '#3b82f6' },
            UNPAID_LEAVE: { bg: 'rgba(107, 114, 128, 0.15)', color: '#9ca3af', border: '#6b7280' },
            HOLIDAY: { bg: 'rgba(139, 92, 246, 0.15)', color: '#a78bfa', border: '#8b5cf6' },
            WEEKLY_OFF: { bg: 'rgba(20, 184, 166, 0.15)', color: '#2dd4bf', border: '#14b8a6' }
        };
        const st = colors[status] || { bg: 'rgba(148, 163, 184, 0.1)', color: '#94a3b8', border: '#475569' };
        return (
            <span style={{
                padding: '3px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 600,
                background: st.bg,
                color: st.color,
                border: `1px solid ${st.border}`,
                display: 'inline-block'
            }}>
                {status}
            </span>
        );
    };

    // Helper: calculation status pill
    const renderCalculationStatus = (status: string, isFrozen: boolean) => {
        if (isFrozen) {
            return (
                <span style={{
                    padding: '3px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    background: 'rgba(99, 102, 241, 0.15)',
                    color: '#818cf8',
                    border: '1px solid #6366f1',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                }}>
                    🔒 FINALIZED
                </span>
            );
        }
        if (status === 'UNRESOLVED') {
            return (
                <span style={{
                    padding: '3px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    background: 'rgba(239, 68, 68, 0.2)',
                    color: '#f87171',
                    border: '1px solid #ef4444',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                }}>
                    ⚠️ UNRESOLVED
                </span>
            );
        }
        if (status === 'RECALCULATED') {
            return (
                <span style={{
                    padding: '3px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    background: 'rgba(59, 130, 246, 0.15)',
                    color: '#60a5fa',
                    border: '1px solid #3b82f6'
                }}>
                    ↻ RECALCULATED
                </span>
            );
        }
        return (
            <span style={{
                padding: '3px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 600,
                background: 'rgba(16, 185, 129, 0.15)',
                color: '#34d399',
                border: '1px solid #10b981'
            }}>
                ✓ CALCULATED
            </span>
        );
    };

    return (
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Top Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: 'var(--color-text, #f8fafc)' }}>
                        Daily Duty Rate & Temporary Assignment Pay
                    </h1>
                    <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: 'var(--color-text-secondary, #94a3b8)' }}>
                        Authoritative daily payable-duty engine, temporary replacement earnings & cross-contract cost attribution
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <Button
                        variant="primary"
                        onClick={() => setBulkModalOpen(true)}
                    >
                        ⚡ Bulk Generate Pay Inputs
                    </Button>
                    <Button variant="secondary" onClick={fetchWorkspace} disabled={loading}>
                        ↻ Refresh
                    </Button>
                </div>
            </div>

            {/* Notification messages */}
            {error && (
                <div style={{
                    padding: '12px 16px',
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid #ef4444',
                    borderRadius: '8px',
                    color: '#fca5a5',
                    fontSize: '13px'
                }}>
                    ⚠️ {error}
                </div>
            )}
            {successMessage && (
                <div style={{
                    padding: '12px 16px',
                    background: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid #10b981',
                    borderRadius: '8px',
                    color: '#6ee7b7',
                    fontSize: '13px'
                }}>
                    ✓ {successMessage}
                </div>
            )}

            {/* KPI Summary Cards */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '12px'
            }}>
                <div style={{
                    background: 'var(--color-surface, #1e293b)',
                    padding: '14px 18px',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border, #334155)'
                }}>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-secondary, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Total Daily Duties
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-text, #f8fafc)', marginTop: '4px' }}>
                        {totals.total_records}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary, #94a3b8)', marginTop: '2px' }}>
                        Daily duty records evaluated
                    </div>
                </div>

                <div style={{
                    background: 'var(--color-surface, #1e293b)',
                    padding: '14px 18px',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border, #334155)'
                }}>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-secondary, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Total Payable Amount
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: '#34d399', marginTop: '4px' }}>
                        {formatCurrency(totals.total_payable_amount)}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary, #94a3b8)', marginTop: '2px' }}>
                        Gross daily payable payroll input
                    </div>
                </div>

                <div style={{
                    background: totals.replacement_count > 0 ? 'rgba(168, 85, 247, 0.08)' : 'var(--color-surface, #1e293b)',
                    padding: '14px 18px',
                    borderRadius: '8px',
                    border: totals.replacement_count > 0 ? '1px solid rgba(168, 85, 247, 0.4)' : '1px solid var(--color-border, #334155)'
                }}>
                    <div style={{ fontSize: '12px', color: totals.replacement_count > 0 ? '#c084fc' : 'var(--color-text-secondary, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Replacement Duty Days
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: totals.replacement_count > 0 ? '#c084fc' : 'var(--color-text, #f8fafc)', marginTop: '4px' }}>
                        {totals.replacement_count}
                    </div>
                    <div style={{ fontSize: '11px', color: totals.replacement_count > 0 ? '#e9d5ff' : 'var(--color-text-secondary, #94a3b8)', marginTop: '2px' }}>
                        Earn covered-duty rate & cost attribution
                    </div>
                </div>

                <div style={{
                    background: totals.unresolved_count > 0 ? 'rgba(239, 68, 68, 0.1)' : 'var(--color-surface, #1e293b)',
                    padding: '14px 18px',
                    borderRadius: '8px',
                    border: totals.unresolved_count > 0 ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--color-border, #334155)'
                }}>
                    <div style={{ fontSize: '12px', color: totals.unresolved_count > 0 ? '#f87171' : 'var(--color-text-secondary, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Unresolved Calculations
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: totals.unresolved_count > 0 ? '#f87171' : 'var(--color-text, #f8fafc)', marginTop: '4px' }}>
                        {totals.unresolved_count}
                    </div>
                    <div style={{ fontSize: '11px', color: totals.unresolved_count > 0 ? '#fca5a5' : 'var(--color-text-secondary, #94a3b8)', marginTop: '2px' }}>
                        Missing rate or salary setup
                    </div>
                </div>
            </div>

            {/* Filter & Control Bar */}
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', background: 'rgba(0,0,0,0.25)', borderRadius: '6px', padding: '2px' }}>
                        <button
                            type="button"
                            onClick={() => setDateMode('SINGLE')}
                            style={{
                                padding: '4px 10px',
                                fontSize: '12px',
                                fontWeight: 600,
                                borderRadius: '4px',
                                border: 'none',
                                cursor: 'pointer',
                                background: dateMode === 'SINGLE' ? 'var(--color-primary, #2563eb)' : 'transparent',
                                color: dateMode === 'SINGLE' ? '#fff' : 'var(--color-text-secondary, #94a3b8)'
                            }}
                        >
                            Single Day
                        </button>
                        <button
                            type="button"
                            onClick={() => setDateMode('RANGE')}
                            style={{
                                padding: '4px 10px',
                                fontSize: '12px',
                                fontWeight: 600,
                                borderRadius: '4px',
                                border: 'none',
                                cursor: 'pointer',
                                background: dateMode === 'RANGE' ? 'var(--color-primary, #2563eb)' : 'transparent',
                                color: dateMode === 'RANGE' ? '#fff' : 'var(--color-text-secondary, #94a3b8)'
                            }}
                        >
                            Date Range
                        </button>
                    </div>

                    {dateMode === 'SINGLE' ? (
                        <>
                            <Button variant="secondary" size="small" onClick={() => changeDateBy(-1)}>
                                ‹ Prev
                            </Button>
                            <Input
                                type="date"
                                value={selectedDate}
                                onChange={e => setSelectedDate(e.target.value)}
                                style={{ width: '150px', fontWeight: 600 }}
                            />
                            <Button variant="secondary" size="small" onClick={() => changeDateBy(1)}>
                                Next ›
                            </Button>
                            <Button
                                variant="ghost"
                                size="small"
                                onClick={() => setSelectedDate(today)}
                            >
                                Today
                            </Button>
                        </>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Input
                                type="date"
                                value={startDate}
                                onChange={e => setStartDate(e.target.value)}
                                style={{ width: '140px' }}
                            />
                            <span style={{ color: 'var(--color-text-secondary, #94a3b8)', fontSize: '13px' }}>to</span>
                            <Input
                                type="date"
                                value={endDate}
                                onChange={e => setEndDate(e.target.value)}
                                style={{ width: '140px' }}
                            />
                        </div>
                    )}
                </div>

                {/* Classification Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-secondary, #94a3b8)' }}>Class:</span>
                    {(['ALL', 'DIRECT', 'INDIRECT'] as const).map(c => (
                        <button
                            key={c}
                            onClick={() => setClassificationFilter(c)}
                            style={{
                                padding: '4px 10px',
                                borderRadius: '4px',
                                border: classificationFilter === c ? '1px solid var(--color-primary, #2563eb)' : '1px solid var(--color-border, #334155)',
                                background: classificationFilter === c ? 'rgba(37, 99, 235, 0.2)' : 'transparent',
                                color: classificationFilter === c ? '#60a5fa' : 'var(--color-text-secondary, #94a3b8)',
                                fontSize: '12px',
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                        >
                            {c}
                        </button>
                    ))}
                </div>

                {/* Site Dropdown */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <select
                        value={siteFilter}
                        onChange={e => setSiteFilter(e.target.value)}
                        style={{
                            padding: '6px 12px',
                            background: 'var(--color-surface-secondary, #0f172a)',
                            border: '1px solid var(--color-border, #334155)',
                            borderRadius: '6px',
                            color: 'var(--color-text, #f8fafc)',
                            fontSize: '13px',
                            cursor: 'pointer'
                        }}
                    >
                        <option value="">All Operational Sites</option>
                        {sites.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                </div>

                {/* Toggle Highlights / Filters */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#c084fc', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={replacementOnly}
                            onChange={e => setReplacementOnly(e.target.checked)}
                        />
                        Replacement Only
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#f87171', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={unresolvedOnly}
                            onChange={e => setUnresolvedOnly(e.target.checked)}
                        />
                        Unresolved Only
                    </label>
                </div>

                {/* Search Box */}
                <div style={{ minWidth: '220px' }}>
                    <Input
                        type="text"
                        placeholder="Search employee, site, contract..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        style={{ fontSize: '13px' }}
                    />
                </div>
            </div>

            {/* Table Container */}
            <div style={{
                background: 'var(--color-surface, #1e293b)',
                borderRadius: '8px',
                border: '1px solid var(--color-border, #334155)',
                overflowX: 'auto'
            }}>
                <table style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    textAlign: 'left',
                    fontSize: '13px',
                    color: 'var(--color-text, #f8fafc)'
                }}>
                    <thead>
                        <tr style={{
                            background: 'rgba(0,0,0,0.2)',
                            borderBottom: '1px solid var(--color-border, #334155)',
                            fontSize: '12px',
                            color: 'var(--color-text-secondary, #94a3b8)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                        }}>
                            <th style={{ padding: '12px 16px' }}>Employee</th>
                            <th style={{ padding: '12px 14px' }}>Duty Date</th>
                            <th style={{ padding: '12px 14px' }}>Attendance</th>
                            <th style={{ padding: '12px 16px' }}>Normal Assignment</th>
                            <th style={{ padding: '12px 16px' }}>Actual Duty</th>
                            <th style={{ padding: '12px 14px' }}>Rate & Source</th>
                            <th style={{ padding: '12px 10px', textAlign: 'center' }}>Pay %</th>
                            <th style={{ padding: '12px 14px', textAlign: 'right' }}>Payable Amount</th>
                            <th style={{ padding: '12px 16px' }}>Cost Attribution</th>
                            <th style={{ padding: '12px 12px', textAlign: 'center' }}>Status</th>
                            <th style={{ padding: '12px 12px', textAlign: 'center' }}>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr>
                                <td colSpan={11} style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-secondary, #94a3b8)' }}>
                                    Calculating and loading daily duty pay inputs...
                                </td>
                            </tr>
                        )}

                        {!loading && filteredRecords.length === 0 && (
                            <tr>
                                <td colSpan={11} style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-secondary, #94a3b8)' }}>
                                    No daily duty pay records found for the selected date and filters.
                                    <div style={{ marginTop: '12px' }}>
                                        <Button variant="primary" size="small" onClick={() => setBulkModalOpen(true)}>
                                            ⚡ Bulk Generate Pay Inputs Now
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        )}

                        {!loading && filteredRecords.map((item: DailyDutyPayItem) => {
                            const isReplacement = item.is_replacement_duty;
                            const isUnresolved = item.calculation_status === 'UNRESOLVED' || item.daily_payable_rate <= 0;
                            const rowBg = isUnresolved
                                ? 'rgba(239, 68, 68, 0.06)'
                                : isReplacement
                                    ? 'rgba(168, 85, 247, 0.06)'
                                    : 'transparent';

                            return (
                                <tr
                                    key={item.id}
                                    style={{
                                        borderBottom: '1px solid var(--color-border, #334155)',
                                        background: rowBg,
                                        transition: 'background 0.15s ease'
                                    }}
                                >
                                    {/* Employee */}
                                    <td style={{ padding: '12px 16px' }}>
                                        <div style={{ fontWeight: 600, color: 'var(--color-text, #f8fafc)' }}>
                                            {item.employee_name}
                                        </div>
                                        <div style={{ fontSize: '11px', color: 'var(--color-text-secondary, #94a3b8)', marginTop: '2px' }}>
                                            {item.employee_code} • <span style={{
                                                fontWeight: 600,
                                                color: item.classification === 'DIRECT' ? '#38bdf8' : '#e879f9'
                                            }}>{item.classification}</span>
                                            {item.designation_name ? ` • ${item.designation_name}` : ''}
                                        </div>
                                    </td>

                                    {/* Duty Date */}
                                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', fontWeight: 500 }}>
                                        {item.duty_date}
                                    </td>

                                    {/* Attendance */}
                                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                                        {renderAttendanceBadge(item.attendance_status)}
                                    </td>

                                    {/* Normal Assignment */}
                                    <td style={{ padding: '12px 16px', fontSize: '12px' }}>
                                        <div style={{ color: 'var(--color-text, #f8fafc)' }}>
                                            {item.normal_assignment || 'Unassigned'}
                                        </div>
                                        <div style={{ fontSize: '11px', color: 'var(--color-text-secondary, #94a3b8)', marginTop: '2px' }}>
                                            Home Deployment
                                        </div>
                                    </td>

                                    {/* Actual Duty */}
                                    <td style={{ padding: '12px 16px', fontSize: '12px' }}>
                                        {isReplacement ? (
                                            <div style={{
                                                display: 'inline-block',
                                                padding: '4px 8px',
                                                background: 'rgba(168, 85, 247, 0.15)',
                                                border: '1px solid #a855f7',
                                                borderRadius: '6px'
                                            }}>
                                                <div style={{ fontWeight: 600, color: '#c084fc' }}>
                                                    Covered: {item.actual_duty}
                                                </div>
                                                <div style={{ fontSize: '11px', color: '#e9d5ff', marginTop: '1px' }}>
                                                    Replaced: {item.replaced_employee_name || 'Colleague'}
                                                </div>
                                            </div>
                                        ) : (
                                            <div>
                                                <div style={{ color: 'var(--color-text, #f8fafc)' }}>
                                                    {item.actual_duty}
                                                </div>
                                                <div style={{ fontSize: '11px', color: 'var(--color-text-secondary, #94a3b8)', marginTop: '2px' }}>
                                                    {item.shift_name} Shift
                                                </div>
                                            </div>
                                        )}
                                    </td>

                                    {/* Rate & Source */}
                                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                                        <div style={{ fontWeight: 600, color: isUnresolved ? '#f87171' : 'var(--color-text, #f8fafc)' }}>
                                            ₨ {item.daily_payable_rate.toFixed(2)}
                                        </div>
                                        <div style={{ fontSize: '10px', color: 'var(--color-text-secondary, #94a3b8)', marginTop: '2px', textTransform: 'uppercase' }}>
                                            {item.rate_source_label || item.rate_source.replace(/_/g, ' ')}
                                        </div>
                                    </td>

                                    {/* Pay % */}
                                    <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 600 }}>
                                        <span style={{
                                            color: item.payable_percentage === 100
                                                ? '#34d399'
                                                : item.payable_percentage === 50
                                                    ? '#fbbf24'
                                                    : '#94a3b8'
                                        }}>
                                            {item.payable_percentage.toFixed(0)}%
                                        </span>
                                    </td>

                                    {/* Payable Amount */}
                                    <td style={{ padding: '12px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                        <div style={{
                                            fontWeight: 700,
                                            fontSize: '14px',
                                            color: item.payable_amount > 0 ? '#34d399' : 'var(--color-text-secondary, #94a3b8)'
                                        }}>
                                            {formatCurrency(item.payable_amount)}
                                        </div>
                                    </td>

                                    {/* Cost Attribution Dimensions */}
                                    <td style={{ padding: '12px 16px', fontSize: '12px' }}>
                                        <div style={{
                                            fontWeight: isReplacement ? 600 : 400,
                                            color: isReplacement ? '#c084fc' : 'var(--color-text, #f8fafc)'
                                        }}>
                                            {item.site_name || 'No Site'}
                                        </div>
                                        <div style={{ fontSize: '11px', color: 'var(--color-text-secondary, #94a3b8)', marginTop: '2px' }}>
                                            {item.contract_code ? `Contract: ${item.contract_code}` : ''}
                                            {item.client_name ? ` • ${item.client_name}` : ''}
                                        </div>
                                    </td>

                                    {/* Status */}
                                    <td style={{ padding: '12px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                        {renderCalculationStatus(item.calculation_status, item.is_frozen)}
                                        {item.unresolved_reason && (
                                            <div style={{ fontSize: '10px', color: '#fca5a5', marginTop: '3px', maxWidth: '140px', lineHeight: '1.2' }}>
                                                {item.unresolved_reason}
                                            </div>
                                        )}
                                    </td>

                                    {/* Action */}
                                    <td style={{ padding: '12px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                        <Button
                                            variant="ghost"
                                            size="small"
                                            disabled={item.is_frozen || recalculatingId === item.id}
                                            onClick={() => handleRecalculate(item.id)}
                                            title={item.is_frozen ? 'Locked by finalized payroll' : 'Recalculate rate and payable amount'}
                                        >
                                            {recalculatingId === item.id ? '...' : '↻ Recalc'}
                                        </Button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Bulk Generate Modal */}
            <BulkGenerateDailyPayModal
                isOpen={bulkModalOpen}
                onClose={() => setBulkModalOpen(false)}
                onSuccess={() => {
                    setBulkModalOpen(false);
                    fetchWorkspace();
                }}
                initialStartDate={dateMode === 'RANGE' ? startDate : selectedDate}
                initialEndDate={dateMode === 'RANGE' ? endDate : selectedDate}
            />
        </div>
    );
};
