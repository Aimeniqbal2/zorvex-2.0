import type { ERPModule } from '../../config/modules';

export const MOBILE_NAVIGATION: ERPModule[] = [
    { code: 'dashboard', name: 'Dashboard', icon: 'bxs-dashboard', route: '/', minRole: 'staff', engine: 'core' },
    { code: 'services', name: 'Repair & Work Orders', icon: 'bx-wrench', route: '/services', minRole: 'cashier', category: 'Operations', engine: 'services' },
    { code: 'pos', name: 'POS Counter Sales', icon: 'bx-credit-card', route: '/pos', minRole: 'cashier', category: 'Sales', engine: 'pos' },
    { code: 'inventory', name: 'Spare Parts & Devices', icon: 'bx-box', route: '/inventory', minRole: 'manager', category: 'Operations', engine: 'inventory' },
    { code: 'technicians_staff', name: 'Technicians & Staff', icon: 'bx-group', route: '/team', minRole: 'admin', category: 'Human Resources', engine: 'hr' },
    { code: 'finance', name: 'Finance & Expenses', icon: 'bx-calculator', route: '/accounting', minRole: 'manager', category: 'Finance', engine: 'finance' },
    { code: 'reports', name: 'Reports', icon: 'bx-pie-chart-alt-2', route: '/reports', minRole: 'manager', category: 'Reporting', engine: 'reports' },
    { code: 'settings', name: 'Settings', icon: 'bx-cog', route: '/settings', minRole: 'admin', category: 'Administration', engine: 'core' },
];
