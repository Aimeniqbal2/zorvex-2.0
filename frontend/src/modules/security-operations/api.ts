import { apiClient } from '../../api/client';
import type { 
    SecurityOperationsSummary, 
    OperationalSite, 
    ServiceContract, 
    Deployment, 
    DutyAssignment, 
    ExtraDuty,
    EquipmentIssue,
    PaginatedResponse,
    IncidentReport,
    IncidentAttachment,
    DailyActivityReport,
    DailyActivityEntry,
    ServiceInvoice,
    SecurityPost,
    SiteManpowerSummary,
    DailyAttendanceWorkspace,
    AttendanceStatusCode,
    JumpRecordItem,
    EmployeeAttendanceHistoryItem,
    DailyDutyPayItem,
    DailyPayReviewWorkspace,
    PayrollAdditionItem,
    PayrollDeductionItem,
    EmployeePayrollCalculationItem,
    PayrollPreparationWorkspace,
    PayrollRunItem,
    OperationalPayslipItem,
    ControlCenterFilters,
    ControlCenterData,
    SecurityStoreProfile,
    SecurityItemProfile,
    SecurityStockAvailabilityItem,
    SecurityInventoryOverview,
    EquipmentIncident,
    SerializedEquipmentHistory
} from './types';

// Dashboard & Control Center
export const getSecurityOperationsSummary = async (): Promise<SecurityOperationsSummary> => {
    const response = await apiClient.get('/api/operations/dashboard/');
    return response.data;
};

export const getControlCenterData = async (filters?: ControlCenterFilters, section?: string): Promise<ControlCenterData> => {
    const params: any = { ...filters };
    if (section) params.section = section;
    const response = await apiClient.get('/api/operations/control-center/', { params });
    return response.data;
};

// Operational Sites
export const getOperationalSites = async (params?: { page?: number, search?: string, is_active?: boolean }): Promise<PaginatedResponse<OperationalSite>> => {
    const response = await apiClient.get('/api/operations/sites/', { params });
    return response.data;
};

// Security Posts
export const getSecurityPosts = async (params?: { site?: string, is_active?: boolean, page?: number }): Promise<PaginatedResponse<SecurityPost>> => {
    const response = await apiClient.get('/api/operations/posts/', { params });
    return response.data;
};

export const createSecurityPost = async (data: Partial<SecurityPost>): Promise<SecurityPost> => {
    const response = await apiClient.post('/api/operations/posts/', data);
    return response.data;
};

export const updateSecurityPost = async (id: string, data: Partial<SecurityPost>): Promise<SecurityPost> => {
    const response = await apiClient.patch(`/api/operations/posts/${id}/`, data);
    return response.data;
};

export const deleteSecurityPost = async (id: string): Promise<void> => {
    await apiClient.delete(`/api/operations/posts/${id}/`);
};

// Site Manpower Summary
export const getSiteManpowerSummary = async (siteId: string): Promise<SiteManpowerSummary> => {
    const response = await apiClient.get(`/api/operations/sites/${siteId}/manpower-summary/`);
    return response.data;
};

export const getAllSitesManpower = async (): Promise<SiteManpowerSummary[]> => {
    const response = await apiClient.get('/api/operations/deployments/site-manpower/');
    return response.data;
};

// Service Contracts
export const getServiceContracts = async (params?: { page?: number, search?: string, status?: string }): Promise<PaginatedResponse<ServiceContract>> => {
    const response = await apiClient.get('/api/operations/contracts/', { params });
    return response.data;
};

// Deployments
export const getDeployments = async (params?: { page?: number, search?: string, status?: string, site?: string, employee?: string }): Promise<PaginatedResponse<Deployment>> => {
    const response = await apiClient.get('/api/operations/deployments/', { params });
    return response.data;
};

export const getEmployeeCurrentDeployment = async (employeeId: string): Promise<Deployment | null> => {
    const response = await apiClient.get(`/api/operations/deployments/current/?employee=${employeeId}`);
    return response.data;
};

export const getEmployeeDeploymentHistory = async (employeeId: string): Promise<Deployment[]> => {
    const response = await apiClient.get(`/api/operations/deployments/employee-history/?employee=${employeeId}`);
    return response.data;
};

export const relieveDeployment = async (id: string, payload: { relieved_date?: string, relief_reason?: string }): Promise<Deployment> => {
    const response = await apiClient.post(`/api/operations/deployments/${id}/relieve/`, payload);
    return response.data;
};

export const transferDeployment = async (id: string, payload: {
    relieved_date?: string,
    relief_reason?: string,
    new_site: string,
    new_post?: string | null,
    new_contract?: string | null,
    new_designation?: string | null,
    new_start_date?: string,
    new_assignment_type?: string,
    notes?: string
}): Promise<{ old_deployment: Deployment, new_deployment: Deployment }> => {
    const response = await apiClient.post(`/api/operations/deployments/${id}/transfer/`, payload);
    return response.data;
};

export const assignDeployment = async (data: Partial<Deployment>): Promise<Deployment> => {
    const response = await apiClient.post('/api/operations/deployments/assign/', data);
    return response.data;
};

// Duty Assignments
export const getDutyAssignments = async (params?: { page?: number, search?: string, date?: string, status?: string, site?: string }): Promise<PaginatedResponse<DutyAssignment>> => {
    const response = await apiClient.get('/api/operations/duty-assignments/', { params });
    return response.data;
};

// Attendance
export const getSecurityAttendance = async (params?: { page?: number, search?: string, date?: string, status?: string }): Promise<PaginatedResponse<any>> => {
    const response = await apiClient.get('/api/operations/attendance/', { params });
    return response.data;
};

// Extra Duties
export const getExtraDuties = async (params?: { page?: number, search?: string, date?: string, status?: string }): Promise<PaginatedResponse<ExtraDuty>> => {
    const response = await apiClient.get('/api/operations/extra-duties/', { params });
    return response.data;
};

