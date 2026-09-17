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
    geofence_radius_meters?: number;
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

export interface SecurityPost {
    id: string;
    site: string;
    site_name?: string;
    service_contract?: string | null;
    service_contract_code?: string | null;
    post_name: string;
    post_code: string;
    required_designation: string;
    required_designation_name?: string;
    required_headcount: number;
    deployed_count?: number;
    vacant_count?: number;
    overstaffed_count?: number;
    is_active: boolean;
    notes?: string;
    created_at?: string;
    updated_at?: string;
}

export interface PostManpowerItem {
    id: string;
    post_name: string;
    post_code: string;
    required_designation_id?: string;
    required_designation_name?: string;
    service_contract_id?: string | null;
    service_contract_code?: string | null;
    required_headcount: number;
    deployed_headcount: number;
    vacancies: number;
    overstaffing: number;
    is_active: boolean;
    notes: string;
}

export interface DeployedEmployeeItem {
    id: string;
    employee_id: string;
    employee_name: string;
    employee_code: string;
    employee_classification: string;
    designation_id?: string;
    designation_name: string;
    post_id?: string | null;
    post_name: string;
    assignment_type: string;
    start_date: string;
    from_date: string;
    end_date?: string | null;
    status: string;
}

export interface SiteManpowerSummary {
    site_id: string;
    site_name: string;
    client_id?: string | null;
    client_name?: string;
    address: string;
    is_active: boolean;
    required_strength: number;
    deployed_strength: number;
    vacancies: number;
    overstaffing: number;
    posts: PostManpowerItem[];
    deployments: DeployedEmployeeItem[];
}

// Deployment: one employee → one site/post → one designation
export interface Deployment {
    id: string;
    employee: string;
    employee_name?: string;
    employee_code?: string;
    employee_classification?: string;
    site: string;
    site_name?: string;
    post?: string | null;
    post_name?: string | null;
    crm_entity?: string | null;
    crm_entity_name?: string | null;
    service_contract: string | null;
    contract_code?: string | null;
    designation: string;
    designation_name?: string;
    assignment_type: 'PERMANENT' | 'TEMPORARY';
    start_date: string;
    end_date: string | null;
    effective_from?: string;
    effective_to?: string | null;
    status: 'DRAFT' | 'PLANNED' | 'ACTIVE' | 'COMPLETED' | 'RELIEVED' | 'CANCELLED';
    assigned_by?: string | null;
    assigned_by_name?: string | null;
    relieved_by?: string | null;
    relieved_by_name?: string | null;
    relieved_date?: string | null;
    relief_reason?: string;
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
    custody_type?: 'EMPLOYEE' | 'SITE';
    employee?: string | null;
    employee_name?: string;
    employee_code?: string | null;
    item: string;
    item_name: string;
    item_code?: string;
    item_serial: string | null;
    serial_number: string | null;
    warehouse: string;
    warehouse_name: string;
    site: string | null;
    site_name: string | null;
    client?: string | null;
    client_name?: string | null;
    contract?: string | null;
    contract_code?: string | null;
    quantity: string | number;
    issue_condition: string;
    return_condition: string;
    issued_at: string;
    expected_return_date: string | null;
    returned_at: string | null;
    status: 'ISSUED' | 'RETURNED' | 'LOST' | 'DAMAGED' | 'WRITTEN_OFF';
    status_label?: string;
    condition_label?: string;
    purpose?: string;
    notes: string;
    incident_date?: string | null;
    damage_severity?: string;
    resolution_status?: string;
    resolution_notes?: string;
    resolved_by_name?: string;
    issued_by_name?: string;
    returned_by_name?: string;
    created_at: string;
    updated_at: string;
}

export interface SecurityStoreProfile {
    id: string;
    warehouse: string;
    warehouse_name: string;
    warehouse_code: string;
    store_type: 'MAIN_STORE' | 'BRANCH_STORE' | 'SITE_STORE' | 'ARMORY';
    store_type_label: string;
    site?: string | null;
    site_name?: string | null;
    is_armory: boolean;
    requires_strong_auth: boolean;
    supervisor?: string | null;
    supervisor_name?: string;
    notes: string;
}

export interface SecurityItemProfile {
    id: string;
    item: string;
    item_name: string;
    item_code: string;
    security_category: string;
    category_label: string;
    is_controlled: boolean;
    requires_authorization: boolean;
    license_required: boolean;
    license_reference: string;
    permit_reference: string;
    permit_expiry_date?: string | null;
    storage_location: string;
    notes: string;
    is_serialized: boolean;
}

export interface SecurityStockAvailabilityItem {
    item_id: string;
    item_name: string;
    item_code: string;
    category: string;
    is_serialized: boolean;
    is_controlled: boolean;
    store_balance: number;
    available_store_stock: number;
    issued_to_employees: number;
    issued_to_sites: number;
    damaged: number;
    lost: number;
    total_managed: number;
    serialized_units?: Array<{
        serial_number: string;
        warehouse: string;
        status: string;
    }>;
}

export interface SecurityInventoryOverview {
    total_items: number;
    total_stores: number;
    active_employee_issues: number;
    active_site_issues: number;
    open_incidents: number;
    controlled_items_count: number;
    total_managed_units: number;
    total_lost_units: number;
    total_damaged_units: number;
}

