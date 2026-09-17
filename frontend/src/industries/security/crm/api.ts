import { apiClient } from '../../../api/client';
import type { PaginatedResponse } from '../../../modules/crm/types';

export interface CRMContact {
    id: string;
    first_name: string;
    last_name: string;
    email?: string;
    phone?: string;
    job_title?: string;
}

export interface SecurityServiceType {
    id: string;
    code: string;
    name: string;
    description: string;
    is_active: boolean;
    company: string;
}

export interface ClientLocation {
    id: string;
    customer: string;
    name: string;
    address: string | null;
    is_active: boolean;
    company: string;
}

export interface ProposalAdditionalCharge {
    id: string;
    proposal_version: string;
    charge_name: string;
    charge_type: 'ONE_TIME' | 'MONTHLY';
    amount: string | number;
    quantity: number;
    notes: string;
    line_total?: string | number;
}

export interface ContractEquipmentRequirement {
    id: string;
    proposal_version: string;
    location: string;
    location_name?: string;
    inventory_item?: string | null;
    inventory_item_name?: string | null;
    item_name: string;
    description: string;
    quantity: number;
    unit_rate: string | number;
    charge_type: 'ONE_TIME' | 'MONTHLY';
    notes: string;
    source_recommendation?: string | null;
    line_total?: string | number;
}

export interface ProposalServiceLine {
    id: string;
    proposal_version: string;
    service_type: string;
    service_type_name?: string;
    location: string;
    location_name?: string;
    quantity: number;
    client_rate: string | number;
    billing_unit: string;
    single_ot_rate?: string | number | null;
    double_ot_rate?: string | number | null;
    single_ot_billing_rate?: string | number | null;
    double_ot_billing_rate?: string | number | null;
    notes: string;
    source_recommendation?: string | null;
    total?: number;
    line_total?: number;
}

export interface ProposalVersion {
    id: string;
    proposal: string;
    version_number: number;
    version_type: string;
    status: string;
    is_frozen: boolean;
    notes: string;
    billing_cycle?: 'MONTHLY' | 'BI_WEEKLY' | 'CUSTOM';
    payment_terms?: 'DUE_ON_RECEIPT' | 'NET_15' | 'NET_30' | 'NET_60' | 'ADVANCE' | 'CUSTOM';
    proposal_validity_days?: number;
    contract_duration_months?: number;
    expected_start_date?: string | null;
    security_deposit?: string | number;
    commercial_notes?: string;
    terms_and_conditions?: string;
    discount_type?: 'NONE' | 'FIXED' | 'PERCENTAGE';
    discount_value?: string | number;
    tax_rate?: string | number;
    sent_at?: string | null;
    sent_by?: string | null;
    monthly_services_total?: string | number;
    one_time_services_total?: string | number;
    recurring_equipment_total?: string | number;
    one_time_equipment_total?: string | number;
    recurring_charges_total?: string | number;
    one_time_charges_total?: string | number;
    total_monthly_recurring?: string | number;
    total_one_time?: string | number;
    subtotal?: string | number;
    discount_amount?: string | number;
    taxable_amount?: string | number;
    tax_amount?: string | number;
    grand_total?: string | number;
    service_lines?: ProposalServiceLine[];
    equipment_requirements?: ContractEquipmentRequirement[];
    additional_charges?: ProposalAdditionalCharge[];
    created_at: string;
    updated_at: string;
}

export interface NextAction {
    type: 'meeting' | 'follow_up';
    title: string;
    due_at: string;
    assigned_to: string;
    priority: string;
    is_overdue: boolean;
}

export interface ProposalSignedDocument {
    id: string;
    proposal: string;
    title: string;
    document_type: 'SIGNED_CONTRACT' | 'SIGNED_PROPOSAL' | 'PURCHASE_ORDER' | 'AWARD_LETTER' | 'OTHER_SUPPORTING';
    document_type_display?: string;
    file?: string | null;
    file_url?: string | null;
    notes: string;
    uploaded_by?: string | null;
    uploaded_by_name?: string | null;
    created_at: string;
    updated_at: string;
}

