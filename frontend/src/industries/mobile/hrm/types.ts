export type MobileDepartmentType = 'HARDWARE' | 'SOFTWARE' | 'PANEL_GLASS' | 'SALES' | 'MANAGEMENT';

export interface EmployeeDocument {
    id?: string;
    name: string;
    doc_type?: string;
    url: string;
    file_name?: string;
    file_size?: number;
    uploaded_at?: string;
}

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
    cnic?: string;
    phone?: string;
    email?: string;
    emergency_contact_name?: string;
    emergency_contact_phone?: string;
    residential_address?: string;
    blood_group?: string;
    photo_url?: string;
    document_urls?: EmployeeDocument[];
    has_portal_access?: boolean;
    portal_username?: string;
    portal_role?: string;
    created_at?: string;
    updated_at?: string;
}

export interface CompanyPolicy {
    id: string;
    title: string;
    content: string;
    effective_date: string;
    version: string;
    is_active: boolean;
    created_by_name: string;
    created_at?: string;
    updated_at?: string;
}

export type OnboardingCandidateStatus = 'APPLIED' | 'INTERVIEWING' | 'OFFERED' | 'HIRED' | 'REJECTED';

export interface OnboardingCandidate {
    id: string;
    full_name: string;
    phone: string;
    email: string;
    address: string;
    position: string;
    department_type: MobileDepartmentType;
    department_display: string;
    offered_salary: number;
    allowance: string;
    backup_work: string;
    working_hours: string;
    notice_period: string;
    appointment_date: string | null;
    appointment_month: string;
    ceo_name: string;
    director_name: string;
    status: OnboardingCandidateStatus;
    status_display: string;
    first_week_checklist: Record<string, boolean>;
    notes: string;
    created_at?: string;
    updated_at?: string;
}

export type LeaveTypeChoice = 'CASUAL' | 'SICK' | 'HALF_DAY' | 'EMERGENCY';
export type LeaveRequestStatusChoice = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface EmployeeLeaveRequest {
    id: string;
    employee: string;
    employee_name: string;
    employee_code: string;
    department_display?: string;
    leave_type: LeaveTypeChoice;
    leave_type_display: string;
    request_date: string;
    advance_notice_days: number;
    reason: string;
    status: LeaveRequestStatusChoice;
    status_display: string;
    admin_notes: string;
    created_at?: string;
    updated_at?: string;
}

export type ExitClearanceStatusChoice = 'PENDING' | 'CLEARANCE' | 'COMPLETED' | 'WITHDRAWN';

export interface EmployeeExitRequest {
    id: string;
    employee: string;
    employee_name: string;
    employee_code: string;
    resignation_date: string;
    last_working_day: string;
    reason: string;
    handover_completed: boolean;
    devices_returned: boolean;
    clearance_status: ExitClearanceStatusChoice;
    clearance_status_display: string;
    admin_remarks: string;
    days_remaining: number;
    created_at?: string;
    updated_at?: string;
}

export interface SelfServiceData {
    employee: {
        id: string;
        first_name: string;
        last_name: string;
        employee_code: string;
        department: string;
        joining_date: string;
    };
    profile: Technician | null;
    active_policy: CompanyPolicy | null;
    leaves: EmployeeLeaveRequest[];
    exit_request: EmployeeExitRequest | null;
    attendance: {
        year?: number;
        month?: number;
        days_data: Record<string, string>;
        present_count: number;
        late_count: number;
        half_day_count: number;
        holiday_count: number;
        overtime_hours: number;
        allowed_half_day_count: number;
        allowed_holiday_count: number;
    };
    payroll: any | null;
    selected_year?: number;
    selected_month?: number;
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
