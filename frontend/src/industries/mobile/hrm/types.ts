export type MobileDepartmentType = 'HARDWARE' | 'SOFTWARE' | 'PANEL_GLASS' | 'SALES' | 'MANAGEMENT';

export interface Technician {
    id: string;
    employee: string;
    employee_name: string;
    employee_code: string;
    department_type: MobileDepartmentType;
    department_display: string;
    shift_time: string;
    late_grace_minutes: number;
    half_day_cutoff_minutes: number;
    allowed_half_days: number;
    allowed_medical_half_days: number;
    ot_hourly_rate: number;
    basic_salary: number;
    phone_1_model: string;
    phone_1_imei_1: string;
    phone_1_imei_2: string;
    phone_2_model: string;
    phone_2_imei_1: string;
    phone_2_imei_2: string;
    created_at?: string;
    updated_at?: string;
}

export interface AttendanceDayMeta {
    day: number;
    date: string;
    day_name: string;
    is_sunday: boolean;
}

export interface AttendanceTotals {
    present: number;
    late: number;
    half_day: number;
    holiday: number;
    overtime: number;
    allowed_half_day: number;
    allowed_holiday: number;
}

export interface AttendanceGridRow {
    employee_id: string;
    employee_code: string;
    employee_name: string;
    department: string;
    department_code: string;
    shift_time: string;
    ot_rate: number;
    days: Record<string, string>;
    totals: AttendanceTotals;
}

export interface AttendanceGridResponse {
    year: number;
    month: number;
    calendar: AttendanceDayMeta[];
    rows: AttendanceGridRow[];
}

export interface PayrollRecord {
    payroll_id?: string | null;
    employee_id: string;
    employee_code: string;
    employee_name: string;
    department: string;
    designation: string;
    status: 'DRAFT' | 'APPROVED' | 'PAID';
    basic_salary: number;
    bonus_time: number;
    bonus_zero_holiday: number;
    overtime_hours: number;
    overtime_rate: number;
    overtime_pay: number;
    pay_and_allowances: number;
    late_count: number;
    late_deduction: number;
    half_day_count: number;
    half_day_deduction: number;
    holiday_count: number;
    holiday_deduction: number;
    penalty: number;
    total_attendance_deduction: number;
    loan_principal: number;
    loan_deduction: number;
    loan_balance: number;
    damaged_parts: number;
    bill_deduction: number;
    total_other_deductions: number;
    gross_total: number;
}
