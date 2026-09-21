import React, { useState, useEffect } from 'react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { apiClient } from '../api';
import { LoadingState } from '../../../components/ui/LoadingState';

export const AttendanceRegisterView: React.FC = () => {
    const today = new Date();
    const [month, setMonth] = useState<number>(today.getMonth() + 1);
    const [year, setYear] = useState<number>(today.getFullYear());
    const [workforceType, setWorkforceType] = useState<string>('');
    const [searchCode, setSearchCode] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(false);
    const [data, setData] = useState<any | null>(null);
    const [error, setError] = useState<string | null>(null);

    const fetchRegister = async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            params.append('month', String(month));
            params.append('year', String(year));
            if (workforceType) params.append('workforce_type', workforceType);
            if (searchCode) params.append('employee_from', searchCode);

            const res = await apiClient.get(`/api/hrm/workforce-attendance/register/?${params.toString()}`);
            setData(res.data);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to load attendance register');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRegister();
    }, [month, year, workforceType]);

    const handleExport = () => {
        const params = new URLSearchParams();
        params.append('month', String(month));
        params.append('year', String(year));
        if (workforceType) params.append('workforce_type', workforceType);
        window.open(`/api/hrm/workforce-attendance/export-register/?${params.toString()}`, '_blank');
    };

    const handlePrint = () => {
        window.print();
    };

    const getBadgeStyle = (code: string) => {
        switch (code) {
            case 'P':
                return { background: '#10b981', color: '#fff', label: 'P' };
            case 'A':
                return { background: '#ef4444', color: '#fff', label: 'A' };
            case 'L':
                return { background: '#f59e0b', color: '#fff', label: 'L' };
            case 'HD':
                return { background: '#3b82f6', color: '#fff', label: 'HD' };
            case 'WO':
                return { background: 'var(--color-surface-hover, #64748b)', color: '#fff', label: 'WO' };
            case 'JUMP':
                return { background: '#8b5cf6', color: '#fff', label: 'JUMP' };
            default:
                return { background: 'transparent', color: 'var(--color-text-muted)', label: '-' };
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Card>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <i className="bx bx-calendar-check" style={{ color: 'var(--color-primary)' }}></i>
                            Attendance Register — Daily & Monthly Master
                        </h2>
                        <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--color-text-muted)' }}>
                            Persistent workforce attendance tracking with JUMP detection, replacement coverage, and monthly totals.
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <Button variant="secondary" size="sm" onClick={fetchRegister}>
                            <i className="bx bx-refresh"></i> Refresh
                        </Button>
                        <Button variant="secondary" size="sm" onClick={handleExport}>
                            <i className="bx bx-download"></i> Export CSV
                        </Button>
                        <Button variant="primary" size="sm" onClick={handlePrint}>
                            <i className="bx bx-printer"></i> Print Register
                        </Button>
                    </div>
                </div>

                {/* Filter Bar */}
                <div style={{ display: 'flex', gap: '12px', marginTop: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '11.5px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>Month</label>
                        <select
                            value={month}
                            onChange={(e) => setMonth(Number(e.target.value))}
                            style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: '13px' }}
                        >
                            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                                <option key={m} value={m}>
                                    {new Date(2000, m - 1, 1).toLocaleString('default', { month: 'long' })}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '11.5px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>Year</label>
                        <select
                            value={year}
                            onChange={(e) => setYear(Number(e.target.value))}
                            style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: '13px' }}
                        >
                            {[year - 1, year, year + 1].map((y) => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '11.5px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>Workforce Type</label>
                        <select
                            value={workforceType}
                            onChange={(e) => setWorkforceType(e.target.value)}
                            style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: '13px' }}
                        >
                            <option value="">All Workforce</option>
                            <option value="DIRECT">Direct (Guards / Field)</option>
                            <option value="INDIRECT">Indirect (Office Staff)</option>
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '11.5px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>Employee Code</label>
                        <input
                            type="text"
                            placeholder="e.g. 000014"
                            value={searchCode}
                            onChange={(e) => setSearchCode(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && fetchRegister()}
                            style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: '13px', width: '130px' }}
                        />
                    </div>
                </div>
            </Card>

            {/* Attendance Legend & Totals Card */}
            {data?.totals && (
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <Card style={{ flex: 1, minWidth: '280px', padding: '12px 16px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '8px' }}>ATTENDANCE CODES & LEGEND</div>
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', fontSize: '12px' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <strong style={{ background: '#10b981', color: '#fff', padding: '2px 6px', borderRadius: '3px', fontSize: '11px' }}>P</strong> Present
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <strong style={{ background: '#ef4444', color: '#fff', padding: '2px 6px', borderRadius: '3px', fontSize: '11px' }}>A</strong> Absent
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <strong style={{ background: '#f59e0b', color: '#fff', padding: '2px 6px', borderRadius: '3px', fontSize: '11px' }}>L</strong> Leave
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <strong style={{ background: '#3b82f6', color: '#fff', padding: '2px 6px', borderRadius: '3px', fontSize: '11px' }}>HD</strong> Half Day
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <strong style={{ background: '#64748b', color: '#fff', padding: '2px 6px', borderRadius: '3px', fontSize: '11px' }}>WO</strong> Weekly Off
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <strong style={{ background: '#8b5cf6', color: '#fff', padding: '2px 6px', borderRadius: '3px', fontSize: '11px' }}>JUMP</strong> Consecutive Absence
                            </span>
                        </div>
                    </Card>

                    <Card style={{ flex: 1.5, minWidth: '340px', padding: '12px 16px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '8px' }}>REGISTER TOTALS SUMMARY</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', fontSize: '12.5px' }}>
                            <div>Employees: <strong>{data.totals.total_employees}</strong></div>
                            <div>Present: <strong style={{ color: '#10b981' }}>{data.totals.present_days}</strong></div>
                            <div>Absent: <strong style={{ color: '#ef4444' }}>{data.totals.absent_days}</strong></div>
                            <div>Leave: <strong style={{ color: '#f59e0b' }}>{data.totals.leave_days}</strong></div>
                            <div>Half Days: <strong style={{ color: '#3b82f6' }}>{data.totals.half_days}</strong></div>
                            <div>Weekly Off: <strong>{data.totals.off_days}</strong></div>
                            <div>JUMP Days: <strong style={{ color: '#8b5cf6' }}>{data.totals.jump_days}</strong></div>
                            <div>Replacements: <strong>{data.totals.replacement_count}</strong></div>
                        </div>
                    </Card>
                </div>
            )}

            {loading ? (
                <LoadingState message="Resolving workforce attendance register..." />
            ) : error ? (
                <div style={{ color: 'var(--color-danger)', padding: '16px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '6px' }}>{error}</div>
            ) : (
                <Card style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto', maxHeight: '650px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'center' }}>
                            <thead>
                                <tr style={{ background: 'var(--color-surface-hover, #f1f5f9)', borderBottom: '1px solid var(--color-border)', position: 'sticky', top: 0, zIndex: 2 }}>
                                    <th style={{ padding: '10px 8px', textAlign: 'left', minWidth: '100px', position: 'sticky', left: 0, background: 'inherit' }}>Code</th>
                                    <th style={{ padding: '10px 8px', textAlign: 'left', minWidth: '160px', position: 'sticky', left: '100px', background: 'inherit' }}>Employee Name</th>
                                    <th style={{ padding: '10px 8px', textAlign: 'left', minWidth: '110px' }}>Designation</th>
                                    {data?.dates?.map((d: string) => (
                                        <th key={d} style={{ padding: '6px 3px', minWidth: '28px', borderLeft: '1px solid var(--color-border)' }}>
                                            <div>{d.slice(8)}</div>
                                            <div style={{ fontSize: '9px', color: 'var(--color-text-muted)' }}>
                                                {new Date(d).toLocaleDateString('default', { weekday: 'narrow' })}
                                            </div>
                                        </th>
                                    ))}
                                    <th style={{ padding: '8px', minWidth: '45px', borderLeft: '2px solid var(--color-border)', color: '#10b981' }}>P</th>
                                    <th style={{ padding: '8px', minWidth: '45px', color: '#ef4444' }}>A</th>
                                    <th style={{ padding: '8px', minWidth: '45px', color: '#f59e0b' }}>L</th>
                                    <th style={{ padding: '8px', minWidth: '45px', color: '#3b82f6' }}>HD</th>
                                    <th style={{ padding: '8px', minWidth: '45px' }}>WO</th>
                                    <th style={{ padding: '8px', minWidth: '55px', color: '#8b5cf6' }}>JUMP</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data?.rows?.map((r: any) => (
                                    <tr key={r.employee_id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                        <td style={{ padding: '8px', textAlign: 'left', fontWeight: 600, color: 'var(--color-primary)', position: 'sticky', left: 0, background: 'var(--color-surface)' }}>
                                            {r.previous_employee_code || r.employee_code}
                                        </td>
                                        <td style={{ padding: '8px', textAlign: 'left', position: 'sticky', left: '100px', background: 'var(--color-surface)' }}>
                                            <div style={{ fontWeight: 500 }}>{r.full_name}</div>
                                            <div style={{ fontSize: '10.5px', color: 'var(--color-text-muted)' }}>{r.father_name || r.workforce_type}</div>
                                        </td>
                                        <td style={{ padding: '8px', textAlign: 'left', color: 'var(--color-text-muted)' }}>
                                            {r.designation || '—'}
                                        </td>
                                        {r.daily?.map((day: any) => {
                                            const badge = getBadgeStyle(day.code);
                                            return (
                                                <td key={day.date} style={{ padding: '2px', borderLeft: '1px solid var(--color-border)' }} title={`${day.date}: ${day.status}${day.is_replacement ? ' (Replacement)' : ''}`}>
                                                    <span style={{
                                                        display: 'inline-block',
                                                        width: '24px',
                                                        height: '24px',
                                                        lineHeight: '24px',
                                                        borderRadius: '3px',
                                                        fontSize: '11px',
                                                        fontWeight: 600,
                                                        background: badge.background,
                                                        color: badge.color
                                                    }}>
                                                        {badge.label}
                                                    </span>
                                                </td>
                                            );
                                        })}
                                        <td style={{ padding: '8px', fontWeight: 600, color: '#10b981', borderLeft: '2px solid var(--color-border)' }}>
                                            {r.counts.present}
                                        </td>
                                        <td style={{ padding: '8px', fontWeight: 600, color: '#ef4444' }}>
                                            {r.counts.absent}
                                        </td>
                                        <td style={{ padding: '8px', fontWeight: 600, color: '#f59e0b' }}>
                                            {r.counts.leave}
                                        </td>
                                        <td style={{ padding: '8px', fontWeight: 600, color: '#3b82f6' }}>
                                            {r.counts.half_day}
                                        </td>
                                        <td style={{ padding: '8px', fontWeight: 500 }}>
                                            {r.counts.weekly_off}
                                        </td>
                                        <td style={{ padding: '8px', fontWeight: 600, color: '#8b5cf6' }}>
                                            {r.counts.jump}
                                        </td>
                                    </tr>
                                ))}
                                {(!data?.rows || data.rows.length === 0) && (
                                    <tr>
                                        <td colSpan={10 + (data?.dates?.length || 0)} style={{ padding: '32px', color: 'var(--color-text-muted)' }}>
                                            No attendance records found for this criteria.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}
        </div>
    );
};
