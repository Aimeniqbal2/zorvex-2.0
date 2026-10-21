import React, { useState, useEffect, useCallback } from 'react';
import { mobileHrmApi } from './mobileHrmApi';
import type { AttendanceGridResponse, AttendanceGridRow } from './types';

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const CODE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    P: { bg: '#dcfce7', text: '#15803d', border: '#86efac' },   // Present
    L: { bg: '#fef3c7', text: '#b45309', border: '#fcd34d' },   // Late
    D: { bg: '#ffedd5', text: '#c2410c', border: '#fdba74' },   // Half Day
    H: { bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5' },   // Holiday / Absent
    O: { bg: '#f3e8ff', text: '#7e22ce', border: '#d8b4fe' },   // Overtime
    DA: { bg: '#e0f2fe', text: '#0369a1', border: '#7dd3fc' },  // Allowed Half Day
    HA: { bg: '#ccfbf1', text: '#0f766e', border: '#5eead4' },  // Holiday Allowed
};

export const MobileAttendanceGridTab: React.FC = () => {
    const [year, setYear] = useState<number>(2026);
    const [month, setMonth] = useState<number>(9); // September 2026 default (Softech sample)
    const [department, setDepartment] = useState<string>('');
    const [gridData, setGridData] = useState<AttendanceGridResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);

    // Local mutable copy of rows for ultra-responsive editing
    const [rows, setRows] = useState<AttendanceGridRow[]>([]);

    const loadGrid = useCallback(async () => {
        try {
            setLoading(true);
            const data = await mobileHrmApi.getAttendanceGrid(year, month, department || undefined);
            setGridData(data);
            setRows(data.rows);
            setHasUnsavedChanges(false);
        } catch (err) {
            console.error('Failed to load attendance grid:', err);
        } finally {
            setLoading(false);
        }
    }, [year, month, department]);

    useEffect(() => {
        loadGrid();
    }, [loadGrid]);

    // Recalculates row summary totals on the fly
    const calculateTotals = (days: Record<string, string>) => {
        let present = 0;
        let late = 0;
        let half_day = 0;
        let holiday = 0;
        let overtime = 0;
        let allowed_half_day = 0;
        let allowed_holiday = 0;

        for (const code of Object.values(days)) {
            const clean = (code || '').trim().toUpperCase();
            if (clean === 'P') present++;
            else if (clean === 'L') late++;
            else if (clean === 'D') half_day++;
            else if (clean === 'H') holiday++;
            else if (clean === 'O') overtime++;
            else if (clean === 'DA') allowed_half_day++;
            else if (clean === 'HA') allowed_holiday++;
        }

        return {
            present,
            late,
            half_day,
            holiday,
            overtime,
            allowed_half_day,
            allowed_holiday
        };
    };

    const cycleCode = (current: string): string => {
        const order = ['P', 'L', 'D', 'H', 'HA', 'DA', 'O', ''];
        const clean = (current || '').trim().toUpperCase();
        const idx = order.indexOf(clean);
        return idx >= 0 && idx < order.length - 1 ? order[idx + 1] : order[0];
    };

    const handleCellClick = (employeeId: string, day: number) => {
        setRows(prevRows => {
            return prevRows.map(row => {
                if (row.employee_id !== employeeId) return row;
                const curCode = row.days[String(day)] || '';
                const nextCode = cycleCode(curCode);
                const updatedDays = { ...row.days, [String(day)]: nextCode };
                const newTotals = calculateTotals(updatedDays);
                return {
                    ...row,
                    days: updatedDays,
                    totals: newTotals
                };
            });
        });
        setHasUnsavedChanges(true);
        setSaveSuccess(false);
    };

    const handleCellKeyDown = (e: React.KeyboardEvent, employeeId: string, day: number) => {
        const key = e.key.toUpperCase();
        const validCodes = ['P', 'L', 'D', 'H', 'O'];
        let newCode: string | null = null;

        if (validCodes.includes(key)) {
            newCode = key;
        } else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === ' ') {
            newCode = '';
        }

        if (newCode !== null) {
            e.preventDefault();
            setRows(prevRows => {
                return prevRows.map(row => {
                    if (row.employee_id !== employeeId) return row;
                    const updatedDays = { ...row.days, [String(day)]: newCode! };
                    const newTotals = calculateTotals(updatedDays);
                    return {
                        ...row,
                        days: updatedDays,
                        totals: newTotals
                    };
                });
            });
            setHasUnsavedChanges(true);
            setSaveSuccess(false);
        }
    };

    const handleSaveChanges = async () => {
        try {
            setSaving(true);
            const updates = rows.map(r => ({
                employee_id: r.employee_id,
                days: r.days
            }));
            await mobileHrmApi.batchSaveAttendance(year, month, updates);
            setHasUnsavedChanges(false);
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);
        } catch (err) {
            alert('Failed to save attendance updates.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '24px' }}>
            {/* Top Control Bar */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '16px',
                background: 'var(--color-surface, #ffffff)',
                padding: '16px 20px',
                borderRadius: '12px',
                border: '1px solid var(--color-border, #e2e8f0)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    {/* Month Picker */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>Month:</span>
                        <select
                            value={month}
                            onChange={e => setMonth(Number(e.target.value))}
                            style={{
                                padding: '6px 12px',
                                borderRadius: '8px',
                                border: '1px solid var(--color-border, #cbd5e1)',
                                fontSize: '14px',
                                fontWeight: 500,
                                background: '#f8fafc',
                                outline: 'none'
                            }}
                        >
                            {MONTH_NAMES.map((name, i) => (
                                <option key={i + 1} value={i + 1}>{name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Year Picker */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>Year:</span>
                        <select
                            value={year}
                            onChange={e => setYear(Number(e.target.value))}
                            style={{
                                padding: '6px 12px',
                                borderRadius: '8px',
                                border: '1px solid var(--color-border, #cbd5e1)',
                                fontSize: '14px',
                                fontWeight: 500,
                                background: '#f8fafc',
                                outline: 'none'
                            }}
                        >
                            {[2024, 2025, 2026, 2027].map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>

                    {/* Department Filter */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>Dept:</span>
                        <select
                            value={department}
                            onChange={e => setDepartment(e.target.value)}
                            style={{
                                padding: '6px 12px',
                                borderRadius: '8px',
                                border: '1px solid var(--color-border, #cbd5e1)',
                                fontSize: '14px',
                                fontWeight: 500,
                                background: '#f8fafc',
                                outline: 'none'
                            }}
                        >
                            <option value="">All Departments</option>
                            <option value="HARDWARE">Hardware Lab</option>
                            <option value="SOFTWARE">Software Lab</option>
                            <option value="PANEL_GLASS">Panel / Glass</option>
                            <option value="SALES">Sales / W.O</option>
                            <option value="MANAGEMENT">Management</option>
                        </select>
                    </div>
                </div>

                {/* Save Button & Indicators */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {saveSuccess && (
                        <span style={{ color: '#16a34a', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <i className="bx bx-check-circle" /> Changes Saved!
                        </span>
                    )}

                    {hasUnsavedChanges && (
                        <span style={{ color: '#d97706', fontSize: '12px', fontWeight: 600, background: '#fef3c7', padding: '4px 10px', borderRadius: '12px' }}>
                            Unsaved Changes
                        </span>
                    )}

                    <button
                        type="button"
                        onClick={handleSaveChanges}
                        disabled={saving || !hasUnsavedChanges}
                        style={{
                            padding: '8px 20px',
                            background: hasUnsavedChanges ? 'var(--color-primary, #2563eb)' : '#94a3b8',
                            color: '#ffffff',
                            borderRadius: '8px',
                            border: 'none',
                            fontWeight: 600,
                            fontSize: '13px',
                            cursor: hasUnsavedChanges ? 'pointer' : 'default',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <i className={`bx ${saving ? 'bx-loader-alt bx-spin' : 'bx-save'}`} />
                        {saving ? 'Saving...' : 'Save Attendance Sheet'}
                    </button>
                </div>
            </div>

            {/* Softech Attendance Legend Bar */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                flexWrap: 'wrap',
                background: 'var(--color-surface, #ffffff)',
                padding: '12px 16px',
                borderRadius: '10px',
                border: '1px solid var(--color-border, #e2e8f0)',
                fontSize: '12px'
            }}>
                <span style={{ fontWeight: 700, color: '#475569', marginRight: '4px' }}>LEGEND:</span>
                {[
                    { code: 'P', label: 'Present (On Time)' },
                    { code: 'L', label: 'Late (>10m Grace)' },
                    { code: 'D', label: 'Half Day (>60m)' },
                    { code: 'H', label: 'Holiday / Absent' },
                    { code: 'O', label: 'Overtime' },
                    { code: 'DA', label: '0.5 Day Allowed' },
                    { code: 'HA', label: 'Holiday Allowed (Off)' },
                ].map(item => {
                    const col = CODE_COLORS[item.code];
                    return (
                        <div key={item.code} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{
                                display: 'inline-block',
                                width: '22px',
                                height: '22px',
                                lineHeight: '20px',
                                textAlign: 'center',
                                borderRadius: '4px',
                                fontWeight: 700,
                                fontSize: '11px',
                                background: col.bg,
                                color: col.text,
                                border: `1px solid ${col.border}`
                            }}>
                                {item.code}
                            </span>
                            <span style={{ color: '#334155' }}>{item.label}</span>
                        </div>
                    );
                })}
            </div>

            {/* Attendance Matrix Grid */}
            {loading ? (
                <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
                    <i className="bx bx-loader-alt bx-spin" style={{ fontSize: '32px', marginBottom: '8px' }} />
                    <div>Loading Monthly Attendance Matrix...</div>
                </div>
            ) : rows.length === 0 ? (
                <div style={{
                    padding: '40px',
                    textAlign: 'center',
                    background: 'var(--color-surface, #ffffff)',
                    borderRadius: '12px',
                    border: '1px dashed var(--color-border, #cbd5e1)'
                }}>
                    <i className="bx bx-calendar-x" style={{ fontSize: '40px', color: '#94a3b8', marginBottom: '8px' }} />
                    <div>No active technicians found for the selected department.</div>
                </div>
            ) : (
                <div style={{
                    background: 'var(--color-surface, #ffffff)',
                    borderRadius: '12px',
                    border: '1px solid var(--color-border, #e2e8f0)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    overflowX: 'auto',
                    maxHeight: 'calc(100vh - 280px)'
                }}>
                    <table style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        fontSize: '12px',
                        textAlign: 'center'
                    }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #cbd5e1', position: 'sticky', top: 0, zIndex: 10 }}>
                                {/* Sticky Employee Details */}
                                <th style={{ padding: '10px 12px', textAlign: 'left', minWidth: '80px', position: 'sticky', left: 0, background: '#f8fafc', zIndex: 11 }}>Code</th>
                                <th style={{ padding: '10px 12px', textAlign: 'left', minWidth: '160px', position: 'sticky', left: '80px', background: '#f8fafc', zIndex: 11 }}>Technician Name</th>
                                <th style={{ padding: '10px 12px', textAlign: 'left', minWidth: '110px' }}>Dept</th>
                                <th style={{ padding: '10px 8px', minWidth: '70px' }}>Shift</th>

                                {/* Days Columns */}
                                {gridData?.calendar.map(day => (
                                    <th
                                        key={day.day}
                                        style={{
                                            padding: '8px 4px',
                                            minWidth: '32px',
                                            background: day.is_sunday ? '#fee2e2' : undefined,
                                            color: day.is_sunday ? '#b91c1c' : '#1e293b',
                                            borderRight: '1px solid #e2e8f0'
                                        }}
                                    >
                                        <div style={{ fontSize: '11px', fontWeight: 700 }}>{day.day}</div>
                                        <div style={{ fontSize: '9px', color: day.is_sunday ? '#dc2626' : '#64748b' }}>{day.day_name}</div>
                                    </th>
                                ))}

                                {/* Aggregate Totals */}
                                <th style={{ padding: '10px 6px', background: '#dcfce7', color: '#15803d', minWidth: '36px' }} title="Present">P</th>
                                <th style={{ padding: '10px 6px', background: '#fef3c7', color: '#b45309', minWidth: '36px' }} title="Late">L</th>
                                <th style={{ padding: '10px 6px', background: '#ffedd5', color: '#c2410c', minWidth: '36px' }} title="Half Day">D</th>
                                <th style={{ padding: '10px 6px', background: '#fee2e2', color: '#b91c1c', minWidth: '36px' }} title="Holiday / Absent">H</th>
                                <th style={{ padding: '10px 6px', background: '#f3e8ff', color: '#7e22ce', minWidth: '36px' }} title="Overtime Hours">OT</th>
                                <th style={{ padding: '10px 6px', background: '#e0f2fe', color: '#0369a1', minWidth: '36px' }} title="0.5 Day Allowed">DA</th>
                                <th style={{ padding: '10px 6px', background: '#ccfbf1', color: '#0f766e', minWidth: '36px' }} title="Holiday Allowed">HA</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, rIdx) => {
                                const rowBg = rIdx % 2 === 0 ? 'var(--color-surface, #ffffff)' : '#fcfcfd';
                                return (
                                    <tr
                                        key={row.employee_id}
                                        style={{
                                            background: rowBg,
                                            borderBottom: '1px solid #e2e8f0',
                                            transition: 'background 0.1s'
                                        }}
                                    >
                                        {/* Sticky Employee Columns */}
                                        <td style={{
                                            padding: '8px 12px',
                                            fontWeight: 600,
                                            textAlign: 'left',
                                            position: 'sticky',
                                            left: 0,
                                            background: rowBg,
                                            zIndex: 2,
                                            color: '#64748b'
                                        }}>
                                            {row.employee_code}
                                        </td>
                                        <td style={{
                                            padding: '8px 12px',
                                            fontWeight: 600,
                                            textAlign: 'left',
                                            position: 'sticky',
                                            left: '80px',
                                            background: rowBg,
                                            zIndex: 2,
                                            color: '#0f172a'
                                        }}>
                                            {row.employee_name}
                                        </td>
                                        <td style={{ padding: '8px 12px', textAlign: 'left', color: '#475569' }}>
                                            {row.department}
                                        </td>
                                        <td style={{ padding: '8px 8px', color: '#64748b' }}>
                                            {row.shift_time}
                                        </td>

                                        {/* Interactive Day Cells */}
                                        {gridData?.calendar.map(day => {
                                            const code = row.days[String(day.day)] || '';
                                            const styling = code ? CODE_COLORS[code] : null;
                                            return (
                                                <td
                                                    key={day.day}
                                                    tabIndex={0}
                                                    onClick={() => handleCellClick(row.employee_id, day.day)}
                                                    onKeyDown={e => handleCellKeyDown(e, row.employee_id, day.day)}
                                                    style={{
                                                        padding: '4px 2px',
                                                        borderRight: '1px solid #f1f5f9',
                                                        background: day.is_sunday && !code ? '#fef2f2' : (styling?.bg || 'transparent'),
                                                        color: styling?.text || (day.is_sunday ? '#ef4444' : '#94a3b8'),
                                                        fontWeight: 700,
                                                        cursor: 'pointer',
                                                        userSelect: 'none',
                                                        outline: 'none',
                                                        transition: 'background 0.1s'
                                                    }}
                                                    title={`Click to cycle / type code. Day ${day.day} (${day.day_name})`}
                                                >
                                                    {code || (day.is_sunday ? '·' : '-')}
                                                </td>
                                            );
                                        })}

                                        {/* Aggregate Counters */}
                                        <td style={{ padding: '8px 4px', fontWeight: 700, color: '#15803d', background: '#f0fdf4' }}>{row.totals.present}</td>
                                        <td style={{ padding: '8px 4px', fontWeight: 700, color: '#b45309', background: '#fffbeb' }}>{row.totals.late}</td>
                                        <td style={{ padding: '8px 4px', fontWeight: 700, color: '#c2410c', background: '#fff7ed' }}>{row.totals.half_day}</td>
                                        <td style={{ padding: '8px 4px', fontWeight: 700, color: '#b91c1c', background: '#fef2f2' }}>{row.totals.holiday}</td>
                                        <td style={{ padding: '8px 4px', fontWeight: 700, color: '#7e22ce', background: '#faf5ff' }}>{row.totals.overtime}</td>
                                        <td style={{ padding: '8px 4px', fontWeight: 700, color: '#0369a1', background: '#f0f9ff' }}>{row.totals.allowed_half_day}</td>
                                        <td style={{ padding: '8px 4px', fontWeight: 700, color: '#0f766e', background: '#f0fdfa' }}>{row.totals.allowed_holiday}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};
