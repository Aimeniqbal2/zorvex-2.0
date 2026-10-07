import React, { useState, useEffect, useMemo } from 'react';
import { getOperationalSites, getGuardAttendanceLedger, apiClient } from '../api';
import { useToastStore } from '../../../stores/toastStore';

interface AttendanceRegisterViewProps {
    onBack?: () => void;
}

export const AttendanceRegisterView: React.FC<AttendanceRegisterViewProps> = ({ onBack }) => {
    const { addToast } = useToastStore();
    
    // Timezone-safe local date formatting (prevents UTC offset date-shift rollbacks)
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const localToday = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const localFirstOfMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;

    const [activeSubTab, setActiveSubTab] = useState<'location' | 'guard_ledger'>('location');

    // SubTab 1: Location Register State
    const [sites, setSites] = useState<any[]>([]);
    const [siteSearch, setSiteSearch] = useState<string>('');
    const [selectedSiteId, setSelectedSiteId] = useState<string>('');
    const [dateFrom, setDateFrom] = useState<string>(localFirstOfMonth);
    const [dateTo, setDateTo] = useState<string>(localToday);
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [recordSearch, setRecordSearch] = useState<string>('');
    const [locationRecords, setLocationRecords] = useState<any[]>([]);
    const [loadingLocation, setLoadingLocation] = useState<boolean>(false);

    // SubTab 2: Guard Duty Ledger State
    const [allEmployees, setAllEmployees] = useState<any[]>([]);
    const [employeeSearch, setEmployeeSearch] = useState<string>('');
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
    const [ledgerYear, setLedgerYear] = useState<number>(now.getFullYear());
    const [ledgerMonth, setLedgerMonth] = useState<number>(now.getMonth() + 1);
    const [guardLedger, setGuardLedger] = useState<any | null>(null);
    const [loadingLedger, setLoadingLedger] = useState<boolean>(false);

    // Decoupled preloading for Sites and Employees
    useEffect(() => {
        let isMounted = true;

        const loadSites = async () => {
            try {
                const sitesRes = await getOperationalSites({ page_size: 500 });
                const siteList = sitesRes.results || sitesRes || [];
                if (isMounted) {
                    setSites(siteList);
                    if (siteList.length > 0) {
                        // Default to site with "ahmer" in name if available, otherwise first site
                        const defaultSite = siteList.find((s: any) => 
                            (s.name || '').toLowerCase().includes('ahmer')
                        ) || siteList[0];
                        setSelectedSiteId(String(defaultSite.id));
                    }
                }
            } catch (err) {
                console.error('Failed to load operational sites:', err);
                addToast('error', 'Failed to load operational sites.');
            }
        };

        const loadEmployees = async () => {
            try {
                const empsRes = await apiClient.get('/api/hrm/employees/?page_size=1000&status=ACTIVE');
                const empList = empsRes.data?.results || empsRes.data || [];
                if (isMounted) {
                    setAllEmployees(empList);
                    if (empList.length > 0) {
                        setSelectedEmployeeId(String(empList[0].id));
                    }
                }
            } catch (err) {
                console.error('Failed to load active employee workforce:', err);
            }
        };

        loadSites();
        loadEmployees();

        return () => {
            isMounted = false;
        };
    }, []);

    // Filter sites by search
    const filteredSites = useMemo(() => {
        if (!siteSearch.trim()) return sites;
        const q = siteSearch.toLowerCase();
        return sites.filter(s => 
            (s.name && s.name.toLowerCase().includes(q)) ||
            (s.crm_entity?.name && s.crm_entity.name.toLowerCase().includes(q)) ||
            (s.code && s.code.toLowerCase().includes(q))
        );
    }, [sites, siteSearch]);

    // Filter employees by search
    const filteredEmployees = useMemo(() => {
        if (!employeeSearch.trim()) return allEmployees;
        const q = employeeSearch.toLowerCase();
        return allEmployees.filter(emp => {
            const fullName = `${emp.first_name || ''} ${emp.last_name || ''}`.toLowerCase();
            const code = (emp.employee_code || '').toLowerCase();
            const desig = (emp.designation_name || emp.designation?.name || '').toLowerCase();
            return fullName.includes(q) || code.includes(q) || desig.includes(q);
        });
    }, [allEmployees, employeeSearch]);

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

    // Filter records by client search
    const displayedRecords = useMemo(() => {
        if (!recordSearch.trim()) return locationRecords;
        const q = recordSearch.toLowerCase();
        return locationRecords.filter(rec => {
            const name = (rec.employee_name || `${rec.employee?.first_name || ''} ${rec.employee?.last_name || ''}`).toLowerCase();
            const code = (rec.employee_code || rec.employee?.employee_code || '').toLowerCase();
            const desig = (rec.designation_name || rec.employee?.designation?.name || '').toLowerCase();
            return name.includes(q) || code.includes(q) || desig.includes(q);
        });
    }, [locationRecords, recordSearch]);

    // Location stats
    const locationStats = useMemo(() => {
        let presentCount = 0;
        let absentCount = 0;
        let leaveCount = 0;
        let weeklyOffCount = 0;
        let totalPayable = 0;

        locationRecords.forEach(r => {
            const st = (r.status || 'PRESENT').toUpperCase();
            if (st === 'PRESENT' || st === 'DUTY') presentCount++;
            else if (st === 'ABSENT') absentCount++;
            else if (st === 'LEAVE') leaveCount++;
            else if (st === 'WEEKLY_OFF' || st === 'OFF') weeklyOffCount++;

            if (r.payable_amount) totalPayable += Number(r.payable_amount);
        });

        return {
            total: locationRecords.length,
            present: presentCount,
            absent: absentCount,
            leave: leaveCount,
            weeklyOff: weeklyOffCount,
            totalPayable
        };
    }, [locationRecords]);

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
        const rows = displayedRecords.map(r => [
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
        const rows = (guardLedger.records || []).map((r: any) => [
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

    const selectedSiteObj = sites.find(s => String(s.id) === String(selectedSiteId));

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
                        alignItems: 'flex-end', 
                        gap: '14px', 
                        background: 'var(--color-surface, #ffffff)', 
                        padding: '16px 20px', 
                        borderRadius: '10px', 
                        border: '1px solid var(--color-border, #e2e8f0)', 
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                        marginBottom: '16px' 
                    }}>
                        {/* Site Filter with quick search */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '260px', flex: '1 1 260px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #64748b)', fontWeight: 700 }}>Operational Site:</label>
                                <span style={{ fontSize: '0.72rem', color: '#0284c7', fontWeight: 600 }}>{filteredSites.length} sites</span>
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                                <select
                                    value={selectedSiteId}
                                    onChange={(e) => setSelectedSiteId(e.target.value)}
                                    style={{ 
                                        flex: 1,
                                        padding: '8px 12px', 
                                        borderRadius: '8px', 
                                        background: 'var(--color-surface, #ffffff)', 
                                        color: 'var(--color-text, #0f172a)', 
                                        border: '1px solid var(--color-border, #cbd5e1)', 
                                        fontWeight: 600,
                                        fontSize: '0.88rem'
                                    }}
                                >
                                    {filteredSites.length === 0 ? (
                                        <option value="">No sites matching search</option>
                                    ) : (
                                        filteredSites.map(s => (
                                            <option key={s.id} value={s.id}>
                                                {s.name} ({s.crm_entity?.name || 'Direct'})
                                            </option>
                                        ))
                                    )}
                                </select>
                            </div>
                            <input
                                type="text"
                                placeholder="🔍 Filter site list..."
                                value={siteSearch}
                                onChange={(e) => setSiteSearch(e.target.value)}
                                style={{
                                    padding: '5px 8px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--color-border, #cbd5e1)',
                                    fontSize: '0.76rem',
                                    background: 'var(--color-bg, #f8fafc)',
                                    color: 'var(--color-text, #0f172a)'
                                }}
                            />
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
                                    fontSize: '0.88rem',
                                    fontWeight: 600
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
                                    fontSize: '0.88rem',
                                    fontWeight: 600
                                }}
                            />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '150px' }}>
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

                        {/* Search in records */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '200px' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #64748b)', fontWeight: 700 }}>Search Guard:</label>
                            <input
                                type="text"
                                placeholder="Guard name or code..."
                                value={recordSearch}
                                onChange={(e) => setRecordSearch(e.target.value)}
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

                        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <button
                                onClick={fetchLocationAttendance}
                                title="Refresh"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '8px 14px',
                                    borderRadius: '8px',
                                    background: 'var(--color-bg, #f1f5f9)',
                                    color: 'var(--color-text, #0f172a)',
                                    border: '1px solid var(--color-border, #cbd5e1)',
                                    fontWeight: 700,
                                    fontSize: '0.88rem',
                                    cursor: 'pointer'
                                }}
                            >
                                <i className={`bx bx-refresh ${loadingLocation ? 'bx-spin' : ''}`}></i>
                            </button>
                            <button
                                onClick={exportLocationCsv}
                                disabled={displayedRecords.length === 0}
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
                                    cursor: displayedRecords.length === 0 ? 'default' : 'pointer' 
                                }}
                            >
                                <i className='bx bx-export'></i> Export CSV
                            </button>
                        </div>
                    </div>

                    {/* Stats Summary Bar */}
                    <div style={{ 
                        display: 'flex', 
                        flexWrap: 'wrap', 
                        gap: '12px', 
                        marginBottom: '16px' 
                    }}>
                        <div style={{ background: 'var(--color-surface, #ffffff)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--color-border, #e2e8f0)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#0284c7' }} />
                            <div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted, #64748b)', fontWeight: 700 }}>TOTAL ENTRIES</div>
                                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#0284c7' }}>{locationStats.total}</div>
                            </div>
                        </div>

                        <div style={{ background: 'var(--color-surface, #ffffff)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--color-border, #e2e8f0)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#15803d' }} />
                            <div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted, #64748b)', fontWeight: 700 }}>PRESENT / DUTY</div>
                                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#15803d' }}>{locationStats.present}</div>
                            </div>
                        </div>

                        <div style={{ background: 'var(--color-surface, #ffffff)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--color-border, #e2e8f0)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#64748b' }} />
                            <div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted, #64748b)', fontWeight: 700 }}>WEEKLY OFF</div>
                                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#64748b' }}>{locationStats.weeklyOff}</div>
                            </div>
                        </div>

                        <div style={{ background: 'var(--color-surface, #ffffff)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--color-border, #e2e8f0)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#b91c1c' }} />
                            <div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted, #64748b)', fontWeight: 700 }}>ABSENT</div>
                                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#b91c1c' }}>{locationStats.absent}</div>
                            </div>
                        </div>

                        {locationStats.totalPayable > 0 && (
                            <div style={{ background: 'var(--color-surface, #ffffff)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--color-border, #e2e8f0)', display: 'flex', alignItems: 'center', gap: '10px', marginLeft: 'auto' }}>
                                <i className='bx bx-wallet' style={{ fontSize: '1.3rem', color: '#047857' }} />
                                <div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted, #64748b)', fontWeight: 700 }}>TOTAL DISBURSED DUTY PAY</div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#047857' }}>PKR {locationStats.totalPayable.toLocaleString()}</div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Table View */}
                    <div style={{ background: 'var(--color-surface, #ffffff)', borderRadius: '12px', border: '1px solid var(--color-border, #e2e8f0)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                        {loadingLocation ? (
                            <div style={{ textAlign: 'center', padding: '60px', color: 'var(--color-text-muted, #64748b)' }}>
                                <i className='bx bx-loader-alt bx-spin' style={{ fontSize: '2.5rem', color: '#0284c7' }}></i>
                                <p style={{ marginTop: '10px', fontWeight: 600 }}>Loading location attendance records...</p>
                            </div>
                        ) : displayedRecords.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--color-text-muted, #64748b)' }}>
                                <i className='bx bx-info-circle' style={{ fontSize: '2.5rem', color: '#94a3b8', marginBottom: '8px' }}></i>
                                <h3 style={{ margin: '4px 0', fontWeight: 800 }}>No Attendance Records Found</h3>
                                <p style={{ color: 'var(--color-text-muted, #64748b)', margin: 0 }}>
                                    {selectedSiteObj ? `No records found for ${selectedSiteObj.name} in date range (${dateFrom} to ${dateTo}).` : 'Please select an operational site.'}
                                </p>
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
                                        <th style={{ padding: '12px 18px', fontWeight: 700 }}>Payable Amount</th>
                                        <th style={{ padding: '12px 18px', fontWeight: 700 }}>Notes / Attribution</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {displayedRecords.map((rec, i) => {
                                        const st = (rec.status || 'PRESENT').toUpperCase();
                                        let badgeBg = '#dcfce7';
                                        let badgeColor = '#15803d';
                                        let badgeBorder = '#bbf7d0';
                                        if (st === 'ABSENT') {
                                            badgeBg = '#fee2e2';
                                            badgeColor = '#b91c1c';
                                            badgeBorder = '#fecaca';
                                        } else if (st === 'WEEKLY_OFF' || st === 'OFF') {
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
                                                <td style={{ padding: '12px 18px', fontWeight: 700, color: rec.payable_amount ? '#15803d' : 'var(--color-text-muted, #64748b)' }}>
                                                    {rec.payable_amount ? `PKR ${Number(rec.payable_amount).toLocaleString()}` : '-'}
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
                        alignItems: 'flex-end', 
                        gap: '16px', 
                        background: 'var(--color-surface, #ffffff)', 
                        padding: '16px 20px', 
                        borderRadius: '10px', 
                        border: '1px solid var(--color-border, #e2e8f0)', 
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                        marginBottom: '20px' 
                    }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '320px', flex: '1 1 320px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #64748b)', fontWeight: 700 }}>Select Guard / Employee:</label>
                                <span style={{ fontSize: '0.72rem', color: '#0284c7', fontWeight: 600 }}>{filteredEmployees.length} guards</span>
                            </div>
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
                                {filteredEmployees.length === 0 ? (
                                    <option value="">No guards found matching search</option>
                                ) : (
                                    filteredEmployees.map(emp => (
                                        <option key={emp.id} value={emp.id}>
                                            {emp.first_name} {emp.last_name || ''} ({emp.employee_code || 'N/A'}) — {emp.designation_name || emp.designation?.name || 'Guard'}
                                        </option>
                                    ))
                                )}
                            </select>
                            <input
                                type="text"
                                placeholder="🔍 Filter guard by name or code..."
                                value={employeeSearch}
                                onChange={(e) => setEmployeeSearch(e.target.value)}
                                style={{
                                    padding: '5px 8px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--color-border, #cbd5e1)',
                                    fontSize: '0.76rem',
                                    background: 'var(--color-bg, #f8fafc)',
                                    color: 'var(--color-text, #0f172a)'
                                }}
                            />
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

                        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <button
                                onClick={fetchGuardLedger}
                                title="Refresh"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '8px 14px',
                                    borderRadius: '8px',
                                    background: 'var(--color-bg, #f1f5f9)',
                                    color: 'var(--color-text, #0f172a)',
                                    border: '1px solid var(--color-border, #cbd5e1)',
                                    fontWeight: 700,
                                    fontSize: '0.88rem',
                                    cursor: 'pointer'
                                }}
                            >
                                <i className={`bx bx-refresh ${loadingLedger ? 'bx-spin' : ''}`}></i>
                            </button>
                            <button
                                onClick={exportGuardLedgerCsv}
                                disabled={!guardLedger || (guardLedger.records || []).length === 0}
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
                                    cursor: !guardLedger || (guardLedger.records || []).length === 0 ? 'default' : 'pointer' 
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
                                <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#15803d' }}>{guardLedger.total_days_worked || 0} Days</div>
                            </div>

                            <div style={{ background: 'var(--color-surface, #ffffff)', padding: '18px 20px', borderRadius: '10px', border: '1px solid var(--color-border, #e2e8f0)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #64748b)', fontWeight: 700, marginBottom: '4px' }}>Overtime Shifts (OT)</div>
                                <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#1d4ed8' }}>{guardLedger.total_ot_shifts || 0} Shifts</div>
                            </div>

                            <div style={{ background: 'var(--color-surface, #ffffff)', padding: '18px 20px', borderRadius: '10px', border: '1px solid var(--color-border, #e2e8f0)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #64748b)', fontWeight: 700, marginBottom: '4px' }}>Double Shifts (WO+OT)</div>
                                <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#b45309' }}>{guardLedger.total_double_shifts || 0} Shifts</div>
                            </div>

                            <div style={{ background: 'var(--color-surface, #ffffff)', padding: '18px 20px', borderRadius: '10px', border: '1px solid var(--color-border, #e2e8f0)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #64748b)', fontWeight: 700, marginBottom: '4px' }}>Total Duty Pay Earned</div>
                                <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#047857' }}>PKR {(guardLedger.total_earned_pkr || 0).toLocaleString()}</div>
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
                        ) : !guardLedger || (guardLedger.records || []).length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--color-text-muted, #64748b)' }}>
                                <i className='bx bx-info-circle' style={{ fontSize: '2.5rem', color: '#94a3b8', marginBottom: '8px' }}></i>
                                <h3 style={{ margin: '4px 0', fontWeight: 800 }}>No Duty Records Found</h3>
                                <p style={{ color: 'var(--color-text-muted, #64748b)', margin: 0 }}>No duty records recorded for this guard in {ledgerMonth}/{ledgerYear}.</p>
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
                                    {(guardLedger.records || []).map((r: any, idx: number) => {
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
                                                    {r.amount > 0 ? `PKR ${Number(r.amount).toLocaleString()}` : '-'}
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
