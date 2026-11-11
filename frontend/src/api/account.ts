import { apiClient } from './client';

export interface UserEmployeeProfile {
    id: string;
    employee_code: string;
    full_name: string;
    email: string;
    phone: string;
    department_name: string;
    designation_name: string;
    position_name: string;
    branch_name: string;
    hire_date: string | null;
    employment_status: string;
    city: string;
    cnic_number: string;
    current_address: string;
    photograph_url: string | null;
}

export interface UserFullProfile {
    id: string;
    username: string;
    email: string;
    first_name: string;
    last_name: string;
    full_name: string;
    role: string;
    role_display: string;
    company_role_name: string | null;
    company_role_code: string | null;
    access_mode: string;
    access_mode_display: string;
    allowed_modules: string[];
    company_id: string | null;
    company_name: string;
    company_domain: string;
    company_phone: string;
    company_address: string;
    company_tax_id: string;
    company_logo: string | null;
    business_type: string | null;
    is_active: boolean;
    is_staff: boolean;
    is_superuser: boolean;
    date_joined: string | null;
    last_login: string | null;
    employee_profile: UserEmployeeProfile | null;
}

export interface VerifyPasswordResponse {
    valid: boolean;
    message: string;
}

export interface ChangePasswordPayload {
    old_password: string;
    new_password: string;
    confirm_password: string;
}

export interface ChangePasswordResponse {
    success: boolean;
    message: string;
    access: string;
    refresh: string;
}

export async function fetchMyProfile(): Promise<UserFullProfile> {
    const resp = await apiClient.get('/api/accounts/users/me/');
    return resp.data;
}

export async function verifyMyCurrentPassword(oldPassword: string): Promise<VerifyPasswordResponse> {
    const resp = await apiClient.post('/api/accounts/users/verify-password/', {
        old_password: oldPassword,
    });
    return resp.data;
}

export async function changeMyPassword(payload: ChangePasswordPayload): Promise<ChangePasswordResponse> {
    const resp = await apiClient.post('/api/accounts/users/change-password/', payload);
    return resp.data;
}

export function extractAuthApiError(err: any, fallback = 'Request failed. Please try again.'): {
    message: string;
    fieldErrors: Record<string, string>;
} {
    const data = err?.response?.data;
    const fieldErrors: Record<string, string> = {};

    if (data && typeof data === 'object' && !Array.isArray(data)) {
        for (const [k, v] of Object.entries(data)) {
            if (Array.isArray(v) && v.length > 0) {
                fieldErrors[k] = String(v[0]);
            } else if (typeof v === 'string') {
                fieldErrors[k] = v;
            }
        }
        const firstMsg =
            fieldErrors.old_password ||
            fieldErrors.new_password ||
            fieldErrors.confirm_password ||
            fieldErrors.non_field_errors ||
            fieldErrors.detail ||
            fieldErrors.error;
        if (firstMsg) {
            return { message: firstMsg, fieldErrors };
        }
    }

    return {
        message: err?.message || fallback,
        fieldErrors,
    };
}