export interface SecurityProposal {
    id: string;
    customer: string;
    customer_name?: string;
    proposal_number: string;
    title: string;
    status: string;
    contract: string | null;
    contract_id?: string | null;
    contract_code?: string | null;
    contract_status?: string | null;
    valid_until: string | null;
    notes: string;

    // Approval Fields
    approved_version?: string | null;
    approved_version_number?: number | null;
    approved_date?: string | null;
    approved_by_name?: string;
    approved_by_contact?: string | null;
    approved_by_contact_name?: string | null;
    approval_method?: 'EMAIL' | 'WRITTEN' | 'VERBAL' | 'PORTAL' | 'OTHER';
    approval_notes?: string;

    // Rejection & On Hold
    rejection_reason?: string;
    rejection_notes?: string;
    rejection_date?: string | null;
    on_hold_reason?: string;
    on_hold_notes?: string;
    on_hold_date?: string | null;

    // Signing Workspace
    contract_start_date?: string | null;
    contract_end_date?: string | null;
    billing_cycle?: string;
    payment_terms?: string;
    expected_mobilization_date?: string | null;
    signed_by_client?: string;
    signed_by_company?: string;
    signing_date?: string | null;
    contract_reference?: string;
    signing_notes?: string;

    // Cross-Module Handoff (Phase S-2H)
    is_handoff_ready?: boolean;
    handoff_prepared_at?: string | null;
    handoff_prepared_by?: string | null;
    handoff_prepared_by_name?: string | null;
    handoff_notes?: string;

    // Documents & Relations
    signed_documents?: ProposalSignedDocument[];
    signed_documents_count?: number;
    meetings_count?: number;
    upcoming_meetings_count?: number;
    open_follow_ups_count?: number;
    next_action?: NextAction | null;
    created_at: string;
    updated_at: string;
}

export interface HandoffClientInfo {
    id: string | null;
    name: string;
    entity_type: string;
    email: string;
    phone: string;
    approved_contact_name: string;
    approval_method?: string;
    approved_date: string | null;
    signing_date: string | null;
    signed_by_client: string;
    signed_by_company: string;
}

export interface HandoffContractInfo {
    id: string | null;
    contract_code: string;
    status: string;
    start_date: string;
    end_date: string | null;
    billing_cycle: string;
    payment_terms: string;
    expected_mobilization_date: string | null;
    contract_reference: string;
    notes: string;
}

export interface HandoffApprovedVersionInfo {
    id: string | null;
    version_number: number;
    version_type: string;
    is_frozen: boolean;
    subtotal: string;
    discount_amount: string;
    tax_amount: string;
    grand_total: string;
}

export interface HandoffOperationalSiteInfo {
    id: string;
    name: string;
    address: string;
    is_active: boolean;
}

export interface OperationsServiceRequirement {
    line_id: string;
    service_type_id: string;
    service_type_code: string;
    service_type_name: string;
    location_id: string | null;
    location_name: string;
    operational_site_id: string | null;
    operational_site_name: string;
    quantity: number;
    billing_unit: string;
    client_rate: string;
    single_ot_rate: string;
    double_ot_rate: string;
    line_total: string;
    shift_coverage_notes: string;
    post_area: string;
    notes: string;
}

export interface OperationsHandoffData {
    module_target: string;
    readiness_status: string;
    contract_code: string;
    expected_mobilization_date: string;
    contract_start_date: string;
    contract_end_date: string | null;
    operational_sites: HandoffOperationalSiteInfo[];
    service_requirements: OperationsServiceRequirement[];
    total_guard_posts: number;
    total_operational_sites: number;
    instructions: string;
}

export interface HRMStaffingDemandItem {
    demand_id: string;
    location_id: string | null;
    location_name: string;
    operational_site_id: string | null;
    service_type_id: string;
    service_type_code: string;
    service_type_name: string;
    required_headcount: number;
    expected_start_date: string;
    shift_coverage_notes: string;
    post_area: string;
    status: string;
}

export interface HRMHandoffData {
    module_target: string;
    readiness_status: string;
    total_required_headcount: number;
    expected_deployment_date: string;
    staffing_demand: HRMStaffingDemandItem[];
    instructions: string;
}

