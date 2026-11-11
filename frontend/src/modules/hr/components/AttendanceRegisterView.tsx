import React, { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../../../api/client';

export interface AttendanceRegisterViewProps {
    onBack?: () => void;
    onOpenStandaloneTab?: () => void;
    isStandalone?: boolean;
}

interface DayEntry {
    code: string;
    status: string;
    status_display: string;
    site_id: string | null;
    site: string;
    post: string;
    shift: string;
    is_replacement: boolean;
    notes: string;
    source?: string;
}

interface RegisterDayCell {
    code: string;
    status: string;
    status_display: string;
    site: string;
    locations: string[];
    entries: DayEntry[];
    shift: string;
    post: string;
    is_replacement: boolean;
    is_jump: boolean;
    jump_id: string | null;
    notes: string;
}

interface RegisterRow {
    employee_id: string;
    employee_code: string;
    erp_code: string;
    employee_name: string;
    father_name: string;
    workforce_type: string;
    department: string;
    designation: string;
    assigned_site: string;
    has_attendance: boolean;
    days: Record<string, RegisterDayCell>;
    totals: {
        present: number;
        absent: number;
        leave: number;
        half_day: number;
        weekly_off: number;
        worked_off: number;
        ot: number;
        od: number;
        jump: number;
        replacements: number;
        total_duties: number;
    };
}

interface RegisterResponse {
    start_date: string;
    end_date: string;
    month: number;
    year: number;
    month_label: string;
    dates: string[];
    days_header: Array<{
        date: string;
        day: string;
        day_num: number;
        weekday: string;
        is_sunday: boolean;
    }>;
    rows: RegisterRow[];
    summary: {
        employees_count: number;
        marked_employees_count: number;
        totals: {
            present: number;
            absent: number;
            leave: number;
            half_day: number;
            weekly_off: number;
            worked_off: number;
            ot: number;
            od: number;
            jump: number;
            replacements: number;
            total_duties: number;
        };
    };
    sites: Array<{ id: string; name: string; client_name: string }>;
    exported_by?: string;
    company_name?: string;
    is_read_only?: boolean;
    source?: string;
}

const BADGE_STYLE_MAP: Record<string, { bg: string; fg: string; border: string }> = {
    P: { bg: '#059669', fg: '#ffffff', border: '#047857' },
    O: { bg: '#0284c7', fg: '#ffffff', border: '#0369a1' },
    OD: { bg: '#0891b2', fg: '#ffffff', border: '#0e7490' },
    PO: { bg: '#4f46e5', fg: '#ffffff', border: '#4338ca' },
    POD: { bg: '#7c3aed', fg: '#ffffff', border: '#6d28d9' },
    WP: { bg: '#9333ea', fg: '#ffffff', border: '#7e22ce' },
    W: { bg: '#475569', fg: '#ffffff', border: '#334155' },
    A: { bg: '#dc2626', fg: '#ffffff', border: '#b91c1c' },
    L: { bg: '#d97706', fg: '#ffffff', border: '#b45309' },
    HD: { bg: '#2563eb', fg: '#ffffff', border: '#1d4ed8' },
    JUMP: { bg: '#7e22ce', fg: '#ffffff', border: '#6b21a8' },
};

const MONTHS = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' },
];

const escapeHtml = (value: string): string =>
    String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

