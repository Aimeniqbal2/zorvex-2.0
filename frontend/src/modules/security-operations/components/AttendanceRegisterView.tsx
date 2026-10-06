import React, { useState, useEffect } from 'react';
import { getOperationalSites, getGuardAttendanceLedger, apiClient } from '../api';
import { useToastStore } from '../../../stores/toastStore';

export const AttendanceRegisterView: React.FC = () => {
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
        <div className="attendance-register-workspace" style={{ padding: '20px', background: 'var(--color-bg, #0f172a)', minHeight: '100vh', color: 'var(--color-text, #f8fafc)' }}>
            
            {/* Header and Mode Selector */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', background: 'var(--color-surface, #1e293b)', padding: '16px 20px', borderRadius: '12px', border: '1px solid #334155', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <i className='bx bx-history' style={{ fontSize: '1.6rem', color: '#38bdf8' }}></i>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Attendance Register & Duty Ledger</h2>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>Inspect historical site attendance records or drill into individual guard cross-location overtime logs.</p>
                    </div>
                </div>

                <div style={{ display: 'flex', background: '#0f172a', padding: '4px', borderRadius: '8px', border: '1px solid #334155' }}>
                    <button
                        onClick={() => setActiveSubTab('location')}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '6px',
                            border: 'none',
                            background: activeSubTab === 'location' ? '#0284c7' : 'transparent',
                            color: activeSubTab === 'location' ? '#fff' : '#94a3b8',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <i className='bx bx-building'></i> By Location Daily Register
                    </button>
                    <button
                        onClick={() => setActiveSubTab('guard_ledger')}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '6px',
                            border: 'none',
                            background: activeSubTab === 'guard_ledger' ? '#0284c7' : 'transparent',
                            color: activeSubTab === 'guard_ledger' ? '#fff' : '#94a3b8',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <i className='bx bx-user-pin'></i> By Guard Overtime & Duty Ledger
                    </button>
                </div>
            </div>

            {/* TAB 1: LOCATION DAILY REGISTER */}
            {activeSubTab === 'location' && (
                <div>
                    {/* Filter Bar */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '14px', background: 'var(--color-surface, #1e293b)', padding: '16px', borderRadius: '10px', border: '1px solid #334155', marginBottom: '20px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '240px' }}>
                            <label style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>Operational Site:</label>
                            <select
                                value={selectedSiteId}
                                onChange={(e) => setSelectedSiteId(e.target.value)}
                                style={{ padding: '8px 12px', borderRadius: '8px', background: '#0f172a', color: '#fff', border: '1px solid #475569', fontWeight: 600 }}
                            >
                                {sites.map(s => (
                                    <option key={s.id} value={s.id}>{s.name} ({s.crm_entity?.name || 'Direct'})</option>
                                ))}
                            </select>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>From Date:</label>
                            <input
                                type="date"
                                value={dateFrom}
                                onChange={(e) => setDateFrom(e.target.value)}
                                style={{ padding: '7px 10px', borderRadius: '8px', background: '#0f172a', color: '#fff', border: '1px solid #475569' }}
                            />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>To Date:</label>
                            <input
                                type="date"
                                value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)}
                                style={{ padding: '7px 10px', borderRadius: '8px', background: '#0f172a', color: '#fff', border: '1px solid #475569' }}
                            />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '150px' }}>
                            <label style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>Status Filter:</label>
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                style={{ padding: '8px 12px', borderRadius: '8px', background: '#0f172a', color: '#fff', border: '1px solid #475569' }}
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
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', background: '#334155', color: '#fff', border: '1px solid #475569', fontWeight: 600, cursor: 'pointer' }}
                            >
                                <i className='bx bx-export'></i> Export CSV
                            </button>
                        </div>
                    </div>

                    {/* Table View */}
                    <div style={{ background: 'var(--color-surface, #1e293b)', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden' }}>
                        {loadingLocation ? (
                            <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
                                <i className='bx bx-loader-alt bx-spin' style={{ fontSize: '2rem', color: '#38bdf8' }}></i>
                                <p>Loading location attendance records...</p>
                            </div>
                        ) : locationRecords.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                                No attendance records found for this location in the selected date range.
                            </div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ background: '#0f172a', color: '#94a3b8', borderBottom: '1px solid #334155' }}>
                                        <th style={{ padding: '12px 16px' }}>Date</th>
                                        <th style={{ padding: '12px 16px' }}>Employee Code</th>
                                        <th style={{ padding: '12px 16px' }}>Guard Name</th>
                                        <th style={{ padding: '12px 16px' }}>Designation</th>
                                        <th style={{ padding: '12px 16px' }}>Status</th>
                                        <th style={{ padding: '12px 16px' }}>Notes / Attribution</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {locationRecords.map((rec, i) => {
                                        const st = rec.status || 'PRESENT';
                                        let badgeBg = 'rgba(16, 185, 129, 0.2)';
                                        let badgeColor = '#10b981';
                                        if (st === 'ABSENT') {
                                            badgeBg = 'rgba(239, 68, 68, 0.2)';
                                            badgeColor = '#ef4444';
                                        } else if (st === 'WEEKLY_OFF') {
                                            badgeBg = 'rgba(100, 116, 139, 0.2)';
                                            badgeColor = '#94a3b8';
                                        } else if (st === 'LEAVE') {
                                            badgeBg = 'rgba(168, 85, 247, 0.2)';
                                            badgeColor = '#c084fc';
                                        }

                                        return (
                                            <tr key={rec.id || i} style={{ borderBottom: '1px solid #334155', background: i % 2 === 0 ? 'rgba(30, 41, 59, 0.4)' : 'transparent' }}>
                                                <td style={{ padding: '10px 16px', fontWeight: 600 }}>{rec.date}</td>
                                                <td style={{ padding: '10px 16px', color: '#38bdf8', fontWeight: 700 }}>{rec.employee_code || rec.employee?.employee_code || '-'}</td>
                                                <td style={{ padding: '10px 16px', fontWeight: 600 }}>{rec.employee_name || `${rec.employee?.first_name || ''} ${rec.employee?.last_name || ''}`.trim()}</td>
                                                <td style={{ padding: '10px 16px', color: '#94a3b8' }}>{rec.designation_name || rec.employee?.designation?.name || 'Guard'}</td>
                                                <td style={{ padding: '10px 16px' }}>
                                                    <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 700, background: badgeBg, color: badgeColor }}>
                                                        {st}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '10px 16px', color: '#cbd5e1' }}>{rec.notes || '-'}</td>
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
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px', background: 'var(--color-surface, #1e293b)', padding: '16px', borderRadius: '10px', border: '1px solid #334155', marginBottom: '20px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '300px' }}>
                            <label style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>Select Employee / Guard:</label>
                            <select
                                value={selectedEmployeeId}
                                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                                style={{ padding: '8px 12px', borderRadius: '8px', background: '#0f172a', color: '#fff', border: '1px solid #475569', fontWeight: 600 }}
                            >
                                {allEmployees.map(emp => (
                                    <option key={emp.id} value={emp.id}>
                                        {emp.first_name} {emp.last_name} (Code: {emp.employee_code || 'N/A'}) - {emp.designation_name || emp.designation?.name || 'Guard'}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>Month:</label>
                            <select 
                                value={ledgerMonth} 
                                onChange={(e) => setLedgerMonth(Number(e.target.value))}
                                style={{ padding: '8px 12px', borderRadius: '8px', background: '#0f172a', color: '#fff', border: '1px solid #475569', fontWeight: 600 }}
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
                            <label style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>Year:</label>
                            <select 
                                value={ledgerYear} 
                                onChange={(e) => setLedgerYear(Number(e.target.value))}
                                style={{ padding: '8px 12px', borderRadius: '8px', background: '#0f172a', color: '#fff', border: '1px solid #475569', fontWeight: 600 }}
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
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', background: '#334155', color: '#fff', border: '1px solid #475569', fontWeight: 600, cursor: 'pointer' }}
                            >
                                <i className='bx bx-export'></i> Export Ledger CSV
                            </button>
                        </div>
                    </div>

                    {/* Summary KPI Cards */}
                    {guardLedger && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '20px' }}>
                            <div style={{ background: 'var(--color-surface, #1e293b)', padding: '16px', borderRadius: '10px', border: '1px solid #334155' }}>
                                <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Total Days Worked</div>
                                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#10b981' }}>{guardLedger.total_days_worked} Days</div>
                            </div>

                            <div style={{ background: 'var(--color-surface, #1e293b)', padding: '16px', borderRadius: '10px', border: '1px solid #334155' }}>
                                <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Overtime Shifts (OT)</div>
                                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#3b82f6' }}>{guardLedger.total_ot_shifts} Shifts</div>
                            </div>

                            <div style={{ background: 'var(--color-surface, #1e293b)', padding: '16px', borderRadius: '10px', border: '1px solid #334155' }}>
                                <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Double Shifts (WO+OT)</div>
                                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f59e0b' }}>{guardLedger.total_double_shifts} Shifts</div>
                            </div>

                            <div style={{ background: 'var(--color-surface, #1e293b)', padding: '16px', borderRadius: '10px', border: '1px solid #334155' }}>
                                <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Total Duty Pay Earned</div>
                                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#22c55e' }}>PKR {guardLedger.total_earned_pkr.toLocaleString()}</div>
                            </div>
                        </div>
                    )}

                    {/* Detailed Ledger Table */}
                    <div style={{ background: 'var(--color-surface, #1e293b)', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden' }}>
                        {loadingLedger ? (
                            <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
                                <i className='bx bx-loader-alt bx-spin' style={{ fontSize: '2rem', color: '#38bdf8' }}></i>
                                <p>Loading guard duty and overtime ledger...</p>
                            </div>
                        ) : !guardLedger || guardLedger.records.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                                No duty records found for this guard in the selected month.
                            </div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ background: '#0f172a', color: '#94a3b8', borderBottom: '1px solid #334155' }}>
                                        <th style={{ padding: '12px 16px' }}>Date</th>
                                        <th style={{ padding: '12px 16px' }}>Operational Location</th>
                                        <th style={{ padding: '12px 16px' }}>Client</th>
                                        <th style={{ padding: '12px 16px' }}>Duty Type</th>
                                        <th style={{ padding: '12px 16px' }}>Earned Amount</th>
                                        <th style={{ padding: '12px 16px' }}>Attribution Notes</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {guardLedger.records.map((r: any, idx: number) => {
                                        let badgeBg = 'rgba(16, 185, 129, 0.2)';
                                        let badgeColor = '#10b981';
                                        if (r.duty_type === 'OVERTIME') {
                                            badgeBg = 'rgba(59, 130, 246, 0.2)';
                                            badgeColor = '#3b82f6';
                                        } else if (r.duty_type === 'DOUBLE_SHIFT') {
                                            badgeBg = 'rgba(245, 158, 11, 0.2)';
                                            badgeColor = '#fbbf24';
                                        } else if (r.duty_type === 'WEEKLY_OFF') {
                                            badgeBg = 'rgba(100, 116, 139, 0.2)';
                                            badgeColor = '#94a3b8';
                                        } else if (r.duty_type === 'ABSENT') {
                                            badgeBg = 'rgba(239, 68, 68, 0.2)';
                                            badgeColor = '#ef4444';
                                        }

                                        return (
                                            <tr key={idx} style={{ borderBottom: '1px solid #334155', background: idx % 2 === 0 ? 'rgba(30, 41, 59, 0.4)' : 'transparent' }}>
                                                <td style={{ padding: '10px 16px', fontWeight: 600 }}>{r.date}</td>
                                                <td style={{ padding: '10px 16px', fontWeight: 700, color: '#fff' }}>{r.site_name}</td>
                                                <td style={{ padding: '10px 16px', color: '#94a3b8' }}>{r.customer_name || '-'}</td>
                                                <td style={{ padding: '10px 16px' }}>
                                                    <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 700, background: badgeBg, color: badgeColor }}>
                                                        {r.duty_type}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '10px 16px', fontWeight: 700, color: r.amount > 0 ? '#10b981' : '#64748b' }}>
                                                    {r.amount > 0 ? `PKR ${r.amount.toLocaleString()}` : '-'}
                                                </td>
                                                <td style={{ padding: '10px 16px', color: '#cbd5e1' }}>{r.notes || '-'}</td>
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
