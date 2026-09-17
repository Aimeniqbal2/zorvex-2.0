export interface ERPModule {
    code: string;
    name: string;
    icon: string;
    route: string;
    category?: string;
    minRole: string; // from legacy: super_admin, admin, manager, cashier, staff, etc.
    engine?: string; // Optional mapping to underlying universal engine (e.g. for industry capabilities)
}

export const MODULE_REGISTRY: ERPModule[] = [
    { code: 'dashboard', name: 'Dashboard', icon: 'bxs-dashboard', route: '/', minRole: 'staff' },
    { code: 'pos', name: 'POS Sales', icon: 'bx-credit-card', route: '/pos', minRole: 'cashier', category: 'Sales' },
    { code: 'services', name: 'Service Orders', icon: 'bx-wrench', route: '/services', minRole: 'cashier', category: 'Operations' },
    { code: 'sales', name: 'Transactions', icon: 'bx-receipt', route: '/transactions', minRole: 'cashier', category: 'Sales' },
    { code: 'analytics', name: 'Analytics', icon: 'bx-trending-up', route: '/analytics', minRole: 'manager', category: 'Reporting' },
    { code: 'inventory', name: 'Inventory', icon: 'bx-box', route: '/inventory', minRole: 'manager', category: 'Operations' },
    { code: 'purchasing', name: 'Purchasing', icon: 'bx-buildings', route: '/purchasing', minRole: 'manager', category: 'Operations' },
    { code: 'finance', name: 'Accounting', icon: 'bx-calculator', route: '/accounting', minRole: 'manager', category: 'Finance' },
    { code: 'hr', name: 'Team', icon: 'bx-group', route: '/team', minRole: 'admin', category: 'Human Resources' },
    { code: 'crm', name: 'CRM', icon: 'bx-user-circle', route: '/crm', minRole: 'manager', category: 'Sales' },
    { code: 'security_ops', name: 'Security Operations', icon: 'bx-shield', route: '/security-ops', minRole: 'manager', category: 'Operations' },
    { code: 'reports', name: 'Reports', icon: 'bx-pie-chart-alt-2', route: '/reports', minRole: 'manager', category: 'Reporting' },
    { code: 'settings', name: 'Settings', icon: 'bx-cog', route: '/settings', minRole: 'admin', category: 'Administration' },
    { code: 'platform', name: 'Platform Admin', icon: 'bx-server', route: '/platform', minRole: 'super_admin', category: 'Administration' },
];

export const ROLE_LEVELS: Record<string, number> = {
    super_admin: 5, 
    admin: 4, 
    manager: 3,
    hardware_technician: 2, 
    software_technician: 2,
    technician: 2,
    cashier: 1, 
    staff: 0
};