export interface InventoryEquipmentDemandItem {
    requirement_id: string;
    inventory_item_id: string | null;
    item_name: string;
    description: string;
    location_id: string | null;
    location_name: string;
    operational_site_id: string | null;
    quantity: number;
    unit_rate: string;
    line_total: string;
    charge_type: string;
    required_date: string;
    notes: string;
    status: string;
}

export interface InventoryHandoffData {
    module_target: string;
    readiness_status: string;
    total_equipment_quantity: number;
    required_by_date: string;
    equipment_demand: InventoryEquipmentDemandItem[];
    instructions: string;
}

export interface PurchasingProcurementDemandItem {
    procurement_demand_id: string;
    item_name: string;
    required_quantity: number;
    location_name: string;
    required_by_date: string;
    charge_type: string;
    estimated_unit_cost: string;
    estimated_total_cost: string;
    status: string;
}

export interface PurchasingHandoffData {
    module_target: string;
    readiness_status: string;
    total_items_to_procure: number;
    procurement_demand: PurchasingProcurementDemandItem[];
    instructions: string;
}

export interface FinanceBillingRateItem {
    service_type: string;
    location: string;
    quantity: number;
    client_rate: string;
    single_ot_rate: string;
    double_ot_rate: string;
    billing_unit: string;
    line_total: string;
}

export interface FinanceHandoffData {
    module_target: string;
    readiness_status: string;
    billing_cycle: string;
    payment_terms: string;
    contract_start_date: string;
    contract_end_date: string | null;
    service_billing_rates: FinanceBillingRateItem[];
    additional_charges: any[];
    subtotal_monthly_recurring: string;
    total_one_time: string;
    discount_amount: string;
    tax_rate: string;
    tax_amount: string;
    grand_total: string;
    instructions: string;
}

export interface HandoffReadinessChecklist {
    crm_lifecycle_completed: boolean;
    service_contract_linked: boolean;
    operational_sites_linked: boolean;
    approved_version_locked: boolean;
    signed_documents_present: boolean;
    operations_ready: boolean;
    hr_demand_ready: boolean;
    inventory_demand_ready: boolean;
    purchasing_demand_ready: boolean;
    finance_commercial_ready: boolean;
    overall_handoff_ready: boolean;
}

export interface CrossModuleHandoffSummary {
    proposal_id: string;
    proposal_number: string;
    status: string;
    is_handoff_ready: boolean;
    handoff_prepared_at: string | null;
    handoff_prepared_by_name: string;
    handoff_notes: string;
    client: HandoffClientInfo;
    service_contract: HandoffContractInfo;
    approved_version: HandoffApprovedVersionInfo;
    operational_sites: HandoffOperationalSiteInfo[];
    operations_handoff: OperationsHandoffData;
    hrm_handoff: HRMHandoffData;
    inventory_handoff: InventoryHandoffData;
    purchasing_handoff: PurchasingHandoffData;
    finance_handoff: FinanceHandoffData;
    signed_documents: any[];
    readiness_checklist: HandoffReadinessChecklist;
}

export interface MeetingParticipant {
    id: string;
    meeting: string;
    participant_type: 'INTERNAL_USER' | 'CUSTOMER_CONTACT' | 'EXTERNAL';
    user?: string | null;
    user_name?: string | null;
    crm_contact?: string | null;
    contact_name?: string | null;
    contact_email?: string | null;
    contact_phone?: string | null;
    contact_job_title?: string | null;
    external_name?: string;
    external_email?: string;
    role?: string;
    attended: boolean;
}

export interface ProposalFollowUp {
    id: string;
    proposal: string;
    proposal_number?: string;
    related_meeting?: string | null;
    related_meeting_subject?: string | null;
    title: string;
    description: string;
    due_at: string | null;
    assigned_to: string | null;
    assigned_to_name?: string | null;
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    status: 'OPEN' | 'COMPLETED' | 'CANCELLED';
    is_overdue: boolean;
    completed_at: string | null;
    created_by?: string | null;
    created_by_name?: string | null;
    created_at: string;
    updated_at: string;
}

