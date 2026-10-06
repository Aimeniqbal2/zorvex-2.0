import React, { useState, useEffect } from 'react';
import { getOperationalSites, getGuardAttendanceLedger, apiClient } from '../api';
import { useToastStore } from '../../../stores/toastStore';

interface AttendanceRegisterViewProps {
    onBack?: () => void;
}

export const AttendanceRegisterView: React.FC<AttendanceRegisterViewProps> = ({ onBack }) => {
    const { addToast } = useToastStore();
    const today = new Date();

    const [activeSubTab, setActiveSubTab] = useState<'location' | 'guard_ledger'>('location');

    // SubTab 1: Location Register State
    const [sites, setSites] = useState<any[]>([]);
    const [selectedSiteId, setSelectedSiteId] = useState<string>('');
    const [dateFrom, setDateFrom] = useState<string>(new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]);
    const [dateTo, setDateTo] = useState<string>(today.toISOString().split('T')[0]);
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [locationRecords, setLocationRecords] = useState<any[]>([]);
    const [loadingLocation, setLoadingLocation] = useState<boolean>(false);

    // SubTab 2: Guard Duty Ledger State
    const [allEmployees, setAllEmployees] = useState<any[]>([]);
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
    const [ledgerYear, setLedgerYear] = useState<number>(today.getFullYear());
    const [ledgerMonth, setLedgerMonth] = useState<number>(today.getMonth() + 1);
    const [guardLedger, setGuardLedger] = useState<any | null>(null);
    const [loadingLedger, setLoadingLedger] = useState<boolean>(false);

    // Preload sites & workforce
    useEffect(() => {
        const initData = async () => {
            try {
                const [sitesRes, empsRes] = await Promise.all([
                    getOperationalSites({ page_size: 500 }),
                    apiClient.get('/api/hrm/employees/?page_size=1000&status=ACTIVE')
                ]);
                const siteList = sitesRes.results || sitesRes || [];
                setSites(siteList);
                if (siteList.length > 0) {
                    setSelectedSiteId(siteList[0].id);
                }

                const empList = empsRes.data?.results || empsRes.data || [];
                setAllEmployees(empList);
                if (empList.length > 0) {
                    setSelectedEmployeeId(String(empList[0].id));
                }
            } catch (err) {
                console.error('Failed to init attendance register data:', err);
            }
        };
        initData();
    }, []);

    // Fetch Location Attendance Records
    const fetchLocationAttendance = async () => {
        if (!selectedSiteId) return;
        try {
            setLoadingLocation(true);
            const params: any = {
                site: selectedSiteId,
                date_from: dateFrom,
                date_to: dateTo,
                page_size: 1000
            };
            if (statusFilter) params.status = statusFilter;

            const res = await apiClient.get('/api/operations/attendance/', { params });
            const list = res.data?.results || res.data || [];
            setLocationRecords(list);
        } catch (err: any) {
            console.error('Failed to fetch location attendance:', err);
            addToast('error', err.response?.data?.detail || 'Failed to load location attendance.');
        } finally {
            setLoadingLocation(false);
        }
    };

    useEffect(() => {
        if (selectedSiteId) {
            fetchLocationAttendance();
        }
    }, [selectedSiteId, dateFrom, dateTo, statusFilter]);

    // Fetch Guard Duty & Overtime Ledger
    const fetchGuardLedger = async () => {
        if (!selectedEmployeeId) return;
        try {
            setLoadingLedger(true);
            const res = await getGuardAttendanceLedger({
                employee: selectedEmployeeId,
                year: ledgerYear,
                month: ledgerMonth
            });
            setGuardLedger(res);
        } catch (err: any) {
            console.error('Failed to fetch guard ledger:', err);
            addToast('error', err.response?.data?.detail || 'Failed to load guard duty ledger.');
        } finally {
            setLoadingLedger(false);
        }
    };

    useEffect(() => {
        if (selectedEmployeeId) {
            fetchGuardLedger();
        }
    }, [selectedEmployeeId, ledgerYear, ledgerMonth]);

    // Export Location Table to CSV
    const exportLocationCsv = () => {
        const header = ['Date', 'Employee Code', 'Guard Name', 'Designation', 'Status', 'Notes'];
        const rows = locationRecords.map(r => [
            r.date || '',
            r.employee_code || r.employee?.employee_code || '',
            r.employee_name || `${r.employee?.first_name || ''} ${r.employee?.last_name || ''}`.trim(),
            r.designation_name || r.employee?.designation?.name || 'Guard',
            r.status || '',
            r.notes || ''
        ]);
        const csvContent = 'data:text/csv;charset=utf-8,' + [header, ...rows].map(e => e.map((c: any) => `"${c}"`).join(',')).join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `Location_Attendance_${selectedSiteId}_${dateFrom}_to_${dateTo}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Export Guard Ledger to CSV
    const exportGuardLedgerCsv = () => {
        if (!guardLedger) return;
        const header = ['Date', 'Operational Site', 'Client', 'Duty Type', 'Earned Amount (PKR)', 'Notes'];
        const rows = guardLedger.records.map((r: any) => [
            r.date,
            r.site_name,
            r.customer_name,
            r.duty_type,
            String(r.amount),
            r.notes
        ]);
        const csvContent = 'data:text/csv;charset=utf-8,' + [header, ...rows].map(e => e.map((c: any) => `"${c}"`).join(',')).join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `Guard_Duty_Ledger_${guardLedger.employee_code}_${ledgerYear}_${ledgerMonth}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div style={{ 
            minHeight: '100vh', 
            background: 'var(--color-bg, #f8fafc)', 
            color: 'var(--color-text, #0f172a)', 
            padding: '24px 32px',
            fontFamily: 'inherit'
        }}>
            
            {/* Header and Mode Selector */}
            <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between', 
                flexWrap: 'wrap', 
                gap: '16px', 
                background: 'var(--color-surface, #ffffff)', 
                padding: '16px 24px', 
                borderRadius: '12px', 
                border: '1px solid var(--color-border, #e2e8f0)', 
                boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                marginBottom: '20px' 
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                    {onBack && (
                        <button
                            onClick={onBack}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '8px 16px',
                                borderRadius: '8px',
                                background: 'var(--color-bg, #f1f5f9)',
                                color: 'var(--color-text, #0f172a)',
                                border: '1px solid var(--color-border, #cbd5e1)',
                                fontWeight: 700,
                                fontSize: '0.9rem',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#e2e8f0'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'var(--color-bg, #f1f5f9)'}
                        >
                            <i className='bx bx-left-arrow-alt' style={{ fontSize: '1.25rem' }}></i>
                            Back to Operations
                        </button>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: 36, height: 36, borderRadius: '8px', background: 'rgba(2, 132, 199, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0284c7', fontSize: '1.4rem' }}>
                            <i className='bx bx-history'></i>
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text, #0f172a)' }}>Attendance Register & Duty Ledger</h2>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-muted, #64748b)' }}>Inspect location daily attendance or drill into individual guard cross-location overtime logs</p>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', background: 'var(--color-bg, #f1f5f9)', padding: '4px', borderRadius: '8px', border: '1px solid var(--color-border, #cbd5e1)' }}>
                    <button
                        onClick={() => setActiveSubTab('location')}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '6px',
                            border: 'none',
                            background: activeSubTab === 'location' ? '#0284c7' : 'transparent',
                            color: activeSubTab === 'location' ? '#ffffff' : 'var(--color-text-muted, #64748b)',
                            fontWeight: 700,
                            fontSize: '0.88rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <i className='bx bx-building'></i> By Location Register
                    </button>
                    <button
                        onClick={() => setActiveSubTab('guard_ledger')}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '6px',
                            border: 'none',
                            background: activeSubTab === 'guard_ledger' ? '#0284c7' : 'transparent',
                            color: activeSubTab === 'guard_ledger' ? '#ffffff' : 'var(--color-text-muted, #64748b)',
                            fontWeight: 700,
                            fontSize: '0.88rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <i className='bx bx-user-pin'></i> By Guard Overtime Ledger
                    </button>
                </div>
            </div>

            {/* TAB 1: LOCATION DAILY REGISTER */}
            {activeSubTab === 'location' && (
                <div>
                    {/* Filter Bar */}
                    <div style={{ 
                        display: 'flex', 
                        flexWrap: 'wrap', 
                        alignItems: 'center', 
                        gap: '14px', 
                        background: 'var(--color-surface, #ffffff)', 
                        padding: '16px 20px', 
                        borderRadius: '10px', 
                        border: '1px solid var(--color-border, #e2e8f0)', 
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                        marginBottom: '20px' 
                    }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '240px' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #64748b)', fontWeight: 700 }}>Operational Site:</label>
                            <select
                                value={selectedSiteId}
                                onChange={(e) => setSelectedSiteId(e.target.value)}
                                style={{ 
                                    padding: '8px 12px', 
                                    borderRadius: '8px', 
                                    background: 'var(--color-surface, #ffffff)', 
                                    color: 'var(--color-text, #0f172a)', 
                                    border: '1px solid var(--color-border, #cbd5e1)', 
                                    fontWeight: 600,
                                    fontSize: '0.88rem'
                                }}
                            >
                                {sites.map(s => (
                                    <option key={s.id} value={s.id}>{s.name} ({s.crm_entity?.name || 'Direct'})</option>
                                ))}
                            </select>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #64748b)', fontWeight: 700 }}>From Date:</label>
                            <input
                                type="date"
                                value={dateFrom}
                                onChange={(e) => setDateFrom(e.target.value)}
                                style={{ 
                                    padding: '8px 12px', 
                                    borderRadius: '8px', 
                                    background: 'var(--color-surface, #ffffff)', 
                                    color: 'var(--color-text, #0f172a)', 
                                    border: '1px solid var(--color-border, #cbd5e1)',
                                    fontSize: '0.88rem'
                                }}
                            />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #64748b)', fontWeight: 700 }}>To Date:</label>
                            <input
                                type="date"
                                value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)}
                                style={{ 
                                    padding: '8px 12px', 
                                    borderRadius: '8px', 
                                    background: 'var(--color-surface, #ffffff)', 
                                    color: 'var(--color-text, #0f172a)', 
                                    border: '1px solid var(--color-border, #cbd5e1)',
                                    fontSize: '0.88rem'
                                }}
                            />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '160px' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #64748b)', fontWeight: 700 }}>Status Filter:</label>
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                style={{ 
                                    padding: '8px 12px', 
                                    borderRadius: '8px', 
                                    background: 'var(--color-surface, #ffffff)', 
                                    color: 'var(--color-text, #0f172a)', 
                                    border: '1px solid var(--color-border, #cbd5e1)',
                                    fontSize: '0.88rem',
                                    fontWeight: 600
                                }}
                            >
                                <option value="">All Statuses</option>
                                <option value="PRESENT">Present</option>
                                <option value="WEEKLY_OFF">Weekly Off</option>
                                <option value="ABSENT">Absent</option>
                                <option value="LEAVE">Leave</option>
                            </select>
                        </div>

                        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <button
                                onClick={exportLocationCsv}
                                disabled={locationRecords.length === 0}
                                style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '6px', 
                                    padding: '8px 16px', 
                                    borderRadius: '8px', 
                                    background: 'var(--color-bg, #f1f5f9)', 
                                    color: 'var(--color-text, #0f172a)', 
                                    border: '1px solid var(--color-border, #cbd5e1)', 
                                    fontWeight: 700, 
                                    fontSize: '0.88rem',
                                    cursor: locationRecords.length === 0 ? 'default' : 'pointer' 
                                }}
                            >
                                <i className='bx bx-export'></i> Export CSV
                            </button>
                        </div>
                    </div>

                    {/* Table View */}
                    <div style={{ background: 'var(--color-surface, #ffffff)', borderRadius: '12px', border: '1px solid var(--color-border, #e2e8f0)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                        {loadingLocation ? (
                            <div style={{ textAlign: 'center', padding: '60px', color: 'var(--color-text-muted, #64748b)' }}>
                                <i className='bx bx-loader-alt bx-spin' style={{ fontSize: '2.5rem', color: '#0284c7' }}></i>
                                <p style={{ marginTop: '10px', fontWeight: 600 }}>Loading location attendance records...</p>
                            </div>
                        ) : locationRecords.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--color-text-muted, #64748b)' }}>
                                <i className='bx bx-info-circle' style={{ fontSize: '2.5rem', color: '#94a3b8', marginBottom: '8px' }}></i>
                                <h3>No Attendance Records Found</h3>
                                <p>No attendance recorded for this location in the selected date range ({dateFrom} to {dateTo}).</p>
                            </div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', color: '#475569', borderBottom: '2px solid #cbd5e1' }}>
                                        <th style={{ padding: '12px 18px', fontWeight: 700 }}>Date</th>
                                        <th style={{ padding: '12px 18px', fontWeight: 700 }}>Employee Code</th>
                                        <th style={{ padding: '12px 18px', fontWeight: 700 }}>Guard Name</th>
                                        <th style={{ padding: '12px 18px', fontWeight: 700 }}>Designation</th>
                                        <th style={{ padding: '12px 18px', fontWeight: 700 }}>Status</th>
                                        <th style={{ padding: '12px 18px', fontWeight: 700 }}>Notes / Attribution</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {locationRecords.map((rec, i) => {
                                        const st = rec.status || 'PRESENT';
                                        let badgeBg = '#dcfce7';
                                        let badgeColor = '#15803d';
                                        let badgeBorder = '#bbf7d0';
                                        if (st === 'ABSENT') {
                                            badgeBg = '#fee2e2';
                                            badgeColor = '#b91c1c';
                                            badgeBorder = '#fecaca';
                                        } else if (st === 'WEEKLY_OFF') {
                                            badgeBg = '#f1f5f9';
                                            badgeColor = '#64748b';
                                            badgeBorder = '#e2e8f0';
                                        } else if (st === 'LEAVE') {
                                            badgeBg = '#f3e8ff';
                                            badgeColor = '#7e22ce';
                                            badgeBorder = '#d8b4fe';
                                        }

                                        return (
                                            <tr key={rec.id || i} style={{ borderBottom: '1px solid #e2e8f0', background: i % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                                                <td style={{ padding: '12px 18px', fontWeight: 700 }}>{rec.date}</td>
                                                <td style={{ padding: '12px 18px', color: '#0284c7', fontWeight: 800 }}>{rec.employee_code || rec.employee?.employee_code || '-'}</td>
                                                <td style={{ padding: '12px 18px', fontWeight: 700, color: 'var(--color-text, #0f172a)' }}>{rec.employee_name || `${rec.employee?.first_name || ''} ${rec.employee?.last_name || ''}`.trim()}</td>
                                                <td style={{ padding: '12px 18px', color: 'var(--color-text-muted, #64748b)' }}>{rec.designation_name || rec.employee?.designation?.name || 'Guard'}</td>
                                                <td style={{ padding: '12px 18px' }}>
                                                    <span style={{ padding: '3px 10px', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 800, background: badgeBg, color: badgeColor, border: `1px solid ${badgeBorder}` }}>
                                                        {st}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '12px 18px', color: 'var(--color-text, #0f172a)' }}>{rec.notes || '-'}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {/* TAB 2: GUARD OVERTIME & DUTY LEDGER */}
            {activeSubTab === 'guard_ledger' && (
                <div>
                    {/* Guard & Month Selector */}
                    <div style={{ 
                        display: 'flex', 
                        flexWrap: 'wrap', 
                        alignItems: 'center', 
                        gap: '16px', 
                        background: 'var(--color-surface, #ffffff)', 
                        padding: '16px 20px', 
                        borderRadius: '10px', 
                        border: '1px solid var(--color-border, #e2e8f0)', 
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                        marginBottom: '20px' 
                    }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '320px' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #64748b)', fontWeight: 700 }}>Select Guard / Employee:</label>
                            <select
                                value={selectedEmployeeId}
                                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                                style={{ 
                                    padding: '8px 12px', 
                                    borderRadius: '8px', 
                                    background: 'var(--color-surface, #ffffff)', 
                                    color: 'var(--color-text, #0f172a)', 
                                    border: '1px solid var(--color-border, #cbd5e1)', 
                                    fontWeight: 600,
                                    fontSize: '0.88rem'
                                }}
                            >
                                {allEmployees.map(emp => (
                                    <option key={emp.id} value={emp.id}>
                                        {emp.first_name} {emp.last_name} (Code: {emp.employee_code || 'N/A'}) - {emp.designation_name || emp.designation?.name || 'Guard'}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #64748b)', fontWeight: 700 }}>Month:</label>
                            <select 
                                value={ledgerMonth} 
                                onChange={(e) => setLedgerMonth(Number(e.target.value))}
                                style={{ 
                                    padding: '8px 12px', 
                                    borderRadius: '8px', 
                                    background: 'var(--color-surface, #ffffff)', 
                                    color: 'var(--color-text, #0f172a)', 
                                    border: '1px solid var(--color-border, #cbd5e1)', 
                                    fontWeight: 600,
                                    fontSize: '0.88rem'
                                }}
                            >
                                <option value={1}>January</option>
                                <option value={2}>February</option>
                                <option value={3}>March</option>
                                <option value={4}>April</option>
                                <option value={5}>May</option>
                                <option value={6}>June</option>
                                <option value={7}>July</option>
                                <option value={8}>August</option>
                                <option value={9}>September</option>
                                <option value={10}>October</option>
                                <option value={11}>November</option>
                                <option value={12}>December</option>
                            </select>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #64748b)', fontWeight: 700 }}>Year:</label>
                            <select 
                                value={ledgerYear} 
                                onChange={(e) => setLedgerYear(Number(e.target.value))}
                                style={{ 
                                    padding: '8px 12px', 
                                    borderRadius: '8px', 
                                    background: 'var(--color-surface, #ffffff)', 
                                    color: 'var(--color-text, #0f172a)', 
                                    border: '1px solid var(--color-border, #cbd5e1)', 
                                    fontWeight: 600,
                                    fontSize: '0.88rem'
                                }}
                            >
                                <option value={2025}>2025</option>
                                <option value={2026}>2026</option>
                                <option value={2027}>2027</option>
                            </select>
                        </div>

                        <div style={{ marginLeft: 'auto' }}>
                            <button
                                onClick={exportGuardLedgerCsv}
                                disabled={!guardLedger || guardLedger.records.length === 0}
                                style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '6px', 
                                    padding: '8px 16px', 
                                    borderRadius: '8px', 
                                    background: 'var(--color-bg, #f1f5f9)', 
                                    color: 'var(--color-text, #0f172a)', 
                                    border: '1px solid var(--color-border, #cbd5e1)', 
                                    fontWeight: 700, 
                                    fontSize: '0.88rem',
                                    cursor: !guardLedger || guardLedger.records.length === 0 ? 'default' : 'pointer' 
                                }}
                            >
                                <i className='bx bx-export'></i> Export Ledger CSV
                            </button>
                        </div>
                    </div>

                    {/* Summary KPI Cards */}
                    {guardLedger && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                            <div style={{ background: 'var(--color-surface, #ffffff)', padding: '18px 20px', borderRadius: '10px', border: '1px solid var(--color-border, #e2e8f0)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #64748b)', fontWeight: 700, marginBottom: '4px' }}>Total Days Worked</div>
                                <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#15803d' }}>{guardLedger.total_days_worked} Days</div>
                            </div>

                            <div style={{ background: 'var(--color-surface, #ffffff)', padding: '18px 20px', borderRadius: '10px', border: '1px solid var(--color-border, #e2e8f0)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #64748b)', fontWeight: 700, marginBottom: '4px' }}>Overtime Shifts (OT)</div>
                                <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#1d4ed8' }}>{guardLedger.total_ot_shifts} Shifts</div>
                            </div>

                            <div style={{ background: 'var(--color-surface, #ffffff)', padding: '18px 20px', borderRadius: '10px', border: '1px solid var(--color-border, #e2e8f0)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #64748b)', fontWeight: 700, marginBottom: '4px' }}>Double Shifts (WO+OT)</div>
                                <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#b45309' }}>{guardLedger.total_double_shifts} Shifts</div>
                            </div>

                            <div style={{ background: 'var(--color-surface, #ffffff)', padding: '18px 20px', borderRadius: '10px', border: '1px solid var(--color-border, #e2e8f0)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #64748b)', fontWeight: 700, marginBottom: '4px' }}>Total Duty Pay Earned</div>
                                <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#047857' }}>PKR {guardLedger.total_earned_pkr.toLocaleString()}</div>
                            </div>
                        </div>
                    )}

                    {/* Detailed Ledger Table */}
                    <div style={{ background: 'var(--color-surface, #ffffff)', borderRadius: '12px', border: '1px solid var(--color-border, #e2e8f0)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                        {loadingLedger ? (
                            <div style={{ textAlign: 'center', padding: '60px', color: 'var(--color-text-muted, #64748b)' }}>
                                <i className='bx bx-loader-alt bx-spin' style={{ fontSize: '2.5rem', color: '#0284c7' }}></i>
                                <p style={{ marginTop: '10px', fontWeight: 600 }}>Loading guard duty and overtime ledger...</p>
                            </div>
                        ) : !guardLedger || guardLedger.records.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--color-text-muted, #64748b)' }}>
                                <i className='bx bx-info-circle' style={{ fontSize: '2.5rem', color: '#94a3b8', marginBottom: '8px' }}></i>
                                <h3>No Duty Records Found</h3>
                                <p>No duty records recorded for this guard in {ledgerMonth}/{ledgerYear}.</p>
                            </div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', color: '#475569', borderBottom: '2px solid #cbd5e1' }}>
                                        <th style={{ padding: '12px 18px', fontWeight: 700 }}>Date</th>
                                        <th style={{ padding: '12px 18px', fontWeight: 700 }}>Operational Location</th>
                                        <th style={{ padding: '12px 18px', fontWeight: 700 }}>Client</th>
                                        <th style={{ padding: '12px 18px', fontWeight: 700 }}>Duty Type</th>
                                        <th style={{ padding: '12px 18px', fontWeight: 700 }}>Earned Amount</th>
                                        <th style={{ padding: '12px 18px', fontWeight: 700 }}>Attribution Notes</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {guardLedger.records.map((r: any, idx: number) => {
                                        let badgeBg = '#dcfce7';
                                        let badgeColor = '#15803d';
                                        let badgeBorder = '#bbf7d0';
                                        if (r.duty_type === 'OVERTIME') {
                                            badgeBg = '#dbeafe';
                                            badgeColor = '#1d4ed8';
                                            badgeBorder = '#bfdbfe';
                                        } else if (r.duty_type === 'DOUBLE_SHIFT') {
                                            badgeBg = '#fef3c7';
                                            badgeColor = '#b45309';
                                            badgeBorder = '#fde68a';
                                        } else if (r.duty_type === 'WEEKLY_OFF') {
                                            badgeBg = '#f1f5f9';
                                            badgeColor = '#64748b';
                                            badgeBorder = '#e2e8f0';
                                        } else if (r.duty_type === 'ABSENT') {
                                            badgeBg = '#fee2e2';
                                            badgeColor = '#b91c1c';
                                            badgeBorder = '#fecaca';
                                        }

                                        return (
                                            <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                                                <td style={{ padding: '12px 18px', fontWeight: 700 }}>{r.date}</td>
                                                <td style={{ padding: '12px 18px', fontWeight: 800, color: 'var(--color-text, #0f172a)' }}>{r.site_name}</td>
                                                <td style={{ padding: '12px 18px', color: 'var(--color-text-muted, #64748b)' }}>{r.customer_name || '-'}</td>
                                                <td style={{ padding: '12px 18px' }}>
                                                    <span style={{ padding: '3px 10px', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 800, background: badgeBg, color: badgeColor, border: `1px solid ${badgeBorder}` }}>
                                                        {r.duty_type}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '12px 18px', fontWeight: 800, color: r.amount > 0 ? '#15803d' : '#94a3b8' }}>
                                                    {r.amount > 0 ? `PKR ${r.amount.toLocaleString()}` : '-'}
                                                </td>
                                                <td style={{ padding: '12px 18px', color: 'var(--color-text, #0f172a)' }}>{r.notes || '-'}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
