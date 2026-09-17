export interface IndustryCapability {
    code: string;
    label: string;
    engine: string;
}

export const SECURITY_CAPABILITIES: IndustryCapability[] = [
    { code: 'clients_contracts', label: 'Clients & Contracts', engine: 'crm' },
    { code: 'guards_staff', label: 'Guards & Staff', engine: 'hr' },
    { code: 'finance', label: 'Finance', engine: 'finance' },
    { code: 'vendors_purchasing', label: 'Purchasing & Vendors', engine: 'purchasing' },
    { code: 'store_equipment', label: 'Store & Equipment', engine: 'inventory' },
    { code: 'operations', label: 'Operations', engine: 'security_ops' },
];