export interface SecurityProposalMeeting {
    id: string;
    proposal: string;
    proposal_number?: string;
    customer_name?: string;
    meeting_type: 'FACE_TO_FACE' | 'ONLINE' | 'PHONE' | 'OTHER';
    subject: string;
    scheduled_at: string;
    started_at?: string | null;
    ended_at?: string | null;
    status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
    location: string;
    meeting_link: string;
    agenda: string;
    discussion_notes: string;
    client_requirements: string;
    commercial_concerns: string;
    operational_concerns: string;
    agreed_points: string;
    pending_items: string;
    outcome: string;
    outcome_notes: string;
    completed_at?: string | null;
    created_by?: string | null;
    created_by_name?: string | null;
    participants?: MeetingParticipant[];
    follow_ups?: ProposalFollowUp[];
    participants_count?: number;
    created_at: string;
    updated_at: string;
}

// --- API Calls ---

export const getSecurityProposals = async (params: any = {}) => {
    const response = await apiClient.get('/api/security/crm/securityproposal/', { params });
    return response.data as PaginatedResponse<SecurityProposal>;
};

export const getSecurityProposal = async (id: string) => {
    const response = await apiClient.get(`/api/security/crm/securityproposal/${id}/`);
    return response.data as SecurityProposal;
};

export const createSecurityProposal = async (payload: Partial<SecurityProposal>) => {
    const response = await apiClient.post('/api/security/crm/securityproposal/', payload);
    return response.data as SecurityProposal;
};

export const updateSecurityProposal = async (id: string, payload: Partial<SecurityProposal>) => {
    const response = await apiClient.patch(`/api/security/crm/securityproposal/${id}/`, payload);
    return response.data as SecurityProposal;
};

export const getProposalVersions = async (proposalId: string) => {
    const response = await apiClient.get(`/api/security/crm/securityproposal/${proposalId}/versions/`);
    return (response.data.results || response.data) as ProposalVersion[];
};

export const createProposalVersion = async (payload: Partial<ProposalVersion>) => {
    const response = await apiClient.post('/api/security/crm/proposalversion/', payload);
    return response.data as ProposalVersion;
};

export const getServiceLines = async (versionId: string) => {
    const response = await apiClient.get('/api/security/crm/proposalserviceline/', { params: { proposal_version: versionId } });
    return response.data as PaginatedResponse<ProposalServiceLine>;
};

export const createServiceLine = async (payload: Partial<ProposalServiceLine>) => {
    const response = await apiClient.post('/api/security/crm/proposalserviceline/', payload);
    return response.data as ProposalServiceLine;
};

export const updateServiceLine = async (id: string, payload: Partial<ProposalServiceLine>) => {
    const response = await apiClient.patch(`/api/security/crm/proposalserviceline/${id}/`, payload);
    return response.data as ProposalServiceLine;
};

export const deleteServiceLine = async (id: string) => {
    const response = await apiClient.delete(`/api/security/crm/proposalserviceline/${id}/`);
    return response.data;
};

export const getClientLocations = async (customerId?: string) => {
    const params: any = {};
    if (customerId) params.customer = customerId;
    const response = await apiClient.get('/api/security/crm/clientlocation/', { params });
    return response.data as PaginatedResponse<ClientLocation>;
};

export const createClientLocation = async (payload: Partial<ClientLocation>) => {
    const response = await apiClient.post('/api/security/crm/clientlocation/', payload);
    return response.data as ClientLocation;
};

export const getSecurityServiceTypes = async () => {
    const response = await apiClient.get('/api/security/crm/securityservicetype/');
    return response.data as PaginatedResponse<SecurityServiceType>;
};

export const transitionProposalStatus = async (id: string, status: string) => {
    const response = await apiClient.post(`/api/security/crm/securityproposal/${id}/transition/`, { status });
    return response.data;
};

export const startMeetingStage = async (id: string) => {
    const response = await apiClient.post(`/api/security/crm/securityproposal/${id}/start_meeting_stage/`);
    return response.data;
};

export const advanceToSiteAssessment = async (id: string) => {
    const response = await apiClient.post(`/api/security/crm/securityproposal/${id}/advance_to_site_assessment/`);
    return response.data;
};

// --- Meeting & Follow-Up APIs ---

export const getProposalMeetings = async (proposalId: string) => {
    const response = await apiClient.get(`/api/security/crm/securityproposal/${proposalId}/meetings/`);
    return response.data as SecurityProposalMeeting[];
};

