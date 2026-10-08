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

interface SiteRequirement {
    post_id: string | null;
    post_name: string;
    designation_id: string | null;
    designation_code: string;
    designation_name: string;
    required_headcount: number;
    monthly_pay_rate: number;
    overtime_rate: number;
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
    requirements?: SiteRequirement[];
    guards: GuardRow[];
    daily_totals: Record<string, number>;
    daily_vacations: Record<string, number>;
}

interface MonthlyMusterSheetTabProps {
    onBack?: () => void;
}

export const MonthlyMusterSheetTab: React.FC<MonthlyMusterSheetTabProps> = ({ onBack }) => {
    const { addToast } = useToastStore();
    const today = new Date();

    const [year, setYear] = useState<number>(today.getFullYear());
    const [month, setMonth] = useState<number>(today.getMonth() + 1);
    const [selectedSiteFilter, setSelectedSiteFilter] = useState<string>('ALL');
    const [loading, setLoading] = useState<boolean>(true);
    const [saving, setSaving] = useState<boolean>(false);
    const [importing, setImporting] = useState<boolean>(false);

    const [sitesData, setSitesData] = useState<SiteBlock[]>([]);
    const [daysInMonth, setDaysInMonth] = useState<number>(31);
    const [todayDay, setTodayDay] = useState<number>(today.getDate());
    const [searchQuery, setSearchQuery] = useState<string>('');

    // Dirty updates tracker: key is `${site_id}_${employee_id}_${day}` -> { site_id, employee_id, day, code }
    const [dirtyUpdates, setDirtyUpdates] = useState<Map<string, { site_id: string; employee_id: string; day: number; code: string }>>(new Map());
    const [addedGuards, setAddedGuards] = useState<Array<{
        site_id: string;
        employee_id: string;
        post_id?: string | null;
        designation_id?: string | null;
        monthly_pay_rate?: number;
    }>>([]);
    const [removedGuards, setRemovedGuards] = useState<Array<{ site_id: string; employee_id: string }>>([]);

    // Add Guard Modal state
    const [activeAddSiteId, setActiveAddSiteId] = useState<string | null>(null);
    const [selectedRequirementIndex, setSelectedRequirementIndex] = useState<number>(0);
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
            setAddedGuards([]);
            setRemovedGuards([]);
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

    // Filtered sites: first filter by site dropdown, then by search query
    const filteredSites = useMemo(() => {
        let baseList = sitesData;
        if (selectedSiteFilter !== 'ALL') {
            baseList = baseList.filter(s => s.site_id === selectedSiteFilter);
        }

        if (!searchQuery.trim()) return baseList;
        const q = searchQuery.toLowerCase().trim();
        return baseList.map(site => {
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
    }, [sitesData, selectedSiteFilter, searchQuery]);

    // Fast inline cell edit with anti-cheating cross-location duplicate check
    const handleCellChange = (siteId: string, employeeId: string, day: number, rawValue: string) => {
        const raw = rawValue.trim().toUpperCase();
        let val = '';

        // Single letter mapping and aliases
        if (['P', '1'].includes(raw)) val = 'P';
        else if (['O', 'OT'].includes(raw)) val = 'O';
        else if (['D', 'DS', 'WO+OT', '2'].includes(raw)) val = 'D';
        else if (['W', 'WO', 'OFF'].includes(raw)) val = 'W';
        else if (raw === 'A') val = 'A';
        else if (['L', 'PL', 'SL'].includes(raw)) val = 'L';
        else if (raw === '') val = '';
        else {
            // Check last typed character as fallback
            const lastChar = raw.charAt(raw.length - 1);
            if (['P', '1'].includes(lastChar)) val = 'P';
            else if (lastChar === 'O') val = 'O';
            else if (lastChar === 'D') val = 'D';
            else if (lastChar === 'W') val = 'W';
            else if (lastChar === 'A') val = 'A';
            else if (lastChar === 'L') val = 'L';
            else {
                addToast('warning', `Use single-letter shortcuts: P (Present), O (Overtime), D (Double Shift), W (Weekly Off), A (Absent), L (Leave).`);
                return;
            }
        }

        // Anti-Cheating Cross-Location Check:
        // If typing 'P', verify guard is NOT already marked 'P' at another site on this day!
        if (val === 'P') {
            for (const otherSite of sitesData) {
                if (otherSite.site_id === siteId) continue;
                const guardAtOtherSite = otherSite.guards.find(g => g.employee_id === employeeId);
                if (guardAtOtherSite && (guardAtOtherSite.days[String(day)] === 'P' || guardAtOtherSite.days[String(day)] === '1')) {
                    addToast('error', `⚠️ Duplicate Prevented: Guard ${guardAtOtherSite.name} (${guardAtOtherSite.employee_code}) is already marked Present (P) at "${otherSite.site_name}" on Day ${day}. Only "O" (Overtime) can be marked here!`);
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
                    if (c === 'P' || c === '1') p++;
                    else if (c === 'O' || c === 'OT') ot++;
                    else if (c === 'W' || c === 'WO') wo++;
                    else if (c === 'D' || c === 'WO+OT' || c === 'DS') ds++;
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
                    if (['P', '1', 'O', 'OT', 'D', 'WO+OT', 'DS'].includes(c)) dTot++;
                    if (['W', 'WO', 'L', 'PL', 'SL'].includes(c)) dVac++;
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
        const totalChanges = dirtyUpdates.size + addedGuards.length + removedGuards.length;
        if (totalChanges === 0) {
            addToast('info', 'No pending changes to save.');
            return;
        }

        try {
            setSaving(true);
            const updatesArray = Array.from(dirtyUpdates.values());
            await saveMonthlyMusterUpdates(year, month, updatesArray, addedGuards, removedGuards);
            addToast('success', `Successfully saved changes! Roster & duty calculations updated.`);
            setDirtyUpdates(new Map());
            setAddedGuards([]);
            setRemovedGuards([]);
            await loadMusterData();
        } catch (err: any) {
            console.error('Failed to save muster updates:', err);
            addToast('error', err.response?.data?.detail || 'Failed to save muster updates.');
        } finally {
            setSaving(false);
        }
    };

    // Add Guard to Site Block with Selected Site Requirement/Position
    const handleAddGuardToSite = (emp: any, req: SiteRequirement) => {
        if (!activeAddSiteId) return;

        // Check if already in this site block
        const targetSite = sitesData.find(s => s.site_id === activeAddSiteId);
        if (targetSite && targetSite.guards.some(g => g.employee_id === String(emp.id))) {
            addToast('warning', `${emp.first_name} is already listed in this location block.`);
            return;
        }

        const desigCode = req.designation_code || 'GD';
        const desigTitle = req.designation_name || 'Security Guard';

        const initialDays: Record<string, string> = {};
        for (let d = 1; d <= daysInMonth; d++) {
            initialDays[String(d)] = '';
        }

        const newRow: GuardRow = {
            employee_id: String(emp.id),
            employee_code: emp.previous_employee_code || emp.display_code || emp.employee_code || '',
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

        setAddedGuards(prev => [...prev, {
            site_id: activeAddSiteId,
            employee_id: String(emp.id),
            post_id: req.post_id,
            designation_id: req.designation_id,
            monthly_pay_rate: req.monthly_pay_rate
        }]);

        addToast('success', `Assigned ${newRow.name} (${newRow.employee_code}) as ${desigCode} (Rs. ${req.monthly_pay_rate.toLocaleString()}/mo) to ${targetSite?.site_name}. Click "Save Changes" to persist.`);
        setActiveAddSiteId(null);
        setGuardSearch('');
    };

    // Remove Guard from Site Block
    const handleRemoveGuard = (siteId: string, employeeId: string, guardName: string) => {
        if (!window.confirm(`Are you sure you want to remove ${guardName} from this location block? Clicking Save will wipe this guard's duty pay and attendance records for this month.`)) return;

        setSitesData(prev => prev.map(s => {
            if (s.site_id !== siteId) return s;
            return {
                ...s,
                guards: s.guards.filter(g => g.employee_id !== employeeId)
            };
        }));

        // Track as removed so backend cleans up duties, attendance, and deployment
        setRemovedGuards(prev => [...prev, { site_id: siteId, employee_id: employeeId }]);

        // Remove any pending dirty updates for this guard
        setDirtyUpdates(prev => {
            const next = new Map(prev);
            for (let d = 1; d <= daysInMonth; d++) {
                next.delete(`${siteId}_${employeeId}_${d}`);
            }
            return next;
        });

        // If it was added during the same session, remove it from addedGuards list
        setAddedGuards(prev => prev.filter(g => !(g.site_id === siteId && g.employee_id === employeeId)));

        addToast('info', `Removed ${guardName} from location sheet. Click "Save Changes" to finalize removal.`);
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
        <div style={{ 
            minHeight: '100vh', 
            background: 'var(--color-bg, #f8fafc)', 
            color: 'var(--color-text, #0f172a)',
            padding: '24px 32px',
            fontFamily: 'inherit'
        }}>
            
            {/* Full-Screen Top Header Bar */}
            <div style={{ 
                display: 'flex', 
                flexWrap: 'wrap', 
                alignItems: 'center', 
                justifyContent: 'space-between', 
                gap: '16px', 
                background: 'var(--color-surface, #ffffff)', 
                padding: '16px 24px', 
                borderRadius: '12px', 
                border: '1px solid var(--color-border, #e2e8f0)', 
                boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                marginBottom: '20px' 
            }}>
                {/* Left: Back Button & Title */}
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
                        <div style={{ width: 36, height: 36, borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669', fontSize: '1.4rem' }}>
                            <i className='bx bx-spreadsheet'></i>
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text, #0f172a)' }}>Monthly Duty Muster Register</h2>
                            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #64748b)' }}>Full-screen operational attendance sheet & overtime matrix</span>
                        </div>
                    </div>
                </div>

                {/* Center / Right Controls: Month, Year, Site Filter, Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    {/* Month & Year Selector */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--color-bg, #f1f5f9)', padding: '4px 8px', borderRadius: '8px', border: '1px solid var(--color-border, #cbd5e1)' }}>
                        <select 
                            value={month} 
                            onChange={(e) => setMonth(Number(e.target.value))}
                            style={{ 
                                padding: '6px 10px', 
                                borderRadius: '6px', 
                                background: 'var(--color-surface, #ffffff)', 
                                color: 'var(--color-text, #0f172a)', 
                                border: '1px solid var(--color-border, #cbd5e1)', 
                                fontWeight: 700,
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

                        <select 
                            value={year} 
                            onChange={(e) => setYear(Number(e.target.value))}
                            style={{ 
                                padding: '6px 10px', 
                                borderRadius: '6px', 
                                background: 'var(--color-surface, #ffffff)', 
                                color: 'var(--color-text, #0f172a)', 
                                border: '1px solid var(--color-border, #cbd5e1)', 
                                fontWeight: 700,
                                fontSize: '0.88rem'
                            }}
                        >
                            <option value={2025}>2025</option>
                            <option value={2026}>2026</option>
                            <option value={2027}>2027</option>
                        </select>
                    </div>

                    {/* Site Dropdown Filter */}
                    <select
                        value={selectedSiteFilter}
                        onChange={(e) => setSelectedSiteFilter(e.target.value)}
                        style={{
                            padding: '8px 12px',
                            borderRadius: '8px',
                            background: 'var(--color-surface, #ffffff)',
                            color: 'var(--color-text, #0f172a)',
                            border: '1px solid var(--color-border, #cbd5e1)',
                            fontWeight: 600,
                            fontSize: '0.88rem',
                            maxWidth: '220px'
                        }}
                    >
                        <option value="ALL">🏢 All Operational Sites ({sitesData.length})</option>
                        {sitesData.map(s => (
                            <option key={s.site_id} value={s.site_id}>{s.site_name}</option>
                        ))}
                    </select>

                    {/* Search Guard / Site */}
                    <div style={{ position: 'relative', minWidth: '200px' }}>
                        <i className='bx bx-search' style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}></i>
                        <input
                            type="text"
                            placeholder="Filter Guard or Site..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ 
                                width: '100%', 
                                padding: '8px 12px 8px 34px', 
                                borderRadius: '8px', 
                                background: 'var(--color-surface, #ffffff)', 
                                border: '1px solid var(--color-border, #cbd5e1)', 
                                color: 'var(--color-text, #0f172a)', 
                                fontSize: '0.88rem' 
                            }}
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
                        style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '6px', 
                            padding: '8px 14px', 
                            borderRadius: '8px', 
                            background: '#0284c7', 
                            color: '#ffffff', 
                            border: 'none', 
                            fontWeight: 700, 
                            fontSize: '0.88rem',
                            cursor: 'pointer' 
                        }}
                    >
                        <i className='bx bx-import'></i> Import Excel
                    </button>

                    {/* Export CSV */}
                    <button
                        onClick={handleExportCsv}
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
                        <i className='bx bx-export'></i> Export
                    </button>

                    {/* Save Changes Button */}
                    <button
                        onClick={handleSaveChanges}
                        disabled={saving || (dirtyUpdates.size === 0 && addedGuards.length === 0 && removedGuards.length === 0)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 18px',
                            borderRadius: '8px',
                            background: (dirtyUpdates.size > 0 || addedGuards.length > 0 || removedGuards.length > 0) ? '#10b981' : '#94a3b8',
                            color: '#ffffff',
                            border: 'none',
                            fontWeight: 700,
                            fontSize: '0.88rem',
                            cursor: (dirtyUpdates.size > 0 || addedGuards.length > 0 || removedGuards.length > 0) ? 'pointer' : 'default',
                            boxShadow: (dirtyUpdates.size > 0 || addedGuards.length > 0 || removedGuards.length > 0) ? '0 2px 8px rgba(16, 185, 129, 0.4)' : 'none'
                        }}
                    >
                        <i className='bx bx-save'></i>
                        {saving ? 'Saving...' : `Save Changes ${(dirtyUpdates.size + addedGuards.length + removedGuards.length) > 0 ? `(${dirtyUpdates.size + addedGuards.length + removedGuards.length})` : ''}`}
                    </button>
                </div>
            </div>

            {/* Sub-Banner: Days Count & Quick Legend */}
            <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between', 
                flexWrap: 'wrap', 
                gap: '12px', 
                background: 'var(--color-surface, #ffffff)', 
                padding: '12px 20px', 
                borderRadius: '10px', 
                border: '1px solid var(--color-border, #e2e8f0)', 
                marginBottom: '20px', 
                fontSize: '0.85rem' 
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#059669', padding: '4px 10px', borderRadius: '6px', fontWeight: 700 }}>
                        📅 {daysInMonth} Days in Month
                    </span>
                    <span style={{ color: 'var(--color-text-muted, #64748b)' }}>
                        <strong>Keystroke Shortcuts:</strong> Type <code>P</code> for Present, <code>O</code> for Overtime, <code>D</code> for Double Shift, <code>W</code> for Weekly Off, <code>A</code> for Absent, <code>L</code> for Leave.
                    </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ width: 12, height: 12, borderRadius: '3px', background: '#dcfce7', border: '1px solid #16a34a' }}></span> <strong>P</strong> Present
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ width: 12, height: 12, borderRadius: '3px', background: '#dbeafe', border: '1px solid #2563eb' }}></span> <strong>O</strong> Overtime
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ width: 12, height: 12, borderRadius: '3px', background: '#fef3c7', border: '1px solid #d97706' }}></span> <strong>D</strong> Double Shift
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ width: 12, height: 12, borderRadius: '3px', background: '#f1f5f9', border: '1px solid #94a3b8' }}></span> <strong>W</strong> Weekly Off
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ width: 12, height: 12, borderRadius: '3px', background: '#fee2e2', border: '1px solid #dc2626' }}></span> <strong>A</strong> Absent
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ width: 12, height: 12, borderRadius: '3px', background: '#f3e8ff', border: '1px solid #7e22ce' }}></span> <strong>L</strong> Leave
                    </span>
                </div>
            </div>

            {/* Loading state */}
            {loading && (
                <div style={{ textAlign: 'center', padding: '80px 20px', background: 'var(--color-surface, #ffffff)', borderRadius: '12px', border: '1px solid var(--color-border, #e2e8f0)' }}>
                    <i className='bx bx-loader-alt bx-spin' style={{ fontSize: '2.8rem', color: '#10b981', marginBottom: '14px' }}></i>
                    <h3 style={{ margin: 0, fontWeight: 700, color: 'var(--color-text, #0f172a)' }}>Loading Monthly Muster Matrix...</h3>
                    <p style={{ color: 'var(--color-text-muted, #64748b)', marginTop: '6px' }}>Fetching operational sites and duty assignments for {month}/{year}...</p>
                </div>
            )}

            {/* No sites found */}
            {!loading && filteredSites.length === 0 && (
                <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--color-surface, #ffffff)', borderRadius: '12px', border: '1px dashed var(--color-border, #cbd5e1)' }}>
                    <i className='bx bx-folder-open' style={{ fontSize: '3rem', color: '#94a3b8', marginBottom: '12px' }}></i>
                    <h3 style={{ margin: 0, color: 'var(--color-text, #0f172a)' }}>No Operational Sites Match Current Filter</h3>
                    <p style={{ color: 'var(--color-text-muted, #64748b)' }}>Adjust your search query or select "All Operational Sites" in the dropdown.</p>
                </div>
            )}

            {/* Sites Muster Blocks */}
            {!loading && filteredSites.map((site) => (
                <div 
                    key={site.site_id} 
                    style={{ 
                        marginBottom: '32px', 
                        background: 'var(--color-surface, #ffffff)', 
                        borderRadius: '12px', 
                        border: '1px solid var(--color-border, #e2e8f0)', 
                        overflow: 'hidden', 
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' 
                    }}
                >
                    {/* Green Location Header Banner (Matching Excel Screenshot) */}
                    <div style={{ 
                        background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', 
                        padding: '12px 24px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between', 
                        flexWrap: 'wrap', 
                        gap: '12px', 
                        color: '#ffffff' 
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ width: 32, height: 32, borderRadius: '6px', background: 'rgba(255, 255, 255, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
                                <i className='bx bx-building'></i>
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, letterSpacing: '0.3px', color: '#ffffff' }}>
                                    {site.site_name}
                                </h3>
                                <span style={{ fontSize: '0.8rem', opacity: 0.9 }}>
                                    Client: {site.customer_name}
                                </span>
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ fontSize: '0.85rem', background: 'rgba(0, 0, 0, 0.2)', padding: '6px 14px', borderRadius: '6px', fontWeight: 600 }}>
                                <span>Requirements: </span>
                                <strong>{site.supervisors_req > 0 ? `${site.supervisors_req} SUP ` : ''}{site.guards_req} GD</strong>
                                <span style={{ marginLeft: '10px', borderLeft: '1px solid rgba(255,255,255,0.4)', paddingLeft: '10px' }}>OT Rate: Rs. {(site.overtime_rate || 0).toLocaleString()}</span>
                            </div>

                            <button
                                onClick={() => {
                                    setActiveAddSiteId(site.site_id);
                                    setSelectedRequirementIndex(0);
                                    setGuardSearch('');
                                }}
                                style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '6px', 
                                    background: '#ffffff', 
                                    color: '#059669', 
                                    border: 'none', 
                                    padding: '7px 16px', 
                                    borderRadius: '6px', 
                                    fontWeight: 800, 
                                    fontSize: '0.88rem', 
                                    cursor: 'pointer', 
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)' 
                                }}
                            >
                                <i className='bx bx-user-plus'></i> Add Guard
                            </button>

                            {/* Location Header Direct Save Button */}
                            <button
                                onClick={handleSaveChanges}
                                disabled={saving || (dirtyUpdates.size === 0 && addedGuards.length === 0 && removedGuards.length === 0)}
                                style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '6px', 
                                    background: (dirtyUpdates.size > 0 || addedGuards.length > 0 || removedGuards.length > 0) ? '#ffffff' : 'rgba(255, 255, 255, 0.25)', 
                                    color: (dirtyUpdates.size > 0 || addedGuards.length > 0 || removedGuards.length > 0) ? '#059669' : 'rgba(255, 255, 255, 0.7)', 
                                    border: 'none', 
                                    padding: '7px 16px', 
                                    borderRadius: '6px', 
                                    fontWeight: 800, 
                                    fontSize: '0.88rem', 
                                    cursor: (dirtyUpdates.size > 0 || addedGuards.length > 0 || removedGuards.length > 0) ? 'pointer' : 'default', 
                                    boxShadow: (dirtyUpdates.size > 0 || addedGuards.length > 0 || removedGuards.length > 0) ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
                                    transition: 'all 0.15s ease'
                                }}
                                title="Save changes across all locations"
                            >
                                <i className='bx bx-save'></i> {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>

                    {/* Table Spreadsheet Matrix */}
                    <div style={{ overflowX: 'auto', width: '100%' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'center' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', color: '#475569', borderBottom: '2px solid #cbd5e1' }}>
                                    <th style={{ padding: '8px 6px', width: '32px', position: 'sticky', left: 0, background: '#f8fafc', zIndex: 3 }}>#</th>
                                    <th style={{ padding: '8px 8px', width: '65px', position: 'sticky', left: '32px', background: '#f8fafc', zIndex: 3, textAlign: 'left' }}>Code</th>
                                    <th style={{ padding: '8px 8px', width: '55px', position: 'sticky', left: '97px', background: '#f8fafc', zIndex: 3 }}>Desig</th>
                                    <th style={{ padding: '8px 12px', minWidth: '160px', position: 'sticky', left: '152px', background: '#f8fafc', zIndex: 3, textAlign: 'left' }}>Guard Name</th>

                                    {/* Days 1 to 31 */}
                                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                                        const isTodayHeader = (d === todayDay);
                                        return (
                                            <th 
                                                key={d} 
                                                style={{ 
                                                    padding: '8px 4px', 
                                                    minWidth: '34px', 
                                                    borderLeft: '1px solid #e2e8f0',
                                                    background: isTodayHeader ? '#ecfdf5' : '#f8fafc',
                                                    color: isTodayHeader ? '#059669' : '#334155',
                                                    fontWeight: isTodayHeader ? 800 : 700
                                                }}
                                            >
                                                {d}
                                            </th>
                                        );
                                    })}

                                    <th style={{ padding: '8px 8px', minWidth: '40px', borderLeft: '2px solid #cbd5e1', background: '#f8fafc', color: '#059669', fontWeight: 800 }}>P</th>
                                    <th style={{ padding: '8px 8px', minWidth: '40px', borderLeft: '1px solid #e2e8f0', background: '#f8fafc', color: '#2563eb', fontWeight: 800 }}>O</th>
                                    <th style={{ padding: '8px 8px', minWidth: '40px', borderLeft: '1px solid #e2e8f0', background: '#f8fafc', color: '#d97706', fontWeight: 800 }}>D</th>
                                    <th style={{ padding: '8px 8px', minWidth: '45px', borderLeft: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', fontWeight: 800 }}>W/L</th>
                                    <th style={{ padding: '8px 8px', minWidth: '55px', borderLeft: '1px solid #e2e8f0', background: '#f8fafc', color: '#059669', fontWeight: 800 }}>Pay Days</th>
                                    <th style={{ padding: '8px 6px', width: '36px', borderLeft: '1px solid #e2e8f0', background: '#f8fafc' }}>Act</th>
                                </tr>
                            </thead>
                            <tbody>
                                {site.guards.length === 0 ? (
                                    <tr>
                                        <td colSpan={daysInMonth + 10} style={{ padding: '24px', color: '#94a3b8', textAlign: 'center', background: '#ffffff' }}>
                                            No guards currently deployed at this site for {month}/{year}. Click <strong>[ + Add Guard ]</strong> above to assign personnel.
                                        </td>
                                    </tr>
                                ) : (
                                    site.guards.map((guard, idx) => (
                                        <tr key={guard.employee_id} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                                            <td style={{ padding: '6px 4px', position: 'sticky', left: 0, background: idx % 2 === 0 ? '#ffffff' : '#f8fafc', zIndex: 2, color: '#94a3b8', fontWeight: 600 }}>
                                                {idx + 1}
                                            </td>
                                            <td style={{ padding: '6px 8px', position: 'sticky', left: '32px', background: idx % 2 === 0 ? '#ffffff' : '#f8fafc', zIndex: 2, fontWeight: 800, color: '#0284c7', textAlign: 'left' }}>
                                                {guard.employee_code}
                                            </td>
                                            <td style={{ padding: '6px 4px', position: 'sticky', left: '97px', background: idx % 2 === 0 ? '#ffffff' : '#f8fafc', zIndex: 2 }}>
                                                <span style={{ 
                                                    padding: '2px 7px', 
                                                    borderRadius: '4px', 
                                                    fontSize: '0.72rem', 
                                                    fontWeight: 800,
                                                    background: guard.designation === 'SUP' ? '#f3e8ff' : guard.designation === 'CPO' ? '#ecfdf5' : guard.designation === 'LADY' ? '#fdf2f8' : '#f0f9ff',
                                                    color: guard.designation === 'SUP' ? '#7e22ce' : guard.designation === 'CPO' ? '#059669' : guard.designation === 'LADY' ? '#db2777' : '#0369a1',
                                                    border: '1px solid ' + (guard.designation === 'SUP' ? '#d8b4fe' : guard.designation === 'CPO' ? '#6ee7b7' : guard.designation === 'LADY' ? '#fbcfe8' : '#bae6fd')
                                                }}>
                                                    {guard.designation}
                                                </span>
                                            </td>
                                            <td style={{ padding: '6px 12px', position: 'sticky', left: '152px', background: idx % 2 === 0 ? '#ffffff' : '#f8fafc', zIndex: 2, textAlign: 'left', fontWeight: 700, color: 'var(--color-text, #0f172a)', whiteSpace: 'nowrap' }}>
                                                {guard.name}
                                            </td>

                                            {/* Days 1 to 31 Interactive Input Cells */}
                                            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                                                const cellVal = guard.days[String(d)] || '';

                                                let cellBg = 'transparent';
                                                let cellColor = '#334155';
                                                let borderStyle = '1px solid #e2e8f0';

                                                if (cellVal === 'P' || cellVal === '1') {
                                                    cellBg = '#dcfce7';
                                                    cellColor = '#15803d';
                                                } else if (cellVal === 'O' || cellVal === 'OT') {
                                                    cellBg = '#dbeafe';
                                                    cellColor = '#1d4ed8';
                                                } else if (cellVal === 'D' || cellVal === 'WO+OT' || cellVal === 'DS') {
                                                    cellBg = '#fef3c7';
                                                    cellColor = '#b45309';
                                                } else if (cellVal === 'W' || cellVal === 'WO') {
                                                    cellBg = '#f1f5f9';
                                                    cellColor = '#64748b';
                                                } else if (cellVal === 'A') {
                                                    cellBg = '#fee2e2';
                                                    cellColor = '#b91c1c';
                                                } else if (['L', 'PL', 'SL'].includes(cellVal)) {
                                                    cellBg = '#f3e8ff';
                                                    cellColor = '#7e22ce';
                                                }

                                                return (
                                                    <td 
                                                        key={d} 
                                                        style={{ 
                                                            padding: '2px', 
                                                            borderLeft: borderStyle,
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
                                                                fontWeight: 800,
                                                                fontSize: '0.85rem',
                                                                outline: 'none',
                                                                cursor: 'pointer'
                                                            }}
                                                        />
                                                    </td>
                                                );
                                            })}

                                            <td style={{ padding: '6px 4px', borderLeft: '2px solid #cbd5e1', fontWeight: 800, color: '#15803d', background: '#f0fdf4' }}>{guard.total_present}</td>
                                            <td style={{ padding: '6px 4px', borderLeft: '1px solid #e2e8f0', fontWeight: 800, color: '#2563eb', background: '#eff6ff' }}>{guard.total_ot}</td>
                                            <td style={{ padding: '6px 4px', borderLeft: '1px solid #e2e8f0', fontWeight: 800, color: '#b45309', background: '#fffbeb' }}>{guard.total_ds}</td>
                                            <td style={{ padding: '6px 4px', borderLeft: '1px solid #e2e8f0', fontWeight: 700, color: '#64748b' }}>{guard.total_wo + guard.total_leave}</td>
                                            <td style={{ padding: '6px 4px', borderLeft: '1px solid #e2e8f0', fontWeight: 800, color: '#059669', background: '#ecfdf5' }}>{guard.payable_days}</td>
                                            <td style={{ padding: '6px 4px', borderLeft: '1px solid #e2e8f0' }}>
                                                <button
                                                    onClick={() => handleRemoveGuard(site.site_id, guard.employee_id, guard.name)}
                                                    style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: '2px', fontSize: '1.1rem' }}
                                                    title="Remove Guard from site roster"
                                                >
                                                    <i className='bx bx-trash'></i>
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}

                                {/* Red Paid Vacations Summary Row (Matching Screenshot) */}
                                <tr style={{ background: '#fef2f2', borderTop: '2px solid #fca5a5', color: '#b91c1c', fontWeight: 800 }}>
                                    <td colSpan={4} style={{ padding: '8px 14px', textAlign: 'left', position: 'sticky', left: 0, background: '#fef2f2', zIndex: 2 }}>
                                        Paid Vac / Leaves
                                    </td>
                                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => (
                                        <td key={d} style={{ padding: '4px', borderLeft: '1px solid #fecaca' }}>
                                            {site.daily_vacations[String(d)] || 0}
                                        </td>
                                    ))}
                                    <td colSpan={6} style={{ borderLeft: '2px solid #cbd5e1' }}></td>
                                </tr>

                                {/* Daily Deployed Total Row (Matching Screenshot) */}
                                <tr style={{ background: '#ecfdf5', borderTop: '2px solid #6ee7b7', color: '#047857', fontWeight: 900 }}>
                                    <td colSpan={4} style={{ padding: '8px 14px', textAlign: 'left', position: 'sticky', left: 0, background: '#ecfdf5', zIndex: 2 }}>
                                        Total Deployed On Site
                                    </td>
                                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => (
                                        <td key={d} style={{ padding: '4px', borderLeft: '1px solid #a7f3d0' }}>
                                            {site.daily_totals[String(d)] || 0}
                                        </td>
                                    ))}
                                    <td colSpan={6} style={{ borderLeft: '2px solid #cbd5e1' }}></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            ))}

            {/* Modal: Add Guard to Site Block */}
            {activeAddSiteId && (() => {
                const activeSiteObj = sitesData.find(s => s.site_id === activeAddSiteId);
                const reqList: SiteRequirement[] = (activeSiteObj?.requirements && activeSiteObj.requirements.length > 0)
                    ? activeSiteObj.requirements
                    : [
                        {
                            post_id: null,
                            post_name: 'Security Guard',
                            designation_id: null,
                            designation_code: 'GD',
                            designation_name: 'Security Guard',
                            required_headcount: activeSiteObj?.guards_req || 0,
                            monthly_pay_rate: activeSiteObj?.guards_sal || 35000,
                            overtime_rate: activeSiteObj?.overtime_rate || 0
                        },
                        {
                            post_id: null,
                            post_name: 'Security Supervisor',
                            designation_id: null,
                            designation_code: 'SUP',
                            designation_name: 'Security Supervisor',
                            required_headcount: activeSiteObj?.supervisors_req || 0,
                            monthly_pay_rate: activeSiteObj?.supervisors_sal || 45000,
                            overtime_rate: activeSiteObj?.overtime_rate || 0
                        }
                    ];
                const activeReq = reqList[selectedRequirementIndex] || reqList[0];

                return (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '20px' }}>
                        <div style={{ background: 'var(--color-surface, #ffffff)', width: '100%', maxWidth: '620px', borderRadius: '16px', border: '1px solid var(--color-border, #cbd5e1)', padding: '24px', boxShadow: '0 25px 40px -10px rgba(0, 0, 0, 0.3)', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '90vh' }}>
                            {/* Modal Header */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--color-text, #0f172a)', fontWeight: 800 }}>Assign Guard to Site Roster</h3>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #64748b)', marginTop: '2px' }}>
                                        Deploy personnel against client post requirements with automatic role-based compensation
                                    </div>
                                </div>
                                <button onClick={() => setActiveAddSiteId(null)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '1.3rem', cursor: 'pointer', padding: '4px' }}>✕</button>
                            </div>

                            {/* Uneditable Location & Client Header Banner */}
                            <div style={{ background: 'var(--color-bg, #f8fafc)', border: '1px solid var(--color-border, #e2e8f0)', borderRadius: '10px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                <div>
                                    <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--color-text-muted, #64748b)', fontWeight: 700, letterSpacing: '0.5px' }}>Operational Location</span>
                                    <div style={{ fontWeight: 800, color: '#059669', fontSize: '1rem' }}>
                                        📍 {activeSiteObj?.site_name}
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--color-text-muted, #64748b)', fontWeight: 700, letterSpacing: '0.5px' }}>Client / Company</span>
                                    <div style={{ fontWeight: 700, color: 'var(--color-text, #0f172a)', fontSize: '0.88rem' }}>
                                        🏢 {activeSiteObj?.customer_name}
                                    </div>
                                </div>
                            </div>

                            {/* Position / Requirement Selector Dropdown */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-text, #0f172a)' }}>
                                    Select Post / Requirement for this Assignment: <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <select
                                    value={selectedRequirementIndex}
                                    onChange={(e) => setSelectedRequirementIndex(Number(e.target.value))}
                                    style={{
                                        width: '100%',
                                        padding: '10px 14px',
                                        borderRadius: '8px',
                                        background: 'var(--color-surface, #ffffff)',
                                        border: '2px solid #0284c7',
                                        color: 'var(--color-text, #0f172a)',
                                        fontWeight: 700,
                                        fontSize: '0.92rem',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {reqList.map((req, idx) => (
                                        <option key={idx} value={idx}>
                                            {req.designation_name} ({req.designation_code}) — Req: {req.required_headcount} | Salary: Rs. {req.monthly_pay_rate.toLocaleString()}/mo | OT: Rs. {req.overtime_rate.toLocaleString()}/day
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Selected Position Compensation & Details Pill (Uneditable) */}
                            {activeReq && (
                                <div style={{ background: activeReq.designation_code === 'SUP' ? 'rgba(126, 34, 206, 0.06)' : 'rgba(2, 132, 199, 0.06)', border: `1px solid ${activeReq.designation_code === 'SUP' ? '#d8b4fe' : '#bae6fd'}`, borderRadius: '10px', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span style={{
                                            padding: '4px 10px',
                                            borderRadius: '6px',
                                            fontWeight: 800,
                                            fontSize: '0.82rem',
                                            background: activeReq.designation_code === 'SUP' ? '#7e22ce' : '#0284c7',
                                            color: '#ffffff'
                                        }}>
                                            {activeReq.designation_code}
                                        </span>
                                        <div>
                                            <strong style={{ fontSize: '0.9rem', color: 'var(--color-text, #0f172a)' }}>{activeReq.designation_name}</strong>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #64748b)' }}>
                                                Daily Rate: <strong>Rs. {(activeReq.monthly_pay_rate / daysInMonth).toFixed(2)}/day</strong>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#059669' }}>
                                            Rs. {activeReq.monthly_pay_rate.toLocaleString()} <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>/ mo</span>
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #64748b)' }}>
                                            OT Rate: <strong>Rs. {activeReq.overtime_rate.toLocaleString()}</strong>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Workforce Personnel Search Input */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-text, #0f172a)' }}>
                                    Search Personnel to Assign:
                                </label>
                                <input
                                    type="text"
                                    placeholder="🔍 Search by Employee Code (e.g. 009450) or Name..."
                                    value={guardSearch}
                                    onChange={(e) => setGuardSearch(e.target.value)}
                                    autoFocus
                                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', background: 'var(--color-bg, #f8fafc)', border: '1px solid var(--color-border, #cbd5e1)', color: 'var(--color-text, #0f172a)', fontSize: '0.92rem' }}
                                />
                            </div>

                            {/* Filtered Direct Workforce Personnel List */}
                            <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
                                {allEmployees
                                    .filter(e => {
                                        if (!guardSearch.trim()) return true;
                                        const q = guardSearch.toLowerCase().trim();
                                        const qNoZero = q.replace(/^0+/, '');
                                        const prevCode = (e.previous_employee_code || '').toLowerCase();
                                        const prevCodeNoZero = prevCode.replace(/^0+/, '');
                                        const dispCode = (e.display_code || '').toLowerCase();
                                        const dispCodeNoZero = dispCode.replace(/^0+/, '');
                                        const empCode = (e.employee_code || '').toLowerCase();
                                        const empCodeNoZero = empCode.replace(/^0+/, '');
                                        const nameStr = `${e.first_name || ''} ${e.last_name || ''}`.toLowerCase();

                                        return (
                                            prevCode.includes(q) ||
                                            (qNoZero && prevCodeNoZero.includes(qNoZero)) ||
                                            dispCode.includes(q) ||
                                            (dispCodeNoZero && dispCodeNoZero.includes(qNoZero)) ||
                                            empCode.includes(q) ||
                                            (qNoZero && empCodeNoZero.includes(qNoZero)) ||
                                            nameStr.includes(q)
                                        );
                                    })
                                    .slice(0, 30)
                                    .map(emp => (
                                        <div
                                            key={emp.id}
                                            onClick={() => handleAddGuardToSite(emp, activeReq)}
                                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', background: 'var(--color-bg, #f8fafc)', border: '1px solid var(--color-border, #e2e8f0)', cursor: 'pointer', transition: 'all 0.15s' }}
                                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#059669'; e.currentTarget.style.background = '#f0fdf4'; }}
                                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border, #e2e8f0)'; e.currentTarget.style.background = 'var(--color-bg, #f8fafc)'; }}
                                        >
                                            <div>
                                                <strong style={{ color: 'var(--color-text, #0f172a)', fontSize: '0.92rem' }}>{emp.first_name} {emp.last_name}</strong>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #64748b)', marginTop: '2px' }}>
                                                    Code: <span style={{ color: '#0284c7', fontWeight: 800 }}>{emp.previous_employee_code || emp.display_code || emp.employee_code}</span> | Base: {emp.designation_name || emp.designation?.name || 'Guard'} | {emp.city || 'KHI'}
                                                </div>
                                            </div>
                                            <button style={{ background: '#059669', color: '#ffffff', border: 'none', padding: '6px 14px', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 800, pointerEvents: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                + Deploy as {activeReq?.designation_code || 'GD'}
                                            </button>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Modal: Import Excel Sheet */}
            {showImportModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '20px' }}>
                    <div style={{ background: 'var(--color-surface, #ffffff)', width: '100%', maxWidth: '500px', borderRadius: '14px', border: '1px solid var(--color-border, #cbd5e1)', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--color-text, #0f172a)', fontWeight: 800 }}>Import Monthly Muster Excel</h3>
                            <button onClick={() => setShowImportModal(false)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
                        </div>

                        <form onSubmit={handleImportSubmit}>
                            <div style={{ padding: '24px', border: '2px dashed var(--color-border, #cbd5e1)', borderRadius: '10px', textAlign: 'center', marginBottom: '16px', background: 'var(--color-bg, #f8fafc)' }}>
                                <i className='bx bx-file' style={{ fontSize: '2.8rem', color: '#0284c7', marginBottom: '8px' }}></i>
                                <p style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--color-text, #0f172a)', fontWeight: 600 }}>Select Excel workbook (.xlsx)</p>
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
                                    style={{ padding: '8px 18px', borderRadius: '6px', background: 'var(--color-surface, #ffffff)', color: 'var(--color-text, #0f172a)', border: '1px solid var(--color-border, #cbd5e1)', fontWeight: 700, cursor: 'pointer' }}
                                >
                                    Browse File
                                </button>
                                {importFile && (
                                    <div style={{ marginTop: '12px', color: '#15803d', fontWeight: 700, fontSize: '0.88rem' }}>
                                        ✓ Selected: {importFile.name} ({(importFile.size / 1024).toFixed(1)} KB)
                                    </div>
                                )}
                            </div>

                            <div style={{ background: '#f0f9ff', padding: '12px', borderRadius: '8px', border: '1px solid #bae6fd', marginBottom: '16px', fontSize: '0.82rem', color: '#0369a1' }}>
                                <strong>Import Rules:</strong>
                                <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                                    <li>Matches green location header text to CRM site names.</li>
                                    <li><code>1</code> or <code>P</code> maps to Present.</li>
                                    <li><code>OT</code> maps to Overtime, <code>WO+OT</code> to Double Shift.</li>
                                    <li>Past blanks default to Absent; future dates remain blank.</li>
                                </ul>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button
                                    type="button"
                                    onClick={() => setShowImportModal(false)}
                                    style={{ padding: '8px 16px', borderRadius: '8px', background: 'var(--color-bg, #f1f5f9)', color: 'var(--color-text, #0f172a)', border: '1px solid var(--color-border, #cbd5e1)', fontWeight: 600, cursor: 'pointer' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={importing || !importFile}
                                    style={{ padding: '8px 20px', borderRadius: '8px', background: '#0284c7', color: '#ffffff', border: 'none', fontWeight: 800, cursor: importing || !importFile ? 'default' : 'pointer' }}
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
