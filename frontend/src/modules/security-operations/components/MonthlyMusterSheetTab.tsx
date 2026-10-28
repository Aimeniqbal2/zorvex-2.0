import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    getMonthlyMusterGrid, 
    saveMonthlyMusterUpdates, 
    importMonthlyMusterExcel, 
    cleanupOrphanedAttendance, 
    freezeMonthlyMuster, 
    getAutoAttendanceConfig, 
    updateAutoAttendanceConfig, 
    runAutoAttendance, 
    apiClient 
} from '../api';
import type { AutoAttendanceConfig } from '../api';
import { useToastStore } from '../../../stores/toastStore';
import { TemporaryServicesMusterSection } from './TemporaryServicesMusterSection';

interface GuardRow {
    employee_id: string;
    employee_code: string;
    name: string;
    designation: string;
    designation_full: string;
    post_id?: string | null;
    designation_id?: string | null;
    background_type?: string | null;
    is_primary: boolean;
    days: Record<string, string>;
    total_present: number;
    total_ot: number;
    total_od?: number;
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
    dozing_overtime_rate?: number;
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
    dozing_overtime_rate?: number;
    requirements?: SiteRequirement[];
    guards: GuardRow[];
    daily_totals: Record<string, number>;
    daily_vacations: Record<string, number>;
}

interface MonthlyMusterSheetTabProps {
    onBack?: () => void;
}

export const normalizeDesigCode = (nameOrTitle?: string, explicitCode?: string): string => {
    if (explicitCode) {
        const c = explicitCode.trim().toUpperCase();
        if (['SUP', 'GD', 'CPO', 'LADY', 'CCTV', 'DEO', 'DVR', 'AG'].includes(c)) return c;
        if (c.includes('SUP')) return 'SUP';
        if (c.includes('CPO')) return 'CPO';
        if (c.includes('LADY')) return 'LADY';
        if (c.includes('CCTV')) return 'CCTV';
        if (c.includes('DEO')) return 'DEO';
    }
    const title = (nameOrTitle || '').toLowerCase().trim();
    if (title.includes('supervisor') || title.split(/\s+/).includes('sup')) return 'SUP';
    if (title.includes('close protection') || title.includes('cpo')) return 'CPO';
    if (title.includes('lady') || title.includes('searcher')) return 'LADY';
    if (title.includes('cctv')) return 'CCTV';
    if (title.includes('data entry') || title.includes('deo')) return 'DEO';
    if (title.includes('driver')) return 'DVR';
    if (title.includes('gunman') || title.includes('armed guard')) return 'AG';
    return 'GD';
};

export const getDesigBadgeStyle = (code: string) => {
    switch (code) {
        case 'SUP':
            return { bg: '#f3e8ff', color: '#7e22ce', border: '#d8b4fe' };
        case 'CPO':
            return { bg: '#ecfdf5', color: '#059669', border: '#6ee7b7' };
        case 'LADY':
            return { bg: '#fdf2f8', color: '#db2777', border: '#fbcfe8' };
        case 'CCTV':
            return { bg: '#fffbeb', color: '#b45309', border: '#fde68a' };
        case 'DEO':
            return { bg: '#e0e7ff', color: '#4338ca', border: '#c7d2fe' };
        case 'GD':
        default:
            return { bg: '#f0f9ff', color: '#0369a1', border: '#bae6fd' };
    }
};

export type GuardSubBadge = 'C' | 'EX' | 'SSG' | null;

export const getGuardSubBadge = (
    guard: GuardRow,
    siteRequirements?: SiteRequirement[]
): GuardSubBadge => {
    const dCode = normalizeDesigCode(guard.designation_full, guard.designation);

    // DEO has no civil/ex distinction per industry domain rules
    if (dCode === 'DEO') return null;

    // 1. Direct check on designation_full (e.g. 'Security Guard Civil', 'Supervisor Ex-Army', 'Close Protection Officer Ex-SSG Commando')
    const full = (guard.designation_full || '').toLowerCase();
    if (full.includes('ssg')) return 'SSG';
    if (full.includes('ex-army') || full.includes('ex army') || full.includes('ex_army') || full.includes('ex-military') || full.endsWith('_ex') || full.includes(' ex')) {
        return 'EX';
    }
    if (full.includes('civil') || full.includes('civilian') || full.endsWith('_civ') || full.includes(' civ')) {
        return 'C';
    }

    // 2. Check matched requirement by post_id
    if (siteRequirements && siteRequirements.length > 0) {
        if (guard.post_id) {
            const req = siteRequirements.find(r => r.post_id === guard.post_id);
            if (req) {
                const rTitle = (req.designation_name || req.post_name || '').toLowerCase();
                if (rTitle.includes('ssg')) return 'SSG';
                if (rTitle.includes('ex-army') || rTitle.includes('ex army') || rTitle.includes('ex_army')) return 'EX';
                if (rTitle.includes('civil') || rTitle.includes('civilian')) return 'C';
            }
        }

        // 3. Check matched requirement by designation_id
        if (guard.designation_id) {
            const req = siteRequirements.find(r => r.designation_id === guard.designation_id);
            if (req) {
                const rTitle = (req.designation_name || req.post_name || '').toLowerCase();
                if (rTitle.includes('ssg')) return 'SSG';
                if (rTitle.includes('ex-army') || rTitle.includes('ex army') || rTitle.includes('ex_army')) return 'EX';
                if (rTitle.includes('civil') || rTitle.includes('civilian')) return 'C';
            }
        }

        // 4. Requirement deduction:
        // Filter site requirements that belong to this designation code (e.g. all SUP, all GD, or all CPO)
        const matchingReqs = siteRequirements.filter(r => normalizeDesigCode(r.designation_name, r.designation_code) === dCode);
        if (matchingReqs.length > 0) {
            const hasSSG = matchingReqs.some(r => (r.designation_name || r.post_name || '').toLowerCase().includes('ssg'));
            const hasEx = matchingReqs.some(r => {
                const t = (r.designation_name || r.post_name || '').toLowerCase();
                return t.includes('ex-army') || t.includes('ex army') || t.includes('ex_army');
            });
            const hasCiv = matchingReqs.some(r => {
                const t = (r.designation_name || r.post_name || '').toLowerCase();
                return t.includes('civil') || t.includes('civilian');
            });

            // If the site exclusively requires one background type for this role, assign it!
            if (hasSSG && !hasEx && !hasCiv) return 'SSG';
            if (hasEx && !hasSSG && !hasCiv) return 'EX';
            if (hasCiv && !hasSSG && !hasEx) return 'C';

            // If both Civil and Ex-Army are required at this site:
            if (guard.background_type === 'EX_ARMY') return 'EX';
            if (guard.background_type === 'CIVILIAN') return 'C';
        }
    }

    // 5. Fallback to employee background_type
    if (guard.background_type === 'EX_ARMY') return 'EX';
    if (guard.background_type === 'CIVILIAN') return 'C';

    // 6. Common default for security roles (GD, SUP, CPO, CCTV)
    if (['GD', 'SUP', 'CPO', 'CCTV'].includes(dCode)) {
        return 'C';
    }

    return null;
};

export const getSubBadgeStyle = (sub: GuardSubBadge) => {
    switch (sub) {
        case 'EX':
            return {
                bg: '#fef3c7',
                color: '#92400e',
                border: '#fde68a',
                label: 'Ex-Army'
            };
        case 'SSG':
            return {
                bg: '#fee2e2',
                color: '#991b1b',
                border: '#fca5a5',
                label: 'Ex-SSG Commando'
            };
        case 'C':
        default:
            return {
                bg: '#f1f5f9',
                color: '#475569',
                border: '#cbd5e1',
                label: 'Civilian'
            };
    }
};

