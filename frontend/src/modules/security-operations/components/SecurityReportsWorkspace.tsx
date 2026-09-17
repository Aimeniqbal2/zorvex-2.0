import React, { useState, useEffect, useCallback } from 'react';
import {
    getSecurityExecutiveDashboard,
    getSecurityProfitabilityReport,
    getSecurityWorkforceReport,
    getSecurityOperationsReport,
    getSecurityInventoryReport,
    getSecurityPurchasingReport,
    getSecurityFinanceReport,
    getSecurityComplianceReport,
    getSecurityTrendsReport,
    getSecurityDrillDown,
    getSecurityExportCsvUrl
} from '../api';

type PrimarySection =
    | 'executive'
    | 'profitability'
    | 'workforce'
    | 'operations'
    | 'inventory'
    | 'purchasing'
    | 'finance'
    | 'compliance'
    | 'trends';

export const SecurityReportsWorkspace: React.FC = () => {
    const [activeSection, setActiveSection] = useState<PrimarySection>('executive');
    const [subReportType, setSubReportType] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    // Filter states
    const [startDate, setStartDate] = useState<string>(() => {
        const d = new Date();
        d.setDate(1);
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
    const [filterSiteId, setFilterSiteId] = useState<string>('');
    const [filterStatus, setFilterStatus] = useState<string>('');
    const [profitabilityDimension, setProfitabilityDimension] = useState<'client' | 'contract' | 'site'>('contract');

    // Report data stores
    const [executiveData, setExecutiveData] = useState<any>(null);
    const [profitabilityData, setProfitabilityData] = useState<any>(null);
    const [reportResult, setReportResult] = useState<any>(null);
    const [complianceData, setComplianceData] = useState<any>(null);
    const [trendsData, setTrendsData] = useState<any>(null);

    // Drill-down modal state
    const [drillDownEntity, setDrillDownEntity] = useState<{ type: string; id: string } | null>(null);
    const [drillDownData, setDrillDownData] = useState<any>(null);
    const [drillDownLoading, setDrillDownLoading] = useState<boolean>(false);

    // Section sub-report configuration
    const subReportsBySection: Record<string, { id: string; label: string }[]> = {
        workforce: [
            { id: 'employee_master', label: 'Employee Master' },
            { id: 'site_strength', label: 'Site Strength & Manpower' },
            { id: 'attendance', label: 'Attendance Register' },
            { id: 'absence', label: 'Absence Register' },
            { id: 'jump', label: 'JUMP Defaulters' },
            { id: 'replacement_duty', label: 'Replacement Duties' },
            { id: 'payroll_summary', label: 'Payroll Summary' },
            { id: 'statutory', label: 'Statutory Contributions' },
            { id: 'equipment_custody', label: 'Guard Equipment Custody' }
        ],
        operations: [
            { id: 'site_manpower', label: 'Site Manpower vs Deployed' },
            { id: 'duty_roster', label: 'Duty Roster Register' },
            { id: 'replacements', label: 'Replacement Coverage' },
            { id: 'incidents', label: 'Incident Register' },
            { id: 'dob', label: 'Daily Occurrence Book (DOB)' },
            { id: 'patrols', label: 'Patrol Performance' },
            { id: 'missed_checkpoints', label: 'Missed Checkpoints' },
            { id: 'emergencies', label: 'Emergency / SOS Events' },
            { id: 'inspections', label: 'Supervisor Inspections' },
            { id: 'escalations', label: 'Escalations & SLA' }
        ],
        inventory: [
            { id: 'store_stock', label: 'Store Stock Balances' },
            { id: 'site_custody', label: 'Site Custody Register' },
            { id: 'employee_custody', label: 'Employee Custody Register' },
            { id: 'serialized', label: 'Serialized Equipment' },
            { id: 'issue_return_history', label: 'Issue / Return History' },
            { id: 'lost_damaged', label: 'Lost / Damaged Register' },
            { id: 'low_stock', label: 'Low Stock Alerts' },
            { id: 'controlled_items', label: 'Controlled Equipment' }
        ],
        purchasing: [
            { id: 'requisitions', label: 'Purchase Requisitions' },
            { id: 'purchase_orders', label: 'Purchase Orders' },
            { id: 'grn', label: 'Goods Receipt Notes (GRN)' },
            { id: 'vendor_invoices', label: 'Vendor Invoices' },
            { id: 'three_way_match', label: 'Three-Way Match Exceptions' },
            { id: 'vendor_payables', label: 'Vendor Payables' }
        ],
        finance: [
            { id: 'ar_aging', label: 'AR Aging Snapshot' },
            { id: 'ap_aging', label: 'AP Aging Snapshot' },
            { id: 'payroll_liability', label: 'Payroll Liability' },
            { id: 'gl_profitability', label: 'GL Profitability Summary' }
        ]
    };

    // Load active data
    const loadReportData = useCallback(async () => {
        setLoading(true);
        setError(null);

        const params: Record<string, any> = {
            start_date: startDate,
            end_date: endDate,
            site_id: filterSiteId || undefined,
            status: filterStatus || undefined
        };

        try {
            if (activeSection === 'executive') {
                const res = await getSecurityExecutiveDashboard(params);
                setExecutiveData(res);
            } else if (activeSection === 'profitability') {
                const res = await getSecurityProfitabilityReport(profitabilityDimension, params);
                setProfitabilityData(res);
            } else if (activeSection === 'workforce') {
                const type = subReportType || 'employee_master';
                const res = await getSecurityWorkforceReport(type, params);
                setReportResult(res);
            } else if (activeSection === 'operations') {
                const type = subReportType || 'site_manpower';
                const res = await getSecurityOperationsReport(type, params);
                setReportResult(res);
            } else if (activeSection === 'inventory') {
                const type = subReportType || 'store_stock';
                const res = await getSecurityInventoryReport(type, params);
                setReportResult(res);
            } else if (activeSection === 'purchasing') {
                const type = subReportType || 'purchase_orders';
                const res = await getSecurityPurchasingReport(type, params);
                setReportResult(res);
            } else if (activeSection === 'finance') {
                const type = subReportType || 'ar_aging';
                const res = await getSecurityFinanceReport(type, params);
                setReportResult(res);
            } else if (activeSection === 'compliance') {
                const res = await getSecurityComplianceReport(params);
                setComplianceData(res);
            } else if (activeSection === 'trends') {
                const res = await getSecurityTrendsReport(6);
                setTrendsData(res);
            }
        } catch (err: any) {
            console.error('Failed to load security report:', err);
            setError(err.response?.data?.detail || err.message || 'Error loading report');
        } finally {
            setLoading(false);
        }
    }, [activeSection, subReportType, startDate, endDate, filterSiteId, filterStatus, profitabilityDimension]);

    useEffect(() => {
        // Set default subReportType when changing primary section
        const subList = subReportsBySection[activeSection];
        if (subList && subList.length > 0) {
            setSubReportType(subList[0].id);
        } else {
            setSubReportType('');
        }
    }, [activeSection]);

    useEffect(() => {
        loadReportData();
    }, [loadReportData]);

    // Handle Drill-down
    const handleOpenDrillDown = async (type: string, id: string) => {
        setDrillDownEntity({ type, id });
        setDrillDownLoading(true);
        try {
            const data = await getSecurityDrillDown(type, id);
            setDrillDownData(data);
        } catch (e: any) {
            console.error('Drill-down load error:', e);
            setDrillDownData({ error: 'Failed to load details' });
        } finally {
            setDrillDownLoading(false);
        }
    };

    // CSV Export
    const handleTriggerCsvExport = () => {
        const url = getSecurityExportCsvUrl(activeSection, subReportType, {
            start_date: startDate,
            end_date: endDate,
            site_id: filterSiteId || undefined,
            status: filterStatus || undefined,
            dimension: profitabilityDimension
        });
        window.open(url, '_blank');
    };

    // Helper: format currency
    const fmtCurr = (val: any) => {
        if (val === null || val === undefined) return '—';
        const num = parseFloat(val);
        if (isNaN(num)) return '—';
        return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    return (
        <div style={{ padding: '1.5rem', background: 'var(--color-surface)', minHeight: '100%', color: 'var(--color-text)', paddingBottom: '80px', boxSizing: 'border-box' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <i className="bx bx-bar-chart-alt-2" style={{ color: 'var(--color-primary)' }}></i>
                        Security Reports & Analytics Workspace
                    </h1>
                    <p style={{ margin: '0.3rem 0 0 0', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                        Authoritative management reporting across Commercial, Workforce, Operations, Store & Accounting.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                    <button
                        onClick={handleTriggerCsvExport}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            padding: '0.5rem 1rem',
                            borderRadius: '6px',
                            background: 'var(--color-surface-hover)',
                            border: '1px solid var(--color-border)',
                            color: 'var(--color-text)',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: 600
                        }}
                    >
                        <i className="bx bx-download"></i> Export CSV
                    </button>
                    <button
                        onClick={loadReportData}
                        disabled={loading}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            padding: '0.5rem 1.2rem',
                            borderRadius: '6px',
                            background: 'var(--color-primary)',
                            color: '#fff',
                            border: 'none',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: 600
                        }}
                    >
                        <i className={`bx bx-refresh ${loading ? 'bx-spin' : ''}`}></i> Refresh
                    </button>
                </div>
            </div>

            {/* Global Filters Toolbar */}
            <div
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '1rem',
                    padding: '0.9rem 1.2rem',
                    background: 'var(--color-card)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    marginBottom: '1.5rem',
                    alignItems: 'center'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Start Date:</span>
                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        style={{
                            padding: '0.35rem 0.6rem',
                            borderRadius: '4px',
                            border: '1px solid var(--color-border)',
                            background: 'var(--color-surface)',
                            color: 'var(--color-text)',
                            fontSize: '0.85rem'
                        }}
                    />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>End Date:</span>
                    <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        style={{
                            padding: '0.35rem 0.6rem',
                            borderRadius: '4px',
                            border: '1px solid var(--color-border)',
                            background: 'var(--color-surface)',
                            color: 'var(--color-text)',
                            fontSize: '0.85rem'
                        }}
                    />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Site Filter:</span>
                    <input
                        type="text"
                        placeholder="Site ID or Name..."
                        value={filterSiteId}
                        onChange={(e) => setFilterSiteId(e.target.value)}
                        style={{
                            padding: '0.35rem 0.6rem',
                            borderRadius: '4px',
                            border: '1px solid var(--color-border)',
                            background: 'var(--color-surface)',
                            color: 'var(--color-text)',
                            fontSize: '0.85rem',
                            width: '130px'
                        }}
                    />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Status:</span>
                    <input
                        type="text"
                        placeholder="Status..."
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        style={{
                            padding: '0.35rem 0.6rem',
                            borderRadius: '4px',
                            border: '1px solid var(--color-border)',
                            background: 'var(--color-surface)',
                            color: 'var(--color-text)',
                            fontSize: '0.85rem',
                            width: '100px'
                        }}
                    />
                </div>
                {activeSection === 'profitability' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Dimension:</span>
                        <select
                            value={profitabilityDimension}
                            onChange={(e: any) => setProfitabilityDimension(e.target.value)}
                            style={{
                                padding: '0.35rem 0.6rem',
                                borderRadius: '4px',
                                border: '1px solid var(--color-border)',
                                background: 'var(--color-surface)',
                                color: 'var(--color-text)',
                                fontSize: '0.85rem'
                            }}
                        >
                            <option value="contract">Contract</option>
                            <option value="client">Client</option>
                            <option value="site">Operational Site</option>
                        </select>
                    </div>
                )}
            </div>

            {/* Main Section Navigation Tabs */}
            <div
                style={{
                    display: 'flex',
                    gap: '0.5rem',
                    borderBottom: '2px solid var(--color-border)',
                    marginBottom: '1.2rem',
                    overflowX: 'auto',
                    paddingBottom: '0.2rem'
                }}
            >
                {[
                    { id: 'executive', label: 'Executive Dashboard', icon: 'bxs-dashboard' },
                    { id: 'profitability', label: 'Clients & Profitability', icon: 'bx-line-chart' },
                    { id: 'workforce', label: 'Workforce Reports', icon: 'bx-group' },
                    { id: 'operations', label: 'Operations Reports', icon: 'bx-shield-quarter' },
                    { id: 'inventory', label: 'Inventory & Stores', icon: 'bx-box' },
                    { id: 'purchasing', label: 'Purchasing & Match', icon: 'bx-cart' },
                    { id: 'finance', label: 'Finance & Statements', icon: 'bx-dollar-circle' },
                    { id: 'compliance', label: 'Compliance & Exceptions', icon: 'bx-error-circle' },
                    { id: 'trends', label: 'Period Trends', icon: 'bx-trending-up' }
                ].map((tab) => {
                    const isActive = activeSection === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveSection(tab.id as PrimarySection)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.6rem 1rem',
                                background: 'none',
                                border: 'none',
                                borderBottom: isActive ? '3px solid var(--color-primary)' : '3px solid transparent',
                                color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                                fontWeight: isActive ? 700 : 500,
                                cursor: 'pointer',
                                fontSize: '0.9rem',
                                whiteSpace: 'nowrap',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <i className={`bx ${tab.icon}`} style={{ fontSize: '1.1rem' }}></i>
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Sub-report selector (if available for section) */}
            {subReportsBySection[activeSection] && (
                <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', marginBottom: '1.5rem', paddingBottom: '0.4rem' }}>
                    {subReportsBySection[activeSection].map((sub) => {
                        const isSubActive = subReportType === sub.id;
                        return (
                            <button
                                key={sub.id}
                                onClick={() => setSubReportType(sub.id)}
                                style={{
                                    padding: '0.4rem 0.85rem',
                                    borderRadius: '20px',
                                    fontSize: '0.8rem',
                                    fontWeight: isSubActive ? 600 : 400,
                                    background: isSubActive ? 'var(--color-primary)' : 'var(--color-card)',
                                    color: isSubActive ? '#fff' : 'var(--color-text)',
                                    border: isSubActive ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap'
                                }}
                            >
                                {sub.label}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Error banner */}
            {error && (
                <div
                    style={{
                        padding: '1rem',
                        marginBottom: '1.5rem',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid #ef4444',
                        borderRadius: '6px',
                        color: '#ef4444',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                    }}
                >
                    <i className="bx bx-error-circle" style={{ fontSize: '1.3rem' }}></i>
                    <span>{error}</span>
                </div>
            )}

            {/* Loading Indicator */}
            {loading && (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                    <i className="bx bx-loader-alt bx-spin" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}></i>
                    <div>Consolidating authoritative metrics from source engines...</div>
                </div>
            )}

            {/* 1. EXECUTIVE DASHBOARD TAB */}
            {!loading && activeSection === 'executive' && executiveData && (
                <div>
                    {/* Commercial Row */}
                    <div style={{ marginBottom: '1.5rem' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.8rem', color: 'var(--color-primary)' }}>
                            <i className="bx bx-briefcase" style={{ marginRight: '0.4rem' }}></i> Commercial & Contracts
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                            <MetricCard title="Active Clients" value={executiveData.commercial?.active_clients} icon="bx-buildings" color="#3b82f6" />
                            <MetricCard title="Active Contracts" value={executiveData.commercial?.active_contracts} icon="bx-file" color="#10b981" />
                            <MetricCard
                                title="Expiring Soon (30d)"
                                value={executiveData.commercial?.expiring_contracts_count}
                                icon="bx-time"
                                color={executiveData.commercial?.expiring_contracts_count > 0 ? '#f59e0b' : '#6b7280'}
                            />
                            <MetricCard
                                title="Recent Billing"
                                value={fmtCurr(executiveData.commercial?.recent_invoiced_billing)}
                                icon="bx-receipt"
                                color="#8b5cf6"
                            />
                        </div>
                    </div>

                    {/* Workforce Row */}
                    <div style={{ marginBottom: '1.5rem' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.8rem', color: 'var(--color-primary)' }}>
                            <i className="bx bx-group" style={{ marginRight: '0.4rem' }}></i> Workforce Strength & Deployment
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                            <MetricCard title="Total Workforce" value={executiveData.workforce?.total_workforce} icon="bx-user" />
                            <MetricCard title="Direct Field Guards" value={executiveData.workforce?.direct_count} icon="bx-shield" color="#059669" />
                            <MetricCard title="Indirect / HQ Staff" value={executiveData.workforce?.indirect_count} icon="bx-desktop" color="#64748b" />
                            <MetricCard title="Currently Deployed" value={executiveData.workforce?.deployed_count} icon="bx-map-pin" color="#2563eb" />
                            <MetricCard
                                title="Vacant Positions"
                                value={executiveData.workforce?.vacant_positions}
                                icon="bx-user-x"
                                color={executiveData.workforce?.vacant_positions > 0 ? '#ef4444' : '#10b981'}
                            />
                            <MetricCard title="Attendance %" value={`${executiveData.workforce?.attendance_pct}%`} icon="bx-check-circle" color="#059669" />
                            <MetricCard
                                title="JUMP Count"
                                value={executiveData.workforce?.jump_count}
                                icon="bx-error"
                                color={executiveData.workforce?.jump_count > 0 ? '#ef4444' : '#6b7280'}
                            />
                        </div>
                    </div>

                    {/* Operations Row */}
                    <div style={{ marginBottom: '1.5rem' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.8rem', color: 'var(--color-primary)' }}>
                            <i className="bx bx-radar" style={{ marginRight: '0.4rem' }}></i> Operational Delivery
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                            <MetricCard title="Roster Coverage %" value={`${executiveData.operations?.roster_coverage_pct}%`} icon="bx-pie-chart" color="#2563eb" />
                            <MetricCard
                                title="Uncovered Duties"
                                value={executiveData.operations?.uncovered_duties}
                                icon="bx-calendar-x"
                                color={executiveData.operations?.uncovered_duties > 0 ? '#ef4444' : '#10b981'}
                            />
                            <MetricCard title="Replacement Duties" value={executiveData.operations?.replacement_duties} icon="bx-transfer" color="#f59e0b" />
                            <MetricCard title="Incidents Reported" value={executiveData.operations?.total_incidents} icon="bx-info-circle" />
                            <MetricCard
                                title="Critical Incidents"
                                value={executiveData.operations?.critical_incidents}
                                icon="bx-bell"
                                color={executiveData.operations?.critical_incidents > 0 ? '#dc2626' : '#10b981'}
                            />
                            <MetricCard title="Patrol Completion" value={`${executiveData.operations?.patrol_completion_pct}%`} icon="bx-walk" color="#059669" />
                            <MetricCard title="Avg Inspection Score" value={`${executiveData.operations?.inspection_performance_avg}/100`} icon="bx-star" color="#8b5cf6" />
                        </div>
                    </div>

                    {/* Inventory & Finance Row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                        {/* Inventory Column */}
                        <div>
                            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.8rem', color: 'var(--color-primary)' }}>
                                <i className="bx bx-box" style={{ marginRight: '0.4rem' }}></i> Store & Equipment
                            </h3>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <MetricCard title="Issued Equipment Total" value={executiveData.inventory?.issued_equipment_count} icon="bx-devices" />
                                <MetricCard title="Guard Custody Qty" value={executiveData.inventory?.employee_custody_count} icon="bx-user-check" />
                                <MetricCard title="Site Custody Qty" value={executiveData.inventory?.site_custody_count} icon="bx-building" />
                                <MetricCard
                                    title="Controlled Assets"
                                    value={executiveData.inventory?.controlled_assets_count}
                                    icon="bx-lock-alt"
                                    color="#d97706"
                                />
                                <MetricCard
                                    title="Low Stock Items"
                                    value={executiveData.inventory?.low_stock_items_count}
                                    icon="bx-low-vision"
                                    color={executiveData.inventory?.low_stock_items_count > 0 ? '#ef4444' : '#10b981'}
                                />
                                <MetricCard
                                    title="Lost / Damaged"
                                    value={executiveData.inventory?.lost_damaged_count}
                                    icon="bx-trash"
                                    color={executiveData.inventory?.lost_damaged_count > 0 ? '#dc2626' : '#6b7280'}
                                />
                            </div>
                        </div>

                        {/* Finance Column */}
                        <div>
                            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.8rem', color: 'var(--color-primary)' }}>
                                <i className="bx bx-dollar" style={{ marginRight: '0.4rem' }}></i> Financial Position (S-4J / GL Derived)
                            </h3>
                            {executiveData.finance?.is_financial_masked ? (
                                <div
                                    style={{
                                        padding: '2rem',
                                        background: 'var(--color-card)',
                                        border: '1px dashed var(--color-border)',
                                        borderRadius: '8px',
                                        textAlign: 'center',
                                        color: 'var(--color-text-secondary)'
                                    }}
                                >
                                    <i className="bx bx-lock-alt" style={{ fontSize: '2.5rem', marginBottom: '0.5rem', color: '#94a3b8' }}></i>
                                    <div style={{ fontWeight: 600 }}>Confidential Financial Values Masked</div>
                                    <div style={{ fontSize: '0.85rem', marginTop: '0.3rem' }}>
                                        Your role does not possess <code>finance.read</code> permission.
                                    </div>
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <MetricCard title="Authoritative Revenue" value={fmtCurr(executiveData.finance?.revenue)} icon="bx-trending-up" color="#059669" />
                                    <MetricCard title="Direct Payroll Cost" value={fmtCurr(executiveData.finance?.payroll_cost)} icon="bx-wallet" color="#dc2626" />
                                    <MetricCard
                                        title="Gross Profit Margin"
                                        value={`${executiveData.finance?.gross_margin_pct ?? 0}%`}
                                        icon="bx-pie-chart-alt-2"
                                        color="#2563eb"
                                    />
                                    <MetricCard title="Gross Profit" value={fmtCurr(executiveData.finance?.gross_profit)} icon="bx-check-double" color="#10b981" />
                                    <MetricCard title="AR Outstanding" value={fmtCurr(executiveData.finance?.ar_outstanding)} icon="bx-credit-card" color="#d97706" />
                                    <MetricCard title="AP Outstanding" value={fmtCurr(executiveData.finance?.ap_outstanding)} icon="bx-money" color="#64748b" />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* 2. PROFITABILITY TAB */}
            {!loading && activeSection === 'profitability' && profitabilityData && (
                <div>
                    <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>
                            GL-Derived Profitability Breakdown ({profitabilityDimension.toUpperCase()})
                        </h3>
                        <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                            Source: S-4J Profitability Service
                        </span>
                    </div>

                    {profitabilityData.is_financial_masked ? (
                        <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--color-card)', borderRadius: '8px' }}>
                            <i className="bx bx-lock-alt" style={{ fontSize: '2rem', color: '#94a3b8' }}></i>
                            <div>Confidential financial data is masked for your profile.</div>
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto', background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: '8px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ background: 'var(--color-surface-hover)', borderBottom: '1px solid var(--color-border)' }}>
                                        <th style={{ padding: '0.75rem 1rem' }}>Entity</th>
                                        <th style={{ padding: '0.75rem 1rem' }}>Code</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Revenue</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Workforce Cost</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Statutory Cost</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Equipment Cost</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Allocated Cost</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Net Profit</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Margin %</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(profitabilityData.records || []).map((row: any, idx: number) => {
                                        const p = row.profitability || {};
                                        const isNeg = (p.net_profit || 0) < 0;
                                        return (
                                            <tr
                                                key={idx}
                                                onClick={() => handleOpenDrillDown(profitabilityDimension, row.id)}
                                                style={{
                                                    borderBottom: '1px solid var(--color-border)',
                                                    cursor: 'pointer',
                                                    transition: 'background 0.1s'
                                                }}
                                                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
                                                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                            >
                                                <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{row.name}</td>
                                                <td style={{ padding: '0.75rem 1rem', color: 'var(--color-text-secondary)' }}>{row.code}</td>
                                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: '#10b981' }}>{fmtCurr(p.revenue)}</td>
                                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: '#ef4444' }}>{fmtCurr(p.workforce_cost)}</td>
                                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{fmtCurr(p.employer_statutory_cost)}</td>
                                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{fmtCurr(p.inventory_cost)}</td>
                                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{fmtCurr(p.allocated_cost)}</td>
                                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, color: isNeg ? '#ef4444' : '#10b981' }}>
                                                    {fmtCurr(p.net_profit)}
                                                </td>
                                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, color: isNeg ? '#ef4444' : '#10b981' }}>
                                                    {p.margin_pct ?? 0}%
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* 3. SUB-REPORT GENERIC TABLE (Workforce, Operations, Inventory, Purchasing, Finance) */}
            {!loading &&
                ['workforce', 'operations', 'inventory', 'purchasing', 'finance'].includes(activeSection) &&
                reportResult && (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                            <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                                Total Records: <span style={{ color: 'var(--color-primary)' }}>{reportResult.total_count ?? (reportResult.records?.length || 0)}</span>
                            </div>
                            {reportResult.summary && (
                                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                                    {Object.entries(reportResult.summary).map(([k, v]: any) => (
                                        <span key={k}>
                                            <strong>{k.replace(/_/g, ' ')}:</strong> {typeof v === 'number' && v > 1000 ? v.toLocaleString() : v}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div style={{ overflowX: 'auto', background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: '8px' }}>
                            {(!reportResult.records || reportResult.records.length === 0) ? (
                                <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                                    <i className="bx bx-folder-open" style={{ fontSize: '2.5rem', marginBottom: '0.5rem', color: '#94a3b8' }}></i>
                                    <div>No records match the selected date period or filter criteria.</div>
                                </div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                                    <thead>
                                        <tr style={{ background: 'var(--color-surface-hover)', borderBottom: '1px solid var(--color-border)' }}>
                                            {Object.keys(reportResult.records[0])
                                                .filter((col) => !['id', 'entity_id'].includes(col))
                                                .map((col) => (
                                                    <th key={col} style={{ padding: '0.75rem 1rem', textTransform: 'capitalize' }}>
                                                        {col.replace(/_/g, ' ')}
                                                    </th>
                                                ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {reportResult.records.map((rec: any, idx: number) => (
                                            <tr
                                                key={idx}
                                                onClick={() => {
                                                    if (rec.id) {
                                                        const eType = activeSection === 'workforce' ? 'employee' : activeSection === 'operations' ? 'site' : 'site';
                                                        handleOpenDrillDown(eType, rec.id);
                                                    }
                                                }}
                                                style={{
                                                    borderBottom: '1px solid var(--color-border)',
                                                    cursor: rec.id ? 'pointer' : 'default'
                                                }}
                                                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
                                                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                            >
                                                {Object.entries(rec)
                                                    .filter(([col]) => !['id', 'entity_id'].includes(col))
                                                    .map(([col, val]: any, cIdx) => (
                                                        <td key={cIdx} style={{ padding: '0.75rem 1rem' }}>
                                                            {typeof val === 'number' && col.includes('cost') || col.includes('price') || col.includes('earnings') || col.includes('payable') || col.includes('amount') || col.includes('balance')
                                                                ? fmtCurr(val)
                                                                : typeof val === 'boolean'
                                                                ? val ? 'Yes' : 'No'
                                                                : val === null || val === undefined
                                                                ? '—'
                                                                : String(val)}
                                                        </td>
                                                    ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                )}

            {/* 4. COMPLIANCE & EXCEPTION REPORTS TAB */}
            {!loading && activeSection === 'compliance' && complianceData && (
                <div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.2rem' }}>
                        <ComplianceBlock
                            title="Expiring Documents / Certifications"
                            count={complianceData.summary?.expiring_documents_count}
                            icon="bx-id-card"
                            color="#f59e0b"
                            items={complianceData.exceptions?.expiring_documents}
                            displayKey="employee_name"
                            subKey="type"
                        />
                        <ComplianceBlock
                            title="Unresolved JUMP Absentees"
                            count={complianceData.summary?.unresolved_jumps_count}
                            icon="bx-user-x"
                            color="#ef4444"
                            items={complianceData.exceptions?.unresolved_jumps}
                            displayKey="employee_name"
                            subKey="jump_date"
                        />
                        <ComplianceBlock
                            title="Critical Incidents Under Action"
                            count={complianceData.summary?.critical_incidents_count}
                            icon="bx-error"
                            color="#dc2626"
                            items={complianceData.exceptions?.critical_incidents}
                            displayKey="title"
                            subKey="site_name"
                        />
                        <ComplianceBlock
                            title="Open Operations Escalations"
                            count={complianceData.summary?.open_escalations_count}
                            icon="bx-bell-plus"
                            color="#b91c1c"
                            items={complianceData.exceptions?.open_escalations}
                            displayKey="title"
                            subKey="priority"
                        />
                        <ComplianceBlock
                            title="Failed Quality Inspections"
                            count={complianceData.summary?.failed_inspections_count}
                            icon="bx-x-circle"
                            color="#ef4444"
                            items={complianceData.exceptions?.failed_inspections}
                            displayKey="site_name"
                            subKey="score"
                        />
                        <ComplianceBlock
                            title="Overdue Equipment Returns"
                            count={complianceData.summary?.overdue_returns_count}
                            icon="bx-package"
                            color="#f59e0b"
                            items={complianceData.exceptions?.overdue_returns}
                            displayKey="item_name"
                            subKey="employee_name"
                        />
                    </div>
                </div>
            )}

            {/* 5. PERIOD TRENDS TAB */}
            {!loading && activeSection === 'trends' && trendsData && (
                <div>
                    <div style={{ marginBottom: '1.5rem', background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '1.2rem' }}>
                        <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: 600 }}>
                            Monthly Workforce Strength & Absenteeism Trend
                        </h3>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ background: 'var(--color-surface-hover)', borderBottom: '1px solid var(--color-border)' }}>
                                        <th style={{ padding: '0.6rem 1rem' }}>Month</th>
                                        <th style={{ padding: '0.6rem 1rem', textAlign: 'right' }}>Total Workforce</th>
                                        <th style={{ padding: '0.6rem 1rem', textAlign: 'right' }}>Direct Field</th>
                                        <th style={{ padding: '0.6rem 1rem', textAlign: 'right' }}>Indirect Staff</th>
                                        <th style={{ padding: '0.6rem 1rem', textAlign: 'right' }}>Absenteeism %</th>
                                        <th style={{ padding: '0.6rem 1rem', textAlign: 'right' }}>Incidents</th>
                                        <th style={{ padding: '0.6rem 1rem', textAlign: 'right' }}>Patrol Completion %</th>
                                        <th style={{ padding: '0.6rem 1rem', textAlign: 'right' }}>Payroll Cost</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(trendsData.trends || []).map((t: any, idx: number) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                            <td style={{ padding: '0.6rem 1rem', fontWeight: 600 }}>{t.month}</td>
                                            <td style={{ padding: '0.6rem 1rem', textAlign: 'right' }}>{t.workforce_strength?.total ?? 0}</td>
                                            <td style={{ padding: '0.6rem 1rem', textAlign: 'right' }}>{t.workforce_strength?.direct ?? 0}</td>
                                            <td style={{ padding: '0.6rem 1rem', textAlign: 'right' }}>{t.workforce_strength?.indirect ?? 0}</td>
                                            <td style={{ padding: '0.6rem 1rem', textAlign: 'right', color: t.absenteeism_pct > 5 ? '#ef4444' : 'inherit' }}>
                                                {t.absenteeism_pct}%
                                            </td>
                                            <td style={{ padding: '0.6rem 1rem', textAlign: 'right' }}>{t.incidents_count}</td>
                                            <td style={{ padding: '0.6rem 1rem', textAlign: 'right', color: '#10b981' }}>{t.patrol_completion_pct}%</td>
                                            <td style={{ padding: '0.6rem 1rem', textAlign: 'right' }}>{fmtCurr(t.payroll_cost)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Drill-down Modal */}
            {drillDownEntity && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0,0,0,0.6)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 9999
                    }}
                >
                    <div
                        style={{
                            background: 'var(--color-card)',
                            border: '1px solid var(--color-border)',
                            borderRadius: '8px',
                            width: '90%',
                            maxWidth: '650px',
                            maxHeight: '85vh',
                            overflowY: 'auto',
                            padding: '1.5rem',
                            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.6rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, textTransform: 'capitalize' }}>
                                {drillDownEntity.type} Entity Drill-down
                            </h3>
                            <button
                                onClick={() => setDrillDownEntity(null)}
                                style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
                            >
                                &times;
                            </button>
                        </div>

                        {drillDownLoading ? (
                            <div style={{ padding: '2rem', textAlign: 'center' }}>
                                <i className="bx bx-loader-alt bx-spin" style={{ fontSize: '1.8rem' }}></i>
                                <div>Loading record details...</div>
                            </div>
                        ) : drillDownData ? (
                            <div style={{ fontSize: '0.85rem' }}>
                                {Object.entries(drillDownData).map(([k, v]: any) => {
                                    if (typeof v === 'object' && v !== null) {
                                        return (
                                            <div key={k} style={{ marginTop: '0.8rem' }}>
                                                <strong style={{ textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}:</strong>
                                                <pre style={{ background: 'var(--color-surface)', padding: '0.5rem', borderRadius: '4px', overflowX: 'auto', fontSize: '0.8rem' }}>
                                                    {JSON.stringify(v, null, 2)}
                                                </pre>
                                            </div>
                                        );
                                    }
                                    return (
                                        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px dashed var(--color-border)' }}>
                                            <span style={{ color: 'var(--color-text-secondary)', textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</span>
                                            <span style={{ fontWeight: 600 }}>{String(v)}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div>No details found.</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// Reusable Metric Card
const MetricCard: React.FC<{ title: string; value: any; icon: string; color?: string }> = ({ title, value, icon, color }) => (
    <div
        style={{
            padding: '1rem',
            background: 'var(--color-card)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
        }}
    >
        <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.3rem', fontWeight: 500 }}>
                {title}
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: color || 'var(--color-text)' }}>
                {value ?? '—'}
            </div>
        </div>
        <div
            style={{
                width: '40px',
                height: '40px',
                borderRadius: '8px',
                background: color ? `${color}15` : 'var(--color-surface-hover)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: color || 'var(--color-primary)'
            }}
        >
            <i className={`bx ${icon}`} style={{ fontSize: '1.3rem' }}></i>
        </div>
    </div>
);

// Reusable Compliance Item Block
const ComplianceBlock: React.FC<{
    title: string;
    count: number;
    icon: string;
    color: string;
    items?: any[];
    displayKey: string;
    subKey?: string;
}> = ({ title, count, icon, color, items, displayKey, subKey }) => (
    <div
        style={{
            background: 'var(--color-card)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: '1rem'
        }}
    >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, fontSize: '0.9rem' }}>
                <i className={`bx ${icon}`} style={{ color, fontSize: '1.2rem' }}></i>
                {title}
            </div>
            <span
                style={{
                    background: count > 0 ? `${color}20` : 'var(--color-surface-hover)',
                    color: count > 0 ? color : 'var(--color-text-secondary)',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '12px',
                    fontSize: '0.8rem',
                    fontWeight: 700
                }}
            >
                {count ?? 0}
            </span>
        </div>

        {(!items || items.length === 0) ? (
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontStyle: 'italic', padding: '0.4rem 0' }}>
                No active exceptions in this category.
            </div>
        ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '180px', overflowY: 'auto' }}>
                {items.slice(0, 5).map((it, idx) => (
                    <div
                        key={idx}
                        style={{
                            padding: '0.4rem 0.6rem',
                            background: 'var(--color-surface)',
                            borderRadius: '4px',
                            fontSize: '0.8rem',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}
                    >
                        <span style={{ fontWeight: 500 }}>{it[displayKey] || 'Record'}</span>
                        {subKey && it[subKey] && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{it[subKey]}</span>
                        )}
                    </div>
                ))}
            </div>
        )}
    </div>
);
