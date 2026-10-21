import { apiClient } from '../../../api/client';
import type {
    Technician,
    AttendanceGridResponse,
    PayrollRecord
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

    // 4. Excel Sample Seed
    async seedSampleData(): Promise<{ status: string; message?: string }> {
        const res = await apiClient.post('/api/industries/mobile/hrm/seed-sample/');
        return res.data;
    }
};
