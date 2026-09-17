import type { ERPModule } from '../../config/modules';

// Override or define Security-specific navigation items
// These use the capability codes as the internal reference, but map to routes
export const SECURITY_NAVIGATION: ERPModule[] = [
    { code: 'dashboard', name: 'Dashboard', icon: 'bxs-dashboard', route: '/', minRole: 'staff', engine: 'core' },
    { code: 'clients_contracts', name: 'Clients & Contracts', icon: 'bx-user-circle', route: '/crm', minRole: 'manager', category: 'Sales', engine: 'crm' },
    { code: 'guards_staff', name: 'Guards & Staff', icon: 'bx-group', route: '/team', minRole: 'admin', category: 'Human Resources', engine: 'hr' },
    { code: 'finance', name: 'Finance', icon: 'bx-calculator', route: '/accounting', minRole: 'manager', category: 'Finance', engine: 'finance' },
    { code: 'vendors_purchasing', name: 'Purchasing & Vendors', icon: 'bx-buildings', route: '/purchasing', minRole: 'manager', category: 'Operations', engine: 'purchasing' },
    { code: 'store_equipment', name: 'Store & Equipment', icon: 'bx-box', route: '/inventory', minRole: 'manager', category: 'Operations', engine: 'inventory' },
    { code: 'operations', name: 'Operations', icon: 'bx-shield', route: '/security-ops', minRole: 'manager', category: 'Operations', engine: 'security_ops' },
    { code: 'reports', name: 'Reports', icon: 'bx-pie-chart-alt-2', route: '/reports', minRole: 'manager', category: 'Reporting', engine: 'reports' },
    { code: 'settings', name: 'Settings', icon: 'bx-cog', route: '/settings', minRole: 'admin', category: 'Administration', engine: 'core' },
];
