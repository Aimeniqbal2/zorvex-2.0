import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useToastStore } from '../../../stores/toastStore';
import {
    getTemporaryMusterGrid,
    saveTemporaryMusterAttendance,
    assignTemporaryGuards,
    unassignTemporaryGuard,
    apiClient
} from '../api';
import type {
    TemporaryMusterServiceBlock,
    TemporaryMusterGuard,
    TemporaryMusterGridResponse
} from '../types';

interface TemporaryServicesMusterSectionProps {
    year: number;
    month: number;
    onMonthChange?: (month: number) => void;
    onYearChange?: (year: number) => void;
    onBack?: () => void;
    onSwitchToRegular?: () => void;
}

const normalizeDesigCode = (name?: string, code?: string): string => {
    if (code && code.trim()) return code.trim().toUpperCase();
    const n = (name || '').toLowerCase();
    if (n.includes('supervisor')) return 'SUP';
    if (n.includes('officer') || n.includes('cpo')) return 'CPO';
    if (n.includes('cctv')) return 'CCTV';
    if (n.includes('deo') || n.includes('data')) return 'DEO';
    if (n.includes('driver')) return 'DRV';
    if (n.includes('armed')) return 'AG';
    return 'GD';
};

const getDesigBadgeStyle = (code: string) => {
    switch (code) {
        case 'SUP':
            return { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' };
        case 'CPO':
            return { bg: '#fdf2f8', color: '#be185d', border: '#fbcfe8' };
        case 'CCTV':
            return { bg: '#fffbeb', color: '#b45309', border: '#fde68a' };
        case 'DEO':
            return { bg: '#e0e7ff', color: '#4338ca', border: '#c7d2fe' };
        case 'GD':
        default:
            return { bg: '#f0f9ff', color: '#0369a1', border: '#bae6fd' };
    }
};

const getGuardSubBadge = (designationName?: string, bgType?: string): 'C' | 'EX' | 'SSG' | null => {
    const full = (designationName || '').toLowerCase();
    if (full.includes('ssg')) return 'SSG';
    if (full.includes('ex-army') || full.includes('ex army') || full.includes('ex_army') || full.includes('ex-military') || full.endsWith('_ex') || full.includes(' ex')) {
        return 'EX';
    }
    if (full.includes('civil') || full.includes('civilian') || full.endsWith('_civ') || full.includes(' civ')) {
        return 'C';
    }
    if (bgType === 'EX_ARMY') return 'EX';
    if (bgType === 'CIVILIAN') return 'C';
    return 'C';
};

const getSubBadgeStyle = (sub: 'C' | 'EX' | 'SSG' | null) => {
    switch (sub) {
        case 'EX':
            return { bg: '#fef3c7', color: '#92400e', border: '#fde68a', label: 'Ex-Army' };
        case 'SSG':
            return { bg: '#fee2e2', color: '#991b1b', border: '#fecaca', label: 'SSG Commando' };
        case 'C':
        default:
            return { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1', label: 'Civilian' };
    }
};

export const TemporaryServicesMusterSection: React.FC<TemporaryServicesMusterSectionProps> = ({
    year,
    month,
    onMonthChange,
    onYearChange,
    onBack,
    onSwitchToRegular
}) => {
    const { addToast } = useToastStore();

    const [loading, setLoading] = useState<boolean>(true);
    const [saving, setSaving] = useState<boolean>(false);
    const [gridData, setGridData] = useState<TemporaryMusterGridResponse | null>(null);

    // Filter & Search states
    const [selectedEventFilter, setSelectedEventFilter] = useState<string>('ALL');
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [collapsedServices, setCollapsedServices] = useState<Set<string>>(new Set());

    // Dirty updates map: key = `${service_id}_${employee_id}_${day}` -> { service_id, employee_id, day, code }
    const [dirtyUpdates, setDirtyUpdates] = useState<Map<string, { service_id: string; employee_id: string; day: number; code: string }>>(new Map());

    // Quick Assign Guard Modal state
    const [assignTargetService, setAssignTargetService] = useState<TemporaryMusterServiceBlock | null>(null);
    const [allEmployees, setAllEmployees] = useState<any[]>([]);
    const [selectedRequirementIndex, setSelectedRequirementIndex] = useState<number>(0);
    const [guardSearch, setGuardSearch] = useState<string>('');
    const [isAssigning, setIsAssigning] = useState<boolean>(false);

    // Load Temporary Muster Grid data
    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const res = await getTemporaryMusterGrid(year, month);
            setGridData(res);
            setDirtyUpdates(new Map());
        } catch (err: any) {
            console.error('Failed to load temporary muster grid:', err);
            addToast('error', err?.response?.data?.detail || 'Failed to load Temporary Services Muster.');
        } finally {
            setLoading(false);
        }
    }, [year, month, addToast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Load employees for quick assign
    useEffect(() => {
        const loadStaffDependencies = async () => {
            try {
                const empRes = await apiClient.get('/api/hrm/employees/?status=ACTIVE&page_size=500').catch(() => ({ data: [] }));
                setAllEmployees(empRes.data?.results || empRes.data || []);
            } catch (err) {
                console.error('Failed loading staff dependencies', err);
            }
        };
        loadStaffDependencies();
    }, []);

    // Toggle collapse for service block
    const toggleCollapse = (id: string) => {
        setCollapsedServices(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // Handle single cell edit
    const handleCellChange = (serviceId: string, employeeId: string, day: number, newCode: string) => {
        const cleaned = newCode.trim().toUpperCase();

        // Update local gridData state immediately for snappy feel
        setGridData(prev => {
            if (!prev) return prev;
            const nextServices = prev.services.map(svc => {
                if (svc.id !== serviceId) return svc;

                const nextGuards = svc.guards.map(g => {
                    if (g.employee_id !== employeeId) return g;
                    const nextDays = { ...g.days, [String(day)]: cleaned };

                    // Recalculate guard counts
                    let pCount = 0;
                    let aCount = 0;
                    let lCount = 0;
                    Object.values(nextDays).forEach(v => {
                        const code = (v || '').toUpperCase();
                        if (code === 'P' || code === '1' || code === 'WP' || code === 'O' || code === 'OD') pCount++;
                        else if (code === 'A' || code === '0') aCount++;
                        else if (code === 'L' || code === 'SL' || code === 'PL') lCount++;
                    });

                    const attended = pCount;
                    const guardPay = Math.round(attended * Number(g.daily_pay_rate || 2000));
                    const clientBill = Math.round(attended * Number(g.daily_billing_rate || 0));

                    return {
                        ...g,
                        days: nextDays,
                        total_present: pCount,
                        total_absent: aCount,
                        total_leave: lCount,
                        attended_days: attended,
                        total_guard_pay: guardPay,
                        total_client_bill: clientBill
                    };
                });

                const totalGuardPay = nextGuards.reduce((acc, g) => acc + (g.total_guard_pay || 0), 0);
                const totalClientBill = nextGuards.reduce((acc, g) => acc + (g.total_client_bill || 0), 0);

                return {
                    ...svc,
                    guards: nextGuards,
                    totals: {
                        ...svc.totals,
                        manpower_guard_pay: totalGuardPay,
                        manpower_billed: totalClientBill,
                        grand_total: totalClientBill + (svc.totals?.equipment_billed || 0)
                    }
                };
            });

            return {
                ...prev,
                services: nextServices
            };
        });

        // Register in dirty map
        setDirtyUpdates(prev => {
            const next = new Map(prev);
            const key = `${serviceId}_${employeeId}_${day}`;
            next.set(key, { service_id: serviceId, employee_id: employeeId, day, code: cleaned });
            return next;
        });
    };

    // Cycle attendance status on click: '' -> 'P' -> 'A' -> 'L' -> 'O' -> 'WP' -> ''
    const cycleAttendance = (serviceId: string, employeeId: string, day: number, currentCode: string) => {
        const order = ['', 'P', 'A', 'L', 'O', 'WP'];
        const idx = order.indexOf(currentCode);
        const nextCode = idx === -1 || idx === order.length - 1 ? order[1] : order[idx + 1];
        handleCellChange(serviceId, employeeId, day, nextCode);
    };

    // Save attendance updates to backend
    const handleSaveAttendance = async () => {
        if (dirtyUpdates.size === 0) return;
        setSaving(true);
        try {
            const updatesList = Array.from(dirtyUpdates.values());
            const res = await saveTemporaryMusterAttendance(year, month, updatesList);
            addToast('success', res.message || `Saved ${updatesList.length} attendance updates & synced duty pay.`);
            setDirtyUpdates(new Map());
            await loadData();
        } catch (err: any) {
            console.error('Failed saving temporary attendance:', err);
            addToast('error', err?.response?.data?.error || err?.response?.data?.detail || 'Failed to save temporary attendance.');
        } finally {
            setSaving(false);
        }
    };

    // Unassign guard
    const handleUnassignGuard = async (service: TemporaryMusterServiceBlock, guard: TemporaryMusterGuard) => {
        if (!window.confirm(`Unassign guard "${guard.name}" (${guard.employee_code}) from temporary service ${service.reference_number}?`)) {
            return;
        }
        try {
            await unassignTemporaryGuard(service.id, {
                assignment_id: guard.assignment_id,
                employee_id: guard.employee_id
            });
            addToast('success', `Unassigned ${guard.name} from ${service.reference_number}.`);
            loadData();
        } catch (err: any) {
            addToast('error', err?.response?.data?.error || 'Failed to unassign guard.');
        }
    };

    // Open Assign Modal for a service
    const openAssignModal = (svc: TemporaryMusterServiceBlock) => {
        setAssignTargetService(svc);
        setSelectedRequirementIndex(0);
        setGuardSearch('');
    };

    // Current service manpower requirements list
    const reqList = useMemo(() => {
        if (!assignTargetService) return [];
        if (assignTargetService.manpower_requirements && assignTargetService.manpower_requirements.length > 0) {
            return assignTargetService.manpower_requirements;
        }
        return [
            {
                id: 'default-req',
                designation_name: 'Security Guard Civil',
                required_headcount: 1,
                daily_pay_rate: 2000,
                daily_billing_rate: 0
            }
        ];
    }, [assignTargetService]);

    const activeReq = reqList[selectedRequirementIndex] || reqList[0];

    // Filtered personnel matching guardSearch query
    const filteredEmployees = useMemo(() => {
        if (!guardSearch.trim()) return allEmployees.slice(0, 30);
        const q = guardSearch.toLowerCase().trim();
        const qNoZero = q.replace(/^0+/, '');
        return allEmployees.filter(e => {
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
        }).slice(0, 30);
    }, [allEmployees, guardSearch]);

    // Deploy guard to site roster for this requirement
    const handleDeployGuard = async (emp: any, req: any) => {
        if (!assignTargetService) return;
        setIsAssigning(true);
        try {
            const dailyPayRate = req?.daily_pay_rate || 2000;
            const dailyBillingRate = req?.daily_billing_rate || 0;
            const desigId = req?.designation_id || emp.designation_id || undefined;

            await assignTemporaryGuards(assignTargetService.id, [
                {
                    employee_id: emp.id,
                    designation_id: desigId,
                    daily_pay_rate: Number(dailyPayRate),
                    daily_billing_rate: Number(dailyBillingRate),
                    notes: req?.designation_name ? `Assigned as ${req.designation_name}` : ''
                }
            ]);
            addToast('success', `Assigned ${emp.first_name} ${emp.last_name || ''} as ${req?.designation_name || 'Guard'}!`);
            setAssignTargetService(null);
            setGuardSearch('');
            await loadData();
        } catch (err: any) {
            addToast('error', err?.response?.data?.error || err?.response?.data?.detail || 'Failed to deploy guard.');
        } finally {
            setIsAssigning(false);
        }
    };

    const daysInMonth = gridData?.days_in_month || 31;
    const services = gridData?.services || [];

    // Filtered services based on user selections
    const filteredServices = useMemo(() => {
        return services.filter(svc => {
            // Event / Site filter
            if (selectedEventFilter !== 'ALL' && svc.id !== selectedEventFilter && svc.operational_site_id !== selectedEventFilter) {
                return false;
            }

            // Status filter
            if (statusFilter !== 'ALL') {
                if (statusFilter === 'APPROVED' && svc.status !== 'APPROVED' && svc.status !== 'CONFIRMED') return false;
                if (statusFilter === 'IN_PROGRESS' && svc.status !== 'IN_PROGRESS') return false;
                if (statusFilter === 'COMPLETED' && svc.status !== 'COMPLETED') return false;
            }

            // Search query filter
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                const refMatches = (svc.reference_number || '').toLowerCase().includes(q);
                const titleMatches = (svc.title || '').toLowerCase().includes(q);
                const clientMatches = (svc.crm_entity_name || '').toLowerCase().includes(q);
                const siteMatches = (svc.site_name || '').toLowerCase().includes(q);
                const guardMatches = svc.guards.some(g => 
                    (g.name || '').toLowerCase().includes(q) || 
                    (g.employee_code || '').toLowerCase().includes(q)
                );
                if (!refMatches && !titleMatches && !clientMatches && !siteMatches && !guardMatches) {
                    return false;
                }
            }

            return true;
        });
    }, [services, selectedEventFilter, statusFilter, searchQuery]);

    // Operations Rollup Metrics from filtered services
    const opsRollup = useMemo(() => {
        let totalGuardPay = 0;
        let totalRequiredHeadcount = 0;
        let totalAssignedGuards = 0;

        filteredServices.forEach(s => {
            totalGuardPay += s.totals?.manpower_guard_pay || 0;
            const reqCount = s.total_required_headcount ?? (s.manpower_requirements?.reduce((acc, r) => acc + (r.required_headcount || 1), 0) || 0);
            totalRequiredHeadcount += reqCount;
            totalAssignedGuards += s.guards.length;
        });

        return {
            totalGuardPay,
            totalRequiredHeadcount,
            totalAssignedGuards
        };
    }, [filteredServices]);

    // Export current temporary muster to CSV
    const handleExportCsv = () => {
        const header = ['Event Ref', 'Event Title', 'Client', 'Location', 'Code', 'Role', 'Guard Name', 'Daily Pay (Rs)', ...Array.from({ length: daysInMonth }, (_, i) => String(i + 1)), 'Attended Days', 'Total Pay (Rs)'];
        const rows: string[][] = [header];

        filteredServices.forEach(svc => {
            svc.guards.forEach(g => {
                const daysValues = Array.from({ length: daysInMonth }, (_, i) => g.days[String(i + 1)] || '');
                rows.push([
                    svc.reference_number,
                    svc.title,
                    svc.crm_entity_name,
                    svc.site_name,
                    g.employee_code,
                    g.designation,
                    g.name,
                    String(g.daily_pay_rate),
                    ...daysValues,
                    String(g.attended_days),
                    String(g.total_guard_pay)
                ]);
            });
        });

        const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `Temporary_Services_Muster_${year}_${month}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const getCellBadgeStyle = (code: string) => {
        switch (code) {
            case 'P':
            case '1':
                return { bg: '#dcfce7', color: '#15803d', border: '#86efac' };
            case 'A':
            case '0':
                return { bg: '#fee2e2', color: '#b91c1c', border: '#fca5a5' };
            case 'L':
            case 'PL':
            case 'SL':
                return { bg: '#fef3c7', color: '#b45309', border: '#fde68a' };
            case 'O':
            case 'OD':
                return { bg: '#f3e8ff', color: '#7e22ce', border: '#d8b4fe' };
            case 'WP':
                return { bg: '#dbeafe', color: '#1d4ed8', border: '#93c5fd' };
            default:
                return { bg: 'transparent', color: 'inherit', border: 'transparent' };
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Dedicated Temporary Services Muster Top Header Bar */}
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
                boxShadow: '0 2px 4px rgba(0,0,0,0.04)'
            }}>
                {/* Left: Back Button, Title, and Mode Switcher */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                    {onBack && (
                        <button
                            type="button"
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
                        <div style={{ width: 36, height: 36, borderRadius: '8px', background: 'rgba(5, 150, 105, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669', fontSize: '1.4rem' }}>
                            <i className='bx bx-bolt-circle'></i>
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text, #0f172a)' }}>
                                Temporary Services Duty Muster
                            </h2>
                            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #64748b)' }}>
                                Event post requirements & daily muster attendance
                            </span>
                        </div>
                    </div>

                    {/* Mode Switcher */}
                    {onSwitchToRegular && (
                        <div style={{ display: 'flex', backgroundColor: 'var(--color-bg, #f1f5f9)', padding: '4px', borderRadius: '8px', border: '1px solid var(--color-border, #cbd5e1)' }}>
                            <button
                                type="button"
                                onClick={onSwitchToRegular}
                                style={{
                                    padding: '6px 14px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    fontWeight: 700,
                                    fontSize: '0.84rem',
                                    cursor: 'pointer',
                                    backgroundColor: 'transparent',
                                    color: 'var(--color-text-muted, #64748b)',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <i className="bx bx-spreadsheet" style={{ marginRight: '6px' }} />
                                Regular Monthly Muster
                            </button>
                            <button
                                type="button"
                                style={{
                                    padding: '6px 14px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    fontWeight: 700,
                                    fontSize: '0.84rem',
                                    cursor: 'default',
                                    backgroundColor: '#059669',
                                    color: '#ffffff',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                                }}
                            >
                                <i className="bx bx-bolt-circle" style={{ marginRight: '6px' }} />
                                Temporary Services Muster
                            </button>
                        </div>
                    )}
                </div>

                {/* Right: Month & Year, Site Filter, Status Filter, Search, Export, Save */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    {/* Month & Year Selectors */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--color-bg, #f1f5f9)', padding: '4px 8px', borderRadius: '8px', border: '1px solid var(--color-border, #cbd5e1)' }}>
                        <select
                            value={month}
                            onChange={(e) => onMonthChange && onMonthChange(Number(e.target.value))}
                            style={{
                                padding: '6px 10px',
                                borderRadius: '6px',
                                background: 'var(--color-surface, #ffffff)',
                                color: 'var(--color-text, #0f172a)',
                                border: '1px solid var(--color-border, #cbd5e1)',
                                fontWeight: 700,
                                fontSize: '0.88rem',
                                cursor: 'pointer'
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
                            onChange={(e) => onYearChange && onYearChange(Number(e.target.value))}
                            style={{
                                padding: '6px 10px',
                                borderRadius: '6px',
                                background: 'var(--color-surface, #ffffff)',
                                color: 'var(--color-text, #0f172a)',
                                border: '1px solid var(--color-border, #cbd5e1)',
                                fontWeight: 700,
                                fontSize: '0.88rem',
                                cursor: 'pointer'
                            }}
                        >
                            <option value={2025}>2025</option>
                            <option value={2026}>2026</option>
                            <option value={2027}>2027</option>
                        </select>
                    </div>

                    {/* Event / Site Dropdown Filter */}
                    <select
                        value={selectedEventFilter}
                        onChange={(e) => setSelectedEventFilter(e.target.value)}
                        style={{
                            padding: '8px 12px',
                            borderRadius: '8px',
                            background: 'var(--color-surface, #ffffff)',
                            color: 'var(--color-text, #0f172a)',
                            border: '1px solid var(--color-border, #cbd5e1)',
                            fontWeight: 600,
                            fontSize: '0.88rem',
                            maxWidth: '220px',
                            cursor: 'pointer'
                        }}
                    >
                        <option value="ALL">🏢 All Events & Sites ({services.length})</option>
                        {services.map(s => (
                            <option key={s.id} value={s.id}>
                                {s.reference_number} — {s.site_name}
                            </option>
                        ))}
                    </select>

                    {/* Status Dropdown Filter */}
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        style={{
                            padding: '8px 12px',
                            borderRadius: '8px',
                            background: 'var(--color-surface, #ffffff)',
                            color: 'var(--color-text, #0f172a)',
                            border: '1px solid var(--color-border, #cbd5e1)',
                            fontWeight: 600,
                            fontSize: '0.88rem',
                            cursor: 'pointer'
                        }}
                    >
                        <option value="ALL">All Statuses</option>
                        <option value="APPROVED">Approved / Confirmed</option>
                        <option value="IN_PROGRESS">In Progress</option>
                        <option value="COMPLETED">Completed</option>
                    </select>

                    {/* Search Input */}
                    <div style={{ position: 'relative', minWidth: '220px' }}>
                        <i className='bx bx-search' style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}></i>
                        <input
                            type="text"
                            placeholder="Filter Event, Client, Guard..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '8px 12px 8px 34px',
                                borderRadius: '8px',
                                background: 'var(--color-surface, #ffffff)',
                                border: '1px solid var(--color-border, #cbd5e1)',
                                color: 'var(--color-text, #0f172a)',
                                fontSize: '0.88rem',
                                boxSizing: 'border-box'
                            }}
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.9rem' }}
                            >
                                ✕
                            </button>
                        )}
                    </div>

                    {/* Export CSV */}
                    <button
                        type="button"
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

                    {/* Save Attendance Button */}
                    <button
                        type="button"
                        onClick={handleSaveAttendance}
                        disabled={saving || dirtyUpdates.size === 0}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 18px',
                            borderRadius: '8px',
                            background: dirtyUpdates.size > 0 ? '#10b981' : '#94a3b8',
                            color: '#ffffff',
                            border: 'none',
                            fontWeight: 700,
                            fontSize: '0.88rem',
                            cursor: dirtyUpdates.size > 0 ? 'pointer' : 'default',
                            boxShadow: dirtyUpdates.size > 0 ? '0 2px 8px rgba(16, 185, 129, 0.4)' : 'none',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <i className='bx bx-save'></i>
                        {saving ? 'Saving...' : `Save Attendance ${dirtyUpdates.size > 0 ? `(${dirtyUpdates.size})` : ''}`}
                    </button>
                </div>
            </div>

            {/* Unsaved changes alert */}
            {dirtyUpdates.size > 0 && (
                <div style={{
                    padding: '12px 18px',
                    borderRadius: '8px',
                    backgroundColor: '#ecfdf5',
                    border: '1px solid #6ee7b7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '13.5px',
                    color: '#065f46'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <i className="bx bx-info-circle" style={{ fontSize: '18px' }} />
                        <span>You have <strong>{dirtyUpdates.size}</strong> unsaved attendance updates in the temporary muster sheet.</span>
                    </div>
                    <button
                        type="button"
                        onClick={handleSaveAttendance}
                        disabled={saving}
                        style={{
                            background: '#059669',
                            color: '#ffffff',
                            border: 'none',
                            padding: '6px 16px',
                            borderRadius: '6px',
                            fontWeight: 700,
                            cursor: 'pointer'
                        }}
                    >
                        {saving ? 'Saving...' : 'Save Updates Now'}
                    </button>
                </div>
            )}

            {/* Clean Rollup Metric Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                <div style={{
                    padding: '16px 20px',
                    borderRadius: '12px',
                    background: 'var(--color-surface, #ffffff)',
                    border: '1px solid var(--color-border, #e2e8f0)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
                }}>
                    <div style={{ width: 44, height: 44, borderRadius: '10px', background: 'rgba(37, 99, 235, 0.12)', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>
                        <i className='bx bx-calendar-event'></i>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Active Events</div>
                        <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--color-text, #0f172a)', marginTop: '2px' }}>
                            {filteredServices.length} <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-muted, #64748b)' }}>Events</span>
                        </div>
                    </div>
                </div>

                <div style={{
                    padding: '16px 20px',
                    borderRadius: '12px',
                    background: 'var(--color-surface, #ffffff)',
                    border: '1px solid var(--color-border, #e2e8f0)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
                }}>
                    <div style={{ width: 44, height: 44, borderRadius: '10px', background: 'rgba(79, 70, 229, 0.12)', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>
                        <i className='bx bx-user-check'></i>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Required Guards</div>
                        <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--color-text, #0f172a)', marginTop: '2px' }}>
                            {opsRollup.totalRequiredHeadcount} <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-muted, #64748b)' }}>Guards</span>
                        </div>
                    </div>
                </div>

                <div style={{
                    padding: '16px 20px',
                    borderRadius: '12px',
                    background: 'var(--color-surface, #ffffff)',
                    border: '1px solid var(--color-border, #e2e8f0)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
                }}>
                    <div style={{ width: 44, height: 44, borderRadius: '10px', background: 'rgba(16, 185, 129, 0.12)', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>
                        <i className='bx bx-shield-quarter'></i>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Deployed Guards</div>
                        <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--color-text, #0f172a)', marginTop: '2px' }}>
                            {opsRollup.totalAssignedGuards} <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-muted, #64748b)' }}>Guards</span>
                        </div>
                    </div>
                </div>

                <div style={{
                    padding: '16px 20px',
                    borderRadius: '12px',
                    background: 'var(--color-surface, #ffffff)',
                    border: '1px solid var(--color-border, #e2e8f0)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
                }}>
                    <div style={{ width: 44, height: 44, borderRadius: '10px', background: 'rgba(217, 119, 6, 0.12)', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>
                        <i className='bx bx-wallet'></i>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Accrued Duty Pay</div>
                        <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#dc2626', marginTop: '2px' }}>
                            ₨ {opsRollup.totalGuardPay.toLocaleString()}
                        </div>
                    </div>
                </div>
            </div>

            {/* Loading Indicator */}
            {loading && (
                <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--color-surface, #ffffff)', borderRadius: '12px', border: '1px solid var(--color-border, #e2e8f0)' }}>
                    <i className="bx bx-loader-alt bx-spin" style={{ fontSize: '2.5rem', color: '#059669', marginBottom: '12px' }} />
                    <h3 style={{ margin: 0, fontWeight: 700, color: 'var(--color-text, #0f172a)' }}>Loading Temporary Services Muster...</h3>
                    <p style={{ color: 'var(--color-text-muted, #64748b)', marginTop: '4px', fontSize: '0.88rem' }}>Fetching event locations and guard assignments for {month}/{year}...</p>
                </div>
            )}

            {/* Empty state */}
            {!loading && filteredServices.length === 0 && (
                <div style={{
                    padding: '60px 20px',
                    textAlign: 'center',
                    background: 'var(--color-surface, #ffffff)',
                    borderRadius: '12px',
                    border: '1px dashed var(--color-border, #cbd5e1)'
                }}>
                    <div style={{ width: 56, height: 56, borderRadius: '28px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', fontSize: '1.8rem', color: '#94a3b8' }}>
                        <i className="bx bx-calendar-x" />
                    </div>
                    <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--color-text, #0f172a)', fontWeight: 700 }}>
                        No Temporary Security Services Match Current Filter
                    </h3>
                    <p style={{ margin: '6px 0 0', fontSize: '0.88rem', color: 'var(--color-text-muted, #64748b)' }}>
                        No events found for {month}/{year}. Select "All Events & Sites" or adjust search filters.
                    </p>
                </div>
            )}

            {/* Event Muster Blocks */}
            {!loading && filteredServices.map((svc) => {
                const sDateStr = new Date(svc.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                const eDateStr = new Date(svc.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                const totalAttendedShifts = svc.guards.reduce((acc, g) => acc + (g.attended_days || 0), 0);
                const isCollapsed = collapsedServices.has(svc.id);

                return (
                    <div
                        key={svc.id}
                        style={{
                            marginBottom: '28px',
                            background: 'var(--color-surface, #ffffff)',
                            borderRadius: '12px',
                            border: '1px solid var(--color-border, #e2e8f0)',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                            overflow: 'hidden'
                        }}
                    >
                        {/* Event Header Banner (Exact High-End Style of Regular Muster Site Banner) */}
                        <div style={{
                            background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                            padding: '12px 20px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '12px',
                            color: '#ffffff'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <button
                                    type="button"
                                    onClick={() => toggleCollapse(svc.id)}
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
                                        cursor: 'pointer'
                                    }}
                                    title={isCollapsed ? 'Expand event muster sheet' : 'Collapse event muster sheet'}
                                >
                                    <i className={`bx ${isCollapsed ? 'bx-chevron-right' : 'bx-chevron-down'}`}></i>
                                </button>
                                <div style={{ width: 32, height: 32, borderRadius: '6px', background: 'rgba(255, 255, 255, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
                                    <i className='bx bx-calendar-star'></i>
                                </div>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#ffffff' }}>
                                            {svc.reference_number} • {svc.title || 'Event Security'}
                                        </h3>
                                        <span style={{
                                            background: 'rgba(255, 255, 255, 0.22)',
                                            color: '#ffffff',
                                            padding: '2px 8px',
                                            borderRadius: '4px',
                                            fontSize: '0.72rem',
                                            fontWeight: 800,
                                            letterSpacing: '0.5px'
                                        }}>
                                            {svc.status}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '0.8rem', opacity: 0.95, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        <span>Client: <strong>{svc.crm_entity_name}</strong></span>
                                        <span>•</span>
                                        <span>Location: <strong>{svc.site_name}</strong> {svc.is_temporary_site && '(Temporary Venue)'}</span>
                                        <span>•</span>
                                        <span style={{ background: 'rgba(0, 0, 0, 0.2)', padding: '1px 8px', borderRadius: '4px', fontWeight: 600 }}>
                                            📅 {sDateStr} – {eDateStr} ({svc.active_days.length} Active {svc.active_days.length === 1 ? 'Day' : 'Days'})
                                        </span>
                                        <span>•</span>
                                        <strong>{svc.guards.length} Guards Deployed</strong>
                                    </div>
                                </div>
                            </div>

                            {/* Right side of Banner: Requirements summary chips + Action button */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                {/* Requirements summary chips */}
                                <div style={{ background: 'rgba(0, 0, 0, 0.2)', padding: '5px 12px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem' }}>
                                    <span style={{ opacity: 0.9 }}>Req:</span>
                                    {svc.manpower_requirements && svc.manpower_requirements.length > 0 ? (
                                        svc.manpower_requirements.map(req => (
                                            <strong key={req.id} style={{ background: 'rgba(255, 255, 255, 0.2)', padding: '2px 8px', borderRadius: '4px' }}>
                                                {req.required_headcount}× {normalizeDesigCode(req.designation_name)} (₨ {req.daily_pay_rate.toLocaleString()}/d)
                                            </strong>
                                        ))
                                    ) : (
                                        <strong style={{ background: 'rgba(255, 255, 255, 0.2)', padding: '2px 8px', borderRadius: '4px' }}>
                                            {svc.total_required_headcount || 1} GD
                                        </strong>
                                    )}
                                </div>

                                {/* Assign Guard Action Button */}
                                <button
                                    type="button"
                                    onClick={() => openAssignModal(svc)}
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
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    <i className='bx bx-user-plus'></i> Assign Guard
                                </button>
                            </div>
                        </div>

                        {/* Table Spreadsheet Matrix with horizontal scrolling */}
                        {!isCollapsed && (
                            <>
                                {svc.guards.length === 0 ? (
                                    <div style={{
                                        padding: '36px 20px',
                                        color: 'var(--color-text-muted, #64748b)',
                                        textAlign: 'center',
                                        background: '#ffffff',
                                        borderBottom: '1px solid #e2e8f0'
                                    }}>
                                        <div style={{ fontSize: '0.92rem', marginBottom: '12px' }}>
                                            No security guards currently deployed to this event.
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => openAssignModal(svc)}
                                            style={{
                                                background: '#059669',
                                                color: '#ffffff',
                                                border: 'none',
                                                padding: '8px 18px',
                                                borderRadius: '8px',
                                                fontWeight: 700,
                                                fontSize: '0.88rem',
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px'
                                            }}
                                        >
                                            <i className='bx bx-user-plus'></i> Assign Security Guard Now
                                        </button>
                                    </div>
                                ) : (
                                    <div style={{ overflowX: 'auto', background: '#ffffff' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: `${daysInMonth * 34 + 480}px` }}>
                                            <thead>
                                                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #cbd5e1', height: '38px' }}>
                                                    <th style={{ width: '40px', textAlign: 'center', fontWeight: 700, color: '#475569', borderRight: '1px solid #e2e8f0' }}>#</th>
                                                    <th style={{ width: '75px', textAlign: 'left', paddingLeft: '8px', fontWeight: 700, color: '#475569', borderRight: '1px solid #e2e8f0' }}>Code</th>
                                                    <th style={{ width: '60px', textAlign: 'center', fontWeight: 700, color: '#475569', borderRight: '1px solid #e2e8f0' }}>Desig</th>
                                                    <th style={{ width: '180px', textAlign: 'left', paddingLeft: '12px', fontWeight: 700, color: '#475569', borderRight: '1px solid #e2e8f0' }}>Guard Name</th>
                                                    <th style={{ width: '90px', textAlign: 'right', paddingRight: '8px', fontWeight: 700, color: '#475569', borderRight: '2px solid #cbd5e1' }}>Daily Pay</th>

                                                    {/* Days 1..31 */}
                                                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                                                        const isActive = svc.active_days.includes(d);
                                                        return (
                                                            <th
                                                                key={d}
                                                                style={{
                                                                    width: '34px',
                                                                    minWidth: '34px',
                                                                    maxWidth: '34px',
                                                                    textAlign: 'center',
                                                                    padding: '4px 0',
                                                                    background: isActive ? '#ecfdf5' : '#f8fafc',
                                                                    color: isActive ? '#059669' : '#94a3b8',
                                                                    fontWeight: isActive ? 800 : 600,
                                                                    borderRight: '1px solid #e2e8f0'
                                                                }}
                                                                title={isActive ? `Day ${d}: Active Event Date` : `Day ${d}: Inactive`}
                                                            >
                                                                {d}
                                                            </th>
                                                        );
                                                    })}

                                                    <th style={{ width: '55px', textAlign: 'center', color: '#059669', fontWeight: 800, borderLeft: '2px solid #cbd5e1', borderRight: '1px solid #e2e8f0' }}>Att.</th>
                                                    <th style={{ width: '105px', textAlign: 'right', paddingRight: '10px', color: '#059669', fontWeight: 800, borderRight: '1px solid #e2e8f0' }}>Total Pay</th>
                                                    <th style={{ width: '40px', textAlign: 'center', color: '#475569', fontWeight: 700 }}>Act</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {svc.guards.map((guard, gIdx) => {
                                                    const dCode = normalizeDesigCode(guard.designation);
                                                    const badgeStyle = getDesigBadgeStyle(dCode);
                                                    return (
                                                        <tr key={guard.assignment_id || guard.employee_id} style={{ borderBottom: '1px solid #e2e8f0', background: gIdx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                                                            <td style={{ textAlign: 'center', color: '#64748b', fontWeight: 600, borderRight: '1px solid #e2e8f0' }}>{gIdx + 1}</td>
                                                            <td style={{ paddingLeft: '8px', fontWeight: 800, color: '#0284c7', borderRight: '1px solid #e2e8f0' }}>{guard.employee_code}</td>
                                                            <td style={{ textAlign: 'center', borderRight: '1px solid #e2e8f0' }}>
                                                                <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 800, background: badgeStyle.bg, color: badgeStyle.color, border: `1px solid ${badgeStyle.border}` }}>
                                                                    {dCode}
                                                                </span>
                                                            </td>
                                                            <td style={{ paddingLeft: '12px', fontWeight: 700, color: '#0f172a', borderRight: '1px solid #e2e8f0' }}>{guard.name}</td>
                                                            <td style={{ paddingRight: '8px', textAlign: 'right', color: '#dc2626', fontWeight: 700, borderRight: '2px solid #cbd5e1' }}>
                                                                ₨ {guard.daily_pay_rate.toLocaleString()}
                                                            </td>

                                                            {/* Day Cells 1..31 */}
                                                            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                                                                const isActive = svc.active_days.includes(d);
                                                                const cellVal = guard.days[String(d)] || '';
                                                                const isDirty = dirtyUpdates.has(`${svc.id}_${guard.employee_id}_${d}`);
                                                                const badge = getCellBadgeStyle(cellVal);

                                                                if (!isActive) {
                                                                    return (
                                                                        <td
                                                                            key={d}
                                                                            style={{
                                                                                width: '34px',
                                                                                textAlign: 'center',
                                                                                background: '#f8fafc',
                                                                                color: '#cbd5e1',
                                                                                borderRight: '1px solid #e2e8f0',
                                                                                userSelect: 'none',
                                                                                cursor: 'not-allowed'
                                                                            }}
                                                                        >
                                                                            –
                                                                        </td>
                                                                    );
                                                                }

                                                                return (
                                                                    <td
                                                                        key={d}
                                                                        onClick={() => cycleAttendance(svc.id, guard.employee_id, d, cellVal)}
                                                                        style={{
                                                                            width: '34px',
                                                                            textAlign: 'center',
                                                                            borderRight: '1px solid #e2e8f0',
                                                                            cursor: 'pointer',
                                                                            fontWeight: 800,
                                                                            fontSize: '11px',
                                                                            position: 'relative',
                                                                            background: isDirty ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
                                                                            userSelect: 'none'
                                                                        }}
                                                                        title={`Day ${d}: Click to cycle (P → A → L → O → WP)`}
                                                                    >
                                                                        {cellVal ? (
                                                                            <span style={{
                                                                                display: 'inline-block',
                                                                                width: '24px',
                                                                                height: '24px',
                                                                                lineHeight: '22px',
                                                                                borderRadius: '4px',
                                                                                background: badge.bg,
                                                                                color: badge.color,
                                                                                border: `1px solid ${badge.border}`
                                                                            }}>
                                                                                {cellVal}
                                                                            </span>
                                                                        ) : (
                                                                            <span style={{ color: '#cbd5e1' }}>·</span>
                                                                        )}
                                                                        {isDirty && (
                                                                            <span style={{
                                                                                position: 'absolute',
                                                                                top: '2px',
                                                                                right: '2px',
                                                                                width: '5px',
                                                                                height: '5px',
                                                                                borderRadius: '50%',
                                                                                backgroundColor: '#f59e0b'
                                                                            }} />
                                                                        )}
                                                                    </td>
                                                                );
                                                            })}

                                                            <td style={{ textAlign: 'center', fontWeight: 800, color: '#059669', borderLeft: '2px solid #cbd5e1', borderRight: '1px solid #e2e8f0' }}>
                                                                {guard.attended_days}
                                                            </td>
                                                            <td style={{ textAlign: 'right', paddingRight: '10px', fontWeight: 800, color: '#059669', borderRight: '1px solid #e2e8f0' }}>
                                                                ₨ {guard.total_guard_pay.toLocaleString()}
                                                            </td>
                                                            <td style={{ textAlign: 'center' }}>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleUnassignGuard(svc, guard)}
                                                                    style={{
                                                                        background: 'none',
                                                                        border: 'none',
                                                                        color: '#ef4444',
                                                                        cursor: 'pointer',
                                                                        fontSize: '1.1rem',
                                                                        padding: '2px'
                                                                    }}
                                                                    title={`Unassign ${guard.name}`}
                                                                >
                                                                    <i className='bx bx-trash'></i>
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {/* Event Footer Bar */}
                                <div style={{
                                    padding: '10px 20px',
                                    background: '#f8fafc',
                                    borderTop: '1px solid #e2e8f0',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    flexWrap: 'wrap',
                                    gap: '12px',
                                    fontSize: '0.85rem'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                                        <span>Deployed: <strong>{svc.guards.length} Guards</strong></span>
                                        <span>•</span>
                                        <span>Attended Shifts: <strong>{totalAttendedShifts} Days</strong></span>
                                        <span>•</span>
                                        <span>Accrued Guard Pay: <strong style={{ color: '#dc2626' }}>₨ {(svc.totals?.manpower_guard_pay || 0).toLocaleString()}</strong></span>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                );
            })}

            {/* Exact Assign Guard to Site Roster Modal (100% Visual Parity) */}
            {assignTargetService && (
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
                            <button
                                type="button"
                                onClick={() => setAssignTargetService(null)}
                                style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '1.3rem', cursor: 'pointer', padding: '4px' }}
                            >
                                ✕
                            </button>
                        </div>

                        {/* Uneditable Location & Client Header Banner */}
                        <div style={{ background: 'var(--color-bg, #f8fafc)', border: '1px solid var(--color-border, #e2e8f0)', borderRadius: '10px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                            <div>
                                <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--color-text-muted, #64748b)', fontWeight: 700, letterSpacing: '0.5px' }}>Operational Location</span>
                                <div style={{ fontWeight: 800, color: '#059669', fontSize: '1rem' }}>
                                    📍 {assignTargetService.site_name || assignTargetService.title}
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--color-text-muted, #64748b)', fontWeight: 700, letterSpacing: '0.5px' }}>Client / Company</span>
                                <div style={{ fontWeight: 700, color: 'var(--color-text, #0f172a)', fontSize: '0.88rem' }}>
                                    🏢 {assignTargetService.crm_entity_name || 'Client'}
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
                                    const dCode = normalizeDesigCode(req.designation_name);
                                    return (
                                        <option key={idx} value={idx}>
                                            {req.designation_name} ({dCode}) — Req: {req.required_headcount || 1}
                                        </option>
                                    );
                                })}
                            </select>
                        </div>

                        {/* Selected Position Compensation & Details Pill (Uneditable) */}
                        {activeReq && (() => {
                            const activeCode = normalizeDesigCode(activeReq.designation_name);
                            const pillStyle = getDesigBadgeStyle(activeCode);
                            const sub = getGuardSubBadge(activeReq.designation_name);
                            const subStyle = sub ? getSubBadgeStyle(sub) : null;
                            const dailyPay = Number(activeReq.daily_pay_rate || 2000);
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
                                                    {sub.toLowerCase()}
                                                </span>
                                            )}
                                        </div>
                                        <div>
                                            <strong style={{ fontSize: '0.9rem', color: 'var(--color-text, #0f172a)' }}>{activeReq.designation_name}</strong>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #64748b)' }}>
                                                Daily Rate: <strong>Rs. {dailyPay.toFixed(2)}/day</strong>
                                            </div>
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
                            {filteredEmployees.map(emp => (
                                <div
                                    key={emp.id}
                                    onClick={() => !isAssigning && handleDeployGuard(emp, activeReq)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '10px 14px',
                                        borderRadius: '8px',
                                        background: 'var(--color-bg, #f8fafc)',
                                        border: '1px solid var(--color-border, #e2e8f0)',
                                        cursor: isAssigning ? 'not-allowed' : 'pointer',
                                        transition: 'all 0.15s'
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#059669'; e.currentTarget.style.background = '#f0fdf4'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border, #e2e8f0)'; e.currentTarget.style.background = 'var(--color-bg, #f8fafc)'; }}
                                >
                                    <div>
                                        <strong style={{ color: 'var(--color-text, #0f172a)', fontSize: '0.92rem' }}>{emp.first_name} {emp.last_name || ''}</strong>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #64748b)', marginTop: '2px' }}>
                                            Code: <span style={{ color: '#0284c7', fontWeight: 800 }}>{emp.previous_employee_code || emp.display_code || emp.employee_code}</span> | Base: {emp.designation_name || emp.designation?.name || 'Guard'} | {emp.city || 'KHI'}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        disabled={isAssigning}
                                        style={{
                                            background: '#059669',
                                            color: '#ffffff',
                                            border: 'none',
                                            padding: '6px 14px',
                                            borderRadius: '6px',
                                            fontSize: '0.82rem',
                                            fontWeight: 800,
                                            pointerEvents: 'none',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}
                                    >
                                        {isAssigning ? 'Deploying...' : `+ Deploy as ${normalizeDesigCode(activeReq?.designation_name)}`}
                                    </button>
                                </div>
                            ))}
                            {filteredEmployees.length === 0 && (
                                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-muted, #64748b)', fontSize: '0.85rem' }}>
                                    No personnel found matching "{guardSearch}".
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