export const createProposalMeeting = async (payload: Partial<SecurityProposalMeeting> & { participants?: any[] }) => {
    const response = await apiClient.post('/api/security/crm/meetings/', payload);
    return response.data as SecurityProposalMeeting;
};

export const updateProposalMeeting = async (id: string, payload: Partial<SecurityProposalMeeting>) => {
    const response = await apiClient.patch(`/api/security/crm/meetings/${id}/`, payload);
    return response.data as SecurityProposalMeeting;
};

export const completeProposalMeeting = async (id: string, payload: any) => {
    const response = await apiClient.post(`/api/security/crm/meetings/${id}/complete/`, payload);
    return response.data as SecurityProposalMeeting;
};

export const cancelProposalMeeting = async (id: string) => {
    const response = await apiClient.post(`/api/security/crm/meetings/${id}/cancel/`);
    return response.data as SecurityProposalMeeting;
};

export const noShowProposalMeeting = async (id: string) => {
    const response = await apiClient.post(`/api/security/crm/meetings/${id}/no_show/`);
    return response.data as SecurityProposalMeeting;
};

export const addMeetingParticipant = async (meetingId: string, payload: any) => {
    const response = await apiClient.post(`/api/security/crm/meetings/${meetingId}/add_participant/`, payload);
    return response.data as MeetingParticipant;
};

export const getProposalFollowUps = async (proposalId: string) => {
    const response = await apiClient.get(`/api/security/crm/securityproposal/${proposalId}/follow_ups/`);
    return response.data as ProposalFollowUp[];
};

export const createProposalFollowUp = async (payload: Partial<ProposalFollowUp>) => {
    const response = await apiClient.post('/api/security/crm/follow-ups/', payload);
    return response.data as ProposalFollowUp;
};

export const updateProposalFollowUp = async (id: string, payload: Partial<ProposalFollowUp>) => {
    const response = await apiClient.patch(`/api/security/crm/follow-ups/${id}/`, payload);
    return response.data as ProposalFollowUp;
};

export const completeProposalFollowUp = async (id: string) => {
    const response = await apiClient.post(`/api/security/crm/follow-ups/${id}/complete/`);
    return response.data as ProposalFollowUp;
};

export const cancelProposalFollowUp = async (id: string) => {
    const response = await apiClient.post(`/api/security/crm/follow-ups/${id}/cancel/`);
    return response.data as ProposalFollowUp;
};

export const getCustomerContacts = async (customerId: string) => {
    const response = await apiClient.get('/api/crm/contacts/', { params: { entity: customerId } });
    return (response.data.results || response.data) as any[];
};

export const getCompanyUsers = async () => {
    try {
        const response = await apiClient.get('/api/platform/users/');
        return (response.data.results || response.data) as any[];
    } catch {
        return [];
    }
};

// --- Assessment Types & APIs ---

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type AssessmentStatus = 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface AssessmentRiskFinding {
    id: string;
    assessment: string;
    title: string;
    category: string;
    description: string;
    risk_level: RiskLevel;
    location_area: string;
    recommendation: string;
    status: string;
    created_at?: string;
    updated_at?: string;
}

export interface AssessmentStaffingRecommendation {
    id: string;
    assessment: string;
    service_type: string;
    service_type_name?: string;
    location?: string | null;
    location_name?: string | null;
    quantity: number;
    shift_coverage_notes: string;
    post_area: string;
    remarks: string;
    created_at?: string;
    updated_at?: string;
}

export interface AssessmentEquipmentRecommendation {
    id: string;
    assessment: string;
    equipment_name: string;
    quantity: number;
    location_area: string;
    purpose: string;
    notes: string;
    created_at?: string;
    updated_at?: string;
}

export interface AssessmentAttachment {
    id: string;
    assessment: string;
    title: string;
    category: 'SITE_PHOTO' | 'LAYOUT_DOCUMENT' | 'CLIENT_DOCUMENT' | 'EXISTING_SETUP' | 'OTHER';
    category_display?: string;
    file?: string | null;
    file_url?: string;
    notes: string;
    uploaded_by?: string | null;
    uploaded_by_name?: string | null;
    created_at?: string;
    updated_at?: string;
}

