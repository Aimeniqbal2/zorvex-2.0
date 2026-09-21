import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../auth/authStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useAppStore } from '../../stores/appStore';
import { MODULE_REGISTRY } from '../../config/modules';
import { SECURITY_NAVIGATION } from '../../industries/security/navigation';
import { AppLauncher } from './AppLauncher';
import { apiClient, API_HOST_URL } from '../../api/client';

// ─── Greeting Banner ────────────────────────────────────────────────
const GreetingBanner: React.FC = () => {
    const { user } = useAuthStore();
    const [time, setTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const hour = time.getHours();
    const greeting = (hour >= 5 && hour < 12) ? 'Good Morning' : (hour >= 12 && hour < 17) ? 'Good Afternoon' : (hour >= 17 && hour < 21) ? 'Good Evening' : 'Good Night';

    const dateStr = time.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const companyName = user?.company_name || 'Zorvex';
    const companyLogo = user?.company_logo 
        ? (user.company_logo.startsWith('http') ? user.company_logo : `${API_HOST_URL}${user.company_logo}`) 
        : null;

    return (
        <div className="dd-greeting-banner">
            <div className="dd-greeting-left">
                {companyLogo && (
                    <img src={companyLogo} alt={companyName} className="dd-greeting-company-logo" />
                )}
                <div>
                    <h2 className="dd-greeting-title">{greeting}, {companyName}!</h2>
                    <p className="dd-greeting-sub">Welcome back to your command center.</p>
                </div>
            </div>
            <div className="dd-greeting-right">
                <div className="dd-clock">{timeStr}</div>
                <div className="dd-date">{dateStr}</div>
            </div>
        </div>
    );
};

// ─── KPI Card ────────────────────────────────────────────────────────
interface KpiCardProps {
    icon: string;
    label: string;
    value: string | number;
    sub: string;
    color: string;
    trend?: 'up' | 'down' | 'neutral';
}

const KpiCard: React.FC<KpiCardProps> = ({ icon, label, value, sub, color, trend }) => (
    <div className="dd-kpi-card">
        <div className="dd-kpi-icon" style={{ background: color }}>
            <i className={`bx ${icon}`}></i>
        </div>
        <div className="dd-kpi-body">
            <div className="dd-kpi-value">{value}</div>
            <div className="dd-kpi-label">{label}</div>
            <div className="dd-kpi-sub">
                {trend === 'up' && <i className="bx bx-trending-up" style={{ color: '#22c55e' }}></i>}
                {trend === 'down' && <i className="bx bx-trending-down" style={{ color: '#ef4444' }}></i>}
                <span>{sub}</span>
            </div>
        </div>
    </div>
);

// ─── Quick Action Button ─────────────────────────────────────────────
interface QuickActionProps {
    icon: string;
    label: string;
    color: string;
    onClick: () => void;
}

const QuickAction: React.FC<QuickActionProps> = ({ icon, label, color, onClick }) => (
    <button className="dd-quick-action" onClick={onClick}>
        <div className="dd-qa-icon" style={{ background: color }}>
            <i className={`bx ${icon}`}></i>
        </div>
        <span>{label}</span>
    </button>
);

interface DashboardStats {
    company_name: string;
    active_employees: number;
    active_deployments: number;
    active_contracts: number;
    crm_clients: number;
    inventory_items: number;
    equipment_in_custody: number;
    total_invoiced: number;
    pending_pos: number;
    currency: string;
}

export const DesktopDashboard: React.FC = () => {
    const { openTab } = useWorkspaceStore();
    const { user } = useAuthStore();
    const { industry, company } = useAppStore();

    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [loadingStats, setLoadingStats] = useState(true);

    const isSecurityIndustry = industry?.code === 'security' || user?.business_type === 'security' || company?.business_type === 'security';

    useEffect(() => {
        let isMounted = true;
        const fetchStats = async () => {
            try {
                const res = await apiClient.get('/api/platform/dashboard-stats/');
                if (isMounted && res.data) {
                    setStats(res.data);
                }
            } catch (err) {
                console.error('Failed to load dashboard statistics', err);
            } finally {
                if (isMounted) {
                    setLoadingStats(false);
                }
            }
        };
        fetchStats();
        return () => {
            isMounted = false;
        };
    }, []);

    const openModule = (code: string) => {
        const registryToUse = isSecurityIndustry ? SECURITY_NAVIGATION : MODULE_REGISTRY;
        const codeMap: Record<string, string> = {
            'hr': isSecurityIndustry ? 'guards_staff' : 'hr',
            'guards_staff': 'guards_staff',
            'purchasing': isSecurityIndustry ? 'vendors_purchasing' : 'purchasing',
            'vendors_purchasing': 'vendors_purchasing',
            'security_ops': isSecurityIndustry ? 'operations' : 'security_ops',
            'operations': 'operations',
            'finance': 'finance',
            'inventory': isSecurityIndustry ? 'store_equipment' : 'inventory',
            'store_equipment': 'store_equipment',
            'crm': isSecurityIndustry ? 'clients_contracts' : 'crm',
            'clients_contracts': 'clients_contracts',
            'reports': 'reports',
            'settings': 'settings'
        };
        const targetCode = codeMap[code] || code;
        const mod = registryToUse.find(m => m.code === targetCode) || MODULE_REGISTRY.find(m => m.code === targetCode);
        if (mod) openTab(mod);
    };

    return (
        <div className="dd-container">
            {/* Top Greeting Banner */}
            <div style={{ marginBottom: '80px' }}>
                <GreetingBanner />
            </div>

            {/* Applications Grid */}
            <div className="dd-section" style={{ marginBottom: '130px' }}>
                <div className="dd-section-title">
                    <i className="bx bx-grid-alt"></i> Applications
                </div>
                <AppLauncher />
            </div>

            {/* Live Operational Metrics (Dynamic KPI Cards) */}
            <div className="dd-section" style={{ marginBottom: '32px' }}>
                <div className="dd-section-title">
                    <i className="bx bx-pulse"></i> Live Operational Metrics
                </div>
                <div className="dd-kpi-row">
                    <KpiCard
                        icon="bx-group"
                        label={isSecurityIndustry ? "Active Workforce" : "Active Employees"}
                        value={loadingStats ? '...' : (stats?.active_employees ?? 0)}
                        sub={isSecurityIndustry ? "Guards & Operations Staff" : "Total Active Team"}
                        color="#092453"
                        trend="up"
                    />
                    <KpiCard
                        icon="bx-shield-quarter"
                        label="Active Deployments"
                        value={loadingStats ? '...' : (stats?.active_deployments ?? 0)}
                        sub="Live Guarded Client Posts"
                        color="#2563eb"
                        trend="neutral"
                    />
                    <KpiCard
                        icon="bx-briefcase"
                        label="Client Contracts"
                        value={loadingStats ? '...' : (stats?.active_contracts ?? 0)}
                        sub={loadingStats ? '...' : `${stats?.crm_clients ?? 0} CRM Client Accounts`}
                        color="#7c3aed"
                        trend="neutral"
                    />
                    <KpiCard
                        icon="bx-box"
                        label="Equipment in Custody"
                        value={loadingStats ? '...' : (stats?.equipment_in_custody ?? 0)}
                        sub={loadingStats ? '...' : `${stats?.inventory_items ?? 0} Tracked Items in Store`}
                        color="#059669"
                        trend="neutral"
                    />
                </div>
            </div>

            {/* Quick Actions */}
            <div className="dd-section">
                <div className="dd-section-title">
                    <i className="bx bx-zap"></i> Quick Actions
                </div>
                <div className="dd-quick-actions-row">
                    <QuickAction
                        icon="bx-user-plus"
                        label={isSecurityIndustry ? "Guards & Staff" : "Human Resources"}
                        color="#092453"
                        onClick={() => openModule('hr')}
                    />
                    <QuickAction
                        icon="bx-shield-plus"
                        label="New Deployment"
                        color="#2563eb"
                        onClick={() => openModule('operations')}
                    />
                    <QuickAction
                        icon="bx-box"
                        label="Store & Equipment"
                        color="#059669"
                        onClick={() => openModule('store_equipment')}
                    />
                    <QuickAction
                        icon="bx-calculator"
                        label="Billing & Finance"
                        color="#10b981"
                        onClick={() => openModule('finance')}
                    />
                    <QuickAction
                        icon="bx-user-check"
                        label="Clients & Contracts"
                        color="#7c3aed"
                        onClick={() => openModule('clients_contracts')}
                    />
                    <QuickAction
                        icon="bx-pie-chart-alt-2"
                        label="Reports & BI"
                        color="#ec4899"
                        onClick={() => openModule('reports')}
                    />
                </div>
            </div>

            {/* Bottom spacer to guarantee comfortable scrolling clearance */}
            <div style={{ height: '32px', flexShrink: 0 }} aria-hidden="true" />
        </div>
    );
};
