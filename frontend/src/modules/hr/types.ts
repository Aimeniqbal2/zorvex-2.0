export interface Department {
    id: string;
    name: string;
}

export interface Designation {
    id: string;
    name: string;
    code: string;
}

export interface EmployeeNextOfKin {
    id: string;
    employee: string;
    name: string;
    cnic_number?: string;
    relationship: string;
    contact_number: string;
    is_primary: boolean;
    notes?: string;
}

export interface EmployeeDocument {
    id: string;
    employee: string;
    document_type: string;
    document_type_display?: string;
    document_number?: string;
    issue_date?: string;
    expiry_date?: string;
    verification_status: 'PENDING' | 'UPLOADED' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';
    verification_status_display?: string;
    verified_by?: string;
    verified_by_name?: string;
    verified_at?: string;
    notes?: string;
}

export interface EmployeeTraining {
    id: string;
    employee: string;
    training_type: string;
    training_date: string;
    institute_or_trainer?: string;
    expiry_date?: string;
    status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'EXPIRED' | 'FAILED';
    notes?: string;
}

export interface EmploymentHistory {
    id: string;
    employee: string;
    event_type: string;
    effective_date: string;
    old_value?: string;
    new_value?: string;
    notes?: string;
    reason?: string;
    changed_by_name?: string;
    approved_by_name?: string;
    metadata?: Record<string, any>;
    created_at: string;
}

export interface UnifiedTimelineItem {
    id: string;
    source_type: 'EMPLOYMENT_HISTORY' | 'DEPLOYMENT' | 'JUMP_RECORD';
    source_id: string;
    event_type: string;
    date: string;
    timestamp: string;
    title: string;
    description: string;
    reason?: string;
    old_value?: string;
    new_value?: string;
    actor?: string | null;
    metadata?: Record<string, any>;
}

export interface Employee {
    id: string;
    employee_code: string;
    first_name: string;
    last_name: string;
    full_name?: string;
    email?: string;
    phone?: string;
    date_of_birth?: string;
    hire_date?: string;
    joining_date?: string;
    confirmation_date?: string;
    resignation_date?: string;
    termination_date?: string;
    last_working_date?: string;
    rehire_date?: string;
    age?: number;
    designation?: string;
    department?: string;
    department_name?: string;
    designation_name?: string;
    classification: 'DIRECT' | 'INDIRECT';
    father_name?: string;
    cnic_number?: string;
    permanent_address?: string;
    current_address?: string;
    education?: string;
    marital_status?: 'SINGLE' | 'MARRIED' | 'DIVORCED' | 'WIDOWED';
    background_type?: 'CIVILIAN' | 'EX_ARMY' | 'OTHER';
    employment_status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'RESIGNED' | 'TERMINATED' | 'JUMP';
    is_active: boolean;
    training_completed?: boolean;
    next_of_kin?: EmployeeNextOfKin[];
    documents?: EmployeeDocument[];
    trainings?: EmployeeTraining[];
    history_logs?: EmploymentHistory[];
}

export interface Employment {
    id: string;
    employee: string;
    employment_type: string;
    employment_status: string;
    start_date: string;
    end_date?: string;
    designation?: string;
    department?: string;
    is_current: boolean;
}

export interface CandidateDocument {
    id: string;
    candidate: string;
    document_type: string;
    document_number?: string;
    issue_date?: string;
    expiry_date?: string;
    original_seen: boolean;
    original_received: boolean;
    returned: boolean;
    status: string;
    notes?: string;
}

export interface CandidateVerification {
    id: string;
    candidate: string;
    verification_type: string;
    status: string;
    reference_number?: string;
    verification_date?: string;
    expiry_date?: string;
    remarks?: string;
    verified_by?: string;
}

export interface Candidate {
    id: string;
    candidate_number: string;
    first_name: string;
    last_name: string;
    father_name?: string;
    date_of_birth?: string;
    national_id?: string;
    phone?: string;
    email?: string;
    address?: string;
    applied_designation: string;
    applied_designation_name?: string;
    status: string;
    application_date: string;
    selection_date?: string;
    biometric_enrolled: boolean;
    biometric_reference_id?: string;
    documents?: CandidateDocument[];
    verifications?: CandidateVerification[];
}