export const approveExtraDuty = async (id: string): Promise<ExtraDuty> => {
    const response = await apiClient.post(`/api/operations/extra-duties/${id}/approve/`);
    return response.data;
};

export const rejectExtraDuty = async (id: string): Promise<ExtraDuty> => {
    const response = await apiClient.post(`/api/operations/extra-duties/${id}/reject/`);
    return response.data;
};

export const processExtraDutyPayroll = async (id: string, payroll_run_id: string): Promise<any> => {
    const response = await apiClient.post(`/api/operations/extra-duties/${id}/process-payroll/`, { payroll_run_id });
    return response.data;
};

// Equipment Issues
export const getEquipmentIssues = async (params?: { page?: number, search?: string, status?: string }): Promise<PaginatedResponse<EquipmentIssue>> => {
    const response = await apiClient.get('/api/operations/equipment-issues/', { params });
    return response.data;
};

export const returnEquipment = async (id: string, return_condition: string, notes: string): Promise<EquipmentIssue> => {
    const response = await apiClient.post(`/api/operations/equipment-issues/${id}/return/`, { return_condition, notes });
    return response.data;
};

// ---------------------------------------------------------------------------
// Phase S-6: Security Inventory & Store Endpoints
// ---------------------------------------------------------------------------
export const getSecurityInventoryOverview = async (): Promise<SecurityInventoryOverview> => {
    const response = await apiClient.get('/api/operations/security-inventory/overview/');
    return response.data;
};

export const getSecurityStores = async (): Promise<{ stores: SecurityStoreProfile[]; all_warehouses: Array<{ id: string; name: string; code: string }> }> => {
    const response = await apiClient.get('/api/operations/security-inventory/stores/');
    return response.data;
};

export const createSecurityStore = async (data: any): Promise<SecurityStoreProfile> => {
    const response = await apiClient.post('/api/operations/security-inventory/stores/', data);
    return response.data;
};

export const getSecurityStockAvailability = async (params?: {
    warehouse_id?: string;
    category?: string;
    site_id?: string;
    employee_id?: string;
    is_controlled?: boolean | string;
    is_serialized?: boolean | string;
    search?: string;
}): Promise<SecurityStockAvailabilityItem[]> => {
    const response = await apiClient.get('/api/operations/security-inventory/stock-availability/', { params });
    return response.data;
};

export const issueSecurityEquipment = async (data: {
    store_id: string;
    item_id: string;
    custody_type?: 'EMPLOYEE' | 'SITE';
    employee_id?: string | null;
    site_id?: string | null;
    serial_number?: string | null;
    quantity?: number;
    expected_return_date?: string | null;
    purpose?: string;
    condition?: string;
    notes?: string;
    authorization_code?: string;
}): Promise<EquipmentIssue> => {
    const response = await apiClient.post('/api/operations/security-inventory/issue/', data);
    return response.data;
};

export const returnSecurityEquipment = async (data: {
    issue_id: string;
    store_id: string;
    condition?: string;
    notes?: string;
    authorization_code?: string;
}): Promise<EquipmentIssue> => {
    const response = await apiClient.post('/api/operations/security-inventory/return/', data);
    return response.data;
};

export const transferSecurityStoreStock = async (data: {
    from_store_id: string;
    to_store_id: string;
    item_id: string;
    quantity: number;
    serial_numbers?: string[];
    notes?: string;
    authorization_code?: string;
}): Promise<{ status: string; movement_id: string; reference: string; quantity: number }> => {
    const response = await apiClient.post('/api/operations/security-inventory/transfer/', data);
    return response.data;
};

export const reportEquipmentIncident = async (data: {
    incident_type: 'LOST' | 'DAMAGED' | 'UNUSABLE';
    issue_id?: string | null;
    store_id?: string | null;
    item_id?: string | null;
    serial_number?: string | null;
    quantity?: number;
    incident_date?: string | null;
    condition_on_incident?: string;
    notes?: string;
    damage_severity?: string;
}): Promise<EquipmentIncident> => {
    const response = await apiClient.post('/api/operations/security-inventory/report-incident/', data);
    return response.data;
};

export const resolveEquipmentIncident = async (incidentId: string, data: {
    status: string;
    resolution_notes: string;
    approved_write_off?: boolean;
    recommended_payroll_deduction?: number;
    deduction_notes?: string;
}): Promise<EquipmentIncident> => {
    const response = await apiClient.post(`/api/operations/security-inventory/resolve-incident/${incidentId}/`, data);
    return response.data;
};

export const getEquipmentIncidents = async (params?: {
    status?: string;
    incident_type?: string;
    item_id?: string;
    employee_id?: string;
    site_id?: string;
}): Promise<EquipmentIncident[]> => {
    const response = await apiClient.get('/api/operations/security-inventory/incidents/', { params });
    return response.data;
};

export const getEmployeeEquipmentCustody = async (employeeId: string): Promise<{
    employee_id: string;
    employee_name: string;
    employee_code: string;
    active_custody: any[];
    returned_history: any[];
    incidents: any[];
}> => {
    const response = await apiClient.get(`/api/operations/security-inventory/employee-custody/${employeeId}/`);
    return response.data;
};

export const getSiteEquipment = async (siteId: string): Promise<{
    site_id: string;
    site_name: string;
    assigned_equipment: any[];
    site_store_stock: any[];
}> => {
    const response = await apiClient.get(`/api/operations/security-inventory/site-equipment/${siteId}/`);
    return response.data;
};

export const getSerializedEquipmentHistory = async (serial: string): Promise<SerializedEquipmentHistory> => {
    const response = await apiClient.get(`/api/operations/security-inventory/serialized-history/${encodeURIComponent(serial)}/`);
    return response.data;
};

export const getSecurityItemProfiles = async (): Promise<{ profiles: SecurityItemProfile[]; items: Array<{ id: string; name: string; code: string; is_serialized: boolean }> }> => {
    const response = await apiClient.get('/api/operations/security-inventory/item-profiles/');
    return response.data;
};