export interface SecurityAssessment {
    id: string;
    proposal: string;
    client_location: string;
    client_location_name?: string;
    client_location_address?: string;
    assessment_date: string | null;
    assessed_by: string | null;
    assessed_by_name?: string | null;
    status: AssessmentStatus;
    status_display?: string;
    site_overview: string;
    operating_hours: string;
    entry_exit_points: string;
    sensitive_areas: string;
    existing_security_setup: string;
    existing_guards: string;
    existing_cctv: string;
    access_control: string;
    visitor_management: string;
    perimeter_security: string;
    lighting_conditions: string;
    emergency_exits: string;
    fire_safety_concerns: string;
    known_risks: string;
    client_concerns: string;
    findings: string;
    recommendations: string;
    notes: string;
    completed_at?: string | null;
    completed_by?: string | null;
    completed_by_name?: string | null;
    risk_count?: number;
    staffing_count?: number;
    equipment_count?: number;
    attachment_count?: number;
    risk_findings?: AssessmentRiskFinding[];
    staffing_recommendations?: AssessmentStaffingRecommendation[];
    equipment_recommendations?: AssessmentEquipmentRecommendation[];
    attachments?: AssessmentAttachment[];
    created_at?: string;
    updated_at?: string;
}

export const getAssessments = async (proposalId?: string) => {
    const params: any = {};
    if (proposalId) params.proposal = proposalId;
    const response = await apiClient.get('/api/security/crm/assessments/', { params });
    return (response.data.results || response.data) as SecurityAssessment[];
};

export const getAssessment = async (id: string) => {
    const response = await apiClient.get(`/api/security/crm/assessments/${id}/`);
    return response.data as SecurityAssessment;
};

export const createAssessment = async (payload: Partial<SecurityAssessment>) => {
    const response = await apiClient.post('/api/security/crm/assessments/', payload);
    return response.data as SecurityAssessment;
};

export const updateAssessment = async (id: string, payload: Partial<SecurityAssessment>) => {
    const response = await apiClient.patch(`/api/security/crm/assessments/${id}/`, payload);
    return response.data as SecurityAssessment;
};

export const completeAssessment = async (id: string) => {
    const response = await apiClient.post(`/api/security/crm/assessments/${id}/complete/`);
    return response.data as SecurityAssessment;
};

export const reopenAssessment = async (id: string) => {
    const response = await apiClient.post(`/api/security/crm/assessments/${id}/reopen/`);
    return response.data as SecurityAssessment;
};

export const deleteAssessment = async (id: string) => {
    const response = await apiClient.delete(`/api/security/crm/assessments/${id}/`);
    return response.data;
};

export const addAssessmentRisk = async (assessmentId: string, payload: Partial<AssessmentRiskFinding>) => {
    const response = await apiClient.post(`/api/security/crm/assessments/${assessmentId}/add-risk/`, payload);
    return response.data as AssessmentRiskFinding;
};

export const deleteAssessmentRisk = async (riskId: string) => {
    const response = await apiClient.delete(`/api/security/crm/assessment-risks/${riskId}/`);
    return response.data;
};

export const addAssessmentStaffing = async (assessmentId: string, payload: Partial<AssessmentStaffingRecommendation>) => {
    const response = await apiClient.post(`/api/security/crm/assessments/${assessmentId}/add-staffing/`, payload);
    return response.data as AssessmentStaffingRecommendation;
};

export const deleteAssessmentStaffing = async (staffingId: string) => {
    const response = await apiClient.delete(`/api/security/crm/assessment-staffing/${staffingId}/`);
    return response.data;
};

export const addAssessmentEquipment = async (assessmentId: string, payload: Partial<AssessmentEquipmentRecommendation>) => {
    const response = await apiClient.post(`/api/security/crm/assessments/${assessmentId}/add-equipment/`, payload);
    return response.data as AssessmentEquipmentRecommendation;
};

export const deleteAssessmentEquipment = async (equipmentId: string) => {
    const response = await apiClient.delete(`/api/security/crm/assessment-equipment/${equipmentId}/`);
    return response.data;
};