export const AttendanceRegisterView: React.FC<AttendanceRegisterViewProps> = ({
    onBack,
    onOpenStandaloneTab,
    isStandalone = false,
}) => {
    const today = new Date();
    const [month, setMonth] = useState<number>(today.getMonth() + 1);
    const [year, setYear] = useState<number>(today.getFullYear());
    const [workforceType, setWorkforceType] = useState<string>('');
    const [siteId, setSiteId] = useState<string>('');
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [searchInput, setSearchInput] = useState<string>('');
    const [debouncedSearch, setDebouncedSearch] = useState<string>('');
    const [markedOnly, setMarkedOnly] = useState<boolean>(false);

    const [loading, setLoading] = useState<boolean>(false);
    const [exportingFormat, setExportingFormat] = useState<'xlsx' | 'csv' | null>(null);
    const [error, setError] = useState<string>('');
    const [data, setData] = useState<RegisterResponse | null>(null);

    const yearOptions = [
        today.getFullYear() - 2,
        today.getFullYear() - 1,
        today.getFullYear(),
        today.getFullYear() + 1,
    ];

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setDebouncedSearch(searchInput.trim());
        }, 300);
        return () => window.clearTimeout(timer);
    }, [searchInput]);

    const buildQueryParams = useCallback(() => {
        const params: Record<string, string | number | boolean> = { month, year };
        if (workforceType) params.workforce_type = workforceType;
        if (siteId) params.site_id = siteId;
        if (statusFilter) params.status = statusFilter;
        if (debouncedSearch) params.search = debouncedSearch;
        if (markedOnly) params.marked_only = 'true';
        return params;
    }, [month, year, workforceType, siteId, statusFilter, debouncedSearch, markedOnly]);

    const fetchRegister = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await apiClient.get('/api/hrm/workforce-attendance/register/', {
                params: buildQueryParams(),
            });
            setData(res.data);
        } catch (err: any) {
            setError(err?.response?.data?.detail || err?.message || 'Failed to load Attendance Registry from Operations Muster.');
        } finally {
            setLoading(false);
        }
    }, [buildQueryParams]);

    useEffect(() => {
        fetchRegister();
    }, [fetchRegister]);

    const handleExport = async (format: 'xlsx' | 'csv') => {
        setExportingFormat(format);
        try {
            const params = {
                ...buildQueryParams(),
                export_format: format,
            };
            const res = await apiClient.get('/api/hrm/workforce-attendance/export-register/', {
                params,
                responseType: 'blob',
            });
            const blob = new Blob([res.data], {
                type:
                    format === 'xlsx'
                        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                        : 'text/csv;charset=utf-8;',
            });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            const mStr = String(month).padStart(2, '0');
            a.href = url;
            a.download = `attendance_register_${year}_${mStr}.${format}`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (err: any) {
            setError(err?.response?.data?.detail || err?.message || `Failed to export ${format.toUpperCase()} register.`);
        } finally {
            setExportingFormat(null);
        }
    };

    const handlePrintRegister = () => {
        if (!data) return;
        const win = window.open('', '_blank', 'width=1360,height=850');
        if (!win) {
            setError('Please allow pop-ups in your browser to print the Attendance Registry sheet.');
            return;
        }

        const selectedSiteObj = data.sites?.find((s) => s.id === siteId);
        const siteLabel = selectedSiteObj ? selectedSiteObj.name : 'All Locations';
        const periodLabel = data.month_label || `${MONTHS.find((m) => m.value === month)?.label || month} ${year}`;
        const exportedBy = data.exported_by || 'OPERATION';
        const companyTitle = data.company_name ? `${escapeHtml(data.company_name)} — ` : '';

        const headerDaysHtml = data.days_header
            .map((dh) => `<th class="day-col">${dh.day_num}</th>`)
            .join('');

        const bodyRowsHtml = data.rows
            .map((row) => {
                const dayCellsHtml = data.days_header
                    .map((dh) => {
                        const cell = row.days[dh.date];
                        if (!cell || !cell.entries || cell.entries.length === 0) {
                            return '<td class="day-cell empty"></td>';
                        }
                        const itemsHtml = cell.entries
                            .map((entry) => {
                                const codeLabel = cell.is_jump ? 'JUMP' : entry.code;
                                const siteTxt = entry.site ? `<div class="cell-site">${escapeHtml(entry.site)}</div>` : '';
                                return `<div class="cell-entry"><div class="cell-code code-${escapeHtml(codeLabel)}">${escapeHtml(codeLabel)}</div>${siteTxt}</div>`;
                            })
                            .join('');
                        return `<td class="day-cell">${itemsHtml}</td>`;
                    })
                    .join('');

                return `
                    <tr>
                        <td class="code-col">${escapeHtml(row.employee_code)}</td>
                        <td class="name-col">
                            <div class="emp-name">${escapeHtml(row.employee_name)}</div>
                            ${row.father_name ? `<div class="emp-sub">${escapeHtml(row.father_name)}</div>` : ''}
                        </td>
                        <td class="desig-col">${escapeHtml(row.designation || '')}</td>
                        ${dayCellsHtml}
                        <td class="tots-col">${row.totals?.total_duties ?? 0}</td>
                    </tr>
                `;
            })
            .join('');

        const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Active Employees — Attendance Registry (${escapeHtml(periodLabel)})</title>
<style>
  @page {
    size: legal landscape;
    margin: 7mm 6mm;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 0;
    font-family: Arial, Helvetica, sans-serif;
    color: #0f172a;
    background: #ffffff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sheet-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 4px;
    border-bottom: 1.5px solid #0f172a;
    padding-bottom: 3px;
  }
  .sheet-title {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.2px;
  }
  .sheet-meta {
    font-size: 9.5px;
    color: #334155;
    font-weight: 600;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  th, td {
    border: 1px solid #64748b;
    padding: 2px 1.5px;
    vertical-align: top;
    overflow: hidden;
  }
  thead th {
    background: #f1f5f9;
    font-size: 8.5px;
    font-weight: 700;
    text-align: center;
    vertical-align: middle;
    padding: 4px 1px;
  }
  th.code-col, td.code-col {
    width: 46px;
    text-align: center;
    vertical-align: middle;
    font-size: 8px;
    font-weight: 700;
  }
  th.name-col, td.name-col {
    width: 105px;
    text-align: left;
    vertical-align: middle;
    padding: 2px 4px;
  }
  th.desig-col, td.desig-col {
    width: 68px;
    text-align: left;
    vertical-align: middle;
    font-size: 7px;
    color: #334155;
    padding: 2px 3px;
  }
  th.day-col, td.day-cell {
    text-align: center;
  }
  th.tots-col, td.tots-col {
    width: 32px;
    text-align: center;
    vertical-align: middle;
    font-size: 9px;
    font-weight: 700;
    background: #f8fafc;
  }
  .emp-name {
    font-size: 8px;
    font-weight: 700;
    line-height: 1.15;
  }
  .emp-sub {
    font-size: 6.8px;
    color: #475569;
    line-height: 1.1;
  }
  .day-cell {
    min-height: 28px;
    height: 28px;
  }
  .cell-entry {
    margin-bottom: 1.5px;
  }
  .cell-entry:last-child {
    margin-bottom: 0;
  }
  .cell-code {
    font-size: 8px;
    font-weight: 800;
    line-height: 1.05;
  }
  .code-A, .code-JUMP { color: #b91c1c; }
  .code-O, .code-OD, .code-PO, .code-POD { color: #0369a1; }
  .code-WP { color: #6d28d9; }
  .code-L, .code-HD { color: #b45309; }
  .cell-site {
    font-size: 5.8px;
    line-height: 1.05;
    color: #1e293b;
    word-break: break-word;
    margin-top: 1px;
  }
  .sheet-footer {
    margin-top: 6px;
    display: flex;
    justify-content: space-between;
    font-size: 9px;
    font-weight: 700;
  }
  .user-name-label {
    color: #b91c1c;
  }
  tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }
</style>
</head>
<body>
  <div class="sheet-header">
    <div class="sheet-title">Active Employees</div>
    <div class="sheet-meta">${companyTitle}Period: ${escapeHtml(periodLabel)} | Location: ${escapeHtml(siteLabel)} | Count: ${data.rows.length} | Read-Only Operations Muster Register</div>
  </div>
  <table>
    <thead>
      <tr>
        <th class="code-col">Code</th>
        <th class="name-col">Employee Name</th>
        <th class="desig-col">Designation</th>
        ${headerDaysHtml}
        <th class="tots-col">Tots</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRowsHtml}
    </tbody>
  </table>
  <div class="sheet-footer">
    <span class="user-name-label">User Name: ${escapeHtml(exportedBy)}</span>
    <span>Printed: ${escapeHtml(new Date().toLocaleString())}</span>
  </div>
  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 250);
    };
  </script>
</body>
</html>`;

        win.document.open();
        win.document.write(html);
        win.document.close();
    };

    const renderDayTooltip = (row: RegisterRow, dateStr: string, cell: RegisterDayCell): string => {
        if (!cell.entries || cell.entries.length === 0) {
            return `${row.employee_code} — ${row.employee_name}\nDate: ${dateStr}\nStatus: Unmarked (Blank in Operations Muster)`;
        }
        const lines = cell.entries.map((entry, idx) => {
            const prefix = cell.entries.length > 1 ? `[Shift ${idx + 1}] ` : '';
            const codeDisplay = cell.is_jump ? 'JUMP (3+ Consecutive Absences)' : `${entry.code} (${entry.status_display})`;
            const parts = [
                `${prefix}${codeDisplay}`,
                `Location: ${entry.site || 'Not specified'}`,
                entry.post ? `Post: ${entry.post}` : '',
                entry.shift ? `Shift: ${entry.shift}` : '',
                entry.is_replacement ? 'Replacement Duty: Yes' : '',
                entry.notes ? `Notes: ${entry.notes}` : '',
            ].filter(Boolean);
            return parts.join(' | ');
        });
        return `${row.employee_code} — ${row.employee_name}\nDate: ${dateStr}\n${lines.join('\n')}`;
    };

    const renderDayCell = (row: RegisterRow, dateStr: string, cell?: RegisterDayCell) => {
        if (!cell || !cell.entries || cell.entries.length === 0) {
            return (
                <td
                    key={dateStr}
                    title={`${row.employee_code} — ${row.employee_name}\nDate: ${dateStr}\nNo attendance marked`}
                    style={{
                        borderRight: '1px solid #f1f5f9',
                        padding: '4px 3px',
                        minWidth: '58px',
                        height: '44px',
                        verticalAlign: 'middle',
                        textAlign: 'center',
                        background: '#ffffff',
                    }}
                />
            );
        }

        const tooltipText = renderDayTooltip(row, dateStr, cell);

        return (
            <td
                key={dateStr}
                title={tooltipText}
                style={{
                    borderRight: '1px solid #e2e8f0',
                    padding: '3px 2px',
                    minWidth: '58px',
                    maxWidth: '72px',
                    verticalAlign: 'top',
                    textAlign: 'center',
                    background: cell.is_jump ? '#faf5ff' : cell.entries.some((e) => e.code === 'A') ? '#fff5f5' : '#ffffff',
                    cursor: 'default',
                }}
            >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                    {cell.entries.map((entry, idx) => {
                        const badgeCode = cell.is_jump ? 'JUMP' : entry.code;
                        const palette = BADGE_STYLE_MAP[badgeCode] || { bg: '#334155', fg: '#ffffff', border: '#1e293b' };
                        return (
                            <div
                                key={`${dateStr}-${idx}-${entry.site_id || 'nosite'}-${entry.code}`}
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    width: '100%',
                                    gap: '1px',
                                }}
                            >
                                <span
                                    style={{
                                        display: 'inline-block',
                                        background: palette.bg,
                                        color: palette.fg,
                                        border: `1px solid ${palette.border}`,
                                        borderRadius: '4px',
                                        padding: '1px 5px',
                                        fontSize: '10px',
                                        fontWeight: 700,
                                        lineHeight: '1.2',
                                        letterSpacing: '0.2px',
                                    }}
                                >
                                    {badgeCode}
                                </span>
                                {entry.site && (
                                    <span
                                        style={{
                                            fontSize: '8.5px',
                                            lineHeight: '1.1',
                                            color: '#334155',
                                            fontWeight: 500,
                                            maxWidth: '64px',
                                            display: '-webkit-box',
                                            WebkitLineClamp: 2,
                                            WebkitBoxOrient: 'vertical',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            wordBreak: 'break-word',
                                        }}
                                    >
                                        {entry.site}
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>
            </td>
        );
    };

    const totals = data?.summary?.totals;

    return (
        <div
            style={{
                padding: isStandalone ? '20px 24px' : '16px 20px',
                background: '#f8fafc',
                minHeight: '100%',
            }}
        >
            {/* Header & Actions */}
            <div
                style={{
                    background: '#ffffff',
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                    padding: '16px 20px',
                    marginBottom: '14px',
                    boxShadow: '0 1px 2px rgba(15,23,42,0.03)',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: '16px',
                        flexWrap: 'wrap',
                        marginBottom: '14px',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                        {onBack && (
                            <button
                                type="button"
                                onClick={onBack}
                                style={{
                                    background: '#f1f5f9',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '8px',
                                    padding: '7px 11px',
                                    color: '#334155',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    fontSize: '12.5px',
                                    fontWeight: 600,
                                }}
                            >
                                <i className="bx bx-arrow-back"></i> Back
                            </button>
                        )}
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                <h2
                                    style={{
                                        margin: 0,
                                        fontSize: '17px',
                                        fontWeight: 700,
                                        color: '#0f172a',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                    }}
                                >
                                    <i className="bx bx-calendar-check" style={{ color: '#0284c7', fontSize: '20px' }}></i>
                                    Attendance Registry — Active Employees Master Sheet
                                </h2>
                                <span
                                    style={{
                                        background: '#eff6ff',
                                        color: '#1d4ed8',
                                        border: '1px solid #bfdbfe',
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        padding: '2px 8px',
                                        borderRadius: '999px',
                                    }}
                                >
                                    Read-Only Audit View • Synced from Operations Muster
                                </span>
                            </div>
                            <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: '#64748b' }}>
                                Live attendance synced automatically from Security Operations Monthly Duty Muster with location names per day. Unmarked dates remain blank.
                            </p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        {onOpenStandaloneTab && !isStandalone && (
                            <button
                                type="button"
                                onClick={onOpenStandaloneTab}
                                style={{
                                    background: '#eff6ff',
                                    border: '1px solid #93c5fd',
                                    borderRadius: '8px',
                                    padding: '7px 12px',
                                    fontSize: '12.5px',
                                    fontWeight: 600,
                                    color: '#1d4ed8',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                }}
                            >
                                <i className="bx bx-window-open"></i> Open Separate Tab
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={fetchRegister}
                            disabled={loading}
                            style={{
                                background: '#ffffff',
                                border: '1px solid #cbd5e1',
                                borderRadius: '8px',
                                padding: '7px 12px',
                                fontSize: '12.5px',
                                fontWeight: 600,
                                color: '#334155',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                            }}
                        >
                            <i className={`bx bx-refresh ${loading ? 'bx-spin' : ''}`}></i> Refresh
                        </button>
                        <button
                            type="button"
                            onClick={() => handleExport('xlsx')}
                            disabled={exportingFormat !== null || !data}
                            style={{
                                background: '#0f766e',
                                border: '1px solid #0d9488',
                                borderRadius: '8px',
                                padding: '7px 13px',
                                fontSize: '12.5px',
                                fontWeight: 600,
                                color: '#ffffff',
                                cursor: exportingFormat !== null || !data ? 'not-allowed' : 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                            }}
                        >
                            <i className="bx bxs-file-export"></i>
                            {exportingFormat === 'xlsx' ? 'Exporting Excel...' : 'Export Excel (.xlsx)'}
                        </button>
                        <button
                            type="button"
                            onClick={() => handleExport('csv')}
                            disabled={exportingFormat !== null || !data}
                            style={{
                                background: '#ffffff',
                                border: '1px solid #cbd5e1',
                                borderRadius: '8px',
                                padding: '7px 12px',
                                fontSize: '12.5px',
                                fontWeight: 600,
                                color: '#334155',
                                cursor: exportingFormat !== null || !data ? 'not-allowed' : 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                            }}
                        >
                            <i className="bx bx-download"></i>
                            {exportingFormat === 'csv' ? 'Exporting...' : 'CSV'}
                        </button>
                        <button
                            type="button"
                            onClick={handlePrintRegister}
                            disabled={!data || data.rows.length === 0}
                            style={{
                                background: '#059669',
                                border: '1px solid #047857',
                                borderRadius: '8px',
                                padding: '7px 13px',
                                fontSize: '12.5px',
                                fontWeight: 600,
                                color: '#ffffff',
                                cursor: !data || data.rows.length === 0 ? 'not-allowed' : 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                            }}
                        >
                            <i className="bx bx-printer"></i> Print Register
                        </button>
                    </div>
                </div>

                {/* Filters Row */}
                <div
                    style={{
                        display: 'flex',
                        gap: '12px',
                        alignItems: 'flex-end',
                        flexWrap: 'wrap',
                        paddingTop: '10px',
                        borderTop: '1px solid #f1f5f9',
                    }}
                >
                    <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                            Month
                        </label>
                        <select
                            value={month}
                            onChange={(e) => setMonth(Number(e.target.value))}
                            style={{
                                border: '1px solid #cbd5e1',
                                borderRadius: '7px',
                                padding: '6px 10px',
                                fontSize: '13px',
                                background: '#ffffff',
                                color: '#0f172a',
                            }}
                        >
                            {MONTHS.map((m) => (
                                <option key={m.value} value={m.value}>
                                    {m.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                            Year
                        </label>
                        <select
                            value={year}
                            onChange={(e) => setYear(Number(e.target.value))}
                            style={{
                                border: '1px solid #cbd5e1',
                                borderRadius: '7px',
                                padding: '6px 10px',
                                fontSize: '13px',
                                background: '#ffffff',
                                color: '#0f172a',
                            }}
                        >
                            {yearOptions.map((y) => (
                                <option key={y} value={y}>
                                    {y}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                            Location (Site)
                        </label>
                        <select
                            value={siteId}
                            onChange={(e) => setSiteId(e.target.value)}
                            style={{
                                border: '1px solid #cbd5e1',
                                borderRadius: '7px',
                                padding: '6px 10px',
                                fontSize: '13px',
                                background: '#ffffff',
                                color: '#0f172a',
                                minWidth: '175px',
                                maxWidth: '240px',
                            }}
                        >
                            <option value="">All Locations</option>
                            {(data?.sites || []).map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                            Workforce Type
                        </label>
                        <select
                            value={workforceType}
                            onChange={(e) => setWorkforceType(e.target.value)}
                            style={{
                                border: '1px solid #cbd5e1',
                                borderRadius: '7px',
                                padding: '6px 10px',
                                fontSize: '13px',
                                background: '#ffffff',
                                color: '#0f172a',
                            }}
                        >
                            <option value="">All Workforce</option>
                            <option value="DIRECT">Guards / Field (DIRECT)</option>
                            <option value="INDIRECT">Office / Management (INDIRECT)</option>
                        </select>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                            Status Filter
                        </label>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            style={{
                                border: '1px solid #cbd5e1',
                                borderRadius: '7px',
                                padding: '6px 10px',
                                fontSize: '13px',
                                background: '#ffffff',
                                color: '#0f172a',
                            }}
                        >
                            <option value="">All Statuses</option>
                            <option value="P">Present (P)</option>
                            <option value="O">Overtime (O)</option>
                            <option value="OD">OT Dozing (OD)</option>
                            <option value="PO">Present + OT (PO)</option>
                            <option value="POD">Present + OD (POD)</option>
                            <option value="WP">Worked Weekly Off (WP)</option>
                            <option value="W">Weekly Off (W)</option>
                            <option value="A">Absent (A)</option>
                            <option value="L">Leave (L)</option>
                            <option value="HD">Half Day (HD)</option>
                            <option value="JUMP">JUMP (3+ Absences)</option>
                        </select>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                            Employee Code / Name
                        </label>
                        <input
                            type="text"
                            placeholder="e.g. 000014 or Azeem"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            style={{
                                border: '1px solid #cbd5e1',
                                borderRadius: '7px',
                                padding: '6px 10px',
                                fontSize: '13px',
                                width: '175px',
                                color: '#0f172a',
                            }}
                        />
                    </div>

                    <label
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '12.5px',
                            fontWeight: 600,
                            color: '#334155',
                            padding: '6px 10px',
                            background: markedOnly ? '#eff6ff' : '#f8fafc',
                            border: `1px solid ${markedOnly ? '#93c5fd' : '#cbd5e1'}`,
                            borderRadius: '7px',
                            cursor: 'pointer',
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={markedOnly}
                            onChange={(e) => setMarkedOnly(e.target.checked)}
                        />
                        Only With Attendance
                    </label>
                </div>
            </div>

            {error && (
                <div
                    style={{
                        background: '#fef2f2',
                        color: '#991b1b',
                        border: '1px solid #fecaca',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        marginBottom: '12px',
                        fontSize: '13px',
                        fontWeight: 500,
                    }}
                >
                    <i className="bx bx-error-circle" style={{ marginRight: '6px' }}></i>
                    {error}
                </div>
            )}

            {/* Legend + Summary Cards */}
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                    gap: '12px',
                    marginBottom: '14px',
                }}
            >
                <div
                    style={{
                        background: '#ffffff',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        padding: '12px 16px',
                    }}
                >
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>
                        Attendance Codes & Legend (Location Shown Inside Each Cell & Hover)
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '12px', alignItems: 'center' }}>
                        {[
                            { code: 'P', label: 'Present' },
                            { code: 'O', label: 'Overtime' },
                            { code: 'OD', label: 'OT Dozing' },
                            { code: 'PO', label: 'P + OT' },
                            { code: 'POD', label: 'P + OD' },
                            { code: 'WP', label: 'Worked Off' },
                            { code: 'W', label: 'Weekly Off' },
                            { code: 'A', label: 'Absent' },
                            { code: 'L', label: 'Leave' },
                            { code: 'HD', label: 'Half Day' },
                            { code: 'JUMP', label: '3+ Absences' },
                        ].map((item) => {
                            const palette = BADGE_STYLE_MAP[item.code];
                            return (
                                <span key={item.code} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#334155' }}>
                                    <span
                                        style={{
                                            background: palette.bg,
                                            color: palette.fg,
                                            padding: '1px 6px',
                                            borderRadius: '4px',
                                            fontWeight: 700,
                                            fontSize: '10.5px',
                                        }}
                                    >
                                        {item.code}
                                    </span>
                                    <span>{item.label}</span>
                                </span>
                            );
                        })}
                    </div>
                </div>

                <div
                    style={{
                        background: '#ffffff',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        padding: '12px 16px',
                    }}
                >
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>
                        Register Totals Summary — {data?.month_label || `${month}/${year}`}
                    </div>
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(4, minmax(95px, 1fr))',
                            gap: '8px',
                            fontSize: '12.5px',
                        }}
                    >
                        <div>
                            Employees: <strong style={{ color: '#0f172a' }}>{data?.summary?.employees_count ?? 0}</strong>
                            <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '4px' }}>
                                ({data?.summary?.marked_employees_count ?? 0} marked)
                            </span>
                        </div>
                        <div>
                            Present: <strong style={{ color: '#059669' }}>{totals?.present ?? 0}</strong>
                        </div>
                        <div>
                            OT / Doz: <strong style={{ color: '#0284c7' }}>{(totals?.ot ?? 0) + (totals?.od ?? 0)}</strong>
                        </div>
                        <div>
                            Tots (Shifts): <strong style={{ color: '#1d4ed8' }}>{totals?.total_duties ?? 0}</strong>
                        </div>
                        <div>
                            Worked Off: <strong style={{ color: '#7e22ce' }}>{totals?.worked_off ?? 0}</strong>
                        </div>
                        <div>
                            Weekly Off: <strong style={{ color: '#475569' }}>{totals?.weekly_off ?? 0}</strong>
                        </div>
                        <div>
                            Absent: <strong style={{ color: '#dc2626' }}>{totals?.absent ?? 0}</strong>
                        </div>
                        <div>
                            Leave / JUMP: <strong style={{ color: '#d97706' }}>{totals?.leave ?? 0}</strong> /{' '}
                            <strong style={{ color: '#7e22ce' }}>{totals?.jump ?? 0}</strong>
                        </div>
                    </div>
                </div>
            </div>

            {/* Register Matrix Table */}
            <div
                style={{
                    background: '#ffffff',
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                    overflow: 'hidden',
                    boxShadow: '0 1px 2px rgba(15,23,42,0.03)',
                }}
            >
                <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 330px)', overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 20, background: '#f8fafc' }}>
                            <tr style={{ borderBottom: '2px solid #cbd5e1' }}>
                                <th
                                    style={{
                                        position: 'sticky',
                                        left: 0,
                                        zIndex: 25,
                                        background: '#f8fafc',
                                        padding: '9px 10px',
                                        textAlign: 'left',
                                        minWidth: '82px',
                                        borderRight: '1px solid #e2e8f0',
                                        fontWeight: 700,
                                        color: '#334155',
                                        fontSize: '11px',
                                    }}
                                >
                                    CODE
                                </th>
                                <th
                                    style={{
                                        position: 'sticky',
                                        left: '82px',
                                        zIndex: 25,
                                        background: '#f8fafc',
                                        padding: '9px 10px',
                                        textAlign: 'left',
                                        minWidth: '175px',
                                        borderRight: '1px solid #e2e8f0',
                                        fontWeight: 700,
                                        color: '#334155',
                                        fontSize: '11px',
                                    }}
                                >
                                    EMPLOYEE NAME
                                </th>
                                <th
                                    style={{
                                        padding: '9px 10px',
                                        textAlign: 'left',
                                        minWidth: '115px',
                                        borderRight: '1px solid #e2e8f0',
                                        fontWeight: 700,
                                        color: '#334155',
                                        fontSize: '11px',
                                    }}
                                >
                                    DESIGNATION
                                </th>
                                {data?.days_header.map((dh) => (
                                    <th
                                        key={dh.date}
                                        style={{
                                            padding: '6px 2px',
                                            textAlign: 'center',
                                            minWidth: '58px',
                                            borderRight: '1px solid #e2e8f0',
                                            background: dh.is_sunday ? '#fff7ed' : '#f8fafc',
                                            color: dh.is_sunday ? '#c2410c' : '#334155',
                                            fontWeight: 700,
                                            fontSize: '11px',
                                        }}
                                    >
                                        <div>{dh.day}</div>
                                        <div style={{ fontSize: '9.5px', fontWeight: 500, opacity: 0.8 }}>{dh.weekday}</div>
                                    </th>
                                ))}
                                <th
                                    title="Total Worked Shifts (P + O + OD + WP)"
                                    style={{
                                        padding: '9px 8px',
                                        textAlign: 'center',
                                        minWidth: '52px',
                                        background: '#eff6ff',
                                        color: '#1e3a8a',
                                        fontWeight: 800,
                                        fontSize: '11.5px',
                                        borderLeft: '2px solid #cbd5e1',
                                        borderRight: '1px solid #e2e8f0',
                                    }}
                                >
                                    Tots
                                </th>
                                <th style={{ padding: '9px 6px', textAlign: 'center', minWidth: '34px', color: '#059669', fontWeight: 700 }}>
                                    P
                                </th>
                                <th style={{ padding: '9px 6px', textAlign: 'center', minWidth: '38px', color: '#0284c7', fontWeight: 700 }}>
                                    OT
                                </th>
                                <th style={{ padding: '9px 6px', textAlign: 'center', minWidth: '36px', color: '#7e22ce', fontWeight: 700 }}>
                                    WP
                                </th>
                                <th style={{ padding: '9px 6px', textAlign: 'center', minWidth: '34px', color: '#475569', fontWeight: 700 }}>
                                    W
                                </th>
                                <th style={{ padding: '9px 6px', textAlign: 'center', minWidth: '34px', color: '#dc2626', fontWeight: 700 }}>
                                    A
                                </th>
                                <th style={{ padding: '9px 6px', textAlign: 'center', minWidth: '34px', color: '#d97706', fontWeight: 700 }}>
                                    L
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && !data ? (
                                <tr>
                                    <td colSpan={45} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                                        <i className="bx bx-loader-alt bx-spin" style={{ fontSize: '20px', marginRight: '8px' }}></i>
                                        Loading Attendance Registry from Operations Muster...
                                    </td>
                                </tr>
                            ) : !data || data.rows.length === 0 ? (
                                <tr>
                                    <td colSpan={45} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                                        No employee records match the selected filters.
                                    </td>
                                </tr>
                            ) : (
                                data.rows.map((row) => (
                                    <tr
                                        key={row.employee_id}
                                        style={{
                                            borderBottom: '1px solid #e2e8f0',
                                            background: '#ffffff',
                                        }}
                                    >
                                        <td
                                            style={{
                                                position: 'sticky',
                                                left: 0,
                                                zIndex: 10,
                                                background: '#ffffff',
                                                padding: '7px 10px',
                                                fontWeight: 700,
                                                color: '#0f172a',
                                                borderRight: '1px solid #e2e8f0',
                                                verticalAlign: 'middle',
                                            }}
                                        >
                                            {row.employee_code}
                                        </td>
                                        <td
                                            style={{
                                                position: 'sticky',
                                                left: '82px',
                                                zIndex: 10,
                                                background: '#ffffff',
                                                padding: '7px 10px',
                                                borderRight: '1px solid #e2e8f0',
                                                verticalAlign: 'middle',
                                            }}
                                        >
                                            <div style={{ fontWeight: 600, color: '#0f172a', lineHeight: '1.2' }}>
                                                {row.employee_name}
                                            </div>
                                            {row.father_name && (
                                                <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '2px' }}>
                                                    {row.father_name}
                                                </div>
                                            )}
                                        </td>
                                        <td
                                            style={{
                                                padding: '7px 10px',
                                                color: '#475569',
                                                fontSize: '11.5px',
                                                borderRight: '1px solid #e2e8f0',
                                                verticalAlign: 'middle',
                                            }}
                                        >
                                            {row.designation || '-'}
                                        </td>
                                        {data.days_header.map((dh) =>
                                            renderDayCell(row, dh.date, row.days[dh.date])
                                        )}
                                        <td
                                            style={{
                                                padding: '7px 8px',
                                                textAlign: 'center',
                                                fontWeight: 800,
                                                fontSize: '13px',
                                                color: '#1e3a8a',
                                                background: '#eff6ff',
                                                borderLeft: '2px solid #cbd5e1',
                                                borderRight: '1px solid #e2e8f0',
                                                verticalAlign: 'middle',
                                            }}
                                        >
                                            {row.totals.total_duties}
                                        </td>
                                        <td style={{ padding: '7px 6px', textAlign: 'center', fontWeight: 700, color: '#059669', verticalAlign: 'middle' }}>
                                            {row.totals.present}
                                        </td>
                                        <td style={{ padding: '7px 6px', textAlign: 'center', fontWeight: 700, color: '#0284c7', verticalAlign: 'middle' }}>
                                            {row.totals.ot + row.totals.od}
                                        </td>
                                        <td style={{ padding: '7px 6px', textAlign: 'center', fontWeight: 700, color: '#7e22ce', verticalAlign: 'middle' }}>
                                            {row.totals.worked_off}
                                        </td>
                                        <td style={{ padding: '7px 6px', textAlign: 'center', fontWeight: 700, color: '#475569', verticalAlign: 'middle' }}>
                                            {row.totals.weekly_off}
                                        </td>
                                        <td style={{ padding: '7px 6px', textAlign: 'center', fontWeight: 700, color: '#dc2626', verticalAlign: 'middle' }}>
                                            {row.totals.absent}
                                        </td>
                                        <td style={{ padding: '7px 6px', textAlign: 'center', fontWeight: 700, color: '#d97706', verticalAlign: 'middle' }}>
                                            {row.totals.leave}
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

export default AttendanceRegisterView;