export const saveSecurityItemProfile = async (data: any): Promise<SecurityItemProfile> => {
    const response = await apiClient.post('/api/operations/security-inventory/item-profiles/', data);
    return response.data;
};

// ---------------------------------------------------------------------------
// Incidents
// ---------------------------------------------------------------------------
export const getIncidents = async (params?: { page?: number, search?: string, site?: string, status?: string, severity?: string }): Promise<PaginatedResponse<IncidentReport>> => {
    const response = await apiClient.get('/api/operations/incidents/', { params });
    return response.data;
};

export const getIncident = async (id: string): Promise<IncidentReport> => {
    const response = await apiClient.get(`/api/operations/incidents/${id}/`);
    return response.data;
};

export const createIncident = async (data: Partial<IncidentReport>): Promise<IncidentReport> => {
    const response = await apiClient.post('/api/operations/incidents/', data);
    return response.data;
};

export const reviewIncident = async (id: string, status: string, resolution: string): Promise<IncidentReport> => {
    const response = await apiClient.post(`/api/operations/incidents/${id}/review/`, { status, resolution });
    return response.data;
};

export const getIncidentAttachments = async (params?: { incident?: string }): Promise<PaginatedResponse<IncidentAttachment>> => {
    const response = await apiClient.get('/api/operations/incident-attachments/', { params });
    return response.data;
};