export const addAssessmentAttachment = async (assessmentId: string, payload: Partial<AssessmentAttachment>) => {
    const response = await apiClient.post(`/api/security/crm/assessments/${assessmentId}/add-attachment/`, payload);
    return response.data as AssessmentAttachment;
};

export const deleteAssessmentAttachment = async (attachmentId: string) => {
    const response = await apiClient.delete(`/api/security/crm/assessment-attachments/${attachmentId}/`);
    return response.data;
};

export const advanceToFinalProposal = async (proposalId: string) => {
    const response = await apiClient.post(`/api/security/crm/securityproposal/${proposalId}/advance-to-final-proposal/`);
    return response.data;
};

export const getProposalVersion = async (versionId: string) => {
    const response = await apiClient.get(`/api/security/crm/proposalversion/${versionId}/`);
    return response.data as ProposalVersion;
};

export const updateProposalVersion = async (versionId: string, payload: Partial<ProposalVersion>) => {
    const response = await apiClient.patch(`/api/security/crm/proposalversion/${versionId}/`, payload);
    return response.data as ProposalVersion;
};

export const importAssessmentRecommendations = async (proposalId: string, data?: { version_id?: string; assessment_ids?: string[] }) => {
    const response = await apiClient.post(`/api/security/crm/securityproposal/${proposalId}/import-recommendations/`, data || {});
    return response.data as { message: string; result: { staffing_imported: number; equipment_imported: number }; version: ProposalVersion };
};

export const createFinalProposalRevision = async (proposalId: string, baseVersionId?: string) => {
    const response = await apiClient.post(`/api/security/crm/securityproposal/${proposalId}/create-final-revision/`, { base_version_id: baseVersionId });
    return response.data as { message: string; version: ProposalVersion };
};

export const createProposalServiceLine = async (payload: Partial<ProposalServiceLine>) => {
    const response = await apiClient.post('/api/security/crm/proposalserviceline/', payload);
    return response.data as ProposalServiceLine;
};

export const updateProposalServiceLine = async (id: string, payload: Partial<ProposalServiceLine>) => {
    const response = await apiClient.patch(`/api/security/crm/proposalserviceline/${id}/`, payload);
    return response.data as ProposalServiceLine;
};

export const deleteProposalServiceLine = async (id: string) => {
    const response = await apiClient.delete(`/api/security/crm/proposalserviceline/${id}/`);
    return response.data;
};

export const createContractEquipment = async (payload: Partial<ContractEquipmentRequirement>) => {
    const response = await apiClient.post('/api/security/crm/contractequipmentrequirement/', payload);
    return response.data as ContractEquipmentRequirement;
};

export const updateContractEquipment = async (id: string, payload: Partial<ContractEquipmentRequirement>) => {
    const response = await apiClient.patch(`/api/security/crm/contractequipmentrequirement/${id}/`, payload);
    return response.data as ContractEquipmentRequirement;
};

export const deleteContractEquipment = async (id: string) => {
    const response = await apiClient.delete(`/api/security/crm/contractequipmentrequirement/${id}/`);
    return response.data;
};

export const createProposalAdditionalCharge = async (payload: Partial<ProposalAdditionalCharge>) => {
    const response = await apiClient.post('/api/security/crm/proposaladditionalcharge/', payload);
    return response.data as ProposalAdditionalCharge;
};

export const updateProposalAdditionalCharge = async (id: string, payload: Partial<ProposalAdditionalCharge>) => {
    const response = await apiClient.patch(`/api/security/crm/proposaladditionalcharge/${id}/`, payload);
    return response.data as ProposalAdditionalCharge;
};

export const deleteProposalAdditionalCharge = async (id: string) => {
    const response = await apiClient.delete(`/api/security/crm/proposaladditionalcharge/${id}/`);
    return response.data;
};

export const prepareFinalProposalEmail = async (proposalId: string, versionId?: string) => {
    const url = versionId 
        ? `/api/security/crm/securityproposal/${proposalId}/prepare-final-email/?version_id=${versionId}`
        : `/api/security/crm/securityproposal/${proposalId}/prepare-final-email/`;
    const response = await apiClient.get(url);
    return response.data as { subject: string; body: string; to: string; version_id: string | null; version_number: number | null };
};

