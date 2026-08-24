export interface SecurityOperationsSummary {
    active_sites: number;
    active_contracts: number;
    active_deployments: number;
    deployed_staff: number;
    todays_duties: number;
    completed_duties: number;
    attendance_synced: number;
    extra_duties_pending: number;
    extra_duties_approved: number;
    staffing_shortage: number;
    expiring_contracts: number;
    currently_issued_equipment: number;
    open_incidents: number;
    critical_incidents: number;
    pending_dars: number;
    pending_invoices: number;
    outstanding_receivables: number;
    current_period_billed: number;
}

export interface OperationalSite {
    id: string;
    crm_entity: string;
    customer_name?: string;
    name: string;
    address: string;
    latitude: string | null;
    longitude: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface ServiceContract {
    id: string;
    crm_entity: string;
    customer_name?: string;
    contract_code: string;
    start_date: string;
    end_date: string | null;
    status: string;
    notes: string;
    sites: string[];
    created_at: string;
    updated_at: string;
}

export interface ContractRate {
    id: string;
    service_contract: string;
    designation: string;
    designation_name?: string;
    billing_rate: string | number;
    pay_rate: string | number;
    effective_date: string;
    created_at?: string;
    updated_at?: string;
}

// Deployment: one employee → one site → one designation
// No stored required_headcount. Count active Deployments for staffing math.
export interface Deployment {
    id: string;
    employee: string;
    employee_name?: string;
    site: string;
    site_name?: string;
    service_contract: string | null;
    contract_code?: string | null;
    designation: string;
    designation_name?: string;
    start_date: string;
    end_date: string | null;
    status: 'DRAFT' | 'PLANNED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
    notes: string;
    created_at: string;
    updated_at: string;
}

// Staffing summary from /deployments/staffing-summary/
export interface StaffingSummaryEntry {
    site_id: string;
    site__name: string;
    designation_id: string;
    designation__name: string;
    assigned_count: number;
}

export interface DutyAssignment {
    id: string;
    deployment: string;
    deployment_label?: string;
    // employee and site are auto-filled by backend from deployment on save
    employee: string;
    employee_name?: string;
    site: string;
    site_name?: string;
    date: string;
    start_time: string;
    end_time: string;
    status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'ABSENT' | 'CANCELLED';
    notes: string;
    created_at: string;
    updated_at: string;
}

export interface ExtraDuty {
    id: string;
    employee: string;
    employee_name?: string;
    site?: string;
    site_name?: string;
    service_contract?: string;
    date: string;
    start_time?: string;
    end_time?: string;
    hours: string | number;
    description: string;
    status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'COMPLETED';
    created_at: string;
    updated_at: string;
}

export interface SecurityAttendance {
    id: string;
    employee: string;
    employee_name: string;
    date: string;
    check_in: string | null;
    check_out: string | null;
    status: string;
    source: string;
    notes: string;
    site_name: string;
}

export interface EquipmentIssue {
    id: string;
    employee: string;
    employee_name: string;
    item: string;
    item_name: string;
    item_serial: string | null;
    serial_number: string | null;
    warehouse: string;
    warehouse_name: string;
    site: string | null;
    site_name: string | null;
    quantity: string | number;
    issue_condition: string;
    return_condition: string;
    issued_at: string;
    expected_return_date: string | null;
    returned_at: string | null;
    status: 'ISSUED' | 'RETURNED' | 'LOST' | 'DAMAGED';
    notes: string;
    created_at: string;
    updated_at: string;
}

// Lightweight Employee type for selectors
export interface EmployeeOption {
    id: string;
    first_name: string;
    last_name: string;
    designation: string | null;
    designation_name?: string;
    employee_code: string;
    is_active: boolean;
}

// Designation option for selectors
export interface DesignationOption {
    id: string;
    name: string;
    is_active: boolean;
}

export interface PaginatedResponse<T> {
    count: number;
    next: string | null;
    previous: string | null;
    results: T[];
}

// ---------------------------------------------------------------------------
// Phase S-7: Incidents and Daily Activity Reports
// ---------------------------------------------------------------------------

export type IncidentType = 'SECURITY_BREACH' | 'THEFT' | 'TRESPASS' | 'FIRE' | 'MEDICAL' | 'PROPERTY_DAMAGE' | 'VIOLENCE' | 'SUSPICIOUS_ACTIVITY' | 'SAFETY' | 'OTHER';
export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type IncidentStatus = 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'CLOSED';

export interface IncidentAttachment {
    id: string;
    incident: string;
    file: string;
    uploaded_by: string;
    uploaded_by_name?: string;
    description: string;
    created_at: string;
    updated_at: string;
}

export interface IncidentReport {
    id: string;
    site: string;
    site_name?: string;
    reported_by: string;
    employee_name?: string;
    duty_assignment: string | null;
    incident_number: string;
    incident_type: IncidentType;
    severity: IncidentSeverity;
    occurred_at: string;
    reported_at: string;
    title: string;
    description: string;
    action_taken: string;
    status: IncidentStatus;
    resolution: string;
    reviewed_by: string | null;
    reviewed_at: string | null;
    attachments: IncidentAttachment[];
    created_at: string;
    updated_at: string;
}

export type DARStatus = 'DRAFT' | 'SUBMITTED' | 'REVIEWED';
export type ActivityType = 'PATROL' | 'HANDOVER' | 'ACCESS' | 'INCIDENT' | 'GENERAL';

export interface DailyActivityEntry {
    id: string;
    report: string;
    timestamp: string;
    activity_type: ActivityType;
    description: string;
    recorded_by: string | null;
    recorded_by_name?: string;
    created_at: string;
    updated_at: string;
}

export interface DailyActivityReport {
    id: string;
    site: string;
    site_name?: string;
    report_date: string;
    deployment: string | null;
    duty_assignment: string | null;
    prepared_by: string;
    prepared_by_name?: string;
    shift_start: string;
    shift_end: string;
    summary: string;
    status: DARStatus;
    reviewed_by: string | null;
    reviewed_at: string | null;
    entries: DailyActivityEntry[];
    created_at: string;
    updated_at: string;
}
// ---------------------------------------------------------------------------
// Phase S-8: Security Billing
// ---------------------------------------------------------------------------

export interface ServiceInvoiceLine {
    id: string;
    service_invoice: string;
    designation: string | null;
    designation_name?: string;
    operational_site: string | null;
    site_name?: string;
    description: string;
    quantity: number | string;
    unit_price: number | string;
    total_amount: number | string;
    created_at: string;
    updated_at: string;
}

export interface ServiceInvoice {
    id: string;
    service_contract: string;
    contract_code?: string;
    crm_entity: string;
    customer_name?: string;
    invoice_number: string;
    period_start: string;
    period_end: string;
    status: 'DRAFT' | 'POSTED' | 'CANCELLED';
    subtotal: number | string;
    total_amount: number | string;
    notes: string;
    due_date: string | null;
    paid_amount: number | string;
    payment_status: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
    lines?: ServiceInvoiceLine[];
    created_at: string;
    updated_at: string;
}