export interface EquipmentIncident {
    id: string;
    incident_number: string;
    incident_type: 'LOST' | 'DAMAGED' | 'UNUSABLE';
    incident_type_label: string;
    item?: string | null;
    item_name?: string;
    item_serial?: string | null;
    serial_number?: string | null;
    store?: string | null;
    store_name?: string | null;
    employee?: string | null;
    employee_name?: string;
    site?: string | null;
    site_name?: string | null;
    quantity: string | number;
    incident_date: string;
    condition_on_incident: string;
    damage_severity: string;
    status: 'REPORTED' | 'UNDER_INVESTIGATION' | 'APPROVED_REPAIR' | 'APPROVED_WRITE_OFF' | 'RESOLVED_FOUND' | 'REJECTED' | 'CLOSED';
    status_label: string;
    notes: string;
    resolution_notes: string;
    approved_write_off: boolean;
    recommended_payroll_deduction: string | number;
    deduction_notes: string;
    reported_by_name?: string;
    resolved_by_name?: string;
    created_at: string;
}

export interface SerializedEquipmentHistory {
    serial_number: string;
    item_id: string;
    item_name: string;
    item_code: string;
    current_status: string;
    current_store: string | null;
    current_custodian: string | null;
    custody_history: Array<{
        issue_id: string;
        custody_type: string;
        custodian: string;
        purpose: string;
        issued_at: string;
        returned_at: string | null;
        issue_condition: string;
        return_condition: string;
        status: string;
        store: string;
    }>;
    condition_history: Array<{
        date: string;
        event: string;
        condition: string;
        actor: string;
        notes: string;
    }>;
    incidents: Array<{
        id: string;
        number: string;
        type: string;
        date: string;
        status: string;
        notes: string;
        resolution: string;
    }>;
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
export type IncidentStatus = 'OPEN' | 'INVESTIGATING' | 'ACTION_REQUIRED' | 'UNDER_REVIEW' | 'RESOLVED' | 'CLOSED';

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
    client?: string | null;
    client_name?: string;
    contract?: string | null;
    contract_code?: string;
    post?: string | null;
    post_name?: string;
    shift?: string | null;
    shift_name?: string;
    roster?: string | null;
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
    involved_persons?: string;
    immediate_action?: string;
    action_taken: string;
    status: IncidentStatus;
    resolution: string;
    reviewed_by: string | null;
    reviewed_at: string | null;
    assigned_to?: number | null;
    assigned_to_name?: string;
    closed_by?: number | null;
    closed_by_name?: string;
    closed_at?: string | null;
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

// ---------------------------------------------------------------------------
// Phase S-9: Temporary Services
// ---------------------------------------------------------------------------

export interface TemporaryServiceLine {
    id: string;
    temporary_service: string;
    designation: string;
    designation_name?: string;
    quantity: number | string;
    rate: number | string;
    amount: number | string;
    created_at: string;
    updated_at: string;
}

export type TemporaryServiceStatus = 'DRAFT' | 'REQUESTED' | 'APPROVED' | 'CONFIRMED' | 'COMPLETED';

export interface TemporaryServiceRequest {
    id: string;
    crm_entity: string;
    crm_entity_name?: string;
    operational_site: string | null;
    operational_site_name?: string;
    reference_number: string;
    start_datetime: string;
    end_datetime: string;
    status: TemporaryServiceStatus;
    requested_by: string | null;
    requested_by_name?: string;
    approved_by: string | null;
    approved_by_name?: string;
    notes: string;
    lines?: TemporaryServiceLine[];
    created_at: string;
    updated_at: string;
}

// ---------------------------------------------------------------------------
// Phase S-10: Quality Assurance
// ---------------------------------------------------------------------------

export interface QAChecklistItem {
    id: string;
    template: string;
    text: string;
    weight: number;
    is_required: boolean;
}

export interface QAChecklistTemplate {
    id: string;
    name: string;
    description: string;
    is_active: boolean;
    items?: QAChecklistItem[];
}

export interface QAInspectionResponse {
    id: string;
    inspection: string;
    checklist_item: string;
    checklist_item_text?: string;
    result: 'PASS' | 'FAIL' | 'N/A';
    notes: string;
}

export interface QAFinding {
    id: string;
    inspection: string;
    checklist_item: string | null;
    checklist_item_text?: string;
    description: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    status: 'OPEN' | 'RESOLVED';
}

export interface CorrectiveAction {
    id: string;
    finding: string;
    finding_description?: string;
    description: string;
    assigned_to: string;
    assigned_to_name?: string;
    due_date: string;
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'VERIFIED';
}

export interface QAInspection {
    id: string;
    template: string;
    template_name?: string;
    service_contract: string | null;
    service_contract_number?: string;
    operational_site: string;
    operational_site_name?: string;
    inspector: string;
    inspector_name?: string;
    inspection_date: string;
    status: 'DRAFT' | 'SUBMITTED' | 'REVIEWED';
    score: string | null;
    notes: string;
    responses?: QAInspectionResponse[];
    findings?: QAFinding[];
    created_at: string;
    updated_at: string;
}

// ---------------------------------------------------------------------------
// Phase S-5C Types: Shift, PostShiftRequirement, Roster, Coverage & Replacement
// ---------------------------------------------------------------------------

export interface Shift {
    id: string;
    name: string;
    code: string;
    start_time: string;
    end_time: string;
    duration_hours?: number;
    break_duration?: string | null;
    grace_period?: string | null;
    is_overnight: boolean;
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
}

export interface PostShiftRequirement {
    id: string;
    post: string;
    post_name?: string;
    post_code?: string;
    site_id?: string;
    site_name?: string;
    shift: string;
    shift_name?: string;
    shift_code?: string;
    start_time?: string;
    end_time?: string;
    required_headcount: number;
    is_active: boolean;
    notes?: string;
    created_at?: string;
    updated_at?: string;
}

export interface DutyRoster {
    id: string;
    duty_date: string;
    shift: string;
    shift_name?: string;
    shift_code?: string;
    shift_start?: string;
    shift_end?: string;
    shift_start_time?: string;
    shift_end_time?: string;
    shift_is_overnight?: boolean;
    shift_crosses_midnight?: boolean;
    site: string;
    site_name?: string;
    post?: string | null;
    post_name?: string;
    employee: string;
    employee_name?: string;
    employee_code?: string;
    employee_designation?: string;
    designation_name?: string;
    deployment?: string | null;
    status: 'SCHEDULED' | 'REPLACED' | 'SWAPPED' | 'COMPLETED' | 'CANCELLED';
    is_replacement: boolean;
    replacement_for?: string | null;
    original_employee_name?: string | null;
    notes?: string;
    created_at?: string;
    updated_at?: string;
}

export interface DutyReplacement {
    id: string;
    original_roster: string;
    original_employee: string;
    original_employee_name?: string;
    replacement_employee: string;
    replacement_employee_name?: string;
    site: string;
    site_name?: string;
    post?: string | null;
    post_name?: string;
    shift: string;
    shift_name?: string;
    duty_date: string;
    reason: string;
    status: string;
    assigned_by?: string;
    notes?: string;
    created_at?: string;
}

export interface RosterPostPersonnel {
    roster_id: string;
    employee_id: string;
    employee_name: string;
    employee_code: string;
    designation_name: string;
    is_replacement: boolean;
    original_employee_name?: string | null;
    status: string;
    notes?: string;
}

export interface RosterPostCoverageItem {
    post_id: string | null;
    post_name: string;
    post_code: string;
    required_designation: string;
    required_designation_name?: string;
    required: number;
    rostered: number;
    vacant: number;
    replacement_assigned: number;
    final_covered: number;
    status?: string;
    personnel: RosterPostPersonnel[];
}

export interface RosterShiftCoverageItem {
    shift_id: string;
    shift_name: string;
    shift_code: string;
    start_time: string;
    end_time: string;
    duration_hours?: number;
    is_overnight: boolean;
    required: number;
    rostered: number;
    vacant: number;
    replacement_assigned: number;
    final_covered: number;
    posts: RosterPostCoverageItem[];
}

export interface SiteCoverageSummary {
    site_id: string;
    site_name: string;
    duty_date: string;
    required_strength: number;
    rostered_strength: number;
    vacancies: number;
    replacement_coverage: number;
    final_covered_strength: number;
    totals?: {
        required: number;
        rostered: number;
        vacant: number;
        replacement_assigned: number;
        final_covered: number;
    };
    shifts: RosterShiftCoverageItem[];
}

export interface DailyRangeCoverageDay {
    date: string;
    weekday: string;
    required_strength: number;
    rostered_strength: number;
    vacancies: number;
    replacement_coverage: number;
    final_covered_strength: number;
    totals?: {
        required: number;
        rostered: number;
        vacant: number;
        replacement_assigned: number;
        final_covered: number;
    };
    shifts: {
        shift_id: string;
        shift_name: string;
        required: number;
        rostered: number;
        vacant: number;
        replacement_assigned: number;
        final_covered: number;
    }[];
}

export interface SiteRangeCoverageSummary {
    site_id: string;
    site_name?: string;
    start_date: string;
    end_date: string;
    days: DailyRangeCoverageDay[];
}

// ---------------------------------------------------------------------------
// Phase S-5D Types: Attendance, Leave, Weekly Off & JUMP Management
// ---------------------------------------------------------------------------

export type AttendanceStatusCode =
    | 'PRESENT'
    | 'ABSENT'
    | 'PAID_LEAVE'
    | 'UNPAID_LEAVE'
    | 'HOLIDAY'
    | 'WEEKLY_OFF'
    | 'HALF_DAY';

export interface AttendanceTotals {
    total_workforce: number;
    present: number;
    absent: number;
    paid_leave: number;
    unpaid_leave: number;
    holiday: number;
    weekly_off: number;
    half_day: number;
    jump_missing: number;
    finalized: number;
    unfinalized: number;
}

export interface ReplacementCoverageInfo {
    has_replacement: boolean;
    replacement_guard_name?: string;
    replacement_guard_id?: string;
    notes?: string;
}

export interface DailyAttendanceRow {
    employee_id: string;
    employee_name: string;
    employee_code: string;
    classification: 'DIRECT' | 'INDIRECT';
    designation_name?: string;
    employment_status: string;
    persistent_state?: 'PRESENT' | 'ABSENT';
    attendance_id: string | null;
    effective_status: AttendanceStatusCode;
    source: string;
    is_materialized?: boolean;
    is_finalized?: boolean;
    finalized_at: string | null;
    recorded_by?: string | null;
    recorded_by_name?: string | null;
    notes: string;
    consecutive_absent_days: number;
    is_jump_warning?: boolean;
    is_jump_active?: boolean;
    // DIRECT staff duty & roster links
    has_planned_duty?: boolean;
    roster_id: string | null;
    site_id: string | null;
    site_name: string | null;
    post_id: string | null;
    post_name: string | null;
    shift_id: string | null;
    shift_name: string | null;
    shift_code?: string | null;
    planned_duty?: string;
    is_replacement_duty?: boolean;
    has_replacement_coverage?: boolean;
    replacement_guard_name?: string | null;
    replacement_coverage?: ReplacementCoverageInfo;
}

export interface DailyAttendanceWorkspace {
    date: string;
    classification?: string;
    site_id?: string | null;
    totals: AttendanceTotals;
    uncovered_absences_count?: number;
    workforce: DailyAttendanceRow[];
    records?: DailyAttendanceRow[];
}

export interface JumpRecordItem {
    id: string;
    employee: string;
    employee_name?: string;
    employee_code?: string;
    classification?: string;
    designation_name?: string;
    absent_since: string;
    jump_triggered_at: string;
    consecutive_absent_days: number;
    reason: string;
    status: 'ACTIVE_JUMP' | 'RESTORED' | 'ACKNOWLEDGED';
    reinstated_at?: string | null;
    reinstated_by?: string | null;
    reinstated_by_name?: string | null;
    reinstatement_notes?: string;
    created_at: string;
}

export interface EmployeeAttendanceHistoryItem {
    id: string;
    date: string;
    status: AttendanceStatusCode;
    source: string;
    is_finalized: boolean;
    finalized_at: string | null;
    recorded_by_name?: string | null;
    site_name?: string | null;
    post_name?: string | null;
    shift_name?: string | null;
    notes?: string;
}

// ---------------------------------------------------------------------------
// Phase S-5E: Daily Duty Rate & Temporary Assignment Pay Types
// ---------------------------------------------------------------------------

export type DailyPayRateSource =
    | 'POST_RATE'
    | 'CONTRACT_RATE'
    | 'REPLACED_EMPLOYEE_RATE'
    | 'EMPLOYEE_DAILY_RATE'
    | 'EMPLOYEE_MONTHLY_DIVISOR'
    | 'MANUAL_OVERRIDE';

export type DailyPayCalculationStatus =
    | 'CALCULATED'
    | 'RECALCULATED'
    | 'UNRESOLVED'
    | 'FINALIZED';

export interface DailyDutyPayItem {
    id: string;
    employee_id: string;
    employee_name: string;
    employee_code: string;
    classification: 'DIRECT' | 'INDIRECT';
    designation_name: string;
    duty_date: string;
    attendance_status: string;
    normal_assignment: string;
    actual_duty: string;
    shift_name: string;
    is_replacement_duty: boolean;
    replaced_employee_id?: string | null;
    replaced_employee_name?: string | null;
    rate_source: DailyPayRateSource;
    rate_source_label: string;
    rate_source_reference: string;
    daily_payable_rate: number;
    payable_percentage: number;
    payable_amount: number;
    client_name: string;
    contract_code: string;
    site_name: string;
    post_name: string;
    calculation_status: DailyPayCalculationStatus;
    is_frozen: boolean;
    unresolved_reason?: string;
    notes?: string;
    is_replacement_rate: boolean;
    has_missing_rate: boolean;
    is_conflicting_duty: boolean;
    is_unresolved: boolean;
}

export interface DailyPayReviewTotals {
    total_records: number;
    total_payable_amount: number;
    replacement_count: number;
    unresolved_count: number;
    missing_rate_count: number;
    frozen_count: number;
}

export interface DailyPayReviewWorkspace {
    totals: DailyPayReviewTotals;
    records: DailyDutyPayItem[];
}

// ---------------------------------------------------------------------------
// Phase S-5F: Payroll Rules, Statutory Deductions & Compensation Types
// ---------------------------------------------------------------------------

export type PayrollAdditionType = 'ALLOWANCE' | 'BONUS' | 'EXTRA_DUTY' | 'ADJUSTMENT' | 'OTHER';
export type PayrollAdditionFrequency = 'ONE_TIME' | 'RECURRING';

export interface PayrollAdditionItem {
    id: string;
    employee: string;
    employee_name: string;
    employee_code: string;
    addition_type: PayrollAdditionType;
    addition_type_label: string;
    name: string;
    amount: number | string;
    frequency: PayrollAdditionFrequency;
    frequency_label: string;
    effective_date?: string | null;
    effective_from?: string | null;
    effective_to?: string | null;
    is_taxable: boolean;
    is_active: boolean;
    is_approved: boolean;
    notes?: string;
    created_at: string;
}

export type PayrollDeductionType = 'PATROLLING' | 'INSURANCE' | 'ADVANCE_RECOVERY' | 'UNIFORM' | 'FINE' | 'OTHER';
export type PayrollDeductionFrequency = 'ONE_TIME' | 'RECURRING';

export interface PayrollDeductionItem {
    id: string;
    employee: string;
    employee_name: string;
    employee_code: string;
    deduction_type: PayrollDeductionType;
    deduction_type_label: string;
    name: string;
    amount: number | string;
    frequency: PayrollDeductionFrequency;
    frequency_label: string;
    effective_date?: string | null;
    effective_from?: string | null;
    effective_to?: string | null;
    advance?: string | null;
    advance_number?: string;
    is_active: boolean;
    is_approved: boolean;
    notes?: string;
    created_at: string;
}

export type PayrollCalculationStatus = 'DRAFT' | 'CALCULATED' | 'BLOCKED' | 'READY';

export interface PayrollCalculationLineItem {
    id: string;
    calculation: string;
    line_type: string;
    category: 'EARNING' | 'DEDUCTION';
    description: string;
    duty_date?: string | null;
    units: number | string;
    rate: number | string;
    amount: number | string;
    employer_amount: number | string;
    reference_id?: string;
    rate_snapshot?: Record<string, any>;
    notes?: string;
    created_at: string;
}

export interface EmployeePayrollCalculationItem {
    id: string;
    employee_id: string;
    employee_name: string;
    employee_code: string;
    classification: 'DIRECT' | 'INDIRECT';
    designation_name: string;
    period_start: string;
    period_end: string;
    duty_earnings: number;
    duty_days_count: number;
    single_ot_hours?: number | string;
    single_ot_amount: number;
    double_ot_hours?: number | string;
    double_ot_amount: number;
    total_ot_amount: number;
    allowances_amount: number;
    bonuses_amount: number;
    other_additions_amount: number;
    gross_earnings: number;
    eobi_employee_amount: number;
    eobi_employer_amount: number;
    sessi_employee_amount: number;
    sessi_employer_amount: number;
    pessi_employee_amount: number;
    pessi_employer_amount: number;
    sessi_pessi_employee_amount: number;
    sessi_pessi_employer_amount: number;
    total_statutory_deductions: number;
    total_employer_statutory: number;
    patrolling_deduction: number;
    insurance_deduction: number;
    advance_recovery_amount: number;
    other_deductions_amount: number;
    total_other_deductions: number;
    total_deductions: number;
    net_payable: number;
    status: PayrollCalculationStatus;
    status_label: string;
    has_blockers: boolean;
    blocking_reasons: string[];
    is_frozen: boolean;
    calculated_at?: string | null;
    rate_snapshot: Record<string, any>;
    lines?: PayrollCalculationLineItem[];
}

export interface PayrollPreparationTotals {
    total_records: number;
    total_gross_earnings: number;
    total_net_payable: number;
    total_statutory_deductions: number;
    total_ot_amount: number;
    total_advance_recovery: number;
    blocked_count: number;
    ready_count: number;
    calculated_count: number;
}

export interface PayrollPreparationWorkspace {
    period_start: string;
    period_end: string;
    totals: PayrollPreparationTotals;
    records: EmployeePayrollCalculationItem[];
}

// ---------------------------------------------------------------------------
// Phase S-5G: Payroll Run, Payslips, Approval & Finance Handoff
// ---------------------------------------------------------------------------

export type PayrollRunStatus = 'DRAFT' | 'CALCULATED' | 'UNDER_REVIEW' | 'APPROVED' | 'FINALIZED' | 'CANCELLED';

export interface PayrollRunItem {
    id: string;
    run_number: string;
    period_start: string;
    period_end: string;
    payroll_month: string;
    employee_count: number;
    gross_earnings: number;
    employee_deductions: number;
    employer_statutory_contribution: number;
    net_payroll: number;
    status: PayrollRunStatus;
    status_label: string;
    prepared_by?: string | null;
    prepared_by_name?: string | null;
    prepared_at?: string | null;
    reviewed_by?: string | null;
    reviewed_by_name?: string | null;
    reviewed_at?: string | null;
    approved_by?: string | null;
    approved_by_name?: string | null;
    approved_at?: string | null;
    finalized_by?: string | null;
    finalized_by_name?: string | null;
    finalized_at?: string | null;
    finance_integrated: boolean;
    finance_integration_id?: string | null;
    finance_journal_entry_id?: string | null;
    finance_payment_batch_id?: string | null;
    finance_status: string;
    advances_settled: boolean;
    payslips_count?: number;
    created_at?: string;
}

export interface OperationalPayslipLineItem {
    id: string;
    component_name: string;
    component_type: 'EARNING' | 'DEDUCTION';
    amount: number;
    rate?: number | string | null;
    hours?: number | string | null;
    notes?: string;
}

export interface OperationalPayslipItem {
    id: string;
    payroll_run: string;
    payroll_run_number?: string;
    employee: string;
    employee_name: string;
    employee_code: string;
    designation_name: string;
    period_start: string;
    period_end: string;
    payroll_month: string;
    duty_earnings: number;
    single_ot_amount: number;
    double_ot_amount: number;
    allowances_amount: number;
    bonuses_amount: number;
    other_additions_amount: number;
    gross_earnings: number;
    eobi_employee: number;
    eobi_employer: number;
    sessi_employee: number;
    sessi_employer: number;
    pessi_employee: number;
    pessi_employer: number;
    patrolling_deduction: number;
    insurance_deduction: number;
    advance_recovery: number;
    other_deductions: number;
    total_deductions: number;
    net_salary: number;
    employer_statutory_total: number;
    status: string;
    is_frozen: boolean;
    rate_snapshot: Record<string, any>;
    lines_snapshot: any[];
    lines?: OperationalPayslipLineItem[];
    created_at: string;
}

export interface OperationalPayrollBlocker {
    employee_id: string;
    employee_name: string;
    employee_code: string;
    blocking_reasons: string[];
}

// ---------------------------------------------------------------------------
// Phase S-5I: Workforce + Operations Control Center Types
// ---------------------------------------------------------------------------

export interface ControlCenterFilters {
    target_date?: string;
    client_id?: string;
    contract_id?: string;
    site_id?: string;
    shift_id?: string;
    classification?: string;
    designation_id?: string;
    employment_status?: string;
}

export interface WorkforceSummary {
    total_employees: number;
    direct_count: number;
    indirect_count: number;
    active_count: number;
    suspended_count: number;
    jump_count: number;
    resigned_count: number;
    terminated_count: number;
    designation_breakdown: Array<{ id: string; name: string; count: number }>;
    department_breakdown: Array<{ id: string; name: string; count: number }>;
}

export interface ManpowerSummary {
    required_strength: number;
    deployed_strength: number;
    vacancies: number;
    overstaffing: number;
    shortage_sites_count: number;
    shortage_sites: Array<{
        site_id: string;
        site_name: string;
        client_name: string;
        required: number;
        deployed: number;
        vacancies: number;
    }>;
    vacant_posts_count: number;
    vacant_posts: Array<{
        post_id: string;
        post_name: string;
        site_id: string;
        site_name: string;
        required_headcount: number;
        deployed_headcount: number;
        vacancies: number;
        required_designation_name: string;
    }>;
}

export interface DutyCoverageSummary {
    target_date: string;
    required_roster_strength: number;
    rostered_strength: number;
    replacement_coverage: number;
    uncovered_vacancies: number;
    cross_site_replacements_count: number;
    shift_breakdown: Array<{
        shift_id: string;
        shift_name: string;
        required: number;
        rostered: number;
        replacement: number;
        uncovered: number;
        coverage_pct: number;
    }>;
    site_coverage_list: Array<{
        site_id: string;
        site_name: string;
        client_name: string;
        required: number;
        rostered: number;
        replacement: number;
        uncovered: number;
        coverage_pct: number;
    }>;
}

export interface AttendanceSummary {
    target_date: string;
    present: number;
    absent: number;
    paid_leave: number;
    unpaid_leave: number;
    weekly_off: number;
    holiday: number;
    half_day: number;
    missing_unfinalized: number;
    active_jump_count: number;
    active_jump_list: Array<{
        id: string;
        employee_id: string;
        employee_name: string;
        employee_code: string;
        absent_since: string;
        consecutive_absent_days: number;
        reason: string;
    }>;
    approaching_jump_count: number;
    approaching_jump_list: Array<{
        employee_id: string;
        employee_name: string;
        employee_code: string;
        consecutive_absent_days: number;
        absent_since: string;
    }>;
    uncovered_absences_count: number;
    uncovered_absences_list: Array<{
        employee_id: string;
        employee_name: string;
        employee_code: string;
        site_id: string | null;
        site_name: string;
        post_name: string;
        shift_name: string;
    }>;
}

export interface PayrollReadinessSummary {
    period_start: string;
    period_end: string;
    daily_duty_pay_generated_count: number;
    unresolved_daily_pay_count: number;
    unresolved_daily_pay_list: Array<{
        id: string;
        employee_name: string;
        duty_date: string;
        unresolved_reason: string;
    }>;
    calculations_ready_count: number;
    calculations_blocked_count: number;
    blocked_calculations_list: Array<{
        employee_id: string;
        employee_name: string;
        blocking_reasons: string[];
    }>;
    estimated_gross_payroll: number;
    estimated_net_payable: number;
    latest_payroll_run: {
        run_id: string;
        run_number: string;
        payroll_month: string;
        period_start: string;
        period_end: string;
        status: string;
        employee_count: number;
        gross_earnings: number;
        net_payroll: number;
        finalized_at: string | null;
    } | null;
    finance_handoff_status: 'NOT_FINALIZED' | 'PENDING' | 'LIABILITY_RECOGNIZED' | 'LIABILITY_POSTED';
}

export interface LifecycleAlertsSummary {
    active_jumps_count: number;
    suspended_count: number;
    suspended_list: Array<{
        employee_id: string;
        employee_name: string;
        employee_code: string;
        designation_name: string;
        department_name: string;
    }>;
    unassigned_direct_count: number;
    unassigned_direct_list: Array<{
        employee_id: string;
        employee_name: string;
        employee_code: string;
        designation_name: string;
    }>;
    recent_transfers_count: number;
    recent_transfers_list: Array<{
        employee_id: string;
        employee_name: string;
        effective_date: string;
        old_value: string;
        new_value: string;
        reason: string;
    }>;
    recent_separations_count: number;
    recent_separations_list: Array<{
        employee_id: string;
        employee_name: string;
        event_type: string;
        effective_date: string;
        reason: string;
    }>;
}

export interface SiteHealthItem {
    site_id: string;
    site_name: string;
    address: string;
    client_id: string | null;
    client_name: string;
    contract_code: string;
    required_strength: number;
    deployed_strength: number;
    todays_roster_count: number;
    present_count: number;
    absent_count: number;
    replacement_count: number;
    vacancies: number;
    uncovered_absences: number;
    jump_cases_count: number;
    health_status: 'CRITICAL' | 'WARNING' | 'HEALTHY';
}

export interface ActionCenterItem {
    id: string;
    priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    category: 'ATTENDANCE' | 'JUMP' | 'PAYROLL' | 'MANPOWER' | 'LIFECYCLE';
    title: string;
    description: string;
    target_type: string;
    target_id: string;
    tab: string;
    action_label: string;
    metadata?: Record<string, any>;
}

export interface ControlCenterData {
    target_date: string;
    filters: ControlCenterFilters;
    workforce: WorkforceSummary;
    manpower: ManpowerSummary;
    duty_coverage: DutyCoverageSummary;
    attendance: AttendanceSummary;
    payroll_readiness: PayrollReadinessSummary;
    lifecycle_alerts: LifecycleAlertsSummary;
    site_health: SiteHealthItem[];
    action_center: ActionCenterItem[];
}


// ==============================================================================
// PHASE S-7: ADVANCED SECURITY OPERATIONS TYPES
// ==============================================================================

export type OccurrenceEntryType =
    | 'SHIFT_HANDOVER'
    | 'OBSERVATION'
    | 'VISITOR'
    | 'INCIDENT'
    | 'PATROL'
    | 'EQUIPMENT'
    | 'SUPERVISOR_INSTRUCTION'
    | 'GENERAL';

export interface DailyOccurrenceLog {
    id: string;
    site: string;
    site_name?: string;
    post?: string | null;
    post_name?: string;
    shift?: string | null;
    shift_name?: string;
    logged_by?: number | null;
    logged_by_name?: string;
    employee?: string | null;
    employee_name?: string;
    entry_type: OccurrenceEntryType;
    entry_type_label?: string;
    timestamp: string;
    title: string;
    details: string;
    incident_reference?: string | null;
    is_flagged: boolean;
    created_at: string;
    updated_at: string;
}

export interface SiteCheckpoint {
    id: string;
    site: string;
    site_name?: string;
    name: string;
    code: string;
    location_description: string;
    sequence_order: number;
    latitude: string | null;
    longitude: string | null;
    qr_code_tag: string;
    nfc_tag_id: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export type PatrolFrequency = 'HOURLY' | 'EVERY_2_HOURS' | 'PER_SHIFT' | 'CUSTOM';

export interface PatrolPlan {
    id: string;
    site: string;
    site_name?: string;
    shift?: string | null;
    shift_name?: string;
    name: string;
    description: string;
    assigned_employee: string | null;
    assigned_employee_name?: string;
    frequency: PatrolFrequency;
    estimated_duration_minutes: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export type PatrolRunStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'MISSED' | 'ABORTED';

export interface PatrolRun {
    id: string;
    site: string;
    site_name?: string;
    plan?: string | null;
    plan_name?: string;
    shift?: string | null;
    shift_name?: string;
    assigned_employee: string | null;
    assigned_employee_name?: string;
    roster?: string | null;
    run_code: string;
    scheduled_start: string;
    scheduled_end?: string | null;
    actual_start?: string | null;
    actual_end?: string | null;
    status: PatrolRunStatus;
    status_label?: string;
    notes: string;
    completion_notes: string;
    created_at: string;
    updated_at: string;
}

export type GuardTourStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'MISSED' | 'ABORTED';
export type VerificationSource = 'MANUAL' | 'QR_CODE' | 'NFC' | 'GPS';
export type GeofenceStatus = 'INSIDE_GEOFENCE' | 'OUTSIDE_GEOFENCE' | 'LOCATION_UNAVAILABLE';
export type CheckpointEventStatus = 'VERIFIED' | 'MISSED' | 'SKIPPED' | 'OUT_OF_SEQUENCE';

export interface GuardTourEvent {
    id: string;
    tour: string;
    checkpoint: string;
    checkpoint_name?: string;
    checkpoint_code?: string;
    sequence_order?: number;
    verified_at: string | null;
    verification_source: VerificationSource;
    verified_by?: number | null;
    verified_by_name?: string;
    status: CheckpointEventStatus;
    notes: string;
    latitude: string | null;
    longitude: string | null;
    accuracy_meters: string | null;
    captured_at?: string | null;
    geofence_status: GeofenceStatus;
    created_at: string;
}

export interface GuardTour {
    id: string;
    site: string;
    site_name?: string;
    patrol_run?: string | null;
    assigned_employee?: string | null;
    assigned_employee_name?: string;
    shift?: string | null;
    shift_name?: string;
    roster?: string | null;
    tour_name: string;
    start_time?: string | null;
    end_time?: string | null;
    status: GuardTourStatus;
    total_checkpoints: number;
    completed_checkpoints: number;
    missed_checkpoints: number;
    completion_rate: string | number;
    notes: string;
    events?: GuardTourEvent[];
    created_at: string;
    updated_at: string;
}

export type EmergencyType =
    | 'PANIC_BUTTON'
    | 'ARMED_ASSAULT'
    | 'FIRE_EMERGENCY'
    | 'MEDICAL_EMERGENCY'
    | 'INTRUSION'
    | 'UNRESPONSIVE_GUARD'
    | 'OTHER';

export type EmergencyStatus = 'TRIGGERED' | 'ACKNOWLEDGED' | 'RESPONDING' | 'RESOLVED' | 'FALSE_ALARM';

export interface EmergencyEvent {
    id: string;
    site: string;
    site_name?: string;
    post?: string | null;
    post_name?: string;
    employee?: string | null;
    employee_name?: string;
    reported_by?: number | null;
    reported_by_name?: string;
    event_type: EmergencyType;
    event_type_label?: string;
    severity: string;
    occurred_at: string;
    description: string;
    status: EmergencyStatus;
    latitude: string | null;
    longitude: string | null;
    accuracy_meters: string | null;
    location_source: string;
    geofence_status: GeofenceStatus;
    acknowledged_by?: number | null;
    acknowledged_by_name?: string;
    acknowledged_at?: string | null;
    assigned_responder?: number | null;
    assigned_responder_name?: string;
    response_notes: string;
    resolved_at?: string | null;
    resolution_summary: string;
    created_at: string;
    updated_at: string;
}

export type InspectionRating = 'EXCELLENT' | 'SATISFACTORY' | 'DEFICIENT';
export type SupervisorInspectionStatus = 'DRAFT' | 'COMPLETED' | 'ACTION_REQUIRED';

export interface SupervisorInspection {
    id: string;
    site: string;
    site_name?: string;
    post?: string | null;
    post_name?: string;
    shift?: string | null;
    shift_name?: string;
    inspector: number;
    inspector_name?: string;
    inspection_datetime: string;
    status: SupervisorInspectionStatus;
    guard_presence_verified: boolean;
    uniform_condition: InspectionRating;
    equipment_condition: InspectionRating;
    post_cleanliness_condition: InspectionRating;
    documentation_in_order: boolean;
    turnout_and_bearing: InspectionRating;
    deficiencies_observed: string;
    corrective_action_required: string;
    notes: string;
    overall_score?: string | number | null;
    reviewed_by?: number | null;
    reviewed_by_name?: string;
    reviewed_at?: string | null;
    created_at: string;
    updated_at: string;
}

export type EscalationPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type EscalationStatus = 'OPEN' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type EscalationSourceType =
    | 'INCIDENT'
    | 'MISSED_PATROL'
    | 'INSPECTION_FAILURE'
    | 'EMERGENCY'
    | 'UNCOVERED_POST'
    | 'MANUAL';

export interface OperationsEscalation {
    id: string;
    source_type: EscalationSourceType;
    source_type_label?: string;
    source_id: string;
    site: string;
    site_name?: string;
    title: string;
    description: string;
    priority: EscalationPriority;
    status: EscalationStatus;
    assigned_to?: number | null;
    assigned_to_name?: string;
    due_at?: string | null;
    acknowledged_at?: string | null;
    resolved_at?: string | null;
    resolution_notes: string;
    notification_sent: boolean;
    created_at: string;
    updated_at: string;
}

export interface ControlRoomQueueItem {
    id: string;
    type: string;
    title: string;
    site_name: string;
    priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    status: string;
    occurred_at: string;
    assigned_to?: string | null;
    details: string;
}

export interface ControlRoomQueueResponse {
    total_queue_items: number;
    critical_count: number;
    high_count: number;
    emergencies_active: number;
    open_incidents_count: number;
    open_escalations_count: number;
    missed_patrols_count: number;
    equipment_incidents_count: number;
    queue: ControlRoomQueueItem[];
}

export interface SiteRiskSummary {
    site_id: string;
    site_name: string;
    client_name: string;
    active_incidents: number;
    active_emergencies: number;
    inspection_deficiencies: number;
    missed_patrols: number;
    risk_level: 'HIGH' | 'MEDIUM' | 'LOW';
    geofence_configured: boolean;
    geofence_radius_meters: number;
}

export interface AdvancedOpsDashboardResponse {
    open_incidents: number;
    critical_incidents: number;
    patrol_completion_rate: number;
    total_patrol_runs_7d: number;
    completed_patrol_runs_7d: number;
    missed_checkpoints_7d: number;
    overdue_escalations: number;
    active_emergencies: number;
    inspection_issues: number;
    site_risk_summary: SiteRiskSummary[];
}

export interface GeofenceValidationResponse {
    site_id: string;
    site_name: string;
    center_latitude?: string | null;
    center_longitude?: string | null;
    radius_meters: number;
    evaluated_status: GeofenceStatus;
}


