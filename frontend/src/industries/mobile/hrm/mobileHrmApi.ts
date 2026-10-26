import { apiClient } from '../../../api/client';
import type {
    Technician,
    AttendanceGridResponse,
    PayrollRecord,
    CompanyPolicy,
    OnboardingCandidate,
    EmployeeLeaveRequest,
    EmployeeExitRequest,
    SelfServiceData
} from './types';

export const mobileHrmApi = {
    // 1. Technicians
    async getTechnicians(params?: { department_type?: string; search?: string }): Promise<Technician[]> {
        const res = await apiClient.get('/api/industries/mobile/hrm/technicians/', { params });
        return res.data?.results || res.data || [];
    },

    async createTechnician(payload: Partial<Technician> & {
        first_name?: string;
        last_name?: string;
        emp_code?: string;
        base_salary_input?: number;
    }): Promise<Technician> {
        const res = await apiClient.post('/api/industries/mobile/hrm/technicians/', payload);
        return res.data;
    },

    async updateTechnician(id: string, payload: Partial<Technician> & {
        first_name?: string;
        last_name?: string;
        emp_code?: string;
        base_salary_input?: number;
    }): Promise<Technician> {
        const res = await apiClient.patch(`/api/industries/mobile/hrm/technicians/${id}/`, payload);
        return res.data;
    },

    async deleteTechnician(id: string): Promise<void> {
        await apiClient.delete(`/api/industries/mobile/hrm/technicians/${id}/`);
    },

    async createPortalUser(id: string, payload: { username: string; password?: string; role?: string }): Promise<any> {
        const res = await apiClient.post(`/api/industries/mobile/hrm/technicians/${id}/create-portal-user/`, payload);
        return res.data;
    },

    async cleanReset(): Promise<{ status: string; message: string }> {
        const res = await apiClient.post('/api/industries/mobile/hrm/technicians/clean-reset/');
        return res.data;
    },

    async uploadDocument(id: string, file: File, name: string, doc_type: string): Promise<{ status: string; message: string; document: any; documents: any[] }> {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('name', name);
        formData.append('doc_type', doc_type);
        const res = await apiClient.post(`/api/industries/mobile/hrm/technicians/${id}/upload-document/`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return res.data;
    },

    async deleteDocument(id: string, doc_id?: string, url?: string): Promise<{ status: string; message: string; documents: any[] }> {
        const res = await apiClient.post(`/api/industries/mobile/hrm/technicians/${id}/delete-document/`, {
            doc_id,
            url
        });
        return res.data;
    },

    async uploadPhoto(id: string, photo: File): Promise<{ status: string; message: string; photo_url: string }> {
        const formData = new FormData();
        formData.append('photo', photo);
        const res = await apiClient.post(`/api/industries/mobile/hrm/technicians/${id}/upload-photo/`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return res.data;
    },

    // 2. Attendance
    async getAttendanceGrid(year: number, month: number, department?: string): Promise<AttendanceGridResponse> {
        const res = await apiClient.get('/api/industries/mobile/hrm/attendance/', {
            params: { year, month, department: department || undefined }
        });
        return res.data;
    },

    async saveAttendanceCell(employee_id: string, year: number, month: number, day: number, code: string): Promise<any> {
        const res = await apiClient.post('/api/industries/mobile/hrm/attendance/save-cell/', {
            employee_id,
            year,
            month,
            day,
            code
        });
        return res.data;
    },

    async batchSaveAttendance(year: number, month: number, updates: any[]): Promise<any> {
        const res = await apiClient.post('/api/industries/mobile/hrm/attendance/batch-save/', {
            year,
            month,
            updates
        });
        return res.data;
    },

    // 3. Payroll
    async getPayrollOverview(year: number, month: number): Promise<{ year: number; month: number; records: PayrollRecord[] }> {
        const res = await apiClient.get('/api/industries/mobile/hrm/payroll/', {
            params: { year, month }
        });
        return res.data;
    },

    async calculatePayroll(payload: {
        employee_id: string;
        year: number;
        month: number;
        basic_salary?: number;
        loan_principal?: number;
        loan_deduction?: number;
        damaged_parts?: number;
        bill_deduction?: number;
        overtime_hours?: number;
    }): Promise<any> {
        const res = await apiClient.post('/api/industries/mobile/hrm/payroll/calculate/', payload);
        return res.data;
    },

    async savePayrollRecord(payload: {
        employee_id: string;
        year: number;
        month: number;
        basic_salary?: number;
        loan_principal?: number;
        loan_deduction?: number;
        damaged_parts?: number;
        bill_deduction?: number;
        overtime_hours?: number;
        status?: string;
        notes?: string;
    }): Promise<PayrollRecord> {
        const res = await apiClient.post('/api/industries/mobile/hrm/payroll/save-record/', payload);
        return res.data;
    },

    async downloadPayslipPdf(employee_id: string, year: number, month: number): Promise<Blob> {
        const res = await apiClient.get('/api/industries/mobile/hrm/payroll/payslip-pdf/', {
            params: { employee_id, year, month },
            responseType: 'blob'
        });
        return res.data;
    },

    // 4. Company Policies
    async getActivePolicy(): Promise<CompanyPolicy> {
        const res = await apiClient.get('/api/industries/mobile/hrm/policies/active/');
        return res.data;
    },

    async saveActivePolicy(payload: { title: string; content: string; version?: string }): Promise<CompanyPolicy> {
        const res = await apiClient.post('/api/industries/mobile/hrm/policies/active/', payload);
        return res.data;
    },

    // 5. Hiring & Onboarding Candidates
    async getCandidates(params?: { search?: string }): Promise<OnboardingCandidate[]> {
        const res = await apiClient.get('/api/industries/mobile/hrm/candidates/', { params });
        return res.data?.results || res.data || [];
    },

    async createCandidate(payload: Partial<OnboardingCandidate>): Promise<OnboardingCandidate> {
        const res = await apiClient.post('/api/industries/mobile/hrm/candidates/', payload);
        return res.data;
    },

    async updateCandidate(id: string, payload: Partial<OnboardingCandidate>): Promise<OnboardingCandidate> {
        const res = await apiClient.patch(`/api/industries/mobile/hrm/candidates/${id}/`, payload);
        return res.data;
    },

    async deleteCandidate(id: string): Promise<void> {
        await apiClient.delete(`/api/industries/mobile/hrm/candidates/${id}/`);
    },

    async convertCandidateToEmployee(id: string): Promise<any> {
        const res = await apiClient.post(`/api/industries/mobile/hrm/candidates/${id}/convert-to-employee/`);
        return res.data;
    },

    async downloadAppointmentLetterPdf(id: string): Promise<Blob> {
        const res = await apiClient.get(`/api/industries/mobile/hrm/candidates/${id}/download-appointment-letter/`, {
            responseType: 'blob'
        });
        return res.data;
    },

    // 6. Leave Requests
    async getLeaveRequests(): Promise<EmployeeLeaveRequest[]> {
        const res = await apiClient.get('/api/industries/mobile/hrm/leave-requests/');
        return res.data?.results || res.data || [];
    },

    async createLeaveRequest(payload: {
        employee: string;
        leave_type: string;
        request_date: string;
        advance_notice_days?: number;
        reason: string;
    }): Promise<EmployeeLeaveRequest> {
        const res = await apiClient.post('/api/industries/mobile/hrm/leave-requests/', payload);
        return res.data;
    },

    async approveLeaveRequest(id: string, admin_notes?: string): Promise<EmployeeLeaveRequest> {
        const res = await apiClient.post(`/api/industries/mobile/hrm/leave-requests/${id}/approve/`, { admin_notes });
        return res.data;
    },

    async rejectLeaveRequest(id: string, admin_notes?: string): Promise<EmployeeLeaveRequest> {
        const res = await apiClient.post(`/api/industries/mobile/hrm/leave-requests/${id}/reject/`, { admin_notes });
        return res.data;
    },

    // 7. Exit Requests
    async getExitRequests(): Promise<EmployeeExitRequest[]> {
        const res = await apiClient.get('/api/industries/mobile/hrm/exit-requests/');
        return res.data?.results || res.data || [];
    },

    async createExitRequest(payload: {
        employee: string;
        resignation_date: string;
        last_working_day: string;
        reason: string;
    }): Promise<EmployeeExitRequest> {
        const res = await apiClient.post('/api/industries/mobile/hrm/exit-requests/', payload);
        return res.data;
    },

    async updateExitClearance(id: string, payload: {
        handover_completed?: boolean;
        devices_returned?: boolean;
        clearance_status?: string;
        admin_remarks?: string;
    }): Promise<EmployeeExitRequest> {
        const res = await apiClient.post(`/api/industries/mobile/hrm/exit-requests/${id}/update-clearance/`, payload);
        return res.data;
    },

    // 8. Self-Service Portal Data
    async getSelfServiceData(params?: { employee_id?: string; year?: number; month?: number } | string): Promise<SelfServiceData> {
        let queryParams: any = undefined;
        if (typeof params === 'string') {
            queryParams = { employee_id: params };
        } else if (params) {
            queryParams = params;
        }
        const res = await apiClient.get('/api/industries/mobile/hrm/self-service/', {
            params: queryParams
        });
        return res.data;
    },

    // 9. Excel Sample Seed
    async seedSampleData(): Promise<{ status: string; message?: string }> {
        const res = await apiClient.post('/api/industries/mobile/hrm/seed-sample/');
        return res.data;
    }
};