export const sendFinalProposalEmail = async (proposalId: string, payload: { email_id: string; version_id?: string; version_number?: number }) => {
    const response = await apiClient.post(`/api/security/crm/securityproposal/${proposalId}/send-final-proposal-email/`, payload);
    return response.data;
};

// -------------------------------------------------------------
// PHASE S-2G: APPROVAL, SIGNING & ACTIVATION ENDPOINTS
// -------------------------------------------------------------

export const approveProposal = async (proposalId: string, payload: {
    version_id?: string;
    approved_date?: string;
    approved_by_name?: string;
    approved_by_contact?: string;
    approval_method?: 'EMAIL' | 'WRITTEN' | 'VERBAL' | 'PORTAL' | 'OTHER';
    approval_notes?: string;
}) => {
    const response = await apiClient.post(`/api/security/crm/securityproposal/${proposalId}/approve/`, payload);
    return response.data as SecurityProposal;
};

export const rejectProposal = async (proposalId: string, payload: {
    rejection_reason?: string;
    rejection_notes?: string;
    rejection_date?: string;
}) => {
    const response = await apiClient.post(`/api/security/crm/securityproposal/${proposalId}/reject/`, payload);
    return response.data as SecurityProposal;
};

export const putProposalOnHold = async (proposalId: string, payload: {
    on_hold_reason?: string;
    on_hold_notes?: string;
    on_hold_date?: string;
}) => {
    const response = await apiClient.post(`/api/security/crm/securityproposal/${proposalId}/put-on-hold/`, payload);
    return response.data as SecurityProposal;
};

export const resumeProposalFromOnHold = async (proposalId: string, payload?: {
    target_status?: string;
}) => {
    const response = await apiClient.post(`/api/security/crm/securityproposal/${proposalId}/resume-from-on-hold/`, payload || {});
    return response.data as SecurityProposal;
};

export const startSigningStage = async (proposalId: string, payload?: {
    contract_start_date?: string;
    contract_end_date?: string;
    billing_cycle?: string;
    payment_terms?: string;
    expected_mobilization_date?: string;
    contract_reference?: string;
    signing_notes?: string;
}) => {
    const response = await apiClient.post(`/api/security/crm/securityproposal/${proposalId}/start-signing/`, payload || {});
    return response.data as SecurityProposal;
};

export const completeSigning = async (proposalId: string, payload: {
    signed_by_client: string;
    signed_by_company: string;
    signing_date?: string;
    contract_start_date?: string;
    contract_end_date?: string;
    billing_cycle?: string;
    payment_terms?: string;
    expected_mobilization_date?: string;
    contract_reference?: string;
    signing_notes?: string;
}) => {
    const response = await apiClient.post(`/api/security/crm/securityproposal/${proposalId}/complete-signing/`, payload);
    return response.data as SecurityProposal;
};

export const uploadSignedDocument = async (proposalId: string, formData: FormData) => {
    const response = await apiClient.post(
        `/api/security/crm/securityproposal/${proposalId}/upload-signed-document/`,
        formData,
        {
            headers: {
                'Content-Type': 'multipart/form-data',
            }
        }
    );
    return response.data as ProposalSignedDocument;
};

export const deleteSignedDocument = async (docId: string) => {
    const response = await apiClient.delete(`/api/security/crm/signed-documents/${docId}/`);
    return response.data;
};

export const activateClient = async (proposalId: string) => {
    const response = await apiClient.post(`/api/security/crm/securityproposal/${proposalId}/activate-client/`);
    return response.data as {
        message: string;
        proposal: SecurityProposal;
        contract_id: string | null;
        contract_code: string | null;
        sites_count: number;
    };
};

export const getHandoffSummary = async (proposalId: string) => {
    const response = await apiClient.get(`/api/security/crm/securityproposal/${proposalId}/handoff-summary/`);
    return response.data as CrossModuleHandoffSummary;
};

export const prepareCrossModuleHandoff = async (proposalId: string, notes?: string) => {
    const response = await apiClient.post(`/api/security/crm/securityproposal/${proposalId}/prepare-handoff/`, {
        notes: notes || ''
    });
    return response.data as {
        message: string;
        handoff_summary: CrossModuleHandoffSummary;
    };
};



