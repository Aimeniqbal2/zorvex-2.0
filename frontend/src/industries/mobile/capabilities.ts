export interface IndustryCapability {
    code: string;
    label: string;
    engine: string;
}

export const MOBILE_CAPABILITIES: IndustryCapability[] = [
    { code: 'technicians_staff', label: 'Technicians & Staff', engine: 'hr' },
    { code: 'mobile_attendance', label: 'Attendance Sheet', engine: 'hr' },
    { code: 'mobile_payroll', label: 'Payroll & Compensation', engine: 'hr' },
    { code: 'mobile_payslips', label: 'Salary Slips', engine: 'hr' },
    { code: 'repair_services', label: 'Service & Work Orders', engine: 'services' },
    { code: 'pos_sales', label: 'POS & Accessories Sales', engine: 'pos' },
    { code: 'parts_inventory', label: 'Spare Parts & Mobile Inventory', engine: 'inventory' },
    { code: 'finance', label: 'Accounting & Expenses', engine: 'finance' },
];
