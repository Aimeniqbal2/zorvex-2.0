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
    ServiceInvoice
} from './types';

// Dashboard
export const getSecurityOperationsSummary = async (): Promise<SecurityOperationsSummary> => {
    const response = await apiClient.get('/api/operations/dashboard/');
    return response.data;
};

// Operational Sites
export const getOperationalSites = async (params?: { page?: number, search?: string }): Promise<PaginatedResponse<OperationalSite>> => {
    const response = await apiClient.get('/api/operations/sites/', { params });
    return response.data;
};

// Service Contracts
export const getServiceContracts = async (params?: { page?: number, search?: string, status?: string }): Promise<PaginatedResponse<ServiceContract>> => {
    const response = await apiClient.get('/api/operations/contracts/', { params });
    return response.data;
};

// Deployments
export const getDeployments = async (params?: { page?: number, search?: string, status?: string }): Promise<PaginatedResponse<Deployment>> => {
    const response = await apiClient.get('/api/operations/deployments/', { params });
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

// Re-export apiClient for modal components
export { apiClient } from '../../api/client';