export interface WorkforceAttendance {
    id: string;
    employee: string;
    employee_name?: string;
    employment?: string;
    date: string;
    check_in?: string;
    check_out?: string;
    status: string;
    notes?: string;
    source: string;
}

export interface Shift {
    id: string;
    name: string;
    code: string;
    start_time: string;
    end_time: string;
    break_duration: number;
    is_night_shift: boolean;
    is_active: boolean;
}

export interface LeaveType {
    id: string;
    name: string;
    code: string;
    is_paid: boolean;
    requires_approval: boolean;
    max_days_per_year: number;
    is_active: boolean;
}

export interface LeaveRequest {
    id: string;
    employee: string;
    employee_name?: string;
    leave_type: string;
    leave_type_name?: string;
    start_date: string;
    end_date: string;
    total_days: string;
    status: string;
    reason?: string;
    remarks?: string;
}

export interface SalaryComponent {
    id: string;
    name: string;
    code: string;
    type: string;
    component_type: string;
    calculation_type: string;
    is_taxable: boolean;
    is_active: boolean;
}

export interface SalaryStructure {
    id: string;
    name: string;
    code: string;
    description?: string;
    currency?: string;
    effective_from?: string;
    is_active: boolean;
}

export interface PayrollPeriod {
    id: string;
    name: string;
    start_date: string;
    end_date: string;
    processing_deadline?: string;
    status: string;
    is_active: boolean;
}

export interface PayrollRun {
    id: string;
    payroll_period: string;
    payroll_period_name?: string;
    run_date: string;
    status: string;
    total_gross?: string;
    total_net?: string;
    total_deductions?: string;
    notes?: string;
}

export interface PayslipLine {
    id: string;
    payslip: string;
    salary_component: string;
    salary_component_name?: string;
    type: string;
    amount: string;
}

export interface Payslip {
    id: string;
    payroll_run: string;
    employee: string;
    employee_name?: string;
    payroll_period?: string;
    payroll_period_name?: string;
    gross_pay: string;
    net_pay: string;
    total_deductions: string;
    status: string;
    lines?: PayslipLine[];
}

export interface EmployeeSalaryAssignment {
    id: string;
    employee: string;
    employee_name?: string;
    employment?: string;
    salary_structure?: string;
    salary_structure_name?: string;
    currency?: string;
    base_salary?: number;
    effective_from?: string;
    effective_to?: string;
    status?: string;
}

export interface WorkSchedule {
    id: string;
    employee: string;
    employee_name?: string;
    shift: string;
    shift_name?: string;
    effective_from: string;
    effective_to?: string;
    days_of_week: string;
    is_active: boolean;
}

export interface StatutoryScheme {
    id: string;
    name: string;
    scheme_type: string;
    description?: string;
    is_active: boolean;
}

export interface OvertimeRecord {
    id: string;
    employee: string;
    employee_name?: string;
    date: string;
    start_time?: string;
    end_time?: string;
    hours: string;
    reason?: string;
    status: string;
    approved_by?: string;
}

export interface StatutoryRule {
    id: string;
    scheme: string;
    scheme_name?: string;
    effective_from: string;
    effective_to?: string;
    employee_rate: string;
    employer_rate: string;
    wage_ceiling?: string;
    wage_floor?: string;
    is_flat_amount: boolean;
}

export interface EmployeeStatutoryEnrollment {
    id: string;
    employee: string;
    employee_name?: string;
    scheme: string;
    scheme_name?: string;
    identifier?: string;
    is_active: boolean;
}

export interface PayrollDisbursement {
    id: string;
    payroll_run: string;
    payroll_run_name?: string;
    payment_voucher?: string;
    payment_account?: string;
    payment_account_name?: string;
    total_amount: string;
    disbursement_date: string;
    status: string;
    payslips?: PayslipDisbursement[];
}

export interface PayslipDisbursement {
    id: string;
    disbursement: string;
    payslip: string;
    payslip_name?: string;
    amount: string;
    status: string;
}