export const uploadIncidentAttachment = async (formData: FormData): Promise<IncidentAttachment> => {
    const response = await apiClient.post('/api/operations/incident-attachments/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
};

export const downloadIncidentAttachment = async (id: string): Promise<Blob> => {
    const response = await apiClient.get(`/api/operations/incident-attachments/${id}/download/`, {
        responseType: 'blob'
    });
    return response.data;
};

// ---------------------------------------------------------------------------
// Daily Activity Reports
// ---------------------------------------------------------------------------
export const getDailyActivityReports = async (params?: { page?: number, search?: string, site?: string, status?: string, report_date?: string }): Promise<PaginatedResponse<DailyActivityReport>> => {
    const response = await apiClient.get('/api/operations/daily-activity-reports/', { params });
    return response.data;
};

export const getDailyActivityReport = async (id: string): Promise<DailyActivityReport> => {
    const response = await apiClient.get(`/api/operations/daily-activity-reports/${id}/`);
    return response.data;
};

export const createDailyActivityReport = async (data: Partial<DailyActivityReport>): Promise<DailyActivityReport> => {
    const response = await apiClient.post('/api/operations/daily-activity-reports/', data);
    return response.data;
};

export const submitDailyActivityReport = async (id: string): Promise<DailyActivityReport> => {
    const response = await apiClient.post(`/api/operations/daily-activity-reports/${id}/submit/`);
    return response.data;
};

export const reviewDailyActivityReport = async (id: string): Promise<DailyActivityReport> => {
    const response = await apiClient.post(`/api/operations/daily-activity-reports/${id}/review/`);
    return response.data;
};

export const getDailyActivityEntries = async (params?: { report?: string }): Promise<PaginatedResponse<DailyActivityEntry>> => {
    const response = await apiClient.get('/api/operations/activity-entries/', { params });
    return response.data;
};

export const createDailyActivityEntry = async (data: Partial<DailyActivityEntry>): Promise<DailyActivityEntry> => {
    const response = await apiClient.post('/api/operations/activity-entries/', data);
    return response.data;
};

// ---------------------------------------------------------------------------
// Phase S-8: Security Billing
// ---------------------------------------------------------------------------
export const getServiceInvoices = async (params?: { page?: number, search?: string, service_contract?: string, status?: string }): Promise<PaginatedResponse<ServiceInvoice>> => {
    const response = await apiClient.get('/api/billing/service-invoices/', { params });
    return response.data;
};

export const getServiceInvoice = async (id: string): Promise<ServiceInvoice> => {
    const response = await apiClient.get(`/api/billing/service-invoices/${id}/`);
    return response.data;
};

export const generateServiceInvoice = async (data: { service_contract_id: string, period_start: string, period_end: string, tax_code_id?: string }): Promise<any> => {
    const response = await apiClient.post('/api/billing/service-invoices/generate/', data);
    return response.data;
};

export const postServiceInvoice = async (id: string): Promise<any> => {
    const response = await apiClient.post(`/api/billing/service-invoices/${id}/post/`);
    return response.data;
};

export const cancelServiceInvoice = async (id: string): Promise<any> => {
    const response = await apiClient.post(`/api/billing/service-invoices/${id}/cancel/`);
    return response.data;
};

// ---------------------------------------------------------------------------
// Phase S-9: Temporary Services
// ---------------------------------------------------------------------------
import type { TemporaryServiceRequest } from './types';

export const getTemporaryServices = async (params?: Record<string, any>): Promise<PaginatedResponse<TemporaryServiceRequest>> => {
    const response = await apiClient.get('/api/operations/temporary-services/', { params });
    return response.data;
};

export const getTemporaryService = async (id: string): Promise<TemporaryServiceRequest> => {
    const response = await apiClient.get(`/api/operations/temporary-services/${id}/`);
    return response.data;
};

export const createTemporaryService = async (data: Partial<TemporaryServiceRequest>): Promise<TemporaryServiceRequest> => {
    const response = await apiClient.post('/api/operations/temporary-services/', data);
    return response.data;
};

export const updateTemporaryService = async (id: string, data: Partial<TemporaryServiceRequest>): Promise<TemporaryServiceRequest> => {
    const response = await apiClient.patch(`/api/operations/temporary-services/${id}/`, data);
    return response.data;
};

export const actionTemporaryService = async (id: string, action: string, data: any = {}): Promise<any> => {
    const response = await apiClient.post(`/api/operations/temporary-services/${id}/${action}/`, data);
    return response.data;
};

// ---------------------------------------------------------------------------
// Phase S-10: Quality Assurance
// ---------------------------------------------------------------------------
import type { QAInspection, QAChecklistTemplate, QAFinding, CorrectiveAction } from './types';

export const getQAInspections = async (params?: { page?: number, search?: string, status?: string }): Promise<PaginatedResponse<QAInspection>> => {
    const response = await apiClient.get('/api/operations/qa-inspections/', { params });
    return response.data;
};

export const getQAInspection = async (id: string): Promise<QAInspection> => {
    const response = await apiClient.get(`/api/operations/qa-inspections/${id}/`);
    return response.data;
};

export const createQAInspection = async (data: Partial<QAInspection>): Promise<QAInspection> => {
    const response = await apiClient.post('/api/operations/qa-inspections/', data);
    return response.data;
};

export const updateQAInspection = async (id: string, data: Partial<QAInspection>): Promise<QAInspection> => {
    const response = await apiClient.patch(`/api/operations/qa-inspections/${id}/`, data);
    return response.data;
};

export const submitQAInspection = async (id: string): Promise<QAInspection> => {
    const response = await apiClient.post(`/api/operations/qa-inspections/${id}/submit/`);
    return response.data;
};

export const getQATemplates = async (): Promise<QAChecklistTemplate[]> => {
    const response = await apiClient.get('/api/operations/qa-templates/');
    return response.data.results || response.data;
};

export const createQAFinding = async (data: Partial<QAFinding>): Promise<QAFinding> => {
    const response = await apiClient.post('/api/operations/qa-findings/', data);
    return response.data;
};

export const updateQAFinding = async (id: string, data: Partial<QAFinding>): Promise<QAFinding> => {
    const response = await apiClient.patch(`/api/operations/qa-findings/${id}/`, data);
    return response.data;
};

export const getCorrectiveActions = async (params?: { finding?: string }): Promise<PaginatedResponse<CorrectiveAction>> => {
    const response = await apiClient.get('/api/operations/corrective-actions/', { params });
    return response.data;
};

export const createCorrectiveAction = async (data: Partial<CorrectiveAction>): Promise<CorrectiveAction> => {
    const response = await apiClient.post('/api/operations/corrective-actions/', data);
    return response.data;
};

export const updateCorrectiveAction = async (id: string, data: Partial<CorrectiveAction>): Promise<CorrectiveAction> => {
    const response = await apiClient.patch(`/api/operations/corrective-actions/${id}/`, data);
    return response.data;
};

export const resolveCorrectiveAction = async (id: string): Promise<CorrectiveAction> => {
    const response = await apiClient.post(`/api/operations/corrective-actions/${id}/resolve/`);
    return response.data;
};

export const verifyCorrectiveAction = async (id: string, notes: string): Promise<CorrectiveAction> => {
    const response = await apiClient.post(`/api/operations/corrective-actions/${id}/verify/`, { notes });
    return response.data;
};

// ---------------------------------------------------------------------------
// Phase S-5C API: Shifts, Post Requirements, Roster, Coverage & Replacement
// ---------------------------------------------------------------------------
import type { 
    Shift, PostShiftRequirement, DutyRoster, DutyReplacement,
    SiteCoverageSummary, SiteRangeCoverageSummary 
} from './types';

export const getShifts = async (params?: { is_active?: boolean }): Promise<Shift[]> => {
    const response = await apiClient.get('/api/hrm/shifts/', { params });
    return response.data.results || (Array.isArray(response.data) ? response.data : []);
};

export const createShift = async (data: Partial<Shift>): Promise<Shift> => {
    const response = await apiClient.post('/api/hrm/shifts/', data);
    return response.data;
};

export const updateShift = async (id: string, data: Partial<Shift>): Promise<Shift> => {
    const response = await apiClient.patch(`/api/hrm/shifts/${id}/`, data);
    return response.data;
};

export const deleteShift = async (id: string): Promise<void> => {
    await apiClient.delete(`/api/hrm/shifts/${id}/`);
};

export const getPostShiftRequirements = async (params?: { post?: string, shift?: string, site?: string }): Promise<PostShiftRequirement[]> => {
    const response = await apiClient.get('/api/operations/post-shift-requirements/', { params });
    return response.data.results || (Array.isArray(response.data) ? response.data : []);
};

export const createPostShiftRequirement = async (data: Partial<PostShiftRequirement>): Promise<PostShiftRequirement> => {
    const response = await apiClient.post('/api/operations/post-shift-requirements/', data);
    return response.data;
};

export const updatePostShiftRequirement = async (id: string, data: Partial<PostShiftRequirement>): Promise<PostShiftRequirement> => {
    const response = await apiClient.patch(`/api/operations/post-shift-requirements/${id}/`, data);
    return response.data;
};

export const deletePostShiftRequirement = async (id: string): Promise<void> => {
    await apiClient.delete(`/api/operations/post-shift-requirements/${id}/`);
};

export const getDutyRosters = async (params?: { 
    site?: string, post?: string, shift?: string, employee?: string, 
    date?: string, duty_date?: string, duty_date_after?: string, duty_date_before?: string,
    date_from?: string, date_to?: string, status?: string, 
    is_replacement?: boolean, page_size?: number 
}): Promise<DutyRoster[]> => {
    const response = await apiClient.get('/api/operations/duty-rosters/', { params });
    return response.data.results || (Array.isArray(response.data) ? response.data : []);
};

export const createDutyRoster = async (data: Partial<DutyRoster>): Promise<DutyRoster> => {
    const response = await apiClient.post('/api/operations/duty-rosters/', data);
    return response.data;
};

export const updateDutyRoster = async (id: string, data: Partial<DutyRoster>): Promise<DutyRoster> => {
    const response = await apiClient.patch(`/api/operations/duty-rosters/${id}/`, data);
    return response.data;
};

export const deleteDutyRoster = async (id: string): Promise<void> => {
    await apiClient.delete(`/api/operations/duty-rosters/${id}/`);
};

export const getSiteCoverageSummary = async (siteId: string, dutyDate?: string, shiftId?: string): Promise<SiteCoverageSummary> => {
    const params: Record<string, string> = { site: siteId };
    if (dutyDate) params.date = dutyDate;
    if (shiftId) params.shift = shiftId;
    const response = await apiClient.get('/api/operations/duty-rosters/coverage-summary/', { params });
    return response.data;
};

export const getSiteRangeCoverage = async (siteId: string, startDate?: string, endDate?: string): Promise<SiteRangeCoverageSummary> => {
    const params: Record<string, string> = { site: siteId };
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    const response = await apiClient.get('/api/operations/duty-rosters/range-coverage/', { params });
    return response.data;
};

export const assignDutyReplacement = async (data: {
    original_roster_id: string;
    replacement_employee_id: string;
    reason: string;
    notes?: string;
}): Promise<{ message: string; replacement_id: string; new_roster_id: string; original_roster_id: string }> => {
    const response = await apiClient.post('/api/operations/duty-rosters/assign-replacement/', data);
    return response.data;
};

export const swapDutyRoster = async (data: {
    roster_a_id: string;
    roster_b_id: string;
    reason?: string;
}): Promise<{ message: string; swap_id: string }> => {
    const response = await apiClient.post('/api/operations/duty-rosters/swap-duty/', data);
    return response.data;
};

export const bulkGenerateDutyRoster = async (data: {
    site_id: string;
    duty_date: string;
    shift_id: string;
    overwrite_existing?: boolean;
}): Promise<{ message: string; created_count: number; skipped_count: number }> => {
    const response = await apiClient.post('/api/operations/duty-rosters/bulk-generate/', data);
    return response.data;
};

export const getEmployeeRosterHistory = async (employeeId: string, dateFrom?: string, dateTo?: string): Promise<DutyRoster[]> => {
    const params: Record<string, string> = { employee: employeeId };
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    const response = await apiClient.get('/api/operations/duty-rosters/by-employee/', { params });
    return response.data;
};

export const getDutyReplacements = async (params?: { site?: string, date?: string }): Promise<DutyReplacement[]> => {
    const response = await apiClient.get('/api/operations/duty-replacements/', { params });
    return response.data.results || (Array.isArray(response.data) ? response.data : []);
};

// ---------------------------------------------------------------------------
// Phase S-5D: Attendance, Leave & JUMP APIs
// ---------------------------------------------------------------------------

export const getDailyAttendanceWorkspace = async (params: {
    date?: string;
    classification?: string;
    site?: string;
    search?: string;
    status?: string;
}): Promise<DailyAttendanceWorkspace> => {
    const response = await apiClient.get('/api/operations/attendance/daily-view/', { params });
    return response.data;
};

export const setAttendanceStatus = async (data: {
    employee_id: string;
    date: string;
    status: AttendanceStatusCode;
    notes?: string;
    is_finalized?: boolean;
}): Promise<{ message: string; attendance: Record<string, any> }> => {
    const response = await apiClient.post('/api/operations/attendance/set-status/', data);
    return response.data;
};

export const bulkSetAttendance = async (data: {
    employee_ids: string[];
    date: string;
    status: AttendanceStatusCode;
    notes?: string;
    is_finalized?: boolean;
}): Promise<{ message: string; updated_count: number }> => {
    const response = await apiClient.post('/api/operations/attendance/bulk-set/', data);
    return response.data;
};

export const applyLeaveRange = async (data: {
    employee_id: string;
    leave_type: 'PAID_LEAVE' | 'UNPAID_LEAVE';
    start_date: string;
    end_date: string;
    reason?: string;
    notes?: string;
}): Promise<{ message: string; days_count: number; leave_request_id: string }> => {
    const response = await apiClient.post('/api/operations/attendance/apply-leave/', data);
    return response.data;
};

export const getJumpRecords = async (params?: {
    status?: string;
    employee?: string;
}): Promise<JumpRecordItem[]> => {
    const response = await apiClient.get('/api/operations/attendance/jumps/', { params });
    return response.data.results || (Array.isArray(response.data) ? response.data : []);
};

export const restoreEmployeeFromJump = async (data: {
    employee_id: string;
    restore_date?: string;
    notes?: string;
}): Promise<{ message: string; employee_id: string; employment_status: string }> => {
    const response = await apiClient.post('/api/operations/attendance/restore-jump/', data);
    return response.data;
};

export const evaluateEmployeeJump = async (data: {
    employee_id: string;
    reference_date?: string;
}): Promise<{
    employee_id: string;
    consecutive_absent_days: number;
    jump_triggered: boolean;
    employment_status: string;
}> => {
    const response = await apiClient.post('/api/operations/attendance/evaluate-jump/', data);
    return response.data;
};

export const getEmployeeAttendanceHistory = async (
    employeeId: string,
    dateFrom?: string,
    dateTo?: string
): Promise<EmployeeAttendanceHistoryItem[]> => {
    const params: Record<string, string> = { employee: employeeId };
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    const response = await apiClient.get('/api/operations/attendance/by-employee/', { params });
    return response.data;
};

// ==========================================
// Phase S-5E: Daily Duty Pay & Temporary Assignment Pay
// ==========================================

export const getDailyPayReviewWorkspace = async (params?: {
    duty_date?: string;
    start_date?: string;
    end_date?: string;
    classification?: string;
    site_id?: string;
    unresolved_only?: boolean;
    replacement_only?: boolean;
    search?: string;
}): Promise<DailyPayReviewWorkspace> => {
    const response = await apiClient.get('/api/operations/daily-duty-pay/review-workspace/', { params });
    return response.data;
};

export const generateDailyDutyPay = async (data: {
    employee_id: string;
    duty_date: string;
    force_recalculate?: boolean;
}): Promise<DailyDutyPayItem> => {
    const response = await apiClient.post('/api/operations/daily-duty-pay/generate/', data);
    return response.data;
};

export const bulkGenerateDailyDutyPay = async (data: {
    start_date: string;
    end_date: string;
    employee_ids?: string[];
}): Promise<{
    message: string;
    total_processed: number;
    created_count: number;
    updated_count: number;
    unresolved_count: number;
    date_range: { start_date: string; end_date: string };
}> => {
    const response = await apiClient.post('/api/operations/daily-duty-pay/bulk-generate/', data);
    return response.data;
};

export const recalculateDailyDutyPay = async (data: {
    daily_duty_pay_id: string;
}): Promise<DailyDutyPayItem> => {
    const response = await apiClient.post('/api/operations/daily-duty-pay/recalculate/', data);
    return response.data;
};

export const getUnresolvedDailyPay = async (): Promise<DailyDutyPayItem[]> => {
    const response = await apiClient.get('/api/operations/daily-duty-pay/unresolved/');
    return response.data.results || (Array.isArray(response.data) ? response.data : []);
};

export const getReplacementDailyPay = async (params?: {
    duty_date?: string;
}): Promise<DailyDutyPayItem[]> => {
    const response = await apiClient.get('/api/operations/daily-duty-pay/replacements/', { params });
    return response.data.results || (Array.isArray(response.data) ? response.data : []);
};

export const getEmployeeDailyPayHistory = async (
    employeeId: string,
    dateFrom?: string,
    dateTo?: string
): Promise<DailyDutyPayItem[]> => {
    const params: Record<string, string> = { employee: employeeId };
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    const response = await apiClient.get('/api/operations/daily-duty-pay/by-employee/', { params });
    return response.data;
};

// ---------------------------------------------------------------------------
// Phase S-5F: Payroll Rules, Statutory Deductions & Compensation APIs
// ---------------------------------------------------------------------------

export const getPayrollPreparationWorkspace = async (params?: {
    period_start?: string;
    period_end?: string;
    status?: string;
    classification?: string;
    search?: string;
}): Promise<PayrollPreparationWorkspace> => {
    const response = await apiClient.get('/api/operations/payroll-calculations/preparation-workspace/', { params });
    return response.data;
};

export const calculateEmployeePayroll = async (data: {
    employee_id: string;
    period_start: string;
    period_end: string;
    force_recalculate?: boolean;
}): Promise<EmployeePayrollCalculationItem> => {
    const response = await apiClient.post('/api/operations/payroll-calculations/calculate-employee/', data);
    return response.data;
};

export const calculatePeriodPayroll = async (data: {
    period_start: string;
    period_end: string;
    employee_ids?: string[];
}): Promise<{
    message: string;
    period_start: string;
    period_end: string;
    total_calculated: number;
    calculated_count: number;
    blocked_count: number;
}> => {
    const response = await apiClient.post('/api/operations/payroll-calculations/calculate-period/', data);
    return response.data;
};

export const markCalculationReady = async (data: {
    calculation_id: string;
}): Promise<EmployeePayrollCalculationItem> => {
    const response = await apiClient.post('/api/operations/payroll-calculations/mark-ready/', data);
    return response.data;
};

export const getPayrollCalculationDetail = async (id: string): Promise<EmployeePayrollCalculationItem> => {
    const response = await apiClient.get(`/api/operations/payroll-calculations/${id}/`);
    return response.data;
};

// Payroll Additions
export const getPayrollAdditions = async (params?: {
    employee?: string;
    addition_type?: string;
    frequency?: string;
    is_active?: boolean;
    page?: number;
}): Promise<PaginatedResponse<PayrollAdditionItem>> => {
    const response = await apiClient.get('/api/operations/payroll-additions/', { params });
    return response.data;
};

export const createPayrollAddition = async (data: Partial<PayrollAdditionItem>): Promise<PayrollAdditionItem> => {
    const response = await apiClient.post('/api/operations/payroll-additions/', data);
    return response.data;
};

export const deletePayrollAddition = async (id: string): Promise<void> => {
    await apiClient.delete(`/api/operations/payroll-additions/${id}/`);
};

// Payroll Deductions
export const getPayrollDeductions = async (params?: {
    employee?: string;
    deduction_type?: string;
    frequency?: string;
    is_active?: boolean;
    page?: number;
}): Promise<PaginatedResponse<PayrollDeductionItem>> => {
    const response = await apiClient.get('/api/operations/payroll-deductions/', { params });
    return response.data;
};

export const createPayrollDeduction = async (data: Partial<PayrollDeductionItem>): Promise<PayrollDeductionItem> => {
    const response = await apiClient.post('/api/operations/payroll-deductions/', data);
    return response.data;
};

export const deletePayrollDeduction = async (id: string): Promise<void> => {
    await apiClient.delete(`/api/operations/payroll-deductions/${id}/`);
};

// ---------------------------------------------------------------------------
// Phase S-5G: Payroll Run, Payslips, Approval & Finance Handoff
// ---------------------------------------------------------------------------

export const getPayrollRuns = async (params?: {
    period_start?: string;
    period_end?: string;
    status?: string;
    search?: string;
}): Promise<PayrollRunItem[]> => {
    const response = await apiClient.get('/api/operations/payroll-runs/', { params });
    // Handles array or paginated response
    return Array.isArray(response.data) ? response.data : (response.data.results || []);
};

export const getPayrollRunDetail = async (id: string): Promise<PayrollRunItem> => {
    const response = await apiClient.get(`/api/operations/payroll-runs/${id}/`);
    return response.data;
};

export const createPayrollRunFromReady = async (data: {
    period_start: string;
    period_end: string;
    run_number?: string;
    payroll_month?: string;
    calculation_ids?: string[];
}): Promise<PayrollRunItem> => {
    const response = await apiClient.post('/api/operations/payroll-runs/create-from-ready/', data);
    return response.data;
};

export const submitPayrollRunForReview = async (id: string): Promise<{ status: string; message: string; run: PayrollRunItem }> => {
    const response = await apiClient.post(`/api/operations/payroll-runs/${id}/submit-for-review/`);
    return response.data;
};

export const approvePayrollRun = async (id: string): Promise<{ status: string; message: string; run: PayrollRunItem }> => {
    const response = await apiClient.post(`/api/operations/payroll-runs/${id}/approve/`);
    return response.data;
};

export const finalizePayrollRun = async (id: string): Promise<{
    status: string;
    message: string;
    run: PayrollRunItem;
    advances_settled_count: number;
    finance_integration: any;
}> => {
    const response = await apiClient.post(`/api/operations/payroll-runs/${id}/finalize/`);
    return response.data;
};

export const cancelPayrollRun = async (id: string, reason?: string): Promise<{ status: string; message: string }> => {
    const response = await apiClient.post(`/api/operations/payroll-runs/${id}/cancel/`, { reason });
    return response.data;
};

export const getPayrollRunPayslips = async (id: string): Promise<OperationalPayslipItem[]> => {
    const response = await apiClient.get(`/api/operations/payroll-runs/${id}/payslips/`);
    return response.data.results || response.data;
};

export const getPayrollRunFinanceStatus = async (id: string): Promise<{
    payroll_run_id: string;
    run_number: string;
    status: string;
    finance_integrated: boolean;
    integration_id: string | null;
    journal_entry_id: string | null;
    payment_batch_id: string | null;
    integration_status: string;
    details: any;
}> => {
    const response = await apiClient.get(`/api/operations/payroll-runs/${id}/finance-status/`);
    return response.data;
};

export const getPayslipDetail = async (id: string): Promise<OperationalPayslipItem> => {
    const response = await apiClient.get(`/api/operations/payslips/${id}/detail-snapshot/`);
    return response.data;
};


// ==============================================================================
// PHASE S-7: ADVANCED SECURITY OPERATIONS API
// ==============================================================================

import type {
    DailyOccurrenceLog, SiteCheckpoint, PatrolPlan, PatrolRun,
    GuardTour, GuardTourEvent, EmergencyEvent, SupervisorInspection,
    OperationsEscalation, ControlRoomQueueResponse, AdvancedOpsDashboardResponse,
    GeofenceValidationResponse
} from './types';

export const getControlRoomQueue = async (): Promise<ControlRoomQueueResponse> => {
    const response = await apiClient.get('/api/operations/advanced-ops/control-room/');
    return response.data;
};

export const getAdvancedOpsDashboard = async (): Promise<AdvancedOpsDashboardResponse> => {
    const response = await apiClient.get('/api/operations/advanced-ops/dashboard/');
    return response.data;
};

export const validateGeofence = async (payload: { site_id: string; latitude?: number; longitude?: number }): Promise<GeofenceValidationResponse> => {
    const response = await apiClient.post('/api/operations/advanced-ops/geofence-validate/', payload);
    return response.data;
};

// Daily Occurrence Book (DOB)
export const getDailyOccurrenceLogs = async (params?: { site?: string; entry_type?: string; is_flagged?: boolean }): Promise<DailyOccurrenceLog[]> => {
    const response = await apiClient.get('/api/operations/occurrence-logs/', { params });
    return response.data.results || (Array.isArray(response.data) ? response.data : []);
};

export const createDailyOccurrenceLog = async (data: Partial<DailyOccurrenceLog>): Promise<DailyOccurrenceLog> => {
    const response = await apiClient.post('/api/operations/occurrence-logs/', data);
    return response.data;
};

// Site Checkpoints
export const getSiteCheckpoints = async (params?: { site?: string; is_active?: boolean }): Promise<SiteCheckpoint[]> => {
    const response = await apiClient.get('/api/operations/checkpoints/', { params });
    return response.data.results || (Array.isArray(response.data) ? response.data : []);
};

export const createSiteCheckpoint = async (data: Partial<SiteCheckpoint>): Promise<SiteCheckpoint> => {
    const response = await apiClient.post('/api/operations/checkpoints/', data);
    return response.data;
};

export const updateSiteCheckpoint = async (id: string, data: Partial<SiteCheckpoint>): Promise<SiteCheckpoint> => {
    const response = await apiClient.patch(`/api/operations/checkpoints/${id}/`, data);
    return response.data;
};

// Patrol Plans & Runs
export const getPatrolPlans = async (params?: { site?: string; is_active?: boolean }): Promise<PatrolPlan[]> => {
    const response = await apiClient.get('/api/operations/patrol-plans/', { params });
    return response.data.results || (Array.isArray(response.data) ? response.data : []);
};

export const createPatrolPlan = async (data: Partial<PatrolPlan>): Promise<PatrolPlan> => {
    const response = await apiClient.post('/api/operations/patrol-plans/', data);
    return response.data;
};

export const getPatrolRuns = async (params?: { site?: string; status?: string; plan?: string }): Promise<PatrolRun[]> => {
    const response = await apiClient.get('/api/operations/patrol-runs/', { params });
    return response.data.results || (Array.isArray(response.data) ? response.data : []);
};

export const schedulePatrolRun = async (data: Partial<PatrolRun>): Promise<PatrolRun> => {
    const response = await apiClient.post('/api/operations/patrol-runs/', data);
    return response.data;
};

export const completePatrolRun = async (id: string, data: { status: string; completion_notes?: string }): Promise<PatrolRun> => {
    const response = await apiClient.post(`/api/operations/patrol-runs/${id}/complete/`, data);
    return response.data;
};

// Guard Tours & Verification
export const getGuardTours = async (params?: { site?: string; status?: string }): Promise<GuardTour[]> => {
    const response = await apiClient.get('/api/operations/guard-tours/', { params });
    return response.data.results || (Array.isArray(response.data) ? response.data : []);
};

export const startGuardTour = async (data: Partial<GuardTour>): Promise<GuardTour> => {
    const response = await apiClient.post('/api/operations/guard-tours/', data);
    return response.data;
};

export const verifyCheckpoint = async (tourId: string, data: {
    checkpoint_id: string;
    verification_source?: string;
    latitude?: number | null;
    longitude?: number | null;
    accuracy_meters?: number | null;
    notes?: string;
}): Promise<GuardTourEvent> => {
    const response = await apiClient.post(`/api/operations/guard-tours/${tourId}/verify-checkpoint/`, data);
    return response.data;
};

export const completeGuardTour = async (tourId: string, data?: { notes?: string }): Promise<GuardTour> => {
    const response = await apiClient.post(`/api/operations/guard-tours/${tourId}/complete/`, data || {});
    return response.data;
};

// Emergency / SOS
export const getEmergencyEvents = async (params?: { site?: string; status?: string; event_type?: string }): Promise<EmergencyEvent[]> => {
    const response = await apiClient.get('/api/operations/emergency-events/', { params });
    return response.data.results || (Array.isArray(response.data) ? response.data : []);
};

export const triggerEmergency = async (data: {
    site_id: string;
    post_id?: string | null;
    employee_id?: string | null;
    event_type?: string;
    severity?: string;
    description?: string;
    latitude?: number | null;
    longitude?: number | null;
    accuracy_meters?: number | null;
}): Promise<EmergencyEvent> => {
    const response = await apiClient.post('/api/operations/emergency-events/trigger/', data);
    return response.data;
};

export const acknowledgeEmergency = async (id: string, data: { responder_id?: number | null; response_notes?: string }): Promise<EmergencyEvent> => {
    const response = await apiClient.post(`/api/operations/emergency-events/${id}/acknowledge/`, data);
    return response.data;
};

export const resolveEmergency = async (id: string, data: { resolution_summary: string; is_false_alarm?: boolean }): Promise<EmergencyEvent> => {
    const response = await apiClient.post(`/api/operations/emergency-events/${id}/resolve/`, data);
    return response.data;
};

// Supervisor Inspections
export const getSupervisorInspections = async (params?: { site?: string; status?: string }): Promise<SupervisorInspection[]> => {
    const response = await apiClient.get('/api/operations/supervisor-inspections/', { params });
    return response.data.results || (Array.isArray(response.data) ? response.data : []);
};

export const createSupervisorInspection = async (data: Partial<SupervisorInspection>): Promise<SupervisorInspection> => {
    const response = await apiClient.post('/api/operations/supervisor-inspections/', data);
    return response.data;
};

// Operations Escalations
export const getOperationsEscalations = async (params?: { site?: string; status?: string; priority?: string; source_type?: string }): Promise<OperationsEscalation[]> => {
    const response = await apiClient.get('/api/operations/escalations/', { params });
    return response.data.results || (Array.isArray(response.data) ? response.data : []);
};

export const acknowledgeEscalation = async (id: string): Promise<OperationsEscalation> => {
    const response = await apiClient.post(`/api/operations/escalations/${id}/acknowledge/`);
    return response.data;
};

export const resolveEscalation = async (id: string, data: { resolution_notes: string }): Promise<OperationsEscalation> => {
    const response = await apiClient.post(`/api/operations/escalations/${id}/resolve/`, data);
    return response.data;
};

// Incidents Lifecycle
export const transitionIncident = async (id: string, data: {
    status: string;
    resolution?: string;
    immediate_action?: string;
    assigned_to_id?: number | null;
}): Promise<IncidentReport> => {
    const response = await apiClient.post(`/api/operations/incidents/${id}/transition/`, data);
    return response.data;
};

// ============================================================================
// PHASE S-9: REPORTS, DASHBOARDS & ANALYTICS
// ============================================================================

export const getSecurityExecutiveDashboard = async (params?: Record<string, any>): Promise<any> => {
    const response = await apiClient.get('/api/operations/reports/executive-dashboard/', { params });
    return response.data;
};

export const getSecurityProfitabilityReport = async (dimension: string, params?: Record<string, any>): Promise<any> => {
    const response = await apiClient.get('/api/operations/reports/profitability/', {
        params: { dimension, ...params }
    });
    return response.data;
};

export const getSecurityWorkforceReport = async (reportType: string, params?: Record<string, any>): Promise<any> => {
    const response = await apiClient.get('/api/operations/reports/workforce/', {
        params: { report_type: reportType, ...params }
    });
    return response.data;
};

export const getSecurityOperationsReport = async (reportType: string, params?: Record<string, any>): Promise<any> => {
    const response = await apiClient.get('/api/operations/reports/operations/', {
        params: { report_type: reportType, ...params }
    });
    return response.data;
};

export const getSecurityInventoryReport = async (reportType: string, params?: Record<string, any>): Promise<any> => {
    const response = await apiClient.get('/api/operations/reports/inventory/', {
        params: { report_type: reportType, ...params }
    });
    return response.data;
};

export const getSecurityPurchasingReport = async (reportType: string, params?: Record<string, any>): Promise<any> => {
    const response = await apiClient.get('/api/operations/reports/purchasing/', {
        params: { report_type: reportType, ...params }
    });
    return response.data;
};

export const getSecurityFinanceReport = async (reportType: string, params?: Record<string, any>): Promise<any> => {
    const response = await apiClient.get('/api/operations/reports/finance/', {
        params: { report_type: reportType, ...params }
    });
    return response.data;
};

export const getSecurityComplianceReport = async (params?: Record<string, any>): Promise<any> => {
    const response = await apiClient.get('/api/operations/reports/compliance/', { params });
    return response.data;
};

export const getSecurityTrendsReport = async (months?: number): Promise<any> => {
    const response = await apiClient.get('/api/operations/reports/trends/', {
        params: { months: months || 6 }
    });
    return response.data;
};

export const getSecurityDrillDown = async (entityType: string, entityId: string): Promise<any> => {
    const response = await apiClient.get('/api/operations/reports/drill-down/', {
        params: { entity_type: entityType, entity_id: entityId }
    });
    return response.data;
};

export const getSecurityExportCsvUrl = (reportScope: string, reportType?: string, params?: Record<string, any>): string => {
    const query = new URLSearchParams({
        report_scope: reportScope,
        report_type: reportType || '',
        ...(params || {})
    });
    return `/api/operations/reports/export-csv/?${query.toString()}`;
};

// Re-export apiClient for modal components
export { apiClient } from '../../api/client';