export const MonthlyMusterSheetTab: React.FC<MonthlyMusterSheetTabProps> = ({ onBack }) => {
    const { addToast } = useToastStore();
    const today = new Date();

    const [musterMode, setMusterMode] = useState<'REGULAR' | 'TEMPORARY'>('REGULAR');
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

    // Clean Orphaned Attendance state
    const [cleaning, setCleaning] = useState<boolean>(false);

    // Frozen Month State
    const [isFrozen, setIsFrozen] = useState<boolean>(false);
    const [freezing, setFreezing] = useState<boolean>(false);
    const [hoveredRowKey, setHoveredRowKey] = useState<string | null>(null);

    // Auto Attendance State
    const [autoConfig, setAutoConfig] = useState<AutoAttendanceConfig | null>(null);
    const [showAutoModal, setShowAutoModal] = useState<boolean>(false);
    const [savingAutoConfig, setSavingAutoConfig] = useState<boolean>(false);
    const [runningAuto, setRunningAuto] = useState<boolean>(false);

    // Auto Attendance Modal Form State
    const [modalIsEnabled, setModalIsEnabled] = useState<boolean>(true);
    const [modalDelayDays, setModalDelayDays] = useState<number>(2);
    const [modalTargetDate, setModalTargetDate] = useState<string>('');
    const [modalFillMonth, setModalFillMonth] = useState<boolean>(true);
    const [modalOverwrite, setModalOverwrite] = useState<boolean>(false);

    // Can freeze if not already frozen and month is ended (past month or at month-end day)
    const canFreeze = useMemo(() => {
        if (isFrozen) return false;
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        const currentDay = now.getDate();
        const isPastMonth = (currentYear > year) || (currentYear === year && currentMonth > month);
        const isCurrentMonthEnd = (currentYear === year && currentMonth === month && currentDay >= (daysInMonth - 1));
        return isPastMonth || isCurrentMonthEnd;
    }, [isFrozen, year, month, daysInMonth]);

    // Scroll synchronization refs between sticky header and table body
    const headerRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const bodyRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const isSyncingRef = useRef<Record<string, boolean>>({});

    const syncBodyScroll = (siteId: string, scrollLeft: number) => {
        if (isSyncingRef.current[siteId]) return;
        const bdy = bodyRefs.current[siteId];
        if (bdy && Math.abs(bdy.scrollLeft - scrollLeft) > 0.5) {
            isSyncingRef.current[siteId] = true;
            bdy.scrollLeft = scrollLeft;
            requestAnimationFrame(() => {
                isSyncingRef.current[siteId] = false;
            });
        }
    };

    const syncHeaderScroll = (siteId: string, scrollLeft: number) => {
        if (isSyncingRef.current[siteId]) return;
        const hdr = headerRefs.current[siteId];
        if (hdr && Math.abs(hdr.scrollLeft - scrollLeft) > 0.5) {
            isSyncingRef.current[siteId] = true;
            hdr.scrollLeft = scrollLeft;
            requestAnimationFrame(() => {
                isSyncingRef.current[siteId] = false;
            });
        }
    };

    const handleFreezeMonth = async () => {
        const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const confirmed = window.confirm(
            `Are you sure you want to permanently freeze and close ${monthNames[month]} ${year}?\n\nThis will lock all attendance and salary calculations as official payroll history and cannot be undone.`
        );
        if (!confirmed) return;

        try {
            setFreezing(true);
            const res = await freezeMonthlyMuster(year, month);
            addToast('success', res.message || `Month ${monthNames[month]} ${year} has been permanently frozen.`);
            await loadMusterData();
        } catch (err: any) {
            addToast('error', err?.response?.data?.detail || 'Failed to freeze month.');
        } finally {
            setFreezing(false);
        }
    };

    // Collapsible site cards tracker
    const [collapsedSites, setCollapsedSites] = useState<Set<string>>(new Set());
    const toggleSiteCollapse = (siteId: string) => {
        setCollapsedSites(prev => {
            const next = new Set(prev);
            if (next.has(siteId)) next.delete(siteId);
            else next.add(siteId);
            return next;
        });
    };

    const loadMusterData = async () => {
        try {
            setLoading(true);
            const res = await getMonthlyMusterGrid(year, month);
            setSitesData(res.sites || []);
            setDaysInMonth(res.days_in_month || 31);
            setTodayDay(res.today_day || today.getDate());
            setIsFrozen(Boolean(res.is_frozen));
            if (res.auto_attendance_config) {
                setAutoConfig(res.auto_attendance_config);
                setModalIsEnabled(res.auto_attendance_config.is_enabled);
                setModalDelayDays(res.auto_attendance_config.delay_days);
            }
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

    const fetchAutoConfig = async () => {
        try {
            const cfg = await getAutoAttendanceConfig();
            setAutoConfig(cfg);
            setModalIsEnabled(cfg.is_enabled);
            setModalDelayDays(cfg.delay_days);
        } catch (e) {
            console.error('Failed to load auto attendance config:', e);
        }
    };

    const handleSaveAutoConfig = async () => {
        try {
            setSavingAutoConfig(true);
            const updated = await updateAutoAttendanceConfig({
                is_enabled: modalIsEnabled,
                delay_days: modalDelayDays,
            });
            setAutoConfig(updated);
            addToast('success', updated.detail || 'Auto attendance settings updated.');
            setShowAutoModal(false);
        } catch (err: any) {
            addToast('error', err?.response?.data?.detail || 'Failed to update auto attendance settings.');
        } finally {
            setSavingAutoConfig(false);
        }
    };

    const handleTriggerRunAuto = async () => {
        if (isFrozen) {
            addToast('warning', 'This month is frozen and locked. Auto-attendance cannot modify frozen records.');
            return;
        }
        try {
            setRunningAuto(true);
            const payload: any = {
                fill_month_up_to_target: modalFillMonth,
                overwrite_existing: modalOverwrite,
            };
            if (modalTargetDate.trim()) {
                payload.target_date = modalTargetDate.trim();
            }
            const res = await runAutoAttendance(payload);
            if (res.status === 'success') {
                addToast('success', `⚡ Auto Attendance Completed: ${res.new_records_created} records created (${res.existing_records_skipped} existing preserved) for date ${res.target_date}.`);
                await loadMusterData();
                if (autoConfig) {
                    setAutoConfig({
                        ...autoConfig,
                        last_run_at: new Date().toISOString(),
                        last_run_date: res.target_date,
                    });
                }
            } else {
                addToast('info', res.message || 'Auto attendance completed with no updates.');
            }
        } catch (err: any) {
            console.error('Failed to run auto attendance:', err);
            addToast('error', err?.response?.data?.detail || 'Failed to run auto attendance.');
        } finally {
            setRunningAuto(false);
        }
    };

    const calculatedTargetDate = useMemo(() => {
        const d = new Date();
        d.setDate(d.getDate() - modalDelayDays);
        const yr = d.getFullYear();
        const mo = String(d.getMonth() + 1).padStart(2, '0');
        const dy = String(d.getDate()).padStart(2, '0');
        return `${yr}-${mo}-${dy}`;
    }, [modalDelayDays]);

    const calculatedPrevDate = useMemo(() => {
        const d = new Date();
        d.setDate(d.getDate() - modalDelayDays - 1);
        const yr = d.getFullYear();
        const mo = String(d.getMonth() + 1).padStart(2, '0');
        const dy = String(d.getDate()).padStart(2, '0');
        return `${yr}-${mo}-${dy}`;
    }, [modalDelayDays]);

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
        if (isFrozen) {
            addToast('warning', 'This month is frozen and locked. Attendance and duty cells cannot be modified.');
            return;
        }

        const raw = rawValue.trim().toUpperCase();
        let val = '';

        // Single letter mapping and aliases
        if (['P', '1'].includes(raw)) val = 'P';
        else if (['O', 'OT'].includes(raw)) val = 'O';
        else if (['OD', 'DOZ', 'DOZING', 'O-D', 'O/D'].includes(raw)) val = 'OD';
        else if (['PO', 'P+O', 'P+OT', 'POT'].includes(raw)) val = 'PO';
        else if (['POD', 'P+OD', 'PD', 'P+DOZ'].includes(raw)) val = 'POD';
        else if (['WP', 'WO+P', 'W+P', 'D', 'DS', 'WO+OT', '2'].includes(raw)) val = 'WP';
        else if (['W', 'WO', 'OFF'].includes(raw)) val = 'W';
        else if (['A', '0'].includes(raw)) val = 'A';
        else if (['L', 'PL', 'SL'].includes(raw)) val = 'L';
        else if (raw === '') val = '';
        else {
            // Check fallback for quick suffix typing
            if (raw.endsWith('OD')) val = 'OD';
            else if (raw.endsWith('POD')) val = 'POD';
            else {
                const lastChar = raw.charAt(raw.length - 1);
                if (['P', '1'].includes(lastChar)) val = 'P';
                else if (lastChar === 'O') val = 'O';
                else if (lastChar === 'W') val = 'W';
                else if (lastChar === 'A') val = 'A';
                else if (lastChar === 'L') val = 'L';
                else {
                    addToast('warning', `Allowed codes: P (Present), O (Active OT), OD (OT Dozing), PO (Present+OT), POD (Present+OT Dozing), WP (Worked Week Off), W (Weekly Off), A (Absent), L (Leave).`);
                    return;
                }
            }
        }

        // Anti-Cheating Cross-Location & Shift Capacity Validation:
        if (['P', 'O', 'OD', 'PO', 'POD', 'WP', 'W', 'L', 'A'].includes(val)) {
            for (const otherSite of sitesData) {
                if (otherSite.site_id === siteId) continue;
                const otherGuard = otherSite.guards.find(g => g.employee_id === employeeId);
                if (!otherGuard) continue;
                const otherCode = (otherGuard.days[String(day)] || '').trim().toUpperCase();
                if (!otherCode) continue;

                // Rule 1: A guard cannot be marked Present (P) at two different locations on the same day
                if (val === 'P' && (otherCode === 'P' || otherCode === '1')) {
                    addToast('error', `⚠️ Duplicate Prevented: Guard ${otherGuard.name} (${otherGuard.employee_code}) is already marked Present (P) at "${otherSite.site_name}" on Day ${day}. Only Overtime ("O" or "OD") can be marked here!`);
                    return;
                }

                // Rule 2: PO / POD consumes full capacity (2 shifts / 24 hours) at this location
                if (val === 'PO' || val === 'POD') {
                    addToast('error', `⚠️ Capacity Conflict: Guard ${otherGuard.name} is already assigned at "${otherSite.site_name}" (${otherCode}) on Day ${day}. Full 2-shift capacity consumed!`);
                    return;
                }
                if (['PO', 'POD'].includes(otherCode)) {
                    addToast('error', `⚠️ Capacity Reached: Guard ${otherGuard.name} is already marked ${otherCode} at "${otherSite.site_name}" on Day ${day}. No additional duty allowed!`);
                    return;
                }

                // Rule 3: Worked on Week Off (WP) consumes full daily capacity
                if (val === 'WP') {
                    addToast('error', `⚠️ Capacity Conflict: Guard ${otherGuard.name} is already assigned at "${otherSite.site_name}" (${otherCode}) on Day ${day}. Worked on Week Off (WP) consumes full daily capacity!`);
                    return;
                }
                if (['WP', 'D', 'WO+OT', 'DS', '2'].includes(otherCode)) {
                    addToast('error', `⚠️ Capacity Reached: Guard ${otherGuard.name} already worked on Week Off (WP) at "${otherSite.site_name}" on Day ${day}. No additional duty allowed!`);
                    return;
                }

                // Rule 4: Maximum 1 Overtime shift (O or OD) per day across all sites
                if (['O', 'OD'].includes(val) && ['O', 'OD', 'OT'].includes(otherCode)) {
                    addToast('error', `⚠️ Overtime Limit: Guard ${otherGuard.name} is already marked Overtime (${otherCode}) at "${otherSite.site_name}" on Day ${day}. Maximum 1 overtime shift allowed per day!`);
                    return;
                }

                // Rule 5: Absence (A) or Weekly Off (W) cannot co-exist with active duty at another site
                if ((val === 'A' || val === 'W') && ['P', 'O', 'OD', 'PO', 'POD', 'WP'].includes(otherCode)) {
                    addToast('error', `⚠️ Invariant Conflict: Guard ${otherGuard.name} has active duty at "${otherSite.site_name}" (${otherCode}) on Day ${day}. Cannot mark ${val === 'A' ? 'Absent (A)' : 'Weekly Off (W)'} on another site!`);
                    return;
                }
                if (['A', 'W'].includes(otherCode) && ['P', 'O', 'OD', 'PO', 'POD', 'WP'].includes(val)) {
                    addToast('error', `⚠️ Invariant Conflict: Guard ${otherGuard.name} is marked ${otherCode === 'A' ? 'Absent (A)' : 'Weekly Off (W)'} at "${otherSite.site_name}" on Day ${day}. Cannot mark active duty on another site!`);
                    return;
                }

                // Rule 6: If on Leave (L), cannot perform active duty (P, O, OD, PO, POD, WP)
                if (['P', 'O', 'OD', 'PO', 'POD', 'WP'].includes(val) && ['L', 'PL', 'SL'].includes(otherCode)) {
                    addToast('error', `⚠️ Conflict: Guard ${otherGuard.name} is on Leave (L) at "${otherSite.site_name}" on Day ${day}. Cannot mark active duty while on leave.`);
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
                let p = 0, ot = 0, od = 0, po = 0, pod = 0, wo = 0, wp = 0, a = 0, l = 0;
                Object.values(updatedDays).forEach(c => {
                    if (c === 'P' || c === '1') p++;
                    else if (c === 'O' || c === 'OT') ot++;
                    else if (c === 'OD') od++;
                    else if (c === 'PO') po++;
                    else if (c === 'POD') pod++;
                    else if (c === 'WP' || c === 'D' || c === 'WO+OT' || c === 'DS') wp++;
                    else if (c === 'W' || c === 'WO') wo++;
                    else if (c === 'A') a++;
                    else if (['L', 'PL', 'SL'].includes(c)) l++;
                });

                return {
                    ...guard,
                    days: updatedDays,
                    total_present: p + po + pod,
                    total_ot: ot + po,
                    total_od: od + pod,
                    total_wo: wo,
                    total_ds: wp,
                    total_absent: a,
                    total_leave: l,
                    payable_days: p + po + pod + wo + (wp * 2) + l
                };
            });

            // Recompute site daily totals and vacations
            const newDailyTotals: Record<string, number> = {};
            const newDailyVacations: Record<string, number> = {};
            for (let d = 1; d <= daysInMonth; d++) {
                let dTot = 0;
                let dVac = 0;
                updatedGuards.forEach(g => {
                    const c = (g.days[String(d)] || '').trim().toUpperCase();
                    if (c === 'PO' || c === 'POD') {
                        dTot += 2;
                    } else if (['P', '1', 'O', 'OT', 'OD', 'WP', 'D', 'WO+OT', 'DS'].includes(c)) {
                        dTot += 1;
                    }
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
        if (isFrozen) {
            addToast('warning', 'This month is frozen and locked. Changes cannot be saved.');
            return;
        }

        const totalChanges = dirtyUpdates.size + addedGuards.length + removedGuards.length;
        if (totalChanges === 0) {
            addToast('info', 'No pending changes to save.');
            return;
        }

        const snapshot = JSON.parse(JSON.stringify(sitesData));

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
            setSitesData(snapshot);
            addToast('error', err.response?.data?.detail || 'Failed to save muster updates.');
        } finally {
            setSaving(false);
        }
    };

    // Clean Orphaned Records from Deleted/Inactive Sites
    const handleCleanupOrphanedAttendance = async () => {
        if (isFrozen) {
            addToast('warning', 'This month is frozen and locked. Cannot cleanup records.');
            return;
        }

        if (!window.confirm(`Clean Orphaned Records?\n\nThis will scan and safely remove any obsolete attendance records linked to deleted or inactive locations for ${year}-${String(month).padStart(2, '0')}.\n\nDo you want to proceed?`)) {
            return;
        }
        try {
            setCleaning(true);
            const res = await cleanupOrphanedAttendance(year, month);
            addToast('success', res.message || 'Successfully cleaned up orphaned records from deleted sites.');
            await loadMusterData();
        } catch (err: any) {
            console.error('Failed to clean orphaned records:', err);
            addToast('error', err.response?.data?.detail || 'Failed to clean orphaned records.');
        } finally {
            setCleaning(false);
        }
    };

    // Add Guard to Site Block with Selected Site Requirement/Position
    const handleAddGuardToSite = (emp: any, req: SiteRequirement) => {
        if (isFrozen) {
            addToast('warning', 'This month is frozen and locked. Cannot add new guards.');
            return;
        }

        if (!activeAddSiteId) return;

        // Check if already in this site block
        const targetSite = sitesData.find(s => s.site_id === activeAddSiteId);
        if (targetSite && targetSite.guards.some(g => g.employee_id === String(emp.id))) {
            addToast('warning', `${emp.first_name} is already listed in this location block.`);
            return;
        }

        const desigCode = normalizeDesigCode(req.designation_name, req.designation_code);
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
            post_id: req.post_id || null,
            designation_id: req.designation_id || null,
            background_type: emp.background_type || (desigTitle.toLowerCase().includes('ex-army') ? 'EX_ARMY' : 'CIVILIAN'),
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
        if (isFrozen) {
            addToast('warning', 'This month is frozen and locked. Cannot remove guards.');
            return;
        }

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
                            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text, #0f172a)' }}>
                                {musterMode === 'REGULAR' ? 'Monthly Duty Muster Register' : 'Temporary Services Duty Muster'}
                            </h2>
                            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #64748b)' }}>
                                {musterMode === 'REGULAR' 
                                    ? 'Full-screen operational attendance sheet & overtime matrix' 
                                    : 'Active-date constrained event attendance & dual-wing equipment billing'}
                            </span>
                        </div>
                    </div>

                    {/* Mode Switcher */}
                    <div style={{ display: 'flex', backgroundColor: 'var(--color-bg, #f1f5f9)', padding: '4px', borderRadius: '8px', border: '1px solid var(--color-border, #cbd5e1)' }}>
                        <button
                            type="button"
                            onClick={() => setMusterMode('REGULAR')}
                            style={{
                                padding: '6px 14px',
                                borderRadius: '6px',
                                border: 'none',
                                fontWeight: 700,
                                fontSize: '0.84rem',
                                cursor: 'pointer',
                                backgroundColor: musterMode === 'REGULAR' ? 'var(--color-surface, #ffffff)' : 'transparent',
                                color: musterMode === 'REGULAR' ? '#059669' : 'var(--color-text-muted, #64748b)',
                                boxShadow: musterMode === 'REGULAR' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <i className="bx bx-spreadsheet" style={{ marginRight: '6px' }} />
                            Regular Monthly Muster
                        </button>
                        <button
                            type="button"
                            onClick={() => setMusterMode('TEMPORARY')}
                            style={{
                                padding: '6px 14px',
                                borderRadius: '6px',
                                border: 'none',
                                fontWeight: 700,
                                fontSize: '0.84rem',
                                cursor: 'pointer',
                                backgroundColor: musterMode === 'TEMPORARY' ? 'var(--color-primary, #2563eb)' : 'transparent',
                                color: musterMode === 'TEMPORARY' ? '#ffffff' : 'var(--color-text-muted, #64748b)',
                                boxShadow: musterMode === 'TEMPORARY' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <i className="bx bx-bolt-circle" style={{ marginRight: '6px' }} />
                            Temporary Services Muster
                        </button>
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

                    {/* Month Frozen Badge */}
                    {isFrozen && (
                        <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '6px', 
                            padding: '8px 14px', 
                            borderRadius: '8px', 
                            background: '#fef3c7', 
                            color: '#92400e', 
                            border: '1px solid #fde68a', 
                            fontWeight: 800, 
                            fontSize: '0.88rem' 
                        }}>
                            <i className='bx bx-lock-alt' style={{ fontSize: '1.1rem' }}></i>
                            Month Frozen (Locked)
                        </div>
                    )}

                    {/* Freeze Month Button (Available at month-end or past months) */}
                    {!isFrozen && canFreeze && (
                        <button
                            onClick={handleFreezeMonth}
                            disabled={freezing}
                            style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '6px', 
                                padding: '8px 16px', 
                                borderRadius: '8px', 
                                background: '#4f46e5', 
                                color: '#ffffff', 
                                border: 'none', 
                                fontWeight: 800, 
                                fontSize: '0.88rem',
                                cursor: freezing ? 'not-allowed' : 'pointer',
                                boxShadow: '0 2px 6px rgba(79, 70, 229, 0.35)',
                                transition: 'all 0.15s ease'
                            }}
                            title="Permanently freeze and lock attendance and salary calculations as official payroll history"
                        >
                            <i className={`bx ${freezing ? 'bx-loader-alt bx-spin' : 'bx-lock-alt'}`}></i>
                            {freezing ? 'Freezing...' : 'Freeze Month'}
                        </button>
                    )}

                    {/* Import Excel */}
                    {!isFrozen && (
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
                    )}

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

                    {/* Auto Attendance Settings Button */}
                    <button
                        onClick={() => {
                            if (autoConfig) {
                                setModalIsEnabled(autoConfig.is_enabled);
                                setModalDelayDays(autoConfig.delay_days);
                            } else {
                                fetchAutoConfig();
                            }
                            setShowAutoModal(true);
                        }}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 14px',
                            borderRadius: '8px',
                            background: autoConfig?.is_enabled ? '#ecfdf5' : '#f8fafc',
                            color: autoConfig?.is_enabled ? '#047857' : '#64748b',
                            border: autoConfig?.is_enabled ? '1px solid #a7f3d0' : '1px solid var(--color-border, #cbd5e1)',
                            fontWeight: 700,
                            fontSize: '0.88rem',
                            cursor: 'pointer',
                            boxShadow: autoConfig?.is_enabled ? '0 1px 3px rgba(16, 185, 129, 0.2)' : 'none',
                            transition: 'all 0.15s ease'
                        }}
                        title="Automated attendance engine settings & manual trigger"
                    >
                        <i className={`bx ${autoConfig?.is_enabled ? 'bx-check-shield' : 'bx-cog'}`} style={{ fontSize: '1.1rem' }}></i>
                        {autoConfig ? (
                            autoConfig.is_enabled ? (
                                <span>Auto: <strong style={{ color: '#065f46' }}>ON</strong> ({autoConfig.delay_days}d lag)</span>
                            ) : (
                                <span>Auto: <strong style={{ color: '#64748b' }}>OFF</strong></span>
                            )
                        ) : (
                            <span>Auto Attendance</span>
                        )}
                    </button>

                    {/* Clean Orphaned Records Button */}
                    {!isFrozen && (
                        <button
                            onClick={handleCleanupOrphanedAttendance}
                            disabled={cleaning}
                            title="Purge obsolete attendance records linked to deleted or inactive locations"
                            style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '6px', 
                                padding: '8px 14px', 
                                borderRadius: '8px', 
                                background: '#fff1f2', 
                                color: '#e11d48', 
                                border: '1px solid #fecdd3', 
                                fontWeight: 700, 
                                fontSize: '0.88rem',
                                cursor: cleaning ? 'not-allowed' : 'pointer',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <i className={`bx ${cleaning ? 'bx-loader-alt bx-spin' : 'bx-trash-alt'}`}></i>
                            {cleaning ? 'Cleaning...' : 'Clean Deleted Sites'}
                        </button>
                    )}

                    {/* Save Changes Button */}
                    {!isFrozen && (
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
                    )}
                </div>
            </div>

            {musterMode === 'TEMPORARY' ? (
                <TemporaryServicesMusterSection 
                    year={year} 
                    month={month} 
                    onBack={onBack}
                    onSwitchToRegular={() => setMusterMode('REGULAR')}
                />
            ) : (
                <>
            {/* Frozen Month Notification Banner */}
            {isFrozen && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    background: '#fffbeb',
                    border: '1px solid #fde68a',
                    padding: '12px 20px',
                    borderRadius: '10px',
                    color: '#92400e',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    marginBottom: '20px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }}>
                    <i className='bx bx-lock-alt' style={{ fontSize: '1.4rem', color: '#d97706' }}></i>
                    <div>
                        <strong>Official Payroll Record Locked:</strong> This month ({month}/{year}) has been permanently frozen. Duty attendance and salary calculations are immutable official payroll history and cannot be edited.
                    </div>
                </div>
            )}

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
                        <strong>Keystroke Shortcuts:</strong> Type <code>P</code> (Present), <code>O</code> (Active OT), <code>OD</code> (OT Dozing), <code>PO</code> (Present + Active OT), <code>POD</code> (Present + OT Dozing), <code>WP</code> (Worked Week Off), <code>W</code> (Weekly Off), <code>A</code> (Absent), <code>L</code> (Leave).
                    </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ width: 12, height: 12, borderRadius: '3px', background: '#dcfce7', border: '1px solid #16a34a' }}></span> <strong>P</strong> Present
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ width: 12, height: 12, borderRadius: '3px', background: '#dbeafe', border: '1px solid #2563eb' }}></span> <strong>O</strong> Active OT
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ width: 12, height: 12, borderRadius: '3px', background: '#ede9fe', border: '1px solid #6d28d9' }}></span> <strong>OD</strong> OT Dozing
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ width: 12, height: 12, borderRadius: '3px', background: '#f3e8ff', border: '1px solid #7e22ce' }}></span> <strong>PO</strong> Present + Active OT
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ width: 12, height: 12, borderRadius: '3px', background: '#fae8ff', border: '1px solid #a21caf' }}></span> <strong>POD</strong> Present + OT Dozing
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ width: 12, height: 12, borderRadius: '3px', background: '#ccfbf1', border: '1px solid #0f766e' }}></span> <strong>WP</strong> Worked on Week Off
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ width: 12, height: 12, borderRadius: '3px', background: '#f1f5f9', border: '1px solid #94a3b8' }}></span> <strong>W</strong> Weekly Off
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ width: 12, height: 12, borderRadius: '3px', background: '#fee2e2', border: '1px solid #dc2626' }}></span> <strong>A</strong> Absent
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ width: 12, height: 12, borderRadius: '3px', background: '#fdf2f8', border: '1px solid #db2777' }}></span> <strong>L</strong> Leave
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
            {!loading && filteredSites.map((site) => {
                const isCollapsed = collapsedSites.has(site.site_id);
                return (
                <div 
                    key={site.site_id} 
                    style={{ 
                        marginBottom: '32px', 
                        background: 'var(--color-surface, #ffffff)', 
                        borderRadius: '12px', 
                        border: '1px solid var(--color-border, #e2e8f0)', 
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                        position: 'relative',
                        width: '100%',
                        maxWidth: '100%',
                        boxSizing: 'border-box'
                    }}
                >
                    {/* Combined Sticky Header: Green Location Banner + Date Header Line */}
                    <div style={{ 
                        position: 'sticky',
                        top: 0,
                        zIndex: 40,
                        background: 'var(--color-surface, #ffffff)',
                        borderRadius: isCollapsed ? '12px' : '12px 12px 0 0',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                        width: '100%',
                        maxWidth: '100%',
                        boxSizing: 'border-box'
                    }}>
                        {/* Green Location Header Banner */}
                        <div style={{ 
                            background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', 
                            padding: '12px 24px', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'space-between', 
                            flexWrap: 'wrap', 
                            gap: '12px', 
                            color: '#ffffff',
                            borderRadius: isCollapsed ? '12px' : '12px 12px 0 0'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <button
                                    onClick={() => toggleSiteCollapse(site.site_id)}
                                    style={{
                                        width: 32,
                                        height: 32,
                                        borderRadius: '6px',
                                        background: 'rgba(255, 255, 255, 0.2)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '1.2rem',
                                        color: '#ffffff',
                                        border: 'none',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease'
                                    }}
                                    title={isCollapsed ? 'Expand site muster sheet' : 'Collapse site muster sheet'}
                                >
                                    <i className={`bx ${isCollapsed ? 'bx-chevron-right' : 'bx-chevron-down'}`}></i>
                                </button>
                                <div style={{ width: 32, height: 32, borderRadius: '6px', background: 'rgba(255, 255, 255, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
                                    <i className='bx bx-building'></i>
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, letterSpacing: '0.3px', color: '#ffffff' }}>
                                        {site.site_name}
                                    </h3>
                                    <span style={{ fontSize: '0.8rem', opacity: 0.9 }}>
                                        Client: {site.customer_name} &nbsp;•&nbsp; <strong>{site.guards.length} Guards</strong>
                                    </span>
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ fontSize: '0.85rem', background: 'rgba(0, 0, 0, 0.2)', padding: '6px 14px', borderRadius: '6px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span>Requirements: </span>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                        {(() => {
                                            if (site.requirements && site.requirements.length > 0) {
                                                const countByCode = new Map<string, number>();
                                                site.requirements.forEach(r => {
                                                    const code = normalizeDesigCode(r.designation_name, r.designation_code);
                                                    countByCode.set(code, (countByCode.get(code) || 0) + (r.required_headcount || 0));
                                                });

                                                const preferredOrder = ['SUP', 'GD', 'CPO', 'LADY', 'CCTV', 'DEO', 'DVR', 'AG'];
                                                const sorted = Array.from(countByCode.entries()).sort((a, b) => {
                                                    const idxA = preferredOrder.indexOf(a[0]);
                                                    const idxB = preferredOrder.indexOf(b[0]);
                                                    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                                                    if (idxA !== -1) return -1;
                                                    if (idxB !== -1) return 1;
                                                    return a[0].localeCompare(b[0]);
                                                });

                                                return sorted.map(([code, count]) => (
                                                    <strong key={code} style={{ 
                                                        background: 'rgba(255, 255, 255, 0.18)', 
                                                        padding: '2px 8px', 
                                                        borderRadius: '4px',
                                                        fontSize: '0.84rem',
                                                        letterSpacing: '0.3px'
                                                    }}>
                                                        {count} {code}
                                                    </strong>
                                                ));
                                            }

                                            const fallbackParts: string[] = [];
                                            if (site.supervisors_req > 0) fallbackParts.push(`${site.supervisors_req} SUP`);
                                            if (site.guards_req > 0) fallbackParts.push(`${site.guards_req} GD`);
                                            const fallbackStr = fallbackParts.length > 0 ? fallbackParts.join(' ') : '0 GD';
                                            return <strong>{fallbackStr}</strong>;
                                        })()}
                                    </div>
                                </div>

                                {!isFrozen && (
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
                                )}

                                {/* Location Header Direct Save Button */}
                                {!isFrozen && (
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
                                )}
                            </div>
                        </div>

                        {/* Date Header Line (Sticks right below Green Location Banner) */}
                        {!isCollapsed && (
                            <div style={{ 
                                display: 'flex', 
                                width: '100%', 
                                maxWidth: '100%',
                                background: '#f8fafc', 
                                borderBottom: '2px solid #cbd5e1',
                                borderTop: '1px solid rgba(0,0,0,0.05)',
                                boxSizing: 'border-box'
                            }}>
                                {/* Fixed Left Columns (362px): # (40px), Code (72px), Desig (60px), Guard Name (190px) */}
                                <div style={{ 
                                    width: '362px', 
                                    minWidth: '362px', 
                                    maxWidth: '362px', 
                                    flexShrink: 0,
                                    display: 'flex', 
                                    height: '40px',
                                    background: '#f8fafc', 
                                    borderRight: '2px solid #cbd5e1', 
                                    boxShadow: '4px 0 8px rgba(0, 0, 0, 0.08)',
                                    zIndex: 2,
                                    boxSizing: 'border-box'
                                }}>
                                    <div style={{ width: '40px', minWidth: '40px', maxWidth: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#475569', borderRight: '1px solid #e2e8f0', boxSizing: 'border-box' }}>#</div>
                                    <div style={{ width: '72px', minWidth: '72px', maxWidth: '72px', display: 'flex', alignItems: 'center', paddingLeft: '8px', fontWeight: 700, color: '#475569', borderRight: '1px solid #e2e8f0', boxSizing: 'border-box' }}>Code</div>
                                    <div style={{ width: '60px', minWidth: '60px', maxWidth: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#475569', borderRight: '1px solid #e2e8f0', boxSizing: 'border-box' }}>Desig</div>
                                    <div style={{ width: '190px', minWidth: '190px', maxWidth: '190px', display: 'flex', alignItems: 'center', paddingLeft: '12px', fontWeight: 700, color: '#475569', boxSizing: 'border-box' }}>Guard Name</div>
                                </div>

                                {/* Horizontally Scrollable Days (1..31) + Summary Headers */}
                                <div 
                                    ref={(el) => { headerRefs.current[site.site_id] = el; }}
                                    onScroll={(e) => syncBodyScroll(site.site_id, e.currentTarget.scrollLeft)}
                                    onWheel={(e) => {
                                        const bdy = bodyRefs.current[site.site_id];
                                        if (bdy && e.deltaX) {
                                            bdy.scrollLeft += e.deltaX;
                                        }
                                    }}
                                    style={{ 
                                        flex: '1 1 0px', 
                                        minWidth: 0,
                                        maxWidth: '100%',
                                        overflowX: 'hidden', 
                                        display: 'flex',
                                        height: '40px',
                                        boxSizing: 'border-box'
                                    }}
                                >
                                    <div style={{ display: 'flex', width: `${daysInMonth * 34 + 296}px`, minWidth: `${daysInMonth * 34 + 296}px`, maxWidth: `${daysInMonth * 34 + 296}px`, flexShrink: 0, height: '40px' }}>
                                        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                                            const isTodayHeader = (d === todayDay);
                                            return (
                                                <div 
                                                    key={d} 
                                                    style={{ 
                                                        width: '34px', 
                                                        minWidth: '34px', 
                                                        maxWidth: '34px', 
                                                        display: 'flex', 
                                                        alignItems: 'center', 
                                                        justifyContent: 'center', 
                                                        background: isTodayHeader ? '#ecfdf5' : '#f8fafc',
                                                        color: isTodayHeader ? '#059669' : '#334155',
                                                        fontWeight: isTodayHeader ? 800 : 700,
                                                        borderRight: '1px solid #e2e8f0',
                                                        boxSizing: 'border-box'
                                                    }}
                                                >
                                                    {d}
                                                </div>
                                            );
                                        })}
                                        <div style={{ width: '40px', minWidth: '40px', maxWidth: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669', fontWeight: 800, borderRight: '1px solid #e2e8f0', borderLeft: '2px solid #cbd5e1', boxSizing: 'border-box' }} title="Total Present shifts">P</div>
                                        <div style={{ width: '40px', minWidth: '40px', maxWidth: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb', fontWeight: 800, borderRight: '1px solid #e2e8f0', boxSizing: 'border-box' }} title="Total Active Overtime shifts">O</div>
                                        <div style={{ width: '40px', minWidth: '40px', maxWidth: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6d28d9', fontWeight: 800, borderRight: '1px solid #e2e8f0', boxSizing: 'border-box' }} title="Total Overtime Dozing shifts">OD</div>
                                        <div style={{ width: '40px', minWidth: '40px', maxWidth: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0f766e', fontWeight: 800, borderRight: '1px solid #e2e8f0', boxSizing: 'border-box' }} title="Worked on Weekly Off">WP</div>
                                        <div style={{ width: '45px', minWidth: '45px', maxWidth: '45px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontWeight: 800, borderRight: '1px solid #e2e8f0', boxSizing: 'border-box' }} title="Weekly Off / Leave">W/L</div>
                                        <div style={{ width: '55px', minWidth: '55px', maxWidth: '55px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669', fontWeight: 800, borderRight: '1px solid #e2e8f0', boxSizing: 'border-box' }} title="Total Payable Days">Pay Days</div>
                                        <div style={{ width: '36px', minWidth: '36px', maxWidth: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontWeight: 700, borderRight: '1px solid #e2e8f0', boxSizing: 'border-box' }}>Act</div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Table Spreadsheet Matrix with horizontal freeze panes */}
                    {!isCollapsed && (
                        <div style={{ 
                            borderRadius: '0 0 12px 12px',
                            background: 'var(--color-surface, #ffffff)',
                            position: 'relative',
                            boxSizing: 'border-box',
                            overflow: 'hidden'
                        }}>
                            {site.guards.length === 0 ? (
                                <div style={{ 
                                    padding: '36px 20px', 
                                    color: '#94a3b8', 
                                    textAlign: 'center', 
                                    background: '#ffffff', 
                                    borderBottom: '1px solid #e2e8f0',
                                    borderRadius: '0 0 12px 12px' 
                                }}>
                                    No guards currently deployed at this site for {month}/{year}. {!isFrozen && <span>Click <strong>[ + Add Guard ]</strong> above to assign personnel.</span>}
                                </div>
                            ) : (
                                <div style={{ 
                                    display: 'flex', 
                                    width: '100%', 
                                    maxWidth: '100%', 
                                    position: 'relative',
                                    boxSizing: 'border-box'
                                }}>
                                    {/* Left Frozen Pane (362px): # (40px), Code (72px), Desig (60px), Guard Name (190px) */}
                                    <div style={{
                                        width: '362px',
                                        minWidth: '362px',
                                        maxWidth: '362px',
                                        flexShrink: 0,
                                        background: '#ffffff',
                                        borderRight: '2px solid #cbd5e1',
                                        boxShadow: '4px 0 8px rgba(0, 0, 0, 0.08)',
                                        zIndex: 5,
                                        boxSizing: 'border-box'
                                    }}>
                                        <table style={{
                                            width: '362px',
                                            minWidth: '362px',
                                            maxWidth: '362px',
                                            tableLayout: 'fixed',
                                            borderCollapse: 'separate',
                                            borderSpacing: 0,
                                            fontSize: '0.82rem',
                                            textAlign: 'center',
                                            boxSizing: 'border-box'
                                        }}>
                                            <colgroup>
                                                <col style={{ width: '40px' }} />
                                                <col style={{ width: '72px' }} />
                                                <col style={{ width: '60px' }} />
                                                <col style={{ width: '190px' }} />
                                            </colgroup>
                                            <tbody>
                                                {site.guards.map((guard, idx) => {
                                                    const rowKey = `${site.site_id}_${guard.employee_id}`;
                                                    const isHovered = (hoveredRowKey === rowKey);
                                                    const rowBg = isHovered ? '#f1f5f9' : (idx % 2 === 0 ? '#ffffff' : '#f8fafc');
                                                    return (
                                                        <tr
                            key={guard.employee_id}
                            onMouseEnter={() => setHoveredRowKey(rowKey)}
                            onMouseLeave={() => setHoveredRowKey(null)}
                            style={{ height: '44px', background: rowBg, transition: 'background-color 0.1s ease' }}
                        >
                            <td style={{
                                padding: '6px 4px',
                                width: '40px',
                                minWidth: '40px',
                                maxWidth: '40px',
                                height: '44px',
                                color: '#94a3b8',
                                fontWeight: 600,
                                textAlign: 'center',
                                verticalAlign: 'middle',
                                borderBottom: '1px solid #e2e8f0',
                                borderRight: '1px solid #e2e8f0',
                                boxSizing: 'border-box'
                            }}>
                                {idx + 1}
                            </td>
                            <td style={{
                                padding: '6px 8px',
                                width: '72px',
                                minWidth: '72px',
                                maxWidth: '72px',
                                height: '44px',
                                fontWeight: 800,
                                color: '#0284c7',
                                textAlign: 'left',
                                verticalAlign: 'middle',
                                borderBottom: '1px solid #e2e8f0',
                                borderRight: '1px solid #e2e8f0',
                                boxSizing: 'border-box'
                            }}>
                                {guard.employee_code}
                            </td>
                            <td style={{
                                padding: '4px 2px',
                                width: '60px',
                                minWidth: '60px',
                                maxWidth: '60px',
                                height: '44px',
                                textAlign: 'center',
                                verticalAlign: 'middle',
                                borderBottom: '1px solid #e2e8f0',
                                borderRight: '1px solid #e2e8f0',
                                boxSizing: 'border-box'
                            }}>
                                {(() => {
                                    const dCode = normalizeDesigCode(guard.designation_full, guard.designation);
                                    const style = getDesigBadgeStyle(dCode);
                                    const sub = getGuardSubBadge(guard, site.requirements);
                                    const subStyle = sub ? getSubBadgeStyle(sub) : null;
                                    return (
                                        <div style={{
                                            display: 'inline-flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '2px',
                                            lineHeight: 1
                                        }}>
                                            <span style={{ 
                                                padding: '2px 6px', 
                                                borderRadius: '4px', 
                                                fontSize: '0.72rem', 
                                                fontWeight: 800, 
                                                background: style.bg, 
                                                color: style.color, 
                                                border: `1px solid ${style.border}`, 
                                                letterSpacing: '0.3px', 
                                                lineHeight: 1.1 
                                            }}>
                                                {dCode}
                                            </span>
                                            {sub && subStyle && (
                                                <span 
                                                    title={`${dCode} (${subStyle.label})`} 
                                                    style={{ 
                                                        padding: '1px 4px', 
                                                        borderRadius: '3px', 
                                                        fontSize: '0.58rem', 
                                                        fontWeight: 800, 
                                                        letterSpacing: '0.4px', 
                                                        lineHeight: 1, 
                                                        background: subStyle.bg, 
                                                        color: subStyle.color, 
                                                        border: `1px solid ${subStyle.border}`, 
                                                        boxShadow: '0 1px 2px rgba(0,0,0,0.04)' 
                                                    }}
                                                >
                                                    {sub}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })()}
                            </td>
                            <td style={{
                                padding: '6px 12px',
                                width: '190px',
                                minWidth: '190px',
                                maxWidth: '190px',
                                height: '44px',
                                textAlign: 'left',
                                verticalAlign: 'middle',
                                fontWeight: 700,
                                color: 'var(--color-text, #0f172a)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                borderBottom: '1px solid #e2e8f0',
                                boxSizing: 'border-box'
                            }} title={guard.name}>
                                {guard.name}
                            </td>
                        </tr>
                    );
                })}

                {/* Red Paid Vacations Summary Row (Left side label) */}
                <tr style={{ background: '#fef2f2', color: '#b91c1c', fontWeight: 800, height: '38px' }}>
                    <td 
                        colSpan={4} 
                        style={{ 
                            padding: '8px 14px', 
                            textAlign: 'left', 
                            verticalAlign: 'middle',
                            height: '38px',
                            borderTop: '2px solid #fca5a5',
                            borderBottom: '1px solid #fecaca',
                            boxSizing: 'border-box'
                        }}
                    >
                        Paid Vac / Leaves
                    </td>
                </tr>

                {/* Daily Shifts Fulfilled Row (Left side label) */}
                <tr style={{ background: '#ecfdf5', color: '#047857', fontWeight: 900, height: '38px' }}>
                    <td 
                        colSpan={4} 
                        style={{ 
                            padding: '8px 14px', 
                            textAlign: 'left', 
                            verticalAlign: 'middle',
                            height: '38px',
                            borderTop: '2px solid #6ee7b7',
                            borderBottom: '1px solid #a7f3d0',
                            boxSizing: 'border-box'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                            <span>Total Shifts Fulfilled</span>
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, opacity: 0.85, background: 'rgba(5, 150, 105, 0.15)', padding: '2px 6px', borderRadius: '4px' }}>
                                P=1 | PO=2 | POD=2
                            </span>
                        </div>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>

    {/* Right Scrollable Pane (Days 1..31 + Summaries) */}
    <div 
        ref={(el) => { bodyRefs.current[site.site_id] = el; }}
        onScroll={(e) => syncHeaderScroll(site.site_id, e.currentTarget.scrollLeft)}
        style={{ 
            flex: '1 1 0px', 
            minWidth: 0,
            maxWidth: '100%',
            overflowX: 'auto', 
            background: 'var(--color-surface, #ffffff)',
            boxSizing: 'border-box'
        }}
    >
        <table style={{ 
            width: `${daysInMonth * 34 + 296}px`, 
            minWidth: `${daysInMonth * 34 + 296}px`, 
            maxWidth: `${daysInMonth * 34 + 296}px`, 
            borderCollapse: 'separate', 
            borderSpacing: 0, 
            fontSize: '0.82rem', 
            textAlign: 'center',
            tableLayout: 'fixed',
            boxSizing: 'border-box'
        }}>
            <colgroup>
                {Array.from({ length: daysInMonth }).map((_, i) => (
                    <col key={i} style={{ width: '34px' }} />
                ))}
                <col style={{ width: '40px' }} />
                <col style={{ width: '40px' }} />
                <col style={{ width: '40px' }} />
                <col style={{ width: '40px' }} />
                <col style={{ width: '45px' }} />
                <col style={{ width: '55px' }} />
                <col style={{ width: '36px' }} />
            </colgroup>
            <tbody>
                {site.guards.map((guard, idx) => {
                    const rowKey = `${site.site_id}_${guard.employee_id}`;
                    const isHovered = (hoveredRowKey === rowKey);
                    const rowBg = isHovered ? '#f1f5f9' : (idx % 2 === 0 ? '#ffffff' : '#f8fafc');
                    return (
                        <tr 
                            key={guard.employee_id} 
                            onMouseEnter={() => setHoveredRowKey(rowKey)}
                            onMouseLeave={() => setHoveredRowKey(null)}
                            style={{ height: '44px', background: rowBg, transition: 'background-color 0.1s ease' }}
                        >
                            {/* Days 1 to 31 Interactive Input Cells */}
                            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                                const cellVal = guard.days[String(d)] || '';

                                let cellBg = 'transparent';
                                let cellColor = '#334155';

                                if (cellVal === 'P' || cellVal === '1') {
                                    cellBg = '#dcfce7';
                                    cellColor = '#15803d';
                                } else if (cellVal === 'O' || cellVal === 'OT') {
                                    cellBg = '#dbeafe';
                                    cellColor = '#1d4ed8';
                                } else if (cellVal === 'OD') {
                                    cellBg = '#ede9fe';
                                    cellColor = '#6d28d9';
                                } else if (cellVal === 'PO') {
                                    cellBg = '#f3e8ff';
                                    cellColor = '#7e22ce';
                                } else if (cellVal === 'POD') {
                                    cellBg = '#fae8ff';
                                    cellColor = '#a21caf';
                                } else if (cellVal === 'WP' || cellVal === 'D' || cellVal === 'WO+OT' || cellVal === 'DS') {
                                    cellBg = '#ccfbf1';
                                    cellColor = '#0f766e';
                                } else if (cellVal === 'W' || cellVal === 'WO') {
                                    cellBg = '#f1f5f9';
                                    cellColor = '#64748b';
                                } else if (cellVal === 'A') {
                                    cellBg = '#fee2e2';
                                    cellColor = '#b91c1c';
                                } else if (['L', 'PL', 'SL'].includes(cellVal)) {
                                    cellBg = '#fdf2f8';
                                    cellColor = '#db2777';
                                }

                                return (
                                    <td 
                                        key={d} 
                                        style={{ 
                                            padding: '2px', 
                                            width: '34px',
                                            minWidth: '34px',
                                            maxWidth: '34px', 
                                            height: '44px',
                                            verticalAlign: 'middle',
                                            borderBottom: '1px solid #e2e8f0',
                                            borderRight: '1px solid #e2e8f0',
                                            background: cellBg,
                                            position: 'relative',
                                            boxSizing: 'border-box'
                                        }}
                                    >
                                        <input
                                            type="text"
                                            value={cellVal}
                                            disabled={isFrozen}
                                            readOnly={isFrozen}
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
                                                cursor: isFrozen ? 'not-allowed' : 'pointer'
                                            }}
                                        />
                                    </td>
                                );
                            })}

                            <td style={{ padding: '6px 4px', width: '40px', minWidth: '40px', maxWidth: '40px', height: '44px', verticalAlign: 'middle', borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', borderLeft: '2px solid #cbd5e1', fontWeight: 800, color: '#15803d', background: '#f0fdf4', boxSizing: 'border-box' }}>{guard.total_present}</td>
                            <td style={{ padding: '6px 4px', width: '40px', minWidth: '40px', maxWidth: '40px', height: '44px', verticalAlign: 'middle', borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', fontWeight: 800, color: '#2563eb', background: '#eff6ff', boxSizing: 'border-box' }}>{guard.total_ot}</td>
                            <td style={{ padding: '6px 4px', width: '40px', minWidth: '40px', maxWidth: '40px', height: '44px', verticalAlign: 'middle', borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', fontWeight: 800, color: '#6d28d9', background: '#f5f3ff', boxSizing: 'border-box' }}>{guard.total_od || 0}</td>
                            <td style={{ padding: '6px 4px', width: '40px', minWidth: '40px', maxWidth: '40px', height: '44px', verticalAlign: 'middle', borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', fontWeight: 800, color: '#0f766e', background: '#f0fdfa', boxSizing: 'border-box' }}>{guard.total_ds}</td>
                            <td style={{ padding: '6px 4px', width: '45px', minWidth: '45px', maxWidth: '45px', height: '44px', verticalAlign: 'middle', borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', fontWeight: 700, color: '#64748b', boxSizing: 'border-box' }}>{guard.total_wo + guard.total_leave}</td>
                            <td style={{ padding: '6px 4px', width: '55px', minWidth: '55px', maxWidth: '55px', height: '44px', verticalAlign: 'middle', borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', fontWeight: 800, color: '#059669', background: '#ecfdf5', boxSizing: 'border-box' }}>{guard.payable_days}</td>
                            <td style={{ padding: '6px 4px', width: '36px', minWidth: '36px', maxWidth: '36px', height: '44px', verticalAlign: 'middle', borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', boxSizing: 'border-box' }}>
                                {!isFrozen ? (
                                    <button
                                        onClick={() => handleRemoveGuard(site.site_id, guard.employee_id, guard.name)}
                                        style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: '2px', fontSize: '1.1rem' }}
                                        title="Remove Guard from site roster"
                                    >
                                        <i className='bx bx-trash'></i>
                                    </button>
                                ) : (
                                    <i className='bx bx-lock-alt' style={{ color: '#94a3b8', fontSize: '0.95rem' }} title="Month is frozen (Locked)"></i>
                                )}
                            </td>
                        </tr>
                    );
                })}

                {/* Red Paid Vacations Summary Row */}
                <tr style={{ background: '#fef2f2', color: '#b91c1c', fontWeight: 800, height: '38px' }}>
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => (
                        <td key={d} style={{ padding: '4px', height: '38px', verticalAlign: 'middle', borderTop: '2px solid #fca5a5', borderBottom: '1px solid #fecaca', borderRight: '1px solid #fecaca', width: '34px', minWidth: '34px', maxWidth: '34px', boxSizing: 'border-box' }}>
                            {site.daily_vacations[String(d)] || 0}
                        </td>
                    ))}
                    <td colSpan={7} style={{ height: '38px', borderTop: '2px solid #fca5a5', borderBottom: '1px solid #fecaca', borderLeft: '2px solid #cbd5e1', background: '#fef2f2', boxSizing: 'border-box' }}></td>
                </tr>

                {/* Daily Shifts Fulfilled Row */}
                <tr style={{ background: '#ecfdf5', color: '#047857', fontWeight: 900, height: '38px' }}>
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => (
                        <td key={d} style={{ padding: '4px', height: '38px', verticalAlign: 'middle', borderTop: '2px solid #6ee7b7', borderBottom: '1px solid #a7f3d0', borderRight: '1px solid #a7f3d0', width: '34px', minWidth: '34px', maxWidth: '34px', boxSizing: 'border-box' }}>
                            {site.daily_totals[String(d)] || 0}
                        </td>
                    ))}
                    <td colSpan={7} style={{ height: '38px', borderTop: '2px solid #6ee7b7', borderBottom: '1px solid #a7f3d0', borderLeft: '2px solid #cbd5e1', background: '#ecfdf5', boxSizing: 'border-box' }}></td>
                </tr>
            </tbody>
        </table>
    </div>
</div>
                            )}
                        </div>
                    )}
                </div>
                );
            })}

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
                                    {reqList.map((req, idx) => {
                                        const dCode = normalizeDesigCode(req.designation_name, req.designation_code);
                                        return (
                                            <option key={idx} value={idx}>
                                                {req.designation_name} ({dCode}) — Req: {req.required_headcount} | Salary: Rs. {req.monthly_pay_rate.toLocaleString()}/mo | OT: Rs. {req.overtime_rate.toLocaleString()}/day
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>

                            {/* Selected Position Compensation & Details Pill (Uneditable) */}
                            {activeReq && (() => {
                                const activeCode = normalizeDesigCode(activeReq.designation_name, activeReq.designation_code);
                                const pillStyle = getDesigBadgeStyle(activeCode);
                                const mockGuard: GuardRow = {
                                    employee_id: '',
                                    employee_code: '',
                                    name: '',
                                    designation: activeCode,
                                    designation_full: activeReq.designation_name,
                                    post_id: activeReq.post_id,
                                    designation_id: activeReq.designation_id,
                                    is_primary: false,
                                    days: {},
                                    total_present: 0,
                                    total_ot: 0,
                                    total_wo: 0,
                                    total_ds: 0,
                                    total_absent: 0,
                                    total_leave: 0,
                                    payable_days: 0
                                };
                                const sub = getGuardSubBadge(mockGuard, [activeReq]);
                                const subStyle = sub ? getSubBadgeStyle(sub) : null;
                                return (
                                <div style={{ background: pillStyle.bg, border: `1px solid ${pillStyle.border}`, borderRadius: '10px', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                            <span style={{
                                                padding: '4px 10px',
                                                borderRadius: '6px',
                                                fontWeight: 800,
                                                fontSize: '0.82rem',
                                                background: pillStyle.color,
                                                color: '#ffffff'
                                            }}>
                                                {activeCode}
                                            </span>
                                            {sub && subStyle && (
                                                <span style={{
                                                    padding: '1px 5px',
                                                    borderRadius: '3px',
                                                    fontWeight: 800,
                                                    fontSize: '0.62rem',
                                                    background: subStyle.bg,
                                                    color: subStyle.color,
                                                    border: `1px solid ${subStyle.border}`
                                                }}>
                                                    {sub}
                                                </span>
                                            )}
                                        </div>
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
                                );
                            })()}

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

            {/* Modal: Automated Attendance Settings & Runner */}
            {showAutoModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '20px' }}>
                    <div style={{ background: 'var(--color-surface, #ffffff)', width: '100%', maxWidth: '640px', borderRadius: '16px', border: '1px solid var(--color-border, #cbd5e1)', padding: '24px 28px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', maxHeight: '90vh', overflowY: 'auto' }}>
                        
                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '1px solid var(--color-border, #e2e8f0)', paddingBottom: '14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: 44, height: 44, borderRadius: '10px', background: modalIsEnabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(100, 116, 139, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: modalIsEnabled ? '#059669' : '#64748b', fontSize: '1.6rem' }}>
                                    <i className={`bx ${modalIsEnabled ? 'bx-bot' : 'bx-cog'}`}></i>
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--color-text, #0f172a)', fontWeight: 800 }}>Automated Attendance Settings</h3>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #64748b)' }}>Company-scoped attendance automation & previous-day rule engine</span>
                                        <span style={{ padding: '2px 8px', borderRadius: '999px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', fontSize: '0.72rem', fontWeight: 700 }}>Tenant Isolated</span>
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => setShowAutoModal(false)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '1.3rem', cursor: 'pointer', padding: '4px' }}>✕</button>
                        </div>

                        {/* Toggle Switch: Enable / Disable */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: modalIsEnabled ? '#ecfdf5' : 'var(--color-bg, #f8fafc)', borderRadius: '10px', border: modalIsEnabled ? '1px solid #a7f3d0' : '1px solid var(--color-border, #cbd5e1)', marginBottom: '16px', transition: 'all 0.2s ease' }}>
                            <div>
                                <div style={{ fontWeight: 800, fontSize: '0.95rem', color: modalIsEnabled ? '#065f46' : 'var(--color-text, #0f172a)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span>Automated Attendance System</span>
                                    {modalIsEnabled ? (
                                        <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', background: '#10b981', color: '#ffffff', fontWeight: 800 }}>ACTIVE</span>
                                    ) : (
                                        <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', background: '#94a3b8', color: '#ffffff', fontWeight: 800 }}>DISABLED</span>
                                    )}
                                </div>
                                <div style={{ fontSize: '0.82rem', color: modalIsEnabled ? '#047857' : 'var(--color-text-muted, #64748b)', marginTop: '2px' }}>
                                    {modalIsEnabled 
                                        ? 'The engine runs automatically when the muster sheet is viewed or via background schedule.'
                                        : 'Auto attendance generation is currently stopped for this company.'}
                                </div>
                            </div>
                            <label style={{ position: 'relative', display: 'inline-block', width: '52px', height: '28px', cursor: 'pointer' }}>
                                <input 
                                    type="checkbox" 
                                    checked={modalIsEnabled} 
                                    onChange={(e) => setModalIsEnabled(e.target.checked)}
                                    style={{ opacity: 0, width: 0, height: 0 }}
                                />
                                <span style={{
                                    position: 'absolute', inset: 0,
                                    backgroundColor: modalIsEnabled ? '#10b981' : '#cbd5e1',
                                    borderRadius: '28px',
                                    transition: '0.2s ease',
                                }}>
                                    <span style={{
                                        position: 'absolute', height: '20px', width: '20px', left: modalIsEnabled ? '26px' : '4px', bottom: '4px',
                                        backgroundColor: '#ffffff',
                                        borderRadius: '50%',
                                        transition: '0.2s ease',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                    }} />
                                </span>
                            </label>
                        </div>

                        {/* Delay Days Selection (Lag / Buffer) */}
                        <div style={{ marginBottom: '18px', padding: '16px', background: 'var(--color-bg, #f8fafc)', borderRadius: '10px', border: '1px solid var(--color-border, #e2e8f0)' }}>
                            <label style={{ display: 'block', fontWeight: 800, fontSize: '0.9rem', color: 'var(--color-text, #0f172a)', marginBottom: '6px' }}>
                                Attendance Lag Buffer (Days Delay)
                            </label>
                            <p style={{ margin: '0 0 12px 0', fontSize: '0.82rem', color: 'var(--color-text-muted, #64748b)', lineHeight: '1.4' }}>
                                Specifies how many days behind the current date attendance is auto-marked. For example, on <strong>27th Oct</strong> with a <strong>2-day lag</strong>, attendance is auto-marked for <strong>25th Oct</strong> based on <strong>24th Oct</strong>.
                            </p>

                            {/* Preset Buttons */}
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                                {[
                                    { days: 1, label: '1 Day Lag (Yesterday)' },
                                    { days: 2, label: '2 Days Lag (Recommended Default)' },
                                    { days: 3, label: '3 Days Lag' },
                                ].map(preset => (
                                    <button
                                        key={preset.days}
                                        type="button"
                                        onClick={() => setModalDelayDays(preset.days)}
                                        style={{
                                            padding: '6px 14px',
                                            borderRadius: '6px',
                                            border: modalDelayDays === preset.days ? '2px solid #0284c7' : '1px solid var(--color-border, #cbd5e1)',
                                            background: modalDelayDays === preset.days ? '#e0f2fe' : 'var(--color-surface, #ffffff)',
                                            color: modalDelayDays === preset.days ? '#0369a1' : 'var(--color-text, #0f172a)',
                                            fontWeight: modalDelayDays === preset.days ? 800 : 600,
                                            fontSize: '0.82rem',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        {modalDelayDays === preset.days ? '✓ ' : ''}{preset.label}
                                    </button>
                                ))}
                            </div>

                            {/* Custom Number Input & Live Preview */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text, #0f172a)' }}>Custom Lag:</span>
                                    <input
                                        type="number"
                                        min={1}
                                        max={30}
                                        value={modalDelayDays}
                                        onChange={(e) => setModalDelayDays(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
                                        style={{
                                            width: '70px',
                                            padding: '6px 10px',
                                            borderRadius: '6px',
                                            border: '1px solid var(--color-border, #cbd5e1)',
                                            background: 'var(--color-surface, #ffffff)',
                                            color: 'var(--color-text, #0f172a)',
                                            fontWeight: 800,
                                            fontSize: '0.9rem',
                                            textAlign: 'center'
                                        }}
                                    />
                                    <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted, #64748b)' }}>days</span>
                                </div>

                                <div style={{ flex: 1, padding: '6px 12px', borderRadius: '6px', background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: '0.8rem', color: '#166534' }}>
                                    📅 Today: <strong>{new Date().toISOString().split('T')[0]}</strong> ➔ Fills for <strong>{calculatedTargetDate}</strong> based on <strong>{calculatedPrevDate}</strong>
                                </div>
                            </div>
                        </div>

                        {/* Attendance Code Transformation Rules Matrix */}
                        <div style={{ marginBottom: '18px', padding: '14px 16px', background: '#fffbeb', borderRadius: '10px', border: '1px solid #fde68a' }}>
                            <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#92400e', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                                <i className='bx bx-git-branch' style={{ fontSize: '1.1rem' }}></i>
                                Previous Day ➔ Target Day Transformation Rules
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', fontSize: '0.8rem' }}>
                                <div style={{ background: '#ffffff', padding: '6px 10px', borderRadius: '6px', border: '1px solid #fef3c7' }}>
                                    <span style={{ color: '#059669', fontWeight: 800 }}>P, PO, POD, WP, W</span><br />
                                    ➔ Marks <strong style={{ color: '#059669' }}>P (Present)</strong>
                                </div>
                                <div style={{ background: '#ffffff', padding: '6px 10px', borderRadius: '6px', border: '1px solid #fef3c7' }}>
                                    <span style={{ color: '#dc2626', fontWeight: 800 }}>A (Absent)</span><br />
                                    ➔ Marks <strong style={{ color: '#dc2626' }}>A (Absent)</strong>
                                </div>
                                <div style={{ background: '#ffffff', padding: '6px 10px', borderRadius: '6px', border: '1px solid #fef3c7' }}>
                                    <span style={{ color: '#d97706', fontWeight: 800 }}>L (Leave)</span><br />
                                    ➔ Marks <strong style={{ color: '#d97706' }}>L (Leave)</strong>
                                </div>
                                <div style={{ background: '#ffffff', padding: '6px 10px', borderRadius: '6px', border: '1px solid #fef3c7' }}>
                                    <span style={{ color: '#64748b', fontWeight: 800 }}>O, OD, Blank</span><br />
                                    ➔ Leaves <strong style={{ color: '#64748b' }}>Blank (No Code)</strong>
                                </div>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#b45309', marginTop: '8px' }}>
                                💡 <em>Non-destructive:</em> Existing manual inputs are never overwritten unless explicitly requested below. Operators only manage exceptions!
                            </div>
                        </div>

                        {/* Manual Trigger Section */}
                        <div style={{ marginBottom: '20px', padding: '14px 16px', background: 'var(--color-bg, #f1f5f9)', borderRadius: '10px', border: '1px solid var(--color-border, #cbd5e1)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                <div style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--color-text, #0f172a)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <i className='bx bx-play-circle' style={{ fontSize: '1.2rem', color: '#4f46e5' }}></i>
                                    Manual On-Demand Execution
                                </div>
                                {autoConfig?.last_run_at && (
                                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #64748b)' }}>
                                        Last run: {new Date(autoConfig.last_run_at).toLocaleString()}
                                    </span>
                                )}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text, #0f172a)', marginBottom: '4px' }}>Target Date (optional):</label>
                                    <input
                                        type="date"
                                        value={modalTargetDate}
                                        onChange={(e) => setModalTargetDate(e.target.value)}
                                        placeholder={calculatedTargetDate}
                                        style={{
                                            width: '100%',
                                            padding: '6px 10px',
                                            borderRadius: '6px',
                                            border: '1px solid var(--color-border, #cbd5e1)',
                                            background: 'var(--color-surface, #ffffff)',
                                            color: 'var(--color-text, #0f172a)',
                                            fontSize: '0.85rem'
                                        }}
                                    />
                                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted, #64748b)' }}>Leave blank to use current lag buffer ({calculatedTargetDate})</span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '8px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--color-text, #0f172a)', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={modalFillMonth}
                                            onChange={(e) => setModalFillMonth(e.target.checked)}
                                        />
                                        <span>Fill missing month days chronologically</span>
                                    </label>

                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#b91c1c', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={modalOverwrite}
                                            onChange={(e) => setModalOverwrite(e.target.checked)}
                                        />
                                        <span>Overwrite existing records (Use with caution)</span>
                                    </label>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={handleTriggerRunAuto}
                                disabled={runningAuto || isFrozen}
                                style={{
                                    width: '100%',
                                    padding: '10px 16px',
                                    borderRadius: '8px',
                                    background: '#4f46e5',
                                    color: '#ffffff',
                                    border: 'none',
                                    fontWeight: 800,
                                    fontSize: '0.9rem',
                                    cursor: runningAuto || isFrozen ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    boxShadow: '0 2px 6px rgba(79, 70, 229, 0.35)',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <i className={`bx ${runningAuto ? 'bx-loader-alt bx-spin' : 'bx-zap'}`} style={{ fontSize: '1.2rem' }}></i>
                                {runningAuto ? 'Running Auto Attendance Engine...' : '⚡ Run Auto Attendance Now'}
                            </button>
                        </div>

                        {/* Modal Footer */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid var(--color-border, #e2e8f0)', paddingTop: '16px' }}>
                            <button
                                type="button"
                                onClick={() => setShowAutoModal(false)}
                                style={{ padding: '8px 18px', borderRadius: '8px', background: 'var(--color-bg, #f1f5f9)', color: 'var(--color-text, #0f172a)', border: '1px solid var(--color-border, #cbd5e1)', fontWeight: 600, cursor: 'pointer' }}
                            >
                                Close
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveAutoConfig}
                                disabled={savingAutoConfig}
                                style={{ padding: '8px 22px', borderRadius: '8px', background: '#059669', color: '#ffffff', border: 'none', fontWeight: 800, cursor: savingAutoConfig ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                                {savingAutoConfig ? <i className='bx bx-loader-alt bx-spin'></i> : <i className='bx bx-check'></i>}
                                {savingAutoConfig ? 'Saving...' : 'Save Configuration'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
                </>
            )}
        </div>
    );
};
