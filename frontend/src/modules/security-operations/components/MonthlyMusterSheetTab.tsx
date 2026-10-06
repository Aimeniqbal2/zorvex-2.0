import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getMonthlyMusterGrid, saveMonthlyMusterUpdates, importMonthlyMusterExcel, apiClient } from '../api';
import { useToastStore } from '../../../stores/toastStore';

interface GuardRow {
    employee_id: string;
    employee_code: string;
    name: string;
    designation: string;
    designation_full: string;
    is_primary: boolean;
    days: Record<string, string>;
    total_present: number;
    total_ot: number;
    total_wo: number;
    total_ds: number;
    total_absent: number;
    total_leave: number;
    payable_days: number;
}

interface SiteBlock {
    site_id: string;
    site_name: string;
    customer_name: string;
    supervisors_req: number;
    supervisors_sal: number;
    guards_req: number;
    guards_sal: number;
    overtime_rate: number;
    guards: GuardRow[];
    daily_totals: Record<string, number>;
    daily_vacations: Record<string, number>;
}

export const MonthlyMusterSheetTab: React.FC = () => {
    const { addToast } = useToastStore();
    const today = new Date();

    const [year, setYear] = useState<number>(today.getFullYear());
    const [month, setMonth] = useState<number>(today.getMonth() + 1);
    const [loading, setLoading] = useState<boolean>(true);
    const [saving, setSaving] = useState<boolean>(false);
    const [importing, setImporting] = useState<boolean>(false);

    const [sitesData, setSitesData] = useState<SiteBlock[]>([]);
    const [daysInMonth, setDaysInMonth] = useState<number>(31);
    const [todayDay, setTodayDay] = useState<number>(today.getDate());
    const [searchQuery, setSearchQuery] = useState<string>('');

    // Dirty updates tracker: key is `${site_id}_${employee_id}_${day}` -> { site_id, employee_id, day, code }
    const [dirtyUpdates, setDirtyUpdates] = useState<Map<string, { site_id: string; employee_id: string; day: number; code: string }>>(new Map());

    // Add Guard Modal state
    const [activeAddSiteId, setActiveAddSiteId] = useState<string | null>(null);
    const [allEmployees, setAllEmployees] = useState<any[]>([]);
    const [guardSearch, setGuardSearch] = useState<string>('');

    // Import Excel Modal state
    const [showImportModal, setShowImportModal] = useState<boolean>(false);
    const [importFile, setImportFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const loadMusterData = async () => {
        try {
            setLoading(true);
            const res = await getMonthlyMusterGrid(year, month);
            setSitesData(res.sites || []);
            setDaysInMonth(res.days_in_month || 31);
            setTodayDay(res.today_day || today.getDate());
            setDirtyUpdates(new Map());
        } catch (err: any) {
            console.error('Failed to load monthly muster grid:', err);
            addToast('error', err.response?.data?.detail || 'Failed to load Monthly Muster Grid.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadMusterData();
    }, [year, month]);

    // Preload active employees for guard search modal
    useEffect(() => {
        const fetchEmployeesList = async () => {
            try {
                const res = await apiClient.get('/api/hrm/employees/?page_size=1000&status=ACTIVE');
                const list = res.data?.results || res.data || [];
                setAllEmployees(list);
            } catch (err) {
                console.error('Failed to preload workforce:', err);
            }
        };
        fetchEmployeesList();
    }, []);

    // Filtered sites based on global search query
    const filteredSites = useMemo(() => {
        if (!searchQuery.trim()) return sitesData;
        const q = searchQuery.toLowerCase().trim();
        return sitesData.map(site => {
            const siteMatches = site.site_name.toLowerCase().includes(q) || site.customer_name.toLowerCase().includes(q);
            const matchingGuards = site.guards.filter(g => 
                g.name.toLowerCase().includes(q) || 
                g.employee_code.toLowerCase().includes(q) ||
                g.designation_full.toLowerCase().includes(q)
            );
            if (siteMatches) return site;
            if (matchingGuards.length > 0) return { ...site, guards: matchingGuards };
            return null;
        }).filter(Boolean) as SiteBlock[];
    }, [sitesData, searchQuery]);

    // Fast inline cell edit with anti-cheating cross-location duplicate check
    const handleCellChange = (siteId: string, employeeId: string, day: number, rawValue: string) => {
        let val = rawValue.trim().toUpperCase();

        // Normalization: allow typing '1' or 'P' for Present
        if (val === 'P') val = '1';
        if (val === 'OFF') val = 'WO';
        if (val === 'DS') val = 'WO+OT';

        // Check if value is valid
        const validValues = ['', '1', 'OT', 'WO', 'WO+OT', 'A', 'L', 'PL', 'SL'];
        if (!validValues.includes(val)) {
            addToast('warning', `Invalid duty code "${val}". Allowed: 1 (Present), OT (Overtime), WO+OT (Double Shift), WO (Off), A (Absent), L (Leave).`);
            return;
        }

        // Anti-Cheating Cross-Location Check:
        // If typing '1', verify guard is NOT already marked '1' at another site on this day!
        if (val === '1') {
            for (const otherSite of sitesData) {
                if (otherSite.site_id === siteId) continue;
                const guardAtOtherSite = otherSite.guards.find(g => g.employee_id === employeeId);
                if (guardAtOtherSite && guardAtOtherSite.days[String(day)] === '1') {
                    addToast('error', `⚠️ Cheating Prevention Alert: Guard ${guardAtOtherSite.name} (${guardAtOtherSite.employee_code}) is already marked Present (1) at "${otherSite.site_name}" on Day ${day}. Only "OT" (Overtime) can be marked here!`);
                    return;
                }
            }
        }

        // Apply update in local state
        setSitesData(prev => prev.map(site => {
            if (site.site_id !== siteId) return site;
            const updatedGuards = site.guards.map(guard => {
                if (guard.employee_id !== employeeId) return guard;
                const updatedDays = { ...guard.days, [String(day)]: val };

                // Recompute counts for this guard
                let p = 0, ot = 0, wo = 0, ds = 0, a = 0, l = 0;
                Object.values(updatedDays).forEach(c => {
                    if (c === '1') p++;
                    else if (c === 'OT') ot++;
                    else if (c === 'WO') wo++;
                    else if (c === 'WO+OT') ds++;
                    else if (c === 'A') a++;
                    else if (['L', 'PL', 'SL'].includes(c)) l++;
                });

                return {
                    ...guard,
                    days: updatedDays,
                    total_present: p,
                    total_ot: ot,
                    total_wo: wo,
                    total_ds: ds,
                    total_absent: a,
                    total_leave: l,
                    payable_days: p + wo + ds + l
                };
            });

            // Recompute site daily totals and vacations
            const newDailyTotals: Record<string, number> = {};
            const newDailyVacations: Record<string, number> = {};
            for (let d = 1; d <= daysInMonth; d++) {
                let dTot = 0;
                let dVac = 0;
                updatedGuards.forEach(g => {
                    const c = g.days[String(d)];
                    if (['1', 'OT', 'WO+OT'].includes(c)) dTot++;
                    if (['WO', 'L', 'PL', 'SL'].includes(c)) dVac++;
                });
                newDailyTotals[String(d)] = dTot;
                newDailyVacations[String(d)] = dVac;
            }

            return {
                ...site,
                guards: updatedGuards,
                daily_totals: newDailyTotals,
                daily_vacations: newDailyVacations
            };
        }));

        // Track dirty update
        const updateKey = `${siteId}_${employeeId}_${day}`;
        setDirtyUpdates(prev => {
            const next = new Map(prev);
            next.set(updateKey, {
                site_id: siteId,
                employee_id: employeeId,
                day,
                code: val
            });
            return next;
        });
    };

    // Save changes to backend
    const handleSaveChanges = async () => {
        if (dirtyUpdates.size === 0) {
            addToast('info', 'No pending changes to save.');
            return;
        }

        try {
            setSaving(true);
            const updatesArray = Array.from(dirtyUpdates.values());
            await saveMonthlyMusterUpdates(year, month, updatesArray);
            addToast('success', `Successfully saved ${updatesArray.length} duty updates to attendance & payroll.`);
            setDirtyUpdates(new Map());
        } catch (err: any) {
            console.error('Failed to save muster updates:', err);
            addToast('error', err.response?.data?.detail || 'Failed to save muster updates.');
        } finally {
            setSaving(false);
        }
    };

    // Add Guard to Site Block
    const handleAddGuardToSite = (emp: any) => {
        if (!activeAddSiteId) return;

        // Check if already in this site block
        const targetSite = sitesData.find(s => s.site_id === activeAddSiteId);
        if (targetSite && targetSite.guards.some(g => g.employee_id === String(emp.id))) {
            addToast('warning', `${emp.first_name} is already listed in this location block.`);
            return;
        }

        const desigTitle = emp.designation_name || emp.designation?.name || 'Guard';
        let desigCode = 'GD';
        if (desigTitle.toLowerCase().includes('supervisor')) desigCode = 'SUP';
        else if (desigTitle.toLowerCase().includes('lady')) desigCode = 'LADY';
        else if (desigTitle.toLowerCase().includes('cctv')) desigCode = 'CCTV';

        const initialDays: Record<string, string> = {};
        for (let d = 1; d <= daysInMonth; d++) {
            initialDays[String(d)] = '';
        }

        const newRow: GuardRow = {
            employee_id: String(emp.id),
            employee_code: emp.employee_code || '',
            name: `${emp.first_name} ${emp.last_name || ''}`.trim(),
            designation: desigCode,
            designation_full: desigTitle,
            is_primary: false,
            days: initialDays,
            total_present: 0,
            total_ot: 0,
            total_wo: 0,
            total_ds: 0,
            total_absent: 0,
            total_leave: 0,
            payable_days: 0
        };

        setSitesData(prev => prev.map(s => {
            if (s.site_id !== activeAddSiteId) return s;
            return {
                ...s,
                guards: [...s.guards, newRow]
            };
        }));

        addToast('success', `Added ${newRow.name} (${newRow.employee_code}) to ${targetSite?.site_name}.`);
        setActiveAddSiteId(null);
        setGuardSearch('');
    };

    // Remove Guard from Site Block
    const handleRemoveGuard = (siteId: string, employeeId: string, guardName: string) => {
        if (!window.confirm(`Are you sure you want to remove ${guardName} from this location block?`)) return;

        setSitesData(prev => prev.map(s => {
            if (s.site_id !== siteId) return s;
            return {
                ...s,
                guards: s.guards.filter(g => g.employee_id !== employeeId)
            };
        }));
        addToast('info', `Removed ${guardName} from location sheet.`);
    };

    // Excel file import submission
    const handleImportSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!importFile) {
            addToast('warning', 'Please select an Excel file (.xlsx) to import.');
            return;
        }

        try {
            setImporting(true);
            const res = await importMonthlyMusterExcel(importFile, year, month);
            addToast('success', `Import Completed! ${res.sites_imported} sites, ${res.guards_imported} guards, and ${res.duties_imported} duty cells imported.`);
            setShowImportModal(false);
            setImportFile(null);
            loadMusterData();
        } catch (err: any) {
            console.error('Import failed:', err);
            addToast('error', err.response?.data?.detail || 'Failed to import Excel sheet.');
        } finally {
            setImporting(false);
        }
    };

    // Export current grid to CSV
    const handleExportCsv = () => {
        const header = ['Site Name', 'Code', 'Desig', 'Guard Name', ...Array.from({ length: daysInMonth }, (_, i) => String(i + 1)), 'Present', 'OT', 'Off/Leave', 'Payable Days'];
        const rows: string[][] = [header];

        sitesData.forEach(site => {
            site.guards.forEach(g => {
                const daysValues = Array.from({ length: daysInMonth }, (_, i) => g.days[String(i + 1)] || '');
                rows.push([
                    site.site_name,
                    g.employee_code,
                    g.designation,
                    g.name,
                    ...daysValues,
                    String(g.total_present),
                    String(g.total_ot),
                    String(g.total_wo + g.total_leave),
                    String(g.payable_days)
                ]);
            });
        });

        const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `Monthly_Muster_${year}_${month}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="monthly-muster-workspace" style={{ padding: '20px', background: 'var(--color-bg, #0f172a)', minHeight: '100vh', color: 'var(--color-text, #f8fafc)' }}>
            
            {/* Top Controller Bar */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px', background: 'var(--color-surface, #1e293b)', padding: '16px 20px', borderRadius: '12px', border: '1px solid var(--color-border, #334155)', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <i className='bx bx-calendar' style={{ fontSize: '1.5rem', color: '#10b981' }}></i>
                        <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>Monthly Duty Muster:</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <select 
                            value={month} 
                            onChange={(e) => setMonth(Number(e.target.value))}
                            style={{ padding: '8px 12px', borderRadius: '8px', background: 'var(--color-bg, #0f172a)', color: 'var(--color-text, #fff)', border: '1px solid var(--color-border, #334155)', fontWeight: 600 }}
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

                        <select 
                            value={year} 
                            onChange={(e) => setYear(Number(e.target.value))}
                            style={{ padding: '8px 12px', borderRadius: '8px', background: 'var(--color-bg, #0f172a)', color: 'var(--color-text, #fff)', border: '1px solid var(--color-border, #334155)', fontWeight: 600 }}
                        >
                            <option value={2025}>2025</option>
                            <option value={2026}>2026</option>
                            <option value={2027}>2027</option>
                        </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '0.85rem', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', padding: '4px 10px', borderRadius: '6px', fontWeight: 600, border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                            📅 {daysInMonth} Days in Month
                        </span>
                        <span style={{ fontSize: '0.85rem', background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', padding: '4px 10px', borderRadius: '6px', fontWeight: 600, border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                            🏢 {sitesData.length} Operational Sites
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    {/* Live Guard & Site Search */}
                    <div style={{ position: 'relative', minWidth: '220px' }}>
                        <i className='bx bx-search' style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}></i>
                        <input
                            type="text"
                            placeholder="Search Guard / Site..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ width: '100%', padding: '8px 12px 8px 34px', borderRadius: '8px', background: 'var(--color-bg, #0f172a)', border: '1px solid var(--color-border, #334155)', color: '#fff', fontSize: '0.9rem' }}
                        />
                        {searchQuery && (
                            <button 
                                onClick={() => setSearchQuery('')}
                                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                            >
                                ✕
                            </button>
                        )}
                    </div>

                    {/* Import Excel */}
                    <button
                        onClick={() => setShowImportModal(true)}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', background: '#0284c7', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}
                    >
                        <i className='bx bx-import'></i> Import Excel
                    </button>

                    {/* Export CSV */}
                    <button
                        onClick={handleExportCsv}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', background: 'var(--color-surface, #334155)', color: '#fff', border: '1px solid var(--color-border, #475569)', fontWeight: 600, cursor: 'pointer' }}
                    >
                        <i className='bx bx-export'></i> Export
                    </button>

                    {/* Save Changes with pending counter */}
                    <button
                        onClick={handleSaveChanges}
                        disabled={saving || dirtyUpdates.size === 0}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 18px',
                            borderRadius: '8px',
                            background: dirtyUpdates.size > 0 ? '#10b981' : '#475569',
                            color: '#fff',
                            border: 'none',
                            fontWeight: 700,
                            cursor: dirtyUpdates.size > 0 ? 'pointer' : 'default',
                            boxShadow: dirtyUpdates.size > 0 ? '0 0 12px rgba(16, 185, 129, 0.4)' : 'none'
                        }}
                    >
                        <i className='bx bx-save'></i>
                        {saving ? 'Saving...' : `Save Changes ${dirtyUpdates.size > 0 ? `(${dirtyUpdates.size})` : ''}`}
                    </button>
                </div>
            </div>

            {/* Instruction Banner & Legend */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', background: 'rgba(30, 41, 59, 0.6)', padding: '10px 16px', borderRadius: '8px', border: '1px solid #334155', marginBottom: '16px', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className='bx bx-info-circle' style={{ color: '#38bdf8' }}></i>
                    <span><strong>Quick Entry Codes:</strong> Type <code>1</code> for Present, <code>OT</code> for Overtime, <code>WO+OT</code> for Double Shift, <code>WO</code> for Weekly Off, <code>A</code> for Absent, <code>L</code> for Leave.</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981' }}></span> Present (1)</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#3b82f6' }}></span> Overtime (OT)</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b' }}></span> Double Shift (WO+OT)</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#64748b' }}></span> Off (WO)</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }}></span> Absent (A)</span>
                </div>
            </div>

            {/* Loading state */}
            {loading && (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
                    <i className='bx bx-loader-alt bx-spin' style={{ fontSize: '2.5rem', color: '#10b981', marginBottom: '12px' }}></i>
                    <p style={{ fontSize: '1.1rem' }}>Loading Complete Monthly Muster Matrix...</p>
                </div>
            )}

            {/* Location Blocks Grid */}
            {!loading && filteredSites.length === 0 && (
                <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--color-surface, #1e293b)', borderRadius: '12px', border: '1px dashed #334155' }}>
                    <i className='bx bx-folder-open' style={{ fontSize: '3rem', color: '#64748b', marginBottom: '12px' }}></i>
                    <h3>No Operational Sites Found</h3>
                    <p style={{ color: '#94a3b8' }}>Add client locations in CRM or adjust your filter query.</p>
                </div>
            )}

            {!loading && filteredSites.map((site) => (
                <div 
                    key={site.site_id} 
                    style={{ marginBottom: '32px', background: 'var(--color-surface, #1e293b)', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                >
                    {/* Green Location Header Banner (Matching Excel Screenshot) */}
                    <div style={{ background: 'linear-gradient(90deg, #15803d, #16a34a)', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', color: '#fff' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <i className='bx bx-building' style={{ fontSize: '1.4rem' }}></i>
                            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, letterSpacing: '0.3px' }}>
                                {site.site_name}
                            </h3>
                            <span style={{ background: 'rgba(255, 255, 255, 0.2)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600 }}>
                                {site.customer_name}
                            </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <div style={{ fontSize: '0.85rem', background: 'rgba(0, 0, 0, 0.25)', padding: '4px 12px', borderRadius: '6px' }}>
                                <span>Required: </span>
                                <strong>{site.supervisors_req > 0 ? `${site.supervisors_req} SUP ` : ''}{site.guards_req} GD</strong>
                                {site.overtime_rate > 0 && <span style={{ marginLeft: '8px', borderLeft: '1px solid rgba(255,255,255,0.3)', paddingLeft: '8px' }}>OT Rate: Rs. {site.overtime_rate.toLocaleString()}</span>}
                            </div>

                            <button
                                onClick={() => setActiveAddSiteId(site.site_id)}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', color: '#15803d', border: 'none', padding: '6px 14px', borderRadius: '6px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
                            >
                                <i className='bx bx-user-plus'></i> Add Guard
                            </button>
                        </div>
                    </div>

                    {/* Table Matrix */}
                    <div style={{ overflowX: 'auto', width: '100%' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'center' }}>
                            <thead>
                                <tr style={{ background: '#0f172a', color: '#94a3b8', borderBottom: '1px solid #334155' }}>
                                    <th style={{ padding: '8px 6px', width: '32px', position: 'sticky', left: 0, background: '#0f172a', zIndex: 3 }}>#</th>
                                    <th style={{ padding: '8px 8px', width: '60px', position: 'sticky', left: '32px', background: '#0f172a', zIndex: 3, textAlign: 'left' }}>Code</th>
                                    <th style={{ padding: '8px 8px', width: '50px', position: 'sticky', left: '92px', background: '#0f172a', zIndex: 3 }}>Desig</th>
                                    <th style={{ padding: '8px 12px', minWidth: '150px', position: 'sticky', left: '142px', background: '#0f172a', zIndex: 3, textAlign: 'left' }}>Guard Name</th>

                                    {/* Days 1 to 31 */}
                                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                                        const isTodayHeader = (d === todayDay);
                                        return (
                                            <th 
                                                key={d} 
                                                style={{ 
                                                    padding: '8px 4px', 
                                                    minWidth: '34px', 
                                                    borderLeft: '1px solid #334155',
                                                    background: isTodayHeader ? 'rgba(16, 185, 129, 0.2)' : '#0f172a',
                                                    color: isTodayHeader ? '#10b981' : '#cbd5e1'
                                                }}
                                            >
                                                {d}
                                            </th>
                                        );
                                    })}

                                    <th style={{ padding: '8px 8px', minWidth: '45px', borderLeft: '1px solid #334155', background: '#0f172a' }}>P</th>
                                    <th style={{ padding: '8px 8px', minWidth: '40px', borderLeft: '1px solid #334155', background: '#0f172a' }}>OT</th>
                                    <th style={{ padding: '8px 8px', minWidth: '45px', borderLeft: '1px solid #334155', background: '#0f172a' }}>Off/L</th>
                                    <th style={{ padding: '8px 8px', minWidth: '55px', borderLeft: '1px solid #334155', background: '#0f172a' }}>Pay Days</th>
                                    <th style={{ padding: '8px 6px', width: '36px', borderLeft: '1px solid #334155', background: '#0f172a' }}>Act</th>
                                </tr>
                            </thead>
                            <tbody>
                                {site.guards.length === 0 ? (
                                    <tr>
                                        <td colSpan={daysInMonth + 9} style={{ padding: '24px', color: '#64748b', textAlign: 'center' }}>
                                            No guards assigned to this location yet. Click <strong>[ + Add Guard ]</strong> above to assign personnel.
                                        </td>
                                    </tr>
                                ) : (
                                    site.guards.map((guard, idx) => (
                                        <tr key={guard.employee_id} style={{ borderBottom: '1px solid #334155', background: idx % 2 === 0 ? 'rgba(30, 41, 59, 0.4)' : 'transparent' }}>
                                            <td style={{ padding: '6px 4px', position: 'sticky', left: 0, background: '#1e293b', zIndex: 2, color: '#64748b' }}>
                                                {idx + 1}
                                            </td>
                                            <td style={{ padding: '6px 8px', position: 'sticky', left: '32px', background: '#1e293b', zIndex: 2, fontWeight: 700, color: '#38bdf8', textAlign: 'left' }}>
                                                {guard.employee_code}
                                            </td>
                                            <td style={{ padding: '6px 4px', position: 'sticky', left: '92px', background: '#1e293b', zIndex: 2 }}>
                                                <span style={{ 
                                                    padding: '2px 6px', 
                                                    borderRadius: '4px', 
                                                    fontSize: '0.72rem', 
                                                    fontWeight: 700,
                                                    background: guard.designation === 'SUP' ? 'rgba(168, 85, 247, 0.2)' : 'rgba(100, 116, 139, 0.2)',
                                                    color: guard.designation === 'SUP' ? '#c084fc' : '#94a3b8'
                                                }}>
                                                    {guard.designation}
                                                </span>
                                            </td>
                                            <td style={{ padding: '6px 12px', position: 'sticky', left: '142px', background: '#1e293b', zIndex: 2, textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                                {guard.name}
                                            </td>

                                            {/* Days 1 to 31 Cells */}
                                            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                                                const cellVal = guard.days[String(d)] || '';

                                                // Cell background colors based on value
                                                let cellBg = 'transparent';
                                                let cellColor = '#cbd5e1';
                                                if (cellVal === '1') {
                                                    cellBg = 'rgba(16, 185, 129, 0.25)';
                                                    cellColor = '#10b981';
                                                } else if (cellVal === 'OT') {
                                                    cellBg = 'rgba(59, 130, 246, 0.25)';
                                                    cellColor = '#3b82f6';
                                                } else if (cellVal === 'WO+OT') {
                                                    cellBg = 'rgba(245, 158, 11, 0.3)';
                                                    cellColor = '#fbbf24';
                                                } else if (cellVal === 'WO') {
                                                    cellBg = 'rgba(100, 116, 139, 0.2)';
                                                    cellColor = '#94a3b8';
                                                } else if (cellVal === 'A') {
                                                    cellBg = 'rgba(239, 68, 68, 0.25)';
                                                    cellColor = '#ef4444';
                                                } else if (['L', 'PL', 'SL'].includes(cellVal)) {
                                                    cellBg = 'rgba(168, 85, 247, 0.25)';
                                                    cellColor = '#c084fc';
                                                }

                                                return (
                                                    <td 
                                                        key={d} 
                                                        style={{ 
                                                            padding: '2px', 
                                                            borderLeft: '1px solid #334155',
                                                            background: cellBg,
                                                            position: 'relative'
                                                        }}
                                                    >
                                                        <input
                                                            type="text"
                                                            value={cellVal}
                                                            onChange={(e) => handleCellChange(site.site_id, guard.employee_id, d, e.target.value)}
                                                            style={{
                                                                width: '100%',
                                                                height: '28px',
                                                                background: 'transparent',
                                                                border: 'none',
                                                                textAlign: 'center',
                                                                color: cellColor,
                                                                fontWeight: 700,
                                                                fontSize: '0.82rem',
                                                                outline: 'none',
                                                                cursor: 'pointer'
                                                            }}
                                                        />
                                                    </td>
                                                );
                                            })}

                                            <td style={{ padding: '6px 4px', borderLeft: '1px solid #334155', fontWeight: 700, color: '#10b981' }}>{guard.total_present}</td>
                                            <td style={{ padding: '6px 4px', borderLeft: '1px solid #334155', fontWeight: 700, color: '#3b82f6' }}>{guard.total_ot}</td>
                                            <td style={{ padding: '6px 4px', borderLeft: '1px solid #334155', fontWeight: 600, color: '#94a3b8' }}>{guard.total_wo + guard.total_leave}</td>
                                            <td style={{ padding: '6px 4px', borderLeft: '1px solid #334155', fontWeight: 700, color: '#f59e0b', background: 'rgba(245, 158, 11, 0.08)' }}>{guard.payable_days}</td>
                                            <td style={{ padding: '6px 4px', borderLeft: '1px solid #334155' }}>
                                                <button
                                                    onClick={() => handleRemoveGuard(site.site_id, guard.employee_id, guard.name)}
                                                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px', fontSize: '1rem' }}
                                                    title="Remove Guard from this block"
                                                >
                                                    <i className='bx bx-trash'></i>
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}

                                {/* Red Paid Vacations Summary Row (Matching Screenshot) */}
                                <tr style={{ background: 'rgba(220, 38, 38, 0.15)', borderTop: '1px solid #dc2626', color: '#f87171', fontWeight: 700 }}>
                                    <td colSpan={4} style={{ padding: '6px 12px', textAlign: 'left', position: 'sticky', left: 0, background: '#261c24', zIndex: 2 }}>
                                        Paid Vac / Leaves
                                    </td>
                                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => (
                                        <td key={d} style={{ padding: '4px', borderLeft: '1px solid rgba(220, 38, 38, 0.3)' }}>
                                            {site.daily_vacations[String(d)] || 0}
                                        </td>
                                    ))}
                                    <td colSpan={5} style={{ borderLeft: '1px solid rgba(220, 38, 38, 0.3)' }}></td>
                                </tr>

                                {/* Daily Deployed Total Row (Matching Screenshot) */}
                                <tr style={{ background: 'rgba(16, 185, 129, 0.15)', borderTop: '1px solid #10b981', color: '#34d399', fontWeight: 800 }}>
                                    <td colSpan={4} style={{ padding: '6px 12px', textAlign: 'left', position: 'sticky', left: 0, background: '#172727', zIndex: 2 }}>
                                        Total Deployed On Site
                                    </td>
                                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => (
                                        <td key={d} style={{ padding: '4px', borderLeft: '1px solid rgba(16, 185, 129, 0.3)' }}>
                                            {site.daily_totals[String(d)] || 0}
                                        </td>
                                    ))}
                                    <td colSpan={5} style={{ borderLeft: '1px solid rgba(16, 185, 129, 0.3)' }}></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            ))}

            {/* Modal: Add Guard to Site Block */}
            {activeAddSiteId && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
                    <div style={{ background: 'var(--color-surface, #1e293b)', width: '100%', maxWidth: '520px', borderRadius: '14px', border: '1px solid #334155', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#fff' }}>Add Guard to Site Roster</h3>
                            <button onClick={() => setActiveAddSiteId(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <input
                                type="text"
                                placeholder="Search by Employee Code or Name..."
                                value={guardSearch}
                                onChange={(e) => setGuardSearch(e.target.value)}
                                autoFocus
                                style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', background: 'var(--color-bg, #0f172a)', border: '1px solid #475569', color: '#fff', fontSize: '0.95rem' }}
                            />
                        </div>

                        <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {allEmployees
                                .filter(e => {
                                    if (!guardSearch.trim()) return true;
                                    const q = guardSearch.toLowerCase().trim();
                                    return (
                                        (e.employee_code || '').toLowerCase().includes(q) ||
                                        (e.first_name || '').toLowerCase().includes(q) ||
                                        (e.last_name || '').toLowerCase().includes(q)
                                    );
                                })
                                .slice(0, 20)
                                .map(emp => (
                                    <div
                                        key={emp.id}
                                        onClick={() => handleAddGuardToSite(emp)}
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', background: '#0f172a', border: '1px solid #334155', cursor: 'pointer', transition: 'all 0.2s' }}
                                        onMouseEnter={(e) => e.currentTarget.style.borderColor = '#10b981'}
                                        onMouseLeave={(e) => e.currentTarget.style.borderColor = '#334155'}
                                    >
                                        <div>
                                            <strong style={{ color: '#fff' }}>{emp.first_name} {emp.last_name}</strong>
                                            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                                                Code: <span style={{ color: '#38bdf8' }}>{emp.employee_code}</span> | {emp.designation_name || emp.designation?.name || 'Guard'}
                                            </div>
                                        </div>
                                        <button style={{ background: '#10b981', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, pointerEvents: 'none' }}>
                                            + Select
                                        </button>
                                    </div>
                                ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Import Excel Sheet */}
            {showImportModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
                    <div style={{ background: 'var(--color-surface, #1e293b)', width: '100%', maxWidth: '500px', borderRadius: '14px', border: '1px solid #334155', padding: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#fff' }}>Import Monthly Muster Excel</h3>
                            <button onClick={() => setShowImportModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
                        </div>

                        <form onSubmit={handleImportSubmit}>
                            <div style={{ padding: '20px', border: '2px dashed #475569', borderRadius: '10px', textAlign: 'center', marginBottom: '16px', background: '#0f172a' }}>
                                <i className='bx bx-file' style={{ fontSize: '2.5rem', color: '#38bdf8', marginBottom: '8px' }}></i>
                                <p style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#cbd5e1' }}>Select Excel workbook (.xlsx)</p>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    accept=".xlsx, .xls"
                                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                                    style={{ display: 'none' }}
                                />
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    style={{ padding: '8px 16px', borderRadius: '6px', background: '#334155', color: '#fff', border: '1px solid #475569', fontWeight: 600, cursor: 'pointer' }}
                                >
                                    Browse File
                                </button>
                                {importFile && (
                                    <div style={{ marginTop: '10px', color: '#10b981', fontWeight: 600, fontSize: '0.85rem' }}>
                                        ✓ Selected: {importFile.name} ({(importFile.size / 1024).toFixed(1)} KB)
                                    </div>
                                )}
                            </div>

                            <div style={{ background: 'rgba(56, 189, 248, 0.1)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.2)', marginBottom: '16px', fontSize: '0.8rem', color: '#cbd5e1' }}>
                                <strong style={{ color: '#38bdf8' }}>Import Rules:</strong>
                                <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                                    <li>Matches green location header text to CRM site names.</li>
                                    <li><code>1</code> or <code>P</code> maps to Present.</li>
                                    <li><code>OT</code> maps to Overtime, <code>WO+OT</code> to Double Shift.</li>
                                    <li>Blanks on past dates default to Absent; future dates remain blank.</li>
                                </ul>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button
                                    type="button"
                                    onClick={() => setShowImportModal(false)}
                                    style={{ padding: '8px 16px', borderRadius: '8px', background: '#334155', color: '#fff', border: 'none', cursor: 'pointer' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={importing || !importFile}
                                    style={{ padding: '8px 20px', borderRadius: '8px', background: '#0284c7', color: '#fff', border: 'none', fontWeight: 700, cursor: importing || !importFile ? 'default' : 'pointer' }}
                                >
                                    {importing ? 'Processing...' : 'Upload & Parse Sheet'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
